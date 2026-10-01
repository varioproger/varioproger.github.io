---
title: "부록 A. 네이티브 애드온"
---

# 부록 A. 네이티브 애드온

Node.js는 C++로 작성된 런타임이고, 그 위에서 도는 JavaScript는 결국 V8이 컴파일한 기계어로 실행된다. 그렇다면 처음부터 C나 C++로 직접 내려가면 더 빠르지 않겠는가 하는 생각은 자연스럽다. 그러나 네이티브 애드온(native addon)은 성능 튜닝의 첫 수단이 아니라 마지막 수단이다. 이 부록은 그 경계를 먼저 긋고, 그 경계를 넘어야 할 때 쓰는 도구인 Node-API를 다룬 뒤, 대부분의 경우 더 나은 선택인 WebAssembly로 마무리한다.

## A.1 언제 네이티브 코드가 필요한가

### 정당화되는 세 가지 경우

**첫째, 이미 존재하는 C/C++ 라이브러리를 바인딩할 때다.** 이것이 네이티브 애드온의 가장 흔하고 가장 정당한 용도다. 이미지 처리(libvips), 암호(libsodium), 압축(zstd), 데이터베이스 클라이언트(SQLite), 머신러닝 런타임(ONNX Runtime) 같은 것들은 수십 년치 최적화와 검증이 축적된 자산이다. 이것을 JavaScript로 다시 쓰는 것은 성능 문제 이전에 정확성 문제다. `sharp`나 `better-sqlite3`가 네이티브 애드온인 이유가 여기에 있다.

**둘째, JavaScript에서 도달할 수 없는 하드웨어 기능이 필요할 때다.** SIMD 명령, GPU 컨텍스트, 특정 CPU의 암호화 확장 명령, 시리얼 포트나 USB 같은 장치 접근, `ioctl` 수준의 시스템 콜이 여기에 해당한다. 이런 것들은 성능 최적화가 아니라 기능 접근의 문제이므로 대안이 없다.

**셋째, 프로파일링으로 입증된 극단적 핫 패스다.** 여기서 핵심은 "프로파일링으로 입증된"이다. 추측이 아니라 측정 결과가 특정 함수 하나에 CPU 시간의 절반 이상이 몰려 있다고 말하고, 그 함수가 순수 계산이며, JavaScript 수준의 최적화를 모두 소진한 뒤여야 한다. 실무에서 이 조건을 실제로 만족하는 코드는 드물다.

### 그 전에 시도해야 할 것들

느린 코드를 보면 네이티브로 내려가고 싶어지지만, 순서상 먼저 소진해야 할 수단이 세 가지 있다.

**알고리즘 개선이 언제나 먼저다.** 상수 배 개선을 위해 언어를 바꾸는 것과, 복잡도 차수를 낮추는 것은 비교 대상이 아니다. O(n²) 루프를 C++로 옮기면 5배 빨라지지만, 같은 루프를 해시맵으로 O(n)으로 만들면 데이터가 커질수록 격차가 무한히 벌어진다. 또한 V8의 JIT는 단형적(monomorphic)이고 예측 가능한 코드에 대해 놀랄 만큼 좋은 기계어를 만든다. 히든 클래스가 흔들리지 않게 객체 형태를 고정하고, `TypedArray`로 데이터를 평탄하게 배치하는 것만으로도 몇 배가 개선되는 경우가 흔하다.

**CPU 바운드 작업이라면 워커 스레드가 다음 수단이다.** 문제가 "한 번의 계산이 너무 느리다"가 아니라 "계산 때문에 이벤트 루프가 막힌다"라면, 필요한 것은 더 빠른 코드가 아니라 다른 스레드다. 워커 스레드(11장 참조)는 순수 JavaScript로 이 문제를 해결하며, 빌드 툴체인도 플랫폼별 바이너리도 필요 없다.

**작업의 성격이 아예 다르다면 서비스를 분리한다.** 영상 트랜스코딩이나 대규모 배치 연산처럼 Node.js의 강점과 무관한 작업이라면, 애드온으로 프로세스 안에 끌어들이는 대신 Go나 Rust로 별도 서비스를 만들어 큐나 gRPC로 연결하는 편이 낫다. 이렇게 하면 배포·확장·장애 격리가 모두 독립적으로 이루어진다.

### 네이티브 애드온의 대가

애드온을 도입하는 순간 프로젝트가 지불하는 비용은 코드 몇 줄이 아니다.

