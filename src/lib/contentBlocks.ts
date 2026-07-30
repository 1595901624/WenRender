export type ContentBlock = {
  id: string;
  title: string;
  command: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

const contentBlocksStorageKey = "wenrender-content-blocks-v1";

export function loadContentBlocks(): ContentBlock[] {
  try {
    const raw = window.localStorage.getItem(contentBlocksStorageKey);
    if (!raw) return [];
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(isStoredContentBlock)
      .map((block) => ({
        ...block,
        // 兼容命令字段加入之前保存的内容块。
        command: normalizeContentBlockCommand(block.command ?? block.title),
      }))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

export function saveContentBlocks(blocks: ContentBlock[]): boolean {
  try {
    window.localStorage.setItem(contentBlocksStorageKey, JSON.stringify(blocks));
    return true;
  } catch {
    return false;
  }
}

export function createContentBlock(title: string, command: string, content: string): ContentBlock {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    command: normalizeContentBlockCommand(command || title),
    content,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeContentBlockCommand(value: string): string {
  return value.trim().replace(/^\/+/, "").replace(/\//g, "");
}

type StoredContentBlock = Omit<ContentBlock, "command"> & { command?: string };

function isStoredContentBlock(value: unknown): value is StoredContentBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as Partial<StoredContentBlock>;
  return (
    typeof block.id === "string"
    && typeof block.title === "string"
    && (block.command === undefined || typeof block.command === "string")
    && typeof block.content === "string"
    && typeof block.createdAt === "number"
    && typeof block.updatedAt === "number"
  );
}
