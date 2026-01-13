// Azure Speech SDK for Avatar Realtime (loaded globally via index.html)
const SpeechSDK = window.SpeechSDK;

let speechConfig = null;
let avatarSynthesizer = null;
let peerConnection = null;
let avatarReady = false;
let reconnectTimeoutId = null;
const RECONNECT_DELAY_MS = 5000; // 5 seconds delay before trying to reconnect

const videoElement = document.getElementById('avatar-video');
const placeholder = document.getElementById('avatar-placeholder');
const avatarAudioElement = document.getElementById('avatar-audio');

// Initialize
async function init() {
  try {
    ensureAvatarSdkLoaded();
    await setupSpeechService();
    setupChatInterface();
    updateStatus('Ready. Ask your question!');
  } catch (error) {
    console.error('Initialization error:', error);
    updateStatus('Initialization error: ' + error.message);
  }
}

function ensureAvatarSdkLoaded() {
  if (!SpeechSDK || !SpeechSDK.AvatarSynthesizer) {
    throw new Error('Speech SDK avatar components failed to load. Check the CDN script.');
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch ${url}: ${response.status} ${text}`);
  }
  return response.json();
}

function normalizeIceServers(iceData) {
  if (!iceData) return [];
  if (Array.isArray(iceData)) return iceData;
  if (Array.isArray(iceData.iceServers)) return iceData.iceServers;

  const urls = iceData.urls || iceData.Urls;
  const username = iceData.username || iceData.Username;
  const credential = iceData.credential || iceData.Password; // Map 'Password' to 'credential'

  if (!urls) return [];

  const normalizedUrls = Array.isArray(urls) ? urls : [urls];
  return [
    {
      urls: normalizedUrls,
      username: username || '',
      credential: credential || ''
    }
  ];
}

// --- Avatar Connection Management --- //

function closeAvatarConnections() {
  if (avatarSynthesizer) {
    avatarSynthesizer.close();
    avatarSynthesizer = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  avatarReady = false;
  if (reconnectTimeoutId) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }
  videoElement.srcObject = null;
  videoElement.classList.remove('active');
  placeholder.style.display = 'flex'; // Show placeholder
}

async function reconnectAvatarConnection() {
  if (reconnectTimeoutId) {
    clearTimeout(reconnectTimeoutId);
  }
  closeAvatarConnections();
  updateStatus('Avatar disconnected. Reconnecting...');
  reconnectTimeoutId = setTimeout(async () => {
    try {
      await setupAvatarConnection();
      updateStatus('Avatar reconnected. Ready!');
    } catch (error) {
      console.error('Avatar reconnection failed:', error);
      updateStatus('Avatar reconnection failed. Will retry.');
      reconnectAvatarConnection(); // Recursive retry
    }
  }, RECONNECT_DELAY_MS);
}

async function setupAvatarConnection() {
  closeAvatarConnections(); // Ensure previous connections are closed
  updateStatus('Establishing avatar connection...');

  const iceData = await fetchJson('/api/speech/ice-token');
  const iceServers = normalizeIceServers(iceData);
  if (!iceServers.length) {
    throw new Error('No ICE server information received from backend');
  }

  peerConnection = new RTCPeerConnection({ iceServers });

  peerConnection.onconnectionstatechange = () => {
    console.log('PeerConnection state changed:', peerConnection.connectionState);
    if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
      reconnectAvatarConnection();
    }
  };
  peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE connection state changed:', peerConnection.iceConnectionState);
    if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
      reconnectAvatarConnection();
    }
  };

  peerConnection.ontrack = (event) => {
    if (event.track.kind === 'video' && event.streams[0]) {
      videoElement.srcObject = event.streams[0];
      videoElement.classList.add('active');
      placeholder.style.display = 'none';
    }

    if (event.track.kind === 'audio' && event.streams[0] && avatarAudioElement) {
      avatarAudioElement.srcObject = event.streams[0];
      avatarAudioElement.play().catch(() => {});
    }
  };

  peerConnection.addTransceiver('video', { direction: 'recvonly' });
  peerConnection.addTransceiver('audio', { direction: 'recvonly' });

  const avatarVideoFormat = new SpeechSDK.AvatarVideoFormat();
  if (SpeechSDK.AvatarVideoCodec && SpeechSDK.AvatarVideoCodec.H264) {
    avatarVideoFormat.videoCodec = SpeechSDK.AvatarVideoCodec.H264;
  }

  const avatarConfig = new SpeechSDK.AvatarConfig('Max', 'business', avatarVideoFormat);
  avatarConfig.backgroundColor = '#FFFFFFFF';

  avatarSynthesizer = new SpeechSDK.AvatarSynthesizer(speechConfig, avatarConfig);
  avatarSynthesizer.canceled = (s, e) => {
    console.error('Avatar synthesis canceled:', e.errorDetails);
    if (e.reason === SpeechSDK.CancellationReason.Error) {
      reconnectAvatarConnection();
    }
  };

  await avatarSynthesizer.startAvatarAsync(peerConnection);
  avatarReady = true;
}

// Setup Azure Speech Service (initial connection or re-initialization of speech config)
async function setupSpeechService() {
  try {
    const { key, region } = await fetchJson('/api/speech/token');

    if (!key || !region) {
      throw new Error('Cannot get credentials from server');
    }

    // Only create SpeechConfig once or if it needs to be updated
    if (!speechConfig || speechConfig.subscriptionKey !== key || speechConfig.region !== region) {
      speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechSynthesisVoiceName = 'hi-IN-ArjunNeural';
    }

    if (!avatarReady) {
      await setupAvatarConnection();
      updateStatus('Avatar connection ready');
    }
  } catch (error) {
    console.error('Speech service setup error:', error);
    throw error;
  }
}

function speakWithAvatar(text) {
  return new Promise((resolve, reject) => {
    if (!avatarSynthesizer || !avatarReady) {
      reject(new Error('Avatar connection not ready'));
      return;
    }

    avatarSynthesizer.speakTextAsync(
      text,
      (result) => {
        if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
          console.log('Avatar responded successfully');
          resolve();
        } else {
          reject(
            new Error(result.errorDetails || 'Avatar synthesis did not complete')
          );
        }
      },
      (error) => {
        reject(error);
      }
    );
  });
}

// Fallback TTS in case avatar connection fails
async function synthesizeSpeechFallback(text) {
  return new Promise((resolve, reject) => {
    const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig);
    synthesizer.speakTextAsync(
      text,
      (result) => {
        if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
          console.log('Fallback speech synthesized successfully');
          resolve();
        } else {
          reject(result.errorDetails);
        }
        synthesizer.close();
      },
      (error) => {
        synthesizer.close();
        reject(error);
      }
    );
  });
}

// Setup chat interface
function setupChatInterface() {
  const userInput = document.getElementById('user-input');
  const sendButton = document.getElementById('send-button');
  
  const sendMessage = async () => {
    const message = userInput.value.trim();
    if (!message) return;
    
      // Disable input during message processing only
      // Keep button enabled for immediate input
      sendButton.disabled = false; // Re-enable send button
    
    // Add user message to chat
    addMessage(message, 'user');
    userInput.value = '';
    userInput.disabled = false; // Ensure input is not disabled initially
    
    updateStatus('Working...');
    
    try {
      // Get response from Azure OpenAI
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      });
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Add bot response to chat
      addMessage(data.response, 'bot');

      // Synthesize speech with avatar
      updateStatus('Avatar is responding...');
      try {
        await speakWithAvatar(data.response);
      } catch (avatarError) {
        console.error('Avatar synthesis failed. Falling back to TTS:', avatarError);
        await synthesizeSpeechFallback(data.response);
      }

      updateStatus('Ready. Ask your next question!');
      
    } catch (error) {
      console.error('Chat error:', error);
      addMessage('Sorry, something went wrong: ' + error.message, 'bot');
      updateStatus('An error occurred. Please try again.');
    } finally {
      // Clear the input field but keep it enabled
      userInput.value = '';
      userInput.focus();
    }
  };
  
  sendButton.addEventListener('click', sendMessage);
  userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
}

// Add message to chat
function addMessage(text, type) {
  const chatMessages = document.getElementById('chat-messages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  messageDiv.textContent = text;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Update status
function updateStatus(message) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
}

// Initialize on load
init();

window.addEventListener('beforeunload', () => {
  try {
    avatarSynthesizer?.close();
    peerConnection?.close();
  } catch (error) {
    console.warn('Error closing avatar resources', error);
  }
});
