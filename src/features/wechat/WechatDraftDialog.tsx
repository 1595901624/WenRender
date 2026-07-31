import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Check, FileImage, LoaderCircle, Newspaper, Settings } from "lucide-react";
import clsx from "clsx";
import { useDialogFocus } from "../../lib/dialogFocus";
import {
  findFirstLocalMarkdownImage,
  getWechatArticleSettings,
  saveWechatArticleSettings,
  suggestedWechatDigest,
  suggestedWechatTitle,
  type WechatAccount,
  type WechatArticleSettings,
} from "../../lib/wechat";

type SyncResult = {
  mediaId: string;
  coverMediaId: string;
  coverHash: string;
  updated: boolean;
  uploadedImages: number;
};

export function WechatDraftDialog({
  accounts,
  documentPath,
  documentName,
  markdown,
  renderContent,
  onClose,
  onOpenSettings,
  onSynced,
  onTaskStart,
  onTaskFinish,
}: {
  accounts: WechatAccount[];
  documentPath: string | null;
  documentName: string;
  markdown: string;
  renderContent: (removeFirstHeading: boolean) => string;
  onClose: () => void;
  onOpenSettings: () => void;
  onSynced: (message: string) => void;
  onTaskStart: (detail: string) => string;
  onTaskFinish: (id: string, succeeded: boolean, detail: string) => void;
}) {
  const stored = useMemo(
    () => documentPath ? getWechatArticleSettings(documentPath) : { drafts: {} },
    [documentPath],
  );
  const initialAccountId = accounts.some((account) => account.id === stored.selectedAccountId)
    ? stored.selectedAccountId!
    : accounts[0]?.id ?? "";
  const initialDraft = stored.drafts[initialAccountId];
  const [accountId, setAccountId] = useState(initialAccountId);
  const [mode, setMode] = useState<"create" | "update">(initialDraft ? "update" : "create");
  const [title, setTitle] = useState(stored.title ?? suggestedWechatTitle(markdown, documentName));
  const [digest, setDigest] = useState(stored.digest ?? suggestedWechatDigest(markdown));
  const [author, setAuthor] = useState(stored.author ?? accounts.find((item) => item.id === initialAccountId)?.defaultAuthor ?? "");
  const [sourceUrl, setSourceUrl] = useState(stored.sourceUrl ?? "");
  const [coverPath, setCoverPath] = useState(stored.coverPath ?? "");
  const [removeFirstHeading, setRemoveFirstHeading] = useState(stored.removeFirstHeading ?? true);
  const [draftLinks, setDraftLinks] = useState(stored.drafts);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SyncResult | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const existingDraft = draftLinks[accountId];

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !syncing) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, syncing]);

  const selectAccount = (value: string) => {
    const previousDefault = selectedAccount?.defaultAuthor ?? "";
    const nextAccount = accounts.find((account) => account.id === value);
    setAccountId(value);
    if (!author.trim() || author === previousDefault) setAuthor(nextAccount?.defaultAuthor ?? "");
    setMode(draftLinks[value] ? "update" : "create");
    setError("");
    setResult(null);
  };

  const chooseCover = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "封面图片", extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"] }],
    });
    if (typeof selected === "string") {
      setCoverPath(selected);
      setError("");
    }
  };

  const useFirstImage = () => {
    if (!documentPath) return;
    const first = findFirstLocalMarkdownImage(markdown, documentPath);
    if (!first) {
      setError("正文中没有可作为封面的本地图片，请手动选择图片");
      return;
    }
    setCoverPath(first);
    setError("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (syncing) return;
    if (!documentPath) {
      setError("请先保存 Markdown 文件，再同步到公众号草稿箱");
      return;
    }
    if (!selectedAccount) {
      setError("请先选择公众号");
      return;
    }
    if (!title.trim()) {
      setError("请填写文章标题");
      return;
    }
    if (!coverPath.trim()) {
      setError("请选择封面图片");
      return;
    }
    if (!("__TAURI_INTERNALS__" in window)) {
      setError("同步草稿箱仅在桌面应用中可用");
      return;
    }

    const settings: WechatArticleSettings = {
      selectedAccountId: accountId,
      title: title.trim(),
      digest: digest.trim(),
      author: author.trim(),
      sourceUrl: sourceUrl.trim(),
      coverPath,
      removeFirstHeading,
      drafts: draftLinks,
    };
    saveWechatArticleSettings(documentPath, settings);
    setSyncing(true);
    setError("");
    setResult(null);
    const taskId = onTaskStart("正在上传正文图片、封面并写入草稿箱");
    try {
      const linkedDraft = mode === "update" ? existingDraft : undefined;
      const synced = await invoke<SyncResult>("sync_wechat_draft", {
        request: {
          accountId,
          appId: selectedAccount.appId,
          mediaId: linkedDraft?.mediaId,
          title: title.trim(),
          author: author.trim(),
          digest: digest.trim(),
          content: renderContent(removeFirstHeading),
          contentSourceUrl: sourceUrl.trim(),
          coverPath,
          coverMediaId: linkedDraft?.coverMediaId,
          coverHash: linkedDraft?.coverHash,
        },
      });
      const nextDrafts = {
        ...settings.drafts,
        [accountId]: {
          mediaId: synced.mediaId,
          coverMediaId: synced.coverMediaId,
          coverHash: synced.coverHash,
          lastSyncedAt: new Date().toISOString(),
        },
      };
      saveWechatArticleSettings(documentPath, {
        ...settings,
        drafts: nextDrafts,
      });
      setDraftLinks(nextDrafts);
      setResult(synced);
      setMode("update");
      const message = `${synced.updated ? "已更新" : "已创建"}「${selectedAccount.name}」草稿，正文图片 ${synced.uploadedImages} 张`;
      onSynced(message);
      onTaskFinish(taskId, true, message);
    } catch (syncError) {
      const detail = String(syncError);
      setError(detail);
      onTaskFinish(taskId, false, detail);
    } finally {
      setSyncing(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <DialogShell onClose={onClose}>
        <div className="px-6 py-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            <Newspaper size={22} />
          </span>
          <h2 className="mt-4 text-base font-semibold text-stone-900 dark:text-stone-100">先绑定公众号</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-500 dark:text-stone-400">
            同步草稿箱需要公众号 AppID、AppSecret 和 API IP 白名单。可以绑定多个公众号，再逐篇选择发布目标。
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800">取消</button>
            <button type="button" onClick={onOpenSettings} className="inline-flex items-center gap-1.5 rounded-lg bg-[#20211f] px-3.5 py-2 text-sm font-medium text-white hover:bg-black">
              <Settings size={15} />前往公众号设置
            </button>
          </div>
        </div>
      </DialogShell>
    );
  }

  return (
    <DialogShell onClose={syncing ? undefined : onClose}>
      <form onSubmit={(event) => void submit(event)} className="flex max-h-[88vh] flex-col">
        <div className="flex items-start justify-between gap-5 border-b border-stone-200 px-6 py-5 dark:border-stone-700">
          <div>
            <div className="flex items-center gap-2">
              <Newspaper size={18} className="text-stone-600 dark:text-stone-300" />
              <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">同步到公众号草稿箱</h2>
            </div>
            <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
              只创建或更新草稿，不会自动发布或群发。
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={syncing} className="rounded-lg px-2.5 py-1.5 text-xs text-stone-500 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-400 dark:hover:bg-stone-800">关闭</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-stone-600 dark:text-stone-300">目标公众号</span>
              <select value={accountId} onChange={(event) => selectAccount(event.target.value)} disabled={syncing} className="settings-input mt-1.5">
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
            <div>
              <span className="text-xs font-medium text-stone-600 dark:text-stone-300">草稿操作</span>
              <div className="mt-1.5 grid grid-cols-2 rounded-lg bg-stone-100 p-1 dark:bg-stone-800">
                <button type="button" onClick={() => setMode("create")} disabled={syncing} className={modeButtonClass(mode === "create")}>创建新草稿</button>
                <button type="button" onClick={() => setMode("update")} disabled={!existingDraft || syncing} className={modeButtonClass(mode === "update")}>更新现有草稿</button>
              </div>
              {existingDraft && (
                <div className="mt-1.5 truncate font-mono text-[10px] text-stone-400" title={existingDraft.mediaId}>
                  已关联：{existingDraft.mediaId}
                </div>
              )}
            </div>
          </div>

          {mode === "create" && existingDraft && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              创建成功后，本文章会改为关联新草稿；公众号后台的旧草稿不会被删除。
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-4">
            <label className="col-span-2 block">
              <span className="flex items-center justify-between text-xs font-medium text-stone-600 dark:text-stone-300">
                <span>标题</span><span className="font-normal text-stone-400">{title.length}/64</span>
              </span>
              <input ref={titleRef} value={title} maxLength={64} onChange={(event) => setTitle(event.target.value)} disabled={syncing} className="settings-input mt-1.5" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-stone-600 dark:text-stone-300">作者</span>
              <input value={author} maxLength={64} onChange={(event) => setAuthor(event.target.value)} disabled={syncing} className="settings-input mt-1.5" placeholder="可留空" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-stone-600 dark:text-stone-300">原文链接</span>
              <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} disabled={syncing} className="settings-input mt-1.5" placeholder="https://…（可留空）" type="url" />
            </label>
            <label className="col-span-2 block">
              <span className="flex items-center justify-between text-xs font-medium text-stone-600 dark:text-stone-300">
                <span>摘要</span><span className="font-normal text-stone-400">{digest.length}/120</span>
              </span>
              <textarea value={digest} maxLength={120} onChange={(event) => setDigest(event.target.value)} disabled={syncing} rows={3} className="settings-input mt-1.5 h-auto resize-none py-2 leading-5" placeholder="可留空，由公众号自动截取正文" />
            </label>
          </div>

          <section className="mt-5 rounded-xl border border-stone-200 px-4 py-4 dark:border-stone-700">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-medium text-stone-700 dark:text-stone-300">封面图片</div>
                <div className="mt-1 truncate text-xs text-stone-400" title={coverPath}>
                  {coverPath || "尚未选择。封面会上传为公众号永久素材。"}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={useFirstImage} disabled={!documentPath || syncing} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800">使用正文首图</button>
                <button type="button" onClick={() => void chooseCover()} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800">
                  <FileImage size={13} />选择图片
                </button>
              </div>
            </div>
          </section>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg bg-stone-50 px-3 py-3 dark:bg-stone-800/60">
            <input type="checkbox" checked={removeFirstHeading} onChange={(event) => setRemoveFirstHeading(event.target.checked)} disabled={syncing} className="mt-0.5 h-4 w-4 accent-stone-700" />
            <span>
              <span className="block text-xs font-medium text-stone-700 dark:text-stone-300">同步时移除正文中的首个一级标题</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-stone-400">避免 Markdown 的 H1 与公众号文章标题重复，不修改本地文件。</span>
            </span>
          </label>

          {error && (
            <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>
          )}
          {result && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-stone-100 px-3 py-2.5 text-xs leading-5 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
              <Check size={14} className="mt-0.5 shrink-0" />
              <span>
                {result.updated ? "草稿已更新" : "新草稿已创建"}，上传正文图片 {result.uploadedImages} 张。
                <span className="mt-0.5 block break-all font-mono text-[10px] text-stone-400">media_id: {result.mediaId}</span>
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-stone-200 px-6 py-4 dark:border-stone-700">
          <span className="text-[11px] text-stone-400">
            {syncing ? "正在上传正文图片、封面并写入草稿箱，请勿关闭…" : "同步后仍需在公众号后台预览并发布。"}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={syncing} className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800">取消</button>
            <button type="submit" disabled={syncing} className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-[#20211f] px-3.5 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60">
              {syncing && <LoaderCircle size={15} className="animate-spin" />}
              {syncing ? "正在同步…" : mode === "update" ? "更新草稿" : "创建草稿"}
            </button>
          </div>
        </div>
      </form>
    </DialogShell>
  );
}

function DialogShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const scopeRef = useDialogFocus(onClose);
  return (
    <div
      ref={scopeRef}
      tabIndex={-1}
      className="fixed inset-0 z-[90] grid place-items-center bg-black/30 p-5 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="同步到公众号草稿箱" className="w-full max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-[#242522]">
        {children}
      </div>
    </div>
  );
}

function modeButtonClass(active: boolean): string {
  return clsx(
    "rounded-md px-2 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-35",
    active
      ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100"
      : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200",
  );
}
