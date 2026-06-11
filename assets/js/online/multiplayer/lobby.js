/** Auto-split from multiplayer.js */

function multiplayerNormalizeTimestamp(value) {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 1e12 ? raw * 1000 : raw;
}

async function multiplayerRefreshLobbyList() {
  if (MULTIPLAYER_STATE.isLobbyListLoading) return;
  MULTIPLAYER_STATE.isLobbyListLoading = true;
  const hadLobbies = Array.isArray(MULTIPLAYER_STATE.availableLobbies) && MULTIPLAYER_STATE.availableLobbies.length > 0;
  if (!hadLobbies && !MULTIPLAYER_STATE.hasLoadedLobbyListOnce) {
    multiplayerSetStatus('Loading lobbies…');
    const listEl = document.getElementById('multiplayer-lobby-list');
    if (listEl) listEl.innerHTML = '<div class="multiplayer-lobby-item multiplayer-lobby-item--empty">Loading…</div>';
  }
  try {
    const data = await multiplayerRequest('lobby_list', {});
    const rawLobbies = Array.isArray(data && data.lobbies) ? data.lobbies : [];
    const now = Date.now();
    const cutoff = now - MULTIPLAYER_LOBBY_MAX_AGE_MS;
    const normalizedLobbies = rawLobbies
      .map((lobby) => {
        const lobbyId = String((lobby && (lobby.lobbyId || lobby.id)) || '').trim();
        const createdAt = multiplayerNormalizeTimestamp(lobby.createdAt || lobby.at || 0);
        return { ...lobby, lobbyId, createdAt };
      })
      .filter((lobby) => lobby.lobbyId)
      .slice()
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    const latestLobbies = normalizedLobbies.slice(0, MULTIPLAYER_LOBBY_ALWAYS_INCLUDE_RECENT);
    const timeBasedLobbies = normalizedLobbies.filter((lobby) => lobby.createdAt >= cutoff);
    const nextLobbies = [...latestLobbies];
    for (const lobby of timeBasedLobbies) {
      if (nextLobbies.some((entry) => entry.lobbyId === lobby.lobbyId)) continue;
      nextLobbies.push(lobby);
      if (nextLobbies.length >= 8) break;
    }
    if (MULTIPLAYER_STATE.selectedLobbyId) {
      const selectedLobby = nextLobbies.find((lobby) => String(lobby.lobbyId || lobby.id || '').trim() === MULTIPLAYER_STATE.selectedLobbyId);
      if (selectedLobby) {
        MULTIPLAYER_STATE.selectedLobbyHostNick = String(selectedLobby.hostNick || selectedLobby.nickname || selectedLobby.nick || selectedLobby.host || '').trim();
      }
    }
    const nextSignature = nextLobbies
      .map((lobby) => {
        const hostNick = String(lobby.hostNick || lobby.nickname || lobby.nick || lobby.host || 'Unknown').trim() || 'Unknown';
        const createdAt = Number(lobby.createdAt || 0);
        const playerCount = Number(lobby.playerCount || (Array.isArray(lobby.players) ? lobby.players.length : 0));
        return `${lobby.lobbyId}:${hostNick}:${createdAt}:${playerCount}`;
      })
      .join('|');

    const hasListChanged = nextSignature !== MULTIPLAYER_STATE.lobbyListLastSignature;
    MULTIPLAYER_STATE.availableLobbies = nextLobbies;
    MULTIPLAYER_STATE.lobbyListLastSignature = nextSignature;
    if (hasListChanged || !MULTIPLAYER_STATE.hasLoadedLobbyListOnce) {
      multiplayerRenderLobbyList();
    }
    MULTIPLAYER_STATE.hasLoadedLobbyListOnce = true;
  } catch (err) {
    console.error('Failed to load lobbies:', err);
    MULTIPLAYER_STATE.availableLobbies = [];
    MULTIPLAYER_STATE.lobbyListLastSignature = '';
    MULTIPLAYER_STATE.hasLoadedLobbyListOnce = true;
    multiplayerRenderLobbyList();
    multiplayerSetStatus('Failed to load lobbies');
    if (typeof showToast === 'function') showToast(err.message || 'Failed to load lobbies');
  } finally {
    MULTIPLAYER_STATE.isLobbyListLoading = false;
  }
}

function multiplayerRenderLobbyList() {
  const listEl = document.getElementById('multiplayer-lobby-list');
  if (!listEl) return;
  const prevTop = listEl.scrollTop;
  listEl.innerHTML = '';
  const lobbies = Array.isArray(MULTIPLAYER_STATE.availableLobbies) ? MULTIPLAYER_STATE.availableLobbies : [];
  if (!lobbies.length) {
    const empty = document.createElement('div');
    empty.className = 'multiplayer-lobby-item multiplayer-lobby-item--empty';
    empty.textContent = 'No lobbies';
    listEl.appendChild(empty);
    return;
  }
  lobbies.forEach((lobby) => {
    const lobbyId = String(lobby.lobbyId || lobby.id || '').trim();
    const hostNick = String(lobby.hostNick || lobby.nickname || lobby.nick || lobby.host || 'Unknown').trim() || 'Unknown';
    if (!lobbyId) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'multiplayer-lobby-item';
    if (MULTIPLAYER_STATE.selectedLobbyId && MULTIPLAYER_STATE.selectedLobbyId === lobbyId) {
      btn.classList.add('active');
    }
    btn.onpointerdown = () => multiplayerJoinLobby(lobbyId, hostNick);

    const nickEl = document.createElement('div');
    nickEl.className = 'multiplayer-lobby-host';
    nickEl.textContent = multiplayerDisplayNick(hostNick);

    const idEl = document.createElement('div');
    idEl.className = 'multiplayer-lobby-id';
    const count = Number(lobby.playerCount || (Array.isArray(lobby.players) ? lobby.players.length : 0)) || 1;
    idEl.textContent = 'Lobby: ' + lobbyId + ' · Players: ' + count + '/3';

    btn.appendChild(nickEl);
    btn.appendChild(idEl);
    listEl.appendChild(btn);
  });
  listEl.scrollTop = prevTop;
}

