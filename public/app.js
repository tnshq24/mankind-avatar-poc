/****************************************************
 * Real-time Avatar (Azure Speech) – Stable + No Flapping + Audio Works
 * Fixes:
 * - waitForVideoRenderable defined (no ReferenceError)
 * - ontrack never throws (prevents false reconnect)
 * - Debounced reconnect on "disconnected" (prevents session restart loops)
 * - Cancels reconnect if video is already rendering
 * - TURN-only ICE urls per docs
 * - sendrecv transceivers per docs
 * - Fresh ICE/token fetch (no-store) per refresh/session
 * - Audio plays reliably via user-gesture unlock (browser autoplay policy)
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

const chatContainer = document.getElementById("chat-container"); // optional wrapper
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");

// ---------- Autoplay safety (required) ----------
if (videoElement) {
  videoElement.autoplay = true;
  videoElement.muted = true;       // start muted so autoplay works
  videoElement.playsInline = true;
}

// ---------- Audio unlock (user gesture) ----------
let audioUnlocked = false;

function unlockAudioOnce() {
  if (!videoElement) return;
  if (audioUnlocked) return;

  audioUnlocked = true;
  console.log("🔓 Unlocking avatar audio");

  // unmute + try play
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

let avatarReady = false;
let connectPromise = null;

let reconnectTimer = null;
let reconnectAttempt = 0;

let disconnectedGraceTimer = null;
let closing = false;

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
  if (userInput) userInput.disabled = !isReady;
  if (sendButton) sendButton.disabled = !isReady;

  updateStatus(msg || (isReady ? "Avatar ready" : "Avatar not ready…"));
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

  // support alternative shape { urls/Urls, username/Username, credential/Password }
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
        urls: turnUrls, // TURN only
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

  // Close avatar synthesizer first
  try {
    avatarSynthesizer?.close();
  } catch {}
  avatarSynthesizer = null;

  // Close PeerConnection (DO NOT touch senders/receivers)
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

    // reset to muted so autoplay works next time
    videoElement.muted = true;

    // stopping tracks from srcObject is safe
    try {
      oldStream?.getTracks?.().forEach(t => t.stop());
    } catch {}
  }

  if (placeholder) placeholder.style.display = "flex";

  // IMPORTANT:
  // Do NOT reset audioUnlocked
  // Do NOT stop pc senders/receivers manually
  // Do NOT null pc handlers

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

  // If avatar is already rendering, do NOT reconnect.
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

// ---------- Speech Config (fresh each session) ----------
async function setupSpeechConfigFresh() {
  const creds = await fetchJson("/api/speech/token");

  if (creds.token && creds.region) {
    speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(creds.token, creds.region);
  } else if (creds.key && creds.region) {
    speechConfig = SpeechSDK.SpeechConfig.fromSubscription(creds.key, creds.region);
  } else {
    throw new Error("Invalid /api/speech/token response (expected {token,region} or {key,region}).");
  }

  speechConfig.speechSynthesisVoiceName = "hi-IN-ArjunNeural";
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
        // attach stream (contains both audio + video)
        videoElement.srcObject = stream;

        videoElement.autoplay = true;
        videoElement.playsInline = true;

        // Keep muted initially for autoplay reliability.
        // If user already clicked, unlockAudioOnce() will unmute.
        videoElement.muted = !audioUnlocked;

        videoElement.classList.add("active");
        if (placeholder) placeholder.style.display = "none";

        try {
          await videoElement.play();
        } catch {
          // Expected if not yet unlocked by user gesture
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

    await setupSpeechConfigFresh();
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

function setupChatInterface() {
  if (!userInput || !sendButton) return;

  const sendMessage = async () => {
    if (!avatarReady) {
      updateStatus("Avatar not ready. Please wait…");
      return;
    }

    const message = userInput.value.trim();
    if (!message) return;

    addMessage(message, "user");
    userInput.value = "";
    updateStatus("Working...");

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });

      const data = await resp.json();
      if (data?.error) throw new Error(data.error);

      addMessage(data.response, "bot");
      updateStatus("Avatar speaking...");

      await new Promise((resolve, reject) => {
        avatarSynthesizer.speakTextAsync(
          data.response,
          (result) => {
            if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) resolve();
            else reject(new Error("Avatar speakTextAsync did not complete"));
          },
          (err) => reject(err)
        );
      });

      // ensure audio is unlocked once user starts interacting with chat
      unlockAudioOnce();

      updateStatus("Ready");
    } catch (e) {
      console.error("Chat error:", e);
      updateStatus(`Error: ${e.message || e}`);
      if (!avatarReady) scheduleReconnect("chat-error");
    } finally {
      userInput.focus();
    }
  };

  sendButton.addEventListener("click", sendMessage);
  userInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });
}

// ---------- Init ----------
async function init() {
  try {
    ensureSdkLoaded();
    setupChatInterface();
    setChatAvailability(false, "Initializing avatar...");
    setTimeout(() => {
      startNewAvatarSession("page-load");
    }, 700); // 500–800ms is ideal
    
  } catch (e) {
    console.error("Init failed:", e);
    setChatAvailability(false, `Avatar failed: ${e.message}`);
  }
}

init();

window.addEventListener("beforeunload", () => {
  try { closeSession(); } catch {}
});
