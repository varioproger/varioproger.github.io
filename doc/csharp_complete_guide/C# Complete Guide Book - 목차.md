---
title: "목차"
parent: "C# Complete Guide"
nav_order: 0
---

# C# Complete Guide Book — 목차 (설계안 v2)

**부제**: 첫 줄부터 런타임 내부까지 — 입문자를 C# 마스터로 이끄는 단일 경로

---

## 설계 근거

`Books/C#/net8` 폴더의 **8권 전부**를 분석해 목차를 구성했다.

| 원천 도서 | 분량 | 이 책에서 맡는 역할 |
|---|---|---|
| C# 12 in a Nutshell (Joseph Albahari) | 1,687p | **BCL 전 범위의 레퍼런스 축**. Part I, VII, VIII, X, XIII |
| Pro C# 10 with .NET 6 (Troelsen/Japikse) | 1,680p | 문법·OOP 학습 곡선의 뼈대. Part II~V |
| C# 12 and .NET 8 (Mark J. Price) | 829p | 최신 .NET 8 기준선, 실전 응용. Part I, XVI |
| CLR via C# 4th (Jeffrey Richter) | 813p | 런타임 동작 원리. Part X |
| Pro .NET Memory Management 2nd (Kokosa 외) | 780p | 메모리·GC 심층. Part XI |
| High-Performance Programming in C# and .NET | 660p | 측정·프로파일링·성능. Part XII |
| Effective C# (Wagner) | 600p | 관용구·설계 원칙. Part XV |
| More Effective C# (Wagner) | 281p | API 설계·비동기 관용구. Part XV |

**v1 대비 변경점** — Nutshell을 넣으면서 이전 목차의 최대 약점이던 **BCL 폭(breadth)** 을 채웠다.

- 신설: 날짜/시간, 포매팅·파싱·국제화, 숫자 유틸리티, XML, 네트워킹, 암호화, 정규식 완전판, 진단 API
- 확장: 스트림(압축/ZIP/Tar/메모리 매핑), 고급 스레딩(신호·TLS·타이머), 리플렉션 Emit, 동적 프로그래밍, 어셈블리 리소스·위성 어셈블리, LINQ 연산자 전수
- 재편: 언어 문법을 Nutshell의 정밀한 분류(식·문·변수·매개변수)에 맞춰 재배치

**보강 항목**: 원천 도서들이 .NET 6~8 시점에서 멈춰 있어, C# 13 / .NET 9 이후 항목(`params` 컬렉션, `System.Threading.Lock`, `SearchValues`, OSR, DATAS 등)은 별도 보강했다. 해당 소절에 ※ 표시.

**구성 원칙**: 모든 장은 `문법 → 컴파일 결과(IL) → 런타임 동작 → 성능 영향` 4단 구조. 문법만 아는 개발자와 내부만 아는 개발자를 한 사람으로 합치는 것이 목표.

**학습 단계 표기**: 🟢 입문 · 🔵 중급 · 🟣 심화 · ⚫ 마스터

**권 분할**: 총 84장. 3권 분할 권장 — **1권** Part 0–VI(문법·OOP·LINQ) / **2권** Part VII–IX(BCL·동시성) / **3권** Part X–XVII(내부·메모리·성능·마스터리)

---

# 제1권 — 언어

# Part 0. 이 책을 읽는 법

### 1장. 가이드북 사용법 🟢
- 1.1 대상 독자와 선수 지식
- 1.2 4단계 학습 경로 — 입문 / 중급 / 심화 / 마스터
- 1.3 각 장의 4단 구조: 문법 → IL → 런타임 → 성능
- 1.4 세 가지 독서 경로 — 순차 학습 / 레퍼런스 / 면접·승급 대비
- 1.5 실습 환경 구축 (.NET 8/9 SDK, Visual Studio 2022 / VS Code / Rider)
- 1.6 이 책이 계속 쓰는 8가지 도구 — SharpLab, ILSpy, BenchmarkDotNet, PerfView, dotnet-counters, dotnet-dump, WinDbg+SOS, 코드 분석기
- 1.7 예제 코드 저장소와 실행 방법

---

# Part I. C#과 .NET의 지형도 🟢

### 2장. C#이라는 언어, .NET이라는 플랫폼
- 2.1 C#을 규정하는 네 가지 — 객체 지향, 타입 안전성, 자동 메모리 관리, 플랫폼 지원
- 2.2 C# 1.0부터 13까지 — 언어가 풀어온 문제의 계보
- 2.3 .NET Framework / Mono / .NET Core → 통합 .NET
- 2.4 CLR, BCL, 런타임, SDK의 역할 분담
- 2.5 CTS와 CLS — 다중 언어 플랫폼의 계약
- 2.6 관리 코드(managed) vs 비관리 코드
- 2.7 왜 C#은 "느리지 않은" 언어가 되었나

### 3장. 첫 프로그램이 실행되기까지
- 3.1 `dotnet new / build / run`이 실제로 하는 일
- 3.2 소스 → Roslyn 컴파일러 → IL + 메타데이터
- 3.3 관리 모듈의 해부 — PE32/PE32+ 헤더, CLR 헤더, 메타데이터, IL
- 3.4 모듈에서 어셈블리로 — 매니페스트란 무엇인가
- 3.5 CLR 로딩과 `Main` 진입점 결정
- 3.6 JIT이 IL을 네이티브 코드로 바꾸는 순간
- 3.7 최상위 문(top-level statements)과 암시적 `using`의 정체
- 3.8 첫 코드를 SharpLab에 붙여보기 — 이 책의 기본 습관

### 4장. 프로젝트, 대상 프레임워크, 배포 형태
- 4.1 SDK 스타일 프로젝트 파일(`.csproj`) 해부
- 4.2 TFM(대상 프레임워크 모니커)과 멀티 타깃팅
- 4.3 .NET Standard — 왜 생겼고 왜 저물었나
- 4.4 참조 어셈블리(reference assembly)와 구현 어셈블리
- 4.5 런타임 버전과 C# 언어 버전의 관계, `LangVersion`
- 4.6 `Nullable`, `ImplicitUsings`, `AllowUnsafeBlocks` 등 주요 속성
- 4.7 NuGet 패키지, 의존성 그래프, `deps.json`
- 4.8 솔루션 구성과 프로젝트 참조
- 4.9 배포 형태 개요 — 프레임워크 종속 / 자체 포함 / 단일 파일 / AOT

### 5장. BCL 전체 지도
- 5.1 시스템 타입과 텍스트 처리
- 5.2 컬렉션과 쿼리
- 5.3 XML과 JSON
- 5.4 진단, 동시성, 스트림, 네트워킹
- 5.5 어셈블리·리플렉션·특성, 동적 프로그래밍
- 5.6 암호화, 고급 스레딩, 병렬 프로그래밍
- 5.7 `Span<T>`·`Memory<T>`, 상호운용, 정규식, 직렬화
- 5.8 Roslyn 컴파일러 API
- 5.9 애플리케이션 계층 — ASP.NET Core, Windows Desktop, WinUI 3, MAUI
- 5.10 "이 기능은 어디에 있나" 역인덱스

---

# Part II. 언어의 기본 문법 🟢

### 6장. 구문과 타입 기초
- 6.1 첫 C# 프로그램과 컴파일 단위
- 6.2 식별자와 키워드, 문맥 키워드
- 6.3 리터럴, 구두점, 연산자
- 6.4 주석과 XML 문서 주석의 차이
- 6.5 미리 정의된 타입 분류(taxonomy)
- 6.6 사용자 정의 타입 — 클래스·구조체·인터페이스·열거형·델리게이트
- 6.7 값 타입 vs 참조 타입 — 첫 번째 설명
- 6.8 스택과 힙 — 변수가 사는 곳
- 6.9 확정 할당(definite assignment)과 기본값
- 6.10 타입과 변환 — 암시적/명시적

### 7장. 숫자와 불리언
- 7.1 숫자 리터럴, 2진 리터럴, 밑줄 구분자
- 7.2 숫자 변환 — 확대와 축소
- 7.3 산술 연산자와 증감 연산자
- 7.4 정수 특화 연산 — 나눗셈, 오버플로, 비트 연산
- 7.5 8비트·16비트 정수 타입의 함정
- 7.6 `float`/`double`의 특수값 — NaN, ±∞, -0
- 7.7 `double` vs `decimal` — 언제 무엇을 쓰는가
- 7.8 실수 반올림 오차의 원리
- 7.9 `checked` / `unchecked`와 오버플로 검사
- 7.10 `bool` 변환, 동등·비교 연산자, 조건 연산자
- 7.11 네이티브 크기 정수 `nint` / `nuint`

### 8장. 문자열과 문자
- 8.1 `char`와 문자 변환
- 8.2 `string` 타입의 기본 동작과 불변성
- 8.3 문자열 리터럴 — 축자(`@`), 보간(`$`), 원시 문자열(`"""`) ※C# 11
- 8.4 UTF-8 문자열 리터럴 (`u8`) ※C# 11
- 8.5 문자열 연결·비교의 기초 (심화는 35장)

### 9장. 배열
- 9.1 배열 선언과 기본 요소 초기화
- 9.2 간소화된 배열 초기화 식
- 9.3 인덱스(`^`)와 범위(`..`) 연산자
- 9.4 다차원 배열과 가변(jagged) 배열
- 9.5 경계 검사(bounds checking)와 그 비용
- 9.6 배열 공변성의 위험
- 9.7 `System.Array`와 암시적 인터페이스 구현

### 10장. 변수, 매개변수, 식
- 10.1 지역 변수와 범위(scope) 규칙
- 10.2 매개변수 전달 — 값 / `ref` / `out` / `in`
- 10.3 `ref` 지역 변수와 `ref` 반환
- 10.4 선택적 매개변수와 명명된 인수 — 버전 관리 함정
- 10.5 `params` 배열과 `params` 컬렉션 ※C# 13
- 10.6 `var` — 암시적 지역 변수 타입의 규칙과 오해
- 10.7 대상 타입 지정 `new` 식 ※C# 9
- 10.8 기본 식(primary expression), void 식, 할당 식
- 10.9 연산자 우선순위와 결합성 — 전체 연산자 표
- 10.10 null 연산자 — `??`, `??=`, `?.`, `?[]`
- 10.11 `const`와 `readonly`의 컴파일 결과 차이

