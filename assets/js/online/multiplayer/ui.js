/** Multiplayer UI module */

function multiplayerGetStatusNickname() {
  if (MULTIPLAYER_STATE.role === 'host') {
    const remotes = Array.isArray(MULTIPLAYER_STATE.remoteNicks) ? MULTIPLAYER_STATE.remoteNicks.filter(Boolean) : [];
    return remotes.map(multiplayerDisplayNick).join(', ');
  }
  if (MULTIPLAYER_STATE.role === 'client') {
    return multiplayerDisplayNick((MULTIPLAYER_STATE.remoteNick || '').trim());
  }
  return '';
}

function multiplayerRenderHud() {
  const hud = document.getElementById('multiplayer-hud');
  if (!hud) return;
  const shouldShow = isMultiplayerModeActive();
  hud.style.display = shouldShow ? '' : 'none';
  if (!shouldShow) return;

  const statusEl = document.getElementById('multiplayer-hud-status');
  const statusText = MULTIPLAYER_STATE.statusText || 'Multiplayer';
  const statusBaseText = MULTIPLAYER_STATE.statusBaseText || '';
  if (statusEl) {
    const shouldHideStatus = statusBaseText === 'Match started';
    statusEl.textContent = shouldHideStatus ? '' : statusText;
    statusEl.style.display = shouldHideStatus ? 'none' : '';
  }

  const board = document.getElementById('multiplayer-scoreboard');
  if (!board) return;
  board.innerHTML = '';
  const scores = MULTIPLAYER_STATE.scores || {};
  const local = MULTIPLAYER_STATE.localNick;
  const entries = Object.keys(scores);
  if (entries.length === 0) return;
  entries.sort((a, b) => (a === local ? -1 : b === local ? 1 : 0));
  entries.forEach(nick => {
    const row = document.createElement('div');
    row.className = 'mp-score-row';
    const name = document.createElement('div');
    name.className = 'mp-score-name';
    name.textContent = nick === local ? 'You' : multiplayerDisplayNick(nick);
    const val = document.createElement('div');
    val.className = 'mp-score-val';
    val.textContent = String(scores[nick] ?? 0);
    row.appendChild(name);
    row.appendChild(val);
    board.appendChild(row);
  });
}

function multiplayerSyncActionButtons() {
  const isClientPlayer = isMultiplayerModeActive() && MULTIPLAYER_STATE.role === 'client' && MULTIPLAYER_STATE.isConnected;

  const finishBtn = document.getElementById('finish-btn');
  if (finishBtn) {
    finishBtn.style.visibility = isClientPlayer ? 'hidden' : '';
    finishBtn.style.pointerEvents = isClientPlayer ? 'none' : '';
    finishBtn.setAttribute('aria-hidden', isClientPlayer ? 'true' : 'false');
    finishBtn.tabIndex = isClientPlayer ? -1 : 0;
  }

  const rematchBtn = document.getElementById('multiplayer-rematch-btn');
  if (rematchBtn) {
    rematchBtn.style.visibility = isClientPlayer ? 'hidden' : '';
    rematchBtn.style.pointerEvents = isClientPlayer ? 'none' : '';
    rematchBtn.setAttribute('aria-hidden', isClientPlayer ? 'true' : 'false');
    rematchBtn.tabIndex = isClientPlayer ? -1 : 0;
  }
}

function multiplayerSyncModal() {
  const nickEl = document.getElementById('multiplayer-nick');
  if (nickEl) nickEl.textContent = multiplayerGetNickname();

  const lobbyEl = document.getElementById('multiplayer-lobby-id');
  if (lobbyEl) {
    const shouldShowHostLobbyId = MULTIPLAYER_STATE.role === 'host' && MULTIPLAYER_STATE.lobbyId;
    lobbyEl.textContent = shouldShowHostLobbyId ? ('Lobby: ' + MULTIPLAYER_STATE.lobbyId) : '';
  }

  const hostBtn = document.getElementById('multiplayer-host-btn');
  if (hostBtn) {
    const isHostSession = MULTIPLAYER_STATE.role === 'host' && !!MULTIPLAYER_STATE.lobbyId;
    const connectedPeers = (typeof multiplayerGetConnectedPeerCount === 'function') ? multiplayerGetConnectedPeerCount() : 0;
    hostBtn.textContent = isHostSession ? 'Start' : 'Host';
    const canStart = isHostSession && connectedPeers > 0;
    hostBtn.style.opacity = isHostSession && !canStart ? '0.6' : '';
  }

  multiplayerSetStatus(MULTIPLAYER_STATE.statusBaseText || 'Not connected');
}

function multiplayerClearBoard() {
  deck = [];
  board = new Array(12).fill(null);
  selected = [];
  for (let i = 0; i < 12; i++) updateSlot(i, false);
  updateUI();
}

function openMultiplayerModal() {
  MULTIPLAYER_STATE.localNick = multiplayerGetWireNick();
  MULTIPLAYER_STATE.preferRemote = true;
  if (MULTIPLAYER_STATE.prevGameMode == null) {
    MULTIPLAYER_STATE.prevGameMode = config.gameMode === GAME_MODES.MULTIPLAYER ? DEFAULT_GAME_MODE : config.gameMode;
  }
  if (config.gameMode !== GAME_MODES.MULTIPLAYER) {
    setGameMode(GAME_MODES.MULTIPLAYER);
    multiplayerClearBoard();
  } else {
    syncSettingsUI();
    updateUI();
  }
  multiplayerSyncModal();
  multiplayerSyncActionButtons();
  multiplayerRenderLobbyList();
  openModal('multiplayer-modal');
  multiplayerStartLobbyListPolling();
  multiplayerRefreshLobbyList();
}

function closeMultiplayerModal() {
  multiplayerStopLobbyListPolling();
  closeModal('multiplayer-modal');
}

function multiplayerStartLobbyListPolling() {
  multiplayerStopLobbyListPolling();
  multiplayerRefreshLobbyList();
  MULTIPLAYER_STATE.lobbyListTimer = setInterval(() => {
    multiplayerRefreshLobbyList();
  }, 500);
}

function multiplayerStopLobbyListPolling() {
  if (!MULTIPLAYER_STATE.lobbyListTimer) return;
  clearInterval(MULTIPLAYER_STATE.lobbyListTimer);
  MULTIPLAYER_STATE.lobbyListTimer = null;
}

if (typeof AppEvents !== 'undefined' && AppEvents && typeof AppEvents.on === 'function') {
  AppEvents.on('multiplayer:status', function () {
    const statusEl = document.getElementById('multiplayer-status-text');
    if (statusEl) statusEl.textContent = MULTIPLAYER_STATE.statusText || '';
    multiplayerRenderHud();
  });
}
