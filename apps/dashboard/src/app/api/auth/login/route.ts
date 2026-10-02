import { auth } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"

const loginSchema = z.object({ email: z.email(), password: z.string().min(1) })

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 400 },
    )
  }
  const result = await auth.api
    .signInEmail({
      body: {
        email: parsed.data.email.toLowerCase(),
        password: parsed.data.password,
      },
      headers: request.headers,
      returnHeaders: true,
    })
    .catch(() => null)
  if (!result?.response.user?.id) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    )
  }
  const membership = await prisma.membership.findFirst({
    where: {
      userId: result.response.user.id,
      status: "ACTIVE",
      tenant: { isActive: true },
    },
    select: { id: true },
  })
  if (!membership) {
    return NextResponse.json(
      {
        error:
          "Your account does not have an active workspace. Contact your workspace owner or request early access.",
      },
      { status: 403 },
    )
  }
  const response = NextResponse.json({ success: true, dashboardUrl: "/" })
  for (const cookie of result.headers.getSetCookie()) {
    response.headers.append("Set-Cookie", cookie)
  }
  return response
}
