---
title: "Part 6. API 보안 기본 (인증·인가·공격 방어)"
parent: "NestJS SaaS 백엔드 필수 이론"
nav_order: 6
---

# Part 6. API 보안 기본 (인증·인가·공격 방어) (출처: API Security in Action, API Security(Okta))

SaaS는 인터넷에 열려 있고, 여러 고객(테넌트)의 데이터가 한 시스템에 모여 있습니다. 보안 사고 하나가 곧 서비스 신뢰 상실로 이어집니다. 이 부는 "매일 짜는 API 코드에서 반드시 지켜야 할 보안 기본기"만 골라 정리했습니다.

> 💡 보충(원서 외): 원서(API Security in Action)의 예제는 Java(Spark)이고 Okta 책은 언어 중립입니다. 이 부의 TypeScript/NestJS/Express 코드와 "🔗 NestJS 연결" 문단은 개념을 Node 환경으로 옮긴 저자 보충이며, 원서 본문에 있는 내용이 아닙니다. 그 밖의 원서 외 서술은 각 절에 `(보충)`으로 표시했습니다.

### 0. 보안 통제의 큰 그림

API에 들어온 요청은 여러 관문을 순서대로 통과합니다. **순서가 중요합니다.**

| 순서 | 통제 | 막아주는 위협 |
|---|---|---|
| 1 | 전송 암호화 (HTTPS) | 도청, 변조 |
| 2 | 속도 제한 (Rate limiting) | 서비스 거부(DoS), 비용 폭주 |
| 3 | 인증 (Authentication) | 사칭(Spoofing) |
| 4 | 감사 로그 (Audit log) | 부인(Repudiation) |
| 5 | 인가 (Access control) | 정보 유출, 권한 상승 |

핵심 규칙 세 가지:
- **속도 제한은 가장 먼저.** 인증도 CPU를 쓰기 때문에, 과부하 요청은 인증 전에 잘라야 합니다.
- **인증은 요청을 거절하지 않고 "누구인지"만 채워 둡니다.** 거절은 인가 단계가 결정합니다. 그래야 실패한 요청도 감사 로그에 남습니다.
- **감사 로그는 인증 뒤, 인가 앞.** 거부된 시도야말로 공격의 흔적이기 때문입니다.

또 하나의 대원칙이 <strong>다층 방어(Defense in depth)</strong>입니다. 어느 한 층이 뚫려도 전체가 무너지지 않게 여러 겹으로 막습니다. 그리고 **최소 권한 원칙(Principle of Least Privilege)**: 사용자·프로세스·DB 계정 모두 "일에 필요한 최소한"만 가집니다.

> 🔗 NestJS 연결: 요청 흐름은 `Middleware → Guard → Interceptor → Pipe → Handler` 순입니다. Rate limit·인증·인가를 각각 어디에 둘지 이 순서에 맞춰 설계하세요.

> 📖 원문: API Security in Action 3.1(다섯 가지 통제와 STRIDE 대응), 3.2(속도 제한을 가장 먼저), 3.3(인증 뒤 감사 로그, 인가 앞)

---

### 1. TLS / HTTPS 기초

#### 1.1 TLS가 해 주는 일
- **기밀성**: 중간에서 내용을 엿볼 수 없음
- **무결성**: 중간에서 내용을 바꾸면 들킴
- **서버 인증**: 접속한 서버가 진짜 그 서버임을 인증서로 확인

용어 정리: **SSL**은 옛 이름이고 지금 쓰는 것은 **TLS**(현재 1.3)입니다. "SSL 인증서"라고 불러도 실제로는 TLS를 씁니다. **HTTPS = HTTP + TLS** (기본 포트 443).

#### 1.2 연결 과정 (핵심만)
1. TCP 연결
2. 클라이언트가 지원하는 TLS 버전·암호 목록을 보냄 (ClientHello)
3. 서버가 선택 결과와 **인증서**를 보냄
4. 클라이언트가 인증서를 검증
5. 세션 키를 협상(키 교환)
6. 이후 모든 데이터는 협상한 **대칭키**로 암호화 (빠르기 때문)

#### 1.3 인증서와 신뢰의 사슬
- 인증서는 "이 도메인의 공개키는 이것이다"라는 증명서입니다.
- 클라이언트는 **루트 CA**(OS·브라우저에 내장)를 신뢰합니다. 서버 인증서는 중간 CA를 거쳐 루트까지 서명 사슬이 이어져야 합니다. 이것이 <strong>신뢰의 사슬(Chain of Trust)</strong>입니다.
- 클라이언트는 확인합니다: 만료 안 됨 / 도메인 일치 / 서명 사슬이 신뢰하는 루트로 이어짐.
- **자체 서명(self-signed) 인증서**는 누구나 만들 수 있어 신원을 보증하지 못합니다. 개발용으로만 쓰세요.
- Let's Encrypt, 클라우드 인증서 관리 서비스 등으로 무료·자동 발급/갱신이 가능합니다.

#### 1.4 TLS가 가리지 못하는 것
- 클라이언트·서버 IP 주소
- 서버 이름(핸드셰이크 때 평문으로 오는 인증서에 들어 있음)
- 요청 URL과 응답의 대략적인 길이, 요청 타이밍

따라서 "URL 자체가 민감정보"가 되면 안 됩니다.

#### 1.5 모범 사례
- **어디서나 TLS**: 일부 엔드포인트만 HTTPS로 하면 세션 ID가 새어 나갑니다. HTTP는 HTTPS로 리다이렉트하거나 아예 닫습니다.
- **민감 정보를 URL(쿼리스트링)에 넣지 않기**: URL은 접근 로그·브라우저 기록·프록시에 남습니다. 토큰은 `Authorization` 헤더로 보냅니다.
- **HSTS**: `Strict-Transport-Security` 헤더로 "이 도메인은 앞으로 무조건 HTTPS"라고 브라우저에 기억시킵니다.
- 최신 TLS 버전과 안전한 암호 스위트만 허용. SSL 3.0 이하는 IETF가 금지했고(2015), (보충) TLS 1.0/1.1도 끄는 것이 오늘날의 표준 관행입니다.
- 배포 후 SSL Labs 같은 점검 도구로 등급을 확인합니다. A+가 완벽을 보장하진 않지만 낮은 등급은 고쳐야 할 신호입니다.
- 서버 간 통신에서는 인증서(공개키) 고정(pinning)을 고려할 수 있습니다. 원서(Okta)는 서버 간 API 통신에서 유용하다고 소개합니다. (보충) 다만 브라우저용 HPKP 헤더는 이미 폐기되었고 운영 부담이 커서 선택 사항입니다.
- 개발 중 자체 서명 인증서를 쓸 때도 `curl -k` 같은 인증서 검증 끄기 옵션을 습관으로 삼지 마세요. 운영에서 검증을 끄면 TLS의 보증이 사라집니다.
- API는 처음부터 HTTPS로만 열고, 평문 HTTP 요청은 아예 거부하는 편이 낫습니다. 첫 요청에 비밀번호가 실려 오기 때문입니다.

왜 중요한가: 비밀번호·토큰이 평문으로 지나가는 순간 다른 모든 보안 장치가 무의미해집니다. 사고는 보통 이렇게 **연쇄**로 일어납니다.

```ts
// 실무에서는 보통 로드밸런서/리버스 프록시(Nginx, ALB)가 TLS를 종료합니다.
// Node 앱은 프록시 뒤에 있다는 것을 알려 줘야 req.secure, req.ip 등이 올바릅니다.
import helmet from 'helmet';

app.set('trust proxy', 1);                       // 프록시 1단계 신뢰
app.use(helmet.hsts({ maxAge: 15552000, includeSubDomains: true }));
```

> 🔗 NestJS 연결: `app.use(helmet())`를 `main.ts`에서 등록하면 HSTS를 포함한 보안 헤더가 한 번에 붙습니다(4.3절 참고).

> 📖 원문: Okta Ch.1 (TLS 전반, Best Practices) / API Security in Action 3.4 (3.4.1 HTTPS, 3.4.2 HSTS)

---

### 2. DoS 방어와 Rate Limiting

#### 2.1 DoS란?
정상 사용자가 서비스를 못 쓰게 만드는 공격입니다.
- **애플리케이션 계층 폭주(L7 Flood)**: 문법상 정상인 요청을 엄청 많이 보냄
- **분산(DDoS)**: 여러 대(봇넷)가 동시에 보냄 → 단순 IP 차단이 어려움
- **의도치 않은 DoS**: 갑자기 트래픽이 몰림(인기 게시, 이른바 Slashdot/Reddit 효과). 원인은 공격이 아니라도 결과는 같음. 캐시(CDN)·오토스케일로 대비합니다.
- **네트워크 계층 공격**(예: DNS 증폭)은 방화벽·전문 DoS 방어 서비스가 맡는 영역이고, 이 절의 애플리케이션 코드가 막는 대상은 아닙니다.

돈을 노리는 형태도 있습니다. 예: SMS 발송, 외부 유료 API 호출, 대용량 다운로드를 반복시켜 **비용을 폭발**시킴.

#### 2.2 방어 수단

| 수단 | 설명 | 한계 |
|---|---|---|
| IP 허용/차단 목록 | 사내 전용 서비스면 유효 | 공유 IP를 통째로 막을 위험, IP 위조·분산 공격엔 약함 |
| **속도 제한(Rate limiting)** | 클라이언트/키/사용자별로 기간당 요청 수 제한 | 제한을 넘는 요청도 서버까지는 도달함 |
| **업스트림 필터링** | CDN/WAF/DDoS 방어 서비스(Cloudflare, AWS Shield 등)에서 앞단 차단 | 비용·설정 필요 |
| **확장성 있는 설계** | 캐시(CDN·HTTP 캐시), 무거운 작업은 큐로 비동기 처리, 오토스케일 | 근본 설계가 필요 |
| 부하 테스트 | CI에서 성능 저하를 조기 발견 | - |

