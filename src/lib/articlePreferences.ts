import type { TypographyOverrides } from "./typography";

export type ArticlePreferences = {
  themeId?: string;
  codeThemeId?: string;
  typographyOverrides?: TypographyOverrides;
};

const storageKey = "wenrender-article-preferences-v1";

export function getArticlePreferences(path: string): ArticlePreferences {
  return loadPreferences()[normalizePath(path)] ?? {};
}

export function updateArticlePreferences(
  path: string,
  patch: Partial<ArticlePreferences>,
): boolean {
  const preferences = loadPreferences();
  const key = normalizePath(path);
  const current = preferences[key] ?? {};
  preferences[key] = {
    ...current,
    ...patch,
  };
  return writePreferences(preferences);
}

export function replaceArticleThemePreference(themeId: string, replacementThemeId: string): boolean {
  const preferences = loadPreferences();
  let changed = false;
  for (const [path, preference] of Object.entries(preferences)) {
    if (preference.themeId !== themeId) continue;
    preferences[path] = { ...preference, themeId: replacementThemeId };
    changed = true;
  }
  return !changed || writePreferences(preferences);
}

export function moveArticlePreferences(previousPath: string, nextPath: string): boolean {
  const preferences = loadPreferences();
  const previousKey = normalizePath(previousPath);
  const nextKey = normalizePath(nextPath);
  if (previousKey === nextKey || !preferences[previousKey]) return true;
  preferences[nextKey] = preferences[previousKey];
  delete preferences[previousKey];
  return writePreferences(preferences);
}

function loadPreferences(): Record<string, ArticlePreferences> {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, ArticlePreferences] => (
        typeof entry[0] === "string"
        && Boolean(entry[1])
        && typeof entry[1] === "object"
        && !Array.isArray(entry[1])
      )),
    );
  } catch {
    return {};
  }
}

function writePreferences(preferences: Record<string, ArticlePreferences>): boolean {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized;
}
