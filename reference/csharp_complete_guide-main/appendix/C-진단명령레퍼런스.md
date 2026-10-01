# 부록 C. 진단 명령 레퍼런스 — SOS, `dotnet-*`, PerfView, WinDbg

> **이 부록의 위치** — 66장(메모리 문제 진단), 73장(진단 API), 74장(디버깅 기법)에서 도구를 **절차 안에서** 소개했다. 절차는 읽으면 이해되지만, 새벽 3시에 프로덕션 덤프를 앞에 놓고 필요한 것은 이해가 아니라 **칠 명령**이다. 이 부록은 그 명령들을 도구별·목적별로 재배열한 순수 레퍼런스다. 새로운 사실은 없다. 각 항목에는 본문의 어느 절에 설명이 있는지를 `(NN.M절)` 형태로 붙였으니, "왜 이 명령인가"가 궁금하면 그리로 돌아가라.
>
> **선수 지식** — 62장(.NET 힙의 구조), 64장(GC 알고리즘 완전 해부), 65장(GC 모드와 튜닝), 66장(메모리 문제 진단), 73장(진단 API), 74장(디버깅 기법)
>
> **이 부록에서 다루지 않는 것** — 도구가 보여주는 숫자를 **해석하는 방법론**(샘플링 대 추적, 얕은 크기 대 유지 크기, 다봉 분포)은 66.2절과 66.3절이 담당한다. 누수 시나리오별 처방은 66.11절, 중년기 위기와 세대별 인식 분석은 66.12·66.13절, 교착 진단 워크스루는 74.5절, 벤치마킹 방법론은 67장에 있다. 상용 도구(dotMemory·dotTrace·ANTS·VS 프로파일러)의 조작법은 66.10절이며 여기서는 무료 도구만 다룬다. .NET Framework 전용 도구인 성능 모니터의 `.NET CLR *` 카운터는 66.8절과 73.7절에 있다.

---

## C.1 도구 선택 결정 트리 — 증상에서 첫 명령까지

### 이 부록을 쓰는 순서

도구를 고르는 일은 취향이 아니다. **증상이 정해지면 첫 3분에 칠 명령은 거의 자동으로 정해진다.** 실수는 대부분 순서에서 나온다 — 가장 강력한 도구(WinDbg)를 가장 먼저 꺼내고, 가장 싼 도구(`dotnet-counters`)를 건너뛰는 것이다.

```text
                      ┌──────────────────────────────┐
                      │  증상 신고를 받았다           │
                      └───────────────┬──────────────┘
                                      ↓
                  ① 3분 — dotnet-counters monitor
                     cpu-usage / working-set / gc-heap-size /
                     alloc-rate / gen-2-gc-count / exception-count /
                     threadpool-queue-length / monitor-lock-contention-count
                                      ↓
        ┌──────────┬──────────┬───────┴───────┬──────────┬───────────┐
        ↓          ↓          ↓               ↓          ↓           ↓
   메모리 증가   CPU 100%   응답 없음      예외 폭주   시작 느림   아무것도
        ↓          ↓          ↓               ↓          ↓        안 이상함
   gc-heap-size  cpu-usage  cpu-usage 낮음  exception  첫 요청까지  ↓
   vs            ~100%      + 큐 적체       -count 큼   만 느림    지표를 잘못
   working-set     ↓          ↓               ↓          ↓        고른 것이다
        ↓       dotnet-trace  dotnet-stack   dotnet-trace  dotnet-trace  66.3절로
   dotnet-gcdump  cpu-sampling  report        exception     시작 구간
   ×2 후 비교    → PerfView    → 덤프         키워드       + R2R 확인
        ↓          ↓             ↓             ↓            ↓
   dotnet-dump   PerfView      syncblk /     printexception  55.7절
   analyze       CPU Stacks    threadpool /  로 타입 확정    72.7절
   → gcroot                    dumpasync
```

### 증상별 첫 3분 표

| 증상 | 첫 명령 (거의 공짜) | 판정 기준 | 그다음 | 확정 도구 | 상세 |
|---|---|---|---|---|---|
| **메모리 증가** | `dotnet-counters monitor --counters System.Runtime[working-set,gc-heap-size,gc-committed,gen-2-gc-count]` | 관리 힙도 같이 오르는가 / gen2 GC가 도는데도 오르는가 | `dotnet-gcdump collect` 2회 | `dotnet-dump analyze` → `dumpheap -stat` → `gcroot` | 66.1절, 66.4절 |
| **CPU 100%** | `dotnet-counters monitor --counters System.Runtime[cpu-usage,time-in-gc,alloc-rate]` | `time-in-gc`가 높은가 (GC가 태우는가) | `dotnet-trace collect --profile cpu-sampling` | PerfView `CPU Stacks` / `GCStats` | 67.6절, 66.7절 |
| **응답 없음 (행)** | `dotnet-counters monitor --counters System.Runtime[cpu-usage,threadpool-queue-length,threadpool-thread-count,monitor-lock-contention-count]` | CPU가 낮은데 큐가 쌓이는가 | `dotnet-stack report -p <pid>` | 덤프 → `syncblk` / `threadpool` / `dumpasync -stacks` | 74.4절, 74.5절 |
| **예외 폭주** | `dotnet-counters monitor --counters System.Runtime[exception-count,cpu-usage]` | 초당 수십~수백 개인가 | `dotnet-trace collect --clrevents exception --clreventlevel 5` | 덤프 → `printexception`, PerfView `Exceptions` 이벤트 | 73.9절, 74.5절 |
| **시작이 느림** | `dotnet-counters monitor --counters System.Runtime[methods-jitted-count,il-bytes-jitted,assembly-count]` | JIT된 메서드 수가 폭발하는가 | `dotnet-trace collect --profile cpu-sampling -- ./MyApp` | PerfView `JITStats` | 55.2절, 55.7절, 72.7절 |

> **💡 첫 3분을 건너뛰면 나머지 세 시간을 낭비한다**
>
> `dotnet-counters monitor` 한 줄이 도구 선택 공간을 절반으로 줄인다. `cpu-usage`가 100% 근처면 CPU 바운드이고 샘플링 프로파일러가 답이다. 낮으면 **대기 바운드**이고 샘플링으로는 아무것도 안 보인다 — 스택 덤프나 타임라인 프로파일러가 필요하다. 67.6절의 3분 체크리스트가 이 판단을 다섯 줄로 정리한 것이다.

> **⚠️ .NET Framework 프로세스에는 `dotnet-*` 도구가 붙지 않는다**
>
> `dotnet-counters`·`dotnet-trace`·`dotnet-dump`·`dotnet-gcdump`·`dotnet-stack`은 전부 **EventPipe** 위에서 동작하고, EventPipe는 .NET(Core) 런타임에만 있다. .NET Framework 프로세스에는 성능 모니터의 `.NET CLR *` 카테고리, PerfView, WinDbg를 쓴다(66.6절). 반대로 `.NET CLR *` 성능 카운터는 .NET(Core) 프로세스에 값을 게시하지 않는다. **"도구가 프로세스를 못 찾는다"의 절반은 이 구분을 놓친 것이다.**

> **⚠️ 도구의 강력함 순서와 사용 순서는 반대다**
>
> WinDbg는 이 부록의 도구 중 가장 강력하고 **가장 마지막에 꺼내는 것**이다. 66.9절의 실제 세션에서 한 일의 90%는 PerfView 힙 스냅샷 비교로 몇 분 만에 끝낼 수 있었다. WinDbg가 정말 필요했던 지점은 `!dumpobj`로 정적 필드임을 확정하고 `!dumparray`로 호출 목록의 실제 길이를 센 두 곳뿐이었다.

### 침습성 순서

| 층 | 도구 | 프로덕션 상시 | 프로세스가 멈추는가 | 재시작 필요 |
|---|---|---|---|---|
| 지표 폴링 | `dotnet-counters`, `dotnet-monitor`의 `/metrics` | **가능** | 아니오 | 아니오 |
| 저오버헤드 이벤트 | `dotnet-trace --profile gc-collect`, PerfView `/GCCollectOnly` | **가능** | 아니오 | 아니오 |
| 고오버헤드 이벤트 | `dotnet-trace --profile gc-verbose`, PerfView `.NET Alloc` | 짧게만 | 아니오 | 아니오 |
| 힙 그래프 스냅샷 | `dotnet-gcdump`, PerfView `Take Heap Snapshot` | 신중히 | **전체 GC 1회 유발** | 아니오 |
| 메모리 덤프 | `dotnet-dump collect`, ProcDump, `createdump` | 신중히 | **수 초~수 분** | 아니오 |
| 라이브 디버깅 | WinDbg attach, lldb attach | 사실상 불가 | **예** | 아니오 |

---

## C.2 `dotnet-*` 전역 도구

### 공통 규칙

일곱 도구가 전부 같은 방식으로 설치되고 같은 관용구를 공유한다(73.9절).

```bash
# .NET SDK가 있는 머신
dotnet tool install --global dotnet-counters
dotnet tool install --global dotnet-trace
dotnet tool install --global dotnet-dump
dotnet tool install --global dotnet-gcdump
dotnet tool install --global dotnet-stack
dotnet tool install --global dotnet-symbol
dotnet tool install --global dotnet-sos

# 최신 버전으로 갱신
dotnet tool update --global dotnet-counters
```

| 관용구 | 내용 |
|---|---|
| 이름 | `dotnet-trace`(하이픈)와 `dotnet trace`(공백)가 **같다.** 모든 진단 CLI에 적용된다 (66.6절) |
| 프로세스 지정 | `-p`/`--process-id`, 또는 `-n`/`--name`으로 프로세스 이름 |
| 프로세스 목록 | 모든 도구가 `ps` 하위 명령을 갖는다. 붙을 수 있는 .NET 프로세스만 나온다 |
| SDK 없는 환경 | 도구 바이너리를 직접 내려받아 컨테이너에 넣는다. `curl`로 스크립트화할 수 있다 |
| 권한 | 관리자·root 권한이 필요 없다. 단 **같은 사용자**여야 하고 컨테이너에서는 `SYS_PTRACE`가 필요한 경우가 있다 (66.2절) |

> **📌 도구 설치가 불가능한 컨테이너를 위한 대안이 셋 있다**
>
> (1) 도구 바이너리를 이미지 빌드 시점에 넣는다. (2) `/tmp`와 PID 네임스페이스를 공유하는 **사이드카 컨테이너**에서 도구를 실행한다. (3) `dotnet-monitor`를 사이드카로 띄워 HTTP로 뽑는다. 세 번째가 쿠버네티스의 표준 답이다(74.7절).

---

### `dotnet-counters` — 1차 판별

```bash
dotnet-counters ps                                   # 붙을 수 있는 프로세스 목록
dotnet-counters list                                 # 잘 알려진 카운터 목록
dotnet-counters monitor -p 8528                      # 실시간, 기본 1초 주기
dotnet-counters monitor -p 8528 --refresh-interval 5 \
    --counters System.Runtime[gc-heap-size,loh-size,gen-2-size,gc-fragmentation]
dotnet-counters collect -p 8528 --duration 00:00:10:00 -o counters.csv
dotnet-counters collect -p 8528 --format json -o counters.json
dotnet-counters monitor --counters System.Runtime,MyCompany.WidgetServer -p 8528
```

| 하위 명령 | 용도 |
|---|---|
| `list` | 카운터 이름과 설명 목록 표시 |
| `ps` | 모니터링 가능한 .NET 프로세스 목록 |
| `monitor` | 콘솔에 값을 주기적으로 갱신해 표시 |
| `collect` | 값을 파일(CSV/JSON)로 시계열 기록 |

| 옵션 | 적용 | 의미 |
|---|---|---|
| `-p`, `--process-id` | `monitor`, `collect` | 대상 PID |
| `-n`, `--name` | `monitor`, `collect` | 대상 프로세스 이름 |
| `--counters` | `monitor`, `collect` | 공급자 이름 또는 `공급자[카운터1,카운터2]` |
| `--refresh-interval` | `monitor`, `collect` | 갱신 주기(초) |
| `--duration` | `collect` | 수집 시간. 형식 `dd:hh:mm:ss` |
| `-o`, `--output` | `collect` | 출력 파일 이름 |
| `--format` | `collect` | `csv`(기본) 또는 `json` |
| `--diagnostic-port` | 공통 | 진단 포트 경로를 직접 지정 (컨테이너·사이드카) |
| `--version`, `-h` | 공통 | 버전 / 도움말 |

**출력 읽는 법.** `monitor`는 카운터를 공급자별로 묶어 표시하고 값을 제자리에서 갱신한다. `p`로 일시 정지, `r`로 재개, `q`로 종료다.

```text
Press p to pause, r to resume, q to quit.
    Status: Running

[System.Runtime]
    % Time in GC (since last GC)                       0
    Allocation Rate (Bytes / sec)                244,864
    GC Heap Size (MB)                                  8
    Working Set (MB)                                  52
```

> **💡 `monitor`는 데모용, `collect`가 실무용이다**
>
> 콘솔에서 숫자가 깜빡이는 것은 발표에 좋지만 분석에는 쓸모가 적다. 필요한 것은 **시간에 따른 값**이고 그건 `collect`가 CSV로 준다. 성능 모니터로 하던 일의 크로스 플랫폼 등가물이다(66.8절).

> **⚠️ 표시 이름과 카운터 이름이 다르다**
>
> `--counters`에 넣는 것은 `gc-heap-size` 같은 **카운터 이름**이고, 화면에 나오는 것은 `GC Heap Size (MB)` 같은 **표시 이름**이다. 자동화 스크립트에서 표시 이름으로 필터링하면 안 된다. `dotnet-counters list`가 둘의 대응을 보여준다.

> **⚠️ `dotnet-counters list`는 "잘 알려진" 카운터만 보여준다**
>
> 이 목록은 도구에 하드코딩되어 있고, 실행 중인 CLR 버전에 따라 실제 제공되는 카운터는 다를 수 있다. 출력 첫 줄이 이를 명시한다 — 특정 프로세스는 추가 카운터를 지원할 수 있다(66.8절).

---

### `dotnet-trace` — 이벤트 수집

```bash
dotnet-trace ps
dotnet-trace list-profiles

# 프로필 기반 (권장)
dotnet-trace collect -p 8528 --profile gc-collect -o gc.nettrace
dotnet-trace collect -p 8528 --profile gc-verbose -o alloc.nettrace
dotnet-trace collect -p 8528 --profile cpu-sampling --duration 00:00:00:30

# 공급자·키워드 직접 지정: <공급자>:<키워드(16진수)>:<상세 수준 0~5>
dotnet-trace collect -p 8528 --providers Microsoft-Windows-DotNETRuntime:40000001:5

# 키워드 이름으로
dotnet-trace collect -p 8528 --clrevents gc+stack --clreventlevel 5

# 시작 시점부터 잡기 (.NET 5+)
dotnet-trace collect --providers Microsoft-Windows-DotNETRuntime:40000001:5 \
    --show-child-io -- ./Simulator

# 형식 변환
dotnet-trace collect -p 8528 --format Speedscope -o trace.speedscope.json
dotnet-trace convert trace.nettrace --format Speedscope
```

