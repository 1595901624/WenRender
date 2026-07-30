export type MarkdownHeading = {
  id: string;
  level: number;
  text: string;
  from: number;
  to: number;
  line: number;
};

export type ArticleStats = {
  characters: number;
  words: number;
  paragraphs: number;
  headings: number;
  images: number;
  readingMinutes: number;
};

export function extractMarkdownHeadings(content: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const lines = content.split("\n");
  let offset = 0;
  let fence: { marker: string; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) {
        fence = { marker, length: fenceMatch[1].length };
      } else if (marker === fence.marker && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      offset += line.length + 1;
      continue;
    }

    if (!fence) {
      const atx = line.match(/^\s{0,3}(#{1,6})(?:[ \t]+|$)(.*)$/);
      if (atx) {
        const text = cleanHeadingText(atx[2].replace(/[ \t]+#+[ \t]*$/, ""));
        if (text) {
          headings.push({
            id: `heading-${offset}`,
            level: atx[1].length,
            text,
            from: offset,
            to: offset + line.length,
            line: index + 1,
          });
        }
      } else if (
        line.trim()
        && index + 1 < lines.length
        && /^\s{0,3}(?:=+|-+)\s*$/.test(lines[index + 1])
      ) {
        const underline = lines[index + 1].trim();
        const text = cleanHeadingText(line.trim());
        if (text) {
          headings.push({
            id: `heading-${offset}`,
            level: underline.startsWith("=") ? 1 : 2,
            text,
            from: offset,
            to: offset + line.length + 1 + lines[index + 1].length,
            line: index + 1,
          });
        }
      }
    }

    offset += line.length + 1;
  }
  return headings;
}

export function calculateArticleStats(content: string, headingCount?: number): ArticleStats {
  const withoutCode = content.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, " ");
  const plain = withoutCode
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/[*_~`>|-]/g, " ");
  const cjkCount = (plain.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? []).length;
  const latinWords = plain.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? [];
  const words = cjkCount + latinWords.length;
  const paragraphs = content
    .split(/\n\s*\n/)
    .filter((block) => block.trim() && !/^\s*(?:```|~~~)/.test(block))
    .length;

  return {
    characters: content.replace(/\s/g, "").length,
    words,
    paragraphs,
    headings: headingCount ?? extractMarkdownHeadings(content).length,
    images: (content.match(/!\[[^\]]*]\([^)]+\)/g) ?? []).length,
    readingMinutes: Math.max(1, Math.ceil(words / 400)),
  };
}

export function activeHeadingAt(headings: MarkdownHeading[], position: number): MarkdownHeading | null {
  let active: MarkdownHeading | null = null;
  for (const heading of headings) {
    if (heading.from > position) break;
    active = heading;
  }
  return active;
}

function cleanHeadingText(value: string): string {
  return value
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .replace(/\\([\\`*_[\]{}()#+\-.!])/g, "$1")
    .trim();
}
