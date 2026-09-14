import { createRequire } from "node:module";
import { cleanText } from "./cleaner.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (buffer: Buffer, options?: unknown) => Promise<{
  numpages: number;
  text: string;
}>;

export type PdfPage = {
  pageNumber: number;
  text: string;
};

export async function extractPdfPages(buffer: Buffer): Promise<{ pages: PdfPage[]; numPages: number }> {
  const pages: PdfPage[] = [];

  const result = await pdfParse(buffer, {
    pagerender: (pageData: {
      pageNumber?: number;
      getTextContent: () => Promise<{ items: Array<{ str?: string; transform?: number[] }> }>;
    }) =>
      pageData.getTextContent().then((content) => {
        let lastY: number | undefined;
        let text = "";
        for (const item of content.items) {
          const y = item.transform?.[5];
          if (lastY != null && y != null && Math.abs(lastY - y) > 2) text += "\n";
          else if (text && !text.endsWith("\n")) text += " ";
          text += item.str ?? "";
          if (y != null) lastY = y;
        }
        pages.push({
          pageNumber: pageData.pageNumber ?? pages.length + 1,
          text: cleanText(text),
        });
        return text;
      }),
  });

  if (pages.length) {
    return { pages: pages.filter((page) => page.text), numPages: result.numpages || pages.length };
  }

  const fallback = cleanText(result.text ?? "")
    .split(/\n{2,}/)
    .map((text, i) => ({ pageNumber: i + 1, text: text.trim() }))
    .filter((page) => page.text);

  return { pages: fallback, numPages: result.numpages || fallback.length };
}
