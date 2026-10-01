---
title: "10장. 고객 아이덴티티: Amazon Cognito"
---

# 10장. 고객 아이덴티티: Amazon Cognito

> **이 장에서 다루는 것**
> - **사용자 풀(인증)** 과 **자격 증명 풀(인가)** 이 왜 별개의 서비스인지, 언제 하나만 쓰고 언제 둘을 이어 붙이는지
> - CLI로 ShopMini 고객용 사용자 풀과 앱 클라이언트를 만들고, **앱 클라이언트 시크릿을 둘지 말지**를 결정하는 기준
> - 관리자 생성 / 셀프 가입 + 관리자 확인 / 셀프 가입 + 셀프 확인 — 가입·확인 3가지 패턴의 실습
> - 서버 사이드 `ADMIN_USER_PASSWORD_AUTH` vs 클라이언트 사이드 `USER_SRP_AUTH` — 퍼블릭 클라이언트에 시크릿을 두면 무슨 일이 벌어지는가
> - 그룹 우선순위(precedence) → `cognito:groups` 클레임 → IAM 역할 매핑으로 이어지는 인가 사슬
> - 소셜/기업 IdP 페더레이션과 리디렉트 URI 검증, Lambda 트리거로 가입·토큰 발급에 개입하기
> - 토큰 만료·리프레시 토큰 폐기·계정 열거 방지·위협 보호 — 운영에서 반복되는 설정 실수 목록
>
> **선행 지식**: 6장(인증 vs 인가), 7장(정책 평가·Condition 키), 8장(`sts:AssumeRoleWithWebIdentity`·신뢰 정책), 9장(SAML/OIDC 페더레이션 원리)
> **난이도**: ★★☆

---

9장까지는 **우리 조직 사람**이 AWS를 쓰는 이야기였습니다. 직원이 기업 IdP로 로그인해 IAM Identity Center를 거쳐 계정에 들어가는 경로. 이 장에서 다루는 대상은 다릅니다. ShopMini에서 물건을 사는 **고객 수십만 명**입니다. 이들은 AWS 계정을 갖지 않고, IAM 사용자도 아니며, 콘솔에 로그인하지 않습니다.

원서는 이 구분을 먼저 세웁니다.

> 📖 *Practical Cloud Security* 2판 4장 「Authentication」은 인증 대상을 셋으로 나눕니다. **"조직의 직원을 클라우드 제공자에 대해 인증하는 것은 B2B(business-to-business) 인증에 해당하며, 그 클라우드 서비스는 흔히 'Cloud IAM' 같은 이름으로 불린다. 조직의 고객을 클라우드에서 돌아가는 우리 애플리케이션에 대해 인증하는 것은 흔히 B2C(business-to-consumer) 인증이라 부르고, 그 클라우드 서비스는 'Customer IAM' 또는 'CIAM' 같은 이름으로 불린다. 조직의 직원을 우리 애플리케이션에 대해 인증하는 것은 흔히 B2E(business-to-employee) 인증이라 부르며, B2C와 같은 서비스를 쓸 수도 있고 'Workforce Identity' 같은 이름으로 불릴 수도 있다."**
>
> 그리고 표 4-2에서 AWS의 "고객 및 워크포스 아이덴티티 관리 클라우드 서비스"로 **Amazon Cognito**를 지목합니다.

즉 6~9장은 B2B, 이 장은 **B2C(와 필요하면 B2E)** 입니다. 대상이 다르면 요구사항도 다릅니다. 직원 100명의 접근 회수는 사람이 처리할 수 있지만, 고객 30만 명의 비밀번호 재설정은 자동화되어야 합니다.

그렇다면 "우리가 직접 users 테이블 만들면 되지 않나"라는 질문이 남습니다. 원서는 이 질문에 두 번 답합니다.

> 📖 *Practical Cloud Security* 1판·2판 4장: **"고객 아이덴티티 관리를 데이터베이스에 비밀번호와 함께 행을 만드는 식으로 직접 할 수는 있지만, 이는 최종 사용자에게 이상적인 경험이 아닌 경우가 많다. 로그인과 비밀번호를 하나 더 관리해야 하기 때문이다. 게다가 비밀번호를 검증할 때 피해야 할 심각한 보안 함정들이 있다."** 대안은 둘 — 기존 아이덴티티 서비스(페이스북·구글 등)를 쓰거나, **"애플리케이션 고유의 고객 아이덴티티를 쓰되 그 아이덴티티를 관리하는 것은 클라우드 서비스에 맡기는 것"** 입니다. 2판은 여기에 한 문장을 덧붙입니다. **"사용자는 여전히 자격 증명을 하나 더 다뤄야 하지만, 적어도 그 자격 증명을 검증하는 일은 당신이 하지 않아도 된다."**
>
> 2판 4장 「Verifying Passwords」의 결론은 더 직설적입니다. **"클라우드 서비스와 애플리케이션에서는 가능한 한 다른 제공자의 페더레이티드 아이덴티티나 소비자/직원 IAM 클라우드 서비스를 쓰라. (…) 좋은 대안이 없는 경우가 아니라면 비밀번호 해시를 직접 저장하고 검증하지 말라."** 2판 2장은 자산 관리 관점에서 같은 결론에 도달합니다 — 직접 보관한 비밀번호 해시는 **"공격자에게 좋은 표적"** 입니다.

Cognito가 정확히 그 "클라우드 서비스"입니다.

> 📖 *AWS Security Cookbook* 3장 「User Pools and Identity Pools with Cognito」 도입부: **"Cognito는 아마존의 서버리스 사용자 아이덴티티 관리 서비스다. Amazon Cognito는 아이덴티티 제공자(identity provider)로도, 아이덴티티 브로커(identity broker)로도 쓸 수 있다. 아이덴티티 제공자로서 Cognito는 우리 자신의 사용자 풀을 관리할 수 있게 해준다. 아이덴티티 브로커로서 Cognito는 Amazon, Google, Facebook, Twitter 같은 다른 아이덴티티 제공자를 활용할 수 있게 돕는다."** 저자는 이 장이 인프라 보안이 아니라 **"사용자 풀, 사용자 가입, 인증·인가 플로우, 페더레이티드 아이덴티티 로그인 같은 애플리케이션 보안 개념"** 을 다룬다고 명시합니다.

> 💡 **원서 이후 변경** — *AWS Security Cookbook*은 2020년에 쓰였고, 3장의 실습은 대부분 구 Cognito 콘솔("Manage User Pools" / "Manage Identity Pools" 두 버튼으로 갈라지는 화면)을 전제합니다. 그 콘솔은 이후 전면 개편되어 두 풀이 하나의 내비게이션으로 통합됐고, 호스팅 UI는 **매니지드 로그인(Managed login)** 으로, "고급 보안 기능"은 **위협 보호(Threat protection)** 로 바뀌었으며, 사용자 풀에 **기능 플랜(Lite / Essentials / Plus)** 등급이 생겼습니다. 그래서 이 장은 **콘솔 클릭 순서 대신 CLI/API 파라미터**를 기준으로 서술합니다. 파라미터는 화면보다 훨씬 안정적이고, 어차피 IaC로 관리해야 할 대상이기 때문입니다. 개별 변경 사항은 해당 절의 💡 박스에서 짚습니다.

---

## 10.1 사용자 풀 vs 자격 증명 풀

Cognito라는 이름 하나에 서로 다른 두 서비스가 들어 있습니다. AWS CLI에서도 명령이 갈라집니다 — `aws cognito-idp`(사용자 풀)와 `aws cognito-identity`(자격 증명 풀)는 아예 다른 API입니다.

### 한 줄 정의

| | 사용자 풀 (User Pool) | 자격 증명 풀 (Identity Pool) |
|---|---|---|
| CLI 네임스페이스 | `aws cognito-idp` | `aws cognito-identity` |
| 담당 | **인증(Authentication)** — 너는 누구인가 | **인가(Authorization)** — AWS에서 무엇을 할 수 있는가 |
| 실체 | 사용자 디렉터리 + OIDC 제공자 | 토큰 → AWS 자격 증명 교환기 |
| 출력물 | **JWT 3종** — ID · Access · Refresh 토큰 | **STS 임시 자격 증명** — AccessKeyId · SecretAccessKey · SessionToken |
| 소비처 | 우리 앱 / API Gateway / ALB | S3, DynamoDB 등 **AWS 서비스 직접 호출** |
| 내부 동작 | 자체 사용자 저장소, 비밀번호 해시 관리 | `sts:AssumeRoleWithWebIdentity` |
| 없어도 되나 | 외부 IdP만 쓸 거면 생략 가능 | **대부분의 앱에서 필요 없음** |

원서가 두 개념을 구분하는 방식과도 맞아떨어집니다.

> 📖 *Practical Cloud Security* 2판 4장: **"아이덴티티 저장소 — 모든 아이덴티티를 담고 있는 데이터베이스 — 와, 사용자를 인증하고 신원을 검증하는 데 쓰이는 프로토콜(OpenID, SAML, LDAP 등)을 구분하는 것이 중요하다."**

사용자 풀은 그 "아이덴티티 저장소"이자 OIDC 제공자입니다. 자격 증명 풀은 저장소가 아니라 **브로커**입니다. 자기 사용자를 갖지 않고, 남이 발급한 토큰을 받아 AWS 자격 증명으로 바꿔줄 뿐입니다.

### 흐름도

```text
[① 인증] ─ 사용자 풀만으로 끝나는 구간
   브라우저/앱 ──── InitiateAuth (USER_SRP_AUTH) ────▶ Cognito 사용자 풀
              ◀─── IdToken · AccessToken · RefreshToken (JWT) ────┘

[② 앱 API 인가] ─ 대부분의 3-tier 앱은 여기서 끝난다
   브라우저 ── Authorization: Bearer <AccessToken> ──▶ CloudFront → ALB → 앱(8443)
                                                        │
                                    JWKS로 서명 검증 + iss/aud/token_use/exp 확인
                                    + scope · cognito:groups 클레임으로 권한 판정
                                                        ▼
                                                  RDS 3306 / S3 (앱의 IAM 역할로)

[③ AWS 자격 증명 발급] ─ 클라이언트가 AWS를 "직접" 호출해야 할 때만
   앱 ── GetId + GetCredentialsForIdentity(IdToken) ──▶ Cognito 자격 증명 풀
                                                          └ sts:AssumeRoleWithWebIdentity
      ◀── AccessKeyId · SecretAccessKey · SessionToken ───┘
   앱 ──── PutObject ────▶ s3://shopmini-uploads/private/<identity-id>/photo.jpg
```

