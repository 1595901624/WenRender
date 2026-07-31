import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import clsx from "clsx";
import { applyWechatDarkMode } from "../lib/wechatDarkMode";

export type PreviewHandle = {
  scrollToRatio: (ratio: number) => void;
};

export type PreviewMode = "web" | "phone";
export type PreviewColorScheme = "light" | "dark";

type Props = {
  html: string;
  mode: PreviewMode;
  colorScheme: PreviewColorScheme;
  onScrollRatio?: (ratio: number) => void;
};

const phoneWidth = 430;
const phoneHeight = 902;

export const Preview = forwardRef<PreviewHandle, Props>(function Preview({ html, mode, colorScheme, onScrollRatio }, ref) {
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
      const scrollElement = getScrollElement(document);
      if (scrollElement) {
        const maximum = getMaximumScroll(scrollElement, document);
        if (maximum > 0) pendingScrollRatio.current = scrollElement.scrollTop / maximum;
      }
    }
    iframe.srcdoc = html;
  }, [html, colorScheme]);

  useImperativeHandle(ref, () => ({
    scrollToRatio(ratio: number) {
      const window = frame.current?.contentWindow;
      const document = frame.current?.contentDocument;
      if (!window || !document) return;
      const scrollElement = getScrollElement(document);
      if (!scrollElement) return;
      const maximum = getMaximumScroll(scrollElement, document);
      suppressScroll.current = true;
      scrollElement.scrollTop = maximum * ratio;
      requestAnimationFrame(() => { suppressScroll.current = false; });
    },
  }), []);

  const connectScroll = () => {
    const window = frame.current?.contentWindow;
    const document = frame.current?.contentDocument;
    if (!window || !document) return;
    if (colorScheme === "dark") {
      try {
        applyWechatDarkMode(document);
      } catch (error) {
        console.error("应用微信暗黑模式失败", error);
      }
    }
    // 每次 srcdoc 重载后 iframe 的 window 会变化，因此必须在 onLoad 中重新绑定。
    const reportScroll = () => {
      if (suppressScroll.current) return;
      const scrollElement = getScrollElement(document);
      if (!scrollElement) return;
      const maximum = Math.max(1, getMaximumScroll(scrollElement, document));
      onScrollRef.current?.(scrollElement.scrollTop / maximum);
    };
    // 不同 WebView 会把 iframe 的页面滚动事件派发给不同目标；全部监听以确保反向同步。
    const scrollElement = getScrollElement(document);
    scrollElement?.addEventListener("scroll", reportScroll, { passive: true });
    document.addEventListener("scroll", reportScroll, { passive: true });
    window.addEventListener("scroll", reportScroll, { passive: true });
    if (pendingScrollRatio.current !== null) {
      const ratio = pendingScrollRatio.current;
      pendingScrollRatio.current = null;
      const scrollElement = getScrollElement(document);
      if (!scrollElement) return;
      const maximum = getMaximumScroll(scrollElement, document);
      suppressScroll.current = true;
      scrollElement.scrollTop = maximum * ratio;
      requestAnimationFrame(() => { suppressScroll.current = false; });
    }
  };

  return (
    <div
      ref={container}
      className={clsx(
        "grid h-full place-items-center overflow-hidden px-5 py-5 transition-colors",
        colorScheme === "dark" ? "bg-[#111210]" : "bg-[#f7f7f5]",
      )}
    >
      <div
        className={mode === "web" ? "h-full w-full max-w-[720px]" : "relative"}
        style={mode === "phone" ? { width: phoneWidth * phoneScale, height: phoneHeight * phoneScale } : undefined}
      >
        <div
          className={mode === "phone"
            ? "absolute left-0 top-0 rounded-[58px] border border-black bg-[#0b0b0c] p-[14px] shadow-[0_24px_70px_rgba(0,0,0,0.28),inset_0_0_0_2px_rgba(255,255,255,0.08)]"
            : clsx(
                "h-full w-full overflow-hidden rounded-xl shadow-soft ring-1",
                colorScheme === "dark" ? "bg-[#191919] ring-white/10" : "bg-white ring-black/5",
              )}
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
            ? clsx(
                "relative h-[874px] w-[402px] overflow-hidden rounded-[45px] ring-1 ring-white/10",
                colorScheme === "dark" ? "bg-[#191919]" : "bg-white",
              )
            : "h-full w-full overflow-hidden"}>
            {mode === "phone" && (
              <>
                <div className={clsx(
                  "absolute inset-x-0 top-0 z-10 h-[52px] transition-colors",
                  colorScheme === "dark" ? "bg-[#191919]" : "bg-white",
                )}>
                  <span className={clsx(
                    "absolute left-7 top-[17px] text-[14px] font-semibold tracking-tight",
                    colorScheme === "dark" ? "text-white" : "text-black",
                  )}>9:41</span>
                  <span className="absolute left-1/2 top-[10px] h-[34px] w-[112px] -translate-x-1/2 rounded-full bg-black shadow-sm" />
                  <span className={clsx(
                    "absolute right-7 top-[19px] h-[12px] w-[22px] rounded-[4px] border-2",
                    colorScheme === "dark" ? "border-white" : "border-black",
                  )}>
                    <span className={clsx(
                      "absolute inset-[2px] right-[3px] rounded-[1px]",
                      colorScheme === "dark" ? "bg-white" : "bg-black",
                    )} />
                  </span>
                  <span className={clsx(
                    "absolute right-[23px] top-[23px] h-[5px] w-[2px] rounded-r",
                    colorScheme === "dark" ? "bg-white" : "bg-black",
                  )} />
                </div>
                <span className={clsx(
                  "absolute bottom-2.5 left-1/2 z-10 h-[5px] w-[134px] -translate-x-1/2 rounded-full",
                  colorScheme === "dark" ? "bg-white/80" : "bg-black/80",
                )} />
              </>
            )}
            <iframe
              ref={frame}
              onLoad={connectScroll}
              title={mode === "phone" ? "iPhone 17 微信文章预览" : "网页微信文章预览"}
              className={mode === "phone"
                ? clsx(
                    "absolute inset-x-0 bottom-[22px] top-[52px] block h-[800px] w-full border-0",
                    colorScheme === "dark" ? "bg-[#191919]" : "bg-white",
                  )
                : clsx("block h-full w-full border-0", colorScheme === "dark" ? "bg-[#191919]" : "bg-white")}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

function getScrollElement(document: Document): HTMLElement | null {
  return document.scrollingElement as HTMLElement | null ?? document.documentElement;
}

function getMaximumScroll(scrollElement: HTMLElement, document: Document): number {
  // 部分 WebView 将页面滚动高度保存在 body，取两者较大值可兼容网页和手机预览。
  const contentHeight = Math.max(scrollElement.scrollHeight, document.body?.scrollHeight ?? 0);
  return Math.max(0, contentHeight - scrollElement.clientHeight);
}
