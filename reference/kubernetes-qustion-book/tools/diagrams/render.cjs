const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname,'../..');
const modules = process.env.DIAGRAM_NODE_MODULES || path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium} = require(path.join(modules,'playwright'));
const sharp = require(path.join(modules,'sharp'));
const manifest = require('./manifest.json');
const esc = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const out=path.join(root,'assets/diagrams');
fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser = await chromium.launch({channel:'msedge',headless:true});
 const page = await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:2});
 await page.setContent('<html lang="ko"><meta charset="utf-8"><style>body{margin:0;background:white;font-family:"Malgun Gothic",sans-serif}#figure{display:inline-block;padding:32px;background:#f8fafc;border-top:8px solid #2563eb;box-sizing:border-box}h1{font-size:24px;line-height:1.5;color:#0f172a;margin:0 0 22px;max-width:1100px}#chart{background:white;padding:24px;border:1px solid #dbe4ef;border-radius:12px}#chart svg{display:block;max-width:none!important}footer{font-size:14px;color:#475569;margin-top:16px}svg text,svg .nodeLabel,svg .edgeLabel{font-family:"Malgun Gothic",sans-serif!important}</style><section id="figure"><h1></h1><div id="chart"></div><footer>구조 이해를 위한 개념도 · 화살표의 동사와 영역 이름을 함께 읽으세요.</footer></section></html>');
 await page.addScriptTag({path:path.join(__dirname,'mermaid.min.js')});
 await page.evaluate(()=>mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',fontFamily:'Malgun Gothic',themeVariables:{fontSize:'20px',primaryColor:'#eff6ff',primaryTextColor:'#0f172a',primaryBorderColor:'#3b82f6',lineColor:'#475569',secondaryColor:'#ecfdf5',tertiaryColor:'#f8fafc',clusterBkg:'#f1f5f9',clusterBorder:'#94a3b8',edgeLabelBackground:'#ffffff',actorBkg:'#eff6ff',actorBorder:'#3b82f6',actorTextColor:'#0f172a',noteBkgColor:'#fef3c7',noteBorderColor:'#d97706',noteTextColor:'#422006'},flowchart:{htmlLabels:true,curve:'linear',nodeSpacing:38,rankSpacing:58,padding:20,useMaxWidth:false,wrappingWidth:230},sequence:{useMaxWidth:false,wrap:true,width:175,actorMargin:40,diagramMarginX:25,diagramMarginY:20,messageMargin:45,noteMargin:18}}));
 const only=process.argv[2];
 if(only&&!manifest.some(d=>d.id===only))throw Error('Unknown diagram: '+only);
 const results=only?JSON.parse(fs.readFileSync(path.join(out,'render-report.json'),'utf8')).filter(r=>r.id!==only):[];
 const layout={
  '01-01-block-1':'API ~~~ ET ~~~ CT\nKA ~~~ P1 ~~~ P2\nCP ~~~ VPC\nVPC ~~~ EXT',
  '01-03-block-4':'K ~~~ C ~~~ S\nA ~~~ B',
  '01-06-block-2':'SRC ~~~ TEST\nTEST ~~~ DOCKER\nDOCKER ~~~ CI\nD ~~~ S ~~~ I',
  '01-07-block-2':'T ~~~ INSTALL ~~~ APP',
  '01-08-block-1':'TF ~~~ BUILD\nAPI ~~~ CT ~~~ SC ~~~ DB\nKA ~~~ CA ~~~ PA\nKB ~~~ CB ~~~ PB\nDEV ~~~ CLOUD\nCP ~~~ REG ~~~ VPC\nALB ~~~ NA',
  '01-08-block-10':'CP ~~~ INFRA\nAPP ~~~ POLICY ~~~ TEST'
 };
 for(const [i,d] of manifest.entries()){
  if(only&&d.id!==only)continue;
  fs.writeFileSync(path.join(out,d.id+'.mmd'),d.source+'\n');
  try{
   const result=await page.evaluate(async({d,i})=>{
    document.querySelector('h1').textContent=d.title;
    let source=d.source.replace(/^(\s*subgraph[^\n]+)\n/gm,'$1\n direction TB\n');
    if(d.layout)source+='\n'+d.layout;
    if(/^flowchart LR/.test(source)) source=source.replace(/^flowchart LR/,'flowchart TB');
    const {svg}=await mermaid.render('diagram'+i,source);
    document.querySelector('#chart').innerHTML=svg;
    await document.fonts.ready;
    const el=document.querySelector('#chart svg');
    const vb=el.viewBox.baseVal;
    el.setAttribute('width',Math.ceil(vb.width));el.setAttribute('height',Math.ceil(vb.height));
    document.querySelector('h1').style.maxWidth=Math.max(500,vb.width)+'px';
    const labels=[...el.querySelectorAll('.nodeLabel,.edgeLabel,text')].map(e=>e.textContent).filter(Boolean);
    // outerHTML uses HTML serialization inside foreignObject (e.g. unclosed br).
    // A standalone SVG is XML, including its embedded XHTML labels.
    const serialized=new XMLSerializer().serializeToString(el);
    const parsed=new DOMParser().parseFromString(serialized,'image/svg+xml');
    if(parsed.querySelector('parsererror'))throw Error(parsed.querySelector('parsererror').textContent);
    return {svg:serialized,width:Math.ceil(vb.width),height:Math.ceil(vb.height),labels};
   },{d:{...d,layout:layout[d.id]},i});
   fs.writeFileSync(path.join(out,d.id+'.svg'),result.svg);
   await page.locator('#figure').screenshot({path:path.join(out,d.id+'.png'),timeout:30000});
   results.push({id:d.id,width:result.width,height:result.height,labelCount:result.labels.length});
   console.log(`${i+1}/${manifest.length} ${d.id} ${result.width}x${result.height}`);
  }catch(e){console.error(d.id,e.message);throw e;}
 }
 await browser.close();
 results.sort((a,b)=>manifest.findIndex(d=>d.id===a.id)-manifest.findIndex(d=>d.id===b.id));
 fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(results,null,2));
 // Contact sheets are QA artifacts; full resolution figures are linked by the gallery.
 for(let offset=0;offset<manifest.length;offset+=12){
  const batch=manifest.slice(offset,offset+12), tiles=[];
  for(const [i,d] of batch.entries()){
   const thumb=await sharp(path.join(out,d.id+'.png')).resize(360,420,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
   const label=Buffer.from(`<svg width="390" height="36"><rect width="390" height="36" fill="#e2e8f0"/><text x="10" y="24" font-size="17" font-family="Arial">${d.id}</text></svg>`);
   tiles.push({input:thumb,left:(i%3)*400+15,top:Math.floor(i/3)*470+42},{input:label,left:(i%3)*400,top:Math.floor(i/3)*470});
  }
  await sharp({create:{width:1200,height:Math.ceil(batch.length/3)*470,channels:3,background:'#ffffff'}}).composite(tiles).png().toFile(path.join(out,`contact-${offset/12+1}.png`));
 }
 fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>교재 그림 모음</title><style>body{font-family:Malgun Gothic,sans-serif;max-width:1200px;margin:40px auto;padding:20px;color:#0f172a}article{padding:24px 0;border-bottom:2px solid #e2e8f0}img{max-width:100%;height:auto}a{color:#2563eb}p{line-height:1.7}nav{position:sticky;top:0;background:white;padding:15px;border-bottom:1px solid #ddd}input{font:inherit;padding:10px;width:80%}</style><h1>교재 그림 모음</h1><p>${manifest.length}개 그림 · 원본 PNG를 누르면 확대할 수 있습니다.</p><nav><input id="search" placeholder="제목 또는 문서 이름으로 검색" aria-label="그림 검색"></nav>${manifest.map(d=>`<article><h2>${esc(d.title)}</h2><p>${esc(d.file)} · <a href="${d.id}.svg">벡터 SVG</a> · <a href="${d.id}.mmd">편집 원본</a></p><a href="${d.id}.png"><img loading="lazy" src="${d.id}.png" alt="${esc(d.title)}"></a></article>`).join('')}<script>document.querySelector('#search').oninput=e=>document.querySelectorAll('article').forEach(a=>a.hidden=!a.textContent.toLowerCase().includes(e.target.value.toLowerCase()))</script></html>`);
}
main().catch(e=>{console.error(e);process.exit(1)});
