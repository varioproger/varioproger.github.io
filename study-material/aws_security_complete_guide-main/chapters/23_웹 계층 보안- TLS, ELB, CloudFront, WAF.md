---
title: "23장. 웹 계층 보안: TLS, ELB, CloudFront, WAF"
---

# 23장. 웹 계층 보안: TLS, ELB, CloudFront, WAF

> **이 장에서 다루는 것**
> - **TLS 종료 위치의 설계 판단** 🔴 — ALB 종료 vs NLB 통과 후 EC2 종료. 각각이 방어하는 위협과 포기하는 것
> - **ACM 인증서 수명 주기** 🔴 — 자동 갱신이 조용히 실패하는 경로와 두 겹의 만료 알람
> - **TLS 정책과 암호 스위트** 🔴 — ELB 보안 정책, CloudFront 최소 프로토콜 버전, HSTS, 구버전 클라이언트 트레이드오프
> - **CloudFront + S3 안전한 배포** 🧪 — OAC, `AWS:SourceArn` 제한 버킷 정책, 서명된 URL/쿠키, 응답 헤더 정책
> - **AWS WAF와 그 함정** ⚠️ — 관리형 규칙 그룹, Count 모드 도입 절차, "깜빡이는 상자"가 되지 않게 하는 법
> - **Shield와 Firewall Manager** — DDoS 복원력 아키텍처, 조직 전체 WAF 강제
>
> **선행 지식**: 13장(전송 중 암호화), 14장(KMS·인증서), 15장(S3 접근 통제), 18~19장(VPC·보안 그룹), 22장(EC2 보안)
> **난이도**: ★★☆

---

19장까지 우리는 ShopMini의 트래픽이 **어디로 갈 수 있는지**를 통제했습니다. 그 통제가 다루지 않는 것이 **허용된 경로 위를 흐르는 내용물**입니다. ALB의 443으로 들어오는 HTTPS 요청은 쿼리 문자열에 `' OR 1=1--` 이 들어 있어도 보안 그룹 입장에서는 합법입니다.

> 📖 *Practical Cloud Security* 2판 6장 「Network Defense Tools」: **"WAF는 사실 스마트 프록시(smart proxy)에 지나지 않는다. 요청을 받아서 SQL 인젝션 같은 나쁜 동작이 있는지 검사하고, 안전하다고 판단되면 백엔드 시스템에 요청을 보낸다. WAF는 전통적인 방화벽이 막지 못하는 공격을 막을 수 있다. TCP/IP 트래픽 자체는 완벽하게 합법적이고, 전통적인 방화벽은 그것이 애플리케이션 계층에 실제로 어떤 영향을 주는지 보지 않기 때문이다."**

같은 장에서 저자는 전송 중 암호화도 네트워크 통제로 분류합니다.

> 📖 *Practical Cloud Security* 2판 6장 「Encryption in Motion」: **"제대로 구현하면 TLS는 하나의 값으로 세 가지 통제를 제공한다."** 클라이언트가 인증서와 서명자를 보고 **서버를 인증하고**, 그 뒤 두 시스템이 대칭 키에 합의해 **기밀성과 무결성**을 지킨다는 것입니다. 그리고 **"클라우드 환경에서는 프런트엔드에서만이 아니라, 물리적·가상적 네트워크 스위치를 건너는 모든 통신에 TLS를 쓸 것을 권한다"** 고 말합니다.

이 장은 그 두 문장을 ShopMini의 구성으로 옮깁니다. CloudFront → ALB → 앱(8443)의 각 구간에서 TLS를 어디서 끊고, 그 위에 WAF를 어떻게 얹고, 무엇을 놓치면 WAF가 아무것도 막지 못하는지를 다룹니다.

---

## 23.1 EC2에 HTTPS 활성화 🧪

ShopMini의 앱 계층은 **8443 HTTPS**로 듣습니다. ALB가 앞에 있는데도 평문 8080이 아닌 이유는 위 인용문 때문입니다 — ALB와 앱 사이에는 최소한 **가상 네트워크 스위치가 하나 있고, AZ가 다르면 물리 경로도 다릅니다.**

*AWS Security Cookbook* 7장의 첫 레시피는 Amazon Linux 2에 `mod_ssl`을 설치하고 `make-dummy-cert`로 자체 서명 인증서를 만드는 절차입니다. 원서도 **"운영 환경에서는 신뢰할 수 있는 인증 기관(CA)이 서명한 인증서를 써야 이 경고가 뜨지 않는다"** 고 못 박습니다.

```bash
# Amazon Linux 2023 앱 인스턴스에서 (Amazon Linux 2라면 dnf 대신 yum)
sudo dnf install -y httpd mod_ssl

# 실습용 자체 서명 인증서 — 운영 환경에서는 절대 이대로 쓰지 않는다
sudo /etc/pki/tls/certs/make-dummy-cert /etc/pki/tls/certs/localhost.crt

# ShopMini 규약에 맞춰 8443으로 듣게 한다
sudo tee /etc/httpd/conf.d/shopmini-ssl.conf > /dev/null <<'EOF'
Listen 8443 https
<VirtualHost *:8443>
    SSLEngine on
    SSLCertificateFile /etc/pki/tls/certs/localhost.crt
    SSLProtocol -all +TLSv1.2 +TLSv1.3
    SSLHonorCipherOrder off
    DocumentRoot /var/www/html
</VirtualHost>
EOF

sudo systemctl enable --now httpd && sudo systemctl restart httpd
curl -k https://localhost:8443/healthz
```

`make-dummy-cert`가 만든 `.crt`에는 인증서와 개인 키가 **함께** PEM 형식으로 들어 있습니다. 그래서 원서 레시피는 `ssl.conf`의 `SSLCertificateKeyFile` 항목을 주석 처리합니다.

여기서 두 가지 문제가 드러납니다. 첫째, **자체 서명 인증서는 상대를 인증하지 못합니다.**

> 📖 *Practical Cloud Security* 2판 6장: **"단순히 TLS를 켜는 것만으로는 충분하지 않다. 앞서 말한 인증 단계를 함께 수행하지 않으면 TLS는 효과의 상당 부분을 잃는다. 공격자가 연결을 가로채 중간자 공격을 하는 것이 어렵지 않기 때문이다."**

둘째, **키 관리가 인스턴스 수만큼 늘어납니다.** 저자는 이를 **"시스템마다 별도의 키 쌍을 만들고 인증서에 서명받아야 한다는 뜻이고, 이는 고통스럽고 자동화하기 어렵다"** 고 표현합니다. AWS에서의 답은 **AWS Private CA**입니다. 각 앱 인스턴스·태스크가 부팅 시 자기 인증서를 발급받게 하면 ALB→앱 구간에서도 실제 인증서 검증이 성립합니다(14장).

> 💡 **원서 이후 변경** — 원서 시점 `mod_ssl` 기본값은 SSL v3와 모든 TLS 버전을 지원했습니다. 위 예제처럼 `SSLProtocol -all +TLSv1.2 +TLSv1.3`으로 **명시적으로 좁히십시오.** 배포판 기본값에 의존하지 않는 것이 원칙입니다.

---

## 23.2 ACM으로 인증서 발급·관리 🧪🔴

퍼블릭 경계(CloudFront·ALB)의 인증서는 **AWS Certificate Manager(ACM)** 로 발급합니다. 원서 표현대로 **"ACM 퍼블릭 인증서는 ELB, CloudFront, Elastic Beanstalk, API Gateway, CloudFormation 같은 AWS 서비스와 함께 사용"** 되며 **"AWS는 퍼블릭 TLS 인증서 프로비저닝에 요금을 부과하지 않습니다."**

```bash
CERT_ARN=$(aws acm request-certificate \
  --profile awssec-lab --region ap-northeast-2 \
  --domain-name shopmini.example.com \
  --subject-alternative-names "*.shopmini.example.com" \
  --validation-method DNS \
  --key-algorithm RSA_2048 \
  --tags Key=Project,Value=awssec-lab Key=Chapter,Value=ch23 \
  --query CertificateArn --output text)

# 검증용 CNAME 레코드 확인 → 도메인 DNS에 등록
aws acm describe-certificate --certificate-arn "$CERT_ARN" \
  --region ap-northeast-2 \
  --query 'Certificate.DomainValidationOptions[].ResourceRecord'
```

원서는 이메일 검증과 DNS 검증을 모두 소개하지만 **운영에서는 DNS 검증만 쓰십시오.** 이유는 갱신입니다. 이메일 검증은 갱신마다 사람이 응답해야 하고 담당자가 퇴사하면 멈춥니다. DNS 검증은 **CNAME 레코드가 그 자리에 남아 있는 한 사람 개입 없이 갱신**됩니다.

### 🔴 반드시 이렇게 구성하라

| 반드시 | 안 했을 때의 결과 |
|---|---|
| **검증 CNAME 레코드를 절대 지우지 마라** — 발급 후에도 갱신에 계속 쓰인다 | "발급 끝났으니 정리하자"가 1년 뒤 갱신 실패로 돌아온다 |
| **CloudFront용 인증서는 `us-east-1`에 발급하라** — ALB용과는 같은 도메인이라도 별개 | 콘솔에 인증서가 보이지 않아 원인 파악에 시간을 버린다 |
| **만료 알람을 두 겹으로 걸어라** | 자동 갱신이 조용히 실패한 것을 만료 당일에 알게 된다 |
| **인증서를 자산으로 등록하라** — 어떤 배포·리스너가 무엇을 쓰는지 목록 유지 | 알고리즘 취약점으로 일괄 재발급이 필요할 때 대상을 모른다 |

