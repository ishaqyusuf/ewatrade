import { notFound } from "next/navigation"
import { PasswordManagerPreview } from "./preview"
import "../signup/signup.css"

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound()
  return <PasswordManagerPreview />
}
