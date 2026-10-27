---
{
  "type": "decision",
  "name": "Files: any file of a worker's repos found, opened as a tab and edited, written only at the version read",
  "summary": "The tower lists every file in a session's repos but those in folders git ignores, reads one as text with its mtime as its version, and writes one only while it is still at the version read; a renderer finds files with a fuzzy query, opens each as a tab of the worker's header (the open ones the viewer's, in tower.store, past four folded into a +N menu) and edits it in CodeMirror, following the worker's edits to a file it holds none of.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-27",
  "reviewed": "2026-10-27",
  "refs": ["hub/src/files.ts#filesIn", "hub/src/files.ts#readText", "hub/src/files.ts#writeText", "hub/src/files.ts#insideOf", "hub/src/tower/server.ts#fileOfSession", "hub/src/shared/api.ts#QUERIES", "hub/src/shared/api.ts#VERBS", "hub/src/shared/files.ts#rankFiles", "hub/src/shared/files.ts#fuzzy", "hub/src/shared/files.ts#fileTabsOf", "hub/src/shared/editor.ts#mountEditor", "hub/src/shared/keymap.ts#COMMANDS", "hub/renderers/page/files-pane.js", "hub/test/server.test.ts"],
  "links": [
    { "to": "tower-server", "verb": "uses", "carries": "GET /files/<id>, GET /file/<id>?path, POST /file/write {id, path, content, modifiedAt}" }
  ]
}
---
**Problem.** Reading or fixing one line of a worker's file meant leaving the tower for an editor, opened through
`edit` only from a diff, a note or a file the worker showed. Nothing let the viewer browse a worker's files.

**Decision.** The capability is in the core, as reads and a verb any renderer composes ([[renderer-is-disposable]]):
- **Which files.** [`filesIn`](ref:hub/src/files.ts#filesIn) lists each of the session's dirs that is a repo (its
  cwd and its checkout's others, as `/changes` reads them, [[changes-view]]) through
  `git ls-files`: tracked, untracked and ignored files, a folder git ignores left out whole (`--directory` names it
  once: `node_modules/`, a build's `out/`), so the ignored files a worker keeps of its own (`.env`, local notes) are
  found; capped per repo (`MAX_FILES`, the rest counted). Read on every request, never kept.
- **Inside the session's directories only.** A path is read or written only when, links followed in both, it lies
  inside one of those dirs ([`fileOfSession`](ref:hub/src/tower/server.ts#fileOfSession)); else `not_found`.
- **Read whole, as text.** [`readText`](ref:hub/src/files.ts#readText) refuses a file past 2 MB or holding a NUL
  byte, never follows a symlink, and answers its text with its version, its mtime in whole ms, as a collection item's
  ([[collections]]).
- **Written at the version read.** [`writeText`](ref:hub/src/files.ts#writeText) replaces a plain file's text in
  place (mode and links kept) only while its version is the one named; once it moved, `refused`. The worker edits the
  same files beside the viewer, so this is the common case, not an edge. It never creates a file.
- **Found.** [`rankFiles`](ref:hub/src/shared/files.ts#rankFiles) (served `/files.js`) ranks the list by a fuzzy
  subsequence match, the file's own name and runs of letters first; with no query, the files open in tabs first.
  The tower page opens it on ⌘P (`find-file` in the keymap, [[keymap]]), global, so it reaches the page from the
  terminal too.
- **Open as tabs, the viewer's.** Which files a worker has open is view state: absolute paths per session in
  `tower.store` (`OPEN_FILES_KEY`), not a fact in any log. A file's pane is `file:<path>`, so a link naming one opens
  its tab. [`fileTabsOf`](ref:hub/src/shared/files.ts#fileTabsOf) shows the first four as tabs, the selected one always
  among them, and folds the rest into a `+N` menu.
- **Edited.** [`mountEditor`](ref:hub/src/shared/editor.ts#mountEditor) (served `/editor.js`, fetched when the first
  file opens) is CodeMirror coloured from the design's `--syn-*` tokens, its language told by the file's name. The
  renderer saves with `file/write` on ⌘S. While a file is shown it is read again every 2 s: a new version replaces an
  editor holding no edits, and marks one holding edits stale, offering Reload (lose the edits) or Overwrite (save over
  what is on disk now).

**Consequences.** Any renderer, Tower 3D's desk included, can offer the same finder and editor from `/files.js` and
`/editor.js`. Edits not saved live only in the page, which asks before it unloads with any.
