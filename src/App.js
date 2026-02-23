// src/App.js
import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";

import Chatbot from "./components/Chatbot";
import TextEmotion from "./components/TextEmotion";
import Capture from "./components/Capture";
import FaceChart from "./components/FaceChart";
import TextEmotionChart from "./components/TextEmotionChart";
import MusicRecommender from "./components/MusicRecommender";
import Tab from "./components/Tab";
import MoodLight from "./components/MoodLight";
import Remember from "./components/Remember";
import Servo from "./components/Servo";
import Weather from "./components/Weather";
import UserEmotionSummaryTab from "./components/UserEmotionSummaryTab";

const EMOTION_CONTAINER_STYLE = {
  display: "flex",
  justifyContent: "center",
  marginTop: 10,
};
const CHATBOT_CONTAINER_STYLE = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: 50,
  marginTop: 10,
};

// ✅ 새 탭 자동 오픈이 여러 번 실행되는 것을 막기 위한 모듈 전역 플래그
let summaryTabOpenedOnce = false;

function topLabelFromScores(scores) {
  if (!scores) return null;
  let topKey = null;
  let max = -999;
  for (const [k, v] of Object.entries(scores)) {
    if (v > max) {
      max = v;
      topKey = k;
    }
  }
  return topKey;
}

function normalizeEmotion(s) {
  if (!s) return "neutral";
  s = String(s).toLowerCase();

  if (["neutral", "중립"].includes(s)) return "neutral";
  if (["happy", "기쁨", "positive"].includes(s)) return "happy";
  if (["sad", "슬픔"].includes(s)) return "sad";
  if (["angry", "분노"].includes(s)) return "angry";

  // TextEmotion.js 라벨과 정합
  if (["fearful", "fear", "두려움"].includes(s)) return "fearful";
  if (["disgusted", "혐오"].includes(s)) return "disgusted";
  if (["surprised", "놀람"].includes(s)) return "surprised";

  return "others";
}

/**
 * 메인 앱의 실제 본문 (기존 MainApp 내용)
 * 여기서만 캡처, 챗봇, IoT 등을 모두 렌더링
 */
