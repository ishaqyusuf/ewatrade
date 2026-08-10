import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type CustomerChannelWorkspace =
  RouterOutputs["serviceCommerce"]["channelWorkspace"]

export type CustomerChannelConnection =
  CustomerChannelWorkspace["connections"][number]

export type CustomerChannelStoreOption = { id: string; name: string }