| 하위 명령 | 용도 |
|---|---|
| `collect` | 이벤트 기록 시작 |
| `ps` | 대상 프로세스 목록 |
| `list-profiles` | 미리 정의된 프로필과 각각의 공급자·키워드 표시 |
| `convert <파일>` | `.nettrace`를 다른 형식으로 변환 |

| 옵션 | 의미 |
|---|---|
| `-p`, `-n` | 대상 PID / 프로세스 이름 |
| `--profile` | 미리 정의된 프로필 이름 |
| `--providers` | `<공급자>:<키워드>:<수준>[:<인자>]`의 쉼표 구분 목록 |
| `--clrevents` | 런타임 키워드를 `gc+stack`처럼 이름으로 지정 |
| `--clreventlevel` | 위 키워드의 상세 수준(0~5) |
| `--duration` | 수집 시간. 형식 `dd:hh:mm:ss` |
| `-o`, `--output` | 출력 파일 |
| `--format` | `NetTrace`(기본), `Speedscope`, `Chromium` |
| `--buffersize` | 런타임 측 순환 버퍼 크기(MB). 이벤트 유실이 보이면 올린다 |
| `--show-child-io` | `--`로 띄운 자식 프로세스의 표준 입출력을 연결 |
| `--diagnostic-port` | 진단 포트 경로 직접 지정 |
| `-- <명령>` | 애플리케이션을 직접 띄워 **시작 시점부터** 수집 |

| 프로필 | 무엇을 켜는가 | 오버헤드 |
|---|---|---|
| `cpu-sampling` | CPU 사용률과 일반 런타임 정보. **프로필을 지정하지 않으면 기본값** | 눈에 띈다 |
| `gc-verbose` | GC 수집 추적 + 객체 할당 **샘플링** | 크다 |
| `gc-collect` | GC 수집만. **아주 낮은 오버헤드** | 아주 낮음 |
| `database` | ADO.NET과 Entity Framework 데이터베이스 명령 | 낮음 |

**주요 GC 키워드** (`Microsoft-Windows-DotNETRuntime`, 66.6절)

| 값 | 키워드 | 의미 |
|---|---|---|
| `0x00000001` | `GCKeyword` | GC 시작/종료, 세그먼트, 힙 통계 |
| `0x00000002` | `GCHandleKeyword` | GC 핸들 생성·소멸 |
| `0x00000008` | `LoaderKeyword` | 어셈블리·모듈 로드 |
| `0x00000010` | `JitKeyword` | JIT 컴파일 |
| `0x00004000` | `ContentionKeyword` | 락 경합 |
| `0x00008000` | `ExceptionKeyword` | 예외 |
| `0x00080000` | `TypeKeyword` | 타입 정보 |
| `0x00100000` | `GCHeapDumpKeyword` | 힙 덤프용 이벤트 |
| `0x00200000` | `GCSampledObjectAllocationHighKeyword` | 고빈도 할당 샘플링 |
| `0x00400000` | `GCHeapSurvivalAndMovementKeyword` | 생존·이동 추적 |
| `0x00800000` | `GCHeapCollectKeyword` | **구독하면 GC를 강제 유발한다** |
| `0x01000000` | `GCHeapAndTypeNamesKeyword` | 힙 덤프의 타입 이름 |
| `0x02000000` | `GCSampledObjectAllocationLowKeyword` | 저빈도 할당 샘플링 |
| `0x40000000` | `StackKeyword` | 이벤트에 호출 스택 첨부 |

> **💡 코드를 고치지 않고 밖에서 GC를 강제하는 법**
>
> ```bash
> dotnet-trace collect -p 8528 --providers Microsoft-Windows-DotNETRuntime:800000
> ```
>
> `GCHeapCollectKeyword`(`0x800000`)를 구독하면 **새 리스너가 붙을 때마다 런타임이 GC를 수행한다.** `GC.Collect()`를 코드에 심지 않고도 압축 gen2 GC를 유발해 66.1절 흐름도의 ②단계를 통과시킬 수 있다.

> **⚠️ 기본 프로필에는 `GCAllocationTick`이 없다**
>
> 프로필도 공급자도 지정하지 않으면 `cpu-sampling`이 적용되고 스택 워크 공급자가 함께 켜진다. 성능 영향이 눈에 띄는데도 **GC 이벤트는 기록되지 않는다.** 메모리를 보러 왔다면 반드시 `--profile gc-collect`나 `gc-verbose`를 명시하라(66.6절).

> **⚠️ `--providers`만 주면 런타임 이벤트가 전부 꺼진다**
>
> 사용자 정의 `EventSource`만 지정하면 그 공급자만 수집된다. "내 이벤트는 보이는데 GC 정보가 없다"의 원인이다. `--profile`을 함께 주거나 공급자 목록에 `Microsoft-Windows-DotNETRuntime`을 추가하라(73.9절).

> **⚠️ `--duration`과 `--`를 같이 쓰면 애플리케이션이 죽는다**
>
> `--`로 띄운 프로세스는 `dotnet-trace`가 기록을 끝낼 때 **함께 종료된다.** 시작 구간만 잡고 애플리케이션은 계속 돌려야 한다면 `--duration` 대신 Ctrl+C로 중지하라(66.6절).

---

### `dotnet-dump` — 덤프 수집과 분석

```bash
dotnet-dump collect -p 8528
dotnet-dump collect -p 8528 --type Heap -o /dumps/leak1.dmp
dotnet-dump analyze /dumps/leak1.dmp
dotnet-dump analyze /dumps/leak1.dmp -c "dumpheap -stat" -c "exit"
```

| 하위 명령 | 용도 |
|---|---|
| `collect` | 덤프 생성 |
| `analyze` | 덤프 분석용 대화형 세션 시작 |
| `ps` | 대상 프로세스 목록 |

| 옵션 | 적용 | 의미 |
|---|---|---|
| `-p`, `-n` | `collect` | 대상 PID / 이름 |
| `--type` | `collect` | `Full` / `Heap` / `Mini` / `Triage` |
| `-o`, `--output` | `collect` | 덤프 파일 경로 |
| `--diag` | `collect` | 수집기 자체의 진단 로그 출력 |
| `-c`, `--command` | `analyze` | 세션 시작 시 실행할 명령. 여러 번 지정 가능 → **스크립트화** |

| `--type` | 크기 | 담는 것 | 할 수 있는 것 |
|---|---|---|---|
| `Mini` | 수 MB | 스레드 스택, 모듈 목록, 예외 정보 | 스택 읽기, 예외 확인. 교착 판정 |
| `Triage` | 수 MB | Mini + 개인 정보 제거 시도 | 외부 공유용 1차 분석 |
| `Heap` | 관리 힙 크기 정도 | 관리 힙 + 스택 + 모듈 | **관리 코드 분석의 95%. 실무의 기본 선택** |
| `Full` | 주소 공간 전체 | 모든 커밋 메모리 | 네이티브까지 전부 |

**출력 읽는 법.** `analyze` 세션에서는 SOS 명령을 **`!` 없이** 그대로 친다. `help`로 목록, `help <명령>`으로 개별 도움말, `exit`으로 종료다(66.8절).

```text
$ dotnet-dump analyze leak2.dmp
Loading core dump: leak2.dmp ...
Ready to process analysis commands. Type 'help' to list available commands or 'help [command]'.
> dumpheap -stat
> gcroot 00007f2a1c0b3d40
> exit
```

> **⚠️ `dotnet-dump`에는 트리거가 없다**
>
> "메모리가 N MB를 넘으면 덤프"는 `dotnet-dump`로 못 한다. ProcDump를 쓰거나, 컨테이너라면 `dotnet-monitor`의 수집 규칙을 쓰거나, `DOTNET_DbgEnableMiniDump`로 크래시 시 자동 생성을 켠다(66.8절, 74.5절).

> **⚠️ 덤프 수집은 프로세스를 정지시킨다**
>
> 힙이 큰 프로세스에서는 **수 초에서 수십 초**다. 로드 밸런서 헬스 체크가 그 사이에 타임아웃되어 인스턴스가 제거될 수 있다. 프로덕션에서는 트래픽에서 먼저 빼라. 관리 힙 구조만 필요하면 훨씬 가벼운 `dotnet-gcdump`를 쓴다(73.9절).

> **⚠️ 덤프에는 비밀이 평문으로 들어 있다**
>
> 연결 문자열, 액세스 토큰, 복호화된 개인 정보, 요청 본문, 세션 키가 그대로 들어간다. 티켓 첨부나 외부 지원 채널 전송 전에 조직의 데이터 처리 정책을 확인해야 한다. `Triage` 덤프가 존재하는 이유다(74.5절).

---

### `dotnet-gcdump` — 관리 힙 그래프만

```bash
dotnet-gcdump collect -p 8528 -o leak-t1.gcdump
# ... 안정 부하에서 시간 경과, 그 사이 최소 한 번의 압축 gen2 GC ...
dotnet-gcdump collect -p 8528 -o leak-t2.gcdump

dotnet-gcdump report leak-t1.gcdump          # 타입별 누적 크기 순 목록
dotnet-gcdump ps
```

| 하위 명령 / 옵션 | 의미 |
|---|---|
| `collect` | 힙 그래프 스냅샷 수집 |
| `report <파일>` | `.gcdump` 파일에서 타입별 누적 크기 순 목록을 텍스트로 출력 |
| `ps` | 대상 프로세스 목록 |
| `-p`, `-n` | 대상 PID / 이름 |
| `-o`, `--output` | 출력 파일 |
| `-t`, `--timeout` | 수집 대기 시간(초). 힙이 크면 늘린다 |
| `-v`, `--verbose` | 진행 상황 상세 출력 |

**무엇이 들어 있는가.** `.gcdump`는 메모리 덤프가 **아니다.** 담는 것은 살아 있는 **객체 그래프**뿐이다 — 타입별 개수와 크기, 객체 간 참조, 루트. **필드 값은 없고 비관리 영역은 전부 빠진다.** 그래서 파일이 자릿수 단위로 작고, 누수 진단에는 대개 이것으로 충분하다(66.4절).

만들어진 파일은 Windows의 **PerfView나 Visual Studio에서 열어 비교 분석**한다. 수집은 Linux에서, 분석은 Windows에서 하는 것이 표준 워크플로다.

> **⚠️ `.gcdump`는 "가벼운" 것이지 "공짜"가 아니다**
>
> 수집 자체가 **전체 GC를 유발한다.** 살아 있는 객체가 수백만 개면 그 GC 비용에 더해 수백만 개의 이벤트를 만들어 내보내는 비용이 붙는다. 큰 힙에서는 수 초의 정지를 볼 수 있다. 부하가 낮은 시간대에, 로드 밸런서에서 뺀 인스턴스에서 뜨는 것이 안전하다(66.4절).

> **📌 `.gcdump`의 원리는 두 쌍의 이벤트다**
>
> `GCBulkNode`(인스턴스의 주소·타입·엣지 개수)와 `GCBulkEdge`(참조 대상 주소)가 쌍으로 나오고, 여기에 `GCBulkRootEdge`·`GCBulkRootStaticVar`가 더해진다. 이 이벤트를 재조립하면 살아 있는 객체 그래프 전체가 복원된다. PerfView와 Visual Studio가 `.gcdump`를 읽을 수 있는 이유다(66.4절).

---

### `dotnet-stack` — 모든 스레드의 관리 스택

```bash
dotnet-stack ps
dotnet-stack report -p 8528
dotnet-stack report -n MyApp
```

| 하위 명령 / 옵션 | 의미 |
|---|---|
| `report` | 대상 프로세스의 **모든 스레드**의 관리 호출 스택을 텍스트로 출력 |
| `ps` | 대상 프로세스 목록 |
| `-p`, `-n` | 대상 PID / 이름 |

**언제 쓰는가.** 응답이 없는 프로세스에서 **덤프를 뜨기 전에** 상황을 훑는 용도다. 덤프는 수 초~수 분 프로세스를 멈추지만 `dotnet-stack report`는 훨씬 가볍다. 스택 26개를 한 번에 보면 "전부 `Monitor.Enter`에 있다" 또는 "전부 `Task.Result`에 있다" 같은 패턴이 즉시 드러난다.

> **⚠️ `dotnet-stack`은 스택만 준다**
>
> 잠금 소유자(`!syncblk`), 스레드 풀 큐 길이(`!threadpool`), 미완료 비동기 사슬(`!dumpasync`)은 여기서 안 나온다. 패턴이 보이면 그다음은 덤프다(74.5절).

---

### `dotnet-monitor` — 컨테이너의 진단 엔드포인트

`dotnet-dump`·`dotnet-trace`·`dotnet-counters`의 기능을 **HTTP 엔드포인트로 노출하는 별도 프로세스**다. 쿠버네티스에서는 사이드카 컨테이너로 띄우고 진단 소켓 볼륨을 공유한다(74.7절).

| 엔드포인트 | 돌려주는 것 |
|---|---|
| `/processes` | 이 노드에서 관측 가능한 .NET 프로세스 목록 |
| `/dump` | 메모리 덤프 (`type` 파라미터로 Mini/Heap/Triage/Full) |
| `/gcdump` | `.gcdump` 힙 그래프 |
| `/trace` | `.nettrace` 이벤트 추적 |
| `/metrics` | Prometheus 형식 지표 |
| `/livemetrics` | 실시간 카운터 스트림 |
| `/logs` | `ILogger` 로그 스트림 |
| `/stacks` | 관리 호출 스택 |

```yaml
# 파드 스펙 발췌 (74.7절)
volumes:
  - name: diagnostics
    emptyDir: {}
  - name: dumps
    emptyDir: {}
containers:
  - name: app
    env:
      - name: DOTNET_DiagnosticPorts
        value: /diag/dotnet-monitor.sock
      - name: DOTNET_DbgEnableMiniDump
        value: "1"
      - name: DOTNET_DbgMiniDumpName
        value: /dumps/core.%p
    volumeMounts:
      - { name: diagnostics, mountPath: /diag }
      - { name: dumps,       mountPath: /dumps }
  - name: monitor
    image: mcr.microsoft.com/dotnet/monitor:8
    volumeMounts:
      - { name: diagnostics, mountPath: /diag }
```

진짜 가치는 **수집 규칙(collection rule)** 에 있다. "1분 안에 예외가 100개를 넘으면 덤프", "GC 힙이 1 GB를 넘으면 `gcdump`" 같은 규칙을 미리 정의해 두면 사람이 없는 새벽 3시에도 증거가 남는다.

> **⚠️ 진단 엔드포인트를 인증 없이 노출하지 마라**
>
> `dotnet-monitor`의 HTTP API는 프로세스 메모리를 덤프할 수 있다. 즉 **비밀 전체를 내주는 엔드포인트**다. 기본적으로 인증이 요구되며 `--no-auth`는 로컬 개발용이다. 클러스터 안이라고 안전한 것이 아니다(74.7절).

