/**
 * Multiplayer transport and session lifecycle.
 *
 * Trystero handles peer discovery, WebRTC signaling, data channels, retries,
 * and serialization. The host remains authoritative for all game state; the
 * match protocol itself lives in multiplayer/state-sync.js.
 */

const MULTIPLAYER_TRYSTERO_URL = 'https://esm.sh/trystero@0.25.2/nostr';
const MULTIPLAYER_APP_ID = 'set-pro-trainer-v2';
const MULTIPLAYER_MAX_PLAYERS = 3;
const MULTIPLAYER_ROOM_CODE_LENGTH = 8;
const MULTIPLAYER_ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const MULTIPLAYER_STATE = {
  role: null,
  lobbyId: '',
  room: null,
  messageAction: null,
  connectToken: 0,
  isConnected: false,
  isConnecting: false,
  statusText: 'Not connected',
  statusBaseText: 'Not connected',
  localNick: '',
  localDisplayNick: '',
  remoteNick: '',
  remoteNicks: [],
  playerNames: {},
  scores: {},
  timestampsByNick: {},
  lastSetTimeByNick: {},
  startEpoch: 0,
  pendingClaim: false,
  pendingShuffle: false,
  pendingRemoteState: null,
  preferRemote: false,
  prevGameMode: null,
  lastStateVersion: 0,
  isApplyingState: false,
  rematchPrepared: false,
  matchActive: false
};

function multiplayerGetWireNick() {
  return MULTIPLAYER_STATE.localNick || multiplayerGetNickname();
}

function multiplayerDisplayNick(playerId) {
  const id = String(playerId || '');
  if (MULTIPLAYER_STATE.playerNames[id]) return MULTIPLAYER_STATE.playerNames[id];
  if (id && id === MULTIPLAYER_STATE.localNick) return MULTIPLAYER_STATE.localDisplayNick || multiplayerGetNickname();
  return id || 'Player';
}

function multiplayerIsHost() {
  return MULTIPLAYER_STATE.role === 'host' && MULTIPLAYER_STATE.isConnected;
}

function multiplayerIsClient() {
  return MULTIPLAYER_STATE.role === 'client' && MULTIPLAYER_STATE.isConnected;
}

function multiplayerShouldUseRemoteState() {
  return isMultiplayerModeActive() && (MULTIPLAYER_STATE.role === 'client' || MULTIPLAYER_STATE.preferRemote);
}

function multiplayerGetConnectedPeerCount() {
  if (MULTIPLAYER_STATE.role === 'host') return MULTIPLAYER_STATE.remoteNicks.length;
  return MULTIPLAYER_STATE.isConnected ? 1 : 0;
}

function multiplayerGetNickname() {
  if (typeof ensureOnlineNickname === 'function') return ensureOnlineNickname();
  const raw = (config && config.onlineNickname) ? String(config.onlineNickname) : '';
  return raw.trim() || 'Player';
}

function multiplayerSetStatus(text) {
  const statusBase = text || '';
  MULTIPLAYER_STATE.statusBaseText = statusBase;
  const statusNick = (typeof multiplayerGetStatusNickname === 'function')
    ? multiplayerGetStatusNickname()
    : '';
  MULTIPLAYER_STATE.statusText = statusNick ? `${statusBase} (${statusNick})` : statusBase;

  if (typeof AppEvents !== 'undefined' && AppEvents && typeof AppEvents.emit === 'function') {
    AppEvents.emit('multiplayer:status', {
      statusBaseText: MULTIPLAYER_STATE.statusBaseText,
      statusText: MULTIPLAYER_STATE.statusText
    });
    return;
  }

  const statusEl = document.getElementById('multiplayer-status-text');
  if (statusEl) statusEl.textContent = MULTIPLAYER_STATE.statusText;
  if (typeof multiplayerRenderHud === 'function') multiplayerRenderHud();
}

function multiplayerGenerateRoomCode() {
  const bytes = new Uint8Array(MULTIPLAYER_ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => MULTIPLAYER_ROOM_CODE_ALPHABET[value % MULTIPLAYER_ROOM_CODE_ALPHABET.length]).join('');
}

function multiplayerNormalizeRoomCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MULTIPLAYER_ROOM_CODE_LENGTH);
}

function multiplayerResetConnectionState() {
  MULTIPLAYER_STATE.connectToken += 1;
  const room = MULTIPLAYER_STATE.room;
  MULTIPLAYER_STATE.room = null;
  MULTIPLAYER_STATE.messageAction = null;
  if (room && typeof room.leave === 'function') {
    try {
      const leaveResult = room.leave();
      if (leaveResult && typeof leaveResult.catch === 'function') leaveResult.catch(() => {});
    } catch (_) {}
  }
}

function multiplayerResetSessionState() {
  Object.assign(MULTIPLAYER_STATE, {
    role: null,
    lobbyId: '',
    isConnected: false,
    isConnecting: false,
    localNick: '',
    localDisplayNick: '',
    remoteNick: '',
    remoteNicks: [],
    playerNames: {},
    scores: {},
    timestampsByNick: {},
    lastSetTimeByNick: {},
    pendingClaim: false,
    pendingShuffle: false,
    pendingRemoteState: null,
    preferRemote: false,
    prevGameMode: null,
    lastStateVersion: 0,
    isApplyingState: false,
    rematchPrepared: false,
    matchActive: false
  });
}

function multiplayerCloseOverlays() {
  closeModal('multiplayer-modal');
  closeModal('multiplayer-result-modal');
  closeSettingsPanel();
}

function multiplayerForceHideOverlay(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('show', 'hide');
}

function multiplayerForceCloseOverlays() {
  multiplayerForceHideOverlay('multiplayer-modal');
  multiplayerForceHideOverlay('multiplayer-result-modal');

  const panel = document.getElementById('settings-panel');
  if (panel) {
    panel.classList.remove('show', 'hide');
    panel.setAttribute('aria-hidden', 'true');
  }
}

function multiplayerReinitializeGameToNormalMode() {
  multiplayerForceCloseOverlays();
  if (config.gameMode !== GAME_MODES.NORMAL) {
    setGameMode(GAME_MODES.NORMAL);
    return;
  }
  initNewDeckAndBoard();
  resetStats();
  updateUI();
  syncSettingsUI();
}

function multiplayerTeardownSession(options = {}) {
  const {
    switchToNormalMode = false,
    syncActionButtons = false,
    closeOverlays = true
  } = options;

  multiplayerResetConnectionState();
  multiplayerResetSessionState();
  multiplayerSetStatus('Not connected');
  if (typeof multiplayerRenderHud === 'function') multiplayerRenderHud();
  if (typeof multiplayerSyncModal === 'function') multiplayerSyncModal();

  if (syncActionButtons && typeof multiplayerSyncActionButtons === 'function') multiplayerSyncActionButtons();
  if (closeOverlays) multiplayerCloseOverlays();
  if (switchToNormalMode) multiplayerReinitializeGameToNormalMode();
}

function multiplayerHandlePeerDisconnect() {
  if (!MULTIPLAYER_STATE.role) return;
  const wasConnected = MULTIPLAYER_STATE.isConnected;
  multiplayerTeardownSession({ switchToNormalMode: true });
  if (wasConnected && typeof showToast === 'function') {
    showToast('Host left. Switched to Normal mode and restarted game');
  }
}

function multiplayerSendRaw(payload, target) {
  const action = MULTIPLAYER_STATE.messageAction;
  if (!action || !target || (Array.isArray(target) && target.length === 0)) return;
  try {
    const result = action.send(payload, { target });
    if (result && typeof result.catch === 'function') {
      result.catch(err => debugLog('Multiplayer send failed:', err && err.message ? err.message : err));
    }
  } catch (err) {
    debugLog('Multiplayer send failed:', err);
  }
}

function multiplayerSend(payload) {
  if (MULTIPLAYER_STATE.role === 'host') {
    multiplayerSendRaw(payload, [...MULTIPLAYER_STATE.remoteNicks]);
    return;
  }
  if (MULTIPLAYER_STATE.role === 'client') {
    multiplayerSendRaw(payload, MULTIPLAYER_STATE.remoteNick);
  }
}

