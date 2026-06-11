/**
 * =============================================================================
 * Multiplayer Lobby, Connection, and Match Sync Logic
 * =============================================================================
 *
 * This module handles the full multiplayer lifecycle for Set Trainer:
 *
 * - Lobby discovery and joining:
 *   - Hosts create lobbies through the backend API.
 *   - Clients fetch recent lobbies and join by selecting one from the list.
 *   - The lobby list is refreshed on a fixed interval while the multiplayer
 *     modal is open.
 *
 * - Connection setup:
 *   - Peers exchange readiness and signaling payloads through the lobby API.
 *   - WebRTC data channels are used for real-time gameplay communication.
 *   - Connection retries, ICE batching, and adaptive polling are used to make
 *     setup more resilient on unstable networks.
 *
 * - Match authority and state replication:
 *   - Host is authoritative for deck/board transitions and scoring outcomes.
 *   - Host broadcasts state snapshots for start, shuffles, claims, and finish.
 *   - Client applies host snapshots and uses remote-authoritative rendering.
 *
 * - UX and teardown behavior:
 *   - Multiplayer and settings overlays are closed automatically when a match
 *     starts.
 *   - On leave or peer disconnect, multiplayer state is fully reset, the game
 *     is forced back to Normal mode, and the session restarts with a toast.
 *
 * Dependencies:
 * - Global game state/UI helpers from game-logic.js, settings.js, modal-management.js.
 * - Lobby backend endpoint configured via ONLINE_LOBBY_URL / ONLINE_LEADERBOARD_URL.
 * - Browser WebRTC APIs (RTCPeerConnection, RTCSessionDescription, RTCIceCandidate).
 */

const MULTIPLAYER_STATE = {
  role: null,
  lobbyId: '',
  pc: null,
  channel: null,
  pollTimer: null,
  pollInFlight: false,
  processedSignals: new Set(),
  isConnected: false,
  statusText: 'Not connected',
  statusBaseText: 'Not connected',
  localNick: '',
  remoteNick: '',
  remoteNicks: [],
  remoteReadyByNick: {},
  peerConnections: {},
  scores: {},
  timestampsByNick: {},
  lastSetTimeByNick: {},
  startEpoch: 0,
  pendingClaim: false,
  pendingShuffle: false,
  preferRemote: false,
  prevGameMode: null,
  lastStateVersion: 0,
  isApplyingState: false,
  isReady: false,
  remoteReady: false,
  offerSent: false,
  answerSent: false,
  connectionAttempts: 0,
  connectionState: 'idle',
  connectionStartTime: 0,
  connectionTimeout: null,
  pendingIceCandidates: [],
  outboundIceCandidates: [],
  iceFlushTimer: null,
  waitingForAnswerSince: 0,
  extendedAnswerWait: false,
  lastRemoteOfferSdp: '',
  isConnecting: false,
  availableLobbies: [],
  isLobbyListLoading: false,
  lobbyListLastSignature: '',
  hasLoadedLobbyListOnce: false,
  lobbyListTimer: null,
  rematchPrepared: false,
  selectedLobbyId: '',
  selectedLobbyHostNick: ''
};

const MULTIPLAYER_LOBBY_MAX_AGE_MS = 3 * 60 * 1000;
const MULTIPLAYER_LOBBY_ALWAYS_INCLUDE_RECENT = 2;


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
  const peers = MULTIPLAYER_STATE.peerConnections || {};
  return Object.keys(peers).reduce((acc, nick) => {
    const channel = peers[nick] && peers[nick].channel;
    return acc + ((channel && channel.readyState === 'open') ? 1 : 0);
  }, 0);
}

function multiplayerGetNickname() {
  if (typeof ensureOnlineNickname === 'function') return ensureOnlineNickname();
  const raw = (config && config.onlineNickname) ? String(config.onlineNickname) : '';
  return raw.trim() || 'Player';
}

function multiplayerGetBaseUrl() {
  if (typeof getOnlineApiUrl === 'function') return getOnlineApiUrl('lobby');
  const lobbyUrl = normalizeAppsScriptExecUrl(ONLINE_LOBBY_URL);
  if (lobbyUrl) return lobbyUrl;
  if (typeof getLeaderboardBaseUrl === 'function') return getLeaderboardBaseUrl();
  return normalizeAppsScriptExecUrl(ONLINE_LEADERBOARD_URL);
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

function multiplayerResetSessionState() {
  Object.assign(MULTIPLAYER_STATE, {
    role: null,
    lobbyId: '',
    remoteNick: '',
    remoteNicks: [],
    remoteReadyByNick: {},
    peerConnections: {},
    scores: {},
    timestampsByNick: {},
    lastSetTimeByNick: {},
    isConnected: false,
    preferRemote: false,
    availableLobbies: [],
    isLobbyListLoading: false,
    lobbyListLastSignature: '',
    hasLoadedLobbyListOnce: false,
    rematchPrepared: false,
    prevGameMode: null,
    selectedLobbyId: '',
    selectedLobbyHostNick: ''
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

  multiplayerStopPolling();
  multiplayerStopLobbyListPolling();
  multiplayerResetConnectionState();
  multiplayerResetSessionState();
  multiplayerSetStatus('Not connected');
  multiplayerRenderHud();

  if (syncActionButtons) multiplayerSyncActionButtons();
  if (closeOverlays) multiplayerCloseOverlays();
  if (switchToNormalMode) multiplayerReinitializeGameToNormalMode();
}

function multiplayerHandlePeerDisconnect() {
  if (!MULTIPLAYER_STATE.role) return;
  const wasConnected = MULTIPLAYER_STATE.isConnected;
  multiplayerTeardownSession({ switchToNormalMode: true });
  if (wasConnected && typeof showToast === 'function') showToast('Opponent left. Switched to Normal mode and restarted game');
}

function multiplayerHandlePeerChannelClosed(peerNick) {
  if (MULTIPLAYER_STATE.role !== 'host') return;
  const key = String(peerNick || '').trim();
  const peers = MULTIPLAYER_STATE.peerConnections || {};
  const entry = peers[key];
  if (!entry) return;
  if (entry.pc) {
    try { entry.pc.close(); } catch (_) {}
  }
  if (entry.iceFlushTimer) clearTimeout(entry.iceFlushTimer);
  delete peers[key];
  MULTIPLAYER_STATE.remoteNicks = (MULTIPLAYER_STATE.remoteNicks || []).filter(n => n !== key);
  MULTIPLAYER_STATE.remoteNick = MULTIPLAYER_STATE.remoteNicks[0] || '';
  if (MULTIPLAYER_STATE.remoteReadyByNick) delete MULTIPLAYER_STATE.remoteReadyByNick[key];

  if (multiplayerGetConnectedPeerCount() === 0) {
    multiplayerHandlePeerDisconnect();
    return;
  }

  if (typeof showToast === 'function') showToast(key + ' left the game');
  multiplayerRenderHud();
  multiplayerSyncActionButtons();
  if (typeof multiplayerSyncModal === 'function') multiplayerSyncModal();
}

function multiplayerHandleModeSwitchAway() {
  multiplayerTeardownSession({ syncActionButtons: true });
}

function multiplayerLeave() {
  multiplayerTeardownSession({ switchToNormalMode: true });
}