#### 2.3 Rate limiting 설계 팁
- <strong>가능한 한 앞단(로드밸런서/API 게이트웨이/리버스 프록시)</strong>에서 적용하고, **앱 서버에도 한 겹 더** 둡니다(다층 방어). 프록시 설정이 잘못돼도 서버가 무너지지 않게.
- 초과 시 **`429 Too Many Requests`** + **`Retry-After`** 헤더(몇 초 뒤 재시도)를 돌려줍니다.
- 서버 1대당 한도는 "전체 목표 처리량 ÷ 서버 수" 정도로 잡고, 실제 처리 가능한 값보다 **낮게** 둡니다.
- 인증 안 된 요청이 무거운 자원을 쓰지 못하게 합니다.
- **SaaS에서는 플랜(무료/프로)별 쿼터**와 결합합니다(Okta: 한도는 보통 고객의 요금제에 묶임). 
- (보충) 로그인·비밀번호 재설정·OTP 발송처럼 민감한 엔드포인트는 별도로 더 빡빡하게 제한합니다(무차별 대입 방어).
- (보충) 다중 서버에서 고객·키 단위로 정확히 세려면 카운터를 **Redis 같은 공유 저장소**에 둡니다(메모리 카운터는 서버마다 따로 셈).
- 한도를 넘은 요청도 서버까지는 도달해 `429`를 만들어야 하므로, 속도 제한만으로는 폭주를 막지 못합니다. 그래서 업스트림 필터링과 함께 씁니다.

```ts
// NestJS: @nestjs/throttler (전역 Guard로 가장 먼저 동작)
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), // 60초에 100회
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

// 로그인은 더 엄격하게
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Post('login')
login(@Body() dto: LoginDto) { /* ... */ }
```

> 🔗 NestJS 연결: `ThrottlerGuard`를 `APP_GUARD`로 등록하면 전역 Guard로 동작합니다. 다중 인스턴스라면 Redis storage 어댑터를 사용하세요.

> 📖 원문: Okta Ch.2 / API Security in Action 3.2

---

### 3. 입력 검증 · 새니타이징 · 인젝션 방어

**모든 입력은 신뢰할 수 없습니다.** 신뢰 경계(trust boundary)를 넘어오는 데이터는 전부 검증 대상입니다. 요청 본문·쿼리·경로 파라미터뿐 아니라 **헤더(User-Agent 등), 외부 API 응답, 업로드 파일, DB에서 꺼낸 값**도 포함됩니다.

#### 3.1 입력 다루는 4가지 전략
1. **알려진 좋은 것만 허용(Allowlist, Accept known good)** — 가장 안전. 타입·범위·길이·형식을 명시.
2. **나쁜 것을 거부(Blocklist)** — 놓치는 변형이 항상 있어 불완전. 주 방어선으로 쓰지 마세요.
3. **정리(Sanitize)** — 허용 문자만 남기기, 이스케이프 등. 형식이 느슨한 자유 텍스트에 사용.
4. **아무것도 안 함** — 절대 금지.

원칙: **"무엇이 유효한가"를 정의하라. "무엇이 무효한가"를 나열하지 말라.**

검증 체크 목록:
- 타입(숫자는 숫자, 불리언은 불리언)
- 범위(나이 0 초과 150 미만 등)
- **길이 상한**(DB 컬럼 제한만 믿지 말고 앱에서 먼저 차단 — DB 자원 낭비 방지)
- 형식(이메일, 전화번호, UUID 등)
- (보충) 존재하지 않는 필드 제거(불필요 필드가 그대로 저장되는 **Mass Assignment** 방지. 원서는 OWASP API Top 10 표에서 이름만 언급)

정리(sanitize) 쪽은 Okta 책이 더 자세합니다. 자유 텍스트는 "안전한 부분만 찾기"보다 **출력 문맥에 맞게 이스케이프**(HTML, 속성, JSON 등)하는 것이 가장 쉽고 좋은 방법이라고 설명합니다. 블랙리스트식 제거는 `<scr<script>ipt>`처럼 한 번 지워도 다시 조립되는 변형이 있어, 반복 적용해야 하고 결국 불완전합니다.

#### 3.2 NestJS에서의 검증 (Pipe + DTO)

```ts
// main.ts — 전역 ValidationPipe
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,              // DTO에 없는 필드 제거
  forbidNonWhitelisted: true,   // 모르는 필드가 오면 400
  transform: true,
}));

// create-space.dto.ts
export class CreateSpaceDto {
  @IsString() @MaxLength(255)
  name: string;

  @Matches(/^[a-zA-Z][a-zA-Z0-9]{1,29}$/)   // 허용 문자 목록 방식
  owner: string;
}
```

> 🔗 NestJS 연결: `class-validator` + `ValidationPipe`가 allowlist 검증의 표준 도구입니다. `whitelist: true`는 Mass Assignment 방어에도 효과적입니다.

#### 3.3 ReDoS 주의
정규식이 특정 입력에서 **지수적으로 느려지는** 경우가 있습니다(예: `^(a|aa)+$`에 `aaaa…b`). 원서(2.5)가 이 예를 그대로 듭니다.
- 반복 구간에서 한 입력이 여러 방식으로 매칭되지 않게 설계
- 복잡하면 정규식 대신 단순 문자열 연산 사용
- (보충) 입력 길이를 먼저 제한. 이벤트 루프가 하나뿐인 Node.js에서는 한 요청의 정규식이 서버 전체를 멈출 수 있어 더 위험합니다.

#### 3.4 SQL Injection

**원인**: 사용자 입력을 SQL 문자열에 이어 붙임(concatenation). DB는 "명령어"와 "데이터"를 구분하지 못합니다.

```ts
// ❌ 위험: 문자열 연결
const rows = await db.query(
  `SELECT * FROM users WHERE id = '${userId}'`
);   // userId = "x' OR '1'='1" 이면 전체 조회

// ✅ 안전: 파라미터 바인딩 (Prepared statement)
const rows = await db.query(
  'SELECT * FROM users WHERE id = $1', [userId]
);
```

방어 요약:
- **파라미터 바인딩(Prepared statement)이 1순위.** 값은 명령과 분리되어 전달됩니다.
- 특수문자 이스케이프/제거는 DB마다 달라 신뢰하기 어렵습니다.
- ORM·추상화 계층도 **내부에서 바인딩을 쓰는지** 문서로 확인하세요(원서 2.4.1). (보충) TypeORM/Prisma의 `raw` 쿼리·동적 정렬 컬럼·`$queryRawUnsafe` 같은 곳에서 문자열 연결을 하지 말고, 동적 컬럼명은 allowlist로 매핑합니다.
- **최소 권한 DB 계정**(POLA): 앱은 필요한 권한(원서 예: SELECT/INSERT)만 가진 계정으로 접속하고, 테이블 삭제 같은 권한은 스키마 생성용 별도 계정에만 둡니다. 인젝션이 뚫려도 피해가 제한됩니다. (예방이 아니라 피해 축소)
- (보충) NoSQL도 동일: 객체 그대로 쿼리에 넣지 말고(`{ $ne: null }` 주입), 타입을 검증합니다. 원서는 "비SQL DB도 파라미터 API가 있는지 확인하라"고만 말합니다.

인젝션은 SQL만이 아닙니다. **OS 명령 실행(`child_process.exec`에 사용자 입력), `eval`, LDAP 조회, 다른 API로 보내는 요청, HTML 생성, HTTP 헤더·로그 메시지**도 같은 유형입니다. 헤더에 `\r\n`이 들어가면 헤더 주입, 로그에 줄바꿈이 들어가면 가짜 로그 주입이 됩니다.

#### 3.5 파일 업로드
(Okta Ch.3)
- 파일 **타입·크기·내용** 검증(아바타로 올린 파일이 진짜 이미지인지. 확장자만 믿지 않기)
- 저장 파일명에 사용자 입력을 쓰지 말 것(`../../etc/passwd` 경로 조작). (보충) 서버가 생성한 ID(UUID)로 저장
- 응답 시 올바른 `Content-Type`으로 제공, php·cgi·js 같은 웹에서 실행되는 파일 형식 업로드 금지
- 바이러스 검사, 이름 변경·리사이즈·EXIF 제거 같은 가공 후 제공
- (보충) 가능하면 앱 서버 디스크 대신 객체 스토리지(S3 등)에 저장

#### 3.6 의존성도 입력이다
외부 의존성은 신뢰 경계 밖에서 들어온 코드입니다(Okta Ch.3). 원서는 npm에서 설치 시 환경 변수를 외부로 올리는 악성 스크립트가 실제로 있었던 사례와, GitHub 보안 알림 같은 자동 경고를 챙기라는 조언을 듭니다. 새 취약점(CVE)은 계속 나오므로 지켜봐야 합니다. 또 HTTP 요청 헤더(User-Agent 등)도 보내는 쪽이 바꿀 수 있는 입력이라, 내부 화면에 그대로 찍으면 XSS가 됩니다.
- Dependabot 등으로 취약점 알림 활성화
- (보충) `npm audit`, lockfile 커밋, 불필요한 의존성 줄이기, 설치 스크립트(postinstall) 주의

> 📖 원문: Okta Ch.3 (Accept known good ~ Best Practices) / API Security in Action 2.4(인젝션·최소 권한), 2.5(입력 검증·ReDoS)

---

### 4. 안전한 출력: XSS, Content-Type, 보안 헤더

#### 4.1 XSS(Cross-Site Scripting)란?
공격자가 넣은 스크립트가 **다른 사용자의 브라우저에서 실행**되는 공격입니다. 브라우저는 같은 출처(origin)의 스크립트를 신뢰하므로, XSS가 성공하면 그 사이트의 쿠키·토큰·화면 데이터에 접근할 수 있습니다.

