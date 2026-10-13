import "./ModelSelect.css";
import { useContext, useEffect, useRef, useState } from "react";
import { MyContext } from "./MyContext.jsx";

function ModelSelect() {
    const { model, setModel, models } = useContext(MyContext);
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef(null);

    const current = models.find((m) => m.id === model) ?? models[0];
    const PROVIDER_LABEL = { openai: "OpenAI", anthropic: "Anthropic" };

    // close on outside click or Escape
    useEffect(() => {
        if (!open) return;

        const onMouseDown = (e) => {
            if (!wrapperRef.current?.contains(e.target)) setOpen(false);
        };
        const onKeyDown = (e) => {
            if (e.key === "Escape") setOpen(false);
        };

        document.addEventListener("mousedown", onMouseDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const choose = (id) => {
        setModel(id);
        setOpen(false);
    };

    if (!current) {
        return <div className="modelSelect"><span className="modelTrigger">No models</span></div>;
    }

    return (
        <div className="modelSelect" ref={wrapperRef}>
            <button
                type="button"
                className="modelTrigger"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
            >
                <span>{current.label}</span>
                <i className={`fa-solid fa-chevron-down ${open ? "flipped" : ""}`}></i>
            </button>

            {open && (
                <ul className="modelMenu" role="listbox">
                    {models.map((m) => (
                        <li
                            key={m.id}
                            role="option"
                            aria-selected={m.id === current.id}
                            className={m.id === current.id ? "selected" : ""}
                            onClick={() => choose(m.id)}
                        >
                            <div>
                                <div className="modelName">{m.label}</div>
                                <div className="modelDesc">{m.desc} · {PROVIDER_LABEL[m.provider] ?? m.provider}</div>
                            </div>
                            {m.id === current.id && <i className="fa-solid fa-check"></i>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default ModelSelect;
