const fs=require('fs'),path=require('path'),crypto=require('crypto');
const docs=require('./original-documents.json'),diagrams=require('./manifest.json');
const root=path.resolve(__dirname,'../..');
const report=[];
for(const d of docs){
 const file=d.file.replaceAll('\\','/'),items=diagrams.filter(i=>i.file===file);
 let current=fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r','');
 for(const i of items){
  const relative=path.relative(path.dirname(file),'assets/diagrams/'+i.id).replaceAll('\\','/');
  for(const ext of ['png','svg','mmd'])if(!fs.existsSync(path.join(root,'assets/diagrams',i.id+'.'+ext)))throw Error('Missing '+i.id+'.'+ext);
  if(current.includes('<!-- diagram:'+i.id+' -->'))continue;
  if(current.split(i.original).length!==2)throw Error('Source missing or ambiguous: '+i.id);
  const fallback=i.original.replace(/^```mermaid\n/,'```text\n');
  const alt=i.title.replace(/[\[\]]/g,'').replace(/`/g,'');
  const replacement=`<!-- diagram:${i.id} -->\n![${alt}](${relative}.png)\n\n[크게 보기](${relative}.png) · [SVG](${relative}.svg)\n\n<details>\n<summary>그림의 원문 설명 펼치기</summary>\n\n${fallback}\n\n</details>\n<!-- /diagram:${i.id} -->`;
  current=current.replace(i.original,replacement);
 }
 const editorial=require('./editorial.json').filter(e=>e.file===file);
 for(const e of editorial){if(!current.includes(e.after)){if(!current.includes(e.before))throw Error('Missing editorial target '+file);current=current.replace(e.before,e.after);}}
 if(items.length||editorial.length)fs.writeFileSync(path.join(root,file),current.replaceAll('\n','\r\n'));
 report.push({file,bytes:Buffer.byteLength(d.text),sha256:crypto.createHash('sha256').update(d.text).digest('hex'),diagrams:items.map(i=>i.id),decision:items.length?'흐름·구조·관계·판단 구간 이미지 치환':file.startsWith('04_')?'출처·독서 자료·기존 편집 이력: 검색·링크와 역사 기록 유지':/문제|답안|근거|점검/.test(file)?'문제·답안·배점·근거와 능동 회상 과제 유지':'목차·색인·사전·실습 안내: 탐색과 복사에 유리한 텍스트 유지'});
}
fs.writeFileSync(path.join(root,'assets/diagrams/document-audit.json'),JSON.stringify(report,null,2));
const counts=Object.fromEntries([...new Set(diagrams.map(i=>i.kind))].map(k=>[k,diagrams.filter(i=>i.kind===k).length]));
const md=`# 이미지 치환 기록\n\n2026-09-08 · 편집 전 Markdown ${docs.length}개 전체를 읽어 구조·코드 블록·표·설명 구간을 분석했다.\n\n${report.filter(r=>r.diagrams.length).length}개 문서의 ${diagrams.length}개 구간을 PNG 이미지로 치환했다. ${Object.entries(counts).map(([k,v])=>k+' '+v+'개').join(', ')}.\n\n[그림 전체 보기](../assets/diagrams/index.html) · [파일별 분석 기록](../assets/diagrams/document-audit.json) · [렌더링 결과](../assets/diagrams/render-report.json)\n\n각 그림 아래의 접힌 원문에는 치환 전 내용을 보존했다. YAML·명령·문제·답안·배점·출처·탐색용 링크와 필드 사전은 텍스트로 유지한다. 화살표는 원문의 생성·관찰·소유·참조·통신 의미를 구분하며, 네트워크·권한·용량에 관한 단서와 예외는 본문 및 접힌 원문에서 읽는다. 과거 검증 기록은 당시 이력이므로 그대로 두었다. 이번 그림 생성은 실제 Kubernetes/EKS 실행 검증이 아니다.\n\nPNG는 한글 폰트를 사용해 2배 해상도로 렌더링했다. SVG와 Mermaid 편집 원본도 같은 폴더에 있다.\n\n## 문서별 판단\n\n| 문서 | 이미지 수 | 판단 |\n|---|---:|---|\n${report.map(r=>`| [${r.file}](../${r.file}) | ${r.diagrams.length} | ${r.decision} |`).join('\n')}\n`;
fs.writeFileSync(path.join(root,'04_참고자료/03_이미지_치환_기록.md'),md);
console.log(JSON.stringify({documents:docs.length,changed:report.filter(r=>r.diagrams.length).length,diagrams:diagrams.length,counts},null,2));
