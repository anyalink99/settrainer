const STORAGE_KEYS = {
  PRESET: 'set_shape_preset',
  SPEED_MOD: 'set_speed_mod',
  SHOW_POSSIBLE: 'set_show_possible',
  SHOW_SPM: 'set_show_s_p_m',
  DEBUG_MODE: 'set_debug_mode',
  SHOW_TIMER: 'set_show_timer',
  SHOW_TIMER_MS: 'set_show_timer_ms',
  SHOW_SETS_CARDS: 'set_show_sets_cards',
  AUTO_SHUFFLE: 'set_auto_shuffle',
  AUTO_SELECT_THIRD: 'set_auto_select_third',
  PREVENT_BAD_SHUFFLE: 'set_prevent_bad_shuffle',
  SYNCHRONIZED_SEED: 'set_synchronized_seed',
  MIN_SETS: 'set_min_sets',
  TARGET_POSSIBLE_SETS: 'set_target_possible_sets',
  GAME_MODE: 'set_game_mode',
  TRAINING_BOARDS: 'set_training_boards',
  KEYBINDS: 'set_keybinds',
  KEYBINDS_HORIZONTAL: 'set_keybinds_horizontal',
  RECORDS: 'set_pro_records',
  ONLINE_NICKNAME: 'set_online_nickname',
  ONLINE_SHOW_ONLY_NICKS: 'set_online_show_only_nicks',
  ONLINE_BEST_PER_PLAYER: 'set_online_best_per_player',
  APP_WIDTH: 'set_app_width',
  BOARD_ORIENTATION: 'set_board_orientation',
  GAME_COLORS: 'set_game_colors',
  SHAPE_SIZE_RATIO: 'set_shape_size_ratio'
};

const GAME_MODES = {
  NORMAL: 'normal',
  TRAINING: 'training',
  JUNIOR: 'junior',
  MULTIPLAYER: 'multiplayer'
};

const GAME_MODE_IDS = [GAME_MODES.NORMAL, GAME_MODES.TRAINING, GAME_MODES.JUNIOR, GAME_MODES.MULTIPLAYER];

const DEFAULT_GAME_MODE = GAME_MODES.NORMAL;

const TPS_MAX_SETS = 14;

const MIN_SETS_MAX = 27;

const GAME_CONFIG = {
  SETS_TO_WIN: 23,
  ANIMATION_DURATION: 70,
  CARD_FADE_DURATION: 100,
  CARD_ANIM_IN_DURATION: 180,
  SHUFFLE_DELAY: 280,
  MISTAKE_DELAY: 150,
  TOAST_DURATION: 800,
  LOCK_DURATION: 1000,
  MODAL_TRANSITION: 200,
  EXPORT_DELAY: 30
};

const DEFAULT_GAME_COLORS = ['#fd0000', '#01a43b', '#0000fe'];

const UI_COLORS = {
  BACKGROUND: '#2d2631',
  SPM_MIN_HUE: 0,
  SPM_MAX_HUE: 330
};

const KEY_MAP = {
  'й':'q','ц':'w','у':'e','к':'r','е':'t','н':'y','г':'u','ш':'i','щ':'o','з':'p','х':'[','ъ':']',
  'ф':'a','ы':'s','в':'d','а':'f','п':'g','р':'h','о':'j','л':'k','д':'l','ж':';','э':'\'',
  'я':'z','ч':'x','с':'c','м':'v','и':'b','т':'n','ь':'m','б':',','ю':'.'
};

const DEFAULT_BINDS = {
  board: ['e', 'r', 'i', 'o', 'd', 'f', 'k', 'l', 'x', 'c', 'm', ','],
  shuffle: 'backspace',
  shuffleEx: ' ',
  finish: 'enter'
};

const DEFAULT_BINDS_HORIZONTAL = {
  board: ['3', '4', '9', 'e', 'r', 'o', 'd', 'f', 'l', 'c', 'v', ','],
  shuffle: 'backspace',
  shuffleEx: ' ',
  finish: 'enter'
};

const ONLINE_LEADERBOARD_URL = 'https://script.google.com/macros/s/AKfycbzs-XcC56kdbxwz8cNTeGUbJxdDmzw0W8U1WNm7bY896r2iFok2cX0bpDiYCBIdc6eKIA/exec';
const ONLINE_LOBBY_URL = 'https://script.google.com/macros/s/AKfycbwIeoG6dtqb7Lb-Xy-3r7v5wWyxTy3KAZ4Rod5IFZwiLPMKI2WPH5uxtKy7V0EWq9cP/exec';

