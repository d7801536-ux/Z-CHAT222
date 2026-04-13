import { auth, db, googleProvider, storage, firebaseInitError } from "./firebase.js";
import { getBotConfig, requestAiReply, scanClaimWithWikipedia } from "./ai.js";
import { createPaymentOrder, fetchPaymentHistory, getPlanMeta, openRazorpayCheckout } from "./payment.js";
import {
  QUIZ_BANK,
  applyTicMove,
  computeChallengeStats,
  createTicTacToeState,
  getDailyChallengeBlueprint,
  playRockPaperScissors
} from "./games.js";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  endAt,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAt,
  updateDoc,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getDownloadURL,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const ICE_CONFIG = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
  ],
  iceCandidatePoolSize: 10
};

const PRESENCE_DEBOUNCE_MS = 3000;
const CALL_TIMEOUT_MS = 45000;
const DISCONNECT_TIMEOUT_MS = 10000;
const AVATAR_COLORS = [
  "#5d7cff",
  "#33d6ff",
  "#27d18b",
  "#ff7b54",
  "#ef476f",
  "#9b5cff",
  "#00c2a8",
  "#ffc857",
  "#4f86ff",
  "#6c5ce7",
  "#ff6f91",
  "#12b886"
];

const TERMS_TEXT = `
Z CHAT TERMS OF SERVICE
Last updated: April 11, 2026

1. You must be at least 13 years old to use Z Chat.
2. Keep your account secure and do not share your password.
3. Do not abuse, harass, scam, or impersonate other users.
4. Messages, calls, and uploads must follow local law and platform rules.
5. Premium, billing, and AI services may have additional usage limits.
6. We may suspend abusive accounts to protect the service and other users.
7. You can delete your account from settings at any time.
8. Continued use means you accept future updates to these terms.
`;

const PRIVACY_TEXT = `
Z CHAT PRIVACY POLICY
Last updated: April 11, 2026

1. We store the minimum data needed to run chat, calling, and account services.
2. Your profile, conversation metadata, signaling data, and device preferences are stored in Firebase.
3. Camera, microphone, and screen permissions are only used when you start or accept a call.
4. Payment, AI, and third-party services must follow their own policies in addition to ours.
5. You can request data deletion by deleting your account.
6. We use reasonable safeguards, but no internet service can promise absolute security.
7. Contact the app owner before using Z Chat for sensitive legal, medical, or financial communication.
`;

const state = {
  authReady: false,
  initializing: true,
  initStarted: false,
  eventsBound: false,
  deferredModulesQueued: false,
  moduleStatus: {},
  activeSection: "chats",
  currentUser: null,
  profile: null,
  startupWatchdog: null,
  users: [],
  userMap: new Map(),
  conversations: [],
  activeConversationId: null,
  activeConversation: null,
  activePeerId: null,
  messages: [],
  replyMessageId: null,
  editingMessageId: null,
  friendships: [],
  friends: [],
  friendRequests: [],
  rooms: [],
  activeRoomId: null,
  activeRoom: null,
  roomMessages: [],
  aiBot: "coding",
  aiMessages: [],
  aiUsageToday: 0,
  paymentHistory: [],
  todayChallenge: null,
  ticTacToe: createTicTacToeState(),
  quizIndex: 0,
  selectedSignupPhoto: null,
  selectedMessageImage: null,
  selectedProfilePhoto: null,
  searchTerm: "",
  userSearchResults: [],
  userSearchTimer: null,
  userSearchSeq: 0,
  usernameCheckTimer: null,
  usernameCheckSeq: 0,
  typingTimer: null,
  presenceTimer: null,
  incomingCall: null,
  lastRingingCallId: null,
  devices: {
    audioinput: [],
    videoinput: [],
    audiooutput: []
  },
  preferences: {
    micId: "",
    cameraId: "",
    speakerId: "",
    lastSeen: "everyone",
    onlineStatus: true,
    readReceipts: true
  },
  unsubscribers: {
    profile: null,
    users: null,
    conversations: null,
    activeConversation: null,
    messages: null,
    incomingCalls: null,
    friendships: null,
    rooms: null,
    activeRoom: null,
    roomMessages: null,
    challenges: null
  },
  call: createEmptyCallState()
};

const dom = {};

function createEmptyCallState() {
  return {
    sessionId: null,
    type: null,
    direction: null,
    peerId: null,
    peerProfile: null,
    pc: null,
    localStream: null,
    remoteStream: null,
    screenStream: null,
    docRef: null,
    docUnsub: null,
    candidateUnsub: null,
    statsTimer: null,
    timer: null,
    timeout: null,
    disconnectTimer: null,
    connectedAt: null,
    isMuted: false,
    isCameraOff: false,
    isScreenSharing: false,
    localHangupInProgress: false,
    remoteCandidateIds: new Set()
  };
}

