// src/components/TextEmotionChart.js
import React from 'react';
import { Bar } from 'react-chartjs-2';

const TextEmotionChart = ({ scores }) => {
  if (!scores || typeof scores !== 'object') return null;

  const englishLabels = Object.keys(scores);

  // ✅ 영어 → 한글 매핑
  const labelMap = {
    neutral: '평범함',
    happy: '기쁨',
    sad: '슬픔',
    angry: '화남',
    fearful: '두려움',
    disgusted: '역겨움',
    surprised: '놀라움',
  };

  // ✅ 색상 매핑 (영문 키 기준)
  const emotionColors = {
    neutral: 'rgb(149, 165, 166)',
    happy: 'rgb(255, 242, 0)',
    sad: 'rgb(52, 152, 219)',
    angry: 'rgb(255, 99, 132)',
    fearful: 'rgb(228, 18, 243)',
    disgusted: 'rgb(46, 204, 113)',
    surprised: 'rgb(255, 170, 0)',
  };

  const data = {
    labels: englishLabels.map(label => labelMap[label] || label),
    datasets: [
      {
        label: '대화 감정',
        data: englishLabels.map(label => scores[label]),
        backgroundColor: englishLabels.map(label => emotionColors[label] || '#CCCCCC'),
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          precision: 0,
          color: '#222',
          font: { size: 14, weight: 'bold' }, // ✅ Y축 숫자 크기 업
        },
        title: {
          display: true,
          text: '점수(%)',
          color: '#333',
          font: { size: 15, weight: 'bold' }, // ✅ Y축 제목
        },
      },
      x: {
        ticks: {
          color: '#111',
          font: { size: 14, weight: 'bold' }, // ✅ X축 감정 이름 폰트 키움
          maxRotation: 0,
          minRotation: 0,
        },
      },
    },
    plugins: {
      legend: {
        labels: {
          color: '#222',
          font: { size: 15, weight: 'bold' }, // ✅ 범례(상단 텍스트) 폰트 키움
        },
      },
      tooltip: {
        titleFont: { size: 15 },
        bodyFont: { size: 14 },
      },
    },
  };

  return (
    <div style={{ width: '420px', height: '240px' }}>
      <Bar data={data} options={options} />
    </div>
  );
};

export default TextEmotionChart;