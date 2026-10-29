import { expect, test } from "bun:test"

for (const tracing of [false, true]) {
  test(`actual Prisma adapter retains the same bounded idle window with tracing ${tracing ? "on" : "off"}`, () => {
    // Separate process runs the real application config, generated Prisma and
    // installed adapter without global/module mocks. Construction stays lazy;
    // the unreachable socket sentinel must never be queried.
    const source = `
      const { prisma } = await import(${JSON.stringify(new URL("./client.ts", import.meta.url).href)});
      const adapter = Reflect.get(prisma, "_engineConfig").adapter;
      const config = Reflect.get(adapter, "config");
      console.log(JSON.stringify({
        idleTimeoutMillis: config.idleTimeoutMillis ?? 10_000,
        max: config.max ?? 10,
        min: config.min ?? 0,
        traced: Boolean(Reflect.get(adapter, "externalPool")),
        maxWait: Reflect.get(prisma, "_engineConfig").transactionOptions.maxWait,
        timeout: Reflect.get(prisma, "_engineConfig").transactionOptions.timeout,
      }));
      await prisma.$disconnect();
    `
    const child = Bun.spawnSync(
      [process.execPath, "--env-file=/dev/null", "-e", source],
      {
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "production",
          EWATRADE_DATABASE_URL: "postgresql://inert:inert@127.0.0.1:1/inert",
          PERFORMANCE_TRACE: String(tracing),
        },
      },
    )
    expect(child.exitCode).toBe(0)
    expect(child.stderr.toString()).toBe("")
    expect(JSON.parse(child.stdout.toString())).toEqual({
      idleTimeoutMillis: 30_000,
      max: 10,
      min: 0,
      traced: tracing,
      maxWait: 10_000,
      timeout: 30_000,
    })
  })
}
