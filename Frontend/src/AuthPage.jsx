import "./AuthPage.css";
import { useContext, useState } from "react";
import { MyContext } from "./MyContext.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import logo from "./assets/nexus-logo.svg";
import { apiFetch } from "./api.js";

const NETWORK_ERROR = "Can't reach the server. Is the backend running?";

function AuthPage() {
    const { handleAuthSuccess } = useContext(MyContext);
    const [mode, setMode] = useState("login"); // "login" | "signup" | "forgot"
    const [form, setForm] = useState({ name: "", email: "", password: "" });
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [sentTo, setSentTo] = useState(null);   // set -> show the "check your email" screen for this address
    const [notice, setNotice] = useState("");     // message on that screen
    const [resent, setResent] = useState(false);
    const [resetSent, setResetSent] = useState(false);

    const isSignup = mode === "signup";
    const isForgot = mode === "forgot";

    const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

    const goTo = (next) => {
        setMode(next);
        setError("");
        setResetSent(false);
    };

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        setSubmitting(true);

        try {
            if (isForgot) {
                await apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: form.email }) });
                setResetSent(true);
            } else {
                const payload = isSignup ? form : { email: form.email, password: form.password };
                const response = await apiFetch(`/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
                const data = await response.json();

                if (response.status === 403 && data.code === "EMAIL_NOT_VERIFIED") {
                    setNotice("Please verify your email before logging in.");
                    setSentTo(data.email || form.email);
                } else if (!response.ok) {
                    throw new Error(data.error || "Something went wrong");
                } else if (data.needsVerification) {
                    setNotice("Almost there! We've sent you a verification link.");
                    setSentTo(data.email);
                } else {
                    handleAuthSuccess(data);
                }
            }
        } catch (err) {
            setError(err instanceof TypeError ? NETWORK_ERROR : err.message);
        }
        setSubmitting(false);
    };

    const resend = async () => {
        try {
            await apiFetch("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email: sentTo }) });
            setResent(true);
        } catch {
            setError(NETWORK_ERROR);
        }
    };

    const backToLogin = () => {
        setSentTo(null);
        setResent(false);
        goTo("login");
    };

    // ---- "check your email" screen ----
    if (sentTo) {
        return (
            <div className="authPage">
                <div className="authTheme"><ThemeToggle /></div>
                <div className="authCard">
                    <img src={logo} alt="NexusGPT logo" className="authLogo" />
                    <h1>Check your email</h1>
                    <p className="authSub">{notice} Open the link we sent to <strong>{sentTo}</strong>, then log in.</p>
                    {error && <p className="authError" role="alert">{error}</p>}
                    <button type="button" className="authSubmit" onClick={backToLogin}>Back to log in</button>
                    <p className="authSwitch">
                        Didn't get it?{" "}
                        <button type="button" onClick={resend} disabled={resent}>{resent ? "Sent again ✓" : "Resend email"}</button>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="authPage">
            <div className="authTheme"><ThemeToggle /></div>

            <form className="authCard" onSubmit={submit}>
                <img src={logo} alt="NexusGPT logo" className="authLogo" />
                <h1>{isForgot ? "Reset your password" : isSignup ? "Create your account" : "Welcome back"}</h1>
                <p className="authSub">
                    {isForgot ? "Enter your email and we'll send you a reset link."
                        : isSignup ? "Sign up to start chatting with NexusGPT."
                        : "Log in to continue to NexusGPT."}
                </p>

                {isSignup && (
                    <label>
                        Name
                        <input type="text" value={form.name} onChange={update("name")} placeholder="Your name" autoComplete="name" />
                    </label>
                )}

                <label>
                    Email
                    <input type="email" required value={form.email} onChange={update("email")} placeholder="you@example.com" autoComplete="email" />
                </label>

                {!isForgot && (
                    <label>
                        Password
                        <input
                            type="password"
                            required
                            minLength={isSignup ? 8 : undefined}
                            value={form.password}
                            onChange={update("password")}
                            placeholder={isSignup ? "At least 8 characters" : "Your password"}
                            autoComplete={isSignup ? "new-password" : "current-password"}
                        />
                    </label>
                )}

                {mode === "login" && (
                    <button type="button" className="forgotLink" onClick={() => goTo("forgot")}>Forgot password?</button>
                )}

                {error && <p className="authError" role="alert">{error}</p>}
                {resetSent && (
                    <p className="authSuccess" role="status">
                        If an account exists for {form.email}, a reset link is on its way. It's valid for 1 hour.
                    </p>
                )}

                <button type="submit" className="authSubmit" disabled={submitting}>
                    {submitting ? "Please wait…" : isForgot ? "Send reset link" : isSignup ? "Sign up" : "Log in"}
                </button>

                <p className="authSwitch">
                    {isForgot ? (
                        <button type="button" onClick={() => goTo("login")}>Back to log in</button>
                    ) : (
                        <>
                            {isSignup ? "Already have an account?" : "New here?"}{" "}
                            <button type="button" onClick={() => goTo(isSignup ? "login" : "signup")}>{isSignup ? "Log in" : "Create an account"}</button>
                        </>
                    )}
                </p>
            </form>
        </div>
    );
}

export default AuthPage;
