import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repositoryDirectory = path.resolve(frontendDirectory, "../..");
const apiProject = "src/backend/OmniRest.Api/OmniRest.Api.csproj";
const environment = { ...process.env, ASPNETCORE_ENVIRONMENT: "Development" };

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryDirectory,
    env: environment,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("docker", ["compose", "up", "-d", "--wait", "postgres"]);
run("dotnet", ["ef", "database", "update", "--project", apiProject, "--startup-project", apiProject, "--no-build"]);
run("dotnet", ["run", "--project", apiProject, "--no-build", "--", "--seed-sample"]);
run("dotnet", ["run", "--project", apiProject, "--no-build", "--", "--seed-large"]);

const backend = spawn(
  "dotnet",
  ["run", "--project", apiProject, "--no-build", "--", "--urls", "http://127.0.0.1:5279"],
  {
    cwd: repositoryDirectory,
    env: environment,
    stdio: "inherit",
  },
);

function stop(signal) {
  if (!backend.killed) backend.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
backend.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
