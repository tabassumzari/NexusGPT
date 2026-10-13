import nodemailer from "nodemailer";

// With SMTP_HOST set, emails are really sent. Without it (local development) the email
// is printed to the server console, so you can click the link without any email setup.
let transporter;

const getTransporter = () => {
    if (!process.env.SMTP_HOST) return null;
    transporter ??= nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    return transporter;
};

export const clientUrl = () => (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");

const layout = (heading, intro, buttonText, url) => `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#181a33">
  <h2 style="margin:0 0 12px">${heading}</h2>
  <p style="line-height:1.5">${intro}</p>
  <p style="margin:24px 0"><a href="${url}" style="background:#6d4aff;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">${buttonText}</a></p>
  <p style="font-size:13px;color:#666a8c">Or paste this link into your browser:<br>${url}</p>
</div>`;

export async function sendMail({ to, subject, text, html }) {
    const transport = getTransporter();

    if (!transport) {
        console.log(`\n📧 [DEV EMAIL - set SMTP_HOST in .env to send for real]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
        return;
    }

    await transport.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || "NexusGPT <no-reply@localhost>",
        to, subject, text, html
    });
}

export const sendVerificationEmail = (user, token) => {
    const url = `${clientUrl()}/verify-email?token=${token}`;
    return sendMail({
        to: user.email,
        subject: "Verify your NexusGPT email",
        text: `Hi ${user.name || "there"},\n\nConfirm your email address by opening this link (valid for 24 hours):\n${url}\n\nIf you didn't create an account, you can ignore this email.`,
        html: layout("Verify your email", `Hi ${user.name || "there"}, confirm your email address to finish setting up NexusGPT. This link is valid for 24 hours.`, "Verify email", url)
    });
};

export const sendPasswordResetEmail = (user, token) => {
    const url = `${clientUrl()}/reset-password?token=${token}`;
    return sendMail({
        to: user.email,
        subject: "Reset your NexusGPT password",
        text: `Hi ${user.name || "there"},\n\nReset your password using this link (valid for 1 hour):\n${url}\n\nIf you didn't ask for this, you can ignore this email. Your password won't change.`,
        html: layout("Reset your password", `Hi ${user.name || "there"}, we received a request to reset your password. This link is valid for 1 hour. If it wasn't you, ignore this email.`, "Reset password", url)
    });
};
