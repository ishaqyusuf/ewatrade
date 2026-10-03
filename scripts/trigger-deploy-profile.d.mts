type TriggerEnvironment = Record<string, string | undefined>

export const TRIGGER_JOB_ENV_KEYS: readonly string[]
export function triggerProjectForEnv(env: TriggerEnvironment): string
export function assertTriggerDeployProfile(env: TriggerEnvironment): void
export function selectedTriggerDeployEnvironment(
  env: TriggerEnvironment,
  selected: TriggerEnvironment,
  production: TriggerEnvironment,
): TriggerEnvironment
export function triggerDeployCommand(
  command: string[],
  env: TriggerEnvironment,
): string[]
export function syncedTriggerJobEnvironment(
  env: TriggerEnvironment,
): Record<string, string>
