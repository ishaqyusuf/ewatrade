import { QaMaintenance } from "@/components/platform/qa-maintenance"
import { isQaForbiddenRuntime } from "@ewatrade/utils/qa-policy-server"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

/** Platform staff only (the shell gates the path); never on a Production server. */
export default function QaMaintenancePage() {
  if (isQaForbiddenRuntime()) redirect("/")
  return (
    <div className="flex min-w-0 flex-1 flex-col pt-6">
      <QaMaintenance />
    </div>
  )
}
