// TextEmotion.js
import React, { useEffect, useRef } from 'react';
import axios from 'axios';
import { updateChatEmotion } from './Data';

const EMOTION_LABELS = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'];

// 안전 파서: "key: 12.3%" 혹은 "key : 12.3 %" 등 다양한 형식 대응
function parseScoresFromText(text) {
  const result = {};
  const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // 예: "happy: 72.4%" → key="happy" val="72.4"
    const m = line.match(/^([a-zA-Z]+)\s*:\s*([+-]?\d+(?:\.\d+)?)\s*%?/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const raw = parseFloat(m[2]);
    if (EMOTION_LABELS.includes(key) && Number.isFinite(raw)) {
      // 0~100 범위 보정
      result[key] = Math.max(0, Math.min(100, raw));
    }
  }

  // 누락 라벨 0으로 채우기
  for (const k of EMOTION_LABELS) {
    if (!(k in result)) result[k] = 0;
  }
  return result;
}

const TextEmotion = ({ text, setScores, setLatestAnalyzedScores }) => {
  const lastSentAtRef = useRef(0);
  const lastDominantRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (typeof text === 'string' && text.trim()) {
      analyzeEmotion(text.trim());
    }
    // 언마운트 시 요청 취소
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const analyzeEmotion = async (utterance) => {
    const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'undefined') {
      console.warn('⚠️ OpenAI API 키가 유효하지 않습니다.');
      return;
    }

    // 중복 요청 취소 준비
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const prompt = `
다음 문장의 감정을 다음 7가지 범주로 나누어 각각의 확률(%)을 추정해줘. 아래 형식으로만 응답해줘:
neutral: 숫자%
happy: 숫자%
sad: 숫자%
angry: 숫자%
fearful: 숫자%
disgusted: 숫자%
surprised: 숫자%

문장: "${utterance}"`;

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'ft:gpt-4o-2024-08-06:nownim:counsel:BQPmjdyS', // 기존 사용 모델
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          signal: abortRef.current.signal
        }
      );

      const content = response?.data?.choices?.[0]?.message?.content || '';
      const scores = parseScoresFromText(content);

      // 상태 업데이트(로컬 UI/차트)
      setScores?.(scores);
      setLatestAnalyzedScores?.(scores);
      updateChatEmotion?.(scores);

      // dominant 계산
      const [dominant] = Object.entries(scores).reduce(
        (max, curr) => (curr[1] > max[1] ? curr : max),
        ['neutral', 0]
      );

      // 과도/중복 전송 방지: 500ms 내 동일 dominant면 스킵
      const now = Date.now();
      const recentlySent = now - lastSentAtRef.current < 500;
      const sameDominant = lastDominantRef.current === dominant;
      if (!(recentlySent && sameDominant)) {
        // 권장 스키마로 브리지 서버 전송
        await axios.post('http://localhost:5000/save-emotion', {
          type: 'emotion',
          source: 'text',
          dominant,
          values: scores,       // 0~100 (%)
          timestamp: now
        });
        lastSentAtRef.current = now;
        lastDominantRef.current = dominant;
        console.log('📤 텍스트 감정 전송:', { dominant, scores });
      } else {
        console.log('⏭️ 전송 스킵(반복/짧은 간격):', dominant);
      }
    } catch (error) {
      if (axios.isCancel?.(error)) {
        console.warn('요청 취소됨');
        return;
      }
      console.error('❌ 감정 분석 오류:', error.response?.data || error.message);
    }
  };

  return null;
};

export default TextEmotion;