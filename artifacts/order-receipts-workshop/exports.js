/* Local fictional sample renderer. Production source authorization is not implemented here. */
window.SampleReceiptExport = (() => {
  const money = n => 'NGN ' + (n / 100).toLocaleString('en-NG', {minimumFractionDigits:2, maximumFractionDigits:2});
  const enc = new TextEncoder();
  const ascii = s => String(s).normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/([\\()])/g, '\\$1');
  function pdf(orders, options) {
    const pages=[];
    for(const o of orders) {
      const chunks=[]; for(let i=0;i<o.items.length;i+=16) chunks.push(o.items.slice(i,i+16));
      chunks.forEach((items,index)=>{
        const ops=['0.09 0.14 0.12 rg'];
        const text=(x,y,size,str)=>ops.push(`BT /F1 ${size} Tf ${x} ${y} Td (${ascii(str)}) Tj ET`);
        const line=(y)=>ops.push(`0.83 0.87 0.85 RG 0.6 w 52 ${y} m 543 ${y} l S`);
        text(52,784,23,'Jawdah Provisions');text(52,763,10,'12 Adeola Street, Lagos | +234 800 000 0000');
        text(52,720,18,'ORDER RECEIPT'); text(390,720,11,o.paid===o.total?'PAID':o.paid?'PART PAID':'UNPAID');
        line(702);text(52,684,10,o.ref);text(365,684,10,'03 Oct 2026, 10:24 AM');
        if(options.customer)text(52,660,11,'Customer: '+o.customer);
        let y=623;text(52,y,10,'ITEM');text(335,y,10,'QTY / UNIT');text(465,y,10,'AMOUNT');line(y-10);y-=37;
        for(const item of items){text(52,y,11,item.name.slice(0,40));text(335,y,10,`${item.qty} x ${money(item.unit)}`);text(452,y,11,money(item.qty*item.unit));y-=30;}
        line(y+10);y-=20;
        if(index===chunks.length-1){text(52,y,13,'Order total');text(430,y,15,money(o.total));y-=34;
          if(options.payment){text(52,y,11,'Payment received');text(430,y,11,money(o.paid));y-=24;text(52,y,11,'Balance remaining');text(430,y,11,money(o.total-o.paid));y-=28;}
          text(52,y-10,10,(options.note||'Thank you for shopping with us.').slice(0,85));text(52,y-31,9,'Keep this receipt for your records.');
        } else {text(52,y,10,'Continued on the next page');}
        text(52,43,9,`SAMPLE - FICTIONAL DATA | ${o.ref} | page ${index+1} of ${chunks.length}`);
        pages.push(ops.join('\n'));
      });
    }
    const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    const pageIds=[];for(const content of pages){const id=objects.length+1;pageIds.push(id);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id+1} 0 R >>`);objects.push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`);}
    objects[1]=`<< /Type /Pages /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
    let out='%PDF-1.4\n', offsets=[0];objects.forEach((object,i)=>{offsets.push(enc.encode(out).length);out+=`${i+1} 0 obj\n${object}\nendobj\n`;});
    const xref=enc.encode(out).length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');out+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new Blob([out],{type:'application/pdf'});
  }
  async function png(o,options) {
    const c=document.createElement('canvas');c.width=900;c.height=720+o.items.length*75+(options.customer?60:0)+(options.payment?100:0);const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
    const text=(x,y,size,str,align='left',weight='400',color='#182420')=>{g.fillStyle=color;g.font=`${weight} ${size}px Arial`;g.textAlign=align;g.fillText(str,x,y);};
    const line=y=>{g.strokeStyle='#dce2df';g.lineWidth=2;g.beginPath();g.moveTo(74,y);g.lineTo(826,y);g.stroke();};
    text(450,100,35,'Jawdah Provisions','center','600');text(450,139,20,'12 Adeola Street, Lagos','center','400','#626d69');text(450,169,20,'+234 800 000 0000','center','400','#626d69');
    line(207);text(74,257,24,'ORDER RECEIPT','left','600');text(826,257,23,o.paid===o.total?'PAID':o.paid?'PART PAID':'UNPAID','right');line(281);
    text(74,324,22,o.ref);text(826,324,20,'03 Oct 2026, 10:24 AM','right','400','#626d69');let y=377;if(options.customer){text(74,y,22,o.customer);y+=60;}
    for(const item of o.items){text(74,y,24,item.name);text(826,y,24,money(item.qty*item.unit),'right');text(74,y+31,19,`${item.qty} x ${money(item.unit)}`,'left','400','#626d69');y+=75;}
    line(y+8);y+=61;text(74,y,27,'Order total','left','600');text(826,y,31,money(o.total),'right','600');y+=60;
    if(options.payment){text(74,y,22,'Payment received');text(826,y,22,money(o.paid),'right');y+=38;text(74,y,22,'Balance remaining');text(826,y,22,money(o.total-o.paid),'right');y+=62;}
    line(y);y+=51;const words=(options.note||'Thank you for shopping with us.').split(' ');let row='';for(const w of words){g.font='22px Arial';if(g.measureText(row+w).width>720){text(450,y,22,row,'center');row='';y+=31;}row+=w+' ';}text(450,y,22,row,'center');
    text(450,c.height-95,17,'Keep this receipt for your records.','center','400','#626d69');text(450,c.height-58,16,'SAMPLE - FICTIONAL DATA','center','400','#626d69');
    return new Promise(resolve=>c.toBlob(resolve,'image/png'));
  }
  function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
  async function zip(files){const parts=[],central=[];let offset=0;for(const f of files){const name=enc.encode(f.name),bytes=new Uint8Array(await f.blob.arrayBuffer()),sum=crc(bytes);const h=new Uint8Array(30+name.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(10,0,true);v.setUint16(12,0x5d43,true);v.setUint32(14,sum,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);h.set(name,30);parts.push(h,bytes);const ch=new Uint8Array(46+name.length),cv=new DataView(ch.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(14,0x5d43,true);cv.setUint32(16,sum,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);ch.set(name,46);central.push(ch);offset+=h.length+bytes.length;}
    const size=central.reduce((n,c)=>n+c.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'});
  }
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  return {pdf,png,zip,download};
})();
