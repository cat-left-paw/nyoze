import type { DocThemePreset, UiThemePreset } from "../types";

/**
 * Curated dark presets for late-night writing: readable text, distinct from
 * standard Dark / Moss / Slate / Merlot / Graphite / Midnight Blue palettes.
 */
export const NOCTURNE_UI_PRESETS: UiThemePreset[] = [
  {
    id: "curated-ui-nocturne-abyss-ink",
    name: "Abyss Ink",
    kind: "system",
    baseTheme: "dark-gpt",
    colors: {
      baseBg: "#171d2a",
      surfaceBg: "#1f2736",
      textPrimary: "#e6eaf2",
      accent: "#5aabbf",
      border: "#3a475c",
      paneBorder: "#323f52",
      scrollbarBase: "#55657a",
    },
  },
  {
    id: "curated-ui-nocturne-sumi-washi",
    name: "Sumi Washi",
    kind: "system",
    baseTheme: "dark",
    colors: {
      baseBg: "#252220",
      surfaceBg: "#2d2a26",
      textPrimary: "#e8e4dc",
      accent: "#b89f7e",
      border: "#45403a",
      paneBorder: "#3c3733",
      scrollbarBase: "#6e675e",
    },
  },
  {
    id: "curated-ui-nocturne-velvet-ember",
    name: "Velvet Ember",
    kind: "system",
    baseTheme: "merlot",
    colors: {
      baseBg: "#23191f",
      surfaceBg: "#2d2229",
      textPrimary: "#f0e8ec",
      accent: "#c77b6a",
      border: "#4d3c44",
      paneBorder: "#42333b",
      scrollbarBase: "#7a5f68",
    },
  },
];

export const NOCTURNE_DOC_PRESETS: DocThemePreset[] = [
  {
    id: "curated-doc-nocturne-deep-proof",
    name: "Deep Proof",
    kind: "system",
    baseDocTheme: "paper-dark",
    colors: {
      pageColor: "#2b2622",
      textColor: "#eee8df",
      headingColor: "#faf6ef",
    },
  },
  {
    id: "curated-doc-nocturne-inkwell",
    name: "Inkwell",
    kind: "system",
    baseDocTheme: "wob",
    colors: {
      pageColor: "#13161c",
      textColor: "#dfe5ee",
      headingColor: "#f2f6fb",
    },
  },
];

/**
 * Supplemental nocturne candidates added without altering the existing pack
 * entries, so parallel sessions can wire them independently later.
 */
export const NOCTURNE_UI_PRESETS_SUPPLEMENTAL: UiThemePreset[] = [
  {
    id: "curated-ui-nocturne-blue-hour",
    name: "Blue Hour",
    kind: "system",
    baseTheme: "slate",
    colors: {
      baseBg: "#1b2330",
      surfaceBg: "#232d3c",
      textPrimary: "#e4ebf4",
      accent: "#6d8fb3",
      border: "#394659",
      paneBorder: "#324052",
      scrollbarBase: "#5a6c82",
    },
  },
  {
    id: "curated-ui-nocturne-carbon-margin",
    name: "Carbon Margin",
    kind: "system",
    baseTheme: "graphite",
    colors: {
      baseBg: "#1c1f22",
      surfaceBg: "#25292d",
      textPrimary: "#ece8e1",
      accent: "#8e8775",
      border: "#3d444a",
      paneBorder: "#353c41",
      scrollbarBase: "#646d74",
    },
  },
  {
    id: "curated-ui-nocturne-greenroom",
    name: "Greenroom",
    kind: "system",
    baseTheme: "moss",
    colors: {
      baseBg: "#1b221d",
      surfaceBg: "#232b26",
      textPrimary: "#e6ece4",
      accent: "#7f9a86",
      border: "#39443d",
      paneBorder: "#323c35",
      scrollbarBase: "#5c6c61",
    },
  },
  {
    id: "curated-ui-nocturne-twilight-washi",
    name: "Twilight Washi",
    kind: "system",
    baseTheme: "dark",
    colors: {
      baseBg: "#212426",
      surfaceBg: "#2d2a26",
      textPrimary: "#fff7e5",
      paneBg: "#333535",
      accent: "#e5c9a4",
      border: "#58524b",
      paneBorder: "#3d3c49",
      scrollbarBase: "#6e675e",
    },
  },
];

export const NOCTURNE_DOC_PRESETS_SUPPLEMENTAL: DocThemePreset[] = [
  {
    id: "curated-doc-nocturne-midnight-manuscript",
    name: "Midnight Manuscript",
    kind: "system",
    baseDocTheme: "paper-dark",
    colors: {
      pageColor: "#232932",
      textColor: "#e8edf4",
      headingColor: "#f8fbff",
    },
  },
];
