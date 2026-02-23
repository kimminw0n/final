// src/components/DataSave.js
import { db } from '../firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';

/**
 * 최근 30분 대화 로그 (MusicRecommender 등에서 사용)
 */
export const fetchRecentChatLogs = async () => {
  const thirtyMinutesAgo = Date.now() - 1000 * 60 * 30;

  const q = query(
    collection(db, 'followup_history'),
    where('timestamp', '>=', thirtyMinutesAgo),
    orderBy('timestamp', 'asc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data());
};

/**
 * ✅ 특정 사용자 기준 로그 조회 (UserEmotionSummaryTab에서 사용)
 *  - Firestore 쿼리는 timestamp 기준만 사용
 *  - user_name 은 JS에서 필터링 (인덱스 필요 없음)
 */
export const fetchChatLogsByUser = async ({
  userName,
  hours = 24,
  maxCount = 100,
}) => {
  if (!userName || !userName.trim()) return [];

  const now = Date.now();
  const from = now - hours * 60 * 60 * 1000;

  // Firestore 쿼리: timestamp 기준으로만 조회
  const q = query(
    collection(db, 'followup_history'),
    where('timestamp', '>=', from),
    orderBy('timestamp', 'asc'),
    limit(maxCount)
  );

  const snapshot = await getDocs(q);

  const targetName = userName.trim();

  const all = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  // JS에서 user_name 필터링
  return all.filter((item) => item.user_name === targetName);
};

/**
 * follow-up 저장
 */
export const saveFollowup = async ({
  user_name,
  bot_response,
  user_message,
  face_emotion,
  chat_emotion,
  timestamp,
}) => {
  try {
    await addDoc(collection(db, 'followup_history'), {
      user_name,
      user_message,
      bot_response,
      face_emotion,
      chat_emotion,
      timestamp: timestamp ?? Date.now(), // 없으면 현재 시간으로 저장
    });
    console.log('✅ Follow-up 저장 완료');
  } catch (err) {
    console.error('❌ Follow-up 저장 실패:', err);
  }
};