/**
 * Comms: what the workers say to each other (`SendMessage`), a floor at a time, live. Channels, the network of who
 * talks to whom and a channel's chat are the shared view (`/comms.js`) over `GET /messages/<project>`, read again when
 * the floor's `messages` moves on the board. `#<project>[/<channel>]` names what is open.
 */
import { ALL_CHANNEL, channelsOf, commsHtml, commsCss, expandedMessages } from '/comms.js'
import { esc } from '/cards.js'
import { markdownHtml, markdownCss } from '/markdown.js'

/**
 * @import { Board, Floor } from '../../src/bridge/board.ts'
 * @import { Message } from '../../src/bridge/messages.ts'
 */

document.head.append(Object.assign(document.createElement('style'), { textContent: commsCss + markdownCss }))

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id))

/**
 * The board; the floor open and its channel; the floor's messages as last read, and the floor's `messages` they were
 * read at; the words they are filtered by.
 * @type {{ board?: Board, project?: string, channel: string, messages?: Message[], readAt?: string, failed?: string, words: string[] }}
 */
const state = { channel: ALL_CHANNEL, words: [] }

/** @param {Floor} f */
const countsOf = (f) => `${f.messages.all}/${f.messages.delivered}`

/** What the hash names: a floor and its channel. */
function fromHash() {
  const [project, ...channel] = decodeURIComponent(location.hash.slice(1)).split('/')
  return { project: project || undefined, channel: channel.join('/') || ALL_CHANNEL }
}

const toHash = () => history.replaceState(null, '', `#${encodeURIComponent(state.project ?? '')}${state.channel === ALL_CHANNEL ? '' : '/' + encodeURIComponent(state.channel)}`)

/** The floors that have said anything, busiest first, then the rest. @param {Board} board */
const floorsOf = (board) => board.floors.toSorted((a, b) => b.messages.all - a.messages.all)

function drawFloors() {
  const board = /** @type {Board} */ (state.board)
  $('floors').innerHTML = floorsOf(board).filter((f) => f.messages.all || f.id === state.project).map((f) =>
    `<button type="button" class="${f.id === state.project ? 'on' : ''}" data-floor="${esc(f.id)}" aria-pressed="${f.id === state.project}" style="--floor: ${esc(f.color)}"><span class="swatch"></span>${esc(f.name)} <small>${f.messages.all}</small></button>`).join('')
}

/** Reads the open floor's messages, dropping a read a later one overtook. */
async function read() {
  const project = state.project
  const f = state.board?.floors.find((f) => f.id === project)
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
  if (!channelsOf(state.messages).some((c) => c.key === state.channel)) state.channel = ALL_CHANNEL
  const was = main.querySelector('.comms-msgs')
  const atEnd = !was || was.scrollHeight - was.scrollTop - was.clientHeight < 64
  const top = was?.scrollTop ?? 0
  const sideTop = main.querySelector('.comms-side')?.scrollTop ?? 0
  main.innerHTML = commsHtml({ messages: state.messages, channel: state.channel, said: markdownHtml, expanded: expandedMessages(main), words: state.words })
  const msgs = /** @type {HTMLElement} */ (main.querySelector('.comms-msgs'))
  const side = /** @type {HTMLElement} */ (main.querySelector('.comms-side'))
  msgs.scrollTop = atEnd ? msgs.scrollHeight : top
  side.scrollTop = sideTop
  if (grew && atEnd) msgs.querySelector('.msg:last-of-type .bubble')?.classList.add('flash')
}

/** Opens a floor, or its channel. @param {string | undefined} project @param {string} channel */
function open(project, channel) {
  const changed = project !== state.project
  state.project = project
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

document.addEventListener('click', (e) => {
  const target = /** @type {HTMLElement} */ (e.target)
  const floor = target.closest('[data-floor]')?.getAttribute('data-floor')
  if (floor) return open(floor, ALL_CHANNEL)
  const channel = target.closest('[data-comms-channel]')?.getAttribute('data-comms-channel')
  if (channel) return open(state.project, channel)
  const session = target.closest('[data-comms-session]')?.getAttribute('data-comms-session')
  if (session) window.open(`/r/page/#${session}`, '_blank')
})

// The shared view names what a thing is in `data-tip`: this page shows it as the browser's own tooltip.
document.addEventListener('pointerover', (e) => {
  const el = /** @type {HTMLElement} */ (e.target).closest('[data-tip]')
  if (el && !el.hasAttribute('title')) el.setAttribute('title', el.getAttribute('data-tip') ?? '')
})

$('filter').addEventListener('input', () => {
  state.words = /** @type {HTMLInputElement} */ ($('filter')).value.toLowerCase().split(/\s+/).filter(Boolean)
  draw()
})

addEventListener('hashchange', () => {
  const { project, channel } = fromHash()
  if (project !== state.project || channel !== state.channel) open(project, channel)
})

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
    const project = board.floors.some((f) => f.id === hashed.project) ? hashed.project : floorsOf(board).find((f) => f.messages.all)?.id
    return open(project, hashed.project === project ? hashed.channel : ALL_CHANNEL)
  }
  drawFloors()
  const f = board.floors.find((f) => f.id === state.project)
  if (f && countsOf(f) !== state.readAt) void read()
})
