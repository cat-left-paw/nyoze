import { atomicWriteFile } from './atomicSave'

/** UTF-8 atomic write for Aozora-style text export (SEC-9). */
export async function writeAozoraTextExportFile(
  filePath: string,
  text: string,
): Promise<void> {
  await atomicWriteFile(filePath, text)
}
