function getPossibleSetsIndicesForBoard(boardArr) {
  const out = [];
  for (let i = 0; i < boardArr.length; i++) {
    for (let j = i + 1; j < boardArr.length; j++) {
      for (let k = j + 1; k < boardArr.length; k++) {
        if (boardArr[i] && boardArr[j] && boardArr[k] && validateSet([boardArr[i], boardArr[j], boardArr[k]])) {
          out.push([i, j, k]);
        }
      }
    }
  }
  return out;
}

function getPossibleSetsIndices() {
  return getPossibleSetsIndicesForBoard(board);
}

function getSetCountForCardArray(cardArray) {
  return getPossibleSetsIndicesForBoard(cardArray).length;
}

function analyzePossibleSets() {
  const stats = { total: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  getPossibleSetsIndicesForBoard(board).forEach(([i, j]) => {
    // In a valid set each property is either equal on all three cards or
    // different on all three, so comparing two cards is enough.
    let diffCount = 0;
    ['c', 's', 'f', 'n'].forEach(p => {
      if (board[i][p] !== board[j][p]) diffCount++;
    });
    stats.total++;
    stats[diffCount]++;
  });
  return stats;
}

function getComplementaryCard(cardA, cardB) {
  const result = {};
  ['c', 's', 'f', 'n'].forEach(p => {
    result[p] = (3 - ((cardA[p] + cardB[p]) % 3)) % 3;
  });
  return result;
}

function findCardInDeck(deckArr, card) {
  for (let idx = 0; idx < deckArr.length; idx++) {
    if (deckArr[idx].c === card.c && deckArr[idx].s === card.s && deckArr[idx].f === card.f && deckArr[idx].n === card.n) {
      return idx;
    }
  }
  return -1;
}
