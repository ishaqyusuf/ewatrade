#!/usr/bin/env node

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readEnvironmentFile } from "./environment-profile.mjs"
import {
  selectedTriggerDeployEnvironment,
  triggerDeployCommand,
} from "./trigger-deploy-profile.mjs"

const args = process.argv.slice(2)
const command = args[0] === "--" ? args.slice(1) : args
let env = process.env

if (command.length === 0) {
  console.error("Usage: with-trigger-profile.mjs -- <command> [args...]")
  process.exit(1)
}

const hasProfileFlag = command.some(
  (arg) => arg === "--profile" || arg.startsWith("--profile="),
)
let finalCommand
try {
  if (command[0] !== "trigger" || command[1]?.startsWith("-")) {
    throw new Error("Expected a Trigger subcommand before its options.")
  }
  if (command[1] === "deploy") {
    const root = fileURLToPath(new URL("../", import.meta.url))
    if (resolve(process.cwd()) !== join(root, "packages", "jobs")) {
      throw new Error("Jobs deployment must run from the jobs workspace.")
    }
    if (env.APP_ENV !== "preview" && env.APP_ENV !== "production") {
      throw new Error(
        "Jobs deployment requires a Preview or Production profile.",
      )
    }
    env = selectedTriggerDeployEnvironment(
      env,
      readEnvironmentFile(join(root, `.env.${env.APP_ENV}`)),
      readEnvironmentFile(join(root, ".env.production")),
    )
    finalCommand = triggerDeployCommand(command, env)
  } else {
    const profile = env.TRIGGER_PROFILE?.trim()
    finalCommand =
      profile && !hasProfileFlag ? [...command, "--profile", profile] : command
  }
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

if (
  finalCommand[0] === "trigger" &&
  (finalCommand[1] === "deploy" || finalCommand[1] === "dev") &&
  !env.TRIGGER_PROJECT_ID?.trim()
) {
  console.error("TRIGGER_PROJECT_ID is required to configure jobs.")
  process.exit(1)
}

const commandBin =
  finalCommand[0] === "trigger"
    ? join(process.cwd(), "node_modules", ".bin", "trigger")
    : finalCommand[0]
const executable = existsSync(commandBin) ? commandBin : finalCommand[0]
if (command[1] === "deploy" && !existsSync(commandBin)) {
  console.error("Jobs deployment requires the installed workspace Trigger CLI.")
  process.exit(1)
}

const child = spawn(executable, finalCommand.slice(1), {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})

child.on("error", (error) => {
  console.error(error.message)
  process.exit(1)
})
