export type HeadingStyle =
  | "underline"
  | "left-bar"
  | "filled"
  | "centered"
  | "boxed"
  | "marker"
  | "double-line"
  | "minimal"
  | "tag"
  | "newspaper";

export type TableStyle = "accent-header" | "soft-header" | "minimal" | "striped";
export type LinkStyle = "plain" | "underline" | "accent-underline";
export type CodeBlockStyle = "bordered" | "flat" | "shadow";
export type ImageShadow = "none" | "soft" | "strong";
export type ImageCaptionStyle = "none" | "muted" | "centered";

export type ArticleTheme = {
  // 主题同时描述预览和最终导出所需的完整视觉参数，避免渲染器硬编码某一套样式。
  id: string;
  name: string;
  description: string;
  custom?: boolean;
  customCss?: string;
  swatches: [string, string, string];
  colors: {
    accent: string;
    accentSoft: string;
    heading: string;
    text: string;
    muted: string;
    link: string;
    border: string;
    inlineCodeBackground: string;
    codeBackground: string;
    codeText: string;
    articleBackground: string;
  };
  typography: {
    fontFamily: string;
    bodySize: number;
    bodyLineHeight: number;
    paragraphSpacing: number;
    codeSize: number;
    codeLineHeight: number;
    h1Size: number;
    h2Size: number;
  };
  appearance: {
    headingStyle: HeadingStyle;
    h1Align: "left" | "center";
    blockquoteStyle: "border" | "soft" | "quote" | "card";
    tableStyle?: TableStyle;
    linkStyle?: LinkStyle;
    codeStyle?: CodeBlockStyle;
    codeRadius: number;
    imageRadius: number;
    imageShadow?: ImageShadow;
    imageCaptionStyle?: ImageCaptionStyle;
  };
};

const systemSans = "-apple-system,BlinkMacSystemFont,'Helvetica Neue','PingFang SC','Microsoft YaHei',sans-serif";
const humanistSans = "'Avenir Next',Avenir,'PingFang SC','Microsoft YaHei',sans-serif";
const serif = "'Noto Serif SC','Songti SC',SimSun,serif";

