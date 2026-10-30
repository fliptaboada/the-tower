import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf } from '../src/bridge/facts.ts'
import { floorMessages, messagesOf } from '../src/bridge/messages.ts'
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
