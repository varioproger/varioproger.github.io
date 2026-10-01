// 30장 30.4절 대응 - mock.timers 로 시간을 조작해 서킷 브레이커의 상태 전이를 검증한다.
//
// 서킷 브레이커 테스트의 난점은 "10초 뒤에 half-open 이 된다"는 명세다.
// 진짜로 10초를 기다리면 테스트 스위트가 분 단위로 늘어나고, 프로덕션 값을
// 짧게 바꿔 두면 실제와 다른 코드를 테스트하는 셈이 된다.
// node:test 의 mock.timers 는 setTimeout 과 Date 를 함께 가짜로 만들어,
// 실제 시간이 0ms 흐르는 동안 논리적으로 10초를 흘려보낼 수 있게 해 준다.
//
// 특히 이 구현은 타이머를 쓰지 않고 state 게터에서 Date.now() 를 비교해
// open 만료를 판정한다(프로세스를 붙잡는 타이머를 만들지 않으려는 설계).
// 따라서 apis 에 'Date' 를 반드시 포함해야 시간이 흐른 것으로 보인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker, BreakerState } from '@ncg/shared/http-client';

/**
 * createClient 내부가 하는 일과 같은 순서로 브레이커를 통과시킨다.
 *   tryAcquire() → 호출 → recordSuccess() / recordFailure()
 * @returns {{ ok: boolean, rejected?: boolean, value?: unknown, err?: Error }}
 */
async function through(breaker, fn) {
  // 서킷이 열려 있으면 호출 자체를 하지 않는다. 이것이 브레이커의 본질이다.
  if (!breaker.tryAcquire()) return { ok: false, rejected: true };
  try {
    const value = await fn();
    breaker.recordSuccess();
    return { ok: true, value };
  } catch (err) {
    breaker.recordFailure();
    return { ok: false, rejected: false, err };
  }
}

const fail = () => Promise.reject(new Error('업스트림 실패'));
const succeed = () => Promise.resolve('ok');

test('닫힌 상태에서는 호출이 그대로 통과한다', async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 10_000, successThreshold: 2 });

  assert.equal(breaker.state, BreakerState.CLOSED);
  const result = await through(breaker, succeed);
  assert.equal(result.ok, true);
  assert.equal(result.value, 'ok');
  assert.equal(breaker.state, BreakerState.CLOSED);
});

test('연속 실패가 임계치에 닿으면 서킷이 열린다', async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 10_000 });

  // 임계치 직전까지는 아직 닫혀 있어야 한다. 산발적 오류로 서킷이 열리면
  // 정상 트래픽까지 끊겨 오히려 가용성이 떨어진다.
  await through(breaker, fail);
  await through(breaker, fail);
  assert.equal(breaker.state, BreakerState.CLOSED);

  await through(breaker, fail);
  assert.equal(breaker.state, BreakerState.OPEN);
});

test('중간에 한 번이라도 성공하면 실패 카운터가 초기화된다', async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 10_000 });

  await through(breaker, fail);
  await through(breaker, fail);
  // 여기서 성공 한 번. 연속 실패가 끊겼으므로 카운터가 0으로 돌아가야 한다.
  await through(breaker, succeed);
  await through(breaker, fail);
  await through(breaker, fail);

  // 초기화되지 않았다면 이미 열려 있었을 것이다.
  assert.equal(breaker.state, BreakerState.CLOSED);
});

test('열린 상태에서는 업스트림을 호출하지 않고 즉시 실패한다', async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10_000 });

  await through(breaker, fail);
  await through(breaker, fail);
  assert.equal(breaker.state, BreakerState.OPEN);

  // 실패할 것이 뻔한 호출에 타임아웃만큼의 시간과 소켓을 낭비하지 않는다.
  let called = 0;
  const result = await through(breaker, async () => {
    called += 1;
    return 'ok';
  });

  assert.equal(result.rejected, true);
  assert.equal(called, 0, '열린 서킷은 fn 을 호출하면 안 된다');
  // 남은 대기 시간도 알려 준다. 클라이언트의 Retry-After 근거가 된다.
  assert.equal(breaker.retryAfterMs, 10_000);
});

