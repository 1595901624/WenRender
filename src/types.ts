export type OpenDocument = {
  id: string;
  path: string | null;
  name: string;
  content: string;
  savedContent: string;
  directoryId?: string;
};

export type DirectoryNode = {
  path: string;
  name: string;
  isDirectory: boolean;
  isMarkdown: boolean;
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
