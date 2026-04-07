const ACTIONS = [
  "MUTE_MEMBER",
  "UNMUTE_MEMBER",
  "DEAFEN_MEMBER",
  "UNDEAFEN_MEMBER",
  "MOVE_MEMBER"
];

const TAB_META = {
  policy: {
    title: "Guild Policy",
    subtitle: "Configure the wake word, moderation policy, and operator defaults."
  },
  dispatch: {
    title: "Dispatch",
    subtitle: "Send website-issued commands directly into a live voice channel."
  },
  guilds: {
    title: "Configured Guilds",
    subtitle: "Review saved guild policies and jump back into editing quickly."
  },
  logs: {
    title: "Dispatch Logs",
    subtitle: "See the latest backend outcomes without digging through service logs."
  }
};

const RESPONSE_MODES = {
  beep: {
    label: "Beep",
    hint: "Beep acknowledgement in the active voice channel after each command."
  },
  text: {
    label: "Text",
    hint: "Send a text acknowledgement instead of joining voice for a beep."
  },
  tts: {
    label: "TTS",
    hint: "Speak the acknowledgement in voice using the LiveKit TTS path."
  }
};

const RESPONSE_MODE_STORAGE_KEY = "mars.dispatch.responseMode";

const state = {
  guilds: [],
  logs: [],
  auth: {
    authenticated: false,
    user: null,
    inviteUrl: "/auth/discord/invite"
  },
  dispatch: {
    responseMode: loadStoredResponseMode(),
    result: null
  }
};

const byId = (id) => document.getElementById(id);

const nodes = {
  guildId: byId("guildId"),
  wakeWord: byId("wakeWord"),
  systemPrompt: byId("systemPrompt"),
  enabled: byId("enabled"),
  allowedActions: byId("allowedActions"),
  saveGuildBtn: byId("saveGuildBtn"),
  dispatchGuildId: byId("dispatchGuildId"),
  dispatchChannelId: byId("dispatchChannelId"),
  dispatchSpeaker: byId("dispatchSpeaker"),
  dispatchTranscript: byId("dispatchTranscript"),
  dispatchBtn: byId("dispatchBtn"),
  statusBanner: byId("statusBanner"),
  statusLabel: byId("statusLabel"),
  statusText: byId("statusText"),
  guildList: byId("guildList"),
  logList: byId("logList"),
  mainTitle: byId("mainTitle"),
  mainSubtitle: byId("mainSubtitle"),
  authStatus: byId("authStatus"),
  authUserName: byId("authUserName"),
  authPill: byId("authPill"),
  loginBtn: byId("loginBtn"),
  inviteBtn: byId("inviteBtn"),
  logoutBtn: byId("logoutBtn"),
  responseModeGroup: byId("responseModeGroup"),
  responseModeHint: byId("responseModeHint"),
  resultSummary: byId("resultSummary"),
  resultAction: byId("resultAction"),
  resultMode: byId("resultMode"),
  resultDetail: byId("resultDetail"),
  navButtons: Array.from(document.querySelectorAll(".nav-btn")),
  panels: Array.from(document.querySelectorAll(".content-panel")),
  responseModeButtons: Array.from(document.querySelectorAll(".segment-btn")),
  exampleButtons: Array.from(document.querySelectorAll(".chip-btn"))
};

function loadStoredResponseMode() {
  try {
    const stored = window.localStorage.getItem(RESPONSE_MODE_STORAGE_KEY);
    return Object.hasOwn(RESPONSE_MODES, stored) ? stored : "beep";
  } catch {
    return "beep";
  }
}

function storeResponseMode(mode) {
  try {
    window.localStorage.setItem(RESPONSE_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage write failures in restrictive browsers.
  }
}

function setStatus(label, message, tone = "neutral") {
  nodes.statusLabel.textContent = label;
  nodes.statusText.textContent = message;
  nodes.statusBanner.className = `status-banner is-${tone}`;
}

function setActiveTab(tab) {
  const meta = TAB_META[tab] || TAB_META.policy;

  nodes.navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });

  nodes.panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === tab);
  });

  nodes.mainTitle.textContent = meta.title;
  nodes.mainSubtitle.textContent = meta.subtitle;
}

function setButtonBusy(button, busy, busyLabel) {
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent;
  }

  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
}

function renderAllowedActions(selected = ACTIONS) {
  nodes.allowedActions.innerHTML = "";

  ACTIONS.forEach((action) => {
    const row = document.createElement("label");
    row.className = "check-item";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = action;
    input.checked = selected.includes(action);

    const text = document.createElement("span");
    text.textContent = action;

    row.appendChild(input);
    row.appendChild(text);
    nodes.allowedActions.appendChild(row);
  });
}

