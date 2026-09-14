import { detectSectionTitle } from "./cleaner.js";
import type { PdfPage } from "./pdf.js";

export type TextChunk = {
  text: string;
  chunkIndex: number;
  pageNumber?: number;
  sectionTitle?: string;
};

type Word = { word: string; page: number };

const TARGET_WORDS = 700;
const OVERLAP_WORDS = 110;
const MIN_WORDS = 40;

export function chunkPages(
  pages: PdfPage[],
  options: { targetWords?: number; overlapWords?: number } = {},
): TextChunk[] {
  const target = options.targetWords ?? TARGET_WORDS;
  const overlap = options.overlapWords ?? OVERLAP_WORDS;
  const words: Word[] = [];

  for (const page of pages) {
    for (const word of page.text.split(/\s+/).filter(Boolean)) {
      words.push({ word, page: page.pageNumber });
    }
  }

  if (!words.length) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < words.length) {
    const slice = words.slice(start, start + target);
    if (!slice.length) break;

    let used = slice;
    if (used.length < MIN_WORDS && chunks.length) {
      const prev = chunks[chunks.length - 1];
      if (prev) {
        prev.text = `${prev.text} ${used.map((item) => item.word).join(" ")}`.trim();
      }
      break;
    }

    const text = used.map((item) => item.word).join(" ");
    chunks.push({
      text,
      chunkIndex: index,
      pageNumber: used[0]?.page,
      sectionTitle: detectSectionTitle(text),
    });
    index += 1;

    if (start + target >= words.length) break;
    start += Math.max(1, target - overlap);
  }

  return chunks;
}
