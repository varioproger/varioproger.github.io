// 16장 16.4·16.6절, 19장 19.5절, 29장 29.5절 대응
// - JSON Schema 요청 검증과 응답 직렬화(내부 필드 유출 차단)
// - 커서 기반 페이지네이션
// - idempotency-key 헤더를 이용한 멱등 생성
import { randomUUID } from 'node:crypto';
import { NotFoundError, ValidationError } from '@ncg/shared/errors';
import { sql } from '../db/pool.js';

/**
 * 응답 스키마.
 *
 * ★ Fastify 는 응답 스키마에 선언된 프로퍼티만 직렬화한다(그 외는 버린다).
 *   그래서 이 스키마 자체가 "유출 방지 장치"다. recipes 테이블에는
 *   owner_id, internal_cost_cents 같은 내부 전용 컬럼이 있는데,
 *   select * 로 가져와 그대로 reply.send() 해도 여기에 없는 필드는 나가지 않는다.
 *   즉, 나중에 컬럼이 하나 추가되어도 기본값은 "노출하지 않음"이 된다.
 *   (allowlist 방식. denylist 로 지우는 방식은 새 컬럼이 생길 때마다 샌다.)
 */
const recipeResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'string' },
        },
      },
    },
    createdAt: { type: 'string' },
  },
};

const problemSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    instance: { type: 'string' },
    correlationId: { type: 'string', nullable: true },
  },
};

