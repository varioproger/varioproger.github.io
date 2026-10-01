// 27장 대응(테스트) - app.inject() 로 HTTP 계층까지 포함해 라우트를 검증한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, createFakeDb, createFakeCache } from './helpers/build-app.js';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

function seedRecipes() {
  return [
    {
      id: ID_A,
      title: '김치찌개',
      ingredients: [{ name: '김치', quantity: '300g' }],
      created_at: new Date('2026-01-03T00:00:00.000Z'),
      // 아래 두 개는 내부 전용 컬럼이다. 응답에 나오면 안 된다.
      owner_id: 'internal-owner-1',
      internal_cost_cents: 4200,
    },
    {
      id: ID_B,
      title: '된장찌개',
      ingredients: [{ name: '된장', quantity: '2큰술' }],
      created_at: new Date('2026-01-02T00:00:00.000Z'),
      owner_id: 'internal-owner-2',
      internal_cost_cents: 3100,
    },
    {
      id: ID_C,
      title: '비빔밥',
      ingredients: [{ name: '밥', quantity: '1공기' }],
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      owner_id: 'internal-owner-3',
      internal_cost_cents: 5000,
    },
  ];
}

test('GET /recipes/:id - 정상 조회 시 200 과 공개 필드만 반환한다', async (t) => {
  const db = createFakeDb({ recipes: seedRecipes() });
  const { app } = await buildTestApp({ db });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: `/recipes/${ID_A}` });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.id, ID_A);
  assert.equal(body.title, '김치찌개');
  assert.deepEqual(body.ingredients, [{ name: '김치', quantity: '300g' }]);
  assert.ok(typeof body.createdAt === 'string');

  // 응답 스키마가 내부 필드를 걸러 냈는지 확인한다.
  // 이 단언이 깨진다는 것은 유출 경로가 열렸다는 뜻이다.
  assert.equal(body.owner_id, undefined);
  assert.equal(body.internal_cost_cents, undefined);
  assert.deepEqual(Object.keys(body).sort(), ['createdAt', 'id', 'ingredients', 'title']);
});

test('GET /recipes/:id - 없는 id 는 404 problem+json 을 반환한다', async (t) => {
  const db = createFakeDb({ recipes: seedRecipes() });
  const { app } = await buildTestApp({ db });
  t.after(() => app.close());

  const missing = '99999999-9999-4999-8999-999999999999';
  const res = await app.inject({ method: 'GET', url: `/recipes/${missing}` });

  assert.equal(res.statusCode, 404);
  assert.match(res.headers['content-type'], /application\/problem\+json/);
  const body = res.json();
  assert.equal(body.status, 404);
});

test('POST /recipes - 스키마를 어기면 400 이고 DB 까지 가지 않는다', async (t) => {
  const db = createFakeDb();
  const { app } = await buildTestApp({ db });
  t.after(() => app.close());

  // title 누락 + ingredients 빈 배열 + 모르는 필드
  const res = await app.inject({
    method: 'POST',
    url: '/recipes',
    payload: { ingredients: [], nope: true },
  });

  assert.equal(res.statusCode, 400);
  assert.match(res.headers['content-type'], /application\/problem\+json/);
  // 검증 단계에서 잘렸으므로 insert 질의가 나가지 않아야 한다.
  assert.equal(
    db.__calls.some((c) => c.sql.includes('insert into recipes')),
    false,
  );

  // 잘못된 uuid 도 같은 이유로 400 이다(500 이 아니다).
  const badId = await app.inject({ method: 'GET', url: '/recipes/not-a-uuid' });
  assert.equal(badId.statusCode, 400);
});

