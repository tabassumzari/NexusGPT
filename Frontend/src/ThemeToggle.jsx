import "./ThemeToggle.css";
import { useContext } from "react";
import { MyContext } from "./MyContext.jsx";

function ThemeToggle() {
    const { theme, setTheme } = useContext(MyContext);
    const isDark = theme === "dark";

    return (
        <button
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label="Dark mode"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className={`themeToggle ${isDark ? "dark" : "light"}`}
            onClick={() => setTheme(isDark ? "light" : "dark")}
        >
            <i className="fa-solid fa-sun"></i>
            <i className="fa-solid fa-moon"></i>
            <span className="thumb"></span>
        </button>
    );
}

export default ThemeToggle;
