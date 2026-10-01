// 30장 30.3절 대응 - app.inject() 로 네트워크 없이 HTTP 파이프라인 전체를 검증한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UpstreamError, TimeoutError, NotFoundError, CircuitOpenError } from '@ncg/shared/errors';
import {
  buildTestApp,
  createRecipeClientDouble,
  createRatingClientDouble,
  createRedisDouble,
} from './helpers/build-app.js';

test('GET /recipes/:id — 정상 조회는 200 과 직렬화된 본문을 반환한다', async (t) => {
  const app = await buildTestApp();
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/recipes/42' });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.id, '42');
  assert.equal(body.title, '레시피 42');
  assert.deepEqual(body.ingredients, ['소금']);
  // 상관관계 ID는 항상 응답으로 돌아와야 한다(로그 추적의 출발점).
  assert.match(res.headers['x-correlation-id'], /.+/);
  // 응답 스키마에 없는 필드는 밖으로 나가지 않는다.
  assert.equal(body.internalNote, undefined);
});

test('GET /recipes/:id — 업스트림 타임아웃은 504 problem+json 으로 번역된다', async (t) => {
  const app = await buildTestApp({
    recipeClient: createRecipeClientDouble({
      async getRecipe() {
        throw new TimeoutError('recipe-api', 1_000);
      },
    }),
  });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/recipes/42' });

  assert.equal(res.statusCode, 504);
  assert.match(res.headers['content-type'], /application\/problem\+json/);
  const body = res.json();
  assert.equal(body.status, 504);
  assert.equal(body.code, 'UPSTREAM_TIMEOUT');
  assert.equal(body.instance, '/recipes/42');
  // 5xx 의 내부 메시지(호스트명, 타임아웃 수치)는 밖으로 새면 안 된다.
  assert.ok(!body.detail.includes('recipe-api'));
  assert.equal(body.stack, undefined);
  // 대신 상관관계 ID로 서버 로그에서 원인을 찾을 수 있어야 한다.
  assert.match(body.correlationId, /.+/);
});

test('GET /recipes/:id — 업스트림 5xx 는 502 로 번역되고 원문을 노출하지 않는다', async (t) => {
  const app = await buildTestApp({
    recipeClient: createRecipeClientDouble({
      async getRecipe() {
        throw new UpstreamError('recipe-api', { details: { status: 500, sql: 'SELECT secret' } });
      },
    }),
  });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/recipes/42' });

  // 502 는 "우리는 멀쩡한데 업스트림이 문제"라는 뜻이다. 500 이면 온콜이
  // 엉뚱한 서비스를 들여다보게 된다.
  assert.equal(res.statusCode, 502);
  const body = res.json();
  assert.equal(body.status, 502);
  assert.equal(body.code, 'UPSTREAM_FAILURE');
  // details 는 4xx 에서만 노출된다. 업스트림의 내부 정보가 새면 안 된다.
  assert.equal(body.details, undefined);
  assert.ok(!JSON.stringify(body).includes('SELECT secret'));
});

test('GET /recipes/:id — 서킷이 열려 있으면 503 과 Retry-After 를 준다', async (t) => {
  const app = await buildTestApp({
    recipeClient: createRecipeClientDouble({
      breakerState: 'open',
      async getRecipe() {
        throw new CircuitOpenError('recipe-api', 7_000);
      },
    }),
  });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/recipes/42' });

  assert.equal(res.statusCode, 503);
  assert.equal(res.json().code, 'CIRCUIT_OPEN');
  // 클라이언트가 언제 다시 와야 하는지 알려 준다. 안 알려 주면 즉시 재시도해 폭주한다.
  assert.equal(res.headers['retry-after'], '7');
});

test('GET /recipes/:id — 없는 레시피는 404 로 내려간다(장애가 아니다)', async (t) => {
  const app = await buildTestApp({
    recipeClient: createRecipeClientDouble({
      async getRecipe(id) {
        throw new NotFoundError(`레시피 ${id}`);
      },
    }),
  });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/recipes/nope' });
  const body = res.json();
  assert.equal(res.statusCode, 404);
  assert.equal(body.status, 404);
  // 4xx 는 호출자가 고칠 수 있는 문제라 메시지를 그대로 보여 준다.
  assert.match(body.detail, /레시피 nope/);
});

