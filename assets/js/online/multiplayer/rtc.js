/** Auto-split from multiplayer.js */

function multiplayerGetPeerEntry(nick, shouldCreate) {
  const key = String(nick || '').trim();
  if (!key) return null;
  if (!MULTIPLAYER_STATE.peerConnections) MULTIPLAYER_STATE.peerConnections = {};
  if (!MULTIPLAYER_STATE.peerConnections[key] && shouldCreate) {
    MULTIPLAYER_STATE.peerConnections[key] = {
      pc: null,
      channel: null,
      pendingIceCandidates: [],
      outboundIceCandidates: [],
      iceFlushTimer: null,
      offerSent: false,
      answerSent: false,
      lastRemoteOfferSdp: ''
    };
  }
  return MULTIPLAYER_STATE.peerConnections[key] || null;
}

function multiplayerCreatePeerConnection(isHost, peerNick) {
  debugLog('Creating peer connection, isHost:', isHost, 'peer:', peerNick || 'host');

  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  });

  pc.onicecandidate = (e) => {
    if (!e.candidate) {
      multiplayerFlushIceCandidates('complete', peerNick);
      return;
    }

    if (isHost) {
      const entry = multiplayerGetPeerEntry(peerNick, true);
      entry.outboundIceCandidates.push(e.candidate);
      if (!entry.iceFlushTimer) {
        entry.iceFlushTimer = setTimeout(() => multiplayerFlushIceCandidates('timer', peerNick), 350);
      }
      return;
    }

    MULTIPLAYER_STATE.outboundIceCandidates.push(e.candidate);
    if (!MULTIPLAYER_STATE.iceFlushTimer) {
      MULTIPLAYER_STATE.iceFlushTimer = setTimeout(() => multiplayerFlushIceCandidates('timer'), 350);
    }
  };

  if (isHost) {
    const channel = pc.createDataChannel('set-mp', { ordered: true });
    multiplayerSetupChannel(channel, peerNick);
  } else {
    pc.ondatachannel = (e) => multiplayerSetupChannel(e.channel, peerNick);
  }

  return pc;
}

async function multiplayerFlushIceCandidates(reason, peerNick) {
  if (MULTIPLAYER_STATE.role === 'host' && peerNick) {
    const entry = multiplayerGetPeerEntry(peerNick, false);
    if (!entry) return;
    if (entry.iceFlushTimer) {
      clearTimeout(entry.iceFlushTimer);
      entry.iceFlushTimer = null;
    }
    if (!entry.outboundIceCandidates.length) return;
    const batch = entry.outboundIceCandidates.splice(0, entry.outboundIceCandidates.length);
    await multiplayerSendSignal('ice_batch', JSON.stringify({ to: peerNick, candidates: batch }));
    return;
  }

  if (MULTIPLAYER_STATE.iceFlushTimer) {
    clearTimeout(MULTIPLAYER_STATE.iceFlushTimer);
    MULTIPLAYER_STATE.iceFlushTimer = null;
  }
  if (!MULTIPLAYER_STATE.outboundIceCandidates.length) return;
  const batch = MULTIPLAYER_STATE.outboundIceCandidates.splice(0, MULTIPLAYER_STATE.outboundIceCandidates.length);
  const to = (MULTIPLAYER_STATE.remoteNick || MULTIPLAYER_STATE.selectedLobbyHostNick || '').trim();
  await multiplayerSendSignal('ice_batch', JSON.stringify({ to: to, candidates: batch }));
}

async function multiplayerStartOffer(targetNick) {
  if (!targetNick || MULTIPLAYER_STATE.role !== 'host') return;
  const entry = multiplayerGetPeerEntry(targetNick, true);
  if (entry.pc || entry.offerSent) return;

  entry.offerSent = true;
  entry.pc = multiplayerCreatePeerConnection(true, targetNick);
  try {
    const offer = await entry.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    await entry.pc.setLocalDescription(offer);
    await multiplayerSendSignal('offer', JSON.stringify({ to: targetNick, sdp: offer }));
    multiplayerSetStatus('Connecting…');
  } catch (err) {
    console.error('Failed to create/send offer:', err);
    entry.offerSent = false;
  }
}