| 종류 | 설명 |
|---|---|
| Stored | 악성 문자열이 DB에 저장되고 나중에 화면에 뿌려짐(게시판 댓글) |
| Reflected | 요청에 담긴 값이 응답에 그대로 되돌아옴(에러 메시지, 검색어) |
| DOM-based | 프론트 JS가 동적으로 HTML을 만들 때 발생 |

"JSON API라서 XSS와 무관하다"는 오해가 위험합니다. 응답의 `Content-Type`이 잘못되면(예: 에러 페이지가 `text/html`), 브라우저가 JSON 안의 `<script>`를 HTML로 해석해 실행할 수 있습니다.

#### 4.2 API가 지켜야 할 것
- **받는 것에 엄격하게**: JSON을 받는 엔드포인트는 `Content-Type: application/json`이 아니면 `415 Unsupported Media Type`. (HTML 폼은 `application/json`을 보낼 수 없어 일부 공격이 차단됩니다.)
- **JSON은 직접 문자열을 조립하지 말고 직렬화 라이브러리(`JSON.stringify`, 프레임워크 기본 직렬화)로 생성**.
- **모든 응답(특히 에러 응답)에 올바른 `Content-Type`을 명시**(예: `application/json;charset=utf-8`, 인코딩 트릭 방지). 요청의 `Accept` 값을 그대로 응답 `Content-Type`에 복사하지 않기.
- 이 헤더들은 에러 응답에도 붙도록 "모든 응답 뒤에 실행되는 필터"에 모아 두세요. 원서 예제에서도 에러 응답에서 빠져 XSS가 성립했습니다.
- **에러 메시지에 사용자 입력을 그대로 넣지 않기**, 스택 트레이스·내부 클래스명·프레임워크 버전을 노출하지 않기(공격자에게 힌트).
- HTML을 서버에서 만든다면 **출력 시 이스케이프**(HTML/속성/JSON 컨텍스트별). 사용자가 HTML을 넣게 해야 한다면 검증된 sanitizer 라이브러리 사용.

#### 4.3 보안 헤더 (1절의 HSTS와 함께 봅니다)

| 헤더 | 값(API 권장) | 목적 |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | 브라우저가 `Content-Type`을 무시하고 내용을 추측(sniff)하지 못하게 |
| `X-Frame-Options` | `DENY` | iframe에 응답이 로드되는 것 방지(클릭재킹). CSP `frame-ancestors`가 후속 |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'; sandbox` | XSS가 뚫려도 할 수 있는 일을 제한 |
| `Cache-Control` | `no-store` (기본값), 필요한 곳만 선택적 허용 | 민감 응답이 브라우저·프록시 캐시에 남지 않게 |
| `Strict-Transport-Security` | `max-age=…; includeSubDomains` | HTTPS 강제 |
| `X-XSS-Protection` | `0` | 구형 브라우저 필터는 오히려 취약점을 만들 수 있어 끄는 것이 현재 권고 |
| `Server`(원서), `X-Powered-By`(Express, 보충) | 제거 | 기술 스택·버전 노출 최소화 |

```ts
// Express/NestJS: helmet + 기본 no-store
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  },
}));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store'); // 기본은 캐시 금지, 필요한 라우트만 덮어쓰기
  next();
});
```

> 🔗 NestJS 연결: `helmet`은 `main.ts`의 `app.use()`로, 응답 공통 헤더는 Interceptor나 미들웨어로 넣습니다. 예외 응답도 일관된 JSON이 되도록 `ExceptionFilter`를 두면 에러 내용 노출을 통제하기 쉽습니다.

> 📖 원문: API Security in Action 2.6 (2.6.1 XSS 재현, 2.6.2 방지, 표 2.1·2.2 헤더) / Okta Ch.3 (XSS 종류)

---

### 5. 인증(Authentication): 세션 vs 토큰, 쿠키, CSRF

**인증 = 당신이 누구인지 증명. 인가 = 당신이 무엇을 할 수 있는지 결정.** (HTTP 상태코드 이름은 이 둘을 혼동해 만들어졌습니다: `401 Unauthorized`는 사실 "인증 안 됨", `403 Forbidden`이 "인가 거부"입니다.)

- **401**: 자격 증명이 없거나 틀림 → 다른 자격 증명으로 재시도하면 될 수도 있음. `WWW-Authenticate` 헤더로 방식을 알림.
- **403**: 누구인지는 알지만 이 작업은 허용 안 됨.

#### 5.1 HTTP Basic 인증
`Authorization: Basic base64(id:password)`. 단순하지만
- Base64는 **암호화가 아니라 인코딩**. 누구나 디코딩하므로 반드시 HTTPS 위에서만.
- 요청마다 비밀번호를 보내 유출·로그 기록 위험이 커지고, 매 요청 비밀번호 해시 검사는 CPU 부담도 큼
- 로그아웃·키 교체(로테이션, 여러 키 동시 지원 필요)·권한 위임(scope 없음)이 불편, 브라우저 로그인 UI 사용자 정의 불가, 브라우저/모바일 앱에는 키를 심을 수 없음
- Basic 외에도 `Authorization` 헤더는 Digest, Bearer 등 여러 방식을 담는 확장형 틀입니다.

서버 간 API 호출에서 쓸 경우에도 아이디/비밀번호는 **계정 로그인 정보와 분리된 긴 랜덤 값**이어야 합니다. 같은 값을 쓰면 "비밀번호 찾기" 한 번에 연동이 끊길 수도 있습니다(Okta Ch.5).

#### 5.2 토큰 기반 인증
로그인 시 한 번 자격 증명을 확인하고, 이후에는 **임시 토큰**으로 인증합니다. 비밀번호가 반복해서 전송되지 않고, 토큰은 만료·폐기·범위 제한이 가능합니다.

#### 5.3 세션 쿠키 방식

흐름: 로그인 → 서버가 랜덤 세션 ID 생성 후 `Set-Cookie` → 브라우저가 이후 요청에 자동으로 `Cookie` 첨부 → 서버가 세션 저장소에서 사용자 조회.

장점: 브라우저가 알아서 보내 주고, `Secure`/`HttpOnly` 같은 보호 속성이 있음. 단점: 서버가 상태를 저장, **CSRF 위험**, 다른 도메인(모바일·타 출처 SPA)에서 쓰기 불편.

**쿠키 보안 속성**

| 속성 | 효과 |
|---|---|
| `Secure` | HTTPS 연결에서만 전송 |
| `HttpOnly` | JS(`document.cookie`)에서 못 읽음 → XSS로 세션 탈취 어려움 |
| `SameSite=Strict/Lax` | 다른 사이트에서 발생한 요청에는 쿠키를 안 붙임 → CSRF 완화 |
| `Path`, `Domain` | 전송 범위 제한. `Domain`을 지정하지 않으면 하위 도메인 공유를 피함 |
| `__Host-` 접두사 | 하위 도메인이 덮어쓰지 못하게 강제(Secure, Path=/, Domain 없음 필요) |
| `Max-Age/Expires` | 수명. 원서는 로그인 세션 쿠키에는 지정하지 않아 브라우저를 닫으면 로그아웃되게 하고, 최대 세션 시간·유휴 시간은 서버에서 강제하라고 권합니다(브라우저가 탭을 복원할 수 있음). "로그인 유지" 기능에만 영구 쿠키를 씁니다. |

**세션 고정(Session Fixation) 방지**: 공격자가 미리 알고 있는 세션 ID를 피해자가 로그인할 때 그대로 쓰게 만드는 공격입니다. **로그인 성공 직후 항상 새 세션 ID를 발급하고 기존 세션은 폐기**하세요.

```ts
// express-session 예: 로그인 시 세션 재생성
req.session.regenerate((err) => {
  if (err) return next(err);
  req.session.userId = user.id;
  req.session.save(() => res.status(204).end());
});

app.use(session({
  name: '__Host-sid',
  secret: process.env.SESSION_SECRET!,      // 코드에 하드코딩 금지 (7절)
  resave: false, saveUninitialized: false,
  // maxAge를 주면 영구 쿠키가 됨. 원서 권고대로 생략하고 서버 저장소(TTL)에서 만료를 강제
  cookie: { secure: true, httpOnly: true, sameSite: 'lax' },
  // store: RedisStore  (다중 서버에서는 공유 저장소 필수)
}));
```

#### 5.4 CSRF (Cross-Site Request Forgery)

**상황**: 사용자가 우리 서비스에 로그인해 쿠키가 있는 상태에서 악성 사이트를 방문. 악성 사이트의 스크립트/폼이 우리 API로 요청을 보내면 **브라우저가 쿠키를 자동으로 붙여** 마치 사용자가 한 것처럼 처리됩니다. (응답은 읽지 못해도 "요청 실행"이 피해입니다.)

**방어 (겹쳐서 사용)**
1. **`SameSite` 쿠키** (`Lax` 이상). 가장 쉬운 1차 방어. 단, "같은 사이트" 기준이라 하위 도메인이 탈취되면 무력화되므로 단독 의존 금지. 또한 진짜 크로스 사이트에서 쿠키를 써야 하면(`SameSite=None; Secure`) 별도 방어가 필수.
2. **CSRF 토큰**: 요청에 예측 불가능한 토큰을 헤더(`X-CSRF-Token`)로 요구. 공격자는 이 값을 읽거나 추측할 수 없습니다.
   - **Double-submit cookie**: 토큰을 쿠키로도 주고 헤더로도 받아 서로 일치하는지 확인. 이 쿠키는 JS가 읽어야 하므로 `HttpOnly`가 아닙니다. 단점은 하위 도메인이 탈취되면 공격자가 그 쿠키를 알려진 값으로 덮어쓸 수 있다는 점입니다(`__Host-`가 일부 완화). 더 견고하게는 토큰을 **세션 쿠키의 SHA-256 해시 값**으로 만들어 서버가 다시 계산해 검증합니다. 공격자는 세션 쿠키를 모르므로 올바른 값을 못 만듭니다. 세션 ID가 높은 엔트로피의 값이라 느린 해시는 필요 없습니다.
   - 서버에서 비교할 때는 문자열 `==` 대신 **상수 시간 비교**(Node의 `crypto.timingSafeEqual`은 보충, 원서는 Java의 `MessageDigest.isEqual`)를 씁니다. 일치하는 앞부분 길이에 따라 걸리는 시간이 달라지는 타이밍 공격을 막기 위해서입니다.
