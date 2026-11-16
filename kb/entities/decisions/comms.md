---
{
  "type": "decision",
  "name": "Comms: the workers' messages to each other, read from the logs when asked, drawn as channels by a renderer of their own",
  "summary": "Every message a worker sends another with Claude's SendMessage is served with its text, sender and recipient at GET /messages/<project>, read from the senders' logs through their runtime's normalizer when asked and never kept; the board carries only each floor's count, which says when to read again. GET /turns/<project> serves the prompts and answers around them. One shared view (the library's /lib/comms.js) draws them as channels, a network of who talks to whom and a channel as a chat, each worker tagged by its runtime's board label, model and effort; Comms, a plain renderer at /r/comms/, draws it full screen and live, opened from a floor's messages tray on the tower page. A fork addition.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-30",
  "reviewed": "2026-11-16",
  "refs": [
    "hub/src/bridge/messages.ts#messagesOf",
    "hub/src/bridge/messages.ts#Message",
    "hub/src/bridge/messages.ts#MessageParty",
    "hub/src/bridge/messages.ts#RunsOn",
    "hub/src/bridge/messages.ts#partiesOf",
    "hub/src/bridge/messages.ts#floorMessages",
    "hub/src/bridge/messages.ts#FloorMessages",
    "hub/src/bridge/normalize.ts#readableEvents",
    "hub/src/bridge/board.ts#Floor",
    "hub/src/tower/http.ts#messages",
    "hub/src/bridge/turns.ts#floorTurnsOf",
    "hub/src/bridge/turns.ts#FloorTurn",
    "hub/src/tower/http.ts#turns",
    "hub/src/shared/comms.ts#turnsInChannel",
    "hub/src/shared/missions.ts#turnsInMission",
    "hub/src/shared/shelf-page.ts#Reads",
    "hub/src/tower/tower.js",
    "hub/src/shared/comms.ts#channelsOf",
    "hub/src/shared/comms.ts#inChannel",
    "hub/src/shared/comms.ts#repliesOf",
    "hub/src/shared/comms.ts#runsOnHtml",
    "hub/src/shared/comms.ts#networkSvg",
    "hub/src/shared/comms.ts#streamHtml",
    "hub/src/shared/comms.ts#commsHtml",
    "hub/src/shared/comms.ts#commsCss",
    "hub/src/renderers.ts",
    "hub/src/lib/comms.ts",
    "hub/renderers/comms/comms.js",
    "hub/renderers/page/sidebar.js",
    "hub/test/messages.test.ts"
  ],
  "links": [
    { "to": "tower-server", "verb": "reads", "carries": "the senders' logs' claude.sent events, normalized, on each GET /messages/<project>; every session's turns on each GET /turns/<project>" },
    { "to": "brief-turns", "verb": "extends", "carries": "the same sends matched to their receipts, across workers instead of within one, and the same turns fold over a whole floor" },
    { "to": "agent-directory", "verb": "extends", "carries": "it shows what Claude's session messaging carried between workers" },
    { "to": "renderer-is-disposable", "verb": "follows", "carries": "the read in the core, the view in shared, the renderer only wires it" },
    { "to": "library", "verb": "uses", "carries": "the view as /lib/comms.js, inMission from /lib/board.js, Message and FloorTurn from /lib/client.js" },
    { "to": "markdown-safe", "verb": "uses", "carries": "markdownHtml for each message's text" }
  ]
}
---
**Problem.** Workers talk to each other through Claude Code's session messaging ([[agent-directory]]): a coordinator
briefs a dozen workers and collects their answers, a reviewer tells a hirer the verdict. The logs hold every word
(the sender's `session.send`, the receiver's `session.receive`), but the tower showed only who sent to whom on a card
and, in a brief, one worker's side. Who talked to whom, and what the whole exchange said, was unreadable, though it is
what an experiment with several workers is about.