### 11장. 문(statement)과 제어 흐름
- 11.1 선언문과 식문
- 11.2 선택문 — `if` / `switch` 문
- 11.3 `switch` 식과 표현식 지향 코드
- 11.4 반복문 — `for` / `foreach` / `while` / `do-while`
- 11.5 `foreach`가 실제로 컴파일되는 형태 — 덕 타이핑된 열거자
- 11.6 점프문 — `break` / `continue` / `goto` / `return` / `throw`
- 11.7 기타 문 — `using`, `lock`, `checked`, `unsafe`, `fixed`

### 12장. 네임스페이스와 전처리기
- 12.1 네임스페이스 선언과 파일 범위 네임스페이스 ※C# 10
- 12.2 `using` 지시문과 이름 해석 규칙
- 12.3 `global using`과 암시적 using ※C# 10
- 12.4 `using static`
- 12.5 타입·네임스페이스 별칭과 "모든 타입 별칭" ※C# 12
- 12.6 `extern alias`와 이름 충돌 해결
- 12.7 전처리기 지시문 — `#if`, `#define`, `#region`, `#pragma`, `#nullable`, `#line`
- 12.8 조건부 컴파일 vs 정적 플래그 vs `[Conditional]`
- 12.9 XML 문서 주석 — 표준 태그, 사용자 정의 태그, 크로스 레퍼런스

---

# Part III. 타입 만들기 — 객체지향 🔵

### 13장. 클래스와 캡슐화
- 13.1 클래스 선언, 필드, 상수
- 13.2 메서드와 오버로드 해석 규칙
- 13.3 인스턴스 생성자와 생성자 체이닝
- 13.4 필드 초기화 순서 — 초기화자와 생성자 본문
- 13.5 분해자(`Deconstruct`)
- 13.6 객체 초기화자와 컬렉션 초기화자
- 13.7 `this` 참조
- 13.8 프로퍼티 — 자동 구현, 읽기 전용, `init` 전용, `field` 키워드 ※C# 13
- 13.9 인덱서와 "매개변수 있는 프로퍼티"의 정체
- 13.10 기본 생성자(primary constructor) ※C# 12
- 13.11 `static` 키워드 — 정적 필드·메서드·클래스
- 13.12 정적 생성자(타입 생성자)의 실행 시점과 함정
- 13.13 `required` 멤버 ※C# 11
- 13.14 부분 타입·부분 메서드와 소스 생성기의 접점
- 13.15 `nameof` 연산자
- 13.16 파이널라이저 선언 (동작은 34장)

### 14장. 상속과 다형성
- 14.1 상속의 기본 규칙
- 14.2 다형성과 가상 함수 멤버
- 14.3 `virtual` / `override` / `new` — 세 가지 다른 의도
- 14.4 추상 클래스와 추상 멤버
- 14.5 `sealed`로 봉인하기 — 클래스와 멤버
- 14.6 `base` 키워드와 생성자 상속
- 14.7 캐스팅과 참조 변환 규칙
- 14.8 오버로딩과 오버로드 해석 — 상속이 개입할 때
- 14.9 가상 메서드 디스패치가 실제로 일어나는 방식 (메서드 테이블 예고)
- 14.10 생성자에서 가상 함수를 호출하면 안 되는 이유
- 14.11 공변 반환 타입 ※C# 9
- 14.12 상속 대신 포함·위임을 택하는 기준

### 15장. `object` 타입과 박싱
- 15.1 모든 타입은 `System.Object`에서 파생된다
- 15.2 박싱과 언박싱 — 문법, IL, 비용
- 15.3 정적 타입 검사와 런타임 타입 검사
- 15.4 `GetType()` 메서드와 `typeof` 연산자
- 15.5 `ToString()` 재정의 규칙
- 15.6 `System.Object` 멤버 전수 — `Equals`, `ReferenceEquals`, `GetHashCode`, `MemberwiseClone`
- 15.7 박싱 최소화 체크리스트

### 16장. 구조체와 값 타입
- 16.1 `struct` 선언 규칙과 제약
- 16.2 값 타입 복사 의미론과 숨은 복사
- 16.3 구조체 생성 의미론 — 기본 생성자, 필드 초기화 ※C# 10/11
- 16.4 0이 유효한 상태여야 하는 이유
- 16.5 `readonly struct`와 `readonly` 멤버 — 방어적 복사 제거
- 16.6 `ref struct` 기초 (심화는 68장)
- 16.7 기본 `Equals`/`GetHashCode`가 느린 이유와 재정의
- 16.8 `struct`를 쓸 때와 `class`를 쓸 때 — 손익 계산법

### 17장. 접근 제한자와 중첩 타입
- 17.1 접근 제한자 전체 — `public` / `internal` / `protected` / `private` / `protected internal` / `private protected`
- 17.2 friend 어셈블리 (`InternalsVisibleTo`)
- 17.3 접근성 제한(accessibility capping)
- 17.4 접근 제한자에 걸리는 제약들
- 17.5 중첩 타입 — 언제 쓰고 언제 피하나
- 17.6 타입 가시성을 최소화하라 — 설계 원칙

### 18장. 인터페이스
- 18.1 인터페이스 정의와 구현
- 18.2 인터페이스 확장(상속)
- 18.3 암시적 구현 vs 명시적 구현 — 무대 뒤에서 벌어지는 일
- 18.4 인터페이스 멤버를 가상으로 구현하기, 서브클래스에서 재구현하기
- 18.5 같은 시그니처를 가진 다중 인터페이스 구현
- 18.6 인터페이스와 박싱 — 구조체가 인터페이스를 구현할 때
- 18.7 기본 구현 멤버 ※C# 8
- 18.8 정적 인터페이스 멤버와 정적 추상 멤버 ※C# 11
- 18.9 인터페이스 디스패치 비용 — 인터페이스 맵과 스텁
- 18.10 인터페이스 메서드와 가상 메서드의 차이
- 18.11 핵심 인터페이스 구현하기 — `IEnumerable`, `IComparable`, `IEquatable`, `IDisposable`, `ICloneable`(과 그 회피)
- 18.12 인터페이스 vs 기본 클래스 — 설계 결정표

### 19장. 레코드와 불변 타입
- 19.1 레코드가 나온 배경
- 19.2 `record class`와 `record struct` ※C# 9/10
- 19.3 컴파일러가 생성하는 멤버 — `Equals`, `GetHashCode`, `ToString`, `<Clone>$`, `Deconstruct`, `PrintMembers`
- 19.4 비파괴적 변경 — `with` 식
- 19.5 프로퍼티 유효성 검사와 계산 필드·지연 평가
- 19.6 위치 지정 레코드와 기본 생성자의 관계
- 19.7 레코드의 동등성 비교 규칙
- 19.8 값 타입의 불변성과 스레드 안전성 — 그리고 그 대가

### 20장. 열거형과 특성(Attribute)
- 20.1 `enum`의 기저 타입과 런타임 실체 — "enum은 어떻게 동작하는가"
- 20.2 열거형 변환과 값 열거하기
- 20.3 `[Flags]` 비트 플래그 패턴과 열거형 연산자
- 20.4 열거형의 타입 안전성 문제
- 20.5 `enum`에 동작 붙이기 — 확장 메서드
- 20.6 특성 클래스 정의와 `AttributeUsage`
- 20.7 명명된 매개변수 vs 위치 매개변수
- 20.8 어셈블리·백킹 필드·람다에 특성 적용하기
- 20.9 런타임에 특성 조회하기 (심화는 57장)
- 20.10 조건부 특성 `[Conditional]`
- 20.11 호출자 정보 특성 — `CallerMemberName`, `CallerFilePath`, `CallerLineNumber`, `CallerArgumentExpression`

### 21장. 널 안정성
- 21.1 널 가능 값 타입 `Nullable<T>` — 구조체의 실체
- 21.2 암시적·명시적 널 가능 변환
- 21.3 널 가능 값의 박싱과 언박싱 — CLR의 특별 지원
- 21.4 연산자 리프팅(operator lifting)
- 21.5 `bool?`와 `&` / `|` 연산자의 3값 논리
- 21.6 널 가능 참조 타입(NRT) ※C# 8 — 컴파일 타임 전용 계약
- 21.7 널 허용 주석 컨텍스트와 점진적 마이그레이션 전략
- 21.8 `!` (null-forgiving) 연산자를 쓸 자리
- 21.9 널 관련 특성 — `NotNullWhen`, `MaybeNull`, `MemberNotNull`
- 21.10 널 검사 관용구 — `ArgumentNullException.ThrowIfNull`
- 21.11 널 가능 타입의 대안 — 결과 타입, 특수 값

### 22장. 연산자 오버로딩과 정적 다형성
- 22.1 연산자 함수의 문법과 규칙
- 22.2 쌍(pair) 제약 — 반드시 함께 정의해야 하는 연산자
- 22.3 동등·비교 연산자 오버로딩과 `Equals`/`GetHashCode` 동기화
- 22.4 사용자 정의 암시적·명시적 변환 — 그리고 그 위험
- 22.5 `true` / `false` 연산자 오버로딩
- 22.6 `op_Addition` — 연산자의 IL 표현
- 22.7 다형적 연산자와 정적 추상 멤버 ※C# 11
- 22.8 제네릭 수학 — `INumber<T>`, `IAdditionOperators<T>` 계열

---

# Part IV. 제네릭과 컬렉션 🔵

### 23장. 제네릭
- 23.1 제네릭이 존재하는 이유 — `ArrayList`와 박싱의 시대
- 23.2 제네릭 타입과 제네릭 메서드
- 23.3 타입 매개변수 선언과 타입 추론
- 23.4 `typeof`와 언바운드 제네릭 타입
- 23.5 `default` 제네릭 값
- 23.6 제네릭 제약(`where`) 전체 목록 — `class`, `struct`, `notnull`, `unmanaged`, `new()`, 기본 타입, 인터페이스, 허용된 조합
- 23.7 제네릭 타입의 서브클래싱과 자기 참조 제네릭 선언
- 23.8 제네릭 타입의 정적 데이터 — 인스턴스별 분리
- 23.9 타입 매개변수와 변환
- 23.10 공변성(`out`)과 반공변성(`in`)
- 23.11 CLR의 제네릭 인프라 — 값 타입은 코드 특수화, 참조 타입은 코드 공유
- 23.12 C# 제네릭 vs C++ 템플릿
- 23.13 제약은 최소이면서 충분하게 — 설계 원칙
- 23.14 런타임 타입 검사로 제네릭 알고리즘 특수화하기
- 23.15 기반 클래스·인터페이스에 대한 제네릭 특수화를 피하라

