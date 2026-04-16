import type { FrontmatterFields } from '../../editor-core/io/frontmatter'

type FrontmatterViewProps = {
  fields: FrontmatterFields
  visible: boolean
  showAuthors: boolean
  showTranslators: boolean
  showRoleLabels: boolean
}

function PersonLine({
  label,
  name,
  showRoleLabels,
}: {
  label: string
  name: string
  showRoleLabels: boolean
}) {
  return (
    <p className='frontmatter-person'>
      <span className='frontmatter-person-label'>
        {showRoleLabels ? label : '\u00A0'}
      </span>
      <span className='frontmatter-person-name'>{name}</span>
    </p>
  )
}

function PersonListLines({
  label,
  names,
  showRoleLabels,
}: {
  label: string
  names: string[]
  showRoleLabels: boolean
}) {
  if (names.length === 0) return null
  return (
    <>
      {names.map((name, i) => (
        <p key={i} className='frontmatter-person'>
          {i === 0 && (
            <span className='frontmatter-person-label'>
              {showRoleLabels ? label : '\u00A0'}
            </span>
          )}
          {i > 0 && <span className='frontmatter-person-label' aria-hidden='true'>{'\u00A0'}</span>}
          <span className='frontmatter-person-name'>{name}</span>
        </p>
      ))}
    </>
  )
}

export function FrontmatterView({
  fields,
  visible,
  showAuthors,
  showTranslators,
  showRoleLabels,
}: FrontmatterViewProps) {
  if (!visible) return null
  const hasTitle = !!(fields.title || fields.original_title || fields.subtitle)
  const hasCredits = !!(
    (showAuthors &&
      (fields.author || (fields.co_authors && fields.co_authors.length > 0))) ||
    (showTranslators &&
      (fields.translator ||
        (fields.co_translators && fields.co_translators.length > 0)))
  )

  if (!hasTitle && !hasCredits) return null

  return (
    <div className='frontmatter-view'>
      {hasTitle && (
        <div className='frontmatter-top'>
          {fields.title && (
            <h1 className='frontmatter-title'>{fields.title}</h1>
          )}
          {fields.original_title && (
            <p className='frontmatter-original-title'>{fields.original_title}</p>
          )}
          {fields.subtitle && (
            <p className='frontmatter-subtitle'>{fields.subtitle}</p>
          )}
        </div>
      )}
      {hasCredits && (
        <div className='frontmatter-bottom'>
          {showAuthors && fields.author && (
            <PersonLine label='著' name={fields.author} showRoleLabels={showRoleLabels} />
          )}
          {showAuthors && fields.co_authors && fields.co_authors.length > 0 && (
            <PersonListLines
              label='共著'
              names={fields.co_authors}
              showRoleLabels={showRoleLabels}
            />
          )}
          {showTranslators && fields.translator && (
            <PersonLine label='訳' name={fields.translator} showRoleLabels={showRoleLabels} />
          )}
          {showTranslators && fields.co_translators && fields.co_translators.length > 0 && (
            <PersonListLines
              label='共訳'
              names={fields.co_translators}
              showRoleLabels={showRoleLabels}
            />
          )}
        </div>
      )}
    </div>
  )
}
