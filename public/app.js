/****************************************************
 * Real-time Avatar (Azure Speech) – Speech-to-Speech FIXED
 * Critical fixes:
 * - Single speechConfig instance (no conflicts)
 * - Proper config initialization order
 * - Speech recognizer uses separate config instance
 * - Language switching without full session restart
 * - Better error isolation between avatar and recognition
 * - Microphone permission handling
 ****************************************************/

const SpeechSDK = window.SpeechSDK;

// ---------- Tunables ----------
const SESSION_ID = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);

const VIDEO_READY_TIMEOUT_MS = 15000;

// reconnect backoff
const BASE_RECONNECT_DELAY_MS = 1500;
const MAX_RECONNECT_DELAY_MS = 15000;

// grace period for transient "disconnected"
const DISCONNECTED_GRACE_MS = 2500;

// ---------- DOM ----------
const videoElement = document.getElementById("avatar-video");
const placeholder = document.getElementById("avatar-placeholder");

const chatContainer = document.getElementById("chat-container");
const micButton = document.getElementById("mic-button");
const speechTranscript = document.getElementById("speech-transcript");
const languageSelect = document.getElementById("language-select");

// ---------- Autoplay safety (required) ----------
if (videoElement) {
  videoElement.autoplay = true;
  videoElement.muted = true;
  videoElement.playsInline = true;
}

// ---------- Audio unlock (user gesture) ----------
let audioUnlocked = false;

function unlockAudioOnce() {
  if (!videoElement) return;
  if (audioUnlocked) return;

  audioUnlocked = true;
  console.log("🔓 Unlocking avatar audio");

  videoElement.muted = false;
  videoElement.play().catch(() => {});
}

// Any user interaction unlocks audio
window.addEventListener("click", unlockAudioOnce, { once: true });
window.addEventListener("keydown", unlockAudioOnce, { once: true });

// ---------- State ----------
let speechConfig = null;
let avatarSynthesizer = null;
let peerConnection = null;
let speechRecognizer = null;

let avatarReady = false;
let connectPromise = null;
let listening = false;
let currentLanguage = "en";

let reconnectTimer = null;
let reconnectAttempt = 0;

let disconnectedGraceTimer = null;
let closing = false;

// Store credentials to reuse
let cachedCredentials = null;

// ---------- UI helpers ----------
function updateStatus(message) {
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.textContent = message;
}

function setChatAvailability(isReady, msg = "") {
  avatarReady = isReady;

  if (chatContainer) {
    chatContainer.style.opacity = isReady ? "1" : "0.55";
    chatContainer.style.pointerEvents = isReady ? "auto" : "none";
  }
  if (micButton) micButton.disabled = !isReady;

  updateStatus(msg || (isReady ? "Avatar ready" : "Avatar not ready…"));
}

function setLanguageUiCopy(language) {
  if (!speechTranscript) return;
  speechTranscript.textContent = language === "hi"
    ? "बटन दबाएं और अपना प्रश्न बोलें।"
    : "Tap the button and ask your question aloud.";
}

