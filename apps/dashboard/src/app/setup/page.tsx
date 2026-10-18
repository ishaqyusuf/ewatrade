import { OwnerSetupEntry } from "@/components/owner-signup/owner-setup"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"

export default async function SetupPage() {
  await prefetch(trpc.tenant.ownerSignupSetup.queryOptions())
  return (
    <HydrateClient>
      <OwnerSetupEntry />
    </HydrateClient>
  )
}