test('GET /recipes - limit 상한을 강제하고 커서로 다음 페이지를 준다', async (t) => {
  const db = createFakeDb({ recipes: seedRecipes() });
  const { app } = await buildTestApp({ db });
  t.after(() => app.close());

  // 상한(100)을 넘는 limit 은 조용히 깎지 않고 400 으로 거절한다.
  const tooBig = await app.inject({ method: 'GET', url: '/recipes?limit=1000' });
  assert.equal(tooBig.statusCode, 400);

  // 첫 페이지
  const first = await app.inject({ method: 'GET', url: '/recipes?limit=2' });
  assert.equal(first.statusCode, 200);
  const page1 = first.json();
  assert.equal(page1.data.length, 2);
  assert.equal(page1.hasMore, true);
  assert.ok(page1.nextCursor);
  assert.deepEqual(
    page1.data.map((r) => r.id),
    [ID_A, ID_B],
  );

  // 두 번째 페이지: 커서 이후만, 중복 없이.
  const second = await app.inject({
    method: 'GET',
    url: `/recipes?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
  });
  assert.equal(second.statusCode, 200);
  const page2 = second.json();
  assert.deepEqual(
    page2.data.map((r) => r.id),
    [ID_C],
  );
  assert.equal(page2.hasMore, false);
  assert.equal(page2.nextCursor, null);

  // 손상된 커서는 400.
  const bad = await app.inject({ method: 'GET', url: '/recipes?cursor=%%%broken%%%' });
  assert.equal(bad.statusCode, 400);
});

test('POST /recipes - 같은 idempotency-key 재요청은 저장된 응답을 재생한다', async (t) => {
  const db = createFakeDb();
  const { app } = await buildTestApp({ db });
  t.after(() => app.close());

  const payload = {
    title: '떡볶이',
    ingredients: [{ name: '떡', quantity: '400g' }],
  };
  const headers = { 'idempotency-key': 'order-2026-09-01-abc123' };

  const first = await app.inject({ method: 'POST', url: '/recipes', payload, headers });
  assert.equal(first.statusCode, 201);
  const created = first.json();
  assert.equal(created.title, '떡볶이');
  assert.equal(first.headers.location, `/recipes/${created.id}`);

  // 클라이언트가 타임아웃으로 재시도한 상황.
  const retry = await app.inject({ method: 'POST', url: '/recipes', payload, headers });
  assert.equal(retry.statusCode, 200); // 새로 만든 게 아니므로 201 이 아니다
  assert.equal(retry.headers['idempotent-replay'], 'true');
  assert.deepEqual(retry.json(), created); // 완전히 같은 응답

  // 레코드는 하나만 만들어져야 한다.
  assert.equal(db.__rows.length, 1);

  // 키가 다르면 새로 만든다.
  const other = await app.inject({
    method: 'POST',
    url: '/recipes',
    payload,
    headers: { 'idempotency-key': 'order-2026-09-01-zzz999' },
  });
  assert.equal(other.statusCode, 201);
  assert.equal(db.__rows.length, 2);
  assert.notEqual(other.json().id, created.id);
});

test('GET /recipes/:id - 캐시 히트 시 DB 를 다시 치지 않는다', async (t) => {
  const db = createFakeDb({ recipes: seedRecipes() });
  const cache = createFakeCache();
  const { app } = await buildTestApp({ db, cache });
  t.after(() => app.close());

  await app.inject({ method: 'GET', url: `/recipes/${ID_A}` });
  await app.inject({ method: 'GET', url: `/recipes/${ID_A}` });

  const selects = db.__calls.filter((c) => c.sql.includes('where id ='));
  assert.equal(selects.length, 1, '두 번째 요청은 캐시에서 처리되어야 한다');
  assert.equal(cache.__loaderCalls(), 1);
});

test('GET /recipes/:id - 동시 요청은 loader 한 번으로 합쳐진다(스탬피드 방지)', async (t) => {
  const db = createFakeDb({ recipes: seedRecipes() });
  const cache = createFakeCache();
  const { app } = await buildTestApp({ db, cache });
  t.after(() => app.close());

  const results = await Promise.all(
    Array.from({ length: 10 }, () => app.inject({ method: 'GET', url: `/recipes/${ID_B}` })),
  );

  for (const res of results) assert.equal(res.statusCode, 200);
  assert.equal(cache.__loaderCalls(), 1, '동일 키 동시 요청은 in-flight 맵으로 배칭된다');
});

test('GET /health/live 는 의존성이 죽어도 200 이고, /health/ready 는 503 이다', async (t) => {
  const db = createFakeDb();
  // ping 이 실패하는 DB 더블
  db.ping = async () => {
    throw new Error('connection refused');
  };
  const { app } = await buildTestApp({ db });
  t.after(() => app.close());

  const live = await app.inject({ method: 'GET', url: '/health/live' });
  assert.equal(live.statusCode, 200);
  assert.equal(live.json().status, 'ok');

  const ready = await app.inject({ method: 'GET', url: '/health/ready' });
  assert.equal(ready.statusCode, 503);
  const body = ready.json();
  assert.equal(body.status, 'not-ready');
  assert.equal(body.checks.find((c) => c.name === 'postgres').status, 'fail');
});
