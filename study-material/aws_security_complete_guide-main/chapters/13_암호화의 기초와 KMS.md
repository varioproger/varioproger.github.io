---
title: "13장. 암호화의 기초와 KMS"
---

# 13장. 암호화의 기초와 KMS

> **이 장에서 다루는 것**
> - 대칭/비대칭 암호와 **봉투 암호화(Envelope Encryption)** — 왜 키가 두 층으로 나뉘는가
> - 저장 중 / 전송 중 / 사용 중 암호화가 각각 막는 위협과 **암호화 계층을 올릴수록 커지는 대가**
> - KMS 아키텍처 — 키 유형 3종, 데이터 키, 리전 종속성, 다중 리전 키
> - **키 정책 = 접근 통제의 최종 관문** 🔴 — IAM 정책만으로는 KMS 키에 접근할 수 없다
> - 실습 🧪 — 키 생성·별칭, 자동/수동 순환, 그랜트, 조건 키, 암호화 컨텍스트, 크로스 계정 공유
> - KMS 운영 함정 ⚠️ — 삭제 대기 기간, 리전 종속, 스로틀링, 비용 폭증, 키 정책 락아웃
>
> **선행 지식**: 7장(정책 평가 순서), 8장(역할과 임시 자격 증명), 11장(시크릿 관리), 12장(데이터 분류)
> **난이도**: ★★☆

---

12장에서 "무엇이 어디에 있고 얼마나 민감한가"를 정리했습니다. 등급별 통제를 걸 차례이고 그 중심에는 암호화가 있는데, 암호화는 **가장 오해받는 보안 대책**입니다.

> 📖 *Practical Cloud Security* 2판 2장은 이렇게 시작합니다. **"암호화는 데이터 보호 세계의 은탄환이다. 우리는 '모든 것을 암호화'하고 싶어 한다. 불행히도 이야기는 그보다 조금 더 복잡하다."**
>
> 그리고 저장 중 암호화의 진짜 난점을 지목합니다. **"문제는 데이터를 암호화하는 것에 있지 않다 — 그렇게 해주는 라이브러리는 많다. 문제는 데이터를 암호화하고 나면 이제 그 데이터에 접근하는 데 쓸 수 있는 암호화 키가 생긴다는 것이다. 많은 사람이 이것을 어디에 둘까? 평문으로, 데이터 바로 옆에! (…) ('암호화했음' 체크박스를 채우는 것이 아니라) 진짜 보안을 가지려면 제대로 된 키 관리가 있어야 한다."**

**"암호화를 켰다"는 문장은 보안 상태를 거의 설명하지 않습니다.** 실제로 알아야 할 것은 "누가 그 키를 쓸 수 있는가"이고, AWS에서 그 답은 **KMS 키 정책**에 적혀 있습니다.

---

## 13.1 암호화 기초 다지기

### 대칭과 비대칭

| 구분 | 대칭(Symmetric) | 비대칭(Asymmetric) |
|---|---|---|
| 키 | 암·복호화에 **같은 키** | 공개 키/개인 키 **쌍** |
| 대표 알고리즘 | AES-256-GCM | RSA, ECC(타원곡선) |
| 속도 | 빠름 (대용량 데이터에 적합) | 느림 (작은 데이터·키 교환·서명용) |
| 어려운 점 | **키를 어떻게 안전하게 전달·보관하는가** | 공개 키의 진위 확인(PKI·인증서) |
| AWS에서 | KMS 기본값, 데이터 암호화 전반 | ACM 인증서, 서명 검증, 키 교환 |

실제 시스템은 둘을 섞습니다. TLS가 대표적으로, **비대칭으로 신원을 확인하고 대칭 키를 합의**한 뒤 대량 데이터는 대칭으로 처리합니다.

> 📖 *Practical Cloud Security* 2판 6장: **"제대로 구현되면 TLS는 하나의 값으로 세 가지 통제를 제공한다. TLS에서 서버는 키 쌍(공개 키와 개인 키)을 생성하고 인증 기관이 그 공개 키에 서명하게 한다. (…) 클라이언트 시스템은 그 인증서와 서명한 주체를 보고 서버가 자기가 말하는 그 서버인지 판단한다 — 다시 말해 클라이언트가 서버를 인증한다. 그리고 서버 인증 단계가 끝나면 두 시스템은 그 연결을 암호화하는 데 쓸 대칭 암호화 키에 합의한다."**

### 키가 두 층으로 나뉘는 이유

"파일마다 키를 하나씩 만들어 KMS에 넣어두면 되지 않나?" 원서는 이 접근이 왜 무너지는지를 두 가지로 정리합니다.

> 📖 *Practical Cloud Security* 1판·2판 2장: **"이 접근에는 두 가지 주요 문제가 있다. ① KMS에 엄청난 부하를 준다. 파일마다 다른 키를 원할 만한 좋은 이유들이 있는데, 그러면 고객이 많은 KMS는 수십억 또는 수조 개의 키를 거의 즉시 조회 가능하게 저장해야 한다. ② 데이터를 안전하게 지우려면 KMS가 다 쓴 키를 되돌릴 수 없게 지우고 백업 사본을 남기지 않는다고 믿어야 한다."**
>
> 그래서 결론은 이것입니다. **"이런 이유로 보통 키를 두 계층으로 둔다: 키 암호화 키(KEK)와 데이터 암호화 키(DEK). (…) 키 암호화 키는 안전을 위해 보통 KMS 안에 머무르며 절대 밖으로 나오지 않는다. 래핑된 데이터 암호화 키는 필요할 때 언래핑을 위해 HSM으로 보내지고, 언래핑된 키가 데이터를 암·복호화하는 데 쓰인다. 언래핑된 키는 절대 기록하지 않는다."**

이 KEK/DEK 2계층 구조가 AWS의 **봉투 암호화(Envelope Encryption)** 입니다. KMS 키가 KEK, `GenerateDataKey`가 돌려주는 것이 DEK입니다.

### 봉투 암호화 흐름

```
[암호화]
  ① 앱 ──▶ KMS : GenerateDataKey(KeyId="alias/shopmini/app", KeySpec="AES_256")
                    │
  ② 앱 ◀── KMS :   ├─ Plaintext        : 평문 DEK (32바이트)  ← 메모리에서만 사용
                    └─ CiphertextBlob   : KMS 키(KEK)로 암호화된 DEK

  ③ 앱 : 평문 DEK 로 데이터 암호화  →  암호문
  ④ 앱 : [ 암호문 | CiphertextBlob ] 을 함께 저장(S3 객체·DB 컬럼·파일 헤더)
  ⑤ 앱 : 평문 DEK 즉시 폐기(0으로 덮어쓰기). 절대 디스크에 쓰지 않는다.

[복호화]
  ⑥ 앱 : 저장소에서 [ 암호문 | CiphertextBlob ] 읽기
  ⑦ 앱 ──▶ KMS : Decrypt(CiphertextBlob)   ← KMS 키는 밖으로 나오지 않는다
  ⑧ 앱 ◀── KMS : Plaintext = 평문 DEK
  ⑨ 앱 : 평문 DEK 로 복호화 → 사용 후 즉시 폐기

  키 계층 :   KMS 키(KEK, HSM 밖으로 안 나옴)
                  └── DEK #1 (객체 A)   DEK #2 (객체 B)   DEK #3 (객체 C) …
```

이 구조가 세 가지를 해결합니다. **① 성능** — 대용량 데이터는 로컬 CPU가 처리하고 KMS는 32바이트만 다룹니다(KMS 직접 `Encrypt`는 대칭 키 기준 **4KB 이하**만 가능한데, 봉투 암호화가 이를 우회합니다). **② 범위 격리** — DEK 하나가 유출되어도 그 객체만 노출됩니다. **③ 암호적 삭제(Cryptographic Erasure)**.

> 📖 *Practical Cloud Security* 2판 2장: **"데이터를 복구 불가능하게 만들고 싶을 때 KMS에서 키 암호화 키를 지우거나 그에 대한 접근을 취소하면, 그 키 암호화 키로 '래핑'된 모든 데이터 암호화 키가 세계 어디에 있든 쓸모없어진다. (…) 수 테라바이트짜리 파일도 256비트 키 하나를 덮어쓰는 것으로 사실상 복구 불가능하게 만들 수 있다."**

12.6의 "안전한 파기"가 이것이고, 이 강력함은 13.11에서 다룰 사고의 원인이기도 합니다.

---

## 13.2 저장 중 암호화 vs 전송 중 암호화 vs 사용 중 암호화

> 📖 *Practical Cloud Security* 2판 2장: **"암호화해야 할 데이터에는 세 종류가 있다: 이동 중 데이터(네트워크를 가로질러 전송 중), 컨피덴셜 컴퓨팅 또는 사용 중 데이터(현재 컴퓨터 CPU에서 처리 중이거나 RAM에 있는), 저장 중 데이터(디스크 같은 영구 저장소에)."**

셋은 대체재가 아니라 **서로 다른 위협을 막는 별개의 통제**입니다.