function byId(id) {
  return document.getElementById(id);
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function cacheDom() {
  [
    "offline-banner",
    "error-banner",
    "toast-stack",
    "splash-screen",
    "boot-progress",
    "boot-status",
    "boot-detail",
    "boot-retry-btn",
    "auth-screen",
    "show-signin-btn",
    "show-signup-btn",
    "signin-form",
    "signup-form",
    "signin-email",
    "signin-password",
    "signup-display-name",
    "signup-username",
    "signup-email",
    "signup-phone",
    "signup-password",
    "signup-confirm-password",
    "signup-bio",
    "signup-photo-preview",
    "select-signup-photo-btn",
    "signup-photo-input",
    "username-feedback",
    "legal-consent",
    "open-terms-link",
    "open-privacy-link",
    "auth-feedback",
    "forgot-password-btn",
    "google-signin-btn",
    "google-signup-btn",
    "signin-submit-btn",
    "signup-submit-btn",
    "app-view",
    "sidebar",
    "mobile-close-sidebar",
    "profile-button",
    "profile-avatar",
    "profile-name",
    "profile-meta",
    "user-search",
    "new-chat-btn",
    "settings-btn",
    "contact-list",
    "conversation-list",
    "logout-btn",
    "drawer-overlay",
    "mobile-open-sidebar",
    "chat-title",
    "workspace-kicker",
    "refresh-devices-btn",
    "nav-chats-btn",
    "nav-friends-btn",
    "nav-rooms-btn",
    "nav-ai-btn",
    "nav-games-btn",
    "nav-challenges-btn",
    "nav-premium-btn",
    "chat-panel",
    "empty-state",
    "chat-shell",
    "chat-peer-avatar",
    "chat-peer-name",
    "chat-peer-status",
    "reply-bar",
    "reply-preview-text",
    "cancel-reply-btn",
    "voice-call-btn",
    "video-call-btn",
    "message-feed",
    "typing-indicator",
    "composer-form",
    "message-input",
    "attach-image-btn",
    "image-upload-input",
    "send-message-btn",
    "friends-panel",
    "friend-requests-list",
    "friends-list-view",
    "rooms-panel",
    "create-room-btn",
    "create-group-room-btn",
    "create-gaming-room-btn",
    "create-study-room-btn",
    "rooms-list",
    "room-title",
    "room-meta",
    "room-actions",
    "rename-room-btn",
    "remove-room-member-btn",
    "room-members-list",
    "room-feed",
    "room-composer-form",
    "room-message-input",
    "add-room-member-btn",
    "room-send-btn",
    "ai-panel",
    "scanner-input",
    "scanner-run-btn",
    "scanner-results",
    "ai-bot-title",
    "ai-bot-list",
    "ai-chat-feed",
    "ai-composer-form",
    "ai-prompt-input",
    "ai-send-btn",
    "games-panel",
    "tic-board",
    "reset-tic-btn",
    "tic-status",
    "rps-result",
    "next-quiz-btn",
    "quiz-question",
    "quiz-options",
    "quiz-feedback",
    "challenges-panel",
    "streak-value",
    "challenge-points-value",
    "reward-badge-list",
    "refresh-challenges-btn",
    "challenge-list",
    "premium-panel",
    "plan-status-title",
    "plan-badge",
    "ai-usage-value",
    "locked-feature-list",
    "buy-moderate-btn",
    "buy-premium-btn",
    "refresh-payments-btn",
    "payment-history-list",
    "incoming-overlay",
    "incoming-avatar",
    "incoming-name",
    "incoming-type",
    "reject-call-btn",
    "accept-call-btn",
    "call-stage",
    "remote-video",
    "call-fallback",
    "call-avatar",
    "call-peer-name",
    "call-status-text",
    "call-kind-label",
    "call-title",
    "call-quality",
    "call-timer",
    "local-preview-wrap",
    "local-video",
    "screen-share-banner",
    "stop-sharing-btn",
    "toggle-mic-btn",
    "toggle-camera-btn",
    "share-screen-btn",
    "end-call-btn",
    "settings-modal",
    "close-settings-btn",
    "settings-display-name",
    "settings-username",
    "settings-bio",
    "settings-photo-preview",
    "change-photo-btn",
    "profile-photo-input",
    "theme-select",
    "mic-select",
    "camera-select",
    "speaker-select",
    "privacy-last-seen",
    "privacy-online-status",
    "privacy-read-receipts",
    "refresh-devices-inside-btn",
    "save-settings-btn",
    "user-profile-modal",
    "close-user-profile-btn",
    "user-profile-avatar",
    "user-profile-name",
    "user-profile-username",
    "user-profile-status",
    "user-profile-plan",
    "user-profile-message-btn",
    "user-profile-voice-btn",
    "user-profile-video-btn",
    "user-profile-add-btn",
    "legal-modal",
    "legal-title",
    "legal-content",
    "close-legal-btn",
    "mobile-bottom-nav",
    "mobile-nav-chats-btn",
    "mobile-nav-friends-btn",
    "mobile-nav-ai-btn",
    "mobile-nav-games-btn",
    "mobile-nav-premium-btn"
  ].forEach((id) => {
    dom[toCamel(id)] = byId(id);
  });
}

function setBootProgress(percent, message) {
  dom.bootProgress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  dom.bootStatus.textContent = message;
}

function startupLog(step, details, level = "info") {
  const method = console[level] || console.info;
  if (details !== undefined) {
    method.call(console, `[Z Chat] ${step}`, details);
  } else {
    method.call(console, `[Z Chat] ${step}`);
  }
}

function validateCriticalDom() {
  const requiredKeys = [
    "splashScreen",
    "bootProgress",
    "bootStatus",
    "authScreen",
    "appView",
    "showSigninBtn",
    "showSignupBtn",
    "signinForm",
    "signupForm",
    "toastStack"
  ];
  const missing = requiredKeys.filter((key) => !dom[key]);
  if (missing.length) {
    throw new Error(`Missing critical DOM elements: ${missing.join(", ")}`);
  }
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label || "Operation"} timed out.`));
      }, timeoutMs);
    })
  ]);
}

function getFirebaseErrorCode(error) {
  if (!error) {
    return "";
  }
  const code = typeof error.code === "string" ? error.code : "";
  return code.startsWith("auth/") || code.startsWith("firestore/") ? code.split("/")[1] : code;
}

function isRecoverableFirestoreError(error) {
  const code = getFirebaseErrorCode(error);
  const message = String(error?.message || "").toLowerCase();
  return [
    "unavailable",
    "cancelled",
    "deadline-exceeded",
    "failed-precondition",
    "permission-denied"
  ].includes(code) || message.includes("client is offline") || message.includes("offline");
}

function isStaticHostedBuild() {
  return /\.github\.io$/i.test(window.location.hostname);
}

function buildFallbackProfile(user) {
  const username = normalizeUsername(user?.displayName || user?.email?.split("@")[0] || "zchatuser");
  return {
    uid: user?.uid || "",
    email: user?.email || "",
    phone: user?.phoneNumber || "",
    username,
    usernameLower: username,
    displayName: user?.displayName || username || "Z Chat User",
    bio: "",
    photoURL: user?.photoURL || "",
    plan: "free",
    premium: false,
    badges: ["Newcomer"],
    challengeStats: {
      streak: 0,
      points: 0
    },
    isOnline: true,
    settings: {
      micId: "",
      cameraId: "",
      speakerId: "",
      lastSeen: "everyone",
      onlineStatus: true,
      readReceipts: true,
      theme: "aurora"
    }
  };
}

function renderSignedInShell() {
  renderProfileSummary();
  renderContacts();
  renderFriendPanels();
  renderConversationList();
  renderRooms();
  renderActiveConversationHeader();
  applyTheme(state.profile?.settings?.theme || "aurora");
  setActiveSection(state.activeSection || "chats");
}

function queueDeferredStartupModules() {
  if (state.deferredModulesQueued) {
    return;
  }

  state.deferredModulesQueued = true;

  window.setTimeout(async () => {
    await safeModuleInit("devices", async () => enumerateDevicesAndRefresh(), "Device list could not be refreshed during startup.");
    await safeModuleInit("games-tic", async () => renderTicTacToe());
    await safeModuleInit("games-quiz", async () => renderQuiz());
    await safeModuleInit("challenges-ui", async () => renderChallenges());
    await safeModuleInit("plan-summary", async () => renderPlanSummary());

    if (isStaticHostedBuild()) {
      startupLog("Skipping backend-only modules on static hosting");
      return;
    }

    await safeModuleInit("ai", async () => renderAiFeed());
    await safeModuleInit("payments", async () => loadPaymentHistory(), "Payments are unavailable right now.");
  }, 0);
}

async function safeModuleInit(name, initFn, warningMessage) {
  startupLog(`Init ${name}`);
  try {
    const result = await initFn();
    state.moduleStatus[name] = "ready";
    return result;
  } catch (error) {
    state.moduleStatus[name] = "failed";
    startupLog(`${name} module failed`, error, "warn");
    if (warningMessage) {
      showToast(warningMessage, "info");
    }
    return null;
  }
}

function showToast(message, tone = "info") {
  if (!message) {
    return;
  }

  const node = document.createElement("div");
  node.className = `toast ${tone}`;
  node.textContent = message;
  dom.toastStack.appendChild(node);
  window.setTimeout(() => {
    node.remove();
  }, 3200);
}

function showErrorBanner(message) {
  if (!message) {
    dom.errorBanner.classList.add("hidden");
    dom.errorBanner.textContent = "";
    return;
  }

  dom.errorBanner.textContent = message;
  dom.errorBanner.classList.remove("hidden");
  window.clearTimeout(showErrorBanner.timer);
  showErrorBanner.timer = window.setTimeout(() => {
    dom.errorBanner.classList.add("hidden");
  }, 5200);
}

function setAuthFeedback(message, tone = "info") {
  dom.authFeedback.textContent = message || "";
  dom.authFeedback.classList.toggle("error", tone === "error");
}

function setBusy(button, busy, labelWhenBusy) {
  if (!button) {
    return;
  }
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent;
  }
  button.disabled = busy;
  button.textContent = busy ? labelWhenBusy : button.dataset.defaultLabel;
}

function showScreen(target) {
  dom.splashScreen.hidden = target !== "splash";
  dom.authScreen.hidden = target !== "auth";
  dom.appView.hidden = target !== "app";
}

function showSplash(message, detail) {
  showScreen("splash");
  if (message) {
    setBootProgress(15, message);
  }
  if (dom.bootDetail) {
    dom.bootDetail.textContent = detail || "";
    dom.bootDetail.classList.toggle("hidden", !detail);
  }
  if (dom.bootRetryBtn) {
    dom.bootRetryBtn.classList.add("hidden");
  }
  showErrorBanner("");
}

function showLogin() {
  if (dom.bootRetryBtn) {
    dom.bootRetryBtn.classList.add("hidden");
  }
  if (dom.bootDetail) {
    dom.bootDetail.classList.add("hidden");
  }
  showScreen("auth");
}

function showApp() {
  if (dom.bootRetryBtn) {
    dom.bootRetryBtn.classList.add("hidden");
  }
  if (dom.bootDetail) {
    dom.bootDetail.classList.add("hidden");
  }
  showScreen("app");
}

function showStartupError(message, detail) {
  state.initializing = false;
  showScreen("splash");
  setBootProgress(100, message || "Startup failed.");
  if (dom.bootDetail) {
    dom.bootDetail.textContent = detail || "Please refresh the page or check your configuration.";
    dom.bootDetail.classList.remove("hidden");
  }
  if (dom.bootRetryBtn) {
    dom.bootRetryBtn.classList.remove("hidden");
  }
  showErrorBanner(message || "Startup failed.");
}

function installGlobalErrorHandlers() {
  window.onerror = function (_message, _source, _lineno, _colno, error) {
    startupLog("Global error", error || _message, "error");
    if (state.initializing) {
      showStartupError(
        "A fatal startup error occurred.",
        "Please refresh and review the console for the exact failing module."
      );
    } else {
      showErrorBanner("Something unexpected happened. Please refresh if the app stops responding.");
    }
    return false;
  };

  window.onunhandledrejection = function (event) {
    startupLog("Unhandled rejection", event?.reason, "error");
    if (state.initializing) {
      showStartupError(
        "A startup promise failed.",
        "Please refresh and check configuration or blocked network requests."
      );
    } else {
      showErrorBanner("A background task failed. Please try again.");
    }
  };
}

function openDialog(dialog) {
  if (!dialog) {
    return;
  }
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) {
      dialog.showModal();
    }
  } else {
    dialog.setAttribute("open", "open");
  }
}

function closeDialog(dialog) {
  if (!dialog) {
    return;
  }
  if (typeof dialog.close === "function") {
    if (dialog.open) {
      dialog.close();
    }
  } else {
    dialog.removeAttribute("open");
  }
}

function buildInitials(user) {
  const source = (user?.displayName || user?.username || user?.email || "Z Chat").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function hashColor(seed) {
  const value = String(seed || "z-chat");
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function decorateAvatar(element, user) {
  if (!element) {
    return;
  }
  if (user?.photoURL) {
    element.textContent = "";
    element.style.background = `center / cover no-repeat url(${user.photoURL})`;
    return;
  }
  element.textContent = buildInitials(user);
  element.style.background = `linear-gradient(135deg, ${hashColor(user?.uid || user?.username || user?.email)}, #121d33)`;
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
}

function validateUsername(value) {
  return /^[a-z0-9_]{3,20}$/.test(value);
}

function getFriendlyAuthError(error) {
  const code = error?.code || error?.message || "";
  const map = {
    "auth/invalid-email": "Please use a valid email address.",
    "auth/user-not-found": "No account was found with that email.",
    "auth/wrong-password": "The password is incorrect.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/email-already-in-use": "That email is already registered.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/popup-blocked": "Allow popups to continue with Google sign-in.",
    "auth/network-request-failed": "Network issue detected. Please check your connection.",
    "username-taken": "That username is already taken.",
    "legal-consent-required": "You must accept the Terms and Privacy Policy first."
  };
  return map[code] || "We could not complete that authentication request.";
}

function getFriendlyCallError(error, fallbackMessage) {
  const name = error?.name || "";
  if (name === "NotAllowedError") {
    return "Permission was denied. Please allow access and try again.";
  }
  if (name === "NotFoundError") {
    return "A required camera or microphone was not found on this device.";
  }
  if (name === "NotReadableError") {
    return "Your camera or microphone is already being used by another app.";
  }
  if (name === "SecurityError") {
    return "Calls require a secure localhost or HTTPS connection.";
  }
  return fallbackMessage || "The call could not be completed.";
}

function toMillis(value) {
  if (!value) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return 0;
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatTime(timestamp) {
  const value = toMillis(timestamp);
  if (!value) {
    return "now";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

function formatLastSeen(timestamp) {
  const value = toMillis(timestamp);
  if (!value) {
    return "Last seen recently";
  }
  const difference = Date.now() - value;
  const minutes = Math.max(1, Math.round(difference / 60000));
  if (minutes < 60) {
    return `Last seen ${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `Last seen ${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `Last seen ${days}d ago`;
}

function presenceLabel(user) {
  if (!user) {
    return "Offline";
  }
  const settings = user.settings || {};
  if (user.isOnline && settings.onlineStatus !== false) {
    return "Online";
  }
  const visibility = settings.lastSeen || "everyone";
  if (visibility === "nobody") {
    return "Last seen hidden";
  }
  return formatLastSeen(user.lastSeen);
}

function sortedPair(first, second) {
  return [first, second].sort((left, right) => left.localeCompare(right));
}

function conversationIdForUsers(first, second) {
  const [left, right] = sortedPair(first, second);
  return `direct_${left}_${right}`;
}

function getPeerIdFromConversation(conversation) {
  if (!conversation || !Array.isArray(conversation.members)) {
    return null;
  }
  return conversation.members.find((uid) => uid !== state.currentUser?.uid) || null;
}

function getUserFromCache(uid) {
  return state.userMap.get(uid) || null;
}

async function fetchUserProfile(uid) {
  if (!uid) {
    return null;
  }
  if (state.userMap.has(uid)) {
    return state.userMap.get(uid);
  }
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) {
    return null;
  }
  const profile = snapshot.data();
  state.userMap.set(uid, profile);
  return profile;
}

function autoResizeComposer() {
  dom.messageInput.style.height = "auto";
  dom.messageInput.style.height = `${Math.min(dom.messageInput.scrollHeight, 140)}px`;
}

function closeSidebar() {
  dom.sidebar.classList.remove("open");
  dom.drawerOverlay.hidden = true;
}

function openSidebar() {
  dom.sidebar.classList.add("open");
  dom.drawerOverlay.hidden = false;
}

function applyOfflineState() {
  dom.offlineBanner.classList.toggle("hidden", navigator.onLine);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentPlan() {
  return state.profile?.plan || "free";
}

function getAiLimitForPlan(plan) {
  if (plan === "premium") {
    return 999;
  }
  if (plan === "moderate") {
    return 20;
  }
  return 5;
}

function featureAllowed(feature) {
  const plan = getCurrentPlan();
  const rules = {
    screenShare: true,
    videoCall: true,
    aiFull: plan === "premium" || plan === "moderate",
    premiumRooms: plan === "premium",
    groupCreate: true,
    imageUpload: true
  };
  return rules[feature] ?? true;
}

function renderPlanSummary() {
  const plan = getCurrentPlan();
  const isPremium = plan === "premium";
  const titleMap = {
    free: "Free Plan",
    moderate: "Moderate Plan",
    premium: "Premium Plan"
  };
  const limit = getAiLimitForPlan(plan);
  const usage = state.aiUsageToday || 0;

  if (dom.planStatusTitle) {
    dom.planStatusTitle.textContent = titleMap[plan] || "Free Plan";
  }
  if (dom.planBadge) {
    dom.planBadge.textContent = plan.toUpperCase();
  }
  if (dom.aiUsageValue) {
    dom.aiUsageValue.textContent = `${usage} / ${limit === 999 ? "unlimited" : limit}`;
  }
  if (dom.lockedFeatureList) {
    const items = [];
    if (!isPremium) items.push("Premium unlocks the highest AI quota, gaming rooms, and advanced study tools.");
    dom.lockedFeatureList.innerHTML = items.length
      ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : "<li>All premium features are unlocked for your account.</li>";
  }
}

function applyTheme(themeId) {
  document.body.dataset.theme = themeId || "aurora";
}

function setActiveSection(section) {
  state.activeSection = section;
  const map = {
    chats: dom.chatPanel,
    friends: dom.friendsPanel,
    rooms: dom.roomsPanel,
    ai: dom.aiPanel,
    games: dom.gamesPanel,
    challenges: dom.challengesPanel,
    premium: dom.premiumPanel
  };

  Object.entries(map).forEach(([key, panel]) => {
    if (panel) {
      panel.classList.toggle("hidden", key !== section);
    }
  });

  const buttonMap = {
    chats: [dom.navChatsBtn, dom.mobileNavChatsBtn],
    friends: [dom.navFriendsBtn, dom.mobileNavFriendsBtn],
    rooms: [dom.navRoomsBtn],
    ai: [dom.navAiBtn, dom.mobileNavAiBtn],
    games: [dom.navGamesBtn, dom.mobileNavGamesBtn],
    challenges: [dom.navChallengesBtn],
    premium: [dom.navPremiumBtn, dom.mobileNavPremiumBtn]
  };

  Object.entries(buttonMap).forEach(([key, buttons]) => {
    buttons.filter(Boolean).forEach((button) => {
      button.classList.toggle("active", key === section);
    });
  });

  const kickerMap = {
    chats: "Conversation",
    friends: "Friends",
    rooms: "Rooms",
    ai: "Z AI",
    games: "Games",
    challenges: "Challenges",
    premium: "Premium"
  };
  if (dom.workspaceKicker) {
    dom.workspaceKicker.textContent = kickerMap[section] || "Workspace";
  }
  if (section !== "chats") {
    dom.chatTitle.textContent =
      section === "friends" ? "Friends and requests" :
        section === "rooms" ? "Groups, gaming, and study spaces" :
          section === "ai" ? "Scanner and assistant tools" :
            section === "games" ? "Mini games and gaming quick actions" :
              section === "challenges" ? "Daily goals and streaks" :
                "Plans and payments";
  } else {
    renderActiveConversationHeader();
  }

  if (section === "premium") {
    loadPaymentHistory().catch(() => {});
  } else if (section === "ai") {
    renderAiFeed();
  } else if (section === "games") {
    renderTicTacToe();
    renderQuiz();
  } else if (section === "challenges") {
    renderChallenges();
  } else if (section === "friends") {
    renderFriendPanels();
  } else if (section === "rooms") {
    renderRooms();
  }
}

function renderProfileSummary() {
  if (!state.profile) {
    return;
  }
  decorateAvatar(dom.profileAvatar, state.profile);
  dom.profileName.textContent = state.profile.displayName || state.profile.username || "Z Chat User";
  dom.profileMeta.textContent = `${state.profile.email || "Signed in"} - ${state.profile.plan || "free"}`;
  if (dom.settingsDisplayName) {
    dom.settingsDisplayName.value = state.profile.displayName || "";
  }
  if (dom.settingsUsername) {
    dom.settingsUsername.value = state.profile.username || "";
  }
  if (dom.settingsBio) {
    dom.settingsBio.value = state.profile.bio || "";
  }
  if (dom.themeSelect) {
    dom.themeSelect.value = state.profile?.settings?.theme || "aurora";
  }
  if (dom.settingsPhotoPreview) {
    decorateAvatar(dom.settingsPhotoPreview, state.profile);
  }
  renderPlanSummary();
}

function renderContacts() {
  const filterValue = normalizeUsername(state.searchTerm || "");
  const filteredUsers = getVisibleUserSearchResults();

  dom.contactList.innerHTML = "";
  if (!filteredUsers.length) {
    dom.contactList.innerHTML = `<div class="conversation-card"><div class="conversation-meta"><strong>${filterValue ? "No users found" : "No contacts"}</strong><span>${filterValue ? "Try another username or spelling." : "Try a different search."}</span></div></div>`;
    return;
  }

  filteredUsers.forEach((user) => {
    const button = document.createElement("div");
    button.className = "conversation-card";
    button.dataset.userId = user.uid;
    button.tabIndex = 0;
    const friendship = getFriendshipWithUser(user.uid);
    const friendStatus = friendship?.status || "none";
    button.innerHTML = `
      <div class="avatar"></div>
      <div class="conversation-meta">
        <strong>${escapeHtml(user.displayName || user.username || "Unknown")}</strong>
        <span>@${escapeHtml(user.username || "user")} - ${escapeHtml(presenceLabel(user))}</span>
        <div class="stack-item-actions">
          <button class="button secondary small contact-action-btn" data-action="profile" type="button">Profile</button>
          <button class="button secondary small contact-action-btn" data-action="chat" type="button">Chat</button>
          <button class="button secondary small contact-action-btn" data-action="voice" type="button">Voice</button>
          <button class="button secondary small contact-action-btn" data-action="video" type="button">Video</button>
          ${
            friendStatus === "accepted"
              ? '<button class="button secondary small contact-action-btn" data-action="friend" type="button">Friend</button>'
              : friendStatus === "pending" && friendship?.requesterId === state.currentUser?.uid
                ? '<button class="button secondary small contact-action-btn" data-action="cancel" type="button">Pending</button>'
                : friendStatus === "pending"
                  ? '<button class="button primary small contact-action-btn" data-action="accept" type="button">Accept</button>'
                  : '<button class="button primary small contact-action-btn" data-action="add" type="button">Add Friend</button>'
          }
        </div>
      </div>
    `;
    decorateAvatar(button.querySelector(".avatar"), user);
    button.querySelectorAll(".contact-action-btn").forEach((actionButton) => {
      actionButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const action = actionButton.dataset.action;
        if (action === "profile") {
          openUserProfileCard(user);
        } else if (action === "chat") {
          openConversationWithUser(user.uid);
        } else if (action === "voice") {
          setActiveSection("chats");
          openConversationWithUser(user.uid).then(() => startCall("audio"));
        } else if (action === "video") {
          setActiveSection("chats");
          openConversationWithUser(user.uid).then(() => startCall("video"));
        } else if (action === "add") {
          sendFriendRequest(user.uid);
        } else if (action === "accept" && friendship) {
          respondToFriendRequest(friendship.id, "accepted");
        } else if (action === "cancel" && friendship) {
          cancelFriendRequest(friendship.id);
        }
      });
    });
    button.addEventListener("click", () => openConversationWithUser(user.uid));
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openConversationWithUser(user.uid);
      }
    });
    dom.contactList.appendChild(button);
  });
}

function renderConversationList() {
  const filterValue = state.searchTerm.trim().toLowerCase();
  const conversations = state.conversations.filter((conversation) => {
    const peerId = getPeerIdFromConversation(conversation);
    const peer = getUserFromCache(peerId);
    const haystack = `${peer?.displayName || ""} ${peer?.username || ""} ${conversation.lastMessage?.text || ""}`.toLowerCase();
    return !filterValue || haystack.includes(filterValue);
  });

  dom.conversationList.innerHTML = "";
  if (!conversations.length) {
    dom.conversationList.innerHTML = '<div class="conversation-card"><div class="conversation-meta"><strong>No chats yet</strong><span>Start one from the contacts list.</span></div></div>';
    return;
  }

  conversations.forEach((conversation) => {
    const peerId = getPeerIdFromConversation(conversation);
    const peer = getUserFromCache(peerId);
    const lastMessageAt = toMillis(conversation.lastMessage?.createdAt);
    const myReadAt = Number(conversation.readBy?.[state.currentUser?.uid] || 0);
    const isUnread = lastMessageAt > 0 && lastMessageAt > myReadAt && conversation.lastMessage?.senderId !== state.currentUser?.uid;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `conversation-card ${conversation.id === state.activeConversationId ? "active" : ""}`;
    button.dataset.conversationId = conversation.id;
    button.innerHTML = `
      <div class="avatar"></div>
      <div class="conversation-meta">
        <strong>${escapeHtml(peer?.displayName || peer?.username || "Unknown")}</strong>
        <span>${escapeHtml(conversation.lastMessage?.text || "No messages yet")}</span>
      </div>
      ${isUnread ? '<span class="scanner-badge unverified">New</span>' : ""}
    `;
    decorateAvatar(button.querySelector(".avatar"), peer || { uid: peerId || conversation.id, displayName: "U" });
    button.addEventListener("click", () => activateConversation(conversation.id));
    dom.conversationList.appendChild(button);
  });
}

function friendshipIdForUsers(first, second) {
  const [left, right] = sortedPair(first, second);
  return `friend_${left}_${right}`;
}

function getFriendshipWithUser(userId) {
  return state.friendships.find((item) => item.members?.includes(userId)) || null;
}

function mergeUniqueUsers(...groups) {
  const bucket = new Map();
  groups.flat().filter(Boolean).forEach((user) => {
    if (!user?.uid) {
      return;
    }
    bucket.set(user.uid, {
      ...(bucket.get(user.uid) || {}),
      ...user
    });
  });
  return [...bucket.values()];
}

function getVisibleUserSearchResults() {
  const filterValue = normalizeUsername(state.searchTerm || "");
  if (!filterValue) {
    return state.users.filter((user) => user.uid !== state.currentUser?.uid);
  }

  const localMatches = state.users.filter((user) => {
    if (user.uid === state.currentUser?.uid) {
      return false;
    }
    const username = normalizeUsername(user.username || "");
    const fullName = String(user.displayName || user.fullName || "").toLowerCase();
    return username.includes(filterValue) || fullName.includes(filterValue);
  });

  const remoteMatches = state.userSearchResults.filter((user) => user.uid !== state.currentUser?.uid);
  return mergeUniqueUsers(remoteMatches, localMatches);
}

async function findUserByUsername(rawUsername) {
  const username = normalizeUsername(rawUsername);
  if (!username) {
    return null;
  }

  const usernameSnapshot = await getDoc(doc(db, "usernames", username));
  const userId = usernameSnapshot.data()?.uid;
  if (!userId) {
    return null;
  }

  const userSnapshot = await getDoc(doc(db, "users", userId));
  if (!userSnapshot.exists()) {
    return null;
  }

  return {
    uid: userSnapshot.id,
    ...userSnapshot.data()
  };
}

async function runUserSearch(rawValue) {
  const term = normalizeUsername(rawValue);
  if (!term) {
    state.userSearchResults = [];
    renderContacts();
    renderConversationList();
    return;
  }

  const searchSeq = ++state.userSearchSeq;
  const localMatches = state.users.filter((user) => normalizeUsername(user.username || "").includes(term));

  try {
    const remoteQuery = query(
      collection(db, "users"),
      orderBy("usernameLower"),
      startAt(term),
      endAt(`${term}\uf8ff`),
      limit(12)
    );
    const snapshot = await getDocs(remoteQuery);
    if (searchSeq !== state.userSearchSeq) {
      return;
    }
    const remoteMatches = snapshot.docs.map((item) => ({
      uid: item.id,
      ...item.data()
    }));
    state.userSearchResults = mergeUniqueUsers(remoteMatches, localMatches)
      .filter((user) => user.uid !== state.currentUser?.uid)
      .sort((left, right) => {
        const leftUsername = normalizeUsername(left.username || "");
        const rightUsername = normalizeUsername(right.username || "");
        const leftExact = leftUsername === term ? 1 : 0;
        const rightExact = rightUsername === term ? 1 : 0;
        if (leftExact !== rightExact) {
          return rightExact - leftExact;
        }
        const leftStarts = leftUsername.startsWith(term) ? 1 : 0;
        const rightStarts = rightUsername.startsWith(term) ? 1 : 0;
        if (leftStarts !== rightStarts) {
          return rightStarts - leftStarts;
        }
        const leftOnline = left.isOnline ? 1 : 0;
        const rightOnline = right.isOnline ? 1 : 0;
        if (leftOnline !== rightOnline) {
          return rightOnline - leftOnline;
        }
        return leftUsername.localeCompare(rightUsername);
      })
      .slice(0, 20);
  } catch (error) {
    startupLog("User search query failed", error, "warn");
    if (searchSeq !== state.userSearchSeq) {
      return;
    }
    state.userSearchResults = localMatches.filter((user) => user.uid !== state.currentUser?.uid).slice(0, 20);
  }

  renderContacts();
  renderConversationList();
}

function openUserProfileCard(user) {
  if (!user || !dom.userProfileModal) {
    return;
  }
  const friendship = getFriendshipWithUser(user.uid);

  dom.userProfileName.textContent = user.displayName || user.fullName || user.username || "Z Chat User";
  dom.userProfileUsername.textContent = `@${user.username || "user"}`;
  dom.userProfileStatus.textContent = presenceLabel(user);
  dom.userProfilePlan.textContent = (user.plan || "free").toUpperCase();
  decorateAvatar(dom.userProfileAvatar, user);

  dom.userProfileMessageBtn.onclick = () => {
    closeDialog(dom.userProfileModal);
    openConversationWithUser(user.uid);
  };
  dom.userProfileVoiceBtn.onclick = () => {
    closeDialog(dom.userProfileModal);
    openConversationWithUser(user.uid).then(() => startCall("audio"));
  };
  dom.userProfileVideoBtn.onclick = () => {
    closeDialog(dom.userProfileModal);
    openConversationWithUser(user.uid).then(() => startCall("video"));
  };
  dom.userProfileAddBtn.onclick = () => {
    closeDialog(dom.userProfileModal);
    sendFriendRequest(user.uid);
  };
  dom.userProfileAddBtn.disabled = friendship?.status === "accepted" || friendship?.status === "pending";
  dom.userProfileAddBtn.textContent =
    friendship?.status === "accepted"
      ? "Friend"
      : friendship?.status === "pending"
        ? "Pending"
        : "Add Friend";

  openDialog(dom.userProfileModal);
}

function renderFriendPanels() {
  if (!dom.friendsListView || !dom.friendRequestsList) {
    return;
  }

  dom.friendRequestsList.innerHTML = "";
  dom.friendsListView.innerHTML = "";

  const incoming = state.friendRequests.filter((item) => item.recipientId === state.currentUser?.uid);
  const outgoing = state.friendRequests.filter((item) => item.requesterId === state.currentUser?.uid);

  if (!incoming.length && !outgoing.length) {
    dom.friendRequestsList.innerHTML = '<div class="stack-item"><strong>No pending requests</strong><span>Send requests from the user list in the sidebar.</span></div>';
  } else {
    [...incoming, ...outgoing].forEach((item) => {
      const otherId = item.requesterId === state.currentUser?.uid ? item.recipientId : item.requesterId;
      const otherUser = getUserFromCache(otherId);
      const node = document.createElement("div");
      node.className = "stack-item";
      node.innerHTML = `
        <div class="stack-item-head">
          <strong>${escapeHtml(otherUser?.displayName || otherUser?.username || "Unknown")}</strong>
          <span>${item.requesterId === state.currentUser?.uid ? "Sent" : "Incoming"}</span>
        </div>
        <div class="stack-item-actions"></div>
      `;
      const actions = node.querySelector(".stack-item-actions");
      if (item.recipientId === state.currentUser?.uid) {
        const accept = createActionButton("Accept", "primary", () => respondToFriendRequest(item.id, "accepted"));
        const reject = createActionButton("Reject", "secondary", () => respondToFriendRequest(item.id, "rejected"));
        actions.append(accept, reject);
      } else {
        actions.append(createActionButton("Cancel", "secondary", () => cancelFriendRequest(item.id)));
      }
      dom.friendRequestsList.appendChild(node);
    });
  }

  if (!state.friends.length) {
    dom.friendsListView.innerHTML = '<div class="stack-item"><strong>No friends yet</strong><span>Send requests from the contacts list to build your network.</span></div>';
    return;
  }

  state.friends.forEach((friend) => {
    const node = document.createElement("div");
    node.className = "stack-item";
    node.innerHTML = `
      <div class="stack-item-head">
        <strong>${escapeHtml(friend.displayName || friend.username || "Friend")}</strong>
        <span>${escapeHtml(presenceLabel(friend))}</span>
      </div>
      <div class="stack-item-actions"></div>
    `;
    const actions = node.querySelector(".stack-item-actions");
    actions.append(
      createActionButton("Chat", "primary", () => openConversationWithUser(friend.uid)),
      createActionButton("Call", "secondary", () => {
        setActiveSection("chats");
        openConversationWithUser(friend.uid).then(() => startCall("audio"));
      }),
      createActionButton("Remove", "secondary", () => removeFriend(friend.uid))
    );
    dom.friendsListView.appendChild(node);
  });
}

function createActionButton(label, tone, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button ${tone} small`;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function canManageRoom(room = state.activeRoom) {
  if (!room || !state.currentUser) {
    return false;
  }
  return room.ownerId === state.currentUser.uid || Array.isArray(room.adminIds) && room.adminIds.includes(state.currentUser.uid);
}

async function sendFriendRequest(userId) {
  if (!state.currentUser || !userId || userId === state.currentUser.uid) {
    return;
  }
  const friendshipId = friendshipIdForUsers(state.currentUser.uid, userId);
  await setDoc(doc(db, "friendships", friendshipId), {
    id: friendshipId,
    members: sortedPair(state.currentUser.uid, userId),
    requesterId: state.currentUser.uid,
    recipientId: userId,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true }).catch(() => {
    showToast("Friend request could not be sent.", "error");
  });
}

async function respondToFriendRequest(friendshipId, status) {
  await updateDoc(doc(db, "friendships", friendshipId), {
    status,
    updatedAt: serverTimestamp()
  }).catch(() => {
    showToast("Friend request update failed.", "error");
  });
}

async function cancelFriendRequest(friendshipId) {
  await updateDoc(doc(db, "friendships", friendshipId), {
    status: "cancelled",
    updatedAt: serverTimestamp()
  }).catch(() => {
    showToast("Friend request could not be cancelled.", "error");
  });
}

async function removeFriend(userId) {
  const friendship = getFriendshipWithUser(userId);
  if (!friendship) {
    return;
  }
  await updateDoc(doc(db, "friendships", friendship.id), {
    status: "removed",
    updatedAt: serverTimestamp()
  }).catch(() => {
    showToast("Friend could not be removed.", "error");
  });
}

function getMessagePreview(message) {
  if (!message) {
    return "";
  }
  if (message.deleted) {
    return "[Message deleted]";
  }
  if (message.type === "image") {
    return message.text ? `Image: ${message.text}` : "Image";
  }
  return message.text || "";
}

function updateComposerModeUi() {
  if (!dom.replyBar || !dom.replyPreviewText || !dom.messageInput) {
    return;
  }

  const trackedId = state.editingMessageId || state.replyMessageId;
  const trackedMessage = state.messages.find((message) => message.id === trackedId);
  if (!trackedMessage) {
    state.replyMessageId = null;
    state.editingMessageId = null;
    dom.replyBar.classList.add("hidden");
    dom.replyPreviewText.textContent = "";
    dom.messageInput.placeholder = "Type a message";
    return;
  }

  if (state.editingMessageId) {
    dom.replyPreviewText.textContent = `Editing: ${getMessagePreview(trackedMessage).slice(0, 120) || "message"}`;
    dom.messageInput.placeholder = "Edit your message";
  } else {
    dom.replyPreviewText.textContent = `Replying to: ${getMessagePreview(trackedMessage).slice(0, 120) || "message"}`;
    dom.messageInput.placeholder = "Type a reply";
  }

  dom.replyBar.classList.remove("hidden");
}

function clearComposerMode(clearInput = false) {
  state.replyMessageId = null;
  state.editingMessageId = null;
  if (clearInput && dom.messageInput) {
    dom.messageInput.value = "";
    autoResizeComposer();
  }
  updateComposerModeUi();
}

function startReplyToMessage(messageId) {
  state.editingMessageId = null;
  state.replyMessageId = messageId;
  updateComposerModeUi();
  dom.messageInput?.focus();
}

function startEditMessage(messageId) {
  const message = state.messages.find((entry) => entry.id === messageId && entry.senderId === state.currentUser?.uid && !entry.deleted);
  if (!message) {
    showToast("That message can no longer be edited.", "info");
    return;
  }
  state.replyMessageId = null;
  state.editingMessageId = messageId;
  dom.messageInput.value = message.text || "";
  autoResizeComposer();
  updateComposerModeUi();
  dom.messageInput.focus();
}

async function softDeleteMessage(messageId) {
  if (!state.activeConversationId) {
    return;
  }
  const message = state.messages.find((entry) => entry.id === messageId);
  if (!message || message.senderId !== state.currentUser?.uid) {
    showToast("You can only delete your own messages.", "info");
    return;
  }

  await updateDoc(doc(db, "conversations", state.activeConversationId, "messages", messageId), {
    text: "[Message deleted]",
    deleted: true,
    editedAt: serverTimestamp(),
    replyToId: deleteField(),
    replyToText: deleteField(),
    imageUrl: deleteField()
  }).catch(() => {
    showToast("Message could not be deleted.", "error");
  });
}

async function markConversationRead(conversationId = state.activeConversationId) {
  if (!conversationId || !state.currentUser) {
    return;
  }
  await updateDoc(doc(db, "conversations", conversationId), {
    [`readBy.${state.currentUser.uid}`]: Date.now(),
    updatedAt: serverTimestamp()
  }).catch(() => {});
}

function renderMessages() {
  const shouldStickToBottom = dom.messageFeed.scrollHeight - dom.messageFeed.scrollTop - dom.messageFeed.clientHeight < 80;
  dom.messageFeed.innerHTML = "";

  if (!state.messages.length) {
    dom.messageFeed.innerHTML = '<div class="conversation-card"><div class="conversation-meta"><strong>No messages yet</strong><span>Say hello to begin the chat.</span></div></div>';
    return;
  }

  state.messages.forEach((message) => {
    const mine = message.senderId === state.currentUser?.uid;
    const row = document.createElement("article");
    row.className = `message ${mine ? "mine" : ""}`;
    const replyMarkup = message.replyToText
      ? `<div class="message-reply">${escapeHtml(message.replyToText)}</div>`
      : "";
    const bubbleContent = message.type === "image" && message.imageUrl
      ? `${replyMarkup}<img src="${escapeHtml(message.imageUrl)}" alt="Shared image"><div>${escapeHtml(message.text || "")}</div>`
      : `${replyMarkup}<div>${escapeHtml(getMessagePreview(message))}</div>`;
    const peerReadAt = Number(state.activeConversation?.readBy?.[state.activePeerId] || 0);
    const deliveryLabel = mine && toMillis(message.createdAt) > 0 && peerReadAt >= toMillis(message.createdAt) ? "Seen" : mine ? "Sent" : "";
    row.innerHTML = `
      <div class="message-bubble">${bubbleContent}</div>
      <div class="message-meta">
        <span>${escapeHtml(formatTime(message.createdAt))}</span>
        <span>${mine ? "You" : escapeHtml(getUserFromCache(message.senderId)?.displayName || "Peer")}</span>
        ${deliveryLabel ? `<span>${escapeHtml(deliveryLabel)}</span>` : ""}
      </div>
      <div class="message-actions">
        <button class="button secondary small message-action-btn" data-action="reply" data-message-id="${escapeHtml(message.id)}" type="button">Reply</button>
        ${mine && !message.deleted ? `<button class="button secondary small message-action-btn" data-action="edit" data-message-id="${escapeHtml(message.id)}" type="button">Edit</button>` : ""}
        ${mine ? `<button class="button secondary small message-action-btn" data-action="delete" data-message-id="${escapeHtml(message.id)}" type="button">Delete</button>` : ""}
      </div>
    `;
    row.querySelectorAll(".message-action-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        const messageId = button.dataset.messageId;
        if (action === "reply") {
          startReplyToMessage(messageId);
        } else if (action === "edit") {
          startEditMessage(messageId);
        } else if (action === "delete") {
          softDeleteMessage(messageId).catch(() => {});
        }
      });
    });
    dom.messageFeed.appendChild(row);
  });

  updateComposerModeUi();

  if (shouldStickToBottom) {
    dom.messageFeed.scrollTop = dom.messageFeed.scrollHeight;
  }
}

function renderTypingIndicator() {
  if (!state.activeConversation || !state.activePeerId) {
    dom.typingIndicator.classList.add("hidden");
    return;
  }

  const typingMap = state.activeConversation.typing || {};
  const peerTimestamp = Number(typingMap[state.activePeerId] || 0);
  const isTyping = peerTimestamp > 0 && Date.now() - peerTimestamp < 5500;
  if (!isTyping) {
    dom.typingIndicator.classList.add("hidden");
    return;
  }

  const peer = getUserFromCache(state.activePeerId);
  dom.typingIndicator.textContent = `${peer?.displayName || peer?.username || "Someone"} is typing...`;
  dom.typingIndicator.classList.remove("hidden");
}

function renderActiveConversationHeader() {
  const peer = getUserFromCache(state.activePeerId);
  const title = peer?.displayName || peer?.username || "Select a chat";
  dom.chatTitle.textContent = title;
  dom.chatPeerName.textContent = title;
  dom.chatPeerStatus.textContent = presenceLabel(peer);
  decorateAvatar(dom.chatPeerAvatar, peer || { uid: state.activePeerId || "chat", displayName: "U" });
  dom.voiceCallBtn.disabled = !state.activePeerId || Boolean(state.call.sessionId);
  dom.videoCallBtn.disabled = !state.activePeerId || Boolean(state.call.sessionId);
}

function showConversationShell(visible) {
  dom.emptyState.classList.toggle("hidden", visible);
  dom.chatShell.classList.toggle("hidden", !visible);
}

async function ensureConversationForPeer(peerId) {
  const conversationId = conversationIdForUsers(state.currentUser.uid, peerId);
  const conversationRef = doc(db, "conversations", conversationId);
  const existing = await getDoc(conversationRef);
  if (!existing.exists()) {
    await setDoc(conversationRef, {
      id: conversationId,
      type: "direct",
      members: sortedPair(state.currentUser.uid, peerId),
      typing: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: {
        text: "",
        senderId: state.currentUser.uid,
        createdAt: serverTimestamp()
      }
    });
  }
  return conversationId;
}

async function openConversationWithUser(peerId) {
  try {
    const conversationId = await ensureConversationForPeer(peerId);
    await activateConversation(conversationId);
    closeSidebar();
  } catch (_error) {
    showErrorBanner("We could not open that conversation just now.");
  }
}

function clearActiveConversationSubscriptions() {
  if (typeof state.unsubscribers.activeConversation === "function") {
    state.unsubscribers.activeConversation();
  }
  if (typeof state.unsubscribers.messages === "function") {
    state.unsubscribers.messages();
  }
  state.unsubscribers.activeConversation = null;
  state.unsubscribers.messages = null;
}

async function activateConversation(conversationId) {
  if (!conversationId) {
    return;
  }

  if (state.activeConversationId === conversationId) {
    renderActiveConversationHeader();
    showConversationShell(true);
    markConversationRead(conversationId).catch(() => {});
    return;
  }

  clearActiveConversationSubscriptions();
  state.activeConversationId = conversationId;
  state.messages = [];
  clearComposerMode(true);
  const conversationRef = doc(db, "conversations", conversationId);

  state.unsubscribers.activeConversation = onSnapshot(
    conversationRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        state.activeConversation = null;
        state.activePeerId = null;
        showConversationShell(false);
        renderConversationList();
        return;
      }

      state.activeConversation = { id: snapshot.id, ...snapshot.data() };
      state.activePeerId = getPeerIdFromConversation(state.activeConversation);
      renderActiveConversationHeader();
      renderTypingIndicator();
      showConversationShell(true);
      markConversationRead(conversationId).catch(() => {});
    },
    () => {
      showErrorBanner("The selected conversation could not be loaded.");
    }
  );

  const messagesRef = query(
    collection(db, "conversations", conversationId, "messages"),
    orderBy("createdAt", "asc"),
    limit(200)
  );

  state.unsubscribers.messages = onSnapshot(
    messagesRef,
    (snapshot) => {
      state.messages = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));
      renderMessages();
    },
    () => {
      showErrorBanner("Messages could not be loaded for this chat.");
    }
  );
}

async function handleSendMessage(event) {
  event.preventDefault();
  if (state.selectedMessageImage) {
    await sendImageMessage();
    return;
  }

  const text = dom.messageInput.value.trim();
  if (!text || !state.activeConversationId) {
    return;
  }

  const conversationId = state.activeConversationId;
  dom.sendMessageBtn.disabled = true;
  try {
    const replyMessage = state.messages.find((message) => message.id === state.replyMessageId);
    const replyPayload = replyMessage
      ? {
          replyToId: replyMessage.id,
          replyToText: getMessagePreview(replyMessage).slice(0, 160)
        }
      : {};

    if (state.editingMessageId) {
      await updateDoc(doc(db, "conversations", conversationId, "messages", state.editingMessageId), {
        text,
        editedAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, "conversations", conversationId, "messages"), {
        text,
        senderId: state.currentUser.uid,
        createdAt: serverTimestamp(),
        type: "text",
        deleted: false,
        ...replyPayload
      });
    }

    await updateDoc(doc(db, "conversations", conversationId), {
      lastMessage: {
        text: state.editingMessageId ? `Edited: ${text}` : text,
        senderId: state.currentUser.uid,
        createdAt: serverTimestamp()
      },
      updatedAt: serverTimestamp(),
      [`readBy.${state.currentUser.uid}`]: Date.now(),
      [`typing.${state.currentUser.uid}`]: deleteField()
    });

    clearComposerMode(true);
    await incrementChallengeMetric("messagesSent", 1);
  } catch (_error) {
    showToast("Message failed to send. Please try again.", "error");
  } finally {
    dom.sendMessageBtn.disabled = false;
  }
}

async function updateTypingPresence() {
  if (!state.activeConversationId || !state.currentUser) {
    return;
  }

  const trimmed = dom.messageInput.value.trim();
  const conversationRef = doc(db, "conversations", state.activeConversationId);
  if (!trimmed) {
    try {
      await updateDoc(conversationRef, {
        [`typing.${state.currentUser.uid}`]: deleteField()
      });
    } catch (_error) {
      return;
    }
    return;
  }

  try {
    await updateDoc(conversationRef, {
      [`typing.${state.currentUser.uid}`]: Date.now()
    });
  } catch (_error) {
    return;
  }

  window.clearTimeout(state.typingTimer);
  state.typingTimer = window.setTimeout(async () => {
    if (!state.activeConversationId || !state.currentUser) {
      return;
    }
    try {
      await updateDoc(doc(db, "conversations", state.activeConversationId), {
        [`typing.${state.currentUser.uid}`]: deleteField()
      });
    } catch (_error) {
      return;
    }
  }, 3500);
}

async function checkUsernameAvailability(rawValue, allowCurrentUser = false) {
  const username = normalizeUsername(rawValue);
  if (!validateUsername(username)) {
    return {
      ok: false,
      username,
      message: "Use 3-20 letters, numbers, or underscore."
    };
  }

  const usernameRef = doc(db, "usernames", username);
  const snapshot = await getDoc(usernameRef);
  if (!snapshot.exists()) {
    return {
      ok: true,
      username,
      message: `@${username} is available.`
    };
  }

  const ownerId = snapshot.data()?.uid;
  if (allowCurrentUser && ownerId === state.currentUser?.uid) {
    return {
      ok: true,
      username,
      message: `@${username} is already yours.`
    };
  }

  return {
    ok: false,
    username,
    message: `@${username} is already taken.`
  };
}

async function handleUsernameInput() {
  const seq = ++state.usernameCheckSeq;
  const rawValue = dom.signupUsername.value;
  const normalized = normalizeUsername(rawValue);
  dom.signupUsername.value = rawValue.replace(/[^a-zA-Z0-9_]/g, "");

  if (!normalized) {
    dom.usernameFeedback.textContent = "3-20 characters, letters, numbers, underscore.";
    dom.usernameFeedback.classList.remove("error");
    return;
  }

  dom.usernameFeedback.textContent = "Checking username...";
  window.clearTimeout(state.usernameCheckTimer);
  state.usernameCheckTimer = window.setTimeout(async () => {
    try {
      const result = await checkUsernameAvailability(normalized);
      if (seq !== state.usernameCheckSeq) {
        return;
      }
      dom.usernameFeedback.textContent = result.message;
      dom.usernameFeedback.classList.toggle("error", !result.ok);
    } catch (_error) {
      if (seq !== state.usernameCheckSeq) {
        return;
      }
      dom.usernameFeedback.textContent = "Could not check username right now.";
      dom.usernameFeedback.classList.add("error");
    }
  }, 500);
}

async function reserveUserProfile(user, profileInput) {
  const username = normalizeUsername(profileInput.username);
  const usernameRef = doc(db, "usernames", username);
  const userRef = doc(db, "users", user.uid);

  await runTransaction(db, async (transaction) => {
    const usernameSnap = await transaction.get(usernameRef);
    if (usernameSnap.exists() && usernameSnap.data()?.uid !== user.uid) {
      const conflict = new Error("Username is already taken.");
      conflict.message = "username-taken";
      throw conflict;
    }

    const nowProfile = {
      uid: user.uid,
      email: user.email || profileInput.email || "",
      phone: profileInput.phone || "",
      username,
      usernameLower: username,
      displayName: profileInput.displayName || user.displayName || username,
      bio: profileInput.bio || "",
      photoURL: profileInput.photoURL || user.photoURL || "",
      plan: "free",
      premium: false,
      badges: ["Newcomer"],
      challengeStats: {
        streak: 0,
        points: 0
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      isOnline: true,
      settings: {
        micId: "",
        cameraId: "",
        speakerId: "",
        lastSeen: "everyone",
        onlineStatus: true,
        readReceipts: true,
        theme: "aurora"
      }
    };

    transaction.set(userRef, nowProfile, { merge: true });
    transaction.set(usernameRef, {
      uid: user.uid,
      username,
      updatedAt: serverTimestamp()
    });
  });
}

async function generateAvailableUsername(seed) {
  const base = normalizeUsername(seed) || "zchatuser";
  for (let index = 0; index < 20; index += 1) {
    const candidate =
      index === 0
        ? base.slice(0, 20)
        : `${base.slice(0, 16)}${String(Math.floor(Math.random() * 9000) + 1000)}`.slice(0, 20);
    const snapshot = await getDoc(doc(db, "usernames", candidate));
    if (!snapshot.exists()) {
      return candidate;
    }
  }
  return `${base.slice(0, 12)}${Date.now().toString().slice(-6)}`.slice(0, 20);
}

async function ensureUserDocument(user) {
  const userRef = doc(db, "users", user.uid);
  let snapshot;
  try {
    snapshot = await withTimeout(getDoc(userRef), 2500, "Profile lookup");
  } catch (error) {
    if (isRecoverableFirestoreError(error)) {
      startupLog("Profile lookup deferred", error, "warn");
      state.profile = state.profile || buildFallbackProfile(user);
      return state.profile;
    }
    throw error;
  }
  if (snapshot.exists()) {
    const profile = snapshot.data();
    const nextUsername = normalizeUsername(profile.username || user.displayName || user.email?.split("@")[0] || "zchatuser");
    const profileUpdates = {
      displayName: user.displayName || profile.displayName || profile.username || "Z Chat User",
      email: user.email || profile.email || "",
      photoURL: user.photoURL || profile.photoURL || "",
      updatedAt: serverTimestamp(),
      isOnline: true,
      lastSeen: serverTimestamp()
    };

    if (!profile.username && nextUsername) {
      profileUpdates.username = nextUsername;
      profileUpdates.usernameLower = nextUsername;
    } else if (profile.username && !profile.usernameLower) {
      profileUpdates.usernameLower = normalizeUsername(profile.username);
    }

    if (!profile.settings) {
      profileUpdates.settings = {
        micId: "",
        cameraId: "",
        speakerId: "",
        lastSeen: "everyone",
        onlineStatus: true,
        readReceipts: true,
        theme: "aurora"
      };
    }

    state.profile = profile;
    state.preferences = {
      ...state.preferences,
      ...(profile.settings || {})
    };

    await withTimeout(updateDoc(userRef, profileUpdates).catch(() => {}), 2000, "Profile update").catch(() => {});

    if (nextUsername) {
      await withTimeout(setDoc(doc(db, "usernames", nextUsername), {
        uid: user.uid,
        username: nextUsername,
        updatedAt: serverTimestamp()
      }, { merge: true }).catch(() => {}), 2000, "Username sync").catch(() => {});
    }
    return profile;
  }

  const fallbackName = user.displayName || user.email?.split("@")[0] || "zchatuser";
  try {
    const username = await withTimeout(generateAvailableUsername(fallbackName), 2500, "Username generation");
    await withTimeout(reserveUserProfile(user, {
      username,
      displayName: user.displayName || fallbackName,
      bio: "",
      email: user.email || ""
    }), 3000, "Profile reservation");
    state.profile = state.profile || buildFallbackProfile(user);
    state.profile.username = username;
    state.profile.usernameLower = username;
    return state.profile;
  } catch (error) {
    if (isRecoverableFirestoreError(error)) {
      startupLog("Profile reservation deferred", error, "warn");
      state.profile = state.profile || buildFallbackProfile(user);
      return state.profile;
    }
    throw error;
  }
}

async function handleSignup(event) {
  event.preventDefault();
  setAuthFeedback("");
  const displayName = dom.signupDisplayName.value.trim();
  const usernameInput = dom.signupUsername.value.trim();
  const email = dom.signupEmail.value.trim();
  const phone = dom.signupPhone.value.trim();
  const password = dom.signupPassword.value;
  const confirmPassword = dom.signupConfirmPassword.value;
  const bio = dom.signupBio.value.trim();

  if (!dom.legalConsent.checked) {
    setAuthFeedback(getFriendlyAuthError({ message: "legal-consent-required" }), "error");
    return;
  }

  if (!/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password) || password.length < 8) {
    setAuthFeedback("Password must be at least 8 characters and include an uppercase letter, number, and special character.", "error");
    return;
  }

  if (password !== confirmPassword) {
    setAuthFeedback("Confirm password does not match.", "error");
    return;
  }

  if (phone && !/^\+?91[\s-]?\d{10}$|^\d{10}$/.test(phone.replace(/\s+/g, ""))) {
    setAuthFeedback("Use a valid Indian phone number, for example +91 9876543210.", "error");
    return;
  }

  const usernameCheck = await checkUsernameAvailability(usernameInput);
  if (!usernameCheck.ok) {
    setAuthFeedback(usernameCheck.message, "error");
    return;
  }

  setBusy(dom.signupSubmitBtn, true, "Creating...");
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName });
    try {
      let photoURL = "";
      if (state.selectedSignupPhoto) {
        photoURL = await uploadImageToStorage(state.selectedSignupPhoto, "profile-photos");
      }
      await reserveUserProfile(credential.user, {
        username: usernameCheck.username,
        displayName,
        bio,
        email,
        phone,
        photoURL
      });
    } catch (error) {
      await deleteUser(credential.user).catch(() => {});
      throw error;
    }
    showToast("Account created successfully.", "success");
  } catch (error) {
    setAuthFeedback(getFriendlyAuthError(error), "error");
  } finally {
    setBusy(dom.signupSubmitBtn, false, "Creating...");
  }
}

async function handleSignin(event) {
  event.preventDefault();
  setAuthFeedback("");
  setBusy(dom.signinSubmitBtn, true, "Signing in...");
  try {
    await signInWithEmailAndPassword(auth, dom.signinEmail.value.trim(), dom.signinPassword.value);
    showToast("Welcome back.", "success");
  } catch (error) {
    setAuthFeedback(getFriendlyAuthError(error), "error");
  } finally {
    setBusy(dom.signinSubmitBtn, false, "Signing in...");
  }
}

async function handleGoogleAuth() {
  setAuthFeedback("");
  setBusy(dom.googleSigninBtn, true, "Opening Google...");
  setBusy(dom.googleSignupBtn, true, "Opening Google...");
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    await ensureUserDocument(credential.user);
    showToast("Google sign-in complete.", "success");
  } catch (error) {
    setAuthFeedback(getFriendlyAuthError(error), "error");
  } finally {
    setBusy(dom.googleSigninBtn, false, "Opening Google...");
    setBusy(dom.googleSignupBtn, false, "Opening Google...");
  }
}

async function handlePasswordReset() {
  const email = dom.signinEmail.value.trim();
  if (!email) {
    setAuthFeedback("Enter your email address first, then try reset password.", "error");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setAuthFeedback(`Password reset link sent to ${email}.`);
  } catch (error) {
    setAuthFeedback(getFriendlyAuthError(error), "error");
  }
}

async function updatePresence(isOnline, immediate = false) {
  if (!state.currentUser) {
    return;
  }

  const writePresence = async () => {
    try {
      await updateDoc(doc(db, "users", state.currentUser.uid), {
        isOnline,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (_error) {
      return;
    }
  };

  window.clearTimeout(state.presenceTimer);
  if (immediate) {
    await writePresence();
    return;
  }

  state.presenceTimer = window.setTimeout(() => {
    writePresence().catch(() => {});
  }, PRESENCE_DEBOUNCE_MS);
}

function startProfileSubscription() {
  if (!state.currentUser) {
    return;
  }
  if (typeof state.unsubscribers.profile === "function") {
    state.unsubscribers.profile();
  }

  state.unsubscribers.profile = onSnapshot(
    doc(db, "users", state.currentUser.uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        return;
      }
      state.profile = snapshot.data();
      state.preferences = {
        ...state.preferences,
        ...(state.profile.settings || {})
      };
      renderProfileSummary();
      populateDeviceSelectors();
      renderActiveConversationHeader();
    },
    () => {
      showErrorBanner("Your profile could not be kept in sync.");
    }
  );
}

function startUsersSubscription() {
  if (typeof state.unsubscribers.users === "function") {
    state.unsubscribers.users();
  }

  state.unsubscribers.users = onSnapshot(
    query(collection(db, "users"), limit(200)),
    (snapshot) => {
      const users = snapshot.docs.map((item) => item.data());
      state.users = users.filter((user) => user.uid !== state.currentUser?.uid);
      state.userMap = new Map(users.map((user) => [user.uid, user]));
      renderContacts();
      renderConversationList();
      renderActiveConversationHeader();
      if (state.incomingCall?.peerId) {
        state.incomingCall.peer = getUserFromCache(state.incomingCall.peerId) || state.incomingCall.peer;
        renderIncomingCall();
      }
    },
    () => {
      showErrorBanner("The user directory could not be loaded.");
    }
  );
}

function startFriendshipsSubscription() {
  if (!state.currentUser) {
    return;
  }
  if (typeof state.unsubscribers.friendships === "function") {
    state.unsubscribers.friendships();
  }

  const friendshipsRef = query(
    collection(db, "friendships"),
    where("members", "array-contains", state.currentUser.uid)
  );

  state.unsubscribers.friendships = onSnapshot(
    friendshipsRef,
    (snapshot) => {
      state.friendships = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => !["cancelled", "removed", "rejected"].includes(item.status));

      state.friendRequests = state.friendships.filter((item) => item.status === "pending");
      state.friends = state.friendships
        .filter((item) => item.status === "accepted")
        .map((item) => {
          const friendId = item.members.find((uid) => uid !== state.currentUser.uid);
          return getUserFromCache(friendId) || { uid: friendId, displayName: "Friend" };
        });

      renderContacts();
      renderFriendPanels();
    },
    () => {
      showErrorBanner("Friend relationships could not be loaded.");
    }
  );
}

function startConversationsSubscription() {
  if (!state.currentUser) {
    return;
  }
  if (typeof state.unsubscribers.conversations === "function") {
    state.unsubscribers.conversations();
  }

  const conversationsRef = query(
    collection(db, "conversations"),
    where("members", "array-contains", state.currentUser.uid)
  );

  state.unsubscribers.conversations = onSnapshot(
    conversationsRef,
    (snapshot) => {
      state.conversations = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((left, right) => toMillis(right.updatedAt || right.lastMessage?.createdAt) - toMillis(left.updatedAt || left.lastMessage?.createdAt));

      renderConversationList();

      if (state.activeConversationId && !state.conversations.some((conversation) => conversation.id === state.activeConversationId)) {
        state.activeConversationId = null;
        state.activeConversation = null;
        state.activePeerId = null;
        state.messages = [];
        clearActiveConversationSubscriptions();
        renderMessages();
        renderActiveConversationHeader();
        showConversationShell(false);
      }
    },
    () => {
      showErrorBanner("Conversation updates are temporarily unavailable.");
    }
  );
}

function startRoomsSubscription() {
  if (!state.currentUser) {
    return;
  }
  if (typeof state.unsubscribers.rooms === "function") {
    state.unsubscribers.rooms();
  }

  const roomsRef = query(collection(db, "rooms"), where("members", "array-contains", state.currentUser.uid));
  state.unsubscribers.rooms = onSnapshot(
    roomsRef,
    (snapshot) => {
      state.rooms = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((left, right) => toMillis(right.updatedAt) - toMillis(left.updatedAt));
      renderRooms();

      if (state.activeRoomId && !state.rooms.some((room) => room.id === state.activeRoomId)) {
        clearActiveRoomSubscriptions();
      }
    },
    () => {
      showErrorBanner("Rooms could not be loaded.");
    }
  );
}

function clearActiveRoomSubscriptions() {
  if (typeof state.unsubscribers.activeRoom === "function") {
    state.unsubscribers.activeRoom();
  }
  if (typeof state.unsubscribers.roomMessages === "function") {
    state.unsubscribers.roomMessages();
  }
  state.unsubscribers.activeRoom = null;
  state.unsubscribers.roomMessages = null;
  state.activeRoomId = null;
  state.activeRoom = null;
  state.roomMessages = [];
  renderRooms();
}

function renderRooms() {
  if (!dom.roomsList) {
    return;
  }
  dom.roomsList.innerHTML = "";
  if (!state.rooms.length) {
    dom.roomsList.innerHTML = '<div class="stack-item"><strong>No rooms yet</strong><span>Create a group, gaming, or study room to get started.</span></div>';
  } else {
    state.rooms.forEach((room) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = `stack-item ${room.id === state.activeRoomId ? "active" : ""}`;
      node.innerHTML = `
        <div class="stack-item-head">
          <strong>${escapeHtml(room.name || "Untitled Room")}</strong>
          <span>${escapeHtml(room.kind || "group")}</span>
        </div>
        <span>${escapeHtml((room.members || []).length)} members</span>
      `;
      node.addEventListener("click", () => activateRoom(room.id));
      dom.roomsList.appendChild(node);
    });
  }

  const roomTitle = state.activeRoom?.name || "Select a room";
  dom.roomTitle.textContent = roomTitle;
  dom.roomMeta.classList.toggle("hidden", !state.activeRoom);
  dom.roomActions.classList.toggle("hidden", !state.activeRoom || !canManageRoom());
  dom.roomMembersList.classList.toggle("hidden", !state.activeRoom);
  dom.roomMeta.textContent = state.activeRoom
    ? `${state.activeRoom.kind || "group"} room - ${(state.activeRoom.members || []).length} members`
    : "";
  dom.roomComposerForm.classList.toggle("hidden", !state.activeRoom);

  dom.roomFeed.innerHTML = "";
  if (!state.activeRoom) {
    dom.roomMembersList.innerHTML = "";
    dom.roomFeed.innerHTML = '<div class="stack-item"><strong>Select a room</strong><span>Choose a room from the list or create a new one.</span></div>';
    return;
  }

  const roomMembers = (state.activeRoom.members || []).map((uid) => getUserFromCache(uid) || {
    uid,
    displayName: uid === state.currentUser?.uid ? "You" : "Member",
    username: ""
  });
  const roomAdmins = new Set(state.activeRoom.adminIds || []);
  const canManage = canManageRoom();
  dom.roomMembersList.innerHTML = roomMembers.map((member) => {
    const badge = member.uid === state.activeRoom.ownerId
      ? "Owner"
      : roomAdmins.has(member.uid)
        ? "Admin"
        : member.uid === state.currentUser?.uid
          ? "You"
          : member.isOnline
            ? "Online"
            : "Member";
    return `
      <div class="stack-item">
        <div class="stack-item-head">
          <strong>${escapeHtml(member.displayName || member.username || "Member")}</strong>
          <span>${escapeHtml(badge)}</span>
        </div>
        <div class="stack-item-actions">
          <span>${escapeHtml(member.username ? `@${member.username}` : presenceLabel(member))}</span>
          ${canManage && member.uid !== state.currentUser?.uid ? `<button class="button secondary small room-member-remove-btn" data-member-id="${escapeHtml(member.uid)}" data-member-name="${escapeHtml(member.username || member.displayName || "member")}" type="button">Remove</button>` : ""}
        </div>
      </div>
    `;
  }).join("");
  dom.roomMembersList.querySelectorAll(".room-member-remove-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const memberId = button.dataset.memberId;
      const memberName = button.dataset.memberName || "member";
      await updateDoc(doc(db, "rooms", state.activeRoom.id), {
        members: arrayRemove(memberId),
        adminIds: arrayRemove(memberId),
        updatedAt: serverTimestamp()
      }).then(() => {
        showToast(`${memberName} removed from the room.`, "success");
      }).catch(() => {
        showToast("Room member could not be removed.", "error");
      });
    });
  });

  if (!state.roomMessages.length) {
    dom.roomFeed.innerHTML = '<div class="stack-item"><strong>No room messages yet</strong><span>Start the conversation in this room.</span></div>';
    return;
  }

  state.roomMessages.forEach((message) => {
    const author = getUserFromCache(message.senderId);
    const node = document.createElement("article");
    node.className = `message ${message.senderId === state.currentUser?.uid ? "mine" : ""}`;
    const bubbleContent = message.type === "image" && message.imageUrl
      ? `<img src="${escapeHtml(message.imageUrl)}" alt="Room image"><div>${escapeHtml(message.text || "")}</div>`
      : escapeHtml(message.text || "");
    node.innerHTML = `
      <div class="message-bubble">${bubbleContent}</div>
      <div class="message-meta">
        <span>${escapeHtml(author?.displayName || author?.username || "Member")}</span>
        <span>${escapeHtml(formatTime(message.createdAt))}</span>
      </div>
    `;
    dom.roomFeed.appendChild(node);
  });
  dom.roomFeed.scrollTop = dom.roomFeed.scrollHeight;
}

async function createRoom(kind = "group") {
  const name = window.prompt(`Enter a ${kind} room name`);
  if (!name) {
    return;
  }

  try {
    await addDoc(collection(db, "rooms"), {
      name: name.trim(),
      kind,
      ownerId: state.currentUser.uid,
      adminIds: [state.currentUser.uid],
      members: [state.currentUser.uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    showToast(`${kind[0].toUpperCase()}${kind.slice(1)} room created.`, "success");
    setActiveSection("rooms");
  } catch (_error) {
    showToast("Room could not be created.", "error");
  }
}

async function activateRoom(roomId) {
  clearActiveRoomSubscriptions();
  state.activeRoomId = roomId;

  state.unsubscribers.activeRoom = onSnapshot(
    doc(db, "rooms", roomId),
    (snapshot) => {
      if (!snapshot.exists()) {
        clearActiveRoomSubscriptions();
        return;
      }
      state.activeRoom = { id: snapshot.id, ...snapshot.data() };
      renderRooms();
    }
  );

  state.unsubscribers.roomMessages = onSnapshot(
    query(collection(db, "rooms", roomId, "messages"), orderBy("createdAt", "asc"), limit(200)),
    (snapshot) => {
      state.roomMessages = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderRooms();
    }
  );
}

async function sendRoomMessage(event) {
  event.preventDefault();
  const text = dom.roomMessageInput.value.trim();
  if (!text || !state.activeRoomId) {
    return;
  }
  try {
    await addDoc(collection(db, "rooms", state.activeRoomId, "messages"), {
      text,
      senderId: state.currentUser.uid,
      createdAt: serverTimestamp(),
      type: "text"
    });
    await updateDoc(doc(db, "rooms", state.activeRoomId), {
      updatedAt: serverTimestamp(),
      lastMessage: {
        text,
        senderId: state.currentUser.uid,
        createdAt: serverTimestamp()
      }
    });
    dom.roomMessageInput.value = "";
    incrementChallengeMetric("studyActions", state.activeRoom?.kind === "study" ? 1 : 0).catch(() => {});
  } catch (_error) {
    showToast("Room message failed to send.", "error");
  }
}

async function addRoomMember() {
  if (!state.activeRoom) {
    return;
  }
  const username = window.prompt("Enter a friend's username to add");
  if (!username) {
    return;
  }

  const candidate = await findUserByUsername(username);
  if (!candidate) {
    showToast("No matching user found.", "info");
    return;
  }
  if (candidate.uid === state.currentUser?.uid) {
    showToast("You are already in this room.", "info");
    return;
  }
  if ((state.activeRoom.members || []).includes(candidate.uid)) {
    showToast("That user is already a member of this room.", "info");
    return;
  }

  await updateDoc(doc(db, "rooms", state.activeRoom.id), {
    members: arrayUnion(candidate.uid),
    updatedAt: serverTimestamp()
  }).catch(() => {
    showToast("Room member could not be added.", "error");
  });
}

async function renameActiveRoom() {
  if (!state.activeRoom || !canManageRoom()) {
    showToast("Only room admins can rename this room.", "info");
    return;
  }

  const nextName = window.prompt("Enter the new room name", state.activeRoom.name || "");
  if (!nextName || !nextName.trim()) {
    return;
  }

  await updateDoc(doc(db, "rooms", state.activeRoom.id), {
    name: nextName.trim(),
    updatedAt: serverTimestamp()
  }).then(() => {
    showToast("Room renamed successfully.", "success");
  }).catch(() => {
    showToast("Room could not be renamed.", "error");
  });
}

async function removeRoomMember() {
  if (!state.activeRoom || !canManageRoom()) {
    showToast("Only room admins can remove members.", "info");
    return;
  }

  const username = window.prompt("Enter the username to remove from this room");
  if (!username) {
    return;
  }

  const candidate = await findUserByUsername(username);
  if (!candidate || !(state.activeRoom.members || []).includes(candidate.uid)) {
    showToast("That user is not in this room.", "info");
    return;
  }
  if (candidate.uid === state.currentUser?.uid) {
    showToast("Use another admin account if you need to remove yourself.", "info");
    return;
  }

  await updateDoc(doc(db, "rooms", state.activeRoom.id), {
    members: arrayRemove(candidate.uid),
    adminIds: arrayRemove(candidate.uid),
    updatedAt: serverTimestamp()
  }).then(() => {
    showToast("Room member removed.", "success");
  }).catch(() => {
    showToast("Room member could not be removed.", "error");
  });
}

function renderAiFeed() {
  if (!dom.aiChatFeed) {
    return;
  }
  const botConfig = getBotConfig(state.aiBot);
  dom.aiBotTitle.textContent = botConfig.label;
  dom.aiChatFeed.innerHTML = "";

  if (!state.aiMessages.length) {
    dom.aiChatFeed.innerHTML = `<div class="ai-bubble"><strong>${escapeHtml(botConfig.label)}</strong><span>${escapeHtml(botConfig.starter)}</span></div>`;
    return;
  }

  state.aiMessages.forEach((message) => {
    const node = document.createElement("div");
    node.className = `ai-bubble ${message.role === "user" ? "user" : ""}`;
    node.innerHTML =
      message.code
        ? `<strong>${escapeHtml(message.role === "user" ? "You" : botConfig.label)}</strong><pre>${escapeHtml(message.code)}</pre>`
        : `<strong>${escapeHtml(message.role === "user" ? "You" : botConfig.label)}</strong><span>${escapeHtml(message.text)}</span>`;
    dom.aiChatFeed.appendChild(node);
  });
  dom.aiChatFeed.scrollTop = dom.aiChatFeed.scrollHeight;
}

function renderScannerResult(result, claim) {
  if (!dom.scannerResults) {
    return;
  }
  dom.scannerResults.innerHTML = `
    <div class="scanner-result-card">
      <div class="stack-item-head">
        <strong>${escapeHtml(claim)}</strong>
        <span class="scanner-badge ${escapeHtml(result.verdict)}">${escapeHtml(result.label)}</span>
      </div>
      <span>${escapeHtml(result.summary)}</span>
      <div class="stack-list">
        ${
          result.sources.length
            ? result.sources.map((source) => `
              <div class="stack-item">
                <strong>${escapeHtml(source.title)}</strong>
                <span>${escapeHtml(source.extract)}</span>
                <a href="${source.url}" target="_blank" rel="noreferrer">Open source</a>
              </div>
            `).join("")
            : '<div class="stack-item"><span>No public source excerpts were returned.</span></div>'
        }
      </div>
    </div>
  `;
}

function renderQuiz() {
  const question = QUIZ_BANK[state.quizIndex % QUIZ_BANK.length];
  dom.quizQuestion.textContent = question.question;
  dom.quizFeedback.textContent = "";
  dom.quizOptions.innerHTML = "";
  question.options.forEach((option, index) => {
    const button = createActionButton(option, "secondary", () => answerQuiz(index));
    dom.quizOptions.appendChild(button);
  });
}

function renderTicTacToe() {
  if (!dom.ticBoard) {
    return;
  }
  const cells = dom.ticBoard.querySelectorAll(".tic-cell");
  cells.forEach((cell, index) => {
    cell.textContent = state.ticTacToe.board[index];
    cell.disabled = Boolean(state.ticTacToe.winner || state.ticTacToe.board[index]);
  });

  if (state.ticTacToe.winner === "draw") {
    dom.ticStatus.textContent = "It is a draw.";
  } else if (state.ticTacToe.winner) {
    dom.ticStatus.textContent = `${state.ticTacToe.winner} wins.`;
  } else {
    dom.ticStatus.textContent = `${state.ticTacToe.current} to play.`;
  }
}

function renderChallenges() {
  if (!dom.challengeList) {
    return;
  }

  const challengeDoc = state.todayChallenge;
  const stats = computeChallengeStats(challengeDoc || {
    dateKey: getTodayKey(),
    metrics: {}
  });

  dom.challengeList.innerHTML = "";
  stats.blueprint.forEach((item) => {
    const progress = Math.min(item.target, challengeDoc?.metrics?.[item.metric] || 0);
    const complete = progress >= item.target;
    const node = document.createElement("div");
    node.className = "stack-item";
    node.innerHTML = `
      <div class="stack-item-head">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${progress}/${item.target}</span>
      </div>
      <span>${escapeHtml(item.description)}</span>
      <span>${complete ? "Completed" : `${item.points} points`}</span>
    `;
    dom.challengeList.appendChild(node);
  });

  dom.challengePointsValue.textContent = String((state.profile?.challengeStats?.points || 0) + stats.points);
  dom.streakValue.textContent = String(state.profile?.challengeStats?.streak || 0);
  dom.rewardBadgeList.innerHTML = (state.profile?.badges || []).length
    ? state.profile.badges.map((badge) => `<span class="badge-pill">${escapeHtml(badge)}</span>`).join("")
    : '<span class="badge-pill">Newcomer</span>';
}

async function incrementChallengeMetric(metric, amount = 1) {
  if (!state.currentUser || !metric || amount <= 0) {
    return;
  }

  const dateKey = getTodayKey();
  const docId = `${state.currentUser.uid}_${dateKey}`;
  const challengeRef = doc(db, "userDailyChallenges", docId);
  await setDoc(challengeRef, {
    userId: state.currentUser.uid,
    dateKey,
    metrics: {
      [metric]: increment(amount)
    },
    updatedAt: serverTimestamp()
  }, { merge: true }).catch(() => {});
}

function startChallengeSubscription() {
  if (!state.currentUser) {
    return;
  }
  if (typeof state.unsubscribers.challenges === "function") {
    state.unsubscribers.challenges();
  }

  const dateKey = getTodayKey();
  const challengeRef = doc(db, "userDailyChallenges", `${state.currentUser.uid}_${dateKey}`);
  state.unsubscribers.challenges = onSnapshot(
    challengeRef,
    async (snapshot) => {
      if (!snapshot.exists()) {
        await setDoc(challengeRef, {
          userId: state.currentUser.uid,
          dateKey,
          metrics: {
            messagesSent: 0,
            aiUses: 0,
            gamesPlayed: 0,
            studyActions: 0
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
        return;
      }
      state.todayChallenge = snapshot.data();
      state.aiUsageToday = snapshot.data()?.metrics?.aiUses || 0;
      renderChallenges();
      renderPlanSummary();
    }
  );
}

async function handleScannerRun() {
  const claim = dom.scannerInput.value.trim();
  if (!claim) {
    showToast("Enter a claim before scanning.", "info");
    return;
  }
  dom.scannerResults.innerHTML = '<div class="stack-item"><span>Scanning public sources...</span></div>';
  try {
    const result = await scanClaimWithWikipedia(claim);
    renderScannerResult(result, claim);
  } catch (error) {
    dom.scannerResults.innerHTML = `<div class="stack-item"><strong>Scanner unavailable</strong><span>${escapeHtml(error.message || "Could not scan right now.")}</span></div>`;
  }
}

async function handleAiSubmit(event) {
  event.preventDefault();
  const prompt = dom.aiPromptInput.value.trim();
  if (!prompt) {
    return;
  }

  const limit = getAiLimitForPlan(getCurrentPlan());
  if (limit !== 999 && state.aiUsageToday >= limit) {
    showToast("You reached today's AI limit for your plan.", "info");
    setActiveSection("premium");
    return;
  }

  state.aiMessages.push({ role: "user", text: prompt });
  renderAiFeed();
  dom.aiPromptInput.value = "";
  dom.aiSendBtn.disabled = true;

  try {
    const token = state.currentUser ? await state.currentUser.getIdToken() : "";
    const response = await requestAiReply({
      botId: state.aiBot,
      prompt,
      authToken: token
    });
    state.aiMessages.push({ role: "assistant", text: response.reply });
    await incrementChallengeMetric("aiUses", 1);
  } catch (error) {
    state.aiMessages.push({ role: "assistant", text: error.message || "AI service is unavailable." });
  } finally {
    dom.aiSendBtn.disabled = false;
    renderAiFeed();
  }
}

function setAiBot(botId) {
  state.aiBot = botId;
  state.aiMessages = [];
  dom.aiBotList.querySelectorAll(".ai-bot-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.bot === botId);
  });
  renderAiFeed();
}

function handleTicCell(index) {
  state.ticTacToe = applyTicMove(state.ticTacToe, index);
  renderTicTacToe();
  if (state.ticTacToe.winner) {
    incrementChallengeMetric("gamesPlayed", 1).catch(() => {});
  }
}

function resetTicTacToe() {
  state.ticTacToe = createTicTacToeState();
  renderTicTacToe();
}

function handleRpsMove(move) {
  const result = playRockPaperScissors(move);
  const label =
    result.outcome === "win"
      ? `You played ${move}, bot played ${result.botMove}. You win.`
      : result.outcome === "lose"
        ? `You played ${move}, bot played ${result.botMove}. You lose.`
        : `You both played ${move}. It's a draw.`;
  dom.rpsResult.textContent = label;
  incrementChallengeMetric("gamesPlayed", 1).catch(() => {});
}

function answerQuiz(optionIndex) {
  const question = QUIZ_BANK[state.quizIndex % QUIZ_BANK.length];
  const correct = optionIndex === question.answer;
  dom.quizFeedback.textContent = correct ? "Correct answer." : `Not quite. Correct: ${question.options[question.answer]}`;
  incrementChallengeMetric(correct ? "studyActions" : "gamesPlayed", 1).catch(() => {});
}

function nextQuiz() {
  state.quizIndex += 1;
  renderQuiz();
}

function renderIncomingCall() {
  if (!state.incomingCall) {
    dom.incomingOverlay.classList.add("hidden");
    return;
  }

  decorateAvatar(dom.incomingAvatar, state.incomingCall.peer || { uid: state.incomingCall.peerId, displayName: "U" });
  dom.incomingName.textContent = state.incomingCall.peer?.displayName || state.incomingCall.peer?.username || "Unknown caller";
  dom.incomingType.textContent = state.incomingCall.type === "video" ? "Video call" : "Voice call";
  dom.incomingOverlay.classList.remove("hidden");
}

function startIncomingCallsSubscription() {
  if (!state.currentUser) {
    return;
  }

  if (typeof state.unsubscribers.incomingCalls === "function") {
    state.unsubscribers.incomingCalls();
  }

  const callsRef = query(collection(db, "calls"), where("calleeId", "==", state.currentUser.uid));
  state.unsubscribers.incomingCalls = onSnapshot(
    callsRef,
    (snapshot) => {
      handleIncomingCallsSnapshot(snapshot).catch(() => {
        showErrorBanner("Incoming call updates are delayed right now.");
      });
    },
    () => {
      showErrorBanner("Incoming call listening failed. Refresh the page if this persists.");
    }
  );
}

async function handleIncomingCallsSnapshot(snapshot) {
  const callDocs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

  if (state.incomingCall) {
    const matching = callDocs.find((callItem) => callItem.id === state.incomingCall.id);
    if (!matching || matching.status !== "ringing") {
      stopRingtone();
      state.incomingCall = null;
      renderIncomingCall();
    }
  }

  const ringingCalls = callDocs
    .filter((callItem) => callItem.status === "ringing")
    .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));

  if (!ringingCalls.length) {
    state.lastRingingCallId = null;
    return;
  }

  const newest = ringingCalls[0];
  if (newest.id === state.call.sessionId || newest.id === state.incomingCall?.id) {
    return;
  }

  if (state.call.sessionId) {
    await Promise.allSettled(
      ringingCalls.map((callItem) =>
        updateDoc(doc(db, "calls", callItem.id), {
          status: "busy",
          updatedAt: serverTimestamp(),
          endedAt: serverTimestamp(),
          reason: "busy"
        }).catch(() => {})
      )
    );
    return;
  }

  if (newest.id === state.lastRingingCallId && !state.incomingCall) {
    return;
  }

  state.lastRingingCallId = newest.id;
  const peer = await fetchUserProfile(newest.callerId);
  state.incomingCall = {
    ...newest,
    peer,
    peerId: newest.callerId
  };
  renderIncomingCall();
  startRingtone();
}

