---
title: "14장. 고급 키 관리: CloudHSM과 외부 키"
---

# 14장. 고급 키 관리: CloudHSM과 외부 키

> **이 장에서 다루는 것**
> - KMS가 충분하지 않은 네 가지 상황 — FIPS 검증 수준, 단독 테넌시, 키 소유권, 비대칭·PKCS#11 요구
> - **CloudHSM 클러스터 생성·초기화·활성화** 🧪 — 신뢰 앵커(자체 서명 CA), CSR 서명, CO/CU 사용자, 클라이언트 인스턴스
> - **KMS 커스텀 키 스토어** — CloudHSM 지원 키 스토어와 외부 키 스토어(XKS), 그리고 스스로 떠안는 가용성 리스크
> - **외부 키 자료 가져오기(BYOK)** 🧪 — 랩핑 키·임포트 토큰, `import-key-material`, ⚠️ 만료와 재임포트
> - **양자내성 암호**와 **컨피덴셜 컴퓨팅** — "지금 수집, 나중에 복호화" 위협과 Nitro Enclaves
>
> **선행 지식**: 12장(데이터 분류), 13장(KMS 아키텍처·키 정책·봉투 암호화)
> **난이도**: ★★★

---

13장의 모델은 **"AWS가 키 자료를 만들고 보관하고, 나는 키 정책으로 사용 권한만 통제한다"** 였고, 대부분의 조직에서 이것이 정답입니다. 그런데 **"AWS 직원이 이론적으로도 키에 닿을 수 없어야 한다"**, **"키는 우리만 쓰는 물리 장비에 있어야 한다"** 는 요구는 이 모델과 정면으로 충돌합니다.

> 📖 *Practical Cloud Security* 2판 2장은 이 선택을 냉정하게 정리합니다. **"일부 클라우드 제공자는 당신의 환경 전용 HSM을 임대하는 옵션을 갖고 있다. 이것은 최고 수준의 보안 환경에서는 필요할 수 있지만, 전용 HSM은 클라우드 환경에서도 여전히 비싸고, 자동으로 기동하기가 더 어려운 경우가 많다."** 그리고 KMS 쪽 손익을 이렇게 씁니다. **"KMS는 보통 멀티테넌트 서비스이며, 이는 공격 표면이 약간 더 크다는 뜻이다. 그리고 (HSM만이 아니라) HSM과 KMS를 모두 신뢰해야 하므로 약간의 추가 위험이 생긴다. 그러나 스스로 키 관리를 하는 것 — 종종 잘못된 방식으로 — 과 비교하면, KMS는 매우 낮은 비용으로 훌륭한 보안을 제공한다."**

이 장은 **"그래도 전용 HSM이 필요한 경우"** 를 다룹니다. 다만 저자의 경고를 먼저 새기십시오. 전용 HSM은 비싸고, 자동화하기 어렵고, **가용성 책임이 AWS에서 여러분에게 넘어옵니다.**

---

## 14.1 언제 KMS로 충분하지 않은가

### HSM이란 무엇인가

> 📖 *Practical Cloud Security* 2판 2장의 HSM 정의를 그대로 옮깁니다. **"온프레미스 환경에서 높은 보안 요구사항이 있으면 암호화 키를 담을 하드웨어 보안 모듈(HSM)을 구매했을 것이다 — 보통 확장 카드나 네트워크로 접근하는 모듈 형태로. HSM은 무단 접근에 대해 상당한 논리적·물리적 보호 장치를 갖고 있다. 대부분의 시스템은 물리적 접근 권한이 있는 사람이라면 누구나 변조를 시도할 수 있지만, HSM은 누군가 그것을 분해하거나, X선으로 스캔하거나, 전원을 건드리거나, 대충 위협적으로 쳐다보기만 해도 데이터를 지워버리는 센서를 갖고 있다."** 그리고 **"HSM은 비싸서 대부분의 온프레미스 배포에는 현실적이지 않다. 그러나 클라우드 환경에서는 HSM과 암호화 키 관리 시스템 같은 고급 기술이 이제 적당한 예산의 프로젝트에서도 손에 닿는다."**

요약하면, **HSM은 "키를 절대 내보내지 않는" 것을 물리적으로 보증하는 장비**입니다. KMS도 백엔드에 HSM을 쓰지만, 그 HSM은 다른 AWS 고객과 공유됩니다.

### 네 가지 요구와 그에 대한 답

실무에서 "KMS로 부족하다"는 판단은 대개 다음 넷 중 하나에서 나옵니다.

**① FIPS 140 검증 수준.** 미국 연방 기준 또는 그것을 참조하는 규제에서 **Level 3** 를 요구하는 경우가 있습니다. Level 3는 물리적 변조 대응(tamper response)과 신원 기반 인증을 요구합니다.

> 📖 *AWS Security Cookbook* 4장은 CloudHSM의 강점을 정확히 여기에 둡니다. **"AWS CloudHSM의 HSM은 FIPS 140-2 Level 3 검증과 EAL4 같은 컴플라이언스 요구사항을 제공한다."**

> 💡 **원서 이후 변경** — 원서 집필 시점의 `hsm1.medium` 은 FIPS 140-2 Level 3 검증을 받았습니다. 이후 AWS는 후속 타입(`hsm2m.medium`)을 도입했고 이 타입은 **FIPS 140-3 Level 3** 검증 대상입니다. 검증 상태는 시점에 따라 바뀌므로, 도입 시점에 **AWS CloudHSM 문서의 현재 검증 상태와 HSM 타입별 인증서 번호를 반드시 확인**하십시오.

KMS는 **키 자료가 FIPS 140 검증 하드웨어에서 다뤄지되 그 하드웨어가 멀티테넌트**라는 위치입니다. 규제가 "검증된 모듈"만 요구하면 KMS로 충분하고, "단독 사용 모듈"까지 요구하면 CloudHSM이 필요합니다. **먼저 규제 문안을 정확히 읽으십시오.** 대부분의 감사 지적은 "Level 3가 없다"가 아니라 "어떤 등급이 필요한지 판단한 근거 문서가 없다"에서 나옵니다.

**② 단독 테넌시(Single Tenancy).** "우리 키가 다른 고객의 키와 같은 물리 장비에 있으면 안 된다"는 요구로, 기술적 위협 분석보다 **계약·감사 요구**에서 오는 경우가 많습니다.

**③ 키 소유권.** 데이터 주권 요구가 있으면 **"클라우드 제공자가 아닌 우리가 키의 최종 통제권을 갖는다"** 를 증명해야 합니다. 여기서 갈리는 것은 키 **자료의 출처**와 **위치**이고, 이 둘의 조합이 14.4~14.5의 주제입니다.

**④ KMS가 지원하지 않는 암호 연산.** PKCS#11·JCE·OpenSSL 엔진을 통한 애플리케이션 직접 연동, 자체 CA의 서명 키 보관 등입니다.

> 📖 *AWS Security Cookbook* 4장: **"AWS CloudHSM은 우리 자신의 암호화 키를 생성하고 사용할 수 있는, AWS 클라우드상의 전용 HSM이다. 반면 AWS KMS는 공유 HSM을 사용한다. KMS는 대칭 키만 사용할 수 있게 해주는 반면, CloudHSM은 대칭 키와 비대칭 키를 모두 지원한다."**

> 💡 **원서 이후 변경** — 마지막 문장은 지금은 맞지 않습니다. KMS는 2019년 이후 **비대칭 키**(RSA·ECC), 이후 **HMAC 키**와 **데이터 키 페어**를 지원합니다. "비대칭이 필요하니 CloudHSM"이라는 판단은 더 이상 성립하지 않으며, 지금 CloudHSM을 고르는 이유는 **단독 테넌시·Level 3·PKCS#11 직접 연동** 으로 좁혀졌습니다.

### 다섯 가지 선택지 비교

키 자료의 **출처**와 **위치**를 축으로 놓으면 선택지는 다섯 개입니다.

| 구분 | ① KMS 기본 | ② KMS + 가져온 키 자료(BYOK) | ③ 커스텀 키 스토어(CloudHSM) | ④ 외부 키 스토어(XKS) | ⑤ CloudHSM 직접 사용 |
|---|---|---|---|---|---|
| **키 자료 생성 주체** | AWS | **고객** | AWS(고객 HSM 내부) | **고객**(외부 키 관리자) | **고객** |
| **키 자료 저장 위치** | AWS 멀티테넌트 HSM | AWS 멀티테넌트 HSM | **고객 전용 CloudHSM 클러스터** | **AWS 외부**(온프레미스/타사) | **고객 전용 CloudHSM 클러스터** |
| **테넌시** | 공유 | 공유 | 단독 | 단독(고객 인프라) | 단독 |
| **KMS API 통합**(S3·EBS·RDS 등) | ○ 전부 | ○ 전부 | ○ 대칭 암복호화 | △ 대칭 암복호화만 | **× (직접 연동 필요)** |
| **자동 키 순환** | ○ | × (수동 재임포트) | × | × | × (직접 구현) |
| **가용성 책임** | AWS | AWS(키 자료 사본은 고객) | **고객**(클러스터 다운 = 복호화 중단) | **고객**(외부 키 관리자·네트워크) | **고객** |
| **키 자료 백업 책임** | AWS | **고객** | 고객(CloudHSM 백업) | **고객** | **고객** |
| **상대 비용** | 최저 | 최저 | 높음(HSM 시간당 과금) | 중간+외부 시스템 비용 | 높음 |
| **운영 부담** | 거의 없음 | 낮음(만료 관리) | **높음** | **매우 높음** | **매우 높음** |
| **주된 도입 이유** | 기본값 | 키 자료 소유권 증명 | Level 3 + 단독 테넌시 + KMS 통합 | 데이터 주권·외부 키 통제 | PKCS#11 직접 연동 |

