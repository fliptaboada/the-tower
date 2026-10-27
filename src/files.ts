/**
 * A worker's files, for a renderer to find, read and edit beside its session: every file git tracks or would track in
 * the session's repos (ignored ones left out, as `/changes` leaves them), and one of them read or written whole. A
 * file's version is its mtime, as a collection item's is: a write names the version it read and is refused once the
 * file has moved on, which the worker editing it beside the viewer makes the common case. Read on every request, never kept.
 */
import { constants, type Stats } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import path from 'node:path'
import { git } from './git.ts'
import { isRepo } from './worktrees.ts'

/** Files listed per repo past this many are a forgotten ignore rule or a vendored tree, not what a finder searches. */
export const MAX_FILES = 50_000
/** A file read past this many bytes is no file to edit in a browser: a bundle, a dump, a log. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024

/** One repo's files, relative to `dir`, sorted; `more` those left out past `MAX_FILES`. */
export type RepoFiles = { dir: string; files: string[]; more: number }

/** A file read whole: its text and the version a write names. */
export type FileRead = { path: string; content: string; modifiedAt: number }

/** Why a file can't be read or written as text, for the verb to answer with. */
export type FileRefusal = { refused: string } | { lost: string }

const versionOf = (s: Stats): number => Math.floor(s.mtimeMs)

/** Tracked and untracked files, ignored ones left out: `--cached` still lists one deleted but not staged, which a read then finds lost. */
async function repoFiles(dir: string): Promise<RepoFiles> {
  const all = [...new Set((await git(dir, ['-c', 'core.quotepath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean))].sort()
  return { dir, files: all.slice(0, MAX_FILES), more: Math.max(0, all.length - MAX_FILES) }
}

/** The files of each of `dirs` that is a repo, in their order. */
export const filesIn = async (dirs: string[]): Promise<RepoFiles[]> => {
  const repos = await Promise.all(dirs.map(async (dir) => ((await isRepo(dir)) ? dir : undefined)))
  return Promise.all(repos.filter((dir): dir is string => dir !== undefined).map(repoFiles))
}

/** Whether `target` lies inside one of `dirs`: the caller resolves links in both. */
export const insideOf = (dirs: string[], target: string): boolean =>
  dirs.some((dir) => {
    const rel = path.relative(dir, target)
    return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
  })

/** A plain file read as UTF-8 text, never through a symlink: refused past `MAX_FILE_BYTES` or holding a NUL byte (binary). */
export async function readText(file: string): Promise<FileRead | FileRefusal> {
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch((err: NodeJS.ErrnoException) => err)
  if (fd instanceof Error) return fd.code === 'ENOENT' ? { lost: `"${file}" is gone` } : { refused: `"${file}" can't be opened: ${fd.code}` }
  try {
    const s = await fd.stat()
    if (!s.isFile()) return { refused: `"${file}" is not a plain file` }
    if (s.size > MAX_FILE_BYTES) return { refused: `"${file}" is ${Math.round(s.size / 1024)} KB, past the ${MAX_FILE_BYTES / 1024 / 1024} MB the tower edits` }
    const bytes = await fd.readFile()
    if (bytes.includes(0)) return { refused: `"${file}" is binary` }
    return { path: file, content: bytes.toString('utf8'), modifiedAt: versionOf(s) }
  } finally {
    await fd.close()
  }
}

/** Replaces a plain file's text if it is still at `modifiedAt`, in place (its mode and links kept), and answers its new version. */
export async function writeText(file: string, content: string, modifiedAt: number): Promise<{ modifiedAt: number } | FileRefusal> {
  const s = await stat(file).catch(() => undefined)
  if (!s) return { lost: `"${file}" is gone` }
  if (!s.isFile()) return { refused: `"${file}" is not a plain file` }
  if (versionOf(s) !== modifiedAt) return { refused: `"${file}" changed since version ${modifiedAt}` }
  const fd = await open(file, constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW)
  try {
    await fd.writeFile(content, 'utf8')
    return { modifiedAt: versionOf(await fd.stat()) }
  } finally {
    await fd.close()
  }
}