> 📖 *Practical Cloud Security* 2판 3장 「TLS certificates」: **"DNS 도메인과 마찬가지로 인증서 갱신을 잊으면 인증서가 만료되는 순간 연결이 실패하면서 서비스 중단이 발생하는 경우가 많다."** 그리고 **"자동 갱신과 개인 키 접근에 대한 알림을 결합하면, 긴급 상황을 제외하고는 사람이 개인 키에 전혀 접근하지 못하게 만들 수 있다. 이는 보안을 개선하는 동시에 인증서 만료로 인한 장애 위험도 줄인다."**

**ACM은 이 문단을 서비스로 구현한 물건입니다.** 퍼블릭 인증서의 개인 키는 밖으로 나올 수 없고 사람이 볼 수 없으며 갱신은 자동입니다.

### ⚠️ 갱신 실패 알람 — 두 겹으로

자동 갱신은 **조용히** 실패합니다. CNAME이 지워졌거나, 도메인 소유권이 바뀌었거나, 인증서가 어떤 리소스에도 연결되지 않아 갱신 자격이 없는 경우입니다.

```bash
# 1겹: 만료 임박 메트릭 알람
aws cloudwatch put-metric-alarm \
  --alarm-name shopmini-acm-days-to-expiry \
  --namespace AWS/CertificateManager --metric-name DaysToExpiry \
  --dimensions Name=CertificateArn,Value="$CERT_ARN" \
  --statistic Minimum --period 86400 --evaluation-periods 1 \
  --threshold 30 --comparison-operator LessThanThreshold \
  --treat-missing-data breaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:444455556666:sec-alerts
```

`--treat-missing-data breaching`이 핵심입니다. **인증서가 삭제되어 메트릭 자체가 사라진 경우도 알림으로 잡아야** 합니다.

```json
{
  "source": ["aws.acm"],
  "detail-type": ["ACM Certificate Approaching Expiration"]
}
```

두 번째 겹은 EventBridge 규칙입니다. **메트릭 알람(리소스 단위)과 이벤트(서비스 단위)를 함께 걸어야** 한쪽이 놓친 것을 다른 쪽이 잡습니다. Config 관리형 규칙 `acm-certificate-expiration-check`를 조직 단위로 배포하면 세 번째 안전망이 됩니다(37장).

> 📖 *AWS Security Cookbook* 7장: **"AWS는 ACM 퍼블릭 인증서를 EC2 인스턴스에서 SSL/TLS를 켜는 데 쓰도록 허용하지 않는다. 다만 ACM 사설 CA가 발급한 인증서는 EC2 인스턴스, 컨테이너, 심지어 우리 자신의 서버에서도 쓸 수 있다."** — 23.1의 앱 계층 인증서를 사설 CA로 발급해야 하는 이유입니다.

> 💡 **원서 이후 변경** — AWS는 이후 퍼블릭 인증서를 유료로 **내보내는(exportable)** 옵션을 추가했습니다. 내보내는 순간 개인 키 관리 책임이 돌아오고 위 인용문이 말한 상태가 깨집니다. **꼭 필요한 경우가 아니면 쓰지 마십시오.**

---

## 23.3 로드 밸런서 유형 선택

원서 시점에는 ELB가 3종(CLB/ALB/NLB)이었고, 이후 GWLB가 추가되어 현재 4종입니다.

| | **CLB** (Classic) | **ALB** (Application) | **NLB** (Network) | **GWLB** (Gateway) |
|---|---|---|---|---|
| OSI 계층 | 4 + 일부 7 | **7 (요청 계층)** | **4** | **3 (투명 게이트웨이)** |
| 프로토콜 | HTTP/HTTPS/TCP/SSL | HTTP/HTTPS/gRPC | TCP/UDP/TLS/TCP_UDP | GENEVE(6081) 캡슐화 |
| TLS 종료 | ELB 또는 EC2 | **ELB에서만** | ELB(TLS) 또는 통과(TCP) | 해당 없음 |
| WAF 연동 | × | **○** | × | × |
| 대상 그룹 | × (인스턴스 직접 등록) | ○ | ○ | ○ |
| 고정 IP | × | × (DNS만) | **○ (AZ별 EIP)** | × |
| 클라이언트 IP | X-Forwarded-For | X-Forwarded-For | **원본 IP 그대로** | 그대로 |
| 주 용도 | 레거시 유지보수 | **웹/API 표준** | 극한 성능, 비HTTP, 종단 간 암호화 | 인라인 보안 어플라이언스 체이닝 |

> 📖 *AWS Security Cookbook* 7장: **"클래식 로드 밸런서는 이전 세대 로드 밸런서다. AWS의 권장 사항은 새로운 로드 밸런서 중 하나, 즉 애플리케이션 로드 밸런서나 네트워크 로드 밸런서를 쓰는 것이다. 다만 오래된 프로젝트나 EC2-Classic 모델을 써야 할 때를 위해 클래식 로드 밸런서에 대해 알고 싶을 수는 있다."**

> 💡 **원서 이후 변경** — CLB는 콘솔에서 이전 세대로 표시되며 **신규 구성에는 쓰지 마십시오.** EC2-Classic 네트워크 자체가 종료되었습니다. 남아 있는 CLB는 마이그레이션 대상에 올리십시오 — **CLB에는 WAF를 붙일 수 없고 TLS 1.3 보안 정책도 쓸 수 없습니다.** GWLB는 원서 이후 추가된 유형으로, 서드파티 IDS/IPS·NGFW 어플라이언스를 트래픽 경로에 투명하게 끼워 넣습니다(19.5와 목적이 같고 수단이 다릅니다).

**보안 관점의 선택 기준은 단순합니다.** HTTP/HTTPS 애플리케이션이면 **ALB가 기본값**입니다. 이유는 성능이 아니라 **붙일 수 있는 통제의 개수**입니다. WAF, 경로 기반 라우팅, OIDC/Cognito 인증 통합, 헤더 정규화, desync 완화 — 전부 7계층을 보기 때문에 가능합니다. NLB를 고르는 순간 이것들을 포기하므로, **"종단 간 암호화 요구가 있다" 또는 "HTTP가 아니다"** 라는 근거가 있을 때만 선택합니다.

---

## 23.4 대상 그룹 구성 🧪

> 📖 *AWS Security Cookbook* 7장: **"애플리케이션 로드 밸런서와 네트워크 로드 밸런서는 대상 그룹으로 트래픽을 라우팅한다. 개별 EC2 인스턴스로 라우팅하는 클래식 로드 밸런서와는 다르다."** 지원 프로토콜은 **"HTTP, HTTPS, TCP, TLS, UDP, TCP_UDP"**, 대상 유형은 인스턴스·IP 주소·Lambda 함수입니다.

원서 레시피는 HTTP·80으로 만들지만 ShopMini는 **HTTPS·8443**입니다. 원서도 **"프로토콜을 HTTPS로, 포트를 443으로 하는 대상 그룹을 추가하고 SSL/TLS가 켜진 EC2 인스턴스를 등록할 수 있다"** 고 명시합니다.

```bash
TG_ARN=$(aws elbv2 create-target-group \
  --profile awssec-lab --region ap-northeast-2 \
  --name shopmini-prod-app-tg \
  --protocol HTTPS --port 8443 --protocol-version HTTP1 \
  --vpc-id "$VPC_ID" --target-type instance \
  --health-check-protocol HTTPS --health-check-path /healthz \
  --health-check-interval-seconds 15 --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 --unhealthy-threshold-count 2 \
  --matcher HttpCode=200 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

aws elbv2 modify-target-group-attributes --target-group-arn "$TG_ARN" \
  --attributes \
    Key=deregistration_delay.timeout_seconds,Value=30 \
    Key=load_balancing.algorithm.type,Value=least_outstanding_requests \
    Key=stickiness.enabled,Value=false
```

보안 관점에서 대상 그룹을 볼 때 확인할 것은 네 가지입니다.

| 항목 | 왜 보안 문제인가 | 권장 |
|---|---|---|
| 헬스 체크 경로 | `/`로 두면 15초마다 앱 로직·DB를 건드리고 액세스 로그를 오염시켜 공격 탐지를 방해 | 인증 없이 응답하는 **전용 경량 경로**(`/healthz`), 내부 상태 노출 금지 |
| 헬스 체크 프로토콜 | HTTP로 두면 앱이 8443만 열어도 "동작한다"고 오판 | **대상 프로토콜과 동일하게** |
| 대상 유형 `ip` | VPC 밖 퍼블릭 IP까지 등록 가능 → 의도치 않은 외부 백엔드 | 기본은 `instance`. `ip`는 CIDR 검토 후 |
| 등록 해제 지연 | 너무 길면 침해 인스턴스가 계속 트래픽을 받음 | 30~60초. 격리 시에는 **즉시 제외** |

첫 줄을 조금 더 보겠습니다. 헬스 체크는 **인증 없이 200을 돌려주는 유일한 경로**이므로, 여기에 버전·호스트명·의존 서비스 상태를 담으면 그대로 정찰 정보가 됩니다. 상세 상태 페이지가 필요하면 별도 경로로 분리해 내부에서만 접근하게 하십시오. 반대로 헬스 체크가 DB 조회까지 하면, DB가 잠깐 느려질 때 **모든 대상이 동시에 unhealthy가 되어 서비스 전체가 내려갑니다.** 보안과 가용성이 같은 설정에서 충돌하는 지점입니다.

