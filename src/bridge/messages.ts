/**
 * Who received each message a session sent another Claude session. A message is sent to a name or to a socket
 * (`uds:/tmp/cc-socks/<pid>.sock`, a reply to the `from` of one received), and the receiving session logs it as a
 * prompt: the session that logged the same text is the recipient, whatever the address said. The texts are read from
 * the senders' logs when asked (`messagesOf`), never kept.
 */
import type { Runtime } from '../shared/model.ts'
import type { SessionLog } from '../shared/model.ts'
import { chainsOf, continuations, lineage, namer } from './chains.ts'
import type { Facts, Session } from './facts.ts'

/** A message sent: when (epoch ms), the address it was sent to, and the session that received it, if one did. */
export type Delivery = { at: number; to: string; session?: string }

/** A message received: when (epoch ms), the digest of its text, and the session that sent it. */
export type Receipt = { at: number; digest: number; from: string }

const DELIVERY = /^<cross-session-message [^>]*?from-name="([^"]*)"[^>]*>\n([\s\S]*)\n<\/cross-session-message>$/

/**
 * A message from another Claude session as Claude delivers it, a prompt wrapping the text as sent: the sender's peer
 * name and that text. Other prompts of a peer's origin (a subagent's hand-back) are not one.
 */
export const delivered = (prompt: string): { name: string; text: string } | undefined => {
  const match = DELIVERY.exec(prompt)
  return match ? { name: match[1], text: match[2] } : undefined
}

/** Every message sent, oldest first, matched to the receipt of its text nearest in time. `n`: its place in its sender's `sent`. */
const matched = (sessions: Session[]) => {
  const receipts = Map.groupBy(
    sessions.flatMap(({ header, facts }) => facts.received.map(([at, digest]) => ({ at, digest, session: header.id }))),
    (r) => r.digest,
  )
  const sends = sessions
    .flatMap(({ header, facts }) => facts.sent.map(([at, to, digest], n) => ({ at, to, digest, from: header.id, n })))
    .sort((a, b) => a.at - b.at)
  type Received = { at: number; digest: number; session: string }
  const taken = new Set<Received>()
  return sends.map((send) => {
    const receipt = (receipts.get(send.digest) ?? [])
      .filter((r) => r.session !== send.from && !taken.has(r))
      .reduce<Received | undefined>((best, r) => (!best || Math.abs(r.at - send.at) < Math.abs(best.at - send.at) ? r : best), undefined)
    if (receipt) taken.add(receipt)
    return { send, receipt }
  })
}

/** Every session's sent messages, by session id, oldest first. */
export const deliveries = (sessions: Session[]): Map<string, Delivery[]> =>
  matched(sessions).reduce((bySession, { send, receipt }) =>
    bySession.set(send.from, [...(bySession.get(send.from) ?? []), { at: send.at, to: send.to, ...(receipt && { session: receipt.session }) }]), new Map<string, Delivery[]>())

/** Every session's received messages whose sender is known, by session id, oldest sent first. */
export const receipts = (sessions: Session[]): Map<string, Receipt[]> =>
  matched(sessions).reduce((bySession, { send, receipt }) =>
    receipt ? bySession.set(receipt.session, [...(bySession.get(receipt.session) ?? []), { at: receipt.at, digest: receipt.digest, from: send.from }]) : bySession, new Map<string, Receipt[]>())

/** What a worker runs on: its harness, and the model and effort of its main loop's latest step, once it took one. */
export type RunsOn = { harness: Runtime; model?: string; effort?: string }

/** The `RunsOn` a session's facts hold. */
export const runsOn = ({ harness, model, effort }: Pick<Facts, 'harness' | 'model' | 'effort'>): RunsOn => ({ harness, ...(model && { model }), ...(effort && { effort }) })

/**
 * A worker in a message: its callsign, the session it sent or received it as, its floor, the callsign of the worker that
 * hired it, and what that session runs on.
 */
export type MessageParty = { callsign: string; session: string; project: string; hiredBy?: string } & RunsOn

/**
 * A message between workers: when it was sent (epoch ms), who sent it, the address it was sent to, who received it
 * (none when no session the tower ran logged it), and its text as sent.
 */
export type Message = { at: number; from: MessageParty; address: string; to?: MessageParty; text: string }

/** The texts a session sent other Claude sessions, in the order its facts hold them. */
const sentTexts = ({ events }: SessionLog): string[] =>
  events.flatMap(([, code, data]) => (code === 'h' && data.hook_event_name === 'session.send' ? [String(data.text)] : []))

/** Each session as a `MessageParty`, by id. `callsign`: a session id's (`callsignsOf`). */
export const partiesOf = (sessions: Session[], callsign: (id: string) => string): ((id: string) => MessageParty) => {
  const continued = continuations(sessions, chainsOf(sessions))
  const nameOf = namer(continued, callsign)
  const hirers = new Map(sessions.flatMap((s) => s.facts.hired.map((id) => [id, s] as const)))
  const byId = new Map(sessions.map((s) => [s.header.id, s]))
  return (id) => {
    const s = byId.get(id)!
    const hirer = hirers.get(lineage(s, (x) => continued.get(x))[0].header.id)
    const hiredBy = hirer && nameOf(hirer)
    return { callsign: nameOf(s), session: id, project: s.header.project, ...(hiredBy && { hiredBy }), ...runsOn(s.facts) }
  }
}

/**
 * Every message a worker of `project` sent or received, oldest first, its text read from its sender's log.
 * `callsign`: a session id's (`callsignsOf`).
 */
export const messagesOf = (sessions: Session[], project: string, logOf: (id: string) => SessionLog, callsign: (id: string) => string): Message[] => {
  const partyOf = partiesOf(sessions, callsign)
  const byId = new Map(sessions.map((s) => [s.header.id, s]))
  const ours = matched(sessions).filter(({ send, receipt }) => byId.get(send.from)!.header.project === project || (receipt && byId.get(receipt.session)!.header.project === project))
  const texts = new Map<string, string[]>()
  const textsOf = (id: string) => texts.get(id) ?? texts.set(id, sentTexts(logOf(id))).get(id)!
  return ours.map(({ send, receipt }) => ({
    at: send.at,
    from: partyOf(send.from),
    address: send.to,
    ...(receipt && { to: partyOf(receipt.session) }),
    text: textsOf(send.from)[send.n],
  }))
}

/** How many messages a floor's workers sent or received, and how many of those a session the tower ran received. */
export type FloorMessages = { all: number; delivered: number }

/** Each floor's `FloorMessages`, by project: a floor with none has no entry. */
export const floorMessages = (sessions: Session[]): Map<string, FloorMessages> => {
  const projectOf = new Map(sessions.map((s) => [s.header.id, s.header.project]))
  return matched(sessions).reduce((byProject, { send, receipt }) => {
    for (const project of new Set([projectOf.get(send.from)!, ...(receipt ? [projectOf.get(receipt.session)!] : [])])) {
      const was = byProject.get(project) ?? { all: 0, delivered: 0 }
      byProject.set(project, { all: was.all + 1, delivered: was.delivered + (receipt ? 1 : 0) })
    }
    return byProject
  }, new Map<string, FloorMessages>())
}
