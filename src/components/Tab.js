// components/Tab.js
import React, { useEffect, useRef } from "react";

// ✅ 이제 사용할 영상은 4개만
import neutralNormal from "../assets/neutral-normal.mp4";
import neutralSpeak from "../assets/neutral-speak.mp4";
import happyNormal from "../assets/happy-normal.mp4";
import happySpeak from "../assets/happy-speak.mp4";

let playerWin = null;
let preloadSent = false;

function normalizeEmotion(e) {
  if (!e) return "neutral";
  const s = String(e).toLowerCase().trim();

  // 기쁨 / 긍정 → happiness
  if (["happiness", "happy", "기쁨", "긍정"].includes(s)) return "happiness";
  // 나머지는 전부 neutral 취급
  if (["neutral", "중립"].includes(s)) return "neutral";
  if (["sadness", "sad", "슬픔", "부정"].includes(s)) return "neutral";
  if (["surprise", "surprised", "놀람"].includes(s)) return "neutral";
  if (["anger", "angry", "화남", "분노"].includes(s)) return "neutral";
  return "neutral";
}

// 🔑 규칙:
// - isPlaying === true  : 말하는 클립(speak)
//   - 감정이 기쁨(happiness)이면 happySpeak
//   - 그 외에는 neutralSpeak
// - isPlaying === false : 기본 표정(normal)
//   - 감정이 기쁨이면 happyNormal
//   - 그 외에는 neutralNormal
function pickVideoByRule(emotion, isPlaying) {
  const e = normalizeEmotion(emotion);

  if (isPlaying) {
    if (e === "happiness") return happySpeak;
    return neutralSpeak;
  } else {
    if (e === "happiness") return happyNormal;
    return neutralNormal;
  }
}

function toAbsolute(maybeRelative) {
  try {
    return new URL(maybeRelative, window.location.origin).href;
  } catch {
    return maybeRelative;
  }
}

