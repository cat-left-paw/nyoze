import { IconBook2, IconRefresh } from '@tabler/icons-react'
import type { createUiTextGetter } from '../i18n/uiText'
import type { ProjectListUiState } from '../hooks/useProjectList'
import { normalizeForCompare } from '../hooks/useFileExplorer'

type TextGetter = ReturnType<typeof createUiTextGetter>

/**
 * 作品切り替えパネル（presentational）。
 *
 * - `project:listProjects` の結果（{@link ProjectListUiState}）をそのまま表示する。
 * - current project（同じ projectRoot）は「現在」表示し、選択は disabled。
 * - `hasBooksManifest` を小さなアイコン + ラベルで示す（Book registry あり / なし）。
 * - 自身は state を持たない。load / refresh / select は呼び出し側のコールバックに委ねる。
 */
export function ProjectSwitcher({
  state,
  currentProjectRoot,
  onSelect,
  onRefresh,
  t,
}: {
  state: ProjectListUiState
  currentProjectRoot: string | null
  onSelect: (projectRoot: string) => void
  onRefresh: () => void
  t: TextGetter
}) {
  const normalizedCurrent =
    currentProjectRoot != null ? normalizeForCompare(currentProjectRoot) : null

  return (
    <div className="project-switcher" role="group" aria-label={t('projectPanel.switcherTitle')}>
      <div className="project-switcher-header">
        <span className="project-switcher-title">{t('projectPanel.switcherTitle')}</span>
        <button
          type="button"
          className="project-switcher-refresh"
          onClick={onRefresh}
          disabled={state.kind === 'loading'}
          aria-label={t('projectPanel.switcherRefresh')}
          title={t('projectPanel.switcherRefresh')}
        >
          <IconRefresh size={13} stroke={2} />
        </button>
      </div>

      {state.kind === 'loading' ? (
        <p className="project-switcher-placeholder">{t('projectPanel.switcherLoading')}</p>
      ) : state.kind === 'unavailable' ? (
        <p className="project-switcher-placeholder">{t('projectPanel.switcherUnavailable')}</p>
      ) : state.kind === 'error' ? (
        <p className="project-switcher-placeholder">{t('projectPanel.switcherError')}</p>
      ) : state.kind === 'ready' ? (
        state.projects.length === 0 ? (
          <p className="project-switcher-placeholder">{t('projectPanel.switcherEmpty')}</p>
        ) : (
          <ul className="project-switcher-list">
            {state.projects.map((project) => {
              const isCurrent =
                normalizedCurrent != null &&
                normalizeForCompare(project.projectRoot) === normalizedCurrent
              return (
                <li key={project.projectRoot} className="project-switcher-item">
                  <button
                    type="button"
                    className={`project-switcher-item-btn${isCurrent ? ' is-current' : ''}`}
                    onClick={() => onSelect(project.projectRoot)}
                    disabled={isCurrent}
                    aria-current={isCurrent ? 'true' : undefined}
                    title={project.relativePath}
                  >
                    <span className="project-switcher-item-main">
                      <span className="project-switcher-item-title">{project.title}</span>
                      <span className="project-switcher-item-path">{project.relativePath}</span>
                    </span>
                    <span className="project-switcher-item-meta">
                      {isCurrent ? (
                        <span className="project-switcher-current-badge">
                          {t('projectPanel.switcherCurrent')}
                        </span>
                      ) : null}
                      <span
                        className={`project-switcher-manifest${
                          project.hasBooksManifest ? ' has-manifest' : ' no-manifest'
                        }`}
                        title={
                          project.hasBooksManifest
                            ? t('projectPanel.switcherManifestYes')
                            : t('projectPanel.switcherManifestNo')
                        }
                        aria-label={
                          project.hasBooksManifest
                            ? t('projectPanel.switcherManifestYes')
                            : t('projectPanel.switcherManifestNo')
                        }
                      >
                        <IconBook2 size={13} stroke={2} />
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )
      ) : null}
    </div>
  )
}
