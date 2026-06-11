/** Auto-split from multiplayer.js */

const MULTIPLAYER_POLL_INTERVAL_FAST_MS = 150;
const MULTIPLAYER_POLL_INTERVAL_IDLE_MS = 2000;

function multiplayerResetConnectionState() {
  MULTIPLAYER_STATE.isConnected = false;
  MULTIPLAYER_STATE.channel = null;
  if (MULTIPLAYER_STATE.pc) {
    try { MULTIPLAYER_STATE.pc.close(); } catch (_) {}
  }
  MULTIPLAYER_STATE.pc = null;

  const peers = MULTIPLAYER_STATE.peerConnections || {};
  Object.keys(peers).forEach((nick) => {
    const entry = peers[nick];
    if (entry && entry.pc) {
      try { entry.pc.close(); } catch (_) {}
    }
    if (entry && entry.iceFlushTimer) clearTimeout(entry.iceFlushTimer);
    if (entry && entry.connectTimer) clearTimeout(entry.connectTimer);
  });

  MULTIPLAYER_STATE.peerConnections = {};
  if (MULTIPLAYER_STATE.connectionTimeout) {
    clearTimeout(MULTIPLAYER_STATE.connectionTimeout);
    MULTIPLAYER_STATE.connectionTimeout = null;
  }
  MULTIPLAYER_STATE.pendingRemoteState = null;
  MULTIPLAYER_STATE.processedSignals = new Set();
  MULTIPLAYER_STATE.pendingClaim = false;
  MULTIPLAYER_STATE.pendingShuffle = false;
  MULTIPLAYER_STATE.lastStateVersion = 0;
  MULTIPLAYER_STATE.isReady = false;
  MULTIPLAYER_STATE.remoteReady = false;
  MULTIPLAYER_STATE.remoteReadyByNick = {};
  MULTIPLAYER_STATE.remoteNick = '';
  MULTIPLAYER_STATE.remoteNicks = [];
  MULTIPLAYER_STATE.offerSent = false;
  MULTIPLAYER_STATE.answerSent = false;
  MULTIPLAYER_STATE.lastRemoteOfferSdp = '';
  MULTIPLAYER_STATE.pendingIceCandidates = [];
  MULTIPLAYER_STATE.outboundIceCandidates = [];
  if (MULTIPLAYER_STATE.iceFlushTimer) {
    clearTimeout(MULTIPLAYER_STATE.iceFlushTimer);
    MULTIPLAYER_STATE.iceFlushTimer = null;
  }
  multiplayerSyncActionButtons();
}

function multiplayerStopPolling() {
  if (MULTIPLAYER_STATE.pollTimer) clearInterval(MULTIPLAYER_STATE.pollTimer);
  MULTIPLAYER_STATE.pollTimer = null;
}

function multiplayerStartPolling() {
  multiplayerStopPolling();
  MULTIPLAYER_STATE.pollIntervalMs = MULTIPLAYER_POLL_INTERVAL_FAST_MS;
  MULTIPLAYER_STATE.pollTimer = setInterval(multiplayerPollLobby, MULTIPLAYER_POLL_INTERVAL_FAST_MS);
  multiplayerPollLobby();
}

// The lobby is only needed for signaling: fast polling while a handshake is
// in flight, slow for a host waiting for new players, none at all for a
// connected client (gameplay runs over the data channel).
function multiplayerTunePollingInterval() {
  let desired;
  if (MULTIPLAYER_STATE.role === 'host') {
    const remotes = MULTIPLAYER_STATE.remoteNicks || [];
    const handshakeInFlight = remotes.some((nick) => {
      if (!MULTIPLAYER_STATE.remoteReadyByNick[nick]) return false;
      const entry = (MULTIPLAYER_STATE.peerConnections || {})[nick];
      return !entry || !entry.channel || entry.channel.readyState !== 'open';
    });
    desired = handshakeInFlight ? MULTIPLAYER_POLL_INTERVAL_FAST_MS : MULTIPLAYER_POLL_INTERVAL_IDLE_MS;
  } else {
    desired = MULTIPLAYER_STATE.isConnected ? 0 : MULTIPLAYER_POLL_INTERVAL_FAST_MS;
  }
  const current = MULTIPLAYER_STATE.pollTimer ? MULTIPLAYER_STATE.pollIntervalMs : 0;
  if (desired === current) return;
  MULTIPLAYER_STATE.pollIntervalMs = desired;
  if (MULTIPLAYER_STATE.pollTimer) clearInterval(MULTIPLAYER_STATE.pollTimer);
  MULTIPLAYER_STATE.pollTimer = desired > 0 ? setInterval(multiplayerPollLobby, desired) : null;
}

function multiplayerRetryConnection() {
  multiplayerResetConnectionState();
  MULTIPLAYER_STATE.isReady = true;
  multiplayerSetStatus('Retrying connection...');
  multiplayerStartPolling();
}

