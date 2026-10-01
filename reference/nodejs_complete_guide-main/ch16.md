---
title: "16장. 웹 서버와 API 설계"
---

# 16장. 웹 서버와 API 설계

앞의 장들에서 web-api는 `node:http`의 `createServer` 위에 `if (url.pathname === ...)` 분기를 쌓아 올린 상태로 남아 있었다. 이 장에서 그 코드를 걷어내고 web-api를 Fastify 기반의 제대로 된 HTTP 서비스로 다시 만든다.

다만 프레임워크를 배우는 것이 목적은 아니다. 프레임워크가 감춘 것을 먼저 드러내고(16.1), 두 대표 프레임워크가 무엇을 다르게 선택했는지 비교한 다음(16.2), 파이프라인·검증·오류·API 규약·전송이라는 다섯 축으로 서비스를 완성한다. 이 장을 마치면 web-api는 스키마로 검증되고, 오류 규약이 정해져 있으며, 대용량 응답과 업로드를 메모리에 담지 않고 처리하는 서비스가 된다.

## 16.1 라우팅의 원리와 직접 구현

### 왜 필요한가

HTTP 서버가 애플리케이션에게 주는 것은 놀랄 만큼 적다. `req.method`라는 문자열과 `req.url`이라는 문자열, 그리고 헤더 객체가 전부다. `GET /recipes/42/ingredients?limit=10`이라는 요청이 도착했을 때, 이것이 "42번 레시피의 재료 목록 조회"라는 의미임을 아는 것은 Node.js가 아니라 우리다.

라우팅(routing)은 이 (메서드, 경로) 쌍을 핸들러 함수와 경로 파라미터(path parameter)로 변환하는 작업이다. 엔드포인트가 서너 개일 때는 `if`문 몇 개로 충분하다. 그러나 엔드포인트가 30개가 되고 그중 절반이 `/:id`를 포함하는 순간, 분기문은 세 가지 방식으로 무너진다. 첫째, 경로를 직접 `split`하고 인덱스로 세그먼트를 꺼내는 코드가 곳곳에 중복된다. 둘째, 경로는 맞지만 메서드가 다른 요청에 404를 주게 되어 405 Method Not Allowed와 404 Not Found를 구분하지 못한다. 셋째, 분기 순서에 의미가 생겨 `/recipes/new`가 `/recipes/:id`에 먼저 잡히는 버그가 조용히 들어온다.

프레임워크의 정체를 이해하려면 라우터를 한 번 직접 만들어보는 것이 가장 빠르다. 라우터는 마법이 아니라 자료구조다.

### 어떻게 동작하는가

라우터 구현은 크게 두 계열로 나뉜다.

**정규식 배열 순회 방식**은 등록된 라우트를 순서대로 배열에 넣고, 요청마다 앞에서부터 정규식을 시험한다. Express 4의 방식이 이것이다. `/recipes/:id`는 `path-to-regexp`에 의해 `/^\/recipes\/([^/]+?)\/?$/i` 같은 정규식으로 변환된다. 구현이 단순하고 어떤 패턴이든 표현할 수 있지만, 비용이 라우트 개수 `n`에 선형으로 비례한다. 라우트 200개짜리 서비스에서 마지막에 등록된 라우트를 매칭하려면 정규식 199번을 헛돌린다. 게다가 각 정규식 시도는 백트래킹(backtracking)을 동반할 수 있어 상수 인자도 작지 않다.

**트라이(trie) 방식**은 경로를 `/` 기준으로 자른 세그먼트를 트리의 간선으로 삼는다. `/recipes/:id/ingredients`를 등록하면 루트 아래 `recipes` 노드, 그 아래 파라미터 노드, 그 아래 `ingredients` 노드가 생긴다. 요청이 오면 세그먼트를 하나씩 따라 내려가기만 하면 되므로 비용이 등록된 라우트 수와 무관하고 **경로 세그먼트 깊이 `k`에만 비례**한다. 라우트가 2개든 2,000개든 `/recipes/42/ingredients`를 찾는 데 드는 일은 노드 조회 3번이다. Fastify가 쓰는 `find-my-way`는 여기에 공통 접두사를 압축한 급진 트라이(radix tree)를 사용한다.

트라이 방식에는 부수 효과로 얻는 이점이 하나 더 있다. 매칭이 순서가 아니라 **구체성(specificity)** 으로 결정된다는 점이다. 같은 위치에 정적 세그먼트와 파라미터 세그먼트가 모두 존재하면 정적 노드를 먼저 시도한다. 그래서 `/recipes/new`와 `/recipes/:id`를 어떤 순서로 등록하든 `/recipes/new` 요청은 항상 정적 라우트로 간다. 정규식 순회 방식에서 등록 순서를 잘못 잡아 생기는 버그가 구조적으로 사라진다.

### 코드

`node:http` 위에 최소한의 트라이 라우터를 만들어보자. 정적 세그먼트, `:param`, 마지막 세그먼트의 `*` 와일드카드만 지원한다.

```js
// router.js — 트라이 기반 최소 라우터
const PARAM = Symbol('param');
const WILD = Symbol('wildcard');

const createNode = () => ({ children: new Map(), handlers: null, paramName: null });

export class Router {
  #root = createNode();

  add(method, path, handler) {
    let node = this.#root;
    for (const seg of path.split('/').filter(Boolean)) {
      let key = seg;
      if (seg.startsWith(':')) key = PARAM;
      else if (seg === '*') key = WILD;

      if (!node.children.has(key)) node.children.set(key, createNode());
      node = node.children.get(key);
      if (key === PARAM) node.paramName = seg.slice(1);
    }
    node.handlers ??= new Map();
    node.handlers.set(method, handler);
    return this;
  }

  find(method, pathname) {
    const segments = pathname.split('/').filter(Boolean);
    const params = {};
    let node = this.#root;

    for (let i = 0; i < segments.length; i++) {
      // 퍼센트 인코딩은 매칭 직전에 푼다 (%2F가 세그먼트를 쪼개지 못하도록)
      const seg = decodeURIComponent(segments[i]);
      const next = node.children.get(seg)          // 1순위: 정적
        ?? node.children.get(PARAM)                // 2순위: 파라미터
        ?? node.children.get(WILD);                // 3순위: 와일드카드
      if (!next) return { status: 404 };

      if (next === node.children.get(WILD)) {
        params['*'] = segments.slice(i).join('/');
        node = next;
        break;
      }
      if (next.paramName) params[next.paramName] = seg;
      node = next;
    }

    if (!node.handlers) return { status: 404 };
    const handler = node.handlers.get(method);
    // 경로는 있는데 메서드가 없다 → 404가 아니라 405다
    if (!handler) return { status: 405, allow: [...node.handlers.keys()] };
    return { status: 200, handler, params };
  }
}
```

이 라우터를 서버에 붙이면 프레임워크의 뼈대가 완성된다.

