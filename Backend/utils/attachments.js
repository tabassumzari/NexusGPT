import path from "path";
import sharp from "sharp";
import { getDocumentProxy, extractText } from "unpdf";

export const LIMITS = {
    image: 5 * 1024 * 1024,      // 5 MB per image
    document: 10 * 1024 * 1024,  // 10 MB per PDF / text file
    perMessage: 4,               // attachments per message
    textChars: 60_000            // extracted text kept per document
};

const TEXT_EXTENSIONS = new Set([
    "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "xml", "yml", "yaml", "toml", "ini", "log",
    "html", "htm", "css", "scss", "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "java", "c", "h", "cpp",
    "hpp", "cs", "go", "rs", "rb", "php", "swift", "kt", "sql", "sh", "bat", "ps1", "r", "tex"
]);

export class UploadError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// We look at the real bytes instead of trusting the browser's file type
function sniffImage(buf) {
    if (buf.length < 12) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
    if (buf.toString("ascii", 0, 4) === "GIF8") return "image/gif";
    if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
    return null; // note: SVG is deliberately not allowed (it can contain scripts)
}

function looksLikeText(buf) {
    if (buf.subarray(0, 8192).includes(0)) return false; // binary files contain NUL bytes
    try {
        new TextDecoder("utf-8", { fatal: true }).decode(buf);
        return true;
    } catch {
        return false;
    }
}

// multer decodes file names as latin1; this restores UTF-8 names and removes unsafe characters
const cleanName = (original) =>
    path.basename(Buffer.from(original || "file", "latin1").toString("utf8"))
        .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_")
        .slice(0, 100) || "file";

const clip = (text) =>
    text.length > LIMITS.textChars
        ? { text: text.slice(0, LIMITS.textChars), truncated: true }
        : { text, truncated: false };

/** Validates an uploaded file and returns the fields to store. Throws UploadError for bad files. */
export async function processUpload({ originalname, buffer }) {
    const name = cleanName(originalname);
    const ext = path.extname(name).slice(1).toLowerCase();

    const imageType = sniffImage(buffer);
    if (imageType) {
        if (buffer.length > LIMITS.image) throw new UploadError(413, "Images can be at most 5 MB");
        try {
            const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: "warning" });
            const metadata = await image.metadata();
            const formats = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
            if (formats[metadata.format] !== imageType) throw new Error("Invalid image format");
            await image.raw().toBuffer(); // fully decode, not just inspect the header
        } catch {
            throw new UploadError(422, "Invalid or damaged image (maximum 40 megapixels)");
        }
        return { name, kind: "image", mimeType: imageType, data: buffer };
    }

    if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
        let text;
        try {
            const pdf = await getDocumentProxy(new Uint8Array(buffer));
            ({ text } = await extractText(pdf, { mergePages: true }));
        } catch {
            throw new UploadError(422, "Couldn't read this PDF (it may be damaged or password-protected)");
        }
        if (!text?.trim()) {
            throw new UploadError(422, "No readable text found in this PDF (scanned PDFs aren't supported)");
        }
        return { name, kind: "text", mimeType: "application/pdf", ...clip(text.trim()) };
    }

    if (TEXT_EXTENSIONS.has(ext) && looksLikeText(buffer)) {
        return { name, kind: "text", mimeType: "text/plain", ...clip(buffer.toString("utf8")) };
    }

    throw new UploadError(415, "Unsupported file type. Use images (PNG, JPG, GIF, WebP), PDFs, or text/code files.");
}
