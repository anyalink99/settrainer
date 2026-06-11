/** Auto-split from multiplayer.js */

function multiplayerHandleMessage(msg) {
  if (msg.type === 'hello') {
    if (msg.nick && !MULTIPLAYER_STATE.remoteNicks.includes(String(msg.nick))) MULTIPLAYER_STATE.remoteNicks.push(String(msg.nick));
    if (msg.nick) MULTIPLAYER_STATE.remoteNick = String(msg.nick);
    multiplayerRenderHud();
    return;
  }
  if (msg.type === 'state') {
    multiplayerApplyState(msg.state, msg.reason);
    return;
  }
  if (msg.type === 'claim' && multiplayerIsHost()) {
    multiplayerHandleHostClaim(msg);
    return;
  }
  if (msg.type === 'claim_result' && multiplayerIsClient()) {
    multiplayerHandleClaimResult(msg);
    return;
  }
  if (msg.type === 'shuffle_request' && multiplayerIsHost()) {
    multiplayerHandleHostShuffleRequest(msg);
    return;
  }
  if (msg.type === 'shuffle_result' && multiplayerIsClient()) {
    multiplayerHandleShuffleResult(msg);
    return;
  }
  if (msg.type === 'finish') {
    multiplayerShowResult(msg.summary);
    return;
  }
  if (msg.type === 'rematch' && multiplayerIsHost()) {
    multiplayerStartMatch();
    return;
  }
}

function cardToCode(card) {
  if (!card) return null;
  return ((card.c * 3 + card.s) * 3 + card.f) * 3 + card.n;
}

function codeToCard(code) {
  if (code == null) return null;
  const n = code % 3;
  const f = Math.floor(code / 3) % 3;
  const s = Math.floor(code / 9) % 3;
  const c = Math.floor(code / 27) % 3;
  return { c, s, f, n };
}

function multiplayerBuildState() {
  MULTIPLAYER_STATE.lastStateVersion += 1;
  return {
    version: MULTIPLAYER_STATE.lastStateVersion,
    board: board.map(cardToCode),
    deck: deck.map(cardToCode),
    scores: { ...MULTIPLAYER_STATE.scores },
    timestampsByNick: JSON.parse(JSON.stringify(MULTIPLAYER_STATE.timestampsByNick || {})),
    elapsedMs: Date.now() - startTime,
    isGameOver: !!isGameOver
  };
}

function multiplayerBroadcastState(reason) {
  if (!multiplayerIsHost()) return;
  multiplayerSend({ type: 'state', reason: reason || '', state: multiplayerBuildState() });
}

