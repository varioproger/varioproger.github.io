// 29장 29.6절 대응 - 타임아웃 / 재시도 / 서킷 브레이커와 서킷 개방 시의 폴백.
import { createClient } from '@ncg/shared/http-client';
import { NotFoundError } from '@ncg/shared/errors';

/**
 * @ncg/shared/http-client 의 계약:
 *   const http = createClient({ baseUrl, timeoutMs, retries, deadlineMs, breaker });
 *   await http.get(path, init) → { status, headers, body, attempts }
 *   2xx 가 아니면 던진다 → TimeoutError(504) / UpstreamError(502) / CircuitOpenError(503)
 *   http.breakerState → 'closed' | 'open' | 'half-open' | 'disabled'
 *   상관관계 ID는 클라이언트가 AsyncLocalStorage 에서 읽어 자동으로 붙인다.
 */

/**
 * ── 수치의 근거 ────────────────────────────────────────────────────
 *
 * timeoutMs = 1000 (시도 하나의 상한)
 *   recipe-api 의 p99 는 약 120ms 다. 여기에 8배의 여유를 뒀다.
 *   타임아웃은 "정상 응답보다 훨씬 크되, 사용자가 기다려 줄 시간보다는 작게"
 *   잡는다. 30초처럼 크게 잡으면 업스트림이 느려질 때 우리 쪽 소켓과 대기가
 *   쌓여 함께 죽는다. 타임아웃은 성능 옵션이 아니라 장애 격리 장치다.
 *
 * retries = 2 (총 시도 3회)
 *   일시적 오류(연결 리셋, 502)는 대부분 1회 재시도로 흡수된다. 3회를 넘기면
 *   이득은 거의 없고, 업스트림이 이미 힘들 때 부하를 3배로 키우는 재시도
 *   폭풍(retry storm)이 된다. 공유 클라이언트는 4xx 를 재시도하지 않는다.
 *
 * deadlineMs = 2500 (호출 전체의 예산)
 *   재시도와 백오프를 다 합친 상한이다. 이것이 없으면 최악의 지연은
 *   timeoutMs × 시도 횟수 + 백오프로 늘어난다. 예산은 바깥(우리를 호출하는
 *   쪽)이 항상 더 커야 하므로, 게이트웨이의 3초 예산 안쪽으로 잡았다.
 *
 * breaker.failureThreshold = 5
 *   산발적 오류로 서킷이 열리지 않을 만큼 크고, 진짜 장애를 몇 백 밀리초 안에
 *   감지할 만큼 작다.
 * breaker.resetTimeoutMs = 10000
 *   업스트림이 재시작·스케일아웃할 최소 시간. 너무 짧으면 half-open 탐침이
 *   회복 중인 서비스를 다시 밀어붙인다.
 * breaker.successThreshold = 2 / halfOpenMax = 1
 *   한 번의 운 좋은 성공으로 문을 활짝 여는 것을 막고, 회복 중인 업스트림에
 *   탐침을 한 번에 하나씩만 보낸다.
 */
export const RECIPE_CLIENT_DEFAULTS = Object.freeze({
  timeoutMs: 1_000,
  retries: 2,
  deadlineMs: 2_500,
  breaker: Object.freeze({
    failureThreshold: 5,
    resetTimeoutMs: 10_000,
    successThreshold: 2,
    halfOpenMax: 1,
  }),
});

/**
 * 서킷 개방 시 내어 줄 축소 응답의 근거가 되는 아주 작은 캐시.
 *
 * 이것은 성능 캐시가 아니라 "가용성 캐시"다. 그래서 신선도를 따지지 않는다.
 * 오래된 데이터라도 오류 페이지보다는 낫다는 판단이며, 응답에 stale: true 를
 * 붙여 소비자가 그 사실을 코드로 판별할 수 있게 한다.
 */
export class StaleCache {
  #map = new Map();
  #max;

  constructor({ max = 500 } = {}) {
    this.#max = max;
  }

  get(key) {
    const hit = this.#map.get(key);
    if (!hit) return undefined;
    // LRU: 최근 사용을 맨 뒤로 옮긴다.
    this.#map.delete(key);
    this.#map.set(key, hit);
    return hit;
  }

