# MealWise

Hostel meal planning and cooked-food waste tracking.

**Status:** Frontend and backend implemented with the kitchen workflow upgrade.
This one-day prototype uses fictional demo data and a transparent historical baseline.
It does not yet demonstrate verified waste reduction.

## Read these first

1. [Project brief and one-day checklist](docs/PROJECT_BRIEF.md)
2. [Shared API contract v1](docs/API_CONTRACT.md)
3. [Kitchen workflow v2 extensions](docs/KITCHEN_WORKFLOW_V2.md)

Both coding assistants must use the same committed specification. Propose API changes
before implementation; never silently rename fields or change response structures.

## Team ownership

| Owner | Files | Branch | Responsibility |
| --- | --- | --- | --- |
| Satya Sri | `frontend/` | `feat/frontend` | React interface, integration, demo |
| Swetha Sri | `backend/` | `feat/backend` | API, persistence, calculations, tests |
| Both, coordinated by Satya Sri | `docs/`, root files | Agreed change | Shared specification |

Stack: React + Vite + TypeScript + plain CSS; Python + FastAPI + SQLModel + SQLite.
Expected folders: `frontend/`, `backend/`, `docs/`.
Each application folder includes setup and verification instructions.

## Start on both computers

Clone after this specification is committed:

```bash
git clone https://github.com/satya-sri-karri/MealWise.git
cd MealWise
```

Satya Sri creates her branch:

```bash
git switch -c feat/frontend
```

The teammate creates hers:

```bash
git switch -c feat/backend
```

The repository owner invites the teammate through GitHub Settings → Collaborators;
the teammate accepts and authenticates with her own account.

Commit and push only your owned folder, for example:

```bash
git add frontend
git commit -m "Build meal planning interface"
git push -u origin feat/frontend
```

The teammate substitutes `backend` and `feat/backend`.
Open a pull request into `main`; Satya Sri coordinates review and merges.
Commit outstanding work before switching branches. After merging:

```bash
git switch main
git pull --ff-only origin main
```

Create fresh branches for subsequent fixes. Do not force-push or discard a teammate's work.

## Integration expectations

Frontend uses relative `/api` URLs with Vite proxying to `http://127.0.0.1:8000`.
Backend runs on port 8000; generated FastAPI docs are at `/docs`.
Each owner documents exact install, run and verification commands in their folder README.
Mocks require explicit activation and a visible label; API failures never silently enable mocks.
Final demo must use the real backend.

GitHub shares source code; it does not run the API or synchronize SQLite databases.
Each computer installs dependencies and runs the idempotent seed script separately.
Never commit secrets, local databases, dependencies or build output.

## Delivery

Working local workflow: plan → adjust → save → record results → review insights.
Use fictional data only for the unauthenticated demo. Hosting and production access
controls are separate future work.

## Kitchen workflow upgrade

Read [Kitchen workflow v2](docs/KITCHEN_WORKFLOW_V2.md) for custom menus,
22 starter dishes, portion/container estimates, optional weights and honest waste
coverage. Use frontend/README.md and backend/README.md for startup and tests.
Run both from this same branch; the older frontend cannot edit the new nullable
result fields correctly. Preserve any uncommitted local changes before switching branches.
