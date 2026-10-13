import "./ChatWindow.css";
import Chat from "./Chat.jsx";
import ModelSelect from "./ModelSelect.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import useSpeechRecognition from "./useSpeechRecognition.js";
import { MyContext } from "./MyContext.jsx";
import { useContext, useState, useEffect, useRef } from "react";
import {ScaleLoader} from "react-spinners";
import { apiFetch, streamChat, uploadFile } from "./api.js";
import { ACCEPT_FILES, MAX_ATTACHMENTS, MAX_FILE_BYTES, MAX_IMAGE_BYTES, fileIconClass } from "./utils.js";

function ChatWindow() {
    const {
        prompt, setPrompt, currThreadId, prevChats, setPrevChats, newChat, setNewChat, theme, model,
        user, logout, setSidebarOpen, refreshThreads
    } = useContext(MyContext);

    const [loading, setLoading] = useState(false);     // waiting for the first token
    const [streaming, setStreaming] = useState(false); // a reply is in progress
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState("");
    const [pending, setPending] = useState([]);        // files attached to the message being written
    const [dragging, setDragging] = useState(false);
    const [verifySent, setVerifySent] = useState(false);
    const abortRef = useRef(null);
    const userStoppedRef = useRef(false);
    const profileRef = useRef(null);
    const fileInputRef = useRef(null);

    // ---------- voice input ----------
    const baseTextRef = useRef(""); // text already in the box when the mic was pressed
    const { supported: voiceSupported, listening, error: voiceError, start, stop: stopMic } =
        useSpeechRecognition({
            onTranscript: (text) => setPrompt(`${baseTextRef.current} ${text}`.trim())
        });

    const toggleMic = () => {
        if (listening) {
            stopMic();
        } else {
            baseTextRef.current = prompt;
            start();
        }
    };

    // cancel an in-progress reply when the user opens another chat
    useEffect(() => () => abortRef.current?.abort(), [currThreadId]);

    // close the profile menu when clicking elsewhere
    useEffect(() => {
        if (!isOpen) return;
        const onMouseDown = (e) => {
            if (!profileRef.current?.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, [isOpen]);

    // ---------- attachments ----------
    const startUpload = (file) => {
        const isImage = file.type.startsWith("image/");
        if (file.size > (isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES)) {
            setError(`"${file.name}" is too large (images up to 5 MB, other files up to 10 MB).`);
            return;
        }

        const tempId = `${Date.now()}-${Math.random()}`;
        const previewUrl = isImage ? URL.createObjectURL(file) : null;
        setPending((prev) => [...prev, { tempId, name: file.name, mimeType: file.type, isImage, previewUrl, status: "uploading" }]);

        uploadFile(file)
            .then((attachment) =>
                setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, status: "done", attachment } : p)))
            )
            .catch((err) =>
                setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, status: "error", error: err.message } : p)))
            );
    };

    const addFiles = (fileList) => {
        const files = Array.from(fileList);
        if (!files.length) return;

        setError("");
        const room = MAX_ATTACHMENTS - pending.length;
        if (files.length > room) setError(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
        files.slice(0, Math.max(room, 0)).forEach(startUpload);
    };

    const removePending = (tempId) => {
        setPending((prev) => {
            prev.filter((p) => p.tempId === tempId).forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
            return prev.filter((p) => p.tempId !== tempId);
        });
    };

    const onDragOver = (e) => {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
    };

    const onDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
    };

    // ---------- talk to the AI (streamed) ----------
    // mode: "new" = send a message, "regenerate" = answer the last message again, "edit" = replace the last message's text
    // returns true if the server started answering
    const runChat = async ({ mode, text = "", attachments = [], onFail }) => {
        if (streaming) return false;

        stopMic(); // stop the mic if it's still listening
        setError("");

        const snapshot = prevChats; // what to put back if nothing comes back
        const wasNewChat = newChat;
        const lastUserIdx = snapshot.findLastIndex((m) => m.role === "user");
        const controller = new AbortController();
        abortRef.current = controller;
        userStoppedRef.current = false;
        let gotText = false;

        setStreaming(true);
        setLoading(true);
        setNewChat(false);

        // update the screen right away
        if (mode === "new") {
            setPrevChats([...snapshot, { role: "user", content: text, attachments }]);
        } else if (mode === "regenerate") {
            setPrevChats(snapshot.slice(0, lastUserIdx + 1));
        } else {
            setPrevChats([...snapshot.slice(0, lastUserIdx), { ...snapshot[lastUserIdx], content: text }]);
        }

        try {
            await streamChat({
                threadId: currThreadId,
                message: text,
                model,
                mode,
                attachments: attachments.map((a) => a.id),
                signal: controller.signal,
                onToken: (token) => {
                    setLoading(false);
                    if (!gotText) {
                        // first chunk: create the assistant message
                        gotText = true;
                        setPrevChats((prev) => [...prev, { role: "assistant", content: token }]);
                    } else {
                        // later chunks: append to the last message
                        setPrevChats((prev) => {
                            const copy = prev.slice();
                            const last = copy[copy.length - 1];
                            copy[copy.length - 1] = { ...last, content: last.content + token };
                            return copy;
                        });
                    }
                }
            });
        } catch (err) {
            const aborted = controller.signal.aborted;

            // aborted without the user pressing Stop = they opened another chat; nothing to do
            if (!aborted || userStoppedRef.current) {
                if (!aborted) setError(err.message || "Something went wrong. Please try again.");

                if (!gotText) {
                    // nothing came back: put everything back so the user can retry
                    let saved = false;
                    try {
                        const response = await apiFetch(`/thread/${currThreadId}`);
                        if (response.ok && !controller.signal.aborted) {
                            const messages = await response.json();
                            setPrevChats(messages);
                            setNewChat(false);
                            saved = true;
                        }
                    } catch { /* restore locally if the server cannot be reached */ }
                    if (!saved) {
                        setPrevChats(snapshot);
                        if (wasNewChat) setNewChat(true);
                        onFail?.();
                    }
                }
            }
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
                setLoading(false);
                setStreaming(false);
            }
            refreshThreads(); // show the new/updated chat in the sidebar
        }

        return gotText;
    };

    const sendMessage = async () => {
        const text = prompt.trim();
        if (streaming) return;

        if (pending.some((p) => p.status === "uploading")) {
            setError("Please wait for the files to finish uploading.");
            return;
        }
        if (pending.some((p) => p.status === "error")) {
            setError("Remove the file that failed to upload, then send again.");
            return;
        }

        const sending = pending;
        if (!text && !sending.length) return;

        setPrompt("");
        setPending([]);

        const delivered = await runChat({
            mode: "new",
            text,
            attachments: sending.map((p) => p.attachment),
            onFail: () => { // put the text and files back in the box
                setPrompt(text);
                setPending(sending);
            }
        });

        if (delivered) sending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    };

    const stopStreaming = () => {
        userStoppedRef.current = true;
        abortRef.current?.abort();
    };

    // ---------- verify-email banner ----------
    const resendVerification = async () => {
        try {
            const response = await apiFetch("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email: user.email }) });
            if (!response.ok) throw new Error("Email request failed");
            setVerifySent(true);
        } catch {
            setError("Couldn't send the email. Please try again.");
        }
    };

    const initial = (user?.name || user?.email || "?").trim()[0]?.toUpperCase();
    const canSend = Boolean(prompt.trim() || pending.length);

    return (
        <div className="chatWindow" onDragOver={onDragOver} onDragLeave={(e) => { if (!e.relatedTarget) setDragging(false); }} onDrop={onDrop}>
            {dragging && <div className="dropOverlay"><i className="fa-solid fa-cloud-arrow-up"></i> Drop files to attach</div>}

            <div className="navbar">
                <div className="navLeft">
                    <button className="iconBtn" onClick={() => setSidebarOpen((o) => !o)} aria-label="Toggle sidebar" title="Toggle sidebar">
                        <i className="fa-solid fa-bars"></i>
                    </button>
                    <ModelSelect />
                </div>
                <div className="navRight">
                    <ThemeToggle />
                    <div className="profile" ref={profileRef}>
                        <div className="userIconDiv" onClick={() => setIsOpen(!isOpen)}>
                            <span className="userIcon">{initial}</span>
                        </div>
                        {
                            isOpen &&
                            <div className="dropDown">
                                <div className="dropDownHeader">
                                    <div className="dropName">{user?.name || "Account"}</div>
                                    <div className="dropEmail">{user?.email}</div>
                                </div>
                                <div className="dropDownItem" onClick={logout}><i className="fa-solid fa-arrow-right-from-bracket"></i> Log out</div>
                            </div>
                        }
                    </div>
                </div>
            </div>

            {user && !user.emailVerified && (
                <div className="verifyBanner">
                    <span><i className="fa-solid fa-envelope"></i> Please verify your email address.</span>
                    <button type="button" onClick={resendVerification} disabled={verifySent}>
                        {verifySent ? "Email sent ✓" : "Resend email"}
                    </button>
                </div>
            )}

            <Chat busy={streaming} onRegenerate={() => runChat({ mode: "regenerate" })} onEdit={(text) => runChat({ mode: "edit", text })}></Chat>

            <ScaleLoader color={theme === "dark" ? "#a78bfa" : "#5b3fe0"} loading={loading}>
            </ScaleLoader>
            
            <div className="chatInput">
                {pending.length > 0 && (
                    <div className="pendingFiles">
                        {pending.map((p) => (
                            <div className={`pendingChip ${p.status}`} key={p.tempId} title={p.error || p.name}>
                                {p.isImage && p.previewUrl
                                    ? <img src={p.previewUrl} alt="" />
                                    : <i className={`fa-solid ${fileIconClass(p.mimeType)}`}></i>}
                                <span className="chipName">{p.status === "error" ? p.error : p.name}</span>
                                {p.status === "uploading" && <i className="fa-solid fa-spinner fa-spin chipState"></i>}
                                <button type="button" className="chipRemove" onClick={() => removePending(p.tempId)} aria-label={`Remove ${p.name}`}>
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="inputBox">
                    <input type="file" multiple hidden ref={fileInputRef} accept={ACCEPT_FILES}
                        onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

                    <button type="button" className="attachBtn" onClick={() => fileInputRef.current?.click()}
                        disabled={pending.length >= MAX_ATTACHMENTS} aria-label="Attach files" title="Attach images, PDFs or text files">
                        <i className="fa-solid fa-paperclip"></i>
                    </button>

                    <input placeholder={listening ? "Listening…" : "Ask anything"}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
                        onPaste={(e) => {
                            if (e.clipboardData.files.length) {
                                e.preventDefault();
                                addFiles(e.clipboardData.files);
                            }
                        }}
                    />

                    {voiceSupported && (
                        <button
                            type="button"
                            className={`micBtn ${listening ? "listening" : ""}`}
                            onClick={toggleMic}
                            aria-label={listening ? "Stop voice input" : "Start voice input"}
                            title={listening ? "Stop listening" : "Speak your prompt"}
                        >
                            <i className={`fa-solid ${listening ? "fa-stop" : "fa-microphone"}`}></i>
                        </button>
                    )}

                    {streaming ? (
                        <button type="button" className="sendBtn stopBtn" onClick={stopStreaming} aria-label="Stop generating" title="Stop generating">
                            <i className="fa-solid fa-stop"></i>
                        </button>
                    ) : (
                        <button type="button" className="sendBtn" onClick={sendMessage} disabled={!canSend} aria-label="Send message">
                            <i className="fa-solid fa-paper-plane"></i>
                        </button>
                    )}
                </div>

                {(error || voiceError) && <p className="errorMsg" role="alert">{error || voiceError}</p>}

                <p className="info">
                    NexusGPT can make mistakes. Check important info.
                </p>
            </div>
        </div>
    )
}

export default ChatWindow;
