---
title: "부록 I. 원천 도서 매핑 — 각 Part가 어느 책의 어느 부분에 대응하는가"
---

# 부록 I. 원천 도서 매핑 — 각 Part가 어느 책의 어느 부분에 대응하는가

> **이 부록의 위치** — 이 책은 여덟 권의 영문 원서를 읽고 재구성한 결과물이다. 이 부록은 그 재구성의 **설계도를 공개**한다. 어느 장이 어느 책의 어느 장에서 왔는지, 그리고 반대로 원서 한 장을 읽었다면 이 책의 어디를 보면 되는지를 표로 정리한다.
>
> **선수 지식** — 1장(가이드북 사용법). 그 외에는 없다. 이 부록은 책을 읽기 전에 봐도 되고, 다 읽고 나서 다음 책을 고를 때 봐도 된다.
>
> **이 부록에서 다루지 않는 것** — 원서의 **내용 요약**은 하지 않는다. 이 부록은 지도이지 요약본이 아니다. 원서 이후에 읽을 1차 자료(런타임 소스, 언어 설계 저장소, 도구)는 부록 J가, 런타임 소스를 실제로 읽는 절차는 83장이 담당한다.

---

## I.1 이 책이 선 자리

### 왜 여덟 권인가

C#과 .NET에는 좋은 책이 많다. 문제는 **어느 한 권도 전체를 덮지 못한다**는 것이다.

레퍼런스로서 가장 넓은 책은 런타임 내부를 얕게 지나가고, 런타임 내부를 가장 깊게 파는 책은 언어의 최신 문법을 다루지 않으며, 메모리를 끝까지 파는 책은 LINQ를 한 줄도 설명하지 않는다. 설계 관용구를 다루는 책은 IL을 보여주지 않고, 성능을 다루는 책은 언어의 기초를 전제한다. 결과적으로 한 명의 독자가 "C#을 안다"고 말할 수 있는 상태에 도달하려면 최소 대여섯 권을 순서대로 읽어야 하는데, 그 순서를 알려주는 책은 없다.

이 책은 그 순서를 하나의 서술로 합친 결과다. 여덟 권을 **주제 축으로 다시 잘라** 84장에 재배열했다. 같은 주제가 여러 책에 흩어져 있으면 그중 가장 깊은 서술을 뼈대로 삼고 나머지를 보강으로 붙였다. 예를 들어 **박싱**은 Nutshell이 문법을, CLR via C#이 스택·힙 레이아웃을, Effective C#이 회피 관용구를, 메모리 관리서가 할당 비용을 각각 말한다. 이 책은 그 넷을 15장 한 곳에 모았다.

### 여덟 권에서 무엇을 가져왔는가

**C# 12 in a Nutshell (Joseph Albahari)** — 이 책의 **골격**이다. 언어 명세에 가장 가까운 서술 밀도를 가진 레퍼런스이고, C# 12까지의 문법을 예외 없이 덮는다. 1권의 Part II~VI(6~34장)와 2권의 대부분은 이 책의 장 구조를 뼈대로 삼았다. 다만 Nutshell은 의도적으로 "무엇을 하는가"에서 멈춘다. 컴파일러가 무엇을 생성하는지, 런타임이 그것을 어떻게 실행하는지는 다른 책들이 채웠다.

**Pro C# 10 with .NET 6 (Andrew Troelsen, Phil Japikse)** — **CIL과 도구 사용**을 가져왔다. 이 책은 다른 교과서들이 생략하는 것을 한다. `ildasm`을 열어 실제 IL을 보여주고, 동적 어셈블리를 `Reflection.Emit`으로 직접 짜 보인다. 56장(CIL 읽기)의 주 원천이며, 부록 A의 대응표도 여기서 출발했다. 후반부의 ADO.NET·EF Core·WPF·ASP.NET Core 실습 장들은 이 책의 범위 밖이지만 81장(애플리케이션 유형별 지도)의 좌표로 썼다.

**CLR via C# 4th (Jeffrey Richter)** — **런타임의 사고방식**을 가져왔다. 판이 오래되어 .NET Framework 시절의 서술(AppDomain, NGen, WinRT)이 섞여 있으나, 타입 시스템·메서드 테이블·박싱·제네릭 인스턴스화·예외 상태 관리를 "CLR의 관점에서" 설명하는 밀도는 아직도 대체재가 없다. 3권 Part X(52~60장)의 사고 틀이 여기서 왔다. 대신 **이 책은 판 차이를 그냥 넘기지 않았다** — .NET Framework 전용 동작은 전부 그렇다고 표시했고, .NET Core 이후 달라진 부분은 최신 런타임 기준으로 다시 썼다.

**Pro .NET Memory Management 2nd (Konrad Kokosa, Christophe Nasarre, Kevin Gosse)** — 3권 Part XI 전체의 **원본**이다. GC의 표시(mark)·계획(plan)·쓸기(sweep)·압축(compact) 각 단계를 장 단위로 해부하는 책은 사실상 이것뿐이다. 61~66장은 이 책의 15개 장을 6개 장으로 압축한 것이고, 부록 B의 규칙 26개도 이 책의 규칙 체계에서 왔다. 측정 방법론(3장)은 66장과 67장으로, 고급 기법(14장)은 68·70장으로 나뉘어 들어갔다.

**High-Performance Programming in C# and .NET** — **측정과 시스템 레벨 성능**을 가져왔다. 프로파일링·트레이싱 실무(5장), 파일·네트워크 I/O 성능(8·9장), 벤치마크로 프레임워크를 비교하는 태도(11장)가 67장과 72장의 뼈대다. 이 책의 장점은 "빠르다"는 주장을 항상 측정으로 되돌리는 태도이고, 이 책이 67장의 제목(「측정 없이 최적화 없다」)으로 받은 것이 그 태도다.

**C# 12 and .NET 8 (Mark J. Price)** — **최신성과 도구 체인**을 가져왔다. 여덟 권 중 가장 최신 판이고, 배포·패키징(7장), 테스트(4장), 로깅과 계측(4장), 그리고 웹·Blazor를 포함한 애플리케이션 유형(12~15장)을 다룬다. 75장(관측 가능성)과 80장(테스트 가능한 코드), 81장(애플리케이션 유형별 지도)의 주 원천이다. 다른 책들이 "언어와 런타임"에서 멈출 때 이 책만 "그래서 무엇을 만드는가"까지 간다.

**C# in Depth 4th (Jon Skeet)** — **언어의 진화사**를 가져왔다. 이 책은 C# 2부터 8까지를 **버전 단위로** 서술한다. 기능 목록이 아니라 "왜 그 시점에 그 기능이 필요했고, 그때 컴파일러와 런타임이 무엇을 바꿔야 했는가"의 서술이다. 76장(C# 버전별 기능 지도) 전체와 부록 H의 관점이 여기서 왔고, 반복자·async의 상태 기계 서술(5·6장)은 28장과 47장에 녹였다.