핵심은 **②에서 끝나느냐, ③까지 가느냐**입니다. ShopMini의 표준 구성(CloudFront → ALB → 앱 → RDS/S3)에서는 **②에서 끝납니다.** 브라우저는 앱 API만 호출하고, S3 접근은 앱이 자기 인스턴스 프로파일(8장)로 처리하거나 프리사인드 URL을 발급해 주면 됩니다. 자격 증명 풀은 필요 없습니다.

③이 필요한 경우는 좁습니다. **모바일 앱이 대용량 파일을 S3에 직접 올려야 할 때**, 또는 클라이언트가 AWS SDK로 Kinesis·DynamoDB를 직접 때려야 할 때. 이때 자격 증명 풀은 "사용자별로 S3 프리픽스를 격리"하는 아주 강력한 도구가 됩니다(10.5).

### 선택 결정표

| 요구사항 | 사용자 풀 | 자격 증명 풀 | 비고 |
|---|---|---|---|
| 고객 회원가입·로그인·비밀번호 재설정 | 필수 | 불필요 | |
| API Gateway / ALB에서 JWT 검증 | 필수 | 불필요 | ALB OIDC 인증도 사용자 풀 대상 |
| 소셜 로그인(Google/Facebook/Apple)만 제공 | 선택 | 선택 | 사용자 풀을 두면 사용자 병합·속성 정규화가 쉬움 |
| 기업 AD/Okta 직원 로그인(B2E) | 필요 | 불필요 | 사용자 풀에 SAML IdP 연결 |
| 브라우저·모바일이 S3에 **직접** 업로드 | 필요 | 필요 | 프리사인드 URL로 대체 가능하면 대체 |
| 로그인하지 않은 게스트에게 제한적 AWS 접근 | 불필요 | 필요(미인증 아이덴티티) | 기본값 비활성 권장 |
| AWS 콘솔·CLI 접근이 필요한 대상 | **Cognito 아님 → 9장** | | IAM Identity Center를 쓸 것 |

마지막 행이 중요합니다. **직원에게 AWS 계정 접근을 주려고 Cognito를 쓰지 마십시오.** 그것은 9장의 IAM Identity Center 영역입니다. Cognito는 "우리 애플리케이션의 사용자"를 위한 서비스입니다.

MFA에 대해서도 9장의 기준선이 그대로 적용됩니다.

> 📖 *Practical Cloud Security* 1판·2판 4장: **"다중 인증은 약하거나 탈취된 자격 증명을 막는 최선의 방법 중 하나이며, 제대로 구현하면 사용자에게 아주 작은 부담만 지운다. 표 4-2에 나온 아이덴티티 서비스 대부분은 다중 인증을 지원한다."**

Cognito도 그중 하나입니다. 10.2에서 TOTP MFA를 함께 켭니다.

---

## 10.2 사용자 풀 생성과 앱 클라이언트 구성 🧪

### 사용자 풀은 JSON 파일로 만든다

콘솔로 만들면 나중에 무엇을 골랐는지 재현할 수 없습니다. 원서도 CLI에서 파라미터를 하나씩 나열하기보다 입력 JSON을 쓰라고 권합니다.

> 📖 *AWS Security Cookbook* 3장: **"문서를 참고해 모든 사용자 풀 설정을 커맨드라인에서 직접 지정할 수도 있지만, 모든 설정이 명시된 입력 JSON 파일을 쓰는 것이 더 쉽고 더 안전한 접근이다."** 저자는 `generate-cli-skeleton` 하위 명령으로 템플릿을 만든 뒤 `--cli-input-json`으로 넘기는 방식을 소개합니다.

`shopmini-userpool.json`:

```json
{
  "PoolName": "shopmini-customers",
  "UsernameAttributes": ["email"],
  "AutoVerifiedAttributes": ["email"],
  "UsernameConfiguration": { "CaseSensitive": false },
  "Policies": {
    "PasswordPolicy": {
      "MinimumLength": 12,
      "RequireUppercase": true,
      "RequireLowercase": true,
      "RequireNumbers": true,
      "RequireSymbols": true,
      "TemporaryPasswordValidityDays": 3
    }
  },
  "MfaConfiguration": "OPTIONAL",
  "AccountRecoverySetting": {
    "RecoveryMechanisms": [
      { "Priority": 1, "Name": "verified_email" }
    ]
  },
  "AdminCreateUserConfig": { "AllowAdminCreateUserOnly": false },
  "EmailConfiguration": {
    "EmailSendingAccount": "DEVELOPER",
    "SourceArn": "arn:aws:ses:ap-northeast-2:111122223333:identity/no-reply@shopmini.example.com",
    "From": "ShopMini <no-reply@shopmini.example.com>"
  },
  "UserPoolAddOns": { "AdvancedSecurityMode": "ENFORCED" },
  "DeletionProtection": "ACTIVE",
  "UserPoolTags": {
    "Project": "awssec-lab",
    "Chapter": "ch10",
    "AutoDelete": "true"
  }
}
```

```bash
aws cognito-idp create-user-pool \
  --cli-input-json file://shopmini-userpool.json \
  --region ap-northeast-2 \
  --profile awssec-lab
```

응답의 `UserPool.Id`(예: `ap-northeast-2_aBcDeFgHi`)를 이후 모든 명령에 씁니다.

이 JSON에서 **나중에 못 바꾸는 것 3개**를 먼저 짚습니다.

| 필드 | 왜 되돌릴 수 없나 |
|---|---|
| `UsernameAttributes` / `AliasAttributes` | 풀 생성 후 변경 불가. 사용자 이름 체계를 바꾸려면 **풀을 새로 만들고 사용자를 마이그레이션**해야 함 |
| `UsernameConfiguration.CaseSensitive` | 생성 시 한 번만 지정. `true`(기본)로 두면 `Kim@x.com`과 `kim@x.com`이 **서로 다른 계정**이 됨 |
| 필수 속성(`Schema`의 `Required`) | 추가·삭제 불가. 커스텀 속성은 추가만 가능하고 삭제 불가 |

원서도 이름 체계에 함정이 있음을 경고합니다.

> 📖 *AWS Security Cookbook* 3장: **"별칭 속성(alias attributes)이나 사용자 이름 속성(username attributes) 중 하나만 지정할 수 있고, 둘 다는 안 된다. 콘솔에서는 라디오 버튼으로 이것이 강제된다. API(AWS CLI나 AWS SDK)를 쓸 때는 둘 중 하나만 지정하도록 우리가 직접 확인해야 한다."** 콘솔이 막아주던 실수를 CLI·IaC에서는 스스로 막아야 한다는 뜻입니다.

이메일 검증을 켜라는 권고도 원서에 있습니다.

> 📖 *AWS Security Cookbook* 3장: **"이메일 및/또는 전화번호 검증을 추가하는 것이 일반적으로 좋은 관행이다. 계정을 셀프 확인할 수 있게 해주고, 비밀번호를 잊었을 때 재설정할 수 있게 해주기 때문이다. 어떤 형태의 검증도 없으면 사용자는 계정 확인이나 비밀번호 재설정을 위해 관리자에게 연락해야 한다."**

위 JSON의 `AutoVerifiedAttributes: ["email"]`과 `AccountRecoverySetting`이 정확히 그 설정입니다.

TOTP MFA는 별도 API로 켭니다.

```bash
aws cognito-idp set-user-pool-mfa-config \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --mfa-configuration OPTIONAL \
  --software-token-mfa-configuration Enabled=true \
  --region ap-northeast-2 \
  --profile awssec-lab
```

SMS MFA는 SIM 스와핑 위험이 있으므로 TOTP를 우선하고, SMS는 대체 수단으로만 둡니다.

### 앱 클라이언트: 시크릿을 둘 것인가

> 📖 *AWS Security Cookbook* 3장 「Creating an Amazon Cognito app client」: **"앱 클라이언트는 로그인, 가입, 비밀번호 찾기 같은 비인증(unauthenticated) 호출을 수행하는 데 필요하다."**

여기서 "비인증 호출"이란 **아직 로그인하지 않은 상태에서 호출한다**는 뜻입니다. 즉 앱 클라이언트 ID는 애초에 브라우저에 노출될 수밖에 없는 값입니다. 그래서 **클라이언트 ID는 비밀이 아니고, 클라이언트 시크릿은 비밀입니다.** 이 둘을 같은 곳에 두면 안 됩니다.

ShopMini는 앱 클라이언트를 **둘** 만듭니다.

```bash
# ① 퍼블릭 클라이언트 — 브라우저 SPA / 모바일 앱. 시크릿 없음, SRP만 허용
aws cognito-idp create-user-pool-client \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --client-name shopmini-web \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --prevent-user-existence-errors ENABLED \
  --enable-token-revocation \
  --access-token-validity 30 \
  --id-token-validity 30 \
  --refresh-token-validity 7 \
  --token-validity-units AccessToken=minutes,IdToken=minutes,RefreshToken=days \
  --auth-session-validity 3 \
  --region ap-northeast-2 \
  --profile awssec-lab
```

```bash
# ② 컨피덴셜 클라이언트 — 서버 사이드(주문 배치·CS 백오피스). 시크릿 있음
aws cognito-idp create-user-pool-client \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --client-name shopmini-backend \
  --generate-secret \
  --explicit-auth-flows ALLOW_ADMIN_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --prevent-user-existence-errors ENABLED \
  --enable-token-revocation \
  --access-token-validity 15 \
  --id-token-validity 15 \
  --refresh-token-validity 1 \
  --token-validity-units AccessToken=minutes,IdToken=minutes,RefreshToken=days \
  --region ap-northeast-2 \
  --profile awssec-lab
```

시크릿 발급 여부의 판단 기준:

| 클라이언트 유형 | 예시 | 시크릿 | 이유 |
|---|---|---|---|
| **퍼블릭 클라이언트** | 브라우저 SPA, iOS/Android 앱, Electron | **절대 금지** | 배포된 코드는 전부 열람 가능. 시크릿이 아니게 됨 |
| **컨피덴셜 클라이언트** | 서버 렌더링 웹앱, 백엔드 서비스, Lambda | 권장 | 시크릿을 Secrets Manager(11장)에서 읽어 씀 |
| **머신 투 머신(M2M)** | 파트너 시스템의 API 호출 | 필수 | `client_credentials` 그랜트는 시크릿이 있어야 동작 |

