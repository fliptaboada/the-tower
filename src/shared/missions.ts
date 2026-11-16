/**
 * What a mission's messages say of its phases, the same for every renderer and the `tower mission` command: a phase
 * runs from when the coordinator reached it to the next phase reached, or the mission's end. In each, a crew member was
 * asked (sent a message) and answered (sent one), or neither. Pure, over a `Mission` from the board and the floor's
 * messages (`GET /messages/<project>`).
 */
import type { Message } from '../bridge/messages.ts'
import type { Mission } from '../bridge/missions.ts'
import type { FloorTurn } from '../bridge/turns.ts'

/** A phase as drawn: its name, its window (epoch ms; `to` open while it is the current one), and where it stands. */
export type PhaseWindow = { name: string; from?: number; to?: number; state: 'done' | 'current' | 'upcoming' }

/** The mission's phases in the order declared, each with its window. */
export const phaseWindows = (m: Mission): PhaseWindow[] => {
  const reached = m.phases.filter((p) => p.at !== undefined).sort((a, b) => a.at! - b.at!)
  return m.phases.map(({ name, at }) => {
    if (at === undefined) return { name, state: 'upcoming' }
    const next = reached.find((p) => p.at! > at)
    const current = name === m.phase && m.status !== 'done'
    return { name, from: at, ...((next || m.endedAt !== undefined) && { to: next?.at ?? m.endedAt }), state: current ? 'current' : 'done' }
  })
}

/** Every worker of a mission, its coordinator first, by callsign. */
export const missionCallsigns = (m: Mission) => [m.by.callsign, ...m.members.map((w) => w.callsign)]

/** The mission's messages: between two of its workers, from the first of them starting to the mission's end. */
export const inMission = (messages: Message[], m: Mission): Message[] => {
  const who = new Set(missionCallsigns(m))
  const from = Math.min(m.startedAt, ...m.members.map((w) => w.startedAt))
  return messages.filter((x) => who.has(x.from.callsign) && x.to && who.has(x.to.callsign) && x.at >= from && (m.endedAt === undefined || x.at <= m.endedAt))
}

/**
 * The mission's prompts and answers (`GET /turns/<project>`): its workers', in the same span as its messages, from the
 * prompt its coordinator started it on.
 */
export const turnsInMission = (turns: FloorTurn[], m: Mission): FloorTurn[] => {
  const who = new Set(missionCallsigns(m))
  const start = Math.min(m.startedAt, ...m.members.map((w) => w.startedAt))
  const from = turns.findLast((t) => t.worker.callsign === m.by.callsign && t.kind === 'prompt' && t.at <= start)?.at ?? start
  return turns.filter((t) => who.has(t.worker.callsign) && t.at >= from && (m.endedAt === undefined || t.at <= m.endedAt))
}

/** A crew member's part in a phase: it sent a message (`answered`), only got one (`asked`), or neither (`quiet`). */
export type Part = { state: 'answered' | 'asked' | 'quiet'; sent: number; got: number; answeredIn?: number }

/** Each crew member's part in each phase reached, by callsign then phase. */
export const partsOf = (m: Mission, messages: Message[]): Map<string, Map<string, Part>> => {
  const ours = inMission(messages, m)
  const windows = phaseWindows(m).filter((w) => w.from !== undefined)
  return new Map(m.members.map((w) => [w.callsign, new Map(windows.map((p) => {
    const within = ours.filter((x) => x.at >= p.from! && (p.to === undefined || x.at < p.to))
    const sent = within.filter((x) => x.from.callsign === w.callsign)
    const got = within.filter((x) => x.to!.callsign === w.callsign)
    const answeredIn = got.length && sent.length && sent[sent.length - 1].at > got[0].at ? sent.find((x) => x.at > got[0].at)!.at - got[0].at : undefined
    return [p.name, { state: sent.length ? 'answered' : got.length ? 'asked' : 'quiet', sent: sent.length, got: got.length, ...(answeredIn !== undefined && { answeredIn }) }] as const
  }))]))
}

/** How a phase went: its messages, and how many of the crew it asked answered. */
export const phaseTally = (parts: Map<string, Map<string, Part>>, phase: string) => {
  const of = [...parts.values()].map((p) => p.get(phase)).filter((p) => p !== undefined)
  return { answered: of.filter((p) => p.state === 'answered').length, asked: of.filter((p) => p.state !== 'quiet').length }
}
