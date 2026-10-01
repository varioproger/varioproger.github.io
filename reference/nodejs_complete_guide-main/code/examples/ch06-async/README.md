---
title: "ch06 — 비동기 제어 흐름"
---

# ch06 — 비동기 제어 흐름

6장 「Promise와 async/await」에서 말로만 설명하기 어려운 세 가지를 실행 결과로 확인한다.

| 파일 | 무엇을 보여주는가 | 대응 절 |
|---|---|---|
| `zalgo.js` | 캐시 유무로 동기/비동기가 갈리는 API 가 만드는 버그와 두 가지 해결책 | 6.3 |
| `return-await.js` | `return` vs `return await` 의 try/catch·finally·스택 트레이스 차이 | 6.4 |
| `task-queue.js` | 동시성 제한 `TaskQueue` 구현과 무제한 실행의 비교 | 6.7 |

## 실행

```bash
node zalgo.js
node return-await.js
node task-queue.js      # 약 1초
```

## 관찰 포인트

### zalgo.js

- 같은 `readBad` 함수가 **캐시 미스에서는 비동기, 캐시 히트에서는 동기**로 콜백을 부른다
- 캐시 미스만 테스트하면 통과한다. 운영에서 캐시가 데워진 뒤에야 터진다
- 해결책 1: 동기 경로를 `process.nextTick` 으로 감싼다
- 해결책 2 (권장): Promise 를 반환한다. 이미 이행된 값이라도 `then` 은 마이크로태스크로
  미뤄지므로 구조적으로 이 버그가 생길 수 없다

### return-await.js

세 가지를 순서대로 출력한다.

1. **try/catch**: `return promise` 는 내부 catch 가 못 잡고 예외가 밖으로 샌다.
   `return await promise` 는 잡는다
2. **finally 시점**: `return promise` 는 프로미스가 정착하기 **전에** finally 가 돈다.
   finally 에서 커넥션을 반납한다면 아직 쿼리가 도는 중에 반납하는 셈이다
3. **스택 트레이스**: `await` 없이 반환한 중간 함수(`layerPlain`)는 트레이스에서
   통째로 사라진다. 오류 로그만 보고는 호출 경로를 되짚을 수 없다

결론: try 블록 안에서는 `return await` 가 **필수**다. 밖에서도 일관되게 쓰는 편이 안전하다.

### task-queue.js

원격 서비스의 동시 접속 한도를 5로 두고 작업 60개를 던진다.

- **무제한**: 최대 동시 60, 성공 5 / 실패 55. 벽시계 시간은 가장 짧지만 대부분 실패한다
- **TaskQueue(5)**: 전부 성공. 시간은 더 걸리지만 재시도 비용까지 보면 실질적으로 빠르다
- **TaskQueue(10)**: 다시 한도를 넘겨 실패한다 → 상한은 "우리"가 아니라 "상대"에 맞춰야 한다
- 결과 배열은 완료 순이 아니라 **입력 순**으로 돌아온다 (`Promise.all` 과 같다)
- 큐 상태 스냅샷으로 `running`/`pending` 이 어떻게 변하는지 볼 수 있다

## 더 해 볼 것

```bash
node --stack-trace-limit=30 return-await.js   # 프레임을 더 많이 남겨 비교
```

`task-queue.js` 의 `TOTAL`, `REMOTE_LIMIT`, `concurrency` 값을 바꿔 가며
"실패 0 을 유지하는 가장 빠른 동시성"을 찾아보라. 그 값이 곧 운영에서 튜닝해야 할 값이다.