시크릿이 있는 클라이언트로 `sign-up`·`initiate-auth`를 호출하면 `SECRET_HASH` 파라미터가 필요합니다. `SECRET_HASH`는 `HMAC-SHA256(사용자이름 + 클라이언트ID, 클라이언트시크릿)`을 Base64로 인코딩한 값입니다. 이 계산을 브라우저에서 하려면 시크릿을 브라우저에 내려야 하고, 그 순간 시크릿은 끝납니다. **"SECRET_HASH를 클라이언트에서 계산해야 하는 상황"이 보이면 클라이언트 유형 선택이 잘못된 것입니다.**

> 💡 **원서 이후 변경** — 원서가 쓰던 `--explicit-auth-flows ADMIN_NO_SRP_AUTH`·`USER_PASSWORD_AUTH` 같은 구식 값 대신, 현재는 `ALLOW_USER_SRP_AUTH`·`ALLOW_USER_PASSWORD_AUTH`·`ALLOW_ADMIN_USER_PASSWORD_AUTH`·`ALLOW_CUSTOM_AUTH`·`ALLOW_REFRESH_TOKEN_AUTH`를 씁니다. **구식 값과 `ALLOW_` 값을 한 클라이언트에 섞어 쓸 수 없습니다.** 또한 원서 시점에는 액세스/ID 토큰 유효 기간이 1시간으로 고정이었지만, 지금은 `--access-token-validity` 등으로 앱 클라이언트마다 지정할 수 있습니다(액세스·ID 토큰 5분~1일, 리프레시 토큰 1시간~10년). `--prevent-user-existence-errors`, `--enable-token-revocation`, `--auth-session-validity`, 사용자 풀의 `--deletion-protection`도 모두 원서 이후에 추가된 파라미터입니다.

---

## 10.3 가입/확인 플로우

Cognito에서 사용자는 **생성(created)** 과 **확인(confirmed)** 이라는 두 단계를 거칩니다. 원서가 이 구조를 정확히 짚습니다.

> 📖 *AWS Security Cookbook* 3장 「User creation and user signups」: **"사용자가 가입하면 관리자가 계정을 승인하거나 사용자가 스스로 확인하기 전까지 계정은 확인되지 않은(not confirmed) 상태다."** 그리고 **"관리자가 임시 비밀번호로 사용자를 생성하면 사용자 상태는 다음 로그인 시 비밀번호를 변경해야 하는 상태로 설정된다."**(실제 상태 값은 `FORCE_CHANGE_PASSWORD`입니다.)
>
> 호출 주체의 차이도 명확합니다. **"관리자가 사용자를 생성하거나 확인할 때는 앱 클라이언트를 지정할 필요가 없다. 그러나 사용자가 셀프 가입이나 셀프 확인을 할 때는 그 사용자가 추가되는 사용자 풀의 앱 클라이언트를 써야 한다. 또한 사용자 생성이나 사용자 승인 같은 관리자 작업에는 AWS 관리자 개발자 자격 증명이 필요하지만, 사용자 셀프 가입이나 셀프 확인에는 프로파일이 필요 없다."**

이 한 문단이 세 패턴의 설계 근거 전부입니다. 관리자 API는 **AWS 자격 증명**으로 호출하고(따라서 서버에서만), 셀프 API는 **앱 클라이언트 ID**로 호출합니다(따라서 어디서든).

### 패턴 A — 관리자 생성 (AdminCreateUser)

가입을 열지 않는 폐쇄형입니다. ShopMini의 판매자 백오피스 계정이 여기 해당합니다.

```bash
aws cognito-idp admin-create-user \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --username seller-ops@partner.example.com \
  --user-attributes Name=email,Value=seller-ops@partner.example.com \
                    Name=email_verified,Value=true \
  --temporary-password 'Tmp!Sh0pMini#2026' \
  --message-action SUPPRESS \
  --region ap-northeast-2 \
  --profile awssec-lab
```

- `--message-action SUPPRESS`: Cognito가 임시 비밀번호를 이메일로 보내지 않습니다. 임시 비밀번호를 평문 이메일로 흘리지 않으려면 이 옵션을 쓰고 별도의 안전한 채널로 전달합니다.
- 생성 직후 상태는 `FORCE_CHANGE_PASSWORD`. 첫 로그인에서 `NEW_PASSWORD_REQUIRED` 챌린지가 반환됩니다(10.4).
- 임시 비밀번호는 `TemporaryPasswordValidityDays`(위 JSON에서 3일) 안에 쓰지 않으면 만료됩니다.

폐쇄형으로 운영하려면 풀 자체에서 셀프 가입을 막습니다.

```bash
aws cognito-idp update-user-pool \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --admin-create-user-config AllowAdminCreateUserOnly=true \
  --region ap-northeast-2 --profile awssec-lab
```

⚠️ 단, `update-user-pool`은 **지정하지 않은 설정을 기본값으로 되돌립니다.** 이 명령을 이렇게 단독으로 쓰면 비밀번호 정책·MFA·이메일 설정이 날아갑니다. 반드시 현재 설정을 `describe-user-pool`로 받아 전체를 다시 넘기십시오. 10.8에서 다시 다룹니다.

### 패턴 B — 셀프 가입 + 관리자 확인

사용자가 스스로 가입하되, 사람(또는 심사 로직)이 승인해야 활성화됩니다. 판매자 입점 심사 같은 경우입니다.

```bash
# 사용자 측 — AWS 자격 증명 없이 호출 가능
aws cognito-idp sign-up \
  --client-id 1a2b3c4d5e6f7g8h9i0j1k \
  --username buyer1@example.com \
  --password 'S3lfSignUp!2026' \
  --user-attributes Name=email,Value=buyer1@example.com \
  --region ap-northeast-2

# 관리자 측 — AWS 자격 증명 필요
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --username buyer1@example.com \
  --region ap-northeast-2 \
  --profile awssec-lab
```

`sign-up` 응답의 `UserConfirmed: false`가 미확인 상태를 뜻합니다. 확인 전에는 로그인이 `UserNotConfirmedException`으로 실패합니다.

### 패턴 C — 셀프 가입 + 셀프 확인

일반 고객 가입의 기본형입니다. 풀에 `AutoVerifiedAttributes: ["email"]`이 있어야 확인 코드가 발송됩니다.

```bash
aws cognito-idp sign-up \
  --client-id 1a2b3c4d5e6f7g8h9i0j1k \
  --username buyer2@example.com \
  --password 'S3lfSignUp!2026' \
  --user-attributes Name=email,Value=buyer2@example.com \
  --region ap-northeast-2

# 메일로 받은 6자리 코드로 스스로 확인
aws cognito-idp confirm-sign-up \
  --client-id 1a2b3c4d5e6f7g8h9i0j1k \
  --username buyer2@example.com \
  --confirmation-code 923042 \
  --region ap-northeast-2

# 코드를 못 받았다면
aws cognito-idp resend-confirmation-code \
  --client-id 1a2b3c4d5e6f7g8h9i0j1k \
  --username buyer2@example.com \
  --region ap-northeast-2
```

### 세 패턴 비교

| | A. 관리자 생성 | B. 셀프 가입 + 관리자 확인 | C. 셀프 가입 + 셀프 확인 |
|---|---|---|---|
| 호출 API | `admin-create-user` | `sign-up` → `admin-confirm-sign-up` | `sign-up` → `confirm-sign-up` |
| 필요한 것 | AWS 자격 증명 | 앱 클라이언트 ID + AWS 자격 증명 | 앱 클라이언트 ID만 |
| 이메일 검증 | 관리자가 `email_verified=true`로 단정 | 심사자가 보증 | **사용자가 실제로 소유를 증명** |
| 초기 상태 | `FORCE_CHANGE_PASSWORD` | `UNCONFIRMED` → `CONFIRMED` | `UNCONFIRMED` → `CONFIRMED` |
| 봇 가입 위험 | 없음 | 중간(심사가 막음) | **높음 → 방어 필요** |
| ShopMini 적용 | 판매자 백오피스, 내부 CS 계정 | 판매자 입점 | 일반 구매 고객 |

C 패턴에는 봇 대량 가입 방어가 반드시 따라야 합니다. 세 겹을 겁니다 — **CloudFront/WAF의 봇 컨트롤과 레이트 제한**(19장), **Pre Sign-up Lambda 트리거의 도메인·평판 검사**(10.7), 그리고 **위협 보호의 적응형 인증**(10.8). Cognito의 기본 이메일 발송은 일일 한도가 매우 낮으므로, 운영 풀은 위 JSON처럼 `EmailSendingAccount: "DEVELOPER"`로 **SES를 연결**해야 합니다.

---

## 10.4 인증 플로우 ⚠️

### 사고 시나리오

ShopMini의 리액트 SPA를 담당한 팀이 로그인을 붙였습니다. 개발 중에 SRP 구현이 번거로워서 앱 클라이언트를 `USER_PASSWORD_AUTH`로 만들었고, "Cognito 콘솔에 시크릿 생성 옵션이 있길래 보안상 좋아 보여서" 체크했습니다. 그러자 SDK가 `SECRET_HASH`를 요구했고, 팀은 클라이언트 시크릿을 프런트엔드 환경 변수(`REACT_APP_COGNITO_SECRET`)에 넣어 빌드했습니다. 배포 후 6개월이 지나 보안 점검에서 다음이 확인됩니다.

- 시크릿이 `main.<hash>.js` 번들에 평문으로 들어 있고 CloudFront가 전 세계에 캐싱 중이었습니다. 그 시크릿과 클라이언트 ID를 가진 사람은 누구나 **정상 클라이언트를 사칭해** `initiate-auth`를 호출할 수 있습니다.
- `USER_PASSWORD_AUTH`를 쓰므로 **사용자의 평문 비밀번호가 앱 코드의 변수를 거쳐 Cognito까지 그대로 전송**되고 있었습니다. XSS 하나면 그대로 유출됩니다.
- `PreventUserExistenceErrors`가 기본값(`LEGACY`)이라, 없는 계정에는 `UserNotFoundException`이, 있는 계정에는 `NotAuthorizedException`이 반환됐습니다. 공격자는 이 차이만으로 **가입된 이메일 목록을 열거**할 수 있었습니다.

