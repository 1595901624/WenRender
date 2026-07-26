import type { OpenDocument } from "../types";

/**
 * CodeMirror 内部统一使用 LF，而 Windows 文件通常使用 CRLF。
 * 未保存判断只比较实际文本内容，避免仅换行符格式不同就显示黄点。
 */
export function hasUnsavedChanges(document: Pick<OpenDocument, "content" | "savedContent">): boolean {
  return normalizeLineEndings(document.content) !== normalizeLineEndings(document.savedContent);
}

/** 外部删除后的内存副本也必须进入草稿与关闭确认，避免最后一份内容丢失。 */
export function needsSaveAttention(
  document: Pick<OpenDocument, "content" | "savedContent" | "externalState">,
): boolean {
  return hasUnsavedChanges(document) || document.externalState === "deleted";
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}