- **빌드 툴체인이 필요하다.** 애드온을 설치하는 모든 개발자와 모든 CI 환경에 Python, C++ 컴파일러(Linux는 gcc/clang, macOS는 Xcode Command Line Tools, Windows는 MSVC 빌드 도구)가 있어야 한다. `npm install` 한 번이 실패하는 환경이 반드시 생긴다.
- **플랫폼별 바이너리가 늘어난다.** OS(linux/darwin/win32) × 아키텍처(x64/arm64) × libc(glibc/musl) 조합마다 별도 바이너리가 필요하다. Alpine 기반 컨테이너에서 터지는 사고가 특히 잦다.
- **재빌드가 필요해질 수 있다.** Node-API를 쓰면 Node 메이저 버전이 올라가도 재컴파일이 필요 없지만, V8 API를 직접 쓰거나 NAN에 의존하면 Node 메이저 버전마다 다시 빌드해야 한다. 이것이 Node-API를 기본으로 삼아야 하는 가장 실용적인 이유다.
- **크래시가 프로세스 전체를 죽인다.** JavaScript의 예외는 잡을 수 있지만, 네이티브 코드의 세그멘테이션 폴트나 힙 오염은 잡을 수 없다. 애드온의 널 포인터 역참조 하나가 수천 개의 활성 연결을 즉시 끊는다. 게다가 메모리 누수와 이중 해제 같은 버그가 JavaScript 세계로 되돌아온다.

정리하면, 네이티브 애드온은 "쓸 수 있으니 쓰는" 도구가 아니라 "다른 방법이 없어서 쓰는" 도구다.

판단을 감이 아니라 숫자로 하려면 순서가 있다. 먼저 `--cpu-prof`나 `0x`로 플레임 그래프를 뽑아 시간이 어디에 쌓이는지 확인한다(30장 참조). 시간의 대부분이 I/O 대기나 직렬화에 있다면 네이티브로 내려가도 아무것도 나아지지 않는다. 순수 계산 한 곳에 몰려 있다면, 그 계산만 떼어 마이크로벤치마크를 만들고 JavaScript 최적화를 끝까지 밀어 본다. 그런 다음 같은 알고리즘의 C 구현과 비교해 실제 상한선을 재고, 그 차이가 애드온 도입 비용을 감당할 만큼 큰지 판단한다. 대개 이 지점에서 "생각보다 차이가 작다"는 결론이 나온다.

## A.2 Node-API(N-API) 기초

### ABI 안정성이 핵심이다

Node-API는 네이티브 애드온을 위한 **ABI 안정(ABI-stable) C 인터페이스**다. 이것이 전부이자 핵심이다. 애드온이 V8의 `v8::Local<v8::Value>` 같은 타입을 직접 다루면, V8이 내부 구조를 바꾸는 순간 애드온은 깨진다. V8은 Node 메이저 버전마다 올라가므로, 결과적으로 Node 18용 애드온과 Node 20용 애드온이 각각 필요해진다. NAN(Native Abstractions for Node.js)은 이 차이를 매크로로 흡수하려던 시도였지만, 재컴파일 자체를 없애지는 못했다.

Node-API는 접근 방식이 다르다. 애드온은 V8을 전혀 보지 못하고 `napi_value`라는 불투명 핸들과 `napi_*` C 함수만 다룬다. 엔진 세부사항은 Node가 감춘다. 그 결과 **한 번 컴파일한 `.node` 바이너리가 이후 Node 메이저 버전에서도 그대로 동작한다.** 애드온은 자신이 요구하는 Node-API 버전(예: `NAPI_VERSION=8`)을 선언하고, 그 버전을 지원하는 모든 런타임에서 실행된다. Node뿐 아니라 Node-API를 구현한 다른 런타임(Deno, Bun 등)에서도 같은 바이너리가 로드될 수 있다.

### node-addon-api와 순수 C API

Node-API에는 두 가지 사용법이 있다.

**순수 C API**는 `#include <node_api.h>`로 쓴다. 모든 호출이 `napi_status`를 반환하므로 반환값을 일일이 검사해야 하고, 값 하나를 만드는 데도 여러 줄이 필요하다. 의존성이 전혀 없고 C 프로젝트에 그대로 넣을 수 있다는 것이 장점이다.

