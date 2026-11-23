# Frontend guidance

This directory contains CivicAI's React + Vite + Tailwind frontend. The PHP API in `../public/api` is the source of truth for accounts, roles, reports, and report IDs. Use same-origin `/api/...` calls through `src/api.ts`; never trust a client role or store report data as a substitute for the API.

Run `corepack pnpm build` here to write static output to `../public/app`, served at `/app/`. Vite proxies `/api` to `http://civicai.test` during development.

Gemini is called only by the PHP backend. Reports automatically request triage after submission and optional photo upload. Real report text and photos may be processed only through a provider whose terms permit the app audience and data use, after LGU/DPO approval. Gemini Developer API terms prohibit apps likely to be accessed by under-18s. The backend requires `AI_PROCESSING_APPROVED=true`; never put API keys in frontend code. AI suggestions are advisory; staff make all final decisions.