### 원인

세 가지가 겹쳤습니다. **(1) 클라이언트 유형을 잘못 잡았고**, **(2) 인증 플로우를 편의로 골랐고**, **(3) 기본값을 그대로 뒀습니다.**

원서는 (2)에 대한 판단 근거를 직접 제공합니다.

> 📖 *AWS Security Cookbook* 3장은 Cognito가 지원하는 인증 플로우를 **클라이언트 사이드 / 서버 사이드 / 커스텀 / 관리자(admin) / 사용자 마이그레이션** 다섯으로 열거합니다. 그리고 결정적인 한 문장. **"기본적으로, 명시적 인증 플로우를 지정하지 않으면 Cognito는 SRP 기반 인증을 사용한다."** 저자는 `ADMIN_NO_SRP_AUTH`를 켜는 것에 대해 **"관리자 API가 SRP 없이 사용자 이름과 비밀번호를 넘길 수 있게 해준다"** 고 설명합니다 — 즉 SRP를 **끄는** 옵션입니다.
>
> 관리자 플로우의 용도도 명시합니다. **"관리자 인증 플로우는 관리자 전용 인증 API를 사용하며 실행에 관리자 자격 증명을 요구한다. 관리자 API는 일반적으로 Java나 .Net 같은 서버 사이드 프로그래밍 언어로 작성된 안전한 서버 사이드 애플리케이션에서 쓰인다."**
>
> SRP가 무엇인지도 원서가 정의합니다. **"SRP는 Secure Remote Password 프로토콜을 뜻하며, 한 명 이상의 당사자가 비밀번호를 알고 있다는 사실로부터 암호 키를 확립하는 비밀번호 기반 키 합의(password-authenticated key agreement) 방식이다. SRP 기반 인증은 iOS·Android·JavaScript 기반 SDK에서 지원된다. 현재 서버 기반 프로그래밍 언어 SDK는 SRP를 지원하지 않는다."**

"비밀번호를 알고 있다는 사실로부터 키를 만든다"가 SRP의 전부입니다. **비밀번호 자체는 네트워크에 나가지 않습니다.** 브라우저와 Cognito는 각각 계산한 값을 주고받아 상대가 같은 비밀번호를 안다는 것만 확인합니다. 그래서 서버 로그·프록시·메모리 덤프 어디에도 평문 비밀번호가 남지 않습니다. `USER_PASSWORD_AUTH`는 이 보호막을 걷어내는 대신 구현 편의를 얻는 선택입니다.

### 올바른 구성

**퍼블릭 클라이언트는 시크릿 없이, `ALLOW_USER_SRP_AUTH`로.** 10.2의 `shopmini-web`이 그 구성입니다. 서버 사이드는 `shopmini-backend`처럼 시크릿을 두고 관리자 플로우를 씁니다.

서버 사이드 플로우 실습:

```bash
# ① 관리자 자격 증명으로 인증 시작
aws cognito-idp admin-initiate-auth \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --client-id 9z8y7x6w5v4u3t2s1r0q9p \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=seller-ops@partner.example.com,PASSWORD='Tmp!Sh0pMini#2026',SECRET_HASH=<계산한값> \
  --region ap-northeast-2 --profile awssec-lab

# ② 첫 로그인이면 NEW_PASSWORD_REQUIRED 챌린지가 온다
aws cognito-idp admin-respond-to-auth-challenge \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --client-id 9z8y7x6w5v4u3t2s1r0q9p \
  --challenge-name NEW_PASSWORD_REQUIRED \
  --challenge-responses USERNAME=seller-ops@partner.example.com,NEW_PASSWORD='N3wSh0pMini!2026',SECRET_HASH=<계산한값> \
  --session <이전 응답의 Session 값> \
  --region ap-northeast-2 --profile awssec-lab

# ③ 액세스 토큰이 만료되면 리프레시 토큰으로 갱신
aws cognito-idp admin-initiate-auth \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --client-id 9z8y7x6w5v4u3t2s1r0q9p \
  --auth-flow REFRESH_TOKEN_AUTH \
  --auth-parameters REFRESH_TOKEN=<RefreshToken>,SECRET_HASH=<계산한값> \
  --region ap-northeast-2 --profile awssec-lab
```

클라이언트 사이드 플로우는 대응하는 비관리자 API(`initiate-auth`, `respond-to-auth-challenge`)를 쓰며, **AWS 자격 증명이 필요 없습니다.** 실제 앱에서는 CLI가 아니라 AWS Amplify나 Cognito Identity SDK가 SRP 계산을 대신 수행합니다.

### 플로우 비교표

| 플로우 값 | 호출 API | 자격 증명 | 비밀번호 전송 | 용도 | 판정 |
|---|---|---|---|---|---|
| `ALLOW_USER_SRP_AUTH` | `initiate-auth` | 불필요(클라이언트 ID) | **없음(SRP)** | SPA·모바일 | **퍼블릭 클라이언트 기본값** |
| `ALLOW_ADMIN_USER_PASSWORD_AUTH` | `admin-initiate-auth` | **AWS 자격 증명 필요** | 서버 → Cognito | 백엔드, 레거시 마이그레이션 | ⚠️ 서버에서만 |
| `ALLOW_USER_PASSWORD_AUTH` | `initiate-auth` | 불필요 | **클라이언트 → Cognito** | 마이그레이션 임시 | ⚠️ 상시 허용 금지 |
| `ALLOW_CUSTOM_AUTH` | `initiate-auth` | 불필요 | 커스텀 챌린지에 따름 | OTP·캡차 등 | 트리거 3종 필요(10.7) |
| `ALLOW_REFRESH_TOKEN_AUTH` | 양쪽 | 클라이언트 유형에 따름 | 없음 | 토큰 갱신 | 필수 |

> 💡 **원서 이후 변경** — 원서의 `ADMIN_NO_SRP_AUTH`는 `ALLOW_ADMIN_USER_PASSWORD_AUTH`로 대체됐습니다(`admin-initiate-auth`의 `--auth-flow` 값은 `ADMIN_USER_PASSWORD_AUTH`). 또한 원서 시점에는 없던 **`ALLOW_USER_AUTH`(선택 기반 인증)** 가 추가되어, 하나의 앱 클라이언트에서 비밀번호·이메일 OTP·**패스키(WebAuthn)** 중 사용자가 방식을 고르게 할 수 있습니다. 9.4에서 다룬 패스워드리스 흐름이 Cognito에도 들어온 것으로, 사용하려면 사용자 풀이 Essentials 이상 기능 플랜이어야 합니다.

### 토큰 3종 — 무엇을 어디에 쓰는가

> 📖 *AWS Security Cookbook* 3장: **"이 레시피에서 세 종류의 토큰을 봤다 — RefreshToken, AccessToken, IdToken. 이 토큰들은 OpenID Connect(OIDC) 공개 표준에 따라 정의된 JSON Web Token(JWT) 형식이다. IdToken은 이름·이메일·전화번호를 포함해 사용자의 신원에 관한 클레임으로 구성되고, AccessToken은 리소스 접근을 허용하는 데 쓰인다. AccessToken과 IdToken은 짧게 유지되고, RefreshToken은 오래 유지되며 새 IdToken이나 AccessToken을 얻는 데 쓰인다."**

| 토큰 | 답하는 질문 | 주요 클레임 | 어디에 쓰나 | 어디에 쓰면 안 되나 |
|---|---|---|---|---|
| **ID 토큰** | 이 사람은 **누구**인가 | `sub`, `email`, `name`, `cognito:groups`, `token_use=id` | 화면에 이름 표시, 자격 증명 풀 교환 | 다른 서비스에 위임 전달 |
| **액세스 토큰** | 이 요청이 **무엇을** 해도 되나 | `sub`, `scope`, `client_id`, `cognito:groups`, `token_use=access` | API 인가(`Authorization: Bearer`) | 사용자 프로필 정보 출처로 쓰기(이메일 클레임 없음) |
| **리프레시 토큰** | 다시 발급받아도 되나 | (불투명 문자열) | 토큰 갱신 전용 | **로컬 스토리지 저장 금지** |

API 인가는 **액세스 토큰의 `scope`와 `cognito:groups`** 로 하는 것이 원칙입니다. 다만 실제 구성은 게이트웨이마다 다릅니다 — API Gateway REST API의 `COGNITO_USER_POOLS` 권한 부여자는 관례적으로 ID 토큰을 받도록 구성하고(OAuth 스코프를 지정하면 액세스 토큰도 씁니다), HTTP API의 JWT 권한 부여자와 ALB의 OIDC 통합은 액세스 토큰을 쓰는 것이 일반적입니다. **어떤 토큰을 받을지 팀 안에서 하나로 정하고 문서화하십시오.** 어느 쪽이든 앱에서 직접 검증할 때는 **네 가지를 반드시 확인**합니다 — `iss`가 우리 사용자 풀 URL인가, `aud`(또는 `client_id`)가 우리 앱 클라이언트인가, `token_use`가 기대한 값인가, `exp`가 지나지 않았는가. 서명은 사용자 풀의 JWKS(`https://cognito-idp.ap-northeast-2.amazonaws.com/<pool-id>/.well-known/jwks.json`)로 검증하고 키를 캐싱합니다. **이 넷 중 하나라도 빠지면 다른 풀·다른 클라이언트에서 발급된 토큰이 통과합니다.**

---

## 10.5 Cognito 그룹과 역할 매핑

> 📖 *AWS Security Cookbook* 3장 「Working with Cognito groups」: **"Amazon Cognito 사용자 풀로 사용자를 그룹으로 분류할 수 있다. 한 사용자가 여러 그룹에 속할 수 있다."** 그리고 실제 활용에 대해 **"이 레시피에서는 역할을 연결하지 않고 그룹을 만들었다. 현실에서는 그룹을 AWS 역할과 연결해 AWS 서비스에 선택적 접근을 제공할 수 있다. 우리 애플리케이션 안에서는 이 그룹 이름을 기반으로 커스텀 역할이나 권한을 가질 수 있다."**

이 두 문장이 그룹의 두 가지 쓰임을 정확히 나눕니다 — **앱 내부 권한 판정용**과 **AWS IAM 역할 매핑용**. 대부분의 팀은 첫 번째만 필요합니다.