### 24장. 컬렉션
- 24.1 열거(enumeration)의 기초 — `IEnumerable` / `IEnumerator`
- 24.2 `ICollection`과 `IList` 인터페이스 계층
- 24.3 `Array` 클래스 — 생성, 복사, 검색, 정렬, 변환
- 24.4 `List<T>` 내부 구조 — 배열 증가 전략과 `Capacity`
- 24.5 `Queue`, `Stack`, `LinkedList`, `SortedList`
- 24.6 집합 — `HashSet<T>`, `SortedSet<T>`
- 24.7 `Dictionary<TKey,TValue>` 내부 구조 — 버킷, 해시 충돌, 엔트리 배열
- 24.8 `SortedDictionary`, `Lookup`, `OrderedDictionary`
- 24.9 사용자 정의 컬렉션과 프록시 — `Collection<T>`, `KeyedCollection<T>`
- 24.10 읽기 전용·불변 컬렉션
- 24.11 frozen 컬렉션 — `FrozenDictionary`, `FrozenSet` ※.NET 8
- 24.12 동시성 컬렉션 — `ConcurrentDictionary`, `ConcurrentBag`, `BlockingCollection`
- 24.13 동등성·순서 비교자 꽂아넣기 (`IEqualityComparer`, `IComparer`)
- 24.14 컬렉션 식과 스프레드 연산자 ※C# 12
- 24.15 Big-O와 실제 상수 — 컬렉션 선택 가이드
- 24.16 인터페이스로 받을 것인가 구체 클래스로 받을 것인가

### 25장. 동등성과 순서 비교
- 25.1 값 동등성 vs 참조 동등성
- 25.2 표준 동등성 프로토콜 — `==`, `Equals`, `IEquatable<T>`, `ReferenceEquals`
- 25.3 `Equals` 재정의 5계명
- 25.4 `GetHashCode`의 함정 — 계약, 분포, `HashCode.Combine`
- 25.5 사용자 정의 타입의 동등성 — 클래스 / 구조체 / 레코드
- 25.6 순서 비교 — `IComparable`, `IComparable<T>`, `<`와 `>`
- 25.7 `IComparer<T>`와 `IEqualityComparer<T>`로 외부에서 정의하기
- 25.8 가변 객체를 딕셔너리 키로 쓸 때 생기는 일

---

# Part V. 델리게이트·이벤트·LINQ 🔵🟣

### 26장. 델리게이트와 람다
- 26.1 델리게이트의 실체 — `MulticastDelegate` 해부
- 26.2 델리게이트로 플러그인 메서드 작성하기
- 26.3 인스턴스 대상 vs 정적 대상, 메서드 그룹 변환
- 26.4 멀티캐스트 델리게이트 — 체이닝, 예외 전파, 반환값
- 26.5 제네릭 델리게이트와 `Func` / `Action` / `Predicate`
- 26.6 델리게이트 호환성 규칙
- 26.7 델리게이트 vs 인터페이스 — 언제 무엇을
- 26.8 익명 메서드와 람다 식 — 문법의 진화
- 26.9 람다 매개변수·반환 타입 명시, 람다 기본값 ※C# 10/12
- 26.10 외부 변수 캡처와 클로저 — 컴파일러가 만드는 디스플레이 클래스
- 26.11 캡처가 만드는 숨은 할당과 `static` 람다 ※C# 9
- 26.12 람다 vs 지역 함수 — 할당과 성능 차이
- 26.13 콜백은 델리게이트로 표현하라 — 설계 원칙

### 27장. 이벤트
- 27.1 이벤트 선언과 컴파일러가 만드는 `add` / `remove`
- 27.2 표준 이벤트 패턴 — `EventHandler<T>`, `EventArgs`
- 27.3 이벤트 접근자 직접 구현하기
- 27.4 이벤트 한정자 — `static`, `virtual`, `sealed`, `abstract`
- 27.5 스레드 안전한 이벤트 호출 — `?.Invoke` 관용구
- 27.6 이벤트가 만드는 런타임 결합과 메모리 누수
- 27.7 약한 이벤트 패턴
- 27.8 비가상 이벤트만 선언하라, 이벤트 핸들러 대신 오버라이드를 쓸 자리

### 28장. 열거와 반복자
- 28.1 열거의 의미론 — 열거자 패턴의 덕 타이핑
- 28.2 컬렉션 초기화자와 컬렉션 식
- 28.3 `yield return` / `yield break`
- 28.4 반복자 의미론과 컴파일러가 만드는 상태 기계 — 실물 IL 읽기
- 28.5 지연 실행의 의미와 `finally` 블록 처리
- 28.6 반복자의 오류 보고 시점 문제와 지역 함수 해법
- 28.7 시퀀스 합성(composing sequences)
- 28.8 반복자 메서드가 컬렉션 반환보다 나은 경우
- 28.9 `IAsyncEnumerable<T>`와 `await foreach` ※C# 8

### 29장. LINQ 쿼리
- 29.1 시작하기 — LINQ가 통합한 것들
- 29.2 플루언트 구문 — 연산자 체이닝, 람다 합성, 자연 순서
- 29.3 쿼리 식 — 범위 변수, 투명 식별자
- 29.4 쿼리 구문 vs 플루언트 구문 vs SQL 구문
- 29.5 혼합 구문 쿼리
- 29.6 지연 실행의 동작 원리 — 데코레이터 체인
- 29.7 재평가와 캡처된 변수
- 29.8 서브쿼리와 지연 실행
- 29.9 합성 전략 — 점진적 쿼리 구축, `into`, 쿼리 래핑
- 29.10 투영 전략 — 객체 초기화자, 익명 타입, `let`
- 29.11 지연 평가 vs 즉시 평가의 선택 기준

### 30장. LINQ 연산자 레퍼런스
- 30.1 연산자 분류 — 시퀀스→시퀀스 / 시퀀스→요소·값 / void→시퀀스
- 30.2 필터링 — `Where`, `Take`, `TakeLast`, `Skip`, `SkipLast`, `TakeWhile`, `SkipWhile`, `Distinct`, `DistinctBy`
- 30.3 투영 — `Select`, `SelectMany`
- 30.4 조인 — `Join`, `GroupJoin`, `Zip`
- 30.5 정렬 — `OrderBy`, `OrderByDescending`, `ThenBy`, `ThenByDescending`, `Order` ※.NET 7
- 30.6 그룹핑 — `GroupBy`, `Chunk`
- 30.7 집합 연산 — `Concat`, `Union`, `UnionBy`, `Intersect`, `IntersectBy`, `Except`, `ExceptBy`
- 30.8 변환 메서드 — `OfType`, `Cast`, `ToArray`, `ToList`, `ToDictionary`, `ToHashSet`, `ToLookup`, `AsEnumerable`, `AsQueryable`
- 30.9 요소 연산자 — `First`, `Last`, `Single`, `ElementAt`, `MinBy`, `MaxBy`, `DefaultIfEmpty`
- 30.10 집계 — `Count`, `LongCount`, `Min`, `Max`, `Sum`, `Average`, `Aggregate`
- 30.11 한정자 — `Contains`, `Any`, `All`, `SequenceEqual`
- 30.12 생성 메서드 — `Empty`, `Range`, `Repeat`
- 30.13 `Single()`과 `First()`로 의미를 강제하기
- 30.14 LINQ의 숨은 할당 — 델리게이트, 클로저, 열거자, 익명 타입
- 30.15 LINQ 성능 실전 — `let` 회피, `GroupBy` 개선, 마지막 원소 얻기, 리스트 필터링

### 31장. 식 트리와 해석되는 쿼리
- 31.1 델리게이트 vs 식 트리
- 31.2 `Expression<TDelegate>`의 구조
- 31.3 해석되는 쿼리(interpreted query)의 동작 원리
- 31.4 `IEnumerable` vs `IQueryable` — 어디서 실행되는가
- 31.5 로컬 쿼리와 해석 쿼리 결합하기, `AsEnumerable`
- 31.6 식 트리를 코드로 만들기 — 동적 쿼리 빌더
- 31.7 EF Core에서 LINQ가 SQL이 되기까지
- 31.8 EF Core 기초 — 엔티티, `DbContext`, 객체 추적, 변경 추적, 탐색 속성
- 31.9 합성 가능한 시퀀스 API 설계

---

# Part VI. 예외·리소스·객체 수명 🟣

### 32장. 예외 처리
- 32.1 예외란 무엇인가 — 반환 코드 방식과의 대비
- 32.2 `try` / `catch` / `finally` / `when`
- 32.3 `System.Exception`의 핵심 속성과 예외 계층
- 32.4 자주 만나는 예외 타입 카탈로그
- 32.5 `throw` vs `throw ex` — 스택 트레이스 보존
- 32.6 예외 처리 메커니즘 — 2단계 처리(1st pass 필터, 2nd pass 언와인딩)
- 32.7 예외 필터(`when`)가 catch-rethrow보다 나은 이유
- 32.8 예외 필터의 부수 효과 활용 — 로깅과 재시도
- 32.9 `TryXXX` 메서드 패턴과 예외의 대안
- 32.10 애플리케이션 전용 예외 클래스 설계
- 32.11 강한 예외 보장(strong exception guarantee)
- 32.12 예외 비용 측정 — 던지지 않을 때 / 던질 때 / 스택이 깊을 때
- 32.13 `AggregateException`, `Flatten`, `Handle`
- 32.14 처리되지 않은 예외와 프로세스 종료