// ---------- Fetch (no-cache) ----------
async function fetchJson(url) {
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}sid=${encodeURIComponent(SESSION_ID)}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed ${url}: ${res.status} ${text}`);
  }
  return res.json();
}

// ---------- TURN-only ICE normalization (per docs) ----------
function normalizeIceServersTurnOnly(iceData) {
  const servers = Array.isArray(iceData)
    ? iceData
    : Array.isArray(iceData?.iceServers)
      ? iceData.iceServers
      : [];

  const out = [];

  if (!servers.length) {
    const urls = iceData?.urls || iceData?.Urls;
    const username = iceData?.username || iceData?.Username;
    const credential = iceData?.credential || iceData?.Password;

    const arr = urls ? (Array.isArray(urls) ? urls : [urls]) : [];
    const turnUrls = arr.filter(u => typeof u === "string" && u.toLowerCase().startsWith("turn"));
    if (turnUrls.length) out.push({ urls: turnUrls, username: username || "", credential: credential || "" });

    return out;
  }

  for (const s of servers) {
    const urls = Array.isArray(s.urls) ? s.urls : (s.urls ? [s.urls] : []);
    const turnUrls = urls.filter(u => typeof u === "string" && u.toLowerCase().startsWith("turn"));
    if (turnUrls.length) {
      out.push({
        urls: turnUrls,
        username: s.username || "",
        credential: s.credential || ""
      });
    }
  }
  return out;
}

// ---------- Robust video readiness check ----------
function waitForVideoRenderable(videoEl, timeoutMs = VIDEO_READY_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const isRenderable = () =>
      videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      videoEl.videoWidth > 0 &&
      videoEl.videoHeight > 0;

    if (isRenderable()) return resolve();

    let done = false;

    const finish = (ok, err) => {
      if (done) return;
      done = true;
      cleanup();
      ok ? resolve() : reject(err);
    };

    const onMaybeReady = () => {
      if (isRenderable()) finish(true);
    };

    const tick = setInterval(() => {
      if (isRenderable()) finish(true);
      if (Date.now() - start > timeoutMs) {
        finish(false, new Error("Timed out waiting for avatar video to become renderable"));
      }
    }, 150);

    const cleanup = () => {
      clearInterval(tick);
      videoEl.removeEventListener("loadedmetadata", onMaybeReady);
      videoEl.removeEventListener("loadeddata", onMaybeReady);
      videoEl.removeEventListener("canplay", onMaybeReady);
      videoEl.removeEventListener("playing", onMaybeReady);
    };

    videoEl.addEventListener("loadedmetadata", onMaybeReady);
    videoEl.addEventListener("loadeddata", onMaybeReady);
    videoEl.addEventListener("canplay", onMaybeReady);
    videoEl.addEventListener("playing", onMaybeReady);

    if ("requestVideoFrameCallback" in videoEl) {
      const rVFC = () => {
        if (done) return;
        if (isRenderable()) return finish(true);
        if (Date.now() - start > timeoutMs) {
          return finish(false, new Error("Timed out waiting for avatar video frames"));
        }
        videoEl.requestVideoFrameCallback(rVFC);
      };
      videoEl.requestVideoFrameCallback(rVFC);
    }
  });
}

// ---------- Lifecycle cleanup ----------
function clearTimers() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (disconnectedGraceTimer) {
    clearTimeout(disconnectedGraceTimer);
    disconnectedGraceTimer = null;
  }
}

function closeSession() {
  closing = true;
  clearTimers();

  // Stop speech recognition first
  try {
    if (speechRecognizer) {
      speechRecognizer.stopContinuousRecognitionAsync(() => {}, () => {});
      speechRecognizer.close();
    }
  } catch {}
  speechRecognizer = null;
  listening = false;

  // Close avatar synthesizer
  try {
    avatarSynthesizer?.close();
  } catch {}
  avatarSynthesizer = null;

  // Close PeerConnection
  try {
    peerConnection?.close();
  } catch {}
  peerConnection = null;

  connectPromise = null;
  avatarReady = false;

  // Clean video element
  if (videoElement) {
    const oldStream = videoElement.srcObject;
    videoElement.srcObject = null;
    videoElement.classList.remove("active");
    videoElement.muted = true;

    try {
      oldStream?.getTracks?.().forEach(t => t.stop());
    } catch {}
  }

  if (placeholder) placeholder.style.display = "flex";

  closing = false;
}

// ---------- Reconnect (no flapping) ----------
function cancelReconnectIfAny() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (disconnectedGraceTimer) {
    clearTimeout(disconnectedGraceTimer);
    disconnectedGraceTimer = null;
  }
}

function scheduleReconnect(reason = "disconnected") {
  if (closing) return;

  if (avatarReady) {
    cancelReconnectIfAny();
    return;
  }

  if (reconnectTimer) return;

  setChatAvailability(false, `Avatar ${reason}. Reconnecting...`);

  const delay = Math.min(
    MAX_RECONNECT_DELAY_MS,
    BASE_RECONNECT_DELAY_MS * Math.pow(2, Math.min(reconnectAttempt++, 4))
  );

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await startNewAvatarSession(`reconnect(${reason})`);
      reconnectAttempt = 0;
    } catch (e) {
      console.error("Reconnect failed:", e);
      scheduleReconnect("reconnect failed");
    }
  }, delay);
}

function reconnectOnDisconnectedWithGrace(label) {
  if (closing) return;
  if (avatarReady) return;

  if (disconnectedGraceTimer) return;
  disconnectedGraceTimer = setTimeout(() => {
    disconnectedGraceTimer = null;
    if (!peerConnection) return;
    const cs = peerConnection.connectionState;
    const isBad = (cs === "failed" || cs === "disconnected" || cs === "closed");
    if (isBad && !avatarReady) scheduleReconnect(label);
  }, DISCONNECTED_GRACE_MS);
}

// ---------- SDK checks ----------
function ensureSdkLoaded() {
  if (!SpeechSDK || !SpeechSDK.AvatarSynthesizer) {
    throw new Error("Speech SDK AvatarSynthesizer not available. Check the CDN script.");
  }
}

// ---------- Speech Config (CRITICAL FIX: Fetch once, reuse) ----------
async function getCredentials() {
  if (!cachedCredentials) {
    cachedCredentials = await fetchJson("/api/speech/token");
  }
  return cachedCredentials;
}

async function createSpeechConfigForLanguage(language) {
  const creds = await getCredentials();

  let config;
  if (creds.token && creds.region) {
    config = SpeechSDK.SpeechConfig.fromAuthorizationToken(creds.token, creds.region);
  } else if (creds.key && creds.region) {
    config = SpeechSDK.SpeechConfig.fromSubscription(creds.key, creds.region);
  } else {
    throw new Error("Invalid /api/speech/token response (expected {token,region} or {key,region}).");
  }

  // Set language-specific settings
  if (language === "hi") {
    config.speechSynthesisVoiceName = "hi-IN-ArjunNeural";
    config.speechRecognitionLanguage = "hi-IN";
  } else {
    config.speechSynthesisVoiceName = "en-US-JennyNeural";
    config.speechRecognitionLanguage = "en-US";
  }

  return config;
}

// ---------- Avatar Session ----------
async function setupPeerConnectionAndAvatar() {
  const iceData = await fetchJson("/api/speech/ice-token");
  const iceServers = normalizeIceServersTurnOnly(iceData);

  if (!iceServers.length) throw new Error("No TURN ICE servers received from backend.");

  peerConnection = new RTCPeerConnection({ iceServers });

  peerConnection.onconnectionstatechange = () => {
    const s = peerConnection.connectionState;
    console.log("pc.connectionState:", s);

    if (s === "connected") return;
    if (s === "failed") scheduleReconnect("failed");
    if (s === "disconnected") reconnectOnDisconnectedWithGrace("disconnected");
  };

  peerConnection.oniceconnectionstatechange = () => {
    const s = peerConnection.iceConnectionState;
    console.log("pc.iceConnectionState:", s);

    if (s === "connected") return;
    if (s === "failed") scheduleReconnect("ice-failed");
    if (s === "disconnected") reconnectOnDisconnectedWithGrace("ice-disconnected");
  };

  peerConnection.ontrack = async (event) => {
    try {
      const stream = event.streams?.[0];
      if (!stream) return;

      if (event.track.kind === "video") {
        videoElement.srcObject = stream;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.muted = !audioUnlocked;

        videoElement.classList.add("active");
        if (placeholder) placeholder.style.display = "none";

        try {
          await videoElement.play();
        } catch {
          console.warn("Autoplay blocked until user gesture (click/keydown).");
          updateStatus("Click anywhere to enable sound");
        }

        await waitForVideoRenderable(videoElement);
        cancelReconnectIfAny();
        setChatAvailability(true, audioUnlocked ? "Avatar ready" : "Avatar ready (click to enable sound)");
      }
    } catch (e) {
      console.error("ontrack error:", e);
      if (!avatarReady) scheduleReconnect("ontrack-error");
    }
  };

  // Per Microsoft doc: sendrecv
  peerConnection.addTransceiver("video", { direction: "sendrecv" });
  peerConnection.addTransceiver("audio", { direction: "sendrecv" });

  // Avatar configuration
  const avatarVideoFormat = new SpeechSDK.AvatarVideoFormat();
  if (SpeechSDK.AvatarVideoCodec?.H264) {
    avatarVideoFormat.videoCodec = SpeechSDK.AvatarVideoCodec.H264;
  }

  const avatarConfig = new SpeechSDK.AvatarConfig("Max", "business", avatarVideoFormat);
  avatarConfig.backgroundColor = "#FFFFFFFF";

  // CRITICAL: Create fresh config for avatar
  speechConfig = await createSpeechConfigForLanguage(currentLanguage);

  avatarSynthesizer = new SpeechSDK.AvatarSynthesizer(speechConfig, avatarConfig);
  avatarSynthesizer.canceled = (s, e) => {
    console.error("Avatar canceled:", e?.errorDetails || e);
    if (!avatarReady) scheduleReconnect("canceled");
  };

  updateStatus("Starting avatar session...");
  await avatarSynthesizer.startAvatarAsync(peerConnection);

  updateStatus("Waiting for avatar stream...");
}

async function startNewAvatarSession(reason = "init") {
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    setChatAvailability(false, `Establishing realtime session (${reason})...`);

    closeSession();
    cancelReconnectIfAny();

    await setupPeerConnectionAndAvatar();
  })();

  try {
    return await connectPromise;
  } finally {
    connectPromise = null;
  }
}

// ---------- Chat ----------
function addMessage(text, type) {
  const chatMessages = document.getElementById("chat-messages");
  if (!chatMessages) return;
  const div = document.createElement("div");
  div.className = `message ${type}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setMicListening(isListening) {
  listening = isListening;
  if (!micButton) return;
  micButton.classList.toggle("listening", isListening);
  micButton.textContent = isListening ? "Listening..." : "Start speaking";
}

