import { FileText, ListTree, Search } from "lucide-react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import clsx from "clsx";
import type { MarkdownHeading } from "../lib/articleTools";

type Props = {
  documentName: string;
  headings: MarkdownHeading[];
  activeHeadingId: string | null;
  onSelect: (heading: MarkdownHeading) => void;
  onShowFiles: () => void;
  onShowSearch: () => void;
};

export function OutlineSidebar({
  documentName,
  headings,
  activeHeadingId,
  onSelect,
  onShowFiles,
  onShowSearch,
}: Props) {
  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col bg-[#f3f3f1] px-2.5 pb-2.5 pt-2 dark:bg-[#171815]">
      <div className="flex h-10 shrink-0 items-center justify-between px-2">
        <div className="flex min-w-0 items-center gap-2">
          <ListTree size={16} className="shrink-0 text-stone-500 dark:text-stone-400" />
          <h2 className="text-sm font-semibold text-[#20211f] dark:text-stone-100">大纲</h2>
          <span className="text-[10px] tabular-nums text-stone-400">{headings.length}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" className="icon-button" onClick={onShowSearch} title="工作区全文搜索" aria-label="工作区全文搜索">
            <Search size={16} />
          </button>
          <button type="button" className="icon-button" onClick={onShowFiles} title="返回文件" aria-label="返回文件">
            <FileText size={16} />
          </button>
        </div>
      </div>

      <div className="mx-1 mb-2 mt-1 truncate rounded-lg bg-stone-200/60 px-2.5 py-2 text-[11px] text-stone-500 dark:bg-stone-800/70 dark:text-stone-400" title={documentName}>
        {documentName}
      </div>

      <ScrollArea.Root className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full overflow-x-hidden overscroll-contain px-1 pb-4 [&>div]:!block [&>div]:!min-w-0 [&>div]:!w-full">
          {headings.length === 0 ? (
            <div className="mx-1 mt-3 rounded-xl border border-dashed border-stone-300 px-3 py-6 text-center dark:border-stone-700">
              <ListTree size={20} className="mx-auto text-stone-300 dark:text-stone-600" />
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">当前文章还没有标题</p>
              <p className="mt-1 text-[10px] leading-4 text-stone-400">使用 # 到 ###### 创建标题</p>
            </div>
          ) : (
            <nav aria-label="文章大纲" className="space-y-0.5">
              {headings.map((heading) => (
                <button
                  key={heading.id}
                  type="button"
                  title={`第 ${heading.line} 行：${heading.text}`}
                  aria-current={activeHeadingId === heading.id ? "location" : undefined}
                  onClick={() => onSelect(heading)}
                  className={clsx(
                    "flex w-full min-w-0 items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-[13px] transition",
                    activeHeadingId === heading.id
                      ? "bg-[#dfe8e1] font-medium text-[#245f3d] dark:bg-[#293a2e] dark:text-emerald-300"
                      : "text-stone-600 hover:bg-[#eaeae7] dark:text-stone-400 dark:hover:bg-[#272825]",
                  )}
                  style={{ paddingLeft: 8 + Math.max(0, heading.level - 1) * 12 }}
                >
                  <span
                    className={clsx(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      activeHeadingId === heading.id ? "bg-[#2f8f5b]" : "bg-stone-300 dark:bg-stone-600",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{heading.text}</span>
                  <span className="shrink-0 text-[9px] tabular-nums text-stone-400">H{heading.level}</span>
                </button>
              ))}
            </nav>
          )}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="absolute bottom-0 right-0 top-0 flex w-2.5 touch-none select-none bg-[#f3f3f1]/90 p-0.5 dark:bg-[#171815]/90">
          <ScrollArea.Thumb className="min-h-8 flex-1 rounded-full bg-stone-300 hover:bg-stone-400 dark:bg-stone-700 dark:hover:bg-stone-600" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}