async function acquireLocalMedia(type) {
  const audioConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  };

  if (state.preferences.micId) {
    audioConstraints.deviceId = { exact: state.preferences.micId };
  }

  if (type === "audio") {
    return navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: false
    });
  }

  const videoConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 }
  };

  if (state.preferences.cameraId) {
    videoConstraints.deviceId = { exact: state.preferences.cameraId };
  } else {
    videoConstraints.facingMode = "user";
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: videoConstraints
    });
  } catch (error) {
    const fallbackNames = new Set(["NotFoundError", "OverconstrainedError"]);
    if (fallbackNames.has(error?.name)) {
      showToast("Camera unavailable. Starting without video.", "info");
      return navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false
      });
    }
    throw error;
  }
}

function attachLocalStream(stream) {
  dom.localVideo.srcObject = stream || null;
  dom.localVideo.play().catch(() => {});
}

function attachRemoteStream(stream) {
  dom.remoteVideo.srcObject = stream || null;
  dom.remoteVideo.play().catch(() => {});
}

function syncCallVisualState() {
  const hasRemoteVideo = Boolean(state.call.remoteStream?.getVideoTracks().find((track) => track.readyState === "live" && track.enabled));
  const hasLocalVideo = Boolean(state.call.localStream?.getVideoTracks().find((track) => track.readyState === "live"));
  dom.callStage.classList.toggle("has-remote-video", hasRemoteVideo);
  dom.callStage.classList.toggle("no-local-video", !hasLocalVideo && !state.call.isScreenSharing);
  dom.toggleCameraBtn.disabled = state.call.type !== "video" || (!hasLocalVideo && !state.call.isCameraOff);
  dom.shareScreenBtn.disabled = state.call.type !== "video";
  dom.screenShareBanner.classList.toggle("hidden", !state.call.isScreenSharing);
  dom.toggleMicBtn.textContent = state.call.isMuted ? "Unmute" : "Mic";
  dom.toggleCameraBtn.textContent = state.call.isCameraOff ? "Cam Off" : "Cam";
  dom.shareScreenBtn.textContent = state.call.isScreenSharing ? "Sharing" : "Share";
}