function multiplayerSendTo(playerId, payload) {
  const target = String(playerId || '');
  if (!target) return;
  if (MULTIPLAYER_STATE.role === 'host' && !MULTIPLAYER_STATE.remoteNicks.includes(target)) return;
  multiplayerSendRaw(payload, target);
}

function multiplayerRosterPayload() {
  return {
    type: 'roster',
    players: { ...MULTIPLAYER_STATE.playerNames }
  };
}

function multiplayerApplyRoster(players) {
  if (!players || typeof players !== 'object') return;
  const localName = MULTIPLAYER_STATE.localDisplayNick || multiplayerGetNickname();
  MULTIPLAYER_STATE.playerNames = {
    ...players,
    [MULTIPLAYER_STATE.localNick]: localName
  };
  if (MULTIPLAYER_STATE.role === 'client') {
    MULTIPLAYER_STATE.remoteNicks = Object.keys(MULTIPLAYER_STATE.playerNames)
      .filter(playerId => playerId !== MULTIPLAYER_STATE.localNick);
  }
  if (typeof multiplayerRenderHud === 'function') multiplayerRenderHud();
  if (typeof multiplayerSyncModal === 'function') multiplayerSyncModal();
}

function multiplayerSendPresence(peerId) {
  multiplayerSendRaw({
    type: 'presence',
    role: MULTIPLAYER_STATE.role,
    nick: MULTIPLAYER_STATE.localDisplayNick
  }, peerId);
}

function multiplayerHandlePresence(message, peerId) {
  const displayNick = String(message.nick || 'Player').trim().slice(0, 32) || 'Player';

  if (MULTIPLAYER_STATE.role === 'host') {
    if (message.role !== 'client') {
      multiplayerSendRaw({ type: 'rejected', reason: 'Room already has a host' }, peerId);
      return;
    }

    const alreadyAccepted = MULTIPLAYER_STATE.remoteNicks.includes(peerId);
    if (!alreadyAccepted && MULTIPLAYER_STATE.matchActive) {
      multiplayerSendRaw({ type: 'rejected', reason: 'Match already started' }, peerId);
      return;
    }
    if (!alreadyAccepted && MULTIPLAYER_STATE.remoteNicks.length >= MULTIPLAYER_MAX_PLAYERS - 1) {
      multiplayerSendRaw({ type: 'rejected', reason: 'Room is full' }, peerId);
      return;
    }

    if (!alreadyAccepted) MULTIPLAYER_STATE.remoteNicks.push(peerId);
    MULTIPLAYER_STATE.playerNames[peerId] = displayNick;
    MULTIPLAYER_STATE.isConnected = MULTIPLAYER_STATE.remoteNicks.length > 0;
    multiplayerSendRaw({
      type: 'welcome',
      hostId: MULTIPLAYER_STATE.localNick,
      players: { ...MULTIPLAYER_STATE.playerNames }
    }, peerId);
    multiplayerSend(multiplayerRosterPayload());
    multiplayerSetStatus('Connected');
    multiplayerRenderHud();
    multiplayerSyncActionButtons();
    multiplayerSyncModal();
    return;
  }

  if (MULTIPLAYER_STATE.role === 'client') {
    MULTIPLAYER_STATE.playerNames[peerId] = displayNick;
    if (message.role === 'host' && !MULTIPLAYER_STATE.remoteNick) {
      MULTIPLAYER_STATE.remoteNick = peerId;
      multiplayerSetStatus('Connecting...');
    }
  }
}

function multiplayerHandleWelcome(message, peerId) {
  if (MULTIPLAYER_STATE.role !== 'client') return;
  if (message.hostId && message.hostId !== peerId) return;
  if (MULTIPLAYER_STATE.remoteNick && MULTIPLAYER_STATE.remoteNick !== peerId) return;

  MULTIPLAYER_STATE.remoteNick = peerId;
  MULTIPLAYER_STATE.isConnected = true;
  multiplayerApplyRoster(message.players);
  multiplayerSetStatus('Connected');
  multiplayerRenderHud();
  multiplayerSyncActionButtons();
  multiplayerSyncModal();
}

