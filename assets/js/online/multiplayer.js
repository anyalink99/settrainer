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
 *   - WebRTC data channels are used for real-time gameplay communication
 *     (STUN + TURN, see MULTIPLAYER_ICE_SERVERS in constants.js).
 *   - Players are addressed by a "wire nick" (display name + random session
 *     tag) so identical nicknames don't collide; the tag is stripped in UI.
 *   - Handshake timeouts, a connection-state watchdog, ICE batching, and
 *     adaptive polling make setup and disconnects resilient: lobby polling
 *     runs fast only while a handshake is in flight, slows for an idle host,
 *     and stops entirely for a connected client.
 *
 * - Match authority and state replication:
 *   - Host is authoritative for deck/board transitions and scoring outcomes.
 *   - Host broadcasts state snapshots for start, shuffles, claims, and finish.
 *   - Client applies host snapshots and uses remote-authoritative rendering.
 *
 * - UX and teardown behavior:
 *   - Multiplayer and settings overlays are closed automatically when a match
 *     starts.
 *   - When a single peer leaves, only that peer is cleaned up; the session is
 *     fully reset (back to Normal mode, with a toast) when the last peer or
 *     the host disconnects.
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
  pollIntervalMs: 0,
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
  pendingRemoteState: null,
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

// Players are addressed by "wire nick": display nickname plus a random
// session tag (e.g. "Alex#k3f9"). Signals routing, peer entries and scores
// key off the wire nick so two players with the same display name don't
// collide; the tag is stripped everywhere a name is shown. The tag lives in
// sessionStorage so a page refresh rejoins under the same identity instead
// of leaving a ghost player in the lobby.
const MULTIPLAYER_SESSION_TAG = (() => {
  try {
    const existing = sessionStorage.getItem('mpSessionTag');
    if (existing) return existing;
    const tag = Math.random().toString(36).slice(2, 6);
    sessionStorage.setItem('mpSessionTag', tag);
    return tag;
  } catch (_) {
    return Math.random().toString(36).slice(2, 6);
  }
})();

function multiplayerGetWireNick() {
  return multiplayerGetNickname() + '#' + MULTIPLAYER_SESSION_TAG;
}

function multiplayerDisplayNick(nick) {
  return String(nick || '').replace(/#[a-z0-9]{4}$/i, '');
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

function multiplayerHandleClientConnectionFailure() {
  if (MULTIPLAYER_STATE.role !== 'client') return;
  // An established session that died is a disconnect; a handshake that never
  // completed gets a couple of silent retries (signals replay from the lobby
  // log after the reset, so the handshake restarts on its own).
  if (MULTIPLAYER_STATE.isConnected) {
    multiplayerHandlePeerDisconnect();
    return;
  }
  if ((MULTIPLAYER_STATE.connectionAttempts || 0) < MULTIPLAYER_MAX_CONNECTION_RETRIES) {
    MULTIPLAYER_STATE.connectionAttempts = (MULTIPLAYER_STATE.connectionAttempts || 0) + 1;
    debugLog('Retrying connection, attempt', MULTIPLAYER_STATE.connectionAttempts);
    multiplayerRetryConnection();
    return;
  }
  multiplayerSetStatus('Connection failed');
  if (typeof showToast === 'function') showToast('Could not connect to host');
}

function multiplayerCleanupPeerEntry(peerNick) {
  const key = String(peerNick || '').trim();
  const peers = MULTIPLAYER_STATE.peerConnections || {};
  const entry = peers[key];
  if (!entry) return false;
  if (entry.pc) {
    try { entry.pc.close(); } catch (_) {}
  }
  if (entry.iceFlushTimer) clearTimeout(entry.iceFlushTimer);
  if (entry.connectTimer) clearTimeout(entry.connectTimer);
  delete peers[key];
  return true;
}

function multiplayerHandlePeerChannelClosed(peerNick) {
  if (MULTIPLAYER_STATE.role !== 'host') return;
  const key = String(peerNick || '').trim();
  if (!multiplayerCleanupPeerEntry(key)) return;
  MULTIPLAYER_STATE.remoteNicks = (MULTIPLAYER_STATE.remoteNicks || []).filter(n => n !== key);
  MULTIPLAYER_STATE.remoteNick = MULTIPLAYER_STATE.remoteNicks[0] || '';
  if (MULTIPLAYER_STATE.remoteReadyByNick) delete MULTIPLAYER_STATE.remoteReadyByNick[key];

  if (multiplayerGetConnectedPeerCount() === 0) {
    multiplayerHandlePeerDisconnect();
    return;
  }

  if (typeof showToast === 'function') showToast(multiplayerDisplayNick(key) + ' left the game');
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
