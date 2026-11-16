/**
 * The messages extension's module in every Claude session on a floor where it is on. It takes the messages the tower
 * delivers to this session (`takeMessages`), and hands the tower a SendMessage Claude couldn't deliver itself
 * (`throughTower`): one to a worker on opencode, which carries no name Claude knows.
 */

/**
 * The part of Claude Code's mods API this module calls. Claude writes the whole API's types for each of its builds,
 * beside a mod it loads (`.claude-plugin/types/claude-code/index.d.ts`); they are not in the repo.
 * @typedef {{
 *   plugin: { root: string },
 *   process: {
 *     run(argv: string[], init?: object): Promise<{ exitCode: number, stdout: string, stderr: string }>,
 *     spawn(request: { argv: string[] }): AsyncIterable<{ stream: 'stdout' | 'stderr', text: string }>,
 *   },
 *   prompt: { submit(input: { text: string }): Promise<unknown> },
 *   ui: { log(text: string, options: { to: 'debug' }): void },
 * }} Engine
 * @typedef {((e: any) => any) & { signal: AbortSignal }} Next
 * @typedef {(event: string, hook: ($: Engine, e: any, next: Next) => unknown) => void} On
 */

/** A worker's callsign: what the tower can deliver to, unlike a Claude session's other names. */
const CALLSIGN = /^[A-Za-z][A-Za-z0-9]*-\d+$/

/**
 * The `tower` command: the tower mod's, in the checkout this bundled extension is part of. The module's own
 * environment may not hold the mod's `bin/` on its PATH.
 * @param {Engine} $
 */
const towerOf = ($) => `${$.plugin.root}/../../../src/mod/bin/tower`

/**
 * Takes the messages the tower delivers to this session for its life: the listener (`../listen.ts`) prints each as
 * a JSON line `{text}`, submitted as a prompt of this plugin's, which waits for the session to be free. Messages go in
 * the order they came. A listener that ends (its inbox taken, node missing) says why in the debug log.
 * @param {Engine} $
 */
async function takeMessages($) {
  const listener = $.process.spawn({ argv: ['node', `${$.plugin.root}/listen.ts`] })
  let pending = ''
  for await (const piece of listener) {
    if (piece.stream === 'stderr') {
      $.ui.log(`tower inbox: ${piece.text}`, { to: 'debug' })
      continue
    }
    const lines = (pending + piece.text).split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) await $.prompt.submit({ text: JSON.parse(line).text })
  }
}

/**
 * A SendMessage Claude refused, to a callsign, is the tower's to try (`tower x messages send`), which logs it in this
 * session as the fact `sent`. Claude's tool answers a name no Claude session carries with its own refusal whatever a
 * `session.send` hook returns, so the call's result is replaced here, in the tool's shape: the tower's answer, or both
 * refusals. The tower refuses a pair both on Claude, so a refusal Claude meant (the worker gone, a hook's policy) stands.
 * @param {Engine} $ @param {any} e @param {any} result
 */
async function throughTower($, e, result) {
  if (e.tool !== 'SendMessage' || result.result?.success !== false || typeof e.to !== 'string' || !CALLSIGN.test(e.to) || typeof e.message !== 'string') return result
  const tower = await $.process.run([towerOf($), 'x', 'messages', 'send', e.to, '--text', e.message])
  return tower.exitCode === 0
    ? { result: { success: true, message: tower.stdout.trim() } }
    : { result: { success: false, message: `${result.result.message}\nThrough the tower: ${tower.stderr.trim()}` } }
}

/** @param {On} on */
export function register(on) {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    void takeMessages($).catch((err) => $.ui.log(`tower inbox: ${err.message}`, { to: 'debug' }))
    return result
  })
  on('tool.call', async ($, e, next) => throughTower($, e, await next(e)))
}