function multiplayerHandleRejected(message, peerId) {
  if (MULTIPLAYER_STATE.role !== 'client') return;
  if (MULTIPLAYER_STATE.remoteNick && MULTIPLAYER_STATE.remoteNick !== peerId) return;
  const reason = String(message.reason || 'Could not join room');
  multiplayerTeardownSession({ closeOverlays: false, syncActionButtons: true });
  multiplayerSetStatus(reason);
  if (typeof showToast === 'function') showToast(reason);
}

function multiplayerReceiveMessage(message, peerId) {
  if (!message || typeof message !== 'object' || !message.type) return;

  if (message.type === 'presence') {
    multiplayerHandlePresence(message, peerId);
    return;
  }
  if (message.type === 'welcome') {
    multiplayerHandleWelcome(message, peerId);
    return;
  }
  if (message.type === 'rejected') {
    multiplayerHandleRejected(message, peerId);
    return;
  }
  if (message.type === 'roster') {
    if (MULTIPLAYER_STATE.role === 'client' && peerId === MULTIPLAYER_STATE.remoteNick) {
      multiplayerApplyRoster(message.players);
    }
    return;
  }

  if (MULTIPLAYER_STATE.role === 'host') {
    if (!MULTIPLAYER_STATE.remoteNicks.includes(peerId)) return;
  } else if (MULTIPLAYER_STATE.role === 'client') {
    if (!MULTIPLAYER_STATE.remoteNick || peerId !== MULTIPLAYER_STATE.remoteNick) return;
  } else {
    return;
  }

  const allowedTypes = MULTIPLAYER_STATE.role === 'host'
    ? ['claim', 'shuffle_request']
    : ['state', 'claim_result', 'shuffle_result', 'finish'];
  if (!allowedTypes.includes(message.type)) return;

  const routedMessage = { ...message, __from: peerId };
  if (MULTIPLAYER_STATE.role === 'host') routedMessage.nick = peerId;
  multiplayerHandleMessage(routedMessage);
}

function multiplayerHandlePeerLeave(peerId) {
  if (MULTIPLAYER_STATE.role === 'client') {
    if (peerId === MULTIPLAYER_STATE.remoteNick) multiplayerHandlePeerDisconnect();
    return;
  }
  if (MULTIPLAYER_STATE.role !== 'host') return;

  const index = MULTIPLAYER_STATE.remoteNicks.indexOf(peerId);
  if (index < 0) return;
  const displayNick = multiplayerDisplayNick(peerId);
  MULTIPLAYER_STATE.remoteNicks.splice(index, 1);
  if (!MULTIPLAYER_STATE.matchActive) delete MULTIPLAYER_STATE.playerNames[peerId];
  MULTIPLAYER_STATE.isConnected = MULTIPLAYER_STATE.remoteNicks.length > 0;

  if (MULTIPLAYER_STATE.matchActive && !MULTIPLAYER_STATE.isConnected) {
    multiplayerTeardownSession({ switchToNormalMode: true });
    if (typeof showToast === 'function') showToast('All opponents left. Switched to Normal mode');
    return;
  }

  multiplayerSend(multiplayerRosterPayload());
  multiplayerSetStatus(MULTIPLAYER_STATE.isConnected ? 'Connected' : 'Waiting for players...');
  if (typeof showToast === 'function') showToast(displayNick + ' left the game');
  multiplayerRenderHud();
  multiplayerSyncActionButtons();
  multiplayerSyncModal();
}

