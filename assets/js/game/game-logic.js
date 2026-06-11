/**
 * Game logic: deck creation, UI updates, input handlers, game lifecycle.
 * Depends on: config, board, deck, etc. (state), set-math.js, tps-logic.js,
 * graphics-rendering (updateSlot), utilities (mulberry32), constants (GAME_CONFIG, STORAGE_KEYS).
 */

function getSeedForFixed() {
  const now = new Date();
  const seedStr = `${now.getFullYear()}${now.getMonth()}${now.getDate()}${now.getHours()}${now.getMinutes()}`;
  return parseInt(seedStr, 10);
}

function createDeck(rng) {
  const d = [];
  const fillValues = isJuniorModeActive() ? [2] : [0, 1, 2];
  for (let c = 0; c < 3; c++) {
    for (let s = 0; s < 3; s++) {
      for (let f = 0; f < fillValues.length; f++) {
        for (let n = 0; n < 3; n++) {
          d.push({ c, s, f: fillValues[f], n });
        }
      }
    }
  }
  return shuffleInPlace(d, rng);
}

function renderDebugTPSInfo(iters, label) {
  const el = document.getElementById('debug-tps-iters');
  if (!el) return;
  if (iters == null || iters === undefined) {
    el.textContent = label ? label : 'disabled';
    return;
  }
  el.textContent = label ? iters + ' iter (' + label + ')' : iters + ' iter';
}

function setDebugTPSIters(iters, label) {
  lastDebugTPSIters = (iters == null || iters === undefined) ? null : iters;
  lastDebugTPSLabel = label ? label : null;
  if (!config.debugMode) return;
  renderDebugTPSInfo(iters, label);
}

function restoreDebugTPSInfo() {
  if (!config.debugMode) return;
  renderDebugTPSInfo(lastDebugTPSIters, lastDebugTPSLabel);
}

function clearDebugTPSUI() {
  renderDebugTPSInfo(null, null);
}

function runDebugFPSLoop() {
  const container = document.getElementById('debug-edge-container');
  const el = document.getElementById('debug-delay');
  if (!config.debugMode) {
    if (container) container.style.display = 'none';
    lastDebugFrameTime = null;
    currentPeakDelayMs = 0;
    requestAnimationFrame(runDebugFPSLoop);
    return;
  }
  if (container) container.style.display = 'flex';
  const now = performance.now();
  if (lastDebugFrameTime != null) {
    const delayMs = now - lastDebugFrameTime; // delay (ms) = 1000 / fps
    currentPeakDelayMs = Math.max(currentPeakDelayMs, delayMs);
    if (now - lastDebugOutputTime >= 100) {
      el.textContent = currentPeakDelayMs.toFixed(1);
      lastDebugOutputTime = now;
      currentPeakDelayMs = delayMs;
    }
  }
  lastDebugFrameTime = now;
  requestAnimationFrame(runDebugFPSLoop);
}

function applyDebugHighlight() {
  const boardEl = document.getElementById('board');
  if (!boardEl) return;
  const shouldHighlight = config.debugMode && Array.isArray(debugHighlightSet) && debugHighlightSet.length > 0;
  for (let i = 0; i < 12; i++) {
    const slot = boardEl.children[i];
    const card = slot?.querySelector('.card');
    if (card) {
      const inSet = shouldHighlight && debugHighlightSet.includes(i);
      card.classList.toggle('debug-set-highlight', !!inSet);
    }
  }
}

function updateLiveSPM() {
  if (isGameOver || !isSPMEnabled()) return;

  const spmElement = document.getElementById('live-spm');
  const totalElapsedMs = Date.now() - startTime;

  if (totalElapsedMs > 500) {
    const spm = (collectedSets / (totalElapsedMs / 60000)).toFixed(1);
    spmElement.innerText = spm;
    spmElement.style.color = getSPMColor(parseFloat(spm));
  } else {
    spmElement.innerText = "0.0";
    spmElement.style.color = getSPMColor(0);
  }
}

function markModUsed(key) {
  if (usedGameModifiers[key] !== undefined) {
    usedGameModifiers[key] = true;
  }
}

