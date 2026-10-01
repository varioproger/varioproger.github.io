# 47장. async / await 완전 해부

> **이 장의 위치** — Part IX「동시성과 비동기」의 심장이다. 45장에서 스레드를, 46장에서 스레드 풀과 `Task`를 다루면서 계속 미뤄 둔 질문 — "`await`를 만나면 정확히 무슨 일이 벌어지는가" — 을 여기서 끝까지 판다. `async`/`await`는 문법 설탕이 아니라 **컴파일러가 메서드 하나를 상태 기계 타입 하나로 통째로 재작성하는** 변환이며, 그 변환의 모양을 알아야 데드락도 할당도 예외 흐름도 설명이 된다.
>
> **선수 지식** — 28장(열거와 반복자, 특히 28.4절의 반복자 상태 기계), 32장(예외 처리), 45장(스레드의 기초), 46장(스레드 풀과 태스크)
>
> **이 장에서 다루지 않는 것** — 스레드 풀의 내부 구조와 스레드 주입은 46.1~46.2절, `Task` API·`TaskCompletionSource`·취소 토큰·`WhenAll`은 46장, 락과 메모리 모델은 48장, 반복자 상태 기계의 기초는 28.4절, `IAsyncEnumerable<T>`와 `await foreach`의 **사용법**은 28.9절에서 다룬다. 이 장은 그 위에서 **상태 기계의 실물 구조**만 판다. 채널·백프레셔 같은 아키텍처 패턴은 51장이다.

---

## 47.1 동기 연산과 비동기 연산 — 무엇이 다른가

### 정의는 한 줄이다

**동기 연산(synchronous operation)은 호출자에게 돌아오기 전에 일을 끝낸다. 비동기 연산(asynchronous operation)은 호출자에게 돌아온 뒤에 일의 (전부 또는 대부분을) 끝낼 수 있다.**

이게 전부다. 스레드도, 병렬성도, 코어 개수도 정의에 들어가지 않는다. 유일한 기준은 **"반환 시점에 일이 끝나 있는가"** 이다.

우리가 쓰고 만드는 메서드의 대다수는 동기 메서드다. `List<T>.Add`, `Console.WriteLine`, `Thread.Sleep`이 그렇다. 비동기 메서드는 상대적으로 드물고, **호출자와 나란히 일이 계속되기 때문에 동시성을 개시한다.** 비동기 메서드는 대개 빠르게(또는 즉시) 호출자에게 돌아오므로 **논블로킹(nonblocking) 메서드**라고도 부른다.

```csharp
using System;
using System.IO;
using System.Threading.Tasks;

// 동기: 이 줄이 끝나면 bytes 안에 데이터가 들어 있다
static byte[] ReadSync (string path)
{
    return File.ReadAllBytes (path);
}

// 비동기: 이 줄이 끝나도 데이터는 아직 없다. 있는 것은 "나중에 생길 것"에 대한 토큰뿐이다
static Task<byte[]> ReadAsync (string path)
{
    return File.ReadAllBytesAsync (path);
}
```

`ReadAsync`가 돌려주는 `Task<byte[]>`는 **결과가 아니라 결과에 대한 약속**이다. 컴퓨터 과학 용어로 **퓨처(future)** 라고 부르는 것이고, .NET에서는 `Task<TResult>`가 그 역할을 한다.

> **📌 "비동기 메서드"는 두 가지를 뜻할 수 있다**
>
> 문헌에서 "비동기 메서드"는 두 의미로 쓰인다.
>
> 1. **의미론적 비동기** — 반환 후에도 일이 계속되는 메서드. `Task`를 반환하면 대개 여기 해당한다.
> 2. **`async` 한정자가 붙은 메서드** — C# 명세가 **비동기 함수(asynchronous function)** 라고 부르는 것. 컴파일러가 상태 기계로 재작성하는 대상이다.
>
> 이 둘은 독립이다. `async` 없이도 의미론적으로 비동기인 메서드를 쓸 수 있고(`Task`를 그대로 반환하면 된다), `async`가 붙었지만 `await`가 없어서 사실상 동기인 메서드도 만들 수 있다(컴파일러가 경고 CS1998을 낸다). 이 장에서는 헷갈릴 여지가 있으면 후자를 **`async` 메서드**로 명시한다.

### I/O 바운드와 CPU 바운드

비동기를 이야기하려면 먼저 작업을 두 종류로 갈라야 한다. 이 구분이 나중의 거의 모든 판단을 좌우한다.

| 구분 | 정의 | 시간의 대부분을 | 대표 예 |
|---|---|---|---|
| **I/O 바운드(I/O-bound)** | 무언가 일어나기를 기다리는 데 시간 대부분을 쓰는 연산 | **기다림**에 쓴다 | 네트워크 요청, 디스크 읽기/쓰기, DB 쿼리, 파이프 통신, `Task.Delay` |
| **CPU 바운드(compute-bound)** | 계산에 시간 대부분을 쓰는 연산 | **계산**에 쓴다 | 소수 판별, 이미지 필터, 압축, 암호화, 정렬 |

45.2절에서 본 **블로킹**과 **스핀**의 구분이 여기에 겹친다. I/O 바운드 연산을 동기적으로 기다리면 스레드는 블로킹되고 OS 스케줄러에서 빠진다. CPU 바운드 연산은 스레드가 실제로 CPU를 쓰고 있으므로 블로킹이 아니다.

이 구분이 중요한 이유는 하나다.

- **I/O 바운드 작업은 기다리는 동안 스레드가 필요 없다.** 그러니 스레드를 놓아주는 것이 정답이다.
- **CPU 바운드 작업은 계산하는 동안 스레드가 필요하다.** 그러니 놓아줄 스레드가 애초에 없다.

`async`/`await`가 근본적으로 이득을 주는 쪽은 전자다. 후자에서 `async`/`await`가 하는 일은 "다른 스레드에 밀어 놓고 호출자를 놓아주기"뿐이고, 그건 별개의 이야기다(47.2절).

> **⚠️ "비동기 = 빠르다"가 아니다**
>
> 비동기 호출 하나는 동기 호출 하나보다 **항상 느리다.** 상태 기계 디스패치, 연속(continuation) 등록, 컨텍스트 캡처와 복원이 모두 순수한 추가 비용이다. 비동기가 이기는 지점은 **처리량(throughput)과 응답성(responsiveness)** 이지 개별 지연 시간(latency)이 아니다.
>
> 서버에서 요청 1개를 처리하는 시간은 비동기 쪽이 미세하게 길다. 대신 같은 스레드 수로 요청 10,000개를 동시에 붙들고 있을 수 있다. 이 교환을 이해하지 못하면 "비동기로 바꿨는데 왜 안 빨라지죠"라는 질문에서 벗어나지 못한다.

### 응답성과 확장성 — 비동기가 실제로 사는 두 곳

비동기가 값어치를 하는 시나리오는 크게 둘이다.

**첫째, 서버의 확장성이다.** 웹 애플리케이션을 상상해 보자. 클라이언트 요청이 들어올 때마다 스레드 풀 스레드가 우리 코드를 호출한다. 여기서 DB 요청을 **동기적으로** 하면, 그 스레드는 DB가 응답할 때까지 무기한 블로킹된다. 그 사이 다른 요청이 오면 풀은 스레드를 하나 더 만들고, 그 스레드도 또 블로킹된다. 요청이 쌓일수록 스레드가 쌓이고, **거의 쓰이지도 않는 스레드와 그 스택 메모리에 시스템 자원이 잠긴다.**

더 나쁜 일도 있다. DB가 결과를 돌려주기 시작하면 블로킹돼 있던 스레드들이 한꺼번에 깨어난다. 스레드는 많고 CPU 코어는 적으므로 OS는 잦은 컨텍스트 스위칭을 해야 하고, 성능은 더 나빠진다. 이런 식으로는 확장 가능한 애플리케이션을 만들 수 없다.

**둘째, 리치 클라이언트의 응답성이다.** UI 스레드가 블로킹되면 메시지 루프가 돌지 않고 화면이 멎는다(45.8절). 시간이 걸리는 작업을 UI 스레드에서 밀어내야 하는데, 전통적 방법은 **호출 그래프 전체를 워커 스레드에 올리는 것**(굵은 결의 동시성, coarse-grained concurrency)이었다. 그러면 그 그래프 안의 모든 메서드가 스레드 안전성을 신경 써야 한다.

비동기는 다른 길을 낸다. **동시성을 호출 그래프의 바닥(I/O를 실제로 개시하는 지점)에서 개시한다.** 그 위의 메서드들은 전부 UI 스레드에 남을 수 있고, 스레드 안전성 문제는 사라진다. 이걸 **가는 결의 동시성(fine-grained concurrency)** 이라고 부른다.

> **💡 50밀리초 규칙**
>
> 경험칙 하나를 제안한다. **50밀리초를 넘길 가능성이 있는 연산은 I/O 바운드든 CPU 바운드든 비동기로 노출하라.** 사람이 UI의 멈칫거림을 인지하기 시작하는 경계가 대략 그 근처이고, 서버라면 그 시간 동안 스레드를 붙들고 있는 비용이 이미 무시할 수 없다.
>
> 반대 방향의 경고도 필요하다. 지나치게 잘게 쪼갠 비동기는 오히려 성능을 해친다. 비동기 호출마다 상태 기계 오버헤드가 붙기 때문이다. `int`를 하나 더하는 메서드를 `Task<int>`로 만들 이유는 없다.

### 하나의 결정적 이득 — 겹침

비동기의 효과 중 가장 눈에 띄는 것은 **여러 I/O를 겹칠 수 있다**는 점이다.

웹사이트 열 곳에서 이미지를 하나씩 내려받고, 각각 5초가 걸린다고 하자.

- **동기**: 하나씩 처리하므로 총 50초. 여러 동기 I/O의 총 시간은 **각 시간의 합**이다.
- **비동기**: 스레드 하나로 열 개의 다운로드를 개시하면 열 개가 동시에 진행되고, 5초 뒤에 열 장이 모두 도착한다. 여러 비동기 I/O의 총 시간은 **가장 느린 하나의 시간**이다.

이 차이는 스레드를 열 개 만들어서 얻는 것이 아니다. **스레드를 하나도 더 쓰지 않고** 얻는다. 왜 그런지가 다음 절의 주제다.

---

## 47.2 비동기의 본질 — 스레드가 아니라 "대기"의 문제

### 명제: 비동기는 멀티스레드가 아니다

개발자에게 "비동기 실행을 설명해 보라"고 하면 십중팔구 멀티스레딩 이야기를 시작한다. 멀티스레딩이 비동기의 전형적 **용법** 중 하나인 것은 맞지만, **비동기 실행에 스레드는 필요조건이 아니다.**

이 장에서 가장 중요한 문장을 먼저 박아 두자.

> **I/O가 진행되는 동안에는 어떤 스레드도 필요하지 않다.**

디스크가 섹터를 읽고 있거나 NIC가 패킷을 기다리는 동안, 그 일을 대신해 주는 스레드는 없다. 하드웨어가 한다. 스레드를 하나 붙여 두는 것은 **아무 일도 하지 않는 스레드를 유지 비용만 내고 붙들고 있는 것**과 정확히 같다.

> **⚠️ 흔한 오해 — "`async`를 붙이면 런타임이 새 스레드를 만든다"**
>
> 입문 자료 중에 "메서드에 `async` 한정자를 붙이기만 하면 런타임이 새 실행 스레드를 만들어 준다"고 쓰인 것이 있다. **틀렸다.** `async` 한정자는 스레드를 하나도 만들지 않는다. 그것이 하는 일은 컴파일러에게 "이 메서드 본문을 상태 기계로 재작성하고, 그 안에서 `await`를 키워드로 취급하라"고 지시하는 것뿐이다.
>
> `async` 메서드는 호출되면 **호출한 스레드에서 동기적으로 실행되기 시작한다.** 첫 `await`가 아직 완료되지 않은 대상을 만날 때까지 그렇다. 새 스레드가 등장하는 지점은 `Task.Run` 같은 **명시적 스케줄링**이나, I/O 완료를 처리하러 오는 스레드 풀 스레드뿐이다.

### 동기 I/O가 실제로 하는 일

Windows에서 동기 파일 읽기를 추적해 보자. 다른 OS도 이름만 다를 뿐 구조는 같다.

```text
 사용자 코드                커널                       하드웨어
┌──────────────────┐
│ fs.Read(...)     │ ①
└────────┬─────────┘
         ↓
┌──────────────────┐
│ ReadFile(...)    │ ②  IRP(I/O Request Packet) 할당
│ (Win32, 사용자   │     - 파일 핸들
│  모드)           │     - 파일 내 오프셋
└────────┬─────────┘     - 채울 버퍼 주소, 길이
         ↓ ③ 커널 모드 전환
┌───────────────────────────────┐
│ Windows I/O 서브시스템        │ ④ 장치 드라이버의 IRP 큐에 넣는다
│  디스패처                     │
└────────┬──────────────────────┘
         ↓                          ┌──────────────────────┐
     ⑤ 드라이버가 회로 보드에  →   │ 디스크 컨트롤러가     │
       요청 전달                     │ 실제 I/O 수행         │
                                     │ ★ 스레드 관여 없음 ★ │
   ⑥ 호출 스레드는 여기서 잠든다    └──────────┬───────────┘
      (커널이 재우고 스케줄러에서 뺀다)         │
                                                ↓ 완료
   ⑦ 커널이 스레드를 깨우고 ⑧ 사용자 모드 복귀 ⑨ 관리 코드 복귀
```

`⑤`와 `⑥` 사이의 구간이 핵심이다. **하드웨어가 일하는 동안 우리 스레드는 아무것도 하지 않는다.** CPU 시간을 낭비하지는 않지만(잠들어 있으므로) **공간을 낭비한다.** 사용자 모드 스택, 커널 모드 스택, 스레드 환경 블록(TEB), 그 밖의 자료 구조가 메모리에 그대로 앉아 있으면서 접근되지 않는다. GUI 애플리케이션이라면 그 위에 "UI가 입력에 반응하지 못한다"는 문제가 더 붙는다.

### 비동기 I/O가 하는 일

같은 그림을 비동기로 바꾸면 이렇게 된다.

```text
 사용자 코드                커널                       하드웨어
┌──────────────────┐
│ fs.ReadAsync(..) │ ① Task<int> 할당
└────────┬─────────┘
         ↓
┌──────────────────┐
│ ReadFile(...)    │ ② IRP 할당 (동일)
└────────┬─────────┘
         ↓ ③
┌───────────────────────────────┐
│ I/O 서브시스템 디스패처       │ ④ 드라이버 IRP 큐에 넣는다
└────────┬──────────────────────┘
         │                          ┌──────────────────────┐
   ⑤ 스레드는 블로킹되지 않고  →   │ 디스크 컨트롤러가     │
      즉시 호출자에게 돌아간다      │ 실제 I/O 수행         │
      ⑥ ⑦ (계속 다른 일을 한다)    └──────────┬───────────┘
                                                ↓ ⓐ 완료
                             ┌──────────────────────────────┐
                             │ CLR 스레드 풀의              │ ⓑ 완료된 IRP를
                             │ I/O 완료 포트                │    큐에 넣는다
                             └──────────┬───────────────────┘
                                        ↓ ⓒ 풀 스레드가 꺼내서
                                           Task를 완료시킨다
                                           (결과 또는 예외를 채운다)
```

바뀐 것은 딱 두 군데다.

1. **스레드가 잠들지 않고 즉시 돌아온다.** `⑤`에서 호출 스레드는 다른 요청을 처리하러 갈 수 있다.
2. **완료 통지가 스레드 풀을 거쳐 온다.** 하드웨어가 IRP 처리를 마치면 완료된 IRP가 CLR 스레드 풀의 큐로 들어가고, 언젠가 풀 스레드가 그것을 꺼내 `Task`에 결과나 예외를 채운다.

CLR 스레드 풀은 내부적으로 Windows의 **I/O 완료 포트(I/O Completion Port)** 라는 자원을 써서 이 동작을 구현한다. CLR은 초기화될 때 완료 포트를 하나 만들고, 하드웨어 장치를 열 때 그 장치를 완료 포트에 바인딩한다. 그러면 드라이버가 완료된 IRP를 어디로 보낼지 알게 된다. Linux에서는 `epoll`이, 최신 커널에서는 `io_uring`이 같은 역할을 한다. 이름은 다르지만 구조는 같다 — **완료 통지를 큐로 받고, 소수의 스레드가 그 큐를 소비한다.**

> **📌 DMA — 왜 CPU조차 필요 없는가**
>
> 위 그림에서 "하드웨어가 한다"는 말은 은유가 아니다. 현대적 장치는 **DMA(Direct Memory Access)** 로 CPU를 거치지 않고 자기 데이터를 시스템 메모리에 직접 써 넣는다. CPU는 요청을 걸어 두고, 완료 시점에 인터럽트를 한 번 받을 뿐이다.
>
> 그러니 "I/O를 기다리는 스레드"는 CPU 자원도, 장치 자원도 대신 쓰고 있지 않다. 순수하게 **메모리와 스케줄러 슬롯만 소비하는 유령**이다.

### 그래서 스레드가 몇 개나 줄어드는가

앞의 웹 서버 예로 돌아가자. 클라이언트 요청이 오고, 우리가 DB 요청을 **비동기로** 한다.

- 스레드는 블로킹되지 않고 풀로 돌아간다. 그래서 다음 요청을 받을 수 있다.
- **스레드 하나가 들어오는 모든 클라이언트 요청을 처리한다.**
- DB가 응답하면 그 응답도 스레드 풀에 큐잉되고, 풀 스레드가 처리해 클라이언트에게 데이터를 돌려준다.

결과적으로 **스레드 하나가 모든 클라이언트 요청과 모든 DB 응답을 처리한다.** 항목이 스레드 하나가 처리할 수 있는 속도보다 빨리 쌓이면 풀이 스레드를 더 만든다. 다만 대개 CPU 개수 근처에서 멈춘다. 8코어 머신이라면 요청/응답 8건이 컨텍스트 스위칭 없이 8개 스레드에서 돈다.

이런 스레드 수 감소는 부수 효과를 줄줄이 낳는다.

- **GC 일시 중지가 짧아진다.** GC가 시작되면 CLR이 모든 스레드를 중단시켜야 한다. 중단할 스레드가 적을수록 빠르다.
- **GC 루트 스캔이 빨라진다.** GC는 모든 스레드의 스택을 훑어 루트를 찾는다. 스택이 적으면 훑을 것도 적다.
- **스택 스캔 자체가 얕다.** 블로킹하지 않는 스레드는 대부분의 시간을 풀 안에서 스택 최상단에 머문다.
- **디버깅이 빨라진다.** 중단점에서 Windows가 모든 스레드를 중단·재개한다. 스레드가 많으면 한 줄 실행마다 느려진다.
- **컨텍스트 스위칭이 줄어든다.** 코어 수와 실행 가능 스레드 수가 비슷하면 스위칭이 거의 일어나지 않는다.

### "스레드는 대기를 위한 것이 아니다"

지금까지의 논의를 한 문장으로 압축하면 이렇다.

> **스레드는 계산을 위한 자원이지, 대기를 위한 자원이 아니다.**

스레드는 싸지 않다. 45.4절에서 본 대로 기본 1MB 스택 예약, 커널 객체, TEB, 그리고 생성·소멸 비용이 든다. 이걸 "아무것도 안 하고 앉아 있기" 용도로 쓰는 것은 자원 낭비의 정의에 가깝다.

> **⚠️ `Task.Run`으로 감싸는 것은 대개 틀린 해법이다**
>
> 동기 API `GetData()`밖에 없는데 비동기가 필요할 때 흔히 이렇게 쓴다.
>
> ```csharp
> // 안티패턴: 동기 위에 비동기 껍데기 씌우기(async-over-sync)
> public Task<Data> GetDataAsync()
> {
>     return Task.Run (() => GetData());
> }
> ```
>
> 이건 **아무것도 개선하지 않는다.** `GetData()`가 I/O 바운드라면, 이 코드는 "호출 스레드 대신 **스레드 풀 스레드** 하나를 잡아서 블로킹시킨다"는 뜻이다. 총 스레드 소비는 줄지 않았고, 오히려 컨텍스트 스위칭 한 번과 `Task` 할당 하나가 늘었다. 서버에서 이걸 하면 스레드 풀 기아(46.2절)로 가는 지름길이다.
>
> 진짜 해법은 **바닥에서 진짜 비동기 API를 쓰는 것**이다. 진짜 비동기 API가 없다면, 그 사실을 API 표면에 정직하게 노출하고(동기 메서드로 두고) 호출자가 결정하게 하라.
>
> `Task.Run`이 정당한 곳은 딱 하나다. **CPU 바운드 작업을 호출 스레드(특히 UI 스레드)에서 밀어낼 때.** 그때는 계산할 스레드가 실제로 필요하므로 스레드를 쓰는 게 맞다.

> **💡 라이브러리는 `Task.Run`을 쓰지 않는다**
>
> 실무 지침 하나. **라이브러리 코드는 `Task.Run`을 자기 안에 숨기지 마라.** 라이브러리는 어떤 애플리케이션 모델에서 호출될지 모른다. UI 앱이라면 `Task.Run`이 고마울 수 있지만, ASP.NET Core 서버라면 스레드 풀 스레드를 자기 자신에게서 훔쳐 오는 순손실이다.
>
> 라이브러리는 진짜 비동기면 비동기로, 동기면 동기로 정직하게 노출한다. `Task.Run`으로 감쌀지는 **애플리케이션이 결정한다.**

---

## 47.3 비동기 프로그래밍과 연속 — 언어 지원이 왜 중요한가

### 실행 모델의 전복

C# 개발자가 익숙한 실행 모델은 단순하다.

```csharp
Console.WriteLine ("First");
Console.WriteLine ("Second");
```

첫 호출이 끝나고, 그다음 호출이 시작된다. 실행은 한 문장에서 다음 문장으로 순서대로 흐른다.

비동기 실행 모델은 그렇게 동작하지 않는다. 비동기의 세계는 **연속(continuation)** 으로 이루어진다. 무언가를 시작할 때, 그것이 끝나면 무엇을 하고 싶은지를 **그 연산에게 말해 준다.** "콜백(callback)"이라는 용어를 들어 봤을 것이다. 여기서 쓰는 의미는 그보다 좁다 — **프로그램의 상태를 보존하는 콜백**을 뜻한다. GUI 이벤트 핸들러처럼 임의의 용도로 쓰는 콜백이 아니다.

.NET에서 연속은 자연스럽게 델리게이트로 표현되며, 대개 비동기 연산의 결과를 받는 액션이다.

> **📌 연속(continuation)의 정의**
>
> **연속**은 비동기 연산(또는 임의의 `Task`)이 완료됐을 때 실행할 콜백이다. `async` 메서드 안에서 연속은 **메서드의 상태를 유지한다.** 클로저가 변수 관점에서 자기 환경을 유지하듯, 연속은 **자기가 도달했던 지점**을 기억하고 있다가 실행될 때 거기서부터 계속한다.
>
> `Task`에는 연속을 붙이기 위한 메서드가 있다 — `Task.ContinueWith`(46.4절). 그리고 `await`가 실제로 쓰는 경로는 `GetAwaiter().OnCompleted(...)`다.

### 콜백 지옥 — 코드가 뒤집히는 지점

문제는 연산이 몇 개만 연결돼도 델리게이트를 만드는 일이 통제 불능이 된다는 것이다. 람다식이 있어도 그렇다. 오류 처리까지 얹으면 더 나빠진다.

Nutshell의 예제를 따라가 보자. 소수의 개수를 세는 CPU 바운드 메서드가 있다.

```csharp
using System;
using System.Linq;
using System.Threading.Tasks;

int GetPrimesCount (int start, int count)
{
    return ParallelEnumerable.Range (start, count).Count (
        n => Enumerable.Range (2, (int) Math.Sqrt (n) - 1).All (i => n % i > 0));
}

void DisplayPrimeCounts()
{
    for (int i = 0; i < 10; i++)
        Console.WriteLine (GetPrimesCount (i * 1000000 + 2, 1000000)
                           + " primes between " + (i * 1000000)
                           + " and " + ((i + 1) * 1000000 - 1));
    Console.WriteLine ("Done!");
}
```

비동기 버전을 만든다.

```csharp
Task<int> GetPrimesCountAsync (int start, int count)
{
    return Task.Run (() =>
        ParallelEnumerable.Range (start, count).Count (
            n => Enumerable.Range (2, (int) Math.Sqrt (n) - 1).All (i => n % i > 0)));
}
```

이제 `DisplayPrimeCounts`를 고쳐야 한다. 언어 지원 없이 연속만으로 해 보자. 순진하게 루프 안에서 연속을 붙이면 이렇게 된다.

```csharp
for (int i = 0; i < 10; i++)
{
    var awaiter = GetPrimesCountAsync (i * 1000000 + 2, 1000000).GetAwaiter();
    awaiter.OnCompleted (() =>
        Console.WriteLine (awaiter.GetResult() + " primes between..."));
}
Console.WriteLine ("Done");
```

**동작하지 않는다.** 메서드가 논블로킹이므로 루프는 10회를 순식간에 돌고, 10개 연산이 전부 병렬로 실행된다. 그리고 "Done"이 맨 먼저 찍힌다.

순차 실행을 원한다면 **다음 루프 반복을 연속 안에서 촉발해야 한다.** 즉 `for` 루프를 없애고 재귀로 바꿔야 한다.

```csharp
void DisplayPrimeCounts()
{
    DisplayPrimeCountsFrom (0);
}

void DisplayPrimeCountsFrom (int i)
{
    var awaiter = GetPrimesCountAsync (i * 1000000 + 2, 1000000).GetAwaiter();
    awaiter.OnCompleted (() =>
    {
        Console.WriteLine (awaiter.GetResult() + " primes between...");
        if (++i < 10) DisplayPrimeCountsFrom (i);
        else Console.WriteLine ("Done");
    });
}
```

**루프가 재귀로 뒤집혔다.** 이게 "코드가 뒤집힌다"는 말의 뜻이다. 제어 흐름 구조가 원래 의도와 전혀 다른 모양이 됐다.

여기서 한 발 더 나간다. `DisplayPrimeCounts` 자체를 비동기로 만들어서, 완료 시점을 알리는 태스크를 반환하고 싶다면? `TaskCompletionSource`가 필요하고, 상태를 담을 클래스가 하나 더 필요하다.

```csharp
using System.Threading.Tasks;

Task DisplayPrimeCountsAsync()
{
    var machine = new PrimesStateMachine();
    machine.DisplayPrimeCountsFrom (0);
    return machine.Task;
}

class PrimesStateMachine
{
    TaskCompletionSource<object> _tcs = new TaskCompletionSource<object>();
    public Task Task { get { return _tcs.Task; } }

    public void DisplayPrimeCountsFrom (int i)
    {
        var awaiter = GetPrimesCountAsync (i * 1000000 + 2, 1000000).GetAwaiter();
        awaiter.OnCompleted (() =>
        {
            Console.WriteLine (awaiter.GetResult());
            if (++i < 10) DisplayPrimeCountsFrom (i);
            else { Console.WriteLine ("Done"); _tcs.SetResult (null); }
        });
    }
}
```

클래스 이름이 `PrimesStateMachine`인 것에 주목하라. 손으로 상태 기계를 쓰고 있는 것이다. 그리고 이 코드에는 **오류 처리가 하나도 없다.** `try`/`catch`를 넣으면 어디에 넣어야 하는지부터 고민해야 하고, 예외를 `_tcs.SetException`으로 옮기는 코드가 각 연속마다 필요하다.

### 언어 지원이 하는 일

C#의 비동기 함수를 쓰면 위 코드 전체가 이렇게 된다.

```csharp
async Task DisplayPrimeCountsAsync()
{
    for (int i = 0; i < 10; i++)
        Console.WriteLine (await GetPrimesCountAsync (i * 1000000 + 2, 1000000)
                           + " primes between " + (i * 1000000)
                           + " and " + ((i + 1) * 1000000 - 1));
    Console.WriteLine ("Done!");
}
```

원래의 동기 코드와 **모양이 같다.** 루프는 루프로 남아 있고, `try`/`catch`를 쓰면 `try`/`catch`로 동작한다.

> **📌 명령형 반복문은 연속과 섞이지 않는다**
>
> 근본 원인을 짚자면 이렇다. `for`, `foreach` 같은 **명령형 반복 구조는 메서드의 현재 지역 상태에 의존한다.** "이 루프를 몇 번 더 돌 것인가"라는 정보가 지역 변수에 들어 있다. 연속은 그 지역 상태를 넘어 다니지 못한다. 그래서 둘이 섞이지 않는다.
>
> `async`/`await`가 하나의 해답이고, 다른 해답도 있다 — 명령형 반복을 **함수형 등가물**(LINQ 쿼리)로 바꾸는 것. Reactive Extensions(Rx)가 그 노선이다. 대가는 블로킹을 막기 위해 푸시 기반 시퀀스 위에서 동작해야 한다는 점이고, 그건 개념적으로 만만치 않다.

