import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowLeft, Blocks, Braces, Check, ChevronDown, Clipboard, Code2, Eye, FileDown, Focus, FolderOpen, Link2, Menu, Minimize2, Monitor, Palette, PanelLeftClose, PanelLeftOpen, Save, Search, Settings, Smartphone, SplitSquareHorizontal, Type } from "lucide-react";
import clsx from "clsx";
import { Editor, type EditorHandle } from "./components/Editor";
import { FileSidebar } from "./components/FileSidebar";
import {
  ContentBlockSidebar,
  type ContentBlockDraft,
} from "./components/ContentBlockSidebar";
import { OutlineSidebar } from "./components/OutlineSidebar";
import {
  WorkspaceSearchSidebar,
  type WorkspaceSearchTarget,
} from "./components/WorkspaceSearchSidebar";
import { Preview, type PreviewHandle, type PreviewMode } from "./components/Preview";
import { TypographyPanel } from "./components/TypographyPanel";
import { TitleBar } from "./components/TitleBar";
import { createId, fileName } from "./lib/path";
import { codeThemes, defaultCodeTheme } from "./lib/codeThemes";
import { hasUnsavedChanges, needsSaveAttention } from "./lib/document";
import { activeHeadingAt, calculateArticleStats, extractMarkdownHeadings } from "./lib/articleTools";
import {
  createContentBlock,
  loadContentBlocks,
  saveContentBlocks,
} from "./lib/contentBlocks";
import { parseImageSettings, type ImageSettings } from "./lib/imageSettings";
import { renderMarkdown, wrapHtml } from "./lib/markdown";
import { articleThemes, defaultTheme } from "./lib/themes";
import {
  countTypographyOverrides,
  parseTypographyOverrides,
  type TypographyOverrides,
  type TypographyOverridesByTheme,
} from "./lib/typography";
import { loadWorkspaceSession, saveWorkspaceSession } from "./lib/workspace";
import { SettingsPage } from "./features/settings/SettingsPage";
import { AppDialogs, type NewMarkdownTarget } from "./features/workspace/AppDialogs";
import {
  applySnapshot as applyWorkspaceSnapshot,
  createDocumentFromSnapshot as createWorkspaceDocument,
  restoreWorkspaceSession as restoreWorkspace,
} from "./features/workspace/workspaceRestore";
import {
  embedLocalImages as embedWorkspaceLocalImages,
  formatFileSize as formatImageFileSize,
  markdownImageAlt as createMarkdownImageAlt,
  markdownImageDestination as createMarkdownImageDestination,
  pathIsInside as isPathInside,
  resolveLocalArticleImagePath,
  resolveArticleImage as resolveWorkspaceImage,
} from "./features/images/articleImage";
import type {
  ArticleImageInput,
  DirectoryNode,
  FileInspection,
  FileSnapshot,
  Notice,
  OpenDirectory,
  OpenDocument,
  StoredArticleImage,
} from "./types";

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

type NewMarkdownRequest = NewMarkdownTarget & {
  directoryId: string;
};

type CreatedMarkdownFile = {
  path: string;
  snapshot: FileSnapshot;
};

