import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf } from '../src/bridge/facts.ts'
import { floorMessages, messagesOf } from '../src/bridge/messages.ts'
import { floorTurnsOf } from '../src/bridge/turns.ts'
import { CALLSIGNS, callsigns } from '../src/shared/callsign.ts'
import { fixture } from './replay.ts'

const callsign = callsigns(CALLSIGNS)

test("a floor's messages carry their texts, each from its sender to the session that received it, whatever the address", () => {
  const logs = [fixture('peer-sender'), fixture('peer-receiver')]
  const sessions = logs.map((log) => ({ header: log.header, facts: factsOf(log) }))
  const [sender, receiver] = sessions.map((s) => s.header.id)
  const logOf = (id: string) => logs.find((l) => l.header.id === id)!
  const said = messagesOf(sessions, 'lab', logOf, callsign).map(({ from, address, to, text }) => [from.callsign, from.session, address, to?.callsign, to?.session, text])
  assert.deepEqual(said, [
    ['BEOWULF-38', sender, 'BISHOP-44', 'BISHOP-44', receiver, 'Ping from BEOWULF-38 (lab floor). Please reply with the single word you were asked to send.'],
    ['BISHOP-44', receiver, 'uds:/tmp/cc-socks/20932.sock', 'BEOWULF-38', sender, 'pong'],
  ])
  assert.deepEqual(messagesOf(sessions, 'elsewhere', logOf, callsign), [])
  assert.deepEqual(messagesOf([sessions[0]], 'lab', logOf, callsign).map(({ to, text }) => [to, text]), [[undefined, 'Ping from BEOWULF-38 (lab floor). Please reply with the single word you were asked to send.']])
  assert.deepEqual(floorMessages(sessions), new Map([['lab', { all: 2, delivered: 2 }]]))
})

test("a floor's prompts and answers beside its messages: a message opens no prompt, a hired worker's first prompt is its hirer's brief", () => {
  const logs = [fixture('peer-sender'), fixture('peer-receiver')]
  const sessions = logs.map((log) => ({ header: log.header, facts: factsOf(log) }))
  const logOf = (id: string) => logs.find((l) => l.header.id === id)!
  const told = (of: typeof sessions) => floorTurnsOf(of, 'lab', logOf, callsign).map(({ worker, kind, text, by }) => [worker.callsign, kind, text.split(/[ .]/)[0], by?.callsign])
  assert.deepEqual(told(sessions), [
    ['BISHOP-44', 'prompt', 'When', undefined],
    ['BISHOP-44', 'answer', 'ready', undefined],
    ['BEOWULF-38', 'prompt', 'With', undefined],
    ['BEOWULF-38', 'answer', 'I\'ve', undefined],
    ['BEOWULF-38', 'answer', 'pong', undefined],
    ['BISHOP-44', 'answer', 'I', undefined],
  ])
  // As if BEOWULF-38 had hired BISHOP-44 (`tower hire`): the prompt BISHOP-44 started on is its brief.
  const hired = [{ ...sessions[0], facts: { ...sessions[0].facts, hired: [sessions[1].header.id] } }, sessions[1]]
  assert.deepEqual(told(hired).map(([who, kind, , by]) => [who, kind, by]).slice(0, 3), [['BISHOP-44', 'prompt', 'BEOWULF-38'], ['BISHOP-44', 'answer', undefined], ['BEOWULF-38', 'prompt', undefined]])
  assert.deepEqual(floorTurnsOf(sessions, 'elsewhere', logOf, callsign), [])
})