### 그룹 만들기와 우선순위

```bash
aws cognito-idp create-group \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --group-name shopmini-admins \
  --description 'ShopMini 운영 관리자' \
  --precedence 1 \
  --role-arn arn:aws:iam::111122223333:role/ShopMiniAdminsCognitoRole \
  --region ap-northeast-2 --profile awssec-lab

aws cognito-idp create-group \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --group-name shopmini-sellers \
  --description 'ShopMini 입점 판매자' \
  --precedence 10 \
  --role-arn arn:aws:iam::111122223333:role/ShopMiniSellersCognitoRole \
  --region ap-northeast-2 --profile awssec-lab

aws cognito-idp admin-add-user-to-group \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --username seller-ops@partner.example.com \
  --group-name shopmini-sellers \
  --region ap-northeast-2 --profile awssec-lab

aws cognito-idp admin-list-groups-for-user \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --username seller-ops@partner.example.com \
  --region ap-northeast-2 --profile awssec-lab
```

**`--precedence`는 값이 작을수록 우선순위가 높습니다.** 사용자가 여러 그룹에 속하면 토큰의 `cognito:groups` 배열은 우선순위 순으로 정렬되고, `cognito:preferred_role` 클레임에는 **가장 작은 precedence 값을 가진 그룹의 역할 ARN**이 들어갑니다. 위 예에서 `shopmini-admins`(1)와 `shopmini-sellers`(10)에 모두 속한 사용자는 관리자 역할을 받습니다. precedence를 지정하지 않으면 순서가 정의되지 않으므로, **역할을 연결한 그룹에는 반드시 precedence를 명시하십시오.**

### 경로 1 — 앱 내부 권한 판정 (대부분 여기서 끝)

액세스 토큰의 `cognito:groups`를 앱이 읽어서 판정합니다.

```json
{ "sub": "9f4c...", "token_use": "access", "scope": "openid profile",
  "cognito:groups": ["shopmini-sellers"], "client_id": "1a2b...", "exp": 1774000000 }
```

앱은 이 값을 **서명 검증을 통과한 토큰에서만** 읽어야 합니다. 클라이언트가 보낸 `X-User-Group` 같은 헤더나, 검증 없이 Base64 디코딩한 페이로드를 믿으면 그 순간 권한 모델이 무너집니다. 이는 7장의 정책 평가와 같은 원칙입니다 — **판정의 입력은 신뢰 경계 안에서 검증된 값이어야 합니다.**

### 경로 2 — IAM 역할 매핑 (자격 증명 풀 경유)

클라이언트가 S3를 직접 호출해야 할 때만 필요합니다. 먼저 자격 증명 풀을 만들고 사용자 풀을 인증 제공자로 등록합니다.

```bash
aws cognito-identity create-identity-pool \
  --identity-pool-name shopmini_customers_idp \
  --no-allow-unauthenticated-identities \
  --cognito-identity-providers \
      ProviderName=cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_aBcDeFgHi,ClientId=1a2b3c4d5e6f7g8h9i0j1k,ServerSideTokenCheck=true \
  --region ap-northeast-2 --profile awssec-lab
```

`--no-allow-unauthenticated-identities`가 **게스트 접근을 끕니다.** 미인증 아이덴티티는 "로그인하지 않은 누구나"에게 AWS 자격 증명을 발급하는 기능입니다. 필요 없으면 반드시 꺼야 합니다. `ServerSideTokenCheck=true`는 토큰 교환 시점에 사용자가 아직 사용자 풀에 존재하는지 Cognito가 확인하게 합니다 — 탈퇴한 사용자의 토큰이 만료 전까지 유효하게 남는 문제를 줄여줍니다.

역할의 신뢰 정책은 IAM 사용자나 서비스가 아니라 **자격 증명 풀**을 신뢰합니다(8장의 웹 아이덴티티 페더레이션).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TrustShopMiniIdentityPoolAuthenticatedOnly",
      "Effect": "Allow",
      "Principal": { "Federated": "cognito-identity.amazonaws.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "cognito-identity.amazonaws.com:aud": "ap-northeast-2:11111111-2222-3333-4444-555555555555"
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "authenticated"
        }
      }
    }
  ]
}
```

⚠️ `aud` 조건(자격 증명 풀 ID)과 `amr` 조건(`authenticated`)을 **둘 다** 걸어야 합니다. `aud`가 없으면 다른 사람의 자격 증명 풀에서도 이 역할을 가져갈 수 있고, `amr`이 없으면 게스트도 인증 사용자 역할을 받습니다.

권한 정책에서 `cognito-identity.amazonaws.com:sub` 정책 변수로 **사용자별 S3 프리픽스 격리**를 겁니다. Cognito의 가장 유용한 패턴입니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "OwnPrefixObjectsOnly",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::shopmini-uploads/private/${cognito-identity.amazonaws.com:sub}/*"
    },
    {
      "Sid": "ListOwnPrefixOnly",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::shopmini-uploads",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["private/${cognito-identity.amazonaws.com:sub}/*"]
        }
      }
    }
  ]
}
```

마지막으로 그룹 → 역할 매핑을 활성화합니다.

```bash
aws cognito-identity set-identity-pool-roles \
  --identity-pool-id ap-northeast-2:11111111-2222-3333-4444-555555555555 \
  --roles authenticated=arn:aws:iam::111122223333:role/ShopMiniCustomerRole \
  --role-mappings '{
    "cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_aBcDeFgHi:1a2b3c4d5e6f7g8h9i0j1k": {
      "Type": "Token",
      "AmbiguousRoleResolution": "Deny"
    }
  }' \
  --region ap-northeast-2 --profile awssec-lab
```

- `Type: "Token"`은 "토큰에서 역할을 고른다" — 즉 `cognito:preferred_role`을 사용합니다. `Type: "Rules"`를 쓰면 임의의 클레임 값으로 규칙을 만들 수 있습니다.
- **`AmbiguousRoleResolution: "Deny"`가 핵심입니다.** 사용자가 역할이 연결된 여러 그룹에 속해 우선순위로 결정할 수 없을 때, `AuthenticatedRole`로 두면 기본 인증 역할이 조용히 부여됩니다. `Deny`로 두면 자격 증명 발급이 실패합니다. **조용한 권한 부여보다 명시적 실패가 낫습니다.**

### 두 경로의 선택 기준

| 판단 | 경로 1 (앱 내부) | 경로 2 (IAM 역할) |
|---|---|---|
| 언제 | 앱 API 권한만 필요 | 클라이언트가 AWS API를 직접 호출 |
| 필요 리소스 | 사용자 풀만 | 사용자 풀 + 자격 증명 풀 + IAM 역할 |
| 권한 표현 | 앱 코드 / OPA / 서비스 계층 | IAM 정책 |
| 세분화 한계 | 자유롭게 | 역할 수 = 그룹 수만큼 늘어남 |
| 권장 | 기본 | 필요할 때만 |

---

## 10.6 소셜/기업 IdP 페더레이션

원서가 지원 제공자를 열거합니다.

> 📖 *AWS Security Cookbook* 3장 「Federated identity with Cognito user pools」: **"Cognito 사용자 풀이 지원하는 다른 아이덴티티 제공자는 다음과 같다 — Login with Amazon, Facebook, Google, Twitter 같은 퍼블릭 제공자, Cognito 사용자 풀, OpenID Connect 제공자, SAML 아이덴티티 제공자, 그리고 개발자 인증 아이덴티티(Developer Authenticated Identities)."**
>
> 그리고 도메인 요구사항에 대한 경고. **"Amazon과 대부분의 다른 아이덴티티 제공자는 HTTPS가 활성화된, 승인된 도메인에서만 자신들을 호출하도록 요구한다. 따라서 이 레시피에는 HTTPS를 갖춘 도메인이 필요하다."**
>
> 또한 저자는 SAML 연동에 대해, ADFS 서버에서 `FederationMetadata.xml`을 내려받아 IAM 아이덴티티 제공자로 등록하고, `SAML 2.0 federation`을 신뢰 주체로 하는 역할을 만드는 절차를 요약합니다.

> 💡 **원서 이후 변경** — 지원 제공자 목록이 바뀌었습니다. **Sign in with Apple**이 추가됐고, Twitter는 더 이상 빌트인 소셜 제공자로 제공되지 않습니다. 원서의 실습은 **자격 증명 풀**에 소셜 제공자를 직접 붙이는 방식(브라우저가 LWA SDK로 액세스 토큰을 받아 `CognitoIdentityCredentials`에 넘김)인데, 현재 권장 구성은 **사용자 풀에 IdP를 등록하고 호스팅 UI/매니지드 로그인으로 리디렉트**하는 방식입니다. 이렇게 하면 소셜·기업 IdP·자체 계정이 모두 하나의 사용자 풀 사용자로 정규화되고, 그룹·트리거·MFA 정책이 동일하게 적용됩니다.

### 도메인과 IdP 등록

```bash
# 호스팅 UI 도메인
aws cognito-idp create-user-pool-domain \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --domain shopmini-auth \
  --region ap-northeast-2 --profile awssec-lab

# 소셜 — Google
aws cognito-idp create-identity-provider \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --provider-name Google \
  --provider-type Google \
  --provider-details client_id=<google-client-id>,client_secret=<google-client-secret>,authorize_scopes='openid email profile' \
  --attribute-mapping email=email,name=name,username=sub \
  --region ap-northeast-2 --profile awssec-lab

# 기업 IdP — SAML 2.0 (B2E: 사내 CS 직원 로그인)
aws cognito-idp create-identity-provider \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --provider-name ShopMiniCorpIdP \
  --provider-type SAML \
  --provider-details MetadataURL=https://idp.corp.example.com/FederationMetadata/2007-06/FederationMetadata.xml,IDPSignout=true \
  --attribute-mapping email=http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress \
  --region ap-northeast-2 --profile awssec-lab
```

`--attribute-mapping`에서 `username=sub`를 지정하는 이유는, 제공자가 주는 값 중 **변하지 않는 식별자**를 사용자 이름으로 삼기 위해서입니다. 이메일을 사용자 이름으로 매핑하면 사용자가 소셜 계정의 이메일을 바꿨을 때 계정이 갈라집니다.

### 앱 클라이언트에 OAuth 설정 붙이기