### 언어 지원 이전의 세계 — APM과 EAP

.NET은 태스크 이전에 두 가지 비동기 모델을 거쳤다. 자세한 것은 47.16절에서 다루지만, 대비를 위해 형태만 보자.

`Stream.Read`의 세 가지 얼굴이다.

```csharp
// 동기
public int Read (byte[] buffer, int offset, int size);

// TAP (현재)
public Task<int> ReadAsync (byte[] buffer, int offset, int size);

// APM (.NET 1.x)
public IAsyncResult BeginRead (byte[] buffer, int offset, int size,
                               AsyncCallback callback, object state);
public int EndRead (IAsyncResult asyncResult);
```

APM(비동기 프로그래밍 모델)에서는 `Begin*`이 연산을 개시하고 `IAsyncResult` 토큰을 돌려준다. 완료(또는 실패)하면 `AsyncCallback` 델리게이트가 발화하고, 그것을 받은 쪽이 `End*`를 호출해 반환값을 얻거나 예외를 다시 던지게 만든다. **쓰기도 까다롭지만 올바르게 구현하기는 놀랍도록 어려웠다.**

EAP(이벤트 기반 비동기 패턴, .NET 2.0)는 UI 시나리오를 겨냥해 더 단순하게 만들려는 시도였다. `WebClient` 같은 소수의 타입에만 구현됐다.

```csharp
// WebClient의 EAP 멤버들
public byte[] DownloadData (Uri address);              // 동기 버전
public void DownloadDataAsync (Uri address);
public void DownloadDataAsync (Uri address, object userToken);
public event DownloadDataCompletedEventHandler DownloadDataCompleted;
public void CancelAsync (object userState);            // 취소
public bool IsBusy { get; }                            // 진행 중 여부
```

EAP는 **패턴일 뿐 지원 타입이 없다.** 구현하려면 방대한 보일러플레이트가 필요하고, 합성(composition)이 거의 불가능하다. 두 EAP 연산을 순차로 잇는 코드를 상상해 보면 바로 알 수 있다.

| 모델 | 등장 | 개시 | 완료 통지 | 합성 가능성 | 취소 |
|---|---|---|---|---|---|
| **APM** | .NET 1.x | `BeginXxx` | `AsyncCallback` + `EndXxx` | 매우 나쁨 | 없음 |
| **EAP** | .NET 2.0 | `XxxAsync` | `XxxCompleted` 이벤트 | 매우 나쁨 | `CancelAsync` |
| **TAP** | .NET 4.0 / 4.5 | `XxxAsync` | 반환된 `Task` | 좋음(`WhenAll`/`WhenAny`) | `CancellationToken` |

TAP가 이긴 결정적 이유는 **모든 종류의 비동기 연산을 단일 타입(`Task`)으로 표현한다**는 점이다. 타입이 하나면 그 타입 위에 합성기(combinator)를 만들 수 있다. `Task.WhenAll`과 `Task.WhenAny`가 존재할 수 있는 이유가 그것이고, APM과 EAP에는 그런 것이 원리적으로 있을 수 없었다.

---
## 47.4 `await`의 의미론

### 문법과 첫 번째 근사

`await`의 문법은 단순하다. `await` 연산자 뒤에 값을 만드는 표현식이 온다.

```csharp
int result = await GetPrimesCountAsync (2, 1000000);
Console.WriteLine (result);
```

컴파일러는 이 코드를 대략 다음과 **기능적으로 유사한** 것으로 확장한다.

```csharp
var awaiter = GetPrimesCountAsync (2, 1000000).GetAwaiter();
awaiter.OnCompleted (() =>
{
    int result = awaiter.GetResult();
    Console.WriteLine (result);
});
```

"대략"과 "유사한"이라는 말이 중요하다. 실제 컴파일러는 여기에 **동기 완료 시 연속을 건너뛰는 최적화**(47.9절)와 여러 세부 사항을 더한다. 그리고 델리게이트를 만드는 대신 상태 기계를 만든다(47.7절). 그래도 이 확장은 `await`가 무엇을 하는 물건인지에 대한 첫 번째 정확한 근사다.

`await` 연산자의 **우선순위는 점 연산자보다 낮다.** 그래서 다음 두 줄은 같다.

```csharp
int result = await foo.Bar().Baz();
int result = await (foo.Bar().Baz());
```

### 정확한 의미론 — 두 갈래

`await`가 실행에 도달했을 때 가능한 경우는 정확히 둘이다.

**경우 1 — 기다리는 연산이 이미 완료됐다.** 실행 흐름은 단순하다. **그냥 계속 간다.** 연산이 실패해서 예외를 담고 있다면 그 예외가 던져진다. 아니면 결과를 꺼내(예: `Task<string>`에서 `string`을 뽑아) 다음 문장으로 넘어간다. **스레드 컨텍스트 전환도, 연속 등록도 일어나지 않는다.**

**경우 2 — 기다리는 연산이 아직 진행 중이다.** 메서드는 **비동기적으로 기다린다.** 이 "비동기적으로 기다린다"는 말은 곧 **메서드가 전혀 실행되고 있지 않다**는 뜻이다. 연속이 그 비동기 연산에 붙고, 메서드는 반환한다. 나중에 연산이 완료되면 연속이 발화하고, 메서드는 멈춘 자리에서 다시 시작한다.

이 두 갈래를 흐름도로 그리면 이렇다.

```text
                    (await 표현식에 도달)
                            │
                            ↓
              피연산자를 평가한다 (awaitable)
                            │
                            ↓
              awaitable.GetAwaiter()  →  awaiter
                            │
                            ↓
                 ┌── awaiter.IsCompleted ──┐
              참 │                          │ 거짓
                 │                          ↓
                 │            awaiter를 필드에 저장
                 │            state = (이 await의 번호)
                 │                          │
                 │                          ↓
                 │            awaiter.OnCompleted(MoveNext)
                 │              (또는 UnsafeOnCompleted)
                 │                          │
                 │                          ↓
                 │                      ★ 반환 ★
                 │                          │
                 │                     ... 시간이 흐른다 ...
                 │                          │
                 │                          ↓
                 │              연속이 MoveNext를 호출
                 │              state = -1, awaiter 복원
                 │                          │
                 ↓                          ↓
                 └──────────┬───────────────┘
                            ↓
                   awaiter.GetResult()
                (결과를 얻거나 예외를 다시 던진다)
                            ↓
                       실행 계속
```

### `async` 메서드는 첫 `await`까지 동기적으로 실행된다

여기가 가장 자주 오해되는 지점이다.

**`async` 메서드를 호출하는 것은 새 스레드에서 태스크를 띄우는 것과 다르다.** 호출하면 **호출한 스레드에서 메서드 본문이 즉시, 동기적으로 실행되기 시작한다.** 그 실행은 "아직 완료되지 않은 대상을 `await` 하는 첫 지점"까지 계속된다.

C# in Depth의 예제로 확인해 보자.

```csharp
using System;
using System.Threading.Tasks;

static void Main()
{
    Task task = DemoCompletedAsync();
    Console.WriteLine ("Method returned");
    task.Wait();
    Console.WriteLine ("Task completed");
}

static async Task DemoCompletedAsync()
{
    Console.WriteLine ("Before first await");
    await Task.FromResult (10);        // 이미 완료된 태스크
    Console.WriteLine ("Between awaits");
    await Task.Delay (1000);           // 아직 완료되지 않은 태스크
    Console.WriteLine ("After second await");
}
```

출력은 이렇다.

```text
Before first await
Between awaits
Method returned
After second await
Task completed
```

세 가지를 읽어 낼 수 있다.

1. **완료된 태스크를 `await` 할 때 메서드는 반환하지 않는다.** `Before first await`와 `Between awaits` 사이에 아무것도 없다.
2. **완료되지 않은 태스크를 `await` 할 때 메서드는 반환한다.** 그래서 세 번째 줄이 `Main`에서 찍힌 `Method returned`다.
3. **`async` 메서드가 반환한 태스크는 메서드가 *완료*될 때에야 완료된다.** `Task completed`가 `After second await` 뒤에 온다.

> **⚠️ "반환한다(return)"와 "완료된다(complete)"는 다른 사건이다**
>
> 비동기 동작을 설명할 때 가장 헷갈리는 지점이 이 구분이다. 일반적인 메서드와 달리 **`async` 메서드는 여러 번 반환할 수 있다** — 당장 더 할 수 있는 일이 없을 때마다 반환한다. 하지만 **완료는 한 번뿐**이고, 그 시점에 반환된 태스크의 상태가 `RanToCompletion`/`Faulted`/`Canceled` 중 하나로 바뀐다.
>
> 피자 배달로 비유하자면, `EatPizzaAsync`는 주문 전화를 걸고, 배달원을 만나고, 피자가 식기를 기다리는 각 단계에서 **반환**할 수 있다. 하지만 피자를 다 먹기 전까지 **완료**되지 않는다.

이 성질에서 따라 나오는 실무 규칙이 있다.

> **⚠️ `async` 메서드 앞부분에 무거운 동기 작업을 넣지 마라**
>
> 첫 `await`까지는 호출자의 스레드가 그대로 실행한다. 그 구간이 500밀리초 걸리는 계산이면, UI 스레드에서 호출된 경우 **UI가 500밀리초 멎는다.** "비동기 메서드니까 괜찮겠지"는 통하지 않는다.
>
> 무거운 초기 계산이 필요하면 그 부분을 별도 메서드로 분리해 `Task.Run`으로 밀거나, 메서드 앞에 `await Task.Yield()`를 넣어 즉시 호출자에게 제어를 돌려준 뒤 계산하게 만든다. 후자는 UI 스레드에서는 계산이 여전히 UI 스레드에서 도는 것이므로(연속이 UI로 돌아온다) 근본 해법이 아니다. **분리가 정답이다.**

### 지역 상태의 보존

`await` 표현식의 진짜 힘은 **거의 아무 데나 나타날 수 있다**는 데 있다. `async` 함수 안이라면, `lock` 문 안과 `unsafe` 컨텍스트 안을 제외하고, 표현식이 올 수 있는 자리 어디든 `await` 표현식이 올 수 있다.

```csharp
async void DisplayPrimeCounts()
{
    for (int i = 0; i < 10; i++)
        Console.WriteLine (await GetPrimesCountAsync (i * 1000000 + 2, 1000000));
}
```

`GetPrimesCountAsync`를 처음 실행하면 `await` 때문에 실행이 호출자에게 돌아간다. 메서드가 완료(또는 실패)하면 실행이 멈춘 자리에서 재개되는데, **지역 변수와 루프 카운터의 값이 그대로 보존돼 있다.**

개발자 시점에서는 마치 메서드가 "일시 정지"됐다가 재개되는 것처럼 느껴진다. 실제로 컴파일러는 반복자와 마찬가지로 메서드를 상태 기계로 리팩터링한다(47.7절). 그 상태 기계가 지역 변수를 필드로 승격해 값을 보존한다.

### 스레드는 바뀔 수 있다

`await` 뒤의 코드를 실행하는 스레드는 `await` 앞의 코드를 실행한 스레드와 **다를 수 있다.**

- 리치 클라이언트의 UI 스레드에서 실행 중이었다면 동기화 컨텍스트가 같은 스레드로 되돌린다(47.12절).
- 그렇지 않으면 태스크가 완료된 스레드나 스레드 풀 스레드에서 재개된다.

스레드가 바뀌어도 **실행 순서에는 영향이 없다.** 스레드 친화성(thread affinity)에 의존하는 코드가 아니라면 신경 쓸 일이 아니다. 예외적으로 신경 써야 하는 것들이 있다.

- **`[ThreadStatic]`과 `ThreadLocal<T>`** — `await` 뒤가 다른 스레드면 값이 다르다(49.8절).
- **`Monitor`(`lock`)** — 획득한 스레드만 해제할 수 있다(48.5절).
- **UI 컨트롤 접근** — 생성한 스레드에서만 접근할 수 있다(45.8절).
- **`Thread.CurrentThread.CurrentCulture`** — 이것은 `ExecutionContext`를 타고 흐르므로 대개 괜찮다(46.7절).

> **💡 택시 비유**
>
> Nutshell의 비유가 정확하다. 도시를 여행하며 목적지마다 택시를 잡아탄다고 하자. **동기화 컨텍스트가 있으면 항상 같은 택시**를 타게 된다. 컨텍스트가 없으면 매번 다른 택시를 탄다. 어느 쪽이든 **여정 자체는 같다.**
>
> 이 비유가 유용한 이유는 "같은 택시를 타는 것"이 공짜가 아니라는 점까지 담기 때문이다. 그 택시가 다른 손님을 태우고 있으면 기다려야 한다. 그게 47.14절의 데드락이다.

### `await`를 쓸 수 없는 곳

C# 명세는 `await`의 사용처에 제약을 둔다.

| 제약 | 이유 | 버전 |
|---|---|---|
| `async` 메서드 / `async` 익명 함수 안에서만 | 컴파일러가 상태 기계를 만들 수 있어야 한다 | 항상 |
| `lock` 문 안에서 불가 (CS1996) | 모니터는 획득한 스레드만 해제할 수 있다 | 항상 |
| `unsafe` 컨텍스트 안에서 불가 | — | 항상 |
| 쿼리 식 안에서는 제한적 | 첫 `from` 절의 컬렉션 식, 또는 `join` 절의 컬렉션 식에서만 | 항상 |
| `catch` / `finally` 블록 안에서 불가 | — | **C# 5까지만.** C# 6부터 허용 |
| `catch` 절이 있는 `try` 블록 안에서 불가 | — | **C# 5까지만.** C# 6부터 허용 |

`finally`만 있는 `try` 블록(즉 `using` 문) 안에서의 `await`는 처음부터 유효했다.

> **⚠️ `lock` 안의 `await`를 우회하려 하지 마라**
>
> 컴파일러가 `lock` 안의 `await`를 막는다고 해서 `Monitor.Enter`/`Monitor.Exit`를 직접 호출하면, **컴파일은 되지만 런타임에 깨진다.** `await` 앞뒤를 다른 스레드가 실행하면 `Monitor.Exit`가 `SynchronizationLockException`을 던진다.
>
> 같은 스레드가 실행되는 경우(UI 동기화 컨텍스트)에도 안전하지 않다. `await` 구간 동안 **그 스레드에서 다른 코드가 실행될 수 있고**, 그 코드가 같은 모니터에 대해 `lock`에 들어갈 수 있다. 재진입이 허용돼 버려서 상호 배제가 깨진다.
>
> 비동기 구간에 걸친 상호 배제가 정말 필요하면 `SemaphoreSlim.WaitAsync`를 쓴다(48.11절, 51.3절).

---

## 47.5 `async` 메서드 선언과 반환 타입 (`void` / `Task` / `ValueTask` / 커스텀)

### `async` 한정자의 위치와 성격

`async` 메서드의 선언 문법은 다른 메서드와 완전히 같고, `async` **문맥 키워드**가 반환 타입 앞 어딘가에 붙는다는 점만 다르다. 다음은 모두 유효하다.

```csharp
public static async Task<int> FooAsync() { /* ... */ }
public async static Task<int> FooAsync() { /* ... */ }
async public Task<int> FooAsync() { /* ... */ }
public async virtual Task<int> FooAsync() { /* ... */ }
```

관행은 반환 타입 바로 앞에 두는 것이다.

`async`는 컴파일러가 **없어도 되는** 키워드였다. 반복자에서 `yield return`을 보고 반복자 블록 모드로 들어가듯, `await`를 보고 비동기 모드로 들어갈 수도 있었다. 그럼에도 `async`를 요구한 이유는 두 가지다.

1. **하위 호환성** — C# 5 이전 코드에서 `await`를 식별자로 쓴 것이 있을 수 있다. `async` 한정자가 있어야만 `await`를 키워드로 취급한다.
2. **가독성** — 메서드를 읽는 사람이 즉시 "이 안에 `await`가 있겠구나"라고 기대하게 만든다.

> **⚠️ `async`는 시그니처의 일부가 아니다**
>
> 이게 가장 중요한 성질이다. **`async` 한정자는 생성된 코드(메타데이터)에 반영되지 않는다.** `unsafe` 한정자와 비슷하게 메서드의 시그니처나 공개 메타데이터에 영향을 주지 않고, **메서드 안에서 무슨 일이 일어나는가에만** 영향을 준다.
>
> 따라서 다음이 모두 성립한다.
>
> - 적절한 시그니처를 가진 기존 메서드에 `async`를 **추가하거나 제거**할 수 있다. 소스 호환성과 바이너리 호환성이 모두 유지된다.
> - **인터페이스 멤버 선언에는 `async`를 쓸 수 없다.** 인터페이스는 `Task<int>`를 반환하는 메서드를 명세할 수 있고, 어떤 구현은 `async`/`await`로, 다른 구현은 평범한 메서드로 만들면 된다. 구현 세부를 계약에 쓸 수는 없다.
> - **추상 메서드 선언에도 쓸 수 없다.** 같은 이유다.
> - 비-`async` 가상 메서드를 재정의하면서 `async`를 도입하는 것은 **가능하다.** 시그니처만 같으면 된다.
>
> 예외가 하나 생겼다. **본문이 있는 기본 인터페이스 메서드(default interface method)** 는 `async`일 수 있다 ※C# 8. 본문이 있으면 구현이므로 당연하다.

호출하는 쪽에서 보면 `async` 메서드는 **그냥 태스크를 반환하는 평범한 메서드**다. 그 이상도 이하도 아니다.

### 반환 타입 네 가지 + 커스텀

`async` 함수가 반환할 수 있는 타입은 다음과 같다.

| 반환 타입 | 사용하는 빌더 | 언제 쓰는가 | 완료를 알 수 있는가 | 예외가 가는 곳 |
|---|---|---|---|---|
| `void` | `AsyncVoidMethodBuilder` | **이벤트 핸들러 전용** | **불가능** | 동기화 컨텍스트(없으면 스레드 풀) → 프로세스 종료 |
| `Task` | `AsyncTaskMethodBuilder` | 값을 반환하지 않는 비동기 메서드 | 가능 | 반환된 `Task` |
| `Task<TResult>` | `AsyncTaskMethodBuilder<TResult>` | 값을 반환하는 비동기 메서드 | 가능 | 반환된 `Task<TResult>` |
| `ValueTask` / `ValueTask<TResult>` | `AsyncValueTaskMethodBuilder(<T>)` | 동기 완료가 흔한 핫 경로 ※C# 7 | 가능 | 반환된 `ValueTask` |
| `[AsyncMethodBuilder]`가 붙은 커스텀 타입 | 그 특성이 지정한 빌더 | 사실상 프레임워크 저자 전용 ※C# 7 | 빌더가 정하는 대로 | 빌더가 정하는 대로 |
| `IAsyncEnumerable<T>` / `IAsyncEnumerator<T>` | `AsyncIteratorMethodBuilder` | 비동기 스트림 ※C# 8 | 열거로 확인 | `MoveNextAsync`에서 던져진다 |

C# 5와 C# 6에서는 `void`, `Task`, `Task<TResult>` 셋뿐이었다. C# 7에서 **태스크 타입(task type)** 개념이 도입되면서 `ValueTask`와 커스텀 타입이 가능해졌다.

### 매개변수 제약

`async` 메서드의 매개변수에는 제약이 있다.

```csharp
// 전부 컴파일 오류
async Task BadAsync (out int x) { }        // out 불가
async Task BadAsync (ref int x) { }        // ref 불가
async Task BadAsync (in int x) { }         // in 불가
unsafe async Task BadAsync (int* p) { }    // 포인터 타입 불가
async Task BadAsync (Span<int> s) { }      // ref struct 불가
```

이유는 명확하다. `out`/`ref`는 **호출 코드로 정보를 되돌려 주기 위한** 한정자인데, 제어가 호출자에게 돌아가는 시점에 `async` 메서드는 아직 실행이 끝나지 않았을 수 있다. 지역 변수를 `ref` 인수로 넘겼다면, 호출 메서드가 이미 완료된 뒤에 `async` 메서드가 그 변수를 설정하려 드는 상황이 된다. 말이 되지 않으므로 컴파일러가 막는다.

`ref struct`(`Span<T>` 포함)는 힙에 올라갈 수 없다는 규칙 때문이다(68.1절). 상태 기계가 힙으로 올라가면 그 필드도 힙에 올라가므로 허용할 수 없다. 같은 이유로 **`await`를 가로지르는 지역 변수로도 `ref struct`를 쓸 수 없다.** `await` 사이에만 존재하는 지역이면 괜찮다(47.7절의 필드 승격 규칙 참조).

### 반환값 래핑

`Task<TResult>`를 반환하도록 선언한 `async` 메서드의 본문은 `TResult` 값을 `return` 한다.

```csharp
static async Task<int> GetPageLengthAsync (string url)
{
    Task<string> fetchTextTask = client.GetStringAsync (url);
    int length = (await fetchTextTask).Length;
    return length;                  // int를 반환하지만 메서드 타입은 Task<int>
}
```

생성된 코드가 **래핑**을 대신해 준다. 호출자는 `Task<int>`를 받고, 그 태스크는 메서드가 완료될 때 반환값을 담는다. 논제네릭 `Task`를 반환하는 메서드는 `void` 메서드처럼 동작한다. `return` 문이 아예 없어도 되고, 있다면 값 없는 `return`이어야 한다.

`await`가 **언래핑**하고 `return`이 **래핑**한다. 이 대칭 덕분에 `async` 메서드가 다른 `async` 메서드의 결과를 자연스럽게 소비하고, 그 결과를 다시 태스크로 내보낼 수 있다. 이것이 비동기 코드가 잘 **합성(compose)** 되는 근본 이유다.

> **📌 `return` 표현식과 `finally`의 순서**
>
> `return` 문이 `finally` 블록이 딸린 `try` 안에 있으면(`using` 문 포함), **반환값을 계산하는 표현식은 즉시 평가되지만** 태스크의 결과가 되는 것은 정리가 전부 끝난 뒤다. `finally` 블록이 예외를 던지면 "성공이면서 동시에 실패한" 태스크가 되지는 않는다. 전체가 실패한다.

### 예외는 태스크에 담긴다

**`async` 메서드는 예외를 직접 던지지 않는다.** 메서드 본문이 첫 줄부터 예외를 던지더라도, 결과는 **실패 상태(faulted)의 태스크가 반환되는 것**이다.

```csharp
static async Task<int> ComputeLengthAsync (string text)
{
    if (text == null)
        throw new ArgumentNullException (nameof (text));   // 즉시 던져지지만...
    await Task.Delay (500);
    return text.Length;
}

static async Task MainAsync()
{
    Task<int> task = ComputeLengthAsync (null);
    Console.WriteLine ("Fetched the task");   // ← 이 줄이 먼저 실행된다
    int length = await task;                  // ← 여기서 ArgumentNullException
}
```

`Fetched the task`가 먼저 출력된다. 예외는 `await` 하는 시점에야 보인다. 반복자와 비슷하지만 완전히 같지는 않다 — 반복자에서는 `MoveNext()`를 처음 호출할 때까지 **인수 검증 코드조차 실행되지 않는다.** 비동기에서는 인수 검증이 **즉시 실행되지만** 예외가 태스크에 담겨서 `await` 전에는 드러나지 않는다.

이 문제의 해법(래퍼 메서드 + 지역 함수)은 47.15절에서 TAP 규약과 함께 다룬다.

> **⚠️ `async void`만이 유일한 예외다**
>
> `void`를 반환하는 `async` 함수는 예외를 담을 태스크가 없다. `AsyncVoidMethodBuilder`가 처리되지 않은 예외를 잡아서 **캡처된 동기화 컨텍스트에 게시(post)** 한다. 컨텍스트가 없으면 스레드 풀에서 다시 던져지고, 대개 프로세스가 종료된다.
>
> 흥미로운 미묘함이 있다. **`await` 앞에서 던지든 뒤에서 던지든 결과가 같다.**
>
> ```csharp
> async void Foo() { throw null; await Task.Delay (1000); }
> ```
>
> 이 예외도 호출자에게 직접 던져지지 않고 동기화 컨텍스트로 간다. 예측 가능성과 일관성을 위한 설계다. 다음 코드에서 `someCondition`이 무엇이든 결과가 같아야 하기 때문이다.
>
> ```csharp
> async Task Foo()
> {
>     if (someCondition) await Task.Delay (100);
>     throw new InvalidOperationException();   // 항상 태스크를 실패시킨다
> }
> ```

### 취소와 태스크 상태

C# 명세는 "`async` 메서드 본문이 예외를 던지면 반환된 태스크가 실패 상태가 된다"고만 말한다. **실패 상태의 정확한 의미는 구현이 정한다.** 실제 구현에서는 다음 규칙이 적용된다.

**`async` 메서드가 `OperationCanceledException`(또는 그 파생 타입, 예컨대 `TaskCanceledException`)을 던지면 반환된 태스크의 상태는 `Faulted`가 아니라 `Canceled`가 된다.**

취소 토큰을 전혀 쓰지 않고 그냥 던지기만 해도 그렇게 된다.

```csharp
static async Task ThrowCancellationException()
{
    throw new OperationCanceledException();
}

// ...
Task task = ThrowCancellationException();
Console.WriteLine (task.Status);        // Canceled
```

> **📌 여기에 경쟁 조건은 없다**
>
> 위 코드에서 메서드를 호출하자마자 상태를 읽는 것이 위험해 보일 수 있다. 위험하지 않다. **첫 `await` 표현식 전까지 `async` 메서드는 동기적으로 실행된다.** `ThrowCancellationException`에는 `await`가 하나도 없으므로 메서드 전체가 동기적으로 돌고, 반환 시점에 이미 결과가 확정돼 있다.
>
> (`await`가 없는 `async` 메서드에 대해 컴파일러가 CS1998 경고를 낸다. 이 예제에서는 그게 바로 우리가 원하는 동작이다.)

### `async Main` ※C# 7.1

C# 7.1부터 진입점을 `async`로 선언할 수 있다. 이름은 여전히 `Main`이어야 하고, 반환 타입은 `Task` 또는 `Task<int>`여야 한다(동기 진입점의 `void`/`int`에 대응). **`async void` Main도, 커스텀 태스크 타입 Main도 안 된다.**

```csharp
static async Task Main()
{
    Console.WriteLine ("Before delay");
    await Task.Delay (1000);
    Console.WriteLine ("After delay");
}
```

컴파일러는 동기 래퍼 메서드를 만들어 그것을 실제 진입점으로 표시한다. 래퍼는 대략 이렇게 생겼다.

```csharp
static void <Main>()                        // C#에서는 무효한 이름, IL에서는 유효하다
{
    Main().GetAwaiter().GetResult();
}
```

C# 9의 최상위 문(top-level statements)에서 `await`를 쓰면 컴파일러가 진입점을 `async Task`(또는 `async Task<int>`)로 만들어 준다. `await`가 없으면 평범한 동기 진입점이 생성된다.

> **⚠️ 콘솔 앱의 `Main`에는 동기화 컨텍스트가 없다**
>
> 위 래퍼가 `GetResult()`로 블로킹하는데도 데드락이 나지 않는 이유는 콘솔 애플리케이션에 동기화 컨텍스트가 없기 때문이다. 연속이 스레드 풀에서 실행되므로 주 스레드가 막혀 있어도 진행이 된다.
>
> **같은 코드를 UI 애플리케이션에 옮기면 즉시 멎는다.** 예제 코드에서 `.Result`나 `.Wait()`를 봤을 때 "콘솔이라서 통했던 것"인지 확인하는 습관이 필요하다. 자세한 것은 47.14절에서 판다.

---
## 47.6 awaitable 패턴 — `GetAwaiter` / `IsCompleted` / `OnCompleted` / `GetResult`

### 인터페이스가 아니라 덕 타이핑이다

`await`가 무엇에 적용될 수 있는지를 정하는 규칙을 **awaitable 패턴**이라고 부른다. `using` 문이 `IDisposable` 구현을 요구하는 것과 달리, `await`는 **인터페이스를 요구하지 않는다.** `foreach`가 `IEnumerable`을 요구하지 않는 것(28.1절)과 같은 방식이다. 순수한 **덕 타이핑(duck typing)** 이다.

타입 `T`의 표현식을 `await` 하려 할 때 컴파일러가 확인하는 것은 다음과 같다.

1. **`T`에 매개변수 없는 `GetAwaiter()` 인스턴스 메서드가 있거나**, `T` 하나를 받는 **확장 메서드** `GetAwaiter()`가 있어야 한다. 이 메서드는 `void`를 반환하면 안 된다. 그 반환 타입을 **awaiter 타입**이라고 부른다.
2. **awaiter 타입은 `System.Runtime.CompilerServices.INotifyCompletion` 인터페이스를 구현해야 한다.** 이 인터페이스의 멤버는 하나뿐이다 — `void OnCompleted(Action)`.
3. **awaiter 타입에 `bool` 타입의 읽기 가능한 인스턴스 프로퍼티 `IsCompleted`가 있어야 한다.**
4. **awaiter 타입에 매개변수 없는 논제네릭 인스턴스 메서드 `GetResult`가 있어야 한다.**
5. 위 멤버들이 `public`일 필요는 없다. 다만 **`await` 하려는 코드에서 접근 가능해야** 한다.

