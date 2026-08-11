import { QaMaintenance } from "@/components/platform/qa-maintenance"

export default function QaMaintenancePage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          QA maintenance
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Adopt test tenants, review blockers, and permanently remove marked QA
          data.
        </p>
      </div>
      <QaMaintenance />
    </div>
  )
}
