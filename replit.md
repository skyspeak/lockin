# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

**Clarity** — a thought capture and action queue app available on web (React+Vite) and mobile (Expo). Users can dictate or type thoughts, classify them into categories, and manage an action queue.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

| Artifact | Path | Port | Description |
|---|---|---|---|
| `clarity-web` | `/` | 3000 | React+Vite web app |
| `clarity-mobile` | `/mobile/` | 3001 | Expo mobile app |
| `api-server` | `/api` | 8080 | Express API server |

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Design System

- **Primary**: Terracotta `hsl(10, 70%, 60%)` = `#e06b53`
- **Secondary**: Sage green `hsl(108, 12%, 56%)` = `#8a9a86`
- **Background**: Warm cream `hsl(40, 33%, 98%)` = `#fdfbf7`
- **Fonts**: Outfit (sans), Playfair Display (serif)
- **Radius**: 8px

## Categories

`work` | `side-projects` | `family` | `finance` | `personal` | `health` | `other`

## Action Statuses

`pending` | `in-progress` | `done` | `dismissed`

## Priority Levels

`low` | `medium` | `high`

## Codegen Note

After running codegen, manually fix `lib/api-zod/src/index.ts` to only contain:
```ts
export * from "./generated/api";
```
(Codegen regenerates the barrel incorrectly.)

## Port Mappings (.replit)

- 8080 → external 80 (shared proxy)
- 3000 → external 3000 (web dev)
- 3001 → external 3001 (mobile dev)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