**가장 중요한 행은 "가용성 책임"** 입니다. ①에서 ⑤로 갈수록 통제권이 커지는 대신 **장애 시 서비스가 멈추는 책임도 함께 옵니다.**

**🔴 판단 규칙**: 규제 문안에 "단독 테넌시" 또는 "FIPS 140 Level 3"이 명시되어 있지 않다면 **①을 쓰십시오.** "키 자료를 우리가 만들었다"는 증명만 필요하다면 **②(14.5)** 로 충분하며 비용 대비 효과가 가장 큽니다. ③~⑤는 **가용성 설계·백업·순환 절차를 문서화하고 운영 조직이 감당할 수 있을 때만** 선택합니다.

---

## 14.2 CloudHSM 클러스터 생성 🧪

### ⚠️ 실습 전 필독: 비용과 정리

> 📖 *AWS Security Cookbook* 4장은 이 레시피에서 같은 경고를 두 번 반복합니다. **"CloudHSM 사용은 KMS보다 비용이 더 들고, CloudHSM에는 프리 티어도 없다."** **"프로비저닝된 HSM은 실행되는 매 시간마다 비용이 나갈 수 있으므로, 학습이나 실험 목적으로 따라 하고 있다면 다음 레시피를 최대한 빨리 끝내고 완료 후 모든 리소스를 정리하라."**

| 항목 | 과금 방식 | 실습 시 |
|---|---|---|
| HSM 인스턴스 | **가동 시간에 정비례**(부분 시간도 1시간으로 올림) | 부록 D 비용 등급 🔴 **주의** — 프리 티어가 없고 시간당 단가가 큰 축에 듭니다. **단가는 실습 직전에 CloudHSM 요금 페이지에서 확인하십시오** |
| HSM 2대(다중 AZ) | **HSM 대수 × 가동 시간** | 대수에 그대로 비례합니다. 지우는 것을 잊으면 이 장 실습에서 가장 큰 비용 항목이 됩니다 |
| 백업 스토리지 | 보존 기간에 따라 소액 | 클러스터 삭제 후에도 백업이 남으면 계속 과금 |
| 클러스터 자체 | 무과금(HSM이 0대면 시간당 비용 없음) | — |
| 클라이언트 EC2 | 일반 EC2 요금 | `t3.small` 기준 소액 |

**🔴 시작 전에 반드시**: ① 0.3절 예산 알림 임계값을 낮추고, ② 캘린더에 **정리 알람**을 걸고, ③ 아래 정리 명령을 미리 복사해 두십시오. HSM은 "잊어버린 리소스" 중 가장 비쌉니다.

### 원서와 다르게 가는 부분

원서는 **기본 VPC**에 클러스터를 만들지만, 저자 스스로 단서를 붙입니다.

> 📖 *AWS Security Cookbook* 4장: **"이 실습에서는 편의를 위해 기본 VPC를 사용했다. HSM을 실험 목적으로 다뤄 보는 중이라면 그래도 된다. 실제 활용 사례에서는 커스텀 VPC 내부의 프라이빗 서브넷에 HSM을 설치해야 한다."**

이 책은 후자를 따라 CANON의 `shopmini-prod` VPC(`10.20.0.0/16`)의 **Private-App 서브넷 2개**를 씁니다.

| 항목 | 원서 | 이 책 |
|---|---|---|
| VPC | 기본 VPC | `shopmini-prod` (`10.20.0.0/16`) |
| 서브넷 | 기본 서브넷 3개 AZ | `10.20.10.0/24`(2a), `10.20.11.0/24`(2c) — **Private-App** |
| 클라이언트 인스턴스 위치 | 퍼블릭 서브넷 + SSH 개방 | **Private-App 서브넷 + SSM Session Manager**(21.5) |
| 접근 방식 | SSH 키 페어 | **키 페어 없음** |
| HSM 대수 | 1대(실습) | **2대**(다중 AZ) — 14.4의 커스텀 키 스토어 전제 조건 |

원서가 퍼블릭 서브넷 + SSH를 쓰는 것은 2020년 기준의 일반적 실습 구성입니다. 이 책은 21.5의 원칙 — **관리 접근에 SSH 포트를 열지 않는다** — 을 여기서도 지킵니다.

### 클러스터 생성

```bash
# 0) 실습용 서브넷 ID 확인 (CANON: Private-App 서브넷 2개)
aws ec2 describe-subnets --profile awssec-lab --region ap-northeast-2 \
  --filters "Name=tag:Name,Values=shopmini-prod-private-app-*" \
  --query 'Subnets[].[SubnetId,AvailabilityZone,CidrBlock]' --output table

# 1) 클러스터 생성 — 서브넷은 AZ당 1개씩
aws cloudhsmv2 create-cluster \
  --profile awssec-lab --region ap-northeast-2 \
  --hsm-type hsm1.medium \
  --subnet-ids subnet-0a11111111111111a subnet-0c22222222222222c \
  --backup-retention-policy Type=DAYS,Value=7 \
  --tag-list Key=Project,Value=awssec-lab Key=Chapter,Value=ch14 Key=AutoDelete,Value=true
```

`--backup-retention-policy` 의 최솟값은 **7일**입니다. **운영에서는 이 값을 "키를 잃었을 때 되돌릴 수 있는 최대 과거 시점"으로 이해하고 정하십시오.**

```bash
# 2) 상태 확인 — CREATE_IN_PROGRESS → UNINITIALIZED
aws cloudhsmv2 describe-clusters --profile awssec-lab --region ap-northeast-2 \
  --filters clusterIds=cluster-abcdefghijk \
  --query 'Clusters[0].[ClusterId,State,SecurityGroup,VpcId]' --output table
```

반환되는 **`SecurityGroup`** 값을 메모하십시오. CloudHSM은 **자체 보안 그룹**(`cloudhsm-cluster-<id>-sg`)을 만들어 HSM의 ENI에 부착합니다. 이 SG는 **자기 자신을 소스로 하는 인바운드 규칙**을 가져 같은 SG의 리소스끼리만 통신합니다. 14.3에서 클라이언트 EC2를 이 SG에 넣는 이유입니다.

> ⚠️ **이 보안 그룹을 직접 편집하지 마십시오.** 규칙을 지우면 HSM 간 동기화가 끊기고, 넓히면(예: `10.20.0.0/16` 전체 허용) VPC 안 아무 인스턴스나 HSM의 2223–2225 포트에 닿습니다. **SG를 넓히지 말고 클라이언트를 SG에 넣으십시오.**

### 상태 전이 이해하기

| 상태 | 의미 | 다음에 할 일 |
|---|---|---|
| `CREATE_IN_PROGRESS` | 클러스터 생성 중 | 대기 |
| `UNINITIALIZED` | 클러스터는 있지만 HSM 0대 | **HSM 생성 → CSR 서명 → 초기화** (14.3) |
| `INITIALIZE_IN_PROGRESS` | 인증서 업로드 처리 중 | 대기 |
| `INITIALIZED` | 신뢰 앵커 등록 완료, **아직 사용 불가** | 클라이언트에서 **활성화**(비밀번호 설정) |
| `ACTIVE` | 사용 가능 | 키 생성·연산 |
| `DEGRADED` | 일부 HSM 비정상 | 즉시 조사. 남은 HSM이 0이 되면 키 소실 |

`INITIALIZED` 와 `ACTIVE` 사이에 사람이 개입해야 한다는 점이 CloudHSM의 특징입니다. **초기 CO 비밀번호는 AWS가 모르고 재설정해 줄 수도 없습니다** — 이것이 단독 테넌시의 실제 의미입니다.

---

## 14.3 클러스터 초기화와 활성화 🧪

### 왜 내가 CA가 되어야 하는가

초기화의 본질은 **"이 클러스터의 HSM은 내 것이다"** 를 암호학적으로 못 박는 것입니다. HSM이 만든 **CSR** 에 **내 CA의 개인 키**로 서명하고, 서명된 인증서와 **내 CA 인증서(신뢰 앵커, trust anchor)** 를 AWS에 올립니다. 이후 클라이언트는 HSM의 인증서가 내 CA로 서명된 것인지 검증하므로 가짜 HSM을 끼워 넣어도 거부됩니다. **신뢰 앵커 개인 키를 잃으면 클러스터 확장·복구가 곤란해지고, 유출되면 이 검증이 무의미해집니다.**

