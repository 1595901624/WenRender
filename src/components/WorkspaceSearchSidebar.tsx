import { useMemo, useState } from "react";
import { Blocks, FileText, ListTree, Search, X } from "lucide-react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import type { DirectoryNode, OpenDirectory, OpenDocument } from "../types";

export type WorkspaceSearchTarget = {
  documentId?: string;
  node?: DirectoryNode;
  directoryId?: string;
  position: number;
};

type SearchResult = WorkspaceSearchTarget & {
  key: string;
  name: string;
  line: number;
  preview: string;
};

type Props = {
  documents: OpenDocument[];
  directories: OpenDirectory[];
  onOpenResult: (target: WorkspaceSearchTarget) => void;
  onShowFiles: () => void;
  onShowOutline: () => void;
  onShowBlocks: () => void;
};

export function WorkspaceSearchSidebar({
  documents,
  directories,
  onOpenResult,
  onShowFiles,
  onShowOutline,
  onShowBlocks,
}: Props) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => searchWorkspace(documents, directories, query),
    [directories, documents, query],
  );

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col bg-[#f3f3f1] px-2.5 pb-2.5 pt-2 dark:bg-[#171815]">
      <div className="flex h-10 shrink-0 items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Search size={16} className="text-stone-500 dark:text-stone-400" />
          <h2 className="text-sm font-semibold text-[#20211f] dark:text-stone-100">全文搜索</h2>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" className="icon-button" onClick={onShowBlocks} title="可复用内容块" aria-label="可复用内容块">
            <Blocks size={16} />
          </button>
          <button type="button" className="icon-button" onClick={onShowOutline} title="文章大纲" aria-label="文章大纲">
            <ListTree size={16} />
          </button>
          <button type="button" className="icon-button" onClick={onShowFiles} title="返回文件" aria-label="返回文件">
            <FileText size={16} />
          </button>
        </div>
      </div>

      <div className="relative mx-1 mt-1">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-stone-400" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索已打开的文章和目录"
          className="h-9 w-full rounded-lg border border-stone-200 bg-white pl-8 pr-8 text-xs text-stone-800 outline-none transition focus:border-[#2f8f5b] focus:ring-1 focus:ring-[#2f8f5b] dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-2 rounded p-0.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200" aria-label="清空搜索">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="px-2 pb-2 pt-2 text-[10px] text-stone-400">
        {query.trim() ? `${results.length}${results.length === 200 ? "+" : ""} 个结果` : "输入关键词开始搜索"}
      </div>

      <ScrollArea.Root className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full overflow-x-hidden overscroll-contain px-1 pb-4 [&>div]:!block [&>div]:!min-w-0 [&>div]:!w-full">
          {query.trim() && results.length === 0 && (
            <div className="mx-1 mt-3 rounded-xl border border-dashed border-stone-300 px-3 py-6 text-center text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400">
              没有找到匹配内容
            </div>
          )}
          <div className="space-y-1">
            {results.map((result) => (
              <button
                key={result.key}
                type="button"
                onClick={() => onOpenResult(result)}
                className="w-full rounded-lg px-2.5 py-2 text-left transition hover:bg-[#e7e7e3] dark:hover:bg-[#292a27]"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-700 dark:text-stone-200">{result.name}</span>
                  <span className="shrink-0 text-[9px] tabular-nums text-stone-400">L{result.line}</span>
                </span>
                <span className="mt-1 block truncate font-mono text-[10px] text-stone-500 dark:text-stone-400">{result.preview}</span>
              </button>
            ))}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="absolute bottom-0 right-0 top-0 flex w-2.5 touch-none select-none bg-[#f3f3f1]/90 p-0.5 dark:bg-[#171815]/90">
          <ScrollArea.Thumb className="min-h-8 flex-1 rounded-full bg-stone-300 dark:bg-stone-700" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}

function searchWorkspace(
  documents: OpenDocument[],
  directories: OpenDirectory[],
  rawQuery: string,
): SearchResult[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [];
  const sources = new Map<string, {
    name: string;
    content: string;
    documentId?: string;
    node?: DirectoryNode;
    directoryId?: string;
  }>();

  for (const document of documents) {
    sources.set(document.path ?? `scratch:${document.id}`, {
      name: document.name,
      content: document.content,
      documentId: document.id,
    });
  }
  for (const directory of directories) {
    collectDirectoryDocuments(directory.children, directory.id, sources);
  }

  const results: SearchResult[] = [];
  for (const [sourceKey, source] of sources) {
    let lineStart = 0;
    const lines = source.content.split("\n");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const normalized = line.toLocaleLowerCase();
      let searchFrom = 0;
      while (results.length < 200) {
        const match = normalized.indexOf(query, searchFrom);
        if (match < 0) break;
        results.push({
          key: `${sourceKey}:${lineStart + match}`,
          name: source.name,
          line: lineIndex + 1,
          preview: line.trim() || "（空行）",
          position: lineStart + match,
          documentId: source.documentId,
          node: source.node,
          directoryId: source.directoryId,
        });
        searchFrom = match + Math.max(1, query.length);
      }
      if (results.length >= 200) return results;
      lineStart += line.length + 1;
    }
  }
  return results;
}

function collectDirectoryDocuments(
  nodes: DirectoryNode[],
  directoryId: string,
  sources: Map<string, {
    name: string;
    content: string;
    documentId?: string;
    node?: DirectoryNode;
    directoryId?: string;
  }>,
) {
  for (const node of nodes) {
    if (node.isDirectory) {
      collectDirectoryDocuments(node.children, directoryId, sources);
    } else if (node.isMarkdown && typeof node.content === "string" && !sources.has(node.path)) {
      sources.set(node.path, {
        name: node.name,
        // 文件快照进入编辑器时会统一为 LF；搜索索引也使用相同换行，确保定位偏移一致。
        content: node.content.replace(/\r\n?/g, "\n"),
        node,
        directoryId,
      });
    }
  }
}
