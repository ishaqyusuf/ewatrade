import {prisma} from '../../packages/db/src/index'
import {getActiveTenantForUser} from '../../packages/db/src/queries/tenants'
import {getOrderReceipts} from '../../packages/db/src/queries/order-receipts'
import {renderOrderReceipts} from '../../packages/order-receipts/src/pdf'
import {writeFileSync} from 'node:fs'
const user=await prisma.user.findUniqueOrThrow({where:{email:'jawdah.owner@ishaq.qa.test'},select:{id:true}})
const ctx=await getActiveTenantForUser(prisma,{userId:user.id})
if(!ctx || ctx.tenant.dataClassification!=='QA') throw new Error('QA only')
const storeId=ctx.activeStore?.id??ctx.stores[0]?.id
if(!storeId) throw new Error('Store required')
const ids=(await prisma.commercialOrder.findMany({where:{tenantId:ctx.tenant.id,storeId,clientOrderId:{startsWith:'receipt-dashboard-qa-order-'}},select:{id:true},orderBy:{orderNumber:'asc'}})).map(order=>order.id)
const receipts=await getOrderReceipts(prisma,{tenantId:ctx.tenant.id,storeId,orderIds:ids})
console.log(receipts.map(receipt=>({order:receipt.orderNumber,status:receipt.paymentLabel,totalMinor:receipt.totalMinor,source:receipt.settingsSource})))
writeFileSync(new URL('./source-projection.json',import.meta.url),JSON.stringify(receipts,null,2)+'\n')
writeFileSync(new URL('./source-export.pdf',import.meta.url),await renderOrderReceipts(receipts))
console.log('Authorized source export verified')
await prisma.$disconnect()