### 33장. 결정적 정리와 IDisposable
- 33.1 .NET 리소스 관리 모델 — 관리 리소스 vs 비관리 리소스
- 33.2 표준 정리 의미론 — `Dispose` / `Close` / `Dispose(bool)`
- 33.3 표준 Dispose 패턴 구현 (봉인 타입 / 상속 가능 타입)
- 33.4 언제 Dispose 해야 하는가, 필드를 비워야 하는가
- 33.5 익명 disposal과 `using` 문·`using` 선언 ※C# 8
- 33.6 `IAsyncDisposable`과 `await using`
- 33.7 `SafeHandle` — 파이널라이저보다 나은 선택
- 33.8 `Dispose`를 부르지 않았을 때 실제로 벌어지는 일
- 33.9 제네릭 클래스가 `IDisposable` 타입 인자를 받을 때
- 33.10 `using`과 `try/finally` — 리소스 정리 관용구

### 34장. 객체 수명과 파이널라이제이션
- 34.1 "객체가 살아 있다"의 정의 — 루트
- 34.2 파이널라이저의 동작 순서와 비용 (F-reachable 큐)
- 34.3 파이널라이저에서 `Dispose` 호출하기
- 34.4 부활(resurrection)과 임계 파이널라이저
- 34.5 약한 참조 — 짧은/긴 약한 참조
- 34.6 약한 참조와 캐시, 약한 참조와 이벤트
- 34.7 `Lazy<T>`, `LazyInitializer`와 지연 초기화
- 34.8 `GC.KeepAlive`가 필요한 순간
- 34.9 `ConditionalWeakTable`과 의존 핸들
- 34.10 타이머가 만드는 관리 메모리 누수

---

# 제2권 — 라이브러리와 동시성

# Part VII. BCL I — 텍스트·시간·숫자 🔵

### 35장. 문자열과 텍스트 처리
- 35.1 `System.String`의 불변성과 내부 레이아웃
- 35.2 `char` 유틸리티와 `Rune` — 유니코드 정확성, 서로게이트 페어
- 35.3 문자열 조작 메서드 전수
- 35.4 문자열 비교 — 서수(ordinal) vs 문화권 인식, `StringComparison`
- 35.5 문자열 인터닝과 리터럴 풀 — 메모리 영향
- 35.6 `StringBuilder`와 효율적 문자열 구성
- 35.7 보간 문자열의 컴파일 결과와 `DefaultInterpolatedStringHandler` ※C# 10
- 35.8 텍스트 인코딩과 유니코드 — UTF-8 / UTF-16 / BOM
- 35.9 `Encoding` 클래스와 인코더·디코더
- 35.10 문자열로 타입을 대신하지 말 것 — string-ly typed API
- 35.11 문자열 할당을 줄이는 기법 (심화는 69장)

### 36장. 정규식
- 36.1 정규식 기초와 `Regex` 클래스
- 36.2 컴파일된 정규식과 `RegexOptions`
- 36.3 문자 이스케이프와 문자 집합
- 36.4 수량자 — 탐욕적(greedy) vs 게으른(lazy)
- 36.5 제로 폭 어설션 — 전방·후방 탐색, 앵커, 단어 경계
- 36.6 그룹과 명명된 그룹, 역참조
- 36.7 치환과 분할 — `MatchEvaluator` 델리게이트
- 36.8 소스 생성 정규식 `[GeneratedRegex]` ※.NET 7
- 36.9 실전 레시피 모음
- 36.10 정규식 언어 레퍼런스
- 36.11 정규식 성능과 ReDoS 방지

### 37장. 날짜와 시간
- 37.1 `TimeSpan` — 기간의 표현
- 37.2 `DateTime`과 `DateTimeOffset` — 무엇이 다른가
- 37.3 `DateOnly`와 `TimeOnly` ※.NET 6
- 37.4 `DateTime`과 시간대(`DateTimeKind`)
- 37.5 `DateTimeOffset`과 시간대
- 37.6 `TimeZoneInfo` — 변환, 조회, IANA vs Windows ID
- 37.7 서머타임(DST)이 만드는 함정 — 존재하지 않는 시각, 중복되는 시각
- 37.8 날짜 산술의 함정 — 윤년, 월말, 윤초
- 37.9 시간 의존성 제거 — `TimeProvider` ※.NET 8
- 37.10 날짜/시간 저장과 직렬화 전략

### 38장. 포매팅과 파싱, 국제화
- 38.1 `ToString`과 `Parse` / `TryParse` / `IParsable<T>`
- 38.2 형식 공급자(`IFormatProvider`), `CultureInfo`, `NumberFormatInfo`
- 38.3 표준·사용자 지정 숫자 형식 문자열
- 38.4 `NumberStyles` 파싱 플래그
- 38.5 표준·사용자 지정 날짜/시간 형식 문자열
- 38.6 `DateTimeStyles` 파싱 플래그
- 38.7 열거형 형식 문자열
- 38.8 `ISpanFormattable` / `IUtf8SpanFormattable`로 무할당 포매팅
- 38.9 기타 변환 메커니즘 — `Convert`, `XmlConvert`, `TypeConverter`, `BitConverter`
- 38.10 국제화 체크리스트와 테스트 전략
- 38.11 불변 문화권(`InvariantCulture`)을 써야 할 자리

### 39장. 숫자와 유틸리티 타입
- 39.1 숫자 변환과 `Math` 클래스
- 39.2 `BigInteger` — 임의 정밀도 정수
- 39.3 `Half`와 반정밀도 부동소수점
- 39.4 `Complex` — 복소수
- 39.5 `Random`과 `RandomNumberGenerator` — 언제 무엇을
- 39.6 `BitOperations`와 비트 조작
- 39.7 `Guid` 구조체 — 생성 방식, 버전, 정렬 가능한 GUID
- 39.8 유틸리티 클래스 — `Console`, `Environment`, `Process`, `AppContext`
- 39.9 `INumber<T>` 제네릭 수학으로 숫자 알고리즘 일반화하기

---

# Part VIII. BCL II — 데이터와 I/O 🔵🟣

### 40장. 스트림과 파일 I/O
- 40.1 스트림 아키텍처 — 백킹 스토어 / 데코레이터 / 어댑터
- 40.2 스트림 사용법 — 읽기·쓰기, 탐색(seek), 닫기·플러시, 타임아웃, 스레드 안전성
- 40.3 백킹 스토어 스트림 — `FileStream`, `MemoryStream`, `PipeStream`, `BufferedStream`
- 40.4 `FileStream` 옵션과 버퍼링 전략
- 40.5 텍스트 어댑터 — `StreamReader` / `StreamWriter`와 인코딩
- 40.6 바이너리 어댑터 — `BinaryReader` / `BinaryWriter`
- 40.7 압축 스트림 — `GZipStream`, `DeflateStream`, `BrotliStream`
- 40.8 ZIP 파일 다루기
- 40.9 Tar 파일 다루기 ※.NET 7
- 40.10 파일·디렉터리 조작 — `File`, `Directory`, `FileInfo`, `DirectoryInfo`, `Path`
- 40.11 특수 폴더, 볼륨 정보, 파일 시스템 이벤트 감시
- 40.12 크로스 플랫폼 경로 함정과 긴 경로
- 40.13 OS 보안 — 표준 사용자 계정, 관리자 권한 상승, 가상화
- 40.14 메모리 매핑 파일 — 임의 접근 I/O, 공유 메모리, 뷰 접근자
- 40.15 비동기 I/O가 진짜 비동기인 조건 — OS 수준 겹침 I/O
- 40.16 I/O 예외 처리와 재시도 정책

### 41장. 직렬화와 JSON
- 41.1 직렬화의 목적과 형식 선택 기준
- 41.2 `System.Text.Json` — 기본 사용과 옵션
- 41.3 저수준 API — `Utf8JsonReader`, `Utf8JsonWriter`
- 41.4 DOM API — `JsonDocument`, `JsonNode`
- 41.5 커스텀 컨버터와 다형 직렬화
- 41.6 소스 생성 JSON 컨텍스트와 AOT 호환성
- 41.7 `BinaryFormatter`가 제거된 이유
- 41.8 역직렬화 공격 표면과 방어
- 41.9 직렬화 성능 비교와 선택 가이드

### 42장. XML
- 42.1 XML을 다루는 세 가지 방식 — DOM / 스트리밍 / 직렬화
- 42.2 LINQ to XML(X-DOM) 아키텍처
- 42.3 X-DOM 로딩·파싱·저장·직렬화
- 42.4 함수형 구성(functional construction)과 콘텐츠 지정, 자동 깊은 복제
- 42.5 탐색과 쿼리 — 자식·부모·형제·특성
- 42.6 X-DOM 갱신 — 값, 자식 노드, 특성, 부모를 통한 갱신
- 42.7 값 다루기 — 설정·조회, 혼합 콘텐츠, 자동 `XText` 연결
- 42.8 `XDocument`와 XML 선언
- 42.9 이름과 네임스페이스, 기본 네임스페이스, 접두사
- 42.10 주석(annotation)과 X-DOM으로 투영하기, 스트리밍 투영
- 42.11 `XmlReader` — 노드·요소·특성 읽기, 네임스페이스
- 42.12 `XmlWriter` — 특성·기타 노드 쓰기
- 42.13 `XmlReader`/`XmlWriter` 사용 패턴 — 계층 데이터, X-DOM과 혼용
- 42.14 XML 직렬화와 XSD, XML 보안(XXE)

### 43장. 네트워킹
- 43.1 네트워크 아키텍처와 .NET의 계층
- 43.2 주소와 포트, `IPAddress`, `IPEndPoint`
- 43.3 URI 다루기 — `Uri`, `UriBuilder`
- 43.4 `HttpClient` — `GetAsync`와 응답 메시지
- 43.5 `SendAsync`와 요청 메시지 직접 구성
- 43.6 데이터 업로드와 `HttpContent` 종류
- 43.7 `HttpMessageHandler`와 파이프라인, `IHttpClientFactory`
- 43.8 프록시, 인증, 헤더, 쿼리 문자열, 폼 데이터, 쿠키
- 43.9 `HttpClient` 수명 관리 — 소켓 고갈 문제
- 43.10 HTTP 서버 직접 작성하기
- 43.11 DNS 조회
- 43.12 TCP 직접 사용하기와 TCP 동시성
- 43.13 메일 전송과 수신 (`SmtpClient`, POP3 over TCP)
- 43.14 gRPC와 이진 프로토콜
- 43.15 네트워크 성능 — 커넥션 풀링, HTTP/2·3, 압축

