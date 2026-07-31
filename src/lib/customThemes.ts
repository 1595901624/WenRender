import type { ArticleTheme } from "./themes";

const customThemesStorageKey = "wenrender-custom-themes-v1";

export type ThemeFile = {
  format: "wenrender-theme";
  version: 1;
  theme: ArticleTheme;
};

export function loadCustomThemes(): ArticleTheme[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(customThemesStorageKey) ?? "[]");
    return Array.isArray(value)
      ? value.filter(isArticleTheme).map((theme) => ({ ...theme, custom: true }))
      : [];
  } catch {
    return [];
  }
}

export function saveCustomThemes(themes: ArticleTheme[]): boolean {
  try {
    window.localStorage.setItem(customThemesStorageKey, JSON.stringify(themes));
    return true;
  } catch {
    return false;
  }
}

export function duplicateTheme(theme: ArticleTheme): ArticleTheme {
  return {
    ...structuredClone(theme),
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${theme.name} 副本`,
    description: "自定义主题",
    custom: true,
  };
}

export function serializeTheme(theme: ArticleTheme): string {
  const file: ThemeFile = {
    format: "wenrender-theme",
    version: 1,
    theme: { ...theme, custom: true },
  };
  return JSON.stringify(file, null, 2);
}

export function parseThemeFile(raw: string): ArticleTheme {
  const value = JSON.parse(raw) as Partial<ThemeFile>;
  if (value.format !== "wenrender-theme" || value.version !== 1 || !isArticleTheme(value.theme)) {
    throw new Error("不是有效的文染主题文件");
  }
  return {
    ...value.theme,
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: value.theme.name.trim() || "导入主题",
    custom: true,
  };
}

function isArticleTheme(value: unknown): value is ArticleTheme {
  if (!value || typeof value !== "object") return false;
  const theme = value as Partial<ArticleTheme>;
  const colors = theme.colors as unknown as Record<string, unknown> | undefined;
  const typography = theme.typography as unknown as Record<string, unknown> | undefined;
  const appearance = theme.appearance as unknown as Record<string, unknown> | undefined;
  const requiredColors = [
    "accent", "accentSoft", "heading", "text", "muted", "link", "border",
    "inlineCodeBackground", "codeBackground", "codeText", "articleBackground",
  ];
  const requiredTypography = [
    "fontFamily", "bodySize", "bodyLineHeight", "paragraphSpacing", "codeSize",
    "codeLineHeight", "h1Size", "h2Size",
  ];
  return (
    typeof theme.id === "string"
    && typeof theme.name === "string"
    && typeof theme.description === "string"
    && (!("customCss" in theme) || theme.customCss === undefined || typeof theme.customCss === "string")
    && Array.isArray(theme.swatches)
    && theme.swatches.length === 3
    && theme.swatches.every((color) => typeof color === "string")
    && Boolean(colors && requiredColors.every((key) => typeof colors[key] === "string"))
    && Boolean(typography && requiredTypography.every((key) => (
      key === "fontFamily" ? typeof typography[key] === "string" : typeof typography[key] === "number"
    )))
    && Boolean(
      appearance
      && typeof appearance.headingStyle === "string"
      && (appearance.h1Align === "left" || appearance.h1Align === "center")
      && typeof appearance.blockquoteStyle === "string"
      && typeof appearance.codeRadius === "number"
      && typeof appearance.imageRadius === "number",
    )
  );
}
