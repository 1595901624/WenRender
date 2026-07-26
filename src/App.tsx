import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AlignVerticalSpaceAround, Braces, Check, ChevronDown, Clipboard, Code2, Eye, FileDown, FolderOpen, Link2, Menu, Palette, PanelLeftClose, PanelLeftOpen, Save, SplitSquareHorizontal } from "lucide-react";
import clsx from "clsx";
import { Editor, type EditorHandle } from "./components/Editor";
import { FileSidebar } from "./components/FileSidebar";
import { Preview, type PreviewHandle } from "./components/Preview";
import { createId, fileName } from "./lib/path";
import { codeThemes, defaultCodeTheme } from "./lib/codeThemes";
import { renderMarkdown, wrapHtml } from "./lib/markdown";
import { articleThemes, defaultTheme } from "./lib/themes";
import { loadWorkspaceSession, saveWorkspaceSession, type WorkspaceSession } from "./lib/workspace";
import type { DirectoryNode, Notice, OpenDirectory, OpenDocument } from "./types";

const welcome = `# 欢迎使用文染

一款为微信公众号写作准备的 Markdown 编辑器。

## 从这里开始

- 点击左上角的文件夹图标打开 Markdown 文件
- 在中间编辑，右侧会实时预览
- 完成后点击「复制到公众号」

\`\`\`rust
fn main() {
    println!("你好，微信公众号！");
}
\`\`\`
`;

