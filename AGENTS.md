<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

This repo is a single, self-contained Next.js 16 app (`eclipse-poster-generator`). There is no backend, database, worker, or external service, and no environment variables are required to run or test it — all eclipse/geo data is bundled JSON and astronomy is computed in-app. Package manager is npm (see `package-lock.json`); dependencies are installed by the startup update script, so you normally don't need to reinstall.

Commands (defined in `package.json`):
- Dev server: `npm run dev` → Next.js dev on http://localhost:3000. This is the only service to run; test the product entirely in the browser at `/` (the Generator UI).
- Build: `npm run build` (works cleanly).
- Lint: `npm run lint`.

Non-obvious notes:
- `npm run lint` currently exits non-zero due to two pre-existing errors in committed code (`docker-entrypoint.js` `require()` import, and a `setState` in `useEffect` in `src/app/PosterStudio.tsx`). These are not caused by environment setup — don't treat a failing lint on a clean checkout as a broken environment.
- The `/poster/raw` route exists for an external screenshot/"imager" service used only in production (Fly.io); it is not needed for local dev.
