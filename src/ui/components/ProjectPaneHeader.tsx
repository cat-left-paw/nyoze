import { IconPencil, IconRefresh, IconReplace } from '@tabler/icons-react'
import type { createUiTextGetter, UiTextKey } from '../i18n/uiText'
import type { ProjectTitleEditorApi } from '../hooks/useProjectTitleEditor'
import type { ProjectUnregisterState } from '../hooks/useProjectUnregister'
import type { ProjectListUiState } from '../hooks/useProjectList'
import { ProjectPaneIconButton } from './ProjectPaneIconButton'
import { ProjectRoleIcon } from './projectRoleIcons'
import { ProjectSwitcher } from './ProjectSwitcher'
import { ProjectTitleEditor } from './ProjectTitleEditor'
import { ProjectUnregisterControls } from './ProjectUnregisterControls'

type TextGetter = ReturnType<typeof createUiTextGetter>

type ProjectPaneHeaderReadyProps = {
  variant: 'ready'
  displayTitle: string
  currentProjectRoot: string
  titleEditor: ProjectTitleEditorApi
  readOnly: boolean
  onBeginTitleEdit: () => void
  onSaveProjectTitle: () => void
  switcherOpen: boolean
  onToggleSwitcher: () => void
  projectListState: ProjectListUiState
  onSelectProject: (projectRoot: string) => void
  onLoadProjectList: () => void
  unregisterState: ProjectUnregisterState
  onBeginUnregister: () => void
  onCancelUnregister: () => void
  onConfirmUnregister: () => void
  metadataWriteEnabled: boolean
}

type ProjectPaneHeaderCompactProps = {
  variant: 'compact'
}

type ProjectPaneHeaderProps = (ProjectPaneHeaderReadyProps | ProjectPaneHeaderCompactProps) & {
  t: TextGetter
  onRefresh: () => void
  refreshDisabled: boolean
}

/**
 * Project タブ上部の 1 行 header + 展開領域（title edit / switcher）。
 * 索引 scroll の外に置き、作品名と主要操作を常時表示する。
 */
export function ProjectPaneHeader(props: ProjectPaneHeaderProps) {
  const { t, onRefresh, refreshDisabled } = props

  if (props.variant === 'compact') {
    return (
      <div className="project-pane-header">
        <div className="project-pane-header-main">
          <ProjectRoleIcon role="project" />
          <span className="project-pane-header-label">{t('projectPanel.heading')}</span>
          <div className="project-pane-header-actions project-pane-row-actions">
            <ProjectPaneIconButton
              icon={IconRefresh}
              label={t('projectPanel.refresh')}
              onClick={onRefresh}
              disabled={refreshDisabled}
            />
          </div>
        </div>
      </div>
    )
  }

  const {
    displayTitle,
    currentProjectRoot,
    titleEditor,
    readOnly,
    onBeginTitleEdit,
    onSaveProjectTitle,
    switcherOpen,
    onToggleSwitcher,
    projectListState,
    onSelectProject,
    onLoadProjectList,
    unregisterState,
    onBeginUnregister,
    onCancelUnregister,
    onConfirmUnregister,
    metadataWriteEnabled,
  } = props

  const unregisterErrorKey: UiTextKey | null =
    unregisterState.kind === 'error' ? unregisterState.messageKey : null

  return (
    <>
      <div className="project-pane-header">
        <div className="project-pane-header-main">
          <ProjectRoleIcon role="project" />
          <span className="project-pane-header-label">{t('projectPanel.heading')}:</span>
          <span className="project-pane-header-title project-pane-row-text" title={displayTitle}>
            {displayTitle}
          </span>
          <div className="project-pane-header-actions project-pane-row-actions">
            {!readOnly ? (
              <ProjectPaneIconButton
                icon={IconPencil}
                label={t('projectPanel.titleEditButton')}
                onClick={onBeginTitleEdit}
              />
            ) : null}
            <ProjectPaneIconButton
              icon={IconReplace}
              label={t('projectPanel.switcherToggle')}
              onClick={onToggleSwitcher}
              ariaExpanded={switcherOpen}
              className={`project-pane-icon-btn${switcherOpen ? ' is-open' : ''}`}
            />
            <ProjectPaneIconButton
              icon={IconRefresh}
              label={t('projectPanel.refresh')}
              onClick={onRefresh}
              disabled={refreshDisabled}
            />
          </div>
        </div>
        {(titleEditor.editState.kind === 'editing' ||
          titleEditor.leaveBlocked ||
          unregisterErrorKey ||
          switcherOpen) && (
          <div className="project-pane-header-expand">
            <ProjectTitleEditor
              titleEditor={titleEditor}
              t={t}
              onSave={onSaveProjectTitle}
              onBeginUnregister={onBeginUnregister}
              readOnly={readOnly}
              unregisterErrorKey={unregisterErrorKey}
            />
            {switcherOpen ? (
              <div className="project-pane-switcher">
                <ProjectSwitcher
                  state={projectListState}
                  currentProjectRoot={currentProjectRoot}
                  onSelect={onSelectProject}
                  onRefresh={onLoadProjectList}
                  t={t}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
      {metadataWriteEnabled ? (
        <ProjectUnregisterControls
          unregisterState={unregisterState}
          t={t}
          onCancelUnregister={onCancelUnregister}
          onConfirmUnregister={onConfirmUnregister}
        />
      ) : null}
    </>
  )
}