3. **`GET`으로 상태를 바꾸지 않기.** GET은 브라우저가 거의 항상 허용하므로 CSRF 방어가 GET을 안전하다고 가정합니다.
4. `Content-Type: application/json` 강제 + 커스텀 헤더 요구는 보조 수단일 뿐, 단독 방어로는 부족.

**중요한 구분**: `Authorization: Bearer` 헤더로 토큰을 보내는 방식은 브라우저가 자동으로 붙이지 않으므로 **CSRF에는 강합니다**. 대신 토큰 저장 위치(아래)에서 XSS 위험을 지게 됩니다.

#### 5.5 쿠키 vs Bearer 토큰: 어떻게 고를까?

| | 세션 쿠키 (HttpOnly) | Bearer 토큰 (헤더) |
|---|---|---|
| 적합 | 같은 도메인의 웹 앱(SSR/SPA+API 동일 사이트) | 모바일, 서드파티, 다른 도메인 SPA, 서버 간 호출 |
| CSRF | 취약 → 방어 필수 | 영향 없음 |
| XSS로 토큰 탈취 | `HttpOnly`면 읽기 불가 | 저장 위치에 따라 위험 |
| 상태 | 서버 저장 (즉시 폐기 쉬움) | 저장형 또는 JWT(자체 포함형) |

**브라우저 Web Storage(`localStorage`)에 토큰을 두면** JS로 읽을 수 있어 XSS 한 번에 탈취됩니다. 원서(5.2.6)는 `<img>` 태그로 조용히 빼돌리는 예를 보여 주고, 애초에 XSS가 뚫리면 `HttpOnly` 쿠키도 사용자 브라우저에서 요청을 대행당하므로 XSS 방지가 최우선이라고 말합니다. CSP 같은 헤더는 완화책입니다. (보충) 웹 클라이언트라면 `HttpOnly` 쿠키(+CSRF 방어)나, 짧은 수명의 액세스 토큰을 메모리에 두고 리프레시 토큰을 `HttpOnly` 쿠키에 두는 구성이 흔한 절충안입니다.

**토큰은 예측 불가능하게 만든다**: 토큰 ID는 DB 시퀀스가 아니라 암호학적 난수(Node: `crypto.randomBytes`)로 만들고, 원서는 최소 128비트(예제는 160비트) 엔트로피를 권합니다. "OS 엔트로피가 고갈된다"는 걱정은 근거 없는 속설이니 OS 난수기를 믿으세요.

**DB에 저장하는 토큰은 해시로 저장**: 토큰 테이블이 유출돼도 그대로 재사용되지 못하게, 토큰 원문 대신 SHA-256 해시를 저장하고 조회 시 들어온 토큰을 해시해 비교합니다. (토큰은 충분히 긴 랜덤 값이므로 비밀번호처럼 느린 해시가 필요 없습니다.) 원서는 한 걸음 더 나아가, 서버만 아는 비밀 키로 만든 HMAC 태그를 토큰 뒤에 붙여 위조·DB 삽입 공격도 막고, 태그 검증도 상수 시간 비교로 하라고 설명합니다. 또 만료된 토큰은 주기적으로 삭제해 테이블 폭증(DoS)을 막습니다.

```ts
import { randomBytes, createHash } from 'node:crypto';

const token = randomBytes(32).toString('base64url');           // 클라이언트에 전달
const tokenHash = createHash('sha256').update(token).digest('hex'); // DB에는 해시만 저장
```

**로그아웃**: 서버 측 세션/토큰 레코드를 삭제(폐기)해야 진짜 로그아웃입니다. 클라이언트에서 쿠키만 지우는 것은 충분하지 않습니다.

> 🔗 NestJS 연결: 인증은 `Passport` 전략 + `AuthGuard`로 구현하는 것이 일반적이고, "인증만 채우고 거절은 인가에서" 원칙에 맞게 인증 Guard에서 사용자 정보를 `request.user`에 채운 뒤 별도의 인가 Guard가 판단하도록 나눌 수 있습니다.

> 📖 원문: API Security in Action 3.3.1(Basic)·3.6(401/403 박스), 4.2~4.4(토큰·세션 쿠키·CSRF), 4.6(로그아웃), 5.2(Bearer·Web Storage·XSS), 5.3(토큰 해시·HMAC) / Okta Ch.5(Basic, 401)

---

### 6. CORS와 브라우저 보안 모델

#### 6.1 배경: 동일 출처 정책(SOP)
브라우저는 기본적으로 **다른 출처(origin)의 스크립트가 응답을 읽지 못하게** 막습니다. 출처 = **프로토콜 + 호스트 + 포트**. (`https://app.example.com`과 `https://api.example.com`은 서로 다른 출처.)

SPA와 API를 분리하는 SaaS에서는 **다른 출처 호출이 일상**이므로 서버가 "이 출처는 허용"이라고 명시해야 합니다. 이것이 <strong>CORS(Cross-Origin Resource Sharing)</strong>입니다.

> 주의: CORS는 **브라우저가 지키는 규칙**입니다. curl·서버·모바일 앱은 CORS를 무시하고 요청합니다. 따라서 CORS는 인증·인가를 대체하지 않습니다.

#### 6.2 Preflight
"단순하지 않은" 요청(JSON Content-Type, `Authorization` 헤더, PUT/DELETE 등)은 브라우저가 먼저 **`OPTIONS` 요청**(preflight)으로 물어봅니다. 요청에는 `Origin`, `Access-Control-Request-Method/Headers`가 실려 있고, 서버가 허용 헤더로 답하면 본 요청을 보냅니다. 허용하지 않을 출처의 preflight에는 `403`, 허용할 때는 `204`가 관례입니다. preflight에는 자격 증명이 실리지 않으므로 **인증 검사보다 앞에서** 처리해야 합니다.

#### 6.3 주요 응답 헤더

| 헤더 | 의미 |
|---|---|
| `Access-Control-Allow-Origin` | 허용하는 **하나의** 출처(또는 `*`) |
| `Access-Control-Allow-Methods` | 허용 메서드 (preflight 응답) |
| `Access-Control-Allow-Headers` | 허용 요청 헤더 |
| `Access-Control-Allow-Credentials: true` | 쿠키·인증정보 포함 허용. 이때 다른 헤더에 `*` 사용 불가 |
| `Access-Control-Max-Age` | preflight 결과 캐시 시간 |
| `Access-Control-Expose-Headers` | JS가 읽을 수 있는 커스텀 응답 헤더 |

#### 6.4 실수 방지 규칙
- 여러 출처를 허용하려면, **요청의 `Origin`을 신뢰하는 목록과 정확히 비교**한 뒤 일치할 때만 그 값을 그대로 응답에 넣고 `Vary: Origin`을 붙입니다. 아무 값이나 반사(reflect)하면 사실상 전체 허용입니다.
- 쿠키 인증과 함께라면 `*`를 쓸 수 없고 `Allow-Credentials: true`와 정확한 출처가 필요합니다.
- 운영에서 `origin: '*'`나 `origin: true`(모두 허용)를 습관적으로 두지 말고, 환경 변수로 허용 목록을 관리합니다.
- `SameSite` 쿠키는 CORS 정책과 상관없이 크로스 사이트 요청에 쿠키를 붙이지 않습니다(같은 사이트의 하위 도메인은 예외). 서로 다른 사이트 간 쿠키 인증은 성립하기 어렵고 브라우저들이 크로스 사이트 쿠키를 점점 막고 있어, 이 경우 Bearer 토큰 방식이 더 자연스럽습니다. 쿠키 없이 Bearer만 쓰면 `Allow-Credentials`도 필요 없습니다.

```ts
// main.ts
app.enableCors({
  origin: (process.env.CORS_ORIGINS ?? '').split(','),  // ['https://app.example.com', ...]
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: true,          // 쿠키를 쓸 때만
  maxAge: 600,
});
```

> 🔗 NestJS 연결: `app.enableCors()` 또는 `NestFactory.create(AppModule, { cors: {...} })`. 허용 출처는 `ConfigService`로 환경별 주입.

> 📖 원문: API Security in Action 5.1

---

### 7. 비밀번호 저장, 시크릿(API 키·토큰) 관리

#### 7.1 비밀번호는 "느린 전용 해시"로
평문은 물론이고 SHA-256 같은 **빠른 해시도 부적합**합니다(초당 수십억 번 대입 가능). 공격자가 DB를 훔쳤다고 가정하고 설계합니다.

- 사용할 것: **Argon2, scrypt, bcrypt, PBKDF2** — 일부러 시간·메모리를 많이 쓰게 만든 알고리즘. 원서(3.3.2)는 scrypt를 예제로 쓰고 NIST도 메모리 집약형 해시를 권한다고 소개합니다. (보충) 새로 고른다면 Argon2id가 흔한 선택입니다.
- 라이브러리가 **솔트(salt)를 자동 생성·포함**하도록 사용. 솔트는 같은 비밀번호도 다른 해시가 되게 해 레인보 테이블을 막고, 해시 문자열에 파라미터·솔트가 함께 들어 있어 검증 시 그대로 사용됩니다.
- 비용(파라미터)은 원서 기준 로그인 1회에 100ms 안팎(scrypt N=32768, r=8, p=1, 메모리 약 32MiB)이 걸리는 수준입니다. 이런 보안 기본값은 성능 문제가 확인되기 전까지 낮추지 마세요. (보충) 주기적으로 상향하고 로그인 시 재해싱합니다.
- (보충) 로그인 실패 시 "아이디가 없음"과 "비밀번호 틀림"을 **구분하지 않는 동일 메시지**를 반환 (계정 존재 여부 노출 방지). Rate limit과 함께 무차별 대입 방어.
- 비밀번호 해시 연산은 CPU를 크게 씁니다(원서 3.2: 인증 자체도 비쌈) → 요청 폭주 시 DoS 소지가 있으므로 Rate limit이 필수. (보충) Node에서는 라이브러리가 워커 스레드/비동기 구현인지 확인(이벤트 루프 블로킹 방지).
- 직접 구현이 부담스럽다면 **외부 IdP(LDAP, SAML, OIDC 등)에 위임**하는 것도 방법입니다(원서 3.3.2 TIP). 비밀번호 보관 책임 자체를 없앨 수 있습니다.