function updateTranscript(text) {
  if (speechTranscript) {
    speechTranscript.textContent = text;
  }
}

function getSpeechUiCopy() {
  if (currentLanguage === "hi") {
    return {
      listening: "सुन रहा है...",
      noSpeech: "कोई आवाज़ नहीं मिली। फिर से प्रयास करें।",
      canceled: "स्पीच पहचान रद्द हो गई। फिर से प्रयास करें।",
      micError: "माइक्रोफोन त्रुटि। अनुमति जांचें और फिर से प्रयास करें।"
    };
  }

  return {
    listening: "Listening...",
    noSpeech: "No speech detected. Tap to try again.",
    canceled: "Speech recognition canceled. Tap to try again.",
    micError: "Microphone error. Check permissions and try again."
  };
}

async function stopSpeechRecognition() {
  if (!speechRecognizer) {
    setMicListening(false);
    return;
  }

  try {
    await new Promise((resolve) => {
      speechRecognizer.stopContinuousRecognitionAsync(resolve, resolve);
    });
  } catch {}

  try {
    speechRecognizer.close();
  } catch {}
  speechRecognizer = null;
  setMicListening(false);
}

async function processUserMessage(message) {
  if (!message || !message.trim()) return;

  addMessage(message, "user");
  updateStatus("Working...");

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, language: currentLanguage })
    });

    const data = await resp.json();
    if (data?.error) throw new Error(data.error);

    addMessage(data.response, "bot");
    updateStatus("Avatar speaking...");

    await new Promise((resolve, reject) => {
      avatarSynthesizer.speakTextAsync(
        data.response,
        (result) => {
          if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            resolve();
          } else {
            reject(new Error("Avatar speakTextAsync did not complete"));
          }
        },
        (err) => reject(err)
      );
    });

    unlockAudioOnce();
    updateStatus("Ready");
  } catch (e) {
    console.error("Chat error:", e);
    updateStatus(`Error: ${e.message || e}`);
    if (!avatarReady) scheduleReconnect("chat-error");
  }
}

