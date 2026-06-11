/**
 * =============================================================================
 * TPS (Target Possible Sets) Modifier Logic
 * =============================================================================
 *
 * When the user sets "Target Possible Sets: X" in Advanced settings (X > 0),
 * board generation and card replenishment are steered so that the number of
 * possible sets on the 12-card board stays close to X. All of this runs in
 * game state only; the UI just displays the final board.
 *
 * -----------------------------------------------------------------------------
 * 1. GREEDY PENDULUM BALANCING (balanceBoardTowardTarget / runPendulumBalancing)
 * -----------------------------------------------------------------------------
 * Used when a full 12-card board is created: game start or any Shuffle.
 * Also used by training-mode.js to generate boards with exactly 1 set.
 *
 * - Start with 12 random cards from the deck.
 * - Loop up to 50 times. Each iteration proposes a single board<->deck swap:
 *   - If S < X (Build): scan board pairs in random order until one is found
 *     whose complementary card is still in the deck (no iteration is wasted
 *     when the first random pair has no complement). The complement replaces
 *     the position participating in the fewest current sets. If no pair has
 *     a complement in the deck, propose a fully random swap instead.
 *   - If S > X (Destroy): pick a random set on the board, swap a random card
 *     of that set with a random card from the deck.
 * - The swap is then evaluated greedily: if it increased |S - X| it is
 *   reverted, otherwise it is kept. |S - X| therefore never increases, so
 *   the final board is always the best board seen — no rollback needed.
 * - Returns the number of iterations used (MAX_ITER if X was never reached).
 *
 * -----------------------------------------------------------------------------
 * 2. TARGETED REPLENISHMENT (pickTargetedReplenishmentThree)
 * -----------------------------------------------------------------------------
 * Used after the player collects a set: 3 cards are removed and 3 new ones
 * must be drawn. All C(deck, 3) candidate triples are evaluated exhaustively;
 * a uniformly random triple yielding exactly X sets is returned, or, when no
 * exact triple exists (e.g. the 9 remaining cards already contain more than
 * X sets — a hard floor no triple can lower), a random triple among those
 * closest to X.
 *
 * The exhaustive scan is cheap because set positions don't matter, only the
 * card multiset, and each triple's set count decomposes into independent
 * precomputed parts:
 *   total = S_base                 sets fully inside the 9 kept cards
 *         + s1[a] + s1[b] + s1[c]  kept pairs completed by one new card
 *         + s2[ab] + s2[ac] + s2[bc]  new pairs completed by one kept card
 *         + s3                     1 if the three new cards form a set
 * so the inner loop is pure table lookups (~50k triples worst case, < 5 ms).
 *
 * Returns { threeCards, iterations, perfect, matches, diff }:
 *   - iterations: total candidate triples evaluated,
 *   - matches: how many triples tied for the returned quality,
 *   - diff: |S_total - X| of the result (0 when perfect).
 * The random pick among equal candidates is reservoir sampling driven by
 * tpsRandom(), so synchronized-seed games stay deterministic.
 *
 * The caller (game-logic.js) then removes those 3 cards from the deck and
 * assigns them to the empty slots. If deck has fewer than 3 cards, TPS is
 * skipped and normal pop logic is used.
 *
 * -----------------------------------------------------------------------------
 * 3. HELPERS
 * -----------------------------------------------------------------------------
 * - removeCardsFromDeck(threeCards): removes the given card objects from the
 *   global deck (by value match), so the deck stays consistent.
 *
 * -----------------------------------------------------------------------------
 * Dependencies
 * -----------------------------------------------------------------------------
 * - Globals: config (config.targetPossibleSets), board, deck, gameSeededRng (state.js).
 * - set-math.js: getComplementaryCard, findCardInDeck, getPossibleSetsIndices,
 *   getPossibleSetsIndicesForBoard, getSetCountForCardArray.
 */

function tpsRandom() {
  return (config && config.synchronizedSeed && gameSeededRng ? gameSeededRng : Math.random)();
}

function tpsCardKey(card) {
  return card.c + ',' + card.s + ',' + card.f + ',' + card.n;
}

