import MarkdownIt from "markdown-it";

type ImageResolver = (source: string) => string;

/** 将 Markdown 渲染成只保留文档语义、不携带文章主题样式的 HTML。 */
export function renderUnstyledMarkdown(source: string, resolveImage?: ImageResolver): string {
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
  });
  const defaultImageRenderer = markdown.renderer.rules.image
    ?? ((tokens, index, options, environment, renderer) => (
      renderer.renderToken(tokens, index, options)
    ));
  markdown.renderer.rules.image = (tokens, index, options, environment, renderer) => {
    const originalSource = tokens[index].attrGet("src") ?? "";
    tokens[index].attrSet("src", resolveImage?.(originalSource) ?? originalSource);
    return defaultImageRenderer(tokens, index, options, environment, renderer);
  };
  return markdown.render(source);
}

/** 输出适合保存为 TXT 的可读文本，保留列表标记、链接地址、表格和代码内容。 */
export function markdownToPlainText(source: string): string {
  if (!source.trim()) return "";
  const documentNode = new DOMParser().parseFromString(
    `<article>${renderUnstyledMarkdown(source)}</article>`,
    "text/html",
  );
  const article = documentNode.body.firstElementChild;
  if (!article) return "";
  return plainTextFromNode(article)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function plainTextFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";

  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "img") {
    const alt = node.getAttribute("alt")?.trim();
    return alt ? `[图片：${alt}]` : "[图片]";
  }
  if (tag === "a") {
    const label = plainTextFromChildren(node).trim();
    const href = node.getAttribute("href")?.trim();
    if (!href || label === href) return label || href || "";
    return `${label || href} (${href})`;
  }
  if (tag === "pre") return `${node.textContent?.replace(/\n+$/, "") ?? ""}\n\n`;
  if (tag === "table") return plainTextFromTable(node);
  if (tag === "ul" || tag === "ol") return plainTextFromList(node, 0);
  if (tag === "blockquote") {
    const content = plainTextFromChildren(node).trim();
    return `${content.split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
  }
  if (tag === "hr") return "---\n\n";

  const content = plainTextFromChildren(node);
  if (/^(?:article|section|div|p|h[1-6])$/.test(tag)) return `${content.trim()}\n\n`;
  return content;
}

function plainTextFromChildren(element: HTMLElement): string {
  return Array.from(element.childNodes).map(plainTextFromNode).join("");
}

function plainTextFromList(list: HTMLElement, depth: number): string {
  const ordered = list.tagName.toLowerCase() === "ol";
  const start = Number.parseInt(list.getAttribute("start") ?? "1", 10) || 1;
  const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === "li");
  return items.map((item, index) => {
    const nestedLists = Array.from(item.children).filter((child) => {
      const tag = child.tagName.toLowerCase();
      return tag === "ul" || tag === "ol";
    });
    const nestedSet = new Set(nestedLists);
    const body = Array.from(item.childNodes)
      .filter((child) => !(child instanceof HTMLElement && nestedSet.has(child)))
      .map(plainTextFromNode)
      .join("")
      .trim()
      .replace(/\n+/g, " ");
    const indent = "  ".repeat(depth);
    const marker = ordered ? `${start + index}.` : "-";
    const nested = nestedLists
      .map((child) => plainTextFromList(child as HTMLElement, depth + 1))
      .join("");
    return `${indent}${marker} ${body}\n${nested}`;
  }).join("") + (depth === 0 ? "\n" : "");
}

function plainTextFromTable(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) => (
    Array.from(row.querySelectorAll(":scope > th, :scope > td"))
      .map((cell) => plainTextFromChildren(cell as HTMLElement).trim().replace(/\n+/g, " "))
      .join("\t")
  ));
  return `${rows.join("\n")}\n\n`;
}