```js
// server.js
import { createServer } from 'node:http';
import { Router } from './router.js';

const router = new Router()
  .add('GET', '/recipes/:id', async (req, res, { params }) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: Number(params.id) }));
  });

createServer((req, res) => {
  // 쿼리스트링은 경로가 아니다. 반드시 먼저 떼어낸다
  const url = new URL(req.url, `http://${req.headers.host}`);
  const match = router.find(req.method, url.pathname);

  if (match.status === 405) {
    res.writeHead(405, { allow: match.allow.join(', ') }).end();
    return;
  }
  if (match.status === 404) { res.writeHead(404).end(); return; }

  match.handler(req, res, { params: match.params, query: url.searchParams });
}).listen(3000);
```

### 실무 함정

**퍼센트 인코딩을 언제 푸는가가 보안 문제다.** 경로 전체를 먼저 `decodeURIComponent`한 뒤 `/`로 자르면, `%2F`를 담은 경로가 세그먼트 경계를 만들어낸다. 반드시 자른 다음에 디코딩해야 한다. 위 코드가 그 순서를 지키는 이유다. 정적 파일을 제공한다면 여기에 `..` 제거까지 더해야 한다(8장 참조).

**트레일링 슬래시 정책을 정하지 않으면 캐시가 갈라진다.** `/recipes`와 `/recipes/`를 둘 다 200으로 처리하면 CDN과 브라우저 캐시에 같은 리소스가 두 벌 쌓이고, 상대 경로 링크가 어긋난다. 한쪽을 정본으로 정하고 다른 쪽은 301로 리다이렉트하는 편이 낫다.

**직접 만든 정규식 라우터는 ReDoS의 통로가 된다.** 사용자가 경로 패턴을 정의할 수 있는 구조라면 더 위험하다. `path-to-regexp`에도 중첩 수량자로 인한 지수 시간 매칭 취약점이 여러 차례 보고되었다. 트라이 라우터는 정규식을 쓰지 않으므로 이 부류의 위험이 원천적으로 없다.

**라우트는 부팅 시점에 모두 등록하고 그 뒤에는 바꾸지 않는다.** 요청 중에 라우트를 추가하는 구조는 트리를 다시 최적화할 기회를 잃고 매칭 결과를 비결정적으로 만든다. Fastify가 `listen()` 이후의 라우트 등록을 거부하는 것은 제약이 아니라 설계다.

## 16.2 Express / Fastify 비교와 선택

### 왜 필요한가

Node.js에서 HTTP 프레임워크를 고르는 일은 대개 Express와 Fastify 사이의 선택으로 좁혀진다. 두 프레임워크는 "미들웨어를 쌓아 요청을 처리한다"는 겉모습이 비슷해서, 벤치마크 숫자 몇 개로 결정을 내리기 쉽다. 그러나 실제로 프로젝트의 수명을 좌우하는 차이는 처리량이 아니라 **비동기 오류가 어디로 가는가**, **스키마가 일급 시민인가**, **플러그인이 격리되는가**에 있다.

### 어떻게 동작하는가: 네 축의 비교

**처리량.** Fastify는 라우팅에 급진 트라이를, 응답 직렬화에 스키마 기반 코드 생성을 쓴다. 두 최적화 모두 요청당 상수 비용을 줄이므로, 순수 JSON 응답 벤치마크에서 Express 4의 두 배 이상 나오는 것이 보통이다. 다만 이 차이는 핸들러가 아무 일도 하지 않을 때 가장 크게 나타난다. 데이터베이스 조회가 20밀리초 걸리는 실제 엔드포인트에서 프레임워크 오버헤드 차이는 전체의 몇 퍼센트에 불과하다. 처리량만으로 결정하면 대개 잘못된 이유로 옳은 선택을 하게 된다.

**비동기 오류 처리.** 이것이 진짜 차이다. Express 4의 미들웨어 시그니처는 `(req, res, next)`이고, Express는 미들웨어의 **반환값을 보지 않는다.** `async` 함수는 예외를 던지는 대신 거부된 프로미스를 반환하므로, Express 4는 그 거부를 알아챌 방법이 없다. 결과는 응답이 영원히 오지 않는 요청과, 프로세스 어딘가에 남는 처리되지 않은 거부(unhandled rejection)다. Express 5는 이 문제를 해결해 async 핸들러의 거부를 오류 핸들러로 전달하지만, 여전히 대다수의 프로덕션 코드베이스는 Express 4 위에 있다.

**스키마 지원.** Fastify는 라우트 정의에 JSON Schema를 넣는 것을 기본 문법으로 삼는다. 검증뿐 아니라 응답 직렬화와 OpenAPI 문서 생성이 같은 스키마 하나에서 파생된다(16.4). Express에서 같은 일을 하려면 검증 미들웨어, 직렬화 규칙, 문서를 각각 따로 관리해야 하고, 셋이 어긋나는 순간을 잡아줄 장치가 없다.

**플러그인 캡슐화.** Express의 `app.use`는 전역이다. 어떤 미들웨어를 등록하면 그 아래 모든 라우트에 적용되고, `app.locals`에 붙인 값은 애플리케이션 전체에서 보인다. Fastify의 플러그인은 기본적으로 **캡슐화(encapsulation)** 된다. 플러그인 안에서 등록한 훅과 데코레이터는 그 플러그인의 하위 컨텍스트에만 존재한다. 그래서 `/admin` 하위에만 인증을 걸거나, 두 라우트 그룹이 서로 다른 데이터베이스 연결을 쓰게 하는 일이 설정이 아니라 구조로 표현된다. 전역으로 올리고 싶을 때만 `fastify-plugin`으로 캡슐화를 명시적으로 깬다.

### 코드: Express 4에서 삼켜지는 예외

```js
// express4-trap.js
import express from 'express';
const app = express();

app.get('/recipes/:id', async (req, res) => {
  // 이 예외는 next()로 전달되지 않는다.
  // Express 4는 반환된 프로미스를 보지 않으므로 거부가 그대로 유실된다.
  throw new Error('DB 연결 실패');
  // 클라이언트는 응답을 받지 못하고 소켓 타임아웃까지 매달린다
});

app.use((err, req, res, next) => {
  // 여기는 호출되지 않는다
  res.status(500).json({ error: 'internal' });
});
```

Express 4에서 안전하게 쓰려면 모든 async 핸들러를 감싸는 래퍼가 필요하다.

```js
// 모든 async 핸들러를 이 함수로 감싸야 한다 — 하나라도 빠뜨리면 조용히 매달린다
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/recipes/:id', wrap(async (req, res) => { throw new Error('DB 연결 실패'); }));
```

Fastify는 같은 코드가 그냥 동작한다. 핸들러의 반환값이 프로미스이면 프레임워크가 그것을 기다리고, 거부되면 오류 핸들러로 보낸다.

```js
// fastify-ok.js
import Fastify from 'fastify';
const app = Fastify({ logger: true });

app.get('/recipes/:id', async (req, reply) => {
  throw new Error('DB 연결 실패'); // → setErrorHandler로 전달, 500 응답 보장
});

