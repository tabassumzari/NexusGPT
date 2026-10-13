import "./Sidebar.css";
import { useContext, useEffect, useRef, useState } from "react";
import { MyContext } from "./MyContext.jsx";
import {v1 as uuidv1} from "uuid";
import logo from "./assets/nexus-logo.svg";
import { apiFetch } from "./api.js";

function Sidebar() {
    const {
        allThreads, setAllThreads, currThreadId, setNewChat, setPrompt, setPrevChats, setCurrThreadId,
        threadsVersion, sidebarOpen, setSidebarOpen, closeSidebarOnMobile
    } = useContext(MyContext);

    const [search, setSearch] = useState("");
    const [loaded, setLoaded] = useState(false); // so "No chats yet" doesn't flash before the first fetch
    const [editingId, setEditingId] = useState(null);
    const [editValue, setEditValue] = useState("");
    const cancelRename = useRef(false);

    // load the thread list (re-runs on new chat, after a message, and when searching)
    useEffect(() => {
        let cancelled = false;
        const q = search.trim();

        const timer = setTimeout(async () => {
            try {
                const response = await apiFetch(`/thread${q ? `?q=${encodeURIComponent(q)}` : ""}`);
                if (!response.ok) return;
                const res = await response.json();
                if (!cancelled) {
                    setAllThreads(res);
                    setLoaded(true);
                }
            } catch(err) {
                console.log(err);
            }
        }, q ? 300 : 0); // wait a little while the user is typing

        return () => { cancelled = true; clearTimeout(timer); };
    }, [currThreadId, threadsVersion, search, setAllThreads]);

    const createNewChat = () => {
        setNewChat(true);
        setPrompt("");
        setPrevChats([]);
        setCurrThreadId(uuidv1());
        closeSidebarOnMobile();
    }

    const changeThread = async (newThreadId) => {
        if (editingId) return;
        setCurrThreadId(newThreadId);
        closeSidebarOnMobile();

        try {
            const response = await apiFetch(`/thread/${newThreadId}`);
            if (!response.ok) return;
            const res = await response.json();
            setPrevChats(res);
            setNewChat(false);
            setPrompt("");
        } catch(err) {
            console.log(err);
        }
    }

    const deleteThread = async (threadId) => {
        try {
            const response = await apiFetch(`/thread/${threadId}`, {method: "DELETE"});
            if (!response.ok) return;

            //updated threads re-render
            setAllThreads(prev => prev.filter(thread => thread.threadId !== threadId));

            if(threadId === currThreadId) {
                createNewChat();
            }
        } catch(err) {
            console.log(err);
        }
    }

    // ---- rename ----
    const startRename = (thread) => {
        cancelRename.current = false;
        setEditingId(thread.threadId);
        setEditValue(thread.title);
    };

    const submitRename = async () => {
        const id = editingId;
        const title = editValue.trim();
        const current = allThreads.find((t) => t.threadId === id);
        setEditingId(null);

        if (cancelRename.current || !id || !title || title === current?.title) return;

        try {
            const response = await apiFetch(`/thread/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });
            if (response.ok) {
                setAllThreads((prev) => prev.map((t) => (t.threadId === id ? { ...t, title } : t)));
            }
        } catch (err) {
            console.log(err);
        }
    };

    const onRenameKeyDown = (e) => {
        if (e.key === "Enter") {
            e.currentTarget.blur(); // blur triggers submitRename
        } else if (e.key === "Escape") {
            cancelRename.current = true;
            e.currentTarget.blur();
        }
    };

    return (
        <section className={`sidebar ${sidebarOpen ? "" : "closed"}`} inert={!sidebarOpen}>
            <div className="sidebarTop">
                <div className="brandRow">
                    <img src={logo} alt="NexusGPT logo" className="logo" />
                    <span className="brandName">NexusGPT</span>
                    <button className="collapseBtn" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" title="Close sidebar">
                        <i className="fa-solid fa-angles-left"></i>
                    </button>
                </div>

                <button className="newChatBtn" onClick={createNewChat}>
                    <span><i className="fa-solid fa-plus"></i> New chat</span>
                    <i className="fa-solid fa-pen-to-square"></i>
                </button>

                <div className="searchBox">
                    <i className="fa-solid fa-magnifying-glass"></i>
                    <input
                        type="text"
                        placeholder="Search chats"
                        aria-label="Search chats"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="clearSearch" onClick={() => setSearch("")} aria-label="Clear search">
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    )}
                </div>

                <p className="historyLabel">{search.trim() ? "Search results" : "Recent chats"}</p>
            </div>

            <ul className="history">
                {
                    allThreads?.map((thread) => (
                        <li key={thread.threadId}
                            title={thread.title}
                            onClick={() => changeThread(thread.threadId)}
                            className={thread.threadId === currThreadId ? "highlighted" : ""}
                        >
                            {editingId === thread.threadId ? (
                                <input
                                    className="renameInput"
                                    autoFocus
                                    maxLength={80}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={onRenameKeyDown}
                                    onBlur={submitRename}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <>
                                    <span className="threadTitle" onDoubleClick={() => startRename(thread)}>{thread.title}</span>
                                    <span className="threadActions">
                                        <i className="fa-solid fa-pen" title="Rename"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                startRename(thread);
                                            }}
                                        ></i>
                                        <i className="fa-solid fa-trash" title="Delete"
                                            onClick={(e) => {
                                                e.stopPropagation(); //stop event bubbling
                                                deleteThread(thread.threadId);
                                            }}
                                        ></i>
                                    </span>
                                </>
                            )}
                        </li>
                    ))
                }
                {loaded && allThreads?.length === 0 && (
                    <li className="emptyHistory">{search.trim() ? "No chats found" : "No chats yet"}</li>
                )}
            </ul>

            <div className="sign">
                <p>Built with &hearts; by TABASSUM ZARI</p>
            </div>
        </section>
    )
}

export default Sidebar;
