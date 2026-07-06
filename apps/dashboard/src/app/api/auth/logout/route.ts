import { auth } from "@ewatrade/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function POST() {
  await auth.api
    .signOut({
      headers: await headers(),
    })
    .catch(() => null)

  return NextResponse.json({ success: true })
}
