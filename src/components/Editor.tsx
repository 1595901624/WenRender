import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";

type Props = {
  value: string;
  dark: boolean;
  onChange: (value: string) => void;
  onScrollRatio?: (ratio: number) => void;
};

export type EditorHandle = {
  scrollToRatio: (ratio: number) => void;
};

export const Editor = forwardRef<EditorHandle, Props>(function Editor({ value, dark, onChange, onScrollRatio }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();
  const appearance = useRef(new Compartment()).current;
  // 程序触发的同步滚动不再向预览回传，防止两个面板互相触发形成抖动。
  const suppressScroll = useRef(false);
  const onChangeRef = useRef(onChange);
  const onScrollRef = useRef(onScrollRatio);
  onChangeRef.current = onChange;
  onScrollRef.current = onScrollRatio;

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
          scroll: (_event, view) => {
            if (suppressScroll.current) return;
            const maximum = Math.max(1, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight);
            onScrollRef.current?.(view.scrollDOM.scrollTop / maximum);
          },
        }),
      ],
    });
    viewRef.current = new EditorView({ state, parent: host.current });
    return () => viewRef.current?.destroy();
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