마지막 줄은 사고 대응과 연결됩니다. 앱 인스턴스 침해가 의심될 때 첫 동작은 **대상 그룹에서 등록 해제**입니다. 인스턴스를 종료하면 포렌식 증거가 사라지고, 보안 그룹만 바꾸면 기존 연결이 남습니다.

```bash
# 침해 의심 인스턴스 격리 (증거 보존 + 트래픽 차단)
aws elbv2 deregister-targets --target-group-arn "$TG_ARN" \
  --targets Id=i-0abc123def4567890
```

> ⚠️ **ALB는 대상의 인증서를 검증하지 않습니다.** 대상 그룹 프로토콜을 HTTPS로 하면 ALB→앱 구간이 암호화되지만, ALB는 앱이 제시한 인증서의 신뢰 체인을 확인하지 않습니다. 즉 **자체 서명 인증서도 통과합니다.** 이 사실이 위협 모델에 주는 영향은 23.5에서 다룹니다.

---

## 23.5 TLS 종료 위치 결정 🔴

이 장에서 가장 중요한 설계 판단입니다. 원서는 두 레시피를 나란히 배치해 선택지를 보여 줍니다.

> 📖 *AWS Security Cookbook* 7장 도입부: **"로드 밸런서는 로드 밸런서 수준에서 TLS를 종료해 필요한 X.509 인증서를 관리할 단일 지점을 제공할 수 있다. 또는 TLS 트래픽에 대해 TCP 통과(passthrough)를 수행해 인스턴스 수준에서 TLS가 종료되게 할 수도 있다."**

> 📖 *AWS Security Cookbook* 7장: **"ELB 수준에서 TLS를 종료하면 EC2 인스턴스에서 TLS를 종료하는 오버헤드를 피할 수 있어 더 효율적이다. 그러나 종단 간 암호화에 대한 컴플라이언스 요구가 있다면 EC2 인스턴스 수준에서 종료해야 한다."**

| 구성 | 경로 | 방어하는 위협 | **포기하는 것** |
|---|---|---|---|
| **A. ALB 종료 + 평문 전달** | 클라 →(TLS)→ ALB →(HTTP)→ 앱 | 인터넷 구간 도청·MITM | **VPC 내부 구간 전부.** 침해된 인스턴스·잘못 놓인 ENI에서 평문 노출 |
| **B. ALB 종료 + 재암호화** ← **ShopMini** | 클라 →(TLS)→ ALB →(TLS 8443)→ 앱 | 인터넷 + VPC 내부 도청 | ALB에서 **한 번 평문이 됨**. ALB는 앱 인증서를 검증하지 않음 |
| **C. NLB TCP 통과 + EC2 종료** | 클라 →(TLS)→ NLB(TCP) →(그대로)→ 앱 | **종단 간.** 어디서도 평문이 되지 않음 | **WAF·7계층 라우팅·헤더 검사 전부.** 인증서를 인스턴스마다 관리 |

C 구성의 설정은 원서의 이 한 줄로 요약됩니다.

> 📖 *AWS Security Cookbook* 7장: **"네트워크 로드 밸런서로 HTTPS 요청을 TCP 통과시키려면 — 이는 EC2에서 TLS를 종료하기 위해 필요하다 — 프로토콜을 TCP로 설정하되 포트는 443으로 설정해야 한다."** 그리고 **"TCP 대신 TLS(Secure TCP)를 선택하면 NLB가 ELB 자체에서 요청을 복호화한다."**

### 🔴 판단 규칙

**기본값은 B(ALB 종료 + 재암호화)입니다. A는 쓰지 마십시오.** 원서가 A를 소개하는 것은 레시피의 단순함 때문이지 권장이 아닙니다. 저자는 **"물리적·가상적 네트워크 스위치를 건너는 모든 통신"** 에 TLS를 권했고, ALB와 앱은 다른 AZ에 있을 수 있으므로 해당합니다.

**C를 선택해야 하는 경우는 셋뿐입니다.** ① 규제가 "복호화 지점이 애플리케이션이어야 한다"고 문자 그대로 요구할 때, ② HTTP가 아닐 때(게임 프로토콜·MQTT·커스텀 TCP), ③ 클라이언트 인증서를 애플리케이션이 직접 검증해야 할 때.

C를 선택하면 **WAF를 잃습니다.** 원서 표현대로 **"현재 WAF는 API Gateway, CloudFront, 애플리케이션 로드 밸런서에서만 쓸 수 있고, EC2나 Route 53 같은 서비스에는 직접 쓸 수 없습니다."** 종단 간 암호화를 얻는 대가로 SQL 인젝션 차단·속도 제한·봇 통제를 전부 포기하는 것이므로, **"컴플라이언스 문구 하나 때문에 실질 방어를 줄이고 있는 것은 아닌지"** 를 반드시 확인하십시오. 대안은 앱 계층에 RASP 모듈을 얹는 것입니다 — 원서가 WAF와 나란히 소개하는 통제입니다.

### B 구성의 남은 구멍 두 개

| 구멍 | 왜 생기나 | 무엇으로 막나 |
|---|---|---|
| **ALB가 앱 인증서를 검증하지 않는다**(23.4) | 침해된 앱이 공격자 인증서를 제시해도 그대로 연결 | **TLS가 아니라 IAM과 SG로.** 앱 SG가 ALB SG에서만 8443을 받으므로(19.2), 대상 그룹을 바꾸려면 IAM 권한이 필요 |
| **ALB에서 한 번 평문이 된다** | 구조적으로 피할 수 없음 — 공동 책임 모델(2장)에서 받아들이는 경계 | ALB 설정 변경 가능한 IAM 주체 최소화 + CloudTrail 감시 |

> 💡 **원서 이후 변경 — ALB mTLS.** ALB가 **상호 TLS**를 지원합니다. 트러스트 스토어를 만들고 리스너의 `MutualAuthentication` 모드를 `verify`로 두면 ALB가 **클라이언트 인증서를 검증한 뒤** 인증서 정보를 헤더로 앱에 전달합니다. 기존에는 C 구성을 강요받던 요구사항이 B에서 해결됩니다. **B2B API·파트너 연동에서 "WAF도 쓰고 클라이언트 인증서도 검증하고 싶다"의 답입니다.**

---

## 23.6 TLS 정책과 암호 스위트 🔴

TLS를 켜는 것과 **제대로 켜는 것**은 다릅니다.

> 📖 *Practical Cloud Security* 2판 6장: **"하트블리드 취약점에도 불구하고 TLS는 제대로 설정하기만 하면 여전히 매우 안전한 프로토콜이다. 이 글을 쓰는 시점에 TLS 1.3이 사용해야 할 현재 버전이며, 특정 암호 스위트만 허용해야 한다."** 그리고 **"취약점이 발견된 오래된 암호 스위트는 설정에서 제거해야 한다. 허용 가능한 암호 스위트 검토를 취약점 관리 프로세스의 일부로 삼을 수 있다."**

AWS에서 "특정 암호 스위트만 허용"은 **보안 정책 이름 하나를 고르는 일**로 압축됩니다. 원서 레시피는 기본값 `ELBSecurityPolicy-2016-08`을 그대로 씁니다. **이 값을 두면 안 됩니다 — TLS 1.0/1.1을 허용합니다.**

| 정책 | 최소 TLS | 특징 | 언제 |
|---|---|---|---|
| `ELBSecurityPolicy-2016-08` | **1.0** | 원서 시점 기본값 | 신규 구성 금지 |
| `ELBSecurityPolicy-TLS-1-2-2017-01` | 1.2 | TLS 1.2만, 1.3 없음 | 과도기 |
| `ELBSecurityPolicy-TLS13-1-2-2021-06` | **1.2** | **TLS 1.3 + 1.2.** 현재 ALB 기본값 | **일반 웹 기본값** |
| `ELBSecurityPolicy-TLS13-1-2-Res-2021-06` | 1.2 | 위에서 CBC 계열 등 제한적 스위트 제거 | 규제 워크로드 |
| `ELBSecurityPolicy-FS-1-2-Res-2020-10` | 1.2 | **순방향 비밀성 전용**, 제한 세트 | 금융·PCI |
| `ELBSecurityPolicy-TLS13-1-3-2021-06` | **1.3** | TLS 1.3 **전용** | 내부 API·최신 클라이언트 확정 시 |

```bash
aws elbv2 modify-listener --listener-arn "$LISTENER_ARN" \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06

# ALB 부가 보안 속성 — 함께 켜라
aws elbv2 modify-load-balancer-attributes --load-balancer-arn "$ALB_ARN" \
  --attributes \
    Key=routing.http.drop_invalid_header_fields.enabled,Value=true \
    Key=routing.http.desync_mitigation_mode,Value=strictest \
    Key=routing.http.x_amzn_tls_version_and_cipher_suite.enabled,Value=true \
    Key=deletion_protection.enabled,Value=true \
    Key=access_logs.s3.enabled,Value=true \
    Key=access_logs.s3.bucket,Value=shopmini-uploads
```

`drop_invalid_header_fields`와 `desync_mitigation_mode=strictest`는 **HTTP 요청 스머글링** 방어입니다 — ALB와 백엔드가 같은 요청을 다르게 해석하는 틈으로 WAF를 통과시키는 공격이므로 23.9와 직결됩니다. `x_amzn_tls_version_and_cipher_suite`는 각 요청의 실제 TLS 버전을 헤더로 남겨 줍니다.

