/**
 * A text editor any renderer mounts over a file it read with `file/<id>`: CodeMirror, coloured from the design's tokens
 * (`--syn-*` as highlight.js's are in the diffs), its language told by the file's name. It knows no API: the renderer
 * reads, saves with `file/write` on `onSave` (⌘S or Ctrl+S in it), and is told by `onDirty` whether the text differs
 * from what it last read or saved. The tower serves this module as `/editor.js`.
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, foldGutter, foldKeymap, HighlightStyle, indentOnInput, syntaxHighlighting, type LanguageSupport } from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { EditorState, type Text } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers, rectangularSelection } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { yaml } from '@codemirror/lang-yaml'

/** The language a file's name tells, if the editor knows one. */
const languageOf = (file: string): LanguageSupport | undefined => {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
  if (['js', 'mjs', 'cjs'].includes(ext)) return javascript()
  if (ext === 'jsx') return javascript({ jsx: true })
  if (['ts', 'mts', 'cts'].includes(ext)) return javascript({ typescript: true })
  if (ext === 'tsx') return javascript({ typescript: true, jsx: true })
  if (['json', 'jsonl', 'webmanifest'].includes(ext)) return json()
  if (['md', 'markdown'].includes(ext)) return markdown()
  if (ext === 'css') return css()
  if (['html', 'htm', 'svg'].includes(ext)) return html()
  if (ext === 'py') return python()
  if (['yml', 'yaml'].includes(ext)) return yaml()
  return undefined
}

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.tagName], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.character], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.heading], color: 'var(--syn-title)' },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.variableName)], color: 'var(--syn-type)' },
  { tag: [t.propertyName, t.attributeName, t.labelName], color: 'var(--syn-attr)' },
  { tag: [t.regexp, t.link, t.url, t.meta, t.processingInstruction], color: 'var(--syn-regexp)' },
  { tag: t.heading, fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
])

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--ink)', backgroundColor: 'var(--panel)', fontSize: 'var(--fs-s)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.55' },
  '.cm-content': { caretColor: 'var(--ink)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ink)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'color-mix(in oklab, var(--accent) 28%, transparent)' },
  '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--faint)', border: 'none', borderRight: '1px solid var(--line)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--ink) 4%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink)' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in oklab, var(--accent) 22%, transparent)', outline: 'none' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in oklab, var(--accent) 14%, transparent)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in oklab, var(--needs) 30%, transparent)' },
  '.cm-panels': { backgroundColor: 'var(--panel-2)', color: 'var(--ink)', borderColor: 'var(--line)' },
  '.cm-panels input, .cm-panels button': { font: 'inherit' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--muted)' },
})

export type EditorOpts = {
  /** The file's absolute path: its name tells the language. */
  path: string
  content: string
  /** Whether the text now differs from what was last read or saved, on each change of that. */
  onDirty: (dirty: boolean) => void
  /** ⌘S or Ctrl+S in the editor. */
  onSave: () => void
}

/** An editor mounted in a renderer's element. */
export type FileEditor = {
  text(): string
  dirty(): boolean
  /** The text as it is on disk now, read again or just saved: the editor holds it, clean. Its selection is kept where it fits. */
  reset(content: string): void
  /** What the editor holds is what was saved. */
  saved(): void
  focus(): void
  destroy(): void
}

/** Mounts an editor over `opts.content` in `parent`, which it fills. */
export function mountEditor(parent: HTMLElement, opts: EditorOpts): FileEditor {
  let clean: Text
  let wasDirty = false
  const tell = (view: EditorView) => {
    const dirty = !view.state.doc.eq(clean)
    if (dirty !== wasDirty) opts.onDirty((wasDirty = dirty))
  }
  const language = languageOf(opts.path)
  const state = EditorState.create({
    doc: opts.content,
    extensions: [
      lineNumbers(), highlightActiveLineGutter(), foldGutter(), highlightSpecialChars(), history(), drawSelection(), EditorState.allowMultipleSelections.of(true),
      indentOnInput(), bracketMatching(), closeBrackets(), rectangularSelection(), highlightActiveLine(), highlightSelectionMatches(), search({ top: true }),
      syntaxHighlighting(highlight), theme, ...(language ? [language] : []),
      keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => (opts.onSave(), true) }, ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
      EditorView.updateListener.of((u) => u.docChanged && tell(u.view)),
    ],
  })
  clean = state.doc
  const view = new EditorView({ state, parent })
  return {
    text: () => view.state.doc.toString(),
    dirty: () => wasDirty,
    reset(content) {
      clean = view.state.toText(content)
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: clean }, selection: { anchor: Math.min(view.state.selection.main.head, content.length) } })
      tell(view)
    },
    saved() {
      clean = view.state.doc
      tell(view)
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  }
}
