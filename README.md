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

Open `http://localhost:3000`.

To build and run the production server locally:

```sh
npm run build
npm run start
```

## Frontend checks

Run the frontend quality checks from `src/frontend`:

```sh
npm run lint
npm run typecheck
npm run build
```

## Backend commands

Run backend commands from the repository root:

```sh
dotnet restore src/backend/OmniRest.sln
dotnet build src/backend/OmniRest.sln --no-restore
dotnet test src/backend/OmniRest.sln --no-build
dotnet run --project src/backend/OmniRest.Api/OmniRest.Api.csproj
```