> 📖 *AWS Security Cookbook* 4장의 네 단계 요약입니다. **"① OpenSSL로 개인 키를 만든다. ② 그 개인 키로 자체 서명 서명 인증서(발급 인증서)를 만든다. ③ 그 자체 서명 발급 인증서로, AWS 콘솔에서 다운로드한 CSR에 서명한다. ④ 마지막으로 서명된 CSR 인증서와 자체 서명 발급 인증서를 둘 다 AWS에 업로드한다."** 그리고 **"실제 활용 사례에서는 Verisign 같은 인증 기관이 서명해서 서명된 인증서를 만들어야 한다. 개발·테스트 목적이라면 OpenSSL로 자체 서명 인증서를 사용해 서명할 수 있다."**

> ⚠️ 이 단서는 **"공인 CA를 쓰라"** 가 아니라 **"자체 서명 CA를 아무렇게나 관리하지 말라"** 로 읽는 편이 맞습니다. 신뢰 앵커는 인터넷용 인증서가 아니라 **조직 내부 PKI**입니다. 사설 CA가 이미 있다면 그것으로 서명하고, 없다면 자체 서명 CA를 만들되 **개인 키를 오프라인 또는 별도 암호화 저장소에 보관하고 접근을 감사**하십시오.

### 1단계: HSM 생성

```bash
# 초기화 전에는 HSM을 1대만 만들 수 있다. 이 HSM이 CSR을 생성한다.
aws cloudhsmv2 create-hsm --profile awssec-lab --region ap-northeast-2 \
  --cluster-id cluster-abcdefghijk --availability-zone ap-northeast-2a
```

> ⚠️ **여기서부터 시간당 과금이 시작됩니다.** HSM을 만든 순간부터 삭제할 때까지 계속 과금되며, 초기화가 끝나지 않은 상태여도 마찬가지입니다.
>
> 두 번째 HSM은 **클러스터 활성화 뒤**에 추가합니다.

### 2단계: CSR 내려받고 신뢰 앵커 만들기

```bash
# CSR 추출
aws cloudhsmv2 describe-clusters --profile awssec-lab --region ap-northeast-2 \
  --filters clusterIds=cluster-abcdefghijk \
  --query 'Clusters[0].Certificates.ClusterCsr' --output text > ClusterCsr.csr

# (1) CA 개인 키 생성 — 원서와 동일한 명령
openssl genrsa -aes256 -out customerCA.key 2048

# (2) 자체 서명 CA 인증서(신뢰 앵커) 생성
openssl req -new -x509 -days 3652 -key customerCA.key -out customerCA.crt

# (3) 내 CA로 클러스터 CSR에 서명
openssl x509 -req -days 3652 -in ClusterCsr.csr \
  -CA customerCA.crt -CAkey customerCA.key -CAcreateserial \
  -out CustomerHsmCertificate.crt
```

> 💡 **원서 이후 변경** — 원서는 RSA 2048비트를 씁니다. 신뢰 앵커는 클러스터 수명 내내 쓰이므로 새로 만든다면 **`openssl genrsa -aes256 -out customerCA.key 4096`** 을 권합니다.

### 3단계: 초기화

```bash
aws cloudhsmv2 initialize-cluster --profile awssec-lab --region ap-northeast-2 \
  --cluster-id cluster-abcdefghijk \
  --signed-cert file://CustomerHsmCertificate.crt \
  --trust-anchor file://customerCA.crt
```

성공하면 `INITIALIZE_IN_PROGRESS` → `INITIALIZED` 로 바뀝니다. 아직 **쓸 수는 없습니다.**

### 4단계: 클라이언트 인스턴스와 활성화

원서는 퍼블릭 서브넷에 EC2를 띄우고 SSH로 접속해 CA 인증서를 `scp` 로 복사합니다. 이 책은 21.5·22.2에 맞춰 **키 페어와 SSH를 쓰지 않습니다.**

```bash
# Private-App 서브넷에 클라이언트 인스턴스 기동 (키 페어 없음)
aws ec2 run-instances --profile awssec-lab --region ap-northeast-2 \
  --image-id ami-0abcdef1234567890 \
  --instance-type t3.small \
  --subnet-id subnet-0a11111111111111a \
  --security-group-ids sg-0clienthsm00000 sg-0cloudhsmcluster0 \
  --iam-instance-profile Name=shopmini-ssm-managed \
  --metadata-options "HttpTokens=required,HttpPutResponseHopLimit=1" \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch14},{Key=AutoDelete,Value=true}]'
```

세 가지가 원서와 다릅니다. **`--security-group-ids` 에 클러스터 SG를 함께 지정**하고(원서도 기동 후 추가하라고 하지만 기동 시점에 넣어야 누락이 없습니다), **키 페어 없이** SSM 인스턴스 프로파일을 붙이며, **IMDSv2를 강제**합니다(8.3) — 클라이언트는 HSM 자격 증명을 다루므로 SSRF를 특히 경계해야 합니다. 접속 후(신뢰 앵커는 `scp` 대신 S3 또는 Parameter Store 경유) 클라이언트를 설치합니다.

```bash
# SSM 세션으로 접속
aws ssm start-session --profile awssec-lab --region ap-northeast-2 \
  --target i-0abc1234567890def

# 신뢰 앵커를 규정 위치에 배치
sudo cp customerCA.crt /opt/cloudhsm/etc/customerCA.crt

# HSM ENI의 사설 IP를 클라이언트에 설정
sudo /opt/cloudhsm/bin/configure-cli -a 10.20.10.25

# 대화형 CLI 진입 후 클러스터 활성화 (admin 비밀번호를 여기서 설정)
/opt/cloudhsm/bin/cloudhsm-cli interactive
```

클러스터가 `ACTIVE` 가 되면 **두 번째 HSM을 다른 AZ에 추가**합니다. 새 HSM은 기존 HSM에서 키와 사용자 정보를 자동 복제받습니다.

```bash
aws cloudhsmv2 create-hsm --profile awssec-lab --region ap-northeast-2 \
  --cluster-id cluster-abcdefghijk --availability-zone ap-northeast-2c
```

> 💡 **원서 이후 변경** — 원서는 **Client SDK 3** 의 도구(`cloudhsm_mgmt_util`, `enable_e2e`, `loginHSM PRECO`, `changePswd`)를 씁니다. 현재 표준은 **Client SDK 5** 이며 대응은 다음과 같습니다.
>
> | 원서(SDK 3) | 현재(SDK 5) |
> |---|---|
> | `configure -a <IP>` | `configure-cli -a <IP>` |
> | `cloudhsm_mgmt_util <cfg>` | `cloudhsm-cli interactive` |
> | `enable_e2e` | 불필요(기본 적용) |
> | `loginHSM PRECO admin password` → `changePswd` | `cluster activate` (admin 비밀번호를 그 자리에서 설정) |
> | `listUsers` | `user list` |
> | CU 생성(`createUser CU ...`) | `user create --username <이름> --role crypto-user` |
>
> SDK 5에서는 `PRECO` 역할 대신 활성화 명령이 admin(= CO) 비밀번호를 직접 설정합니다. **역할의 의미와 책임 분리는 원서 설명 그대로 유효합니다.** 정확한 패키지 URL은 버전·배포판마다 다르므로 AWS CloudHSM 문서의 현재 링크를 쓰십시오.

### 사용자 역할 — 여기서 권한 분리가 결정된다

> 📖 *AWS Security Cookbook* 4장: **"PRECO는 AWS가 만든 사용자 역할로, 비밀번호를 갱신할 때까지 사용할 수 있다. 갱신하고 나면 사용자 유형이 CO로 바뀐다. (…) Crypto Officer는 사용자 관리를 책임진다. CU는 키 생성·삭제·공유·가져오기·내보내기를 포함한 키 관리를 책임진다. CU는 암호화, 복호화, 서명, 검증 등의 암호 연산도 책임진다. AU는 제한된 권한의 사용자로, 일반적으로 복제와 동기화 작업을 위해 AWS가 사용한다."**

| 역할 | 할 수 있는 것 | 할 수 **없는** 것 | 누구에게 |
|---|---|---|---|
| **CO** (Crypto Officer / SDK5의 `admin`) | 사용자 생성·삭제·비밀번호 변경 | **키를 만들거나 데이터를 복호화할 수 없다** | 키 관리자(사람), 2인 이상 |
| **CU** (Crypto User) | 키 생성·삭제·공유, 암복호화·서명 | 사용자 관리 불가 | 애플리케이션 / KMS 커스텀 키 스토어의 `kmsuser` |
| **AU** (Appliance User) | 클러스터 복제·동기화 | 키 접근 불가 | **AWS 전용 — 건드리지 않는다** |

