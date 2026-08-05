async function transcribeAudio(url, mimeType) {
  const audioRes = await fetch(url);
  if (!audioRes.ok) {
    throw new Error(`Falha ao descarregar áudio: ${audioRes.status}`);
  }
  const arrayBuffer = await audioRes.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: mimeType || 'audio/ogg' });

  const form = new FormData();
  form.append('file', blob, 'audio.ogg');
  form.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: form
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro na transcrição (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.text || '';
}

module.exports = { transcribeAudio };
