import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { ArticleImageInput } from "../types";

type Props = {
  value: string;
  dark: boolean;
  onChange: (value: string) => void;
  onScrollRatio?: (ratio: number) => void;
  onImportImages?: (images: ArticleImageInput[]) => Promise<string[]>;
};

export type EditorHandle = {
  scrollToRatio: (ratio: number) => void;
};

export const Editor = forwardRef<EditorHandle, Props>(function Editor({
  value,
  dark,
  onChange,
  onScrollRatio,
  onImportImages,
}, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();
  const appearance = useRef(new Compartment()).current;
  // 程序触发的同步滚动不再向预览回传，防止两个面板互相触发形成抖动。
  const suppressScroll = useRef(false);
  const onChangeRef = useRef(onChange);
  const onScrollRef = useRef(onScrollRatio);
  const onImportImagesRef = useRef(onImportImages);
  onChangeRef.current = onChange;
  onScrollRef.current = onScrollRatio;
  onImportImagesRef.current = onImportImages;

  useImperativeHandle(ref, () => ({
    scrollToRatio(ratio: number) {
      const view = viewRef.current;
      if (!view) return;
      const maximum = Math.max(0, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight);
      suppressScroll.current = true;
      view.scrollDOM.scrollTop = maximum * ratio;
      window.requestAnimationFrame(() => { suppressScroll.current = false; });
    },
  }), []);

  useEffect(() => {
    if (!host.current) return;
    // CodeMirror 实例只创建一次，回调通过 ref 获取最新值，避免每次输入都重建编辑器。
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
      extensions: [
        basicSetup,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        keymap.of([]),
        EditorView.lineWrapping,
        appearance.of(editorAppearance(dark)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
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
            if (suppressScroll.current) return;
            const maximum = Math.max(1, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight);
            onScrollRef.current?.(view.scrollDOM.scrollTop / maximum);
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
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

  return <div ref={host} className="h-full min-w-0 overflow-hidden" />;
});

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
