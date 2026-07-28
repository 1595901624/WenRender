import { convertFileSrc, invoke } from "@tauri-apps/api/core";

/** 将本地图片文件名转换为安全、可读的 Markdown alt 文本。 */
export function markdownImageAlt(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/-\d+$/, "");
  return (stem || "图片").replace(/[\\[\]]/g, "\\$&");
}

/** 将相对路径编码为 Markdown URL；盘符不能编码，否则 Windows 无法识别。 */
export function markdownImageDestination(path: string): string {
  return path.split("/").map((segment) => (/^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment))).join("/");
}

export function pathIsInside(filePath: string, directoryPath: string): boolean {
  const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return normalize(filePath).startsWith(`${normalize(directoryPath)}/`);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function resolveLocalArticleImagePath(source: string, documentPath: string | null): string | null {
  if (/^(?:https?:|data:|asset:|blob:)/i.test(source)) return null;
  let decodedSource: string;
  try { decodedSource = decodeURIComponent(source); } catch { decodedSource = source; }
  const normalizedSource = decodedSource.replace(/\//g, "\\");
  const absolute = /^(?:[A-Za-z]:\\|\\\\)/.test(normalizedSource);
  if (!absolute && !documentPath) return null;
  const directory = documentPath?.replace(/[\\/][^\\/]+$/, "") ?? "";
  const resolved: string[] = [];
  for (const segment of (absolute ? normalizedSource : `${directory}\\${normalizedSource}`).split("\\")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") resolved.pop(); else resolved.push(segment);
  }
  return ( /^[A-Za-z]:/.test(resolved[0] ?? "") ? "" : "\\") + resolved.join("\\");
}

/** 将编辑器中的本地图片路径转为 Tauri 可加载地址。 */
export function resolveArticleImage(source: string, documentPath: string | null): string {
  const localPath = resolveLocalArticleImagePath(source, documentPath);
  return localPath ? convertFileSrc(localPath) : source;
}

/** 复制到公众号前，把文染的本地图片协议替换为 data URL。 */
export async function embedLocalImages(html: string): Promise<{ html: string; embeddedCount: number; failedCount: number }> {
  const document = new DOMParser().parseFromString(html, "text/html");
  const localImages = Array.from(document.querySelectorAll<HTMLImageElement>('img[src^="wenrender-local-image:"]'));
  let embeddedCount = 0;
  let failedCount = 0;
  await Promise.all(localImages.map(async (image) => {
    const encodedPath = image.getAttribute("src")?.slice("wenrender-local-image:".length);
    if (!encodedPath) { failedCount += 1; return; }
    try {
      image.setAttribute("src", await invoke<string>("read_image_data_url", { filePath: decodeURIComponent(encodedPath) }));
      embeddedCount += 1;
    } catch {
      try { image.setAttribute("src", convertFileSrc(decodeURIComponent(encodedPath))); } catch { image.removeAttribute("src"); }
      failedCount += 1;
    }
  }));
  return { html: document.body.innerHTML, embeddedCount, failedCount };
}
