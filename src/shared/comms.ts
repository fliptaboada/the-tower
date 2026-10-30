/**
 * Workers' messages to each other (`SendMessage`) as every renderer draws them, read at `GET /messages/<project>`:
 * channels over them (all traffic, each crew a room of a hirer and the workers it hired, each pair of workers a
 * direct line, each worker's own traffic), a network of who talks to whom, and a channel's messages as a chat, oldest
 * at the top. Pure views from plain data to html, with one stylesheet (`commsCss`, beside `markdownCss`). The tower
 * serves it as `/comms.js`.
 *
 * A long message folded to its start has an `<input type="checkbox" data-expand="<key>">` that shows it all
 * (`expandedMessages` reads them back, pure CSS). A renderer wires:
 *
 *   data-comms-channel="<key>"    show that channel (`channelsOf`): the network's workers and lines name theirs too
 *   data-comms-session="<id>"     the session a worker sent or received a message as, to open it
 *   data-comms-mission="<id>"     open that mission of the floor's (`board` `floor.missions`), its messages alone; `""` the whole floor
 *
 * A mission's panel draws its phases as a stepper or a matrix, as its coordinator declared (`tower mission`,
 * `src/shared/missions.ts`). The times that run while a live mission goes on are `[data-since]`: a renderer counts them
 * on each second with `tickComms`.
 */
import type { Message, MessageParty } from '../bridge/messages.ts'
import type { Mission, MissionStatus } from '../bridge/missions.ts'
import { ago, esc, plural } from './cards.ts'
import { inMission, partsOf, phaseTally, phaseWindows, type Part } from './missions.ts'

export { inMission, missionCallsigns, partsOf, phaseTally, phaseWindows } from './missions.ts'

export type ChannelKind = 'all' | 'crew' | 'dm' | 'worker'

/** A channel: its key, what it is, its name, the callsigns in it, how many messages it holds and when the latest was sent. */
export type Channel = { key: string; kind: ChannelKind; label: string; members: string[]; count: number; last: number }

export const ALL_CHANNEL = 'all'

/** Who a message reached: its recipient's callsign, else the name it was addressed to, else none (a socket no worker logged). */
export const recipientOf = (m: Message): string | undefined => m.to?.callsign ?? (m.address.startsWith('uds:') ? undefined : m.address)

/** The two callsigns of a direct line, in order: its key. */
export const dmKey = (a: string, b: string) => `dm:${[a, b].sort().join('|')}`

/** The worker at the top of each callsign's crew, through the hirers the messages name. */
const crewRoots = (messages: Message[]): Map<string, string> => {
  const hirer = new Map<string, string>()
  for (const p of messages.flatMap((m) => [m.from, ...(m.to ? [m.to] : [])])) if (p.hiredBy) hirer.set(p.callsign, p.hiredBy)
  const rootOf = (c: string, seen = new Set<string>()): string => (hirer.has(c) && !seen.has(c) ? rootOf(hirer.get(c)!, seen.add(c)) : c)
  return new Map([...new Set(messages.flatMap((m) => [m.from.callsign, ...(m.to ? [m.to.callsign] : [])]))].map((c) => [c, rootOf(c)]))
}

/** The channels a message is in: all of them, its crew's when both ends are in one, its pair's, and each end's. */
const channelKeys = (m: Message, roots: Map<string, string>): string[] => {
  const to = recipientOf(m)
  const from = m.from.callsign
  const crew = m.to && roots.get(from) === roots.get(m.to.callsign) && roots.get(from) !== undefined ? [`crew:${roots.get(from)}`] : []
  return [ALL_CHANNEL, ...crew, ...(to ? [dmKey(from, to), `worker:${to}`] : []), `worker:${from}`]
}

/** A channel's name. */
const labelOf = (key: string) => {
  const [kind, rest] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
  return key === ALL_CHANNEL ? 'all traffic' : kind === 'crew' ? `${rest}'s crew` : kind === 'dm' ? rest.split('|').join(' ↔ ') : rest
}

/**
 * Every channel the messages make: all traffic first, then the crews, the direct lines and the workers, each kind
 * busiest first. A crew is a room only when it holds more than one pair, and less than all traffic.
 */