`await` 표현식의 **타입**은 `GetResult`의 반환 타입이 정한다. `GetResult`가 `void`면 `await` 표현식은 값을 만들지 않는 표현식이 되고, 아니면 `GetResult`의 반환 타입과 같은 값을 만든다.

> **📌 확장 메서드 `GetAwaiter`의 역사적 의미**
>
> `GetAwaiter`가 확장 메서드여도 된다는 규칙은 현재보다 역사적 의미가 크다. C# 5는 .NET 4.5와 같은 시기에 나왔고, `Task`/`Task<TResult>`에 `GetAwaiter` 메서드가 추가된 것이 바로 .NET 4.5였다. 진짜 인스턴스 메서드만 허용했다면 .NET 4.0에 묶여 있던 개발자들이 배제됐을 것이다. 확장 메서드를 허용했기에 NuGet 패키지로 `Task`를 await 가능하게 만들 수 있었고, .NET 4.5 프리뷰 없이도 C# 5 컴파일러 프리뷰를 시험해 볼 수 있었다.
>
> 요즘 코드에서 이 능력이 필요한 경우는 드물지만, **직접 만들 수 없는 외부 타입을 await 가능하게 만들 때** 여전히 유효한 수단이다.

`Task.Yield()`가 좋은 예다. `Task`의 다른 메서드와 달리 `Yield()`는 태스크를 반환하지 않고 `YieldAwaitable`을 반환한다. 단순화한 정의는 이렇다.

```csharp
public class Task
{
    public static YieldAwaitable Yield();
}

public struct YieldAwaitable
{
    public YieldAwaiter GetAwaiter();

    public struct YieldAwaiter : INotifyCompletion
    {
        public bool IsCompleted { get; }
        public void OnCompleted (Action continuation);
        public void GetResult();
    }
}
```

패턴을 정확히 만족한다. 따라서 다음은 유효하다.

```csharp
public async Task ValidPrintYieldPrint()
{
    Console.WriteLine ("Before yielding");
    await Task.Yield();
    Console.WriteLine ("After yielding");
}
```

반면 다음은 무효다. `GetResult`가 `void`를 반환하므로 `await` 표현식이 값을 만들지 않기 때문이다.

```csharp
public async Task InvalidPrintYieldPrint()
{
    var result = await Task.Yield();   // 컴파일 오류: 값이 없다
}
```

`Console.WriteLine`의 반환값을 변수에 담으려는 것과 정확히 같은 오류다.

> **📌 `Task.Yield()`가 실제로 하는 일**
>
> `YieldAwaiter.IsCompleted`는 **항상 `false`를 반환한다.** 즉 `await Task.Yield()`는 언제나 느린 경로를 타고, 항상 연속을 등록한 뒤 반환한다. 그리고 그 연속을 **현재 컨텍스트에 즉시 게시**한다.
>
> 효과는 "지금 이 시점에 제어를 양보하고, 큐의 끝에서 다시 시작하라"는 것이다. UI 스레드라면 메시지 루프가 한 바퀴 돌 기회를 주고, 스레드 풀이라면 다른 작업 항목이 낄 기회를 준다. `await Task.Delay(0)`은 이렇게 동작하지 않는다 — `Task.Delay(0)`은 이미 완료된 태스크를 반환하므로 빠른 경로를 타고 아무 양보도 하지 않는다.

### `Task`의 awaiter — `TaskAwaiter`

가장 자주 만나는 awaiter는 `Task.GetAwaiter()`가 반환하는 `System.Runtime.CompilerServices.TaskAwaiter`(그리고 `TaskAwaiter<TResult>`)다.

| 멤버 | `TaskAwaiter` | `TaskAwaiter<TResult>` |
|---|---|---|
| `IsCompleted` | 태스크가 완료 상태(성공/실패/취소)면 `true` | 동일 |
| `OnCompleted(Action)` | 연속 등록. 컨텍스트를 캡처한다 | 동일 |
| `UnsafeOnCompleted(Action)` | 연속 등록. `ExecutionContext`를 흘리지 않는다 | 동일 |
| `GetResult()` | 반환 `void`. 실패했으면 예외를 다시 던진다 | 반환 `TResult`. 실패했으면 예외를 다시 던진다 |

`GetResult`가 던지는 예외에 주목해야 한다. 46.4절에서 본 대로 `Task`는 보통 `AggregateException`을 던지고, 우리가 `InnerExceptions`를 뒤져야 했다. 그런데 **`TaskAwaiter.GetResult()`는 `AggregateException` 대신 그 안의 첫 번째 내부 예외를 던진다.**

이 설계 덕분에 다음 코드가 자연스럽게 동작한다.

```csharp
async Task<string> FetchFirstSuccessfulAsync (IEnumerable<string> urls)
{
    var client = new HttpClient();
    foreach (string url in urls)
    {
        try
        {
            return await client.GetStringAsync (url);
        }
        catch (HttpRequestException exception)      // ← 이게 잡힌다
        {
            Console.WriteLine ("Failed to fetch {0}: {1}", url, exception.Message);
        }
    }
    throw new HttpRequestException ("No URLs succeeded");
}
```

`GetStringAsync` 호출 자체는 연산을 개시할 뿐이므로 `HttpRequestException`을 던질 수 없다. 실패는 태스크에 담겨 온다. `Wait()`를 불렀다면 `AggregateException`을 잡아야 했을 것이다. `TaskAwaiter.GetResult()`가 첫 내부 예외를 벗겨 던지므로 `catch (HttpRequestException)`이 평범하게 동작한다.

> **⚠️ 예외가 유실될 수 있다**
>
> 실패한 태스크에 여러 예외가 들어 있으면 `GetResult()`는 **첫 번째 하나만** 던진다. 나머지는 사라진다.
>
> 이 문제는 `Task.WhenAll`에서 특히 눈에 띈다. `WhenAll`이 만드는 태스크는 실패한 모든 태스크의 예외를 `AggregateException`에 모아 담지만, 그 태스크를 `await` 하면 **첫 번째 예외만** 본다. 전부 보려면 태스크 객체를 잡아 두고 `Exception` 프로퍼티를 직접 읽어야 한다.
>
> ```csharp
> Task all = Task.WhenAll (task1, task2);
> try { await all; }
> catch
> {
>     Console.WriteLine (all.Exception.InnerExceptions.Count);   // 전부 보인다
> }
> ```
>
> 자세한 것은 46.9절.

### `ICriticalNotifyCompletion`과 `UnsafeOnCompleted`

awaiter는 `INotifyCompletion` 위에 `ICriticalNotifyCompletion`을 **추가로** 구현할 수 있다. 이 인터페이스가 추가하는 멤버는 하나다.

```csharp
namespace System.Runtime.CompilerServices
{
    public interface INotifyCompletion
    {
        void OnCompleted (Action continuation);
    }

    public interface ICriticalNotifyCompletion : INotifyCompletion
    {
        void UnsafeOnCompleted (Action continuation);
    }
}
```

두 메서드의 차이는 **`ExecutionContext`를 누가 흘리는가**에 있다.

46.7절에서 본 대로 `ExecutionContext`는 `AsyncLocal<T>`, 보안 주체, 스레드별 문화권 정보 같은 **주변 상태(ambient state)** 를 담고 있고, 비동기 경계를 넘어 흘러야 한다. `await` 앞뒤에서 `AsyncLocal<T>` 값이 달라지면 안 된다는 뜻이다.

- **`OnCompleted`** — awaiter 스스로 `ExecutionContext.Capture()`와 `ExecutionContext.Run()`으로 컨텍스트를 흘려야 한다. 아무나 부를 수 있는 평범한 메서드다.
- **`UnsafeOnCompleted`** — `[SecurityCritical]`로 표시돼 있고, 프레임워크의 빌더 같은 **신뢰된 코드만** 부르도록 의도됐다. **awaiter가 컨텍스트를 흘리지 않아도 된다.** 빌더가 이미 흘렸다고 믿는다.

**컴파일러는 각 `await` 지점에서 awaiter가 `ICriticalNotifyCompletion`을 구현하는지 보고, `builder.AwaitOnCompleted` 또는 `builder.AwaitUnsafeOnCompleted` 중 하나를 호출하도록 코드를 낸다.** 그 빌더 메서드들은 제네릭이고 awaiter 타입에 적절한 인터페이스 제약이 걸려 있다.

awaiter가 `INotifyCompletion`만 구현하면 컴파일러는 `builder.AwaitOnCompleted`를 부르고, 컨텍스트는 awaiter의 `OnCompleted`와 빌더가 각각 흘린다. awaiter가 `ICriticalNotifyCompletion`까지 구현하면 컴파일러는 `builder.AwaitUnsafeOnCompleted`를 부르고, 컨텍스트를 흘리는 것은 **빌더뿐**이다.

`TaskAwaiter`는 `ICriticalNotifyCompletion`을 구현한다. 그래서 실제 디컴파일 결과에서 거의 항상 `AwaitUnsafeOnCompleted`가 보인다. **컨텍스트를 두 번 캡처·복원하지 않기 위한 최적화**다.

> **⚠️ `Unsafe`는 `unsafe` 키워드와 무관하다**
>
> 이름 때문에 포인터나 `unsafe` 블록을 떠올리기 쉽지만 아무 관계가 없다. 공통점은 "여기 용이 산다, 조심하라"는 뉘앙스뿐이다.

> **💡 직접 awaiter를 만든다면**
>
> 부분 신뢰 환경까지 신경 쓰는 awaiter 클래스를 쓴다면 `INotifyCompletion.OnCompleted` 구현이 `ExecutionContext.Capture`/`Run`으로 컨텍스트를 흘리게 하라. 그리고 `ICriticalNotifyCompletion`도 구현해서 그쪽에서는 흘리지 마라. 비동기 인프라만 awaiter를 쓴다면 한 번만 흘리면 되므로 그게 최적이다.
>
> 현대 .NET에서 부분 신뢰(CAS)는 사라졌지만 **인터페이스 구분과 그에 따른 컨텍스트 흐름의 책임 소재는 그대로 남아 있다.**

### 직접 만드는 awaitable — 이벤트를 await 하기

패턴이 인터페이스가 아니라 덕 타이핑이라는 사실은 **무엇이든 await 가능하게 만들 수 있다**는 뜻이다. CLR via C#이 제시한 `EventAwaiter`가 좋은 예다. 이벤트가 발생할 때마다 `await`에서 돌아오게 만든다.

```csharp
using System;
using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Threading;

public sealed class EventAwaiter<TEventArgs> : INotifyCompletion
{
    private ConcurrentQueue<TEventArgs> m_events = new ConcurrentQueue<TEventArgs>();
    private Action m_continuation;

    // --- 상태 기계가 호출하는 멤버들 ---

    // 상태 기계가 가장 먼저 awaiter를 요구한다. 우리 자신을 돌려준다
    public EventAwaiter<TEventArgs> GetAwaiter() { return this; }

    // 아직 발생한 이벤트가 있는지 알려 준다
    public bool IsCompleted { get { return m_events.Count > 0; } }

    // 상태 기계가 나중에 호출할 메서드를 알려 준다. 저장해 둔다
    public void OnCompleted (Action continuation)
    {
        Volatile.Write (ref m_continuation, continuation);
    }

    // 상태 기계가 결과를 요구한다. 이것이 await 연산자의 결과가 된다
    public TEventArgs GetResult()
    {
        TEventArgs e;
        m_events.TryDequeue (out e);
        return e;
    }

    // --- 이벤트 쪽에서 호출되는 멤버 ---

    // 여러 스레드가 동시에 이벤트를 발생시키면 동시에 호출될 수 있다
    public void EventRaised (object sender, TEventArgs eventArgs)
    {
        m_events.Enqueue (eventArgs);        // GetResult가 돌려줄 값을 저장

        // 대기 중인 연속이 있으면 이 스레드가 가져간다
        Action continuation = Interlocked.Exchange (ref m_continuation, null);
        if (continuation != null) continuation();   // 상태 기계 재개
    }
}
```

이 awaiter는 `GetAwaiter()`가 자기 자신을 돌려주므로 **awaitable이면서 동시에 awaiter**다. 흔한 절약 기법이다.

쓰는 쪽은 이렇다. AppDomain 안의 어떤 스레드가 예외를 던질 때마다 상태 기계가 계속된다.

```csharp
private static async void ShowExceptions()
{
    var eventAwaiter = new EventAwaiter<FirstChanceExceptionEventArgs>();
    AppDomain.CurrentDomain.FirstChanceException += eventAwaiter.EventRaised;
    while (true)
    {
        Console.WriteLine ("AppDomain exception: {0}",
                           (await eventAwaiter).Exception.GetType());
    }
}
```

`while (true)` 안에서 `await` 하는 모습이 인상적이다. 이벤트가 발생할 때마다 루프가 한 바퀴 돈다. `Task`가 개입할 자리는 어디에도 없다.

> **⚠️ 이 예제는 교육용이다**
>
> 위 `EventAwaiter`에는 실무에 쓰기 전에 메워야 할 구멍이 여럿 있다. 여러 소비자가 동시에 `await` 하면 `m_continuation` 하나로는 부족하고, 연속을 호출하는 스레드가 이벤트 발생 스레드라서 **이벤트 소스가 예상 못 한 재진입**을 겪을 수 있으며, `ExecutionContext`를 전혀 흘리지 않는다.
>
> 실무에서 이벤트를 태스크로 바꿔야 한다면 `TaskCompletionSource`를 쓰는 쪽이 안전하다(46.5절). 커스텀 awaiter는 **`Task` 할당조차 부담스러운 극단적 핫 경로**이거나, 완료 통지가 반복적으로 여러 번 오는 구조일 때만 정당화된다.

### 스케줄러를 전환하는 awaiter

또 하나의 실용적 패턴은 **"이 지점부터는 다른 곳에서 실행하라"** 는 뜻의 awaiter다. `Task.Yield`의 사촌쯤 된다.

```csharp
using System;
using System.Runtime.CompilerServices;
using System.Threading;

// await ThreadPoolSwitch.Instance; 이후의 코드는 스레드 풀에서 실행된다
public readonly struct ThreadPoolSwitch : INotifyCompletion
{
    public static ThreadPoolSwitch Instance => default;

    public ThreadPoolSwitch GetAwaiter() => this;

    // 이미 스레드 풀 스레드라면 전환할 필요가 없다
    public bool IsCompleted => Thread.CurrentThread.IsThreadPoolThread;

    public void OnCompleted (Action continuation)
        => ThreadPool.QueueUserWorkItem (static state => ((Action) state!)(), continuation);

    public void GetResult() { }
}
```

사용은 이렇다.

```csharp
async Task HandleClickAsync()
{
    // 여기는 UI 스레드
    statusLabel.Text = "계산 중...";

    await ThreadPoolSwitch.Instance;
    // 여기부터는 스레드 풀 스레드
    var result = HeavyComputation();

    // UI로 돌아가려면 여전히 명시적 마샬링이 필요하다
    // ...
}
```

`IsCompleted`가 "이미 원하는 곳에 있는가"를 뜻한다는 점을 보라. 이미 스레드 풀이면 `true`를 돌려주어 빠른 경로를 타고, 전환 비용을 아예 내지 않는다. **awaitable 패턴에서 `IsCompleted`는 "완료됐는가"보다 "지금 그냥 계속 가도 되는가"라는 뜻으로 읽는 편이 정확하다.**

> **💡 왜 `OnCompleted`에서 델리게이트 캐싱에 신경 쓰는가**
>
> 위 코드의 `static state => ((Action) state!)()`는 **정적 람다 + 상태 인수** 조합이다. 캡처하는 람다를 쓰면 호출할 때마다 클로저 객체와 델리게이트가 새로 할당된다(69.1절). awaiter는 핫 경로에 있는 물건이므로, 할당을 아끼려고 이 awaiter를 만든 마당에 델리게이트를 새로 만드는 건 자기모순이다.

---

## 47.7 컴파일러가 만드는 상태 기계 — 필드, `MoveNext()`, 빌더

### 산출물의 전체 구조

`async` 메서드 하나를 컴파일하면 컴파일러는 **두 가지**를 만든다.

1. **스텁(stub) 메서드** — 원래 메서드와 같은 시그니처를 갖는 비-`async` 메서드. 상태 기계를 만들어 첫 걸음을 뗀 다음, 태스크를 반환한다.
2. **상태 기계 타입** — `IAsyncStateMachine`을 구현하는 컴파일러 생성 타입. **릴리스 빌드에서는 `struct`, 디버그 빌드에서는 `class`** 다.

가장 단순한 예로 시작하자.

```csharp
static async Task PrintAndWait (TimeSpan delay)
{
    Console.WriteLine ("Before first delay");
    await Task.Delay (delay);
    Console.WriteLine ("Between delays");
    await Task.Delay (delay);
    Console.WriteLine ("After second delay");
}
```

특징이 셋이다. 매개변수가 하나 있고, `await`가 두 개 있고, `Task`를 반환하므로 결과값은 없다. 루프도 `try`도 없어 제어 흐름이 단순하다.

