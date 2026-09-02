import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repositoryDirectory = path.resolve(frontendDirectory, "../..");
const apiProject = "src/backend/OmniRest.Api/OmniRest.Api.csproj";
/**
 * The login rate limiter defaults to 5 attempts per account per 15 minutes, which is a good production
 * setting and the wrong one for this harness. The suite signs the same owner in once per test — five
 * designs in design.spec, eight walkthroughs in admin-tasks.spec, plus restaurant.spec — and
 * `fullyParallel` runs that across five browser projects at once. The sixth sign-in of the run gets
 * `auth_rate_limited`, the browser lands back on /admin/login, and every admin assertion after it fails
 * for a reason that has nothing to do with what the test is checking.
 *
 * Raising the ceiling and shortening the window keeps the limiter switched on — a test that genuinely
 * hammers login still trips it — while giving a normal parallel run the headroom it needs. Production
 * values are untouched: this is the e2e harness only. The limits stay inside the ranges
 * `LoginRateLimitSettings` validates (account 3-20, global >= account x 20).
 */
const environment = {
  ...process.env,
  ASPNETCORE_ENVIRONMENT: "Development",
  LoginRateLimit__AccountPermitLimit: "20",
  LoginRateLimit__AccountWindow: "00:01:00",
  LoginRateLimit__GlobalPermitLimit: "2000",
  LoginRateLimit__GlobalWindow: "00:01:00",
};

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
