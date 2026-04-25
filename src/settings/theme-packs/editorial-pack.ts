import type { DocThemePreset, UiThemePreset } from "../types";

/**
 * Curated presets: clean editorial UI, high readability for prose & tech docs.
 * Distinct from standard Light / Harbor / Sage / Paper Light via ink + accent choices.
 */
export const EDITORIAL_UI_PRESETS: UiThemePreset[] = [
  {
    id: "curated-ui-editorial-clear-canvas",
    name: "Clear Canvas",
    kind: "system",
    baseTheme: "light",
    colors: {
      baseBg: "#f3f4f6",
      surfaceBg: "#fbfcfd",
      textPrimary: "#2a3038",
      accent: "#3d6d7e",
      border: "#d5dae1",
      paneBorder: "#e1e5eb",
      scrollbarBase: "#9ca6b2",
    },
  },
  {
    id: "curated-ui-editorial-focus-slate",
    name: "Focus Slate",
    kind: "system",
    baseTheme: "harbor",
    colors: {
      baseBg: "#e1e9ee",
      surfaceBg: "#eef4f7",
      textPrimary: "#2a3a44",
      accent: "#356f88",
      border: "#b4c6d0",
      paneBorder: "#c5d5dc",
      scrollbarBase: "#8ba3b0",
    },
  },
  {
    id: "curated-ui-editorial-modern-folio",
    name: "Modern Folio",
    kind: "system",
    baseTheme: "linen",
    colors: {
      baseBg: "#f1f0ea",
      surfaceBg: "#f9f9f5",
      textPrimary: "#2e322e",
      accent: "#4d6a5c",
      border: "#d6d5cd",
      paneBorder: "#e3e2da",
      scrollbarBase: "#b0afa4",
    },
  },
];

export const EDITORIAL_DOC_PRESETS: DocThemePreset[] = [
  {
    id: "curated-doc-editorial-proof",
    name: "Editorial Proof",
    kind: "system",
    baseDocTheme: "paper-light",
    colors: {
      pageColor: "#f6f7f4",
      textColor: "#1e252d",
      headingColor: "#121820",
    },
  },
];

/**
 * Supplemental editorial candidates added without touching the existing pack
 * entries, so parallel sessions can choose whether to wire them later.
 */
export const EDITORIAL_UI_PRESETS_SUPPLEMENTAL: UiThemePreset[] = [
  {
    id: "curated-ui-editorial-news-desk",
    name: "News Desk",
    kind: "system",
    baseTheme: "light",
    colors: {
      baseBg: "#e8ecef",
      surfaceBg: "#f6f8f9",
      textPrimary: "#23313c",
      accent: "#4b6f83",
      border: "#cad3da",
      paneBorder: "#d8e0e6",
      scrollbarBase: "#92a2ad",
    },
  },
  {
    id: "curated-ui-editorial-studio-ledger",
    name: "Studio Ledger",
    kind: "system",
    baseTheme: "sage",
    colors: {
      baseBg: "#e4e8e0",
      surfaceBg: "#f1f4ee",
      textPrimary: "#28312d",
      accent: "#58716a",
      border: "#cad1c8",
      paneBorder: "#d8ddd6",
      scrollbarBase: "#97a69f",
    },
  },
  {
    id: "curated-ui-editorial-monograph",
    name: "Monograph",
    kind: "system",
    baseTheme: "linen",
    colors: {
      baseBg: "#ebe7df",
      surfaceBg: "#f6f3ed",
      textPrimary: "#2e342f",
      accent: "#6a746b",
      border: "#d3cec4",
      paneBorder: "#e1dbd2",
      scrollbarBase: "#ada599",
    },
  },
  {
    id: "curated-ui-editorial-blue-linen",
    name: "Blue Linen",
    kind: "system",
    baseTheme: "linen",
    colors: {
      baseBg: "#a1a19b",
      surfaceBg: "#c3c5bf",
      textPrimary: "#000000",
      paneBg: "#ababab",
      accent: "#1c4554",
      border: "#727983",
      paneBorder: "#839191",
      scrollbarBase: "#757575",
    },
  },
  {
    id: "curated-ui-editorial-harbor-stripe",
    name: "Harbor Stripe",
    kind: "system",
    baseTheme: "light",
    colors: {
      baseBg: "#e4e5e0",
      surfaceBg: "#f1f1ec",
      textPrimary: "#2b3032",
      paneBg: "#d6d8d4",
      accent: "#466979",
      border: "#bcc2c6",
      paneBorder: "#a8bcc5",
      scrollbarBase: "#9aa2a5",
    },
  },
  {
    id: "curated-ui-editorial-brass-header",
    name: "Brass Header",
    kind: "system",
    baseTheme: "linen",
    colors: {
      baseBg: "#e3dfd4",
      surfaceBg: "#ece8de",
      textPrimary: "#36342f",
      paneBg: "#d4d0c4",
      accent: "#796749",
      border: "#bcb5a9",
      paneBorder: "#bca87b",
      scrollbarBase: "#9f998e",
    },
  },
];

export const EDITORIAL_DOC_PRESETS_SUPPLEMENTAL: DocThemePreset[] = [
  {
    id: "curated-doc-editorial-reference-sheet",
    name: "Reference Sheet",
    kind: "system",
    baseDocTheme: "paper-light",
    colors: {
      pageColor: "#f7f6f2",
      textColor: "#1f2a34",
      headingColor: "#0f1720",
    },
  },
  {
    id: "curated-doc-editorial-longform-cream",
    name: "Longform Cream",
    kind: "system",
    baseDocTheme: "soft-neutral",
    colors: {
      pageColor: "#f4efe6",
      textColor: "#2c312f",
      headingColor: "#171b19",
    },
  },
];
