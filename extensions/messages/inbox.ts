/**
 * A running worker's inbox: the socket its runtime's plugin listens on for the messages the tower hands it, at
 * `<root>/inbox/<session id>.sock` (`inboxPath`), `<root>` the system root, where the host's `hooks.sock` is. It takes
 * `POST /message {text, conversation?}` (`Letter`) and answers once the runtime holds it: `200 {t: 'ok'}`, or
 * `500 {message}`.
 *
 * The opencode plugin listens in its own process; Claude's plugin runs `claude/listen.ts` with node, since Claude's
 * mods API listens on no socket. The socket is not stored state: a listener gone leaves a file nothing answers on,
 * which the next one replaces, and the server reads as a worker that takes no messages.
 *
 * Plain Node with erasable types only: node runs it as it is for Claude's listener, and opencode's runtime imports it.
 */
import { mkdirSync, rmSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'

/**
 * A worker's message as the receiver's model reads it and its log keeps it: the text in an envelope naming the
 * sender's callsign, so the receiver tells a crewmate's message from the user's.
 */
export const towerMessage = (from: string, text: string): string => `<tower-message from="${from}">\n${text}\n</tower-message>`

/** The inbox of `session` under the system root `root`. */
export const inboxPath = (root: string, session: string): string => path.join(root, 'inbox', `${session}.sock`)

/** This session's inbox: the host's hooks socket is at the system root. */
export const ownInbox = (): string => {
  const id = process.env.TOWER_SESSION_ID
  const hooks = process.env.TOWER_HOOKS_SOCKET
  if (!id || !hooks) throw new Error('TOWER_SESSION_ID or TOWER_HOOKS_SOCKET is not set: only a session the tower started has an inbox')
  return inboxPath(path.dirname(hooks), id)
}

/**
 * What an inbox is handed. `text`: the whole prompt the server composed (`towerMessage`). `conversation`: the one the
 * tower last saw the worker enter (its card's latest), which a runtime that runs several in one process (opencode)
 * queues it on; its plugin can't tell a resumed one itself, opened by its TUI in another process.
 */
export type Letter = { text: string; conversation?: string }

/** What a runtime does with a message: resolves once it holds it, rejects when it can't take it. */
export type Take = (letter: Letter) => Promise<void>

/** A socket left by a listener that is gone is replaced; one that answers is another listener's, and this one doesn't start. */
const cleared = (socket: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const probe = net.connect(socket)
    probe.once('connect', () => {
      probe.destroy()
      reject(new Error(`Something already listens on ${socket}: this session's inbox is taken`))
    })
    probe.once('error', () => {
      rmSync(socket, { force: true })
      resolve()
    })
  })

const answer = (res: http.ServerResponse, status: number, body: object) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))

/** Listens on `socket` and hands each message to `take`. Resolves to what stops it, removing the socket. */
export const listenInbox = async (socket: string, take: Take): Promise<() => void> => {
  mkdirSync(path.dirname(socket), { recursive: true })
  await cleared(socket)
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/message') return void answer(res, 404, { message: 'An inbox takes POST /message {text}' })
    let body = ''
    for await (const chunk of req) body += chunk
    try {
      const { text, conversation } = JSON.parse(body) as { text: unknown; conversation: unknown }
      if (typeof text !== 'string' || !(conversation === undefined || typeof conversation === 'string'))
        throw new Error('A message is {text, conversation?}, both strings')
      await take({ text, ...(conversation !== undefined && { conversation }) })
      answer(res, 200, { t: 'ok' })
    } catch (err) {
      answer(res, 500, { message: (err as Error).message })
    }
  })
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(socket, resolve))
  return () => {
    server.close()
    rmSync(socket, { force: true })
  }
}

/** How a delivery went: held by the receiver's runtime, nothing listening on its inbox, or refused by its runtime. */
export type Delivered = { t: 'ok' } | { t: 'not_listening' } | { t: 'refused'; message: string }

/** Hands `letter` to the inbox at `socket`. */
export const deliver = (socket: string, letter: Letter): Promise<Delivered> =>
  new Promise((resolve) => {
    const req = http.request({ socketPath: socket, path: '/message', method: 'POST', headers: { 'content-type': 'application/json' } }, async (res) => {
      let body = ''
      for await (const chunk of res) body += chunk
      resolve(res.statusCode === 200 ? { t: 'ok' } : { t: 'refused', message: (JSON.parse(body) as { message: string }).message })
    })
    req.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') resolve({ t: 'not_listening' })
      else resolve({ t: 'refused', message: err.message })
    })
    req.end(JSON.stringify(letter))
  })