| 상태 | 막는 위협 | AWS 구현 | 못 막는 것 |
|---|---|---|---|
| **전송 중** | 네트워크 도청, 중간자(MITM), 스위치·회선 침해 | ACM + ALB HTTPS, 앱 8443 HTTPS, VPC 엔드포인트, RDS `require_secure_transport` | 종단 자체가 침해된 경우 |
| **저장 중** | 디스크·스냅샷·백업 탈취, 잘못 공유된 AMI/스냅샷, 폐기 매체 | S3 SSE-KMS, EBS 암호화, RDS 저장 암호화, Secrets Manager | **정상 API 자격 증명을 가진 공격자** |
| **사용 중** | 하이퍼바이저·특권 사용자·동일 호스트 테넌트의 메모리 열람 | Nitro Enclaves(14.7) | 애플리케이션 자체의 논리 취약점 |

### 저장 중 암호화가 막지 못하는 것

**S3 버킷에 SSE-KMS를 켜도 `s3:GetObject`와 `kms:Decrypt` 권한을 가진 공격자에게는 아무 방어가 되지 않습니다.** 유출 사고의 대부분이 이 형태입니다.

> 📖 *Practical Cloud Security* 2판 2장은 디스크 수준 암호화의 한계를 분명히 합니다. **"대부분의 클라우드 제공자가 구현하는 물리적 통제와 장비 폐기 통제를 감안하면 매체 도난이나 분실은 클라우드 환경에서 큰 위험이 아니다. (…) '암호화 체크박스를 채우기 위해' 수행된 암호화는 종종 이 물리적 도난 위협을 완화하는 데만 도움이 될 뿐이다 — 그리고 때로는 그 위협조차 막지 못한다."**

그래서 원서는 암호화 계층을 **위로 올릴수록** 방어 범위가 넓어진다고 정리합니다.

| 암호화 계층 | 아래 계층이 침해되어도 안전한가 | 대가 |
|---|---|---|
| **디스크 수준** (스토리지 서브시스템) | 매체 도난에만 유효 | 사실상 없음 — 이미 켜져 있다 |
| **플랫폼 수준** (RDS·S3가 KMS로 암호화) | 스토리지 계층 침해로부터 안전 | 압축·중복 제거 불가 → 비용 상승, 일부 성능 저하 |
| **애플리케이션 수준** (앱이 넣기 전에 암호화) | DB 계층 침해로부터도 안전 | **DB가 검색·정렬·집계를 못 한다** |

> 📖 *Practical Cloud Security* 2판 2장의 권고는 명확합니다. **"애플리케이션 수준 암호화는 애플리케이션이 처리하는 가장 민감한 데이터에 대해서만 구현하고, 나머지 전부는 하위 계층이 암호화를 처리하도록 두라는 것이 일반적인 나의 권고다."** 그리고 대가를 못 박습니다. **"클라이언트 측 암호화를 쓰면 서버는 키가 없기 때문에 암호화된 데이터를 읽을 능력이 없다. 이는 서버 측 검색, 계산, 인덱싱, 멀웨어 스캔, 그 밖의 가치 높은 작업을 전혀 수행할 수 없다는 뜻이다."**

ShopMini의 구성은 이렇습니다. **기본선은 RDS 저장 암호화 + S3 SSE-KMS(플랫폼 수준)** 로 전 데이터를 덮고, **애플리케이션 수준은 결제 카드 정보 같은 최고 등급 필드에만** 적용합니다(그 필드는 `WHERE` 조건으로 못 쓴다는 것을 설계 단계에서 받아들여야 합니다). 여기에 전 구간 TLS(8443, 3306 TLS 강제, VPC 엔드포인트 경유 호출)를 더합니다.

> 📖 *Practical Cloud Security* 2판 2장: **"암호학에 당신의 뛰어난 경력의 대부분을 바치지 않았다면, 당신 자신의 암호 시스템을 만들거나 구현하려고 시도하지 마라. 당신의 애플리케이션에서 암·복호화를 수행할 때조차, 안전한 알고리즘의 충분히 검증되고 지원되는 라이브러리 구현만 사용하라."**

AWS에서 이 조언의 실천은 **AWS Encryption SDK를 쓰고 봉투 암호화를 직접 구현하지 않는 것**입니다.

---

## 13.3 AWS KMS 아키텍처

> 📖 *AWS Security Cookbook* 4장은 KMS를 이렇게 정의합니다. **"AWS Key Management Service(KMS)는 공유 하드웨어 보안 모듈(HSM)을 활용하면서 암호화 키를 만들고 관리하도록 도와준다. CloudHSM은 AWS 내의 또 다른 서비스로, 역시 암호화 키를 관리하게 해주지만 향상된 보안을 위해 전용 HSM을 사용한다."**
>
> 📖 *Practical Cloud Security* 2판 2장은 그 트레이드오프를 정리합니다. **"KMS는 대개 멀티테넌트 서비스이므로 공격 표면이 약간 더 크고, (HSM만이 아니라) HSM과 KMS 둘 다를 신뢰해야 하므로 약간의 추가 위험이 있다. 그러나 스스로 키 관리를 — 흔히 잘못 — 수행하는 것과 비교하면 KMS는 아주 낮은 비용으로 탁월한 보안을 제공한다."**

전용 HSM과 커스텀 키 스토어는 14장에서 다룹니다.

### 키 유형 3종

> 💡 **원서 이후 변경** — AWS는 2021년부터 원서의 명칭인 "CMK(customer master key)"를 폐기하고 **"KMS key"** 로 통일했습니다. 이 책은 현재 명칭인 **KMS 키**를 쓰되 `kms:` 액션명과 CLI는 원래대로이며, 원서의 CMK는 "고객 관리형 KMS 키"에 해당합니다.

| 유형 | 누가 만드나 | 키 정책 편집 | 순환 제어 | 계정 내 가시성 | 비용 |
|---|---|---|---|---|---|
| **고객 관리형(Customer managed)** | 사용자 | **가능** | 가능(주기 지정·온디맨드) | 콘솔·API에서 보임 | 키당 월정액 + 요청 과금 |
| **AWS 관리형(AWS managed)** | 서비스가 자동 생성. 별칭 `aws/s3`, `aws/rds`, `aws/secretsmanager` 등 | **불가** | 불가(자동) | 보임(읽기 전용) | 키 월정액 없음, 요청 과금 |
| **AWS 소유(AWS owned)** | AWS가 다수 계정 공용으로 소유 | 불가 | 불가 | **보이지 않음** | 무료 |

**기준은 단순합니다.** 12장에서 매긴 분류 등급이 "내부" 이상이면 **고객 관리형 키**를 쓰십시오. ① 키 정책이라는 독립적인 두 번째 통제선(13.4)이 생기고, ② 키 삭제로 암호적 삭제가 가능하며, ③ 크로스 계정 공유가 가능합니다. AWS 관리형 키는 셋 다 안 됩니다.

### 키 사양과 용도

| KeySpec | KeyUsage | 용도 |
|---|---|---|
| `SYMMETRIC_DEFAULT` (AES-256-GCM) | `ENCRYPT_DECRYPT` | **기본값.** 봉투 암호화, AWS 서비스 통합 전부 |
| `RSA_2048` / `RSA_3072` / `RSA_4096` | `ENCRYPT_DECRYPT` 또는 `SIGN_VERIFY` | 외부와의 공개 키 교환, 디지털 서명 |
| `ECC_NIST_P256` / `P384` / `P521` | `SIGN_VERIFY` | 서명(짧은 키, 빠름) |
| `HMAC_256` 등 | `GENERATE_VERIFY_MAC` | 메시지 인증 코드 |

**AWS 서비스 통합(S3·EBS·RDS·Secrets Manager)은 전부 대칭 키만 지원합니다.**

### 리전 종속성

> 📖 *AWS Security Cookbook* 4장: **"KMS는 리전별 서비스이고, 따라서 KMS가 관리하는 키도 리전별이다. 그러므로 KMS 키를 사용하려면 해당 서비스들도 같은 리전에 있어야 한다."**

이 한 문장이 13.11의 사고 절반을 만듭니다. `ap-northeast-2`의 키로 암호화된 EBS 스냅샷은 `ap-northeast-1`에 그대로 복사되지 않고, 복사 시점에 대상 리전 키로 **재암호화**해야 합니다.

> 💡 **원서 이후 변경** — 2021년 도입된 **다중 리전 키(Multi-Region Key)** 는 이 제약을 부분적으로 완화합니다. 주 키(primary)와 복제 키(replica)가 **동일한 키 자료**를 공유하므로 한 리전에서 암호화한 암호문을 다른 리전에서 복호화할 수 있습니다. 키 ID는 `mrk-`로 시작하고 리전 간에 같지만, **ARN은 리전마다 다르고 키 정책·태그·별칭·권한 부여는 리전별로 독립**입니다. 키 자료 복제는 노출 지점을 늘리므로 재해 복구처럼 필요가 분명할 때만 쓰십시오.

---

## 13.4 🔴 키 정책 = 접근 통제의 최종 관문

### 🔴 원칙: IAM 정책만으로는 KMS 키에 접근할 수 없다

> 📖 *AWS Security Cookbook* 4장은 이것을 반복해서 못 박습니다. **"KMS CMK에 대한 접근을 허용하려면 우리는 언제나 키 정책을 사용해야 한다 — 단독으로든, IAM 정책이나 그랜트와 함께든."** 그리고 **"루트 사용자를 포함한 어떤 사용자든 CMK에 접근할 수 있지만, 오직 키 정책이 그것을 허용하는 경우에만 그렇다."**