// 经典绿保持为默认主题，其余主题通过同一数据结构扩展，无需修改主题选择器。
export const articleThemes: ArticleTheme[] = [
  {
    id: "classic-green",
    name: "经典绿",
    description: "清爽克制，适合技术教程",
    swatches: ["#2f8f5b", "#f4f8f5", "#161819"],
    colors: {
      accent: "#2f8f5b", accentSoft: "#f4f8f5", heading: "#1f2329", text: "#333333",
      muted: "#6b756e", link: "#576b95", border: "#dce7df", inlineCodeBackground: "#f4f6f8",
      codeBackground: "#161819", codeText: "#abb2bf", articleBackground: "#ffffff",
    },
    typography: {
      fontFamily: systemSans, bodySize: 16, bodyLineHeight: 1.75, paragraphSpacing: 18,
      codeSize: 14, codeLineHeight: 1.75, h1Size: 29, h2Size: 21,
    },
    appearance: { headingStyle: "underline", h1Align: "left", blockquoteStyle: "border", codeRadius: 8, imageRadius: 4 },
  },
  {
    id: "minimal-mono",
    name: "极简黑白",
    description: "大量留白，专注长文阅读",
    swatches: ["#171717", "#f5f5f4", "#262626"],
    colors: {
      accent: "#171717", accentSoft: "#f5f5f4", heading: "#171717", text: "#292929",
      muted: "#737373", link: "#404040", border: "#d6d3d1", inlineCodeBackground: "#f5f5f4",
      codeBackground: "#262626", codeText: "#e5e5e5", articleBackground: "#ffffff",
    },
    typography: {
      fontFamily: systemSans, bodySize: 16, bodyLineHeight: 1.75, paragraphSpacing: 20,
      codeSize: 14, codeLineHeight: 1.7, h1Size: 30, h2Size: 21,
    },
    appearance: { headingStyle: "minimal", h1Align: "left", blockquoteStyle: "quote", codeRadius: 2, imageRadius: 0 },
  },
  {
    id: "deep-ocean",
    name: "深海科技",
    description: "冷静蓝调，适合工程与 AI",
    swatches: ["#1769aa", "#edf6fc", "#0d1b2a"],
    colors: {
      accent: "#1769aa", accentSoft: "#edf6fc", heading: "#102a43", text: "#243b53",
      muted: "#627d98", link: "#1769aa", border: "#c9e2f2", inlineCodeBackground: "#edf6fc",
      codeBackground: "#0d1b2a", codeText: "#c9d1d9", articleBackground: "#ffffff",
    },
    typography: {
      fontFamily: systemSans, bodySize: 16, bodyLineHeight: 1.75, paragraphSpacing: 18,
      codeSize: 14, codeLineHeight: 1.75, h1Size: 30, h2Size: 21,
    },
    appearance: { headingStyle: "left-bar", h1Align: "left", blockquoteStyle: "soft", codeRadius: 6, imageRadius: 6 },
  },
  {
    id: "warm-apricot",
    name: "暖杏手记",
    description: "温暖柔和，适合生活随笔",
    swatches: ["#c46b32", "#fff5e9", "#3c2a21"],
    colors: {
      accent: "#c46b32", accentSoft: "#fff5e9", heading: "#4a2c1b", text: "#4b3a30",
      muted: "#8a7162", link: "#a5542a", border: "#efd7c3", inlineCodeBackground: "#fff3e4",
      codeBackground: "#3c2a21", codeText: "#f3e9df", articleBackground: "#fffdf9",
    },
    typography: {
      fontFamily: humanistSans, bodySize: 16, bodyLineHeight: 1.75, paragraphSpacing: 20,
      codeSize: 14, codeLineHeight: 1.75, h1Size: 29, h2Size: 21,
    },
    appearance: { headingStyle: "marker", h1Align: "left", blockquoteStyle: "card", codeRadius: 10, imageRadius: 10 },
  },
  {
    id: "rouge-humanity",
    name: "胭脂人文",
    description: "含蓄红调，适合文化评论",
    swatches: ["#a33a46", "#fff0f1", "#2b2022"],
    colors: {
      accent: "#a33a46", accentSoft: "#fff0f1", heading: "#3d2025", text: "#3f3335",
      muted: "#80666a", link: "#8e3440", border: "#e8c9cd", inlineCodeBackground: "#fff1f2",
      codeBackground: "#2b2022", codeText: "#eadfe1", articleBackground: "#ffffff",
    },
    typography: {
      fontFamily: serif, bodySize: 16, bodyLineHeight: 1.75, paragraphSpacing: 20,
      codeSize: 14, codeLineHeight: 1.75, h1Size: 30, h2Size: 22,
    },
    appearance: { headingStyle: "centered", h1Align: "center", blockquoteStyle: "quote", codeRadius: 4, imageRadius: 2 },
  },
  {
    id: "violet-ideas",
    name: "紫雾灵感",
    description: "轻盈紫色，适合创意与产品",
    swatches: ["#7357b6", "#f5f1ff", "#211a2d"],
    colors: {
      accent: "#7357b6", accentSoft: "#f5f1ff", heading: "#33265a", text: "#3f3850",
      muted: "#7a708d", link: "#694fa8", border: "#ddd3f2", inlineCodeBackground: "#f4f0fb",
      codeBackground: "#211a2d", codeText: "#e8e1f3", articleBackground: "#ffffff",
    },
    typography: {
      fontFamily: humanistSans, bodySize: 16, bodyLineHeight: 1.75, paragraphSpacing: 18,
      codeSize: 14, codeLineHeight: 1.75, h1Size: 30, h2Size: 21,
    },
    appearance: { headingStyle: "boxed", h1Align: "left", blockquoteStyle: "soft", codeRadius: 12, imageRadius: 12 },
  },
  {
    id: "celadon",
    name: "青瓷雅集",
    description: "东方青色，雅致而安静",
    swatches: ["#317873", "#edf7f5", "#17312f"],
    colors: {
      accent: "#317873", accentSoft: "#edf7f5", heading: "#1e4541", text: "#334a47",
      muted: "#6b827f", link: "#2d6d69", border: "#c7dfdb", inlineCodeBackground: "#edf6f4",
      codeBackground: "#17312f", codeText: "#d7e7e4", articleBackground: "#fbfdfc",
    },
    typography: {
      fontFamily: serif, bodySize: 16, bodyLineHeight: 1.75, paragraphSpacing: 20,
      codeSize: 14, codeLineHeight: 1.8, h1Size: 30, h2Size: 22,
    },
    appearance: { headingStyle: "double-line", h1Align: "center", blockquoteStyle: "border", codeRadius: 3, imageRadius: 3 },
  },
  {
    id: "newsprint",
    name: "报刊铅字",
    description: "报纸专栏感，适合深度文章",
    swatches: ["#3f3b35", "#f4f1e8", "#24211d"],
    colors: {
      accent: "#3f3b35", accentSoft: "#f4f1e8", heading: "#201e1a", text: "#34312c",
      muted: "#746e64", link: "#514d45", border: "#bdb6a8", inlineCodeBackground: "#f1eee6",
      codeBackground: "#24211d", codeText: "#e8e3d8", articleBackground: "#fffef9",
    },
    typography: {
      fontFamily: serif, bodySize: 17, bodyLineHeight: 1.75, paragraphSpacing: 22,
      codeSize: 14, codeLineHeight: 1.75, h1Size: 31, h2Size: 22,
    },
    appearance: { headingStyle: "newspaper", h1Align: "center", blockquoteStyle: "quote", codeRadius: 0, imageRadius: 0 },
  },
  {
    id: "night-code",
    name: "夜航代码",
    description: "高对比霓虹，突出代码内容",
    swatches: ["#00a896", "#e8faf7", "#101820"],
    colors: {
      accent: "#008f82", accentSoft: "#e8faf7", heading: "#102a2a", text: "#263b3a",
      muted: "#627978", link: "#007f75", border: "#b9e2dc", inlineCodeBackground: "#e8f7f5",
      codeBackground: "#101820", codeText: "#d6e8e5", articleBackground: "#ffffff",
    },
    typography: {
      fontFamily: systemSans, bodySize: 16, bodyLineHeight: 1.75, paragraphSpacing: 18,
      codeSize: 14, codeLineHeight: 1.85, h1Size: 29, h2Size: 21,
    },
    appearance: { headingStyle: "tag", h1Align: "left", blockquoteStyle: "card", codeRadius: 4, imageRadius: 6 },
  },
  {
    id: "lemon-list",
    name: "柠檬清单",
    description: "明快活力，适合清单与科普",
    swatches: ["#d69f00", "#fff8cf", "#2d2a20"],
    colors: {
      accent: "#b98500", accentSoft: "#fff8cf", heading: "#342c16", text: "#413b2b",
      muted: "#80765d", link: "#8c6c0a", border: "#eadb9a", inlineCodeBackground: "#fff8d9",
      codeBackground: "#2d2a20", codeText: "#f1ecd9", articleBackground: "#fffef8",
    },
    typography: {
      fontFamily: humanistSans, bodySize: 16, bodyLineHeight: 1.75, paragraphSpacing: 18,
      codeSize: 14, codeLineHeight: 1.75, h1Size: 30, h2Size: 21,
    },
    appearance: { headingStyle: "filled", h1Align: "left", blockquoteStyle: "soft", codeRadius: 8, imageRadius: 8 },
  },
];

export const defaultTheme = articleThemes[0];
