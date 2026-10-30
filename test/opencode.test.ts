import assert from 'node:assert/strict'
import { test } from 'node:test'
import { continuations } from '../src/bridge/chains.ts'
import { conversationsOf } from '../src/bridge/conversation.ts'
import { factsOf } from '../src/bridge/facts.ts'
import { nextState, BOOTING } from '../src/bridge/status.ts'
import { briefOf } from '../src/bridge/turns.ts'
import { launchPrompt } from '../src/shared/launch.ts'
import { CALLSIGNS, callsigns } from '../src/shared/callsign.ts'
import { fixture, timeline } from './replay.ts'

const callsign = callsigns(CALLSIGNS)
const CONVERSATION = 'ses_e7bc417bdffepmablGOpfW0Xe1'
const SUBAGENT_PROMPT = 'Use your subagent tool to start a general subagent that reads README.md and reports what it says. Read no file yourself. Then tell me what it reported, in one line. '
const SUBAGENT_ANSWER = 'The subagent reported that `README.md` at `/private/tmp/tower-lestrade-38/lab/README.md` is just one line — `# lab` — a single heading with no other content.'

test('an opencode 2 session: a question waits on the user, a subagent\'s too; a refusal and an Esc leave it idle, and so does a /compact', () => {
  assert.deepEqual(timeline(fixture('opencode-turns')), [
    ['idle', 0.46],
    ['working', 1.437],
    ['needs_input', 6.495],
    ['working', 7.408],
    ['done', 8.946],
    ['working', 9.633],
    ['done', 12.065],
    ['working', 12.873],
    ['needs_input', 14.089],
    ['working', 15.047],
    ['idle', 15.062],
    ['working', 16.222],
    ['idle', 22.461],
    ['working', 23.63],
    ['needs_input', 35.965],
    ['working', 37.28],
    ['done', 40.334],
    ['working', 41.427],
    ['idle', 45.047],
    ['exited', 45.732],
  ])
})

test('an opencode /compact is a manual compaction, from its start to its end', () => {
  const compactions: [number, string | undefined][] = []
  let state = BOOTING
  for (const event of fixture('opencode-turns').events) {
    const next = nextState(state, event)
    if (next.compaction?.trigger !== state.compaction?.trigger) compactions.push([event[0], next.compaction?.trigger])
    state = next
  }
  assert.deepEqual(compactions, [[41.428, 'manual'], [45.047, undefined]])
})

test("an opencode session's facts: its harness, model, steps, asks, and only the turns that ran to their end counted", () => {
  const log = fixture('opencode-turns')
  const facts = factsOf(log)
  assert.equal(facts.harness, 'opencode')
  assert.equal(facts.model, 'opencode/big-pickle')
  assert.equal(facts.tokens.length, 7)
  assert.equal(facts.turns, 3)
  assert.equal(facts.turnSpans.length, 5)
  assert.equal(facts.asks.length, 3)
  assert.equal(facts.tool, 'subagent Read README and report')
  assert.deepEqual(facts.prompts.map(([, origin]) => origin), ['composer', 'composer', 'composer', 'composer', 'composer'])
  assert.equal(launchPrompt(log.header.argv), 'Run the shell command `tower whoami` and tell me your callsign, in one line.')
})

test("an opencode session's conversation is its opencode session, with the user's latest prompt and the latest answer", () => {
  assert.deepEqual(conversationsOf(fixture('opencode-turns')), [
    { id: CONVERSATION, at: 1.373, resumed: false, saved: true, prompt: SUBAGENT_PROMPT, answer: SUBAGENT_ANSWER },
  ])
})

test("a resumed opencode session goes on in the same conversation, its worker's, and its brief goes on from the turns before", () => {
  const logs = [fixture('opencode-turns'), fixture('opencode-resumed')]
  const sessions = logs.map((log) => ({ header: log.header, facts: factsOf(log) }))
  assert.deepEqual(timeline(logs[1]), [['idle', 0.472], ['working', 0.549], ['done', 2.123], ['exited', 2.465]])
  const prompt = 'From this conversation alone, without running anything: what was your callsign? One line.'
  assert.deepEqual(conversationsOf(logs[1]), [{ id: CONVERSATION, at: 0.529, resumed: true, saved: true, prompt, answer: 'JOHNNY-50.' }])
  assert.equal(continuations(sessions).get(sessions[1]), sessions[0])
  const logOf = (id: string) => logs.find((l) => l.header.id === id)!
  const [brief] = briefOf(sessions[1], sessions, logOf, 2, callsign)
  assert.deepEqual(brief.turns.map((t) => [t.prompt, t.answer]), [
    [SUBAGENT_PROMPT, SUBAGENT_ANSWER],
    [prompt, 'JOHNNY-50.'],
  ])
  assert.equal(brief.session.harness, 'opencode')
})
