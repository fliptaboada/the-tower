---
{
  "type": "decision",
  "name": "opencode is a second runtime, beside Claude Code",
  "summary": "A spawn may ask for runtime opencode, RUNTIMES' second entry, which runs opencode 2's TUI in the PTY for the models of other providers; the tower's opencode plugin posts its events to the host under opencode.* and tower.opencode*, the bridge folds them into the same statuses, conversations and facts Claude's give, and Claude stays the default and untouched. Workers on either message each other by callsign: the tower delivers what Claude's own SendMessage can't reach to the receiver's inbox, which its runtime takes in as a prompt once the worker is free.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-27",
  "reviewed": "2026-11-15",
  "refs": ["hub/src/shared/launch.ts#opencodeStart", "hub/src/shared/launch.ts#COMPOSERS", "hub/src/shared/launch.ts#hostSpawn", "hub/src/shared/launch.ts#launchOf", "hub/src/shared/model.ts#RUNTIMES", "hub/src/shared/model.ts#runtimeConfig", "hub/src/shared/opencode.ts#OPENCODE_TESTED", "hub/src/bridge/defaults.ts#runtimeDefaults", "hub/src/shared/spawn-form.ts#runtimeFieldsHtml", "hub/src/machine.ts#MODEL_LISTS", "hub/src/tower/dispatch.ts#message", "hub/src/shared/model.ts#runtimeCommands", "hub/src/mod/opencode/index.js", "hub/src/bridge/status.ts#opencodeStatus", "hub/src/shared/protocol.ts#ToHost", "hub/src/bridge/facts.ts#initialFacts", "hub/src/machine.ts#opencodeModels", "hub/test/opencode.test.ts", "hub/test/fixtures/opencode-turns.jsonl", "hub/test/fixtures/opencode-resumed.jsonl", "hub/test/fixtures/opencode-named.jsonl", "hub/test/fixtures/opencode-named-resumed.jsonl", "hub/src/shared/launch.ts#RUNS_AS", "hub/src/bridge/chains.ts#runsAs", "hub/src/mod/inbox.ts#listenInbox", "hub/src/shared/inbox.ts#towerMessage", "hub/src/shared/inbox.ts#fromTowerMessage", "hub/src/shared/paths.ts#inboxPath", "hub/src/machine.ts#deliverMessage", "hub/src/mod/hooks/register.js#takeMessages", "hub/src/mod/hooks/register.js#throughTower", "hub/src/bridge/facts.ts#isSent", "hub/test/tower-message.test.ts", "hub/test/fixtures/tower-message-claude.jsonl", "hub/test/fixtures/tower-message-opencode.jsonl"]
}
---
**Problem.** Workers on models other than Claude's (OpenAI's through a ChatGPT subscription, local models, any
provider) should sit on the same floors as Claude's, drawn and driven the same way. Claude Code runs only Claude's
models, and a Claude subscription can't be used from another harness.

**Why opencode.** It is a full TUI for a real PTY like Claude's, it continues a session by id (`--session`), it takes
its whole config inline (`OPENCODE_CONFIG_CONTENT`), and its plugins see what the tower needs: every event of a
session (each prompt taken in, each execution's start and end, each model step with its tokens and cost, each answer's
text, compactions, permission questions and replies), each tool call, the environment of its shells and the system
prompt of each request. The tower targets opencode 2, the current major, whose plugin API replaced version 1's.

