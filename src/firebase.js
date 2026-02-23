import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 🔒 Firebase 설정 직접 하드코딩 (환경변수 사용 안 함)
const firebaseConfig = {
  apiKey: "AIzaSyDIiA6X59dSa1SI3PJZcHeEkseoRbaArGc",
  authDomain: "mmcb-75427.firebaseapp.com",
  projectId: "mmcb-75427",
  storageBucket: "mmcb-75427.firebasestorage.app",
  messagingSenderId: "1074350092264",
  appId: "1:1074350092264:web:6205a130a7d40704ea7e5d"
};

// ✅ Firebase 초기화
const app = initializeApp(firebaseConfig);

// ✅ Firestore 초기화 및 외부 export
const db = getFirestore(app);
export { db };