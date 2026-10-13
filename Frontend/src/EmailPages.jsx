import "./AuthPage.css";
import { useEffect, useRef, useState } from "react";
import logo from "./assets/nexus-logo.svg";
import { apiFetch, setToken } from "./api.js";

const tokenFromUrl = () => new URLSearchParams(window.location.search).get("token");

// opened from the link in the verification email: /verify-email?token=...
export function VerifyEmailPage() {
    const token = tokenFromUrl();
    const [status, setStatus] = useState(token ? "loading" : "error");
    const [message, setMessage] = useState(token ? "" : "This verification link is invalid.");
    const started = useRef(false); // React StrictMode runs effects twice in development; the link is single-use

    useEffect(() => {
        if (!token || started.current) return;
        started.current = true;

        apiFetch("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
            .then(async (res) => {
                if (res.ok) {
                    setStatus("success");
                } else {
                    setMessage((await res.json()).error);
                    setStatus("error");
                }
            })
            .catch(() => {
                setMessage("Can't reach the server. Please try again later.");
                setStatus("error");
            });
    }, [token]);

    return (
        <div className="authPage">
            <div className="authCard">
                <img src={logo} alt="NexusGPT logo" className="authLogo" />
                {status === "loading" && <h1>Verifying…</h1>}
                {status === "success" && (
                    <>
                        <h1>Email verified ✓</h1>
                        <p className="authSub">Thanks! Your email address is confirmed.</p>
                        <a className="authSubmit linkBtn" href="/">Continue to NexusGPT</a>
                    </>
                )}
                {status === "error" && (
                    <>
                        <h1>Couldn't verify</h1>
                        <p className="authError" role="alert">{message}</p>
                        <p className="authSub">Log in and use “Resend email” to get a new link.</p>
                        <a className="authSubmit linkBtn" href="/">Go to NexusGPT</a>
                    </>
                )}
            </div>
        </div>
    );
}

// opened from the link in the reset email: /reset-password?token=...
export function ResetPasswordPage() {
    const token = tokenFromUrl();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState(token ? "" : "This reset link is invalid.");
    const [done, setDone] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError("");

        if (password !== confirm) {
            setError("The two passwords don't match.");
            return;
        }

        setSubmitting(true);
        try {
            const res = await apiFetch("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Something went wrong");

            setToken(null); // the old session is no longer valid
            setDone(true);
        } catch (err) {
            setError(err instanceof TypeError ? "Can't reach the server. Please try again later." : err.message);
        }
        setSubmitting(false);
    };

    return (
        <div className="authPage">
            {done ? (
                <div className="authCard">
                    <img src={logo} alt="NexusGPT logo" className="authLogo" />
                    <h1>Password updated ✓</h1>
                    <p className="authSub">You can now log in with your new password. You've been signed out of other devices.</p>
                    <a className="authSubmit linkBtn" href="/">Log in</a>
                </div>
            ) : (
                <form className="authCard" onSubmit={submit}>
                    <img src={logo} alt="NexusGPT logo" className="authLogo" />
                    <h1>Choose a new password</h1>
                    <p className="authSub">Use at least 8 characters.</p>

                    <label>
                        New password
                        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                    </label>
                    <label>
                        Confirm password
                        <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
                    </label>

                    {error && <p className="authError" role="alert">{error}</p>}

                    <button type="submit" className="authSubmit" disabled={submitting || !token}>
                        {submitting ? "Please wait…" : "Update password"}
                    </button>
                    <p className="authSwitch"><a href="/">Back to log in</a></p>
                </form>
            )}
        </div>
    );
}
