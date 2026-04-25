import type { DocThemePreset, UiThemePreset } from "../types";

/**
 * Curated UI + document presets: quiet, literary, warm neutrals.
 * Complements Greige / Taupe / Linen while staying visually distinct.
 */
export const QUIET_LITERARY_UI_PRESETS: UiThemePreset[] = [
  {
    id: "curated-ui-quiet-haze",
    name: "Quiet Haze",
    kind: "system",
    baseTheme: "dove",
    colors: {
      baseBg: "#dbddd9",
      surfaceBg: "#e6e8e5",
      textPrimary: "#454946",
      accent: "#5f7674",
      border: "#bfc4bf",
      paneBorder: "#cbd0ca",
      scrollbarBase: "#a3a9a3",
    },
  },
  {
    id: "curated-ui-amber-folio",
    name: "Amber Folio",
    kind: "system",
    baseTheme: "taupe",
    colors: {
      baseBg: "#e5dccf",
      surfaceBg: "#ede4d6",
      textPrimary: "#423a31",
      accent: "#8b6f4e",
      border: "#cec1b0",
      paneBorder: "#d8cbb8",
      scrollbarBase: "#b8a994",
    },
  },
];

export const QUIET_LITERARY_DOC_PRESETS: DocThemePreset[] = [
  {
    id: "curated-doc-warm-folio",
    name: "Warm Folio",
    kind: "system",
    baseDocTheme: "soft-neutral",
    colors: {
      pageColor: "#e9e1d5",
      textColor: "#3d362c",
      headingColor: "#2e281f",
    },
  },
];

/**
 * Supplemental quiet-literary candidates added without altering the existing
 * pack entries, so parallel sessions can wire them independently later.
 */
export const QUIET_LITERARY_UI_PRESETS_SUPPLEMENTAL: UiThemePreset[] = [
  {
    id: "curated-ui-quiet-hearth-note",
    name: "Hearth Note",
    kind: "system",
    baseTheme: "taupe",
    colors: {
      baseBg: "#e7ded3",
      surfaceBg: "#f0e8dd",
      textPrimary: "#433a31",
      accent: "#8a735d",
      border: "#d1c4b4",
      paneBorder: "#ddd0c0",
      scrollbarBase: "#b7a794",
    },
  },
  {
    id: "curated-ui-quiet-moss-paper",
    name: "Moss Paper",
    kind: "system",
    baseTheme: "dove",
    colors: {
      baseBg: "#dde0d8",
      surfaceBg: "#e9ece4",
      textPrimary: "#40453e",
      accent: "#66735f",
      border: "#c1c8be",
      paneBorder: "#cdd4c9",
      scrollbarBase: "#9fa89d",
    },
  },
  {
    id: "curated-ui-quiet-rose-clay",
    name: "Rose Clay",
    kind: "system",
    baseTheme: "clay",
    colors: {
      baseBg: "#d8d3ca",
      surfaceBg: "#dad2ce",
      textPrimary: "#141414",
      paneBg: "#c8c4bb",
      accent: "#682c55",
      border: "#9b938c",
      paneBorder: "#d9bfbf",
      scrollbarBase: "#bca4a4",
    },
  },
  {
    id: "curated-ui-quiet-khaki-clay",
    name: "Khaki Clay",
    kind: "system",
    baseTheme: "clay",
    colors: {
      baseBg: "#d7d1c6",
      surfaceBg: "#d5d3cd",
      textPrimary: "#37363a",
      paneBg: "#cec8bb",
      accent: "#6d5f4a",
      border: "#9298a5",
      paneBorder: "#baaf91",
      scrollbarBase: "#b3a99e",
    },
  },
  {
    id: "curated-ui-quiet-heather-ribbon",
    name: "Heather Ribbon",
    kind: "system",
    baseTheme: "taupe",
    colors: {
      baseBg: "#dfd6cf",
      surfaceBg: "#e8dfd8",
      textPrimary: "#3b342f",
      paneBg: "#cfc4bd",
      accent: "#6c4560",
      border: "#b9afa8",
      paneBorder: "#b1aaae",
      scrollbarBase: "#ad9ea1",
    },
  },
  {
    id: "curated-ui-quiet-olive-ribbon",
    name: "Olive Ribbon",
    kind: "system",
    baseTheme: "linen",
    colors: {
      baseBg: "#ddd8cd",
      surfaceBg: "#e7e3d9",
      textPrimary: "#3b3b36",
      paneBg: "#cdc7bc",
      accent: "#68704d",
      border: "#b7b1a7",
      paneBorder: "#b8b08a",
      scrollbarBase: "#a49e94",
    },
  },
];

export const QUIET_LITERARY_DOC_PRESETS_SUPPLEMENTAL: DocThemePreset[] = [
];
