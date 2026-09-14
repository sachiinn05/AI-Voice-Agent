const NOISE =
  /^(page\s+\d+|confidential|internal use only|copyright|\d+\s*\/\s*\d+)$/i;

export function cleanText(raw: string): string {
  return raw
    .replace(/\r/g, "\n")
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .filter((line) => line && !NOISE.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function detectSectionTitle(text: string): string | undefined {
  const first = text.split(/\n/)[0]?.trim() ?? "";
  const words = first.split(/\s+/);
  if (words.length < 2 || words.length > 12) return undefined;
  if (/[.?!]$/.test(first)) return undefined;
  if (first.length > 80) return undefined;
  return first;
}
