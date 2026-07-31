import mammoth from "mammoth";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export type DocumentImportResult = {
  markdown: string;
  warnings: string[];
};

/** 按 HTML 声明的字符集解码，兼容常见的 UTF-8、GBK/GB18030 与 Big5 文件。 */
export function decodeHtmlBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  const header = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const declared = /<meta[^>]+charset\s*=\s*["']?\s*([^\s"'/>;]+)/i.exec(header)?.[1]
    ?? /<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([^\s"';>]+)/i.exec(header)?.[1]
    ?? "utf-8";
  try {
    return new TextDecoder(declared).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** 将 HTML 清理后转换为便于继续编辑的 GitHub Flavored Markdown。 */
export function convertHtmlToMarkdown(html: string): DocumentImportResult {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("script, style, noscript, iframe, object, embed, canvas").forEach((node) => node.remove());
  promoteSimpleTableHeaders(parsed);

  const turndown = createTurndownService();
  const source = parsed.body.innerHTML || parsed.documentElement.innerHTML;
  return {
    markdown: normalizeImportedMarkdown(turndown.turndown(source)),
    warnings: [],
  };
}

function promoteSimpleTableHeaders(documentNode: Document): void {
  for (const table of Array.from(documentNode.querySelectorAll("table"))) {
    const firstRow = table.rows[0];
    if (!firstRow || firstRow.cells.length === 0 || Array.from(firstRow.cells).some((cell) => (
      cell.tagName === "TH" || cell.hasAttribute("rowspan") || cell.hasAttribute("colspan")
    ))) continue;
    for (const cell of Array.from(firstRow.cells)) {
      const heading = documentNode.createElement("th");
      for (const attribute of Array.from(cell.attributes)) {
        heading.setAttribute(attribute.name, attribute.value);
      }
      heading.innerHTML = cell.innerHTML;
      cell.replaceWith(heading);
    }
  }
}

/** 导入本地 HTML 时将相对图片内嵌，避免新建的未保存文章失去原文件目录上下文。 */
export async function convertHtmlFileToMarkdown(
  html: string,
  sourcePath: string,
  readImageDataUrl: (path: string) => Promise<string>,
): Promise<DocumentImportResult> {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const warnings: string[] = [];
  await Promise.all(Array.from(parsed.images).map(async (image) => {
    const source = image.getAttribute("src")?.trim();
    if (!source || /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\/)/i.test(source)) return;
    const localPath = resolveRelativeResourcePath(sourcePath, source);
    try {
      image.setAttribute("src", await readImageDataUrl(localPath));
      image.removeAttribute("srcset");
    } catch {
      warnings.push(`无法读取图片：${source}`);
    }
  }));
  const converted = convertHtmlToMarkdown(parsed.documentElement.outerHTML);
  return { markdown: converted.markdown, warnings: [...warnings, ...converted.warnings] };
}

/** DOCX 先转换为语义 HTML，再复用 HTML -> Markdown 管线。 */
export async function convertDocxToMarkdown(arrayBuffer: ArrayBuffer): Promise<DocumentImportResult> {
  const converted = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.dataUri,
      includeDefaultStyleMap: true,
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => p:fresh",
      ],
    },
  );
  const htmlResult = convertHtmlToMarkdown(converted.value);
  return {
    markdown: htmlResult.markdown,
    warnings: converted.messages.map((message) => message.message),
  };
}

function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  turndown.use(gfm);
  turndown.addRule("fencedCodeWithLanguage", {
    filter: (node) => node.nodeName === "PRE" && node.firstElementChild?.nodeName === "CODE",
    replacement: (_content, node) => {
      const codeElement = node.firstElementChild as HTMLElement;
      const language = Array.from(codeElement.classList)
        .map((className) => /^(?:language|lang)-(.+)$/.exec(className)?.[1])
        .find(Boolean) ?? "";
      const code = (codeElement.textContent ?? "").replace(/\n$/, "");
      const longestFence = Math.max(2, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length));
      const fence = "`".repeat(longestFence + 1);
      return `\n\n${fence}${language}\n${code}\n${fence}\n\n`;
    },
  });
  return turndown;
}

function normalizeImportedMarkdown(markdown: string): string {
  const normalized = markdown.replace(/\u00a0/g, " ").replace(/[ \t]+$/gm, "").trim();
  return normalized ? `${normalized}\n` : "";
}

function resolveRelativeResourcePath(sourcePath: string, resourcePath: string): string {
  const directory = sourcePath.replace(/[\\/][^\\/]*$/, "");
  let decodedResource: string;
  try { decodedResource = decodeURIComponent(resourcePath); } catch { decodedResource = resourcePath; }
  const combined = `${directory}/${decodedResource}`.replace(/\\/g, "/");
  const drive = /^[A-Za-z]:/.exec(combined)?.[0] ?? "";
  const network = !drive && combined.startsWith("//");
  const unixRoot = !drive && !network && combined.startsWith("/");
  const body = drive ? combined.slice(drive.length) : combined;
  const segments: string[] = [];
  for (const segment of body.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop(); else segments.push(segment);
  }
  if (drive) return `${drive}/${segments.join("/")}`;
  if (network) return `//${segments.join("/")}`;
  return `${unixRoot ? "/" : ""}${segments.join("/")}`;
}
