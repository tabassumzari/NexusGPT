import mongoose from "mongoose";

// Uploaded images / documents. Bytes live in MongoDB so the app needs no extra storage.
const AttachmentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    threadId: { type: String, default: "" },
    name: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    kind: { type: String, enum: ["image", "text"], required: true },
    data: Buffer,            // images: the raw bytes
    text: String,            // documents: extracted text
    truncated: { type: Boolean, default: false },
    attached: { type: Boolean, default: false }, // false until it is sent in a message
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Attachment", AttachmentSchema);