export const channelsOf = (messages: Message[]): Channel[] => {
  const roots = crewRoots(messages)
  const byKey = new Map<string, { members: Set<string>; count: number; last: number }>()
  for (const m of messages)
    for (const key of channelKeys(m, roots)) {
      const c = byKey.get(key) ?? { members: new Set<string>(), count: 0, last: 0 }
      c.members.add(m.from.callsign)
      const to = recipientOf(m)
      if (to) c.members.add(to)
      byKey.set(key, { ...c, count: c.count + 1, last: Math.max(c.last, m.at) })
    }
  const all: Channel[] = [...byKey].map(([key, c]) => ({ key, kind: (key === ALL_CHANNEL ? 'all' : key.slice(0, key.indexOf(':'))) as ChannelKind, label: labelOf(key), members: [...c.members].sort(), count: c.count, last: c.last }))
  const pairs = (c: Channel) => all.filter((d) => d.kind === 'dm' && d.members.every((x) => c.members.includes(x))).length
  const order: ChannelKind[] = ['all', 'crew', 'dm', 'worker']
  return all.filter((c) => c.kind !== 'crew' || (pairs(c) > 1 && c.count < messages.length)).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.count - a.count || a.label.localeCompare(b.label))
}

/** The messages of a channel, oldest first. */
export const inChannel = (messages: Message[], key: string): Message[] => {
  const roots = crewRoots(messages)
  return messages.filter((m) => channelKeys(m, roots).includes(key))
}