function openCallStage(callType, peerProfile, statusText, direction) {
  dom.incomingOverlay.classList.add("hidden");
  decorateAvatar(dom.callAvatar, peerProfile || { uid: "call", displayName: "U" });
  dom.callPeerName.textContent = peerProfile?.displayName || peerProfile?.username || "Unknown";
  dom.callTitle.textContent = direction === "outgoing" ? "Calling..." : "Call in progress";
  dom.callKindLabel.textContent = callType === "video" ? "Video Call" : "Voice Call";
  dom.callStatusText.textContent = statusText;
  dom.callQuality.textContent = "Waiting";
  dom.callTimer.textContent = "00:00";
  dom.callStage.classList.remove("hidden");
  syncCallVisualState();
}

function hideCallStage() {
  dom.callStage.classList.add("hidden");
  dom.screenShareBanner.classList.add("hidden");
  dom.callTitle.textContent = "Z Chat Call";
  dom.callStatusText.textContent = "Connecting...";
  dom.callQuality.textContent = "Waiting";
  dom.callTimer.textContent = "00:00";
  dom.callStage.classList.remove("has-remote-video");
  dom.callStage.classList.remove("no-local-video");
  dom.remoteVideo.srcObject = null;
  dom.localVideo.srcObject = null;
}

function resetCallState() {
  state.call = createEmptyCallState();
}

