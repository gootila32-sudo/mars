const ACTIONS = [
  "MUTE_MEMBER",
  "UNMUTE_MEMBER",
  "DEAFEN_MEMBER",
  "UNDEAFEN_MEMBER",
  "MOVE_MEMBER"
];

const TAB_TITLES = {
  policy: "Guild Policy",
  dispatch: "Dispatch",
  guilds: "Configured Guilds",
  logs: "Dispatch Logs"
};

const state = {
  guilds: [],
  logs: []
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
  statusText: byId("statusText"),
  guildList: byId("guildList"),
  logList: byId("logList"),
  mainTitle: byId("mainTitle"),
  navButtons: Array.from(document.querySelectorAll(".nav-btn")),
  panels: Array.from(document.querySelectorAll(".content-panel"))
};

function setStatus(message) {
  nodes.statusText.textContent = message;
}

function setActiveTab(tab) {
  nodes.navButtons.forEach((button) => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle("is-active", isActive);
  });

  nodes.panels.forEach((panel) => {
    const isActive = panel.dataset.panel === tab;
    panel.classList.toggle("is-active", isActive);
  });

  nodes.mainTitle.textContent = TAB_TITLES[tab] || "Control Plane";
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

async function loadGuilds() {
  const response = await fetch("/api/guilds");
  if (!response.ok) {
    setStatus("Failed to load guilds.");
    return;
  }

  state.guilds = await response.json();
  renderGuilds();
}

async function loadLogs() {
  const response = await fetch("/api/dispatch");
  if (!response.ok) {
    setStatus("Failed to load dispatch logs.");
    return;
  }

  state.logs = await response.json();
  renderLogs();
}

function renderGuilds() {
  nodes.guildList.innerHTML = "";

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
    edit.className = "btn";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      nodes.guildId.value = guild.guildId;
      nodes.wakeWord.value = guild.wakeWord;
      nodes.systemPrompt.value = guild.systemPrompt;
      nodes.enabled.checked = guild.enabled;
      renderAllowedActions(guild.allowedActions);
      nodes.dispatchGuildId.value = guild.guildId;
      setStatus(`Loaded guild ${guild.guildId}`);
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

    const meta = document.createElement("p");
    meta.className = "muted";
    const time = new Date(log.createdAt).toLocaleString();
    meta.textContent = `${time} - Speaker: ${log.speakerName}`;

    item.appendChild(top);
    item.appendChild(detail);
    item.appendChild(meta);
    nodes.logList.appendChild(item);
  });
}

async function saveGuild() {
  const payload = {
    guildId: nodes.guildId.value.trim(),
    wakeWord: nodes.wakeWord.value.trim(),
    systemPrompt: nodes.systemPrompt.value.trim(),
    enabled: nodes.enabled.checked,
    allowedActions: getSelectedActions()
  };

  if (!payload.guildId) {
    setStatus("Guild ID is required.");
    return;
  }

  const response = await fetch("/api/guilds", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    setStatus("Failed to save guild config.");
    return;
  }

  nodes.dispatchGuildId.value = payload.guildId;
  setStatus("Guild config saved.");
  await loadGuilds();
}

async function dispatchCommand() {
  const payload = {
    guildId: nodes.dispatchGuildId.value.trim(),
    channelId: nodes.dispatchChannelId.value.trim(),
    speakerName: nodes.dispatchSpeaker.value.trim() || "Moderator",
    transcript: nodes.dispatchTranscript.value.trim()
  };

  if (!payload.guildId || !payload.channelId || !payload.transcript) {
    setStatus("Guild, channel, and transcript are required for dispatch.");
    return;
  }

  const response = await fetch("/api/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    setStatus("Dispatch failed. Check bot service and API key.");
    await loadLogs();
    return;
  }

  const result = await response.json();
  setStatus(`Dispatch result: ${result.action} - ${result.detail}`);
  await loadLogs();
  setActiveTab("logs");
}

nodes.navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab;

    if (!tab) {
      return;
    }

    setActiveTab(tab);
  });
});

nodes.saveGuildBtn.addEventListener("click", () => {
  void saveGuild();
});

nodes.dispatchBtn.addEventListener("click", () => {
  void dispatchCommand();
});

renderAllowedActions();
setActiveTab("policy");
void loadGuilds();
void loadLogs();