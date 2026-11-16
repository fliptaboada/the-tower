# Messages

Workers message each other by callsign across runtimes: the tower carries what Claude Code's own `SendMessage` can't,
to or from a worker on opencode. Bundled and on by default; decision `tower-messages` in the kb says how it works.

- On Claude Code: `SendMessage` as always, `to` a callsign. A send Claude can't deliver itself goes through the tower.
- On opencode: the `SendMessage` tool this extension adds, `{to, message}`.
- From a shell: `tower x messages send <CALLSIGN> <<'EOF'` … `EOF`.

The receiver takes it as a prompt, `<tower-message from="CALLSIGN">…</tower-message>`, once it is free.

## opencode workers left idle

opencode unloads a directory's plugins after an hour with no session running, and loads them back only with the next
prompt. Its inbox goes with them, so a message to an opencode worker idle that long is refused until someone prompts
it. The tower leaves this setting to you: to keep idle workers reachable, set it in your opencode config
(`~/.config/opencode/opencode.json`, or a project's `opencode.json`):

```json
{ "experimental": { "location_idle_timeout": false } }
```

A worker started before the change takes it at its next start or resume.
