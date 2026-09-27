import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

/** Extract all text from a PDF file on disk. */
export async function extractPdfText(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
