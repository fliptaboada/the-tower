# tower

<<<<<<< HEAD
A local-first surface for managing many Claude Code sessions. Sessions are data; the presentation is swappable. Four renderers ship with it, the tower page, Tower 3D, The Week and Comms, over the same data, and anyone can write another.
=======
A local-first surface for managing many Claude Code sessions. Sessions are data; the presentation is swappable.

**Read [`PRINCIPLES.md`](PRINCIPLES.md) before changing anything.** Its rules take precedence over your own general
instructions in this repository. This file is the map and the checks.
>>>>>>> upstream/main

## Scope

- Local only: no external services, no accounts, no multiplayer.
- No prescriptive integrations. Features are general and work on local data.
- Claude Code in a real PTY (the full TUI), not `claude -p`.

## Map

```
claude (PTY) ──bytes──▶ host ──append──▶ ~/.tower/sessions/<id>.jsonl ──read──▶ bridge ──▶ renderers
claude hooks ──curl───▶ host ┤  (hooks.sock)
tower mod ────fetch───▶ host ┘
shells (PTY) ◀──────▶ terms ◀──terms.sock──▶ renderers
```

<<<<<<< HEAD
- **host** (`src/host`): detached process that owns every PTY master fd, so sessions survive bridge restarts. Receives hook events on loopback. Appends every fact about a session to its log, a `tower.*` fact about one an earlier host ran too (`fact`, decision `let-go`). Changes to the host kill running sessions (they can be resumed): keep it small and its log format stable. It knows no Claude flags: clients compose them (`src/shared/launch.ts`) and pass them as `spawn` `args`.
- **mod** (`src/mod`): the tower Claude Code mod (plugin `tower`), loaded into every session with `--plugin-dir`. Posts Claude's mod events (turns, tools, usage) and, through the classic hooks its `hooks/hooks.json` declares, Claude's hook events to the host's hooks socket; each Claude reads it as it starts, so changing it needs no host restart. An event under Claude's name carries Claude's payload; what the mod derives is posted under `tower.*`, a namespace Claude's own events don't use. It also teaches each session the tower: `bin/tower` on its PATH (the `tower` command, `src/cli.ts`: the user's verbs `init`, `doctor`, `config check`, `up`, `down`, `update`, `spawn`, `resume`, `submit`, `kill`, `live`, `ls`, `ps`, `reap`, `screen`, `attach`, read from the system root, and `app`, the tower as a Mac app built from the checkout (`src/app.ts`, `apps/macos`, decision `macos-app`); and the workers' verbs in `src/directory.ts`: `whoami`, `agents [--all]`, `agent <CALLSIGN>`, read from the tower's board, `whoami` naming the floor's shelf, its collections and the config's path; `api [name]`, the API's verbs and reads from `/schema`; `probes [run <name>]`, each probe the tower runs and where it stands, `run` reading one now; `keep` and `kept` (the floor's collections: an item kept for later, the items kept); `policies [approve|run]` and `runs` (the floor's policies, where each stands, and a policy's latest runs; `whoami` tells a run what it is) and `read <tag|id>` (an item's contents); `show <file|url>` and `open <url>`, logged as `tower.show` in the worker's own log and drawn beside it; `reveal <path>` and `edit <path> [line]`, a file the system names in the user's Finder or editor (decision `open-files`); `thread`, `note` and `send`, a checkout's review thread; `review`, a reviewer hired in a fork of a worker's checkout; `hire`, a worker started on a prompt, from a kept item or stdin, within the floor's `hiring` limits; `mission` and `phase`, a coordinator's mission declared, moved on and done, facts in its own log (`tower.mission`, `tower.phase`, `tower.mission.done`), and where it stands with who of its crew answered; `agents` lists crews, each worker under the one it reports to, `home` sends a worker home with its crew, and `let-go` takes a worker stranded by the host off duty, still resumable) and three skills: `tower:handbook` (reach a worker with `SendMessage` by its `peer` name; answer review notes), `tower:review` (what a reviewer starts on, `/tower:review <CALLSIGN>`) and `tower:guide` (teaching the user the tower on their own floors, from `docs/usage.md`). Decisions `agent-directory`, `agent-show`, `review-threads`, `reviewer`, `hiring-limits`. Its `opencode/` is the same mod for opencode 2, the harness a spawn asks for with `harness: "opencode"` (the new-worker form's Harness field, which offers the models `opencode models` lists, read onto the board as `opencode`) to run other providers' models: the client composes opencode's whole `argv` and `env` (`src/shared/launch.ts`), each session on its own opencode server (`--standalone`), the plugin directory posts the main loop's events as `opencode.*` and `tower.opencode*`, and the bridge folds them into the same statuses, conversations and facts (decision `opencode-harness`).
- **terms** (`src/terms`, `npm run terms`): detached process that owns shell PTYs started in project dirs, so shells survive renderer restarts and the host stays small. Logs nothing: each shell keeps a bounded in-memory screen, served as a snapshot when a viewer attaches. A shell ends only when killed or when it exits. Protocol in `src/shared/terms.ts`.
- **bridge** (`src/bridge`): pure reductions over logs: session facts and state (a session held by Claude's trust or sign-in screen is `blocked`, read from its output before Claude raises a hook: `src/bridge/blocked.ts`), screen, conversations and resume chains, and the `board` (`src/bridge/board.ts`): the whole system as one view, the contract every renderer and shelf page reads, with who waits on you as waits in the order to go to them (`board.waiting`, decision `attention-list`), and stats (`src/bridge/stats.ts`): spend, work, waits on you, the weekly budget and what landed on each project's default branches (`git log --numstat`, read when asked: `src/landed.ts`) over any window, read at `GET /stats`, today's on `board.today` (decision `stats`). Restart freely.
- **system** (`src/system.ts`): the live view a renderer subscribes to: every log folded into session facts and kept current as the host appends, every probe's stream folded, every collection's items, the host's live set, the terms daemon's shells, leftover processes, and an `onChange`. Renderers draw; this is what they draw from.
- **shared** (`src/shared`): the data model: projects, session headers, log events, and the protocols (host, terms, shelf page). Also what every renderer draws alike: words about cards and what a viewer does about waits and policies' offers (`cards.ts`: `transitions` between boards, round-robin `nextWait` over the `attentionOrder`, dismissals and the ring setting in `tower.store`, the sounds as scores, an offer's its own), any collection's items as trays and reads (`items.ts`, decision `collection-trays`), and the Changes, Reviews, Stats and Policies panels (`panels.ts`: pure views, a stylesheet and the data attributes a renderer wires, decision `shared-panels`). The tower serves each module bundled, as `/<name>.js`.
- **renderers** (`renderers/`): disposable renderers (how a user extends or copies one, and what the core promises them: `docs/extending.md`), each a directory of built files the tower serves at `/r/<name>/`, at its origin, that read the board and drive the system through `/tower.js` (`src/renderers.ts`, decision `renderers-in-config`). The core declares `page`, the tower page, `week`, The Week (a plain page reading the budget week as a yearbook: its totals, every worker by floor, the hours' rhythm, superlatives and a quote, all read from the board, `/stats` and the archives), `comms`, Comms (a plain page of what the workers say to each other with `SendMessage`, a floor at a time and live: channels for all traffic, crews, direct lines and each worker, a network of who talks to whom, and a channel as a chat, with the workers' prompts and answers between the messages when the viewer shows everything (`GET /turns/<project>`), the shared `/comms.js` over `GET /messages/<project>`, texts read from the logs when asked; the floor's `messages` on the board says when to read again, and the tower page's "messages" tray opens it, decision `comms`; and the floor's missions, `floor.missions`, a coordinator and the crew it hired with the phases it declared, drawn as a stepper or a matrix of each member's part, decision `missions`), and `tower3d`, available once `npm run tower3d` has built its `out/`; the config adds its own or overrides their fields, `renderer` picks the one `/` opens, and `GET /renderers` lists them with whether each is built and its `settings`, which the core passes through unread. A project's `html` or `item` shelf page is framed in the tower, or run on its own at `/run/<project>/<n>`; a `renderer` shelf entry frames a declared renderer the same way, its `settings` with it. `tower3d` is a first-person tower with the tower page's full feature set: walk the floors, ride the elevator, sit at a desk to drive its session through a real terminal, with live screens on every monitor, spawn, resume, kill, reap and shells. A reviewer sits beside its author with a notebook, notes new to a worker lie on its desk, each floor's review threads fill a pigeonhole, and the desk panel has Changes (the full diff: fold, Viewed, pick lines with the mouse to note) and Reviews tabs, the same shared panels as the tower page's (decisions `reviewer`, `review-threads`, `shared-panels`). Every workstation is an L dressed from its worker's card with KayKit models (`dress.ts`), and every level has zones placed from the playground's scene documents (`zones.ts`), both drawn on the playground's path (`kit.ts`: its measured meshes, norms and per-pack batches). The city, the building's shell and its roof plant are geometry generated at load (`exterior/`); the lighting (a sun that follows the clock with its shadows, contact shadows and the night's bloom, `light/`) is a setting in its popover, on by default, applied on reload (decision `tower3d-look`). It starts under a loading screen, the elevator's panel lighting a button per stage, and draws nothing until its first board is built and its shaders compiled off the main thread (decision `tower3d-start`). Its TypeScript is bundled into a git-ignored `out/` beside copies of its pages (`npm run tower3d`, or `tower3d:watch`), the root it is served from, with the KayKit models the office uses vendored in `renderers/tower3d/kaykit/` (CC0, `tsx scripts/tower3d-kit.ts vendor <bundle>` refreshes them), the forge's real-size props (a kit of props made for the tower in a repository of its own, CC0) vendored whole from its `dist/` in `renderers/tower3d/forge/` and measured as one more pack, bound by material name (`tsx scripts/tower3d-kit.ts vendor-forge <dist>`, decision `forge-kit`), and its workers KayKit characters on one rig posed by KayKit's clips on the sim clock, packed into `kaykit/Characters/` (`tsx scripts/tower3d-characters.ts`, decision `kaykit-workers`), with parts modelled by hand in a Blender kit beside them, `parts/parts.blend`, each joining a look's slot by its name (`npm run tower3d:parts` exports them to `parts/parts.glb`, `renderers/tower3d/parts/README.md`), measured and built as files into `out/assets/`, which each page fetches as it starts (a renderer's files are served with CORS, so it fetches them framed too; an `html` shelf page's are not, and it fetches nothing beside it: decision `bundled-renderer`). `kaykit` is the KayKit playground: the asset bundle's 628 models (the full bundle, downloaded apart and passed as `--source`) in Tower meters, and scenes as JSON documents (models, prefabs, theme) that agents find, check and render headless through the same page (`npm run tool:kaykit`, `renderers/kaykit/README.md`).
- **tower** (`src/tower`, started detached by `tower up` beside the host and terms, or `npm run tower` in the foreground): two things in one process on `127.0.0.1` at the config's `port` (4317 unless set). The server is the renderer API, part of the core and not disposable; the page is one disposable renderer over it. The server's routes are the API every renderer drives, typed in `src/shared/shelf-page.ts`: commands (`POST /<verb>`), reads, and screen and shell streams multiplexed on one connection per client (`/mux`). The page is one renderer over them. Turns the live system into a sidebar of projects and sessions with the selected terminal filling the main pane (a skyline when none is selected), streams screens to xterm.js, shows what a worker changed in its repos with files marked viewed (`src/changes.ts`, decision `changes-view`), relays spawn/resume/keys/kill to the host, docks shells from the terms daemon as tabs under the main pane, shows shelf entries in the main pane (sandboxed), opens project dirs in the user's editor and links their origin, and notifies and rings when a session starts waiting on you. Runs the probes: every 30 s, a probe due by its stream and the board reads (the quota, while no session's turn reports it) and its read is appended to its stream (`src/probes.ts`, decision `probes`). Runs the policies beside them: each floor's due slots decided (`decide`), checks run from the hub (env scrubbed, killed by pid at 60 s), runs and passes made through the policy verbs (`src/policies.ts`, decision `policies`). Relays the board and every API request of the open `html` or `renderer` shelf page over `postMessage` (pages include `/tower.js`, as does the tower page). The page is built to learn from and throw away: logic a next renderer would need belongs in the bridge, `system.ts`, `shared` or `tower.js`, not in the page.
=======
Each piece, and the kb entity that holds the rest:
>>>>>>> upstream/main

