function openModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.remove('hide');
  modal.classList.add('show');
}

async function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.add('hide');
  await new Promise(r => setTimeout(r, GAME_CONFIG.MODAL_TRANSITION));
  modal.classList.remove('show', 'hide');
}

const SETTINGS_TABS = ['gamemodes', 'board', 'metrics', 'keybinds', 'online', 'advanced'];
const SETTINGS_TAB_STORAGE_KEY = 'settings_last_tab';
let activeSettingsTab = 'gamemodes';
if (typeof Storage !== 'undefined') {
  const storedTab = Storage.get(SETTINGS_TAB_STORAGE_KEY, activeSettingsTab);
  if (SETTINGS_TABS.includes(storedTab)) activeSettingsTab = storedTab;
}

function getSettingsPanel() {
  return document.getElementById('settings-panel');
}

function getSettingsScroll() {
  return document.querySelector('.settings-scroll');
}

function updateSettingsScrollAlignment() {
  const scrollEl = getSettingsScroll();
  if (!scrollEl) return;
  const isScrollable = scrollEl.scrollHeight > scrollEl.clientHeight + 1;
  scrollEl.classList.toggle('settings-scroll--scrollable', isScrollable);
}

function openSettingsPanel(tabId) {
  const panel = getSettingsPanel();
  if (!panel) return;
  syncSettingsUI();
  panel.classList.remove('hide');
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  setSettingsTab(tabId || activeSettingsTab);
}

async function closeSettingsPanel() {
  const panel = getSettingsPanel();
  if (!panel) return;
  handleSettingsTabExit(activeSettingsTab);
  panel.classList.add('hide');
  await new Promise(r => setTimeout(r, GAME_CONFIG.MODAL_TRANSITION));
  panel.classList.remove('show', 'hide');
  panel.setAttribute('aria-hidden', 'true');
}

function toggleSettingsPanel(show, tabId) {
  if (show) {
    openSettingsPanel(tabId);
  } else {
    closeSettingsPanel();
  }
}

function openSettingsTab(tabId) {
  openSettingsPanel(tabId);
}

function setSettingsTab(tabId) {
  let nextTab = SETTINGS_TABS.includes(tabId) ? tabId : SETTINGS_TABS[0];
  const tabButton = document.querySelector(`.settings-tab[data-tab="${nextTab}"]`);
  if (!tabButton || tabButton.offsetParent === null) nextTab = SETTINGS_TABS[0];

  const previousTab = activeSettingsTab;
  if (previousTab !== nextTab) {
    handleSettingsTabExit(previousTab);
  }
  activeSettingsTab = nextTab;
  if (typeof Storage !== 'undefined') Storage.set(SETTINGS_TAB_STORAGE_KEY, nextTab);
  updateSettingsTabUI(nextTab, previousTab);
  handleSettingsTabEnter(nextTab);
  requestAnimationFrame(updateSettingsScrollAlignment);
}

function updateSettingsTabUI(tabId, previousTab = null) {
  document.querySelectorAll('.settings-tab').forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (isActive && previousTab !== tabId) {
      btn.classList.add('chip-animate');
      btn.addEventListener('animationend', () => { btn.classList.remove('chip-animate'); }, { once: true });
    }
  });
  document.querySelectorAll('[data-settings-panel]').forEach(section => {
    const isActive = section.dataset.settingsPanel === tabId;
    section.hidden = !isActive;
    section.classList.remove('animate-in');
    if (isActive) {
      section.classList.add('animate-in');
      section.addEventListener('animationend', () => { section.classList.remove('animate-in'); }, { once: true });
    }
  });
}

function handleSettingsTabEnter(tabId) {
  if (tabId === 'board') {
    syncSettingsUI();
    refreshBoardAppearancePreviews();
    if (typeof closeBoardColorPicker === 'function') closeBoardColorPicker();
    return;
  }
  if (tabId === 'metrics' || tabId === 'advanced' || tabId === 'gamemodes') {
    syncSettingsUI();
    return;
  }
  if (tabId === 'keybinds') {
    renderKeybindsPanel();
    return;
  }
  if (tabId === 'online') {
    syncOnlineSettingsPanel();
  }
}

window.addEventListener('resize', () => {
  const panel = getSettingsPanel();
  if (panel && panel.classList.contains('show')) updateSettingsScrollAlignment();
});

