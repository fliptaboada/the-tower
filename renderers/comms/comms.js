/**
 * Comms: what the workers say to each other (`SendMessage`), a floor at a time, live, and the missions they work on.
 * The missions, channels, network and a channel's chat are the shared view (`/comms.js`) over `GET /messages/<project>`
 * and the floor's `missions`, read again when the floor's `messages` moves on the board.
 * `#<project>[/mission/<id>][/<channel>]` names what is open; with no hash, the busiest floor and its latest live mission.
 */
import { ALL_CHANNEL, channelsOf, commsHtml, commsCss, expandedMessages, inMission, tickComms } from '/comms.js'
import { esc } from '/cards.js'
import { markdownHtml, markdownCss } from '/markdown.js'
import { watchTips } from '/tips.js'

/**
 * @import { Board, Floor } from '../../src/bridge/board.ts'
 * @import { Message } from '../../src/bridge/messages.ts'
 */

document.head.append(Object.assign(document.createElement('style'), { textContent: commsCss + markdownCss }))

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id))

/**
 * The board; the floor open, its mission and channel; the floor's messages as last read, and the floor's `messages`
 * they were read at; the words they are filtered by; the floor's missions as last drawn, and the mission open then.
 * @type {{ board?: Board, project?: string, mission?: string, channel: string, messages?: Message[], readAt?: string, failed?: string, words: string[], drawnMissions?: string, drawnMission?: string }}
 */
const state = { channel: ALL_CHANNEL, words: [] }

/** @param {Floor} f */
const countsOf = (f) => `${f.messages.all}/${f.messages.delivered}`

const floorOf = () => state.board?.floors.find((f) => f.id === state.project)
const missionOf = () => floorOf()?.missions.find((m) => m.id === state.mission)

/** What the hash names: a floor, a mission of it and a channel. */
function fromHash() {
  const [project, ...rest] = location.hash.slice(1).split('/').map(decodeURIComponent)
  const mission = rest[0] === 'mission' ? rest[1] : undefined
  const channel = (mission === undefined ? rest[0] : rest[2]) || ALL_CHANNEL
  return { project: project || undefined, mission, channel }
}

const toHash = () => history.replaceState(null, '', `#${[
  state.project ?? '',
  ...(state.mission ? ['mission', state.mission] : []),
  ...(state.channel === ALL_CHANNEL ? [] : [state.channel]),
].map(encodeURIComponent).join('/')}`)

/** The floors that have said anything, busiest first, then the rest. @param {Board} board */
const floorsOf = (board) => board.floors.toSorted((a, b) => b.messages.all - a.messages.all)

function drawFloors() {
  const board = /** @type {Board} */ (state.board)
  $('floors').innerHTML = floorsOf(board).filter((f) => f.messages.all || f.missions.length || f.id === state.project).map((f) =>
    `<button type="button" class="${f.id === state.project ? 'on' : ''}" data-floor="${esc(f.id)}" aria-pressed="${f.id === state.project}" style="--floor: ${esc(f.color)}"><span class="swatch"></span>${esc(f.name)} <small>${f.messages.all}</small></button>`).join('')
}

/** Reads the open floor's messages, dropping a read a later one overtook. */
async function read() {
  const project = state.project
  const f = floorOf()
  if (!project || !f) return draw()
  state.readAt = countsOf(f)
  try {
    const messages = await tower.messages(project)
    if (state.project !== project) return
    const grew = state.messages !== undefined && messages.length > state.messages.length
    state.messages = messages
    state.failed = undefined
    draw(grew)
  } catch (err) {
    state.failed = /** @type {Error} */ (err).message
    draw()
  }
}

