---
title: "18장. VPC 설계의 원칙"
---

# 18장. VPC 설계의 원칙

> **이 장에서 다루는 것**
> - **클라우드 네트워크가 전통 IT와 다른 이유** — SDN·NFV·오버레이/캡슐화 위에 얹힌 "가상 사설 클라우드"라는 이름의 실체
> - **CIDR 설계와 IP 주소 계획** 🔴 — RFC 1918 대역 배분, 온프레미스·피어링 충돌 회피, ⚠️ VPC CIDR은 나중에 **축소할 수 없다**
> - **3계층 서브넷 티어링** 🔴 🧪 — Public / Private-App / Isolated-Data를 2개 AZ에 배치하는 CLI 실습
> - **라우팅 테이블 = 접근 통제** 🧪 — 가장 구체적인 경로 우선, ⚠️ "프라이빗 서브넷"이 사실은 퍼블릭이었던 사고와 탐지 스크립트
> - **NAT 게이트웨이와 NAT 인스턴스** 🧪 — AZ별 배치, 비용·가용성 트레이드오프, 소스/대상 확인 비활성화
> - **IPv6에는 NAT가 없다** ⚠️ — 이그레스 전용 인터넷 게이트웨이, IPv4/IPv6 규칙 이중 관리
> - **DMZ와 프록시 패턴의 클라우드 재해석**
>
> **선행 지식**: 1장(심층 방어·폭발 반경), 3장(신뢰 경계), 12장(태깅)
> **난이도**: ★★☆

---

3부까지의 통제는 모두 **데이터에 도달한 뒤** 작동합니다. IAM은 요청이 들어온 다음에 평가되고, KMS는 객체를 읽으려 할 때 개입하며, 버킷 정책은 API 호출을 받은 뒤에 판단합니다.

4부의 질문은 그 앞 단계입니다. **애초에 요청이 도달할 수 있는 경로를 몇 개나 남겨둘 것인가.**

VPC 설계가 이 질문의 첫 답입니다. 그리고 VPC 설계에는 다른 통제에 없는 특징이 있습니다 — **되돌리기가 가장 어렵습니다.** IAM 정책은 고치면 되고 KMS 키는 새로 만들면 되지만, VPC CIDR을 잘못 잡으면 그 위에 올라간 수백 개 리소스를 전부 옮겨야 고칠 수 있습니다. 이 장에서 유독 "처음에 제대로"를 반복하는 이유입니다.

---

## 18.1 클라우드 네트워크가 전통 IT와 다른 점

### 경계가 명확했던 시절의 모델

*Practical Cloud Security*는 네트워크 보안 장을 전통 IT와의 대비로 시작합니다.

> 📖 *Practical Cloud Security* 2판 6장 「Differences from Traditional IT」: **"'경계는 죽었다'는 외침에도 불구하고, 수년간 관리자들은 보안을 위해 네트워크 경계에 크게 의존해 왔다. 네트워크 보안이 시스템 관리자가 기대는 유일한 보안인 경우도 있었다. 그것은 전통 환경이든 클라우드든 어떤 환경에서도 좋은 모델이었던 적이 없다."**
>
> 이어서 온프레미스의 단순함을 이렇게 설명합니다. **"온프레미스 환경에서는 경계를 정의하기가 대체로 쉽다. 가장 단순한 경우, DMZ(경계 네트워크) 둘레에 점선(신뢰 구역)을 하나 긋고 내부 네트워크 둘레에 또 하나를 그은 다음, 무엇이 DMZ로 들어오고 무엇이 DMZ에서 내부 네트워크로 들어가는지를 조심스럽게 제한한다."**

클라우드에서 이 그림이 깨지는 이유를 저자는 두 가지로 짚습니다. 첫째, **신뢰 경계가 자명하지 않습니다.** "Database as a Service를 쓰고 있다면 그것은 내 경계 안인가 밖인가?" ShopMini로 옮기면 — RDS는 우리 서브넷 안에 ENI를 갖지만 운영 평면은 AWS 소유이고, S3는 애초에 서브넷 밖에 있으며, CloudFront는 전 세계 엣지에 있습니다. 하나의 애플리케이션이 이미 세 개의 다른 신뢰 모델 위에 걸쳐 있습니다.

둘째, 그리고 더 중요하게 — **경계를 만드는 비용이 0에 수렴합니다.**

> 📖 같은 절: **"게다가 대부분의 클라우드 환경으로 옮기면 이런 경계를 만드는 것이 더 이상 비싸지 않으므로, 애플리케이션마다 별도의 네트워크 세그먼트를 두고 웹 애플리케이션 방화벽 같은 다른 서비스도 빠르고 쉽게 사용할 여유가 생긴다."**

이것이 이 장을 관통하는 전제입니다. 온프레미스에서 서브넷 하나를 더 만들려면 VLAN 신청서와 스위치 포트와 방화벽 팀 일정이 필요했지만, AWS에서는 API 호출 한 번이고 추가 요금이 없습니다. **"귀찮아서 하나로 합쳤다"는 더 이상 변명이 되지 않습니다.**

### VPC라는 이름의 실체

원서는 "가상 사설 클라우드"라는 이름이 주는 인상을 정확히 교정합니다.

> 📖 *Practical Cloud Security* 2판 6장 「Virtual Private Clouds」: **"각 클라우드 제공자의 정의는 다를 수 있지만, VPC는 진짜 프라이빗 클라우드만큼 가상 호스트를 격리하는 경우가 거의 없다. 클라우드 IaaS의 공유 자원에는 흔히 스토리지, 네트워크, 컴퓨트 자원이 포함된다. VPC는 이름과 달리 일반적으로 네트워크 격리만을 다루며, 여러분의 애플리케이션을 다른 고객이나 다른 애플리케이션과 분리된 별도의 가상 네트워크로 만들 수 있게 해 준다."**
>
> 그리고 그 실용적 가치를 이렇게 정리합니다. **"마케팅을 걷어내고 보면, VPC는 많은 기업에게 양쪽의 장점을 모두 준다. VPC로 고도로 공유된 환경의 비용과 탄력성 이점을 얻으면서도, 애플리케이션의 어떤 구성 요소를 외부 세계에 노출할지를 여전히 촘촘하게 통제할 수 있다. (…) 제공자가 소프트웨어 정의 네트워킹과 오버레이 네트워크로 VPC를 구현하기 때문에, 매우 복잡한 네트워크 토폴로지를 거의 즉시 세울 수 있다. 전통적인 온프레미스 네트워크 팀이 같은 것을 구성하려면 몇 주 또는 몇 달이 걸릴 수도 있는데 말이다."**

저자가 마지막에 덧붙이는 한 문장이 제로 트러스트(1.3)와 연결됩니다. **"VPC가 여러분만 접근할 수 있도록 네트워킹을 구성하게 해 주더라도, 여전히 제로 트러스트 원칙을 따라 모든 인바운드 연결을 인증해야 한다."** 즉 **VPC 경계는 인증을 대체하지 않습니다.** 서브넷 안에 있다는 사실은 신원이 아닙니다.

### SDN·NFV·오버레이 — 눈에 보이지 않는 세 층

콘솔에서 보는 "라우팅 테이블"과 "서브넷"은 물리 장비의 표현이 아닙니다.

| 개념 | 원서 정의 요지 | AWS에서의 모습 | 보안상의 함의 |
|---|---|---|---|
| **SDN** (소프트웨어 정의 네트워킹) | 트래픽 처리 규칙이 각 물리 스위치·라우터가 아니라 **중앙에서 관리**된다 | 라우팅 테이블·SG 변경이 초 단위로 전역 반영 | 설정 오류도 **초 단위로 전역 반영**된다. 변경 감사(29.8)가 곧 네트워크 감사 |
| **NFV** (네트워크 기능 가상화) | 방화벽·라우팅·IDS/IPS에 **전용 하드웨어 상자가 더 이상 필요 없다** | NAT 게이트웨이, Network Firewall, GWLB | 원서 권고: **"가능하면 직접 운영하지 말고 서비스형 기능을 써라"** |
| **오버레이/캡슐화** | 가상 시스템 간 패킷을 제공자 네트워크 패킷 **안에 넣어(encapsulation)** 전달 | 물리적으로 떨어진 인스턴스가 같은 서브넷처럼 통신 | 물리 스위치에 SPAN을 걸 수 없다 → 가시성은 **VPC 플로우 로그**(29.5)와 **트래픽 미러링**으로 얻는다 |