**node-addon-api**는 그 위에 얹은 헤더 온리 C++ 래퍼다. `Napi::Number`, `Napi::Object`, `Napi::Function` 같은 클래스로 감싸 코드량을 크게 줄이고, 오류를 예외(또는 예외 없는 모드에서는 명시적 검사)로 다룬다. 헤더만 있으므로 컴파일 결과물은 여전히 순수 Node-API를 호출하며 ABI 안정성도 그대로 유지된다. C++를 쓸 수 있다면 이쪽이 기본 선택이다. 이 부록의 예제도 node-addon-api를 쓴다.

### 값의 수명과 스코프

Node-API를 쓸 때 반드시 이해해야 할 개념이 하나 더 있다. `napi_value`는 GC가 관리하는 JavaScript 값을 가리키는 **핸들**이며, 그 유효 기간은 현재 핸들 스코프(handle scope)로 제한된다. 애드온 함수가 반환하면 스코프가 닫히고 핸들은 무효가 된다. 따라서 값을 콜백에 저장해 나중에 쓰려면 참조(`Napi::Reference`, C API로는 `napi_ref`)로 승격시켜 GC가 수거하지 못하게 붙잡아야 하고, 다 쓴 뒤에는 반드시 해제해야 한다. 반대로 루프 안에서 값을 대량으로 만든다면 `Napi::HandleScope`를 명시적으로 열어 중간에 정리해 주지 않으면 핸들이 계속 쌓인다.

네이티브 자원을 JavaScript 객체에 매다는 경우에는 파이널라이저(finalizer)를 등록한다. `Napi::External`이나 `ObjectWrap`으로 감싼 객체가 GC될 때 호출되는 콜백에서 `free`나 `delete`를 수행하는 식이다. 다만 GC 시점은 보장되지 않으므로, 파일 디스크립터나 소켓처럼 즉시 반납해야 하는 자원은 파이널라이저에만 맡기지 말고 명시적인 `close()` 메서드를 함께 노출하는 편이 안전하다. **애드온에서 발생하는 버그의 상당수는 계산 로직이 아니라 이 수명 관리에서 나온다.**

### 어떤 Node-API 버전을 요구할 것인가

Node-API는 버전 번호로 기능 집합을 구분한다. 애드온은 `NAPI_VERSION`으로 자신이 필요한 최소 버전을 선언하고, 그보다 낮은 버전만 지원하는 런타임에서는 로드가 거부된다. 낮게 잡을수록 호환 범위가 넓어지지만 최신 기능을 못 쓴다. 실용적인 기준은 지원하려는 가장 오래된 LTS가 제공하는 버전에 맞추는 것이다. 현대 Node(v20 LTS 이상)만 대상으로 한다면 버전 8 이상을 안전하게 요구할 수 있다.

### node-gyp와 binding.gyp

빌드는 `node-gyp`가 담당한다. GYP는 `binding.gyp`라는 JSON 유사 파일을 읽어 플랫폼별 빌드 파일(Makefile, Xcode 프로젝트, MSVC 솔루션)을 생성하고 컴파일한다. `npm install` 시 패키지에 `binding.gyp`가 있으면 npm이 자동으로 `node-gyp rebuild`를 호출한다.

### prebuild: 사용자에게 컴파일을 시키지 않기

라이브러리를 배포한다면 사용자 기기에서 컴파일하게 두어서는 안 된다. `prebuildify`나 `prebuild-install` 같은 도구로 CI에서 플랫폼·아키텍처 조합별 바이너리를 미리 빌드해 두고, 설치 시에는 맞는 바이너리를 내려받거나 패키지에 동봉된 것을 고르게 한다. Node-API의 ABI 안정성이 여기서 결정적으로 작용한다. Node 버전마다 바이너리를 만들 필요가 없으므로 조합 수가 한 자릿수로 줄어든다. `node-gyp-build`는 미리 빌드된 바이너리가 있으면 그것을 쓰고, 없을 때만 소스 빌드로 넘어가는 로더다.

## A.3 계산기 애드온 만들기

`add`와 `multiply` 두 함수를 노출하는 최소 애드온을 처음부터 만든다. 디렉터리 구조는 다음과 같다.

```bash
calculator/
├── binding.gyp
├── package.json
├── src/
│   └── calculator.cc
└── index.js
```

### binding.gyp

```json
{
  "targets": [
    {
      "target_name": "calculator",
      "sources": [ "src/calculator.cc" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "NAPI_VERSION=8"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ]
    }
  ]
}
```

