import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import toml from "highlight.js/lib/languages/ini";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { codeTokenStyle, defaultCodeTheme, type CodeTheme } from "./codeThemes";
import type { ArticleTheme } from "./themes";
import { defaultTheme } from "./themes";
import {
  resolveArticleTypography,
  type HeadingKey,
  type ResolvedArticleTypography,
  type ResolvedHeadingTypography,
  type TypographyOverrides,
} from "./typography";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("toml", toml);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);

function protectSpaces(html: string) {
  // 微信会清理高亮 span 之间的普通空白，转换为 nbsp 可避免 fn、let 等 token 粘连。
  return html.replace(/(^|<\/span>|>)( +)(?=<span|[^<])/gm, (_, prefix, spaces) =>
    prefix + "&nbsp;".repeat(spaces.length),
  );
}

function codeBlock(code: string, language: string, theme: ArticleTheme, codeTheme: CodeTheme) {
  const knownLanguage = language && hljs.getLanguage(language);
  const highlighted = knownLanguage
    ? hljs.highlight(code, { language }).value
    : hljs.highlightAuto(code).value;

  // 发布内容不能依赖外部 CSS，把 Highlight.js 的 class 预先转换为微信可保留的内联颜色。
  const inlineHighlighted = highlighted.replace(
    /<span class="([^"]+)">/g,
    (_, className: string) => `<span style="${codeTokenStyle(codeTheme, className)}">`,
  );

  return `<pre style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:18px 0;padding:18px 17px;background-color:${codeTheme.background};border:1px solid ${codeTheme.border};border-radius:${theme.appearance.codeRadius}px;color:${codeTheme.foreground};font-family:Consolas,'SFMono-Regular',Menlo,monospace !important;font-size:${theme.typography.codeSize}px !important;line-height:${theme.typography.codeLineHeight} !important;tab-size:4;white-space:pre;word-break:normal;box-sizing:border-box;"><code style="font-family:Consolas,'SFMono-Regular',Menlo,monospace !important;font-size:${theme.typography.codeSize}px !important;line-height:${theme.typography.codeLineHeight} !important;white-space:pre;">${protectSpaces(inlineHighlighted)}</code></pre>`;
}

function createRenderer(
  theme: ArticleTheme,
  codeTheme: CodeTheme,
  resolveImage?: (source: string) => string,
  typographyOverrides: TypographyOverrides = {},
) {
  const typography = resolveArticleTypography(theme, typographyOverrides);
  const bodyText = `font-family:${typography.bodyFontFamily};font-size:${typography.bodySize}px;line-height:${typography.bodyLineHeight} !important;color:${theme.colors.text};letter-spacing:0;text-align:left;`;
  const paragraph = `margin:0 0 ${typography.paragraphSpacing}px;${bodyText}`;
  const inlineCode = `font-size:${theme.typography.codeSize}px;word-break:break-word;padding:2px 5px;border-radius:4px;margin:0 2px;color:${theme.colors.accent};font-weight:600;background-color:${theme.colors.inlineCodeBackground};font-family:Consolas,'SFMono-Regular',Menlo,monospace;`;
  // 所有关键样式直接写进标签，复制到公众号后不需要加载样式表或脚本。
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    highlight: (code, language) => codeBlock(code, language, theme, codeTheme),
  });

  md.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index];
    return codeBlock(token.content.replace(/\n$/, ""), token.info.trim().split(/\s+/)[0], theme, codeTheme);
  };
  md.renderer.rules.paragraph_open = () => `<p style="${paragraph}">`;
  md.renderer.rules.heading_open = (tokens, index) => {
    const level = Number(tokens[index].tag.slice(1));
    const heading = typography.headings[`h${level}` as HeadingKey];
    if (level === 1) {
      return `<h1 style="${baseHeadingStyle(theme, heading)}letter-spacing:.01em;">`;
    }
    if (level === 2) return `<h2 style="${headingStyle(theme, heading)}">`;
    return `<h${level} style="${baseHeadingStyle(theme, heading)}padding-left:10px;border-left:3px solid ${theme.colors.accent};">`;
  };
  md.renderer.rules.strong_open = () => `<strong style="color:${theme.colors.accent};font-weight:700;">`;
  md.renderer.rules.code_inline = (tokens, index) => `<code style="${inlineCode}">${md.utils.escapeHtml(tokens[index].content)}</code>`;
  md.renderer.rules.blockquote_open = () => `<blockquote style="${blockquoteStyle(theme, typography)}">`;
  md.renderer.rules.bullet_list_open = () => `<ul style="margin:8px 0 18px;padding-left:24px;font-family:${typography.bodyFontFamily};font-size:${typography.bodySize}px;line-height:${typography.bodyLineHeight};">`;
  md.renderer.rules.ordered_list_open = () => `<ol style="margin:8px 0 18px;padding-left:24px;font-family:${typography.bodyFontFamily};font-size:${typography.bodySize}px;line-height:${typography.bodyLineHeight};">`;
  md.renderer.rules.list_item_open = () => '<li style="margin:7px 0;">';
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    tokens[index].attrSet("style", `color:${theme.colors.link};text-decoration:none;`);
    tokens[index].attrSet("target", "_blank");
    return self.renderToken(tokens, index, options);
  };
  md.renderer.rules.image = (tokens, index) => {
    const token = tokens[index];
    const originalSource = token.attrGet("src") ?? "";
    const src = resolveImage?.(originalSource) ?? originalSource;
    const alt = token.content;
    return `<img src="${md.utils.escapeHtml(src)}" alt="${md.utils.escapeHtml(alt)}" style="display:block;max-width:100%;height:auto;margin:20px auto;border-radius:${theme.appearance.imageRadius}px;" />`;
  };
  md.renderer.rules.table_open = () => `<div style="overflow-x:auto;margin:20px 0;"><table style="width:100%;border-collapse:collapse;color:${theme.colors.text};font-size:14px;line-height:1.7;text-align:left;">`;
  md.renderer.rules.table_close = () => "</table></div>";
  md.renderer.rules.th_open = () => `<th style="padding:9px 10px;border:1px solid ${theme.colors.accent};background-color:${theme.colors.accent} !important;color:${contrastText(theme.colors.accent)} !important;font-weight:600;">`;
  md.renderer.rules.td_open = () => `<td style="padding:9px 10px;border:1px solid ${theme.colors.border};background-color:${theme.colors.articleBackground};">`;
  return md;
}

