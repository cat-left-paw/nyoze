import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { createUiTextGetter } from '../i18n/uiText'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useLibraryRegistry } from '../hooks/useLibraryRegistry'

type TextGetter = ReturnType<typeof createUiTextGetter>

function clearPendingCreateParent() {
  void window.nyozeBridge?.library?.clearCreateParent?.()
}

/**
 * 書庫管理画面。
 *
 * 現在 registered libraries を一覧表示し、active 書庫をハイライトする。
 * このスライスで行う mutation は、既存登録済み書庫の active 切り替えだけ:
 *  - renderer は `library.setActive(libraryId)` で id だけを渡し、rootPath は渡さない。
 *  - main 側で registry から rootPath を解決し、realpath / directory 検証後に
 *    persisted state / main-side active root を更新する。
 *  - 成功時は App へ activeRoot を返し、既存 File Explorer の dir 切り替え経路へ流す。
 *
 * 新しい書庫を作成 / 既存フォルダ登録は管理画面下部の操作群から行う。
 * 作成中は一覧・行操作を隠し、作成専用画面だけを表示する。
 * Finder / Explorer で表示は各行の Reveal ボタンから行う (registry 解決は main 側)。
 *
 * `dialog:openFolder` / `project:*` / `fs:writeFile` 等は呼ばず、`.nyoze` も作らない。
 *
 * 既存 Load / Project / Book / Notes の挙動は変更しない。
 */
export function LibraryManagerModal({
  open,
  t,
  onClose,
  onLibraryActivated,
}: {
  open: boolean
  t: TextGetter
  onClose: () => void
  /**
   * active 書庫の切り替えに成功したとき、main が確定した active root を渡す。
   * App は既存 File Explorer の dir 切り替え経路 (setFileExplorerDir) に流すだけ。
   */
  onLibraryActivated?: (activeRoot: string) => void
}) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dismissRef = useRef<() => void>(() => onClose)
  useFocusTrap(overlayRef, open)

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="prompt-overlay"
      data-testid="library-manager-overlay"
      onClick={() => dismissRef.current()}
    >
      <section
        className="prompt-dialog library-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-manager-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <LibraryManagerContent
          t={t}
          onClose={onClose}
          onLibraryActivated={onLibraryActivated}
          onRegisterDismiss={(handler) => {
            dismissRef.current = handler
          }}
        />
      </section>
    </div>
  )
}

