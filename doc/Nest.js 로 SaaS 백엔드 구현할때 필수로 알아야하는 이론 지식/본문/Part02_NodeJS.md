---
title: "Part 2. Node.js 핵심 원리와 디자인 패턴"
parent: "NestJS SaaS 백엔드 필수 이론"
nav_order: 2
---

# Part 2. Node.js 핵심 원리와 디자인 패턴 (출처: Node.js Design Patterns, 3rd Edition)

> **🎮 게임 서버 개발자에게** — Node.js는 C++로 치면 **epoll(또는 IOCP) 루프 하나에 게임 로직 전부를 올린 "단일 로직 스레드" 서버**다. 소켓 I/O 대기는 커널이, 파일·DNS·일부 암호 작업은 libuv 스레드 풀이 맡고, 여러분이 쓰는 JS 콜백은 모두 한 스레드에서 선점 없이 차례로 돈다. 결정적 차이는 셋이다. ① 로직 스레드를 늘릴 방법이 없다(JS 힙을 공유하는 두 번째 스레드가 없다) — 코어를 쓰려면 프로세스를 복제하거나 힙이 따로인 Worker를 쓴다. ② 그래서 세션 상태를 프로세스 메모리에 두던 stateful 게임 서버 습관이 복제와 함께 깨진다. ③ 메모리는 RAII·소멸자가 아니라 GC가 회수한다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 엑셀/리포트 생성 API가 한 번 돌 때마다 **다른 모든 API의 p99가 수 초로 튄다** (→ 코어 1).
> - 점검 배포 때마다 **정확히 30초씩 걸리고, 진행 중 요청이 끊기며, 종료 코드 137**이 찍힌다 (→ 코어 5).
> - 외부 결제 API가 느려지자 **우리 서버 전체가 멈췄고**, 복구 뒤에는 결제 완료 메시지가 **두 번 처리돼 포인트가 이중 지급**됐다 (→ 코어 3, 코어 5).

## 코어 — 이것만은 100%

> **한 문장:** Node.js는 스레드 하나의 이벤트 루프가 I/O 대기 시간을 다른 요청 처리에 쓰는 리액터이므로 **루프를 막지 말고**(코어 1) **비동기를 규율 있게** 다루며(코어 2) 바깥 세계와의 **경계에서 실패·취소·컨텍스트**를 관리해야 하고(코어 3), NestJS는 그 위의 **Node 디자인 패턴을 포장**한 것이며(코어 4), **확장·운영**할 때는 상태를 공유 저장소로 빼고 중복 전달·시그널·메모리 한도에 대비해야 한다(코어 5).

1. **이벤트 루프를 막지 마라** — JS는 libuv 루프 한 스레드에서 단계별로 돈다. I/O 대기는 공짜에 가깝지만 동기 CPU 작업은 모든 요청을 멈춘다(p99 폭증). 무거운 작업은 `setImmediate` 쪼개기, 프로세스/Worker 스레드 풀(workerpool, piscina), 큐로 분리하고 루프 지연을 메트릭으로 본다.
2. **비동기 규율** — API는 항상 동기거나 항상 비동기(Zalgo 금지), 순차·병렬·제한된 병렬을 구분하고 `forEach` + `async`를 금지한다. EventEmitter는 리스너를 정리하고, 대용량은 스트림 + `pipeline()`으로 백프레셔를 지키며, 같은 비동기 요청은 진행 중 Promise를 공유(배칭)한다.
3. **경계에서의 실패·취소·컨텍스트** — 운영 에러는 처리하고 프로그래머 에러는 기록 후 종료한다(`uncaughtException`으로 계속 실행 금지, 잊혀진 `await` 금지). 모든 외부 호출에 `AbortSignal.timeout()`을 걸고, 요청 ID·테넌트 ID는 `AsyncLocalStorage`로 전파하며, 바이트·인코딩·HMAC·상수 시간 비교를 정확히 다룬다.
4. **디자인 패턴이 NestJS의 뿌리다** — 작은 모듈과 모듈 캐시(사실상 싱글턴)의 결합을 DI로 풀고(→ `@Injectable`, `useFactory`), Adapter(외부 SDK 감추기)·Proxy(→ Interceptor)·Strategy(→ `PassportStrategy`)·Middleware(→ `NestMiddleware`, Guard/Interceptor/Pipe)·Observer(→ `@OnEvent`)로 구조를 잡는다.
5. **확장과 운영** — 인스턴스에 상태를 두지 않고(세션은 Redis, sticky 회피) 복제하며, at-least-once 큐 소비자는 멱등하게 만든다. `process.env`는 문자열, `node`를 PID 1로 직접 실행해 SIGTERM을 처리하고, 힙 상한을 컨테이너 한도의 약 70~75%로, 설치는 lockfile + `npm ci`로 한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| epoll 리액터 루프 + 로직 스레드 1개 (또는 IOCP `GetQueuedCompletionStatus` 루프) | 이벤트 루프(libuv) | OS가 "준비됨/완료됨"을 알려 주면 한 스레드가 등록된 핸들러를 실행한다. 대기 중 CPU는 0%에 가깝다 | 로직 스레드를 늘릴 수 없다. 콜백은 선점되지 않으므로 한 핸들러가 50ms 돌면 모든 세션이 50ms 멈춘다. Windows의 libuv는 IOCP(완료 모델)를 쓰지만 JS에는 똑같은 콜백 모양으로 보인다 |
| I/O 워커 스레드 풀, 블로킹 작업 전용 스레드 | libuv 스레드 풀(기본 4개) / Worker Threads | 블로킹되는 일을 다른 스레드로 보낸다 | 스레드 풀은 파일 I/O·`dns.lookup`·일부 crypto·zlib 같은 정해진 작업만 돌리고 **여러분의 JS는 돌리지 않는다**. Worker는 별도 V8 힙이라 객체를 공유하지 못하고 메시지(복사)로 통신한다 |
| 세션별 송신 큐 상한 (느린 클라이언트 끊기) | 스트림 백프레셔 (`write()` → `false`, `drain`) | 느린 상대에게 데이터를 무한히 쌓지 않는다 | Node의 신호는 **권고**다. 무시해도 에러 없이 버퍼가 계속 커져 메모리만 늘어난다 |
| `thread_local`, OVERLAPPED 확장 구조체에 실어 다니는 세션 컨텍스트 | `AsyncLocalStorage` | 인자로 넘기지 않고 "현재 요청"을 찾는다 | 스레드가 아니라 **비동기 실행 흐름**에 붙는다. 모든 요청이 한 스레드에서 번갈아 도는 Node에서 `thread_local` 발상은 전역 변수와 같아 값이 섞인다 |
| RAII·소멸자·`delete` | V8 GC (새 공간/옛 공간) | 안 쓰는 메모리를 회수한다 | 해제 시점이 비결정적이다. 누수는 dangling이 아니라 "도달 가능한 참조가 남는 것"(리스너, 캐시, 클로저). 소켓·파일 같은 자원은 GC에 맡기지 말고 명시적으로 닫는다 |
| 유저가 특정 서버에 붙는 stateful 게임 서버 | 상태 없는 X축 복제 + Redis | 부하를 여러 프로세스로 나눈다 | HTTP 요청은 매번 다른 인스턴스로 갈 수 있다. 세션을 프로세스 메모리에 두면 깨지고, sticky는 가능하면 피한다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 스레드 하나로 JS를 실행하는 Node가 어떻게 동시에 많은 요청을 처리할까? IOCP 워커 N개 서버와 무엇이 다를까? 그리고 무엇이 그 모든 요청을 한순간에 멈추게 할까?
> 2. `items.forEach(async (i) => { await save(i); })`는 무엇이 잘못일까?
> 3. 메시지 큐가 "최소 한 번(at least once)" 전달을 보장한다면, 소비자는 무엇을 대비해야 할까?
> 4. 요청 ID를 전역 변수(C++이라면 `thread_local`)에 넣어 두고 로그에 찍으면 왜 안 될까?
> 5. Dockerfile에 `CMD npm start`라고 쓰면 배포할 때마다 무슨 일이 생길까?
>
> **처리법:** 🛠 실습 `setTimeout`/`setImmediate`/`Promise.then`/`process.nextTick` 실행 순서 예제, `for...of` vs `Promise.all`, `pipeline()`으로 gzip 압축, `fetch` + `AbortSignal.timeout()`, `AsyncLocalStorage.run()`, `randomBytes`/`createHmac`/`timingSafeEqual`, 멀티스테이지 Dockerfile → 읽자마자 직접 실행 · 🗺 관계도 Node 디자인 패턴 ↔ NestJS 기능(Factory·DI → `useFactory`/`@Injectable`, Strategy → `PassportStrategy`, Middleware → `NestMiddleware`·Guard·Interceptor, Observer → `@OnEvent`), 이벤트 루프 단계와 nextTick·마이크로태스크 큐 · 📦 카드로 종료 코드 0/1/137/143, `highWaterMark` 약 16KB, 힙 상한 = 컨테이너 한도의 70~75%, 이벤트 루프 단계 이름, 전달 보장 3수준, `package.json`에서 Node가 읽는 5개 필드, 인코딩 4종

---

이 부는 NestJS를 쓰기 전에 "Node.js가 어떻게 돌아가는지"와 "자주 쓰는 설계 패턴"을 잡아 주는 부분이다.
NestJS의 Module, Provider, Interceptor, Guard 같은 개념은 대부분 여기서 나오는 패턴을 프레임워크로 포장한 것이다.

> 출처 안내: 대부분의 절은 *Node.js Design Patterns, 3rd Edition*을 따른다. **1.2, 3.1~3.6, 5.3~5.6절**은 Node.js 런타임 교재(doc/node.js-textbook-main 등)로 보강한 내용이다(각 절 끝의 📖 원문 표기 참고). 각 코어 안의 "🎮 C++ 서버와 비교" 블록은 책 외 (보충)이다.

---

## 코어 1. 이벤트 루프를 막지 마라

> 이 코어의 결정적 지식: **"JS는 스레드 하나의 이벤트 루프에서 실행된다."** 여기서 동기 CPU 작업의 위험(1.1), 실행 순서와 루프 지연 지표(1.2), worker/프로세스 분리(1.3)가 모두 나오고, 코어 2의 Zalgo·`await` 사이 race, 코어 3의 ALS, 코어 5의 이른 X축 복제까지 이어진다.

### 1.1 Node.js는 어떻게 동시에 많은 요청을 처리하나

**한 줄 요약:** OS의 이벤트 디멀티플렉서(epoll/kqueue/IOCP) 위에서 스레드 하나가 I/O 대기 시간을 다른 요청 처리에 쓰는 리액터 패턴이며, 그래서 동기 CPU 작업 하나가 모든 요청을 멈춘다.

#### 1.1.1 블로킹 I/O vs 논블로킹 I/O

- I/O(디스크, 네트워크, DB)는 CPU에 비해 **매우 느리다**.
- **블로킹 I/O**: 응답이 올 때까지 그 스레드가 멈춰 기다린다. 동시 접속을 처리하려면 스레드를 여러 개 띄워야 한다.
- **논블로킹 I/O**: 요청만 던져 놓고 바로 다음 일을 한다. 결과는 나중에 알림으로 받는다.
- 결과를 확인하려고 계속 반복해서 물어보는 방식(busy-waiting, polling)은 CPU를 낭비한다.

#### 1.1.2 이벤트 디멀티플렉서와 리액터 패턴(Reactor Pattern)

운영체제는 "여러 자원을 한꺼번에 지켜보다가, 준비된 것이 생기면 알려 주는" 기능을 제공한다(Linux의 epoll, macOS의 kqueue, Windows의 IOCP). 이것을 **이벤트 디멀티플렉서**라 부른다.

Node의 동작 흐름(리액터 패턴)은 이렇다.

1. 앱이 I/O 요청을 던지면서 <strong>핸들러(콜백)</strong>를 함께 등록한다. 이 호출은 즉시 반환된다.
2. I/O가 끝나면 디멀티플렉서가 **이벤트 큐**에 이벤트를 넣는다.
3. <strong>이벤트 루프(Event Loop)</strong>가 큐에서 이벤트를 하나씩 꺼내 해당 핸들러를 실행한다.
4. 핸들러가 끝나면 다시 다음 이벤트를 기다린다. 처리할 것이 더는 없으면 프로세스가 종료된다.

한 줄 요약: **"스레드 하나가 대기 시간을 다른 요청 처리에 쓴다."**

비유: 식당에서 주문을 받은 직원이 요리가 끝날 때까지 주방 앞에 서 있지 않고, 다른 테이블 주문을 받다가 벨이 울리면 음식을 나르는 방식이다.

#### 1.1.3 libuv와 Node의 구성

- **libuv**: OS마다 다른 논블로킹 방식을 통일해 주는 C 라이브러리이자 이벤트 루프의 실제 구현체다. 논블로킹이 어려운 파일 I/O 등은 내부 스레드 풀로 처리해 준다.
- Node.js = V8(JS 엔진) + libuv + 바인딩 + 코어 JS 라이브러리.

#### 1.1.4 여기서 얻는 실무 결론

| 사실 | 결론 |
|------|------|
| JS 코드는 스레드 하나(이벤트 루프)에서 실행 | **오래 걸리는 동기 작업이 이벤트 루프를 막으면 모든 요청이 멈춘다** |
| I/O 대기는 공짜에 가깝다 | DB, 외부 API 호출이 많은 SaaS API 서버에 잘 맞는다 |
| 메모리 안의 경쟁 상태(race)가 적다 | 동기 코드 구간은 다른 코드가 끼어들지 않는다 (단, `await` 사이에는 끼어든다) |
| 앱 코드는 서버와 브라우저가 다름 | DOM 없음, 대신 fs, net, crypto, child_process 등 OS 기능 사용 가능 |

```ts
// 나쁜 예: 요청 하나가 이벤트 루프를 수 초간 점유
app.get('/report', (req, res) => {
  let sum = 0;
  for (let i = 0; i < 1e10; i++) sum += i; // 이 동안 다른 모든 요청이 대기
  res.send(String(sum));
});
```

**SaaS에서 왜 중요한가**: "CPU 무거운 작업(대용량 엑셀 생성, 암호화 반복, 큰 JSON 파싱)을 API 서버에서 그냥 돌리면 전체 응답이 느려진다"는 사고의 원인이다. 해법은 1.3(CPU 작업 분리)과 5.2(메시징·큐)에서 다룬다.

> 📖 원문: 1장 How Node.js works, The reactor pattern, Libuv, JavaScript in Node.js

#### 1.1.5 🎮 IOCP/epoll 게임 서버와 정밀 비교 (보충)

C++ 서버 경험을 기준으로 Node의 "스레드 하나"가 정확히 무엇인지 맞춰 보자. (이 소절은 책 외 보충이다.)

| 항목 | epoll 리액터 서버 | IOCP 서버 | Node.js (libuv) |
|---|---|---|---|
| 통지 모델 | readiness: "읽을 수 있다"를 받고 직접 `recv` | completion: 커널이 끝낸 결과를 받음 | Linux는 epoll, macOS는 kqueue(readiness), Windows는 IOCP(completion)를 쓰지만 JS에는 모두 "완료 콜백"으로 보인다 |
| 핸들러를 실행하는 스레드 | 보통 루프 스레드 1개(또는 코어당 루프 1개) | `GetQueuedCompletionStatus`를 부르는 워커 N개 | **JS 콜백은 메인 스레드 1개**에서만 실행 |
| 소켓 I/O | 루프 스레드가 논블로킹 소켓으로 처리 | 커널이 비동기로 처리 | 스레드 풀을 쓰지 않고 OS 논블로킹/완료 통지로 루프 스레드에서 처리 |
| 파일 I/O 등 블로킹 작업 | 별도 스레드로 보냄 | overlapped 파일 I/O 또는 별도 스레드 | **libuv 스레드 풀**(기본 4개, `UV_THREADPOOL_SIZE`로 조정): `fs`, `dns.lookup`, `crypto.pbkdf2`/`scrypt` 같은 비동기 crypto, zlib 비동기 API |
| 공유 상태 보호 | 단일 루프면 락 불필요 | 워커 간 락·strand 필요 | JS 힙은 한 스레드만 만지므로 락 불필요. 대신 `await` 지점에서 다른 콜백이 끼어든다 |
| 타이머 | `epoll_wait`의 timeout을 가장 가까운 타이머로 계산 | 타이머 큐/별도 스레드 | libuv도 poll 단계의 대기 시간을 가장 가까운 타이머로 계산한다(1.2) |

- **같은 점:** Node는 "로직 스레드 1개 + I/O는 커널과 보조 스레드"인 단일 로직 스레드 게임 서버와 구조가 같다. 그래서 락 없이 상태를 다루는 편안함도 같고, 로직 스레드에서 한 프레임이 길어지면 모든 세션이 랙을 겪는 위험도 같다.
- **깨지는 곳 1 — 로직 스레드를 늘릴 수 없다.** IOCP 서버는 워커를 코어 수만큼 늘리고 락으로 보호하면 되지만, Node에는 JS 힙을 공유하는 두 번째 스레드가 없다. 코어를 다 쓰려면 프로세스를 복제(5.1)하거나 힙이 따로인 Worker(1.3)를 쓴다.
- **깨지는 곳 2 — 스레드 풀은 여러분 코드용이 아니다.** libuv 스레드 풀은 정해진 블로킹 작업만 돌린다. 내 JS 계산 루프를 거기로 보낼 수 없다. 또 풀이 기본 4개라서 파일 I/O, `dns.lookup`, 비동기 `scrypt`가 한꺼번에 몰리면 나머지는 풀 큐에서 기다린다(소켓 I/O와는 별개).
- **깨지는 곳 3 — 고정 틱이 아니다.** 게임 서버의 고정 프레임 루프(예: 50ms 틱)와 달리 Node 루프는 이벤트가 올 때만 돈다. 콜백은 선점되지 않으므로 "동기 구간은 원자적"이고, **`await`가 곧 양보 지점**이다.

### 1.2 이벤트 루프의 단계와 실행 순서

**한 줄 요약:** 루프는 timers → pending callbacks → idle/prepare → poll → check → close callbacks 단계를 돌고, 콜백 하나가 끝날 때마다 nextTick 큐와 마이크로태스크 큐를 먼저 비운다. 루프가 막히면 p99가 폭증한다.

1.1에서 "이벤트 루프가 큐에서 이벤트를 꺼내 실행한다"고 했다. 실제 libuv의 루프는 큐 하나가 아니라 <strong>정해진 순서로 도는 여러 단계(phase)</strong>이고, 단계마다 자기 콜백 큐가 있다.

#### 1.2.1 루프 한 바퀴의 단계

| 단계 | 여기서 실행되는 것 | 관련 API |
|------|-------------------|----------|
| timers | 시간이 다 된 타이머 콜백 | `setTimeout`, `setInterval` |
| pending callbacks | 이전 바퀴에서 미뤄진 시스템 콜백 (일부 TCP 오류 등) | 직접 쓸 일 없음 |
| idle, prepare | libuv 내부용 | 직접 쓸 일 없음 |
| **poll** | 새 I/O 이벤트를 받아 콜백 실행. **할 일이 없으면 여기서 잠들어 기다린다** | `fs`, `net`, `http`, 스트림 |
| check | poll 직후 실행할 콜백 | `setImmediate` |
| close callbacks | 갑자기 닫힌 핸들의 정리 콜백 | `socket.on('close')` |

- 놀고 있는 서버의 CPU가 거의 0%인 이유는 poll 단계에서 OS(epoll/kqueue/IOCP)에 "일 생기면 깨워 달라"고 하고 진짜로 잠들기 때문이다. 붙잡을 핸들(서버 소켓, 타이머 등)이 하나도 없으면 루프가 끝나고 프로세스가 종료된다.

#### 1.2.2 새치기하는 두 큐: nextTick 큐와 마이크로태스크 큐

단계 바깥에 우선순위가 훨씬 높은 큐 두 개가 있다: **nextTick 큐**(`process.nextTick`)와 **마이크로태스크 큐**(Promise의 `then/catch/finally`, 모든 `await` 이후 코드, `queueMicrotask`).

규칙: **콜백 하나가 끝날 때마다**(단계가 끝날 때가 아니라) nextTick 큐를 전부 비우고, 이어서 마이크로태스크 큐를 전부 비운다. 그 뒤에야 루프가 다음으로 진행한다.

```ts
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));
console.log('sync');
// CJS 기준: sync → nextTick → promise → (timeout/immediate는 순서 비결정)
```

- **`setTimeout(fn, 0)`은 실제로 1ms**이고, 메인 모듈에서 `setImmediate`와 누가 먼저일지는 **비결정적**이다. 단, I/O 콜백 안에서 둘을 예약하면 **항상 `setImmediate`가 먼저**다 (poll 다음이 check이기 때문).
- ESM 최상위 코드는 이미 마이크로태스크 안에서 실행되므로 `nextTick`과 Promise의 순서가 CJS와 **뒤바뀔 수 있다**. 결론: **nextTick과 Promise의 상대 순서에 의존하는 코드를 쓰지 않는다.** 새 코드는 표준인 `queueMicrotask()`를 권장한다 (교재는 `process.nextTick`을 Legacy로 표기).
- 마이크로태스크는 예산 없이 "빌 때까지" 실행된다. 마이크로태스크가 계속 마이크로태스크를 만들면 루프가 영영 다음 단계로 못 간다 (2.1의 I/O 기아와 같은 문제).

#### 1.2.3 이벤트 루프 지연(lag) 측정

CPU 작업이 루프를 막으면 증상이 독특하다. 처리량과 중간값(p50) 지연은 멀쩡한데 **p99만 폭증**한다. 다른 요청의 200ms CPU 작업 뒤에 줄 선 요청들이 다 늦어지기 때문이다. 이를 숫자로 보는 도구가 내장되어 있다.

```ts
import { monitorEventLoopDelay } from 'node:perf_hooks';

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setInterval(() => {
  metrics.gauge('eventloop.delay.p99_ms', h.percentile(99) / 1e6); // 나노초 → ms
  h.reset();
}, 10_000).unref(); // unref: 이 타이머 때문에 프로세스가 안 꺼지는 일 방지
```

- <strong>지연(delay)</strong>은 루프가 원래 시점보다 얼마나 늦게 도는가, <strong>사용률(ELU, `performance.eventLoopUtilization()`)</strong>은 루프가 잠들지 않고 일한 시간 비율(1에 가까우면 포화)이다. 둘을 메트릭으로 내보내면 "동기 작업이 루프를 막는다"를 운영 중에 바로 안다.

