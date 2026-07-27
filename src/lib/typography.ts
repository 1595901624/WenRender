import type { ArticleTheme } from "./themes";

export type FontPresetId = "system-sans" | "humanist-sans" | "serif";
export type HeadingScale = "compact" | "standard" | "prominent";
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type HeadingKey = `h${HeadingLevel}`;
export type TextAlign = "left" | "center";

export type HeadingTypographyOverride = {
  fontPreset?: FontPresetId;
  fontSize?: number;
  fontWeight?: 500 | 600 | 700;
  lineHeight?: number;
  marginTop?: number;
  marginBottom?: number;
  textAlign?: TextAlign;
};

export type TypographyOverrides = {
  bodyFontPreset?: FontPresetId;
  headingFontPreset?: FontPresetId | "body";
  bodySize?: number;
  bodyLineHeight?: number;
  paragraphSpacing?: number;
  headingScale?: HeadingScale;
  headings?: Partial<Record<HeadingKey, HeadingTypographyOverride>>;
};

export type TypographyOverridesByTheme = Record<string, TypographyOverrides>;

export type ResolvedHeadingTypography = {
  fontFamily: string;
  fontSize: number;
  fontWeight: 500 | 600 | 700;
  lineHeight: number;
  marginTop: number;
  marginBottom: number;
  textAlign: TextAlign;
};

export type ResolvedArticleTypography = {
  bodyFontFamily: string;
  headingFontFamily: string;
  bodySize: number;
  bodyLineHeight: number;
  paragraphSpacing: number;
  headings: Record<HeadingKey, ResolvedHeadingTypography>;
};

export const fontPresets: Array<{ id: FontPresetId; name: string; description: string; family: string }> = [
  {
    id: "system-sans",
    name: "系统黑体",
    description: "清晰稳定，适合技术文章",
    family: "-apple-system,BlinkMacSystemFont,'Helvetica Neue','PingFang SC','Microsoft YaHei',sans-serif",
  },
  {
    id: "humanist-sans",
    name: "人文黑体",
    description: "字形柔和，适合长文阅读",
    family: "'Avenir Next',Avenir,'PingFang SC','Microsoft YaHei',sans-serif",
  },
  {
    id: "serif",
    name: "中文宋体",
    description: "更具书刊感，适合人文内容",
    family: "'Noto Serif SC','Songti SC',SimSun,serif",
  },
];

const scaleOffsets: Record<HeadingScale, [number, number, number, number, number, number]> = {
  compact: [10, 5, 2, 1, 0, -1],
  standard: [13, 6, 3, 1, 0, -1],
  prominent: [16, 8, 4, 2, 1, 0],
};

const headingKeys: HeadingKey[] = ["h1", "h2", "h3", "h4", "h5", "h6"];

function fontFamily(preset: FontPresetId | undefined, fallback: string): string {
  return fontPresets.find((item) => item.id === preset)?.family ?? fallback;
}

function defaultHeadingAlignment(theme: ArticleTheme, level: HeadingLevel): TextAlign {
  if (level === 1) return theme.appearance.h1Align;
  if (
    level === 2
    && ["centered", "double-line", "newspaper"].includes(theme.appearance.headingStyle)
  ) {
    return "center";
  }
  return "left";
}

export function resolveArticleTypography(
  theme: ArticleTheme,
  overrides: TypographyOverrides = {},
): ResolvedArticleTypography {
  const bodyFontFamily = fontFamily(overrides.bodyFontPreset, theme.typography.fontFamily);
  const headingFontFamily = overrides.headingFontPreset === "body"
    ? bodyFontFamily
    : fontFamily(overrides.headingFontPreset, theme.typography.fontFamily);
  const bodySize = overrides.bodySize ?? theme.typography.bodySize;
  const themeSizes = [
    theme.typography.h1Size,
    theme.typography.h2Size,
    18,
    16,
    16,
    15,
  ];
  const scaledSizes = overrides.headingScale
    ? scaleOffsets[overrides.headingScale].map((offset) => bodySize + offset)
    : themeSizes;

  const headings = Object.fromEntries(headingKeys.map((key, index) => {
    const level = (index + 1) as HeadingLevel;
    const item = overrides.headings?.[key] ?? {};
    const isTitle = level === 1;
    const isSection = level === 2;
    return [key, {
      fontFamily: fontFamily(item.fontPreset, headingFontFamily),
      fontSize: item.fontSize ?? scaledSizes[index],
      fontWeight: item.fontWeight ?? 700,
      lineHeight: item.lineHeight ?? (isTitle ? 1.45 : 1.5),
      marginTop: item.marginTop ?? (isTitle ? 0 : isSection ? 34 : 28),
      marginBottom: item.marginBottom ?? (isTitle ? 30 : isSection ? 22 : 13),
      textAlign: item.textAlign ?? defaultHeadingAlignment(theme, level),
    }];
  })) as Record<HeadingKey, ResolvedHeadingTypography>;

  return {
    bodyFontFamily,
    headingFontFamily,
    bodySize,
    bodyLineHeight: overrides.bodyLineHeight ?? theme.typography.bodyLineHeight,
    paragraphSpacing: overrides.paragraphSpacing ?? theme.typography.paragraphSpacing,
    headings,
  };
}

export function parseTypographyOverrides(value: string | null): TypographyOverridesByTheme {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as TypographyOverridesByTheme
      : {};
  } catch {
    return {};
  }
}

export function countTypographyOverrides(overrides: TypographyOverrides): number {
  const basicCount = [
    overrides.bodyFontPreset,
    overrides.headingFontPreset,
    overrides.bodySize,
    overrides.bodyLineHeight,
    overrides.paragraphSpacing,
    overrides.headingScale,
  ].filter((value) => value !== undefined).length;
  const headingCount = Object.values(overrides.headings ?? {}).reduce(
    (count, heading) => count + Object.values(heading ?? {}).filter((value) => value !== undefined).length,
    0,
  );
  return basicCount + headingCount;
}