/** Whether a message holds every word, in its text or either end's callsign. */
const matching = (m: Message, words: string[]) => {
  const hay = `${m.text}\n${m.from.callsign}\n${recipientOf(m) ?? ''}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

/** A hue for a callsign, the same in every renderer and on every load. */
export const hueOf = (callsign: string) => [...callsign].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 360

/** A message's key, for its fold: its sender's session and when it was sent. */
const messageKey = (m: Message) => `${m.from.session}:${m.at}`

/** The long messages a viewer showed in full in a drawn stream, by key. */
export const expandedMessages = (root: ParentNode | null | undefined): Set<string> =>
  new Set([...(root?.querySelectorAll<HTMLInputElement>('input[data-expand]:checked') ?? [])].map((el) => el.dataset.expand!))

/** The middle of a sorted list of times. */
const median = (xs: number[]) => {
  const s = xs.toSorted((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : undefined
}

/** Longer after a message than an answer to it comes: a message later starts something new. */
const REPLY_WITHIN = 6 * 3600_000

/** Each message of a channel that answers the one before it from the other end, by key, with how long the answer took. */
export const repliesOf = (messages: Message[]): Map<string, number> =>
  new Map(messages.flatMap((m, i) => {
    const before = messages[i - 1]
    return before && before.from.callsign !== m.from.callsign && recipientOf(before) === m.from.callsign && m.at - before.at < REPLY_WITHIN ? [[messageKey(m), m.at - before.at] as const] : []
  }))

const W = 300
const C = W / 2

/**
 * Who talks to whom: each worker a node, each pair a line as thick as their traffic. A worker in touch with most of the
 * others sits in the middle (a hub and its spokes), the rest on a ring; the channel's workers and lines lit.
 */
export function networkSvg(messages: Message[], channel: Channel | undefined): string {
  const pairs = new Map<string, { a: string; b: string; n: number }>()
  for (const m of messages) {
    const to = recipientOf(m)
    if (!to || to === m.from.callsign) continue
    const key = dmKey(m.from.callsign, to)
    const [a, b] = key.slice(3).split('|')
    pairs.set(key, { a, b, n: (pairs.get(key)?.n ?? 0) + 1 })
  }
  const nodes = [...new Set([...pairs.values()].flatMap((p) => [p.a, p.b]))].sort()
  if (!nodes.length) return ''
  const degree = (c: string) => [...pairs.values()].filter((p) => p.a === c || p.b === c).length
  const hub = nodes.length > 3 ? nodes.reduce((a, b) => (degree(b) > degree(a) ? b : a)) : undefined
  const centred = hub !== undefined && degree(hub) >= (nodes.length - 1) / 2 ? hub : undefined
  const ring = nodes.filter((c) => c !== centred)
  const r = nodes.length > 2 ? C - 34 : C / 2
  const at = new Map<string, [number, number]>(ring.map((c, i) => [c, [C + r * Math.sin((2 * Math.PI * i) / ring.length), C - r * Math.cos((2 * Math.PI * i) / ring.length)]]))
  if (centred) at.set(centred, [C, C])
  const lit = (c: string) => !channel || channel.kind === 'all' || channel.members.includes(c)
  const most = Math.max(...[...pairs.values()].map((p) => p.n))
  const labels = nodes.length <= 14
  const lines = [...pairs].map(([key, { a, b, n }]) => {
    const [[x1, y1], [x2, y2]] = [at.get(a)!, at.get(b)!]
    const on = channel?.key === key || (channel?.kind === 'worker' && channel.members.length > 1 && (channel.label === a || channel.label === b)) || (channel?.kind !== 'dm' && channel?.kind !== 'worker' && lit(a) && lit(b))
    return `<line class="link${on ? ' on' : ''}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${(1.2 + 4.5 * Math.sqrt(n / most)).toFixed(1)}" data-comms-channel="${esc(key)}"><title>${esc(`${a} ↔ ${b}: ${plural(n, 'message')}`)}</title></line>`
  })
  const dots = nodes.map((c) => {
    const [x, y] = at.get(c)!
    const outward = Math.atan2(y - C, x - C)
    const [lx, ly] = c === centred ? [x, y + 22] : [x + Math.cos(outward) * 18, y + Math.sin(outward) * 18 + 3]
    const anchor = c === centred || Math.abs(Math.cos(outward)) < 0.3 ? 'middle' : Math.cos(outward) > 0 ? 'start' : 'end'
    return `<g class="node${lit(c) ? ' on' : ''}${channel?.kind === 'worker' && channel.label === c ? ' sel' : ''}" data-comms-channel="worker:${esc(c)}" style="--hue: ${hueOf(c)}">
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${c === centred ? 11 : 8}"><title>${esc(`${c}: ${plural(degree(c), 'correspondent')}`)}</title></circle>
      ${labels || c === centred ? `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${esc(c)}</text>` : ''}</g>`
  })
  return `<svg class="comms-net" viewBox="-40 -10 ${W + 80} ${W + 20}" role="img" aria-label="who messages whom">${lines.join('')}${dots.join('')}</svg>`
}

/** A message past either length is folded to its start until the viewer shows it all. */
const isLong = (text: string) => text.length > 1200 || text.split('\n').length > 24

/** A local day's heading: `Thu, Oct 30`. */
const dayOf = (at: number) => new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
/** `14:03` */
const clockOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** A worker as a message names it: its colour and callsign, opening the session it was in. */
const partyHtml = (p: MessageParty) => `<button type="button" class="who" style="--hue: ${hueOf(p.callsign)}" data-comms-session="${esc(p.session)}" data-tip="open ${esc(p.callsign)}">${esc(p.callsign)}</button>`

/** Two letters of a callsign, for its face. */
const initials = (c: string) => c.replace(/[^A-Z]/gi, '').slice(0, 2).toUpperCase()

/**
 * `said` sets markdown as html; `expanded` the long messages shown in full; `words` what a message must hold to be
 * drawn; `missions` the floor's, `mission` the id of the one open, whose messages alone are drawn; `now` the moment
 * drawn (epoch ms).
 */
export type CommsView = {
  messages: Message[]
  channel: string
  said: (text: string) => string
  expanded?: ReadonlySet<string>
  words?: string[]
  missions?: Mission[]
  mission?: string
  now?: number
}

/** A channel's messages as a chat: each day headed, one face per run of a sender's messages, a direct line's two ends on either side. */
export function streamHtml({ messages, channel, said, expanded = new Set(), words = [] }: CommsView): string {
  const ch = channelsOf(messages).find((c) => c.key === channel)
  const all = inChannel(messages, channel)
  const shown = all.filter((m) => matching(m, words))
  const replies = repliesOf(all)
  const median_ = median([...replies.values()])
  const right = ch?.kind === 'dm' ? ch.members[1] : undefined
  const head = `<header class="comms-head"><h2>${ch ? esc(ch.label) : 'no messages'}</h2>
    <p>${plural(all.length, 'message')}${ch && ch.kind !== 'dm' ? ` · ${plural(ch.members.length, 'worker')}` : ''}${median_ !== undefined ? ` · answers in ${esc(ago(median_))} (median)` : ''}${shown.length !== all.length ? ` · <b>${shown.length} match</b>` : ''}</p></header>`
  let day = ''
  let prev: Message | undefined
  const rows = shown.map((m) => {
    const d = dayOf(m.at)
    const dayHead = d !== day ? `<div class="comms-day"><span>${esc(d)}</span></div>` : ''
    const run = !dayHead && prev?.from.callsign === m.from.callsign && recipientOf(prev) === recipientOf(m) && m.at - prev.at < 10 * 60_000
    day = d
    prev = m
    const key = messageKey(m)
    const long = isLong(m.text)
    const to = recipientOf(m)
    const reply = replies.get(key)
    const meta = `${partyHtml(m.from)}<span class="arrow">→</span>${m.to ? partyHtml(m.to) : to ? `<span class="who lost" data-tip="sent to ${esc(to)}: no worker the tower runs logged it">${esc(to)}</span>` : `<span class="who lost" data-tip="${esc(m.address)}: no worker the tower runs logged it">unknown</span>`}<time datetime="${new Date(m.at).toISOString()}">${esc(clockOf(m.at))}</time>${reply !== undefined ? `<span class="reply" data-tip="since the message it answers">↩ ${esc(ago(reply))}</span>` : ''}${m.to ? '' : '<span class="undelivered">not received</span>'}`
    return `${dayHead}<article class="msg${right && m.from.callsign === right ? ' mine' : ''}${run ? ' run' : ''}" style="--hue: ${hueOf(m.from.callsign)}">
      <span class="face" aria-hidden="true">${run ? '' : esc(initials(m.from.callsign))}</span>
      <div class="bubble${long ? ' long' : ''}">${run ? '' : `<header>${meta}</header>`}<div class="md">${said(m.text)}</div>${long ? `<label class="more"><input type="checkbox" data-expand="${esc(key)}"${expanded.has(key) ? ' checked' : ''}><span class="show">show all</span><span class="hide">fold</span></label>` : ''}</div></article>`
  })
  return `<div class="comms-stream">${head}<div class="comms-msgs">${rows.join('') || `<p class="none">${all.length ? 'no message matches' : 'nothing said here yet'}</p>`}</div></div>`
}

const KIND_HEAD: Record<ChannelKind, string> = { all: '', crew: 'crews', dm: 'direct lines', worker: 'workers' }

/** The channels as a list, the one shown lit, each kind under its heading. */
export function channelsHtml(messages: Message[], channel: string): string {
  const channels = channelsOf(messages)
  return `<nav class="comms-channels" aria-label="channels">${channels.map((c, i) => {
    const head = c.kind !== channels[i - 1]?.kind && KIND_HEAD[c.kind] ? `<h3>${KIND_HEAD[c.kind]}</h3>` : ''
    const dot = c.kind === 'worker' ? `<span class="dot" style="--hue: ${hueOf(c.label)}"></span>` : c.kind === 'dm' ? '<span class="sigil">@</span>' : '<span class="sigil">#</span>'
    return `${head}<button type="button" class="ch${c.key === channel ? ' on' : ''}" data-comms-channel="${esc(c.key)}" aria-pressed="${c.key === channel}">${dot}<span class="name">${esc(c.label)}</span><span class="n">${c.count}</span></button>`
  }).join('')}</nav>`
}

export const STATUS_WORDS: Record<MissionStatus, string> = { live: 'live', done: 'done', ended: 'ended', stopped: 'stopped' }

/** A time that runs while a live mission is in it, from `since` (epoch ms): `tickComms` counts it on. */
const runningHtml = (since: number, now: number) => `<span data-since="${since}">${esc(ago(now - since))}</span>`

/** Every running time drawn under `root` counted on to `now`: a renderer calls it each second. */
export const tickComms = (root: ParentNode, now: number) => {
  for (const el of root.querySelectorAll<HTMLElement>('[data-since]')) el.textContent = ago(now - Number(el.dataset.since))
}

/** The floor's missions to pick from, the whole floor first: each with its status, coordinator, crew and phase. */
export function missionsHtml(missions: Mission[], open: string | undefined): string {
  if (!missions.length) return ''
  const row = (m: Mission) => `<button type="button" class="mi ${m.status}${m.id === open ? ' on' : ''}" data-comms-mission="${esc(m.id)}" aria-pressed="${m.id === open}">
    <span class="lamp" data-tip="${STATUS_WORDS[m.status]}"></span><span class="t">${esc(m.title)}</span>
    <span class="sub">${esc(m.by.callsign)} · ${plural(m.members.length, 'worker')}${m.phase ? ` · ${esc(m.phase)}` : ''}</span></button>`
  return `<nav class="comms-missions" aria-label="missions"><h3>missions</h3>
    <button type="button" class="mi floor${open ? '' : ' on'}" data-comms-mission="" aria-pressed="${!open}"><span class="t">whole floor</span></button>${missions.map(row).join('')}</nav>`
}

const PART_WORDS: Record<Part['state'], string> = { answered: 'answered', asked: 'asked, no answer yet', quiet: 'not in touch' }
const PART_GLYPH: Record<Part['state'], string> = { answered: '✓', asked: '…', quiet: '·' }

/** A phase's span: `14:03 · 22m` once over, `14:03 · 5m 12s so far` while a live mission is in it (running), `since 14:03` in one that stopped. */
const spanHtml = (from: number | undefined, to: number | undefined, live: boolean, now: number) =>
  from === undefined ? 'not yet' : to !== undefined ? esc(`${clockOf(from)} · ${ago(to - from)}`) : live ? `${esc(clockOf(from))} · ${runningHtml(from, now)} so far` : esc(`since ${clockOf(from)}`)

/** The phases in a row, each with its span and how many of the crew it asked answered; the current one says whom it waits on. */
function stepperHtml(m: Mission, parts: Map<string, Map<string, Part>>, now: number): string {
  const steps = phaseWindows(m).map((w, i) => {
    const { answered, asked } = phaseTally(parts, w.name)
    const waiting = w.state === 'current' ? m.members.filter((x) => parts.get(x.callsign)?.get(w.name)?.state === 'asked').map((x) => x.callsign) : []
    return `<li class="step ${w.state}${w.state === 'current' && m.status === 'live' ? ' going' : ''}"><span class="n">${w.state === 'done' ? '✓' : i + 1}</span>
      <b>${esc(w.name)}</b><small>${spanHtml(w.from, w.to, m.status === 'live', now)}</small>${asked ? `<small class="tally">${answered}/${asked} answered</small>` : ''}
      ${waiting.length ? `<small class="wait" data-tip="${esc(waiting.join(', '))}">waiting on ${esc(waiting.slice(0, 4).join(', '))}${waiting.length > 4 ? ` +${waiting.length - 4}` : ''}</small>` : ''}</li>`
  })
  return `<ol class="stepper">${steps.join('')}</ol>`
}

/** Every crew member's part in each phase, a cell opening its line with the coordinator. */
function matrixHtml(m: Mission, parts: Map<string, Map<string, Part>>, now: number): string {
  const windows = phaseWindows(m)
  const head = windows.map((w) => `<th class="${w.state}" scope="col"><b>${esc(w.name)}</b><small>${spanHtml(w.from, w.to, m.status === 'live', now)}</small></th>`).join('')
  const rows = m.members.map((x) => `<tr><th scope="row"><button type="button" class="who" style="--hue: ${hueOf(x.callsign)}" data-comms-channel="worker:${esc(x.callsign)}">${esc(x.callsign)}</button>${x.live ? '' : ' <small>off duty</small>'}</th>${windows.map((w) => {
    const part = parts.get(x.callsign)?.get(w.name)
    if (!part) return '<td class="later"></td>'
    const tip = `${x.callsign} in ${w.name}: ${PART_WORDS[part.state]} · sent ${part.sent}, got ${part.got}${part.answeredIn !== undefined ? ` · answered in ${ago(part.answeredIn)}` : ''}`
    return `<td class="${part.state}"><button type="button" data-comms-channel="${esc(dmKey(m.by.callsign, x.callsign))}" data-tip="${esc(tip)}">${PART_GLYPH[part.state]}${part.answeredIn !== undefined ? `<small>${esc(ago(part.answeredIn))}</small>` : ''}</button></td>`
  }).join('')}</tr>`).join('')
  return `<div class="matrix-wrap"><table class="matrix"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
}

