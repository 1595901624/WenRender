import { useState } from "react";
import { ChevronDown, RotateCcw, Type, X } from "lucide-react";
import clsx from "clsx";
import {
  countTypographyOverrides,
  fontPresets,
  resolveArticleTypography,
  type FontPresetId,
  type HeadingKey,
  type HeadingScale,
  type HeadingTypographyOverride,
  type TypographyOverrides,
} from "../lib/typography";
import type { ArticleTheme } from "../lib/themes";

type Props = {
  theme: ArticleTheme;
  overrides: TypographyOverrides;
  onChange: (overrides: TypographyOverrides) => void;
  onReset: () => void;
  onClose: () => void;
};

const headings = [
  ["h1", "H1", "文章标题"],
  ["h2", "H2", "一级章节"],
  ["h3", "H3", "二级章节"],
  ["h4", "H4", "三级章节"],
  ["h5", "H5", "四级章节"],
  ["h6", "H6", "五级章节"],
] as const;

export function TypographyPanel({ theme, overrides, onChange, onReset, onClose }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const resolved = resolveArticleTypography(theme, overrides);
  const customCount = countTypographyOverrides(overrides);

  const updateHeading = (key: HeadingKey, patch: Partial<HeadingTypographyOverride>) => {
    const nextHeading = { ...overrides.headings?.[key], ...patch };
    onChange({
      ...overrides,
      headings: { ...overrides.headings, [key]: nextHeading },
    });
  };

  const resetHeading = (key: HeadingKey) => {
    const nextHeadings = { ...overrides.headings };
    delete nextHeadings[key];
    onChange({
      ...overrides,
      headings: Object.keys(nextHeadings).length > 0 ? nextHeadings : undefined,
    });
  };

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-stone-200 bg-[#fbfbfa] max-[1100px]:absolute max-[1100px]:bottom-0 max-[1100px]:right-0 max-[1100px]:top-0 max-[1100px]:z-30 max-[1100px]:shadow-2xl dark:border-stone-700 dark:bg-[#20211f]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-stone-200 px-4 dark:border-stone-700">
        <div className="flex min-w-0 items-center gap-2">
          <Type size={16} className="text-stone-500 dark:text-stone-400" />
          <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">文章排版</span>
          {customCount > 0 && (
            <span className="rounded-full bg-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 dark:bg-stone-700 dark:text-stone-300">
              {customCount}
            </span>
          )}
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭排版面板">
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-700">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-stone-800 dark:text-stone-200">
                {theme.name}
                {customCount > 0 && <span className="text-stone-400"> · 已自定义 {customCount} 项</span>}
              </div>
              <div className="mt-1 text-[11px] leading-4 text-stone-400">应用到所有使用此主题的文章</div>
            </div>
            <button
              type="button"
              disabled={customCount === 0}
              onClick={onReset}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:cursor-default disabled:opacity-35 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            >
              <RotateCcw size={12} />全部恢复
            </button>
          </div>
        </div>

        <PanelSection title="基础排版">
          <SelectSetting
            label="正文字体"
            value={overrides.bodyFontPreset ?? "theme"}
            onChange={(value) => onChange({
              ...overrides,
              bodyFontPreset: value === "theme" ? undefined : value as FontPresetId,
            })}
            options={[
              ["theme", `跟随主题（${theme.name}）`],
              ...fontPresets.map((item) => [item.id, item.name] as [string, string]),
            ]}
          />
          <RangeSetting
            label="正文字号"
            value={resolved.bodySize}
            min={14}
            max={20}
            step={1}
            suffix="px"
            customized={overrides.bodySize !== undefined}
            onChange={(value) => onChange({ ...overrides, bodySize: value })}
            onReset={() => onChange({ ...overrides, bodySize: undefined })}
          />
          <RangeSetting
            label="正文行高"
            value={resolved.bodyLineHeight}
            min={1.4}
            max={2.2}
            step={0.05}
            digits={2}
            customized={overrides.bodyLineHeight !== undefined}
            onChange={(value) => onChange({ ...overrides, bodyLineHeight: value })}
            onReset={() => onChange({ ...overrides, bodyLineHeight: undefined })}
          />
          <RangeSetting
            label="段落间距"
            value={resolved.paragraphSpacing}
            min={8}
            max={32}
            step={1}
            suffix="px"
            customized={overrides.paragraphSpacing !== undefined}
            onChange={(value) => onChange({ ...overrides, paragraphSpacing: value })}
            onReset={() => onChange({ ...overrides, paragraphSpacing: undefined })}
          />
          <SelectSetting
            label="标题字体"
            value={overrides.headingFontPreset ?? "theme"}
            onChange={(value) => onChange({
              ...overrides,
              headingFontPreset: value === "theme"
                ? undefined
                : value as FontPresetId | "body",
            })}
            options={[
              ["theme", "跟随主题"],
              ["body", "跟随正文"],
              ...fontPresets.map((item) => [item.id, item.name] as [string, string]),
            ]}
          />
        </PanelSection>

        <PanelSection title="标题层级">
          <div className="grid grid-cols-2 gap-1.5">
            {([
              [undefined, "主题默认"],
              ["compact", "紧凑"],
              ["standard", "标准"],
              ["prominent", "突出"],
            ] as Array<[HeadingScale | undefined, string]>).map(([value, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => onChange({ ...overrides, headingScale: value })}
                className={clsx(
                  "rounded-lg border px-2 py-2 text-xs font-medium transition",
                  overrides.headingScale === value
                    ? "border-stone-700 bg-stone-800 text-white dark:border-stone-300 dark:bg-stone-100 dark:text-stone-900"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-stone-700 dark:bg-[#292a27] dark:text-stone-300 dark:hover:border-stone-600",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-end justify-between rounded-lg bg-stone-100 px-3 py-2.5 dark:bg-stone-800/70">
            {headings.slice(0, 5).map(([key, label]) => (
              <div key={key} className="text-center">
                <div
                  className="font-semibold leading-none text-stone-700 dark:text-stone-200"
                  style={{ fontSize: Math.max(10, Math.min(18, resolved.headings[key].fontSize * 0.55)) }}
                >
                  Aa
                </div>
                <div className="mt-1.5 text-[9px] text-stone-400">{label} · {resolved.headings[key].fontSize}</div>
              </div>
            ))}
          </div>
        </PanelSection>

        <section className="border-b border-stone-200 dark:border-stone-700">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setAdvancedOpen((value) => !value)}
          >
            <div>
              <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">逐级调整</div>
              <div className="mt-1 text-[11px] text-stone-400">单独设置 H1～H6 的字号与间距</div>
            </div>
            <ChevronDown size={15} className={clsx("text-stone-400 transition", advancedOpen && "rotate-180")} />
          </button>
          {advancedOpen && (
            <div className="space-y-2 px-3 pb-4">
              {headings.map(([key, label, description]) => (
                <HeadingEditor
                  key={key}
                  headingKey={key}
                  label={label}
                  description={description}
                  value={resolved.headings[key]}
                  override={overrides.headings?.[key]}
                  onChange={(patch) => updateHeading(key, patch)}
                  onReset={() => resetHeading(key)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-stone-200 px-4 py-4 dark:border-stone-700">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{title}</div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SelectSetting({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-stone-700 dark:text-stone-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-xs text-stone-700 outline-none transition focus:border-stone-400 dark:border-stone-700 dark:bg-[#292a27] dark:text-stone-200 dark:focus:border-stone-500"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function RangeSetting({
  label,
  value,
  min,
  max,
  step,
  suffix,
  digits = 0,
  customized,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  digits?: number;
  customized: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-stone-700 dark:text-stone-300">{label}</span>
        <div className="flex items-center gap-1">
          <span className="min-w-12 text-right font-mono text-[11px] text-stone-500 dark:text-stone-400">
            {value.toFixed(digits)}{suffix}
          </span>
          <button
            type="button"
            disabled={!customized}
            className="grid h-5 w-5 place-items-center rounded text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 disabled:opacity-0 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            onClick={onReset}
            aria-label={`恢复${label}`}
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer accent-stone-800 dark:accent-stone-200"
      />
    </div>
  );
}

function HeadingEditor({
  headingKey,
  label,
  description,
  value,
  override,
  onChange,
  onReset,
}: {
  headingKey: HeadingKey;
  label: string;
  description: string;
  value: ReturnType<typeof resolveArticleTypography>["headings"][HeadingKey];
  override?: HeadingTypographyOverride;
  onChange: (patch: Partial<HeadingTypographyOverride>) => void;
  onReset: () => void;
}) {
  const customized = Boolean(override && Object.values(override).some((item) => item !== undefined));
  return (
    <details className="group rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-[#292a27]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
        <span className="grid h-7 w-8 place-items-center rounded-md bg-stone-100 text-[11px] font-bold text-stone-700 dark:bg-stone-800 dark:text-stone-200">{label}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-stone-800 dark:text-stone-200">{description}</span>
          <span className="mt-0.5 block text-[10px] text-stone-400">
            {value.fontSize}px / {value.fontWeight} / {value.lineHeight.toFixed(2)}
          </span>
        </span>
        {customized && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
        <ChevronDown size={14} className="text-stone-400 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-stone-100 px-3 pb-3 pt-3 dark:border-stone-700">
        <SelectSetting
          label="字体"
          value={override?.fontPreset ?? "heading"}
          onChange={(preset) => onChange({ fontPreset: preset === "heading" ? undefined : preset as FontPresetId })}
          options={[
            ["heading", "跟随标题字体"],
            ...fontPresets.map((item) => [item.id, item.name] as [string, string]),
          ]}
        />
        <RangeSetting
          label="字号"
          value={value.fontSize}
          min={14}
          max={40}
          step={1}
          suffix="px"
          customized={override?.fontSize !== undefined}
          onChange={(fontSize) => onChange({ fontSize })}
          onReset={() => onChange({ fontSize: undefined })}
        />
        <div className="grid grid-cols-2 gap-2">
          <SelectSetting
            label="字重"
            value={String(value.fontWeight)}
            onChange={(fontWeight) => onChange({ fontWeight: Number(fontWeight) as 500 | 600 | 700 })}
            options={[["500", "中等 500"], ["600", "半粗 600"], ["700", "粗体 700"]]}
          />
          <SelectSetting
            label="对齐"
            value={value.textAlign}
            onChange={(textAlign) => onChange({ textAlign: textAlign as "left" | "center" })}
            options={[["left", "左对齐"], ["center", "居中"]]}
          />
        </div>
        <RangeSetting
          label="标题行高"
          value={value.lineHeight}
          min={1.2}
          max={2}
          step={0.05}
          digits={2}
          customized={override?.lineHeight !== undefined}
          onChange={(lineHeight) => onChange({ lineHeight })}
          onReset={() => onChange({ lineHeight: undefined })}
        />
        <RangeSetting
          label="上方间距"
          value={value.marginTop}
          min={0}
          max={48}
          step={1}
          suffix="px"
          customized={override?.marginTop !== undefined}
          onChange={(marginTop) => onChange({ marginTop })}
          onReset={() => onChange({ marginTop: undefined })}
        />
        <RangeSetting
          label="下方间距"
          value={value.marginBottom}
          min={0}
          max={48}
          step={1}
          suffix="px"
          customized={override?.marginBottom !== undefined}
          onChange={(marginBottom) => onChange({ marginBottom })}
          onReset={() => onChange({ marginBottom: undefined })}
        />
        <button
          type="button"
          disabled={!customized}
          onClick={onReset}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-stone-100 px-3 py-2 text-[11px] font-medium text-stone-600 transition hover:bg-stone-200 disabled:cursor-default disabled:opacity-40 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
        >
          <RotateCcw size={12} />恢复 {headingKey.toUpperCase()} 默认设置
        </button>
      </div>
    </details>
  );
}