> 📖 *Practical Cloud Security* 2판 6장 「Software-Defined Networking」: **"여러분의 관점에서는 구현이 실제로는 중앙 집중식 컨트롤 플레인이 여러 데이터 플레인 장치를 조율해 트래픽을 옮기는 것이라 해도, 물리 스위치와 라우터를 쓰는 것처럼 네트워크를 다뤄도 된다."**
>
> 📖 같은 장 「Network Functions Virtualization」: **"가능한 경우, 자체 서비스를 유지 관리하기보다 서비스형(as-a-service) 기능을 사용해야 한다."**

이 마지막 문장이 18.5·18.6의 결론을 미리 정합니다. **NAT 인스턴스(직접 운영)보다 NAT 게이트웨이(서비스형)입니다.**

---

## 18.2 CIDR 설계와 IP 주소 계획 🔴

### 되돌릴 수 없는 결정

VPC를 만들 때 입력하는 CIDR 블록은 이 장에서 유일하게 **되돌릴 수 없는** 값입니다.

> ⚠️ **VPC CIDR은 나중에 축소할 수 없습니다.** VPC를 만든 뒤 기본 CIDR 블록을 변경하거나 좁히는 API는 존재하지 않습니다. 가능한 것은 `AssociateVpcCidrBlock`으로 **보조 CIDR 블록을 추가**하는 것뿐이고, 추가로 붙인 블록은 그 위에 서브넷이 하나도 없을 때만 `DisassociateVpcCidrBlock`으로 뗄 수 있습니다. 기본 블록은 VPC를 지워야 사라집니다. 즉 **CIDR을 다시 잡는다 = VPC를 다시 만든다 = 그 안의 모든 것을 옮긴다** 입니다.

AWS가 받아 주는 크기 범위는 넓지 않습니다.

> 📖 *AWS Security Cookbook* 5장 「Creating a VPC in AWS」: **"AWS는 /16 넷마스크와 /28 넷마스크 사이의 CIDR 블록 크기만 지원한다. 따라서 10.0.0.0/8은 AWS VPC의 유효한 CIDR 블록 범위가 아니다."** 또한 **"AWS는 네트워크 식별자 비트만 지정하고 호스트 식별자 비트는 0으로 두도록 요구한다. 예를 들어 10.10.0.0/16은 마지막 16비트가 0이므로 유효한 CIDR 범위다. 그러나 10.10.128.0/16은 17번째 비트에 값이 있으므로 유효하지 않다."**

사설 대역의 출처는 RFC 1918입니다.

> 📖 같은 절: **"RFC 1918은 사설 IPv4 주소로 다음 범위의 사용을 권장하며, AWS도 마찬가지다. 10.0.0.0 – 10.255.255.255 (10/8 프리픽스), 172.16.0.0 – 172.31.255.255 (172.16/12 프리픽스), 192.168.0.0 – 192.168.255.255 (192.168/16 프리픽스)."**

### 🔴 반드시 이렇게 구성하라

**1. 조직 전체의 주소 공간을 먼저 그린 다음 VPC를 만들어라.** VPC 단위로 그때그때 CIDR을 고르면 반드시 겹치고, 겹치면 **VPC 피어링도 Transit Gateway 라우팅도 온프레미스 VPN 라우팅도 성립하지 않습니다**(21장). 겹친 사실은 대개 몇 년 뒤 두 시스템을 연결할 때 발견되고, 그때는 이미 늦었습니다.

**2. 온프레미스가 이미 쓰고 있는 대역을 먼저 빼라.** 사내망은 대개 `10.0.0.0/8` 앞쪽이나 `192.168.0.0/16`을 씁니다. 클라우드 대역은 **사내망과 절대 겹치지 않는 블록**에서 시작해야 합니다.

**3. 리전 → 환경 → 계정 순으로 계층 배분하라.** 상위 계층을 크게 잡아 두면 계정이 늘어도 상위 요약 경로(summary route) 하나로 라우팅이 정리됩니다.

ShopMini가 속한 조직의 배분 예시입니다.

| 계층 | 대역 | 용도 | 비고 |
|---|---|---|---|
| 전체 예약 | `10.0.0.0/8` | 조직 사설 주소 공간 | RFC 1918 |
| 온프레미스 | `10.0.0.0/12` | 사내 데이터센터·지사 | **클라우드에서 절대 사용 금지** |
| 예약(미래) | `10.16.0.0/14` | 인수·합병 대비 | 비워 둔다 |
| **AWS `ap-northeast-2`** | `10.20.0.0/14` | 서울 리전 전체 | 아래로 세분 |
| ├ 운영(Prod) `111122223333` | `10.20.0.0/16` | **`shopmini-prod` VPC** | CANON 고정값 |
| ├ 운영 확장 예비 | `10.21.0.0/16` | 보조 CIDR·2차 VPC | 미리 예약 |
| ├ 개발(Dev) `555555555555` | `10.22.0.0/16` | `shopmini-dev` VPC | |
| └ 보안 도구 `444455556666` | `10.23.0.0/16` | 검사·포렌식 VPC | 34.3 |
| AWS `us-east-1` | `10.24.0.0/14` | 미국 동부 리전 | CloudFront 인증서·글로벌 |
| 컨테이너 오버레이 | `100.64.0.0/10` | EKS 파드 CIDR 등 | RFC 6598, VPC 대역과 분리 |

**4. 서브넷 크기는 "예약 5개"를 계산에 넣어라.**

> 📖 *AWS Security Cookbook* 5장: **"네트워크 주소와 브로드캐스트 주소라는 표준 예약 IP 주소 외에도, AWS는 3개의 IP 주소를 더 예약한다. 따라서 VPC에서는 총 5개의 주소가 예약된다."** CIDR이 `10.0.0.0/16`인 경우 예약 주소는 **네트워크 주소 `10.0.0.0`, VPC 라우터용 `10.0.0.1`, DNS용 `10.0.0.2`, 미래 사용 예약 `10.0.0.3`, 브로드캐스트 주소 `10.0.255.255`** 입니다.

| 서브넷 크기 | 총 주소 | 사용 가능 | 적합한 용도 |
|---|---|---|---|
| `/28` | 16 | **11** | 최소 크기. 테스트용 외 비권장 |
| `/27` | 32 | 27 | RDS 서브넷 그룹 등 소규모 격리 계층 |
| `/24` | 256 | **251** | ShopMini 표준. 대부분의 계층에 충분 |
| `/22` | 1,024 | 1,019 | EKS 노드·파드 ENI가 많은 앱 계층 |
| `/16` | 65,536 | 65,531 | VPC 전체 (서브넷으로는 과대) |

> ⚠️ **가장 흔한 산정 실수는 "인스턴스 수 = 필요한 IP 수"입니다.** 실제로는 ENI 하나당 IP 하나이고, `awsvpc` 모드 ECS 태스크·EKS 파드·Lambda VPC 연결·NLB/ALB 노드·인터페이스 엔드포인트(20.2)가 모두 서브넷 IP를 소비합니다. **앱 계층은 예상 최대치의 2배**로 잡으십시오.

ShopMini는 `/16` VPC 안에 `/24` 서브넷 6개를 씁니다. `/16` 안에 `/24`는 256개까지 들어가므로 250개분의 성장 여유가 남습니다.

**5. 부족해지면 보조 CIDR로 확장하라.** 축소는 불가능하지만 **추가는 가능합니다.**

```bash
export AWS_PROFILE=awssec-lab
export AWS_DEFAULT_REGION=ap-northeast-2

# 보조 CIDR 블록 추가 (기존 서브넷에 영향 없음)
aws ec2 associate-vpc-cidr-block \
  --vpc-id vpc-0aa11bb22cc33dd44 \
  --cidr-block 10.21.0.0/16
```

보조 블록은 기본 블록과 **겹치지 않아야** 하고, 추가 후 기존 라우팅 테이블에 `10.21.0.0/16 → local` 경로가 자동으로 생깁니다. 다만 **온프레미스·피어 VPC 쪽 라우팅에는 자동 반영되지 않으므로** 양쪽 경로를 수동으로 추가해야 합니다. 처음부터 넉넉히 잡아야 하는 이유입니다.

---

## 18.3 서브넷 티어링 🔴 🧪

### 세 계층으로 나누는 기준

> 📖 *Practical Cloud Security* 2판 6장 「Internal segmentation」: **"애플리케이션은 아마 웹 계층(DMZ), 애플리케이션 계층, 데이터베이스 계층처럼 몇 개의 서로 다른 신뢰 경계를 갖게 될 것이다. (…) 전통 IT 세계에서 내부 세그멘테이션은 종종 지저분했다. 티켓으로 신청해야 하는 802.1Q VLAN이 여럿 필요하거나, 중앙에서 관리할 수 있는 호스팅 방화벽 솔루션을 써야 했다. 클라우드 환경에서는 몇 번의 클릭이나 API 호출로 필요한 만큼 서브넷을 만들 수 있고, 대개 추가 요금도 없다."**

