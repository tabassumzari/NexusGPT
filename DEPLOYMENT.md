# Deployment Guide

Three ways to run NexusGPT. Pick the one that matches what you want:

| | Best for | Effort |
| --- | --- | --- |
| **A. Docker Compose (local)** | Trying the full stack on your machine, demos | 5 minutes |
| **B. VPS + Docker + HTTPS** | One cheap server, everything in one place | ~30 minutes |
| **C. Split hosting** | Free tiers: Atlas + a Node host + a static host | ~45 minutes |

## How the pieces fit together

```
Browser ──► frontend container (nginx)
              ├─ serves the React app (static files)
              └─ forwards /api/* ──► backend container (Express) ──► MongoDB
                                              │
                                              └──► OpenAI / Anthropic / your SMTP server
```

Because nginx serves the app **and** forwards `/api`, the browser only ever talks to one address. That means no CORS setup and one HTTPS certificate.

---

## A. Docker Compose (local)

You need [Docker](https://docs.docker.com/get-docker/) with Compose v2.

```bash
# 1. Configure
cp .env.example .env
#    open .env and set JWT_SECRET plus at least one AI key
#    (generate a secret:  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

# 2. Build and start everything (MongoDB + backend + frontend)
docker compose up -d --build

# 3. Open the app
#    http://localhost:3000
```

Verification and reset emails are printed in the backend log until you configure SMTP:

```bash
docker compose logs -f backend
```

Handy commands:

```bash
docker compose ps                 # what is running / healthy
docker compose logs -f backend    # live backend logs
docker compose down               # stop (your data is kept)
docker compose down -v            # stop AND delete the database
docker compose up -d --build      # rebuild after changing code
```

---

## B. VPS with Docker and HTTPS

Works on any small Linux server (1 GB RAM is enough) from any provider.

**1. Point a domain at the server.** Create an `A` record for `chat.yourdomain.com` pointing to the server's IP. Open ports **80** and **443** in the firewall.

**2. Install Docker** on the server (Ubuntu/Debian):

```bash
curl -fsSL https://get.docker.com | sh
```

**3. Get the code and configure it:**

```bash
git clone https://github.com/YOUR_USERNAME/NexusGPT.git
cd NexusGPT
cp .env.example .env
nano .env
```

Set at least:

```ini
JWT_SECRET=<long random string>
OPENAI_API_KEY=...                  # and/or ANTHROPIC_API_KEY
CLIENT_URL=https://chat.yourdomain.com
WEB_PORT=127.0.0.1:3000             # only the server itself can reach the app container
REQUIRE_EMAIL_VERIFICATION=true     # needs working SMTP, see "Email setup" below
SMTP_HOST=...  SMTP_PORT=587  SMTP_USER=...  SMTP_PASS=...  SMTP_FROM="NexusGPT <no-reply@yourdomain.com>"
```

**4. Start it:**

```bash
docker compose up -d --build
```

**5. Add HTTPS with Caddy** (gets and renews free certificates automatically). Install Caddy using the [official instructions](https://caddyserver.com/docs/install), then put this in `/etc/caddy/Caddyfile`:

```
chat.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Open `https://chat.yourdomain.com`. Caddy streams server-sent events correctly out of the box, so AI replies appear word by word.

**Updating later:**

```bash
cd NexusGPT && git pull && docker compose up -d --build
```

**Backups** (MongoDB is not exposed to the internet, but back it up anyway):

```bash
# create a backup
docker compose exec -T mongo mongodump --archive --gzip > backup-$(date +%F).gz
# restore one (replaces current data)
docker compose exec -T mongo mongorestore --archive --gzip --drop < backup-2026-01-01.gz
```

---

## C. Split hosting (free tiers)

Run each part on the platform that suits it.

### 1. Database: MongoDB Atlas

Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas), add a database user, allow your backend's IP in *Network Access*, and copy the connection string. That is your `MONGODB_URI`.

### 2. Backend: any Node host (Render, Railway, Fly.io, a VPS, ...)

| Setting | Value |
| --- | --- |
| Root directory | `Backend` |
| Build command | `npm install` |
| Start command | `npm start` |

Environment variables:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Atlas connection string |
| `JWT_SECRET` | long random string |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | at least one |
| `CLIENT_URL` | your frontend's address, e.g. `https://nexusgpt.example.com` |
| `CLIENT_ORIGIN` | the same address (no trailing slash). Only this site may call the API |
| `TRUST_PROXY` | `1` |
| `REQUIRE_EMAIL_VERIFICATION`, `SMTP_*` | as described in "Email setup" |

Pick a host that keeps connections open for long responses. AI replies are streamed, and platforms that run short-lived serverless functions may cut them off.

### 3. Frontend: any static host (Vercel, Netlify, Cloudflare Pages, ...)

| Setting | Value |
| --- | --- |
| Root directory | `Frontend` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variable | `VITE_API_URL` = `https://YOUR-BACKEND-HOST/api` |

`VITE_API_URL` is baked in **at build time**, so set it before building and rebuild if you change it.

The repo includes `Frontend/public/_redirects` (Netlify, Cloudflare Pages) and `Frontend/vercel.json` (Vercel). They send every address to `index.html`, which the email links (`/verify-email`, `/reset-password`) need. On another host, add the equivalent "single-page app" rewrite.

---

## Email setup

Verification and password-reset emails need an SMTP server. Most email providers offer one (Brevo, Mailgun, Resend, Amazon SES, Gmail with an app password, ...). Create an account, then use the SMTP details they give you:

```ini
SMTP_HOST=smtp.example.com
SMTP_PORT=587                # 465 for implicit TLS
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="NexusGPT <no-reply@yourdomain.com>"
CLIENT_URL=https://chat.yourdomain.com    # the links in the emails are built from this
REQUIRE_EMAIL_VERIFICATION=true
```

Then sign up with a real address and check that the email arrives (look in spam too). For good delivery, send from a domain you own and set up the SPF/DKIM records your provider asks for.

> With `REQUIRE_EMAIL_VERIFICATION=true`, people cannot log in until they verify. Test email delivery **before** turning it on, or you can lock yourself out. (The "Forgot password" flow also verifies the address.)

---

## Production checklist

- [ ] `JWT_SECRET` is long, random and kept secret
- [ ] The site is served over **HTTPS**
- [ ] `CLIENT_URL` and (for split hosting) `CLIENT_ORIGIN` match your real address
- [ ] SMTP works and `REQUIRE_EMAIL_VERIFICATION=true`
- [ ] MongoDB is not reachable from the internet (the compose file publishes no database port)
- [ ] `.env` files are not committed to git
- [ ] You have a backup routine for MongoDB
- [ ] You set a spending limit on your OpenAI / Anthropic accounts (anyone who can sign up can use your API key)

---

## Troubleshooting

| Problem | Likely cause and fix |
| --- | --- |
| `docker compose up` says *Please set JWT_SECRET* | Fill in `JWT_SECRET` in `.env`. |
| Replies show up all at once instead of word by word | A proxy in front is buffering. For nginx use `proxy_buffering off;` (already in this repo's config). For other proxies/CDNs, disable response buffering for `/api`. |
| Browser shows a CORS error (split hosting) | `CLIENT_ORIGIN` must exactly match the frontend address, with `https://` and no trailing slash. |
| "Can't reach the server" in the app | `VITE_API_URL` is wrong or the backend is down. Fix the variable and **rebuild** the frontend. |
| Links in emails point to `localhost` | `CLIENT_URL` is not set to your real address. |
| Emails never arrive | Check `docker compose logs backend` for SMTP errors, then your spam folder, then SPF/DKIM. |
| "Too many attempts" (429) | Login/email rate limits. Wait 15 minutes, or adjust `AUTH_RATE_LIMIT` / `EMAIL_RATE_LIMIT`. |
| Uploads fail with 413 | A proxy is limiting body size. nginx here allows 12 MB; raise it in your proxy if you changed limits. |
| *port is already allocated* | Something uses port 3000. Set `WEB_PORT=8081` (or another) in `.env`. |
| Everyone got logged out | `JWT_SECRET` changed, or someone reset their password (that logs out all of that user's devices). |