async function multiplayerPollLobby() {
  if (!MULTIPLAYER_STATE.lobbyId || MULTIPLAYER_STATE.pollInFlight) return;
  MULTIPLAYER_STATE.pollInFlight = true;
  try {
    const data = await multiplayerRequest('lobby_get', { lobbyId: MULTIPLAYER_STATE.lobbyId, nickname: MULTIPLAYER_STATE.localNick });
    if (!data || !data.ok || !data.lobby) return;
    const lobby = data.lobby;

    if (Array.isArray(lobby.players)) {
      const others = lobby.players
        .map(p => String(p.nick || p.nickname || '').trim())
        .filter(n => n && n.toLowerCase() !== MULTIPLAYER_STATE.localNick.toLowerCase());
      const nextRemotes = [...new Set(others)];
      const prevSignature = (MULTIPLAYER_STATE.remoteNicks || []).join('|');
      const nextSignature = nextRemotes.join('|');
      MULTIPLAYER_STATE.remoteNicks = nextRemotes;
      MULTIPLAYER_STATE.remoteNick = MULTIPLAYER_STATE.remoteNicks[0] || '';
      if (MULTIPLAYER_STATE.remoteNick) multiplayerSetStatus(MULTIPLAYER_STATE.statusBaseText || 'Connected');
      if (prevSignature !== nextSignature && typeof multiplayerSyncModal === 'function') multiplayerSyncModal();
    }

    if (Array.isArray(lobby.signals)) multiplayerProcessSignals(lobby.signals);

    if (MULTIPLAYER_STATE.role === 'host' && MULTIPLAYER_STATE.isReady) {
      const remotes = MULTIPLAYER_STATE.remoteNicks || [];
      remotes.forEach((nick) => {
        if (!MULTIPLAYER_STATE.remoteReadyByNick[nick]) return;
        const entry = multiplayerGetPeerEntry(nick, true);
        if (!entry.pc && !entry.offerSent) multiplayerStartOffer(nick);
      });
    }
  } catch (err) {
    console.warn('Poll error:', err);
  } finally {
    MULTIPLAYER_STATE.pollInFlight = false;
    multiplayerTunePollingInterval();
  }
}

async function multiplayerSendSignal(type, payload) {
  if (!MULTIPLAYER_STATE.lobbyId) return;
  try {
    await multiplayerRequest('lobby_signal', {
      lobbyId: MULTIPLAYER_STATE.lobbyId,
      nickname: MULTIPLAYER_STATE.localNick,
      signalType: type,
      payload: payload || ''
    });
  } catch (err) {
    console.warn('Failed to send signal:', type, err);
  }
}

function multiplayerProcessSignals(signals) {
  if (!Array.isArray(signals)) return;

  signals.forEach(sig => {
    const key = [sig.from, sig.type, sig.at, sig.payload].join('|');
    if (MULTIPLAYER_STATE.processedSignals.has(key)) return;
    MULTIPLAYER_STATE.processedSignals.add(key);
    if (sig.from && sig.from.toLowerCase() === MULTIPLAYER_STATE.localNick.toLowerCase()) return;

    let parsed = null;
    try { parsed = sig.payload ? JSON.parse(sig.payload) : null; } catch (_) { parsed = null; }
    const target = parsed && parsed.to ? String(parsed.to).trim() : '';
    if (target && target.toLowerCase() !== MULTIPLAYER_STATE.localNick.toLowerCase()) return;

    if (sig.type === 'ready') {
      const remoteNick = String(sig.from || '').trim();
      if (remoteNick) {
        MULTIPLAYER_STATE.remoteReadyByNick[remoteNick] = true;
        MULTIPLAYER_STATE.remoteReady = true;
        if (!MULTIPLAYER_STATE.remoteNicks.includes(remoteNick)) MULTIPLAYER_STATE.remoteNicks.push(remoteNick);
      }
      return;
    }

    if (sig.type === 'offer') {
      const offer = (parsed && parsed.sdp) ? parsed.sdp : parsed;
      multiplayerHandleOffer(offer, sig.from);
      return;
    }
    if (sig.type === 'answer') {
      const answer = (parsed && parsed.sdp) ? parsed.sdp : parsed;
      multiplayerHandleAnswer(answer, sig.from);
      return;
    }
    if (sig.type === 'ice') {
      const candidate = (parsed && parsed.candidate) ? parsed.candidate : parsed;
      multiplayerHandleIceCandidate(candidate, sig.from);
      return;
    }
    if (sig.type === 'ice_batch') {
      const candidates = (parsed && Array.isArray(parsed.candidates)) ? parsed.candidates : parsed;
      if (Array.isArray(candidates)) candidates.forEach(c => multiplayerHandleIceCandidate(c, sig.from));
      return;
    }
  });
}
