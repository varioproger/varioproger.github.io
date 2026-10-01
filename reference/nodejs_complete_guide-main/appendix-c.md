# 부록 C. 원서 대응표

이 책은 세 권의 영문 원서를 해체해 하나의 학습 경로로 재조립한 결과다. 이 부록은 그 재조립의 설계도다. 원서를 함께 보며 읽는 독자를 위해 어느 장이 어디에서 왔는지, 무엇을 버렸고 왜 버렸는지를 밝힌다.

## C.1 원서 약칭

| 약칭 | 원서 | 출간 |
|---|---|---|
| **DP** | Node.js Design Patterns, 3rd Edition (Mario Casciaro, Luciano Mammino) | Packt, 2020 |
| **DS** | Distributed Systems with Node.js (Thomas Hunter II) | O'Reilly, 2020 |
| **MN** | Mastering Node.js (Sandro Pasquali) | Packt, 2013 |

## C.2 이 책 → 원서 대응표

| 이 책 | 주 출처 | 보조 출처 | 재구성 방식 |
|---|---|---|---|
| 1장. Node.js 플랫폼 | DP 1장 | MN 1장, DS 1장 | DP의 리액터 패턴 설명을 뼈대로 삼고, MN의 V8·메모리 절과 DS의 예제 서비스 소개를 병합 |
| 2장. 모듈 시스템 | DP 2장 | MN 부록 A | DP 2장이 거의 그대로 대응. MN 부록 A의 npm 부분은 33장으로 이동 |
| 3장. 이벤트 루프 깊이 보기 | MN 2장 | DP 1장, DS 1장 | 세 권에 흩어진 이벤트 루프 서술을 한 장으로 통합. 진단 절(3.6)은 신규 |
| 4장. 콜백과 이벤트 | DP 3장 | MN 2장 | DP 3장 대응. AbortSignal 기반 리스너 정리는 신규 |
| 5장. 콜백 기반 제어 흐름 | DP 4장 | — | DP 4장 대응. 5.6(레거시 대응 전략)은 신규 |
| 6장. Promise와 async/await | DP 5장 | — | DP 5장 대응. 6.9(AbortController)는 신규 |
| 7장. 스트림 | DP 6장 | MN 3장 | DP 6장을 뼈대로, MN 3장의 HTTP 스트림 활용을 흡수. 7.10(Web Streams)은 신규 |
| 8장. 파일 시스템 | MN 4장 | — | MN 4장의 콜백 API 나열을 `fs/promises` 기준으로 전면 재작성. 8.8(원자적 쓰기)은 신규 |
| 9장. 프로세스·버퍼·OS | MN 1장, 7장 | DS 8장 | 흩어져 있던 process·Buffer 서술을 통합. 9.3(우아한 종료)과 9.4~9.5(Buffer/인코딩)는 대폭 확장 |
| 10장. 네트워킹 | MN 3장, 8장 | DS 2장 | MN의 HTTP·UDP 서술을 유지하되 클라이언트 절은 `fetch`/undici로 교체. 10.8(DNS)은 신규 |
| 11장. 멀티 프로세스·스레드 | MN 7장 | DP 11장 | MN의 child_process와 DP의 CPU 바운드 레시피를 결합. 11.4~11.5(worker_threads, Atomics)는 신규 |
| 12장. 생성 패턴 | DP 7장 | — | DP 7장 대응 |
| 13장. 구조 패턴 | DP 8장 | — | DP 8장 대응. LevelUP 예제는 일반적인 키-값 저장소로 교체 |
| 14장. 행위 패턴 | DP 9장 | — | DP 9장 대응 |
| 15장. 고급 레시피 | DP 11장 | — | DP 11장에서 CPU 바운드 절을 11장으로 옮기고, 15.6(재시도·타임아웃·데드라인)을 신규 추가 |
| 16장. 웹 서버와 API 설계 | MN 5장 | DP 9장 | MN의 라우팅 서술을 뼈대로 Fastify·스키마 검증·오류 규약을 신규 추가 |
| 17장. 상태·세션·인증 | MN 5장 | DS 10장 | MN의 세션·인증 절을 현대 기준으로 재작성. JWT 트레이드오프 논의는 신규 |
| 18장. 실시간 애플리케이션 | MN 6장 | DP 13장 | MN 6장 대응. AJAX·주식 티커 예제는 삭제하고 SSE·WebSocket 중심으로 재편. CRDT 절은 신규 |
| 19장. 데이터 계층 | DS 8장 | MN 5장, 8장 | DS의 Knex·Memcached 절과 MN의 Redis 절을 통합. 19.3(무중단 마이그레이션)은 대폭 확장 |
| 20장. 유니버설 JavaScript | DP 10장 | — | DP 10장 대응. React 튜토리얼 성격을 줄이고 원리 중심으로 재편 |
| 21장. 왜 분산인가 | DS 1장 | DP 12장 | DS 1장 대응. 가용성 곱셈 계산은 신규 |
| 22장. 통신 프로토콜 | DS 2장 | — | DS 2장 대응 |
| 23장. 메시징과 통합 패턴 | DP 13장 | MN 8장 | DP 13장을 뼈대로 MN의 RabbitMQ 절을 흡수 |
| 24장. 분산 프리미티브 | DS 9장 | — | DS 9장 대응. 24.5(분산 락의 위험)와 24.6(레이트 리미터)은 대폭 확장 |
| 25장. 확장 전략 | DP 12장 | DS 3장, MN 8장 | 세 권의 cluster·확장 서술을 통합. 25.6(프로세스 매니저 vs 오케스트레이터)은 신규 |
| 26장. 리버스 프록시·로드 밸런싱 | DS 3장 | MN 8장, DP 12장 | DS의 HAProxy와 MN의 Nginx를 병렬 제시 |
| 27장. 마이크로서비스 | DP 12장 | DS 1장 | DP 12장 후반부 대응. 27.5(데이터 소유권)·27.6(분리하지 말아야 할 때)은 대폭 확장 |
| 28장. SLA와 성능 | DS 3장 | MN 8장 | DS의 부하 테스트 절을 뼈대로 28.1(백분위수)·28.5(프로파일링)·28.6(병목 목록)을 신규 추가 |
| 29장. 복원력 | DS 8장 | — | DS 8장 대응. 스키마 마이그레이션 절은 19장으로 이동 |
| 30장. 테스팅 | MN 9장 | DS 6장 | MN 9장의 도구를 전면 교체해 사실상 재집필 |
| 31장. 관측성 | DS 4장 | — | DS 4장 대응. Zipkin 단독 서술을 OpenTelemetry 기준으로 재작성 |
| 32장. 컨테이너·오케스트레이션 | DS 5장, 7장 | DP 12장 | 두 장을 하나로 통합. 32.10(컨테이너 안의 Node.js)은 신규 |
| 33장. 빌드와 배포 | DS 6장 | MN 부록 A | Travis CI를 GitHub Actions로 교체. 33.7(배포 전략)은 신규 |
| 34장. 보안 | DS 10장 | — | DS 10장 대응. 34.2(공격 표면)·34.7(권한 모델)·34.8(체크리스트)은 대폭 확장 |
| 부록 A. 네이티브 애드온 | MN 부록 C | — | V8 직접 호출 예제를 Node-API 기준으로 재작성. WebAssembly 절은 신규 |
| 부록 B. 환경 구축 | DS 부록 A·B·C | — | 통합 후 Node 버전 관리와 예제 인프라 구성을 추가 |

