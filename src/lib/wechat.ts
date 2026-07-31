export type WechatAccount = {
  id: string;
  name: string;
  appId: string;
  defaultAuthor: string;
};

export type WechatDraftLink = {
  mediaId: string;
  coverMediaId?: string;
  coverHash?: string;
  lastSyncedAt: string;
};

export type WechatArticleSettings = {
  selectedAccountId?: string;
  title?: string;
  digest?: string;
  author?: string;
  sourceUrl?: string;
  coverPath?: string;
  removeFirstHeading?: boolean;
  drafts: Record<string, WechatDraftLink>;
};

const accountsStorageKey = "wenrender-wechat-accounts-v1";
const articleSettingsStorageKey = "wenrender-wechat-article-settings-v1";

export function loadWechatAccounts(): WechatAccount[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(accountsStorageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): WechatAccount[] => {
      if (!item || typeof item !== "object") return [];
      const value = item as Partial<WechatAccount>;
      if (
        typeof value.id !== "string"
        || typeof value.name !== "string"
        || typeof value.appId !== "string"
      ) return [];
      return [{
        id: value.id,
        name: value.name,
        appId: value.appId,
        defaultAuthor: typeof value.defaultAuthor === "string" ? value.defaultAuthor : "",
      }];
    });
  } catch {
    return [];
  }
}

export function saveWechatAccounts(accounts: WechatAccount[]): boolean {
  try {
    window.localStorage.setItem(accountsStorageKey, JSON.stringify(accounts));
    return true;
  } catch {
    return false;
  }
}

export function getWechatArticleSettings(path: string): WechatArticleSettings {
  const value = loadArticleSettings()[normalizePath(path)];
  if (!value || typeof value !== "object") return { drafts: {} };
  return {
    selectedAccountId: stringValue(value.selectedAccountId),
    title: stringValue(value.title),
    digest: stringValue(value.digest),
    author: stringValue(value.author),
    sourceUrl: stringValue(value.sourceUrl),
    coverPath: stringValue(value.coverPath),
    removeFirstHeading: typeof value.removeFirstHeading === "boolean"
      ? value.removeFirstHeading
      : true,
    drafts: parseDraftLinks(value.drafts),
  };
}

export function saveWechatArticleSettings(path: string, settings: WechatArticleSettings): boolean {
  try {
    const values = loadArticleSettings();
    values[normalizePath(path)] = settings;
    window.localStorage.setItem(articleSettingsStorageKey, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}

export function suggestedWechatTitle(markdown: string, fileName: string): string {
  const heading = markdown.match(/^\s*#\s+(.+?)\s*#*\s*$/m)?.[1];
  return cleanMarkdownText(heading ?? fileName.replace(/\.(?:md|markdown|mdown|mkd)$/i, "")).slice(0, 64);
}

export function suggestedWechatDigest(markdown: string): string {
  const lines = markdown.replace(/```[\s\S]*?```/g, "").split(/\r?\n/);
  const paragraph: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|!\[|---+$|___+$|\*\*\*+$)/.test(line)) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(line);
  }
  return cleanMarkdownText(paragraph.join(" ")).slice(0, 120);
}

export function removeFirstMarkdownHeading(markdown: string): string {
  return markdown.replace(/^(\uFEFF?\s*)#\s+.+?(?:\r?\n(?:\s*\r?\n)?)?/m, "$1");
}

export function findFirstLocalMarkdownImage(markdown: string, documentPath: string): string | null {
  const matchAll = markdown.matchAll(/!\[[^\]]*]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g);
  for (const match of matchAll) {
    const source = match[1] ?? match[2] ?? "";
    if (!source || /^(?:https?:|data:|asset:|blob:)/i.test(source)) continue;
    const decoded = safeDecode(source).replace(/\//g, "\\");
    if (/^(?:[A-Za-z]:\\|\\\\)/.test(decoded)) return decoded;
    const directory = documentPath.replace(/[\\/][^\\/]+$/, "");
    const segments: string[] = [];
    for (const segment of `${directory}\\${decoded}`.split("\\")) {
      if (!segment || segment === ".") continue;
      if (segment === "..") segments.pop();
      else segments.push(segment);
    }
    return (/^[A-Za-z]:/.test(segments[0] ?? "") ? "" : "\\") + segments.join("\\");
  }
  return null;
}

function loadArticleSettings(): Record<string, Partial<WechatArticleSettings>> {
  try {
    const value = JSON.parse(window.localStorage.getItem(articleSettingsStorageKey) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function parseDraftLinks(value: unknown): Record<string, WechatDraftLink> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([accountId, entry]) => {
    if (!entry || typeof entry !== "object") return [];
    const link = entry as Partial<WechatDraftLink>;
    if (typeof link.mediaId !== "string" || typeof link.lastSyncedAt !== "string") return [];
    return [[accountId, {
      mediaId: link.mediaId,
      coverMediaId: stringValue(link.coverMediaId),
      coverHash: stringValue(link.coverHash),
      lastSyncedAt: link.lastSyncedAt,
    }]];
  }));
}

function cleanMarkdownText(value: string): string {
  return value
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_~`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized;
}