async function multiplayerApplyState(state, reason) {
  if (!state || MULTIPLAYER_STATE.isApplyingState) return;
  if (state.version && state.version <= MULTIPLAYER_STATE.lastStateVersion) return;
  MULTIPLAYER_STATE.lastStateVersion = state.version || MULTIPLAYER_STATE.lastStateVersion;
  MULTIPLAYER_STATE.isApplyingState = true;
  try {
    if (reason === 'start') {
      if (typeof multiplayerForceCloseOverlays === 'function') multiplayerForceCloseOverlays();
      closeModal('multiplayer-result-modal');
      closeMultiplayerModal();
      closeSettingsPanel();
      isGameOver = false;
      MULTIPLAYER_STATE.preferRemote = true;
      if (multiplayerIsClient()) {
        multiplayerSetStatus('Match started');
      }
    }

    const newDeck = Array.isArray(state.deck) ? state.deck.map(codeToCard) : [];
    const incomingBoard = Array.isArray(state.board) ? state.board.map(codeToCard) : [];
    const newBoard = incomingBoard.slice(0, 12);
    while (newBoard.length < 12) newBoard.push(null);

    const changedSlots = [];
    for (let i = 0; i < 12; i++) {
      const oldCard = board[i];
      const newCard = newBoard[i];
      const oldCode = oldCard ? cardToCode(oldCard) : null;
      const newCode = newCard ? cardToCode(newCard) : null;

      if (oldCode !== newCode) {
        changedSlots.push(i);
      }
    }

    const animDuration = (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.ANIMATION_DURATION) ?
      GAME_CONFIG.ANIMATION_DURATION : 300;
    const isShuffle = reason === 'shuffle_manual' || reason === 'shuffle_auto';
    const isFullBoardChange = changedSlots.length >= 10;
    const isSetReplacement = reason === 'set' && changedSlots.length > 0 && changedSlots.length <= 3;

    if (isShuffle || isFullBoardChange) {
      isAnimating = true;

      const boardEl = document.getElementById('board');
      if (boardEl) {
        document.querySelectorAll('.card').forEach(c => c.classList.add('anim-out'));
      }

      await new Promise(r => setTimeout(r, animDuration));

      deck = newDeck;
      board = newBoard;
      for (let i = 0; i < 12; i++) updateSlot(i, true);

    } else if (isSetReplacement) {
      isAnimating = true;
      const boardEl = document.getElementById('board');
      if (boardEl) {
        changedSlots.forEach(i => {
          const card = boardEl.children[i]?.querySelector('.card');
          if (card) card.classList.add('anim-out');
        });
      }

      await new Promise(r => setTimeout(r, animDuration));
      deck = newDeck;
      board = newBoard;

      changedSlots.forEach(i => updateSlot(i, true));
      for (let i = 0; i < 12; i++) {
        if (!changedSlots.includes(i)) {
          updateSlot(i, false);
        }
      }

    } else {
      deck = newDeck;
      board = newBoard;
      for (let i = 0; i < 12; i++) updateSlot(i, reason === 'start');
    }

    MULTIPLAYER_STATE.scores = state.scores || {};
    collectedSets = MULTIPLAYER_STATE.scores[MULTIPLAYER_STATE.localNick] || 0;
    const tsByNick = state.timestampsByNick || {};
    setTimestamps = tsByNick[MULTIPLAYER_STATE.localNick] ? [...tsByNick[MULTIPLAYER_STATE.localNick]] : [];
    isGameOver = !!state.isGameOver;
    if (typeof state.elapsedMs === 'number') {
      startTime = Date.now() - state.elapsedMs;
    }

    selected = [];
    isAnimating = false;
    updateUI();
    multiplayerRenderHud();
    MULTIPLAYER_STATE.pendingClaim = false;
    MULTIPLAYER_STATE.pendingShuffle = false;
  } finally {
    MULTIPLAYER_STATE.isApplyingState = false;
  }
}

function multiplayerAwardSet(nick, possibleAtStart) {
  const now = Date.now();
  const last = MULTIPLAYER_STATE.lastSetTimeByNick[nick] || startTime;
  const findTime = now - last;
  MULTIPLAYER_STATE.lastSetTimeByNick[nick] = now;
  MULTIPLAYER_STATE.scores[nick] = (MULTIPLAYER_STATE.scores[nick] || 0) + 1;
  if (!Array.isArray(MULTIPLAYER_STATE.timestampsByNick[nick])) MULTIPLAYER_STATE.timestampsByNick[nick] = [];
  MULTIPLAYER_STATE.timestampsByNick[nick].push({ time: now, findTime: findTime, possibleAtStart: possibleAtStart || 0 });
  if (nick === MULTIPLAYER_STATE.localNick) {
    collectedSets = MULTIPLAYER_STATE.scores[nick];
    setTimestamps = [...MULTIPLAYER_STATE.timestampsByNick[nick]];
    lastSetFoundTime = now;
  }
  multiplayerRenderHud();
}

async function multiplayerHandleHostSetFound(sIdx, currentPossible) {
  if (!multiplayerIsHost()) return;
  multiplayerAwardSet(MULTIPLAYER_STATE.localNick, currentPossible);
  await applySetToBoard(sIdx);
  multiplayerBroadcastState('set');
  multiplayerCheckFinish();
}

