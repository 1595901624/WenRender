export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || "未命名.md";
}

export function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
