"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import { StaffInviteContent } from "@/components/staff/staff-invite-content"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { useStaffParams } from "@/hooks/use-staff-params"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ewatrade/ui"

/** Invite is a modal, as Midday's invite members (ADR-0049, ADR-0070). */
export function StaffInviteModal({
  businessName,
  storeId,
  stores,
  storeAccessReady,
  onInvited,
}: {
  businessName: string
  storeId: string
  stores: Array<{ id: string; name: string }>
  storeAccessReady: boolean
  onInvited: (contact: string, qaInviteUrl: string | null) => Promise<void>
}) {
  const { inviteOpen, setInviteOpen } = useStaffParams()
  const close = () => setInviteOpen(false)
  const { closeError, requestClose } = useSheetDismissal(close)
  return (
    <Dialog
      open={inviteOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose()
      }}
    >
      {inviteOpen ? (
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[calc(100dvh-2rem)] max-w-[480px] overflow-y-auto"
        >
          <div className="p-4">
            <DialogHeader className="mb-6 pr-8">
              <DialogTitle className="text-lg font-semibold leading-none tracking-tight">
                Invite staff to {businessName}
              </DialogTitle>
            </DialogHeader>
            {closeError ? (
              <FormFeedback appearance="dashboard">{closeError}</FormFeedback>
            ) : null}
            <StaffInviteContent
              key={storeId}
              storeId={storeId}
              stores={stores}
              storeAccessReady={storeAccessReady}
              onClose={close}
              onInvited={onInvited}
            />
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
