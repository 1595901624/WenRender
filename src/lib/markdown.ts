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
import type { ArticleTheme } from "./themes";
import { defaultTheme } from "./themes";

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

function codeBlock(code: string, language: string, theme: ArticleTheme) {
  const knownLanguage = language && hljs.getLanguage(language);
  const highlighted = knownLanguage
    ? hljs.highlight(code, { language }).value
    : hljs.highlightAuto(code).value;

  const classColors: Record<string, string> = {
    "hljs-keyword": "#c678dd",
    "hljs-built_in": "#56b6c2",
    "hljs-type": "#56b6c2",
    "hljs-title": "#61afef",
    "hljs-title function_": "#61afef",
    "hljs-function": "#61afef",
    "hljs-string": "#98c379",
    "hljs-number": "#d19a66",
    "hljs-literal": "#d19a66",
    "hljs-comment": "#7f848e",
    "hljs-attr": "#61afef",
    "hljs-meta": "#e5c07b",
    "hljs-variable": "#e06c75",
    "hljs-params": "#abb2bf",
    "hljs-symbol": "#56b6c2",
  };

  // 发布内容不能依赖外部 CSS，把 Highlight.js 的 class 预先转换为微信可保留的内联颜色。
  const inlineHighlighted = highlighted.replace(
    /<span class="([^"]+)">/g,
    (_, className: string) => {
      const color = classColors[className] ?? className.split(" ").map((name) => classColors[name]).find(Boolean) ?? "#abb2bf";
      return `<span style="color:${color};">`;
    },
  );

  return `<pre style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:18px 0;padding:18px 17px;background-color:${theme.colors.codeBackground};border:1px solid ${theme.colors.border};border-radius:${theme.appearance.codeRadius}px;color:${theme.colors.codeText};font-family:Consolas,'SFMono-Regular',Menlo,monospace !important;font-size:${theme.typography.codeSize}px !important;line-height:${theme.typography.codeLineHeight} !important;tab-size:4;white-space:pre;word-break:normal;box-sizing:border-box;"><code style="font-family:Consolas,'SFMono-Regular',Menlo,monospace !important;font-size:${theme.typography.codeSize}px !important;line-height:${theme.typography.codeLineHeight} !important;white-space:pre;">${protectSpaces(inlineHighlighted)}</code></pre>`;
}

function createRenderer(theme: ArticleTheme, resolveImage?: (source: string) => string) {
  const bodyText = `font-family:${theme.typography.fontFamily};font-size:${theme.typography.bodySize}px;line-height:${theme.typography.bodyLineHeight} !important;color:${theme.colors.text};letter-spacing:0;text-align:left;`;
  const paragraph = `margin:0 0 ${theme.typography.paragraphSpacing}px;${bodyText}`;
  const inlineCode = `font-size:${theme.typography.codeSize}px;word-break:break-word;padding:2px 5px;border-radius:4px;margin:0 2px;color:${theme.colors.accent};font-weight:600;background-color:${theme.colors.inlineCodeBackground};font-family:Consolas,'SFMono-Regular',Menlo,monospace;`;
  // 所有关键样式直接写进标签，复制到公众号后不需要加载样式表或脚本。
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    highlight: (code, language) => codeBlock(code, language, theme),
  });

  md.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index];
    return codeBlock(token.content.replace(/\n$/, ""), token.info.trim().split(/\s+/)[0], theme);
  };
  md.renderer.rules.paragraph_open = () => `<p style="${paragraph}">`;
  md.renderer.rules.heading_open = (tokens, index) => {
    const level = Number(tokens[index].tag.slice(1));
    if (level === 1) return `<h1 style="margin:0 0 30px;color:${theme.colors.heading};font-family:${theme.typography.fontFamily};font-size:${theme.typography.h1Size}px;line-height:1.45;font-weight:700;letter-spacing:.01em;text-align:${theme.appearance.h1Align};">`;
    if (level === 2) return `<h2 style="${headingStyle(theme)}">`;
    return `<h${level} style="margin:28px 0 13px;padding-left:10px;border-left:3px solid ${theme.colors.accent};color:${theme.colors.heading};font-size:${level === 3 ? 18 : 16}px;line-height:1.5;font-weight:700;">`;
  };
  md.renderer.rules.strong_open = () => `<strong style="color:${theme.colors.accent};font-weight:700;">`;
  md.renderer.rules.code_inline = (tokens, index) => `<code style="${inlineCode}">${md.utils.escapeHtml(tokens[index].content)}</code>`;
  md.renderer.rules.blockquote_open = () => `<blockquote style="${blockquoteStyle(theme)}">`;
  md.renderer.rules.bullet_list_open = () => `<ul style="margin:8px 0 18px;padding-left:24px;line-height:${theme.typography.bodyLineHeight};">`;
  md.renderer.rules.ordered_list_open = () => `<ol style="margin:8px 0 18px;padding-left:24px;line-height:${theme.typography.bodyLineHeight};">`;
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

