/** Multiplayer UI helpers. */

function multiplayerGetStatusNickname() {
  if (MULTIPLAYER_STATE.role === 'host') {
    return MULTIPLAYER_STATE.remoteNicks.map(multiplayerDisplayNick).join(', ');
  }
  if (MULTIPLAYER_STATE.role === 'client' && MULTIPLAYER_STATE.remoteNick) {
    return multiplayerDisplayNick(MULTIPLAYER_STATE.remoteNick);
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

  const scoreboard = document.getElementById('multiplayer-scoreboard');
  if (!scoreboard) return;
  scoreboard.innerHTML = '';
  const scores = MULTIPLAYER_STATE.scores || {};
  const local = MULTIPLAYER_STATE.localNick;
  const entries = Object.keys(scores);
  entries.sort((a, b) => (a === local ? -1 : b === local ? 1 : 0));
  entries.forEach(playerId => {
    const row = document.createElement('div');
    row.className = 'mp-score-row';
    const name = document.createElement('div');
    name.className = 'mp-score-name';
    name.textContent = playerId === local ? 'You' : multiplayerDisplayNick(playerId);
    const value = document.createElement('div');
    value.className = 'mp-score-val';
    value.textContent = String(scores[playerId] ?? 0);
    row.appendChild(name);
    row.appendChild(value);
    scoreboard.appendChild(row);
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

  const roomInput = document.getElementById('multiplayer-room-code');
  if (roomInput) {
    if (MULTIPLAYER_STATE.lobbyId) roomInput.value = MULTIPLAYER_STATE.lobbyId;
    roomInput.readOnly = !!MULTIPLAYER_STATE.role;
  }

  const hostBtn = document.getElementById('multiplayer-host-btn');
  if (hostBtn) {
    const isHostSession = MULTIPLAYER_STATE.role === 'host';
    hostBtn.textContent = isHostSession ? 'Start' : 'Host';
    hostBtn.disabled = MULTIPLAYER_STATE.role === 'client' || MULTIPLAYER_STATE.isConnecting;
    hostBtn.style.opacity = isHostSession && multiplayerGetConnectedPeerCount() < 1 ? '0.6' : '';
  }

  const joinBtn = document.getElementById('multiplayer-join-btn');
  if (joinBtn) joinBtn.disabled = !!MULTIPLAYER_STATE.role || MULTIPLAYER_STATE.isConnecting;

  const copyBtn = document.getElementById('multiplayer-copy-btn');
  if (copyBtn) copyBtn.disabled = !MULTIPLAYER_STATE.lobbyId;

  const statusEl = document.getElementById('multiplayer-status-text');
  if (statusEl) statusEl.textContent = MULTIPLAYER_STATE.statusText || 'Not connected';
}

function multiplayerClearBoard() {
  deck = [];
  board = new Array(12).fill(null);
  selected = [];
  for (let i = 0; i < 12; i++) updateSlot(i, false);
  updateUI();
}

function multiplayerNormalizeRoomCodeInput(input) {
  if (!input) return;
  input.value = multiplayerNormalizeRoomCode(input.value);
}

function multiplayerHandleRoomCodeKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  multiplayerJoinLobby();
}

async function multiplayerCopyRoomCode() {
  const code = MULTIPLAYER_STATE.lobbyId;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    if (typeof showToast === 'function') showToast('Room code copied');
  } catch (_) {
    const input = document.getElementById('multiplayer-room-code');
    if (!input) return;
    input.focus();
    input.select();
    document.execCommand('copy');
    if (typeof showToast === 'function') showToast('Room code copied');
  }
}

function openMultiplayerModal() {
  MULTIPLAYER_STATE.localDisplayNick = multiplayerGetNickname();
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
  openModal('multiplayer-modal');
}

function closeMultiplayerModal() {
  closeModal('multiplayer-modal');
}

if (typeof AppEvents !== 'undefined' && AppEvents && typeof AppEvents.on === 'function') {
  AppEvents.on('multiplayer:status', function () {
    const statusEl = document.getElementById('multiplayer-status-text');
    if (statusEl) statusEl.textContent = MULTIPLAYER_STATE.statusText || '';
    multiplayerRenderHud();
  });
}