계층을 나누는 기준은 "무엇이 도는가"가 아니라 **"인터넷과의 관계"** 입니다.

| 계층 | 서브넷 | 인바운드(인터넷) | 아웃바운드(인터넷) | ShopMini 배치 |
|---|---|---|---|---|
| **Public** | `10.20.0.0/24`(2a) · `10.20.1.0/24`(2c) | **가능** (IGW 경유) | 가능 (IGW 경유) | ALB, NAT 게이트웨이 |
| **Private-App** | `10.20.10.0/24`(2a) · `10.20.11.0/24`(2c) | 불가 | **아웃바운드만** (NAT GW 경유) | 앱 EC2/컨테이너 (8443) |
| **Isolated-Data** | `10.20.20.0/24`(2a) · `10.20.21.0/24`(2c) | 불가 | **불가** | RDS MySQL (3306) |

**라우팅 테이블에 무엇이 없는가가 그 계층의 정의입니다.**

| 계층 | 라우팅 테이블 | `0.0.0.0/0` 대상 | `::/0` 대상 | 로컬 경로 |
|---|---|---|---|---|
| Public | `rtb-shopmini-public` (2개 AZ 공유) | **IGW** | IGW | `10.20.0.0/16 → local` |
| Private-App (2a) | `rtb-shopmini-app-2a` | **NAT GW (2a)** | EIGW | `10.20.0.0/16 → local` |
| Private-App (2c) | `rtb-shopmini-app-2c` | **NAT GW (2c)** | EIGW | `10.20.0.0/16 → local` |
| Isolated-Data | `rtb-shopmini-data` | **없음** | **없음** | `10.20.0.0/16 → local` + 게이트웨이 엔드포인트 |

> 🔴 **Private-App의 라우팅 테이블은 AZ마다 따로 만들어야 합니다.** 하나의 라우팅 테이블을 두 AZ의 앱 서브넷이 공유하면 `0.0.0.0/0` 대상이 하나뿐이므로, 2a의 NAT 게이트웨이가 죽으면 **2c 인스턴스의 아웃바운드까지 함께 죽습니다.** 이유는 18.5에서 다룹니다.

### 전체 구성도

```
                              인터넷
                                 │
                    ┌────────────┴─────────────┐
                    │  CloudFront (글로벌 엣지)  │
                    └────────────┬─────────────┘
                                 │ HTTPS 443
╔════════════════════════════════╪══════════════════════════════════════════╗
║ VPC  shopmini-prod   10.20.0.0/16          리전 ap-northeast-2            ║
║                          ┌──────┴──────┐                                   ║
║                          │  IGW (1개)   │◄── 이그레스 전용 IGW(IPv6) 별도  ║
║                          └──┬───────┬──┘                                   ║
║          AZ ap-northeast-2a │       │ AZ ap-northeast-2c                   ║
║   ┌─────────────────────────┴──┐ ┌──┴─────────────────────────┐           ║
║   │ PUBLIC   10.20.0.0/24      │ │ PUBLIC   10.20.1.0/24      │           ║
║   │  · ALB 노드                 │ │  · ALB 노드                 │           ║
║   │  · NAT GW (EIP)  ●─────────┐│ │  · NAT GW (EIP)  ●─────────┐│          ║
║   │  rtb-public : 0.0.0.0/0→IGW││ │  rtb-public : 0.0.0.0/0→IGW││          ║
║   └───────────┬────────────────┘│ └───────────┬────────────────┘│          ║
║               │ 8443 HTTPS      │             │ 8443 HTTPS      │          ║
║   ┌───────────┴────────────────┐│ ┌───────────┴────────────────┐│          ║
║   │ PRIVATE-APP 10.20.10.0/24  ││ │ PRIVATE-APP 10.20.11.0/24  ││          ║
║   │  · 앱 EC2 / 컨테이너         ││ │  · 앱 EC2 / 컨테이너         ││          ║
║   │  rtb-app-2a :               ││ │  rtb-app-2c :               ││          ║
║   │    0.0.0.0/0 → NAT GW(2a) ──┘│ │    0.0.0.0/0 → NAT GW(2c) ──┘│         ║
║   └───────────┬────────────────┘  └───────────┬────────────────┘           ║
║               │ 3306 MySQL                    │ 3306 MySQL                 ║
║   ┌───────────┴────────────────┐  ┌───────────┴────────────────┐           ║
║   │ ISOLATED-DATA 10.20.20.0/24│  │ ISOLATED-DATA 10.20.21.0/24│           ║
║   │  · RDS MySQL (Multi-AZ)     │  │  · RDS 대기 인스턴스          │          ║
║   │  rtb-data : local 만         │  │  rtb-data : local 만         │          ║
║   │  (인터넷 경로 자체가 없음)     │  │  (인터넷 경로 자체가 없음)     │          ║
║   └───────────┬────────────────┘  └────────────────────────────┘           ║
║               │                                                            ║
║        ┌──────┴──────────────────────────────┐                             ║
║        │ 게이트웨이 엔드포인트 (S3) → 20.1     │  ← 인터넷 경유 없이 S3 접근    ║
║        └─────────────────────────────────────┘                             ║
╚════════════════════════════════════════════════════════════════════════════╝
```

### 🧪 실습: VPC와 6개 서브넷 만들기

```bash
#!/usr/bin/env bash
set -euo pipefail
export AWS_PROFILE=awssec-lab
export AWS_DEFAULT_REGION=ap-northeast-2

TAGS='ResourceType=vpc,Tags=[{Key=Name,Value=shopmini-prod},{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch18},{Key=AutoDelete,Value=true}]'

VPC_ID=$(aws ec2 create-vpc \
  --cidr-block 10.20.0.0/16 \
  --tag-specifications "$TAGS" \
  --query 'Vpc.VpcId' --output text)
echo "VPC: $VPC_ID"

# 프라이빗 DNS 이름 활성화 (인터페이스 엔드포인트·RDS 엔드포인트 해석에 필요)
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support '{"Value":true}'
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames '{"Value":true}'
```

서브넷 6개를 계층·AZ 조합으로 만듭니다.

```bash
create_subnet () {  # $1=CIDR  $2=AZ  $3=Name
  aws ec2 create-subnet \
    --vpc-id "$VPC_ID" \
    --cidr-block "$1" \
    --availability-zone "$2" \
    --tag-specifications \
      "ResourceType=subnet,Tags=[{Key=Name,Value=$3},{Key=Tier,Value=${3##*-subnet-}},{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch18},{Key=AutoDelete,Value=true}]" \
    --query 'Subnet.SubnetId' --output text
}

SN_PUB_A=$(create_subnet 10.20.0.0/24  ap-northeast-2a shopmini-public-2a)
SN_PUB_C=$(create_subnet 10.20.1.0/24  ap-northeast-2c shopmini-public-2c)
SN_APP_A=$(create_subnet 10.20.10.0/24 ap-northeast-2a shopmini-app-2a)
SN_APP_C=$(create_subnet 10.20.11.0/24 ap-northeast-2c shopmini-app-2c)
SN_DAT_A=$(create_subnet 10.20.20.0/24 ap-northeast-2a shopmini-data-2a)
SN_DAT_C=$(create_subnet 10.20.21.0/24 ap-northeast-2c shopmini-data-2c)

printf 'public : %s %s\napp    : %s %s\ndata   : %s %s\n' \
  "$SN_PUB_A" "$SN_PUB_C" "$SN_APP_A" "$SN_APP_C" "$SN_DAT_A" "$SN_DAT_C"
```

> 🔴 **퍼블릭 IP 자동 할당은 필요할 때만 켜라.** 쿡북 레시피는 첫 번째 서브넷에 `Enable auto-assign public IPv4 address`를 켜지만, 이 설정은 **그 서브넷에서 시작되는 모든 인스턴스에 기본으로 공인 IP를 붙입니다.** ShopMini의 퍼블릭 서브넷에는 ALB와 NAT 게이트웨이만 들어가고 둘 다 이 설정이 필요 없으므로 **6개 서브넷 모두 비활성**이 정답입니다. 기본값이지만 명시적으로 확인해 둡니다.

```bash
for SN in "$SN_PUB_A" "$SN_PUB_C" "$SN_APP_A" "$SN_APP_C" "$SN_DAT_A" "$SN_DAT_C"; do
  aws ec2 modify-subnet-attribute --subnet-id "$SN" --no-map-public-ip-on-launch
done
```

> 📖 *AWS Security Cookbook* 5장 「Creating subnets in a VPC」: **"AWS VPC의 서브넷은 항상 하나의 가용 영역(AZ)과 연결된다. 하나의 서브넷을 둘 이상의 AZ에 연결할 수는 없지만, 하나의 AZ에 여러 서브넷을 연결할 수는 있다."**
>
> 그래서 계층 3개 × AZ 2개 = 서브넷 6개이고, AZ를 3개로 늘리는 순간 9개가 됩니다. CIDR을 넉넉히 잡아야 하는 또 하나의 이유입니다.