S3 버킷은 버킷 정책이 없어도 같은 계정의 IAM 권한만으로 접근할 수 있지만 **KMS 키는 그렇지 않습니다.** 7.3의 평가 순서 위에 이 규칙을 얹으면 판정은 이렇게 흐릅니다.

```
                   kms:Decrypt 요청 (주체 P, 키 K)
                              │
                              ▼
        ┌───────────────────────────────────────────────┐
        │ ① 키 K의 키 정책에 명시적 Deny 가 있는가?          │──── 있음 ──▶ [거부]
        └───────────────────────────────────────────────┘
                              │ 없음
                              ▼
        ┌───────────────────────────────────────────────┐
        │ ② 키 정책이 P를 어떻게 허용하는가?                 │
        └───────────────────────────────────────────────┘
             │                    │                    │
   (A) P를 Principal 로   (B) 계정 루트에 위임     (C) 어느 쪽도 아님
       직접 지정             ("Enable IAM User            │
             │                Permissions")               ▼
             │                    │                    [거부]
             │                    ▼                 (IAM 에 kms:* 가
             │      ┌──────────────────────────┐     있어도 소용없음)
             │      │ P의 IAM 정책이 허용하는가?   │
             │      └──────────────────────────┘
             │           │ 예        │ 아니오
             │           │           ▼
             │           │        [거부]
             ▼           ▼
        ┌───────────────────────────────────────────────┐
        │ ③ SCP·권한 경계·조건 키 평가 (7.3 순서 그대로)      │
        └───────────────────────────────────────────────┘
                              │ 통과
                              ▼
                          [허용]

   (D) 별도 경로: 그랜트(Grant)로도 허용될 수 있다 → 13.7
       단, 그랜트를 만들 권한 자체가 키 정책/IAM 에서 나온다.
```

### (B) 경로 — 계정 루트 위임의 정체

키를 만들면 기본 키 정책에 이 문장이 들어갑니다.

```json
{
  "Sid": "Enable IAM User Permissions",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
  "Action": "kms:*",
  "Resource": "*"
}
```

> 📖 *AWS Security Cookbook* 4장: **"콘솔에서 CMK를 만들 때의 기본 키 정책은 소유 계정의 루트 사용자에게 전체 권한을 주고, CMK에 접근하는 데 필요한 IAM 정책을 활성화한다."**

여기서 `:root`는 **"루트 사용자에게만 준다"가 아니라 "이 계정의 IAM 정책이 이 키에 대해 효력을 갖도록 위임한다"** 는 뜻입니다. 이 문장이 있으면 **계정 내 누구든 IAM에 `kms:Decrypt`가 있으면 이 키를 쓸 수 있고**, 넓은 IAM 정책을 가진 사람은 자동으로 키 사용자가 됩니다.

> 📖 *AWS Security Cookbook* 4장: **"S3 관리자 권한을 가진 사용자는 KMS 키 암호화로 암호화된 파일을 볼 권한이 없다 — 그 파일을 암호화하는 데 사용된 키의 키 사용자가 아니라면. `AdministratorAccess` 권한을 가진 사용자는 (…) 자기 자신을 키 관리자나 키 사용자로 추가할 권한을 갖는다."** 그래서 관리자/사용자 분리는 감사에 의존합니다. **"키 관리자는 그 키로 데이터를 암호화하거나 복호화할 권한이 없다. 그러나 키 관리자는 키 정책을 수정해서 자기 자신을 키 사용자로 추가할 수 있다. 여기서 감사와 로깅 서비스가 더욱 중요해진다."**

### 🔴 반드시 이렇게 구성하라

**민감 데이터용 고객 관리형 키에는 다음 4개 문장 구조를 쓰십시오.**

```json
{
  "Version": "2012-10-17",
  "Id": "key-policy-shopmini-app",
  "Statement": [
    {
      "Sid": "EnableIAMUserPermissions",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "KeyAdministrators",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-key-admin" },
      "Action": [
        "kms:Create*", "kms:Describe*", "kms:Enable*", "kms:List*",
        "kms:Put*", "kms:Update*", "kms:Revoke*", "kms:Disable*",
        "kms:Get*", "kms:Delete*", "kms:TagResource", "kms:UntagResource",
        "kms:ScheduleKeyDeletion", "kms:CancelKeyDeletion"
      ],
      "Resource": "*"
    },
    {
      "Sid": "KeyUsersViaIntegratedServicesOnly",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-app-role" },
      "Action": [
        "kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*",
        "kms:GenerateDataKey*", "kms:DescribeKey"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": [
            "s3.ap-northeast-2.amazonaws.com",
            "secretsmanager.ap-northeast-2.amazonaws.com"
          ]
        }
      }
    },
    {
      "Sid": "AllowAttachmentOfPersistentResources",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-app-role" },
      "Action": ["kms:CreateGrant", "kms:ListGrants", "kms:RevokeGrant"],
      "Resource": "*",
      "Condition": { "Bool": { "kms:GrantIsForAWSResource": "true" } }
    }
  ]
}
```

> 📖 위 두 액션 목록은 *AWS Security Cookbook* 4장이 기본 키 정책의 **"키 관리자 정책 문서 문장에 포함되는 중요한 작업들"** 과 **"키 사용자 정책 문서 문장에 포함되는 중요한 작업들"** 로 열거한 것 그대로입니다. 와일드카드에 대해서는 **"AWS는 일부 기본 권한에 와일드카드를 넣어두어, AWS가 같은 접두사로 시작하는 새 액션을 만들면 관리자가 자동으로 그 권한을 갖게 했다"** 고 설명합니다.

**네 문장 각각이 하는 일:**

| Sid | 역할 | 빼면 벌어지는 일 |
|---|---|---|
| `EnableIAMUserPermissions` | IAM 정책 위임 활성화 | **키가 잠긴다.** 키 정책에 직접 이름이 적힌 주체 외에는 아무도 못 쓰고, 키 정책을 고칠 수도 없다(13.11 락아웃) |
| `KeyAdministrators` | 키 수명주기 관리 | 관리 주체가 명시적으로 분리되지 않아 "누가 키를 지울 수 있는가"가 IAM 전체에 흩어진다 |
| `KeyUsersViaIntegratedServicesOnly` | 암·복호화 사용 + **경로 제한** | 앱 자격 증명 유출 시 공격자가 KMS를 **직접** 호출해 임의 암호문을 복호화할 수 있다 |
| `AllowAttachmentOfPersistentResources` | AWS 서비스가 대신 그랜트를 만들 수 있게 함 | EBS 볼륨 연결, Auto Scaling, RDS 스냅샷 같은 통합 동작이 실패한다 |

**🔴 그리고 반드시 함께 하십시오.**

- **키 관리자 역할과 키 사용자 역할을 분리하십시오.** 관리자는 정책을 고쳐 스스로 사용자가 될 수 있으므로 **그 변경을 탐지하는 것**이 통제입니다. `PutKeyPolicy`·`ScheduleKeyDeletion`·`DisableKey`를 EventBridge로 알람하십시오(5장·26장).
- **`EnableIAMUserPermissions` 문장을 삭제하지 마십시오**(13.11). 넓은 IAM 권한이 걱정되면 지우는 대신 **SCP로 `kms:` 액션을 좁히거나**(4장) 키 정책에 조건을 추가하십시오(13.8).

---

## 13.5 KMS 키 생성과 별칭 🧪

> 📖 *AWS Security Cookbook* 4장 "Creating keys in KMS": **"보통 키는 S3의 데이터를 암호화하는 것 같은 특정 용도를 위해 만들어지고 그에 맞게 이름이 붙는다. 기술적으로는 그 키를 다른 서비스 용도로 재사용할 수도 있지만, 그런 경우에는 키 이름을 적절히 짓기를 권한다."**

원서는 콘솔로 진행하지만 반복 가능하도록 CLI로 CANON의 `alias/shopmini/app` 키를 만듭니다.

### ① 키 생성

```bash
export AWS_PROFILE=awssec-lab
export AWS_REGION=ap-northeast-2

KEY_ID=$(aws kms create-key \
  --description "ShopMini application data key (S3 uploads, Secrets Manager)" \
  --key-usage ENCRYPT_DECRYPT \
  --key-spec SYMMETRIC_DEFAULT \
  --origin AWS_KMS \
  --tags TagKey=Project,TagValue=awssec-lab \
         TagKey=Chapter,TagValue=ch13 \
         TagKey=AutoDelete,TagValue=true \
  --query 'KeyMetadata.KeyId' --output text)

echo "KeyId=$KEY_ID"
```

`--tags`를 생성 시점에 붙이십시오. 나중에 `kms:TagResource` 권한이 없는 주체는 태그를 붙일 수 없어 정리 스크립트가 이 키를 찾지 못합니다.

### ② 별칭 생성

```bash
aws kms create-alias \
  --alias-name alias/shopmini/app \
  --target-key-id "$KEY_ID"

aws kms list-aliases --query "Aliases[?AliasName=='alias/shopmini/app']"
```

**별칭은 선택이 아니라 필수 관행입니다.** 코드와 IaC에는 키 ID 대신 `alias/shopmini/app`을 넣으십시오. 수동 순환(13.6) 때 코드를 고치지 않고 별칭만 옮기면 됩니다.