async function multiplayerHandleHostClaim(msg) {
  if (!msg || !Array.isArray(msg.indices)) return;
  if (isAnimating || isGameOver) {
    multiplayerSendTo(msg.nick, { type: 'claim_result', ok: false, reason: 'busy' });
    return;
  }
  const sIdx = msg.indices.map(v => Number(v)).filter(v => Number.isFinite(v));
  const unique = new Set(sIdx);
  if (sIdx.length !== 3 || unique.size !== 3) {
    multiplayerSendTo(msg.nick, { type: 'claim_result', ok: false, reason: 'invalid' });
    return;
  }
  if (sIdx.some(i => i < 0 || i >= board.length || !board[i])) {
    multiplayerSendTo(msg.nick, { type: 'claim_result', ok: false, reason: 'invalid' });
    return;
  }
  const cards = sIdx.map(i => board[i]);
  const isCorrect = validateSet(cards);
  if (!isCorrect) {
    multiplayerSendTo(msg.nick, { type: 'claim_result', ok: false, reason: 'wrong' });
    return;
  }
  isAnimating = true;
  const boardEl = document.getElementById('board');
  selected.forEach(i => boardEl?.children[i]?.querySelector('.card')?.classList.remove('selected'));
  selected = [];
  const possibleAtStart = analyzePossibleSets().total;
  const nick = String((msg && msg.nick) || (msg && msg.__from) || MULTIPLAYER_STATE.remoteNick || 'Guest');
  multiplayerAwardSet(nick, possibleAtStart);
  await applySetToBoard(sIdx);
  multiplayerBroadcastState('set');
  multiplayerCheckFinish();
}

function multiplayerHandleClaimResult(msg) {
  MULTIPLAYER_STATE.pendingClaim = false;
  const boardEl = document.getElementById('board');
  selected.forEach(i => boardEl?.children[i]?.querySelector('.card')?.classList.remove('selected'));
  selected = [];
  isAnimating = false;
  if (!msg || msg.ok) return;
  if (typeof showToast === 'function') showToast('Not a set');
}

async function multiplayerHandleClientSelection(idx, el) {
  if (!MULTIPLAYER_STATE.isConnected) {
    if (typeof showToast === 'function') showToast('Connect to a lobby first');
    return;
  }
  if (MULTIPLAYER_STATE.pendingClaim || isAnimating || isGameOver) return;
  if (selected.includes(idx)) {
    selected = selected.filter(i => i !== idx);
    el.classList.remove('selected');
    return;
  }
  selected.push(idx);
  el.classList.add('selected');

  const currentPossible = analyzePossibleSets().total;

  if (selected.length === 2 && config.autoSelectThird) {
    const c1 = board[selected[0]];
    const c2 = board[selected[1]];
    const target = {};
    ['c', 's', 'f', 'n'].forEach(p => { target[p] = (3 - (c1[p] + c2[p]) % 3) % 3; });
    let thirdIdx = -1;
    for (let i = 0; i < board.length; i++) {
      if (!board[i] || selected.includes(i)) continue;
      if (['c', 's', 'f', 'n'].every(p => board[i][p] === target[p])) { thirdIdx = i; break; }
    }
    if (thirdIdx !== -1) {
      const thirdEl = document.getElementById('board').children[thirdIdx].querySelector('.card');
      selected.push(thirdIdx);
      thirdEl.classList.add('selected');
    } else {
      mistakes++;
      isAnimating = true;
      await new Promise(r => setTimeout(r, GAME_CONFIG.MISTAKE_DELAY));
      selected.forEach(i => document.getElementById('board').children[i].querySelector('.card')?.classList.remove('selected'));
      selected = [];
      isAnimating = false;
      return;
    }
  }

  if (selected.length === 3) {
    isAnimating = true;
    MULTIPLAYER_STATE.pendingClaim = true;
    multiplayerSend({ type: 'claim', nick: MULTIPLAYER_STATE.localNick, indices: [...selected], possibleAtStart: currentPossible });
  }
}