### 44장. 암호화
- 44.1 .NET 암호화 API 개요와 선택 기준
- 44.2 Windows 데이터 보호(DPAPI)
- 44.3 해싱 — .NET의 해시 알고리즘
- 44.4 비밀번호 해싱 — `Rfc2898DeriveBytes`, 솔트, 반복 횟수
- 44.5 대칭 암호화 — 메모리 내 암호화, 스트림 체이닝
- 44.6 암호화 객체의 해제와 키 관리
- 44.7 공개키 암호화와 서명 — `RSA` 클래스, 디지털 서명
- 44.8 난수와 암호학적 안전성
- 44.9 흔한 실수 카탈로그 — 직접 구현, ECB 모드, 하드코딩된 키

---

# Part IX. 동시성과 비동기 🟣

### 45장. 스레드의 기초
- 45.1 왜 OS는 스레드를 지원하는가
- 45.2 스레드 생성, `Join`, `Sleep`, 블로킹
- 45.3 CLR 스레드와 OS 스레드의 관계
- 45.4 스레드 생성 비용 — 커널 객체, 스택 예약, 컨텍스트 스위치
- 45.5 지역 상태 vs 공유 상태
- 45.6 스레드에 데이터 전달하기와 예외 처리
- 45.7 포그라운드 vs 백그라운드 스레드, 스레드 우선순위
- 45.8 리치 클라이언트 애플리케이션의 스레딩과 동기화 컨텍스트
- 45.9 스레드를 직접 만들면 안 되는 이유

### 46장. 스레드 풀과 태스크
- 46.1 CLR 스레드 풀의 구조 — 전역 큐, 로컬 큐, 워크 스틸링
- 46.2 스레드 주입(injection)과 hill-climbing 알고리즘
- 46.3 `Task` 시작하기와 값 반환
- 46.4 태스크의 예외와 연속(continuation)
- 46.5 `TaskCompletionSource` — 무엇이든 태스크로 감싸기
- 46.6 `Task.Delay`, `PeriodicTimer`, 주기적 작업
- 46.7 실행 컨텍스트(`ExecutionContext`)의 흐름과 캡처
- 46.8 협력적 취소 — `CancellationToken` 프로토콜 구현
- 46.9 태스크 합성기 — `WhenAll`, `WhenAny`, `WhenEach` ※.NET 9
- 46.10 `TaskScheduler`, `TaskFactory`, `TaskCreationOptions`
- 46.11 관찰되지 않은 예외(`UnobservedTaskException`)
- 46.12 진행 상황 보고 — `IProgress<T>`

### 47장. async / await 완전 해부
- 47.1 동기 연산과 비동기 연산 — 무엇이 다른가
- 47.2 비동기의 본질 — 스레드가 아니라 "대기"의 문제
- 47.3 비동기 프로그래밍과 연속 — 언어 지원이 왜 중요한가
- 47.4 `await`의 의미론
- 47.5 `async` 메서드 선언과 반환 타입 (`void` / `Task` / `ValueTask` / 커스텀)
- 47.6 awaitable 패턴 — `GetAwaiter` / `IsCompleted` / `OnCompleted` / `GetResult`
- 47.7 컴파일러가 만드는 상태 기계 — 필드, `MoveNext()`, 빌더
- 47.8 상태 기계 박싱 댄스와 `SetStateMachine`
- 47.9 `await` 표현식의 평가 순서와 완료 경로 최적화
- 47.10 루프 / `try-finally` 안의 `await`가 상태 기계에 미치는 영향
- 47.11 비동기 람다와 비동기 스트림의 상태 기계
- 47.12 비동기와 동기화 컨텍스트, `ConfigureAwait(false)`의 정확한 의미
- 47.13 `ValueTask`를 써야 할 때와 쓰면 안 될 때
- 47.14 `async void` 금지, sync-over-async 금지 — 데드락의 해부
- 47.15 TAP(태스크 기반 비동기 패턴) 규약
- 47.16 폐기된 패턴 — APM(`Begin`/`End`), EAP, `BackgroundWorker`
- 47.17 비동기 코드 테스트하기

### 48장. 동기화와 잠금
- 48.1 동기화 개요 — 무엇을 왜 동기화하는가
- 48.2 원자성·가시성·재배치 — .NET 메모리 모델
- 48.3 `volatile`, `Volatile` 클래스, 메모리 배리어
- 48.4 `Interlocked` — 사용자 모드 원자 연산
- 48.5 배타적 잠금 — `lock` 문, `Monitor.Enter`/`Exit`
- 48.6 잠금 객체 선택과 잠금 범위 결정
- 48.7 잠금과 원자성, 중첩 잠금
- 48.8 데드락 · 라이브락 · 우선순위 역전 진단
- 48.9 잠금 성능과 경합(contention) 측정
- 48.10 `Mutex` — 크로스 프로세스 잠금
- 48.11 비배타적 잠금 — `Semaphore`, `SemaphoreSlim`, 읽기/쓰기 잠금
- 48.12 스핀락, 스핀 대기, 스레드 소유권과 재귀
- 48.13 이중 검사 잠금(double-check locking)의 정확한 구현
- 48.14 스레드 안전성 — .NET 타입의 스레드 안전성, 애플리케이션 서버, 불변 객체
- 48.15 `System.Threading.Lock` 타입 ※C# 13 / .NET 9

### 49장. 신호와 스레드 로컬 상태
- 49.1 이벤트 대기 핸들로 신호 보내기
- 49.2 `AutoResetEvent`와 `ManualResetEvent`(`Slim`)
- 49.3 `CountdownEvent`
- 49.4 크로스 프로세스 `EventWaitHandle` 만들기
- 49.5 대기 핸들과 연속, `WaitAny` / `WaitAll` / `SignalAndWait`
- 49.6 `Barrier` 클래스 — 단계적 병렬 작업
- 49.7 조건 변수 패턴
- 49.8 스레드 로컬 저장소 — `[ThreadStatic]`, `ThreadLocal<T>`, `GetData`/`SetData`
- 49.9 `AsyncLocal<T>` — 비동기 흐름을 따라가는 상태
- 49.10 타이머 세 종류 — `PeriodicTimer`, 멀티스레드 타이머, 단일 스레드 타이머

### 50장. 병렬 프로그래밍
- 50.1 동시성 vs 병렬성 — 용어 정리
- 50.2 PFX 개념과 구성 요소, 언제 쓰는가
- 50.3 PLINQ — 병렬 실행 원리, 순서, 한계
- 50.4 함수적 순수성과 병렬 안전성
- 50.5 병렬도 설정, 취소, PLINQ 최적화
- 50.6 `Parallel.Invoke` / `For` / `ForEach`와 파티셔닝 전략
- 50.7 `Parallel.ForEachAsync`
- 50.8 태스크 병렬성 — 생성·대기·취소·연속
- 50.9 병렬 코드의 예외 처리와 `AggregateException`
- 50.10 동시성 컬렉션 — `IProducerConsumerCollection<T>`, `ConcurrentBag<T>`
- 50.11 `BlockingCollection<T>`로 프로듀서/컨슈머 큐 만들기
- 50.12 false sharing과 캐시 라인
- 50.13 병렬 디버깅·프로파일링 — Parallel Stacks, Tasks 창, Concurrency Visualizer

### 51장. 비동기 아키텍처 패턴
- 51.1 프로듀서/컨슈머와 `System.Threading.Channels`
- 51.2 백프레셔와 큐 크기 설계
- 51.3 비동기 잠금 — `SemaphoreSlim`을 async lock으로
- 51.4 타임아웃 · 재시도 · 취소의 결합
- 51.5 UI 스레드 모델과 크로스 스레드 호출 (WinForms / WPF / MAUI)
- 51.6 서버 애플리케이션의 비동기 설계 원칙
- 51.7 비동기 코드에서 스레드 할당과 컨텍스트 전환을 줄이기

---

# 제3권 — 내부, 메모리, 성능

# Part X. CLR 내부 구조 ⚫

### 52장. 어셈블리
- 52.1 어셈블리 안에는 무엇이 있는가
- 52.2 어셈블리 매니페스트와 메타데이터 테이블 구조
- 52.3 애플리케이션 매니페스트(Windows)와 모듈
- 52.4 `Assembly` 클래스로 자기 자신을 들여다보기
- 52.5 강력한 이름과 어셈블리 서명, 지연 서명, 변조 방지
- 52.6 어셈블리 이름 — 정규화된 이름, `AssemblyName`, 정보·파일 버전
- 52.7 Authenticode 서명
- 52.8 런타임의 타입 참조 해석 과정
- 52.9 `AssemblyLoadContext` — AppDomain을 대체한 격리 모델
- 52.10 기본 ALC, "현재" ALC, `Assembly.Load`와 컨텍스트
- 52.11 비관리 라이브러리 로딩과 해석, `AssemblyDependencyResolver`
- 52.12 ALC 언로드와 수집 가능(collectible) 어셈블리
- 52.13 레거시 로딩 메서드와 그 함정
- 52.14 플러그인 시스템 직접 만들기
- 52.15 어셈블리 탐색 순서, `deps.json`, 프로빙

### 53장. 리소스와 지역화
- 53.1 리소스를 직접 임베드하기
- 53.2 `.resources` 파일과 `.resx` 파일
- 53.3 위성 어셈블리와 어셈블리 버전 리소스 정보
- 53.4 문화권과 하위 문화권, 폴백 규칙
- 53.5 지역화 워크플로 설계

### 54장. 타입 시스템의 런타임 표현
- 54.1 `MethodTable` 해부 — TypeHandle, 슬롯 테이블, 인터페이스 맵
- 54.2 객체 헤더(싱크 블록 인덱스)와 메서드 테이블 참조 — 왜 헤더가 "음수 인덱스"인가
- 54.3 최소 객체 크기가 32비트 12바이트 / 64비트 24바이트인 이유
- 54.4 필드 레이아웃, 정렬, `[StructLayout]`, `[FieldOffset]`
- 54.5 정적 필드는 어디에 저장되는가 — High Frequency Heap
- 54.6 박싱과 언박싱의 실제 IL과 힙 표현
- 54.7 문자열과 배열의 특수 레이아웃
- 54.8 타입 카테고리와 타입 저장 방식 — 값 타입 / 참조 타입의 실제 배치
- 54.9 타입 데이터 지역성 — 같은 데이터, 다른 성능
- 54.10 실습: WinDbg로 객체 크기와 레이아웃 직접 확인하기

