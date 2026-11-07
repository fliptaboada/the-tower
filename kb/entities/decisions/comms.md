---
{
  "type": "decision",
  "name": "Comms: the workers' messages to each other, read from the logs when asked, drawn as channels by a renderer of their own",
  "summary": "Every message a worker sends another with SendMessage is served with its text, sender and recipient at GET /messages/<project>, read from the senders' logs when asked and never kept; the board carries only each floor's count, which says when to read again. One shared view (the library's /lib/comms.js) draws them as channels (all traffic, crews, direct lines, each worker's), a network of who talks to whom and a channel as a chat, and Comms, a plain renderer at /r/comms/, draws it full screen and live, opened from a floor's messages tray on the tower page.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-30",
  "reviewed": "2026-11-07",
  "refs": [
    "hub/src/bridge/messages.ts#messagesOf",
    "hub/src/bridge/messages.ts#Message",
    "hub/src/bridge/messages.ts#MessageParty",
    "hub/src/bridge/messages.ts#floorMessages",
    "hub/src/bridge/messages.ts#FloorMessages",
    "hub/src/bridge/board.ts#Floor",
    "hub/src/tail.ts#sendEvents",
    "hub/src/tower/http.ts#messages",
    "hub/src/bridge/turns.ts#floorTurnsOf",
    "hub/src/bridge/turns.ts#FloorTurn",
    "hub/src/tail.ts#turnEvents",
    "hub/src/tower/http.ts#turns",
    "hub/src/shared/comms.ts#turnsInChannel",
    "hub/src/shared/missions.ts#turnsInMission",
    "hub/src/shared/shelf-page.ts#Reads",
    "hub/src/tower/tower.js",
    "hub/src/shared/comms.ts#channelsOf",
    "hub/src/shared/comms.ts#inChannel",
    "hub/src/shared/comms.ts#repliesOf",
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
    { "to": "tower-server", "verb": "reads", "carries": "the senders' logs' session.send events, on each GET /messages/<project>" },
    { "to": "brief-turns", "verb": "extends", "carries": "the same sends matched to their receipts, across workers instead of within one" },
    { "to": "agent-directory", "verb": "extends", "carries": "the tower still carries no message: it shows what Claude's session messaging carried" },
    { "to": "renderer-is-disposable", "verb": "follows", "carries": "the read in the core, the view in shared, the renderer only wires it" },
    { "to": "library", "verb": "uses", "carries": "the view as /lib/comms.js, inMission from /lib/board.js, Message and FloorTurn from /lib/client.js" },
    { "to": "markdown-safe", "verb": "uses", "carries": "markdownHtml for each message's text" }
  ]
}
---
**Problem.** Workers talk to each other through Claude Code's session messaging ([[agent-directory]]): a coordinator
briefs a dozen workers and collects their answers, a reviewer tells a hirer the verdict. The logs hold every word
(the sender's `session.send`, the receiver's delivery), but the tower showed only who sent to whom on a card and, in
a brief, one worker's side. Who talked to whom, and what the whole exchange said, was unreadable, though it is what
an experiment with several workers is about.

