<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import ChatBubble from "./ChatMessage.vue";
import CatchupTimer from "./CatchupTimer.vue";
import DoodlePad from "./DoodlePad.vue";
import SearchHighlight from "./SearchHighlight.vue";
import ToastNotice from "./ToastNotice.vue";
import { buildConversations } from "./conversations.ts";
import { getSearchTarget, searchConversations } from "./search.ts";
import { useTheme } from "./theme.ts";
import { api, describeError, isApiError, type Credentials, type Dashboard, type MessageRow } from "./api.ts";
import type { Drawing } from "../../src/shared/drawing.ts";

const { theme, toggleTheme } = useTheme();
const authMode = ref<"login" | "register">("login");
const authUsername = ref("");
const authPassword = ref("");
const credentials = ref<Credentials | null>(null);
const dashboard = ref<Dashboard>({ incoming: [], sent: [], saved: [], windows: [] });
const selectedUsername = ref<string | null>(null);
const draftUsernames = ref<string[]>([]);
const messageDrafts = ref<Record<string, string>>(Object.create(null));
const drawingDrafts = ref<Record<string, Drawing | null>>(Object.create(null));
const composerModes = ref<Record<string, "text" | "draw">>(Object.create(null));
const chatSearch = ref("");
const chatError = ref("");
const checkingUsername = ref(false);
const savedOnly = ref(false);
const busy = ref(false);
const loadingDashboard = ref(false);
const error = ref("");
const notice = ref("");
const updatesError = ref("");
const now = ref(Date.now());
const threadScroll = ref<HTMLElement | null>(null);
const messageInput = ref<HTMLTextAreaElement | null>(null);
let jumpingToSearchResult = false;
let sessionVersion = 0;
let dashboardVersion = 0;
let dashboardRequests = 0;
let usernameLookupVersion = 0;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let clockTimer: ReturnType<typeof setInterval> | undefined;

const currentWindow = computed(() => dashboard.value.windows.find((window) => new Date(window.expiresAt).getTime() > now.value));
const savedIds = computed(() => new Set(dashboard.value.saved.map((message) => message.message)));
// The server's dashboard already excludes held incoming messages. Building
// chats from these rows cannot reveal another friend's pending share.
const conversations = computed(() => buildConversations(dashboard.value, draftUsernames.value));
const filteredConversations = computed(() => searchConversations(conversations.value, chatSearch.value));
const searchTarget = computed(() => getSearchTarget(filteredConversations.value, chatSearch.value));
const searchHint = computed(() => {
  if (checkingUsername.value) return "Checking username…";
  if (!chatSearch.value.trim()) return "Search names or messages. Enter a username to start a chat.";
  if (searchTarget.value) return `Enter to open @${searchTarget.value.username}.`;
  return "Click a result to open it. Enter to start a chat by username.";
});
const selectedConversation = computed(() => conversations.value.find((conversation) => conversation.username === selectedUsername.value) ?? null);
const threadMessages = computed(() => {
  const messages = selectedConversation.value?.messages ?? [];
  return savedOnly.value ? messages.filter((message) => message.direction === "incoming" && savedIds.value.has(message.message)) : messages;
});
const activeDraft = computed({
  get: () => selectedUsername.value ? messageDrafts.value[selectedUsername.value] ?? "" : "",
  set: (value: string) => { if (selectedUsername.value) messageDrafts.value[selectedUsername.value] = value; },
});
const composerMode = computed({
  get: () => selectedUsername.value ? composerModes.value[selectedUsername.value] ?? "text" : "text",
  set: (value: "text" | "draw") => { if (selectedUsername.value) composerModes.value[selectedUsername.value] = value; },
});
const activeDrawing = computed({
  get: () => selectedUsername.value ? drawingDrafts.value[selectedUsername.value] ?? null : null,
  set: (value: Drawing | null) => { if (selectedUsername.value) drawingDrafts.value[selectedUsername.value] = value; },
});
const canSend = computed(() => Boolean(selectedConversation.value) && !busy.value && (
  composerMode.value === "draw" ? activeDrawing.value !== null : activeDraft.value.trim().length > 0 && activeDraft.value.length <= 2000
));

function nearBottom() {
  const area = threadScroll.value;
  return !area || area.scrollHeight - area.scrollTop - area.clientHeight < 100;
}

async function scrollToLatest() {
  await nextTick();
  const area = threadScroll.value;
  if (area) area.scrollTop = area.scrollHeight;
}

