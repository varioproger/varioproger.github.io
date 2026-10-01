---
title: "1장. Node.js 플랫폼"
---

# 1장. Node.js 플랫폼

Node.js를 "서버에서 도는 JavaScript"로만 이해하면 이 플랫폼이 내리는 선택들이 전부 기이하게 보인다. 왜 파일 하나 읽는 데 콜백이 필요한지, 왜 CPU를 많이 쓰는 코드 한 줄이 서버 전체를 멈추게 하는지, 왜 코어 라이브러리가 이토록 빈약한지가 설명되지 않기 때문이다.
이 장은 그 선택들의 근거를 파고든다. I/O가 실제로 얼마나 느린지, 그 느림을 다루는 네 가지 방식이 무엇이며 Node.js가 왜 그중 하나를 골랐는지, 그 위에 libuv와 V8이 어떻게 얹혀 있는지를 순서대로 본다.
마지막 절에서는 이 책 전체를 관통할 예제 서비스 두 개를 만든다. 이후 31개 장은 대부분 이 두 서비스를 조금씩 발전시키는 과정이다.

## 1.1 Node.js 철학: 작은 코어, 작은 모듈, 작은 표면적

### 왜 필요한가

플랫폼의 설계 철학은 취향 문제가 아니다. 그것은 개발자가 코드를 어떻게 나누고, 의존성을 어떻게 관리하고, 실패를 어디에서 감지할지를 결정한다. Node.js 생태계에서 "왜 이 라이브러리는 함수 하나만 export 하는가", "왜 프레임워크가 아니라 미들웨어 조각들의 조합인가" 같은 질문은 모두 세 가지 원칙으로 수렴한다. 작은 코어(small core), 작은 모듈(small modules), 작은 표면적(small surface area)이다.

### 어떻게 동작하는가

**작은 코어**는 런타임이 최소한만 제공한다는 뜻이다. Node.js 코어에는 HTTP 서버는 있지만 라우터는 없고, 파일 시스템 접근은 있지만 템플릿 엔진은 없다. 유저랜드(userland)에서 해결할 수 있는 것은 유저랜드에 맡긴다. 이 선택의 대가는 명확하다. 신입 개발자는 "Express를 쓸까 Fastify를 쓸까"부터 고민해야 한다. 대신 얻는 것은 코어의 발전 속도와 안정성이다. 코어가 라우터를 품었다면 그 라우터의 API는 십 년째 하위 호환성에 묶여 있었을 것이다.

**작은 모듈**은 패키지 하나가 하나의 일만 한다는 원칙이다. Unix 철학의 직계 후손이다. npm 생태계가 다른 언어의 패키지 저장소보다 훨씬 많은 패키지를 가진 것은 이 원칙의 직접적 결과다. 여기에는 기술적 배경도 있다. 브라우저로 코드를 보내야 하는 상황에서 번들 크기가 곧 비용이므로, 작게 쪼개서 필요한 것만 가져오는 편이 유리했다. 또한 CommonJS의 중첩 `node_modules` 해석 방식(2장 참조) 덕분에 같은 패키지의 서로 다른 버전이 한 트리 안에 공존할 수 있어서, 의존성 지옥 없이 잘게 쪼개는 것이 가능했다.

**작은 표면적**은 모듈이 노출하는 API를 최소로 유지한다는 뜻이다. 확장 지점을 여러 곳에 열어두는 대신, 함수 하나 혹은 클래스 하나만 내보내고 나머지는 감춘다. 확장이 필요하면 상속이 아니라 합성(composition)으로 푼다. 이 원칙은 뒤에서 다룰 팩토리(12장 참조)와 프록시·데코레이터(13장 참조) 패턴이 Node.js 생태계에서 유독 자주 쓰이는 이유이기도 하다.

```js
// 작은 표면적: 함수 하나만 내보낸다
export default function createLimiter(concurrency) {
  let running = 0;
  const queue = [];

  const next = () => {
    if (running >= concurrency || queue.length === 0) return;
    running++;
    const { task, resolve, reject } = queue.shift();
    task().then(resolve, reject).finally(() => {
      running--;
      next();
    });
  };

  return (task) => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    next();
  });
}
```

### 실무 함정과 조언

작은 모듈 원칙은 두 방향으로 오용된다. 첫째는 과도한 분해다. 세 줄짜리 유틸을 별도 패키지로 만들면 공급망(supply chain) 공격 표면이 그만큼 넓어진다. 2016년 `left-pad` 사건과 이후 반복된 npm 계정 탈취 사고는 이 비용을 실증했다. 사내 코드라면 패키지 대신 파일 하나로 두는 편이 낫다.

둘째는 과도한 통합이다. "우리 회사 공통 라이브러리"라는 이름의 거대 패키지는 버전을 올릴 때마다 모든 서비스가 검증 대상이 된다. 판단 기준은 단순하다. 배포 주기가 다르면 분리하고, 같으면 합친다.

작은 코어 원칙에도 예외가 생기고 있다. Node.js는 최근 몇 년간 테스트 러너(`node:test`), 글로벌 `fetch`, `.env` 파일 로딩, 워치 모드를 코어에 넣었다. 이는 원칙의 포기가 아니라 "생태계가 충분히 수렴한 기능은 코어로 승격한다"는 실용적 조정이다. 새 프로젝트를 시작할 때 세 번째 파티 의존성을 추가하기 전에 코어에 이미 있는지 확인하는 습관이 필요하다.

## 1.2 I/O는 느리다: 블로킹 I/O vs 논블로킹 I/O

### 왜 필요한가

Node.js의 모든 설계 결정은 하나의 사실에서 출발한다. I/O는 느리다. 얼마나 느린지 숫자로 보자.

| 연산 | 대략적 지연 시간 | CPU 클럭 환산 |
|---|---|---|
| L1 캐시 접근 | 1 ns | ~3 사이클 |
| 메인 메모리 접근 | 100 ns | ~300 사이클 |
| NVMe SSD 랜덤 읽기 | 100 µs | 30만 사이클 |
| 같은 데이터센터 내 왕복 | 0.5 ms | 150만 사이클 |
| 대륙 간 네트워크 왕복 | 150 ms | 4억 5천만 사이클 |