**Effective C# 3rd / More Effective C# 2nd (Bill Wagner)** — **판단 기준**을 가져왔다. 둘 다 항목(Item) 단위 조언집이고, 문법을 가르치지 않는 대신 "둘 다 되는데 어느 쪽을 고를 것인가"에 답한다. 78장(API 설계)과 79장(코드 관용구)이 이 두 책의 재구성이며, 값 타입 불변성·동등성·이벤트·비동기 조합에 관한 판단은 각 해당 장에 항목 단위로 흩어 넣었다.

### 이 책이 원서에 없는 것을 더한 지점

원천 매핑을 공개하는 이상, **원천에 없는 부분**도 밝히는 것이 정직하다. 다음은 원서 대응이 약하거나 없어 저자가 보강한 영역이다.

| 영역 | 상황 | 해당 장 |
|---|---|---|
| C# 13 이후 문법 | 원서 대부분이 C# 10~12에서 멈춘다 | 76장, 부록 H (`※` 표시) |
| .NET 8~9 런타임 변화 | DATAS, 동적 PGO, 예외 처리 재작성 등 | 55장, 65장, 부록 H |
| 벡터화 실무 | High-Perf가 개괄만 다룬다 | 71장 (상당 부분 보강) |
| 관측 가능성 | OpenTelemetry 계열은 어느 책도 깊게 다루지 않는다 | 75장 (상당 부분 보강) |
| 사고 실험·자기 검증 | 원서에 대응 없음 | 82장, 83장, 84장 (자체 구성) |

`※` 표시가 붙은 서술은 전부 이 범주다. 원서에 있는 것처럼 인용하지 않았다.

> **⚠️ 매핑은 번역도 인용도 아니다**
>
> "이 장의 주 원천은 X"라는 말은 **그 장이 X의 번역이라는 뜻이 아니다.** 주제 선정과 서술 순서를 그 책에서 가져왔다는 뜻이며, 설명·예제·IL 출력·성능 서술은 이 책이 다시 쓴 것이다. 원서의 문장을 인용한 경우는 본문에서 인용부호와 함께 "원천 도서의 표현" 같은 표지를 붙여 구분했다. 원서의 정확한 문면이 필요하면 이 부록의 표로 위치를 찾아 **원서를 직접 열어야 한다.**

> **⚠️ 원천이 있다고 사실이 보증되지는 않는다**
>
> 이 부록의 매핑은 **어디서 가져왔는가**를 밝히는 것이지, **그 내용이 지금도 옳다**는 보증이 아니다. CLR via C# 4판은 .NET Framework 4.5 시절 책이고, Effective C#은 C# 6~7, C# in Depth는 C# 8, Pro C#은 .NET 6 기준이다. 런타임 동작에 관한 주장은 원천이 무엇이든 **자기 런타임에서 다시 확인해야 한다**. 그 방법이 부록 J와 84장이다.

> **📌 판 번호를 항상 확인하라**
>
> 같은 제목의 책도 판이 다르면 다른 책이다. 아래 I.2의 표는 이 책이 실제로 참조한 판을 명시한다. 예를 들어 Pro .NET Memory Management는 **2판**이 .NET 5 이후를 반영했고, 1판과는 GC 서술의 상당 부분이 다르다.

---

## I.2 원서 여덟 권 프로필

이 부록의 나머지 표에서 쓰는 **약칭**을 먼저 정한다.

| 약칭 | 원서 | 판·시점 | 장 수 |
|---|---|---|---|
| **Nutshell** | C# 12 in a Nutshell: The Definitive Reference (Joseph Albahari) | C# 12 / .NET 8 · 2023 | 25 |
| **Pro C#** | Pro C# 10 with .NET 6 (Andrew Troelsen, Phil Japikse) | C# 10 / .NET 6 · 11판 | 34 |
| **CLR** | CLR via C# (Jeffrey Richter) | 4판 · .NET Framework 4.5 시대 | 30 |
| **Memory** | Pro .NET Memory Management (Konrad Kokosa, Christophe Nasarre, Kevin Gosse) | 2판 · 2024 | 15 |
| **High-Perf** | High-Performance Programming in C# and .NET | C# 10 / .NET 6 · 2022 | 16 |
| **Price** | C# 12 and .NET 8: Modern Cross-Platform Development Fundamentals (Mark J. Price) | C# 12 / .NET 8 · 2023 | 15 |
| **In Depth** | C# in Depth (Jon Skeet) | 4판 · C# 8까지 | 15 |
| **Effective** | Effective C#: 50 Specific Ways to Improve Your C# (Bill Wagner) | 3판 · C# 6~7 | 5부 50항목 |
| **More Effective** | More Effective C#: 50 Specific Ways… (Bill Wagner) | 2판 · C# 7 | 6부 50항목 |

여덟 권이라고 했지만 표는 아홉 줄이다. Effective와 More Effective는 같은 저자의 한 시리즈이고 이 책에서도 한 덩어리(설계·관용구)로 썼기에 한 권으로 센다.

### 성격과 역할

| 약칭 | 저자의 태도 | 주된 강점 | 이 책에서의 역할 | 원서를 직접 읽어야 할 이유 |
|---|---|---|---|---|
| **Nutshell** | 명세에 가까운 정밀 레퍼런스 | 문법 전수 · BCL 폭 · 예제 밀도 | 1·2권의 골격 | 이 책이 지면상 줄인 API 세부와 오버로드 전수가 필요할 때. 책상 옆에 두고 찾아보는 용도로는 이쪽이 낫다 |
| **Pro C#** | 튜토리얼 + 도구 실습 | CIL 실물 · 리플렉션·동적 어셈블리 · 애플리케이션 프레임워크 | 56장 주 원천, 부록 A의 출발점 | EF Core·WPF·ASP.NET Core를 **손으로** 만들어 보려면. 이 책은 그 영역을 지도로만 다룬다(81장) |
| **CLR** | 런타임 관점의 원리 서술 | 타입 시스템 · 박싱 · 제네릭 · 예외 · 스레드 동기화 | 3권 Part X의 사고 틀 | "왜 이렇게 설계됐는가"의 서술이 가장 두껍다. 단 .NET Framework 시대 서술을 걸러 읽을 수 있어야 한다 |
| **Memory** | 연구서에 가까운 해부 | GC 4단계 · 힙 분할 · 할당 경로 · 측정 방법론 | 3권 Part XI의 원본 | GC 소스를 읽기 전 단계로 이만한 책이 없다. 이 책 61~66장은 그 15개 장의 압축이다 |
| **High-Perf** | 측정 우선의 실무서 | 프로파일링 · I/O · 네트워크 · 프레임워크 비교 벤치마크 | 67장·72장의 뼈대 | 벤치마크 설계와 결과 해석의 실례가 많다. 성능 작업을 팀에 설득해야 할 때 쓸 재료가 여기 있다 |
| **Price** | 최신판 종합 입문~중급 | 배포 · 테스트 · 로깅 · 웹/Blazor | 75·80·81장의 주 원천 | 가장 최신이고 애플리케이션 유형별 실습이 붙어 있다. .NET을 **직업으로** 시작하는 사람의 첫 책으로 적합하다 |
| **In Depth** | 언어사(史) 서술 | 버전별 도입 배경 · 상태 기계 해부 · NRT | 76장 전체, 부록 H의 관점 | 새 문법을 볼 때 "왜 이 모양인가"를 판단하는 감각이 붙는다. 언어 설계 논의를 따라가려면 선행 독서로 가장 유효하다 |
| **Effective / More Effective** | 항목 단위 조언집 | 관용구 · API 설계 · 동등성 · 비동기 조합 | 78·79장의 재구성 | 항목마다 반례와 근거가 붙어 있다. 코드 리뷰 기준을 팀에서 합의할 때 인용하기 좋은 형태다 |

