// bridge-servo.js
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { SerialPort, ReadlineParser } = require("serialport");

const HTTP_PORT = process.env.SERVO_HTTP_PORT || 3002;
const SERIAL_PATH = process.env.SERVO_SERIAL_PATH || "COM7";   // ★ UNO 포트
const SERIAL_BAUD = parseInt(process.env.SERVO_SERIAL_BAUD || "115200", 10);

const app = express();
app.use(cors());
app.get("/", (_, res) => res.send("OK"));

// ── WebSocket 서버 (업그레이드 방식) ─────────────────────────
const wss = new WebSocketServer({ noServer: true });
const server = app.listen(HTTP_PORT, () =>
  console.log(`[SERVO HTTP] ${HTTP_PORT}`)
);

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws-servo") {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

// ── Serial 포트 설정 ─────────────────────────────────────────
const port = new SerialPort({ path: SERIAL_PATH, baudRate: SERIAL_BAUD });
const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

port.on("open", () =>
  console.log(`[SERVO Serial] open ${SERIAL_PATH} @${SERIAL_BAUD}`)
);
port.on("error", e =>
  console.error("[SERVO Serial] error:", e.message)
);

// 아두이노 → 브라우저 (로그/피드백)
parser.on("data", line => {
  const msg = String(line).trim();
  console.log("[SERVO RX<-SERIAL]", JSON.stringify(msg));
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(msg);
  });
});

// 브라우저 → 아두이노
// "SERVO:0~3" 또는 "0~3"을 그대로 전달
wss.on("connection", ws => {
  console.log("[WS SERVO] client connected");

  ws.on("message", raw => {
    const msg = String(raw).trim();
    console.log("[SERVO TX->SERIAL]", JSON.stringify(msg));
    port.write(msg + "\n");
  });

  ws.on("close", () => console.log("[WS SERVO] client disconnected"));
});
