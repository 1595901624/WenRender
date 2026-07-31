import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FilePlus2, Pencil, Trash2 } from "lucide-react";
import type { FileSnapshot, OpenDocument } from "../../types";

type PendingClose = {
  kind: "document" | "directory" | "application";
  documentIds: string[];
  directoryId?: string;
};

type SaveConflict = {
  documentId: string;
  reason: "modified" | "deleted";
  diskSnapshot?: FileSnapshot;
};

export type NewMarkdownTarget = {
  directoryName: string;
  directoryPath: string;
};

export type FileOperationRequest = {
  kind: "rename" | "delete";
  path: string;
  name: string;
  dirty: boolean;
};

type AppDialogsProps = {
  pendingClose: PendingClose | null;
  saveConflict: SaveConflict | null;
  conflictDocument?: OpenDocument;
  newMarkdownTarget: NewMarkdownTarget | null;
  fileOperation: FileOperationRequest | null;
  onCancelPendingClose: () => void;
  onDiscardPendingClose: () => void;
  onSavePendingClose: () => void;
  onCancelConflict: () => void;
  onSaveConflictAs: () => void;
  onReloadConflict: () => void;
  onOverwriteConflict: () => void;
  onCancelNewMarkdown: () => void;
  onCreateNewMarkdown: (name: string) => Promise<boolean>;
  onCancelFileOperation: () => void;
  onRenameFile: (name: string) => Promise<boolean>;
  onDeleteFile: () => Promise<boolean>;
};

/**
 * 集中承载会阻塞工作区操作的对话框。
 * App 只决定何时显示以及执行哪个动作，对话框本身负责文案和布局。
 */