app.setErrorHandler((err, req, reply) => {
  req.log.error({ err }, '요청 처리 실패');
  reply.code(500).send({ error: 'internal' });
});

await app.listen({ port: 3000, host: '0.0.0.0' });
```

이 차이는 취향이 아니다. "모든 핸들러를 빠짐없이 감싸야 안전한 구조"와 "감싸지 않아도 안전한 구조"의 차이이며, 팀이 커질수록 전자는 반드시 한 번은 실패한다.

### 선택 기준

| 상황 | 권장 |
|---|---|
| 기존 Express 미들웨어 자산이 크다 | Express (또는 `@fastify/express`로 점진 이전) |
| 새 서비스이고 API 계약을 스키마로 관리하고 싶다 | Fastify |
| 라우트 그룹마다 다른 인증·의존성이 필요하다 | Fastify (캡슐화) |
| 팀이 async/await를 전면적으로 쓴다 | Fastify 또는 Express 5 |
| 미들웨어 생태계의 가장 넓은 선택지가 필요하다 | Express |

이 책은 web-api를 Fastify로 구현한다. 이유는 속도가 아니라 스키마와 캡슐화이며, 이어지는 절들이 그 이유를 채운다.

### 실무 함정

**Express 5로 올렸다고 래퍼를 다 지우면 안 된다.** Express 5가 처리하는 것은 핸들러가 반환한 프로미스의 거부다. 핸들러 안에서 `setTimeout` 콜백이나 이벤트 리스너 안에서 던진 예외는 여전히 아무도 잡지 않는다. 이것은 프레임워크가 아니라 비동기 실행 컨텍스트의 문제다(6장 참조).

**Fastify의 캡슐화는 처음 만나면 "왜 안 보이지"의 원인이 된다.** 플러그인 안에서 `fastify.decorate('db', pool)`을 하면 바깥에서 `app.db`가 `undefined`다. 공유 자원을 붙이는 플러그인은 `fastify-plugin`으로 감싸고, 라우트 그룹은 감싸지 않는다 — 이 한 줄이 Fastify 구조 설계의 절반이다.

**미들웨어 호환성을 과대평가하지 않는다.** `@fastify/express`나 `@fastify/middie`로 Express 미들웨어를 끼울 수는 있지만, 그 순간 Fastify의 훅 생명주기 밖에서 동작하는 코드가 생기고 성능 이점도 상당 부분 사라진다. 이식은 이전 기간의 임시 수단으로만 쓴다.

## 16.3 미들웨어 파이프라인 설계

### 왜 필요한가

14.8에서 미들웨어를 "공유 컨텍스트를 받아 가공하고 다음으로 넘기는 함수들의 파이프라인"으로 정의했다(14장 참조). 그 패턴을 HTTP에 적용하면 인증, 본문 파싱, 로깅, 레이트 리미팅, CORS 헤더 부착 같은 횡단 관심사가 핸들러 바깥으로 빠진다. 여기까지는 누구나 한다.

문제는 그다음이다. 파이프라인의 **순서가 곧 의미**이므로, 순서를 잘못 잡은 파이프라인은 기능적으로는 동작하면서 보안이나 성능에서 조용히 실패한다. 그리고 미들웨어에서 만든 정보 — 요청 ID, 인증된 사용자, 테넌트 — 를 핸들러 깊숙한 곳의 로깅이나 데이터베이스 계층까지 전달하는 문제가 남는다. 이것을 함수 인자로 계속 넘기면 모든 함수의 시그니처가 오염된다.

### 어떻게 동작하는가

Express의 파이프라인은 평면적이다. 등록된 모든 미들웨어가 하나의 스택에 쌓이고, 요청은 위에서 아래로 흐른다. Fastify는 여기서 갈라진다. 파이프라인을 **생명주기 훅(lifecycle hook)** 으로 이름 붙여 나눈다.

- `onRequest`: 본문을 읽기 전. 인증 토큰 검사, 레이트 리미팅, 요청 ID 발급이 여기 속한다.
- `preParsing` / `preValidation`: 본문 파싱 전후, 스키마 검증 전.
- `preHandler`: 검증을 통과한 뒤, 핸들러 직전. 권한(authorization) 검사가 여기다.
- `onSend`: 응답 직렬화 후 소켓에 쓰기 직전. 헤더 조작이 마지막으로 가능한 지점.
- `onResponse`: 응답 완료 후. 접근 로그와 메트릭 기록.

이 이름들은 단순한 분류가 아니라 **순서 실수를 구조적으로 막는 장치**다. "인증은 본문을 읽기 전에"라는 규칙이 `onRequest`라는 이름에 박혀 있기 때문이다.

순서가 만드는 대표적인 버그 셋을 보자. **인증을 본문 파싱 뒤에 두면**, 인증되지 않은 요청도 최대 크기의 본문을 읽고 파싱한 뒤에야 거절된다. 이는 그 자체로 증폭 공격(amplification) 표면이다. **레이트 리미터를 인증 뒤에 두면**, 비용이 큰 토큰 검증이 제한 없이 수행된다. **오류 핸들러 뒤에 CORS 헤더를 붙이면**, 오류 응답에는 CORS 헤더가 빠져 브라우저가 실제 오류 대신 CORS 오류를 보고한다. 디버깅에 반나절이 날아가는 종류의 버그다.

요청별 컨텍스트 전파는 `AsyncLocalStorage`로 푼다. `onRequest` 훅에서 저장소를 열고 상관관계 ID(correlation ID)와 사용자 정보를 담으면, 그 요청에서 파생된 모든 비동기 호출 스택이 같은 저장소를 본다. 로거는 인자를 받지 않고도 현재 요청의 ID를 붙일 수 있다. 이 ID를 recipe-api 호출의 헤더로 전달하면 서비스 경계를 넘는 추적이 완성된다(31장 참조).

### 코드

```js
// context.js — 요청 범위 컨텍스트
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContext = new AsyncLocalStorage();
export const getRequestId = () => requestContext.getStore()?.requestId;
```

```js
// plugins/context.js — Fastify 플러그인으로 등록
import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../context.js';

async function contextPlugin(app) {
  app.addHook('onRequest', (req, reply, done) => {
    // 상류에서 온 ID를 존중하고, 없을 때만 새로 만든다
    const requestId = req.headers['x-request-id'] ?? randomUUID();
    reply.header('x-request-id', requestId);
    req.id = requestId;
    // done을 저장소 안에서 호출해야 이후 훅과 핸들러가 컨텍스트를 상속한다
    requestContext.run({ requestId, user: null }, done);
  });
}

export default fp(contextPlugin); // 전역에 필요하므로 캡슐화를 깬다
```

```js
// app.js — 순서가 의미인 파이프라인
import Fastify from 'fastify';
import contextPlugin from './plugins/context.js';
import { getRequestId } from './context.js';