/** Draws the floor's comms, keeping the stream at its end while the viewer reads there. @param {boolean} [grew] */
function draw(grew = false) {
  const main = $('comms')
  if (!state.project) return void (main.innerHTML = '<p class="note">No floor has messages yet: when workers talk to each other with SendMessage, it shows here.</p>')
  if (state.failed) return void (main.innerHTML = `<p class="note broken">The messages can't be read: ${esc(state.failed)}</p>`)
  if (!state.messages) return void (main.innerHTML = '<p class="note">Reading the messages…</p>')
  const missions = floorOf()?.missions ?? []
  const mission = missionOf()
  if (state.mission && !mission) state.mission = undefined
  const shown = mission ? inMission(state.messages, mission) : state.messages
  if (state.channel !== ALL_CHANNEL && !channelsOf(shown).some((c) => c.key === state.channel)) state.channel = ALL_CHANNEL
  state.drawnMissions = JSON.stringify(missions)
  const was = main.querySelector('.comms-msgs')
  const atEnd = !was || was.scrollHeight - was.scrollTop - was.clientHeight < 64
  const top = was?.scrollTop ?? 0
  const sideTop = main.querySelector('.comms-side')?.scrollTop ?? 0
  const panelTop = main.querySelector('.mission')?.scrollTop ?? 0
  main.innerHTML = commsHtml({ messages: state.messages, channel: state.channel, said: markdownHtml, expanded: expandedMessages(main), words: state.words, missions, mission: state.mission, now: Date.now() })
  const msgs = /** @type {HTMLElement} */ (main.querySelector('.comms-msgs'))
  const side = /** @type {HTMLElement} */ (main.querySelector('.comms-side'))
  msgs.scrollTop = atEnd ? msgs.scrollHeight : top
  side.scrollTop = sideTop
  const panel = main.querySelector('.mission')
  if (panel && missionOf()?.id === state.drawnMission) panel.scrollTop = panelTop
  state.drawnMission = state.mission
  if (grew && atEnd) msgs.querySelector('.msg:last-of-type .bubble')?.classList.add('flash')
}

/**
 * Opens a floor, a mission of it, or a channel, reading the floor's messages when the floor changes.
 * @param {string | undefined} project @param {string | undefined} mission @param {string} channel
 */
function open(project, mission, channel) {
  const changed = project !== state.project
  state.project = project
  state.mission = mission || undefined
  state.channel = channel
  toHash()
  drawFloors()
  if (changed) {
    state.messages = undefined
    void read()
  }
  draw()
  if (!changed) $('comms').querySelector('.comms-msgs')?.scrollTo({ top: 1e9 })
}

/** The mission a floor opens on: its latest live one. @param {Floor | undefined} f */
const liveMissionOf = (f) => f?.missions.find((m) => m.status === 'live')?.id

document.addEventListener('click', (e) => {
  const target = /** @type {HTMLElement} */ (e.target)
  const floor = target.closest('[data-floor]')?.getAttribute('data-floor')
  if (floor) return open(floor, liveMissionOf(state.board?.floors.find((f) => f.id === floor)), ALL_CHANNEL)
  const mission = target.closest('[data-comms-mission]')?.getAttribute('data-comms-mission')
  if (mission !== undefined && mission !== null) return open(state.project, mission, ALL_CHANNEL)
  const channel = target.closest('[data-comms-channel]')?.getAttribute('data-comms-channel')
  if (channel) return open(state.project, state.mission, channel)
  const session = target.closest('[data-comms-session]')?.getAttribute('data-comms-session')
  if (session) {
    e.preventDefault()
    window.open(`/r/page/#${session}`, '_blank')
  }
})

// The shared view names what a thing is in `data-tip`: the tower's own tips show it, as on the tower page.
watchTips(document)

$('filter').addEventListener('input', () => {
  state.words = /** @type {HTMLInputElement} */ ($('filter')).value.toLowerCase().split(/\s+/).filter(Boolean)
  draw()
})

addEventListener('hashchange', () => {
  const { project, mission, channel } = fromHash()
  if (project !== state.project || mission !== state.mission || channel !== state.channel) open(project, mission, channel)
})

// A live mission's times run on between boards.
setInterval(() => tickComms($('comms'), Date.now()), 1000)

tower.onBoardError((err) => {
  $('live').classList.add('lost')
  $('live-text').textContent = err.code === 'disconnected' ? 'reconnecting' : 'no board'
})

tower.subscribe((board) => {
  const first = !state.board
  state.board = board
  $('live').classList.remove('lost')
  $('live-text').textContent = 'live'
  if (first) {
    const hashed = fromHash()
    const known = board.floors.find((f) => f.id === hashed.project)
    if (known) return open(known.id, hashed.mission, hashed.channel)
    const busiest = floorsOf(board).find((f) => f.messages.all || f.missions.length)
    return open(busiest?.id, liveMissionOf(busiest), ALL_CHANNEL)
  }
  drawFloors()
  const f = floorOf()
  if (f && countsOf(f) !== state.readAt) void read()
  else if (f && JSON.stringify(f.missions) !== state.drawnMissions) draw()
})
