import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import { CUSTOM_BOUTEN_STORAGE_KEY, DEFAULT_BOUTEN_CHARS } from '../../settings/defaults'
import type { PromptModalState } from '../components/PromptModal'

function normalizeSingleChar(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  return Array.from(trimmed)[0] ?? ''
}

type UseRubyBoutenPromptOptions = {
  coreRef: { current: EditorCoreHandle | null }
}

export function useRubyBoutenPrompt({ coreRef }: UseRubyBoutenPromptOptions) {
  const promptInputRef = useRef<HTMLInputElement | null>(null)
  const [promptModal, setPromptModal] = useState<PromptModalState | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const [rubyBoutenTab, setRubyBoutenTab] = useState<'ruby' | 'bouten'>('ruby')
  const [boutenValue, setBoutenValue] = useState('・')
  const [customBoutenChars, setCustomBoutenChars] = useState<string[]>([])
  const [customBoutenInput, setCustomBoutenInput] = useState('')
  const [imageSrc, setImageSrc] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [imageTitle, setImageTitle] = useState('')

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_BOUTEN_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const seen = new Set<string>()
      const next: string[] = []
      for (const item of parsed) {
        if (typeof item !== 'string') continue
        const char = normalizeSingleChar(item)
        if (!char) continue
        if (
          DEFAULT_BOUTEN_CHARS.includes(
            char as (typeof DEFAULT_BOUTEN_CHARS)[number],
          )
        ) {
          continue
        }
        if (seen.has(char)) continue
        seen.add(char)
        next.push(char)
        if (next.length >= 20) break
      }
      setCustomBoutenChars(next)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CUSTOM_BOUTEN_STORAGE_KEY,
        JSON.stringify(customBoutenChars),
      )
    } catch {
      // ignore
    }
  }, [customBoutenChars])

  useEffect(() => {
    if (!promptModal) return
    const kind = promptModal.action.kind
    if (
      kind !== 'ruby' &&
      kind !== 'link' &&
      !(kind === 'rubyBouten' && rubyBoutenTab === 'ruby')
    ) {
      return
    }
    const input = promptInputRef.current
    if (!input) return
    const timer = window.setTimeout(() => {
      input.focus()
      if (promptModal.selectAllOnOpen) input.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [promptModal, rubyBoutenTab])

  const openLinkPrompt = useCallback(() => {
    const core = coreRef.current
    if (!core) return
    const previousUrl = core.getLinkHref()
    const { from, to } = core.getSelectionRange()
    const defaultVal = previousUrl ?? 'https://example.com'
    setPromptValue(defaultVal)
    setPromptModal({
      title: 'Link URL',
      defaultValue: defaultVal,
      action: { kind: 'link', from, to },
    })
  }, [coreRef])

  const openRubyBoutenPrompt = useCallback(() => {
    const core = coreRef.current
    if (!core) return
    if (!core.isRubyEnabled()) return
    const context = core.getRubyEditContext()
    if (!context) return
    setPromptValue(context.ruby)
    setBoutenValue('・')
    setCustomBoutenInput('')
    setRubyBoutenTab('ruby')
    setPromptModal({
      title: `${context.text}`,
      defaultValue: context.ruby,
      selectAllOnOpen: context.overlapsExistingRuby,
      action: { kind: 'rubyBouten', from: context.from, to: context.to },
    })
  }, [coreRef])

  const openImagePrompt = useCallback(() => {
    const core = coreRef.current
    if (!core) return
    setImageSrc('')
    setImageAlt('')
    setImageTitle('')
    setPromptModal({
      title: '画像挿入',
      defaultValue: '',
      action: { kind: 'image', from: 0, to: 0 },
    })
  }, [coreRef])

  const handlePromptSubmit = useCallback(() => {
    if (!promptModal) return
    const { action } = promptModal
    setPromptModal(null)
    const core = coreRef.current
    if (!core) return
    switch (action.kind) {
      case 'ruby':
        if (!core.isRubyEnabled()) break
        core.insertRuby(promptValue, { from: action.from, to: action.to })
        break
      case 'bouten':
        if (!core.isRubyEnabled()) break
        core.insertBouten(promptValue.trim() || '・', {
          from: action.from,
          to: action.to,
        })
        break
      case 'rubyBouten':
        if (!core.isRubyEnabled()) break
        if (rubyBoutenTab === 'ruby') {
          core.insertRuby(promptValue, { from: action.from, to: action.to })
        } else {
          core.insertBouten(boutenValue.trim() || '・', {
            from: action.from,
            to: action.to,
          })
        }
        break
      case 'link':
        core.setLink(promptValue.trim() === '' ? null : promptValue, {
          from: action.from,
          to: action.to,
        })
        break
      case 'image': {
        const src = imageSrc.trim()
        const alt = imageAlt.trim()
        if (!src) break
        core.insertImage(src, alt, imageTitle.trim() || undefined)
        break
      }
    }
  }, [coreRef, promptModal, promptValue, rubyBoutenTab, boutenValue, imageSrc, imageAlt, imageTitle])

  const handlePromptCancel = useCallback(() => {
    setPromptModal(null)
  }, [])

  const addCustomBoutenChar = useCallback(() => {
    const char = normalizeSingleChar(customBoutenInput)
    if (!char) return
    if (
      DEFAULT_BOUTEN_CHARS.includes(
        char as (typeof DEFAULT_BOUTEN_CHARS)[number],
      )
    ) {
      setBoutenValue(char)
      setCustomBoutenInput('')
      return
    }
    setCustomBoutenChars((prev) => {
      if (prev.includes(char)) return prev
      const next = [...prev, char]
      return next.slice(-20)
    })
    setBoutenValue(char)
    setCustomBoutenInput('')
  }, [customBoutenInput])

  const removeSelectedCustomBoutenChar = useCallback(() => {
    if (!customBoutenChars.includes(boutenValue)) return
    setCustomBoutenChars((prev) => prev.filter((c) => c !== boutenValue))
    setBoutenValue('・')
  }, [customBoutenChars, boutenValue])

  const boutenOptions = useMemo(
    () => [...DEFAULT_BOUTEN_CHARS, ...customBoutenChars],
    [customBoutenChars],
  )

  return {
    promptInputRef,
    promptModal,
    promptValue,
    rubyBoutenTab,
    boutenValue,
    customBoutenInput,
    customBoutenChars,
    boutenOptions,
    setPromptValue,
    setRubyBoutenTab,
    setBoutenValue,
    setCustomBoutenInput,
    imageSrc,
    imageAlt,
    imageTitle,
    setImageSrc,
    setImageAlt,
    setImageTitle,
    openLinkPrompt,
    openRubyBoutenPrompt,
    openImagePrompt,
    handlePromptSubmit,
    handlePromptCancel,
    addCustomBoutenChar,
    removeSelectedCustomBoutenChar,
  }
}
