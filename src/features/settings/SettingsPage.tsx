import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { Check, ExternalLink, FolderOpen, Github, Image as ImageIcon, Info, Monitor, Moon, Settings, Sun } from "lucide-react";
import clsx from "clsx";
import appLogoUrl from "../../../app-logo-radius.webp";
import { defaultImageSettings, type ImageSettings } from "../../lib/imageSettings";

type AppColorScheme = "system" | "light" | "dark";
type SettingsSection = "general" | "images" | "about";

/**
 * 设置页按分类独立维护，避免新增软件选项时继续扩张应用入口。
 * 页面内部状态仅负责当前设置分类，持久化仍由 App 统一协调。
 */
export function SettingsPage({
  colorScheme,
  onColorSchemeChange,
  imageSettings,
  onImageSettingsChange,
  onChooseImageStorageDirectory,
}: {
  colorScheme: AppColorScheme;
  onColorSchemeChange: (value: AppColorScheme) => void;
  imageSettings: ImageSettings;
  onImageSettingsChange: (value: ImageSettings) => void;
  onChooseImageStorageDirectory: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>("general");

  return (
    <main className="flex min-h-0 flex-1 bg-[#f8f8f6] dark:bg-[#1b1c19]">
      {/* 设置分类单独占一列，后续增加编辑器、导出等设置时无需改动页面结构。 */}
      <nav className="w-52 shrink-0 border-r border-stone-200 px-3 py-5 dark:border-stone-700">
        <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">设置</div>
        <div className="mt-3 space-y-1">
          {([
            ["general", Settings, "通用"],
            ["images", ImageIcon, "图片"],
            ["about", Info, "关于"],
          ] as const).map(([value, Icon, label]) => (
            <button
              key={value}
              className={clsx(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition",
                section === value
                  ? "bg-stone-200/70 text-stone-800 dark:bg-stone-800 dark:text-stone-100"
                  : "text-stone-500 hover:bg-stone-200/50 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100",
              )}
              onClick={() => setSection(value)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <ScrollArea.Root className="min-w-0 flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full">
          {section === "general" && (
            <GeneralSettings colorScheme={colorScheme} onColorSchemeChange={onColorSchemeChange} />
          )}
          {section === "images" && (
            <ImageSettingsPage
              settings={imageSettings}
              onChange={onImageSettingsChange}
              onChooseDirectory={onChooseImageStorageDirectory}
            />
          )}
          {section === "about" && <AboutSettings />}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="flex w-2.5 touch-none select-none p-0.5">
          <ScrollArea.Thumb className="min-h-8 flex-1 rounded-full bg-stone-300 dark:bg-stone-700" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </main>
  );
}

function GeneralSettings({
  colorScheme,
  onColorSchemeChange,
}: {
  colorScheme: AppColorScheme;
  onColorSchemeChange: (value: AppColorScheme) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-10 py-9">
      <div>
        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">通用设置</h1>
        <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">调整文染的软件外观与通用行为。</p>
      </div>

      <section className="mt-8 overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-[#242522]">
        <div className="border-b border-stone-200 px-5 py-4 dark:border-stone-700">
          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">外观</div>
          <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
            软件主题应用于侧边栏、工具栏、菜单、设置、编辑器和系统弹窗。微信文章预览保持文章主题原本的样式。
          </div>
        </div>
        <div className="px-5 py-5">
          <div className="text-sm font-medium text-stone-800 dark:text-stone-200">软件主题</div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {([
              ["system", Monitor, "跟随系统", "根据系统外观自动切换"],
              ["light", Sun, "亮色", "整个软件始终使用亮色"],
              ["dark", Moon, "暗色", "整个软件始终使用暗色"],
            ] as const).map(([value, Icon, label, description]) => (
              <button
                key={value}
                type="button"
                aria-pressed={colorScheme === value}
                className={clsx(
                  "relative flex min-h-28 flex-col items-start rounded-xl border p-4 text-left transition",
                  colorScheme === value
                    ? "border-stone-700 bg-stone-50 ring-1 ring-stone-700 dark:border-stone-300 dark:bg-stone-800 dark:ring-stone-300"
                    : "border-stone-200 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:hover:border-stone-600 dark:hover:bg-stone-800/70",
                )}
                onClick={() => onColorSchemeChange(value)}
              >
                <Icon size={19} className="text-stone-700 dark:text-stone-300" />
                <span className="mt-4 text-sm font-medium text-stone-900 dark:text-stone-100">{label}</span>
                <span className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</span>
                {colorScheme === value && (
                  <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ImageSettingsPage({
  settings,
  onChange,
  onChooseDirectory,
}: {
  settings: ImageSettings;
  onChange: (value: ImageSettings) => void;
  onChooseDirectory: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-10 py-9">
      <div>
        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">图片设置</h1>
        <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
          管理粘贴或拖入文章的本地图片，包括存放目录、尺寸和压缩质量。
        </p>
      </div>

      <section className="mt-8 overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-[#242522]">
        <div className="border-b border-stone-200 px-5 py-4 dark:border-stone-700">
          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">存放位置</div>
          <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
            默认在每篇 Markdown 文章旁创建 assets 目录。选择自定义文件夹后，文章会优先使用相对路径引用图片。
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 py-5">
          <button
            type="button"
            aria-pressed={settings.storageMode === "article-assets"}
            onClick={() => onChange({ ...settings, storageMode: "article-assets" })}
            className={clsx(
              "relative min-h-28 rounded-xl border p-4 text-left transition",
              settings.storageMode === "article-assets"
                ? "border-stone-700 bg-stone-50 ring-1 ring-stone-700 dark:border-stone-300 dark:bg-stone-800 dark:ring-stone-300"
                : "border-stone-200 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:hover:border-stone-600 dark:hover:bg-stone-800/70",
            )}
          >
            <FolderOpen size={18} className="text-stone-600 dark:text-stone-300" />
            <span className="mt-3 block text-sm font-medium text-stone-900 dark:text-stone-100">文章 assets 目录</span>
            <span className="mt-1 block text-xs leading-5 text-stone-500 dark:text-stone-400">
              每篇文章使用同级的 ./assets
            </span>
            {settings.storageMode === "article-assets" && (
              <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </button>

          <button
            type="button"
            aria-pressed={settings.storageMode === "custom"}
            onClick={() => {
              if (settings.customDirectory) {
                onChange({ ...settings, storageMode: "custom" });
              } else {
                onChooseDirectory();
              }
            }}
            className={clsx(
              "relative min-h-28 rounded-xl border p-4 text-left transition",
              settings.storageMode === "custom"
                ? "border-stone-700 bg-stone-50 ring-1 ring-stone-700 dark:border-stone-300 dark:bg-stone-800 dark:ring-stone-300"
                : "border-stone-200 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:hover:border-stone-600 dark:hover:bg-stone-800/70",
            )}
          >
            <FolderOpen size={18} className="text-stone-600 dark:text-stone-300" />
            <span className="mt-3 block text-sm font-medium text-stone-900 dark:text-stone-100">自定义文件夹</span>
            <span className="mt-1 block truncate text-xs leading-5 text-stone-500 dark:text-stone-400">
              {settings.customDirectory ?? "选择一个固定的图片目录"}
            </span>
            {settings.storageMode === "custom" && (
              <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </button>
        </div>
        {settings.customDirectory && (
          <div className="flex items-center justify-between gap-4 border-t border-stone-100 px-5 py-3 dark:border-stone-700">
            <span className="min-w-0 truncate font-mono text-xs text-stone-500 dark:text-stone-400" title={settings.customDirectory}>
              {settings.customDirectory}
            </span>
            <button
              type="button"
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
              onClick={onChooseDirectory}
            >
              更换文件夹
            </button>
          </div>
        )}
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-[#242522]">
        <div className="flex items-start justify-between gap-6 border-b border-stone-200 px-5 py-4 dark:border-stone-700">
          <div>
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">导入时压缩图片</div>
            <div className="mt-1 max-w-xl text-xs leading-5 text-stone-500 dark:text-stone-400">
              默认关闭，关闭时完整保留原始文件。开启后会缩小超出限制的 PNG、JPEG 和 WebP，
              并重新编码；GIF、SVG 等格式仍保持原样。
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.compress}
            aria-label="导入时压缩图片"
            onClick={() => onChange({ ...settings, compress: !settings.compress })}
            className={clsx(
              "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition",
              settings.compress ? "bg-[#2f8f5b]" : "bg-stone-300 dark:bg-stone-600",
            )}
          >
            <span
              className={clsx(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition",
                settings.compress ? "left-[22px]" : "left-0.5",
              )}
            />
          </button>
        </div>

        <div className={clsx("space-y-6 px-5 py-5 transition", !settings.compress && "opacity-45")}>
          <label className="block">
            <span className="text-sm font-medium text-stone-800 dark:text-stone-200">最大边长</span>
            <span className="ml-2 text-xs text-stone-400">保持长宽比，不会放大小图</span>
            <select
              value={settings.maxDimension}
              disabled={!settings.compress}
              onChange={(event) => onChange({ ...settings, maxDimension: Number(event.target.value) })}
              className="mt-2 block h-9 w-48 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition focus:border-stone-500 disabled:cursor-not-allowed dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
            >
              <option value={1280}>1280 px</option>
              <option value={1920}>1920 px（推荐）</option>
              <option value={2560}>2560 px</option>
              <option value={3840}>3840 px</option>
            </select>
          </label>

          <label className="block">
            <span className="flex items-center justify-between gap-4">
              <span>
                <span className="text-sm font-medium text-stone-800 dark:text-stone-200">JPEG 质量</span>
                <span className="ml-2 text-xs text-stone-400">只影响 JPEG 图片</span>
              </span>
              <span className="font-mono text-xs text-stone-500 dark:text-stone-400">{settings.jpegQuality}</span>
            </span>
            <input
              type="range"
              min={60}
              max={95}
              step={1}
              value={settings.jpegQuality}
              disabled={!settings.compress}
              onChange={(event) => onChange({ ...settings, jpegQuality: Number(event.target.value) })}
              className="mt-3 w-full accent-[#2f8f5b] disabled:cursor-not-allowed"
            />
            <span className="mt-1 flex justify-between text-[11px] text-stone-400">
              <span>文件更小</span>
              <span>画质更高</span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-stone-100 px-5 py-3 dark:border-stone-700">
          <span className="text-xs text-stone-400">设置仅影响之后导入的图片，不修改已有文件。</span>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
            onClick={() => onChange(defaultImageSettings)}
          >
            恢复默认
          </button>
        </div>
      </section>
    </div>
  );
}

function AboutSettings() {
  const [appVersion, setAppVersion] = useState("获取中…");

  useEffect(() => {
    let active = true;

    // 通过 Tauri 运行时读取安装包的真实版本，避免前端元数据与应用版本不一致。
    void getVersion()
      .then((version) => {
        if (active) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        if (active) {
          setAppVersion("未知");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-10 py-9">
      <div>
        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">关于文染</h1>
        <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">版本、开源项目和软件信息。</p>
      </div>

      <section className="mt-8 overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-[#242522]">
        <div className="flex items-center gap-4 border-b border-stone-200 px-5 py-5 dark:border-stone-700">
          <img src={appLogoUrl} alt="文染标志" className="h-16 w-16 object-cover" />
          <div className="min-w-0">
            <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">文染 WenRender</div>
            <div className="mt-1 text-sm text-stone-500 dark:text-stone-400">面向微信公众号写作场景的跨平台 Markdown 编辑器。</div>
            <span className="mt-2 inline-flex rounded-full bg-stone-100 px-2.5 py-1 font-mono text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              版本 {appVersion}
            </span>
          </div>
        </div>

        <dl className="divide-y divide-stone-100 px-5 dark:divide-stone-700">
          <AboutRow label="当前版本" value={appVersion} />
          {/* <AboutRow label="支持平台" value="Windows、macOS、Linux" /> */}
          <AboutRow label="核心技术" value="Tauri 2、React、CodeMirror 6" />
          <AboutRow label="开源协议" value="GNU AGPL v3" />
        </dl>
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-[#242522]">
        <button
          type="button"
          onClick={() => void openExternalUrl("https://github.com/1595901624/WenRender")}
          className="group flex items-center gap-3 px-5 py-4 transition hover:bg-stone-50 dark:hover:bg-stone-800/70"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
            <Github size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-stone-900 dark:text-stone-100">GitHub 开源仓库</span>
            <span className="mt-0.5 block truncate text-xs text-stone-500 dark:text-stone-400">1595901624/WenRender</span>
          </span>
          <ExternalLink size={15} className="text-stone-400 transition group-hover:text-stone-700 dark:group-hover:text-stone-200" />
        </button>
      </section>

      <section className="mt-4 rounded-xl border border-stone-200 bg-white px-5 py-4 dark:border-stone-700 dark:bg-[#242522]">
        <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">数据与隐私</div>
        <p className="mt-1.5 text-xs leading-5 text-stone-500 dark:text-stone-400">
          文染在本地读取、编辑和渲染文章，不会主动上传文章内容。工作区状态与软件设置保存在本机。
        </p>
      </section>
    </div>
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5 text-sm">
      <dt className="text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="text-right text-stone-800 dark:text-stone-200">{value}</dd>
    </div>
  );
}

async function openExternalUrl(url: string) {
  if ("__TAURI_INTERNALS__" in window) {
    await openUrl(url);
    return;
  }
  // 浏览器开发环境使用原生 window.open，桌面应用始终交给 opener 插件处理。
  window.open(url, "_blank", "noopener,noreferrer");
}