/** The open mission: what it is and where it stands, then its phases drawn as its coordinator chose. */
export function missionHtml(m: Mission, messages: Message[], now: number): string {
  const parts = partsOf(m, messages)
  const body = !m.phases.length
    ? `<p class="none">${m.declared ? 'no phases declared' : `${esc(m.by.callsign)} declared no mission: <code>tower mission "&lt;title&gt;" "&lt;phase&gt;"…</code> gives it phases`}</p>`
    : m.view === 'matrix' ? matrixHtml(m, parts, now) : stepperHtml(m, parts, now)
  const lasted = m.endedAt !== undefined ? esc(`took ${ago(m.endedAt - m.startedAt)}`) : m.status === 'live' ? `${runningHtml(m.startedAt, now)} so far` : 'not said done'
  return `<section class="mission ${m.status}"><header>
      <span class="status"><span class="lamp"></span>${STATUS_WORDS[m.status]}</span><h2>${esc(m.title)}</h2>
      <span class="meta">${partyHtml({ callsign: m.by.callsign, session: m.by.id, project: '' })} · ${plural(m.members.length, 'worker')} · ${esc(`started ${clockOf(m.startedAt)}, ${dayOf(m.startedAt)}`)} · ${lasted}</span></header>
    ${m.summary ? `<p class="summary">${esc(m.summary)}</p>` : ''}${body}</section>`
}

