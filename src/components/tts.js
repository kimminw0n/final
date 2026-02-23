// src/tts.js

// ───────────────── 공통 상태 ─────────────────
let ttsListeners = new Set();
let _isSpeaking = false;

// 공유 Audio / 요청 상태
let _audio = null;
let _currentAbort = null;
let _currentUrl = null;

// ───────────────── 상태 리스너 API ─────────────────
export function onTTSStateChange(cb) {
  ttsListeners.add(cb);
  return () => ttsListeners.delete(cb);
}

function _notify(state /* 'start' | 'stop' */) {
  _isSpeaking = state === "start";
  ttsListeners.forEach((fn) => {
    try {
      fn(state);
    } catch {}
  });
}

export function isTTSSpeaking() {
  return _isSpeaking;
}

// ───────────────── Audio 준비/정리 ─────────────────
function _ensureAudio() {
  if (!_audio) {
    _audio = new Audio();
    _audio.preload = "auto";
    _audio.volume = 1.0;       // 기본 볼륨 1.0
    _audio.playbackRate = 1.0; // 기본 재생속도 1.0 (정상)
  }
  return _audio;
}

function _cleanupCurrent({ keepAudio = true } = {}) {
  if (_currentAbort) {
    try {
      _currentAbort.abort();
    } catch {}
    _currentAbort = null;
  }
  if (_audio) {
    _audio.onplay = null;
    _audio.onended = null;
    _audio.onerror = null;
  }
  if (_currentUrl) {
    try {
      URL.revokeObjectURL(_currentUrl);
    } catch {}
    _currentUrl = null;
  }
  if (_audio && !keepAudio) {
    try {
      _audio.pause();
      _audio.src = "";
      _audio.currentTime = 0;
    } catch {}
  }
}

// ───────────────── 옵션 API (볼륨/속도) ─────────────────
/** 0.0 ~ 1.0 (브라우저 Audio 볼륨) */
export function setTTSVolume(vol = 1.0) {
  const v = Math.max(0, Math.min(1, Number(vol) || 1.0));
  if (_audio) _audio.volume = v;
}

/** 0.5 ~ 2.0, 기본값 1.0 */
export function setTTSPlaybackRate(rate = 1.0) {
  const r = Math.max(0.5, Math.min(2.0, Number(rate) || 1.0));
  if (_audio) _audio.playbackRate = r;
}

// ───────────────── 메인 API: OpenAI TTS 재생 ─────────────────
/**
 * OpenAI gpt-4o-mini-tts로 말하기
 * - text: string
 * - voice: string (예: "alloy", "verse", "sage" 등)
 * - format: "mp3" | "wav" ...
 * 반환: { cancel() }
 */
export async function speakOpenAITTS(
  text,
  voice = "sage",
  format = "mp3"
) {
  const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

  // 직전 재생/요청 정리
  _cleanupCurrent({ keepAudio: true });
  const audio = _ensureAudio();

  // 새로운 요청 준비
  const ac = new AbortController();
  _currentAbort = ac;

  let started = false;
  let ended = false;
  const markStart = () => {
    if (started) return;
    started = true;
    _notify("start");
  };
  const markStop = () => {
    if (ended) return;
    ended = true;
    _notify("stop");
    _cleanupCurrent({ keepAudio: true });
  };

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // 🔥 사용 모델: gpt-4o-mini-tts
        model: "gpt-4o-mini-tts",
        input: text,
        voice,
        response_format: format,
      }),
    });

    if (!response.ok) {
      console.error("❌ OpenAI TTS 응답 오류:", await response.text());
      markStop();
      return { cancel: () => markStop() };
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    _currentUrl = url;

    // 이벤트 연결
    audio.onplay = () => {
      markStart();
    };
    audio.onended = () => {
      markStop();
    };
    audio.onerror = () => {
      markStop();
    };

    // 취소(Abort)도 종료로 처리
    ac.signal.addEventListener(
      "abort",
      () => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {}
        markStop();
      },
      { once: true }
    );

    // 재생: 기본속도 1.0 유지
    audio.src = url;
    audio.playbackRate = 1.0;

    try {
      await audio.play();
    } catch (e) {
      console.warn("🔇 audio.play() 실패:", e);
      markStop();
    }

    return {
      cancel() {
        try {
          ac.abort();
        } catch {}
      },
    };
  } catch (err) {
    console.error("❌ TTS 실행 실패:", err);
    markStop();
    return { cancel: () => markStop() };
  }
}