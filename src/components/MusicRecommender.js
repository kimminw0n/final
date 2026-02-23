// src/components/MusicRecommender.js
import React, { useEffect, useState, useRef } from 'react';
import { getChatEmotionHistory } from './Data';
import { fetchRecentChatLogs } from './DataSave';

function MusicRecommender({ latestUserMessage, latestUserMessageId, formattedHistory }) {
  const [track, setTrack] = useState(null);
  const [reason, setReason] = useState('');
  const [volumeStep, setVolumeStep] = useState(2);
  const audioRef = useRef(null);
  const fadeTimerRef = useRef(null);
  const lastHandledIdRef = useRef(null);

  // 볼륨 단계 (1~5단계)
  const VLEVELS = [0.1, 0.25, 0.5, 0.75, 1];
  const K_NUM = { '일': 1, '하나': 1, '이': 2, '둘': 2, '삼': 3, '셋': 3, '사': 4, '넷': 4, '오': 5, '다섯': 5 };

  const clearFade = () => {
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  };

  const setAudioVolumeByStep = (step) => {
    const audio = audioRef.current;
    if (!audio) return;
    const idx = Math.max(0, Math.min(4, step));
    audio.muted = false;
    audio.volume = VLEVELS[idx];
  };

  const getArtwork600 = (url) =>
    url ? url.replace(/100x100bb(\.(jpg|png|webp))$/i, '600x600bb$1') : '';

  // ✅ iTunes 검색 함수 (limit=5, 랜덤 선택)
  const searchAndSetTrack = async (keyword, fallbackReason = '') => {
    try {
      if (!keyword || !keyword.trim()) return false;
      const searchTerm = keyword.trim();

      const limit = 5;
      const urlKR = `https://itunes.apple.com/search?term=${encodeURIComponent(
        searchTerm
      )}&media=music&limit=${limit}&country=KR`;
      const urlGlobal = `https://itunes.apple.com/search?term=${encodeURIComponent(
        searchTerm
      )}&media=music&limit=${limit}`;

      let itunesData = await fetch(urlKR).then((r) => r.json());
      if (!itunesData.results?.length) {
        itunesData = await fetch(urlGlobal).then((r) => r.json());
      }

      if (itunesData.results?.length > 0) {
        const list = itunesData.results;
        const idx = Math.floor(Math.random() * list.length); // 0~length-1 중 랜덤
        const chosen = list[idx];
        setTrack(chosen);
        if (fallbackReason) setReason(fallbackReason);
        console.log(`🎵 iTunes 검색 성공: ${searchTerm}, idx=${idx}, track="${chosen.trackName}"`);
        return true;
      } else {
        console.warn(`❌ iTunes 결과 없음: ${searchTerm}`);
      }
      return false;
    } catch (e) {
      console.error('iTunes 검색 실패:', e);
      return false;
    }
  };

  const fadeInPlayTo = async (targetVol) => {
    const audio = audioRef.current;
    if (!audio) return;
    clearFade();
    try {
      audio.muted = false;
      audio.volume = Math.min(Math.max(0, audio.volume ?? 0), 1);
      if (audio.paused) {
        const p = audio.play();
        if (p && p.catch) await p.catch(() => {});
      }
      if (audio.volume >= targetVol) {
        audio.volume = targetVol;
        return;
      }
      let v = audio.volume;
      fadeTimerRef.current = setInterval(() => {
        v = Math.min(targetVol, +(v + 0.02).toFixed(3));
        audio.volume = v;
        if (v >= targetVol) clearFade();
      }, 120);
    } catch (e) {
      console.error('자동 재생 실패:', e);
      clearFade();
    }
  };

  // ✅ GPT 문맥 기반 음악 추천
  const interpretAndRecommend = async (query) => {
    try {
      const emotionHistory = getChatEmotionHistory();
      const recentEmotion = emotionHistory.slice(-1)[0] || 'neutral';

      const prompt = `
당신은 음악 큐레이션 전문가입니다.
아래는 사용자와 상담봇의 최근 대화 기록과 감정 요약입니다.

[이전 대화 기록]
${formattedHistory || '(기록 없음)'}

[최근 대화 문장]
"${query}"

[최근 감정]
${recentEmotion}

위 내용을 참고하여 지금 사용자의 기분과 대화 맥락에 어울리는 대중음악 1곡을 추천하세요.
너무 마이너한 곡은 피하고, 널리 알려진 곡을 선호합니다.

반드시 아래 JSON 형식으로 출력하세요.
{
  "title": "곡 제목",
  "artist": "가수",
  "reason": "추천 이유(한 문장, 최대 25자)"
}`.trim();

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.7,
        }),
      });

      const data = await res.json();
      const raw = data?.choices?.[0]?.message?.content?.trim();
      if (!raw) return false;

      let title = '', artist = '', reasonText = '';
      try {
        const j = JSON.parse(raw);
        title = j.title?.toString().trim() || '';
        artist = j.artist?.toString().trim() || '';
        reasonText = j.reason?.toString().trim() || '';
      } catch {
        console.warn('GPT 응답 파싱 실패:', raw);
        return false;
      }

      const ok =
        (await searchAndSetTrack(`${title} ${artist}`, reasonText)) ||
        (await searchAndSetTrack(title, reasonText));

      return ok;
    } catch (e) {
      console.error('GPT 추천 오류:', e);
      return false;
    }
  };

  // ────────────────────────────────────────────────
  // 명령 처리
  // ────────────────────────────────────────────────
  useEffect(() => {
    if (!latestUserMessage || latestUserMessageId == null) return;
    if (lastHandledIdRef.current === latestUserMessageId) return;
    lastHandledIdRef.current = latestUserMessageId;

    const raw = latestUserMessage.trim();
    if (!raw) return;

    // 🎵 “~ 노래 들려줘 / 틀어줘 / 추천해줘 …”
    const customTopicMatch = raw.match(
      /(.+?)\s*(?:노래|음악)(?:\s*를|\s*은|\s*이)?\s*(?:들려\s*줘|들어\s*봐|추천\s*해\s*줘|틀어\s*줘|들려\s*줘요|추천\s*해\s*줘요|틀어\s*줘요)/i
    );

    if (customTopicMatch && customTopicMatch[1]) {
      const topic = customTopicMatch[1].trim();   // 예: "잔잔한"
      const fullSentence = raw;                   // 예: "잔잔한 노래 틀어줘"

      (async () => {
        clearFade();

        // 👉 분위기/형용사 키워드 위주면 곧바로 GPT 추천으로 보냄
        const moodKeywordRegex =
          /(잔잔|조용|차분|집중|공부|로파이|로-fi|lofi|신나는|신나|슬픈|우울|행복|설레|설렘|밤|새벽|비오는|비 오는)/;
        const isMoodOnly =
          moodKeywordRegex.test(topic) ||
          topic.length <= 3; // 너무 짧은 한 단어도 분위기일 가능성이 높음

        if (isMoodOnly) {
          console.log('[Music] mood keyword → GPT interpret:', fullSentence);
          const okAI = await interpretAndRecommend(fullSentence);
          if (okAI) await fadeInPlayTo(VLEVELS[volumeStep]);
          return;
        }

        // 🎯 가수/곡명처럼 구체적인 키워드는 iTunes 직접 검색 우선
        console.log('[Music] direct topic search:', topic);
        const okDirect = await searchAndSetTrack(
          topic,
          `"${topic}" 관련 노래를 재생합니다`
        );
        if (okDirect) {
          await fadeInPlayTo(VLEVELS[volumeStep]);
          return;
        }

        // 그래도 못 찾으면 GPT에게 위임
        console.log(`❌ 직접 검색 실패, GPT 문맥 해석 중: ${topic}`);
        const okAI = await interpretAndRecommend(fullSentence);
        if (okAI) await fadeInPlayTo(VLEVELS[volumeStep]);
      })();

      return;
    }

    // 🎶 “노래 추천 / 노래 골라줘”
    if (/노래\s*(추천|골라줘)$/i.test(raw)) {
      (async () => {
        clearFade();
        const ok = await interpretAndRecommend(raw);
        if (ok) await fadeInPlayTo(VLEVELS[volumeStep]);
      })();
      return;
    }

    // 🔢 “노래 볼륨 1~5단계”
    const matchVol = raw.match(/노래\s*(?:소리|볼륨)\s*(?:크기)?\s*(?:를|을)?\s*([1-5])/);
    if (matchVol) {
      const step = parseInt(matchVol[1], 10) - 1;
      setVolumeStep(step);
      setAudioVolumeByStep(step);
      return;
    }

    // 🔉 볼륨 줄이기
    if (/노래.*(소리\s*줄|볼륨\s*(내려|줄여))/i.test(raw)) {
      setVolumeStep((prev) => {
        const next = Math.max(0, prev - 1);
        setAudioVolumeByStep(next);
        return next;
      });
      return;
    }

    // 🔊 볼륨 키우기
    if (/노래.*(소리\s*키|볼륨\s*(올려|키워))/i.test(raw)) {
      setVolumeStep((prev) => {
        const next = Math.min(4, prev + 1);
        setAudioVolumeByStep(next);
        return next;
      });
      return;
    }

    // ▶ “노래 재생”
    if (/노래\s*(재생|켜)/i.test(raw)) {
      if (audioRef.current) {
        clearFade();
        fadeInPlayTo(VLEVELS[volumeStep]);
      }
      return;
    }

    // ⏸ “노래 중지 / 꺼 / 멈춰”
    if (/노래\s*(멈춰|끄|꺼|중지|중단)/i.test(raw)) {
      clearFade();
      if (audioRef.current) audioRef.current.pause();
      return;
    }
  }, [latestUserMessageId, latestUserMessage, formattedHistory, volumeStep]);

  // 트랙이 새로 바뀌면 현재 볼륨 단계로 페이드 인
  useEffect(() => {
    if (track) fadeInPlayTo(VLEVELS[volumeStep]);
  }, [track]); // eslint-disable-line react-hooks/exhaustive-deps

  // 언마운트 시 페이드 타이머 정리
  useEffect(() => {
    return () => clearFade();
  }, []);

  // ------- UI -------

  const cardStyle = {
    marginTop: 20,
    maxWidth: 560,
    width: '100%',
    padding: 16,
    borderRadius: 16,
    boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
    background: '#fff',
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  };

  const coverStyle = {
    width: 220,
    height: 220,
    borderRadius: 12,
    objectFit: 'cover',
    flexShrink: 0,
    background: '#f5f5f5',
  };

  const titleBox = { flex: 1, minWidth: 0 };
  const titleStyle = { margin: 0, fontSize: 20, fontWeight: 700, lineHeight: 1.2 };
  const artistStyle = { margin: '6px 0 0', fontSize: 15, color: '#555' };
  const reasonStyle = { fontSize: 13, color: '#555', marginTop: 10 };

  return (
    <div>
      {track && (
        <div style={cardStyle}>
          <div style={headerStyle}>
            <img
              src={getArtwork600(track.artworkUrl100)}
              alt="앨범 커버"
              width={220}
              height={220}
              style={coverStyle}
              loading="lazy"
            />
            <div style={titleBox}>
              <h3 style={titleStyle}>{track.trackName}</h3>
              <p style={artistStyle}>{track.artistName}</p>
              {reason && <p style={reasonStyle}>{reason}</p>}
            </div>
          </div>

          <audio
            ref={audioRef}
            controls
            src={track.previewUrl}
            style={{ width: '100%', height: 36, outline: 'none' }}
          />

          <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
            볼륨 단계: {volumeStep + 1} / 5 (현재 {Math.round(VLEVELS[volumeStep] * 100)}%)
          </div>
        </div>
      )}
    </div>
  );
}

export default MusicRecommender;