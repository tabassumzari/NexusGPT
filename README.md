<div align="center">

# NexusGPT

**A full-stack AI chat assistant built with the MERN stack: streaming replies, multiple AI providers, file and image attachments, accounts with email verification, and a polished light/dark UI.**

**Developer:** [Tabassum Zari](https://github.com/tabassumzari)

![Node](https://img.shields.io/badge/Node.js-20.19%2B-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)

<!-- Add screenshots to a /docs folder and uncomment: -->
<!-- ![NexusGPT dark mode](docs/screenshot-dark.png) -->
<!-- ![NexusGPT light mode](docs/screenshot-light.png) -->

</div>

---

## Features

**Chat**
- **Streaming responses** – replies appear token by token over Server-Sent Events. A **Stop** button cancels the upstream request and keeps the partial answer.
- **Regenerate and edit** – answer the last message again (optionally with a different model), or edit your last message and get a fresh reply.
- **Image and file attachments** – attach images (PNG, JPG, GIF, WebP) for vision-capable models, and PDFs or text/code files whose contents are given to the model. Use the paperclip, drag and drop, or paste.
- **Markdown with code blocks** – syntax highlighting and a one-click **Copy** button on every code block and reply.
- **Persistent history** – conversations live in MongoDB; the last 20 messages are sent as context. Search chats by title or content, and rename them inline.

**Models**
- **Multiple AI providers** – OpenAI and Anthropic (Claude) out of the box. A model only appears in the dropdown if its provider's API key is configured. Adding a provider is one small file.

**Accounts and security**
- **Sign up / log in** with bcrypt-hashed passwords and JWT sessions. Every chat and file is private to its owner.
- **Email verification** (optional or required) and **password reset** by email. Tokens are stored only as hashes, are single-use and expire; a password reset signs out all of the user's devices.
- Rate-limited login and email endpoints; uploaded files are validated by their real content, not the file name.

**Experience**
- **Light & dark mode** that follows your OS and remembers your choice.
- **Responsive layout** with a collapsible sidebar that becomes a drawer on phones.
- **Voice input** using the Web Speech API.
- **Themeable design** – the whole palette is CSS variables in `Frontend/src/index.css`.

**Deployment**
- **Docker Compose** setup (MongoDB + API + nginx frontend) and a [deployment guide](DEPLOYMENT.md) for a VPS with HTTPS or split free-tier hosting.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 7, React Context, `react-markdown`, `rehype-highlight`, `react-spinners`, Font Awesome |
| Backend | Node.js, Express 5, Mongoose 8, `jsonwebtoken`, `bcryptjs`, `multer`, `nodemailer`, `unpdf`, `express-rate-limit` |
| Database | MongoDB (local, Docker, or Atlas) |
| AI | OpenAI SDK, Anthropic SDK |
| Deployment | Docker, Docker Compose, nginx |
| Browser APIs | Fetch streaming (SSE), Web Speech API, Clipboard API, drag and drop |

## Project Structure

```
NexusGPT/
├── docker-compose.yml          # MongoDB + backend + frontend
├── .env.example                # settings for docker-compose
├── DEPLOYMENT.md
├── Backend/
│   ├── config/models.js        # selectable models (single source of truth)
│   ├── providers/              # one file per AI provider + registry
│   ├── middleware/auth.js      # JWT check (also catches deleted users / reset sessions)
│   ├── models/                 # User, Thread, Attachment
│   ├── routes/                 # auth.js, chat.js, uploads.js
│   ├── utils/                  # mailer, attachment validation, history builder
│   ├── server.js
│   ├── Dockerfile
│   └── .env.example
└── Frontend/
    ├── src/
    │   ├── App.jsx             # global state, auth gate, email-link pages
    │   ├── api.js              # fetch helper, SSE reader, uploads
    │   ├── AuthPage.jsx        # login, signup, forgot password
    │   ├── EmailPages.jsx      # /verify-email and /reset-password
    │   ├── Sidebar.jsx         # history, search, rename, delete
    │   ├── ChatWindow.jsx      # input, attachments, voice, streaming, regenerate/edit
    │   ├── Chat.jsx            # messages, code blocks, message actions
    │   ├── Attachments.jsx     # image/file display on messages
    │   ├── ModelSelect.jsx, ThemeToggle.jsx, useSpeechRecognition.js
    │   └── index.css           # design tokens (colors for both themes)
    ├── Dockerfile, nginx.conf.template
    └── .env.example
```

## Quick Start with Docker

```bash
cp .env.example .env     # set JWT_SECRET and at least one AI key
docker compose up -d --build
```

Open <http://localhost:3000>. See [DEPLOYMENT.md](DEPLOYMENT.md) for production setups.

## Installation (without Docker)

Prerequisites: **Node.js 20.19+**, **MongoDB** (local or [Atlas](https://www.mongodb.com/atlas)), and at least one AI key ([OpenAI](https://platform.openai.com/api-keys) and/or [Anthropic](https://console.anthropic.com/)).

```bash
git clone https://github.com/tabassumzari/NexusGPT.git
cd NexusGPT

cd Backend && npm install
cd ../Frontend && npm install
```

### Environment variables

**Backend** – copy `Backend/.env.example` to `Backend/.env`:

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | Long random string for signing login tokens (the server won't start without it) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | one of them | Enables that provider's models |
| `PORT` | no | API port (default `8080`) |
| `CLIENT_URL` | for email | Where the frontend runs; used to build links in emails (default `http://localhost:5173`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | for real email | Leave `SMTP_HOST` empty in development and emails are printed in the backend terminal |
| `REQUIRE_EMAIL_VERIFICATION` | no | `true` = users must verify their email before logging in (default `false`) |
| `CLIENT_ORIGIN` | no | Only allow this website to call the API (comma-separated) |
| `TRUST_PROXY` | no | Set `1` behind a reverse proxy |
| `AUTH_RATE_LIMIT`, `EMAIL_RATE_LIMIT` | no | Attempts per IP per 15 min (defaults 30 and 5) |

Generate a `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Frontend** (optional) – copy `Frontend/.env.example` to `Frontend/.env`:

| Variable | Description | Default |
| --- | --- | --- |
| `VITE_API_URL` | Base URL of the backend API | `http://localhost:8080/api` |

> ⚠️ Never commit `.env` files. They are already in `.gitignore`.

## Usage

```bash
# Terminal 1 – API (auto-restarts on changes)
cd Backend && npm run dev

# Terminal 2 – web app
cd Frontend && npm run dev
```

Open <http://localhost:5173> and create an account. In development the verification email appears in the **backend terminal**; open the link it prints.

1. Type a message and press **Enter**. Click the square **Stop** button to cut a reply short.
2. Attach files with the 📎 button, by dragging them in, or by pasting an image.
3. Hover your last message to **edit** it; use **Regenerate** under the last reply for another answer.
4. Pick a model from the dropdown, search or rename chats in the sidebar, toggle light/dark mode.
5. Click the **microphone** to dictate a prompt.

### Attachment rules

- Up to 4 files per message. Images up to 5 MB; PDFs and text/code files up to 10 MB.
- PDFs need selectable text (scanned PDFs aren't supported). Long documents are trimmed to about 60,000 characters.
- Images need a vision-capable model (flagged in `Backend/config/models.js`).

### Voice input notes

- Works in Chrome, Edge and Safari; the mic button is hidden in Firefox.
- Requires `localhost` or HTTPS, and microphone permission.
- In Chrome the audio is processed by the browser vendor's speech service.

## API Reference

All routes except signup, login and the email-link routes need `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check (no login) |
| `POST` | `/api/auth/signup` | `{ name, email, password }` → `{ token, user }` (or `{ needsVerification }` when verification is required) |
| `POST` | `/api/auth/login` | `{ email, password }` → `{ token, user }`; `403 EMAIL_NOT_VERIFIED` if verification is required |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/verify-email` | `{ token }` from the emailed link |
| `POST` | `/api/auth/resend-verification` | `{ email }` (always answers `ok`) |
| `POST` | `/api/auth/forgot-password` | `{ email }` (always answers `ok`) |
| `POST` | `/api/auth/reset-password` | `{ token, password }`; signs out all existing sessions |
| `GET` | `/api/models` | Models whose provider key is configured |
| `GET` | `/api/thread?q=` | Your threads, newest first; `q` searches titles and message text |
| `GET` | `/api/thread/:threadId` | Messages in a thread |
| `PATCH` | `/api/thread/:threadId` | Rename: `{ title }` |
| `DELETE` | `/api/thread/:threadId` | Delete a thread and its files |
| `POST` | `/api/uploads` | `multipart/form-data` field `file` → `{ id, name, kind, mimeType, size }` |
| `GET` | `/api/attachments/:id` | An uploaded image (owner only) |
| `POST` | `/api/chat` | `{ threadId, message, model, mode, attachments }` → **SSE stream** of `{type:"token",text}`, ending with `{type:"done"}` or `{type:"error",message}`. `mode` is `new` (default), `regenerate` or `edit` |

## Customization

**Add a model** – add a line to `Backend/config/models.js` (set `vision: true` if it accepts images). Check current model IDs in the [OpenAI](https://platform.openai.com/docs/models) and [Anthropic](https://docs.claude.com/en/docs/about-claude/models) docs.

**Add a provider** – create `Backend/providers/<name>.js` exporting `isConfigured()` and an async generator `streamCompletion({ model, messages, signal })` that yields text chunks (copy `providers/openai.js`, which also shows how to convert image parts), register it in `providers/index.js`, then use its name as `provider` in `config/models.js`.

**Change the look** – edit the color variables in `Frontend/src/index.css`. Dark and light themes each have their own block.

## Security Notes

- Passwords: bcrypt. Email and reset tokens: random, hashed at rest, single-use, expiring. Password reset invalidates existing sessions.
- Every query is scoped to the logged-in user. Uploads are validated by content (SVG is refused), size-limited, and images are served only to their owner with `nosniff`.
- The JWT is kept in `localStorage` for simplicity; for a hardened setup consider httpOnly cookies.
- Before going public: serve over HTTPS, set `REQUIRE_EMAIL_VERIFICATION=true` with working SMTP, restrict `CLIENT_ORIGIN`, and set a spending limit on your AI accounts. See the checklist in [DEPLOYMENT.md](DEPLOYMENT.md).

## Roadmap

- [x] Automated regression checks (`cd Backend && npm test`)
- [ ] CI
- [ ] Export or share a conversation
- [ ] Sign in with Google / GitHub
- [ ] Word / PowerPoint attachments and OCR for scanned PDFs
- [ ] Per-user usage limits

## Acknowledgements

This project started from a MERN chat application and was extended with additional features, configuration, and regression tests.

## License

Licensed under the [MIT License](LICENSE).

## Verified fixes and tests

Run `npm ci` in Backend and Frontend. Run `npm test` in Backend, and
`npm run build` plus `npm run lint` in Frontend.

This revision validates images by decoding them, detects incomplete AI streams,
saves user messages before requesting AI replies, and provides a Retry reply button.
See TEST_RESULTS.md for verification scope and remaining setup requirements.

## Project Status

The application runs locally with MongoDB connectivity.
Live AI responses require a funded OpenAI or Anthropic API account.
The project includes 23 passing regression checks using simulated database operations and AI responses.
