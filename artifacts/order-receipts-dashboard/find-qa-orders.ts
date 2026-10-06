import {prisma} from '../../packages/db/src/index'
import {getActiveTenantForUser} from '../../packages/db/src/queries/tenants'
for (const email of ['jawdah.owner@ishaq.qa.test','bolauuu@ishaq.qa.test','chidiuin@ishaq.qa.test']) {
 const user = await prisma.user.findUnique({where:{email}, select:{id:true}})
 if(!user) continue
 const ctx=await getActiveTenantForUser(prisma,{userId:user.id})
 if(!ctx || ctx.tenant.dataClassification!=='QA') {console.log(email,'not an available QA business');continue}
 console.log(email, ctx.tenant.name, await prisma.commercialOrder.count({where:{tenantId:ctx.tenant.id,storeId:ctx.activeStore?.id??ctx.stores[0]?.id}}))
}
await prisma.$disconnect()
