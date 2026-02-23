// src/components/Capture.js
import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { updateFaceEmotion } from './Data';
import { uploadImageToLocal } from './uploadToLocal';

const SERVER = 'http://localhost:4123'; // descriptor 저장 서버

function Capture({
  setFaceEmotion,
  triggerCapture,
  onCaptureComplete,

  // 이름 학습(1장 저장)
  rememberRequest,             // { id, name }
  onRememberProgress,          // ({ index, url }) => void
  onRememberDone,              // ({ name, successCount, urls }) => void

  // 실시간 얼굴 인식
  faceMatcher,                 // face-api.js FaceMatcher
  onRecognized,                // (label, distance) => void
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const lastRememberIdRef = useRef(null);

  // 모델 로딩 및 카메라 연결
  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
        await faceapi.nets.faceExpressionNet.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        setModelsLoaded(true);
      } catch (err) {
        console.error('모델 로딩 실패:', err);
      }
    };
    loadModels();

    navigator.mediaDevices.getUserMedia({ video: {} })
      .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
      .catch(err => console.error('웹캠 접근 오류:', err));

    return () => {
      try { videoRef.current?.srcObject?.getTracks?.().forEach(t => t.stop()); } catch {}
    };
  }, []);

  // 실시간 감정 + 얼굴 인식
  useEffect(() => {
    if (!modelsLoaded) return;

    const detectFace = async () => {
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      const displaySize = { width: video.videoWidth, height: video.videoHeight };
      if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
        canvas.width = displaySize.width;
        canvas.height = displaySize.height;
      }
      faceapi.matchDimensions(canvas, displaySize);

      const detections = await faceapi
        .detectAllFaces(video, new faceapi.SsdMobilenetv1Options())
        .withFaceLandmarks()
        .withFaceExpressions()
        .withFaceDescriptors();

      const resizedDetections = faceapi.resizeResults(detections, displaySize);

      context.clearRect(0, 0, canvas.width, canvas.height);
      faceapi.draw.drawDetections(canvas, resizedDetections);
      faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
      faceapi.draw.drawFaceExpressions(canvas, resizedDetections);

      if (detections.length > 0) {
        const centerX = video.videoWidth / 2;
        const closestFace = detections.reduce((prev, curr) => {
          const prevCenter = prev.detection.box.x + prev.detection.box.width / 2;
          const currCenter = curr.detection.box.x + curr.detection.box.width / 2;
          return Math.abs(currCenter - centerX) < Math.abs(prevCenter - centerX) ? curr : prev;
        });

        setFaceEmotion(closestFace.expressions);
        updateFaceEmotion({ ...closestFace.expressions });

        if (faceMatcher && closestFace.descriptor) {
          const res = faceMatcher.findBestMatch(closestFace.descriptor);
          const best = { label: res.label, distance: Number(res.distance) };
          onRecognized?.(best.label, best.distance);
        }
      }
    };

    const interval = setInterval(detectFace, 300);
    return () => clearInterval(interval);
  }, [modelsLoaded, setFaceEmotion, faceMatcher, onRecognized]);

  // 단일 프레임 전체 스냅샷 (옵션)
  useEffect(() => {
    const captureImage = async () => {
      if (!videoRef.current) return;
      if (videoRef.current.readyState < 2) return;

      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/png');
      if (onCaptureComplete) await onCaptureComplete(base64);
    };
    if (triggerCapture > 0) captureImage();
  }, [triggerCapture, onCaptureComplete]);

  // 이름 학습: 1장 저장 + descriptor 자동 저장
  useEffect(() => {
    if (!modelsLoaded) return;
    if (!rememberRequest?.id) return;
    if (lastRememberIdRef.current === rememberRequest.id) return;
    lastRememberIdRef.current = rememberRequest.id;

    const run = async () => {
      const { name } = rememberRequest;
      const urls = [];
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

      for (let i = 0; i < 1; i++) {
        try {
          const detection = await faceapi
            .detectSingleFace(video, new faceapi.SsdMobilenetv1Options())
            .withFaceLandmarks()
            .withFaceExpressions()
            .withFaceDescriptor();

          if (!detection) {
            await sleep(250); i--; continue;
          }

          const box = detection.detection.box;
          const pad = Math.round(Math.max(box.width, box.height) * 0.3);
          const sx = Math.max(0, box.x - pad);
          const sy = Math.max(0, box.y - pad);
          const sw = Math.min(video.videoWidth - sx, box.width + pad * 2);
          const sh = Math.min(video.videoHeight - sy, box.height + pad * 2);

          // 224x224 크기로 얼굴 캡처
          const faceCanvas = document.createElement('canvas');
          faceCanvas.width = 224;
          faceCanvas.height = 224;
          faceCanvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, 224, 224);

          const base64 = faceCanvas.toDataURL('image/png');

          // ✅ 이미지 저장
          const savedUrl = await uploadImageToLocal(base64, `${String(name || '').trim()}.png`);
          if (savedUrl) {
            urls.push(savedUrl);
            onRememberProgress?.({ index: i, url: savedUrl });
          }

          // ✅ descriptor 추출 후 서버 저장
          if (detection.descriptor) {
            const descriptorArray = Array.from(detection.descriptor);
            await fetch(`${SERVER}/save-descriptor`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, descriptor: descriptorArray }),
            });
            console.log(`[Capture] descriptor saved for ${name}`);
          }

        } catch (e) {
          console.error('remember capture error:', e);
          await sleep(300);
          i--;
        }
      }
      onRememberDone?.({ name: rememberRequest.name, successCount: urls.length, urls });
    };

    run();
  }, [modelsLoaded, rememberRequest, onRememberProgress, onRememberDone]);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  return (
    <div style={{ position: 'relative', width: '640px', height: '380px', overflow: 'hidden' }}>
      <video ref={videoRef} autoPlay muted width="640" height="480" style={{ display:'block' }} />
      <canvas ref={canvasRef} width="640" height="480" style={{ position:'absolute', top:0, left:0 }} />
    </div>
  );
}

export default Capture;