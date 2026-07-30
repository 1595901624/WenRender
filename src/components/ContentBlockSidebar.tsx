import { useMemo, useState } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import {
  Blocks,
  FileText,
  ListTree,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  normalizeContentBlockCommand,
  type ContentBlock,
} from "../lib/contentBlocks";

export type ContentBlockDraft = {
  id: string | null;
  title: string;
  command: string;
  content: string;
};

type Props = {
  blocks: ContentBlock[];
  canCaptureSelection: boolean;
  onReadSelection: () => string | null;
  onSave: (draft: ContentBlockDraft) => void;
  onDelete: (id: string) => void;
  onInsert: (content: string) => void;
  onShowFiles: () => void;
  onShowOutline: () => void;
  onShowSearch: () => void;
};

export function ContentBlockSidebar({
  blocks,
  canCaptureSelection,
  onReadSelection,
  onSave,
  onDelete,
  onInsert,
  onShowFiles,
  onShowOutline,
  onShowSearch,
}: Props) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<ContentBlockDraft | null>(null);
  const filteredBlocks = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return blocks;
    return blocks.filter((block) => (
      block.title.toLocaleLowerCase().includes(keyword)
      || block.command.toLocaleLowerCase().includes(keyword)
      || block.content.toLocaleLowerCase().includes(keyword)
    ));
  }, [blocks, query]);

  const beginFromSelection = () => {
    const content = onReadSelection();
    if (content === null) return;
    const title = suggestTitle(content);
    setDraft({ id: null, title, command: title, content });
  };

  const submitDraft = () => {
    if (!draft?.title.trim() || !draft.content.trim()) return;
    onSave({
      ...draft,
      title: draft.title.trim(),
      command: normalizeContentBlockCommand(draft.command || draft.title),
    });
    setDraft(null);
  };

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col bg-[#f3f3f1] px-2.5 pb-2.5 pt-2 dark:bg-[#171815]">
      <div className="flex h-10 shrink-0 items-center justify-between px-2">
        <div className="flex min-w-0 items-center gap-2">
          <Blocks size={16} className="text-stone-500 dark:text-stone-400" />
          <h2 className="text-sm font-semibold text-[#20211f] dark:text-stone-100">内容块</h2>
          <span className="text-[10px] tabular-nums text-stone-400">{blocks.length}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" className="icon-button" onClick={onShowSearch} title="全文搜索" aria-label="全文搜索">
            <Search size={16} />
          </button>
          <button type="button" className="icon-button" onClick={onShowOutline} title="文章大纲" aria-label="文章大纲">
            <ListTree size={16} />
          </button>
          <button type="button" className="icon-button" onClick={onShowFiles} title="返回文件" aria-label="返回文件">
            <FileText size={16} />
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 px-1 py-1">
        <button
          type="button"
          onClick={() => setDraft({ id: null, title: "", command: "", content: "" })}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2 text-xs font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
        >
          <Plus size={14} />新建
        </button>
        <button
          type="button"
          disabled={!canCaptureSelection}
          onClick={beginFromSelection}
          title={canCaptureSelection ? "把编辑器中的选中文字保存为内容块" : "请先切换到编辑或分栏模式"}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-xs font-medium text-stone-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
        >
          <Save size={14} />保存选区
        </button>
      </div>

      {draft && (
        <div className="mx-1 mt-2 rounded-xl border border-stone-200 bg-white p-2.5 shadow-sm dark:border-stone-700 dark:bg-stone-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">
              {draft.id ? "编辑内容块" : "新建内容块"}
            </span>
            <button type="button" onClick={() => setDraft(null)} className="rounded p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700" aria-label="关闭编辑">
              <X size={14} />
            </button>
          </div>
          <input
            autoFocus
            value={draft.title}
            maxLength={80}
            onChange={(event) => {
              const title = event.target.value;
              const commandFollowsTitle = !draft.command || draft.command === draft.title;
              setDraft({
                ...draft,
                title,
                command: commandFollowsTitle ? title : draft.command,
              });
            }}
            placeholder="内容块名称"
            className="mt-2 h-8 w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 text-xs text-stone-800 outline-none focus:border-stone-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500"
          />
          <div className="relative mt-2">
            <span className="pointer-events-none absolute left-2.5 top-1.5 font-mono text-xs text-stone-400">/</span>
            <input
              value={draft.command}
              maxLength={80}
              onChange={(event) => setDraft({
                ...draft,
                command: normalizeContentBlockCommand(event.target.value),
              })}
              placeholder={draft.title || "自定义命令"}
              aria-label="内容块命令"
              className="h-8 w-full rounded-lg border border-stone-200 bg-stone-50 pl-5 pr-2.5 font-mono text-xs text-stone-800 outline-none focus:border-stone-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500"
            />
          </div>
          <textarea
            value={draft.content}
            onChange={(event) => setDraft({ ...draft, content: event.target.value })}
            placeholder="输入可复用的 Markdown 内容"
            className="mt-2 h-32 w-full resize-y rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 font-mono text-[11px] leading-5 text-stone-700 outline-none focus:border-stone-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:focus:border-stone-500"
          />
          <button
            type="button"
            disabled={!draft.title.trim() || !draft.content.trim()}
            onClick={submitDraft}
            className="mt-2 h-8 w-full rounded-lg border border-stone-300 bg-stone-100 text-xs font-medium text-stone-700 transition hover:bg-stone-200 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-35 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600 dark:hover:text-white"
          >
            保存内容块
          </button>
        </div>
      )}

      <div className="relative mx-1 mt-2">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-2.5 text-stone-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索内容块"
          className="h-8 w-full rounded-lg border border-stone-200 bg-white pl-8 pr-7 text-xs text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:border-stone-500"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200" aria-label="清空搜索">
            <X size={13} />
          </button>
        )}
      </div>

      <ScrollArea.Root className="relative mt-2 min-h-0 min-w-0 flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full overflow-x-hidden overscroll-contain px-1 pb-4 [&>div]:!block [&>div]:!min-w-0 [&>div]:!w-full">
          {filteredBlocks.length === 0 ? (
            <div className="mt-2 rounded-xl border border-dashed border-stone-300 px-4 py-7 text-center dark:border-stone-700">
              <Blocks size={21} className="mx-auto text-stone-300 dark:text-stone-600" />
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                {blocks.length === 0 ? "还没有内容块" : "没有匹配的内容块"}
              </p>
              {blocks.length === 0 && <p className="mt-1 text-[10px] leading-4 text-stone-400">保存常用署名、引导语或 Markdown 模板</p>}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredBlocks.map((block) => (
                <article key={block.id} className="group rounded-xl border border-stone-200 bg-white p-2.5 transition hover:border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-stone-600">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => onInsert(block.content)} className="min-w-0 flex-1 text-left" title="插入到光标位置">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-700 dark:text-stone-200">{block.title}</h3>
                        <span className="max-w-24 truncate rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[9px] text-stone-400 dark:bg-stone-700">/{block.command}</span>
                      </span>
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-stone-500 dark:text-stone-400">
                        {block.content}
                      </p>
                    </button>
                    <div className="flex shrink-0 opacity-60 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setDraft({
                          id: block.id,
                          title: block.title,
                          command: block.command,
                          content: block.content,
                        })}
                        className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                        title="编辑"
                        aria-label={`编辑 ${block.title}`}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`确定删除内容块“${block.title}”吗？`)) onDelete(block.id);
                        }}
                        className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        title="删除"
                        aria-label={`删除 ${block.title}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onInsert(block.content)}
                    className="mt-2 h-7 w-full rounded-lg bg-stone-100 text-[11px] font-medium text-stone-600 transition hover:bg-stone-200 hover:text-stone-900 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600 dark:hover:text-white"
                  >
                    插入到文章
                  </button>
                </article>
              ))}
            </div>
          )}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="absolute bottom-0 right-0 top-0 flex w-2.5 touch-none select-none p-0.5">
          <ScrollArea.Thumb className="min-h-8 flex-1 rounded-full bg-stone-300 dark:bg-stone-700" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}

function suggestTitle(content: string): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s#>*+\-\d.)]+/, "").trim())
    .find(Boolean);
  return (firstLine ?? "未命名内容块").slice(0, 30);
}
