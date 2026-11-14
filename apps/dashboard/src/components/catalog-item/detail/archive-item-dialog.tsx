"use client"
import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { useTRPC } from "@/trpc/client"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  toast,
} from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"

/** Archives the whole item after a confirm that names it; the server rechecks Catalog access. */
export function ArchiveCatalogItemDialog({
  itemId,
  itemName,
  open,
  onOpenChange,
  className,
}: {
  itemId: string
  itemName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { close } = useCatalogDetailParams()
  const mutation = useMutation(
    trpc.catalog.archiveItem.mutationOptions({
      onSuccess: async () => {
        onOpenChange(false)
        await close()
        toast.success(`${itemName} archived`)
        await queryClient.invalidateQueries({
          queryKey: trpc.catalog.pathKey(),
        })
      },
    }),
  )
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) {
          mutation.reset()
          onOpenChange(next)
        }
      }}
    >
      <AlertDialogContent className={className}>
        <AlertDialogTitle className="text-lg font-medium">
          Archive {itemName}?
        </AlertDialogTitle>
        <AlertDialogDescription className="text-muted-foreground">
          It leaves your Catalog and can’t be sold. Past orders keep it, and you
          can still find it under the Archived filter.
        </AlertDialogDescription>
        {mutation.error ? (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            Keep item
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ itemId })}
          >
            {mutation.isPending ? "Archiving…" : "Archive item"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