메모리를 읽는 동안 CPU가 300 사이클을 기다린다면, 네트워크 응답을 기다리는 동안에는 4억 사이클을 논다. 이 시간을 어떻게 쓰느냐가 서버 아키텍처의 본질이다.

### 어떻게 동작하는가

이 문제를 다루는 방식은 역사적으로 네 단계를 거쳤다. 의사코드로 차이를 보자.

**1단계: 블로킹 I/O + 프로세스/스레드 per 연결.** 가장 직관적인 방식이다.

```js
// 의사코드 — 실제 Node.js 코드가 아니다
function handleConnection(socket) {
  const data = socket.read();   // 데이터가 올 때까지 이 스레드는 정지
  const result = process(data);
  socket.write(result);         // 버퍼가 빌 때까지 정지
  socket.close();
}

while (true) {
  const socket = server.accept();  // 새 연결이 올 때까지 정지
  spawnThread(() => handleConnection(socket));
}
```

코드는 읽기 쉽지만 연결마다 스레드가 필요하다. 리눅스에서 스레드 하나의 기본 스택은 8 MB의 가상 메모리를 예약하고, 실제로 쓰는 물리 메모리도 수십 KB에서 수백 KB에 이른다. 동시 연결 1만 개는 곧 스레드 1만 개이고, 이 상태에서 CPU 시간의 상당 부분이 문맥 전환(context switch)에 소모된다. 대부분의 스레드가 하는 일은 "기다리기"인데도 그렇다. 이것이 C10K 문제라 불렸던 상황이다.

**2단계: 논블로킹 I/O + 바쁜 대기(busy-wait polling).** 소켓을 논블로킹 모드로 열면 읽기가 즉시 반환한다. 데이터가 없으면 `EAGAIN` 같은 신호를 준다.

```js
// 의사코드
const sockets = [socketA, socketB, socketC];
while (sockets.length > 0) {
  for (const socket of sockets) {
    const data = socket.readNonBlocking();
    if (data === EAGAIN) continue;      // 아직 준비 안 됨, 다음 소켓으로
    if (data === null) { close(socket); continue; }
    handle(socket, data);
  }
}
```

스레드는 하나뿐이니 메모리 문제는 사라졌다. 그러나 새로운 문제가 생긴다. 이 루프는 아무 데이터도 오지 않아도 CPU를 100% 태운다. 소켓 1만 개 중 3개만 준비되었을 때도 매 회전마다 1만 번의 시스템 콜을 날린다. 자원 낭비가 심각하다.

**3단계: 동기 이벤트 디멀티플렉서.** 운영체제가 해결책을 제공한다. "이 파일 디스크립터 목록 중 하나라도 준비되면 깨워달라"고 커널에 요청하고 잠드는 것이다. 리눅스의 `epoll`, BSD/macOS의 `kqueue`, 윈도우의 IOCP가 그것이다. 이 부분은 다음 절에서 자세히 본다.

### 코드

Node.js에서 블로킹과 논블로킹의 차이를 직접 체감할 수 있다.

```js
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

// 블로킹: 파일을 다 읽을 때까지 이벤트 루프 전체가 멈춘다
function blockingVersion(paths) {
  const start = performance.now();
  const results = paths.map((p) => readFileSync(p, 'utf8'));
  console.log(`sync: ${(performance.now() - start).toFixed(1)}ms`);
  return results;
}

// 논블로킹: 세 파일의 읽기가 겹쳐서 진행된다
async function nonBlockingVersion(paths) {
  const start = performance.now();
  const results = await Promise.all(paths.map((p) => readFile(p, 'utf8')));
  console.log(`async: ${(performance.now() - start).toFixed(1)}ms`);
  return results;
}
```

디스크가 빠른 로컬 SSD라면 두 버전의 차이가 크지 않다. 그러나 네트워크 파일 시스템이나 HTTP 호출로 바꾸면 차이는 지연 시간의 합과 최댓값의 차이만큼 벌어진다. 100 ms짜리 요청 10개를 순차로 하면 1초, 병렬로 하면 100 ms다.

### 실무 함정과 조언

`readFileSync`, `execSync`, `crypto.pbkdf2Sync` 같은 동기 API는 코어에 존재하지만, 요청 처리 경로에서는 절대 쓰면 안 된다. 이들이 허용되는 곳은 프로세스 기동 시점의 설정 파일 로딩과 CLI 도구뿐이다. 서버 프로세스가 시작된 뒤에 실행되는 동기 I/O는 그 순간 도착한 모든 요청을 함께 지연시킨다.

더 교묘한 함정은 "동기처럼 보이지 않는 블로킹"이다. `JSON.parse()`로 50 MB 문자열을 파싱하면 수백 밀리초 동안 이벤트 루프가 멈춘다. 정규식 백트래킹(ReDoS)도 마찬가지다. 이것들은 I/O가 아니라 CPU 작업이므로 논블로킹 API가 존재하지 않는다. 해법은 다른 곳에 있다. 스트리밍 파서(7장 참조)나 워커 스레드(11장 참조)다.

## 1.3 이벤트 디멀티플렉싱과 리액터 패턴

### 왜 필요한가

앞 절의 3단계에서 멈췄던 이야기를 이어간다. 하나의 스레드로 수만 개의 연결을 다루되 CPU를 낭비하지 않으려면, "여러 이벤트 소스를 하나의 통로로 합치는" 장치가 필요하다. 이것이 이벤트 디멀티플렉싱(event demultiplexing)이다. 통신 공학에서 여러 신호를 한 채널에 실어 보내는 것이 멀티플렉싱이고, 그 반대가 디멀티플렉싱이다. 여기서는 여러 I/O 채널을 하나의 이벤트 스트림으로 모으므로 엄밀히는 멀티플렉싱에 가깝지만, 관례적으로 디멀티플렉서라 부른다.

### 어떻게 동작하는가

동기 이벤트 디멀티플렉서를 쓰는 루프는 이렇게 생겼다.