function handleSettingsTabExit(tabId) {
  if (tabId === 'keybinds') {
    persistKeybindsPanel();
    return;
  }
  if (tabId === 'online') {
    applyOnlineSettingsPanel();
    return;
  }
  if (tabId === 'board') {
    if (typeof closeBoardColorPicker === 'function') closeBoardColorPicker();
  }
}

function syncOnlineSettingsPanel() {
  const nickEl = document.getElementById('online-settings-nickname');
  const filterEl = document.getElementById('online-settings-filter');
  const bestPerPlayerEl = document.getElementById('toggle-online-best-per-player');
  let nick = (typeof config !== 'undefined' && config.onlineNickname != null ? config.onlineNickname : '').trim();
  if (!nick && typeof ensureOnlineNickname === 'function') nick = ensureOnlineNickname();
  if (nickEl) nickEl.value = nick;
  if (filterEl) filterEl.value = typeof config !== 'undefined' && config.onlineShowOnlyNicks != null ? config.onlineShowOnlyNicks : '';
  if (bestPerPlayerEl && typeof getOnlineBestPerPlayer === 'function') bestPerPlayerEl.classList.toggle('active', getOnlineBestPerPlayer());
}

function applyOnlineSettingsPanel() {
  const nickEl = document.getElementById('online-settings-nickname');
  const filterEl = document.getElementById('online-settings-filter');
  if (nickEl && typeof setOnlineNickname === 'function') setOnlineNickname(nickEl.value);
  if (filterEl && typeof setOnlineShowOnlyNicks === 'function') setOnlineShowOnlyNicks(filterEl.value);
  else if (filterEl) Storage.set(STORAGE_KEYS.ONLINE_SHOW_ONLY_NICKS, (filterEl.value || '').trim());
}

function renderKeybindsPanel() {
  const grid = document.getElementById('kb-board-grid');
  if (!grid) return;
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = config.boardOrientation === 'horizontal' ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)';
  grid.classList.toggle('rotated', config.boardOrientation === 'horizontal');

  binds.board.forEach((key, i) => {
    const cell = document.createElement('div');
    cell.className = 'kb-cell';
    cell.id = `kb-slot-${i}`;
    cell.innerText = key === ' ' ? 'SPC' : key.toUpperCase();
    cell.onpointerdown = () => startKeyCapture('board', i);
    grid.appendChild(cell);
  });
  syncKeybindsUI();
}

function persistKeybindsPanel() {
  const key = config.boardOrientation === 'horizontal' ? STORAGE_KEYS.KEYBINDS_HORIZONTAL : STORAGE_KEYS.KEYBINDS;
  Storage.setJSON(key, binds);
}

function toggleSettingsModal(show) {
  toggleSettingsPanel(show);
}

function openAdvancedModal() {
  openSettingsTab('advanced');
}

async function closeAdvancedModal() {
  await closeSettingsPanel();
}

function openGamemodesModal() {
  openSettingsTab('gamemodes');
}

async function closeGamemodesModal() {
  await closeSettingsPanel();
}

function openOnlineSettingsModal() {
  openSettingsTab('online');
}

function toggleOnlineBestPerPlayer() {
  const el = document.getElementById('toggle-online-best-per-player');
  if (!el) return;
  const next = !el.classList.contains('active');
  el.classList.toggle('active', next);
  if (typeof setOnlineBestPerPlayer === 'function') setOnlineBestPerPlayer(next);
  else Storage.set(STORAGE_KEYS.ONLINE_BEST_PER_PLAYER, String(next));
}

async function closeOnlineSettingsModal() {
  applyOnlineSettingsPanel();
  await closeSettingsPanel();
}

function openBoardAppearanceModal() {
  openSettingsTab('board');
}

async function closeBoardAppearanceModal() {
  await closeSettingsPanel();
}

function openMetricsModal() {
  openSettingsTab('metrics');
}

async function closeMetricsModal() {
  await closeSettingsPanel();
}

