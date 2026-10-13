import express from "express";
import mongoose from "mongoose";
import Thread from "../models/Thread.js";
import Attachment from "../models/Attachment.js";
import requireAuth from "../middleware/auth.js";
import { getAvailableModels, resolveModel, streamCompletion } from "../providers/index.js";
import { buildHistory } from "../utils/history.js";
import { LIMITS } from "../utils/attachments.js";

const router = express.Router();

// every route below needs a logged-in user, and only touches that user's data
router.use(requireAuth);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const makeTitle = (text) => (text.length > 40 ? text.slice(0, 40) + "…" : text);

//Models the dropdown can show (only providers with an API key configured)
router.get("/models", (req, res) => {
    res.json(getAvailableModels().map(({ id, label, desc, provider, vision }) => ({ id, label, desc, provider, vision })));
});

//Get all threads (optionally search titles + message text with ?q=)
router.get("/thread", async (req, res) => {
    try {
        const filter = { user: req.userId };
        const q = String(req.query.q ?? "").trim().slice(0, 100);

        if (q) {
            const rx = new RegExp(escapeRegex(q), "i");
            filter.$or = [{ title: rx }, { "messages.content": rx }];
        }

        const threads = await Thread.find(filter)
            .select("threadId title updatedAt")
            .sort({ updatedAt: -1 });
        //descending order of updatedAt...most recent data on top
        res.json(threads);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to fetch threads" });
    }
});

router.get("/thread/:threadId", async (req, res) => {
    const { threadId } = req.params;

    try {
        const thread = await Thread.findOne({ threadId, user: req.userId });

        if (!thread) {
            return res.status(404).json({ error: "Thread not found" });
        }

        res.json(thread.messages);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to fetch chat" });
    }
});

//Rename a thread
router.patch("/thread/:threadId", async (req, res) => {
    const { threadId } = req.params;
    const title = String(req.body?.title ?? "").trim().slice(0, 80);

    if (!title) {
        return res.status(400).json({ error: "Title can't be empty" });
    }

    try {
        const thread = await Thread.findOneAndUpdate(
            { threadId, user: req.userId },
            { title },
            { new: true }
        );

        if (!thread) {
            return res.status(404).json({ error: "Thread not found" });
        }

        res.json({ threadId: thread.threadId, title: thread.title });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to rename thread" });
    }
});

