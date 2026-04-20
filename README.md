# Set Pro Training

### 🔗 Play Now: [https://niocreations.ru/settrainer/](https://niocreations.ru/settrainer/)

---

**Set Pro Training** is a high-performance, browser-first trainer for the classic card game **Set**. It focuses on speed practice, repeatable drills, and clean analytics - while keeping everything lightweight (vanilla JS) and easy to run locally. 

---

## What’s in the app

### Game modes

- **Normal**: Full deck, standard gameplay.
- **Training**: Replays a curated loop of boards to drill tough situations.
  - During regular play, the app snapshots boards when you find sets.
  - At game finish, it saves your slowest boards (if you found enough sets) and reuses them in Training sessions.
  - Boards are automatically retired after you solve them fast (<5s) a couple of times.
- **Junior**: Smaller deck (27 cards) with solid fill only; ends automatically when the board has no sets.

### HUD & analytics

- **Possible Sets**: Live count of sets on the current 12-card board.
- **Detailed breakdown (Debug Mode)**: Split by “Diff / 1–3 Same”.
- **Live SPM (Sets/min)**: Optional pace indicator with color scaling.
- **Timer**: Optional timer with optional tenths.
- **Sets & Cards**: Optional compact HUD showing current sets and remaining cards/boards.

### Results & records

- **Result screen**: Total time, avg find, fastest/slowest find, modifiers used, and a speed chart (sets/min over time), bad shuffles (counts “Shuffle while a set existed”) etc.
- **Local records**: Stored in LocalStorage with date, modifiers, and full details per record (including a details view).

### Online leaderboard

- **Submit from the result screen** (globe button).
- **Nickname + filters**: Set a nickname, filter by players, optionally keep best result per player.

### Customization

- **Shape presets**: Standard geometric or Classic (ovals/diamonds/waves).
- **Board orientation**: Vertical or horizontal.
- **Shape size**: Slider (affects rendered symbol size).
- **Custom colors**: Per-color picker with hex input.
- **Animation speed**: 0.1×–2.0×.
- **Resizable app width**: Drag side handles; saved locally.
- **Keybinds** (desktop): Fully rebindable; stored per orientation.

---

## Modifiers / options (quick reference)

- **SP**: Show Possible (HUD counter).
- **AS**: Auto Shuffle (auto-reshuffle when the board has 0 sets).
- **PBS**: Prevent Bad Shuffle (blocks manual Shuffle if a set exists).
- **A3RD**: Auto Select 3rd (auto-completes a set after selecting 2 cards, if possible).
- **SS**: Synchronized Seed (uses a time-based deterministic seed for shuffles; changes every minute). Use to simulate online play
- **DM**: Debug Mode (extra HUD + highlights; shows TPS iteration info).
- **TPS**: Target Possible Sets (steers board generation/replenishment toward X possible sets).

---

## Rules of Set (quick recap)

A **Set** is **three cards** where each attribute is either **all the same** or **all different** across the three cards.

The four attributes:

- **Color**: 3 colors
- **Shape**: 3 shapes
- **Number**: 1–3 symbols
- **Fill**: solid / striped / empty (Junior mode uses solid only)

---

## Controls

### Desktop (default keybinds)

| Action | Default |
|---|---|
| Select card by slot | `E` `R` `I` `O` `D` `F` `K` `L` `X` `C` `M` `,` (slots 1–12) |
| Shuffle (new board / redeal) | `Backspace` |
| Shuffle existing 12 cards (in-place) | `Space` |
| Finish game | `Enter` |

All of these can be changed in **Settings → Keybinds** (desktop only).

### Hold shortcuts (desktop)

- **Hold `Backquote` (the \` key)**: temporarily enables “Show Possible” while held.
- **Hold `Right Ctrl`**: temporarily enables “Debug Mode” while held.

### Mobile

- **Tap** a card to select/deselect.
- **Swipe up** in the bottom swipe zone: shuffle the existing 12 cards.

---

## Data & persistence

- **LocalStorage**: settings, colors, keybinds (per orientation), training boards, and local records.
- **Online leaderboard**: uses a public Google Apps Script endpoint; submissions include your nickname and your result data (time/sets/modifiers + extra stats payload used for details).

---

## Run locally

This is a static app (no build step).

- **Simplest**: open `index.html` in your browser.
- **Recommended**: run a local static server (avoids some browser restrictions).
  - Example (Python): `python -m http.server`

---

## Tech stack

- Vanilla JS, HTML, CSS.
- [Tailwind CSS](https://tailwindcss.com/) (CDN), [Chart.js](https://www.chartjs.org/), [html2canvas](https://html2canvas.hertzen.com/).

---

## Project layout

Key modules:

- **Core**: `assets/js/core/state.js`, `assets/js/core/constants.js`, `assets/js/core/storage-module.js`, `assets/js/core/utilities.js`
- **Game**: `assets/js/game/game-logic.js`, `assets/js/game/set-math.js`, `assets/js/game/graphics-rendering.js`, `assets/js/game/tps-logic.js`, `assets/js/game/training-mode.js`
- **UI**: `assets/js/ui/settings.js`, `assets/js/ui/modal-management.js`, `assets/js/ui/results-stats.js`, `assets/js/ui/event-listeners.js`, `assets/js/ui/resizer.js`, `assets/js/ui/color-picker.js`, `assets/js/ui/keybinds.js`
- **Online**: `assets/js/online/online-leaderboard.js`, `assets/js/online/multiplayer.js`, `assets/js/online/multiplayer/*.js`
