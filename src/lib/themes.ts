export type ArticleTheme = {
  id: string;
  name: string;
  description: string;
  swatches: [string, string, string];
  colors: {
    accent: string;
    accentSoft: string;
    heading: string;
    text: string;
    link: string;
    border: string;
    codeBackground: string;
    codeText: string;
  };
  typography: {
    bodySize: number;
    bodyLineHeight: number;
    codeSize: number;
    codeLineHeight: number;
    h1Size: number;
    h2Size: number;
  };
};

export const articleThemes: ArticleTheme[] = [
  {
    id: "classic-green",
    name: "经典绿",
    description: "清爽、克制的技术文章排版",
    swatches: ["#2f8f5b", "#f4f8f5", "#161819"],
    colors: {
      accent: "#2f8f5b",
      accentSoft: "#f4f8f5",
      heading: "#1f2329",
      text: "#333333",
      link: "#576b95",
      border: "#dce7df",
      codeBackground: "#161819",
      codeText: "#abb2bf",
    },
    typography: {
      bodySize: 16,
      bodyLineHeight: 1.75,
      codeSize: 14,
      codeLineHeight: 1.75,
      h1Size: 29,
      h2Size: 21,
    },
  },
];

export const defaultTheme = articleThemes[0];