## C.3 원서 → 이 책 역방향 색인

### Node.js Design Patterns, 3rd Ed.
| 원서 장 | 이 책 |
|---|---|
| 1. The Node.js Platform | 1장, 3장 |
| 2. The Module System | 2장 |
| 3. Callbacks and Events | 4장 |
| 4. Async Control Flow with Callbacks | 5장 |
| 5. Async Control Flow with Promises | 6장 |
| 6. Coding with Streams | 7장 |
| 7. Creational Design Patterns | 12장 |
| 8. Structural Design Patterns | 13장 |
| 9. Behavioral Design Patterns | 14장, 16.3 |
| 10. Universal JavaScript | 20장 |
| 11. Advanced Recipes | 15장, 11.6 |
| 12. Scalability and Architectural Patterns | 25장, 27장, 32.6~32.9 |
| 13. Messaging and Integration Patterns | 23장 |

### Distributed Systems with Node.js
| 원서 장 | 이 책 |
|---|---|
| 1. Why Distributed? | 21장, 1.3, 3장 |
| 2. Protocols | 22장 |
| 3. Scaling | 25장, 26장, 28장 |
| 4. Observability | 31장 |
| 5. Containers | 32.1~32.5 |
| 6. Deployments | 33장, 30.7 |
| 7. Container Orchestration | 32.6~32.10 |
| 8. Resilience | 29장, 19.1~19.3 |
| 9. Distributed Primitives | 24장 |
| 10. Security | 34장 |
| 부록 A·B·C | 부록 B |

