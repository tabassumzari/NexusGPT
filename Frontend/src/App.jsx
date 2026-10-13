import './App.css';
import Sidebar from "./Sidebar.jsx";
import ChatWindow from "./ChatWindow.jsx";
import AuthPage from "./AuthPage.jsx";
import { VerifyEmailPage, ResetPasswordPage } from "./EmailPages.jsx";
import {MyContext} from "./MyContext.jsx";
import { useState, useEffect, useCallback } from 'react';
import {v1 as uuidv1} from "uuid";
import { apiFetch, clearImageCache, getToken, setToken as saveToken, setUnauthorizedHandler } from "./api.js";

// read the theme saved by the <script> in index.html (or fall back to dark)
const getInitialTheme = () =>
  document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";

const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

function App() {
  const [prompt, setPrompt] = useState("");
  const [currThreadId, setCurrThreadId] = useState(uuidv1());
  const [prevChats, setPrevChats] = useState([]); //stores all chats of curr threads
  const [newChat, setNewChat] = useState(true);
  const [allThreads, setAllThreads] = useState([]);
  const [threadsVersion, setThreadsVersion] = useState(0); // bump to re-fetch the sidebar list
  const [theme, setTheme] = useState(getInitialTheme);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(() => localStorage.getItem("nexus-model") || "");
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile());

  // ---- auth ----
  const [token, setTokenState] = useState(getToken);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [attempt, setAttempt] = useState(0);

  const logout = useCallback(() => {
    saveToken(null);
    clearImageCache();
    setTokenState(null);
    setUser(null);
    setModels([]);
    setAllThreads([]);
    setPrevChats([]);
    setPrompt("");
    setNewChat(true);
    setCurrThreadId(uuidv1());
  }, []);

  const handleAuthSuccess = ({ token, user }) => {
    saveToken(token);
    setTokenState(token);
    setUser(user);
    setAuthError("");
  };

  // any 401 from the API (expired/invalid token) logs the user out
  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);

  // on page load: check the saved token is still valid
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    apiFetch("/auth/me")
      .then(async (res) => {
        if (!res.ok) throw new Error("auth");
        const data = await res.json();
        if (!cancelled) { setUser(data.user); setAuthError(""); }
      })
      .catch((err) => {
        // a 401 already triggered logout(); anything else means the server is unreachable
        if (!cancelled && err.message !== "auth") setAuthError("Can't reach the server. Is the backend running?");
      });

    return () => { cancelled = true; };
  }, [token, attempt]);

  // load the models the server has keys for
  useEffect(() => {
    if (!user) return;
    apiFetch("/models")
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        setModels(list);
        setModel((current) => (list.some((m) => m.id === current) ? current : list[0]?.id ?? ""));
      })
      .catch(() => {});
  }, [user]);

  // apply + remember the theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("nexus-theme", theme);
  }, [theme]);

  // remember the selected model
  useEffect(() => {
    if (model) localStorage.setItem("nexus-model", model);
  }, [model]);

  const providerValues = {
    prompt, setPrompt,
    currThreadId, setCurrThreadId,
    newChat, setNewChat,
    prevChats, setPrevChats,
    allThreads, setAllThreads,
    threadsVersion, refreshThreads: () => setThreadsVersion((v) => v + 1),
    theme, setTheme,
    models, model, setModel,
    sidebarOpen, setSidebarOpen,
    closeSidebarOnMobile: () => { if (isMobile()) setSidebarOpen(false); },
    user, logout, handleAuthSuccess
  }; 

  // pages opened from links in emails (this app has no router, so we check the address)
  const path = window.location.pathname;

  let content;
  if (path === "/verify-email") {
    content = <VerifyEmailPage />;
  } else if (path === "/reset-password") {
    content = <ResetPasswordPage />;
  } else if (!token) {
    content = <AuthPage />;
  } else if (!user) {
    content = (
      <div className="splash">
        {authError ? (
          <>
            <p>{authError}</p>
            <button className="splashBtn" onClick={() => { setAuthError(""); setAttempt((a) => a + 1); }}>Retry</button>
            <button className="splashBtn secondary" onClick={logout}>Log out</button>
          </>
        ) : (
          <p>Loading…</p>
        )}
      </div>
    );
  } else {
    content = (
      <>
        <Sidebar></Sidebar>
        {sidebarOpen && <div className="backdrop" onClick={() => setSidebarOpen(false)}></div>}
        <ChatWindow></ChatWindow>
      </>
    );
  }

  return (
    <div className='app'>
      <MyContext.Provider value={providerValues}>
        {content}
      </MyContext.Provider>
    </div>
  )
}

export default App
