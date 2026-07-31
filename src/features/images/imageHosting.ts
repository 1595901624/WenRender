import { invoke } from "@tauri-apps/api/core";
import type { ImageHostConfig } from "../../lib/imageSettings";
import { resolveLocalArticleImagePath } from "./articleImage";

export type UploadedImage = {
  url: string;
  objectKey: string;
};

export type ArticleImageUploadResult = {
  content: string;
  uploadedCount: number;
  failedCount: number;
  lastError: string;
};

export async function uploadImageFile(
  filePath: string,
  config: ImageHostConfig,
): Promise<UploadedImage> {
  return invoke<UploadedImage>("upload_image_to_host", { config, filePath });
}

export async function uploadArticleLocalImages(
  content: string,
  documentPath: string,
  config: ImageHostConfig,
): Promise<ArticleImageUploadResult> {
  const sources = extractMarkdownImageSources(content);
  const replacements = new Map<string, string>();
  let failedCount = 0;
  let lastError = "";

  // GitHub Contents API 不适合并行提交；所有提供商统一串行也能避免瞬时请求过多。
  for (const source of sources) {
    const localPath = resolveLocalArticleImagePath(source, documentPath);
    if (!localPath || replacements.has(source)) continue;
    try {
      const uploaded = await uploadImageFile(localPath, config);
      replacements.set(source, uploaded.url);
    } catch (error) {
      failedCount += 1;
      lastError = String(error);
    }
  }

  return {
    content: replaceMarkdownImageSources(content, replacements),
    uploadedCount: replacements.size,
    failedCount,
    lastError,
  };
}

function extractMarkdownImageSources(content: string): string[] {
  const sources: string[] = [];
  const pattern = /!\[[^\]]*]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g;
  for (const match of content.matchAll(pattern)) {
    sources.push(match[1] ?? match[2]);
  }
  return [...new Set(sources)];
}

function replaceMarkdownImageSources(content: string, replacements: Map<string, string>): string {
  if (replacements.size === 0) return content;
  return content.replace(
    /(!\[[^\]]*]\(\s*)(?:<([^>]+)>|([^\s)]+))((?:\s+["'][^"']*["'])?\s*\))/g,
    (match, prefix: string, angleSource: string | undefined, plainSource: string | undefined, suffix: string) => {
      const source = angleSource ?? plainSource;
      const replacement = source ? replacements.get(source) : undefined;
      return replacement ? `${prefix}${replacement}${suffix}` : match;
    },
  );
}
