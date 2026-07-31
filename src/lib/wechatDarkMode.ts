import darkmodeSource from "mp-darkmode/dist/darkmode.min.js?raw";

type DarkmodeApi = {
  run: (nodes: ArrayLike<Element>, options: {
    mode: "dark";
    needJudgeFirstPage: boolean;
    defaultLightTextColor: string;
    defaultLightBgColor: string;
    defaultDarkTextColor: string;
    defaultDarkBgColor: string;
  }) => void;
};

type DarkmodeWindow = Window & typeof globalThis & {
  Darkmode?: DarkmodeApi;
};

/**
 * 在文章 iframe 自己的 window 中运行微信公众平台的暗黑模式算法。
 * 这样生成的 class/style 只影响预览，不会进入复制、导出或应用界面。
 */
export function applyWechatDarkMode(document: Document): void {
  const window = document.defaultView as DarkmodeWindow | null;
  if (!window || !document.head || !document.body) return;

  const script = document.createElement("script");
  script.textContent = darkmodeSource;
  document.head.appendChild(script);
  script.remove();

  if (!window.Darkmode) {
    throw new Error("微信暗黑模式转换器加载失败");
  }

  const nodes = [document.body, ...Array.from(document.body.querySelectorAll("*"))];
  window.Darkmode.run(nodes, {
    mode: "dark",
    needJudgeFirstPage: false,
    // 与 mp-darkmode 的微信公众号默认配置保持一致。
    defaultLightTextColor: "#191919",
    defaultLightBgColor: "#ffffff",
    defaultDarkTextColor: "#a3a3a3",
    defaultDarkBgColor: "#191919",
  });

  document.documentElement.style.colorScheme = "dark";
  document.documentElement.style.backgroundColor = "#191919";
  document.body.style.backgroundColor = "#191919";
}