`include_dirs`의 `<!@(...)`는 GYP가 명령을 실행해 결과를 삽입하는 문법으로, node-addon-api 헤더 경로를 가져온다. `NAPI_DISABLE_CPP_EXCEPTIONS`는 C++ 예외 대신 명시적 검사 방식으로 동작하게 하며, 예외를 끈 바이너리와의 호환성 때문에 실무에서 흔히 쓰는 설정이다. `NAPI_VERSION=8`은 이 애드온이 요구하는 Node-API 최소 버전을 고정한다.

### src/calculator.cc

```cpp
#include <napi.h>

// 인자 두 개가 모두 숫자인지 검사한다.
// NAPI_DISABLE_CPP_EXCEPTIONS 모드이므로 C++ throw를 쓰지 않고
// JS 예외를 예약한 뒤 호출부가 즉시 반환하도록 false를 돌려준다.
static bool CheckTwoNumbers(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "인자 두 개가 필요하다")
        .ThrowAsJavaScriptException();
    return false;
  }
  if (!info[0].IsNumber() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "두 인자 모두 숫자여야 한다")
        .ThrowAsJavaScriptException();
    return false;
  }
  return true;
}

Napi::Value Add(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  // 예외가 예약된 상태에서 다른 Node-API를 더 호출하면 안 된다.
  if (!CheckTwoNumbers(info)) return env.Null();

  double a = info[0].As<Napi::Number>().DoubleValue();
  double b = info[1].As<Napi::Number>().DoubleValue();
  return Napi::Number::New(env, a + b);
}

Napi::Value Multiply(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!CheckTwoNumbers(info)) return env.Null();

  double a = info[0].As<Napi::Number>().DoubleValue();
  double b = info[1].As<Napi::Number>().DoubleValue();
  return Napi::Number::New(env, a * b);
}

// 모듈이 로드될 때 한 번 호출되어 exports 객체를 채운다.
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "add"),
              Napi::Function::New(env, Add));
  exports.Set(Napi::String::New(env, "multiply"),
              Napi::Function::New(env, Multiply));
  return exports;
}

// 첫 인자는 모듈 이름, 둘째는 초기화 함수다.
NODE_API_MODULE(calculator, Init)
```

인자 검사를 생략하면 어떻게 되는지 짚어 둘 필요가 있다. JavaScript는 어떤 값이든 넘길 수 있으므로, 문자열을 받은 상태에서 `As<Napi::Number>()`의 결과를 그대로 쓰면 의미 없는 값이 나오거나 최악의 경우 프로세스가 죽는다. **네이티브 경계에서 타입 검사는 선택이 아니라 필수다.**

### package.json

```json
{
  "name": "calculator",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "gypfile": true,
  "scripts": {
    "build": "node-gyp configure build",
    "clean": "node-gyp clean"
  },
  "dependencies": {
    "node-addon-api": "^8.0.0"
  },
  "devDependencies": {
    "node-gyp": "^10.0.0"
  }
}
```

### 빌드와 사용

```bash
npm install
npm run build
# 결과물: build/Release/calculator.node
```


빌드가 끝나면 `build/Release/calculator.node`가 생긴다. 확장자만 다를 뿐 실체는 공유 라이브러리(`.so`/`.dylib`/`.dll`)이며, Node가 `dlopen` 계열 호출로 로드한 뒤 `Init`을 실행한다. 디버그 심벌이 필요하면 `node-gyp build --debug`로 빌드해 `build/Debug/`에 산출물을 만들고 gdb나 lldb를 붙이면 된다. 실무 패키지에서는 경로를 직접 적는 대신 `node-gyp-build`나 `bindings` 같은 로더를 써서 Release/Debug와 미리 빌드된 바이너리 중 알맞은 것을 자동으로 고르게 한다.

```js
// index.js
import { createRequire } from 'node:module'

// .node 바이너리는 ESM에서 import할 수 없으므로
// createRequire로 CommonJS 로더를 빌려 쓴다.
const require = createRequire(import.meta.url)
const calculator = require('./build/Release/calculator.node')

console.log(calculator.add(2, 3))        // 5
console.log(calculator.multiply(4, 2.5)) // 10

try {
  calculator.add('2', 3)
} catch (err) {
  // TypeError: 두 인자 모두 숫자여야 한다
  console.error(err.message)
}
```

## A.4 비동기 작업과 콜백 처리

