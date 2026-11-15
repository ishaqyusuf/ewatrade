"use client"

import { PharmacyComplianceSetup } from "@/components/compliance/pharmacy-compliance-setup"
import { PrescriptionOperationsSetup } from "@/components/prescriptions/prescription-operations-setup"
import { PrescriptionPublicChannel } from "@/components/prescriptions/prescription-public-channel"
import { WhatsAppConnectionSetup } from "@/components/prescriptions/whatsapp-connection-setup"
import { SettingsPage } from "@/components/settings/settings-page"
import { Tabs, TabsList, TabsTrigger } from "@ewatrade/ui"
import { parseAsStringLiteral, useQueryState } from "nuqs"

const TABS = ["setup", "link", "records"] as const

/**
 * Pharmacy compliance in three tabs (?tab=), so a phone shows one part at a
 * time: how the pharmacy works, how customers reach it, delivery and records.
 */
export function PharmacyComplianceWorkspace({
  storeId,
  stores,
}: {
  storeId: string
  stores: Array<{ id: string; name: string }>
}) {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS).withDefault("setup"),
  )
  return (
    <SettingsPage>
      <PharmacyComplianceSetup
        showSetup={tab === "setup"}
        storeId={storeId}
        stores={stores}
        tabs={
          <Tabs
            className="min-w-0"
            value={tab}
            onValueChange={(value) =>
              void setTab(value as (typeof TABS)[number])
            }
          >
            <TabsList
              variant="line"
              className="w-full justify-start overflow-x-auto"
            >
              <TabsTrigger value="setup">Setup</TabsTrigger>
              <TabsTrigger value="link">Link and WhatsApp</TabsTrigger>
              <TabsTrigger value="records">Delivery and records</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {tab === "link" ? (
        <>
          <PrescriptionPublicChannel storeId={storeId} />
          <WhatsAppConnectionSetup storeId={storeId} />
        </>
      ) : null}
      {tab === "records" ? (
        <PrescriptionOperationsSetup storeId={storeId} />
      ) : null}
    </SettingsPage>
  )
}