```bash
aws cognito-idp update-user-pool-client \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --client-id 1a2b3c4d5e6f7g8h9i0j1k \
  --client-name shopmini-web \
  --supported-identity-providers COGNITO Google ShopMiniCorpIdP \
  --callback-urls https://shop.example.com/oauth2/callback \
  --logout-urls https://shop.example.com/signout \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --prevent-user-existence-errors ENABLED \
  --enable-token-revocation \
  --access-token-validity 30 --id-token-validity 30 --refresh-token-validity 7 \
  --token-validity-units AccessToken=minutes,IdToken=minutes,RefreshToken=days \
  --region ap-northeast-2 --profile awssec-lab
```

⚠️ **`update-user-pool-client`는 부분 업데이트가 아닙니다.** 지정하지 않은 필드는 기본값으로 초기화됩니다. 위 명령에서 `--explicit-auth-flows`나 `--prevent-user-existence-errors`를 빼면 10.2에서 걸어둔 설정이 전부 사라집니다. 그래서 **앱 클라이언트는 CloudFormation/Terraform으로 선언적으로 관리하는 것이 정답**입니다. CLI로 고칠 때는 반드시 `describe-user-pool-client`로 현재 상태를 받아 전체를 다시 넘기십시오.

### 리디렉트 URI 검증 — 반드시 지켜야 할 것

OAuth 인가 코드 그랜트에서 **가장 자주 뚫리는 지점이 리디렉트 URI**입니다. 공격자가 `redirect_uri`를 자기 사이트로 바꿔 인가 코드를 가로채는 공격입니다.

| 항목 | 반드시 이렇게 |
|---|---|
| `--callback-urls` | **정확히 일치하는 절대 URL만** 등록. Cognito는 와일드카드를 허용하지 않으며 쿼리 스트링도 매칭에 포함 |
| 스킴 | **HTTPS만.** 예외는 `http://localhost` 하나 |
| 개발용 URL | 운영 앱 클라이언트에 남기지 말 것. **개발·운영 앱 클라이언트를 분리** |
| `--allowed-o-auth-flows` | **`code`만.** `implicit`은 토큰을 URL 프래그먼트로 노출하므로 쓰지 말 것 |
| PKCE | 퍼블릭 클라이언트는 **PKCE(`code_challenge`/`code_verifier`) 필수** |
| `state` 파라미터 | CSRF 방어용으로 반드시 생성·검증 |
| `client_credentials` | M2M 전용. 사용자용 앱 클라이언트에 함께 켜지 말 것 |

원서의 "HTTPS 도메인에서만 호출을 허용한다"는 경고는 소셜 제공자 쪽 요구사항이었지만, Cognito 쪽 콜백 URL에도 동일한 원칙이 적용됩니다. **양쪽 모두에서 허용 목록을 좁게 유지해야 합니다.**

---

## 10.7 Lambda 트리거로 워크플로 커스터마이징

> 📖 *AWS Security Cookbook* 3장 「Customizing workflows with triggers」: **"AWS Lambda 함수로 Cognito 워크플로를 커스터마이징할 수 있다. 현재 사용 가능한 트리거는 다음과 같다 — Pre sign-up, Pre authentication, Custom message, Post authentication, Post confirmation, Define Auth Challenge, Create Auth Challenge, Verify Auth Challenge Response, User Migration, Pre Token Generation."** 저자는 커스텀 인증 플로우가 **"콘솔에서 앱 클라이언트를 만들 때 '커스텀 인증 플로우만 허용'을 선택하거나 앱 클라이언트의 `ExplicitAuthFlows` 속성에서 `CUSTOM_AUTH_FLOW_ONLY` 열거값을 쓰지 않는 한, 다른 인증 플로우와 병렬로 동작한다"** 고 설명합니다.

트리거는 Cognito를 "설정으로 고르는 서비스"에서 "우리 정책을 끼워 넣을 수 있는 서비스"로 바꿉니다. 보안 관점에서 중요한 이유는 두 가지입니다. 첫째, **가입과 로그인이라는 두 관문이 우리 코드의 통제 아래로 들어옵니다.** 지금까지 이 장에서 다룬 설정들은 전부 Cognito가 미리 정해둔 선택지 중에서 고르는 것이었지만, 트리거는 "우리 회사 도메인 목록", "차단된 국가", "탈퇴 유예 중인 계정" 같은 우리만 아는 조건을 인증 경로 한가운데에 넣을 수 있게 해줍니다. 둘째, **토큰의 내용을 우리가 결정할 수 있습니다.** 10.4에서 봤듯 토큰은 앱 인가의 입력값입니다. 그 입력값에 무엇이 담기느냐를 Pre Token Generation 트리거가 정합니다.

동시에 트리거는 **인증 경로 위에 놓인 단일 장애점**이기도 합니다. 여기에 들어간 코드가 느리거나 죽으면 그 결과는 "기능 하나가 안 되는 것"이 아니라 "아무도 로그인할 수 없는 것"입니다. 그래서 이 절은 무엇을 할 수 있는지만큼 무엇을 하면 안 되는지를 함께 다룹니다.

### 주요 트리거와 보안 활용

| 트리거 | 발화 시점 | 보안 활용 예 |
|---|---|---|
| **Pre Sign-up** | 가입 요청 직후, 사용자 생성 전 | 허용 도메인 검사, 일회용 메일 차단, 파트너 도메인 자동 확인 |
| **Post Confirmation** | 확인 완료 직후 | 기본 그룹 자동 배정, 감사 이벤트 기록, 프로필 레코드 생성 |
| **Pre Authentication** | 로그인 시도 직전 | 계정 잠금 상태 확인, 특정 IP/국가 차단 |
| **Post Authentication** | 로그인 성공 직후 | 로그인 이력 기록, 이상 로그인 알림 발송 |
| **Pre Token Generation** | 토큰 발급 직전 | **커스텀 클레임 주입**, 그룹 재정의, 스코프 추가 |
| **Custom Message** | 확인 코드·초대 메일 발송 전 | 메시지 현지화, 피싱 오인 방지 문구 |
| **User Migration** | 미존재 사용자의 로그인 시도 | 레거시 DB에서 **점진적 사용자 마이그레이션** |
| **Define / Create / Verify Auth Challenge** | 커스텀 인증 플로우 | OTP·캡차·디바이스 검증 |

### 예 1 — Pre Sign-up: 가입 게이트

```javascript
// shopmini-pre-signup
const ALLOWED_PARTNER_DOMAINS = ['partner.example.com'];
const BLOCKED_DOMAINS = ['mailinator.com', 'tempmail.example'];

exports.handler = async (event) => {
  const email = (event.request.userAttributes.email || '').toLowerCase();
  const domain = email.split('@')[1];

  if (!domain || BLOCKED_DOMAINS.includes(domain)) {
    // 던진 에러 메시지는 사용자에게 그대로 노출된다 — 내부 정보를 담지 말 것
    throw new Error('사용할 수 없는 이메일 주소입니다.');
  }

  // 검증된 파트너 도메인은 확인 절차 없이 활성화
  if (ALLOWED_PARTNER_DOMAINS.includes(domain)) {
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  }

  return event;
};
```

### 예 2 — Pre Token Generation: 클레임과 스코프 주입

멀티테넌트 구조에서 테넌트 ID를 토큰에 넣으면, 앱은 DB 조회 없이 토큰만으로 테넌트 격리를 판정할 수 있습니다.

```javascript
// shopmini-pre-token (LambdaVersion=V2_0)
exports.handler = async (event) => {
  const tenantId = event.request.userAttributes['custom:tenantId'];
  const groups = event.request.groupConfiguration?.groupsToOverride ?? [];

  event.response = {
    claimsAndScopeOverrideDetails: {
      idTokenGeneration: {
        claimsToAddOrOverride: { tenant_id: tenantId }
      },
      accessTokenGeneration: {
        claimsToAddOrOverride: { tenant_id: tenantId },
        scopesToAdd: groups.includes('shopmini-sellers')
          ? ['shopmini/orders.write']
          : ['shopmini/orders.read']
      }
    }
  };
  return event;
};
```

### 트리거 연결

```bash
aws lambda add-permission \
  --function-name shopmini-pre-signup \
  --statement-id cognito-userpool-invoke \
  --action lambda:InvokeFunction \
  --principal cognito-idp.amazonaws.com \
  --source-arn arn:aws:cognito-idp:ap-northeast-2:111122223333:userpool/ap-northeast-2_aBcDeFgHi \
  --region ap-northeast-2 --profile awssec-lab
```

```bash
# ⚠️ describe-user-pool로 현재 설정 전체를 받아 함께 넘길 것
aws cognito-idp update-user-pool \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --lambda-config '{
    "PreSignUp": "arn:aws:lambda:ap-northeast-2:111122223333:function:shopmini-pre-signup",
    "PostConfirmation": "arn:aws:lambda:ap-northeast-2:111122223333:function:shopmini-post-confirm",
    "PreTokenGenerationConfig": {
      "LambdaVersion": "V2_0",
      "LambdaArn": "arn:aws:lambda:ap-northeast-2:111122223333:function:shopmini-pre-token"
    }
  }' \
  --region ap-northeast-2 --profile awssec-lab
```

`add-permission`의 `--source-arn`으로 **호출 주체를 우리 사용자 풀 하나로 좁히는 것**이 중요합니다. `--principal cognito-idp.amazonaws.com`만 주고 `--source-arn`을 생략하면 다른 계정의 사용자 풀도 이 함수를 호출할 수 있습니다 — 8.6에서 다룬 혼동된 대리인(Confused Deputy) 문제의 Cognito판입니다.

### 트리거 운영 시 반드시 알아야 할 것

| 항목 | 내용 |
|---|---|
| **응답 시간 제한** | Cognito는 트리거를 동기 호출하며 응답을 **5초**까지 기다립니다. 초과하면 재시도하고, 재시도도 실패하면 해당 가입·로그인 요청 자체가 실패합니다. 외부 API 동기 호출을 넣지 마십시오 |
| **실패 = 서비스 중단** | Pre Authentication 트리거가 죽으면 **모든 사용자가 로그인 불가**. 알람과 장애 시 우회 계획 필수 |
| **에러 메시지 노출** | 던진 예외 메시지가 사용자에게 그대로 전달됩니다. 내부 경로·스택·계정 ID를 담지 말 것 |
| **최소 권한** | 트리거 함수 실행 역할에 사용자 풀 관리 권한(`cognito-idp:Admin*`)을 습관적으로 주지 말 것 |
| **로깅** | 이벤트 전체를 CloudWatch에 찍으면 이메일·전화번호 같은 개인정보가 로그로 흘러갑니다(4장 데이터 등급) |
| **멱등성** | Post Confirmation은 재시도될 수 있습니다. 그룹 배정·레코드 생성은 멱등하게 구현 |

