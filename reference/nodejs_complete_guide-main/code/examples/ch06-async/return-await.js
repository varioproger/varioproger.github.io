// 6.4절 — `return` vs `return await` 의 차이를 스택 트레이스와 try/catch 동작으로 증명한다
//
// 실행: node return-await.js
//
// 흔한 오해: "return await 는 불필요한 await 다. 빼는 게 낫다."
// 실제로는 두 가지가 달라진다.
//   1) try/catch 안에서: return 은 예외를 잡지 못하고, return await 는 잡는다
//   2) 스택 트레이스: return await 는 중간 함수 프레임을 남기고, return 은 지운다

const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));

// 실제로 실패하는 최하위 함수. await 를 한 번 거쳐 진짜 비동기 경계를 만든다
async function fetchRecipe(id) {
  await new Promise((r) => setTimeout(r, 1));
  order.push('fetchRecipe 가 실제로 거부됨');
  throw new Error(`레시피 ${id} 조회 실패`);
}

// ─────────────────────────────────────────────────────────────────────────────
// (1) try/catch 동작 차이
// ─────────────────────────────────────────────────────────────────────────────

// return: 프로미스를 "반환만" 한다. 이 함수는 그 순간 끝나므로 try 블록을 이미 벗어났다.
// 나중에 그 프로미스가 거부돼도 여기의 catch 는 관여하지 못한다.
async function plainReturn(id) {
  try {
    return fetchRecipe(id);
  } catch (err) {
    return `catch 가 잡음: ${err.message}`;
  } finally {
    order.push('plainReturn 의 finally');
  }
}

// return await: 프로미스가 정착할 때까지 이 함수가 try 블록 안에 머문다.
// 거부되면 await 지점에서 예외가 던져지고 catch 가 잡는다.
async function returnAwait(id) {
  try {
    return await fetchRecipe(id);
  } catch (err) {
    return `catch 가 잡음: ${err.message}`;
  } finally {
    order.push('returnAwait 의 finally');
  }
}

let order = [];

console.log('='.repeat(92));
console.log('  return vs return await (6.4절)');
console.log('='.repeat(92));

console.log('\n[1] try/catch 가 예외를 잡는가');
console.log('─'.repeat(92));

const results = [];

order = [];
try {
  const v = await plainReturn(1);
  order.push('호출자가 결과를 받음');
  results.push(['return promise', '내부 catch 가 잡았는가', '아니오', String(v)]);
} catch (err) {
  order.push('호출자가 예외를 받음');
  results.push([
    'return promise',
    '내부 catch 가 잡았는가',
    '아니오 (예외가 밖으로 샜다)',
    err.message,
  ]);
}
const plainOrder = order.slice();

order = [];
try {
  const v = await returnAwait(2);
  order.push('호출자가 결과를 받음');
  results.push(['return await promise', '내부 catch 가 잡았는가', '예', String(v)]);
} catch (err) {
  results.push(['return await promise', '내부 catch 가 잡았는가', '예상 밖', err.message]);
}
const awaitOrder = order.slice();

const C = [[24, '작성 방식'], [26, '관찰 대상'], [30, '결과'], [40, '값 / 메시지']];
console.log(C.map(([w, h]) => pad(h, w)).join(''));
console.log('─'.repeat(92));
for (const r of results) console.log(r.map((c, i) => pad(c, C[i][0])).join(''));
console.log('─'.repeat(92));

// ─────────────────────────────────────────────────────────────────────────────
// (2) finally 의 실행 시점
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[2] finally 는 언제 실행되는가');
console.log('─'.repeat(92));
const trace = (title, list) => {
  console.log(`  ${title}`);
  list.forEach((t, i) => console.log(`    ${i + 1}. ${t}`));
};
trace('return promise — finally 가 프로미스 정착보다 "먼저" 실행된다', plainOrder);
console.log();
trace('return await promise — finally 가 정착 "후에" 실행된다', awaitOrder);
console.log(
  '\n  → 첫 번째 경우 finally 에서 커넥션을 반납하면, 아직 쿼리가 도는 중에 반납하는 셈이다.'
);
console.log('─'.repeat(92));

