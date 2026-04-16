import path from "node:path";

/**
 * 結果の種別:
 *   - "e2e":      E2E テスト override。rawPath を path.resolve して setPath する。
 *   - "dev":      非パッケージ開発実行。resolvedPath を setPath する。
 *   - "packaged": パッケージ済みアプリ。Electron のデフォルト (appData/AppName) をそのまま使う。
 */
export type UserDataPathSpec =
  | { kind: "e2e"; rawPath: string }
  | { kind: "dev"; resolvedPath: string }
  | { kind: "packaged" };

/**
 * app.getPath("userData") を呼ぶ前に何を setPath すべきか決定する純粋関数。
 *
 * 優先順位:
 *   1. E2E override (NYOZE_E2E=1 かつ NYOZE_E2E_USER_DATA_DIR が空でない)
 *   2. 非パッケージ実行 → appData 下の appDisplayName サブディレクトリを明示指定
 *   3. パッケージ済みアプリ → Electron デフォルトに任せる (既に appName == "Nyoze")
 */
export function resolveUserDataPathSpec(options: {
  isPackaged: boolean;
  e2eEnabled: boolean;
  e2eUserDataDir: string | undefined;
  appDataPath: string;
  appDisplayName: string;
}): UserDataPathSpec {
  const { isPackaged, e2eEnabled, e2eUserDataDir, appDataPath, appDisplayName } = options;

  const e2eRaw = e2eEnabled ? (e2eUserDataDir?.trim() ?? "") : "";
  if (e2eRaw) {
    return { kind: "e2e", rawPath: e2eRaw };
  }

  if (!isPackaged) {
    // 非パッケージ実行では app.getName() が "Electron" のままのことがある。
    // app.getPath("userData") を呼ぶ前に明示的に Nyoze 専用パスを固定する。
    return { kind: "dev", resolvedPath: path.join(appDataPath, appDisplayName) };
  }

  return { kind: "packaged" };
}