---

## 10.8 Cognito 흔한 설정 실수 ⚠️

### 사고 시나리오

ShopMini 운영 6개월 차. CS팀이 "탈퇴 처리한 계정에서 아직 주문이 들어온다"는 문의를 받습니다. 조사 결과:

1. 탈퇴 시 앱은 DB 레코드만 지우고 Cognito 사용자는 그대로 뒀습니다. 뒤늦게 `admin-delete-user`를 실행했지만, **이미 발급된 액세스 토큰이 24시간(팀이 늘려둔 값) 동안 계속 유효**했고 리프레시 토큰은 30일짜리였습니다.
2. 앱 클라이언트에 `--enable-token-revocation`이 꺼져 있어 `revoke-token`도 듣지 않았습니다.
3. 같은 조사 중, 로그인 실패 응답이 계정 존재 여부에 따라 다르다는 것도 발견됩니다. 액세스 로그에는 **6개월간 존재하지 않는 이메일에 대한 로그인 시도**가 쌓여 있었습니다 — 계정 열거 스캔이었습니다. 위협 보호도 꺼져 있어 유출 자격 증명 재사용이 탐지되지 않았습니다.

### 원인

원서가 이 문제의 본질을 정확히 지적합니다.

> 📖 *Practical Cloud Security* 2판 4장: **"전통적인 환경에서는 접근 통제를 그냥 사용자의 아이덴티티 전체를 회수해 더 이상 로그인할 수 없게 하는 식으로 하기도 한다. 그러나 클라우드 환경에서는 이것만으로 문제 전체가 해결되지 않는 경우가 많다. 편의를 위해 많은 서비스가 새 세션으로 로그인할 능력이 없어도 계속 동작하는 장수명 인증 토큰을 제공하기 때문이다. (…) 웹메일 서비스를 예로 들면, 마지막으로 웹메일 비밀번호를 직접 입력한 게 언제인가? 비밀번호를 바꾸거나 로그인 페이지를 못 쓰게 만드는 것은, 웹메일 제공자가 비밀번호 변경 시에 브라우저 쿠키에 저장된 액세스 토큰도 함께 폐기하지 않는다면 아무 소용이 없다."**

**계정을 지우는 것과 토큰을 폐기하는 것은 다른 작업입니다.** Cognito에서 사용자를 삭제해도 이미 발급된 JWT는 만료 시각까지 서명이 유효합니다. 검증만 하는 리소스 서버는 그것을 거부할 방법이 없습니다.

### 올바른 구성 — 실수 → 결과 → 설정

| 실수 | 결과 | 올바른 설정 |
|---|---|---|
| 액세스/ID 토큰 유효 기간을 몇 시간~1일로 | 회수·탈퇴·권한 변경이 그 시간만큼 지연. 토큰 탈취 시 공격 창이 그만큼 넓어짐 | `--access-token-validity 15~60 --token-validity-units AccessToken=minutes` |
| 리프레시 토큰을 기본 30일로 방치 | 한 번 탈취되면 한 달간 새 액세스 토큰 무한 발급 | 웹은 `--refresh-token-validity 1~7 ... RefreshToken=days`. 민감 앱은 더 짧게 |
| `--enable-token-revocation` 비활성 | `revoke-token`이 동작하지 않아 **토큰 폐기 수단 자체가 없음** | 모든 앱 클라이언트에 `--enable-token-revocation` |
| 탈퇴·계정 정지 시 사용자만 삭제 | 기존 토큰으로 계속 접근 가능(위 시나리오) | 삭제·정지와 **동시에** `admin-user-global-sign-out` 실행 → 모든 리프레시 토큰 무효화 |
| `--prevent-user-existence-errors` 기본값(`LEGACY`) | 오류 메시지 차이로 **가입 이메일 열거** 가능 | 모든 앱 클라이언트에 `--prevent-user-existence-errors ENABLED` |
| 위협 보호(구 고급 보안 기능) OFF | 유출된 자격 증명 재사용·비정상 위치 로그인 무탐지 | `--user-pool-add-ons AdvancedSecurityMode=ENFORCED` (Plus 기능 플랜) |
| 비밀번호 정책 기본값(최소 8자, 기호 미요구) | 사전 공격·패스워드 스프레이에 취약 | 최소 12자 + 4종 조합, `TemporaryPasswordValidityDays` 단축 |
| MFA `OFF` | 자격 증명 하나만 뚫리면 끝 | 최소 `OPTIONAL` + TOTP. 관리자·판매자 그룹은 `ON` 강제 |
| `--deletion-protection` 미설정 | 실수 한 번으로 **사용자 디렉터리 전체 소실**(복구 불가) | 운영 풀은 `DeletionProtection: ACTIVE`. 삭제 시 먼저 `INACTIVE`로 변경 |
| 자격 증명 풀 미인증 아이덴티티 허용 | 로그인하지 않은 누구나 AWS 자격 증명 획득 | `--no-allow-unauthenticated-identities` |
| `AmbiguousRoleResolution: AuthenticatedRole` | 그룹 우선순위가 모호할 때 조용히 기본 역할 부여 | `Deny`로 명시적 실패 |
| 퍼블릭 클라이언트에 시크릿 발급 | 시크릿이 번들·앱 패키지에 노출 → 클라이언트 사칭 | `--no-generate-secret` + SRP (10.4) |
| `ALLOW_USER_PASSWORD_AUTH` 상시 허용 | 평문 비밀번호가 클라이언트를 통해 전송 | `ALLOW_USER_SRP_AUTH`. 마이그레이션 기간에만 한시 허용 후 제거 |
| `update-user-pool(-client)`를 부분 업데이트로 착각 | 지정하지 않은 설정이 **전부 기본값으로 초기화** | `describe-*`로 현재 값을 받아 전체 재전송. 또는 IaC로 관리 |
| `UsernameConfiguration.CaseSensitive` 기본값(`true`) 방치 | `Kim@x.com`과 `kim@x.com`이 별개 계정 — 중복 가입·CS 혼선. **생성 후 변경 불가** | 생성 시 `CaseSensitive: false` |
| 필수/커스텀 속성을 나중에 바꾸려 함 | 변경·삭제 불가. 풀 재생성 + 사용자 마이그레이션 필요 | 스키마를 설계 단계에서 확정. 확장 여지는 커스텀 속성으로 |
| SES 미연결(Cognito 기본 이메일 사용) | 일일 발송 한도에 걸려 **가입·비밀번호 재설정 전면 중단** | `EmailSendingAccount: DEVELOPER` + SES 검증 도메인 |
| 리프레시 토큰을 `localStorage`에 저장 | XSS 한 번으로 장기 세션 탈취 | HttpOnly·Secure·SameSite 쿠키 또는 BFF 패턴 |
| 토큰 서명만 검증하고 `iss`/`aud`/`token_use` 미확인 | 다른 사용자 풀·다른 앱 클라이언트의 토큰이 통과 | 4개 클레임 전부 검증 (10.4) |
| Cognito API 호출을 CloudTrail에서 확인하지 않음 | 앱 클라이언트 설정 변조·대량 `admin-*` 호출을 놓침 | `cognito-idp` 관리 이벤트 알람(21장·22장) |

토큰 폐기의 실제 명령:

```bash
# 특정 사용자의 모든 리프레시 토큰 무효화 (탈퇴·정지·비밀번호 유출 시)
aws cognito-idp admin-user-global-sign-out \
  --user-pool-id ap-northeast-2_aBcDeFgHi \
  --username buyer1@example.com \
  --region ap-northeast-2 --profile awssec-lab

# 클라이언트가 자기 리프레시 토큰 하나만 폐기 (로그아웃)
aws cognito-idp revoke-token \
  --token <RefreshToken> \
  --client-id 1a2b3c4d5e6f7g8h9i0j1k \
  --region ap-northeast-2
```

⚠️ 두 명령 모두 **리프레시 토큰과 그로부터 파생된 세션**을 무효화하지만, **이미 발급된 액세스 토큰은 만료될 때까지 유효**합니다. 그래서 액세스 토큰 유효 기간을 짧게 잡는 것이 이 표의 첫 줄에 있는 것입니다. 즉시 차단이 필요한 시나리오(계정 탈취 대응)라면 토큰 만료에 기대지 말고, 앱 계층에 **차단 사용자 목록을 두고 요청마다 확인**하는 경로를 따로 두어야 합니다.

> 💡 **원서 이후 변경** — 원서 시점에는 `revoke-token`, `--enable-token-revocation`, `--prevent-user-existence-errors`, 앱 클라이언트별 토큰 유효 기간, 사용자 풀 삭제 보호가 모두 없었습니다. 이 표의 절반 이상은 2020년 이후 추가된 기능입니다. **원서로 Cognito를 배웠다면, 이 절의 항목들은 새로 점검해야 하는 목록입니다.**

---

## 이 장의 요약

