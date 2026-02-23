import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "ap-northeast-2",
  credentials: {
    //accessKeyId: "AKIAY3UCBIUX3IG6DVVQ",
    secretAccessKey: "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",
  }
});

export const uploadImageToS3 = async (base64, emotionLabel) => {
  const blob = await fetch(base64).then(res => res.blob());
  const arrayBuffer = await blob.arrayBuffer();           // ✅ 핵심: Blob → ArrayBuffer
  const uint8Array = new Uint8Array(arrayBuffer);         // ✅ Uint8Array로 변환

  const fileName = `${emotionLabel}/${Date.now()}.png`;

  const params = {
    Bucket: "emotiondatas", // 실제 버킷명으로 변경
    Key: fileName,
    Body: uint8Array,
    ContentType: "image/png",
  };

  try {
    const command = new PutObjectCommand(params);
    const result = await s3.send(command);
    console.log("✅ S3 업로드 성공:", result);
    return `https://${params.Bucket}.s3.amazonaws.com/${fileName}`;
  } catch (err) {
    console.error("❌ S3 업로드 실패:", err);
    return null;
  }
};
