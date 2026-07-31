import { Copy, Download, Palette, RotateCcw, Trash2, Upload, X } from "lucide-react";
import type {
  ArticleTheme,
  CodeBlockStyle,
  HeadingStyle,
  ImageCaptionStyle,
  ImageShadow,
  LinkStyle,
  TableStyle,
} from "../lib/themes";

type Props = {
  theme: ArticleTheme;
  onChange: (theme: ArticleTheme) => void;
  onDuplicate: () => void;
  onImport: () => void;
  onExport: () => void;
  onDelete: () => void;
  onClose: () => void;
};

const colorSettings: Array<[keyof ArticleTheme["colors"], string]> = [
  ["accent", "主题色"],
  ["accentSoft", "浅主题色"],
  ["heading", "标题文字"],
  ["text", "正文文字"],
  ["muted", "辅助文字"],
  ["link", "链接颜色"],
  ["border", "边框颜色"],
  ["inlineCodeBackground", "行内代码背景"],
  ["codeBackground", "代码块背景"],
  ["articleBackground", "文章背景"],
];

export function ThemeEditorPanel({
  theme,
  onChange,
  onDuplicate,
  onImport,
  onExport,
  onDelete,
  onClose,
}: Props) {
  const updateColor = (key: keyof ArticleTheme["colors"], value: string) => {
    const colors = { ...theme.colors, [key]: value };
    onChange({
      ...theme,
      colors,
      swatches: [colors.accent, colors.accentSoft, colors.codeBackground],
    });
  };
  const updateAppearance = <K extends keyof ArticleTheme["appearance"]>(
    key: K,
    value: ArticleTheme["appearance"][K],
  ) => onChange({ ...theme, appearance: { ...theme.appearance, [key]: value } });

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-stone-200 bg-[#fbfbfa] max-[1180px]:absolute max-[1180px]:bottom-0 max-[1180px]:right-0 max-[1180px]:top-0 max-[1180px]:z-30 max-[1180px]:shadow-2xl dark:border-stone-700 dark:bg-[#20211f]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-stone-200 px-4 dark:border-stone-700">
        <div className="flex min-w-0 items-center gap-2">
          <Palette size={16} className="text-stone-500" />
          <span className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">主题编辑器</span>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭主题编辑器"><X size={16} /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <PanelSection title="主题信息">
          <TextSetting label="名称" value={theme.name} onChange={(name) => onChange({ ...theme, name })} />
          <TextSetting label="说明" value={theme.description} onChange={(description) => onChange({ ...theme, description })} />
          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton icon={Copy} label="复制主题" onClick={onDuplicate} />
            <ActionButton icon={Download} label="导出 JSON" onClick={onExport} />
            <ActionButton icon={Upload} label="导入主题" onClick={onImport} />
            <ActionButton icon={Trash2} label="删除主题" onClick={onDelete} danger />
          </div>
        </PanelSection>

        <PanelSection title="主题颜色">
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {colorSettings.map(([key, label]) => (
              <ColorSetting key={key} label={label} value={theme.colors[key]} onChange={(value) => updateColor(key, value)} />
            ))}
          </div>
        </PanelSection>

        <PanelSection title="标题与内容组件">
          <SelectSetting
            label="标题装饰"
            value={theme.appearance.headingStyle}
            onChange={(value) => updateAppearance("headingStyle", value as HeadingStyle)}
            options={[
              ["underline", "下划线"], ["left-bar", "左侧竖线"], ["filled", "浅色填充"],
              ["centered", "居中分隔"], ["boxed", "描边方框"], ["marker", "马克笔"],
              ["double-line", "上下双线"], ["minimal", "极简细线"], ["tag", "标签"],
              ["newspaper", "报刊标题"],
            ]}
          />
          <p className="text-[10px] leading-4 text-stone-400">装饰会应用到文章中的 H1–H6 全部标题层级。</p>
          <SelectSetting
            label="引用块"
            value={theme.appearance.blockquoteStyle}
            onChange={(value) => updateAppearance("blockquoteStyle", value as ArticleTheme["appearance"]["blockquoteStyle"])}
            options={[["border", "左边框"], ["soft", "浅色背景"], ["quote", "上下分隔"], ["card", "卡片"]]}
          />
          <SelectSetting
            label="表格"
            value={theme.appearance.tableStyle ?? "accent-header"}
            onChange={(value) => updateAppearance("tableStyle", value as TableStyle)}
            options={[["accent-header", "主题色表头"], ["soft-header", "浅色表头"], ["minimal", "极简横线"], ["striped", "斑马纹"]]}
          />
          <SelectSetting
            label="链接"
            value={theme.appearance.linkStyle ?? "plain"}
            onChange={(value) => updateAppearance("linkStyle", value as LinkStyle)}
            options={[["plain", "纯色"], ["underline", "下划线"], ["accent-underline", "主题色底线"]]}
          />
          <SelectSetting
            label="代码块"
            value={theme.appearance.codeStyle ?? "bordered"}
            onChange={(value) => updateAppearance("codeStyle", value as CodeBlockStyle)}
            options={[["bordered", "边框"], ["flat", "无边框"], ["shadow", "阴影卡片"]]}
          />
          <RangeSetting label="代码块圆角" value={theme.appearance.codeRadius} min={0} max={20} onChange={(value) => updateAppearance("codeRadius", value)} />
        </PanelSection>

        <PanelSection title="图片与图注">
          <RangeSetting label="图片圆角" value={theme.appearance.imageRadius} min={0} max={28} onChange={(value) => updateAppearance("imageRadius", value)} />
          <SelectSetting
            label="图片阴影"
            value={theme.appearance.imageShadow ?? "none"}
            onChange={(value) => updateAppearance("imageShadow", value as ImageShadow)}
            options={[["none", "无"], ["soft", "柔和"], ["strong", "明显"]]}
          />
          <SelectSetting
            label="图注"
            value={theme.appearance.imageCaptionStyle ?? "none"}
            onChange={(value) => updateAppearance("imageCaptionStyle", value as ImageCaptionStyle)}
            options={[["none", "不显示"], ["muted", "左对齐"], ["centered", "居中"]]}
          />
          <p className="text-[10px] leading-4 text-stone-400">开启图注后，Markdown 图片的 alt 文本会显示在图片下方。</p>
        </PanelSection>

        <PanelSection title="高级：自定义 CSS">
          <textarea
            value={theme.customCss ?? ""}
            onChange={(event) => onChange({ ...theme, customCss: event.target.value })}
            spellCheck={false}
            placeholder={".wenrender-theme-content h2 {\n  letter-spacing: .12em;\n}"}
            className="h-44 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 font-mono text-[11px] leading-5 text-stone-700 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-[#292a27] dark:text-stone-200"
          />
          <div className="flex items-start gap-1.5 text-[10px] leading-4 text-stone-400">
            <RotateCcw size={11} className="mt-0.5 shrink-0" />
            <span>建议将选择器限定在 <code>.wenrender-theme-content</code> 内。自定义 CSS 会进入预览、HTML 和复制内容，但公众号可能过滤部分规则。</span>
          </div>
        </PanelSection>
      </div>
    </aside>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 border-b border-stone-200 px-4 py-4 dark:border-stone-700">
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{title}</div>
    {children}
  </section>;
}

function TextSetting({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block">
    <span className="mb-1.5 block text-xs font-medium text-stone-700 dark:text-stone-300">{label}</span>
    <input value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-xs text-stone-700 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-[#292a27] dark:text-stone-200" />
  </label>;
}

function ColorSetting({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>
    <span className="mb-1.5 block text-[11px] text-stone-500 dark:text-stone-400">{label}</span>
    <span className="flex h-8 items-center gap-2 rounded-lg border border-stone-200 bg-white px-2 dark:border-stone-700 dark:bg-[#292a27]">
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" />
      <input value={value} maxLength={7} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-[10px] text-stone-600 outline-none dark:text-stone-300" />
    </span>
  </label>;
}

function SelectSetting({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="block">
    <span className="mb-1.5 block text-xs font-medium text-stone-700 dark:text-stone-300">{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-xs text-stone-700 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-[#292a27] dark:text-stone-200">
      {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>
  </label>;
}

function RangeSetting({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="block">
    <span className="mb-1.5 flex justify-between text-xs font-medium text-stone-700 dark:text-stone-300"><span>{label}</span><span className="font-mono text-[10px] text-stone-400">{value}px</span></span>
    <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-1.5 w-full cursor-pointer accent-stone-800 dark:accent-stone-200" />
  </label>;
}

function ActionButton({ icon: Icon, label, onClick, danger = false }: { icon: typeof Copy; label: string; onClick: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`flex h-8 items-center justify-center gap-1.5 rounded-lg border text-[11px] transition ${danger ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30" : "border-stone-200 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"}`}>
    <Icon size={13} />{label}
  </button>;
}
