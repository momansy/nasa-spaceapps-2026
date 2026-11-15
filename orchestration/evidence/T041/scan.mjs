import fs from 'node:fs';
const lang=process.argv[2], re=new RegExp(process.argv[3],'iu');
for(const d of ['data/strings','client/src/i18n/strings'])for(const f of fs.readdirSync(d))if(f.startsWith(lang+'.')){
 const o=JSON.parse(fs.readFileSync(d+'/'+f,'utf8'));
 for(const [k,v] of Object.entries(o)) if(typeof v==='string'&&re.test(v)) console.log(f.replace(lang+'.',''),k,'|',v.slice(0,150));}