```js
// 의사코드 — 리액터 패턴의 핵심
const watchList = [];
watchList.push({ resource: socketA, event: 'READ' });
watchList.push({ resource: socketB, event: 'WRITE' });

while (watchList.length > 0) {
  // (1) 준비된 자원이 하나라도 생길 때까지 여기서 잠든다. CPU 소모 0.
  const readyEvents = demultiplexer.watch(watchList);

  // (2) 깨어나면 준비된 것만 순회한다. 각각은 즉시 완료되는 연산이다.
  for (const event of readyEvents) {
    const data = event.resource.read();  // 논블로킹, 절대 멈추지 않는다
    eventQueue.push({ handler: event.handler, data });
  }

  // (3) 큐에 쌓인 핸들러를 하나씩 꺼내 실행한다
  while (eventQueue.length > 0) {
    const { handler, data } = eventQueue.shift();
    handler(data);   // ← 우리가 작성한 JavaScript 코드가 여기서 실행된다
  }
}
```

여기서 세 가지가 중요하다.

첫째, (1)번 지점의 대기는 CPU를 쓰지 않는다. 커널이 프로세스를 재우고, 준비된 디스크립터가 생겼을 때만 깨운다. 2단계의 바쁜 대기와 결정적으로 다른 지점이다.

둘째, (2)번의 읽기는 절대 블로킹되지 않는다. 커널이 "준비됐다"고 알려준 자원만 읽기 때문이다.

셋째, (3)번에서 핸들러들은 **한 번에 하나씩 순차로** 실행된다. 이것이 Node.js가 단일 스레드인데도 경쟁 상태(race condition)를 걱정할 필요가 적은 이유다. 두 핸들러가 같은 변수를 동시에 건드리는 일은 물리적으로 불가능하다. 대신 대가가 있다. 한 핸들러가 100 ms 걸리면 큐에 있는 나머지 전부가 100 ms씩 밀린다.

이 구조 전체가 **리액터 패턴(Reactor pattern)**이다. 각 I/O 연산에 핸들러를 붙여두고, 이벤트가 발생하면 리액터가 해당 핸들러를 호출한다. Node.js에서 "핸들러"는 콜백이고, 나중에는 Promise의 resolve 함수다(6장 참조).

### 코드

Node.js에서 이 루프의 존재를 확인할 수 있다.

```js
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  res.end('ok');
});

server.listen(3000, () => {
  console.log('listening');
});

// 이 시점에서 스크립트의 최상위 코드는 이미 끝났다.
// 그런데 프로세스는 종료되지 않는다. 왜?
// 이벤트 디멀티플렉서의 감시 목록에 리스닝 소켓이 남아 있기 때문이다.
// 감시 목록이 비면 루프가 끝나고 프로세스도 끝난다.

setTimeout(() => {
  server.close();   // 감시 목록에서 제거 → 잠시 후 프로세스 자연 종료
}, 10_000);
```

이 "감시 목록이 비면 종료된다"는 규칙은 Node.js 프로세스 수명의 근본 규칙이다. `setInterval`을 걸어두고 왜 프로세스가 안 죽는지 의아해하는 상황, 반대로 비동기 작업이 남았는데 프로세스가 먼저 죽는 상황 모두 이 규칙으로 설명된다. `unref()`로 특정 핸들을 감시 목록의 카운트에서 제외할 수 있다(3장 참조).

### 실무 함정과 조언

리액터 패턴이 성립하는 전제는 "핸들러가 짧다"는 것이다. 이 전제가 깨지면 모든 것이 무너진다. 실무에서 이벤트 루프를 막는 전형적인 코드는 다음과 같다.

- 큰 JSON의 `JSON.parse` / `JSON.stringify` (10 MB에서 수십 ms, 100 MB에서 수백 ms)
- 동기 암호화 함수: `crypto.pbkdf2Sync`, `bcrypt.hashSync`
- 큰 배열의 정렬이나 `map`/`filter` 체인
- 사용자 입력에 적용되는 백트래킹 정규식
- 동기 압축: `zlib.gzipSync`

진단 방법은 이벤트 루프 지연(event loop lag) 측정이다. `perf_hooks`의 `monitorEventLoopDelay`가 히스토그램을 제공한다.

```js
import { monitorEventLoopDelay } from 'node:perf_hooks';

const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();

setInterval(() => {
  // 나노초 단위. p99가 100ms(=1e8ns)를 넘으면 경고 신호다.
  console.log({
    mean: (histogram.mean / 1e6).toFixed(2) + 'ms',
    p99: (histogram.percentile(99) / 1e6).toFixed(2) + 'ms',
  });
  histogram.reset();
}, 5000).unref();
```

프로덕션 서비스라면 이 지표를 메트릭 시스템에 항상 보내야 한다(31장 참조). 응답 시간이 나빠졌을 때 원인이 다운스트림 지연인지 이벤트 루프 포화인지를 구분해주는 가장 빠른 신호다.

## 1.4 libuv: Node.js의 I/O 엔진

### 왜 필요한가

앞 절의 동기 이벤트 디멀티플렉서는 운영체제마다 이름과 API가 다르다. 리눅스는 `epoll`, macOS와 BSD 계열은 `kqueue`, 솔라리스는 `event ports`, 윈도우는 IOCP다. 게다가 이들은 서로 모델 자체가 다르다. `epoll`과 `kqueue`는 "준비 통지(readiness notification)" 모델이고, IOCP는 "완료 통지(completion notification)" 모델이다. 전자는 "이제 읽어도 된다"고 알려주고, 후자는 "읽기를 이미 끝냈다"고 알려준다.

더 큰 문제는 이들 중 어느 것도 파일 시스템 I/O를 제대로 지원하지 않는다는 점이다. 정규 파일(regular file)은 `epoll`의 관점에서 언제나 "준비됨" 상태다. 실제로 디스크에서 데이터를 가져오는 데 걸리는 시간은 커널이 알아서 블로킹으로 처리한다. 즉 소켓에 통했던 방법이 파일에는 통하지 않는다.

이 모든 차이를 하나의 API 뒤로 감춘 C 라이브러리가 **libuv**다. 원래 Node.js를 위해 만들어졌지만 지금은 독립 프로젝트로 Julia, Luvit 등 다른 런타임도 사용한다.

### 어떻게 동작하는가

libuv는 두 개의 서로 다른 메커니즘을 하나의 이벤트 루프 안에 통합한다.

**네트워크 I/O는 커널의 논블로킹 메커니즘을 그대로 쓴다.** TCP/UDP 소켓, 파이프, TTY는 `epoll`/`kqueue`/IOCP에 등록되고, 준비되면 루프가 깨어난다. 여기에는 추가 스레드가 관여하지 않는다. 소켓 1만 개를 다루든 10만 개를 다루든 스레드는 여전히 메인 하나다.

