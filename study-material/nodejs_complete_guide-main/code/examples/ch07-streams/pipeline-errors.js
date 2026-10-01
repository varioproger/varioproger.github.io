// 7.7절 — pipe() 의 파일 디스크립터 누수와 pipeline() 의 자동 정리를 대조한다
//
// 실행: node pipeline-errors.js
//
// src.pipe(dest) 는 dest 에서 오류가 나도 src 를 정리하지 않는다.
// 소스가 파일 스트림이면 그 파일 디스크립터가 프로세스 수명 내내 열린 채로 남는다.
// 요청마다 이런 파이프를 만드는 서버는 결국 EMFILE(too many open files)로 죽는다.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable, pipeline } from 'node:stream';
import { promisify } from 'node:util';

const pipelineAsync = promisify(pipeline);

const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + String(s);

const ROUNDS = 20; // 파이프를 몇 개나 만들 것인가

// 실습용 임시 파일을 만든다
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncg-pipeline-'));
const file = path.join(dir, 'data.txt');
fs.writeFileSync(file, 'x'.repeat(512 * 1024)); // 512KB — 한 번에 다 읽히지 않을 만큼

// 리눅스에서는 /proc/self/fd 로 열린 디스크립터를 셀 수 있다.
// (macOS·윈도우에서는 null 이 되고, 아래 destroyed 플래그로 대신 판단한다)
function openFds() {
  try {
    return fs.readdirSync('/proc/self/fd').length;
  } catch {
    return null;
  }
}

// 중간에 반드시 실패하는 목적지 스트림
function failingSink(failAfter = 2) {
  let n = 0;
  return new Writable({
    highWaterMark: 16 * 1024,
    write(chunk, _enc, cb) {
      if (++n > failAfter) return cb(new Error('디스크 쓰기 실패 (모의)'));
      cb();
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// (1) pipe() — 목적지 오류가 소스로 전파되지 않는다
// ─────────────────────────────────────────────────────────────────────────────
async function withPipe() {
  const sources = [];
  for (let i = 0; i < ROUNDS; i++) {
    await new Promise((resolve) => {
      const src = fs.createReadStream(file);
      sources.push(src);
      const dest = failingSink();
      // 오류를 처리한다고 catch 는 붙였다. 하지만 src 는 아무도 닫지 않는다
      dest.on('error', () => resolve());
      src.pipe(dest);
    });
  }
  // 이벤트가 정리될 시간을 준다
  await new Promise((r) => setTimeout(r, 100));
  return {
    label: 'src.pipe(dest)',
    sources,
    aliveSources: sources.filter((s) => !s.destroyed).length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// (2) pipeline() — 어느 쪽에서 오류가 나든 모든 스트림을 destroy 한다
// ─────────────────────────────────────────────────────────────────────────────
async function withPipeline() {
  const sources = [];
  for (let i = 0; i < ROUNDS; i++) {
    const src = fs.createReadStream(file);
    sources.push(src);
    try {
      await pipelineAsync(src, failingSink());
    } catch {
      // pipeline 은 오류를 하나의 프로미스로 모아 주고, 그 전에 정리를 끝낸다
    }
  }
  await new Promise((r) => setTimeout(r, 100));
  return {
    label: 'pipeline(src, dest)',
    sources,
    aliveSources: sources.filter((s) => !s.destroyed).length,
  };
}

console.log('='.repeat(92));
console.log('  pipe() 의 디스크립터 누수 vs pipeline() 의 자동 정리 (7.7절)');
console.log(`  파이프 ${ROUNDS}개를 만들고, 각각의 목적지를 도중에 실패시킨다`);
console.log('='.repeat(92));

const base = openFds();
const a = await withPipe();
const afterPipe = openFds();
const b = await withPipeline();
const afterPipeline = openFds();

const C = [[26, '방식'], [22, '살아남은 소스'], [20, 'FD 증가'], [22, '정리 책임']];
console.log();
console.log('─'.repeat(92));
console.log(C.map(([w, h], i) => (i === 0 ? pad(h, w) : padL(h, w))).join(''));
console.log('─'.repeat(92));
console.log(
  pad(a.label, 26) +
    padL(`${a.aliveSources} / ${ROUNDS}`, 22) +
    padL(base === null ? '측정 불가' : `+${afterPipe - base}`, 20) +
    padL('호출자 (수동)', 22)
);
console.log(
  pad(b.label, 26) +
    padL(`${b.aliveSources} / ${ROUNDS}`, 22) +
    padL(base === null ? '측정 불가' : `+${afterPipeline - afterPipe}`, 20) +
    padL('pipeline (자동)', 22)
);
console.log('─'.repeat(92));

if (base !== null) {
  console.log(
    `  열린 디스크립터: 시작 ${base}개 → pipe 이후 ${afterPipe}개 → pipeline 이후 ${afterPipeline}개`
  );
}

// pipe() 로 새어 나간 것들을 손으로 정리한다. 운영 코드라면 이 코드를 누가 쓸 것인가?
for (const s of a.sources) s.destroy();

console.log(`
읽는 법
  · pipe() 쪽은 목적지가 실패했는데도 소스 스트림 ${a.aliveSources}개가 살아 있다.
    각각 파일 디스크립터를 하나씩 붙들고 있다. dest 에 'error' 핸들러를 달아 둔 것은
    "프로세스가 죽지 않게" 했을 뿐, 소스를 닫아 주지는 않는다.
  · pipeline() 쪽은 살아남은 소스가 ${b.aliveSources}개다. 오류가 나면 체인의 모든 스트림을
    destroy 하고, 그 뒤에 콜백(또는 프로미스 거부)으로 오류를 한 번만 알려 준다.

pipe() 가 남기는 세 가지 문제
  1. 오류 전파 없음 — 목적지 오류가 소스로, 소스 오류가 목적지로 가지 않는다
  2. 정리 없음 — 실패한 체인의 스트림이 destroy 되지 않아 fd·메모리가 샌다
  3. 오류 처리 지점 분산 — 스트림마다 'error' 핸들러를 달아야 하고,
     하나라도 빠뜨리면 uncaughtException 으로 프로세스가 죽는다

권장 형태
    import { pipeline } from 'node:stream/promises';
    await pipeline(src, gzip, dest);          // 오류는 한 번의 try/catch 로
    await pipeline(src, transform, dest, { signal: ac.signal });  // 취소도 가능하다

  · Node 16+ 에서는 stream/promises 의 pipeline 을 쓰는 것이 가장 깔끔하다.
  · pipe() 는 오류가 절대 나지 않는 짧은 스크립트에서만 쓴다. 서버 코드에서는 쓰지 않는다.
  · EMFILE 이 의심되면 운영 중에도 확인할 수 있다:  ls /proc/<pid>/fd | wc -l
`);

// 임시 디렉터리 정리
fs.rmSync(dir, { recursive: true, force: true });
