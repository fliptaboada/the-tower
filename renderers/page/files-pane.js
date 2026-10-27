import { OPEN_FILES_KEY, fileName, fileTabsOf, filesOf, finderHtml, rankFiles } from '/files.js'
import { fileButtonsHtml } from '/panels.js'
import { esc } from '/cards.js'
import { ICON } from '/icons.js'
import { $, repaint, toast, told } from './kit.js'

/**
 * @import { Card } from '../../src/bridge/board.ts'
 * @import { OpenFiles } from '../../src/shared/files.ts'
 * @import { FileEditor } from '../../src/shared/editor.ts'
 * @import { RepoFiles } from '../../src/files.ts'
 * @import { Pane } from './view.js'
 */

/**
 * @typedef {{
 *   selected: () => string | undefined,
 *   paneNow: () => Pane | undefined,
 *   showPane: (pane: Pane) => void,
 *   render: () => void,
 * }} FilesDeps
 */

/**
 * A file open in a tab: its element in the file pane, its editor once read, the version it read or last saved, and
 * whether the file moved on disk while it held edits (`stale`), or why it can't be read.
 * @typedef {{ el: HTMLElement, editor?: FileEditor, modifiedAt?: number, stale?: boolean, error?: string, saving?: boolean }} Doc
 */

/** How often the open file is read again while it is shown, to follow the worker's edits. */
const CHECK_MS = 2000

/** `file:<path>`, the pane of a file the viewer opened. @param {string} file @returns {Pane} */
export const filePane = (file) => `file:${file}`
/** @param {Pane | undefined} pane */
export const fileOfPane = (pane) => (pane?.startsWith('file:') ? pane.slice(5) : undefined)

/**
 * The selected worker's files: ⌘P's finder over every file in its repos, each file opened as a tab of its header, past
 * `FILE_TABS` folded into a `+N` menu, and the file pane, an editor that saves with `file/write` and follows the
 * worker's edits to a file it holds none of. Which files each worker has open is the viewer's, in `tower.store`.
 * @param {FilesDeps} deps
 */
