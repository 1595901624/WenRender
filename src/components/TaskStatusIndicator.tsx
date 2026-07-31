import { AlertCircle, CheckCircle2, LoaderCircle, X } from "lucide-react";

export type TaskStatus = {
  id: string;
  label: string;
  detail?: string;
  state: "running" | "success" | "error";
};

export function TaskStatusIndicator({ task, onDismiss }: { task: TaskStatus | null; onDismiss: () => void }) {
  if (!task) return null;
  const Icon = task.state === "running" ? LoaderCircle : task.state === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[105] flex min-w-64 max-w-sm items-center gap-3 rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-stone-800 shadow-xl dark:border-stone-600 dark:bg-[#292a27] dark:text-stone-100"
    >
      <Icon size={17} className={task.state === "running" ? "animate-spin text-stone-500 dark:text-stone-300" : task.state === "error" ? "text-red-500" : "text-stone-700 dark:text-stone-200"} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{task.label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-stone-500 dark:text-stone-300">{task.detail ?? (task.state === "running" ? "正在处理，请稍候…" : task.state === "success" ? "已完成" : "操作失败")}</span>
      </span>
      {task.state !== "running" && <button type="button" onClick={onDismiss} className="rounded p-1 text-stone-500 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700" aria-label="关闭任务状态"><X size={13} /></button>}
    </div>
  );
}
