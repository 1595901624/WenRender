import { useEffect, useMemo, useRef, useState } from "react";
import { Command, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDialogFocus } from "../lib/dialogFocus";

export type PaletteCommand = {
  id: string;
  label: string;
  description?: string;
  group: string;
  keywords?: string;
  shortcut?: string;
  icon: LucideIcon;
  run: () => void;
};

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const scopeRef = useDialogFocus(open ? onClose : undefined);
  const matches = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return commands;
    const tokens = keyword.split(/\s+/).filter(Boolean);
    return commands.filter((command) => {
      const searchable = `${command.label} ${command.description ?? ""} ${command.group} ${command.keywords ?? ""}`.toLocaleLowerCase();
      return tokens.every((token) => searchable.includes(token));
    });
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, matches.length - 1)));
  }, [matches.length]);

  if (!open) return null;

  const choose = (command: PaletteCommand | undefined) => {
    if (!command) return;
    onClose();
    window.requestAnimationFrame(command.run);
  };

  return (
    <div
      ref={scopeRef}
      tabIndex={-1}
      className="fixed inset-0 z-[110] flex justify-center bg-black/35 px-4 pt-9 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="command-palette-title" className="flex h-fit max-h-[68vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-600 dark:bg-[#292a27]">
        <h2 id="command-palette-title" className="sr-only">命令面板</h2>
        <div className="flex h-16 shrink-0 items-center gap-3.5 border-b border-stone-200 px-5 dark:border-stone-600">
          <Search size={20} className="shrink-0 text-stone-500 dark:text-stone-300" />
          <input
            ref={inputRef}
            data-autofocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => matches.length ? (index + 1) % matches.length : 0);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => matches.length ? (index - 1 + matches.length) % matches.length : 0);
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(matches[activeIndex]);
              }
            }}
            placeholder="搜索命令，例如：导出 PDF、切换主题、插入内容块"
            aria-controls="command-palette-results"
            aria-activedescendant={matches[activeIndex] ? `command-${matches[activeIndex].id}` : undefined}
            className="h-16 min-w-0 flex-1 bg-transparent text-[15px] text-stone-900 outline-none placeholder:text-stone-500 dark:text-stone-100 dark:placeholder:text-stone-400"
          />
          <kbd className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-[10px] text-stone-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300">Esc</kbd>
        </div>
        <div id="command-palette-results" role="listbox" className="min-h-20 overflow-y-auto p-2">
          {matches.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-300">没有匹配的命令</div>
          ) : matches.map((command, index) => {
            const Icon = command.icon;
            return (
              <button
                id={`command-${command.id}`}
                key={command.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(command)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none ${index === activeIndex ? "bg-stone-100 dark:bg-stone-700" : "hover:bg-stone-50 dark:hover:bg-stone-800"}`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"><Icon size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-stone-800 dark:text-stone-100">{command.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-stone-500 dark:text-stone-300">{command.group}{command.description ? ` · ${command.description}` : ""}</span>
                </span>
                {command.shortcut && <kbd className="shrink-0 rounded border border-stone-200 px-1.5 py-0.5 text-[10px] text-stone-500 dark:border-stone-600 dark:text-stone-300">{command.shortcut}</kbd>}
              </button>
            );
          })}
        </div>
        <footer className="flex items-center gap-4 border-t border-stone-200 px-4 py-2 text-[10px] text-stone-500 dark:border-stone-600 dark:text-stone-300">
          <span>↑↓ 选择</span><span>Enter 执行</span><span>Esc 关闭</span><span className="ml-auto inline-flex items-center gap-1"><Command size={11} />命令面板</span>
        </footer>
      </section>
    </div>
  );
}