**파일 I/O와 일부 CPU 작업은 스레드 풀에 위임한다.** libuv는 내부에 워커 스레드 풀을 유지한다. `fs.readFile`을 호출하면 실제로는 풀의 스레드 하나가 블로킹 `read(2)`를 수행하고, 끝나면 결과를 이벤트 루프에 알린다. 사용자 코드 입장에서는 논블로킹이지만 내부적으로는 블로킹 호출을 다른 스레드로 밀어낸 것이다.

스레드 풀을 쓰는 작업은 다음과 같다.

- `node:fs`의 대부분 (`readFile`, `writeFile`, `stat`, `readdir` 등)
- `dns.lookup` (참고: `dns.resolve` 계열은 스레드 풀을 쓰지 않는다)
- `zlib`의 비동기 압축/해제
- `crypto`의 `pbkdf2`, `scrypt`, `randomBytes` 등 비동기 버전

기본 스레드 풀 크기는 **4**다. `UV_THREADPOOL_SIZE` 환경 변수로 조정할 수 있으며 최대 1024까지 가능하다. 다만 이 값은 프로세스 시작 시점에 한 번만 읽히므로, 코드 안에서 `process.env.UV_THREADPOOL_SIZE = 16`을 설정해도 이미 풀이 만들어진 뒤라면 효과가 없다.

### 코드

스레드 풀 포화(saturation)를 직접 관측해보자.

```js
import { pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(pbkdf2);

// pbkdf2는 스레드 풀을 사용한다. 기본 크기 4.
async function main() {
  const start = performance.now();
  const tasks = Array.from({ length: 8 }, (_, i) =>
    derive('password', `salt${i}`, 200_000, 64, 'sha512').then(() => {
      console.log(`task ${i}: ${(performance.now() - start).toFixed(0)}ms`);
    })
  );
  await Promise.all(tasks);
}

main();
```

기본 설정에서 실행하면 처음 4개가 비슷한 시각에 끝나고, 나머지 4개가 그 두 배 시점에 끝난다. 계단이 뚜렷하게 보인다. `UV_THREADPOOL_SIZE=8 node script.js`로 다시 실행하면 8개가 한꺼번에 끝난다(CPU 코어가 충분하다면).

```bash
# 계단 현상 확인
node pool.js
# 스레드 풀을 8로 늘려 재실행
UV_THREADPOOL_SIZE=8 node pool.js
```

### 실무 함정과 조언

**함정 1: 스레드 풀은 무한정 늘려도 되는 자원이 아니다.** 풀 크기를 CPU 코어 수보다 훨씬 크게 잡으면 스레드들이 서로 CPU를 두고 경쟁해 전체 처리량이 떨어진다. 디스크 I/O 위주라면 코어 수의 2~4배 정도가 무난하고, `pbkdf2` 같은 CPU 바운드 작업이 섞여 있다면 코어 수를 넘기지 않는 편이 낫다.

**함정 2: `dns.lookup`이 조용히 풀을 잡아먹는다.** `http.request`, `fetch`, 데이터베이스 드라이버가 호스트명으로 연결할 때 내부적으로 `dns.lookup`을 부르고, 이것은 `getaddrinfo(3)`라는 블로킹 함수라서 스레드 풀을 쓴다. DNS 서버가 느려지면 파일 읽기까지 함께 느려지는 기묘한 장애가 발생한다. 대응은 두 가지다. DNS 결과를 캐싱하거나(`cacheable-lookup` 계열), 조회를 `dns.resolve4`로 바꿔 스레드 풀을 우회하는 것이다.

**함정 3: 스레드 풀은 이벤트 루프 지연으로 잡히지 않는다.** 스레드 풀이 포화되어 파일 읽기가 500 ms씩 밀려도 이벤트 루프 자체는 한가하므로 `monitorEventLoopDelay`는 정상으로 보고한다. 두 지표를 함께 봐야 한다.

**함정 4: 파일 I/O의 성능 한계.** libuv의 파일 I/O는 결국 블로킹 syscall이므로, 스레드 4개라면 동시에 진행되는 디스크 요청도 4개다. 대용량 파일을 수백 개 동시에 다루는 서비스라면 이 구조 자체가 병목이 된다. 최신 리눅스에서는 libuv가 `io_uring`을 부분적으로 활용하지만, 아직 모든 연산에 적용되지는 않는다.

## 1.5 V8 엔진과 메모리 모델

### 왜 필요한가

Node.js에서 JavaScript를 실행하는 것은 V8이다. V8은 크롬의 엔진이지만 Node.js에 들어오면서 성격이 달라진다. 브라우저 탭은 몇 초에서 몇 시간 살지만, 서버 프로세스는 몇 주에서 몇 달을 산다. 짧게 살면 드러나지 않던 메모리 문제가 서버에서는 전부 드러난다. 힙 구조와 GC 동작을 모르면 "왜 우리 서비스는 사흘에 한 번씩 OOM으로 죽는가"에 답할 수 없다.

### 어떻게 동작하는가

V8의 힙은 크게 두 영역으로 나뉜다.

**새 공간(new space, 또는 young generation)**은 갓 생성된 객체가 들어가는 곳이다. 크기가 작다. 기본값은 하드웨어와 버전에 따라 다르지만 대략 1~16 MB 수준이고, `--max-semi-space-size`로 조정한다. 이름이 semi-space인 이유는 이 영역이 from-space와 to-space 두 개의 반쪽으로 나뉘어 있기 때문이다.

새 공간의 GC는 **스캐빈저(Scavenger)** 알고리즘이다. Cheney 복사 수집기로, from-space에서 살아있는 객체만 to-space로 복사한 뒤 두 반쪽의 역할을 맞바꾼다. 죽은 객체는 아무 작업 없이 버려진다. 비용이 "살아남은 객체 수"에만 비례하기 때문에, 대부분의 객체가 금방 죽는다는 세대 가설(generational hypothesis)이 성립하는 한 매우 빠르다. 보통 한 번에 1 ms 미만이다. 스캐빈지를 두 번 살아남은 객체는 old space로 승격(promotion)된다.

