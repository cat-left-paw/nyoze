import type { createUiTextGetter } from '../i18n/uiText'
import type { ProjectListUiState } from '../hooks/useProjectList'

type TextGetter = ReturnType<typeof createUiTextGetter>

/**
 * 左ペイン「作品一覧」タブの Project 一覧（presentational）。
 *
 * - read-only 表示のみ。click は表示フォルダ切替（projectRoot）に委ねる。
 * - 表示可否はタブ側が制御する（このコンポーネントは常に現在の state を描画する）。
 * - ready かつ 0 件のときは空状態を出す（タブを開いた状態で何も出ないのを避ける）。
 */
export function FileExplorerProjectListSection({
  state,
  onOpenProject,
  t,
}: {
  state: ProjectListUiState
  onOpenProject: (projectRoot: string) => void
  t: TextGetter
}) {
  if (state.kind === 'loading') {
    return (
      <div className="file-explorer-project-list">
        <p className="file-explorer-project-list-placeholder">{t('explorer.projectListLoading')}</p>
      </div>
    )
  }

  if (state.kind === 'error' || state.kind === 'unavailable') {
    return (
      <div className="file-explorer-project-list">
        <p className="file-explorer-project-list-placeholder">{t('explorer.projectListError')}</p>
      </div>
    )
  }

  if (state.kind !== 'ready' || state.projects.length === 0) {
    return (
      <div className="file-explorer-project-list">
        <p className="file-explorer-project-list-placeholder">{t('explorer.projectListEmpty')}</p>
      </div>
    )
  }

  return (
    <section
      className="file-explorer-project-list"
      aria-label={t('explorer.projectsHeading')}
    >
      <h3 className="file-explorer-project-list-heading">{t('explorer.projectsHeading')}</h3>
      <ul className="file-explorer-project-list-items">
        {state.projects.map((project) => (
          <li key={project.projectRoot} className="file-explorer-project-list-item">
            <button
              type="button"
              className="file-explorer-project-list-btn"
              onClick={() => onOpenProject(project.projectRoot)}
              title={project.relativePath}
            >
              <span className="file-explorer-project-list-main">
                <span className="file-explorer-project-list-title">{project.title}</span>
                <span className="file-explorer-project-list-path">{project.relativePath}</span>
              </span>
              {!project.hasBooksManifest ? (
                <span className="file-explorer-project-list-no-books">
                  {t('explorer.projectNoBooks')}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