**Why.** Observe, don't store: the sends and their receipts are already facts, and their matching
([`deliveries`](ref:hub/src/bridge/messages.ts#deliveries)) already names each recipient whatever address was used.
What is missing is a read with the texts and a view over it. Watching an exchange wants the whole screen, live, so it
is a renderer of its own rather than a pane squeezed beside a terminal.

**Decision.**
- *A read, not a fact.* `GET /messages/<project>` ([`messages`](ref:hub/src/tower/http.ts#messages)) answers
  [`messagesOf`](ref:hub/src/bridge/messages.ts#messagesOf): every message a worker of the floor sent or received,
  oldest first, each a [`Message`](ref:hub/src/bridge/messages.ts#Message) with its sender and recipient as
  [`MessageParty`](ref:hub/src/bridge/messages.ts#MessageParty) (callsign, session, floor, the callsign of its
  hirer, and what the session runs on, [`RunsOn`](ref:hub/src/bridge/messages.ts#RunsOn): harness, model and effort,
  drawn as tags beside each worker by [`runsOnHtml`](ref:hub/src/shared/comms.ts#runsOnHtml)) and its text read from the sender's log through
  [`sendEvents`](ref:hub/src/tail.ts#sendEvents). A message no session the tower ran logged has no `to`. Only
  messages a worker sent are listed: one from a Claude the tower doesn't run reaches the brief, not Comms.
- *A count on the board.* Each [`Floor`](ref:hub/src/bridge/board.ts#Floor) carries `messages`
  ([`floorMessages`](ref:hub/src/bridge/messages.ts#floorMessages)): how many its workers sent or received across
  every session, archived ones too, and how many were received. A renderer reads again when it moves.
- *One shared view, in the library.* [`commsHtml`](ref:hub/src/shared/comms.ts#commsHtml) holds the channels
  ([`channelsOf`](ref:hub/src/shared/comms.ts#channelsOf): all traffic, each crew of a hirer and the workers it hired
  while it holds more than one pair and less than all traffic, each direct line, each worker's own), a network of
  who talks to whom ([`networkSvg`](ref:hub/src/shared/comms.ts#networkSvg): a worker in touch with most of the
  others in the middle), and a channel as a chat ([`streamHtml`](ref:hub/src/shared/comms.ts#streamHtml): days
  headed, a sender's run of messages under one face, a direct line's ends on either side, long messages folded, each
  answer's delay and the channel's median from [`repliesOf`](ref:hub/src/shared/comms.ts#repliesOf)). A renderer
  wires `data-comms-channel` and `data-comms-session`. It stays in `src/shared`, one source the core keeps, and
  reaches code outside the core as the library's [`/lib/comms.js`](ref:hub/src/lib/comms.ts) (a fork addition,
  provisional: Comms is its one consumer), the way the Stats, Changes and brief panels do ([[library]]). Moving it
  into the renderer was weighed: served modules keep every export until 2.0, so `/comms.js` would still need the
  source in the core, and the view would live twice. `/comms.js` is served until then, deprecated like every served
  module. The renderer imports only `/lib/` and `/tower.js`: the view from `/lib/comms.js`, `inMission` from
  `/lib/board.js`, the `Message` and `FloorTurn` that its reads answer from `/lib/client.js`.
- *The rest of the run, on request.* Messages are half of an exchange: what each worker was told and what it
  answered are the other half. `GET /turns/<project>` ([`turns`](ref:hub/src/tower/http.ts#turns)) answers
  [`floorTurnsOf`](ref:hub/src/bridge/turns.ts#floorTurnsOf): every prompt the floor's workers were given and every
  answer closing a turn, each a [`FloorTurn`](ref:hub/src/bridge/turns.ts#FloorTurn), read from the logs through
  [`turnEvents`](ref:hub/src/tail.ts#turnEvents). A message from another worker opens a turn too but stays a
  `Message`; the first prompt of a worker hired is its hirer's brief (`by`). The board says nothing new: a renderer
  reads again as the floor's cards' turns and statuses move. The shared view draws them between the messages when
  `full` ([`turnsInChannel`](ref:hub/src/shared/comms.ts#turnsInChannel); a mission's from the prompt its coordinator
  started on, [`turnsInMission`](ref:hub/src/shared/missions.ts#turnsInMission)), dashed apart from the messages and
  folded sooner, with a toggle (`data-comms-full`) between messages only and everything.
- *Comms, a renderer.* `renderers/comms/` is a plain page like The Week, declared by the core
  ([`renderers.ts`](ref:hub/src/renderers.ts)) at `/r/comms/#<project>[/<channel>]`, reading again as the floor's
  `messages` moves and keeping the stream at its end while the viewer reads there. The tower page's floor shows a
  "messages" tray ([`sidebar.js`](ref:hub/renderers/page/sidebar.js)) that opens it. Tower 3D draws none of it yet;
  it would draw the same view.