function MainAppBody() {
  const [analyzeText, setAnalyzeText] = useState("");
  const [chatScores, setChatScores] = useState(null);
  const [latestAnalyzedScores, setLatestAnalyzedScores] = useState(null);

  const [selectedTea, setSelectedTea] = useState(null);
  const [teaReason, setTeaReason] = useState("");

  const [faceEmotion, setFaceEmotion] = useState(null);
  const [voiceInput] = useState("");
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);

  const [latestFollowupBot, setLatestFollowupBot] = useState(null);
  const [latestFollowupUser, setLatestFollowupUser] = useState("");
  const [processingTrigger, setProcessingTrigger] = useState(0);
  const moodRef = useRef(null);

  // messageId: 같은 문장 중복 처리 방지용
  const [messageId, setMessageId] = useState(0);
  useEffect(() => {
    setMessageId((prev) => prev + 1);
  }, [latestFollowupUser, processingTrigger]);

  const currentEmotion = useMemo(() => {
    const t = topLabelFromScores(latestAnalyzedScores);
    const base =
      t || (typeof faceEmotion === "string" ? faceEmotion : "neutral");
    return normalizeEmotion(base);
  }, [latestAnalyzedScores, faceEmotion]);

  /* ---- Face Recognition ---- */
  const [rememberRequest, setRememberRequest] = useState(null);

  const handleRememberTrigger = useCallback(({ id, name }) => {
    setRememberRequest({ id, name, count: 1 });
  }, []);

  const [faceMatcher, setFaceMatcher] = useState(null);
  const [recognized, setRecognized] = useState({
    label: "미등록",
    distance: null,
  });

  const handleMatcherReady = useCallback((m) => setFaceMatcher(m), []);
  const handleRecognized = useCallback((l, d) => {
    setRecognized({ label: l, distance: d });
  }, []);

  // ✅ 메인 화면이 처음 렌더링될 때, 요약 전용 화면을 새 탭으로 한 번 자동 오픈
  useEffect(() => {
    if (summaryTabOpenedOnce) return;

    const url = `${window.location.origin}${window.location.pathname}?view=user-summary`;
    window.open(url, "_blank", "noopener,noreferrer");
    summaryTabOpenedOnce = true;
  }, []);

  return (
    <div>
      {/* 상단 상태 탭 (메타휴먼 플레이어용) */}
      <Tab
        emotion={currentEmotion}
        isPlaying={isTTSPlaying}
        auto
        openOnMount
        showButton={false}
      />

      {/* 얼굴 기억/매처 준비 */}
      <Remember
        latestUserMessage={latestFollowupUser}
        latestUserMessageId={messageId}
        onTrigger={handleRememberTrigger}
        onMatcherReady={handleMatcherReady}
      />

      {/* Webcam + 사용자 라벨 */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 20,
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Capture
          setFaceEmotion={setFaceEmotion}
          triggerCapture={processingTrigger}
          rememberRequest={rememberRequest}
          onRecognized={handleRecognized}
          faceMatcher={faceMatcher}
        />
        <div style={{ marginTop: 8, fontSize: 40 }}>
          사용자: <b>{recognized.label}</b>
        </div>
      </div>

      {/* ===== 브리지 툴바 (LED + SERVO 버튼을 나란히) ===== */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            border: "1px solid #eee",
            padding: "8px 12px",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          {/* MoodLight: LED 브리지 (ws-led) */}
          <MoodLight
            ref={moodRef}
            faceEmotion={faceEmotion}
            textEmotion={currentEmotion}
            commandText={latestFollowupUser}
            commandId={messageId}
            wsUrl="ws://localhost:3001/ws-led"
          />

          {/* Servo: SERVO 브리지 (ws-servo) — 추천 카드가 여기 표시됩니다 */}
          <Servo
            latestUserMessage={latestFollowupUser}
            latestUserMessageId={messageId}
            currentEmotion={currentEmotion}
            onTeaSelected={(name, reason) => {
              setSelectedTea(name);
              setTeaReason(reason);
            }}
            wsUrl="ws://localhost:3002/ws-servo"
          />
        </div>
      </div>

      {/* Emotion Charts */}
      <div style={EMOTION_CONTAINER_STYLE}>
        <FaceChart faceEmotion={faceEmotion} />
        <TextEmotionChart scores={latestAnalyzedScores} />
      </div>

      {/* ===== 날씨 ===== */}
      <div
        style={{
          marginTop: 20,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <Weather />
        </div>
      </div>

      {/* Chatbot + Music */}
      <div style={CHATBOT_CONTAINER_STYLE}>
        <Chatbot
          voiceInput={voiceInput}
          setAnalyzeText={setAnalyzeText}
          chatScores={chatScores}
          setChatScores={setChatScores}
          faceEmotion={faceEmotion}
          setLatestFollowupBot={setLatestFollowupBot}
          setLatestFollowupUser={setLatestFollowupUser}
          setProcessingTrigger={setProcessingTrigger}
          recognizedUser={recognized.label}
          selectedTea={selectedTea}
          onTtsStart={() => setIsTTSPlaying(true)}
          onTtsStop={() => setIsTTSPlaying(false)}
        />
        <MusicRecommender
          latestUserMessage={latestFollowupUser}
          latestUserMessageId={messageId}
        />
      </div>

      {/* 텍스트 감정 분석기 */}
      <TextEmotion
        text={analyzeText}
        setScores={setChatScores}
        setLatestAnalyzedScores={setLatestAnalyzedScores}
        followupBot={latestFollowupBot}
        followupUser={latestFollowupUser}
      />
    </div>
  );
}

/**
 * ✅ 간단 라우터:
 *   - /?view=user-summary  → 요약 전용 페이지
 *   - 그 외                 → 메인 앱(MainAppBody)
 */
function AppRouter() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  if (view === "user-summary") {
    return (
      <div style={{ marginTop: 20 }}>
        <UserEmotionSummaryTab />
      </div>
    );
  }

  return <MainAppBody />;
}

export default AppRouter;