**옛 공간(old space, 또는 old generation)**은 오래 살아남은 객체가 모이는 곳이다. 여기의 GC는 훨씬 비싸다. **마크-스윕(mark-sweep)** 으로 도달 가능한 객체를 표시하고 나머지를 회수하며, 단편화가 심해지면 **마크-컴팩트(mark-compact)** 로 객체를 밀어 붙여 정리한다. 이 작업은 힙 크기에 비례하므로 힙이 1 GB면 수백 ms의 정지(stop-the-world)가 발생할 수 있다. V8은 이를 완화하기 위해 표시 작업을 여러 조각으로 나누는 증분 마킹(incremental marking)과 별도 스레드에서 수행하는 동시 마킹(concurrent marking), 회수를 병렬화하는 병렬 스윕(parallel sweep)을 사용한다. 그래도 완전히 없앨 수는 없다.

힙에는 그 밖에도 코드 공간(JIT 컴파일된 기계어), 큰 객체 공간(large object space, 반 페이지 이상 크기의 객체), 맵 공간 등이 있다.

**`--max-old-space-size`** 는 old space의 상한을 MB 단위로 지정한다. 64비트 시스템의 기본값은 Node.js 버전과 시스템 메모리에 따라 달라지는데, 최근 버전은 시스템 메모리의 약 절반을 기준으로 잡되 대략 2 GB에서 4 GB 사이가 흔하다. 확인 방법은 다음과 같다.

```js
import v8 from 'node:v8';

const stats = v8.getHeapStatistics();
console.log({
  heapSizeLimitMB: (stats.heap_size_limit / 1024 / 1024).toFixed(0),
  usedHeapMB: (stats.used_heap_size / 1024 / 1024).toFixed(1),
  totalHeapMB: (stats.total_heap_size / 1024 / 1024).toFixed(1),
  externalMB: (process.memoryUsage().external / 1024 / 1024).toFixed(1),
});
```

### 코드

GC 동작을 눈으로 확인하려면 `perf_hooks`의 GC 관측을 켠다.

```js
import { PerformanceObserver, constants } from 'node:perf_hooks';

const kindNames = {
  [constants.NODE_PERFORMANCE_GC_MINOR]: 'scavenge',
  [constants.NODE_PERFORMANCE_GC_MAJOR]: 'mark-sweep-compact',
  [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: 'incremental-marking',
  [constants.NODE_PERFORMANCE_GC_WEAKCB]: 'weak-callbacks',
};

const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    // major GC가 자주, 오래 발생하면 힙이 부족하거나 누수가 있다는 뜻이다
    console.log(`${kindNames[entry.detail.kind]}: ${entry.duration.toFixed(2)}ms`);
  }
});
observer.observe({ entryTypes: ['gc'] });

// 의도적으로 old space를 채운다
const retained = [];
for (let i = 0; i < 2_000_000; i++) {
  retained.push({ id: i, payload: `item-${i}` });
}
console.log('done', retained.length);
```

### 실무 함정과 조언

**컨테이너 메모리 한도와 힙 한도를 맞춰라.** 쿠버네티스에서 메모리 limit을 512 MiB로 주고 `--max-old-space-size`를 기본값(수 GB)으로 두면, V8은 "아직 힙에 여유가 있다"고 판단해 GC를 미루다가 컨테이너가 먼저 OOMKilled 된다. 이때 힙 스냅숏도 남지 않고 종료 코드 137만 남아 원인 파악이 어렵다. 경험칙은 컨테이너 한도의 70~80%를 힙 상한으로 주는 것이다. 512 MiB 컨테이너라면 `--max-old-space-size=384` 정도다. Node.js 20 이상은 컨테이너 cgroup 한도를 어느 정도 인식하지만, 명시적으로 주는 편이 안전하다.

**힙 밖의 메모리를 잊지 마라.** `Buffer`, `ArrayBuffer`의 실제 데이터는 V8 힙이 아니라 외부(external) 메모리에 있다. `--max-old-space-size`는 이를 제한하지 않는다. 버퍼를 무한정 쌓는 코드는 힙 통계가 멀쩡한 채로 RSS만 부풀다가 죽는다. `process.memoryUsage()`의 `external`과 `arrayBuffers` 항목을 함께 모니터링해야 한다.

**힙 상한을 무작정 올리는 것은 해법이 아니다.** old space가 커질수록 major GC의 정지 시간이 길어진다. 8 GB 힙에서 발생하는 mark-compact는 초 단위 정지를 만들 수 있고, 그 사이 헬스 체크가 실패해 로드 밸런서가 인스턴스를 빼버린다. 힙을 키우는 대신 프로세스를 늘리는 편이 대개 낫다(25장 참조).

**메모리 누수의 전형은 무한 성장하는 컬렉션이다.** 상한 없는 인메모리 캐시, 해제되지 않는 `EventEmitter` 리스너(4장 참조), 클로저에 잡힌 큰 객체가 대표적이다. 진단은 `node --heapsnapshot-signal=SIGUSR2` 또는 `v8.writeHeapSnapshot()`으로 스냅숏 두 개를 뜨고 크롬 DevTools에서 비교(comparison view)하는 방식이 정석이다(28장, 29장 참조).

## 1.6 Node.js의 JavaScript: 런타임이 제공하는 것들

### 왜 필요한가

JavaScript 언어 명세(ECMAScript)에는 파일도, 네트워크도, 프로세스도 없다. 명세가 정의하는 것은 문법, 타입, `Object`/`Array`/`Promise` 같은 내장 객체까지다. 나머지는 전부 호스트 환경(host environment)이 제공한다. 브라우저가 `document`와 `localStorage`를 주듯, Node.js는 `process`와 `fs`를 준다. 이 경계를 명확히 알아야 "이 코드가 브라우저에서도 도는가"를 판단할 수 있다(20장 참조).

### 어떻게 동작하는가

Node.js가 제공하는 것은 크게 네 부류다.

**1. 코어 모듈.** `node:` 접두사로 import 한다. `node:fs`, `node:http`, `node:crypto`, `node:worker_threads` 등이다. 접두사는 선택이 아니라 권장이다. `import fs from 'fs'`도 동작하지만, `node:fs`로 쓰면 npm에 같은 이름의 패키지가 있어도 절대 혼동되지 않고, 읽는 사람도 코어 모듈임을 즉시 안다. 일부 신규 모듈(`node:test`, `node:sea`)은 접두사가 필수다.