**SaaS에서 왜 중요한가**: 실행 순서를 정확히 알아야 "가끔만 재현되는" 비동기 버그를 피하고, 루프 지연 지표는 1.3(CPU 작업 분리)이 필요한 순간을 알려 주는 경보가 된다.

> 📖 원문: Node.js 교재 part2-async/09-event-loop (The phases, The two queues that jump the line, setTimeout vs setImmediate, Event loop delay/utilization) / Node.js 완전 가이드 3장 3.2~3.6

> **🎮 C++ 서버와 비교 (보충)**
> - poll 단계는 루프 스레드가 `epoll_wait`/`GetQueuedCompletionStatus`에 timeout을 주고 잠드는 지점과 같다. timers·check 단계는 그 앞뒤에 붙은 "타이머 처리"와 "이번 바퀴 끝에 처리할 지연 작업" 큐에 해당한다.
> - nextTick·마이크로태스크 큐는 "현재 패킷 핸들러가 끝나자마자 바로 처리하는 지연 호출 큐"와 비슷하다. ⚠️ 다만 프레임 예산이 없다. 비워질 때까지 계속 돌기 때문에 스스로를 다시 넣는 작업은 루프 전체를 굶긴다.
> - `monitorEventLoopDelay`는 게임 서버의 "틱 지연(프레임이 예정보다 얼마나 늦게 돌았나)" 계측과 같은 지표다.

### 1.3 CPU 무거운 작업 분리 (setImmediate, 프로세스, Worker Threads)

**한 줄 요약:** 루프를 오래 붙잡는 CPU 작업은 `setImmediate`로 쪼개거나, 외부 프로세스나 Worker Threads(검증된 풀 라이브러리)로 보낸다.

이벤트 루프를 오래 붙잡는 CPU 작업(책의 예: 부분집합 합 계산)은 그동안 다른 모든 요청을 멈춘다. 책은 세 가지 해법을 비교한다.

| 방법 | 원리 | 장단점 |
|------|------|--------|
| **`setImmediate`로 쪼개기(Interleaving)** | 알고리즘을 작은 단계로 나눠, 단계 사이에 대기 중인 I/O를 처리하도록 양보 | 구현은 쉬우나 미루는 오버헤드가 단계마다 쌓여 전체가 느려짐. 한 단계가 길면 여전히 앱이 굼떠짐. **`process.nextTick`은 I/O 기아를 일으켜 쓸 수 없음**. 가끔 짧게 도는 작업엔 가장 간단한 해법 |
| **외부 프로세스(`child_process.fork`)** | 별도 프로세스에서 최고 속도로 실행, 메시지로 통신 | 이벤트 루프가 막히지 않고, 여러 CPU를 쓸 수 있음. 프로세스 풀로 동시 실행 수를 제한 (한도를 넘는 요청은 빈 프로세스를 기다림) |
| **Worker Threads (`worker_threads`)** | 같은 프로세스 안의 별도 스레드. 자체 V8 인스턴스와 이벤트 루프를 가짐 | 프로세스보다 메모리와 시작 시간이 작음. 기본은 아무것도 공유하지 않고 **메시지**로 통신하며, `ArrayBuffer` 전달이나 `SharedArrayBuffer`(+`Atomics`)로 메모리를 공유할 수도 있음 |

```ts
import { Worker } from 'node:worker_threads';

// (보충) 원서는 ThreadPool/SubsetSum 예제를 쓰며, 아래는 단순화한 원서 외 예시다
function runInWorker<T>(file: string, data: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = new Worker(file, { workerData: data });
    w.once('message', resolve);
    w.once('error', reject);
    w.once('exit', (c) => c !== 0 && reject(new Error(`exit ${c}`)));
  });
}
```

실무 지침 (책의 결론):

- 프로세스 풀/스레드 풀은 타임아웃, 에러, 실패 처리가 까다로운 복잡한 부품이다. 특별한 요구가 없으면 직접 만들지 말고 검증된 라이브러리(**workerpool**, **piscina**)를 쓴다.
- CPU 작업량이 한 노드의 처리 능력을 넘으면 여러 노드로 분산해야 하며, 이는 5.1(확장)과 5.2(메시징)에서 다루는 별개의 문제다.

**SaaS에서 왜 중요한가**: 리포트 생성, 대량 데이터 변환 같은 작업 하나가 전체 API 응답을 마비시키는 사고를 막는다.

> 📖 원문: 11장 Running CPU-bound tasks (Interleaving with setImmediate, Using external processes, Using worker threads, Running CPU-bound tasks in production)

> **🎮 C++ 서버와 비교 (보충)**
> - `worker_threads`는 `std::thread`와 다르다. 워커마다 **자기 V8 인스턴스·힙·이벤트 루프**를 가지므로 객체 포인터를 공유할 수 없다. `postMessage`는 구조화 복제(structured clone)로 **값을 복사**하고, `ArrayBuffer`를 transfer 목록으로 넘기면 복사 없이 **소유권이 넘어간다**(`std::move`된 버퍼처럼 보내는 쪽에서는 쓸 수 없게 된다).
> - `SharedArrayBuffer` + `Atomics`는 공유 메모리 + `std::atomic`에 가장 가깝다. 여기서만 C++식 동기화 문제가 다시 생긴다.
> - `child_process.fork`는 별도 프로세스 + IPC 채널이다. 게임 서버에서 무거운 계산을 별도 프로세스로 띄우고 파이프로 통신하던 구조와 같다.

---

## 코어 2. 비동기 규율

> 루프 하나를 여러 요청이 나눠 쓰므로, 비동기 코드는 **실행 순서를 예측할 수 있고(2.1, 2.2), 동시성을 의도대로 제한하며(2.3), 메모리를 흐름으로 관리하고(2.4), 같은 일을 두 번 하지 않아야(2.5)** 한다.

### 2.1 콜백과 비동기 API의 규칙

**한 줄 요약:** API는 항상 동기거나 항상 비동기여야 하고(Zalgo 금지), 콜백은 마지막 인자·에러 우선이며, 잡히지 않은 예외는 fail-fast로 종료한다.

#### 2.1.1 콜백 패턴과 CPS

- 결과를 반환(return) 대신 **콜백 함수에 전달**하는 방식을 연속 전달 방식(Continuation-Passing Style, CPS)이라 한다.
- 콜백이 실제로 비동기인지, 동기인지 헷갈리게 만든 API는 위험하다.

#### 2.1.2 Zalgo 문제: 동기/비동기를 섞지 마라

같은 함수가 어떨 때는 **동기로**(캐시 있음), 어떨 때는 **비동기로**(캐시 없음) 콜백을 부르면 호출하는 쪽이 실행 순서를 예측할 수 없다. 이를 "Zalgo를 풀어놓았다"고 부른다.

원칙: **API는 자신이 동기인지 비동기인지 분명해야 한다.** 고치는 방법은 두 가지다.

1. **전부 동기로 통일**: 순수 동기 함수는 콜백 없이 그냥 값을 반환(direct style)한다. 다만 동기 I/O(`readFileSync` 등)는 이벤트 루프를 막으므로 아껴 쓴다. 책은 "앱 시작 시 설정 파일을 읽을 때" 같은 경우는 동기 API가 괜찮다고 본다.
2. **전부 비동기로 통일**: 동기로 끝날 수 있는 경로도 `process.nextTick()`으로 콜백 실행을 미룬다.

```ts
function getUser(id: string, cb: (err: Error | null, u?: User) => void) {
  const cached = cache.get(id);
  if (cached) return process.nextTick(() => cb(null, cached)); // 항상 비동기로
  db.findUser(id, cb);
}
```

`process.nextTick()`과 `setImmediate()`의 차이:

| | 실행 시점 | 주의 |
|--|-----------|------|
| `process.nextTick()` | 현재 작업 직후, 대기 중인 I/O보다 먼저 | 재귀 호출하면 I/O가 밀리는 **I/O 기아(starvation)** 발생 가능 |
| `setImmediate()` | 대기 중인 I/O 이벤트를 처리한 다음 | I/O 기아가 생기지 않음 |

#### 2.1.3 Node 콜백 규칙

1. 콜백은 **마지막 인자**.
2. 콜백의 **첫 인자는 에러**(없으면 `null`). 에러는 항상 `Error` 객체여야 하며, 문자열이나 숫자를 넘기지 않는다.
3. 비동기 함수의 에러는 콜백으로 전달해 전파한다(`throw`는 동기 코드 방식). 콜백 안에서 던진 예외는 호출 스택에서 잡히지 않아 **uncaught exception**이 된다.
4. 잡히지 않은 예외가 발생하면 애플리케이션은 일관되지 않은 상태일 수 있다. 책은 <strong>빨리 실패(fail-fast)</strong>를 권한다. 필요한 정리만 하고 프로세스를 종료하며, 감시 프로세스(supervisor)가 다시 띄우게 한다.

**SaaS에서 왜 중요한가**: 지금은 Promise/async가 주류지만, 옛 라이브러리와 스트림·이벤트는 여전히 콜백 규칙을 쓴다. "에러가 어디로 가는가"를 이해해야 프로세스가 갑자기 죽는 사고를 막는다.

> 📖 원문: 3장 The Callback pattern, Synchronous or asynchronous?, Node.js callback conventions

### 2.2 Observer 패턴과 EventEmitter

**한 줄 요약:** EventEmitter는 프로세스 안의 Observer로, `error` 리스너·리스너 정리·동기/비동기 emit 일관성을 챙겨야 한다.

**Observer 패턴**: 어떤 일이 일어났음을 알리는 쪽(Subject)과 관심 있는 여러 구독자(Observer)를 느슨하게 연결한다. Node에서는 `EventEmitter`가 이를 구현한다.

```ts
import { EventEmitter } from 'node:events';

class OrderService extends EventEmitter {
  create(order: Order) {
    // ... 저장
    this.emit('order.created', order);   // 알리기만 함, 누가 듣는지는 모름
  }
}

const svc = new OrderService();
svc.on('order.created', (o) => sendEmail(o));
svc.on('order.created', (o) => trackAnalytics(o));
svc.once('order.created', (o) => console.log('첫 주문만'));
```

알아야 할 핵심:

- **`on` / `once` / `emit` / `removeListener`** 가 원서가 소개하는 기본 API다 (`off`는 `removeListener`의 별칭이며 (보충) 원서 표기는 아니다).
- **`error` 이벤트**: `error`라는 이름의 이벤트를 emit했는데 리스너가 없으면 예외가 던져져 프로세스가 죽을 수 있다. 항상 `error` 리스너를 달거나 신경 쓴다.
- **`extends EventEmitter`**: 실무에서는 `EventEmitter`를 단독으로 쓰기보다 클래스가 상속받아 "관찰 가능한(observable) 객체"로 만든다 (생성자에서 `super()` 필수). Node의 HTTP 서버와 스트림도 이렇게 만들어져 있다.
- **메모리 누수**: 오래 사는 emitter에 리스너를 계속 추가만 하고 제거하지 않으면 리스너가 잡고 있는 메모리가 해제되지 않는다. 책은 이것을 Node.js 메모리 누수의 가장 흔한 원인으로 꼽는다. `removeListener`(`off`)로 정리하고, 리스너가 10개를 넘으면 경고가 뜬다 (`setMaxListeners`로 조정). `once`도 이벤트가 영영 안 오면 해제되지 않는다는 점에 주의한다.
- **동기 vs 비동기 emit**: 이벤트도 Zalgo 문제가 있다. 같은 이벤트를 동기로도 비동기로도 emit하면 안 된다. 동기로 emit하면 리스너를 **작업 시작 전에** 등록해야 하고, 비동기로 emit하면 작업 시작 뒤에 등록해도 이벤트를 놓치지 않는다. 동기 emit을 늦추려면 `process.nextTick()`을 쓴다.
- **콜백 vs 이벤트**: 결과를 **돌려줘야** 하면 콜백(정확히 한 번 호출), 무슨 일이 **일어났음을 알리는** 것이면 이벤트가 맞다. 이벤트는 여러 번 발생하거나 전혀 발생하지 않을 수도 있고, 리스너를 여러 개 붙일 수 있다.
- **둘의 조합**: 최종 결과는 콜백으로 주고, 진행 상황은 반환한 EventEmitter로 알려 주는 API도 있다 (예: `glob`).

**SaaS에서 왜 중요한가**: "주문 생성 후 이메일 발송, 분석 기록, 웹훅 전송"처럼 부가 작업을 핵심 로직에서 분리할 때 쓰는 기본 도구다. 다만 프로세스 안에서만 동작하며, 서버가 여러 대이거나 유실되면 안 되는 작업은 5.2의 메시지 큐를 써야 한다.

> 🔗 NestJS 연결: `@nestjs/event-emitter`의 `@OnEvent()`, RxJS의 Subject도 같은 발상이다.

> 📖 원문: 3장 The Observer pattern, The EventEmitter, EventEmitter and memory leaks, Synchronous and asynchronous events

### 2.3 비동기 흐름 제어: 콜백 지옥에서 async/await까지

**한 줄 요약:** 순차·병렬·제한된 병렬을 구분하고 Promise/async의 함정(`return await`, `forEach`+`async`, 불필요한 순차 await)을 피한다. 단일 스레드에도 `await` 사이 race는 있다.

#### 2.3.1 콜백 지옥(Callback Hell)

콜백 안에 콜백을 계속 중첩해 코드가 피라미드 모양(pyramid of doom)이 되는 것이다. 문제는 세 가지다.

- 들여쓰기가 깊어 어디서 함수가 끝나는지 읽기 어렵다.
- 각 단계의 `err` 변수 이름이 겹쳐 실수하기 쉽다.
- 클로저가 잡고 있는 메모리가 해제되지 않아 눈에 안 띄는 누수가 생길 수 있다.

라이브러리 없이도 <strong>콜백 규율(callback discipline)</strong>로 크게 줄일 수 있다.

- **일찍 반환(early return)**: 에러면 `return cb(err)`로 바로 빠져나가 `else` 중첩을 없앤다. `return`을 빼먹으면 콜백 호출 뒤에도 함수가 계속 실행되는 버그가 생긴다.
- 콜백에 **이름을 붙인 함수**를 쓰고, 중간 결과는 인자로 넘긴다 (스택 트레이스도 읽기 좋아진다).
- 코드를 **작은 재사용 함수로 분리**한다.

#### 2.3.2 흐름 제어의 세 가지 모양

| 모양 | 의미 | 도구 |
|------|------|------|
| 순차(Sequential) | 앞 작업이 끝나야 다음 작업 | `await`를 차례로, `for...of` |
| 병렬(Parallel) | 서로 무관한 작업을 동시에 | `Promise.all` |
| 제한된 병렬(Limited parallel) | 동시에 N개까지만 | 작업 큐(TaskQueue) 패턴 |

- **단일 스레드에도 경쟁 상태(race condition)는 있다.** 락은 필요 없지만, 비동기 작업의 "요청 시점"과 "결과 도착 시점" 사이에 다른 작업이 끼어들 수 있다. 예: "파일이 없으면 다운로드"를 확인하는 사이 같은 URL의 다른 작업도 같은 확인을 통과해 둘 다 다운로드한다. `Set`으로 "진행 중" 표시를 남기는 식으로 막는다.
- **무제한 병렬은 위험하다.** 파일 디스크립터 고갈, 상대 서버의 연결 거부(ECONNREFUSED)가 생기고, 사용자 요청마다 무제한 병렬 작업을 만드는 서버는 **DoS 공격**에 악용될 수 있다. 그래서 **동시성 제한**이 중요하다.
- 동시성 제한의 기본 구조는 "동시 실행 수(running)가 한도보다 작으면 다음 작업을 시작하고, 하나가 끝나면 다시 시작"하는 것이다. 작업이 또 다른 작업을 만들어 내는 경우에는 전역적으로 제한하는 **작업 큐(TaskQueue)** 클래스(큐 + 동시성 한도)를 쓴다. 생산자가 큐에 작업을 넣고, 정해진 수의 소비자가 하나씩 꺼내 실행하는 생산자-소비자 방식으로도 구현한다.
- 직접 구현하는 대신 검증된 라이브러리(책은 `async` 라이브러리를 소개)를 쓸 수도 있다.

#### 2.3.3 Promise 핵심 정리

- Promise는 "미래에 도착할 결과"를 나타내는 객체. 상태: pending → fulfilled 또는 rejected (한 번 정해지면 불변).
- Promises/A+ 규격상 `.then()`의 콜백은 **항상 비동기로, 한 번만** 호출되므로 Zalgo 문제가 자연스럽게 해결된다.
- 콜백 API는 `util.promisify()`로 Promise 버전으로 바꾼다 (콜백이 마지막 인자, 에러 우선이라는 Node 규칙 덕분에 가능하다).
- `async` 함수는 항상 Promise를 반환한다. async/await는 Promise를 편하게 쓰기 위한 문법 설탕(syntactic sugar)이다.

| 함수 | 동작 |
|------|------|
| `Promise.all` | 모두 성공해야 성공, **하나라도 실패하면 첫 실패 사유로 즉시 실패** |
| `Promise.allSettled` | 전부 끝날 때까지 기다리고 각 성공/실패를 알려 줌 |
| `Promise.race` | 가장 먼저 끝난 것(성공이든 실패든)의 결과 |
| `.catch()` / `.finally()` | 에러 처리 / 성공·실패와 무관하게 마지막에 실행 (`finally`는 인자를 받지 않는다) |

#### 2.3.4 async/await

```ts
async function handle(userId: string) {
  try {
    const user = await userRepo.find(userId);       // 순차
    const [plan, invoices] = await Promise.all([    // 병렬
      planRepo.find(user.planId),
      invoiceRepo.list(userId),
    ]);
    return { user, plan, invoices };
  } catch (e) {
    // 동기/비동기 에러를 한 곳에서 처리
    throw e;
  }
}
```

반드시 알아야 할 함정 세 가지:

1. **`return` vs `return await`**: `try/catch` 안에서 Promise를 그냥 `return`하면, 그 Promise가 나중에 reject되어도 **현재 함수의 catch가 잡지 못하고 호출자에게 넘어간다**. 로컬에서 잡으려면 `return await`를 쓴다.
2. **`forEach`/`map` + `async`는 안티패턴**: `forEach`는 async 콜백이 반환한 Promise를 무시한다. 그래서 전부 한꺼번에 시작되고, 끝나기를 기다리지도 않는다. 순차는 `for...of`, 병렬은 `Promise.all(items.map(...))`을 쓴다.
3. **불필요한 순차 await**: 서로 무관한 작업을 `await a(); await b();`로 쓰면 느리다. 독립적이면 `Promise.all`. (`map`으로 Promise를 만들고 `for`로 하나씩 `await`하는 방식은 앞쪽 Promise가 끝나야 실패를 알 수 있어 최적이 아니다. 책은 `Promise.all`을 권장한다.)

```ts
// 나쁜 예
items.forEach(async (i) => { await save(i); });   // save 완료를 아무도 기다리지 않음

// 좋은 예 (순차)
for (const i of items) await save(i);
// 좋은 예 (병렬, 개수가 적을 때)
await Promise.all(items.map(save));
```

- async/await로 하면 동기 `throw`와 비동기 Promise rejection을 <strong>하나의 `try/catch`</strong>로 같이 처리할 수 있다.
- 동시성 제한이 필요하면 앞에서 만든 `TaskQueue`를 그대로 재사용한다 (내부 구현이 Promise든 async/await든 `runTask()`가 Promise를 반환하는 인터페이스는 같다).

**SaaS에서 왜 중요한가**: 요청 하나에서 DB, 캐시, 외부 API를 여러 번 부른다. 순차/병렬 선택이 응답 시간을 좌우하고, 에러 처리를 놓치면 프로세스가 죽거나 데이터가 반쯤만 저장된다.

> 🔗 NestJS 연결: 컨트롤러/서비스 메서드는 모두 `async`이며, 던진 예외는 Exception Filter가 HTTP 응답으로 바꾼다.

> 📖 원문: 4장 Callback hell, control flow patterns / 5장 Promises, Async/await, Error handling, Sequential and parallel execution

> **🎮 C++ 서버와 비교 (보충)**
> - "단일 스레드 race"는 C++ 로직 스레드에서 DB 비동기 요청을 보내고 완료 콜백에서 **세션 상태를 다시 검증**하던 상황과 똑같다. 콜백이 돌아왔을 때 그 유저는 이미 로그아웃했거나 아이템을 팔았을 수 있다. JS에서는 `await` 한 줄이 그 "요청을 보내고 콜백을 기다리는" 경계다.
> - Promise는 `std::future`와 비슷하지만 ⚠️ 블로킹 `get()`이 없다(결과는 루프가 `then` 콜백으로 준다). 또 `new Promise(executor)`의 executor와 `async` 함수 본문은 **만드는 즉시 실행을 시작**하며, Promise 자체에는 취소 기능이 없다(3.2).
> - TaskQueue(제한된 병렬)는 "동시 DB 요청 수 상한"이나 세마포어로 외부 호출 수를 묶던 것과 같은 역할이다.

### 2.4 스트림(Streams)과 백프레셔(Backpressure)

**한 줄 요약:** 대용량은 청크 단위 스트림으로 흘리고, `write()` → `false` / `drain` 백프레셔를 지키며, 연결과 에러 정리는 `pipeline()`에 맡긴다.

#### 2.4.1 스트림이 왜 필요한가

- **버퍼링 방식**: 파일 전체를 메모리에 읽은 뒤 처리 → 파일이 크면 메모리 폭발, 처리 시작도 늦다.
- **스트림 방식**: 데이터를 **조각(chunk) 단위로 흘려보내며** 처리 → 메모리를 적게 쓰고, 일부가 도착하자마자 다음 단계가 시작된다.

```ts
import { createReadStream, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

// (보충) 큰 파일을 메모리에 올리지 않고 압축 — 원서는 콜백 방식 pipeline(...streams, cb)을 쓰며, Promise 버전(stream/promises)은 원서 외 예제다
await pipeline(
  createReadStream('big.csv'),
  createGzip(),
  createWriteStream('big.csv.gz'),
);
```

- **조합성(Composability)**: 스트림은 레고처럼 이어 붙인다 (읽기 → 변환 → 압축 → 암호화 → 쓰기).

#### 2.4.2 네 가지 종류

| 종류 | 역할 | 예 |
|------|------|-----|
| Readable | 데이터 원천 | 파일 읽기, HTTP 요청 본문 |
| Writable | 데이터 목적지 | 파일 쓰기, HTTP 응답 |
| Duplex | 읽기+쓰기 둘 다 | TCP 소켓 |
| Transform | 읽으면서 변환 | gzip, CSV 파서 |

- HTTP의 `req`는 Readable, `res`는 Writable이다.
- Readable은 `for await (const chunk of stream)`로 읽을 수 있다 (async iterator).
- 객체 단위로 흘리려면 `objectMode: true`.