// Keep reading position when a poll adds messages above the visible area.
// Selecting a friend and sending explicitly move to the latest message.
watch(() => threadMessages.value.map((message) => message.message).join("|"), () => {
  if (!jumpingToSearchResult && nearBottom()) void scrollToLatest();
});

async function selectConversation(username: string, matchingMessage?: string) {
  cancelUsernameCheck();
  jumpingToSearchResult = Boolean(matchingMessage);
  selectedUsername.value = username;
  savedOnly.value = false;
  error.value = "";
  if (matchingMessage) {
    await nextTick();
    if (selectedUsername.value === username) {
      document.getElementById(`message-${matchingMessage}`)?.scrollIntoView({ block: "center" });
    }
    jumpingToSearchResult = false;
  } else {
    void scrollToLatest();
  }
}

function cancelUsernameCheck() {
  usernameLookupVersion += 1;
  checkingUsername.value = false;
}

async function openChatSearch() {
  if (!credentials.value || busy.value || checkingUsername.value) return;
  if (!chatSearch.value.trim()) return;
  chatError.value = "";
  if (searchTarget.value) {
    const target = searchTarget.value;
    await selectConversation(target.username, target.matchCount ? target.previewMessage?.message : undefined);
    return;
  }
  await startChatWithUsername();
}

async function startChatWithUsername() {
  if (!credentials.value || busy.value || checkingUsername.value) return;
  chatError.value = "";
  const username = chatSearch.value.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    chatError.value = "Use a username with 3–24 letters, numbers, or underscores.";
    return;
  }
  if (username === credentials.value?.username) {
    chatError.value = "Choose a friend's username. You can't chat with yourself.";
    return;
  }
  const requestedSession = sessionVersion;
  const requestedLookup = ++usernameLookupVersion;
  checkingUsername.value = true;
  try {
    const result = await api.catchup.checkUsername({ ...credentials.value, recipientUsername: username }, { timeoutMs: 10000 });
    if (requestedSession !== sessionVersion || requestedLookup !== usernameLookupVersion) return;
    if ("error" in result) {
      chatError.value = describeError(result);
      return;
    }
    if (!result.exists) {
      chatError.value = `No account found for @${username}. Check the username and try again.`;
      return;
    }
    if (!draftUsernames.value.includes(username)) draftUsernames.value.push(username);
    chatSearch.value = "";
    selectConversation(username);
    void nextTick(() => messageInput.value?.focus());
  } finally {
    if (requestedLookup === usernameLookupVersion) checkingUsername.value = false;
  }
}

function backToChats() {
  cancelUsernameCheck();
  selectedUsername.value = null;
  savedOnly.value = false;
  error.value = "";
}

function toggleSavedOnly() {
  savedOnly.value = !savedOnly.value;
  void scrollToLatest();
}

function listTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date(now.value);
  const sameDay = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  return new Intl.DateTimeFormat(undefined, sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" }).format(date);
}

function resetDashboard() {
  dashboard.value = { incoming: [], sent: [], saved: [], windows: [] };
}

function signOut() {
  cancelUsernameCheck();
  sessionVersion += 1;
  dashboardVersion += 1;
  credentials.value = null;
  authMode.value = "login";
  authPassword.value = "";
  selectedUsername.value = null;
  draftUsernames.value = [];
  messageDrafts.value = Object.create(null);
  drawingDrafts.value = Object.create(null);
  composerModes.value = Object.create(null);
  chatSearch.value = "";
  chatError.value = "";
  savedOnly.value = false;
  resetDashboard();
  busy.value = false;
  loadingDashboard.value = false;
  error.value = "";
  notice.value = "";
  updatesError.value = "";
}

async function refreshDashboard(quiet = false) {
  if (!credentials.value) return;
  const requestedSession = sessionVersion;
  const requestedDashboard = ++dashboardVersion;
  dashboardRequests += 1;
  if (!quiet) loadingDashboard.value = true;
  try {
    const result = await api.catchup.dashboard({ ...credentials.value }, { timeoutMs: 10000 });
    if (requestedSession !== sessionVersion || requestedDashboard !== dashboardVersion) return;
    if ("error" in result) {
      if (result.error === "UNAUTHORIZED") {
        signOut();
        error.value = "Please sign in again to continue.";
      } else {
        updatesError.value = describeError(result);
      }
      return;
    }
    now.value = Date.now();
    dashboard.value = result;
    updatesError.value = "";
  } finally {
    dashboardRequests -= 1;
    if (requestedSession === sessionVersion && requestedDashboard === dashboardVersion) loadingDashboard.value = false;
  }
}