---

### `dotnet-symbol` — 심볼과 모듈 내려받기

오프라인 분석 머신을 준비하거나, 덤프만 받았는데 런타임 바이너리가 없을 때 쓴다(74.6절).

```bash
dotnet tool install -g dotnet-symbol
dotnet-symbol --modules --debugging /dumps/hang.core -o /symbols
```

| 옵션 | 의미 |
|---|---|
| `--symbols` | 심볼 파일(PDB)을 내려받는다 |
| `--modules` | 모듈 바이너리(DLL/SO)를 내려받는다 |
| `--debugging` | 디버깅에 필요한 파일 일습을 내려받는다 |
| `-o`, `--output` | 저장 디렉터리 |
| `--cache-directory` | 로컬 심볼 캐시 경로 |
| `--server-path` | 사용할 심볼 서버 URL |

> **📌 덤프를 보관할 때는 애플리케이션 디렉터리도 함께 보관하라**
>
> 자체 포함(self-contained) 배포나 오프라인 환경에서는 `dotnet-dump analyze`가 필요한 진단 라이브러리를 못 찾는다. 덤프와 함께 애플리케이션 디렉터리 전체를 보존해 두면 `setclrpath`로 런타임 경로를 지정해 분석할 수 있다. **덤프만 달랑 받아서 못 여는 상황은 생각보다 흔하다**(74.5절).

---

## C.3 잘 쓰는 EventCounter 목록

### 읽는 법 — 값이 아니라 변화

| 원칙 | 내용 |
|---|---|
| **절댓값에 정상 범위는 없다** | 판단 근거는 자기 애플리케이션의 기준선, 추세, 이전 버전과의 비교다 (66.1절) |
| **비율은 마지막 GC 기준이다** | `time-in-gc`는 "마지막 GC 이후"의 비율이다. GC가 없으면 값이 갱신되지 않는다 (66.8절) |
| **`*-count`는 구간 값이다** | `gen-0-gc-count` 등은 **갱신 주기 사이의** 횟수이지 누적값이 아니다 |
| **두 값의 간격을 봐라** | `working-set` − `gc-heap-size`, `gc-committed` − `gc-heap-size`가 진짜 정보다 |

### `System.Runtime` — 런타임 코어

| 카운터 | 의미 | 이상 신호 | 상세 |
|---|---|---|---|
| `cpu-usage` | 전체 시스템 CPU 대비 프로세스 CPU 사용률 [0-100] | 100% 근처 = CPU 바운드 / 낮음 = 대기 바운드 | 67.6절 |
| `working-set` | 프로세스 작업 집합 (MB) | `gc-heap-size`는 평평한데 이것만 우상향 → **비관리 누수** | 66.1절 |
| `gc-heap-size` | GC가 보고한 총 힙 크기 (MB) | 압축 gen2 GC가 도는데도 우상향 → **관리 누수 확정** | 66.1절 |
| `gc-committed` | GC가 커밋한 메모리 (MB) | `gc-heap-size`와 간격이 벌어짐 → **단편화** | 66.1절 |
| `gen-0-gc-count` | 갱신 주기 사이의 gen0 GC 횟수 | 초당 수십 회 = 할당 압박 | 63.6절 |
| `gen-1-gc-count` | 갱신 주기 사이의 gen1 GC 횟수 | 높으면 중간 수명 객체가 많다 | 62.4절 |
| `gen-2-gc-count` | 갱신 주기 사이의 gen2 GC 횟수 | 0이면 "아직 GC가 안 온 것"이지 누수가 아니다 | 66.1절 |
| `time-in-gc` | 마지막 GC 이후 GC에 쓴 시간 비율 | **10% 초과 시 조사** (경험칙) | 66.12절 |
| `gen-0-size`, `gen-1-size`, `gen-2-size` | 세대별 힙 크기 | gen2만 단조 증가 → 승격 문제 | 66.12절 |
| `loh-size` | LOH 크기 | 톱니 없이 증가 → 대형 객체 누적·단편화 | 66.11절 |
| `poh-size` | POH(고정 객체 힙) 크기 | 증가 → 고정 압박 | 62.5절 |
| `alloc-rate` | 갱신 주기 사이의 관리 힙 할당 바이트 | 중년기 위기의 **전제 조건**. 높은데 힙은 평평하면 GC가 CPU를 태우는 중 | 66.12절 |
| `gc-fragmentation` | GC 힙 단편화 | 지속적으로 높음 → 압축이 안 되고 있다 | 66.11절 |
| `assembly-count` | 로드된 어셈블리 수 | **단조 증가 → 어셈블리 누적** | 66.11절 |
| `exception-count` | 초당 예외 수 | 초당 수백 개가 조용히 던져지고 삼켜지는 앱은 흔하다 | 67.6절 |
| `threadpool-thread-count` | 스레드 풀 스레드 수 | 계속 증가 → 기아 상태에서 주입 중 | 74.4절 |
| `threadpool-queue-length` | 스레드 풀 작업 큐 길이 | **0이 아닌 값이 유지되면 기아** | 74.4절 |
| `threadpool-completed-items-count` | 완료된 스레드 풀 작업 수 | 큐는 쌓이는데 이 값이 안 오르면 전부 막혀 있다 | 74.4절 |
| `monitor-lock-contention-count` | 갱신 주기 사이의 모니터 락 경합 횟수 | 크면 샘플링이 아니라 **타임라인** 프로파일러가 필요 | 48.9절 |
| `active-timer-count` | 현재 활성 타이머 수 | **단조 증가 → 타이머 누수** | 34.10절 |
| `il-bytes-jitted` | JIT된 IL 총 바이트 | 정상 상태에서도 계속 오르면 동적 코드 생성 중 | 55.2절 |
| `methods-jitted-count` | JIT된 메서드 수 | 시작 구간에 폭발 → R2R 미적용 의심 | 55.7절 |

### ASP.NET Core와 네트워킹

| 공급자 | 대표 카운터 | 무엇을 본다 |
|---|---|---|
| `Microsoft.AspNetCore.Hosting` | `requests-per-second`, `total-requests`, `current-requests`, `failed-requests` | 처리량, 진행 중 요청 수, 실패율 |
| `Microsoft-AspNetCore-Server-Kestrel` | `current-connections`, `total-connections`, `connection-queue-length`, `request-queue-length`, `tls-handshakes-per-second` | 연결 적체, TLS 비용 |
| `System.Net.Http` | `requests-started-rate`, `requests-failed-rate`, `current-requests`, `http11-connections-current-total`, `http20-connections-current-total` | 아웃바운드 HTTP 호출량과 커넥션 풀 |
| `System.Net.Sockets` | `outgoing-connections-established`, `incoming-connections-established`, `bytes-received`, `bytes-sent` | 저수준 연결·전송량 |
| `System.Net.NameResolution` | `dns-lookups-requested`, `current-dns-lookups`, `dns-lookups-duration` | DNS가 지연의 원인인지 |

> **💡 메모리 진단에서 ASP.NET Core 카운터가 필요한 이유**
>
> `current-requests`가 계속 증가하면 요청이 완료되지 않고 쌓이는 것이고, **진행 중인 요청 하나하나가 객체 그래프를 붙든다.** `gc-heap-size` 증가의 원인이 누수가 아니라 "처리가 안 끝나는 것"인 경우가 실제로 있다. `threadpool-queue-length`도 같은 이유로 메모리 진단의 보조 지표다(66.8절).

> **⚠️ `dotnet-counters`의 EventCounter 이름과 .NET 9 Meter 이름은 다르다 ※.NET 9**
>
> .NET 9부터 `System.Diagnostics.Metrics` 기반 런타임 지표가 추가되어 `dotnet.gc.collections`, `dotnet.gc.pause.time`, `dotnet.gc.heap.total_allocated`, `dotnet.process.memory.working_set` 같은 **OpenTelemetry 관례 이름**으로도 같은 정보를 얻을 수 있다. 기존 `gc-heap-size` 계열과 **이름 체계가 완전히 다르므로** 대시보드를 옮길 때 매핑 표를 만들어야 한다. `dotnet-counters`는 두 체계를 모두 지원한다(66.8절, 75.3절).

> **📌 .NET Framework의 등가 카운터**
>
> `.NET CLR Memory` 카테고리의 `# Bytes in all Heaps`(gen1+gen2+LOH, **gen0 제외**), `% Time in GC`, `Allocated Bytes/sec`, `Finalization Survivors`, `# Induced GC`, `# of Pinned Objects`, `Gen 0/1 Promoted Bytes/Sec`가 위 표의 대응물이다. 전체 목록과 함정(IIS 인스턴스 이름 재할당, OS 언어에 따른 이름 번역)은 66.8절과 73.7절에 있다.

---

## C.4 SOS 명령 레퍼런스

### 표기 규칙

- WinDbg에서는 `!` 접두어를 붙이고(`!dumpheap`), `dotnet-dump analyze`와 lldb에서는 **붙이지 않는다**(`dumpheap`). 이름과 옵션은 같다(66.9절, 74.5절).
- `<주소>`는 16진수 주소이며 `0x` 접두어는 있어도 없어도 된다.

### 전체 명령 색인

| 목적 | 명령 | 절 |
|---|---|---|
| 힙 전체 조망 | `!dumpheap`, `!heapstat`, `!eeheap` | C.4.1 |
| 개별 객체 | `!dumpobj`, `!dumparray`, `!objsize`, `!gcwhere`, `!listnearobj` | C.4.2 |
| 수명·루트 | `!gcroot`, `!gchandles`, `!finalizequeue` | C.4.3 |
| 스레드·동기화 | `!threads`, `!clrstack`, `!dso`, `!syncblk`, `!threadpool`, `!dumpasync` | C.4.4 |
| 타입·모듈·도메인 | `!dumpmt`, `!name2ee`, `!dumpdomain`, `!clrmodules`, `!eeversion` | C.4.5 |
| 코드·예외 | `!dumpil`, `!printexception`, `!ip2md`, `!u` | C.4.6 |
| 무결성·사후 분석 | `!verifyheap`, `!analyzeoom`(.NET Framework 전용), `!traverseheap` | C.4.7 |
| 환경 설정 | `!setsymbolserver`, `!setclrpath`, `!sethostruntime`, `!setthread` | C.7 |

---

### C.4.1 힙 전체 조망

#### `!dumpheap` — 조사의 출발점

| 옵션 | 의미 |
|---|---|
| `-stat` | 개별 객체를 나열하지 않고 **타입별 개수·총 크기 통계만** |
| `-type <부분 문자열>` | 타입 이름에 그 문자열이 **포함된** 타입만 |
| `-mt <MT주소>` | 그 `MethodTable`의 인스턴스만. 같은 이름의 타입이 여럿일 때 정확히 지정 |
| `-min <바이트>` / `-max <바이트>` | 크기 필터. `-min 85000`이면 LOH 후보만 |
| `-live` / `-dead` | 도달 가능한 것만 / 도달 불가능한 것만 |
| `-short` | 주소만 출력. 다른 명령의 입력으로 파이프하기 좋다 |
| `-strings` | 문자열을 값별로 묶어 중복을 보여준다 |
| `-thinlock` | 씬 락이 걸린 객체만 |
| `<시작> <끝>` | 주소 범위 안의 객체를 **주소 순서대로**. 단편화 관찰의 핵심 |

**출력 읽는 법 — 객체 목록.**

```text
0:000> !dumpheap 0000013adb3b1000 0000013ae33af528
         Address               MT           Size
0000013ae22b4cd8 00007fff857ebe10       102424
0000013ae22cdcf0 0000013ac914e200        78974 Free
0000013ae22e1170 00007fff857ebe10       102424
```

- `Address` — 객체의 시작 주소. `!dumpobj`·`!gcroot`의 입력이다.
- `MT` — `MethodTable` 주소. 타입의 정체다(54장).
- `Size` — **얕은 크기**. 그 객체 자신의 바이트 수다.
- `Free` — 객체가 아니라 **빈 공간**. 이것과 살아 있는 객체가 교대로 나타나면 교과서적인 단편화다(66.11절 시나리오 4).

**출력 읽는 법 — 통계.**

```text
0:000> !dumpheap -stat
Statistics:
              MT    Count     TotalSize Class Name
00007ffb0a1b2c48   210,433     8,417,320 System.EventHandler
00007ffb0a1c4f60   210,432    43,769,856 MyApp.Pricing.PriceWatcher
00007ffb0a1c5238   210,432   606,044,160 MyApp.Pricing.PriceSnapshot
Total 2,096,881 objects, 1,543,229,112 bytes
```

**개수가 정확히 일치하는 두 타입**은 거의 항상 1:1 관계이고, 그중 하나가 다른 하나를 붙들고 있다. 위 출력에서 `EventHandler`가 같은 개수라는 사실이 이벤트 구독 누수를 가리키는 결정적 힌트였다(66.9절).

> **⚠️ `-stat`의 `TotalSize`는 얕은 크기의 합이다**
>
> 유지 크기도 전체 크기도 아니다. **그 타입 인스턴스들 자신의 크기 합**이다. 그래서 `List<T>` 100개가 32 KB로 나올 수 있다 — 안에 든 원소는 각각의 타입으로 따로 집계되기 때문이다. "어떤 타입이 진짜 메모리를 물고 있는가"는 `!objsize`나 PerfView의 `Inc` 열로 봐야 한다(66.3절, 66.9절).

> **⚠️ 통계는 총 크기 오름차순으로 나온다**
>
> SOS는 통계 블록을 정렬해 출력하므로 **가장 큰 타입이 맨 아래**에 온다. 출력이 수백 줄일 때 위에서부터 읽으면 관심 없는 작은 타입만 보게 된다. 끝에서부터 읽어라.

> **⚠️ `-type`은 부분 문자열 일치다**
>
> `!dumpheap -type Order`는 `MyApp.Order`뿐 아니라 `OrderLine`, `PurchaseOrderRepository`, `System.Collections.Generic.List<Order>`까지 전부 잡는다. 정확히 하나의 타입만 보려면 `!name2ee`로 `MethodTable` 주소를 얻어 `-mt`를 쓴다.

#### `!heapstat` — 세대별 요약과 단편화 정량화

| 옵션 | 의미 |
|---|---|
| (없음) | 세대별·힙별 크기 요약 |
| `-inclUnrooted` | 위에 더해 **빈 공간 비율과 미도달 객체 비율** |

```text
0:000> !heapstat -inclUnrooted
Heap                 Gen0         Gen1         Gen2     LOH
Heap0             1579192        96024           24     1907001192
Free space:                                             Percentage
Heap0                7816        11160            0      434527752   SOH:  1% LOH: 22%
Unrooted objects:                                       Percentage
Heap0             1567816        65560            0      488427824   SOH: 97% LOH: 25%
```

LOH에 빈 공간이 22%, 아직 수집되지 않은 미도달 객체가 25%다. **둘을 합친 약 47%가 낭비되고 있다.** 이것이 단편화의 정량적 근거이며, PerfView GCStats의 `LOH Frag %`와 대조해야 할 숫자다(66.11절).