async function multiplayerHandleOffer(offer, fromNick) {
  if (!offer || MULTIPLAYER_STATE.role !== 'client') return;
  if (fromNick) MULTIPLAYER_STATE.remoteNick = String(fromNick).trim();

  if (offer.sdp && offer.sdp === MULTIPLAYER_STATE.lastRemoteOfferSdp) return;
  MULTIPLAYER_STATE.lastRemoteOfferSdp = offer.sdp || '';

  if (!MULTIPLAYER_STATE.pc) {
    MULTIPLAYER_STATE.pc = multiplayerCreatePeerConnection(false, MULTIPLAYER_STATE.remoteNick || 'host');
  }

  try {
    await MULTIPLAYER_STATE.pc.setRemoteDescription(new RTCSessionDescription(offer));
    while (MULTIPLAYER_STATE.pendingIceCandidates.length > 0) {
      const candidate = MULTIPLAYER_STATE.pendingIceCandidates.shift();
      await MULTIPLAYER_STATE.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    const answer = await MULTIPLAYER_STATE.pc.createAnswer();
    await MULTIPLAYER_STATE.pc.setLocalDescription(answer);
    await multiplayerSendSignal('answer', JSON.stringify({ to: MULTIPLAYER_STATE.remoteNick, sdp: answer }));
    MULTIPLAYER_STATE.answerSent = true;
    multiplayerSetStatus('Connecting…');
  } catch (err) {
    console.error('Failed to handle offer:', err);
    multiplayerSetStatus('Connection failed');
  }
}

async function multiplayerHandleAnswer(answer, fromNick) {
  if (!answer || MULTIPLAYER_STATE.role !== 'host') return;
  const entry = multiplayerGetPeerEntry(fromNick, false);
  if (!entry || !entry.pc) return;

  try {
    if (entry.pc.signalingState !== 'stable') {
      await entry.pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
    while (entry.pendingIceCandidates.length > 0) {
      const candidate = entry.pendingIceCandidates.shift();
      await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (err) {
    console.error('Failed to handle answer:', err);
  }
}

async function multiplayerHandleIceCandidate(candidate, fromNick) {
  if (!candidate) return;

  if (MULTIPLAYER_STATE.role === 'host') {
    const entry = multiplayerGetPeerEntry(fromNick, true);
    if (!entry.pc || !entry.pc.remoteDescription) {
      entry.pendingIceCandidates.push(candidate);
      return;
    }
    try {
      await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('Failed to add ICE candidate:', err);
    }
    return;
  }

  if (!MULTIPLAYER_STATE.pc || !MULTIPLAYER_STATE.pc.remoteDescription) {
    MULTIPLAYER_STATE.pendingIceCandidates.push(candidate);
    return;
  }
  try {
    await MULTIPLAYER_STATE.pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.warn('Failed to add ICE candidate:', err);
  }
}

function multiplayerSetupChannel(channel, peerNick) {
  if (MULTIPLAYER_STATE.role !== 'host') {
    MULTIPLAYER_STATE.channel = channel;
  } else {
    const entry = multiplayerGetPeerEntry(peerNick, true);
    entry.channel = channel;
  }

  channel.onopen = () => {
    if (MULTIPLAYER_STATE.role === 'host') {
      const entry = multiplayerGetPeerEntry(peerNick, true);
      entry.channel = channel;
      MULTIPLAYER_STATE.isConnected = true;
      multiplayerSendTo(peerNick, { type: 'hello', nick: MULTIPLAYER_STATE.localNick });
      multiplayerRenderHud();
      multiplayerSyncActionButtons();
      if (typeof multiplayerSyncModal === 'function') multiplayerSyncModal();
      multiplayerStopLobbyListPolling();
      multiplayerSetStatus('Connected');
      return;
    }

    MULTIPLAYER_STATE.isConnected = true;
    multiplayerSetStatus('Connected');
    multiplayerSlowDownPolling();
    multiplayerSend({ type: 'hello', nick: MULTIPLAYER_STATE.localNick });
    multiplayerRenderHud();
    multiplayerSyncActionButtons();
    if (typeof multiplayerSyncModal === 'function') multiplayerSyncModal();
    multiplayerStopLobbyListPolling();
  };

  channel.onmessage = (e) => {
    let msg = null;
    try { msg = JSON.parse(e.data); } catch (_) { return; }
    if (!msg || !msg.type) return;
    if (MULTIPLAYER_STATE.role === 'host' && peerNick && !msg.nick) msg.nick = peerNick;
    multiplayerHandleMessage(msg);
  };

  channel.onclose = () => {
    if (MULTIPLAYER_STATE.role === 'host' && peerNick) {
      multiplayerHandlePeerChannelClosed(peerNick);
    } else {
      multiplayerHandlePeerDisconnect();
    }
  };
  channel.onerror = (err) => console.error('Data channel error:', err);
}

function multiplayerSend(payload) {
  if (MULTIPLAYER_STATE.role === 'host') {
    const peers = MULTIPLAYER_STATE.peerConnections || {};
    Object.keys(peers).forEach((nick) => {
      const ch = peers[nick] && peers[nick].channel;
      if (ch && ch.readyState === 'open') {
        try { ch.send(JSON.stringify(payload)); } catch (_) {}
      }
    });
    return;
  }
  if (!MULTIPLAYER_STATE.channel || MULTIPLAYER_STATE.channel.readyState !== 'open') return;
  try { MULTIPLAYER_STATE.channel.send(JSON.stringify(payload)); } catch (_) {}
}

function multiplayerSendTo(nick, payload) {
  if (MULTIPLAYER_STATE.role !== 'host') {
    multiplayerSend(payload);
    return;
  }
  const entry = multiplayerGetPeerEntry(nick, false);
  if (!entry || !entry.channel || entry.channel.readyState !== 'open') return;
  try { entry.channel.send(JSON.stringify(payload)); } catch (_) {}
}
