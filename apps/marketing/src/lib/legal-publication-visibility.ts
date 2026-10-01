/** Keep unapproved legal text inside review environments. */
export function shouldWithholdDraftLegalContent(
  approved: boolean,
  env: { APP_ENV?: string; VERCEL_ENV?: string } = {
    APP_ENV: process.env.APP_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  },
) {
  return (
    !approved &&
    (env.APP_ENV === "production" || env.VERCEL_ENV === "production")
  )
}
