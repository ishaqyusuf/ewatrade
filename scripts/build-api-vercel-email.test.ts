import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

test("Vercel Git build renders the real signup email in a production runtime", () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const fixture = mkdtempSync(join(tmpdir(), "ewatrade-vercel-email-"))
  const node = Bun.which("node")
  if (!node) throw new Error("Node fixture runtime missing")
  try {
    for (const directory of ["scripts", "bin", "apps/api/src"]) {
      mkdirSync(join(fixture, directory), { recursive: true })
    }
    for (const script of ["build-api-vercel.mjs", "api-bundle-externals.mjs"]) {
      copyFileSync(
        join(root, "scripts", script),
        join(fixture, "scripts", script),
      )
    }
    writeFileSync(join(fixture, "package.json"), '{"type":"module"}')
    writeFileSync(
      join(fixture, "apps/api/tsconfig.json"),
      '{"compilerOptions":{"jsx":"preserve"}}',
    )
    writeFileSync(
      join(fixture, "apps/api/src/index.ts"),
      `export { renderMobileOwnerOtpTemplate } from ${JSON.stringify(join(root, "packages/email/templates/mobile-owner-otp.tsx"))};`,
    )
    // Skip only database client generation. Forward the real provider build
    // arguments to Bun; never load a root dotenv file or contact a provider.
    writeFileSync(
      join(fixture, "bin/bun"),
      `#!${node}\nimport {spawnSync} from 'node:child_process';const args=process.argv.slice(2);if(JSON.stringify(args)===JSON.stringify(['run','--cwd','packages/db','db:generate']))process.exit(0);if(args[0]!=='build')process.exit(90);const result=spawnSync(${JSON.stringify(process.execPath)},['--no-env-file',...args],{stdio:'inherit',env:process.env});process.exit(result.status??91);\n`,
      { mode: 0o700 },
    )
    const environment = {
      PATH: `${join(fixture, "bin")}:${dirname(node)}`,
      HOME: fixture,
      TMPDIR: fixture,
      VERCEL: "1",
      NODE_ENV: "development",
    }
    const built = spawnSync(node, ["scripts/build-api-vercel.mjs"], {
      cwd: fixture,
      env: environment,
      encoding: "utf8",
      timeout: 15_000,
    })
    expect(built.status, built.stderr).toBe(0)
    const rendered = spawnSync(
      process.execPath,
      [
        "--no-env-file",
        "--eval",
        `const {renderMobileOwnerOtpTemplate}=await import(${JSON.stringify(join(fixture, "apps/api/src/bundle.js"))});const email=renderMobileOwnerOtpTemplate({code:'000000',expiresAtLabel:'12:00',mode:'sign_up'});if(!email.html.startsWith('<!doctype html>')||!email.html.includes('verify your new EwaTrade account')||!email.text.includes('000000'))process.exit(92);console.log('signup email rendered');process.exit(0);`,
      ],
      {
        cwd: fixture,
        env: { ...environment, NODE_ENV: "production" },
        encoding: "utf8",
        timeout: 15_000,
      },
    )
    expect(rendered.status, rendered.stderr).toBe(0)
    expect(rendered.stdout.trim()).toBe("signup email rendered")
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}, 35_000)
