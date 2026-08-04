/**
 * Editor (Monaco) theme library — VS Code / IntelliJ style themes, plus
 * editor/console background overrides. Theme + background choices persist
 * with the rest of the user's UI preferences.
 */

export interface EditorThemeDef {
  id: string;
  label: string;
  /** Monaco base theme to inherit from */
  base: 'vs' | 'vs-dark';
  bg: string;
  fg: string;
  lineHighlight: string;
  comment: string;
  keyword: string;
  string: string;
  number: string;
  type: string;
  func: string;
}

/** Custom-defined themes (well-known palettes). 'auto', 'vs' and 'vs-dark'
    are handled separately (Monaco built-ins). */
export const CUSTOM_EDITOR_THEMES: EditorThemeDef[] = [
  { id: 'monokai', label: 'Monokai', base: 'vs-dark', bg: '#272822', fg: '#f8f8f2', lineHighlight: '#31322a', comment: '#75715e', keyword: '#f92672', string: '#e6db74', number: '#ae81ff', type: '#66d9ef', func: '#a6e22e' },
  { id: 'dracula', label: 'Dracula', base: 'vs-dark', bg: '#282a36', fg: '#f8f8f2', lineHighlight: '#313342', comment: '#6272a4', keyword: '#ff79c6', string: '#f1fa8c', number: '#bd93f9', type: '#8be9fd', func: '#50fa7b' },
  { id: 'one-dark', label: 'One Dark Pro', base: 'vs-dark', bg: '#282c34', fg: '#abb2bf', lineHighlight: '#2f343e', comment: '#5c6370', keyword: '#c678dd', string: '#98c379', number: '#d19a66', type: '#e5c07b', func: '#61afef' },
  { id: 'github-dark', label: 'GitHub Dark', base: 'vs-dark', bg: '#0d1117', fg: '#c9d1d9', lineHighlight: '#161b22', comment: '#8b949e', keyword: '#ff7b72', string: '#a5d6ff', number: '#79c0ff', type: '#ffa657', func: '#d2a8ff' },
  { id: 'github-light', label: 'GitHub Light', base: 'vs', bg: '#ffffff', fg: '#24292f', lineHighlight: '#f6f8fa', comment: '#6e7781', keyword: '#cf222e', string: '#0a3069', number: '#0550ae', type: '#953800', func: '#8250df' },
  { id: 'solarized-dark', label: 'Solarized Dark', base: 'vs-dark', bg: '#002b36', fg: '#839496', lineHighlight: '#073642', comment: '#586e75', keyword: '#859900', string: '#2aa198', number: '#d33682', type: '#b58900', func: '#268bd2' },
  { id: 'solarized-light', label: 'Solarized Light', base: 'vs', bg: '#fdf6e3', fg: '#657b83', lineHighlight: '#eee8d5', comment: '#93a1a1', keyword: '#859900', string: '#2aa198', number: '#d33682', type: '#b58900', func: '#268bd2' },
  { id: 'nord', label: 'Nord', base: 'vs-dark', bg: '#2e3440', fg: '#d8dee9', lineHighlight: '#353c4a', comment: '#616e88', keyword: '#81a1c1', string: '#a3be8c', number: '#b48ead', type: '#8fbcbb', func: '#88c0d0' },
  { id: 'darcula', label: 'Darcula (IntelliJ)', base: 'vs-dark', bg: '#2b2b2b', fg: '#a9b7c6', lineHighlight: '#323232', comment: '#808080', keyword: '#cc7832', string: '#6a8759', number: '#6897bb', type: '#ffc66d', func: '#ffc66d' },
  { id: 'intellij-light', label: 'IntelliJ Light', base: 'vs', bg: '#ffffff', fg: '#000000', lineHighlight: '#fcfaed', comment: '#8c8c8c', keyword: '#0033b3', string: '#067d17', number: '#1750eb', type: '#000000', func: '#00627a' },
];

export interface ThemeSwatch {
  bg: string;
  accents: [string, string, string];
}

