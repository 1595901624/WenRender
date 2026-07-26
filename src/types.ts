export type LineEnding = "lf" | "crlf";

export type FileFingerprint = {
  size: number;
  modifiedMs: number;
  hash: string;
};

export type FileSnapshot = {
  content: string;
  fingerprint: FileFingerprint;
  lineEnding: LineEnding;
  hasBom: boolean;
  readOnly: boolean;
};

export type FileInspection = {
  exists: boolean;
  fingerprint: FileFingerprint | null;
  readOnly: boolean;
};

export type OpenDocument = {
  id: string;
  path: string | null;
  name: string;
  content: string;
  // 与磁盘一致的最后内容，用来判断编辑器是否存在未保存修改。
  savedContent: string;
  // 保存时用该指纹检查磁盘文件是否在编辑期间被其它程序改动。
  diskFingerprint?: FileFingerprint;
  lineEnding: LineEnding;
  hasBom: boolean;
  readOnly: boolean;
  externalState: "normal" | "modified" | "deleted";
  recoveredDraft?: boolean;
  // 存在该字段时，文件归属于某个已打开的目录树；否则显示在独立文件区域。
  directoryId?: string;
};

export type DirectoryNode = {
  path: string;
  name: string;
  isDirectory: boolean;
  isMarkdown: boolean;
  // 目录和不可读取的文件没有内容，Markdown 文件在扫描时预加载正文。
  content?: string | null;
  children: DirectoryNode[];
};

export type OpenDirectory = {
  id: string;
  path: string;
  name: string;
  children: DirectoryNode[];
};

export type Notice = {
  message: string;
  tone: "success" | "error" | "neutral";
} | null;
