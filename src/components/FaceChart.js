// src/components/FaceChart.js
import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

// Chart.js 구성 요소 등록
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function FaceChart({ faceEmotion }) {
  if (!faceEmotion) return <p>감정 데이터 없음</p>;

  // ✅ 영어 → 한글 라벨 매핑
  const emotionLabels = {
    neutral: '평범함',
    happy: '기쁨',
    sad: '슬픔',
    angry: '화남',
    fearful: '두려움',
    disgusted: '역겨움',
    surprised: '놀람'
  };

  // ✅ 감정별 색상 지정
  const emotionColors = {
    angry: '#FF6384',
    disgusted: '#2ECC71',
    fearful: '#A020F0',
    happy: '#FFD700',
    neutral: '#95A5A6',
    sad: '#3498DB',
    surprised: '#FF8C00'
  };

  // 데이터 구성
  const labels = Object.keys(faceEmotion).map((key) => emotionLabels[key] || key);
  const values = Object.values(faceEmotion).map((v) => Math.round(v * 100)); // 백분율로 변환

  const data = {
    labels,
    datasets: [
      {
        label: '표정 감정 점수 (%)',
        data: values,
        backgroundColor: Object.keys(faceEmotion).map(
          (key) => emotionColors[key] || '#CCCCCC'
        ),
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: { size: 14, family: 'Noto Sans KR' }, // ✅ 한글 폰트
        },
      },
      title: {
        display: true,
        text: '표정 감정 분석 결과',
        font: { size: 18, family: 'Noto Sans KR', weight: 'bold' },
      },
      tooltip: {
        bodyFont: { family: 'Noto Sans KR' },
        titleFont: { family: 'Noto Sans KR' },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          font: { size: 13, family: 'Noto Sans KR' },
          callback: (value) => `${value}%`,
        },
      },
      x: {
        ticks: { font: { size: 13, family: 'Noto Sans KR' } },
      },
    },
  };

  return (
    <div style={{ width: '500px', height: '250px' }}>
      <Bar data={data} options={options} />
    </div>
  );
}

export default FaceChart;