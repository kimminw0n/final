// src/components/Chatbot.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getFaceEmotionHistory, getChatEmotionHistory } from './Data';
import { fetchRecentChatLogs, saveFollowup } from './DataSave';
import { speakOpenAITTS, onTTSStateChange, isTTSSpeaking } from './tts';

const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

/** 상담 LLM 프롬프트 (날씨 요약 포함, 이모티콘 금지) */
const buildFullPrompt = ({
  history,
  currentUserMessage,
  chatEmotion,
  faceEmotion,
  weatherSummary, // ← 텍스트만 (이모티콘 없음)
  recognizedUser,
}) => {
  const formattedHistory = history
    .map(
      (entry) =>
        `[사용자:${entry.user_message}/챗봇:${entry.bot_response}/감정:${entry.chat_emotion}/표정:${entry.face_emotion}]`
    )
    .join('\n');
  console.log('[DEBUG] formattedHistory:\n', formattedHistory);

  // 날씨 요약은 없으면 '정보 없음'
  const wx = (weatherSummary || '정보 없음')
    .replace(/[^\p{L}\p{N}\s,().:%°/-]/gu, ' ') // 혹시 모를 아이콘/이모티콘 제거
    .replace(/\s+/g, ' ')
    .trim();

  const userName = recognizedUser && recognizedUser !== 'unknown' ? recognizedUser : '사용자';
  return `
사용자와 상담봇 사이의 이전 대화 기록입니다.
${formattedHistory}
대화 기록에서 현재 사용자의 이름(${userName})과 일치되는 기록만 반영하세요.

오늘 광주의 날씨는 "${wx}" 입니다.
현재 사용자의 이름은 ${userName}입니다.
현재 사용자의 표정은 "${faceEmotion}" 이고
대화 감정은 "${chatEmotion}" 이며
현재 사용자의 질문은 "${currentUserMessage}" 입니다.

위의 정보를 바탕으로 현재 사용자의 감정에 맞는 적합한 답변을 2~3문장으로 제공하세요.
이전과 중복된 답변은 피하고, 이모티콘 없이 전문적인 상담사 말투로 답변하세요.
노래재생, 음료추천, 조명조절 기능을 사용할 수 있지만 대화의 핵심이 아닐 경우 불필요하게 언급하지 마세요.
날씨에 대한 정보는 자주 말하지마세요.
위 정보의 내용은 가능한 언급하지 마세요. 사용자의 질문에 집중하여 답변을 생성하세요.

만약 내 이름은 OOO이야 처럼 본인의 이름을 언급하면 "반갑습니다. OOO님" 으로 답변을 시작하고 다른 사람을 만나게 돼서 반가운 느낌으로 이야기해 이게 가장 최우선입니다.

사용자가 정신건강 상담 연락처를 요구하거나 도움을 요청하면 1577-0199 이 번호를 알려주세요.

차를 추천해달라고 요구하면 "차
를 추천해드리겠습니다." 라고 답변하세요
사용자가 인사를 하면 '안녕하세요 2026년 광주 RISE 성과공유회에 오신것을 환영합니다. 저는 상담형 챗봇으로 사용자의 표정과 감정을 분석해 적절한 답변을 제공하고 조명, 음악, 추천 기능등의 서비를 제공할 수 있습니다. 즐거운 하루되세요.'
'죄송하지만, 현재 정보로는 적절한 답변을 찾지 못했습니다.'라고 말하지말고 적합한 답변을 내놓으세요.
사용자가 장치를 조작하면 그에 적절한 답변을 제공하세요."
`.trim();
};