**🔴 이 분리를 반드시 지키십시오.** **한 사람이 CO와 CU를 겸하면 "자기가 CU를 만들어 자기가 키를 쓰는" 경로가 열립니다.** CloudHSM에는 KMS의 키 정책 같은 선언적 통제가 없어 **역할 분리 자체가 접근 통제**입니다. CO 로그인 이력은 CloudTrail 데이터 이벤트로 남지 않으므로 **HSM 감사 로그를 CloudWatch Logs로 내보내 중앙 로그 계정으로 전달**해야 합니다(29장).

### ⚠️ 정리 절차 — 순서를 틀리면 키가 영구 소실된다

**사고 시나리오.** 비용을 줄이려고 HSM 2대를 먼저 지웠습니다. 다음 주에 HSM을 새로 만들었더니 이전 키가 하나도 없었습니다.

**원인.** **키는 클러스터가 아니라 HSM 안에 있습니다.** HSM이 한 대도 남지 않으면 키는 **오직 백업에만** 존재하고, 백업 보존 기간이 지났거나 백업을 지웠다면 **복구 수단이 전혀 없습니다.** AWS도 되살릴 수 없습니다.

**올바른 구성.**

```bash
# (a) 지우기 전에 백업 존재를 먼저 확인한다
aws cloudhsmv2 describe-backups --profile awssec-lab --region ap-northeast-2 \
  --filters clusterIds=cluster-abcdefghijk \
  --query 'Backups[].[BackupId,BackupState,CreateTimestamp]' --output table

# (b) 클라이언트 EC2 종료
aws ec2 terminate-instances --profile awssec-lab --region ap-northeast-2 \
  --instance-ids i-0abc1234567890def

# (c) HSM 삭제 (대수만큼 반복) — 여기서 시간당 과금이 멈춘다
aws cloudhsmv2 delete-hsm --profile awssec-lab --region ap-northeast-2 \
  --cluster-id cluster-abcdefghijk --hsm-id hsm-1111111111a
aws cloudhsmv2 delete-hsm --profile awssec-lab --region ap-northeast-2 \
  --cluster-id cluster-abcdefghijk --hsm-id hsm-2222222222c

# (d) 클러스터 삭제
aws cloudhsmv2 delete-cluster --profile awssec-lab --region ap-northeast-2 \
  --cluster-id cluster-abcdefghijk

# (e) 백업까지 지워야 과금이 완전히 끝난다 (삭제 후 대기 기간이 있고, 그 사이 restore 가능)
aws cloudhsmv2 delete-backup --profile awssec-lab --region ap-northeast-2 \
  --backup-id backup-3333333333b
```

**(e)가 "돌아올 수 없는 지점"입니다.** 실습이라면 반드시 실행해야 비용이 멈추고, 운영이라면 **절대 서두르지 말고** 백업을 다른 리전으로 복사(`copy-backup-to-region`)해 두십시오.

> **🔴 KMS와의 결정적 차이**: 13.11의 KMS 키 삭제는 **7~30일 대기 기간**이 있고 그 사이 취소할 수 있습니다. CloudHSM 백업 삭제에도 대기 기간이 있지만 **HSM 삭제 자체는 즉시**이며, 백업이 없으면 그 순간 키가 사라집니다. **CloudHSM에는 실수를 되돌려 주는 안전장치가 KMS만큼 없습니다.**

---

## 14.4 KMS 커스텀 키 스토어

14.2~14.3의 클러스터는 강력하지만 **KMS API와 연결되어 있지 않습니다.** S3의 `SSE-KMS`, EBS·RDS 저장 암호화는 전부 `kms:Decrypt` 를 호출하지 CloudHSM PKCS#11을 호출하지 않습니다. 그래서 CloudHSM만 도입하면 **"HSM은 샀는데 정작 데이터는 여전히 KMS 키로 암호화되는"** 상황이 됩니다.

**커스텀 키 스토어(Custom Key Store)** 가 이 간극을 메웁니다. **KMS 키의 겉모습(키 ID·별칭·키 정책·CloudTrail)은 그대로 두고, 실제 키 자료와 암호 연산만 다른 곳으로 옮기는** 구조입니다.

> 💡 **원서 범위 밖** — *AWS Security Cookbook* 4장은 커스텀 키 스토어를 딱 한 번, 키 순환의 예외 조건으로만 언급합니다(13.6에서 인용한 그 대목입니다). **"CloudHSM 클러스터로 뒷받침되는 커스텀 키 스토어에서는 자동 키 순환이 지원되지 않는다. 그런 CMK의 경우 Origin 필드 값이 `AWS_CloudHSM` 이다."** 아래의 구성 절차와 외부 키 스토어(XKS)는 원서 집필 이후 정리·추가된 내용이므로 원서 인용 없이 서술합니다.

### 두 가지 유형

| | **CloudHSM 키 스토어** | **외부 키 스토어(XKS)** |
|---|---|---|
| 키 자료 위치 | 내 AWS 계정의 CloudHSM 클러스터 | **AWS 밖**의 외부 키 관리자 |
| KMS 키의 `Origin` | `AWS_CLOUDHSM` | `EXTERNAL_KEY_STORE` |
| 연결 방식 | KMS ↔ 클러스터(계정 내부) | KMS → **XKS 프록시**(퍼블릭 엔드포인트 또는 VPC 엔드포인트 서비스) |
| 지원 연산 | 대칭 암복호화 | 대칭 암복호화만 |
| 자동 순환 | 미지원 | 미지원 |
| 실패 시 영향 | 클러스터 다운 → 해당 키 사용 불가 | **프록시·네트워크·외부 시스템 중 하나만 죽어도** 사용 불가 |
| 도입 이유 | Level 3 + 단독 테넌시 | **데이터 주권**, 키를 AWS 밖에 두어야 하는 계약 |

XKS는 "AWS가 키를 갖지 않는다"를 구조적으로 증명하는 대신, **KMS 호출 하나가 외부 시스템까지 왕복**하게 만듭니다.

### CloudHSM 키 스토어 구성

전제 조건이 셋입니다. ① 클러스터가 `ACTIVE`, ② **서로 다른 AZ에 활성 HSM이 2대 이상**, ③ 클러스터에 **`kmsuser` 라는 이름의 CU**가 있고 그 계정을 KMS에만 위임.

```bash
# 1) 클러스터에 kmsuser CU 생성 (클라이언트 인스턴스의 cloudhsm-cli 안에서)
#    user create --username kmsuser --role crypto-user

# 2) KMS 커스텀 키 스토어 생성
aws kms create-custom-key-store --profile awssec-lab --region ap-northeast-2 \
  --custom-key-store-name shopmini-hsm-keystore \
  --cloud-hsm-cluster-id cluster-abcdefghijk \
  --trust-anchor-certificate file://customerCA.crt \
  --key-store-password '<kmsuser 비밀번호>'

# 3) 연결
aws kms connect-custom-key-store --profile awssec-lab --region ap-northeast-2 \
  --custom-key-store-id cks-1234567890abcdef0

# 4) 상태 확인 — ConnectionState 가 CONNECTED 여야 한다
aws kms describe-custom-key-stores --profile awssec-lab --region ap-northeast-2 \
  --custom-key-store-id cks-1234567890abcdef0 \
  --query 'CustomKeyStores[0].[CustomKeyStoreId,ConnectionState,ConnectionErrorCode]' --output table

# 5) 이 키 스토어에 KMS 키 생성
aws kms create-key --profile awssec-lab --region ap-northeast-2 \
  --origin AWS_CLOUDHSM \
  --custom-key-store-id cks-1234567890abcdef0 \
  --description "ShopMini uploads - CloudHSM backed"

aws kms create-alias --profile awssec-lab --region ap-northeast-2 \
  --alias-name alias/shopmini/hsm --target-key-id <키 ID>
```

**`kmsuser` 비밀번호를 KMS에 넘긴다는 점에 주목하십시오.** KMS는 이 자격 증명으로 클러스터에 로그인해 연산을 대행합니다. 따라서 **사람이 `kmsuser` 로 로그인해서는 안 되고**(KMS 세션이 로그아웃됩니다), 비밀번호를 바꾸면 `update-custom-key-store` 로 KMS에도 알려야 합니다.

### ⚠️ 가용성 리스크 — 이것이 진짜 결정 요인이다

**사고 시나리오.** ShopMini가 `shopmini-uploads` 버킷의 기본 암호화 키를 `alias/shopmini/hsm` 으로 바꿨습니다. 3개월 뒤 유지보수 중 실수로 HSM 2대 중 1대를 지웠고 남은 1대도 `DEGRADED` 에 빠졌습니다. 커스텀 키 스토어가 `DISCONNECTED` 로 떨어지자 **버킷의 모든 객체 읽기가 실패**했고, CloudFront 캐시가 만료된 이미지부터 순서대로 깨졌습니다.