const app = Fastify({ bodyLimit: 1024 * 256 }); // 256KB. 파싱 전에 강제된다

await app.register(contextPlugin);                 // 1. 컨텍스트: 가장 먼저
await app.register(import('@fastify/cors'));       // 2. CORS: 오류 응답에도 붙도록 앞에
await app.register(import('@fastify/rate-limit'), { max: 100, timeWindow: '1 minute' });

// 인증은 onRequest — 본문을 읽기 전에 끝낸다
app.addHook('onRequest', async (req) => {
  const token = req.headers.authorization?.slice(7);
  req.user = token ? await verifyToken(token) : null;
});

// 권한은 preHandler — 검증된 파라미터가 있어야 판단할 수 있다
app.register(async (admin) => {
  admin.addHook('preHandler', async (req) => {
    if (req.user?.role !== 'admin') throw new ForbiddenError();
  });
  admin.get('/admin/stats', async () => ({ requestId: getRequestId() }));
}); // 이 훅은 이 하위 컨텍스트 밖으로 새지 않는다
```

### 실무 함정

**`AsyncLocalStorage.run()` 밖에서 `done()`을 호출하면 컨텍스트가 전파되지 않는다.** 위 코드에서 `run(store, done)` 형태로 콜백을 넘긴 이유가 이것이다. `run(store, () => {}); done();`으로 쓰면 저장소는 즉시 닫히고 이후 스택은 `undefined`를 본다. 조용히 실패하는 종류라 테스트에서 잡히지 않는다.

**컨텍스트에 무엇이든 담기 시작하면 전역 변수가 된다.** 저장소에는 요청 ID, 사용자 식별자, 테넌트처럼 **요청의 정체성**만 담는다. 중간 계산 결과나 서비스 인스턴스를 담으면 데이터 흐름이 코드에서 사라지고 테스트가 불가능해진다.

**미들웨어에서 응답을 보낸 뒤 `next()`를 호출하지 않는다.** Express에서 `res.json(...)` 뒤에 `next()`를 부르면 다음 미들웨어가 이미 끝난 응답에 다시 쓰려 하고 `ERR_HTTP_HEADERS_SENT`가 난다. Fastify 훅에서는 `reply.send()` 후 그냥 반환하면 나머지 생명주기가 건너뛰어진다.

**훅에서 `async`와 `done`을 섞지 않는다.** Fastify 훅을 `async`로 선언하면서 `done`도 받아 호출하면 훅이 두 번 완료된 것으로 처리된다. 둘 중 하나만 쓴다.

## 16.4 요청 검증과 스키마 기반 직렬화

### 왜 필요한가

핸들러가 받는 모든 입력은 신뢰할 수 없다. 경로 파라미터의 `id`가 숫자라는 보장이 없고, 본문의 `quantity`가 문자열 `"2"`인지 숫자 `2`인지 알 수 없으며, 클라이언트가 보내지 않기로 한 필드가 실제로 없다는 보장도 없다. 이것을 핸들러 안에서 `if (typeof x !== 'number')`로 확인하기 시작하면, 검증 코드가 비즈니스 로직 사이사이에 흩어지고 어떤 계약(contract)이 실제로 강제되고 있는지 아무도 알 수 없게 된다.

응답 쪽은 더 위험하다. 데이터베이스에서 꺼낸 사용자 행 객체를 `reply.send(user)`로 그대로 보내면, 그 행에 나중에 `password_hash`나 `internal_note` 컬럼이 추가되는 날 그 값들이 API로 유출된다. 코드를 한 줄도 바꾸지 않았는데 유출이 생긴다는 점이 이 사고의 본질이다. 명시적 화이트리스트가 없는 직렬화는 시한폭탄이다.

### 어떻게 동작하는가

JSON Schema는 이 두 문제를 하나의 선언으로 푼다. Fastify는 라우트마다 `body`, `querystring`, `params`, `headers`, `response` 스키마를 받는다.

요청 쪽에서는 Ajv가 스키마를 **자바스크립트 코드로 컴파일**한다. 서버 부팅 시 한 번 컴파일된 검증 함수는 이후 해석 오버헤드 없이 실행되므로, 손으로 쓴 `if`문 검증보다 대개 빠르다. 여기에 타입 강제(coercion)가 얹힌다. HTTP에서 쿼리스트링과 경로 파라미터는 언제나 문자열이므로, 스키마에 `type: 'integer'`라고 쓰면 Fastify가 `"42"`를 `42`로 바꿔 핸들러에 넘긴다. `Number()` 변환과 `NaN` 검사가 코드에서 사라진다.

응답 쪽에서는 `fast-json-stringify`가 스키마로부터 **전용 직렬화 함수를 생성**한다. 일반적인 `JSON.stringify`는 런타임에 객체를 순회하며 각 값의 타입을 확인해야 하지만, 생성된 함수는 필드 이름과 타입이 이미 코드에 박혀 있으므로 문자열 연결에 가깝게 동작한다. 벤치마크에서 2~3배 빠른 경우가 흔하다.

그런데 속도보다 중요한 성질이 따라온다. **스키마에 없는 속성은 출력되지 않는다.** 이것은 부수 효과가 아니라 생성 방식의 필연이다. 생성된 함수는 스키마에 적힌 필드만 읽으므로, 객체에 `password_hash`가 있든 없든 애초에 접근하지 않는다. 응답 스키마는 성능 최적화인 동시에 **출력 화이트리스트**다.

### 코드

```js
// schemas.js — 공용 스키마는 $id로 등록해 재사용한다
export const recipeSchema = {
  $id: 'recipe',
  type: 'object',
  required: ['id', 'name'],
  properties: {
    id: { type: 'integer' },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    steps: { type: 'array', items: { type: 'string' } },
  },
};
```

```js
// routes/recipes.js
export default async function recipeRoutes(app) {
  app.addSchema(recipeSchema);

  app.get('/recipes/:id', {
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'integer', minimum: 1 } }, // "42" → 42로 강제
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: { includeSteps: { type: 'boolean', default: false } },
        additionalProperties: false, // 모르는 쿼리 파라미터는 거부
      },
      response: {
        200: { $ref: 'recipe#' },   // 여기 없는 필드는 절대 나가지 않는다
        404: { $ref: 'problem#' },
      },
    },
  }, async (req) => {
    const row = await db.findRecipe(req.params.id); // id는 이미 number다
    if (!row) throw new NotFoundError('recipe', req.params.id);
    return row; // row에 internal_cost가 있어도 응답에는 나오지 않는다
  });
}
```

응답 스키마의 효과를 확인하는 것은 간단하다.

```js
// row = { id: 42, name: 'Tikka', internal_cost: 3.5, password_hash: '$2b$...' }
// 실제 응답 본문 → {"id":42,"name":"Tikka"}
// 스키마가 없었다면 두 내부 필드가 그대로 나갔을 것이다
```

### 실무 함정

**`additionalProperties: false`를 요청에는 쓰고 응답에는 무의미하다.** 요청 스키마에서 이 설정은 예상치 못한 필드를 거부해 오타와 파라미터 오염을 잡는다. 반면 응답 스키마는 기본적으로 화이트리스트로 동작하므로 이 설정 없이도 미지정 필드가 제거된다. 다만 응답에 `additionalProperties: true`를 넣으면 화이트리스트가 풀린다 — 이 한 줄이 유출을 되살린다.

**타입 강제는 편리한 만큼 느슨하다.** `type: 'boolean'`에 `"false"` 문자열이 오면 Ajv의 강제 규칙상 `true`가 아니라 `false`로 해석되지만, `"0"`이나 `"no"`는 검증 실패다. 강제 규칙을 외우기보다 클라이언트 계약을 명확히 문서화하는 편이 낫다.

**검증 오류 메시지를 그대로 클라이언트에 내보내지 않는다.** Ajv의 기본 메시지는 내부 스키마 경로(`body/items/0/quantity`)를 포함한다. 이는 개발 중에는 유용하지만 공개 API에서는 내부 구조를 노출한다. 오류를 자체 포맷으로 변환하는 지점이 필요하며, 그것이 다음 절이다.

**스키마를 라우트마다 복사하지 않는다.** `addSchema`로 `$id`를 등록하고 `$ref`로 참조하면 컴파일도 한 번만 일어나고, 스키마가 곧 OpenAPI 문서가 된다(`@fastify/swagger`는 등록된 스키마를 그대로 읽는다).

## 16.5 오류 처리 미들웨어와 오류 응답 규약

### 왜 필요한가

API를 쓰는 쪽에서 가장 자주 겪는 좌절은 실패했을 때 이유를 알 수 없다는 것이다. 어떤 엔드포인트는 `{"error": "bad request"}`를, 어떤 엔드포인트는 `{"message": "Validation failed", "errors": [...]}`를, 어떤 엔드포인트는 HTML 스택 트레이스를 반환한다. 클라이언트는 결국 상태 코드만 보고 나머지는 문자열 매칭으로 추측하게 된다.

반대편의 위험은 과잉 노출이다. 처리되지 않은 예외를 그대로 직렬화하면 스택 트레이스, 파일 경로, SQL 질의문, 심지어 연결 문자열이 클라이언트에게 간다. 이것은 공격자에게 내부 지도를 제공하는 일이다.

오류 규약(error contract)은 이 둘 사이에서 "클라이언트가 프로그램적으로 분기할 수 있을 만큼 구체적이되, 내부 구현은 드러내지 않는" 지점을 고정하는 일이다.

### 어떻게 동작하는가

RFC 7807은 이 규약의 표준안이다. `Content-Type: application/problem+json`에 다음 필드를 담는다.

- `type`: 오류 종류를 식별하는 URI. 클라이언트가 분기 기준으로 삼는 **안정적인 키**다.
- `title`: 사람이 읽는 짧은 요약. 같은 `type`이면 항상 같아야 한다.
- `status`: HTTP 상태 코드.
- `detail`: 이 발생 건에 대한 설명. 사람을 위한 것이며 파싱 대상이 아니다.
- `instance`: 이 발생 건을 가리키는 URI 또는 식별자.

여기에 확장 필드를 자유롭게 더할 수 있고, 이 책의 규약은 `requestId`(16.3의 상관관계 ID)와 검증 실패 시 `invalidParams`를 더한다. `requestId`를 응답에 넣는 이유는 명확하다. 사용자가 "오류가 났어요"라고 신고할 때 그 ID 하나면 로그에서 해당 요청의 전체 궤적을 찾을 수 있다. 지원 비용을 가장 크게 줄이는 한 줄이다.

상태 코드 선택은 세 개의 질문으로 결정한다. **누구의 잘못인가**가 첫 번째다. 클라이언트가 고칠 수 있으면 4xx, 서버 문제면 5xx다. 같은 요청을 그대로 다시 보내 성공할 가능성이 있으면 5xx(또는 429), 없으면 4xx라고 바꿔 말할 수도 있다. **재시도가 의미 있는가**가 두 번째다. 502/503/504는 재시도 가능, 400/422는 불가능이며, 이 구분이 클라이언트의 재시도 로직과 서킷 브레이커 동작을 좌우한다(29장 참조). **정보를 얼마나 줄 것인가**가 세 번째다. 존재하지 않는 리소스와 권한 없는 리소스를 각각 404와 403으로 구분하면, 공격자는 404/403 차이만으로 리소스의 존재 여부를 열거할 수 있다. 민감한 리소스는 둘 다 404로 응답하는 편이 낫다.

실무에서 자주 흔들리는 경계는 400과 422다. 이 책의 규칙은 단순하다. 본문이 JSON으로 파싱조차 되지 않으면 400, 파싱은 되지만 스키마나 비즈니스 규칙을 어기면 422다. 그리고 409는 "지금 상태와 충돌한다"(중복 생성, 낙관적 잠금 실패), 429는 "속도 초과"에 쓴다.

### 코드

```js
// errors.js — 도메인 오류 계층
export class AppError extends Error {
  constructor({ type, title, status, detail, extras = {} }) {
    super(detail ?? title);
    Object.assign(this, { type, title, status, detail, extras });
    this.expose = status < 500; // 5xx는 detail을 클라이언트에 보이지 않는다
  }
}