/**
 * Theme FAMILIES — one picker option each. Families with a light and a dark
 * variant follow the app's global light/dark mode (label shows both, divided
 * by "/"); single-variant themes render the same in either mode.
 */
export interface ThemeFamily {
  id: string;
  label: string;
  /** Variant theme ids used when the app is in light / dark mode */
  light: string;
  dark: string;
  paired: boolean;
  swatchLight: ThemeSwatch;
  swatchDark: ThemeSwatch;
}

const VS_LIGHT_SWATCH: ThemeSwatch = { bg: '#ffffff', accents: ['#0000ff', '#a31515', '#795e26'] };
const VS_DARK_SWATCH: ThemeSwatch = { bg: '#1e1e1e', accents: ['#569cd6', '#ce9178', '#dcdcaa'] };

function swatchOf(id: string): ThemeSwatch {
  const t = CUSTOM_EDITOR_THEMES.find((d) => d.id === id);
  return t ? { bg: t.bg, accents: [t.keyword, t.string, t.func] } : VS_DARK_SWATCH;
}

export const THEME_FAMILIES: ThemeFamily[] = [
  { id: 'vscode', label: 'VS Code Light / Dark', light: 'vs', dark: 'vs-dark', paired: true, swatchLight: VS_LIGHT_SWATCH, swatchDark: VS_DARK_SWATCH },
  { id: 'github', label: 'GitHub Light / Dark', light: 'github-light', dark: 'github-dark', paired: true, swatchLight: swatchOf('github-light'), swatchDark: swatchOf('github-dark') },
  { id: 'solarized', label: 'Solarized Light / Dark', light: 'solarized-light', dark: 'solarized-dark', paired: true, swatchLight: swatchOf('solarized-light'), swatchDark: swatchOf('solarized-dark') },
  { id: 'intellij', label: 'IntelliJ Light / Darcula', light: 'intellij-light', dark: 'darcula', paired: true, swatchLight: swatchOf('intellij-light'), swatchDark: swatchOf('darcula') },
  { id: 'monokai', label: 'Monokai', light: 'monokai', dark: 'monokai', paired: false, swatchLight: swatchOf('monokai'), swatchDark: swatchOf('monokai') },
  { id: 'dracula', label: 'Dracula', light: 'dracula', dark: 'dracula', paired: false, swatchLight: swatchOf('dracula'), swatchDark: swatchOf('dracula') },
  { id: 'one-dark', label: 'One Dark Pro', light: 'one-dark', dark: 'one-dark', paired: false, swatchLight: swatchOf('one-dark'), swatchDark: swatchOf('one-dark') },
  { id: 'nord', label: 'Nord', light: 'nord', dark: 'nord', paired: false, swatchLight: swatchOf('nord'), swatchDark: swatchOf('nord') },
];

/** Editor background overrides ('theme' = use the theme's own background) */
export const EDITOR_BGS: { id: string; label: string; color: string | null }[] = [
  { id: 'theme', label: 'Theme default', color: null },
  { id: 'black', label: 'Pure black', color: '#000000' },
  { id: 'slate', label: 'Slate', color: '#101418' },
  { id: 'navy', label: 'Navy', color: '#0d1b2a' },
  { id: 'espresso', label: 'Espresso', color: '#1f1712' },
  { id: 'sepia', label: 'Sepia', color: '#f8f2e3' },
  { id: 'white', label: 'White', color: '#ffffff' },
];

/** Output console background overrides ('default' = follow the color theme) */
export const CONSOLE_BGS: { id: string; label: string; color: string | null }[] = [
  { id: 'default', label: 'Theme default', color: null },
  { id: 'black', label: 'Pure black', color: '#000000' },
  { id: 'charcoal', label: 'Charcoal', color: '#1e1e1e' },
  { id: 'navy', label: 'Navy', color: '#0b1826' },
  { id: 'espresso', label: 'Espresso', color: '#221712' },
  { id: 'forest', label: 'Forest', color: '#0c1510' },
];

