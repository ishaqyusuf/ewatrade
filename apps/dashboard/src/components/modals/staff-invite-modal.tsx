"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import { StaffInviteContent } from "@/components/staff/staff-invite-content"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { useStaffParams } from "@/hooks/use-staff-params"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ewatrade/ui"

export function StaffInviteModal({
  storeId,
  onInvited,
}: {
  storeId: string
  onInvited: (qaInviteUrl: string | null) => Promise<void>
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
        <DialogContent className="max-w-[455px]">
          <div className="p-4">
            <DialogHeader className="mb-6 pr-8">
              <DialogTitle className="mb-4 text-lg font-semibold leading-none tracking-tight">
                Invite staff
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Cashier, operator, or manager access
              </DialogDescription>
            </DialogHeader>
            {closeError ? (
              <FormFeedback appearance="dashboard">{closeError}</FormFeedback>
            ) : null}
            <StaffInviteContent
              key={storeId}
              onClose={close}
              onInvited={onInvited}
            />
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
