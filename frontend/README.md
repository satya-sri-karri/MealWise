# MealWise frontend

React + TypeScript + Vite, with plain CSS. Implements Dashboard, Plan a Meal,
Record Results, and History & Insights against `../docs/API_CONTRACT.md` v1.
All implementation changes are confined to `frontend/`.

## Install and run

Use Node.js 22.12+ (Node 24 also works) and npm. From the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open the URL printed by Vite (normally http://127.0.0.1:5173).
Start the backend separately following `backend/README.md` once the backend is
available. Relative `/api` requests proxy to http://127.0.0.1:8000.
There is no silent fallback: a disconnected backend displays a retryable error.

## Preview while the backend is being built

Create `frontend/.env.local` containing:

```dotenv
VITE_USE_MOCKS=true
```

Restart `npm run dev`. The visible **Fixture mode · fictional demo data** banner
identifies this browser-only demonstration. Sample history is seeded on first use.
Plans and results persist in this browser's localStorage; they are not shared with
the backend or your teammate. This adapter is for UI development, not an alternative
backend or evidence of calculation correctness. The backend remains authoritative
for exact decimal arithmetic and server-side validation.

To reset fixtures, run this in the browser console and reload:

```js
localStorage.removeItem("mealwise-fixtures-v1");
```

To integrate with Swetha's backend, set `VITE_USE_MOCKS=false` (or remove `.env.local`)
and restart Vite. Do not use fixture mode for the final integrated demo.

## Build and preview

```bash
npm run build
npm run preview
```

`build` checks strict TypeScript and creates `dist/`. The preview server also proxies
`/api` to port 8000. Fixture mode is decided at build time: build with the flag false
for a real API build. A static host alone cannot run the Python backend; production
hosting would need an API reverse proxy and appropriate access controls.

## Browser checks

```bash
npx playwright install chromium
npm run test:e2e
```

Tests start isolated fixture and real-mode development servers on ports 5173/5174.
Keep those ports free; use `CI=1` to disallow reusing existing servers. The suite runs
on desktop and Pixel 7 viewport configurations. It covers the complete fixture
workflow, corrections and reload persistence, stale-preview invalidation, duplicate
saves, waste validation, zero-demand/future-date handling, viewport overflow,
keyboard navigation, and real-mode network failures without fallback.

For environments providing their own Chromium, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable path.

## Important behavior

- Dashboard values come from the API; no invented savings or reduction percentages.
- Forecast generation sends the exact contract request; saving sends only forecast_id.
- Editing planning inputs invalidates the preview. Navigation keeps in-progress forms mounted.
- A failed save preserves entries. Validation errors include the server's field messages.
- One selected plan remains selected after results refresh; correcting results uses PUT.
- Results use cooked kg; planning uses raw kg. Measurement method is explicit per dish.
- Zero-denominator metrics display “Not available”. Dates use Asia/Kolkata.
- Error comparisons use the original baseline and display shortages separately.
- Empty, loading, disconnected, demo and estimated-measurement states are labeled.
- Form labels, native controls, focus outlines, skip link and reduced-motion support
  are included. The mobile navigation fits on one row.

## Files

- `src/types.ts`: shared API shapes.
- `src/api.ts`: typed relative-URL client, timeouts and error envelope handling.
- `src/pages/`: the four screens.
- `src/components.tsx`: reusable forecast, error, empty and metric views.
- `src/fixtures.ts`: explicitly enabled, dynamically imported local demo adapter.
- `src/styles.css`: responsive design without a component/UI dependency.
- `tests/workflow.spec.ts`: browser workflow checks.

## Integration handoff

Use the same API contract commit on both branches. Verify real health, recipes,
forecast, save-plan, result PUT, plans and insights endpoints after merging the
backend. Then check a known 180 → 150 → 158 forecast, corrections, server validation,
and persistence after restarting the backend. Browser fixture checks do not prove
backend/database persistence or end-to-end integration with FastAPI.
