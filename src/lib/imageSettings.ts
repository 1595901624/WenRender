export type ImageSettings = {
  storageMode: "article-assets" | "custom";
  customDirectory: string | null;
  compress: boolean;
  maxDimension: number;
  jpegQuality: number;
};

export const defaultImageSettings: ImageSettings = {
  storageMode: "article-assets",
  customDirectory: null,
  // 保留用户粘贴或拖入的原始图片是默认行为，压缩必须由用户主动开启。
  compress: false,
  maxDimension: 1920,
  jpegQuality: 85,
};

export function parseImageSettings(raw: string | null): ImageSettings {
  if (!raw) return defaultImageSettings;
  try {
    const value = JSON.parse(raw) as Partial<ImageSettings>;
    const customDirectory = typeof value.customDirectory === "string" && value.customDirectory.trim()
      ? value.customDirectory
      : null;
    return {
      storageMode: value.storageMode === "custom" && customDirectory
        ? "custom"
        : "article-assets",
      customDirectory,
      compress: value.compress === true,
      maxDimension: isValidMaxDimension(value.maxDimension)
        ? value.maxDimension
        : defaultImageSettings.maxDimension,
      jpegQuality: typeof value.jpegQuality === "number"
        ? Math.min(95, Math.max(60, Math.round(value.jpegQuality)))
        : defaultImageSettings.jpegQuality,
    };
  } catch {
    return defaultImageSettings;
  }
}

function isValidMaxDimension(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && [1280, 1920, 2560, 3840].includes(value);
}
