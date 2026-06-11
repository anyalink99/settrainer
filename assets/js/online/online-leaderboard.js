function randomInt(maxExclusive) {
  maxExclusive = Math.max(1, maxExclusive | 0);
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] % maxExclusive;
    }
  } catch (_) {}
  return Math.floor(Math.random() * maxExclusive);
}

function generateDefaultOnlineNickname() {
  // One-time default nickname when user hasn't set one yet.
  // Keep these human-friendly (no numbers by default).
  var fixed = [
    'Huge Set fan',
    'Set enthusiast',
    'Set enjoyer',
    'Set aficionado',
    'Set connoisseur',
    'Set appreciator',
    'Set addict',
    'Set hunter',
    'Set seeker',
    'Set solver',
    'Set speedrunner',
    'Set grinder',
    'Set enjoyer supreme',
    'Set pattern lover',
    'Set vibes only',
    'Set wizard',
    'Set mage',
    'Set ninja',
    'Set detective',
    'Set tactician',
    'Set strategist',
    'Set machine',
    'Set enjoyer deluxe',
    'Card whisperer',
    'Pattern whisperer',
    'Triple threat',
    'Chaos tamer',
    'Board cleaner',
    'Fastest fingers',
    'Focus mode',
    'Zen solver',
    'Hyperfocus',
    'Shape scholar',
    'Pattern scholar',
    'Mind palace',
    'Clean combos',
    'Combo captain',
    'Logic sprinter',
    'Silky picks',
    'Sharp eyes'
  ];

  // Optional combinator for variety without looking random-gibberish.
  var adjectives = [
    'Huge', 'Dedicated', 'Casual', 'Legendary', 'Friendly', 'Curious', 'Swift', 'Calm', 'Focused', 'Brave',
    'Clever', 'Sneaky', 'Patient', 'Relentless', 'Chill', 'Cozy', 'Silly', 'Serious', 'Sharp', 'Tiny'
  ];
  var roles = [
    'set fan', 'set enthusiast', 'set enjoyer', 'set hunter', 'set solver', 'set wizard', 'set tactician',
    'pattern lover', 'card whisperer', 'shape scholar'
  ];

  // 70% fixed list, 30% constructed.
  if (randomInt(10) < 7) return fixed[randomInt(fixed.length)];
  return adjectives[randomInt(adjectives.length)] + ' ' + roles[randomInt(roles.length)];
}

function ensureOnlineNickname() {
  var nick = (typeof config !== 'undefined' && config.onlineNickname != null ? config.onlineNickname : Storage.get(STORAGE_KEYS.ONLINE_NICKNAME, ''));
  if (typeof nick !== 'string') nick = '';
  nick = nick.trim();
  if (!nick || nick.toLowerCase() === 'not set') {
    nick = generateDefaultOnlineNickname();
    if (typeof config !== 'undefined') config.onlineNickname = nick;
    Storage.set(STORAGE_KEYS.ONLINE_NICKNAME, nick);
  }
  return nick;
}

function getOnlineNickname() {
  return ensureOnlineNickname();
}

function getLeaderboardBaseUrl() {
  if (typeof getOnlineApiUrl === 'function') return getOnlineApiUrl('leaderboard');
  return normalizeAppsScriptExecUrl(ONLINE_LEADERBOARD_URL);
}

function setOnlineNickname(nick) {
  const value = (String(nick || '').trim()).slice(0, 32);
  if (typeof config !== 'undefined') config.onlineNickname = value;
  Storage.set(STORAGE_KEYS.ONLINE_NICKNAME, value);
  return value;
}

const ONLINE_IFRAME_TIMEOUT_MS = 15000;

function fetchViaIframe(url) {
  return new Promise(function (resolve, reject) {
    var done = false;
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    var urlWithFormat = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'format=postmessage';
    var onMessage = function (e) {
      if (done) return;
      var d = e.data;
      if (typeof d === 'string') try { d = JSON.parse(d); } catch (_) { return; }
      var fromGoogle = e.origin && (e.origin.indexOf('google') !== -1 || e.origin.indexOf('script.') !== -1);
      if (d && typeof d === 'object' && (fromGoogle || d.hasOwnProperty('ok') || Array.isArray(d))) {
        done = true;
        window.removeEventListener('message', onMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        clearTimeout(t);
        resolve(d);
      }
    };
    var t = setTimeout(function () {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      reject(new Error('Timeout'));
    }, ONLINE_IFRAME_TIMEOUT_MS);
    window.addEventListener('message', onMessage);
    iframe.src = urlWithFormat;
    document.body.appendChild(iframe);
  });
}

function jsonpRequest(url) {
  return new Promise(function (resolve, reject) {
    var name = 'jsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    var finalUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + encodeURIComponent(name);
    window[name] = function (data) {
      delete window[name];
      if (script.parentNode) script.parentNode.removeChild(script);
      resolve(data);
    };
    var script = document.createElement('script');
    script.src = finalUrl;
    script.onerror = function () {
      delete window[name];
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('Failed to fetch'));
    };
    document.head.appendChild(script);
  });
}

