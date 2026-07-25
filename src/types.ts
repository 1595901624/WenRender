export type OpenDocument = {
  id: string;
  path: string | null;
  name: string;
  content: string;
  savedContent: string;
};

export type Notice = {
  message: string;
  tone: "success" | "error" | "neutral";
} | null;
