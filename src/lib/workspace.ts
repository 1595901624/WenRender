import type { OpenDirectory, OpenDocument } from "../types";

const workspaceStorageKey = "wenrender-workspace-v1";

export type PersistedDocument = {
  path: string | null;
  name: string;
  directoryPath?: string;
  draftContent?: string;
  scratchContent?: string;
  scratchSavedContent?: string;
};

export type WorkspaceSession = {
  version: 1;
  directoryPaths: string[];
  documents: PersistedDocument[];
  activeIndex: number;
};

export function loadWorkspaceSession(): WorkspaceSession | null {
  try {
    const raw = window.localStorage.getItem(workspaceStorageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<WorkspaceSession>;
    if (
      value.version !== 1
      || !Array.isArray(value.directoryPaths)
      || !Array.isArray(value.documents)
    ) {
      return null;
    }
    return {
      version: 1,
      directoryPaths: value.directoryPaths.filter((path): path is string => typeof path === "string"),
      documents: value.documents.filter(isPersistedDocument),
      activeIndex: typeof value.activeIndex === "number" ? value.activeIndex : 0,
    };
  } catch {
    return null;
  }
}

export function saveWorkspaceSession(
  documents: OpenDocument[],
  directories: OpenDirectory[],
  activeId: string,
): void {
  const directoryPathsById = new Map(directories.map((directory) => [directory.id, directory.path]));
  const persistedDocuments: PersistedDocument[] = documents.map((document) => {
    const directoryPath = document.directoryId
      ? directoryPathsById.get(document.directoryId)
      : undefined;

    if (document.path) {
      return {
        path: document.path,
        name: document.name,
        directoryPath,
        draftContent: document.content !== document.savedContent ? document.content : undefined,
      };
    }

    return {
      path: null,
      name: document.name,
      scratchContent: document.content,
      scratchSavedContent: document.savedContent,
    };
  });

  const session: WorkspaceSession = {
    version: 1,
    directoryPaths: directories.map((directory) => directory.path),
    documents: persistedDocuments,
    activeIndex: Math.max(0, documents.findIndex((document) => document.id === activeId)),
  };

  try {
    window.localStorage.setItem(workspaceStorageKey, JSON.stringify(session));
  } catch {
    // 如果草稿过大超过 WebView 存储限制，仍保留文件和目录路径。
    const withoutDrafts = {
      ...session,
      documents: session.documents.map(({ draftContent: _draft, scratchContent: _scratch, ...document }) => document),
    };
    try {
      window.localStorage.setItem(workspaceStorageKey, JSON.stringify(withoutDrafts));
    } catch {
      // 存储不可用时不影响编辑器的当前会话。
    }
  }
}

function isPersistedDocument(value: unknown): value is PersistedDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<PersistedDocument>;
  return (document.path === null || typeof document.path === "string") && typeof document.name === "string";
}