### 동기 애드온은 이벤트 루프를 막는다

A.3의 `add`는 즉시 끝나므로 문제가 없다. 그러나 애드온이 실제로 하는 일이 이미지 리사이징이나 압축처럼 수백 밀리초씩 걸린다면, 그 시간 동안 이벤트 루프는 완전히 멈춘다. JavaScript로 짠 무한 루프와 정확히 같은 상황이며, 오히려 더 나쁘다. 네이티브 코드 안에서는 `--cpu-prof` 같은 도구도 잘 보이지 않고 인터럽트도 걸리지 않는다.

해결책은 libuv의 스레드풀을 쓰는 것이다. node-addon-api는 `Napi::AsyncWorker`로 이를 감싼다. 계산은 워커 스레드에서, JavaScript 값 생성과 콜백 호출은 이벤트 루프 스레드에서 일어난다. **이 분리가 절대 규칙이다. 워커 스레드에서 `napi_value`를 만들거나 만지면 즉시 크래시한다.**

```cpp
#include <napi.h>
#include <vector>

class PrimeCountWorker : public Napi::AsyncWorker {
 public:
  PrimeCountWorker(const Napi::Function& callback, uint32_t limit)
      : Napi::AsyncWorker(callback), limit_(limit), result_(0) {}

  // 워커 스레드에서 실행된다. JS 값은 절대 다루지 않는다.
  void Execute() override {
    if (limit_ < 2) { result_ = 0; return; }
    std::vector<bool> sieve(limit_ + 1, true);
    sieve[0] = sieve[1] = false;
    for (uint64_t i = 2; i * i <= limit_; ++i) {
      if (!sieve[i]) continue;
      for (uint64_t j = i * i; j <= limit_; j += i) sieve[j] = false;
    }
    for (uint32_t i = 2; i <= limit_; ++i) if (sieve[i]) ++result_;
  }

  // 이벤트 루프 스레드로 돌아온 뒤 실행된다. 여기서만 JS 값을 만든다.
  void OnOK() override {
    Napi::HandleScope scope(Env());
    Callback().Call({ Env().Null(), Napi::Number::New(Env(), result_) });
  }

  void OnError(const Napi::Error& e) override {
    Napi::HandleScope scope(Env());
    Callback().Call({ e.Value(), Env().Undefined() });
  }

 private:
  uint32_t limit_;
  uint32_t result_;
};

Napi::Value CountPrimes(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "(limit: number, callback: function) 형태여야 한다")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  uint32_t limit = info[0].As<Napi::Number>().Uint32Value();
  Napi::Function cb = info[1].As<Napi::Function>();

  // Queue()가 소유권을 가져가며, 완료 후 워커는 스스로 delete된다.
  auto* worker = new PrimeCountWorker(cb, limit);
  worker->Queue();
  return env.Undefined();
}
```

JavaScript 쪽에서는 오류 우선 콜백을 프라미스로 감싸면 된다.

```js
import { promisify } from 'node:util'

const countPrimes = promisify(addon.countPrimes)

// 계산이 도는 동안에도 이벤트 루프는 계속 요청을 처리한다.
const count = await countPrimes(50_000_000)
console.log(count)
```

libuv 스레드풀의 기본 크기는 4이며 `UV_THREADPOOL_SIZE`로 조정한다. 이 풀은 파일 I/O, DNS 조회, `crypto`의 일부 연산과 공유되므로, 오래 도는 애드온 작업으로 풀을 가득 채우면 무관해 보이는 파일 읽기가 함께 느려진다.

또 하나 유의할 점은 취소가 어렵다는 것이다. `AsyncWorker`는 큐에 들어가 아직 시작되지 않은 작업만 취소할 수 있고, 이미 `Execute()`에 진입한 작업은 중단할 수단이 없다. 클라이언트가 요청을 끊어도 계산은 끝까지 돈다. 중간에 멈출 수 있어야 한다면 `Execute()` 안에서 원자적 플래그를 주기적으로 확인하도록 직접 설계해야 한다. 진행률을 보고해야 하는 긴 작업에는 중간 결과를 이벤트 루프로 흘려보낼 수 있는 `Napi::AsyncProgressWorker`가 따로 있다.

### ThreadSafeFunction