/** The whole view: the missions, the network and the channels beside the open mission's panel and the channel's stream. */
export function commsHtml(view: CommsView): string {
  const mission = view.missions?.find((m) => m.id === view.mission)
  const messages = mission ? inMission(view.messages, mission) : view.messages
  const ch = channelsOf(messages).find((c) => c.key === view.channel)
  const now = view.now ?? Date.now()
  return `<div class="comms-view"><aside class="comms-side">${missionsHtml(view.missions ?? [], mission?.id)}${networkSvg(messages, ch)}${channelsHtml(messages, view.channel)}</aside>
    <div class="comms-main">${mission ? missionHtml(mission, view.messages, now) : ''}${streamHtml({ ...view, messages })}</div></div>`
}

/** Scoped under `.comms-view`; reads the design's tokens from `/design.css`, and `markdownCss` sets the words. */
export const commsCss = `.comms-view { --who: oklch(.66 .14 var(--hue, 250)); display: grid; grid-template-columns: minmax(240px, 300px) minmax(0, 1fr); gap: var(--sp-l); height: 100%; min-height: 0; font: var(--fs-l)/1.55 var(--ui); color: var(--ink); }
.comms-view [style*="--hue"] { --who: oklch(.66 .14 var(--hue)); }
.comms-side { display: flex; flex-direction: column; gap: var(--sp-m); min-height: 0; overflow-y: auto; padding: var(--sp-m); background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); scrollbar-width: thin; }
.comms-net { width: 100%; height: auto; flex: none; }
.comms-net .link { stroke: var(--line-strong); stroke-linecap: round; opacity: .35; cursor: pointer; transition: opacity .15s; }
.comms-net .link.on { stroke: var(--accent); opacity: .85; }
.comms-net .link:hover { opacity: 1; }
.comms-net .node { cursor: pointer; opacity: .35; transition: opacity .15s; }
.comms-net .node.on, .comms-net .node:hover { opacity: 1; }
.comms-net circle { fill: var(--who); stroke: var(--panel); stroke-width: 2.5; }
.comms-net .node.sel circle { stroke: var(--ink); }
.comms-net text { fill: var(--ink); font: 700 9.5px var(--mono); paint-order: stroke; stroke: var(--panel); stroke-width: 3px; }
.comms-channels { display: flex; flex-direction: column; gap: 1px; }
.comms-channels h3 { margin: var(--sp-l) 0 var(--sp-2xs); padding: 0 var(--sp-s); font: 700 var(--fs-xs)/1.3 var(--ui); letter-spacing: .08em; text-transform: uppercase; color: var(--faint); }
.comms-channels .ch { display: flex; align-items: center; gap: var(--sp-s); width: 100%; min-height: var(--control); padding: 0 var(--sp-s); border: 0; border-radius: var(--radius); background: none; color: var(--muted); font: var(--fs-m)/1.3 var(--ui); text-align: left; cursor: pointer; }
.comms-channels .ch:hover { background: var(--panel-2); color: var(--ink); }
.comms-channels .ch.on { background: color-mix(in oklab, var(--accent) 16%, var(--panel)); color: var(--ink); font-weight: 700; }
.comms-channels .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); font-size: var(--fs-s); }
.comms-channels .n { color: var(--faint); font: var(--fs-xs) var(--mono); font-variant-numeric: tabular-nums; }
.comms-channels .sigil { width: 1em; color: var(--faint); font-weight: 700; text-align: center; }
.comms-channels .dot { width: .7em; height: .7em; margin: 0 .15em; border-radius: 50%; background: var(--who); flex: none; }
.comms-stream { display: flex; flex-direction: column; min-height: 0; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); }
.comms-head { padding: var(--sp-l) var(--sp-xl); border-bottom: 1px solid var(--line); }
.comms-head h2 { margin: 0; font: 800 var(--fs-xl)/1.2 var(--mono); }
.comms-head p { margin: var(--sp-2xs) 0 0; color: var(--muted); font-size: var(--fs-s); }
.comms-msgs { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-m) var(--sp-xl) var(--sp-2xl); scrollbar-width: thin; }
.comms-msgs .none { color: var(--faint); font-style: italic; }
.comms-day { display: flex; align-items: center; gap: var(--sp-m); max-width: 860px; margin: var(--sp-xl) 0 var(--sp-s); }
.comms-day::before, .comms-day::after { content: ''; flex: 1; border-top: 1px solid var(--line); }
.comms-day span { padding: var(--sp-2xs) var(--sp-l); border-radius: var(--radius-pill); background: var(--panel-2); border: 1px solid var(--line); color: var(--muted); font: 700 var(--fs-xs)/1.4 var(--ui); letter-spacing: .04em; }
.comms-view .msg { display: grid; grid-template-columns: 2.2rem minmax(0, 1fr); gap: var(--sp-m); margin-top: var(--sp-l); max-width: 860px; }
.comms-view .msg.run { margin-top: var(--sp-2xs); }
.comms-view .msg.mine { grid-template-columns: minmax(0, 1fr) 2.2rem; margin-left: auto; }
.comms-view .msg.mine .face { order: 2; }
.comms-view .face { display: grid; place-items: center; width: 2.2rem; height: 2.2rem; border-radius: 50%; background: color-mix(in oklab, var(--who) 30%, var(--panel)); border: 2px solid var(--who); color: var(--ink); font: 800 var(--fs-xs)/1 var(--display); }
.comms-view .run .face { visibility: hidden; height: 0; }
.comms-view .bubble { min-width: 0; padding: var(--sp-s) var(--sp-l) var(--sp-m); border-radius: 12px; border-top-left-radius: 3px; background: var(--panel-2); border: 1px solid var(--line); border-left: 3px solid var(--who); }
.comms-view .mine .bubble { border-left-width: 1px; border-right: 3px solid var(--who); border-radius: 12px; border-top-right-radius: 3px; background: color-mix(in oklab, var(--who) 9%, var(--panel)); }
.comms-view .bubble > header { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-xs); margin-bottom: var(--sp-2xs); font-size: var(--fs-s); color: var(--muted); }
.comms-view .who { padding: 0; border: 0; background: none; color: var(--ink); font: 700 var(--fs-s)/1.4 var(--mono); cursor: pointer; }
.comms-view .who::before { content: ''; display: inline-block; width: .6em; height: .6em; margin-right: .35em; border-radius: 50%; background: var(--who); }
.comms-view button.who:hover { text-decoration: underline; }
.comms-view .who.lost { color: var(--faint); cursor: default; } .comms-view .who.lost::before { background: var(--faint); }
.comms-view .arrow { color: var(--faint); }
.comms-view time { margin-left: var(--sp-xs); color: var(--faint); font: var(--fs-xs) var(--mono); }
.comms-view .reply { color: var(--faint); font: var(--fs-xs) var(--mono); }
.comms-view .undelivered { color: var(--broken-text); font: 700 var(--fs-xs) var(--ui); }
.comms-view .long > .md { max-height: 16em; overflow: hidden; mask-image: linear-gradient(#000 65%, transparent); }
.comms-view .long:has(.more input:checked) > .md { max-height: none; mask-image: none; }
.comms-view .more { position: relative; display: inline-block; margin-top: var(--sp-xs); font: 700 var(--fs-s)/1.4 var(--ui); color: var(--accent); cursor: pointer; }
.comms-view .more input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.comms-view .more:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.comms-view .more .hide, .comms-view .more:has(input:checked) .show { display: none; } .comms-view .more:has(input:checked) .hide { display: inline; }
.comms-main { display: flex; flex-direction: column; gap: var(--sp-m); min-width: 0; min-height: 0; }
.comms-main .comms-stream { flex: 1; }
.comms-view .lamp { display: inline-block; width: .6em; height: .6em; border-radius: 50%; background: var(--quiet); flex: none; }
.comms-view .live .lamp { background: var(--working); animation: comms-pulse 1.6s ease-in-out infinite; }
.comms-view .done .lamp { background: var(--ready); }
@keyframes comms-pulse { 50% { opacity: .35; } }
:root[data-motion='reduce'] .comms-view .lamp { animation: none; }
.comms-missions { display: flex; flex-direction: column; gap: 1px; padding-bottom: var(--sp-s); border-bottom: 1px solid var(--line); }
.comms-missions h3 { margin: 0 0 var(--sp-2xs); padding: 0 var(--sp-s); font: 700 var(--fs-xs)/1.3 var(--ui); letter-spacing: .08em; text-transform: uppercase; color: var(--faint); }
.comms-missions .mi { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: var(--sp-s); padding: var(--sp-xs) var(--sp-s); border: 0; border-radius: var(--radius); background: none; color: var(--ink); font: 700 var(--fs-m)/1.3 var(--ui); text-align: left; cursor: pointer; }
.comms-missions .mi.floor { grid-template-columns: minmax(0, 1fr); color: var(--muted); }
.comms-missions .mi:hover { background: var(--panel-2); }
.comms-missions .mi.on { background: color-mix(in oklab, var(--accent) 16%, var(--panel)); }
.comms-missions .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.comms-missions .sub { grid-column: 2; color: var(--muted); font: 400 var(--fs-xs)/1.4 var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.comms-view .mission { flex: none; max-height: 48%; overflow-y: auto; padding: var(--sp-m) var(--sp-xl) var(--sp-l); background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--quiet); border-radius: var(--radius); scrollbar-width: thin; }
.comms-view .mission.live { border-left-color: var(--working); } .comms-view .mission.done { border-left-color: var(--ready); }
.comms-view .mission > header { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--sp-xs) var(--sp-l); }
.comms-view [data-since] { font-variant-numeric: tabular-nums; }
.comms-view .mission h2 { margin: 0; font: 900 var(--fs-xl)/1.2 var(--display); }
.comms-view .mission .status { display: flex; align-items: center; gap: var(--sp-xs); color: var(--muted); font: 700 var(--fs-xs)/1 var(--ui); letter-spacing: .08em; text-transform: uppercase; }
.comms-view .mission .meta { flex-basis: 100%; color: var(--muted); font-size: var(--fs-s); }
.comms-view .mission .summary { margin: var(--sp-m) 0 0; padding: var(--sp-s) var(--sp-l); border-radius: var(--radius); background: color-mix(in oklab, var(--ready) 12%, var(--panel)); }
.comms-view .mission .none { margin: var(--sp-m) 0 0; color: var(--faint); font-style: italic; }
.comms-view .stepper { --ring: 10px; display: flex; margin: var(--sp-s) 0 0; padding: var(--ring) 0 var(--sp-2xs); list-style: none; overflow-x: auto; scrollbar-width: thin; }
.comms-view .step { position: relative; flex: 1 1 0; min-width: 9rem; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 0 var(--sp-s); text-align: center; color: var(--muted); }
.comms-view .step::before { content: ''; position: absolute; top: calc(1rem - 1px); left: -50%; right: 50%; border-top: 2px solid var(--line-strong); z-index: 0; }
.comms-view .step:first-child::before { display: none; }
.comms-view .step.done::before, .comms-view .step.current::before { border-color: var(--accent); }
.comms-view .step .n { position: relative; z-index: 1; display: grid; place-items: center; width: 2rem; height: 2rem; margin-bottom: var(--sp-2xs); border-radius: 50%; border: 2px solid var(--line-strong); background: var(--panel); font: 800 var(--fs-s)/1 var(--display); }
.comms-view .step.done .n { border-color: var(--accent); background: var(--accent); color: var(--panel); }
.comms-view .step.current .n { border-color: var(--accent); color: var(--ink); box-shadow: 0 0 0 4px color-mix(in oklab, var(--accent) 25%, transparent); }
.comms-view .step.going .n { animation: comms-ring 1.8s ease-in-out infinite; }
@keyframes comms-ring { 50% { box-shadow: 0 0 0 8px color-mix(in oklab, var(--accent) 8%, transparent); } }
:root[data-motion='reduce'] .comms-view .step.going .n { animation: none; }
.comms-view .step b { color: var(--ink); font-size: var(--fs-m); } .comms-view .step.upcoming b { color: var(--muted); font-weight: 400; }
.comms-view .step small { font: var(--fs-xs)/1.4 var(--mono); }
.comms-view .step .tally { color: var(--ink); }
.comms-view .step .wait { color: var(--needs-text); }
.comms-view .matrix-wrap { margin-top: var(--sp-l); overflow-x: auto; }
.comms-view .matrix { border-collapse: separate; border-spacing: 3px; font-size: var(--fs-s); }
.comms-view .matrix thead th { padding: 0 var(--sp-s) var(--sp-xs); text-align: center; vertical-align: bottom; color: var(--muted); }
.comms-view .matrix thead th b { display: block; color: var(--ink); } .comms-view .matrix thead th.upcoming b { color: var(--faint); font-weight: 400; }
.comms-view .matrix thead th small { font: var(--fs-xs) var(--mono); white-space: nowrap; }
.comms-view .matrix thead th.current { box-shadow: inset 0 -2px var(--accent); }
.comms-view .matrix tbody th { padding-right: var(--sp-m); text-align: left; white-space: nowrap; font-weight: 400; }
.comms-view .matrix tbody th small { color: var(--faint); }
.comms-view .matrix td { min-width: 4.5rem; height: 2rem; padding: 0; border-radius: var(--radius-s, 4px); background: var(--sunk); text-align: center; }
.comms-view .matrix td button { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; gap: var(--sp-2xs); border: 0; background: none; color: inherit; font: 800 var(--fs-m)/1 var(--ui); cursor: pointer; }
.comms-view .matrix td small { font: 400 var(--fs-xs) var(--mono); }
.comms-view .matrix td.answered { background: color-mix(in oklab, var(--ready) 28%, var(--panel)); color: var(--ink); }
.comms-view .matrix td.asked { background: color-mix(in oklab, var(--needs) 22%, var(--panel)); color: var(--needs-text); }
.comms-view .matrix td.quiet { color: var(--faint); }
.comms-view .matrix td.later { background: none; border: 1px dashed var(--line); }
@media (max-width: 760px) { .comms-view { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); } .comms-side { max-height: 40vh; } .comms-net { display: none; } }`
