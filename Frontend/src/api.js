import { API_URL } from "./config.js";

const TOKEN_KEY = "nexus-token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) =>
    token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

// App.jsx registers a function here that logs the user out when the server says 401
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

/** fetch() against the backend that automatically adds the login token. */
export async function apiFetch(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    // JSON bodies need a content type; FormData (file uploads) sets its own
    if (typeof options.body === "string" && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_URL}${path}`, { ...options, headers });
    if (response.status === 401 && token) onUnauthorized();
    return response;
}

export async function readError(response) {
    try {
        const data = await response.json();
        return data.error || "Request failed";
    } catch {
        return "Request failed";
    }
}

/** Uploads one file (image / PDF / text). Resolves to { id, name, kind, mimeType, size }. */
export async function uploadFile(file) {
    const body = new FormData();
    body.append("file", file);

    const response = await apiFetch("/uploads", { method: "POST", body });
    if (!response.ok) throw new Error(await readError(response));
    return response.json();
}

// <img> tags can't send the login token, so images are fetched with it and shown from a blob URL
const imageCache = new Map();

export function getImageUrl(id) {
    if (!imageCache.has(id)) {
        const promise = apiFetch(`/attachments/${id}`)
            .then(async (res) => {
                if (!res.ok) throw new Error("image unavailable");
                return URL.createObjectURL(await res.blob());
            })
            .catch((err) => {
                imageCache.delete(id);
                throw err;
            });
        imageCache.set(id, promise);
    }
    return imageCache.get(id);
}

export function clearImageCache() {
    imageCache.forEach((promise) => promise.then((url) => URL.revokeObjectURL(url)).catch(() => {}));
    imageCache.clear();
}

/**
 * Sends a message and reads the Server-Sent Events stream.
 * (The browser's EventSource only supports GET, so we read the POST response stream ourselves.)
 * mode: "new" | "regenerate" | "edit".  Calls onToken(text) for every chunk. Throws on errors.
 */
export async function streamChat({ threadId, message, model, mode = "new", attachments = [], signal, onToken }) {
    const response = await apiFetch("/chat", {
        method: "POST",
        body: JSON.stringify({ threadId, message, model, mode, attachments }),
        signal
    });

    if (!response.ok) throw new Error(await readError(response));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    let completed = false;
    try {
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop(); // last piece may be incomplete

        for (const event of events) {
            const line = event.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;

            const data = JSON.parse(line.slice(6));
            if (data.type === "token") onToken(data.text);
            else if (data.type === "error") throw new Error(data.message);
            else if (data.type === "done") completed = true;
        }
    }
    if (!completed) throw new Error("The reply was interrupted. Please retry.");
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}
