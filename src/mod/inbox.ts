/**
 * A running worker's inbox: the socket its harness listens on for the messages the tower delivers to it (the `message`
 * verb), `<root>/inbox/<session id>.sock` (`inboxPath`). It takes `POST /message {text}`, `text` the whole prompt the
 * tower composed (`towerMessage`), and answers once its harness has it: `200 {t: 'ok'}`, or `500 {message, code?}`,
 * `code` the one the harness's error carries (`NO_CONVERSATION`).
 *
 * The tower's opencode plugin listens in its own process (`listenInbox`), and queues each message on its session with
 * `ctx.session.prompt`. Claude's mod runs this file with node (`node inbox.ts`, Claude's mods API listens on no socket):
 * it prints each message as one JSON line `{text}` on stdout, which the mod reads and submits with `$.prompt.submit`,
 * and exits once Claude, its parent, is gone. Both wait for the worker to be free: opencode's inbox and Claude's queue
 * hold a prompt until the turn running ends.
 *
 * The socket is not stored state: a listener gone leaves a file nothing answers on, which the next one replaces, and
 * the tower reads it as a worker that takes no messages.
 */
import { mkdirSync, rmSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configPath, inboxPath, systemPaths } from '../shared/paths.ts'

/** What a harness does with a message: resolves once it holds it, rejects when it can't take it. */
export type Take = (text: string) => Promise<void>

/** This session's inbox: its id's socket under the system root of the config it runs under. */
export const ownInbox = (): string => {
  const id = process.env.TOWER_SESSION_ID
  if (!id) throw new Error('TOWER_SESSION_ID is not set: only a session the tower started has an inbox')
  return inboxPath(systemPaths(configPath()), id)
}

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
      const { text } = JSON.parse(body) as { text: unknown }
      if (typeof text !== 'string') throw new Error('A message is {text}, a string')
      await take(text)
      answer(res, 200, { t: 'ok' })
    } catch (err) {
      const { message, code } = err as Error & { code?: string }
      answer(res, 500, { message, ...(code && { code }) })
    }
  })
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(socket, resolve))
  return () => {
    server.close()
    rmSync(socket, { force: true })
  }
}

/** How often the listener Claude runs checks that Claude, its parent, is still there. */
const PARENT_CHECK_MS = 5_000

/** Claude's: each message a JSON line on stdout, answered once written; gone with its parent. */
const main = async () => {
  const parent = process.ppid
  const stop = await listenInbox(ownInbox(), (text) => new Promise((resolve, reject) => process.stdout.write(`${JSON.stringify({ text })}\n`, (err) => (err ? reject(err) : resolve()))))
  const end = () => {
    stop()
    process.exit(0)
  }
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, end)
  setInterval(() => process.ppid !== parent && end(), PARENT_CHECK_MS).unref()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