function getSelectedActions() {
  return Array.from(
    nodes.allowedActions.querySelectorAll("input[type='checkbox']:checked")
  ).map((item) => item.value);
}

function applyResponseModeState() {
  nodes.responseModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.dispatch.responseMode);
  });

  const meta = RESPONSE_MODES[state.dispatch.responseMode] || RESPONSE_MODES.beep;
  nodes.responseModeHint.textContent = meta.hint;
  nodes.resultMode.textContent = meta.label;
}

function setDispatchResult({
  tone = "idle",
  summary = "No command sent yet.",
  action = "Waiting",
  detail = "No dispatch has been sent yet.",
  mode = state.dispatch.responseMode
} = {}) {
  state.dispatch.result = { tone, summary, action, detail, mode };

  nodes.resultSummary.className = `result-summary is-${tone}`;
  nodes.resultSummary.textContent = summary;
  nodes.resultAction.textContent = action;
  nodes.resultDetail.textContent = detail;
  nodes.resultMode.textContent =
    RESPONSE_MODES[mode]?.label ?? RESPONSE_MODES.beep.label;
}

function applyAuthState() {
  const authenticated = state.auth.authenticated;

  nodes.saveGuildBtn.disabled = !authenticated;
  nodes.dispatchBtn.disabled = !authenticated;
  nodes.loginBtn.classList.toggle("is-hidden", authenticated);
  nodes.inviteBtn.classList.toggle("is-hidden", !authenticated);
  nodes.logoutBtn.classList.toggle("is-hidden", !authenticated);

  if (!authenticated) {
    nodes.authStatus.textContent = "Sign in required.";
    nodes.authUserName.textContent = "";
    nodes.authPill.textContent = "Offline";
    nodes.authPill.className = "pill is-neutral";
    nodes.inviteBtn.href = "/auth/discord/invite";
    return;
  }

  const displayName = state.auth.user.globalName || state.auth.user.username;
  nodes.authStatus.textContent = "Signed in";
  nodes.authUserName.textContent = displayName;
  nodes.authPill.textContent = "Active";
  nodes.authPill.className = "pill is-success";
  nodes.inviteBtn.href = state.auth.inviteUrl || "/auth/discord/invite";
}

function setUnauthenticatedState() {
  state.auth = {
    authenticated: false,
    user: null,
    inviteUrl: "/auth/discord/invite"
  };
  applyAuthState();
}

async function getJsonOrNull(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function loadAuth() {
  try {
    const response = await fetch("/auth/me", {
      credentials: "same-origin"
    });

    if (!response.ok) {
      setUnauthenticatedState();
      return;
    }

    const payload = await response.json();

    if (!payload.authenticated) {
      setUnauthenticatedState();
      return;
    }

    state.auth = {
      authenticated: true,
      user: payload.user,
      inviteUrl: payload.inviteUrl
    };

    applyAuthState();
  } catch {
    setUnauthenticatedState();
    setStatus("Connection", "Unable to reach the auth service right now.", "danger");
  }
}

function fillGuildForms(guild) {
  nodes.guildId.value = guild.guildId;
  nodes.wakeWord.value = guild.wakeWord;
  nodes.systemPrompt.value = guild.systemPrompt;
  nodes.enabled.checked = guild.enabled;
  renderAllowedActions(guild.allowedActions);
  nodes.dispatchGuildId.value = guild.guildId;
}

function renderGuilds() {
  nodes.guildList.innerHTML = "";

  if (!state.auth.authenticated) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Login with Discord to view guilds.";
    nodes.guildList.appendChild(empty);
    return;
  }

  if (!state.guilds.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No guild configs yet.";
    nodes.guildList.appendChild(empty);
    return;
  }

  state.guilds.forEach((guild) => {
    const item = document.createElement("div");
    item.className = "item";

    const top = document.createElement("div");
    top.className = "top";

    const id = document.createElement("strong");
    id.textContent = guild.guildId;

    const badge = document.createElement("span");
    badge.className = `badge ${guild.enabled ? "ok" : "warn"}`;
    badge.textContent = guild.enabled ? "Enabled" : "Disabled";

    top.appendChild(id);
    top.appendChild(badge);

    const wakeWord = document.createElement("p");
    wakeWord.className = "muted";
    wakeWord.textContent = `Wake word: ${guild.wakeWord}`;

    const actions = document.createElement("div");
    actions.className = "actions";
    guild.allowedActions.forEach((action) => {
      const chip = document.createElement("span");
      chip.className = "badge";
      chip.textContent = action;
      actions.appendChild(chip);
    });

    const edit = document.createElement("button");
    edit.className = "btn btn-secondary";
    edit.type = "button";
    edit.textContent = "Edit Policy";
    edit.addEventListener("click", () => {
      fillGuildForms(guild);
      setStatus("Loaded", `Loaded guild ${guild.guildId} into the editor.`, "neutral");
      setActiveTab("policy");
    });

    item.appendChild(top);
    item.appendChild(wakeWord);
    item.appendChild(actions);
    item.appendChild(edit);
    nodes.guildList.appendChild(item);
  });
}