async function authenticate() {
  if (busy.value) return;
  error.value = "";
  busy.value = true;
  const input = { username: authUsername.value.trim(), password: authPassword.value };
  const requestedSession = sessionVersion;
  try {
    const result = authMode.value === "register"
      ? await api.catchup.register(input, { timeoutMs: 10000 })
      : await api.catchup.login(input, { timeoutMs: 10000 });
    if (requestedSession !== sessionVersion) return;
    if ("error" in result) {
      error.value = describeError(result);
      return;
    }
    sessionVersion += 1;
    credentials.value = { ...input, username: result.username };
    authPassword.value = "";
    notice.value = authMode.value === "register" ? "Account created. Start a chat with a friend's username." : "";
    await refreshDashboard();
  } finally {
    busy.value = false;
  }
}

async function perform(action: (auth: Credentials) => Promise<unknown>, success: string, after?: () => void) {
  if (!credentials.value || busy.value) return false;
  error.value = "";
  notice.value = "";
  busy.value = true;
  const requestedSession = sessionVersion;
  try {
    const result = await action({ ...credentials.value });
    if (requestedSession !== sessionVersion) return false;
    if (isApiError(result)) {
      error.value = describeError(result);
      return false;
    }
    after?.();
    notice.value = success;
    await refreshDashboard();
    return requestedSession === sessionVersion;
  } finally {
    if (requestedSession === sessionVersion) busy.value = false;
  }
}

async function sendMessage() {
  if (!canSend.value || !selectedUsername.value) return;
  const recipientUsername = selectedUsername.value;
  const draft = messageDrafts.value[recipientUsername] ?? "";
  const drawing = drawingDrafts.value[recipientUsername] ?? null;
  const mode = composerMode.value;
  const sent = await perform(
    (auth) => mode === "draw" && drawing
      ? api.catchup.sendDrawing({ ...auth, recipientUsername, drawing }, { timeoutMs: 10000 })
      : api.catchup.send({ ...auth, recipientUsername, text: draft.trim() }, { timeoutMs: 10000 }),
    "",
    () => {
      // Keep drafts for other friends and retain this draft if sending fails.
      if (mode === "draw") {
        if (drawingDrafts.value[recipientUsername] === drawing) drawingDrafts.value[recipientUsername] = null;
      } else if (messageDrafts.value[recipientUsername] === draft) {
        messageDrafts.value[recipientUsername] = "";
      }
    },
  );
  if (sent && selectedUsername.value === recipientUsername) {
    savedOnly.value = false;
    await scrollToLatest();
    if (mode === "text") messageInput.value?.focus();
  }
}

function onComposerKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void sendMessage();
  }
}

async function startCatchup() {
  await perform((auth) => api.catchup.startCatchup(auth, { timeoutMs: 10000 }), "Your 15-minute window is open for all friends.");
}

async function endCatchup() {
  const window = currentWindow.value?.window;
  if (!window) return;
  await perform((auth) => api.catchup.endCatchup({ ...auth, window }, { timeoutMs: 10000 }), "Catch-up ended. Messages already available stay in your chats.");
}

async function saveMessage(message: MessageRow) {
  await perform((auth) => api.catchup.save({ ...auth, message: message.message }, { timeoutMs: 10000 }), "Message saved in this chat.");
}

async function removeSaved(message: MessageRow) {
  await perform((auth) => api.catchup.removeSaved({ ...auth, message: message.message }, { timeoutMs: 10000 }), "Removed from saved. The message stays in this chat.");
}

function changeAuthMode(mode: "login" | "register") {
  authMode.value = mode;
  error.value = "";
}

onMounted(() => {
  clockTimer = setInterval(() => { now.value = Date.now(); }, 1000);
  pollTimer = setInterval(() => {
    if (credentials.value && !busy.value && dashboardRequests === 0 && !document.hidden) void refreshDashboard(true);
  }, 3000);
});

