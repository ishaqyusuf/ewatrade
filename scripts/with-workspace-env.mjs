import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const workspaceDir = process.cwd();

function mergeEnvFile(filePath, targetEnv) {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, "utf8");
  const parsed = parseEnv(contents);

  for (const [key, value] of Object.entries(parsed)) {
    targetEnv[key] = value;
  }
}

function buildEnv() {
  const env = { ...process.env };
  const rootEnvFiles = [
    path.join(repoRoot, ".env"),
    path.join(repoRoot, ".env.development"),
  ];
  const workspaceEnvFiles = [
    path.join(workspaceDir, ".env"),
    path.join(workspaceDir, ".env.development"),
  ];

  for (const filePath of rootEnvFiles) {
    mergeEnvFile(filePath, env);
  }

  if (workspaceDir !== repoRoot) {
    for (const filePath of workspaceEnvFiles) {
      mergeEnvFile(filePath, env);
    }
  }

  return env;
}

function parseCommand(argv) {
  const envAssignments = {};
  let index = 0;

  while (index < argv.length) {
    const token = argv[index];

    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      break;
    }

    const separatorIndex = token.indexOf("=");
    const key = token.slice(0, separatorIndex);
    const value = token.slice(separatorIndex + 1);
    envAssignments[key] = value;
    index += 1;
  }

  const command = argv[index];
  const args = argv.slice(index + 1);

  if (!command) {
    console.error("Expected a command to run.");
    process.exit(1);
  }

  return { envAssignments, command, args };
}

const { envAssignments, command, args } = parseCommand(process.argv.slice(2));
const env = {
  ...buildEnv(),
  ...envAssignments,
};

const child = spawn(command, args, {
  cwd: workspaceDir,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