function multiplayerRequestShuffle() {
  if (!MULTIPLAYER_STATE.isConnected || !multiplayerIsClient()) return;
  if (MULTIPLAYER_STATE.pendingShuffle || MULTIPLAYER_STATE.pendingClaim || isAnimating || isGameOver) return;
  MULTIPLAYER_STATE.pendingShuffle = true;
  multiplayerSend({ type: 'shuffle_request', nick: MULTIPLAYER_STATE.localNick });
}

function multiplayerApplyBadShufflePenalty(nick) {
  if (!nick) return;
  const current = Number(MULTIPLAYER_STATE.scores[nick]) || 0;
  MULTIPLAYER_STATE.scores[nick] = current - 1;
  if (nick === MULTIPLAYER_STATE.localNick) {
    collectedSets = MULTIPLAYER_STATE.scores[nick];
  }
  multiplayerRenderHud();
}

function multiplayerAwardNoSetShufflePoint(nick) {
  if (!nick) return;
  const current = Number(MULTIPLAYER_STATE.scores[nick]) || 0;
  MULTIPLAYER_STATE.scores[nick] = current + 1;
  if (nick === MULTIPLAYER_STATE.localNick) {
    collectedSets = MULTIPLAYER_STATE.scores[nick];
  }
  multiplayerRenderHud();
}

function multiplayerHandleShuffleResult(msg) {
  MULTIPLAYER_STATE.pendingShuffle = false;
  if (!msg || msg.ok) return;
  if (msg.reason === 'bad_shuffle') {
    if (typeof applyBadShuffleButtonLock === 'function') applyBadShuffleButtonLock();
    return;
  }
  if (msg.reason === 'busy') {
    if (typeof showToast === 'function') showToast('Shuffle unavailable right now');
    return;
  }
}

function multiplayerHandleHostShuffleRequest(msg) {
  if (!multiplayerIsHost()) return;
  if (isAnimating || isGameOver) {
    multiplayerSendTo(msg.nick, { type: 'shuffle_result', ok: false, reason: 'busy' });
    return;
  }

  const possibleCount = analyzePossibleSets().total;
  const nick = String((msg && msg.nick) || MULTIPLAYER_STATE.remoteNick || 'Guest');

  if (possibleCount > 0) {
    badShuffles++;
    multiplayerApplyBadShufflePenalty(nick);
    multiplayerBroadcastState('shuffle_penalty');
    multiplayerSendTo(nick, { type: 'shuffle_result', ok: false, reason: 'bad_shuffle' });
    return;
  }

  const now = Date.now();
  const { fadeOutMs, animInMs } = getShuffleDurations();
  multiplayerAwardNoSetShufflePoint(nick);
  shuffleBtnCooldownUntil = now + fadeOutMs + animInMs;
  handleShuffleDeck(false);
  multiplayerSendTo(nick, { type: 'shuffle_result', ok: true });
}

function multiplayerCheckFinish() {
  if (!multiplayerIsHost() || isGameOver) return;
  const hasSets = analyzePossibleSets().total > 0;
  if (deck.length === 0 && !hasSets) {
    multiplayerFinishMatch();
  }
}

function multiplayerFinishMatch() {
  isGameOver = true;
  multiplayerSetStatus('Match finished');
  const summary = multiplayerBuildSummary();
  multiplayerSend({ type: 'finish', summary: summary });
  multiplayerShowResult(summary);
  multiplayerPrepareRematchBoard();
}

function multiplayerPrepareRematchBoard() {
  if (!multiplayerIsHost()) return;
  MULTIPLAYER_STATE.preferRemote = false;
  initNewDeckAndBoard();
  updateUI();
  MULTIPLAYER_STATE.rematchPrepared = true;
  multiplayerBroadcastState('rematch_prepare');
}