**2. 전역 객체.** `process`, `Buffer`, `__dirname`(CommonJS 한정), `globalThis`가 있다. 여기에 더해 브라우저와 호환되는 전역들이 계속 추가되었다.

**3. 웹 표준 API의 이식.** 이것이 최근 몇 년의 가장 큰 변화다. Node.js는 브라우저에 있던 API를 그대로 가져와 코드 공유를 쉽게 만들었다.

| API | 도입 시점(안정화 기준) | 용도 |
|---|---|---|
| `fetch` | v18 (전역, undici 기반) | HTTP 클라이언트 |
| `AbortController` / `AbortSignal` | v15 | 비동기 작업 취소 |
| `URL` / `URLSearchParams` | v10 | URL 파싱 |
| `TextEncoder` / `TextDecoder` | v11 | 문자열-바이트 변환 |
| `structuredClone` | v17 | 깊은 복사 |
| Web Streams (`ReadableStream` 등) | v18 | 스트림 상호 운용 |
| `performance` | v16 | 고해상도 타이머 |
| `EventTarget` / `CustomEvent` | v15 / v19 | 이벤트 |

**4. 실행 모델 관련 기능.** ESM/CJS 모듈 로더(2장 참조), `--experimental-*` 플래그로 제공되는 실험 기능, 그리고 `node:test` 같은 개발 도구다.

### 코드

현대적인 Node.js 코드가 어떤 모습인지 보여주는 예다. 타임아웃과 취소를 갖춘 HTTP 호출이다.

```js
// modern-fetch.mjs
import { setTimeout as delay } from 'node:timers/promises';

/**
 * 타임아웃과 재시도를 갖춘 JSON 조회.
 * AbortSignal.timeout()은 v17.3부터 사용 가능하다.
 */
async function fetchJson(url, { timeoutMs = 2000, retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      // 마지막 시도였다면 그대로 던진다
      if (attempt === retries) throw err;
      // 지수 백오프 + 지터 (29장에서 더 정교하게 다룬다)
      const backoff = 100 * 2 ** attempt + Math.random() * 100;
      await delay(backoff);
    }
  }
}

const data = await fetchJson('https://example.com/api/health');
console.log(data);
```

이 코드에는 `require`도, 콜백도, 서드파티 HTTP 라이브러리도, 타임아웃용 `setTimeout` 수동 관리도 없다. 최상위 `await`은 ESM에서만 동작한다.

### 실무 함정과 조언

**`fetch`는 만능이 아니다.** 전역 `fetch`는 undici를 감싼 것이지만 기본 설정이 서버용으로 최적화되어 있지 않다. 커넥션 풀 설정, 프록시, 유닉스 소켓, 세밀한 타임아웃 제어(연결 타임아웃과 본문 타임아웃 분리)가 필요하면 `undici`를 직접 쓰는 편이 낫다(10장 참조). 또한 `fetch`의 응답 본문을 읽지 않고 버리면 커넥션이 반환되지 않아 풀이 마른다. 쓰지 않을 응답도 `await res.body?.cancel()` 해야 한다.

**웹 표준 API가 항상 더 빠르지는 않다.** Web Streams는 Node.js 네이티브 스트림보다 오버헤드가 크다. `TextDecoder`보다 `buffer.toString('utf8')`이 빠른 경우도 많다. 이식성이 필요할 때 웹 표준을, 성능이 중요할 때 네이티브 API를 고르는 것이 실용적이다.

**버전별 가용성을 확인하라.** `AbortSignal.timeout`, `Array.prototype.findLast`, `structuredClone` 같은 기능은 특정 버전부터 존재한다. `package.json`의 `engines.node` 필드에 최소 버전을 명시하고, CI에서 그 버전으로도 테스트하는 것이 안전하다.

```json
{
  "engines": { "node": ">=20.11.0" },
  "type": "module"
}
```

## 1.7 개발 환경 구성: 버전 관리, REPL, 실행 모델

### 왜 필요한가

Node.js는 6개월마다 메이저 버전을 낸다. 짝수 버전은 LTS(Long Term Support)로 승격되어 약 30개월간 지원되고, 홀수 버전은 6개월 만에 수명이 끝난다. 프로덕션에는 항상 Active LTS 또는 Maintenance LTS를 쓴다. 반면 개발 중에는 여러 프로젝트가 서로 다른 버전을 요구하는 상황이 흔하다. 시스템 전역에 하나의 Node.js를 설치하는 방식으로는 이 상황을 감당할 수 없다.

### 어떻게 동작하는가

버전 관리 도구의 선택지는 몇 가지다.

**nvm**은 가장 널리 쓰이는 도구다. 셸 함수로 동작하며 `PATH`를 갈아끼운다. 프로젝트 루트에 `.nvmrc` 파일을 두면 `nvm use`가 그 버전을 선택한다.

```bash
# .nvmrc 에 "20.11.0" 한 줄
nvm install
nvm use
node --version   # v20.11.0
```

**fnm**과 **volta**는 더 빠른 대안이다. fnm은 Rust로 작성되어 셸 시작 속도 저하가 거의 없고, volta는 `package.json`에 툴체인 버전을 고정해 팀원 전체가 자동으로 같은 버전을 쓰게 만든다.

**corepack**은 Node.js에 내장된 패키지 매니저 관리자다. `package.json`의 `packageManager` 필드를 읽어 지정된 pnpm/yarn 버전을 자동으로 준비한다.

```json
{
  "packageManager": "pnpm@9.1.0"
}
```

**REPL(Read-Eval-Print Loop)** 은 `node`를 인자 없이 실행하면 열린다. 단순한 계산기가 아니라 실험 도구다. 알아둘 만한 기능이 몇 가지 있다.

- `_` 는 직전 표현식의 결과를 담는다.
- `.editor` 로 여러 줄 편집 모드에 들어가고 Ctrl+D로 실행한다.
- `.load file.js` / `.save file.js` 로 세션을 주고받는다.
- 최상위 `await`이 동작한다. `const data = await fetch(...)` 가 그대로 된다.
- `.help` 가 전체 명령을 보여준다.

**실행 모델**에서 기억할 진입점 관련 사항은 다음과 같다.

