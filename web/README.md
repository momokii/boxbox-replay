# web/ — BoxBox Replay frontend

React + TypeScript + Vite SPA: full-field canvas replay, timing tower, battle /
performance / pit panels, on-trigger coach. Talks to the API only via
`src/api.ts` (same-origin `/api`, proxied to the API service in Docker, to
`localhost:8000` in `npm run dev`). See the root README for the full picture.

```bash
npm install
npm test        # vitest
npm run build   # tsc + vite (also type-checks)
npm run dev     # local dev, proxied /api
```