// ─────────────────────────────────────────────────────────────────────────────
// (3) 스택 트레이스 차이
//     await 는 async 스택 트레이스에 중간 프레임을 남긴다. 없으면 어느 경로로
//     호출됐는지 알 수 없어 디버깅이 어려워진다.
// ─────────────────────────────────────────────────────────────────────────────
async function layerPlain(id) {
  return fetchRecipe(id); // await 없음
}
async function layerAwait(id) {
  return await fetchRecipe(id); // await 있음
}
async function callerPlain(id) {
  return await layerPlain(id);
}
async function callerAwait(id) {
  return await layerAwait(id);
}

// 우리 코드의 프레임만 남긴다(node 내부 프레임은 잡음이다)
function ourFrames(stack) {
  return stack
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.includes('return-await.js'))
    .map((l) => l.replace(/^at\s+/, ''))
    // 긴 파일 URL 은 "함수명 (파일:줄)" 로 줄여 표를 읽기 쉽게 만든다
    .map((l) => {
      const m = l.match(/^(.*?)\s*\(?(?:file:\/\/)?\S*\/(return-await\.js:\d+):\d+\)?$/);
      if (!m) return l;
      return m[1] ? `${m[1]} (${m[2]})` : m[2];
    });
}

console.log('\n[3] 스택 트레이스에 남는 함수 프레임');
console.log('─'.repeat(92));

let plainFrames = [];
let awaitFrames = [];
try {
  await callerPlain(3);
} catch (err) {
  plainFrames = ourFrames(err.stack);
}
try {
  await callerAwait(4);
} catch (err) {
  awaitFrames = ourFrames(err.stack);
}

const rowsMax = Math.max(plainFrames.length, awaitFrames.length);
console.log(pad('return (await 없음)', 46) + 'return await');
console.log('─'.repeat(92));
for (let i = 0; i < rowsMax; i++) {
  console.log(pad(plainFrames[i] ?? '', 46) + (awaitFrames[i] ?? ''));
}
console.log('─'.repeat(92));

const hasLayerPlain = plainFrames.some((f) => f.includes('layerPlain'));
const hasLayerAwait = awaitFrames.some((f) => f.includes('layerAwait'));
console.log(
  `  → 프레임 개수: return ${plainFrames.length}개 vs return await ${awaitFrames.length}개`
);
console.log(
  `  → 중간 계층 함수가 트레이스에 남았는가: layerPlain ${
    hasLayerPlain ? '있음' : '사라짐'
  } / layerAwait ${hasLayerAwait ? '있음' : '사라짐'}`
);
console.log(
  '     await 없이 반환한 layerPlain 은 통째로 사라져, 오류 로그만 보고는'
);
console.log('     어느 경로로 fetchRecipe 가 불렸는지 알 수 없다.');

console.log(`
정리
  · try/catch 나 try/finally 안에서 프로미스를 반환할 때는 반드시 "return await" 를 쓴다.
    그냥 return 하면 함수가 먼저 끝나 버려 catch 도 finally 도 제 역할을 못 한다.
    finally 에서 커넥션을 반납하는 코드라면, 아직 쿼리가 도는 중에 반납하게 된다.
  · try 블록 밖이라면 return 과 return await 의 관찰 가능한 동작 차이는 스택 트레이스뿐이다.
    프레임이 하나 사라지면 운영 중 오류 로그에서 호출 경로를 되짚기 어려워진다.
    성능 차이는 무시할 수준이므로, 일관되게 return await 를 쓰는 편이 실무에서 안전하다.
  · ESLint 의 no-return-await 규칙은 이 함정 때문에 폐기(deprecated)됐고,
    대신 typescript-eslint 의 return-await 규칙이 "try 안에서는 필수"를 강제한다.

더 해 볼 것
  · node --stack-trace-limit=30 return-await.js  로 프레임을 더 많이 남겨 비교한다
`);