test('GET /recipes/:id/full — 부가 서비스가 실패해도 전체 요청은 성공한다', async (t) => {
  const app = await buildTestApp({
    ratingClient: createRatingClientDouble({
      async getRating() {
        throw new UpstreamError('rating-api');
      },
    }),
  });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/recipes/42/full' });

  // Promise.allSettled 덕분에 부분 실패가 전체 실패로 번지지 않는다.
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.recipe.id, '42');
  assert.equal(body.recipe.title, '레시피 42');
  // 실패한 조각은 null 로 표시하되,
  assert.equal(body.rating, null);
  // 어떤 조각이 빠졌는지 반드시 알려 준다(조용한 실패 금지).
  assert.deepEqual(body.partial, ['rating']);
});

test('GET /recipes/:id/full — 두 업스트림이 모두 성공하면 하나로 합성된다', async (t) => {
  const app = await buildTestApp();
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/recipes/7/full' });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.recipe.id, '7');
  assert.deepEqual(body.rating, { average: 4.5, count: 12 });
  assert.deepEqual(body.partial, []);
});

test('GET /recipes/:id/full — 두 업스트림을 순차가 아니라 병렬로 호출한다', async (t) => {
  const started = [];
  const slow = (label, ms) =>
    new Promise((resolve) => {
      started.push(label);
      setTimeout(resolve, ms);
    });

  const app = await buildTestApp({
    recipeClient: createRecipeClientDouble({
      async getRecipe(id) {
        await slow('recipe', 50);
        return { id, title: 't', ingredients: [], steps: [] };
      },
    }),
    ratingClient: createRatingClientDouble({
      async getRating() {
        await slow('rating', 50);
        return { average: 4, count: 1 };
      },
    }),
  });
  t.after(() => app.close());

  const startedAt = Date.now();
  const res = await app.inject({ method: 'GET', url: '/recipes/1/full' });
  const elapsed = Date.now() - startedAt;

  assert.equal(res.statusCode, 200);
  // 두 호출이 모두 "시작"된 뒤에야 응답이 나온다면 병렬이다.
  assert.deepEqual(started.sort(), ['rating', 'recipe']);
  // 순차라면 100ms 이상 걸린다. 병렬이면 50ms 남짓이다.
  assert.ok(elapsed < 95, `병렬 호출이라면 95ms 미만이어야 한다 (실측 ${elapsed}ms)`);
});

test('GET /recipes/:id/full — 핵심 조각의 실패는 부분 실패가 아니라 전체 실패다', async (t) => {
  const app = await buildTestApp({
    recipeClient: createRecipeClientDouble({
      async getRecipe() {
        throw new UpstreamError('recipe-api');
      },
    }),
  });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/recipes/42/full' });
  assert.equal(res.statusCode, 502);
});

test('레이트 리밋을 초과하면 429 와 Retry-After / X-RateLimit 헤더를 준다', async (t) => {
  // 시간을 고정해 리필이 일어나지 않게 만든다. 그래야 테스트가 결정적이다.
  const fixedNow = 1_700_000_000_000;
  const app = await buildTestApp({
    rateLimit: { max: 2, windowMs: 60_000, now: () => fixedNow },
  });
  t.after(() => app.close());

  const headers = { 'x-api-key': 'test-key' };

  const first = await app.inject({ method: 'GET', url: '/recipes/1', headers });
  assert.equal(first.statusCode, 200);
  assert.equal(first.headers['x-ratelimit-limit'], '2');
  assert.equal(first.headers['x-ratelimit-remaining'], '1');

  const second = await app.inject({ method: 'GET', url: '/recipes/1', headers });
  assert.equal(second.statusCode, 200);
  assert.equal(second.headers['x-ratelimit-remaining'], '0');

  const third = await app.inject({ method: 'GET', url: '/recipes/1', headers });
  assert.equal(third.statusCode, 429);
  assert.equal(third.headers['x-ratelimit-limit'], '2');
  assert.equal(third.headers['x-ratelimit-remaining'], '0');
  // Retry-After 는 초 단위 정수이고 0 이어서는 안 된다(0 은 즉시 재시도를 부른다).
  const retryAfter = Number(third.headers['retry-after']);
  assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1, `retry-after=${third.headers['retry-after']}`);

  const body = third.json();
  assert.equal(body.status, 429);
  assert.equal(body.code, 'RATE_LIMITED');
  assert.equal(body.details.limit, 2);
});

