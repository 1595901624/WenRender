import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function Editor({ value, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        keymap.of([]),
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { height: "100%", backgroundColor: "#fbfcfb", color: "#26302a", fontSize: "15px" },
          ".cm-scroller": { fontFamily: "Consolas, 'SFMono-Regular', Menlo, monospace", lineHeight: "1.75", padding: "24px 8px 60px" },
          ".cm-content": { maxWidth: "760px", margin: "0 auto", caretColor: "#2f8f5b" },
          ".cm-gutters": { backgroundColor: "#fbfcfb", color: "#a1aaa4", border: "none" },
          ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "#edf5ef" },
          "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "#cfe7d6 !important" },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    viewRef.current = new EditorView({ state, parent: host.current });
    return () => viewRef.current?.destroy();
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className="h-full min-w-0 overflow-hidden" />;
}