> 📖 *AWS Security Cookbook* 4장: **"수동 키 순환을 할 때는 별칭으로 CMK를 참조하는 것이 좋은 관행이다. 별칭이 이전 CMK 대신 새 CMK를 가리키도록 업데이트할 수 있다. (…) 별칭은 AWS KMS API의 `update-alias` 하위 명령으로 업데이트할 수 있다."**

### ③ 키 정책 적용

13.4의 정책을 파일로 저장하고 넣습니다.

```bash
aws kms put-key-policy \
  --key-id "$KEY_ID" \
  --policy-name default \
  --policy file://key-policy-shopmini-app.json

aws kms get-key-policy \
  --key-id alias/shopmini/app \
  --policy-name default \
  --output text
```

### ④ 봉투 암호화 직접 해보기

```bash
# 데이터 키 발급 — 평문 DEK 와 암호화된 DEK 를 동시에 받는다
aws kms generate-data-key \
  --key-id alias/shopmini/app \
  --key-spec AES_256 \
  --encryption-context purpose=lab,Chapter=ch13 \
  --output json > datakey.json

# 평문 DEK(Base64 → 16진수) — 실제 앱에서는 파일로 쓰지 않고 메모리에서만 사용
DEK_HEX=$(jq -r '.Plaintext' datakey.json | base64 -d | xxd -p -c 64)
# 암호화된 DEK — 이것을 암호문 옆에 저장한다
jq -r '.CiphertextBlob' datakey.json | base64 -d > wrapped-dek.bin

# 로컬에서 대칭 암호화 (실무에서는 AWS Encryption SDK 사용을 권장)
IV_HEX=$(openssl rand -hex 16)
openssl enc -aes-256-cbc -K "$DEK_HEX" -iv "$IV_HEX" \
  -in secret.txt -out secret.enc
unset DEK_HEX            # 평문 DEK 즉시 폐기. IV 는 암호문과 함께 보관한다.

# 복호화 — 저장해둔 wrapped-dek.bin 을 KMS 에 되돌려준다
DEK_HEX=$(aws kms decrypt \
  --ciphertext-blob fileb://wrapped-dek.bin \
  --encryption-context purpose=lab,Chapter=ch13 \
  --query Plaintext --output text | base64 -d | xxd -p -c 64)
openssl enc -d -aes-256-cbc -K "$DEK_HEX" -iv "$IV_HEX" \
  -in secret.enc -out secret.out
```

> ⚠️ **CLI v2 주의** — `aws kms encrypt --plaintext`는 CLI v2에서 **Base64 값 또는 `fileb://` 경로**를 요구합니다. `--plaintext "hello"` 같은 원서의 v1 문법은 v2에서 실패하거나 다르게 해석됩니다. `Decrypt` 출력의 `Plaintext`도 Base64이므로 `base64 -d`가 필요합니다.

### 실습 정리 — 13.10까지 마친 뒤에 실행

이 키는 13.6~13.10 실습에서 계속 씁니다. **장의 실습을 모두 마친 뒤에** 정리하십시오.

```bash
aws kms delete-alias --alias-name alias/shopmini/app
aws kms schedule-key-deletion --key-id "$KEY_ID" --pending-window-in-days 7
```

**7일이 최솟값입니다**(실습용에만 쓰십시오). 대기 기간이 왜 존재하는지는 13.11에서 다룹니다.

---

## 13.6 키 순환(Rotation) 🧪

> 📖 *AWS Security Cookbook* 4장 "Rotating keys in KMS": **"키를 정기적으로 순환하는 것은 키를 쓸 때 따라야 할 모범 사례다. 키 순환은 규제 규칙이나 회사 정책에 따른 요구사항일 수도 있다."**

### 자동 순환이 실제로 하는 일

```bash
aws kms enable-key-rotation --key-id alias/shopmini/app
aws kms get-key-rotation-status --key-id alias/shopmini/app
```

> 📖 *AWS Security Cookbook* 4장: **"AWS는 CMK를 매년 순환하되, 옛 백킹 키로 암호화된 데이터를 복호화할 수 있도록 옛 백킹 키의 사본을 유지한다. (…) 자동 순환에서는 CMK의 백킹 키만 순환된다. 이는 CMK ID, ARN, 리전, 정책, 권한, 그 밖의 속성이 그대로 유지된다는 뜻이다."**

**반드시 이해해야 할 것: 자동 순환은 "재암호화"가 아닙니다.**

```
   활성화 전 :  KMS 키 (ARN 고정)
                 └── 백킹 키 v1  ← 모든 암·복호화

   1년 후 자동 순환 :  KMS 키 (ARN·정책·별칭 전부 그대로)
                 ├── 백킹 키 v1  ← v1 로 암호화된 기존 암호문 복호화 전용
                 └── 백킹 키 v2  ← 신규 암호화

   ▶ 기존 S3 객체·EBS 볼륨은 재암호화되지 않는다.
   ▶ 애플리케이션은 아무것도 바꿀 필요가 없다.
   ▶ 그러므로 "키 순환했으니 예전 키 유출 위험이 사라졌다"는 것은 사실이 아니다.
```

> 📖 *AWS Security Cookbook* 4장: **"자동 키 순환에서는 CMK만 순환되고 데이터 키는 순환되지 않는다. (…) 키 순환을 비활성화하더라도 옛 백킹 키는 그 키로 암호화된 데이터를 복호화하기 위해 여전히 사용 가능하다. (…) 키가 삭제 대기 중이면 키 순환은 일어나지 않는다."**

> 💡 **원서 이후 변경** — 원서 집필 시점의 자동 순환 주기는 **365일 고정**, AWS 관리형 키는 3년이었습니다. 현재는 고객 관리형 키의 순환 주기를 **90일~2560일에서 지정**할 수 있고(`--rotation-period-in-days`), **온디맨드 순환**(`rotate-key-on-demand`)과 순환 이력 조회(`list-key-rotations`)가 가능하며, **AWS 관리형 키는 1년** 주기입니다.

```bash
# 순환 주기를 180일로 지정
aws kms enable-key-rotation \
  --key-id alias/shopmini/app \
  --rotation-period-in-days 180

# 침해 의심 시 즉시 순환
aws kms rotate-key-on-demand --key-id alias/shopmini/app
aws kms list-key-rotations --key-id alias/shopmini/app
```

### 수동 순환이 필요한 경우

| 상황 | 자동 순환 | 대응 |
|---|---|---|
| 외부에서 가져온 키 자료(BYOK, `Origin=EXTERNAL`) | **불가** | 새 키 생성 → 별칭 이동 → 필요 시 `re-encrypt` (14.5) |
| CloudHSM 커스텀 키 스토어(`Origin=AWS_CLOUDHSM`) | **불가** | 수동 순환 (14.4) |
| 규제가 "키 자료가 아니라 키 자체의 교체"를 요구 | 불충분 | 새 키 생성 → 별칭 이동 |
| 키가 실제로 침해되어 **옛 암호문까지 무력화**해야 함 | 불충분 | 새 키 생성 → 데이터 재암호화 → 옛 키 삭제 예약 |

> 📖 *AWS Security Cookbook* 4장: **"자동 키 순환은 AWS CloudHSM 클러스터가 뒷받침하는 커스텀 키 스토어에서는 지원되지 않는다. 그런 CMK는 `Origin` 필드 값이 `AWS_CloudHSM`이다. 이 경우 키를 수동으로 순환하고 암호화된 데이터나 별칭이 새 키를 쓰도록 변경해야 한다."**

**수동 순환 절차 🧪**

```bash
# ① 새 키 생성 + 동일한 키 정책 적용
NEW_KEY_ID=$(aws kms create-key \
  --description "ShopMini application data key (rotation gen-2)" \
  --tags TagKey=Project,TagValue=awssec-lab TagKey=Chapter,TagValue=ch13 \
  --query 'KeyMetadata.KeyId' --output text)
aws kms put-key-policy --key-id "$NEW_KEY_ID" \
  --policy-name default --policy file://key-policy-shopmini-app.json

# ② 별칭을 새 키로 이동 — 애플리케이션 코드는 그대로
aws kms update-alias --alias-name alias/shopmini/app --target-key-id "$NEW_KEY_ID"

# ③ 기존 암호문을 새 키로 재암호화(평문이 클라이언트에 노출되지 않는다)
aws kms re-encrypt \
  --ciphertext-blob fileb://wrapped-dek.bin \
  --source-key-id "$OLD_KEY_ID" \
  --destination-key-id "$NEW_KEY_ID" \
  --query CiphertextBlob --output text | base64 -d > wrapped-dek-new.bin

# ④ 옛 키는 즉시 삭제하지 말고 '비활성화'부터. 미처 옮기지 못한 암호문이 드러난다.
aws kms disable-key --key-id "$OLD_KEY_ID"
```

> 📖 *AWS Security Cookbook* 4장: **"AWS KMS API의 `re-encrypt` 하위 명령을 써서 클라이언트 측에 평문을 노출하지 않고 서버 측에서 데이터를 복호화하고 새 CMK로 다시 암호화할 수 있다. 이 하위 명령은 암호문의 암호화 컨텍스트를 바꾸는 데에도 쓸 수 있다."** ④단계의 근거도 원서에 있습니다. **"키가 비활성화되면 그 키를 다시 활성화할 때까지 그 키로 암호화된 어떤 데이터도 복호화할 수 없다."**

삭제와 달리 **비활성화는 되돌릴 수 있습니다.** 이 성질이 안전한 순환 절차의 핵심입니다.

