import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        default: ""
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    passwordHash: {
        type: String,
        required: true
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    // we store only a SHA-256 hash of each emailed token, never the token itself
    verifyTokenHash: String,
    verifyTokenExpires: Date,
    resetTokenHash: String,
    resetTokenExpires: Date,
    // bumped on password reset: every login token issued before that stops working
    tokenVersion: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model("User", UserSchema);
