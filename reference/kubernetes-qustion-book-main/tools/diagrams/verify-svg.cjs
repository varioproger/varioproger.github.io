const fs=require('fs'),path=require('path');
const {pathToFileURL}=require('url');
const modules=process.env.DIAGRAM_NODE_MODULES || path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(path.join(modules,'playwright'));
const root=path.resolve(__dirname,'../..');
function find(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name.startsWith('.')?[]:e.isDirectory()?find(path.join(dir,e.name)):e.name.endsWith('.svg')?[path.join(dir,e.name)]:[]);}
async function main(){
 const files=find(root), repair=process.argv.includes('--repair');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 let fixed=0;const failures=[],connectionChecks=[];
 try{
  const page=await browser.newPage();
  for(const file of files){
   const source=fs.readFileSync(file,'utf8');
   const result=await page.evaluate(({source,repair})=>{
    const parser=new DOMParser();
    const doc=parser.parseFromString(source,'image/svg+xml');
    const error=doc.querySelector('parsererror');
    if(!error)return {valid:true};
    if(!repair)return {error:error.textContent};
    // Recover the original browser DOM, then serialize SVG + XHTML as XML.
    const html=parser.parseFromString(source,'text/html');
    const svg=html.querySelector('svg');if(!svg)return {error:'No SVG root'};
    const serialized=new XMLSerializer().serializeToString(svg);
    const checked=parser.parseFromString(serialized,'image/svg+xml');
    if(checked.querySelector('parsererror'))return {error:checked.querySelector('parsererror').textContent};
    const labels=el=>[...el.querySelectorAll('.nodeLabel,.edgeLabel,text')].map(n=>n.textContent);
    if(JSON.stringify(labels(svg))!==JSON.stringify(labels(checked.documentElement)))return {error:'Label content changed'};
    return {serialized,originalError:error.textContent};
   },{source,repair});
   if(result.error){failures.push({file:path.relative(root,file),error:result.error});continue;}
   if(result.serialized){fs.writeFileSync(file,result.serialized);fixed++;}
   // Load as an actual standalone image/svg+xml document, not embedded HTML.
   await page.goto(pathToFileURL(file).href);
   const loaded=await page.evaluate(()=>{
    const edges=[...document.querySelectorAll('.flowchart-link,.messageLine0,.messageLine1')];
    const visible=edges.filter(e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&Number(s.strokeOpacity)>0&&parseFloat(s.strokeWidth)>0&&s.stroke!=='none'&&s.stroke!=='transparent'&&s.stroke!=='rgba(0, 0, 0, 0)';});
    return {error:document.querySelector('parsererror')?.textContent,root:document.documentElement.localName,width:document.documentElement.getBoundingClientRect().width,edges:edges.length,visibleEdges:visible.length};
   });
   if(loaded.error||loaded.root!=='svg'||loaded.width<=0)failures.push({file:path.relative(root,file),...loaded});
   const mmd=file.replace(/\.svg$/,'.mmd');
   const definition=fs.existsSync(mmd)?fs.readFileSync(mmd,'utf8').replace(/"[^"\n]*"/g,'""'):'';
   const expectsConnections=/-->|---|==>|-\.->|->>|-->>/.test(definition);
   connectionChecks.push({file:path.relative(root,file),expectsConnections,visibleEdges:loaded.visibleEdges,layoutOnlyEdges:loaded.edges-loaded.visibleEdges});
   if(expectsConnections&&loaded.visibleEdges===0)failures.push({file:path.relative(root,file),error:'Defined connections are not visible'});
  }
 }finally{await browser.close();}
 console.log(JSON.stringify({svgFilesChecked:files.length,repaired:fixed,standaloneBrowserLoads:files.length-failures.length,connectionDiagrams:connectionChecks.filter(c=>c.expectsConnections).length,withoutDefinedConnections:connectionChecks.filter(c=>!c.expectsConnections),failures},null,2));
 if(failures.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