type AppColorScheme = "system" | "light" | "dark";
type AppPage = "workspace" | "settings";

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
  const [sidebarMode, setSidebarMode] = useState<"files" | "outline" | "search" | "blocks">(() => {
    const saved = window.localStorage.getItem("wenrender-sidebar-mode");
    return saved === "outline" || saved === "search" || saved === "blocks" ? saved : "files";
  });
  const [contentBlocks, setContentBlocks] = useState(loadContentBlocks);
  const [focusMode, setFocusMode] = useState(false);
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
  const [imageSettings, setImageSettings] = useState<ImageSettings>(() => (
    parseImageSettings(window.localStorage.getItem("wenrender-image-settings"))
  ));
  const [darkInterface, setDarkInterface] = useState(() => document.documentElement.classList.contains("dark"));
  const [saveConflict, setSaveConflict] = useState<SaveConflict | null>(null);
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  const [newMarkdownRequest, setNewMarkdownRequest] = useState<NewMarkdownRequest | null>(null);
  const [pendingSystemOpenPaths, setPendingSystemOpenPaths] = useState<string[]>([]);
  const editorRef = useRef<EditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const documentsRef = useRef(documents);
  const systemOpenChain = useRef(Promise.resolve());
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

    void restoreWorkspace(session).then((restored) => {
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
              return applyWorkspaceSnapshot(item, snapshot);
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
    window.localStorage.setItem("wenrender-image-settings", JSON.stringify(imageSettings));
  }, [imageSettings]);

  useEffect(() => {
    window.localStorage.setItem("wenrender-sidebar-open", String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    window.localStorage.setItem("wenrender-sidebar-mode", sidebarMode);
  }, [sidebarMode]);

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
  const headings = useMemo(() => extractMarkdownHeadings(active.content), [active.content]);
  const articleStats = useMemo(
    () => calculateArticleStats(active.content, headings.length),
    [active.content, headings.length],
  );
  const activeHeading = useMemo(
    () => activeHeadingAt(headings, active.cursorPosition ?? 0),
    [active.cursorPosition, headings],
  );
  const effectiveViewMode = focusMode ? "editor" : viewMode;
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
      (source) => resolveWorkspaceImage(source, active.path),
      typographyOverrides,
    ),
    [active.content, active.path, baseTheme, codeTheme, typographyOverrides],
  );
  const fullHtml = useMemo(
    () => wrapHtml(rendered, active.name.replace(/\.md$/i, ""), baseTheme, typographyOverrides),
    [rendered, active.name, baseTheme, typographyOverrides],
  );

  const notify = useCallback((message: string, tone: NonNullable<Notice>["tone"] = "neutral") => {
    setNotice({ message, tone });
    window.setTimeout(() => setNotice(null), 2200);
  }, []);

  const saveContentBlock = useCallback((draft: ContentBlockDraft) => {
    const existing = draft.id ? contentBlocks.find((item) => item.id === draft.id) : undefined;
    const nextBlock = existing
      ? {
          ...existing,
          title: draft.title,
          command: draft.command,
          content: draft.content,
          updatedAt: Date.now(),
        }
      : createContentBlock(draft.title, draft.command, draft.content);
    const next = [
      nextBlock,
      ...contentBlocks.filter((item) => item.id !== nextBlock.id),
    ];
    if (!saveContentBlocks(next)) {
      notify("内容块保存失败：本地存储空间不足", "error");
      return;
    }
    setContentBlocks(next);
    notify(existing ? "内容块已更新" : "内容块已保存", "success");
  }, [contentBlocks, notify]);

  const deleteContentBlock = useCallback((id: string) => {
    const next = contentBlocks.filter((item) => item.id !== id);
    if (!saveContentBlocks(next)) {
      notify("内容块删除失败", "error");
      return;
    }
    setContentBlocks(next);
    notify("内容块已删除", "neutral");
  }, [contentBlocks, notify]);

  const readEditorSelection = useCallback((): string | null => {
    const selected = editorRef.current?.getSelectedText() ?? "";
    if (!selected.trim()) {
      notify("请先在编辑器中选择要保存的内容", "neutral");
      return null;
    }
    return selected;
  }, [notify]);

  const insertContentBlock = useCallback((content: string) => {
    if (viewMode === "preview") setViewMode("split");
    setActivePage("workspace");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => editorRef.current?.insertText(content));
    });
  }, [viewMode]);

  const updateActive = useCallback((content: string) => {
    setDocuments((items) => items.map((item) => item.id === activeId ? { ...item, content } : item));
  }, [activeId]);

  const updateActiveCursor = useCallback((cursorPosition: number) => {
    setDocuments((items) => items.map((item) => (
      item.id === activeId && item.cursorPosition !== cursorPosition
        ? { ...item, cursorPosition }
        : item
    )));
  }, [activeId]);

  const jumpToHeading = useCallback((position: number) => {
    if (viewMode === "preview") setViewMode("split");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => editorRef.current?.scrollToPosition(position));
    });
  }, [viewMode]);

  const importArticleImages = useCallback(async (images: ArticleImageInput[]): Promise<string[]> => {
    if (!active.path || active.externalState === "deleted") {
      notify("请先保存当前文章，再粘贴或拖入图片", "error");
      return [];
    }
    if (!("__TAURI_INTERNALS__" in window)) {
      notify("图片落盘功能需要在文染桌面应用中使用", "error");
      return [];
    }

    const markdownImages: string[] = [];
    const storedImages: StoredArticleImage[] = [];
    let failedCount = 0;
    let lastError = "";
    for (const image of images) {
      try {
        const stored = await invoke<StoredArticleImage>("save_article_image", {
          documentPath: active.path,
          storageDirectory: imageSettings.storageMode === "custom"
            ? imageSettings.customDirectory
            : null,
          sourcePath: image.kind === "file" ? image.path : null,
          originalName: image.kind === "clipboard" ? image.name : null,
          mimeType: image.kind === "clipboard" ? image.mimeType : null,
          dataBase64: image.kind === "clipboard" ? image.dataBase64 : null,
          compress: imageSettings.compress,
          maxDimension: imageSettings.maxDimension,
          jpegQuality: imageSettings.jpegQuality,
        });
        storedImages.push(stored);
        markdownImages.push(
          `![${createMarkdownImageAlt(stored.fileName)}](${createMarkdownImageDestination(stored.relativePath)})`,
        );
      } catch (error) {
        failedCount += 1;
        lastError = String(error);
        console.error("图片导入失败", error);
      }
    }

    const containingDirectory = directories.find((directory) => (
      directory.id === active.directoryId || isPathInside(active.path!, directory.path)
    ));
    if (containingDirectory && storedImages.length > 0) {
      void invoke<Omit<OpenDirectory, "id">>("scan_directory", {
        directoryPath: containingDirectory.path,
      }).then((tree) => {
        setDirectories((items) => items.map((item) => (
          item.id === containingDirectory.id ? { ...tree, id: item.id } : item
        )));
      });
    }

    if (storedImages.length > 0) {
      const originalBytes = storedImages.reduce((sum, image) => sum + image.originalSize, 0);
      const savedBytes = storedImages.reduce((sum, image) => sum + image.savedSize, 0);
      const savedDetail = imageSettings.compress && savedBytes < originalBytes
        ? `，减少 ${formatImageFileSize(originalBytes - savedBytes)}`
        : "";
      const failedDetail = failedCount > 0 ? `；${failedCount} 张失败` : "";
      notify(
        `已保存 ${storedImages.length} 张图片${savedDetail}${failedDetail}`,
        failedCount > 0 ? "neutral" : "success",
      );
    } else {
      const detail = failedCount === 1 && lastError ? `：${lastError}` : `（${failedCount} 张）`;
      notify(`图片导入失败${detail}`, "error");
    }
    return markdownImages;
  }, [active.directoryId, active.externalState, active.path, directories, imageSettings, notify]);

  const chooseImageStorageDirectory = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择图片存放目录",
      });
      if (!selected || Array.isArray(selected)) return;
      setImageSettings((settings) => ({
        ...settings,
        storageMode: "custom",
        customDirectory: selected,
      }));
    } catch (error) {
      notify(`选择图片目录失败：${String(error)}`, "error");
    }
  }, [notify]);

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

  const createMarkdownInDirectory = async (name: string): Promise<boolean> => {
    if (!newMarkdownRequest) return false;
    const request = newMarkdownRequest;
    try {
      const created = await invoke<CreatedMarkdownFile>("create_markdown_file", {
        directoryPath: request.directoryPath,
        fileName: name,
      });
      const rootDirectory = directories.find((directory) => directory.id === request.directoryId);
      if (!rootDirectory) {
        notify("目录已关闭，无法创建文件", "error");
        return false;
      }
      const tree = await invoke<Omit<OpenDirectory, "id">>("scan_directory", {
        directoryPath: rootDirectory.path,
      });
      setDirectories((items) => items.map((directory) => (
        directory.id === request.directoryId ? { ...tree, id: directory.id } : directory
      )));
      const id = createId();
      setDocuments((items) => [...items, {
        ...createWorkspaceDocument(id, created.path, fileName(created.path), created.snapshot),
        directoryId: request.directoryId,
      }]);
      setActiveId(id);
      setActivePage("workspace");
      setNewMarkdownRequest(null);
      notify(`已在「${request.directoryName}」中创建 ${fileName(created.path)}`, "success");
      return true;
    } catch (error) {
      notify(`创建文件失败：${String(error)}`, "error");
      return false;
    }
  };

  const openMarkdownPaths = useCallback(async (paths: string[], promoteToStandalone = false) => {
    try {
      let currentDocuments = documentsRef.current;
      for (const path of paths) {
        const existing = currentDocuments.find((item) => item.path === path);
        if (existing) {
          if (promoteToStandalone && existing.directoryId) {
            // 用户从系统或文件选择器显式打开时，将文章提升为侧边栏“文件”区域的独立条目。
            currentDocuments = currentDocuments.map((item) => (
              item.id === existing.id ? { ...item, directoryId: undefined } : item
            ));
            documentsRef.current = currentDocuments;
            setDocuments(currentDocuments);
          }
          setActiveId(existing.id);
          continue;
        }
        const snapshot = await invoke<FileSnapshot>("read_file_snapshot", { filePath: path });
        const id = createId();
        currentDocuments = [
          ...currentDocuments,
          createWorkspaceDocument(id, path, fileName(path), snapshot),
        ];
        documentsRef.current = currentDocuments;
        setDocuments(currentDocuments);
        setActiveId(id);
      }
      if (paths.length > 0) setActivePage("workspace");
    } catch (error) {
      notify(`打开失败：${String(error)}`, "error");
    }
  }, [notify]);

  const openDocument = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "txt"] }],
      });
      if (!selected) return;
      await openMarkdownPaths(selected, true);
    } catch (error) {
      notify(`打开失败：${String(error)}`, "error");
    }
  };

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const collectPendingPaths = async () => {
      const paths = await invoke<string[]>("take_pending_open_files");
      if (disposed || paths.length === 0) return;
      setPendingSystemOpenPaths((current) => [...new Set([...current, ...paths])]);
    };

    void listen("markdown-files-open-requested", collectPendingPaths).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      unlisten = dispose;
      void collectPendingPaths();
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!workspaceReady || pendingSystemOpenPaths.length === 0) return;
    const paths = pendingSystemOpenPaths;
    setPendingSystemOpenPaths([]);
    systemOpenChain.current = systemOpenChain.current.then(
      () => openMarkdownPaths(paths, true),
    );
  }, [openMarkdownPaths, pendingSystemOpenPaths, workspaceReady]);

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

  const openTreeDocument = async (
    node: DirectoryNode,
    directoryId: string,
    cursorPosition?: number,
  ) => {
    if (!node.isMarkdown) return;
    const existing = documents.find((item) => item.path === node.path);
    if (existing) {
      if (cursorPosition !== undefined) {
        setDocuments((items) => items.map((item) => (
          item.id === existing.id ? { ...item, cursorPosition } : item
        )));
      }
      setActiveId(existing.id);
      if (cursorPosition !== undefined) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => editorRef.current?.scrollToPosition(cursorPosition));
        });
      }
      return;
    }
    try {
      const snapshot = await invoke<FileSnapshot>("read_file_snapshot", { filePath: node.path });
      const id = createId();
      setDocuments((items) => [...items, {
        ...createWorkspaceDocument(id, node.path, node.name, snapshot),
        directoryId,
        cursorPosition,
      }]);
      setActiveId(id);
      if (cursorPosition !== undefined) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => editorRef.current?.scrollToPosition(cursorPosition));
        });
      }
    } catch (error) {
      notify(`打开失败：${String(error)}`, "error");
    }
  };

  const openWorkspaceSearchResult = (target: WorkspaceSearchTarget) => {
    setActivePage("workspace");
    if (viewMode === "preview") setViewMode("split");
    if (target.documentId) {
      setDocuments((items) => items.map((item) => (
        item.id === target.documentId ? { ...item, cursorPosition: target.position } : item
      )));
      setActiveId(target.documentId);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => editorRef.current?.scrollToPosition(target.position));
      });
      return;
    }
    if (target.node && target.directoryId) {
      void openTreeDocument(target.node, target.directoryId, target.position);
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
          ...applyWorkspaceSnapshot(item, outcome.snapshot!),
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
    const copyRendered = renderMarkdown(
      active.content,
      baseTheme,
      codeTheme,
      (source) => {
        const localPath = resolveLocalArticleImagePath(source, active.path);
        return localPath ? `wenrender-local-image:${encodeURIComponent(localPath)}` : source;
      },
      typographyOverrides,
    );
    const embedded = await embedWorkspaceLocalImages(copyRendered);
    try {
      // 同时写入 HTML 与纯文本，让公众号编辑器优先读取带内联样式的版本。
      const blobHtml = new Blob([embedded.html], { type: "text/html" });
      const blobText = new Blob([active.content], { type: "text/plain" });
      await navigator.clipboard.write([new ClipboardItem({ "text/html": blobHtml, "text/plain": blobText })]);
      const detail = embedded.embeddedCount > 0
        ? `，已嵌入 ${embedded.embeddedCount} 张本地图片`
        : "";
      const failed = embedded.failedCount > 0
        ? `；${embedded.failedCount} 张图片转换失败`
        : "";
      notify(`已复制，可直接粘贴到公众号编辑器${detail}${failed}`, embedded.failedCount > 0 ? "neutral" : "success");
    } catch {
      await navigator.clipboard.writeText(
        wrapHtml(embedded.html, active.name.replace(/\.md$/i, ""), baseTheme, typographyOverrides),
      );
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
        ? { ...applyWorkspaceSnapshot(item, saveConflict.diskSnapshot!), recoveredDraft: false }
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
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSidebarOpen(true);
        setSidebarMode("search");
        setFocusMode(false);
        setActivePage("workspace");
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        setFocusMode((value) => !value);
        setActivePage("workspace");
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSidebarOpen(true);
        setSidebarMode("blocks");
        setFocusMode(false);
        setActivePage("workspace");
      }
      if (event.key === "Escape" && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, focusMode]);

  return (
    <Tooltip.Provider delayDuration={350}>
      <div className="flex h-screen min-w-[900px] flex-col overflow-hidden bg-[#f3f3f1] text-ink dark:bg-[#171815] dark:text-stone-100">
        <TitleBar />
        <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarOpen && !focusMode && sidebarMode === "files" && (
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
            onNewInDirectory={(directoryId, directoryPath, directoryName) => {
              setNewMarkdownRequest({ directoryId, directoryPath, directoryName });
            }}
            onOpenFiles={() => {
              setActivePage("workspace");
              void openDocument();
            }}
            onOpenFolder={() => {
              setActivePage("workspace");
              void openDirectory();
            }}
            onShowOutline={() => setSidebarMode("outline")}
            onShowSearch={() => setSidebarMode("search")}
          />
        )}
        {sidebarOpen && !focusMode && sidebarMode === "outline" && (
          <OutlineSidebar
            documentName={active.name}
            headings={headings}
            activeHeadingId={activeHeading?.id ?? null}
            onSelect={(heading) => jumpToHeading(heading.from)}
            onShowFiles={() => setSidebarMode("files")}
            onShowSearch={() => setSidebarMode("search")}
            onShowBlocks={() => setSidebarMode("blocks")}
          />
        )}
        {sidebarOpen && !focusMode && sidebarMode === "search" && (
          <WorkspaceSearchSidebar
            documents={documents}
            directories={directories}
            onOpenResult={openWorkspaceSearchResult}
            onShowFiles={() => setSidebarMode("files")}
            onShowOutline={() => setSidebarMode("outline")}
            onShowBlocks={() => setSidebarMode("blocks")}
          />
        )}
        {sidebarOpen && !focusMode && sidebarMode === "blocks" && (
          <ContentBlockSidebar
            blocks={contentBlocks}
            canCaptureSelection={effectiveViewMode !== "preview"}
            onReadSelection={readEditorSelection}
            onSave={saveContentBlock}
            onDelete={deleteContentBlock}
            onInsert={insertContentBlock}
            onShowFiles={() => setSidebarMode("files")}
            onShowOutline={() => setSidebarMode("outline")}
            onShowSearch={() => setSidebarMode("search")}
          />
        )}
        <div className={clsx("m-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-[#20211f]", sidebarOpen && !focusMode && "ml-0")}>
        <header className="flex h-14 shrink-0 items-center border-b border-stone-200 bg-white px-3 dark:border-stone-700 dark:bg-[#20211f]">
          {activePage === "settings" ? (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button className="icon-button" onClick={() => setActivePage("workspace")} aria-label="返回编辑器">
                  <ArrowLeft size={18} />
                </button>
                <span className="ml-1 text-sm font-semibold text-[#272825] dark:text-stone-100">设置</span>
              </div>
              {/* <button
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                onClick={() => setActivePage("workspace")}
              >
                返回编辑器
              </button> */}
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
            {/* <ToolbarButton label="打开文件" onClick={openDocument}><FolderOpen size={17} /></ToolbarButton> */}
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
            <ToolbarButton
              label="可复用内容块（Ctrl+Shift+K）"
              onClick={() => {
                setSidebarOpen(true);
                setSidebarMode("blocks");
                setFocusMode(false);
                setActivePage("workspace");
              }}
            >
              <Blocks size={17} />
            </ToolbarButton>
            <ToolbarButton
              label={focusMode ? "退出专注模式（Ctrl+Shift+M）" : "专注模式（Ctrl+Shift+M）"}
              onClick={() => {
                setFocusMode((value) => !value);
                setActivePage("workspace");
              }}
            >
              {focusMode ? <Minimize2 size={17} /> : <Focus size={17} />}
            </ToolbarButton>
            <div className="flex rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800">
              {([
                ["editor", Code2, "仅编辑"],
                ["split", SplitSquareHorizontal, "分栏"],
                ["preview", Eye, "仅预览"],
              ] as const).map(([mode, Icon, label]) => (
                <button key={mode} title={label} onClick={() => { setFocusMode(false); setViewMode(mode); }} className={clsx("rounded-md p-1.5 transition", effectiveViewMode === mode ? "bg-white text-[#20211f] shadow-sm dark:bg-stone-700 dark:text-stone-100" : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-200")}>
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
                  {/* <DropdownMenu.Item onSelect={newDocument} className="menu-item"><Menu size={15} />新建文章</DropdownMenu.Item> */}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
          </>
          )}
        </header>

        {activePage === "settings" ? (
          <SettingsPage
            colorScheme={colorScheme}
            onColorSchemeChange={setColorScheme}
            imageSettings={imageSettings}
            onImageSettingsChange={setImageSettings}
            onChooseImageStorageDirectory={chooseImageStorageDirectory}
          />
        ) : (
        <main className="relative flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1">
            {effectiveViewMode !== "preview" && (
              <section className={clsx("min-w-0", effectiveViewMode === "split" ? "w-1/2 border-r border-stone-200 dark:border-stone-700" : "w-full")}>
                <div className="flex h-10 items-center justify-between border-b border-stone-100 bg-[#fbfcfb] px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400 dark:border-stone-700 dark:bg-[#1f201e]">
                  <span>Markdown</span>
                  <div className="flex items-center gap-3 normal-case tracking-normal">
                    <span
                      title={`${articleStats.characters} 字符 · ${articleStats.words} 字词 · ${articleStats.paragraphs} 段 · ${articleStats.headings} 个标题 · ${articleStats.images} 张图片`}
                    >
                      {articleStats.words} 字词 · 约 {articleStats.readingMinutes} 分钟
                    </span>
                    <button
                      type="button"
                      className="rounded p-1 text-stone-400 transition hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                      title="查找与替换（Ctrl+F）"
                      aria-label="查找与替换"
                      onClick={() => editorRef.current?.openSearch()}
                    >
                      <Search size={13} />
                    </button>
                  </div>
                </div>
                <div className="h-[calc(100%-40px)]">
                  <Editor
                    ref={editorRef}
                    key={active.id}
                    value={active.content}
                    dark={darkInterface}
                    onChange={updateActive}
                    onImportImages={importArticleImages}
                    initialCursorPosition={active.cursorPosition}
                    onCursorPositionChange={updateActiveCursor}
                    contentBlocks={contentBlocks}
                    onScrollRatio={(ratio) => { if (syncScroll) previewRef.current?.scrollToRatio(ratio); }}
                  />
                </div>
              </section>
            )}
            {effectiveViewMode !== "editor" && (
              <section className={clsx("min-w-0", effectiveViewMode === "split" ? "w-1/2" : "w-full")}>
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
        </div>

        <AppDialogs
          pendingClose={pendingClose}
          saveConflict={saveConflict}
          conflictDocument={saveConflict
            ? documents.find((item) => item.id === saveConflict.documentId)
            : undefined}
          newMarkdownTarget={newMarkdownRequest}
          onCancelPendingClose={() => setPendingClose(null)}
          onDiscardPendingClose={() => {
            if (pendingClose) void finishPendingClose(pendingClose, true);
          }}
          onSavePendingClose={() => void saveAndFinishPendingClose()}
          onCancelConflict={() => setSaveConflict(null)}
          onSaveConflictAs={() => void saveConflictAs()}
          onReloadConflict={reloadConflictFromDisk}
          onOverwriteConflict={() => void overwriteConflict()}
          onCancelNewMarkdown={() => setNewMarkdownRequest(null)}
          onCreateNewMarkdown={createMarkdownInDirectory}
        />

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

export default App;