---

## 18.4 라우팅 테이블과 인터넷 게이트웨이 🧪

### 라우팅 테이블은 접근 통제 장치다

VPC에서 "퍼블릭 서브넷"과 "프라이빗 서브넷"은 **속성값이 아닙니다.** AWS 어디에도 `IsPublic` 필드는 없고, 서브넷의 성격은 오직 **연결된 라우팅 테이블에 `0.0.0.0/0 → igw-…` 경로가 있는가** 로 결정됩니다.

경로 선택 규칙은 **가장 구체적인(longest prefix match) 경로가 이깁니다.**

| 목적지 | 대상 | 우선순위 |
|---|---|---|
| `10.20.0.0/16` | `local` | 가장 구체적일 때 최우선. **삭제·변경 불가** |
| `10.20.20.0/24` | `vpce-…` / `pcx-…` | `/16`보다 구체적이므로 우선 |
| `52.95.0.0/16` (S3 프리픽스 목록) | `vgw-…` | `0.0.0.0/0`보다 우선 |
| `0.0.0.0/0` | `igw-…` / `nat-…` | 아무것도 안 맞을 때의 기본 경로 |

> 🔴 **VPC 내부 통신은 `local` 경로로 이미 열려 있습니다.** 라우팅 테이블로는 서브넷 간 통신을 막을 수 없습니다. **계층 간 차단은 보안 그룹과 NACL의 일**(19장)이고, 라우팅 테이블이 통제하는 것은 **VPC 밖으로 나가는 경로의 존재 여부**입니다.

### 🧪 IGW 연결과 퍼블릭 라우팅 테이블

```bash
IGW_ID=$(aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=shopmini-igw},{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch18},{Key=AutoDelete,Value=true}]' \
  --query 'InternetGateway.InternetGatewayId' --output text)

aws ec2 attach-internet-gateway --vpc-id "$VPC_ID" --internet-gateway-id "$IGW_ID"

# 퍼블릭 전용 라우팅 테이블을 '새로' 만든다 (메인 라우팅 테이블을 쓰지 않는다)
RTB_PUB=$(aws ec2 create-route-table --vpc-id "$VPC_ID" \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=rtb-shopmini-public},{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch18},{Key=AutoDelete,Value=true}]' \
  --query 'RouteTable.RouteTableId' --output text)

aws ec2 create-route --route-table-id "$RTB_PUB" \
  --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID"

aws ec2 associate-route-table --route-table-id "$RTB_PUB" --subnet-id "$SN_PUB_A"
aws ec2 associate-route-table --route-table-id "$RTB_PUB" --subnet-id "$SN_PUB_C"
```

> 📖 *AWS Security Cookbook* 5장 「Configuring an internet gateway and a route table for internet access」: **"기본적으로 서브넷은 메인 라우팅 테이블과 연결된다. 만약 메인 라우팅 테이블을 퍼블릭으로 만들면, 프라이빗 라우팅 테이블에 연결하기 전까지 모든 신규 서브넷이 암묵적으로 퍼블릭이 된다. 따라서 퍼블릭 접근용 라우팅 테이블을 별도로 만들고, 퍼블릭 접근이 필요한 서브넷을 그 라우팅 테이블에 붙이는 것이 일반적으로 좋은 관행이다."**
>
> 또한 **"VPC당 인터넷 게이트웨이는 하나만 연결할 수 있다"** 는 제약도 함께 확인해 둡니다.

이 인용은 다음 사고 시나리오와 정확히 짝을 이룹니다.

### ⚠️ 사고: "프라이빗 서브넷"이 사실은 퍼블릭이었다

**사고 시나리오.**
운영팀이 배치 처리용 서브넷 `10.20.12.0/24`(`shopmini-batch-private`)를 만들었습니다. 인스턴스에 공인 IP도 붙이지 않았고 보안 그룹 인바운드도 앱 서브넷 CIDR만 허용했습니다. 두 달 뒤 GuardDuty가 이 서브넷의 인스턴스에서 `UnauthorizedAccess:EC2/TorClient` findings를 올립니다. 조사해 보니 인스턴스는 인터넷과 **양방향으로** 통신 가능한 상태였습니다.

**원인.**
서브넷을 만들 때 **라우팅 테이블을 명시적으로 연결하지 않았습니다.** 그런데 이 VPC는 몇 년 전 다른 팀이 만들면서 **메인 라우팅 테이블에 `0.0.0.0/0 → igw-…` 경로를 넣어 둔** 상태였습니다. 명시적 연결이 없는 서브넷은 자동으로 메인 라우팅 테이블에 붙습니다. **이름만 프라이빗이고 라우팅은 퍼블릭이었던 것입니다.**

여기에 두 번째 요인이 겹쳤습니다. 공인 IP가 없으면 IGW로 나갈 수도 들어올 수도 없는 것이 정상인데, 이 인스턴스에는 운영 편의를 위해 **탄력적 IP가 붙어 있었습니다.** 그 순간 서브넷의 라우팅 + EIP 조합이 완전한 양방향 인터넷 노출을 만들었습니다.

**올바른 구성.**

1. **메인 라우팅 테이블에는 인터넷 경로를 절대 넣지 않는다.** 이상적으로는 메인 라우팅 테이블 = `local` 경로만 있는 **격리 계층용** 테이블입니다. 새 서브넷이 실수로 붙어도 사고가 되지 않습니다.
2. **모든 서브넷에 라우팅 테이블을 명시적으로 연결한다.** "기본값이 알아서 해 주겠지"를 없앱니다.
3. **탐지를 자동화한다.** 아래 두 가지를 모두 겁니다.

**탐지 ① AWS Config 관리형 규칙**

| 규칙 | 검사 내용 |
|---|---|
| `no-unrestricted-route-to-igw` | 라우팅 테이블에 `0.0.0.0/0` 또는 `::/0` → IGW 경로가 있으면 NON_COMPLIANT |
| `subnet-auto-assign-public-ip-disabled` | 서브넷의 퍼블릭 IP 자동 할당이 켜져 있으면 NON_COMPLIANT |

`no-unrestricted-route-to-igw`는 **의도된 퍼블릭 서브넷도 위반으로 잡습니다.** 예외는 Config 규칙 파라미터나 Security Hub 억제 규칙으로 관리하되 **예외 목록 자체를 리뷰 대상으로 삼으십시오.** "예외가 3개에서 11개가 되었다"가 곧 신호입니다.

**탐지 ② `describe-route-tables` 점검 스크립트**

```bash
#!/usr/bin/env bash
# 이름과 무관하게, 라우팅 테이블 기준으로 실제 퍼블릭 서브넷을 나열한다.
set -euo pipefail
export AWS_PROFILE=awssec-lab
export AWS_DEFAULT_REGION=ap-northeast-2
VPC_ID="${1:?usage: $0 <vpc-id>}"

for RT in $(aws ec2 describe-route-tables \
              --filters "Name=vpc-id,Values=$VPC_ID" \
              --query 'RouteTables[].RouteTableId' --output text); do

  GW=$(aws ec2 describe-route-tables --route-table-ids "$RT" \
        --query "RouteTables[0].Routes[?DestinationCidrBlock=='0.0.0.0/0'].GatewayId | [0]" \
        --output text)
  GW6=$(aws ec2 describe-route-tables --route-table-ids "$RT" \
        --query "RouteTables[0].Routes[?DestinationIpv6CidrBlock=='::/0'].GatewayId | [0]" \
        --output text)
  IS_MAIN=$(aws ec2 describe-route-tables --route-table-ids "$RT" \
        --query 'RouteTables[0].Associations[?Main==`true`] | length(@)' --output text)
  SUBNETS=$(aws ec2 describe-route-tables --route-table-ids "$RT" \
        --query 'RouteTables[0].Associations[].SubnetId' --output text)

  case "$GW$GW6" in
    *igw-*)
      echo "[PUBLIC] $RT  v4=$GW v6=$GW6"
      echo "         명시 연결 서브넷: ${SUBNETS:-(없음)}"
      [ "$IS_MAIN" != "0" ] && \
        echo "         *** 경고: 메인 라우팅 테이블입니다. 미연결 서브넷이 전부 퍼블릭입니다. ***"
      ;;
    *) echo "[private] $RT  서브넷: ${SUBNETS:-(없음, 메인 경유)}" ;;
  esac
done
```

핵심은 마지막 경고입니다. **메인 라우팅 테이블이 퍼블릭이면 아직 만들어지지도 않은 미래의 서브넷까지 전부 퍼블릭입니다.**

---

