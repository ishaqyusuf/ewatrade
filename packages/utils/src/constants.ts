export type Roles = string

export type ICan = Record<string, boolean | undefined> & {
  submitCustomJob?: boolean
}
