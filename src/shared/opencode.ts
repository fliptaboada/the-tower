/**
 * The opencode releases the tower is tested on (decision `opencode-harness`): opencode 2, whose plugin API replaced
 * version 1's. A session outside the range is flagged as Claude's are (`card.runtimeUntested`,
 * `board.runtimes.opencode.untested`).
 */
import type { TestedRange } from './claude.ts'

/** The lowest and the highest release the tower's opencode plugin and the bridge's reading of its events were checked on. */
export const OPENCODE_TESTED: TestedRange = { lowest: '2.2.0', highest: '2.2.0' }

/** What a renderer prints for opencode's runtime instead of naming it. */
export const OPENCODE_LABEL = 'opencode'
