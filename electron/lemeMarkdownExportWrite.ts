import { atomicWriteFile } from './atomicSave'

/** UTF-8 atomic write for LeME-compatible Markdown export (SEC-9). */
export async function writeLeMEMarkdownExportFile(
  filePath: string,
  text: string,
): Promise<void> {
  await atomicWriteFile(filePath, text)
}
