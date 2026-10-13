import { useEffect, useState } from "react";
import { getImageUrl } from "./api.js";
import { fileIconClass } from "./utils.js";

// shows an uploaded image (fetched with the login token)
function AuthImage({ id, alt }) {
    const [url, setUrl] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        getImageUrl(id)
            .then((u) => alive && setUrl(u))
            .catch(() => alive && setFailed(true));
        return () => { alive = false; };
    }, [id]);

    if (failed) return <div className="imgPlaceholder" title={alt}><i className="fa-regular fa-image"></i></div>;
    if (!url) return <div className="imgPlaceholder"></div>;

    return (
        <a href={url} target="_blank" rel="noreferrer" title="Open image">
            <img src={url} alt={alt} className="msgImage" />
        </a>
    );
}

// the images / file chips shown on a sent message
function MessageAttachments({ attachments }) {
    if (!attachments?.length) return null;

    return (
        <div className="msgAttachments">
            {attachments.map((a) =>
                a.kind === "image" ? (
                    <AuthImage key={a.id} id={a.id} alt={a.name} />
                ) : (
                    <div className="fileChip" key={a.id} title={a.name}>
                        <i className={`fa-solid ${fileIconClass(a.mimeType)}`}></i>
                        <span>{a.name}</span>
                    </div>
                )
            )}
        </div>
    );
}

export default MessageAttachments;
