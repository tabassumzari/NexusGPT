import express from "express";
import "dotenv/config";
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import uploadRoutes from "./routes/uploads.js";
import chatRoutes from "./routes/chat.js";
import Attachment from "./models/Attachment.js";
import { getAvailableModels } from "./providers/index.js";

if (!process.env.JWT_SECRET) {
    console.error("Missing JWT_SECRET in Backend/.env (see .env.example). Exiting.");
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 8080;

// behind a reverse proxy (nginx, Render, ...) set TRUST_PROXY=1 so rate limiting sees real client IPs
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use(express.json());

// CLIENT_ORIGIN="https://app.example.com" restricts which website may call the API (comma-separated list).
// Leave it empty during development to allow everything.
app.use(cors(process.env.CLIENT_ORIGIN ? { origin: process.env.CLIENT_ORIGIN.split(",").map((o) => o.trim()) } : undefined));

// used by Docker / hosting platforms to check the server is alive
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", db: mongoose.connection.readyState === 1 });
});

app.use("/api/auth", authRoutes);
app.use("/api", uploadRoutes);
app.use("/api", chatRoutes);

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected with Database!");
    } catch (err) {
        console.log("Failed to connect with Db", err);
    }
};

// uploaded files that were never sent in a message are removed after 24 hours
const cleanupOrphanUploads = () =>
    Attachment.deleteMany({ attached: false, createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
        .catch((err) => console.log("Upload cleanup failed:", err.message));

app.listen(PORT, () => {
    console.log(`NexusGPT server running on ${PORT}`);

    const models = getAvailableModels();
    if (models.length === 0) {
        console.warn("No AI provider configured: set OPENAI_API_KEY and/or ANTHROPIC_API_KEY in Backend/.env");
    } else {
        console.log("Models available:", models.map((m) => m.id).join(", "));
    }

    connectDB();
    setInterval(cleanupOrphanUploads, 60 * 60 * 1000).unref();
});
