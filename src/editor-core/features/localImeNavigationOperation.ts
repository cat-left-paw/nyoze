export type LocalImeNavigationOperation =
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'home'
  | 'end'
  | 'page-up'
  | 'page-down'

export type LocalImeArrowNavigationOperation = Extract<
  LocalImeNavigationOperation,
  'arrow-left' | 'arrow-right' | 'arrow-up' | 'arrow-down'
>

export type LocalImeHomeEndNavigationOperation = Extract<
  LocalImeNavigationOperation,
  'home' | 'end'
>

export type LocalImePageUpDownNavigationOperation = Extract<
  LocalImeNavigationOperation,
  'page-up' | 'page-down'
>

export function isLocalImeArrowNavigationOperation(
  operation: LocalImeNavigationOperation,
): operation is LocalImeArrowNavigationOperation {
  return operation.startsWith('arrow-')
}