---

## 13.7 그랜트(Grant)로 프로그래밍 방식 권한 부여 🧪

> 📖 *AWS Security Cookbook* 4장 "Granting permissions programmatically with grants": **"KMS 그랜트는 encrypt, decrypt, describe keys 등의 AWS KMS API 작업에 대해 임시의 세분화된 권한을 주는 데 쓸 수 있다. 그랜트를 사용해 자기 계정의 사용자에게, 심지어 다른 계정의 사용자에게도 접근을 제공할 수 있다."** 그리고 **"그랜트는 키 정책의 대안이다."**

### 언제 키 정책 대신 그랜트인가

| 기준 | 키 정책 | 그랜트 |
|---|---|---|
| 성격 | **선언적·영구적** | **프로그래밍적·일시적** |
| 변경 방식 | JSON 전체 교체(`PutKeyPolicy`) | 개별 생성/폐기 (`CreateGrant`/`RevokeGrant`) |
| 동시성 | 여러 팀이 동시에 고치면 충돌·덮어쓰기 | 서로 독립적 |
| 개수 | 문서 크기 제한 | 키당 다수 생성 가능 |
| 적합한 경우 | 조직 표준, 상시 워크로드 역할 | **배치 작업 1회 위임**, AWS 서비스의 자동 위임, 만료가 있는 접근 |

**결정 기준은 하나입니다: "이 권한이 6개월 뒤에도 있어야 하는가?"** 있어야 하면 키 정책, 아니면 그랜트입니다. 그리고 여러분은 이미 모르는 사이에 그랜트를 쓰고 있습니다 — **EBS 볼륨을 EC2에 연결하거나 Auto Scaling이 암호화된 볼륨으로 인스턴스를 띄울 때 AWS 서비스가 대신 그랜트를 만들기** 때문입니다. 13.4의 `AllowAttachmentOfPersistentResources`가 그것을 허용합니다.

### 실습

```bash
BATCH_ROLE="arn:aws:iam::111122223333:role/shopmini-nightly-batch"

# ① 그랜트 생성 — 복호화만, 특정 암호화 컨텍스트에서만
GRANT=$(aws kms create-grant \
  --key-id alias/shopmini/app \
  --grantee-principal "$BATCH_ROLE" \
  --retiring-principal "arn:aws:iam::111122223333:role/shopmini-key-admin" \
  --operations "Decrypt" "DescribeKey" \
  --constraints EncryptionContextSubset={app=shopmini,tier=uploads} \
  --name shopmini-nightly-batch-decrypt \
  --output json)

GRANT_ID=$(echo "$GRANT"    | jq -r '.GrantId')
GRANT_TOKEN=$(echo "$GRANT" | jq -r '.GrantToken')

# ② 방금 만든 그랜트를 즉시 쓰려면 그랜트 토큰을 함께 전달한다
aws kms decrypt \
  --ciphertext-blob fileb://wrapped-dek.bin \
  --encryption-context app=shopmini,tier=uploads \
  --grant-tokens "$GRANT_TOKEN" \
  --query Plaintext --output text | base64 -d > /dev/shm/dek.bin

# ③ 확인
aws kms list-grants --key-id alias/shopmini/app \
  --query 'Grants[].{Id:GrantId,Name:Name,Grantee:GranteePrincipal,Ops:Operations}'

# ④ 작업이 끝나면 폐기(retire) — 정상 종료 시
aws kms retire-grant --key-id alias/shopmini/app --grant-id "$GRANT_ID"

# ④' 능동적으로 차단해야 하면 취소(revoke)
aws kms revoke-grant --key-id alias/shopmini/app --grant-id "$GRANT_ID"
```

### 🔴 그랜트 토큰이 필요한 이유

> 📖 *AWS Security Cookbook* 4장: **"그랜트를 만들면 AWS가 따르는 최종 일관성(eventual consistency) 모델 때문에 권한이 즉시 반영되지 않을 수 있다. 생성 그랜트 명령에서 받은 그랜트 토큰을 이후 요청에 사용하면 최종 일관성에 따른 지연을 피할 수 있다."**

**"방금 그랜트를 만들었는데 `AccessDeniedException`이 난다"** 는 신고의 거의 전부가 이것입니다. `CreateGrant` 응답의 `GrantToken`을 즉시 다음 호출에 넘기십시오.

### retire vs revoke

> 📖 *AWS Security Cookbook* 4장: **"AWS 문서는 정리할 때 다 쓴 그랜트는 `retire-grant` 하위 명령으로 폐기하되, 그것에 의존하는 작업을 능동적으로 거부하려 할 때는 `revoke-grant` 하위 명령으로 취소하기를 권장한다."** 누가 취소할 수 있는지도 명시합니다. **"`revoke-grant` 하위 명령은 그것을 만든 계정의 루트 사용자, 그랜트의 `RetiringPrincipal`, 또는 `RetireGrant` 작업에 대한 그랜트를 받은 `GranteePrincipal`이 실행할 수 있다."**

`--retiring-principal`을 지정해두면 **그랜트를 만든 주체가 사라져도** 키 관리자가 정리할 수 있습니다. 자동화가 만든 그랜트가 영원히 남는 것을 막으므로 반드시 지정하고, `aws kms list-retirable-grants --retiring-principal <ARN>`으로 정기 점검하십시오.

**지원되는 그랜트 작업**은 원서가 열거한 `Encrypt`, `Decrypt`, `GenerateDataKey`, `GenerateDataKeyWithoutPlaintext`, `ReEncryptFrom`, `ReEncryptTo`, `CreateGrant`, `RetireGrant`, `DescribeKey`에 더해 현재는 `Sign`, `Verify`, `GetPublicKey`, `GenerateDataKeyPair`, `GenerateMac`, `VerifyMac` 등이 추가되었습니다.

---

## 13.8 조건 키를 활용한 키 정책 🧪

> 📖 *AWS Security Cookbook* 4장 "Using key policies with conditional keys": **"CMK에 연결된 리소스 기반 정책을 키 정책이라고 부른다."** 원서는 S3 버킷을 이 키로 암호화한 뒤 `kms:ViaService` 조건으로 명시적 Deny를 넣는 실험을 하고 이렇게 정리합니다. **"그다음 `kms:ViaService` 조건 키를 써서 S3 서비스에 대한 명시적 Deny를 추가하고 같은 파일을 다시 복호화해보았다. 이번에는 복호화할 수 없었다."**

### 실재하는 KMS 조건 키

> 📖 *AWS Security Cookbook* 4장: **"AWS KMS 조건 키에는 `kms:BypassPolicyLockoutSafetyCheck`, `kms:CallerAccount`, `kms:EncryptionContext`, `kms:EncryptionContextKeys`, `kms:ExpirationModel`, `kms:GrantConstraintType`, `kms:GrantIsForAWSResource`, `kms:GrantOperations`, `kms:GranteePrincipal`, `kms:KeyOrigin`, `kms:ReEncryptOnSameKey`, `kms:RetiringPrincipal`, `kms:ValidTo`, `kms:ViaService`, `kms:WrappingAlgorithm`, `kms:WrappingKeySpec`가 있다."**

실무에서 실제로 쓰게 되는 것은 이 중 다섯 개입니다.

| 조건 키 | 값 | 무엇을 막는가 |
|---|---|---|
| `kms:ViaService` | `s3.ap-northeast-2.amazonaws.com` 형태 | **KMS 직접 호출**. 지정한 서비스를 경유한 요청만 허용 |
| `kms:EncryptionContext:<키이름>` | 문자열 | 지정한 컨텍스트가 붙은 암호문만 처리 → 13.9 |
| `kms:EncryptionContextKeys` | 컨텍스트 **키 이름** 목록 | 컨텍스트를 아예 생략한 호출 차단 |
| `kms:CallerAccount` | 계정 ID | 크로스 계정 요청의 출처 계정 한정 → 13.10 |
| `kms:GrantIsForAWSResource` | `"true"` | 사람이 만드는 그랜트는 막고 **AWS 서비스가 대신 만드는 그랜트만** 허용 |

> ⚠️ `kms:ViaService`는 **요청이 서비스를 경유했는지**만 보고 그 서비스가 어떤 리소스를 다루는지는 보지 않습니다. `s3.ap-northeast-2.amazonaws.com`을 허용하면 그 계정의 **모든 S3 버킷**이 허용됩니다. 특정 버킷으로 좁히려면 `kms:EncryptionContext:aws:s3:arn`을 함께 걸어야 합니다.

### 조합 예제 🧪

`shopmini-uploads` 버킷 경유의 사용만 허용하고, 다른 모든 경로를 막는 문장입니다.

```json
{
  "Sid": "AllowUploadsBucketOnly",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-app-role" },
  "Action": ["kms:Decrypt", "kms:GenerateDataKey*", "kms:DescribeKey"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "kms:ViaService": "s3.ap-northeast-2.amazonaws.com",
      "kms:CallerAccount": "111122223333"
    },
    "StringLike": {
      "kms:EncryptionContext:aws:s3:arn": "arn:aws:s3:::shopmini-uploads/*"
    }
  }
}
```

조직 경계를 벗어난 사용을 차단하는 Deny 문장도 함께 쓰십시오(글로벌 조건 키).

