import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { config } from "dotenv"
import { defineConfig, env } from "prisma/config"

const configFilePath = fileURLToPath(import.meta.url)
const configDirectory = dirname(configFilePath)

config({
  path: resolve(configDirectory, "../../.env")
})

export default defineConfig({
  schema: "./prisma",
  migrations: {
    path: "./prisma/migrations"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
})