### 55장. JIT 컴파일과 코드 생성
- 55.1 IL이 네이티브가 되는 시점 — 프리스텁과 백패칭
- 55.2 계층형 컴파일(Tiered Compilation)과 Tier-1 승격 조건
- 55.3 OSR(On-Stack Replacement) — 긴 루프의 재컴파일 ※.NET 7+
- 55.4 인라이닝 규칙과 `[MethodImpl(AggressiveInlining)]`
- 55.5 역가상화(devirtualization)와 가드된 역가상화(GDV)
- 55.6 경계 검사 제거, 루프 클로닝, 상수 폴딩, 이스케이프 분석
- 55.7 ReadyToRun과 Native AOT — 언제 무엇을 쓰나
- 55.8 SharpLab / `DOTNET_JitDisasm`으로 생성 코드 읽기
- 55.9 JIT을 도와주는 코드 vs 방해하는 코드

### 56장. CIL 읽기
- 56.1 왜 IL을 읽어야 하는가
- 56.2 스택 기반 실행 모델 — 평가 스택
- 56.3 주요 디렉티브·특성·옵코드
- 56.4 BCL / C# / CIL 데이터 타입 대응표
- 56.5 CIL로 타입 멤버 정의하기
- 56.6 C# 문법 → IL 매핑 (프로퍼티, 이벤트, 클로저, `foreach`, `using`, `lock`, `async`)
- 56.7 라운드트립 엔지니어링 — `ildasm` / `ilasm`
- 56.8 ILSpy / dotPeek로 디컴파일하기
- 56.9 IL 파싱 — 디스어셈블러 직접 만들기

### 57장. 리플렉션과 메타데이터
- 57.1 타입 얻기와 타입 이름 규칙
- 57.2 기본 타입과 인터페이스 조회
- 57.3 타입 인스턴스화 — `Activator`, 생성자 호출
- 57.4 제네릭 타입 리플렉션
- 57.5 멤버 조회 — `MemberInfo` 계층, C# 멤버 vs CLR 멤버
- 57.6 멤버 동적 호출과 메서드 매개변수
- 57.7 비공개 멤버 접근
- 57.8 제네릭 메서드와 제네릭 인터페이스 멤버의 익명 호출
- 57.9 정적 가상·추상 인터페이스 멤버 호출 ※C# 11
- 57.10 어셈블리와 모듈 리플렉션
- 57.11 특성 다루기 — 정의, 적용, 런타임 조회
- 57.12 리플렉션 성능의 실체와 캐싱 전략
- 57.13 델리게이트 컴파일 / 식 트리로 리플렉션 대체하기
- 57.14 트리밍/AOT에서 리플렉션이 깨지는 지점과 `[DynamicallyAccessedMembers]`
- 57.15 소스 생성기(Source Generator) — 컴파일 타임 대안

### 58장. 동적 코드 생성
- 58.1 `DynamicMethod`로 IL 생성하기
- 58.2 평가 스택 다루기와 인수 전달
- 58.3 지역 변수 생성과 분기
- 58.4 객체 생성과 인스턴스 메서드 호출
- 58.5 예외 처리 코드 방출
- 58.6 `Reflection.Emit` 객체 모델 — 동적 어셈블리와 타입
- 58.7 메서드·필드·프로퍼티·생성자 방출
- 58.8 특성 부착
- 58.9 제네릭 메서드·제네릭 타입 방출
- 58.10 까다로운 방출 대상 — 미생성 닫힌 제네릭, 순환 의존성
- 58.11 Emit vs 식 트리 vs 소스 생성기 — 선택 기준

### 59장. 동적 프로그래밍과 DLR
- 59.1 정적 바인딩 vs 동적 바인딩
- 59.2 동적 언어 런타임(DLR)의 구조
- 59.3 `dynamic`의 런타임 표현과 호출 사이트 캐싱
- 59.4 동적 변환, 동적 식, `RuntimeBinderException`
- 59.5 `var` vs `dynamic`
- 59.6 동적 식 안의 정적 타입, 호출 불가능한 함수
- 59.7 동적 멤버 오버로드 해석 — 방문자 패턴 단순화
- 59.8 사용자 정의 바인딩 — `DynamicObject`, `ExpandoObject`
- 59.9 동적 언어와 상호운용, C#과 스크립트 사이 상태 전달
- 59.10 `dynamic`의 한계와 성능 비용

### 60장. 네이티브 및 COM 상호운용
- 60.1 네이티브 DLL 호출 — P/Invoke 기초
- 60.2 타입과 매개변수 마샬링 규칙
- 60.3 blittable 타입과 마샬링 비용
- 60.4 비관리 코드에서의 콜백 (`delegate`와 함수 포인터)
- 60.5 C 공용체(union) 시뮬레이션과 구조체를 비관리 메모리에 매핑하기
- 60.6 공유 메모리 다루기
- 60.7 `unsafe`, 포인터, 멤버 접근 연산자, `void*`
- 60.8 `fixed` 문과 고정(pinning), 고정 크기 버퍼
- 60.9 `[LibraryImport]` 소스 생성 P/Invoke ※.NET 7+
- 60.10 `SuppressGCTransition`과 호출 오버헤드 제거
- 60.11 함수 포인터 `delegate*`와 `[UnmanagedCallersOnly]`
- 60.12 COM 상호운용 — C#에서 COM 컴포넌트 호출, 상호 운용 형식 포함
- 60.13 C# 객체를 COM에 노출하기
- 60.14 `Marshal.ReleaseComObject`의 위험
- 60.15 비관리 메모리 직접 다루기 — `NativeMemory`, `Marshal.AllocHGlobal`

---

# Part XI. 메모리와 가비지 컬렉션 ⚫

### 61장. 메모리의 기초
- 61.1 스택 · 힙 · 레지스터 · 정적 영역
- 61.2 가상 메모리, 페이지, 대용량 페이지, 단편화
- 61.3 Windows / Linux 메모리 관리와 레이아웃
- 61.4 CPU 캐시 계층과 캐시 히트/미스
- 61.5 데이터 지역성(공간적/시간적)과 정렬
- 61.6 프리페칭과 비일시적(non-temporal) 접근
- 61.7 NUMA와 CPU 그룹
- 61.8 수동 관리 vs 자동 관리 — 무엇을 포기하고 무엇을 얻었나
- 61.9 참조 카운팅 vs 추적 수집기, 보수적 GC vs 정밀 GC

### 62장. .NET 힙의 구조
- 62.1 뮤테이터 / 할당자 / 수집기 모델
- 62.2 프로세스 메모리 영역 — 내 프로그램은 실제로 몇 MB인가
- 62.3 크기 분할 — SOH와 LOH (85,000바이트 경계, double 배열 예외)
- 62.4 수명 분할 — 세대(0/1/2)와 세대 가설
- 62.5 종류 분할 — POH(고정 객체 힙), NonGC 힙
- 62.6 물리 분할 — 세그먼트(~.NET 6) → 리전(.NET 7+)
- 62.7 기억 집합(remembered set), 카드 테이블, 카드 번들
- 62.8 세그먼트/리전 재사용과 힙 해부 실습
- 62.9 어셈블리 수가 늘어날 때의 메모리 증가

### 63장. 할당
- 63.1 범프 포인터 할당과 할당 컨텍스트
- 63.2 프리 리스트 할당
- 63.3 새 객체가 만들어지는 전체 경로 (`newobj` → 할당자 → 초기화)
- 63.4 LOH·POH 할당 경로
- 63.5 힙 밸런싱 (서버 GC)
- 63.6 할당 예산(allocation budget)과 GC 트리거
- 63.7 스택 할당과 `stackalloc`
- 63.8 `OutOfMemoryException`이 나는 진짜 이유
- 63.9 숨은 할당 카탈로그 — 델리게이트, 클로저, 박싱, `yield`, `params`, 문자열 연결·포매팅, LINQ, 열거자
- 63.10 라이브러리 내부의 숨은 할당 찾기

### 64장. GC 알고리즘 완전 해부
- 64.1 GC 한 사이클의 전체 흐름 — 예제로 따라가기
- 64.2 Mark 단계 — 객체 순회와 마킹
- 64.3 루트의 종류 — 스택 루트, GC 핸들, 파이널라이제이션 루트, 내부 루트
- 64.4 GC Info와 스택 루트 스캐닝, 어휘 범위 vs 실제 생존 범위
- 64.5 즉시 루트 수집(eager root collection)
- 64.6 Plan 단계 — plug와 gap, 브릭 테이블, 세대 경계, 강등(demotion)
- 64.7 고정(pinning)이 계획 단계에 미치는 영향
- 64.8 압축(compaction) 결정 로직
- 64.9 Sweep 단계와 프리 리스트 구성
- 64.10 Compact 단계 — 참조 재배치, 객체 이동, 세대 경계 수정
- 64.11 쓰기 장벽(write barrier)의 비용
- 64.12 EE 일시 중단(suspension)과 안전 지점(safe point)

### 65장. GC 모드와 튜닝
- 65.1 워크스테이션 GC vs 서버 GC
- 65.2 비동시 vs 백그라운드(동시) GC — 동시 마크, 동시 스윕
- 65.3 GC 일시 중지 시간과 오버헤드의 트레이드오프
- 65.4 지연 시간 모드 — Batch / Interactive / LowLatency / SustainedLowLatency / NoGCRegion
- 65.5 힙 하드 리밋, 힙 개수, GC 스레드 어피니티
- 65.6 메모리 부하 임계값과 보수적 모드, 대용량 페이지
- 65.7 DATAS(동적 적응 모드)와 컨테이너 환경 ※.NET 8+
- 65.8 GC API — `GC.Collect`, `GetGCMemoryInfo`, `AddMemoryPressure`, `TryStartNoGCRegion`, `GCSettings`, `GC.KeepAlive`
- 65.9 GC 알림과 프로그래밍적 제어
- 65.10 배열 풀링을 GC 관점에서 보기
- 65.11 GC 모드 선택 판단 흐름도
- 65.12 커스텀 GC(standalone GC)의 존재

