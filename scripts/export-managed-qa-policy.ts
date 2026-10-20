import { writeFile } from "node:fs/promises"
import { parseQaDomainRoutes } from "@ewatrade/email"
import { parseQaPolicy } from "@ewatrade/utils/qa-policy"
function argument(name: string) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const out = argument("--out")
if (!out?.startsWith("/"))
  throw new Error("Pass an absolute private --out file.")
const environments = Object.fromEntries(
  (["development", "preview", "production"] as const).map((target) => {
    const value = argument(`--${target}`)
    if (value !== "on" && value !== "off")
      throw new Error(`Explicit --${target} on|off required.`)
    return [target, value === "on"]
  }),
)
const entries = [
  ...parseQaDomainRoutes(process.env.EMAIL_QA_DOMAIN_ROUTES),
].map(([qa, email]) => ({
  id: crypto.randomUUID(),
  email,
  qa,
  phone: null,
  accountId: null,
  active: true,
}))
if (!entries.length)
  throw new Error(
    "No existing QA namespace mappings were found in the selected profile.",
  )
const policy = parseQaPolicy({
  projectId: "ewatrade",
  revision: 0,
  environments,
  entries,
})
await writeFile(out, `${JSON.stringify(policy, null, 2)}\n`, {
  mode: 0o600,
  flag: "wx",
})
console.log(
  `Exported ${entries.length} existing mappings. No account or business was created. Review privately before importing; add only approved actual phone/account bindings.`,
)
