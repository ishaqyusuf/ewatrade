import { defineConfig } from "prisma/config"

// Client generation reads schema files only. Connected database commands retain
// the environment/isolation checks in prisma.config.ts.
export default defineConfig({
  schema: "prisma",
})