router.delete("/thread/:threadId", async (req, res) => {
    const { threadId } = req.params;

    try {
        const deletedThread = await Thread.findOneAndDelete({ threadId, user: req.userId });

        if (!deletedThread) {
            return res.status(404).json({ error: "Thread not found" });
        }

        // delete the files that belonged to this chat too
        const attachmentIds = deletedThread.messages.flatMap((m) => (m.attachments ?? []).map((a) => a.id));
        if (attachmentIds.length) {
            await Attachment.deleteMany({ _id: { $in: attachmentIds }, user: req.userId });
        }

        res.status(200).json({ success: "Thread deleted successfully" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to delete thread" });
    }
});

// Streams the reply back as Server-Sent Events:
//   data: {"type":"token","text":"Hel"}   (many times)
//   data: {"type":"done"}                  or   data: {"type":"error","message":"..."}
//
// mode "new"        (default) add `message` (+ optional `attachments` ids) and answer it
// mode "regenerate" drop the last answer and answer the last user message again
// mode "edit"       replace the text of the last user message with `message`, drop the old answer, answer again
router.post("/chat", async (req, res) => {
    const { threadId, message = "", model, mode = "new", attachments: attachmentIds = [] } = req.body ?? {};

    if (!threadId || typeof threadId !== "string" || typeof message !== "string") {
        return res.status(400).json({ error: "missing required fields" });
    }
    if (!["new", "regenerate", "edit"].includes(mode)) {
        return res.status(400).json({ error: "invalid mode" });
    }
    if (message.length > 8000) {
        return res.status(400).json({ error: "Message is too long (max 8000 characters)" });
    }
    if (
        !Array.isArray(attachmentIds) ||
        attachmentIds.length > LIMITS.perMessage ||
        attachmentIds.some((id) => !mongoose.isValidObjectId(id)) ||
        (mode !== "new" && attachmentIds.length)
    ) {
        return res.status(400).json({ error: "invalid attachments" });
    }

    const text = message.trim();
    if (mode === "new" && !text && !attachmentIds.length) {
        return res.status(400).json({ error: "missing required fields" });
    }

    const selectedModel = resolveModel(model);
    if (!selectedModel) {
        return res.status(503).json({ error: "No AI provider is configured. Add an API key to Backend/.env" });
    }

    let thread;
    let newAttachments = [];
    try {
        thread = await Thread.findOne({ threadId });

        if (thread && String(thread.user) !== req.userId) {
            return res.status(404).json({ error: "Thread not found" });
        }

        if (mode === "new") {
            // attachments must be yours and not already used in another message
            if (attachmentIds.length) {
                const unique = [...new Set(attachmentIds)];
                const docs = await Attachment.find({ _id: { $in: unique }, user: req.userId }).select("name mimeType kind size attached");

                if (docs.length !== unique.length || docs.some((d) => d.attached)) {
                    return res.status(400).json({ error: "An attachment is missing or was already used. Please attach it again." });
                }
                newAttachments = unique.map((id) => {
                    const d = docs.find((doc) => String(doc._id) === id);
                    return { id: d._id, name: d.name, mimeType: d.mimeType, kind: d.kind, size: d.size };
                });
            }

            if (newAttachments.some((a) => a.kind === "image") && !selectedModel.vision) {
                return res.status(400).json({ error: `${selectedModel.label} can't read images. Pick a different model or remove the image.` });
            }

            if (!thread) {
                //create a new thread in Db
                thread = new Thread({ threadId, user: req.userId, title: makeTitle(text || newAttachments[0].name), messages: [] });
            }
            thread.messages.push({ role: "user", content: text, attachments: newAttachments });
        } else {
            if (!thread) {
                return res.status(404).json({ error: "Thread not found" });
            }

            // find the last user message and drop everything the assistant said after it
            let idx = thread.messages.length - 1;
            while (idx >= 0 && thread.messages[idx].role === "assistant") idx--;
            if (idx < 0) {
                return res.status(400).json({ error: "Nothing to regenerate" });
            }
            thread.messages.splice(idx + 1);

            if (mode === "edit") {
                const last = thread.messages[idx];
                if (!text && !last.attachments?.length) {
                    return res.status(400).json({ error: "Message can't be empty" });
                }
                last.content = text;
            }
        }
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: "something went wrong" });
    }

    let history;
    try {
        history = await buildHistory(thread.messages, { userId: req.userId, allowImages: selectedModel.vision });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: "something went wrong" });
    }

    // Persist the submitted turn before contacting the provider, including on failures.
    try {
        thread.updatedAt = new Date();
        await thread.save();
        if (newAttachments.length) {
            await Attachment.updateMany(
                { _id: { $in: newAttachments.map((a) => a.id) }, user: req.userId },
                { attached: true, threadId }
            );
        }
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: "Failed to save the conversation" });
    }

    // from here on we're streaming
    res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    });
    res.flushHeaders();

    const send = (payload) => {
        if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // if the user presses Stop (or closes the tab), cancel the upstream AI request
    const controller = new AbortController();
    res.on("close", () => {
        if (!res.writableEnded) controller.abort();
    });

    let reply = "";
    let failure = null;

    try {
        for await (const chunk of streamCompletion({ model: selectedModel, messages: history, signal: controller.signal })) {
            reply += chunk;
            send({ type: "token", text: chunk });
        }
    } catch (err) {
        if (!controller.signal.aborted) {
            console.log(err);
            failure = err.message || "The AI provider returned an error";
        }
    }

    // save whatever we got (a full reply, or the partial text if stopped / interrupted)
    if (reply) {
        try {
            thread.messages.push({ role: "assistant", content: reply });
            thread.updatedAt = new Date();
            await thread.save();

        } catch (err) {
            console.log(err);
            failure = failure || "Failed to save the conversation";
        }
    }

    if (!reply && !failure && !controller.signal.aborted) failure = "The AI provider returned an empty reply. Please retry.";
    send(failure ? { type: "error", message: failure } : { type: "done" });
    res.end();
});

export default router;