async function multiplayerConnectRoom(role, roomCode) {
  const code = multiplayerNormalizeRoomCode(roomCode);
  if (!code || code.length < 4 || MULTIPLAYER_STATE.role) return;

  const connectToken = MULTIPLAYER_STATE.connectToken + 1;
  MULTIPLAYER_STATE.connectToken = connectToken;
  MULTIPLAYER_STATE.role = role;
  MULTIPLAYER_STATE.lobbyId = code;
  MULTIPLAYER_STATE.localDisplayNick = multiplayerGetNickname();
  MULTIPLAYER_STATE.isConnecting = true;
  multiplayerSetStatus('Loading network...');
  multiplayerSyncModal();

  let trystero;
  try {
    trystero = await import(MULTIPLAYER_TRYSTERO_URL);
  } catch (err) {
    if (MULTIPLAYER_STATE.connectToken !== connectToken) return;
    console.error('Failed to load Trystero:', err);
    multiplayerTeardownSession({ closeOverlays: false, syncActionButtons: true });
    multiplayerSetStatus('Could not load network library');
    return;
  }

  if (MULTIPLAYER_STATE.connectToken !== connectToken || MULTIPLAYER_STATE.role !== role) return;

  try {
    const room = trystero.joinRoom({
      appId: MULTIPLAYER_APP_ID,
      turnConfig: MULTIPLAYER_TURN_SERVERS
    }, code, {
      onJoinError: ({ error }) => {
        if (MULTIPLAYER_STATE.room !== room || MULTIPLAYER_STATE.isConnected) return;
        console.warn('Trystero peer connection failed:', error);
        multiplayerSetStatus('Could not connect to peer');
      }
    });
    const action = room.makeAction('msg');

    MULTIPLAYER_STATE.room = room;
    MULTIPLAYER_STATE.messageAction = action;
    MULTIPLAYER_STATE.localNick = trystero.selfId;
    MULTIPLAYER_STATE.playerNames = {
      [trystero.selfId]: MULTIPLAYER_STATE.localDisplayNick
    };
    MULTIPLAYER_STATE.isConnecting = false;

    action.onMessage = (message, meta) => {
      if (MULTIPLAYER_STATE.room !== room) return;
      multiplayerReceiveMessage(message, meta && meta.peerId);
    };
    room.onPeerJoin = peerId => {
      if (MULTIPLAYER_STATE.room !== room) return;
      multiplayerSendPresence(peerId);
    };
    room.onPeerLeave = peerId => {
      if (MULTIPLAYER_STATE.room !== room) return;
      multiplayerHandlePeerLeave(peerId);
    };

    multiplayerSetStatus(role === 'host' ? 'Waiting for players...' : 'Looking for host...');
    multiplayerSyncModal();
  } catch (err) {
    if (MULTIPLAYER_STATE.connectToken !== connectToken) return;
    console.error('Failed to join multiplayer room:', err);
    multiplayerTeardownSession({ closeOverlays: false, syncActionButtons: true });
    multiplayerSetStatus('Could not join room');
  }
}

function multiplayerHostLobby() {
  if (MULTIPLAYER_STATE.role === 'host') {
    if (multiplayerGetConnectedPeerCount() < 1) {
      multiplayerSetStatus('Waiting for players...');
      if (typeof showToast === 'function') showToast('Wait until at least one player connects');
      return;
    }
    multiplayerStartMatch();
    closeMultiplayerModal();
    closeSettingsPanel();
    return;
  }
  if (MULTIPLAYER_STATE.role) {
    if (typeof showToast === 'function') showToast('Leave the current room first');
    return;
  }

  const code = multiplayerGenerateRoomCode();
  const input = document.getElementById('multiplayer-room-code');
  if (input) input.value = code;
  multiplayerConnectRoom('host', code);
}

function multiplayerJoinLobby() {
  if (MULTIPLAYER_STATE.role) {
    if (typeof showToast === 'function') showToast('Leave the current room first');
    return;
  }
  const input = document.getElementById('multiplayer-room-code');
  const code = multiplayerNormalizeRoomCode(input ? input.value : '');
  if (input) input.value = code;
  if (code.length < 4) {
    multiplayerSetStatus('Enter a room code');
    if (typeof showToast === 'function') showToast('Enter a room code');
    return;
  }
  multiplayerConnectRoom('client', code);
}

function multiplayerHandleModeSwitchAway() {
  multiplayerTeardownSession({ syncActionButtons: true });
}

function multiplayerLeave() {
  multiplayerTeardownSession({ switchToNormalMode: true });
}