`AsyncWorker`는 "한 번 계산하고 한 번 콜백"이라는 형태에 맞는다. 그러나 애드온이 자체 네이티브 스레드를 띄워 이벤트를 여러 번 발생시키는 경우(하드웨어 인터럽트 감시, C++ 라이브러리의 콜백 등)에는 다른 도구가 필요하다. `Napi::ThreadSafeFunction`은 JavaScript 함수에 대한 참조를 붙잡아 두고, 임의의 네이티브 스레드에서 안전하게 호출을 예약한다.

```cpp
// 이벤트 루프 스레드에서 생성한다.
auto tsfn = Napi::ThreadSafeFunction::New(
    env, callback, "sensor-events", /*queue*/ 0, /*threads*/ 1);

// 다른 네이티브 스레드에서:
// 콜백은 이벤트 루프 스레드에서 실행되도록 예약된다.
tsfn.BlockingCall([value](Napi::Env env, Napi::Function jsCb) {
  jsCb.Call({ Napi::Number::New(env, value) });
});

// 더 이상 호출하지 않을 때 반드시 해제해야 프로세스가 종료된다.
tsfn.Release();
```

`Release()`를 잊으면 참조 카운트가 남아 Node 프로세스가 영원히 끝나지 않는다. 네이티브 자원의 수명 관리가 곧 애드온 유지보수 비용이라는 점을 보여주는 전형적인 사례다.

## A.5 대안: WebAssembly

### 같은 문제, 다른 대가

WebAssembly(wasm)는 "JavaScript보다 빠른 계산이 필요하다"는 문제에 대한 또 하나의 답이다. Rust, C, C++, Zig로 짠 코드를 wasm으로 컴파일하면 Node의 `WebAssembly` 전역 객체로 로드해 호출할 수 있다.

```rust
// src/lib.rs — Rust를 wasm으로 컴파일한다
#[no_mangle]
pub extern "C" fn count_primes(limit: u32) -> u32 {
    if limit < 2 { return 0; }
    let mut sieve = vec![true; (limit + 1) as usize];
    let mut i: u64 = 2;
    while i * i <= limit as u64 {
        if sieve[i as usize] {
            let mut j = i * i;
            while j <= limit as u64 { sieve[j as usize] = false; j += i; }
        }
        i += 1;
    }
    (2..=limit).filter(|&n| sieve[n as usize]).count() as u32
}
```

```bash
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
# C라면: clang --target=wasm32 -nostdlib -Wl,--no-entry -O3 -o calc.wasm calc.c
```

```js
import { readFile } from 'node:fs/promises'

const bytes = await readFile(new URL('./calc.wasm', import.meta.url))
const { instance } = await WebAssembly.instantiate(bytes, {})

// 내보낸 함수를 일반 JS 함수처럼 호출한다.
console.log(instance.exports.count_primes(50_000_000))
```

### 장점

가장 큰 장점은 **바이너리가 하나라는 것**이다. `.wasm` 파일 하나가 linux/macOS/Windows, x64/arm64, glibc/musl 어디서든 그대로 동작한다. 빌드 툴체인도 배포 시점에는 필요 없고, 설치 시 컴파일도 없다.

두 번째는 **샌드박스 안전성**이다. wasm 모듈은 선형 메모리 안에 갇혀 있어, 버퍼 오버런이 일어나도 Node 프로세스의 다른 메모리를 오염시키지 못한다. 임포트로 명시적으로 넘겨준 함수 외에는 파일도 네트워크도 건드릴 수 없다. 신뢰 경계가 명확한 이 성질은 서드파티 코드나 사용자 제출 코드를 실행할 때 특히 가치가 있다(34장 참조). 애드온의 세그폴트가 프로세스 전체를 죽이는 것과 정반대다.

### 단점

**JS-wasm 경계 비용이 있다.** 숫자를 주고받는 호출은 매우 싸지만, 문자열이나 객체는 선형 메모리에 직접 복사해 넣고 포인터로 주고받아야 한다. 호출 하나가 짧고 호출 횟수가 많은 패턴에서는 이 왕복 비용이 이득을 다 먹는다. wasm이 유리한 것은 "한 번 넘기고 오래 계산하는" 형태다.

**시스템 콜이 제한된다.** wasm 자체에는 파일도 소켓도 없다. WASI가 이를 표준화하고 있지만 아직 진화 중이고, Node의 `node:wasi` 지원도 실험적 성격이 남아 있다. 소켓이나 스레드가 필요한 작업이라면 아직은 애드온 쪽이 현실적이다.

