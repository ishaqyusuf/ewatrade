import {
  constants,
  closeSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
} from "node:fs"
import { join } from "node:path"
/** Local artifact tooling. No provider, environment profile, DB or deployment entrypoint. */
import {
  readAttemptStatus,
  verifyArtifact,
} from "../packages/storefront-components/src/artifacts"
import { artifactHash } from "../packages/storefront-components/src/artifacts"
import {
  offlineSampleBrief,
  offlineSampleGenerator,
} from "../packages/storefront-components/src/offline-sample"
import { summarizeStorefrontOperations } from "../packages/storefront-components/src/operations"
import { runComponentPipeline } from "../packages/storefront-components/src/pipeline"

const [command, ...args] = process.argv.slice(2)
const options = new Map<string, string>()
for (let index = 0; index < args.length; index += 2) {
  const flag = args[index]
  const value = args[index + 1]
  if (
    !flag ||
    !["--store", "--attempt", "--artifact", "--revision", "--file"].includes(
      flag,
    ) ||
    !value ||
    value.startsWith("--") ||
    options.has(flag)
  ) {
    throw new Error(
      "Expected unique --store, --attempt, --artifact, --revision or --file options with values.",
    )
  }
  options.set(flag, value)
}
function required(flag: string) {
  const value = options.get(flag)
  if (!value) throw new Error(`Missing ${flag}.`)
  return value
}
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2))

if (command === "sample") {
  const sourceRevision = required("--revision")
  if (!/^[a-f0-9]{40}$/.test(sourceRevision))
    throw new Error("Expected a full source revision.")
  const result = await runComponentPipeline(
    {
      storeRoot: required("--store"),
      attemptId: required("--attempt"),
      sourceRevision,
      brief: offlineSampleBrief,
    },
    offlineSampleGenerator,
  )
  print(result)
  if (result.status !== "ready") process.exitCode = 1
} else if (command === "status") {
  print(await readAttemptStatus(required("--store"), required("--attempt")))
} else if (command === "verify") {
  const artifact = await verifyArtifact(
    required("--store"),
    required("--artifact"),
  )
  print({
    artifactId: artifact.artifactId,
    artifactPath: artifact.artifactPath,
    receipt: artifact.receipt,
  })
} else if (command === "operations") {
  const fd = openSync(
    required("--file"),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > 262144)
      throw new Error("Expected a bounded regular support snapshot file.")
    const bytes = Buffer.alloc(262145)
    let length = 0
    while (length < bytes.length) {
      const read = readSync(fd, bytes, length, bytes.length - length, null)
      if (!read) break
      length += read
    }
    if (length > 262144)
      throw new Error("Support snapshot exceeds the byte limit.")
    try {
      print(
        summarizeStorefrontOperations(
          JSON.parse(bytes.subarray(0, length).toString("utf8")),
        ),
      )
    } catch {
      throw new Error("STOREFRONT_SUPPORT_SNAPSHOT_INVALID")
    }
  } finally {
    closeSync(fd)
  }
} else if (command === "serve") {
  const artifact = await verifyArtifact(
    required("--store"),
    required("--artifact"),
  )
  if (
    artifact.receipt?.kind !== "storefront-component-pipeline" ||
    artifact.receipt?.status !== "ready"
  ) {
    throw new Error("A ready pipeline artifact is required for local review.")
  }
  const pages = new Map<string, string>()
  for (const fixture of ["populated", "empty", "unavailable"]) {
    const name = `preview-${fixture}.html`
    const entry = artifact.files.find((file) => file.name === name)
    if (!entry) throw new Error("A complete qualified preview is required.")
    const bytes = readFileSync(join(artifact.artifactPath, name))
    if (artifactHash(bytes) !== entry.sha256)
      throw new Error("Preview bytes changed.")
    pages.set(`/${fixture}`, bytes.toString())
  }
  const port = Number(process.env.PORT)
  if (
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !process.env.PORTLESS_URL?.endsWith(".localhost")
  ) {
    throw new Error("Run serve through Portless with a local named host.")
  }
  Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch(request) {
      const url = new URL(request.url)
      const body = pages.get(url.pathname === "/" ? "/populated" : url.pathname)
      return new Response(body ?? "Not found", {
        status: body ? 200 : 404,
        headers: {
          "Content-Type": body
            ? "text/html; charset=utf-8"
            : "text/plain; charset=utf-8",
          "Content-Security-Policy":
            "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      })
    },
  })
  console.log(
    `Local inert review: ${process.env.PORTLESS_URL}/populated (also /empty and /unavailable)`,
  )
} else {
  console.log(
    "Usage: template-components.ts sample --store <absolute directory> --attempt <id> --revision <40-character sha> | status --store <directory> --attempt <id> | verify|serve --store <directory> --artifact <sha256> | operations --file <bounded scoped snapshot.json>",
  )
  process.exitCode = 1
}