function updateUI() {
  const stats = analyzePossibleSets();
  if (!isGameOver && !isAnimating) possibleHistory.push(stats.total);

  gameModifiers.SP = config.showPossible;
  gameModifiers.AS = config.autoShuffle;
  gameModifiers.PBS = isPreventBadShuffleEnabled();
  gameModifiers.A3RD = config.autoSelectThird;
  gameModifiers.SS = config.synchronizedSeed;
  gameModifiers.DM = config.debugMode;
  gameModifiers.TPS = !!(config.targetPossibleSets && config.targetPossibleSets > 0);
  gameModifiers.TM = config.gameMode === GAME_MODES.TRAINING;
  gameModifiers.JN = config.gameMode === GAME_MODES.JUNIOR;
  gameModifiers.MP = config.gameMode === GAME_MODES.MULTIPLAYER;

  const deckLabel = document.getElementById('deck-label');
  if (isTrainingModeActive()) {
    if (deckLabel) deckLabel.innerText = 'Boards';
    document.getElementById('deck-count').innerText = trainingGetRemainingBoardsCount();
  } else {
    if (deckLabel) deckLabel.innerText = 'Cards';
    document.getElementById('deck-count').innerText = deck.length;
  }
  document.getElementById('current-score').innerText = collectedSets;
  document.getElementById('possible-count').innerText = stats.total;
  document.getElementById('possible-label').style.opacity = config.showPossible ? '1' : '0';
  const detContainer = document.getElementById('detailed-possible');
  detContainer.style.opacity = (config.showPossible && config.debugMode) ? '1' : '0';
  document.getElementById('det-4').innerText = stats[4];
  document.getElementById('det-3').innerText = stats[3];
  document.getElementById('det-2').innerText = stats[2];
  document.getElementById('det-1').innerText = stats[1];

  if (config.debugMode && !isGameOver && !isAnimating) {
    const sets = getPossibleSetsIndices();
    debugHighlightSet = sets.length > 0 ? sets[Math.floor(Math.random() * sets.length)] : null;
  } else {
    debugHighlightSet = null;
  }

  if (
    !isTrainingModeActive() &&
    !isJuniorModeActive() &&
    stats.total === 0 &&
    config.autoShuffle &&
    deck.length > 0 &&
    !isAnimating &&
    !isGameOver &&
    !(isMultiplayerModeActive() && typeof multiplayerIsClient === 'function' && multiplayerIsClient())
  ) {
    if (config.debugMode) showToast('Auto-shuffle');
    const fromSet = autoShuffleFromSet;
    autoShuffleFromSet = false;
    if (nextAutoShuffleSkipsAnimOut) {
      nextAutoShuffleSkipsAnimOut = false;
      handleShuffleDeck(true, false, true);
    } else {
      handleShuffleDeck(true, fromSet, false);
    }
    return;
  }

  if (
    isJuniorModeActive() &&
    stats.total === 0 &&
    !isAnimating &&
    !isGameOver
  ) {
    setTimeout(() => handleGameFinish(true), 0);
    return;
  }
  nextAutoShuffleSkipsAnimOut = false;

  updateLiveSPM();
  applyDebugHighlight();
}

function showToast(text) {
  const toast = document.createElement('div');
  toast.className = 'bad-shuffle-toast';
  toast.innerText = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), GAME_CONFIG.TOAST_DURATION);
}

async function applySetToBoard(sIdx) {
  sIdx.forEach(i => document.getElementById('board').children[i].querySelector('.card')?.classList.add('anim-out'));
  await new Promise(r => setTimeout(r, GAME_CONFIG.ANIMATION_DURATION));
  if (config.targetPossibleSets && deck.length >= 3) {
    const result = pickTargetedReplenishmentThree(sIdx);
    if (result && result.threeCards) {
      removeCardsFromDeck(result.threeCards);
      sIdx.forEach((slot, i) => {
        board[slot] = result.threeCards[i];
        updateSlot(slot, true);
      });
      if (config.debugMode) {
        const label = result.perfect
          ? 'replenish perfect: ' + result.matches + '/' + result.iterations + ' triples'
          : 'replenish closest: ±' + result.diff + ' (' + result.matches + ' options)';
        setDebugTPSIters(null, label);
      }
    } else {
      setDebugTPSIters(null);
      sIdx.forEach(i => {
        board[i] = deck.length > 0 ? deck.pop() : null;
        updateSlot(i, true);
      });
    }
  } else {
    setDebugTPSIters(null);
    sIdx.forEach(i => {
      board[i] = deck.length > 0 ? deck.pop() : null;
      updateSlot(i, true);
    });
  }

  selected = [];
  isAnimating = false;

  autoShuffleFromSet = true;

  updateUI();
}