function App() {
  // 启动时先显示欢迎文档；工作区恢复完成后再整体替换，避免异步恢复期间出现空状态。
  const [documents, setDocuments] = useState<OpenDocument[]>([{
    id: createId(), path: null, name: "欢迎.md", content: welcome, savedContent: welcome,
  }]);
  const [directories, setDirectories] = useState<OpenDirectory[]>([]);
  const [activeId, setActiveId] = useState(documents[0].id);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.localStorage.getItem("wenrender-sidebar-open") !== "false",
  );
  const [viewMode, setViewMode] = useState<"split" | "editor" | "preview">("split");
  const [notice, setNotice] = useState<Notice>(null);
  const [themeId, setThemeId] = useState(() => window.localStorage.getItem("wenrender-theme") ?? defaultTheme.id);
  const [codeThemeId, setCodeThemeId] = useState(
    () => window.localStorage.getItem("wenrender-code-theme") ?? defaultCodeTheme.id,
  );
  const [outputLineHeight, setOutputLineHeight] = useState(defaultTheme.typography.bodyLineHeight);
  const [syncScroll, setSyncScroll] = useState(true);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const editorRef = useRef<EditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);

  // 目录需要重新扫描以反映磁盘最新状态，文件则按上次的打开顺序恢复。
  useEffect(() => {
    let cancelled = false;
    const session = loadWorkspaceSession();
    if (!session) {
      setWorkspaceReady(true);
      return;
    }

    void restoreWorkspaceSession(session).then((restored) => {
      if (cancelled) return;
      setDirectories(restored.directories);
      if (restored.documents.length > 0) {
        setDocuments(restored.documents);
        setActiveId(restored.activeId);
      }
      setWorkspaceReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workspaceReady) return;
    // 编辑时做短暂防抖；关闭窗口前同步落盘，兼顾性能和最后一次操作的可靠性。
    const persistWorkspace = () => {
      saveWorkspaceSession(documents, directories, activeId);
    };
    const timeout = window.setTimeout(persistWorkspace, 200);
    window.addEventListener("beforeunload", persistWorkspace);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("beforeunload", persistWorkspace);
    };
  }, [activeId, directories, documents, workspaceReady]);

  useEffect(() => {
    window.localStorage.setItem("wenrender-theme", themeId);
  }, [themeId]);

  useEffect(() => {
    window.localStorage.setItem("wenrender-code-theme", codeThemeId);
  }, [codeThemeId]);

  useEffect(() => {
    window.localStorage.setItem("wenrender-sidebar-open", String(sidebarOpen));
  }, [sidebarOpen]);

  const active = documents.find((document) => document.id === activeId) ?? documents[0];
  const baseTheme = articleThemes.find((item) => item.id === themeId) ?? defaultTheme;
  const codeTheme = codeThemes.find((item) => item.id === codeThemeId) ?? defaultCodeTheme;
  const theme = useMemo(() => ({
    ...baseTheme,
    typography: {
      ...baseTheme.typography,
      bodyLineHeight: outputLineHeight,
    },
  }), [baseTheme, outputLineHeight]);
  const rendered = useMemo(
    () => renderMarkdown(active.content, theme, codeTheme, (source) => resolveArticleImage(source, active.path)),
    [active.content, active.path, codeTheme, theme],
  );
  const fullHtml = useMemo(() => wrapHtml(rendered, active.name.replace(/\.md$/i, ""), theme), [rendered, active.name, theme]);

  const notify = (message: string, tone: NonNullable<Notice>["tone"] = "neutral") => {
    setNotice({ message, tone });
    window.setTimeout(() => setNotice(null), 2200);
  };

  const updateActive = useCallback((content: string) => {
    setDocuments((items) => items.map((item) => item.id === activeId ? { ...item, content } : item));
  }, [activeId]);

  const newDocument = () => {
    const id = createId();
    setDocuments((items) => [...items, { id, path: null, name: "未命名.md", content: "", savedContent: "" }]);
    setActiveId(id);
  };

  const openDocument = async () => {
    try {
      const selected = await open({ multiple: true, filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "txt"] }] });
      if (!selected) return;
      for (const path of selected) {
        const existing = documents.find((item) => item.path === path);
        if (existing) {
          // 用户显式打开目录树中的文件时，将它提升为侧边栏“文件”区域的独立条目。
          setDocuments((items) => items.map((item) => item.id === existing.id ? { ...item, directoryId: undefined } : item));
          setActiveId(existing.id);
          continue;
        }
        const content = await readTextFile(path);
        const id = createId();
        setDocuments((items) => [...items, { id, path, name: fileName(path), content, savedContent: content }]);
        setActiveId(id);
      }
    } catch (error) {
      notify(`打开失败：${String(error)}`, "error");
    }
  };

  const openDirectory = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "打开 Markdown 目录" });
      if (!selected) return;
      const existingDirectory = directories.find((directory) => directory.path === selected);
      if (existingDirectory) {
        notify("该目录已经打开", "neutral");
        return;
      }
      const tree = await invoke<Omit<OpenDirectory, "id">>("scan_directory", {
        directoryPath: selected,
      });
      const directory = { ...tree, id: createId() };
      setDirectories((items) => [...items, directory]);
      const firstMarkdown = findFirstMarkdown(directory.children);
      if (firstMarkdown) openTreeDocument(firstMarkdown, directory.id);
      const markdownCount = countMarkdownFiles(directory.children);
      notify(`目录已打开，共 ${markdownCount} 篇 Markdown`, "success");
    } catch (error) {
      notify(`打开目录失败：${String(error)}`, "error");
    }
  };

  const openTreeDocument = (node: DirectoryNode, directoryId: string) => {
    if (!node.isMarkdown || node.content == null) return;
    const existing = documents.find((item) => item.path === node.path);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    const id = createId();
    setDocuments((items) => [...items, {
      id,
      path: node.path,
      name: node.name,
      content: node.content ?? "",
      savedContent: node.content ?? "",
      directoryId,
    }]);
    setActiveId(id);
  };

  const closeDirectory = (directoryId: string) => {
    setDirectories((items) => items.filter((item) => item.id !== directoryId));
    const removedDocumentIds = new Set(documents.filter((item) => item.directoryId === directoryId).map((item) => item.id));
    const remaining = documents.filter((item) => item.directoryId !== directoryId);
    setDocuments(remaining);
    if (removedDocumentIds.has(activeId)) setActiveId(remaining[0].id);
  };

  const saveDocument = async () => {
    try {
      const path = active.path ?? await save({ defaultPath: active.name, filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (!path) return;
      await writeTextFile(path, active.content);
      setDocuments((items) => items.map((item) => item.id === active.id ? { ...item, path, name: fileName(path), savedContent: item.content } : item));
      notify("文章已保存", "success");
    } catch (error) {
      notify(`保存失败：${String(error)}`, "error");
    }
  };

  const exportHtml = async () => {
    try {
      const path = await save({ defaultPath: active.name.replace(/\.md$/i, "") + ".html", filters: [{ name: "HTML", extensions: ["html"] }] });
      if (!path) return;
      await writeTextFile(path, fullHtml);
      notify("HTML 已导出", "success");
    } catch (error) {
      notify(`导出失败：${String(error)}`, "error");
    }
  };

  const copyToWechat = async () => {
    try {
      // 同时写入 HTML 与纯文本，让公众号编辑器优先读取带内联样式的版本。
      const blobHtml = new Blob([rendered], { type: "text/html" });
      const blobText = new Blob([active.content], { type: "text/plain" });
      await navigator.clipboard.write([new ClipboardItem({ "text/html": blobHtml, "text/plain": blobText })]);
      notify("已复制，可直接粘贴到公众号编辑器", "success");
    } catch {
      await navigator.clipboard.writeText(fullHtml);
      notify("已复制 HTML 源码", "neutral");
    }
  };

  const closeDocument = (id: string) => {
    const index = documents.findIndex((item) => item.id === id);
    const remaining = documents.filter((item) => item.id !== id);
    setDocuments(remaining);
    if (id === activeId) setActiveId(remaining[Math.max(0, index - 1)].id);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveDocument();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openDocument();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active]);

  return (
    <Tooltip.Provider delayDuration={350}>
      <div className="flex h-screen min-w-[900px] overflow-hidden bg-[#f3f3f1] text-ink">
        {sidebarOpen && (
          <FileSidebar
            documents={documents}
            directories={directories}
            activeId={activeId}
            activePath={active.path}
            onSelect={setActiveId}
            onSelectTreeFile={openTreeDocument}
            onClose={closeDocument}
            onCloseDirectory={closeDirectory}
            onNew={newDocument}
            onOpenFiles={openDocument}
            onOpenFolder={openDirectory}
          />
        )}
        <div className={clsx("m-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm", sidebarOpen && "ml-0")}>
        <header className="flex h-14 shrink-0 items-center border-b border-stone-200 bg-white px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              className="icon-button"
              onClick={() => setSidebarOpen((value) => !value)}
              aria-label={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
              title={`${sidebarOpen ? "收起" : "展开"}侧边栏（Ctrl+B）`}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <span className="ml-1 max-w-[360px] truncate text-sm font-medium text-[#272825]">{active.name}</span>
            {active.content !== active.savedContent && <span className="ml-2 h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </div>

          <div className="flex items-center justify-end gap-1">
            <ToolbarButton label="打开文件" onClick={openDocument}><FolderOpen size={17} /></ToolbarButton>
            <ToolbarButton label="保存" onClick={saveDocument}><Save size={17} /></ToolbarButton>
            <div className="mx-1 h-5 w-px bg-stone-200" />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100">
                  <Palette size={15} /><span>{theme.name}</span><ChevronDown size={13} className="text-stone-400" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={8} className="z-50 max-h-[min(560px,calc(100vh-72px))] w-[520px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-2.5 shadow-[0_18px_50px_rgba(28,25,23,0.16)]">
                  <div className="flex items-center justify-between px-2 pb-2.5 pt-1">
                    <div>
                      <div className="text-sm font-semibold text-stone-800">文章主题</div>
                      <div className="mt-0.5 text-[11px] text-stone-400">选择后将立即应用到预览和导出内容</div>
                    </div>
                    <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-medium text-stone-500">{articleThemes.length} 款内置</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {articleThemes.map((item) => (
                      <DropdownMenu.Item
                        key={item.id}
                        onSelect={() => setThemeId(item.id)}
                        className={clsx(
                          "group relative flex cursor-default items-center gap-3 rounded-xl border p-2.5 outline-none transition focus:bg-stone-50",
                          item.id === themeId ? "border-stone-300 bg-stone-50" : "border-transparent hover:border-stone-200",
                        )}
                      >
                        <div
                          className="relative h-12 w-11 shrink-0 overflow-hidden rounded-lg border shadow-sm"
                          style={{ backgroundColor: item.colors.articleBackground, borderColor: item.colors.border }}
                        >
                          <span className="absolute left-2 right-2 top-2 h-1 rounded-full" style={{ backgroundColor: item.colors.accent }} />
                          <span className="absolute left-2 right-3 top-[17px] h-px" style={{ backgroundColor: item.colors.border }} />
                          <span className="absolute left-2 right-2 top-[23px] h-px" style={{ backgroundColor: item.colors.border }} />
                          <span className="absolute bottom-2 left-2 h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.colors.codeBackground }} />
                          <span className="absolute bottom-2 left-[23px] right-2 h-2.5 rounded-sm" style={{ backgroundColor: item.colors.accentSoft }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-stone-800">{item.name}</span>
                            <span className="flex shrink-0 overflow-hidden rounded-full ring-1 ring-black/5">
                              {item.swatches.map((color) => <span key={color} className="h-2.5 w-2.5" style={{ backgroundColor: color }} />)}
                            </span>
                          </div>
                          <div className="mt-1 truncate text-[11px] text-stone-400">{item.description}</div>
                        </div>
                        {item.id === themeId && (
                          <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-stone-800 text-white">
                            <Check size={10} strokeWidth={3} />
                          </span>
                        )}
                      </DropdownMenu.Item>
                    ))}
                  </div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="inline-flex h-8 max-w-36 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100"
                  title="选择代码高亮主题"
                >
                  <Braces size={15} className="shrink-0" />
                  <span className="truncate">{codeTheme.name}</span>
                  <ChevronDown size={13} className="shrink-0 text-stone-400" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-72 rounded-2xl border border-stone-200 bg-white p-2.5 shadow-[0_18px_50px_rgba(28,25,23,0.16)]">
                  <div className="px-2 pb-2.5 pt-1">
                    <div className="text-sm font-semibold text-stone-800">代码主题</div>
                    <div className="mt-0.5 text-[11px] text-stone-400">使用 Highlight.js 官方配色</div>
                  </div>
                  <div className="space-y-1">
                    {codeThemes.map((item) => (
                      <DropdownMenu.Item
                        key={item.id}
                        onSelect={() => setCodeThemeId(item.id)}
                        className={clsx(
                          "flex cursor-default items-center gap-3 rounded-xl border p-2 outline-none transition",
                          item.id === codeThemeId ? "border-stone-300 bg-stone-50" : "border-transparent focus:bg-stone-50",
                        )}
                      >
                        <div
                          className="grid h-9 w-14 shrink-0 place-items-center rounded-md border font-mono text-[11px] shadow-sm"
                          style={{
                            backgroundColor: item.background,
                            borderColor: item.border,
                            color: item.swatches[1],
                          }}
                        >
                          {"</>"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-stone-800">{item.name}</span>
                            <span className="flex shrink-0 overflow-hidden rounded-full ring-1 ring-black/5">
                              {item.swatches.map((color) => (
                                <span key={color} className="h-2.5 w-2.5" style={{ backgroundColor: color }} />
                              ))}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-stone-400">{item.description}</div>
                        </div>
                        {item.id === codeThemeId && <Check size={15} className="shrink-0 text-stone-800" />}
                      </DropdownMenu.Item>
                    ))}
                  </div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-stone-600 transition hover:bg-stone-100"
                  title="设置输出正文行高"
                >
                  <AlignVerticalSpaceAround size={15} />
                  <span>行高 {outputLineHeight.toFixed(2)}</span>
                  <ChevronDown size={12} className="text-stone-400" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-44 rounded-xl border border-stone-200 bg-white p-1.5 text-sm shadow-xl">
                  <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">输出正文行高</div>
                  {[1.5, 1.6, 1.75, 1.8, 2].map((lineHeight) => (
                    <DropdownMenu.Item
                      key={lineHeight}
                      onSelect={() => setOutputLineHeight(lineHeight)}
                      className="menu-item justify-between"
                    >
                      <span>{lineHeight.toFixed(2)}</span>
                      {outputLineHeight === lineHeight && <Check size={14} />}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <div className="flex rounded-lg bg-stone-100 p-0.5">
              {([
                ["editor", Code2, "仅编辑"],
                ["split", SplitSquareHorizontal, "分栏"],
                ["preview", Eye, "仅预览"],
              ] as const).map(([mode, Icon, label]) => (
                <button key={mode} title={label} onClick={() => setViewMode(mode)} className={clsx("rounded-md p-1.5 transition", viewMode === mode ? "bg-white text-[#20211f] shadow-sm" : "text-stone-400 hover:text-stone-600")}>
                  <Icon size={16} />
                </button>
              ))}
            </div>
            <ToolbarButton label={syncScroll ? "同步滚动已开启" : "同步滚动已关闭"} onClick={() => setSyncScroll((value) => !value)}>
              <Link2 size={17} className={syncScroll ? "text-[#20211f]" : "text-stone-300"} />
            </ToolbarButton>
            <button className="ml-1 inline-flex h-9 items-center gap-2 rounded-lg bg-[#20211f] px-3.5 text-sm font-medium text-white transition hover:bg-black" onClick={copyToWechat}>
              <Clipboard size={16} />复制到公众号
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild><button className="icon-button"><ChevronDown size={16} /></button></DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" className="z-50 min-w-44 rounded-lg border border-stone-200 bg-white p-1.5 text-sm shadow-xl">
                  <DropdownMenu.Item onSelect={exportHtml} className="menu-item"><FileDown size={15} />导出 HTML</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={newDocument} className="menu-item"><Menu size={15} />新建文章</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        <main className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1">
            {viewMode !== "preview" && (
              <section className={clsx("min-w-0", viewMode === "split" ? "w-1/2 border-r border-stone-200" : "w-full")}>
                <div className="flex h-10 items-center justify-between border-b border-stone-100 bg-[#fbfcfb] px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                  <span>Markdown</span><span>{active.content.length} 字符</span>
                </div>
                <div className="h-[calc(100%-40px)]">
                  <Editor
                    ref={editorRef}
                    key={active.id}
                    value={active.content}
                    onChange={updateActive}
                    onScrollRatio={(ratio) => { if (syncScroll) previewRef.current?.scrollToRatio(ratio); }}
                  />
                </div>
              </section>
            )}
            {viewMode !== "editor" && (
              <section className={clsx("min-w-0", viewMode === "split" ? "w-1/2" : "w-full")}>
                <div className="flex h-10 items-center border-b border-stone-200 bg-[#f8f9f6] px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">微信预览 · 677px</div>
                <div className="h-[calc(100%-40px)]">
                  <Preview
                    ref={previewRef}
                    html={fullHtml}
                    onScrollRatio={(ratio) => { if (syncScroll) editorRef.current?.scrollToRatio(ratio); }}
                  />
                </div>
              </section>
            )}
          </div>
        </main>
        </div>

        {notice && (
          <div className={clsx("fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm shadow-xl", notice.tone === "error" ? "bg-red-600 text-white" : "bg-[#1f2922] text-white")}>
            {notice.tone === "success" && <Check size={15} className="text-emerald-400" />}{notice.message}
          </div>
        )}
      </div>
    </Tooltip.Provider>
  );
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild><button className="icon-button" aria-label={label} onClick={onClick}>{children}</button></Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content sideOffset={8} className="rounded bg-stone-900 px-2 py-1 text-xs text-white shadow">{label}</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  );
}

function findFirstMarkdown(nodes: DirectoryNode[]): DirectoryNode | null {
  for (const node of nodes) {
    if (node.isMarkdown) return node;
    if (node.isDirectory) {
      const nested = findFirstMarkdown(node.children);
      if (nested) return nested;
    }
  }
  return null;
}

function countMarkdownFiles(nodes: DirectoryNode[]): number {
  return nodes.reduce(
    (count, node) => count + (node.isMarkdown ? 1 : 0) + (node.isDirectory ? countMarkdownFiles(node.children) : 0),
    0,
  );
}

async function restoreWorkspaceSession(session: WorkspaceSession): Promise<{
  directories: OpenDirectory[];
  documents: OpenDocument[];
  activeId: string;
}> {
  // 各目录互不依赖，并行扫描可以明显缩短多项目工作区的恢复时间。
  const restoredDirectories = (
    await Promise.all(session.directoryPaths.map(async (path) => {
      try {
        const tree = await invoke<Omit<OpenDirectory, "id">>("scan_directory", {
          directoryPath: path,
        });
        return { ...tree, id: createId() };
      } catch {
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
      restoredDocuments.push({
        id,
        path: null,
        name: persisted.name,
        content: persisted.scratchContent ?? "",
        savedContent: persisted.scratchSavedContent ?? "",
      });
      if (index === session.activeIndex) restoredActiveId = id;
      continue;
    }

    const directory = persisted.directoryPath
      ? directoriesByPath.get(persisted.directoryPath)
      : undefined;
    const treeNode = directory
      ? findNodeByPath(directory.children, persisted.path)
      : null;

    let diskContent = treeNode?.content ?? null;
    if (diskContent == null) {
      try {
        // 重启后文件选择器授予的临时权限已失效，改由受控的 Tauri 命令重新读取。
        diskContent = await invoke<string>("read_text_file", {
          filePath: persisted.path,
        });
      } catch {
        continue;
      }
    }

    const id = createId();
    restoredDocuments.push({
      id,
      path: persisted.path,
      name: fileName(persisted.path),
      // 草稿只覆盖编辑区内容，savedContent 始终来自磁盘，便于继续显示未保存状态。
      content: persisted.draftContent ?? diskContent,
      savedContent: diskContent,
      directoryId: directory?.id,
    });
    if (index === session.activeIndex) restoredActiveId = id;
  }

  return {
    directories: restoredDirectories,
    documents: restoredDocuments,
    activeId: restoredActiveId ?? restoredDocuments[0]?.id ?? "",
  };
}

function findNodeByPath(nodes: DirectoryNode[], path: string): DirectoryNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.isDirectory) {
      const nested = findNodeByPath(node.children, path);
      if (nested) return nested;
    }
  }
  return null;
}

function resolveArticleImage(source: string, documentPath: string | null): string {
  if (!documentPath || /^(?:https?:|data:|asset:|blob:)/i.test(source)) return source;
  // Markdown 图片相对路径以当前文章目录为基准，并手动归一化 "." 与 ".."。
  const normalizedSource = decodeURIComponent(source).replace(/\//g, "\\");
  const directory = documentPath.replace(/[\\/][^\\/]+$/, "");
  const segments = `${directory}\\${normalizedSource}`.split("\\");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }
  const prefix = /^[A-Za-z]:/.test(resolved[0] ?? "") ? "" : "\\";
  return convertFileSrc(prefix + resolved.join("\\"));
}

export default App;