#### 2.4.3 백프레셔(Backpressure)

빠른 생산자가 느린 소비자에게 데이터를 너무 빨리 밀어 넣으면 중간 버퍼가 계속 커져 메모리가 터진다. 이를 막는 신호 체계가 백프레셔다.

- Writable의 `write()`는 내부 버퍼가 `highWaterMark`(기본값 약 16KB)를 넘으면 **`false`를 반환**한다. → "잠깐 멈춰라"
- 버퍼가 비워지면 **`drain` 이벤트**가 발생한다. → "다시 써도 된다"
- 이 신호는 **권고일 뿐 강제가 아니다.** 무시하면 메모리가 계속 늘어난다.
- **`pipe()`나 `pipeline()`을 쓰면 이 조절을 자동으로 해 준다.** 직접 `write()` 루프를 돌 때만 신경 쓴다.

```ts
function writeMany(out: NodeJS.WritableStream, lines: string[]) {
  let i = 0;
  function next() {
    while (i < lines.length) {
      if (!out.write(lines[i++] + '\n')) {
        out.once('drain', next);   // 버퍼가 비면 이어서
        return;
      }
    }
    out.end();
  }
  next();
}
```

#### 2.4.4 에러 처리: `pipeline()`을 써라

`pipe()`는 에러가 파이프라인 전체로 전파되지 않아, 스트림마다 `error` 리스너를 따로 달아야 한다. 또 에러가 난 스트림은 파이프에서 분리(unpipe)될 뿐 **destroy되지 않아** 파일 디스크립터·연결 같은 자원이 남고 메모리가 샐 수 있다. `stream.pipeline(a, b, c, cb)`은 각 스트림에 error/close 리스너를 달아, 성공이든 에러든 끝나면 모든 스트림을 정리하고 에러를 콜백 첫 인자로 넘겨 준다. (보충) Promise 버전은 `node:stream/promises`의 `pipeline`이다.

**SaaS에서 왜 중요한가**: CSV/엑셀 내보내기, 대용량 업로드/다운로드, S3 전송, 로그 처리에서 스트림을 안 쓰면 요청 몇 개만으로 메모리가 바닥난다.

> 🔗 NestJS 연결: 파일 다운로드 시 `StreamableFile`을 반환하고, 업로드는 Multer가 스트림 기반이다.

> 📖 원문: 6장 Discovering the importance of streams, Anatomy of streams, Backpressure, Connecting streams using pipes, Better error handling with pipeline()

> **🎮 C++ 서버와 비교 (보충)**
> - 백프레셔는 IOCP 서버의 **세션별 송신 큐 상한**과 같은 문제다. 느린 클라이언트에게 `WSASend`할 데이터가 무한히 쌓이면 메모리가 터지므로, 한도를 넘으면 송신을 멈추거나 연결을 끊었다. `write()`의 `false`는 "송신 큐 상한 도달", `drain`은 "완료 통지로 큐가 비었다"에 해당한다.
> - ⚠️ 차이: C++에서는 상한을 직접 만들어 강제했지만, Node는 신호만 주고 강제하지 않는다. 그래서 `pipe()`/`pipeline()`에 맡기거나 직접 신호를 지켜야 한다.
> - 수신 쪽도 같다. 소켓 Readable을 멈춰(`pause()`) 내부 버퍼가 `highWaterMark`까지 차면 Node가 소켓 읽기를 멈추고, 이어서 커널 수신 버퍼가 차면 TCP 흐름 제어가 상대의 송신을 늦춘다.

### 2.5 비동기 초기화와 요청 최적화 (Advanced Recipes)

**한 줄 요약:** 비동기로 초기화되는 컴포넌트는 지역 확인·지연된 시작·초기화 전 큐로 다루고, 같은 요청은 진행 중 Promise를 공유(배칭)한 뒤 캐시한다.

#### 2.5.1 비동기로 초기화되는 컴포넌트

DB처럼 **연결/핸드셰이크가 끝나야 사용할 수 있는** 모듈이 있다. 준비 전에 `query()`를 부르면 "아직 연결 안 됨" 오류가 난다. 책은 세 가지 해법을 든다.

| 방법 | 설명 | 단점 |
|------|------|------|
| **지역 초기화 확인** | API를 부를 때마다 `connected`를 확인하고, 아직이면 `once(db, 'connected')`로 기다림 | 매 호출마다 보일러플레이트 (확인 코드를 제공자 쪽으로 옮길 수도 있음) |
| **지연된 시작(Delayed startup)** | 초기화가 끝난 뒤에야 그 컴포넌트를 쓰는 코드(또는 앱 전체)를 시작 | 어느 코드가 쓰는지 미리 알아야 해서 깨지기 쉽고, 앱 전체를 미루면 시작 시간이 늘며 재초기화(reinitialize)를 다루지 못함 |
| **초기화 전 큐(Pre-initialization queue)** | 준비 전 호출을 명령(Command)으로 큐에 쌓아 두었다가, 준비가 끝나면 한꺼번에 실행 | 구현이 조금 더 복잡 |

- 큐 방식이면 사용하는 쪽은 초기화 상태를 신경 쓰지 않아도 된다. 큐잉 상태와 초기화 완료 상태를 나누는 **State 패턴**으로 보일러플레이트를 줄일 수도 있다.
- 실제 사례: Mongoose는 모든 작업을 큐에 쌓았다가 연결 후 실행하며, PostgreSQL 클라이언트 `pg`도 비슷한 큐를 쓴다.
- 코드를 수정할 수 없는 컴포넌트는 래퍼/프록시로 감싸 같은 기법을 쓴다.

```ts
async function bootstrap() {
  await db.connect();     // 지연된 시작: 준비를 먼저 끝낸 뒤
  server.listen(3000);    // 요청을 받기 시작
}
```

> 🔗 NestJS 연결: 커스텀 Provider의 `useFactory: async () => ...`는 비동기 초기화가 끝난 값을 주입해 주며, `OnModuleInit` 같은 생명주기 훅도 같은 문제를 다룬다.

#### 2.5.2 비동기 요청 배칭(Batching)과 캐싱(Caching)

- **배칭**: 같은 입력으로 같은 비동기 작업이 이미 **진행 중**이면, 새로 시작하지 않고 진행 중인 작업에 편승해 결과를 함께 받는다. 실제 작업은 한 번만 실행된다. 캐시보다 단순하다 (무효화 전략이 필요 없음).
- **캐싱**: 작업이 끝나면 결과를 저장(메모리 변수나 Redis)해 다음 호출부터 바로 돌려준다. 요청이 시간상 흩어져 있거나 작업이 빠르면 배칭만으로는 효과가 적다.
- 비동기에서는 **둘을 함께** 써야 최적이다. 캐시가 채워지기 전에 동시에 들어온 요청들은 배칭으로 묶고, 완료 시 캐시를 **한 번만** 채우며, 이후 요청은 캐시에서 준다. (그렇지 않으면 동시 요청마다 캐시를 또 채운다.)
- **Promise가 이 일에 딱 맞다.** ① 한 Promise에 `then()`을 여럿 붙일 수 있고(배칭), ② 이미 끝난 Promise에 `then()`을 붙여도 결과가 항상 **비동기로** 주어진다(캐시 값을 동기로 반환해 Zalgo가 생기는 문제도 함께 해결). 요청 인자를 키로 Promise를 `Map`에 저장하면 된다.

```ts
const running = new Map<string, Promise<number>>();
function totalSales(product: string) {
  if (running.has(product)) return running.get(product)!;          // 배칭
  const p = totalSalesRaw(product);
  running.set(product, p);
  p.finally(() => running.delete(product));
  return p;
}
```

실무 주의점 (책의 정리):

- 캐시가 커지면 메모리를 잡아먹는다 → **LRU/FIFO** 같은 정책으로 크기를 제한한다.
- 서버가 여러 프로세스면 메모리 캐시는 인스턴스마다 값이 달라질 수 있다 → **Redis/Memcached** 같은 공유 저장소를 쓴다.
- 만료 시간(TTL)이 아니라 값이 바뀔 때 수동으로 무효화하면 더 신선하지만 관리가 훨씬 복잡하다. "컴퓨터 과학에서 어려운 건 캐시 무효화와 이름 짓기"라는 격언이 인용된다.

**SaaS에서 왜 중요한가**: 무거운 집계 쿼리나 외부 API에 요청이 몰릴 때 DB와 외부 서버를 보호한다.

> 📖 원문: 11장 Dealing with asynchronously initialized components, Asynchronous request batching and caching

---

## 코어 3. 경계에서의 실패·취소·컨텍스트

> 요청 하나가 **바깥 세계(외부 API, 파일, 결제사 웹훅)와 닿는 경계**에서 지켜야 할 규율이다. 무엇이 실패했는지 구분하고(3.1), 기다림에 끝을 두고(3.2, 3.3), "이게 누구의 요청인가"를 잃지 않으며(3.4), 오가는 바이트를 정확히 다룬다(3.5, 3.6).

### 3.1 에러 처리 전략: 운영 에러 vs 프로그래머 에러

**한 줄 요약:** 예상 가능한 운영 에러는 그 계층에서 처리하고, 프로그래머 에러는 기록 후 종료하며, 잊혀진 `await`는 린트로 막는다.

2.1에서 콜백의 에러 규칙과 fail-fast를 봤다. 여기서는 Promise/async 시대의 **에러 처리 전체 전략**을 정리한다.

#### 3.1.1 두 종류의 에러

| | 운영 에러(Operational error) | 프로그래머 에러(Programmer bug) |
|--|---------------------------|-------------------------------|
| 뜻 | 올바른 프로그램이 불완전한 바깥 세상을 만나 생기는 **예상 가능한 실패** | 코드 결함. 작성자가 상상하지 못한 상태 |
| 예 | 파일 없음(`ENOENT`), 연결 끊김(`ECONNRESET`), 타임아웃, 잘못된 사용자 입력 | `undefined is not a function`, 잘못된 인자 타입, 단언 실패 |
| 처리 | 그 계층에서 처리: 재시도, 대체 경로, 적절한 HTTP 상태 반환 | 복구 시도 금지. **로그 남기고 종료**, 감시자가 재시작 |
| 경보 | 발생 **비율**로 경보 | **발생할 때마다** 경보 |

- 에러를 구분할 때는 `err.message`(바뀔 수 있음)가 아니라 **`err.code`**(계약)로 판단한다.

#### 3.1.2 `cause`로 맥락 덧붙이기

```ts
try {
  return JSON.parse(await readFile(path, 'utf8'));
} catch (err) {
  throw new Error(`설정 로드 실패: ${path}`, { cause: err }); // 원래 에러를 보존
}
```

- 원래 에러(코드, 스택)를 버리지 않고 "무엇을 하려다 실패했는지"를 더한다. `console.error`는 `[cause]`까지 함께 출력한다.
- 감싸기는 **계층 경계에서만**(데이터 접근 계층 끝, HTTP 클라이언트 끝) 한다. 모든 함수에서 감싸면 5단 중첩이 되어 오히려 읽기 어렵다.

#### 3.1.3 `uncaughtException` / `unhandledRejection` 처리 원칙

- `uncaughtException`: 아무도 잡지 않은 예외가 이벤트 루프까지 올라온 것. 기본 동작은 스택 출력 후 **종료 코드 1로 종료**.
- **핸들러를 등록하면 그 기본 종료가 사라진다.** "로그만 찍고 계속 실행"하면 열린 트랜잭션, 안 풀린 락, 반쯤 갱신된 캐시를 안은 채 몇 시간 동안 틀린 응답을 낸다.
- `unhandledRejection`: reject된 Promise에 처리기가 없을 때. Node 15부터 기본 모드(`throw`)는 이를 uncaught 예외로 바꿔 프로세스를 종료시킨다. `--unhandled-rejections=none/warn`으로 끄지 않는다.
- 유일하게 정당한 사용법은 **기록하고 종료**다.

```ts
process.on('uncaughtException', (err, origin) => {
  writeSync(process.stderr.fd, `FATAL (${origin}): ${err?.stack ?? err}\n`); // 동기 쓰기
  process.exit(1); // 비동기 로그 flush는 실행되지 못할 수 있다
});
```

- 진행 중 요청을 마무리하고 죽는 것은 "복구"가 아니라 **종료 경로**(5.3, [Part 9](Part09_운영안정성.md)의 그레이스풀 셧다운 설명)다. "관찰만" 하려면 기본 종료를 바꾸지 않는 `uncaughtExceptionMonitor`를 쓴다.

#### 3.1.4 플로팅 프로미스(Floating promise): 잊혀진 `await`

```ts
async function transfer(tx: Tx, from: string, to: string, amount: number) {
  tx.debit(from, amount);        // ❌ await 누락: 실패해도 catch가 못 잡고, 순서도 뒤집힌다
  await tx.credit(to, amount);
  await tx.commit();
}
```

- 버려진 Promise는 조용하다. 테스트는 통과하고, 부하로 타이밍이 바뀔 때만 돈이 사라지는 식으로 드러난다.
- 사람 눈에 의존하지 말고 **typescript-eslint의 `no-floating-promises` 규칙을 CI에서 에러로** 켠다. 일부러 기다리지 않을 때는 `void sendAnalytics().catch(logError)`처럼 의도를 드러낸다.

**SaaS에서 왜 중요한가**: "에러는 다 잡아서 로그만 남긴다"는 습관이 데이터 불일치 사고의 흔한 원인이다. 예상 가능한 실패는 처리하고, 버그는 빨리 죽여서 깨끗한 상태로 재시작하게 해야 한다.

> 🔗 NestJS 연결: 운영 에러는 `HttpException` 계열로 던져 Exception Filter가 HTTP 응답으로 바꾸게 하고, 필터에서 처리되지 않는 5xx는 버그 신호로 보고 경보를 건다.

> 📖 원문: Node.js 교재 part2-async/14-errors (Chaining errors with cause, Operational errors versus programmer bugs, uncaughtException and unhandledRejection) / Node.js 완전 가이드 6장 6.8 (잊혀진 await)

> **🎮 C++ 서버와 비교 (보충)**
> - 프로그래머 에러를 "로그 남기고 종료, 감시자가 재시작"하는 것은 C++ 서버가 assert 실패나 access violation에서 **크래시 덤프를 남기고 와치독이 재시작**하던 철학과 같다.
> - ⚠️ 깨지는 곳: C++ 크래시는 메모리가 깨졌을 수 있어 계속 돌 수가 없지만, JS 예외는 메모리를 깨뜨리지 않아 "계속 돌려도 될 것처럼" 보인다. 그러나 열린 트랜잭션, 안 풀린 락, 반쯤 갱신된 캐시 같은 **논리 상태**는 이미 깨져 있을 수 있다. 그래서 종료가 정답이다.

### 3.2 취소와 타임아웃: AbortController / AbortSignal

**한 줄 요약:** Promise에 없는 취소를 `AbortController`/`AbortSignal`로 구현하고, 받은 `signal`은 끝까지 아래로 넘긴다.

JavaScript의 Promise에는 "취소" 기능이 없다. Node는 웹 표준인 `AbortController`(취소를 **거는 쪽**)와 `AbortSignal`(취소를 **듣는 쪽**)로 이를 해결한다. 둘 다 전역이라 import가 필요 없다.

| API | 용도 |
|-----|------|
| `new AbortController()` / `controller.abort(reason)` | 원할 때 직접 취소 |
| `AbortSignal.timeout(ms)` | ms 후 자동으로 취소되는 신호 (타이머 정리 불필요) |
| `AbortSignal.any([s1, s2])` | 여러 신호 중 하나라도 취소되면 취소 (사용자 취소 + 마감 시간 + 서버 종료) |

```ts
const signal = AbortSignal.any([AbortSignal.timeout(5_000), shutdownController.signal]);
try {
  const res = await fetch(url, { signal });
} catch (err: any) {
  if (err?.name === 'TimeoutError') throw new Error('billing timeout', { cause: err }); // (보충) timeout()의 이유
  if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') return; // 취소는 장애가 아님
  throw err;
}
```

- `fetch`, `fs/promises`, `child_process.spawn`, `events.once`, 타이머 Promise 등 많은 Node API가 `{ signal }` 옵션을 받는다. 반복 작업 중간에는 `signal.throwIfAborted()`로 확인하고, `abort(new Error('client disconnected'))`처럼 <strong>이유(reason)</strong>를 달면 로그에서 중단 원인이 보인다.
- 흔한 실수:
  - **신호를 만들고 아래로 전달하지 않음**: 바깥 함수만 멈추고 실제 DB/HTTP 호출은 계속 돈다. 받은 `signal`은 끝까지 넘긴다.
  - **취소를 에러로 집계**: 사용자가 탭을 닫을 때마다 500 로그와 에러 지표가 쌓인다. 취소는 별도 지표로 센다.
  - **오래 사는 신호에 리스너를 계속 추가**: 앱 전역 신호에 요청마다 `addEventListener`를 붙이면 리스너 누수가 생긴다. 요청이 끝나면 합성 신호는 버린다.

**SaaS에서 왜 중요한가**: 외부 API가 느려질 때 취소/타임아웃이 없으면 요청이 끝없이 쌓여 커넥션과 메모리가 고갈된다([Part 9](Part09_운영안정성.md)의 타임아웃 원칙을 Node에서 구현하는 표준 도구). 종료 시 진행 중 작업을 한꺼번에 멈추는 데도 쓴다.

> 📖 원문: Node.js 교재 part2-async/13-abort-and-cancellation (The API surface, Composing with AbortSignal.any(), reason/AbortError, Common mistakes) / Node.js 완전 가이드 6장 6.9

### 3.3 HTTP 클라이언트: fetch(undici), 커넥션 재사용, 타임아웃

**한 줄 요약:** `fetch`는 500에 reject하지 않고 요청 타임아웃 기본값도 없으니 `res.ok` 확인·본문 소비·`AbortSignal.timeout()`·keep-alive·멱등 재시도를 직접 챙긴다.

SaaS 백엔드는 결제, 메일, 다른 내부 서비스로 **나가는 HTTP 호출**이 많다. Node에는 클라이언트가 셋 있다.

| | `http.request()` | 글로벌 `fetch` | `undici` 패키지 |
|--|------------------|---------------|-----------------|
| 내부 구현 | Node 자체 클라이언트 | **undici** | undici |
| 커넥션 풀 | `http.Agent` | undici 풀 (`http.Agent` 설정 무시) | `Pool`/`Agent` |
| 타임아웃 | 소켓 유휴 타임아웃만 | **`AbortSignal` 하나로 전체** | 연결/헤더/본문 단계별 |

권장: 일반적인 JSON 호출은 `fetch`, 단계별 타임아웃이나 세밀한 풀 설정이 필요하면 `undici`를 직접 쓴다.

```ts
const res = await fetch(`${BILLING_URL}/invoices/${id}`, {
  signal: AbortSignal.timeout(3_000),           // 타임아웃은 직접 걸어야 한다
});
if (!res.ok) {
  await res.body?.cancel();                     // 본문을 버려도 반드시 소비/취소
  throw new Error(`billing HTTP ${res.status}`);
}
const invoice = await res.json();
```

1. **`fetch`는 500에도 reject하지 않는다.** 네트워크 실패일 때만 reject한다. `res.ok`/`res.status`를 매번 확인한다. 안 하면 HTML 에러 페이지에 `res.json()`을 불러 엉뚱한 `SyntaxError`가 난다.
2. **응답 본문은 읽거나 취소한다.** 상태만 보고 버리면 그 연결이 풀로 돌아가지 못해 커넥션이 샌다.
3. **"요청 타임아웃" 기본값은 없다고 생각한다.** `fetch`에는 `timeout` 옵션이 없고, `http.request`의 `timeout`은 "유휴" 타임아웃이라 1바이트씩 천천히 보내는 서버에는 영원히 안 걸린다. **모든 외부 호출에 `AbortSignal.timeout()`으로 전체 마감 시간**을 건다. 내 서버의 요청 타임아웃보다 짧게 잡아야 의미 있는 에러를 돌려줄 수 있다.
4. **커넥션은 재사용(keep-alive)한다.** 매번 TCP+TLS를 새로 맺으면 지연이 크게 붙는다(왕복 30ms 링크라면 TCP+TLS 1.2 기준 약 90ms, TLS 1.3이면 약 60ms). `fetch`와 전역 Agent는 기본으로 재사용하지만, <strong>`new http.Agent()`를 직접 만들면 `keepAlive` 기본값이 `false`</strong>이므로 `keepAlive: true`와 `maxSockets`를 명시한다.
5. **재시도는 멱등한 요청만**, 지수 백오프+지터로 한다 ([Part 9](Part09_운영안정성.md)). 타임아웃 난 `POST`를 그냥 재시도하면 결제가 두 번 될 수 있다(멱등 키 필요).

**SaaS에서 왜 중요한가**: 외부 API 하나가 느려졌을 때 타임아웃 없는 호출이 쌓여 내 서비스 전체가 멈추는 연쇄 장애의 출발점이 바로 여기다.

> 🔗 NestJS 연결: (보충) `@nestjs/axios`의 `HttpModule.register({ timeout })`처럼 HTTP 클라이언트를 모듈로 감쌀 때 타임아웃과 keep-alive Agent를 한곳에서 설정한다.

> 📖 원문: Node.js 교재 part5-networking/36-http-clients (Three clients, fetch in Node, Timeouts layer by layer, Common mistakes: keepAlive, response body, fetch on 500)

### 3.4 AsyncLocalStorage: 요청 ID·테넌트 ID 전파

**한 줄 요약:** 요청 ID·테넌트 ID는 전역 변수가 아니라 비동기 흐름을 따라다니는 `AsyncLocalStorage.run()`으로 전파하고, 작은 값만 담는다.

**문제**: 요청 처리 4단계 아래의 함수가 로그에 요청 ID를 남기려면, 그 사이 모든 함수 인자에 `requestId`를 끼워 넣어야 한다. 전역 변수는 안 된다. `await` 사이에 다른 요청 수백 개가 끼어들어 값을 덮어쓰기 때문이다 (1.1.4).

**해법**: `AsyncLocalStorage`(ALS)는 **호출 스택이 아니라 "비동기 실행 흐름"을 따라다니는 저장소**다. `run()` 안에서 시작된 모든 것(await 이후, 타이머, 이벤트 콜백)은 같은 저장소를 본다.

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

type Ctx = { requestId: string; tenantId?: string };
export const als = new AsyncLocalStorage<Ctx>();

app.use((req, _res, next) => {
  als.run({ requestId: req.headers['x-request-id'] as string ?? randomUUID() }, next);
});

