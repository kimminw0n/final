// local-save-server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

/* -----------------------------------------------------------
 🗂️ known 폴더: React 감시(public) 밖으로 이동
    경로: /server/known
------------------------------------------------------------ */
const KNOWN_DIR = path.join(__dirname, "server", "known");
fs.mkdirSync(KNOWN_DIR, { recursive: true });

/* -----------------------------------------------------------
 🚀 Express가 직접 /known 경로를 static으로 제공
    (React 감시 우회 + 인식 정상 유지)
------------------------------------------------------------ */
app.use("/known", express.static(KNOWN_DIR));

/* -----------------------------------------------------------
 📸 1. 얼굴 이미지 저장 (base64 → 파일)
------------------------------------------------------------ */
app.post("/save-image", (req, res) => {
  try {
    const { base64, filename } = req.body;
    if (!base64 || !filename)
      return res.status(400).json({ ok: false, error: "base64 또는 filename 누락" });

    const safe = filename.replace(/[^\w가-힣_.-]/g, "_");
    const filePath = path.join(KNOWN_DIR, safe);
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(filePath, base64Data, "base64");

    console.log(`✅ 이미지 저장 완료: ${safe}`);
    res.json({ ok: true, serveUrl: `/known/${safe}`, filePath });
  } catch (err) {
    console.error("❌ 이미지 저장 실패:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -----------------------------------------------------------
 🧠 2. 얼굴 descriptor 저장 (feature vector)
------------------------------------------------------------ */
app.post("/save-descriptor", (req, res) => {
  try {
    const { name, descriptor } = req.body;
    if (!name || !Array.isArray(descriptor))
      return res.status(400).json({ ok: false, error: "name 또는 descriptor 누락" });

    const descFile = path.join(KNOWN_DIR, "descriptors.json");

    // 기존 파일 읽기 (없으면 새로 생성)
    const list = fs.existsSync(descFile)
      ? JSON.parse(fs.readFileSync(descFile, "utf8"))
      : [];

    // 기존 인물 찾기 or 새로 추가
    let entry = list.find((x) => x.label === name);
    if (!entry) {
      entry = { label: name, descriptors: [] };
      list.push(entry);
    }

    // descriptor 추가
    entry.descriptors.push(descriptor);

    // 저장
    fs.writeFileSync(descFile, JSON.stringify(list, null, 2));

    console.log(`✅ descriptor 저장 완료: ${name} (${descriptor.length} floats)`);
    // 파일 변경 즉시 SSE 구독자들에게 알림
    broadcastSSE("descriptors-change", "updated");

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ descriptor 저장 실패:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -----------------------------------------------------------
 📂 3. descriptors.json 조회 (Remember.js 용)
------------------------------------------------------------ */
app.get("/known/descriptors.json", (req, res) => {
  try {
    const descFile = path.join(KNOWN_DIR, "descriptors.json");
    if (!fs.existsSync(descFile)) return res.status(404).json([]);
    const json = JSON.parse(fs.readFileSync(descFile, "utf8"));
    res.json(json);
  } catch (err) {
    console.error("❌ descriptors.json 읽기 실패:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -----------------------------------------------------------
 🔁 4. SSE (Server-Sent Events) — 실시간 반영 트리거
------------------------------------------------------------ */
const clients = new Set();

app.get("/known/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.add(res);
  console.log(`👥 SSE 연결 수: ${clients.size}`);

  req.on("close", () => {
    clients.delete(res);
    console.log(`❌ SSE 연결 해제, 남은 연결 수: ${clients.size}`);
  });
});

// 변경사항 감지 (fs.watch로 descriptors.json 변화 감지)
const descFile = path.join(KNOWN_DIR, "descriptors.json");
if (!fs.existsSync(descFile)) fs.writeFileSync(descFile, "[]");

fs.watch(descFile, (eventType) => {
  if (eventType === "change") {
    broadcastSSE("descriptors-change", "file-update");
  }
});

// 모든 SSE 클라이언트에 이벤트 전송
function broadcastSSE(event, data) {
  for (const client of clients) {
    client.write(`event: ${event}\ndata: ${data}\n\n`);
  }
}

/* -----------------------------------------------------------
 🚀 서버 시작
------------------------------------------------------------ */
const PORT = 4123;
app.listen(PORT, () => {
  console.log(`✅ Local Save Server 실행 중: http://localhost:${PORT}`);
  console.log(`📁 known 폴더 경로: ${KNOWN_DIR}`);
});