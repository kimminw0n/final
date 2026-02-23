// src/components/UserEmotionSummaryTab.js
import React, { useState } from "react";
import { fetchChatLogsByUser } from "./DataSave";

// ✅ 파이 차트용 Chart.js
import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

// 이 탭에서 쓸 감정 키
const EMOTION_KEYS = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "fearful",
  "disgusted",
  "surprised",
];

// 한글 라벨 매핑
const EMOTION_LABEL_KO = {
  neutral: "평범함",
  happy: "기쁨",
  sad: "슬픔",
  angry: "화남",
  fearful: "두려움",
  disgusted: "혐오",
  surprised: "놀람",
};

const EMOTION_COLORS = {
  neutral: "rgba(148, 163, 184, 0.9)",
  happy: "rgba(52, 211, 153, 0.9)",
  sad: "rgba(96, 165, 250, 0.9)",
  angry: "rgba(248, 113, 113, 0.9)",
  fearful: "rgba(251, 191, 36, 0.9)",
  disgusted: "rgba(190, 24, 93, 0.9)",
  surprised: "rgba(45, 212, 191, 0.9)",
};

const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

function buildSummaryPrompt(userName, logs) {
  const lines = logs.map((entry) => {
    const t = new Date(entry.timestamp || 0).toLocaleString("ko-KR");
    const chatEm = Array.isArray(entry.chat_emotion)
      ? entry.chat_emotion.join(",")
      : String(entry.chat_emotion || "");
    const faceEm = Array.isArray(entry.face_emotion)
      ? entry.face_emotion.join(",")
      : String(entry.face_emotion || "");

    return `[시간:${t}] 사용자:${entry.user_message} / 상담봇:${entry.bot_response} / 텍스트감정:${chatEm} / 표정감정:${faceEm}`;
  });

  const joined = lines.join("\n");

  return `
당신은 전문 심리상담 요약가입니다.

다음은 "${userName}" 사용자의 최근 상담 기록입니다.
각 줄은 시간, 사용자 발언, 상담봇 응답, 텍스트 감정, 표정 감정 정보로 구성되어 있습니다.

${joined}

위 기록을 바탕으로 다음 내용을 한국어로 4~6문장으로 요약해 주세요.

1. 이 사용자가 최근에 자주 표현하는 감정 경향 (예: 불안, 우울, 피로, 편안함 등)
2. 자주 등장하는 고민/주제 (예: 대인관계, 학업 스트레스, 자존감, 건강 고민 등)
3. 상담봇이 지금까지 제공해온 도움의 방향 (예: 감정 공감, 정보 제공, 행동 제안 등)
4. 앞으로 상담봇이 이 사용자에게 특히 주의해서 살펴주면 좋을 포인트

- 상담 기록에 없는 사실은 추측으로 단정하지 말고, "기록상 ~로 보인다" 수준으로만 표현하세요.
- "이 사용자는" 으로 문장을 시작하는 형식을 사용해 주세요.
- 이모티콘은 사용하지 마세요.
  `.trim();
}

// 로그에서 감정 카운트 집계
function aggregateEmotionCounts(logs) {
  const chatCounts = Object.fromEntries(EMOTION_KEYS.map((k) => [k, 0]));
  const faceCounts = Object.fromEntries(EMOTION_KEYS.map((k) => [k, 0]));

  logs.forEach((entry) => {
    const chat = Array.isArray(entry.chat_emotion)
      ? entry.chat_emotion
      : entry.chat_emotion
        ? [entry.chat_emotion]
        : [];
    const face = Array.isArray(entry.face_emotion)
      ? entry.face_emotion
      : entry.face_emotion
        ? [entry.face_emotion]
        : [];

    chat.forEach((e) => {
      const key = String(e || "").toLowerCase();
      if (key in chatCounts) chatCounts[key] += 1;
    });

    face.forEach((e) => {
      const key = String(e || "").toLowerCase();
      if (key in faceCounts) faceCounts[key] += 1;
    });
  });

  return { chatCounts, faceCounts };
}

// 퍼센트(0~100)로 변환
// 퍼센트(0~100)로 변환
function toPercentScores(counts, keys = EMOTION_KEYS) {
  const total = keys.reduce((acc, k) => acc + (counts[k] || 0), 0) || 1;
  const scores = {};
  for (const k of keys) {
    scores[k] = Math.round(((counts[k] || 0) / total) * 100);
  }
  return scores;
}

// ✅ 파이차트 데이터 생성 함수
function makePieData(scores, title, keys = EMOTION_KEYS) {
  const labels = keys.map((k) => EMOTION_LABEL_KO[k] || k);
  const data = keys.map((k) => scores[k] || 0);
  const bgColors = keys.map((k) => EMOTION_COLORS[k]);

  return {
    labels,
    datasets: [
      {
        label: title,
        data,
        backgroundColor: bgColors,
        borderColor: "rgba(255, 255, 255, 1)",
        borderWidth: 2,
      },
    ],
  };
}

const pieOptions = {
  responsive: true,
  plugins: {
    legend: {
      position: "right",
      labels: {
        font: { size: 16, family: "Noto Sans KR" }, // ⬆ legend 폰트 키움
      },
    },
    tooltip: {
      callbacks: {
        label: (ctx) => {
          const label = ctx.label || "";
          const value = ctx.raw ?? 0;
          return `${label}: ${value}%`;
        },
      },
      titleFont: { size: 18 },
      bodyFont: { size: 16 },
    },
  },
};

