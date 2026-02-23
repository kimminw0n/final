// src/components/Weather.js
import React, { useEffect, useMemo, useRef, useState } from "react";

/** ---- 설정 ---- */
const GWANGJU = { lat: 35.1595, lon: 126.8526 };
const REFRESH_MS = 2 * 60 * 60 * 1000; // 2시간

/** WMO 코드 → 한글 설명 + 심플 아이콘(화면용) */
const WMO_MAP = {
  0:  ["맑음",         "☀️"],
  1:  ["대체로 맑음",   "🌤️"],
  2:  ["부분 흐림",     "⛅"],
  3:  ["흐림",          "☁️"],
  45: ["안개",          "🌫️"],
  48: ["서리 안개",     "🌫️"],
  51: ["이슬비 약",     "🌦️"],
  53: ["이슬비",        "🌦️"],
  55: ["이슬비 강",     "🌧️"],
  61: ["비 약",        "🌦️"],
  63: ["비",           "🌧️"],
  65: ["비 강",        "🌧️"],
  71: ["눈 약",        "🌨️"],
  73: ["눈",           "🌨️"],
  75: ["눈 강",        "❄️"],
  80: ["소나기 약",     "🌦️"],
  81: ["소나기",        "🌦️"],
  82: ["소나기 강",     "⛈️"],
  95: ["뇌우",          "⛈️"],
  96: ["천둥·우박(약)", "⛈️"],
  99: ["천둥·우박(강)", "⛈️"],
};

function wmoToKo(code)   { return (WMO_MAP[code] || ["알 수 없음","❔"])[0]; }
function wmoToIcon(code) { return (WMO_MAP[code] || ["알 수 없음","❔"])[1]; }

/** Open-Meteo에서 광주 날씨 요약 가져오기 */
async function fetchGwangjuSummary(signal) {
  const { lat, lon } = GWANGJU;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone: "Asia/Seoul",
    current: "temperature_2m,apparent_temperature,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  });

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();

  const c = data.current || {};
  const d = data.daily || {};
  const desc  = wmoToKo(c.weather_code);
  const icon  = wmoToIcon(c.weather_code);
  const nowT  = c.temperature_2m != null ? Math.round(c.temperature_2m) : null;
  const feels = c.apparent_temperature != null ? Math.round(c.apparent_temperature) : null;
  const tmin  = d.temperature_2m_min?.[0];
  const tmax  = d.temperature_2m_max?.[0];
  const pop   = d.precipitation_probability_max?.[0];

  // ✨ 프롬프트용(텍스트 전용)
  const partsText = [
    `${desc}`,
    nowT != null ? `현재 ${nowT}°C${feels != null ? ` (체감 ${feels}°)` : ""}` : null,
    tmin != null && tmax != null ? `최저 ${Math.round(tmin)}° / 최고 ${Math.round(tmax)}°` : null,
    pop != null ? `강수확률 ${Math.round(pop)}%` : null,
  ].filter(Boolean);
  const summary_ko = partsText.join(", ");

  // 👀 UI용(아이콘 포함)
  const partsUI = [
    `${icon} ${desc}`,
    nowT != null ? `현재 ${nowT}°C${feels != null ? ` (체감 ${feels}°)` : ""}` : null,
    tmin != null && tmax != null ? `최저 ${Math.round(tmin)}° / 최고 ${Math.round(tmax)}°` : null,
    pop != null ? `강수확률 ${Math.round(pop)}%` : null,
  ].filter(Boolean);
  const summary_ui = partsUI.join(", ");

  return {
    icon,
    desc,
    now: nowT,
    feels,
    tmin: tmin != null ? Math.round(tmin) : null,
    tmax: tmax != null ? Math.round(tmax) : null,
    pop:  pop != null ? Math.round(pop) : null,
    summary_ko, // ← 프롬프트용(텍스트만)
    summary_ui, // ← 화면표시용(아이콘 포함)
    raw: data,
  };
}

/** 훅: 광주 날씨 요약 */
export function useGwangjuWeather() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    data: null,
    updatedAt: null,
  });
  const abortRef = useRef(null);

  const load = useMemo(
    () => async (opts = { silent: false }) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      if (!opts.silent) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await fetchGwangjuSummary(ac.signal);
        setState({ loading: false, error: null, data, updatedAt: Date.now() });
      } catch (e) {
        if (e.name === "AbortError") return;
        setState((s) => ({ ...s, loading: false, error: e?.message || String(e) }));
      }
    },
    []
  );

  useEffect(() => {
    load();
    const t = setInterval(() => load({ silent: true }), REFRESH_MS);
    return () => {
      clearInterval(t);
      abortRef.current?.abort();
    };
  }, [load]);

  return { ...state, refresh: load };
}

/** 컴포넌트: 카드형 날씨 위젯 (onSummary에는 텍스트만 전달) */
export default function Weather({ onSummary }) {
  const { loading, error, data, updatedAt, refresh } = useGwangjuWeather();

  useEffect(() => {
    if (data?.summary_ko && typeof onSummary === "function") {
      onSummary(data.summary_ko); // ← 이 줄이 프롬프트용 텍스트만 전달
    }
  }, [data?.summary_ko, onSummary]);

  const stamp = updatedAt ? new Date(updatedAt).toLocaleTimeString("ko-KR") : null;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.title}>광주 날씨</span>
        <button onClick={() => refresh()} style={styles.refreshBtn} title="새로고침">
          ↻
        </button>
      </div>

      {loading && <div style={styles.row}>불러오는 중…</div>}
      {error && <div style={{ ...styles.row, color: "#b00020" }}>불러오기 실패: {error}</div>}

      {data && !loading && !error && (
        <>
          <div style={styles.main}>
            <span style={styles.icon}>{data.icon}</span>
            <div>
              {/* UI에는 아이콘 포함 버전 노출 */}
              <div style={styles.summary}>{data.summary_ui}</div>
              {stamp && <div style={styles.stamp}>업데이트: {stamp}</div>}
            </div>
          </div>

          <div style={styles.meta}>
            {data.tmin != null && data.tmax != null && (
              <span>최저 {data.tmin}° / 최고 {data.tmax}°</span>
            )}
            {data.pop != null && <span>강수 {data.pop}%</span>}
          </div>
        </>
      )}
    </div>
  );
}

/** ---- 스타일 ---- */
const styles = {
  card: {
    maxWidth: 520,
    width: "100%",
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 8px 22px rgba(0,0,0,0.08)",
    padding: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: 700 },
  refreshBtn: {
    border: "1px solid #ddd",
    background: "#f7f7f7",
    borderRadius: 8,
    padding: "4px 8px",
    cursor: "pointer",
  },
  row: { padding: "8px 0", fontSize: 14 },
  main: { display: "flex", gap: 12, alignItems: "center" },
  icon: { fontSize: 36, lineHeight: 1 },
  summary: { fontSize: 14, color: "#222", marginBottom: 2 },
  stamp: { fontSize: 12, color: "#666" },
  meta: { marginTop: 8, display: "flex", gap: 12, fontSize: 13, color: "#444" },
};
