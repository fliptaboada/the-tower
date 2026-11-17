---
{
  "type": "decision",
  "name": "Messages: the tower carries what Claude's SendMessage can't, by callsign, as a bundled extension",
  "summary": "Workers message each other by callsign across runtimes. The bundled messages extension gives opencode workers a SendMessage tool, hands Claude's SendMessage to the tower when Claude can't deliver it (a worker on opencode), and delivers through `messages/send`: the text in an envelope naming the sender, into the receiver's inbox socket, which its runtime's plugin takes in as a prompt once the worker is free; the send is logged as `sent` in the sender's log. A fork addition, rebuilt as an extension on upstream 2.5 after the fork's core version was dropped in the sync.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-16",
  "reviewed": "2026-11-17",
  "refs": [
    "hub/extensions/messages/extension.json",
    "hub/extensions/messages/server.ts",
    "hub/extensions/messages/inbox.ts#towerMessage",
    "hub/extensions/messages/inbox.ts#inboxPath",
    "hub/extensions/messages/inbox.ts#ownInbox",
    "hub/extensions/messages/inbox.ts#Letter",
    "hub/extensions/messages/inbox.ts#listenInbox",
    "hub/extensions/messages/inbox.ts#deliver",
    "hub/extensions/messages/claude/listen.ts",
    "hub/extensions/messages/claude/hooks/register.js",
    "hub/extensions/messages/opencode/index.js",
    "hub/extensions/messages/README.md",
    "hub/src/shared/launch-opencode.ts",
    "hub/src/shared/extensions.ts#BUNDLED"
  ],
  "links": [
    { "to": "extensions", "verb": "uses", "carries": "a verb, a session fact, a launch contributor and a plugin for each runtime" },
    { "to": "opencode", "verb": "extends", "carries": "a SendMessage tool and an inbox its plugin queues on the worker's conversation" },
    { "to": "agent-directory", "verb": "extends", "carries": "Claude's SendMessage, to a callsign Claude knows no session by, delivered through the tower" }
  ]
}
---
**Problem.** Claude's workers reach each other with Claude Code's own `SendMessage` ([[agent-directory]]), which
reaches no opencode session, and opencode has no messages between workers of its own ([[opencode]]). A crew mixing
runtimes, as the lab's do (roles on another model family through opencode), couldn't talk: `tower submit` typed into
a composer, refused while the worker was busy or its composer held text, signed by nothing but its text, and needed a
session id. The fork had carried messages in core (`POST /message`, an inbox in the mod, `tower.message`); the sync to
upstream 2.5 dropped it with the fork's opencode runtime.

**Why an extension.** Upstream 2.5's extensions can do everything it needs: a plugin for each runtime
(`runtimes.<runtime>.plugins`), a verb with a CLI word, a session fact, and a launch contributor for the brief. So it
is one ([[extensions]]: extension before core), bundled so every floor has it, and the core keeps no messages of its
own.

**How.**
- *An inbox per running worker.* The runtime's plugin listens on `<root>/inbox/<session id>.sock`
  ([`inboxPath`](ref:hub/extensions/messages/inbox.ts#inboxPath), from the hooks socket's directory in the session,
  the board's `config` in the server; [`listenInbox`](ref:hub/extensions/messages/inbox.ts#listenInbox)). opencode's
  plugin listens in its own process; Claude's runs [`listen.ts`](ref:hub/extensions/messages/claude/listen.ts) with
  node (Claude's mods API listens on no socket), which prints each message for the module to submit with
  `$.prompt.submit`. Neither refuses a busy worker: Claude takes the prompt in a turn of its own once the running one
  ends, opencode queues it on the conversation. The socket is no stored state: a listener gone leaves a file nothing
  answers on, which the next replaces.
- *The verb.* `messages/send {to, text}` (`tower x messages send <CALLSIGN>`, the text on stdin), from a worker only,
  finds the receiver by callsign (the sender's floor first), wraps the text in an envelope naming the sender
  ([`towerMessage`](ref:hub/extensions/messages/inbox.ts#towerMessage), `<tower-message from="CALLSIGN">`), hands it
  to the receiver's inbox with the conversation its card last entered
  ([`Letter`](ref:hub/extensions/messages/inbox.ts#Letter), [`deliver`](ref:hub/extensions/messages/inbox.ts#deliver)),
  then logs `sent {to, text}` in the sender's log (`tower.x.messages.sent`). It refuses a pair both on Claude Code
  (their own SendMessage connects them, and a refusal Claude meant, the worker gone or a hook's policy, stands), a
  worker not running, a floor where it is off, and a worker with no inbox (`unavailable`, naming `tower submit`).
- *opencode's SendMessage.* Its plugin ([`opencode/index.js`](ref:hub/extensions/messages/opencode/index.js)) adds a
  `SendMessage` tool, `{to, message}` as Claude's, which runs the verb. Its inbox queues each message with
  `ctx.session.prompt` on the conversation the letter names: the plugin runs in opencode's server process, apart from
  the TUI that opens a resumed conversation with `-s`, so it can't tell that one itself, while the tower's card holds
  it from the host's resume fact. The launch contributor adds a line to an opencode worker's brief naming the tool,
  after the core's line saying the runtime has no messaging of its own.
- *Claude's SendMessage, through the tower.* Claude's module
  ([`register.js`](ref:hub/extensions/messages/claude/hooks/register.js)) lets Claude's own SendMessage go first. For
  a name no Claude session carries, the tool answers its own refusal whatever a `session.send` hook returns, so the
  module's `tool.call` hook replaces a refused call's result when `to` is a callsign: the verb's answer, or both
  refusals, in the tool's shape. Claude's peer protocol and its files are never touched.
- *An idle opencode worker loses its inbox unless the user's config says otherwise.* opencode unloads a directory's
  plugins after an hour with no session running, and the inbox with them, until its next prompt. The core's launch
  leaves `experimental.location_idle_timeout` to the user's own `opencode.json` ([[opencode]]), so the extension's
  [README](ref:hub/extensions/messages/README.md) asks for `false` there; without it, a message to a worker idle that
  long is refused `unavailable`, and its next prompt brings the inbox back.

**Not here.** No core read lists the messages: the receiver's log keeps the envelope in its prompt, and the sender's
the `sent` fact, for any later reading (the lab derives its counts from conversations).

**Alternatives considered.**
- *Core, as the fork had it.* It grows the core and conflicts with every upstream sync; extensions now reach every
  surface it needs.
- *`tower submit` for the delivery.* Refused while the worker asks something or its composer holds text, and read as
  the user's turn.
- *A `session.send` hook for Claude's fallback.* Tried first: the tower delivered, but Claude's tool still told the
  model the name was unreachable, its refusal of an unknown name standing after the hooks.
- *The opencode plugin tracking its own main conversation.* A resume's conversation is opened by the TUI process and
  raises nothing until it runs, so a message sent to a freshly resumed worker had nowhere to go.

**Impact.** Workers on Claude and opencode message each other alike by callsign, signed, waiting for the receiver to
be free. A worker that started before the extension was on its floor has no inbox until resumed.
