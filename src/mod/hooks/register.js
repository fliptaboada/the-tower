/**
 * Posts Claude Code events to the host, which appends each to the session's log as an `h` event named by
 * `hook_event_name`. An event under Claude's name carries Claude's input for it, and Claude's result under
 * `result` where the hook awaits one (`agent.spawn`'s names the started subagent's `agentId`, which its loop's events
 * carry; `tool.check` leaves out the tool input that its `tool.call` carries, and `session.compact` counts the
 * messages it summarizes, which hold the whole conversation).
 * What this mod derives is posted under `tower.*` (`tower.claude`: the release of Claude the session runs, as it starts). Each hook awaits its post, so events reach the log in the
 * order Claude raised them.
 *
 * It also carries the messages workers send through the tower: it takes this session's (`takeMessages`), and sends
 * through the tower a SendMessage Claude can't deliver itself, one to a worker on opencode (`throughTower`).
 */

/**
 * The part of Claude Code's mods API this module calls. Claude writes the whole API's types for each of its builds,
 * beside a mod it loads (`.claude-plugin/types/claude-code/index.d.ts`); they are not in the repo. Event inputs and
 * results are Claude's, forwarded as they come.
 * @typedef {{
 *   env: { get(name: string): Promise<string | undefined> },
 *   http: { fetch(url: string, init: { method: string, socketPath?: string, headers: Record<string, string>, body: string }): Promise<{ ok: boolean, status: number }> },
 *   session: { version(): Promise<object> },
 *   plugin: { root: string },
 *   process: {
 *     run(argv: string[], init: object): Promise<{ exitCode: number, stdout: string, stderr: string }>,
 *     spawn(request: { argv: string[] }): AsyncIterable<{ stream: 'stdout' | 'stderr', text: string }>,
 *   },
 *   prompt: { submit(input: { text: string }): Promise<unknown> },
 *   ui: { log(text: string, options: { to: 'debug' }): void },
 * }} Engine
 * @typedef {((e: any) => any) & { signal: AbortSignal }} Next
 * @typedef {(event: string, hook: ($: Engine, e: any, next: Next) => unknown) => void} On
 */

/**
 * Tool calls whose event was abandoned (the user denied the permission, or interrupted the turn), until the
 * `turn.complete` of their loop. An abandoned event cancels the mods API calls made within it, so the call
 * can't be posted when it settles.
 * @type {{ tool: string, tool_use_id: string, agentId: string | undefined }[]}
 */
let abandoned = []

/** @param {Engine} $ @param {string} name @param {object} data */
async function forward($, name, data) {
  const socketPath = await $.env.get('TOWER_HOOKS_SOCKET')
  const sessionId = await $.env.get('TOWER_SESSION_ID')
  const response = await $.http.fetch(`http://host/hooks/${sessionId}`, {
    method: 'POST',
    socketPath,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...data, hook_event_name: name }),
  })
  if (!response.ok) throw new Error(`host answered ${response.status} to ${name}`)
}

/**
 * Takes the messages the tower delivers to this session for its life: the inbox listener (`../inbox.ts`) prints each
 * as a JSON line `{text}`, submitted as a prompt of this mod's, which waits for the session to be free. Messages go in
 * the order they came. A listener that ends (its inbox taken, node missing) says why in the debug log.
 * @param {Engine} $
 */
async function takeMessages($) {
  const listener = $.process.spawn({ argv: ['node', `${$.plugin.root}/inbox.ts`] })
  let pending = ''
  for await (const piece of listener) {
    if (piece.stream === 'stderr') {
      $.ui.log(`tower inbox: ${piece.text}`, { to: 'debug' })
      continue
    }
    if (piece.stream !== 'stdout') continue
    const lines = (pending + piece.text).split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) await $.prompt.submit({ text: JSON.parse(line).text })
  }
}

/**
 * A SendMessage Claude couldn't deliver, to a name no Claude session on the machine carries (a worker on opencode), is
 * the tower's to deliver, by callsign (`tower message`), which logs it in this session as `tower.message`. Claude's
 * tool answers such a name `{success: false, message}` before it raises `session.send`, so the call's result is
 * replaced, in the tool's shape: the tower's answer, or both refusals.
 * @param {Engine} $ @param {any} e @param {any} result
 */
async function throughTower($, e, result) {
  if (e.tool !== 'SendMessage' || result.result?.success !== false || typeof e.to !== 'string' || typeof e.message !== 'string') return result
  const tower = await $.process.run([`${$.plugin.root}/bin/tower`, 'message', e.to, e.message], {})
  return tower.exitCode === 0
    ? { result: { success: true, message: tower.stdout.trim() } }
    : { result: { success: false, message: `${result.result.message}\nThrough the tower: ${tower.stderr.trim()}` } }
}

/** @param {On} on */
export function register(on) {
  on('session.start', async ($, e, next) => {
    await forward($, 'session.start', e)
    const result = await next(e)
    await forward($, 'tower.claude', await $.session.version())
    void takeMessages($).catch((err) => $.ui.log(`tower inbox: ${err.message}`, { to: 'debug' }))
    return result
  })
  on('session.end', async ($, e, next) => {
    await forward($, 'session.end', e)
    return next(e)
  })
  on('session.compact', async ($, e, next) => {
    await forward($, 'session.compact', { trigger: e.trigger, instructions: e.instructions, messageCount: e.messages.length })
    return next(e)
  })
  on('session.measure', async ($, e, next) => {
    await forward($, 'session.measure', e)
    return next(e)
  })
  on('session.attach', async ($, e, next) => {
    await forward($, 'session.attach', e)
    return next(e)
  })
  on('session.detach', async ($, e, next) => {
    await forward($, 'session.detach', e)
    return next(e)
  })
  on('session.receive', async ($, e, next) => {
    await forward($, 'session.receive', e)
    return next(e)
  })
  on('session.send', async ($, e, next) => {
    const sent = await next(e)
    await forward($, 'session.send', { ...e, result: sent })
    return sent
  })
  on('prompt.submit', async ($, e, next) => {
    await forward($, 'prompt.submit', e)
    return next(e)
  })
  on('command.run', async ($, e, next) => {
    await forward($, 'command.run', e)
    return next(e)
  })
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    await forward($, 'agent.spawn', { ...e, result: { model: result.model, agentId: result.agentId, deny: result.deny } })
    return result
  })
  on('turn.start', async ($, e, next) => {
    await forward($, 'turn.start', e)
    return next(e)
  })
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (!next.signal.aborted) await forward($, 'turn.step', { ...e, result: { stopReason: result.stopReason, usage: result.usage, answer: result.answer } })
    return result
  })
  on('turn.complete', async ($, e, next) => {
    for (const call of abandoned.filter((call) => call.agentId === e.agentId)) {
      await forward($, 'tower.tool.abandoned', { ...call, turnId: e.turnId })
    }
    abandoned = abandoned.filter((call) => call.agentId !== e.agentId)
    await forward($, 'turn.complete', e)
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    await forward($, 'tool.call', e)
    const result = await throughTower($, e, await next(e))
    if (next.signal.aborted) abandoned.push({ tool: e.tool, tool_use_id: e.tool_use_id, agentId: e.agentId })
    else await forward($, 'tower.tool.result', { tool: e.tool, tool_use_id: e.tool_use_id, agentId: e.agentId, deny: result.deny, isError: result.isError })
    return result
  })
  on('tool.check', async ($, e, next) => {
    const result = await next(e)
    await forward($, 'tool.check', { tool: e.tool, tool_use_id: e.tool_use_id, result })
    return result
  })
}