function renderLogs() {
  nodes.logList.innerHTML = "";

  if (!state.auth.authenticated) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Login with Discord to view logs.";
    nodes.logList.appendChild(empty);
    return;
  }

  if (!state.logs.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No dispatch logs yet.";
    nodes.logList.appendChild(empty);
    return;
  }

  state.logs.forEach((log) => {
    const item = document.createElement("div");
    item.className = "item";

    const top = document.createElement("div");
    top.className = "top";

    const left = document.createElement("strong");
    left.textContent = `${log.action} (${log.guildId})`;

    const badge = document.createElement("span");
    badge.className = `badge ${log.ok ? "ok" : "warn"}`;
    badge.textContent = log.ok ? "OK" : "FAILED";

    top.appendChild(left);
    top.appendChild(badge);

    const detail = document.createElement("p");
    detail.className = "muted";
    detail.textContent = log.detail;

    const transcript = document.createElement("p");
    transcript.className = "muted";
    transcript.textContent = `Transcript: ${log.transcript}`;

    const meta = document.createElement("p");
    meta.className = "muted";
    const time = new Date(log.createdAt).toLocaleString();
    meta.textContent = `${time} - Speaker: ${log.speakerName} - Channel: ${log.channelId}`;

    item.appendChild(top);
    item.appendChild(detail);
    item.appendChild(transcript);
    item.appendChild(meta);
    nodes.logList.appendChild(item);
  });
}

async function loadGuilds() {
  if (!state.auth.authenticated) {
    state.guilds = [];
    renderGuilds();
    return;
  }

  try {
    const response = await fetch("/api/guilds", {
      credentials: "same-origin"
    });

    if (response.status === 401) {
      setUnauthenticatedState();
      setStatus("Session", "Session expired. Login again.", "warning");
      state.guilds = [];
      renderGuilds();
      return;
    }

    if (!response.ok) {
      setStatus("Guilds", "Failed to load guilds.", "danger");
      return;
    }

    state.guilds = await response.json();
    renderGuilds();
  } catch {
    setStatus("Guilds", "Unable to load guilds right now.", "danger");
  }
}

async function loadLogs() {
  if (!state.auth.authenticated) {
    state.logs = [];
    renderLogs();
    return;
  }

  try {
    const response = await fetch("/api/dispatch", {
      credentials: "same-origin"
    });

    if (response.status === 401) {
      setUnauthenticatedState();
      setStatus("Session", "Session expired. Login again.", "warning");
      state.logs = [];
      renderLogs();
      return;
    }

    if (!response.ok) {
      setStatus("Logs", "Failed to load dispatch logs.", "danger");
      return;
    }

    state.logs = await response.json();
    renderLogs();
  } catch {
    setStatus("Logs", "Unable to load dispatch logs right now.", "danger");
  }
}

function ensureAuthenticated() {
  if (state.auth.authenticated) {
    return true;
  }

  setStatus("Auth Required", "Login with Discord first.", "warning");
  return false;
}

async function saveGuild() {
  if (!ensureAuthenticated()) {
    return;
  }

  const payload = {
    guildId: nodes.guildId.value.trim(),
    wakeWord: nodes.wakeWord.value.trim(),
    systemPrompt: nodes.systemPrompt.value.trim(),
    enabled: nodes.enabled.checked,
    allowedActions: getSelectedActions()
  };

  if (!payload.guildId) {
    setStatus("Missing Guild", "Guild ID is required.", "warning");
    return;
  }

  setButtonBusy(nodes.saveGuildBtn, true, "Saving...");

  try {
    const response = await fetch("/api/guilds", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      setUnauthenticatedState();
      setStatus("Session", "Session expired. Login again.", "warning");
      return;
    }

    if (!response.ok) {
      const payload = await getJsonOrNull(response);
      setStatus(
        "Save Failed",
        payload?.error ?? "Failed to save guild config.",
        "danger"
      );
      return;
    }

    nodes.dispatchGuildId.value = payload.guildId;
    setStatus("Saved", "Guild config saved successfully.", "success");
    await loadGuilds();
  } catch {
    setStatus("Save Failed", "Unable to save guild config right now.", "danger");
  } finally {
    setButtonBusy(nodes.saveGuildBtn, false, "Saving...");
  }
}

