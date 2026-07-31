const PRINT_STYLE = `
<style data-wenrender-print>
  @page { size: A4 portrait; margin: 18mm 16mm 20mm; }
  html, body { background: #fff !important; }
  body { margin: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .wenrender-article { width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid-page; page-break-after: avoid; }
  pre, blockquote, table, figure, img { break-inside: avoid; page-break-inside: avoid; }
  table { width: 100% !important; }
  img { max-width: 100% !important; }
</style>`;

/** 在隔离的打印文档中调用系统打印窗口；Windows/macOS/Linux 均可选择保存为 PDF。 */
export async function printHtmlAsPdf(html: string): Promise<void> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    left: "-12000px",
    top: "0",
    width: "794px",
    height: "1123px",
    border: "0",
  });
  document.body.appendChild(frame);

  try {
    await loadFrame(frame, injectPrintStyle(html));
    const printDocument = frame.contentDocument;
    const printWindow = frame.contentWindow;
    if (!printDocument || !printWindow) throw new Error("无法创建打印文档");
    await Promise.all([waitForImages(printDocument), waitForFonts(printDocument)]);
    printWindow.focus();
    printWindow.print();
  } finally {
    // 某些 WebView 的 print() 会立即返回，延迟清理可避免打印预览读取到空白文档。
    window.setTimeout(() => frame.remove(), 120_000);
  }
}

function injectPrintStyle(html: string): string {
  return /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${PRINT_STYLE}</head>`)
    : `${PRINT_STYLE}${html}`;
}

function loadFrame(frame: HTMLIFrameElement, html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("打印文档加载超时")), 15_000);
    frame.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    frame.srcdoc = html;
  });
}

async function waitForImages(documentNode: Document): Promise<void> {
  const pending = Array.from(documentNode.images)
    .filter((image) => !image.complete)
    .map((image) => new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    }));
  if (pending.length === 0) return;
  await Promise.race([
    Promise.all(pending).then(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, 10_000)),
  ]);
}

async function waitForFonts(documentNode: Document): Promise<void> {
  if ("fonts" in documentNode) await documentNode.fonts.ready;
}