function headingStyle(theme: ArticleTheme): string {
  const base = `margin:34px 0 22px;color:${theme.colors.heading};font-family:${theme.typography.fontFamily};font-size:${theme.typography.h2Size}px;line-height:1.5;font-weight:700;`;
  const accent = theme.colors.accent;
  switch (theme.appearance.headingStyle) {
    case "left-bar":
      return `${base}display:block;padding:3px 0 3px 12px;border-left:4px solid ${accent};`;
    case "filled":
      return `${base}display:inline-block;padding:5px 12px;background-color:${theme.colors.accentSoft};border:1px solid ${accent};border-radius:5px;`;
    case "centered":
      return `${base}display:block;padding:0 0 10px;text-align:center;border-bottom:1px solid ${theme.colors.border};`;
    case "boxed":
      return `${base}display:inline-block;padding:5px 12px;border:1px solid ${accent};border-radius:6px;`;
    case "marker":
      return `${base}display:inline-block;padding:3px 7px;background-color:${theme.colors.accentSoft};border-bottom:4px solid ${accent};`;
    case "double-line":
      return `${base}display:block;padding:9px 0;text-align:center;border-top:1px solid ${accent};border-bottom:1px solid ${accent};`;
    case "minimal":
      return `${base}display:block;padding:0 0 8px;border-bottom:1px solid ${theme.colors.border};`;
    case "tag":
      return `${base}display:inline-block;padding:5px 12px;background-color:${accent};color:${contrastText(accent)};border-radius:2px;`;
    case "newspaper":
      return `${base}display:block;padding:8px 0;text-align:center;letter-spacing:.08em;border-top:2px solid ${accent};border-bottom:1px solid ${accent};`;
    case "underline":
    default:
      return `${base}display:inline-block;padding:0 0 8px;border-bottom:3px solid ${accent};`;
  }
}

function blockquoteStyle(theme: ArticleTheme): string {
  const base = `margin:20px 0;padding:13px 16px;color:${theme.colors.muted};font-family:${theme.typography.fontFamily};line-height:${theme.typography.bodyLineHeight};`;
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

export function renderMarkdown(source: string, theme: ArticleTheme = defaultTheme, resolveImage?: (source: string) => string): string {
  const md = createRenderer(theme, resolveImage);
  return md.render(source);
}

export function wrapHtml(rendered: string, title = "WenRender 文章", theme: ArticleTheme = defaultTheme): string {
  const escapedTitle = title.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
</head>
<body style="margin:0;background:${theme.colors.articleBackground};color:${theme.colors.text};font-family:${theme.typography.fontFamily};">
  <article style="max-width:677px;margin:0 auto;padding:32px 20px 48px;box-sizing:border-box;background-color:${theme.colors.articleBackground};font-family:${theme.typography.fontFamily};font-size:${theme.typography.bodySize}px;line-height:${theme.typography.bodyLineHeight};">${rendered}</article>
</body>
</html>`;
}