#### `!eeheap` — 세그먼트/리전과 로더 힙

| 옵션 | 의미 |
|---|---|
| `-gc` | GC 힙의 세그먼트/리전 목록과 각 세대의 시작 주소 |
| `-loader` | **로더 힙** 크기. 어셈블리·제네릭 인스턴스화가 쓰는 비관리 메모리 |

```text
0:000> !eeheap -gc
Number of GC Heaps: 1
generation 0 starts at 0x0000013acb3c8730
generation 1 starts at 0x0000013acb3b1018
generation 2 starts at 0x0000013acb3b1000
         segment             begin         allocated               size
0000013acb3b0000  0000013acb3b1000  0000013acb549fe8   0x198fe8(1675240)
Large object heap starts at 0x0000013adb3b1000
         segment             begin         allocated                  size
0000013adb3b0000  0000013adb3b1000  0000013ae33af528  0x7ffe528(134210856)
Total Size:              Size: 0x71c41750 (1908676432) bytes.
```

- `begin`~`allocated`가 그 세그먼트에서 실제로 쓰인 구간이다. `!dumpheap <begin> <allocated>`의 인자가 된다.
- 할당자는 세그먼트 안에서 선형으로 할당하므로 **주소가 높을수록 새 데이터**다. 가장 오래된 세그먼트를 덤프하면 오래된 단편화의 모양이 보인다(66.9절).

> **⚠️ `!eeheap`을 인자 없이 치면 출력이 수백 줄이 된다**
>
> GC 힙과 로더 힙이 전부 쏟아진다. 목적에 맞게 `-gc` 또는 `-loader`를 반드시 붙여라(66.9절).

> **⚠️ `assembly-count`가 늘지 않아도 로더 힙은 자란다**
>
> **제네릭 인스턴스화**가 대표적이다. 값 타입 인자마다 별도의 네이티브 코드와 메서드 테이블이 만들어지고 이것들은 로더 힙에 산다(54장, 55장). 리플렉션으로 제네릭 타입을 무한히 다양하게 인스턴스화하는 코드는 어셈블리 수를 늘리지 않으면서 로더 힙을 채운다. **`!eeheap -loader`의 총합을 직접 봐야 한다**(66.11절).

---

### C.4.2 개별 객체

#### `!dumpobj` (`!do`) — 객체의 필드와 값

```text
0:000> !dumpobj 00000212a4806e18
Name:        MyApp.Pricing.PriceFeed
MethodTable: 00007ffb0a1c3a90
EEClass:     00007ffb0a1d2c18
Tracked Type: false
Size:        40(0x28) bytes
File:        C:\app\MyApp.dll
Fields:
              MT    Field   Offset                 Type VT     Attr            Value Name
00007ffb0a1b2c48  4000a11        8 ...System.EventHandler  0 instance 00000212a4806e50 PriceChanged
00007ffb09f3d8a8  4000a12       10        System.String  0 instance 00000212a4806f20 _feedName
00007ffb0a1c3a90  4000a13        0 ...ricing.PriceFeed  0   static 00000212a4806e18 Instance
```

| 열 | 의미 |
|---|---|
| `MT` | 그 필드 타입의 `MethodTable` |
| `Field` | 메타데이터 토큰 |
| `Offset` | 객체 시작으로부터의 바이트 오프셋 |
| `Type` | 필드 타입 이름 |
| `VT` | **1이면 값 타입**(값이 객체 안에 인라인), 0이면 참조 타입 |
| `Attr` | `instance` / `static` / `shared static` |
| `Value` | 참조 타입이면 **대상 객체의 주소**, 값 타입이면 값 |
| `Name` | 필드 이름 |

**`Attr`가 `static`인 줄이 곧 답인 경우가 많다.** 66.9절 세션에서 `PriceFeed.Instance`가 정적 필드임을 확정한 것이 이 출력이었다.

#### `!dumparray` (`!da`) — 배열 원소

```text
0:000> !dumparray 00000212a4806e88
Name:        System.Object[]
MethodTable: 00007ffb0a1a8e20
Size:        1683480(0x19b898) bytes
Array:       Rank 1, Number of elements 210432, Type CLASS
[0] 00000212a4c11a30
[1] 00000212a4c11b00
```

멀티캐스트 델리게이트의 `_invocationList`를 여기로 열면 **구독자 수가 그대로 나온다.** 이벤트 누수 확정의 마지막 한 걸음이다(66.9절).

#### `!objsize` — 의존 부분 그래프의 전체 크기

```text
0:000> !objsize 00000212a4c11a30
sizeof(00000212a4c11a30) = 5,096 (0x13e8) bytes (MyApp.Pricing.PriceWatcher)
```

> **⚠️ `!objsize`는 전체 크기이지 유지 크기가 아니다**
>
> 이 객체가 직간접적으로 참조하는 **모든 객체의 얕은 크기 합**이다. 공유되는 객체를 중복해서 세므로, 여러 객체의 `!objsize`를 더하면 힙 전체보다 큰 값이 나오는 것이 정상이다. "이 참조를 끊으면 얼마가 돌아오는가"에 답하는 **유지 크기**는 별개의 개념이고, 무료 도구 중에 제대로 계산해 주는 것은 많지 않다(66.3절, 66.5절).

#### `!gcwhere` — 그 주소가 어느 세대·힙에 있는가

```text
0:000> !gcwhere 00000212a4c11a30
Address            Heap   Segment            Generation Allocated       Committed       Reserved
00000212a4c11a30   0      00000212a4800000   2          ...
```

객체가 gen2에 있다는 것은 **오래 살아남아 승격됐고 거기서 죽지 않고 있다**는 뜻이다. 중년기 위기 조사에서 자주 쓴다(66.12절).

#### `!listnearobj` — 구멍 주변 조사

`!listnearobj <주소>`는 그 주소 앞뒤의 객체를 보여준다. 단편화 조사에서 특정 빈 공간의 이웃이 무엇인지 확인할 때 쓴다(66.9절).

---

### C.4.3 수명과 루트

#### `!gcroot` — 누수 원인 확정의 핵심

| 옵션 | 의미 |
|---|---|
| (없음) | 루트까지의 **최단 참조 경로 하나** |
| `-all` | 발견된 **모든** 루트 경로 |

```text
0:000> !gcroot 00000212a4c11a30
HandleTable:
    00000212a0071358 (pinned handle)
    -> 00000212a4801038 System.Object[]
    -> 00000212a4806e18 MyApp.Pricing.PriceFeed
    -> 00000212a4806e50 System.EventHandler
    -> 00000212a4806e88 System.Object[]
    -> 00000212a4c11a30 MyApp.Pricing.PriceWatcher

Found 1 unique roots (run '!GCRoot -all' to see all roots).
```

**경로의 시작점이 곧 원인의 분류다**(64.3절, 66.5절).

| 출력의 시작 모양 | 루트 종류 | 흔한 원인 |
|---|---|---|
| `HandleTable: ... (pinned handle) -> System.Object[] -> <타입>` | 정적 필드 | **정적 캐시**, 싱글턴, 정적 이벤트 |
| `Thread <id>: <프레임> rbp-XX:` | 스택 루트 | 실행 중인 긴 작업. 대개 진짜 누수가 아니다 |
| `HandleTable: ... (strong handle)` | 강한 GC 핸들 | 상호운용, 네이티브 코드가 잡은 델리게이트 |
| `(pinned handle)` (배열이 뒤따르지 않음) | 고정 핸들 | `GCHandle.Alloc(..., Pinned)`, 장기화된 `fixed` (64.7절) |
| `(finalizer queue)` | 파이널라이제이션 큐 | 파이널라이저 적체 (C.5.5) |
| `(dependent handle)` | 의존 핸들 | `ConditionalWeakTable` (34.9절) |

> **📌 정적 필드가 왜 "고정 핸들 → `System.Object[]`"로 보이는가**
>
> 참조 타입의 정적 필드는 로더 할당자가 관리하는 **관리 객체 배열**에 들어 있고, 그 배열이 고정 핸들로 루트가 된다. 그래서 정적 필드 루트는 항상 이 두 단계를 거쳐 나타난다(64.3절, 66.9절).

> **⚠️ "Found 0 unique roots"는 두 가지 뜻이다**
>
> 첫째, 그 객체가 정말 도달 불가능해서 **다음 GC에 죽을 예정**인 경우. 둘째, 루트가 `!gcroot`가 추적하지 못하는 종류인 경우 — 대표적으로 **오래된 세대에서 젊은 세대로의 참조**다. 후자의 사각지대를 메우는 것이 66.13절의 세대별 인식 분석이다. 단편화 분석에서는 전자가 오히려 유용한 정보다(66.5절, 66.11절).

> **⚠️ 최단 경로가 항상 범인은 아니다**
>
> 최단 경로가 캐시 같은 **보조적 참조**로 만들어졌을 수 있다. `!gcroot -all`로 모든 경로를 보고, 그중 **업무 의미가 있는 경로**를 골라야 한다(66.5절).

> **⚠️ 스택 루트로 잡힌 객체를 누수로 신고하지 마라**
>
> 디버거를 붙였을 때 마침 실행 중이던 메서드의 지역 변수가 루트로 나오는 것은 지극히 정상이다. 게다가 JIT은 릴리스 빌드에서 실제 생존 범위를 어휘 범위보다 짧게 잡을 수도, 레지스터에 남겨 더 길게 잡을 수도 있다(64.4절). 스택 루트 경로가 나오면 먼저 `!clrstack`으로 그 스레드가 무엇을 하는지 보라(66.5절).

#### `!gchandles` — 핸들 종류별 통계

| 옵션 | 의미 |
|---|---|
| `-stat` | 핸들이 가리키는 객체의 타입별 통계 |
| `-type <종류>` | 특정 핸들 종류만 (`Pinned`, `Strong`, `WeakShort`, `WeakLong`, `Dependent` 등) |

출력 앞부분에 **핸들 종류별 개수 요약**이 나온다. 여기서 `Pinned Handles`가 계속 증가하면 고정 압박(64.7절), `Strong Handles`가 증가하면 상호운용이나 델리게이트를 의심한다. 뒷부분의 통계 블록은 `!dumpheap -stat`과 같은 형식이다.

#### `!finalizequeue` — 파이널라이저 적체

| 옵션 | 의미 |
|---|---|
| (없음) | 세대별 파이널라이즈 대상 객체 수와 통계 |
| `-detail` | 큐의 상세 |
| `-allReady` | 파이널라이즈 준비가 끝난 객체를 전부 나열 |
| `-short` | 주소만 |

```text
0:000> !finalizequeue
SyncBlocks to be cleaned up: 0
Free-Threaded Interfaces to be released: 0
MTA Interfaces to be released: 0
STA Interfaces to be released: 0
----------------------------------
generation 0 has 12 finalizable objects
generation 1 has 3 finalizable objects
generation 2 has 418,206 finalizable objects
Ready for finalization 402,988 objects

Statistics for all finalizable objects (including all objects ready for finalization):
              MT    Count     TotalSize Class Name
00007ffb0a1d4128  402,988   119,684,928 MyApp.Io.TempFileHandle
```

> **💡 두 숫자만 보면 된다**
>
> `generation 2 has N finalizable objects`는 파이널라이저를 단 채 gen2까지 올라간 객체 수, `Ready for finalization N objects`는 **이미 도달 불가능한데 파이널라이저를 기다리는 객체 수**다. 후자가 크고 줄지 않으면 파이널라이저 스레드가 막힌 것이다. 정상적인 프로세스에서 이 값은 대개 한 자릿수에서 수백 사이를 오간다(66.11절).

---

### C.4.4 스레드와 동기화

#### `!threads` (`dotnet-dump analyze`에서는 `clrthreads`)

| 옵션 | 의미 |
|---|---|
| (없음) | 관리 스레드 목록 |
| `-live` | 살아 있는 스레드만 |
| `-special` | 런타임 전용 스레드(파이널라이저, GC 등)까지 포함 |

```text
                                                                     Lock
DBG   ID  OSID ThreadOBJ     State GC Mode     GC Alloc Context   Domain  Count Apt Exception
  0    1  1a2c 00007f3c0800  2a020 Preemptive  0000000000000000  00007f3c  1   MTA
  6    2  1a31 00007f3c0900  2b220 Preemptive  0000000000000000  00007f3c  0   MTA (Finalizer)
  9    5  1a3d 00007f3c0a40  1020220 Cooperative 0000000000000000 00007f3c  1   MTA (Threadpool Worker)
```

| 열 | 무엇을 보는가 |
|---|---|
| `DBG` | 디버거 스레드 번호. `~<n>s` / `setthread <n>`의 인자 |
| `OSID` | OS 스레드 ID |
| `GC Mode` | `Cooperative`면 관리 코드 실행 중, `Preemptive`면 관리 코드 밖(네이티브 호출·대기) |
| **`Lock Count`** | **0이 아니면 관리 잠금을 보유 중이다.** 교착 후보 |
| `Exception` | 이 스레드가 처리 중인 관리 예외 |
| 꼬리표 | `(Finalizer)`, `(Threadpool Worker)`, `(GC)` 등 |

#### `!clrstack` — 관리 호출 스택

| 옵션 | 의미 |
|---|---|
| (없음) | 현재 스레드의 관리 스택 |
| `-a` | 매개변수 + 지역 변수까지 (`-p`와 `-l`을 합친 것) |
| `-p` | 매개변수만 |
| `-l` | 지역 변수만 |
| `-f` | 네이티브 프레임까지 섞어서 |
| `-n` | 소스 파일·줄 정보 표시 생략 |
| `-all` | **모든 스레드**의 스택 (`dotnet-dump analyze`) |

WinDbg에서 모든 스레드를 보려면 `~*e !clrstack`이다(74.5절).

```text
0:005> !clrstack
OS Thread Id: 0x41a8 (5)
        Child SP               IP Call Site
000000d3c47fe718 00007ffc0a1b1234 [HelperMethodFrame_1OBJ]
000000d3c47fe860 00007ffb0a2c11a0 System.Threading.Monitor.Wait(System.Object, Int32)
000000d3c47fe8f0 00007ffb0a3d4520 MyApp.Io.TempFileRegistry.Unregister(System.String)
000000d3c47fe960 00007ffb0a3d47c0 MyApp.Io.TempFileHandle.Finalize()
```

`[HelperMethodFrame_*]`, `[DebuggerU2MCatchHandlerFrame]` 같은 대괄호 항목은 관리 메서드가 아니라 **런타임이 삽입한 전이 프레임**이다. 무시하고 그 아래의 관리 프레임을 읽는다.

#### `!dso` (`!dumpstackobjects`) — 스택이 참조하는 객체

현재 스레드의 스택 구간을 훑어 **관리 객체로 보이는 값**을 전부 나열한다. `!clrstack -a`가 지역 변수를 못 보여줄 때(최적화된 코드) 대안이 된다. 다만 스택에 남은 쓰레기 값도 함께 잡히므로 **후보 목록**으로 다뤄야 한다(74.5절).

