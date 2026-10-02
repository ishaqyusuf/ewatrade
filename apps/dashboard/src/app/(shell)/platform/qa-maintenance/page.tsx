import { PageHeader } from "@/components/page-header"
import { QaMaintenance } from "@/components/platform/qa-maintenance"

export default function QaMaintenancePage() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
      <PageHeader
        title="QA maintenance"
        description="Adopt test tenants, review blockers, and permanently remove marked QA data."
      />
      <QaMaintenance />
    </div>
  )
}
