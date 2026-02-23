let faceemotionHistory = [];
let chatemotionHistory = [];

/** 객체가 유효한 감정 스코어인지 확인 */
const isValidScores = (obj) =>
  obj && typeof obj === 'object' && Object.keys(obj).length > 0;

/** 공통: 최댓값 감정 키 추출 (필요 시 후보 집합을 전달) */
const getDominantEmotion = (emotionObj, candidateKeys) => {
  const entries = (candidateKeys ?? Object.keys(emotionObj))
    .filter((k) => typeof emotionObj[k] === 'number')
    .map((k) => [k, emotionObj[k]]);

  if (entries.length === 0) return null;

  return entries.reduce((max, curr) => (curr[1] > max[1] ? curr : max))[0];
};

/** 얼굴용: 중립 제외 규칙 적용 */
const getDominantFaceEmotion = (faceScores) => {
  if (!isValidScores(faceScores)) return null;

  // 중립 이외 감정 중 1% 이상이 있는지 확인
  const hasNonNeutralOver1pct = Object.entries(faceScores).some(
    ([k, v]) => k !== 'neutral' && typeof v === 'number' && v >= 0.01
  );

  if (hasNonNeutralOver1pct) {
    // 중립을 후보에서 제거
    const candidates = Object.keys(faceScores).filter((k) => k !== 'neutral');
    return getDominantEmotion(faceScores, candidates);
  }
  // 그 외에는 전체에서 최대값
  return getDominantEmotion(faceScores);
};

// === 업데이트 함수들 ===

// 표정 감정 히스토리 업데이트 (최근 7개 유지, 중립 제외 규칙 적용)
const updateFaceEmotion = (faceemotionData) => {
  if (!isValidScores(faceemotionData)) return;
  const dominant = getDominantFaceEmotion(faceemotionData);
  if (!dominant) return;
  faceemotionHistory = [...faceemotionHistory, dominant].slice(-7);
};

// 텍스트 감정 히스토리 업데이트 (최근 1개 유지)
const updateChatEmotion = (scores) => {
  if (!isValidScores(scores)) return;
  const dominant = getDominantEmotion(scores);
  if (!dominant) return;
  chatemotionHistory = [...chatemotionHistory, dominant].slice(-1);
};

// 히스토리 getter
const getFaceEmotionHistory = () => [...faceemotionHistory];
const getChatEmotionHistory = () => [...chatemotionHistory];

export {
  updateFaceEmotion,
  updateChatEmotion,
  getChatEmotionHistory,
  getFaceEmotionHistory
};