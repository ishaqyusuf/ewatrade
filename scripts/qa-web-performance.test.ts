import { describe, expect, test } from "bun:test"
import { readPerformancePhases } from "./qa-web-performance.mjs"

describe("private local navigation diagnostics", () => {
  test("accepts fixed numeric phases and excludes arbitrary or sensitive header text", () => {
    expect(
      readPerformancePhases(
        'ew_auth;dur=12.3;desc="2 calls",ew_sql;dur=4;desc="3 calls",ew_actor;dur=1;desc="private",ew_scope;dur=2;desc="private",ew_pool;dur=Infinity,ew_legal;dur=-1',
      ),
    ).toEqual({
      auth: { milliseconds: 12.3, count: 2 },
      sql: { milliseconds: 4, count: 3 },
    })
  })
})
