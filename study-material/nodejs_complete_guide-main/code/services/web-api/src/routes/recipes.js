// 27장 27.4절 / 6장 6.6절 대응 - API 프록시와 API 오케스트레이션, 그리고 부분 실패 허용.

/** 응답 직렬화 스키마. 선언한 필드만 나가므로 내부 필드 유출을 구조적으로 막는다. */
const recipeSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: ['string', 'null'] },
    description: { type: ['string', 'null'] },
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
    // 폴백으로 만들어진 응답임을 소비자가 알 수 있게 하는 표시.
    stale: { type: 'boolean', default: false },
    degraded: { type: 'boolean', default: false },
    cachedAt: { type: 'string' },
  },
};

const ratingSchema = {
  type: ['object', 'null'],
  properties: {
    average: { type: 'number' },
    count: { type: 'integer' },
  },
};

/**
 * 레시피 라우트.
 *
 * 의존성(recipeClient, ratingClient)은 register 옵션으로 주입받는다.
 * 모듈 최상단에서 클라이언트를 만들면 테스트가 진짜 네트워크에 붙게 되고,
 * 라우트 파일 하나를 import 하는 것만으로 소켓이 열리는 부작용이 생긴다.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ recipeClient: object, ratingClient?: object }} options
 */
export async function recipeRoutes(app, options) {
  const { recipeClient, ratingClient } = options;
  if (!recipeClient) throw new Error('recipeRoutes: recipeClient 가 필요하다');

  /**
   * GET /recipes — 목록. 단순 API 프록시 패턴이다.
   * 프록시라도 스키마로 응답을 좁혀 업스트림의 스키마 변경이 그대로
   * 외부 계약을 흔들지 않게 막는다.
   */
  app.get(
    '/recipes',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            cursor: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: recipeSchema },
              nextCursor: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
    async (request) => {
      const result = await recipeClient.listRecipes(request.query);
      return {
        data: Array.isArray(result) ? result : (result.data ?? []),
        nextCursor: Array.isArray(result) ? null : (result.nextCursor ?? null),
      };
    },
  );

  /**
   * GET /recipes/:id — 단건 조회.
   *
   * 여기서는 축소 응답('degraded')을 쓰지 않는다. 단건 리소스를 요청한
   * 클라이언트에게 빈 껍데기를 200 으로 주면 "이 레시피는 원래 내용이 없다"로
   * 오해된다. 캐시된 실제 값이 있으면 그것을 주고(stale), 없으면 정직하게
   * 502/504 를 낸다. 오류 번역은 error-handler 플러그인이 맡는다.
   */
  app.get(
    '/recipes/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', minLength: 1, maxLength: 64 } },
        },
        response: { 200: recipeSchema },
      },
    },
    async (request) => {
      return recipeClient.getRecipe(request.params.id, { fallback: 'stale' });
    },
  );

  /**
   * GET /recipes/:id/full — API 오케스트레이션.
   *
   * 두 업스트림을 순차로 부르면 지연이 더해지지만(t1 + t2), 병렬로 부르면
   * 둘 중 느린 쪽(max(t1, t2))이 곧 전체 지연이다. 서로 의존하지 않는 호출은
   * 언제나 병렬이 정답이다.
   *
   * Promise.all 이 아니라 Promise.allSettled 를 쓰는 이유(6.6절):
   *   all 은 하나가 rejected 되는 순간 즉시 reject 한다. 평점 서비스가
   *   삐끗했다고 레시피 본문까지 못 주게 되는 것은 과잉 반응이다.
   *   allSettled 는 모든 결과를 기다린 뒤 성공/실패를 각각 알려 주므로,
   *   "부분 성공"을 표현할 수 있다. 실패한 조각은 null 로 두고 전체 요청은
   *   200 으로 성공시킨다. 대신 어떤 조각이 빠졌는지 partial 필드에 적어
   *   소비자가 그 사실을 알 수 있게 한다(조용한 실패는 최악이다).
   *
   * 단, "핵심 조각"과 "부가 조각"은 구분한다. 레시피 본문이 통째로 실패했다면
   * 그것은 부분 실패가 아니라 전체 실패다. 그때는 오류를 올린다.
   */
  app.get(
    '/recipes/:id/full',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', minLength: 1, maxLength: 64 } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              recipe: recipeSchema,
              rating: ratingSchema,
              // 어떤 하위 호출이 실패했는지. 빈 배열이면 완전한 응답이다.
              partial: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params;

      const [recipeResult, ratingResult] = await Promise.allSettled([
        // 여기서는 축소 응답까지 허용한다. 합성 응답이므로 "레시피 조각이
        // 비었다"는 사실이 partial 배열과 degraded 플래그로 함께 전달된다.
        recipeClient.getRecipe(id, { fallback: 'degraded' }),
        ratingClient ? ratingClient.getRating(id) : Promise.resolve(null),
      ]);

      const partial = [];

      if (recipeResult.status === 'rejected') {
        // 핵심 조각의 실패는 부분 실패가 아니다. 그대로 올려 502/504 로 만든다.
        throw recipeResult.reason;
      }
      const recipe = recipeResult.value;
      if (recipe?.degraded || recipe?.stale) partial.push('recipe');

      let rating = null;
      if (ratingResult.status === 'fulfilled') {
        rating = ratingResult.value;
      } else {
        // 부가 조각의 실패는 삼키되, 반드시 로그와 partial 에 남긴다.
        request.log.warn({ err: ratingResult.reason, id }, 'rating 조회 실패 — null 로 응답한다');
        partial.push('rating');
      }

      return { recipe, rating, partial };
    },
  );

  return app;
}

export default recipeRoutes;
