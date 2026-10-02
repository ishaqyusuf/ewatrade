import { PharmacyComplianceSetup } from "@/components/compliance/pharmacy-compliance-setup"
import { PrescriptionOperationsSetup } from "@/components/prescriptions/prescription-operations-setup"
import { PrescriptionPublicChannel } from "@/components/prescriptions/prescription-public-channel"
import { WhatsAppConnectionSetup } from "@/components/prescriptions/whatsapp-connection-setup"

export function PharmacyComplianceWorkspace({
  storeId,
  storeName,
}: {
  storeId: string
  storeName: string
}) {
  return (
    <div className="grid min-w-0 flex-1 content-start gap-6 pt-6">
      <PharmacyComplianceSetup storeId={storeId} storeName={storeName} />

      <nav
        aria-label="Pharmacy setup sections"
        className="flex flex-wrap gap-x-5 gap-y-2 border-y border-border py-3 text-sm"
      >
        <a className="underline underline-offset-4" href="#intake-channels">
          Intake channels
        </a>
        <a className="underline underline-offset-4" href="#operations">
          Privacy and operations
        </a>
      </nav>

      <section id="intake-channels" className="grid scroll-mt-6 gap-4">
        <div>
          <h2 className="text-lg font-semibold">Intake channels</h2>
          <p className="text-sm text-muted-foreground">
            Set up the Store's secure public link, QR code, and pharmacy-owned
            WhatsApp sender.
          </p>
        </div>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <PrescriptionPublicChannel storeId={storeId} />
          <WhatsAppConnectionSetup storeId={storeId} />
        </div>
      </section>

      <section id="operations" className="grid scroll-mt-6 gap-4">
        <div>
          <h2 className="text-lg font-semibold">Privacy and operations</h2>
          <p className="text-sm text-muted-foreground">
            Manage retention, delivery controls, privacy requests, and audited
            incident response for this Store.
          </p>
        </div>
        <PrescriptionOperationsSetup storeId={storeId} />
      </section>
    </div>
  )
}
