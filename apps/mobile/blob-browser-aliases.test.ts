import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
const { createBlobBrowserResolver } = require("./blob-browser-aliases.cjs")

test("Blob client uses its own published browser shims at existing package paths", () => {
  const origin = require.resolve("@vercel/blob/client")
  const root = dirname(dirname(origin))
  const lookup = createBlobBrowserResolver()
  for (const name of ["crypto", "stream", "undici"]) {
    const result = lookup(name, origin)
    expect(result?.type).toBe("sourceFile")
    expect(result?.filePath).toBe(resolve(root, `dist/${name}-browser.js`))
    expect(existsSync(result.filePath)).toBe(true)
  }
})

test("SDK browser aliases never mask Node imports from application or other dependencies", () => {
  const lookup = createBlobBrowserResolver()
  expect(lookup("crypto", resolve(__dirname, "src/lib/example.ts"))).toBeNull()
  expect(
    lookup(
      "stream",
      resolve(__dirname, "node_modules/another-package/client.js"),
    ),
  ).toBeNull()
  expect(lookup("fs", require.resolve("@vercel/blob/client"))).toBeNull()
  expect(lookup("crypto", undefined)).toBeNull()
})

test("Blob's native OIDC lookup stays empty without loading server token verification", async () => {
  const lookup = createBlobBrowserResolver()
  const result = lookup("@vercel/oidc", require.resolve("@vercel/blob/client"))
  expect(result?.filePath).toBe(resolve(__dirname, "blob-oidc-native.cjs"))
  expect(existsSync(result.filePath)).toBe(true)
  expect(
    lookup("@vercel/oidc", resolve(__dirname, "src/lib/example.ts")),
  ).toBeNull()
  const native = require("./blob-oidc-native.cjs")
  expect(await native.getVercelOidcToken()).toBe("")
})

test("the bundled native Blob client loads without Web Crypto and refuses invalid tokens before fetch", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "ewatrade-blob-native-"))
  try {
    const entry = resolve(directory, "entry.js")
    await writeFile(
      entry,
      `export { put } from ${JSON.stringify(require.resolve("@vercel/blob/client"))};`,
    )
    const lookup = createBlobBrowserResolver()
    const bundle = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      format: "cjs",
      outdir: directory,
      plugins: [
        {
          name: "native-blob-boundary",
          setup(builder) {
            builder.onResolve(
              { filter: /^(crypto|stream|undici|@vercel\/oidc)$/ },
              (args) => {
                const result = lookup(args.path, args.importer)
                return result ? { path: result.filePath } : undefined
              },
            )
          },
        },
      ],
    })
    expect(bundle.success).toBe(true)
    const output = resolve(directory, "sdk.cjs")
    const artifact = bundle.outputs[0]
    if (!artifact) throw new Error("Native SDK bundle unavailable")
    await writeFile(output, await artifact.text())
    const check = resolve(directory, "check.cjs")
    await writeFile(
      check,
      `
      delete globalThis.crypto;
      let calls = 0;
      globalThis.fetch = async () => { calls++; throw Error("unexpected provider call"); };
      const { put } = require(${JSON.stringify(output)});
      (async () => {
        try { await put("synthetic", "bytes", { access: "private", token: "invalid" }); process.exit(2); }
        catch (error) { if (!error.message.includes("client token") || calls !== 0) process.exit(3); }
      })();
    `,
    )
    const run = Bun.spawn(["node", check], { stdout: "pipe", stderr: "pipe" })
    expect(await run.exited).toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
