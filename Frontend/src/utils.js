// Copy text to the clipboard. Falls back to the old method on plain-http pages,
// where navigator.clipboard isn't available.
export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const box = document.createElement("textarea");
        box.value = text;
        box.style.position = "fixed";
        box.style.opacity = "0";
        document.body.appendChild(box);
        box.select();
        let ok = false;
        try {
            ok = document.execCommand("copy");
        } catch {
            ok = false;
        }
        box.remove();
        return ok;
    }
}

export const fileIconClass = (mimeType) =>
    mimeType === "application/pdf" ? "fa-file-pdf" : "fa-file-lines";

export const MAX_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

// what the file picker offers (the server still checks the real file type)
export const ACCEPT_FILES =
    "image/png,image/jpeg,image/gif,image/webp,.pdf,.txt,.md,.csv,.tsv,.json,.xml,.yml,.yaml,.html,.css," +
    ".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.sql,.sh,.log";