## 18.5 NAT 게이트웨이 구성 🧪

### 왜 필요한가

> 📖 *AWS Security Cookbook* 5장 「Setting up and configuring NAT gateways」: **"프라이빗 서브넷의 인스턴스는 패치, 소프트웨어 다운로드 같은 활동을 위해 인터넷 접근이 필요할 수 있다. NAT는 VPC의 프라이빗 서브넷이 인터넷과 통신할 수 있게 해 준다. NAT는 전송 중인 패킷의 IP 헤더를 수정해 IP 주소를 재매핑하는 과정이다."**

*Practical Cloud Security*는 여기에 중요한 단서를 붙입니다.

> 📖 *Practical Cloud Security* 2판 6장 「Network Address Translation」: **"흔히 되풀이되는 말이 'NAT는 보안이 아니다'라는 것이다. 그것은 100% 사실이지만 실질적으로는 무의미하다. NAT 자체를 수행하는 것은 어떤 보안도 제공하지 않는다. 패킷을 라우팅하면서 IP 헤더를 몇 군데 바꿀 뿐이다. 그러나 NAT의 존재는 NAT를 수행할 수 있는 방화벽의 존재를 함의하며, 그 방화벽은 일반적으로 특정 DNAT 트래픽을 허용 목록으로 관리하고 DNAT 규칙에 맞지 않는 모든 패킷을 버리도록 구성되어 있다."**
>
> 저자는 SNAT와 DNAT를 이렇게 구분합니다. **"소스 NAT(SNAT, 마스커레이딩)는 패킷이 VPC 영역을 떠날 때 소스 주소를 바꾸는 것이다. 대상 NAT(DNAT)는 외부에서 오는 패킷이 VPC 영역으로 들어올 때 대상 주소를 바꿔 VPC 내부의 특정 시스템으로 가게 하는 것이다. **VPC 내부 시스템으로 DNAT를 수행하지 않으면, 외부 시스템이 내부 시스템에 도달할 방법은 없다.**"**

AWS NAT 게이트웨이는 **SNAT만 수행하고 DNAT는 하지 않습니다.** 그래서 아웃바운드는 되고 인바운드 신규 연결은 불가능합니다. 이것이 프라이빗 앱 계층이 패치를 받으면서도 인터넷에서 도달 불가능한 이유입니다.

### 🧪 AZ별 NAT 게이트웨이 생성

```bash
# AZ 2a
EIP_A=$(aws ec2 allocate-address --domain vpc \
  --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Name,Value=shopmini-nat-eip-2a},{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch18},{Key=AutoDelete,Value=true}]' \
  --query 'AllocationId' --output text)

NAT_A=$(aws ec2 create-nat-gateway \
  --subnet-id "$SN_PUB_A" \
  --allocation-id "$EIP_A" \
  --connectivity-type public \
  --tag-specifications 'ResourceType=natgateway,Tags=[{Key=Name,Value=shopmini-nat-2a},{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch18},{Key=AutoDelete,Value=true}]' \
  --query 'NatGateway.NatGatewayId' --output text)

aws ec2 wait nat-gateway-available --nat-gateway-ids "$NAT_A"

# 앱 계층 2a 전용 라우팅 테이블
RTB_APP_A=$(aws ec2 create-route-table --vpc-id "$VPC_ID" \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=rtb-shopmini-app-2a},{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch18},{Key=AutoDelete,Value=true}]' \
  --query 'RouteTable.RouteTableId' --output text)

aws ec2 create-route --route-table-id "$RTB_APP_A" \
  --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "$NAT_A"
aws ec2 associate-route-table --route-table-id "$RTB_APP_A" --subnet-id "$SN_APP_A"
```

**같은 절차를 `2c`에도 한 번 더 수행합니다.** `EIP_C` → `NAT_C`(서브넷 `$SN_PUB_C`) → `RTB_APP_C` → `$SN_APP_C`.

> 🔴 **NAT 게이트웨이는 퍼블릭 서브넷에 만들고, 그 사용자는 프라이빗 서브넷이어야 합니다.** 프라이빗 서브넷에 만들면 자기 자신이 나갈 경로가 없어 동작하지 않고, 프라이빗 서브넷 라우팅 테이블에 NAT 경로를 넣지 않으면 인스턴스가 패치를 받지 못합니다.

### 가용성 트레이드오프

> 📖 *AWS Security Cookbook* 5장: **"NAT 게이트웨이는 AWS가 유지 관리하며 AWS가 패치, 가용성, 확장을 책임진다."** / **"NAT 게이트웨이는 어떤 보안 그룹과도 연결되지 않는다."** / **"NAT 게이트웨이는 AZ 내에서는 이중화되어 있지만 AZ를 걸칠 수는 없다. 따라서 더 나은 가용성을 위해서는 리전별로 NAT 게이트웨이를 만들어야 할 수 있다."**
>
> 💡 마지막 문장의 원문 표현은 "리전별"이지만, 바로 앞의 "AZ를 걸칠 수 없다"는 서술과 이어 읽으면 의도는 **AZ별 배치**입니다. 실제 권고 구성도 AZ마다 NAT 게이트웨이 1개입니다.

비용 대 가용성의 선택지는 셋입니다.

| 구성 | 시간당 요금 | 데이터 처리 요금 | 한 AZ 장애 시 | AZ 간 데이터 전송료 |
|---|---|---|---|---|
| NAT GW **1개** (2a에만) | ×1 | ×1 | **전체 아웃바운드 중단** | 2c → 2a 횡단 발생 |
| NAT GW **AZ당 1개** (권장) | ×2 | ×1 | 해당 AZ만 영향 | 없음 |
| NAT GW 없음 (완전 격리) | 0 | 0 | 해당 없음 | 없음 |

NAT 게이트웨이 요금은 **시간당 고정 요금 + 처리한 데이터 GB당 요금**의 두 축입니다. 두 번째 축이 자주 간과되는데, 프라이빗 서브넷에서 S3로 수 TB를 올리는 파이프라인이 있다면 **데이터 처리 요금이 컴퓨트 비용을 넘어서는 경우가 있습니다.** 해결책은 요금 최적화가 아니라 아키텍처입니다 — **S3 게이트웨이 엔드포인트를 붙이면 그 트래픽은 NAT를 아예 거치지 않습니다**(20.1). 비용과 보안이 같은 방향을 가리키는 드문 사례입니다.

> 📖 *AWS Security Cookbook* 5장: **"게이트웨이 엔드포인트: NAT 게이트웨이처럼 프라이빗 IP 주소를 갖지 않는다."** 구성은 20장에서 다룹니다.

세 번째 행 — **NAT 게이트웨이가 아예 없는 구성** — 을 잊지 마십시오. 인터페이스 엔드포인트(20.2)로 필요한 AWS API에만 프라이빗 경로를 열고 OS 패치를 SSM·골든 AMI(22.5)로 해결하면 **아웃바운드 인터넷 경로 자체가 없는 앱 계층**이 가능합니다. 이그레스 필터링(19.6)의 궁극형입니다.

---

## 18.6 NAT 인스턴스 (레거시) 🧪

> 💡 **현재의 기본 선택은 NAT 게이트웨이입니다.** 이 절은 레거시 환경 인수인계, 특수한 요구(예: 인스턴스 수준의 패킷 필터링·포트 포워딩), 그리고 자격증 시험 범위를 위해 남깁니다. 새로 설계하는 시스템에 NAT 인스턴스를 넣을 이유는 사실상 없습니다.
>
> 📖 *AWS Security Cookbook* 5장은 이렇게 못박습니다. **"NAT 게이트웨이는 항상 NAT 인스턴스보다 선호되며, 우리는 NAT 게이트웨이를 사용해야 한다."** 6장에서도 반복합니다. **"NAT 인스턴스를 설정·유지·확장하는 데 드는 노력은 NAT 게이트웨이에 필요한 것보다 많다. 따라서 NAT 인스턴스 대신 NAT 게이트웨이를 사용할 것을 항상 권고한다."**

### 구성의 세 가지 핵심

쿡북 6장 레시피는 세 단계로 요약됩니다.

**① 소스/대상 확인 비활성화 (가장 중요)**

> 📖 *AWS Security Cookbook* 6장 「Setting up and configuring NAT instances」: **"NAT 인스턴스를 만든 뒤 우리는 NAT 인스턴스의 소스/대상 확인을 비활성화했다. 기본적으로 AWS는 EC2 인스턴스가 IP 트래픽의 소스이거나 대상일 것이라고 기대한다. 그러나 NAT 인스턴스는 프라이빗 서브넷과 인터넷 사이에서 요청을 전달하므로 소스이면서 동시에 대상으로 동작한다."**

