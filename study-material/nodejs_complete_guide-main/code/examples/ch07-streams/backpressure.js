// 7.4절 — write() 반환값을 무시했을 때와 존중했을 때의 메모리 사용량 비교
//
// 실행: node backpressure.js
//
// writable.write() 는 boolean 을 돌려준다. false 는 "내부 버퍼가 highWaterMark 를 넘었으니
// 잠시 멈추라"는 신호다. 이 값을 무시하고 계속 쓰면 데이터는 버려지지 않고 전부
// 메모리에 쌓인다. 디스크나 네트워크가 느릴수록 더 많이 쌓인다.

import { Writable } from 'node:stream';
import { once } from 'node:events';

const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + String(s);

const CHUNKS = 4000;              // 쓸 청크 개수
const CHUNK_SIZE = 16 * 1024;     // 청크 하나 16KB → 총 64MB
const HWM = 64 * 1024;            // highWaterMark 64KB
const MB = (n) => (n / 1024 / 1024).toFixed(1);

// 느린 소비자. 실제 디스크·소켓처럼 처리에 시간이 걸린다
function slowSink() {
  let written = 0;
  const w = new Writable({
    highWaterMark: HWM,
    write(chunk, _enc, cb) {
      written += chunk.length;
      // 1ms 뒤에 소비 완료를 알린다 → 생산자가 훨씬 빠르다
      setTimeout(cb, 1);
    },
  });
  Object.defineProperty(w, 'writtenBytes', { get: () => written });
  return w;
}

// 청크마다 "새" 버퍼를 만든다.
// 같은 Buffer 객체를 4000번 쓰면 큐에는 같은 객체의 참조만 쌓여 메모리가 늘지 않는다.
// 실제 파일 읽기나 소켓 수신은 매번 새 버퍼를 만들어 내므로 이쪽이 현실에 맞다
const makeChunk = () => Buffer.allocUnsafe(CHUNK_SIZE).fill(0x61);

// 현재 메모리 상태를 읽는다
function mem() {
  const m = process.memoryUsage();
  return { rss: m.rss, heap: m.heapUsed, external: m.external };
}