```json
{
  "Sid": "DenyOutsideOrganization",
  "Effect": "Deny",
  "Principal": "*",
  "Action": [
    "kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*",
    "kms:GenerateDataKey*", "kms:CreateGrant"
  ],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": { "aws:PrincipalOrgID": "o-exampleorgid" },
    "BoolIfExists": { "aws:PrincipalIsAWSService": "false" }
  }
}
```

> ⚠️ `BoolIfExists`로 `aws:PrincipalIsAWSService`를 예외 처리하지 않으면 CloudTrail·Config·백업처럼 **서비스 주체가 대신 키를 쓰는 경로**가 함께 막혀 장애가 납니다. Deny를 넣기 전에 CloudTrail에서 이 키의 실제 호출자 목록을 확인하십시오.

> 📖 *AWS Security Cookbook* 4장: **"`Principal`은 누가 권한을 받는지 지정한다. 허용되는 값에는 AWS 계정(루트), IAM 사용자, IAM 역할, 지원되는 AWS 서비스가 포함된다. (…) `Resource`는 정책을 적용할 리소스를 지정한다. 우리는 모든 리소스를 뜻하기 위해 `*`를 지정했다."**

키 정책의 `"Resource"`가 항상 `*`인 것은 키 정책이 **이미 특정 키에 붙어 있어서**입니다. IAM 정책에서는 반대로 키 ARN을 정확히 써야 합니다.

> 📖 *AWS Security Cookbook* 4장: **"CMK의 ARN은 `arn:aws:kms:<region>:<account ID>:key/<key ID>` 형태를 갖는다. 일부 KMS 작업은 별칭을 리소스로 사용하는 것도 허용한다. 별칭 ARN은 `arn:aws:kms:<region>:<account ID>:alias/<alias name>` 형태를 갖는다."**

---

## 13.9 🔴 암호화 컨텍스트(Encryption Context) 활용

### 정의

> 📖 *AWS Security Cookbook* 4장: **"암호화 컨텍스트는 추가 인증 검사를 구성하는 선택적인 키-값 쌍 집합이다. 암호화에 사용된 것과 동일한 암호화 컨텍스트가 복호화와 재암호화에도 사용되어야 한다. 암호화 컨텍스트는 비밀이 아니므로 AWS CloudTrail 로그 안에 평문으로 나타나며, 그 덕분에 암호화 작업의 모니터링과 감사에 유용하다."**

암호화 컨텍스트는 **AAD(Additional Authenticated Data)** 입니다. 암호문에 포함되지는 않지만 **암호학적으로 묶이므로** 한 글자만 달라도 복호화가 `InvalidCiphertextException`으로 실패합니다. 동시에 로그에 평문으로 남으므로, **절대로 비밀번호·토큰·개인정보를 넣지 마십시오.** 넣어야 할 것은 "이 암호문이 무엇에 관한 것인가"를 나타내는 식별자입니다.

### 🔴 반드시 이렇게 구성하라

**모든 `Encrypt`·`GenerateDataKey` 호출에 컨텍스트를 붙이고, 키 정책에서 강제하십시오.**

```bash
# 암호화 — 컨텍스트로 "이것은 어떤 테넌트의 어떤 용도인지"를 못 박는다
aws kms generate-data-key \
  --key-id alias/shopmini/app \
  --key-spec AES_256 \
  --encryption-context tenant=acme-corp,purpose=upload,env=prod \
  --query CiphertextBlob --output text | base64 -d > wrapped-dek.bin

# 복호화 — 컨텍스트가 정확히 일치해야만 성공
aws kms decrypt \
  --ciphertext-blob fileb://wrapped-dek.bin \
  --encryption-context tenant=acme-corp,purpose=upload,env=prod \
  --query Plaintext --output text | base64 -d > /dev/shm/dek.bin
```

컨텍스트를 강제하는 키 정책 문장은 이렇습니다.

```json
{
  "Sid": "RequireEncryptionContext",
  "Effect": "Deny",
  "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-app-role" },
  "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*"],
  "Resource": "*",
  "Condition": {
    "Null": {
      "kms:EncryptionContext:tenant": "true",
      "kms:ViaService": "true"
    }
  }
}
```

`Null` 연산자로 **`tenant` 키가 없는 요청을 거부**합니다. 특정 값만 허용하려면 `StringEquals`로 `kms:EncryptionContext:env`를 `prod`에 고정하는 문장을 추가하십시오.

> ⚠️ 두 번째 `Null` 조건이 중요합니다. 이것이 없으면 **S3·Secrets Manager 같은 통합 서비스 경유 호출까지 함께 막힙니다.** 그 서비스들은 자기 고유의 컨텍스트 키(`aws:s3:arn` 등)를 붙이지 `tenant`를 붙이지 않기 때문입니다. `kms:ViaService`가 **없을 때만**(= 앱이 KMS를 직접 호출할 때만) 이 Deny가 걸리도록 범위를 좁혀야 합니다.

### 이렇게 하지 않으면 벌어지는 일

**① 혼동 공격(Confused Deputy).** ShopMini가 멀티테넌트라면, 컨텍스트가 없을 때 테넌트 A의 blob과 B의 blob은 KMS 입장에서 **구분되지 않습니다.** 앱에 객체 참조 취약점이 하나 있으면 A 사용자가 B의 blob을 앱에 던져 복호화시킬 수 있습니다 — **KMS는 "이 암호문을 이 사용자가 요청해도 되는가"를 알 방법이 없습니다.** 컨텍스트에 `tenant=`를 넣고 앱이 세션의 테넌트로 채우면, A의 세션에서 B의 blob은 복호화 자체가 실패합니다.

**② 감사 추적 불가.** CloudTrail의 `Decrypt` 이벤트에는 암호문이 남지 않습니다. 컨텍스트가 없으면 "누가 이 키로 복호화를 3만 번 했다"까지만 남고 **무엇을 복호화했는지는 알 수 없습니다.** 컨텍스트가 있으면 `requestParameters.encryptionContext`가 찍혀 **영향 범위를 정확히 뽑을 수 있습니다.**

**③ 세분화된 권한 부여 불가.** 13.7의 그랜트 `--constraints`와 13.8의 조건 키는 모두 컨텍스트를 전제로 합니다. 컨텍스트가 없으면 "이 배치는 uploads 계층만 복호화" 같은 위임을 표현할 수 없어, 결국 키 전체 권한을 줄 수밖에 없습니다.

### AWS 서비스가 자동으로 붙이는 컨텍스트

통합 서비스는 아무것도 하지 않아도 컨텍스트를 붙입니다. 이것을 알면 키 정책을 좁게 쓸 수 있습니다.

| 서비스 | 컨텍스트 키 | 값 |
|---|---|---|
| S3 (SSE-KMS) | `aws:s3:arn` | 객체 ARN. **버킷 키 사용 시 버킷 ARN** |
| Secrets Manager | `SecretARN`, `SecretVersionId` | 시크릿 ARN |
| Systems Manager Parameter Store | `PARAMETER_ARN` | 파라미터 ARN |
| EBS | `aws:ebs:id` | 볼륨/스냅샷 ID |

> ⚠️ **버킷 키를 켜면 컨텍스트가 객체 ARN에서 버킷 ARN으로 바뀝니다.** `kms:EncryptionContext:aws:s3:arn`을 객체 단위로 걸어둔 키 정책은 버킷 키 활성화 순간 전부 거부로 바뀝니다(13.11의 비용 최적화와 충돌). **`StringLike`로 `arn:aws:s3:::shopmini-uploads*` 처럼 두 ARN을 모두 포괄**하십시오. 또 암호화 컨텍스트는 **대칭 키에서만** 동작합니다.

---

## 13.10 크로스 계정 키 공유 🧪 ⚠️

### 사고 시나리오

보안 계정(`444455556666`)의 포렌식 팀이 운영 계정(`111122223333`)의 암호화된 EBS 스냅샷을 공유받아 분석하려 합니다. 스냅샷 공유는 성공했는데 복원 시 `KMS.KMSKeyNotAccessibleFault`가 납니다. 담당자가 보안 계정 IAM 역할에 `kms:*`를 붙여도, `AdministratorAccess`를 붙여도 **여전히 실패합니다.**

### 원인

**13.4의 원칙이 크로스 계정에서 두 배로 적용되기 때문입니다.** 상대 계정의 IAM 정책은 **자기 계정의 위임 한도**만 정의합니다. 키 소유 계정의 키 정책이 상대 계정을 허용하지 않으면 상대 계정 IAM에 무엇을 써도 의미가 없습니다.

> 📖 *AWS Security Cookbook* 4장 "Sharing customer-managed keys across accounts": **"관리자가 아닌 사용자로 암호화하려면 계정 2의 관리자 사용자가 접근이 필요한 사용자나 역할에 권한을 위임해야 한다. 우리는 IAM 정책을 통해 이것을 했다."**

즉 **두 계정 모두에서 허용이 나와야 하고, 하나라도 빠지면 거부**입니다. AWS 서비스가 중간에 끼면 그랜트까지 세 번째 관문이 됩니다.

### 올바른 구성 — 3중 확인 🧪

**① 키 소유 계정(`111122223333`)의 키 정책에 상대 계정 문장 추가**

```json
{
  "Sid": "AllowSecurityAccountUse",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::444455556666:root" },
  "Action": [
    "kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*",
    "kms:GenerateDataKey*", "kms:DescribeKey"
  ],
  "Resource": "*",
  "Condition": {
    "StringEquals": { "kms:CallerAccount": "444455556666" }
  }
}
```