#### `!syncblk` — 모니터 잠금

| 옵션 | 의미 |
|---|---|
| (없음) | **경합 중인** 동기화 블록만 |
| `-all` | 모든 동기화 블록 |

```text
Index SyncBlock MonitorHeld Recursion Owning Thread Info      SyncBlock Owner
   14 00007f3c1c40           3         1 00007f3c0800 1a2c   0   00007f3c22a0 Payments.LedgerAccount
```

| 열 | 읽는 법 |
|---|---|
| `MonitorHeld` | **소유되고 있으면 1, 대기 중인 스레드 하나당 2가 더해진다.** 3이면 소유자 1 + 대기자 1 |
| `Recursion` | 소유자가 재진입한 횟수 |
| `Owning Thread Info` | 잠금을 쥔 스레드의 OS ID와 디버거 스레드 번호 |
| `SyncBlock Owner` | 잠금 대상 **객체의 주소와 타입** |

> **⚠️ `!syncblk`는 `Monitor`만 본다**
>
> `lock` 문과 `Monitor.Enter`가 쓰는 동기화 블록만 나온다. `SemaphoreSlim`, `ManualResetEventSlim`, `ReaderWriterLockSlim`, `Mutex`, 그리고 모든 비동기 잠금은 **여기 나타나지 않는다.** 아무것도 안 보인다고 "교착이 아니다"라고 결론 내면 안 된다. 그때는 `clrstack -all`에서 대기 함수 이름(`WaitOne`, `Wait`, `WaitAsync`, `GetResult`)을 세고, 해당 동기화 객체를 `dumpheap -type`으로 찾아 `dumpobj`로 내부 카운터를 읽는다(74.5절).

#### `!threadpool` — 스레드 풀 상태

| 옵션 | 의미 |
|---|---|
| (없음) | CPU 사용률, 워커 스레드 수, 큐에 대기 중인 작업 수, 타이머 수 |
| `-ti` | 타이머 정보 상세 |
| `-wi` | 큐에 들어 있는 작업 항목 상세 |

**무엇을 보는가.** 큐 길이가 크고 워커 스레드가 계속 늘어나는데 완료 건수가 안 오르면 **스레드 풀 기아**다(74.4절). `-ti`로 나오는 타이머 수는 `active-timer-count` 카운터와 대조할 값이다.

> **⚠️ `!threadpool`의 출력 형태는 런타임 버전에 따라 다르다**
>
> .NET에서 스레드 풀이 **관리 코드 구현(포터블 스레드 풀)** 으로 바뀌면서 출력 항목이 달라졌고, Windows 전용이던 완료 포트 관련 줄은 플랫폼에 따라 없을 수 있다. 항목 이름을 스크립트로 파싱하지 말고 사람이 읽어라.

#### `!dumpasync` — 미완료 비동기 사슬

| 옵션 | 의미 |
|---|---|
| (없음) | 힙에 있는 비동기 상태 기계 나열 |
| `-stacks` | 논리적 `await` 사슬을 스택 형태로 재구성 |

동기 스택은 비어 있는데 요청이 완료되지 않을 때 쓴다. `await` 중인 상태 기계와 **그것이 잡고 있는 지역 변수**가 함께 보이므로, 비동기 대기 교착뿐 아니라 중년기 위기의 원인 조사에도 쓸모가 있다(74.4절, 66.12절).

---

### C.4.5 타입·모듈·도메인

#### `!dumpmt` — `MethodTable` 확인

| 옵션 | 의미 |
|---|---|
| (없음) | 타입 이름, 모듈, 기본 크기, 요소 크기, 인터페이스 수, 슬롯 수 |
| `-md` | 위에 더해 **메서드 목록**(`MethodDesc` 주소, JIT 상태, 이름) |

`-md`가 주는 `MethodDesc` 주소는 `!dumpil`과 `!u`의 입력이다. `ContainsPointers` 항목은 그 타입이 참조 필드를 갖는지를 알려주며, GC 스캔 비용을 이해하는 데 쓰인다(54장).

#### `!name2ee` — 타입 이름에서 주소로

```text
0:000> !name2ee MyApp.dll MyApp.Pricing.PriceWatcher
```

`MethodTable` 주소와 `EEClass` 주소를 돌려준다. `!dumpheap -mt`의 인자를 얻는 표준 경로다. 모듈 이름은 `*`로 대신할 수도 있다.

#### `!dumpdomain` — 로드된 어셈블리 목록

```text
0:000> !dumpdomain
--------------------------------------
Domain 1:           00000212a0021e30
LowFrequencyHeap:   00000212a0022458
Assembly:           00000212a4d18c40 [MyApp.Plugin.Report.v1]
Assembly:           00000212a4d1a3f0 [MyApp.Plugin.Report.v1]
... (같은 이름이 1,842번 반복)
```

**같은 이름이 반복되면 어셈블리 누적**이다. 수집 가능 ALC의 언로드 실패, 반복되는 `Assembly.LoadFrom`, `XmlSerializer`의 비캐싱 생성자가 대표 원인이다(52.12절, 66.11절 시나리오 6).

#### `!clrmodules` / `!eeversion`

```text
> clrmodules -v
00007f3c3f120000 8.0.11    /app/MyApp.dll
00007f3c40a10000 8.0.1124  /usr/share/dotnet/shared/Microsoft.NETCore.App/8.0.11/System.Private.CoreLib.dll

> eeversion
8.0.1124.51707
Server mode with 8 heaps
concurrent
```

`!eeversion`은 **런타임 버전과 GC 모드**를 한 줄로 알려준다. 덤프를 열고 가장 먼저 치는 명령 중 하나다 — 서버 GC 8힙이라는 정보는 나중에 스레드 목록에서 GC 스레드를 골라낼 때 쓴다(74.5절).

`!clrmodules -v`에서 **같은 이름이 두 줄** 나오면 같은 어셈블리가 서로 다른 경로에서 두 번 로드된 것이고, 이것이 `InvalidCastException: Unable to cast object of type 'X' to type 'X'`의 정체다(52장, 74.6절).

---

### C.4.6 코드와 예외

#### `!dumpil` — 메서드의 IL 보기

`!dumpil <MethodDesc 주소>` 또는 동적 메서드 객체의 주소를 받아 그 메서드의 IL을 출력한다. `MethodDesc` 주소는 `!dumpmt -md`나 `!name2ee`에서 얻는다.

**언제 쓰는가.** 소스가 없는 어셈블리, `Reflection.Emit`으로 생성된 동적 메서드(58장), 식 트리를 컴파일한 델리게이트의 실제 내용을 확인할 때다. IL을 읽는 법은 56장, C# 구문과의 대응은 부록 A에 있다.

#### `!printexception` (`!pe`)

| 옵션 | 의미 |
|---|---|
| (없음) | 현재 스레드의 관리 예외를 표시 |
| `<주소>` | 그 예외 객체를 표시 |
| `-nested` | 내부 예외(`InnerException`) 사슬을 전부 |
| `-lines` | 소스 파일·줄 번호 포함 (심볼이 있어야 한다) |

```text
> pe -nested
There is no current managed exception on this thread
```

이 출력은 **크래시가 아니라 행(hang)** 이라는 뜻이다. 크래시였다면 예외 타입·메시지·스택이 나오고 조사는 훨씬 짧게 끝난다(74.5절). `dotnet-dump analyze`에서는 `printexception`(줄여서 `pe`)으로 부른다(73.9절).

> **📌 힙에 남은 예외를 전부 훑는 법**
>
> 현재 스레드에 예외가 없어도 힙에는 과거의 예외 객체가 남아 있을 수 있다. `!dumpheap -type Exception -stat`으로 타입별 개수를 보고, 관심 있는 타입을 `-mt`로 나열한 뒤 각 주소에 `!pe`를 돌린다. **예외 폭주 진단의 표준 경로**다.

---

### C.4.7 무결성과 사후 분석

#### `!verifyheap` — 힙 무결성 검사

힙 전체를 순회하며 객체 헤더와 참조가 일관적인지 검사한다. 손상이 없으면 그 취지의 메시지를, 있으면 문제 객체의 주소와 증상을 보고한다.

**언제 쓰는가.** 설명되지 않는 `AccessViolationException`, 무작위 크래시, 상호운용 코드가 관리 힙에 쓴 것으로 의심될 때다(60장). **누수 진단에서는 쓸 일이 거의 없다.** 큰 힙에서는 오래 걸린다.

#### `!analyzeoom` — 마지막 OOM의 상황 (**.NET Framework 전용**)

`OutOfMemoryException`이 관리 힙 할당에서 발생했다면, 그 시점에 GC가 무엇을 시도했고 왜 실패했는지를 보고한다 — 요청한 할당 크기, 어느 힙에서, GC 번호, 실패 지점. 관리 힙 할당에서 비롯된 OOM이 없었다면 그렇다는 메시지가 나온다.

> **⚠️ 이 명령은 .NET(Core)에서 동작하지 않는다**
>
> 집필 시점 기준으로 `!analyzeoom`은 **.NET Framework 전용**이다. .NET(Core 계열) 덤프에서는 — 따라서 `dotnet-dump analyze`에서도 — 쓸 수 없다. 대신 `!analyze -v`(WinDbg)의 결과와 일반적인 힙 분석(`!dumpheap -stat`, `!eeheap -gc`, `!heapstat -inclUnrooted`)으로 같은 질문에 답해야 한다(63.8절, 66.9절).

> **📌 OOM의 원인은 대부분 "메모리가 없어서"가 아니다**
>
> 63.8절에서 본 대로 관리 OOM의 흔한 원인은 (1) 힙 하드 리밋 도달(컨테이너, 65.5절), (2) LOH 단편화로 연속 공간 확보 실패(66.11절), (3) 32비트 프로세스의 주소 공간 고갈, (4) 단일 객체 크기 한계다. `!analyzeoom`은 이 중 어느 것인지를 좁혀 준다.

**힙 그래프 내보내기.** `!traverseheap -xml <파일>`은 힙 그래프를 파일로 내보낸다. 외부 도구로 자체 분석을 하고 싶을 때의 탈출구다(66.9절).

---

## C.5 SOS 실전 조리법

각 조리법은 **명령 순서**다. 왜 그 순서인지는 옆에 붙인 절 번호로 돌아가라. 모두 `dotnet-dump analyze` 기준으로 적었으므로 WinDbg에서는 각 줄 앞에 `!`를 붙인다.

### C.5.1 "메모리를 무엇이 붙들고 있나" (66.4~66.5절, 66.9절)

```text
1  dumpheap -stat                       # 타입별 통계. 맨 아래(=가장 큰 것)부터 읽는다
2  dumpheap -mt <MT주소>                # 후보 타입의 인스턴스 목록
3  objsize <인스턴스 주소>               # 이 객체 하나가 얼마나 큰 그래프를 무는가
4  gcroot <인스턴스 주소>                # 최단 루트 경로
5  gcroot -all <인스턴스 주소>           # 경로가 보조 참조로 보이면 전부 본다
6  dumpobj <경로 중간의 주소>            # Attr 열이 static인 필드를 찾는다
7  dumparray <컬렉션/호출목록 주소>       # 실제 원소 수를 센다
8  gcwhere <인스턴스 주소>               # 세대 확인. gen2면 승격된 지 오래다
```

**판정 기준.** 2단계에서 **개수가 정확히 일치하는 두 타입**이 보이면 1:1 관계를 의심한다. 4단계 경로가 `HandleTable → (pinned handle) → System.Object[] → <타입>`으로 시작하면 정적 필드가 루트다. 그다음은 66.11절의 시나리오 표로 간다.

> **⚠️ 이 조리법은 마지막 수단이다**
>
> 여기까지 오기 전에 `dotnet-counters`로 관리 누수임을 확정하고(66.1절), `.gcdump` 두 장을 비교해 **증가하는 타입**을 특정해야 한다(66.4절). 위 8단계 중 6~7단계만이 WinDbg가 꼭 필요한 부분이다 — 나머지는 PerfView 힙 스냅샷 비교로 몇 분 만에 끝난다(66.9절).

### C.5.2 "LOH에 뭐가 쌓였나" (66.11절 시나리오 4)

```text
1  heapstat -inclUnrooted               # LOH의 빈 공간 % + 미도달 객체 %
2  dumpheap -min 85000 -stat            # LOH 후보 타입 통계
3  eeheap -gc                           # LOH 세그먼트 목록. 주소가 낮을수록 오래된 것
4  dumpheap <가장 오래된 세그먼트의 begin> <allocated>
                                        # 살아 있는 객체와 Free가 교대로 나오는가
5  gcroot <살아 있는 큰 객체 주소>        # 무엇이 구멍 사이의 객체를 붙드는가
6  dumpheap <가장 새로운 세그먼트의 begin> <allocated>
                                        # 아직 안 죽은 "구멍 제조기"를 찾는다
7  gcroot <그 객체 주소>                 # Found 0 unique roots면 곧 죽을 것 = 구멍의 정체
```

**읽는 법.** 4단계에서 `102424`짜리 살아 있는 객체와 `78974`짜리 `Free`가 교대로 나타나면 교과서적 단편화다. 1단계의 "빈 공간 22% + 미도달 25% ≈ 47%"가 PerfView GCStats의 `LOH Frag %` 48%와 일치하면 정량적 근거가 확보된 것이다.

> **⚠️ 단편화는 시간 축의 증거가 없는 문제다**
>
> 구멍이 있다는 것은 알 수 있어도 **거기에 무엇이 있었는지 확인할 방법이 없다.** "객체 X가 쓰던 구멍이 오랫동안 안 쓰인다" 같은 이벤트는 존재하지 않는다. 위 절차는 전부 **정황 증거**를 모으는 작업이다. 이것이 메모리 문제 중 단편화가 가장 분석하기 어려운 이유다(66.11절).

### C.5.3 "데드락 찾기" (74.5절, 48.8절)

```text
1  eeversion                            # 런타임 버전, GC 모드
2  pe -nested                           # 예외가 있나. 없으면 크래시가 아니라 행이다
3  clrthreads                           # Lock Count 열이 0이 아닌 스레드를 고른다
4  syncblk                              # MonitorHeld >= 3 = 소유자 1 + 대기자 1 이상
5  setthread <DBG 번호>                 # 소유 스레드로 전환
6  clrstack                             # 어디서 Monitor.Enter를 기다리는가
7  clrstack -a                          # this / other 매개변수 주소를 확인
8  dumpobj <매개변수 주소>               # syncblk의 SyncBlock Owner 주소와 교차하는가
```

**30초 판별법.** (1) `syncblk`에 항목이 있고 `MonitorHeld ≥ 3`이면 **모니터 교착**. (2) `threadpool` 큐 길이가 크고 스레드 다수가 `Wait`/`Result`에 있으면 **스레드 풀 기아**. (3) 둘 다 비었는데 미완료 `dumpasync` 사슬이 쌓여 있으면 **비동기 대기 교착 또는 끝나지 않는 외부 I/O**. 이 분기를 먼저 하지 않고 스택을 하나씩 읽으면 스레드 26개에서 길을 잃는다(74.5절).