// STUN resolves public addresses; TURN relays traffic when direct P2P is
// impossible (e.g. both peers behind symmetric NAT on mobile networks).
// Unreachable servers are skipped by ICE, so a dead entry only slows down
// candidate gathering, it does not break connections.
const MULTIPLAYER_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

const MULTIPLAYER_HANDSHAKE_TIMEOUT_MS = 30000;
const MULTIPLAYER_MAX_CONNECTION_RETRIES = 2;

const SVG_ICONS = {
  SETTINGS: '<svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.91,7.62,6.29L5.23,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.72,8.87 c-0.11,0.2-0.06,0.47,0.12,0.61l2.03,1.58C4.84,11.36,4.81,11.66,4.81,12c0,0.33,0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.5c-1.93,0-3.5-1.57-3.5-3.5 s1.57-3.5,3.5-3.5s3.5,1.57,3.5,3.5S13.93,15.5,12,15.5z"/></svg>',
  MORE_DETAILS: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>',
  GLOBE: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  UPLOAD: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
  DELETE: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
  CHECK: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5" /></svg>',
  GAMEMODES: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
  BOARD: '<svg width="20" height="20" viewBox="0 0 32 32" fill="currentColor"><path d="M29.5,12 C30.8,14.5 30.8,17.2 30.2,19.9 C29.7,22.2 28,23 26,22 C25.4,21.7 24.8,21.4 24.3,21.1 C21.7,19.5 19,19.3 16.1,20.4 C13.4,21.5 10.6,21.6 7.8,20.8 C3.3,19.4 0.4,14.6 1.4,10.2 C2,7.7 3.7,7 5.9,8.2 C6.2,8.4 6.5,8.6 6.8,8.8 C9.7,10.6 12.7,11.2 16,9.9 C17.3,9.3 18.7,8.9 20,8.6 C24,7.6 27.5,8.9 29.5,12 Z"/></svg>',
  METRICS: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M4 20h16v-2H4v2zm2-4h3V8H6v8zm5 0h3V4h-3v12zm5 0h3v-6h-3v6z"/></svg>',
  KEYBINDS: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="10" rx="2"/><path d="M6 10h2M10 10h2M14 10h2M18 10h0M6 13h12"/></svg>',
  ADVANCED: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M4 7h8v2H4V7zm0 8h12v2H4v-2zm14-10h2v6h-2V5zm-4 6h2v8h-2v-8z"/></svg>',
  CLOSE: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6l-12 12"/></svg>'
};

const SHAPE_VIEWBOX = '0 0 32 32';
const STANDARD_SHAPE_TEMPLATES = [
  '<rect x="4" y="4" width="24" height="24" rx="1" stroke="${color}" stroke-width="1.8" fill="${fill}" />',
  '<circle cx="16" cy="16" r="12" stroke="${color}" stroke-width="1.8" fill="${fill}" />',
  '<polygon points="16,4 29,27 3,27" stroke="${color}" stroke-width="1.8" fill="${fill}" stroke-linejoin="round" />'
];
const CLASSIC_WAVE_PATH = 'M29.5,12 C30.8,14.5 30.8,17.2 30.2,19.9 C29.7,22.2 28,23 26,22 C25.4,21.7 24.8,21.4 24.3,21.1 C21.7,19.5 19,19.3 16.1,20.4 C13.4,21.5 10.6,21.6 7.8,20.8 C3.3,19.4 0.4,14.6 1.4,10.2 C2,7.7 3.7,7 5.9,8.2 C6.2,8.4 6.5,8.6 6.8,8.8 C9.7,10.6 12.7,11.2 16,9.9 C17.3,9.3 18.7,8.9 20,8.6 C24,7.6 27.5,8.9 29.5,12 Z';
const CLASSIC_SHAPE_TEMPLATES = {
  diamond: '<polygon transform="${rotateTransform}translate(16,16) scale(1.08) translate(-16,-16)" points="1,16 16,8.5 31,16 16,23.5" stroke="${color}" stroke-width="${strokeW}" fill="${fill}" stroke-linejoin="round" />',
  oval: '<rect transform="${rotateTransform}translate(16,16) scale(1.08, 1.16) translate(-16,-16)" x="1" y="9.5" width="30" height="13" rx="6.5" stroke="${color}" stroke-width="${strokeW}" fill="${fill}" />',
  wave: '<path transform="${rotateTransform}translate(16,16) scale(1.08) translate(-16,-16)" d="${waveD}" stroke="${color}" stroke-width="${strokeW}" fill="${fill}" stroke-linejoin="round" />'
};