```ts
import * as argon2 from 'argon2';

const hash = await argon2.hash(password);              // 솔트·파라미터 포함된 문자열
const ok = await argon2.verify(hash, inputPassword);   // 검증
```

#### 7.2 시크릿은 코드에 넣지 않는다
- API 키·DB 비밀번호·JWT 서명 키를 **소스코드/Git에 넣으면** 저장소에 접근 가능한 모든 사람과 미래의 유출 사고에 노출됩니다. 공개 저장소의 키를 자동 스캔해 악용하는 봇이 실제로 존재합니다.
- **환경 변수**로 주입합니다(Okta Ch.4: 소스에서 분리해 설정 관리·시크릿 관리 도구로 다룸). (보충) Secrets Manager/Vault 같은 시크릿 저장소도 좋고, `.env`는 `.gitignore`에 넣습니다.
- 유출을 대비해 **키 교체(rotation) 절차**를 미리 만들어 둡니다. 여러 키가 동시에 유효하도록(신규 발급 → 전환 → 구 키 폐기) 지원해야 무중단 교체가 가능합니다. 직원 퇴사 시에도 교체.
- 저장소 스캐닝으로 유출된 키를 조기에 발견(Okta Ch.4). (보충) gitleaks 같은 도구를 CI에 넣습니다.
- (보충) 로그에 토큰·비밀번호·카드번호가 찍히지 않게 마스킹.

#### 7.3 우리 API를 위한 API 키 설계 (서비스가 외부에 API를 제공할 때)
- 고객용 API 키는 OS 난수원(Node: `crypto.randomBytes`)으로 생성한 **충분히 긴 랜덤 값**(예측 가능한 값·순번 금지). Okta 책이 Stripe의 `sk_test_…` 같은 불투명 토큰을 예로 듭니다. (보충) 이런 접두사는 유출 스캔과 운영을 쉽게 해 줍니다.
- **DB에는 해시만 저장**(원서 5.3.1: 고엔트로피 토큰이라 SHA-256 같은 빠른 해시로 충분). (보충) 발급 시 딱 한 번만 원문을 보여줍니다.
- 여러 키를 동시에 발급·사용할 수 있게 해 무중단 교체(로테이션)를 지원합니다(Okta Ch.4). (보충) 키마다 소유 테넌트, 권한 범위(scope), 생성일, 마지막 사용일, 만료일을 함께 저장합니다.
- 전달은 **`Authorization: Bearer` 헤더**로(RFC 6750). URL 쿼리에 키를 넣으면 접근 로그·캐시에 남습니다.
- Okta Ch.4의 선택 기준: 최종 사용자를 대신해 동작하는 앱을 위한 API는 OAuth 2.0 리소스 서버로, 자동화 소프트웨어용 API는 클라이언트별 API 토큰으로 보호합니다. Bearer 토큰을 JWT로 발급하면 API 토큰으로 시작했다가 나중에 OAuth 2.0으로 올라가는 경로가 깔끔합니다.
- 고급 옵션(Okta): 정기적·자동 토큰 로테이션(퇴사자 발생 시 즉시 교체), GitHub 등에서 유출된 키를 스캔해 자동 비활성화, 토큰을 TLS 세션에 묶는 채널 바인딩(원서도 "새로 떠오르는 기법" 수준으로만 소개).

> 🔗 NestJS 연결: `@nestjs/config`의 `ConfigModule`로 환경 변수를 검증(Joi/zod)하며 로드하고, API 키 인증은 커스텀 `Guard`(헤더 파싱 → 해시 조회 → `request`에 테넌트/scope 세팅)로 구현합니다.

> 📖 원문: API Security in Action 3.3.2~3.3.4(비밀번호 해시·솔트), 5.3.1(토큰 해시) / Okta Ch.4(자격 증명 관리)

---

### 8. JWT (JSON Web Token) 구조와 주의점

#### 8.1 구조
JWT는 `.`로 구분된 3부분입니다 (각각 Base64url 인코딩).

```
header.payload.signature
{"alg":"HS256","kid":"key-1"} . {"sub":"u_123","exp":1750000000,...} . <서명>
```

- **Header**: 서명 알고리즘(`alg`), 키 ID(`kid`) 등 메타데이터
- **Payload(Claims)**: 내용. 서명만 된 JWT는 **암호화가 아니므로 누구나 디코딩해 읽을 수 있습니다.** 비밀번호·민감 개인정보를 넣지 마세요.
- **Signature**: 위조·변조 방지(서명 검증 시 알 수 있음)

JWT는 "서명된(signed)" 것이지 "숨겨진" 것이 아닙니다. 원서(6.2, 6.3)는 내용을 감추고 싶다면 JWE(암호화된 JWT)를 쓸 수 있다고 하지만, 우선은 민감 정보를 넣지 않는 쪽을 권합니다. JWT는 JOSE 표준군(JWS 서명, JWE 암호화, JWK 키 형식, JWA 알고리즘)의 일부이고, 유연성 때문에 과거에 알고리즘 조작 등 취약점이 여럿 나왔다는 점이 원서의 경고입니다.

#### 8.2 표준 claim

| Claim | 의미 | 검증 포인트 |
|---|---|---|
| `iss` | 발급자 | 신뢰하는 발급자와 정확히 일치하는가 |
| `aud` | 대상(수신자) | **우리 API가 aud 목록에 있는가** (다른 API용 토큰 재사용 방지) |
| `sub` | 주체(사용자 ID) | 사용자 식별 |
| `exp` | 만료 시각 | 지났으면 거부 (수명은 짧게) |
| `nbf` | 이 시각 이전엔 무효 | - |
| `iat` | 발급 시각 | - |
| `jti` | 토큰 고유 ID | 재사용(replay) 탐지·폐기 목록에 활용 |

#### 8.3 반드시 알아야 할 함정

1. **`alg` 헤더를 그대로 믿지 말 것.** 2015년 여러 JWT 라이브러리에서 공격자가 `alg: none`(서명 검증 안 함) 등으로 바꿔 검증을 우회할 수 있었습니다. 서명을 확인하기 전에는 토큰의 주장을 믿을 수 없는데 알고리즘 정보가 그 토큰 안에 있다는 것이 문제입니다. <strong>서버가 허용 알고리즘을 고정(allowlist)</strong>하고, 알고리즘을 키에 묶어 서버 쪽에 두세요(원서의 "키 기반 알고리즘 결정").
2. **`jwk`/`jku` 헤더로 "검증용 키를 토큰이 알려주게" 하지 말 것.** 공격자가 자기 키를 넣으면 무엇이든 통과됩니다. `jku`는 추가로 SSRF 위험도 있습니다. 안전한 것은 키 ID인 `kid`뿐이며, 서버 측 키 저장소에서 찾아 씁니다. X.509 관련 헤더도 복잡하니 피하라고 합니다.
3. **직접 구현하지 말고 검증된 라이브러리 사용**(활발히 유지되고 과거 JWT 취약점을 아는 것). 검증 시 서명, `exp`, `iss`, `aud`를 모두 확인합니다. 특히 `aud`에 우리 API가 있어야 합니다.
4. **수명은 짧게** 하고(원서 예제는 10분. Okta는 은행·의료 쓰기 작업이면 5~10분 주기의 교체가 필요할 수 있다고 함), 갱신은 리프레시 토큰으로.
5. **폐기(revocation)가 어렵다**: 서버에 상태를 안 두는 것이 JWT의 장점이자 약점. 발급된 토큰은 만료 전까지 유효합니다(Okta도 같은 지적).
6. 서명 키(비밀)는 코드에 넣지 말고, **키 로테이션**을 위해 `kid`를 사용.
7. 비대칭 서명(RS256/ES256 등)이면 **공개키만으로 검증**이 가능해, 여러 API가 검증하기 쉽고 비밀 키는 발급 서버(AS)만 가집니다(원서 7.4.2). 공개키는 JWK Set 주소에서 가져오게 할 수 있습니다. 대칭(HS256)은 검증하는 쪽도 비밀을 가져야 하고, 그러면 위조도 가능해집니다.
8. jwt.io 같은 사이트에 운영 토큰이나 키를 붙여 넣지 마세요. JWT는 자격 증명입니다.

```ts
import { JwtService } from '@nestjs/jwt';

// 발급
const accessToken = await jwt.signAsync(
  { sub: user.id, tid: user.tenantId, scope: 'orders:read' },
  { algorithm: 'HS256', expiresIn: '10m', issuer: 'https://api.example.com', audience: 'my-api' },
);

// 검증: 알고리즘·issuer·audience를 명시
const payload = await jwt.verifyAsync(token, {
  algorithms: ['HS256'],                 // allowlist — 토큰 헤더가 정하게 두지 않음
  issuer: 'https://api.example.com',
  audience: 'my-api',
});
```

#### 8.4 토큰 폐기(Revocation) 전략

