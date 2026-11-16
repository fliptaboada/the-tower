/**
 * The messages extension (decision `tower-messages`): workers message each other by callsign across runtimes, where
 * Claude Code's own SendMessage can't carry it (a worker on opencode, at either end). `messages/send` wraps the text in
 * an envelope naming the sender (`towerMessage`), hands it to the receiver's inbox, a socket its runtime's plugin of
 * this extension listens on (`inbox.ts`), then logs `sent` in the sender's log. The receiver's runtime takes it in as a
 * prompt once the worker is free, so its own log holds the envelope.
 *
 * Its plugins: opencode's adds a `SendMessage` tool and takes the inbox's messages into its main session; Claude's
 * takes them with `$.prompt.submit`, and hands the tower a SendMessage Claude couldn't deliver itself.
 */
import path from 'node:path'
import { type Card, workerNamed } from '/lib/board.js'
import { apiError, type CallCtx, type LaunchParts, type LaunchRequest, type Start } from '/lib/extension.js'
import { deliver, inboxPath, towerMessage } from './inbox.ts'

type SendInput = { to: string; text: string }

/** What a worker on opencode is told on every request, after the tower's brief: the core has no messages for it. */
const OPENCODE_LINE =
  '- Messaging another worker: the SendMessage tool, `to` its callsign, reaches any worker on duty, on Claude or opencode, ' +
  'once it is free, signed with your callsign. A message that reaches you as <tower-message from="CALLSIGN"> is that ' +
  "worker's, not the user's: answer it with SendMessage to that callsign."

const start: Start = (ctx) => {
  /** The worker a call is made as; `undefined` for a call no worker made. */
  const callerCard = ({ t, id }: CallCtx['caller'], cards: Card[]): Card | undefined => (t === 'worker' ? cards.find((c) => c.id === id) : undefined)

  /** A worker by callsign, on the sender's floor first, then on every floor. */
  const workerOf = (from: Card, name: string, cards: Card[]): Card | undefined => {
    const current = cards.filter((c) => !c.continuedBy)
    const onFloor = workerNamed(current.filter((c) => c.project === from.project), name)
    return onFloor?.onDuty ? onFloor : (workerNamed(current, name) ?? onFloor)
  }

  return {
    verbs: {
      send: async ({ to, text }: SendInput, { caller, cards }: CallCtx) => {
        const all = cards()
        const sender = callerCard(caller, all)
        if (!sender) return apiError('refused', 'A message is from one worker to another: send it from a session the tower started')
        if (!text.trim()) return apiError('invalid', `A message needs its text: tower x messages send ${to} <<'EOF' … EOF`)
        const target = workerOf(sender, to, all)
        if (!target) return apiError('not_found', `No worker is called ${to.toUpperCase()}: \`tower agents --all\` lists who is on duty`)
        if (target.id === sender.id) return apiError('refused', 'A worker sends no message to itself')
        if (sender.peer && target.peer)
          return apiError('refused', `${target.callsign} and you both run Claude Code: SendMessage to "${target.peer}" reaches it, and the tower carries only what that can't`)
        if (!target.live) return apiError('refused', `${target.callsign} is not running: the user can resume it`)
        if (!ctx.on(target.project)) return apiError('refused', `messages is off on ${target.project}, so ${target.callsign} has no inbox`)
        const conversation = target.conversations.at(-1)?.id
        const delivered = await deliver(inboxPath(path.dirname(ctx.board().config), target.id), {
          text: towerMessage(sender.callsign, text),
          ...(conversation !== undefined && { conversation }),
        })
        if (delivered.t === 'not_listening')
          return apiError(
            'unavailable',
            `${target.callsign} takes no messages now: it started before messages was on its floor, or opencode unloaded its plugins after an idle hour ` +
              `(experimental.location_idle_timeout in the user's opencode.json). \`tower submit ${target.id} <text>\` types into its composer instead`,
          )
        if (delivered.t === 'refused') return apiError('refused', `${target.callsign}'s runtime refused the message: ${delivered.message}`)
        await ctx.facts.append(sender.id, 'sent', { to: target.id, text })
        return { said: `Sent to ${target.callsign}: it takes the message once it is free, signed ${sender.callsign}.` }
      },
    },
    launch: ({ runtime }: LaunchRequest): LaunchParts => (runtime === 'opencode' ? { systemPrompt: [OPENCODE_LINE] } : {}),
  }
}

export default start
