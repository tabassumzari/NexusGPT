# NexusGPT verification — 13 October 2026

23 automated regression checks passed. Frontend production build and ESLint passed.

Checks cover upload decoding and rejection, text truncation, history windowing,
authentication gating, request validation, unavailable-provider errors, saving a
submitted message before a simulated AI failure, and complete/incomplete SSE streams.

The tests stub database methods and simulate AI responses. They do not prove real
MongoDB persistence or live OpenAI/Anthropic compatibility. MongoDB could not start
in the test environment (Operation not permitted). Real AI keys, SMTP delivery,
Docker deployment, voice input, and browser UI behavior remain unverified.

## Start locally

1. Install Node.js 20.19+ (or a supported newer version) and MongoDB.
2. In Backend: npm ci; copy .env.example to .env and fill MONGODB_URI,
   JWT_SECRET, and at least one AI provider key.
3. In Frontend: npm ci. Configure .env if using a nondefault backend URL.
4. Start Backend with npm run dev and Frontend with npm run dev.
5. Open http://localhost:5173.
6. Run Backend npm test; Frontend npm run build and npm run lint.

SMTP is optional in development; verification/reset links print in backend logs.
Only example environment files are packaged. No credentials are included.