> **💡 여덟 권을 다 살 필요는 없다**
>
> 이 책을 읽은 뒤 실제로 추가 구매를 권할 만한 것은 보통 두 권이다 — **레퍼런스로 곁에 둘 한 권**(Nutshell)과 **자기 방향에 맞는 깊이 한 권**(내부는 Memory, 성능은 High-Perf, 언어사는 In Depth, 설계는 Effective 시리즈). 나머지는 필요할 때 도서관이나 전자책 구독으로 해당 장만 읽어도 충분하다. 선택 기준은 I.6절에 있다.

---

## I.3 Part별 원천 매핑

각 Part의 **주 원천**은 그 Part의 골격을 제공한 책이고, **보조 원천**은 개별 장의 특정 절을 채운 책이다. 아래 표는 목차 단계의 계획을 84개 장 매핑(I.4절)과 대조해 정리한 결과다.

| Part | 범위 | 주 원천 | 보조 원천 |
|---|---|---|---|
| **0.** 이 책을 읽는 법 | 1장 | 자체 구성 | — |
| **I.** C#과 .NET의 지형도 | 2~5장 | Nutshell 1, 5, CLR 1 | Pro C# 1~2, 16, Price 1, 7 |
| **II.** 언어의 기본 문법 | 6~12장 | Nutshell 2, 4(전처리기·XML 문서) | Pro C# 3~4, 16, CLR 9, 14, 16, Price 2~3 |
| **III.** 타입 만들기 — 객체지향 | 13~22장 | Nutshell 3, 4(레코드·특성·널 안정성·연산자) | Pro C# 5~6, 8, 11, CLR 4~10, 13, 15, 18, 19, Memory 4, More Effective 1부, Price 5~6 |
| **IV.** 제네릭과 컬렉션 | 23~25장 | Nutshell 3(제네릭), 6(동등성), 7 | Pro C# 10, CLR 4, 12, Effective 3부, More Effective 1부, High-Perf 6, Price 8 |
| **V.** 델리게이트·이벤트·LINQ | 26~31장 | Nutshell 4(델리게이트·이벤트·반복자), 8, 9 | Pro C# 12~13, CLR 11, 17, In Depth 2~3장, Effective 4부, More Effective, High-Perf 7, Price 10~11 |
| **VI.** 예외·리소스·객체 수명 | 32~34장 | Nutshell 4(예외), 12 | Pro C# 7, 9, CLR 20, 21, Memory 12, Effective 5부 |
| **VII.** BCL I — 텍스트·시간·숫자 | 35~39장 | Nutshell 6, 25 | CLR 14, Memory 4, Price 8 |
| **VIII.** BCL II — 데이터와 I/O | 40~44장 | Nutshell 10, 11, 15, 16, 20 | Pro C# 19, CLR 24, High-Perf 8~9, Price 9 |
| **IX.** 동시성과 비동기 | 45~51장 | Nutshell 14, 21, 22 | Pro C# 15, CLR 26~30, In Depth 5~6장, High-Perf 14~16, 12~13, More Effective 3~4부 |
| **X.** CLR 내부 구조 | 52~60장 | CLR 1~5, 23, 25, Nutshell 17~19, 24, Pro C# 18, Memory 4 | Pro C# 14, 16~17, High-Perf 1~2, Price 7 |
| **XI.** 메모리와 가비지 컬렉션 | 61~66장 | Memory 1~11, 15 | Nutshell 12, CLR 21, High-Perf 3~5 |
| **XII.** 고성능 C# | 67~72장 | High-Perf 1, 5, 8~9, 11~13, Memory 6, 14, Nutshell 23 | Memory 13, Price 7 |
| **XIII.** 진단과 디버깅 | 73~75장 | Nutshell 13, Price 4 | High-Perf 5, Memory 3 |
| **XIV.** 언어의 진화 | 76~77장 | In Depth 전권, Nutshell 4(튜플·패턴) | Pro C# 4, Price 2~6 |
| **XV.** 설계와 관용구 | 78~80장 | Effective + More Effective, Price 4(단위 테스트) | High-Perf 5 |
| **XVI.** 실전 적용 | 81~82장 | Price 12~15, High-Perf 전반 | Pro C# 20~23, 30~34, High-Perf 10~13 |
| **XVII.** 마스터로 가는 마지막 단계 | 83~84장 | Memory 전반 + 전권 종합 | 자체 구성 |

### 이 표에서 읽어야 할 세 가지

**첫째, Nutshell은 Part XI 이후 주 원천 자리에서 물러나기 시작한다.** 1권과 2권에서는 거의 모든 장의 주 원천이었다가 3권 후반에서 등장 빈도가 급감한다. 이것이 이 책이 존재하는 이유를 그대로 보여준다 — 언어 레퍼런스는 런타임 내부에서 멈춘다.

**둘째, Part X와 XI만 원천이 완전히 갈린다.** Part X(CLR 내부)는 CLR via C#이, Part XI(메모리·GC)는 Pro .NET Memory Management가 사실상 단독으로 떠받친다. 다른 Part는 3~5권이 섞이는데 이 둘만 대체재가 없다. 이 두 영역을 더 파고 싶다면 선택지가 좁다는 뜻이기도 하다.

> **💡 이 표를 쓰는 순서**
>
> 특정 주제를 더 파고 싶을 때는 I.3절이 아니라 **I.4절부터** 보라. Part 단위는 너무 굵어서 "Part XI을 더 보고 싶다"는 결론밖에 나오지 않는다. 장 단위로 내려가면 "64장의 주 원천인 Memory 7~10장을 읽는다"처럼 **다음 행동이 바로 정해진다.** I.3절은 전체 구조를 한 번 훑을 때만 쓴다.

**셋째, Part XVII은 원천이 없다.** 83장(런타임 소스 읽기)과 84장(자기 검증 체크리스트)은 어느 책에도 대응이 없다. 원서를 다 읽은 다음에 무엇을 하느냐는 질문에 책들이 답하지 않기 때문이다. 부록 J가 그 답의 자료 편이다.

