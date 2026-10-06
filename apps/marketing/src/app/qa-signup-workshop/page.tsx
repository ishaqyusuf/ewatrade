import { readFile } from "node:fs/promises"
import path from "node:path"
import { notFound } from "next/navigation"

export default async function SignupWorkshop() {
  if (process.env.NODE_ENV !== "development") notFound()
  const html = await readFile(
    path.resolve(
      process.cwd(),
      "../../artifacts/signup-onboarding-workshop/index.html",
    ),
    "utf8",
  )
  return (
    <iframe
      title="Signup and onboarding: three design directions"
      srcDoc={html}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: 0,
      }}
    />
  )
}