| 방법 | 설명 | 특징 |
|---|---|---|
| 허용 목록(Allowlist) | DB/Redis에 유효한 `jti`만 저장, 조회해 확인 | 즉시 폐기, 사실상 서버 상태(세션과 유사) |
| 차단 목록(Blocklist) | 폐기된 `jti`만 저장, 만료 시점까지만 보관 | 목록이 작음, 짧은 수명과 궁합 좋음 |
| 사용자 단위 무효화 | "사용자 X의 시각 T 이전 토큰은 무효" 기록 | 비밀번호 변경·전체 로그아웃에 유용 |
| 짧은 수명 + 리프레시 | 액세스 토큰 5~15분, 갱신 시 정책 재확인 | 재로그인 부담 없이 위험 창 축소 |
| **하이브리드(권장)** | JWT 형식 + 서버 측 상태 확인(`jti`를 허용 목록에 저장) | 즉시 폐기 가능, 원서가 "가장 단순하고 안전한 기본값"이라 부름. 민감도가 낮은 작업은 JWT만 보고 처리해 DB 조회를 아낄 수도 있음 |

원서 6.5의 사례: 2018년 Facebook 사고에서 토큰 9천만 개를 한꺼번에 폐기해야 했는데, 이런 재난 상황에서 만료를 기다리거나 차단 목록이 갑자기 커지는 것은 곤란합니다.

현실적 결론: 민감한 SaaS에서는 **짧은 액세스 토큰 + 회전(rotation)하는 리프레시 토큰 + 서버 측 폐기 수단**을 조합합니다. 리프레시 토큰을 "한 번 쓰면 새것으로 교체"하면, 탈취된 토큰이 사용되는 순간 정상 사용자의 토큰이 실패해 이상 징후를 탐지할 수 있습니다(원서 7.3.3). 또 리프레시 시 인가 정책이 다시 평가되는 이점도 있습니다(Okta Ch.4).

> 🔗 NestJS 연결: `@nestjs/jwt` + `passport-jwt` 전략. 전략 옵션에서 `algorithms`, `issuer`, `audience`, `ignoreExpiration: false`를 명시하세요.

> 📖 원문: API Security in Action 6.1(클라이언트 측 토큰), 6.2(JWT·표준 claim·헤더·알고리즘), 6.5(폐기·하이브리드), 7.4.2(공개키 검증) / Okta Ch.4(토큰 종류·JWT 권장), Ch.5(토큰 폐기 한계)

---

### 9. OAuth 2.0 / OpenID Connect 핵심 흐름

#### 9.1 OAuth2가 푸는 문제
"내 비밀번호를 서드파티 앱에 주지 않고, **범위가 제한된 임시 권한(토큰)만** 위임하자." 호텔 키카드에 비유하면 체크인(인증) 후 받은 카드로 내 방과 헬스장만 열 수 있는 것과 같습니다.

**OAuth2는 인증 프로토콜이 아니라 "위임된 인가" 프레임워크입니다.** 사용자가 누구인지는 OpenID Connect(OIDC)가 담당합니다.

#### 9.2 등장인물

| 역할 | 설명 |
|---|---|
| Resource Owner | 사용자(데이터의 주인) |
| Client | 접근하려는 앱 |
| Authorization Server (AS) | 로그인·동의를 받고 토큰을 발급 (Auth0, Okta, Keycloak, Cognito 등) |
| Resource Server (RS) | 보호되는 API. 토큰을 검증하고 응답 — **우리가 만드는 백엔드가 보통 이쪽** |

클라이언트 종류:
- **Confidential**: 서버에서 실행되어 시크릿을 안전히 보관 가능 (일반 웹 백엔드)
- **Public**: 브라우저 SPA, 모바일 앱 등. 코드가 사용자 기기에 있어 **시크릿을 넣어도 추출됨** → 시크릿에 의존하지 않고 PKCE 사용

#### 9.3 토큰 종류
- **Access token**: API 호출용. **수명 짧게**(분~시간). `Authorization: Bearer`로 전송
- **Refresh token**: 새 액세스 토큰을 받기 위한 장수 토큰. AS에만 제시. 사용 시마다 새것으로 교체하면 탈취 탐지에 유리
- **ID token (OIDC)**: "누가 언제 어떻게 로그인했는가"를 담은 **JWT**. 클라이언트가 사용자 식별용으로 읽음. API 호출용이 아님

#### 9.4 Authorization Code + PKCE (가장 권장되는 흐름)

```
1. 클라이언트: code_verifier(랜덤) 생성 → code_challenge = SHA256(code_verifier)
2. 브라우저를 AS로 리디렉트:
   /authorize?response_type=code&client_id=…&redirect_uri=…&scope=…
             &state=<랜덤>&code_challenge=…&code_challenge_method=S256
3. AS가 사용자 로그인 + 동의 화면
4. AS가 redirect_uri로 되돌려 보냄: ?code=…&state=…
5. 클라이언트가 state 일치 확인
6. 클라이언트가 (백채널, 서버→서버 HTTPS)로 토큰 엔드포인트 호출:
   grant_type=authorization_code&code=…&redirect_uri=…&code_verifier=<원문>
   (+ confidential이면 client 인증)
7. AS가 code_verifier의 해시가 code_challenge와 같은지 확인 → access/refresh(/id) token 발급
```

각 파라미터의 목적:
- **`state`**: 로그인 CSRF 방지. 보낸 값과 돌아온 값이 같아야 함
- **`redirect_uri` 사전 등록**: 오픈 리디렉트/코드 탈취 방지. 등록된 값과 정확히 일치할 때만 허용
- **PKCE(`code_challenge`/`code_verifier`)**: 인가 코드를 가로채도 원본 verifier가 없으면 토큰으로 못 바꿈. **모든 종류의 클라이언트에 사용 권장**
- 인가 코드는 **짧은 수명, 1회용**

#### 9.5 다른 grant 정리

| Grant | 용도 | 비고 |
|---|---|---|
| Authorization Code (+PKCE) | 사용자가 있는 웹/모바일/SPA | **기본 선택** |
| Client Credentials | 사용자 없이 서버↔서버 (배치, 마이크로 서비스, 내부 연동) | 클라이언트 ID/시크릿으로 토큰 발급 |
| Device Code | TV·CLI처럼 입력이 불편한 기기 | 보조 코드를 다른 기기에서 입력 |
| Implicit | 옛 SPA용 | **사용 금지 권고** (토큰이 URL 조각에 실려 스크립트·기록으로 유출). CORS가 없던 시절 때문에 생긴 방식이라 지금은 불필요 |
| Resource Owner Password | ID/비번을 클라이언트에 직접 전달 | **사용 금지 권고** (원서: 테스트용 정도, 표준에서 사라질 수 있음) |

> 참고: Okta 책(Ch.5)은 백엔드 없는 SPA에는 Implicit 흐름만 쓸 수 있다고 적었는데, 이는 오래된 서술입니다. API Security in Action(7.2~7.3)은 SPA도 Authorization Code + PKCE를 쓰라고 하며 이쪽이 최신 권고입니다.

#### 9.6 API(Resource Server)의 토큰 검증
- **JWT 액세스 토큰**: AS의 JWKS(JWK Set, 공개키 집합) 주소에서 키를 받아 서명 검증 + `iss`, `aud`, `exp`, `scope` 확인. 네트워크 호출 없이 빠름. 단, 폐기 즉시 반영은 어려움
- **불투명(opaque) 토큰 + Introspection**(RFC 7662): API가 AS의 introspection 엔드포인트에 자신의 클라이언트 자격 증명으로 "이 토큰 유효한가?"를 물어봄. 응답의 필수 필드는 불리언 `active`이고 `scope`, `sub`, `client_id`, `exp` 등은 선택이라 없을 수 있음(없으면 거부하는 쪽이 안전). 폐기 즉시 반영되지만 호출 비용/결합도가 생기므로 짧게 캐시할 수 있고, 캐시가 길수록 폐기 인지가 늦어집니다. 토큰을 AS에 보내기 전 길이·문자 형식부터 검증합니다.
- 여러 API를 한 액세스 토큰으로 겸용하지 말고 API별로 따로 발급받는 편이 토큰 탈취 시 피해가 작습니다(원서 7.5).
- 토큰 폐기 엔드포인트(RFC 7009)는 AS에서만 폐기시킵니다 — RS가 AS를 확인하지 않으면 폐기를 모릅니다.
- Discovery 문서(`/.well-known/openid-configuration`)로 엔드포인트 위치를 자동 파악하되, **반드시 신뢰하는 HTTPS URL에서만** 가져옵니다.

#### 9.7 OIDC (OpenID Connect)
OAuth2 위에 **"로그인(인증)" 표준**을 얹은 것입니다.
- `scope=openid profile email` 요청 → **ID token**과 UserInfo 엔드포인트로 사용자 정보 획득
- ID token 검증: 서명, `iss`, `aud`(내 client_id), `exp`, **`nonce`(요청 때 보낸 값과 일치 — 재사용 방지)**, 필요 시 `auth_time`/`acr`/`amr`(인증 방법·시점). 원서(7.6.2)에 따르면 Authorization Code + PKCE 흐름에서는 토큰 엔드포인트에서 직접 받으므로 이런 검증 부담이 줄고, `nonce`는 주로 ID token이 리디렉션 URL로 오는 hybrid/implicit 흐름에서 중요합니다. 요청 파라미터는 사용자가 바꿀 수 있으니 인증 강도 요구는 ID token 값으로 다시 확인합니다.
- **ID token을 API 접근용으로 쓰지 마세요**(원서 7.6.3). 범위(scope) 없이 신원만 다루는 토큰이고, 클라이언트를 audience로 발급한 것이라 API는 audience에 자신이 없는 JWT를 거부해야 합니다. "ID token은 사용자 이름, 액세스 토큰은 비밀번호"에 비유됩니다.
- "Google로 로그인", 기업 SSO(Okta, Azure AD 등)가 이 방식
- **SSO(Single Sign-On)**: 한 번 로그인으로 여러 앱을 사용. 인증을 하나의 IdP에 위임해, 앱은 비밀번호를 다루지 않습니다.
- 선택 가이드: 서버 사이드 웹 앱 → Authorization Code, 모바일/SPA → Authorization Code + PKCE, 서버 간 → Client Credentials.

