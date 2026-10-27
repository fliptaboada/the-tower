/**
 * A worker's files as a renderer opens them: found by a fuzzy query over `files/<id>` (`rankFiles`), drawn as a
 * finder (`finderHtml`), and kept open as tabs, the viewer's own in `tower.store` (`OPEN_FILES_KEY`), the ones past a
 * row's room folded into a `+N` menu (`fileTabsOf`). Pure: the renderer reads, draws and wires the data attributes:
 *
 *   data-find="<path>"   a finder row: open the file at that absolute path
 *
 * The tower serves this module as `/files.js`.
 */
import type { RepoFiles } from '../files.ts'
import { esc } from './cards.ts'

/** Where each worker's open files are kept in `tower.store`: absolute paths by session id, in the order they opened. */
export const OPEN_FILES_KEY = 'files.open'

/** The open files of every worker, as `OPEN_FILES_KEY` keeps them. */
export type OpenFiles = Record<string, string[]>

/** A file a finder offers: its absolute path, and how it reads in a list, the repo's name first when the worker has more than one. */
export type Found = { path: string; label: string; marks: number[] }

/** Rows a finder draws: past these, the query narrows. */
export const FINDER_ROWS = 50

/** Every file of `repos` as the finder lists it. */
export const filesOf = (repos: RepoFiles[]): { path: string; label: string }[] =>
  repos.flatMap((r) => r.files.map((f) => ({ path: `${r.dir}/${f}`, label: repos.length > 1 ? `${r.dir.split('/').pop()}/${f}` : f })))

const BOUNDARY = new Set(['/', '.', '_', '-', ' '])

/** The letters of `q` found in order in `l`, leftmost from `from`, or rightmost from the end when `from` is -1. */
const subsequence = (q: string, l: string, from: number): number[] | undefined => {
  const marks: number[] = []
  if (from === -1) {
    let to = l.length
    for (let i = q.length - 1; i >= 0; i--) {
      const at = l.lastIndexOf(q[i], to - 1)
      if (at === -1) return undefined
      marks.unshift((to = at))
    }
    return marks
  }
  for (const ch of q) {
    const at = l.indexOf(ch, from)
    if (at === -1) return undefined
    marks.push(at)
    from = at + 1
  }
  return marks
}

/**
 * How well `query` matches `label` as a subsequence, case ignored, and where: undefined when it doesn't. A run of
 * letters together, a letter after a boundary and letters in the file's own name score higher; a longer label lower.
 * Of the leftmost match, the leftmost within the file's name and the rightmost, the best scoring is taken.
 */
export function fuzzy(query: string, label: string): { score: number; marks: number[] } | undefined {
  const q = query.toLowerCase().replace(/\s+/g, '')
  const l = label.toLowerCase()
  const base = l.lastIndexOf('/') + 1
  const scored = (marks: number[]) => ({
    marks,
    score: marks.reduce((n, at, i) => n + 1 + (marks[i - 1] === at - 1 ? 5 : 0) + (at === 0 || BOUNDARY.has(l[at - 1]) ? 3 : 0) + (at >= base ? 2 : 0), 0) - label.length / 100,
  })
  const tries = [0, base, -1].flatMap((from) => {
    const marks = subsequence(q, l, from)
    return marks ? [scored(marks)] : []
  })
  return tries.length ? tries.reduce((best, t) => (t.score > best.score ? t : best)) : undefined
}

/**
 * The files to offer for `query`, best first, up to `FINDER_ROWS`. With no query, the files `recent` names first (the
 * worker's open tabs, the latest first), then the rest in their order.
 */
export function rankFiles(files: { path: string; label: string }[], query: string, recent: string[] = []): Found[] {
  if (!query.trim()) {
    const first = new Set(recent)
    const byPath = new Map(files.map((f) => [f.path, f]))
    return [...recent.flatMap((p) => byPath.get(p) ?? []), ...files.filter((f) => !first.has(f.path))].slice(0, FINDER_ROWS).map((f) => ({ ...f, marks: [] }))
  }
  return files
    .flatMap((f) => {
      const hit = fuzzy(query, f.label)
      return hit ? [{ ...f, ...hit }] : []
    })
    .sort((a, b) => b.score - a.score || (a.label < b.label ? -1 : 1))
    .slice(0, FINDER_ROWS)
    .map(({ path, label, marks }) => ({ path, label, marks }))
}

/** A label with its matched letters in `<mark>`. */
const markedHtml = (label: string, marks: number[]) => {
  const at = new Set(marks)
  return [...label].map((ch, i) => (at.has(i) ? `<mark>${esc(ch)}</mark>` : esc(ch))).join('')
}

/**
 * The finder's rows for `found`, `on` the one Enter opens: each a `data-find` option of a listbox, its file's name
 * first and the folder after, dimmed.
 */
export function finderHtml(found: Found[], on: number, more: number): string {
  if (!found.length) return '<div class="finder-none">no file matches</div>'
  const rows = found.map((f, i) => {
    const cut = f.label.lastIndexOf('/') + 1
    const name = markedHtml(f.label.slice(cut), f.marks.filter((m) => m >= cut).map((m) => m - cut))
    const dir = markedHtml(f.label.slice(0, cut), f.marks.filter((m) => m < cut))
    return `<div class="finder-row ${i === on ? 'on' : ''}" role="option" id="finder-${i}" aria-selected="${i === on}" data-find="${esc(f.path)}"><span class="finder-name">${name}</span><span class="finder-dir">${dir}</span></div>`
  })
  return rows.join('') + (more ? `<div class="finder-none">and ${more} files the worker's repos list past what the tower reads</div>` : '')
}

/** The finder's look, under `.finder`: the renderer places the element. */
export const finderCss = `.finder-list { max-height: min(60vh, 520px); overflow: auto; margin-top: var(--sp-m); }
.finder-row { display: flex; gap: var(--sp-m); align-items: baseline; padding: var(--sp-xs) var(--sp-m); border-radius: var(--radius); cursor: pointer; white-space: nowrap; overflow: hidden; }
.finder-row.on { background: var(--panel-2); box-shadow: inset 2px 0 0 var(--accent); }
.finder-name { color: var(--ink); }
.finder-dir { color: var(--faint); font-size: var(--fs-s); overflow: hidden; text-overflow: ellipsis; }
.finder-row mark { background: none; color: var(--accent); font-weight: 700; }
.finder-none { padding: var(--sp-m); color: var(--faint); font-size: var(--fs-s); }`

/** A file's name, as its tab reads. */
export const fileName = (file: string): string => file.slice(file.lastIndexOf('/') + 1)

/** File tabs a worker's header shows before the rest fold into its `+N` menu. */
export const FILE_TABS = 4

/**
 * Which of `open` a row shows as tabs, in their order, and which fold into its `+N` menu: the first `room`, the
 * selected one among them always, in the place of the last.
 */
export function fileTabsOf(open: string[], on: string | undefined, room = FILE_TABS): { tabs: string[]; more: string[] } {
  const tabs = open.slice(0, room)
  if (on && open.includes(on) && !tabs.includes(on)) tabs[room - 1] = on
  return { tabs, more: open.filter((f) => !tabs.includes(f)) }
}