**기존 C/C++ 라이브러리를 그대로 쓰기 어렵다.** 의존성이 시스템 라이브러리를 참조하면 wasm으로 옮기는 작업 자체가 프로젝트가 된다.

그럼에도 이미 실전에서 검증된 사례는 적지 않다. `esbuild`, SQLite, 이미지 코덱, 정규식 엔진 등이 wasm 빌드로 배포되어 설치 시 컴파일 없이 쓰인다. 순수 계산에 가깝고 시스템 자원 접근이 적은 라이브러리일수록 이식이 잘 된다는 공통점이 있다. 성능은 통상 네이티브의 70~90퍼센트 수준으로, 대부분의 목적에는 충분하다.

또한 wasm은 워커 스레드와 잘 결합한다. wasm 호출 자체는 동기이므로 긴 계산은 여전히 이벤트 루프를 막지만, 워커 스레드 안에서 wasm 모듈을 로드해 돌리면 애드온의 `AsyncWorker`와 같은 효과를 순수 JavaScript 구조로 얻을 수 있다. 빌드 툴체인도 네이티브 스레드 관리도 필요 없다는 점에서, 이 조합이 실무에서 가장 비용 대비 효율이 좋은 경우가 많다.

### 판단 기준

| 기준 | 네이티브 애드온 | WebAssembly |
| --- | --- | --- |
| 기존 C/C++ 라이브러리 바인딩 | 유리 | 이식 비용 큼 |
| 순수 계산 커널 이식 | 가능 | 유리 |
| 배포 바이너리 수 | OS×아키텍처×libc 조합 | 하나 |
| 설치 시 컴파일 | prebuild 없으면 필요 | 불필요 |
| 시스템 콜·소켓·스레드 | 제한 없음 | 제한적(WASI 진화 중) |
| 하드웨어 기능(SIMD, GPU, 장치) | 접근 가능 | SIMD만 부분 지원 |
| 크래시 영향 범위 | 프로세스 전체 사망 | 모듈 내부로 격리 |
| 신뢰할 수 없는 코드 실행 | 부적합 | 적합 |
| 데이터 전달 비용 | 낮음 | 경계 복사 비용 있음 |

실무적 결론은 단순하다. **기존 네이티브 라이브러리를 써야 하거나 OS/하드웨어 기능이 필요하면 Node-API 애드온을, 자체 계산 커널을 빠르게 돌리고 싶을 뿐이라면 WebAssembly를 고른다.** 그리고 둘 중 어느 쪽도 선택하기 전에, A.1에서 짚은 알고리즘 개선과 워커 스레드를 먼저 소진했는지 다시 확인한다.

## 요약

- 네이티브 애드온은 성능 튜닝의 첫 수단이 아니라 마지막 수단이다. 기존 C/C++ 라이브러리 바인딩, 하드웨어 기능 접근, 프로파일링으로 입증된 핫 패스에서만 정당화되며, 그 전에 알고리즘 개선·워커 스레드(11장)·서비스 분리를 소진해야 한다.
- 대가는 빌드 툴체인 의존, 플랫폼×아키텍처×libc 조합별 바이너리, 그리고 네이티브 크래시가 프로세스 전체를 죽인다는 사실이다.
- Node-API는 ABI 안정 C 인터페이스로, 한 번 빌드한 `.node`가 이후 Node 메이저 버전에서도 재컴파일 없이 동작한다. V8 API 직접 사용이나 NAN 대신 Node-API를 기본으로 삼고, C++라면 node-addon-api 래퍼를 쓴다.
- 애드온의 함수 경계에서는 인자 타입을 반드시 검사하고, 잘못된 입력에는 JS 예외를 던진다. 검사를 생략하면 타입 오류가 크래시로 이어진다.
- 오래 걸리는 작업은 `Napi::AsyncWorker`로 libuv 스레드풀에 넘긴다. 계산은 `Execute()`(워커 스레드), JS 값 생성과 콜백은 `OnOK()`(이벤트 루프 스레드)에서만 한다. 네이티브 스레드에서 JS 콜백을 여러 번 호출해야 하면 `ThreadSafeFunction`을 쓰고 `Release()`를 잊지 않는다.
- WebAssembly는 플랫폼 독립 바이너리 하나와 샌드박스 격리를 제공하는 현실적 대안이다. 자체 계산 커널이라면 wasm이, 기존 네이티브 라이브러리나 시스템 콜이 필요하면 애드온이 맞다.