**원인.** 커스텀 키 스토어를 만드는 순간 **KMS의 가용성 SLA에서 벗어납니다.** KMS 기본 키의 가용성은 AWS가 책임지지만 `AWS_CLOUDHSM` 키의 가용성은 **내 클러스터 상태 = 내 책임**입니다. 그리고 S3·EBS·RDS는 키를 못 읽으면 **대체 동작 없이 그냥 실패합니다.**

**올바른 구성.**

| 통제 | 내용 |
|---|---|
| **HSM 대수** | 최소 2대, 서로 다른 AZ. 운영은 3대 권장 — 1대 손실이 곧 단일 장애점이 되지 않도록 |
| **적용 범위 제한** 🔴 | 커스텀 키 스토어 키는 **규제가 명시적으로 요구하는 데이터에만** 쓴다. ShopMini라면 결제·개인정보 컬럼 수준이지 버킷 전체가 아니다 |
| **연결 상태 감시** 🔴 | `describe-custom-key-stores` 의 `ConnectionState` 를 주기 점검하고 `CONNECTED` 이외면 즉시 경보(30장) |
| **키 스토어 삭제 방지** | `kms:DeleteCustomKeyStore`·`kms:DisconnectCustomKeyStore`를 SCP로 특정 역할에만 허용(37장) |
| **수동 순환 절차** | 자동 순환이 없으므로 **새 키 생성 → 별칭 이동 → 기존 데이터 재암호화** 절차를 문서화하고 주기를 캘린더에 등록 |
| **복구 리허설** | 클러스터를 백업에서 복원하고 키 스토어를 재연결하는 절차를 **1년에 한 번은 실제로 수행**(17.6) |

**🔴 판단 규칙**: 커스텀 키 스토어는 **"이 데이터가 못 읽히는 장애를 감수하더라도 키를 우리 하드웨어에 두는 편이 낫다"** 고 조직이 문서로 합의했을 때만 씁니다.

---

## 14.5 외부 키 자료 가져오기(BYOK) 🧪

커스텀 키 스토어가 **"키를 어디에 둘 것인가"** 를 바꾼다면, BYOK는 **"키를 누가 만들 것인가"** 만 바꿉니다. 키 자료는 여전히 AWS의 멀티테넌트 HSM에 저장되되, **그 32바이트를 내가 만들었고 사본을 내가 갖는다**는 점이 달라집니다.

> 📖 *AWS Security Cookbook* 4장: **"AWS KMS 안에서 키를 만들 때는 AWS가 그 키의 키 자료를 만들고 관리한다. AWS 밖에서 만든 우리 자신의 키 자료로 키를 만들 수도 있다."** 그리고 두 가지 책임을 못 박습니다. **"우리 자신의 키 자료를 가져올 때, 우리는 보안 요구사항에 맞는 무작위성으로 키 자료를 생성할 책임이 있다. 또한 키 자료의 내구성에 대한 책임도 우리에게 있다."**

### 동작 원리

① `Origin=EXTERNAL` 로 KMS 키를 만들고(이 시점의 키는 **`PendingImport` 상태로 사용 불가**), ② KMS에서 **랩핑 공개 키**와 **임포트 토큰**을 받고, ③ 내 키 자료를 랩핑 공개 키로 암호화한 뒤, ④ 암호화된 키 자료와 임포트 토큰을 함께 올립니다.

> 📖 *AWS Security Cookbook* 4장은 두 조각의 역할을 구분합니다. **"이 키 랩퍼는 우리 키 자료를 암호화해 AWS KMS 서비스에 안전하게 업로드하는 데 쓰이는 공개 키다. (…) 임포트 토큰은 업로드되는 키가 우리가 랩퍼 토큰을 다운로드한 그 키에 맞는 올바른 키인지 확인하는 데 쓰인다."**

즉 **랩핑 키는 기밀성**을, **임포트 토큰은 결합(binding)** 을 담당합니다.

### 실습

원서는 콘솔로 진행합니다. 여기서는 자동화 가능한 CLI로 재구성했습니다.

```bash
# 1) 외부 키 자료용 KMS 키 생성 (PendingImport 상태로 만들어진다)
aws kms create-key --profile awssec-lab --region ap-northeast-2 \
  --origin EXTERNAL --key-spec SYMMETRIC_DEFAULT --key-usage ENCRYPT_DECRYPT \
  --description "ShopMini BYOK" \
  --tags TagKey=Project,TagValue=awssec-lab TagKey=Chapter,TagValue=ch14

# 2) 랩핑 공개 키와 임포트 토큰 받기
aws kms get-parameters-for-import --profile awssec-lab --region ap-northeast-2 \
  --key-id <키 ID> \
  --wrapping-algorithm RSAES_OAEP_SHA_256 \
  --wrapping-key-spec RSA_4096 \
  --output json > import-params.json

# base64 디코드해서 바이너리로 저장
jq -r '.PublicKey'  import-params.json | base64 -d > WrappingPublicKey.bin
jq -r '.ImportToken' import-params.json | base64 -d > ImportToken.bin
jq -r '.ParametersValidTo' import-params.json   # 이 시각까지만 유효(24시간)
```

> ⚠️ **`ParametersValidTo` 는 24시간입니다.** 만료되면 2단계부터 다시 해야 하므로, 자동화 스크립트에서 2~4단계를 **한 번의 실행 안에서** 끝내도록 설계하십시오.

```bash
# 3) 키 자료 생성 — 원서와 동일 (256비트 = 32바이트)
openssl rand -out PlaintextKeyMaterial.bin 32

# 4) 랩핑 공개 키로 암호화 (RSAES_OAEP_SHA_256)
openssl pkeyutl -encrypt \
  -in PlaintextKeyMaterial.bin \
  -out EncryptedKeyMaterial.bin \
  -inkey WrappingPublicKey.bin -keyform DER -pubin \
  -pkeyopt rsa_padding_mode:oaep \
  -pkeyopt rsa_oaep_md:sha256 \
  -pkeyopt rsa_mgf1_md:sha256

# 5) 임포트 — 만료를 설정하는 경우
aws kms import-key-material --profile awssec-lab --region ap-northeast-2 \
  --key-id <키 ID> \
  --encrypted-key-material fileb://EncryptedKeyMaterial.bin \
  --import-token fileb://ImportToken.bin \
  --expiration-model KEY_MATERIAL_EXPIRES \
  --valid-to 2027-03-01T00:00:00Z

# 상태 확인 — Enabled 이면 성공
aws kms describe-key --profile awssec-lab --region ap-northeast-2 \
  --key-id <키 ID> --query 'KeyMetadata.[KeyState,Origin,ExpirationModel,ValidTo]'
```

> 💡 **원서 이후 변경 3가지**
> 1. 원서는 랩핑 알고리즘으로 **`SHA_1`** 을 골랐고 저자도 **"더 안전한 대안을 선택할 수 있다"** 고 덧붙였습니다. 지금은 **`RSAES_OAEP_SHA_256` 또는 `RSA_AES_KEY_WRAP_SHA_256`** 을 쓰십시오. 후자는 대칭 키보다 큰 키 자료(비대칭 KMS 키의 개인 키 등)에 필요한 2단계 절차입니다.
> 2. 원서의 `openssl rsautl` 은 OpenSSL 3.0에서 권장되지 않습니다. **`openssl pkeyutl`** 을 쓰십시오.
> 3. KMS는 이후 **비대칭 키·HMAC 키·다중 리전 키**에도 키 자료 가져오기를 지원하도록 확장되었습니다. 원서 시점에는 대칭 키만 가능했습니다.

### ⚠️ 만료·삭제·재임포트 — 여기가 사고 지점이다

**사고 시나리오.** 규제 대응을 위해 `--expiration-model KEY_MATERIAL_EXPIRES --valid-to`(1년)로 BYOK 키를 만들고 `shopmini-uploads` 의 개인정보 파일 암호화에 썼습니다. 1년 뒤 새벽 키 자료가 만료되며 상태가 `PendingImport` 로 바뀌었고 **모든 복호화가 실패**했습니다. 담당자는 퇴사했고 원본 `PlaintextKeyMaterial.bin` 의 위치를 아무도 몰랐습니다.

**원인.** 원서가 정확히 경고한 지점입니다.

> 📖 *AWS Security Cookbook* 4장의 관련 서술입니다. **"가져온 키 자료로는 키 자료에 만료일을 설정할 수 있고 수동으로 삭제할 수도 있다. 나중에 CMK에 키 자료를 다시 가져오면 그 키를 다시 사용 가능하게 만들 수 있다."** **"CMK에 가져온 키 자료는 그 CMK에 영구적으로 결합된다. 우리는 오직 그 키 자료를 다시 가져올 수만 있다."** **"외부 키 자료를 가진 CMK로 암호화된 암호문은, 같은 키 자료를 쓰더라도 다른 CMK로는 복호화할 수 없다."** 그리고 결정타입니다. **"CMK에 영향을 주는 리전 전체 장애의 경우, AWS는 가져온 키 자료를 자동으로 복원하지 않는다. 그런 상황에서는 다시 가져오기 위해 키 자료의 사본을 갖고 있어야 한다."**

