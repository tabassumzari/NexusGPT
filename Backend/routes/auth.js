import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import User from "../models/User.js";
import { requireAuthLoose } from "../middleware/auth.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../utils/mailer.js";

const router = express.Router();

const limiter = (limit, message) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message }
});

// slow down brute-force attempts on login/signup, and email-sending routes even more
const authLimiter = limiter(Number(process.env.AUTH_RATE_LIMIT) || 30, "Too many attempts. Please try again in a few minutes.");
const emailLimiter = limiter(Number(process.env.EMAIL_RATE_LIMIT) || 5, "Too many email requests. Please try again later.");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOUR = 60 * 60 * 1000;

const requireVerification = () => process.env.REQUIRE_EMAIL_VERIFICATION === "true";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

// the raw token goes in the email; only its hash is stored in the database
const newToken = () => {
    const raw = crypto.randomBytes(32).toString("hex");
    return { raw, hash: sha256(raw) };
};

const signToken = (user) =>
    jwt.sign({ sub: user.id, v: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: "7d" });

const publicUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified)
});

// creates a fresh verification token on the user and emails it (never throws)
async function issueVerificationEmail(user) {
    try {
        const { raw, hash } = newToken();
        user.verifyTokenHash = hash;
        user.verifyTokenExpires = new Date(Date.now() + 24 * HOUR);
        await user.save();
        await sendVerificationEmail(user, raw);
    } catch (err) {
        console.log("Failed to send verification email:", err.message);
    }
}

router.post("/signup", authLimiter, async (req, res) => {
    const { name = "", email = "", password = "" } = req.body ?? {};

    if (!EMAIL_REGEX.test(String(email))) {
        return res.status(400).json({ error: "Please enter a valid email address" });
    }
    if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    try {
        const normalizedEmail = String(email).trim().toLowerCase();

        if (await User.findOne({ email: normalizedEmail })) {
            return res.status(409).json({ error: "An account with this email already exists" });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({
            name: String(name).trim().slice(0, 60),
            email: normalizedEmail,
            passwordHash
        });

        await issueVerificationEmail(user);

        if (requireVerification()) {
            return res.status(201).json({ needsVerification: true, email: user.email });
        }
        res.status(201).json({ token: signToken(user), user: publicUser(user) });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: "An account with this email already exists" });
        }
        console.log(err);
        res.status(500).json({ error: "Failed to create account" });
    }
});

router.post("/login", authLimiter, async (req, res) => {
    const { email = "", password = "" } = req.body ?? {};

    try {
        const user = await User.findOne({ email: String(email).trim().toLowerCase() });
        const valid = user && typeof password === "string" && (await bcrypt.compare(password, user.passwordHash));

        // same message for "no such user" and "wrong password" on purpose
        if (!valid) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // only revealed after the password was correct, so it can't be used to probe for accounts
        if (requireVerification() && !user.emailVerified) {
            return res.status(403).json({
                error: "Please verify your email before logging in.",
                code: "EMAIL_NOT_VERIFIED",
                email: user.email
            });
        }

        res.json({ token: signToken(user), user: publicUser(user) });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to log in" });
    }
});

router.get("/me", requireAuthLoose, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        res.json({ user: publicUser(user) });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to load profile" });
    }
});

// ---------- email verification ----------
router.post("/verify-email", authLimiter, async (req, res) => {
    const token = String(req.body?.token ?? "");

    try {
        const user = token && await User.findOne({
            verifyTokenHash: sha256(token),
            verifyTokenExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ error: "This verification link is invalid or has expired." });
        }

        user.emailVerified = true;
        user.verifyTokenHash = undefined;
        user.verifyTokenExpires = undefined;
        await user.save();

        res.json({ ok: true });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to verify email" });
    }
});

// always answers the same way, so it can't be used to find out which emails have accounts
router.post("/resend-verification", emailLimiter, async (req, res) => {
    try {
        const user = await User.findOne({ email: String(req.body?.email ?? "").trim().toLowerCase() });
        if (user && !user.emailVerified) await issueVerificationEmail(user);
    } catch (err) {
        console.log(err);
    }
    res.json({ ok: true });
});

// ---------- password reset ----------
router.post("/forgot-password", emailLimiter, async (req, res) => {
    try {
        const user = await User.findOne({ email: String(req.body?.email ?? "").trim().toLowerCase() });

        if (user) {
            const { raw, hash } = newToken();
            user.resetTokenHash = hash;
            user.resetTokenExpires = new Date(Date.now() + HOUR);
            await user.save();
            await sendPasswordResetEmail(user, raw);
        }
    } catch (err) {
        console.log("Failed to send reset email:", err.message);
    }
    res.json({ ok: true });
});

router.post("/reset-password", authLimiter, async (req, res) => {
    const token = String(req.body?.token ?? "");
    const password = req.body?.password;

    if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    try {
        const user = token && await User.findOne({
            resetTokenHash: sha256(token),
            resetTokenExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ error: "This reset link is invalid or has expired." });
        }

        user.passwordHash = await bcrypt.hash(password, 10);
        user.resetTokenHash = undefined;
        user.resetTokenExpires = undefined;
        user.tokenVersion = (user.tokenVersion ?? 0) + 1; // logs out every existing session
        user.emailVerified = true;                        // they proved they own the inbox
        await user.save();

        res.json({ ok: true });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to reset password" });
    }
});

export default router;