function parseJsonpOrJson(text) {
  var trimmed = (text || '').trim();
  if (/^[a-zA-Z0-9_]+\(/.test(trimmed)) {
    var start = trimmed.indexOf('(') + 1;
    var end = trimmed.lastIndexOf(')');
    if (end > start) trimmed = trimmed.slice(start, end);
  }
  return JSON.parse(trimmed);
}

function fetchViaCorsProxy(url) {
  var encoded = encodeURIComponent(url);
  var proxyUrl = 'https://api.allorigins.win/raw?url=' + encoded;
  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, 10000);
  return fetch(proxyUrl, { cache: 'no-store', signal: controller.signal }).then(function (r) { return r.text(); }).then(function (text) {
    var trimmed = (text || '').trim();
    if ((trimmed.toLowerCase().indexOf('<!doctype') === 0) || (trimmed.indexOf('<') === 0)) throw new Error('Proxy returned HTML');
    return parseJsonpOrJson(trimmed);
  }).finally(function () { clearTimeout(timeoutId); });
}

async function fetchOnlineLeaderboard() {
  var url = getLeaderboardBaseUrl();
  if (!url) return [];
  try {
    var data = await jsonpRequest(url);
    return Array.isArray(data) ? data : [];
  } catch (_) {
    try {
      data = await fetchViaCorsProxy(url);
      return Array.isArray(data) ? data : [];
    } catch (__) {
      return [];
    }
  }
}

function modifiersToStr(mods) {
  if (!mods || typeof mods !== 'object') return '';
  var keys = ['SP', 'AS', 'PBS', 'A3RD', 'SS', 'DM', 'TPS'];
  return keys.filter(function (k) { return mods[k]; }).join(',');
}

function rowsContainRecord(rows, record, nickname) {
  if (!Array.isArray(rows) || !record) return false;
  var nick = (nickname || '').trim();
  return rows.some(function (r) {
    if (!r) return false;
    var rowNick = (r.nickname || r.nick || '').trim();
    if (nick && rowNick && rowNick !== nick) return false;
    var rowSets = r.sets != null ? Number(r.sets) : null;
    var rowTime = r.time != null ? Number(r.time) : (r.time_ms != null ? Number(r.time_ms) : null);
    var rowDate = (r.date || '').trim();
    if (rowSets !== Number(record.sets)) return false;
    if (rowTime !== Number(record.time)) return false;
    if (record.dateStr && rowDate && rowDate !== String(record.dateStr).trim()) return false;
    return true;
  });
}

async function verifyRecordInOnlineLeaderboard(record, nickname, attempts, delayMs) {
  attempts = attempts || 15;
  delayMs = delayMs || 400;
  for (var i = 0; i < attempts; i++) {
    try {
      var rows = await fetchOnlineLeaderboard();
      if (rowsContainRecord(rows, record, nickname)) return true;
    } catch (_) {}
    if (i < attempts - 1) {
      await new Promise(function (r) { setTimeout(r, delayMs); });
    }
  }
  return false;
}

