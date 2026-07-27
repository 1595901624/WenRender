import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { AlertTriangle, ArrowLeft, Braces, Check, ChevronDown, Clipboard, Code2, ExternalLink, Eye, FileDown, FolderOpen, Github, Info, Link2, Menu, Monitor, Moon, Palette, PanelLeftClose, PanelLeftOpen, Save, Settings, Smartphone, SplitSquareHorizontal, Sun, Type } from "lucide-react";
import clsx from "clsx";
import { Editor, type EditorHandle } from "./components/Editor";
import { FileSidebar } from "./components/FileSidebar";
import { Preview, type PreviewHandle, type PreviewMode } from "./components/Preview";
import { TypographyPanel } from "./components/TypographyPanel";
import { createId, fileName } from "./lib/path";
import { codeThemes, defaultCodeTheme } from "./lib/codeThemes";
import { hasUnsavedChanges, needsSaveAttention } from "./lib/document";
import { renderMarkdown, wrapHtml } from "./lib/markdown";
import { articleThemes, defaultTheme } from "./lib/themes";
import {
  countTypographyOverrides,
  parseTypographyOverrides,
  type TypographyOverrides,
  type TypographyOverridesByTheme,
} from "./lib/typography";
import { loadWorkspaceSession, saveWorkspaceSession, type WorkspaceSession } from "./lib/workspace";
import type { DirectoryNode, FileInspection, FileSnapshot, Notice, OpenDirectory, OpenDocument } from "./types";

type SaveOutcome = {
  status: "saved" | "conflict";
  reason?: "modified" | "deleted";
  snapshot?: FileSnapshot;
};

type SaveConflict = {
  documentId: string;
  reason: "modified" | "deleted";
  diskSnapshot?: FileSnapshot;
};

type PendingClose = {
  kind: "document" | "directory" | "application";
  documentIds: string[];
  directoryId?: string;
};