function cleanupCallResources() {
  const current = state.call;
  window.clearTimeout(current.timeout);
  window.clearTimeout(current.disconnectTimer);
  window.clearInterval(current.timer);
  window.clearInterval(current.statsTimer);

  if (typeof current.docUnsub === "function") {
    current.docUnsub();
  }
  if (typeof current.candidateUnsub === "function") {
    current.candidateUnsub();
  }

  if (current.localStream) {
    current.localStream.getTracks().forEach((track) => track.stop());
  }
  if (current.remoteStream) {
    current.remoteStream.getTracks().forEach((track) => track.stop());
  }
  if (current.screenStream) {
    current.screenStream.getTracks().forEach((track) => track.stop());
  }
  if (current.pc) {
    current.pc.ontrack = null;
    current.pc.onicecandidate = null;
    current.pc.onconnectionstatechange = null;
    current.pc.oniceconnectionstatechange = null;
    current.pc.close();
  }

  stopRingtone();
  state.incomingCall = null;
  state.lastRingingCallId = null;
  renderIncomingCall();
  hideCallStage();
  resetCallState();
  renderActiveConversationHeader();
}

async function finalizeCall(reason, remote = false) {
  if (!state.call.sessionId) {
    cleanupCallResources();
    return;
  }

  const callId = state.call.sessionId;
  const callRef = doc(db, "calls", callId);

  if (!remote) {
    state.call.localHangupInProgress = true;
    await updateDoc(callRef, {
      status: reason === "cancelled" ? "ended" : reason,
      updatedAt: serverTimestamp(),
      endedAt: serverTimestamp(),
      reason
    }).catch(() => {});
  }

  cleanupCallResources();
}

