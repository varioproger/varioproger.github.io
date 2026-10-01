---
title: "Node.js Complete Guide"
---

# Node.js Complete Guide
### 플랫폼의 원리부터 프로덕션 분산 시스템까지

세 권의 영문 원서를 해체해 하나의 학습 경로로 재조립한 한국어 기술서 원고다.

- **Node.js Design Patterns, 3rd Ed.** (Packt, 2020) — 언어·런타임·설계 패턴
- **Distributed Systems with Node.js** (O'Reilly, 2020) — 분산·운영·프로덕션
- **Mastering Node.js** (Packt, 2013) — 코어 API 레퍼런스

모든 코드는 현대 Node.js(v20 LTS 이상) 기준으로 재작성했다. ESM, async/await, `fs/promises`, `node:test`, 글로벌 `fetch`, `AbortController`, `worker_threads`.

**총 8부 34장 + 부록 4편 / 약 194202 단어 / 예제 코드 85개 파일**

---

## 파일 구성

| 파일 | 내용 |
|---|---|
| `00-목차.md` | 전체 목차와 편집 방침 |
| `ch01.md` ~ `ch34.md` | 본문 34개 장 |
| `appendix-a.md` | 부록 A. 네이티브 애드온 |
| `appendix-b.md` | 부록 B. 환경 구축 참조 |
| `appendix-c.md` | 부록 C. 원서 대응표 |
| `appendix-d.md` | 부록 D. 한영 용어집 |
| `code/` | 실행 가능한 예제 저장소 (npm 워크스페이스) |

## 목차 개요

**제1부 · Node.js 플랫폼의 이해** — 1장 Node.js 플랫폼 / 2장 모듈 시스템 / 3장 이벤트 루프 깊이 보기

**제2부 · 비동기 제어 흐름** — 4장 콜백과 이벤트 / 5장 콜백 기반 제어 흐름 패턴 / 6장 Promise와 async/await / 7장 스트림

**제3부 · 시스템 프로그래밍** — 8장 파일 시스템 / 9장 프로세스·버퍼·OS 리소스 / 10장 네트워킹 / 11장 멀티 프로세스와 멀티 스레드

**제4부 · 설계 패턴** — 12장 생성 패턴 / 13장 구조 패턴 / 14장 행위 패턴 / 15장 고급 레시피

**제5부 · 웹 애플리케이션 구축** — 16장 웹 서버와 API 설계 / 17장 상태·세션·인증 / 18장 실시간 애플리케이션 / 19장 데이터 계층 / 20장 유니버설 JavaScript

**제6부 · 분산 시스템과 통신** — 21장 왜 분산인가 / 22장 통신 프로토콜 / 23장 메시징과 통합 패턴 / 24장 분산 프리미티브

**제7부 · 확장성과 아키텍처** — 25장 확장 전략 / 26장 리버스 프록시와 로드 밸런싱 / 27장 마이크로서비스 아키텍처 / 28장 SLA와 성능 / 29장 복원력

**제8부 · 프로덕션 운영** — 30장 테스팅 / 31장 관측성 / 32장 컨테이너와 오케스트레이션 / 33장 빌드와 배포 / 34장 보안

## 읽는 순서

처음부터 순서대로 읽는 것을 전제로 썼다. 각 장은 앞 장의 개념을 참조하고, 예제 서비스(`recipe-api`, `web-api`)를 1장에서 소개해 8부까지 점진적으로 발전시킨다.

이미 Node.js에 익숙하다면 다음 경로도 가능하다.

- **패턴만** — 1~2장 → 4~7장 → 12~15장
- **분산·운영만** — 21장 → 22~24장 → 25~29장 → 30~34장
- **원서 대조** — `appendix-c.md`의 역방향 색인으로 원서 각 장의 대응 위치를 찾을 수 있다

## 각 장의 구성

- 도입부 3~5줄
- 절마다 "왜 필요한가 → 어떻게 동작하는가 → 코드 → 실무 함정"
- `## 요약` (불릿 5~9개)
- `## 연습문제` (3문항)


---

## 예제 코드

`code/` 는 본문 예제를 실제로 돌려 볼 수 있는 npm 워크스페이스 저장소다.

```bash
cd code
npm install
npm run infra:up          # PostgreSQL, Redis, RabbitMQ, Prometheus, Grafana, Jaeger
npm test                  # 서비스 테스트 34개
node examples/ch03-event-loop/phases.js
```

| 경로 | 내용 |
|---|---|
| `code/packages/shared/` | 로깅·지표·추적·오류·HTTP 클라이언트·우아한 종료·설정 검증 |
| `code/services/recipe-api/` | 내부 프로듀서 서비스 (Fastify, PostgreSQL, Redis) |
| `code/services/web-api/` | 외부 컨슈머 서비스 (오케스트레이션, 서킷 브레이커, 레이트 리밋, SSE) |
| `code/infra/` | docker-compose, HAProxy, Nginx, Prometheus, Kubernetes 매니페스트 |
| `code/examples/` | 장별 단독 실행 예제 (3·6·7·11·24·29장) — 외부 의존성 없음 |

예제 저장소는 Node.js 22에서 검증했다. 서비스 테스트 34개 전부 통과하고, `examples/` 의 스크립트 15개 전부 정상 실행된다.