셋을 합치면 이렇습니다. **① 만료되면 그 키로 암호화한 데이터는 재임포트 전까지 읽을 수 없다. ② 재임포트할 수 있는 것은 원래의 그 32바이트뿐이다. ③ 그것을 잃으면 데이터는 영구히 사라진다. AWS에는 사본이 없다.**

**올바른 구성.**

| 통제 | 내용 |
|---|---|
| **키 자료 원본 보관** 🔴 | 온프레미스 HSM, 오프라인 매체, 또는 별도 계정의 격리 저장소에 **2곳 이상** 보관. 보관 위치·접근자·복구 절차를 문서화하고 **담당자 개인이 아니라 조직이 알게** 한다 |
| **만료 사용 여부 결정** | 규제가 요구하지 않으면 **`KEY_MATERIAL_DOES_NOT_EXPIRE`** 를 쓴다. 만료는 "정해진 날짜에 데이터를 읽을 수 없게 만드는 기능"이지 보안 강화 기능이 아니다 |
| **만료 감시** 🔴 | 만료를 쓴다면 EventBridge의 KMS 키 자료 만료 이벤트를 SNS로 연결하고, **추가로** `describe-key` 의 `ValidTo` 를 주기 조회해 **30일/7일/1일 전 3단계 경보**를 건다. 이벤트 하나에 의존하지 않는다 |
| **재임포트 리허설** | 개발 계정에서 `delete-imported-key-material` → 재임포트를 실제로 수행해 절차와 소요 시간을 검증한다 |
| **다중 리전 고려** | 리전 장애 시 AWS가 복원해 주지 않으므로, 재해 복구 대상이라면 **다른 리전의 키에 같은 절차로 임포트**하는 계획을 세운다 |
| **적용 범위** | KMS 기본 키와 BYOK 키를 **용도로 분리**한다. 로그·백업처럼 "절대 못 읽으면 곤란한" 데이터에는 BYOK 만료 키를 쓰지 않는다 |

```bash
# 만료 이벤트를 SNS로 (30장의 알람 체계에 연결)
aws events put-rule --profile awssec-lab --region ap-northeast-2 \
  --name kms-imported-key-material-expiration \
  --event-pattern '{"source":["aws.kms"],"detail-type":["KMS Imported Key Material Expiration"]}'
```

**핵심**: BYOK로 얻는 것은 **"키 자료를 우리가 만들었다"는 증명**, 대가는 **"그 키 자료를 영원히 잃지 않을 책임"** 입니다.

---

## 14.6 양자내성 암호(Post-Quantum) 대비

이 절은 *Practical Cloud Security* **2판 신규 주제**입니다. 1판에는 양자 컴퓨터가 "AES-128을 언젠가 위협할 수 있다"는 한 문장짜리 각주만 있고 별도 절이 없으며, 2판 서문은 개정 내용으로 **"양자내성 암호 알고리즘 같은 암호화 기법의 발전"** 을 명시적으로 꼽습니다.

### 위협의 형태: 지금 수집, 나중에 복호화

> 📖 *Practical Cloud Security* 2판 2장의 「Quantum-Safe Cryptography」 절입니다. **"양자 컴퓨터는 일부 작업에서 고전 컴퓨터보다 훨씬 뛰어날 것으로 기대되며, 그중 일부 작업은 암호화에 대한 보안 함의를 갖는다. 잘 알려진 예는, 큰 수를 빠르게 소인수분해할 수 있다면 중요한 암호 알고리즘 하나를 깰 수 있다는 것이다."** **"양자 컴퓨터가 아직 이런 공격을 가능하게 하지는 못하지만, 위험 중 하나는 공격자가 나중에 복호화하려고 지금 암호화된 데이터를 수확(harvest)해 둔다는 것이다. 이런 이유로, 이 공격들이 현실에서 실현 가능해지기 훨씬 전에 양자 안전 알고리즘으로 옮겨 가려는 업계 전반의 움직임이 있다."**

여기서 나온 것이 **"지금 수집, 나중에 복호화(Harvest Now, Decrypt Later, HNDL)"** 위협입니다. 이 위협이 특이한 이유는 **오늘의 방어 수준이 아니라 데이터의 수명이 위험을 결정한다**는 점입니다. 오늘 캡처된 TLS 세션이 10년 뒤 복호화된다면, **오늘 보낸 데이터가 10년 뒤에도 민감한지**가 유일한 질문입니다.

| 데이터 유형 | 10년 뒤에도 민감한가 | HNDL 우선순위 |
|---|---|---|
| 주민등록번호·여권번호·의료 기록 | **그렇다** (평생 유효) | **최상** |
| 장기 계약서·지식재산·설계 도면 | **그렇다** | **높음** |
| 인증서 개인 키·서명 키 | 그렇다(키 수명 동안) | **높음** |
| 세션 토큰·1회용 인증 코드 | 아니다(분 단위) | 낮음 |
| 실시간 재고 수량 | 아니다 | 무시 가능 |

ShopMini라면 **결제 요청의 세션 토큰은 걱정할 필요가 없지만 회원 가입 시 전송되는 개인정보는 최상위 우선순위**입니다.

### 무엇이 위험하고 무엇이 안전한가

> 📖 계속해서 2판 2장: **"전송 중 데이터 암호화에 쓰이는 알고리즘이 가장 위험하며, TLS의 미래 버전은 양자 안전 알고리즘을 쓸 것으로 기대된다. AES-256을 통한 저장 데이터 암호화는 당분간 안전할 것으로 기대되지만, 많은 방식이 AES 대칭 키를 암호화할 때 양자 안전하지 않은 알고리즘을 쓴다는 점은 짚어 둘 만하다. (…) 이렇게 하는 제품은 양자 안전 알고리즘으로 AES 키를 다시 암호화하도록 갱신해야 할 것이며, 그러지 않으면 저장 데이터도 위험해질 수 있다."** 그리고 **"이것은 심층 방어를 위한 설계가 도움이 되는 또 다른 예다."** 심화 자료로는 **NIST SP 1800-38** 을 지목합니다.

**가운데 문장이 가장 중요합니다.** "저장 데이터는 AES-256이니 안전하다"는 안심은 절반만 맞습니다. **AES 키를 비대칭 알고리즘으로 감쌌다면 그 랩핑을 깨는 순간 저장 데이터도 무너집니다.** 13.1의 봉투 암호화에서 데이터 키를 무엇으로 감쌌는지가 사슬 전체의 강도를 결정합니다. KMS는 **데이터 키를 대칭 KMS 키로 감싸므로 해당하지 않습니다.** 문제는 **비대칭 키로 데이터 키를 감싸 여러 수신자에게 배포하는 방식**(일부 문서·이메일 암호화 제품, PGP 계열)입니다.

| 대상 | 양자 위협 노출도 | AWS에서 확인할 것 |
|---|---|---|
| **TLS 키 교환**(ECDHE 등) | **높음** — HNDL의 주 표적 | ALB·CloudFront·API Gateway의 TLS 정책, AWS API 호출 경로 |
| **비대칭 서명**(RSA/ECDSA) | 중간 — 위조는 미래에만 가능, 과거 서명 소급 위조는 어려움 | ACM 인증서, 코드 서명, JWT 서명 |
| **KMS 대칭 키(AES-256)** | 낮음 | 별도 조치 불필요 |
| **비대칭으로 감싼 데이터 키** | **높음** | 자체 구현 암호화, PGP, 일부 SaaS 제품 |
| **해시(SHA-256 이상)** | 낮음 | 별도 조치 불필요 |

### 지금 해야 할 일

> 💡 **원서 이후 진행 상황** — NIST는 원서 집필 이후 첫 양자내성 표준을 확정했습니다: 키 캡슐화의 **ML-KEM**(FIPS 203), 서명의 **ML-DSA**(FIPS 204)·**SLH-DSA**(FIPS 205). AWS도 KMS·ACM·Secrets Manager 등의 API 엔드포인트에 **하이브리드 양자내성 키 교환**(기존 ECDHE와 양자내성 알고리즘을 조합해 둘 중 하나만 깨져도 안전한 방식) 지원을 확장해 왔습니다. **지원 서비스·알고리즘·활성화 방법은 계속 바뀌므로 도입 시점에 AWS 공식 문서를 확인**하십시오. 이 문단은 원서에 없는 내용입니다.

**하이브리드 방식**이 핵심입니다. 새 알고리즘은 검증 기간이 짧으므로 기존 알고리즘과 **둘 다** 써서 공유 비밀을 만들고, 하나가 깨져도 다른 하나가 남게 합니다. **1.2의 심층 방어를 암호 알고리즘 층에 적용한 형태**입니다.

**📋 지금 시점에 실행할 수 있는 준비 (마이그레이션이 아니라 준비입니다)**