// 어디서든: logger.info({ ...als.getStore() }, '결제 시도');
```

- 동시에 들어온 두 요청은 같은 스레드에서 번갈아 실행돼도 **각자 독립된 저장소**를 본다. 진입은 `run()`으로 하고, 실험적이며 범위가 새기 쉬운 `enterWith()`는 피한다.
- 인증 후 테넌트 ID는 `run()`을 중첩하지 말고 **기존 저장소 객체에 필드를 추가**한다. 인스턴스도 필드마다 만들지 말고 하나에 담는다 (활성 인스턴스마다 비동기 전환 비용이 붙는다).

| 주의 | 이유와 대처 |
|------|------------|
| **작은 값만 저장** | 저장소에 있는 것은 그 요청의 비동기 작업이 하나라도 남아 있는 동안 메모리에서 안 풀린다. 요청 본문, 응답 객체, 쿼리 결과를 넣으면 누수처럼 보인다. **ID와 작은 스칼라만** 넣는다 |
| **컨텍스트 유실** | 네이티브 애드온, 직접 만든 thenable, 콜백을 모아 뒀다가 나중에 부르는 풀/큐에서 `getStore()`가 `undefined`가 될 수 있다. 새 DB 드라이버·큐 클라이언트를 도입하기 전 콜백 안에서 `getStore()`를 찍어 확인한다 |
| **경계를 넘지 못함** | Worker 스레드, 자식 프로세스, 다른 서비스로의 HTTP 호출에는 전달되지 않는다. 헤더(표준은 W3C `traceparent`)나 메시지 필드로 직접 실어 보낸다 |

**SaaS에서 왜 중요한가**: 멀티테넌트 서비스에서 "이 로그/쿼리가 어느 테넌트, 어느 요청 것인가"를 함수 시그니처를 오염시키지 않고 끝까지 전달하는 표준 방법이다. 로그 상관관계, 감사 로그, 테넌트 필터의 기반이 된다.

> 🔗 NestJS 연결: (보충) Request 스코프 Provider는 요청마다 의존성 트리를 새로 만들어 비용이 크므로, 요청 컨텍스트는 ALS 기반(`nestjs-cls` 등)으로 다루는 경우가 많다. `nestjs-pino`의 요청 ID 로깅도 같은 원리다.

> 📖 원문: Node.js 교재 part2-async/15-async-context (The problem, run(), Context loss, What it costs, Production notes)

> **🎮 C++ 서버와 비교 (보충)**
> - IOCP 서버에서 OVERLAPPED 확장 구조체에 세션 포인터를 실어 두고 완료 통지에서 꺼내 쓰던 것처럼, ALS는 "이 비동기 작업이 어느 요청의 것인가"를 **런타임이 자동으로 들고 다니게** 해 준다.
> - ⚠️ `thread_local`은 답이 아니다. Node에서는 모든 요청이 같은 스레드에서 번갈아 돌기 때문에 스레드에 붙은 값은 사실상 전역 변수이고, `await` 사이에 다른 요청이 덮어쓴다.

### 3.5 Buffer와 인코딩 기초

**한 줄 요약:** Buffer는 V8 힙 밖의 바이트 배열이며, 문자열 ↔ 바이트 변환의 인코딩과 글자 수/바이트 수 차이를 늘 의식한다.

- **Buffer**: 바이트 배열(`Uint8Array`의 하위 클래스). 파일, 소켓, 해시 결과처럼 **문자열이 아닌 바이너리 데이터**를 담는다. 실제 데이터는 V8 힙 **밖**(external 메모리)에 있다 (5.4). 문자열 ↔ 바이트 변환에는 항상 **인코딩**이 있다.

| 인코딩 | 쓰임 |
|--------|------|
| `utf8` (기본) | 일반 텍스트. 한글은 글자당 3바이트 |
| `base64` | 바이너리를 텍스트로 옮길 때 (이메일 첨부, JSON 안의 파일) |
| `base64url` | URL/헤더에 안전한 base64 (`+/=` 없음). 토큰에 적합 |
| `hex` | 해시·서명 값을 사람이 읽을 때 |

```ts
const buf = Buffer.from('안녕', 'utf8');   // 6바이트
'안녕'.length;                              // 2 (글자 수)
Buffer.byteLength('안녕', 'utf8');          // 6 (바이트 수) ← Content-Length는 이것
buf.toString('base64url');                  // '7JWI64WV'
```

흔한 실수:
- **글자 수와 바이트 수 혼동**: `Content-Length`에 `str.length`를 넣으면 한글이 섞인 응답이 깨진다. `Buffer.byteLength()`를 쓴다.
- **스트림 청크마다 `toString()`**: 한글 한 글자(3바이트)가 두 청크에 걸쳐 잘리면 깨진 문자(�)가 된다. 텍스트 스트림은 `setEncoding('utf8')`이나 `StringDecoder`를 쓰거나, 청크를 `Buffer.concat()`으로 모은 뒤 한 번에 변환한다.
- **`Buffer.allocUnsafe()`**: 0으로 초기화하지 않아 이전 메모리 내용(다른 요청 데이터일 수 있음)이 남아 있다. 기본은 `Buffer.alloc()`, 폐기된 `new Buffer()`는 쓰지 않는다.

**SaaS에서 왜 중요한가**: 파일 업로드, 웹훅 서명 검증, 토큰 생성, 다국어 텍스트 처리에서 인코딩을 헷갈리면 데이터가 조용히 깨지거나 서명이 안 맞는다.

> 📖 원문: Node.js 교재 part3-data/16-buffers (What a Buffer actually is, Allocating memory, Character encodings, Common mistakes)

> **🎮 C++ 서버와 비교 (보충)**
> - Buffer는 패킷 버퍼(`std::vector<uint8_t>`)에 해당한다. ⚠️ 반면 JS 문자열의 `length`는 바이트 수가 아니라 UTF-16 코드 유닛 수다(`'안녕'.length`는 2, 이모지 하나는 보통 2). 패킷 길이 헤더나 `Content-Length`에는 항상 `Buffer.byteLength()`를 쓴다.
> - 스트림 청크마다 `toString()`해서 한글이 깨지는 문제는 TCP 스트림에서 패킷 경계가 recv 경계와 맞지 않아 **패킷 조립(프레이밍)**이 필요했던 것과 같은 종류의 문제다. 청크 경계는 의미 경계가 아니다.

### 3.6 crypto 필수: 난수, 해시, HMAC, 상수 시간 비교

**한 줄 요약:** 추측되면 안 되는 값은 crypto 난수로, 위변조 감지는 HMAC으로, 서명 비교는 `timingSafeEqual`로, 비밀번호는 일부러 느린 해시로 다룬다.

원칙: **암호 알고리즘을 직접 발명하지 않는다.** 검증된 프로토콜과 Node 내장 `node:crypto`를 쓴다.

#### 3.6.1 난수: `Math.random()` 금지

`Math.random()`은 출력만 보고 내부 상태를 복원할 수 있는 비암호학적 난수다. 세션 ID, 비밀번호 재설정 토큰, API 키, 초대 링크처럼 **추측되면 안 되는 값에는 절대 쓰지 않는다** (재시도 지터 정도에만 쓴다). 토큰은 최소 16바이트, 보통 32바이트로 만들고 URL에 안전한 `base64url`로 인코딩한다.

```ts
import { randomBytes, randomUUID, randomInt } from 'node:crypto';

const resetToken = randomBytes(32).toString('base64url'); // 256비트 토큰
const requestId  = randomUUID();                           // UUID v4
const otp = String(randomInt(0, 1_000_000)).padStart(6, '0'); // 치우침 없는 6자리
```

#### 3.6.2 해시 vs HMAC vs 비밀번호 해시

| 목적 | 도구 |
|------|------|
| 우연한 손상 감지, 캐시 키, ETag, 중복 제거 | 해시 (`createHash('sha256')`) |
| **비밀 키 없는 사람의 위변조 감지** (웹훅 서명, 서명된 URL) | **HMAC** (`createHmac('sha256', key)`) |
| 비밀번호 저장 | **argon2 / scrypt** (일부러 느린 함수, [Part 5](Part05_API보안기본.md)의 비밀번호 해시 설명) |

- 해시는 "안 바뀌었다"만 알려 주고 "누가 만들었는지"는 보장하지 않는다(누구나 계산 가능). 그렇다고 `sha256(secret + message)`로 흉내 내면 길이 확장 공격으로 위조된다. HMAC을 쓴다.
- 비밀번호를 SHA-256+솔트로 저장하지 않는다. GPU가 초당 수십억 번 시도할 수 있을 만큼 빠르기 때문이다. 또 `scryptSync()`를 로그인 라우트에서 부르면 이벤트 루프가 막히므로 비동기 버전을 쓴다.

#### 3.6.3 웹훅 서명 검증과 `timingSafeEqual`

`===` 비교는 첫 번째로 다른 바이트에서 멈추므로, 응답 시간을 재면 서명을 한 바이트씩 알아낼 수 있다(타이밍 공격). **상수 시간 비교**를 쓴다.

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyWebhook(rawBody: Buffer, signatureHex: string, secret: string) {
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(signatureHex, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected); // 길이가 다르면 throw하므로 먼저 확인
}
```

- (보충) 서명은 **파싱 전 원본 바이트(raw body)** 기준으로 계산된다. JSON을 파싱했다가 다시 직렬화하면 공백·키 순서가 달라져 서명이 맞지 않는다.

**SaaS에서 왜 중요한가**: 결제사/외부 서비스 웹훅 검증, 비밀번호 재설정·초대 토큰, API 키 발급은 모든 SaaS에 있는 기능이고, 여기서의 작은 실수가 바로 계정 탈취로 이어진다.

> 🔗 NestJS 연결: (보충) 웹훅 서명 검증에는 `NestFactory.create(AppModule, { rawBody: true })`로 `req.rawBody`를 받아 Guard에서 검증한다.

> 📖 원문: Node.js 교재 part6-security/41-crypto-essentials (Hashing, HMAC, Randomness, Timing attacks and timingSafeEqual, Common mistakes)

---

## 코어 4. 디자인 패턴이 NestJS의 뿌리다

> 이 코어의 결정적 지식: **"Middleware/DI 같은 Node 패턴을 프레임워크가 포장한 것이 NestJS다."** 작은 모듈 철학(4.1)과 모듈 캐시(4.2)에서 싱글턴의 결합 문제가 나오고, 그것을 DI·IoC로 푸는 것(4.3)이 NestJS Module·Provider·`useFactory`의 존재 이유다. 구조 패턴(4.4)과 행위 패턴(4.5)은 Interceptor·Guard·`PassportStrategy`로 이어진다. Observer(EventEmitter)는 2.2에서 다룬다.

### 4.1 Node.js 철학

**한 줄 요약:** 작은 코어·작은 모듈·작은 표면적·단순함 — 한 가지 일만 하는 모듈이 변경 비용을 낮춘다.

Node.js 세계는 몇 가지 생각을 공유한다. 라이브러리를 고르거나 내 모듈을 만들 때 기준이 된다.

- **작은 코어(Small core)**: Node 자체는 최소 기능만 제공하고 나머지는 npm 생태계(userland)가 채운다.
- **작은 모듈(Small modules)**: 한 모듈은 한 가지 일만 잘한다. 작을수록 이해, 테스트, 교체가 쉽다.
- **작은 표면적(Small surface area)**: 밖으로 내보내는 기능을 최소로 한다. 함수 하나만 export하는 모듈이 흔하다.
- **단순함과 실용주의(Simplicity & pragmatism)**: 완벽한 설계보다 동작하는 단순한 설계를 우선한다.

**SaaS에서 왜 중요한가**: 서비스가 커질수록 "작고 한 가지 일만 하는 모듈"이 변경 비용을 낮춘다. NestJS에서 기능별 Module로 나누는 이유와 같다.

> 🔗 NestJS 연결: 도메인별 Module(예: `BillingModule`, `UsersModule`)로 쪼개고, 외부에는 필요한 Provider만 `exports`한다.

> 📖 원문: 1장 The Node.js philosophy

### 4.2 모듈 시스템 (CommonJS와 ESM)

**한 줄 요약:** CJS는 동기 `require`와 모듈 캐시(사실상 싱글턴), ESM은 정적 분석과 읽기 전용 live binding이다. 순환 의존성은 없애고 내 프로젝트의 모듈 방식을 정확히 안다.

#### 4.2.1 CommonJS(CJS)

Node의 원조 모듈 시스템이다. `require`로 가져오고 `module.exports`로 내보낸다.

- **`require`는 동기**로 동작한다. 파일을 읽고 실행한 뒤 결과를 돌려준다.
- **모듈 캐시**: 한 번 로드된 모듈은 캐시되어, 다시 `require`해도 같은 객체를 돌려준다. 그래서 모듈 하나가 사실상 싱글턴처럼 동작한다.
- **`exports` vs `module.exports`**: `exports`는 `module.exports`를 가리키는 별칭일 뿐이다. `exports = 값`처럼 재할당하면 끊어진다. 통째로 바꾸려면 `module.exports = ...`를 쓴다.
- **해석 알고리즘(Resolving)**:
  - `./`, `/`로 시작하면 파일 경로
  - 아니면 먼저 내장 모듈(`fs`, `http` 등)
  - 없으면 현재 위치에서 위로 올라가며 `node_modules`를 탐색
  - 그래서 패키지마다 자기만의 버전의 의존성을 가질 수 있다.
- **순환 의존성(Circular dependency)**: A가 B를, B가 A를 require하면 **먼저 로드된 쪽이 미완성 상태로 넘어간다**. 로드 순서에 따라 결과가 달라지는 이상한 버그가 생긴다. 구조를 바꿔 순환 자체를 없애는 것이 정답이다.

모듈을 내보내는 흔한 방식:

| 방식 | 특징 |
|------|------|
| 이름 있는 export | 여러 기능을 객체로 묶어 내보냄 |
| 함수 하나 export | 가장 작은 표면적(substack 패턴) |
| 클래스 export | 여러 인스턴스를 만들 때 |
| 인스턴스 export | 캐시 덕분에 싱글턴처럼 동작 (DB 연결 등) |

#### 4.2.2 ESM (ECMAScript Modules)

표준 문법인 `import` / `export`다. 요즘 프로젝트는 대부분 ESM 문법(TypeScript 포함)을 쓴다.

```ts
// math.ts
export function add(a: number, b: number) { return a + b; }
export default class Calculator {}

// main.ts
import Calculator, { add } from './math.js';
const { default: mod } = await import('./lazy.js'); // 동적(비동기) import
```

CJS와의 차이점:

- **정적 분석**: import가 코드 실행 전에 분석되어 의존성 그래프가 먼저 만들어진다. (로딩 단계: 구성 → 인스턴스화 → 평가)
- **읽기 전용 live binding**: import한 값은 복사가 아니라 원본에 대한 "살아 있는 참조"다. 원본이 바뀌면 보이지만, 가져온 쪽에서 재할당은 못 한다.
- 순환 의존성을 CJS보다 안전하게 다루지만(선언 단계에서 연결), 여전히 피하는 게 좋다.
- **ESM은 항상 strict mode**이고 `__dirname`, `__filename`, `require`가 없다 (`import.meta.url`을 쓴다).
- ESM에서는 import할 때 **파일 확장자를 명시**해야 한다 (CJS `require`는 생략 가능). 최상위 `this`도 ESM에서는 `undefined`다.
- **상호 운용**: ESM에서 CJS 모듈을 `import`할 수는 있지만 **default export만** 가능하다 (`import { method }`는 오류). 반대로 **CJS에서 ES 모듈을 불러오는 것은 책 기준으로 불가능**하다. ESM은 JSON을 바로 import하지 못해 `createRequire(import.meta.url)`로 `require`를 만들어 쓴다고 설명한다.
- (보충) 동적 `import()`는 CJS에서도 ESM을 불러오는 우회로로 흔히 쓰이지만, 이 부분은 원서 2장에는 나오지 않는다.

**SaaS에서 왜 중요한가**: 모듈 방식이 CJS와 ESM으로 갈려 있어 설정 혼동이 생기기 쉽다. 자기 프로젝트의 모듈 방식(`package.json`의 `"type"`, `tsconfig`의 `module`)을 정확히 알고 있어야 한다.

> 🔗 NestJS 연결: NestJS 기본 템플릿은 TypeScript 컴파일 결과가 CommonJS다. NestJS의 Provider가 "기본적으로 싱글턴"인 것도 모듈 캐시 개념과 닮았다.

> 📖 원문: 2장 CommonJS modules, Module definition patterns, ESM, ESM and CommonJS differences and interoperability

### 4.3 생성(Creational) 디자인 패턴

**한 줄 요약:** 생성은 함수(Factory)와 fluent 체이닝(Builder)에 맡기고, 모듈 캐시 싱글턴의 결합은 DI로 풀며, 조립은 IoC 컨테이너(NestJS)에 넘긴다.

#### 4.3.1 Factory (팩토리)

객체를 `new`로 직접 만들지 않고, **함수가 대신 만들어 돌려주는** 패턴이다.

- 호출하는 쪽은 "어떤 클래스가 만들어지는지" 몰라도 된다 → 구현 교체가 쉽다.
- 생성 시 조건에 따라 다른 객체를 반환할 수 있다.
- 내부 상태를 클로저로 숨겨 캡슐화할 수 있다.

원서의 예는 파일 이름 확장자에 따라 `ImageJpeg`/`ImageGif`/`ImagePng`를 골라 만들어 주는 `createImage()`이고, 클래스를 숨기고 팩토리만 export하는 것도 강조한다. 실사례로 Knex 패키지가 export하는 것이 팩토리 함수다. 아래 코드는 (보충) 예시다.

```ts
// (보충) 원서 외 예시
interface Notifier { send(to: string, msg: string): Promise<void>; }

function createNotifier(kind: 'email' | 'sms'): Notifier {
  switch (kind) {
    case 'email': return new EmailNotifier();
    case 'sms':   return new SmsNotifier();
  }
}
```

#### 4.3.2 Builder (빌더)

생성자 인자가 길어 "어느 인자가 무엇인지" 헷갈리는 복잡한 객체를 <strong>fluent 인터페이스(단계별 메서드 체이닝)</strong>로 만드는 패턴이다. 원서의 실사례는 `http.request()`의 옵션이 많은 것을 `superagent`가 빌더 방식으로 감싼 것이다. (보충) Knex, TypeORM `QueryBuilder` 같은 쿼리 빌더도 같은 발상이다.

```ts
// (보충) 원서 외 예시
const q = db('users').where({ tenantId }).orderBy('createdAt', 'desc').limit(20);
```

#### 4.3.3 Singleton (싱글턴)

앱 전체에서 인스턴스를 **하나만** 쓰는 패턴이다. Node에서는 **모듈 캐시 덕분에** 인스턴스를 export하면 사실상 싱글턴이 된다 (`export const db = createDb()`).

단점: 모듈끼리 **단단히 결합**된다. 테스트에서 가짜 DB로 바꾸기 어렵다. 또 모듈 캐시는 전체 경로를 키로 쓰기 때문에, 같은 패키지의 서로 호환되지 않는 버전이 `node_modules`에 각각 설치되면 인스턴스가 둘이 된다. 그래서 원서는 "교과서적 싱글턴은 Node에 없다"고 보며(진짜 전역이 필요하면 `global`에 둔다), 제3자에게 배포하는 패키지는 상태를 두지 않으라고 권한다.

#### 4.3.4 와이어링(Wiring)과 의존성 주입(Dependency Injection, DI)

모듈이 다른 모듈을 직접 `import`해서 쓰면(하드코딩) 결합이 강하다. **DI는 필요한 의존성을 밖에서 넣어 주는 것**이다.

```ts
// 결합이 강한 방식
import { db } from './db';
class BlogService { list() { return db.query('...'); } }

// DI 방식: 생성자로 받는다 (Constructor injection)
class BlogService {
  constructor(private readonly db: Database) {}
  list() { return this.db.query('...'); }
}
const service = new BlogService(createDb(process.env.DB_URL!)); // 조립은 한곳에서
```

- 주입 방법: 생성자 주입(원서 예제가 쓰는 방식), 함수 인자 주입, 프로퍼티 주입.
- 장점: 결합이 느슨해지고 모듈 재사용과 격리 테스트가 쉬워진다 (원서는 가짜 DB로 바꾸기 어려운 싱글턴의 한계를 함께 지적한다).
- 단점: 코딩 시점에 의존 관계가 잘 안 보여 큰 앱에서 이해가 어렵고, 의존성 그래프를 손으로 올바른 순서로 만들어야 한다.
- 해결책: 조립 책임을 제3자에게 넘기는 **Inversion of Control**(service locator 또는 DI 컨테이너). 원서는 inversify와 awilix를 예로 든다. (보충) NestJS 내장 컨테이너가 이 역할이다.

**SaaS에서 왜 중요한가**: 결제, 이메일, 스토리지 같은 외부 의존성은 환경(개발/테스트/운영)마다 바뀐다. DI로 묶어 두면 테스트 가능성과 교체 용이성이 크게 좋아진다.

> 🔗 NestJS 연결: `@Injectable()` + 생성자 주입 + Module의 `providers`가 바로 DI 컨테이너다. 커스텀 Provider(`useFactory`, `useClass`, `useValue`)는 Factory와 DI의 결합이다.

> 📖 원문: 7장 Factory, Builder, Singleton, Wiring modules, Dependency Injection

> **🎮 C++ 서버와 비교 (보충)**
> - 모듈 캐시 싱글턴은 C++의 전역 객체나 Meyers 싱글턴(`static` 지역 변수)과 같은 장단점을 가진다: 쓰기 쉽지만 결합이 단단하고 테스트에서 바꿔 끼우기 어렵다.
> - 생성자 주입은 C++에서 인터페이스(순수 가상 클래스) 포인터를 생성자로 받던 방식과 같다. ⚠️ 차이: TypeScript 인터페이스는 런타임에 사라지므로 NestJS 컨테이너는 클래스 토큰이나 문자열/심벌 토큰으로 의존성을 찾는다.

### 4.4 구조(Structural) 디자인 패턴

**한 줄 요약:** 같은 인터페이스로 접근을 가로채는 Proxy, 특정 인스턴스에 기능을 덧붙이는 Decorator, 다른 인터페이스로 바꿔 주는 Adapter.

#### 4.4.1 Proxy (프록시)

원본 객체(subject)와 **똑같은 인터페이스**를 가진 대리 객체가 앞에서 접근을 가로채 제어한다. 인터페이스가 같기 때문에 클라이언트는 원본이든 프록시든 구분 없이 쓴다. (클래스 사이의 프록시가 아니라, **실제 인스턴스를 감싸는** 방식이라 원본의 내부 상태가 유지된다.)

