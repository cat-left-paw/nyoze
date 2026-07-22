/** Book / chapter navigation に共通する表示項目。 */
export type BookOutlineItem = {
  relativePath: string
  absolutePath: string
  title: string
  order: number | null
  isCurrent: boolean
  missing?: boolean
  authors?: string[]
  translators?: string[]
  /** books.json v3 上の stable item id。 */
  registryId?: string
}