디컴파일 결과를 읽기 쉽게 다듬으면 다음과 같다. (컴파일러가 생성하는 이름 상당수는 유효한 C# 식별자가 아니므로 유효한 이름으로 바꿨다. `MoveNext`의 본문은 잠시 뒤로 미룬다.)

```csharp
// --- 스텁 메서드 ---
[AsyncStateMachine (typeof (PrintAndWaitStateMachine))]
[DebuggerStepThrough]
private static Task PrintAndWait (TimeSpan delay)
{
    var machine = new PrintAndWaitStateMachine
    {
        delay = delay,                                  // 매개변수를 필드로 복사
        builder = AsyncTaskMethodBuilder.Create(),      // 빌더 생성
        state = -1                                      // 초기 상태
    };
    machine.builder.Start (ref machine);                // 첫 걸음(MoveNext 1회)
    return machine.builder.Task;                        // 태스크 반환
}

// --- 상태 기계 타입 ---
[CompilerGenerated]
private struct PrintAndWaitStateMachine : IAsyncStateMachine
{
    public int state;                       // 어디서 재개할지
    public AsyncTaskMethodBuilder builder;  // 비동기 인프라와의 연결점
    private TaskAwaiter awaiter;            // 재개 시 결과를 꺼낼 awaiter
    public TimeSpan delay;                  // 원래 메서드의 매개변수

    void IAsyncStateMachine.MoveNext() { /* 본문은 47.7 뒷부분 */ }

    [DebuggerHidden]
    void IAsyncStateMachine.SetStateMachine (IAsyncStateMachine stateMachine)
    {
        this.builder.SetStateMachine (stateMachine);
    }
}
```

`[AsyncStateMachine]` 특성은 도구용이다. 리플렉션으로 "이 메서드는 `async`였고, 이 타입이 그 상태 기계다"를 알려 준다. 실행에는 영향이 없다.

> **⚠️ 컴파일러가 붙이는 실제 이름과 빌드 구성**
>
> 실제 Roslyn이 만드는 이름은 다음과 같은 모양이다.
>
> | 역할 | 실제 이름 |
> |---|---|
> | 상태 | `<>1__state` |
> | 빌더 | `<>t__builder` |
> | awaiter (타입별로 하나씩) | `<>u__1`, `<>u__2`, ... |
> | 승격된 지역 변수 | `<x>5__2` 같은 형태 |
> | 매개변수 | 원래 이름 그대로 |
> | 상태 기계 타입 | `<PrintAndWait>d__0` 같은 형태 |
>
> **이 이름들은 전부 구현 세부다.** 컴파일러 버전에 따라 달라질 수 있으니 이름에 의존하는 코드를 쓰지 마라.
>
> 더 중요한 차이가 하나 있다. **릴리스 빌드에서 상태 기계는 `struct`이지만 디버그 빌드에서는 `class`다.** 디버거 경험(특히 편집하며 계속하기)을 좋게 하려는 선택이다. 즉 **디버그 빌드에서는 47.8절의 "박싱 댄스"가 일어나지 않고 처음부터 힙에 있다.** 디버그 빌드로 할당을 측정하면 릴리스와 다른 숫자가 나온다. 이 장의 모든 디컴파일 예제는 **릴리스 빌드** 기준이다.

### 스텁 메서드가 하는 일

스텁 메서드는 짧지만 각 줄에 이유가 있다.

```csharp
var machine = new PrintAndWaitStateMachine
{
    delay = delay,
    builder = AsyncTaskMethodBuilder.Create(),
    state = -1
};
machine.builder.Start (ref machine);
return machine.builder.Task;
```

상태 기계는 **항상 세 가지 정보로 초기화된다.**

1. **매개변수** — 각각 상태 기계의 별도 필드로 복사된다.
2. **빌더** — `async` 메서드의 반환 타입에 따라 달라진다.
3. **초기 상태** — 항상 `-1`.

그다음 스텁은 상태 기계의 빌더에게 시작을 요청하는데, **상태 기계 자신을 참조로 넘긴다.** 이 `ref`가 중요하다. 상태 기계도 `AsyncTaskMethodBuilder`도 **가변 값 타입(mutable value type)** 이다. 값으로 넘기면 복사본이 만들어지고, `Start` 안에서 바꾼 상태가 반환 뒤에 보이지 않는다.

같은 이유로 `machine.builder`를 지역 변수로 빼면 안 된다.

```csharp
// 잘못된 리팩터링
var builder = machine.builder;
builder.Start (ref machine);
return builder.Task;        // machine.builder의 변화가 반영되지 않는다
```

`builder`는 `machine.builder`의 **복사본**이므로 `Start` 안의 변경이 서로에게 보이지 않는다. `machine.builder`가 프로퍼티가 아니라 **필드**여야 하는 이유도 이것이다. 프로퍼티였다면 접근할 때마다 복사본이 나온다.

> **📌 가변 값 타입과 공개 필드는 거의 항상 나쁜 생각이다**
>
> 위 함정은 "가변 값 타입은 피하라"는 일반 지침(16장)의 교과서적 사례다. 여기서 컴파일러가 그것을 감수하는 이유는 **할당을 0으로 만들기 위해서**다. 그리고 우리가 이 코드를 손으로 쓸 일이 없기 때문에 감수할 수 있다. 사람이 쓰는 코드에서 같은 선택을 하기 전에 두 번 생각하라.

`Start`는 **새 스레드를 만들지 않는다.** 하는 일은 약간의 정리 작업 뒤에 상태 기계의 `MoveNext()`를 호출하는 것뿐이고, 그 호출은 상태 기계가 **일시 정지해야 하거나 완료될 때까지** 실행된다. 다르게 말하면 **한 걸음(step)을 뗀다.** 어느 쪽이든 `MoveNext()`가 반환하면 `Start`도 반환하고, 스텁은 빌더에서 태스크를 꺼내 호출자에게 준다.

### 상태 기계의 필드

필드는 크게 다섯 부류다.

| 부류 | 개수 | 설명 |
|---|---|---|
| **상태** | 1 | `int`. 어디서 재개할지 |
| **빌더** | 1 | 반환 타입에 따라 결정 |
| **awaiter** | awaiter 타입 종류 수만큼 | 재사용된다 |
| **매개변수·지역 변수** | 필요한 것만 | 승격 규칙이 적용된다 |
| **임시 스택 변수** | 필요한 것만 | 타입별로 재사용된다 |

**상태 필드의 값 규약**은 이렇다.

| 값 | 의미 |
|---|---|
| `-1` | 시작 전 **또는** 현재 실행 중 (구분하지 않는다) |
| `-2` | 완료됨 (성공이든 실패든) |
| `0` 이상 | 특정 `await` 지점에서 일시 정지 중. 값이 곧 그 `await`의 번호 |

```text
        ┌──────────────┐
        │  시작 전 (-1) │
        └──────┬───────┘
               ↓ builder.Start()
        ┌──────────────┐  await 지점에서 미완료  ┌────────────────────┐
        │  실행 중 (-1) │ ─────────────────────→ │ 일시 정지 (0, 1, …) │
        └──────┬───────┘ ←───────────────────── └────────────────────┘
               │            연속이 MoveNext 호출
               ↓ SetResult / SetException
        ┌──────────────┐
        │   완료 (-2)   │
        └──────────────┘
```

> **📌 왜 "시작 전"과 "실행 중"을 구분하지 않는가**
>
> 정상 동작에서 `MoveNext()`는 **시작하거나 재개하기 위해서만** 호출되기 때문이다. 실행 중이거나 완료된 상태에서 `MoveNext()`가 불릴 일이 없다. (고의로 깨진 awaiter를 만들거나 리플렉션을 쓰면 강제할 수는 있다.) 완료 상태에 `-2`라는 값을 두긴 하지만 **상태 기계는 그 값을 검사하지 않는다.** 진단용 표지에 가깝다.

**awaiter 필드는 타입별로 하나씩만** 만들어진다. 어떤 상태 기계든 한 번에 하나의 값만 `await` 할 수 있으므로 동시에 유효한 awaiter는 하나뿐이기 때문이다. `Task<int>` 두 개, `Task<string>` 하나, 논제네릭 `Task` 세 개를 `await` 하는 메서드라면 필드는 세 개다 — `TaskAwaiter<int>`, `TaskAwaiter<string>`, `TaskAwaiter`.

(직접 `GetAwaiter()`를 호출해서 결과를 지역 변수에 담으면 그건 평범한 지역 변수로 취급된다. 여기서 말하는 것은 `await` 표현식의 산물로 생기는 awaiter다.)

**지역 변수는 재사용되지 않는 대신 아예 생략될 수 있다.** 규칙은 하나다.

> **`await`를 가로지르는(cross) 지역 변수만 필드로 승격된다.** 두 `await` 사이에서만 쓰이는 지역은 `MoveNext()`의 진짜 지역 변수로 남는다.

```csharp
public async Task LocalVariableDemoAsync()
{
    int x = DateTime.UtcNow.Second;    // await 앞에서 대입
    int y = DateTime.UtcNow.Second;
    Console.WriteLine (y);             // y는 await 앞에서만 쓰인다
    await Task.Delay (100);
    Console.WriteLine (x);             // x는 await 뒤에서도 쓰인다
}
```

`x`는 상태 기계가 일시 정지한 동안 값을 보존해야 하므로 **필드가 된다.** `y`는 코드가 실행되는 동안만 필요하므로 **스택의 지역 변수로 남는다.**

> **💡 이 규칙은 메모리 수명에 직접 영향을 준다**
>
> `await`를 가로지르는 지역은 필드로 승격되고, 상태 기계가 힙으로 올라가면 그 필드도 힙에 산다. **상태 기계가 살아 있는 동안 그 객체들은 GC 대상이 되지 않는다.**
>
> 큰 배열이나 스트림 같은 것을 `await` 앞에서 잡아 두고 뒤에서 다시 쓰면, 그 사이의 긴 I/O 대기 동안 계속 살아 있게 된다. 필요 없어졌다면 명시적으로 `null`을 대입하거나, 스코프를 좁혀 `await`를 가로지르지 않게 만드는 것이 실질적인 최적화가 된다(69장).

**임시 스택 변수**는 `await` 표현식이 더 큰 표현식의 일부일 때 중간값을 기억하기 위해 생긴다.

```csharp
public async Task TemporaryStackDemoAsync()
{
    Task<int> task = Task.FromResult (10);
    DateTime now = DateTime.UtcNow;
    int result = now.Second + now.Hour * await task;
}
```

C#의 피연산자 평가 규칙은 `async` 메서드 안이라고 달라지지 않는다. `now.Second`와 `now.Hour`는 **태스크를 `await` 하기 전에** 평가돼야 하고, 그 결과를 산술 연산이 끝날 때까지 기억해야 한다. 그러니 필드가 필요하다. 컴파일러가 다음처럼 재작성한다고 생각하면 된다.

```csharp
Task<int> task = Task.FromResult (10);
DateTime now = DateTime.UtcNow;
int tmp1 = now.Second;
int tmp2 = now.Hour;
int result = tmp1 + tmp2 * await task;
```

그리고 `tmp1`, `tmp2`가 필드가 된다. 지역 변수와 달리 **임시 스택 변수는 타입이 같으면 재사용된다.**

(`Task.FromResult`가 항상 완료된 태스크를 돌려준다는 사실을 우리는 알지만 **컴파일러는 모른다.** 완료되지 않았을 경우에 대비해 일시 정지·재개할 수 있는 상태 기계를 만들어야 한다.)

### 빌더 — 인프라와의 연결점

`AsyncTaskMethodBuilder`라는 이름이 리플렉션이나 IL 생성 같은 것을 떠올리게 하지만, **메서드를 만드는 물건이 아니다.** 생성된 코드가 성공과 실패를 전파하고, 대기를 처리하고, 태스크를 만들기 위해 쓰는 헬퍼다. "빌더"보다 "헬퍼"라고 생각하는 편이 정확하다.

빌더가 제공해야 하는 멤버들은 이렇다.

| 멤버 | 언제 호출되는가 | 역할 |
|---|---|---|
| `static Create()` | 스텁에서 1회 | 빌더 인스턴스를 만든다 |
| `Start<TSM>(ref TSM)` | 스텁에서 1회 | 첫 `MoveNext()`를 호출한다 |
| `Task` 프로퍼티 | 스텁에서 1회 | 호출자에게 돌려줄 태스크 |
| `AwaitOnCompleted<TA, TSM>(ref TA, ref TSM)` | `await`마다 (느린 경로) | 연속 등록. 컨텍스트를 흘린다 |
| `AwaitUnsafeOnCompleted<TA, TSM>(ref TA, ref TSM)` | `await`마다 (느린 경로) | 연속 등록. awaiter가 안 흘린다고 가정 |
| `SetStateMachine(IAsyncStateMachine)` | 최초 1회 | 힙에 올라간 상태 기계를 빌더에게 알린다(47.8절) |
| `SetResult()` / `SetResult(T)` | 완료 시 1회 | 태스크를 성공으로 완료시킨다 |
| `SetException(Exception)` | 실패 시 1회 | 태스크를 실패(또는 취소)로 완료시킨다 |

`SetResult`와 `SetException`은 **둘 중 하나만, 한 번만** 호출된다.

### `MoveNext()` — 실물

이제 앞의 `PrintAndWait`가 만드는 `MoveNext()`를 보자. `goto`와 레이블이 잔뜩 나오는데, 손으로 쓰는 C#에서는 거의 볼 일 없는 모양이다.

```csharp
void IAsyncStateMachine.MoveNext()
{
    int num = this.state;
    try
    {
        TaskAwaiter awaiter1;
        switch (num)
        {
            default: goto MethodStart;
            case 0:  goto FirstAwaitContinuation;
            case 1:  goto SecondAwaitContinuation;
        }

    MethodStart:
        Console.WriteLine ("Before first delay");
        awaiter1 = Task.Delay (this.delay).GetAwaiter();
        if (awaiter1.IsCompleted)
        {
            goto GetFirstAwaitResult;              // 빠른 경로
        }
        this.state = num = 0;                      // 느린 경로
        this.awaiter = awaiter1;
        this.builder.AwaitUnsafeOnCompleted (ref awaiter1, ref this);
        return;                                    // ★ 여기서 반환 ★

    FirstAwaitContinuation:
        awaiter1 = this.awaiter;
        this.awaiter = default (TaskAwaiter);      // GC를 돕는다
        this.state = num = -1;

    GetFirstAwaitResult:
        awaiter1.GetResult();
        Console.WriteLine ("Between delays");

        TaskAwaiter awaiter2 = Task.Delay (this.delay).GetAwaiter();
        if (awaiter2.IsCompleted)
        {
            goto GetSecondAwaitResult;
        }
        this.state = num = 1;
        this.awaiter = awaiter2;
        this.builder.AwaitUnsafeOnCompleted (ref awaiter2, ref this);
        return;

    SecondAwaitContinuation:
        awaiter2 = this.awaiter;
        this.awaiter = default (TaskAwaiter);
        this.state = num = -1;

    GetSecondAwaitResult:
        awaiter2.GetResult();
        Console.WriteLine ("After second delay");
    }
    catch (Exception exception)
    {
        this.state = -2;
        this.builder.SetException (exception);     // 예외를 태스크로
        return;
    }
    this.state = -2;
    this.builder.SetResult();                      // 성공을 태스크로
}
```

구조를 정리하면 이렇다.

1. **큰 `try`/`catch`가 원래 메서드의 코드 전체를 감싼다.** 그 안에서 어떤 방식으로든 예외가 던져지면 — 실패한 연산을 `await` 했든, 동기 메서드가 던졌든, 직접 `throw` 했든 — 잡혀서 빌더로 전파된다. `MoveNext()` 자체가 예외로 끝나는 것은 특수한 예외(`ThreadAbortException`, `StackOverflowException` 등)뿐이다.
2. **`try` 블록의 시작은 항상 `switch` 디스패치다.** 상태 값으로 올바른 코드 지점으로 점프한다. 상태가 음수가 아니면 `await` 뒤에서 재개하는 것이고, 아니면 처음 실행하는 것으로 간주한다.
3. **각 `await`마다 레이블이 두 개** 생긴다. 하나는 느린 경로 코드를 건너뛰기 위한 것(`GetXxxAwaitResult`), 하나는 연속이 돌아올 지점(`XxxAwaitContinuation`)이다.
4. **`try`/`catch` 바깥 아래쪽에서 완료가 전파된다.**

> **⚠️ 상태 기계의 `return`과 원래 코드의 `return`은 다른 물건이다**
>
> 상태 기계 안의 `return` 문은 **연속을 등록한 뒤 일시 정지할 때** 쓰인다. 반면 원래 코드에 있던 `return` 문은 상태 기계에서 **`try`/`catch` 아래쪽으로 떨어져서 빌더로 완료를 전파하는 코드**가 된다. 디컴파일 결과를 읽을 때 이 둘을 헷갈리면 흐름을 잘못 따라가게 된다.

`num` 지역 변수의 존재도 눈에 띈다. 항상 `state` 필드와 같은 값이 대입되지만, 읽을 때는 필드가 아니라 이 지역을 읽는다. 순수한 최적화다. `num`을 볼 때마다 `this.state`라고 생각해도 무방하다.

> **📌 `MoveNext()`의 반환 타입은 `void`다**
>
> 태스크를 반환하는 것은 스텁 메서드뿐이다. 스텁은 `builder.Start()`가 `MoveNext()`를 호출해 첫 걸음을 뗀 **뒤에** 빌더에서 태스크를 꺼낸다. 나머지 `MoveNext()` 호출은 전부 일시 정지 상태에서 재개하기 위한 인프라 호출이고, 그쪽에는 태스크가 필요 없다.

### 하나의 `await`가 만드는 코드

`await` 하나가 실제로 무엇을 하는지 단계별로 세어 보자. 피연산자는 이미 평가됐다고 하자.

1. `GetAwaiter()`를 호출해 awaitable에서 awaiter를 얻고 **스택에** 둔다.
2. awaiter가 이미 완료됐는지 확인한다. 완료됐으면 9번으로 건너뛴다 — **빠른 경로.**
3. 느린 경로다. `state` 필드에 어디까지 왔는지 기록한다.
4. awaiter를 필드에 기억한다.
5. awaiter에 연속을 등록한다. 연속이 실행될 때 올바른 상태로 돌아오도록 하고, 필요하면 박싱 댄스(47.8절)를 한다.
6. `MoveNext()`에서 반환한다. 처음 일시 정지하는 것이면 원래 호출자에게, 아니면 연속을 호출한 쪽으로 돌아간다.
7. 연속이 발화하면 상태를 실행 중(`-1`)으로 되돌린다.
8. awaiter를 필드에서 스택으로 복사하고 **필드를 비운다.** GC를 돕기 위해서다. 이제 빠른 경로와 합류할 준비가 됐다.
9. awaiter에서 결과를 꺼낸다. 어느 경로로 왔든 awaiter는 스택에 있다. **결과값이 없어도 `GetResult()`를 반드시 호출해야 한다.** awaiter가 오류를 전파할 기회이기 때문이다.
10. 결과값이 있으면 그것을 쓰면서 나머지 코드를 계속 실행한다.

앞의 디컴파일 코드가 이 10단계를 정확히 따른다.

원래 코드 한 줄이었던 것을 기억하자.

```csharp
await Task.Delay (delay);
```

이 한 줄이 열여섯 줄가량으로 늘어났다.

> **⚠️ 코드 팽창은 인라이닝을 막는다**
>
> 대부분의 경우 이 코드를 볼 일이 없으니 문제가 아니다. 다만 부작용이 하나 있다. **코드 팽창 때문에 작은 `async` 메서드조차 JIT가 인라이닝하지 못한다.** `ValueTask<T>`를 써서 할당을 없앤 메서드라도 그렇다.
>
> `async` 메서드 호출은 인라이닝되지 않는다고 가정하고 설계해야 한다. 나노초 단위가 문제 되는 극단적 핫 경로에서 `async` 메서드를 깊게 쌓지 않는 이유가 여기에 있다(51.7절).

---
## 47.8 상태 기계 박싱 댄스와 `SetStateMachine`

### 문제 설정

앞 절에서 확인한 두 사실을 나란히 놓으면 모순처럼 보인다.

1. **릴리스 빌드에서 상태 기계는 `struct`다.** 스텁 메서드의 지역 변수로, 즉 **스택에** 만들어진다.
2. **상태 기계는 일시 정지했다가 나중에 재개된다.** 그 "나중"은 스텁 메서드가 이미 반환한 뒤이고, 심지어 다른 스레드일 수도 있다.

스택에 있는 값이 스택 프레임이 사라진 뒤에도 살아남을 수는 없다. 그러니 **상태 기계가 어느 시점엔가는 힙으로 옮겨져야 한다.**

컴파일러와 런타임이 택한 답이 **"필요할 때만, 정확히 한 번"** 이다.

### 박싱 댄스

상태 기계가 첫 걸음을 뗄 때 그것은 스텁 메서드의 지역 변수, 즉 스택 위에 있다. **일시 정지해야 하는 상황이 되면** 자기 자신을 힙으로 박싱해서 그 정보가 재개 시점에 그대로 남아 있게 만든다.

박싱한 뒤, **박싱된 값에 대해 `SetStateMachine`을 호출하되 인수로도 그 박싱된 값을 넘긴다.** 인프라 깊은 곳에 대략 다음과 같은 코드가 있다고 생각하면 된다.

```csharp
void BoxAndRemember<TStateMachine> (ref TStateMachine stateMachine)
    where TStateMachine : IAsyncStateMachine
{
    IAsyncStateMachine boxed = stateMachine;   // ← 여기서 박싱
    boxed.SetStateMachine (boxed);             // ← 박싱된 것에게 자기 자신을 알려 준다
}
```

정확히 이렇지는 않지만 핵심은 담고 있다. 그리고 `SetStateMachine`의 구현은 항상 같다.

```csharp
[DebuggerHidden]
void IAsyncStateMachine.SetStateMachine (IAsyncStateMachine stateMachine)
{
    this.builder.SetStateMachine (stateMachine);
}
```

이 구현이 하는 일은 **`AsyncTaskMethodBuilder`가 자기가 속한 상태 기계의 유일한 박싱본에 대한 참조를 갖게 만드는 것**이다.

이 춤이 왜 이렇게 복잡해야 하는가? 박싱의 성질 때문이다.

- **박싱한 뒤에만 호출할 수 있다.** 박싱하기 전에는 박싱본에 대한 참조가 없다.
- **박싱본에 대해 호출해야 한다.** 박싱한 뒤에 원본(스택의 값)에 대해 호출하면 박싱본에는 아무 영향이 없다. `AsyncTaskMethodBuilder` 자체가 값 타입이라 박싱될 때 함께 복사됐기 때문이다.

결과적으로 **연속 델리게이트가 awaiter에게 넘겨질 때, 그 연속은 반드시 같은 박싱 인스턴스의 `MoveNext()`를 호출하게 된다.**

> **📌 이 춤이 사는 곳은 `AwaitOnCompleted` / `AwaitUnsafeOnCompleted`다**
>
> 생성된 코드에서 박싱 댄스를 직접 볼 수는 없다. `builder.AwaitUnsafeOnCompleted (ref awaiter, ref this)` 한 줄이 그 전부다. 그 안에서 빌더가 (필요하면) 박싱하고, `SetStateMachine`을 호출하고, 연속을 등록한다.
>
> 그리고 **상태 기계당 딱 한 번만** 일어난다. 두 번째 `await`에서 일시 정지할 때는 이미 힙에 있으므로 다시 박싱하지 않는다.

### 결과 — 동기 완료 경로의 할당은 0이다

이 설계의 목적은 하나다.

> **필요 없으면 상태 기계를 아예 박싱하지 않고, 필요하면 정확히 한 번만 박싱한다.**

이 성질이 실무에서 갖는 의미가 크다. 다음 메서드를 보자.

```csharp
public async Task<string> ReadFileAsync (string filename)
{
    if (!File.Exists (filename))
        return string.Empty;                     // ← await 없이 즉시 반환
    return await File.ReadAllTextAsync (filename);
}
```

파일이 없으면 `await`에 한 번도 도달하지 않는다. 상태 기계는 스택 위에서 태어나 스택 위에서 죽는다. **상태 기계에 의한 힙 할당은 0이다.**

여기서 상태 기계를 `struct`로 만든 선택이 빛난다. 클래스로 만들었다면 모든 호출이 반드시 힙 할당 하나를 냈을 것이다.

> **⚠️ 그래도 `Task` 할당은 남는다**
>
> 상태 기계가 박싱되지 않았어도 **`SetResult`가 `Task<string>` 객체를 할당할 수 있다.** `AsyncTaskMethodBuilder<TResult>.SetResult`의 개략적 구현은 이렇다.
>
> ```csharp
> public void SetResult (TResult result)
> {
>     if (this.m_task == null)
>     {
>         this.m_task = Task.FromResult<TResult> (result);
>         return;
>     }
>     // ...
> }
> ```
>
> 아직 태스크를 만든 적이 없다면(= 동기 완료했다면) `Task.FromResult`로 만든다. 그리고 `Task.FromResult`는 성능을 위해 일부 값에 대해 캐시된 태스크를 돌려주지만, 전부는 아니다.
>
> | 결과 타입/값 | 동작 |
> |---|---|
> | `Task<bool>` | `true`/`false` 각각에 대한 캐시 객체 |
> | `Task<int>` | `-1`부터 `9`까지는 캐시. 그 밖의 값은 새로 만든다 |
> | 여러 수치 `Task<T>` | 값 `0`에 대해 캐시 객체 |
> | `null` 결과 | 전용 캐시 태스크 |
> | 그 밖 | **새 `Task` 객체를 만든다** |
>
> (이 캐시 정책은 구현 세부이며 런타임 버전에 따라 달라질 수 있다.)
>
> 즉 **동기 완료가 흔한 메서드가 `Task<T>`를 반환하면 상태 기계 할당은 피해도 `Task` 할당은 남는다.** 바로 이 구멍을 메우려고 나온 것이 `ValueTask<T>`다(47.13절).
>
> 논제네릭 `Task`는 사정이 낫다. 예외 없이 동기 완료한 `async Task` 메서드에 대해 인프라가 **캐시된 완료 태스크 하나**를 재사용한다. 예외로 완료했다면 `Task` 하나 할당하는 비용은 예외 처리 비용에 묻힌다.

### .NET Core 2.1 이후 — 박싱이 아니라 필드다

여기서 한 층 더 내려가자. 지금까지 "박싱"이라고 불렀지만, **.NET Core 2.1부터 실제 구현은 진짜 박싱이 아니다.**

`object`로 박싱하면 상태 기계에 접근할 때마다 언박싱이 필요하고, 인터페이스 디스패치가 붙는다. 그래서 런타임은 대신 **제네릭 클래스** 하나를 쓴다. 개념적으로 이런 모양이다.

```csharp
// 개념적 스케치 — 실제 타입 이름과 구조는 구현 세부다
private class AsyncStateMachineBox<TResult, TStateMachine> : Task<TResult>, IAsyncStateMachineBox
    where TStateMachine : IAsyncStateMachine
{
    public TStateMachine StateMachine;          // ← 강타입 필드. 박싱이 아니다
    public Action MoveNextAction;               // ← 캐시된 연속 델리게이트
    // ...
}
```

이 설계가 주는 이득이 셋이다.

1. **강타입 필드**이므로 언박싱도, 인터페이스 디스패치도 없다.
2. **이 상자 자체가 `Task<TResult>`를 상속한다.** 그래서 "상태 기계 상자 + 태스크 객체" 두 개가 아니라 **하나**만 할당된다.
3. **연속 델리게이트를 필드에 캐시한다.** `await`마다 델리게이트를 새로 만들지 않는다.

동작 결과는 앞서 설명한 것과 같다 — 필요할 때만, 한 번만 힙으로 올라간다. **다만 실제 할당량을 셀 때는 "상태 기계 + 태스크 = 2개"가 아니라 "상자 하나"라는 사실이 중요하다.**

> **💡 "박싱 댄스"라는 이름은 여전히 유용하다**
>
> 구현이 진짜 박싱을 쓰지 않게 되었어도 `SetStateMachine`이라는 메서드는 그대로 남아 있고, 커스텀 태스크 타입을 만들면 그 빌더가 여전히 이 계약을 지켜야 한다. 개념 모델로서의 "박싱 댄스"는 유효하다. 다만 **성능을 측정할 때는 구현이 최적화됐다는 사실을 반영하라.**

> **📌 왜 이 코드가 존재하는지 모르겠다면 그래도 괜찮다**
>
> 이 절의 내용을 완전히 이해하지 못해도 실무에 지장이 없다. `SetStateMachine`은 저수준 디버깅에서 콜 스택에 나타났을 때 "아, 이건 상태 기계를 힙으로 올리는 인프라구나"라고 알아보면 충분하다. 다만 두 가지는 기억해 둘 값어치가 있다.
>
> - **동기 완료 경로에서 상태 기계는 힙에 올라가지 않는다.**
> - **비동기 완료가 한 번이라도 일어나면 힙 객체가 하나 생기고, 그 안에 `await`를 가로지르는 모든 지역 변수가 산다.**

---

## 47.9 `await` 표현식의 평가 순서와 완료 경로 최적화

### 무엇이 언제 평가되는가

`await`는 겉보기에 표현식 전체의 의미를 바꾸는 것처럼 보인다.

```csharp
string pageText = await new HttpClient().GetStringAsync (url);
```

실제로는 **`await`는 항상 값 하나에만 적용된다.** 위 줄은 다음과 같다.

```csharp
Task<string> task = new HttpClient().GetStringAsync (url);
string pageText = await task;
```

복잡한 표현식도 마찬가지다. 시급과 근무 시간을 각각 비동기로 조회해 곱하는 코드를 보자.

```csharp
AddPayment (await employee.GetHourlyRateAsync() *
            await timeSheet.GetHoursWorkedAsync (employee.Id));
```

**C#의 표현식 평가 규칙은 `async` 메서드 안이라고 달라지지 않는다.** `*` 연산자의 왼쪽 피연산자가 완전히 평가된 뒤 오른쪽 피연산자가 평가된다. 따라서 위 문장은 다음으로 전개된다.

```csharp
Task<decimal> hourlyRateTask = employee.GetHourlyRateAsync();
decimal hourlyRate = await hourlyRateTask;
Task<int> hoursWorkedTask = timeSheet.GetHoursWorkedAsync (employee.Id);
int hoursWorked = await hoursWorkedTask;
AddPayment (hourlyRate * hoursWorked);
```

**두 번째 태스크는 첫 번째 `await`가 끝난 뒤에야 시작된다.** 두 연산이 서로 독립인데도 직렬화됐다.

이 관찰이 실용적 함의를 낳는다.

```csharp
// 병렬로 진행된다
Task<decimal> hourlyRateTask = employee.GetHourlyRateAsync();
Task<int> hoursWorkedTask = timeSheet.GetHoursWorkedAsync (employee.Id);
AddPayment (await hourlyRateTask * await hoursWorkedTask);
```

**두 태스크를 먼저 시작하고 나중에 둘을 `await` 한다.** 이러면 두 요청이 동시에 진행 중일 수 있다. 스레드는 하나도 더 쓰지 않는다.

> **💡 독립적인 비동기 작업은 시작을 먼저 모아라**
>
> 규칙은 단순하다. **호출과 `await`를 붙여 쓰면 직렬이고, 호출들을 모은 뒤 `await`들을 모으면 병렬이다.**
>
> 다만 의존성을 놓치지 마라. 인증을 확인하는 태스크와 그 사용자를 대신해 동작하는 태스크가 있다면, 병렬로 쓸 수 있는 코드라도 인증을 먼저 기다려야 한다. `async`/`await`가 이 판단을 대신해 주지는 않는다.
>
> 실패 처리에도 차이가 있다. `hourlyRateTask`가 실패하면 `hoursWorkedTask`의 결과(와 그 실패)를 관찰하지 못한다. 모든 실패를 로깅해야 한다면 `Task.WhenAll`을 쓰는 편이 낫다(46.9절, 46.11절).

### 대입 대상의 평가 시점

`await`가 대입문의 오른쪽에 있고 왼쪽이 복합 표현식일 때 평가 순서가 문제가 된다.

```csharp
a[i] = await F();
```

C#의 대입 평가 규칙에 따라 **왼쪽의 부분식이 먼저 평가된다.** 즉 `a`와 `i`가 **`F()`를 호출하기 전에** 평가되고, 그 값들이 임시 스택 변수로 승격돼 상태 기계 필드에 저장된다. `await`에서 재개한 뒤에는 그 저장된 `a`와 `i`를 써서 인덱서에 대입한다.

```csharp
// 컴파일러가 하는 일에 가까운 재작성
var tmpArray = a;         // ← await 전에 평가, 필드로 승격
var tmpIndex = i;         // ← await 전에 평가, 필드로 승격
var tmpValue = await F();
tmpArray[tmpIndex] = tmpValue;
```

> **⚠️ `await` 뒤에 `i`가 바뀌어도 대입 위치는 바뀌지 않는다**
>
> 다음 코드를 보자.
>
> ```csharp
> int i = 0;
> a[i] = await F();      // ← 여기서 i는 0으로 이미 확정됐다
> ```
>
> `F()`가 진행되는 동안 다른 코드가 이 메서드의 `i`를 바꿀 수는 없지만(지역 변수이므로), 같은 문장 안에서 `i`가 부수 효과를 갖는 표현식이라면 이야기가 다르다.
>
> ```csharp
> a[GetIndex()] = await F();     // GetIndex()는 F() 호출 전에 실행된다
> ```
>
> 동기 코드와 순서가 같으므로 놀랄 일은 아니지만, "`await`가 걸려 있으니 뒤에 평가되겠지"라는 직관은 틀렸다. **`await`는 평가 순서를 바꾸지 않는다. 순서를 유지하기 위해 중간값을 필드로 옮길 뿐이다.**

같은 원리가 다음에도 적용된다.

| 코드 | `await` 전에 평가되는 것 |
|---|---|
| `a[i] = await F();` | `a`, `i` |
| `obj.Prop = await F();` | `obj` |
| `Method (x, await F(), y)` | `x` (그리고 `Method`의 수신자). `y`는 `await` **뒤에** |
| `d[await F()] = await G();` | `d`. 그다음 `F()` `await`, 그다음 `G()` `await` |
| `total += await F();` | `total`의 **읽기**가 `await` 전에 일어난다 |

마지막 행이 특히 중요하다.

> **⚠️ 복합 대입 연산자와 `await`**
>
> ```csharp
> _counter += await GetIncrementAsync();
> ```
>
> 이 코드는 **`_counter`를 먼저 읽고**, `await` 한 뒤, 읽어 둔 값에 결과를 더해 다시 쓴다. `await` 구간 동안 다른 코드가 `_counter`를 바꿨다면 **그 변경이 덮어써진다.** 필드나 정적 변수에 이 패턴을 쓰면 조용한 데이터 유실이 된다.
>
> 안전한 형태는 이렇다.
>
> ```csharp
> int increment = await GetIncrementAsync();
> _counter += increment;             // 읽기와 쓰기가 await를 가로지르지 않는다
> ```
>
> 진짜 동시 접근이 있다면 이것으로도 부족하다. `Interlocked.Add`가 필요하다(48.4절).

### 동기 완료 최적화

`async` 메서드는 `await` 하기 **전에** 반환할 수 있다. 웹 페이지 다운로드를 캐시하는 메서드를 보자.

```csharp
static Dictionary<string, string> _cache = new Dictionary<string, string>();

async Task<string> GetWebPageAsync (string uri)
{
    string html;
    if (_cache.TryGetValue (uri, out html)) return html;      // await 없이 반환
    return _cache[uri] = await new HttpClient().GetStringAsync (uri);
}
```

캐시에 이미 있으면 아무것도 `await` 하지 않고 호출자에게 돌아가며, **이미 신호된 태스크**를 반환한다. 이것을 **동기 완료(synchronous completion)** 라고 부른다.

동기적으로 완료된 태스크를 `await` 하면 **호출자에게 돌아갔다가 연속으로 되돌아오지 않는다.** 곧바로 다음 문장으로 간다. 컴파일러가 awaiter의 `IsCompleted` 프로퍼티를 확인하는 방식으로 이 최적화를 구현한다.

```csharp
// 다음 한 줄이
Console.WriteLine (await GetWebPageAsync ("http://example.com"));

// 대략 이렇게 낮춰진다
var awaiter = GetWebPageAsync ("http://example.com").GetAwaiter();
if (awaiter.IsCompleted)
    Console.WriteLine (awaiter.GetResult());               // 연속 없음
else
    awaiter.OnCompleted (() => Console.WriteLine (awaiter.GetResult()));
```

핵심은 **`IsCompleted`가 `true`면 `OnCompleted`를 아예 호출하지 않는다**는 것이다. 연속 델리게이트도, 컨텍스트 캡처도, 상태 기계 박싱도 일어나지 않는다.

비용 차이는 크다.

- **동기 완료된 태스크를 `await`** — 아주 작은 오버헤드다. 상태 기계 디스패치와 `IsCompleted` 확인뿐이며, 2019년경 PC 기준으로 20나노초 수준이다.
- **스레드 풀로 되튀기** — 컨텍스트 스위치 비용이 붙는다. 1~2마이크로초 수준.
- **UI 메시지 루프로 되튀기** — 위의 최소 10배 이상이다. 메시지 큐를 왕복해야 하고, UI 스레드가 바쁘면 훨씬 길어진다.

(위 수치는 Nutshell이 제시한 참고값이며, 하드웨어와 런타임 버전에 따라 크게 달라진다.)

> **📌 `await`가 없는 `async` 메서드도 합법이다**
>
> ```csharp
> async Task<string> Foo() { return "abc"; }     // CS1998 경고
> ```
>
> 컴파일러가 경고를 내지만 유효한 코드다. **가상/추상 메서드를 재정의하는데 그 구현에는 비동기가 필요 없을 때** 쓸모가 있다. `MemoryStream`의 `ReadAsync`/`WriteAsync`가 그런 예다.
>
> 같은 결과를 얻는 다른 방법은 `async`를 빼고 이미 완료된 태스크를 직접 반환하는 것이다.
>
> ```csharp
> Task<string> Foo() { return Task.FromResult ("abc"); }   // 상태 기계 자체가 없다
> ```
>
> 후자가 낫다. **상태 기계를 아예 만들지 않으므로** 디스패치 오버헤드조차 사라진다.

### 태스크를 캐시하기

동기 완료가 잦다면 한 걸음 더 나갈 수 있다. **문자열을 캐시하는 대신 "퓨처"(`Task<string>`)를 캐시하는 것**이다.

```csharp
static Dictionary<string, Task<string>> _cache = new Dictionary<string, Task<string>>();

Task<string> GetWebPageAsync (string uri)
{
    if (_cache.TryGetValue (uri, out var downloadTask)) return downloadTask;
    return _cache[uri] = new HttpClient().GetStringAsync (uri);
}
```

(`async`를 붙이지 않은 것에 주목하라. 얻은 태스크를 그대로 반환하므로 상태 기계가 필요 없다.)

이 버전의 이점이 둘이다.

1. **같은 URI로 여러 번 호출해도 같은 `Task<string>` 객체가 돌아온다.** GC 부하가 줄어든다.
2. **진행 중인 요청이 있으면 새 요청을 개시하지 않고 그 결과를 함께 기다린다.** 첫 버전에서는 같은 URI에 대한 동시 호출이 중복 다운로드를 일으켰다.

그리고 태스크가 이미 완료됐다면, 방금 본 최적화 덕분에 그것을 `await` 하는 비용이 아주 싸다.

동기화 컨텍스트의 보호 없이도 스레드 안전하게 만들려면 메서드 본문 전체를 잠그면 된다.

```csharp
lock (_cache)
{
    if (_cache.TryGetValue (uri, out var downloadTask))
        return downloadTask;
    return _cache[uri] = new HttpClient().GetStringAsync (uri);
}
```

**페이지를 다운로드하는 동안 잠그는 것이 아니라** 캐시를 확인하고 필요하면 태스크를 시작해 캐시에 넣는 짧은 구간만 잠그기 때문에 동시성을 해치지 않는다. `await`가 `lock` 안에 없다는 점도 확인하라.

> **💡 이 패턴에는 이름이 있다**
>
> "태스크를 캐시한다"는 아이디어는 흔히 **비동기 지연 초기화(async lazy)** 라고 불린다. `Lazy<Task<T>>` 또는 위처럼 `ConcurrentDictionary<TKey, Task<TValue>>`로 구현한다. 실패한 태스크가 캐시에 남아 계속 실패를 되돌려 주는 문제가 있으므로, 실패 시 항목을 제거하는 처리를 함께 설계해야 한다.

---

## 47.10 루프 / `try-finally` 안의 `await`가 상태 기계에 미치는 영향

### `await` 사이의 제어 흐름은 공짜다

먼저 복잡해지지 **않는** 경우를 확인하자.

```csharp
static async Task PrintAndWaitWithSimpleLoop (TimeSpan delay)
{
    Console.WriteLine ("Before first delay");
    await Task.Delay (delay);
    for (int i = 0; i < 3; i++)
    {
        Console.WriteLine ("Between delays");
    }
    await Task.Delay (delay);
    Console.WriteLine ("After second delay");
}
```

디컴파일 결과는 47.7절의 것과 **거의 같다.** 달라진 부분은 이것뿐이다.

```csharp
GetFirstAwaitResult:
    awaiter1.GetResult();
    for (int i = 0; i < 3; i++)          // ← 그냥 루프다
    {
        Console.WriteLine ("Between delays");
    }
    TaskAwaiter awaiter2 = Task.Delay (this.delay).GetAwaiter();
```

**추가 필드도, 추가 상태도 없다.** 이유는 명확하다. 이 루프에는 바깥에서 안으로 뛰어들어 갈 일도 없고, 안에서 실행을 멈추고 밖으로 나올 일도 없다. `i`는 `await`를 가로지르지 않으므로 필드로 승격되지도 않는다.

**복잡해지는 것은 `await`가 제어 구조 안으로 들어갈 때다.**

### 루프 안의 `await`

```csharp
static async Task AwaitInLoop (TimeSpan delay)
{
    Console.WriteLine ("Before loop");
    for (int i = 0; i < 3; i++)
    {
        Console.WriteLine ("Before await in loop");
        await Task.Delay (delay);
        Console.WriteLine ("After await in loop");
    }
    Console.WriteLine ("After loop delay");
}
```

이제 `i`가 `await`를 가로지르므로 **필드로 승격된다.** 그리고 더 재미있는 문제가 생긴다. 상태 기계가 `Task.Delay`에서 재개될 때 **원래 루프의 한가운데로 뛰어들어야 한다.**

C#에서는 그렇게 할 수 없다. `goto`가 자기 스코프 밖의 레이블을 지정하는 것을 언어가 금지한다.

컴파일러는 **`for` 루프를 `goto`만으로 다시 쓴다.** 스코프를 아예 만들지 않으면 한가운데로 뛰어들 수 있다.

```csharp
switch (num)
{
    default: goto MethodStart;
    case 0:  goto AwaitContinuation;
}

MethodStart:
    Console.WriteLine ("Before loop");
    this.i = 0;                          // for 루프 초기화자
    goto ForLoopCondition;               // 조건 확인으로 바로 점프

ForLoopBody:
    Console.WriteLine ("Before await in loop");
    TaskAwaiter awaiter = Task.Delay (this.delay).GetAwaiter();
    if (awaiter.IsCompleted)
    {
        goto GetAwaitResult;
    }
    this.state = num = 0;
    this.awaiter = awaiter;
    this.builder.AwaitUnsafeOnCompleted (ref awaiter, ref this);
    return;

AwaitContinuation:                       // ← 재개 시 여기로 점프. 루프 "안"이다
    awaiter = this.awaiter;
    this.awaiter = default (TaskAwaiter);
    this.state = num = -1;

GetAwaitResult:
    awaiter.GetResult();
    Console.WriteLine ("After await in loop");
    this.i++;                            // for 루프 반복자

ForLoopCondition:
    if (this.i < 3)
    {
        goto ForLoopBody;                // 조건이 참이면 본문으로
    }
    Console.WriteLine ("After loop delay");
```

세 가지를 배울 수 있다.

1. **컴파일러는 `async` 메서드를 "`async`/`await` 없는 등가 C#"으로 바꾸지 않는다.** 적절한 IL을 내면 된다. 어떤 지점에서는 C#의 규칙이 IL의 규칙보다 엄격하다.
2. **디컴파일러가 무효한 C#을 만들어 낼 수 있다.** 디컴파일러가 관용적 C#을 복원하려 애쓰다가 "레이블을 담은 `while` 루프와 그 안으로 뛰어드는 바깥의 `goto`"를 내놓는 경우가 있다. 디컴파일러에게 "관용적 C#을 만들려고 애쓰지 말라"고 설정하면 유효한(대신 읽기 힘든) C#이 나온다. **IL도 함께 확인하는 습관이 필요하다.**
3. 상태 번호는 **`await`마다 하나씩** 붙는다. 루프 안에 `await`가 하나면 상태 번호도 하나다. 루프를 세 번 돌아도 `case 0` 하나를 세 번 쓴다.

> **📌 상태 번호는 몇 개인가**
>
> 규칙은 단순하다. **`await` 표현식의 개수 = 0 이상의 상태 번호 개수.** 루프 안에 있든 조건문 안에 있든, `await`가 코드에 몇 번 **쓰였는지**가 기준이지 몇 번 **실행되는지**가 아니다.
>
> 이 사실은 진단에 쓸모가 있다. 덤프에서 `<>1__state`가 `3`이라면 "소스 코드의 네 번째 `await` 지점에서 멈춰 있다"는 뜻이다. 어느 `await`인지 알아내려면 IL의 `switch` 테이블을 보면 된다.

### `try` / `finally` 안의 `await` — 트램펄린

`finally`만 있는 `try` 블록은 `using` 문이 낮춰지는 형태이므로 가장 흔한 경우다.

```csharp
static async Task AwaitInTryFinally (TimeSpan delay)
{
    Console.WriteLine ("Before try block");
    await Task.Delay (delay);
    try
    {
        Console.WriteLine ("Before await");
        await Task.Delay (delay);
        Console.WriteLine ("After await");
    }
    finally
    {
        Console.WriteLine ("In finally block");
    }
    Console.WriteLine ("After finally block");
}
```

여기에 두 가지 문제가 있다.

**문제 1 — `try` 블록 밖에서 안으로 점프할 수 없다.** 루프 때는 C#의 규칙이었지만, 이번엔 **IL의 규칙**이다. 우회할 수 없다.

해법은 **트램펄린(trampoline)** 이다. `try` 블록 바로 앞으로 점프한 다음, `try` 블록 안의 첫 코드가 다시 올바른 지점으로 점프한다. 즉 **디스패치용 `switch`가 하나 더 생긴다.**

**문제 2 — `finally`가 잘못된 시점에 실행된다.** 생성된 코드의 `finally` 블록이 실행되는 경우는 세 가지다.

1. `try` 블록의 끝에 도달했다.
2. `try` 블록이 예외를 던졌다.
3. **`await` 때문에 `try` 블록 안에서 일시 정지하고 반환한다.**

세 번째가 문제다. 논리적으로는 아직 `try` 안에 있고 나중에 거기서 재개할 텐데, 물리적으로는 `try` 블록을 벗어나므로 CLR이 `finally`를 실행한다. **원래 코드의 `finally` 블록이 실행되면 안 되는 시점이다.**

다행히 판별은 쉽다. `num`(= `state` 필드)이 **음수면 실행 중이거나 완료된 것이고, 0 이상이면 일시 정지 중**이다.

전체 결과는 이렇다. (아래 디컴파일 조각은 원천 자료의 것을 그대로 옮긴 것으로, **`try` 앞에 있는 첫 `await`에 해당하는 코드는 생략**하고 `try` 블록 안의 `await` 하나에만 초점을 맞췄다. 그래서 상태 번호가 `0` 하나뿐이다. 실제로는 `await`가 둘이므로 상태 번호도 둘이다.)

```csharp
switch (num)
{
    default: goto MethodStart;
    case 0:  goto AwaitContinuationTrampoline;   // ← try 블록 "직전"으로
}

MethodStart:
    Console.WriteLine ("Before try");

AwaitContinuationTrampoline:
    try
    {
        switch (num)                              // ← try 안의 트램펄린
        {
            default: goto TryBlockStart;
            case 0:  goto AwaitContinuation;
        }

    TryBlockStart:
        Console.WriteLine ("Before await");
        TaskAwaiter awaiter = Task.Delay (this.delay).GetAwaiter();
        if (awaiter.IsCompleted)
        {
            goto GetAwaitResult;
        }
        this.state = num = 0;
        this.awaiter = awaiter;
        this.builder.AwaitUnsafeOnCompleted (ref awaiter, ref this);
        return;

    AwaitContinuation:                            // ← 진짜 연속 지점
        awaiter = this.awaiter;
        this.awaiter = default (TaskAwaiter);
        this.state = num = -1;

    GetAwaitResult:
        awaiter.GetResult();
        Console.WriteLine ("After await");
    }
    finally
    {
        if (num < 0)                              // ← 일시 정지 중이면 건너뛴다
        {
            Console.WriteLine ("In finally block");
        }
    }
    Console.WriteLine ("After finally block");
```

`finally` 안의 `if (num < 0)`이 이 절의 핵심이다. **일시 정지해서 반환하는 경우에는 원래 `finally` 코드를 실행하지 않는다.**

> **⚠️ 상태 기계는 `finally`를 "논리적 이탈"에서만 실행한다**
>
> 이 사실이 실무에서 갖는 함의가 있다. **`async` 메서드가 완료되지 않고 영원히 버려지면 `finally`는 실행되지 않는다.**
>
> ```csharp
> async Task LeakAsync()
> {
>     var stream = File.OpenRead ("data.bin");
>     try
>     {
>         await NeverCompletesAsync();     // ← 영원히 완료되지 않는 태스크
>     }
>     finally
>     {
>         stream.Dispose();                 // ← 절대 실행되지 않는다
>     }
> }
> ```
>
> 동기 코드에서는 `finally`가 실행되지 않는 경우가 프로세스가 죽는 것뿐이었다(32장). 비동기에서는 **완료되지 않은 상태 기계가 GC될 때** 같은 일이 조용히 일어난다. 반복자에서 열거를 끝까지 하지 않았을 때 `finally`가 안 도는 것(28.5절)과 같은 종류의 함정이지만, 반복자는 `Dispose()`로 강제할 수 있는 반면 상태 기계에는 그런 손잡이가 없다.
>
> 이것이 **모든 비동기 대기에 타임아웃이나 취소를 붙이라**는 지침의 근거 중 하나다(46.9절의 `WaitAsync`, 51.4절).

### `catch`와 `finally` 안의 `await` — C# 6부터

C# 5에서는 다음이 전부 컴파일 오류였다.

- `catch` 블록이 딸린 `try` 블록 안의 `await`
- `catch` 블록 안의 `await`
- `finally` 블록 안의 `await`

`finally`만 있는 `try` 안의 `await`는 처음부터 유효했다. 그래서 `using` 문 안의 `await`도 처음부터 됐다.

C# 5 출시 시점까지 설계팀이 안전하고 신뢰성 있게 이 경우들의 상태 기계를 만드는 방법을 찾지 못했던 것이 이유다. C# 6를 구현하면서 방법을 찾아 제약이 해제됐다.

`catch` 안에서 `await` 하는 것이 왜 어려운가? **예외 처리의 2단계 모델**(32.6절)과 충돌하기 때문이다. `catch` 블록 실행 중에는 CLR이 예외 처리 상태를 유지하고 있는데, 그 한가운데서 스택을 풀고 반환했다가 나중에 완전히 다른 스레드에서 재개하려면 그 상태를 어떻게든 옮겨야 한다.

컴파일러의 해법은 **예외 객체를 필드로 승격하고, `catch` 블록의 본문을 `catch` 밖으로 옮기는 것**이다. 개념적으로 이렇다.

```csharp
// 원래 코드
try { await A(); }
catch (Exception ex) { await LogAsync (ex); }

// 개념적 변환
Exception caught = null;
try { await A(); }
catch (Exception ex) { caught = ex; }        // 잡기만 하고 즉시 빠져나온다
if (caught != null) { await LogAsync (caught); }   // await는 catch 밖에서
```

실제 생성 코드는 이보다 훨씬 복잡하고 `ExceptionDispatchInfo`가 개입하지만, **"`await`는 `catch` 블록의 물리적 바깥으로 옮겨진다"** 는 원리는 그대로다.

> **📌 `throw;`(재던지기)와 상태 기계**
>
> `catch` 안에서 `await`를 한 뒤 `throw;`로 재던지면, 물리적으로는 이미 `catch` 블록 밖이다. 컴파일러는 이를 위해 `ExceptionDispatchInfo.Capture(ex).Throw()`를 쓴다. 그래서 **스택 트레이스가 보존된다**(32.5절). 언어가 약속한 의미론이 유지되는 셈이다.

### 각 제어 구조가 상태 기계에 미치는 영향

정리하면 이렇다.

| 원래 코드 구조 | `await`가 안에 있으면 | 필요한 장치 |
|---|---|---|
| `if` / `switch` | 상태 번호 추가 | `goto` 재작성 |
| `for` / `while` / `do` | 상태 번호 추가, 루프 변수 필드 승격 | 루프를 `goto`로 전개 |
| `foreach` | 위와 동일 + 열거자 필드 승격 | 열거자가 `await`를 가로지른다 |
| `try` / `finally` (`using` 포함) | 트램펄린 + `finally` 가드 | `if (state < 0)` 가드 |
| `try` / `catch` | 트램펄린 | ※C# 6 이상 |
| `catch` 블록 안 | 예외 객체 필드 승격, 본문 이동 | `ExceptionDispatchInfo` ※C# 6 이상 |
| `finally` 블록 안 | 위 두 가지의 결합 | ※C# 6 이상 |
| `lock` 블록 안 | **불가** (CS1996) | — |
| `unsafe` 컨텍스트 안 | **불가** | — |

> **💡 `await`를 만드는 코드는 단순한 편이 낫다**
>
> 위 표를 읽고 나면 "`await`를 중첩된 `try`/`catch`/루프 깊숙이 넣지 말라"는 조언의 근거를 알 수 있다. 코드가 커지고, 디버깅이 어려워지고, 필드로 승격되는 지역이 늘어난다.
>
> 실무 지침으로 옮기면 이렇다. **`await`가 여러 겹의 제어 구조 안으로 들어가려 하면, 그 안쪽을 별도의 `async` 메서드로 뽑아라.** 상태 기계 두 개가 되지만 각각이 단순해지고, 대개 성능 차이보다 유지보수 이득이 크다.

---
## 47.11 비동기 람다와 비동기 스트림의 상태 기계

### 비동기 익명 함수

명명된 메서드가 비동기일 수 있듯 익명 함수(람다식과 무명 메서드)도 `async` 한정자를 앞에 붙이면 비동기가 된다.

```csharp
Func<Task> lambda = async () => await Task.Delay (1000);

Func<Task<int>> anonMethod = async delegate()
{
    Console.WriteLine ("Started");
    await Task.Delay (1000);
    Console.WriteLine ("Finished");
    return 10;
};
```

만들어지는 델리게이트의 반환 타입은 `async` 메서드에 유효한 것이어야 한다 — `void`, `Task`, `Task<TResult>`, 그리고 C# 7부터 커스텀 태스크 타입.

**상태 기계 메커니즘은 명명된 메서드와 완전히 같다.** 컴파일러가 만드는 것은 익명 함수 본문에 대응하는 스텁 메서드 하나와 상태 기계 타입 하나다.

이벤트 핸들러를 붙일 때 특히 유용하다.

```csharp
myButton.Click += async (sender, args) =>
{
    await Task.Delay (1000);
    myButton.Content = "Done";
};
```

이건 다음과 정확히 같은 효과다.

```csharp
myButton.Click += ButtonHandler;
// ...
async void ButtonHandler (object sender, EventArgs args)
{
    await Task.Delay (1000);
    myButton.Content = "Done";
}
```

`EventHandler` 델리게이트의 반환 타입이 `void`이므로 **이 람다는 `async void`로 추론된다.** 47.14절에서 볼 위험이 그대로 적용된다. 다만 이벤트 핸들러는 `async void`가 허용되는 유일한 자리이므로 이 경우는 정당하다.

### 캡처와 상태 기계의 결합

비동기 람다에서 헷갈리기 쉬운 지점은 **클로저와 상태 기계가 두 개의 서로 다른 저장소**라는 사실이다.

```csharp
async Task ProcessAllAsync (IEnumerable<string> urls)
{
    var client = new HttpClient();          // ← 캡처된다 (클로저 필드)

    var tasks = urls.Select (async url =>   // ← 각 호출마다 상태 기계 하나
    {
        var bytes = await client.GetByteArrayAsync (url);   // client는 클로저에서
        return bytes.Length;                                 // bytes는 상태 기계에서
    });

    int[] lengths = await Task.WhenAll (tasks);
}
```

여기서 일어나는 일을 층으로 나누면 이렇다.

| 무엇 | 어디에 사는가 | 수명 |
|---|---|---|
| `client` | 컴파일러가 만든 **클로저 클래스**의 필드 | 델리게이트가 살아 있는 동안 |
| 델리게이트 인스턴스 | 힙 | `Select` 결과가 살아 있는 동안 |
| `url` (람다 매개변수) | **상태 기계**의 필드 | 그 호출의 상태 기계가 사는 동안 |
| `bytes` | **상태 기계**의 필드 (`await`를 가로지르지 않으면 스택) | 위와 같음 |

**델리게이트는 하나지만 상태 기계는 호출 횟수만큼 만들어진다.** 델리게이트를 호출하는 것이 곧 연산을 개시하는 것이며, 여러 번 호출하면 여러 개의 연산이 만들어진다.

```csharp
Func<int, Task<int>> function = async x =>
{
    Console.WriteLine ("Starting... x={0}", x);
    await Task.Delay (x * 1000);
    Console.WriteLine ("Finished... x={0}", x);
    return x * 2;
};

Task<int> first = function (5);
Task<int> second = function (3);
Console.WriteLine ("First result: {0}", first.Result);
Console.WriteLine ("Second result: {0}", second.Result);
```

출력은 이렇다.

```text
Starting... x=5
Starting... x=3
Finished... x=3
Finished... x=5
First result: 10
Second result: 6
```

두 호출이 겹쳐서 진행된다. `x=3` 쪽이 먼저 끝나지만, 결과 출력은 우리가 `first`를 먼저 기다렸으므로 순서대로 나온다. **`async` 코드를 명명된 메서드에 넣었을 때와 완전히 같은 동작이다.**

### `Func<Task>` vs `Action` — 조용한 사고

비동기 람다에서 가장 위험한 함정이 **오버로드 해석**이다.

```csharp
// 이런 API가 있다고 하자
void Register (Action callback);
void Register (Func<Task> callback);
```

`Register(async () => await DoWorkAsync())`를 호출하면 컴파일러는 `Func<Task>` 오버로드를 고른다. 좋다. 그런데 **`Action` 오버로드밖에 없다면?**

```csharp
void Register (Action callback);          // Func<Task> 오버로드가 없다

Register (async () => await DoWorkAsync());     // 컴파일된다!
```

**컴파일된다.** 람다가 `async void`로 추론되기 때문이다. 그리고 그 순간 이 코드는 다음 성질을 얻는다.

- **`Register`는 콜백이 언제 끝나는지 알 수 없다.** `DoWorkAsync`가 끝나기 전에 다음 단계로 넘어간다.
- **`DoWorkAsync`가 실패하면 예외가 `Register`의 호출자에게 가지 않는다.** 동기화 컨텍스트로 게시되고, 없으면 프로세스를 죽인다.

`List<T>.ForEach`가 대표적인 지뢰다.

```csharp
// 안티패턴: 전부 동시에 시작되고, 아무도 완료를 기다리지 않으며, 예외는 사라진다
items.ForEach (async item => await ProcessAsync (item));
```

옳은 코드는 이렇다.

```csharp
// 순차 처리
foreach (var item in items)
    await ProcessAsync (item);

// 동시 처리
await Task.WhenAll (items.Select (item => ProcessAsync (item)));
```

> **⚠️ `Action`을 받는 API에 비동기 람다를 넘기지 마라**
>
> 이 함정은 **컴파일 오류도 경고도 나지 않기 때문에** 특히 위험하다. LINQ의 `Where`, `List<T>.ForEach`, `Parallel.ForEach`, 각종 콜백 등록 API가 모두 여기 해당한다.
>
> 검증 방법이 있다. **비동기 람다를 넘기는 자리에서 그 람다의 추론된 델리게이트 타입을 확인하라.** IDE에서 람다 위에 마우스를 올려 `Action`이 나오면 문제다. `Func<Task>`가 나와야 안전하다.
>
> `Parallel.ForEach`에 비동기 람다를 넘기고 싶다면 ※.NET 6부터 `Parallel.ForEachAsync`가 있다(50.7절).

또 한 가지, **`async` 람다는 식 트리(expression tree)로 만들 수 없다.**

```csharp
Expression<Func<Task>> expr = async () => await DoAsync();   // 컴파일 오류
```

식 트리는 코드의 구조를 표현하는 자료 구조인데(31장), 상태 기계 변환은 그 구조를 완전히 다른 것으로 바꾼다. 두 가지를 동시에 만족시킬 방법이 없다.

### `async` 반복자의 상태 기계

이제 비동기 스트림으로 넘어가자. **사용법은 28.9절에서 다뤘다.** 여기서는 **상태 기계가 어떻게 생겼는지**를 판다.

문제 설정부터 보자. `async IAsyncEnumerable<T>` 메서드는 **두 가지 상태 기계를 동시에** 요구한다.

- **반복자 상태 기계** — `yield return`에서 멈췄다가 다음 `MoveNextAsync`에서 재개해야 한다(28.4절).
- **비동기 상태 기계** — `await`에서 멈췄다가 연속에서 재개해야 한다(47.7절).

두 가지를 하나의 상태 기계로 합쳐야 한다.

```csharp
async IAsyncEnumerable<int> RangeAsync (int start, int count, int delay)
{
    for (int i = start; i < start + count; i++)
    {
        await Task.Delay (delay);
        yield return i;
    }
}
```

컴파일러가 만드는 타입은 **클래스**이며(릴리스 빌드에서도 그렇다 — 여러 인터페이스를 구현해야 하고 열거자로서 힙에 살아야 한다) 다음 인터페이스들을 한꺼번에 구현한다.

```csharp
// 개념 스케치. 실제 이름은 구현 세부다
[CompilerGenerated]
private sealed class RangeAsyncStateMachine
    : IAsyncEnumerable<int>,                    // GetAsyncEnumerator를 위해
      IAsyncEnumerator<int>,                    // MoveNextAsync / Current / DisposeAsync
      IAsyncStateMachine,                       // MoveNext / SetStateMachine
      IValueTaskSource<bool>,                   // MoveNextAsync의 ValueTask<bool> 뒷단
      IValueTaskSource                          // DisposeAsync의 ValueTask 뒷단
{
    // ...
}
```

**`IValueTaskSource<bool>`을 스스로 구현한다는 점이 이 설계의 핵심이다.**

### 필드 구성

| 역할 | 개념적 이름 | 설명 |
|---|---|---|
| 상태 | `<>1__state` | 일반 `async` 상태 기계와 같은 규약 + 반복자용 값 |
| 빌더 | `<>t__builder` | **`AsyncIteratorMethodBuilder`** |
| 현재 요소 | `<>2__current` | `Current` 프로퍼티가 돌려줄 값 |
| 약속(promise) | `<>v__promiseOfValueOrEnd` | **`ManualResetValueTaskSourceCore<bool>`** |
| 취소 토큰 | `<>3__...` 계열 | `[EnumeratorCancellation]` 매개변수와 연결 |
| 정리 모드 | `<>w__disposeMode` | `DisposeAsync`가 호출됐음을 표시 |
| 생성 스레드 ID | `<>l__initialThreadId` | 반복자 재사용 최적화용(28.4절과 같은 기법) |
| 승격된 지역·매개변수 | 각각 | 일반 상태 기계와 동일 |

### `AsyncIteratorMethodBuilder`

일반 `async` 메서드의 빌더와 달리 이 빌더에는 **`SetResult`도 `Task` 프로퍼티도 없다.** 반환할 태스크가 애초에 없기 때문이다. 대신 이런 멤버들을 갖는다.

| 멤버 | 역할 |
|---|---|
| `static Create()` | 빌더 생성 |
| `MoveNext<TSM>(ref TSM)` | 상태 기계를 한 걸음 전진시킨다 (`Start` 대신) |
| `AwaitOnCompleted<TA, TSM>(ref TA, ref TSM)` | 연속 등록 |
| `AwaitUnsafeOnCompleted<TA, TSM>(ref TA, ref TSM)` | 연속 등록(컨텍스트 흐름 위임) |
| `Complete()` | 반복이 끝났음을 알린다 |

**`Start`가 아니라 `MoveNext`라는 점**이 성격을 말해 준다. 일반 `async` 메서드는 호출되자마자 한 걸음 뗀다. 비동기 반복자는 **`MoveNextAsync()`가 호출될 때마다** 한 걸음 뗀다. 반복자 메서드를 호출하는 것만으로는 본문이 한 줄도 실행되지 않는다는 성질(28.5절의 지연 실행)이 여기서도 유지된다.

### `ManualResetValueTaskSourceCore<bool>` — `ValueTask`의 재활용

`MoveNextAsync()`는 `ValueTask<bool>`을 반환한다. 요소가 100만 개인 스트림이라면 이 메서드가 100만 번 호출된다. **호출마다 `Task<bool>`을 하나씩 할당하면 재앙이다.**

해법은 `ValueTask<T>`의 세 번째 형태다. 47.13절에서 자세히 보겠지만, `ValueTask<T>`는 다음 셋 중 하나를 감쌀 수 있다.

1. 이미 준비된 결과값 (동기 완료)
2. 평범한 `Task<T>`
3. **`IValueTaskSource<T>` 구현체 + 토큰(버전 번호)**

비동기 반복자는 3번을 쓴다. **상태 기계 자기 자신이 `IValueTaskSource<bool>`이다.** 그러니 `MoveNextAsync`는 대략 이렇게 동작한다.

```csharp
// 개념적 구현
public ValueTask<bool> MoveNextAsync()
{
    if (_state == StateFinished)
        return default;                                  // ValueTask<bool>(false)

    _promiseOfValueOrEnd.Reset();                        // ★ 버전 번호를 하나 올린다
    MoveNext();                                          // 상태 기계 전진

    // 동기적으로 결과가 났으면 그 값을 직접 담아 돌려준다 — 할당 0
    short version = _promiseOfValueOrEnd.Version;
    if (_promiseOfValueOrEnd.GetStatus (version) == ValueTaskSourceStatus.Succeeded)
        return new ValueTask<bool> (_promiseOfValueOrEnd.GetResult (version));

    // 아니면 자기 자신을 소스로 삼는 ValueTask를 돌려준다 — 역시 할당 0
    return new ValueTask<bool> (this, version);
}
```

`ManualResetValueTaskSourceCore<T>`가 제공하는 멤버는 다음과 같다.

| 멤버 | 역할 |
|---|---|
| `Reset()` | **버전 번호를 증가시키고 상태를 초기화한다.** 재사용의 핵심 |
| `Version` | 현재 버전(토큰). `ValueTask` 생성 시 함께 넘긴다 |
| `GetStatus(short token)` | 토큰이 유효한지 확인하고 완료 상태를 반환 |
| `GetResult(short token)` | 토큰이 유효한지 확인하고 결과를 반환(또는 예외를 던진다) |
| `OnCompleted(...)` | 연속 등록 |
| `SetResult(T)` / `SetException(Exception)` | 완료시킨다 |
| `RunContinuationsAsynchronously` | 연속을 동기 실행할지 여부 |

**버전 번호가 이 구조의 안전장치다.** `Reset()`을 부를 때마다 버전이 올라가므로, 이전 `MoveNextAsync`가 돌려준 `ValueTask<bool>`을 다시 `await` 하려 하면 토큰이 맞지 않아 `InvalidOperationException`이 난다.

> **⚠️ 그래서 `MoveNextAsync`의 결과를 두 번 `await` 하면 안 된다**
>
> 47.13절에서 다룰 `ValueTask` 금지 사항들이 **여기서 자동으로 따라 나온다.** `await foreach`를 쓰면 컴파일러가 규칙을 지켜 주지만, `IAsyncEnumerator<T>`를 손으로 돌린다면 다음을 지켜야 한다.
>
> - `MoveNextAsync()`가 돌려준 `ValueTask<bool>`은 **정확히 한 번만** `await` 한다.
> - 그 결과를 변수에 담아 두었다가 나중에 다시 쓰지 않는다.
> - 여러 소비자가 같은 `IAsyncEnumerator<T>`를 동시에 돌리지 않는다.
>
> 세 번째 규칙을 어기면 `Reset()`이 다른 소비자의 진행 중인 약속을 무효화한다. **`IAsyncEnumerator<T>`는 스레드 안전하지 않다.**

### `DisposeAsync`와 `disposeMode`

반복자를 중간에 그만두면(`await foreach`에 `break`를 넣거나 예외가 나면) `DisposeAsync()`가 호출된다. 그런데 반복자 본문은 `yield return` 지점에서 멈춰 있고, 그 자리는 `try`/`finally` 안일 수 있다.

컴파일러의 해법은 **`disposeMode` 플래그**다.

1. `DisposeAsync()`가 플래그를 세우고 상태 기계를 재개시킨다.
2. 상태 기계는 마지막 `yield return` 지점에서 재개하되, 플래그가 서 있으므로 **본문을 계속 실행하지 않고 즉시 이탈 경로를 탄다.**
3. 이탈하면서 `finally` 블록들이 실행된다. `finally` 안에 `await`가 있어도 되며, 그러면 `DisposeAsync()`가 돌려준 `ValueTask`가 그때까지 완료되지 않는다.
4. 모든 정리가 끝나면 상태 기계가 종료 상태가 되고 약속이 완료된다.

반복자에서 `yield break`와 `finally`를 다루던 기법(28.5절)의 비동기 버전이다.

> **📌 `[EnumeratorCancellation]`이 컴파일러 수준에서 하는 일**
>
> 28.9절에서 이 특성의 **사용법**을 봤다. 컴파일러 수준에서는 이런 일이 일어난다.
>
> 1. `[EnumeratorCancellation]`이 붙은 매개변수는 **상태 기계의 특별한 필드**와 연결된다.
> 2. 생성된 `GetAsyncEnumerator(CancellationToken token)`이 받은 토큰을 그 필드에 흘려 넣는다.
> 3. **반복자 호출 시점의 토큰과 열거 시점의 토큰이 둘 다 있으면** 컴파일러가 `CancellationTokenSource.CreateLinkedTokenSource`로 두 토큰을 연결한다(46.8절).
>
> 3번 덕분에 다음 두 가지가 동시에 동작한다.
>
> ```csharp
> await foreach (var x in RangeAsync (0, 10, 500, tokenA).WithCancellation (tokenB))
> {
>     // tokenA나 tokenB 중 어느 쪽이 취소돼도 반복이 중단된다
> }
> ```
>
> 그리고 연결된 소스는 `DisposeAsync` 경로에서 정리된다.

### 세 종류 상태 기계 비교

| 항목 | 반복자 (`IEnumerable<T>`) | 비동기 메서드 (`Task`) | 비동기 반복자 (`IAsyncEnumerable<T>`) |
|---|---|---|---|
| 생성 타입 | 클래스 | 릴리스: 구조체 / 디버그: 클래스 | 클래스 |
| 빌더 | 없음 | `AsyncTaskMethodBuilder` 계열 | `AsyncIteratorMethodBuilder` |
| 전진 메서드 | `MoveNext()` → `bool` | `MoveNext()` → `void` | `MoveNextAsync()` → `ValueTask<bool>` + `MoveNext()` → `void` |
| 첫 실행 시점 | 첫 `MoveNext()` | **메서드 호출 즉시** | 첫 `MoveNextAsync()` |
| 멈추는 지점 | `yield return` | `await` (미완료 시) | `yield return` **그리고** `await` |
| 결과 전달 | `Current` 프로퍼티 | 빌더의 `SetResult` | `Current` + 약속의 `SetResult` |
| 정리 경로 | `Dispose()` | 없음 | `DisposeAsync()` + `disposeMode` |
| 참조 | 28.4절 | 47.7절 | 이 절 |

---

## 47.12 비동기와 동기화 컨텍스트, `ConfigureAwait(false)`의 정확한 의미

### 애플리케이션 모델과 스레딩 모델을 잇는 다리

.NET은 여러 애플리케이션 모델을 지원하고, 각 모델이 자기 스레딩 모델을 강제한다.

| 애플리케이션 모델 | 스레딩 모델 | 동기화 컨텍스트 |
|---|---|---|
| 콘솔 앱 / Windows 서비스 | 없음. 아무 스레드나 아무 일이나 한다 | **없음** (`null`) |
| WPF / WinForms / MAUI / UWP | UI 요소는 만든 스레드에서만 접근 가능 | 있음 (단일 스레드로 디스패치) |
| **ASP.NET Core** | 없음. 아무 스레드나 요청을 처리한다 | **없음** (`null`) |
| ASP.NET (.NET Framework 전용) | 요청별 컨텍스트(문화권, 주체, `HttpContext`) | 있음 (한 번에 한 스레드만) |
| 단위 테스트 러너 | 프레임워크마다 다르다 | 대개 없음 (있는 경우도 있다) |

`System.Threading.SynchronizationContext`는 이 다양성을 하나의 추상으로 묶는다. **`SynchronizationContext` 파생 객체는 애플리케이션 모델을 그 스레딩 모델에 연결한다.** FCL은 여러 파생 클래스를 정의하는데 대부분 공개되지도 문서화되지도 않았다.

우리가 쓰는 API는 둘뿐이다.

`Post(SendOrPostCallback, object)`는 델리게이트를 컨텍스트에 **비동기로** 게시한다. WPF의 `Dispatcher.BeginInvoke`, WinForms의 `Control.BeginInvoke`에 대응한다. `Send(SendOrPostCallback, object)`는 **동기로** 보내며 완료까지 블로킹한다. `Dispatcher.Invoke`, `Control.Invoke`에 대응한다(45.8절).

### 캡처 규칙

**`await` 시점에 무엇이 캡처되는가?** 정확한 규칙은 이렇다.

1. **`SynchronizationContext.Current`가 `null`이 아니면 그것을 캡처한다.**
2. **`null`이면 `TaskScheduler.Current`를 본다.** 그것이 `TaskScheduler.Default`(즉 스레드 풀 스케줄러)가 아니면 그 스케줄러를 캡처한다.
3. **둘 다 해당하지 않으면 아무것도 캡처하지 않는다.** 연속은 스레드 풀에서 실행된다.

캡처된 것은 상태 기계(정확히는 awaiter가 만드는 연속 등록)에 기록되고, 태스크가 완료될 때 **그 컨텍스트/스케줄러를 통해** 연속이 실행된다.

그러니 다음이 성립한다.

- **UI 스레드에서 `await` 하면 `await` 뒤의 코드도 UI 스레드에서 실행된다.** UI 요소를 안전하게 갱신할 수 있다.
- **ASP.NET(.NET Framework)에서 `await` 하면 `await` 뒤의 코드도 클라이언트의 문화권과 주체 정보를 가진 스레드에서 실행된다.**
- **콘솔 앱이나 ASP.NET Core에서는 캡처할 것이 없으므로 스레드 풀에서 실행된다.**

> **📌 `TaskScheduler.Current`가 규칙에 들어 있는 이유**
>
> 2번 규칙은 자주 잊힌다. `TaskScheduler`(46.10절)를 커스텀으로 만들어 그 위에서 태스크를 실행 중이라면, 동기화 컨텍스트가 없어도 연속이 **그 스케줄러로** 돌아간다.
>
> `TaskScheduler.FromCurrentSynchronizationContext()`로 UI 스케줄러를 만들어 쓰는 코드와 `async`/`await`가 섞이면 이 규칙이 눈에 보이는 차이를 만든다.

### `ConfigureAwait(false)`가 정확히 끄는 것

`Task`와 `Task<TResult>`에는 다음 메서드가 있다.

```csharp
// Task
public ConfiguredTaskAwaitable ConfigureAwait (bool continueOnCapturedContext);

// Task<TResult>
public ConfiguredTaskAwaitable<TResult> ConfigureAwait (bool continueOnCapturedContext);
```

`true`를 넘기는 것은 이 메서드를 아예 부르지 않은 것과 같다. `false`를 넘기면 **`await` 연산자가 호출 스레드의 동기화 컨텍스트를 조회하지 않는다.** 태스크가 완료되면 그냥 완료되고, `await` 뒤의 코드가 스레드 풀 스레드에서 실행된다.

여기서 정확해야 한다. **`ConfigureAwait(false)`가 끄는 것은 컨텍스트 복원뿐이다.**

| 항목 | `ConfigureAwait(false)`의 효과 |
|---|---|
| `SynchronizationContext` 복원 | **끈다** |
| `TaskScheduler` 복원 | **끈다** |
| `ExecutionContext` 흐름 | **끄지 않는다.** 그대로 흐른다 |
| `AsyncLocal<T>` 값 | **그대로 유지된다** (`ExecutionContext`에 실려 있으므로) |
| `Thread.CurrentPrincipal` | **그대로 유지된다** (`ExecutionContext`에 실려 있으므로) |
| `CultureInfo.CurrentCulture` | **그대로 유지된다** ※.NET Core 이후 기본 동작 |
| 스레드 정체성 | 바뀔 수 있다 |
| `[ThreadStatic]` 값 | 바뀔 수 있다 (스레드가 바뀌므로) |

> **⚠️ `ConfigureAwait(false)`는 `AsyncLocal`을 끊지 않는다**
>
> 이 오해가 흔하다. `ConfigureAwait(false)`를 붙였으니 로깅 상관관계 ID(`AsyncLocal<string>`에 담긴 것)가 사라질까 봐 걱정하는 경우가 있는데, **그렇지 않다.** `ExecutionContext`는 별개의 메커니즘이고(46.7절), `ConfigureAwait`는 그것을 건드리지 않는다.
>
> 반대 방향의 오해도 있다. "`ConfigureAwait(false)`를 붙였는데도 `AsyncLocal` 값이 살아 있다"는 건 버그가 아니라 **설계된 동작**이다.

### 모든 `await`에 붙여야 한다

한 가지 중요한 세부가 있다.

> **`ConfigureAwait(false)`는 `await` 하는 모든 태스크에 붙여야 한다. 첫 번째 하나에만 붙이고 나머지가 알아서 되기를 기대할 수 없다.**

이유는 47.9절의 최적화 때문이다. 비동기 연산이 **동기적으로 완료될 수 있고**, 그러면 호출 스레드가 호출자로 돌아가지 않고 계속 실행한다. 어느 연산이 컨텍스트를 무시해야 하는지 미리 알 수 없으므로 **전부에게 무시하라고 말해야 한다.**

```csharp
private async Task<string> GetHttpAsync()
{
    HttpResponseMessage msg = await new HttpClient()
        .GetAsync ("https://example.com")
        .ConfigureAwait (false);                     // ← 첫 번째

    return await msg.Content.ReadAsStringAsync()
        .ConfigureAwait (false);                     // ← 두 번째도 반드시
}
```

> **💡 Roslyn 분석기를 쓰라**
>
> 손으로 빠짐없이 붙이는 것은 비현실적이다. **분석기를 켜라.** `ConfigureAwaitChecker.Analyzer` 같은 NuGet 패키지가 빠진 곳을 잡아 준다. Microsoft가 제공하는 `CA2007`(Do not directly await a Task) 규칙도 같은 일을 한다.
>
> 반대로 애플리케이션 코드 프로젝트에서는 이 규칙을 **꺼야** 한다. 지침이 정반대이기 때문이다.

### 라이브러리는 붙이고, 애플리케이션은 대개 필요 없다

지침을 표로 정리하면 이렇다.

| 코드의 종류 | `ConfigureAwait(false)` | 이유 |
|---|---|---|
| **범용 라이브러리** (비즈니스 로직, 웹 서비스 클라이언트, DB 접근) | **붙인다** | 어느 애플리케이션 모델에서 호출될지 모른다. 불필요한 컨텍스트 왕복 비용을 없앤다. 호출자의 데드락 위험도 줄인다 |
| **UI 라이브러리** | 붙이지 않는다 | UI 스레드로 돌아가야 한다 |
| **WPF / WinForms / MAUI 앱 코드** | 붙이지 않는다 | UI 요소를 갱신해야 한다 |
| **ASP.NET Core 앱 코드** | 붙일 필요 없다 | 동기화 컨텍스트가 애초에 없다. 붙여도 아무 효과가 없다 |
| **ASP.NET (.NET Framework 전용) 앱 코드** | 상황에 따라 | `HttpContext.Current`가 필요하면 붙이면 안 된다 |
| **콘솔 앱 / 워커 서비스** | 붙일 필요 없다 | 동기화 컨텍스트가 없다 |

> **📌 ASP.NET Core에는 동기화 컨텍스트가 없다**
>
> 이 사실이 실무에서 갖는 함의가 크다. ASP.NET Core는 커스텀 `SynchronizationContext`를 만들지 않는다. 따라서
>
> - **`ConfigureAwait(false)`가 하는 일이 없다.** 붙여도 무해하지만 이득도 없다.
> - **47.14절의 고전적 데드락이 일어나지 않는다.** `.Result`가 컨텍스트 때문에 멎지는 않는다.
> - **그러나 스레드 풀 기아 형태의 문제는 그대로 남는다**(46.2절). `.Result`는 여전히 위험하다.
>
> .NET Framework 시절 ASP.NET에는 `AspNetSynchronizationContext`가 있었고 한 번에 한 스레드만 요청 컨텍스트에 들어갈 수 있었다. 그 시절 코드를 마이그레이션할 때 "예전엔 데드락이 났는데 지금은 안 난다"를 만나면 이 차이 때문이다.

### 되튀김을 줄이는 최적화

루프에서 여러 번 호출되는 메서드라면 UI 메시지 루프로 매번 되튀는 비용이 누적된다.

```csharp
async void A() { /* ... */ await B(); /* ... */ }

async Task B()
{
    for (int i = 0; i < 1000; i++)
        await C().ConfigureAwait (false);      // ← 1000번의 UI 왕복을 없앤다
}

async Task C() { /* ... */ }
```

`B`와 `C`에서는 "UI 스레드에서만 실행되므로 `await` 지점에서만 선점될 수 있다"는 단순한 스레드 안전 모델을 포기하게 된다. **`A`는 영향받지 않는다.** UI 스레드에서 시작했다면 그대로 UI 스레드에 남는다.

이 최적화가 특히 유효한 곳이 라이브러리다. 라이브러리 코드는 대개 호출자와 상태를 공유하지 않고 UI 컨트롤에 접근하지도 않으므로, 단순화된 스레드 안전 모델의 이득이 필요 없다.

### `ConfigureAwait(ConfigureAwaitOptions)` ※.NET 8

.NET 8에서 `Task.ConfigureAwait`에 열거형을 받는 오버로드가 추가됐다.

```csharp
namespace System.Threading.Tasks
{
    [Flags]
    public enum ConfigureAwaitOptions
    {
        None = 0,
        ContinueOnCapturedContext = 1,
        SuppressThrowing = 2,
        ForceYielding = 4
    }
}
```

| 옵션 | 의미 |
|---|---|
| `None` | `ConfigureAwait(false)`와 같다 |
| `ContinueOnCapturedContext` | `ConfigureAwait(true)`와 같다 |
| `SuppressThrowing` | 태스크가 실패하거나 취소돼도 **예외를 던지지 않는다.** 그냥 완료를 기다린다 |
| `ForceYielding` | 태스크가 이미 완료됐어도 **빠른 경로를 타지 않고** 항상 양보한다. `Task.Yield`와 비슷한 효과 |

`SuppressThrowing`이 특히 실용적이다. "이 작업이 어떻게 끝나든 상관없으니 끝나기만 기다리자"는 코드가 종전에는 이렇게 생겼다.

```csharp
try { await task; } catch { }             // 예외 처리 비용 + 의도가 불분명
```

이제 이렇게 쓴다.

```csharp
await task.ConfigureAwait (ConfigureAwaitOptions.SuppressThrowing);
```

> **⚠️ `SuppressThrowing`은 `Task<TResult>`에서 쓸 수 없다**
>
> 결과값을 돌려줘야 하는데 예외를 억누르면 무슨 값을 돌려줘야 할지 정할 수 없다. **`Task<TResult>.ConfigureAwait`에 `SuppressThrowing`을 넘기면 `ArgumentOutOfRangeException`이 난다.** 논제네릭 `Task`에서만 유효하다.
>
> 그리고 이 오버로드는 **`Task` 계열에만 있다.** `ValueTask`/`ValueTask<T>`의 `ConfigureAwait`는 여전히 `bool`만 받는다.

> **⚠️ `SuppressThrowing`이 예외를 "관찰"하는가**
>
> 그렇다. `SuppressThrowing`으로 대기한 태스크의 예외는 **관찰된 것으로 표시된다.** 따라서 `TaskScheduler.UnobservedTaskException`(46.11절)이 발화하지 않는다. 이게 대개 원하는 동작이지만, "실패를 조용히 삼키고 있다"는 사실을 코드 리뷰에서 놓치기 쉬우니 왜 무시해도 되는지 주석을 남기는 편이 좋다.

---
## 47.13 `ValueTask`를 써야 할 때와 쓰면 안 될 때

### 존재 이유

47.8절에서 확인한 사실을 다시 꺼내자. **`async` 메서드가 `await` 없이 동기 완료해도 `Task<T>` 객체 하나는 할당될 수 있다.** `Task`와 `Task<T>`는 참조 타입이므로 인스턴스를 만들려면 힙 할당과 나중의 수집이 필요하다.

대부분의 경우 .NET의 객체 할당은 무시할 만큼 싸다(63장). 하지만 **아주 자주 하거나 성능 제약이 빡빡하면** 그 할당을 없애고 싶어진다.

`ValueTask`와 `ValueTask<TResult>`가 그 목적으로 도입된 구조체다. 컴파일러가 `Task`/`Task<T>` 자리에 이들을 허용한다.

```csharp
async ValueTask<int> FooAsync() { /* ... */ }
```

**연산이 동기적으로 완료되면 `ValueTask<T>`를 `await` 하는 데 할당이 없다.**

```csharp
int answer = await FooAsync();     // (잠재적으로) 할당 없음
```

동기 완료하지 않으면 `ValueTask<T>`는 내부적으로 평범한 `Task<T>`를 만들고 그쪽으로 `await`를 넘긴다. 그러면 얻는 것이 없다.

### 내부 구조 — 판별 공용체

`ValueTask<TResult>`는 **판별 공용체(discriminated union)** 로 설계된 구조체다. 세 값 중 하나를 취할 수 있다.

```csharp
public readonly struct ValueTask<TResult>
{
    // _obj가 null이면 _result에 결과가 들어 있다.
    // 아니면 Task<TResult>이거나 IValueTaskSource<TResult>다.
    internal readonly object _obj;
    internal readonly TResult _result;
    internal readonly short _token;
    internal readonly bool _continueOnCapturedContext;
}
```

| 상태 | `_obj` | 의미 | 할당 |
|---|---|---|---|
| 동기 성공 완료 | `null` | `_result`에 결과가 들어 있다 | **없음** |
| 비동기 진행 중 | `Task<TResult>` | 일반 태스크로 위임 | 태스크 1개 |
| 풀링된 소스 | `IValueTaskSource<TResult>` | 재사용 가능한 소스 + 버전 토큰 | **없음(재사용)** |

`async ValueTask<T>` 메서드가 쓰는 빌더는 `AsyncValueTaskMethodBuilder<TResult>`다. 그 `SetResult`는 결과가 이미 준비돼 있으면 그냥 값을 채우고, 진짜 비동기 경로를 탔으면 앞서 본 방식대로 `Task`를 만든다.

**반환 타입을 `Task<T>`에서 `ValueTask<T>`로 바꾸기만 하면 나머지는 컴파일러가 알아서 한다.**

### 언제 이득인가 — 버퍼링 예제

C# in Depth가 제시한 예제가 이 타입의 존재 이유를 정확히 보여 준다. `Stream`에서 **한 바이트씩** 비동기로 읽고 싶다. 매번 밑단 `Stream.ReadAsync`를 부르면 느리니 버퍼링 계층을 하나 얹는다.

```csharp
using System;
using System.IO;
using System.Threading.Tasks;

public sealed class ByteStream : IDisposable
{
    private readonly Stream stream;
    private readonly byte[] buffer;
    private int position;          // 다음에 돌려줄 버퍼 인덱스
    private int bufferedBytes;     // 버퍼에 읽어 둔 바이트 수

    public ByteStream (Stream stream)
    {
        this.stream = stream;
        buffer = new byte[1024 * 8];      // 8KB. 실제 await는 드물게 일어난다
    }

    public async ValueTask<byte?> ReadByteAsync()
    {
        if (position == bufferedBytes)                // 버퍼를 다시 채워야 할 때만
        {
            position = 0;
            bufferedBytes = await stream
                .ReadAsync (buffer, 0, buffer.Length)
                .ConfigureAwait (false);
            if (bufferedBytes == 0)
            {
                return null;                          // 스트림 끝
            }
        }
        return buffer[position++];                    // 대부분 여기서 끝난다
    }

    public void Dispose() => stream.Dispose();
}
```

사용하는 쪽은 이렇다.

```csharp
byte? nextByte;
using (var stream = new ByteStream (File.OpenRead ("file.dat")))
{
    while ((nextByte = await stream.ReadByteAsync()).HasValue)
    {
        ConsumeByte (nextByte.Value);
    }
}
```

`ReadByteAsync` 호출의 **8,192번 중 8,191번은 `await`에 도달조차 하지 않는다.** 버퍼에 데이터가 남아 있기 때문이다. `Task<byte?>`를 반환했다면 매 호출이 힙 할당 하나를 냈을 것이고, 8KB 파일 하나를 읽는 데 8,192개의 태스크 객체가 만들어졌을 것이다.

이 예제는 실제 사례를 단순화한 것이다. Google의 Protocol Buffers .NET 구현(`Google.Protobuf`)의 `CodedInputStream` 프로토타입이 원본이며, 정수 필드가 많은 메시지를 역직렬화하면 이런 메서드 호출이 엄청나게 일어난다.

### 금지 사항

`ValueTask<T>`는 **순수하게 성능 때문에** 구조체로 정의된 특이한 타입이다. 그래서 어울리지 않는 값 타입 의미론을 떠안고 있고, 그것이 놀라운 결과를 만든다.

> **⚠️ `ValueTask` 사용 금지 목록**
>
> 다음을 하면 안 된다.
>
> 1. **같은 `ValueTask<T>`를 두 번 이상 `await` 하지 마라.**
> 2. **완료되지 않은 상태에서 `.Result`나 `.GetAwaiter().GetResult()`를 호출하지 마라.**
> 3. **여러 스레드에서 동시에 사용하지 마라.**
> 4. **완료 여부를 확인하지 않고 `.Result`를 읽지 마라.**
>
> 이 중 하나라도 필요하면 **`AsTask()`를 호출해서 얻은 `Task<T>`로 작업하라.**

왜 그런가? `Task<T>`는 참조 타입이고 **완료된 뒤에도 결과를 영구히 들고 있다.** 몇 번을 `await` 하든 같은 결과가 나온다. `ValueTask<T>`는 다르다. 세 번째 형태(`IValueTaskSource<T>` 래핑)일 때 그 소스는 **재사용되도록 설계됐다.** 47.11절에서 본 `ManualResetValueTaskSourceCore<T>`의 버전 토큰이 바로 이 재사용의 안전장치다.

즉 **같은 `ValueTask<T>`를 두 번 `await` 하면 이미 다른 연산에 재활용된 소스를 읽게 될 수 있다.** 결과는 `InvalidOperationException`이거나, 더 나쁘게는 **엉뚱한 값**이다.

> **💡 함정을 피하는 가장 쉬운 방법**
>
> **메서드 호출을 곧바로 `await` 하라.**
>
> ```csharp
> await FooAsync();          // 안전
> ```
>
> 오류의 문이 열리는 것은 값 태스크를 변수에 담을 때다.
>
> ```csharp
> ValueTask<int> valueTask = FooAsync();   // 주의!
> // 이제부터 valueTask 사용이 오류로 이어질 수 있다
> ```
>
> 담아 둬야 한다면 즉시 일반 태스크로 바꿔라.
>
> ```csharp
> Task<int> task = FooAsync().AsTask();    // 안전
> ```

### `WhenAll`에 넣을 때

`Task.WhenAll`과 `Task.WhenAny`는 `Task` 배열을 받는다. `ValueTask<T>`를 여러 개 모아 병렬로 기다리려면 **각각 `AsTask()`를 호출해야 한다.**

```csharp
// 옳은 코드
var tasks = items.Select (item => ProcessAsync (item).AsTask());   // ValueTask → Task
int[] results = await Task.WhenAll (tasks);
```

여기서 아이러니가 하나 생긴다. **`AsTask()`를 호출하면 태스크 할당이 발생한다.** `ValueTask<T>`로 아끼려던 할당이 다시 생기는 것이다. 심지어 캐시된 `Task<T>`를 쓰는 설계였다면 오히려 손해다.

.NET 문서가 지적한 대로다.

> "결과를 `await`로 소비하는 것 이외의 용도에서는 `ValueTask<TResult>`가 더 복잡한 프로그래밍 모델로 이어질 수 있고, 그것이 오히려 더 많은 할당을 낳을 수 있다. 예컨대 캐시된 태스크를 흔한 결과로 돌려주는 `Task<TResult>` 메서드와 `ValueTask<TResult>` 메서드를 비교해 보라. 소비자가 결과를 `Task.WhenAll`이나 `Task.WhenAny`에 쓰고 싶다면 `AsTask`로 변환해야 하고, 애초에 캐시된 `Task<TResult>`를 썼다면 없었을 할당이 생긴다."

### `ValueTask`의 대가

`ValueTask<T>`는 공짜가 아니다. 같은 문서가 두 가지 대가를 짚는다.

**대가 1 — 크기가 크다.**

> "`ValueTask<TResult>`는 성공 결과가 동기적으로 준비된 경우 할당을 피하는 데 도움이 되지만, 필드를 두 개 가지고 있다. 반면 참조 타입인 `Task<TResult>`는 필드 하나다. 즉 메서드가 필드 하나가 아니라 두 개 분량의 데이터를 반환하게 되며, 복사할 데이터가 더 많다는 뜻이다. 또한 이것을 반환하는 메서드를 `async` 메서드 안에서 `await` 하면, **참조 하나가 아니라 두 필드짜리 구조체를 저장해야 하므로 그 `async` 메서드의 상태 기계가 더 커진다.**"

마지막 문장이 중요하다. **`ValueTask<T>`를 `await` 하는 상태 기계는 더 커진다.** 그 상태 기계가 힙으로 올라가면 더 많은 메모리를 쓴다. 즉 `ValueTask<T>`가 이득을 주려면 **동기 완료가 정말로 흔해야 한다.**

**대가 2 — 프로그래밍 모델이 까다롭다.** 위의 금지 목록이 그 대가다.

### `IValueTaskSource<T>`와 풀링

비동기 경로에서도 할당을 없애고 싶다면 세 번째 형태를 쓴다. `IValueTaskSource<T>` 구현체를 만들고 **풀에서 빌려 쓰는 것**이다.

```csharp
public ValueTask<string> ReadFileAsync3 (string filename)
{
    if (!File.Exists (filename))
        return new ValueTask<string> ("!");        // 동기 경로: 할당 0

    var cachedOp = pool.Rent();                    // 풀에서 소스를 빌린다
    return cachedOp.RunAsync (filename, pool);     // 비동기 경로도 할당 0
}

private ObjectPool<FileReadingPooledValueTaskSource> pool =
    new ObjectPool<FileReadingPooledValueTaskSource> (
        () => new FileReadingPooledValueTaskSource(), 10);
```

`IValueTaskSource<T>`를 구현하려면 세 메서드가 필요하다.

- `GetStatus(short token)` — 토큰을 검증하고 완료 상태를 반환한다.
- `GetResult(short token)` — 토큰을 검증하고 결과를 반환하거나 예외를 던진다.
- `OnCompleted(Action<object>, object, short, ValueTaskSourceOnCompletedFlags)` — 연속을 등록한다.

여기에 편의상 연산을 시작하는 메서드와 완료에 반응하는 메서드를 더한다.

> **⚠️ 직접 `IValueTaskSource`를 구현하지 마라**
>
> 완전히 동작하고 스레드 안전한 `IValueTaskSource` 구현은 **결코 간단하지 않다.** 버전 토큰 관리, 경쟁 조건, 연속 등록의 원자성, 풀 반납 시점 — 어느 하나라도 틀리면 조용히 잘못된 결과를 내는 버그가 된다.
>
> 대부분의 경우 `System.Threading.Tasks.Sources.ManualResetValueTaskSourceCore<T>`를 **필드로 품고 위임하는 것**이 정답이다. 이 구조체가 버전 토큰과 연속 관리를 대신해 준다. 컴파일러가 비동기 반복자를 만들 때 쓰는 것과 같은 물건이다(47.11절).

### 런타임의 자동 풀링 ※.NET 5 이상

.NET 5부터 **`async ValueTask` 메서드의 상태 기계 상자 자체를 풀링하는** 실험적 기능이 들어왔다. 환경 변수로 켠다.

```bash
DOTNET_SYSTEM_THREADING_POOLASYNCVALUETASK=1
```

이 기능은 `IValueTaskSource`와 `IValueTaskSource<TResult>`를 구현하는 상태 기계 상자 객체를 만들고, 런타임이 그 객체들을 풀에 넣어 재사용한다. 즉 **비동기 경로에서도 할당이 사라진다.**

.NET 6부터는 메서드 단위로 지정할 수도 있다 ※.NET 6.

```csharp
using System.Runtime.CompilerServices;
using System.Threading.Tasks;

// 메서드에 직접 빌더를 지정한다 ※C# 10부터 메서드 수준 지정이 가능하다
[AsyncMethodBuilder (typeof (PoolingAsyncValueTaskMethodBuilder<>))]
public async ValueTask<int> HotPathAsync() { /* ... */ }
```

> **⚠️ 풀링을 켜기 전에 측정하라**
>
> 풀링은 할당을 없애는 대신 **풀 접근 비용(경합 포함)과 캐시 지역성 변화**를 들여온다. 할당이 병목이 아닌 코드에서는 오히려 느려질 수 있다. 이 기능이 기본으로 켜져 있지 않고 실험적으로 남아 있는 이유이기도 하다.
>
> 67장의 원칙 그대로다. **측정 없이 최적화 없다.**

### 언제 `Task`가 더 나은가

정리하면 이렇다.

| 상황 | 권장 |
|---|---|
| 동기 완료가 **드물다** (일반적인 네트워크·DB 호출) | **`Task` / `Task<T>`** |
| 동기 완료가 **흔하다** (버퍼링 읽기, 캐시 조회) | `ValueTask<T>` |
| 반환값이 없고 예외 없이 동기 완료가 흔하다 | **`Task`** (인프라가 완료 태스크를 캐시한다) |
| 결과를 여러 곳에서 여러 번 관찰해야 한다 | **`Task<T>`** |
| `WhenAll`/`WhenAny`에 자주 넘긴다 | **`Task<T>`** |
| 결과를 캐시에 담아 두고 재사용한다 | **`Task<T>`** |
| 공개 API의 안정된 계약을 만든다 | **`Task<T>`** (소비자 실수 여지가 적다) |
| 프로파일러가 태스크 할당을 병목으로 지목했다 | `ValueTask<T>` 검토 |

> **💡 기본값은 `Task`다**
>
> 실무 지침 하나. **`ValueTask<T>`를 기본 선택지로 삼지 마라.** `Task<T>`가 기본이고, `ValueTask<T>`는 **측정으로 정당화되는 미시 최적화**다.
>
> 그럼에도 `ValueTask<T>`의 주의 사항을 알아 둘 값어치는 있다. **BCL의 일부 메서드가 이미 `ValueTask<T>`를 반환하고**(`Stream.ReadAsync`의 `Memory<byte>` 오버로드, `ChannelReader<T>.ReadAsync` 등), **`IAsyncEnumerable<T>`가 이것을 쓰기 때문이다.**

---

## 47.14 `async void` 금지, sync-over-async 금지 — 데드락의 해부

### 데드락의 재현

가장 유명한 비동기 사고를 정확히 해부하자. WPF 애플리케이션의 코드다.

```csharp
private sealed class MyWpfWindow : Window
{
    public MyWpfWindow() { Title = "WPF Window"; }

    protected override void OnActivated (EventArgs e)
    {
        // Result 프로퍼티를 조회하면 GUI 스레드가 반환하지 못한다.
        // 결과를 기다리며 블로킹한다
        string http = GetHttp().Result;      // ★ 여기서 멎는다 ★
        base.OnActivated (e);
    }

    private async Task<string> GetHttp()
    {
        HttpResponseMessage msg = await new HttpClient().GetAsync ("https://example.com");
        // 여기에 절대 도달하지 못한다
        return await msg.Content.ReadAsStringAsync();
    }
}
```

### 단계별 그림

무슨 일이 일어나는지 그림으로 그리자.

```text
  UI 스레드                                   스레드 풀 / I/O 완료
 ─────────────────────────────────────────   ────────────────────────────
  ① OnActivated 진입
      │
      ↓
  ② GetHttp() 호출
      │   (동기적으로 실행된다)
      ↓
  ③ GetAsync(...) 호출 → 태스크 T1 반환
      │
      ↓
  ④ await T1
      │   T1.IsCompleted == false
      │   → 연속을 등록한다
      │   → SynchronizationContext.Current(=WPF 컨텍스트)를 캡처한다
      │   → GetHttp()가 반환한다 (미완료 태스크 T2를 돌려주며)
      ↓
  ⑤ .Result 접근
      │   T2가 아직 미완료
      │   → UI 스레드가 여기서 ★블로킹★
      │   → 메시지 루프가 멈춘다
      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
      ▓ 블로킹 상태     ▓             ⓐ HTTP 응답 도착
      ▓                 ▓                 │
      ▓                 ▓                 ↓
      ▓                 ▓             ⓑ T1이 완료된다
      ▓                 ▓                 │
      ▓                 ▓                 ↓
      ▓                 ▓             ⓒ 캡처해 둔 컨텍스트로
      ▓                 ▓                연속을 Post 한다
      ▓                 ▓                 │
      ▓                 ▓                 ↓
      ▓                 ▓  ← ← ← ← ←  ⓓ 연속이 UI 스레드의
      ▓                 ▓                메시지 큐에 들어간다
      ▓  큐를 처리할    ▓
      ▓  스레드가       ▓             ⓔ 그런데 UI 스레드는
      ▓  블로킹 중!     ▓                ⑤에서 블로킹 중이므로
      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                큐를 처리하지 못한다

              ★ 데드락 ★
   UI 스레드는 T2의 완료를 기다린다.
   T2는 T1의 연속이 실행되어야 완료된다.
   T1의 연속은 UI 스레드에서만 실행될 수 있다.
   → 순환 대기
```

핵심을 세 문장으로 압축하면 이렇다.

1. **컨텍스트가 단일 스레드다.** WPF/WinForms의 동기화 컨텍스트는 델리게이트를 UI 스레드 하나로만 보낼 수 있다.
2. **연속이 그 스레드를 필요로 한다.** `ConfigureAwait`을 쓰지 않았으므로 연속이 그 컨텍스트로 게시된다.
3. **그 스레드는 `.Result`에서 블로킹돼 있다.** 그러니 게시된 연속을 영원히 처리하지 못한다.

이 세 조건이 모두 성립할 때 데드락이 난다. **하나라도 깨지면 데드락은 나지 않는다.**

### 왜 `ConfigureAwait(false)`가 완치가 아닌가

조건 2를 깨는 것이 `ConfigureAwait(false)`다.

```csharp
private async Task<string> GetHttp()
{
    HttpResponseMessage msg = await new HttpClient()
        .GetAsync ("https://example.com")
        .ConfigureAwait (false);
    // 이제 도달한다. 스레드 풀 스레드가 이 코드를 실행하기 때문이다
    return await msg.Content.ReadAsStringAsync().ConfigureAwait (false);
}
```

이러면 위 예제의 데드락은 사라진다. 그런데 **이것을 해법이라고 부르면 안 된다.** 이유가 넷이다.

> **⚠️ `ConfigureAwait(false)`가 데드락의 해법이 아닌 네 가지 이유**
>
> **첫째, 하나라도 빠뜨리면 다시 데드락이 난다.** 호출 그래프의 **모든** `await`에 붙어야 한다. 우리 코드뿐 아니라 우리가 호출하는 라이브러리의 코드까지. 남의 라이브러리 안까지 강제할 방법은 없다.
>
> **둘째, 스레드 풀 기아 형태의 데드락은 그대로 남는다.** 동기화 컨텍스트가 없는 ASP.NET Core에서도, 콘솔 앱에서도 다음이 성립한다. `.Result`로 블로킹하는 스레드 풀 스레드가 늘어나면 풀이 스레드를 주입하려 하고(46.2절), 주입은 초당 한두 개꼴로 느리다. 부하가 걸린 서버에서 이건 실질적 정지다. 46.2절에서 본 **스레드 풀 기아(thread pool starvation)** 가 정확히 이 시나리오다.
>
> **셋째, 스레드를 낭비한다는 근본 문제는 그대로다.** 47.2절 전체가 "대기를 위해 스레드를 쓰지 마라"는 이야기였다. `.Result`는 그 원칙을 정면으로 위반한다. `ConfigureAwait(false)`는 데드락만 없앨 뿐 낭비는 그대로 둔다.
>
> **넷째, `ConfigureAwait(false)`가 있어도 동기 완료 경로에서는 컨텍스트를 벗어나지 않는다.** 태스크가 이미 완료됐으면 `await`가 빠른 경로를 타므로 스레드가 그대로 이어진다. 즉 "라이브러리를 호출했으니 스레드 풀에 있겠지"라는 가정은 항상 참이 아니다.

**진짜 해법은 하나다. `async`를 위로 전파하라(async all the way).**

```csharp
protected override async void OnActivated (EventArgs e)   // 이벤트 핸들러이므로 async void 허용
{
    string http = await GetHttp();
    base.OnActivated (e);
}
```

전파할 수 없는 지점(진입점, 이벤트 핸들러, 재정의할 수 없는 동기 가상 메서드)까지 밀어붙이고, 거기서 멈춘다.

### `GetAwaiter().GetResult()` — 나은 점 하나

블로킹 방식 세 가지의 차이를 정확히 정리하자.

| 코드 | 완료 대기 | 실패 시 던지는 예외 | 취소 시 |
|---|---|---|---|
| `task.Wait()` | 한다 | `AggregateException` | `AggregateException` (안에 `TaskCanceledException`) |
| `task.Result` | 한다 | `AggregateException` | `AggregateException` |
| `task.GetAwaiter().GetResult()` | 한다 | **첫 내부 예외를 그대로** | `OperationCanceledException` 계열을 그대로 |

**`GetAwaiter().GetResult()`가 `.Result`보다 나은 점은 오직 하나 — 예외 언래핑이다.** `AggregateException`으로 감싸지 않고 원래 예외를 그대로 던진다. 그래서 `catch (HttpRequestException)`이 자연스럽게 동작한다.

> **⚠️ 그래도 쓰면 안 된다**
>
> 예외 언래핑이 낫다는 사실이 "그러니 `GetAwaiter().GetResult()`를 쓰자"로 이어지면 안 된다. **세 가지 모두 블로킹이고, 셋 다 같은 데드락과 같은 스레드 낭비를 만든다.** 나은 것은 예외 메시지의 모양뿐이다.
>
> 정당한 사용처는 아주 좁다.
>
> - **애플리케이션의 최상단 진입점.** `async Main`이 없던 시절의 `Main`, 또는 `async` 진입점을 지원하지 않는 호스트. (컴파일러가 만드는 `async Main` 래퍼가 정확히 이것을 한다.)
> - **`Dispose()` 안.** `IAsyncDisposable`을 쓸 수 없는 자리에서 어쩔 수 없이(33.6절). 이 경우조차 위험하다.
> - **비동기를 지원하지 않는 프레임워크와의 경계.** 그리고 그 경계에서 스레드 하나를 잃는 대가를 의식하고 있을 때.
>
> 이 목록에 "편의상"은 없다.

### `async void`의 세 가지 문제

`async void`가 왜 금지 대상인지 정리하자.

**문제 1 — 완료를 알 수 없다.**

`void`를 반환하는 `async` 함수는 `Task` 객체를 만들지 않는다. 만들어 봐야 쓸 방법이 없기 때문이다. 결과적으로 **`void` 반환 `async` 함수의 상태 기계가 언제 완주했는지 알 방법이 없다.**

```csharp
static async void MethodReturningVoidAsync()
{
    await Task.Run (() => Thread.Sleep (4_000));
    Console.WriteLine ("완료");
}

MethodReturningVoidAsync();
Console.WriteLine ("Completed");     // 이 줄이 먼저 찍힌다
```

"발사하고 잊기(fire and forget)" 시나리오에 쓸 만해 보이지만, "잊는다"는 것은 **완료도, 실패도 모른다**는 뜻이다.

**문제 2 — 예외를 잡을 수 없다.**

```csharp
static async void MethodReturningVoidAsync()
{
    await Task.Run (() =>
    {
        Thread.Sleep (4_000);
        throw new Exception ("Something bad happened");
    });
    Console.WriteLine ("완료");
}

try
{
    MethodReturningVoidAsync();          // 예외가 여기서 잡히지 않는다
}
catch (Exception e)
{
    Console.WriteLine (e);               // 절대 실행되지 않는다
}
```

`catch` 블록이 예외를 잡지 못한다. `AsyncVoidMethodBuilder`가 처리되지 않은 예외를 잡아서 **캡처된 동기화 컨텍스트로 다시 던진다.** 컨텍스트가 있으면 GUI 스레드가 결국 다시 던지고, 없으면 스레드 풀 스레드가 다시 던진다. **대개 프로세스 전체가 종료된다.**

`Task`를 반환하도록 바꾸면 다르다.

```csharp
static async Task MethodReturningTaskAsync()
{
    await Task.Run (() =>
    {
        Thread.Sleep (4_000);
        throw new Exception ("Something bad happened");
    });
}

try
{
    await MethodReturningTaskAsync();    // ← await 해야 잡힌다
}
catch (Exception ex)
{
    Console.WriteLine (ex);              // 정상적으로 잡힌다
}
```

**`await`를 붙이지 않으면 여전히 잡히지 않는다.** 예외가 태스크에 담기고, 아무도 그 태스크를 보지 않으므로 관찰되지 않은 예외가 된다(46.11절).

**문제 3 — 조합할 수 없다.**

`async void` 메서드는 `await` 할 수 없고, `Task.WhenAll`에 넣을 수 없고, 취소나 타임아웃을 걸 수 없다. 비동기의 모든 조합 능력을 잃는다.

### 유일한 허용 예외 — 이벤트 핸들러

`async void`가 존재하는 이유는 딱 하나다. **이벤트 핸들러의 시그니처와의 호환성.**

거의 모든 이벤트 핸들러가 다음 모양을 따른다.

```csharp
void EventHandlerCallback (object sender, EventArgs e);
```

그런데 이벤트 핸들러 안에서 I/O를 하고 싶은 일이 흔하다. 사용자가 UI 요소를 클릭해서 파일을 열고 읽는 경우 같은 것. UI 응답성을 유지하려면 그 I/O가 비동기여야 하고, `await`를 쓰려면 메서드가 `async`여야 한다. 반환 타입은 `void`로 고정돼 있으므로, C#이 `async void`를 허용해야만 한다.

```csharp
private async void LoadStockPrice (object sender, EventArgs e)
{
    string ticker = tickerInput.Text;
    decimal price = await stockPriceService.FetchPriceAsync (ticker);
    priceDisplay.Text = price.ToString ("c");
}

// 평범한 이벤트 핸들러처럼 구독한다
loadStockPriceButton.Click += LoadStockPrice;
```

호출하는 쪽(버튼의 `OnClick` 메서드)은 이 핸들러가 언제 끝나는지 신경 쓰지 않는다. 그냥 델리게이트를 부를 뿐이다.

> **💡 이벤트 핸들러 `async void`의 안전 규칙**
>
> 정당한 자리에서 쓸 때도 규칙이 있다.
>
> **핸들러 본문 전체를 `try`/`catch`로 감싸라.** 예외가 새어 나가면 프로세스가 죽는다.
>
> ```csharp
> private async void OnButtonClick (object sender, RoutedEventArgs e)
> {
>     try
>     {
>         button.IsEnabled = false;
>         await DoWorkAsync();
>     }
>     catch (Exception ex)
>     {
>         ShowError (ex);          // 사용자에게 보여 주거나 로깅한다
>     }
>     finally
>     {
>         button.IsEnabled = true;
>     }
> }
> ```
>
> **재진입을 막아라.** `await` 구간 동안 사용자가 버튼을 또 누를 수 있다. 위 코드에서 `IsEnabled = false`가 하는 일이 그것이다.
>
> **핸들러의 몸통을 `async Task` 메서드로 뽑아라.** 그러면 그 메서드는 테스트할 수 있다(47.17절).

### `OperationStarted` / `OperationCompleted`

`async void`에는 잘 알려지지 않은 동작이 하나 더 있다. **동기화 컨텍스트가 있으면, `void` 반환 비동기 함수가 진입할 때 `SynchronizationContext.OperationStarted()`를, 끝날 때 `OperationCompleted()`를 호출한다.**

이 훅이 있는 덕분에 `async void` 메서드를 테스트할 방법이 생긴다. 커스텀 동기화 컨텍스트를 만들어 이 두 메서드를 재정의하면 **미완료 `async void` 연산의 개수를 셀 수 있다.** 47.17절에서 다시 언급한다.

### 금지 목록 요약

| 하지 말 것 | 대신 | 예외 |
|---|---|---|
| `async void` | `async Task` | 이벤트 핸들러 |
| `task.Result` | `await task` | 최상단 진입점 |
| `task.Wait()` | `await task` | 최상단 진입점 |
| `task.GetAwaiter().GetResult()` | `await task` | 최상단 진입점, `Dispose` |
| `Task.WaitAll(...)` | `await Task.WhenAll(...)` | — |
| `Task.WaitAny(...)` | `await Task.WhenAny(...)` | — |
| `Task.Run(() => Sync())`로 비동기 흉내 | 진짜 비동기 API | CPU 바운드를 UI에서 밀어낼 때 |
| `async` 람다를 `Action` 자리에 | `Func<Task>` 오버로드 | — |
| `lock` 안의 `await` | `SemaphoreSlim.WaitAsync` | — |

> **📌 분석기로 강제하라**
>
> 이 목록의 대부분은 정적 분석으로 잡을 수 있다. .NET SDK에 포함된 규칙 중 관련된 것들이 있다.
>
> | 규칙 | 내용 |
> |---|---|
> | CA2007 | `Task`를 직접 `await` 하지 마라(= `ConfigureAwait`를 붙여라). 라이브러리 프로젝트에서만 켠다 |
> | CA2008 | `TaskScheduler`를 지정하지 않고 태스크를 만들지 마라 |
> | CA2012 | `ValueTask`를 올바르게 사용하라 |
> | CS1998 | `await`가 없는 `async` 메서드 (컴파일러 경고) |
> | CS4014 | `await` 하지 않은 호출 (컴파일러 경고) |
>
> 여기에 `Microsoft.VisualStudio.Threading.Analyzers` 패키지를 더하면 `async void`, sync-over-async, `.Result` 사용까지 잡아 준다. **코드 리뷰로 잡는 것보다 훨씬 싸다.**

---
## 47.15 TAP(태스크 기반 비동기 패턴) 규약

### 규약의 목록

.NET은 `await` 할 수 있는 태스크 반환 비동기 메서드를 수백 개 노출한다. 그 대부분이 **태스크 기반 비동기 패턴(Task-Based Asynchronous Pattern, TAP)** 이라는 규약을 (적어도 부분적으로) 따른다. 지금까지 서술한 것을 형식화한 것이다.

TAP 메서드는 다음을 만족한다.

| 항목 | 규약 |
|---|---|
| **반환 타입** | "뜨거운"(이미 실행 중인) `Task` 또는 `Task<TResult>` |
| **이름** | `Async` 접미사 (합성기 같은 특수한 경우 제외) |
| **취소** | 취소를 지원하면 `CancellationToken`을 받는 오버로드를 제공한다 |
| **진행 상황** | 진행 보고를 지원하면 `IProgress<T>`를 받는 오버로드를 제공한다 |
| **반환 시점** | 빠르게 호출자에게 돌아온다 (초기 동기 구간이 짧다) |
| **스레드** | I/O 바운드라면 스레드를 붙들지 않는다 |

### "뜨거운" 태스크 — 반환 전에 시작돼 있어야 한다

가장 자주 어겨지는 규약이 이것이다. **TAP 메서드가 반환하는 태스크는 이미 시작된 상태여야 한다.**

```csharp
// 잘못된 TAP 구현
public Task<int> ComputeAsync()
{
    return new Task<int> (() => Compute());     // ★ 차가운 태스크. 시작되지 않았다 ★
}
```

`new Task(...)`로 만든 태스크는 **차가운(cold)** 상태이고, 누군가 `Start()`를 불러야 실행된다. 호출자가 이것을 `await` 하면 **영원히 멎는다.** 아무도 시작시키지 않기 때문이다.

옳은 형태는 이렇다.

```csharp
public Task<int> ComputeAsync()
{
    return Task.Run (() => Compute());          // Run은 즉시 스케줄한다
}
```

`async` 메서드는 이 규약을 자동으로 지킨다. 호출 즉시 첫 `await`까지 동기 실행되므로 반환 시점에 이미 진행 중이다.

> **⚠️ `Task.Factory.StartNew`의 기본 옵션에 주의하라**
>
> 46.3절에서 다뤘듯 `Task.Factory.StartNew`는 `TaskScheduler.Current`를 쓰고 `TaskCreationOptions.None`을 기본값으로 삼는다. 그래서 부모 태스크 안에서 호출하면 예상치 못한 스케줄러에 붙는 등 놀라움이 있다. **일반적인 경우 `Task.Run`을 쓰라.**

### 이름 규약

메서드 이름에 `Async` 접미사를 붙인다. 소비자가 "여기 `await`가 필요하겠구나"를 즉시 알아보게 하는 시각적 표지다.

예외가 있다.

- **합성기(combinator)** — `Task.WhenAll`, `Task.WhenAny`처럼 의도가 명확한 것.
- **GUI 컨트롤의 이벤트 핸들러** — `OnButtonClick` 등.
- **MVC/Web API 스타일 앱의 액션 메서드** — 라우팅 규약과 충돌하기 때문.

### 매개변수 규약

**동기 대응 메서드가 있다면 매개변수의 이름·타입·순서를 맞춘다.** `out`과 `ref`는 쓸 수 없으므로(47.5절) 예외이며, 값을 돌려줘야 하면 `Task<TResult>`의 `TResult`를 쓰고, 여러 값이면 자료 구조로 묶는다.

취소 토큰을 받는 매개변수의 이름은 관례상 `cancellationToken`이고, 진행 상황은 `progress`다.

```csharp
public Task<byte[]> DownloadAsync (
    Uri address,
    CancellationToken cancellationToken = default,
    IProgress<int> progress = null)
{ /* ... */ }
```

> **📌 취소 토큰과 진행 매개변수의 순서**
>
> 관례는 취소 토큰을 마지막에 두는 것이다. `Stream.CopyToAsync(Stream, int, CancellationToken)`처럼 BCL 대부분이 그렇게 한다.
>
> 진행 매개변수가 함께 있으면 순서가 API마다 갈린다. BCL에도 `IAsyncInfo.AsTask(CancellationToken, IProgress<TProgress>)`처럼 **토큰이 앞에 오는** 예가 있다. 전역 표준이라고 부를 만한 것이 없으므로 **팀 안에서 하나를 정해 일관되게 쓰는 편이 낫다.**
>
> 동기 대응 메서드에 취소 토큰이 없더라도 비동기 버전에는 추가하는 것을 고려하라. 나중에 넣기가 훨씬 고통스럽다.

> **💡 취소를 처음부터 열어 두라**
>
> 취소는 스택 전체의 협력이 필요하다. 취소 토큰을 받지 않는 메서드를 쓰게 되면 할 수 있는 일이 별로 없다. 억지로 우회할 수는 있다 — `Task.WhenAny`로 취소 태스크와 경쟁시키고 원래 태스크의 결과를 버리는 것(46.9절) — 하지만 **진행 중인 작업은 계속 돌고 있고**, 그 작업이 반환할 `IDisposable` 자원까지 신경 써야 한다.
>
> 당장 취소 요구사항이 없어도 **처음부터 일관되게 토큰을 열어 두는 편**이 낫다. 받은 토큰을 자기가 호출하는 모든 비동기 메서드에 그대로 넘기기만 하면 된다.

### 예외 규약 — 인수 검증만 동기적으로 던진다

TAP의 예외 규약은 이렇다.

> **사용 오류(잘못된 인수 등)만 비동기 메서드에서 동기적으로 던진다. 그 밖의 모든 예외와 오류는 반환되는 태스크에 담는다.**

47.5절에서 본 대로 `async` 메서드는 예외를 직접 던지지 않는다. 첫 줄에서 던져도 실패한 태스크가 돌아온다. 그런데 **인수 검증은 즉시 실패하는 편이 낫다.** 문제가 있는 호출을 만든 곳에서 바로 스택 트레이스를 얻을 수 있고, 시스템이 더 나쁜 상태로 가기 전에 멈출 수 있기 때문이다.

BCL도 이렇게 한다. `HttpClient.GetStringAsync`에 `null`을 넘기면 **즉시** 예외를 던진다.

해법은 **비-`async` 래퍼 메서드 + 구현 메서드**다. 반복자에서 쓴 것과 정확히 같은 구조다(28.6절).

```csharp
using System;
using System.Threading.Tasks;

// 공개 API: async가 아니므로 예외가 태스크에 감싸이지 않는다
static Task<int> ComputeLengthAsync (string text)
{
    if (text == null)
    {
        throw new ArgumentNullException (nameof (text));    // 동기적으로 던진다
    }
    return Impl (text);

    // 지역 함수: 검증된 입력을 가정한다  ※C# 7
    static async Task<int> Impl (string text)
    {
        await Task.Delay (500);
        return text.Length;
    }
}
```

구현을 표현하는 방법은 세 가지다.

- **별도의 `private async` 메서드** — 가장 단순하지만 클래스에 메서드가 하나 늘어난다.
- **`async` 익명 함수** — 클래스는 깨끗해지지만 델리게이트 할당이 생긴다.
- **`async` 지역 함수** ※C# 7 — 메서드도 늘지 않고 델리게이트도 만들지 않는다.

**지역 함수 방식이 가장 낫다.** `static` 지역 함수로 만들면 바깥 스코프를 캡처하지 않아 클로저 할당도 없다.

> **⚠️ 래퍼를 만들면 `async`를 빼는 것을 잊지 마라**
>
> 위 코드에서 `ComputeLengthAsync`에 `async`가 붙어 있으면 아무 효과가 없다. **`async` 메서드는 모든 예외를 태스크에 담기 때문이다.** 래퍼는 반드시 비-`async`여야 하고, 구현 메서드가 돌려주는 태스크를 그대로 반환해야 한다.

> **📌 이 패턴을 매번 써야 하는가**
>
> 실용적으로 판단하라. **공개 API 경계이고 인수 검증이 있다면** 쓸 값어치가 있다. 내부 메서드나 검증이 없는 메서드에는 오히려 잡음이다.
>
> 시점 차이가 실제로 문제가 되는 경우는 생각보다 드물다. 대부분의 호출자가 곧바로 `await` 하기 때문이다. 문제가 되는 것은 **태스크를 만들어 두고 한참 뒤에 기다리는** 코드나, **`WhenAll`에 넣어 두고 나중에 실패를 보는** 코드다.

---

## 47.16 폐기된 패턴 — APM(`Begin`/`End`), EAP, `BackgroundWorker`

47.3절에서 형태만 봤던 두 모델을 여기서 **현대화 방법과 함께** 정리한다. 이 절의 목표는 이 패턴들을 배우는 것이 아니라, **레거시 코드에서 만났을 때 어떻게 감싸고 어떻게 걷어낼지**를 아는 것이다.

### APM — `BeginXxx` / `EndXxx` / `IAsyncResult`

가장 오래된 패턴이다. `Begin`으로 시작하는 메서드와 `End`로 시작하는 메서드 한 쌍, 그리고 `IAsyncResult` 인터페이스를 쓴다.

```csharp
public IAsyncResult BeginRead (byte[] buffer, int offset, int size,
                               AsyncCallback callback, object state);
public int EndRead (IAsyncResult asyncResult);

public delegate void AsyncCallback (IAsyncResult ar);
```

`Begin*`이 연산을 개시하고 토큰 역할을 하는 `IAsyncResult`를 돌려준다. 완료(또는 실패)하면 `AsyncCallback` 델리게이트가 발화하고, 그것을 처리하는 쪽이 `End*`를 호출해 반환값을 얻거나 예외를 다시 던지게 만든다.

APM 메서드를 다루는 가장 쉬운 방법은 **`TaskFactory.FromAsync` 어댑터**다. 내부적으로 `TaskCompletionSource`를 써서 APM 연산이 완료·실패할 때 신호되는 태스크를 만들어 준다(46.5절).

`FromAsync`가 요구하는 것은 셋이다.

- `BeginXxx` 메서드를 가리키는 델리게이트
- `EndXxx` 메서드를 가리키는 델리게이트
- 그 메서드들에 넘길 추가 인수들

```csharp
using System.Threading.Tasks;

// stream은 Stream, buffer는 byte[]
Task<int> readChunk = Task<int>.Factory.FromAsync (
    stream.BeginRead, stream.EndRead, buffer, 0, 1000, null);
```

`FromAsync`는 .NET에 있는 거의 모든 비동기 메서드 시그니처에 맞도록 오버로드돼 있다.

실제 사용 예를 보자. `NamedPipeServerStream`에는 `BeginWaitForConnection`/`EndWaitForConnection`은 있지만 `WaitForConnectionAsync`가 없던 시절의 코드다.

```csharp
private static async void StartServer()
{
    while (true)
    {
        var pipe = new NamedPipeServerStream (c_pipeName, PipeDirection.InOut, -1,
            PipeTransmissionMode.Message,
            PipeOptions.Asynchronous | PipeOptions.WriteThrough);

        // 오래된 APM을 FromAsync로 Task 모델로 변환한다
        await Task.Factory.FromAsync (
            pipe.BeginWaitForConnection, pipe.EndWaitForConnection, null);

        ServiceClientRequestAsync (pipe);   // 비동기이므로 즉시 반환된다
    }
}
```

> **⚠️ `IAsyncResult`를 받는 오버로드는 피하라**
>
> `FromAsync`에는 `IAsyncResult`를 직접 받는 오버로드와 `BeginXxx`/`EndXxx` 델리게이트를 받는 오버로드가 있다. **가능하면 후자를 쓰라.** 전자는 효율이 떨어진다. `Begin`을 이미 호출한 뒤이므로 완료 콜백을 최적화할 여지가 없기 때문이다.

### EAP — `XxxAsync` + `XxxCompleted` 이벤트

EAP는 2005년에 APM보다 단순한 대안으로, 특히 UI 시나리오를 겨냥해 도입됐다. `System.Net`의 `WebClient`가 대표 사례다.

```csharp
// WebClient의 EAP 멤버들
public byte[] DownloadData (Uri address);              // 동기 버전
public void DownloadDataAsync (Uri address);
public void DownloadDataAsync (Uri address, object userToken);
public event DownloadDataCompletedEventHandler DownloadDataCompleted;
public void CancelAsync (object userState);            // 연산 취소
public bool IsBusy { get; }                            // 아직 실행 중인지
```

`*Async` 메서드가 연산을 비동기로 개시하고, 완료되면 `*Completed` 이벤트가 발화한다(동기화 컨텍스트가 있으면 자동으로 그쪽으로 게시된다). 이벤트 인수 객체가 다음을 전달한다.

- 취소 여부 플래그 (소비자가 `CancelAsync`를 불렀는지)
- 던져진 예외를 담은 `Error` 객체
- `Async` 메서드 호출 시 넘긴 `userToken`

진행 보고용 이벤트를 노출할 수도 있다(`DownloadProgressChanged` 등).

**FCL은 EAP를 태스크 모델로 바꿔 주는 헬퍼를 제공하지 않는다.** 직접 손으로 감싸야 하고, 그때 쓰는 것이 `TaskCompletionSource`다(46.5절).

```csharp
using System;
using System.Threading.Tasks;

private static async Task<string> AwaitWebClient (Uri uri)
{
    var wc = new System.Net.WebClient();

    // TaskCompletionSource와 그 밑의 Task 객체를 만든다
    var tcs = new TaskCompletionSource<string>();

    // 문자열 다운로드가 끝나면 WebClient가 DownloadStringCompleted 이벤트를
    // 발생시키고, 그 핸들러가 TaskCompletionSource를 완료시킨다
    wc.DownloadStringCompleted += (s, e) =>
    {
        if (e.Cancelled) tcs.SetCanceled();
        else if (e.Error != null) tcs.SetException (e.Error);
        else tcs.SetResult (e.Result);
    };

    wc.DownloadStringAsync (uri);          // 비동기 연산 개시

    string result = await tcs.Task;        // 평범한 태스크로 대기한다
    return result;
}
```

세 갈래(취소·오류·성공)를 각각 `SetCanceled`/`SetException`/`SetResult`로 옮기는 것이 핵심이다.

> **⚠️ 이벤트 구독을 해제하라**
>
> 위 코드는 예제라 생략했지만 실무에서는 **이벤트 핸들러를 등록한 뒤 해제해야 한다.** `WebClient` 인스턴스를 재사용한다면 핸들러가 누적되고, 두 번째 다운로드에서 첫 번째 `TaskCompletionSource`를 다시 완료시키려다 `InvalidOperationException`이 난다.
>
> 또한 `SetResult` 대신 `TrySetResult` 계열을 쓰는 것이 안전하다. 이미 완료된 소스를 다시 완료시키려 하면 `Set*`은 던지고 `TrySet*`은 `false`를 돌려준다.
>
> 그리고 46.5절에서 강조한 대로, `TaskCompletionSource`를 만들 때 `TaskCreationOptions.RunContinuationsAsynchronously`를 넘기는 것을 고려하라. 그러지 않으면 `SetResult`를 호출한 스레드가 연속을 동기적으로 실행하게 되어 예상치 못한 재진입이 생긴다.

### `BackgroundWorker`

`System.ComponentModel.BackgroundWorker`는 EAP의 범용 구현이다. 리치 클라이언트 앱이 동기화 컨텍스트를 명시적으로 캡처하지 않고도 워커 스레드를 시작하고 완료·백분율 진행을 보고할 수 있게 해 준다.

```csharp
using System.ComponentModel;
using System.Threading;

var worker = new BackgroundWorker { WorkerSupportsCancellation = true };

worker.DoWork += (sender, args) =>
{
    // 워커 스레드에서 실행된다
    if (args.Cancel) return;
    Thread.Sleep (1000);
    args.Result = 123;
};

worker.RunWorkerCompleted += (sender, args) =>
{
    // UI 스레드에서 실행된다. UI 컨트롤을 안전하게 갱신할 수 있다
    if (args.Cancelled)
        Console.WriteLine ("Cancelled");
    else if (args.Error != null)
        Console.WriteLine ("Error: " + args.Error.Message);
    else
        Console.WriteLine ("Result is: " + args.Result);
};

worker.RunWorkerAsync();      // 동기화 컨텍스트를 캡처하고 연산을 시작한다
```

`RunWorkerAsync`가 연산을 시작하고 `DoWork` 이벤트를 풀 워커 스레드에서 발생시킨다. 동시에 동기화 컨텍스트를 캡처해 두었다가, 완료(또는 실패) 시 `RunWorkerCompleted`를 그 컨텍스트로 호출한다. 연속과 같은 동작이다.

**`BackgroundWorker`는 굵은 결의 동시성을 만든다.** `DoWork` 이벤트가 통째로 워커 스레드에서 돈다. 그 핸들러 안에서 UI 컨트롤을 갱신하려면(백분율 진행 메시지 게시 외에는) `Dispatcher.BeginInvoke` 같은 것을 써야 한다. 47.1절에서 이야기한 문제가 그대로 있다.

### 현대화 전략

레거시 코드에서 이들을 만났을 때의 판단표다.

| 만난 것 | 즉시 할 일 | 궁극적 목표 |
|---|---|---|
| `BeginXxx` / `EndXxx` (BCL 타입) | `XxxAsync`가 이미 있는지 확인한다. 대부분 있다 | `XxxAsync`로 교체 |
| `BeginXxx` / `EndXxx` (자체 코드) | `TaskFactory.FromAsync`로 감싸는 확장 메서드 하나 | 내부를 `async`로 재작성 |
| EAP (`XxxCompleted` 이벤트) | `TaskCompletionSource`로 감싸는 어댑터 | 타입 자체를 교체 (예: `WebClient` → `HttpClient`) |
| `BackgroundWorker` | 그대로 두고 새 코드부터 `async`/`await` | `async void` 이벤트 핸들러 + `IProgress<T>` + `CancellationToken` |
| `Thread`를 직접 만드는 코드 | 45.9절의 판단 기준 적용 | `Task.Run` 또는 진짜 비동기 |

`BackgroundWorker`를 현대화한 모습은 이렇다.

```csharp
private CancellationTokenSource _cts;

private async void OnStartClick (object sender, RoutedEventArgs e)
{
    _cts = new CancellationTokenSource();
    startButton.IsEnabled = false;
    try
    {
        // Progress<T>는 생성 시점의 동기화 컨텍스트로 콜백을 게시한다 (46.12절)
        var progress = new Progress<int> (pct => progressBar.Value = pct);
        int result = await DoWorkAsync (progress, _cts.Token);
        resultLabel.Text = result.ToString();
    }
    catch (OperationCanceledException)
    {
        resultLabel.Text = "취소됨";
    }
    catch (Exception ex)
    {
        resultLabel.Text = "오류: " + ex.Message;
    }
    finally
    {
        startButton.IsEnabled = true;
    }
}
```

`BackgroundWorker`의 세 이벤트(`DoWork`, `ProgressChanged`, `RunWorkerCompleted`)가 각각 `await` 되는 메서드, `IProgress<T>`, `await` 뒤의 코드로 흡수됐다. **흩어져 있던 세 조각이 하나의 순차적 코드로 합쳐진 것**이 언어 지원의 성과다.

> **📌 `Progress<T>`가 동기화 컨텍스트를 다루는 법**
>
> `Progress<T>`는 **인스턴스가 만들어질 때** `SynchronizationContext.Current`를 캡처한다. 그리고 `Report`가 호출될 때마다 그 컨텍스트로 `ProgressChanged` 이벤트를 게시한다. 컨텍스트가 없으면 스레드 풀을 대상으로 하는 기본 컨텍스트를 쓴다.
>
> 즉 **UI 스레드에서 `new Progress<int>(...)`를 하면 콜백도 UI 스레드에서 실행된다.** 워커 스레드에서 만들면 그렇지 않으므로, 만드는 위치가 중요하다. 자세한 것은 46.12절.

---

## 47.17 비동기 코드 테스트하기

### 테스트 메서드는 `async Task`여야 한다

거의 모든 단위 테스트 프레임워크가 비동기 테스트를 지원한다. 방법은 단순하다. **테스트 메서드에 `async` 한정자를 붙이고 `void` 대신 `Task`를 반환하도록 선언한다.**

```csharp
[Fact]                                   // xUnit
public async Task FetchesCorrectLength()
{
    var sut = new PageService (new FakeHttpClient ("hello"));
    int length = await sut.GetPageLengthAsync ("https://example.com");
    Assert.Equal (5, length);
}
```

> **⚠️ `async void` 테스트라는 함정**
>
> 테스트 메서드를 `async void`로 쓰면 **러너가 완료를 기다릴 방법이 없다.** 러너는 메서드를 호출하고 즉시 반환받은 뒤 "통과"로 기록한다. `await` 뒤의 `Assert`가 실패해도 그 예외는 태스크에 담기지도 않고 동기화 컨텍스트로 날아간다. **테스트가 조용히 통과한다.**
>
> 다행히 현대 프레임워크들은 이 실수를 잡아 준다.
>
> xUnit은 `async void` 테스트를 명시적으로 오류로 처리해 거부하고, NUnit도 지원하지 않음을 알린다. MSTest는 버전에 따라 다르며 최신 버전은 경고나 오류를 낸다.
>
> 그래도 **직접 만든 러너나 오래된 인프라에서는 여전히 조용히 통과한다.** 그리고 무엇보다, 테스트 대상 코드 안의 `async void`는 아무도 잡아 주지 않는다. 분석기를 켜라(47.14절).

### 완료된 태스크와 `TaskCompletionSource`

테스트에서 자주 필요한 것이 **이미 완료된 태스크**다.

```csharp
Task<int> ok        = Task.FromResult (42);
Task<int> failed    = Task.FromException<int> (new IOException ("disk"));
Task<int> cancelled = Task.FromCanceled<int> (new CancellationToken (canceled: true));
Task    done        = Task.CompletedTask;
```

더 유연한 제어가 필요하면 `TaskCompletionSource<TResult>`를 쓴다(46.5절). **진행 중인 연산을 표현하는 태스크를 만들어 두고, 테스트 안에서 원하는 시점에 결과(또는 예외·취소)를 설정**할 수 있다. 목(mock) 의존성이 돌려줄 태스크를 만들고 그 완료 시점을 테스트가 통제하고 싶을 때 대단히 유용하다.

```csharp
[Fact]
public async Task ShowsSpinnerWhileLoading()
{
    var tcs = new TaskCompletionSource<string> (
        TaskCreationOptions.RunContinuationsAsynchronously);

    var service = new FakeService (tcs.Task);
    var vm = new PageViewModel (service);

    Task loading = vm.LoadAsync();       // await 하지 않는다 — 진행 중 상태를 본다
    Assert.True (vm.IsBusy);             // 스피너가 돌고 있어야 한다

    tcs.SetResult ("payload");           // 이제 완료시킨다
    await loading;

    Assert.False (vm.IsBusy);
    Assert.Equal ("payload", vm.Content);
}
```

> **⚠️ `SetResult`는 연속을 동기적으로 실행할 수 있다**
>
> `TaskCompletionSource<TResult>`에서 결과를 설정하면 **연속이 같은 스레드에서 동기적으로 실행될 수 있다.** 정확히 어떻게 실행되는지는 스레드와 동기화 컨텍스트에 따라 달라진다.
>
> 위 예제에서 `RunContinuationsAsynchronously`를 넘긴 이유가 그것이다. 이 옵션이 없으면 `tcs.SetResult("payload")` 호출이 **그 자리에서** `LoadAsync`의 나머지를 전부 실행하고 돌아온다. 테스트에서는 그것이 오히려 편할 때도 있지만, 프로덕션 코드에서는 예상치 못한 재진입과 스택 깊이 문제를 만든다(46.5절).
>
> 가능성으로 알고 있으면 대처는 쉽다. 몰라서 몇 시간을 날리는 일만 피하면 된다.

### 예외를 검증하기

동기 코드의 `Assert.Throws`에 대응하는 비동기 버전이 있다.

```csharp
[Fact]
public async Task ThrowsOnMissingFile()
{
    var sut = new FileReader();
    await Assert.ThrowsAsync<FileNotFoundException> (
        () => sut.ReadAsync ("does-not-exist.txt"));
}
```

47.15절의 래퍼 패턴을 검증할 때는 **동기적으로 던져지는지**까지 봐야 한다.

```csharp
[Fact]
public void ValidatesArgumentsSynchronously()
{
    var sut = new FileReader();
    // await 없이 호출한다. 태스크를 돌려주기 전에 던져야 한다
    Assert.Throws<ArgumentNullException> (() => sut.ReadAsync (null));
}
```

`Assert.ThrowsAsync`를 썼다면 두 경우를 구분하지 못했을 것이다. **동기적으로 던지든 실패한 태스크를 돌려주든 똑같이 통과하기 때문이다.**

### 시간 의존성 제거 — `Task.Delay` 대신 `FakeTimeProvider`

비동기 테스트가 느려지는 가장 흔한 원인이 **실제 시간을 기다리는 것**이다.

```csharp
// 안티패턴: 테스트가 실제로 5초 걸린다
[Fact]
public async Task RetriesAfterDelay()
{
    await sut.RunWithRetryAsync();       // 안에 Task.Delay(5000)이 있다
}
```

해법은 **시간을 주입 가능한 의존성으로 만드는 것**이다. ※.NET 8부터 `TimeProvider` 추상이 BCL에 들어왔다(37.9절).

```csharp
using System;
using System.Threading;
using System.Threading.Tasks;

public sealed class RetryPolicy
{
    private readonly TimeProvider _time;

    public RetryPolicy (TimeProvider time) => _time = time;

    public async Task<T> ExecuteAsync<T> (
        Func<Task<T>> operation, int maxAttempts, CancellationToken token = default)
    {
        for (int attempt = 1; ; attempt++)
        {
            try { return await operation().ConfigureAwait (false); }
            catch when (attempt < maxAttempts)
            {
                var backoff = TimeSpan.FromSeconds (Math.Pow (2, attempt - 1));
                // Task.Delay 대신 TimeProvider를 쓴다
                await Task.Delay (backoff, _time, token).ConfigureAwait (false);
            }
        }
    }
}
```

테스트에서는 `Microsoft.Extensions.TimeProvider.Testing` 패키지의 `FakeTimeProvider`를 주입하고, `Advance`로 시계를 앞으로 돌린다.

```csharp
[Fact]
public async Task BacksOffExponentially()
{
    var time = new FakeTimeProvider();
    var sut = new RetryPolicy (time);
    int calls = 0;

    Task<int> task = sut.ExecuteAsync (() =>
    {
        calls++;
        if (calls < 3) throw new IOException();
        return Task.FromResult (42);
    }, maxAttempts: 3);

    Assert.Equal (1, calls);
    time.Advance (TimeSpan.FromSeconds (1));    // 첫 백오프
    Assert.Equal (2, calls);
    time.Advance (TimeSpan.FromSeconds (2));    // 두 번째 백오프
    Assert.Equal (42, await task);
}
```

**테스트가 밀리초 안에 끝나고, 백오프 간격이 정확한지까지 검증한다.** 실제 시간을 기다리는 테스트로는 후자를 검증할 수 없다.

> **💡 `Task.Delay`에 `TimeProvider` 오버로드가 있다**
>
> ※.NET 8부터 `Task.Delay(TimeSpan, TimeProvider, CancellationToken)` 오버로드가 있다. 기존 코드에서 `Task.Delay(x)`를 `Task.Delay(x, _time)`으로 바꾸기만 하면 되므로 도입 비용이 낮다. `PeriodicTimer`와 `CancellationTokenSource`에도 `TimeProvider`를 받는 생성자가 있다(46.6절).

### 데드락을 재현하는 테스트

47.14절의 데드락은 **동기화 컨텍스트가 없으면 재현되지 않는다.** 그래서 콘솔 기반 테스트 러너에서는 잘 잡히지 않고, 프로덕션 UI 앱에서만 터진다.

재현하려면 **단일 스레드 동기화 컨텍스트를 테스트에 주입**하면 된다.

```csharp
[Fact]
public void DoesNotDeadlockUnderSingleThreadedContext()
{
    var previous = SynchronizationContext.Current;
    try
    {
        // 델리게이트를 큐에 넣고 하나의 스레드로만 처리하는 컨텍스트를 설치한다.
        // (직접 구현하거나 라이브러리의 것을 쓴다)
        var ctx = new SingleThreadedSynchronizationContext();
        SynchronizationContext.SetSynchronizationContext (ctx);

        // 데드락이 있으면 여기서 멎으므로 반드시 타임아웃을 건다
        ctx.Run (async () =>
        {
            var result = await sut.DoWorkAsync().WaitAsync (TimeSpan.FromSeconds (5));
            Assert.NotNull (result);
        });
    }
    finally
    {
        SynchronizationContext.SetSynchronizationContext (previous);
    }
}
```

이런 컨텍스트를 직접 만들 수도 있고, `Microsoft.VisualStudio.Threading` 같은 라이브러리가 제공하는 것을 쓸 수도 있다. 47.14절에서 언급한 `OperationStarted`/`OperationCompleted`를 재정의하면 **`async void` 메서드의 완료까지 셀 수 있어서** `async void` 코드도 테스트 대상이 된다.

> **⚠️ 멎는 테스트를 만들지 마라**
>
> 비동기 테스트에서 데드락이나 완료되지 않는 태스크를 만나면 **테스트가 영원히 멎는다.** CI 파이프라인이 타임아웃될 때까지 아무 정보도 주지 않는다.
>
> 대비책 두 가지를 항상 함께 써라.
>
> 1. **`WaitAsync`로 개별 대기에 타임아웃을 건다** ※.NET 6 (46.9절).
>    ```csharp
>    var result = await sut.RunAsync().WaitAsync (TimeSpan.FromSeconds (5));
>    ```
> 2. **테스트 프레임워크의 타임아웃 기능을 켠다.** xUnit이라면 `[Fact(Timeout = 5000)]`, NUnit이라면 `[Timeout(5000)]`.
>
> 타임아웃이 있으면 최소한 **어느 테스트가 멎었는지**는 알 수 있다. 그것만으로도 진단 시간이 크게 줄어든다.

### 결정론적 스케줄링

비동기 테스트가 간헐적으로 실패한다면(플레이키 테스트) 원인은 대개 **스케줄링에 의존하는 단정문**이다.

```csharp
// 나쁜 테스트: 언제 IsBusy가 true가 되는지 보장이 없다
Task t = vm.LoadAsync();
Assert.True (vm.IsBusy);
```

`LoadAsync`가 `await`에 도달하기 전에 이 단정문이 실행된다는 보장이 있는가? **있다.** 47.4절에서 확인한 대로 `async` 메서드는 첫 미완료 `await`까지 동기적으로 실행되기 때문이다. `IsBusy = true`가 그 앞에 있다면 안전하다.

하지만 다음은 다르다.

```csharp
// 나쁜 테스트: 스레드 풀 스케줄링에 의존한다
Task t = Task.Run (() => vm.Load());
Thread.Sleep (100);                   // ★ 절대 하지 마라 ★
Assert.True (vm.IsBusy);
```

`Thread.Sleep`으로 "아마 이쯤이면 됐겠지"를 하는 순간 테스트는 플레이키가 된다. **명시적 동기화 지점을 만들어라.**

| 목적 | 도구 |
|---|---|
| "여기까지 진행됐다"를 기다린다 | `TaskCompletionSource` (테스트 대상이 신호를 보내게 한다) |
| 완료 순서를 통제한다 | 여러 개의 `TaskCompletionSource`를 원하는 순서로 완료시킨다 |
| 시간 경과를 통제한다 | `FakeTimeProvider` (37.9절) |
| 취소 시점을 통제한다 | `CancellationTokenSource.Cancel()`을 직접 호출 |
| 연속이 도는 스레드를 통제한다 | 커스텀 `SynchronizationContext` |
| 진행 보고를 검증한다 | `IProgress<T>`의 테스트 더블 (46.12절) |

> **💡 테스트 가능성이 설계를 밀어낸다**
>
> 비동기 코드를 테스트하기 어렵다면 대개 **설계가 결합돼 있다**는 신호다.
>
> - `DateTime.UtcNow`, `Task.Delay`, `HttpClient`를 직접 만들지 말고 주입받아라.
> - `async void` 이벤트 핸들러의 본문을 `async Task` 메서드로 뽑아라. 그 메서드가 테스트 대상이다.
> - `ConfigureAwait(false)`를 라이브러리에 일관되게 붙여 두면, 테스트가 어떤 컨텍스트에서 돌든 결과가 같아진다.
>
> 테스트 가능한 설계 전반은 80장에서, 비동기 테스트는 80.3절에서 다시 다룬다.

---

## 이 장의 요약

- **비동기의 정의는 스레드가 아니라 반환 시점이다.** 동기 연산은 호출자에게 돌아가기 전에 일을 끝내고, 비동기 연산은 돌아간 뒤에 끝낸다. 이 정의에 스레드는 등장하지 않는다.
- **I/O가 진행되는 동안에는 어떤 스레드도 필요 없다.** 하드웨어가 DMA로 일하고, 완료는 I/O 완료 포트(또는 `epoll`/`io_uring`)를 통해 큐로 온다. 스레드를 붙들고 기다리는 것은 메모리와 스케줄러 슬롯만 낭비하는 일이다. 그래서 동기 API를 `Task.Run`으로 감싸는 것은 거의 항상 틀린 해법이다.
- **`async`는 시그니처의 일부가 아니라 구현 세부다.** 메타데이터에 남지 않고, 인터페이스나 추상 메서드 선언에 쓸 수 없으며, 붙였다 뗐다 해도 소스·바이너리 호환성이 유지된다. 컴파일러에게 "본문을 상태 기계로 재작성하라"고 지시하는 것이 전부다.
- **`async` 메서드는 첫 미완료 `await`까지 호출자의 스레드에서 동기적으로 실행된다.** 새 스레드는 만들어지지 않는다. 그래서 메서드 앞부분의 무거운 계산이 UI를 멈춘다.
- **awaitable은 인터페이스가 아니라 덕 타이핑이다.** `GetAwaiter()`(확장 메서드 가능)가 `INotifyCompletion`을 구현하고 `IsCompleted`와 `GetResult`를 가진 타입을 돌려주면 `await`할 수 있다. `ICriticalNotifyCompletion`의 `UnsafeOnCompleted`는 `ExecutionContext`를 누가 흘릴지를 정하는 최적화 장치다.
- **상태 기계는 스택의 구조체로 시작해 첫 실제 대기에서만 힙으로 올라간다.** 그래서 동기 완료 경로에서는 상태 기계 할당이 0이다. `SetStateMachine`이 이 "박싱 댄스"를 위해 존재하며, .NET Core 2.1 이후로는 진짜 박싱 대신 `Task`를 상속한 강타입 상자 하나만 할당된다.
- **`await`가 제어 구조 안에 들어가면 컴파일러가 그 구조를 `goto`로 전개한다.** 루프는 레이블 묶음이 되고, `try` 블록에는 트램펄린이 생기며, `finally`에는 `if (state < 0)` 가드가 붙는다. `catch`/`finally` 안의 `await`는 C# 6부터 허용됐고, `lock` 안의 `await`는 영원히 금지다.
- **`ConfigureAwait(false)`가 끄는 것은 컨텍스트 복원뿐이다.** `ExecutionContext`와 `AsyncLocal<T>`은 그대로 흐른다. 라이브러리는 모든 `await`에 붙이고, ASP.NET Core나 콘솔 앱은 애초에 컨텍스트가 없으므로 붙일 필요가 없다.
- **데드락은 세 조건이 모두 성립할 때 난다** — 컨텍스트가 단일 스레드이고, 연속이 그 스레드를 필요로 하며, 그 스레드가 블로킹돼 있을 때. `ConfigureAwait(false)`는 두 번째 조건만 깨므로 완치가 아니다. 진짜 해법은 `async`를 위로 전파하는 것이다.
- **`async void`는 이벤트 핸들러에서만 허용된다.** 완료를 알 수 없고, 예외를 잡을 수 없으며, 조합할 수 없다. `ValueTask`는 동기 완료가 흔한 핫 경로의 미시 최적화이고, 두 번 `await`·미완료 상태의 `.Result`·동시 사용이 전부 금지다.

---

## 연습 문제

1. 47.4절의 `DemoCompletedAsync` 예제를 콘솔 앱으로 실행하고 출력 순서를 확인하라. 그다음 `await Task.FromResult(10)`을 `await Task.Delay(0)`으로, 다시 `await Task.Yield()`로 바꿔 가며 출력이 어떻게 달라지는지 관찰하고 그 이유를 설명하라.

2. 릴리스 빌드로 `async Task PrintAndWait(TimeSpan)`을 컴파일하고 ILSpy나 dnSpy로 디컴파일해 상태 기계를 확인하라. 디컴파일러의 "async/await 재구성" 옵션을 끄고 봐야 한다. 그다음 **디버그 빌드로 같은 일을 하고** 상태 기계가 `class`인지 `struct`인지 비교하라.

3. 다음 세 메서드를 만들고 `dotnet-counters` 또는 BenchmarkDotNet의 `[MemoryDiagnoser]`로 할당량을 비교하라. (a) 항상 동기 완료하는 `async Task<int>`, (b) 항상 동기 완료하는 `async ValueTask<int>`, (c) `async` 없이 `Task.FromResult`를 반환하는 메서드. 결과를 47.8절·47.13절의 설명과 대조하라.

4. `await`를 `for` 루프 안에 넣은 메서드와 `try`/`finally` 안에 넣은 메서드를 각각 디컴파일하고, 47.10절에서 설명한 **`goto` 전개**와 **트램펄린**, **`finally` 가드**를 실제 코드에서 찾아 표시하라.

5. WPF 또는 WinForms 프로젝트를 만들고 47.14절의 데드락을 재현하라. 그다음 (a) `ConfigureAwait(false)`를 모든 `await`에 붙여서, (b) `async`를 위로 전파해서, 각각 해결하고 두 방법의 차이를 설명하라. 특히 (a)에서 `await` 하나를 일부러 빠뜨렸을 때 다시 멎는지 확인하라.

6. `IValueTaskSource<T>`를 직접 구현하지 말고, `ManualResetValueTaskSourceCore<T>`를 필드로 품는 방식으로 재사용 가능한 비동기 신호 타입을 만들어라. 같은 인스턴스를 `Reset` 없이 두 번 `await` 했을 때 어떤 예외가 나는지 확인하라.

7. `async IAsyncEnumerable<int>` 메서드를 하나 만들고, `await foreach` 중간에 `break`를 넣은 소비자와 예외를 던지는 소비자를 각각 실행하라. 반복자 안의 `finally` 블록에 로그를 넣어 **어느 경우에 실행되는지** 확인하고, 47.10절과 47.11절의 `disposeMode` 설명으로 결과를 해석하라.

8. `FakeTimeProvider`(37.9절)를 써서 지수 백오프 재시도 정책의 **백오프 간격 자체**를 검증하는 테스트를 작성하라. 그다음 그 테스트에 `[Fact(Timeout = 1000)]`을 붙이고, `TimeProvider` 없이 `Task.Delay`를 직접 쓰도록 되돌렸을 때 테스트가 실패하는지 확인하라.

---

**다음 장** — 48장「동기화와 잠금」에서는 이 장이 계속 미뤄 둔 질문으로 넘어간다. `await` 구간에 걸쳐 상호 배제를 어떻게 얻는가, `lock` 안에서 `await`를 못 쓰는 이유의 밑바닥에 있는 모니터의 스레드 소유권은 무엇인가, 그리고 여러 스레드가 같은 데이터를 볼 때 하드웨어와 컴파일러가 어떤 재배치를 허용하는가. .NET 메모리 모델부터 `Interlocked`, `lock`, 세마포어, 그리고 C# 13의 `System.Threading.Lock`까지 판다.
