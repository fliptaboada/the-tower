---
{
  "type": "decision",
  "name": "Missions: a coordinator says its phases as facts in its own log; the crew, the windows and each member's part are derived",
  "summary": "A worker that coordinates a crew declares a mission (tower mission: a title, its phases in order, drawn as a stepper or a matrix), moves through its phases (tower phase) and ends it (tower mission done): three facts in its own log, posted like tower.show, so the host is unchanged. The bridge derives each floor's missions onto the board: the crew from the cards (a hire joins the mission declared last before it started), the status, and each phase's window; a worker that hired a crew and declared nothing coordinates one mission with no phases. The shared view draws a mission's panel above the crew's messages, and the tower mission command tells the coordinator who of its crew answered in the phase it is in.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-30",
  "reviewed": "2026-10-30",
  "refs": [
    "hub/src/bridge/facts.ts#Mark",
    "hub/src/bridge/facts.ts#MissionView",
    "hub/src/bridge/facts.ts#MISSION",
    "hub/src/bridge/missions.ts#missionsOf",
    "hub/src/bridge/missions.ts#Mission",
    "hub/src/bridge/missions.ts#MissionStatus",
    "hub/src/bridge/board.ts#Floor",
    "hub/src/shared/missions.ts#phaseWindows",
    "hub/src/shared/missions.ts#inMission",
    "hub/src/shared/missions.ts#partsOf",
    "hub/src/shared/missions.ts#phaseTally",
    "hub/src/shared/comms.ts#missionHtml",
    "hub/src/shared/comms.ts#missionsHtml",
    "hub/src/directory.ts#missionLines",
    "hub/src/mod/skills/handbook/SKILL.md",
    "hub/renderers/comms/comms.js"
  ],
  "links": [
    { "to": "comms", "verb": "extends", "carries": "a mission's messages, channels and network, scoped to its crew and window" },
    { "to": "agent-show", "verb": "follows", "carries": "a worker's word about itself as a fact in its own log, through the hooks socket" },
    { "to": "crews", "verb": "uses", "carries": "a coordinator's crew: the workers that report to it, through every hire's own" },
    { "to": "logs-are-facts", "verb": "follows", "carries": "phases are what the coordinator said when; windows and parts are derived" }
  ]
}
---
**Problem.** Workers run experiments together: a coordinator hires a crew, briefs it through rounds, collects
answers, scores them. Comms ([[comms]]) shows every message, but not what stage the work is in, whether it is over, or
who has yet to answer, and a coordinator that runs one experiment after another runs them all as one crew.

**Why.** Only the coordinator knows its stages: they are a fact it states, like a showing ([[agent-show]]). Who is in
it, when each stage ran and who answered in it are computable from the cards and the messages, so they are computed.
How a mission is best drawn depends on its shape, which the coordinator knows too.

**Decision.**
- *Three facts.* `tower mission "<title>" [--matrix] "<phase>"…`, `tower phase "<name>"` and
  `tower mission done ["<summary>"]` post `tower.mission`, `tower.phase` and `tower.mission.done` to the host's hooks
  socket for the worker's own log; the fold keeps them as `marks` ([`Mark`](ref:hub/src/bridge/facts.ts#Mark)). The
  host is unchanged.
- *Missions, derived.* [`missionsOf`](ref:hub/src/bridge/missions.ts#missionsOf) gives each floor's `missions` on the
  board ([`Mission`](ref:hub/src/bridge/missions.ts#Mission)). A declaration runs until the coordinator says done or
  declares the next; a hire belongs to the mission declared last before it started, or the next when that one was
  done. The first phase starts with the declaration unless said later; a phase said but not declared is drawn after
  the declared ones. A coordinator with a crew and no declaration has one mission with no phases, so past crews show
  too. Status ([`MissionStatus`](ref:hub/src/bridge/missions.ts#MissionStatus)): done, ended (another declared after
  it), live (a worker of it on duty), or stopped.
- *Phases over messages.* [`phaseWindows`](ref:hub/src/shared/missions.ts#phaseWindows) runs each reached phase to
  the next reached; [`inMission`](ref:hub/src/shared/missions.ts#inMission) keeps the messages between the mission's
  workers in its window; [`partsOf`](ref:hub/src/shared/missions.ts#partsOf) says, per member and phase, whether it
  was asked, answered and how fast. The same module serves the renderers (through `/comms.js`) and the command.
- *Drawn as the coordinator chose.* [`missionHtml`](ref:hub/src/shared/comms.ts#missionHtml) draws a stepper (each
  phase's span, how many of those asked answered, whom the current one waits on) or a matrix (a row per member, a
  cell per phase opening its line with the coordinator). Anything else the coordinator draws as a page and shows.
  Comms lists the floor's missions ([`missionsHtml`](ref:hub/src/shared/comms.ts#missionsHtml)), opens the latest
  live one, and scopes channels and network to the mission open.
- *The coordinator reads it back.* `tower mission` ([`missionLines`](ref:hub/src/directory.ts#missionLines)) prints
  where its mission stands and, in the phase it is in, whom it waits on. The handbook teaches it.
