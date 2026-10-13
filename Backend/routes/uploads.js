import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import Attachment from "../models/Attachment.js";
import requireAuth from "../middleware/auth.js";
import { processUpload, UploadError, LIMITS } from "../utils/attachments.js";

const router = express.Router();

// files are kept in memory just long enough to validate them and save them to MongoDB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.document, files: 1 } });

router.post("/uploads", requireAuth, (req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (!err) return next();
        const tooBig = err.code === "LIMIT_FILE_SIZE";
        res.status(tooBig ? 413 : 400).json({ error: tooBig ? "File is too large (max 10 MB)" : "Upload failed" });
    });
}, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        const processed = await processUpload(req.file);
        const doc = await Attachment.create({ user: req.userId, size: req.file.size, ...processed });

        res.status(201).json({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            kind: doc.kind,
            size: doc.size,
            truncated: doc.truncated
        });
    } catch (err) {
        if (err instanceof UploadError) {
            return res.status(err.status).json({ error: err.message });
        }
        console.log(err);
        res.status(500).json({ error: "Failed to save the file" });
    }
});

// Shows an uploaded image. Owner only (the frontend fetches it with the login token).
router.get("/attachments/:id", requireAuth, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: "Not found" });
        }

        const doc = await Attachment.findOne({ _id: req.params.id, user: req.userId }).select("kind mimeType data");
        if (!doc || doc.kind !== "image") {
            return res.status(404).json({ error: "Not found" });
        }

        res.set({
            "Content-Type": doc.mimeType,
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=3600"
        });
        res.send(doc.data);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to load file" });
    }
});

export default router;
