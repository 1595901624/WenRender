import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// 在 React 挂载前应用主题，避免启动时先闪过亮色界面。
const savedColorScheme = window.localStorage.getItem("wenrender-color-scheme") ?? "system";
const initialDark = savedColorScheme === "dark"
  || (savedColorScheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.classList.toggle("dark", initialDark);
document.documentElement.style.colorScheme = initialDark ? "dark" : "light";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