test('open → half-open → closed 전이 (mock.timers 로 시간을 조작한다)', async (t) => {
  // 이 구현은 Date.now() 로 만료를 판정하므로 'Date' 를 반드시 포함한다.
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });

  const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10_000, successThreshold: 2 });

  // 1) closed → open
  await through(breaker, fail);
  await through(breaker, fail);
  assert.equal(breaker.state, BreakerState.OPEN);

  // 2) 리셋 시간이 다 되기 전에는 계속 열려 있어야 한다.
  //    너무 일찍 탐침을 보내면 회복 중인 업스트림을 다시 쓰러뜨린다.
  t.mock.timers.tick(9_999);
  assert.equal(breaker.state, BreakerState.OPEN);
  const early = await through(breaker, succeed);
  assert.equal(early.rejected, true, '리셋 시간 전에는 탐침도 막힌다');

  // 3) 리셋 시간이 지나면 half-open 으로 넘어가 탐침을 허용한다.
  t.mock.timers.tick(1);
  assert.equal(breaker.state, BreakerState.HALF_OPEN);

  // 4) half-open 에서 첫 성공. successThreshold 가 2 이므로 아직 닫히지 않는다.
  //    한 번의 운 좋은 성공으로 전체 트래픽을 되돌리면 다시 무너지기 쉽다.
  const probe1 = await through(breaker, succeed);
  assert.equal(probe1.ok, true);
  assert.equal(breaker.state, BreakerState.HALF_OPEN);

  // 5) 두 번째 성공으로 완전히 닫힌다.
  const probe2 = await through(breaker, succeed);
  assert.equal(probe2.ok, true);
  assert.equal(breaker.state, BreakerState.CLOSED);

  // 6) 닫힌 뒤에는 실패 카운터도 초기화되어 있어야 한다.
  //    초기화되지 않았다면 실패 한 번에 곧바로 다시 열린다.
  await through(breaker, fail);
  assert.equal(breaker.state, BreakerState.CLOSED);
});

test('half-open 에서 실패하면 즉시 다시 열리고 리셋 타이머가 처음부터 다시 센다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });

  const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 5_000, successThreshold: 2 });

  await through(breaker, fail);
  await through(breaker, fail);
  assert.equal(breaker.state, BreakerState.OPEN);

  t.mock.timers.tick(5_000);
  assert.equal(breaker.state, BreakerState.HALF_OPEN);

  // 탐침이 실패하면 "아직 안 나았다"는 뜻이다. 임계치를 다시 채울 필요 없이
  // 한 번의 실패로 즉시 open 으로 돌아가야 한다.
  const probe = await through(breaker, fail);
  assert.equal(probe.ok, false);
  assert.equal(breaker.state, BreakerState.OPEN);

  // 그리고 대기 시간은 처음부터 다시 센다.
  t.mock.timers.tick(4_999);
  assert.equal(breaker.state, BreakerState.OPEN);
  t.mock.timers.tick(1);
  assert.equal(breaker.state, BreakerState.HALF_OPEN);
});

test('half-open 에서는 탐침을 동시에 여러 개 보내지 않는다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });

  const breaker = new CircuitBreaker({
    failureThreshold: 1,
    resetTimeoutMs: 1_000,
    successThreshold: 2,
    halfOpenMax: 1,
  });

  await through(breaker, fail);
  assert.equal(breaker.state, BreakerState.OPEN);

  t.mock.timers.tick(1_000);
  assert.equal(breaker.state, BreakerState.HALF_OPEN);

  // 회복 중인 업스트림에 밀린 요청을 한꺼번에 쏟아부으면 다시 쓰러진다.
  // half-open 은 "한 번에 한 대씩만 지나가는 임시 다리"여야 한다.
  assert.equal(breaker.tryAcquire(), true, '첫 탐침은 통과한다');
  assert.equal(breaker.tryAcquire(), false, '두 번째 동시 탐침은 막힌다');

  // 첫 탐침이 끝나 슬롯을 돌려주면 다음 탐침이 들어갈 수 있다.
  breaker.recordSuccess();
  assert.equal(breaker.tryAcquire(), true);
});

test('상태 전이는 onStateChange 로 관측할 수 있다(지표·알림 연결점)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });

  const transitions = [];
  const breaker = new CircuitBreaker({
    name: 'recipe-api',
    failureThreshold: 1,
    resetTimeoutMs: 1_000,
    successThreshold: 1,
    onStateChange: (e) => transitions.push(`${e.from}->${e.to}`),
  });

  await through(breaker, fail);
  t.mock.timers.tick(1_000);
  assert.equal(breaker.state, BreakerState.HALF_OPEN);
  await through(breaker, succeed);

  assert.deepEqual(transitions, ['closed->open', 'open->half-open', 'half-open->closed']);
  // snapshot 은 /metrics 와 /health/deps 가 읽는 관측 창구다.
  assert.equal(breaker.snapshot().name, 'recipe-api');
  assert.equal(breaker.snapshot().state, BreakerState.CLOSED);
});
