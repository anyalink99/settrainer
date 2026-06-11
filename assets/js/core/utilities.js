function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function formatTime(ms, showMs = false) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  let res = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (showMs) {
    const remainder = Math.floor((ms % 1000) / 10);
    res += `.${String(remainder).padStart(2, '0')}`;
  }
  return res;
}

function formatTimeTenths(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const remainder = Math.floor((ms % 1000) / 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(remainder)}`;
}

function getSPMColor(spm) {
  const min = 3;
  const max = 30;
  const clamped = Math.max(min, Math.min(max, spm));
  const hue = ((clamped - min) / (max - min)) * UI_COLORS.SPM_MAX_HUE;
  return `hsl(${hue}, 80%, 65%)`;
}

function validateSet(cards) {
  return ['c','s','f','n'].every(p => (cards[0][p] + cards[1][p] + cards[2][p]) % 3 === 0);
}

function shuffleInPlace(arr, rng) {
  const randomFunc = rng != null ? rng : Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFunc() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function normalizeAppsScriptExecUrl(rawUrl) {
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!url) return '';
  return /\/exec\/?$/i.test(url) ? url : (url.replace(/\/?$/, '') + '/exec');
}

function getOnlineApiUrl(preferredEndpoint) {
  const endpoint = preferredEndpoint === 'lobby' ? 'lobby' : 'leaderboard';
  const primaryUrl = endpoint === 'lobby' ? ONLINE_LOBBY_URL : ONLINE_LEADERBOARD_URL;
  const fallbackUrl = endpoint === 'lobby' ? ONLINE_LEADERBOARD_URL : ONLINE_LOBBY_URL;

  const normalizedPrimary = normalizeAppsScriptExecUrl(primaryUrl);
  if (normalizedPrimary) return normalizedPrimary;

  const normalizedFallback = normalizeAppsScriptExecUrl(fallbackUrl);
  return normalizedFallback || '';
}

function shouldEnableDebugLogs() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.DEBUG_MODE);
    if (stored !== null) return stored === 'true';
  } catch (_) {}

  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('debugLogs') === '1';
}

function debugLog() {
  if (!shouldEnableDebugLogs()) return;
  console.log.apply(console, arguments);
}


function createEventBus() {
  const listeners = {};
  return {
    on(eventName, handler) {
      if (!eventName || typeof handler !== 'function') return function () {};
      if (!listeners[eventName]) listeners[eventName] = new Set();
      listeners[eventName].add(handler);
      return function unsubscribe() {
        listeners[eventName].delete(handler);
      };
    },
    emit(eventName, payload) {
      const handlers = listeners[eventName];
      if (!handlers) return;
      handlers.forEach(function (handler) {
        handler(payload);
      });
    }
  };
}

const AppEvents = createEventBus();