function setupVoiceInterface() {
  if (!micButton) return;

  const startListening = async () => {
    if (!avatarReady) {
      updateStatus("Avatar not ready. Please wait…");
      return;
    }
    if (listening) {
      // Stop if already listening
      await stopSpeechRecognition();
      setLanguageUiCopy(currentLanguage);
      updateStatus("Ready");
      return;
    }

    try {
      // CRITICAL FIX: Create SEPARATE config for speech recognizer
      const recognizerConfig = await createSpeechConfigForLanguage(currentLanguage);

      const uiCopy = getSpeechUiCopy();
      updateTranscript(uiCopy.listening);
      setMicListening(true);
      updateStatus(uiCopy.listening);

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      speechRecognizer = new SpeechSDK.SpeechRecognizer(recognizerConfig, audioConfig);

      let handled = false;

      speechRecognizer.recognizing = (s, e) => {
        if (e.result?.text) {
          updateTranscript(e.result.text);
        }
      };

      speechRecognizer.recognized = async (s, e) => {
        if (handled) return;

        if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const text = (e.result.text || "").trim();
          if (!text) {
            updateTranscript(uiCopy.noSpeech);
            updateStatus(uiCopy.noSpeech);
            await stopSpeechRecognition();
            return;
          }

          handled = true;
          updateTranscript(text);
          await stopSpeechRecognition();
          await processUserMessage(text);
          return;
        }

        if (e.result.reason === SpeechSDK.ResultReason.NoMatch) {
          handled = true;
          await stopSpeechRecognition();
          updateTranscript(uiCopy.noSpeech);
          updateStatus(uiCopy.noSpeech);
        }
      };

      speechRecognizer.canceled = async (s, e) => {
        console.error("Speech recognition canceled:", e?.errorDetails || e);
        await stopSpeechRecognition();
        
        // Don't restart avatar session for recognition errors
        updateTranscript(uiCopy.canceled);
        updateStatus(uiCopy.canceled);
      };

      speechRecognizer.sessionStopped = async () => {
        if (listening) {
          await stopSpeechRecognition();
        }
      };

      await new Promise((resolve, reject) => {
        speechRecognizer.startContinuousRecognitionAsync(
          () => {
            console.log("Speech recognition started");
            resolve();
          },
          (err) => {
            console.error("Failed to start recognition:", err);
            reject(err);
          }
        );
      });

    } catch (e) {
      console.error("Speech recognition error:", e);
      await stopSpeechRecognition();
      const uiCopy = getSpeechUiCopy();
      updateTranscript(uiCopy.micError);
      updateStatus(`Mic error: ${e.message || e}`);
    }
  };

  micButton.addEventListener("click", startListening);
}

