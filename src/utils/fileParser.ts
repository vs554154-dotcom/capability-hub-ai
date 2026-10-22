/**
 * Text extraction for uploaded résumés and job descriptions, done in the browser.
 *
 *   .txt .md .csv .json .rtf   read as text (RTF control words are stripped)
 *   .docx                      unzipped; the text runs of word/document.xml
 *   .pdf                       pdf.js, loaded only when a PDF is chosen
 *
 * A file that yields no readable text raises UnreadableFileError with a message the
 * page shows. Nothing is ever filled in: the previous version sent compressed bytes,
 * or an invented "key qualifications ... referenced in the submission" paragraph, to
 * the AI as if it were the document.
 */

export interface ParsedFileInfo {
  fileName: string;
  fileSizeFormatted: string;
  fileType: "pdf" | "docx" | "txt";
  extractedText: string;
  wordCount: number;
  uploadDate: string;
  rawFile?: File;
}

export class UnreadableFileError extends Error {}

const TEXT_EXTENSIONS = ["txt", "md", "csv", "json", "rtf"];
const MAX_PDF_PAGES = 30;

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export async function parseUploadedFile(file: File): Promise<ParsedFileInfo> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";

  let fileType: ParsedFileInfo["fileType"];
  let text: string;
  if (TEXT_EXTENSIONS.includes(ext)) {
    fileType = "txt";
    text = await file.text();
    if (ext === "rtf") text = stripRtf(text);
  } else if (ext === "docx") {
    fileType = "docx";
    text = await extractDocx(await file.arrayBuffer());
  } else if (ext === "pdf") {
    fileType = "pdf";
    text = await extractPdf(await file.arrayBuffer());
  } else if (ext === "doc") {
    throw new UnreadableFileError("Older .doc files cannot be read here. Save it as .docx or PDF, or paste the text.");
  } else {
    throw new UnreadableFileError(`.${ext || "?"} files are not supported. Use PDF, DOCX or a text file.`);
  }

  const extractedText = cleanExtractedText(text);
  const words = extractedText.split(/\s+/).filter(w => /[A-Za-z]{2,}/.test(w));
  if (words.length < 5) {
    throw new UnreadableFileError(
      `No readable text was found in ${file.name}. If it is a scanned image, paste the text instead.`,
    );
  }

  return {
    fileName: file.name,
    fileSizeFormatted: formatBytes(file.size),
    fileType,
    extractedText,
    wordCount: extractedText.split(/\s+/).filter(Boolean).length,
    uploadDate: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    rawFile: file,
  };
}

// --- DOCX: a ZIP archive whose body is word/document.xml --------------------------

async function inflateRaw(data: Uint8Array): Promise<string> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

export async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const notWord = new UnreadableFileError("This .docx file is damaged or is not a Word document.");

  // The end-of-central-directory record sits in the last 64 KB.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw notWord;

  const entries = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let n = 0; n < entries && p + 46 <= bytes.length; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));

    if (name === "word/document.xml") {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return docxXmlToText(new TextDecoder().decode(data));
      if (method === 8) return docxXmlToText(await inflateRaw(data));
      throw notWord;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw notWord;
}

function docxXmlToText(xml: string): string {
  return xml
    .split(/<\/w:p>/)
    .map(paragraph => {
      const runs = paragraph
        .replace(/<w:tab\/>/g, "<w:t>\t</w:t>")
        .replace(/<w:br[^>]*\/>/g, "<w:t>\n</w:t>");
      return [...runs.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join("");
    })
    .join("\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// --- PDF: pdf.js, imported on first use so it adds nothing to page load -----------

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch {
      throw new UnreadableFileError("This PDF could not be opened. It may be damaged or password-protected.");
    }
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, MAX_PDF_PAGES); i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(
        content.items
          .map(item => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
          .join(""),
      );
    }
    return pages.join("\n\n");
  } finally {
    // Frees the worker's copy of the document.
    await task.destroy();
  }
}

// --- Plain text -------------------------------------------------------------------

function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "");
}

function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/ +/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