async function handleCardSelect(idx, el) {
  if (isAnimating || isGameOver) return;
  if (isMultiplayerModeActive() && typeof multiplayerIsClient === 'function' && multiplayerIsClient()) {
    if (typeof multiplayerHandleClientSelection === 'function') {
      await multiplayerHandleClientSelection(idx, el);
    }
    return;
  }

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
    const sIdx = [...selected];
    const cards = sIdx.map(i => board[i]);
    const isCorrect = validateSet(cards);
    if (isCorrect) {
      if (isMultiplayerModeActive() && typeof multiplayerHandleHostSetFound === 'function') {
        await multiplayerHandleHostSetFound(sIdx, currentPossible);
        return;
      }
      collectedSets++;
      const now = Date.now();
      const findTime = now - lastSetFoundTime;
      setTimestamps.push({ time: now, findTime: findTime, possibleAtStart: currentPossible });
      trainingRecordSetIfNeeded(findTime);
      lastSetFoundTime = now;

      if (isTrainingModeActive()) {
        selected = [];
        isAnimating = false;
        trainingHandleCorrectSet(findTime);
        return;
      }
      await applySetToBoard(sIdx);
      if (collectedSets >= GAME_CONFIG.SETS_TO_WIN && analyzePossibleSets().total === 0 && !isGameOver) {
        setTimeout(() => handleGameFinish(true), 300);
      }
    } else {
      mistakes++;
      await new Promise(r => setTimeout(r, GAME_CONFIG.MISTAKE_DELAY));
      sIdx.forEach(i => document.getElementById('board').children[i].querySelector('.card')?.classList.remove('selected'));
      selected = [];
      isAnimating = false;
    }
  }
}

function getShuffleDurations() {
  const mod = 1 / parseFloat(config.speedMod || '1');
  return {
    fadeOutMs: Math.round(GAME_CONFIG.CARD_FADE_DURATION * mod),
    animInMs: Math.round(GAME_CONFIG.CARD_ANIM_IN_DURATION * mod)
  };
}

function applyBadShuffleButtonLock() {
  const btn = document.getElementById('shuffle-btn');
  if (!btn) return;
  isBtnLocked = true;
  btn.classList.add('locked');
  btn.innerText = 'nuh-uh!';
  setTimeout(() => {
    btn.classList.remove('locked');
    btn.innerText = 'Shuffle';
    isBtnLocked = false;
  }, GAME_CONFIG.LOCK_DURATION);
}


function handleShuffleClick() {
  const now = Date.now();
  if (now < shuffleBtnCooldownUntil) return;
  if (isAnimating || isGameOver || isBtnLocked) return;
  if (isTrainingModeActive()) return;

  if (isMultiplayerModeActive() && typeof multiplayerIsClient === 'function' && multiplayerIsClient()) {
    if (typeof multiplayerRequestShuffle === 'function') {
      multiplayerRequestShuffle();
    }
    return;
  }

  const possibleCount = analyzePossibleSets().total;
  if (possibleCount > 0) {
    badShuffles++;
    if (isMultiplayerModeActive() && typeof multiplayerApplyBadShufflePenalty === 'function') {
      multiplayerApplyBadShufflePenalty(multiplayerGetNickname());
    }
    updateUI();
    if (!config.showPossible && !config.autoShuffle) showToast('bad shuffle!');
    const shouldBlockBadShuffle = isPreventBadShuffleEnabled();
    if (shouldBlockBadShuffle) {
      applyBadShuffleButtonLock();
      if (isMultiplayerModeActive() && typeof multiplayerBroadcastState === 'function' && multiplayerIsHost()) {
        multiplayerBroadcastState('shuffle_penalty');
      }
      return;
    }
  }

  if (possibleCount === 0 && isMultiplayerModeActive() && typeof multiplayerIsHost === 'function' && multiplayerIsHost() && typeof multiplayerAwardNoSetShufflePoint === 'function') {
    multiplayerAwardNoSetShufflePoint(multiplayerGetNickname());
  }

  const { fadeOutMs, animInMs } = getShuffleDurations();
  shuffleBtnCooldownUntil = now + fadeOutMs + animInMs;
  handleShuffleDeck(false);
}