export class NotFoundError extends AppError {
  constructor(resource, id) {
    super({
      type: 'https://api.example.com/problems/not-found',
      title: 'Resource Not Found',
      status: 404,
      detail: `${resource} ${id}를 찾을 수 없습니다`,
    });
  }
}
```

```js
// plugins/error-handler.js
import { getRequestId } from '../context.js';

export default async function errorHandler(app) {
  app.setErrorHandler((err, req, reply) => {
    const requestId = getRequestId();

    // 1) 스키마 검증 실패 → 422 + 어떤 필드가 왜 틀렸는지
    if (err.validation) {
      return reply.code(422).type('application/problem+json').send({
        type: 'https://api.example.com/problems/validation',
        title: 'Validation Failed',
        status: 422,
        invalidParams: err.validation.map((v) => ({
          name: v.instancePath.slice(1) || v.params?.missingProperty,
          reason: v.message, // 내부 스키마 경로는 넘기지 않는다
        })),
        requestId,
      });
    }

    // 2) 우리가 의도적으로 던진 도메인 오류
    if (err instanceof AppError) {
      req.log.warn({ err, requestId }, err.title);
      return reply.code(err.status).type('application/problem+json').send({
        type: err.type, title: err.title, status: err.status,
        detail: err.expose ? err.detail : undefined,
        requestId, ...err.extras,
      });
    }

    // 3) 예상하지 못한 오류 — 전부 로그로, 아무것도 밖으로
    req.log.error({ err, requestId }, '처리되지 않은 오류');
    reply.code(500).type('application/problem+json').send({
      type: 'https://api.example.com/problems/internal',
      title: 'Internal Server Error',
      status: 500,
      detail: '요청을 처리하지 못했습니다. 문의 시 requestId를 알려주세요.',
      requestId,
    });
  });

  // 404도 같은 포맷으로 — 규약에 예외를 두지 않는다
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).type('application/problem+json').send({
      type: 'https://api.example.com/problems/not-found',
      title: 'Resource Not Found', status: 404, requestId: getRequestId(),
    });
  });
}
```

### 실무 함정

**로그 레벨을 상태 코드에 연결한다.** 4xx를 `error`로 남기면 클라이언트의 오타 때문에 경보가 울린다. 4xx는 `warn` 이하, 5xx만 `error`로 남기고 경보는 5xx 비율에 건다(31장 참조).

**`err.message`를 그대로 `detail`에 넣지 않는다.** 5xx 경로에서 이 습관 하나로 `connect ECONNREFUSED 10.0.3.12:5432` 같은 내부 토폴로지가 노출된다. 위 코드가 `expose` 플래그를 두는 이유다.

**응답이 이미 시작된 뒤의 오류는 되돌릴 수 없다.** 스트리밍 응답(16.7) 도중 오류가 나면 상태 코드는 이미 200으로 전송되어 있다. 이때 할 수 있는 일은 소켓을 파괴해 클라이언트가 불완전한 응답임을 알게 하는 것뿐이다. `reply.raw.destroy()`가 그 수단이다.

**오류 `type` URI는 계약이므로 함부로 바꾸지 않는다.** 클라이언트가 이 값으로 분기하고 있다면 `type` 변경은 파괴적 변경(breaking change)이다. 사람이 읽는 `title`과 `detail`은 자유롭게 다듬어도 되지만 `type`은 고정한다.

## 16.6 REST API 설계 원칙과 버저닝

### 왜 필요한가

앞의 절들은 "요청 하나를 어떻게 안전하게 처리하는가"를 다뤘다. 이 절은 "엔드포인트 여러 개가 모여 하나의 일관된 인터페이스가 되는가"를 다룬다. 개별 엔드포인트가 아무리 잘 만들어져도, 어떤 목록은 `?page=2`를 쓰고 어떤 목록은 `?offset=20`을 쓰며 어떤 곳은 `_id`를 어떤 곳은 `id`를 반환한다면 클라이언트 개발자는 엔드포인트마다 문서를 다시 읽어야 한다. API의 사용성은 개별 설계의 품질이 아니라 **규칙의 일관성**에서 나온다.

그리고 API는 배포된 순간 계약이 된다. 서버는 재배포할 수 있지만 이미 설치된 모바일 앱은 그럴 수 없다. 버저닝은 이 비대칭을 관리하는 장치다.

### 어떻게 동작하는가

**리소스 명명.** 경로는 명사, 그것도 복수형 명사로 짓는다. `/recipes`, `/recipes/42`, `/recipes/42/ingredients`. 동작은 경로가 아니라 HTTP 메서드로 표현한다. `POST /recipes/42/delete`가 아니라 `DELETE /recipes/42`다. 현실적으로 CRUD에 담기지 않는 동작(예: `POST /recipes/42/publish`)이 생기는데, 이때는 그 동작을 리소스의 상태 전이로 보고 `PATCH /recipes/42 {"status":"published"}`로 표현할 수 있는지 먼저 검토하되, 억지스러우면 동사 하위 경로를 허용한다. 규칙을 위해 이해할 수 없는 API를 만들 필요는 없다. 중첩은 두 단계까지만 허용하는 것이 실무적 타협점이다. `/users/1/recipes/42/ingredients/7`은 `/ingredients/7`로 충분하다.

**페이지네이션.** 오프셋(offset) 방식은 `?limit=20&offset=40`으로 단순하고, 임의의 페이지로 점프할 수 있으며, 전체 개수를 함께 줄 수 있다. 대신 두 가지 결함이 있다. 첫째, 깊은 오프셋이 느리다. `OFFSET 100000`은 데이터베이스가 10만 행을 읽고 버린다는 뜻이다. 둘째, 페이지 사이에 데이터가 삽입되거나 삭제되면 항목이 중복되거나 누락된다. 사용자가 2페이지를 보는 동안 새 레시피가 하나 추가되면, 1페이지 마지막 항목이 2페이지 첫 항목으로 다시 나타난다.

커서(cursor) 방식은 "마지막으로 본 항목 다음부터"를 정렬 키로 표현한다. `WHERE (created_at, id) < (:ts, :id) ORDER BY created_at DESC, id DESC LIMIT 20`은 인덱스를 타므로 몇 번째 페이지든 비용이 같고, 삽입이 일어나도 이미 본 항목이 다시 나오지 않는다. 대가는 임의 페이지 점프의 포기와 전체 개수의 부재다. 무한 스크롤과 데이터 동기화에는 커서를, 관리자 화면의 페이지 번호 UI에는 오프셋을 쓰는 것이 일반적인 배분이다. 커서 값은 불투명(opaque) 문자열이어야 한다 — base64로 인코딩해 클라이언트가 그 구조에 의존하지 못하게 만들면, 나중에 정렬 키를 바꿔도 계약이 깨지지 않는다.

**멱등성(idempotency).** `GET`, `PUT`, `DELETE`는 정의상 멱등이지만 `POST`는 아니다. 결제 생성 요청이 타임아웃됐을 때 클라이언트가 재시도하면 결제가 두 번 일어날 수 있다. 해법은 클라이언트가 `Idempotency-Key` 헤더에 UUID를 붙이고, 서버가 그 키로 첫 응답을 저장해 두는 것이다. 같은 키가 다시 오면 새로 처리하지 않고 저장된 응답을 그대로 돌려준다. 저장소는 TTL이 있는 Redis가 적합하다(29장 참조).

**버저닝.** URL 경로 방식(`/v1/recipes`)은 눈에 보이고, 브라우저에서 테스트하기 쉬우며, 프록시에서 버전별 라우팅이 가능하다. 대신 REST 원칙상 같은 리소스가 두 개의 URI를 갖게 되고, 버전을 올릴 때 모든 경로가 바뀐다. 헤더 방식(`Accept: application/vnd.example.v2+json`)은 URI를 안정적으로 유지하지만 눈에 보이지 않아 디버깅과 캐시 구성이 까다롭다(`Vary` 헤더를 정확히 설정하지 않으면 캐시가 버전을 섞는다).

실무적인 답은 대개 절충이다. **주 버전은 URL 경로에, 부 변경은 버전 없이 하위 호환으로.** `/v1`은 몇 년에 한 번 올리는 큰 사건으로 두고, 그사이의 변경은 "필드 추가는 허용, 필드 제거와 의미 변경은 금지"라는 확장 규칙(tolerant reader)으로 흡수한다. 클라이언트에게는 "모르는 필드는 무시하라"를 계약에 명시한다. 대부분의 파괴적 변경은 이 규칙만으로 피할 수 있다.

### 코드

```js
// routes/recipes.js — 커서 페이지네이션
const encodeCursor = (row) =>
  Buffer.from(`${row.created_at.toISOString()}|${row.id}`).toString('base64url');

