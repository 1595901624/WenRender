import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export type PreviewHandle = {
  scrollToRatio: (ratio: number) => void;
};

export type PreviewMode = "web" | "phone";

type Props = {
  html: string;
  mode: PreviewMode;
  onScrollRatio?: (ratio: number) => void;
};

const phoneWidth = 430;
const phoneHeight = 902;

export const Preview = forwardRef<PreviewHandle, Props>(function Preview({ html, mode, onScrollRatio }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const suppressScroll = useRef(false);
  const pendingScrollRatio = useRef<number | null>(null);
  const [phoneScale, setPhoneScale] = useState(1);
  const onScrollRef = useRef(onScrollRatio);
  onScrollRef.current = onScrollRatio;

  useEffect(() => {
    const element = container.current;
    if (!element || mode !== "phone") return;
    // iframe 始终保持 iPhone 17 的 402×874 逻辑屏幕，只缩放外观，避免文章宽度随窗口变化。
    const updateScale = () => {
      const horizontal = Math.max(0, element.clientWidth - 32) / phoneWidth;
      const vertical = Math.max(0, element.clientHeight - 32) / phoneHeight;
      setPhoneScale(Math.min(1, horizontal, vertical));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    // iframe 隔离文章样式，确保主题的内联 CSS 不会污染应用界面。
    const iframe = frame.current;
    if (!iframe) return;
    const window = iframe.contentWindow;
    const document = iframe.contentDocument;
    if (window && document) {
      const root = document.documentElement;
      if (root) {
        const maximum = Math.max(0, root.scrollHeight - root.clientHeight);
        if (maximum > 0) pendingScrollRatio.current = window.scrollY / maximum;
      }
    }
    iframe.srcdoc = html;
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
    if (pendingScrollRatio.current !== null) {
      const ratio = pendingScrollRatio.current;
      pendingScrollRatio.current = null;
      const maximum = Math.max(0, root.scrollHeight - root.clientHeight);
      suppressScroll.current = true;
      window.scrollTo({ top: maximum * ratio });
      requestAnimationFrame(() => { suppressScroll.current = false; });
    }
  };

  return (
    <div
      ref={container}
      className="grid h-full place-items-center overflow-hidden bg-[#f7f7f5] px-5 py-5 dark:bg-[#181916]"
    >
      <div
        className={mode === "web" ? "h-full w-full max-w-[720px]" : "relative"}
        style={mode === "phone" ? { width: phoneWidth * phoneScale, height: phoneHeight * phoneScale } : undefined}
      >
        <div
          className={mode === "phone"
            ? "absolute left-0 top-0 rounded-[58px] border border-black bg-[#0b0b0c] p-[14px] shadow-[0_24px_70px_rgba(0,0,0,0.28),inset_0_0_0_2px_rgba(255,255,255,0.08)]"
            : "h-full w-full overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-black/5 dark:ring-white/10"}
          style={mode === "phone"
            ? {
                width: phoneWidth,
                height: phoneHeight,
                transform: `scale(${phoneScale})`,
                transformOrigin: "top left",
              }
            : undefined}
        >
          {mode === "phone" && (
            <>
              <span className="absolute -left-[4px] top-[132px] h-[34px] w-[4px] rounded-l-md bg-[#343437]" />
              <span className="absolute -left-[4px] top-[184px] h-[72px] w-[4px] rounded-l-md bg-[#343437]" />
              <span className="absolute -left-[4px] top-[270px] h-[72px] w-[4px] rounded-l-md bg-[#343437]" />
              <span className="absolute -right-[4px] top-[202px] h-[112px] w-[4px] rounded-r-md bg-[#343437]" />
            </>
          )}
          <div className={mode === "phone"
            ? "relative h-[874px] w-[402px] overflow-hidden rounded-[45px] bg-white ring-1 ring-white/10"
            : "h-full w-full overflow-hidden"}>
            {mode === "phone" && (
              <>
                <div className="absolute inset-x-0 top-0 z-10 h-[52px] bg-white">
                  <span className="absolute left-7 top-[17px] text-[14px] font-semibold tracking-tight text-black">9:41</span>
                  <span className="absolute left-1/2 top-[10px] h-[34px] w-[112px] -translate-x-1/2 rounded-full bg-black shadow-sm" />
                  <span className="absolute right-7 top-[19px] h-[12px] w-[22px] rounded-[4px] border-2 border-black">
                    <span className="absolute inset-[2px] right-[3px] rounded-[1px] bg-black" />
                  </span>
                  <span className="absolute right-[23px] top-[23px] h-[5px] w-[2px] rounded-r bg-black" />
                </div>
                <span className="absolute bottom-2.5 left-1/2 z-10 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-black/80" />
              </>
            )}
            <iframe
              ref={frame}
              onLoad={connectScroll}
              title={mode === "phone" ? "iPhone 17 微信文章预览" : "网页微信文章预览"}
              className={mode === "phone"
                ? "absolute inset-x-0 bottom-[22px] top-[52px] block h-[800px] w-full border-0 bg-white"
                : "block h-full w-full border-0 bg-white"}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