export const isEditorTheme = (v: unknown): boolean => THEME_FAMILIES.some((t) => t.id === v);
export const isEditorBg = (v: unknown): boolean => EDITOR_BGS.some((b) => b.id === v);
export const isConsoleBg = (v: unknown): boolean => CONSOLE_BGS.some((b) => b.id === v);

// ---------------------------------------------------------------------------
// Monaco wiring: themes are defined lazily against the loaded monaco instance.

let monacoRef: any = null;
const definedThemes = new Set<string>();

function toRules(def: EditorThemeDef) {
  const strip = (c: string) => c.replace('#', '');
  return [
    { token: 'comment', foreground: strip(def.comment), fontStyle: 'italic' },
    { token: 'keyword', foreground: strip(def.keyword) },
    { token: 'string', foreground: strip(def.string) },
    { token: 'number', foreground: strip(def.number) },
    { token: 'type', foreground: strip(def.type) },
    { token: 'class', foreground: strip(def.type) },
    { token: 'function', foreground: strip(def.func) },
    { token: 'identifier.function', foreground: strip(def.func) },
    { token: 'tag', foreground: strip(def.keyword) },
    { token: 'attribute.name', foreground: strip(def.type) },
  ];
}

function defineTheme(name: string, def: EditorThemeDef, bgOverride: string | null) {
  if (!monacoRef || definedThemes.has(name)) return;
  const bg = bgOverride ?? def.bg;
  monacoRef.editor.defineTheme(name, {
    base: def.base,
    inherit: true,
    rules: toRules(def),
    colors: {
      'editor.background': bg,
      'editor.foreground': def.fg,
      'editor.lineHighlightBackground': bgOverride ? bg : def.lineHighlight,
      'editorLineNumber.foreground': def.comment,
      'editorCursor.foreground': def.fg,
    },
  });
  definedThemes.add(name);
}

/** Built-in bases used when only the background is overridden. */
const BUILTIN_DEFS: Record<'vs' | 'vs-dark', EditorThemeDef> = {
  vs: { id: 'vs', label: 'VS Code Light', base: 'vs', bg: '#ffffff', fg: '#000000', lineHighlight: '#f5f5f5', comment: '#008000', keyword: '#0000ff', string: '#a31515', number: '#098658', type: '#267f99', func: '#795e26' },
  'vs-dark': { id: 'vs-dark', label: 'VS Code Dark', base: 'vs-dark', bg: '#1e1e1e', fg: '#d4d4d4', lineHighlight: '#282828', comment: '#6a9955', keyword: '#569cd6', string: '#ce9178', number: '#b5cea8', type: '#4ec9b0', func: '#dcdcaa' },
};

/** Called from the editor's beforeMount. */
export function registerMonaco(monaco: any) {
  monacoRef = monaco;
}

/**
 * Resolve the user's theme family + background choice to a Monaco theme name
 * for the current light/dark mode, defining it against the loaded monaco
 * instance when needed. Safe to call before monaco loads (the name resolves;
 * definition happens again from the editor's beforeMount).
 */
export function ensureMonacoTheme(
  familyId: string,
  bgId: string,
  resolvedMode: 'light' | 'dark'
): string {
  const family = THEME_FAMILIES.find((f) => f.id === familyId) ?? THEME_FAMILIES[0];
  const effective = resolvedMode === 'dark' ? family.dark : family.light;
  const bg = EDITOR_BGS.find((b) => b.id === bgId)?.color ?? null;

  // Built-in theme, no bg override: use Monaco's own name ('vs' renders as 'light')
  if ((effective === 'vs' || effective === 'vs-dark') && !bg) {
    return effective === 'vs' ? 'light' : 'vs-dark';
  }

  const def =
    effective === 'vs' || effective === 'vs-dark'
      ? BUILTIN_DEFS[effective]
      : CUSTOM_EDITOR_THEMES.find((t) => t.id === effective);

  if (!def) return resolvedMode === 'dark' ? 'vs-dark' : 'light';

  const name = bg ? `${def.id}--bg-${bgId}` : def.id;
  defineTheme(name, def, bg);
  return name;
}