### CloudFront 최소 프로토콜 버전

| `MinimumProtocolVersion` | 최소 TLS | 비고 |
|---|---|---|
| `TLSv1_2016` / `TLSv1.1_2016` | 1.0 / 1.1 | 사용 금지 |
| `TLSv1.2_2018` | 1.2 | 최소 허용선 |
| `TLSv1.2_2021` | **1.2** | **권장 기본값**, 취약 스위트 제거 |

`ViewerProtocolPolicy`는 원서 설명대로 **"HTTP 요청을 HTTPS로 리다이렉트"**(`redirect-to-https`) 하거나 **"Only HTTPS를 선택하면 모든 HTTP 요청이 폐기"**(`https-only`) 됩니다. **API는 `https-only`, 브라우저용 사이트는 `redirect-to-https`가 실무 기준**입니다.

### HSTS — 첫 요청의 구멍을 막는다

`redirect-to-https`에는 구멍이 남습니다. **첫 요청은 평문 HTTP로 나갑니다.** 그 사이 공격자가 리다이렉트를 가로채면(SSL stripping) 사용자는 계속 HTTP로 통신합니다. **HSTS**는 "이 도메인에는 앞으로 HTTPS로만 접속하라"를 브라우저에 기억시켜 이 창을 닫습니다.

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

CloudFront **응답 헤더 정책**으로 붙이면 앱 코드를 건드리지 않습니다(23.7). ⚠️ `includeSubDomains`와 `preload`는 **되돌리기 어렵습니다.** 프리로드 목록은 브라우저에 하드코딩되므로 서브도메인 하나가 HTTPS를 못 쓰면 접속 불능이 됩니다. **`max-age`를 300초로 시작해 단계적으로 올리고, 모든 서브도메인을 확인한 뒤에만 `preload`를 붙이십시오.**

### ⚠️ 구버전 클라이언트 호환성 트레이드오프

> 📖 *Practical Cloud Security* 2판 6장 각주: **"어떤 경우에는 연결의 반대쪽 끝을 통제할 수 없다면 덜 안전한 암호 스위트를 받아들여야 할 수도 있다 — 예를 들어 구버전 브라우저의 접속을 허용해야 하는 경우다."**

현실에서는 대개 브라우저가 아닙니다. **결제 대행사 콜백 서버, 물류사 배치 연동, 매장 POS 단말**이 TLS 1.0만 말합니다. 정책을 조인 다음 날 "주문은 되는데 정산이 안 된다"가 터집니다. 조이기 전 3단계를 지키십시오.

| 단계 | 무엇을 | 어떻게 |
|---|---|---|
| 1. 측정 | TLS 1.0/1.1 비율과 **클라이언트 정체** | `x_amzn_tls_version_and_cipher_suite` + ALB/CloudFront 액세스 로그. 외부 진단(SSL Labs 등)으로 현 상태 확인 |
| 2. 분리 | 구버전 클라이언트 트래픽만 | **별도 도메인·별도 리스너**에 완화 정책. **만료일을 못 박는다.** 전체를 낮추지 않는다 |
| 3. 상향 | 나머지 전부 | `TLS13-1-2-2021-06` 이상 |

이 순서를 건너뛰고 "일단 조이자"로 가면 롤백하게 되고, **롤백한 정책은 다시 조여지지 않습니다.**

---

## 23.7 CloudFront + S3 안전한 배포 🧪

> 📖 *AWS Security Cookbook* 7장: **"이 레시피에서는 CloudFront 배포 계층을 추가해 S3 버킷을 보호하는 방법을 배운다. CloudFront 배포에서 SSL/TLS를 활성화해 HTTPS 트래픽만 허용한다."**

15장에서 `shopmini-assets`를 **비공개로 두고 CloudFront에만 열어주는** 정책을 봤습니다. 여기서는 CloudFront 쪽을 완성합니다.

> 💡 **원서 이후 변경 — OAI는 OAC로 대체되었습니다.** 원서 레시피는 오리진 설정에서 **Origin Access Identity(OAI)** 생성을 선택합니다. AWS는 이후 **OAC(Origin Access Control)** 를 도입했고, **신규 구성에는 OAC를 쓰십시오.**
>
> | | OAI (원서) | **OAC (현재)** |
> |---|---|---|
> | 인증 주체 | CloudFront 전용 특수 사용자 | **서비스 프린시펄 + SigV4 서명** |
> | 버킷 정책 | `Principal`이 OAI ARN | `cloudfront.amazonaws.com` + **`AWS:SourceArn`으로 배포 한정** |
> | SSE-KMS 객체 | × | **○** |
> | 지원 메서드 | GET/HEAD | GET/HEAD/PUT/POST/PATCH/DELETE |
>
> **`AWS:SourceArn` 한정이 결정적 차이입니다.** OAI 시절에는 같은 OAI를 쓰는 다른 배포도 접근할 수 있었지만 OAC는 **"이 배포 하나만"** 을 강제합니다.

```bash
OAC_ID=$(aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    "Name": "shopmini-assets-oac",
    "Description": "OAC for shopmini-assets S3 origin",
    "SigningProtocol": "sigv4",
    "SigningBehavior": "always",
    "OriginAccessControlOriginType": "s3"
  }' --query 'OriginAccessControl.Id' --output text)
```

버킷 정책은 15장의 것을 그대로 쓰되 전송 강제를 함께 넣습니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOACOnly",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::shopmini-assets/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::111122223333:distribution/E1SHOPMINIDIST"
        }
      }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::shopmini-assets",
        "arn:aws:s3:::shopmini-assets/*"
      ],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

버킷을 SSE-KMS로 암호화했다면 **KMS 키 정책에도** 같은 조건으로 `kms:Decrypt`를 허용합니다. OAI로는 불가능했던 부분입니다.

### 커스텀 도메인과 ⚠️ us-east-1

> ⚠️ **CloudFront에 붙일 ACM 인증서는 반드시 `us-east-1`(버지니아 북부)에 있어야 합니다.** 서울 리전 인증서는 콘솔 드롭다운에 **아예 나타나지 않습니다.** ALB용과 CloudFront용은 같은 도메인이라도 **별개의 인증서**이며, 갱신 알람도 **양쪽 모두** 걸어야 합니다(23.2). 한쪽만 걸어 두고 안심하는 것이 가장 흔한 누락입니다.

같은 이유로 **CloudFront용 WAF 웹 ACL도 `us-east-1`에 `--scope CLOUDFRONT`로** 만듭니다. "글로벌 리소스의 제어 평면은 `us-east-1`에 있다"는 하나의 규칙으로 기억하십시오.

### 응답 헤더 정책과 서명된 URL/쿠키

```bash
# AWS 관리형 SecurityHeadersPolicy의 Id를 확인해 캐시 동작에 연결한다
aws cloudfront list-response-headers-policies --type managed \
  --query 'ResponseHeadersPolicyList.Items[].ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name'
```

관리형 `SecurityHeadersPolicy`는 HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`를 한 번에 붙여 줍니다. CSP처럼 애플리케이션마다 달라지는 헤더는 커스텀 정책으로 추가합니다. **배포 없이 엣지에서 헤더를 고칠 수 있다**는 것이 큰 이점입니다. 한편 공개 이미지와 달리 **구매자만 받을 수 있는 디지털 상품·주문서 PDF**에는 **서명된 URL/쿠키**를 씁니다.

```bash
# 1) 퍼블릭 키 등록 → 2) 키 그룹 생성 → 3) 캐시 동작의 TrustedKeyGroups에 지정
PK_ID=$(aws cloudfront create-public-key --public-key-config '{
  "CallerReference": "shopmini-signer-2026",
  "Name": "shopmini-url-signer",
  "EncodedKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...\n-----END PUBLIC KEY-----\n"
}' --query 'PublicKey.Id' --output text)

