# Omni REST infrastructure

This repository is a monorepo for the Omni REST frontend and backend applications.

## Repository layout

```text
.
├── src/
│   ├── frontend/                         # React 19 and Next.js App Router application
│   └── backend/
│       ├── OmniRest.Api/                 # ASP.NET Core API
│       ├── OmniRest.Api.Tests/           # Backend test project
│       └── OmniRest.sln                  # Backend solution
├── requirments/                          # Product requirements
└── specifications/                       # Technical specifications
```

## Prerequisites

- Node.js 26.5.0
- npm 11.17.0
- .NET SDK 10.0.302
- Docker Engine with Compose

The repository pins Node.js in `.node-version`, npm in `src/frontend/package.json`, and the .NET SDK in `global.json`.

## Frontend setup and run

Install the locked dependencies from the repository root:

```sh
cd src/frontend
npm ci
```

Start the development server:

```sh
npm run dev
```

Open `http://menu.localhost:3000` for the seeded public tenant. The protected owner portal is at `http://menu.localhost:3000/admin/login` after an owner has been provisioned.

To build and run the production server locally:

```sh
npm run build
npm run start
```

## Frontend checks

Unit and static checks do not require PostgreSQL. Run them from `src/frontend`:

```sh
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run build
```

The browser and performance suites use the real backend and PostgreSQL for public menu responses. The Phase 3 owner journey uses a deterministic same-origin proxy fixture so test credentials are not provisioned into the persistent database; backend auth and authorization remain covered by the backend integration suite. Before the first browser run, complete the database, local EF tool, restore, and backend build steps under [Backend commands](#backend-commands). The harness starts the already-built backend with `--no-build`.

Then build the frontend and run the suites from `src/frontend`:

```sh
npm run build
npm run test:e2e
npm run test:perf
```

The Playwright harness applies pending migrations, idempotently loads both the ordinary sample and the isolated 30-category/1,000-dish fixture, and starts the API, test proxy, and production frontend. Keep local ports `3000`, `5279`, and `5290` available. `test:e2e` covers Chromium, Firefox, WebKit, and the 320 px and 768 px viewport projects. `test:perf` reports local production-build measurements only; it is not staging or field-performance evidence.

## Backend commands

The backend uses PostgreSQL 18, EF Core 10, and the repository-local `dotnet-ef` tool. Start the local database without deleting its volume:

```sh
docker info
docker compose up -d --wait postgres
dotnet tool restore
```

Apply the three ordered Phase 2 migrations plus the additive Phase 3 Identity/restaurant-management migration, then load the guarded Development sample. Seeding is explicit, never runs at production startup, and is idempotent:

```sh
dotnet ef migrations list \
  --project src/backend/OmniRest.Api/OmniRest.Api.csproj \
  --startup-project src/backend/OmniRest.Api/OmniRest.Api.csproj
dotnet ef database update \
  --project src/backend/OmniRest.Api/OmniRest.Api.csproj \
  --startup-project src/backend/OmniRest.Api/OmniRest.Api.csproj
ASPNETCORE_ENVIRONMENT=Development \
  dotnet run --project src/backend/OmniRest.Api/OmniRest.Api.csproj -- --seed-sample
```

Use `--seed-large` instead to load the isolated `large-menu.localhost` reference fixture with 30 categories and 1,000 dishes. The ordinary sample resolves from `menu.localhost`; other deterministic states use `no-menu.localhost`, `no-active.localhost`, `active-empty.localhost`, and `alternate.localhost`.

Build, test, format-check, and run from the repository root:

```sh
dotnet restore src/backend/OmniRest.sln
dotnet build src/backend/OmniRest.sln --no-restore
dotnet test src/backend/OmniRest.sln --no-build --logger "console;verbosity=normal"
dotnet format src/backend/OmniRest.sln --verify-no-changes --no-restore
dotnet run --project src/backend/OmniRest.Api/OmniRest.Api.csproj -- --urls http://127.0.0.1:5279
```

The public contracts are `GET /api/v1/public/menu` and `GET /api/v1/public/restaurant`; both derive the restaurant only from the validated request host. Owner auth is under `/api/v1/auth`, and membership-derived management is under `/api/v1/admin`. For local public smoke requests:

```sh
curl --include --header 'Host: menu.localhost' http://127.0.0.1:5279/api/v1/public/menu
curl --include --header 'Host: menu.localhost' http://127.0.0.1:5279/api/v1/public/restaurant
```

Owner accounts are never publicly registered. Use the controlled provisioning, revocation, and production Data Protection procedure in [`specifications/phase-3/backend-operations.md`](specifications/phase-3/backend-operations.md). State-changing auth/admin requests first obtain `/api/v1/auth/antiforgery` and return its token in the `X-CSRF-TOKEN` header.

Phase 3 frontend acceptance mapping, automated results, and explicit device/contract limitations are recorded in [`specifications/phase-3/frontend-implementation-evidence.md`](specifications/phase-3/frontend-implementation-evidence.md).

For a manual full-stack development session, leave that API command running and start the frontend in another terminal:

```sh
cd src/frontend
OMNI_REST_API_BASE_URL=http://127.0.0.1:5279 npm run dev
```

Development OpenAPI is available at `/openapi/v1.json`. Do not run `docker compose down -v`; the named PostgreSQL volume is intentionally persistent.
