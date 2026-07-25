import { useCallback, useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Clipboard, Code2, Eye, FileDown, FolderOpen, Menu, Palette, PanelLeftClose, PanelLeftOpen, Save, SplitSquareHorizontal } from "lucide-react";
import clsx from "clsx";
import { Editor } from "./components/Editor";
import { FileSidebar } from "./components/FileSidebar";
import { Preview } from "./components/Preview";
import { createId, fileName } from "./lib/path";
import { renderMarkdown, wrapHtml } from "./lib/markdown";
import { articleThemes, defaultTheme } from "./lib/themes";
import type { Notice, OpenDocument } from "./types";

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
  const [documents, setDocuments] = useState<OpenDocument[]>([{
    id: createId(), path: null, name: "欢迎.md", content: welcome, savedContent: welcome,
  }]);
  const [activeId, setActiveId] = useState(documents[0].id);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<"split" | "editor" | "preview">("split");
  const [notice, setNotice] = useState<Notice>(null);
  const [themeId, setThemeId] = useState(defaultTheme.id);

  const active = documents.find((document) => document.id === activeId) ?? documents[0];
  const theme = articleThemes.find((item) => item.id === themeId) ?? defaultTheme;
  const rendered = useMemo(() => renderMarkdown(active.content, theme, (source) => resolveArticleImage(source, active.path)), [active.content, active.path, theme]);
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
        if (existing) { setActiveId(existing.id); continue; }
        const content = await readTextFile(path);
        const id = createId();
        setDocuments((items) => [...items, { id, path, name: fileName(path), content, savedContent: content }]);
        setActiveId(id);
      }
    } catch (error) {
      notify(`打开失败：${String(error)}`, "error");
    }
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
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active]);

  return (
    <Tooltip.Provider delayDuration={350}>
      <div className="flex h-screen min-w-[900px] flex-col overflow-hidden bg-white text-ink">
        <header className="flex h-16 shrink-0 items-center border-b border-stone-200 bg-white px-3">
          <div className="flex min-w-[220px] items-center gap-2">
            <button className="icon-button" onClick={() => setSidebarOpen((value) => !value)}>
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <div className="ml-1 flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-moss-600 text-sm font-black text-white">文</div>
              <div>
                <div className="text-sm font-semibold leading-none">文染</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-stone-400">WenRender</div>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center">
            <span className="max-w-[420px] truncate text-sm font-medium">{active.name}</span>
            {active.content !== active.savedContent && <span className="ml-2 h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </div>

          <div className="flex min-w-[330px] items-center justify-end gap-1.5">
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
                <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-64 rounded-xl border border-stone-200 bg-white p-2 shadow-xl">
                  <div className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">文章主题</div>
                  {articleThemes.map((item) => (
                    <DropdownMenu.Item key={item.id} onSelect={() => setThemeId(item.id)} className="flex cursor-default items-center gap-3 rounded-lg p-2 outline-none focus:bg-moss-50">
                      <div className="flex overflow-hidden rounded-md ring-1 ring-black/5">
                        {item.swatches.map((color) => <span key={color} className="h-8 w-3.5" style={{ backgroundColor: color }} />)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-stone-800">{item.name}</div>
                        <div className="truncate text-[11px] text-stone-400">{item.description}</div>
                      </div>
                      {item.id === themeId && <Check size={15} className="text-moss-600" />}
                    </DropdownMenu.Item>
                  ))}
                  <div className="mt-1 border-t border-stone-100 px-2 pb-1 pt-2 text-[11px] leading-5 text-stone-400">主题配置已独立，后续可继续加入新的配色与排版。</div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <div className="flex rounded-lg bg-stone-100 p-0.5">
              {([
                ["editor", Code2, "仅编辑"],
                ["split", SplitSquareHorizontal, "分栏"],
                ["preview", Eye, "仅预览"],
              ] as const).map(([mode, Icon, label]) => (
                <button key={mode} title={label} onClick={() => setViewMode(mode)} className={clsx("rounded-md p-1.5 transition", viewMode === mode ? "bg-white text-moss-700 shadow-sm" : "text-stone-400 hover:text-stone-600")}>
                  <Icon size={16} />
                </button>
              ))}
            </div>
            <button className="ml-2 inline-flex h-9 items-center gap-2 rounded-lg bg-moss-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-moss-700" onClick={copyToWechat}>
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
          {sidebarOpen && <FileSidebar documents={documents} activeId={activeId} onSelect={setActiveId} onClose={closeDocument} onNew={newDocument} />}
          <div className="flex min-w-0 flex-1">
            {viewMode !== "preview" && (
              <section className={clsx("min-w-0", viewMode === "split" ? "w-1/2 border-r border-stone-200" : "w-full")}>
                <div className="flex h-10 items-center justify-between border-b border-stone-100 bg-[#fbfcfb] px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                  <span>Markdown</span><span>{active.content.length} 字符</span>
                </div>
                <div className="h-[calc(100%-40px)]"><Editor key={active.id} value={active.content} onChange={updateActive} /></div>
              </section>
            )}
            {viewMode !== "editor" && (
              <section className={clsx("min-w-0", viewMode === "split" ? "w-1/2" : "w-full")}>
                <div className="flex h-10 items-center border-b border-stone-200 bg-[#f8f9f6] px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">微信预览 · 677px</div>
                <div className="h-[calc(100%-40px)]"><Preview html={fullHtml} /></div>
              </section>
            )}
          </div>
        </main>

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
      <Tooltip.Trigger asChild><button className="icon-button" onClick={onClick}>{children}</button></Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content sideOffset={8} className="rounded bg-stone-900 px-2 py-1 text-xs text-white shadow">{label}</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  );
}

function resolveArticleImage(source: string, documentPath: string | null): string {
  if (!documentPath || /^(?:https?:|data:|asset:|blob:)/i.test(source)) return source;
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
