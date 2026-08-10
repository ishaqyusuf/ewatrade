export type DatabaseProfile = "local" | "dev" | "preview" | "prod"

export function databaseProfileForEnv(env: NodeJS.ProcessEnv): DatabaseProfile

export function directDatabaseUrlForPrismaCli(databaseUrl: string): string

export function applyDatabaseProfile<TEnv extends NodeJS.ProcessEnv>(
  env: TEnv,
  productionDatabaseUrl?: string,
): TEnv

export function loadProductionDatabaseUrl(repoRoot: string): string | undefined
