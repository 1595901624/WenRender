import { useEffect, useRef } from "react";

export function Preview({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (frame.current) frame.current.srcdoc = html;
  }, [html]);

  return (
    <div className="h-full overflow-auto bg-[#eef0eb] px-6 py-7">
      <div className="mx-auto min-h-full max-w-[720px] overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-black/5">
        <iframe ref={frame} title="微信文章预览" className="block h-full min-h-[calc(100vh-132px)] w-full border-0 bg-white" />
      </div>
    </div>
  );
}
