import { useCallback, useEffect, useRef, useState } from "react";

// Chrome/Edge/Safari expose the Web Speech API (Safari & older Chrome use the webkit prefix).
// Firefox does not support it, so `supported` lets the UI hide the mic button.
const SpeechRecognition =
    typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : undefined;

export default function useSpeechRecognition({ onTranscript }) {
    const recognitionRef = useRef(null);
    const [listening, setListening] = useState(false);
    const [error, setError] = useState("");
    const supported = Boolean(SpeechRecognition);

    const stop = useCallback(() => {
        recognitionRef.current?.stop();
    }, []);

    const start = useCallback(() => {
        if (!SpeechRecognition || recognitionRef.current) return;

        setError("");
        const recognition = new SpeechRecognition();
        recognition.lang = navigator.language || "en-US";
        recognition.interimResults = true; // show words while the user is still talking
        recognition.continuous = false;    // stop automatically after a pause

        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map((result) => result[0].transcript)
                .join("");
            onTranscript(transcript);
        };

        recognition.onerror = (event) => {
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                setError("Microphone access is blocked. Allow it in your browser's site settings.");
            } else if (event.error === "no-speech") {
                setError("I didn't hear anything. Try again.");
            } else if (event.error !== "aborted") {
                setError(`Voice input error: ${event.error}`);
            }
        };

        recognition.onend = () => {
            recognitionRef.current = null;
            setListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        setListening(true);
    }, [onTranscript]);

    // stop the mic if the component unmounts
    useEffect(() => () => recognitionRef.current?.abort(), []);

    return { supported, listening, error, start, stop };
}