  set(key, value, now = Date.now()) {
    if (this.#map.has(key)) this.#map.delete(key);
    this.#map.set(key, { value, storedAt: now });
    // 무한 성장은 곧 메모리 누수다. 가장 오래 안 쓴 항목부터 버린다.
    while (this.#map.size > this.#max) {
      this.#map.delete(this.#map.keys().next().value);
    }
  }

  get size() {
    return this.#map.size;
  }
}

/**
 * 공유 클라이언트가 던진 오류에서 업스트림의 상태 코드를 되찾는다.
 * (toPublicError 가 details.status 에 원래 코드를 남겨 둔다.)
 */
function upstreamStatus(err) {
  return err?.details?.status ?? err?.status;
}

/**
 * recipe-api 클라이언트를 만든다.
 *
 * @param {{
 *   baseUrl?: string, timeoutMs?: number, retries?: number, deadlineMs?: number,
 *   breaker?: object, cache?: StaleCache, logger?: object, http?: object,
 * }} options
 */
export function createRecipeClient(options = {}) {
  const {
    baseUrl,
    timeoutMs = RECIPE_CLIENT_DEFAULTS.timeoutMs,
    retries = RECIPE_CLIENT_DEFAULTS.retries,
    deadlineMs = RECIPE_CLIENT_DEFAULTS.deadlineMs,
    breaker = RECIPE_CLIENT_DEFAULTS.breaker,
    cache = new StaleCache(),
    logger = console,
    // 의존성 주입: 테스트는 http 를 가짜로 넣어 네트워크 없이 검증한다.
    http = createClient({ baseUrl, name: 'recipe-api', timeoutMs, retries, deadlineMs, breaker }),
  } = options;

  /**
   * 서킷 개방 / 업스트림 실패 시의 폴백.
   *
   * 폴백 수준을 호출자가 고른다. 폴백은 공짜가 아니라 "허용할 거짓말의 크기"를
   * 고르는 선택이고, 라우트마다 감당할 수 있는 크기가 다르기 때문이다.
   *   'none'     — 폴백하지 않고 오류를 그대로 올린다.
   *   'stale'    — 캐시된(오래된) 값이 있으면 주고, 없으면 오류를 올린다.
   *   'degraded' — 캐시도 없으면 ID 만 채운 축소 응답을 준다.
   */
  function fallbackForRecipe(id, err, level) {
    if (level === 'none') throw err;

    const cached = cache.get(`recipe:${id}`);
    if (cached) {
      logger.warn?.({ id, err: err?.message }, 'recipe-api 실패 — 캐시된(오래된) 값으로 응답한다');
      return { ...cached.value, stale: true, cachedAt: new Date(cached.storedAt).toISOString() };
    }

    // 'stale' 은 "오래된 진실"까지만 허용한다. 지어낸 값은 허용하지 않는다.
    if (level !== 'degraded') throw err;

    logger.warn?.({ id, err: err?.message }, 'recipe-api 실패 — 축소된 응답으로 대체한다');
    return { id, title: null, description: null, ingredients: [], steps: [], degraded: true, stale: false };
  }

  return {
    /** 서킷 상태를 밖에서 관측할 수 있게 열어 둔다(헬스 체크·지표용). */
    get breakerState() {
      return http.breakerState ?? 'unknown';
    },

    /**
     * 레시피 하나를 가져온다.
     * @param {string} id
     * @param {{ fallback?: 'none'|'stale'|'degraded', deadline?: object }} [opts]
     */
    async getRecipe(id, opts = {}) {
      // 기본값은 'stale'. 단일 리소스 조회에서 지어낸 빈 껍데기를 200 으로
      // 돌려주면 소비자가 "이 레시피는 원래 비어 있다"고 오해한다.
      const { fallback = 'stale', deadline } = opts;
      const path = `/recipes/${encodeURIComponent(id)}`;

      let body;
      try {
        // 서킷이 열려 있으면 공유 클라이언트가 실제 호출 없이 CircuitOpenError 를
        // 던진다. 실패할 것이 뻔한 호출에 타임아웃만큼의 시간과 소켓을 낭비하지
        // 않는 것, 그것이 서킷 브레이커의 본질이다.
        ({ body } = await http.get(path, { deadline }));
      } catch (err) {
        // 404 는 장애가 아니라 정상적인 사실이다. 캐시나 축소 응답으로 덮으면
        // 삭제가 영원히 반영되지 않는다.
        if (upstreamStatus(err) === 404) {
          throw new NotFoundError(`레시피 ${id}`, { cause: err });
        }
        return fallbackForRecipe(id, err, fallback);
      }

      // 성공한 응답만 가용성 캐시에 담는다.
      cache.set(`recipe:${id}`, body);
      return body;
    },

    /**
     * 레시피 목록.
     * 폴백하지 않는다. 빈 목록은 "결과가 없다"는 거짓 사실을 말하기 때문이다.
     */
    async listRecipes(query = {}) {
      const search = new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== null),
      ).toString();
      const { body } = await http.get(`/recipes${search ? `?${search}` : ''}`);
      return body;
    },
  };
}

/**
 * (가상의) 평점 서비스 클라이언트 — 27.4절 오케스트레이션 예제용.
 *
 * 평점은 "있으면 좋은" 부가 정보다. 그래서 레시피 본문보다 타임아웃을 훨씬
 * 짧게(300ms) 잡고 재시도를 하지 않는다. 부가 정보를 기다리느라 핵심 정보의
 * 응답이 늦어지는 것은 본말전도다. 실패하면 그냥 null 로 둔다.
 */
export function createRatingClient(options = {}) {
  const {
    baseUrl,
    timeoutMs = 300,
    retries = 0,
    deadlineMs = 400,
    breaker = { failureThreshold: 10, resetTimeoutMs: 5_000, successThreshold: 1, halfOpenMax: 1 },
    http = createClient({ baseUrl, name: 'rating-api', timeoutMs, retries, deadlineMs, breaker }),
  } = options;

  return {
    get breakerState() {
      return http.breakerState ?? 'unknown';
    },
    async getRating(recipeId) {
      const { body } = await http.get(`/ratings/${encodeURIComponent(recipeId)}`);
      return body;
    },
  };
}

export default createRecipeClient;
