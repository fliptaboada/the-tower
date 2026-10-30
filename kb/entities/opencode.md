---
{
  "type": "external",
  "name": "opencode",
  "summary": "The opencode TUI (version 2), a second harness run in a real PTY per session for the models of other providers, with its plugins.",
  "in": "tower",
  "reviewed": "2026-10-28",
  "refs": ["hub/src/mod/opencode/index.js", "hub/src/machine.ts#opencodeModels", "hub/test/fixtures/opencode-turns.jsonl"],
  "links": [
    { "to": "host-daemon", "verb": "sends", "carries": "through the tower's opencode plugin, POST /hooks/<id> on hooks.sock: the main loop's opencode.* events (session.inbox.enqueued, session.execution.started/succeeded/interrupted/failed, session.step.started/ended/failed with tokens and cost, session.text.ended, session.compaction.started/ended, tool.execute.before), every session's permission.asked/replied, and tower.opencode / tower.opencode.session" }
  ]
}
---
Started by a spawn with `harness: "opencode"` ([[opencode-harness]]): the config's `opencode.argv`, `--standalone`,
then `--prompt=…` or `--session <id>`. Its whole tower config comes inline in `OPENCODE_CONFIG_CONTENT` (the model,
the plugin, the directories it may reach) and merges with the user's own opencode config, so their providers and
sign-ins (`opencode auth login`) are the session's. The tower lists the models it offers with `opencode models
--standalone` ([`opencodeModels`](ref:hub/src/machine.ts#opencodeModels)).

What it does that the tower leans on, as recorded in the fixtures on opencode 2.2.0: it takes no `--model` (the
config's `model` is the session's); without `--standalone` its TUIs share one background server, started with none of
a session's environment; it loads a plugin only from a directory, listed under `plugins`; `--prompt` submits on a new
session and is ignored with `--session` (the plugin sends a resume's prompt); a turn is an execution that ends
`succeeded`, `interrupted` (Esc, with `reason: user`, or a refused permission) or `failed`; a `/compact` is an execution
of its own; a subagent runs in a session with a `parentID`, and its questions are asked in the main loop's TUI; Esc on
a permission dialog replies `reject`; it exits on the host's SIGHUP; and it allows every action unless a config says
`ask` or `deny`, comparing paths once resolved (on macOS, a path under `/tmp` is outside a cwd given as one).
