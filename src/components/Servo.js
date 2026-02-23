// src/components/Servo.js
import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";

const TEA_MAP = {
  0: "페퍼민트",
  1: "히비스커스",
  2: "캐모마일",
  3: "라벤더",
};

const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

async function getTeaRecommendation({ emotion }) {
  const safeEmotion = (emotion || "neutral").toString();
  const prompt = `
번호: <0~3>
이유: <설명>

사용자의 감정: "${safeEmotion}"
차 중 하나 선택 후 번호와 이유만 출력하세요.
0=페퍼민트
1=히비스커스
2=캐모마일
3=라벤더
`.trim();

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "";

    // "번호: 1" 형태에서 숫자 추출
    const numMatch = raw.match(/번호\s*[:=]\s*([0-3])/);
    const index = numMatch ? parseInt(numMatch[1], 10) : null;

    const reasonMatch = raw.split(/이유\s*[:=]/)[1];
    const reason = reasonMatch ? reasonMatch.trim() : "";
    return { index, reason };
  } catch (err) {
    console.error(err);
    return null;
  }
}

const Servo = forwardRef(function Servo(
  {
    latestUserMessage,
    latestUserMessageId,
    currentEmotion,
    onTeaSelected,
    wsUrl = "ws://localhost:3002/ws-servo",
    // ★ 기본값: 브리지 연결 버튼 보이게 변경
    showInlineControls = true,
    showTestButtons = true,
  },
  ref
) {
  const wsRef = useRef(null);
  const lastHandledIdRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [selectedTea, setSelectedTea] = useState(null);
  const [teaReason, setTeaReason] = useState("");

  // ── WebSocket 제어 ─────────────────
  const connect = () => {
    if (wsRef.current && wsRef.current.readyState === 1) return;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS servo] connected");
      setConnected(true);
    };

    ws.onclose = () => {
      console.log("[WS servo] disconnected");
      setConnected(false);
      wsRef.current = null;
    };

    ws.onerror = (e) => {
      console.error("[WS servo] error:", e);
    };

    ws.onmessage = (e) => {
      console.log("[WS servo] <-", e.data);
    };
  };

  const disconnect = () => {
    if (wsRef.current) wsRef.current.close();
  };

  const isConnected = () =>
    !!(wsRef.current && wsRef.current.readyState === 1);

  useImperativeHandle(ref, () => ({ connect, disconnect, isConnected }), []);

  useEffect(() => {
    // 컴포넌트 언마운트 시 정리
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const sendServo = (idx) => {
    if (!wsRef.current || wsRef.current.readyState !== 1) {
      console.warn("[WS servo] not connected");
      return;
    }
    wsRef.current.send(`SERVO:${idx}`);
  };

  // ── 채팅 이벤트 처리 ─────────────────────────────
  useEffect(() => {
    if (!latestUserMessage) return;
    if (lastHandledIdRef.current === latestUserMessageId) return;
    lastHandledIdRef.current = latestUserMessageId;

    const msg = String(latestUserMessage).trim();
    const compact = msg.replace(/\s+/g, ""); // 공백 제거 ("0 번"도 허용)

    // 0) 채팅창에 "0", "1", "2", "3", "0번"~"3번" 입력 시 직접 서보 제어
    if (/^[0-3]번?$/.test(compact)) {
      const idx = parseInt(compact[0], 10); // 첫 글자 숫자 사용
      const teaName = TEA_MAP[idx] || `${idx}번`;
      const template = `${idx}번(${teaName}) 티백을 준비하겠습니다.`;

      setSelectedTea(teaName);
      setTeaReason(template);
      onTeaSelected?.(teaName, template);
      sendServo(idx);
      return;
    }

    // 1) 직접 차 이름으로 제어 ("페퍼민트", "히비스커스" 등)
    const direct = Object.entries(TEA_MAP).find(([, name]) =>
      msg.includes(name)
    );
    if (direct) {
      const [idxStr, teaName] = direct;
      const template = `"${teaName}" 차를 준비하겠습니다.`;
      setSelectedTea(teaName);
      setTeaReason(template);
      onTeaSelected?.(teaName, template);
      sendServo(idxStr);
      return;
    }

    // 2) "차 추천", "마실 차", "티백"이 포함되면 GPT로 추천
    if (msg.includes("차 추천") || msg.includes("마실 차") || msg.includes("티백")) {
      (async () => {
        const result = await getTeaRecommendation({ emotion: currentEmotion });
        if (!result) return;
        const { index, reason } = result;
        if (index == null) return;

        const teaName = TEA_MAP[index] || `${index}번`;
        const template = reason || `${teaName}를 추천합니다.`;

        setSelectedTea(teaName);
        setTeaReason(template);
        onTeaSelected?.(teaName, template);
        sendServo(index);
      })();
    }
  }, [latestUserMessage, latestUserMessageId, currentEmotion, onTeaSelected]);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {/* 브리지 연결/해제 버튼 (기본 표시) */}
      {showInlineControls && (
        <>
          <button onClick={connect} disabled={connected}>
            S 브리지 연결
          </button>
          <button onClick={disconnect} disabled={!connected}>
            해제
          </button>
          <span style={{ fontSize: 12, color: "#333" }}>
            WS(servo): {connected ? "연결됨" : "미연결"}
          </span>
        </>
      )}

      {/* 선택된 차 정보 카드 */}
      {selectedTea && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: 14,
            border: "1px solid #ddd",
            background: "#fafafa",
            width: 450,
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: "bold",
              marginBottom: 10,
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            {selectedTea}
          </div>
          <div
            style={{
              fontSize: 15,
              color: "#444",
              lineHeight: "1.45",
              whiteSpace: "normal",
              wordBreak: "keep-all",
            }}
          >
            {teaReason}
          </div>
        </div>
      )}
    </div>
  );
});

export default Servo;
