import { prisma } from "@ewatrade/db"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get("ewt-session")?.value

  if (token) {
    // Invalidate the session in the DB
    await prisma.session.deleteMany({ where: { token } }).catch(() => {})
  }

  const response = NextResponse.json({ success: true })
  response.cookies.delete("ewt-session")
  return response
}
