import {validOversightKey} from "./verify-key"
import { prisma } from "@ewatrade/db"
import { oversightSummary, oversightBusinesses, oversightUsers, oversightRecords } from "@ewatrade/db/oversight"
import { Hono } from "hono"
import { z } from "zod"
export const oversightRoutes=new Hono()
oversightRoutes.use("*",async(c,next)=>{c.header("Cache-Control","no-store");if(!validOversightKey(c.req.header("Authorization")?.replace(/^Bearer /,""),process.env.OVERSIGHT_READ_KEY))return c.json({error:"Unauthorized"},401);await next()})
const list=z.object({search:z.string().trim().max(100).default(""),cursor:z.string().max(200).optional()})
oversightRoutes.get("/summary",async c=>{const result=z.coerce.number().int().refine(n=>[7,30,90].includes(n)).safeParse(c.req.query("days")??30);if(!result.success)return c.json({error:"Invalid period"},400);return c.json(await oversightSummary(prisma,result.data))})
for(const [path,query] of [["businesses",oversightBusinesses],["users",oversightUsers],["records",oversightRecords]] as const){oversightRoutes.get(`/${path}`,async c=>{const parsed=list.safeParse(c.req.query());if(!parsed.success)return c.json({error:"Invalid filters"},400);return c.json(await query(prisma,parsed.data.search,parsed.data.cursor))})}