`Principal`에 상대 계정 **루트**를 쓰는 것이 표준입니다. 특정 역할 ARN을 쓰면 그 역할이 삭제·재생성될 때 키 정책이 깨집니다. **위임 범위는 상대 계정이 자기 IAM으로 좁히도록** 두는 것이 AWS의 크로스 계정 모델입니다.

**② 상대 계정(`444455556666`)의 IAM 정책 — 키 ARN을 정확히 지정**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DelegateKMSFromProdAccount",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:DescribeKey",
        "kms:GenerateDataKeyWithoutPlaintext",
        "kms:ReEncryptFrom"
      ],
      "Resource": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab"
    },
    {
      "Sid": "AllowGrantsForAWSResources",
      "Effect": "Allow",
      "Action": ["kms:CreateGrant"],
      "Resource": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab",
      "Condition": { "Bool": { "kms:GrantIsForAWSResource": "true" } }
    }
  ]
}
```

**③ 그랜트 — AWS 서비스가 대신 만들도록 허용**

EBS·RDS 복원과 Auto Scaling은 자기 자신을 위한 그랜트를 만들어야 동작하므로, ①의 키 정책에도 다음 문장이 필요합니다.

```json
{
  "Sid": "AllowAttachmentOfPersistentResourcesCrossAccount",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::444455556666:root" },
  "Action": ["kms:CreateGrant", "kms:ListGrants", "kms:RevokeGrant"],
  "Resource": "*",
  "Condition": { "Bool": { "kms:GrantIsForAWSResource": "true" } }
}
```

> 📖 *AWS Security Cookbook* 4장이 "콘솔에서 다른 계정을 추가하면 키 정책에 추가된다"며 보여주는 `"Sid": "Allow attachment of persistent resources"` 문장이 바로 이 형태입니다.

### ⚠️ 크로스 계정에서 특히 자주 걸리는 것

| 함정 | 증상 | 해결 |
|---|---|---|
| **별칭을 그대로 씀** | `NotFoundException` | 별칭은 **호출자 계정에서 해석**된다. 크로스 계정 호출은 **반드시 키 ARN** |
| 콘솔에서 외부 키가 목록에 안 보임 | 드롭다운에 키가 없음 | 원서 지적대로 API/CLI로 ARN을 직접 지정 |
| 스냅샷만 공유하고 키를 안 공유 | `KMSKeyNotAccessibleFault` | 스냅샷 공유 ≠ 키 공유. 둘 다 필요 |
| AWS 관리형 키(`aws/ebs`)로 암호화됨 | 공유 자체가 불가 | **먼저 고객 관리형 키로 스냅샷 복사** 후 공유 |
| 상대 계정 SCP가 `kms:` 를 막음 | 양쪽 정책이 맞는데도 거부 | SCP 확인(4장) — 7.3 평가 순서 |

> 📖 *AWS Security Cookbook* 4장: **"대부분의 통합 서비스(S3, EC2 등)에서 계정 간 키 권한 위임이 지원되지만, 콘솔에서 자동으로 키를 선택하는 기능은 지원되지 않을 수 있다. (…) 콘솔에서 제약이 있다면 키의 ARN을 지정해 API로 처리해야 한다."**

---

## 13.11 ⚠️ KMS 운영 함정

### 함정 ① 키 삭제 대기 기간 — 되돌릴 수 없는 유일한 작업

> 📖 *AWS Security Cookbook* 4장: **"우리는 키를 직접 삭제할 수 없다. 키 관리자는 키를 비활성화하거나 삭제를 예약할 수 있다. (…) 7일에서 30일 사이(양 끝 포함)의 대기 기간을 지정할 수 있다."** 그리고 **"키가 삭제되고 나면 그 키로 암호화된 어떤 데이터도 복호화할 수 없다."**

**사고 시나리오 → 원인.** 정리 스크립트가 `AutoDelete=true` 태그를 따라가다 `alias/shopmini/app` 키에 `schedule-key-deletion --pending-window-in-days 7`을 걸었습니다. 7일이 지나고 RDS 스냅샷과 S3 객체 4TB가 **영구히 복호화 불가**가 됩니다. **대기 기간 자체를 아무도 보고 있지 않았습니다.**

**올바른 구성.**

```bash
# 1) 삭제 전 반드시 '비활성화'를 먼저 하고 최소 2주 관찰한다 (되돌릴 수 있다)
aws kms disable-key --key-id "$KEY_ID"

# 2) 삭제 예약은 최대 대기 기간으로
aws kms schedule-key-deletion --key-id "$KEY_ID" --pending-window-in-days 30

