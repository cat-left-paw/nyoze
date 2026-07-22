import { atomicWriteFile } from './atomicSave'

/** UTF-8 atomic write for Denden-compatible Markdown export (SEC-9). */
export async function writeDendenMarkdownExportFile(
  filePath: string,
  text: string,
): Promise<void> {
  await atomicWriteFile(filePath, text)
}