function handleBoardAppearanceReset() {
  if (!confirm('Reset board appearance to default?')) return;
  if (typeof closeBoardColorPicker === 'function') closeBoardColorPicker();
  config.preset = 'standard';
  config.boardOrientation = 'vertical';
  config.shapeSizeRatio = 0.9;
  config.gameColors = ['#fd0000', '#01a43b', '#0000fe'];
  config.speedMod = '1.0';
  Storage.set(STORAGE_KEYS.PRESET, config.preset);
  Storage.set(STORAGE_KEYS.BOARD_ORIENTATION, config.boardOrientation);
  binds = loadBindsForOrientation(config.boardOrientation);
  Storage.set(STORAGE_KEYS.SHAPE_SIZE_RATIO, '0.9');
  Storage.setJSON(STORAGE_KEYS.GAME_COLORS, config.gameColors);
  Storage.set(STORAGE_KEYS.SPEED_MOD, config.speedMod);
  updateColors();
  syncSettingsUI();
  refreshBoardAppearancePreviews();
  const boardEl = document.getElementById('board');
  if (boardEl) {
boardEl.classList.toggle('rotated', config.boardOrientation === 'horizontal');
  boardEl.style.setProperty('--shape-size-ratio', String(config.shapeSizeRatio));
  }
  transposeBoardLayout();
  for (let i = 0; i < 12; i++) updateSlot(i, false);
}

function handleMetricsReset() {
  config.showPossible = true;
  config.showSPM = false;
  config.showTimer = true;
  config.showTimerMs = false;
  config.showSetsCards = true;
  Storage.set(STORAGE_KEYS.SHOW_POSSIBLE, String(config.showPossible));
  Storage.set(STORAGE_KEYS.SHOW_SPM, String(config.showSPM));
  Storage.set(STORAGE_KEYS.SHOW_TIMER, String(config.showTimer));
  Storage.set(STORAGE_KEYS.SHOW_TIMER_MS, String(config.showTimerMs));
  Storage.set(STORAGE_KEYS.SHOW_SETS_CARDS, String(config.showSetsCards));
  syncSettingsUI();
  updateUI();
}

function handleOnlineReset() {
  if (typeof setOnlineNickname === 'function') setOnlineNickname('');
  else Storage.set(STORAGE_KEYS.ONLINE_NICKNAME, '');
  if (typeof setOnlineShowOnlyNicks === 'function') setOnlineShowOnlyNicks('');
  else Storage.set(STORAGE_KEYS.ONLINE_SHOW_ONLY_NICKS, '');
  if (typeof setOnlineBestPerPlayer === 'function') setOnlineBestPerPlayer(true);
  else Storage.set(STORAGE_KEYS.ONLINE_BEST_PER_PLAYER, 'true');
  syncOnlineSettingsPanel();
}

function handleAdvancedReset() {
  const prevSeed = config.synchronizedSeed;
  config.autoShuffle = true;
  config.preventBadShuffle = false;
  config.synchronizedSeed = false;
  config.autoSelectThird = false;
  config.minSetsToRecord = 23;
  config.targetPossibleSets = 0;
  config.debugMode = false;
  Storage.set(STORAGE_KEYS.AUTO_SHUFFLE, String(config.autoShuffle));
  Storage.set(STORAGE_KEYS.PREVENT_BAD_SHUFFLE, String(config.preventBadShuffle));
  Storage.set(STORAGE_KEYS.SYNCHRONIZED_SEED, String(config.synchronizedSeed));
  Storage.set(STORAGE_KEYS.AUTO_SELECT_THIRD, String(config.autoSelectThird));
  Storage.set(STORAGE_KEYS.MIN_SETS, config.minSetsToRecord);
  Storage.set(STORAGE_KEYS.TARGET_POSSIBLE_SETS, config.targetPossibleSets);
  Storage.set(STORAGE_KEYS.DEBUG_MODE, String(config.debugMode));
  if (prevSeed !== config.synchronizedSeed) {
    initNewDeckAndBoard();
    resetStats();
  }
  clearDebugTPSUI();
  syncSettingsUI();
  updateUI();
}

function refreshBoardAppearancePreviews() {
  const wrap = document.getElementById('board-preview-wrap');
  if (!wrap) return;
  wrap.classList.toggle('rotated', config.boardOrientation === 'horizontal');
  const colors = getGameColors();
  for (let i = 0; i < 3; i++) {
    const cardEl = document.getElementById(`board-preview-card-${i}`);
    const swatchEl = document.getElementById(`board-preview-swatch-${i}`);
    if (cardEl) {
      const card = { c: i, s: i, f: 1, n: 0 };
      cardEl.innerHTML = getShapeSVG(card);
    }
    if (swatchEl) swatchEl.style.backgroundColor = colors[i];
  }
}

function updateGameColor(index, hex) {
  if (index < 0 || index > 2) return;
  config.gameColors[index] = hex;
  Storage.setJSON(STORAGE_KEYS.GAME_COLORS, config.gameColors);
  updateColors();
  refreshBoardAppearancePreviews();
}

