// Next development access logs otherwise print setup/verification capabilities
// from request URLs. Do not log these selected routes, including a base path.
export const onboardingRequestLogIgnore = [
  /(?:^|\/)(?:signup|api\/early-access\/(?:session|verify|approve))(?:\/?\?|\/?$)/,
]

export const onboardingSignupResponseHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
]
