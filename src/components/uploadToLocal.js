export async function uploadImageToLocal(base64, filename) {
  try {
    const r = await fetch('http://localhost:4123/save-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, base64 }),
    });
    if (!r.ok) return null;
    const json = await r.json().catch(() => null);
    return json?.ok ? json.serveUrl : null;
  } catch (e) {
    console.warn('[uploadToLocal] fail:', e);
    return null;
  }
}