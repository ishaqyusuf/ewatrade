export type EnvironmentProfile = "local" | "dev" | "preview" | "production"

export const ENVIRONMENT_FILE_BY_PROFILE: Readonly<
  Record<EnvironmentProfile, string>
>

export function environmentProfileForEnv(
  env?: NodeJS.ProcessEnv,
): EnvironmentProfile

export function envFileForProfile(profile: string): string

export function readEnvironmentFile(filePath: string): NodeJS.ProcessEnv

export function loadRootEnvironment(
  repoRoot: string,
  envSeed?: NodeJS.ProcessEnv,
): {
  env: NodeJS.ProcessEnv
  profile: EnvironmentProfile
  profileEnv: NodeJS.ProcessEnv
  profileExists: boolean
  profileFile: string
}