```bash
node app.js               # 파일 실행
node --watch app.js       # 파일 변경 시 자동 재시작 (nodemon 불필요)
node --env-file=.env app.js  # .env 로딩 (dotenv 불필요, v20.6+)
node --test                # node:test 러너로 테스트 실행
node -e "console.log(1+1)" # 인라인 평가
node --inspect app.js      # 디버거 포트 개방 (30장 참조)
```

`--watch`와 `--env-file`은 각각 nodemon과 dotenv를 대체할 수 있는 코어 기능이다. 작은 코어 원칙의 실용적 완화 사례이기도 하다.

### 코드

이 책의 예제들이 공통으로 사용할 프로젝트 골격이다.

```bash
mkdir -p nodejs-guide/{recipe-api,web-api}
cd nodejs-guide/recipe-api
npm init -y
npm pkg set type=module
npm pkg set engines.node=">=20.11.0"
```

```json
// recipe-api/package.json
{
  "name": "recipe-api",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=20.11.0" },
  "scripts": {
    "start": "node --env-file=.env server.js",
    "dev": "node --watch --env-file=.env server.js",
    "test": "node --test"
  }
}
```

`"type": "module"` 한 줄이 이 패키지의 모든 `.js` 파일을 ESM으로 해석하게 만든다. 이 책의 모든 예제는 이 설정을 전제로 한다(2장 참조).

### 실무 함정과 조언

**로컬과 프로덕션의 Node.js 버전을 일치시켜라.** 로컬은 22, 프로덕션 컨테이너는 18인 상황은 "내 컴퓨터에서는 되는데"의 가장 흔한 원인이다. `.nvmrc`, `Dockerfile`의 베이스 이미지 태그, CI 워크플로의 `node-version`이 모두 같은 값을 가리키는지 주기적으로 점검해야 한다.

**`npm install -g`를 피하라.** 전역 설치한 CLI는 버전이 프로젝트와 무관하게 흘러간다. `npx`나 devDependencies + `npm scripts` 조합을 쓰는 편이 재현 가능하다.

**락 파일을 반드시 커밋하라.** `package-lock.json`이나 `pnpm-lock.yaml` 없이 배포하면 매 배포마다 다른 의존성 트리가 만들어진다. CI에서는 `npm ci`(락 파일을 그대로 설치하고 불일치 시 실패)를 쓴다.

**REPL에서 검증한 코드를 그대로 믿지 마라.** REPL은 모든 최상위 선언을 전역처럼 다루고 CommonJS/ESM 경계도 느슨하다. 모듈 파일에서는 동작이 달라질 수 있다.

## 1.8 이 책에서 사용할 예제 서비스 소개

### 왜 필요한가

패턴을 단편적인 예제로만 배우면 "언제 쓰는가"에 대한 감각이 생기지 않는다. 이 책은 하나의 시스템을 처음부터 끝까지 발전시키는 방식을 택한다. 32개 장을 관통하는 예제는 두 개의 HTTP 서비스다.

- **recipe-api**: 레시피 데이터를 제공하는 **프로듀서(producer)** 서비스. 외부에 직접 노출되지 않고 내부 네트워크에서만 접근된다.
- **web-api**: 브라우저나 모바일 앱이 호출하는 **컨슈머(consumer)** 서비스. recipe-api를 호출해 결과를 가공한다. 외부에 노출된다.

이 두 서비스의 관계는 분산 시스템의 가장 기본적인 형태다. web-api는 recipe-api에 대해 컨슈머이자, 브라우저에 대해서는 프로듀서다. 이 관계 모델링은 21장에서 다시 정식으로 다룬다.

### 어떻게 발전하는가

각 부가 이 두 서비스에 무엇을 더하는지 미리 보면 이 책의 구조가 명확해진다.

| 부 | 두 서비스에 일어나는 일 |
|---|---|
| 1~2부 | 모듈로 분해하고, 비동기 제어 흐름과 스트림으로 재작성 |
| 3부 | 파일 업로드, 우아한 종료, 워커 스레드로 이미지 리사이징 추가 |
| 4부 | 팩토리·미들웨어·전략 패턴으로 내부 구조 정리 |
| 5부 | 라우팅, 인증, 세션, 실시간 알림, 데이터베이스 계층 도입 |
| 6부 | HTTP를 GraphQL/gRPC로 교체 실험, 메시지 브로커 도입 |
| 7부 | 클러스터링, 리버스 프록시, 부하 테스트, 서킷 브레이커 |
| 8부 | 테스트, 구조화 로깅, 메트릭, 분산 추적, 배포 |

### 코드

최소 구현부터 시작한다. 지금은 프레임워크도, 데이터베이스도 없다. 코어 모듈만 쓴다.

