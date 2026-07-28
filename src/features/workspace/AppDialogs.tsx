import { AlertTriangle } from "lucide-react";
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

type AppDialogsProps = {
  pendingClose: PendingClose | null;
  saveConflict: SaveConflict | null;
  conflictDocument?: OpenDocument;
  onCancelPendingClose: () => void;
  onDiscardPendingClose: () => void;
  onSavePendingClose: () => void;
  onCancelConflict: () => void;
  onSaveConflictAs: () => void;
  onReloadConflict: () => void;
  onOverwriteConflict: () => void;
};

/**
 * 集中承载会阻塞工作区操作的对话框。
 * App 只决定何时显示以及执行哪个动作，对话框本身负责文案和布局。
 */
export function AppDialogs({
  pendingClose,
  saveConflict,
  conflictDocument,
  onCancelPendingClose,
  onDiscardPendingClose,
  onSavePendingClose,
  onCancelConflict,
  onSaveConflictAs,
  onReloadConflict,
  onOverwriteConflict,
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
    </>
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