export async function filesPane({ selected, paneNow, showPane, render }) {
  /** With no prototype: an id a link names is only ever a key. @type {OpenFiles} */
  const open = Object.assign(Object.create(null), /** @type {OpenFiles | undefined} */ (await tower.store.get(OPEN_FILES_KEY)))
  /** @type {Map<string, Doc>} */
  const docs = new Map()
  const docKey = (/** @type {string} */ id, /** @type {string} */ file) => `${id}\n${file}`
  const filePath = (/** @type {string} */ id, /** @type {string} */ file) => `file/${id}?path=${encodeURIComponent(file)}`
  const read = (/** @type {string} */ id, /** @type {string} */ file) => tower.get(/** @type {'file/<id>'} */ (filePath(id, file)))

  /** @param {string} id */
  const openOf = (id) => open[id] ?? []
  /** @param {string} id @param {string[]} files */
  function keep(id, files) {
    if (files.length) open[id] = files
    else delete open[id]
    tower.store.set(OPEN_FILES_KEY, Object.fromEntries(Object.entries(open).slice(-50)))
  }

  /** A link naming a worker's file (`#<id>/file:<path>`) opens its tab, so it can be shown. */
  function openLinked() {
    const [id, part] = location.hash.slice(1).split('/')
    const file = part && fileOfPane(/** @type {Pane} */ (decodeURIComponent(part)))
    if (file?.startsWith('/') && !openOf(id).includes(file)) keep(id, [...openOf(id), file])
  }
  openLinked()
  window.addEventListener('hashchange', openLinked)

  /** @param {string} id @param {Pane} pane */
  const hasFile = (id, pane) => openOf(id).includes(/** @type {string} */ (fileOfPane(pane)))

  /** Opens `file` in a tab of worker `id`, or goes to the tab it has. @param {string} id @param {string} file */
  function openFile(id, file) {
    if (!openOf(id).includes(file)) keep(id, [...openOf(id), file])
    showPane(filePane(file))
  }

  /** Closes a file's tab, asking first when it holds edits; the tab beside it is shown when it was. @param {string} id @param {string} file */
  function closeFile(id, file) {
    const doc = docs.get(docKey(id, file))
    if (doc?.editor?.dirty() && !confirm(`${fileName(file)} has edits you haven't saved. Close it and lose them?`)) return
    doc?.editor?.destroy()
    doc?.el.remove()
    docs.delete(docKey(id, file))
    const files = openOf(id)
    const at = files.indexOf(file)
    const left = files.filter((f) => f !== file)
    keep(id, left)
    if (selected() === id && fileOfPane(paneNow()) === file) showPane(left.length ? filePane(left[Math.min(at, left.length - 1)]) : 'screen')
    else render()
  }

  /** Closes the file the selected worker shows, if it shows one. Returns whether it did. */
  function closeShown() {
    const id = selected()
    const file = fileOfPane(paneNow())
    if (!id || !file) return false
    closeFile(id, file)
    return true
  }

  /**
   * The selected worker's file tabs after its other tabs, the ones past the row's room in a `+N` menu.
   * @param {Card} c @param {Pane} pane @param {(pane: Pane, on: boolean) => string} tabAttrs
   */
  function fileTabsHtml(c, pane, tabAttrs) {
    const on = fileOfPane(pane)
    const { tabs, more } = fileTabsOf(openOf(c.id), on)
    if (!tabs.length) return ''
    /** @param {string} file */
    const dirty = (file) => docs.get(docKey(c.id, file))?.editor?.dirty()
    /** @param {string} file */
    const close = (file) => `<span class="icon-btn" data-close-file="${esc(file)}" aria-hidden="true" data-tip="close">${ICON.close}</span>`
    const tab = (/** @type {string} */ file) =>
      `<button class="pane-tab file-tab ${file === on ? 'on' : ''} ${dirty(file) ? 'dirty' : ''}" ${tabAttrs(filePane(file), file === on)} data-tip="${esc(file)}${dirty(file) ? ' · unsaved' : ''}"><span class="shown-name">${esc(fileName(file))}</span>${close(file)}</button>`
    $('file-more').innerHTML = more.map((file) => `<div class="file-more-row ${dirty(file) ? 'dirty' : ''}"><button data-pane="${esc(filePane(file))}" data-tip="${esc(file)}">${esc(fileName(file))}<small>${esc(file.slice(0, file.lastIndexOf('/')))}</small></button>${close(file).replace('aria-hidden="true"', 'role="button" aria-label="close"')}</div>`).join('')
    return `<span class="file-tabs">${tabs.map(tab).join('')}</span>` + (more.length ? `<button class="pane-tab file-more" popovertarget="file-more" aria-label="${more.length} more open files" data-tip="${esc(more.map(fileName).join(', '))}">+${more.length}</button>` : '')
  }

  /** The editor module, fetched when the first file opens. @type {Promise<typeof import('../../src/shared/editor.ts')> | undefined} */
  let editorModule

  /** Shows the file pane on `file` of worker `id`, reading it the first time. @param {string} id @param {string} file */
  function drawFile(id, file) {
    const key = docKey(id, file)
    let doc = docs.get(key)
    if (!doc) {
      doc = { el: document.createElement('div') }
      doc.el.className = 'file-doc'
      $('file-body').append(doc.el)
      docs.set(key, doc)
      void load(id, file, doc)
    }
    for (const d of docs.values()) d.el.hidden = d !== doc
    drawHead(id, file, doc)
  }

  /** @param {string} id @param {string} file @param {Doc} doc */
  async function load(id, file, doc) {
    try {
      const [{ mountEditor }, got] = await Promise.all([(editorModule ??= import('/editor.js')), read(id, file)])
      doc.modifiedAt = got.modifiedAt
      doc.editor = mountEditor(doc.el, { path: file, content: got.content, onDirty: () => render(), onSave: () => void save(id, file, doc) })
      if (isShown(id, file)) doc.editor.focus()
    } catch (err) {
      doc.error = /** @type {Error} */ (err).message
    }
    if (isShown(id, file)) drawHead(id, file, doc)
  }

  /** @param {string} id @param {string} file */
  const isShown = (id, file) => selected() === id && fileOfPane(paneNow()) === file

  /** @param {string} id @param {string} file @param {Doc} doc */
  function drawHead(id, file, doc) {
    const state = doc.error ? `<span class="file-state broken">${esc(doc.error)}</span>`
      : !doc.editor ? '<span class="file-state">reading…</span>'
      : doc.stale ? `<span class="file-state stale">changed on disk while you edited it</span><button data-file-act="reload" data-tip="read it again: your edits are lost">Reload</button><button class="danger" data-file-act="overwrite" data-tip="save your text over what is on disk now">Overwrite</button>`
      : doc.saving ? '<span class="file-state">saving…</span>'
      : doc.editor.dirty() ? '<span class="file-state dirty">unsaved</span>'
      : '<span class="file-state">saved</span>'
    repaint($('file-head'), `<code class="file-path" data-tip="${esc(file)}"><bdi>${esc(file)}</bdi></code>${fileButtonsHtml(file)}<span class="file-tools">${state}${doc.editor && !doc.stale ? `<button class="primary" data-file-act="save" ${doc.editor.dirty() ? '' : 'disabled'} data-tip="⌘S">Save</button>` : ''}</span>`)
  }

  /** Saves the editor's text if the file is still at the version it read; once it moved on, the pane asks what to do. @param {string} id @param {string} file @param {Doc} doc */
  async function save(id, file, doc) {
    if (!doc.editor || doc.saving || doc.stale || doc.modifiedAt === undefined) return
    const content = doc.editor.text()
    doc.saving = true
    render()
    try {
      const { modifiedAt } = await tower.call('file/write', { id, path: file, content, modifiedAt: doc.modifiedAt })
      doc.modifiedAt = modifiedAt
      if (doc.editor.text() === content) doc.editor.saved()
    } catch (err) {
      if (/** @type {any} */ (err).code === 'refused' && /changed since/.test(/** @type {Error} */ (err).message)) doc.stale = true
      else toast(/** @type {Error} */ (err).message)
    }
    doc.saving = false
    render()
  }

  /**
   * Reads the shown file again: a new version replaces a clean editor's text, and marks one that holds edits stale.
   * @param {string} id @param {string} file @param {Doc} doc
   */
  async function check(id, file, doc) {
    if (!doc.editor || doc.saving || doc.stale) return
    const got = await read(id, file).catch(() => undefined)
    if (!got || got.modifiedAt === doc.modifiedAt || doc.saving) return
    if (doc.editor.dirty()) doc.stale = true
    else doc.editor.reset(got.content)
    doc.modifiedAt = got.modifiedAt
    if (doc.stale) render()
  }

  setInterval(() => {
    const id = selected()
    const file = fileOfPane(paneNow())
    const doc = id && file && docs.get(docKey(id, file))
    if (doc && document.visibilityState === 'visible') void check(/** @type {string} */ (id), /** @type {string} */ (file), doc)
  }, CHECK_MS)

  /** Reload drops the editor's text for the file's; overwrite saves it over whatever is there now. @param {'reload' | 'overwrite' | 'save'} act */
  async function fileAct(act) {
    const id = /** @type {string} */ (selected())
    const file = /** @type {string} */ (fileOfPane(paneNow()))
    const doc = docs.get(docKey(id, file))
    if (!doc?.editor) return
    if (act === 'save') return save(id, file, doc)
    const got = await told(read(id, file))
    if (!got) return
    doc.modifiedAt = got.modifiedAt
    doc.stale = false
    if (act === 'reload') doc.editor.reset(got.content)
    else await save(id, file, doc)
    render()
  }

  /** Closing a tab and the pane's own buttons, before the tab's click shows its pane. */
  document.addEventListener(
    'click',
    (e) => {
      const target = /** @type {Element} */ (e.target)
      const closing = target.closest('[data-close-file]')
      const act = target.closest('[data-file-act]')
      if (!closing && !act) return
      e.stopPropagation()
      if (closing) {
        if ($('file-more').matches(':popover-open')) $('file-more').hidePopover()
        return closeFile(/** @type {string} */ (selected()), /** @type {string} */ (closing.getAttribute('data-close-file')))
      }
      void fileAct(/** @type {'reload' | 'overwrite' | 'save'} */ (act?.getAttribute('data-file-act')))
    },
    true,
  )
  /** The menu opens under its `+N` tab, its right edge at the tab's. */
  $('file-more').addEventListener('beforetoggle', (e) => {
    const by = /** @type {ToggleEvent} */ (e).newState === 'open' && $('bar-line').querySelector('.file-more')?.getBoundingClientRect()
    if (by) Object.assign($('file-more').style, { top: `${by.bottom + 4}px`, right: `${innerWidth - by.right}px` })
  })
  $('file-more').addEventListener('click', (e) => /** @type {Element} */ (e.target).closest('[data-pane]') && $('file-more').hidePopover())

  /** Edits not saved anywhere are lost with the page: the browser asks first. */
  window.addEventListener('beforeunload', (e) => [...docs.values()].some((d) => d.editor?.dirty()) && e.preventDefault())

  // The finder: ⌘P over the selected worker's files, the open ones first.
  const finder = /** @type {HTMLDialogElement} */ ($('finder'))
  const query = /** @type {HTMLInputElement} */ ($('finder-q'))
  /** @type {{ id: string, files?: { path: string, label: string }[], more: number, on: number, found: import('../../src/shared/files.ts').Found[] }} */
  let finding = { id: '', more: 0, on: 0, found: [] }

  function drawFinder() {
    if (!finding.files) return void ($('finder-list').innerHTML = '<div class="finder-none">reading the files…</div>')
    finding.found = rankFiles(finding.files, query.value, [...openOf(finding.id)].reverse())
    finding.on = Math.min(finding.on, Math.max(0, finding.found.length - 1))
    $('finder-list').innerHTML = finderHtml(finding.found, finding.on, finding.more)
    query.setAttribute('aria-activedescendant', finding.found.length ? `finder-${finding.on}` : '')
    $('finder-list').querySelector('.finder-row.on')?.scrollIntoView({ block: 'nearest' })
  }

  /** Opens the finder over the selected worker's files, read anew. Returns whether there is a worker to find in. */
  function openFinder() {
    const id = selected()
    if (!id) return false
    finding = { id, more: 0, on: 0, found: [] }
    query.value = ''
    drawFinder()
    if (!finder.open) finder.showModal()
    query.focus()
    tower.get(/** @type {'files/<id>'} */ (`files/${id}`)).then(
      (/** @type {RepoFiles[]} */ repos) => {
        if (finding.id !== id) return
        finding.files = filesOf(repos)
        finding.more = repos.reduce((n, r) => n + r.more, 0)
        drawFinder()
      },
      (/** @type {Error} */ err) => finding.id === id && ($('finder-list').innerHTML = `<div class="finder-none">${esc(err.message)}</div>`),
    )
    return true
  }

  /** @param {string} file */
  function pick(file) {
    finder.close()
    openFile(finding.id, file)
  }

  query.addEventListener('input', () => ((finding.on = 0), drawFinder()))
  query.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key]
    if (step && finding.found.length) {
      e.preventDefault()
      finding.on = (finding.on + step + finding.found.length) % finding.found.length
      return drawFinder()
    }
    if (e.key === 'Enter' && finding.found[finding.on]) {
      e.preventDefault()
      pick(finding.found[finding.on].path)
    }
  })
  $('finder-list').addEventListener('click', (e) => {
    const row = /** @type {Element} */ (e.target).closest('[data-find]')
    if (row) pick(/** @type {string} */ (row.getAttribute('data-find')))
  })
  finder.addEventListener('click', (e) => e.target === finder && finder.close())

  return { hasFile, fileTabsHtml, drawFile, openFinder, openFile, closeShown }
}
