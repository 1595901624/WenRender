import * as ScrollArea from "@radix-ui/react-scroll-area";
import { FileText, FolderOpen, PanelTopOpen, Plus, X } from "lucide-react";
import clsx from "clsx";
import type { OpenDocument } from "../types";

type Props = {
  documents: OpenDocument[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onOpenFiles: () => void;
  onOpenFolder: () => void;
};

export function FileSidebar({ documents, activeId, onSelect, onClose, onNew, onOpenFiles, onOpenFolder }: Props) {
  return (
    <aside className="flex h-full w-[252px] shrink-0 flex-col bg-[#f3f3f1] px-2.5 pb-2.5 pt-3">
      <div className="flex h-11 items-center justify-between px-2">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#20211f] text-sm font-black text-white">文</div>
          <div>
            <div className="text-sm font-semibold leading-none text-[#20211f]">文染</div>
            <div className="mt-1 text-[9px] uppercase tracking-[0.17em] text-stone-400">WenRender</div>
          </div>
        </div>
        <button className="icon-button" onClick={onNew} title="新建文章"><Plus size={17} /></button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 px-1">
        <button className="sidebar-action" onClick={onOpenFiles}><PanelTopOpen size={15} />打开文件</button>
        <button className="sidebar-action" onClick={onOpenFolder}><FolderOpen size={15} />打开目录</button>
      </div>
      <div className="mb-2 mt-5 flex items-center justify-between px-2">
        <span className="text-[11px] font-medium text-stone-500">文章</span>
        <span className="text-[10px] text-stone-400">{documents.length}</span>
      </div>
      <ScrollArea.Root className="min-h-0 flex-1">
        <ScrollArea.Viewport className="h-full w-full px-2 pb-4">
          <div className="space-y-1">
            {documents.map((document) => {
              const dirty = document.content !== document.savedContent;
              return (
                <button
                  key={document.id}
                  title={document.path ?? document.name}
                  onClick={() => onSelect(document.id)}
                  className={clsx(
                    "group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition",
                    document.id === activeId ? "bg-[#e7e7e4] text-[#20211f]" : "text-stone-600 hover:bg-[#eaeae7]",
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