SaaS 관점: 고객사가 "우리 회사 계정(SSO)으로 로그인하게 해 달라"고 요구하는 일이 매우 흔합니다. 자체 로그인을 만들더라도 OIDC 연동을 붙일 수 있게 구조를 열어 두세요. 직접 AS를 만들기보다 <strong>검증된 IdP(Auth0, Cognito, Keycloak 등)</strong>를 쓰는 편이 안전하고 빠릅니다.

```ts
// NestJS API(리소스 서버): 외부 AS가 발급한 JWT 검증 (jose 라이브러리 예)
import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwks = createRemoteJWKSet(new URL('https://auth.example.com/.well-known/jwks.json'));

async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: 'https://auth.example.com/',
    audience: 'https://api.example.com',
  });
  return payload; // payload.sub, payload.scope 등
}
```

> 🔗 NestJS 연결: 검증 로직을 `AuthGuard`(또는 Passport JWT 전략)에 넣고, 검증된 `sub`/`scope`/`tenant`를 `request.user`에 저장해 이후 Guard·서비스에서 사용합니다.

> 📖 원문: API Security in Action 7.2(클라이언트·grant), 7.3(Authorization Code·PKCE·refresh), 7.4(introspection·JWT 검증), 7.5(SSO), 7.6(OIDC·ID token) / Okta Ch.5(OAuth·OIDC 개요, RFC 7009 폐기)

---

### 10. 인가(Authorization) 모델: Scope, RBAC, ABAC

#### 10.1 인가 실수는 곧 데이터 유출
인증만 통과했다고 모든 데이터를 볼 수 있어선 안 됩니다. 특히 멀티테넌트 SaaS에서는 <strong>"남의 테넌트 데이터 접근"</strong>이 가장 큰 위험입니다. OWASP API Top 10(원서 2.4 표의 2019판)의 1위가 "객체 수준 인가 누락(BOLA)"입니다. (보충) 예를 들면 `GET /invoices/123`에서 **123이 내 것인지 확인하지 않는 실수**입니다. 리소스 ID로 조회할 때는 항상 `tenantId`/소유자 조건을 함께 씁니다. 원서의 예제도 스페이스 접근을 사용자별 권한(ACL)으로 확인합니다.

#### 10.2 Scope와 Permission의 차이

| | Scope | Permission |
|---|---|---|
| 정하는 주체 | 사용자가 서드파티에 **위임**할 때 | 시스템 관리자가 정책으로 부여 |
| 성격 | "어떤 API 동작을 호출할 수 있는가"(예: `orders:read`) | "어떤 객체에 무엇을 할 수 있는가" |
| 설계 기준 | 사용자가 위임하고 싶은 단위 | 조직의 접근 정책 단위 |

- Scope는 토큰에 담겨 "이 토큰으로는 이만큼만"을 정합니다. 예: 회계 앱에는 `transactions:read`만 주고 결제 생성은 못 하게.
- **최종 판단 = 사용자의 권한 ∩ 토큰의 scope**. 원서 예제도 scope 검사와 사용자 권한(ACL) 검사를 둘 다 통과해야 합니다. 토큰에 scope가 있어도 사용자 자신이 그 권한이 없으면 안 되고, 반대도 마찬가지입니다.
- 원서의 구분: 권한(permission)은 API 운영 주체가 정해 사용자가 바꿀 수 없는 것(강제 접근 제어), scope는 사용자가 제3자 앱에 권한 일부를 넘기는 위임(임의 접근 제어)이라는 성격이 다릅니다. 또 scope는 보통 객체를 가리키지 않고 호출 가능한 작업만 제한합니다.
- 네이밍은 `리소스:동작`(`invoice:read`, `invoice:write`) 형태를 일관되게(원서 예: `transactions:read`, Okta 예: `read:playlist`). 구분자는 취향입니다.
- scope를 정할 때는 사용자가 위임하고 싶을 단위로 설계합니다. 시스템 관리형 API는 굵게, 사용자 데이터 API는 세밀하게 나누는 것이 원서의 Google Cloud 예시입니다.
- 함정: 이미 발급된 scope 토큰으로 로그인 엔드포인트를 다시 호출해 더 넓은 scope 토큰을 받는 권한 상승을 막아야 합니다(원서 7.1.1).

#### 10.3 계층형(Hierarchical)
조직도처럼 상위가 하위를 포함하는 모델(Okta Ch.6). 직관적이지만 "이 사람이 이 그룹에 속하는가?"를 재귀 조회하느라 규모가 커지면 느리고 복잡합니다. Okta는 "조직도일 뿐 확장 가능한 인가 모델이 아니다"라고 표현하며 보통 단독 모델로 쓰지 않습니다.

원서(8.1)는 그 대안으로 **그룹**(사용자와 다른 그룹을 멤버로 하는 다대다 집합)을 먼저 소개합니다. 권한을 그룹에 부여하면 관리가 쉬워지지만, 개인에게도 직접 권한을 줄 수 있고 그룹이 조직 전체 기준이라 API에 맞지 않을 수 있어서 RBAC로 넘어갑니다. 그룹 정보는 인증 단계에서 요청 속성으로 채워 두고 인가 단계에서 쓰는 것이 층 분리에 좋습니다.

#### 10.4 RBAC (Role-Based Access Control)

**사용자 → 역할(Role) → 권한(Permission)**. 권한을 사용자에게 직접 주지 않고 역할에 묶습니다.

- 장점: 이해·관리가 쉬움, 광범위·세밀한 정책 모두 표현 가능, "누가 무엇을 할 수 있나" 감사가 쉬움, 권한 변경 시 역할만 수정
- 권한을 사용자에게 직접 붙이지 않게 하면 리뷰가 훨씬 쉬워짐(원서: RBAC 시스템은 보통 개인 직접 권한을 허용하지 않음)
- 역할은 **범위(원서 예: 스페이스, SaaS라면 테넌트/조직/프로젝트) 안에서** 정의됨: "A 워크스페이스의 admin"과 "B 워크스페이스의 admin"은 다름 → 원서 예제는 `user_roles(space_id, user_id, role_id)`와 `role_permissions`. (보충) 테넌트 컬럼 이름은 여기서 옮겨 적용한 것입니다.
- 단점(Okta): 역할이 폭증해 관리가 어렵고, 규모가 커지면 검증·감사가 힘들며, 역할이 일반화되고, 사용자별 데이터 조건(고객이 일시적으로 승인한 은행원 등)은 표현하기 어려움
- 코드에는 역할 이름을 여기저기 흩뿌리지 말고, <strong>역할 → 권한 매핑을 한 곳(테이블/설정)</strong>에 둡니다. 원서는 메서드에 허용 역할을 직접 붙이는 방식과, 역할→권한 표를 두는 방식 두 가지를 소개합니다.
- (원서 8.2.4) 근무 시간에만 부여되는 동적 역할이나 서로 배타적인 역할(직무 분리) 같은 확장도 있지만 표준은 없고, 더 유연한 규칙이 필요하면 ABAC를 씁니다.

```ts
// roles.decorator.ts + roles.guard.ts
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>('roles', [ctx.getHandler(), ctx.getClass()]);
    if (!required) return true;
    const { user } = ctx.switchToHttp().getRequest();
    return required.includes(user.role);   // 기본은 거부, 명시적으로 맞을 때만 허용
  }
}

@Roles(Role.Admin, Role.Owner)
@Delete(':id')
remove(@Param('id') id: string) { /* ... */ }
```

#### 10.5 ABAC (Attribute-Based Access Control)
요청마다 **속성**으로 동적으로 허용/거부를 계산합니다.
- 주체(Subject): 사용자 ID, 부서, 역할, 구독 플랜, 인증 방법/시점
- 자원(Resource): 소유자, 상태, 민감도 등급(공개/비공개)
- 행위(Action): 읽기/수정/삭제/승인
- 환경(Environment): 시간, IP, 기기, 위치

예: Okta 책은 "무료 사용자는 남의 플레이리스트를 편집할 수 없고 유료 회원만 가능", 원서는 "근무 시간 밖에는 중재자가 메시지를 삭제할 수 없다", "상담원은 통화 중인 고객 파일만 열람"을 듭니다. (보충) "문서 작성자 본인만 수정 가능" 같은 소유자 규칙은 같은 유형의 예를 들어 본 것입니다.

- RBAC는 **굵은 단위**(coarse-grained), ABAC는 **세밀한 단위**(fine-grained)에 적합(Okta). ABAC는 구현이 어렵지만 만든 뒤 유지가 쉽고, RBAC는 반대라는 대비도 Okta의 설명입니다.
- **충돌 해결**: 기본은 **거부(default deny)**, 규칙이 충돌하면 **deny가 우선**(deny-overrides)이 가장 안전합니다(원서 8.3.1). 원서 예제는 기존 RBAC 위에 거부 규칙만 얹는 용도라 기본 허용을 택했다는 점도 알아 두세요.
- 구조(Okta): **PEP**(Policy Enforcement Point: 요청을 가로채 인가 요청을 만드는 곳, API에서는 보통 게이트웨이)와 **PDP**(Policy Decision Point: 정책·사용자 정보를 보고 allow/deny를 내리는 곳)로 나눠 생각하면 정책 코드를 분리하기 쉽습니다.
- 실무 조합: Okta의 조언은 "RBAC로 시작하고, 역할·권한이 늘면 ABAC로"입니다. (보충) RBAC 뼈대에 소유자 확인·플랜 제한 같은 ABAC 규칙만 추가하는 방식이 흔합니다.

