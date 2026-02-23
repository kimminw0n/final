// led-bridge.js
// WebSocket(ws://localhost:3001/ws-led) <-> Arduino(시리얼) 브리지

const WebSocket = require("ws");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

// === 시리얼 포트 설정 (환경에 맞게 COM 포트 수정) ===
const SERIAL_PATH = "COM5"; // 필요하면 COM 번호 변경
const SERIAL_BAUD = 115200;

// === WebSocket 설정 ===
const WS_PORT = 3001;
const WS_PATH = "/ws-led";

const serialPort = new SerialPort({
  path: SERIAL_PATH,
  baudRate: SERIAL_BAUD,
});

const parser = serialPort.pipe(new ReadlineParser({ delimiter: "\n" }));

serialPort.on("open", () => {
  console.log(`[Serial LED] open ${SERIAL_PATH} @${SERIAL_BAUD}`);
});

serialPort.on("error", (err) => {
  console.error("[Serial LED] ERROR:", err);
});

parser.on("data", (line) => {
  const msg = line.toString().trim();
  if (!msg) return;
  console.log('[LED RX<-SERIAL]', JSON.stringify(msg));
  // 필요하면 브로드캐스트해서 React에서도 로그 볼 수 있음
});

// WebSocket 서버
const wss = new WebSocket.Server({
  port: WS_PORT,
  path: WS_PATH,
});

wss.on("connection", (ws) => {
  console.log("[WS LED] client connected");

  ws.on("message", (data) => {
    let text;

    if (Buffer.isBuffer(data)) {
      text = data.toString("utf8");
    } else if (typeof data === "string") {
      text = data;
    } else {
      text = String(data);
    }

    text = text.trim();
    if (!text) return;

    console.log("[WS LED] <-", text);

    // 문자열인지 JSON 객체인지 구분 (React에서 이미 JSON 문자열일 수도 있음)
    let toSend = text;

    // 만약 브라우저에서 객체 형태를 그대로 보내는 경우(문자열이 아닌 경우)도 대비
    try {
      // 텍스트가 JSON이면 그대로
      JSON.parse(text);
    } catch {
      // JSON이 아니면(그냥 문자열 명령이면) 그대로 사용
    }

    // 시리얼로 전송 (끝에 \n 꼭 붙여줘야 아두이노에서 한 줄로 인식)
    serialPort.write(toSend + "\n", (err) => {
      if (err) {
        console.error("[Serial LED] write error:", err);
      } else {
        console.log("[LED TX->SERIAL]", JSON.stringify(toSend));
      }
    });
  });

  ws.on("close", () => {
    console.log("[WS LED] client disconnected");
  });

  ws.on("error", (err) => {
    console.error("[WS LED] error:", err);
  });
});

console.log(
  `[WS LED] listening on ws://localhost:${WS_PORT}${WS_PATH} (bridge ready)`
);