function startCallTimer() {
  if (state.call.timer || !state.call.connectedAt) {
    return;
  }
  state.call.timer = window.setInterval(() => {
    const seconds = Math.floor((Date.now() - state.call.connectedAt) / 1000);
    dom.callTimer.textContent = formatClock(seconds);
  }, 1000);
}

function scheduleDisconnectSafetyNet() {
  window.clearTimeout(state.call.disconnectTimer);
  state.call.disconnectTimer = window.setTimeout(() => {
    if (state.call.pc && state.call.pc.connectionState !== "connected") {
      showToast("Connection lost. Ending call.", "error");
      finalizeCall("connection-lost").catch(() => {});
    }
  }, DISCONNECT_TIMEOUT_MS);
}

function clearDisconnectSafetyNet() {
  window.clearTimeout(state.call.disconnectTimer);
}

async function updateCallQuality() {
  if (!state.call.pc) {
    return;
  }

  try {
    const stats = await state.call.pc.getStats();
    let pair = null;
    stats.forEach((report) => {
      if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
        pair = report;
      }
    });

    if (!pair) {
      dom.callQuality.textContent = "Connected";
      return;
    }

    const bitrate = Number(pair.availableOutgoingBitrate || 0);
    const rttMs = Number(pair.currentRoundTripTime || 0) * 1000;

    if (bitrate > 1000000 && rttMs > 0 && rttMs < 60) {
      dom.callQuality.textContent = "Excellent";
    } else if (bitrate > 450000 && (rttMs === 0 || rttMs < 160)) {
      dom.callQuality.textContent = "Good";
    } else {
      dom.callQuality.textContent = "Poor";
    }
  } catch (_error) {
    dom.callQuality.textContent = "Connected";
  }
}

function startCallQualityMonitor() {
  if (state.call.statsTimer) {
    return;
  }
  state.call.statsTimer = window.setInterval(() => {
    updateCallQuality().catch(() => {});
  }, 4000);
}

async function createPeerConnection(callId, role) {
  const pc = new RTCPeerConnection(ICE_CONFIG);
  state.call.pc = pc;
  state.call.remoteStream = new MediaStream();
  attachRemoteStream(state.call.remoteStream);

  pc.onicecandidate = (event) => {
    if (!event.candidate || !state.call.sessionId) {
      return;
    }
    const bucket = role === "caller" ? "offerCandidates" : "answerCandidates";
    addDoc(collection(db, "calls", callId, bucket), event.candidate.toJSON()).catch(() => {});
  };

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      if (!state.call.remoteStream.getTracks().some((existing) => existing.id === track.id)) {
        state.call.remoteStream.addTrack(track);
      }
      track.addEventListener("ended", syncCallVisualState);
      track.addEventListener("mute", syncCallVisualState);
      track.addEventListener("unmute", syncCallVisualState);
    });
    attachRemoteStream(state.call.remoteStream);
    syncCallVisualState();
  };

  pc.onconnectionstatechange = () => {
    const connectionState = pc.connectionState;
    if (connectionState === "connected") {
      state.call.connectedAt = state.call.connectedAt || Date.now();
      dom.callStatusText.textContent = "Connected";
      dom.callTitle.textContent = state.call.peerProfile?.displayName || state.call.peerProfile?.username || "Connected";
      startCallTimer();
      clearDisconnectSafetyNet();
      updateCallQuality().catch(() => {});
      startCallQualityMonitor();
    } else if (connectionState === "connecting") {
      dom.callStatusText.textContent = "Connecting...";
    } else if (connectionState === "disconnected") {
      dom.callStatusText.textContent = "Reconnecting...";
      scheduleDisconnectSafetyNet();
    } else if (connectionState === "failed") {
      showToast("The peer connection failed.", "error");
      finalizeCall("failed").catch(() => {});
    } else if (connectionState === "closed") {
      clearDisconnectSafetyNet();
    }
  };

  pc.oniceconnectionstatechange = () => {
    const iceState = pc.iceConnectionState;
    if (iceState === "disconnected") {
      dom.callStatusText.textContent = "Reconnecting...";
      scheduleDisconnectSafetyNet();
    }
    if (iceState === "connected" || iceState === "completed") {
      clearDisconnectSafetyNet();
    }
  };

  state.call.candidateUnsub = onSnapshot(
    collection(db, "calls", callId, role === "caller" ? "answerCandidates" : "offerCandidates"),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added") {
          return;
        }
        if (state.call.remoteCandidateIds.has(change.doc.id)) {
          return;
        }
        state.call.remoteCandidateIds.add(change.doc.id);
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
      });
    }
  );
}