```ts
// 간단한 정책 함수 (PDP 역할) — 소유자 또는 관리자만 문서 수정
function canEditDocument(user: AuthUser, doc: Doc): boolean {
  if (user.tenantId !== doc.tenantId) return false;       // 1) 테넌트 경계 (항상 먼저)
  if (user.roles.includes('admin')) return true;          // 2) 관리자
  return doc.ownerId === user.id && user.plan !== 'free'; // 3) 소유자 + 플랜 조건
}
```

#### 10.6 권한 상승(Privilege Escalation) 막기
낮은 권한 사용자가 버그를 이용해 자기 또는 타인에게 더 높은 권한을 부여하는 사고입니다. 예: "읽기 권한만 있는 사용자가 멤버 추가 API로 새 계정에 전체 권한을 부여".
- **부여자가 가진 권한 이내로만** 부여할 수 있게 한다 (자기가 못하는 것을 남에게 줄 수 없다)
- 권한을 바꾸는 API는 더 높은 권한(소유자/관리자)만 호출 가능
- 역할·권한 변경은 반드시 감사 로그에 기록

#### 10.7 마무리 조언
- 인가는 만들기 어렵고 요구는 계속 복잡해집니다. 초기에는 RBAC로 시작하되 **스코프/테넌트 경계를 처음부터 모델에 넣으세요**.
- 권한 체크는 컨트롤러 전반에 흩어지지 않게 **Guard/정책 계층에 모으기**.
- **기본 거부(default deny)**. 새 엔드포인트는 명시적으로 열기 전까지 접근 불가.
- 인가 판단 결과(특히 거부)를 로그로 남기고 주기적으로 검토.

> 🔗 NestJS 연결: `Guard` + 커스텀 데코레이터(`@Roles`, `@Permissions`)와 `Reflector`가 표준 패턴입니다. 복잡한 정책은 CASL 같은 라이브러리로 ABAC 스타일을 표현할 수 있습니다.

> 📖 원문: API Security in Action 3.6(401/403·ACL·3.6.5 권한 상승), 7.1(scope와 permission), 8.1(그룹), 8.2(RBAC), 8.3(ABAC) / Okta Ch.6(인가 유형, PEP/PDP, Key Takeaways)

---

### 11. 감사 로그(Audit Log)

**감사 로그 = "누가, 언제, 무엇을 했는가"의 기록.** 원서는 책임 추적(accountability, 부인 방지)의 기반이자 공격 시도의 단서로 봅니다. (보충) 컴플라이언스(SOC2, ISO27001, GDPR 등)에도 필수입니다.

설계 포인트:
- 기록 위치: **인증 뒤(누구인지 알 수 있음), 인가 앞(거부된 시도도 기록)**.
- 요청 **시작과 종료 두 번** 기록하고 같은 <strong>상관 ID(request/audit id)</strong>로 연결. 프로세스가 중간에 죽어도 무엇을 처리 중이었는지 남습니다.
- 원서 예제의 기록 항목: 감사 ID, 메서드, 경로, 사용자 ID, 상태코드, 시각. (보충) SaaS에서는 테넌트, 클라이언트 IP, 변경 전/후 요약도 유용합니다.
- (보충) **비밀번호·토큰·카드번호·개인정보 원문은 기록 금지**(마스킹).
- **감사 테이블에는 외래키 제약을 두지 않기.** 요청 기준으로 기록해야 하므로 다른 데이터와 불일치해도 그대로 남아야 합니다.
- 원서 예제는 앱 DB 계정에 감사 테이블 INSERT/SELECT만 주었고(수정·삭제 없음), 감사 로그는 민감하므로 소수의 신뢰된 사용자만 읽게 하라고 합니다. 이를 (보충) "추가만 가능(append-only)"으로 일반화했습니다.
- **직무 분리(Separation of Duties)**: 가장 강한 권한을 가진 시스템 관리자와 감사 로그를 보는 감사자는 다른 사람이어야 합니다.
- 내구성 있는 저장소(DB·파일 시스템)에 기록해 프로세스가 죽어도 남게 합니다. 운영에서는 중앙 로그 수집·분석 시스템(SIEM)으로 보내 다른 시스템 로그와 함께 상관 분석합니다(원서 3.5, Okta Ch.4).
- 로그 기록 방식에는 HTTP 접근 로그(원서 예제), 비즈니스 이벤트 기록, DB 트리거 기록이 있고, 뒤의 둘은 접근 경로와 무관하게 남지만 세부 정보를 잃을 수 있습니다.
- 사용자 입력이 로그에 들어갈 때 줄바꿈 등을 제거/인코딩해 **로그 주입**(가짜 로그 삽입) 방지. (보충) 구조화 로그(JSON)를 권장.
- 인가 결정(특히 거부)을 로그로 남겨 새로운 사용 패턴·공격에 맞춰 검토합니다(Okta Ch.6 "Log everything").

```ts
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    const base = {
      requestId: req.id, tenantId: req.user?.tenantId, userId: req.user?.id,
      method: req.method, path: req.route?.path, ip: req.ip,
    };
    this.audit.record({ ...base, phase: 'start' });
    return next.handle().pipe(
      tap({
        next: () => this.audit.record({ ...base, phase: 'end', status: ctx.switchToHttp().getResponse().statusCode }),
        error: (e) => this.audit.record({ ...base, phase: 'error', status: e.status ?? 500 }),
      }),
    );
  }
}
```

> 🔗 NestJS 연결: `Interceptor`로 공통 감사 기록을 붙이되, "인가 거부"는 Guard 단계에서 끝나 Interceptor까지 안 올 수 있으니 예외 필터 또는 Guard 내부에서도 거부 로그를 남기세요.

> 📖 원문: API Security in Action 3.5(감사 로그·직무 분리) / Okta Ch.6 (Key Takeaways), Ch.4(SIEM)

---

### 12. API 게이트웨이의 역할 (개념만)

API 게이트웨이/관리 플랫폼은 인증 검증, Rate limiting, IP 필터, 로깅, 요청 변환 같은 **공통 보안 기능을 앞단에서 처리**해 줍니다. 앱 코드마다 반복 구현하지 않아도 되고, PEP 역할도 맡습니다. 다만 게이트웨이가 있어도
- 앱 서버에서의 입력 검증과 **객체 수준 인가**(내 테넌트 데이터인가)는 여전히 직접 해야 하고,
- 게이트웨이가 뚫리거나 잘못 설정돼도 무너지지 않도록 **다층 방어**를 유지해야 합니다.

Okta Ch.7 요약: 게이트웨이는 외부 URL을 내부 엔드포인트에 매핑하고 허용 HTTP 동사·파라미터를 제한해 공격 표면을 줄이며(그래도 입력 검증은 여전히 필요), 트래픽 조절·로깅·개발자 포털도 제공합니다. 접근 관리는 API 키, 게이트웨이 자체 OAuth 서버, 외부 IdP 연동 순으로 정교해지고, 자체 OAuth 서버는 사용자 목록이 어긋나고 보안팀이 감사하기 어렵다는 단점이 있어 IdP 연동이 낫다고 봅니다. Equifax·Panera 사례처럼 공개된 엔드포인트를 예상 밖으로 쓴 대량 유출은 게이트웨이만으로 막지 못하고 인증·인가가 있어야 막을 수 있었다는 점이 핵심입니다.

> 📖 원문: Okta Ch.7 (API Gateways 전반), API Security in Action 3.2 (프록시/게이트웨이에서의 속도 제한)

---

### ✅ 이 부 핵심 체크리스트

- [ ] 모든 통신은 HTTPS(TLS 최신), HSTS 적용, 토큰·민감정보는 URL이 아닌 `Authorization` 헤더로 전달한다.
- [ ] 요청 파이프라인 순서를 지킨다: Rate limit → 인증 → 감사 로그 → 인가. 로그인 등 민감 엔드포인트는 별도 Rate limit + `429`/`Retry-After`.
- [ ] 입력은 **Allowlist 방식**으로 검증(타입·길이·형식), DTO에 없는 필드는 제거한다. 정규식 ReDoS와 파일 업로드를 조심한다.
- [ ] SQL은 **파라미터 바인딩**만 쓴다(ORM의 raw 쿼리 포함). 앱용 DB 계정은 최소 권한으로 분리한다.
- [ ] 응답은 올바른 `Content-Type`과 보안 헤더(`nosniff`, CSP, `no-store`, HSTS), 에러엔 내부 정보·입력값을 싣지 않는다.
- [ ] 세션 쿠키는 `Secure; HttpOnly; SameSite`(+`__Host-`), 로그인 시 세션 ID를 재발급하고, 쿠키 인증에는 CSRF 방어를 함께 쓴다. 토큰을 `localStorage`에 두는 위험을 이해한다.
- [ ] CORS는 허용 출처를 **정확한 목록**으로 관리하고 `*`/전체 반사를 피한다. CORS는 인증·인가를 대체하지 않는다.
- [ ] 비밀번호는 Argon2/bcrypt/scrypt로 해시하고, 시크릿·API 키는 코드에 넣지 않으며 DB에는 해시로 저장, 교체(rotation)가 가능해야 한다.
- [ ] JWT는 `alg`를 서버에서 고정, `exp/iss/aud`를 검증, 짧은 수명 + 리프레시 + 서버 측 폐기 수단을 갖춘다. Payload는 비밀이 아니다.
- [ ] 외부 로그인은 OAuth2 **Authorization Code + PKCE**와 OIDC(ID token, `state`, `nonce`)를 이해하고, Implicit/Password grant는 쓰지 않는다.
- [ ] 인가는 **기본 거부**, RBAC로 시작하고 필요한 곳에 ABAC(소유자·플랜 조건)를 더하며, 모든 리소스 조회에 **테넌트 경계**를 포함한다. 권한 상승 경로를 점검한다.
- [ ] 인증·인가 이벤트(특히 거부)와 권한 변경을 감사 로그로 남기고, 로그에는 시크릿·개인정보를 넣지 않는다.