function appendRecordSection(container, title, headerClassName, records) {
  if (records.length === 0) return;
  const header = document.createElement('div');
  header.className = headerClassName;
  header.innerText = title;
  container.appendChild(header);

  records.forEach(r => {
    const item = document.createElement('div');
    item.className = 'record-item';
    item.innerHTML = `
      <div class="record-info">
        <div class="record-val">${escapeHtml(String(r.sets))} Sets ${r.isSeed ? '🧬' : ''}</div>
        <div class="text-[10px] uppercase opacity-70">${escapeHtml(String(r.date || ''))}</div>
      </div>
      <div class="record-info text-right flex-grow flex justify-end items-center mr-2">
        <div class="text-white font-mono text-lg leading-none">${formatTime(r.time, true)}</div>
      </div>
      <div class="btn-del" onpointerdown="handleRecordDelete(event, ${Number(r.id) || 0})">${SVG_ICONS.DELETE}</div>
    `;
    bindRecordItemTap(item, r);
    container.appendChild(item);
  });
}

function openRecordsModal() {
  const records = Storage.getJSON(STORAGE_KEYS.RECORDS, []);

  const finishes = records.filter(r => r.extra?.isAutoFinish === true);
  const others = records.filter(r => r.extra?.isAutoFinish !== true);

  finishes.sort((a, b) => a.time - b.time);
  others.sort((a, b) => b.sets - a.sets || a.time - b.time);

  const container = document.getElementById('records-container');
  container.innerHTML = '';

  if (finishes.length === 0 && others.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-500 mt-10">No records yet</p>';
    openModal('records-modal');
    return;
  }

  appendRecordSection(container, 'Finishes', 'text-pink-400 font-black uppercase text-sm mb-2 mt-4 first:mt-0 tracking-wider', finishes);
  appendRecordSection(container, 'Other Records', 'text-gray-400 font-black uppercase text-sm mb-2 mt-6 tracking-wider', others);

  openModal('records-modal');
}

async function closeRecordsModal() {
  await closeModal('records-modal');
}

function openOnlineRecordsModal() {
  openModal('online-records-modal');
  renderOnlineRecords(document.getElementById('online-records-container'));
}

function handleRecordsButtonClick() {
  if (typeof resultOpenedFrom !== 'undefined' && resultOpenedFrom === 'online') {
    openModal('records-modal');
    openOnlineRecordsModal();
    return;
  }
  if (typeof resultOpenedFrom !== 'undefined' && resultOpenedFrom === 'local') {
    openRecordsModal();
    return;
  }
  openRecordsModal();
}

async function closeOnlineRecordsModal() {
  await closeModal('online-records-modal');
}

function openKeybindsModal() {
  openSettingsTab('keybinds');
}

async function closeKeybindsModal() {
  await closeSettingsPanel();
}

function openExtraStatsModal() {
  const s = currentExtraStats;
  const container = document.getElementById('extra-stats-content');

  openModal('extra-stats-modal');

  const avgPossible = (s.possibleHistory.reduce((a,b) => a+b, 0) / Math.max(1, s.possibleHistory.length)).toFixed(1);
  const diff1 = s.timestamps.filter(t => t.possibleAtStart === 1);
  const diff2 = s.timestamps.filter(t => t.possibleAtStart === 2);
  const diff3 = s.timestamps.filter(t => t.possibleAtStart >= 3);
  const getAvg = (arr) => arr.length ? formatTime(arr.reduce((a,b) => a+b.findTime, 0) / arr.length, true) : '--';
  const badShufflesVal = Number(s.badShuffles) || 0;

  container.innerHTML = `
    <div class="extra-stat-row"><span class="extra-stat-label">Avg sets on board</span><span class="extra-stat-value">${avgPossible}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Wrong selections</span><span class="extra-stat-value">${s.mistakes}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Bad Shuffles</span><span class="extra-stat-value">${badShufflesVal}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Avg find (1 set)</span><span class="extra-stat-value">${getAvg(diff1)}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Avg find (2 sets)</span><span class="extra-stat-value">${getAvg(diff2)}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Avg find (3+ sets)</span><span class="extra-stat-value">${getAvg(diff3)}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Shuffle Board uses</span><span class="extra-stat-value">${s.shuffleExCount}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Auto finish</span><span class="extra-stat-value">${s.isAutoFinish ? 'YES' : 'NO'}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Platform</span><span class="extra-stat-value">${s.platform}</span></div>
  `;
}

async function closeExtraStatsModal() {
  await closeModal('extra-stats-modal');
}
