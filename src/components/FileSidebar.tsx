import * as ScrollArea from "@radix-ui/react-scroll-area";
import { FileText, Plus, X } from "lucide-react";
import clsx from "clsx";
import type { OpenDocument } from "../types";

type Props = {
  documents: OpenDocument[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
};

export function FileSidebar({ documents, activeId, onSelect, onClose, onNew }: Props) {
  return (
    <aside className="flex h-full w-[230px] shrink-0 flex-col border-r border-stone-200 bg-[#f7f8f5]">
      <div className="flex h-14 items-center justify-between px-4">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">打开的文章</span>
        <button className="icon-button" onClick={onNew} title="新建文章"><Plus size={16} /></button>
      </div>
      <ScrollArea.Root className="min-h-0 flex-1">
        <ScrollArea.Viewport className="h-full w-full px-2 pb-4">
          <div className="space-y-1">
            {documents.map((document) => {
              const dirty = document.content !== document.savedContent;
              return (
                <button
                  key={document.id}
                  onClick={() => onSelect(document.id)}
                  className={clsx(
                    "group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition",
                    document.id === activeId ? "bg-white text-ink shadow-sm ring-1 ring-stone-200" : "text-stone-600 hover:bg-white/70",
                  )}
                >
                  <FileText size={15} className={document.id === activeId ? "text-moss-600" : "text-stone-400"} />
                  <span className="min-w-0 flex-1 truncate">{document.name}</span>
                  {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                  {documents.length > 1 && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="rounded p-0.5 opacity-0 hover:bg-stone-100 group-hover:opacity-100"
                      onClick={(event) => { event.stopPropagation(); onClose(document.id); }}
                    >
                      <X size={13} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="flex w-2.5 touch-none select-none p-0.5">
          <ScrollArea.Thumb className="flex-1 rounded-full bg-stone-300" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}
