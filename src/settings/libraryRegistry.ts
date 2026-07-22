/**
 * 書庫 (Library / Workspace) registry の pure model + normalization。
 *
 * 書庫は Obsidian の vault に近い通常入口で、複数登録できるが active な書庫は
 * 常に 1 つだけ。通常利用では 1 書庫で十分という立場のため、初期 UI では
 * 登録数に上限を置く (MAX_REGISTERED_LIBRARIES)。
 *
 * このモジュールは pure helper のみで、filesystem には一切触れない。
 * 書庫登録だけで対象フォルダに `.nyoze` を作らない方針を守るため、ここでは
 * ディレクトリ作成・ファイル書き込み・`.nyoze` 参照を行わない。永続化 (どこに
 * 保存するか) と realpath 解決は呼び出し側 (main 側 workspace-state.json) の責務。
 *
 * `workspaceRoot` 互換:
 * - 現行は workspace root を 1 件だけ main 側 state file に保存している。
 * - normalize 時に legacy `workspaceRoot` を 1 件目の書庫として取り込み、
 *   active 書庫の rootPath が `workspaceRoot` と一致するよう整合させる。
 * - これにより既存の起動復元・File Explorer 初期 root を変えずに registry へ
 *   自然 migration できる。
 */

/** 通常利用は 1 書庫で十分という立場のため、登録数の初期上限。 */
export const MAX_REGISTERED_LIBRARIES = 10

export type RegisteredLibrary = {
  /** stable ID。表示には使わない。新規登録では UUID v4 を優先候補にする。 */
  id: string
  /** ユーザー向け書庫名。未指定時はフォルダ basename fallback。 */
  name: string
  /** 書庫 root の絶対パス。保存文字列は勝手に正規化しない。 */
  rootPath: string
  /** 最後に開いた時刻 (ISO 8601)。任意。 */
  lastOpenedAt?: string
}

export type LibraryRegistry = {
  registeredLibraries: RegisteredLibrary[]
  /** active 書庫の ID。登録が無ければ null。 */
  activeLibraryId: string | null
}

/** normalize の入力。legacy `workspaceRoot` を含み得る raw 値。 */
export type LibraryRegistryInput = {
  registeredLibraries?: unknown
  activeLibraryId?: unknown
  /** 互換: 現行の単一 workspace root。存在すれば 1 件目の書庫として取り込む。 */
  workspaceRoot?: unknown
}

export type NormalizeLibraryRegistryOptions = {
  /** 新規書庫 ID の生成器。未指定時は crypto / フォールバックで生成。 */
  generateId?: () => string
  /**
   * 指定すると、`workspaceRoot` から解決した active 書庫の `lastOpenedAt` を
   * この値で更新する。決定的なテストのため任意。
   */
  markActiveOpenedAt?: string
}

let fallbackIdCounter = 0

