import { type ReactNode, useEffect, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  File,
  FileCode2,
  FileText,
  ListTree,
  Folder,
  FolderOpen,
  FilePlus2,
  MoreHorizontal,
  PanelTopOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
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
  onNewInDirectory: (directoryId: string, directoryPath: string, directoryName: string) => void;
  onOpenFiles: () => void;
  onOpenFolder: () => void;
  onShowOutline: () => void;
  onShowSearch: () => void;
  onRevealFile: (path: string) => void;
  onCopyFilePath: (path: string, absolute: boolean) => void;
  onRenameFile: (path: string, name: string) => void;
  onDeleteFile: (path: string, name: string) => void;
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
  onNewInDirectory,
  onOpenFiles,
  onOpenFolder,
  onShowOutline,
  onShowSearch,
  onRevealFile,
  onCopyFilePath,
  onRenameFile,
  onDeleteFile,
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
  const previousDirectoryPaths = useRef<Set<string>>(new Set());
  const standaloneDocuments = documents.filter((document) => !document.directoryId);

  useEffect(() => {
    // 仅默认展开本次新打开的项目根目录，保留已打开目录的当前展开状态。
    setExpanded((current) => {
      const next = new Set(current);
      directories
        .filter((directory) => !previousDirectoryPaths.current.has(directory.path))
        .forEach((directory) => next.add(directory.path));
      return next;
    });
    previousDirectoryPaths.current = new Set(directories.map((directory) => directory.path));
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
    <aside className="flex h-full w-[240px] shrink-0 flex-col bg-[#f3f3f1] px-2.5 pb-2.5 pt-2 dark:bg-[#171815]">
      <div className="flex h-10 shrink-0 items-center justify-between px-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold text-[#20211f] dark:text-stone-100">文件</h2>
          <span className="text-[10px] tabular-nums text-stone-400">{standaloneDocuments.length}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="icon-button"
            onClick={onShowSearch}
            title="工作区全文搜索"
            aria-label="工作区全文搜索"
          >
            <Search size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onShowOutline}
            title="显示文章大纲"
            aria-label="显示文章大纲"
          >
            <ListTree size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onNew}
            title="新建草稿"
            aria-label="新建草稿"
          >
            <Plus size={16} />
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-stone-600 transition hover:bg-stone-200 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white"
                aria-label="打开"
                title="打开文件或目录"
              >
                <FolderOpen size={15} />
                {/* <span>打开</span> */}
                <ChevronDown size={12} className="text-stone-400" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-40 rounded-lg border border-stone-200 bg-white p-1.5 text-sm shadow-xl dark:border-stone-700 dark:bg-[#292a27]"
              >
                <DropdownMenu.Item onSelect={onOpenFiles} className="menu-item">
                  <PanelTopOpen size={15} />
                  打开文件
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={onOpenFolder} className="menu-item">
                  <FolderOpen size={15} />
                  打开目录
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <ScrollArea.Root className="relative mt-1 min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Radix 默认的 table 包装层会被长文件名撑宽，这里强制为固定宽度块级元素。 */}
        <ScrollArea.Viewport className="h-full w-full overflow-x-hidden overscroll-contain px-1 pb-4 [&>div]:!block [&>div]:!min-w-0 [&>div]:!w-full">
          {standaloneDocuments.length === 0 && directories.length === 0 && (
            <div className="mx-1 mt-3 rounded-xl border border-dashed border-stone-300 px-3 py-5 text-center dark:border-stone-700">
              <p className="text-xs text-stone-500 dark:text-stone-400">暂无打开的文件</p>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <button type="button" className="sidebar-action" onClick={onOpenFiles}>
                  <PanelTopOpen size={14} />
                  打开文件
                </button>
                <button type="button" className="sidebar-action" onClick={onOpenFolder}>
                  <FolderOpen size={14} />
                  打开目录
                </button>
              </div>
              <p className="mt-2 text-[10px] text-stone-400">也可以拖放文件到窗口</p>
            </div>
          )}

          <div className="min-w-0 space-y-0.5">
            {standaloneDocuments.map((document) => {
              const dirty = hasUnsavedChanges(document);
              return (
                <FileContextMenu
                  key={document.id}
                  disabled={!document.path || document.externalState === "deleted"}
                  path={document.path ?? ""}
                  copyPath={document.name}
                  name={document.name}
                  onReveal={onRevealFile}
                  onCopy={onCopyFilePath}
                  onRename={onRenameFile}
                  onDelete={onDeleteFile}
                >
                  <div
                    className={clsx(
                      "group flex w-full min-w-0 items-center rounded-lg text-sm transition",
                      document.id === activeId
                        ? "bg-[#e3e3e0] text-[#20211f] dark:bg-[#30312e] dark:text-stone-100"
                        : "text-stone-600 hover:bg-[#eaeae7] dark:text-stone-400 dark:hover:bg-[#272825]",
                    )}
                  >
                    <button
                      type="button"
                      title={document.path ?? document.name}
                      onClick={() => onSelect(document.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
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
                    </button>
                    {document.path && document.externalState !== "deleted" && (
                      <FileActionsMenu
                        path={document.path}
                        copyPath={document.name}
                        name={document.name}
                        onReveal={onRevealFile}
                        onCopy={onCopyFilePath}
                        onRename={onRenameFile}
                        onDelete={onDeleteFile}
                      />
                    )}
                    {standaloneDocuments.length > 1 && (
                      <button
                        type="button"
                        aria-label={`关闭 ${document.name}`}
                        className="mr-1 rounded p-1 text-stone-400 opacity-0 hover:bg-stone-200 hover:text-stone-700 group-hover:opacity-100 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                        onClick={() => onClose(document.id)}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </FileContextMenu>
              );
            })}
          </div>

          {directories.length > 0 && (
            <div className={clsx("mb-1 flex items-center justify-between px-2", standaloneDocuments.length > 0 ? "mt-4" : "mt-2")}>
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
                      onClick={() => onNewInDirectory(directory.id, directory.path, directory.name)}
                      title="在此目录新建 Markdown"
                    >
                      <FilePlus2 size={13} />
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
                      directoryPath={directory.path}
                      depth={1}
                      expanded={expanded}
                      showAllFiles={showAllFiles}
                      activePath={activePath}
                      documents={documents}
                      onToggle={toggleExpanded}
                      onSelect={onSelectTreeFile}
                      onNewInDirectory={onNewInDirectory}
                      onRevealFile={onRevealFile}
                      onCopyFilePath={onCopyFilePath}
                      onRenameFile={onRenameFile}
                      onDeleteFile={onDeleteFile}
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
  directoryPath,
  depth,
  expanded,
  showAllFiles,
  activePath,
  documents,
  onToggle,
  onSelect,
  onNewInDirectory,
  onRevealFile,
  onCopyFilePath,
  onRenameFile,
  onDeleteFile,
}: {
  nodes: DirectoryNode[];
  directoryId: string;
  directoryPath: string;
  depth: number;
  expanded: Set<string>;
  showAllFiles: boolean;
  activePath: string | null;
  documents: OpenDocument[];
  onToggle: (path: string) => void;
  onSelect: (node: DirectoryNode, directoryId: string) => void;
  onNewInDirectory: (directoryId: string, directoryPath: string, directoryName: string) => void;
  onRevealFile: (path: string) => void;
  onCopyFilePath: (path: string, absolute: boolean) => void;
  onRenameFile: (path: string, name: string) => void;
  onDeleteFile: (path: string, name: string) => void;
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
              <div className="group flex min-w-0 items-center rounded-md hover:bg-[#eaeae7] dark:hover:bg-[#272825]">
                <button
                  className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden py-1.5 pr-1 text-left text-[13px] text-stone-600 dark:text-stone-400"
                  style={{ paddingLeft }}
                  onClick={() => onToggle(node.path)}
                  title={node.path}
                >
                  {isExpanded ? <ChevronDown size={13} className="shrink-0" /> : <ChevronRight size={13} className="shrink-0" />}
                  {isExpanded ? <FolderOpen size={14} className="shrink-0" /> : <Folder size={14} className="shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{node.name}</span>
                </button>
                <button
                  className="mr-1 rounded p-1 text-stone-400 opacity-0 hover:bg-stone-200 hover:text-stone-700 group-hover:opacity-100 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                  onClick={() => onNewInDirectory(directoryId, node.path, node.name)}
                  title="在此目录新建 Markdown"
                >
                  <FilePlus2 size={13} />
                </button>
              </div>
              {isExpanded && (
                <DirectoryNodes
                  nodes={node.children}
                  directoryId={directoryId}
                  directoryPath={directoryPath}
                  depth={depth + 1}
                  expanded={expanded}
                  showAllFiles={showAllFiles}
                  activePath={activePath}
                  documents={documents}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onNewInDirectory={onNewInDirectory}
                  onRevealFile={onRevealFile}
                  onCopyFilePath={onCopyFilePath}
                  onRenameFile={onRenameFile}
                  onDeleteFile={onDeleteFile}
                />
              )}
            </div>
          );
        }

        const openDocument = documents.find((document) => document.path === node.path);
        return (
          <FileContextMenu
            key={node.path}
            path={node.path}
            copyPath={relativeFilePath(directoryPath, node.path)}
            name={node.name}
            onReveal={onRevealFile}
            onCopy={onCopyFilePath}
            onRename={onRenameFile}
            onDelete={onDeleteFile}
          >
            <div
              className={clsx(
                "group flex w-full min-w-0 items-center overflow-hidden rounded-md text-[13px]",
                node.path === activePath
                  ? "bg-[#e3e3e0] text-[#20211f] dark:bg-[#30312e] dark:text-stone-100"
                  : node.isMarkdown
                    ? "text-stone-600 hover:bg-[#eaeae7] dark:text-stone-400 dark:hover:bg-[#272825]"
                    : "text-stone-400 hover:bg-[#eaeae7] dark:text-stone-600 dark:hover:bg-[#272825]",
              )}
            >
              <button
                type="button"
                aria-disabled={!node.isMarkdown}
                tabIndex={node.isMarkdown ? undefined : -1}
                onClick={() => node.isMarkdown && onSelect(node, directoryId)}
                style={{ paddingLeft: paddingLeft + 18 }}
                title={node.isMarkdown ? node.path : "仅 Markdown 文件可查看"}
                className={clsx(
                  "flex min-w-0 flex-1 items-center gap-2 overflow-hidden py-1.5 pr-1 text-left",
                  !node.isMarkdown && "cursor-not-allowed",
                )}
              >
                {node.isMarkdown ? <FileCode2 size={14} className="shrink-0" /> : <File size={14} className="shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
                {openDocument && hasUnsavedChanges(openDocument) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />}
                {openDocument?.externalState !== undefined && openDocument.externalState !== "normal" && (
                  <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", openDocument.externalState === "deleted" ? "bg-red-500" : "bg-orange-500")} />
                )}
              </button>
              <FileActionsMenu
                path={node.path}
                copyPath={relativeFilePath(directoryPath, node.path)}
                name={node.name}
                onReveal={onRevealFile}
                onCopy={onCopyFilePath}
                onRename={onRenameFile}
                onDelete={onDeleteFile}
              />
            </div>
          </FileContextMenu>
        );
      })}
    </div>
  );
}

function FileContextMenu({
  children,
  disabled = false,
  path,
  copyPath,
  name,
  onReveal,
  onCopy,
  onRename,
  onDelete,
}: {
  children: ReactNode;
  disabled?: boolean;
  path: string;
  copyPath: string;
  name: string;
  onReveal: (path: string) => void;
  onCopy: (path: string, absolute: boolean) => void;
  onRename: (path: string, name: string) => void;
  onDelete: (path: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [positioned, setPositioned] = useState(false);
  const firstPositionFrame = useRef<number | null>(null);
  const secondPositionFrame = useRef<number | null>(null);

  const cancelPositionFrames = () => {
    if (firstPositionFrame.current !== null) cancelAnimationFrame(firstPositionFrame.current);
    if (secondPositionFrame.current !== null) cancelAnimationFrame(secondPositionFrame.current);
    firstPositionFrame.current = null;
    secondPositionFrame.current = null;
  };

  useEffect(() => cancelPositionFrames, []);

  const handleOpenChange = (nextOpen: boolean) => {
    cancelPositionFrames();
    setOpen(nextOpen);
    setPositioned(false);
    if (!nextOpen) return;

    // Radix 的右键锚点先以 (0, 0) 挂载，再在 effect 中更新到指针坐标。
    // 延后两帧显示，避免桌面 WebView 把测量阶段绘制到左上角。
    firstPositionFrame.current = requestAnimationFrame(() => {
      secondPositionFrame.current = requestAnimationFrame(() => {
        setPositioned(true);
        firstPositionFrame.current = null;
        secondPositionFrame.current = null;
      });
    });
  };

  return (
    <ContextMenu.Root open={open} onOpenChange={handleOpenChange}>
      <ContextMenu.Trigger asChild disabled={disabled}>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          collisionPadding={8}
          className={clsx(
            "z-50 min-w-36 rounded-lg border border-stone-200 bg-white p-1.5 text-sm shadow-xl dark:border-stone-700 dark:bg-[#292a27]",
            positioned ? "visible" : "invisible",
          )}
        >
          <ContextMenu.Item onSelect={() => onReveal(path)} className="menu-item">
            <FolderOpen size={14} />{fileManagerMenuLabel()}
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-stone-100 dark:bg-stone-700" />
          <ContextMenu.Item onSelect={() => onCopy(copyPath, false)} className="menu-item">
            <Copy size={14} />复制路径
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={() => onCopy(path, true)} className="menu-item">
            <Copy size={14} />复制绝对路径
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-stone-100 dark:bg-stone-700" />
          <ContextMenu.Item onSelect={() => onRename(path, name)} className="menu-item">
            <Pencil size={14} />重命名
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={() => onDelete(path, name)}
            className="menu-item text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-950/40 dark:focus:text-red-300"
          >
            <Trash2 size={14} />删除
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function FileActionsMenu({
  path,
  copyPath,
  name,
  onReveal,
  onCopy,
  onRename,
  onDelete,
}: {
  path: string;
  copyPath: string;
  name: string;
  onReveal: (path: string) => void;
  onCopy: (path: string, absolute: boolean) => void;
  onRename: (path: string, name: string) => void;
  onDelete: (path: string, name: string) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`${name} 的文件操作`}
          title="文件操作"
          className="mr-1 rounded p-1 text-stone-400 opacity-0 transition hover:bg-stone-200 hover:text-stone-700 focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 dark:hover:bg-stone-700 dark:hover:text-stone-200"
        >
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-36 rounded-lg border border-stone-200 bg-white p-1.5 text-sm shadow-xl dark:border-stone-700 dark:bg-[#292a27]"
        >
          <DropdownMenu.Item onSelect={() => onReveal(path)} className="menu-item">
            <FolderOpen size={14} />{fileManagerMenuLabel()}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-stone-100 dark:bg-stone-700" />
          <DropdownMenu.Item onSelect={() => onCopy(copyPath, false)} className="menu-item">
            <Copy size={14} />复制路径
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => onCopy(path, true)} className="menu-item">
            <Copy size={14} />复制绝对路径
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-stone-100 dark:bg-stone-700" />
          <DropdownMenu.Item onSelect={() => onRename(path, name)} className="menu-item">
            <Pencil size={14} />重命名
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => onDelete(path, name)}
            className="menu-item text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-950/40 dark:focus:text-red-300"
          >
            <Trash2 size={14} />删除
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function fileManagerMenuLabel(): string {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("mac")) return "在访达中打开";
  if (platform.includes("win")) return "在资源管理器中打开";
  return "在文件管理器中打开";
}

function relativeFilePath(directoryPath: string, filePath: string): string {
  const root = directoryPath.replace(/[\\/]+$/, "");
  const normalizedRoot = root.replace(/\\/g, "/");
  const normalizedFile = filePath.replace(/\\/g, "/");
  const caseInsensitive = /^[a-z]:\//i.test(normalizedRoot);
  const comparableRoot = caseInsensitive ? normalizedRoot.toLowerCase() : normalizedRoot;
  const comparableFile = caseInsensitive ? normalizedFile.toLowerCase() : normalizedFile;
  if (comparableFile.startsWith(`${comparableRoot}/`)) {
    return filePath.slice(root.length + 1);
  }
  return filePath.split(/[\\/]/).pop() || filePath;
}

function hasMarkdown(node: DirectoryNode): boolean {
  return node.children.some((child) => child.isMarkdown || (child.isDirectory && hasMarkdown(child)));
}