### Mastering Node.js
| 원서 장 | 이 책 |
|---|---|
| 1. Understanding the Node Environment | 1장, 9.1 |
| 2. Async Event-Driven Programming | 3장, 4장 |
| 3. Streaming Data | 7장, 10.2~10.6 |
| 4. Using Node to Access the Filesystem | 8장 |
| 5. Managing Many Client Connections | 16장, 17장 |
| 6. Creating Real-time Applications | 18장 |
| 7. Utilizing Multiple Processes | 11장 |
| 8. Scaling Your Application | 25장, 26장, 23.5, 10.7 |
| 9. Testing your Application | 30장 |
| 부록 A. Organizing Your Work | 2장, 33.3~33.4 |
| 부록 B. Path Framework | 제외 |
| 부록 C. C++ Add-ons | 부록 A |

## C.4 제외한 내용과 그 이유

원서에 있으나 이 책에서 다루지 않기로 한 것들이다. 판단 근거를 함께 밝힌다.

**MN 부록 B — Path 프레임워크**
저자가 만든 개인 프레임워크로, 현재 유지보수되지 않는다. 이 책의 어떤 개념도 이 프레임워크에 의존하지 않는다.

**MN 8장 — AWS S3·DynamoDB·SES 절, Facebook Connect 인증**
특정 벤더의 구버전 SDK 사용법이라 수명이 짧고, 이 책이 지향하는 벤더 중립성과 맞지 않는다. 객체 스토리지의 원리는 19.6에서 S3 호환 인터페이스로 다루고, 서드파티 인증의 원리는 17.4에서 다룬다.

**MN 9장 — Grunt, PhantomJS, ZombieJS**
셋 모두 개발이 중단되었다. 태스크 러너의 역할은 npm scripts와 CI 파이프라인(33장)이 대체했고, 헤드리스 브라우저 테스트는 Playwright 계열이 대체했다.

**MN 9장 — `domain` 모듈**
Node.js에서 공식적으로 지원 중단(deprecated)된 API다. 비동기 컨텍스트 추적이라는 목적은 `AsyncLocalStorage`가 대체했으며, 31.2에서 상관관계 ID 전파에 사용한다.

**MN 2장·4장 — 콜백 기반 fs API의 함수별 나열**
`fs.chown`, `fs.lchmod` 같은 함수를 하나씩 나열하는 방식은 공식 문서가 더 정확하고 최신이다. 이 책은 8장에서 선택 기준과 사용 패턴을 다루고, 개별 함수 시그니처는 공식 문서를 참조하도록 안내한다.

**DS 6장 — Travis CI, Heroku 배포**
두 서비스 모두 이 책이 쓰인 시점에는 원서 집필 당시와 무료 정책·시장 지위가 크게 달라졌다. 33장에서 GitHub Actions를 예시로 쓰되, 파이프라인 단계 자체는 도구 중립적으로 서술했다.

**DS 4장 — Cabot 알림 도구, Twilio 계정 생성 절차**
특정 도구의 설치 절차보다 알림 설계 원칙이 오래 간다. 31.6에서 SLO 기반 알림과 오류 예산 소진율을 다루는 것으로 대체했다.

**DP 10장 — React 컴포넌트 작성 튜토리얼 부분**
React 자체의 사용법은 이 책의 범위 밖이다. 20장은 서버와 브라우저가 코드를 공유할 때 생기는 문제와 그 설계 패턴에 집중한다.

