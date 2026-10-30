---
{
  "type": "decision",
  "name": "opencode is a second harness, beside Claude Code",
  "summary": "A spawn may ask for harness opencode, which runs opencode 2's TUI in the PTY for the models of other providers; the tower's opencode plugin posts its events to the host under opencode.* and tower.opencode*, the bridge folds them into the same statuses, conversations and facts Claude's give, and Claude stays the default and untouched.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-27",
  "reviewed": "2026-10-30",
  "refs": ["hub/src/shared/launch.ts#opencodeRequest", "hub/src/mod/opencode/index.js", "hub/src/bridge/status.ts#opencodeStatus", "hub/src/shared/protocol.ts#ToHost", "hub/src/tower/server.ts#runRefused", "hub/src/machine.ts#opencodeModels", "hub/src/shared/cards.ts#modelOptionsHtml", "hub/src/shared/cards.ts#effortOptionsHtml", "hub/test/opencode.test.ts", "hub/test/fixtures/opencode-turns.jsonl", "hub/test/fixtures/opencode-resumed.jsonl"]
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
- *The harness is asked for.* `harness: "opencode"` on a spawn (the new-worker form's Harness field, the API,
  `tower spawn --harness opencode`, `tower hire harness opencode`, a policy's `hire`) picks
  [`opencodeRequest`](ref:hub/src/shared/launch.ts#opencodeRequest) over Claude's arguments: the config's
  `opencode.argv` (`["opencode"]` unless set), `--standalone`, the prompt as `--prompt=…`, the model as the inline
  config's `model`, and `effort`, one of that model's variants, as the model of the `build` agent a session starts in
  (`provider/model#variant`: the root `model` keeps no variant). A resume keeps the harness its source ran ([[log-reductions]]:
  `facts.harness`, from the plugin's `tower.opencode`), with `--session <id>`.
- *The models are opencode's.* The tower asks opencode's API for its models (`opencode api model.list`, the list
  `opencode models` prints, with each model's variants) every minute while a renderer watches
  ([`opencodeModels`](ref:hub/src/machine.ts#opencodeModels)) and puts the list on the board (`opencode`), or why it
  couldn't ask. The form offers them once opencode is picked ([`modelOptionsHtml`](ref:hub/src/shared/cards.ts#modelOptionsHtml)),
  and the model picked's variants as its efforts ([`effortOptionsHtml`](ref:hub/src/shared/cards.ts#effortOptionsHtml));
  `tower hire` refuses a model opencode doesn't list, or an effort the model doesn't run at.
- *Each session runs its own server.* `--standalone` keeps opencode 2's TUI off the background server it otherwise
  shares between its TUIs, which loads plugins with the environment it was started with: a session's own server
  loads the plugin with the session's (`TOWER_SESSION_ID`, the hooks socket, the brief).
- *The host runs the command whole.* A spawn's `argv` replaces the config's Claude command and the mod's
  `--plugin-dir`, and its `env` is added after the config's, scrubbed alike ([[env-scrub]]); `HOST_PROTOCOL` 3. The
  host still knows no harness: it runs what the client composes ([[host-owns-ptys]]). A tower facing an older host
  refuses an opencode spawn or resume ([`runRefused`](ref:hub/src/tower/server.ts#runRefused)), which would start
  Claude instead.
- *The plugin is the mod.* The inline config lists the directory [`src/mod/opencode`](ref:hub/src/mod/opencode/index.js)
  under `plugins`, and allows the session's other directories, the floor's kept items and a worktree's link sources,
  should the user's config ask about paths outside the cwd. It posts the main loop's events (a session with a parent
  is a subagent's, left out, but for its permission questions, which the main loop's TUI asks) in order to the hooks
  socket, puts `bin/tower` on its shells' PATH, adds the brief (`TOWER_BRIEF`, worded for a worker with no
  `SendMessage` and no skills: `tower submit` and `tower handbook`), and sends a resume's prompt itself, since the TUI
  leaves `--prompt` unsent with `--session`.
- *The bridge reads both.* An opencode session is a conversation; a prompt taken into its inbox opens a turn, which
  is `working` from its execution's start; `succeeded` ends it `done`, `interrupted` (Esc, or a refused permission, as
  a denied permission in Claude) `idle`, `failed` `failed` ([`opencodeStatus`](ref:hub/src/bridge/status.ts#opencodeStatus)).
  A `/compact` is a manual compaction from its start to its end, after which the worker is `idle`. Each model step
  counts its tokens and its cost as spend; each answer's text is what the worker says and the conversation's answer.
  Cards carry `harness`, and a brief's sessions too, so an answer is named for the harness that gave it.

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

**Impact.** A floor holds Claude and opencode workers side by side, with the same statuses, waits, briefs, resumes,
compactions, `tower show`, `tower keep` and hires. What opencode doesn't report stays empty for its workers: the rate
limits and weekly budget (Claude's), context size, a blocking screen at start, subagent runs, `watching`.