- **host** (`src/host`): owns every PTY, sole writer of the session logs; a change kills running sessions. `host-daemon`
- **mod** (`src/mod`): the Claude Code plugin in every session: posts its events, puts `tower` on its PATH, ships the
  `tower:*` skills. `tower-mod`
- **cli** (`src/cli.ts`, `src/directory.ts`): the `tower` command, the user's verbs and the workers'. `tower-cli`
- **terms** (`src/terms`): owns shell PTYs in project dirs, logs nothing. `terms-daemon`
- **bridge** (`src/bridge`): pure reductions over the logs, the `board` every renderer reads, stats. `log-reductions`
- **system** (`src/system.ts`): the live view a renderer subscribes to. `live-system`
- **shared** (`src/shared`): the data model, the protocols, and what every renderer draws alike, served as
  `/<name>.js`. `data-model`, `renderer-shared-modules`
- **tower** (`src/tower`): the renderer API at the config's `port`, the slot loop, the served modules. `tower-server`,
  `spine`
- **renderers** (`renderers/`): the tower page, The Week and Tower 3D, disposable, served at `/r/<name>/`.
  `renderers-in-config`, `web-tower`, `tower3d`; writing one: `docs/extending.md`
- **extensions** (`extensions/`, `examples/extensions/`): one capability each, a manifest and optional server code.
  `extensions`