```js
// recipe-api/server.js
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '127.0.0.1';

// 아직 데이터베이스가 없으므로 인메모리 픽스처를 쓴다 (19장에서 교체)
const recipes = new Map([
  [42, {
    id: 42,
    name: 'Chicken Tikka Masala',
    steps: ['마리네이드', '굽기', '소스 끓이기', '합치기'],
    ingredients: [
      { id: 1, name: 'Chicken', quantity: '1 lb' },
      { id: 2, name: 'Sauce', quantity: '2 cups' },
    ],
  }],
]);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('content-type', 'application/json; charset=utf-8');

  // 헬스 체크: 로드 밸런서가 사용한다 (26장 참조)
  if (url.pathname === '/health') {
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  // GET /recipes/:id
  const match = url.pathname.match(/^\/recipes\/(\d+)$/);
  if (req.method === 'GET' && match) {
    const recipe = recipes.get(Number(match[1]));
    if (!recipe) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    res.end(JSON.stringify({
      producer_pid: process.pid,   // 어느 인스턴스가 응답했는지 추적용
      recipe,
    }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`recipe-api listening on http://${HOST}:${PORT} (pid ${process.pid})`);
});
```

```js
// web-api/server.js
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
const RECIPE_API = process.env.RECIPE_API ?? 'http://127.0.0.1:4000';
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS ?? 1000);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('content-type', 'application/json; charset=utf-8');

  if (url.pathname === '/health') {
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  const match = url.pathname.match(/^\/recipes\/(\d+)$/);
  if (req.method === 'GET' && match) {
    try {
      // 업스트림 호출에는 항상 타임아웃을 건다. 없으면 장애가 전파된다 (29장 참조)
      const upstream = await fetch(`${RECIPE_API}/recipes/${match[1]}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (upstream.status === 404) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);

      const payload = await upstream.json();
      res.end(JSON.stringify({
        consumer_pid: process.pid,
        ...payload,
      }));
    } catch (err) {
      // 업스트림 장애를 502로 변환한다. 스택 트레이스를 클라이언트에 노출하지 않는다
      console.error({ msg: 'upstream_failed', error: err.message });
      res.statusCode = 502;
      res.end(JSON.stringify({ error: 'upstream_unavailable' }));
    }
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`web-api listening on http://${HOST}:${PORT} (pid ${process.pid})`);
});
```

두 서비스를 각각 실행한 뒤 확인한다.

```bash
# 터미널 1
node recipe-api/server.js
# 터미널 2
node web-api/server.js
# 터미널 3
curl -s http://127.0.0.1:3000/recipes/42 | jq
# {
#   "consumer_pid": 51231,
#   "producer_pid": 51230,
#   "recipe": { "id": 42, "name": "Chicken Tikka Masala", ... }
# }
```

`consumer_pid`와 `producer_pid`를 응답에 넣은 것은 의도적이다. 25장에서 클러스터링을 도입하고 26장에서 로드 밸런서를 붙이면, 이 두 값이 요청마다 달라지는 것을 보며 분산이 실제로 일어나고 있음을 확인하게 된다.

### 실무 함정과 조언

이 최소 구현에는 프로덕션에 필요한 것이 거의 다 빠져 있다. 무엇이 빠졌는지 지금 인식해두는 것이 중요하다.

- **바인딩 주소.** `127.0.0.1`에 바인딩했다. 컨테이너 안에서는 `0.0.0.0`이어야 외부에서 접근된다. 반대로 호스트에서 직접 실행할 때 `0.0.0.0`은 의도치 않은 노출이 된다. 환경 변수로 분리한 이유다.
- **우아한 종료가 없다.** 지금 `SIGTERM`을 보내면 처리 중이던 요청이 끊긴다. 9장에서 고친다.
- **로그가 `console.log`다.** 구조화되지 않은 로그는 검색과 집계가 불가능하다. 31장에서 구조화 로깅으로 바꾼다.
- **요청 검증이 없다.** 정규식으로 숫자만 받고 있지만 그뿐이다. 16장에서 스키마 기반 검증을 도입한다.
- **재시도·서킷 브레이커가 없다.** 타임아웃만 있다. recipe-api가 느려지면 web-api의 커넥션이 모두 대기 상태가 된다. 29장에서 다룬다.
- **`JSON.stringify` 직렬화.** 응답 객체를 그대로 직렬화하면 내부 필드가 새어 나갈 수 있다. 22장에서 POJO 직렬화의 위험을 다룬다.

이 목록이 곧 이 책의 나머지 부분이다.

## 요약

- Node.js는 작은 코어, 작은 모듈, 작은 표면적이라는 세 원칙 위에 서 있다. 최근에는 테스트 러너·`fetch`·`--watch` 등 생태계가 수렴한 기능을 코어로 흡수하는 실용적 조정이 진행 중이다.
- I/O는 CPU보다 수만~수억 배 느리다. 이 지연을 다루는 방식이 스레드 per 연결 → 바쁜 대기 → 동기 이벤트 디멀티플렉서로 진화했고, Node.js는 마지막 방식을 택했다.
- 리액터 패턴은 이벤트마다 핸들러를 등록하고 디멀티플렉서가 깨워줄 때 순차 실행한다. 경쟁 상태 걱정이 줄어드는 대신, 긴 핸들러 하나가 전체를 막는다.
- libuv는 네트워크 I/O를 `epoll`/`kqueue`/IOCP로, 파일 I/O와 일부 암호·압축 작업을 기본 크기 4인 스레드 풀로 처리한다. `dns.lookup`이 이 풀을 조용히 잠식하는 것이 흔한 함정이다.
- V8 힙은 스캐빈저가 관리하는 new space와 마크-스윕/컴팩트가 관리하는 old space로 나뉜다. 컨테이너 메모리 한도의 70~80%를 `--max-old-space-size`로 명시하고, `Buffer` 같은 외부 메모리를 별도로 감시해야 한다.
- 현대 Node.js 코드는 ESM, async/await, 글로벌 `fetch`, `AbortSignal.timeout`, `node:` 접두사를 기본으로 쓴다.
- 이 책은 recipe-api(프로듀서)와 web-api(컨슈머) 두 서비스를 32개 장에 걸쳐 프로덕션 수준의 분산 시스템으로 발전시킨다.

## 연습문제

1. **이벤트 루프 지연 측정.** 1.3절의 `monitorEventLoopDelay` 코드를 recipe-api에 붙인 뒤, 요청 핸들러 안에 `crypto.pbkdf2Sync('a', 'b', 500_000, 64, 'sha512')`를 넣어보라. `autocannon`이나 반복 `curl`로 부하를 주면서 p99 지연이 어떻게 변하는지 기록하고, 같은 작업을 비동기 `pbkdf2`로 바꿨을 때의 차이를 설명하라. 두 경우 모두 처리량(RPS)도 함께 측정한다.

2. **스레드 풀 포화 재현.** `UV_THREADPOOL_SIZE`를 1, 4, 16으로 바꿔가며 1.4절의 `pbkdf2` 예제를 실행하고 완료 시각의 계단 패턴을 표로 정리하라. 그다음 같은 실험을 `fs.readFile`로 큰 파일 8개를 동시에 읽는 코드로 반복하고, CPU 바운드 작업과 디스크 I/O에서 최적 풀 크기가 왜 다른지 논하라.

3. **메모리 한도 실험.** `--max-old-space-size=64`로 Node.js를 실행하고 배열에 객체를 계속 push 하는 스크립트를 돌려 OOM이 발생할 때까지의 시간과 `v8.getHeapStatistics()`의 변화를 관찰하라. 이어서 같은 스크립트에서 객체 대신 `Buffer.allocUnsafe(1024 * 1024)`를 push 하도록 바꾸면 힙 한도가 적용되지 않는 이유를 설명하고, 이 차이를 감지하려면 어떤 지표를 봐야 하는지 답하라.
