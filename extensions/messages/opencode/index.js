// The messages extension's plugin for opencode v2, loaded beside the tower's own into every opencode session on a floor
// where the extension is on. opencode has no messages between workers of its own, so it gives one both ways:
//
// - It listens on the session's inbox (`../inbox.ts`) and queues each message the tower delivers on the conversation
//   the tower names with it, where it waits for the turn running to end.
// - It adds a `SendMessage` tool, `{to, message}` as Claude Code's, which runs `tower x messages send` and so reaches
//   any worker on duty, on Claude or opencode, by its callsign.
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { listenInbox, ownInbox } from '../inbox.ts'

/** The `tower` command: the tower mod's, in the checkout this bundled extension is part of. */
const TOWER = fileURLToPath(new URL('../../../src/mod/bin/tower', import.meta.url))

/**
 * A tool's input or output schema as opencode 2 takes it, a Standard Schema with its JSON Schema: `check` validates a
 * value, `json` is what the model reads.
 * @param {object} json @param {(value: any) => boolean} check @param {string} expected
 */
const schema = (json, check, expected) => ({
  '~standard': {
    version: 1,
    vendor: 'tower',
    validate: (value) => (check(value) ? { value } : { issues: [{ message: `expected ${expected}` }] }),
    jsonSchema: { input: () => json, output: () => json },
  },
})

const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The tool a worker messages another by, named and shaped as Claude Code's. */
const SEND_MESSAGE = {
  name: 'SendMessage',
  options: { codemode: false },
  description:
    'Send a message to another worker in the tower, by its callsign (like HOLMES-42; `tower agents` lists who is on duty), ' +
    'whether it runs on Claude or opencode. It reaches the worker once it is free, signed with your callsign. A message ' +
    'from another worker comes to you as <tower-message from="CALLSIGN">: answer it with this tool, to that callsign.',
  input: schema(
    {
      type: 'object',
      properties: {
        to: { type: 'string', description: "The worker's callsign" },
        message: { type: 'string', description: 'The message: the other worker has none of your context' },
      },
      required: ['to', 'message'],
      additionalProperties: false,
    },
    (value) => isText(value?.to) && isText(value?.message),
    '{to, message}, both text',
  ),
  output: schema({ type: 'string' }, (value) => typeof value === 'string', 'text'),
  /** @param {{ to: string, message: string }} input @param {{ signal: AbortSignal }} ctx */
  execute: ({ to, message }, { signal }) =>
    new Promise((resolve, reject) => {
      execFile(TOWER, ['x', 'messages', 'send', to, '--text', message], { signal }, (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message).trim()))
        const said = stdout.trim()
        resolve({ output: said, content: [{ type: 'text', text: said }] })
      })
    }),
}

export default {
  id: 'tower.messages',
  async setup(ctx) {
    await ctx.tool.transform((tools) => tools.add(SEND_MESSAGE))
    /**
     * Queued on the conversation the tower saw the worker enter last: this server process can't tell a resumed one
     * itself, which the TUI opens in its own process (`-s`) and raises nothing of until it runs.
     */
    return listenInbox(ownInbox(), async ({ text, conversation }) => {
      if (!conversation) throw new Error('it has no conversation yet: it takes messages once it was given a first prompt')
      await ctx.session.prompt({ sessionID: conversation, text })
    })
  },
}
