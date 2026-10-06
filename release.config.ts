// `bun release` (local-infra-kit). On main it releases Production; on any other
// branch, or with --preview, it releases Preview. Each part is released only when
// its files changed since that part's last release (tags release/<env>/<part>).
const team = "team_BV5rgKHJH4fMyFL1YfscZIZK"

export default {
  project: "ewatrade",
  components: [
    {
      // Runs first, before any new code goes live. Production asks for confirmation.
      name: "database",
      paths: ["packages/db/prisma/**", "packages/db/prisma.config.ts"],
      sharedPaths: false,
      beforePush: true,
      deploy: {
        preview: "bun run db:push --preview",
        production: "bun run db:push --prod",
      },
    },
    {
      // Vercel builds these from the Git push; the release waits until Ready.
      name: "dashboard",
      app: "apps/dashboard",
      vercel: { team, projects: ["ewatrade-dashboard"] },
    },
    {
      name: "marketing",
      app: "apps/marketing",
      vercel: { team, projects: ["ewatrade-marketing"] },
    },
    {
      // Deployed from the command line from the exact released commit.
      name: "api",
      app: "apps/api",
      paths: [
        "scripts/deploy-api.mjs",
        "scripts/deploy-api-preview.mjs",
        "scripts/build-api-vercel.mjs",
        "scripts/release-api-*.mjs",
        "scripts/release-vercel-deployment-output.mjs",
      ],
      deploy: {
        preview: "bun run api:preview:deploy --revision {sha}",
        production: "bun run api:deploy --revision {sha}",
      },
      vercel: { team, projects: ["ewatrade-api"] },
    },
    {
      // Trigger syncs env vars from the env files on every deploy.
      name: "jobs",
      app: "packages/jobs",
      paths: [
        "scripts/trigger-deploy-profile.mjs",
        "scripts/with-trigger-profile.mjs",
        "scripts/release-trigger-target.mjs",
      ],
      deploy: {
        preview: "bun run jobs:preview:deploy",
        production: "bun run jobs:deploy",
      },
    },
    {
      // OTA update when a build with the same native fingerprint exists on the
      // channel; otherwise a new build.
      name: "mobile",
      expo: {
        appDir: "apps/mobile",
        platforms: ["android"],
        update: {
          preview:
            "bun run eas:update --preview --platform {platforms} --expected-commit {sha}",
          production:
            "bun run eas:update --prod --platform {platforms} --expected-commit {sha}",
        },
        build: {
          // Preview builds wait so the in-app APK download can be published.
          preview:
            "bun run eas:build --preview --platform {platform} --expected-commit {sha} --non-interactive",
          production:
            "bun run eas:build --prod --platform {platform} --expected-commit {sha} --non-interactive --no-wait",
        },
      },
    },
  ],
}
