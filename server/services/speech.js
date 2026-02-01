export async function getSpeechToken() {
  // For real-time avatar, we need to return the token and region
  // The client will use WebRTC to connect
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const endpoint = process.env.AZURE_SPEECH_ENDPOINT;
  
  if (!key || !region) {
    throw new Error('Azure Speech Service credentials not configured');
  }

  return { key, region, endpoint };
}

export async function getAvatarIceServers() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  
  if (!key || !region) {
    throw new Error('Azure Speech Service credentials not configured');
  }

  // Avatar relay token endpoint
  const endpoint =
    process.env.AZURE_SPEECH_ENDPOINT ||
    `https://${region}.tts.speech.microsoft.com`;
  
  const url = `${endpoint}/cognitiveservices/avatar/relay/token/v1`;

  console.log('=== DEBUG ICE Token Request ===');
  console.log(`Region: ${region}`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Full URL: ${url}`);
  console.log(`Key (first 10 chars): ${key?.substring(0, 10)}...`);
  console.log('==============================');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': key
      }
    });

    console.log(`Response status: ${response.status}`);
    console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const text = await response.text();
      console.error(`Response body: ${text}`);
      throw new Error(
        `Failed to fetch avatar relay token: ${response.status} ${text}`
      );
    }

    const data = await response.json();
    console.log('ICE token retrieved successfully');
    return data;
  } catch (error) {
    console.error('Error fetching ICE token:', error);
    throw error;
  }
}