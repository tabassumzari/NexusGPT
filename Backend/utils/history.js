import Attachment from "../models/Attachment.js";

const MAX_MESSAGES = 20;          // how much of the conversation the model sees
const MAX_HISTORY_IMAGES = 6;     // newest images kept; older ones become a text note
const MAX_HISTORY_FILE_CHARS = 150_000;

/**
 * Turns saved messages into the provider-neutral format:
 *   { role, content: string | [{type:"text",text} | {type:"image",mimeType,data(base64)}] }
 * Text/PDF attachments are inlined as text; images become image parts (if the model supports them).
 */
export async function buildHistory(messages, { userId, allowImages }) {
    const window = messages.slice(-MAX_MESSAGES).map((m) => ({
        role: m.role,
        content: m.content ?? "",
        attachments: (m.attachments ?? []).map((a) => ({ id: String(a.id), name: a.name }))
    }));
    while (window.length && window[0].role !== "user") window.shift(); // providers want a user turn first

    const ids = window.flatMap((m) => m.attachments.map((a) => a.id));
    const docs = ids.length ? await Attachment.find({ _id: { $in: ids }, user: userId }) : [];
    const byId = new Map(docs.map((d) => [String(d._id), d]));

    let imageBudget = MAX_HISTORY_IMAGES;
    let charBudget = MAX_HISTORY_FILE_CHARS;
    const out = [];

    // newest first, so the most recent files win the budget
    for (let i = window.length - 1; i >= 0; i--) {
        const m = window[i];
        if (!m.attachments.length) {
            out.push({ role: m.role, content: m.content });
            continue;
        }

        const images = [];
        const notes = [];

        for (const a of m.attachments) {
            const doc = byId.get(a.id);
            if (!doc) {
                notes.push(`[Attachment "${a.name}" is no longer available]`);
            } else if (doc.kind === "image") {
                if (allowImages && imageBudget > 0 && doc.data) {
                    imageBudget--;
                    images.push({ type: "image", mimeType: doc.mimeType, data: doc.data.toString("base64") });
                } else {
                    notes.push(`[Image "${a.name}" omitted]`);
                }
            } else if (doc.text.length <= charBudget) {
                charBudget -= doc.text.length;
                notes.push(`Attached file "${a.name}"${doc.truncated ? " (truncated)" : ""}:\n\`\`\`\n${doc.text}\n\`\`\``);
            } else {
                notes.push(`[File "${a.name}" omitted to save space]`);
            }
        }

        const text = [...notes, m.content].filter(Boolean).join("\n\n");
        out.push({
            role: m.role,
            content: images.length ? [...images, ...(text ? [{ type: "text", text }] : [])] : text
        });
    }

    return out.reverse();
}
