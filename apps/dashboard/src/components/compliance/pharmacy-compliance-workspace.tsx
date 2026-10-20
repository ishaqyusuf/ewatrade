import { PharmacyComplianceSetup } from "@/components/compliance/pharmacy-compliance-setup"
import { PrescriptionOperationsSetup } from "@/components/prescriptions/prescription-operations-setup"
import { PrescriptionPublicChannel } from "@/components/prescriptions/prescription-public-channel"
import { WhatsAppConnectionSetup } from "@/components/prescriptions/whatsapp-connection-setup"
import { SettingsPage } from "@/components/settings/settings-page"

export function PharmacyComplianceWorkspace({
  storeId,
  stores,
}: {
  storeId: string
  stores: Array<{ id: string; name: string }>
}) {
  return (
    <SettingsPage>
      <PharmacyComplianceSetup storeId={storeId} stores={stores} />
      <PrescriptionPublicChannel storeId={storeId} />
      <WhatsAppConnectionSetup storeId={storeId} />
      <PrescriptionOperationsSetup storeId={storeId} />
    </SettingsPage>
  )
}