async function submitRecordToOnline(record) {
  var url = getLeaderboardBaseUrl();
  if (!url) return { ok: false, error: 'URL not configured' };
  var nick = ensureOnlineNickname();
  if (!nick) return { ok: false, error: 'Set your nickname first' };
  try {
    var extraJson = '';
    try {
      if (record.extra) extraJson = JSON.stringify(record.extra);
    } catch (_) { extraJson = ''; }
    var params = {
      action: 'submit',
      nickname: nick,
      sets: String(record.sets),
      time: String(record.time),
      date: record.dateStr || '',
      isFinish: record.isAutoFinish ? '1' : '0',
      badShuffles: String(record.badShuffles != null ? record.badShuffles : 0),
      modifiers: modifiersToStr(record.modifiers || {}),
      extraJson: extraJson
    };
    var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    var fullUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + q;

    var submitPromise = fetchViaIframe(fullUrl).catch(function (err) {
      return { _error: err };
    });
    var verifyPromise = verifyRecordInOnlineLeaderboard(record, nick, 15, 400);

    var verified = await verifyPromise;
    if (verified) {
      return { ok: true };
    }

    var data = await submitPromise;
    var timedOut = data && data._error && data._error.message === 'Timeout';
    var errVal = (data && !data._error && data.error);
    var errStr = typeof errVal === 'object' && errVal !== null && errVal.message ? errVal.message : (errVal || 'Failed');

    if (timedOut) {
      return { ok: false, error: 'Timeout and record not found in leaderboard' };
    }
    if (data && data._error) throw data._error;
    return { ok: false, error: errStr || 'Record not found in leaderboard' };
  } catch (e) {
    return { ok: false, error: e.message || 'Network error' };
  }
}

function submitLastResultToOnline() {
  if (!lastFinishResult) return Promise.resolve({ ok: false, error: 'No result to submit' });
  return submitRecordToOnline(Object.assign({}, lastFinishResult, { extra: typeof currentExtraStats === 'object' ? currentExtraStats : null }));
}

var lastSubmittedResultId = null;

function getCurrentFinishResultId() {
  if (!lastFinishResult) return null;
  return lastFinishResult.sets + '-' + lastFinishResult.time + '-' + (lastFinishResult.dateStr || '');
}

function setSubmitOnlineButtonState(state) {
  var btn = document.getElementById('submit-online-btn');
  if (!btn) return;

  if (!btn.dataset.defaultHtml) btn.dataset.defaultHtml = btn.innerHTML;

  btn.classList.remove('locked', 'online-submit-loading', 'online-submit-saved', 'online-submit-locked');

  if (state === 'loading') {
    btn.disabled = true;
    btn.classList.add('online-submit-loading');
    btn.title = 'Saving to online leaderboard…';
    btn.setAttribute('aria-label', 'Saving to online');
    return;
  }

  if (state === 'saved') {
    btn.disabled = true;
    btn.classList.add('online-submit-saved');
    btn.title = 'Saved to online leaderboard';
    btn.setAttribute('aria-label', 'Saved to online');
    btn.innerHTML = SVG_ICONS.CHECK;
    return;
  }

  if (state === 'locked') {
    btn.disabled = true;
    btn.classList.add('online-submit-locked');
    btn.title = 'Submit only for current finish';
    btn.setAttribute('aria-label', 'Submit only for current finish');
    btn.innerHTML = btn.dataset.defaultHtml;
    return;
  }

  btn.disabled = false;
  btn.title = 'Submit to online leaderboard';
  btn.setAttribute('aria-label', 'Submit to online');
  btn.innerHTML = btn.dataset.defaultHtml;
}

function syncSubmitOnlineButtonState() {
  if (typeof resultOpenedFrom !== 'undefined' && (resultOpenedFrom === 'local' || resultOpenedFrom === 'online')) {
    setSubmitOnlineButtonState('locked');
    return;
  }
  var currentId = getCurrentFinishResultId();
  if (!currentId) {
    setSubmitOnlineButtonState('idle');
    return;
  }
  if (lastSubmittedResultId === currentId) setSubmitOnlineButtonState('saved');
  else setSubmitOnlineButtonState('idle');
}

function resetOnlineSubmitForNewFinish() {
  syncSubmitOnlineButtonState();
}

async function handleSubmitToOnline() {
  if (!lastFinishResult) return;
  if (typeof resultOpenedFrom !== 'undefined' && (resultOpenedFrom === 'local' || resultOpenedFrom === 'online')) return;
  var resultId = getCurrentFinishResultId();
  if (!resultId) return;

  if (lastSubmittedResultId === resultId) {
    setSubmitOnlineButtonState('saved');
    return;
  }

  setSubmitOnlineButtonState('loading');
  var result = await submitLastResultToOnline();

  if (result && result.ok) {
    lastSubmittedResultId = resultId;
    setSubmitOnlineButtonState('saved');
  } else {
    setSubmitOnlineButtonState('idle');
    if (typeof showToast === 'function') showToast((result && result.error) ? result.error : 'Failed');
  }
}

function getOnlineShowOnlyNicks() {
  var raw = typeof config !== 'undefined' && config.onlineShowOnlyNicks != null ? config.onlineShowOnlyNicks : Storage.get(STORAGE_KEYS.ONLINE_SHOW_ONLY_NICKS, '');
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
}

