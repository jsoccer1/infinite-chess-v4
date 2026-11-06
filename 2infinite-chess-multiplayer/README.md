# Infinite Chess

Chess on a 72-cell figure-8 board, by Mark Colebank. The game runs as a static site on GitHub Pages: no build step, no npm, no server code.

## How to play

- Open the site and pick **Play vs Bot** (Easy, Medium or Hard, or two players on one device) or **Play Online**.
- The board is two loops joined by a 4x4 crossing. Each of the four lanes (Q, B, N, R) loops forever, so rooks, bishops and queens keep sliding around until something blocks them.
- White starts in the left loop, Black in the right loop. White moves first.
- Pawns move toward the other loop. White promotes on a cell numbered 15, Black on a cell numbered 4.
- Checkmate wins. Stalemate and threefold repetition are draws.
- Video walkthrough: https://youtu.be/NuzgnSQVKGU?si=BK_mP7PERFE9E7Qv
- Add `#test` to the URL to run the built-in rules test suite in the browser.

## Setup

1. Run `supabase/setup.sql` in the Supabase SQL Editor.
2. Fill in `config.js` with your project URL and your publishable (anon) key.
3. In Supabase, set **Authentication > URL Configuration > Site URL** to your GitHub Pages link (for example `https://USER.github.io/REPO-NAME/`) and add it to the redirect URLs.

`supabase/setup.sql` is safe to run more than once. It creates the tables, the game functions, row level security, the public `avatars` storage bucket, and turns on Realtime for `lobbies` and `games`. On current Supabase projects new tables are not exposed to the Data API automatically, so the script grants exactly the access the game needs.

Server rules worth knowing:

- Online games use Elo with K = 32. A game ends when both players report the same result, by resignation, or by a claim after 10 minutes without a move. Different reports mark the game disputed and unrated.
- Bot games: wins add 5 (Easy), 10 (Medium) or 15 (Hard). Losses and draws never lower the rating. Games under 20 moves (plies) are unrated. One bot game can be saved every 20 seconds.
- The server checks turn order and move format, but only the browsers run the full rules, so a modified client could send a legal-looking but illegal move. The other player's browser then shows "Game out of sync".

If `config.js` still has its placeholders, or Supabase cannot be reached, the site shows a small "Online features not configured" or "Offline" banner, hides the online menu items, and bot play keeps working.

## Files

| File | What it holds |
| :--- | :--- |
| `index.html` | Page markup for every screen. Loads `config.js`, supabase-js 2.45.4 from jsDelivr, then the app scripts. |
| `config.js` | `window.APP_CONFIG` with `SUPABASE_URL` and `SUPABASE_KEY`. The only key in the code. |
| `css/style.css` | All styles, light and dark. |
| `assets/banner.jpg` | The Infinite Chess banner used on the loading screen, home screen and game screen. |
| `js/engine.js` | Board graph, geometry, rules and the bot. Pure logic, no DOM. |
| `js/tests.js` | Ground-truth tables and the `#test` runner. |
| `js/avatars.js` | The 12 preset SVG avatars and the upload resizer. |
| `js/ui.js` | Board drawing, clicks, move animation, local games, and the hooks online play uses. |
| `js/online.js` | Supabase client, accounts, profiles, leaderboard, lobbies, online games, rated bot games and the bot playbook. |

## Architecture

The rules engine was not changed. Everything new sits on top of it.

| Job | Where |
| :--- | :--- |
| Board graph (cell names, neighbors, lines, leaper targets) | `BoardGraph` in `js/engine.js`: `cellAt`, `positionsOf`, `step`, `walkLine`, `linesFrom`, `orthogonalNeighbors`, `diagonalNeighbors`, `leaperTargets` |
| Board geometry and click detection | `Geometry` in `js/engine.js`: `shape`, `polygon`, `labelPos`, `hitTest`, `holePoints` |
| Board state | `Rules.newGame()` returns `{ board, turn, history, posCounts }`. `board` is 72 slots indexed by `Rules.IDX[cellName]`. |
| Legal move generation | `Rules.pseudoMoves(state, color)` and `Rules.legalMoves(state, color)` |
| Applying a move | `Rules.makeMove` / `Rules.unmakeMove` (search), `Rules.playMove` / `Rules.undoLast` (game history and repetition counts) |
| Checkmate, stalemate, draws | `Rules.status(state)`: checkmate, stalemate and threefold repetition |
| Bot | `AI.chooseMove(state, depth, preferred)` with `AI.evaluate`. Depth 1, 2, 3 = Easy, Medium, Hard. |
| Drawing the board and handling clicks | `GameUI` in `js/ui.js`: `draw`, `drawPieceAt`, `resize`, the canvas `click` handler, `clickPlay`, `commit` (animated move) |
| Local and online game sessions | `GameUI.newLocal`, `GameUI.startOnline`, `GameUI.syncMoves`, `GameUI.setOnlineFinished` |
| Online features | `App` in `js/online.js` |

### Engine hooks added for multiplayer

These are additions only; existing behavior is unchanged.

- `Rules.moveToString(move)`: deterministic move string, `FROM-TO`, plus `=Q`, `=R`, `=B` or `=N` for promotions. Castling is the king's move, for example `Q4-N4`.
- `Rules.moveFromString(state, str)`: returns the legal move for a string, or `null` if it is not legal in that position.
- `positionKey(state)` (also `Rules.playbookKey`): `<w|b>|<white pieces>|<black pieces>|<castling rights>`, pieces like `K@Q4` sorted alphabetically, rights `W`, `B`, `WB` or `-`. The older `Rules.positionKey` (used for threefold repetition) is unchanged.
- `AI.chooseMove` takes an optional list of move strings to search first. It only changes search order.

### Online flow

- **Accounts:** email and password through Supabase Auth. Guests can play the bots; those games are unrated and not saved.
- **Lobbies:** `create_lobby`, `join_lobby`, `leave_lobby`, `list_open_lobbies`. The host waits on a Realtime subscription to its lobby row, with a 5-second poll as backup. Invite links use `?lobby=NAME`.
- **Online games:** the position is rebuilt by replaying `games.moves` with the engine. Moves are sent with `make_move(p_game, p_move, p_ply)`; a failed call undoes the local move. Updates arrive through Realtime with a 5-second poll as backup. When the engine sees the game end, both browsers call `report_result` every 5 seconds until the game is no longer active. The active game id is kept in `localStorage` so a refresh reconnects.
- **Rated bot games:** a signed-in player's finished bot game is sent to `record_bot_game`. A game becomes unrated if undo is used or the opponent, side or difficulty changes after the first move.
- **Playbook:** before Medium or Hard bots search, they read `playbook` rows for the current `positionKey` (1.5-second limit, cached per session). Every finished bot or online game is sent to `learn_from_game` with up to 200 `{ key, move, side }` entries.

## Notes

- All paths are relative, so the site works under `/REPO-NAME/` on GitHub Pages.
- The online game shows the player's own loop on the left (White plays from the left as normal; Black's board is rotated 180 degrees).