책이 드는 쓰임새:

| 용도 | 설명 |
|------|------|
| 데이터 검증(Validation) | 원본에 넘기기 전에 입력을 검사 |
| 보안(Security) | 권한이 있을 때만 원본에 전달 |
| 캐싱(Caching) | 캐시에 없을 때만 원본을 호출 |
| 지연 초기화(Lazy initialization) | 만드는 비용이 큰 원본을 실제 필요할 때까지 미룸 |
| 로깅(Logging) | 메서드 호출과 인자를 기록 |
| 원격 객체(Remote objects) | 원격 객체를 로컬처럼 보이게 함 |

구현 기법은 세 가지다.

- **객체 합성(Composition)**: 원본을 내부에 보관하고, 가로챌 메서드만 새로 정의하며 나머지는 위임한다.
- **객체 확장(Object augmentation)**: 원본 객체의 메서드를 직접 덮어쓴다 (가장 간단하지만 원본을 바꾼다).
- **내장 `Proxy` 객체**: JS가 제공하는 `Proxy`로 모든 접근(get/set/호출)을 가로챈다.

```ts
// 합성 방식: 0으로 나누기를 막는 프록시 (책의 SafeCalculator 예제와 같은 발상)
class SafeCalculator {
  constructor(private calc: StackCalculator) {}
  divide() {
    if (this.calc.peekValue() === 0) throw new Error('Division by 0'); // 검증 추가
    return this.calc.divide();                                          // 나머지는 위임
  }
  putValue(v: number) { return this.calc.putValue(v); }
}
```

내장 `Proxy`로 객체의 속성 변경을 감지하는 **Change Observer**도 가능하며, Vue 3와 MobX가 이 방식으로 반응형 상태를 구현한다.

> 🔗 NestJS 연결: 캐시, 로깅처럼 "호출 앞뒤에 끼어드는" 기능을 Interceptor가 맡는 것은 이 발상과 닮았다.

#### 4.4.2 Decorator (데코레이터)

**기존 객체에 새 기능(메서드)을 동적으로 덧붙이는** 패턴이다. 같은 클래스의 모든 객체가 아니라 **꾸민 그 인스턴스에만** 적용되므로 상속과 다르다. 기존 메서드는 대개 그대로 위임하고, 필요하면 일부를 가로챌 수 있다.

- 구현 기법은 프록시와 같다: **합성**, **객체 확장**, **`Proxy` 객체**.
- 책의 예: LevelUP 데이터베이스 객체에 `subscribe()` 메서드를 붙이는 플러그인 (객체 확장 방식). Fastify의 `decorate`도 서버 인스턴스에 기능을 덧붙이는 예다.

```ts
// (보충) 원서의 LevelUP subscribe 플러그인을 단순화한 예시 (객체 확장 방식)
function withSubscribe(db: EventEmitter & { subscribe?: Function }) {
  db.subscribe = (pattern: Record<string, unknown>, listener: Function) => {
    db.on('put', (key, val) => {
      const match = Object.keys(pattern).every((k) => pattern[k] === val[k]);
      if (match) listener(key, val);
    });
  };
  return db;
}
```

**프록시 vs 데코레이터**: 개념상 프록시는 "접근 제어, 인터페이스 유지", 데코레이터는 "새 기능 추가"다. 하지만 JS에서는 경계가 흐릿해 두 이름이 섞여 쓰인다. 책은 이름에 얽매이지 말고 **서로 보완하는 도구**로 보라고 조언한다.

> 주의: 패턴 이름의 "Decorator"는 TypeScript의 `@Decorator` 문법과 별개다. (NestJS의 `@Injectable()`, `@UseGuards()` 등은 TS 문법이다.)

#### 4.4.3 Adapter (어댑터)

**한 객체의 기능을, 다른 인터페이스로 쓸 수 있게 바꿔 주는 래퍼**다. USB-A를 USB-C 포트에 꽂게 해 주는 변환 젠더와 같다. 대개 **합성**으로, 어댑터의 메서드가 어댑티(adaptee)의 메서드를 호출하도록 만든다. 책의 예는 LevelUP DB를 `fs`와 같은 API(`readFile`, `writeFile`)로 쓰게 하는 어댑터다.

```ts
// (보충) 원서 외 예시: 우리 앱이 기대하는 인터페이스
interface PaymentGateway { charge(amount: number, token: string): Promise<{ id: string }>; }

// 외부 SDK를 그 인터페이스에 맞춘다
class StripeAdapter implements PaymentGateway {
  constructor(private stripe: Stripe) {}
  async charge(amount: number, token: string) {
    const r = await this.stripe.paymentIntents.create({ amount, currency: 'krw', payment_method: token });
    return { id: r.id };
  }
}
```

**SaaS에서 왜 중요한가**: 결제, 메일, 스토리지 같은 외부 서비스를 앱이 기대하는 인터페이스 뒤로 감추면, 업체를 바꿔도 앱 코드는 그대로다.

> 📖 원문: 8장 Proxy, Decorator, The line between proxy and decorator, Adapter

### 4.5 행위(Behavioral) 디자인 패턴

**한 줄 요약:** 변하는 알고리즘을 갈아 끼우는 Strategy(Passport), 부가 처리를 비동기 순차 사슬로 잇는 Middleware(Express → NestJS Guard/Interceptor).

#### 4.5.1 Strategy (전략)

**변하는 부분(알고리즘)을 교체 가능한 객체(strategy)로 빼내고**, 공통 로직만 가진 객체(context)가 그것을 골라 쓰는 패턴이다. 전략들은 같은 인터페이스를 따른다. 복잡한 `if...else`/`switch`가 늘어나거나 같은 계열의 변형을 지원해야 할 때 특히 유용하다.

책의 두 예:

- **주문 결제**: `Order.pay()` 안에 결제수단별 `if...else`를 넣으면 새 결제수단을 추가할 때마다 `Order`를 고쳐야 한다. 결제 로직을 전략 객체에 맡기면 `Order`는 사용자·품목·가격 관리에만 집중하고, 결제수단은 얼마든지 늘릴 수 있다.
- **다중 형식 설정(Config)**: `Config` 클래스는 `get/set/load/save`만 담당하고, 직렬화/역직렬화(JSON, INI, YAML)는 전략 객체(`serialize`, `deserialize`)에 맡긴다.

```ts
interface FormatStrategy { serialize(d: object): string; deserialize(s: string): object; }
const jsonStrategy: FormatStrategy = { serialize: JSON.stringify, deserialize: JSON.parse };

class Config {
  data: object = {};
  constructor(private format: FormatStrategy) {}
  async load(path: string) { this.data = this.format.deserialize(await readFile(path, 'utf8')); }
  async save(path: string) { await writeFile(path, this.format.serialize(this.data)); }
}
```

실제 사례로 **Passport**가 있다. 로그인 과정의 공통 흐름은 그대로 두고, 인증 단계만 전략(OAuth, 로컬 DB 조회 등)으로 갈아 끼운다.

> 🔗 NestJS 연결: `@nestjs/passport`의 `PassportStrategy`(JwtStrategy, LocalStrategy)가 바로 이 패턴이다.

#### 4.5.2 Middleware (미들웨어)

책은 Middleware를 "Node.js에서 가장 특징적인 패턴 중 하나"로 소개한다. Express가 대중화했다.

- **Express 미들웨어**: `function (req, res, next)` 형태의 함수들이 **파이프라인**을 이룬다. 각 함수가 일을 마치고 `next()`를 부르면 다음 미들웨어가 실행된다.
- 하는 일: 본문 파싱, 압축/해제, 접근 로그, 세션, 암호화된 쿠키, CSRF 방어 등 **핵심 비즈니스 로직은 아니지만 필요한 부가 처리**("중간에 있는 소프트웨어").
- 일반화된 패턴: Intercepting Filter, Chain of Responsibility 패턴의 Node 버전이며, 데이터를 전처리/후처리하는 **비동기 순차 처리 사슬**이다. 핵심 구성요소는 **Middleware Manager**다.
  - `use()`로 미들웨어를 등록(보통 끝에 추가)하고, 새 데이터가 오면 등록된 순서대로 비동기 순차 실행한다.
  - 각 미들웨어는 **다음 단계로 넘기지 않고 중단**할 수 있다 (`next()`를 안 부르거나 에러를 전달). 에러가 나면 **에러 전용 미들웨어 사슬**이 실행되는 것이 보통이다.
  - 데이터 전달 방식은 정해져 있지 않다: 입력 객체에 속성을 덧붙이거나, 불변으로 두고 새 복사본을 반환하는 등 구현에 따라 다르다.
- 장점은 **유연성**이다. 핵심을 키우지 않고도 플러그인처럼 기능을 붙일 수 있다.
- 같은 발상의 다른 예: Koa(async/await 기반), Middy(AWS Lambda용). 책은 ZeroMQ 메시지에 JSON 직렬화, zlib 압축 미들웨어를 붙이는 예제를 든다.

```ts
// Middleware Manager의 뼈대 (책의 예제와 같은 발상)
class MiddlewareManager<T> {
  private list: Array<(msg: T) => T | Promise<T>> = [];
  use(fn: (msg: T) => T | Promise<T>) { this.list.push(fn); }
  async run(msg: T) {
    for (const fn of this.list) msg = await fn(msg); // 이전 결과가 다음 입력
    return msg;
  }
}
// 예: use(압축해제) → use(JSON파싱) → use(핸들러)
```

**SaaS에서 왜 중요한가**: 로깅, 인증, 본문 파싱, 요청 제한처럼 모든 요청에 공통인 처리를 비즈니스 로직에서 떼어 한 곳에서 관리한다.

> 🔗 NestJS 연결: NestJS는 내부적으로 Express/Fastify 위에서 동작하며 `NestMiddleware`가 Express식 `(req, res, next)` 미들웨어다. Guard, Interceptor, Pipe, Exception Filter는 이 사슬 발상을 역할별로 나눈 것이다.

> 📖 원문: 9장 Strategy, Middleware

---

## 코어 5. 확장과 운영

> 스레드 하나라서 일찍부터 프로세스를 복제해야 하고(5.1), 복제하면 프로세스 사이 통신은 유실·중복이 있는 메시징이 된다(5.2). 그 프로세스를 컨테이너에서 띄우고 내리는 운영 기초 — 환경변수·종료 코드·시그널(5.3), 메모리 한도(5.4), 재현 가능한 설치(5.5), 이미지와 PID 1(5.6) — 가 이어진다.

### 5.1 확장(Scaling) 기본

**한 줄 요약:** 스케일 큐브(X 복제·Y 분해·Z 분할) 중 Node는 일찍부터 X축 복제가 필요하므로, 인스턴스에 상태를 두지 말고 cluster·리버스 프록시·컨테이너로 복제한다.

#### 5.1.1 스케일 큐브(Scale Cube)

책은 확장을 세 축으로 설명한다.

1. **X축: 복제(Cloning)** — 같은 앱을 n개 띄워 각 인스턴스가 1/n의 부하를 처리. 가장 쉽고 저렴하며 효과적이다.
2. **Y축: 기능/서비스별 분해(Decomposing)** — 기능(인증, 결제 등)별로 독립된 앱으로 나눈다. 마이크로서비스가 이 축이다. 아키텍처와 운영에 미치는 영향이 가장 크다.
3. **Z축: 데이터 분할(Splitting)** — 각 인스턴스가 데이터의 일부만 담당 (예: 국가별, 해시 기반 분할).

Node는 스레드 하나로 동작해 코어를 다 쓰려면 일찍부터 복제가 필요하고, 복제는 처리량뿐 아니라 **가용성과 장애 허용**도 높여 준다. 복제를 하려면 각 인스턴스가 메모리나 디스크처럼 공유할 수 없는 곳에 공통 정보를 두지 않아야 한다.

#### 5.1.2 cluster 모듈

한 머신에서 **마스터(primary) 프로세스가 워커 프로세스를 여러 개 복제**하고 들어오는 연결을 워커에 분배한다 (Windows를 제외한 대부분의 시스템에서 기본은 라운드로빈).

```ts
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';

// (보충) 원서는 cluster.isMaster / os.cpus() 기반 예제. 여기서는 최신 API 이름으로 바꿔 쓴 것이다
if (cluster.isPrimary) {
  for (let i = 0; i < availableParallelism(); i++) cluster.fork();
  cluster.on('exit', (worker, code) => {
    if (code !== 0 && !worker.exitedAfterDisconnect) cluster.fork(); // 비정상 종료면 다시 띄움
  });
} else {
  startServer();
}
```

- **복원력**: 워커가 오류로 죽으면 마스터가 새로 띄우고, 그동안 다른 워커가 요청을 처리한다. 이미 맺어진 연결이 끊기는 실패는 피하기 어렵다.
- **무중단 재시작(Zero-downtime restart)**: 새 버전 배포 시 워커를 **하나씩** `disconnect()`(진행 중인 요청은 끝까지 처리)한 뒤 새 워커를 띄우고, 그 워커가 준비(listening)되면 다음 워커로 넘어간다. (책은 `SIGUSR2` 신호로 트리거하며, Windows에서는 동작하지 않는다.) `pm2`가 cluster 기반으로 로드밸런싱과 무중단 재시작을 제공한다.

#### 5.1.3 상태가 있는 통신(Stateful)과 로드밸런서

세션 정보를 프로세스 메모리에 두면, 다음 요청이 다른 인스턴스로 가는 순간 "로그인 안 된 상태"가 된다. 해법은 두 가지다.

| 해법 | 설명 |
|------|------|
| **상태 공유** | 세션 등을 PostgreSQL 같은 DB나 **Redis/Memcached** 같은 공유 저장소에 둔다. 코드 수정이 필요할 수 있다 |
| **Sticky 로드밸런싱** | 로드밸런서가 같은 세션은 항상 같은 인스턴스로 보낸다 (세션 ID 쿠키 또는 클라이언트 IP 해시) |

책은 sticky 방식이 "모든 인스턴스가 동일하고 서로 대체 가능"하다는 이중화의 장점을 무력화하므로 **가능하면 피하고**, 세션을 공유 저장소에 두거나 상태를 요청 자체에 담아 상태가 없게 만들라고 권한다. (Socket.IO처럼 sticky가 필요한 라이브러리도 있다.)

#### 5.1.4 리버스 프록시와 컨테이너

- cluster 대신(혹은 함께) **리버스 프록시**(Nginx 등) 뒤에 여러 독립 인스턴스를 두는 방식이 운영 환경에서 더 선호된다. 이유: 여러 **머신**에 분산 가능, 대부분 sticky를 기본 지원, 언어/플랫폼과 무관하게 라우팅, 더 다양한 로드밸런싱 알고리즘, 부가 기능 제공.
- **컨테이너(Container, OCI 표준)**: 코드와 의존성을 하나의 표준 단위로 묶어 로컬 개발 머신부터 클라우드 서버까지 똑같이 실행하게 해 준다. VM보다 오버헤드가 적고, 가장 널리 쓰이는 도구가 **Docker**다. **Kubernetes** 같은 컨테이너 오케스트레이션 플랫폼이 컨테이너의 배포와 확장을 관리한다.

#### 5.1.5 모놀리스 vs 마이크로서비스, 서비스 통합

- **모놀리스(Monolith)**: 모든 기능이 한 코드베이스, 한 프로세스에서 돈다. 내부적으로 모듈화할 수 있지만, 한 부분의 장애가 전체를 무너뜨릴 수 있고 경계가 강제되지 않아 모듈 간 **결합도가 쉽게 높아져** 복잡성 확장에 걸림돌이 된다.
- **마이크로서비스(Microservice)**: 작고 자족적인 서비스로 나눈다. 크기가 아니라 **느슨한 결합, 높은 응집도, 통합 복잡도**가 기준이다.
  - 장점: 서비스 하나가 죽어도 전체는 유지되고, 서비스를 통째로 다시 만들 수 있으며, 구현 세부가 원격 인터페이스 뒤에 숨어 재사용성이 높고, 서비스별로 독립 확장(Y축 + X축)이 가능하다.
  - **데이터 소유권**: 서비스마다 자기 DB를 가진다. DB를 공유하면 데이터로 인한 결합이 생긴다.
  - 단점: 서비스 간 통합, 배포, 모니터링, 코드 공유 같은 새로운 복잡도가 생긴다.
- **통합 패턴 세 가지**
  1. **API Proxy(API Gateway)**: 여러 API의 단일 진입점. 로드밸런싱, 캐싱, 인증, 요청 제한도 맡지만 구조적 통합일 뿐 의미적 통합은 아니다.
  2. **API Orchestration**: 여러 서비스를 조합해 새 기능을 만든다 (예: 결제 완료 시 결제 → 장바구니 삭제 → 재고 갱신을 조정하고, 여러 서비스의 데이터를 한 응답으로 모음). 단점은 모든 서비스를 알아야 해서 "God object"가 되기 쉽다는 것이다.
  3. **메시지 브로커 통합**: 서비스들이 이벤트를 발행/구독하도록 해 서로 직접 알지 못하게 한다 (다음 절).

**SaaS에서 왜 중요한가**: 사용자가 늘 때 가장 먼저 겪는 문제가 "서버 한 대로 부족"이다. 세션을 공유 저장소에 두는 등 인스턴스를 복제해도 문제가 없게 만들어 두면 대응이 쉽다.

> 🔗 NestJS 연결: NestJS 앱은 그대로 여러 인스턴스로 복제할 수 있고, 세션/캐시는 Redis로 빼며, 서비스 간 통신은 `@nestjs/microservices`(RabbitMQ, Kafka, Redis 등)를 쓸 수 있다.

> 📖 원문: 12장 An introduction to application scaling, The cluster module, Dealing with stateful communications, Scaling with a reverse proxy, Scaling applications using containers, Decomposing complex applications

> **🎮 C++ 서버와 비교 (보충)**
> - 게임 서버는 유저가 접속한 서버에 TCP 연결과 세션 상태가 함께 붙어 있는 **stateful 서버**다(사실상 sticky가 기본). HTTP API는 요청마다 연결과 인스턴스가 바뀔 수 있으므로, 상태를 외부(Redis/DB)로 빼야 복제가 자유롭다.
> - cluster로 한 머신에 워커 프로세스를 여러 개 띄우는 것은 채널/존 서버 프로세스를 코어 수만큼 띄우는 것과 비슷하다. ⚠️ 다만 워커 사이에는 메모리가 공유되지 않으므로, 프로세스 안 캐시·세션·rate limit 카운터는 워커마다 따로다.

### 5.2 메시징(Messaging)과 큐 개념

**한 줄 요약:** 큐는 생산자와 소비자를 분리해 메시지를 저장하며, at-least-once면 소비자는 처리 후 ack하고 멱등해야 한다. 큐 vs 스트림, 경쟁 소비자, Correlation ID를 구분한다.

#### 5.2.1 기본 개념

- **단방향(One-way)** vs **요청/응답(Request/Reply)**: 이메일이나 작업 분배는 단방향이고, 웹 서비스 호출이나 DB 질의는 요청/응답이다. 비동기 채널 위에서는 요청/응답이 더 복잡해지며, 핵심은 요청과 응답의 **관계를 요청한 쪽이 기억**하는 것이다.
- **메시지 종류**:
  - **명령(Command)**: 작업을 실행시키는 메시지 (직렬화된 Command 객체, RPC, REST 호출 등)
  - **이벤트(Event)**: 무슨 일이 일어났음을 알림 (예: 상태 변경 알림)
  - **문서(Document)**: 데이터 자체를 전달 (예: 질의 결과). 무엇을 하라는 지시도, 특정 사건과의 연결도 없다.
- **동기 vs 비동기 통신**: 동기는 전화 통화, 비동기는 문자 메시지에 비유된다. 비동기에서는 메시지를 **저장해 두었다가** 나중에 전달할 수 있다.
- **메시지 큐(Queue)**: 생산자와 소비자 사이에서 메시지를 저장한다. 소비자가 죽거나 느려져도 큐에 쌓였다가 복구 후 전달된다.
- **P2P vs 브로커(Broker)**: P2P는 노드가 서로의 주소와 프로토콜을 알아야 하고, 브로커는 송신자와 수신자를 분리하며 영속 큐, 라우팅, 메시지 변환, 모니터링 등을 제공한다. P2P의 장점은 단일 장애점이 없고 지연이 짧으며 브로커를 따로 확장할 필요가 없다는 것이다.

#### 5.2.2 Publish/Subscribe (발행/구독)

**분산된 Observer 패턴**이다. 발행자는 수신자가 누구인지 모르고, 구독자가 관심 있는 종류의 메시지를 등록한다. 둘이 느슨하게 결합되어 진화하는 분산 시스템을 통합하기에 좋다. 브로커가 있으면 결합이 더 느슨해진다.

- 예: 채팅 서버를 여러 인스턴스로 확장할 때, 각 인스턴스가 받은 메시지를 **Redis Pub/Sub**으로 발행하고 모든 인스턴스가 구독해 자기 클라이언트들에게 뿌린다. Redis는 캐시나 세션 저장소로 이미 쓰고 있는 경우가 많아 별도 브로커 없이 가장 간단한 선택이 된다.
- 한계: 원서는 Redis의 브로커 기능이 의도적으로 매우 단순하다고 설명한다. 그리고 큐 없이 **fire-and-forget**으로 동작하는 구독자는 연결돼 있는 동안의 메시지만 받는다고 정의한다. (보충) Redis Pub/Sub이 바로 이 방식이라, 구독자가 끊겨 있던 사이의 메시지는 놓친다는 적용은 원서가 명시한 문장이 아니라 이 정의를 Redis에 옮겨 적은 것이다.

#### 5.2.3 신뢰할 수 있는 전달

전달 보장 수준은 세 가지다.

| 수준 | 의미 |
|------|------|
| At most once | 저장/확인 없이 보냄. 소비자 장애 시 메시지 유실 가능 |
| **At least once** | 최소 한 번은 도착하지만, 소비자가 확인(ack) 전에 죽으면 **중복 전달**될 수 있음. 메시지를 저장해 둬야 함 |
| Exactly once | 정확히 한 번. 가장 안정적이지만 확인 절차 때문에 느리고 데이터 부담이 큼 |

