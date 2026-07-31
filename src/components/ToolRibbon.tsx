import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Blocks,
  Braces,
  Check,
  ChevronDown,
  Clipboard,
  CloudUpload,
  FileDown,
  FileInput,
  FileText,
  Focus,
  Link2,
  Minimize2,
  Newspaper,
  Pin,
  PinOff,
  Printer,
  Save,
  Type,
  X,
} from "lucide-react";
import type { CodeTheme } from "../lib/codeThemes";

type Props = {
  pinned: boolean;
  focusMode: boolean;
  syncScroll: boolean;
  typographyCustomCount: number;
  codeThemes: CodeTheme[];
  selectedCodeThemeId: string;
  onTogglePinned: () => void;
  onClose: () => void;
  onTypography: () => void;
  onBlocks: () => void;
  onToggleFocus: () => void;
  onToggleSyncScroll: () => void;
  onSelectCodeTheme: (id: string) => void;
  onWechatDraft: () => void;
  onUploadImages: () => void;
  onImportHtml: () => void;
  onImportDocx: () => void;
  onCopyMarkdown: () => void;
  onCopyUnstyled: () => void;
  onExportHtml: () => void;
  onExportPdf: () => void;
  onExportText: () => void;
  onSaveAs: () => void;
};

export function ToolRibbon({
  pinned,
  focusMode,
  syncScroll,
  typographyCustomCount,
  codeThemes,
  selectedCodeThemeId,
  onTogglePinned,
  onClose,
  onTypography,
  onBlocks,
  onToggleFocus,
  onToggleSyncScroll,
  onSelectCodeTheme,
  onWechatDraft,
  onUploadImages,
  onImportHtml,
  onImportDocx,
  onCopyMarkdown,
  onCopyUnstyled,
  onExportHtml,
  onExportPdf,
  onExportText,
  onSaveAs,
}: Props) {
  const selectedCodeTheme = codeThemes.find((theme) => theme.id === selectedCodeThemeId);

  return (
    <div id="tool-ribbon" className="flex h-12 shrink-0 items-center border-b border-stone-200 bg-[#fbfcfb] px-3 dark:border-stone-700 dark:bg-[#1f201e]">
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="ribbon-label">写作</span>
        <button type="button" className="ribbon-button" onClick={onTypography}>
          <Type size={15} />排版
          {typographyCustomCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
        </button>
        <button type="button" className="ribbon-button" onClick={onBlocks}><Blocks size={15} />内容块</button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="ribbon-button" aria-label="选择代码主题">
              <Braces size={15} />{selectedCodeTheme?.name ?? "代码主题"}<ChevronDown size={12} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content sideOffset={6} align="start" className="z-[60] min-w-52 rounded-xl border border-stone-200 bg-white p-1.5 text-sm shadow-xl dark:border-stone-600 dark:bg-[#292a27]">
              {codeThemes.map((theme) => (
                <DropdownMenu.Item key={theme.id} onSelect={() => onSelectCodeTheme(theme.id)} className="menu-item">
                  {theme.id === selectedCodeThemeId ? <Check size={14} /> : <span className="w-3.5" />}{theme.name}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <span className="mx-1 h-5 w-px shrink-0 bg-stone-200 dark:bg-stone-700" />
        <span className="ribbon-label">视图</span>
        <button
          type="button"
          className="ribbon-icon-button"
          onClick={onToggleFocus}
          aria-pressed={focusMode}
          aria-label={focusMode ? "退出专注模式" : "进入专注模式"}
          title={focusMode ? "退出专注模式" : "进入专注模式"}
        >
          {focusMode ? <Minimize2 size={16} /> : <Focus size={16} />}
        </button>
        <button
          type="button"
          className={syncScroll ? "ribbon-icon-button ribbon-icon-button-active" : "ribbon-icon-button"}
          onClick={onToggleSyncScroll}
          aria-pressed={syncScroll}
          aria-label={syncScroll ? "关闭同步滚动" : "开启同步滚动"}
          title={syncScroll ? "同步滚动已开启" : "同步滚动已关闭"}
        >
          <Link2 size={16} />
        </button>

        <span className="mx-1 h-5 w-px shrink-0 bg-stone-200 dark:bg-stone-700" />
        <span className="ribbon-label">发布</span>
        <button type="button" className="ribbon-icon-button" onClick={onWechatDraft} aria-label="同步到公众号草稿箱" title="同步到公众号草稿箱"><Newspaper size={16} /></button>
        <button type="button" className="ribbon-icon-button" onClick={onUploadImages} aria-label="上传文章图片" title="上传文章图片"><CloudUpload size={16} /></button>

        <span className="mx-1 h-5 w-px shrink-0 bg-stone-200 dark:bg-stone-700" />
        <span className="ribbon-label">转换</span>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="ribbon-button"><FileDown size={15} />导入与导出<ChevronDown size={12} /></button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content sideOffset={6} align="end" className="z-[60] min-w-52 rounded-xl border border-stone-200 bg-white p-1.5 text-sm shadow-xl dark:border-stone-600 dark:bg-[#292a27]">
              <DropdownMenu.Label className="px-2.5 py-1 text-[10px] font-medium text-stone-500 dark:text-stone-300">导入</DropdownMenu.Label>
              <DropdownMenu.Item onSelect={onImportHtml} className="menu-item"><FileInput size={15} />导入 HTML</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={onImportDocx} className="menu-item"><FileInput size={15} />导入 DOCX</DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-stone-100 dark:bg-stone-700" />
              <DropdownMenu.Label className="px-2.5 py-1 text-[10px] font-medium text-stone-500 dark:text-stone-300">复制与导出</DropdownMenu.Label>
              <DropdownMenu.Item onSelect={onCopyMarkdown} className="menu-item"><Clipboard size={15} />复制 Markdown</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={onCopyUnstyled} className="menu-item"><Clipboard size={15} />复制无样式富文本</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={onExportHtml} className="menu-item"><FileDown size={15} />导出 HTML</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={onExportPdf} className="menu-item"><Printer size={15} />导出 PDF（打印）</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={onExportText} className="menu-item"><FileText size={15} />导出纯文本</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={onSaveAs} className="menu-item"><Save size={15} />另存为 Markdown</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="ml-2 flex shrink-0 items-center gap-0.5 border-l border-stone-200 pl-2 dark:border-stone-700">
        <button type="button" className="icon-button" onClick={onTogglePinned} aria-pressed={pinned} aria-label={pinned ? "取消固定工具栏" : "固定工具栏"} title={pinned ? "取消固定" : "固定工具栏"}>
          {pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button type="button" className="icon-button" onClick={onClose} aria-label="收起工具栏" title="收起工具栏"><X size={14} /></button>
      </div>
    </div>
  );
}
