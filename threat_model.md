# Threat Model

## Project Overview

Clarity is a thought capture and action queue application delivered as a TypeScript pnpm workspace. Production-relevant components are an Express 5 API server (`artifacts/api-server`), PostgreSQL data storage through Drizzle ORM (`lib/db`), a React/Vite web client (`artifacts/clarity-web`), and an Expo mobile client (`artifacts/clarity-mobile`). Users record or type personal thoughts, transcribe audio through an OpenAI-compatible integration, and create/manage action items.

The mockup sandbox is development-only and is out of scope for production security findings unless future evidence shows it is deployed in production. Production deployments are assumed to run with `NODE_ENV=production` and platform-managed TLS.

## Assets

- **Thought and action data** -- action titles, descriptions, categories, statuses, snooze dates, and timestamps can contain personal, work, family, finance, health, or other sensitive user information.
- **Audio submissions and transcription output** -- uploaded audio and generated text may contain sensitive spoken content and can incur third-party API cost.
- **Database contents and connection string** -- PostgreSQL stores all durable user data; compromise enables bulk disclosure, modification, or deletion.
- **Application secrets** -- `DATABASE_URL`, `AI_CHAT_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, and legacy `AI_INTEGRATIONS_OPENAI_*` transcription vars must remain server-side and out of logs/client bundles.
- **Service availability and third-party quota** -- public endpoints can consume server CPU/memory, database capacity, and OpenAI transcription budget.

## Trust Boundaries

- **Browser/mobile client to API** -- clients are untrusted. Every request to `/api` must be validated server-side, authenticated when it accesses user data, and authorized against the acting user or role.
- **API to PostgreSQL** -- the API has database access. Query construction must remain parameterized and must not expose data across users or tenants.
- **API to OpenAI-compatible transcription service** -- `/api/transcribe` sends uploaded audio to an external service using server-held credentials. File type, size, request rate, and error handling must protect cost and availability.
- **Public to authenticated user data** -- health checks may be public, but action queue and transcription capabilities are user-facing application features and should not be callable by unrelated internet clients without appropriate access control.
- **Development/build tooling to production runtime** -- Expo build scripts, Vite dev plugins, and `artifacts/mockup-sandbox` are dev/build-time surfaces and should normally be ignored for production findings.

## Scan Anchors

- Production API entry points: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, and `artifacts/api-server/src/routes/`.
- Highest-risk API routes: `artifacts/api-server/src/routes/actions.ts` for action CRUD and `artifacts/api-server/src/routes/transcribe.ts` for uploads/external API spend.
- Data model and validation anchors: `lib/db/src/schema/`, `lib/api-spec/openapi.yaml`, and generated Zod schemas in `lib/api-zod/src/generated/api.ts`.
- Clients: `artifacts/clarity-web/src/pages/Home.tsx`, `artifacts/clarity-mobile/app/index.tsx`, and `lib/api-client-react/src/custom-fetch.ts`.
- Public surface currently observed: `/api/healthz`, `/api/actions`, `/api/actions/queue`, `/api/actions/:id`, `/api/actions/:id/snooze`, and `/api/transcribe`.
- Dev-only/out-of-scope by default: `artifacts/mockup-sandbox`, Expo build scripts under `artifacts/clarity-mobile/scripts/`, and Vite dev-server configuration guarded by non-production checks.

## Threat Categories

### Spoofing

User-specific action and transcription APIs must identify the caller before accepting requests. Any bearer-token or session-cookie support in clients must be paired with server-side verification; client-side assumptions alone do not prove identity.

### Tampering

Action creation, update, snooze, completion, and deletion mutate durable user data. The server must validate request bodies and enforce that the authenticated caller may modify the targeted action. Business state transitions and dates must not rely on frontend-only controls.

### Information Disclosure

Action queues can contain sensitive personal content. Listing and queue endpoints must return only records the caller is allowed to see, and error/log handling must avoid exposing secrets, request credentials, audio contents, or database details.

### Denial of Service

Public JSON and upload endpoints must have bounded body sizes, rate limits appropriate to cost, and validation constraints for pagination/string/date fields. The transcription endpoint is especially sensitive because a request can allocate memory for uploads and consume paid third-party API quota.

### Elevation of Privilege

If the application adds accounts or roles, all data access must be scoped server-side by owner/tenant and all privileged actions must be enforced by backend authorization checks. Database queries should continue to use Drizzle parameterization; raw SQL fragments must remain constant and never incorporate user input.