```bash
# 자기 자신이 출발지도 목적지도 아닌 패킷을 전달하도록 허용
aws ec2 modify-instance-attribute \
  --instance-id i-0abc123def4567890 \
  --no-source-dest-check
```

이 한 줄을 빠뜨리면 **인스턴스도 라우팅도 정상인데 통신만 안 되는** 전형적 증상이 나옵니다. VPC 네트워크 스택이 전달 패킷을 조용히 버리기 때문입니다.

**② 보안 그룹 구성 (NAT 게이트웨이와의 결정적 차이)**

> 📖 같은 절: **"NAT 게이트웨이는 어떤 보안 그룹과도 연결되지 않지만, NAT 인스턴스는 연결된다. 우리 NAT 인스턴스에 대해 우리는 프라이빗 서브넷으로부터의 HTTP, HTTPS, 모든 ICMP - IPv4를 허용하는 인바운드 규칙을 가진 보안 그룹을 만들었다. ICMP 프로토콜은 디버깅을 돕기 위해 추가했다. (…) 아웃바운드 규칙으로는 CIDR 범위를 0.0.0.0/0으로 지정해 인터넷을 향한 HTTP, HTTPS, ICMP를 활성화했다."**
>
> 원서는 여기에 근거를 덧붙입니다. **"보안 그룹의 기본 아웃바운드 규칙은 모든 아웃바운드 트래픽을 허용하며 우리 NAT 인스턴스는 그 규칙 집합으로도 잘 동작한다. 그러나 보안 강화를 위해 우리는 필요한 포트로만 아웃바운드 접근을 제공했다."**

이 "차이"는 사실 **NAT 인스턴스의 유일한 장점**입니다. NAT 게이트웨이에는 보안 그룹을 붙일 수 없어 게이트웨이 자체에서 아웃바운드 목적지를 제한할 수 없지만, NAT 인스턴스에는 아웃바운드 규칙을 걸 수 있습니다. 다만 오늘날 이 요구는 **Network Firewall이나 포워드 프록시**(19.5, 19.6)로 훨씬 잘 해결됩니다.

```bash
SG_NAT=$(aws ec2 create-security-group \
  --group-name shopmini-nat-instance-sg \
  --description "NAT instance - egress from private app tier only" \
  --vpc-id "$VPC_ID" --query 'GroupId' --output text)

# 인바운드: 앱 계층 서브넷에서 오는 HTTP/HTTPS만
aws ec2 authorize-security-group-ingress --group-id "$SG_NAT" \
  --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=10.20.10.0/24},{CidrIp=10.20.11.0/24}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=10.20.10.0/24},{CidrIp=10.20.11.0/24}]'

# 아웃바운드: 기본 전체 허용을 지우고 필요한 포트만
aws ec2 revoke-security-group-egress --group-id "$SG_NAT" \
  --ip-permissions 'IpProtocol=-1,IpRanges=[{CidrIp=0.0.0.0/0}]'
aws ec2 authorize-security-group-egress --group-id "$SG_NAT" \
  --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]'
```

**③ 라우팅 추가 — 대상이 게이트웨이가 아니라 ENI**

NAT 게이트웨이는 `--nat-gateway-id`를 쓰지만, NAT 인스턴스는 **인스턴스의 네트워크 인터페이스**를 대상으로 지정합니다.

```bash
ENI_NAT=$(aws ec2 describe-instances --instance-ids i-0abc123def4567890 \
  --query 'Reservations[0].Instances[0].NetworkInterfaces[0].NetworkInterfaceId' \
  --output text)

aws ec2 create-route --route-table-id "$RTB_APP_A" \
  --destination-cidr-block 0.0.0.0/0 --network-interface-id "$ENI_NAT"
```

### 운영상의 부담

> 📖 *AWS Security Cookbook* 6장: **"NAT 인스턴스는 개별 EC2 인스턴스이므로 우리가 패치, 가용성, 확장을 책임져야 한다. (…) NAT 인스턴스는 많은 EC2 인스턴스가 동시에 사용할 경우 병목을 만들 수 있으며, 수동으로 확장을 개선하는 추가 노력을 들이지 않는 한 그렇다."**

| 항목 | NAT 게이트웨이 | NAT 인스턴스 |
|---|---|---|
| 패치·가용성·확장 | **AWS 책임** | **고객 책임** (22.6) |
| 보안 그룹 | 연결 불가 | 연결 필요 |
| 소스/대상 확인 | 해당 없음 | **반드시 비활성화** |
| 라우팅 대상 | `nat-…` | `eni-…` |
| 대역폭 | 자동 확장 | 인스턴스 타입에 종속 (병목) |
| AZ 장애 | AZ별 배치로 대응 | 인스턴스 장애 = 전면 중단 |
| 공격 표면 | 관리형(고객 OS 없음) | **OS·SSH·취약점 관리 대상** |

마지막 행이 보안 관점에서 가장 큽니다. NAT 인스턴스는 **모든 프라이빗 트래픽이 통과하는 EC2 인스턴스**이므로, 침해되면 앱 계층 전체의 아웃바운드를 관찰·조작할 수 있는 위치를 공격자에게 내줍니다(25장의 취약점 관리 대상도 하나 늘어납니다).

---

## 18.7 IPv6 고려사항 ⚠️

### IPv6에는 NAT가 없다

> 📖 *AWS Security Cookbook* 5장: **"NAT는 현재 IPv6 트래픽을 지원하지 않는다. IPv6 트래픽에는 NAT 대신 이그레스 전용 인터넷 게이트웨이(egress-only internet gateway)를 사용해야 한다."**

이 사실이 만드는 구조적 차이는 큽니다. **IPv4 프라이빗 서브넷의 인스턴스는 애초에 인터넷에서 도달 불가능한 주소(RFC 1918)를 갖습니다.** 반면 **AWS가 할당하는 IPv6 주소는 전부 글로벌 유니캐스트, 즉 잠재적 공인 주소입니다.** VPC에 IPv6 블록을 붙이는 순간 모든 인스턴스가 "인터넷에서 주소로 지목 가능한" 상태가 되고, 도달 가능성을 막는 것은 **주소 체계가 아니라 라우팅과 필터링뿐**이 됩니다.

| 구분 | IPv4 프라이빗 서브넷 | IPv6 서브넷 |
|---|---|---|
| 주소 성격 | 사설 주소 (라우팅 불가) | **글로벌 유니캐스트** (라우팅 가능) |
| 아웃바운드 전용 장치 | NAT 게이트웨이 | **이그레스 전용 IGW (EIGW)** |
| 인바운드 차단 근거 | 주소 체계 + NAT + SG | **SG/NACL 규칙만** |
| EIGW 요금 | (NAT GW는 유료) | 게이트웨이 자체는 무료 |

```bash
# VPC에 Amazon 제공 IPv6 블록(/56) 연결
aws ec2 associate-vpc-cidr-block \
  --vpc-id "$VPC_ID" --amazon-provided-ipv6-cidr-block

# 이그레스 전용 인터넷 게이트웨이 생성
EIGW_ID=$(aws ec2 create-egress-only-internet-gateway --vpc-id "$VPC_ID" \
  --tag-specifications 'ResourceType=egress-only-internet-gateway,Tags=[{Key=Name,Value=shopmini-eigw},{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch18},{Key=AutoDelete,Value=true}]' \
  --query 'EgressOnlyInternetGateway.EgressOnlyInternetGatewayId' --output text)

# 앱 계층 라우팅 테이블에 IPv6 아웃바운드 경로
aws ec2 create-route --route-table-id "$RTB_APP_A" \
  --destination-ipv6-cidr-block ::/0 --egress-only-internet-gateway-id "$EIGW_ID"
```

> 🔴 **격리 계층에는 IPv6 블록 자체를 할당하지 마십시오.** ShopMini의 `isolated-data` 서브넷에 IPv6를 붙일 이유는 없습니다. 필요 없는 주소 체계를 부여하지 않는 것이 가장 확실한 통제입니다.

### ⚠️ 사고: IPv4만 막고 IPv6은 열려 있었다

**사고 시나리오.**
ShopMini의 관리용 인스턴스 보안 그룹에서 SSH(22)를 `0.0.0.0/0`으로 열어 둔 것이 감사에서 지적되었습니다. 담당자는 규칙을 삭제하고 사내 IP 대역만 남긴 뒤 스크린샷과 함께 조치 완료로 보고했습니다. 3주 뒤 이 인스턴스에서 무차별 대입 로그인 시도가 대량으로 발견됩니다.

**원인.**
보안 그룹 규칙은 **IPv4 규칙과 IPv6 규칙이 별개의 항목**입니다. 이 보안 그룹에는 오래전 IPv6 테스트 때 추가된 `::/0` → 22번 규칙이 남아 있었고, 담당자가 지운 것은 `0.0.0.0/0` 항목뿐이었습니다. 인스턴스는 IPv6 주소를 갖고 있었고 서브넷 라우팅에 `::/0 → igw`가 있었으므로 IPv6 경로는 그대로 살아 있었습니다.

