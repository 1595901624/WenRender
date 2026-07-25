export type OpenDocument = {
  id: string;
  path: string | null;
  name: string;
  content: string;
  // 与磁盘一致的最后内容，用来判断编辑器是否存在未保存修改。
  savedContent: string;
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
