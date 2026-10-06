export type ApiSourceInventoryFile = Readonly<{
  path: string
  mode: "100644" | "100755"
  bytes: number
  sha256: string
}>

export type ApiSourceInventory = readonly ApiSourceInventoryFile[]

export type ApiSourceStage = Readonly<{
  stage: string
  revision: string
  inventory: ApiSourceInventory
  sourceFingerprint: string
  cleanup(): void
}>

export declare function resolveApiSourceRevision(
  repository: string,
  requestedRevision?: string,
): string

export declare function parseApiDeployArguments(
  args: string[],
  environment: "preview" | "production",
): {
  revision?: string
  prepareOnly: boolean
  verifyOnly: boolean
}

export declare function materializeCommittedApiStage(input: {
  repository: string
  revision: string
}): ApiSourceStage
