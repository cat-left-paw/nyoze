function runExecCommand(command: string, value?: string): boolean {
  try {
    return document.execCommand(command, false, value)
  } catch {
    return false
  }
}

type ClipboardPayload = {
  text: string | null
  html: string | null
}

function normalizeClipboardText(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

function resolvePasteTarget(): HTMLElement | null {
  const active = document.activeElement
  if (active instanceof HTMLElement) return active

  const selection = window.getSelection()
  const anchor = selection?.anchorNode
  if (!anchor) return null
  if (anchor instanceof HTMLElement) return anchor
  return anchor.parentElement
}

type SyntheticPasteDispatch = {
  /** Event reached a target and was dispatched (no throw). */
  dispatched: boolean
  /** True when a listener called `preventDefault()` (paste was consumed). */
  defaultWasPrevented: boolean
}

function dispatchSyntheticPasteEvent(payload: ClipboardPayload): SyntheticPasteDispatch {
  const target = resolvePasteTarget()
  if (!target) return { dispatched: false, defaultWasPrevented: false }
  try {
    const data = new DataTransfer()
    if (payload.html) {
      data.setData('text/html', payload.html)
    }
    if (payload.text) {
      data.setData('text/plain', normalizeClipboardText(payload.text))
    }
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: data,
    })
    // false === preventDefault was invoked (event was cancelled / handled)
    const defaultActionAllowed = target.dispatchEvent(event)
    return { dispatched: true, defaultWasPrevented: !defaultActionAllowed }
  } catch {
    return { dispatched: false, defaultWasPrevented: false }
  }
}

function dispatchSyntheticPaste(payload: ClipboardPayload): boolean {
  return dispatchSyntheticPasteEvent(payload).dispatched
}

async function readClipboardPayload(): Promise<ClipboardPayload | null> {
  if (navigator.clipboard?.read) {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        let html: string | null = null
        let text: string | null = null
        if (item.types.includes('text/html')) {
          try {
            html = await (await item.getType('text/html')).text()
          } catch {
            html = null
          }
        }
        if (item.types.includes('text/plain')) {
          try {
            text = await (await item.getType('text/plain')).text()
          } catch {
            text = null
          }
        }
        if (html || text) {
          return { html, text }
        }
      }
    } catch {
      // Clipboard read may fail depending on OS permission.
    }
  }

  if (navigator.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText()
      if (text) return { html: null, text }
    } catch {
      // Clipboard read may fail depending on OS permission.
    }
  }

  return null
}

export function cutSelection(): boolean {
  return runExecCommand('cut')
}

export function copySelection(): boolean {
  return runExecCommand('copy')
}

export async function pasteFromClipboard(): Promise<void> {
  if (runExecCommand('paste')) return
  const payload = await readClipboardPayload()
  if (!payload) return
  if (dispatchSyntheticPaste(payload)) return
  if (payload.html && runExecCommand('insertHTML', payload.html)) return
  if (payload.text) {
    runExecCommand('insertText', normalizeClipboardText(payload.text))
  }
}

export type PastePlainOnlyResult =
  | { ok: true }
  | { ok: false; reason: 'clipboard_unavailable' | 'empty_text' }

/** Paste using `text/plain` only so the editor Markdown/plain path runs (no `text/html`). */
export async function pasteFromClipboardPlainOnly(): Promise<PastePlainOnlyResult> {
  const payload = await readClipboardPayload()
  if (!payload) return { ok: false, reason: 'clipboard_unavailable' }
  if (!payload.text) return { ok: false, reason: 'empty_text' }
  const plain = normalizeClipboardText(payload.text)
  const { defaultWasPrevented } = dispatchSyntheticPasteEvent({ html: null, text: plain })
  if (!defaultWasPrevented) {
    runExecCommand('insertText', plain)
  }
  return { ok: true }
}
