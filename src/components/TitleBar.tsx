import { Maximize2, Minus, Square, X } from "lucide-react";
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
export function TitleBar() {
  const platform = getDesktopPlatform();
  const isMacOS = platform === "macos";
  const [isMacControlsHovered, setIsMacControlsHovered] = useState(false);

  const run = (action: () => Promise<void>) => {
    if (isTauriWindow()) void action();
  };

  const toggleMaximize = () => run(() => getCurrentWindow().toggleMaximize());
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
        aria-label="最大化或还原窗口"
        title="最大化/还原"
      >
        {isMacOS ? <Maximize2 className="mac-window-symbol" size={8} strokeWidth={2.2} /> : <Square size={13} strokeWidth={1.8} />}
      </button>
    </div>
  );

  return (
    <div
      className={`titlebar titlebar-${platform}`}
      data-tauri-drag-region
      onMouseDown={(event) => {
        const clickedControl = event.target instanceof Element && event.target.closest(".window-controls");
        if (event.button === 0 && !clickedControl) startDragging();
      }}
      onDoubleClick={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest(".window-controls")) toggleMaximize();
      }}
    >
      {isMacOS && controls}
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="titlebar-name">文染</span>
        {/* <span className="titlebar-subtitle">Markdown 编辑器</span> */}
      </div>
      {!isMacOS && controls}
    </div>
  );
}
