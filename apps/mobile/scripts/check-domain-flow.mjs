import { readFile } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const required = [
  "src/app/domain-management-modal.tsx",
  "src/components/mobile/domains/domain-management-content.tsx",
  "src/components/mobile/domains/domain-owner-form.tsx",
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

console.log("Mobile domain flow guard passed.")
