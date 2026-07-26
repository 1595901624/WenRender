import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type PreviewHandle = {
  scrollToRatio: (ratio: number) => void;
};

type Props = {
  html: string;
  onScrollRatio?: (ratio: number) => void;
};

export const Preview = forwardRef<PreviewHandle, Props>(function Preview({ html, onScrollRatio }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  const suppressScroll = useRef(false);
  const onScrollRef = useRef(onScrollRatio);
  onScrollRef.current = onScrollRatio;

  useEffect(() => {
    // iframe 隔离文章样式，确保主题的内联 CSS 不会污染应用界面。
    if (frame.current) frame.current.srcdoc = html;
  }, [html]);

  useImperativeHandle(ref, () => ({
    scrollToRatio(ratio: number) {
      const window = frame.current?.contentWindow;
      const document = frame.current?.contentDocument;
      if (!window || !document) return;
      const root = document.documentElement;
      if (!root) return;
      const maximum = Math.max(0, root.scrollHeight - root.clientHeight);
      suppressScroll.current = true;
      window.scrollTo({ top: maximum * ratio });
      requestAnimationFrame(() => { suppressScroll.current = false; });
    },
  }), []);

  const connectScroll = () => {
    const window = frame.current?.contentWindow;
    const document = frame.current?.contentDocument;
    if (!window || !document) return;
    const root = document.documentElement;
    if (!root) return;
    // 每次 srcdoc 重载后 iframe 的 window 会变化，因此必须在 onLoad 中重新绑定。
    window.onscroll = () => {
      if (suppressScroll.current) return;
      const maximum = Math.max(1, root.scrollHeight - root.clientHeight);
      onScrollRef.current?.(window.scrollY / maximum);
    };
  };

  return (
    <div className="h-full overflow-hidden bg-[#f7f7f5] px-5 py-5 dark:bg-[#181916]">
      <div className="mx-auto h-full max-w-[720px] overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-black/5 dark:ring-white/10">
        <iframe ref={frame} onLoad={connectScroll} title="微信文章预览" className="block h-full w-full border-0 bg-white" />
      </div>
    </div>
  );
});
