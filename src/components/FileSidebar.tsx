import { useEffect, useState } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  File,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  PanelTopOpen,
  Plus,
  X,
} from "lucide-react";
import clsx from "clsx";
import { hasUnsavedChanges } from "../lib/document";
import type { DirectoryNode, OpenDirectory, OpenDocument } from "../types";

type Props = {
  documents: OpenDocument[];
  directories: OpenDirectory[];
  activeId: string;
  activePath: string | null;
  onSelect: (id: string) => void;
  onSelectTreeFile: (node: DirectoryNode, directoryId: string) => void;
  onClose: (id: string) => void;
  onCloseDirectory: (id: string) => void;
  onNew: () => void;
  onOpenFiles: () => void;
  onOpenFolder: () => void;
};

export function FileSidebar({
  documents,
  directories,
  activeId,
  activePath,
  onSelect,
  onSelectTreeFile,
  onClose,
  onCloseDirectory,
  onNew,
  onOpenFiles,
  onOpenFolder,
}: Props) {
  const [showAllFiles, setShowAllFiles] = useState(() => window.localStorage.getItem("wenrender-show-all-files") === "true");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const paths = JSON.parse(window.localStorage.getItem("wenrender-expanded-directories") ?? "[]");
      return new Set(Array.isArray(paths) ? paths.filter((path): path is string => typeof path === "string") : []);
    } catch {
      return new Set();
    }
  });
  const standaloneDocuments = documents.filter((document) => !document.directoryId);

  useEffect(() => {
    // 新打开的项目默认展开根目录，同时保留用户之前操作过的子目录状态。
    setExpanded((current) => {
      const next = new Set(current);
      directories.forEach((directory) => next.add(directory.path));
      return next;
    });
  }, [directories]);

  useEffect(() => {
    window.localStorage.setItem("wenrender-show-all-files", String(showAllFiles));
  }, [showAllFiles]);

  useEffect(() => {
    window.localStorage.setItem("wenrender-expanded-directories", JSON.stringify([...expanded]));
  }, [expanded]);

  const toggleExpanded = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col bg-[#f3f3f1] px-2.5 pb-2.5 pt-3 dark:bg-[#171815]">
      <div className="flex h-11 items-center justify-between px-2">
        <div className="flex items-center gap-2.5">
          <img
            src="/app_logo_radius.png"
            alt="文染标志"
            className="h-8 w-8 rounded-lg object-cover shadow-sm ring-1 ring-black/5 dark:ring-white/10"
          />
          <div>
            <div className="text-sm font-semibold leading-none text-[#20211f] dark:text-stone-100">文染</div>
            <div className="mt-1 text-[9px] uppercase tracking-[0.17em] text-stone-400">WenRender</div>
          </div>
        </div>
        <button className="icon-button" onClick={onNew} title="新建文章"><Plus size={17} /></button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 px-1">
        <button className="sidebar-action" onClick={onOpenFiles}><PanelTopOpen size={15} />打开文件</button>
        <button className="sidebar-action" onClick={onOpenFolder}><FolderOpen size={15} />打开目录</button>
      </div>

      <div className="mb-2 mt-5 flex items-center justify-between px-2">
        <span className="text-[11px] font-medium text-stone-500">文件</span>
        <span className="text-[10px] text-stone-400">{standaloneDocuments.length}</span>
      </div>

      <ScrollArea.Root className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Radix 默认的 table 包装层会被长文件名撑宽，这里强制为固定宽度块级元素。 */}
        <ScrollArea.Viewport className="h-full w-full overflow-x-hidden overscroll-contain px-1 pb-4 [&>div]:!block [&>div]:!min-w-0 [&>div]:!w-full">
          <div className="min-w-0 space-y-0.5">
            {standaloneDocuments.map((document) => {
              const dirty = hasUnsavedChanges(document);
              return (
                <button
                  key={document.id}
                  title={document.path ?? document.name}
                  onClick={() => onSelect(document.id)}
                  className={clsx(
                    "group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                    document.id === activeId
                      ? "bg-[#e3e3e0] text-[#20211f] dark:bg-[#30312e] dark:text-stone-100"
                      : "text-stone-600 hover:bg-[#eaeae7] dark:text-stone-400 dark:hover:bg-[#272825]",
                  )}
                >
                  <FileText size={15} className={clsx("shrink-0", document.id === activeId ? "text-stone-800 dark:text-stone-100" : "text-stone-400")} />
                  <span className="min-w-0 flex-1 truncate">{document.name}</span>
                  {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                  {document.externalState !== "normal" && (
                    <span
                      className={clsx("h-1.5 w-1.5 rounded-full", document.externalState === "deleted" ? "bg-red-500" : "bg-orange-500")}
                      title={document.externalState === "deleted" ? "磁盘文件已删除" : "磁盘文件已被外部修改"}
                    />
                  )}
                  {standaloneDocuments.length > 1 && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="rounded p-0.5 opacity-0 hover:bg-stone-200 group-hover:opacity-100 dark:hover:bg-stone-700"
                      onClick={(event) => { event.stopPropagation(); onClose(document.id); }}
                    >
                      <X size={13} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {directories.length > 0 && (
            <div className="mb-1 mt-5 flex items-center justify-between px-2">
              <span className="text-[11px] font-medium text-stone-500">目录</span>
              <button
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-stone-500 hover:bg-stone-200 dark:text-stone-400 dark:hover:bg-stone-800"
                onClick={() => setShowAllFiles((value) => !value)}
                title={showAllFiles ? "仅显示 Markdown" : "显示全部文件"}
              >
                {showAllFiles ? <EyeOff size={12} /> : <Eye size={12} />}
                {showAllFiles ? "仅 MD" : "全部"}
              </button>
            </div>
          )}

          <div className="min-w-0 space-y-1">
            {directories.map((directory) => {
              const isExpanded = expanded.has(directory.path);
              return (
                <div key={directory.id}>
                  <div className="group flex min-w-0 items-center overflow-hidden rounded-lg hover:bg-[#eaeae7] dark:hover:bg-[#272825]">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-sm font-medium text-stone-700 dark:text-stone-300"
                      onClick={() => toggleExpanded(directory.path)}
                      title={directory.path}
                    >
                      {isExpanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                      {isExpanded ? <FolderOpen size={15} className="shrink-0" /> : <Folder size={15} className="shrink-0" />}
                      <span className="min-w-0 flex-1 truncate">{directory.name}</span>
                    </button>
                    <button
                      className="mr-1 rounded p-1 text-stone-400 opacity-0 hover:bg-stone-200 hover:text-stone-700 group-hover:opacity-100 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                      onClick={() => onCloseDirectory(directory.id)}
                      title="关闭目录"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {isExpanded && (
                    <DirectoryNodes
                      nodes={directory.children}
                      directoryId={directory.id}
                      depth={1}
                      expanded={expanded}
                      showAllFiles={showAllFiles}
                      activePath={activePath}
                      documents={documents}
                      onToggle={toggleExpanded}
                      onSelect={onSelectTreeFile}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="absolute bottom-0 right-0 top-0 flex w-2.5 touch-none select-none bg-[#f3f3f1]/90 p-0.5 dark:bg-[#171815]/90">
          <ScrollArea.Thumb className="min-h-8 flex-1 rounded-full bg-stone-300 hover:bg-stone-400 dark:bg-stone-700 dark:hover:bg-stone-600" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}

function DirectoryNodes({
  nodes,
  directoryId,
  depth,
  expanded,
  showAllFiles,
  activePath,
  documents,
  onToggle,
  onSelect,
}: {
  nodes: DirectoryNode[];
  directoryId: string;
  depth: number;
  expanded: Set<string>;
  showAllFiles: boolean;
  activePath: string | null;
  documents: OpenDocument[];
  onToggle: (path: string) => void;
  onSelect: (node: DirectoryNode, directoryId: string) => void;
}) {
  // “仅 MD”模式仍保留包含 Markdown 的祖先目录，否则用户无法展开到目标文件。
  const visibleNodes = nodes.filter((node) => showAllFiles || node.isMarkdown || (node.isDirectory && hasMarkdown(node)));

  return (
    <div className="min-w-0 overflow-hidden">
      {visibleNodes.map((node) => {
        const paddingLeft = 8 + depth * 14;
        if (node.isDirectory) {
          const isExpanded = expanded.has(node.path);
          return (
            <div key={node.path}>
              <button
                className="flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md py-1.5 pr-2 text-left text-[13px] text-stone-600 hover:bg-[#eaeae7] dark:text-stone-400 dark:hover:bg-[#272825]"
                style={{ paddingLeft }}
                onClick={() => onToggle(node.path)}
                title={node.path}
              >
                {isExpanded ? <ChevronDown size={13} className="shrink-0" /> : <ChevronRight size={13} className="shrink-0" />}
                {isExpanded ? <FolderOpen size={14} className="shrink-0" /> : <Folder size={14} className="shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
              </button>
              {isExpanded && (
                <DirectoryNodes
                  nodes={node.children}
                  directoryId={directoryId}
                  depth={depth + 1}
                  expanded={expanded}
                  showAllFiles={showAllFiles}
                  activePath={activePath}
                  documents={documents}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              )}
            </div>
          );
        }

        const openDocument = documents.find((document) => document.path === node.path);
        return (
          <button
            key={node.path}
            disabled={!node.isMarkdown}
            onClick={() => node.isMarkdown && onSelect(node, directoryId)}
            style={{ paddingLeft: paddingLeft + 18 }}
            title={node.isMarkdown ? node.path : "仅 Markdown 文件可查看"}
            className={clsx(
              "flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md py-1.5 pr-2 text-left text-[13px]",
              node.path === activePath
                ? "bg-[#e3e3e0] text-[#20211f] dark:bg-[#30312e] dark:text-stone-100"
                : node.isMarkdown
                  ? "text-stone-600 hover:bg-[#eaeae7] dark:text-stone-400 dark:hover:bg-[#272825]"
                  : "cursor-not-allowed text-stone-400 dark:text-stone-600",
            )}
          >
            {node.isMarkdown ? <FileCode2 size={14} className="shrink-0" /> : <File size={14} className="shrink-0" />}
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            {openDocument && hasUnsavedChanges(openDocument) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />}
            {openDocument?.externalState !== undefined && openDocument.externalState !== "normal" && (
              <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", openDocument.externalState === "deleted" ? "bg-red-500" : "bg-orange-500")} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function hasMarkdown(node: DirectoryNode): boolean {
  return node.children.some((child) => child.isMarkdown || (child.isDirectory && hasMarkdown(child)));
}
