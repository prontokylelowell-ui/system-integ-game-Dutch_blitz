# Dutch Blitz

A real-time, browser-based implementation of **Dutch Blitz** — the fast, Pennsylvania Dutch racing card game. You race **up to three AI opponents** to empty your Blitz pile before they empty theirs.

Built with **HTML5, CSS3 and vanilla JavaScript (ES6)**. No frameworks, no build step, no backend — it runs as a static site and is ready for GitHub Pages.

---

## Play

Open `index.html` in any modern browser, or serve the folder locally:

```powershell
python -m http.server 8080
# then visit http://127.0.0.1:8080/
```

A local server is recommended over opening the file directly, so the Google Fonts and `localStorage` behave consistently across browsers.

---

## How to Play

**The goal.** Be the first player to clear all **10 cards** from your Blitz pile. When you do, the round ends immediately.

**Your setup (each player has their own 40-card deck).**

| Pile | Cards | Rule |
| --- | --- | --- |
| **Blitz pile** | 10 | Only the top card is face up and playable. Emptying it wins the round. |
| **Post piles** | 3 × 1 | Built **down** in alternating *boy* / *girl* colours. |
| **Wood pile** | 27 | Turned over **three at a time**; only the top turned card is playable. |

**The centre — Dutch piles.** Twelve shared piles (**three per colour**), each built **1 → 10 in the same colour**. Two cards of the same value (two red 1s, say) start separate piles instead of stacking. Any player may add to any pile at any time.

**Colour genders.** Post piles must alternate between the two groups:

- **Boys** — blue and red
- **Girls** — green and yellow

A card may go onto a Post pile when it is exactly **one lower** than the pile's active card *and* the gender switches. An empty Post slot accepts any card.

**Stuck?** Turn your Wood pile. When the face-down stack runs out, the turned cards are gathered up and turned over again.

**Scoring.** At the end of a round:

- **+1** for every one of your cards that reached the Dutch piles
- **−2** for every card still stuck in your Blitz pile
- First player to **75 points** wins the game

---

## Controls

| Action | Input |
| --- | --- |
| Play a card | **Click it** — it goes to the best legal spot (Dutch pile preferred) |
| Turn the Wood pile | **Click your Wood pile**, or press <kbd>Space</kbd>, or the **Turn Wood** button |
| Pause / resume | **Esc** or the **Pause** button |

---

## Features

- **Real-time racing** — every player, human and AI, plays at once on a shared board driven by a `requestAnimationFrame` loop.
- **1–3 AI opponents** with three difficulty profiles (Easy / Normal / Hard) that vary action speed, jitter and hesitation.
- **Rule-based AI** — bots rank the currently legal moves (Blitz progress, opening piles, freeing Post piles) and play the best one.
- **Multi-round games** to a 75-point target, with a full per-round score table.
- **No image files** — the four deck backs (buggy, pump, plow, bucket) are hand-drawn inline SVG folk-art icons.
- **No audio files** — all sound effects are synthesised at runtime with the Web Audio API.
- **Saved settings & stats** — difficulty, opponent count, sound preference and lifetime statistics persist in `localStorage`.
- **Responsive & accessible** — adapts to desktop, tablet and small screens with reduced-motion support and keyboard navigation.

---

## Project Structure

```
card game/
├─ index.html          # Single-page app: menu, game screen, modals, overlays
├─ css/
│  ├─ main.css         # Design tokens, buttons, menu, modals, overlays, countdown
│  └─ game.css         # Card component, table layout, Dutch piles, opponents, score table
└─ js/
   ├─ cards.js         # Deck construction, SVG symbols, shared card renderer
   ├─ rules.js         # Pure rule checks (no mutations)
   ├─ engine.js        # Authoritative game state and transitions (no DOM)
   ├─ ai.js            # Rule-based opponents and difficulty profiles
   ├─ game.js          # Real-time DOM controller + rAF game loop
   └─ main.js          # App shell: settings, stats, sound, screen switching
```

**Architecture.** The code is layered so the rules stay testable and the DOM layer stays thin:

- `rules.js` never mutates state — it only answers "is this legal?".
- `engine.js` owns the state and is the only place that changes it. It touches no DOM.
- `ai.js` reuses `rules.js` and `engine.js` to drive each bot.
- `game.js` renders whatever `engine.js` produces and translates input into validated moves.
- `main.js` wraps everything as a single-page shell.

Each module is an IIFE that exposes a namespace on `window` (`DBCards`, `DBRules`, `DBEngine`, `DBAI`, `DBGame`, `DBApp`).

---

## Deployment (GitHub Pages)

1. Push this folder to a GitHub repository.
2. In **Settings → Pages**, set the source to the branch and root folder (`/`).
3. Open the published URL — no build or configuration required.

Because the game is entirely static and uses relative asset paths, it works from any subdirectory.
