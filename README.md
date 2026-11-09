# Infinite Chess

Chess on a 72-cell figure-8 board, by Mark Colebank. The game runs as a static site on GitHub Pages: no build step, no npm, no server code.

## How to play

- Open the site and pick **Play vs Bot** (Easy, Medium or Hard, or two players on one device) or **Play Online**.
- The board is two loops joined by a 4x4 crossing. Each of the four lanes (Q, B, N, R) loops forever, so rooks, bishops and queens keep sliding around until something blocks them.
- White starts in the left loop, Black in the right loop. White moves first.
- Pawns move toward the other loop. White promotes on a cell numbered 15, Black on a cell numbered 4.
- Once a pawn enters the 16-cell center diamond it can never move back into the loop it came from (for example White R10 to Q1 or Black Q9 to R18).
- Bishops, queens and kings can cross diagonally over the tip of each center hole: R7 to R1 and Q12 to Q18. Pawns and knights cannot.
- The board shows vertically by default (White at the bottom). Game settings let each player switch to horizontal, change board colors and piece colors, and resize the board. These choices are saved on the device.
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
- Bots have ratings: Easy 800, Medium 1100, Hard 1400. Beating a bot awards Elo points against its rating, so stronger bots give more. Losses and draws against bots never lower a player's rating. Games under 20 moves (plies) are unrated. One bot game can be saved every 20 seconds.
- The Dynamic bot searches like Hard but leans on the shared playbook, which grows with every finished game. It starts at 1400 and its rating moves up and down with its results against players (Elo, K = 24).
- Existing projects: run `supabase/update-002-bot-ratings.sql` once to add bot ratings and the Dynamic bot. New projects get it from `setup.sql`.
- The server checks turn order and move format, but only the browsers run the full rules, so a modified client could send a legal-looking but illegal move. The other player's browser then shows "Game out of sync".

If `config.js` still has its placeholders, or Supabase cannot be reached, the site shows a small "Online features not configured" or "Offline" banner, hides the online menu items, and bot play keeps working.

## Install as an app

The site is a web app: on iPhone, open it in Safari, tap Share, then Add to Home Screen. The home screen shows an Install card with these steps. On Android and desktop Chrome the Install button opens the browser's own install prompt. `site.webmanifest` and the icon files make it open full screen with its own icon.

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
- `AI.chooseMove` takes an optional list of move strings to search first, and an optional list to avoid at the root.

### Rule changes after the original spec

- `BoardGraph.step(pos, dir, tips)`: with `tips` on, a diagonal step off R7 toward the hole lands on R1 (and back), and Q12 links to Q18 the same way. Diagonal lines, diagonal neighbors and the king use it; knight and pawn patterns do not.
- `pawnPattern` drops any advance or capture from a center cell (8 to 11) into the pawn's own home loop (White 1 to 7, Black 12 to 18).
- The `#test` suite was updated to match: Appendix A rows R1, R7, Q12, Q18 and the Q4 diagonal lines, plus new checks for both rules.

### Online flow

- **Accounts:** email and password through Supabase Auth. Guests can play the bots; those games are unrated and not saved.
- **Lobbies:** `create_lobby`, `join_lobby`, `leave_lobby`, `list_open_lobbies`. The host waits on a Realtime subscription to its lobby row, with a 5-second poll as backup. Invite links use `?lobby=NAME`.
- **Online games:** the position is rebuilt by replaying `games.moves` with the engine. Moves are sent with `make_move(p_game, p_move, p_ply)`; a failed call undoes the local move. Updates arrive through Realtime with a 5-second poll as backup. When the engine sees the game end, both browsers call `report_result` every 5 seconds until the game is no longer active. The active game id is kept in `localStorage` so a refresh reconnects.
- **Rated bot games:** a signed-in player's finished bot game is sent to `record_bot_game`. A game becomes unrated if undo is used or the opponent, side or difficulty changes after the first move.
- **Playbook:** before Medium or Hard bots search, they read `playbook` rows for the current `positionKey` (1.5-second limit, cached per session). Every finished bot or online game is sent to `learn_from_game` with up to 200 `{ key, move, side }` entries.

## Notes

- All paths are relative, so the site works under `/REPO-NAME/` on GitHub Pages.
- The online game shows the player's own loop on the left (White plays from the left as normal; Black's board is rotated 180 degrees).
