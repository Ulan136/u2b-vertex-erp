# server/ — layered API architecture (MVC-style)

The new, clean structure for API logic. The **old** routes under
`src/app/api/*` (certs, orders, products, sales, finance) are untouched and keep
working; the new implementation is exposed in parallel under `src/app/api/v2/*`.
Migrate consumers to `v2` gradually, then retire the old routes.

## Layers (request flow)

```
HTTP  →  app/api/v2/<resource>/route.ts   (entry: re-exports the controller)
         │
         ▼
server/controllers/<resource>.controller.ts   HTTP only: read req, call service, format response (withApi)
         │
         ▼
server/services/<resource>.service.ts         business logic + validation (Zod DTO), orchestration
         │
         ▼
server/repositories/<resource>.repo.ts        data access — the only place that talks to Drizzle
         │
         ▼
@/db  (Drizzle + Neon)   ← schema is the source of truth, NOT changed by this layer
```

- **dto/** — Zod schemas = input validation + shape. Unknown keys are stripped;
  bad payloads become `400` instead of reaching the DB.
- **lib/** — cross-cutting: `http.ts` (`withApi` wrapper: CORS, OPTIONS, uniform
  error handling, `json/created/noContent` helpers), `errors.ts` (`ApiError`,
  `badRequest/notFound/conflict`), `cors.ts`.

## Adding a resource (e.g. a new branch-scoped table)

1. `dto/<r>.dto.ts` — Zod create/update schemas.
2. `repositories/<r>.repo.ts` — Drizzle queries.
3. `services/<r>.service.ts` — logic; throws `ApiError` on invalid state.
4. `controllers/<r>.controller.ts` — `withApi(...)` handlers.
5. `app/api/v2/<r>/route.ts` — `export { GET, POST, OPTIONS } from '@/server/controllers/<r>.controller'`.

No `route.ts` should contain business logic or touch Drizzle directly.
