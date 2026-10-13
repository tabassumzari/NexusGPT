import "./Chat.css";
import { useContext, useEffect, useRef, useState } from "react";
import { MyContext } from "./MyContext.jsx";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import logo from "./assets/nexus-logo.svg";
import MessageAttachments from "./Attachments.jsx";
import { copyText } from "./utils.js";

// Replaces the plain <pre> that markdown makes for code, adding a header with a Copy button
function CodeBlock({ node, children, ...props }) {
    void node; // react-markdown passes this in; we don't want it on the DOM element
    const preRef = useRef(null);
    const [copied, setCopied] = useState(false);
    const language = /language-([\w-]+)/.exec(children?.props?.className ?? "")?.[1];

    const copy = async () => {
        if (await copyText(preRef.current?.innerText ?? "")) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    };

    return (
        <div className="codeBlock">
            <div className="codeHeader">
                <span>{language ?? "code"}</span>
                <button type="button" className="copyBtn" onClick={copy} aria-label="Copy code">
                    <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`}></i> {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <pre ref={preRef} {...props}>{children}</pre>
        </div>
    );
}

const MARKDOWN_COMPONENTS = { pre: CodeBlock };

function Chat({ busy, onRegenerate, onEdit }) {
    const {newChat, prevChats} = useContext(MyContext);
    const bottomRef = useRef(null);
    const [editingIdx, setEditingIdx] = useState(null);
    const [editText, setEditText] = useState("");
    const [copiedIdx, setCopiedIdx] = useState(null);

    // keep the newest text in view while a reply streams in
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: "end" });
    }, [prevChats]);

    if (newChat) {
        return (
            <div className="emptyState">
                <img src={logo} alt="" className="emptyLogo" />
                <h1>Welcome to NexusGPT</h1>
                <p>Ask anything, attach a file, or tap the mic and speak your prompt.</p>
            </div>
        );
    }

    const lastIdx = prevChats.length - 1;
    const lastUserIdx = prevChats.findLastIndex((m) => m.role === "user");

    const startEdit = (idx) => {
        setEditingIdx(idx);
        setEditText(prevChats[idx].content);
    };

    const saveEdit = () => {
        const attachments = prevChats[editingIdx]?.attachments;
        if (!editText.trim() && !attachments?.length) return;
        setEditingIdx(null);
        onEdit(editText.trim());
    };

    const copyMessage = async (idx) => {
        if (await copyText(prevChats[idx].content)) {
            setCopiedIdx(idx);
            setTimeout(() => setCopiedIdx(null), 1500);
        }
    };

    return (
        <div className="chats">
            {
                prevChats.map((chat, idx) => chat.role === "user" ? (
                    <div className="userDiv" key={idx}>
                        {editingIdx === idx ? (
                            <div className="editBox">
                                <textarea
                                    autoFocus
                                    value={editText}
                                    rows={Math.min(8, Math.max(2, editText.split("\n").length))}
                                    maxLength={8000}
                                    onChange={(e) => setEditText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Escape") setEditingIdx(null);
                                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveEdit();
                                    }}
                                />
                                <div className="editBtns">
                                    <button type="button" className="editCancel" onClick={() => setEditingIdx(null)}>Cancel</button>
                                    <button type="button" className="editSave" onClick={saveEdit}>Save &amp; submit</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {idx === lastUserIdx && !busy && (
                                    <button type="button" className="msgBtn editMsgBtn" onClick={() => startEdit(idx)} aria-label="Edit message" title="Edit message">
                                        <i className="fa-solid fa-pen"></i>
                                    </button>
                                )}
                                <div className="userBubbleCol">
                                    <MessageAttachments attachments={chat.attachments} />
                                    {chat.content && <p className="userMessage">{chat.content}</p>}
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="gptWrap" key={idx}>
                        <div className="gptDiv">
                            <ReactMarkdown rehypePlugins={[rehypeHighlight]} components={MARKDOWN_COMPONENTS}>{chat.content}</ReactMarkdown>
                        </div>
                        <div className={`msgActions ${idx === lastIdx ? "always" : ""}`}>
                            <button type="button" className="msgBtn" onClick={() => copyMessage(idx)} title="Copy reply">
                                <i className={`fa-solid ${copiedIdx === idx ? "fa-check" : "fa-copy"}`}></i> {copiedIdx === idx ? "Copied" : "Copy"}
                            </button>
                            {idx === lastIdx && !busy && (
                                <button type="button" className="msgBtn" onClick={onRegenerate} title="Answer again">
                                    <i className="fa-solid fa-rotate"></i> Regenerate
                                </button>
                            )}
                        </div>
                    </div>
                ))
            }
            {!busy && lastIdx >= 0 && prevChats[lastIdx].role === "user" && (
                <button type="button" className="msgBtn" onClick={onRegenerate}>Retry reply</button>
            )}
            <div ref={bottomRef}></div>
        </div>
    )
}

export default Chat;