function multiplayerBuildSummary() {
  const scores = MULTIPLAYER_STATE.scores || {};
  const entries = Object.keys(scores);
  let winner = '—';
  let bestScore = -1;
  entries.forEach(nick => {
    const val = Number(scores[nick]) || 0;
    if (val > bestScore) {
      bestScore = val;
      winner = nick;
    } else if (val === bestScore) {
      winner = 'Tie';
    }
  });
  return { winner, scores };
}

function multiplayerShowResult(summary) {
  if (!summary) summary = multiplayerBuildSummary();
  const winnerEl = document.getElementById('multiplayer-result-winner');
  if (winnerEl) {
    const label = summary.winner === 'Tie' ? 'Tie' : (summary.winner || '—');
    winnerEl.textContent = 'Winner: ' + label;
  }
  const list = document.getElementById('multiplayer-result-scores');
  if (list) {
    list.innerHTML = '';
    const scores = summary.scores || {};
    Object.keys(scores).forEach(nick => {
      const row = document.createElement('div');
      row.className = 'mp-result-row';
      const name = document.createElement('div');
      name.className = 'mp-score-name';
      name.textContent = nick === MULTIPLAYER_STATE.localNick ? 'You' : nick;
      const val = document.createElement('div');
      val.className = 'mp-score-val';
      val.textContent = String(scores[nick] ?? 0);
      row.appendChild(name);
      row.appendChild(val);
      list.appendChild(row);
    });
  }
  openModal('multiplayer-result-modal');
}

function multiplayerRequestRematch() {
  if (!MULTIPLAYER_STATE.isConnected) return;
  if (!multiplayerIsHost()) {
    return;
  }
  multiplayerStartMatch();
  closeModal('multiplayer-result-modal');
}

function multiplayerStartMatch() {
  if (!multiplayerIsHost()) return;
  MULTIPLAYER_STATE.preferRemote = false;
  MULTIPLAYER_STATE.startEpoch = Date.now();
  const hostNick = MULTIPLAYER_STATE.localNick || multiplayerGetNickname();
  const participants = [hostNick, ...(Array.isArray(MULTIPLAYER_STATE.remoteNicks) ? MULTIPLAYER_STATE.remoteNicks : [])]
    .map((n) => String(n || '').trim())
    .filter(Boolean)
    .filter((n, i, arr) => arr.indexOf(n) === i);
  MULTIPLAYER_STATE.scores = {};
  MULTIPLAYER_STATE.timestampsByNick = {};
  MULTIPLAYER_STATE.lastSetTimeByNick = {};
  participants.forEach((nick) => {
    MULTIPLAYER_STATE.scores[nick] = 0;
    MULTIPLAYER_STATE.timestampsByNick[nick] = [];
    MULTIPLAYER_STATE.lastSetTimeByNick[nick] = MULTIPLAYER_STATE.startEpoch;
  });
  MULTIPLAYER_STATE.pendingClaim = false;
  isGameOver = false;
  multiplayerSetStatus('Match started');
  resetStats();
  if (!MULTIPLAYER_STATE.rematchPrepared) {
    initNewDeckAndBoard();
  }
  updateUI();
  if (typeof multiplayerForceCloseOverlays === 'function') multiplayerForceCloseOverlays();
  closeModal('multiplayer-result-modal');
  closeSettingsPanel();
  MULTIPLAYER_STATE.rematchPrepared = false;
  multiplayerBroadcastState('start');
}

function multiplayerHandleFinish(isAuto) {
  if (!MULTIPLAYER_STATE.isConnected) return;
  if (!multiplayerIsHost()) {
    return;
  }
  multiplayerFinishMatch();
}

function multiplayerHandleReset() {
  if (!MULTIPLAYER_STATE.isConnected) {
    resetStats();
    multiplayerClearBoard();
    return;
  }
  if (multiplayerIsHost()) {
    multiplayerStartMatch();
    return;
  }
}
