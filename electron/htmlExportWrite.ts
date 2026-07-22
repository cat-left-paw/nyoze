import { atomicWriteFile } from './atomicSave'

/** UTF-8 atomic write for standalone HTML export (SEC-9). */
export async function writeHtmlExportFile(
  filePath: string,
  html: string,
): Promise<void> {
  await atomicWriteFile(filePath, html)
}