### 66장. 메모리 문제 진단
- 66.1 누수인가 아닌가 — 판별 기준과 "누수가 없다"는 가정의 위험
- 66.2 오버헤드와 침습성, 샘플링 vs 추적
- 66.3 호출 트리, 객체 그래프, 통계
- 66.4 스냅샷 단일 분석 vs 스냅샷 비교
- 66.5 지배자(dominator) 분석과 루트 경로 추적
- 66.6 이벤트 추적 — ETW, EventPipe, `dotnet-trace`
- 66.7 PerfView 워크플로 — 수집, GCStats, 힙 스냅샷
- 66.8 `dotnet-counters` / `dotnet-dump` / `dotnet-gcdump` / `dotnet-gcstats`
- 66.9 WinDbg + SOS 실전 — `!dumpheap`, `!gcroot`, `!objsize`, `!eeheap`, `!finalizequeue`
- 66.10 상용 도구 비교 — dotMemory, dotTrace, ANTS, VS 프로파일러
- 66.11 대표 시나리오 6선 — 이벤트 누수, 정적 캐시, 타이머, LOH 단편화, 파이널라이저 큐 적체, 어셈블리 누적
- 66.12 mid-life crisis(중년기 위기) 패턴 식별과 해소
- 66.13 세대별 인식 분석(generational aware analysis)

---

# Part XII. 고성능 C# ⚫

### 67장. 측정 없이 최적화 없다
- 67.1 처리량 · 지연 시간 · 메모리 — 무엇을 최적화할지 먼저 정하기
- 67.2 `Stopwatch`로 시작하는 거친 측정과 그 한계
- 67.3 BenchmarkDotNet 제대로 쓰기
- 67.4 벤치마크가 거짓말하는 경우 — 죽은 코드 제거, 워밍업 부족, 이상치, 계층형 컴파일
- 67.5 `MemoryDiagnoser`와 할당 추적
- 67.6 프로파일러 종류와 오버헤드 — 샘플링 vs 추적
- 67.7 코드 메트릭과 정적 코드 분석
- 67.8 성능 회귀를 CI에서 잡기

### 68장. `Span<T>`와 `Memory<T>`
- 68.1 `ref struct`의 규칙과 제약
- 68.2 `Span<T>` 내부 구조 — 관리 포인터 + 길이
- 68.3 "slow span"과 "fast span" — 런타임 지원의 차이
- 68.4 슬라이싱, `CopyTo` / `TryCopyTo`, 스팬 내 검색
- 68.5 텍스트를 스팬으로 다루기
- 68.6 `Memory<T>`, `IMemoryOwner<T>`, `MemoryManager<T>`
- 68.7 전방 전용 열거자(forward-only enumerator) 패턴
- 68.8 스택 할당 메모리와 비관리 메모리 다루기
- 68.9 `stackalloc`과 `Span`의 결합
- 68.10 인라인 배열 ※C# 12
- 68.11 `ref` 필드와 `scoped` ※C# 11
- 68.12 관리 포인터(`ref` 지역/반환)의 내부 표현
- 68.13 `Span` / `Memory` 사용 가이드라인

### 69장. 할당 줄이기
- 69.1 `struct`로 바꿀 때의 손익 계산
- 69.2 `ValueTuple`과 `ValueTask`
- 69.3 `ArrayPool<T>`와 `MemoryPool<T>`
- 69.4 오브젝트 풀과 `RecyclableMemoryStream`
- 69.5 문자열 할당 제거 — `string.Create`, 보간 핸들러, `Span` 슬라이싱
- 69.6 `SearchValues<T>`와 최적화된 검색 ※.NET 8
- 69.7 UTF-8 직접 다루기로 인코딩 변환 제거
- 69.8 `[SkipLocalsInit]`과 미세 최적화의 경계
- 69.9 핫 패스에서 힙 할당을 0으로 만들기 — 실전 케이스

### 70장. 데이터 지향 설계
- 70.1 첫 캐시 라인에 필요한 데이터를 모두 담기
- 70.2 하위 캐시 레벨에 맞는 데이터 크기 설계
- 70.3 AoS(구조체 배열) → SoA(배열 구조체) 전환
- 70.4 엔티티 컴포넌트 시스템(ECS) 사고방식
- 70.5 비순차 접근 회피, 순차 접근 유도
- 70.6 거짓 공유 제거와 패딩
- 70.7 병렬화하기 쉬운 데이터 설계

### 71장. 벡터화와 하드웨어 가속
- 71.1 `Vector<T>`와 `Vector128` / `Vector256` / `Vector512`
- 71.2 하드웨어 내장 함수(`System.Runtime.Intrinsics`)
- 71.3 SIMD로 다시 쓰는 루프 — 합계, 검색, 변환
- 71.4 폴백 경로 설계와 `IsHardwareAccelerated` 검사
- 71.5 BCL이 이미 벡터화한 것들 — 바퀴를 다시 만들지 않기
- 71.6 언제 SIMD가 오히려 손해인가

### 72장. 시스템 레벨 성능
- 72.1 `System.IO.Pipelines`로 제로 카피 파싱
- 72.2 소켓 · HTTP 성능과 커넥션 관리
- 72.3 데이터 접근 성능 — ADO.NET / Dapper / EF Core 벤치마크 비교
- 72.4 EF Core 성능 함정 — N+1, 추적 오버헤드, 지연 로딩, 컴파일된 쿼리
- 72.5 캐싱 계층 — 메모리 캐시, 분산 캐시, 캐시 무효화
- 72.6 컬렉션 선택이 만드는 차이 — Big-O 너머의 상수
- 72.7 시작 시간 최적화 — R2R, Native AOT, 트리밍
- 72.8 컨테이너 메모리 제한과 GC 설정
- 72.9 응답성 있는 UI — 긴 작업의 배경 실행
- 72.10 분산 시스템의 성능 고려사항

---

# Part XIII. 진단과 디버깅 🟣

### 73장. 진단 API
- 73.1 조건부 컴파일 vs 정적 플래그 변수
- 73.2 `Debug`와 `Trace` 클래스 — `Assert`, `Fail`, `WriteIf`
- 73.3 `TraceListener`와 리스너 플러시·종료
- 73.4 `StackTrace`와 `StackFrame`으로 호출 스택 읽기
- 73.5 `Process`와 `ProcessThread` — 실행 중인 프로세스·스레드 조사
- 73.6 Windows 이벤트 로그 쓰기·읽기·감시
- 73.7 성능 카운터 — 열거, 읽기, 직접 만들기
- 73.8 `Stopwatch`와 고해상도 타이밍
- 73.9 크로스 플랫폼 진단 도구 — `dotnet-counters` / `dotnet-trace` / `dotnet-dump`

### 74장. 디버깅 기법
- 74.1 디버거 통합 — 연결(attach)과 중단(break)
- 74.2 디버거 특성 — `DebuggerDisplay`, `DebuggerBrowsable`, `DebuggerStepThrough`, `DebuggerTypeProxy`
- 74.3 조건부 중단점, 추적점, 데이터 중단점
- 74.4 병렬·비동기 코드 디버깅
- 74.5 메모리 덤프 생성과 사후 분석
- 74.6 로드된 모듈 확인과 심볼(PDB) 관리
- 74.7 소스 링크와 프로덕션 디버깅
- 74.8 프로덕션 사고를 재현하는 법 — 덤프에서 시작하기

### 75장. 관측 가능성
- 75.1 로깅과 구조적 로그 — `ILogger`, 로그 수준, 스코프
- 75.2 소스 생성 로깅 (`[LoggerMessage]`)
- 75.3 메트릭 — `System.Diagnostics.Metrics`, `Meter`, 계측기 종류
- 75.4 분산 추적 — `ActivitySource`, `Activity`, 컨텍스트 전파
- 75.5 OpenTelemetry 연동
- 75.6 상태 점검(health check)과 준비성
- 75.7 무엇을 계측할 것인가 — 신호 설계

---

# Part XIV. 언어의 진화 🔵

### 76장. C# 버전별 기능 지도
- 76.1 C# 2 — 제네릭, 널 가능 값 타입, 반복자, 익명 메서드, 부분 타입
- 76.2 C# 3 — 암시적 타입, 객체/컬렉션 초기화자, 익명 타입, 람다, 확장 메서드, 쿼리 식
- 76.3 C# 4 — `dynamic`, 선택적 매개변수와 명명된 인수, 제네릭 가변성, COM 개선
- 76.4 C# 5 — `async` / `await`, 호출자 정보 특성, `foreach` 변수 캡처 수정
- 76.5 C# 6 — 자동 프로퍼티 개선, 식 본문 멤버, 보간 문자열, `nameof`, 예외 필터, null 조건 연산자, `using static`
- 76.6 C# 7.x — 튜플과 분해, 패턴 매칭, `ref` 지역/반환, `in`, `readonly struct`, `ref struct`, 지역 함수, `throw` 식
- 76.7 C# 8 — 널 가능 참조 타입, `switch` 식, 범위/인덱스, 기본 인터페이스 멤버, 비동기 스트림, `using` 선언
- 76.8 C# 9 — 레코드, `init`, 최상위 문, 패턴 개선, 공변 반환, `static` 람다, 대상 타입 지정 `new`
- 76.9 C# 10 — `record struct`, `global using`, 파일 범위 네임스페이스, 보간 핸들러, 구조체 개선
- 76.10 C# 11 — 원시 문자열, 정적 추상 멤버(제네릭 수학), `required`, `ref` 필드, 목록 패턴, UTF-8 리터럴
- 76.11 C# 12 — 기본 생성자, 컬렉션 식, 인라인 배열, 모든 타입 별칭, 람다 기본값
- 76.12 C# 13 이후 ※ — `params` 컬렉션, `Lock` 타입, `ref struct` 인터페이스 구현, `field` 키워드, 확장 멤버
- 76.13 런타임 버전과 언어 버전의 조합 표
- 76.14 기능 도입 시점을 아는 것이 실무에서 왜 필요한가 — 멀티 타깃과 레거시