- **내구성 있는 구독자(Durable subscriber)**: at-least-once 이상을 보장하려면 구독자가 없는 동안 메시지를 쌓아 두는 큐가 필요하다.
- **AMQP(RabbitMQ)** 모델의 핵심 요소: **Queue**(메시지 저장, 소비자 여러 명이면 부하 분산), **Exchange**(메시지가 발행되는 곳, direct/topic/fanout 방식으로 큐에 라우팅), **Binding**(exchange와 queue를 잇고 라우팅 키/패턴을 정의). 큐는 durable(브로커가 재시작해도 재생성)일 수 있으며, **persistent**로 표시된 메시지만 디스크에 저장된다.
- 소비자는 처리를 **성공적으로 끝낸 뒤** `ack`를 보낸다. ack가 없으면 브로커가 메시지를 큐에 남겨 다시 처리하게 한다.
- SaaS 관점 정리: at-least-once에서는 같은 메시지가 두 번 올 수 있으므로 소비자를 <strong>멱등(Idempotent)</strong>하게 만드는 것이 안전하다. (이것은 중복 가능성이라는 책의 설명에서 이끌어 낸 실무 결론이다.)

#### 5.2.4 스트림(로그) 기반 전달

<strong>스트림(로그)</strong>은 순서가 있고 추가만 가능하며 오래 보존되는 자료구조다. 큐와 달리 **소비해도 메시지(레코드)가 삭제되지 않는다.**

- 소비자가 **직접 당겨(pull) 오므로** 자기 속도로 처리할 수 있고, 죽었다 돌아오면 **읽던 지점부터** 다시 읽는다. 과거 레코드를 조회하거나 특정 지점부터 재생(replay)할 수 있다 (보존 기간이 지나기 전까지).
- 여러 소비자가 같은 스트림을 각자의 방식으로 읽을 수 있다. 대표 플랫폼은 Kafka, Amazon Kinesis이고, 가벼운 용도로는 **Redis Streams**가 있다.

| | 메시지 큐 | 스트림 |
|--|-----------|--------|
| 소비 후 | 메시지가 사라짐 | 레코드가 남음 (조회/재생 가능) |
| 강점 | 복잡한 시스템 통합에 유리 (고급 라우팅, 메시지 우선순위) | 순차 데이터, 배치 처리, 과거 데이터 상관 분석, 대용량 수집 |
| 순서 | 우선순위를 다르게 줄 수 있음 | 레코드 순서가 항상 유지됨 |

책은 작업 분배에는 보통 우선순위와 라우팅이 되는 **메시지 큐가 더 적합**할 수 있다고 본다.

#### 5.2.5 작업 분배: 경쟁 소비자(Competing Consumers)

한 작업을 여러 워커에 나누는 **파이프라인/작업 분배** 패턴이다. 생산자가 작업을 큐에 넣고, **같은 큐를 여러 소비자가 함께 구독하면 각 메시지는 한 소비자에게만 전달**되어 작업이 병렬로 처리된다. 이를 **Competing Consumers**라 한다.

- AMQP에서는 exchange를 거치지 않고 **목적지 큐로 직접 보내(point-to-point)** 메시지가 한 큐에만 가도록 한다. 결과도 별도의 결과 큐로 모은다.
- Redis Streams에서는 **consumer group**으로 같은 기능을 하며, 소비자가 작업을 끝낸 뒤 `XACK`로 확인한다.
- 워커를 늘리면 처리량이 늘어난다. 1.3의 CPU 무거운 작업을 이렇게 별도 워커로 분산할 수 있다.
- 주의: ack가 없는 방식(예: ZeroMQ의 PUSH/PULL)은 워커가 죽으면 처리 중이던 작업이 유실된다.

#### 5.2.6 요청/응답 패턴: Correlation ID와 Return Address

일방향 비동기 채널 위에서 요청/응답을 만들려면:

- **Correlation Identifier**: 요청에 고유 ID를 붙이고, 응답에도 같은 ID를 실어 보낸다. 요청자는 ID로 응답을 올바른 요청 핸들러와 짝지어 준다 (순서가 뒤바뀌어도 된다).
- **Return Address**: 채널이나 큐가 여러 개이거나 요청자가 여러 명일 때, 응답을 보낼 위치도 필요하다. AMQP에서는 요청자마다 **전용 응답 큐**를 만들고 그 이름을 요청 메시지에 담아 보낸다. 응답자는 그 큐로 직접 응답한다.

```ts
// 요청 메시지 예
{ correlationId: 'req-123', replyTo: 'queue.reply.svcA', type: 'GenerateReport', payload: {} }
// 응답 메시지 예
{ correlationId: 'req-123', status: 'done', result: {} }
```

**SaaS에서 왜 중요한가**: 이메일 발송, 결제 후처리, 리포트 생성 같은 작업을 요청과 분리하면 응답이 빨라지고 한 서비스의 장애가 퍼지지 않는다. "최소 한 번 전달 + 소비자 측 중복 처리 대비"는 큐를 쓸 때의 기본 전제다.

> 🔗 NestJS 연결: `@nestjs/microservices`(RabbitMQ, Redis, Kafka 트랜스포터), `@nestjs/bullmq`(Redis 기반 작업 큐), 프로세스 내 이벤트용 `@nestjs/event-emitter`.

> 📖 원문: 13장 Fundamentals of a messaging system, Publish/Subscribe pattern, Reliable message delivery with queues, Reliable messaging with streams, Task distribution patterns, Pipelines and competing consumers, Request/Reply patterns

### 5.3 process 객체: 환경변수, 종료 코드, 시그널

**한 줄 요약:** `process.env`는 전부 문자열이고, 종료 코드 137은 SIGKILL(대개 OOM)·143은 처리 안 된 SIGTERM이며, SIGTERM 핸들러는 강제 종료 시한과 함께 종료를 직접 책임진다.

[Part 9](Part09_운영안정성.md)의 설정과 그레이스풀 셧다운 설명에 대한 **Node API 쪽 기초**만 다룬다.

#### 5.3.1 `process.env`는 전부 문자열이다

```ts
process.env.FEATURE_X = 'false';
if (process.env.FEATURE_X) { /* ❌ 실행됨: 'false'는 비어 있지 않은 문자열 */ }
const port = process.env.PORT;          // '8080' (문자열). 산술 연산에 쓰면 버그
```

- 숫자·불리언·null이 없다. `undefined`를 대입하면 문자열 `'undefined'`가 저장된다. 지우려면 `delete process.env.X`.
- 읽기 비용이 공짜가 아니므로 핫 경로에서 매번 읽지 말고, **시작 시 한 번 읽어 검증·변환한 설정 객체**를 쓴다 ([Part 9](Part09_운영안정성.md)의 Zod 설정 검증과 같은 맥락).
- `NODE_ENV`는 Node 자체가 해석하지 않는 **생태계 관례**다. 런타임 이미지에 `production`으로 두되, 내 코드에서 `if (NODE_ENV === 'test')` 분기를 늘리지 말고 이름 있는 설정 플래그를 쓴다. 빌드 단계에서 `production`으로 두면 `npm install`이 devDependencies를 빼 버려 빌드가 깨질 수 있다.

#### 5.3.2 종료 코드와 `process.exit()`

| 코드 | 의미 |
|------|------|
| 0 | 정상 종료 |
| 1 | 처리되지 않은 예외 |
| **137** | `SIGKILL`(128+9). 대개 **컨테이너 메모리 초과(OOM Kill)** |
| **143** | `SIGTERM`(128+15)을 받았는데 처리하지 않음 (대개 롤아웃) |

- `process.exit()`는 아직 쓰이지 않은 stdout/로그를 잘라 먹을 수 있다. 보통은 **`process.exitCode = 1`을 설정하고 루프가 자연스럽게 끝나게** 한다. `exit()`는 강제 종료 타이머처럼 "지금 당장" 멈춰야 할 때만 쓴다.

#### 5.3.3 시그널

| 시그널 | 언제 오나 | 메모 |
|--------|-----------|------|
| `SIGTERM` | 쿠버네티스, `docker stop`, `kill` | **표준 종료 요청**. 그레이스풀 셧다운의 시작점 |
| `SIGINT` | 터미널 `Ctrl+C` | 로컬 개발. 함께 처리 |
| `SIGKILL` | 유예 시간이 끝난 뒤 | **잡을 수 없다.** 핸들러도, 로그도 없이 즉사 |

```ts
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return; shuttingDown = true;
  setTimeout(() => process.exit(1), 25_000).unref(); // 강제 종료 시한 < 오케스트레이터 유예(기본 30초)
  await closeServerAndResources();                    // 정리 순서는 아래 첫 항목 참조
  process.exitCode = 0;                               // exit() 대신: 마지막 로그가 flush되도록
}
for (const s of ['SIGTERM', 'SIGINT']) process.once(s, () => void shutdown(s));
```

- `closeServerAndResources()`의 정리 순서는 [Part 9](Part09_운영안정성.md)의 그레이스풀 셧다운 설명을 따른다.
- `SIGTERM`/`SIGINT`에 리스너를 등록하면 **Node의 기본 종료 동작이 사라진다.** 핸들러가 직접 종료를 책임져야 하며, 버그가 있으면 Ctrl+C로도 안 꺼진다.
- 정리 작업이 멈출 수 있으므로 **강제 종료 시한**을 반드시 두고, 타이머는 `unref()`해 정상 종료를 붙잡지 않게 한다. `server.close()`는 새 연결만 막으므로 실행 중인 핸들러는 따로 추적해 기다린다. `'exit'` 핸들러 안에서는 비동기 작업이 실행되지 않으니 정리는 시그널 핸들러에서 한다.

**SaaS에서 왜 중요한가**: 배포할 때마다 진행 중 요청이 끊기거나, 매번 정확히 30초씩 걸리고 137로 죽는 문제는 대부분 이 기초를 놓친 것이다.

> 🔗 NestJS 연결: `app.enableShutdownHooks()`가 이 시그널 리스너를 대신 등록하고 `OnApplicationShutdown` 훅을 호출한다 ([Part 9](Part09_운영안정성.md)의 그레이스풀 셧다운 설명).

> 📖 원문: Node.js 교재 part4-system/25-process-object (The environment, Exiting, Exit codes), part4-system/26-signals-and-shutdown (Signals, A complete graceful shutdown, Timeout budget), part9-production/60-deployment-and-config (--env-file, NODE_ENV)

> **🎮 C++ 서버와 비교 (보충)**
> - 그레이스풀 셧다운은 게임 서버 점검 절차("신규 접속 차단 → 진행 중 처리 마무리 → 저장 → 종료")와 같다. SIGTERM이 그 시작 신호이고, 유예 시간 뒤의 `SIGKILL`은 `kill -9`라서 저장 단계가 통째로 날아간다.
> - ⚠️ 차이: Node는 SIGTERM/SIGINT 리스너를 등록하는 순간 기본 종료 동작이 사라지므로, 종료 책임과 강제 종료 시한을 핸들러가 직접 진다.

### 5.4 V8 메모리: 힙 한도, GC, 메모리 누수

**한 줄 요약:** `--max-old-space-size`는 RSS가 아닌 옛 공간 상한이므로 컨테이너 한도의 약 70~75%로 맞추고, GC가 회수하지 못하는 누수는 한도를 올려도 해결되지 않는다.

#### 5.4.1 힙 구조, GC, 힙 한도

- **새 공간(young generation)**: 갓 만든 객체가 들어가는 작은 영역. 대부분의 객체는 금방 죽는다는 가정 아래, 살아남은 것만 복사하는 빠른 GC(Scavenge, 보통 1ms 미만).
- **옛 공간(old generation)**: 두 번 살아남은 객체가 승격되는 큰 영역. 마크-스윕/마크-컴팩트 GC로 정리하며, 힙이 클수록 <strong>정지 시간(stop-the-world)</strong>이 길어진다.
- **힙 밖 메모리**: `Buffer`/`ArrayBuffer`의 실제 데이터, 네이티브 모듈 메모리, 스레드 스택은 V8 힙 한도에 포함되지 않는다.
- `--max-old-space-size=<MiB>`는 **옛 공간의 상한**이다. 프로세스 전체 메모리(RSS) 상한이 아니다.
- V8은 기본 힙 한도를 "머신 전체 메모리" 기준으로 잡을 수 있다. 64GB 호스트의 512MiB 컨테이너에서 V8이 GC를 미루다가 **커널 OOM Killer가 먼저 `SIGKILL`** → 로그 없이 종료 코드 137만 남는다.
- 경험칙: 컨테이너 메모리 한도의 <strong>약 70~75%</strong>를 힙 상한으로 준다 (나머지는 Buffer, 런타임, 스택용). 예: 512MiB 컨테이너면 `NODE_OPTIONS=--max-old-space-size=350`. `NODE_OPTIONS`로 넣으면 같은 이미지를 여러 크기로 띄울 수 있다.
- 구분법: `FATAL ERROR: ... JavaScript heap out of memory`가 찍히면 **V8 힙이 찼다**(대개 누수). 아무 출력 없이 137이면 **컨테이너 한도를 넘었다**(힙 밖 메모리나 한도 설정 문제).
- 힙 한도를 계속 올리는 것은 해결책이 아니다. GC가 아무것도 회수하지 못하는 상태(before ≈ after)라면 **누수**이고, 한도를 올려도 시간만 번다.

#### 5.4.2 흔한 메모리 누수 원인

| 모양 | 대처 |
|------|------|
| **크기 제한 없는 전역 캐시** (`Map`, 객체) | LRU 최대 크기 또는 TTL로 제한 (2.5.2) |
| **쌓이는 이벤트 리스너** (`MaxListenersExceededWarning`이 전조) | `on()`마다 `off()` 짝 맞추기 (2.2) |
| **큰 데이터를 잡은 클로저** | 필요한 값만 뽑은 뒤 클로저를 만든다 |
| **ALS 저장소에 큰 객체** | ID만 저장 (3.4) |
| **정리 안 된 타이머** | `clearInterval`, AbortSignal로 정리 |

#### 5.4.3 진단 도구 (개념만)

- 상시 지표: `process.memoryUsage()`의 `rss`·`heapUsed`·`external`을 주기적으로 메트릭으로 내보내면 누수를 며칠 전에 본다.
- **힙 스냅샷**: 특정 순간 힙의 모든 객체와 참조 관계를 찍은 파일(`v8.writeHeapSnapshot()`). 시간차를 두고 여러 장 떠서 Chrome DevTools에서 비교하면 "계속 늘어나는 것"이 보인다. 동기 작업이고 메모리를 크게 더 쓰므로 **트래픽에서 뺀 한 인스턴스**에서만 뜬다.

**SaaS에서 왜 중요한가**: 서버는 몇 주씩 떠 있어서 브라우저에서는 안 보이던 작은 누수가 "사흘마다 OOM으로 재시작"이 된다. 컨테이너 한도와 힙 한도를 맞추는 것은 배포 설정의 기본이다.

> 📖 원문: Node.js 완전 가이드 1장 1.5 V8 엔진과 메모리 모델 / Node.js 교재 part7-diagnostics/50-reports-and-heap (Heap snapshots, Common leak shapes, Interpreting OOM crashes), part9-production/60-deployment-and-config (Memory: the container/V8 mismatch)

> **🎮 C++ 서버와 비교 (보충)**
> - RAII와 달리 GC에는 소멸자도 결정적 해제 시점도 없다. 누수는 dangling 포인터가 아니라 "더 쓰지 않지만 **아직 도달 가능한** 참조"(리스너, 캐시, 클로저, 타이머)다. 소켓·파일·스트림 같은 자원은 GC에 맡기지 말고 `pipeline()`·`finally`·`close()`로 명시적으로 정리한다.
> - 옛 공간 GC의 정지 시간(stop-the-world)은 게임 서버의 GC/할당 히치(프레임 튐)와 같은 증상으로 나타난다. 힙을 크게 잡을수록 길어질 수 있다.

### 5.5 패키지 관리와 Node 버전 선택

**한 줄 요약:** Node가 읽는 `package.json` 필드는 5개뿐이며, 재현 가능한 설치는 lockfile 커밋 + `npm ci`, 운영 버전은 Active LTS다.

#### 5.5.1 `package.json`에서 Node가 실제로 읽는 것

Node 런타임이 읽는 필드는 `name`, `main`, `type`, `exports`, `imports` 다섯 개뿐이다. `dependencies`, `scripts`, `engines` 등은 npm이 읽는다 (`engines`로 Node 버전을 막을 수 없다).

- **`"type"`**: `.js` 파일을 ESM(`"module"`)으로 볼지 CJS(`"commonjs"`, 생략 시 기본)로 볼지 정한다. `.mjs`/`.cjs`는 항상 우선한다. 명시적으로 적는다 (4.2).
- **`"exports"`**: 패키지의 공개 진입점을 정한다. **여기 적지 않은 경로는 외부에서 import할 수 없다**(`ERR_PACKAGE_PATH_NOT_EXPORTED`). `main`과 함께 있으면 `exports`가 이긴다. 이미 배포한 패키지에 `exports`를 새로 추가하면 깊은 경로를 쓰던 사용자가 깨지는 **호환성 파괴 변경**이다.

#### 5.5.2 재현 가능한 설치

| | `npm install` | `npm ci` |
|--|--------------|---------|
| lockfile | 힌트로만 참고, **갱신할 수 있음** | **명세로 따름**, package.json과 다르면 실패 |
| 용도 | 개발자가 의존성을 바꿀 때 | **CI, Docker 빌드 등 모든 자동화** |

- **`package-lock.json`은 커밋한다.** 없으면 같은 코드가 월요일과 화요일에 다른 하위 의존성을 받는다.
- (보충) **semver 범위**: `^1.4.2`는 1.x 안의 새 마이너/패치를, `~1.4.2`는 1.4.x 패치만 허용한다. 범위 덕분에 `npm install`이 새 버전을 끌어올 수 있으므로, 실제 설치 버전을 고정하는 것은 lockfile + `npm ci`의 역할이다.
- **devDependencies**(테스트 러너, 타입 체커, 빌드 도구)는 운영 이미지에서 <strong>`npm ci --omit=dev`</strong>로 빼서 크기와 공급망 위험을 줄인다.

#### 5.5.3 Node 버전 선택

- 지금까지는 4월 출시 **짝수** 메이저(22, 24...)가 **LTS**가 되고, 10월 출시 홀수 메이저는 LTS가 되지 않았다. (보충) Node.js 프로젝트는 2026년부터 메이저를 1년에 한 번만 내고 모든 메이저를 LTS로 만드는 일정으로 바꾼다고 발표했으므로, 버전을 고를 때는 공식 릴리스 일정표(nodejs.org/about/previous-releases)를 확인한다. 운영 서비스는 **Active LTS**를 쓰고, 보안 수정만 받는 Maintenance LTS에 들어가면 다음 LTS로 옮길 계획을 세운다.
- 노트북, CI, 운영의 버전이 어긋나지 않게 `.nvmrc`/`engines`/Docker 베이스 이미지 태그를 맞춘다. 이미지 태그는 `node:24`처럼 메이저만 쓰지 말고 마이너까지 고정한다.

**SaaS에서 왜 중요한가**: "내 로컬에선 되는데 운영에서 안 된다", "같은 커밋을 다시 빌드했더니 동작이 다르다"는 사고 대부분이 lockfile·버전 관리 문제다.

> 📖 원문: Node.js 교재 part1-foundations/06-packages-and-exports (The fields Node actually reads, "exports"), part1-foundations/02-install-and-release-lines (Release lines, Which line should you run), part9-production/60-deployment-and-config (Reproducible installs)

### 5.6 컨테이너에서 Node 앱 실행하기

**한 줄 요약:** 멀티스테이지 + `npm ci --omit=dev` + `USER node`로 이미지를 만들고, `CMD`는 exec 형식 `node`로 직접 실행해 PID 1인 Node가 SIGTERM을 받게 한다.

5.1.4의 컨테이너를 **Node 앱 관점에서 올바르게 만드는 규칙**만 정리한다.

#### 5.6.1 멀티스테이지 빌드

빌드 도구(TypeScript 컴파일러, 테스트 러너)와 실행에 필요한 것을 **다른 스테이지로 분리**하고, 최종 이미지에는 실행에 필요한 최소한만 남긴다.

```dockerfile
FROM node:24.9-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci                          # lockfile이 안 바뀌면 이 레이어는 캐시됨
COPY . .
RUN npm run build && npm ci --omit=dev   # 빌드 후 운영 의존성만 남김

FROM node:24.9-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
CMD ["node", "dist/main.js"]
```

| 규칙 | 이유 |
|------|------|
| `package*.json`을 먼저 복사하고 `npm ci`, 소스는 그다음 | 소스 한 글자만 바뀌어도 의존성을 다시 받는 일을 막는 **레이어 캐시** |
| `npm install`이 아니라 **`npm ci`**, 운영엔 **`--omit=dev`** | 테스트한 그대로의 의존성, 작은 이미지, 적은 공격 표면 (5.5) |
| **`USER node`** (비루트) | 공식 이미지에 있는 일반 사용자. 침해당해도 권한을 제한 |
| 베이스 이미지는 `-slim`, 마이너 버전까지 고정 | Alpine(musl)은 네이티브 모듈 문제가 있어 크기가 꼭 중요할 때만 |

#### 5.6.2 PID 1과 시그널: `node`를 직접 실행한다

```dockerfile
# ❌ 셸 형식: /bin/sh가 PID 1, 시그널을 Node에 전달하지 않음
CMD npm start
# ❌ npm이 PID 1, 전달이 불안정
CMD ["npm", "start"]
# ✅ exec 형식: Node가 PID 1로 SIGTERM을 직접 받음
CMD ["node", "dist/main.js"]
```

- (보충) Dockerfile 주석은 줄 맨 앞의 `#`만 인정된다. `CMD [...]` 뒤에 같은 줄로 주석을 붙이면 JSON 파싱에 실패해 셸 형식으로 바뀌므로 위처럼 윗줄에 쓴다.
- 컨테이너의 첫 프로세스는 PID 1이고, 리눅스는 PID 1에 대해 핸들러 없는 시그널의 기본 동작(종료)을 적용하지 않는다. 그래서 Node를 직접 실행하고 **SIGTERM 핸들러를 등록**(5.3)해야 그레이스풀 셧다운이 동작한다.
- 앞에 셸이나 npm이 끼면 `SIGTERM`이 Node에 닿지 않고, 유예 시간(쿠버네티스 기본 30초) 뒤 `SIGKILL` → **매 배포마다 정확히 30초 지연 + 진행 중 요청 절단 + 종료 코드 137**.
- 자식 프로세스를 많이 띄우는 경우에만 좀비 회수를 위해 `docker run --init`이나 `tini`를 PID 1로 둔다.

#### 5.6.3 빌드 컨텍스트와 시크릿