- [ ] **데이터 수명 표를 만든다** — 12.2의 분류 결과에 **"몇 년 뒤까지 민감한가"** 열을 추가. 10년 이상이면 HNDL 대상
- [ ] **그 데이터가 인터넷을 건너는 경로를 목록화한다** — TLS 종료 지점(23.5) 어디를 지나는지 표시
- [ ] **암호 자산 목록(cryptographic inventory)을 만든다** — 어디서 어떤 알고리즘·키 길이·라이브러리를 쓰는지
- [ ] **알고리즘이 하드코딩된 곳을 찾는다** — 이름·키 길이를 설정으로 빼면 교체가 배포 한 번으로 끝난다. 이것이 **암호 민첩성(crypto-agility)**
- [ ] **비대칭으로 데이터 키를 감싸는 자체 구현이 있는지 점검한다** — 원서가 지목한 그 패턴이다
- [ ] **TLS 정책이 IaC로 관리되어 한 줄 변경으로 갱신되는가**(23.6)
- [ ] **긴 수명 데이터의 재암호화 계획이 있는가** — "알고리즘이 바뀌면 기존 데이터를 어떻게 다시 암호화할 것인가"

**🔴 오늘 알고리즘을 전면 교체하라는 뜻이 아닙니다.** 목표는 **"바꿔야 할 때 몇 주 안에 바꿀 수 있는 상태"** 이며, 가장 실질적인 항목은 **암호 자산 목록**입니다 — 목록이 없으면 전환 지시가 내려와도 착수조차 못 합니다.

---

## 14.7 컨피덴셜 컴퓨팅 개요

> 💡 **원서 범위 밖** — *Practical Cloud Security* 2판은 **컨피덴셜 컴퓨팅을 개념 수준으로만** 다루며 AWS Nitro Enclaves 등 구체 구현은 원서에 없습니다. 아래 개념 정의는 원서를 인용하고, AWS 구현은 원서 인용 없이 서술합니다. 이 주제도 **2판에서 강화된 부분**입니다 — 1판에는 "컨피덴셜 컴퓨팅"이라는 용어 자체가 없고 "사용 중 데이터 암호화(encryption of data in use)"라는 서술만 있습니다.

### 세 번째 상태

13.2에서 저장 중·전송 중 암호화를 다뤘습니다. 남은 하나가 **사용 중(in use)** 입니다.

> 📖 *Practical Cloud Security* 2판 2장은 암호화 대상을 셋으로 나눕니다. **"전송 중 데이터 / 컨피덴셜 컴퓨팅, 즉 사용 중 데이터(현재 컴퓨터의 CPU에서 처리되고 있거나 RAM에 들어 있는 것) / 저장 중 데이터."** 그리고 **"사용 중 데이터의 암호화는 이제 여러 클라우드 제공자에게서 이용할 수 있으며, 보통 매우 민감한 데이터를 가진 조직을 대상으로 컨피덴셜 컴퓨팅이라는 이름으로 마케팅된다. (…) 가장 흔한 클라우드 구현은 프로세스나 가상 머신의 메모리를 암호화해서, 특권 사용자(또는 특권 사용자를 사칭하는 공격자나 악성코드)조차 읽을 수 없게 하고, 프로세서는 특정 프로세스나 가상 머신의 코드를 실행할 때만 읽을 수 있게 하는 것이다. 매우 높은 보안 환경에 있고 위협 모델에 특권 사용자로부터 메모리 내 데이터를 보호하는 것이 포함된다면, 또는 클라우드에서 다른 테넌트와의 추가 격리를 원한다면, 메모리 암호화를 지원하는 플랫폼을 찾아야 한다."**
>
> 각주로 한계도 분명히 합니다. **"메모리 내 암호화는 프로세스 외부로부터의 공격에 대해서만 데이터를 보호한다. 만약 프로세스 자체가 해서는 안 될 일을 하도록 속일 수 있다면, 그 프로세스는 메모리를 읽고 데이터를 누설할 수 있다."**

**마지막 각주가 이 기술의 경계입니다.** 컨피덴셜 컴퓨팅은 **호스트 운영자·하이퍼바이저 관리자·다른 테넌트**로부터 보호하지, **애플리케이션 자체의 취약점(SQL 인젝션, SSRF, 역직렬화)** 은 막지 못하며 24장의 통제를 대체하지 않습니다.

### AWS Nitro System과 Nitro Enclaves

AWS의 접근은 원서가 예로 든 Intel SGX·AMD SEV 같은 CPU 확장과 다릅니다. **AWS Nitro System** 은 하이퍼바이저·네트워크·스토리지를 전용 하드웨어 카드로 분리한 아키텍처이고, 그 위에서 **Nitro Enclaves** 는 EC2 인스턴스의 vCPU와 메모리 일부를 떼어내 **격리된 실행 환경**을 만듭니다.

| 특성 | 의미 |
|---|---|
| **부모 인스턴스와 분리** | 인클레이브는 부모 인스턴스의 vCPU·메모리를 할당받지만, 부모는 인클레이브 메모리를 읽을 수 없다 |
| **영속 스토리지 없음** | 디스크가 없다. 데이터가 남지 않는다 |
| **네트워크 없음** | 인터넷·VPC 연결이 없다. 통신은 부모와의 **로컬 vsock 채널**뿐 |
| **대화형 접근 없음** | SSH가 불가능하다. 운영자도 안을 들여다볼 수 없다 |
| **증명(Attestation)** | 인클레이브가 **"내가 지금 실행 중인 이미지의 측정값은 이것"** 이라고 서명된 문서로 증명한다 |

