/**
 * Missions: a coordinator, the crew it hired and what it said of their work. A worker that declares a mission
 * (`tower mission`) names its title, its phases and how to draw them, says each phase it reaches (`tower phase`) and
 * when it is done (`tower mission done`): facts in its own log (`Mark`). A worker that hired a crew and declared
 * nothing still coordinates one mission, with no phases. Everything else is derived from the cards: who is in it (the
 * crew it hired, each hire in the mission declared last before it started), and whether it is live.
 */
import type { Attention } from './life.ts'
import type { Card } from './board.ts'
import type { Mark, MissionView } from './facts.ts'

/** A worker of a mission: its card, callsign, when it started (epoch ms), whether it is on duty, and its attention. */
export type MissionMember = { id: string; callsign: string; startedAt: number; live: boolean; attention: Attention }

/** A phase of a mission, in the order declared: when the coordinator reached it (the first, when declared, unless said later), unless it hasn't yet. */
export type MissionPhase = { name: string; at?: number }

/** `done`: the coordinator said so; `ended`: it declared another mission after it; `live`: a worker of it is on duty; `stopped`: none is. */
export type MissionStatus = 'live' | 'done' | 'ended' | 'stopped'

/**
 * A mission: its id (the coordinator's card and, once declared, when), title, whether the coordinator declared it, how
 * to draw its phases, the coordinator (`by`) and the crew (`members`), its phases and the one it is in (`phase`), when
 * it started and ended (epoch ms; open while it goes on), what the coordinator said of it done, and its status.
 */
export type Mission = {
  id: string
  title: string
  declared: boolean
  view: MissionView
  by: MissionMember
  members: MissionMember[]
  phases: MissionPhase[]
  phase?: string
  startedAt: number
  endedAt?: number
  summary?: string
  status: MissionStatus
}

const memberOf = (c: Card): MissionMember => ({ id: c.id, callsign: c.callsign, startedAt: Math.min(c.startedAt, ...c.lineage.map((l) => l.startedAt)), live: c.live, attention: c.attention })

/** The crew a worker hired, through every hire's own hires, each worker as it runs now. */
const crewOf = (cards: Card[], c: Card): Card[] =>
  cards.filter((h) => h.reportsTo === c.id && !h.continuedBy).flatMap((h) => [h, ...crewOf(cards, h)])

/** One declared mission, from its declaration to the next (`until`), with the marks between them and its crew. */
function declared(by: Card, at: Extract<Mark, { t: 'mission' }>, marks: Mark[], until: number | undefined, crew: Card[]): Mission {
  const within = marks.filter((m) => m.at >= at.at && (until === undefined || m.at < until))
  const done = within.find((m): m is Extract<Mark, { t: 'done' }> => m.t === 'done')
  const reached = within.filter((m): m is Extract<Mark, { t: 'phase' }> => m.t === 'phase' && (!done || m.at <= done.at))
  const named = [...at.phases, ...reached.map((m) => m.phase).filter((p) => !at.phases.includes(p))]
  const phases = [...new Set(named)].map((name, i): MissionPhase => {
    const mark = reached.findLast((m) => m.phase === name)
    return mark ? { name, at: mark.at } : i === 0 ? { name, at: at.at } : { name }
  })
  const members = crew.map(memberOf)
  const live = by.live || members.some((m) => m.live)
  return {
    id: `${by.id}@${at.at}`,
    title: at.title,
    declared: true,
    view: at.view,
    by: memberOf(by),
    members,
    phases,
    phase: phases.filter((p) => p.at !== undefined).sort((a, b) => a.at! - b.at!).at(-1)?.name,
    startedAt: at.at,
    ...((done || until !== undefined) && { endedAt: done?.at ?? until }),
    ...(done?.summary && { summary: done.summary }),
    status: done ? 'done' : until !== undefined ? 'ended' : live ? 'live' : 'stopped',
  }
}

/**
 * Every mission of the workers on `cards` (every card, the archive's too), newest first. `marksOf`: a session's marks.
 * A hire belongs to the mission declared last before it started, or the first when it started before any; one started
 * after a mission was done, to the next.
 */
export function missionsOf(cards: Card[], marksOf: (session: string) => Mark[]): Mission[] {
  return cards.filter((c) => !c.continuedBy).flatMap((by): Mission[] => {
    const crew = crewOf(cards, by)
    const marks = [...new Set([...by.lineage.map((l) => l.id), by.id])].flatMap(marksOf).sort((a, b) => a.at - b.at)
    const declarations = marks.filter((m): m is Extract<Mark, { t: 'mission' }> => m.t === 'mission')
    if (!declarations.length) {
      if (!crew.length) return []
      const members = crew.map(memberOf)
      const live = by.live || members.some((m) => m.live)
      return [{ id: by.id, title: `${by.callsign}'s crew`, declared: false, view: 'stepper', by: memberOf(by), members, phases: [], startedAt: Math.min(...members.map((m) => m.startedAt)), status: live ? 'live' : 'stopped' }]
    }
    const doneAt = (i: number) => marks.find((m) => m.t === 'done' && m.at >= declarations[i].at && (declarations[i + 1] === undefined || m.at < declarations[i + 1].at))?.at
    const missionOf = (c: Card) => {
      const start = memberOf(c).startedAt
      const last = Math.max(0, declarations.findLastIndex((d) => d.at <= start))
      const done = doneAt(last)
      return done !== undefined && done < start && last + 1 < declarations.length ? last + 1 : last
    }
    return declarations.map((d, i) => declared(by, d, marks, declarations[i + 1]?.at, crew.filter((c) => missionOf(c) === i)))
  }).sort((a, b) => b.startedAt - a.startedAt)
}