function getOnlineBestPerPlayer() {
  if (typeof config !== 'undefined' && config.onlineBestPerPlayer != null) {
    var v = config.onlineBestPerPlayer;
    return v === true || v === 'true';
  }
  var v = Storage.get(STORAGE_KEYS.ONLINE_BEST_PER_PLAYER, true);
  return v === true || v === 'true';
}

function setOnlineShowOnlyNicks(str) {
  var value = (str != null ? String(str) : '').trim();
  if (typeof config !== 'undefined') config.onlineShowOnlyNicks = value;
  Storage.set(STORAGE_KEYS.ONLINE_SHOW_ONLY_NICKS, value);
}

function setOnlineBestPerPlayer(enabled) {
  var value = enabled === true || enabled === 'true';
  if (typeof config !== 'undefined') config.onlineBestPerPlayer = value;
  Storage.set(STORAGE_KEYS.ONLINE_BEST_PER_PLAYER, String(value));
}

function keepBestPerPlayer(rows) {
  if (!rows || rows.length === 0) return rows;
  var byNick = {};
  rows.forEach(function (r) {
    var nick = (r.nickname || r.nick || '').trim().toLowerCase() || '_blank';
    var isFin = r.isFinish || r.is_finish;
    var sets = r.sets != null ? Number(r.sets) : 0;
    var time = r.time != null ? r.time : r.time_ms != null ? r.time_ms : 0;
    var cur = byNick[nick];
    if (!cur) {
      byNick[nick] = { r: r, isFin: !!isFin, sets: sets, time: time };
      return;
    }
    if (isFin && !cur.isFin) { byNick[nick] = { r: r, isFin: true, sets: sets, time: time }; return; }
    if (!isFin && cur.isFin) return;
    if (isFin) {
      if (time < cur.time) byNick[nick] = { r: r, isFin: true, sets: sets, time: time };
      return;
    }
    if (sets > cur.sets || (sets === cur.sets && time < cur.time)) {
      byNick[nick] = { r: r, isFin: false, sets: sets, time: time };
    }
  });
  return Object.keys(byNick).map(function (k) { return byNick[k].r; });
}

function getManualSubmitUrl() {
  if (!lastFinishResult) return '';
  var url = getLeaderboardBaseUrl();
  if (!url) return '';
  var nick = getOnlineNickname();
  if (!nick) return '';
  var params = {
    action: 'submit',
    nickname: nick,
    sets: String(lastFinishResult.sets),
    time: String(lastFinishResult.time),
    date: lastFinishResult.dateStr || '',
    isFinish: lastFinishResult.isAutoFinish ? '1' : '0',
    badShuffles: String(lastFinishResult.badShuffles != null ? lastFinishResult.badShuffles : 0),
    modifiers: modifiersToStr(lastFinishResult.modifiers || {}),
    extraJson: (function () {
      try {
        return typeof currentExtraStats === 'object' && currentExtraStats ? JSON.stringify(currentExtraStats) : '';
      } catch (_) {
        return '';
      }
    })(),
    format: 'display'
  };
  var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + q;
}

