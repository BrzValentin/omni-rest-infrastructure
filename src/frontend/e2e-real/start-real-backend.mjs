import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repositoryDirectory = path.resolve(frontendDirectory, "../..");
const apiProject = "src/backend/OmniRest.Api/OmniRest.Api.csproj";
const containerName = `omni-rest-real-e2e-${process.pid}`;
const password = "Real-Stack-Owner-9!Password";
const mediaRoot = mkdtempSync(path.join(tmpdir(), "omni-rest-real-media-"));

function run(command, args, environment = process.env) {
  const result = spawnSync(command, args, { cwd: repositoryDirectory, env: environment, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
  return result.stdout.trim();
}

let stopped = false;
function removeDatabase() {
  if (stopped) return;
  stopped = true;
  spawnSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
}

run("docker", ["run", "--detach", "--rm", "--name", containerName,
  "--env", "POSTGRES_DB=omni_rest_e2e", "--env", "POSTGRES_USER=omni_rest",
  "--env", "POSTGRES_PASSWORD=real_stack_test_password", "--publish", "127.0.0.1::5432", "postgres:18"]);

try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const probe = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "omni_rest", "-d", "omni_rest_e2e"], { stdio: "ignore" });
    if (probe.status === 0) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Ephemeral PostgreSQL did not become ready.");
  const portOutput = run("docker", ["port", containerName, "5432/tcp"]);
  const port = portOutput.match(/:(\d+)$/)?.[1];
  if (!port) throw new Error(`Could not parse PostgreSQL port from ${portOutput}`);
  const environment = {
    ...process.env,
    ASPNETCORE_ENVIRONMENT: "Development",
    ConnectionStrings__MenuDatabase: `Host=127.0.0.1;Port=${port};Database=omni_rest_e2e;Username=omni_rest;Password=real_stack_test_password`,
    MediaStorage__LocalRoot: mediaRoot,
    OMNIREST_PROVISION_PASSWORD: password,
    ReverseProxy__KnownProxies__0: "127.0.0.1",
  };
  run("dotnet", ["tool", "restore"], environment);
  run("dotnet", ["build", "src/backend/OmniRest.sln", "--no-restore"], environment);
  run("dotnet", ["ef", "database", "update", "--project", apiProject, "--startup-project", apiProject, "--no-build"], environment);
  run("dotnet", ["run", "--project", apiProject, "--no-build", "--", "--seed-sample"], environment);
  run("dotnet", ["run", "--project", apiProject, "--no-build", "--", "--provision-owner", "real.owner@example.test", "85df1654-099a-58e1-ac09-38599f51a1d7", "Real Stack Owner"], environment);

  const backend = spawn("dotnet", ["run", "--project", apiProject, "--no-build", "--", "--urls", "http://127.0.0.1:5281"], {
    cwd: repositoryDirectory, env: environment, stdio: "inherit",
  });
  const stop = (signal) => { if (!backend.killed) backend.kill(signal); removeDatabase(); };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("exit", removeDatabase);
  backend.on("exit", (code, signal) => { removeDatabase(); if (signal) process.kill(process.pid, signal); else process.exit(code ?? 1); });
} catch (error) {
  removeDatabase();
  throw error;
}