- **`.dockerignore`는 필수**: `.git`, `node_modules`, `dist`, `*.log`, <strong>`.env`</strong>를 빌드 컨텍스트에서 뺀다. 빠지지 않으면 빌드가 느려지고, `.env`가 `COPY . .`로 이미지에 들어간다.
- **이미지에 시크릿 금지**: `ARG`/`ENV`로 넘긴 값은 이미지 히스토리에 남는다. 비공개 npm 레지스트리 토큰처럼 빌드 중에만 필요한 값은 `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci`로 그 단계에서만 노출한다. 운영 시크릿은 실행 시 주입한다 ([Part 9](Part09_운영안정성.md)의 설정·시크릿 설명).
- 메모리 한도에 맞춰 `NODE_OPTIONS=--max-old-space-size`를 설정하고(5.4), 헬스체크는 오케스트레이터의 liveness/readiness 프로브로 연결한다([Part 9](Part09_운영안정성.md)의 liveness/readiness 프로브 설명).

**SaaS에서 왜 중요한가**: Dockerfile 한 줄(`CMD npm start`)이 "그레이스풀 셧다운이 안 된다"의 가장 흔한 원인이고, `.env`나 토큰이 이미지에 박히는 것은 그대로 보안 사고가 된다.

> 🔗 NestJS 연결: Nest 빌드 결과는 `dist/main.js`이므로 런타임 이미지의 `CMD`는 `["node", "dist/main.js"]`로 두고 `npm run start:prod`로 감싸지 않는다.

> 📖 원문: Node.js 교재 part9-production/60-deployment-and-config (Reproducible installs, Building a good Node container image, PID 1 and the signal problem), part4-system/26-signals-and-shutdown (Container reality) / Docker 교재 docker-fundamental 2장(PID 네임스페이스와 PID 1), 9장(RUN --mount=type=secret, 멀티스테이지 빌드, .dockerignore)

---

## 실무 적용

### 체크리스트

> 원문의 "✅ 이 부 핵심 체크리스트"를 코어별로 묶은 것이다.

**코어 1. 이벤트 루프**
- [ ] Node는 스레드 하나의 이벤트 루프로 I/O를 처리한다. **동기 CPU 작업이 루프를 막으면 모든 요청이 멈춘다**는 것을 설명할 수 있다.
- [ ] 이벤트 루프 단계(timers → poll → check)와 "콜백마다 nextTick → 마이크로태스크를 먼저 비운다"는 규칙을 알고, 실행 순서에 의존하는 코드를 쓰지 않는다. 이벤트 루프 지연(p99)을 메트릭으로 본다.
- [ ] CPU 무거운 작업은 `setImmediate` 쪼개기(가벼운 경우), 프로세스/worker 스레드 풀(workerpool, piscina)로 분리한다. `process.nextTick`으로는 양보할 수 없다.

**코어 2. 비동기 규율**
- [ ] 함수는 동기 또는 비동기 중 하나로만 동작하게 만든다(Zalgo 금지). 콜백은 "에러 우선" 규칙을 따른다.
- [ ] EventEmitter는 `error` 이벤트 처리와 리스너 정리(메모리 누수 방지)를 신경 쓰고, 프로세스 안에서만 유효함을 안다. 동기/비동기 emit을 섞지 않는다.
- [ ] async/await에서 `forEach` 안티패턴, `return await`, 순차 vs 병렬(`Promise.all`), 동시성 제한을 구분해서 쓴다.
- [ ] 대용량 데이터는 스트림과 `pipeline()`으로 처리하고, 백프레셔(`write()`가 `false` → `drain`)를 이해한다.

**코어 3. 경계에서의 실패·취소·컨텍스트**
- [ ] 운영 에러는 처리하고 프로그래머 에러는 로그 후 종료한다. `uncaughtException`/`unhandledRejection`으로 "계속 실행"하지 않고, `no-floating-promises`로 잊혀진 `await`를 막는다.
- [ ] 모든 외부 호출(`fetch` 등)에 `AbortSignal.timeout()`으로 마감 시간을 걸고, `res.ok` 확인과 본문 소비를 빼먹지 않는다. 직접 만든 Agent는 `keepAlive: true`.
- [ ] 요청 ID·테넌트 ID는 `AsyncLocalStorage.run()`으로 전파하고, 저장소에는 ID 같은 작은 값만 넣는다.
- [ ] 토큰은 `randomBytes`/`randomUUID`로 만들고(`Math.random` 금지), 웹훅 서명은 원본 바이트의 HMAC을 `timingSafeEqual`로 비교한다.

**코어 4. 디자인 패턴과 모듈**
- [ ] CJS와 ESM의 차이(동기 `require` vs 정적 `import`, 모듈 캐시, live binding, `__dirname` 유무)를 알고 내 프로젝트의 모듈 방식을 안다.
- [ ] 순환 의존성은 피해야 하며, 모듈 캐시 때문에 export한 인스턴스가 싱글턴처럼 동작함을 이해한다.
- [ ] Factory, DI, Adapter, Strategy, Middleware, Proxy/Decorator를 언제 쓰는지 설명할 수 있고, NestJS의 어느 기능과 대응하는지 안다.

**코어 5. 확장과 운영**
- [ ] 확장을 위해 앱이 공유 불가능한 메모리/디스크에 상태를 두지 않게 하고(세션은 Redis 같은 공유 저장소, sticky는 가급적 회피), cluster·리버스 프록시·컨테이너로 복제한다.
- [ ] 전달 보장(at most / at least / exactly once)의 차이를 알고, at-least-once에서는 중복에 대비해 소비자를 **멱등**하게 만든다. 큐와 스트림, 경쟁 소비자, Correlation ID의 용도를 구분한다.
- [ ] `process.env`는 문자열임을 알고 시작 시 검증·변환한다. 137(OOM Kill)/143(SIGTERM)/1(버그) 종료 코드를 구분하고, `--max-old-space-size`를 컨테이너 한도의 약 70~75%로 맞춘다.
- [ ] 이미지는 멀티스테이지 + `npm ci --omit=dev` + `USER node` + `CMD ["node", ...]`로 만들고 `.env`·시크릿을 넣지 않는다.

### 시나리오로 확인하기

1. **상황:** C++ 서버에서 하던 대로 "요청 핸들러 안에서 바로 계산"하는 방식으로, 월말 정산 엑셀(수 초짜리 CPU 작업)을 API 핸들러에서 직접 만들었다. 정산 요청이 들어올 때마다 처리량과 p50은 멀쩡한데 **다른 모든 API의 p99가 수 초로 튀고**, 헬스체크 응답까지 늦어진다. 서버 CPU는 한 코어만 100%다.
   **질문:** 원인은 무엇이고, 어떻게 고쳐야 하나? IOCP 서버처럼 "워커 스레드를 더 늘리는" 설정은 없나?

   <details markdown="1"><summary>답 확인</summary>

   JS는 스레드 하나의 이벤트 루프에서 실행되므로, 동기 CPU 작업이 도는 동안 다른 모든 콜백(요청)이 줄을 선다. 그래서 p50은 멀쩡하고 p99만 폭증하는 독특한 증상이 나온다. libuv 스레드 풀(`UV_THREADPOOL_SIZE`)을 늘려도 소용없다 — 그 풀은 파일 I/O·`dns.lookup`·일부 crypto 같은 정해진 작업만 돌리고 JS 계산은 돌리지 않는다. 해법은 작업을 루프 밖으로 빼는 것이다: 가끔 짧게 도는 작업이면 `setImmediate` 쪼개기, 아니면 Worker Threads/프로세스 풀(piscina, workerpool), 노드 한 대를 넘으면 큐 + 경쟁 소비자 워커. 재발 감지는 `monitorEventLoopDelay`의 p99와 ELU를 메트릭으로 내보내 한다. → 코어 1 (1.1, 1.2.3, 1.3), 코어 5 (5.2.5)

   </details>

2. **상황:** 쿠버네티스에 롤링 배포할 때마다 파드 하나가 내려가는 데 **정확히 30초**씩 걸리고, 그 사이 진행 중이던 요청이 끊기며, 파드 종료 코드는 **137**이다. Dockerfile 마지막 줄은 `CMD npm start`이고, 코드에는 SIGTERM 처리가 없다.
   **질문:** 무엇이 잘못됐고 어떻게 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   셸 형식 `CMD npm start`에서는 `/bin/sh`(또는 npm)가 PID 1이 되어 SIGTERM이 Node에 전달되지 않는다. 리눅스는 PID 1에 대해 핸들러 없는 시그널의 기본 동작(종료)을 적용하지 않으므로, 유예 시간(쿠버네티스 기본 30초)이 끝나 `SIGKILL`(128+9 = 137)로 즉사한다. 고치는 법: ① exec 형식 `CMD ["node", "dist/main.js"]`로 Node를 PID 1로 직접 실행, ② SIGTERM/SIGINT 핸들러에서 서버·자원 정리(NestJS는 `app.enableShutdownHooks()`), ③ `unref()`한 강제 종료 타이머를 유예 시간보다 짧게(예: 25초), ④ `process.exit()` 대신 `process.exitCode`로 로그가 flush되게 한다. → 코어 5 (5.3.3, 5.6.2)

   </details>

3. **상황:** 결제 완료 메시지를 RabbitMQ에서 받아 포인트를 지급하는 워커가, 지급 직후 `ack`를 보내기 전에 배포로 재시작됐다. 재시작 후 같은 메시지가 다시 와서 **포인트가 두 번 지급**됐다.
   **질문:** 큐가 고장 난 것인가? 무엇을 해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   고장이 아니라 at-least-once 전달의 정상 동작이다. 소비자가 ack 전에 죽으면 브로커는 메시지를 큐에 남겨 다시 전달한다(중복 전달). 소비자는 처리를 성공적으로 끝낸 뒤 ack를 보내고, 같은 메시지가 두 번 와도 결과가 같도록 **멱등**하게 만들어야 한다(예: 결제 ID를 키로 "이미 지급함"을 기록하고 확인). exactly-once를 기대하지 말고 "최소 한 번 전달 + 소비자 측 중복 처리 대비"를 기본 전제로 둔다. 셧다운 시에는 새 메시지 소비를 먼저 멈추고 진행 중 처리를 마무리하는 것도 함께 챙긴다(5.3). → 코어 5 (5.2.3)

   </details>

4. **상황:** 외부 결제사 API의 응답이 평소 200ms에서 60초로 느려졌다. 우리 서버의 CPU와 이벤트 루프 지연은 한가한데, 요청이 끝나지 않고 쌓이다가 메모리와 커넥션이 고갈돼 **전체 서비스가 응답 불능**이 됐다. 코드는 `const res = await fetch(url); const data = await res.json();`이다.
   **질문:** 원인과 수정 방법은?

   <details markdown="1"><summary>답 확인</summary>

   `fetch`에는 요청 타임아웃 기본값이 없어서, 느린 외부 호출을 기다리는 요청이 무한히 쌓인다(루프는 한가하지만 대기 중인 요청과 소켓이 메모리·커넥션을 잡는다). 모든 외부 호출에 `AbortSignal.timeout()`(필요하면 `AbortSignal.any`로 종료 신호와 합성)으로 전체 마감 시간을 걸고, 내 서버의 요청 타임아웃보다 짧게 잡는다. 또 `fetch`는 500에 reject하지 않으므로 `res.ok`를 확인하고, 실패 응답의 본문은 `res.body?.cancel()`로 버려 커넥션을 풀로 돌려준다. 재시도는 멱등한 요청만 지수 백오프+지터로 하고, 타임아웃 난 결제 `POST`는 멱등 키 없이 재시도하지 않는다. 취소·타임아웃은 장애 지표와 분리해 센다. → 코어 3 (3.2, 3.3)

   </details>

5. **상황:** C++ 서버에서 `thread_local`에 현재 세션을 두던 습관대로, 미들웨어에서 모듈 전역 변수 `currentRequestId`에 요청 ID를 넣고 로거가 그 값을 찍게 했다. 부하 테스트에서 **로그의 요청 ID가 다른 요청의 것으로 뒤섞인다**.
   **질문:** 왜 섞이고, 어떻게 해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   Node는 모든 요청을 한 스레드에서 번갈아 실행하므로 전역(또는 스레드에 붙은) 값은 모든 요청이 공유한다. 요청 A가 `await`로 양보한 사이 요청 B가 값을 덮어쓰고, A가 재개되면 B의 ID를 찍는다. `AsyncLocalStorage.run({ requestId }, next)`로 진입하면 그 비동기 흐름(await 이후, 타이머, 이벤트 콜백)이 각자 독립된 저장소를 본다. 테넌트 ID는 `run()`을 중첩하지 말고 기존 저장소 객체에 필드를 추가하고, 저장소에는 ID 같은 작은 값만 넣는다. Worker·자식 프로세스·다른 서비스로는 전달되지 않으므로 `traceparent` 헤더나 메시지 필드로 실어 보낸다. → 코어 3 (3.4), 코어 1 (1.1.4)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
Part 2. Node.js 핵심 원리와 디자인 패턴
한 문장: 스레드 하나의 ( ? )가 I/O 대기 시간을 다른 요청 처리에 쓴다 → 루프를 막지 마라
├─ 코어 1 이벤트 루프를 막지 마라
│   1.1 리액터: I/O 요청+핸들러 → ( ? ) → 이벤트 큐 → ( ? ) / 구현체 ( ? ) / 스레드 풀 기본 ( ? )개
│   1.2 루프 단계 timers → pending → idle/prepare → ( ? ) → check → close / 콜백마다 ( ? ) → 마이크로태스크 / 지연 p( ? )
│   1.3 CPU 작업: ( ? ) 쪼개기 / 외부 프로세스 / ( ? ) — nextTick은 ( ? ) 때문에 불가
├─ 코어 2 비동기 규율
│   2.1 Zalgo → 전부 동기 or ( ? )으로 / 콜백 규칙: 마지막 인자, 첫 인자는 ( ? )
│   2.2 EventEmitter: ( ? ) 이벤트, 리스너 누수, 동기/비동기 emit
│   2.3 순차 / 병렬 / ( ? ) 병렬 → async 함정 3가지 ( ? ), ( ? ), ( ? )
│   2.4 스트림 4종 / 백프레셔: write()가 ( ? ) → ( ? ) 이벤트 / pipe보다 ( ? )
│   2.5 비동기 초기화 3해법 / 배칭 + ( ? )
├─ 코어 3 경계에서의 실패·취소·컨텍스트
│   3.1 운영 에러 vs ( ? ) 에러 / cause / uncaughtException은 기록 후 ( ? ) / floating promise
│   3.2 AbortController/Signal: timeout(), ( ? )([...])   3.3 fetch는 500에 ( ? ), 본문 소비, keepAlive
│   3.4 ( ? ): run(), 작은 값만   3.5 Buffer/인코딩: length vs ( ? )   3.6 crypto: 난수 / HMAC / ( ? )
├─ 코어 4 디자인 패턴이 NestJS의 뿌리
│   4.1 철학: 작은 코어 / 작은 ( ? ) / 작은 ( ? ) / 단순함
│   4.2 모듈: CJS(require는 ( ? ), 모듈 ( ? )) vs ESM(정적 분석, ( ? ) binding)
│   4.3 생성: Factory, Builder, Singleton, DI → ( ? ) 컨테이너
│   4.4 구조: ( ? ), ( ? ), ( ? )     4.5 행위: Strategy, ( ? )
└─ 코어 5 확장과 운영
    5.1 스케일 큐브 X( ? ) Y( ? ) Z( ? ) / cluster / sticky vs 상태 공유
    5.2 메시징: 전달 보장 3수준 / 큐 vs ( ? ) / 경쟁 소비자 / Correlation ID
    5.3 process: env는 ( ? ), 종료 코드 137=( ? ), 143=( ? )
    5.4 V8 힙: max-old-space-size = 한도의 ( ? )%   5.5 npm ( ? ) / LTS   5.6 컨테이너: PID 1은 ( ? )