| 항목 | 핵심 |
|---|---|
| **왜 Cognito인가** | "좋은 대안이 없는 경우가 아니라면 비밀번호 해시를 직접 저장하고 검증하지 말라"(*PCS* 2판 4장) |
| **B2B / B2C / B2E** | 직원의 AWS 접근은 9장(IAM Identity Center), 고객의 앱 접근이 이 장(Cognito) |
| **두 서비스** | 사용자 풀 = 인증 + 사용자 디렉터리(`cognito-idp`) / 자격 증명 풀 = AWS 자격 증명 발급(`cognito-identity`) |
| **자격 증명 풀은 선택** | 클라이언트가 AWS API를 **직접** 호출할 때만. 3-tier 앱은 대개 사용자 풀만으로 끝 |
| **되돌릴 수 없는 설정** | 사용자 이름 체계, `CaseSensitive`, 필수 속성 — 생성 시점에 확정 |
| **앱 클라이언트 시크릿** | 퍼블릭(SPA·모바일) = 시크릿 없음 / 컨피덴셜(서버) = 시크릿 있음. **`SECRET_HASH`를 클라이언트에서 계산해야 한다면 설계가 틀린 것** |
| **가입 3패턴** | 관리자 생성(AWS 자격 증명) / 셀프 가입 + 관리자 확인 / 셀프 가입 + 셀프 확인(앱 클라이언트 ID만) |
| **인증 플로우** | "명시적 인증 플로우를 지정하지 않으면 Cognito는 SRP를 사용한다"(*Cookbook* 3장). SRP는 **비밀번호를 네트워크에 보내지 않는다** |
| **관리자 플로우의 자리** | "안전한 서버 사이드 애플리케이션"(*Cookbook* 3장). 브라우저에는 절대 두지 않는다 |
| **토큰 3종** | ID = 누구인가 / 액세스 = 무엇을 해도 되나 / 리프레시 = 갱신 전용 |
| **토큰 검증 4종** | `iss` · `aud`(`client_id`) · `token_use` · `exp` + JWKS 서명. 하나라도 빠지면 남의 토큰이 통과 |
| **그룹** | "한 사용자가 여러 그룹에 속할 수 있다"(*Cookbook* 3장). `--precedence`는 **작을수록 우선** |
| **역할 매핑** | 신뢰 정책에 `cognito-identity.amazonaws.com:aud` + `amr` 둘 다. `AmbiguousRoleResolution=Deny` |
| **사용자별 격리** | `${cognito-identity.amazonaws.com:sub}` 정책 변수로 S3 프리픽스 분리 |
| **페더레이션** | 사용자 풀에 IdP를 붙여 정규화. 콜백 URL은 **정확 일치 HTTPS**, 그랜트는 `code` + PKCE |
| **트리거** | 5초 제한, 실패하면 로그인 자체가 막힘, 예외 메시지는 사용자에게 노출됨 |
| **토큰 폐기의 한계** | 사용자 삭제 ≠ 토큰 무효화. `admin-user-global-sign-out`도 **액세스 토큰은 못 죽인다** → 유효 기간을 짧게 |
| **원서 이후** | 콘솔 개편, 매니지드 로그인, 기능 플랜(Lite/Essentials/Plus), 위협 보호 개명, `ALLOW_` 플로우, 패스키, 토큰 폐기·삭제 보호 |

## 🔴 필수 구성 체크리스트

- [ ] 사용자 풀을 **JSON 정의 + IaC**로 관리한다(콘솔 클릭으로 만들지 않는다)
- [ ] `UsernameConfiguration.CaseSensitive`를 **`false`로 생성**했다
- [ ] `AutoVerifiedAttributes`에 `email`이 있고 `AccountRecoverySetting`이 지정되어 있다
- [ ] 비밀번호 정책이 **최소 12자 + 4종 문자**이고 임시 비밀번호 유효일이 단축되어 있다
- [ ] MFA가 최소 `OPTIONAL`이고 **TOTP가 활성**이다. 관리자·판매자 그룹은 `ON`
- [ ] 운영 사용자 풀에 **`DeletionProtection: ACTIVE`** 가 걸려 있다
- [ ] 이메일 발송이 **SES에 연결**되어 있다(Cognito 기본 이메일 아님)
- [ ] 퍼블릭 클라이언트에 **시크릿이 없다**(`--no-generate-secret`)
- [ ] 퍼블릭 클라이언트의 인증 플로우가 **`ALLOW_USER_SRP_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH`뿐**이다
- [ ] 모든 앱 클라이언트에 **`--prevent-user-existence-errors ENABLED`**
- [ ] 모든 앱 클라이언트에 **`--enable-token-revocation`**
- [ ] 액세스/ID 토큰 유효 기간이 **분 단위**로 명시되어 있다(기본 1시간에 의존하지 않는다)
- [ ] 리프레시 토큰 유효 기간이 **기본 30일보다 짧게** 조정되어 있다
- [ ] **위협 보호(`AdvancedSecurityMode=ENFORCED`)** 가 켜져 있다
- [ ] 개발용 콜백 URL이 **운영 앱 클라이언트에 남아 있지 않다**
- [ ] OAuth 그랜트가 **`code`만**이고 퍼블릭 클라이언트는 **PKCE**를 쓴다
- [ ] 역할이 연결된 모든 그룹에 **`--precedence`가 명시**되어 있다
- [ ] 자격 증명 풀이 **미인증 아이덴티티를 허용하지 않는다**(필요한 경우가 아니라면)
- [ ] 자격 증명 풀 역할의 신뢰 정책에 **`aud` + `amr` 조건이 둘 다** 있다
- [ ] `AmbiguousRoleResolution`이 **`Deny`** 이다
- [ ] Lambda 트리거 함수에 **`--source-arn`으로 제한된 리소스 기반 정책**이 있다
- [ ] 탈퇴·계정 정지 절차에 **`admin-user-global-sign-out`** 이 포함되어 있다
- [ ] 앱의 토큰 검증이 **`iss`·`aud`/`client_id`·`token_use`·`exp` 4가지를 모두** 확인한다
- [ ] 리프레시 토큰이 **`localStorage`에 저장되지 않는다**
- [ ] `cognito-idp` 관리 이벤트(특히 `UpdateUserPoolClient`·`AdminDeleteUser`)에 **CloudTrail 알람**이 있다

## ⚠️ 자주 하는 실수

| 실수 | 결과 | 올바른 구성 |
|---|---|---|
| SPA에 앱 클라이언트 시크릿을 넣는다 | 번들에 평문 노출 → 클라이언트 사칭 | 퍼블릭 클라이언트는 `--no-generate-secret` (10.2, 10.4) |
| 편의로 `USER_PASSWORD_AUTH`를 켠다 | 평문 비밀번호가 클라이언트를 경유 | `ALLOW_USER_SRP_AUTH` (10.4) |
| 관리자 플로우를 프런트엔드에서 쓴다 | AWS 자격 증명을 브라우저에 두게 됨 | 관리자 API는 "안전한 서버 사이드"에서만 (10.4) |
| `PreventUserExistenceErrors`를 기본값으로 둔다 | 가입 이메일 목록이 열거됨 | 모든 클라이언트에 `ENABLED` (10.8) |
| 토큰 유효 기간을 늘려 "재로그인 불편"을 해결한다 | 회수 지연 + 탈취 시 공격 창 확대 | 액세스 토큰은 짧게, 갱신은 리프레시 토큰으로 (10.8) |
| 사용자 삭제로 접근이 즉시 끊긴다고 믿는다 | 발급된 토큰이 만료까지 유효 | 삭제와 함께 `admin-user-global-sign-out` (10.8) |
| `update-user-pool-client`를 부분 업데이트로 쓴다 | 인증 플로우·토큰 설정이 기본값으로 초기화 | `describe-*` 후 전체 재전송 또는 IaC (10.6, 10.8) |
| 사용자 이름 대소문자 구분을 기본값으로 둔다 | 중복 계정 발생, **생성 후 변경 불가** | 생성 시 `CaseSensitive: false` (10.2) |
| 필수 속성을 나중에 바꾸려 한다 | 변경 불가 — 풀 재생성 + 마이그레이션 | 스키마를 설계 단계에서 확정 (10.2) |
| 자격 증명 풀에 게스트 접근을 켜둔다 | 로그인 없이 AWS 자격 증명 획득 | `--no-allow-unauthenticated-identities` (10.5) |
| 신뢰 정책에 `aud` 조건을 빼먹는다 | 다른 자격 증명 풀에서 역할 탈취 | `aud` + `amr` 두 조건 모두 (10.5) |
| `AmbiguousRoleResolution`을 `AuthenticatedRole`로 둔다 | 우선순위 모호 시 조용히 기본 역할 부여 | `Deny` (10.5) |
| 그룹에 `precedence`를 지정하지 않는다 | `cognito:preferred_role`이 예측 불가 | 역할 연결 그룹은 precedence 필수 (10.5) |
| 클라이언트가 보낸 헤더로 그룹을 판정한다 | 권한 위조 | 서명 검증된 토큰의 `cognito:groups`만 신뢰 (10.5) |
| 콜백 URL에 개발용·HTTP URL을 남긴다 | 인가 코드 탈취 경로 | 정확 일치 HTTPS만, 환경별 앱 클라이언트 분리 (10.6) |
| `implicit` 그랜트를 쓴다 | 토큰이 URL 프래그먼트에 노출 | `code` + PKCE (10.6) |
| 트리거에서 외부 API를 동기 호출한다 | 5초 초과로 **로그인 전면 실패** | 비동기 처리로 분리, 트리거는 즉시 반환 (10.7) |
| 트리거 예외 메시지에 내부 정보를 담는다 | 사용자에게 그대로 노출 | 일반화된 메시지만 (10.7) |
| Lambda `add-permission`에 `--source-arn`을 생략한다 | 타 계정 사용자 풀이 함수 호출 가능 | `--source-arn`으로 사용자 풀 지정 (10.7, 8.6) |
| Cognito 기본 이메일로 운영한다 | 발송 한도 초과 → 가입·비밀번호 재설정 중단 | SES 연결 (10.2, 10.3) |
| 위협 보호를 켜지 않는다 | 자격 증명 스터핑·비정상 로그인 무탐지 | `AdvancedSecurityMode=ENFORCED` (10.8) |
| 리프레시 토큰을 `localStorage`에 둔다 | XSS 한 번으로 장기 세션 탈취 | HttpOnly·Secure 쿠키 또는 BFF (10.8) |

## 다음 장 예고

이 장에서 앱 클라이언트 시크릿, 소셜 IdP의 `client_secret`, SES 자격 증명 같은 **"코드에 넣으면 안 되는 값"** 이 여럿 등장했습니다. 10.2에서는 "Secrets Manager에서 읽어 쓴다"고만 하고 넘어갔습니다.

11장은 그 미뤄둔 문제를 정면으로 다룹니다. 시크릿을 두면 안 되는 곳들 — 코드, 환경 변수, AMI, 컨테이너 이미지 레이어, Git 히스토리 —, **Systems Manager Parameter Store**의 `SecureString`과 KMS 연동, **AWS Secrets Manager**의 RDS 자격 증명 자동 순환, 그리고 둘 중 무엇을 언제 쓸지 정하는 기준. 마지막으로 CANON의 `rds/shopmini` 시크릿을 실제로 순환시키면서, 무중단 순환이 왜 애플리케이션 코드의 협조를 필요로 하는지 봅니다.