## C.5 원서에 없는 신규 내용

세 권 모두 2020년 이전에 쓰였다. 그 이후 Node.js와 운영 관행에서 표준이 된 것들을 이 책에 새로 넣었다.

- **6.9, 15.5** — `AbortController` / `AbortSignal` 기반 취소. Node 15에서 안정화되어 지금은 `fetch`·`fs`·스트림·타이머 전반의 표준 취소 수단이다.
- **9.4~9.5** — `Buffer`와 인코딩. 세 권 모두 산발적으로만 다뤘으나 바이너리 프로토콜과 스트림 작업의 전제 지식이다.
- **11.4~11.5** — `worker_threads`, `SharedArrayBuffer`, `Atomics`. MN 집필 시점에는 존재하지 않았다.
- **7.10** — Web Streams 상호 운용. `fetch`가 내장되면서 두 스트림 체계를 오가는 일이 일상이 되었다.
- **30.2** — `node:test` 내장 테스트 러너. Node 20에서 안정화되어 외부 러너 없이 테스트를 시작할 수 있다.
- **31.4** — OpenTelemetry. 원서의 Zipkin 단독 서술을 벤더 중립 표준으로 대체했다.
- **32.10** — 컨테이너 안의 Node.js. PID 1 시그널 문제, cgroup CPU/메모리 제한과 `os.cpus()`·`--max-old-space-size`의 불일치는 컨테이너 배포가 기본이 된 지금 반드시 알아야 할 내용이다.
- **34.7** — Node.js 권한 모델(`--permission`)과 `vm` 모듈이 샌드박스가 아니라는 사실.
- **19.3** — 확장-수축(expand-contract) 무중단 마이그레이션. 원서는 롤백을 다뤘으나 실무에서는 롤백이 잘 동작하지 않는다.
- **24.1** — UUIDv7 / ULID. 원서 집필 이후 표준화되어 분산 ID의 기본 선택지가 되었다.

## C.6 더 읽을 거리

**공식 문서**
- Node.js API 문서 — 이 책이 개별 함수 시그니처를 나열하지 않는 이유다. 버전별로 정확하다.
- Node.js 릴리스 일정과 LTS 정책 — 34.6에서 다룬 업그레이드 계획의 근거 자료다.
- libuv 설계 개요 — 1장과 3장에서 다룬 이벤트 루프의 원본 설명이다.

**분산 시스템 이론**
- Martin Kleppmann, *Designing Data-Intensive Applications* — 19장·23장·24장의 배경 이론. 특히 분산 락과 합의에 대한 논의는 24.5를 더 깊이 이해하는 데 도움이 된다.
- Sam Newman, *Building Microservices* — 27장의 확장판.

**운영과 신뢰성**
- Google, *Site Reliability Engineering* 및 *The SRE Workbook* — 28.4의 SLO 수립과 31.6의 오류 예산 알림은 이 두 권의 프레임을 따랐다.
- Michael Nygard, *Release It!* — 29장의 서킷 브레이커와 안정성 패턴의 출처다.

**보안**
- OWASP Top 10과 OWASP Node.js 보안 체크리스트 — 34장의 방어 항목을 점검하는 표준 목록이다.
- Node.js 보안 워킹 그룹의 권고 사항 — 34.3의 공급망 방어 관행이 여기에서 갱신된다.

## 요약

- 이 책의 34개 장은 세 원서의 42개 장을 해체해 재조립한 것이다. 1:1 대응이 아니라 주제별 통합이다.
- DP는 언어·런타임·패턴의 뼈대를, DS는 분산·운영의 뼈대를, MN은 코어 API 레퍼런스를 담당한다.
- MN(2013)에서 온 내용은 대부분 현대 API로 재작성했다. 콜백 나열·중단된 도구·구버전 벤더 SDK는 제외했다.
- 원서에 없던 내용 10여 항목을 새로 넣었다. 대부분 2020년 이후 표준이 된 것들이다.
- 원서를 함께 읽는다면 C.3의 역방향 색인으로 대응 위치를 찾을 수 있다.
