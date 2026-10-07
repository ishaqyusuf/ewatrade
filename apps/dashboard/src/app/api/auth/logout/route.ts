import { auth } from "@ewatrade/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function POST() {
  const result = await auth.api
    .signOut({
      headers: await headers(),
    })
    .then(() => true)
    .catch(() => false)

  if (!result)
    return NextResponse.json(
      { error: "Could not sign out. Please try again." },
      { status: 502 },
    )
  return NextResponse.json({ success: true })
}
