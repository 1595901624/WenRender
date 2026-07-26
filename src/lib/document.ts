import type { OpenDocument } from "../types";

/**
 * CodeMirror 内部统一使用 LF，而 Windows 文件通常使用 CRLF。
 * 未保存判断只比较实际文本内容，避免仅换行符格式不同就显示黄点。
 */
export function hasUnsavedChanges(document: Pick<OpenDocument, "content" | "savedContent">): boolean {
  return normalizeLineEndings(document.content) !== normalizeLineEndings(document.savedContent);
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}