### C.5.4 "OOM 사후 분석" (63.8절, 65.5절)

```text
1  eeversion                            # 서버/워크스테이션, 힙 개수
2  pe -nested                           # OutOfMemoryException인지 확인
3  analyzeoom                           # (.NET Framework 전용) 마지막 OOM 시점의 요청 크기와 실패 이유
                                        # .NET(Core)에서는 이 줄을 건너뛰고 4단계로 간다
4  heapstat -inclUnrooted               # 단편화 때문인가
5  eeheap -gc                           # 세그먼트/리전 총합. 하드 리밋에 닿았는가
6  eeheap -loader                       # 로더 힙이 범인일 수도 있다
7  dumpheap -stat                       # 무엇이 힙을 채웠는가
8  gcroot <가장 큰 타입의 인스턴스>       # 붙들고 있는 것을 찾는다
```

**분기.** 3단계를 쓸 수 없는 .NET(Core)에서는 4~7단계의 정황 증거로 같은 판단을 내린다. 3단계에서 요청 크기가 크면(85,000바이트 이상) LOH 연속 공간 확보 실패 → C.5.2로. 요청 크기가 작은데도 실패했다면 **힙 하드 리밋 도달**을 의심하고 `GC.GetConfigurationVariables()`로 실제 리밋을 확인한다(65.8절). 5·6단계 합이 프로세스 커밋과 크게 다르면 비관리 쪽이다(66.1절).

### C.5.5 "파이널라이저 큐가 밀렸나" (66.11절 시나리오 5)

```text
1  finalizequeue                        # Ready for finalization 값이 크고 줄지 않는가
2  finalizequeue -detail                # 어떤 타입이 밀려 있나
3  clrthreads                           # (Finalizer) 꼬리표가 붙은 스레드의 DBG 번호
4  setthread <파이널라이저 스레드 번호>
5  clrstack                             # 무엇을 하고 있나 — Monitor.Wait? I/O?
6  syncblk                              # 그 락을 누가 쥐고 있나
7  setthread <락 소유 스레드>
8  clrstack                             # 왜 안 놓는가
```

**확정 조건.** 1단계의 `Ready for finalization`이 수십만이고, 5단계에서 파이널라이저 스레드가 `Monitor.Wait`나 I/O에 걸려 있고, 6단계에서 **작업 스레드가 그 락을 쥐고 있으면** 확정이다.

> **⚠️ 파이널라이저 스레드는 하나뿐이고 직렬로 큐를 소화한다**
>
> 그 스레드가 막히면 파이널라이저가 있는 **모든** 객체가 쌓이고, 각 객체가 물고 있는 그래프 전체가 함께 산다. 그리고 파이널라이저가 있는 객체는 GC를 한 번 더 살아남으므로 gen1에서 죽었을 객체가 gen2로 승격된다 — 파이널라이저 적체는 곧 중년기 위기다(66.12절).

> **💡 조리법을 스크립트로 만들어 두어라**
>
> `dotnet-dump analyze <덤프> -c "..." -c "..." -c "exit"`로 위 순서를 그대로 자동화할 수 있다. WinDbg라면 `.cmdtree <파일>`로 자주 쓰는 명령을 클릭 가능한 창으로 만든다(66.9절). 사고 당시에 명령을 기억해 내는 것보다 준비해 둔 것을 실행하는 편이 언제나 빠르다.

---

## C.6 PerfView

PerfView는 **Windows 전용**이다. 다만 Linux에서 `dotnet-trace`/`dotnet-gcdump`로 만든 `.nettrace`/`.gcdump`를 Windows의 PerfView로 열어 분석하는 것은 표준 워크플로다 — **수집만 Linux에서, 분석은 Windows에서** 한다(66.2절).

### C.6.1 수집 옵션

| GUI 옵션 (`Collect → Collect`의 `Advanced Options`) | 무엇을 켜는가 | 오버헤드 |
|---|---|---|
| `.NET` | .NET 공급자의 기본 이벤트 | 낮음 |
| **`GC Collect Only`** | GC 관련 이벤트만. 다른 공급자는 전부 끈다 | **아주 낮음.** 하루 종일 켜도 ETL이 ~200 MB |
| `GC Only` | 위에 더해 **샘플링된 할당(100 kB마다)의 호출 스택** | 낮음~중간 |
| `.NET Alloc` | **모든 객체 할당마다** 스택 수집. 프로파일러 DLL 주입 | **자릿수 단위로 느려진다** |
| `Additional providers` | 추가 공급자 지정 | 지정에 따름 |

### C.6.2 명령줄 수집 — 프로덕션의 실제 형태

```text
perfview /GCCollectOnly /nogui /accepteula /NoV2Rundown /NoNGENRundown /NoRundown ^
         /merge:true /zip:true collect
```

| 옵션 | 의미 |
|---|---|
| `/GCCollectOnly` | GC 이벤트만. 가장 가벼운 수집 |
| `/nogui` | GUI 없이 콘솔에서 |
| `/accepteula` | EULA 대화상자 생략 |
| `/NoRundown`, `/NoV2Rundown`, `/NoNGENRundown` | 종료 시 런다운 단계 생략 — 세션 종료 시간을 크게 줄인다 |
| `/merge:true` | 파일 병합. **다른 컴퓨터에서 분석할 계획이면 필수** |
| `/zip:true` | 압축. 전송용 |

> **⚠️ 런다운을 끄면 심볼이 덜 해석된다**
>
> 런다운은 **이미 JIT된 메서드의 이름을 이벤트로 흘려보내는 단계**다. 끄면 세션 시작 이전에 JIT된 메서드가 주소로만 남을 수 있다. **GC 통계만 볼 때는 문제없지만, 호출 스택을 봐야 한다면 런다운을 켜라.** GC 전용 수집에서 이 옵션을 붙이는 이유는 GC 통계에 메서드 이름이 필요 없기 때문이다(66.7절).

> **⚠️ `/merge:true` 없이 만든 ETL은 다른 컴퓨터에서 쓸모없다**
>
> 병합 과정에 심볼 해석 준비가 포함되기 때문이다. 같은 컴퓨터에서 분석할 것이라면 생략해도 된다(66.7절).

> **⚠️ PerfView는 모든 프로세스의 이벤트를 기록한다**
>
> ETW는 **프로세스 단위가 아니라 공급자 단위**로 동작한다. 세션에 `Microsoft-Windows-DotNETRuntime`을 붙이면 시스템의 모든 .NET 프로세스가 그 세션에 이벤트를 쓴다. 분석 시 `Process Filter` 텍스트 상자에 프로세스 이름을 넣고 엔터를 쳐야 한다(66.6절, 66.7절).

### C.6.3 주요 뷰

| 그룹 | 뷰 | 보여주는 것 | 언제 |
|---|---|---|---|
| Memory | **GCStats** | 세대별 GC 롤업, `GC Events by Time`, `Condemned reasons for GCs`, 단계별 정지 시간 | **메모리 분석의 시작점** |
| Memory | `Heap Stacks`(`.gcdump`) | 루트에서 객체로 내려가는 **참조 경로** | 누수 원인 추적 |
| Memory | `Gen 2 Object Deaths (Coarse Sampling) Stacks` | gen2·LOH에서 죽는 객체 (`.NET` 옵션 필요) | 단편화 원인, 중년기 위기 |
| Advanced | **JITStats** | JIT된 메서드 수·바이트·시간, R2R 적중 | **시작 시간 조사** |
| CPU | `CPU Stacks` | 샘플링된 CPU 시간의 호출 트리 | CPU 100% |
| — | `Events` | 기록된 모든 이벤트의 원시 목록 | 개별 사건 확인 |

**GCStats에서 봐야 할 열.**

| 표 | 열 | 판단 |
|---|---|---|
| `GC Rollup By Generation` | 세대별 횟수, 평균/최대 정지, 평균 승격량 | 어느 세대가 문제인가 |
| `GC Events by Time` | `Gen`, `Reason`, **압축 여부**, `Pause MSec`, `Promoted MB`, `Gen2 MB`, **`LOH Frag %`** | **66.1절 ②단계의 판정 근거** |
| `Condemned reasons for GCs` | 각 GC가 왜 그 세대를 대상으로 삼았는가 | gen2 GC가 왜 안 도는지 / 왜 자꾸 도는지 |
| `GC Pause Time by Phase` | 단계별 정지 분해 | 정지의 어느 구간이 긴가 |

`Gen` 열이 2이면서 압축이 표시된 행이 반복되는데도 `Gen2 MB`가 우상향이면 **관리 누수 확정**이다. `LOH Frag %`가 40~50%대로 유지되면 공간의 절반을 낭비하고 있는 것이다(66.7절).

### C.6.4 스택 폴딩과 그룹핑

PerfView의 스택 뷰(호출 트리든 참조 경로든)는 같은 텍스트 상자 묶음으로 제어된다. **이 다섯 개를 모르면 PerfView는 읽을 수 없는 도구다.**

| 상자 | 하는 일 | 문법 |
|---|---|---|
| `GroupPats` | 여러 프레임을 하나의 이름으로 **묶는다** | `패턴->이름` (묶기), `패턴=>이름` (엔트리 그룹) |
| `Fold%` | 전체의 N% 미만인 노드를 부모로 **접는다** | 숫자 (예: `1`) |
| `FoldPats` | 이름이 맞는 노드를 부모로 접는다 | 쉼표 구분 패턴 |
| `IncPats` | 이 패턴을 포함하는 스택만 남긴다 | 쉼표 구분 패턴 |
| `ExcPats` | 이 패턴을 포함하는 스택을 제외한다 | 쉼표 구분 패턴 |

- `->` 는 **묶기**다. 매칭된 프레임을 지정한 이름으로 바꾸고, 연속된 같은 이름은 하나로 합쳐진다.
- `=>` 는 **엔트리 그룹**이다. 그룹에 **들어가는 첫 프레임만** 남기고 그 안쪽 호출은 접는다. "라이브러리 내부는 관심 없고 어디서 라이브러리를 불렀는지만 보고 싶다"에 쓴다.
- `%` 는 임의의 문자열, `{}` 로 감싼 부분은 치환 문자열에서 `$1`로 참조된다.

기본 제공 그룹 중 실무에서 쓰는 것은 `[group module entries]`(모듈 경계에서 접기)와 `[just my app]`(내 코드만 남기기)다.

| 상황 | 설정 |
|---|---|
| 프레임워크 내부가 화면을 채운다 | `GroupPats`에 `[group module entries]` |
| 잡음이 너무 많다 | `Fold%`에 `1`~`5` |
| 특정 타입만 보고 싶다 | `IncPats`에 타입 이름 |
| 특정 서브시스템을 빼고 싶다 | `ExcPats`에 네임스페이스 |

**자주 쓰는 조작.**

| 조작 | 방법 |
|---|---|
| 항목을 호출자 트리에서 찾기 | 컨텍스트 메뉴 `Goto → Goto Item in Callers` |
| 이벤트의 호출 스택 열기 | `Events` 뷰의 **`Time MSec` 열에서 우클릭** → `Open Any Stacks` |
| 주소를 이름으로 | 컨텍스트 메뉴 `Lookup Symbols` |
| CSV로 내보내기 | 컨텍스트 메뉴 `Open View in Excel` |
| 정적 변수 전체 목록 | `By Name` 뷰에서 `[static vars]` 선택 → `Memory → View Objects` (`Alt+O`) |
| 두 스냅샷 비교 | 둘 다 연 뒤 `Diff` 메뉴에서 상대 파일 선택 |

> **⚠️ `Open Any Stacks`는 `Time MSec` 열에서 우클릭해야 나온다**
>
> PerfView UI의 유명한 함정이다. 다른 열에서 우클릭하면 그 메뉴가 보이지 않는다(66.7절).

> **⚠️ PerfView에서 "Stacks"는 호출 스택이 아닐 수 있다**
>
> `Heap Stacks`의 "스택"은 `[.NET Roots] → 정적 필드 → List<T> → T[] → T`처럼 **루트에서 객체로 내려가는 참조 경로**다. 이걸 호출 스택으로 읽으면 존재하지 않는 코드 경로를 찾아 헤매게 된다(66.3절).

> **📌 `[.NET Roots]`가 100%의 기준이다**
>
> 힙 스냅샷의 `By Name` 뷰에서 `[.NET Roots]`는 모든 데이터를 참조하므로 포함적 공간의 100%를 차지한다. 거기서 아래로 내려가며 **비중이 갑자기 커지는 노드**를 찾는 것이 무료 도구로 유지 크기에 가장 가깝게 다가가는 절차다(66.5절).

---

## C.7 WinDbg + SOS 설정

### C.7.1 심볼 경로

```text
_NT_SYMBOL_PATH = SRV*C:\symbols*https://msdl.microsoft.com/download/symbols;SRV*C:\symbols*https://symbols.nuget.org/download/symbols
```

형식은 `SRV*<로컬 캐시>*<서버 URL>`이다. 로컬 캐시가 있어야 매번 내려받지 않는다. Visual Studio·PerfView·WinDbg가 이 환경 변수를 모두 읽는다(66.7절, 74.6절).

| 디버거 안에서 | 의미 |
|---|---|
| `.symfix` | Microsoft 공개 심볼 서버로 기본 설정 |
| `.symfix+ <경로>` | 로컬 캐시 경로를 추가하며 설정 |
| `.sympath` | 현재 심볼 경로 표시 |
| `.sympath+ <경로>` | 심볼 경로 추가 |
| `.reload` | 심볼 재로드 |

`dotnet-dump analyze`와 lldb의 SOS에서는 전용 명령을 쓴다(74.6절).

```text
> setsymbolserver -ms                    # Microsoft 심볼 서버 사용
> setsymbolserver -directory /symbols    # 로컬 디렉터리 추가
> setclrpath /app/runtime                # 자체 포함 배포의 런타임 경로 지정
> sethostruntime /usr/share/dotnet       # 분석 호스트가 쓸 런타임 지정
```

### C.7.2 SOS 로드

최신 WinDbg는 올바른 버전의 SOS를 **자동으로 로드한다.** 수동 로드가 필요한 것은 구형 디버거이거나 더 최신 SOS를 쓰고 싶을 때다(66.9절).

```text
.loadby sos clr        :: .NET Framework — clr.dll 옆의 sos.dll
.loadby sos coreclr    :: CoreCLR — coreclr.dll 옆의 sos.dll
```

```bash
dotnet tool install -g dotnet-sos
dotnet sos install          # sos.dll 위치와 칠 명령을 알려준다.
                            # Linux에서는 ~/.lldbinit에 플러그인 로드 줄을 넣는다.
```

```text
0:000> .chain               :: 로드된 확장 체인 확인
0:000> .unload sos
0:000> .load C:\Users\<사용자>\.dotnet\sos\sos.dll
0:000> .chain
```