app.get('/v1/recipes', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        cursor: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'published'] },
      },
      additionalProperties: false,
    },
  },
}, async (req) => {
  const { limit, cursor, status } = req.query;
  // limit + 1개를 읽어 다음 페이지 존재 여부를 추가 질의 없이 판단한다
  const rows = await db.listRecipes({ limit: limit + 1, cursor: decodeCursor(cursor), status });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    data: page,
    // 커서는 불투명 문자열이다. 클라이언트는 구조를 몰라야 한다
    nextCursor: hasMore ? encodeCursor(page.at(-1)) : null,
  };
});
```

```js
// plugins/idempotency.js — POST 재시도 방어
app.addHook('preHandler', async (req, reply) => {
  if (req.method !== 'POST') return;
  const key = req.headers['idempotency-key'];
  if (!key) return;

  const cached = await redis.get(`idem:${key}`);
  if (cached) {
    const { status, body } = JSON.parse(cached);
    reply.code(status).header('idempotent-replay', 'true').send(body);
    return reply; // 핸들러를 실행하지 않고 종료한다
  }
  // 응답이 확정된 뒤 저장한다
  reply.raw.on('finish', () => {
    redis.set(`idem:${key}`, JSON.stringify({ status: reply.statusCode, body: reply.payload }),
      'EX', 86400);
  });
});
```

### 실무 함정

**커서 정렬 키는 반드시 유일해야 한다.** `created_at`만으로 커서를 만들면 같은 밀리초에 생성된 두 행이 서로를 건너뛰거나 무한 반복시킨다. 위 코드처럼 `(created_at, id)` 복합 키를 쓰고, 데이터베이스 인덱스도 같은 순서로 만든다.

**`limit`에 상한이 없으면 그것이 곧 DoS다.** `?limit=1000000` 한 번으로 데이터베이스와 직렬화가 동시에 무너진다. 스키마의 `maximum`으로 강제한다(16.4).

**멱등성 키의 저장 시점을 착각하면 방어가 되지 않는다.** 첫 요청이 아직 처리 중일 때 두 번째 요청이 오면 캐시에는 아무것도 없다. 엄밀하게 하려면 처리 시작 시점에 키를 "진행 중"으로 선점(`SET NX`)하고, 진행 중인 키에는 409를 반환한다.

**`/v1`을 만들었으면 `/v2`를 만들 계획도 함께 세운다.** 두 버전을 동시에 운영할 준비가 없는 버저닝은 장식이다. 최소한 폐기 정책(지원 기간, `Deprecation`/`Sunset` 헤더 발송)을 문서에 적어 둔다.

## 16.7 파일 업로드, 스트리밍 응답, 압축

### 왜 필요한가

지금까지의 요청과 응답은 모두 메모리에 통째로 올려도 되는 크기였다. 이 전제가 깨지는 세 지점이 파일 업로드, 대용량 목록 응답, 그리고 전송량 자체다.

업로드는 가장 위험하다. `multipart/form-data` 본문을 통째로 버퍼에 담는 구현은 100MB 파일 열 개가 동시에 들어오는 순간 힙을 소진한다. 대용량 응답도 같다. 레시피 50만 건을 배열로 만들어 `JSON.stringify`하면 문자열 하나가 수백 메가바이트가 되고, 그 시점에 이벤트 루프가 멈춘다(3장 참조). 두 문제의 해법은 같다 — 스트림이다(7장 참조).

### 어떻게 동작하는가

**업로드.** `@fastify/multipart`는 multipart 본문을 파싱하면서 각 파트를 Readable 스트림으로 넘겨준다. 이 스트림을 목적지(디스크, S3, 이미지 변환 파이프라인)로 `pipeline()`하면 파일 전체가 메모리에 존재하는 순간이 없다. 제한은 세 겹으로 건다. 프록시 계층(`client_max_body_size`), 프레임워크의 `bodyLimit`과 multipart의 `fileSize`, 그리고 저장소 쿼터다. 프레임워크 제한만 믿으면 프록시가 이미 전체 본문을 받아 버퍼링한 뒤 애플리케이션에 넘기는 구성에서 방어가 늦어진다.

파일 이름과 MIME 타입은 **클라이언트가 보낸 문자열**이다. 신뢰하지 않는다. 저장 이름은 서버가 생성한 UUID로 하고 원본 이름은 메타데이터로만 보관한다. 타입은 헤더가 아니라 파일의 매직 넘버로 판정한다. 저장 경로에 사용자 입력을 이어 붙이면 경로 순회 취약점이 된다.

**스트리밍 응답.** JSON 배열 하나를 통째로 만드는 대신, 줄바꿈으로 구분된 JSON(NDJSON, `application/x-ndjson`)을 쓰면 서버는 행을 읽는 대로 흘려보내고 클라이언트는 도착하는 대로 처리한다. 첫 바이트까지의 시간(TTFB)이 극적으로 줄고 서버 메모리는 상수로 유지된다. Fastify 핸들러가 Readable 스트림을 반환하면 백프레셔가 자동으로 이어진다 — 클라이언트가 느리면 소켓의 쓰기 버퍼가 차고, 그것이 데이터베이스 커서 읽기 속도까지 거슬러 올라가 늦춘다.

**압축.** JSON 응답은 대개 60~80% 압축된다. 문제는 압축을 어디서 하느냐다. 애플리케이션에서 하면 CPU가 Node.js 프로세스에서 소비되고, gzip은 zlib 스레드 풀을 쓰므로 풀 크기(`UV_THREADPOOL_SIZE`)를 넘기는 순간 다른 파일 I/O까지 지연된다. 리버스 프록시에서 하면 CPU가 프록시로 옮겨가고, 프록시는 이 작업에 최적화되어 있으며, 애플리케이션 인스턴스를 늘리지 않고도 확장된다(26장 참조).

원칙은 이렇다. **프록시가 있으면 압축은 프록시에서.** 프록시가 없거나(서버리스, 직접 노출) 응답이 스트림이라 프록시가 버퍼링하는 것이 싫을 때만 애플리케이션에서 한다. 어느 쪽이든 두 곳에서 동시에 하면 안 된다 — 이중 압축은 CPU만 쓰고 크기는 줄지 않는다. 그리고 이미 압축된 콘텐츠(JPEG, PNG, MP4, gzip 아카이브)는 압축 대상에서 제외한다. Brotli는 gzip보다 15~20% 더 작지만 높은 품질 수준에서 인코딩이 눈에 띄게 느리므로, 동적 응답에는 품질 4~5 정도가 실무적인 균형점이다.

### 코드

```js
// routes/upload.js — 메모리에 담지 않는 업로드
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

