---
title: "교재 그림 제작 도구"
---

# 교재 그림 제작 도구

본문은 `assets/diagrams/*.png`를 직접 표시하므로 Mermaid 플러그인이나 네트워크 연결 없이 읽을 수 있다. 같은 이름의 SVG는 벡터 원본, MMD는 편집 가능한 관계도다. 그림별 원문은 본문의 접힌 설명과 `manifest.json`에 보존한다.

`original-documents.json`과 `blocks.json`은 이번 편집 직전 47개 문서의 재현·보존 검증용 스냅샷이다. 현재 본문을 덮어쓰는 복원 명령으로 사용하지 않는다.

## 재생성

Node.js, Playwright, sharp와 headless Microsoft Edge를 사용한다. `DIAGRAM_NODE_MODULES` 환경 변수로 두 패키지가 설치된 `node_modules` 경로를 지정할 수 있다. 생략하면 Codex 번들 런타임 경로를 사용한다.

저장소 최상위에서 다음 순서로 실행한다.

```powershell
node tools/diagrams/prepare.cjs
node tools/diagrams/render.cjs
node tools/diagrams/apply.cjs
node tools/diagrams/verify.cjs
```

`prepare.cjs`는 편집 전 문서와 명시적인 선정 구간에서 변환 명세를 만든다. `render.cjs`는 한글 폰트·줄바꿈·보이지 않는 배치용 연결을 적용해 PNG/SVG, 검색 가능한 그림 모음, 검토용 축소판을 만든다. `apply.cjs`는 정확히 일치하는 원문 구간만 치환하며 이미 표시된 구간은 건너뛴다. 수정된 본문을 오래된 스냅샷으로 통째로 덮어쓰지 않는다.

`verify.cjs`는 변환 구간을 원문으로 되돌려 비교하고, 의도한 안내 문구 변경을 제외한 전체 텍스트 보존·로컬 파일 링크·PNG/SVG 생성 결과를 검사한다. `verify-svg.cjs`를 통해 저장소의 모든 SVG를 XML로 파싱하고 Edge에서 독립 파일로 직접 열어 오류를 검사한다. 본문이나 그림 원문을 추가 편집하면 그에 맞게 명세와 검증 기준도 갱신한다.

SVG는 `XMLSerializer`로 저장한다. HTML의 `outerHTML`로 저장하면 `foreignObject` 안의 `<br>` 등이 XML 규칙을 위반할 수 있다. 기존 파일의 같은 오류를 복구하려면 `node tools/diagrams/verify-svg.cjs --repair`를 실행한다. 이 명령은 XML 오류가 있는 파일만 고치고, 라벨 텍스트 보존과 독립 SVG 로딩을 확인한다.

`mermaid.min.js`는 2026-09-08 jsDelivr의 `mermaid@11/dist/mermaid.min.js`에서 받은 로컬 렌더링 라이브러리다. 외부 서버에 문서 내용을 전송하지 않으며, 재렌더링에 다운로드가 필요하지 않다. 라이선스는 함께 둔 `mermaid-LICENSE`를 참조한다.