// ─────────────────────────────────────────────────────────────────────────────
// (1) 나쁜 버전: write() 의 반환값을 버린다
//     루프가 이벤트 루프를 놓지 않으므로 drain 이 일어날 기회조차 없다.
// ─────────────────────────────────────────────────────────────────────────────
async function ignoreBackpressure() {
  const sink = slowSink();
  const before = mem();
  let peakBuffered = 0;
  let peakRss = before.rss;

  for (let i = 0; i < CHUNKS; i++) {
    sink.write(makeChunk()); // ← 반환값을 확인하지 않는다
    peakBuffered = Math.max(peakBuffered, sink.writableLength);
    if (i % 100 === 0) peakRss = Math.max(peakRss, mem().rss);
  }
  peakRss = Math.max(peakRss, mem().rss);
  const bufferedAtEnd = sink.writableLength;

  sink.end();
  await once(sink, 'finish');

  return {
    label: '무시 (반환값 버림)',
    peakBuffered,
    bufferedAtEnd,
    rssDelta: peakRss - before.rss,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// (2) 좋은 버전: false 가 오면 'drain' 이벤트를 기다린다
// ─────────────────────────────────────────────────────────────────────────────
async function respectBackpressure() {
  const sink = slowSink();
  const before = mem();
  let peakBuffered = 0;
  let peakRss = before.rss;
  let drains = 0;

  for (let i = 0; i < CHUNKS; i++) {
    const ok = sink.write(makeChunk());
    peakBuffered = Math.max(peakBuffered, sink.writableLength);
    if (i % 100 === 0) peakRss = Math.max(peakRss, mem().rss);
    if (!ok) {
      drains++;
      // 버퍼가 비워질 때까지 생산을 멈춘다. 이 await 가 백프레셔의 전부다
      await once(sink, 'drain');
      peakRss = Math.max(peakRss, mem().rss);
    }
  }
  peakRss = Math.max(peakRss, mem().rss);
  const bufferedAtEnd = sink.writableLength;

  sink.end();
  await once(sink, 'finish');

  return {
    label: '존중 (drain 대기)',
    peakBuffered,
    bufferedAtEnd,
    rssDelta: peakRss - before.rss,
    drains,
  };
}

console.log('='.repeat(92));
console.log('  백프레셔: write() 반환값을 무시할 때와 존중할 때 (7.4절)');
console.log(
  `  청크 ${CHUNKS.toLocaleString('ko-KR')}개 × ${CHUNK_SIZE / 1024}KB = ` +
    `${MB(CHUNKS * CHUNK_SIZE)}MB · highWaterMark ${HWM / 1024}KB`
);
console.log('='.repeat(92));
console.log('\n측정 중...');

// 순서에 따른 GC 영향을 줄이기 위해 좋은 쪽을 먼저 돌린다
const good = await respectBackpressure();
if (global.gc) global.gc();
await new Promise((r) => setTimeout(r, 50));
const bad = await ignoreBackpressure();

const C = [[26, '방식'], [22, '최대 버퍼(MB)'], [22, '루프 종료 시 버퍼(MB)'], [18, 'RSS 증가(MB)']];
console.log();
console.log('─'.repeat(92));
console.log(C.map(([w, h], i) => (i === 0 ? pad(h, w) : padL(h, w))).join(''));
console.log('─'.repeat(92));
for (const r of [bad, good]) {
  console.log(
    pad(r.label, 26) +
      padL(MB(r.peakBuffered), 22) +
      padL(MB(r.bufferedAtEnd), 22) +
      padL(MB(r.rssDelta), 18)
  );
}
console.log('─'.repeat(92));
console.log(`  존중 버전은 'drain' 을 ${good.drains}번 기다리며 생산 속도를 소비 속도에 맞췄다.`);

const ratio = good.peakBuffered > 0 ? bad.peakBuffered / good.peakBuffered : Infinity;
console.log(`
읽는 법
  · "최대 버퍼"는 스트림 내부 큐(writableLength)에 쌓인 바이트의 최댓값이다.
    무시 버전은 ${MB(bad.peakBuffered)}MB 까지 쌓였고, 존중 버전은 ${MB(good.peakBuffered)}MB 에 머물렀다.
    약 ${Number.isFinite(ratio) ? ratio.toFixed(0) : '∞'}배 차이다.
  · 무시 버전의 버퍼 최댓값은 highWaterMark(${HWM / 1024}KB)와 아무 관계가 없다.
    highWaterMark 는 "여기까지 차면 false 를 돌려주겠다"는 신호선일 뿐,
    그 이상 쓰는 것을 막는 상한이 아니다. 막는 것은 호출자의 책임이다.
  · 무시 버전은 동기 루프가 이벤트 루프를 놓지 않으므로 'drain' 이 발생할 기회조차 없다.
    소비자는 한 청크도 처리하지 못한 채 생산자가 64MB 를 전부 큐에 밀어 넣는다.
  · RSS 증가폭도 같은 방향으로 움직인다. 무시 버전은 아직 소비되지 않은 청크를
    전부 붙들고 있으므로 GC 가 아무것도 회수하지 못한다.
    (GC 타이밍 때문에 실행마다 흔들리지만, 버퍼 수치는 항상 명확하게 갈린다.)

실무에서 이 버그가 나타나는 모습
  · 파일 업로드/다운로드 프록시에서 클라이언트가 느릴 때 서버 메모리가 치솟는다.
  · DB 커서로 수백만 행을 읽어 응답에 쓰는 API 가 대량 조회에서만 OOM 으로 죽는다.
  · 평소에는 멀쩡하다. 소비자가 느려질 때만 터지므로 부하 테스트에서도 잘 안 잡힌다.

해결
  · 직접 쓰지 말고 pipeline() 을 쓴다. 백프레셔를 알아서 처리해 준다(pipeline-errors.js).
  · 직접 써야 한다면 write() 의 false 를 반드시 확인하고 'drain' 을 기다린다.
  · 비동기 이터레이터(for await)를 소스로 쓰면 언어 차원에서 자연스럽게 백프레셔가 걸린다.

더 해 볼 것
  · node --expose-gc backpressure.js 로 실행하면 GC 잡음이 줄어 RSS 비교가 선명해진다.
`);
