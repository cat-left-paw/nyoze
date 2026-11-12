/** PIS-DEFAULT-ON1: rendererを作る前に、そのprofileの互換設定を読む。 */
import fs from 'node:fs'
import { MAX_SETTINGS_FILE_SIZE, sanitizeSettingsJson } from './settingsSanitizer'

/** pure: schemaは既存のsanitizerだけを正本とする。旧設定は参照しない。 */
export function resolveStartupClassicInputEnabled(value: unknown): boolean {
  return sanitizeSettingsJson(value)?.classicInputEnabled === true
}

/** 欠損・破損・巨大ファイル・読み取り失敗は、新しい方式の既定へ倒す。 */
export function readStartupClassicInputEnabled(settingsJsonPath: string): boolean {
  try {
    const stat = fs.statSync(settingsJsonPath)
    if (!stat.isFile() || stat.size > MAX_SETTINGS_FILE_SIZE) return false
    return resolveStartupClassicInputEnabled(JSON.parse(fs.readFileSync(settingsJsonPath, 'utf8')))
  } catch {
    return false
  }
}