/** crypto.randomUUID があれば使い、無ければ衝突しにくい簡易 ID を返す。 */
function defaultGenerateLibraryId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  fallbackIdCounter += 1
  return `library-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** rootPath からフォルダ basename を取り出して書庫名 fallback にする。 */
export function deriveLibraryName(rootPath: string): string {
  const trimmed = rootPath.trim().replace(/[\\/]+$/, '')
  if (trimmed.length === 0) return 'Library'
  const segments = trimmed.split(/[\\/]/)
  const basename = segments[segments.length - 1]
  return basename.length > 0 ? basename : trimmed
}

/** dedupe / 比較用の rootPath key。保存文字列自体は書き換えない。 */
function rootPathKey(rootPath: string): string {
  return rootPath.trim().replace(/[\\/]+$/, '')
}

/** 1 件分の raw library entry を検証して整形する。無効なら null。 */
function sanitizeLibraryEntry(value: unknown, generateId: () => string): RegisteredLibrary | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (!isNonEmptyString(raw.rootPath)) return null
  const rootPath = raw.rootPath
  const id = isNonEmptyString(raw.id) ? raw.id : generateId()
  const name = isNonEmptyString(raw.name) ? raw.name : deriveLibraryName(rootPath)
  const entry: RegisteredLibrary = { id, name, rootPath }
  if (isNonEmptyString(raw.lastOpenedAt)) entry.lastOpenedAt = raw.lastOpenedAt
  return entry
}

/**
 * 書庫 registry を正規化する。
 *
 * 不変条件:
 * - active な書庫は常に 1 つだけ (activeLibraryId は登録内を指すか null)。
 * - duplicate rootPath は重複登録しない (先勝ち)。
 * - 登録数は MAX_REGISTERED_LIBRARIES に丸めるが active 書庫は失わない。
 * - legacy `workspaceRoot` があれば 1 件目として取り込み、active root と一致させる。
 *
 * filesystem には触れない (pure)。
 */
export function normalizeLibraryRegistry(
  input: LibraryRegistryInput,
  options: NormalizeLibraryRegistryOptions = {},
): LibraryRegistry {
  const generateId = options.generateId ?? defaultGenerateLibraryId
  const seenIds = new Set<string>()
  // 既存 id と衝突しない一意 id を返す (壊れた state や生成器の衝突対策)。
  const freshId = (): string => {
    let id = generateId()
    while (seenIds.has(id)) id = generateId()
    seenIds.add(id)
    return id
  }

  // 1. 各 entry を検証し、rootPath / id で dedupe (先勝ち)。
  const rawList = Array.isArray(input.registeredLibraries) ? input.registeredLibraries : []
  const libraries: RegisteredLibrary[] = []
  const seenRootKeys = new Set<string>()
  for (const raw of rawList) {
    const entry = sanitizeLibraryEntry(raw, generateId)
    if (!entry) continue
    const key = rootPathKey(entry.rootPath)
    if (seenRootKeys.has(key)) continue
    // id 衝突 (壊れた state) は再生成して一意化する。
    if (seenIds.has(entry.id)) entry.id = freshId()
    else seenIds.add(entry.id)
    seenRootKeys.add(key)
    libraries.push(entry)
  }

  // 2. legacy workspaceRoot を 1 件目の書庫として取り込む。
  let workspaceLibraryId: string | null = null
  if (isNonEmptyString(input.workspaceRoot)) {
    const workspaceRoot = input.workspaceRoot
    const key = rootPathKey(workspaceRoot)
    const existing = libraries.find((lib) => rootPathKey(lib.rootPath) === key)
    if (existing) {
      workspaceLibraryId = existing.id
    } else {
      const created: RegisteredLibrary = {
        id: freshId(),
        name: deriveLibraryName(workspaceRoot),
        rootPath: workspaceRoot,
      }
      libraries.push(created)
      workspaceLibraryId = created.id
    }
  }

  // 3. active 書庫を決める。
  //    workspaceRoot があればそれを優先 (root を一致させる)。
  //    無ければ既存 activeLibraryId が有効ならそれ、なければ先頭、それも無ければ null。
  let activeLibraryId: string | null
  if (workspaceLibraryId) {
    activeLibraryId = workspaceLibraryId
  } else if (
    isNonEmptyString(input.activeLibraryId) &&
    libraries.some((lib) => lib.id === input.activeLibraryId)
  ) {
    activeLibraryId = input.activeLibraryId
  } else {
    activeLibraryId = libraries.length > 0 ? libraries[0].id : null
  }

  // 4. 上限へ丸める。active 書庫は必ず残す。
  let clamped = libraries
  if (libraries.length > MAX_REGISTERED_LIBRARIES) {
    clamped = libraries.slice(0, MAX_REGISTERED_LIBRARIES)
    if (activeLibraryId && !clamped.some((lib) => lib.id === activeLibraryId)) {
      const activeLib = libraries.find((lib) => lib.id === activeLibraryId)
      if (activeLib) {
        // active を先頭に置き、残りは元順で MAX-1 件保持する。
        clamped = [activeLib, ...libraries.filter((lib) => lib.id !== activeLibraryId)].slice(
          0,
          MAX_REGISTERED_LIBRARIES,
        )
      }
    }
  }

  // 5. clamp 後に active が消えていないか最終確認。
  if (activeLibraryId && !clamped.some((lib) => lib.id === activeLibraryId)) {
    activeLibraryId = clamped.length > 0 ? clamped[0].id : null
  }

  // 6. workspaceRoot から解決した active 書庫の lastOpenedAt を更新 (任意)。
  if (workspaceLibraryId && isNonEmptyString(options.markActiveOpenedAt)) {
    const activeLib = clamped.find((lib) => lib.id === workspaceLibraryId)
    if (activeLib) activeLib.lastOpenedAt = options.markActiveOpenedAt
  }

  return { registeredLibraries: clamped, activeLibraryId }
}

/**
 * active 書庫の root path を返す pure helper。今後の UI / File Explorer 初期 root が
 * これを使えるようにする。active が無ければ null。
 */
export function resolveActiveLibraryRoot(registry: {
  registeredLibraries: RegisteredLibrary[]
  activeLibraryId: string | null
}): string | null {
  if (!registry.activeLibraryId) return null
  const active = registry.registeredLibraries.find((lib) => lib.id === registry.activeLibraryId)
  return active ? active.rootPath : null
}

/**
 * renderer 向け read-only payload。書庫管理画面 / 切り替え UI が将来 read する
 * canonical な書庫一覧 + active 情報 + 上限値。filesystem path 以外の機密情報を
 * 含まないように形を制限してある。
 *
 * 不変条件:
 * - 各 entry の rootPath 文字列は state に保存された値をそのまま渡す。
 * - state が存在しない / workspaceRoot が無いときは空 payload。
 * - normalize 結果に対応するため、id / dedupe / clamp / activeLibraryId 整合は適用済み。
 */
export type LibraryRegistryReadResult = {
  registeredLibraries: RegisteredLibrary[]
  activeLibraryId: string | null
  activeLibraryRoot: string | null
  maxRegisteredLibraries: number
}

/**
 * `workspace-state.json` の生 JSON から、renderer 向け read-only payload を作る pure helper。
 *
 * - raw が object でない / `workspaceRoot` 文字列が無いときは空 payload。
 * - 永続済み state が壊れている (broken activeLibraryId / duplicate rootPath / over-limit
 *   / invalid entry) 場合でも、normalize した canonical payload を返す。
 *   ここでは filesystem に書き戻さない (書き戻しは startup reconcile の責務)。
 * - filesystem に触れない (`.nyoze` も作らない)。
 */
export function readLibraryRegistryFromPersistedState(
  raw: unknown,
  options: NormalizeLibraryRegistryOptions = {},
): LibraryRegistryReadResult {
  const empty: LibraryRegistryReadResult = {
    registeredLibraries: [],
    activeLibraryId: null,
    activeLibraryRoot: null,
    maxRegisteredLibraries: MAX_REGISTERED_LIBRARIES,
  }
  if (!raw || typeof raw !== 'object') return empty
  const prev = raw as Record<string, unknown>
  // workspaceRoot は互換 SoT。これが無いときは書庫を持っていないユーザーとして
  // 常に empty を返す。`registeredLibraries` だけが残った壊れた state や古い試験
  // データから active library を露出させない (前スライスの reconcile 方針と一致)。
  if (!isNonEmptyString(prev.workspaceRoot)) return empty
  const workspaceRoot = prev.workspaceRoot
  const registry = normalizeLibraryRegistry(
    {
      registeredLibraries: prev.registeredLibraries,
      activeLibraryId: prev.activeLibraryId,
      workspaceRoot,
    },
    options,
  )
  return {
    registeredLibraries: registry.registeredLibraries,
    activeLibraryId: registry.activeLibraryId,
    activeLibraryRoot: resolveActiveLibraryRoot(registry),
    maxRegisteredLibraries: MAX_REGISTERED_LIBRARIES,
  }
}

/** workspace-state.json の永続化用 shape。 */
export type PersistedWorkspaceState = {
  /** 既存の trusted workspace root を残す互換キー (起動復元のための SoT)。 */
  workspaceRoot: string
  registeredLibraries: RegisteredLibrary[]
  activeLibraryId: string | null
}

function entriesEqual(a: RegisteredLibrary, b: RegisteredLibrary): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.rootPath === b.rootPath &&
    (a.lastOpenedAt ?? null) === (b.lastOpenedAt ?? null)
  )
}

function isPersistedStateEquivalent(
  prev: Record<string, unknown>,
  next: PersistedWorkspaceState,
): boolean {
  if (prev.workspaceRoot !== next.workspaceRoot) return false
  if ((prev.activeLibraryId ?? null) !== next.activeLibraryId) return false
  const prevList = Array.isArray(prev.registeredLibraries) ? prev.registeredLibraries : null
  if (!prevList) return false
  if (prevList.length !== next.registeredLibraries.length) return false
  for (let i = 0; i < prevList.length; i += 1) {
    const raw = prevList[i]
    if (!raw || typeof raw !== 'object') return false
    const candidate = raw as Record<string, unknown>
    const a: RegisteredLibrary = {
      id: typeof candidate.id === 'string' ? candidate.id : '',
      name: typeof candidate.name === 'string' ? candidate.name : '',
      rootPath: typeof candidate.rootPath === 'string' ? candidate.rootPath : '',
    }
    if (typeof candidate.lastOpenedAt === 'string') a.lastOpenedAt = candidate.lastOpenedAt
    if (!entriesEqual(a, next.registeredLibraries[i])) return false
  }
  return true
}

/**
 * 起動時に呼ぶ reconcile helper。raw な workspace-state を常に
 * `normalizeLibraryRegistry` に通し、書き戻しが必要な場合だけ next state を返す
 * (idempotent)。`workspaceRoot` 自体は書き換えず、registry の id / dedupe /
 * clamp / activeLibraryId 整合だけを修復する。
 *
 * - raw が object でない / `workspaceRoot` 文字列が無いときは `null` (何もしない)。
 * - 既存 registry が pure normalize 後と等価なら `null` (書き込み不要)。
 * - 等価でないときだけ `{ next }` を返す。呼び出し側は next を atomic に書き出す。
 *
 * 注意:
 * - `workspaceRoot` は起動復元の SoT なので常に preserve する。active library root を
 *   `workspaceRoot` と一致させるのは互換維持のため。
 * - filesystem に触れない (`.nyoze` も作らない)。
 *
 * @param options.markActiveOpenedAt 指定時のみ active 書庫の lastOpenedAt を更新する。
 *  起動時 reconcile では既存 timestamp を保護したいので未指定で呼ぶ想定。
 *  folder Load 経路の persist 側で日付更新する。
 */
export function computeWorkspaceStateUpdate(
  raw: unknown,
  options: NormalizeLibraryRegistryOptions = {},
): { next: PersistedWorkspaceState } | null {
  if (!raw || typeof raw !== 'object') return null
  const prev = raw as Record<string, unknown>
  if (!isNonEmptyString(prev.workspaceRoot)) return null
  const registry = normalizeLibraryRegistry(
    {
      registeredLibraries: prev.registeredLibraries,
      activeLibraryId: prev.activeLibraryId,
      workspaceRoot: prev.workspaceRoot,
    },
    options,
  )
  const next: PersistedWorkspaceState = {
    workspaceRoot: prev.workspaceRoot,
    registeredLibraries: registry.registeredLibraries,
    activeLibraryId: registry.activeLibraryId,
  }
  if (isPersistedStateEquivalent(prev, next)) return null
  return { next }
}

/** {@link setActiveLibraryById} の pure 結果。filesystem 検証は呼び出し側 (main)。 */
export type SetActiveLibraryResult =
  | { ok: true; next: PersistedWorkspaceState; activeRoot: string; activeLibraryId: string }
  | { ok: false; error: 'unknown-library' }

/**
 * 既存 registry 内の libraryId を active 書庫として選び直す pure helper。
 *
 * 入力:
 * - `raw`: workspace-state.json の生 JSON。
 * - `libraryId`: registeredLibraries に存在する書庫の id。renderer からは id だけを
 *   渡す前提で、rootPath を外から受け取らない (rootPath は registry から解決する)。
 * - `options.markActiveOpenedAt`: 指定時のみ selected の lastOpenedAt を更新。
 *
 * 挙動:
 * - `workspaceRoot` が非空文字列でなければ `{ ok: false, error: 'unknown-library' }`。
 *   `workspaceRoot` は互換 SoT。これが無い壊れた state から `registeredLibraries` だけを見て
 *   `workspaceRoot` を復活させない (read 側 `readLibraryRegistryFromPersistedState` の empty
 *   判定と同じ SoT に揃える)。
 * - registry を normalize (dedupe / clamp / id 整合)。
 * - libraryId が registeredLibraries に無ければ `{ ok: false, error: 'unknown-library' }`。
 * - 成功時は selected の rootPath を `workspaceRoot` と active root に反映した次 state を返す。
 *   selected は clamp で必ず保持され、`activeLibraryId = libraryId` になる。
 * - filesystem には触れない (`.nyoze` も作らない)。実在検証 / realpath は呼び出し側の責務。
 */
export function setActiveLibraryById(
  raw: unknown,
  libraryId: unknown,
  options: NormalizeLibraryRegistryOptions = {},
): SetActiveLibraryResult {
  const prev = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  // workspaceRoot 互換 SoT が無い state からは active を切り替えない (新規 workspaceRoot を
  // 復活させない)。read 側の empty 判定と同じ前提に揃える。
  if (!isNonEmptyString(prev.workspaceRoot)) return { ok: false, error: 'unknown-library' }
  const idOnly: NormalizeLibraryRegistryOptions = options.generateId
    ? { generateId: options.generateId }
    : {}
  // 1. raw を canonical な registry へ正規化 (既存 workspaceRoot は preserve)。
  const canonical = normalizeLibraryRegistry(
    {
      registeredLibraries: prev.registeredLibraries,
      activeLibraryId: prev.activeLibraryId,
      workspaceRoot: prev.workspaceRoot,
    },
    idOnly,
  )
  // 2. libraryId から対象を解決する (rootPath は外部から受け取らない)。
  if (!isNonEmptyString(libraryId)) return { ok: false, error: 'unknown-library' }
  const target = canonical.registeredLibraries.find((lib) => lib.id === libraryId)
  if (!target) return { ok: false, error: 'unknown-library' }
  // 3. 対象 rootPath を active として再正規化する。
  //    workspaceRoot=target.rootPath にすることで active=target、clamp で target を保持、
  //    markActiveOpenedAt で lastOpenedAt を更新できる。
  const registry = normalizeLibraryRegistry(
    {
      registeredLibraries: canonical.registeredLibraries,
      activeLibraryId: target.id,
      workspaceRoot: target.rootPath,
    },
    options,
  )
  const activeRoot = resolveActiveLibraryRoot(registry)
  if (!activeRoot || !registry.activeLibraryId) {
    // 通常到達しない (target は canonical 内に存在する) が、型安全のため fail にする。
    return { ok: false, error: 'unknown-library' }
  }
  return {
    ok: true,
    next: {
      workspaceRoot: activeRoot,
      registeredLibraries: registry.registeredLibraries,
      activeLibraryId: registry.activeLibraryId,
    },
    activeRoot,
    activeLibraryId: registry.activeLibraryId,
  }
}

/**
 * `library:setActive` IPC の result union。
 * renderer は libraryId だけを送り、main 側で rootPath 解決 / 実在検証する。
 */
export type LibrarySetActiveResult =
  | { ok: true; activeRoot: string; activeLibraryId: string }
  | { ok: false; error: 'unknown-library' | 'not-found' | 'write-failed' }

/** {@link registerExistingLibrary} の pure 結果。folder 選択 / 実在検証は呼び出し側 (main)。 */
export type RegisterExistingLibraryResult =
  | {
      ok: true
      next: PersistedWorkspaceState
      activeRoot: string
      activeLibraryId: string
      /** 新規追加なら true、既存 duplicate を active 化しただけなら false。 */
      added: boolean
    }
  | { ok: false; error: 'invalid-root' | 'limit-reached' }

/**
 * 既存フォルダ rootPath を書庫として registry に登録し、active 書庫にする pure helper。
 *
 * 入力:
 * - `raw`: workspace-state.json の生 JSON。
 * - `rootPath`: 登録するフォルダの絶対 path。main 側で dialog 選択 + realpath 済みを渡す。
 * - `options.markActiveOpenedAt`: 指定時のみ active 化した書庫の lastOpenedAt を更新。
 *
 * 挙動:
 * - `rootPath` が非空文字列でなければ `{ ok: false, error: 'invalid-root' }`。
 * - base registry は `workspaceRoot` SoT に従う: workspaceRoot があれば既存 registry を
 *   canonical 化、無ければ空から始める (read 側 empty 判定と整合。orphan な
 *   registeredLibraries を復活させない)。
 * - duplicate rootPath (trailing separator 違いを含む) は新規追加せず、その既存書庫を
 *   active 化して `{ ok: true, added: false }`。これは上限到達時でも許可する。
 * - 新規 rootPath は、登録数が `MAX_REGISTERED_LIBRARIES` 未満のときだけ追加して active 化し
 *   `{ ok: true, added: true }`。上限到達時は `{ ok: false, error: 'limit-reached' }`。
 * - name は `deriveLibraryName(rootPath)` fallback。
 * - filesystem には触れない (`.nyoze` も作らない)。実在検証 / realpath は呼び出し側の責務。
 */
export function registerExistingLibrary(
  raw: unknown,
  rootPath: unknown,
  options: NormalizeLibraryRegistryOptions = {},
): RegisterExistingLibraryResult {
  if (!isNonEmptyString(rootPath)) return { ok: false, error: 'invalid-root' }
  const prev = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const idOnly: NormalizeLibraryRegistryOptions = options.generateId
    ? { generateId: options.generateId }
    : {}

  // base registry: workspaceRoot SoT が無ければ空から始める (orphan を復活させない)。
  const base: LibraryRegistry = isNonEmptyString(prev.workspaceRoot)
    ? normalizeLibraryRegistry(
        {
          registeredLibraries: prev.registeredLibraries,
          activeLibraryId: prev.activeLibraryId,
          workspaceRoot: prev.workspaceRoot,
        },
        idOnly,
      )
    : { registeredLibraries: [], activeLibraryId: null }

  const key = rootPathKey(rootPath)
  const existing = base.registeredLibraries.find((lib) => rootPathKey(lib.rootPath) === key)

  // duplicate: 追加せず既存を active 化する (上限到達時でも許可)。
  if (existing) {
    const registry = normalizeLibraryRegistry(
      {
        registeredLibraries: base.registeredLibraries,
        activeLibraryId: existing.id,
        workspaceRoot: existing.rootPath,
      },
      options,
    )
    return buildRegisterResult(registry, false)
  }

  // 新規: 上限チェック。
  if (base.registeredLibraries.length >= MAX_REGISTERED_LIBRARIES) {
    return { ok: false, error: 'limit-reached' }
  }

  // 新規 entry を append し、workspaceRoot=rootPath で active 化する (id は normalize が付与)。
  const appended = [
    ...base.registeredLibraries,
    { name: deriveLibraryName(rootPath), rootPath },
  ]
  const registry = normalizeLibraryRegistry(
    { registeredLibraries: appended, workspaceRoot: rootPath },
    options,
  )
  return buildRegisterResult(registry, true)
}

/** normalize 済み registry から {@link RegisterExistingLibraryResult} を組み立てる。 */
function buildRegisterResult(
  registry: LibraryRegistry,
  added: boolean,
): RegisterExistingLibraryResult {
  const activeRoot = resolveActiveLibraryRoot(registry)
  if (!activeRoot || !registry.activeLibraryId) {
    // 通常到達しない (active を必ず設定している) が型安全のため fail にする。
    return { ok: false, error: 'invalid-root' }
  }
  return {
    ok: true,
    next: {
      workspaceRoot: activeRoot,
      registeredLibraries: registry.registeredLibraries,
      activeLibraryId: registry.activeLibraryId,
    },
    activeRoot,
    activeLibraryId: registry.activeLibraryId,
    added,
  }
}

/**
 * `library:registerExisting` IPC の result union。
 * renderer は引数なしで呼び、folder 選択は main 側 dialog で行う (rootPath を送らない)。
 */
export type LibraryRegisterExistingResult =
  | { ok: true; activeRoot: string; activeLibraryId: string; added: boolean }
  | { ok: false; error: 'canceled' | 'limit-reached' | 'not-found' | 'write-failed' }

/** 書庫名の最大文字数 (これを超える rename は reject)。既存 UI との相性で 80 文字。 */
export const MAX_LIBRARY_NAME_LENGTH = 80

/** {@link renameLibraryById} の pure 結果。filesystem 書き込みは呼び出し側 (main)。 */
export type RenameLibraryResult =
  | { ok: true; next: PersistedWorkspaceState }
  | { ok: false; error: 'unknown-library' | 'invalid-name' }

/**
 * registry 内の libraryId の name だけを変更する pure helper。
 *
 * 入力:
 * - `raw`: workspace-state.json の生 JSON。
 * - `libraryId`: 変更対象の書庫 id。
 * - `name`: 新しい書庫名。
 *
 * 挙動:
 * - `workspaceRoot` 互換 SoT が無ければ `{ ok: false, error: 'unknown-library' }`
 *   (orphan registry を復活させない。read / setActive と同じ SoT)。
 * - registry を normalize (dedupe / clamp / id 整合)。
 * - libraryId が registeredLibraries に無ければ `unknown-library`。
 * - name は trim する。空 / 上限 `MAX_LIBRARY_NAME_LENGTH` 超過は `invalid-name`。
 * - 重複名は許可 (rootPath が識別補助になる)。
 * - 成功時、対象の name だけ更新し、rootPath / id / lastOpenedAt / activeLibraryId /
 *   workspaceRoot は維持する。
 * - filesystem には触れない (`.nyoze` も作らない)。
 */
export function renameLibraryById(
  raw: unknown,
  libraryId: unknown,
  name: unknown,
  options: NormalizeLibraryRegistryOptions = {},
): RenameLibraryResult {
  const prev = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  // workspaceRoot 互換 SoT が無い state は対象外 (orphan を復活させない)。
  if (!isNonEmptyString(prev.workspaceRoot)) return { ok: false, error: 'unknown-library' }
  if (!isNonEmptyString(libraryId)) return { ok: false, error: 'unknown-library' }

  // name 検証 (trim + 空 / 長さ)。
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed.length === 0) return { ok: false, error: 'invalid-name' }
  if (trimmed.length > MAX_LIBRARY_NAME_LENGTH) return { ok: false, error: 'invalid-name' }

  const idOnly: NormalizeLibraryRegistryOptions = options.generateId
    ? { generateId: options.generateId }
    : {}
  const registry = normalizeLibraryRegistry(
    {
      registeredLibraries: prev.registeredLibraries,
      activeLibraryId: prev.activeLibraryId,
      workspaceRoot: prev.workspaceRoot,
    },
    idOnly,
  )

  const target = registry.registeredLibraries.find((lib) => lib.id === libraryId)
  if (!target) return { ok: false, error: 'unknown-library' }

  // name だけ差し替える。他フィールドは維持。
  const registeredLibraries = registry.registeredLibraries.map((lib) =>
    lib.id === libraryId ? { ...lib, name: trimmed } : lib,
  )
  const activeRoot = resolveActiveLibraryRoot(registry)
  if (!activeRoot || !registry.activeLibraryId) {
    // workspaceRoot SoT があるので通常到達しないが、型安全のため fail。
    return { ok: false, error: 'unknown-library' }
  }
  return {
    ok: true,
    next: {
      workspaceRoot: activeRoot,
      registeredLibraries,
      activeLibraryId: registry.activeLibraryId,
    },
  }
}

/**
 * `library:rename` IPC の result union。
 * renderer は `{ libraryId, name }` だけを送り、rootPath は渡さない。
 */
export type LibraryRenameResult =
  | { ok: true }
  | { ok: false; error: 'unknown-library' | 'invalid-name' | 'write-failed' }

/** {@link unregisterLibraryById} の pure 結果。filesystem 書き込みは呼び出し側 (main)。 */
export type UnregisterLibraryResult =
  | {
      ok: true
      next: PersistedWorkspaceState
      /** active 書庫を解除したときだけ true。非 active 解除では workspaceRoot / active は不変。 */
      activeChanged: boolean
      /** activeChanged のときだけ新 active root (stored rootPath)。それ以外は null。 */
      activeRoot: string | null
      /** activeChanged のときだけ新 activeLibraryId。それ以外は null。 */
      activeLibraryId: string | null
    }
  | { ok: false; error: 'unknown-library' | 'last-library' }

/**
 * registry から libraryId の書庫を外す pure helper。
 *
 * 入力:
 * - `raw`: workspace-state.json の生 JSON。
 * - `libraryId`: 解除対象の書庫 id。
 *
 * 挙動:
 * - `workspaceRoot` 互換 SoT が無ければ `unknown-library` (orphan registry を復活させない)。
 * - registry を normalize (dedupe / clamp / id 整合)。
 * - libraryId が registeredLibraries に無ければ `unknown-library`。
 * - 登録が 1 件だけなら `last-library` (workspaceRoot SoT / 起動復元は別スライスで整理)。
 * - 成功時、対象 entry だけ registry から除去する。rootPath / name / lastOpenedAt は残存 entry で維持。
 * - 非 active 解除: `workspaceRoot` / `activeLibraryId` は維持、`activeChanged: false`。
 * - active 解除: 残存があれば「解除対象の次の行」を優先、無ければ「前の行」を新 active にする。
 *   `workspaceRoot` を新 active の stored rootPath へ更新する。
 * - filesystem には触れない (フォルダ / `.nyoze` / Markdown は削除しない)。
 */
export function unregisterLibraryById(
  raw: unknown,
  libraryId: unknown,
  options: NormalizeLibraryRegistryOptions = {},
): UnregisterLibraryResult {
  const prev = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  if (!isNonEmptyString(prev.workspaceRoot)) return { ok: false, error: 'unknown-library' }
  if (!isNonEmptyString(libraryId)) return { ok: false, error: 'unknown-library' }

  const idOnly: NormalizeLibraryRegistryOptions = options.generateId
    ? { generateId: options.generateId }
    : {}
  const registry = normalizeLibraryRegistry(
    {
      registeredLibraries: prev.registeredLibraries,
      activeLibraryId: prev.activeLibraryId,
      workspaceRoot: prev.workspaceRoot,
    },
    idOnly,
  )

  const targetIndex = registry.registeredLibraries.findIndex((lib) => lib.id === libraryId)
  if (targetIndex < 0) return { ok: false, error: 'unknown-library' }

  if (registry.registeredLibraries.length <= 1) {
    return { ok: false, error: 'last-library' }
  }

  const wasActive = registry.activeLibraryId === libraryId
  const remaining = registry.registeredLibraries.filter((lib) => lib.id !== libraryId)

  let nextActiveLibraryId = registry.activeLibraryId
  let nextWorkspaceRoot = prev.workspaceRoot

  if (wasActive) {
    const nextLib =
      registry.registeredLibraries[targetIndex + 1] ??
      registry.registeredLibraries[targetIndex - 1]
    if (!nextLib) {
      // length > 1 なので通常到達しない。
      return { ok: false, error: 'unknown-library' }
    }
    nextActiveLibraryId = nextLib.id
    nextWorkspaceRoot = nextLib.rootPath
  }

  return {
    ok: true,
    next: {
      workspaceRoot: nextWorkspaceRoot,
      registeredLibraries: remaining,
      activeLibraryId: nextActiveLibraryId,
    },
    activeChanged: wasActive,
    activeRoot: wasActive ? nextWorkspaceRoot : null,
    activeLibraryId: wasActive ? nextActiveLibraryId : null,
  }
}

/**
 * `library:unregister` IPC の result union。
 * renderer は `libraryId` だけを送り、rootPath は渡さない。
 */
export type LibraryUnregisterResult =
  | { ok: true; activeRoot: string | null; activeLibraryId: string | null; activeChanged: boolean }
  | { ok: false; error: 'unknown-library' | 'last-library' | 'not-found' | 'write-failed' }

/** {@link resolveLibraryRootById} の pure 結果。filesystem 検証は呼び出し側 (main)。 */
export type ResolveLibraryRootResult =
  | { ok: true; rootPath: string }
  | { ok: false; error: 'unknown-library' }

/**
 * registry から libraryId の stored rootPath を解決する pure helper。
 *
 * 入力:
 * - `raw`: workspace-state.json の生 JSON。
 * - `libraryId`: 対象書庫 id。
 *
 * 挙動:
 * - `workspaceRoot` 互換 SoT が無ければ `unknown-library` (orphan registry を復活させない)。
 * - registry を normalize (dedupe / clamp / id 整合)。
 * - libraryId が registeredLibraries に無ければ `unknown-library` (dedupe 落ち id も含む)。
 * - 成功時は stored rootPath 文字列を返す (勝手に正規化しない)。
 * - filesystem には触れない (`.nyoze` も作らない)。
 */
export function resolveLibraryRootById(
  raw: unknown,
  libraryId: unknown,
  options: NormalizeLibraryRegistryOptions = {},
): ResolveLibraryRootResult {
  const prev = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  if (!isNonEmptyString(prev.workspaceRoot)) return { ok: false, error: 'unknown-library' }
  if (!isNonEmptyString(libraryId)) return { ok: false, error: 'unknown-library' }

  const idOnly: NormalizeLibraryRegistryOptions = options.generateId
    ? { generateId: options.generateId }
    : {}
  const registry = normalizeLibraryRegistry(
    {
      registeredLibraries: prev.registeredLibraries,
      activeLibraryId: prev.activeLibraryId,
      workspaceRoot: prev.workspaceRoot,
    },
    idOnly,
  )

  const target = registry.registeredLibraries.find((lib) => lib.id === libraryId)
  if (!target) return { ok: false, error: 'unknown-library' }
  return { ok: true, rootPath: target.rootPath }
}

/**
 * `library:reveal` IPC の result union。
 * renderer は `libraryId` だけを送り、rootPath は渡さない。
 */
export type LibraryRevealResult =
  | { ok: true }
  | { ok: false; error: 'unknown-library' | 'not-found' | 'reveal-failed' }

/** 新規書庫フォルダ名の最大文字数 (rename と同じ 80 文字)。 */
export const MAX_LIBRARY_FOLDER_NAME_LENGTH = MAX_LIBRARY_NAME_LENGTH

export type ValidateLibraryFolderNameResult =
  | { ok: true; trimmed: string }
  | { ok: false; error: 'invalid-name' }

/**
 * 新規書庫フォルダ名を検証する pure helper。
 *
 * - trim する。空 / 上限超過 / path separator / `.` / `..` / NUL は `invalid-name`。
 * - filesystem には触れない。
 */
export function validateLibraryFolderName(name: unknown): ValidateLibraryFolderNameResult {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed.length === 0) return { ok: false, error: 'invalid-name' }
  if (trimmed.length > MAX_LIBRARY_FOLDER_NAME_LENGTH) return { ok: false, error: 'invalid-name' }
  if (trimmed === '.' || trimmed === '..') return { ok: false, error: 'invalid-name' }
  if (trimmed.includes('\0')) return { ok: false, error: 'invalid-name' }
  if (/[/\\]/.test(trimmed)) return { ok: false, error: 'invalid-name' }
  return { ok: true, trimmed }
}

/** registry 件数上限判定用の canonical base。orphan registry は復活させない。 */
export function resolveLibraryRegistryBase(
  raw: unknown,
  options: NormalizeLibraryRegistryOptions = {},
): LibraryRegistry {
  const prev = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const idOnly: NormalizeLibraryRegistryOptions = options.generateId
    ? { generateId: options.generateId }
    : {}
  if (isNonEmptyString(prev.workspaceRoot)) {
    return normalizeLibraryRegistry(
      {
        registeredLibraries: prev.registeredLibraries,
        activeLibraryId: prev.activeLibraryId,
        workspaceRoot: prev.workspaceRoot,
      },
      idOnly,
    )
  }
  return { registeredLibraries: [], activeLibraryId: null }
}

/** 登録上限に達しているか (pure)。fresh / workspaceRoot 無し state では false。 */
export function isLibraryRegistryAtLimit(
  raw: unknown,
  options: NormalizeLibraryRegistryOptions = {},
): boolean {
  return (
    resolveLibraryRegistryBase(raw, options).registeredLibraries.length >=
    MAX_REGISTERED_LIBRARIES
  )
}

/** {@link registerNewLibraryEntry} の pure 結果。mkdir / dialog は呼び出し側 (main)。 */
export type RegisterNewLibraryResult =
  | { ok: true; next: PersistedWorkspaceState; activeRoot: string; activeLibraryId: string }
  | { ok: false; error: 'limit-reached' | 'invalid-root' | 'invalid-name' }

/**
 * 新規作成済み rootPath を registry に追加し active 書庫にする pure helper。
 *
 * - base registry は `workspaceRoot` SoT に従う。無ければ空から開始 (orphan を復活させない)。
 * - 登録数が上限なら `limit-reached` (mkdir 前に main 側でも判定すること)。
 * - `name` は validate 済み trimmed 文字列を渡す想定。未検証の場合は内部で validate する。
 * - duplicate rootPath は想定しない (fs 側で already-exists を先に弾く)。
 * - filesystem には触れない (`.nyoze` も作らない)。
 */
export function registerNewLibraryEntry(
  raw: unknown,
  rootPath: unknown,
  name: unknown,
  options: NormalizeLibraryRegistryOptions = {},
): RegisterNewLibraryResult {
  if (!isNonEmptyString(rootPath)) return { ok: false, error: 'invalid-root' }
  const validated = validateLibraryFolderName(name)
  if (!validated.ok) return { ok: false, error: 'invalid-name' }

  const base = resolveLibraryRegistryBase(raw, options)
  if (base.registeredLibraries.length >= MAX_REGISTERED_LIBRARIES) {
    return { ok: false, error: 'limit-reached' }
  }

  const appended = [
    ...base.registeredLibraries,
    { name: validated.trimmed, rootPath },
  ]
  const registry = normalizeLibraryRegistry(
    { registeredLibraries: appended, workspaceRoot: rootPath },
    options,
  )
  const activeRoot = resolveActiveLibraryRoot(registry)
  if (!activeRoot || !registry.activeLibraryId) {
    return { ok: false, error: 'invalid-root' }
  }
  return {
    ok: true,
    next: {
      workspaceRoot: activeRoot,
      registeredLibraries: registry.registeredLibraries,
      activeLibraryId: registry.activeLibraryId,
    },
    activeRoot,
    activeLibraryId: registry.activeLibraryId,
  }
}

/**
 * `library:createNew` IPC の result union。
 * renderer は `name` だけを送り、parent path / 完成 rootPath は渡さない。
 */
export type LibraryCreateNewResult =
  | { ok: true; activeRoot: string; activeLibraryId: string }
  | {
      ok: false
      error:
        | 'canceled'
        | 'invalid-name'
        | 'limit-reached'
        | 'already-exists'
        | 'no-parent'
        | 'write-failed'
        | 'create-failed'
    }

/**
 * `library:pickCreateParent` IPC の result union。
 * parent path は main 側一時 state に保持し、renderer へは返さない。
 */
export type LibraryPickCreateParentResult =
  | { ok: true }
  | { ok: false; error: 'canceled' | 'limit-reached' | 'not-found' }