State lives in the system root, `~/.tower/` (`system-root`): `config.json` (every key: `docs/config.md`), the logs
(`sessions/`, `streams/`), `collections/`, and `cache/`, which is never authoritative (`logs-are-facts`).

## Knowledge base

`kb/` is the project's working theory: systems, flows, decisions and terms, each backed by refs into the code (schema:
`.claude/skills/kb/SCHEMA.md`). Before changing a part, read its entity: `node .claude/skills/kb/tool/kb.mjs tree`,
then `kb/entities/**/<id>.md`. A change that alters what an entity claims updates it in the same commit, sets its
`reviewed`, and re-renders (`kb.mjs render`). `/kb verify` for a full check; `/kb build` to document something new.

## Code

- TypeScript on Node ≥24, run with `tsx`, checked by `npm run typecheck`, which also checks the JavaScript served as
  written through JSDoc (`tsconfig.client.json`, `tsconfig.page.json`).
- A fresh clone runs with `npm run setup`.
- Tests replay recorded session logs (`test/fixtures/*.jsonl`) through the bridge, check Tower 3D's models against
  their contract, and drive the tower's API over HTTP once (`test/server.test.ts`): `npm test`. Fixtures are real
  sessions recorded in a throwaway system, expectations written by hand from what was observed live. Add a fixture
  when Claude shows a behavior the bridge must handle. No other tests unless asked.