function pickTargetedReplenishmentThree(emptySlots) {
  const X = config.targetPossibleSets;
  if (!X || deck.length < 3) return null;

  const kept = [];
  for (let pos = 0; pos < board.length; pos++) {
    if (!emptySlots.includes(pos) && board[pos]) kept.push(board[pos]);
  }
  // Sets fully inside the kept cards — identical for every candidate triple,
  // and a hard floor: if sBase > X, no exact match exists.
  const sBase = getSetCountForCardArray(kept);

  // For each card value: how many kept pairs it would complete into a set.
  const pairCompCount = new Map();
  for (let i = 0; i < kept.length; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      const key = tpsCardKey(getComplementaryCard(kept[i], kept[j]));
      pairCompCount.set(key, (pairCompCount.get(key) || 0) + 1);
    }
  }
  const keptKeys = new Set(kept.map(tpsCardKey));

  const n = deck.length;
  const keys = new Array(n);
  const s1 = new Array(n);
  for (let i = 0; i < n; i++) {
    keys[i] = tpsCardKey(deck[i]);
    s1[i] = pairCompCount.get(keys[i]) || 0;
  }
  // For each deck pair (a, b): key of its complement, and whether that
  // complement sits among the kept cards (s2).
  const compKey = new Array(n);
  const s2 = new Array(n);
  for (let a = 0; a < n; a++) {
    compKey[a] = new Array(n);
    s2[a] = new Uint8Array(n);
    for (let b = a + 1; b < n; b++) {
      const key = tpsCardKey(getComplementaryCard(deck[a], deck[b]));
      compKey[a][b] = key;
      s2[a][b] = keptKeys.has(key) ? 1 : 0;
    }
  }

  let evaluated = 0;
  let perfectPick = null, perfectCount = 0;
  let bestPick = null, bestDiff = Infinity, bestCount = 0;
  for (let a = 0; a < n - 2; a++) {
    for (let b = a + 1; b < n - 1; b++) {
      const partialAB = sBase + s1[a] + s1[b] + s2[a][b];
      const compAB = compKey[a][b];
      for (let c = b + 1; c < n; c++) {
        const total = partialAB + s1[c] + s2[a][c] + s2[b][c] + (compAB === keys[c] ? 1 : 0);
        evaluated++;
        const diff = total >= X ? total - X : X - total;
        if (diff === 0) {
          perfectCount++;
          if (tpsRandom() * perfectCount < 1) perfectPick = [a, b, c];
        } else if (perfectCount === 0) {
          if (diff < bestDiff) {
            bestDiff = diff;
            bestCount = 1;
            bestPick = [a, b, c];
          } else if (diff === bestDiff) {
            bestCount++;
            if (tpsRandom() * bestCount < 1) bestPick = [a, b, c];
          }
        }
      }
    }
  }

  if (perfectPick) {
    return {
      threeCards: perfectPick.map(i => deck[i]),
      iterations: evaluated,
      perfect: true,
      matches: perfectCount,
      diff: 0
    };
  }
  return {
    threeCards: bestPick.map(i => deck[i]),
    iterations: evaluated,
    perfect: false,
    matches: bestCount,
    diff: bestDiff
  };
}

function removeCardsFromDeck(threeCards) {
  for (const card of threeCards) {
    const idx = findCardInDeck(deck, card);
    if (idx !== -1) deck.splice(idx, 1);
  }
}

function balanceBoardTowardTarget(boardArr, deckArr, X, rng) {
  if (!X || X <= 0 || deckArr.length === 0) return 0;
  const positions = [];
  for (let i = 0; i < boardArr.length; i++) {
    if (boardArr[i]) positions.push(i);
  }
  if (positions.length < 3) return 0;

  const MAX_ITER = 50;
  let sets = getPossibleSetsIndicesForBoard(boardArr);
  let diff = Math.abs(sets.length - X);
  let iter = 0;
  while (iter < MAX_ITER && diff !== 0) {
    iter++;
    let k = -1;
    let deckIdx = -1;
    if (sets.length < X) {
      // Build: scan board pairs in random order for one whose complement is
      // still in the deck, so the iteration is never wasted on a dead pair.
      const pairs = [];
      for (let a = 0; a < positions.length; a++) {
        for (let b = a + 1; b < positions.length; b++) {
          pairs.push([positions[a], positions[b]]);
        }
      }
      for (let p = pairs.length - 1; p > 0; p--) {
        const q = Math.floor(rng() * (p + 1));
        [pairs[p], pairs[q]] = [pairs[q], pairs[p]];
      }
      for (const [i, j] of pairs) {
        const needed = getComplementaryCard(boardArr[i], boardArr[j]);
        const idx = findCardInDeck(deckArr, needed);
        if (idx === -1) continue;
        deckIdx = idx;
        // Replace the position participating in the fewest current sets,
        // to avoid breaking sets we already have.
        const candidates = positions.filter(pos => pos !== i && pos !== j);
        const setCountByPos = {};
        candidates.forEach(pos => { setCountByPos[pos] = 0; });
        sets.forEach(([a, b, c]) => {
          if (setCountByPos[a] !== undefined) setCountByPos[a]++;
          if (setCountByPos[b] !== undefined) setCountByPos[b]++;
          if (setCountByPos[c] !== undefined) setCountByPos[c]++;
        });
        const minCount = Math.min(...candidates.map(pos => setCountByPos[pos]));
        const bestK = candidates.filter(pos => setCountByPos[pos] === minCount);
        k = bestK[Math.floor(rng() * bestK.length)];
        break;
      }
    } else if (sets.length > 0) {
      // Destroy: swap a random card of a random set with a random deck card.
      const oneSet = sets[Math.floor(rng() * sets.length)];
      k = oneSet[Math.floor(rng() * 3)];
      deckIdx = Math.floor(rng() * deckArr.length);
    }
    if (k === -1 || deckIdx === -1) {
      // No guided move available — propose a fully random swap.
      k = positions[Math.floor(rng() * positions.length)];
      deckIdx = Math.floor(rng() * deckArr.length);
    }

    const oldCard = boardArr[k];
    boardArr[k] = deckArr[deckIdx];
    deckArr[deckIdx] = oldCard;
    const newSets = getPossibleSetsIndicesForBoard(boardArr);
    const newDiff = Math.abs(newSets.length - X);
    if (newDiff > diff) {
      deckArr[deckIdx] = boardArr[k];
      boardArr[k] = oldCard;
    } else {
      sets = newSets;
      diff = newDiff;
    }
  }
  return Math.max(iter, 1);
}

function runPendulumBalancing() {
  return balanceBoardTowardTarget(board, deck, config.targetPossibleSets, tpsRandom);
}