async function multiplayerRequest(action, params) {
  const base = multiplayerGetBaseUrl();
  if (!base) throw new Error('Online endpoint not configured');
  const q = Object.keys(params || {}).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  const url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'action=' + encodeURIComponent(action) + (q ? '&' + q : '');
  if (typeof jsonpRequest === 'function') {
    const res = await jsonpRequest(url);
    if (Array.isArray(res)) {
      throw new Error('Lobby API not supported by endpoint');
    }
    return res;
  }
  const res = await fetch(url);
  const json = await res.json();
  if (Array.isArray(json)) {
    throw new Error('Lobby API not supported by endpoint');
  }
  return json;
}

async function multiplayerHostLobby() {
  const alreadyHosting = MULTIPLAYER_STATE.role === 'host' && !!MULTIPLAYER_STATE.lobbyId;
  if (alreadyHosting) {
    const connectedPeers = (typeof multiplayerGetConnectedPeerCount === 'function') ? multiplayerGetConnectedPeerCount() : 0;
    if (connectedPeers < 1) {
      multiplayerSetStatus('Waiting for player…');
      if (typeof showToast === 'function') showToast('Wait until at least one player connects');
      multiplayerSyncModal();
      return;
    }
    multiplayerStartMatch();
    closeMultiplayerModal();
    closeSettingsPanel();
    return;
  }

  const nick = multiplayerGetWireNick();
  MULTIPLAYER_STATE.localNick = nick;
  multiplayerSetStatus('Creating lobby…');
  try {
    const data = await multiplayerRequest('lobby_create', { nickname: nick });
    if (!data || !data.ok || !data.lobbyId) throw new Error((data && data.error) || 'Failed to create lobby');
    multiplayerResetConnectionState();
    MULTIPLAYER_STATE.role = 'host';
    MULTIPLAYER_STATE.lobbyId = data.lobbyId;
    MULTIPLAYER_STATE.isReady = true;
    MULTIPLAYER_STATE.connectionState = 'waiting_ready';
    debugLog('Lobby created:', data.lobbyId);
    multiplayerSetStatus('Lobby created. Waiting for player…');
    multiplayerSyncModal();
    multiplayerStartPolling();
  } catch (err) {
    console.error('Failed to create lobby:', err);
    multiplayerSetStatus('Failed to create lobby');
    if (typeof showToast === 'function') showToast(err.message || 'Failed to create lobby');
  }
}

async function multiplayerJoinLobby(selectedLobbyId, selectedHostNick) {
  const lobbyId = String(selectedLobbyId || '').trim();
  if (!lobbyId) {
    if (typeof showToast === 'function') showToast('Select a lobby');
    return;
  }
  const selectedLobby = (MULTIPLAYER_STATE.availableLobbies || []).find((entry) => String(entry.lobbyId || entry.id || '').trim() === lobbyId);
  const currentPlayers = Number(selectedLobby && (selectedLobby.playerCount || (Array.isArray(selectedLobby.players) ? selectedLobby.players.length : 0))) || 0;
  if (currentPlayers >= 3) {
    if (typeof showToast === 'function') showToast('Lobby is full');
    return;
  }

  const nick = multiplayerGetWireNick();
  MULTIPLAYER_STATE.localNick = nick;
  MULTIPLAYER_STATE.selectedLobbyId = lobbyId;
  MULTIPLAYER_STATE.selectedLobbyHostNick = String(selectedHostNick || '').trim();
  multiplayerRenderLobbyList();
  multiplayerSetStatus('Joining lobby…');
  try {
    const data = await multiplayerRequest('lobby_join', { lobbyId: lobbyId, nickname: nick });
    if (!data || !data.ok) throw new Error((data && data.error) || 'Failed to join lobby');
    multiplayerResetConnectionState();
    MULTIPLAYER_STATE.role = 'client';
    MULTIPLAYER_STATE.lobbyId = lobbyId;
    MULTIPLAYER_STATE.connectionAttempts = 0;
    MULTIPLAYER_STATE.connectionState = 'waiting_ready';
    debugLog('Joined lobby:', lobbyId);
    multiplayerSetStatus('Joined. Preparing connection…');
    multiplayerSyncModal();
    multiplayerStartPolling();
    MULTIPLAYER_STATE.isReady = true;
    multiplayerSendSignal('ready', 'true').then(() => {
      debugLog('Ready signal sent');
      multiplayerSetStatus('Ready. Waiting for host…');
    }).catch(err => {
      console.error('Failed to send ready signal:', err);
    });
  } catch (err) {
    console.error('Failed to join lobby:', err);
    multiplayerSetStatus('Failed to join lobby');
    if (typeof showToast === 'function') showToast(err.message || 'Failed to join lobby');
  }
}
