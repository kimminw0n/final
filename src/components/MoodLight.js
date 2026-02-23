// src/components/MoodLight.js
import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";

// 감정 → 색상 매핑 (프론트 UI 프리뷰용)
const EMOTION_COLOR_MAP = {
  happy: { r: 255, g: 210, b: 80 },
  joyful: { r: 255, g: 210, b: 80 },
  surprised: { r: 255, g: 255, b: 255 },
  neutral: { r: 180, g: 180, b: 255 },
  sad: { r: 80, g: 120, b: 255 },
  angry: { r: 255, g: 80, b: 80 },
  fear: { r: 255, g: 140, b: 220 },
  disgust: { r: 120, g: 255, b: 160 },
};

// 기본 색 (연한 하늘색)
const DEFAULT_COLOR = { r: 150, g: 180, b: 255 };

// 감정 문자열 정규화 (프론트 내부용)
function normalizeEmotion(rawEmotion) {
  if (!rawEmotion) return "neutral";
  const s = String(rawEmotion).toLowerCase();

  if (
    s.includes("행복") ||
    s.includes("기쁨") ||
    s.includes("기분 좋") ||
    s.includes("happy") ||
    s.includes("joy")
  )
    return "happy";

  if (s.includes("슬픔") || s.includes("우울") || s.includes("sad"))
    return "sad";

  if (s.includes("분노") || s.includes("화") || s.includes("angry"))
    return "angry";

  if (s.includes("놀람") || s.includes("surprise")) return "surprised";

  if (s.includes("두려") || s.includes("공포") || s.includes("fear"))
    return "fear";

  if (s.includes("역겨") || s.includes("disgust")) return "disgust";

  if (s.includes("중립") || s.includes("neutral")) return "neutral";

  return "neutral";
}

// 아두이노 setChatByMood가 기대하는 키로 변환
// (happy, neutral, sad, angry, fear, surprise, disgust)
function toArduinoMoodKey(rawEmotion) {
  const key = normalizeEmotion(rawEmotion);
  switch (key) {
    case "happy":
      return "happy";
    case "sad":
      return "sad";
    case "angry":
      return "angry";
    case "fear":
      return "fear";
    case "surprised":
      return "surprise"; // 아두이노는 "surprise"
    case "disgust":
      return "disgust";
    default:
      return "neutral";
  }
}

// 감정 → RGB (프론트 색상 프리뷰용)
function emotionToColor(emotion) {
  const key = normalizeEmotion(emotion);
  return EMOTION_COLOR_MAP[key] || DEFAULT_COLOR;
}

// 단순 색 명령 파서 (빨간색/파란색/끄기/켜기 등)
function parseColorCommand(text) {
  if (!text) return null;
  const s = String(text).toLowerCase();

  // 끄기
  if (s.includes("끄") || s.includes("off")) {
    return { mode: "off" };
  }

  // 켜기 (기본 색)
  if (s.includes("켜") || s.includes("on")) {
    return { mode: "on", color: DEFAULT_COLOR };
  }

  // 색 이름
  if (s.includes("빨간") || s.includes("red")) {
    return { mode: "color", color: { r: 255, g: 80, b: 80 } };
  }
  if (s.includes("파란") || s.includes("블루") || s.includes("blue")) {
    return { mode: "color", color: { r: 80, g: 120, b: 255 } };
  }
  if (s.includes("초록") || s.includes("green")) {
    return { mode: "color", color: { r: 80, g: 255, b: 140 } };
  }
  if (s.includes("보라") || s.includes("purple") || s.includes("violet")) {
    return { mode: "color", color: { r: 200, g: 120, b: 255 } };
  }
  if (s.includes("노랑") || s.includes("yellow")) {
    return { mode: "color", color: { r: 255, g: 220, b: 120 } };
  }

  return null;
}