```

### 2. 인출 질문

1. 리액터 패턴의 흐름을 4단계로 말하고, 여기서 나오는 실무 결론 두 가지를 설명해 보세요.

   <details markdown="1"><summary>답 확인</summary>

   ① 앱이 I/O 요청을 던지며 핸들러(콜백)를 등록하고 즉시 반환된다. ② I/O가 끝나면 이벤트 디멀티플렉서(epoll/kqueue/IOCP)가 이벤트 큐에 이벤트를 넣는다. ③ 이벤트 루프가 큐에서 이벤트를 하나씩 꺼내 핸들러를 실행한다. ④ 끝나면 다음 이벤트를 기다리고, 할 일이 없으면 프로세스가 종료된다. 구현체는 libuv다. 결론: JS는 스레드 하나에서 실행되므로 오래 걸리는 동기 작업이 루프를 막으면 모든 요청이 멈춘다. 반면 I/O 대기는 공짜에 가까워 DB·외부 API 호출이 많은 API 서버에 잘 맞는다. 동기 구간에는 다른 코드가 끼어들지 않지만 `await` 사이에는 끼어든다. → 코어 1 (1.1)

   </details>

2. IOCP 워커 스레드 N개로 도는 C++ 서버와 비교해, Node의 "스레드 하나"는 정확히 무엇이 하나인가요? libuv 스레드 풀은 무엇을 처리하고, 왜 그 크기를 늘려도 CPU 무거운 JS 코드는 빨라지지 않나요?

   <details markdown="1"><summary>답 확인</summary>

   하나인 것은 **JS 콜백을 실행하는 스레드**(이벤트 루프)다. 소켓 I/O는 스레드 풀 없이 OS의 논블로킹/완료 통지(Linux epoll, macOS kqueue, Windows IOCP)로 루프 스레드에서 처리하고, 파일 I/O·`dns.lookup`·`pbkdf2`/`scrypt` 같은 비동기 crypto·zlib 비동기 API는 libuv 스레드 풀(기본 4개, `UV_THREADPOOL_SIZE`)이 맡는다. 풀은 이런 정해진 블로킹 작업만 돌리고 여러분의 JS는 돌리지 않으므로, JS 계산이 루프를 막는 문제는 풀 크기와 무관하다. JS 힙을 공유하는 두 번째 스레드가 없어 락은 필요 없지만, 코어를 다 쓰려면 프로세스 복제나 힙이 따로인 Worker Threads를 쓴다. → 코어 1 (1.1.5)

   </details>

3. 이벤트 루프 단계를 순서대로 말하고, `setTimeout(0)`, `setImmediate`, `Promise.then`, `process.nextTick`, 동기 `console.log`가 CJS에서 어떤 순서로 찍히는지 설명해 보세요.

   <details markdown="1"><summary>답 확인</summary>

   timers → pending callbacks → idle/prepare → poll(할 일이 없으면 여기서 잠듦) → check(`setImmediate`) → close callbacks. 콜백 하나가 끝날 때마다 nextTick 큐를 전부 비우고 이어서 마이크로태스크 큐(Promise, `await` 이후, `queueMicrotask`)를 전부 비운다. 그래서 `sync → nextTick → promise`가 먼저 찍히고, 메인 모듈에서 `timeout`과 `immediate`의 순서는 비결정적이다(`setTimeout(0)`은 실제로 1ms). 단 I/O 콜백 안에서 예약하면 항상 `setImmediate`가 먼저다. ESM에서는 nextTick과 Promise 순서가 뒤바뀔 수 있으므로 상대 순서에 의존하지 않는다. 루프가 막히면 p50은 멀쩡한데 p99가 폭증하므로 `monitorEventLoopDelay`와 ELU를 메트릭으로 본다. → 코어 1 (1.2)

   </details>

4. CPU 무거운 작업을 처리하는 세 가지 방법을 비교하고, 왜 `process.nextTick`으로는 양보할 수 없는지 말해 보세요.

   <details markdown="1"><summary>답 확인</summary>

   ① `setImmediate`로 쪼개기: 단계 사이에 대기 중인 I/O를 처리하도록 양보 — 구현이 쉽지만 오버헤드가 쌓이고 한 단계가 길면 여전히 굼뜸, 가끔 짧게 도는 작업용. ② 외부 프로세스(`child_process.fork`): 별도 프로세스에서 최고 속도로 실행하고 메시지로 통신, 여러 CPU 사용, 프로세스 풀로 동시 수 제한. ③ Worker Threads: 같은 프로세스 안의 스레드로 자체 V8과 이벤트 루프를 가지며 프로세스보다 가볍고, 메시지 통신이 기본이며 `SharedArrayBuffer`로 공유도 가능. `process.nextTick`은 대기 중인 I/O보다 먼저 실행되므로 I/O 기아를 일으켜 양보가 되지 않는다. 풀은 직접 만들지 말고 workerpool, piscina를 쓴다. → 코어 1 (1.3)

   </details>

5. Zalgo 문제란 무엇이고, 고치는 두 가지 방법은? `process.nextTick()`과 `setImmediate()`는 어떻게 다른가요?

   <details markdown="1"><summary>답 확인</summary>

   같은 함수가 캐시가 있으면 동기로, 없으면 비동기로 콜백을 불러 호출자가 실행 순서를 예측할 수 없는 문제다. 해법: ① 전부 동기로(콜백 없이 값을 반환, 단 동기 I/O는 시작 시 설정 읽기 정도에만), ② 전부 비동기로(동기 경로도 `process.nextTick()`으로 미룸). `nextTick`은 현재 작업 직후 대기 중인 I/O보다 먼저 실행되어 재귀하면 I/O 기아가 생길 수 있고, `setImmediate`는 대기 중인 I/O를 처리한 다음 실행되어 기아가 없다. Node 콜백 규칙: 콜백은 마지막 인자, 첫 인자는 `Error`(없으면 `null`), 잡히지 않은 예외는 fail-fast로 종료 후 supervisor가 재시작한다. → 코어 2 (2.1)

   </details>

6. EventEmitter를 쓸 때 꼭 챙길 주의점 세 가지와, 콜백과 이벤트를 고르는 기준은?

   <details markdown="1"><summary>답 확인</summary>

   ① `error` 이벤트를 emit했는데 리스너가 없으면 예외가 던져져 프로세스가 죽을 수 있다. ② 오래 사는 emitter에 리스너를 추가만 하면 메모리 누수(책이 꼽는 Node 누수의 가장 흔한 원인)가 생긴다 — `removeListener`로 정리, 10개를 넘으면 경고. ③ 같은 이벤트를 동기·비동기로 섞어 emit하지 않는다(동기 emit이면 리스너를 작업 시작 전에 등록해야 함). 결과를 돌려줘야 하면 콜백(정확히 한 번), 일어났음을 알리면 이벤트(여러 번 또는 0번, 리스너 여럿). EventEmitter는 프로세스 안에서만 동작하므로 여러 서버이거나 유실되면 안 되는 작업은 메시지 큐를 쓴다. → 코어 2 (2.2)

   </details>

7. 단일 스레드인데도 경쟁 상태(race condition)가 생기는 이유는? 무제한 병렬은 왜 위험하고 어떻게 막나요?

   <details markdown="1"><summary>답 확인</summary>

   락은 필요 없지만 비동기 작업의 "요청 시점"과 "결과 도착 시점" 사이에 다른 작업이 끼어들 수 있다. 예: "파일이 없으면 다운로드"를 확인하는 사이 다른 작업도 같은 확인을 통과해 둘 다 다운로드한다 — `Set`으로 "진행 중" 표시를 남겨 막는다. 무제한 병렬은 파일 디스크립터 고갈, 상대 서버의 연결 거부(ECONNREFUSED)를 부르고, 요청마다 무제한 작업을 만드는 서버는 DoS에 악용될 수 있다. 동시 실행 수가 한도보다 작을 때만 다음 작업을 시작하는 동시성 제한, 전역 제한이 필요하면 TaskQueue(큐 + 동시성 한도, 생산자-소비자)를 쓴다. → 코어 2 (2.3.2)

   </details>

8. `Promise.all`/`allSettled`/`race`의 차이를 말하고, async/await의 함정 세 가지를 설명해 보세요.

   <details markdown="1"><summary>답 확인</summary>

   `all`은 모두 성공해야 성공이고 하나라도 실패하면 첫 실패 사유로 즉시 실패, `allSettled`는 전부 끝날 때까지 기다려 각 결과를 알려 주고, `race`는 가장 먼저 끝난 것의 결과를 준다. 함정: ① `try/catch` 안에서 Promise를 그냥 `return`하면 나중에 reject돼도 현재 함수의 catch가 못 잡는다 → `return await`. ② `forEach`/`map` + `async`는 반환된 Promise를 무시해 전부 한꺼번에 시작하고 기다리지 않는다 → 순차는 `for...of`, 병렬은 `Promise.all(items.map(...))`. ③ 무관한 작업을 `await a(); await b();`로 순차 실행하면 느리다 → `Promise.all`. Promise의 `.then()`은 항상 비동기로 한 번만 호출돼 Zalgo를 자연스럽게 해결한다. → 코어 2 (2.3.3, 2.3.4)

   </details>

9. 백프레셔는 어떤 신호로 동작하나요? `pipe()` 대신 `pipeline()`을 써야 하는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   빠른 생산자가 느린 소비자에게 너무 빨리 밀어 넣으면 버퍼가 커져 메모리가 터진다. Writable의 `write()`는 내부 버퍼가 `highWaterMark`(기본 약 16KB)를 넘으면 `false`를 반환하고("멈춰라"), 버퍼가 비면 `drain` 이벤트가 발생한다("다시 써도 된다"). 이 신호는 권고일 뿐이라 무시하면 메모리가 계속 는다. `pipe()`/`pipeline()`은 조절을 자동으로 한다. 단 `pipe()`는 에러가 전체로 전파되지 않고 에러 난 스트림을 destroy하지 않아 자원이 샌다. `pipeline()`은 끝나면(성공이든 에러든) 모든 스트림을 정리하고 에러를 한 곳으로 넘긴다. 스트림 4종: Readable, Writable, Duplex, Transform. → 코어 2 (2.4)

   </details>

10. 비동기로 초기화되는 컴포넌트(DB 연결 등)를 다루는 세 가지 방법과, 비동기 요청 배칭과 캐싱을 함께 써야 하는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    ① 지역 초기화 확인(호출마다 연결 여부 확인 후 기다림 — 보일러플레이트), ② 지연된 시작(초기화가 끝난 뒤 앱/코드 시작 — 깨지기 쉽고 재초기화 불가), ③ 초기화 전 큐(준비 전 호출을 명령으로 쌓았다가 실행 — Mongoose, `pg`가 사용, State 패턴으로 정리). NestJS는 `useFactory: async`와 `OnModuleInit`으로 같은 문제를 다룬다. 배칭은 같은 입력의 작업이 진행 중이면 그 Promise에 편승하고, 캐싱은 끝난 결과를 저장한다. 캐시가 채워지기 전 동시 요청은 배칭으로 묶어야 캐시를 한 번만 채운다. Promise는 `then`을 여럿 붙일 수 있고 항상 비동기로 결과를 주므로(Zalgo 해결) 인자를 키로 `Map`에 저장하면 된다. 캐시는 LRU로 크기를 제한하고, 다중 프로세스면 Redis 같은 공유 저장소를 쓴다. → 코어 2 (2.5)

    </details>

11. 운영 에러와 프로그래머 에러는 어떻게 다르게 처리하나요? `uncaughtException` 핸들러에서 "로그만 찍고 계속 실행"하면 왜 위험한가요?

    <details markdown="1"><summary>답 확인</summary>

    운영 에러(`ENOENT`, `ECONNRESET`, 타임아웃, 잘못된 입력)는 예상 가능한 실패이므로 그 계층에서 재시도·대체 경로·적절한 HTTP 상태로 처리하고 발생 비율로 경보한다. 프로그래머 에러(코드 결함)는 복구를 시도하지 않고 로그 후 종료하며 발생할 때마다 경보한다. 구분은 `err.message`가 아니라 `err.code`로 한다. 핸들러를 등록하면 기본 종료가 사라지므로 계속 실행하면 열린 트랜잭션, 안 풀린 락, 반쯤 갱신된 캐시를 안은 채 틀린 응답을 낸다. 유일하게 정당한 사용은 "기록하고 종료"다. 맥락은 계층 경계에서 `new Error(msg, { cause })`로 덧붙이고, 잊혀진 `await`는 `no-floating-promises`를 CI 에러로 켜서 막는다. → 코어 3 (3.1)

    </details>

12. `AbortSignal`로 외부 호출을 다룰 때 흔한 실수 세 가지와, `fetch`를 쓸 때 꼭 챙길 함정들을 말해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    AbortSignal 실수: ① 신호를 만들고 아래(DB/HTTP 호출)로 전달하지 않아 실제 작업이 계속 돈다, ② 취소를 에러로 집계해 500 로그가 쌓인다(별도 지표로), ③ 오래 사는 신호에 요청마다 리스너를 붙여 누수가 생긴다. `AbortSignal.timeout(ms)`, `AbortSignal.any([...])`로 마감 시간과 종료 신호를 합친다. fetch 함정: ① 500에도 reject하지 않으므로 `res.ok`를 확인한다, ② 응답 본문을 읽거나 `cancel()`하지 않으면 연결이 풀로 돌아가지 못한다, ③ 요청 타임아웃 기본값이 없으므로 모든 외부 호출에 `AbortSignal.timeout()`을 건다(`http.request`의 `timeout`은 유휴 타임아웃), ④ 직접 만든 `http.Agent`는 `keepAlive` 기본값이 `false`, ⑤ 재시도는 멱등한 요청만 지수 백오프+지터로. → 코어 3 (3.2, 3.3)

    </details>

13. 요청 ID를 전역 변수에 두면 안 되는 이유와, `AsyncLocalStorage`를 쓸 때의 주의점 세 가지는?

    <details markdown="1"><summary>답 확인</summary>

    `await` 사이에 다른 요청 수백 개가 끼어들어 전역 값을 덮어쓰기 때문이다. ALS는 호출 스택이 아니라 비동기 실행 흐름을 따라다니는 저장소로, `run()` 안에서 시작된 모든 것(await 이후, 타이머, 이벤트 콜백)이 같은 저장소를 보고 동시 요청은 각자 독립된 저장소를 본다. 주의: ① 저장소의 값은 그 요청의 비동기 작업이 남아 있는 동안 안 풀리므로 ID 같은 작은 값만 넣는다, ② 네이티브 애드온·직접 만든 thenable·콜백을 모아 두는 풀에서는 컨텍스트가 유실될 수 있다, ③ Worker, 자식 프로세스, 다른 서비스로의 HTTP 호출에는 전달되지 않으므로 헤더(`traceparent`)나 메시지 필드로 싣는다. `enterWith()`는 피하고 테넌트 ID는 기존 저장소 객체에 필드를 추가한다. → 코어 3 (3.4)

    </details>

14. C++ 서버에서 쓰던 `thread_local` 컨텍스트나 Worker 스레드 공유 객체 발상이 Node에서 그대로 통하지 않는 이유를 각각 말해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    `thread_local`: Node는 모든 요청을 한 스레드에서 번갈아 실행하므로 스레드에 붙은 값은 전역 변수와 같아, `await` 사이에 다른 요청이 덮어쓴다. 비동기 실행 흐름을 따라다니는 `AsyncLocalStorage`를 쓴다(3.4). Worker 공유 객체: 워커마다 자기 V8 인스턴스·힙·이벤트 루프가 있어 객체를 공유하지 못하고, `postMessage`는 구조화 복제로 값을 복사한다. `ArrayBuffer`는 transfer로 소유권을 넘길 수 있고, 진짜 공유는 `SharedArrayBuffer` + `Atomics`뿐이다(1.3). → 코어 1, 코어 3

    </details>

15. Buffer의 데이터는 어디에 있고, 문자열을 다룰 때 흔한 실수 두 가지는? 컨테이너에서 `JavaScript heap out of memory`와 "아무 출력 없이 137"은 어떻게 다른가요?

    <details markdown="1"><summary>답 확인</summary>

    Buffer는 `Uint8Array`의 하위 클래스로 실제 데이터는 V8 힙 밖(external)에 있다. 실수: ① 글자 수와 바이트 수 혼동 — `'안녕'.length`는 2, `Buffer.byteLength`는 6이므로 `Content-Length`에는 바이트 수, ② 스트림 청크마다 `toString()`하면 3바이트 한글이 잘려 깨진다 — `setEncoding('utf8')`, `StringDecoder`, `Buffer.concat()`. `allocUnsafe()`는 이전 메모리가 남으니 기본은 `alloc()`. `heap out of memory`는 V8 힙(옛 공간)이 찬 것으로 대개 누수이고, 출력 없는 137은 컨테이너 한도를 넘어 커널 OOM Killer가 `SIGKILL`한 것이다(힙 밖 메모리나 한도 설정 문제). `--max-old-space-size`는 RSS가 아니라 옛 공간 상한이므로 컨테이너 한도의 약 70~75%로 준다. 흔한 누수: 크기 제한 없는 캐시, 쌓이는 리스너, 큰 데이터를 잡은 클로저, ALS의 큰 객체, 정리 안 된 타이머. → 코어 3 (3.5), 코어 5 (5.4)

    </details>

16. 토큰 생성, 웹훅 서명 검증, 비밀번호 저장에 각각 무엇을 써야 하나요? 그리고 CI/Docker 빌드에서 `npm install` 대신 `npm ci`를 쓰는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    토큰은 `Math.random()`(내부 상태 복원 가능) 대신 `randomBytes(32).toString('base64url')`, `randomUUID()`, `randomInt()`를 쓴다. 웹훅 서명처럼 비밀 키 없는 사람의 위변조를 감지하려면 해시가 아니라 HMAC(`createHmac`)을 쓰고(`sha256(secret + message)`는 길이 확장 공격에 취약), 파싱 전 원본 바이트로 계산해 `timingSafeEqual`로 상수 시간 비교한다(`===`는 타이밍 공격에 노출, 길이가 다르면 throw하므로 먼저 확인). 비밀번호는 일부러 느린 argon2/scrypt를 비동기로 쓴다(SHA-256+솔트는 GPU에 너무 빠름). `npm ci`는 lockfile을 명세로 따르고 package.json과 다르면 실패해 재현 가능한 설치를 보장한다(`npm install`은 lockfile을 갱신할 수 있음). 운영 이미지에는 `npm ci --omit=dev`로 devDependencies를 뺀다. → 코어 5 (5.5), 코어 3 (3.6)

    </details>

17. CommonJS와 ESM의 차이를 네 가지 이상 말하고, CJS의 순환 의존성에서 무슨 일이 생기는지 설명해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    CJS의 `require`는 동기이고 모듈 캐시로 같은 객체를 돌려준다(그래서 인스턴스 export는 싱글턴처럼 동작). ESM은 실행 전에 정적 분석으로 의존성 그래프를 만들고, import한 값은 읽기 전용 live binding이며, 항상 strict mode이고 `__dirname`/`require`가 없으며(`import.meta.url`), 파일 확장자를 명시해야 한다. ESM에서 CJS는 default export로만 import할 수 있다. CJS 순환 의존성은 먼저 로드된 쪽이 미완성 상태로 넘어가 로드 순서에 따라 결과가 달라지므로, 구조를 바꿔 순환을 없앤다. `package.json`의 `"type"`이 `.js`를 ESM/CJS 중 무엇으로 볼지 정한다. → 코어 4 (4.2), 코어 5 (5.5.1)

    </details>

18. Node에서 싱글턴의 한계는 무엇이고, 의존성 주입(DI)은 무엇을 해결하며 어떤 새 문제를 만드나요?

    <details markdown="1"><summary>답 확인</summary>

    모듈 캐시 덕분에 인스턴스를 export하면 사실상 싱글턴이 되지만, 모듈끼리 단단히 결합돼 테스트에서 가짜 DB로 바꾸기 어렵고, 캐시 키가 전체 경로라 같은 패키지의 호환되지 않는 버전이 둘 설치되면 인스턴스도 둘이 된다. DI는 의존성을 밖에서 넣어(생성자·함수 인자·프로퍼티 주입) 결합을 느슨하게 하고 재사용·격리 테스트를 쉽게 한다. 대신 의존 관계가 코딩 시점에 잘 안 보이고 의존성 그래프를 손으로 올바른 순서로 조립해야 한다. 그래서 조립을 제3자에게 넘기는 IoC(service locator, DI 컨테이너 — inversify, awilix, NestJS 내장 컨테이너)를 쓴다. Factory는 생성을 함수에 맡겨 구현 교체를 쉽게 하며, NestJS `useFactory`가 Factory + DI의 결합이다. → 코어 4 (4.3)

    </details>

19. Proxy, Decorator, Adapter, Strategy, Middleware를 한 줄씩 정의하고 NestJS의 대응 기능을 연결해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    Proxy: 원본과 같은 인터페이스로 접근을 가로채 제어(검증·보안·캐싱·지연 초기화·로깅) → Interceptor와 닮음. Decorator: 특정 인스턴스에 새 기능을 동적으로 덧붙임(TS `@` 문법과는 별개) — JS에서는 프록시와 경계가 흐릿해 보완 도구로 본다. 구현 기법은 둘 다 합성, 객체 확장, 내장 `Proxy`. Adapter: 한 객체의 기능을 다른 인터페이스로 쓰게 하는 래퍼(`StripeAdapter implements PaymentGateway`) → 업체를 바꿔도 앱 코드 유지. Strategy: 변하는 알고리즘을 교체 가능한 객체로 빼냄 → `@nestjs/passport`의 `PassportStrategy`. Middleware: `use()`로 등록한 함수들이 비동기 순차 사슬을 이루고 중단도 가능 → `NestMiddleware`, 그리고 Guard·Interceptor·Pipe·Exception Filter는 이 사슬을 역할별로 나눈 것. → 코어 4 (4.4, 4.5)

    </details>

20. 스케일 큐브의 세 축을 말하고, 책이 sticky 로드밸런싱을 가능하면 피하라고 하는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    X축 복제(같은 앱 n개, 가장 쉽고 저렴), Y축 기능/서비스별 분해(마이크로서비스, 아키텍처 영향이 가장 큼), Z축 데이터 분할(국가별, 해시 기반). 세션을 프로세스 메모리에 두면 다음 요청이 다른 인스턴스로 가는 순간 로그인이 풀린다. sticky는 같은 세션을 같은 인스턴스로 보내 이를 피하지만 "모든 인스턴스가 동일하고 서로 대체 가능"하다는 이중화 장점을 무력화하므로, 세션을 Redis 같은 공유 저장소에 두거나 상태를 요청에 담는다. cluster는 primary가 워커를 복제하고 죽은 워커를 다시 띄우며, 워커를 하나씩 `disconnect()` 후 교체해 무중단 재시작을 한다. 운영에서는 여러 머신에 분산 가능한 리버스 프록시와 컨테이너가 선호된다. → 코어 5 (5.1)

    </details>

21. 전달 보장 세 수준을 설명하고, at-least-once에서 소비자가 해야 할 일은? 큐와 스트림(로그)은 무엇이 다른가요?

    <details markdown="1"><summary>답 확인</summary>

    At most once는 확인 없이 보내 장애 시 유실될 수 있고, at least once는 최소 한 번 도착하지만 ack 전에 소비자가 죽으면 중복 전달될 수 있으며, exactly once는 정확히 한 번이지만 느리고 부담이 크다. 소비자는 처리를 성공적으로 끝낸 뒤 `ack`를 보내고, 중복에 대비해 멱등하게 만든다. 큐는 소비하면 메시지가 사라지고 고급 라우팅·우선순위에 강하며 작업 분배에 적합하다. 스트림(Kafka, Kinesis, Redis Streams)은 소비해도 레코드가 남아 소비자가 자기 속도로 당겨 읽고 특정 지점부터 재생할 수 있으며 순서가 항상 유지된다. 같은 큐를 여러 소비자가 구독하면 각 메시지가 한 소비자에게만 가는 것이 경쟁 소비자이고, 비동기 요청/응답은 Correlation ID + Return Address(전용 응답 큐)로 짝짓는다. → 코어 5 (5.2)

    </details>

22. `process.env`의 함정, 종료 코드 137/143의 의미, 그리고 컨테이너에서 `CMD npm start`가 그레이스풀 셧다운을 깨는 이유를 설명해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    `process.env`는 전부 문자열이라 `'false'`도 참이고 `PORT`는 문자열이다 → 시작 시 한 번 읽어 검증·변환한 설정 객체를 쓴다. 종료 코드 1은 처리되지 않은 예외, 137은 `SIGKILL`(대개 컨테이너 OOM Kill), 143은 `SIGTERM`을 받았는데 처리하지 않음이다. `SIGTERM`/`SIGINT` 리스너를 등록하면 기본 종료가 사라지므로 핸들러가 직접 정리하고, `unref()`한 강제 종료 타이머를 오케스트레이터 유예(기본 30초)보다 짧게 둔다. `process.exit()` 대신 `process.exitCode`를 설정해 로그가 flush되게 한다. 셸 형식이나 npm이 PID 1이 되면 `SIGTERM`이 Node에 닿지 않아 매 배포마다 30초 지연 + 진행 중 요청 절단 + 137로 끝난다. 그래서 `CMD ["node", "dist/main.js"]` exec 형식으로 Node를 직접 실행한다. → 코어 5 (5.3, 5.6.2)

    </details>

### 3. 기억 고리

- **C++ 유추:** Node 이벤트 루프 ≈ 로직 스레드 1개짜리 epoll 리액터 루프(Windows에서는 IOCP 위). ⚠️ 깨지는 곳: 로직 스레드를 늘릴 수 없고(JS 힙 공유 스레드 없음), libuv 스레드 풀은 내 JS를 돌려 주지 않으며, 콜백은 선점되지 않아 한 핸들러가 길면 모든 세션이 멈춘다.
- **C++ 유추:** 백프레셔 ≈ 세션별 송신 큐 상한, ALS ≈ OVERLAPPED에 실어 다니는 세션 컨텍스트, Worker ≈ 힙이 따로인 스레드(메시지 복사), GC ≈ 소멸자 없는 RAII의 반대편. ⚠️ 깨지는 곳: 백프레셔는 권고일 뿐이고, `thread_local`은 Node에서 전역 변수와 같으며, GC 누수는 "도달 가능한 잔여 참조"다.
- **비유:** 이벤트 루프 = 홀 직원 한 명. 주문(I/O 요청)을 주방에 넘기고 다른 테이블을 받다가 벨(이벤트)이 울리면 음식을 나른다. ⚠️ 비유가 깨지는 지점: 직원이 직접 요리(동기 CPU 작업)를 시작하면 모든 테이블이 멈춘다. 그래서 요리는 다른 주방(worker 스레드, 별도 프로세스, 큐 워커)으로 보낸다. 또 실제 루프는 큐 하나가 아니라 단계별 큐 + 새치기 큐 두 개(nextTick, 마이크로태스크)로 돌아간다.
- **비유:** 백프레셔 = 깔때기에 물 붓기. 깔때기가 차면(`write()`가 `false`) 멈추고, 빠지면(`drain`) 다시 붓는다. ⚠️ 비유가 깨지는 지점: 물리적으로 넘치는 깔때기와 달리 Node 버퍼는 신호를 무시해도 계속 받아 주므로 넘치지 않고 메모리가 늘어날 뿐이다 — 신호는 권고다.
- **비유:** Pub/Sub ≈ 분산된 EventEmitter. ⚠️ 비유가 깨지는 지점: 프로세스 경계를 넘으면서 유실·중복 문제가 생긴다.
- **묶음(3의 법칙):** ① 흐름 제어 3모양 — 순차(`for...of`), 병렬(`Promise.all`), 제한된 병렬(TaskQueue). ② CPU 작업 분리 3해법 — `setImmediate` 쪼개기, 외부 프로세스, Worker Threads. ③ 스케일 큐브 3축 — X 복제, Y 기능 분해, Z 데이터 분할. ④ 비동기 초기화 3해법 — 지역 확인, 지연된 시작, 초기화 전 큐. ⑤ 전달 보장 3수준 — at most / at least / exactly once.
- **대칭·순서:** `nextTick`(I/O보다 먼저, 기아 위험) ↔ `setImmediate`(I/O 다음, 기아 없음) / 운영 에러(처리) ↔ 프로그래머 에러(종료) / 큐(소비하면 사라짐) ↔ 스트림(남아서 재생) / 상태 공유 ↔ sticky / `npm install` ↔ `npm ci`. 그레이스풀 셧다운 순서: `SIGTERM` 수신 → 강제 종료 타이머(`unref`) → 서버·자원 정리 → `exitCode` 설정 후 자연 종료.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "스레드 하나인 Node가 어떻게 동시에 많은 요청을 처리하고, 무엇이 그것을 망가뜨리는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "IOCP 워커 스레드 N개로 돌리던 우리 서버와 비교해, Node에서는 왜 락이 필요 없는데도 `await` 사이 race가 생기고, 왜 코어를 다 쓰려면 프로세스를 복제해야 하며, 왜 세션을 Redis로 빼야 하는가"를 2분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "모놀리스로 시작해 내부 모듈화로 충분하다" vs B "처음부터 마이크로서비스로 나눠야 한다" — 장애 격리, 결합도, 통합·배포·모니터링 복잡도 측면에서 양쪽을 번갈아 변호해 보세요. (보너스: "sticky 로드밸런싱" vs "세션 공유 저장소")
- **AI 역할 반전:** "내가 이벤트 루프 단계와 nextTick·마이크로태스크 실행 순서, 백프레셔를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 5줄을 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---
