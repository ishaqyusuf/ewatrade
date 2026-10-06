import {prisma} from '../../packages/db/src/index'
import {getActiveTenantForUser} from '../../packages/db/src/queries/tenants'
import {getOrderReceiptSettings} from '../../packages/db/src/queries/order-receipts'
import {writeFileSync} from 'node:fs'
const user=await prisma.user.findUniqueOrThrow({where:{email:'jawdah.owner@ishaq.qa.test'},select:{id:true}})
const ctx=await getActiveTenantForUser(prisma,{userId:user.id})
if(!ctx || ctx.tenant.dataClassification!=='QA') throw new Error('Only QA business verification is permitted')
const storeId=ctx.activeStore?.id??ctx.stores[0]?.id
if(!storeId) throw new Error('QA Store missing')
const settings=await getOrderReceiptSettings(prisma,{tenantId:ctx.tenant.id,storeId})
writeFileSync(new URL('./saved-settings-evidence.json',import.meta.url),JSON.stringify(settings,null,2)+'\n')
console.log({source:settings.source,businessNote:settings.business.thankYouNote,storeNote:settings.override?.thankYouNote,showCustomer:settings.effective.showCustomerName,showPayments:settings.effective.showPaymentBreakdown,currencyCode:settings.currencyCode})
await prisma.$disconnect()
