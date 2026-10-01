import './silence.js'; // 반드시 첫 import — 로거보다 먼저 평가되어야 한다
// 30장 30.2절 대응 - 테스트용 앱 팩토리와 인메모리 테스트 더블.
//
// src/server.js 를 그대로 import 하지 않는 이유: 그 모듈은 최상단에서 추적을
// 켜고 ioredis 를 불러오는 부작용이 있다. 테스트는 부작용 없이 "조립된 앱"만
// 필요하므로, 같은 플러그인/라우트를 같은 순서로 직접 조립한다.

import Fastify from 'fastify';
import { registerObservability } from '../../src/plugins/observability.js';
import { registerErrorHandler } from '../../src/plugins/error-handler.js';
import { registerRateLimit } from '../../src/plugins/rate-limit.js';
import { recipeRoutes } from '../../src/routes/recipes.js';
import { healthRoutes } from '../../src/routes/health.js';
import { sseRoutes } from '../../src/routes/sse.js';

/** 부작용 없는 지표 더블. 호출 기록만 남긴다. */
export function createMetricsDouble() {
  const observed = [];
  const counted = [];
  return {
    observed,
    counted,
    httpDuration: { observe: (labels, value) => observed.push({ labels, value }) },
    httpTotal: { inc: (labels) => counted.push(labels) },
  };
}

/**
 * 인메모리 Redis 더블.
 *
 * rate-limit.js 의 Lua 스크립트와 "같은 계산"을 자바스크립트로 다시 구현한다.
 * 진짜 Lua 는 Redis 없이는 못 돌리기 때문이다. 따라서 이 더블은 리미터의
 * 정책(용량, 리필, Retry-After, 헤더)을 검증하지, Lua 문법을 검증하지 않는다.
 * Lua 자체는 통합 테스트(실제 Redis 컨테이너)에서 확인한다.
 */
export function createRedisDouble({ failing = false, now = () => Date.now() } = {}) {
  const buckets = new Map();
  const loaded = new Set();

  function fail() {
    const err = new Error('Redis 연결 실패(테스트 더블)');
    err.code = 'ECONNREFUSED';
    return err;
  }

  return {
    buckets,
    setFailing(value) {
      failing = value;
    },
    async ping() {
      if (failing) throw fail();
      return 'PONG';
    },
    async script(command, source) {
      if (failing) throw fail();
      if (String(command).toUpperCase() !== 'LOAD') throw new Error(`지원하지 않는 SCRIPT ${command}`);
      const { createHash } = await import('node:crypto');
      const sha = createHash('sha1').update(source).digest('hex');
      loaded.add(sha);
      return sha;
    },
    async evalsha(sha, numKeys, key, capacityArg, refillArg, nowArg, costArg, ttlArg) {
      if (failing) throw fail();
      if (!loaded.has(sha)) throw new Error('NOSCRIPT No matching script.');

      const capacity = Number(capacityArg);
      const refillPerMs = Number(refillArg);
      const nowMs = Number(nowArg);
      const cost = Number(costArg);
      const ttlMs = Number(ttlArg);

      const stored = buckets.get(key);
      let tokens = stored ? stored.tokens : capacity;
      const ts = stored ? stored.ts : nowMs;

      const elapsed = Math.max(0, nowMs - ts);
      tokens = Math.min(capacity, tokens + elapsed * refillPerMs);

      let allowed = 0;
      let retryAfterMs = 0;
      if (tokens >= cost) {
        allowed = 1;
        tokens -= cost;
      } else {
        retryAfterMs = Math.ceil((cost - tokens) / refillPerMs);
      }

      buckets.set(key, { tokens, ts: nowMs, expiresAt: nowMs + ttlMs });
      return [allowed, Math.floor(tokens), retryAfterMs];
    },
    async quit() {
      return 'OK';
    },
    disconnect() {},
    on() {},
  };
}

/** 항상 성공하는 recipe 클라이언트 더블. */
export function createRecipeClientDouble(overrides = {}) {
  return {
    breakerState: 'closed',
    async getRecipe(id) {
      return { id, title: `레시피 ${id}`, description: '설명', ingredients: ['소금'], steps: ['섞는다'] };
    },
    async listRecipes() {
      return { data: [{ id: '1', title: '레시피 1', ingredients: [], steps: [] }], nextCursor: null };
    },
    ...overrides,
  };
}

/** 항상 성공하는 rating 클라이언트 더블. */
export function createRatingClientDouble(overrides = {}) {
  return {
    breakerState: 'closed',
    async getRating() {
      return { average: 4.5, count: 12 };
    },
    ...overrides,
  };
}

/**
 * 테스트용 앱을 조립한다.
 *
 * @param {{
 *   recipeClient?: object, ratingClient?: object, redis?: object,
 *   rateLimit?: { max?: number, windowMs?: number, failOpen?: boolean, now?: () => number },
 *   withRateLimit?: boolean,
 * }} [options]
 */
export async function buildTestApp(options = {}) {
  const {
    recipeClient = createRecipeClientDouble(),
    ratingClient = createRatingClientDouble(),
    redis = createRedisDouble(),
    rateLimit = {},
    withRateLimit = true,
  } = options;

  const app = Fastify({ logger: false, trustProxy: true, disableRequestLogging: true });
  const metrics = createMetricsDouble();

  // 프로덕션과 같은 순서로 조립해야 테스트가 실제 동작을 반영한다.
  await registerObservability(app, {
    serviceName: 'web-api-test',
    metrics,
    // 테스트마다 이벤트 루프 모니터를 켜면 타이머가 쌓여 프로세스가 안 끝난다.
    monitorEventLoop: false,
  });
  await registerErrorHandler(app, { exposeStack: false });

  if (withRateLimit) {
    await registerRateLimit(app, {
      redis,
      max: rateLimit.max ?? 100,
      windowMs: rateLimit.windowMs ?? 60_000,
      failOpen: rateLimit.failOpen ?? true,
      now: rateLimit.now,
    });
  }

  const state = { shuttingDown: false };
  await app.register(healthRoutes, { redis, recipeClient, state });
  await app.register(recipeRoutes, { recipeClient, ratingClient });
  await app.register(sseRoutes, {});

  app.decorate('testDoubles', { metrics, redis, recipeClient, ratingClient, state });
  await app.ready();
  return app;
}

export default buildTestApp;
