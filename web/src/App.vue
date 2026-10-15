<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import MessageCard from "./MessageCard.vue";
import { api, describeError, isApiError, type Credentials, type Dashboard, type MessageRow } from "./api.ts";

type Tab = "inbox" | "sent" | "saved";
const tab = ref<Tab>("inbox");
const authMode = ref<"login" | "register">("login");
const authUsername = ref("");
const authPassword = ref("");
const credentials = ref<Credentials | null>(null);
const dashboard = ref<Dashboard>({ incoming: [], sent: [], saved: [], windows: [] });
const recipient = ref("");
const text = ref("");
const busy = ref(false);
const loadingDashboard = ref(false);
const error = ref("");
const notice = ref("");
const updatesError = ref("");
const now = ref(Date.now());
let sessionVersion = 0;
let dashboardVersion = 0;
let dashboardRequests = 0;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let clockTimer: ReturnType<typeof setInterval> | undefined;

const currentWindow = computed(() => dashboard.value.windows.find((window) => new Date(window.expiresAt).getTime() > now.value));
const countdown = computed(() => {
  if (!currentWindow.value) return "";
  const seconds = Math.min(15 * 60, Math.max(0, Math.ceil((new Date(currentWindow.value.expiresAt).getTime() - now.value) / 1000)));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
});
const savedIds = computed(() => new Set(dashboard.value.saved.map((message) => message.message)));
const incomingGroups = computed(() => {
  const groups = new Map<string, { user: string; username: string; messages: MessageRow[] }>();
  for (const message of dashboard.value.incoming) {
    let group = groups.get(message.sender);
    if (!group) {
      group = { user: message.sender, username: message.senderUsername, messages: [] };
      groups.set(message.sender, group);
    }
    group.messages.push(message);
  }
  for (const group of groups.values()) group.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...groups.values()].sort((a, b) => a.username.localeCompare(b.username));
});
const sentMessages = computed(() => [...dashboard.value.sent].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
const savedMessages = computed(() => [...dashboard.value.saved].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
const canSend = computed(() => recipient.value.trim().length > 0 && text.value.trim().length > 0 && text.value.length <= 2000 && !busy.value);

function resetDashboard() {
  dashboard.value = { incoming: [], sent: [], saved: [], windows: [] };
}

function signOut() {
  sessionVersion += 1;
  dashboardVersion += 1;
  credentials.value = null;
  authMode.value = "login";
  authPassword.value = "";
  recipient.value = "";
  text.value = "";
  resetDashboard();
  busy.value = false;
  loadingDashboard.value = false;
  error.value = "";
  notice.value = "";
  updatesError.value = "";
  tab.value = "inbox";
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
    notice.value = authMode.value === "register" ? "Account created. Share your username with a friend." : "";
    await refreshDashboard();
  } finally {
    busy.value = false;
  }
}

// All mutations use one helper so the form state, error handling, and refresh
// behave consistently. Polling never creates a receiving window.
async function perform(action: (auth: Credentials) => Promise<unknown>, success: string, after?: () => void) {
  if (!credentials.value || busy.value) return;
  error.value = "";
  notice.value = "";
  busy.value = true;
  const requestedSession = sessionVersion;
  try {
    const result = await action({ ...credentials.value });
    if (requestedSession !== sessionVersion) return;
    if (isApiError(result)) {
      error.value = describeError(result);
      return;
    }
    after?.();
    notice.value = success;
    await refreshDashboard();
  } finally {
    if (requestedSession === sessionVersion) busy.value = false;
  }
}

async function sendMessage() {
  if (!canSend.value) return;
  const recipientUsername = recipient.value.trim().toLowerCase();
  const content = text.value.trim();
  if (recipientUsername === credentials.value?.username) {
    error.value = "Choose a friend's username. You can't send a share to yourself.";
    return;
  }
  await perform(
    (auth) => api.catchup.send({ ...auth, recipientUsername, text: content }, { timeoutMs: 10000 }),
    `Your share for @${recipientUsername} is captured. See its status in Sent.`,
    () => { text.value = ""; tab.value = "sent"; },
  );
}

async function startCatchup() {
  await perform((auth) => api.catchup.startCatchup(auth, { timeoutMs: 10000 }), "Your receiving window is open for 15 minutes.", () => { tab.value = "inbox"; });
}

async function endCatchup() {
  const window = currentWindow.value?.window;
  if (!window) return;
  await perform((auth) => api.catchup.endCatchup({ ...auth, window }, { timeoutMs: 10000 }), "Catch-up ended. Messages already available stay here.");
}

async function saveMessage(message: MessageRow) {
  await perform((auth) => api.catchup.save({ ...auth, message: message.message }, { timeoutMs: 10000 }), "Kept in your private Saved list.");
}

async function removeSaved(message: MessageRow) {
  await perform((auth) => api.catchup.removeSaved({ ...auth, message: message.message }, { timeoutMs: 10000 }), "Removed from Saved. The original message stays in your inbox.");
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
  clearInterval(clockTimer);
  clearInterval(pollTimer);
});
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <span class="brand">Catchup<span class="brand-period">.</span></span>
      <div v-if="credentials" class="account-controls">
        <span class="signed-in-user">@{{ credentials.username }}</span>
        <button class="quiet-button" :disabled="busy" @click="signOut">Sign out</button>
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
        <p class="auth-footnote">Signing in doesn't start reception.</p>
      </section>
    </main>

    <main v-else class="dashboard-layout">
      <h1 class="sr-only">Your messages</h1>
      <div v-if="error || notice" class="feedback-stack" aria-live="polite">
        <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
        <p v-if="notice" class="notice-banner" role="status">{{ notice }}</p>
      </div>
      <div class="dashboard-columns">
        <aside class="sidebar">
          <section class="receiving-panel" :class="{ 'receiving-open': currentWindow }" aria-labelledby="receiving-title">
            <h2 id="receiving-title">Receiving window</h2>
            <template v-if="currentWindow">
              <p>Open for new shares.</p>
              <div class="window-countdown"><strong>{{ countdown }}</strong><span>remaining</span></div>
              <button class="secondary-button full-width" :disabled="busy" @click="endCatchup">{{ busy ? 'One moment…' : 'End catch-up' }}</button>
            </template>
            <template v-else>
              <p>Closed. Open a 15-minute window when you're ready.</p>
              <button class="primary-button full-width" :disabled="busy" @click="startCatchup">{{ busy ? 'One moment…' : 'Catch up now' }}</button>
            </template>
          </section>

          <section class="compose-panel" aria-labelledby="compose-title">
            <h2 id="compose-title">Leave for later</h2>
            <form @submit.prevent="sendMessage">
              <label for="recipient">To a friend</label>
              <div class="username-input"><span aria-hidden="true">@</span><input id="recipient" v-model="recipient" type="text" autocomplete="off" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" placeholder="their_username" spellcheck="false" :disabled="busy" /></div>
              <label for="message-text">Your share</label>
              <textarea id="message-text" v-model="text" required maxlength="2000" rows="5" placeholder="A thought or a link…" :disabled="busy" aria-describedby="message-length"></textarea>
              <p id="message-length" class="compose-meta">{{ text.length.toLocaleString() }} / 2,000 characters</p>
              <button class="primary-button full-width" type="submit" :disabled="!canSend">{{ busy ? 'One moment…' : 'Leave for later' }}</button>
            </form>
          </section>
        </aside>

        <section class="messages-panel" aria-labelledby="messages-title">
          <nav class="message-tabs" aria-label="Message lists">
            <button :class="{ active: tab === 'inbox' }" :aria-current="tab === 'inbox' ? 'page' : undefined" @click="tab = 'inbox'">Inbox</button>
            <button :class="{ active: tab === 'sent' }" :aria-current="tab === 'sent' ? 'page' : undefined" @click="tab = 'sent'">Sent</button>
            <button :class="{ active: tab === 'saved' }" :aria-current="tab === 'saved' ? 'page' : undefined" @click="tab = 'saved'">Saved</button>
          </nav>
          <h2 id="messages-title" class="list-title">{{ tab === 'inbox' ? 'Available messages' : tab === 'sent' ? 'Sent messages' : 'Saved messages' }}</h2>
          <p v-if="updatesError" class="error-banner updates-error" role="status">{{ updatesError }} <button class="text-button" :disabled="loadingDashboard || busy" @click="refreshDashboard()">Try again</button></p>
          <p v-if="loadingDashboard && !dashboard.incoming.length && !dashboard.sent.length && !dashboard.saved.length" class="empty-state" role="status">Loading messages…</p>

          <template v-else-if="tab === 'inbox'">
            <p v-if="!incomingGroups.length" class="empty-state">{{ currentWindow ? 'No available messages yet. New shares will appear during this window.' : 'No available messages yet. Choose Catch up now when you’re ready.' }}</p>
            <section v-for="group in incomingGroups" :key="group.user" class="friend-group" :aria-label="`Messages from ${group.username}`"><h3 class="group-heading">@{{ group.username }}</h3><MessageCard v-for="message in group.messages" :key="message.message" :message="message" :saved="savedIds.has(message.message)" :busy="busy" @save="saveMessage" @remove="removeSaved" /></section>
          </template>

          <template v-else-if="tab === 'sent'">
            <p v-if="!sentMessages.length" class="empty-state">No sent messages yet. Enter a friend's username in the composer.</p>
            <MessageCard v-for="message in sentMessages" :key="message.message" :message="message" :status="message.status" :busy="busy" />
            <p v-if="sentMessages.length" class="list-footnote">“Available” means your friend can view it. It doesn't mean they've read it.</p>
          </template>

          <template v-else>
            <p v-if="!savedMessages.length" class="empty-state">No saved messages yet. Choose Keep for later on a received message.</p>
            <MessageCard v-for="message in savedMessages" :key="message.message" :message="message" saved :busy="busy" @remove="removeSaved" />
          </template>
        </section>
      </div>
    </main>

  </div>
</template>