export function AppDialogs({
  pendingClose,
  saveConflict,
  conflictDocument,
  newMarkdownTarget,
  fileOperation,
  onCancelPendingClose,
  onDiscardPendingClose,
  onSavePendingClose,
  onCancelConflict,
  onSaveConflictAs,
  onReloadConflict,
  onOverwriteConflict,
  onCancelNewMarkdown,
  onCreateNewMarkdown,
  onCancelFileOperation,
  onRenameFile,
  onDeleteFile,
}: AppDialogsProps) {
  return (
    <>
      {pendingClose && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/25 p-5 backdrop-blur-[1px]">
          <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-700 dark:bg-[#242522]">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
                <AlertTriangle size={18} />
              </span>
              <div>
                <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">存在未保存的修改</h2>
                <p className="mt-1.5 text-sm leading-6 text-stone-500 dark:text-stone-400">
                  {pendingClose.kind === "application"
                    ? `退出前还有 ${pendingClose.documentIds.length} 个文档需要保存。`
                    : pendingClose.kind === "directory"
                      ? `该目录中还有 ${pendingClose.documentIds.length} 个文档需要保存。`
                      : "关闭后，尚未保存到文件的修改将会丢失。"}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" onClick={onCancelPendingClose}>取消</button>
              <button className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40" onClick={onDiscardPendingClose}>不保存</button>
              <button className="rounded-lg bg-[#20211f] px-3.5 py-2 text-sm font-medium text-white hover:bg-black" onClick={onSavePendingClose}>保存并继续</button>
            </div>
          </div>
        </div>
      )}

      {saveConflict && conflictDocument && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/30 p-5 backdrop-blur-[1px]">
          <div role="alertdialog" aria-modal="true" className="flex max-h-[88vh] w-full max-w-5xl flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-700 dark:bg-[#242522]">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300">
                <AlertTriangle size={18} />
              </span>
              <div>
                <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                  {saveConflict.reason === "deleted" ? "磁盘文件已被删除" : "文件存在外部修改"}
                </h2>
                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                  {saveConflict.reason === "deleted"
                    ? "可以重新创建原文件，或者将当前内容保存到其它位置。"
                    : "为避免覆盖其它程序的修改，保存已暂停。请比较两个版本后选择处理方式。"}
                </p>
              </div>
            </div>

            {saveConflict.diskSnapshot && (
              <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-hidden">
                <ConflictPane title="磁盘版本" content={saveConflict.diskSnapshot.content} />
                <ConflictPane title="WenRender 中的版本" content={conflictDocument.content} />
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" onClick={onCancelConflict}>取消</button>
              <button className="rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" onClick={onSaveConflictAs}>另存为</button>
              {saveConflict.diskSnapshot && (
                <button className="rounded-lg px-3 py-2 text-sm text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/40" onClick={onReloadConflict}>使用磁盘版本</button>
              )}
              <button className="rounded-lg bg-[#20211f] px-3.5 py-2 text-sm font-medium text-white hover:bg-black" onClick={onOverwriteConflict}>
                {saveConflict.reason === "deleted" ? "重新创建原文件" : "使用当前版本覆盖"}
              </button>
            </div>
          </div>
        </div>
      )}

      {newMarkdownTarget && (
        <NewMarkdownDialog
          key={newMarkdownTarget.directoryPath}
          target={newMarkdownTarget}
          onCancel={onCancelNewMarkdown}
          onCreate={onCreateNewMarkdown}
        />
      )}
      {fileOperation?.kind === "rename" && (
        <RenameFileDialog
          key={fileOperation.path}
          request={fileOperation}
          onCancel={onCancelFileOperation}
          onRename={onRenameFile}
        />
      )}
      {fileOperation?.kind === "delete" && (
        <DeleteFileDialog
          key={fileOperation.path}
          request={fileOperation}
          onCancel={onCancelFileOperation}
          onDelete={onDeleteFile}
        />
      )}
    </>
  );
}

function RenameFileDialog({
  request,
  onCancel,
  onRename,
}: {
  request: FileOperationRequest;
  onCancel: () => void;
  onRename: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(request.name);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const extensionIndex = request.name.lastIndexOf(".");
    input.setSelectionRange(0, extensionIndex > 0 ? extensionIndex : request.name.length);
  }, [request.name]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const renamed = await onRename(name);
    if (!renamed) setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-black/30 p-5 backdrop-blur-[1px]">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-file-title"
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-700 dark:bg-[#242522]"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
            <Pencil size={17} />
          </span>
          <div className="min-w-0">
            <h2 id="rename-file-title" className="text-base font-semibold text-stone-900 dark:text-stone-100">重命名文件</h2>
            <p className="mt-1 truncate text-sm text-stone-500 dark:text-stone-400" title={request.path}>{request.path}</p>
          </div>
        </div>
        <label className="mt-5 block">
          <span className="text-xs font-medium text-stone-600 dark:text-stone-300">新文件名</span>
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={submitting}
            className="mt-1.5 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200 disabled:opacity-60 dark:border-stone-600 dark:bg-[#1d1e1b] dark:text-stone-100 dark:focus:ring-stone-700"
          />
          <span className="mt-1.5 block text-[11px] text-stone-400">文件会留在原目录；请保留需要的扩展名。</span>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={submitting} className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-60 dark:text-stone-300 dark:hover:bg-stone-800">取消</button>
          <button type="submit" disabled={submitting || !name.trim()} className="rounded-lg bg-[#20211f] px-3.5 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60">
            {submitting ? "正在重命名…" : "重命名"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DeleteFileDialog({
  request,
  onCancel,
  onDelete,
}: {
  request: FileOperationRequest;
  onCancel: () => void;
  onDelete: () => Promise<boolean>;
}) {
  const [submitting, setSubmitting] = useState(false);

  const remove = async () => {
    if (submitting) return;
    setSubmitting(true);
    const deleted = await onDelete();
    if (!deleted) setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-black/30 p-5 backdrop-blur-[1px]">
      <div role="alertdialog" aria-modal="true" aria-labelledby="delete-file-title" className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-700 dark:bg-[#242522]">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
            <Trash2 size={17} />
          </span>
          <div className="min-w-0">
            <h2 id="delete-file-title" className="text-base font-semibold text-stone-900 dark:text-stone-100">将文件移到回收站？</h2>
            <p className="mt-1.5 text-sm leading-6 text-stone-500 dark:text-stone-400">
              「{request.name}」会移入操作系统回收站，通常可以从回收站恢复。
            </p>
          </div>
        </div>
        {request.dirty && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            这个文件在编辑器中有未保存修改。继续后，这些修改不会写入回收站中的文件。
          </div>
        )}
        <p className="mt-4 truncate font-mono text-[11px] text-stone-400" title={request.path}>{request.path}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={submitting} className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-60 dark:text-stone-300 dark:hover:bg-stone-800">取消</button>
          <button type="button" onClick={() => void remove()} disabled={submitting} className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
            {submitting ? "正在移动…" : "移到回收站"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewMarkdownDialog({
  target,
  onCancel,
  onCreate,
}: {
  target: NewMarkdownTarget;
  onCancel: () => void;
  onCreate: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const created = await onCreate(name);
    if (!created) setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-black/30 p-5 backdrop-blur-[1px]">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-700 dark:bg-[#242522]">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
            <FilePlus2 size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">新建 Markdown 文件</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">将在「{target.directoryName}」中直接创建文件。</p>
          </div>
        </div>
        <label className="mt-5 block">
          <span className="text-xs font-medium text-stone-600 dark:text-stone-300">文件名</span>
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：活动策划"
            disabled={submitting}
            className="mt-1.5 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-500 focus:ring-2 focus:ring-stone-200 disabled:opacity-60 dark:border-stone-600 dark:bg-[#1d1e1b] dark:text-stone-100 dark:focus:ring-stone-700"
          />
          <span className="mt-1.5 block text-[11px] text-stone-400">留空扩展名时会自动补为 .md</span>
        </label>
        <p className="mt-3 truncate text-[11px] text-stone-400" title={target.directoryPath}>{target.directoryPath}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-60 dark:text-stone-300 dark:hover:bg-stone-800" onClick={onCancel} disabled={submitting}>取消</button>
          <button type="submit" className="rounded-lg bg-[#20211f] px-3.5 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60" disabled={submitting}>
            {submitting ? "正在创建…" : "创建文件"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConflictPane({ title, content }: { title: string; content: string }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-[#1d1e1b]">
      <div className="shrink-0 border-b border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600 dark:border-stone-700 dark:text-stone-300">{title}</div>
      <pre className="min-h-40 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-6 text-stone-700 dark:text-stone-300">{content}</pre>
    </section>
  );
}