async function attachLocalTracks() {
  if (!state.call.localStream || !state.call.pc) {
    return;
  }
  state.call.localStream.getTracks().forEach((track) => {
    state.call.pc.addTrack(track, state.call.localStream);
  });
  attachLocalStream(state.call.localStream);
  syncCallVisualState();
}

async function subscribeToCallDocument(callId, role) {
  const callRef = doc(db, "calls", callId);
  state.call.docRef = callRef;
  state.call.docUnsub = onSnapshot(
    callRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        finalizeCall("ended", true).catch(() => {});
        return;
      }

      const payload = snapshot.data();
      if (role === "caller" && payload.answer && state.call.pc && !state.call.pc.currentRemoteDescription) {
        state.call.pc.setRemoteDescription(new RTCSessionDescription(payload.answer)).catch(() => {});
      }
      if (role === "callee" && payload.offer && state.call.pc && !state.call.pc.currentRemoteDescription) {
        state.call.pc.setRemoteDescription(new RTCSessionDescription(payload.offer)).catch(() => {});
      }
      if (payload.status === "accepted") {
        dom.callStatusText.textContent = "Joining...";
      }
      if (["rejected", "busy", "ended", "timeout", "failed", "connection-lost"].includes(payload.status)) {
        if (!state.call.localHangupInProgress) {
          const messageMap = {
            rejected: "The call was rejected.",
            busy: "The user is already on another call.",
            ended: "The call ended.",
            timeout: "The call timed out.",
            failed: "The call failed.",
            "connection-lost": "The connection was lost."
          };
          showToast(messageMap[payload.status] || "The call has ended.", payload.status === "failed" ? "error" : "info");
          finalizeCall(payload.status, true).catch(() => {});
        }
      }
    },
    () => {
      showErrorBanner("Live call updates failed. Refresh if the issue continues.");
    }
  );
}

async function startCall(type) {
  if (!state.activePeerId) {
    showToast("Select a conversation before placing a call.", "info");
    return;
  }
  if (state.call.sessionId) {
    showToast("Finish the current call before starting another one.", "info");
    return;
  }

  const peerProfile = getUserFromCache(state.activePeerId) || await fetchUserProfile(state.activePeerId);
  const conversationId = await ensureConversationForPeer(state.activePeerId);

  try {
    state.call = createEmptyCallState();
    state.call.type = type;
    state.call.direction = "outgoing";
    state.call.peerId = state.activePeerId;
    state.call.peerProfile = peerProfile;
    state.call.localStream = await acquireLocalMedia(type);

    const callRef = await addDoc(collection(db, "calls"), {
      callerId: state.currentUser.uid,
      calleeId: state.activePeerId,
      receiverId: state.activePeerId,
      conversationId,
      type,
      callType: type,
      participants: sortedPair(state.currentUser.uid, state.activePeerId),
      status: "ringing",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      startedAt: null,
      endedAt: null
    });

    state.call.sessionId = callRef.id;
    openCallStage(type, peerProfile, "Ringing...", "outgoing");
    await createPeerConnection(callRef.id, "caller");
    await attachLocalTracks();
    await subscribeToCallDocument(callRef.id, "caller");

    const offer = await state.call.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: type === "video"
    });
    await state.call.pc.setLocalDescription(offer);

    await updateDoc(callRef, {
      offer: {
        type: offer.type,
        sdp: offer.sdp
      },
      updatedAt: serverTimestamp()
    });

    state.call.timeout = window.setTimeout(() => {
      if (state.call.sessionId === callRef.id) {
        showToast("No answer received.", "info");
        finalizeCall("timeout").catch(() => {});
      }
    }, CALL_TIMEOUT_MS);
  } catch (error) {
    showToast(getFriendlyCallError(error, "The call could not be started."), "error");
    cleanupCallResources();
  }
}

async function acceptIncomingCall() {
  if (!state.incomingCall || state.call.sessionId) {
    return;
  }

  stopRingtone();
  const incoming = state.incomingCall;
  state.lastRingingCallId = incoming.id;
  state.incomingCall = null;
  renderIncomingCall();

  try {
    state.call = createEmptyCallState();
    state.call.sessionId = incoming.id;
    state.call.type = incoming.type;
    state.call.direction = "incoming";
    state.call.peerId = incoming.callerId;
    state.call.peerProfile = incoming.peer;
    state.call.localStream = await acquireLocalMedia(incoming.type);

    openCallStage(incoming.type, incoming.peer, "Connecting...", "incoming");
    await createPeerConnection(incoming.id, "callee");
    await attachLocalTracks();
    await subscribeToCallDocument(incoming.id, "callee");

    const latestSnapshot = await getDoc(doc(db, "calls", incoming.id));
    const latestOffer = latestSnapshot.data()?.offer || incoming.offer;
    if (!latestOffer) {
      throw new Error("Missing offer.");
    }

    await state.call.pc.setRemoteDescription(new RTCSessionDescription(latestOffer));
    const answer = await state.call.pc.createAnswer();
    await state.call.pc.setLocalDescription(answer);

    await updateDoc(doc(db, "calls", incoming.id), {
      answer: {
        type: answer.type,
        sdp: answer.sdp
      },
      status: "accepted",
      updatedAt: serverTimestamp(),
      startedAt: serverTimestamp()
    });
  } catch (error) {
    showToast(getFriendlyCallError(error, "The call could not be answered."), "error");
    await updateDoc(doc(db, "calls", incoming.id), {
      status: "failed",
      updatedAt: serverTimestamp(),
      endedAt: serverTimestamp(),
      reason: "accept-failed"
    }).catch(() => {});
    cleanupCallResources();
  }
}

async function rejectIncomingCall() {
  if (!state.incomingCall) {
    return;
  }
  stopRingtone();
  const callId = state.incomingCall.id;
  state.lastRingingCallId = callId;
  state.incomingCall = null;
  renderIncomingCall();
  await updateDoc(doc(db, "calls", callId), {
    status: "rejected",
    updatedAt: serverTimestamp(),
    endedAt: serverTimestamp(),
    reason: "rejected"
  }).catch(() => {});
}

async function toggleMicrophone() {
  if (!state.call.localStream) {
    return;
  }
  const audioTrack = state.call.localStream.getAudioTracks()[0];
  if (!audioTrack) {
    showToast("No microphone is active for this call.", "info");
    return;
  }
  state.call.isMuted = !state.call.isMuted;
  audioTrack.enabled = !state.call.isMuted;
  syncCallVisualState();
}

async function toggleCamera() {
  if (state.call.type !== "video") {
    showToast("Camera controls are only available on video calls.", "info");
    return;
  }
  if (state.call.isScreenSharing) {
    showToast("Stop screen sharing before changing the camera state.", "info");
    return;
  }
  const videoTrack = state.call.localStream?.getVideoTracks()[0];
  if (!videoTrack) {
    showToast("No camera is active for this call.", "info");
    return;
  }
  state.call.isCameraOff = !state.call.isCameraOff;
  videoTrack.enabled = !state.call.isCameraOff;
  syncCallVisualState();
}

async function startScreenShare() {
  if (!state.call.pc || state.call.type !== "video") {
    showToast("Screen sharing is available during active video calls.", "info");
    return;
  }

  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });

    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = state.call.pc.getSenders().find((item) => item.track?.kind === "video");
    if (!sender || !screenTrack) {
      screenStream.getTracks().forEach((track) => track.stop());
      showToast("A video sender was not available for screen sharing.", "error");
      return;
    }

    await sender.replaceTrack(screenTrack);
    state.call.screenStream = screenStream;
    state.call.isScreenSharing = true;
    attachLocalStream(screenStream);
    screenTrack.addEventListener("ended", () => {
      stopScreenShare().catch(() => {});
    });
    syncCallVisualState();
  } catch (error) {
    showToast(getFriendlyCallError(error, "Screen sharing could not be started."), "error");
  }
}

async function stopScreenShare() {
  if (!state.call.isScreenSharing) {
    return;
  }

  try {
    const sender = state.call.pc?.getSenders().find((item) => item.track?.kind === "video");
    const cameraTrack = state.call.localStream?.getVideoTracks()[0];
    if (sender && cameraTrack) {
      await sender.replaceTrack(cameraTrack);
    }
  } catch (_error) {
    return;
  } finally {
    if (state.call.screenStream) {
      state.call.screenStream.getTracks().forEach((track) => track.stop());
    }
    state.call.screenStream = null;
    state.call.isScreenSharing = false;
    attachLocalStream(state.call.localStream);
    syncCallVisualState();
  }
}

async function saveSettings() {
  if (!state.currentUser) {
    return;
  }

  const payload = {
    settings: {
      micId: dom.micSelect.value || "",
      cameraId: dom.cameraSelect.value || "",
      speakerId: dom.speakerSelect.value || "",
      lastSeen: dom.privacyLastSeen.value || "everyone",
      onlineStatus: dom.privacyOnlineStatus.checked,
      readReceipts: dom.privacyReadReceipts.checked
    },
    updatedAt: serverTimestamp()
  };

  try {
    await updateDoc(doc(db, "users", state.currentUser.uid), payload);
    state.preferences = {
      ...state.preferences,
      ...payload.settings
    };
    await applySelectedSpeaker();
    showToast("Settings saved.", "success");
    closeDialog(dom.settingsModal);
  } catch (_error) {
    showToast("Settings could not be saved right now.", "error");
  }
}