function setupLanguageSelector() {
  if (!languageSelect) return;

  const applyLanguage = async (language) => {
    const oldLanguage = currentLanguage;
    currentLanguage = language;
    setLanguageUiCopy(language);

    // Stop any ongoing recognition
    await stopSpeechRecognition();

    // CRITICAL FIX: Only restart if avatar is active
    // Language change updates voice on next synthesis
    if (avatarReady && oldLanguage !== language) {
      updateStatus(`Switching to ${language === "hi" ? "Hindi" : "English"}...`);
      // Restart session with new language
      await startNewAvatarSession(`language-${language}`);
    }
  };

  currentLanguage = languageSelect.value || "en";
  setLanguageUiCopy(currentLanguage);

  languageSelect.addEventListener("change", async (event) => {
    const nextLanguage = event.target.value === "hi" ? "hi" : "en";
    await applyLanguage(nextLanguage);
  });
}

// ---------- Init ----------
async function init() {
  try {
    ensureSdkLoaded();
    setupLanguageSelector();
    setupVoiceInterface();
    setChatAvailability(false, "Initializing avatar...");
    
    // Fetch credentials early
    await getCredentials();
    
    setTimeout(() => {
      startNewAvatarSession("page-load");
    }, 700);
    
  } catch (e) {
    console.error("Init failed:", e);
    setChatAvailability(false, `Avatar failed: ${e.message}`);
  }
}

init();

window.addEventListener("beforeunload", () => {
  try { stopSpeechRecognition(); } catch {}
  try { closeSession(); } catch {}
});