await app.register(import('@fastify/multipart'), {
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10MB, 파일 1개
});

app.post('/v1/recipes/:id/photo', async (req, reply) => {
  const part = await req.file();
  if (!part) throw new AppError({ status: 422, title: 'File Required', type: '...' });

  // 클라이언트가 보낸 이름은 저장 경로에 절대 쓰지 않는다
  const ext = path.extname(part.filename).toLowerCase().slice(0, 5);
  const storedName = `${randomUUID()}${ALLOWED_EXT.has(ext) ? ext : '.bin'}`;

  await pipeline(part.file, createWriteStream(path.join(UPLOAD_DIR, storedName)));

  // 제한 초과는 스트림을 끊는 방식으로 알려온다. 반드시 확인한다
  if (part.file.truncated) {
    await fs.unlink(path.join(UPLOAD_DIR, storedName));
    throw new AppError({ status: 413, title: 'Payload Too Large', type: '...' });
  }
  return reply.code(201).send({ photo: storedName, originalName: part.filename });
});
```

```js
// routes/export.js — NDJSON 스트리밍 응답
import { Transform } from 'node:stream';

app.get('/v1/recipes/export', async (req, reply) => {
  const cursor = db.streamAllRecipes(); // 객체 모드 Readable

  const toNdjson = new Transform({
    writableObjectMode: true,
    transform(row, _enc, cb) { cb(null, `${JSON.stringify(row)}\n`); },
  });

  reply.header('content-type', 'application/x-ndjson');
  // 스트림을 반환하면 백프레셔가 소켓까지 자동으로 이어진다
  return cursor.pipe(toNdjson);
});
```

```js
// app.js — 프록시가 없을 때만 켜는 압축
if (process.env.COMPRESS_IN_APP === 'true') {
  await app.register(import('@fastify/compress'), {
    global: true,
    threshold: 1024,            // 1KB 미만은 압축해도 이득이 없다
    encodings: ['br', 'gzip'],  // 클라이언트 선호에 따라 협상
  });
}
```

### 실무 함정

**업로드 스트림을 소비하지 않고 응답하면 소켓이 매달린다.** 검증 실패로 조기 반환할 때도 `part.file`을 끝까지 읽거나(`part.file.resume()`) 연결을 끊어야 한다. 읽지 않은 본문이 남으면 클라이언트는 계속 전송을 시도한다.

**`truncated` 플래그를 확인하지 않으면 잘린 파일이 성공으로 저장된다.** multipart 파서는 크기 제한을 넘으면 예외를 던지는 대신 스트림을 조용히 끝내고 이 플래그를 세운다. 위 코드가 저장 후 삭제하는 이유다.

**스트리밍 응답에는 오류 핸들러가 소용없다.** 첫 청크가 나간 뒤에 데이터베이스 오류가 나면 상태 코드를 바꿀 수 없다. NDJSON이라면 마지막 줄에 `{"error":...}`를 넣는 규약을 두거나, 소켓을 파괴해 클라이언트가 불완전 수신을 감지하게 한다(16.5).

**스트림과 압축을 함께 쓰면 첫 바이트가 늦어질 수 있다.** 압축기는 블록을 채워야 출력하므로, 스트리밍의 이점인 낮은 TTFB가 상쇄된다. 실시간성이 중요한 스트림은 압축을 끄거나 주기적 플러시를 설정한다.

**민감 데이터가 섞인 응답의 압축은 BREACH 공격면을 만든다.** 응답 본문에 사용자 입력과 비밀 토큰이 함께 들어가고 압축된다면, 압축 크기의 변화로 토큰을 추정할 수 있다. CSRF 토큰 같은 값은 응답 본문이 아니라 헤더나 쿠키로 옮기는 것이 근본 대책이다.

## 요약

- 라우터는 자료구조다. 정규식 배열 순회는 라우트 수에 선형으로 비례하지만, 트라이 기반 라우터는 경로 세그먼트 깊이에만 비례하고 등록 순서에 무관한 구체성 우선 매칭을 공짜로 얻는다.
- Express와 Fastify의 결정적 차이는 처리량이 아니라 비동기 오류 처리, 스키마의 일급 지원, 플러그인 캡슐화다. Express 4에서 감싸지 않은 async 핸들러의 예외는 유실되고 요청은 매달린다.
- 미들웨어의 순서는 곧 의미다. 인증과 레이트 리미팅은 본문을 읽기 전(`onRequest`)에, 권한 검사는 검증 후(`preHandler`)에 둔다. 요청 범위 컨텍스트는 `AsyncLocalStorage`로 전파하며, 저장소에는 요청의 정체성만 담는다.
- JSON Schema는 검증과 직렬화를 하나의 선언으로 묶는다. 응답 스키마는 성능 최적화인 동시에 출력 화이트리스트이며, 스키마에 없는 필드는 애초에 직렬화되지 않으므로 비밀번호 해시 같은 내부 필드의 유출을 구조적으로 막는다.
- 오류 규약은 `application/problem+json`(RFC 7807)으로 고정하고 상관관계 ID를 함께 반환한다. 4xx는 클라이언트가 고칠 수 있는 것, 5xx는 재시도가 의미 있는 것이며, 5xx의 내부 메시지는 절대 노출하지 않는다.
- 페이지네이션은 임의 점프가 필요하면 오프셋, 깊은 목록과 삽입 중 안정성이 필요하면 커서를 쓴다. 커서는 불투명 문자열로 만들고 정렬 키에 유일성을 보장한다. 주 버전은 URL 경로에 두고, 그사이 변경은 "모르는 필드는 무시" 규칙으로 흡수한다.
- 업로드와 대용량 응답은 스트림으로 처리해 메모리를 상수로 유지한다. 압축은 리버스 프록시가 있으면 프록시에서 하고, 두 곳에서 동시에 하지 않는다.

## 연습문제

1. 16.1의 트라이 라우터에 라우트 200개를 등록하고, 같은 라우트 집합을 정규식 배열 순회 방식으로도 구현하라. 가장 마지막에 등록된 라우트를 100만 번 매칭할 때의 실행 시간을 두 구현에서 비교하고, 라우트 개수를 20 → 200 → 2,000으로 늘리며 그래프의 기울기가 어떻게 달라지는지 설명하라.

2. `password_hash` 컬럼을 포함한 사용자 테이블을 가정하고, 응답 스키마가 있는 엔드포인트와 없는 엔드포인트를 각각 만들어 실제 응답 본문을 비교하라. 이어서 응답 스키마에 `additionalProperties: true`를 추가하면 무엇이 달라지는지 확인하고, 이 설정을 금지하는 린트 규칙이나 테스트를 작성하라.

3. web-api에 `POST /v1/orders`를 만들고 `Idempotency-Key` 헤더를 지원하라. 첫 요청이 처리되는 도중(응답 전)에 같은 키로 두 번째 요청이 도착하는 경쟁 상태를 재현한 뒤, `SET NX` 기반 선점으로 이 경쟁을 제거하라. 선점 실패 시 409와 429 중 어느 쪽이 적절한지 근거와 함께 결정하라.