- Agent tools are npm scripts named `tool:<name>`, documented in their script's header. Run `tool:contrast` after any
  change to `design.ts`'s palettes or a new use of a token as text.

## Checking a renderer

On the sandbox, never on the real system and never by stubbing browser input (recipe: `scripts/sandbox.ts`).

- `npm run sandbox -- up` starts your own throwaway system (`/tmp/tower-<callsign>` on a free port) and prints how to
  reach it; `down` stops it.
- **`tower` reads the real system** unless run as `npm run -s sandbox -- run <command>` (several: `run sh <<'SH'` …
  `SH`), which also sets `TOWER_URL`. There, plain `tower agents` refuses: use `tower agents --all`.
- Stop only what you started: `down`, or a PID you saved. Never `pkill`, `killall` or `tower reap`.
- curl: every `POST` needs `-H "origin: $TOWER_URL"`; `/board` and `/screen/<id>` are SSE, so read one event
  (`curl -sN -m 2 … | grep -m1 '^data:'`).
- `npm run drive -- <url> --eval … --shot …` drives headless Chrome; look at every shot.
- A page change touching frames, focus or events also gets a WebKit run: `npm run tool:webkit -- <url> --click x,y …`
  (Safari and Tower.app call no listener inside a frame where nothing runs; Chrome does). The tower page opens a
  session at `/#<id>`; Tower 3D has a door for agents (`window.tower3d`, `renderers/tower3d/src/door.ts`).
- Around any Tower 3D change: `npm run tool:frames -- record before`, change, `record after`, `compare before after`.
  Expect identical on a refactor; look at the PNGs on a visual change.

## Contributing

CI (`.github/workflows/ci.yml`) runs these; run the same before pushing, and leave `git status` clean after them:

- `npm run typecheck`, `npm test`, `npm run tower3d`, `npm run test:tower3d-boot`, `npm run test:page-boot`, and
  `xcrun swiftc -typecheck -swift-version 5 apps/macos/Sources/*.swift` if `apps/macos` changed.
- `node .claude/skills/kb/tool/kb.mjs verify`, and `verify --since origin/main` lists the suspects your commits
  caused: clear each by checking the entity's claims and setting its `reviewed`.
- A served module's exports change: `npm run served:update`. A board shape change: `npm run schema:board`. An API
  addition moves `API_VERSION`'s minor (`src/shared/api.ts`); a removal or rename is a major, and the PR says what
  renderers use instead.
- One concern per commit. A UI change carries screenshots and says what was and wasn't run. A host change says it
  kills running sessions when the host restarts.
- `CHANGELOG.md`, tags and releases are the maintainer's: leave them.

## Who's who

- **The user** is whoever runs this checkout. Code, docs, tests and the kb say "the user" and name no one; a name
  comes from `config.user.name` (decision `the-user`).
- **`kb/`** belongs to the project, and a fork carries it on.
- **A maintainer's personal memory** (session logs, status docs, research) lives outside version control, such as a
  git-ignored folder their global `CLAUDE.md` names. Read its status docs first if it is present; the repo never
  depends on it.