### 77장. 튜플·분해·패턴 매칭 완전 정복
- 77.1 튜플 리터럴과 튜플 타입, 요소 이름 규칙
- 77.2 `System.ValueTuple`의 CLR 표현과 이름 처리
- 77.3 튜플 변환, 동등성·순서 비교, 구조적 비교
- 77.4 튜플 별칭 ※C# 12 과 `System.Tuple` 클래스와의 차이
- 77.5 튜플의 대안 — 익명 타입, 명명된 타입, 레코드
- 77.6 튜플 분해와 비튜플 타입 분해 (`Deconstruct`)
- 77.7 상수 패턴 / 타입 패턴 / `var` 패턴
- 77.8 관계 패턴과 패턴 결합자 (`and` / `or` / `not`)
- 77.9 속성 패턴과 재귀 패턴
- 77.10 위치 패턴과 튜플 패턴
- 77.11 목록 패턴과 슬라이스 패턴 ※C# 11
- 77.12 `is` 연산자와 `switch` 문·식에서의 패턴
- 77.13 가드 절, 패턴 변수 범위, 평가 순서
- 77.14 `switch` 식의 완전성(exhaustiveness) 검사
- 77.15 패턴이 컴파일되는 형태와 분기 성능
- 77.16 패턴 매칭·분해로 다시 쓰기 좋은 코드 찾기

---

# Part XV. 설계와 관용구 ⚫

### 78장. API 설계
- 78.1 타입 가시성을 최소화하라
- 78.2 상속보다 인터페이스 정의·구현을 선호하라
- 78.3 메서드 그룹은 명확·최소·완전하게
- 78.4 오버로드 폭발 대신 선택적 매개변수
- 78.5 내부 객체에 대한 참조를 반환하지 말 것
- 78.6 API에서 변환 연산자를 피하라
- 78.7 `ICloneable`이 설계 선택지를 좁히는 이유
- 78.8 기본 클래스에 정의된 메서드 오버로딩 회피
- 78.9 배열 매개변수는 `params` 배열로 제한
- 78.10 이벤트가 늘리는 런타임 결합 이해하기
- 78.11 부분 클래스에 부분 메서드를 제공하기
- 78.12 반복자·비동기 메서드의 즉시 오류 보고
- 78.13 버전 관리 — 바이너리 호환성을 깨는 변경 목록
- 78.14 컴포넌트, 다형성, 버전 관리의 삼각관계

### 79장. 코드 관용구
- 79.1 `var`를 쓸 자리와 쓰지 말 자리
- 79.2 `const`보다 `readonly`
- 79.3 캐스트보다 `is` / `as`
- 79.4 `string.Format` 대신 보간 문자열, 문화권 의존 문자열은 `FormattableString`
- 79.5 멤버 초기화자 vs 생성자 할당, 정적 멤버의 올바른 초기화
- 79.6 중복 초기화 로직 제거
- 79.7 불필요한 객체 생성 회피
- 79.8 `new` 한정자는 기반 클래스 변경에 반응할 때만
- 79.9 프로퍼티는 데이터처럼 동작해야 한다
- 79.10 익명 타입으로 타입 범위 제한하기
- 79.11 반복자 메서드 · 쿼리 구문 · 지연 평가 선호
- 79.12 비싼 리소스를 클로저에 가두지 말 것
- 79.13 코드 분석기와 `.editorconfig`로 관용구 강제하기

### 80장. 테스트 가능한 코드
- 80.1 단위 테스트 기초 (xUnit)와 테스트 가능한 설계
- 80.2 의존성 주입과 경계 설계
- 80.3 비동기 코드 테스트
- 80.4 시간·난수·파일 시스템 의존성 제거
- 80.5 통합 테스트와 테스트 컨테이너
- 80.6 성능 테스트를 테스트 스위트에 넣기
- 80.7 디버깅이 쉬운 코드를 만드는 습관

---

# Part XVI. 실전 적용 🔵

### 81장. 애플리케이션 유형별 지도
- 81.1 콘솔 앱과 워커 서비스
- 81.2 클래스 라이브러리 설계와 NuGet 패키징
- 81.3 ASP.NET Core — 미들웨어 파이프라인, DI, 구성, 최소 API
- 81.4 Razor Pages와 MVC
- 81.5 웹 서비스 만들기와 소비하기 — REST, 문서화, 테스트
- 81.6 EF Core — 모델 정의, 쿼리, 추적, 변경 저장, 마이그레이션
- 81.7 데이터 접근 계층 설계 — ADO.NET / Dapper / EF Core 선택 기준
- 81.8 Blazor / MAUI / WPF / WinUI 3 개요와 선택 기준
- 81.9 배포 — 프레임워크 종속 vs 자체 포함, 단일 파일, 트리밍, Native AOT
- 81.10 분산 시스템 관점 — CQRS, 이벤트 소싱, 서버리스, 컨테이너

### 82장. 사고 실험 — 하나의 기능을 다섯 번 고쳐 쓰기
- 82.1 요구사항 정의와 기준선(baseline) 측정
- 82.2 1차: 정확하게 동작하는 코드
- 82.3 2차: 알고리즘과 자료구조 교체
- 82.4 3차: 할당 제거
- 82.5 4차: `Span`과 풀링 적용
- 82.6 5차: 벡터화
- 82.7 각 단계의 코드 복잡도 vs 성능 이득 그래프
- 82.8 어디서 멈춰야 하는가

---

# Part XVII. 마스터로 가는 마지막 단계 ⚫

### 83장. 런타임 소스 읽기
- 83.1 `dotnet/runtime` 저장소 구조 훑기
- 83.2 `gc.cpp`를 읽는 법 — 어디서부터 들어갈 것인가
- 83.3 코어 라이브러리(`System.Private.CoreLib`)의 C# 구현 읽기
- 83.4 Roslyn 컴파일러 소스로 문법 동작 확인하기
- 83.5 런타임 이슈·PR·설계 문서로 최신 동향 따라가기
- 83.6 직접 만든 실험 코드로 런타임 동작 검증하기

### 84장. 자기 검증 체크리스트
- 84.1 문법 마스터 체크리스트
- 84.2 BCL 폭(breadth) 체크리스트
- 84.3 런타임 내부 체크리스트
- 84.4 메모리·GC 체크리스트
- 84.5 동시성 체크리스트
- 84.6 성능 체크리스트
- 84.7 설계·API 체크리스트
- 84.8 "왜?"에 답하기 — 심층 질문 100선

---

# 부록

### 부록 A. C# ↔ IL ↔ 어셈블리 대응 치트시트
### 부록 B. 메모리 관리 규칙 26개 요약
### 부록 C. 진단 명령 레퍼런스 — SOS, dotnet-*, PerfView, WinDbg
### 부록 D. 성능 상수 표 — 연산별 대략 비용, 캐시 지연 시간, 할당 비용
### 부록 E. 형식 문자열 레퍼런스 — 숫자, 날짜/시간, 열거형
### 부록 F. 정규식 언어 레퍼런스
### 부록 G. LINQ 연산자 요약표
### 부록 H. C# 버전별 기능 색인
### 부록 I. 원천 도서 매핑 — 각 Part가 어느 책의 어느 부분에 대응하는가
### 부록 J. 추가 학습 자료 — 저장소, 블로그, 컨퍼런스

---

## 부록 I 미리보기 — 원천 매핑

| Part | 주 원천 | 보조 원천 |
|---|---|---|
| I. 지형도 | Nutshell ch.1, 5 | C# 12 and .NET 8 ch.1, 7 |
| II. 기본 문법 | Nutshell ch.2 | Pro C# 10 ch.3–4 |
| III. 타입 만들기 | Nutshell ch.3 | Pro C# 10 ch.5–8, CLR via C# ch.4–13, More Effective C# ch.1 |
| IV. 제네릭·컬렉션 | Nutshell ch.3(제네릭), 7 | Pro C# 10 ch.10, CLR via C# ch.12, Effective C# ch.3 |
| V. 델리게이트·LINQ | Nutshell ch.4, 8, 9 | Pro C# 10 ch.12–13, CLR via C# ch.17, Effective C# ch.4 |
| VI. 예외·수명 | Nutshell ch.4, 12 | Pro C# 10 ch.7, 9, CLR via C# ch.20, Effective C# ch.5 |
| VII. BCL I | Nutshell ch.6, 25 | C# 12 and .NET 8 ch.8, CLR via C# ch.14 |
| VIII. BCL II | Nutshell ch.10, 11, 15, 16, 20 | C# 12 and .NET 8 ch.9, High-Perf ch.8–9 |
| IX. 동시성 | Nutshell ch.14, 21, 22 | CLR via C# ch.26–30, C# in Depth ch.5–7, More Effective C# ch.3–4 |
| X. CLR 내부 | CLR via C# ch.1–3, 22–25 | Nutshell ch.17, 18, 19, 24, Pro C# 10 ch.14, 16–18 |
| XI. 메모리·GC | Pro .NET Memory Management 전권 | Nutshell ch.12, CLR via C# ch.21, High-Perf ch.3–5 |
| XII. 고성능 | High-Performance Programming | Nutshell ch.23, Memory Mgmt ch.14, C# in Depth ch.13 |
| XIII. 진단 | Nutshell ch.13 | High-Perf ch.5, Memory Mgmt ch.3 |
| XIV. 언어 진화 | C# in Depth 전권 | Nutshell ch.4, C# 12 and .NET 8 |
| XV. 설계·관용구 | Effective C# + More Effective C# | Nutshell 전반 |
| XVI. 실전 | C# 12 and .NET 8 ch.10–15 | Pro C# 10 ch.19–34, High-Perf ch.9–13 |

---

## 분량 추정

| 권 | 범위 | 예상 |
|---|---|---|
| 1권 — 언어 | Part 0–VI (1–34장) | 약 700p |
| 2권 — 라이브러리와 동시성 | Part VII–IX (35–51장) | 약 650p |
| 3권 — 내부·메모리·성능 | Part X–XVII (52–84장) + 부록 | 약 900p |

**총 84장 / 약 2,250페이지**

집필 우선순위 제안: **3권 → 1권 → 2권**. 3권(내부·메모리·성능)이 이 책의 차별점이고 원천 자료 밀도도 가장 높다. 2권은 상당 부분이 레퍼런스 성격이라 마지막에 채워도 전체 구조가 흔들리지 않는다.
