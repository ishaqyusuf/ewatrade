import { readFile } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const required = [
  "src/app/domain-management-modal.tsx",
  "src/components/mobile/domains/domain-management-content.tsx",
  "src/components/mobile/domains/domain-management-presentation.ts",
  "src/components/mobile/domains/domain-owner-form.tsx",
  "src/components/mobile/floating-theme-toggle.tsx",
]

for (const file of required) {
  const source = await readFile(path.join(root, file), "utf8")
  if (!source.trim()) throw new Error(`${file} is empty`)
}

const layout = await readFile(path.join(root, "src/app/_layout.tsx"), "utf8")
const navigation = await readFile(
  path.join(root, "src/lib/admin-navigation.ts"),
  "utf8",
)

if (!layout.includes('name="domain-management-modal"')) {
  throw new Error("Domain management route is not registered.")
}
if (!navigation.includes('id: "website-domain"')) {
  throw new Error("Website & domain is missing from the More navigation model.")
}

const domainContent = await readFile(path.join(root, required[1]), "utf8")
if (!domainContent.includes("resolveDomainBusinessId")) {
  throw new Error(
    "Domain management must resolve authenticated production business scope.",
  )
}
if (!domainContent.includes("DOMAIN_MANAGEMENT_COPY")) {
  throw new Error(
    "Domain management must use the approved Storefront-first presentation copy.",
  )
}
if (!domainContent.includes("paddingHorizontal: 20")) {
  throw new Error(
    "Domain management must keep full-width interaction surfaces inside the screen gutter.",
  )
}
if (!domainContent.includes("shouldLoadRegistrantProfile")) {
  throw new Error(
    "Registrant profile reads must stay deferred until the purchase path is opened.",
  )
}
if (!domainContent.includes("shouldLoadDomainList(domainBusinessId)")) {
  throw new Error(
    "Domain reads must stay disabled without a resolved business.",
  )
}
if (!domainContent.includes("shouldLoadDomainOrder(domainBusinessId")) {
  throw new Error(
    "Domain order reads must stay disabled without a resolved business.",
  )
}
if (
  !domainContent.includes("domains.isError") ||
  !domainContent.includes('actionLabel="Try again"')
) {
  throw new Error("Domain list failures must expose a query-only retry action.")
}
if (!domainContent.includes('className="min-h-11 self-start')) {
  throw new Error(
    "Registrar policy links must keep an accessible touch target.",
  )
}

const themeToggle = await readFile(path.join(root, required[4]), "utf8")
if (!themeToggle.includes('pathname.startsWith("/domain-management-modal")')) {
  throw new Error(
    "The floating development theme toggle must stay hidden on the domain route.",
  )
}

console.log("Mobile domain flow guard passed.")