# 3) 잘못 걸었으면 즉시 취소
aws kms cancel-key-deletion --key-id "$KEY_ID"
aws kms enable-key --key-id "$KEY_ID"
```

`ScheduleKeyDeletion`·`DisableKey`를 EventBridge로 알람하고, 삭제 예약 전 **CloudTrail에서 `Decrypt` 이력을 확인**하십시오(최근 90일 호출 0인 키만 후보). SCP로 `kms:ScheduleKeyDeletion`은 **키 관리자 역할에만** 허용하십시오.

### 함정 ② 리전 종속 — DR 시나리오에서 드러난다

**사고 시나리오 → 원인.** DR을 위해 `ap-northeast-2`의 RDS 스냅샷과 S3 객체를 `ap-northeast-1`로 복제해두었는데, 실제 재해 상황에서 도쿄 리전 복원이 실패합니다. **KMS 키는 리전 종속**(13.3)이라 크로스 리전 복사는 대상 리전 키로 재암호화되어야 하는데 대상 리전에 그 키가 없었습니다. S3 복제(CRR)는 규칙에 대상 키를 지정하지 않으면 조용히 실패합니다.

**올바른 구성.** **DR 리전에 동일한 별칭(`alias/shopmini/app`)의 키를 미리 만들어 두십시오** — 코드가 별칭만 참조하면 리전 전환 시 변경이 없습니다. S3 복제 규칙에 대상 키를 명시하고 복제 역할에 대상 리전 키의 `kms:Encrypt` 권한을 주며, RDS/EBS는 **스냅샷을 복사할 때** 대상 리전 키를 지정합니다(`copy-snapshot --kms-key-id`). 그리고 **DR 훈련에서 반드시 "실제 복원"까지** 하십시오. 복제 성공은 복원 가능을 뜻하지 않습니다.

### 함정 ③ API 스로틀링 — 트래픽 급증 시 앱 전체 장애

**사고 시나리오 → 원인.** 세일로 업로드 트래픽이 20배가 되자 **애플리케이션 전체**가 5xx를 뱉고, 로그에는 `ThrottlingException: Rate exceeded`가 가득합니다. KMS 암호화 작업은 **계정·리전 단위의 공유 요청 할당량**을 씁니다. 앱이 객체마다 `GenerateDataKey`를 호출했고, 같은 계정의 Secrets Manager·CloudTrail 복호화가 **같은 할당량을 나눠 쓰고** 있었습니다.

**올바른 구성.**

| 대책 | 내용 |
|---|---|
| **데이터 키 캐싱** | AWS Encryption SDK의 캐싱 CMM을 사용해 DEK를 재사용. **최대 수명·최대 메시지 수·최대 바이트 수** 상한을 반드시 설정 |
| **S3 버킷 키** | SSE-KMS 버킷에 버킷 키를 켜면 KMS 호출이 대폭 감소. 단 13.9의 컨텍스트 변화 주의 |
| **워크로드 계정 분리** | 배치·분석 워크로드를 별도 계정으로 분리해 할당량을 격리 |
| **모니터링** | CloudWatch `ThrottlingException` 지표와 KMS 요청 수에 알람. 급증 시 조기 인지 |
| **할당량 상향 요청** | Service Quotas에서 사전 요청. **사후 요청은 장애 중에 처리되지 않습니다** |
| **재시도** | SDK 기본 지수 백오프 재시도를 끄지 마십시오 |

> ⚠️ 암호화 작업 할당량은 **리전마다 다르므로** `ap-northeast-2` 값은 Service Quotas 콘솔에서 확인하십시오. `CreateGrant`·`GenerateDataKeyPair`는 **별도의, 훨씬 낮은 할당량**을 씁니다. 키당 그랜트 개수에도 상한이 있어, 자동화가 그랜트를 만들고 폐기하지 않으면 어느 날 `LimitExceededException`으로 신규 EBS 볼륨 연결이 실패합니다.

### 함정 ④ 비용 폭증 — 요금 모델을 모른 채 설계했을 때

KMS 요금은 **고객 관리형 키의 월정액**(키 개수 × 월 단가)과 **요청 과금**(요청 1만 건당 단가) 두 축입니다. 단가는 리전·시점에 따라 다르므로 **공식 요금 페이지에서 확인**하십시오. 사고는 항상 두 번째 축에서 납니다.

| 폭증 패턴 | 왜 터지는가 | 대응 |
|---|---|---|
| 객체마다 `GenerateDataKey` | 작은 객체 수억 개 = 요청 수억 건 | 데이터 키 캐싱, S3 버킷 키 |
| Lambda 콜드 스타트마다 시크릿 복호화 | 동시성 1,000이면 호출 1,000회 | Lambda 확장 캐싱(11.7), 예약 동시성 |
| 로그 스트리밍 암호화 | 이벤트마다 KMS 호출 | 배치 단위 암호화, 로그 그룹 단위 키 |
| 키를 너무 잘게 쪼갬 | 테넌트마다 키 = 키 개수 × 월정액 | 키는 **신뢰 경계 단위**로, 테넌트 구분은 **암호화 컨텍스트**로(13.9) |

마지막 행이 중요합니다. **"키를 많이 만들수록 안전하다"는 직관은 틀립니다.** 키를 나누는 기준은 **"이 데이터에 접근할 수 있는 주체 집합이 다른가"** 이고, 테넌트 구분은 암호화 컨텍스트가 합니다.

### 함정 ⑤ 키 정책 락아웃 — 아무도 키를 못 쓰는 상태

**사고 시나리오 → 원인.** 보안 검토에서 "키 정책의 `Principal: root`가 너무 넓다"는 지적이 나오자 담당자가 `EnableIAMUserPermissions` 문장을 지웠는데, 남은 문장에는 이미 삭제된 옛 역할 ARN만 적혀 있었습니다. 이제 **그 계정의 어떤 주체도 이 키를 쓸 수 없고, 키 정책을 고칠 수도 없습니다.** 13.4 원칙의 이면입니다 — **키 정책이 유일한 관문이므로, 아무도 허용하지 않으면 복구 경로도 함께 사라집니다.** KMS에는 이를 막는 안전 검사가 있고 `kms:BypassPolicyLockoutSafetyCheck`로 우회할 수 있는데(원서가 열거한 조건 키 중 하나), 우회를 켠 자동화가 사고의 주범입니다.

**올바른 구성.**

- **🔴 `EnableIAMUserPermissions` 문장을 삭제하지 말고**, **`kms:BypassPolicyLockoutSafetyCheck`가 `true`인 `PutKeyPolicy`를 SCP로 거부**하십시오.
- **키 정책은 IaC로 관리하고 변경은 리뷰를 거치십시오.** 콘솔 직접 편집은 롤백 경로가 없습니다.
- **항상 2개 이상의 유효한 관리 주체**(키 관리자 + 브레이크글래스 역할)를 남기고 그 역할의 존재를 정기 점검하십시오. 그래도 잠겼다면 **AWS Support**가 유일한 경로입니다.

---

## 이 장의 요약

| 항목 | 핵심 |
|---|---|
| **봉투 암호화** | KMS 키(KEK)는 HSM 밖으로 나오지 않고, `GenerateDataKey`가 준 DEK로 데이터를 암호화한다. DEK는 암호문 옆에 래핑된 채로 저장 |
| **3가지 상태** | 전송 중(TLS) / 저장 중(SSE-KMS) / 사용 중(Nitro Enclaves). 저장 중 암호화는 **자격 증명을 훔친 공격자를 막지 못한다** |
| **암호화 계층** | 위로 갈수록 방어 범위가 넓어지고 기능·성능을 잃는다. 최고 민감 필드만 애플리케이션 수준 |
| **키 유형** | 분류 등급 "내부" 이상은 **고객 관리형 키**. AWS 관리형 키는 키 정책도, 크로스 계정도, 암호적 삭제도 안 된다 |
| **🔴 키 정책** | **IAM 정책만으로는 KMS 키에 접근할 수 없다.** 키 정책이 직접 허용하거나 계정 루트에 위임해야 IAM이 효력을 갖는다 |
| **순환** | 자동 순환은 백킹 키만 바꾸고 **기존 데이터를 재암호화하지 않는다.** ARN·별칭·정책은 그대로 |
| **그랜트** | 임시·세분화 위임. 최종 일관성 때문에 **그랜트 토큰**을 즉시 사용. `--retiring-principal` 필수 |
| **조건 키** | `kms:ViaService`(직접 호출 차단), `kms:EncryptionContext:<키>`, `kms:CallerAccount`, `kms:GrantIsForAWSResource` |
| **🔴 암호화 컨텍스트** | AAD. 틀리면 복호화 실패, CloudTrail에 평문 기록. **비밀을 넣지 말고, 반드시 붙여라** |
| **크로스 계정** | 키 정책 + 상대 계정 IAM + (필요 시) 그랜트 **3중 확인**. 별칭 아닌 **키 ARN** |
| **운영 함정** | 삭제 대기 7~30일(되돌릴 수 없음), 리전 종속, 스로틀링, 요청 과금 폭증, 정책 락아웃 |

## 🔴 필수 구성 체크리스트

- [ ] 분류 등급 "내부" 이상 데이터는 **고객 관리형 KMS 키**로 암호화한다
- [ ] 키 정책에 **키 관리자 역할과 키 사용자 역할을 분리**해 명시한다
- [ ] 키 정책의 `EnableIAMUserPermissions` 문장을 **삭제하지 않는다**
- [ ] 키 사용자 문장에 **`kms:ViaService` 조건**을 걸어 KMS 직접 호출 경로를 차단한다
- [ ] 모든 키에 **별칭**을 붙이고, 코드·IaC는 별칭만 참조한다
- [ ] **자동 키 순환을 활성화**하고, BYOK·CloudHSM 키는 수동 순환 절차를 문서화한다
- [ ] 모든 `Encrypt`/`GenerateDataKey`에 **암호화 컨텍스트**를 붙이고, `Null` 조건으로 강제한다
- [ ] 그랜트에는 **`--retiring-principal`을 지정**하고, `list-retirable-grants`로 정기 점검한다
- [ ] 크로스 계정 공유는 **키 정책·상대 IAM·그랜트 3중 확인** 후 실제 복원까지 테스트한다
- [ ] `PutKeyPolicy`·`ScheduleKeyDeletion`·`DisableKey`·`RevokeGrant`를 **EventBridge로 알람**한다
- [ ] SCP로 `kms:ScheduleKeyDeletion`과 `kms:BypassPolicyLockoutSafetyCheck=true`를 제한한다
- [ ] 운영 키의 삭제 대기 기간은 **30일**, 삭제 전 **비활성화 후 2주 관찰**을 거친다
- [ ] 데이터 키 캐싱 또는 S3 버킷 키로 **KMS 요청 수를 설계 단계에서 산정**한다
- [ ] DR 리전에 **동일 별칭의 키**를 미리 만들고, 복원 훈련을 실제로 수행한다

## ⚠️ 자주 하는 실수

| 실수 | 결과 | 올바른 구성 |
|---|---|---|
| IAM에 `kms:*`만 주고 키 정책을 안 봄 | 크로스 계정·타 팀 키에서 계속 `AccessDenied`. 원인을 IAM에서 찾다 몇 시간 낭비 | 키 정책부터 확인. 키 정책이 최종 관문(13.4) |
| `EnableIAMUserPermissions` 문장 삭제 | **키 영구 락아웃.** AWS Support 외 복구 경로 없음 | 지우지 말고 조건·SCP로 좁힌다(13.11) |
| "자동 순환 켰으니 예전 키 위험 없음" | 기존 암호문은 여전히 옛 백킹 키로 복호화됨 | 실제 침해 시엔 새 키 + **재암호화**(13.6) |
| 암호화 컨텍스트 미사용 | 멀티테넌트 혼동 공격, CloudTrail로 **유출 범위 확정 불가** | 전 호출에 컨텍스트 + `Null` 조건 강제(13.9) |
| 컨텍스트에 토큰·개인정보를 넣음 | **CloudTrail 로그에 평문으로 영구 기록** | 식별자만. 비밀은 절대 금지 |
| 크로스 계정 호출에 별칭 사용 | `NotFoundException` — 별칭은 호출자 계정에서 해석됨 | 키 ARN 전체를 지정(13.10) |
| 그랜트 생성 직후 바로 호출 | 최종 일관성으로 `AccessDeniedException` | 응답의 `GrantToken`을 다음 호출에 전달(13.7) |
| 객체마다 `GenerateDataKey` 호출 | 트래픽 급증 시 `ThrottlingException`으로 **계정 전체 장애** + 요청 비용 폭증 | 데이터 키 캐싱, S3 버킷 키(13.11) |
| 테넌트마다 키 생성 | 키 월정액 폭증, 운영 불가 | 키는 신뢰 경계 단위, 테넌트는 컨텍스트로 구분 |
| DR 리전에 키 없이 복제만 구성 | 재해 시 복원 실패 | DR 리전에 동일 별칭 키 사전 생성(13.11) |
| AWS 관리형 키로 암호화한 스냅샷을 공유 | 공유 자체가 불가 | 고객 관리형 키로 복사 후 공유 |
| 실습 후 키를 안 지움 | 키 월정액이 계속 청구됨 | `AutoDelete=true` 태그 + 별칭 삭제 + 삭제 예약 |

## 다음 장 예고

KMS는 공유 HSM 위에서 돌아가는 멀티테넌트 서비스입니다. 규제가 **FIPS 140-2 Level 3 전용 HSM**이나 **키 자료의 완전한 소유권**을 요구한다면 이것만으로는 부족합니다.

14장에서는 CloudHSM 클러스터 생성·초기화, KMS 커스텀 키 스토어, OpenSSL로 만든 키 자료를 가져오는 BYOK와 그 만료·재임포트 리스크를 다루고, **양자내성 암호**와 **Nitro Enclaves**로 이어집니다.