async function uploadImageToStorage(file, folder) {
  const filePath = `${folder}/${state.currentUser.uid}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
  const storageRef = ref(storage, filePath);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

function previewFileAvatar(file, element, fallbackUser = null) {
  if (!file || !element) {
    if (fallbackUser) {
      decorateAvatar(element, fallbackUser);
    }
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    element.textContent = "";
    element.style.background = `center / cover no-repeat url(${reader.result})`;
  };
  reader.readAsDataURL(file);
}

async function sendImageMessage() {
  if (!state.selectedMessageImage || !state.activeConversationId) {
    showToast("Choose an image and select a chat first.", "info");
    return;
  }

  try {
    const imageUrl = await uploadImageToStorage(state.selectedMessageImage, "chat-images");
    await addDoc(collection(db, "conversations", state.activeConversationId, "messages"), {
      text: dom.messageInput.value.trim(),
      senderId: state.currentUser.uid,
      createdAt: serverTimestamp(),
      type: "image",
      imageUrl
    });
    await updateDoc(doc(db, "conversations", state.activeConversationId), {
      lastMessage: {
        text: "[Image]",
        senderId: state.currentUser.uid,
        createdAt: serverTimestamp()
      },
      updatedAt: serverTimestamp()
    });
    dom.messageInput.value = "";
    state.selectedMessageImage = null;
    dom.imageUploadInput.value = "";
    autoResizeComposer();
  } catch (_error) {
    showToast("Image upload failed.", "error");
  }
}

async function saveProfileSettings() {
  if (!state.currentUser) {
    return;
  }

  const nextUsername = normalizeUsername(dom.settingsUsername.value || state.profile?.username || "");
  const usernameResult = await checkUsernameAvailability(nextUsername, true);
  if (!usernameResult.ok) {
    showToast(usernameResult.message, "error");
    return;
  }

  const updates = {
    displayName: dom.settingsDisplayName.value.trim() || state.profile?.displayName || "",
    username: usernameResult.username,
    usernameLower: usernameResult.username,
    bio: dom.settingsBio.value.trim(),
    settings: {
      ...state.preferences,
      lastSeen: dom.privacyLastSeen.value || "everyone",
      onlineStatus: dom.privacyOnlineStatus.checked,
      readReceipts: dom.privacyReadReceipts.checked,
      micId: dom.micSelect.value || "",
      cameraId: dom.cameraSelect.value || "",
      speakerId: dom.speakerSelect.value || "",
      theme: dom.themeSelect.value || "aurora"
    },
    updatedAt: serverTimestamp()
  };

  try {
    if (state.selectedProfilePhoto) {
      updates.photoURL = await uploadImageToStorage(state.selectedProfilePhoto, "profile-photos");
    }
    await updateDoc(doc(db, "users", state.currentUser.uid), updates);
    await updateProfile(state.currentUser, {
      displayName: updates.displayName,
      photoURL: updates.photoURL || state.currentUser.photoURL || ""
    }).catch(() => {});
    if (state.profile?.username !== usernameResult.username) {
      await setDoc(doc(db, "usernames", usernameResult.username), {
        uid: state.currentUser.uid,
        username: usernameResult.username,
        updatedAt: serverTimestamp()
      }, { merge: true });
      if (state.profile?.username) {
        await deleteDoc(doc(db, "usernames", state.profile.username)).catch(() => {});
      }
    }
    state.selectedProfilePhoto = null;
    applyTheme(updates.settings.theme);
    showToast("Profile and settings updated.", "success");
    closeDialog(dom.settingsModal);
  } catch (_error) {
    showToast("Profile update failed.", "error");
  }
}

async function loadPaymentHistory() {
  if (!state.currentUser || !dom.paymentHistoryList) {
    return;
  }

  try {
    const token = await state.currentUser.getIdToken();
    state.paymentHistory = await fetchPaymentHistory(token);
    dom.paymentHistoryList.innerHTML = state.paymentHistory.length
      ? state.paymentHistory.map((item) => `
          <div class="stack-item">
            <div class="stack-item-head">
              <strong>${escapeHtml(item.plan || "free")}</strong>
              <span>${escapeHtml(item.status || "created")}</span>
            </div>
            <span>₹${escapeHtml(item.amount || 0)} - ${escapeHtml(item.orderId || "")}</span>
          </div>
        `).join("")
      : '<div class="stack-item"><strong>No payments yet</strong><span>Your verified payment history will appear here.</span></div>';
  } catch (error) {
    dom.paymentHistoryList.innerHTML = `<div class="stack-item"><strong>Payments unavailable</strong><span>${escapeHtml(error.message || "Could not load payment history.")}</span></div>`;
  }
}

async function handleUpgradePlan(planId) {
  if (!state.currentUser) {
    return;
  }

  try {
    const token = await state.currentUser.getIdToken();
    const order = await createPaymentOrder({
      planId,
      authToken: token
    });
    await openRazorpayCheckout({
      planId,
      order,
      user: state.profile,
      authToken: token,
      onVerified: async () => {
        showToast(`${getPlanMeta(planId)?.label || "Plan"} activated.`, "success");
      }
    });
    await loadPaymentHistory();
  } catch (error) {
    showToast(error.message || "Payment could not be completed.", "error");
  }
}

async function enumerateDevicesAndRefresh() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    showToast("Device selection is not supported in this browser.", "info");
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.devices.audioinput = devices.filter((device) => device.kind === "audioinput");
    state.devices.videoinput = devices.filter((device) => device.kind === "videoinput");
    state.devices.audiooutput = devices.filter((device) => device.kind === "audiooutput");
    populateDeviceSelectors();
    await applySelectedSpeaker();
  } catch (_error) {
    showToast("Device list could not be refreshed.", "error");
  }
}

function populateSelectOptions(select, items, placeholder) {
  const currentValue = select.value;
  select.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = placeholder;
  select.appendChild(defaultOption);

  items.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = item.deviceId;
    option.textContent = item.label || `${placeholder} ${index + 1}`;
    select.appendChild(option);
  });

  const desiredValue =
    select === dom.micSelect
      ? state.preferences.micId
      : select === dom.cameraSelect
        ? state.preferences.cameraId
        : state.preferences.speakerId;

  select.value = desiredValue || currentValue || "";
}

function populateDeviceSelectors() {
  populateSelectOptions(dom.micSelect, state.devices.audioinput, "Default microphone");
  populateSelectOptions(dom.cameraSelect, state.devices.videoinput, "Default camera");
  populateSelectOptions(dom.speakerSelect, state.devices.audiooutput, "System default output");

  dom.privacyLastSeen.value = state.preferences.lastSeen || "everyone";
  dom.privacyOnlineStatus.checked = state.preferences.onlineStatus !== false;
  dom.privacyReadReceipts.checked = state.preferences.readReceipts !== false;
  dom.speakerSelect.disabled = !("setSinkId" in HTMLMediaElement.prototype) || !state.devices.audiooutput.length;
}

async function applySelectedSpeaker() {
  if (!("setSinkId" in HTMLMediaElement.prototype)) {
    return;
  }
  const sinkId = dom.speakerSelect.value || "";
  if (!sinkId) {
    return;
  }
  try {
    await dom.remoteVideo.setSinkId(sinkId);
  } catch (_error) {
    showToast("Speaker selection is not available in this browser.", "info");
  }
}

function openLegalDocument(title, content) {
  dom.legalTitle.textContent = title;
  dom.legalContent.textContent = content.trim();
  openDialog(dom.legalModal);
}

function renderSignedOutState() {
  cleanupSessionState();
  startupLog("Showing login");
  showLogin();
  setAuthFeedback("");
  setBootProgress(100, "Ready to sign in.");
  state.authReady = true;
}

async function renderSignedInState(user) {
  state.currentUser = user;
  setBootProgress(78, "Syncing your account...");
  startupLog("Loading signed-in shell");
  state.profile = buildFallbackProfile(user);
  state.preferences = {
    ...state.preferences,
    ...(state.profile.settings || {})
  };
  startupLog("Showing app");
  showApp();
  renderSignedInShell();
  try {
    await ensureUserDocument(user);
    renderSignedInShell();
  } catch (error) {
    if (isRecoverableFirestoreError(error)) {
      startupLog("Profile sync deferred", error, "warn");
      showToast("You're signed in, but profile sync is delayed. Using fallback workspace data.", "info");
    } else {
      throw error;
    }
  }
  await Promise.allSettled([
    safeModuleInit("profile-subscription", async () => startProfileSubscription()),
    safeModuleInit("users-subscription", async () => startUsersSubscription()),
    safeModuleInit("friendships-subscription", async () => startFriendshipsSubscription()),
    safeModuleInit("conversations-subscription", async () => startConversationsSubscription()),
    safeModuleInit("rooms-subscription", async () => startRoomsSubscription()),
    safeModuleInit("incoming-calls-subscription", async () => startIncomingCallsSubscription()),
    safeModuleInit("challenge-subscription", async () => startChallengeSubscription()),
    safeModuleInit("presence", async () => updatePresence(true))
  ]);
  setBootProgress(92, "Loading workspace modules...");
  queueDeferredStartupModules();
  state.authReady = true;
  setBootProgress(100, "Workspace ready.");
  startupLog("Startup checks complete");
}

function cleanupSessionState() {
  Object.keys(state.unsubscribers).forEach((key) => {
    if (typeof state.unsubscribers[key] === "function") {
      state.unsubscribers[key]();
    }
    state.unsubscribers[key] = null;
  });

  clearActiveConversationSubscriptions();
  cleanupCallResources();
  state.currentUser = null;
  state.profile = null;
  state.users = [];
  state.userMap.clear();
  state.conversations = [];
  state.friendships = [];
  state.friends = [];
  state.friendRequests = [];
  state.rooms = [];
  state.activeRoomId = null;
  state.activeRoom = null;
  state.roomMessages = [];
  state.aiMessages = [];
  state.aiUsageToday = 0;
  state.paymentHistory = [];
  state.todayChallenge = null;
  state.ticTacToe = createTicTacToeState();
  state.quizIndex = 0;
  state.activeSection = "chats";
  state.moduleStatus = {};
  state.deferredModulesQueued = false;
  state.activeConversationId = null;
  state.activeConversation = null;
  state.activePeerId = null;
  state.messages = [];
  state.replyMessageId = null;
  state.editingMessageId = null;
  state.incomingCall = null;
  renderIncomingCall();
  renderContacts();
  renderConversationList();
  renderMessages();
  renderActiveConversationHeader();
  showConversationShell(false);
}

async function handleAuthStateChanged(user) {
  try {
    startupLog("Auth state checked", user ? "signed-in" : "signed-out");
    window.clearTimeout(state.startupWatchdog);
    if (!user) {
      renderSignedOutState();
      return;
    }
    await renderSignedInState(user);
  } catch (error) {
    startupLog("Startup error", error, "error");
    if (state.currentUser) {
      showApp();
      showErrorBanner("Workspace sync is unavailable right now. You can still use the shell and auth controls.");
      setBootProgress(100, "Workspace loaded with limited connectivity.");
      state.authReady = true;
      return;
    }
    renderSignedOutState();
    setAuthFeedback("We couldn't restore your session cleanly. Please sign in again.", "error");
  } finally {
    state.initializing = false;
  }
}

function setAuthTab(tab) {
  const showSignin = tab === "signin";
  dom.showSigninBtn.classList.toggle("active", showSignin);
  dom.showSignupBtn.classList.toggle("active", !showSignin);
  dom.signinForm.classList.toggle("hidden-auth", !showSignin);
  dom.signupForm.classList.toggle("hidden-auth", showSignin);
  setAuthFeedback("");
}

function startRingtone() {
  stopRingtone();
  try {
    const context = new AudioContext();
    let active = true;

    const playBeep = () => {
      if (!active) {
        return;
      }
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 660;
      oscillator.connect(gain);
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, context.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.45);
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + 0.45);
      window.setTimeout(playBeep, 1400);
    };

    playBeep();
    startRingtone.context = context;
    startRingtone.stop = () => {
      active = false;
      context.close().catch(() => {});
    };
  } catch (_error) {
    return;
  }
}

function stopRingtone() {
  if (typeof startRingtone.stop === "function") {
    startRingtone.stop();
  }
  startRingtone.stop = null;
  startRingtone.context = null;
}

async function installServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    try {
      await navigator.serviceWorker.register("./sw.js?v=3");
    } catch (_error) {
      return;
    }
  }
}

function bindStaticEvents() {
  if (state.eventsBound) {
    return;
  }
  state.eventsBound = true;
  dom.showSigninBtn.addEventListener("click", () => setAuthTab("signin"));
  dom.showSignupBtn.addEventListener("click", () => setAuthTab("signup"));
  dom.signinForm.addEventListener("submit", handleSignin);
  dom.signupForm.addEventListener("submit", handleSignup);
  dom.googleSigninBtn.addEventListener("click", handleGoogleAuth);
  dom.googleSignupBtn.addEventListener("click", handleGoogleAuth);
  dom.forgotPasswordBtn.addEventListener("click", handlePasswordReset);
  dom.signupUsername.addEventListener("input", handleUsernameInput);
  dom.userSearch.addEventListener("input", () => {
    state.searchTerm = dom.userSearch.value.trim();
    window.clearTimeout(state.userSearchTimer);
    state.userSearchTimer = window.setTimeout(() => {
      runUserSearch(state.searchTerm).catch((error) => {
        startupLog("User search failed", error, "warn");
        renderContacts();
        renderConversationList();
      });
    }, 160);
  });
  dom.newChatBtn.addEventListener("click", () => {
    dom.userSearch.focus();
    dom.userSearch.select();
    showToast("Search for a user in the contacts list to start a chat.", "info");
  });
  dom.settingsBtn.addEventListener("click", () => openDialog(dom.settingsModal));
  dom.profileButton.addEventListener("click", () => openDialog(dom.settingsModal));
  dom.saveSettingsBtn.addEventListener("click", saveProfileSettings);
  dom.closeUserProfileBtn?.addEventListener("click", () => closeDialog(dom.userProfileModal));
  dom.refreshDevicesBtn.addEventListener("click", () => {
    enumerateDevicesAndRefresh().then(() => showToast("Device list refreshed.", "success"));
  });
  dom.refreshDevicesInsideBtn.addEventListener("click", () => {
    enumerateDevicesAndRefresh().then(() => showToast("Device list refreshed.", "success"));
  });
  dom.mobileOpenSidebar.addEventListener("click", openSidebar);
  dom.mobileCloseSidebar.addEventListener("click", closeSidebar);
  dom.drawerOverlay.addEventListener("click", closeSidebar);
  dom.composerForm.addEventListener("submit", handleSendMessage);
  dom.attachImageBtn.addEventListener("click", () => dom.imageUploadInput.click());
  dom.imageUploadInput.addEventListener("change", () => {
    state.selectedMessageImage = dom.imageUploadInput.files?.[0] || null;
    if (state.selectedMessageImage) {
      showToast(`Selected ${state.selectedMessageImage.name}. Use the main send button or image button again to send.`, "info");
    }
  });
  dom.messageInput.addEventListener("input", () => {
    autoResizeComposer();
    updateTypingPresence().catch(() => {});
  });
  dom.messageInput.addEventListener("blur", () => {
    updateTypingPresence().catch(() => {});
  });
  dom.cancelReplyBtn?.addEventListener("click", () => clearComposerMode(true));
  dom.voiceCallBtn.addEventListener("click", () => startCall("audio"));
  dom.videoCallBtn.addEventListener("click", () => startCall("video"));
  dom.rejectCallBtn.addEventListener("click", rejectIncomingCall);
  dom.acceptCallBtn.addEventListener("click", acceptIncomingCall);
  dom.toggleMicBtn.addEventListener("click", toggleMicrophone);
  dom.toggleCameraBtn.addEventListener("click", toggleCamera);
  dom.shareScreenBtn.addEventListener("click", startScreenShare);
  dom.stopSharingBtn.addEventListener("click", () => stopScreenShare().catch(() => {}));
  dom.endCallBtn.addEventListener("click", () => finalizeCall("ended").catch(() => {}));
  dom.roomComposerForm.addEventListener("submit", sendRoomMessage);
  dom.addRoomMemberBtn.addEventListener("click", addRoomMember);
  dom.renameRoomBtn?.addEventListener("click", renameActiveRoom);
  dom.removeRoomMemberBtn?.addEventListener("click", removeRoomMember);
  dom.createRoomBtn.addEventListener("click", () => createRoom("group"));
  dom.createGroupRoomBtn.addEventListener("click", () => createRoom("group"));
  dom.createGamingRoomBtn.addEventListener("click", () => createRoom("gaming"));
  dom.createStudyRoomBtn.addEventListener("click", () => createRoom("study"));
  dom.scannerRunBtn.addEventListener("click", handleScannerRun);
  dom.aiComposerForm.addEventListener("submit", handleAiSubmit);
  dom.aiBotList.querySelectorAll(".ai-bot-btn").forEach((button) => {
    button.addEventListener("click", () => setAiBot(button.dataset.bot));
  });
  dom.ticBoard.querySelectorAll(".tic-cell").forEach((button) => {
    button.addEventListener("click", () => handleTicCell(Number(button.dataset.cell)));
  });
  dom.resetTicBtn.addEventListener("click", resetTicTacToe);
  document.querySelectorAll(".rps-btn").forEach((button) => {
    button.addEventListener("click", () => handleRpsMove(button.dataset.move));
  });
  dom.nextQuizBtn.addEventListener("click", nextQuiz);
  dom.refreshChallengesBtn.addEventListener("click", renderChallenges);
  dom.refreshPaymentsBtn.addEventListener("click", loadPaymentHistory);
  dom.buyModerateBtn.addEventListener("click", () => handleUpgradePlan("moderate"));
  dom.buyPremiumBtn.addEventListener("click", () => handleUpgradePlan("premium"));
  dom.selectSignupPhotoBtn.addEventListener("click", () => dom.signupPhotoInput.click());
  dom.signupPhotoInput.addEventListener("change", () => {
    state.selectedSignupPhoto = dom.signupPhotoInput.files?.[0] || null;
    previewFileAvatar(state.selectedSignupPhoto, dom.signupPhotoPreview);
  });
  dom.changePhotoBtn.addEventListener("click", () => dom.profilePhotoInput.click());
  dom.profilePhotoInput.addEventListener("change", () => {
    state.selectedProfilePhoto = dom.profilePhotoInput.files?.[0] || null;
    previewFileAvatar(state.selectedProfilePhoto, dom.settingsPhotoPreview, state.profile);
  });
  [
    ["chats", dom.navChatsBtn, dom.mobileNavChatsBtn],
    ["friends", dom.navFriendsBtn, dom.mobileNavFriendsBtn],
    ["rooms", dom.navRoomsBtn],
    ["ai", dom.navAiBtn, dom.mobileNavAiBtn],
    ["games", dom.navGamesBtn, dom.mobileNavGamesBtn],
    ["challenges", dom.navChallengesBtn],
    ["premium", dom.navPremiumBtn, dom.mobileNavPremiumBtn]
  ].forEach(([section, ...buttons]) => {
    buttons.filter(Boolean).forEach((button) => {
      button.addEventListener("click", () => setActiveSection(section));
    });
  });
  dom.logoutBtn.addEventListener("click", async () => {
    if (state.currentUser) {
      await updatePresence(false, true);
    }
    await signOut(auth).catch(() => {});
  });
  dom.openTermsLink.addEventListener("click", () => openLegalDocument("Terms of Service", TERMS_TEXT));
  dom.openPrivacyLink.addEventListener("click", () => openLegalDocument("Privacy Policy", PRIVACY_TEXT));
  dom.bootRetryBtn?.addEventListener("click", () => {
    window.location.reload();
  });
  dom.closeLegalBtn.addEventListener("click", () => closeDialog(dom.legalModal));
  dom.settingsModal.addEventListener("close", populateDeviceSelectors);
  dom.privacyOnlineStatus.addEventListener("change", () => {
    if (!dom.privacyOnlineStatus.checked) {
      dom.privacyLastSeen.value = "nobody";
    }
  });
  dom.themeSelect.addEventListener("change", () => applyTheme(dom.themeSelect.value));

  window.addEventListener("online", () => {
    applyOfflineState();
    updatePresence(true).catch(() => {});
  });
  window.addEventListener("offline", () => {
    applyOfflineState();
    showToast("You are offline. Calls may disconnect.", "info");
  });
  window.addEventListener("beforeunload", () => {
    if (state.currentUser) {
      updatePresence(false, true).catch(() => {});
    }
    cleanupCallResources();
  });
  document.addEventListener("visibilitychange", () => {
    if (!state.currentUser) {
      return;
    }
    updatePresence(document.visibilityState === "visible").catch(() => {});
  });
}

async function init() {
  if (state.initStarted) {
    startupLog("Init skipped", "already started");
    return;
  }
  state.initStarted = true;
  startupLog("DOM loaded");
  cacheDom();
  validateCriticalDom();
  installGlobalErrorHandlers();
  bindStaticEvents();
  applyOfflineState();
  setAuthTab("signin");
  showSplash("Starting up...", "Preparing Z Chat runtime...");
  setBootProgress(10, "Checking runtime...");

  if (location.protocol === "file:") {
    startupLog("Startup error", "file:// is not supported", "error");
    showStartupError(
      "Open Z Chat through localhost, Live Server, or another local HTTP server.",
      "file:// is not supported for Firebase modules and WebRTC."
    );
    return;
  }

  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    showErrorBanner("Camera and microphone access require localhost or HTTPS.");
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    startupLog("Startup error", "media APIs unavailable", "error");
    showStartupError(
      "This browser does not support the media APIs required for calling.",
      "Use a modern browser with camera, microphone, and WebRTC support."
    );
    return;
  }

  if (firebaseInitError || !auth || !db) {
    startupLog("Startup error", firebaseInitError || "Firebase services unavailable", "error");
    showStartupError(
      "Firebase failed to initialize.",
      "Check firebase.js configuration and browser network access."
    );
    return;
  }

  setBootProgress(25, "Preparing device access...");
  startupLog("Preparing device access");
  await enumerateDevicesAndRefresh();

  setBootProgress(45, "Connecting to Firebase...");
  startupLog("Firebase initialized");
  window.clearTimeout(state.startupWatchdog);
  state.startupWatchdog = window.setTimeout(() => {
    if (!state.authReady && state.initializing) {
      startupLog("Startup error", "watchdog expired", "error");
      showStartupError(
        "Startup failed. Please refresh or check configuration.",
        "The auth or Firebase startup step took too long."
      );
    }
  }, 7000);
  startupLog("Auth listener attached");
  onAuthStateChanged(auth, (user) => {
    handleAuthStateChanged(user).catch(() => {
      showStartupError(
        "Authentication state could not be restored.",
        "Please refresh and check your Firebase Authentication setup."
      );
    });
  });

  await installServiceWorker();
  await delay(350);
  setBootProgress(65, "Waiting for your session...");
  startupLog("Waiting for auth session");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  startupLog("DOMContentLoaded already fired, running init immediately");
  init().catch((error) => {
    startupLog("Startup error", error, "error");
    showStartupError(
      "Startup failed before the app could finish booting.",
      "Please refresh or check browser console logs for details."
    );
  });
}