async function dispatchCommand() {
  if (!ensureAuthenticated()) {
    return;
  }

  const payload = {
    guildId: nodes.dispatchGuildId.value.trim(),
    channelId: nodes.dispatchChannelId.value.trim(),
    speakerName: nodes.dispatchSpeaker.value.trim() || "Moderator",
    transcript: nodes.dispatchTranscript.value.trim(),
    responseMode: state.dispatch.responseMode
  };

  if (!payload.guildId || !payload.channelId || !payload.transcript) {
    setStatus(
      "Missing Fields",
      "Guild, channel, and transcript are required for dispatch.",
      "warning"
    );
    return;
  }

  setButtonBusy(nodes.dispatchBtn, true, "Sending...");
  setDispatchResult({
    tone: "idle",
    summary: "Dispatch in progress...",
    action: "Pending",
    detail: "Waiting for the bot service to respond.",
    mode: state.dispatch.responseMode
  });

  try {
    const response = await fetch("/api/dispatch", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      setUnauthenticatedState();
      setStatus("Session", "Session expired. Login again.", "warning");
      return;
    }

    const body = await getJsonOrNull(response);

    if (!response.ok) {
      const detail = body?.detail ?? body?.error ?? "Dispatch failed.";
      setStatus("Dispatch Failed", detail, "danger");
      setDispatchResult({
        tone: "danger",
        summary: "Dispatch failed before the bot could complete it.",
        action: "ERROR",
        detail,
        mode: state.dispatch.responseMode
      });
      await loadLogs();
      return;
    }

    setStatus(
      "Dispatch Complete",
      `${body.action} - ${body.detail}`,
      body.action === "NOOP" ? "warning" : "success"
    );
    setDispatchResult({
      tone: body.action === "NOOP" ? "warning" : "success",
      summary:
        body.action === "NOOP"
          ? "Command reached the bot but no moderation action was executed."
          : "Command completed and the bot returned a reply.",
      action: body.action,
      detail: body.detail,
      mode: state.dispatch.responseMode
    });
    await loadLogs();
  } catch {
    setStatus("Dispatch Failed", "Unable to reach the dispatch API.", "danger");
    setDispatchResult({
      tone: "danger",
      summary: "The website could not reach the dispatch API.",
      action: "ERROR",
      detail: "Network error while sending the command.",
      mode: state.dispatch.responseMode
    });
  } finally {
    setButtonBusy(nodes.dispatchBtn, false, "Sending...");
  }
}

async function logout() {
  await fetch("/auth/logout", {
    method: "POST",
    credentials: "same-origin"
  });

  setUnauthenticatedState();
  state.guilds = [];
  state.logs = [];
  renderGuilds();
  renderLogs();
  setStatus("Logged Out", "Discord session closed.", "neutral");
}

function applyAuthResultFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const authStatus = params.get("auth");

  if (!authStatus) {
    return;
  }

  if (authStatus === "success") {
    setStatus("Signed In", "Discord login successful.", "success");
  } else {
    setStatus("Auth Failed", "Discord login failed. Please try again.", "danger");
  }

  params.delete("auth");
  const query = params.toString();
  const target = `${window.location.pathname}${query ? `?${query}` : ""}`;
  window.history.replaceState({}, "", target);
}

nodes.navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab;

    if (tab) {
      setActiveTab(tab);
    }
  });
});

nodes.responseModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;

    if (!Object.hasOwn(RESPONSE_MODES, mode)) {
      return;
    }

    state.dispatch.responseMode = mode;
    storeResponseMode(mode);
    applyResponseModeState();
    setStatus(
      "Reply Mode",
      `Dispatch reply mode set to ${RESPONSE_MODES[mode].label}.`,
      "neutral"
    );
  });
});

nodes.exampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    nodes.dispatchTranscript.value = button.dataset.example || nodes.dispatchTranscript.value;
  });
});

nodes.saveGuildBtn.addEventListener("click", () => {
  void saveGuild();
});

nodes.dispatchBtn.addEventListener("click", () => {
  void dispatchCommand();
});

nodes.logoutBtn.addEventListener("click", () => {
  void logout();
});

renderAllowedActions();
applyResponseModeState();
setDispatchResult();
setActiveTab("policy");
applyAuthResultFromQuery();

void (async () => {
  await loadAuth();
  await loadGuilds();
  await loadLogs();
})();
