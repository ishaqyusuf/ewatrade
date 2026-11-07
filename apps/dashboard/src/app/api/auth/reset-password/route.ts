import { handlePasswordRecovery } from "@/lib/password-recovery"

export const runtime = "nodejs"

export function POST(request: Request) {
  return handlePasswordRecovery(request, "reset")
}
