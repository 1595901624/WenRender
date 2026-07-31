import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { Check, Cloud, ExternalLink, FolderOpen, Github, Image as ImageIcon, Info, KeyRound, Monitor, Moon, Newspaper, Pencil, Plus, RefreshCw, Settings, ShieldCheck, Sun, Trash2 } from "lucide-react";
import clsx from "clsx";
import appLogoUrl from "../../../app-logo-radius.webp";
import {
  defaultImageSettings,
  type ImageHostConfig,
  type ImageHostProvider,
  type ImageSettings,
} from "../../lib/imageSettings";
import type { WechatAccount } from "../../lib/wechat";

type AppColorScheme = "system" | "light" | "dark";
type SettingsSection = "general" | "images" | "wechat" | "about";

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
  wechatAccounts,
  onWechatAccountsChange,
  initialSection = "general",
}: {
  colorScheme: AppColorScheme;
  onColorSchemeChange: (value: AppColorScheme) => void;
  imageSettings: ImageSettings;
  onImageSettingsChange: (value: ImageSettings) => void;
  onChooseImageStorageDirectory: () => void;
  wechatAccounts: WechatAccount[];
  onWechatAccountsChange: (value: WechatAccount[]) => void;
  initialSection?: SettingsSection;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);

  return (
    <main className="flex min-h-0 flex-1 bg-[#f8f8f6] dark:bg-[#1b1c19]">
      {/* 设置分类单独占一列，后续增加编辑器、导出等设置时无需改动页面结构。 */}
      <nav className="w-52 shrink-0 border-r border-stone-200 px-3 py-5 dark:border-stone-700">
        <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">设置</div>
        <div className="mt-3 space-y-1">
          {([
            ["general", Settings, "通用"],
            ["images", ImageIcon, "图片"],
            ["wechat", Newspaper, "公众号"],
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
          {section === "wechat" && (
            <WechatAccountSettings
              accounts={wechatAccounts}
              onChange={onWechatAccountsChange}
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
          管理图片的本地存放、压缩和图床上传。
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

      <ImageHostingSettings
        config={settings.hosting}
        onChange={(hosting) => onChange({ ...settings, hosting })}
      />
    </div>
  );
}

function ImageHostingSettings({
  config,
  onChange,
}: {
  config: ImageHostConfig;
  onChange: (value: ImageHostConfig) => void;
}) {
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [customHeaders, setCustomHeaders] = useState('{\n  "Authorization": "Bearer token"\n}');
  const [secretStatus, setSecretStatus] = useState<"checking" | "saved" | "missing" | "error">("missing");
  const [secretMessage, setSecretMessage] = useState("");
  const provider = config.provider;
  const objectProvider = provider === "s3" || provider === "oss" || provider === "cos" || provider === "r2";

  useEffect(() => {
    setSecretMessage("");
    if (provider === "none") {
      setSecretStatus("missing");
      return;
    }
    if (!("__TAURI_INTERNALS__" in window)) {
      setSecretStatus("error");
      setSecretMessage("系统密钥库仅在桌面应用中可用");
      return;
    }
    let cancelled = false;
    setSecretStatus("checking");
    void invoke<boolean>("get_image_host_secret_status", { provider })
      .then((saved) => {
        if (!cancelled) setSecretStatus(saved ? "saved" : "missing");
      })
      .catch((error) => {
        if (!cancelled) {
          setSecretStatus("error");
          setSecretMessage(String(error));
        }
      });
    return () => { cancelled = true; };
  }, [provider]);

  const saveSecrets = async () => {
    try {
      let value: object;
      if (objectProvider) {
        if (!accessKeyId.trim() || !secretAccessKey.trim()) throw new Error("请填写 Access Key ID 和 Secret Access Key");
        value = {
          accessKeyId: accessKeyId.trim(),
          secretAccessKey,
          sessionToken: sessionToken.trim(),
        };
      } else if (provider === "github") {
        if (!githubToken.trim()) throw new Error("请填写 GitHub Token");
        value = { token: githubToken.trim() };
      } else if (provider === "custom") {
        const headers = JSON.parse(customHeaders);
        if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
          throw new Error("请求头必须是 JSON 对象");
        }
        value = { headers };
      } else {
        throw new Error("请先选择图床");
      }
      await invoke("save_image_host_secrets", {
        provider,
        secretsJson: JSON.stringify(value),
      });
      setAccessKeyId("");
      setSecretAccessKey("");
      setSessionToken("");
      setGithubToken("");
      setSecretStatus("saved");
      setSecretMessage("凭据已写入系统密钥库");
    } catch (error) {
      setSecretStatus("error");
      setSecretMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const deleteSecrets = async () => {
    if (!window.confirm(`确定从系统密钥库删除 ${providerLabel(provider)} 凭据吗？`)) return;
    try {
      await invoke("delete_image_host_secrets", { provider });
      setSecretStatus("missing");
      setSecretMessage("凭据已删除");
    } catch (error) {
      setSecretStatus("error");
      setSecretMessage(String(error));
    }
  };

  const update = (patch: Partial<ImageHostConfig>) => onChange({ ...config, ...patch });

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-[#242522]">
      <div className="border-b border-stone-200 px-5 py-4 dark:border-stone-700">
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
          <Cloud size={16} />图床
        </div>
        <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
          图片始终先保存到本地，再按策略上传。Endpoint、Bucket 等普通配置保存在本地；密钥和鉴权请求头只保存在系统密钥库。
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        <SettingField label="图床类型">
          <select value={provider} onChange={(event) => update({ provider: event.target.value as ImageHostProvider })} className="settings-input">
            <option value="none">不使用图床</option>
            <option value="s3">Amazon S3 / S3 兼容存储</option>
            <option value="oss">阿里云 OSS</option>
            <option value="cos">腾讯云 COS</option>
            <option value="r2">Cloudflare R2</option>
            <option value="github">GitHub 仓库</option>
            <option value="custom">自定义上传接口</option>
          </select>
        </SettingField>

        {provider !== "none" && (
          <>
            <SettingField label="上传时机" hint="推荐复制前上传：写作过程保持本地可靠，发布时再替换为远程地址。">
              <select value={config.uploadTiming} onChange={(event) => update({ uploadTiming: event.target.value as ImageHostConfig["uploadTiming"] })} className="settings-input">
                <option value="manual">仅手动上传</option>
                <option value="on-copy">复制到公众号前上传（推荐）</option>
                <option value="on-insert">图片插入后立即上传</option>
              </select>
            </SettingField>
            <p className="rounded-lg bg-stone-50 px-3 py-2 text-[11px] leading-5 text-stone-500 dark:bg-stone-800/50 dark:text-stone-400">
              上传成功后会把 Markdown 中对应的本地图片地址替换为远程 URL，因此文章会进入未保存状态；本地原图不会删除。
            </p>

            {objectProvider && (
              <div className="grid grid-cols-2 gap-4">
                <SettingField label="Endpoint" hint={providerEndpointHint(provider)}>
                  <input value={config.endpoint} onChange={(event) => update({ endpoint: event.target.value })} placeholder={providerEndpointPlaceholder(provider)} className="settings-input" />
                </SettingField>
                <SettingField label="Region">
                  <input value={config.region} onChange={(event) => update({ region: event.target.value })} placeholder={providerRegionPlaceholder(provider)} className="settings-input" />
                </SettingField>
                <SettingField label="Bucket">
                  <input value={config.bucket} onChange={(event) => update({ bucket: event.target.value })} placeholder="my-image-bucket" className="settings-input" />
                </SettingField>
                <SettingField label="远端目录">
                  <input value={config.pathPrefix} onChange={(event) => update({ pathPrefix: event.target.value })} placeholder="wenrender" className="settings-input" />
                </SettingField>
                <div className="col-span-2">
                  <SettingField label="公开访问域名" hint="应是微信能够直接访问的 HTTPS 地址，可填写存储桶公开域名或 CDN 域名。">
                    <input value={config.publicBaseUrl} onChange={(event) => update({ publicBaseUrl: event.target.value })} placeholder="https://images.example.com" className="settings-input" />
                  </SettingField>
                </div>
              </div>
            )}

            {provider === "github" && (
              <div className="grid grid-cols-2 gap-4">
                <SettingField label="仓库所有者"><input value={config.githubOwner} onChange={(event) => update({ githubOwner: event.target.value })} placeholder="owner" className="settings-input" /></SettingField>
                <SettingField label="仓库名称"><input value={config.githubRepo} onChange={(event) => update({ githubRepo: event.target.value })} placeholder="images" className="settings-input" /></SettingField>
                <SettingField label="分支"><input value={config.githubBranch} onChange={(event) => update({ githubBranch: event.target.value })} placeholder="main" className="settings-input" /></SettingField>
                <SettingField label="远端目录"><input value={config.pathPrefix} onChange={(event) => update({ pathPrefix: event.target.value })} placeholder="wenrender" className="settings-input" /></SettingField>
                <div className="col-span-2">
                  <SettingField label="自定义 CDN 域名（可选）" hint="留空时使用 raw.githubusercontent.com；仓库必须公开，或配置可公开访问的 CDN。">
                    <input value={config.publicBaseUrl} onChange={(event) => update({ publicBaseUrl: event.target.value })} placeholder="https://cdn.example.com/images" className="settings-input" />
                  </SettingField>
                </div>
              </div>
            )}

            {provider === "custom" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <SettingField label="上传接口" hint="支持 {filename}、{key} 和 {hash} 占位符。">
                    <input value={config.endpoint} onChange={(event) => update({ endpoint: event.target.value })} placeholder="https://api.example.com/upload" className="settings-input" />
                  </SettingField>
                </div>
                <SettingField label="请求方式">
                  <select value={config.customMethod} onChange={(event) => update({ customMethod: event.target.value as "POST" | "PUT" })} className="settings-input">
                    <option value="POST">POST multipart/form-data</option>
                    <option value="PUT">PUT 原始文件</option>
                  </select>
                </SettingField>
                <SettingField label="文件字段名" hint="只用于 POST">
                  <input value={config.customFileField} onChange={(event) => update({ customFileField: event.target.value })} placeholder="file" className="settings-input" />
                </SettingField>
                <div className="col-span-2">
                  <SettingField label="响应 URL 字段" hint="例如 data.url；留空表示响应正文就是图片 URL。">
                    <input value={config.customResponseUrlPath} onChange={(event) => update({ customResponseUrlPath: event.target.value })} placeholder="data.url" className="settings-input" />
                  </SettingField>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4 dark:border-stone-700 dark:bg-stone-800/40">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm font-medium text-stone-800 dark:text-stone-200">
                  <KeyRound size={15} />访问凭据
                </div>
                <span className={clsx(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]",
                  secretStatus === "saved"
                    ? "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200"
                    : "bg-white text-stone-500 dark:bg-stone-800 dark:text-stone-400",
                )}>
                  {secretStatus === "saved" && <ShieldCheck size={12} />}
                  {secretStatus === "checking" ? "检查中" : secretStatus === "saved" ? "已保存在系统密钥库" : "尚未保存"}
                </span>
              </div>

              {objectProvider && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <input type="password" autoComplete="off" value={accessKeyId} onChange={(event) => setAccessKeyId(event.target.value)} placeholder={provider === "cos" ? "SecretId" : "Access Key ID"} className="settings-input" />
                  <input type="password" autoComplete="new-password" value={secretAccessKey} onChange={(event) => setSecretAccessKey(event.target.value)} placeholder={provider === "cos" ? "SecretKey" : "Secret Access Key"} className="settings-input" />
                  <input type="password" autoComplete="new-password" value={sessionToken} onChange={(event) => setSessionToken(event.target.value)} placeholder="Session Token（可选）" className="settings-input col-span-2" />
                </div>
              )}
              {provider === "github" && (
                <input type="password" autoComplete="new-password" value={githubToken} onChange={(event) => setGithubToken(event.target.value)} placeholder="Fine-grained Personal Access Token（Contents: write）" className="settings-input mt-4" />
              )}
              {provider === "custom" && (
                <>
                  <textarea value={customHeaders} onChange={(event) => setCustomHeaders(event.target.value)} rows={4} spellCheck={false} className="settings-input mt-4 h-auto resize-y font-mono text-xs" aria-label="自定义鉴权请求头 JSON" />
                  <p className="mt-2 text-[11px] leading-4 text-stone-400">请将 Token 放在这里，不要写进上传接口 URL；整组请求头只会保存到系统密钥库。</p>
                </>
              )}

              {secretMessage && (
                <div className={clsx("mt-3 text-xs", secretStatus === "error" ? "text-red-600 dark:text-red-400" : "text-stone-500 dark:text-stone-400")}>
                  {secretMessage}
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                {secretStatus === "saved" && (
                  <button type="button" onClick={() => void deleteSecrets()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30">
                    <Trash2 size={13} />删除凭据
                  </button>
                )}
                <button type="button" onClick={() => void saveSecrets()} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700">
                  保存到系统密钥库
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

type WechatSecretState = "checking" | "saved" | "missing" | "error";

function WechatAccountSettings({
  accounts,
  onChange,
}: {
  accounts: WechatAccount[];
  onChange: (value: WechatAccount[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [appId, setAppId] = useState("");
  const [defaultAuthor, setDefaultAuthor] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [secretStates, setSecretStates] = useState<Record<string, WechatSecretState>>({});
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const editing = editingId !== null;

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      setSecretStates(Object.fromEntries(accounts.map((account) => [account.id, "error"])));
      return;
    }
    let cancelled = false;
    setSecretStates((current) => Object.fromEntries(
      accounts.map((account) => [account.id, current[account.id] ?? "checking"]),
    ));
    void Promise.all(accounts.map(async (account) => {
      try {
        const saved = await invoke<boolean>("get_wechat_account_secret_status", {
          accountId: account.id,
        });
        return [account.id, saved ? "saved" : "missing"] as const;
      } catch {
        return [account.id, "error"] as const;
      }
    })).then((entries) => {
      if (!cancelled) setSecretStates(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [accounts]);

  const startNew = () => {
    setEditingId(createWechatAccountId());
    setName("");
    setAppId("");
    setDefaultAuthor("");
    setAppSecret("");
    setMessage("");
  };

  const startEdit = (account: WechatAccount) => {
    setEditingId(account.id);
    setName(account.name);
    setAppId(account.appId);
    setDefaultAuthor(account.defaultAuthor);
    setAppSecret("");
    setMessage("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setAppSecret("");
    setMessage("");
  };

  const saveAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingId || busyId) return;
    if (!name.trim() || !appId.trim()) {
      setMessage("请填写公众号名称和 AppID");
      return;
    }
    const exists = accounts.some((account) => account.id === editingId);
    if (!exists && !appSecret.trim()) {
      setMessage("首次绑定需要填写 AppSecret");
      return;
    }
    setBusyId(editingId);
    setMessage("");
    try {
      if (appSecret.trim()) {
        if (!("__TAURI_INTERNALS__" in window)) {
          throw new Error("系统密钥库仅在桌面应用中可用");
        }
        await invoke("save_wechat_account_secret", {
          accountId: editingId,
          appSecret,
        });
      }
      const account: WechatAccount = {
        id: editingId,
        name: name.trim(),
        appId: appId.trim(),
        defaultAuthor: defaultAuthor.trim(),
      };
      onChange(exists
        ? accounts.map((item) => item.id === editingId ? account : item)
        : [...accounts, account]);
      setSecretStates((current) => ({
        ...current,
        [editingId]: appSecret.trim() ? "saved" : current[editingId] ?? "missing",
      }));
      setEditingId(null);
      setAppSecret("");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyId(null);
    }
  };

  const testAccount = async (account: WechatAccount) => {
    if (busyId) return;
    setBusyId(account.id);
    setMessage("");
    try {
      const result = await invoke<{ expiresIn: number }>("test_wechat_account", {
        accountId: account.id,
        appId: account.appId,
      });
      setMessage(`「${account.name}」连接成功，凭据有效期约 ${Math.round(result.expiresIn / 60)} 分钟`);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyId(null);
    }
  };

  const deleteAccount = async (account: WechatAccount) => {
    if (!window.confirm(`确定删除公众号「${account.name}」及其本机凭据吗？文章中的草稿关联不会删除。`)) return;
    setBusyId(account.id);
    setMessage("");
    try {
      if ("__TAURI_INTERNALS__" in window) {
        await invoke("delete_wechat_account_secret", { accountId: account.id });
      }
      onChange(accounts.filter((item) => item.id !== account.id));
      if (editingId === account.id) cancelEdit();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-10 py-9">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">公众号设置</h1>
          <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
            绑定一个或多个公众号，把当前文章创建或更新到草稿箱。
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startNew}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            <Plus size={15} />添加公众号
          </button>
        )}
      </div>

      <section className="mt-8 rounded-xl border border-stone-200 bg-white px-5 py-4 dark:border-stone-700 dark:bg-[#242522]">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            <ShieldCheck size={17} />
          </span>
          <div>
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">连接前准备</div>
            <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
              在微信公众平台获取 AppID 和 AppSecret，并把当前电脑的公网 IP 加入 API IP 白名单。
              AppSecret 仅写入系统密钥库，不会保存在普通设置或 Markdown 文件中。账号还需要具有草稿箱与素材接口权限。
            </p>
          </div>
        </div>
      </section>

      {editing && (
        <form onSubmit={(event) => void saveAccount(event)} className="mt-4 overflow-hidden rounded-xl border border-stone-300 bg-white dark:border-stone-600 dark:bg-[#242522]">
          <div className="border-b border-stone-200 px-5 py-4 dark:border-stone-700">
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              {accounts.some((account) => account.id === editingId) ? "编辑公众号" : "绑定公众号"}
            </div>
            <div className="mt-1 text-xs text-stone-400">公众号名称仅用于在文染中识别账号。</div>
          </div>
          <div className="grid grid-cols-2 gap-4 px-5 py-5">
            <SettingField label="公众号名称">
              <input className="settings-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：文染" autoFocus />
            </SettingField>
            <SettingField label="默认作者" hint="创建文章时自动带入，可逐篇修改">
              <input className="settings-input" value={defaultAuthor} onChange={(event) => setDefaultAuthor(event.target.value)} placeholder="作者名称" />
            </SettingField>
            <SettingField label="AppID">
              <input className="settings-input font-mono" value={appId} onChange={(event) => setAppId(event.target.value)} placeholder="wx..." spellCheck={false} />
            </SettingField>
            <SettingField
              label="AppSecret"
              hint={accounts.some((account) => account.id === editingId) ? "留空表示继续使用系统密钥库中的值" : "首次绑定必须填写"}
            >
              <input className="settings-input font-mono" type="password" value={appSecret} onChange={(event) => setAppSecret(event.target.value)} placeholder="不会以明文保存在设置中" autoComplete="new-password" />
            </SettingField>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-stone-100 px-5 py-3 dark:border-stone-700">
            <span className="text-xs text-red-600 dark:text-red-400">{message}</span>
            <div className="flex gap-2">
              <button type="button" onClick={cancelEdit} disabled={Boolean(busyId)} className="rounded-lg px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-60 dark:text-stone-300 dark:hover:bg-stone-800">取消</button>
              <button type="submit" disabled={Boolean(busyId)} className="rounded-lg bg-[#20211f] px-3.5 py-2 text-xs font-medium text-white hover:bg-black disabled:opacity-60">
                {busyId ? "正在保存…" : "保存账号"}
              </button>
            </div>
          </div>
        </form>
      )}

      <section className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-[#242522]">
        {accounts.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Newspaper size={24} className="mx-auto text-stone-300 dark:text-stone-600" />
            <div className="mt-3 text-sm font-medium text-stone-700 dark:text-stone-300">还没有绑定公众号</div>
            <div className="mt-1 text-xs text-stone-400">绑定后可在文章菜单中同步到草稿箱。</div>
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-stone-700">
            {accounts.map((account) => {
              const secretState = secretStates[account.id] ?? "checking";
              return (
                <div key={account.id} className="flex items-center gap-4 px-5 py-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    <Newspaper size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">{account.name}</span>
                      <span className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px]",
                        secretState === "saved"
                          ? "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                      )}>
                        {secretState === "checking" ? "检查凭据"
                          : secretState === "saved" ? "凭据已保存"
                            : secretState === "error" ? "桌面端可用" : "缺少 AppSecret"}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-stone-400">{account.appId}</div>
                  </div>
                  <button type="button" disabled={Boolean(busyId)} onClick={() => void testAccount(account)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800">
                    <RefreshCw size={13} className={busyId === account.id ? "animate-spin" : ""} />测试
                  </button>
                  <button type="button" disabled={Boolean(busyId)} onClick={() => startEdit(account)} className="icon-button" aria-label={`编辑 ${account.name}`}><Pencil size={14} /></button>
                  <button type="button" disabled={Boolean(busyId)} onClick={() => void deleteAccount(account)} className="icon-button text-red-500" aria-label={`删除 ${account.name}`}><Trash2 size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {!editing && message && (
        <p className={clsx("mt-3 text-xs", message.includes("成功") ? "text-stone-600 dark:text-stone-300" : "text-red-600 dark:text-red-400")}>
          {message}
        </p>
      )}
    </div>
  );
}

function SettingField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-stone-800 dark:text-stone-200">{label}</span>
      {hint && <span className="mt-0.5 block text-[11px] leading-4 text-stone-400">{hint}</span>}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function createWechatAccountId(): string {
  return `account_${crypto.randomUUID().replace(/-/g, "")}`;
}

function providerLabel(provider: ImageHostProvider): string {
  return ({ s3: "S3", oss: "OSS", cos: "COS", github: "GitHub", r2: "R2", custom: "自定义接口", none: "图床" })[provider];
}

function providerEndpointPlaceholder(provider: ImageHostProvider): string {
  if (provider === "r2") return "https://<account-id>.r2.cloudflarestorage.com";
  if (provider === "oss") return "https://oss-cn-hangzhou.aliyuncs.com";
  if (provider === "cos") return "https://cos.ap-guangzhou.myqcloud.com";
  return "留空使用 AWS 默认 Endpoint";
}

function providerEndpointHint(provider: ImageHostProvider): string {
  return provider === "s3" ? "S3 兼容服务可填写自定义 Endpoint。" : "可留空使用该服务的标准 Endpoint。";
}

function providerRegionPlaceholder(provider: ImageHostProvider): string {
  if (provider === "r2") return "auto";
  if (provider === "oss") return "cn-hangzhou";
  if (provider === "cos") return "ap-guangzhou";
  return "ap-southeast-1";
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
