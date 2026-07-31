export type ImageHostProvider = "none" | "s3" | "oss" | "cos" | "github" | "r2" | "custom";
export type ImageUploadTiming = "manual" | "on-insert" | "on-copy";

export type ImageHostConfig = {
  provider: ImageHostProvider;
  uploadTiming: ImageUploadTiming;
  endpoint: string;
  region: string;
  bucket: string;
  pathPrefix: string;
  publicBaseUrl: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  customMethod: "POST" | "PUT";
  customFileField: string;
  customResponseUrlPath: string;
};

export type ImageSettings = {
  storageMode: "article-assets" | "custom";
  customDirectory: string | null;
  compress: boolean;
  maxDimension: number;
  jpegQuality: number;
  hosting: ImageHostConfig;
};

export const defaultImageHostConfig: ImageHostConfig = {
  provider: "none",
  uploadTiming: "manual",
  endpoint: "",
  region: "",
  bucket: "",
  pathPrefix: "wenrender",
  publicBaseUrl: "",
  githubOwner: "",
  githubRepo: "",
  githubBranch: "main",
  customMethod: "POST",
  customFileField: "file",
  customResponseUrlPath: "data.url",
};

export const defaultImageSettings: ImageSettings = {
  storageMode: "article-assets",
  customDirectory: null,
  // 保留用户粘贴或拖入的原始图片是默认行为，压缩必须由用户主动开启。
  compress: false,
  maxDimension: 1920,
  jpegQuality: 85,
  hosting: defaultImageHostConfig,
};

export function parseImageSettings(raw: string | null): ImageSettings {
  if (!raw) return defaultImageSettings;
  try {
    const value = JSON.parse(raw) as Partial<ImageSettings>;
    const customDirectory = typeof value.customDirectory === "string" && value.customDirectory.trim()
      ? value.customDirectory
      : null;
    const hosting = value.hosting && typeof value.hosting === "object"
      ? value.hosting as Partial<ImageHostConfig>
      : {};
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
      hosting: {
        provider: isImageHostProvider(hosting.provider) ? hosting.provider : "none",
        uploadTiming: hosting.uploadTiming === "on-insert" || hosting.uploadTiming === "on-copy"
          ? hosting.uploadTiming
          : "manual",
        endpoint: text(hosting.endpoint),
        region: text(hosting.region),
        bucket: text(hosting.bucket),
        pathPrefix: text(hosting.pathPrefix) || defaultImageHostConfig.pathPrefix,
        publicBaseUrl: text(hosting.publicBaseUrl),
        githubOwner: text(hosting.githubOwner),
        githubRepo: text(hosting.githubRepo),
        githubBranch: text(hosting.githubBranch) || defaultImageHostConfig.githubBranch,
        customMethod: hosting.customMethod === "PUT" ? "PUT" : "POST",
        customFileField: text(hosting.customFileField) || defaultImageHostConfig.customFileField,
        customResponseUrlPath: text(hosting.customResponseUrlPath) || defaultImageHostConfig.customResponseUrlPath,
      },
    };
  } catch {
    return defaultImageSettings;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isImageHostProvider(value: unknown): value is ImageHostProvider {
  return ["none", "s3", "oss", "cos", "github", "r2", "custom"].includes(String(value));
}

function isValidMaxDimension(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && [1280, 1920, 2560, 3840].includes(value);
}