function baseHeadingStyle(theme: ArticleTheme, heading: ResolvedHeadingTypography): string {
  return `margin:${heading.marginTop}px 0 ${heading.marginBottom}px;color:${theme.colors.heading};font-family:${heading.fontFamily};font-size:${heading.fontSize}px;line-height:${heading.lineHeight};font-weight:${heading.fontWeight};text-align:${heading.textAlign};`;
}

function headingStyle(theme: ArticleTheme, heading: ResolvedHeadingTypography): string {
  const base = baseHeadingStyle(theme, heading);
  const accent = theme.colors.accent;
  // 带短装饰的标题居中时使用 table 布局，避免 inline-block 的 auto margin 在微信中失效。
  const compactDisplay = heading.textAlign === "center"
    ? "display:table;margin-left:auto;margin-right:auto;"
    : "display:inline-block;";
  switch (theme.appearance.headingStyle) {
    case "left-bar":
      return `${base}display:block;padding:3px 0 3px 12px;border-left:4px solid ${accent};`;
    case "filled":
      return `${base}${compactDisplay}padding:5px 12px;background-color:${theme.colors.accentSoft};border:1px solid ${accent};border-radius:5px;`;
    case "centered":
      return `${base}display:block;padding:0 0 10px;text-align:center;border-bottom:1px solid ${theme.colors.border};`;
    case "boxed":
      return `${base}${compactDisplay}padding:5px 12px;border:1px solid ${accent};border-radius:6px;`;
    case "marker":
      return `${base}${compactDisplay}padding:3px 7px;background-color:${theme.colors.accentSoft};border-bottom:4px solid ${accent};`;
    case "double-line":
      return `${base}display:block;padding:9px 0;text-align:center;border-top:1px solid ${accent};border-bottom:1px solid ${accent};`;
    case "minimal":
      return `${base}display:block;padding:0 0 8px;border-bottom:1px solid ${theme.colors.border};`;
    case "tag":
      return `${base}${compactDisplay}padding:5px 12px;background-color:${accent};color:${contrastText(accent)};border-radius:2px;`;
    case "newspaper":
      return `${base}display:block;padding:8px 0;text-align:center;letter-spacing:.08em;border-top:2px solid ${accent};border-bottom:1px solid ${accent};`;
    case "underline":
    default:
      return `${base}${compactDisplay}padding:0 0 8px;border-bottom:3px solid ${accent};`;
  }
}

function blockquoteStyle(theme: ArticleTheme, typography: ResolvedArticleTypography): string {
  const base = `margin:20px 0;padding:13px 16px;color:${theme.colors.muted};font-family:${typography.bodyFontFamily};font-size:${typography.bodySize}px;line-height:${typography.bodyLineHeight};`;
  switch (theme.appearance.blockquoteStyle) {
    case "soft":
      return `${base}background-color:${theme.colors.accentSoft};border-radius:8px;`;
    case "quote":
      return `${base}background-color:transparent;border-top:1px solid ${theme.colors.border};border-bottom:1px solid ${theme.colors.border};font-style:italic;`;
    case "card":
      return `${base}background-color:${theme.colors.accentSoft};border:1px solid ${theme.colors.border};border-radius:8px;`;
    case "border":
    default:
      return `${base}border-left:4px solid ${theme.colors.accent};background-color:${theme.colors.accentSoft};`;
  }
}

function contrastText(hex: string): string {
  // 根据感知亮度为表头和标签自动选择黑色或白色文字。
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? "#222222" : "#ffffff";
}

export function renderMarkdown(
  source: string,
  theme: ArticleTheme = defaultTheme,
  codeTheme: CodeTheme = defaultCodeTheme,
  resolveImage?: (source: string) => string,
  typographyOverrides: TypographyOverrides = {},
): string {
  const md = createRenderer(theme, codeTheme, resolveImage, typographyOverrides);
  return md.render(source);
}

export function wrapHtml(
  rendered: string,
  title = "WenRender 文章",
  theme: ArticleTheme = defaultTheme,
  typographyOverrides: TypographyOverrides = {},
): string {
  const escapedTitle = title.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
  const typography = resolveArticleTypography(theme, typographyOverrides);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
</head>
<body style="margin:0;background:${theme.colors.articleBackground};color:${theme.colors.text};font-family:${typography.bodyFontFamily};">
  <article style="max-width:677px;margin:0 auto;padding:32px 20px 48px;box-sizing:border-box;background-color:${theme.colors.articleBackground};font-family:${typography.bodyFontFamily};font-size:${typography.bodySize}px;line-height:${typography.bodyLineHeight};">${rendered}</article>
</body>
</html>`;
}
