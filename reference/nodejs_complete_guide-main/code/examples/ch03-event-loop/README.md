# ch03 — 이벤트 루프

3장 「이벤트 루프와 비동기 실행 모델」의 주장을 실행 가능한 코드로 확인한다.
외부 패키지 없이 Node.js 내장 모듈만 쓴다.

| 파일 | 무엇을 보여주는가 | 대응 절 |
|---|---|---|
| `phases.js` | nextTick / 마이크로태스크 / setTimeout / setImmediate / I/O 콜백의 실행 순서 | 3.2~3.4 |
| `starvation.js` | 재귀 nextTick 이 I/O 를 굶기는 현상과 setImmediate 로 고치기 | 3.3, 3.6 |
| `measure-lag.js` | 이벤트 루프 지연 p99 측정과 동기 블로킹 주입 | 3.6 |

## 실행

```bash
node phases.js
node starvation.js
node measure-lag.js     # 약 3초 걸린다
```

## 관찰 포인트

### phases.js

- 동기 구간이 끝나기 전에는 어떤 콜백도 실행되지 않는다 (순번 1·2)
- **콜백 안에서는** `process.nextTick` 이 `Promise.then` 보다 먼저다
- **ESM 최상위에서는 반대로 나온다.** ES 모듈 평가 자체가 프로미스 작업 안에서 일어나기
  때문에 마이크로태스크 체크포인트가 먼저 소진된다. CommonJS 로 바꾸면 순서가 뒤집힌다
- 메인 모듈의 `setTimeout(0)` vs `setImmediate` 순서는 **비결정적**이다.
  여러 번 실행해 순번이 뒤바뀌는지 확인하라
- I/O 콜백 안에서는 `setImmediate` 가 **항상** 먼저다 (poll → check)

### starvation.js

- nextTick 버전의 "I/O 콜백이 실행된 시점"이 `null` 이라는 것이 핵심이다.
  20만 번 반복이 끝날 때까지 파일 읽기 콜백이 한 번도 실행되지 못했다
- setImmediate 버전은 반복 초반에 이미 I/O 콜백이 끼어든다
- 대신 setImmediate 쪽이 **총 소요 시간은 더 길다**.
  "빠르지만 서버가 멎는 것"과 "느리지만 응답하는 것" 사이의 거래다

### measure-lag.js

- 유휴 구간의 값은 샘플링 간격(10ms) 근처다. 이것이 측정의 바닥이므로
  실제 지연은 "측정값 − 기준선"으로 읽는다
- 블로킹 시간이 그대로 p99 로 올라온다 (50ms 블로킹 → p99 약 60ms)
- **p50 은 거의 안 움직이는데 p99 와 max 만 튄다.** 평균만 보면 정상으로 보인다
- 주입 2회뿐인 마지막 구간의 p99 가 가장 높다.
  드문 긴 블로킹 하나가 꼬리 지연을 지배한다

## 더 해 볼 것

```bash
# 실행마다 setTimeout/setImmediate 순서가 바뀌는지 확인
for i in 1 2 3 4 5; do node phases.js | grep -E 'setImmediate\(fn\)$|setTimeout\(fn, 0\)$' ; echo '---'; done

# 어떤 동기 함수가 루프를 막는지 프로파일링 (34장)
node --cpu-prof measure-lag.js
```