| 확장 | 출처 | 특징 |
|---|---|---|
| **SOS** | CLR 팀. `dotnet-sos`로 설치 | 표준. .NET Framework와 .NET 모두 |
| SOSEX | Steve Johnson | 더 강력한 관리 코드 디버깅. **.NET Framework만 지원** |
| NetExt | Rodney Viana | LINQ 유사 쿼리로 힙 검색 |
| MEX | Microsoft | 고수준 분석 명령 모음 |

> **⚠️ 확장의 비트 수가 덤프와 맞아야 한다**
>
> 32비트 덤프에는 x86 확장을, 64비트 덤프에는 x64 확장을 로드해야 한다. 어긋나면 `.load`가 `Win32 error 0n193 "%1 is not a valid Win32 application."`으로 실패한다(66.9절).

> **⚠️ SOSEX를 .NET Core 덤프에 쓰지 마라**
>
> .NET Framework만 지원하며 .NET Core 덤프에서는 **무작위로 크래시할 수 있다**(66.2절).

> **📌 명령 이름이 겹치면 확장 이름으로 범위를 지정한다**
>
> 여러 확장이 같은 이름을 내보내면 **체인 맨 위 확장의 명령**이 호출된다. 거의 모든 확장이 `help`를 내보내므로, 특정 확장의 도움말은 `!sos.help`처럼 부른다(66.9절).

### C.7.3 라이브 디버깅 vs 덤프 디버깅

| | 라이브 (attach) | 덤프 |
|---|---|---|
| 붙는 법 | WinDbg `-p <pid>` 또는 `File → Attach to Process` | `File → Open Dump File`, `dotnet-dump analyze <파일>` |
| 프로세스 영향 | **멈춘다.** 프로덕션에서는 사실상 불가 | 없음 (수집 시점에만) |
| 실행 제어 | `g`(계속), `bp`(중단점), 단계 실행 가능 | **불가.** 상태 조회만 |
| 떼는 법 | `.detach` (프로세스 계속) / `qd`(quit and detach) | 그냥 닫는다 |
| 비침습 관찰 | `-pv`로 비침습 연결 (읽기만) | — |
| 언제 | 개발 머신, 재현 가능한 문제 | **프로덕션 사고의 기본** |

> **⚠️ 프로덕션에서 라이브 attach는 프로세스를 멈춘다**
>
> WinDbg가 붙는 순간 대상 프로세스의 모든 스레드가 정지한다. `q`로 종료하면 **대상 프로세스도 함께 죽는다.** 반드시 `.detach`나 `qd`로 나와야 한다. 프로덕션에서는 덤프를 떠서 오프라인 분석하는 것이 정답이다(74.5절).

### C.7.4 크래시 덤프 1차 분석

```text
0:000> !analyze -v
```

WinDbg의 내장 명령으로 크래시 덤프의 예외 코드, 실패 지점, 관련 모듈을 자동으로 요약한다. **네이티브 크래시**에는 유용하지만 관리 예외에는 정보가 얕으므로, `!pe -nested`와 `!clrstack`으로 곧장 넘어가는 편이 빠르다(74.5절).

### C.7.5 크로스 플랫폼 — lldb

```bash
dotnet tool install -g dotnet-sos
dotnet sos install                     # ~/.lldbinit에 플러그인 로드 줄을 넣는다
lldb --core /dumps/core.12345 /usr/share/dotnet/dotnet
```

lldb 안에서는 SOS 명령을 **`!` 없이** 그대로 친다(`clrstack`, `dumpheap -stat`). 스레드 전환은 lldb 자체 명령(`thread select`)이나 SOS의 `setthread`를 쓴다.

| 상황 | 도구 |
|---|---|
| Linux 덤프, Linux 박스에서 분석 | **`dotnet-dump analyze`** (가장 간단) |
| Linux 덤프, 더 저수준이 필요 | `lldb` + SOS |
| Linux 덤프, Windows에서 분석 | **WinDbg가 Linux 코어 덤프를 읽는다** |
| Windows 덤프 | WinDbg 또는 `dotnet-dump analyze` |

> **📌 스레드 전환 방법이 도구마다 다르다**
>
> WinDbg는 `~<n>s`로 전환하고 `~*e <명령>`으로 모든 스레드에서 실행한다. `dotnet-dump analyze`는 `setthread <n>`으로 전환하고, 전체 실행은 명령 자체의 `-all` 옵션에 의존한다. 손에 익은 쪽만 쓰다가 다른 도구를 만나면 여기서 막힌다(74.5절).

---

## C.8 리눅스·컨테이너 환경

### C.8.1 크래시 시 자동 덤프 (※.NET 5+)

재현 불가능한 크래시에 대한 유일한 실용적 답이다. 환경 변수만 설정하면 처리되지 않은 예외로 프로세스가 죽을 때 런타임이 덤프를 남긴다(74.5절).

```bash
export DOTNET_DbgEnableMiniDump=1              # 크래시 시 덤프 생성 활성화
export DOTNET_DbgMiniDumpType=2                # 1=Mini 2=Heap 3=Triage 4=Full
export DOTNET_DbgMiniDumpName=/dumps/core.%p   # %p는 PID로 치환된다
export DOTNET_EnableCrashReport=1              # 추가로 .crashreport.json 생성
export DOTNET_CreateDumpDiagnostics=1          # createdump 자체의 진단 출력
```

### C.8.2 `createdump` — 런타임과 함께 설치되는 수집기

`dotnet-dump collect`는 내부적으로 이 바이너리를 실행한다. 컨테이너에 `dotnet-dump`를 설치할 수 없을 때 직접 부른다(74.5절).

```bash
/usr/share/dotnet/shared/Microsoft.NETCore.App/8.0.11/createdump \
    --full -f /dumps/core.%p 12345

# 쿠버네티스에서 PID 1을 덤프하고 밖으로 꺼내기
kubectl exec -it payments-7d9f-abc -- \
    /usr/share/dotnet/shared/Microsoft.NETCore.App/8.0.11/createdump \
    --withheap -f /dumps/hang-$(date +%s).core 1
kubectl cp payments-7d9f-abc:/dumps/hang-1730000000.core ./hang.core
```

| 옵션 | 대응하는 `DbgMiniDumpType` | 담는 것 |
|---|---|---|
| `--normal` | 1 (Mini) | 스레드 스택, 모듈 목록, 예외 정보 |
| `--withheap` | 2 (Heap) | 위 + 관리 힙. **기본이자 대부분의 경우 정답** |
| `--triage` | 3 (Triage) | Mini + 개인 정보 제거 시도 |
| `--full` | 4 (Full) | 주소 공간 전체 |
| `-f`, `--name <경로>` | — | 출력 경로. `%p`는 PID로 치환 |
| `--diag` | — | 수집기 자체의 진단 출력 |

> **⚠️ `dotnet-dump collect`가 이유 없이 실패하면 `createdump`의 실행 권한을 보라**
>
> 컨테이너 이미지를 빌드하면서 실행 권한이 날아가는 경우가 있다. 그리고 컨테이너에서 덤프를 뜨려면 대개 **`SYS_PTRACE` 능력**이 필요하다. 없으면 권한 오류로 실패한다(66.2절, 66.8절).

### C.8.3 커널 코어 덤프

```bash
ulimit -c unlimited          # 코어 파일 크기 제한 해제 (배포판마다 절차가 다르다)
cat /proc/sys/kernel/core_pattern
```

> **⚠️ 컨테이너의 `core_pattern`은 호스트 전역이다**
>
> 커널이 코어 파일을 어디에 쓸지는 `/proc/sys/kernel/core_pattern`이 정하고, 이 값은 **PID 네임스페이스별이 아니라 커널 전역**이다. 컨테이너 안에서 `sysctl`로 바꿀 수 없고, 바꿀 수 있다면 호스트와 다른 모든 컨테이너에 영향을 준다. 컨테이너에서는 커널 코어 덤프에 의존하지 말고 **`DOTNET_DbgEnableMiniDump` 경로를 써라.** 이 경로는 런타임이 `createdump`를 직접 실행하므로 `core_pattern`도 `ulimit -c`도 관여하지 않는다(74.5절).

### C.8.4 진단 IPC와 접근 경로

| 항목 | 내용 |
|---|---|
| 소켓 경로 | `/tmp/dotnet-diagnostic-<pid>-<시각>-socket` (Linux·macOS) |
| Windows | 명명된 파이프 |
| 사이드카에서 붙기 | **`/tmp`를 공유 볼륨으로 마운트** + **PID 네임스페이스 공유**(`--pid=container:<대상>`) |
| 시작 시점부터 잡기 | `DOTNET_DiagnosticPorts`로 진단 포트를 **역방향(suspend) 모드**로 열고 도구가 붙을 때까지 대기 |
| 덤프 수집 | `SYS_PTRACE` 능력 필요 |
| 진단 자체 끄기 | `DOTNET_EnableDiagnostics=0` — **모든 `dotnet-*` 도구가 붙지 못하게 된다** |

> **⚠️ `DOTNET_EnableDiagnostics=0`을 프로덕션 이미지에 넣지 마라**
>
> 보안 강화를 이유로 이 값을 끄는 조직이 있는데, 그러면 사고가 났을 때 **어떤 도구도 붙을 수 없다.** 진단 소켓을 노출하고 싶지 않다면 그 값을 끄는 대신 소켓 경로를 볼륨 밖으로 두고 `dotnet-monitor`에 인증을 걸어라(74.7절).

### C.8.5 컨테이너 메모리 제한과 GC

| 사실 | 내용 | 상세 |
|---|---|---|
| GC 힙 상한 | GC는 cgroup 제한의 **75%** 를 관리 힙 상한으로 잡는다 | 65.5절, 72.8절 |
| 넘으면 | 관리 힙이 상한에 닿으면 **`OutOfMemoryException`** (스택 트레이스가 남는다) | 63.8절 |
| 프로세스 전체가 넘으면 | 커널이 **SIGKILL**. `Reason: OOMKilled`, `Exit Code: 137`. **로그도 예외도 없다** | 72.8절 |
| 평평한 메모리 | 컨테이너에서 상한 근처에서 평평한 것은 누수가 아니라 **GC가 상한을 지키는 증거**일 수 있다 | 66.2절 |
| cgroup v2 총계 | `/sys/fs/cgroup/memory.current` | 66.1절 |

```bash
# 비관리 쪽을 볼 때 (VMMap의 Linux 대응)
pmap -x <pid>                                        # 영역별 요약
cat /proc/<pid>/smaps                                # 각 매핑의 RSS/PSS/익명 여부
cat /proc/<pid>/status | grep -E 'VmRSS|VmSize|VmData'
```

> **⚠️ 파드가 로그 없이 재시작되면 GC 예외를 찾지 마라**
>
> `Exit Code: 137`은 .NET 예외가 아니라 커널의 OOM 킬러다. 범인은 대개 **GC 힙이 아니라 나머지 25% 쪽**이다 — 네이티브 라이브러리, 대량의 스레드 스택, 같은 컨테이너의 다른 프로세스, 파일 캐시. `dotnet-counters`의 `gc-heap-size`가 여유로운데 파드가 죽는다면 확진이다(72.8절).

---

## C.9 환경 변수·런타임 구성 스위치

### C.9.1 세 가지 공통 함정

> **⚠️ 숫자 값은 `0x` 접두사 없이 16진수로 해석된다**
>
> `DOTNET_GCHeapHardLimitPercent=50`은 50%가 아니라 **80%**(0x50)다. `DOTNET_GCHeapCount=10`은 힙 10개가 아니라 **16개**다. `DOTNET_TC_CallCountThreshold=100`은 100이 아니라 **256**이다. **설정 후에는 반드시 `GC.GetConfigurationVariables()`로 실제 반영된 값을 확인하라**(65.5절, 65.8절, 55.2절).

> **⚠️ 환경 변수가 `runtimeconfig.json`을 이긴다**
>
> 둘 다 설정되어 있으면 `DOTNET_`/`COMPlus_` 환경 변수가 JSON 설정을 덮어쓴다. "설정했는데 안 먹는다"의 절반이 이것이다(65.1절).

> **📌 `COMPlus_`와 `DOTNET_`**
>
> .NET 6부터 `DOTNET_` 접두사를 쓰는 것이 권장되고, `COMPlus_`도 (적어도 .NET 8까지) 여전히 인식된다. **두 개를 동시에 설정하지 마라** — 어느 쪽이 이겼는지 추적하기 어려워진다. 새 코드와 새 컨테이너 이미지에서는 `DOTNET_`만 쓴다(65.1절, 74.5절).

### C.9.2 GC 모드와 힙

| 환경 변수 | `runtimeconfig.json` 키 | 의미 | 상세 |
|---|---|---|---|
| `DOTNET_gcServer` | `System.GC.Server` | 0=워크스테이션, 1=서버 | 65.1절 |
| `DOTNET_gcConcurrent` | `System.GC.Concurrent` | 백그라운드(동시) GC 켜기/끄기 | 65.2절 |
| `DOTNET_GCRetainVM` | `System.GC.RetainVM` | 비운 세그먼트를 OS에 반납하지 않고 유지 | 65.1절 |
| `DOTNET_GCHeapCount` | `System.GC.HeapCount` | 서버 GC의 힙(=GC 스레드) 개수. **서버 GC에서만** | 65.5절 |
| `DOTNET_GCHeapHardLimit` | `System.GC.HeapHardLimit` | 모든 힙의 총합 절대 상한(바이트) | 65.5절 |
| `DOTNET_GCHeapHardLimitPercent` | `System.GC.HeapHardLimitPercent` | 물리/컨테이너 메모리 대비 비율 상한. 기본 75% | 65.5절, 72.8절 |
| `DOTNET_GCLOHThreshold` | `System.GC.LOHThreshold` | LOH 경계(기본 85,000바이트) | 62.3절 |
| `DOTNET_GCgen0size` | — | gen0 예산의 초기 크기 | 63.6절 |
| `DOTNET_GCConserveMemory` | `System.GC.ConserveMemory` | 0~9. 감내할 단편화 한도 = (10 − 값)/10 | 65.6절 |
| `DOTNET_GCHighMemPercent` | — | 이 비율에서 GC가 공격적으로 바뀐다. 기본 90% | 65.6절 |
| `DOTNET_GCLargePages` | `System.GC.LargePages` | 대용량 페이지 사용. **힙 하드 리밋과 OS 권한이 선행 조건** | 65.6절 |
| `DOTNET_GCLatencyLevel` | — | 0 또는 1(기본). 지연 시간 최적화 수준 | 65.4절 |
| `DOTNET_GCLatencyMode` | — | 지연 시간 모드. **지원되는 방법은 `GCSettings.LatencyMode`다** | 65.4절 |
| `DOTNET_GCDynamicAdaptationMode` | `System.GC.DynamicAdaptationMode` | DATAS 켜기/끄기 ※.NET 8+ | 65.7절 |
| `DOTNET_GCMaxHeapCount` | — | DATAS가 늘릴 수 있는 힙 개수 상한 | 65.7절 |
| `DOTNET_GCName` | — | 커스텀(standalone) GC 라이브러리 **이름**. `coreclr` 옆에서 찾는다 | 65.12절 |
| `DOTNET_GCPath` | — | 커스텀 GC의 **절대 경로** ※.NET 9+ | 65.12절 |