export default function UserEmotionSummaryTab() {
  const [userName, setUserName] = useState("");
  const [days, setDays] = useState(1);
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState(null);

  const handleFetch = async () => {
    if (!userName.trim()) {
      alert("사용자 이름을 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    setSummary("");
    try {
      const d = Number(days) || 1;
      const data = await fetchChatLogsByUser({
        userName: userName.trim(),
        hours: d * 24, // ✅ 내부 쿼리는 시간 단위라서 일→시간 변환
        maxCount: 200,
      });
      setLogs(data);
      if (!data.length) {
        setError("해당 기간에 상담 기록이 없습니다.");
      }
    } catch (e) {
      console.error(e);
      setError("데이터를 가져오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSummarize = async () => {
    if (!logs.length) {
      alert("먼저 상담 기록을 불러와 주세요.");
      return;
    }
    if (!OPENAI_API_KEY || OPENAI_API_KEY === "undefined") {
      alert("OpenAI API 키가 설정되어 있지 않습니다.");
      return;
    }
    setSummarizing(true);
    setError(null);

    try {
      const prompt = buildSummaryPrompt(userName.trim(), logs);

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "ft:gpt-4o-2024-08-06:nownim:counsel:BQPmjdyS",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 600,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("GPT error:", txt);
        setError("요약 생성 중 오류가 발생했습니다.");
        setSummarizing(false);
        return;
      }

      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content || "";
      setSummary(content.trim());
    } catch (e) {
      console.error(e);
      setError("요약 생성 중 오류가 발생했습니다.");
    } finally {
      setSummarizing(false);
    }
  };

  const { chatCounts, faceCounts } = aggregateEmotionCounts(logs);

  // 텍스트 감정: 전체 키 사용
  const chatScores = toPercentScores(chatCounts, EMOTION_KEYS);

  // 표정 감정: 전체 키 사용
  const faceScores = toPercentScores(faceCounts, EMOTION_KEYS);

  // 파이차트 데이터
  const textPieData = makePieData(chatScores, "텍스트 감정 분포", EMOTION_KEYS);
  const facePieData = makePieData(faceScores, "표정 감정 분포", EMOTION_KEYS);

  return (
    <div
      style={{
        maxWidth: 1100,            // ⬆ 전체 폭 확장
        margin: "0 auto",
        padding: 24,               // ⬆ 패딩 증가
        borderRadius: 20,          // ⬆ 모서리 살짝 더 둥글게
        background: "#fff",
        boxShadow: "0 10px 35px rgba(0,0,0,0.08)", // ⬆ 약간 더 강한 그림자
        fontFamily: "Noto Sans KR, system-ui, sans-serif",
      }}
    >
      <h2
        style={{
          marginTop: 0,
          marginBottom: 16,
          fontSize: 26,            // ⬆ 타이틀 크게
          fontWeight: 700,
        }}
      >
        사용자 감정 분포 & 상담 요약
      </h2>

      {/* 검색 영역 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,                 // ⬆ 간격 확대
          marginBottom: 20,
          alignItems: "center",
          fontSize: 16,
        }}
      >
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="사용자 이름 (예: 인식된 얼굴 이름)"
          style={{
            flex: 1,
            minWidth: 220,
            padding: 12,           // ⬆ padding
            borderRadius: 10,
            border: "1px solid #ddd",
            fontSize: 16,
          }}
        />
        <input
          type="number"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          min={1}
          max={30}
          style={{
            width: 90,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            fontSize: 16,
          }}
        />
        <span style={{ fontSize: 16 }}>일 이내</span>
        <button
          onClick={handleFetch}
          disabled={loading}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: "#111827",
            color: "#fff",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          {loading ? "불러오는 중..." : "기록 불러오기"}
        </button>
        <button
          onClick={handleSummarize}
          disabled={summarizing || !logs.length}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: "#2563EB",
            color: "#fff",
            cursor: logs.length ? "pointer" : "not-allowed",
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          {summarizing ? "요약 생성 중..." : "상담 내용 요약"}
        </button>
      </div>

      {error && (
        <div
          style={{
            color: "#b91c1c",
            marginBottom: 14,
            fontSize: 16,          // ⬆ 에러 텍스트도 크게
          }}
        >
          {error}
        </div>
      )}

      {/* 감정 분포도 영역 (파이차트) */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 32,                 // ⬆ 차트 간 간격
          marginBottom: 20,
        }}
      >
        <div style={{ width: 480, height: 340 }}>   {/* ⬆ 차트 크기 키움 */}
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            텍스트 감정 분포
          </h3>
          {logs.length ? (
            <Pie data={textPieData} options={pieOptions} />
          ) : (
            <p style={{ fontSize: 15, color: "#666" }}>데이터가 없습니다.</p>
          )}
        </div>
        <div style={{ width: 480, height: 340 }}>
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            표정 감정 분포
          </h3>
          {logs.length ? (
            <Pie data={facePieData} options={pieOptions} />
          ) : (
            <p style={{ fontSize: 15, color: "#666" }}>데이터가 없습니다.</p>
          )}
        </div>
      </div>

      {/* 요약 텍스트 영역 */}
      <div
        style={{
          borderTop: "1px solid #eee",
          paddingTop: 14,
        }}
      >
        <h3
          style={{
            marginTop: 0,
            marginBottom: 10,
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          상담 내용 요약
        </h3>
        {summary ? (
          <div
            style={{
              whiteSpace: "pre-wrap",
              lineHeight: 1.7,
              fontSize: 16,        // ⬆ 본문 폰트 크게
              color: "#222",
              padding: 12,
              borderRadius: 10,
              background: "#f9fafb",
            }}
          >
            {summary}
          </div>
        ) : (
          <p style={{ fontSize: 15, color: "#666" }}>
            상담 기록을 불러온 뒤, &ldquo;상담 내용 요약&rdquo; 버튼을 눌러보세요.
          </p>
        )}
      </div>
    </div>
  );
}