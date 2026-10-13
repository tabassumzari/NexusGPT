import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Protects a route: requires "Authorization: Bearer <token>" and sets req.userId.
// The user is looked up on every request so that deleted accounts and tokens issued
// before a password reset stop working immediately.
const build = ({ allowUnverified }) => async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || "").split(" ");

    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ error: "Authentication required" });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(payload.sub).select("tokenVersion emailVerified");

        if (!user || (user.tokenVersion ?? 0) !== (payload.v ?? 0)) {
            return res.status(401).json({ error: "Session expired. Please log in again." });
        }

        if (!allowUnverified && process.env.REQUIRE_EMAIL_VERIFICATION === "true" && !user.emailVerified) {
            return res.status(403).json({ error: "Please verify your email first", code: "EMAIL_NOT_VERIFIED" });
        }

        req.userId = String(user._id);
        next();
    } catch {
        return res.status(401).json({ error: "Session expired. Please log in again." });
    }
};

export const requireAuthLoose = build({ allowUnverified: true }); // e.g. /auth/me
export default build({ allowUnverified: false });
