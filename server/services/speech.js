export async function getSpeechToken() {
  // For real-time avatar, we need to return the token and region
  // The client will use WebRTC to connect
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  
  if (!key || !region) {
    throw new Error('Azure Speech Service credentials not configured');
  }

  return { key, region };
}

export async function getAvatarIceServers() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error('Azure Speech Service credentials not configured');
  }

  const endpoint =
    process.env.AZURE_SPEECH_ENDPOINT ||
    `https://${region}.tts.speech.microsoft.com`;
  const url = `${endpoint}/cognitiveservices/avatar/relay/token/v1`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Ocp-Apim-Subscription-Key': key
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to fetch avatar relay token: ${response.status} ${text}`
    );
  }

  return response.json();
}
