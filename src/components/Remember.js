// src/components/Remember.js
import React, { useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';

const SERVER = 'http://localhost:4123';
const DESCRIPTORS_URL = `${SERVER}/known/descriptors.json`;
const EVENTS_URL = `${SERVER}/known/events`;

export default function Remember({
  latestUserMessage,
  latestUserMessageId,
  onTrigger,
  onMatcherReady,
  threshold = 0.8,
}) {
  const lastHandledIdRef = useRef(null);
  const loadingRef = useRef(false);
  const signatureRef = useRef('');
  const warned404Ref = useRef(false);

  /** 이름 인식 트리거 */
  useEffect(() => {
    if (!latestUserMessageId) return;
    if (lastHandledIdRef.current === latestUserMessageId) return;
    if (!latestUserMessage) return;

    const name = extractName(latestUserMessage);
    if (!name) return;

    lastHandledIdRef.current = latestUserMessageId;
    onTrigger?.({ id: latestUserMessageId, name, count: 1 });
  }, [latestUserMessageId, latestUserMessage, onTrigger]);

  /** FaceMatcher 자동 갱신 (SSE 기반) */
  useEffect(() => {
    let es;

    const loop = async () => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      try {
        const r = await fetch(DESCRIPTORS_URL, { cache: 'no-cache' });
        if (r.status === 404) {
          if (!warned404Ref.current) {
            console.warn('[Remember] descriptors.json not found — waiting for first capture...');
            warned404Ref.current = true;
          }
          return;
        }
        if (!r.ok) throw new Error(`fetch descriptors ${r.status}`);

        const json = await r.json();
        if (!Array.isArray(json) || json.length === 0) return;

        const sig = json.map(d => `${d.label}:${d.descriptors?.length || 0}`).join('|');
        if (sig === signatureRef.current) return;

        const labeled = json.map(({ label, descriptors }) => {
          const list = (descriptors || []).map(arr => new Float32Array(arr));
          return new faceapi.LabeledFaceDescriptors(label, list);
        });

        if (labeled.length === 0) return;

        const matcher = new faceapi.FaceMatcher(labeled, threshold);
        console.log('[Remember] ✅ matcher updated:', matcher.labeledDescriptors.map(d => d.label));
        onMatcherReady?.(matcher);
        signatureRef.current = sig;
        warned404Ref.current = false;
      } catch (e) {
        if (!warned404Ref.current) {
          console.warn('[Remember] load descriptors error:', e.message);
          warned404Ref.current = true;
        }
      } finally {
        loadingRef.current = false;
      }
    };

    // 최초 로드
    loop();

    // ✅ SSE 구독 (파일 변경 시 자동 갱신)
    try {
      es = new EventSource(EVENTS_URL);
      es.addEventListener('descriptors-change', () => {
        console.log('[Remember] 🔁 descriptors.json 변경 감지 — matcher 갱신 중...');
        loop();
      });
      es.onerror = () => console.warn('[Remember] SSE 연결 끊김');
    } catch (err) {
      console.warn('[Remember] SSE 연결 실패:', err);
    }

    return () => {
      if (es) es.close();
    };
  }, [onMatcherReady, threshold]);

  return null;
}

/** 텍스트에서 이름만 추출 (질문형 문장 완전 차단 + 후방 검사 추가) */
function extractName(text) {
  const raw = (text || '').replace(/\s+/g, ' ').trim();

  // ❌ 1차 필터: 질문형 문장 전체 무시
  if (
    /이름[이가]?\s*(뭐|무엇|뭔|누구)(야|니|예요|인가요|인지|인지 알아|인지요|인가|인거야|라고)?/i.test(raw) ||
    /(이름\s*(알아|기억|뭐|누구|물어|찾아))/i.test(raw)
  ) {
    console.log('[Remember] 이름 질문 감지 — 저장 안 함:', raw);
    return null;
  }

  // ✅ 2차 정규식 매칭 ("내 이름은 ..." / "제 이름은 ...")
  const m =
    raw.match(
      /(?:^|\s)(내\s*이름은|제\s*이름은)\s*([^\s"']+)\s*(?:입니다|이에요|예요|이야|야)?\s*$/i
    ) ||
    raw.match(
      /^(?:내\s*이름은|제\s*이름은)\s*["']?(.+?)["']?\s*(?:입니다|이에요|예요|이야|야)?\s*$/i
    );

  if (!m) return null;

  let name = (m[2] || m[1] || '').trim();

  // ✅ "내 이름은"만 있는 경우 뒤 단어 추출
  if (/^내\s*이름은$|^제\s*이름은$/i.test(name)) {
    const tail = raw.replace(/.*?(?:내\s*이름은|제\s*이름은)\s*/i, '').trim();
    name = tail.split(/\s+/)[0] || '';
  }

  // ❌ 3차 필터: "뭐야", "무엇", "누구", "뭔지", "몰라" 등으로 끝나면 제외
  if (/^(뭐|무엇|누구|뭔지|모름|몰라|모르|뭐야|뭔데|무언가)/i.test(name)) {
    console.log('[Remember] 이름 질문형 후처리 감지 — 저장 안 함:', raw);
    return null;
  }

  // ✅ 클린업
  name = name.replace(/^["']|["']$/g, '').trim();
  name = name.replace(/(입니다|이에요|예요|이야|야)$/i, '').trim();
  name = name.replace(/[^\p{L}\p{N}_-]/gu, '').trim();

  // ✅ 너무 짧은 이름 필터링
  if (!name || name.length < 2) return null;

  return name;
}