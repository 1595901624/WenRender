import atomOneDarkCss from "highlight.js/styles/atom-one-dark.css?inline";
import githubCss from "highlight.js/styles/github.css?inline";
import githubDarkCss from "highlight.js/styles/github-dark.css?inline";
import monokaiSublimeCss from "highlight.js/styles/monokai-sublime.css?inline";
import nightOwlCss from "highlight.js/styles/night-owl.css?inline";
import nordCss from "highlight.js/styles/nord.css?inline";
import stackOverflowLightCss from "highlight.js/styles/stackoverflow-light.css?inline";
import vs2015Css from "highlight.js/styles/vs2015.css?inline";

export type CodeTheme = {
  id: string;
  name: string;
  description: string;
  background: string;
  foreground: string;
  border: string;
  swatches: [string, string, string];
  tokenStyles: Record<string, string>;
};

type CodeThemeSource = {
  id: string;
  name: string;
  description: string;
  css: string;
  border: string;
};

const themeSources: CodeThemeSource[] = [
  {
    id: "atom-one-dark",
    name: "Atom 暗色",
    description: "柔和均衡，适合多数语言",
    css: atomOneDarkCss,
    border: "#3a404b",
  },
  {
    id: "github-light",
    name: "GitHub 亮色",
    description: "清晰克制的浅色代码风格",
    css: githubCss,
    border: "#d8dee4",
  },
  {
    id: "github-dark",
    name: "GitHub 暗色",
    description: "高辨识度的深色代码风格",
    css: githubDarkCss,
    border: "#30363d",
  },
  {
    id: "monokai-sublime",
    name: "Monokai",
    description: "鲜明活跃的经典编辑器配色",
    css: monokaiSublimeCss,
    border: "#414238",
  },
  {
    id: "vs2015",
    name: "微软开发工具",
    description: "接近经典微软开发工具的配色",
    css: vs2015Css,
    border: "#3d3d3d",
  },
  {
    id: "nord",
    name: "Nord 极夜",
    description: "冷静柔和的北欧蓝灰色调",
    css: nordCss,
    border: "#4c566a",
  },
  {
    id: "night-owl",
    name: "夜猫子",
    description: "深蓝背景与高对比暖色",
    css: nightOwlCss,
    border: "#17344d",
  },
  {
    id: "stackoverflow-light",
    name: "问答社区亮色",
    description: "适合教程和问答内容的浅色主题",
    css: stackOverflowLightCss,
    border: "#d6d9dc",
  },
];

// Highlight.js 官方主题依赖 CSS class；这里提前提取为内联样式，避免微信清理外部样式表。
export const codeThemes: CodeTheme[] = themeSources.map(createCodeTheme);
export const defaultCodeTheme = codeThemes[0];

export function codeTokenStyle(theme: CodeTheme, className: string): string {
  const styles = className
    .split(/\s+/)
    .map((name) => theme.tokenStyles[name])
    .filter(Boolean);
  return styles.length > 0 ? styles.join("") : `color:${theme.foreground};`;
}

function createCodeTheme(source: CodeThemeSource): CodeTheme {
  const { root, tokenStyles } = parseHighlightTheme(source.css);
  const background = root.background ?? root.backgroundColor ?? "#282c34";
  const foreground = root.color ?? "#abb2bf";
  return {
    id: source.id,
    name: source.name,
    description: source.description,
    background,
    foreground,
    border: source.border,
    swatches: [
      background,
      extractColor(tokenStyles["hljs-keyword"]) ?? foreground,
      extractColor(tokenStyles["hljs-string"]) ?? foreground,
    ],
    tokenStyles,
  };
}

function parseHighlightTheme(css: string): {
  root: Record<string, string>;
  tokenStyles: Record<string, string>;
} {
  const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const root: Record<string, string> = {};
  const tokenStyles: Record<string, string> = {};

  for (const match of cleanCss.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    const selectors = match[1].split(",").map((selector) => selector.trim());
    const declarations = parseDeclarations(match[2]);
    const inlineStyle = toInlineStyle(declarations);
    if (!inlineStyle) continue;

    for (const selector of selectors) {
      if (selector === ".hljs") Object.assign(root, declarations);
      const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((item) => item[1]);
      const tokenClass = [...classes].reverse().find((name) => name.startsWith("hljs-"));
      if (tokenClass) {
        // 同一 token 可能出现在多个组合选择器中，按属性合并可以避免重复 style。
        tokenStyles[tokenClass] = toInlineStyle({
          ...parseDeclarations(tokenStyles[tokenClass] ?? ""),
          ...declarations,
        });
      }
    }
  }

  return { root, tokenStyles };
}

function parseDeclarations(source: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const declaration of source.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim();
    const value = declaration.slice(separator + 1).trim();
    if (property && value) declarations[property] = value;
  }
  return declarations;
}

function toInlineStyle(declarations: Record<string, string>): string {
  const supported = [
    "color",
    "background",
    "background-color",
    "font-style",
    "font-weight",
    "text-decoration",
  ];
  return supported
    .filter((property) => declarations[property])
    .map((property) => `${property}:${declarations[property]};`)
    .join("");
}

function extractColor(style?: string): string | null {
  return style?.match(/(?:^|;)color:([^;]+)/)?.[1] ?? null;
}
