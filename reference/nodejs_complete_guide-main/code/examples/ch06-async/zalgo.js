// 6.3절 — "Zalgo 풀어놓기": 캐시 유무로 동기/비동기가 갈리는 API 가 만드는 버그
//
// 실행: node zalgo.js
//
// 콜백을 때로는 동기로, 때로는 비동기로 부르는 함수는 호출자의 코드 실행 순서를
// 예측 불가능하게 만든다. 캐시 미스일 때만 테스트해 놓고 캐시 히트에서 터지는 전형적인 사고다.

// 한글 폭 보정
const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));

// 느린 저장소를 흉내 낸다
const store = new Map([['recipe:1', { id: 1, name: '김치찌개' }]]);
function slowFetch(key, cb) {
  setTimeout(() => cb(null, store.get(key) ?? null), 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// 나쁜 버전: 캐시에 있으면 콜백을 "동기로" 호출한다
// ─────────────────────────────────────────────────────────────────────────────
const badCache = new Map();
function readBad(key, cb) {
  if (badCache.has(key)) {
    return cb(null, badCache.get(key)); // ← 동기 호출. 여기가 문제의 근원이다
  }
  slowFetch(key, (err, value) => {
    if (err) return cb(err);
    badCache.set(key, value);
    cb(null, value); // ← 이쪽은 비동기 호출
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 고친 버전 1: 동기 경로를 process.nextTick 으로 지연시켜 항상 비동기로 만든다
// ─────────────────────────────────────────────────────────────────────────────
const fixedCache = new Map();
function readFixed(key, cb) {
  if (fixedCache.has(key)) {
    // 콜백은 "언제나" 현재 실행 스택이 풀린 뒤에 호출된다
    return process.nextTick(cb, null, fixedCache.get(key));
  }
  slowFetch(key, (err, value) => {
    if (err) return cb(err);
    fixedCache.set(key, value);
    cb(null, value);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 고친 버전 2 (권장): Promise 를 쓴다.
// Promise 는 이미 이행된 값이라도 then 콜백을 마이크로태스크로 미룬다.
// 즉 프로미스 기반 API 는 구조적으로 Zalgo 를 풀어놓을 수 없다.
// ─────────────────────────────────────────────────────────────────────────────
const promiseCache = new Map();
async function readPromise(key) {
  if (promiseCache.has(key)) return promiseCache.get(key); // 동기 return 이어도 안전하다
  const value = await new Promise((resolve, reject) =>
    slowFetch(key, (e, v) => (e ? reject(e) : resolve(v)))
  );
  promiseCache.set(key, value);
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// 실제 버그: 콜백이 동기로 불리면 아직 만들어지지도 않은 변수를 건드린다
// ─────────────────────────────────────────────────────────────────────────────
function useApi(read, key, label, out) {
  let handler = null;

  read(key, (err, value) => {
    // 캐시 히트 시 동기로 불리면 handler 는 아직 null 이다
    if (handler === null) {
      out.push([label, '콜백 호출 시점', '동기 (스택이 안 풀림)', 'handler 가 아직 null → TypeError']);
    } else {
      out.push([label, '콜백 호출 시점', '비동기 (스택이 풀린 뒤)', `handler("${value?.name}") 정상 호출`]);
      handler(value);
    }
  });

  // 콜백 등록 "직후"에 핸들러를 준비한다. 흔한 코드 형태다
  handler = (v) => v;
}

console.log('='.repeat(92));
console.log('  Zalgo 풀어놓기 — 동기/비동기가 갈리는 콜백 API (6.3절)');
console.log('='.repeat(92));

const rows = [];

// 1) 캐시 미스 — 나쁜 버전도 정상으로 보인다 (여기까지만 테스트하면 버그를 못 잡는다)
await new Promise((r) => {
  useApi(readBad, 'recipe:1', 'readBad (캐시 미스)', rows);
  setTimeout(r, 40);
});

// 2) 캐시 히트 — 같은 함수가 이번엔 동기로 콜백을 부른다
useApi(readBad, 'recipe:1', 'readBad (캐시 히트)', rows);

// 3) 고친 버전은 두 경우 모두 비동기다
await new Promise((r) => {
  useApi(readFixed, 'recipe:1', 'readFixed (캐시 미스)', rows);
  setTimeout(r, 40);
});
useApi(readFixed, 'recipe:1', 'readFixed (캐시 히트)', rows);

await new Promise((r) => setTimeout(r, 40));

const COLS = [[30, '함수 / 상황'], [20, '관찰 대상'], [26, '실제 동작'], [40, '결과']];
console.log('─'.repeat(92));
console.log(COLS.map(([w, h]) => pad(h, w)).join(''));
console.log('─'.repeat(92));
for (const r of rows) console.log(r.map((c, i) => pad(c, COLS[i][0])).join(''));
console.log('─'.repeat(92));

// ─────────────────────────────────────────────────────────────────────────────
// 프로미스 버전은 캐시 히트에서도 항상 비동기다
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n프로미스 버전 (readPromise) — 캐시 히트에서도 순서가 보장된다');
console.log('─'.repeat(92));
const trace = [];
promiseCache.set('recipe:1', { id: 1, name: '김치찌개' }); // 캐시를 미리 채운다
readPromise('recipe:1').then((v) => trace.push(`then 콜백 실행 (${v.name})`));
trace.push('readPromise 호출 직후의 동기 코드');
await new Promise((r) => setTimeout(r, 10));
trace.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
console.log('─'.repeat(92));

console.log(`
정리
  · readBad 는 캐시 미스일 때 비동기, 캐시 히트일 때 동기로 콜백을 부른다.
    호출자가 "콜백 등록 후에 준비하는" 코드를 쓰면 캐시 히트에서만 터진다.
    운영 첫날은 멀쩡하다가 캐시가 데워진 뒤 장애가 나는 유형이다.
  · 고치는 방법은 두 가지다.
      1) 동기 경로를 process.nextTick / queueMicrotask 로 감싸 항상 비동기로 만든다.
      2) 애초에 Promise 를 반환한다. 이미 값이 있어도 then 은 마이크로태스크로 미뤄지므로
         구조적으로 이 버그가 생길 수 없다. 위 프로미스 트레이스에서 동기 코드가
         then 콜백보다 먼저 실행되는 것을 확인하라.
  · 원칙: 하나의 API 는 "항상 동기" 또는 "항상 비동기" 중 하나여야 한다. 섞지 않는다.
`);