function buildPlayerHTML() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Player</title>
  <style>
    html,body { margin:0; height:100%; background:#000; }
    .stage { position:relative; width:100vw; height:100vh; overflow:hidden; background:#000; }
    video {
      position:absolute; inset:0;
      width:100%; height:100%;
      object-fit:contain; background:#000;
      -webkit-touch-callout:none;
      -webkit-user-select:none;
      user-select:none;
    }
    video::-webkit-media-controls { display:none !important; }
    video::-webkit-media-controls-enclosure { display:none !important; }
    video::-webkit-media-controls-panel { display:none !important; }
    video::-webkit-media-controls-play-button { display:none !important; }
    video::-webkit-media-controls-start-playback-button { display:none !important; }

    .hidden { opacity:0; pointer-events:none; }
    .fade { transition: opacity 220ms ease; }

    .tap-helper {
      position:absolute; inset:0; display:none;
      align-items:center; justify-content:center;
      color:#fff; font-family:system-ui; background:transparent;
    }
    .tap-helper.show { display:flex; }
  </style>
</head>
<body>
  <div class="stage" id="stage">
    <video id="vFront" class="fade" autoplay muted playsinline preload="auto" loop></video>
    <video id="vBack"  class="fade hidden" autoplay muted playsinline preload="auto" loop></video>
    <div id="tap" class="tap-helper">화면을 한번 탭하면 재생돼요 ▶</div>
  </div>
  <script>
    try { window.opener = null; } catch(e) {}

    const vFront = document.getElementById('vFront');
    const vBack  = document.getElementById('vBack');
    const tap    = document.getElementById('tap');
    const cache = new Map();

    let showingFront = true;
    const HAS_RVFC = typeof vBack.requestVideoFrameCallback === 'function';

    function prime(src) {
      if (cache.has(src)) return cache.get(src);
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.loop = true;
      v.src = src;
      try { v.load(); } catch(_) {}
      cache.set(src, v);
      return v;
    }

    async function ensurePlaying() {
      const targets = [vFront, vBack];
      for (const v of targets) {
        try {
          if (v.paused) {
            const p = v.play();
            if (p && p.catch) await p.catch(()=>{});
          }
        } catch (_) {}
      }
    }

    document.getElementById('stage').addEventListener('pointerdown', async () => {
      tap.classList.remove('show');
      await ensurePlaying();
    });

    async function swapTo(src) {
      prime(src);

      const shown    = showingFront ? vFront : vBack;
      const hiddenEl = showingFront ? vBack  : vFront;

      if (hiddenEl.src !== src) hiddenEl.src = src;

      const ready = new Promise((resolve) => {
        const done = () => resolve();
        const onCanPlay = () => { hiddenEl.removeEventListener('canplay', onCanPlay); done(); };
        hiddenEl.addEventListener('canplay', onCanPlay, { once:true });
        if (hiddenEl.readyState >= 3) { hiddenEl.removeEventListener('canplay', onCanPlay); done(); }
      });
      await ready;

      if (HAS_RVFC) {
        await new Promise((r) => hiddenEl.requestVideoFrameCallback(() => r()));
      }

      try {
        const p = hiddenEl.play();
        if (p && p.catch) await p.catch(()=>{ tap.classList.add('show'); });
      } catch { tap.classList.add('show'); }

      hiddenEl.classList.remove('hidden');
      shown.classList.add('hidden');
      showingFront = !showingFront;
    }

    window.addEventListener('message', (ev) => {
      const data = ev.data || {};
      if (data.type === 'PRELOAD' && Array.isArray(data.list)) {
        data.list.forEach(src => prime(src));
      }
      if (data.type === 'SET_SRC' && typeof data.src === 'string') {
        swapTo(data.src);
      }
    });
  </script>
</body>
</html>`;
}

function ensurePlayer() {
  if (playerWin && !playerWin.closed) return playerWin;

  playerWin = window.open("about:blank", "_blank", "");
  if (!playerWin) {
    alert("팝업이 차단된 것 같아요. 이 사이트의 팝업을 허용한 뒤 다시 시도해주세요.");
    return null;
  }
  const html = buildPlayerHTML();
  playerWin.document.open();
  playerWin.document.write(html);
  playerWin.document.close();
  try {
    playerWin.focus?.();
  } catch {}
  return playerWin;
}

function sendVideoToPlayer(src) {
  const win = ensurePlayer();
  if (!win) return false;
  const abs = toAbsolute(src);
  win.postMessage({ type: "SET_SRC", src: abs }, "*");
  return true;
}

export default function Tab({
  emotion,
  isPlaying = false,
  auto = true,
  openOnMount = true,
  showButton = false,
  label = "상태 기반 영상 재생/교체",
  style,
  videoSrc,
  url,
  secondUrl,
}) {
  const lastSentRef = useRef(null);

  useEffect(() => {
    if (!openOnMount) return;
    ensurePlayer();
  }, [openOnMount]);

  // ✅ 프리로드도 4개만
  useEffect(() => {
    const win = ensurePlayer();
    if (!win || preloadSent) return;
    const list = [
      toAbsolute(neutralNormal),
      toAbsolute(neutralSpeak),
      toAbsolute(happyNormal),
      toAbsolute(happySpeak),
    ];
    win.postMessage({ type: "PRELOAD", list }, "*");
    preloadSent = true;
  }, []);

  // 자동 상태 변화에 따라 영상 선택
  useEffect(() => {
    if (!auto) return;

    const selected =
      videoSrc || (!url ? pickVideoByRule(emotion, isPlaying) : null);
    if (!selected) return;

    const abs = toAbsolute(selected);
    if (lastSentRef.current === abs) return;

    const ok = sendVideoToPlayer(abs);
    if (ok) lastSentRef.current = abs;

    if (secondUrl)
      window.open(secondUrl, "_blank", "noopener,noreferrer");
  }, [auto, emotion, isPlaying, videoSrc, url, secondUrl]);

  const handleClick = () => {
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      if (secondUrl)
        window.open(secondUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const selected = videoSrc || pickVideoByRule(emotion, isPlaying);
    if (!selected) return;
    sendVideoToPlayer(selected);
    if (secondUrl)
      window.open(secondUrl, "_blank", "noopener,noreferrer");
  };

  if (!showButton) return null;

  return (
    <button
      onClick={handleClick}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: 0,
        fontWeight: 700,
        cursor: "pointer",
        background: "#111",
        color: "#fff",
        ...style,
      }}
    >
      {label}
    </button>
  );
}