**증명이 KMS와의 결합점입니다.** KMS 키 정책의 **`kms:RecipientAttestation:ImageSha384`** ·**`kms:RecipientAttestation:PCR<N>`** 조건 키로 **"내가 승인한 코드 이미지를 실행 중인 인클레이브만 이 키로 복호화할 수 있다"** 를 강제합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowDecryptOnlyFromApprovedEnclave",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-enclave-parent" },
      "Action": "kms:Decrypt",
      "Resource": "*",
      "Condition": {
        "StringEqualsIgnoreCase": {
          "kms:RecipientAttestation:ImageSha384": "EXAMPLE0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab"
        }
      }
    }
  ]
}
```

이 키는 **부모 인스턴스에 침입해 인스턴스 역할을 탈취해도 복호화할 수 없습니다.** 13.4의 "키 정책이 최종 관문"이 여기서는 **"어떤 코드가 호출했는가"** 까지 검사하는 셈입니다.

> ⚠️ 강력한 만큼 **이미지 해시가 바뀌면 즉시 접근이 끊깁니다.** 재빌드하면 측정값이 바뀌므로 **파이프라인이 새 해시를 키 정책에 반영하는 절차**가 없으면 배포와 동시에 서비스가 멈춥니다. 신구 해시를 함께 허용하는 롤아웃 절차를 설계하십시오(28장).

### 언제 쓰는가

| 적합한 경우 | 부적합한 경우 |
|---|---|
| 결제 카드 데이터·복호화된 개인정보를 **짧은 시간 메모리에서만** 처리 | 일반적인 웹 애플리케이션 — 비용과 복잡도 대비 이득이 없다 |
| 개인 키를 인클레이브 안에서만 쓰는 서명 서비스 | 대용량 데이터 배치 처리(스토리지·네트워크가 없다) |
| 여러 조직의 데이터를 합쳐 계산하되 **서로에게 원본을 보이지 않아야** 하는 경우 | 애플리케이션 취약점 방어가 목적인 경우 — **막지 못한다** |
| 규제가 "특권 관리자도 평문에 접근 불가"를 요구하는 경우 | 운영 인력이 격리 환경 디버깅을 감당할 수 없는 경우 |

**🔴 도입 판단 규칙**: 위협 모델(3장)에 **"클라우드 제공자 또는 우리 인프라 운영자가 메모리를 읽는다"** 가 실제로 들어 있을 때만 검토하십시오. 없는데 도입하면 디버깅 불가능한 블랙박스를 하나 늘릴 뿐입니다. 원서의 표현대로 **"매우 높은 보안 환경"** 을 위한 도구입니다.

---

## 이 장의 요약

| 항목 | 핵심 |
|---|---|
| **선택 기준** | 규제 문안에 "단독 테넌시"·"FIPS 140 Level 3"이 없으면 **KMS 기본 키가 정답**. 통제권이 커질수록 **가용성 책임도 함께 넘어온다** |
| **CloudHSM** | FIPS 140 Level 3 단독 테넌트 HSM. 프리 티어 없음, 시간당 과금. **키는 클러스터가 아니라 HSM 안에 있다** |
| **신뢰 앵커** | 자체 서명 CA로 클러스터 CSR에 서명 → HSM 진위 검증의 기준. **개인 키 관리가 곧 클러스터 보안** |
| **역할 분리** | CO(사용자 관리) / CU(키·연산) / AU(AWS 전용). **CO와 CU 겸직 금지** — CloudHSM에는 키 정책이 없다 |
| **커스텀 키 스토어** | KMS 인터페이스 + 다른 키 저장소. CloudHSM형과 외부형(XKS). **자동 순환 없음, 가용성은 내 책임** |
| **BYOK** | 키 자료만 내가 만든다. **만료·삭제 시 원본 32바이트가 없으면 데이터 영구 소실**. AWS는 복원하지 않는다 |
| **양자내성** | HNDL 위협 — **오늘의 방어가 아니라 데이터 수명이 위험을 정한다**. 지금 할 일은 교체가 아니라 **암호 자산 목록과 암호 민첩성** |
| **컨피덴셜 컴퓨팅** | 사용 중 데이터 보호. Nitro Enclaves + KMS 증명 조건 키. **특권 운영자는 막지만 애플리케이션 취약점은 못 막는다** |

## 🔴 필수 구성 체크리스트

- [ ] CloudHSM/커스텀 키 스토어 도입 근거가 **규제 문안 인용과 함께 문서화**되어 있다
- [ ] KMS 기본 키로 충분한 데이터와 전용 HSM이 필요한 데이터가 **구분**되어 있다
- [ ] CloudHSM 클러스터가 **커스텀 VPC의 프라이빗 서브넷**에 있다
- [ ] 클러스터 SG를 **넓히지 않았고**, 클라이언트를 SG에 추가하는 방식으로 접근한다
- [ ] 클라이언트 인스턴스에 **SSH 포트가 없고** Session Manager로 접근하며 **IMDSv2가 강제**되어 있다
- [ ] 신뢰 앵커 개인 키가 **오프라인 또는 별도 보호 저장소**에 있고 접근이 감사된다
- [ ] **CO와 CU 역할이 분리**되어 있고, `kmsuser` 에 **사람이 로그인하지 않는다**
- [ ] CloudHSM 감사 로그가 **중앙 로그 계정으로 전달**된다(29장)
- [ ] HSM이 **서로 다른 AZ에 2대 이상**(운영은 3대 권장) 있다
- [ ] 백업 보존 기간이 **"되돌릴 수 있는 최대 과거 시점"** 기준으로 정해졌다
- [ ] 커스텀 키 스토어의 **`ConnectionState` 감시 알람**이 있다
- [ ] `kms:DeleteCustomKeyStore`·`kms:DisconnectCustomKeyStore`가 **SCP로 제한**되어 있다
- [ ] 자동 순환이 없는 키의 **수동 순환 절차와 주기**가 문서화·등록되어 있다
- [ ] BYOK 키 자료 원본이 **2곳 이상**에 보관되고 위치를 조직이 알고 있다
- [ ] 규제 요구가 없으면 **`KEY_MATERIAL_DOES_NOT_EXPIRE`** 를 쓴다
- [ ] 만료를 쓴다면 **30일/7일/1일 3단계 경보**가 있다
- [ ] 재임포트와 백업 복원 절차를 **실제로 리허설**해 봤다(17.6)
- [ ] 데이터 분류표에 **"몇 년 뒤까지 민감한가"** 열이 있다
- [ ] **암호 자산 목록**(위치·알고리즘·키 길이·라이브러리)이 존재한다
- [ ] TLS 정책이 IaC로 관리되어 **한 줄 변경으로 갱신 가능**하다
- [ ] Nitro Enclaves를 쓴다면 **이미지 해시 변경 시 키 정책 갱신 절차**가 파이프라인에 있다

## ⚠️ 자주 하는 실수

| 실수 | 결과 | 올바른 구성 |
|---|---|---|
| "규제가 HSM을 요구할 것 같아서" CloudHSM을 도입한다 | 시간당 비용과 운영 부담만 늘고 통제는 나아지지 않는다 | 규제 문안을 먼저 읽고 **필요한 등급을 문서화**한 뒤 결정 (14.1) |
| 기본 VPC에 클러스터를 만든다 | 원서도 "실제 활용 사례에서는 프라이빗 서브넷"이라고 단서를 단 구성 | 커스텀 VPC의 프라이빗 서브넷 (14.2) |
| 클러스터 SG를 `10.20.0.0/16` 허용으로 넓힌다 | VPC 안 아무 인스턴스나 HSM 포트에 도달 | **클라이언트를 SG에 추가**한다 (14.2) |
| HSM 1대로 운영한다 | 단일 장애점. 그 1대를 잃으면 백업 외에 키가 없다 | 다른 AZ에 2대 이상 (14.2, 14.4) |
| 실습 후 HSM만 지우고 백업을 남긴다 | 백업 스토리지 요금이 계속 나간다 | HSM → 클러스터 → 백업 순서로 정리 (14.3) |
| 백업 없이 HSM을 전부 지운다 | **키 영구 소실. AWS도 복구 불가** | 삭제 전 `describe-backups` 확인 (14.3) |
| 한 사람이 CO와 CU를 겸한다 | 자기가 CU를 만들어 자기가 키를 쓰는 경로. CloudHSM엔 키 정책이 없다 | 역할과 담당자를 분리 (14.3) |
| `kmsuser` 로 사람이 로그인한다 | KMS 세션이 끊겨 커스텀 키 스토어가 연결 해제된다 | `kmsuser` 는 KMS 전용 (14.4) |
| 버킷 전체 기본 암호화를 커스텀 키 스토어 키로 바꾼다 | 클러스터 장애 시 **모든 객체 읽기 실패** | 규제가 요구하는 데이터에만 한정 적용 (14.4) |
| 커스텀 키 스토어에 자동 순환이 되는 줄 안다 | 원서 지적대로 **미지원**. 몇 년째 같은 키를 쓰게 된다 | 수동 순환 절차 문서화 + 캘린더 등록 (14.4) |
| BYOK 랩핑에 `SHA_1`을 쓴다 | 원서 예제 그대로 따라 한 결과. 지금은 쓸 이유가 없다 | `RSAES_OAEP_SHA_256` 이상 (14.5) |
| `openssl rsautl` 을 그대로 쓴다 | OpenSSL 3.0에서 권장되지 않아 환경에 따라 실패 | `openssl pkeyutl` (14.5) |
| 2단계(파라미터 수신)와 5단계(임포트) 사이에 하루가 지난다 | 임포트 토큰 만료로 실패 | 24시간 안에, 가급적 **한 스크립트 안에서** 완료 (14.5) |
| 습관적으로 키 자료 만료를 켠다 | 만료일에 데이터가 안 읽힌다. 보안 강화 효과는 없다 | 규제 요구가 없으면 만료 없음 (14.5) |
| 키 자료 원본을 담당자 노트북에만 둔다 | 퇴사·분실 = **데이터 영구 소실** | 2곳 이상 보관 + 위치 문서화 (14.5) |
| 리전 장애를 AWS가 키 자료까지 복원해 줄 것으로 기대한다 | 원서 명시: **자동 복원하지 않는다** | 사본으로 재임포트하는 DR 계획 (14.5) |
| "저장 데이터는 AES-256이니 양자 안전하다"고 결론 낸다 | AES 키를 비대칭으로 감쌌다면 사슬 전체가 무너진다 | 데이터 키를 무엇으로 감쌌는지 확인 (14.6) |
| 암호 자산 목록 없이 양자내성 전환을 계획한다 | 무엇을 바꿔야 할지 몰라 착수조차 못 한다 | 목록부터 만든다 (14.6) |
| 알고리즘·키 길이를 코드에 하드코딩한다 | 교체마다 코드 수정·회귀 테스트가 필요 | 설정으로 분리 = 암호 민첩성 (14.6) |
| Nitro Enclaves가 애플리케이션 취약점도 막아 준다고 본다 | 원서 각주 그대로 — 프로세스를 속이면 그대로 뚫린다 | 24장의 애플리케이션 계층 통제와 **병행** (14.7) |
| 증명 조건 키를 걸고 파이프라인은 그대로 둔다 | 재빌드 → 해시 변경 → **배포와 동시에 서비스 중단** | 신구 해시 병행 허용 롤아웃 절차 (14.7, 28장) |

## 다음 장 예고

13~14장에서 "키를 어떻게 지킬 것인가"에 답했습니다. 이제 그 키로 보호할 **데이터가 실제로 놓이는 자리**로 갑니다.

15장은 **S3 보안**입니다. 클라우드 데이터 유출의 최대 단일 원인이라 한 장 전체를 할애합니다. 접근 통제의 4중 구조(퍼블릭 액세스 차단 → 버킷 정책 → IAM 정책 → ACL)와 평가 순서, Object Ownership, 크로스 계정의 객체 소유권 함정, 사전 서명 URL의 만료·권한 상속, SSE-S3/SSE-KMS/SSE-C 비교와 **비암호화 업로드 거부 정책**, 그리고 랜섬웨어 방어의 핵심인 버전 관리·MFA Delete·객체 잠금을 다룹니다.
