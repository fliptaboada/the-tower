/**
 * Claude's inbox listener, run with node by this plugin's module (`hooks/register.js`) for the session's life: Claude's
 * mods API listens on no socket. It prints each message the tower delivers as one JSON line `{text}` on stdout, for
 * the module to submit, and exits once Claude, its parent, is gone.
 */
import { listenInbox, ownInbox } from '../inbox.ts'

/** How often it checks that Claude, its parent, is still there: a Claude that dies hard leaves its children running. */
const PARENT_CHECK_MS = 5_000

const parent = process.ppid
/** Claude runs one conversation per process: the letter's `conversation` is the one it is in. */
const stop = await listenInbox(ownInbox(), ({ text }) => new Promise((resolve, reject) => process.stdout.write(`${JSON.stringify({ text })}\n`, (err) => (err ? reject(err) : resolve()))))
const end = () => {
  stop()
  process.exit(0)
}
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, end)
setInterval(() => process.ppid !== parent && end(), PARENT_CHECK_MS).unref()
