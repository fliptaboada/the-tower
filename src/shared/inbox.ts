/**
 * A message one worker sends another through the tower (the `message` verb, decision `opencode-harness`): the tower
 * wraps its text in an envelope naming the sender's callsign and hands it to the receiver's inbox (`src/mod/inbox.ts`),
 * whose harness takes it in as a prompt. The receiver's log holds the envelope in its prompt, so the bridge reads who
 * sent it from the receiver's own log, with no fact to race it.
 */

/**
 * The `code` an inbox answers with when its harness is in no conversation yet, given no prompt: opencode's plugin can
 * open one but can't show it in the TUI, so the tower types the message into the worker's composer instead, and the
 * TUI opens the conversation as it does for any first prompt.
 */
export const NO_CONVERSATION = 'no_conversation'

/** A worker's message as the receiver's model reads it, and its log keeps it. */
export const towerMessage = (from: string, text: string): string => `<tower-message from="${from}">\n${text}\n</tower-message>`

/**
 * The envelope anywhere in a prompt: opencode logs the prompt its plugin queued as it was given, while Claude logs a
 * plugin's prompt inside words of its own ("The tower plugin sent a message: …").
 */
const ENVELOPE = /<tower-message from="([^"]*)">\n([\s\S]*?)\n<\/tower-message>/

/**
 * The sender's callsign and the text as sent, of a prompt that holds a worker's message through the tower; else
 * `undefined`. Claude says who gave a prompt, and one a person typed (`USER_ORIGINS`) is never read for one; opencode's
 * inbox doesn't, so there an envelope the user typed whole reads as the worker's message it copies.
 */
export const fromTowerMessage = (prompt: string): { name: string; text: string } | undefined => {
  const match = ENVELOPE.exec(prompt)
  return match ? { name: match[1], text: match[2] } : undefined
}