> **⚠️ Part 번호와 원서 장 번호를 혼동하지 마라**
>
> 이 부록의 표에서 "Nutshell 3"은 **Nutshell의 3장**(Creating Types in C#)이지 이 책의 3장이 아니다. 이 책의 장을 가리킬 때는 항상 `NN장` 형태로 쓴다. I.4절 표에서도 첫 열만 이 책의 장 번호다.

---

## I.4 장별 원천 매핑 — 84개 장 전부

`주 원천`은 그 장의 뼈대를 제공한 텍스트, `보조 원천`은 특정 절이나 관점을 채운 텍스트다. 괄호 안은 원서 안에서의 절 범위나 항목 번호다.

> **⚠️ 원천이 하나라고 서술이 하나인 것은 아니다**
>
> 표의 `주 원천` 열이 한 칸이어도 그 장이 그 원서 한 장의 재서술인 경우는 드물다. 대부분의 장은 주 원천에서 **뼈대와 주제 목록**을 가져오고, 컴파일 결과와 런타임 동작과 성능 서술을 보조 원천과 저자 검증으로 채웠다. 그래서 원서의 해당 장을 읽어도 이 책의 해당 장과 절 구성이 일치하지 않는다. 대응은 **주제 단위**이지 절 단위가 아니다.

### 제1권 — 언어 (1~34장)

| 장 | 제목 | 주 원천 | 보조 원천 |
|---|---|---|---|
| 1 | 가이드북 사용법 | 자체 구성 | — |
| 2 | C#이라는 언어, .NET이라는 플랫폼 | Nutshell 1 | Price 1, CLR 1, Pro C# 1 |
| 3 | 첫 프로그램이 실행되기까지 | CLR 1 | Pro C# 2, Price 1, Nutshell 1 |
| 4 | 프로젝트, 대상 프레임워크, 배포 형태 | Nutshell 5 | Price 7, Pro C# 16, Pro C# 2 |
| 5 | BCL 전체 지도 | Nutshell 5 | — |
| 6 | 구문과 타입 기초 | Nutshell 2 | Pro C# 3, Price 2 |
| 7 | 숫자와 불리언 | Nutshell 2 | Pro C# 3, Price 2, Price 3 |
| 8 | 문자열과 문자 | Nutshell 2 | Pro C# 3, CLR 14 |
| 9 | 배열 | Nutshell 2 | Pro C# 4, CLR 16 |
| 10 | 변수, 매개변수, 식 | Nutshell 2 | Pro C# 4, CLR 9 |
| 11 | 문과 제어 흐름 | Nutshell 2 | Pro C# 3, Price 3 |
| 12 | 네임스페이스와 전처리기 | Nutshell 2, Nutshell 4(전처리기·XML 문서 주석) | Pro C# 16 |
| 13 | 클래스와 캡슐화 | Nutshell 3 | Pro C# 5, CLR 6~8, 10, Price 5 |
| 14 | 상속과 다형성 | Nutshell 3(상속) | Pro C# 6, CLR 6, Price 6 |
| 15 | `object` 타입과 박싱 | Nutshell 3(object 타입) | CLR 4, CLR 5 |
| 16 | 구조체와 값 타입 | Nutshell 3(구조체) | CLR 5, More Effective 1부, Memory 4 |
| 17 | 접근 제한자와 중첩 타입 | Nutshell 3(접근 제한자·중첩 타입) | Pro C# 5, CLR 6 |
| 18 | 인터페이스 | Nutshell 3(인터페이스) | Pro C# 8, CLR 13, Price 6 |
| 19 | 레코드와 불변 타입 | Nutshell 4(레코드) | Pro C# 5, Price 5, More Effective |
| 20 | 열거형과 특성 | Nutshell 3(열거형), Nutshell 4(특성·호출자 정보) | CLR 15, CLR 18 |
| 21 | 널 안정성 | Nutshell 4(널 가능 값/참조 타입) | CLR 19, In Depth, Price 6 |
| 22 | 연산자 오버로딩과 정적 다형성 | Nutshell 4(연산자 오버로딩·정적 다형성) | Pro C# 11, CLR 8 |
| 23 | 제네릭 | Nutshell 3(제네릭) | Pro C# 10, CLR 12, Effective 3부 |
| 24 | 컬렉션 | Nutshell 7 | Pro C# 10, High-Perf 6, Price 8 |
| 25 | 동등성과 순서 비교 | Nutshell 6(동등성·순서 비교) | More Effective 항목 9·10, CLR 4 |
| 26 | 델리게이트와 람다 | Nutshell 4(델리게이트·람다) | Pro C# 12, CLR 17 |
| 27 | 이벤트 | Nutshell 4(이벤트) | Pro C# 12, CLR 11, More Effective |
| 28 | 열거와 반복자 | Nutshell 4(열거와 반복자) | In Depth 2장, Effective 항목 29·33 |
| 29 | LINQ 쿼리 | Nutshell 8 | Pro C# 13, In Depth 3장 |
| 30 | LINQ 연산자 레퍼런스 | Nutshell 9 | Price 11, High-Perf 7 |
| 31 | 식 트리와 해석되는 쿼리 | Nutshell 8(해석되는 쿼리 이후) | Pro C# 13, Price 10 |
| 32 | 예외 처리 | Nutshell 4(try 문과 예외) | Pro C# 7, CLR 20, Effective 5부 |
| 33 | 결정적 정리와 IDisposable | Nutshell 12(IDisposable 절) | Pro C# 9, Effective 항목 17, CLR 21 |
| 34 | 객체 수명과 파이널라이제이션 | Nutshell 12(파이널라이저~약한 참조) | Pro C# 9, Memory 12, CLR 21 |

### 제2권 — 라이브러리와 동시성 (35~51장)

| 장 | 제목 | 주 원천 | 보조 원천 |
|---|---|---|---|
| 35 | 문자열과 텍스트 처리 | Nutshell 6(문자열과 텍스트 처리) | CLR 14, Price 8, Memory 4 |
| 36 | 정규식 | Nutshell 25 | Price 8 |
| 37 | 날짜와 시간 | Nutshell 6(날짜와 시간·표준 시간대) | Price 8 |
| 38 | 포매팅과 파싱, 국제화 | Nutshell 6(포매팅과 파싱~전역화) | Price 8 |
| 39 | 숫자와 유틸리티 타입 | Nutshell 6(숫자 다루기~유틸리티 클래스) | Price 8 |
| 40 | 스트림과 파일 I/O | Nutshell 15 | Pro C# 19, Price 9, High-Perf 8 |
| 41 | 직렬화와 JSON | Nutshell 11(JSON 다루기) | Price 9, Pro C# 19, CLR 24 |
| 42 | XML | Nutshell 10, Nutshell 11 | — |
| 43 | 네트워킹 | Nutshell 16 | High-Perf 9 |
| 44 | 암호화 | Nutshell 20 | — |
| 45 | 스레드의 기초 | Nutshell 14(스레딩) | CLR 26, Pro C# 15, High-Perf 14 |
| 46 | 스레드 풀과 태스크 | Nutshell 14(태스크) | CLR 27, High-Perf 15 |
| 47 | async / await 완전 해부 | Nutshell 14(비동기의 원리 이후) | In Depth 5~6장, CLR 28, High-Perf 16 |
| 48 | 동기화와 잠금 | Nutshell 21(동기화~비배타적 잠금) | CLR 29, CLR 30 |
| 49 | 신호와 스레드 로컬 상태 | Nutshell 21(신호~타이머) | CLR 30 |
| 50 | 병렬 프로그래밍 | Nutshell 22 | Pro C# 15, High-Perf 15, More Effective 4부 |
| 51 | 비동기 아키텍처 패턴 | Nutshell 22(BlockingCollection) | More Effective 3부, High-Perf 12~13, Nutshell 14(비동기 패턴) |

### 제3권 — 내부, 메모리, 성능 (52~84장)

| 장 | 제목 | 주 원천 | 보조 원천 |
|---|---|---|---|
| 52 | 어셈블리 | Nutshell 17 | CLR 2, 3, 23, Pro C# 16, Memory 4 |
| 53 | 리소스와 지역화 | Nutshell 17(리소스~문화권) | CLR 2, Pro C# 16, Price 7 |
| 54 | 타입 시스템의 런타임 표현 | CLR 4, CLR 5, Memory 4 | CLR 6, High-Perf 3 |
| 55 | JIT 컴파일과 코드 생성 | CLR 1 | High-Perf 1, Price 7, Memory 4, Pro C# 18 |
| 56 | CIL 읽기 | Pro C# 18 | CLR 1, Nutshell 18(IL 파싱) |
| 57 | 리플렉션과 메타데이터 | Nutshell 18 | Pro C# 17, CLR 23, CLR 18 |
| 58 | 동적 코드 생성 | Nutshell 18(동적 코드 생성 이후) | Pro C# 18 |
| 59 | 동적 프로그래밍과 DLR | Nutshell 19, Nutshell 4(동적 바인딩) | Pro C# 17, CLR 5 |
| 60 | 네이티브 및 COM 상호운용 | Nutshell 24 | High-Perf 2, Nutshell 4(안전하지 않은 코드), CLR 25 |
| 61 | 메모리의 기초 | Memory 1, Memory 2 | High-Perf 3 |
| 62 | .NET 힙의 구조 | Memory 5 | Memory 4(프로세스 메모리 영역), CLR 21 |
| 63 | 할당 | Memory 6 | High-Perf 3 |
| 64 | GC 알고리즘 완전 해부 | Memory 7~10 | CLR 21 |
| 65 | GC 모드와 튜닝 | Memory 11, Memory 15 | Nutshell 12(GC 동작 원리), High-Perf 4 |
| 66 | 메모리 문제 진단 | Memory 3 | Memory 8, High-Perf 5, Nutshell 12(관리 메모리 누수) |
| 67 | 측정 없이 최적화 없다 | High-Perf 5 | Memory 3, High-Perf 11 |
| 68 | `Span<T>`와 `Memory<T>` | Nutshell 23, Memory 14 | Memory 13 |
| 69 | 할당 줄이기 | Memory 6(할당 회피) | Memory 14, High-Perf 3, Nutshell 23 |
| 70 | 데이터 지향 설계 | Memory 14(데이터 지향 설계) | Memory 2 |
| 71 | 벡터화와 하드웨어 가속 | High-Perf 1 | Memory 14 (※ 상당 부분 보강) |
| 72 | 시스템 레벨 성능 | High-Perf 8, 9, 11, 12, 13 | Memory 14(파이프라인), Price 7 |
| 73 | 진단 API | Nutshell 13 | High-Perf 5 |
| 74 | 디버깅 기법 | Nutshell 13(디버거 통합) | High-Perf 5, Price 4, Memory 3 |
| 75 | 관측 가능성 | Price 4(로깅) | High-Perf 5 (※ 상당 부분 보강) |
| 76 | C# 버전별 기능 지도 | In Depth 전권 | Nutshell 4, Price 2~6 |
| 77 | 튜플·분해·패턴 매칭 | Nutshell 4(튜플·패턴) | In Depth 11~12장, Pro C# 4 |
| 78 | API 설계 | More Effective 2부(API 설계) | Effective |
| 79 | 코드 관용구 | Effective 1~2부 | More Effective 1부 |
| 80 | 테스트 가능한 코드 | Price 4(단위 테스트) | High-Perf 5 (※ 보강) |
| 81 | 애플리케이션 유형별 지도 | Price 12~15 | Pro C# 20~23, 30~34, High-Perf 10~13 |
| 82 | 사고 실험 | High-Perf 전반 | ※ 자체 구성 |
| 83 | 런타임 소스 읽기 | Memory 전반 | ※ 자체 구성 |
| 84 | 자기 검증 체크리스트 | 전권 종합 | ※ 자체 구성 |

> **📌 부록의 원천**
>
> 부록 A~H는 본문 장에서 파생된 것이라 별도 원천 표를 두지 않았다. 대응 관계는 이렇다 — 부록 A는 56장·55장(Pro C# 18, CLR 1), 부록 B는 61~66장(Memory 전권), 부록 C는 66·73·74장(Memory 3, Nutshell 13, High-Perf 5), 부록 D는 67장과 61~63장(High-Perf 5, Memory 1~6), 부록 E·F·G는 35~39·36·30장(Nutshell 6·25·9), 부록 H는 76장(In Depth)이다.

---

## I.5 역방향 색인 — 원서 기준으로 찾기

"Nutshell 7장을 읽었는데 이 책 어디를 보면 되나" 같은 질문에 답하는 표다. 별표(`*`)가 붙은 장은 그 원서 장을 **주 원천**으로 삼은 장이고, 나머지는 보조로 참조한 장이다.

> **📌 별표의 의미**
>
> 이 절의 표에서 `52*`는 "이 책 52장이 그 원서 장을 **주 원천**으로 썼다"는 뜻이고, `53`처럼 별표가 없으면 보조로 참조했다는 뜻이다. 원서 한 장을 읽고 이 책에서 대응 서술을 찾을 때는 **별표 붙은 장부터** 보면 된다.

### Nutshell (C# 12 in a Nutshell) 25개 장

| 원서 장 | 원제 | 이 책의 대응 장 |
|---|---|---|
| 1 | Introducing C# and .NET | 2*, 3 |
| 2 | C# Language Basics | 6*, 7*, 8*, 9*, 10*, 11*, 12* |
| 3 | Creating Types in C# | 13*, 14*, 15*, 16*, 17*, 18*, 20*, 23* |
| 4 | Advanced C# | 12*, 19*, 20*, 21*, 22*, 26*, 27*, 28*, 32*, 59*, 60, 76, 77* |
| 5 | .NET Overview | 4*, 5* |
| 6 | .NET Fundamentals | 25*, 35*, 37*, 38*, 39* |
| 7 | Collections | 24* |
| 8 | LINQ Queries | 29*, 31* |
| 9 | LINQ Operators | 30* |
| 10 | LINQ to XML | 42* |
| 11 | Other XML and JSON Technologies | 41*, 42* |
| 12 | Disposal and Garbage Collection | 33*, 34*, 65, 66 |
| 13 | Diagnostics | 73*, 74* |
| 14 | Concurrency and Asynchrony | 45*, 46*, 47*, 51 |
| 15 | Streams and I/O | 40* |
| 16 | Networking | 43* |
| 17 | Assemblies | 52*, 53* |
| 18 | Reflection and Metadata | 56, 57*, 58* |
| 19 | Dynamic Programming | 59* |
| 20 | Cryptography | 44* |
| 21 | Advanced Threading | 48*, 49* |
| 22 | Parallel Programming | 50*, 51* |
| 23 | Span\<T> and Memory\<T> | 68*, 69 |
| 24 | Native and COM Interoperability | 60* |
| 25 | Regular Expressions | 36* |

Nutshell 4장(Advanced C#)이 이 책의 13개 장으로 흩어진 것이 이 표의 핵심이다. 원서에서 150쪽 가까운 한 장이 레코드·널 안정성·델리게이트·이벤트·반복자·예외·패턴 매칭으로 쪼개졌다.

### CLR via C# 4판 30개 장

| 원서 장 | 원제 | 이 책의 대응 장 |
|---|---|---|
| 1 | The CLR's Execution Model | 2, 3*, 55*, 56 |
| 2 | Building, Packaging, Deploying, Administering | 52, 53 |
| 3 | Shared and Strongly Named Assemblies | 52 |
| 4 | Type Fundamentals | 15, 25, 54* |
| 5 | Primitive, Reference, and Value Types | 15, 16, 54*, 59 |
| 6 | Type and Member Basics | 13, 14, 17, 54 |
| 7 | Constants and Fields | 13 |
| 8 | Methods | 13, 22 |
| 9 | Parameters | 10 |
| 10 | Properties | 13 |
| 11 | Events | 27 |
| 12 | Generics | 23 |
| 13 | Interfaces | 18 |
| 14 | Chars, Strings, and Working with Text | 8, 35 |
| 15 | Enumerated Types and Bit Flags | 20 |
| 16 | Arrays | 9 |
| 17 | Delegates | 26 |
| 18 | Custom Attributes | 20, 57 |
| 19 | Nullable Value Types | 21 |
| 20 | Exceptions and State Management | 32 |
| 21 | The Managed Heap and Garbage Collection | 33, 34, 62, 64 |
| 22 | CLR Hosting and AppDomains | (대응 없음 — .NET Framework 전용. 52.9절이 ALC로 대체 서술) |
| 23 | Assembly Loading and Reflection | 52, 57 |
| 24 | Runtime Serialization | 41 |
| 25 | Interoperating with WinRT Components | 60 |
| 26 | Thread Basics | 45 |
| 27 | Compute-Bound Asynchronous Operations | 46 |
| 28 | I/O-Bound Asynchronous Operations | 47 |
| 29 | Primitive Thread Synchronization Constructs | 48 |
| 30 | Hybrid Thread Synchronization Constructs | 48, 49 |

> **⚠️ CLR via C# 22장은 의도적으로 버렸다**
>
> AppDomain은 .NET Core 이후 존재하지 않는다. `AppDomain` 타입 자체는 호환을 위해 남아 있지만 새 도메인을 만들 수 없고, 격리·언로드의 역할은 어셈블리 로드 컨텍스트(ALC)가 가져갔다. 이 책은 22장을 대응시키는 대신 52장에서 ALC를 처음부터 다시 썼다. 원서를 읽는다면 이 장은 **역사 자료로만** 읽어라.

### Pro .NET Memory Management 2판 15개 장

| 원서 장 | 원제 | 이 책의 대응 장 |
|---|---|---|
| 1 | Basic Concepts | 61* |
| 2 | Low-Level Memory Management | 61*, 70 |
| 3 | Memory Measurements | 66*, 67, 74 |
| 4 | .NET Fundamentals | 16, 35, 52, 54*, 55, 62 |
| 5 | Memory Partitioning | 62* |
| 6 | Memory Allocation | 63*, 69* |
| 7 | Garbage Collection – Introduction | 64* |
| 8 | Garbage Collection – Mark Phase | 64*, 66 |
| 9 | Garbage Collection – Plan Phase | 64* |
| 10 | Garbage Collection – Sweep and Compact | 64* |
| 11 | GC Flavors and Settings | 65* |
| 12 | Object Lifetime | 34 |
| 13 | Miscellaneous Topics | 68 |
| 14 | Advanced Techniques | 68*, 69, 70*, 71, 72 |
| 15 | Programmatical APIs | 65* |

원서 7~10장 네 개가 이 책 64장 하나에 압축돼 있다. **GC 알고리즘을 더 파려면 이 넷을 원서로 읽는 것이 가장 확실한 다음 단계다.**

83장(런타임 소스 읽기)은 특정 장이 아니라 **이 원서 전반**을 배경으로 삼으므로 위 표에 개별 행이 없다.

### High-Performance Programming in C# and .NET 16개 장

| 원서 장 | 원제 | 이 책의 대응 장 |
|---|---|---|
| 1 | Introducing C# 10.0 and .NET 6 | 55, 71* |
| 2 | Implementing C# Interoperability | 60 |
| 3 | Predefined Data Types and Memory Allocations | 54, 61, 63, 69 |
| 4 | Memory Management | 65 |
| 5 | Application Profiling and Tracing | 66, 67*, 73, 74, 75, 80 |
| 6 | .NET Collections | 24 |
| 7 | LINQ Performance | 30 |
| 8 | File and Stream I/O | 40, 72* |
| 9 | Enhancing the Performance of Networked Applications | 43, 72* |
| 10 | Setting Up Our Database Project | 81 |
| 11 | Benchmarking Relational Data Access Frameworks | 67, 72*, 81 |
| 12 | Responsive User Interfaces | 51, 72*, 81 |
| 13 | Distributed Systems | 51, 72*, 81 |
| 14 | Multi-Threaded Programming | 45 |
| 15 | Parallel Programming | 46, 50 |
| 16 | Asynchronous Programming | 47 |

82장(사고 실험)은 특정 장이 아니라 **이 원서 전반**을 배경으로 삼으므로 위 표에 개별 행이 없다.

### C# 12 and .NET 8 (Price) 15개 장

| 원서 장 | 원제 | 이 책의 대응 장 |
|---|---|---|
| 1 | Hello, C#! Welcome, .NET! | 2, 3 |
| 2 | Speaking C# | 6, 7, 76 |
| 3 | Controlling Flow, Converting Types, Handling Exceptions | 7, 11, 76 |
| 4 | Writing, Debugging, and Testing Functions | 74, 75*, 76, 80* |
| 5 | Building Your Own Types with OOP | 13, 19, 76 |
| 6 | Implementing Interfaces and Inheriting Classes | 14, 18, 21, 76 |
| 7 | Packaging and Distributing .NET Types | 4, 53, 55, 72 |
| 8 | Working with Common .NET Types | 24, 35, 36, 37, 38, 39 |
| 9 | Working with Files, Streams, and Serialization | 40, 41 |
| 10 | Working with Data Using Entity Framework Core | 31 |
| 11 | Querying and Manipulating Data Using LINQ | 30 |
| 12 | Introducing Web Development Using ASP.NET Core | 81* |
| 13 | Building Websites Using ASP.NET Core Razor Pages | 81* |
| 14 | Building and Consuming Web Services | 81* |
| 15 | Building User Interfaces Using Blazor | 81* |

원서 10·12~15장이 이 책에서 **81장 한 장**으로 눌린 것이 이 표의 요점이다. 이 책은 애플리케이션 프레임워크를 다루지 않는다. 웹·데이터 접근을 실습하려면 이 원서와 Pro C# 후반부가 그 자리다.

### Pro C# 10 with .NET 6 — 34개 장 요약

| 원서 장 | 주제군 | 이 책의 대응 장 |
|---|---|---|
| 1~2 | C#과 .NET 소개, 빌드 | 2, 3, 4 |
| 3~4 | 핵심 언어 구성 요소 1·2 | 6, 7, 8, 9, 10, 11, 77 |
| 5~6 | 캡슐화, 상속과 다형성 | 13, 14, 17, 19 |
| 7 | 구조적 예외 처리 | 32 |
| 8 | 인터페이스 | 18 |
| 9 | 객체 수명 | 33, 34 |
| 10 | 컬렉션과 제네릭 | 23, 24 |
| 11 | 고급 언어 기능 | 22 |
| 12 | 델리게이트·이벤트·람다 | 26, 27 |
| 13 | LINQ to Objects | 29, 31 |
| 14 | 프로세스·AppDomain·로드 컨텍스트 | 52 (ALC 기준으로 재서술) |
| 15 | 멀티스레드·병렬·비동기 | 45, 50 |
| 16 | 클래스 라이브러리 빌드와 구성 | 4, 12, 52, 53 |
| 17 | 리플렉션·늦은 바인딩·특성·동적 타입 | 57, 59 |
| 18 | CIL과 동적 어셈블리 | 55, 56*, 58 |
| 19 | 파일 I/O와 객체 직렬화 | 40, 41 |
| 20~24 | ADO.NET · EF Core · 데이터 접근 계층 | 81 |
| 25~29 | WPF | 81 |
| 30~34 | ASP.NET Core · MVC · Razor Pages | 81 |

### 항목 단위 세 권

이 셋은 장 대응이 아니라 **주제 대응**이다.

| 원서 | 대응 구간 | 이 책의 장 |
|---|---|---|
| **In Depth** 1부(C# in Context) | 언어 진화의 배경 | 76 |
| **In Depth** 2부(C# 2~5) | 제네릭·널 가능 값 타입·반복자·LINQ·async | 21, 23, 28, 29, 47, 76 |
| **In Depth** 3부(C# 6) | 속성 개선·문자열 보간 | 76 |
| **In Depth** 4부(C# 7 이후) | 튜플·분해·`ref` 개선·패턴 매칭·NRT | 21, 77, 76 |
| **Effective** 1~2부 | 언어 관용구, 리소스 관리 | 79* |
| **Effective** 3부 | 제네릭 | 23 |
| **Effective** 4부 | LINQ | 28, 29, 30 |
| **Effective** 5부 | 예외 실무 | 32, 33 |
| **More Effective** 1부 | 데이터 타입 다루기 | 16, 19, 25 |
| **More Effective** 2부 | API 설계 | 78* |
| **More Effective** 3부 | 태스크 기반 비동기 | 47, 51 |
| **More Effective** 4부 | 병렬 처리 | 50 |
| **More Effective** 5부 | 동적 프로그래밍 | 59 |
| **More Effective** 6부 | C# 커뮤니티 참여 | 부록 J, 83 |

> **💡 More Effective 6부는 부록 J로 이어진다**
>
> Bill Wagner가 그 책 마지막 부에서 한 주장은 이 부록 다음 장(부록 J)의 전제와 같다 — **가장 좋은 답은 가장 인기 있는 답이 아니고, 명세와 소스를 직접 확인하는 사람이 그 답에 먼저 닿는다.** 이 책이 84장과 부록 J로 끝나는 이유가 그것이다.

---

## I.6 원서를 이어서 읽는 순서

이 책을 끝낸 독자가 다음에 무엇을 읽을지는 **어디로 가고 싶은가**로 갈린다. 네 갈래로 정리한다.

### 갈래 1 — 레퍼런스를 곁에 두고 싶다

**Nutshell 한 권.** 순서대로 읽는 책이 아니라 찾아보는 책이다. 이 책이 지면 때문에 줄인 오버로드·옵션·예외 조건이 거기 있다. 특히 6장(.NET Fundamentals)과 7장(Collections)은 이 책 24·35~39장의 상위 집합이다.

읽는 방식: 통독하지 마라. 이 책의 장을 읽다가 "이 API의 나머지 오버로드가 궁금하다"가 될 때만 해당 장을 편다.

### 갈래 2 — 런타임 내부를 더 파고 싶다

| 순서 | 무엇 | 왜 | 이 책의 어디에서 이어지나 |
|---|---|---|---|
| 1 | **Memory** 7~10장 | GC의 네 단계를 원문 밀도로 다시 | 64장 |
| 2 | **Memory** 5~6장 | 힙 분할과 할당 경로의 세부 | 62·63장 |
| 3 | **CLR** 4~6장, 12장 | 타입·메서드 테이블·제네릭 인스턴스화의 원리 서술 | 54장 |
| 4 | **CLR** 21장 | 관리 힙의 고전적 서술(단, .NET Framework 기준임을 감안) | 62·64장 |
| 5 | `dotnet/runtime` 소스 | 여기서부터는 책이 아니라 소스다 | 83장, 부록 J |

이 갈래의 끝은 책이 아니다. Memory와 CLR을 읽고 나면 남은 질문은 전부 소스에서만 답이 나온다. 그 진입 절차가 83장이고, 무엇을 어디서 찾는지가 부록 J의 J.3절이다.

### 갈래 3 — 성능을 파고 싶다

| 순서 | 무엇 | 왜 |
|---|---|---|
| 1 | **High-Perf** 5장 | 프로파일링·트레이싱 실무. 도구 손에 익히기가 먼저다 |
| 2 | **High-Perf** 8~9장 | I/O와 네트워크 — 실제 서비스에서 병목의 대부분 |
| 3 | **Memory** 14장 | Span 계열, 파이프라인, 데이터 지향 설계 |
| 4 | **High-Perf** 11장 | 프레임워크를 벤치마크로 비교하는 방법론 |
| 5 | **Nutshell** 23장 | `Span<T>`/`Memory<T>` 레퍼런스로 다시 확인 |

이 순서에는 이유가 있다. **측정 도구가 먼저고 최적화 기법이 나중이다.** 순서를 뒤집으면 측정할 수 없는 것을 최적화하게 되고, 그것이 67장이 경고한 상태다.

### 갈래 4 — 설계·관용구를 파고 싶다

| 순서 | 무엇 | 왜 |
|---|---|---|
| 1 | **Effective** 전권 | 50개 항목. 하루 두세 항목씩 2~3주 |
| 2 | **More Effective** 1~2부 | 데이터 타입 선택과 API 설계 |
| 3 | **In Depth** 4부 | 최근 문법이 왜 그 모양인지의 배경 |
| 4 | **More Effective** 6부 | 커뮤니티·명세 참여 |

Effective 시리즈는 **한 번에 읽고 끝내는 책이 아니다.** 항목마다 자기 코드베이스에서 반례를 찾아보는 방식으로 읽어야 남는다. 이 책 78·79장의 연습 문제가 그 방식을 흉내 낸 것이다.

### 갈래 5 — 무언가를 만들고 싶다

이 책은 애플리케이션 프레임워크를 다루지 않는다(81장은 지도일 뿐이다). 만드는 법은 다른 책의 몫이다.

| 목표 | 원서 |
|---|---|
| 웹 API·웹 앱 | **Price** 12~14장 → **Pro C#** 30~34장 |
| 데이터 접근 (EF Core) | **Price** 10장 → **Pro C#** 20~24장 |
| 데스크톱 (WPF) | **Pro C#** 25~29장 (Windows 전용) |
| Blazor | **Price** 15장 |

### 읽는 순서를 고르는 한 가지 기준

여러 갈래가 다 끌린다면, **지금 실무에서 막힌 문제가 있는 갈래**를 골라라. 원서는 이 책보다 두껍고 밀도가 높아서 동기 없이 통독하면 남지 않는다. 반대로 해결하려는 문제를 안고 읽으면 두 장만 읽어도 답이 나온다.

> **⚠️ 원서의 판 차이는 곧 사실 차이다**
>
> CLR via C# 4판을 지금 읽는다면 AppDomain·NGen·WinRT 서술은 그대로 믿으면 안 된다. Effective C# 3판은 C# 6~7 기준이라 이후 문법(레코드, `init`, 패턴 매칭 확장)이 바꾼 권고가 있다. Pro C#·High-Perf는 .NET 6 기준이므로 성능 수치를 지금 런타임에 그대로 옮기지 마라. **원서를 읽을 때 판 번호와 대상 런타임 버전을 먼저 확인하는 습관**이 그래서 필요하다.

> **💡 원서와 이 책이 어긋나면 원서를 의심하기 전에 버전을 의심하라**
>
> 서술이 충돌하는 경우 대개는 둘 중 하나가 틀린 것이 아니라 **대상 런타임이 다른 것**이다. 판별 방법은 하나뿐이다 — 자기 런타임에서 실행해 확인한다. `sharplab`으로 컴파일 결과를, 벤치마크로 성능 주장을, 소스로 런타임 동작을 확인하는 절차가 부록 J의 J.6절이다.

---

## 이 부록의 요약

- **이 책은 여덟 권을 주제 축으로 다시 자른 결과다.** 어느 한 권도 전체를 덮지 못하기 때문이고, 그 재구성의 설계도가 이 부록의 I.3·I.4절 표다.

- **골격은 Nutshell, 런타임 관점은 CLR via C#, 메모리는 Pro .NET Memory Management, 측정은 High-Performance, 최신성과 애플리케이션은 Price, 언어사는 In Depth, 판단 기준은 Effective 시리즈, CIL 실물은 Pro C#이 맡았다.**

- **Part XI(메모리·GC)과 Part X(CLR 내부)만 원천이 단독이다.** 나머지 Part는 서너 권이 섞이지만 이 둘은 대체재가 사실상 없다. 더 파고 싶다면 선택지가 좁다는 뜻이다.

- **Nutshell 4장 하나가 이 책의 13개 장으로 흩어졌고, Memory 7~10장 네 개가 64장 하나로 압축됐다.** 재구성의 방향은 양쪽 다 있다.

- **원천이 없는 장이 있다.** 82·83·84장과 71·75장의 상당 부분은 원서 대응이 약하거나 없다. `※` 표시가 그 표식이다.

- **CLR via C# 22장(AppDomain)은 의도적으로 버렸다.** .NET Core 이후 존재하지 않는 기능이고, 그 역할은 어셈블리 로드 컨텍스트가 가져갔다(52장).

- **다음 책은 목적으로 고른다.** 내부는 Memory 7~10장, 성능은 High-Perf 5장, 설계는 Effective 전권, 만들기는 Price 12~15장이 출발점이다. 그리고 어느 갈래든 끝은 책이 아니라 소스다.

- **원서를 읽을 때 판 번호와 대상 런타임을 먼저 확인하라.** 이 책과 원서가 어긋나면 대개 어느 쪽이 틀린 것이 아니라 대상 런타임이 다른 것이다.

---

## 연습 문제

1. I.4절 표에서 자기가 가장 약하다고 느끼는 장 세 개를 고르고, 그 장의 **주 원천**이 무엇인지 확인하라. 세 장의 주 원천이 같은 책이면 그 책이 다음에 읽을 책이다.

2. 자기가 이미 읽은 원서가 있다면 I.5절 역방향 색인에서 그 책의 행을 찾아, 이 책의 대응 장 중 **아직 안 읽은 장**을 목록으로 만들어라. 그것이 그 원서가 채우지 못한 영역이다.

3. Nutshell 4장(Advanced C#)이 이 책의 13개 장으로 나뉜 이유를 표로 설명하라 — 어떤 기준으로 잘렸는가? 문법의 난이도인가, 런타임 메커니즘의 차이인가.

4. 이 책 64장을 다시 읽고, Memory 7~10장 네 장이 어떤 순서로 압축됐는지 절 단위로 대응시켜라. 압축 과정에서 **빠진 것**이 무엇인지 추정하고, 그 목록을 원서로 확인하라.

5. `※` 표시가 붙은 서술을 이 책에서 열 개 찾아라(부록 H와 76장에 몰려 있다). 그중 셋을 골라 부록 J의 방법으로 실제 런타임에서 확인하라.

6. I.6절의 다섯 갈래 중 하나를 골라 향후 3개월 독서 계획을 세워라. 각 항목마다 **읽고 나서 확인할 질문 하나**를 미리 적어라. 질문 없이 읽으면 남지 않는다.

7. CLR via C# 22장(AppDomain)을 구할 수 있다면 훑어보고, 그 장의 각 주제가 지금 무엇으로 대체됐는지 52장과 대조표를 만들어라. `AppDomain.CurrentDomain`이 아직 남아 있는 이유도 함께 정리하라.

---

**이어서 볼 곳** — 원서 다음에 읽어야 할 1차 자료(런타임 소스, 언어 설계 저장소, 명세, 도구)는 **부록 J**에 있다. 런타임 소스를 실제로 열어 들어가는 절차는 83장, 자기가 아는 것과 모르는 것을 판별하는 방법은 84장, C# 버전과 런타임 버전의 대응은 부록 H, 이 책의 읽는 순서 자체는 1장이다.
