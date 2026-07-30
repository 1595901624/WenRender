import { invoke } from "@tauri-apps/api/core";
import { createId, fileName } from "../../lib/path";
import { hasUnsavedChanges } from "../../lib/document";
import type { FileSnapshot, OpenDirectory, OpenDocument } from "../../types";
import type { WorkspaceSession } from "../../lib/workspace";

/**
 * 将持久化的工作区描述还原为运行时数据。
 *
 * 目录树和文件恢复分开处理：前者可并行扫描，后者需要保留用户上次的打开顺序。
 */
export async function restoreWorkspaceSession(session: WorkspaceSession): Promise<{
  directories: OpenDirectory[];
  documents: OpenDocument[];
  activeId: string;
}> {
  const restoredDirectories = (
    await Promise.all(session.directoryPaths.map(async (path) => {
      try {
        const tree = await invoke<Omit<OpenDirectory, "id">>("scan_directory", { directoryPath: path });
        return { ...tree, id: createId() };
      } catch {
        // 目录被移动或暂时不可访问时跳过，不阻塞其他工作区的恢复。
        return null;
      }
    }))
  ).filter((directory): directory is OpenDirectory => directory !== null);

  const directoriesByPath = new Map(restoredDirectories.map((directory) => [directory.path, directory]));
  const restoredDocuments: OpenDocument[] = [];
  let restoredActiveId: string | null = null;

  for (const [index, persisted] of session.documents.entries()) {
    if (!persisted.path) {
      const id = createId();
      const content = persisted.scratchContent ?? "";
      const savedContent = persisted.scratchSavedContent ?? "";
      restoredDocuments.push({
        id, path: null, name: persisted.name, content, savedContent,
        lineEnding: "lf", hasBom: false, readOnly: false, externalState: "normal",
        recoveredDraft: hasUnsavedChanges({ content, savedContent }),
        cursorPosition: persisted.cursorPosition,
      });
      if (index === session.activeIndex) restoredActiveId = id;
      continue;
    }

    const id = createId();
    const directory = persisted.directoryPath ? directoriesByPath.get(persisted.directoryPath) : undefined;
    try {
      const snapshot = await invoke<FileSnapshot>("read_file_snapshot", { filePath: persisted.path });
      const document = createDocumentFromSnapshot(id, persisted.path, fileName(persisted.path), snapshot);
      const restoredDraft = persisted.draftContent;
      const diskChangedWhileClosed = Boolean(restoredDraft && persisted.baseHash && persisted.baseHash !== snapshot.fingerprint.hash);
      restoredDocuments.push({
        ...document,
        content: restoredDraft ?? snapshot.content,
        // 草稿基于旧磁盘版本时，保留旧哈希，让下一次保存进入冲突处理。
        diskFingerprint: diskChangedWhileClosed ? { ...snapshot.fingerprint, hash: persisted.baseHash! } : snapshot.fingerprint,
        externalState: diskChangedWhileClosed ? "modified" : "normal",
        recoveredDraft: restoredDraft !== undefined,
        cursorPosition: persisted.cursorPosition,
        directoryId: directory?.id,
      });
    } catch {
      // 文件关闭期间被删除时，只要有草稿就仍恢复它，避免用户内容丢失。
      if (persisted.draftContent === undefined) continue;
      restoredDocuments.push({
        id, path: persisted.path, name: fileName(persisted.path), content: persisted.draftContent,
        savedContent: "", diskFingerprint: persisted.baseHash ? { size: 0, modifiedMs: 0, hash: persisted.baseHash } : undefined,
        lineEnding: "lf", hasBom: false, readOnly: false, externalState: "deleted", recoveredDraft: true,
        cursorPosition: persisted.cursorPosition,
        directoryId: directory?.id,
      });
    }
    if (index === session.activeIndex) restoredActiveId = id;
  }

  return { directories: restoredDirectories, documents: restoredDocuments, activeId: restoredActiveId ?? restoredDocuments[0]?.id ?? "" };
}

/** 根据 Rust 层读取的快照建立编辑器文档。 */
export function createDocumentFromSnapshot(id: string, path: string, name: string, snapshot: FileSnapshot): OpenDocument {
  return {
    id, path, name, content: snapshot.content, savedContent: snapshot.content,
    diskFingerprint: snapshot.fingerprint, lineEnding: snapshot.lineEnding, hasBom: snapshot.hasBom,
    readOnly: snapshot.readOnly, externalState: "normal",
  };
}

/** 用磁盘快照刷新一个没有本地修改的文档。 */
export function applySnapshot(document: OpenDocument, snapshot: FileSnapshot): OpenDocument {
  return { ...document, content: snapshot.content, savedContent: snapshot.content, diskFingerprint: snapshot.fingerprint, lineEnding: snapshot.lineEnding, hasBom: snapshot.hasBom, readOnly: snapshot.readOnly, externalState: "normal" };
}