type AppColorScheme = "system" | "light" | "dark";
type AppPage = "workspace" | "settings";
type SettingsSection = "general" | "about";

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
    lineEnding: "lf", hasBom: false, readOnly: false, externalState: "normal",
  }]);
  const [directories, setDirectories] = useState<OpenDirectory[]>([]);
  const [activeId, setActiveId] = useState(documents[0].id);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.localStorage.getItem("wenrender-sidebar-open") !== "false",
  );
  const [viewMode, setViewMode] = useState<"split" | "editor" | "preview">("split");
  const [previewMode, setPreviewMode] = useState<PreviewMode>(() => (
    window.localStorage.getItem("wenrender-preview-mode") === "phone" ? "phone" : "web"
  ));
  const [notice, setNotice] = useState<Notice>(null);
  const [themeId, setThemeId] = useState(() => window.localStorage.getItem("wenrender-theme") ?? defaultTheme.id);
  const [codeThemeId, setCodeThemeId] = useState(
    () => window.localStorage.getItem("wenrender-code-theme") ?? defaultCodeTheme.id,
  );
  const [typographyPanelOpen, setTypographyPanelOpen] = useState(false);
  const [typographyOverridesByTheme, setTypographyOverridesByTheme] = useState<TypographyOverridesByTheme>(
    () => parseTypographyOverrides(window.localStorage.getItem("wenrender-typography-overrides")),
  );
  const [syncScroll, setSyncScroll] = useState(true);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [activePage, setActivePage] = useState<AppPage>("workspace");
  const [colorScheme, setColorScheme] = useState<AppColorScheme>(() => {
    const saved = window.localStorage.getItem("wenrender-color-scheme");
    return saved === "light" || saved === "dark" ? saved : "system";
  });
  const [darkInterface, setDarkInterface] = useState(() => document.documentElement.classList.contains("dark"));
  const [saveConflict, setSaveConflict] = useState<SaveConflict | null>(null);
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  const editorRef = useRef<EditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const documentsRef = useRef(documents);
  const allowWindowClose = useRef(false);
  documentsRef.current = documents;

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
    if (!workspaceReady) return;
    let checking = false;

    const inspectOpenFiles = async () => {
      if (checking) return;
      checking = true;
      try {
        for (const document of documentsRef.current) {
          if (!document.path) continue;
          try {
            const inspection = await invoke<FileInspection>("inspect_text_file", {
              filePath: document.path,
            });
            if (!inspection.exists) {
              setDocuments((items) => items.map((item) => (
                item.id === document.id && item.externalState !== "deleted"
                  ? { ...item, externalState: "deleted" }
                  : item
              )));
              continue;
            }

            const diskHash = inspection.fingerprint?.hash;
            if (!diskHash || diskHash === document.diskFingerprint?.hash) {
              setDocuments((items) => items.map((item) => (
                item.id === document.id
                  && (item.readOnly !== inspection.readOnly || item.externalState !== "normal")
                  ? { ...item, readOnly: inspection.readOnly, externalState: "normal" }
                  : item
              )));
              continue;
            }

            if (hasUnsavedChanges(document)) {
              setDocuments((items) => items.map((item) => (
                item.id === document.id
                  && (item.readOnly !== inspection.readOnly || item.externalState !== "modified")
                  ? { ...item, readOnly: inspection.readOnly, externalState: "modified" }
                  : item
              )));
              continue;
            }

            // 本地没有修改时，外部变化可以安全地自动加载。
            const snapshot = await invoke<FileSnapshot>("read_file_snapshot", {
              filePath: document.path,
            });
            setDocuments((items) => items.map((item) => {
              if (item.id !== document.id || hasUnsavedChanges(item)) return item;
              return applySnapshot(item, snapshot);
            }));
          } catch {
            // 网络盘短暂不可用或文件被占用时不立即判定为删除，等待下一轮检查。
          }
        }
      } finally {
        checking = false;
      }
    };

    void inspectOpenFiles();
    const interval = window.setInterval(inspectOpenFiles, 2000);
    return () => window.clearInterval(interval);
  }, [workspaceReady]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested((event) => {
      if (allowWindowClose.current) return;
      const dirtyIds = documentsRef.current.filter(needsSaveAttention).map((document) => document.id);
      if (dirtyIds.length === 0) return;
      event.preventDefault();
      setPendingClose({ kind: "application", documentIds: dirtyIds });
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    window.localStorage.setItem("wenrender-theme", themeId);
  }, [themeId]);

  useEffect(() => {
    window.localStorage.setItem("wenrender-code-theme", codeThemeId);
  }, [codeThemeId]);

  useEffect(() => {
    window.localStorage.setItem("wenrender-typography-overrides", JSON.stringify(typographyOverridesByTheme));
  }, [typographyOverridesByTheme]);

  useEffect(() => {
    window.localStorage.setItem("wenrender-sidebar-open", String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    window.localStorage.setItem("wenrender-preview-mode", previewMode);
  }, [previewMode]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyColorScheme = () => {
      const dark = colorScheme === "dark" || (colorScheme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      setDarkInterface(dark);
    };
    window.localStorage.setItem("wenrender-color-scheme", colorScheme);
    // 同步 Tauri 原生窗口主题，使系统标题栏也与软件主题保持一致。
    if ("__TAURI_INTERNALS__" in window) {
      void getCurrentWindow().setTheme(colorScheme === "system" ? null : colorScheme);
    }
    applyColorScheme();
    media.addEventListener("change", applyColorScheme);
    return () => media.removeEventListener("change", applyColorScheme);
  }, [colorScheme]);

  const active = documents.find((document) => document.id === activeId) ?? documents[0];
  const baseTheme = articleThemes.find((item) => item.id === themeId) ?? defaultTheme;
  const codeTheme = codeThemes.find((item) => item.id === codeThemeId) ?? defaultCodeTheme;
  const typographyOverrides = typographyOverridesByTheme[baseTheme.id] ?? {};
  const typographyCustomCount = countTypographyOverrides(typographyOverrides);
  const updateTypographyOverrides = useCallback((overrides: TypographyOverrides) => {
    setTypographyOverridesByTheme((items) => ({ ...items, [baseTheme.id]: overrides }));
  }, [baseTheme.id]);
  const resetTypographyOverrides = useCallback(() => {
    setTypographyOverridesByTheme((items) => {
      const next = { ...items };
      delete next[baseTheme.id];
      return next;
    });
  }, [baseTheme.id]);
  const rendered = useMemo(
    () => renderMarkdown(
      active.content,
      baseTheme,
      codeTheme,
      (source) => resolveArticleImage(source, active.path),
      typographyOverrides,
    ),
    [active.content, active.path, baseTheme, codeTheme, typographyOverrides],
  );
  const fullHtml = useMemo(
    () => wrapHtml(rendered, active.name.replace(/\.md$/i, ""), baseTheme, typographyOverrides),
    [rendered, active.name, baseTheme, typographyOverrides],
  );

  const notify = (message: string, tone: NonNullable<Notice>["tone"] = "neutral") => {
    setNotice({ message, tone });
    window.setTimeout(() => setNotice(null), 2200);
  };

  const updateActive = useCallback((content: string) => {
    setDocuments((items) => items.map((item) => item.id === activeId ? { ...item, content } : item));
  }, [activeId]);

  const newDocument = () => {
    const id = createId();
    setDocuments((items) => [...items, {
      id,
      path: null,
      name: "未命名.md",
      content: "",
      savedContent: "",
      lineEnding: "lf",
      hasBom: false,
      readOnly: false,
      externalState: "normal",
    }]);
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
        const snapshot = await invoke<FileSnapshot>("read_file_snapshot", { filePath: path });
        const id = createId();
        setDocuments((items) => [...items, createDocumentFromSnapshot(id, path, fileName(path), snapshot)]);
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

  const openTreeDocument = async (node: DirectoryNode, directoryId: string) => {
    if (!node.isMarkdown) return;
    const existing = documents.find((item) => item.path === node.path);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    try {
      const snapshot = await invoke<FileSnapshot>("read_file_snapshot", { filePath: node.path });
      const id = createId();
      setDocuments((items) => [...items, {
        ...createDocumentFromSnapshot(id, node.path, node.name, snapshot),
        directoryId,
      }]);
      setActiveId(id);
    } catch (error) {
      notify(`打开失败：${String(error)}`, "error");
    }
  };

  const removeDocuments = (documentIds: Set<string>) => {
    const currentDocuments = documentsRef.current;
    const activeIndex = currentDocuments.findIndex((item) => item.id === activeId);
    const remaining = currentDocuments.filter((item) => !documentIds.has(item.id));
    if (remaining.length === 0) {
      const id = createId();
      const replacement: OpenDocument = {
        id,
        path: null,
        name: "未命名.md",
        content: "",
        savedContent: "",
        lineEnding: "lf",
        hasBom: false,
        readOnly: false,
        externalState: "normal",
      };
      documentsRef.current = [replacement];
      setDocuments([replacement]);
      setActiveId(id);
      return;
    }
    documentsRef.current = remaining;
    setDocuments(remaining);
    if (documentIds.has(activeId)) {
      setActiveId(remaining[Math.min(Math.max(0, activeIndex - 1), remaining.length - 1)].id);
    }
  };

  const removeDirectory = (directoryId: string) => {
    setDirectories((items) => items.filter((item) => item.id !== directoryId));
    const removedDocumentIds = new Set(documentsRef.current.filter((item) => item.directoryId === directoryId).map((item) => item.id));
    removeDocuments(removedDocumentIds);
  };

  const closeDirectory = (directoryId: string) => {
    const documentIds = documents.filter((item) => item.directoryId === directoryId).map((item) => item.id);
    const dirtyIds = documentIds.filter((id) => {
      const document = documents.find((item) => item.id === id);
      return document ? needsSaveAttention(document) : false;
    });
    if (dirtyIds.length > 0) {
      setPendingClose({ kind: "directory", documentIds: dirtyIds, directoryId });
      return;
    }
    removeDirectory(directoryId);
  };

  const saveOneDocument = async (
    document: OpenDocument,
    options: { force?: boolean; saveAs?: boolean; recreate?: boolean } = {},
  ): Promise<"saved" | "cancelled" | "conflict" | "failed"> => {
    try {
      const needsPath = !document.path || options.saveAs;
      const path = needsPath
        ? await save({ defaultPath: document.name, filters: [{ name: "Markdown", extensions: ["md"] }] })
        : document.path;
      if (!path) return "cancelled";

      const outcome = await invoke<SaveOutcome>("save_text_file_safely", {
        filePath: path,
        content: document.content,
        lineEnding: document.lineEnding,
        hasBom: document.hasBom,
        expectedHash: needsPath ? null : document.diskFingerprint?.hash ?? null,
        // 系统“另存为”对目标覆盖已有确认；冲突界面的覆盖/重新创建同样是显式操作。
        force: Boolean(options.force || needsPath),
        allowCreate: Boolean(needsPath || options.recreate),
      });

      if (outcome.status === "conflict") {
        setSaveConflict({
          documentId: document.id,
          reason: outcome.reason ?? "modified",
          diskSnapshot: outcome.snapshot,
        });
        setActiveId(document.id);
        return "conflict";
      }

      if (!outcome.snapshot) throw new Error("保存完成但未返回文件快照");
      const updatedDocuments = documentsRef.current.map((item) => item.id === document.id
        ? {
          ...applySnapshot(item, outcome.snapshot!),
          path,
          name: fileName(path),
          content: document.content,
          savedContent: document.content,
          directoryId: needsPath ? undefined : item.directoryId,
          recoveredDraft: false,
        }
        : item);
      documentsRef.current = updatedDocuments;
      setDocuments(updatedDocuments);
      setSaveConflict(null);
      notify("文章已保存", "success");
      return "saved";
    } catch (error) {
      notify(`保存失败：${String(error)}`, "error");
      return "failed";
    }
  };

  const saveDocument = async () => {
    await saveOneDocument(active);
  };

  const saveDocumentAs = async () => {
    await saveOneDocument(active, { saveAs: true });
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
    const document = documents.find((item) => item.id === id);
    if (document && needsSaveAttention(document)) {
      setPendingClose({ kind: "document", documentIds: [id] });
      return;
    }
    removeDocuments(new Set([id]));
  };

  const finishPendingClose = async (request: PendingClose, discard = false) => {
    setPendingClose(null);
    if (request.kind === "application") {
      if (discard) {
        const discarded = documentsRef.current
          .filter((document) => !(
            request.documentIds.includes(document.id)
            && document.externalState === "deleted"
          ))
          .map((document) => (
            request.documentIds.includes(document.id)
              ? { ...document, content: document.savedContent, recoveredDraft: false }
              : document
          ));
        documentsRef.current = discarded;
      }
      saveWorkspaceSession(documentsRef.current, directories, activeId);
      allowWindowClose.current = true;
      await getCurrentWindow().destroy();
      return;
    }
    if (request.kind === "directory" && request.directoryId) {
      removeDirectory(request.directoryId);
      return;
    }
    removeDocuments(new Set(request.documentIds));
  };

  const saveAndFinishPendingClose = async () => {
    if (!pendingClose) return;
    const request = pendingClose;
    for (const id of request.documentIds) {
      const document = documentsRef.current.find((item) => item.id === id);
      if (!document) continue;
      const result = await saveOneDocument(document);
      if (result !== "saved") {
        if (result === "conflict") setPendingClose(null);
        return;
      }
    }
    await finishPendingClose(request);
  };

  const reloadConflictFromDisk = () => {
    if (!saveConflict?.diskSnapshot) return;
    setDocuments((items) => items.map((item) => (
      item.id === saveConflict.documentId
        ? { ...applySnapshot(item, saveConflict.diskSnapshot!), recoveredDraft: false }
        : item
    )));
    setSaveConflict(null);
    notify("已重新加载磁盘版本", "success");
  };

  const overwriteConflict = async () => {
    if (!saveConflict) return;
    const document = documentsRef.current.find((item) => item.id === saveConflict.documentId);
    if (!document) return;
    await saveOneDocument(document, {
      force: true,
      recreate: saveConflict.reason === "deleted",
    });
  };

  const saveConflictAs = async () => {
    if (!saveConflict) return;
    const document = documentsRef.current.find((item) => item.id === saveConflict.documentId);
    if (!document) return;
    await saveOneDocument(document, { saveAs: true });
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
      <div className="flex h-screen min-w-[900px] overflow-hidden bg-[#f3f3f1] text-ink dark:bg-[#171815] dark:text-stone-100">
        {sidebarOpen && (
          <FileSidebar
            documents={documents}
            directories={directories}
            activeId={activeId}
            activePath={active.path}
            onSelect={(id) => {
              setActiveId(id);
              setActivePage("workspace");
            }}
            onSelectTreeFile={(node, directoryId) => {
              setActivePage("workspace");
              void openTreeDocument(node, directoryId);
            }}
            onClose={closeDocument}
            onCloseDirectory={closeDirectory}
            onNew={() => {
              newDocument();
              setActivePage("workspace");
            }}
            onOpenFiles={() => {
              setActivePage("workspace");
              void openDocument();
            }}
            onOpenFolder={() => {
              setActivePage("workspace");
              void openDirectory();
            }}
          />
        )}
        <div className={clsx("m-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-[#20211f]", sidebarOpen && "ml-0")}>
        <header className="flex h-14 shrink-0 items-center border-b border-stone-200 bg-white px-3 dark:border-stone-700 dark:bg-[#20211f]">
          {activePage === "settings" ? (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button className="icon-button" onClick={() => setActivePage("workspace")} aria-label="返回编辑器">
                  <ArrowLeft size={18} />
                </button>
                <span className="ml-1 text-sm font-semibold text-[#272825] dark:text-stone-100">设置</span>
              </div>
              <button
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                onClick={() => setActivePage("workspace")}
              >
                返回编辑器
              </button>
            </>
          ) : (
          <>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              className="icon-button"
              onClick={() => setSidebarOpen((value) => !value)}
              aria-label={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
              title={`${sidebarOpen ? "收起" : "展开"}侧边栏（Ctrl+B）`}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <span className="ml-1 max-w-[360px] truncate text-sm font-medium text-[#272825] dark:text-stone-100">{active.name}</span>
            {hasUnsavedChanges(active) && <span className="ml-2 h-1.5 w-1.5 rounded-full bg-amber-500" />}
            {active.recoveredDraft && (
              <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">已恢复草稿</span>
            )}
            {active.externalState === "modified" && (
              <span className="rounded-md bg-orange-50 px-2 py-1 text-[10px] font-medium text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">磁盘已修改</span>
            )}
            {active.externalState === "deleted" && (
              <span className="rounded-md bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">磁盘文件已删除</span>
            )}
            {active.readOnly && (
              <span className="rounded-md bg-stone-100 px-2 py-1 text-[10px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">只读</span>
            )}
          </div>

          <div className="flex items-center justify-end gap-1">
            <ToolbarButton label="打开文件" onClick={openDocument}><FolderOpen size={17} /></ToolbarButton>
            <ToolbarButton label="保存" onClick={saveDocument}><Save size={17} /></ToolbarButton>
            <ToolbarButton label="设置" onClick={() => setActivePage("settings")}><Settings size={17} /></ToolbarButton>
            <div className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800">
                  <Palette size={15} /><span>{baseTheme.name}</span><ChevronDown size={13} className="text-stone-400" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={8} className="z-50 max-h-[min(560px,calc(100vh-72px))] w-[520px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-2.5 shadow-[0_18px_50px_rgba(28,25,23,0.16)] dark:border-stone-700 dark:bg-[#292a27]">
                  <div className="flex items-center justify-between px-2 pb-2.5 pt-1">
                    <div>
                      <div className="text-sm font-semibold text-stone-800 dark:text-stone-100">文章主题</div>
                      <div className="mt-0.5 text-[11px] text-stone-400">选择后将立即应用到预览和导出内容</div>
                    </div>
                    <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">{articleThemes.length} 款内置</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {articleThemes.map((item) => (
                      <DropdownMenu.Item
                        key={item.id}
                        onSelect={() => setThemeId(item.id)}
                        className={clsx(
                          "group relative flex cursor-default items-center gap-3 rounded-xl border p-2.5 outline-none transition focus:bg-stone-50 dark:focus:bg-stone-800",
                          item.id === themeId
                            ? "border-stone-300 bg-stone-50 dark:border-stone-600 dark:bg-stone-800"
                            : "border-transparent hover:border-stone-200 dark:hover:border-stone-700",
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
                            <span className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{item.name}</span>
                            <span className="flex shrink-0 overflow-hidden rounded-full ring-1 ring-black/5">
                              {item.swatches.map((color) => <span key={color} className="h-2.5 w-2.5" style={{ backgroundColor: color }} />)}
                            </span>
                          </div>
                          <div className="mt-1 truncate text-[11px] text-stone-400">{item.description}</div>
                        </div>
                        {item.id === themeId && (
                          <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900">
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
                  className="inline-flex h-8 max-w-36 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                  title="选择代码高亮主题"
                >
                  <Braces size={15} className="shrink-0" />
                  <span className="truncate">{codeTheme.name}</span>
                  <ChevronDown size={13} className="shrink-0 text-stone-400" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-72 rounded-2xl border border-stone-200 bg-white p-2.5 shadow-[0_18px_50px_rgba(28,25,23,0.16)] dark:border-stone-700 dark:bg-[#292a27]">
                  <div className="px-2 pb-2.5 pt-1">
                    <div className="text-sm font-semibold text-stone-800 dark:text-stone-100">代码主题</div>
                    <div className="mt-0.5 text-[11px] text-stone-400">使用 Highlight.js 官方配色</div>
                  </div>
                  <div className="space-y-1">
                    {codeThemes.map((item) => (
                      <DropdownMenu.Item
                        key={item.id}
                        onSelect={() => setCodeThemeId(item.id)}
                        className={clsx(
                          "flex cursor-default items-center gap-3 rounded-xl border p-2 outline-none transition",
                          item.id === codeThemeId
                            ? "border-stone-300 bg-stone-50 dark:border-stone-600 dark:bg-stone-800"
                            : "border-transparent focus:bg-stone-50 dark:focus:bg-stone-800",
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
                            <span className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{item.name}</span>
                            <span className="flex shrink-0 overflow-hidden rounded-full ring-1 ring-black/5">
                              {item.swatches.map((color) => (
                                <span key={color} className="h-2.5 w-2.5" style={{ backgroundColor: color }} />
                              ))}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-stone-400">{item.description}</div>
                        </div>
                        {item.id === codeThemeId && <Check size={15} className="shrink-0 text-stone-800 dark:text-stone-100" />}
                      </DropdownMenu.Item>
                    ))}
                  </div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <button
              type="button"
              aria-pressed={typographyPanelOpen}
              className={clsx(
                "relative inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition",
                typographyPanelOpen
                  ? "bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-100"
                  : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800",
              )}
              title="调整文章字体与标题层级"
              onClick={() => {
                setTypographyPanelOpen((value) => !value);
                if (viewMode === "editor") setViewMode("split");
              }}
            >
              <Type size={15} />
              <span>排版</span>
              {typographyCustomCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
            </button>
            <div className="flex rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800">
              {([
                ["editor", Code2, "仅编辑"],
                ["split", SplitSquareHorizontal, "分栏"],
                ["preview", Eye, "仅预览"],
              ] as const).map(([mode, Icon, label]) => (
                <button key={mode} title={label} onClick={() => setViewMode(mode)} className={clsx("rounded-md p-1.5 transition", viewMode === mode ? "bg-white text-[#20211f] shadow-sm dark:bg-stone-700 dark:text-stone-100" : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-200")}>
                  <Icon size={16} />
                </button>
              ))}
            </div>
            <ToolbarButton label={syncScroll ? "同步滚动已开启" : "同步滚动已关闭"} onClick={() => setSyncScroll((value) => !value)}>
              <Link2 size={17} className={syncScroll ? "text-[#20211f] dark:text-stone-100" : "text-stone-300 dark:text-stone-600"} />
            </ToolbarButton>
            <button className="ml-1 inline-flex h-9 items-center gap-2 rounded-lg bg-[#20211f] px-3.5 text-sm font-medium text-white transition hover:bg-black" onClick={copyToWechat}>
              <Clipboard size={16} />复制到公众号
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild><button className="icon-button"><ChevronDown size={16} /></button></DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" className="z-50 min-w-44 rounded-lg border border-stone-200 bg-white p-1.5 text-sm shadow-xl dark:border-stone-700 dark:bg-[#292a27]">
                  <DropdownMenu.Item onSelect={exportHtml} className="menu-item"><FileDown size={15} />导出 HTML</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={saveDocumentAs} className="menu-item"><Save size={15} />另存为 Markdown</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={newDocument} className="menu-item"><Menu size={15} />新建文章</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
          </>
          )}
        </header>

        {activePage === "settings" ? (
          <SettingsPage colorScheme={colorScheme} onColorSchemeChange={setColorScheme} />
        ) : (
        <main className="relative flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1">
            {viewMode !== "preview" && (
              <section className={clsx("min-w-0", viewMode === "split" ? "w-1/2 border-r border-stone-200 dark:border-stone-700" : "w-full")}>
                <div className="flex h-10 items-center justify-between border-b border-stone-100 bg-[#fbfcfb] px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400 dark:border-stone-700 dark:bg-[#1f201e]">
                  <span>Markdown</span><span>{active.content.length} 字符</span>
                </div>
                <div className="h-[calc(100%-40px)]">
                  <Editor
                    ref={editorRef}
                    key={active.id}
                    value={active.content}
                    dark={darkInterface}
                    onChange={updateActive}
                    onScrollRatio={(ratio) => { if (syncScroll) previewRef.current?.scrollToRatio(ratio); }}
                  />
                </div>
              </section>
            )}
            {viewMode !== "editor" && (
              <section className={clsx("min-w-0", viewMode === "split" ? "w-1/2" : "w-full")}>
                <div className="flex h-10 items-center justify-between border-b border-stone-200 bg-[#f8f9f6] px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400 dark:border-stone-700 dark:bg-[#1d1e1b]">
                  <span>预览</span>
                  <div className="flex rounded-lg bg-stone-200/70 p-0.5 normal-case tracking-normal dark:bg-stone-800">
                    {([
                      ["web", Monitor, "网页"],
                      ["phone", Smartphone, "手机"],
                    ] as const).map(([mode, Icon, label]) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={previewMode === mode}
                        title={`${label}预览`}
                        onClick={() => setPreviewMode(mode)}
                        className={clsx(
                          "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[10px] font-medium transition",
                          previewMode === mode
                            ? "bg-white text-stone-800 shadow-sm dark:bg-stone-700 dark:text-stone-100"
                            : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200",
                        )}
                      >
                        <Icon size={12} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-[calc(100%-40px)]">
                  <Preview
                    ref={previewRef}
                    html={fullHtml}
                    mode={previewMode}
                    onScrollRatio={(ratio) => { if (syncScroll) editorRef.current?.scrollToRatio(ratio); }}
                  />
                </div>
              </section>
            )}
          </div>
          {typographyPanelOpen && (
            <TypographyPanel
              theme={baseTheme}
              overrides={typographyOverrides}
              onChange={updateTypographyOverrides}
              onReset={resetTypographyOverrides}
              onClose={() => setTypographyPanelOpen(false)}
            />
          )}
        </main>
        )}
        </div>

        {pendingClose && (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-black/25 p-5 backdrop-blur-[1px]">
            <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-700 dark:bg-[#242522]">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
                  <AlertTriangle size={18} />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">存在未保存的修改</h2>
                  <p className="mt-1.5 text-sm leading-6 text-stone-500 dark:text-stone-400">
                    {pendingClose.kind === "application"
                      ? `退出前还有 ${pendingClose.documentIds.length} 个文档需要保存。`
                      : pendingClose.kind === "directory"
                        ? `该目录中还有 ${pendingClose.documentIds.length} 个文档需要保存。`
                        : "关闭后，尚未保存到文件的修改将会丢失。"}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" onClick={() => setPendingClose(null)}>取消</button>
                <button className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40" onClick={() => void finishPendingClose(pendingClose, true)}>不保存</button>
                <button className="rounded-lg bg-[#20211f] px-3.5 py-2 text-sm font-medium text-white hover:bg-black" onClick={() => void saveAndFinishPendingClose()}>保存并继续</button>
              </div>
            </div>
          </div>
        )}

        {saveConflict && (() => {
          const document = documents.find((item) => item.id === saveConflict.documentId);
          if (!document) return null;
          return (
            <div className="fixed inset-0 z-[80] grid place-items-center bg-black/30 p-5 backdrop-blur-[1px]">
              <div role="alertdialog" aria-modal="true" className="flex max-h-[88vh] w-full max-w-5xl flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-700 dark:bg-[#242522]">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300"><AlertTriangle size={18} /></span>
                  <div>
                    <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                      {saveConflict.reason === "deleted" ? "磁盘文件已被删除" : "文件存在外部修改"}
                    </h2>
                    <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                      {saveConflict.reason === "deleted"
                        ? "可以重新创建原文件，或者将当前内容保存到其它位置。"
                        : "为避免覆盖其它程序的修改，保存已暂停。请比较两个版本后选择处理方式。"}
                    </p>
                  </div>
                </div>

                {saveConflict.diskSnapshot && (
                  <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-hidden">
                    <ConflictPane title="磁盘版本" content={saveConflict.diskSnapshot.content} />
                    <ConflictPane title="WenRender 中的版本" content={document.content} />
                  </div>
                )}

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" onClick={() => setSaveConflict(null)}>取消</button>
                  <button className="rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" onClick={() => void saveConflictAs()}>另存为</button>
                  {saveConflict.diskSnapshot && (
                    <button className="rounded-lg px-3 py-2 text-sm text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/40" onClick={reloadConflictFromDisk}>使用磁盘版本</button>
                  )}
                  <button className="rounded-lg bg-[#20211f] px-3.5 py-2 text-sm font-medium text-white hover:bg-black" onClick={() => void overwriteConflict()}>
                    {saveConflict.reason === "deleted" ? "重新创建原文件" : "使用当前版本覆盖"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {notice && (
          <div className={clsx("fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm shadow-xl", notice.tone === "error" ? "bg-red-600 text-white" : "bg-[#1f2922] text-white")}>
            {notice.tone === "success" && <Check size={15} className="text-emerald-400" />}{notice.message}
          </div>
        )}
      </div>
    </Tooltip.Provider>
  );
}

function SettingsPage({
  colorScheme,
  onColorSchemeChange,
}: {
  colorScheme: AppColorScheme;
  onColorSchemeChange: (value: AppColorScheme) => void;
}) {
  const [section, setSection] = useState<SettingsSection>("general");

  return (
    <main className="flex min-h-0 flex-1 bg-[#f8f8f6] dark:bg-[#1b1c19]">
      {/* 设置分类单独占一列，后续增加编辑器、导出等设置时无需改动页面结构。 */}
      <nav className="w-52 shrink-0 border-r border-stone-200 px-3 py-5 dark:border-stone-700">
        <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">设置</div>
        <div className="mt-3 space-y-1">
          {([
            ["general", Settings, "通用"],
            ["about", Info, "关于"],
          ] as const).map(([value, Icon, label]) => (
            <button
              key={value}
              className={clsx(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition",
                section === value
                  ? "bg-stone-200/70 text-stone-800 dark:bg-stone-800 dark:text-stone-100"
                  : "text-stone-500 hover:bg-stone-200/50 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100",
              )}
              onClick={() => setSection(value)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <ScrollArea.Root className="min-w-0 flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full">
          {section === "general"
            ? <GeneralSettings colorScheme={colorScheme} onColorSchemeChange={onColorSchemeChange} />
            : <AboutSettings />}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="flex w-2.5 touch-none select-none p-0.5">
          <ScrollArea.Thumb className="min-h-8 flex-1 rounded-full bg-stone-300 dark:bg-stone-700" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </main>
  );
}

function GeneralSettings({
  colorScheme,
  onColorSchemeChange,
}: {
  colorScheme: AppColorScheme;
  onColorSchemeChange: (value: AppColorScheme) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-10 py-9">
      <div>
        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">通用设置</h1>
        <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">调整文染的软件外观与通用行为。</p>
      </div>

      <section className="mt-8 overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-[#242522]">
        <div className="border-b border-stone-200 px-5 py-4 dark:border-stone-700">
          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">外观</div>
          <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
            软件主题应用于侧边栏、工具栏、菜单、设置、编辑器和系统弹窗。微信文章预览保持文章主题原本的样式。
          </div>
        </div>
        <div className="px-5 py-5">
          <div className="text-sm font-medium text-stone-800 dark:text-stone-200">软件主题</div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {([
              ["system", Monitor, "跟随系统", "根据系统外观自动切换"],
              ["light", Sun, "亮色", "整个软件始终使用亮色"],
              ["dark", Moon, "暗色", "整个软件始终使用暗色"],
            ] as const).map(([value, Icon, label, description]) => (
              <button
                key={value}
                type="button"
                aria-pressed={colorScheme === value}
                className={clsx(
                  "relative flex min-h-28 flex-col items-start rounded-xl border p-4 text-left transition",
                  colorScheme === value
                    ? "border-stone-700 bg-stone-50 ring-1 ring-stone-700 dark:border-stone-300 dark:bg-stone-800 dark:ring-stone-300"
                    : "border-stone-200 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:hover:border-stone-600 dark:hover:bg-stone-800/70",
                )}
                onClick={() => onColorSchemeChange(value)}
              >
                <Icon size={19} className="text-stone-700 dark:text-stone-300" />
                <span className="mt-4 text-sm font-medium text-stone-900 dark:text-stone-100">{label}</span>
                <span className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</span>
                {colorScheme === value && (
                  <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AboutSettings() {
  const [appVersion, setAppVersion] = useState("获取中…");

  useEffect(() => {
    let active = true;

    // 通过 Tauri 运行时读取安装包的真实版本，避免前端元数据与应用版本不一致。
    void getVersion()
      .then((version) => {
        if (active) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        if (active) {
          setAppVersion("未知");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-10 py-9">
      <div>
        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">关于文染</h1>
        <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">版本、开源项目和软件信息。</p>
      </div>

      <section className="mt-8 overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-[#242522]">
        <div className="flex items-center gap-4 border-b border-stone-200 px-5 py-5 dark:border-stone-700">
          <img src="/app_logo_radius.png" alt="文染标志" className="h-16 w-16 object-cover" />
          <div className="min-w-0">
            <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">文染 WenRender</div>
            <div className="mt-1 text-sm text-stone-500 dark:text-stone-400">面向微信公众号写作场景的跨平台 Markdown 编辑器。</div>
            <span className="mt-2 inline-flex rounded-full bg-stone-100 px-2.5 py-1 font-mono text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              版本 {appVersion}
            </span>
          </div>
        </div>

        <dl className="divide-y divide-stone-100 px-5 dark:divide-stone-700">
          <AboutRow label="当前版本" value={appVersion} />
          {/* <AboutRow label="支持平台" value="Windows、macOS、Linux" /> */}
          <AboutRow label="核心技术" value="Tauri 2、React、CodeMirror 6" />
          <AboutRow label="开源协议" value="GNU AGPL v3" />
        </dl>
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-[#242522]">
        <button
          type="button"
          onClick={() => void openExternalUrl("https://github.com/1595901624/WenRender")}
          className="group flex items-center gap-3 px-5 py-4 transition hover:bg-stone-50 dark:hover:bg-stone-800/70"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
            <Github size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-stone-900 dark:text-stone-100">GitHub 开源仓库</span>
            <span className="mt-0.5 block truncate text-xs text-stone-500 dark:text-stone-400">1595901624/WenRender</span>
          </span>
          <ExternalLink size={15} className="text-stone-400 transition group-hover:text-stone-700 dark:group-hover:text-stone-200" />
        </button>
      </section>

      <section className="mt-4 rounded-xl border border-stone-200 bg-white px-5 py-4 dark:border-stone-700 dark:bg-[#242522]">
        <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">数据与隐私</div>
        <p className="mt-1.5 text-xs leading-5 text-stone-500 dark:text-stone-400">
          文染在本地读取、编辑和渲染文章，不会主动上传文章内容。工作区状态与软件设置保存在本机。
        </p>
      </section>
    </div>
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5 text-sm">
      <dt className="text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="text-right text-stone-800 dark:text-stone-200">{value}</dd>
    </div>
  );
}

async function openExternalUrl(url: string) {
  if ("__TAURI_INTERNALS__" in window) {
    await openUrl(url);
    return;
  }
  // 浏览器开发环境使用原生 window.open，桌面应用始终交给 opener 插件处理。
  window.open(url, "_blank", "noopener,noreferrer");
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild><button className="icon-button" aria-label={label} onClick={onClick}>{children}</button></Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content sideOffset={8} className="rounded bg-stone-900 px-2 py-1 text-xs text-white shadow">{label}</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  );
}

function ConflictPane({ title, content }: { title: string; content: string }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-[#1d1e1b]">
      <div className="shrink-0 border-b border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600 dark:border-stone-700 dark:text-stone-300">{title}</div>
      <pre className="min-h-40 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-6 text-stone-700 dark:text-stone-300">{content}</pre>
    </section>
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
        lineEnding: "lf",
        hasBom: false,
        readOnly: false,
        externalState: "normal",
        recoveredDraft: hasUnsavedChanges({
          content: persisted.scratchContent ?? "",
          savedContent: persisted.scratchSavedContent ?? "",
        }),
      });
      if (index === session.activeIndex) restoredActiveId = id;
      continue;
    }

    const directory = persisted.directoryPath
      ? directoriesByPath.get(persisted.directoryPath)
      : undefined;
    const id = createId();
    try {
      const snapshot = await invoke<FileSnapshot>("read_file_snapshot", {
        filePath: persisted.path,
      });
      const document = createDocumentFromSnapshot(id, persisted.path, fileName(persisted.path), snapshot);
      const restoredDraft = persisted.draftContent;
      const diskChangedWhileClosed = Boolean(
        restoredDraft
        && persisted.baseHash
        && persisted.baseHash !== snapshot.fingerprint.hash,
      );
      restoredDocuments.push({
        ...document,
        content: restoredDraft ?? snapshot.content,
        // 草稿基于旧磁盘版本时保留旧哈希，下一次保存会进入冲突处理。
        diskFingerprint: diskChangedWhileClosed
          ? { ...snapshot.fingerprint, hash: persisted.baseHash! }
          : snapshot.fingerprint,
        externalState: diskChangedWhileClosed ? "modified" : "normal",
        recoveredDraft: restoredDraft !== undefined,
        directoryId: directory?.id,
      });
    } catch {
      // 文件在应用关闭期间被删除时仍保留未保存草稿，避免用户内容丢失。
      if (persisted.draftContent === undefined) continue;
      restoredDocuments.push({
        id,
        path: persisted.path,
        name: fileName(persisted.path),
        content: persisted.draftContent,
        savedContent: "",
        diskFingerprint: persisted.baseHash
          ? { size: 0, modifiedMs: 0, hash: persisted.baseHash }
          : undefined,
        lineEnding: "lf",
        hasBom: false,
        readOnly: false,
        externalState: "deleted",
        recoveredDraft: true,
        directoryId: directory?.id,
      });
    }
    if (index === session.activeIndex) restoredActiveId = id;
  }

  return {
    directories: restoredDirectories,
    documents: restoredDocuments,
    activeId: restoredActiveId ?? restoredDocuments[0]?.id ?? "",
  };
}

function createDocumentFromSnapshot(
  id: string,
  path: string,
  name: string,
  snapshot: FileSnapshot,
): OpenDocument {
  return {
    id,
    path,
    name,
    content: snapshot.content,
    savedContent: snapshot.content,
    diskFingerprint: snapshot.fingerprint,
    lineEnding: snapshot.lineEnding,
    hasBom: snapshot.hasBom,
    readOnly: snapshot.readOnly,
    externalState: "normal",
  };
}

function applySnapshot(document: OpenDocument, snapshot: FileSnapshot): OpenDocument {
  return {
    ...document,
    content: snapshot.content,
    savedContent: snapshot.content,
    diskFingerprint: snapshot.fingerprint,
    lineEnding: snapshot.lineEnding,
    hasBom: snapshot.hasBom,
    readOnly: snapshot.readOnly,
    externalState: "normal",
  };
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