### C.9.3 JIT과 시작 시간

| 환경 변수 | 기본값 | 의미 | 상세 |
|---|---|---|---|
| `DOTNET_TieredCompilation` | `1` | `0`이면 계층화를 끄고 처음부터 완전 최적화 | 55.2절 |
| `DOTNET_TC_QuickJit` | `1` | `0`이면 Tier-0을 쓰지 않는다 | 55.2절 |
| `DOTNET_TC_QuickJitForLoops` | `1` (※.NET 7+) | 루프를 가진 메서드도 Tier-0으로 | 55.3절 |
| `DOTNET_TC_CallCountThreshold` | `1E`(=30) | Tier-1 승격 호출 횟수 | 55.2절 |
| `DOTNET_TC_CallCountingDelayMs` | `64`(=100) | 호출 계수 지연 밀리초 | 55.2절 |
| `DOTNET_TC_OnStackReplacement` | `1` | OSR 켜기/끄기 ※.NET 7+ | 55.3절 |
| `DOTNET_TC_OnStackReplacement_InitialCounter` | `1000` | OSR 유발 루프 반복 카운터 초기값 | 55.3절 |
| `DOTNET_TieredPGO` | `1` (※.NET 8+) | 동적 PGO 계측 | 55.5절 |
| `DOTNET_ReadyToRun` | `1` | `0`이면 R2R 네이티브 코드를 무시하고 전부 JIT | 55.7절, 72.7절 |

> **💡 시작이 느릴 때의 A/B 절차**
>
> `DOTNET_ReadyToRun=0`으로 한 번 돌려 시작 시간을 비교하라. **차이가 없으면 R2R 이미지가 로드되지 않고 있는 것**이다(55.7절). `DOTNET_TieredCompilation=0`은 R2R 코드는 계속 쓰면서 계층화만 끄므로 두 요인을 분리할 수 있다.

### C.9.4 진단·덤프

| 환경 변수 | 의미 | 상세 |
|---|---|---|
| `DOTNET_DbgEnableMiniDump` | `1`이면 처리되지 않은 예외로 죽을 때 덤프 생성 | 74.5절 |
| `DOTNET_DbgMiniDumpType` | `1`=Mini `2`=Heap `3`=Triage `4`=Full | 74.5절 |
| `DOTNET_DbgMiniDumpName` | 덤프 파일 경로. `%p`는 PID | 74.5절 |
| `DOTNET_EnableCrashReport` | `1`이면 `.crashreport.json`도 생성 | 74.5절 |
| `DOTNET_CreateDumpDiagnostics` | `createdump` 자체의 진단 출력 | 74.5절 |
| `DOTNET_DiagnosticPorts` | 진단 포트 경로. 역방향(suspend) 모드로 시작 시점부터 잡을 때 | 66.2절, 74.7절 |
| `DOTNET_EnableDiagnostics` | `0`이면 EventPipe·진단 IPC를 전부 끈다 | C.8.4 |
| `DOTNET_GCGenAnalysisGen` | 세대별 인식 분석의 관심 최소 세대 | 66.13절 |
| `DOTNET_GCGenAnalysisBytes` | 분석을 유발할 승격 바이트 임계값. **16진수** | 66.13절 |
| `DOTNET_GCGenAnalysisIndex` | 건너뛸 초기 GC 개수 | 66.13절 |
| `DOTNET_JitDisasm` | 지정한 메서드의 JIT 어셈블리를 출력 | 55.8절, 부록 A |
| `DOTNET_JitDisasmSummary` | 컴파일된 메서드 목록과 계층을 요약 | 55.8절 |
| `DOTNET_JitStdOutFile` | JIT 출력을 파일로 | 55.8절 |
| `DOTNET_JitDisasmDiffable` | 주소를 지워 `diff` 가능한 출력으로 | 55.8절 |

> **⚠️ 세대별 인식 분석은 일회성이고 침습적이다**
>
> `DOTNET_GCGenAnalysisGen`/`Bytes`/`Index`는 프로세스를 **재시작해야** 적용된다. 조건이 한 번 충족되면 그것으로 끝이고, 임계값을 잘못 잡으면 다시 띄워야 한다. 그리고 `Bytes`는 16진수다 — 16 MB를 기다리려면 `1000000`이다. 이 도구는 `% Time in GC`가 높고 `Gen 2 Object Deaths`까지 봤는데도 "왜 승격되는지"가 설명되지 않을 때 마지막으로 꺼낸다(66.13절).

---

## C.10 한 장 요약 치트시트

### 증상 → 명령

| 증상 | 1분 | 10분 | 확정 |
|---|---|---|---|
| 메모리 증가 | `dotnet-counters monitor --counters System.Runtime[working-set,gc-heap-size,gc-committed,gen-2-gc-count]` | `dotnet-gcdump collect` ×2 → PerfView `Diff` | `dumpheap -stat` → `-mt` → `objsize` → `gcroot` |
| 단편화 의심 | 위 + `gc-fragmentation`, `loh-size` | PerfView GCStats `LOH Frag %` | `heapstat -inclUnrooted` → `eeheap -gc` → `dumpheap <범위>` |
| CPU 100% | `dotnet-counters monitor --counters System.Runtime[cpu-usage,time-in-gc,alloc-rate]` | `dotnet-trace collect --profile cpu-sampling` | PerfView `CPU Stacks` / `GCStats` |
| 응답 없음 | `dotnet-counters monitor --counters System.Runtime[cpu-usage,threadpool-queue-length]` | `dotnet-stack report -p <pid>` | `syncblk` → `clrthreads` → `clrstack` / `dumpasync -stacks` |
| 예외 폭주 | `dotnet-counters monitor --counters System.Runtime[exception-count]` | `dotnet-trace collect --clrevents exception --clreventlevel 5` | `dumpheap -type Exception -stat` → `pe` |
| 시작 느림 | `dotnet-counters monitor --counters System.Runtime[methods-jitted-count]` | `dotnet-trace collect --profile cpu-sampling -- ./MyApp` | PerfView `JITStats`, `DOTNET_ReadyToRun=0` A/B |
| 크래시 | — | `DOTNET_DbgEnableMiniDump=1`을 **미리** 켜 둔다 | `pe -nested` → `clrstack` |
| 어셈블리 누적 | `dotnet-counters monitor --counters System.Runtime[assembly-count,working-set]` | — | `eeheap -loader` → `dumpdomain` → `gcroot` |
| 파이널라이저 적체 | `dotnet-counters monitor --counters System.Runtime[gc-heap-size,gen-2-size]` | — | `finalizequeue` → `clrthreads` → `clrstack` → `syncblk` |

### SOS 명령 10선

```text
dumpheap -stat                 무엇이 힙을 먹는가            (66.9절)
dumpheap -mt <MT>              그 타입의 인스턴스 목록        (66.9절)
gcroot <주소>                  누가 붙들고 있는가             (66.5절)
dumpobj <주소>                 필드와 값. static 열을 봐라    (66.9절)
objsize <주소>                 이 객체가 무는 그래프 전체 크기 (66.3절)
heapstat -inclUnrooted         단편화 정량화                  (66.11절)
eeheap -gc / -loader           힙 레이아웃 / 로더 힙          (66.9절)
finalizequeue                  파이널라이저 적체              (66.11절)
clrthreads → clrstack          누가 무엇을 하는가             (74.5절)
syncblk                        누가 무엇을 쥐고 있는가        (74.5절)
```

### 절대 잊지 말 것 다섯 가지

| # | 규칙 |
|---|---|
| 1 | **`DOTNET_*`의 숫자 값은 16진수다.** `HeapHardLimitPercent=50`은 80%다 (65.5절) |
| 2 | **압축 gen2 GC가 도는데도 안 줄어야** 관리 누수다. 그 전에는 판정 불가 (66.1절) |
| 3 | **`.gcdump`는 메모리 덤프가 아니다.** 객체 그래프뿐이고 필드 값이 없다 (66.4절) |
| 4 | **덤프에는 비밀이 평문으로 들어 있다.** 외부 전송 전에 정책을 확인하라 (74.5절) |
| 5 | **WinDbg는 마지막 수단이다.** `dotnet-counters` → `.gcdump` 비교 → 그다음 (66.9절) |

---

## 이 부록의 요약

- **증상이 정해지면 첫 명령은 자동으로 정해진다.** `dotnet-counters monitor` 한 줄이 도구 선택 공간을 절반으로 줄인다. `cpu-usage`가 높으면 CPU 바운드, 낮은데 큐가 쌓이면 대기 바운드이며 이 두 갈래에 필요한 도구가 완전히 다르다.

- **`dotnet-*` 도구는 EventPipe 위에서 돌고 .NET Framework에는 붙지 않는다.** 반대로 `.NET CLR *` 성능 카운터는 .NET(Core) 프로세스에 값을 게시하지 않는다. "도구가 프로세스를 못 찾는다"의 절반이 이 구분을 놓친 것이다.

- **`dotnet-counters`는 1차 판별, `dotnet-trace`는 이벤트, `dotnet-gcdump`는 객체 그래프, `dotnet-dump`는 전부다.** 오버헤드도 이 순서로 커지고, 프로덕션 적합성은 이 순서로 낮아진다.

- **카운터는 절댓값이 아니라 두 값의 간격과 추세로 읽는다.** `working-set` − `gc-heap-size`가 벌어지면 비관리 쪽, `gc-committed` − `gc-heap-size`가 벌어지면 단편화다.

- **SOS 명령은 목적별로 여섯 묶음뿐이다** — 힙 조망, 개별 객체, 수명·루트, 스레드·동기화, 타입·모듈, 예외·무결성. 실전에서는 이들을 다섯 개의 조리법(C.5)으로 엮어 쓴다.

- **`!dumpheap -stat`의 `TotalSize`는 얕은 크기의 합, `!objsize`는 전체 크기, 누수 진단에 필요한 유지 크기는 둘 다 아니다.** 이 셋을 혼동하면 엉뚱한 타입을 범인으로 지목한다.

- **`!gcroot` 경로의 시작점이 원인의 분류다.** 고정 핸들 → `System.Object[]`로 시작하면 정적 필드, `Thread <id>:`로 시작하면 스택 루트(대개 무죄), `Found 0 unique roots`는 "곧 죽을 객체" 또는 "추적 불가능한 루트"다.

- **PerfView는 다섯 개의 텍스트 상자(`GroupPats`·`Fold%`·`FoldPats`·`IncPats`·`ExcPats`)를 모르면 읽을 수 없다.** 그리고 `Heap Stacks`의 "스택"은 호출 스택이 아니라 참조 경로다.

- **프로덕션에서 쓸 수 있는 것은 사고 전에 준비해 둔 것뿐이다.** `DOTNET_DbgEnableMiniDump`, 심볼 배포 설정, 소스 링크, `dotnet-monitor` 수집 규칙 — 넷 다 배포 매니페스트와 빌드 구성의 문제이지 사고 대응 기술이 아니다.

- **환경 변수의 숫자는 16진수이고, 환경 변수는 `runtimeconfig.json`을 이긴다.** 설정 후 `GC.GetConfigurationVariables()`로 실제 값을 확인하는 습관이 프로덕션에서만 재현되는 사고 하나를 막는다.

---

## 연습 문제

1. 아무 .NET 애플리케이션에 `dotnet-counters monitor`를 붙여 C.1절의 첫 3분 표에 있는 여덟 개 카운터를 한 화면에 띄워라. 그다음 의도적으로 초당 수만 개의 짧은 수명 객체를 할당하는 루프를 돌려 어느 카운터가 먼저 반응하는지 순서대로 기록하라.

2. 같은 프로세스에 `dotnet-trace collect --profile gc-collect`와 `--profile gc-verbose`를 각각 30초씩 붙이고, **처리량 차이**와 **파일 크기 차이**를 재라. C.2절의 오버헤드 서술을 자기 숫자로 검증하라.

3. 정적 `List<byte[]>`에 1 MB 배열을 계속 추가하는 프로그램을 만들어 `dotnet-gcdump`로 스냅샷 두 장을 뜨고 PerfView `Diff`로 비교하라. 이어서 `dotnet-dump collect --type Heap`으로 덤프를 떠 C.5.1절의 8단계를 그대로 실행하고, **어느 단계에서 답이 나왔는지** 적어라.

4. `dotnet-dump analyze <덤프> -c "..." -c "exit"` 형태로 C.5.5절의 파이널라이저 조리법을 **한 줄 스크립트**로 만들어라. 파이널라이저에서 `Thread.Sleep(100)`을 호출하는 클래스를 대량 생성하는 프로그램에 적용해 출력이 예상과 맞는지 확인하라.

5. `DOTNET_GCHeapHardLimitPercent`를 `50`으로 설정해 애플리케이션을 띄우고 `GC.GetConfigurationVariables()`로 실제 반영된 값을 출력하라. 50이 아닌 값이 나오는 이유를 설명하고, 정확히 50%를 얻으려면 무엇을 써야 하는지 확인하라(C.9.1절).

6. 컨테이너에 `DOTNET_DbgEnableMiniDump=1`, `DOTNET_DbgMiniDumpType=2`, `DOTNET_DbgMiniDumpName=/dumps/core.%p`를 설정하고 처리되지 않은 예외로 죽는 코드를 실행하라. 볼륨에 남은 덤프를 `dotnet-dump analyze`로 열어 `pe -nested`와 `clrstack`으로 원인을 재구성하라.

7. `.nettrace` 하나를 PerfView로 열고 `GroupPats`에 `[group module entries]`, `Fold%`에 `1`을 넣기 전후의 화면을 비교하라. 같은 데이터에서 결론이 어떻게 달라지는지, 그리고 `=>`(엔트리 그룹)와 `->`(묶기)의 차이가 실제로 무엇을 바꾸는지 서술하라.

8. 두 잠금을 서로 반대 순서로 획득하는 교착 코드를 작성해 행 상태를 만들고, `dotnet-stack report`로 먼저 훑은 뒤 덤프를 떠서 C.5.3절의 8단계를 실행하라. **`dotnet-stack`만으로 알 수 있었던 것과 덤프가 있어야 알 수 있었던 것**을 나눠 적어라.

---

**이어서 볼 곳** — 이 부록의 명령들은 절차 없이는 쓸모가 없다. 누수 판별의 흐름도와 시나리오 여섯 개는 66장, 덤프에서 사고를 재구성하는 절차는 74장, 무엇을 계측해 둘 것인가는 75장이다. GC 설정을 실제로 고를 때의 판단 흐름도는 65.11절에, 메모리 관리 규칙 스물여섯 개는 부록 B에, JIT 출력을 읽는 법은 부록 A에 있다. 도구를 다 익힌 뒤 자신이 무엇을 모르는지 점검하려면 84장의 체크리스트로 가라.