**Why.** Observe, don't store: the sends and their receipts are already facts (`Facts.sent`, `Facts.received`, folded
from the normalized `claude.sent` and `claude.received`), and their matching
([`deliveries`](ref:hub/src/bridge/messages.ts#deliveries)) already names each recipient whatever address was used.
What is missing is a read with the texts and a view over it. Watching an exchange wants the whole screen, live, so it
is a renderer of its own rather than a pane squeezed beside a terminal.

**Decision.** A fork addition: its reads, fields and library module say so in their `@since`, and `API_VERSION` stays
upstream's.
- *A read, not a fact.* `GET /messages/<project>` ([`messages`](ref:hub/src/tower/http.ts#messages)) answers
  [`messagesOf`](ref:hub/src/bridge/messages.ts#messagesOf): every message a worker of the floor sent or received,
  oldest first, each a [`Message`](ref:hub/src/bridge/messages.ts#Message) with its sender and recipient as
  [`MessageParty`](ref:hub/src/bridge/messages.ts#MessageParty) ([`partiesOf`](ref:hub/src/bridge/messages.ts#partiesOf):
  callsign, session, floor, the callsign of its hirer, and what the session runs on,
  [`RunsOn`](ref:hub/src/bridge/messages.ts#RunsOn): its runtime as `runtimeOf` names it, a key of `board.runtimes`,
  and its latest model and effort). Its text is read from the sender's log through its runtime's normalizer
  ([`readableEvents`](ref:hub/src/bridge/normalize.ts#readableEvents)), the same reading the fold made, so the n-th
  `claude.sent` is the n-th of `Facts.sent`. A message no session the tower ran logged has no `to`. Only Claude's
  messages are listed: opencode has none between workers ([[opencode]]; `peers` is absent from its runtime's
  features), and another worker reaches it with `tower submit`, whose text the log keeps as a prompt and not as a
  message, so it is left out rather than told apart by a new fact.
- *A count on the board.* Each [`Floor`](ref:hub/src/bridge/board.ts#Floor) carries `messages`
  ([`floorMessages`](ref:hub/src/bridge/messages.ts#floorMessages)): how many its workers sent or received across
  every session, archived ones too, and how many were received. A renderer reads again when it moves.
- *The rest of the run, on request.* Messages are half of an exchange: what each worker was told and what it
  answered are the other half. `GET /turns/<project>` ([`turns`](ref:hub/src/tower/http.ts#turns)) answers
  [`floorTurnsOf`](ref:hub/src/bridge/turns.ts#floorTurnsOf): every prompt the floor's workers were given and every
  answer closing a turn, each a [`FloorTurn`](ref:hub/src/bridge/turns.ts#FloorTurn), folded by the brief's own
  `turnsByConversation` over each runtime's normalized events, so an opencode worker's turns read like Claude's. A
  message from another worker opens a turn too but stays a `Message`; the first prompt of a worker hired is its
  hirer's brief (`by`). The board says nothing new: a renderer reads again as the floor's cards' turns and statuses
  move.
- *One shared view, in the library.* [`commsHtml`](ref:hub/src/shared/comms.ts#commsHtml) holds the channels
  ([`channelsOf`](ref:hub/src/shared/comms.ts#channelsOf): all traffic, each crew of a hirer and the workers it hired
  while it holds more than one pair and less than all traffic, each direct line, each worker's own), a network of
  who talks to whom ([`networkSvg`](ref:hub/src/shared/comms.ts#networkSvg): a worker in touch with most of the
  others in the middle), and a channel as a chat ([`streamHtml`](ref:hub/src/shared/comms.ts#streamHtml): days
  headed, a sender's run of messages under one face, a direct line's ends on either side, long messages folded, each
  answer's delay and the channel's median from [`repliesOf`](ref:hub/src/shared/comms.ts#repliesOf)). Each worker is
  tagged by what it runs on ([`runsOnHtml`](ref:hub/src/shared/comms.ts#runsOnHtml)): its runtime by its
  `board.runtimes` label, then its model and effort. With `full`, the floor's prompts and answers are drawn between
  the messages ([`turnsInChannel`](ref:hub/src/shared/comms.ts#turnsInChannel); a mission's from the prompt its
  coordinator started on, [`turnsInMission`](ref:hub/src/shared/missions.ts#turnsInMission)), dashed apart and
  folded sooner. A renderer wires `data-comms-channel`, `data-comms-session`, `data-comms-mission` and
  `data-comms-full`. The view stays in `src/shared`, one source the core keeps, and reaches code outside the core as
  the library's [`/lib/comms.js`](ref:hub/src/lib/comms.ts) (provisional: Comms is its one consumer), the way the
  Stats, Changes and brief panels do ([[library]]).
- *Comms, a renderer.* `renderers/comms/` is a plain page like The Week, declared by the core
  ([`renderers.ts`](ref:hub/src/renderers.ts)) at `/r/comms/#<project>[/mission/<id>][/<channel>]`, reading again as
  the floor's `messages` moves and keeping the stream at its end while the viewer reads there. It imports only `/lib/`
  and `/tower.js`; whether it shows everything is the viewer's, kept in `tower.store`. The tower page's floor shows a
  "messages" tray ([`sidebar.js`](ref:hub/renderers/page/sidebar.js)) that opens it. Tower 3D draws none of it yet;
  it would draw the same view.
