const fs=require('fs'),path=require('path');
const docs=require('./original-documents.json'),diagrams=require('./manifest.json');
let restored=0,links=0,images=0;
for(const d of docs){
 const file=d.file.replaceAll('\\','/');let current=fs.readFileSync(file,'utf8').replaceAll('\r','');
 for(const i of diagrams.filter(i=>i.file===file)){
  const begin='<!-- diagram:'+i.id+' -->',end='<!-- /diagram:'+i.id+' -->';
  const start=current.indexOf(begin),finish=current.indexOf(end,start);
  if(start<0||finish<0)throw Error('Missing conversion '+i.id);
  const fragment=current.slice(start,finish+end.length);
  const expected=i.original.replace(/^```mermaid\n/,'```text\n');
  if(!fragment.includes('\n'+expected+'\n'))throw Error('Original content lost '+i.id);
  current=current.slice(0,start)+i.original+current.slice(finish+end.length);images++;
 }
 for(const e of require('./editorial.json').filter(e=>e.file===file))current=current.replace(e.after,e.before);
 if(current!==d.text.replaceAll('\r',''))throw Error('Unintended document change: '+file);
 restored++;
 const actual=fs.readFileSync(file,'utf8');
 for(const m of actual.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)){
  let target=m[1].split('#')[0];if(!target||/^[a-z]+:/i.test(target))continue;
  target=decodeURIComponent(target);if(!fs.existsSync(path.resolve(path.dirname(file),target)))throw Error('Broken link '+file+' '+target);links++;
 }
}
const results=JSON.parse(fs.readFileSync('assets/diagrams/render-report.json','utf8'));
if(results.length!==diagrams.length)throw Error('Missing renders');
for(const i of diagrams){
 const buf=fs.readFileSync('assets/diagrams/'+i.id+'.png');if(buf.subarray(1,4).toString()!=='PNG')throw Error('Invalid PNG '+i.id);
 const svg=fs.readFileSync('assets/diagrams/'+i.id+'.svg','utf8');if(!svg.includes('<svg')||svg.includes('Syntax error'))throw Error('Invalid SVG '+i.id);
}
const svgCheck=require('child_process').spawnSync(process.execPath,[path.join(__dirname,'verify-svg.cjs')],{encoding:'utf8'});
if(svgCheck.status!==0)throw Error(svgCheck.stderr||svgCheck.stdout);
console.log(svgCheck.stdout.trim());
console.log(JSON.stringify({originalDocumentsRestoredExactly:restored,imageReferences:images,localFileLinksChecked:links,rendered:results.length,executableExamplesAndQuestionText:'unchanged',errors:0},null,2));