function shuffleExistingCards() {
  if (isAnimating || isGameOver) return;
  if (isTrainingModeActive()) return;
  if (isMultiplayerModeActive()) {
    showToast('Shuffle board is disabled in multiplayer');
    return;
  }
  setDebugTPSIters(null);
  isAnimating = true;
  shuffleExCount++;
  const shuffleRng = gameSeededRng || Math.random;
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(shuffleRng() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }
  selected = [];
  const slots = document.getElementById('board').children;
  for (let i = 0; i < slots.length; i++) {
    updateSlot(i, false);
    const cardEl = slots[i].querySelector('.card');
    if (cardEl) {
      cardEl.classList.add('jumping');
      cardEl.addEventListener('animationend', () => { cardEl.classList.remove('jumping'); }, { once: true });
    }
  }
  setTimeout(() => {
    isAnimating = false;
    updateUI();
    if (isMultiplayerModeActive() && typeof multiplayerBroadcastState === 'function' && multiplayerIsHost()) {
      multiplayerBroadcastState('shuffle_existing');
    }
  }, GAME_CONFIG.SHUFFLE_DELAY);
}

function reshuffleBoardIntoDeck() {
  const currentCards = board.filter(c => c !== null);
  deck.push(...currentCards);
  shuffleInPlace(deck, gameSeededRng);
  board = deck.splice(0, 12);
  if (config.targetPossibleSets) {
    const iters = runPendulumBalancing();
    if (iters > 0) setDebugTPSIters(iters);
  }
  selected = [];
  for (let i = 0; i < 12; i++) updateSlot(i, true);
}

function broadcastShuffleIfHost(reason) {
  if (isMultiplayerModeActive() && typeof multiplayerBroadcastState === 'function' && multiplayerIsHost()) {
    multiplayerBroadcastState(reason);
  }
}

function handleShuffleDeck(isAuto = false, fromSet = false, skipAnimOut = false) {
  if (isAnimating) return;
  if (isTrainingModeActive()) return;
  if (!isAuto && isMultiplayerModeActive() && typeof multiplayerIsClient === 'function' && multiplayerIsClient()) {
    showToast('Only host can shuffle');
    return;
  }
  setDebugTPSIters(null);

  if (isAuto && skipAnimOut) {
    isAnimating = true;
    const { animInMs } = getShuffleDurations();
    reshuffleBoardIntoDeck();
    setTimeout(() => {
      isAnimating = false;
      nextAutoShuffleSkipsAnimOut = true;
      updateUI();
      broadcastShuffleIfHost('shuffle_auto');
    }, animInMs);
    return;
  }

  if (isAuto && !fromSet) {
    reshuffleBoardIntoDeck();
    updateUI();
    broadcastShuffleIfHost('shuffle_auto');
    return;
  }

  isAnimating = true;
  const { fadeOutMs } = getShuffleDurations();

  document.querySelectorAll('.card')
    .forEach(c => c.classList.add('anim-out'));

  setTimeout(() => {
    reshuffleBoardIntoDeck();
    if (isAuto) nextAutoShuffleSkipsAnimOut = true;
    isAnimating = false;
    updateUI();
    broadcastShuffleIfHost(isAuto ? 'shuffle_auto' : 'shuffle_manual');
  }, fadeOutMs);
}

function saveRecord(extra) {
  if (collectedSets < config.minSetsToRecord) return;
  const records = Storage.getJSON(STORAGE_KEYS.RECORDS, []);
  const rec = {
    id: Date.now(),
    sets: collectedSets,
    time: extra.elapsedMs,
    badShuffles: badShuffles,
    date: extra.dateStr,
    isSeed: config.synchronizedSeed,
    timestamps: setTimestamps,
    modifiers: { ...gameModifiers },
    extra: extra
  };
  records.push(rec);
  Storage.setJSON(STORAGE_KEYS.RECORDS, records);
}

