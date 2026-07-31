import { Copy, Maximize2, Minus, Search, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useState } from "react";

type DesktopPlatform = "macos" | "windows" | "linux";

function getDesktopPlatform(): DesktopPlatform {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac")) return "macos";
  if (userAgent.includes("win")) return "windows";
  return "linux";
}

function isTauriWindow() {
  return "__TAURI_INTERNALS__" in window;
}

/** Native-window controls with platform-appropriate placement and appearance. */
export function TitleBar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const platform = getDesktopPlatform();
  const isMacOS = platform === "macos";
  const [isMacControlsHovered, setIsMacControlsHovered] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const run = (action: () => Promise<void>) => {
    if (isTauriWindow()) void action();
  };

  const toggleMaximize = () => {
    if (!isTauriWindow()) return;
    void (async () => {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized());
    })();
  };
  const startDragging = () => run(() => getCurrentWindow().startDragging());

  const controls = (
    <div
      className={`window-controls${isMacControlsHovered ? " mac-controls-hovered" : ""}`}
      aria-label="窗口控制"
      onMouseEnter={() => setIsMacControlsHovered(true)}
      onMouseLeave={() => setIsMacControlsHovered(false)}
    >
      <button
        className={isMacOS ? "window-control window-close mac-close" : "window-control window-close"}
        data-tauri-drag-region="false"
        onClick={() => run(() => getCurrentWindow().close())}
        aria-label="关闭窗口"
        title="关闭"
      >
        {isMacOS ? <X className="mac-window-symbol" size={8} strokeWidth={2.4} /> : <X size={16} strokeWidth={1.8} />}
      </button>
      <button
        className={isMacOS ? "window-control mac-minimize" : "window-control"}
        data-tauri-drag-region="false"
        onClick={() => run(() => getCurrentWindow().minimize())}
        aria-label="最小化窗口"
        title="最小化"
      >
        {isMacOS ? <Minus className="mac-window-symbol" size={8} strokeWidth={2.4} /> : <Minus size={16} strokeWidth={1.8} />}
      </button>
      <button
        className={isMacOS ? "window-control mac-maximize" : "window-control"}
        data-tauri-drag-region="false"
        onClick={toggleMaximize}
        aria-label={isMaximized ? "还原窗口" : "最大化窗口"}
        title={isMaximized ? "还原" : "最大化"}
      >
        {isMacOS ? (
          <Maximize2 className="mac-window-symbol" size={8} strokeWidth={2.2} />
        ) : isMaximized ? (
          <Copy size={13} strokeWidth={1.8} />
        ) : (
          <Square size={13} strokeWidth={1.8} />
        )}
      </button>
    </div>
  );

  return (
    <div
      className={`titlebar titlebar-${platform}`}
      onMouseDown={(event) => {
        const clickedControl = event.target instanceof Element && event.target.closest(".window-controls, .titlebar-command");
        if (event.button !== 0 || clickedControl) return;

        const startX = event.clientX;
        const startY = event.clientY;
        const stopTracking = () => {
          document.removeEventListener("mousemove", handleMove);
          document.removeEventListener("mouseup", stopTracking);
        };
        const handleMove = (moveEvent: MouseEvent) => {
          const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
          if (distance < 4) return;
          stopTracking();
          startDragging();
        };

        document.addEventListener("mousemove", handleMove);
        document.addEventListener("mouseup", stopTracking);
      }}
      onDoubleClick={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest(".window-controls, .titlebar-command")) {
          event.preventDefault();
          toggleMaximize();
        }
      }}
    >
      {isMacOS && controls}
      <div className="titlebar-brand">
        <span className="titlebar-name">文染</span>
        {/* <span className="titlebar-subtitle">Markdown 编辑器</span> */}
      </div>
      <button
        type="button"
        className="titlebar-command"
        data-tauri-drag-region="false"
        onClick={onOpenCommandPalette}
        aria-label="打开命令面板"
        title="命令面板（Ctrl+K / ⌘K）"
      >
        <Search size={12} />
        <span>搜索命令</span>
        <kbd>Ctrl/⌘ K</kbd>
      </button>
      {!isMacOS && controls}
    </div>
  );
}