> 📖 *Practical Cloud Security* 2판 6장 「IPv6」: **"실용적 관점에서 IPv6과 관련해 가장 중요한 것은, 시스템이 IPv6 주소를 갖고 있다면 IPv6 허용 목록을 유지 관리하는 것이다. 많은 최종 사용자가 IPv6에 대해 모르더라도, 공격자는 그것을 이용해 여러분의 IPv4 통제를 우회할 수 있다."**

**올바른 구성.**

1. **IPv6가 필요 없으면 부여하지 않는다.** 가장 확실한 방법입니다. 서브넷에 IPv6 CIDR을 할당하지 않고, 인스턴스에 IPv6 주소를 붙이지 않습니다.
2. **필요하다면 모든 SG/NACL 규칙을 IPv4·IPv6 쌍으로 관리한다.** IaC(28장)에서 두 규칙을 같은 모듈 안에 묶어 **하나만 지우는 것이 구조적으로 불가능**하게 만듭니다.
3. **점검 시 `Ipv6Ranges`를 반드시 함께 조회한다.**

```bash
# 22번 포트를 IPv4/IPv6 어느 쪽으로든 전체 개방한 보안 그룹 찾기
aws ec2 describe-security-groups \
  --query "SecurityGroups[?IpPermissions[?FromPort==\`22\` && (IpRanges[?CidrIp=='0.0.0.0/0'] || Ipv6Ranges[?CidrIpv6=='::/0'])]].[GroupId,GroupName]" \
  --output table
```

4. **라우팅 테이블 점검에도 `::/0`을 포함한다.** 18.4의 점검 스크립트가 `DestinationIpv6CidrBlock`을 함께 보는 이유입니다. AWS Config의 `no-unrestricted-route-to-igw`도 `::/0`을 검사 대상에 포함합니다.

> ⚠️ **"IPv4만 확인하는 점검"은 점검이 아닙니다.** 19장의 보안 그룹 리뷰, 26.6의 CSPM 규칙, 30.3의 보안 그룹 변경 알람 — 이 셋 모두에서 IPv6 축을 함께 보고 있는지 확인하십시오.

---

## 18.8 DMZ와 프록시 패턴의 클라우드 재해석

### DMZ는 사라지지 않고 옮겨갔다

> 📖 *Practical Cloud Security* 2판 6장 「DMZs」: **"DMZ는 전통적인 네트워크 통제에서 온 개념이지만 많은 클라우드 환경에도 잘 옮겨진다. 그것은 단순히 여러분의 애플리케이션 앞쪽에 있는, 가장 덜 신뢰되는 트래픽(예: 방문자 트래픽)을 들여보내는 영역이다. 대부분의 경우 프록시, 로드 밸런서, 정적 콘텐츠 웹 서버처럼 더 단순하고 덜 신뢰되는 구성 요소를 DMZ에 배치하게 된다. 이 구성 요소 중 하나가 침해되더라도 공격자에게 큰 이점을 주어서는 안 된다."**
>
> 2판에서 추가된 문장이 핵심입니다. **"여러분의 내부 구성 요소는 일반적으로 DMZ에서 오는 연결 외에는 어떤 연결도 허용하지 않겠지만, 그럼에도 DMZ에서 오는 연결을 인증해야 한다."**
>
> 그리고 저자는 유보 조건도 답니다. **"별도의 DMZ 영역이 어떤 클라우드 환경에서는 말이 되지 않을 수도 있고, 서비스 모델의 일부로 이미 제공되고 있을 수도 있다(특히 PaaS 환경에서)."**

전통 DMZ와 클라우드 퍼블릭 서브넷의 대응은 이렇습니다.

| 전통 DMZ | 클라우드 재해석 | ShopMini에서 |
|---|---|---|
| 물리 방화벽 두 대 사이의 세그먼트 | **퍼블릭 서브넷 + 라우팅 테이블 + SG** | `10.20.0.0/24`, `10.20.1.0/24` |
| DMZ에 놓는 리버스 프록시·웹 서버 | 관리형 로드 밸런서·CDN | CloudFront, ALB |
| "DMZ 안이니 내부는 신뢰" | **DMZ에서 오는 연결도 인증** | ALB → 앱 8443 **mTLS/TLS + 앱 인증** |
| 애플리케이션들이 DMZ를 공유 | **애플리케이션마다 별도 경계** | ShopMini 전용 VPC |
| DMZ 신설에 수 주 소요 | API 호출 한 번 | `create-subnet` |

세 번째 행이 제로 트러스트(1.3)와 만나는 지점입니다. **"ALB를 거쳐 왔으니 정상 요청"은 성립하지 않습니다.** ALB가 침해되거나 우회되면(23.9) 그 가정은 무너집니다.

ShopMini에서는 DMZ가 실제로 줄기도 했습니다. `shopmini-assets` 버킷을 CloudFront가 OAC로 직접 읽으므로(23.7) **정적 콘텐츠 서버가 아예 없습니다.** 원서가 말한 **"서비스 모델의 일부로 이미 제공되고 있을 수도 있다"** 가 이 경우이고, DMZ에서 관리하던 자산이 줄어든 만큼 공격 표면도 줄었습니다.

### 프록시: 방향이 통제를 정의한다

> 📖 *Practical Cloud Security* 2판 6장 「Proxies」: **"프록시는 요청을 받아 그것을 다른 구성 요소에 보내 처리하게 한 뒤, 응답을 원래 요청자에게 돌려주는 구성 요소다."** 두 모델을 이렇게 나눕니다. **"포워드 프록시 — 프록시가 여러분의 구성 요소로부터 요청을 받아 그들을 대신해 아웃바운드 요청을 만든다. 리버스 프록시 — 프록시가 사용자로부터 요청을 받아 그 요청을 백엔드 서버로 중계한다."**
>
> 보안 효과는 방향에 따라 다릅니다. **"포워드 프록시는 네트워크 밖으로 어떤 트래픽이 나갈 수 있는지에 규칙을 걸기 위해 가장 흔히 사용된다."** / **"리버스 프록시는 프로토콜 자체나 특정 구현에 취약점이 있을 때 보안을 개선할 수 있다. 그 경우 프록시가 침해될 수는 있지만, 대개 실제 백엔드 서버보다는 공격자에게 네트워크나 중요 자원에 대한 접근을 덜 준다."**

| 방향 | 목적 | ShopMini의 구현 | 다루는 장 |
|---|---|---|---|
| **리버스 프록시** (인바운드) | 백엔드 노출 축소, 프로토콜 취약점 흡수, 단일 호스트 외관 | CloudFront + ALB (+ WAF) | 23장 |
| **포워드 프록시** (아웃바운드) | **나가는 트래픽에 규칙 부여** — 데이터 유출·C2 차단 | Network Firewall 도메인 필터링 / 프록시 인스턴스 | 19.5, 19.6 |

중요한 것은 **포워드 프록시와 NAT 게이트웨이가 같은 자리에 있지만 하는 일이 다르다**는 점입니다. NAT 게이트웨이는 주소를 바꿔 줄 뿐 **목적지를 판단하지 않습니다.** 침해된 앱 인스턴스가 공격자 서버로 데이터를 보내면 성실하게 전달합니다. 목적지를 판단하려면 포워드 프록시나 Network Firewall이 필요하고, 그것이 19.6의 주제입니다.

> 📖 *Practical Cloud Security* 2판 6장은 이렇게 정리합니다. **"프록시는 이그레스 통제를 구현하는 가장 효과적인 방법이다."**

> 💡 **원서 이후 변경 — "프록시" 자체가 서비스가 되었습니다.** 원서 집필 시점에는 포워드 프록시를 직접 운영하는 것이 일반적이었지만, 현재 AWS에서는 Network Firewall(도메인·SNI 기반 필터링), Route 53 Resolver DNS Firewall(DNS 계층 차단, 20.5), 인터페이스 엔드포인트 정책(20.3)이 같은 목적을 관리형으로 제공합니다. 원서의 NFV 권고 — **"가능한 경우, 자체 서비스를 유지 관리하기보다 서비스형 기능을 사용해야 한다"** — 를 그대로 따르면 됩니다.

### 남은 절반은 19장과 20장으로

이 장에서 세운 것은 **경로의 유무**입니다. 그러나 **경로가 있다 ≠ 통신이 허용된다** 입니다. `local` 경로 덕분에 VPC 안의 모든 서브넷은 서로 도달 가능하고, 앱 서브넷과 데이터 서브넷을 실제로 갈라놓는 것은 라우팅이 아니라 **보안 그룹과 NACL**입니다. 앱 계층이 S3와 통신하는 방식을 인터넷 경유에서 프라이빗 경로로 바꾸는 것은 **VPC 엔드포인트**입니다. 각각 19장과 20장의 주제입니다.