// ★ forwardRef 래핑
const MoodLight = forwardRef(function MoodLight(props, ref) {
  const {
    faceEmotion,
    textEmotion,
    commandText,
    commandId,
    numLeds = 12,
    wsUrl = "ws://localhost:3001/ws-led", // LED 브리지 포트
  } = props;

  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [currentColor, setCurrentColor] = useState(DEFAULT_COLOR);
  const lastEmotionRef = useRef(null);
  const lastCommandIdRef = useRef(null);

  // ── WebSocket 연결/해제 ──────────────────────
  const connect = () => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      console.log("[WS led] already connected");
      return;
    }
    console.log("[WS led] trying to connect:", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS led] connected");
      setConnected(true);
      // 연결 직후 현재 색 한 번 내려줌
      sendColor(currentColor);
    };

    ws.onclose = (e) => {
      console.log("[WS led] disconnected:", e.code, e.reason);
      setConnected(false);
      wsRef.current = null;
    };

    ws.onerror = (e) => {
      console.error("[WS led] error:", e);
    };

    ws.onmessage = (e) => {
      console.log("[WS led] <-", e.data);
    };
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  const isConnected = () =>
    !!(wsRef.current && wsRef.current.readyState === 1);

  useImperativeHandle(ref, () => ({ connect, disconnect, isConnected }));

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // ── WS로 전송 함수들 ─────────────────────────
  const sendRaw = (payload) => {
    if (!wsRef.current || wsRef.current.readyState !== 1) {
      console.warn("[WS led] not connected, skip send", payload);
      return;
    }
    if (typeof payload === "string") {
      wsRef.current.send(payload);
    } else {
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  // RGB 배열로 전송: {"rgb":[R,G,B]}
  const sendColor = (color) => {
    if (!color) return;
    const payload = {
      rgb: [color.r, color.g, color.b],
    };
    sendRaw(payload);
  };

  // 무드(라벨)로 전송: {"chat_mood":"happy"}
  const sendMoodLabel = (emotion) => {
    const moodKey = toArduinoMoodKey(emotion);
    const payload = { chat_mood: moodKey };
    sendRaw(payload);
  };

  // 완전 끄기용 (색 0,0,0)
  const sendOff = () => {
    const payload = { rgb: [0, 0, 0] };
    sendRaw(payload);
  };

  // ── 모드/밝기/전원 관련 고급 명령 파서 ─────────────
  const handleLightingCommand = (text) => {
    if (!text) return false;

    const s = String(text).toLowerCase();
    const noSpace = s.replace(/\s+/g, "");

    // 0) JSON 모드 전환 명령 (프론트에서 직접 호출하고 싶을 때)
    if (noSpace.includes("emotion모드") || noSpace.includes("감정모드")) {
      console.log("[LED CMD] MODE: EMOTION (JSON)");
      sendRaw({ light_mode: "emotion" });
      return true;
    }
    if (noSpace.includes("개선모드")) {
      console.log("[LED CMD] MODE: IMPROVE (JSON)");
      sendRaw({ light_mode: "improve" });
      return true;
    }

    // 1) 조명 백색모드 / 백색모드
    if (noSpace.includes("조명백색모드") || noSpace.includes("백색모드")) {
      console.log("[LED CMD] 백색모드");
      // 한글 명령 + JSON 둘 다
      sendRaw("조명 백색모드");
      sendRaw({ light_mode: "white" });
      setCurrentColor({ r: 255, g: 255, b: 255 });
      return true;
    }

    // 2) 조명 황색모드 / 황색모드
    if (
      noSpace.includes("조명황색모드") ||
      noSpace.includes("황색모드") ||
      noSpace.includes("노란색모드")
    ) {
      console.log("[LED CMD] 황색모드");
      sendRaw("조명 황색모드");
      sendRaw({ light_mode: "warm" });
      setCurrentColor({ r: 255, g: 160, b: 60 });
      return true;
    }

    // 3) 밝기 N (0~10 단계) → JSON {"bright":N}
    if (s.includes("밝기")) {
      const match = s.match(/밝기\s*([0-9]{1,2})/);
      if (match) {
        let level = parseInt(match[1], 10);
        if (Number.isNaN(level)) level = 0;
        if (level < 0) level = 0;
        if (level > 10) level = 10;
        console.log("[LED CMD] brightness(JSON):", level);
        sendRaw({ bright: level }); // 아두이노에서 "bright" 키로 파싱
        return true;
      }
    }

    // 4) 조명 꺼  → 문자열 + JSON power:false 둘 다
    if (noSpace.includes("조명꺼") || noSpace.includes("조명off")) {
      console.log("[LED CMD] light OFF");
      sendRaw("조명 꺼");
      sendRaw({ power: false });
      setCurrentColor({ r: 0, g: 0, b: 0 });
      return true;
    }

    // 5) 조명 켜 → 문자열 + JSON power:true 둘 다
    if (noSpace.includes("조명켜") || noSpace.includes("조명온")) {
      console.log("[LED CMD] light ON");
      sendRaw("조명 켜");
      sendRaw({ power: true });
      return true;
    }

    // 6) 개선모드 / 감정모드 (한글 명령)
    if (noSpace.includes("조명개선모드")) {
      console.log("[LED CMD] MODE: IMPROVE (KOR)");
      sendRaw("조명 개선모드");
      return true;
    }
    if (noSpace.includes("조명감정모드")) {
      console.log("[LED CMD] MODE: EMOTION (KOR)");
      sendRaw("조명 감정모드");
      return true;
    }

    return false;
  };

  // ── 감정 기반 자동 색상/무드 변경 ───────────────────
  useEffect(() => {
    const primaryEmotion = textEmotion || faceEmotion;
    if (!primaryEmotion) return;

    if (lastEmotionRef.current === primaryEmotion) return;
    lastEmotionRef.current = primaryEmotion;

    const color = emotionToColor(primaryEmotion);
    setCurrentColor(color);

    // 아두이노에는 라벨 방식으로 전달 (setChatByMood 사용)
    sendMoodLabel(primaryEmotion);
  }, [faceEmotion, textEmotion]);

  // ── 채팅/음성 명령 처리 ────────────────────────────
  useEffect(() => {
    if (!commandText) return;
    if (commandId && lastCommandIdRef.current === commandId) return;
    if (commandId) lastCommandIdRef.current = commandId;

    // 1) 먼저 "조명 모드/밝기/전원" 고급 명령 처리
    const handled = handleLightingCommand(commandText);
    if (handled) return;

    // 2) 그 외에는 기존 색 명령(red/blue/끄기 등) 처리
    const cmd = parseColorCommand(commandText);
    if (!cmd) return;

    if (cmd.mode === "off") {
      setCurrentColor({ r: 0, g: 0, b: 0 });
      sendOff();
      return;
    }

    if (cmd.mode === "on" || cmd.mode === "color") {
      const color = cmd.color || DEFAULT_COLOR;
      setCurrentColor(color);
      sendColor(color);
    }
  }, [commandText, commandId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── UI ─────────────────────────────────────────
  const previewStyle = {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "1px solid #ccc",
    backgroundColor: `rgb(${currentColor.r}, ${currentColor.g}, ${currentColor.b})`,
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <button type="button" onClick={connect} disabled={connected}>
        M 브리지 연결
      </button>
      <button type="button" onClick={disconnect} disabled={!connected}>
        해제
      </button>
      <span style={{ fontSize: 12, color: "#333" }}>
        WS(led): {connected ? "연결됨" : "미연결"}
      </span>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          borderRadius: 12,
          border: "1px solid #ddd",
          background: "#fafafa",
        }}
      >
        <div style={previewStyle} />
        <div style={{ fontSize: 12, color: "#555" }}>
          <div>대화 감정: {String(textEmotion || faceEmotion || "-")}</div>
        </div>
      </div>
    </div>
  );
});

export default MoodLight;