function initNewDeckAndBoard() {
  setDebugTPSIters(null);
  if (isMultiplayerModeActive() && typeof multiplayerShouldUseRemoteState === 'function' && multiplayerShouldUseRemoteState()) {
    return;
  }
  if (isTrainingModeActive()) {
    trainingInitNewBoard();
    return;
  }
  if (config.synchronizedSeed) {
    gameSeededRng = mulberry32(getSeedForFixed());
  } else {
    gameSeededRng = null;
  }
  deck = createDeck(gameSeededRng);
  board = deck.splice(0, 12);
  if (config.targetPossibleSets) {
    const iters = runPendulumBalancing();
    if (iters > 0) setDebugTPSIters(iters);
  }
  selected = [];
  for (let i = 0; i < 12; i++) updateSlot(i, false);
}

function syncGameModifiers() {
  const currentMods = {
    SP: config.showPossible,
    AS: config.autoShuffle,
    PBS: isPreventBadShuffleEnabled(),
    A3RD: config.autoSelectThird,
    SS: config.synchronizedSeed,
    DM: config.debugMode,
    TPS: !!(config.targetPossibleSets && config.targetPossibleSets > 0),
    TM: config.gameMode === GAME_MODES.TRAINING,
    JN: config.gameMode === GAME_MODES.JUNIOR,
    MP: config.gameMode === GAME_MODES.MULTIPLAYER
  };
  startGameModifiers = { ...currentMods };
  usedGameModifiers = { ...currentMods };
}

function resetStats() {
  collectedSets = 0; badShuffles = 0; mistakes = 0; shuffleExCount = 0;
  startTime = Date.now();
  lastSetFoundTime = startTime;
  setTimestamps = [];
  possibleHistory = [];
  trainingResetSessionRecords();

  syncGameModifiers();

  document.getElementById('timer').innerText = config.showTimerMs ? formatTimeTenths(0) : formatTime(0);
  currentExtraStats = null;
}

async function handleGameReset() {
  if (isMultiplayerModeActive() && typeof multiplayerHandleReset === 'function') {
    multiplayerHandleReset();
    return;
  }
  if (isResetting) return;

  const cooldownMs = GAME_CONFIG.MODAL_TRANSITION + GAME_CONFIG.CARD_FADE_DURATION + 10;
  const elapsed = Date.now() - lastFinishTime;

  if (lastFinishTime > 0 && elapsed < cooldownMs) {
    restartPending = true;
    return;
  }

  isResetting = true;
  restartPending = false;

  const modal = document.getElementById('result-modal');
  if (modal.classList.contains('show')) {
    await closeModal('result-modal');
  }
  if (typeof resultOpenedFrom !== 'undefined') resultOpenedFrom = null;
  isGameOver = false;
  resetStats();
  updateUI();

  isResetting = false;
}

function handleGameFinish(isAuto = false) {
  if (isMultiplayerModeActive() && typeof multiplayerHandleFinish === 'function') {
    multiplayerHandleFinish(isAuto);
    return;
  }
  if (isGameOver) return;
  isGameOver = true;
  lastFinishTime = Date.now();
  const elapsedMs = (Date.now() - startTime);
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const platform = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'Mobile' : 'PC';

  const finalModifiers = {};
  Object.keys(startGameModifiers).forEach(key => {
    finalModifiers[key] = startGameModifiers[key] || usedGameModifiers[key];
  });

  currentExtraStats = {
    elapsedMs, dateStr, platform, isAutoFinish: isAuto,
    mistakes, shuffleExCount, badShuffles,
    gameMode: config.gameMode,
    possibleHistory: [...possibleHistory],
    timestamps: [...setTimestamps],
    modifiers: finalModifiers
  };

  lastFinishResult = {
    sets: collectedSets,
    time: elapsedMs,
    dateStr,
    isAutoFinish: isAuto,
    badShuffles: badShuffles,
    modifiers: finalModifiers
  };
  trainingFinalizeSessionIfNeeded();
  saveRecord(currentExtraStats);
  displayResults(collectedSets, badShuffles, currentExtraStats);

  if (typeof resetOnlineSubmitForNewFinish === 'function') resetOnlineSubmitForNewFinish();

  openModal('result-modal');
  setTimeout(() => {
    document.querySelectorAll('.card').forEach(c => c.classList.add('anim-out'));
    setTimeout(() => {
      initNewDeckAndBoard();
      setTimeout(() => {
        if (restartPending) handleGameReset();
      }, 50);
    }, GAME_CONFIG.CARD_FADE_DURATION);
  }, GAME_CONFIG.MODAL_TRANSITION);
}

requestAnimationFrame(runDebugFPSLoop);