async function renderOnlineRecords(container) {
  if (!container) return;
  container.innerHTML = '<p class="text-gray-500 text-sm">Loading…</p>';
  const url = getLeaderboardBaseUrl();
  if (!url) {
    container.innerHTML = '<p class="text-gray-500 text-sm">Online leaderboard is not configured.</p>';
    return;
  }
  const rows = await fetchOnlineLeaderboard();
  if (rows.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-sm">No online records yet.</p>';
    return;
  }
  var nicks = getOnlineShowOnlyNicks();
  var filtered = rows;
  if (nicks.length > 0) {
    var set = {};
    nicks.forEach(function (n) { set[n] = true; });
    filtered = rows.filter(function (r) {
      var nick = (r.nickname || r.nick || '').trim().toLowerCase();
      return nick && set[nick];
    });
  }
  if (getOnlineBestPerPlayer()) {
    filtered = keepBestPerPlayer(filtered);
  }
  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-sm">No records match the current filter.</p>';
    return;
  }
  const finishRows = filtered.filter(r => r.isFinish || r.is_finish);
  const otherRows = filtered.filter(r => !r.isFinish && !r.is_finish);
  finishRows.sort((a, b) => (a.time || a.time_ms || 0) - (b.time || b.time_ms || 0));
  otherRows.sort((a, b) => (b.sets || 0) - (a.sets || 0) || (a.time || a.time_ms || 0) - (b.time || b.time_ms || 0));
  const sorted = [...finishRows, ...otherRows];
  container.innerHTML = '';
  sorted.forEach((r) => {
    const nick = (r.nickname || r.nick || '').trim() || '—';
    const sets = r.sets != null ? r.sets : '—';
    const timeMs = r.time != null ? r.time : r.time_ms;
    const timeStr = timeMs != null ? formatTime(timeMs, true) : '—';
    const dateStr = (r.date || '').trim() || '';
    const isFin = r.isFinish || r.is_finish;
    const item = document.createElement('div');
    item.className = 'record-item online-record-item';
    item.innerHTML =
      '<div class="record-info">' +
        '<div class="record-val">' + escapeHtml(nick) + ' · ' + escapeHtml(String(sets)) + ' Sets ' + (isFin ? '✓' : '') + '</div>' +
        (dateStr ? '<div class="text-[10px] uppercase opacity-70">' + escapeHtml(dateStr) + '</div>' : '') +
      '</div>' +
      '<div class="record-info text-right flex-grow flex justify-end items-center mr-2">' +
        '<div class="text-white font-mono text-lg leading-none">' + escapeHtml(timeStr) + '</div>' +
      '</div>';

    var bsVal = r.badShuffles != null ? r.badShuffles : r.bad_shuffles;
    if (bsVal === undefined || bsVal === null || bsVal === '') bsVal = 0;
    var extraJson = r.extraJson || r.extra_json || r.extra || '';
    var extraStats = null;
    if (extraJson) {
      try { extraStats = JSON.parse(extraJson); } catch (_) { extraStats = null; }
    }
    if (!extraStats) {
      extraStats = {
        elapsedMs: timeMs || 0,
        dateStr: dateStr || '',
        platform: 'Online',
        isAutoFinish: !!isFin,
        badShuffles: Number(bsVal) || 0,
        mistakes: 0,
        shuffleExCount: 0,
        possibleHistory: [],
        timestamps: [],
        modifiers: {}
      };
    }
    var rec = {
      id: null,
      sets: sets === '—' ? 0 : Number(sets),
      time: timeMs != null ? timeMs : extraStats.elapsedMs || 0,
      badShuffles: Number(bsVal) || 0,
      date: dateStr,
      isSeed: false,
      timestamps: extraStats.timestamps || [],
      modifiers: extraStats.modifiers || {},
      extra: extraStats
    };
    bindOnlineRecordTap(item, rec);
    container.appendChild(item);
  });
}

function bindOnlineRecordTap(item, rec) {
  const onDown = (e) => {
    item._recordTap = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
  };
  const onUp = (e) => {
    const s = item._recordTap;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if ((Date.now() - s.t) < 400 && dx * dx + dy * dy < 225) showOnlineRecordDetails(rec);
    item._recordTap = null;
  };
  const onCancel = () => { item._recordTap = null; };
  item.addEventListener('pointerdown', onDown, { passive: true });
  item.addEventListener('pointerup', onUp, { passive: true });
  item.addEventListener('pointercancel', onCancel, { passive: true });
}

async function showOnlineRecordDetails(rec) {
  if (!rec.extra) { alert('Detailed info not available for this online record'); return; }
  if (typeof closeOnlineRecordsModal === 'function') await closeOnlineRecordsModal();
  if (typeof closeModal === 'function') await closeModal('records-modal');
  resultOpenedFrom = 'online';
  currentExtraStats = rec.extra;
  currentExtraStats.modifiers = rec.modifiers || currentExtraStats.modifiers || {};
  currentExtraStats.timestamps = rec.timestamps || currentExtraStats.timestamps || [];
  displayResults(rec.sets, rec.badShuffles || 0, currentExtraStats);
  openModal('result-modal');
  if (typeof syncSubmitOnlineButtonState === 'function') syncSubmitOnlineButtonState();
}


function openNicknamePrompt() {
  const current = ensureOnlineNickname();
  const raw = prompt('Your nickname for online leaderboard:', current || 'Player');
  if (raw === null) return;
  const nick = setOnlineNickname(raw);
  refreshOnlineNicknameDisplay();
}

function refreshOnlineNicknameDisplay() {
  const el = document.getElementById('online-nickname-display');
  if (!el) return;
  const nick = ensureOnlineNickname();
  el.textContent = nick || 'Not set';
  el.classList.toggle('text-gray-500', !nick);
  el.classList.toggle('font-bold', !!nick);
}