/** 페이지네이션 상한. 클라이언트가 limit=100000 을 보내 DB 를 쓸어가지 못하게 한다. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/** DB 행 -> API 표현. 화이트리스트로 명시적으로 옮긴다. */
export function toApiRecipe(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    // jsonb 는 드라이버가 이미 객체로 준다. 문자열로 오는 더블 구현도 감안한다.
    ingredients: typeof row.ingredients === 'string' ? JSON.parse(row.ingredients) : row.ingredients,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

/** 커서 인코딩: (created_at, id) 복합 키를 base64url 로 감싼다. */
export function encodeCursor(row) {
  const createdAt =
    row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
  return Buffer.from(JSON.stringify({ t: createdAt, id: row.id }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor) {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.t !== 'string' || typeof parsed?.id !== 'string') throw new Error('shape');
    if (Number.isNaN(Date.parse(parsed.t))) throw new Error('time');
    return parsed;
  } catch {
    // 잘못된 커서는 500 이 아니라 400 이다. 클라이언트가 손댄 값이기 때문이다.
    throw new ValidationError('cursor 값이 올바르지 않다.');
  }
}

/**
 * 레시피 라우트.
 * db/cache/config 를 opts 로 주입받는다. 모듈 최상단에서 커넥션을 만들면
 * 테스트에서 진짜 DB 가 필요해지므로, 의존성은 항상 밖에서 넣어 준다.
 */
export default async function recipesRoutes(app, opts = {}) {
  const { db, cache, config = {} } = opts;
  if (!db) throw new Error('recipesRoutes: db 의존성이 필요하다');
  if (!cache) throw new Error('recipesRoutes: cache 의존성이 필요하다');

  const cacheTtl = config.cacheTtlSeconds ?? 60;
  // 멱등성 키 보관 기간. 무한히 보관하면 테이블이 계속 커지고,
  // 너무 짧으면 클라이언트의 늦은 재시도가 중복 생성이 된다.
  const idempotencyTtl = config.idempotencyTtlSeconds ?? 86_400;
  const newId = opts.generateId ?? randomUUID;
  const cacheKey = (id) => `recipe:v1:${id}`;

  // ---------------------------------------------------------------- GET /recipes/:id
  app.get(
    '/recipes/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            // format: uuid 로 걸러내면 잘못된 값이 DB 까지 가지 않는다.
            // (Postgres 는 uuid 캐스팅 실패를 22P02 오류로 던지는데, 그건 500 으로
            //  새기 쉬운 형태다. 경계에서 400 으로 끝내는 편이 안전하다.)
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: recipeResponseSchema,
          404: problemSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;

      // 캐시 조회 -> 미스면 DB -> 캐시 저장. getOrSet 이 동일 키 동시 요청을
      // 하나로 묶어 주므로(요청 배칭) 만료 직후 스탬피드가 생기지 않는다.
      const recipe = await cache.getOrSet(cacheKey(id), cacheTtl, async () => {
        const { rows } = await db.query(
          // 내부 컬럼까지 가져오지만, 응답 스키마가 걸러 준다.
          // 그래도 select 목록을 명시하는 습관을 들인다(전송량과 인덱스 온리 스캔).
          sql`select id, title, ingredients, created_at
              from recipes
              where id = ${id}`,
        );
        return rows[0] ? toApiRecipe(rows[0]) : null;
      });

      // NotFoundError 는 자원 이름을 받아 메시지를 만든다(문구를 한 곳에서 관리).
      if (!recipe) throw new NotFoundError(`레시피 ${id}`);
      return recipe;
    },
  );

  // ------------------------------------------------------------------- GET /recipes
  app.get(
    '/recipes',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            /**
             * 커서 기반 페이지네이션을 쓰는 이유:
             * offset 방식은 offset 이 커질수록 DB 가 앞의 행을 전부 세고 버려야 해서
             * 뒤로 갈수록 느려지고, 페이지를 넘기는 사이에 행이 삽입되면 항목이
             * 중복되거나 건너뛰어진다. (created_at, id) 커서는 인덱스를 타고
             * 항상 같은 비용으로 다음 페이지를 준다.
             */
            cursor: { type: 'string', maxLength: 512 },
            // 상한을 스키마에 박아 둔다. maximum 을 넘기면 검증 단계에서 400 이다.
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: MAX_LIMIT,
              default: DEFAULT_LIMIT,
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: recipeResponseSchema },
              nextCursor: { type: 'string', nullable: true },
              hasMore: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request) => {
      const { cursor } = request.query;
      // 스키마가 이미 막지만, 다른 경로로 호출될 가능성에 대비해 코드에서도 한 번 더
      // 조인다(방어적 상한). 두 곳 중 하나만 있으면 언젠가 뚫린다.
      const limit = Math.min(Number(request.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);

      // limit + 1 을 가져와 "다음 페이지가 있는지"를 추가 count 질의 없이 판단한다.
      const fetchCount = limit + 1;

      let result;
      if (cursor) {
        const { t, id } = decodeCursor(cursor);
        result = await db.query(
          // 행 값 비교((a,b) < (c,d))는 복합 인덱스를 그대로 탄다.
          sql`select id, title, ingredients, created_at
              from recipes
              where (created_at, id) < (${t}, ${id})
              order by created_at desc, id desc
              limit ${fetchCount}`,
        );
      } else {
        result = await db.query(
          sql`select id, title, ingredients, created_at
              from recipes
              order by created_at desc, id desc
              limit ${fetchCount}`,
        );
      }

      const rows = result.rows ?? [];
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      return {
        data: page.map(toApiRecipe),
        nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]) : null,
        hasMore,
      };
    },
  );

  // ------------------------------------------------------------------ POST /recipes
  app.post(
    '/recipes',
    {
      schema: {
        headers: {
          type: 'object',
          properties: {
            'idempotency-key': { type: 'string', minLength: 8, maxLength: 200 },
          },
        },
        body: {
          type: 'object',
          required: ['title', 'ingredients'],
          // additionalProperties: false 로 모르는 필드를 거절한다.
          // 조용히 무시하면 클라이언트는 오타난 필드가 반영됐다고 착각한다.
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            ingredients: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                type: 'object',
                required: ['name', 'quantity'],
                additionalProperties: false,
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 100 },
                  quantity: { type: 'string', minLength: 1, maxLength: 50 },
                },
              },
            },
          },
        },
        response: {
          200: recipeResponseSchema, // 멱등 재요청(저장된 응답 재생)
          201: recipeResponseSchema,
          400: problemSchema,
        },
      },
    },
    async (request, reply) => {
      const idempotencyKey = request.headers['idempotency-key'];
      const { title, ingredients } = request.body;

      /**
       * 멱등성 키가 필요한 이유:
       * 클라이언트가 타임아웃으로 재시도하면 서버는 같은 생성 요청을 두 번 받는다.
       * 네트워크는 "응답이 안 온 것"과 "요청이 처리되지 않은 것"을 구분해 주지 않는다.
       * 키를 저장해 두고 같은 키로 다시 오면 저장된 응답을 그대로 돌려주면
       * 재시도가 안전해진다(= 클라이언트가 마음 놓고 재시도할 수 있다).
       */
      if (idempotencyKey) {
        const { rows } = await db.query(
          // 보관 기간이 지난 키는 없는 것으로 본다. 만료된 키로 재생하면
          // 클라이언트가 아주 오래된 응답을 받게 된다.
          sql`select response
              from idempotency_keys
              where key = ${idempotencyKey}
                and created_at > now() - (${String(idempotencyTtl)} || ' seconds')::interval`,
        );
        if (rows[0]) {
          const stored =
            typeof rows[0].response === 'string' ? JSON.parse(rows[0].response) : rows[0].response;
          // 재생임을 헤더로 알린다. 201 이 아니라 200 인 이유는
          // 이번 요청이 새로 만든 것이 아니기 때문이다.
          reply.header('idempotent-replay', 'true');
          return reply.code(200).send(stored);
        }
      }

      const id = newId();
      // 경합으로 저장된 응답을 재생하게 됐는지 표시한다.
      // reply.statusCode 는 기본값이 이미 200 이라 판별용으로 쓸 수 없다.
      let replayed = false;

      const created = await db.withTransaction(async (tx) => {
        const { rows } = await tx.query(
          sql`insert into recipes (id, title, ingredients)
              values (${id}, ${title}, ${JSON.stringify(ingredients)}::jsonb)
              returning id, title, ingredients, created_at`,
        );
        const apiRecipe = toApiRecipe(rows[0]);

        if (idempotencyKey) {
          /**
           * 레시피 삽입과 키 기록을 같은 트랜잭션에 묶는다.
           * 따로 하면 "레시피는 만들었는데 키 저장 전에 죽는" 창이 생기고,
           * 그 사이 재시도가 오면 레시피가 두 번 만들어진다.
           *
           * on conflict do nothing 은 동시에 들어온 같은 키를 처리한다.
           * 아무 행도 안 들어갔다면 다른 요청이 먼저 처리했다는 뜻이므로
           * 이 트랜잭션을 되돌리고 저장된 응답을 쓴다.
           */
          const inserted = await tx.query(
            sql`insert into idempotency_keys (key, response)
                values (${idempotencyKey}, ${JSON.stringify(apiRecipe)}::jsonb)
                on conflict (key) do nothing
                returning key`,
          );
          if ((inserted.rowCount ?? inserted.rows?.length ?? 0) === 0) {
            const conflict = new Error('idempotency conflict');
            conflict.__idempotencyConflict = true;
            throw conflict;
          }
        }
        return apiRecipe;
      }).catch(async (err) => {
        if (!err?.__idempotencyConflict) throw err;
        const { rows } = await db.query(
          sql`select response from idempotency_keys where key = ${idempotencyKey}`,
        );
        // 경합에서 진 쪽은 이긴 쪽이 저장한 응답을 그대로 돌려준다.
        const stored =
          typeof rows[0]?.response === 'string' ? JSON.parse(rows[0].response) : rows[0]?.response;
        replayed = true;
        reply.header('idempotent-replay', 'true');
        reply.code(200);
        return stored ?? null;
      });

      if (replayed) return created;

      // 갓 만든 레코드를 미리 캐시에 넣어 둔다(write-through).
      // 생성 직후 조회는 거의 항상 뒤따르므로 첫 조회의 DB 왕복을 아낀다.
      await cache.set(cacheKey(created.id), created, cacheTtl);

      reply.header('location', `/recipes/${created.id}`);
      return reply.code(201).send(created);
    },
  );
}