test('레이트 리밋은 클라이언트별로 독립적인 버킷을 쓴다', async (t) => {
  const fixedNow = 1_700_000_000_000;
  const app = await buildTestApp({ rateLimit: { max: 1, windowMs: 60_000, now: () => fixedNow } });
  t.after(() => app.close());

  const a = await app.inject({ url: '/recipes/1', headers: { 'x-api-key': 'A' } });
  const aAgain = await app.inject({ url: '/recipes/1', headers: { 'x-api-key': 'A' } });
  const b = await app.inject({ url: '/recipes/1', headers: { 'x-api-key': 'B' } });

  assert.equal(a.statusCode, 200);
  assert.equal(aAgain.statusCode, 429);
  // B 는 A 의 소비에 영향을 받지 않는다.
  assert.equal(b.statusCode, 200);
});

test('토큰 버킷은 시간이 지나면 리필된다', async (t) => {
  let now = 1_700_000_000_000;
  const app = await buildTestApp({ rateLimit: { max: 2, windowMs: 60_000, now: () => now } });
  t.after(() => app.close());

  const headers = { 'x-api-key': 'refill' };
  await app.inject({ url: '/recipes/1', headers });
  await app.inject({ url: '/recipes/1', headers });
  assert.equal((await app.inject({ url: '/recipes/1', headers })).statusCode, 429);

  // 창의 절반이 지나면 용량의 절반(=1개)이 채워진다.
  now += 30_000;
  assert.equal((await app.inject({ url: '/recipes/1', headers })).statusCode, 200);
  assert.equal((await app.inject({ url: '/recipes/1', headers })).statusCode, 429);
});

test('Redis 장애 시 fail-open 으로 통과시키고 우회 사실을 헤더에 남긴다', async (t) => {
  const redis = createRedisDouble({ failing: true });
  const app = await buildTestApp({ redis, rateLimit: { max: 1, failOpen: true } });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/recipes/1' });

  // 리미터의 장애가 서비스 전체의 장애로 번지지 않는다.
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['x-ratelimit-bypassed'], '1');
});

test('fail-closed 를 고르면 Redis 장애 시 429 가 아니라 503 을 낸다', async (t) => {
  const redis = createRedisDouble({ failing: true });
  const app = await buildTestApp({ redis, rateLimit: { max: 1, failOpen: false } });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/recipes/1' });

  // 잘못은 호출자가 아니라 우리에게 있으므로 429 는 거짓말이다.
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().code, 'RATE_LIMITER_UNAVAILABLE');
});

test('헬스 프로브는 레이트 리밋을 소비하지 않고 업스트림도 건드리지 않는다', async (t) => {
  let upstreamCalls = 0;
  const app = await buildTestApp({
    recipeClient: createRecipeClientDouble({
      async getRecipe(id) {
        upstreamCalls += 1;
        return { id, title: 't', ingredients: [], steps: [] };
      },
    }),
    rateLimit: { max: 1, windowMs: 60_000 },
  });
  t.after(() => app.close());

  for (let i = 0; i < 5; i += 1) {
    assert.equal((await app.inject({ url: '/health/ready' })).statusCode, 200);
  }
  // 레디니스는 업스트림을 검사하지 않는다(연쇄 장애 방지).
  assert.equal(upstreamCalls, 0);
  // 프로브를 5번 했어도 실제 요청 한도는 그대로 남아 있다.
  assert.equal((await app.inject({ url: '/recipes/1' })).statusCode, 200);
});

test('종료 중에는 레디니스가 503 을 반환해 로드밸런서에서 빠진다', async (t) => {
  const app = await buildTestApp();
  t.after(() => app.close());

  assert.equal((await app.inject({ url: '/health/ready' })).statusCode, 200);
  app.testDoubles.state.shuttingDown = true;

  const res = await app.inject({ url: '/health/ready' });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().status, 'shutting_down');
  // 라이브니스는 종료 중에도 200 이다. 재시작해 봐야 소용없기 때문이다.
  assert.equal((await app.inject({ url: '/health/live' })).statusCode, 200);
});

test('지표는 실제 경로가 아니라 라우트 패턴으로 기록된다(카디널리티 보호)', async (t) => {
  const app = await buildTestApp();
  t.after(() => app.close());

  await app.inject({ url: '/recipes/9999' });
  await app.inject({ url: '/recipes/8888' });

  const routes = app.testDoubles.metrics.counted.map((l) => l.route);
  // 서로 다른 ID 두 개가 하나의 시계열로 접혀야 한다.
  assert.deepEqual(new Set(routes), new Set(['/recipes/:id']));
});

test('알 수 없는 경로는 404 problem+json 을 준다', async (t) => {
  const app = await buildTestApp();
  t.after(() => app.close());

  const res = await app.inject({ url: '/no-such-thing' });
  assert.equal(res.statusCode, 404);
  assert.match(res.headers['content-type'], /application\/problem\+json/);
});