---

## 이 장의 요약

| 항목 | 핵심 |
|---|---|
| VPC의 실체 | 원서 표현대로 "이름과 달리 네트워크 격리만 다룬다". 경계는 인증을 대체하지 않는다 |
| CIDR | 조직 전체 계획 → 리전 → 환경 → 계정 순으로 배분. **축소 불가, 추가만 가능** |
| 예약 IP | 서브넷마다 5개 예약(`.0` `.1` `.2` `.3` + 브로드캐스트). `/24` = 251개 사용 가능 |
| 서브넷 티어링 | Public / Private-App / Isolated-Data × 2 AZ = 6개. 기준은 **인터넷과의 관계** |
| 라우팅 테이블 | "퍼블릭"은 속성이 아니라 `0.0.0.0/0 → igw` 경로의 존재. 가장 구체적인 경로 우선 |
| 메인 라우팅 테이블 | **인터넷 경로를 절대 넣지 않는다.** 미래의 모든 미연결 서브넷에 영향 |
| NAT 게이트웨이 | SNAT만 수행(DNAT 없음) → 아웃바운드 전용. **AZ당 1개.** 시간당 + 데이터 처리 요금 |
| NAT 인스턴스 | 레거시. 소스/대상 확인 비활성화 필수, 보안 그룹 필요, 라우팅 대상은 ENI |
| IPv6 | NAT 없음 → 이그레스 전용 IGW. 모든 주소가 잠재적 공인. **SG 규칙 이중 관리 필수** |
| DMZ·프록시 | 퍼블릭 서브넷 = DMZ. 리버스 프록시는 23장, 포워드 프록시(이그레스 통제)는 19.6 |

## 🔴 필수 구성 체크리스트

- [ ] VPC CIDR이 **조직 전체 IP 계획 문서**에 근거해 배정되었다
- [ ] 온프레미스·기존 VPC·피어 대상과 **CIDR이 겹치지 않음**을 확인했다
- [ ] 향후 계정·리전 확장을 위한 **상위 대역이 예약**되어 있다
- [ ] 서브넷 크기 산정에 **AWS 예약 5개 IP**와 ENI 소비량(파드·엔드포인트·LB)이 반영되었다
- [ ] 서브넷이 **최소 2개 AZ**에 계층별로 배치되었다
- [ ] Public / Private-App / Isolated-Data **3계층이 분리**되어 있다
- [ ] **메인 라우팅 테이블에 `0.0.0.0/0` 인터넷 경로가 없다**
- [ ] 모든 서브넷이 라우팅 테이블에 **명시적으로 연결**되어 있다 (암묵 연결 없음)
- [ ] Isolated-Data 라우팅 테이블에 **IGW·NAT 경로가 아예 없다**
- [ ] Private-App 라우팅 테이블이 **AZ별로 분리**되어 있다
- [ ] NAT 게이트웨이가 **AZ당 1개**이며 퍼블릭 서브넷에 있다
- [ ] 서브넷의 **퍼블릭 IP 자동 할당이 비활성**이다 (필요한 곳만 예외)
- [ ] IPv6를 쓴다면 **모든 SG/NACL 규칙이 IPv4·IPv6 쌍**으로 존재한다
- [ ] IPv6가 필요 없는 계층에는 **IPv6 CIDR을 할당하지 않았다**
- [ ] AWS Config `no-unrestricted-route-to-igw` · `subnet-auto-assign-public-ip-disabled` 규칙이 켜져 있다
- [ ] 라우팅 테이블 점검 스크립트가 **정기 실행**되고 예외 목록이 리뷰된다
- [ ] S3 게이트웨이 엔드포인트로 NAT 데이터 처리량을 우회한다 (20.1)
- [ ] 모든 VPC 리소스에 `Project` / `Chapter` / `AutoDelete` 태그가 붙어 있다

## ⚠️ 자주 하는 실수

| 실수 | 결과 | 올바른 구성 |
|---|---|---|
| VPC마다 그때그때 CIDR을 고른다 | 몇 년 뒤 피어링·VPN 연결 시점에 겹침 발견, 재구축 외 방법 없음 | 조직 IP 계획 선행 (18.2) |
| VPC CIDR을 작게(`/24`) 잡는다 | 축소는 안 되고 확장은 보조 블록·양쪽 라우팅 수정 필요 | `/16` 기본, 상위 대역 예약 (18.2) |
| 서브넷 IP를 인스턴스 수로만 산정 | 파드·엔드포인트·LB ENI가 IP를 먹어 스케일아웃 실패 | 예상치 2배 + 예약 5개 반영 (18.2) |
| 계층을 나누지 않고 서브넷 하나로 운영 | DB가 앱과 같은 신뢰 구역 — 앱 침해가 곧 DB 도달 | 3계층 티어링 (18.3) |
| 단일 AZ에만 서브넷을 만든다 | AZ 장애 시 전면 중단, RDS Multi-AZ도 구성 불가 | 최소 2개 AZ (18.3) |
| **메인 라우팅 테이블에 IGW 경로를 넣는다** | 미연결 신규 서브넷이 **전부 자동으로 퍼블릭** | 퍼블릭 전용 테이블 분리 (18.4) |
| 서브넷 이름으로 퍼블릭/프라이빗을 판단한다 | 이름은 `-private`인데 라우팅은 퍼블릭 — 두 달 뒤 GuardDuty로 발견 | 라우팅 기준 점검 스크립트 (18.4) |
| 프라이빗 인스턴스에 EIP를 임시로 붙이고 안 뗀다 | 서브넷 라우팅과 결합해 완전한 양방향 노출 | EIP 부착 알람 + Config 규칙 (18.4) |
| 앱 계층 2개 AZ가 라우팅 테이블 하나를 공유 | 한쪽 NAT GW 장애로 **양쪽 AZ 아웃바운드 동시 중단** | AZ별 라우팅 테이블 (18.3, 18.5) |
| 비용 절감으로 NAT GW를 1개만 둔다 | AZ 장애 시 전면 중단 + AZ 간 데이터 전송료 발생 | AZ당 1개, 또는 NAT 자체를 제거 (18.5) |
| NAT 데이터 처리 요금을 방치한다 | S3 대용량 전송이 NAT를 거쳐 컴퓨트보다 비싼 청구서 | S3 게이트웨이 엔드포인트 (20.1) |
| NAT 게이트웨이에 보안 그룹을 붙이려 한다 | 붙지 않음 — 이그레스 목적지 통제라고 착각 | Network Firewall / 프록시 (19.5, 19.6) |
| 신규 설계에 NAT 인스턴스를 쓴다 | 패치·확장·병목·침해 표면을 모두 떠안음 | NAT 게이트웨이 (18.6) |
| NAT 인스턴스의 소스/대상 확인을 켜 둔다 | 라우팅·SG 모두 정상인데 통신만 안 됨 (원인 추적 난항) | `--no-source-dest-check` (18.6) |
| IPv4 규칙만 지우고 조치 완료로 보고한다 | `::/0` 규칙이 남아 IPv4 통제를 우회당함 | IPv4·IPv6 쌍 관리 + `Ipv6Ranges` 조회 (18.7) |
| 필요 없는 계층에 IPv6 CIDR을 붙인다 | 모든 인스턴스가 잠재적 공인 주소 보유 | 필요한 계층에만 할당 (18.7) |
| "ALB를 거쳤으니 신뢰"로 앱 인증을 생략한다 | 오리진 직접 접근·프록시 우회 시 무방비 | DMZ발 연결도 인증 (18.8, 23.9) |
| 여러 애플리케이션이 하나의 VPC·DMZ를 공유 | 덜 중요한 앱 침해가 중요한 앱으로 가는 발판 | 애플리케이션별 경계 (18.1, 18.8) |

## 다음 장 예고

이 장에서 만든 것은 **경로의 지도**입니다. 어디로 갈 수 있고 어디로는 갈 수 없는지가 라우팅 테이블에 새겨졌습니다.

19장은 그 지도 위에 **문지기**를 세웁니다. 상태 저장인 보안 그룹과 상태 비저장인 NACL이 어떻게 다른지, ALB SG → App SG → DB SG로 이어지는 **보안 그룹 참조 체인**이 왜 CIDR 나열보다 우월한지, 그리고 대부분의 조직이 통째로 빠뜨리는 통제인 **이그레스 필터링**을 다룹니다. 18.5에서 "NAT 게이트웨이는 목적지를 판단하지 않는다"고 남겨 둔 문제의 답이 거기 있습니다.