function LibraryManagerContent({
  t,
  onClose,
  onLibraryActivated,
  onRegisterDismiss,
}: {
  t: TextGetter
  onClose: () => void
  onLibraryActivated?: (activeRoot: string) => void
  onRegisterDismiss: (handler: () => void) => void
}) {
  const { state, reload } = useLibraryRegistry()
  // 切り替え中の libraryId (row / button を busy にする) と失敗表示。
  const [busyId, setBusyId] = useState<string | null>(null)
  const [registerBusy, setRegisterBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // rename 編集中の libraryId / 入力 draft / 保存中フラグ。
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [confirmUnregisterId, setConfirmUnregisterId] = useState<string | null>(null)
  const [unregisterBusyId, setUnregisterBusyId] = useState<string | null>(null)
  const [revealBusyId, setRevealBusyId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createNameDraft, setCreateNameDraft] = useState('')
  const [createParentReady, setCreateParentReady] = useState(false)
  const [pickParentBusy, setPickParentBusy] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)

  const resetCreateState = useCallback(() => {
    setCreateOpen(false)
    setCreateNameDraft('')
    setCreateParentReady(false)
    setPickParentBusy(false)
    setCreateBusy(false)
  }, [])

  const cancelCreate = useCallback(() => {
    clearPendingCreateParent()
    resetCreateState()
    setActionError(null)
  }, [resetCreateState])

  const handleDismiss = useCallback(() => {
    if (createOpen) {
      cancelCreate()
      return
    }
    onClose()
  }, [cancelCreate, createOpen, onClose])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleDismiss()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleDismiss])

  useEffect(() => {
    onRegisterDismiss(handleDismiss)
  }, [handleDismiss, onRegisterDismiss])

  useEffect(() => {
    return () => {
      clearPendingCreateParent()
    }
  }, [])

  const startRename = (libraryId: string, currentName: string) => {
    setRenameId(libraryId)
    setRenameDraft(currentName)
    setActionError(null)
  }

  const cancelRename = () => {
    // 入力を破棄する (IPC は呼ばない)。
    setRenameId(null)
    setRenameDraft('')
  }

  const handleRenameSave = async (libraryId: string) => {
    const bridge = window.nyozeBridge?.library
    if (!bridge?.rename) return
    const name = renameDraft.trim()
    if (name.length === 0) {
      setActionError(t('library.renameInvalidName'))
      return
    }
    setRenameBusy(true)
    setActionError(null)
    try {
      // renderer は { libraryId, name } だけを渡す (rootPath は送らない)。
      const result = await bridge.rename(libraryId, name)
      if (result.ok) {
        setRenameId(null)
        setRenameDraft('')
        reload()
      } else if (result.error === 'invalid-name') {
        setActionError(t('library.renameInvalidName'))
      } else {
        setActionError(t('library.renameFailed'))
      }
    } catch {
      setActionError(t('library.renameFailed'))
    } finally {
      setRenameBusy(false)
    }
  }

  const handleOpen = async (libraryId: string) => {
    const bridge = window.nyozeBridge?.library
    if (!bridge?.setActive) return
    setBusyId(libraryId)
    setActionError(null)
    try {
      // renderer は libraryId だけを渡す (rootPath は送らない)。
      const result = await bridge.setActive(libraryId)
      if (result.ok) {
        onLibraryActivated?.(result.activeRoot)
        reload()
      } else {
        setActionError(t('library.openFailed'))
      }
    } catch {
      setActionError(t('library.openFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const handleRegisterExisting = async () => {
    const bridge = window.nyozeBridge?.library
    if (!bridge?.registerExisting) return
    setRegisterBusy(true)
    setActionError(null)
    try {
      const result = await bridge.registerExisting()
      if (result.ok) {
        onLibraryActivated?.(result.activeRoot)
        reload()
      } else if (result.error === 'canceled') {
        // キャンセルは何も変えない (エラー表示しない)。
      } else if (result.error === 'limit-reached') {
        setActionError(t('library.registerLimitReached'))
      } else {
        setActionError(t('library.registerFailed'))
      }
    } catch {
      setActionError(t('library.registerFailed'))
    } finally {
      setRegisterBusy(false)
    }
  }

  const handlePickCreateParent = async () => {
    const bridge = window.nyozeBridge?.library
    if (!bridge?.pickCreateParent) return
    setPickParentBusy(true)
    setActionError(null)
    try {
      const result = await bridge.pickCreateParent()
      if (result.ok) {
        setCreateParentReady(true)
      } else if (result.error === 'canceled') {
        // キャンセルは error 表示しない。
      } else if (result.error === 'limit-reached') {
        setActionError(t('library.registerLimitReached'))
      } else {
        setActionError(t('library.createFailed'))
      }
    } catch {
      setActionError(t('library.createFailed'))
    } finally {
      setPickParentBusy(false)
    }
  }

  const handleCreateNew = async () => {
    const bridge = window.nyozeBridge?.library
    if (!bridge?.createNew) return
    const name = createNameDraft.trim()
    if (name.length === 0) {
      setActionError(t('library.createInvalidName'))
      return
    }
    if (!createParentReady) {
      setActionError(t('library.createParentMissing'))
      return
    }
    setCreateBusy(true)
    setActionError(null)
    try {
      const result = await bridge.createNew(name)
      if (result.ok) {
        clearPendingCreateParent()
        resetCreateState()
        onLibraryActivated?.(result.activeRoot)
        reload()
      } else if (result.error === 'canceled') {
        // createNew では通常起きない。
      } else if (result.error === 'invalid-name') {
        setActionError(t('library.createInvalidName'))
      } else if (result.error === 'limit-reached') {
        setActionError(t('library.registerLimitReached'))
      } else if (result.error === 'already-exists') {
        setActionError(t('library.createAlreadyExists'))
      } else if (result.error === 'no-parent') {
        setCreateParentReady(false)
        setActionError(t('library.createParentMissing'))
      } else {
        setActionError(t('library.createFailed'))
      }
    } catch {
      setActionError(t('library.createFailed'))
    } finally {
      setCreateBusy(false)
    }
  }

  const cancelUnregister = () => {
    setConfirmUnregisterId(null)
  }

  const handleUnregisterConfirm = async (libraryId: string) => {
    const bridge = window.nyozeBridge?.library
    if (!bridge?.unregister) return
    setUnregisterBusyId(libraryId)
    setActionError(null)
    try {
      const result = await bridge.unregister(libraryId)
      if (result.ok) {
        setConfirmUnregisterId(null)
        if (result.activeChanged && result.activeRoot) {
          onLibraryActivated?.(result.activeRoot)
        }
        reload()
      } else if (result.error === 'last-library') {
        setActionError(t('library.unregisterLastLibrary'))
      } else {
        setActionError(t('library.unregisterFailed'))
      }
    } catch {
      setActionError(t('library.unregisterFailed'))
    } finally {
      setUnregisterBusyId(null)
    }
  }

  const handleReveal = async (libraryId: string) => {
    const bridge = window.nyozeBridge?.library
    if (!bridge?.reveal) return
    setRevealBusyId(libraryId)
    setActionError(null)
    try {
      // renderer は libraryId だけを渡す (rootPath は送らない)。
      const result = await bridge.reveal(libraryId)
      if (!result.ok) {
        if (result.error === 'not-found') {
          setActionError(t('library.revealNotFound'))
        } else {
          setActionError(t('library.revealFailed'))
        }
      }
    } catch {
      setActionError(t('library.revealFailed'))
    } finally {
      setRevealBusyId(null)
    }
  }

  const startCreate = () => {
    setCreateOpen(true)
    setCreateNameDraft('')
    setCreateParentReady(false)
    setActionError(null)
  }

  if (state.status === 'loading') {
    return (
      <>
        <h2 id="library-manager-modal-title" className="prompt-title">
          {t('library.manageTitle')}
        </h2>
        <p className="library-manager-status" data-state="loading">
          {t('library.loading')}
        </p>
        <div className="prompt-buttons">
          <button type="button" onClick={onClose}>
            {t('library.close')}
          </button>
        </div>
      </>
    )
  }
  if (state.status === 'error') {
    return (
      <>
        <h2 id="library-manager-modal-title" className="prompt-title">
          {t('library.manageTitle')}
        </h2>
        <p className="library-manager-status" data-state="error" role="alert">
          {t('library.error')}
        </p>
        <div className="prompt-buttons">
          <button type="button" onClick={onClose}>
            {t('library.close')}
          </button>
        </div>
      </>
    )
  }

  const { registeredLibraries, activeLibraryId, maxRegisteredLibraries } = state
  const isEmpty = registeredLibraries.length === 0
  // いずれかの mutation 進行中は他の操作を無効化する。
  const listBusy =
    busyId !== null ||
    registerBusy ||
    renameBusy ||
    unregisterBusyId !== null ||
    revealBusyId !== null

  return (
    <>
      <h2 id="library-manager-modal-title" className="prompt-title">
        {createOpen ? t('library.actionCreate') : t('library.manageTitle')}
      </h2>
        {!createOpen ? (
        <p className="prompt-note library-manager-helper">
          {t('library.manageTitle', 'helper')}
        </p>
      ) : null}

      {actionError ? (
        <p className="library-manager-status" data-state="error" role="alert">
          {actionError}
        </p>
      ) : null}

      {createOpen ? (
        <LibraryCreatePanel
          t={t}
          createNameDraft={createNameDraft}
          onCreateNameDraftChange={setCreateNameDraft}
          createParentReady={createParentReady}
          pickParentBusy={pickParentBusy}
          createBusy={createBusy}
          onPickParent={() => void handlePickCreateParent()}
          onCreate={() => void handleCreateNew()}
          onCancelCreate={cancelCreate}
        />
      ) : (
        <>
          <p className="library-manager-count">
            {t('library.count')
              .replace('{n}', String(registeredLibraries.length))
              .replace('{max}', String(maxRegisteredLibraries))}
          </p>

          {isEmpty ? (
            <p className="library-manager-empty" data-state="empty">
              {t('library.empty')}
            </p>
          ) : (
            <ul className="library-manager-list">
              {registeredLibraries.map((lib) => {
                const isActive = lib.id === activeLibraryId
                const isEditing = lib.id === renameId
                const isConfirmingUnregister = lib.id === confirmUnregisterId
                return (
                  <li
                    key={lib.id}
                    className="library-manager-row"
                    data-active={isActive ? 'true' : 'false'}
                  >
                    <div className="library-manager-row-main">
                      {isEditing ? (
                        <input
                          className="library-manager-rename-input"
                          type="text"
                          aria-label={t('library.renameInputLabel')}
                          value={renameDraft}
                          maxLength={80}
                          autoFocus
                          disabled={renameBusy}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            // IME 変換確定の Enter (composing / keyCode 229) は保存にしない。
                            const native = event.nativeEvent as KeyboardEvent
                            if (native.isComposing || native.keyCode === 229) return
                            if (event.key === 'Enter') void handleRenameSave(lib.id)
                            else if (event.key === 'Escape') cancelRename()
                          }}
                        />
                      ) : (
                        <span className="library-manager-name" title={lib.name}>
                          {lib.name}
                        </span>
                      )}
                      {isActive && !isEditing ? (
                        <span className="library-manager-active-badge">
                          {t('library.activeBadge')}
                        </span>
                      ) : null}
                      <div className="library-manager-row-actions">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="library-manager-rename-save"
                              onClick={() => void handleRenameSave(lib.id)}
                              disabled={renameBusy}
                            >
                              {t('library.renameSave')}
                            </button>
                            <button
                              type="button"
                              className="library-manager-rename-cancel"
                              onClick={cancelRename}
                              disabled={renameBusy}
                            >
                              {t('library.renameCancel')}
                            </button>
                          </>
                        ) : (
                          <>
                            {!isActive ? (
                              <button
                                type="button"
                                className="library-manager-open-button"
                                onClick={() => void handleOpen(lib.id)}
                                disabled={listBusy}
                              >
                                {busyId === lib.id ? t('library.opening') : t('library.open')}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="library-manager-reveal-button"
                              onClick={() => void handleReveal(lib.id)}
                              disabled={listBusy || confirmUnregisterId !== null}
                            >
                              {revealBusyId === lib.id
                                ? t('library.revealing')
                                : t('library.actionReveal')}
                            </button>
                            <button
                              type="button"
                              className="library-manager-rename-button"
                              onClick={() => startRename(lib.id, lib.name)}
                              disabled={listBusy || confirmUnregisterId !== null}
                            >
                              {t('library.actionRename')}
                            </button>
                            <button
                              type="button"
                              className="library-manager-unregister-button"
                              onClick={() => {
                                setConfirmUnregisterId(lib.id)
                                setActionError(null)
                              }}
                              disabled={listBusy || confirmUnregisterId !== null}
                            >
                              {t('library.actionUnregister')}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="library-manager-row-path" title={lib.rootPath}>
                      {lib.rootPath}
                    </div>
                    {isConfirmingUnregister ? (
                      <div className="library-manager-unregister-confirm" role="group">
                        <p className="library-manager-unregister-confirm-text">
                          {t('library.unregisterConfirm')}
                        </p>
                        <p className="library-manager-unregister-confirm-helper">
                          {t('library.unregisterConfirm', 'helper')}
                        </p>
                        <div className="library-manager-unregister-confirm-actions">
                          <button
                            type="button"
                            className="library-manager-unregister-confirm-button"
                            onClick={() => void handleUnregisterConfirm(lib.id)}
                            disabled={unregisterBusyId === lib.id}
                          >
                            {unregisterBusyId === lib.id
                              ? t('library.unregistering')
                              : t('library.unregisterConfirmAction')}
                          </button>
                          <button
                            type="button"
                            className="library-manager-unregister-cancel-button"
                            onClick={cancelUnregister}
                            disabled={unregisterBusyId === lib.id}
                          >
                            {t('library.unregisterCancel')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {lib.lastOpenedAt ? (
                      <div className="library-manager-row-last-opened">
                        <FormattedLastOpenedAt t={t} value={lib.lastOpenedAt} />
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}

          <LibraryListActions
            t={t}
            onRegister={() => void handleRegisterExisting()}
            registerBusy={registerBusy}
            onStartCreate={startCreate}
            disabled={listBusy}
          />
        </>
      )}

      {!createOpen ? (
        <div className="prompt-buttons">
          <button type="button" onClick={onClose}>
            {t('library.close')}
          </button>
        </div>
      ) : null}
    </>
  )
}

function FormattedLastOpenedAt({ t, value }: { t: TextGetter; value: string }) {
  const formatted = useMemo(() => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    try {
      return date.toLocaleString()
    } catch {
      return value
    }
  }, [value])
  return (
    <>
      <span className="library-manager-row-last-opened-label">
        {t('library.lastOpened')}
      </span>
      <span className="library-manager-row-last-opened-value">{formatted}</span>
    </>
  )
}

/**
 * 書庫一覧画面の操作群 (登録 / 新規作成開始)。
 */
function LibraryListActions({
  t,
  onRegister,
  registerBusy,
  onStartCreate,
  disabled,
}: {
  t: TextGetter
  onRegister: () => void
  registerBusy: boolean
  onStartCreate: () => void
  disabled: boolean
}) {
  return (
    <div className="library-manager-placeholder-actions" aria-hidden={false}>
      <p className="library-manager-placeholder-helper">
        {t('library.placeholderHelper')}
      </p>
      <div className="library-manager-placeholder-buttons">
        <button
          type="button"
          className="library-manager-register-button"
          onClick={onRegister}
          disabled={disabled}
        >
          {registerBusy ? t('library.registering') : t('library.actionRegister')}
        </button>
        <button
          type="button"
          className="library-manager-create-button"
          onClick={onStartCreate}
          disabled={disabled}
        >
          {t('library.actionCreate')}
        </button>
      </div>
    </div>
  )
}

/**
 * 新規書庫作成専用画面。
 */
function LibraryCreatePanel({
  t,
  createNameDraft,
  onCreateNameDraftChange,
  createParentReady,
  pickParentBusy,
  createBusy,
  onPickParent,
  onCreate,
  onCancelCreate,
}: {
  t: TextGetter
  createNameDraft: string
  onCreateNameDraftChange: (value: string) => void
  createParentReady: boolean
  pickParentBusy: boolean
  createBusy: boolean
  onPickParent: () => void
  onCreate: () => void
  onCancelCreate: () => void
}) {
  const createBusyState = pickParentBusy || createBusy

  return (
    <div className="library-manager-create-panel" role="group">
      <label className="library-manager-create-label">
        <span>{t('library.createNameLabel')}</span>
        <p className="library-manager-create-helper">
          {t('library.createNameLabel', 'helper')}
        </p>
        <input
          className="library-manager-create-input"
          type="text"
          value={createNameDraft}
          maxLength={80}
          autoFocus
          disabled={createBusy}
          onChange={(event) => onCreateNameDraftChange(event.target.value)}
          onKeyDown={(event) => {
            const native = event.nativeEvent as KeyboardEvent
            if (native.isComposing || native.keyCode === 229) return
            if (event.key === 'Enter') onCreate()
            else if (event.key === 'Escape') onCancelCreate()
          }}
        />
      </label>
      <div className="library-manager-create-parent-section">
        <button
          type="button"
          className="library-manager-create-pick-parent-button"
          onClick={onPickParent}
          disabled={createBusyState}
        >
          {pickParentBusy ? t('library.createPickingParent') : t('library.createPickParent')}
        </button>
        <p className="library-manager-create-helper">
          {createParentReady
            ? t('library.createParentReady')
            : t('library.createParentBeforePick')}
        </p>
      </div>
      <div className="library-manager-create-actions">
        <button
          type="button"
          className="library-manager-create-submit-button"
          onClick={onCreate}
          disabled={createBusyState}
        >
          {createBusy ? t('library.creating') : t('library.createSubmit')}
        </button>
        <button
          type="button"
          className="library-manager-create-cancel-button"
          onClick={onCancelCreate}
          disabled={createBusy}
        >
          {t('library.createCancel')}
        </button>
      </div>
    </div>
  )
}