aws cloudfront create-key-group --key-group-config "{
  \"Name\": \"shopmini-signers\",
  \"Items\": [\"$PK_ID\"]
}"
```

| | 서명된 URL | 서명된 쿠키 |
|---|---|---|
| 범위 | 객체 **하나** | **경로 패턴 전체**(`/orders/*`) |
| 전달 | 링크에 포함 | `Set-Cookie` |
| 쓰임 | 다운로드 링크, 이메일 첨부 | 로그인 후 회원 전용 영역 |
| ⚠️ 위험 | **URL 자체가 자격 증명** — 로그·Referer·히스토리에 남음 | 쿠키 탈취 시 경로 전체 노출 |

15.6의 S3 사전 서명 URL 함정과 **정확히 같은 위험**이고 대응도 같습니다 — **짧은 만료, 가능하면 IP 제한, 로그의 쿼리 문자열 마스킹.** 개인 키는 Secrets Manager에 두고 서명은 백엔드에서만 합니다. ⚠️ 서명된 URL을 쓰면서 **오리진 버킷의 OAC를 빠뜨리면 무의미합니다** — S3 URL을 직접 알아내면 CloudFront를 건너뛰고 받을 수 있습니다. **OAC와 서명은 항상 세트입니다.**

> 📖 *Practical Cloud Security* 2판 3장: **"CDN에 있는 정보가 대부분의 경우 민감하지 않을 수는 있지만, CDN에 접근할 수 있는 공격자는 콘텐츠를 멀웨어, 비트코인 채굴기, 분산 서비스 거부 코드로 오염시킬 수 있다."** — **배포와 오리진 버킷에 대한 쓰기 권한을 데이터베이스 권한만큼 엄격히 다루십시오.** `cloudfront:UpdateDistribution`은 소수 역할로 제한하고 CloudTrail로 감시합니다.

---

## 23.8 AWS WAF 구성 🧪

> 📖 *AWS Security Cookbook* 7장: **"AWS WAF는 우리의 웹 트래픽을 모니터링하는 방화벽 서비스다. 포트와 IP 주소만 검사하는 보안 그룹·NACL과 달리, AWS WAF는 SQL 인젝션이나 크로스 사이트 스크립팅 같은 흔한 공격으로 이어질 수 있는 악성 콘텐츠를 찾아낼 수 있다."** 구조는 **"웹 ACL은 하나 이상의 규칙을 포함하고, 규칙은 조건문을 담는다"** 이며 규칙은 **IF(조건)와 THEN(동작)** 으로 나뉩니다.

원서는 자기 규칙(쿼리 문자열에 `badstring`이 있으면 차단)을 먼저 만들지만 실무 순서는 반대입니다. **관리형 규칙 그룹을 먼저 얹고, 커스텀 규칙은 덮이지 않는 부분에만 씁니다.** 원서도 **"직접 규칙을 만드는 대신 AWS 관리형 규칙 그룹을 추가할 수도 있다"** 며 목록을 소개합니다.

| 규칙 그룹 (Vendor: `AWS`) | 무엇을 막는가 | 우선순위 |
|---|---|---|
| `AWSManagedRulesCommonRuleSet` | XSS, LFI/RFI, 크기 제한, IMDS SSRF, 나쁜 봇 UA | **1순위** |
| `AWSManagedRulesKnownBadInputsRuleSet` | 알려진 취약점 익스플로잇 패턴 | **1순위** |
| `AWSManagedRulesAmazonIpReputationList` | Amazon 위협 인텔리전스 기반 악성 IP | **1순위** |
| `AWSManagedRulesSQLiRuleSet` | SQL 인젝션 심화 | 2순위 |
| `AWSManagedRulesAdminProtectionRuleSet` | 관리자 페이지 경로 노출 | 2순위 |
| `AWSManagedRulesAnonymousIpList` | VPN·Tor·익명 프록시 | 선택(오탐 주의) |
| `AWSManagedRulesLinuxRuleSet` / `UnixRuleSet` / `WindowsRuleSet` / `PHPRuleSet` / `WordPressRuleSet` | 플랫폼 특화 | **쓰는 스택만** |
| `AWSManagedRulesBotControlRuleSet` / `ATPRuleSet` / `ACFPRuleSet` | 봇 통제 / 계정 탈취 / 가짜 계정 생성 방지 | 유료, 필요 시 |

⚠️ **PHP도 WordPress도 쓰지 않는다면 그 규칙 그룹은 넣지 마십시오.** 막는 것 없이 WCU(Web ACL Capacity Unit)만 먹고 오탐 확률만 올립니다. 웹 ACL에는 WCU 총량 상한이 있어 무한정 쌓을 수 없습니다.

### 🧪 Count 모드로 안전하게 도입하기

**이 절에서 가장 중요한 부분입니다.** 관리형 규칙을 Block으로 바로 켜면 첫날 정상 트래픽이 끊깁니다(23.9). 규칙 그룹의 `OverrideAction`을 `Count`로 두고 시작하십시오.

```json
[
  {
    "Name": "AWS-AmazonIpReputationList",
    "Priority": 10,
    "Statement": {
      "ManagedRuleGroupStatement": {
        "VendorName": "AWS",
        "Name": "AWSManagedRulesAmazonIpReputationList"
      }
    },
    "OverrideAction": { "Count": {} },
    "VisibilityConfig": {
      "SampledRequestsEnabled": true,
      "CloudWatchMetricsEnabled": true,
      "MetricName": "AmazonIpReputationList"
    }
  },
  {
    "Name": "AWS-CommonRuleSet",
    "Priority": 20,
    "Statement": {
      "ManagedRuleGroupStatement": {
        "VendorName": "AWS",
        "Name": "AWSManagedRulesCommonRuleSet",
        "RuleActionOverrides": [
          { "Name": "SizeRestrictions_BODY", "ActionToUse": { "Count": {} } }
        ]
      }
    },
    "OverrideAction": { "Count": {} },
    "VisibilityConfig": {
      "SampledRequestsEnabled": true,
      "CloudWatchMetricsEnabled": true,
      "MetricName": "CommonRuleSet"
    }
  },
  {
    "Name": "AWS-KnownBadInputs",
    "Priority": 30,
    "Statement": {
      "ManagedRuleGroupStatement": {
        "VendorName": "AWS",
        "Name": "AWSManagedRulesKnownBadInputsRuleSet"
      }
    },
    "OverrideAction": { "None": {} },
    "VisibilityConfig": {
      "SampledRequestsEnabled": true,
      "CloudWatchMetricsEnabled": true,
      "MetricName": "KnownBadInputs"
    }
  },
  {
    "Name": "RateLimitPerIP",
    "Priority": 100,
    "Statement": {
      "RateBasedStatement": { "Limit": 2000, "AggregateKeyType": "IP" }
    },
    "Action": { "Block": {} },
    "VisibilityConfig": {
      "SampledRequestsEnabled": true,
      "CloudWatchMetricsEnabled": true,
      "MetricName": "RateLimitPerIP"
    }
  }
]
```

```bash
# CloudFront용 웹 ACL은 반드시 us-east-1 + --scope CLOUDFRONT
aws wafv2 create-web-acl \
  --name shopmini-prod-webacl --scope CLOUDFRONT --region us-east-1 \
  --default-action Allow={} \
  --rules file://rules.json \
  --visibility-config \
    SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=shopminiProdWebACL \
  --tags Key=Project,Value=awssec-lab Key=Chapter,Value=ch23
```

문법 세 가지를 구분하십시오. **`OverrideAction`은 규칙 그룹 전체**, **`Action`은 내가 만든 개별 규칙**, **`RuleActionOverrides`는 규칙 그룹 안의 개별 규칙 하나**에 적용됩니다. 위 예제는 CommonRuleSet 전체를 Count로 두는 대신 `SizeRestrictions_BODY` **하나만 예외 처리**합니다. **오탐이 났을 때 규칙 그룹 전체를 꺼 버리는 것이 최악의 대응이고, 이 필드가 그 유혹을 막아 줍니다.**

| 단계 | 기간 | 동작 | 판단 기준 |
|---|---|---|---|
| 1. 관찰 | 1~2주 | 전 규칙 그룹 `Count` | `CountedRequests` 메트릭과 샘플 요청 수집 |
| 2. 분류 | — | 규칙별 정상/공격 판정 | 정상 트래픽이 걸린 규칙 목록 작성 |
| 3. 예외 | — | `RuleActionOverrides` 또는 `ScopeDownStatement` | **규칙 그룹 전체를 끄지 않는다** |
| 4. 차단 | — | `OverrideAction: None` 전환, **한 그룹씩** | 전환 후 48시간 5xx·문의량 감시 |

```bash
# 어떤 요청이 어떤 규칙에 걸렸는지 실제로 본다 — 2단계의 핵심 명령
aws wafv2 get-sampled-requests \
  --web-acl-arn "$WEBACL_ARN" --scope CLOUDFRONT --region us-east-1 \
  --rule-metric-name CommonRuleSet \
  --time-window StartTime=$(date -u -d '3 hours ago' +%s),EndTime=$(date -u +%s) \
  --max-items 100
```

### 로깅 — 켜지 않으면 위 절차가 성립하지 않는다

```bash
aws wafv2 put-logging-configuration --region us-east-1 \
  --logging-configuration '{
    "ResourceArn": "'"$WEBACL_ARN"'",
    "LogDestinationConfigs": [
      "arn:aws:logs:us-east-1:777788889999:log-group:aws-waf-logs-shopmini"
    ],
    "RedactedFields": [
      { "SingleHeader": { "Name": "authorization" } },
      { "SingleHeader": { "Name": "cookie" } }
    ]
  }'
```

⚠️ 로그 대상 이름은 **반드시 `aws-waf-logs-` 로 시작**해야 합니다(로그 그룹·Firehose 스트림·S3 버킷 모두). **WAF 로그에는 요청 헤더가 통째로 들어가므로 `Authorization`·`Cookie`를 그대로 남기면 로그 아카이브가 자격 증명 저장소가 됩니다** — 12장에서 WAF 로그를 기밀로 분류한 이유입니다.

---

## 23.9 WAF의 함정 ⚠️

이 절의 근거는 원서의 한 문단입니다.

> 📖 *Practical Cloud Security* 2판 6장: **"전통적인 환경에서 WAF는 '깜빡이는 상자(blinky box)'가 되곤 했다 — 랙에 꽂혀서 전면 패널의 불빛을 안심시키듯 깜빡이지만, 실제로는 아무것도 막지 못하는 것이다. 전통적 환경이든 클라우드 환경이든, 애플리케이션에 맞게 제대로 커스터마이징한 규칙을 설정하고, 그 규칙을 유지 관리하고, 알림을 들여다보지 않는다면, 당신은 아마 WAF에서 별 가치를 얻지 못하고 있을 것이다. 안타깝게도 WAF는 때때로 컴플라이언스 체크박스를 채우기 위해서만 쓰이며, 코드 검사보다 PCI 준수에 이르는 더 쉬운 경로를 제공한다는 이유만으로 그 자리에 있다."**

조건이 셋 명시되어 있습니다. **① 커스터마이징된 규칙 ② 규칙 유지 관리 ③ 알림 확인.** 아래 세 시나리오는 각각 하나가 빠졌을 때 일어나는 일입니다.

### ⚠️ 함정 1: WAF를 우회하는 오리진 직접 접근

**사고 시나리오.** CloudFront에 웹 ACL을 붙이고 관리형 규칙을 Block으로 운영하던 중, 웹 ACL 로그에 남지 않은 SQL 인젝션 시도가 발견됩니다. 공격자는 CloudFront를 거치지 않고 **ALB의 DNS 이름에 직접 요청**하고 있었습니다.

**원인.** 원서가 정확히 이 문제를 지적합니다.

> 📖 *Practical Cloud Security* 2판 6장: **"WAF 서비스나 어플라이언스를 쓰는 경우, 모든 트래픽이 실제로 WAF를 지나가도록 반드시 주의를 기울여야 한다. 이를 위해서는 보통 WAF에서 오는 트래픽이 아닌 모든 트래픽을 차단하는 IP 허용목록이 필요한데, 클라우드 WAF 서비스에서 오는 요청의 IP 주소 목록은 시간이 지나면서 바뀌기 때문에 약간의 추가 유지 관리가 발생한다."**

ALB의 DNS 이름은 인증서 투명성 로그, 서브도메인 열거, 예전 DNS 레코드에서 노출됩니다. **오리진 은닉은 "안 알려주기"로 달성되지 않습니다.**

**올바른 구성 — 두 겹.** 1겹은 네트워크입니다. ALB 보안 그룹 인바운드를 **CloudFront 관리형 접두사 목록**으로만 제한합니다(19.2에서 만든 구성).

```bash
PL_CF=$(aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' --output text)

aws ec2 authorize-security-group-ingress --group-id "$SG_ALB" \
  --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,PrefixListIds=[{PrefixListId=$PL_CF,Description='CloudFront origin-facing only'}]"
```

**관리형 접두사 목록이 원서가 말한 "약간의 추가 유지 관리"를 대신해 줍니다.** 2겹은 애플리케이션입니다 — **다른 사람의 CloudFront 배포도 같은 IP 대역에서 오므로** 공격자가 자기 배포의 오리진을 우리 ALB로 지정하면 SG를 통과합니다. 그래서 **CloudFront가 오리진에 붙이는 커스텀 헤더를 ALB 웹 ACL에서 검증**합니다.

```json
{
  "Name": "RequireCloudFrontSecret",
  "Priority": 0,
  "Statement": {
    "NotStatement": {
      "Statement": {
        "ByteMatchStatement": {
          "SearchString": "PLACEHOLDER-ROTATE-ME",
          "FieldToMatch": { "SingleHeader": { "Name": "x-shopmini-origin-verify" } },
          "TextTransformations": [ { "Priority": 0, "Type": "NONE" } ],
          "PositionalConstraint": "EXACTLY"
        }
      }
    }
  },
  "Action": { "Block": {} },
  "VisibilityConfig": {
    "SampledRequestsEnabled": true,
    "CloudWatchMetricsEnabled": true,
    "MetricName": "RequireCloudFrontSecret"
  }
}
```

이 규칙은 **ALB용 리전 웹 ACL**(`--scope REGIONAL`)에 **우선순위 0**으로 넣습니다. ⚠️ `SearchString`은 blob 타입이라 **CLI로 넣을 때는 base64로 인코딩**해야 합니다. 헤더 값은 Secrets Manager에 두고, 배포의 `OriginCustomHeaders`와 WAF 규칙이 겹치는 구간을 두고 순차 회전합니다.

> **🔴 ShopMini에는 웹 ACL이 두 개입니다.** ① `us-east-1`/`CLOUDFRONT` — 관리형 규칙과 속도 제한. ② `ap-northeast-2`/`REGIONAL` — 오리진 헤더 검증 중심의 얇은 ACL. **하나로 합칠 수 없습니다.**

> 💡 **원서 이후 변경** — AWS는 이후 **CloudFront VPC 오리진**을 도입해, ALB를 프라이빗 서브넷에 두고 인터넷 노출 없이 CloudFront가 도달하게 할 수 있게 되었습니다. 이 구성이면 함정 1이 **구조적으로 사라집니다.**

### ⚠️ 함정 2: 튜닝하지 않은 관리형 규칙 — False Positive 장애

**사고 시나리오.** 점검 지적을 받은 팀이 금요일 오후에 관리형 규칙 5개를 전부 Block으로 켰습니다. 토요일 새벽부터 **상품 설명에 HTML을 넣는 판매자 관리자 페이지 저장이 전부 403**으로 실패했습니다. 월요일 아침 운영팀은 원인을 못 찾고 **웹 ACL을 통째로 분리**했고, 그 뒤 아무도 다시 켜지 않았습니다.

**원인.** `CrossSiteScripting_BODY`가 정상 HTML 본문을, `SizeRestrictions_BODY`가 업로드 크기를 잡았습니다. 둘 다 `AWSManagedRulesCommonRuleSet`에 있고 **일반적인 웹 애플리케이션 기준으로는 옳은 규칙입니다.** 원서가 말한 **"애플리케이션에 맞게 제대로 커스터마이징한 규칙"** 이 없었을 뿐입니다. 더 큰 문제는 결말입니다 — **최종 상태가 "WAF 없음"인데 문서에는 "WAF 도입 완료"로 남아 있습니다.**

**올바른 구성.**

| 해야 할 것 | 이유 |
|---|---|
| **23.8의 Count 4단계를 거친다** | 첫날 정상 트래픽이 끊기는 것을 막는 유일한 방법 |
| **오탐은 규칙 단위로 처리한다** — `RuleActionOverrides`로 그 규칙만 Count, 또는 `ScopeDownStatement`로 특정 경로만 우회 | 규칙 그룹 전체를 끄면 수백 개 규칙을 하나의 오탐 때문에 포기하게 됨 |
| **예외에 만료일과 담당자를 태그로 붙이고 분기마다 재검토한다** | 원서가 말한 **"그 규칙을 유지 관리하고"** 가 이 항목. 방치하면 3년 뒤 WAF는 아무것도 막지 않음 |
| **변경은 금요일에 하지 않는다** | 위 시나리오의 절반은 이 규칙 하나로 막힘 |

### ⚠️ 함정 3: 알림을 아무도 보지 않는다

**사고 시나리오.** WAF는 6개월간 매일 수천 건을 차단하며 잘 동작했습니다. 그런데 침해 조사에서 **3주 전부터 특정 IP 대역이 로그인 엔드포인트에 크리덴셜 스터핑을 시도했고 어느 시점부터 통과되기 시작했다**는 사실이 드러납니다. 전부 WAF 로그에 있었지만 **아무도 조회한 적이 없었습니다.**

> 📖 *Practical Cloud Security* 2판 7장 「Logs from Defensive Tooling」: **"어떤 경우에는 도구가 최초 공격은 막고 후속 공격은 통과시킬 수도 있고, 공격을 막지 않고 무언가 일어났다는 것만 기록할 수도 있다. 이 서비스들의 로그를 수집하고 분석하지 않으면, 큰 조기 경보 이점을 스스로 포기하는 셈이다."** 저자는 **"오탐의 위험을 과소평가하지 말라. 실제로는 중요할 수 있는 알림을 무시하도록 스스로와 팀을 훈련시키기가 매우 쉽다"** 고 덧붙이고, 컴플라이언스에 대해서는 **"WAF는 PCI DSS 인증에서 수동 코드 리뷰를 대신하는 용도로 자주 쓰인다. 그 일부로서, WAF 시스템의 로그를 보관하고 분석하고 있다는 것도 보여야 한다"** 고 말합니다.

**알림은 "볼 수 있는 것"이 아니라 "오게 되어 있는 것"이어야 합니다.**

| 신호 | 메트릭/쿼리 | 임계 | 대응 |
|---|---|---|---|
| 차단량 급증 | `AWS/WAFV2` · `BlockedRequests` | 평시 대비 10배 | 공격 진행 중 — 규칙·속도 제한 점검 |
| **차단량 급감** | 같은 메트릭, **하한** 임계 | 평시 대비 1/10 | **웹 ACL이 분리되었거나 규칙이 꺼졌다는 신호** |
| Count 규칙 급증 | `CountedRequests` | 규칙별 | 튜닝 대상 또는 신규 공격 패턴 |
| 특정 IP 반복 | 로그 인사이트 상위 IP 집계 | 주간 | IP 세트에 추가 |
| 5xx 동반 상승 | ALB `HTTPCode_Target_5XX_Count` | — | **오탐 장애 가능성** |

**두 번째 줄이 함정 2와 연결됩니다.** 누군가 웹 ACL을 분리하면 차단량이 0으로 떨어지는데, 상한 임계만 걸면 감지하지 못합니다. **하한 알람을 반드시 함께 거십시오.** 그리고 원서가 요구한 **피드백 루프**를 만드십시오 — 오탐을 본 사람이 튜닝할 경로가 없으면 사람들은 알림 전체를 무시하고, 그 순간 WAF는 다시 깜빡이는 상자가 됩니다.

---

## 23.10 AWS Shield와 DDoS 대응

원서는 DDoS 방어만 다른 태도로 다룹니다.

> 📖 *Practical Cloud Security* 2판 6장 「Anti-DDoS」: **"안티 DDoS 대책에 너무 많이 투자하기 전에 위협 모델을 확인해야 한다. 더 직설적으로 말하면, 누군가 당신을 인터넷에서 밀어낼 만큼 신경 쓸 것인가, 그리고 그렇게 되면 당신에게 얼마나 큰 문제인가? 훔쳐 간 데이터의 모든 사본을 결코 제거할 수 없는 데이터 유출과 달리, DDoS 공격은 결국 끝난다."**

저자는 온라인 소매·대기업 웹사이트·게임 서비스를 **협박범들의 명백한 표적**으로 봅니다. **ShopMini는 온라인 소매이므로 해당합니다.** 반대로 백오피스 애플리케이션이라면 **"DDoS 위험을 수용한다는 것을 명확히 문서화하고 모든 이해관계자의 동의를 받으라"** 는 것이 권고이되, **"그것이 기본 선택이 되어서는 안 되며 가볍게 내릴 결정도 아니다"** 라고 덧붙입니다.

> 📖 *AWS Security Cookbook* 7장: **"Shield Standard는 우리 웹사이트나 애플리케이션을 노리는 네트워크 계층(3계층)과 전송 계층(4계층)의 알려진 인프라 공격을 방어하며, Amazon CloudFront 및 Amazon Route 53과 함께 쓸 때 가장 효과적이다. AWS Shield Advanced는 EC2, ELB, CloudFront, AWS Global Accelerator, Route 53 리소스에서 실행되는 애플리케이션에 대해 더 높은 수준의 보호를 제공한다."**

| | **Shield Standard** | **Shield Advanced** |
|---|---|---|
| 비용 | 무료·자동 | 유료 구독(조직 단위) + 데이터 전송 요금 |
| 방어 계층 | L3/L4 (SYN 플러드, UDP 반사 등) | L3/L4 + **L7(WAF 연동)** |
| 대상 | 모든 AWS 고객 | **명시적으로 등록한 리소스** |
| L7 자동 완화 | × | ○ 웹 ACL에 완화 규칙 자동 생성 |
| 전담 대응 | × | **SRT(Shield Response Team)**, 사전 교전 |
| 비용 보호 | × | 공격으로 인한 스케일링 요금 크레딧 |
| 가시성 | 제한적 | 공격 상세, 글로벌 위협 대시보드 |

**Standard는 이미 켜져 있습니다.** "가장 효과적"인 조합이 **CloudFront + Route 53**인 이유는 **엣지에서 전 세계에 분산 흡수**하기 때문입니다. **Advanced 검토 시점**은 ① 실제 협박이나 공격 이력, ② 다운타임 비용이 구독료를 넘을 때, ③ 계약 SLA가 DDoS를 포함할 때입니다. 켠다면 **SRT에 웹 ACL 접근 권한을 미리 위임**해 두십시오 — 공격이 시작된 뒤는 늦습니다.

### DDoS 복원력 아키텍처 — 세 개의 축

| 축 | 무엇을 | 놓치면 |
|---|---|---|
| **1. 엣지 흡수** | 모든 진입점을 CloudFront 뒤로. 정적 자산은 캐시 히트로 오리진에 도달하지 않고, 동적 요청도 엣지에서 TLS 핸드셰이크 종료. **속도 기반 규칙이 1차 필터**(23.8) | 오리진이 전 세계 트래픽을 혼자 받음 |
| **2. 확장 흡수** | 대상 그룹 앱의 Auto Scaling. **단, 최대 용량 상한과 예산 알람을 함께** | ALB는 살아 있는데 백엔드가 죽거나, 가용성 대신 청구서가 터짐 |
| **3. 오리진 은닉** | 23.9 함정 1과 **같은 통제**. 접두사 목록 제한 + 오리진 헤더 검증. Route 53에 ALB DNS를 직접 노출하지 않기 | 공격자가 엣지를 우회해 오리진을 직접 때림 — **1축이 무의미해짐** |

원서는 마지막으로 **연습**을 요구합니다. **"모든 트래픽을 안티 DDoS 서비스를 통과하도록 라우팅하고, 규칙을 튜닝하고, 공격 시나리오를 연습해야 한다."** 탐지 쪽에서는 **"이는 일반적으로 누군가를 호출하는 수준의 높은 우선순위 알림이어야 하는데, DDoS 공격은 시간이 지나면서 확대되거나 뒤이어 협박 시도가 따르는 경우가 많기 때문이다. 게다가 DDoS 공격은 다른 침해 활동을 감추기 위한 교란일 수도 있다"** 고 말합니다. AWS에서는 `AWS/DDoSProtection` 네임스페이스의 `DDoSDetected` 메트릭과 Shield Advanced 이벤트를 **호출(paging) 등급**으로 연결하고, 마지막 문장 때문에 **대응 중에도 CloudTrail·GuardDuty 알림을 낮추지 않습니다.**

---

## 23.11 Firewall Manager로 조직 전체 WAF 강제

지금까지 만든 것은 **ShopMini 하나**의 웹 계층 보안입니다. 계정이 30개, ALB가 80개인 조직에서 이것을 손으로 반복하면 반드시 빠지는 곳이 생깁니다. 원서가 이 문제를 지목합니다.

> 📖 *Practical Cloud Security* 2판 6장: **"WAF 어플라이언스를 통해 모든 트래픽을 라우팅하면서 단일 장애점을 만들지 않는 것 또한 어려울 수 있다. 일부 클라우드 제공자는 AWS Firewall Manager 같은, 애플리케이션이 항상 WAF의 보호를 받고 있음을 보장하는 데 도움이 되는 서비스를 제공한다."**

**"항상 보호받고 있음을 보장한다"** — 이것이 존재 이유입니다. WAF 규칙을 더 잘 쓰게 해 주는 서비스가 아니라 **웹 ACL이 붙어 있지 않은 리소스를 없애는** 서비스입니다. 전제 조건은 셋입니다. **① Organizations 전체 기능 ② Firewall Manager 관리자 계정 지정(보안 도구 계정 `444455556666`) ③ 대상 계정에 AWS Config 활성화**(FMS는 Config로 리소스를 발견합니다).

```bash
# 관리 계정(123456789012)에서 1회 수행
aws fms associate-admin-account --admin-account 444455556666
```

| 정책 유형 | 강제 대상 | 용도 |
|---|---|---|
| `WAFV2` | CloudFront, ALB, API Gateway 스테이지 | **모든 인터넷 노출 웹 리소스에 기본 웹 ACL 부착** |
| `SHIELD_ADVANCED` | ELB(ALB/NLB/CLB), CloudFront, EIP, Global Accelerator | 보호 대상 자동 등록 |
| `SECURITY_GROUPS_COMMON` | EC2/ENI | 공통 기준 SG 배포 |
| `SECURITY_GROUPS_CONTENT_AUDIT` | 보안 그룹 | `0.0.0.0/0` 22/3389 같은 금지 규칙 탐지·삭제(19.3) |
| `SECURITY_GROUPS_USAGE_AUDIT` | 보안 그룹 | 미사용·중복 SG 정리 |
| `NETWORK_FIREWALL` | VPC | 조직 표준 방화벽 배포(19.5) |
| `DNS_FIREWALL` | VPC | Resolver DNS Firewall 규칙 배포(20.5) |

```bash
aws fms put-policy --policy '{
  "PolicyName": "org-baseline-waf-alb",
  "ResourceType": "AWS::ElasticLoadBalancingV2::LoadBalancer",
  "SecurityServiceType": "WAFV2",
  "SecurityServicePolicyData": {
    "ManagedServiceData": "{\"type\":\"WAFV2\",\"preProcessRuleGroups\":[{\"managedRuleGroupIdentifier\":{\"vendorName\":\"AWS\",\"managedRuleGroupName\":\"AWSManagedRulesCommonRuleSet\"},\"overrideAction\":{\"type\":\"COUNT\"},\"ruleGroupType\":\"ManagedRuleGroup\",\"excludeRules\":[]}],\"postProcessRuleGroups\":[],\"defaultAction\":{\"type\":\"ALLOW\"},\"overrideCustomerWebACLAssociation\":false}"
  },
  "ExcludeResourceTags": false,
  "ResourceTags": [ { "Key": "Environment", "Value": "prod" } ],
  "RemediationEnabled": true
}'
```

핵심 옵션은 셋입니다. **`preProcessRuleGroups`/`postProcessRuleGroups`** 는 조직이 강제하는 규칙을 팀 규칙의 앞에 놓을지 뒤에 놓을지를 정합니다. 조직의 최소 기준은 앞에, 최종 차단은 뒤에 두고 **가운데를 팀 자율 영역으로 남깁니다.** **`overrideCustomerWebACLAssociation`** 은 `false`면 팀이 이미 붙인 웹 ACL을 존중하고 `true`면 덮어씁니다 — **처음에는 반드시 `false`**(`true`는 팀의 커스텀 규칙을 날려 함정 2와 같은 장애를 만듭니다). **`RemediationEnabled`** 는 `false`면 탐지만, `true`면 자동 부착입니다.

| 단계 | 정책 | 조치 |
|---|---|---|
| 1 | `WAFV2`, 관리형 규칙 전부 `COUNT`, `RemediationEnabled=false` | 어느 리소스가 보호되지 않는지 목록화 |
| 2 | 같은 정책, `RemediationEnabled=true` | **웹 ACL 없는 리소스에 Count 모드 ACL 자동 부착** |
| 3 | 팀별로 23.8의 Count 4단계 | 오탐 튜닝 |
| 4 | 조직 정책 `overrideAction`을 `NONE`으로 | 차단 전환 |
| 5 | `SHIELD_ADVANCED`, `SECURITY_GROUPS_CONTENT_AUDIT` 추가 | 심층 방어 확장 |

**2단계가 원서 문장의 실현입니다.** 새 계정에서 새 ALB가 만들어지는 순간 아무도 요청하지 않아도 웹 ACL이 붙습니다. 사람의 기억이 아니라 시스템이 커버리지를 보장합니다. Firewall Manager는 예방적 가드레일이며, SCP·Config 적합성 팩·Control Tower와 함께 **37장**에서 다시 다룹니다.

---

## 이 장의 요약

| 항목 | 핵심 |
|---|---|
| 앱 계층 HTTPS | ALB 뒤에서도 8443 HTTPS. 인증서는 **AWS Private CA**(퍼블릭 ACM 인증서는 EC2에 쓸 수 없다) |
| ACM | **DNS 검증만.** 검증 CNAME 삭제 금지. CloudFront용은 **us-east-1** 별도 발급 |
| 갱신 알람 | `DaysToExpiry` 알람(`treat-missing-data=breaching`) **+** EventBridge `ACM Certificate Approaching Expiration` **+** Config `acm-certificate-expiration-check` |
| LB 선택 | HTTP/HTTPS면 **ALB가 기본값**(WAF·7계층 통제). CLB 신규 금지. NLB는 종단 간 암호화·비HTTP일 때만 |
| TLS 종료 | **기본은 ALB 종료 + 8443 재암호화.** 종단 간이 필요하면 NLB TCP 통과(포트 443) — 대신 **WAF를 잃는다** |
| TLS 정책 | ALB `ELBSecurityPolicy-TLS13-1-2-2021-06` 이상, CloudFront `TLSv1.2_2021`. `2016-08` 금지 |
| HSTS | 응답 헤더 정책으로. `max-age` 단계적 상향, `preload`는 마지막 |
| CloudFront | **OAC**(OAI 아님) + `AWS:SourceArn` 배포 한정 정책 + `redirect-to-https` + 서명된 URL/쿠키 |
| WAF 도입 | 관리형 규칙 3종부터, **전부 Count → 규칙 단위 예외 → 한 그룹씩 Block**. 로그 대상은 `aws-waf-logs-` 접두사 |
| WAF 우회 방지 | ① ALB SG를 **CloudFront 접두사 목록**으로 제한 ② **오리진 커스텀 헤더 검증**(리전 웹 ACL 우선순위 0) |
| 알림 | `BlockedRequests` **상한과 하한 둘 다**. 하한은 "WAF가 꺼졌다"를 잡는다 |
| Shield | Standard는 자동. **CloudFront + Route 53 조합이 가장 효과적.** Advanced는 위협 모델 확인 후 |
| Firewall Manager | 규칙을 잘 쓰게 하는 서비스가 아니라 **보호되지 않은 리소스를 없애는** 서비스. 탐지 → 자동 조치 순서 |

---

## 🔴 필수 구성 체크리스트

- [ ] ALB→앱 구간이 **HTTPS 8443**이다 (대상 그룹·헬스 체크 모두 HTTPS)
- [ ] 앱 인증서를 **AWS Private CA**로 발급했다 (자체 서명 인증서를 운영에 두지 않았다)
- [ ] ACM 인증서를 **DNS 검증**으로 발급했고 **검증 CNAME 레코드가 살아 있다**
- [ ] CloudFront용 인증서를 **`us-east-1`에 별도 발급**했고 **양쪽 모두 만료 알람**이 있다
- [ ] 만료 알람에 `--treat-missing-data breaching`이 설정되어 있다
- [ ] ALB 리스너 보안 정책이 **`ELBSecurityPolicy-TLS13-1-2-2021-06` 이상**이다
- [ ] CloudFront `MinimumProtocolVersion`이 **`TLSv1.2_2021`**, `ViewerProtocolPolicy`가 `redirect-to-https`/`https-only`다
- [ ] **HSTS 헤더**가 응답 헤더 정책으로 붙어 있다
- [ ] ALB에 `drop_invalid_header_fields=true`, `desync_mitigation_mode=strictest`, 삭제 보호, 액세스 로그가 켜져 있다
- [ ] `shopmini-assets`가 **OAC + `AWS:SourceArn` 한정** 정책으로만 열려 있다 (OAI가 아니다)
- [ ] CloudFront 웹 ACL이 **`us-east-1` / `--scope CLOUDFRONT`** 로 만들어져 붙어 있다
- [ ] 관리형 규칙 3종이 있고 **쓰지 않는 플랫폼 규칙 그룹은 없다**
- [ ] 속도 기반 규칙이 있다
- [ ] WAF 로깅이 `aws-waf-logs-` 대상으로 켜져 있고 **`authorization`·`cookie`가 `RedactedFields`에 있다**
- [ ] ALB 보안 그룹 인바운드가 **CloudFront 관리형 접두사 목록**으로만 제한되어 있다
- [ ] ALB에 **리전 웹 ACL**이 붙어 있고 **오리진 커스텀 헤더 검증 규칙이 우선순위 0**에 있다
- [ ] 그 헤더 값이 Secrets Manager에 있고 **회전 절차가 문서화**되어 있다
- [ ] `BlockedRequests`에 **상한 알람과 하한 알람이 모두** 있다
- [ ] Firewall Manager `WAFV2` 정책이 배포되어 **웹 ACL 없는 ALB/CloudFront가 0건**이다

---

## ⚠️ 자주 하는 실수

| 실수 | 결과 | 올바른 구성 |
|---|---|---|
| ACM 검증 CNAME 레코드 정리 | 1년 뒤 갱신 실패 → 전 사용자 인증서 오류 → 서비스 중단 | 레코드 영구 유지. `DaysToExpiry` + EventBridge 이중 알람 (23.2) |
| CloudFront 인증서를 서울 리전에 발급 | 콘솔 드롭다운에 나타나지 않음. 원인을 못 찾고 헤맴 | **us-east-1에 별도 발급.** WAF 웹 ACL도 동일 (23.7) |
| ALB만 보호하고 ALB DNS를 그대로 노출 | 공격자가 CloudFront를 우회해 **WAF·Shield·캐시를 전부 건너뜀** | SG를 CloudFront 접두사 목록으로 제한 **+ 오리진 헤더 검증** (23.9) |
| 관리형 규칙을 한 번에 Block으로 전환 | 정상 트래픽 403 장애 → 웹 ACL 통째 분리 → **영구 미적용** | Count 4단계. 오탐은 `RuleActionOverrides`로 **규칙 단위** (23.8) |
| 오탐 났다고 규칙 그룹 전체 비활성화 | 하나의 오탐 때문에 수백 개 규칙을 포기 | `RuleActionOverrides` 또는 `ScopeDownStatement`로 경로 한정 예외 |
| WAF 로그를 켜지 않거나 보지 않음 | 3주간의 크리덴셜 스터핑을 침해 후에야 발견 | 로깅 필수 + `BlockedRequests` 상·하한 알람 + 주간 상위 IP 리뷰 (23.9) |
| WAF 로그의 헤더를 그대로 저장 | 로그 아카이브에 세션 토큰·API 키 평문 축적 | `RedactedFields`에 `authorization`·`cookie` (23.8) |
| 컴플라이언스용으로만 WAF 도입 | 원서가 말한 **"깜빡이는 상자"** — 감사는 통과, 공격도 통과 | 커스터마이징 + 유지 관리 + 알림 확인 3종 세트 (23.9) |
| 종단 간 암호화를 이유로 NLB 통과 선택 | WAF·속도 제한·봇 통제 전부 상실 | 요구사항 재확인. mTLS가 목적이면 **ALB mTLS**로 (23.5) |
| ALB 보안 정책을 기본값 `2016-08`로 방치 | TLS 1.0/1.1 허용 → 취약 스위트 노출, PCI 부적합 | `TLS13-1-2-2021-06`. 조이기 전 **TLS 버전 헤더로 측정** (23.6) |
| `preload` HSTS를 처음부터 적용 | 서브도메인 하나가 HTTPS를 못 쓰면 되돌릴 수 없음 | `max-age` 300초부터 단계적 상향 (23.6) |
| 계정마다 손으로 웹 ACL 부착 | 새 계정·새 ALB에서 반드시 누락 발생 | Firewall Manager `WAFV2` 정책 + `RemediationEnabled` (23.11) |

---

## 다음 장 예고

이 장의 통제는 전부 **ALB 앞**에서 끝났습니다. WAF가 걸러 낸 요청이 8443에 도착한 뒤 그것을 처리하는 것은 컨테이너이거나 Lambda 함수입니다.

24장은 그 안쪽으로 들어갑니다. 컨테이너 보안의 4C 모델, ECR 이미지 스캐닝과 서명, ECS 태스크 역할과 실행 역할, EKS의 IRSA와 파드 보안 표준, Lambda의 함수별 최소 권한 역할을 다룹니다. **23.5에서 "종단 간 암호화를 위해 WAF를 포기해야 한다"고 했던 지점의 대안 — 애플리케이션 계층 방어 — 도 여기서 이어집니다.**
