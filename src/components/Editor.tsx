import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";
import { openSearchPanel } from "@codemirror/search";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Blocks } from "lucide-react";
import type { ContentBlock } from "../lib/contentBlocks";
import type { ArticleImageInput } from "../types";

type Props = {
  value: string;
  dark: boolean;
  onChange: (value: string) => void;
  onScrollRatio?: (ratio: number) => void;
  onImportImages?: (images: ArticleImageInput[]) => Promise<string[]>;
  initialCursorPosition?: number;
  onCursorPositionChange?: (position: number) => void;
  contentBlocks?: ContentBlock[];
};

type SlashMenuState = {
  from: number;
  to: number;
  query: string;
  left: number;
  top: number;
};

export type EditorHandle = {
  scrollToRatio: (ratio: number) => void;
  scrollToPosition: (position: number) => void;
  getSelectedText: () => string;
  insertText: (text: string) => void;
  openSearch: () => void;
  focus: () => void;
};

export const Editor = forwardRef<EditorHandle, Props>(function Editor({
  value,
  dark,
  onChange,
  onScrollRatio,
  onImportImages,
  initialCursorPosition,
  onCursorPositionChange,
  contentBlocks = [],
}, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();
  const appearance = useRef(new Compartment()).current;
  // 程序触发的同步滚动不再向预览回传，防止两个面板互相触发形成抖动。
  const suppressScroll = useRef(false);
  const onChangeRef = useRef(onChange);
  const onScrollRef = useRef(onScrollRatio);
  const onImportImagesRef = useRef(onImportImages);
  const onCursorPositionRef = useRef(onCursorPositionChange);
  const contentBlocksRef = useRef(contentBlocks);
  const slashMenuRef = useRef<SlashMenuState | null>(null);
  const slashSelectionRef = useRef(0);
  const slashListRef = useRef<HTMLDivElement>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [slashSelection, setSlashSelection] = useState(0);
  onChangeRef.current = onChange;
  onScrollRef.current = onScrollRatio;
  onImportImagesRef.current = onImportImages;
  onCursorPositionRef.current = onCursorPositionChange;
  contentBlocksRef.current = contentBlocks;
  slashMenuRef.current = slashMenu;
  slashSelectionRef.current = slashSelection;

  const slashMatches = slashMenu
    ? findContentBlocks(contentBlocks, slashMenu.query)
    : [];

  useEffect(() => {
    const selected = slashListRef.current?.querySelector<HTMLElement>(
      `[data-slash-index="${slashSelection}"]`,
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [slashSelection]);

  useImperativeHandle(ref, () => ({
    scrollToRatio(ratio: number) {
      const view = viewRef.current;
      if (!view) return;
      const maximum = Math.max(0, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight);
      suppressScroll.current = true;
      view.scrollDOM.scrollTop = maximum * ratio;
      window.requestAnimationFrame(() => { suppressScroll.current = false; });
    },
    scrollToPosition(position: number) {
      const view = viewRef.current;
      if (!view) return;
      const anchor = Math.min(Math.max(0, position), view.state.doc.length);
      view.dispatch({
        selection: { anchor },
        effects: EditorView.scrollIntoView(anchor, { y: "start", yMargin: 56 }),
      });
      view.focus();
    },
    getSelectedText() {
      const view = viewRef.current;
      if (!view) return "";
      const selection = view.state.selection.main;
      return view.state.doc.sliceString(selection.from, selection.to);
    },
    insertText(text: string) {
      const view = viewRef.current;
      if (!view || !text) return;
      const selection = view.state.selection.main;
      const anchor = selection.from + text.length;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: text },
        selection: { anchor },
        effects: EditorView.scrollIntoView(anchor, { y: "center" }),
      });
      view.focus();
    },
    openSearch() {
      const view = viewRef.current;
      if (!view) return;
      openSearchPanel(view);
    },
    focus() {
      viewRef.current?.focus();
    },
  }), []);

  useEffect(() => {
    if (!host.current) return;
    // CodeMirror 实例只创建一次，回调通过 ref 获取最新值，避免每次输入都重建编辑器。
    const closeSlashMenu = () => {
      slashMenuRef.current = null;
      setSlashMenu(null);
      slashSelectionRef.current = 0;
      setSlashSelection(0);
    };
    const refreshSlashMenu = (view: EditorView) => {
      const menu = detectSlashMenu(view, host.current);
      if (!menu) {
        closeSlashMenu();
        return;
      }
      slashMenuRef.current = menu;
      setSlashMenu(menu);
      slashSelectionRef.current = 0;
      setSlashSelection(0);
    };
    const insertSlashBlock = (view: EditorView, block: ContentBlock) => {
      const menu = slashMenuRef.current;
      if (!menu) return;
      applySlashBlock(view, menu, block.content);
      closeSlashMenu();
    };
    const handleSlashKey = (
      view: EditorView,
      action: "next" | "previous" | "insert" | "close",
    ): boolean => {
      const menu = slashMenuRef.current;
      if (!menu) return false;
      if (action === "close") {
        closeSlashMenu();
        return true;
      }
      const matches = findContentBlocks(contentBlocksRef.current, menu.query);
      if (matches.length === 0) return true;
      if (action === "next" || action === "previous") {
        const direction = action === "next" ? 1 : -1;
        const next = (slashSelectionRef.current + direction + matches.length) % matches.length;
        slashSelectionRef.current = next;
        setSlashSelection(next);
        return true;
      }
      insertSlashBlock(view, matches[slashSelectionRef.current] ?? matches[0]);
      return true;
    };

    const importImages = async (
      view: EditorView,
      images: ArticleImageInput[],
      selection: { from: number; to: number },
    ) => {
      if (images.length === 0 || !onImportImagesRef.current) return;
      view.dom.classList.add("wenrender-image-importing");
      try {
        const markdownImages = await onImportImagesRef.current(images);
        if (viewRef.current !== view || markdownImages.length === 0) return;
        insertImageMarkdown(view, markdownImages, selection);
      } finally {
        view.dom.classList.remove("wenrender-image-importing");
      }
    };

    const state = EditorState.create({
      doc: value,
      selection: {
        anchor: Math.min(Math.max(0, initialCursorPosition ?? 0), value.length),
      },
      extensions: [
        // basicSetup 的光标移动和换行命令也会处理这些按键；最高优先级确保斜杠菜单先消费它们。
        Prec.highest(keymap.of([
          { key: "ArrowDown", run: (view) => handleSlashKey(view, "next") },
          { key: "ArrowUp", run: (view) => handleSlashKey(view, "previous") },
          { key: "Enter", run: (view) => handleSlashKey(view, "insert") },
          { key: "Tab", run: (view) => handleSlashKey(view, "insert") },
          { key: "Escape", run: (view) => handleSlashKey(view, "close") },
        ])),
        basicSetup,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        EditorView.lineWrapping,
        appearance.of(editorAppearance(dark)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) {
            onCursorPositionRef.current?.(update.state.selection.main.head);
            refreshSlashMenu(update.view);
          }
        }),
        EditorView.domEventHandlers({
          paste: (event, view) => {
            const imageFiles = Array.from(event.clipboardData?.files ?? [])
              .filter(isImageFile);
            if (imageFiles.length === 0) return false;
            event.preventDefault();
            const selection = view.state.selection.main;
            void Promise.all(imageFiles.map(fileToClipboardImage))
              .then((images) => importImages(view, images, selection))
              .catch((error) => console.error("无法读取剪贴板图片", error));
            return true;
          },
          dragover: (event, view) => {
            if ("__TAURI_INTERNALS__" in window) return false;
            if (!hasDraggedImages(event.dataTransfer)) return false;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
            view.dom.classList.add("wenrender-image-drag");
            return true;
          },
          dragleave: (event, view) => {
            if (!view.dom.contains(event.relatedTarget as Node | null)) {
              view.dom.classList.remove("wenrender-image-drag");
            }
            return false;
          },
          drop: (event, view) => {
            if ("__TAURI_INTERNALS__" in window) return false;
            view.dom.classList.remove("wenrender-image-drag");
            const imageFiles = Array.from(event.dataTransfer?.files ?? [])
              .filter(isImageFile);
            if (imageFiles.length === 0) return false;
            event.preventDefault();
            const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
              ?? view.state.selection.main.from;
            void Promise.all(imageFiles.map(fileToClipboardImage))
              .then((images) => importImages(view, images, { from: position, to: position }))
              .catch((error) => console.error("无法读取拖入的图片", error));
            return true;
          },
          scroll: (_event, view) => {
            if (slashMenuRef.current) {
              window.requestAnimationFrame(() => refreshSlashMenu(view));
            }
            if (suppressScroll.current) return;
            const maximum = Math.max(1, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight);
            onScrollRef.current?.(view.scrollDOM.scrollTop / maximum);
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    if ((initialCursorPosition ?? 0) > 0) {
      window.requestAnimationFrame(() => {
        if (viewRef.current !== view) return;
        const anchor = view.state.selection.main.head;
        view.dispatch({ effects: EditorView.scrollIntoView(anchor, { y: "center" }) });
      });
    }
    let unlistenNativeDrop: (() => void) | undefined;
    if ("__TAURI_INTERNALS__" in window) {
      void getCurrentWebview().onDragDropEvent((event) => {
        if (viewRef.current !== view) return;
        if (event.payload.type === "leave") {
          view.dom.classList.remove("wenrender-image-drag");
          return;
        }
        const point = editorClientPoint(event.payload.position, view.dom.getBoundingClientRect());
        if (event.payload.type === "over") {
          view.dom.classList.toggle("wenrender-image-drag", point !== null);
          return;
        }
        view.dom.classList.remove("wenrender-image-drag");
        if (event.payload.type !== "drop" || !point) return;
        const paths = event.payload.paths.filter(isSupportedImagePath);
        if (paths.length === 0) return;
        const position = view.posAtCoords(point) ?? view.state.selection.main.from;
        void importImages(
          view,
          paths.map((path) => ({ kind: "file" as const, path })),
          { from: position, to: position },
        );
      }).then((dispose) => { unlistenNativeDrop = dispose; });
    }
    return () => {
      unlistenNativeDrop?.();
      viewRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // 切换软件主题时重新配置 CodeMirror 的语法高亮，避免暗色背景继续使用亮色配色。
    view.dispatch({ effects: appearance.reconfigure(editorAppearance(dark)) });
  }, [appearance, dark]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    // 切换左侧文件时，用外部文档内容替换当前 CodeMirror 文档。
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  const chooseSlashBlock = (block: ContentBlock) => {
    const view = viewRef.current;
    const menu = slashMenuRef.current;
    if (!view || !menu) return;
    applySlashBlock(view, menu, block.content);
    slashMenuRef.current = null;
    setSlashMenu(null);
    slashSelectionRef.current = 0;
    setSlashSelection(0);
  };

  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <div ref={host} className="h-full min-w-0 overflow-hidden" />
      {slashMenu && (
        <div
          className="absolute z-40 w-72 overflow-hidden rounded-xl border border-stone-200 bg-white p-1.5 shadow-[0_12px_36px_rgba(28,25,23,0.18)] dark:border-stone-700 dark:bg-[#292a27]"
          style={{ left: slashMenu.left, top: slashMenu.top }}
        >
          <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-1 text-[10px] font-medium text-stone-400">
            <Blocks size={12} />
            <span>{slashMenu.query ? `搜索“${slashMenu.query}”` : "插入内容块"}</span>
            <span className="ml-auto">↑↓ 选择 · Enter 插入</span>
          </div>
          {slashMatches.length === 0 ? (
            <div className="rounded-lg px-2 py-4 text-center text-xs text-stone-400">
              {contentBlocks.length === 0 ? "还没有内容块，请先在侧栏创建" : "没有匹配的内容块"}
            </div>
          ) : (
            <div ref={slashListRef} className="max-h-64 overflow-y-auto">
              {slashMatches.map((block, index) => (
                <button
                  key={block.id}
                  data-slash-index={index}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseSlashBlock(block)}
                  className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition ${
                    index === slashSelection
                      ? "bg-stone-100 dark:bg-stone-700"
                      : "hover:bg-stone-50 dark:hover:bg-stone-800"
                  }`}
                >
                  <Blocks size={14} className="mt-0.5 shrink-0 text-stone-400" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-700 dark:text-stone-200">{block.title}</span>
                      <span className="max-w-28 truncate font-mono text-[9px] text-stone-400">/{block.command}</span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-stone-400">{block.content}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function detectSlashMenu(view: EditorView, host: HTMLDivElement | null): SlashMenuState | null {
  if (!host) return null;
  const selection = view.state.selection.main;
  if (!selection.empty) return null;
  const line = view.state.doc.lineAt(selection.head);
  const beforeCursor = view.state.doc.sliceString(line.from, selection.head);
  const match = beforeCursor.match(/(?:^|\s)\/([^/]*)$/u);
  if (!match || match.index === undefined) return null;
  const slashOffset = match.index + match[0].lastIndexOf("/");
  const coordinates = view.coordsAtPos(selection.head);
  if (!coordinates) return null;
  const bounds = host.getBoundingClientRect();
  const menuWidth = 288;
  const menuHeight = 280;
  const left = Math.min(
    Math.max(8, coordinates.left - bounds.left),
    Math.max(8, bounds.width - menuWidth - 8),
  );
  const below = coordinates.bottom - bounds.top + 6;
  const top = below + menuHeight <= bounds.height
    ? below
    : Math.max(8, coordinates.top - bounds.top - menuHeight - 6);
  return {
    from: line.from + slashOffset,
    to: selection.head,
    query: match[1],
    left,
    top,
  };
}

function findContentBlocks(blocks: ContentBlock[], rawQuery: string): ContentBlock[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return blocks.slice(0, 8);
  return blocks
    .map((block, index) => {
      const command = block.command.toLocaleLowerCase();
      const title = block.title.toLocaleLowerCase();
      const content = block.content.toLocaleLowerCase();
      const score = command === query
        ? 0
        : command.startsWith(query)
          ? 1
          : command.includes(query)
            ? 2
            : title.includes(query)
              ? 3
              : content.includes(query)
                ? 4
                : Number.POSITIVE_INFINITY;
      return { block, index, score };
    })
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((item) => item.block)
    .slice(0, 8);
}

function applySlashBlock(view: EditorView, menu: SlashMenuState, content: string) {
  const anchor = menu.from + content.length;
  view.dispatch({
    changes: { from: menu.from, to: menu.to, insert: content },
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: "center" }),
  });
  view.focus();
}

function editorAppearance(dark: boolean) {
  return [
    EditorView.theme(
      {
        "&": { height: "100%", backgroundColor: "var(--editor-background)", color: "var(--editor-foreground)", fontSize: "15px" },
        ".cm-scroller": { fontFamily: "Consolas, 'SFMono-Regular', Menlo, monospace", lineHeight: "1.75", padding: "24px 8px 60px" },
        ".cm-content": { maxWidth: "760px", margin: "0 auto", caretColor: "#2f8f5b" },
        "&.wenrender-image-drag": {
          boxShadow: "inset 0 0 0 2px #2f8f5b",
          backgroundColor: "rgba(47, 143, 91, 0.06)",
        },
        "&.wenrender-image-importing": { cursor: "progress" },
        ".cm-gutters": { backgroundColor: "var(--editor-background)", color: "var(--editor-gutter)", border: "none" },
        // CodeMirror 的选区层位于文本和活动行下方，活动行必须使用透明色，否则会遮住选区。
        ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--editor-active-line)" },
        // 分别覆盖失焦和聚焦选区；不要改原生 ::selection，drawSelection 会主动隐藏它。
        ".cm-selectionBackground": { backgroundColor: "var(--editor-selection) !important" },
        "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
          backgroundColor: "var(--editor-selection-focused) !important",
        },
      },
      { dark },
    ),
    syntaxHighlighting(dark ? darkMarkdownHighlightStyle : defaultHighlightStyle),
  ];
}

// 使用当前 CodeMirror 实例创建暗色高亮，避免第三方主题携带的重复依赖破坏扩展识别。
const darkMarkdownHighlightStyle = HighlightStyle.define(
  [
    { tag: tags.keyword, color: "#c678dd" },
    { tag: [tags.name, tags.propertyName, tags.macroName], color: "#e06c75" },
    { tag: [tags.function(tags.variableName), tags.labelName], color: "#61afef" },
    { tag: [tags.typeName, tags.className], color: "#56b6c2" },
    { tag: [tags.number, tags.bool, tags.atom], color: "#d19a66" },
    { tag: [tags.string, tags.character], color: "#98c379" },
    { tag: tags.comment, color: "#8b938b", fontStyle: "italic" },
    // Markdown 中的 ##、**、列表前缀和链接括号都属于 processingInstruction。
    { tag: tags.processingInstruction, color: "#98c379" },
    { tag: [tags.url, tags.link], color: "#67c7e8", textDecoration: "underline" },
    { tag: tags.heading, color: "#f1f3f1", fontWeight: "700" },
    { tag: tags.strong, color: "#f1f3f1", fontWeight: "700" },
    { tag: tags.emphasis, color: "#e5e7e5", fontStyle: "italic" },
    { tag: [tags.meta, tags.punctuation], color: "#b0b8b2" },
    { tag: tags.invalid, color: "#ff6b6b" },
  ],
  { themeType: "dark" },
);

function insertImageMarkdown(
  view: EditorView,
  markdownImages: string[],
  selection: { from: number; to: number },
) {
  const from = Math.min(selection.from, view.state.doc.length);
  const to = Math.min(Math.max(selection.to, from), view.state.doc.length);
  const before = from > 0 ? view.state.doc.sliceString(from - 1, from) : "";
  const after = to < view.state.doc.length ? view.state.doc.sliceString(to, to + 1) : "";
  const prefix = before && before !== "\n" ? "\n\n" : "";
  const suffix = after && after !== "\n" ? "\n\n" : "";
  const insert = `${prefix}${markdownImages.join("\n\n")}${suffix}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length - suffix.length },
    scrollIntoView: true,
  });
  view.focus();
}

function hasDraggedImages(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.items).some((item) => (
    item.kind === "file" && (item.type.startsWith("image/") || item.type === "")
  ));
}

async function fileToClipboardImage(file: File): Promise<ArticleImageInput> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取图片"));
    reader.readAsDataURL(file);
  });
  return {
    kind: "clipboard",
    name: file.name || null,
    mimeType: file.type || mimeTypeFromName(file.name),
    dataBase64: dataUrl,
  };
}

function isSupportedImagePath(path: string): boolean {
  return /\.(?:png|jpe?g|gif|webp|svg|bmp|avif|ico|tiff?)$/i.test(path);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || isSupportedImagePath(file.name);
}

function mimeTypeFromName(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase();
  return ({
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    avif: "image/avif",
    ico: "image/x-icon",
    tif: "image/tiff",
    tiff: "image/tiff",
  } as Record<string, string>)[extension ?? ""] ?? "";
}

function editorClientPoint(
  position: { x: number; y: number },
  bounds: DOMRect,
): { x: number; y: number } | null {
  // Tauri 的原生拖放位置使用物理像素；浏览器布局使用 CSS 像素。
  // 不同平台的实现并不完全一致，因此同时检查缩放前后的坐标。
  const scale = window.devicePixelRatio || 1;
  const candidates = [
    { x: position.x / scale, y: position.y / scale },
    { x: position.x, y: position.y },
  ];
  return candidates.find(({ x, y }) => (
    x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom
  )) ?? null;
}
