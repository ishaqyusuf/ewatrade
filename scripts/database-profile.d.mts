export type DatabaseProfile = "local" | "remote-dev" | "prod"

export function databaseProfileForEnv(env: NodeJS.ProcessEnv): DatabaseProfile

export function applyDatabaseProfile<TEnv extends NodeJS.ProcessEnv>(
  env: TEnv,
): TEnv