function Chatbot({
  onTtsStart,
  onTtsStop,
  voiceInput,
  chatScores,
  setAnalyzeText,
  setChatScores,
  faceEmotion,
  setLatestFollowupBot,
  setLatestFollowupUser,
  setProcessingTrigger,
  recognizedUser,
}) {
  // UI 상태
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(true);

  // 음성 인식 및 자동 감지 토글
  const [isListening, setIsListening] = useState(false);
  const [isVADEnabled, setIsVADEnabled] = useState(false);

  // ✅ 날씨 요약(프롬프트용: 한글 텍스트만)
  const [wxSummary, setWxSummary] = useState('');

  const chatContainerRef = useRef(null);

  // 동일 문장 연속 처리용 페이로드: { id, text }
  const [processingPayload, setProcessingPayload] = useState(null);

  // TTS 컨트롤러 / 상태 ref
  const ttsCtlRef = useRef(null);
  const isTtsPlayingRef = useRef(false);
  const lastBotUtterRef = useRef('');       // 최근 봇 발화(에코 필터용)
  const lastTtsStartAtRef = useRef(0);      // TTS 시작 시각(ms)

  // Web Speech recognizer refs
  const recognitionRef = useRef(null);
  const autoLoopRef = useRef(false); // 자동 재시작 on/off

  /* ====================== 전송 함수 ====================== */
  const handleSend = useCallback(() => {
    const userMessage = (input || '').trim();
    if (!userMessage) return;

    setMessages((prev) => [...prev, { sender: 'user', text: userMessage }]);

    setLatestFollowupUser(userMessage);
    setAnalyzeText(userMessage);

    const id = Date.now();
    setProcessingPayload({ id, text: userMessage });

    setProcessingTrigger((prev) => prev + 1);

    setInput('');
    ttsCtlRef.current?.cancel();
  }, [input, setAnalyzeText, setLatestFollowupUser, setProcessingTrigger]);

  /* ===================== 간단 에코 필터 ===================== */
  const normalize = (s) =>
    (s || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const shouldIgnoreAsEcho = (transcript) => {
    const now = Date.now();
    if (!isTtsPlayingRef.current) return false;
    if (now - lastTtsStartAtRef.current > 5000) return false;

    const t = normalize(transcript);
    if (t.length < 3) return true;

    const bot = normalize(lastBotUtterRef.current).slice(0, 400);
    if (!bot) return false;

    return bot.includes(t) || t.includes(bot.slice(0, Math.min(bot.length, 40)));
  };

  /* ===================== TTS 상태 브리지 ===================== */
  useEffect(() => {
    const applyState = (state) => {
      if (state === 'start') {
        isTtsPlayingRef.current = true;
        lastTtsStartAtRef.current = Date.now();
        onTtsStart?.();
        // 바지-인: TTS 중에도 인식 유지
      } else {
        isTtsPlayingRef.current = false;
        onTtsStop?.();
        if (isVADEnabled) {
          try { recognitionRef.current?.start(); } catch { }
        }
      }
    };

    applyState(isTTSSpeaking() ? 'start' : 'stop');

    const off = onTTSStateChange(applyState);
    return off;
  }, []);

  /* ===================== 외부 음성 텍스트 유입 시 자동 전송 ===================== */
  useEffect(() => {
    if (voiceInput) {
      setInput(voiceInput);
      setIsVoiceProcessing(true);
    }
  }, [voiceInput]);

  useEffect(() => {
    if (isVoiceProcessing) {
      handleSend();
      setIsVoiceProcessing(false);
    }
  }, [isVoiceProcessing, handleSend]);

  /* ===================== 스크롤 하단 고정 ===================== */
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  /* ===================== 전송 파이프라인 (LLM 호출) ===================== */
  useEffect(() => {
    if (!processingPayload || !processingPayload.id) return;

    const run = async () => {
      const userText = processingPayload.text;

      const history = await fetchRecentChatLogs();
      const chatEmotion = getChatEmotionHistory();
      const faceEmotionLabel = getFaceEmotionHistory();

      const prompt = buildFullPrompt({
        history,
        currentUserMessage: userText,
        chatEmotion,
        faceEmotion: faceEmotionLabel,
        weatherSummary: wxSummary, // ✅ 날씨 반영
        recognizedUser,
      });

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'ft:gpt-4o-2024-08-06:nownim:counsel:BQPmjdyS',
            temperature: 1,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 3600,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ API 응답 오류:', errorText);
          return;
        }

        const data = await response.json();
        const botReply = data.choices[0].message.content;

        setMessages((prev) => [...prev, { sender: 'bot', text: botReply }]);

        // 최근 봇 발화 저장(에코 필터용)
        lastBotUtterRef.current = botReply;

        // 기존 TTS 정리 후 새 TTS 수행
        ttsCtlRef.current?.cancel();
        ttsCtlRef.current = await speakOpenAITTS(botReply);

        setLatestFollowupBot(botReply);
        setChatScores(null);

        await saveFollowup({
          user_name: recognizedUser && recognizedUser !== 'unknown' ? recognizedUser : '사용자',
          user_message: userText,
          bot_response: botReply,
          face_emotion: faceEmotionLabel,
          chat_emotion: chatEmotion,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('❌ GPT 처리 중 오류:', err);
        onTtsStop?.();
      }
    };

    run();
  }, [processingPayload?.id, wxSummary]);

  /* ===================== 키보드 전송 ===================== */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ===================== 수동 1회 음성 인식 ===================== */
  const startListeningOnce = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('브라우저가 음성 인식을 지원하지 않습니다.');
      return;
    }

    const rec = new SR();
    rec.lang = 'ko-KR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onstart = () => setIsListening(true);
    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript && !shouldIgnoreAsEcho(transcript)) {
        if (isTtsPlayingRef.current) ttsCtlRef.current?.cancel();
        setInput(transcript);
        setIsVoiceProcessing(true);
      }
      rec.stop();
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);

    rec.start();
  };

  /* ===================== 자동 음성 감지(루프) ===================== */
  const ensureRecognizer = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('브라우저가 음성 인식을 지원하지 않습니다.');
      return null;
    }
    if (recognitionRef.current) return recognitionRef.current;

    const rec = new SR();
    rec.lang = 'ko-KR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false; // onend에서 재시작

    rec.onstart = () => setIsListening(true);

    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript && !shouldIgnoreAsEcho(transcript)) {
        if (isTtsPlayingRef.current) ttsCtlRef.current?.cancel();
        setInput(transcript);
        setIsVoiceProcessing(true);
      }
    };

    rec.onerror = () => {
      setIsListening(false);
      if (autoLoopRef.current) {
        setTimeout(() => {
          try { rec.start(); } catch { }
        }, 250);
      }
    };

    rec.onend = () => {
      setIsListening(false);
      if (autoLoopRef.current) {
        setTimeout(() => {
          try { rec.start(); } catch { }
        }, 150);
      }
    };

    recognitionRef.current = rec;
    return rec;
  };

  const startAutoVAD = () => {
    const rec = ensureRecognizer();
    if (!rec) return;
    autoLoopRef.current = true;
    try { rec.start(); } catch { }
  };

  const stopAutoVAD = () => {
    autoLoopRef.current = false;
    const rec = recognitionRef.current;
    if (rec) {
      try { rec.abort(); } catch { }
    }
  };

  useEffect(() => {
    if (isVADEnabled) {
      startAutoVAD(); // TTS 중이어도 리슨 유지(바지-인)
    } else {
      stopAutoVAD();
    }
    return () => stopAutoVAD();
  }, [isVADEnabled]);

  /* ===================== TTS 일시정지(=취소) 버튼 ===================== */
  const handlePauseTTS = () => {
    ttsCtlRef.current?.cancel();
  };

  /* ===================== 렌더링 ===================== */
  return (
    <div style={{ width: '800px' }}>

      <button onClick={() => setIsChatVisible((prev) => !prev)}>
        {isChatVisible ? '▲ 채팅 접기' : '▼ 채팅 보기'}
      </button>

      {isChatVisible && (
        <div
          style={{
            width: '100%',
            height: '200px',
            border: '1px solid #ddd',
            padding: '10px',
            overflowY: 'auto',
          }}
          ref={chatContainerRef}
        >
          {messages.map((msg, idx) => (
            <p
              key={idx}
              style={{ textAlign: msg.sender === 'user' ? 'right' : 'left' }}
            >
              <strong>{msg.sender === 'user' ? '사용자' : '상담봇'}:</strong>{' '}
              {msg.text}
            </p>
          ))}
        </div>
      )}

      {/* 입력/컨트롤 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginTop: '10px',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ flex: 1, minWidth: 240, height: '40px' }}
          placeholder="메시지를 입력하세요 (엔터 전송)"
        />
        <button style={{ fontSize: '32px' }} onClick={handleSend}>
          💬
        </button>
        <button onClick={handlePauseTTS} style={{ fontSize: '32px' }}>
          ⏸️
        </button>

        {/* 수동 1회 음성 인식 */}
        <button
          onClick={startListeningOnce}
          disabled={isListening && !isVADEnabled}
          style={{ fontSize: '32px' }}
          title="클릭하여 음성 인식 1회 시작"
        >
          {isListening && !isVADEnabled ? '🛑' : '🎙️'}
        </button>

        {/* 자동 음성 감지 on/off */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={isVADEnabled}
            onChange={(e) => setIsVADEnabled(e.target.checked)}
          />
          자동 음성 감지
        </label>
      </div>
    </div>
  );
}

export default Chatbot;