**How.**
- *opencode is a runtime.* It is the second entry of `RUNTIMES` ([`RUNTIMES`](ref:hub/src/shared/model.ts#RUNTIMES)),
  on 2.0's runtime seam: its command is the config's `runtimes.opencode.argv` (`["opencode"]` unless set:
  [`runtimeConfig`](ref:hub/src/shared/model.ts#runtimeConfig), with the config's `env`), its plugins
  `runtimes.opencode.plugins`. `runtime: "opencode"` on a spawn (the API, `tower spawn --runtime opencode`,
  `tower hire runtime opencode`, a policy's `hire`, or the new-worker form's Runtime field, whose Model and Effort then
  offer the runtime's listed models and the picked model's variants:
  [`runtimeFieldsHtml`](ref:hub/src/shared/spawn-form.ts#runtimeFieldsHtml), redrawn by the shared dialog) runs the
  session on it (`header.runtime`), and the launch composes each runtime its own way
  ([`COMPOSERS`](ref:hub/src/shared/launch.ts#COMPOSERS)): [`opencodeStart`](ref:hub/src/shared/launch.ts#opencodeStart)
  puts, after opencode's command, `--standalone`, the prompt as `--prompt=…`, its own env (the inline config and the
  brief) over the command's, the model as the inline config's `model`, and `effort`, one of that model's variants, as
  the model of the `build` agent a session starts in (`provider/model#variant`: the root `model` keeps no variant). A
  resume keeps the runtime its source ran ([[log-reductions]]: `facts.runtime`, the header's, or opencode once the
  plugin's `tower.opencode` says so for a log from before the header named it), with `--session <id>`, and
  [`launchOf`](ref:hub/src/shared/launch.ts#launchOf) reads an argv back the way its runtime composed it.
- *The board describes it.* `board.runtimes.opencode` carries its label, the releases it is tested on
  ([`OPENCODE_TESTED`](ref:hub/src/shared/opencode.ts#OPENCODE_TESTED)) and its `models`; renderers, Comms among
  them, name a worker's runtime by `board.runtimes[card.runtime].label`, never by comparing its id. Its defaults stay
  unknown: its argv says nothing of the model a spawn asked for ([`runtimeDefaults`](ref:hub/src/bridge/defaults.ts#runtimeDefaults)).
- *The worker's name is a fact.* opencode takes no `--name`, so `opencodeStart` adds `tower.runs-as {name}`
  ([`RUNS_AS`](ref:hub/src/shared/launch.ts#RUNS_AS)) to the facts the host logs before the session's first event, on
  every spawn and resume: the [[callsign]] a spawn typed, or the one drawn. The bridge folds it into `facts.runsAs`,
  which [`runsAs`](ref:hub/src/bridge/chains.ts#runsAs) reads where Claude's argv has no `--name`, so the card,
  `tower agents`, `tower message` and a resume name the worker alike; a log from before it takes its id's callsign.
- *The models are opencode's.* The tower asks opencode's API for its models (`opencode api model.list`, the list
  `opencode models` prints, with each model's variants) every minute while a renderer watches
  ([`opencodeModels`](ref:hub/src/machine.ts#opencodeModels), the one entry of
  [`MODEL_LISTS`](ref:hub/src/machine.ts#MODEL_LISTS)) and puts the list on the board
  (`board.runtimes.opencode.models`, a `BoardRuntime` addition), or why it couldn't ask; `tower hire` refuses a model
  a runtime that lists its models doesn't list, or an effort the model doesn't run at.
- *Each session runs its own server.* `--standalone` keeps opencode 2's TUI off the background server it otherwise
  shares between its TUIs, which loads plugins with the environment it was started with: a session's own server
  loads the plugin with the session's (`TOWER_SESSION_ID`, the hooks socket, the brief).
- *The plugin stays loaded while the worker lives.* opencode unloads a directory's services, plugins among them,
  once it has gone `experimental.location_idle_timeout` (an hour unless set) with no session running, and loads them
  back only with the next prompt. The plugin's cleanup closes the worker's inbox, so a worker left idle for an hour took
  no messages until someone typed into it. The inline config sets the timeout `false`, opencode's "never unload":
  the plugin, its inbox and its event posts last as long as the session.
- *The host runs the command whole.* Since `HOST_PROTOCOL` 5 every spawn is a whole `argv` and `env` the tower
  composes, scrubbed by the host ([[env-scrub]]), and `runtime` a label it copies to the header: the host knows no
  harness ([[host-owns-ptys]]). [`hostSpawn`](ref:hub/src/shared/launch.ts#hostSpawn) puts a start's own args after
  its command for either runtime: Claude's begin with the tower mod's `--plugin-dir` (the start's `mod`), opencode's
  carry it in their inline config. An opencode session loads the plugins of `runtimes.opencode.plugins` and the
  extensions' (`runtimes.opencode.plugins` of a manifest), beside the tower's. The host needed no change for it.
- *The plugin is the mod.* The inline config lists the directory [`src/mod/opencode`](ref:hub/src/mod/opencode/index.js)
  under `plugins`, and allows the session's other directories, the floor's kept items and a worktree's link sources,
  should the user's config ask about paths outside the cwd. It posts the main loop's events (a session with a parent
  is a subagent's, left out, but for its permission questions, which the main loop's TUI asks) in order to the hooks
  socket, puts `bin/tower` on its shells' PATH, adds the brief (`TOWER_BRIEF`, worded for a worker with no Claude
  skills: `tower handbook`, and the plugin's `SendMessage`), and sends a resume's prompt itself, since the TUI leaves
  `--prompt` unsent with `--session`.
- *Workers message each other through the tower.* Claude's workers reach each other with Claude Code's own
  `SendMessage`, which reaches no opencode session ([[agent-directory]]). The tower carries the rest, by callsign:
  - *A worker's inbox.* Every running worker's harness listens on `<root>/inbox/<session id>.sock`
    ([`inboxPath`](ref:hub/src/shared/paths.ts#inboxPath), [`listenInbox`](ref:hub/src/mod/inbox.ts#listenInbox)):
    the opencode plugin in its own process, queueing each message on the main loop's session with
    `ctx.session.prompt`; Claude's mod through a child it starts with node at `session.start` (Claude's mods API
    listens on no socket), which prints each message for the mod to submit with `$.prompt.submit`
    ([`takeMessages`](ref:hub/src/mod/hooks/register.js#takeMessages)). Neither is refused while the worker is busy:
    Claude takes it in a turn of its own once the running one ends, opencode's running execution at its next step.
    The socket is no stored state: a listener gone leaves a file nothing answers on, which the next one replaces.
  - *The `message` verb.* `POST /message {id, text}` ([`message`](ref:hub/src/tower/dispatch.ts#message)), from a
    worker only, wraps the text in an envelope naming the sender's callsign
    ([`towerMessage`](ref:hub/src/shared/inbox.ts#towerMessage), `<tower-message from="CALLSIGN">`), hands it to the
    receiver's inbox ([`deliverMessage`](ref:hub/src/machine.ts#deliverMessage)), then logs `tower.message {to, text}`
    in the sender's log. A worker whose harness doesn't listen (started before this) is refused `not_listening`, with
    `submit` named instead. `tower message <CALLSIGN>` sends one from a shell.
  - *Each harness's SendMessage.* The opencode plugin adds a `SendMessage` tool, `{to, message}` as Claude's, which
    runs `tower message` and so reaches any worker by callsign. Claude's mod lets Claude's own SendMessage go first: a
    name it knows no session by is answered `{success: false}` before any `session.send` delivery, and the mod's
    `tool.call` hook ([`throughTower`](ref:hub/src/mod/hooks/register.js#throughTower)) then hands it to
    `tower message`, answering with the tower's result in the tool's shape. Claude's peer protocol and its key files are
    never touched.
  - *The receiver's log names the sender.* The envelope is in the prompt the receiver logs: opencode's inbox item
    whole, Claude's `turn.start` inside Claude's words around a plugin's prompt (a mod's own `$.prompt.submit` raises
    no `prompt.submit` the mod hears, so a turn that starts with no prompt announced, `Facts.announced`, is read for
    one). The bridge reads it as a peer's prompt and a receipt ([[log-reductions]]), matched by digest to the sender's
    `tower.message`; Claude's `session.send` now logs Claude's own `result`, and one Claude refused is no message.
- *The bridge reads both.* An opencode session is a conversation; a prompt taken into its inbox opens a turn, which
  is `working` from its execution's start; `succeeded` ends it `done`, `interrupted` (Esc, or a refused permission, as
  a denied permission in Claude) `idle`, `failed` `failed` ([`opencodeStatus`](ref:hub/src/bridge/status.ts#opencodeStatus)).
  A `/compact` is a manual compaction from its start to its end, after which the worker is `idle`. Each model step
  counts its tokens and its cost as spend; each answer's text is what the worker says and the conversation's answer.
  Cards carry `runtime` (`facts.runtime`), so a brief's answers and Comms' tags are named by the runtime's label.
  `tower agents` and `whoami` say a worker with no Claude peer name is messaged by its callsign, through the tower.

**Rebuilt on runtimes (2.1).** The fork first shipped this as a `harness` beside Claude's arguments, with a top-level
`opencode` config key, a `board.opencode` models list, and its own host spawn for host protocol 3. Upstream 2.0 renamed
everything Claude-named to runtimes so a provider like this one could arrive as a minor; the feature was rebuilt on
that seam rather than restored: `runtime` in place of `harness` on a spawn, a hire and a policy, the command under
`runtimes.opencode`, the models on the runtime's board entry, and the launch composed per runtime.

**Alternatives considered.**
- *The plugin posts Claude's event names.* Rejected: a log says what happened, under the name of what raised it;
  the bridge reads opencode's names beside Claude's.
- *opencode 1 too.* Rejected: its plugins don't run in opencode 2 nor 2's in it, its events are other ones, and
  `--standalone` is unknown to it; the tower follows the current major.
- *opencode's background server, shared by every session.* Rejected: it is started once, with none of a session's
  environment, so its plugin can't tell whose events it sees or reach the host for them.
- *`opencode serve` and its event stream, read by the tower.* Not needed: the plugin sees the same events in the
  session's own process, in order, through the hooks socket every harness already reaches.
- *Codex CLI.* Its hooks and session model didn't cover what the bridge reads; opencode reaches Codex's models too.
- *Messages typed into the composer (`tower submit`), as before.* The receiver saw a user's turn, signed only by its
  text; it was refused while the worker asked something or its composer held text; and the sender had to look up a
  session id.
- *A local MCP server for the opencode tool, listed in the inline config.* A process per session for one tool: opencode
  2's plugins add tools themselves (`ctx.tool.transform`, a Standard Schema input), in the process that already knows
  the session.
- *A PreToolUse hook on Claude's SendMessage, or its `session.send`.* A classic hook can only deny, so Claude would read
  a refusal for a delivered message; and the tool answers an unknown name before `session.send` is raised. The mods
  API's `tool.call` answers the call itself.
- *The tower holds each listener (an SSE stream the harness opens).* The tower would keep who listens in memory, and
  every tower restart would cut every inbox until it reconnects. The socket belongs to the session, as its PTY does.
- *`tower.prompt` (`PROMPTED_BY`) logged on the receiver before delivery, as `submit` does.* It names the next prompt
  typed in the composer; a message that waits for the turn to end would race any prompt typed meanwhile. The envelope
  names the sender in the receiver's own prompt, read with no race, and the turn's `from` names the worker.

**Impact.** A floor holds Claude and opencode workers side by side, with the same statuses, waits, briefs, resumes,
compactions, `tower show`, `tower keep` and hires. What opencode doesn't report stays empty for its workers: the rate
limits and weekly budget (Claude's), context size, a blocking screen at start, subagent runs, `watching`.
