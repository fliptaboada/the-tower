/**
 * Workers messaging each other through the tower (the `message` verb), recorded in a sandbox: BEAGLE-89 on Claude
 * (`tower-message-claude`) and SHACKLETON-91 on opencode (`tower-message-opencode`, kept without its screen output,
 * which none of this reads). BEAGLE-89's SendMessage to SHACKLETON-91 is refused by Claude, which knows no session by
 * that name, and delivered by the tower mod through the tower; SHACKLETON-91 answers with the plugin's SendMessage.
 * Then each is sent a message while it works, by `tower message` run as the other: opencode takes it into the running
 * execution at its next step, Claude in a turn of its own once the running one ends.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conversationsOf } from '../src/bridge/conversation.ts'
import { factsOf } from '../src/bridge/facts.ts'
import { floorMessages, messagesOf } from '../src/bridge/messages.ts'
import { briefOf } from '../src/bridge/turns.ts'
import { CALLSIGNS, callsigns } from '../src/shared/callsign.ts'
import { fromTowerMessage, towerMessage } from '../src/shared/inbox.ts'
import { fixture } from './replay.ts'

const callsign = callsigns(CALLSIGNS)
const logs = [fixture('tower-message-claude'), fixture('tower-message-opencode')]
const sessions = logs.map((log) => ({ header: log.header, facts: factsOf(log) }))
const [claude, opencode] = sessions
const logOf = (id: string) => logs.find((l) => l.header.id === id)!

const PING = 'Ping from BEAGLE-89: reply to BEAGLE-89 with the words pong for BEAGLE, using your SendMessage tool.'
const WHILE_OPENCODE_WORKED = 'Second message from BEAGLE-89, sent while you worked: answer it with the single word noted, in your reply here, no SendMessage.'
const WHILE_CLAUDE_SLEPT = 'Message from SHACKLETON-91, sent while you worked: answer it with the single word received, no SendMessage.'
const WHILE_CLAUDE_WORKED = 'Third message from SHACKLETON-91, sent while you worked: answer it with the single word third, no SendMessage.'

test('an envelope names its sender, read whole or inside the words Claude puts around a plugin\'s prompt', () => {
  const sent = towerMessage('BEAGLE-89', 'two\nlines')
  assert.deepEqual(fromTowerMessage(sent), { name: 'BEAGLE-89', text: 'two\nlines' })
  assert.deepEqual(fromTowerMessage(`The tower plugin sent a message:\n${sent}\n\nAddress the message above.`), { name: 'BEAGLE-89', text: 'two\nlines' })
  assert.equal(fromTowerMessage('<tower-message from="X">no newlines</tower-message>'), undefined)
})

test('messages through the tower go from each sender to the session that took them in, both ways, a refused SendMessage counted once', () => {
  const said = messagesOf(sessions, 'lab', logOf, callsign).map(({ from, address, to, text }) => [from.callsign, from.harness, address, to?.callsign, to?.harness, text])
  assert.deepEqual(said, [
    ['BEAGLE-89', 'claude', 'SHACKLETON-91', 'SHACKLETON-91', 'opencode', PING],
    ['SHACKLETON-91', 'opencode', 'BEAGLE-89', 'BEAGLE-89', 'claude', 'pong for BEAGLE'],
    ['BEAGLE-89', 'claude', 'SHACKLETON-91', 'SHACKLETON-91', 'opencode', WHILE_OPENCODE_WORKED],
    ['SHACKLETON-91', 'opencode', 'BEAGLE-89', 'BEAGLE-89', 'claude', WHILE_CLAUDE_SLEPT],
    ['SHACKLETON-91', 'opencode', 'BEAGLE-89', 'BEAGLE-89', 'claude', WHILE_CLAUDE_WORKED],
  ])
  assert.deepEqual(floorMessages(sessions), new Map([['lab', { all: 5, delivered: 5 }]]))
})

test('a message through the tower is a peer\'s prompt, on Claude and on opencode, and never the user\'s latest prompt', () => {
  assert.deepEqual(claude.facts.prompts.map(([, origin]) => origin), ['composer', 'composer', 'peer', 'composer', 'peer', 'composer', 'peer'])
  assert.deepEqual(opencode.facts.prompts.map(([, origin]) => origin), ['composer', 'peer', 'composer', 'composer', 'peer'])
  assert.equal(conversationsOf(logs[1]).at(-1)!.prompt, 'Run the shell command: sleep 25 . Then answer only: slept again.')
})

test('a message through the tower opens a turn from the worker that sent it; Claude takes one sent mid-turn once the turn ends', () => {
  const turnsOf = (s: typeof claude) => briefOf(s, sessions, logOf, 9, callsign)[0].turns.map(({ prompt, from, answer }) => [prompt, from, answer])
  const fromOpencode = { callsign: 'SHACKLETON-91', session: opencode.header.id }
  const fromClaude = { callsign: 'BEAGLE-89', session: claude.header.id }
  assert.deepEqual(turnsOf(claude).slice(2), [
    ['pong for BEAGLE', fromOpencode, 'SHACKLETON-91 replied: "pong for BEAGLE". That completes the ping, and the message asks nothing of me, so I have no further action.'],
    ['Run the Bash command: sleep 25 . Then answer only: slept.', undefined, "The sleep was blocked: the harness doesn't allow a standalone `sleep 25` in the foreground, so I have not slept."],
    [WHILE_CLAUDE_SLEPT, fromOpencode, 'received'],
    ['Run this Bash command exactly once, and wait for it: node -e \'setTimeout(() => console.log("waited"), 20000)\' . Then answer only: waited.', undefined, 'waited'],
    [WHILE_CLAUDE_WORKED, fromOpencode, 'third'],
  ])
  assert.deepEqual(turnsOf(opencode).map(([prompt, from, answer]) => [prompt, from, answer]), [
    ['You are a test worker in a sandbox. Answer only: ready. Then wait: other workers will message you; do what their messages ask, briefly.', undefined, 'ready'],
    [PING, fromClaude, 'Sent pong for BEAGLE to BEAGLE-89.'],
    ['Run the shell command: sleep 25 . Then answer only: slept.', undefined, 'slept'],
    ['Run the shell command: sleep 25 . Then answer only: slept again.', undefined, undefined],
    [WHILE_OPENCODE_WORKED, fromClaude, 'noted'],
  ])
})

test('a message sent is a step of the turn that sent it, to the worker that took it in', () => {
  const [, ping] = briefOf(opencode, sessions, logOf, 9, callsign)[0].turns
  assert.deepEqual(ping.steps.flatMap((s) => (s.t === 'sent' ? [[s.to.callsign, s.to.session, s.text]] : [])), [['BEAGLE-89', claude.header.id, 'pong for BEAGLE']])
})
