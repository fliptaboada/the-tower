/**
 * The tower's opencode plugin, loaded into every opencode session the tower starts (`src/shared/launch.ts`): what the
 * tower mod is to Claude. opencode 2 loads it from this directory. It posts the events of the session's main
 * conversation to the host, which appends each to the session's log as an `h` event named by `hook_event_name`: an
 * event or hook under opencode's name, prefixed `opencode.`, carries opencode's data, trimmed to what the bridge reads;
 * what the plugin derives is posted under `tower.*`. A subagent's session (one with a parent) is left out, but for its
 * questions: opencode asks the user them in the main loop's TUI, which waits on the answer. Posts go one at a time, in
 * the order opencode raised them.
 *
 *   tower.opencode                        {version}: the plugin started, the session is at its composer
 *   tower.opencode.session                {sessionID, resumed}: the main loop entered an opencode session, a new one
 *                                         (`/new`, a first prompt) or one saved before (`--session`)
 *   opencode.session.inbox.enqueued       {sessionID, item: {type, payload: {text}}}: a prompt (`user`) or a
 *                                         `/compact` (`compaction`) taken in
 *   opencode.session.execution.started    {sessionID}: the loop started on what the inbox holds
 *   opencode.session.execution.succeeded  {sessionID}: the turn ended
 *   opencode.session.execution.interrupted {sessionID, reason}: Esc (`user`), or a refused permission
 *   opencode.session.execution.failed     {sessionID, error: {type, message}}
 *   opencode.session.step.started         {sessionID, assistantMessageID, agent, model: {id, providerID}}
 *   opencode.session.step.ended           {sessionID, assistantMessageID, finish, cost, tokens}: one model call
 *   opencode.session.step.failed          {sessionID, assistantMessageID, error, cost?, tokens?}
 *   opencode.session.text.ended           {sessionID, assistantMessageID, text}: a block of the answer, whole
 *   opencode.session.compaction.started   {sessionID, reason}: `manual` for `/compact`
 *   opencode.session.compaction.ended     {sessionID, reason}
 *   opencode.permission.asked             {sessionID, id, action, resources}: opencode asks the user
 *   opencode.permission.replied           {sessionID, requestID, reply}
 *   opencode.tool.execute.before          {sessionID, tool, id, input}: the tool hook's, `input` keeping the few
 *                                         fields a tool is labelled by
 *
 * It also puts the tower mod's `bin/` (the `tower` command) first on the PATH of the session's shells, adds the
 * tower's brief (`TOWER_BRIEF`) to every request's system prompt, and sends a resume's prompt (`TOWER_RESUME_PROMPT`)
 * to the session it resumes (`TOWER_RESUME_SESSION`), which opencode's TUI leaves unsent.
 */

import path from 'node:path'
import { Plugin } from '@opencode/plugin'

const BIN = path.join(import.meta.dirname, '..', 'bin')

/** The fields of a tool's input a card labels it by: a file's contents or an edit's text stay out of the log. */
const INPUT_KEYS = ['command', 'path', 'filePath', 'pattern', 'url', 'description', 'prompt']

/** @param {Record<string, unknown>} input */
const labelInput = (input) => Object.fromEntries(INPUT_KEYS.filter((key) => typeof input?.[key] === 'string').map((key) => [key, input[key]]))

/** The data of each event posted, as the bridge reads it, by event type. */
const TRIMS = {
  'session.inbox.enqueued': ({ sessionID, item }) => ({ sessionID, item: { type: item.type, payload: { text: item.payload?.text } } }),
  'session.execution.started': ({ sessionID }) => ({ sessionID }),
  'session.execution.succeeded': ({ sessionID }) => ({ sessionID }),
  'session.execution.interrupted': ({ sessionID, reason }) => ({ sessionID, reason }),
  'session.execution.failed': ({ sessionID, error }) => ({ sessionID, error }),
  'session.step.started': ({ sessionID, assistantMessageID, agent, model }) => ({ sessionID, assistantMessageID, agent, model: { id: model.id, providerID: model.providerID } }),
  'session.step.ended': ({ sessionID, assistantMessageID, finish, cost, tokens }) => ({ sessionID, assistantMessageID, finish, cost, tokens }),
  'session.step.failed': ({ sessionID, assistantMessageID, error, cost, tokens }) => ({ sessionID, assistantMessageID, error, cost, tokens }),
  'session.text.ended': ({ sessionID, assistantMessageID, text }) => ({ sessionID, assistantMessageID, text }),
  'session.compaction.started': ({ sessionID, reason }) => ({ sessionID, reason }),
  'session.compaction.ended': ({ sessionID, reason }) => ({ sessionID, reason }),
  'permission.asked': ({ sessionID, id, action, resources }) => ({ sessionID, id, action, resources }),
  'permission.replied': ({ sessionID, requestID, reply }) => ({ sessionID, requestID, reply }),
}

export default Plugin.define({
  id: 'tower',
  async setup(ctx) {
    const socket = process.env.TOWER_HOOKS_SOCKET
    const session = process.env.TOWER_SESSION_ID
    let queue = Promise.resolve()

    /** @param {string} name @param {object} data */
    const post = (name, data) => {
      queue = queue
        .then(async () => {
          const response = await fetch(`http://host/hooks/${session}`, {
            method: 'POST',
            unix: socket,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...data, hook_event_name: name }),
          })
          if (!response.ok) throw new Error(`host answered ${response.status} to ${name}`)
        })
        .catch((err) => console.error(`tower: ${err.message}`))
      return queue
    }

    /** Whether each session seen is the main loop's (`true`) or a subagent's. */
    const main = new Map()
    /** The main loop's session, the conversation it is in. */
    let current

    /** @param {{ id: string, parentID?: string }} info @param {boolean} resumed */
    const seen = async ({ id, parentID }, resumed) => {
      main.set(id, !parentID)
      if (parentID || id === current) return
      current = id
      await post('tower.opencode.session', { sessionID: id, resumed })
    }

    /** Whether `id` is the main loop's session, looked up once for a session saved before this one started. */
    const isMain = async (id) => {
      if (!main.has(id)) await seen(await ctx.session.get({ sessionID: id }), true)
      return main.get(id)
    }

    await post('tower.opencode', { version: ctx.app.version })

    const controller = new AbortController()
    void (async () => {
      for await (const { type, data } of ctx.event.subscribe({ types: ['session.created', ...Object.keys(TRIMS)], signal: controller.signal })) {
        if (type === 'session.created') {
          await seen({ id: data.sessionID, parentID: data.parentID }, false)
          continue
        }
        if (type === 'session.inbox.enqueued' && !['user', 'compaction'].includes(data.item.type)) continue
        if (type.startsWith('permission.') || (await isMain(data.sessionID))) await post(`opencode.${type}`, TRIMS[type](data))
      }
    })()

    await ctx.tool.hook('execute.before', async ({ tool, sessionID, id, input }) => {
      if (await isMain(sessionID)) await post('opencode.tool.execute.before', { sessionID, tool, id, input: labelInput(input) })
    })
    await ctx.shell.hook('create.before', (event) => {
      event.env.PATH = `${BIN}${path.delimiter}${event.env.PATH ?? process.env.PATH}`
    })
    await ctx.session.hook('context', (event) => {
      event.system.push({ type: 'text', text: process.env.TOWER_BRIEF })
    })

    const resumed = process.env.TOWER_RESUME_SESSION
    const prompt = process.env.TOWER_RESUME_PROMPT
    if (resumed && prompt) setTimeout(() => void ctx.session.prompt({ sessionID: resumed, text: prompt }))

    return () => controller.abort()
  },
})