onUnmounted(() => {
  cancelUsernameCheck();
  clearInterval(clockTimer);
  clearInterval(pollTimer);
});
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <CatchupTimer v-if="credentials" :window="currentWindow" :now="now" :busy="busy" @start="startCatchup" @end="endCatchup" />
      <div class="header-actions">
        <div v-if="credentials" class="account-controls">
          <span class="signed-in-user">@{{ credentials.username }}</span>
          <button class="quiet-button" :disabled="busy" @click="signOut">Sign out</button>
        </div>
        <button class="theme-toggle" type="button"
          :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme">
          <svg v-if="theme === 'light'" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.2 14A8.5 8.5 0 0 1 10 3.8 8.5 8.5 0 1 0 20.2 14Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          <span>{{ theme === 'dark' ? 'Light mode' : 'Dark mode' }}</span>
        </button>
      </div>
    </header>

    <main v-if="!credentials" class="auth-layout">
      <section class="auth-panel" aria-labelledby="auth-title">
        <h1 id="auth-title">{{ authMode === 'login' ? 'Sign in' : 'Create an account' }}</h1>
        <p class="auth-subtitle">Share when you think of it. Catch up when you choose.</p>
        <div class="auth-switch" aria-label="Account action">
          <button :class="{ active: authMode === 'login' }" :aria-pressed="authMode === 'login'" :disabled="busy" @click="changeAuthMode('login')">Sign in</button>
          <button :class="{ active: authMode === 'register' }" :aria-pressed="authMode === 'register'" :disabled="busy" @click="changeAuthMode('register')">Create account</button>
        </div>
        <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
        <form class="auth-form" @submit.prevent="authenticate">
          <label for="auth-username">Username</label>
          <input id="auth-username" v-model="authUsername" type="text" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" spellcheck="false" :disabled="busy" placeholder="your_username" />
          <p v-if="authMode === 'register'" class="field-hint">3–24 letters, numbers, or underscores. Usernames ignore case.</p>
          <label for="auth-password">Password</label>
          <input id="auth-password" v-model="authPassword" type="password" :autocomplete="authMode === 'register' ? 'new-password' : 'current-password'" required minlength="8" maxlength="128" :disabled="busy" placeholder="Your password" />
          <p v-if="authMode === 'register'" class="field-hint">Use at least 8 characters for your password.</p>
          <button class="primary-button auth-submit" :disabled="busy || !authUsername.trim() || !authPassword" type="submit">{{ busy ? 'One moment…' : authMode === 'login' ? 'Sign in' : 'Create account' }}</button>
        </form>
      </section>
    </main>

    <main v-else class="dashboard-layout">
      <h1 class="sr-only">Your chats</h1>
      <div v-if="error || updatesError" class="feedback-stack" aria-live="polite">
        <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
        <p v-if="updatesError" class="error-banner" role="status">{{ updatesError }} <button class="text-button" :disabled="loadingDashboard || busy" @click="refreshDashboard()">Try again</button></p>
      </div>

      <div class="chat-workspace" :class="{ 'has-active-thread': selectedConversation, 'drawing-mode': selectedConversation && composerMode === 'draw' }">
        <aside class="conversation-sidebar" aria-labelledby="chats-title">
          <div class="conversation-tools">
            <h2 id="chats-title">Chats</h2>
            <label class="sr-only" for="chat-search">Find or start a chat by username, or search message text</label>
            <form class="chat-search" role="search" :aria-busy="checkingUsername" @submit.prevent="openChatSearch">
              <svg class="chat-search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              <input id="chat-search" v-model="chatSearch" type="search" placeholder="Find or start a chat" autocomplete="off" spellcheck="false" :disabled="busy" :aria-invalid="Boolean(chatError)" :aria-describedby="chatError ? 'chat-search-hint chat-search-error' : 'chat-search-hint'" @input="cancelUsernameCheck(); chatError = ''" />
              <button class="chat-search-submit" type="submit" :disabled="busy || checkingUsername || !chatSearch.trim()" :aria-label="searchTarget ? 'Open chat with this username' : 'Start chat by username'" :title="searchTarget ? 'Open chat with this username' : 'Start chat by username'"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path :d="searchTarget ? 'M4 10h12m-5-5 5 5-5 5' : 'M10 4v12M4 10h12'" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
            </form>
            <p id="chat-search-hint" class="search-hint" role="status">{{ searchHint }}</p>
            <p v-if="chatError" id="chat-search-error" class="chat-form-error" role="alert">{{ chatError }}</p>
          </div>
          <div class="conversation-list">
            <p v-if="loadingDashboard && !conversations.length" class="conversation-empty" role="status">Loading chats…</p>
            <p v-else-if="!conversations.length" class="conversation-empty">No chats yet. Start one with a friend's username.</p>
            <p v-else-if="!filteredConversations.length" class="conversation-empty" role="status">No matching chats.</p>
            <button v-for="conversation in filteredConversations" :key="conversation.username" class="conversation-row" :class="{ selected: selectedUsername === conversation.username, 'conversation-search-result': chatSearch.trim() }" :aria-current="selectedUsername === conversation.username ? 'true' : undefined" @click="selectConversation(conversation.username, chatSearch.trim() && conversation.matchCount ? conversation.previewMessage?.message : undefined)">
              <span class="conversation-details">
                <span class="conversation-row-heading"><strong><SearchHighlight :text="`@${conversation.username}`" :query="chatSearch" /></strong><time v-if="conversation.previewMessage" :datetime="conversation.previewMessage.createdAt">{{ listTime(conversation.previewMessage.createdAt) }}</time></span>
                <span class="conversation-preview"><template v-if="conversation.previewMessage">{{ conversation.previewMessage.direction === 'outgoing' ? 'You: ' : '' }}<span v-if="conversation.previewMessage.drawing" class="drawing-preview">{{ conversation.previewText }}</span><SearchHighlight v-else :text="conversation.previewText" :query="chatSearch" /></template><template v-else>Start with a thought or a link</template></span>
              </span>
            </button>
          </div>
        </aside>

        <section class="chat-thread" aria-labelledby="thread-title">
          <template v-if="selectedConversation">
            <header class="thread-header">
              <button class="chat-back" type="button" aria-label="Back to chats" @click="backToChats"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m12 4-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Chats</span></button>
              <h2 id="thread-title"><SearchHighlight :text="`@${selectedConversation.username}`" :query="chatSearch" /></h2>
              <button class="saved-toggle" :class="{ active: savedOnly }" type="button" aria-label="Show saved messages only" :aria-pressed="savedOnly" @click="toggleSavedOnly"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 3h10v14l-5-3-5 3V3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg><span>Saved only</span></button>
            </header>
            <div ref="threadScroll" class="thread-messages" role="region" tabindex="0" :aria-label="`Messages with ${selectedConversation.username}`">
              <p v-if="savedOnly && !threadMessages.length" class="thread-empty">No saved messages in this chat. Save a received message to find it here.</p>
              <p v-else-if="!threadMessages.length" class="thread-empty">Write your first message to @{{ selectedConversation.username }}.</p>
              <ChatBubble v-for="message in threadMessages" :key="message.message" :message="message" :search-query="chatSearch" :saved="savedIds.has(message.message)" :busy="busy" @save="saveMessage" @remove="removeSaved" />
            </div>
            <form class="chat-composer" @submit.prevent="sendMessage">
              <div class="composer-modes" role="group" aria-label="Message format">
                <button class="composer-mode" :class="{ active: composerMode === 'text' }" type="button" :aria-pressed="composerMode === 'text'" :disabled="busy" @click="composerMode = 'text'">Text</button>
                <button class="composer-mode" :class="{ active: composerMode === 'draw' }" type="button" :aria-pressed="composerMode === 'draw'" :disabled="busy" @click="composerMode = 'draw'">Draw</button>
              </div>
              <template v-if="composerMode === 'text'">
                <label class="sr-only" for="chat-message">Message @{{ selectedConversation.username }}</label>
                <div class="composer-input-row"><textarea id="chat-message" ref="messageInput" v-model="activeDraft" maxlength="2000" rows="2" :placeholder="`Message @${selectedConversation.username}…`" :disabled="busy" aria-describedby="composer-hint" @keydown="onComposerKeydown"></textarea><button class="primary-button send-button" type="submit" :disabled="!canSend"><span>Send</span><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m3 4 14 6-14 6 2-6-2-6Zm2 6h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
                <p id="composer-hint" class="composer-hint"><span>Enter to send · Shift+Enter for a new line</span><span>{{ activeDraft.length.toLocaleString() }} / 2,000</span></p>
              </template>
              <div v-else class="drawing-composer">
                <DoodlePad :key="selectedConversation.username" v-model="activeDrawing" :disabled="busy" />
                <div class="drawing-send-row"><button class="primary-button send-button" type="submit" :disabled="!canSend">Send drawing</button></div>
              </div>
            </form>
          </template>
          <div v-else class="no-chat-selected"><svg viewBox="0 0 56 56" fill="none" aria-hidden="true"><path d="M10 12h36v26H28L17 46v-8h-7V12Z" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/><path d="M19 22h18M19 29h11" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg><h2 id="thread-title">A little space for your friends.</h2><p>Choose a chat or start one by username. Catch up when you're ready.</p></div>
        </section>
      </div>
    </main>
    <ToastNotice :message="notice" @dismiss="notice = ''" />
  </div>
</template>
