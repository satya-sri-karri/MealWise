# Verification

Executed on 23 October 2026 using Python 3.12, Linux, FastAPI 0.115.12,
SQLModel 0.0.24, SQLite, HTTPX 0.28.1 and pytest 8.3.5.

`python -m pytest -q`: **48 passed**.

Additional v2 tests cover recipe persistence, archiving, immutable conversion sizes,
partial records, complete-only denominators, mixed plate bins, and unit validation.

Coverage includes the original seven endpoints, no-history fallback, capping, zero demand,
strict JSON types, malformed JSON and nonfinite numbers, unknown fields, history
weekday/recent selection and seven-meal limit, unrounded baselines, shared raw
ingredient rounding, weighted aggregate ratios, zero-diner nulls, estimated flags,
idempotent and concurrent plan saving, distinct-preview conflicts, atomic invalid
correction rejection, successful upserts, one result per plan, preview persistence
across reopening from another working directory, snapshot capacity/history edits,
future-date rejection, missing IDs, database failure envelopes and seed reruns.

One dependency deprecation warning: Starlette's TestClient references AnyIO's
BlockingPortal alias. No application assertion failed. Windows commands are
documented but were not executed on a Windows host.
