# 19장. 트래픽 통제: 보안 그룹, NACL, 방화벽

> **이 장에서 다루는 것**
> - **보안 그룹(상태 저장) vs NACL(상태 비저장)** 🔴 — 패킷 흐름으로 보는 차이, 규칙 평가 방식, 적용 범위, 기본값 비교
> - **보안 그룹 참조 체인** 🧪 🔴 — `alb-sg` → `app-sg`(8443) → `db-sg`(3306). CIDR 대신 SG 참조를 쓰는 이유
> - **절대 하면 안 되는 규칙** ⚠️ — `0.0.0.0/0`의 22/3389, 전 포트 개방, 기본 SG 방치, 아웃바운드 전체 허용, `::/0` 누락
> - **NACL의 임시 포트 함정** 🧪 — 상태 비저장이 만드는 "규칙은 맞는데 안 되는" 현상. NACL을 언제 써야 하는가
> - **AWS Network Firewall** — 상태 저장 검사, Suricata 규칙, 도메인 필터링, 방화벽 서브넷 배치
> - **이그레스 필터링** 🔴 — 데이터 유출과 C2 통신 차단. 대부분의 조직이 비어 있는 칸
> - **마이크로세그멘테이션과 제로 트러스트 네트워킹** — 네트워크 통제만으로는 부족한 이유
>
> **선행 지식**: 18장(VPC 설계·서브넷 티어링·NAT), 7장(IAM 정책), 12장(데이터 분류)
> **난이도**: ★★☆

---

18장에서 ShopMini의 VPC 골격을 만들었습니다. `10.20.0.0/16` 안에 퍼블릭·프라이빗앱·격리데이터 3계층 서브넷이 있고, 라우팅 테이블이 어느 서브넷이 인터넷으로 나가는지 결정합니다.

하지만 라우팅은 **경로**를 정할 뿐 **허가**를 정하지 않습니다. 프라이빗앱 서브넷에서 격리데이터 서브넷의 RDS로 가는 경로는 `local` 라우트로 이미 열려 있습니다. 그 경로 위에서 "8443만, ALB에서만, 나머지는 전부 거부"를 강제하는 것이 이 장의 주제입니다.

*Practical Cloud Security*는 이 통제를 방화벽의 두 용도로 나눕니다.

> 📖 *Practical Cloud Security* 2판 6장 「Firewalls and Network Segmentation」: **"방화벽은 보통 두 가지 주요 목적으로 쓰인다. 시스템을 외부 세계와 분리하는 경계 통제(perimeter control), 그리고 시스템 집합끼리 서로 분리해 두는 내부 세그멘테이션(internal segmentation)이다. (…) 인터넷에서는 언제나 누군가 당신을 공격하고 있으므로 경계에서 오는 알림은 매우 시끄럽다. 내부 세그멘테이션 방화벽에서 거부된 연결 시도는 공격자가 측면 이동을 시도하고 있거나 설정 오류이거나 둘 중 하나다. 어느 쪽이든 조사해야 한다."**

이 장 전체를 관통하는 판단 기준입니다. **경계에서의 거부는 잡음이고, 내부에서의 거부는 신호입니다.**

---

## 19.1 보안 그룹(상태 저장) vs NACL(상태 비저장) 🔴

AWS는 같은 VPC 안에서 두 종류의 IP 허용목록 통제를 제공합니다. 둘은 대체재가 아니라 **서로 다른 계층에 붙는 서로 다른 물건**이고, 원서는 건물 비유로 구분합니다.

> 📖 *Practical Cloud Security* 2판 6장: NACL에 대해 **"자체 방화벽 어플라이언스를 운영하는 대신, 각 네트워크에 무엇이 들어오고 나갈 수 있는지 규칙만 정의하면 된다. 이것을 '거친 절단(rough cut)', 또는 사람들을 건물 안으로 들여보내는 경비원이라고 생각하라."** 보안 그룹에 대해서는 **"보안 그룹의 좋은 점 하나는 그룹의 구성원을 소스나 대상으로 쓸 수 있다는 것이다. (…) 이것을 '섬세한 절단(fine cut)', 또는 건물 안 특정 방에 특정 개인만 들여보내는 배지 리더라고 생각하라."**

### 상태 저장과 상태 비저장, 패킷으로 보기

패킷 하나를 따라가면 명확합니다. 앱 인스턴스(`10.20.10.15`)가 RDS(`10.20.20.30:3306`)로 쿼리를 보내고, 클라이언트 소스 포트는 임시 포트 `49152`로 잡혔다고 하겠습니다.

```
[보안 그룹 — 상태 저장(Stateful)]

  요청  10.20.10.15:49152 ──▶ 10.20.20.30:3306
        │
        ├─ app-sg  아웃바운드 평가: "3306 → db-sg 허용"  → 통과
        └─ db-sg   인바운드   평가: "3306 ← app-sg 허용"  → 통과
                              연결 상태를 추적 테이블에 기록 ★

  응답  10.20.20.30:3306 ──▶ 10.20.10.15:49152
        │
        ├─ db-sg   아웃바운드 평가: 건너뜀 — 추적된 연결의 응답  → 통과
        └─ app-sg  인바운드   평가: 건너뜀 — 추적된 연결의 응답  → 통과
                              → 응답용 규칙을 쓸 필요가 없다


[NACL — 상태 비저장(Stateless)]

  요청  10.20.10.15:49152 ──▶ 10.20.20.30:3306
        │
        ├─ private-app NACL 아웃바운드: "3306 → 10.20.20.0/23 허용"  → 통과
        └─ isolated-data NACL 인바운드: "3306 ← 10.20.10.0/23 허용"  → 통과
                              상태를 기억하지 않음 ★

  응답  10.20.20.30:3306 ──▶ 10.20.10.15:49152
        │
        ├─ isolated-data NACL 아웃바운드: "1024-65535 → 10.20.10.0/23 허용" 필요 ⚠️
        └─ private-app  NACL 인바운드  : "1024-65535 ← 10.20.20.0/23 허용" 필요 ⚠️
                              → 응답용 규칙이 없으면 여기서 조용히 끊긴다
```

Cookbook은 이 차이를 실습으로 직접 확인시킵니다.

> 📖 *AWS Security Cookbook* 6장 「Creating and configuring security groups」: **"5장의 NACL 다루기 레시피에서 우리는 아웃바운드 요청을 위해 임시 포트 범위 1024–65535를 명시적으로 허용했다. 보안 그룹은 상태 저장이므로 이것이 필요하지 않다. 아웃바운드 포트가 열려 있으면 그 포트로 나간 요청의 응답도 인바운드 규칙과 무관하게 허용된다. 인바운드 포트도 마찬가지다."**

★ 표시한 "연결 상태 추적"이 두 통제의 실무적 차이를 전부 만듭니다.

### 규칙 평가 방식의 차이

| 구분 | 보안 그룹 | NACL |
|---|---|---|
| 규칙 종류 | **Allow만** 존재 (Deny 규칙 불가) | Allow와 **Deny 둘 다** |
| 평가 순서 | 순서 없음. **모든 규칙의 합집합** | **규칙 번호 오름차순**, 첫 일치에서 종료 |
| 기본 동작 | 일치하는 Allow가 없으면 거부 | 모든 규칙 불일치 시 `*` 규칙(DENY) |
| 특정 IP 차단 | **불가능** | **가능** |
| 규칙 하나 추가 효과 | 허용 범위가 **넓어지기만** 함 | 위치에 따라 넓어지거나 좁아짐 |

여기서 붙잡아야 할 함의가 있습니다. **보안 그룹에는 "이 IP만 막기"가 없습니다.** 규칙이 Allow의 합집합이므로 무엇을 추가해도 허용이 늘어날 뿐입니다. 특정 소스를 차단하려면 NACL이나 그 위 계층(Network Firewall, WAF)으로 올라가야 합니다.

> 📖 *AWS Security Cookbook* 5장 「Working with NACLs」: **"NACL은 번호가 매겨진 규칙 집합을 담고, 규칙 번호 순서대로 평가된다. 같은 포트에 대해 Allow 규칙이 Deny 규칙보다 앞에 있으면 허용되고, 반대면 거부된다. AWS는 처음에 100의 배수로 규칙 번호를 쓰기를 권장하는데, 그래야 나중에 사이에 새 규칙을 넣을 수 있기 때문이다."** 또한 **"NACL로는 특정 IP 주소를 차단할 수 있지만, 보안 그룹으로는 불가능하다"**, **"NACL은 보안 그룹보다 먼저 평가된다"**고 명시합니다.

### 적용 범위와 기본값

| 항목 | 보안 그룹 | NACL |
|---|---|---|
| 적용 대상 | **ENI**(네트워크 인터페이스) 단위 | **서브넷** 단위 |
| 연결 관계 | ENI 1개에 SG 여러 개(합집합) | 서브넷 1개에 NACL **정확히 1개** |
| 재사용 | 하나의 SG를 여러 ENI에 | 하나의 NACL을 여러 서브넷에 |
| VPC 경계 | VPC를 넘지 못함 | VPC를 넘지 못함 |
| 기본 SG/NACL의 초기 상태 | 인바운드: 같은 SG 소속만 허용<br>아웃바운드: 전체 허용 | 인바운드·아웃바운드 **전체 허용** |
| 새로 만들었을 때 | 인바운드 없음(전부 거부)<br>아웃바운드 전체 허용 | 인바운드·아웃바운드 **전체 거부** |
| 소스/대상에 SG 참조 | **가능** | 불가능(CIDR만) |
| 로깅 | 규칙 단위 로그 없음 → VPC 플로우 로그로 확인 | 동일. 플로우 로그의 거부 레코드로 확인 |

실무 사고가 가장 많이 나는 칸은 **"새로 만들었을 때"** 행입니다. 새 보안 그룹은 안전한 쪽(인바운드 전부 거부)으로 시작하지만, 새 NACL은 **양방향 전부 거부**라 붙이는 순간 서브넷이 통째로 죽습니다. 반대로 기본 NACL은 **양방향 전부 허용**이라 아무 통제도 하지 않습니다.

> 📖 *AWS Security Cookbook* 5장: **"VPC를 만들면 AWS가 기본 NACL을 생성한다. 기본 NACL은 모든 인바운드·아웃바운드 트래픽을 허용한다. 그러나 새 커스텀 NACL을 만들면 모든 인바운드·아웃바운드 트래픽이 기본적으로 거부된다."**

### 🔴 반드시 이렇게 하라

1. **주 통제는 보안 그룹으로 세운다.** 티어 간 허용은 전부 SG 참조 체인(19.2)으로 표현합니다. NACL은 SG를 대체하지 않습니다.
2. **NACL은 "거친 절단"으로만 쓴다.** 서브넷 전체에 걸리는 광역 규칙 — 데이터 서브넷의 인터넷 대역 차단, 침해 시 긴급 격리 — 에만 씁니다(19.4).
3. **기본 SG와 기본 NACL을 그대로 두지 않는다.** 기본 SG는 규칙을 비우고(19.3), 기본 NACL을 그대로 쓸 거라면 "의도적으로 전체 허용을 선택했다"는 결정이 문서로 남아야 합니다.
4. **두 계층 모두 VPC 플로우 로그로 관측 가능하게 만든다.** 규칙 자체는 로그를 남기지 않습니다. 거부된 내부 연결이 보이지 않으면 "내부 거부는 조사 대상"이라는 원칙을 실행할 수 없습니다(29장).

---

## 19.2 보안 그룹 설계 패턴 🧪 🔴

### CIDR을 쓰지 말고 SG를 참조하라

앱 티어가 두 AZ에 걸쳐 오토스케일링된다고 합시다. DB의 인바운드 규칙을 CIDR로 쓰면 `10.20.10.0/24`와 `10.20.11.0/24` 두 줄이 되는데, 이 방식은 세 가지가 깨집니다.

1. **과다 허용**: 프라이빗앱 서브넷에 앱 인스턴스만 있으리라는 보장이 없습니다. 나중에 배치 작업용 인스턴스가 같은 서브넷에 들어오면 그것도 자동으로 3306에 접근하게 됩니다. **아무도 규칙을 바꾸지 않았는데 허용 범위가 넓어집니다.**
2. **오탈자**: `10.20.10.0/24`를 `10.20.10.0/16`으로 잘못 쓰면 VPC 전체가 DB에 붙습니다. 리뷰어가 알아채기 어려운 한 글자입니다.
3. **확장 시 수동 작업**: AZ를 하나 늘리면 그 CIDR을 참조하는 모든 SG 규칙을 찾아 고쳐야 합니다.

SG 참조는 셋을 한 번에 해결합니다. 원서 두 권이 같은 이유를 댑니다.

> 📖 *AWS Security Cookbook* 6장: **"CIDR 범위를 주는 대신 규칙에 다른 보안 그룹을 지정해서, 그 보안 그룹을 가진 인스턴스만 허용한다고 말할 수도 있다. 자기 자신의 보안 그룹을 지정해서 같은 보안 그룹 안의 인스턴스끼리만 통신하도록 할 수도 있다."**

> 📖 *Practical Cloud Security* 2판 6장: **"그룹에 새 구성원을 추가할 때 규칙을 바꿀 필요가 없다."**

즉 **허가의 단위를 IP가 아니라 역할(role)로 바꾸는 것**입니다. "10.20.10.0/24에서 오는 트래픽"이 아니라 "앱 역할을 부여받은 워크로드에서 오는 트래픽"이고, 이 발상은 19.7의 마이크로세그멘테이션으로 이어집니다.

### 🧪 ShopMini 참조 체인 구성

3-tier 구조를 그대로 CLI로 만듭니다. 프로파일은 `awssec-lab`, 리전은 `ap-northeast-2`입니다.

```bash
export AWS_PROFILE=awssec-lab
export AWS_DEFAULT_REGION=ap-northeast-2
VPC_ID=$(aws ec2 describe-vpcs \
  --filters Name=tag:Name,Values=shopmini-prod \
  --query 'Vpcs[0].VpcId' --output text)

TAGS='ResourceType=security-group,Tags=[{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch19},{Key=AutoDelete,Value=true}]'

# 1) 세 개의 껍데기를 먼저 만든다 (규칙 없이)
SG_ALB=$(aws ec2 create-security-group \
  --group-name shopmini-prod-alb-sg \
  --description "ShopMini prod: public ALB, HTTPS ingress from CloudFront only" \
  --vpc-id "$VPC_ID" --tag-specifications "$TAGS" \
  --query GroupId --output text)

SG_APP=$(aws ec2 create-security-group \
  --group-name shopmini-prod-app-sg \
  --description "ShopMini prod: application tier, 8443 from ALB only" \
  --vpc-id "$VPC_ID" --tag-specifications "$TAGS" \
  --query GroupId --output text)

SG_DB=$(aws ec2 create-security-group \
  --group-name shopmini-prod-db-sg \
  --description "ShopMini prod: RDS MySQL, 3306 from app tier only" \
  --vpc-id "$VPC_ID" --tag-specifications "$TAGS" \
  --query GroupId --output text)
```

순서가 중요합니다. **SG를 먼저 전부 만들고, 그다음 규칙을 건다.** 서로를 참조하므로 하나씩 완성하려 하면 순환 참조에 걸립니다.

```bash
# 2) ALB 인바운드: CloudFront 오리진 대역만 443 허용
#    AWS 관리형 접두사 목록을 쓴다 (직접 IP 목록을 관리하지 않는다)
PL_CF=$(aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' --output text)

aws ec2 authorize-security-group-ingress --group-id "$SG_ALB" \
  --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,PrefixListIds=[{PrefixListId=$PL_CF,Description='CloudFront origin-facing only'}]"

# 3) 앱 인바운드: ALB SG에서만 8443
aws ec2 authorize-security-group-ingress --group-id "$SG_APP" \
  --ip-permissions "IpProtocol=tcp,FromPort=8443,ToPort=8443,UserIdGroupPairs=[{GroupId=$SG_ALB,Description='from ALB tier'}]"

# 4) DB 인바운드: 앱 SG에서만 3306
aws ec2 authorize-security-group-ingress --group-id "$SG_DB" \
  --ip-permissions "IpProtocol=tcp,FromPort=3306,ToPort=3306,UserIdGroupPairs=[{GroupId=$SG_APP,Description='from app tier'}]"
```

여기까지가 인바운드입니다. 이제 **기본 아웃바운드 전체 허용을 걷어내고** 필요한 것만 되돌립니다. 이 단계를 건너뛰는 것이 19.6의 가장 흔한 누락입니다.

```bash
# 5) 세 SG 모두에서 기본 아웃바운드(0.0.0.0/0 전체 허용)를 제거
for SG in "$SG_ALB" "$SG_APP" "$SG_DB"; do
  aws ec2 revoke-security-group-egress --group-id "$SG" \
    --ip-permissions 'IpProtocol=-1,IpRanges=[{CidrIp=0.0.0.0/0}]'
done

# 6) 필요한 아웃바운드만 명시
#    ALB → 앱(8443)
aws ec2 authorize-security-group-egress --group-id "$SG_ALB" \
  --ip-permissions "IpProtocol=tcp,FromPort=8443,ToPort=8443,UserIdGroupPairs=[{GroupId=$SG_APP,Description='to app tier'}]"

#    앱 → DB(3306)
aws ec2 authorize-security-group-egress --group-id "$SG_APP" \
  --ip-permissions "IpProtocol=tcp,FromPort=3306,ToPort=3306,UserIdGroupPairs=[{GroupId=$SG_DB,Description='to RDS MySQL'}]"

#    앱 → S3/기타 AWS API (VPC 엔드포인트 경유, 20장)
PL_S3=$(aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.ap-northeast-2.s3 \
  --query 'PrefixLists[0].PrefixListId' --output text)

aws ec2 authorize-security-group-egress --group-id "$SG_APP" \
  --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,PrefixListIds=[{PrefixListId=$PL_S3,Description='S3 gateway endpoint'}]"

#    DB의 아웃바운드는 아무것도 열지 않는다 (5단계 이후 비어 있는 상태를 유지)
```

**DB 보안 그룹의 아웃바운드는 비어 있어야 합니다.** RDS는 스스로 인터넷에 나갈 이유가 없고, 상태 저장이므로 앱 쿼리에 대한 응답은 아웃바운드 규칙 없이도 나갑니다. 아웃바운드가 열린 DB SG는 침해 시 데이터를 빼내는 통로가 됩니다.

결과 확인:

```bash
aws ec2 describe-security-group-rules \
  --filters Name=group-id,Values="$SG_APP" \
  --query 'SecurityGroupRules[].{Dir:IsEgress,Proto:IpProtocol,From:FromPort,To:ToPort,Src:ReferencedGroupInfo.GroupId,Cidr:CidrIpv4,Pl:PrefixListId,Desc:Description}' \
  --output table
```

### 명명 규칙과 태깅

보안 그룹은 시간이 지나면 반드시 늘어납니다. 1년 뒤 `sg-0a3f...`라는 ID만 보고 "지워도 되나"를 판단할 수 있어야 합니다.

| 요소 | 규칙 | 예 |
|---|---|---|
| 그룹 이름 | `{app}-{env}-{tier}-sg` | `shopmini-prod-app-sg` |
| Description(필수) | 무엇을 누구에게 허용하는지 한 문장 | `application tier, 8443 from ALB only` |
| 규칙 Description | **모든 규칙에 사유 기재** | `from ALB tier`, `SOC 점검용 임시(2026-10-01 만료)` |
| 태그 | `Project` / `Owner` / `Chapter` / `AutoDelete` | 삭제 판단과 비용 귀속의 근거 |

규칙 단위 Description은 선택 사항처럼 보이지만 실무 가치가 가장 큽니다. AWS는 보안 그룹 규칙에 `sgr-` 형태의 개별 ID를 부여하므로 규칙 자체에 태그도 달 수 있습니다.

```bash
RULE_ID=$(aws ec2 describe-security-group-rules \
  --filters Name=group-id,Values="$SG_APP" \
  --query 'SecurityGroupRules[?FromPort==`8443`].SecurityGroupRuleId | [0]' --output text)

aws ec2 create-tags --resources "$RULE_ID" \
  --tags Key=Ticket,Value=SEC-1042 Key=ExpiresOn,Value=2026-12-31
```

`ExpiresOn` 태그가 있으면 만료된 임시 허용 규칙을 자동으로 찾아 되돌릴 수 있습니다(35.2의 EventBridge + Lambda 자동 조치). **임시로 연 규칙은 반드시 만료일을 갖는다** — 방화벽 규칙이 10년간 누적되지 않게 하는 유일한 실무 장치입니다.

### 🔴 이 절의 명령

- **티어 간 통신은 예외 없이 SG 참조로 쓴다.** VPC 내부 CIDR을 SG 규칙의 소스로 쓰지 않습니다.
- **CIDR은 VPC 밖(인터넷, 온프레미스 대역, 관리형 접두사 목록)에만 쓴다.**
- **SG를 만든 직후 기본 아웃바운드 규칙을 제거한다.** 미루면 영원히 안 합니다.
- **모든 규칙에 Description을 채운다.** 빈 Description은 리뷰에서 반려합니다.

---

## 19.3 ⚠️ 절대 하면 안 되는 규칙

다섯 가지 모두 매년 같은 형태로 반복되는 사고 유형입니다. **사고 시나리오 → 원인 → 올바른 구성**으로 봅니다.

### ⚠️ 1. `0.0.0.0/0`에 22(SSH) 또는 3389(RDP) 개방

**사고 시나리오**: 배포 트러블슈팅 중 "일단 열고 나중에 닫자"며 22번을 전체 개방합니다. 인터넷 전역 스캐너가 몇 분 안에 이 포트를 찾아내고, 자격 증명 스터핑 끝에 인스턴스 IAM 역할의 임시 자격 증명이 메타데이터 서비스에서 탈취됩니다. **네트워크 침해가 자격 증명 침해로 승격됩니다.**

**원인**: (1) "나중에 닫자"는 만료 장치가 없는 약속이고, (2) 관리 접근 경로를 설계하지 않아 임시 개방이 유일한 수단이 됩니다.

**올바른 구성**:
- SSH/RDP 인바운드를 **애초에 SG에 넣지 않습니다.** 관리 접근은 **SSM Session Manager**(21.5~21.6)로 대체합니다. 인바운드 포트가 필요 없고, CloudTrail에 기록되며, IAM으로 인가됩니다.
- 배스천이 불가피하면 소스를 회사 IP가 아니라 **배스천 SG 참조**로 씁니다. 원서는 회사 IP 대역 허용의 한계를 짚습니다.

> 📖 *Practical Cloud Security* 2판 6장: **"회사 IP 대역 전체에서 관리 접근을 허용한다면, 환경 안의 침해된 워크스테이션·서버·모바일 기기 어느 것이든 관리 인터페이스에 접근하는 데 쓰일 수 있다는 점에 유의하라. 인터넷 전체에 열어 두는 것보다는 낫지만 방심하지 마라. (…) 이 포트들은 여전히 인터넷에 열려 있는 것처럼 보호해야 한다."**

### ⚠️ 2. 전 포트 개방(`-1` 또는 `0-65535`)

**사고 시나리오**: 앱이 안 돌아 원인을 못 찾자 SG에 "모든 트래픽 / 0.0.0.0/0" 인바운드를 추가합니다. 앱이 동작하고 규칙은 남습니다. 그 인스턴스의 디버그 엔드포인트(8080), 캐시(6379), 모니터링 에이전트 포트가 전부 인터넷에 노출됩니다.

**원인**: 문제가 SG가 아닌 곳(라우팅·NACL·앱 설정)에 있는데 SG를 넓히는 방식으로 절단하려 했기 때문입니다.

**올바른 구성**: 절단은 **VPC 플로우 로그의 REJECT 레코드**로 합니다. SG를 넓히지 않고도 어느 계층에서 끊겼는지 확인할 수 있습니다. "모든 트래픽"은 SG 규칙 리뷰의 **자동 반려 대상**으로 정의합니다.

### ⚠️ 3. 기본 보안 그룹 사용

**사고 시나리오**: EC2를 콘솔에서 급히 만들며 SG 선택을 넘겼더니 기본 SG가 붙습니다. 기본 SG의 인바운드는 "같은 SG 소속끼리 모든 포트 허용"입니다. 시간이 지나 계정 안 여러 워크로드가 기본 SG를 공유하면 **서로 무관한 시스템들이 전 포트로 통신 가능한 하나의 평면**이 되고, 침해 시 측면 이동에 아무 저항이 없습니다.

**원인**: 기본 SG는 이름이 `default`라 리뷰에서 눈에 띄지 않고, 어디에 붙어 있는지 추적하는 사람이 없습니다.

**올바른 구성**:
```bash
# 계정 내 모든 VPC의 기본 SG에서 인바운드·아웃바운드 규칙을 모두 제거
for SG in $(aws ec2 describe-security-groups \
    --filters Name=group-name,Values=default \
    --query 'SecurityGroups[].GroupId' --output text); do
  aws ec2 revoke-security-group-ingress --group-id "$SG" \
    --ip-permissions "IpProtocol=-1,UserIdGroupPairs=[{GroupId=$SG}]" 2>/dev/null
  aws ec2 revoke-security-group-egress --group-id "$SG" \
    --ip-permissions 'IpProtocol=-1,IpRanges=[{CidrIp=0.0.0.0/0}]' 2>/dev/null
done
```
기본 SG는 삭제할 수 없으므로 **규칙을 비워 무해화**합니다. 그다음 무엇이 기본 SG를 쓰는지 확인합니다.

```bash
aws ec2 describe-network-interfaces \
  --filters Name=group-name,Values=default \
  --query 'NetworkInterfaces[].{Eni:NetworkInterfaceId,Desc:Description,Ip:PrivateIpAddress}' \
  --output table
```

### ⚠️ 4. 아웃바운드 전체 허용 방치

**사고 시나리오**: 앱 인스턴스가 공급망 공격이 들어간 라이브러리를 로드합니다. 라이브러리는 외부 C2 서버로 아웃바운드 TLS 연결을 만들고, 명령을 받아 S3에서 읽어온 주문 데이터를 밖으로 전송합니다. **인바운드 규칙은 완벽했고, 사고는 전부 아웃바운드로 일어났습니다.**

**원인**: SG 기본 아웃바운드가 전체 허용인데 "기본값이니 괜찮다"고 넘긴 것입니다.

**올바른 구성**: 19.2의 5·6단계와 19.6 전체가 이 문제의 답입니다.

### ⚠️ 5. `::/0` 누락 — IPv6 우회

**사고 시나리오**: SG 인바운드를 `0.0.0.0/0` 기준으로 점검해 "전체 개방 없음"을 확인합니다. 그런데 서브넷에 IPv6 CIDR이 붙어 있고 SG에는 예전에 넣어둔 `::/0` 규칙이 남아 있습니다. IPv4 기준 점검은 이것을 보지 못합니다.

**원인**: 18.7에서 다룬 대로 보안 그룹 규칙은 IPv4와 IPv6를 **별도 규칙으로 이중 관리**해야 합니다. Cookbook도 규칙을 만들 때마다 IPv6 대역을 별도로 추가하라고 반복해 안내합니다.

> 📖 *AWS Security Cookbook* 6장은 인바운드 규칙 절차에서 **"IPv6 지원이 필요하면 `::/0` CIDR 범위도 추가하라"**, 아웃바운드에 대해서도 **"IPv6 트래픽이 필요하면 규칙에 `::/0` CIDR 범위를 추가할 수 있다"**고 명시합니다.

**올바른 구성**: 점검을 **IPv4/IPv6 양쪽**으로 돌립니다.

```bash
# IPv4 전체 개방 SSH
aws ec2 describe-security-groups \
  --filters Name=ip-permission.from-port,Values=22 \
            Name=ip-permission.cidr,Values=0.0.0.0/0 \
  --query 'SecurityGroups[].{Id:GroupId,Name:GroupName,Vpc:VpcId}' --output table

# IPv6 전체 개방 SSH — 이 줄을 빠뜨리는 점검이 대부분이다
aws ec2 describe-security-groups \
  --filters Name=ip-permission.from-port,Values=22 \
            Name=ip-permission.ipv6-cidr,Values=::/0 \
  --query 'SecurityGroups[].{Id:GroupId,Name:GroupName,Vpc:VpcId}' --output table
```

### 탐지 자동화: AWS Config 관리형 규칙

수동 점검은 반드시 빠집니다. 아래는 실재하는 관리형 규칙이며, **규칙 이름**과 **규칙 식별자**는 서로 다릅니다(CLI에서 `SourceIdentifier`로 지정하는 값이 식별자).

| 규칙 이름 | 식별자 | 잡아내는 것 | 위 시나리오 |
|---|---|---|---|
| `restricted-ssh` | `INCOMING_SSH_DISABLED` | 22번의 무제한 인바운드 | 1 |
| `restricted-common-ports` | `RESTRICTED_INCOMING_TRAFFIC` | 지정 포트(3389 등)의 무제한 인바운드 | 1, 2 |
| `vpc-sg-open-only-to-authorized-ports` | `VPC_SG_OPEN_ONLY_TO_AUTHORIZED_PORTS` | 허가 목록 밖 포트의 `0.0.0.0/0` 개방 | 2 |
| `vpc-default-security-group-closed` | `VPC_DEFAULT_SECURITY_GROUP_CLOSED` | 기본 SG에 규칙이 남아 있음 | 3 |
| `ec2-security-group-attached-to-eni` | `EC2_SECURITY_GROUP_ATTACHED_TO_ENI` | 어디에도 안 붙은 고아 SG | 정리 |
| `nacl-no-unrestricted-ssh-rdp` | `NACL_NO_UNRESTRICTED_SSH_RDP` | NACL의 22/3389 무제한 허용 | 19.4 |

```bash
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName": "shopmini-restricted-common-ports",
  "Description": "Detect security groups exposing management/database ports to 0.0.0.0/0",
  "Source": {
    "Owner": "AWS",
    "SourceIdentifier": "RESTRICTED_INCOMING_TRAFFIC"
  },
  "Scope": {
    "ComplianceResourceTypes": ["AWS::EC2::SecurityGroup"]
  },
  "InputParameters": "{\"blockedPort1\":\"22\",\"blockedPort2\":\"3389\",\"blockedPort3\":\"3306\",\"blockedPort4\":\"5432\",\"blockedPort5\":\"6379\"}"
}'
```

> ⚠️ `restricted-ssh`와 `restricted-common-ports`는 **IPv4 기준으로만 평가**한다고 보고 설계하십시오. `::/0` 점검(시나리오 5)은 위 CLI나 커스텀 Config 규칙으로 별도 보완합니다.

이 규칙들은 조직 단위 Config 규칙(`put-organization-config-rule`)으로 전 계정에 배포하고, 위반은 Security Hub로 모읍니다(31.5). **탐지가 없는 금지 규칙은 규칙이 아니라 희망입니다.**

---

## 19.4 NACL 실습과 활용처 🧪

### 규칙 번호 설계

NACL은 규칙 번호 오름차순으로 첫 일치에서 평가가 끝나므로 **번호 자체가 설계 요소**입니다. Cookbook의 권고(100 단위)를 실무용으로 확장하면 이런 대역 배분이 됩니다.

| 번호 대역 | 용도 | 예 |
|---|---|---|
| 1–99 | **긴급 차단(Deny)** — 사고 대응 시 최우선 삽입 | `10` DENY from `198.51.100.7/32` |
| 100–199 | 티어 간 정상 허용 | `110` ALLOW 8443 from `10.20.0.0/23` |
| 200–299 | 응답용 임시 포트 허용 | `200` ALLOW 1024-65535 |
| 300–399 | 관리/모니터링 예외 | — |
| 32766 | 명시적 광역 Deny(감사용) | 로그에서 "여기까지 왔다"를 구분 |
| `*` | 변경 불가 기본 거부 | AWS 고정 |

**1–99를 비워 두는 것**이 핵심입니다. 침해 대응 중 "기존 규칙보다 앞에" 차단을 넣어야 하는데, 100번부터 빽빽하면 전체 번호를 재배치해야 합니다. 사고 상황에 그럴 시간은 없습니다.

### ⚠️ 임시 포트(Ephemeral Port) 함정

Cookbook의 NACL 레시피는 이 함정을 실습으로 재현합니다. 새 NACL을 퍼블릭 서브넷에 붙이면 SSH가 타임아웃되고, 인바운드에 SSH(22) Allow 규칙을 넣어도 **여전히 안 됩니다.**

> 📖 *AWS Security Cookbook* 5장: **"지금 EC2 인스턴스로 SSH를 시도하면, 아웃바운드용 임시 포트를 아직 열지 않았으므로 SSH는 실패한다."** 원리는 이렇습니다. **"임시 포트는 TCP, UDP, SCTP 같은 전송 프로토콜에서 IP 통신에 쓰이는 수명이 짧은 포트다. 보통 우리가 연결하려는 인스턴스나 서비스로부터 오는 반환 트래픽에 사용된다. 예를 들어 서버는 22번 포트로 SSH 트래픽을 받고, 임시 포트 중 하나로 클라이언트와 통신한다."**

즉 **NACL에서는 요청 방향과 응답 방향의 규칙을 각각 써야 합니다.** 격리데이터 서브넷용 NACL을 만들어 봅니다.

```bash
# 격리데이터 서브넷 전용 NACL
NACL_DATA=$(aws ec2 create-network-acl --vpc-id "$VPC_ID" \
  --tag-specifications 'ResourceType=network-acl,Tags=[{Key=Name,Value=shopmini-prod-isolated-data-nacl},{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch19},{Key=AutoDelete,Value=true}]' \
  --query 'NetworkAcl.NetworkAclId' --output text)

APP_CIDRS="10.20.10.0/24 10.20.11.0/24"

# --- 인바운드: 앱 서브넷에서 오는 3306 요청 ---
N=110
for C in $APP_CIDRS; do
  aws ec2 create-network-acl-entry --network-acl-id "$NACL_DATA" --ingress \
    --rule-number $N --protocol tcp --port-range From=3306,To=3306 \
    --cidr-block "$C" --rule-action allow
  N=$((N+10))
done

# --- 아웃바운드: 응답 트래픽용 임시 포트 (이 규칙이 없으면 연결이 성립하지 않는다) ---
N=200
for C in $APP_CIDRS; do
  aws ec2 create-network-acl-entry --network-acl-id "$NACL_DATA" --egress \
    --rule-number $N --protocol tcp --port-range From=1024,To=65535 \
    --cidr-block "$C" --rule-action allow
  N=$((N+10))
done

# 인터넷을 향한 아웃바운드는 일절 만들지 않는다 → 기본 * 규칙이 거부
```

서브넷에 붙일 때는 **기존 연결을 교체**합니다. NACL은 서브넷당 정확히 하나이므로 "추가"가 아니라 "치환"입니다.

```bash
SUBNET_DATA_A=$(aws ec2 describe-subnets \
  --filters Name=vpc-id,Values="$VPC_ID" Name=cidr-block,Values=10.20.20.0/24 \
  --query 'Subnets[0].SubnetId' --output text)

ASSOC_ID=$(aws ec2 describe-network-acls \
  --filters Name=association.subnet-id,Values="$SUBNET_DATA_A" \
  --query "NetworkAcls[].Associations[?SubnetId=='$SUBNET_DATA_A'].NetworkAclAssociationId | [0][0]" \
  --output text)

aws ec2 replace-network-acl-association \
  --association-id "$ASSOC_ID" --network-acl-id "$NACL_DATA"
```

> ⚠️ **임시 포트 범위는 클라이언트 OS마다 다릅니다.** 리눅스 커널은 대개 32768–60999, 윈도우 서버는 49152–65535, ELB는 1024–65535를 씁니다. AWS는 다양한 클라이언트를 포괄하도록 **1024–65535**를 권장하고 Cookbook 레시피도 이 범위를 씁니다. 좁게 잡아 놓고 "간헐적으로만 끊긴다"는 증상에 몇 주를 쓰는 사례가 많습니다. **NACL의 임시 포트 범위는 좁히지 마십시오.** 좁은 통제는 보안 그룹에서 합니다.

### NACL을 언제 쓰는가

보안 그룹이 있는데 NACL이 왜 필요한가에 원서는 균형 잡힌 답을 줍니다.

> 📖 *Practical Cloud Security* 2판 6장: **"보안 그룹과 서브넷이 일대일로 대응한다면 서브넷을 정의하는 것이 큰 이득 없이 복잡도만 늘릴 수 있다. 대부분의 구현은 둘 다에서 이득을 보지만, 보안 그룹이 약간 우위에 있다. 시스템 중 하나에서 서비스가 잘못 설정되었을 때 더 나은 보호를 제공하기 때문이다. 네트워크 ACL로는 서브넷 안에 들어온 무엇이든 그 잘못 설정된 서비스를 악용할 수 있다."**

NACL의 정당한 용도는 세 가지입니다.

| 용도 | 이유 | 예 |
|---|---|---|
| **광역 이그레스 차단** | 서브넷 안 모든 ENI에 SG 설정 실수가 있어도 서브넷 경계에서 막힌다 | 격리데이터 서브넷의 인터넷 방향 아웃바운드 전면 거부 |
| **특정 IP·대역 차단** | 보안 그룹으로는 **불가능**한 유일한 기능 | 악성 스캐너 IP, 특정 국가 대역(WAF와 병행) |
| **침해 시 긴급 격리** | SG를 리소스별로 고치는 것보다 훨씬 빠르다 | 감염 의심 서브넷 전체를 한 번에 봉쇄 |

세 번째, 긴급 격리는 실제로 이렇게 씁니다(33.3에서 초동 조치로 절차화).

```bash
# 침해 의심 서브넷 격리: 1~99 대역에 광역 Deny를 최우선 삽입
aws ec2 create-network-acl-entry --network-acl-id "$NACL_APP" --ingress \
  --rule-number 10 --protocol -1 --cidr-block 0.0.0.0/0 --rule-action deny
aws ec2 create-network-acl-entry --network-acl-id "$NACL_APP" --egress \
  --rule-number 10 --protocol -1 --cidr-block 0.0.0.0/0 --rule-action deny
```

이때 **포렌식 접근 경로를 먼저 확보**해야 합니다. 규칙 번호 5번에 조사자 대역 Allow를 넣거나 SSM 엔드포인트 경로를 예외로 둡니다. 그렇지 않으면 격리와 동시에 조사도 불가능해집니다.

---

## 19.5 AWS Network Firewall

> 💡 **원서 이후 변경** — AWS Network Firewall은 2020년 11월 출시된 관리형 방화벽 서비스로, 근거 원서 세 권(2019·2020·2023) 어디에서도 다루지 않습니다. 따라서 이 절은 원서 인용이 아니라 AWS 서비스 문서와 실무 구성에 근거합니다. 다만 *Practical Cloud Security* 2판이 "가상 방화벽 어플라이언스"를 클라우드의 세 번째 방화벽 구현으로 분류하며 **"대체로 온프레미스에서 그대로 옮겨온 리프트 앤 시프트 모델"**이라 평가한 대목이 있는데, Network Firewall은 그 어플라이언스 운영 부담을 AWS가 대신 지는 형태로 보면 정확합니다.

### 보안 그룹·NACL이 못 하는 것

| 요구 | SG | NACL | Network Firewall |
|---|---|---|---|
| 포트/IP 기반 허용 | ○ | ○ | ○ |
| 특정 IP 차단 | × | ○ | ○ |
| **도메인 이름 기반 필터링** | × | × | ○ (TLS SNI / HTTP Host) |
| **프로토콜·페이로드 검사(IPS)** | × | × | ○ (Suricata 규칙) |
| 허용/거부 **로깅** | ×(플로우 로그로 간접) | ×(동일) | ○ (alert / flow 로그) |
| 단위 | ENI | 서브넷 | **VPC/라우팅 경로** |

핵심 차이는 **도메인 기반 판단**과 **자체 로깅** 둘입니다. IP 기반 허용목록의 한계는 원서가 이미 지적했습니다.

> 📖 *Practical Cloud Security* 2판 6장: **"아웃바운드 IP 허용목록은 통할 때는 효과적일 수 있다. 그러나 인바운드 IP 허용목록과 마찬가지로, 아웃바운드 IP 허용목록도 CDN과 글로벌 서버 로드 밸런서(GSLB)의 확산으로 점점 더 실현 가능성이 떨어지고 있다. 이들은 콘텐츠와 서비스를 더 빠르고 안정적으로 제공하는 아주 중요한 도구지만, 콘텐츠가 전 세계의 여러 IP 주소에 흩어져 빠르게 바뀔 수 있기 때문에 IP 기반 통제를 무력화한다."**

"`github.com`으로의 아웃바운드만 허용"을 IP로 표현할 수 없다는 이 문제가 도메인 필터링이 필요한 이유입니다.

### 규칙 그룹의 두 종류

**상태 비저장(Stateless) 규칙 그룹**은 5-튜플(프로토콜·출발지 IP/포트·목적지 IP/포트)로 패킷 단위 판단을 합니다. 우선순위 순으로 평가해 `aws:pass`/`aws:drop`/`aws:forward_to_sfe`(상태 저장 엔진으로 전달) 중 하나를 고릅니다. 저비용 광역 필터용입니다.

**상태 저장(Stateful) 규칙 그룹**은 연결 상태를 추적하며 **Suricata 규칙 문법과 호환**됩니다. 세 형태로 작성합니다.

1. **도메인 목록(Domain list)** — 가장 쉽고 실무 효용이 큰 형태
2. **표준 규칙(Standard stateful rules)** — 5-튜플 + 방향 지정
3. **Suricata 호환 규칙 문자열** — 오픈소스 IPS 룰셋을 그대로 활용

도메인 허용목록 규칙 그룹은 이렇게 씁니다.

```json
{
  "RuleVariables": {
    "IPSets": {
      "HOME_NET": { "Definition": ["10.20.0.0/16"] }
    }
  },
  "RulesSource": {
    "RulesSourceList": {
      "Targets": [
        ".amazonaws.com",
        ".shopmini.example.com",
        "repo.internal.example.com"
      ],
      "TargetTypes": ["TLS_SNI", "HTTP_HOST"],
      "GeneratedRulesType": "ALLOWLIST"
    }
  }
}
```

```bash
aws network-firewall create-rule-group \
  --rule-group-name shopmini-egress-domain-allowlist \
  --type STATEFUL --capacity 200 \
  --rule-group file://egress-domains.json \
  --tags Key=Project,Value=awssec-lab Key=Chapter,Value=ch19
```

Suricata 문자열로는 도메인 목록으로 표현 못 하는 조건을 씁니다.

```json
{
  "RulesSource": {
    "RulesString": "drop tls $HOME_NET any -> $EXTERNAL_NET any (msg:\"Block non-allowlisted TLS SNI\"; tls.sni; content:\"pastebin.com\"; nocase; endswith; sid:1000001; rev:1;)\nalert http $HOME_NET any -> $EXTERNAL_NET any (msg:\"Cleartext HTTP egress observed\"; sid:1000002; rev:1;)"
  }
}
```

방화벽 정책에서 두 종류를 조립하고 기본 동작을 정합니다.

```json
{
  "StatelessDefaultActions": ["aws:forward_to_sfe"],
  "StatelessFragmentDefaultActions": ["aws:forward_to_sfe"],
  "StatefulEngineOptions": { "RuleOrder": "STRICT_ORDER" },
  "StatefulDefaultActions": ["aws:drop_established", "aws:alert_established"],
  "StatefulRuleGroupReferences": [
    { "ResourceArn": "arn:aws:network-firewall:ap-northeast-2:111122223333:stateful-rulegroup/shopmini-egress-domain-allowlist", "Priority": 100 }
  ]
}
```

> 🔴 `RuleOrder`를 `STRICT_ORDER`로, `StatefulDefaultActions`에 `aws:drop_established`를 명시하는 것이 **허용목록(allowlist) 모델**입니다. 기본값 `DEFAULT_ACTION_ORDER`는 매칭되지 않은 트래픽을 통과시켜 거부목록 모델이 됩니다. 원서의 원칙 — **"일반적으로 우리는 지나치게 우스꽝스럽지 않은 선에서 최대한 제한적이고 싶으므로, 가능하다면 허용목록을 쓰고 싶다"**(2판 6장 「Allowlists and Denylists」) — 을 이 설정 한 줄이 결정합니다.

### 배치 아키텍처: 방화벽 서브넷과 라우팅

Network Firewall은 SG처럼 리소스에 "붙는" 것이 아니라 **트래픽이 지나가도록 라우팅으로 끼워 넣는** 물건입니다. 이것이 구성의 90%입니다.

```
                       인터넷
                          │
                      [ IGW ]
                          │  ◀── IGW 라우팅 테이블(엣지 연결):
                          │       10.20.0.0/24 → vpce-firewall
                          ▼
   ┌──────────────────────────────────────────────┐
   │  방화벽 서브넷  10.20.250.0/28 (2a) / .251.0/28 (2c)  │
   │        [ Network Firewall 엔드포인트 ]             │
   └──────────────────────────────────────────────┘
             ▲                              │
             │ 0.0.0.0/0 → vpce-firewall     │ 0.0.0.0/0 → igw
             │                              ▼
   ┌──────────────────────┐      ┌──────────────────────┐
   │ 퍼블릭 서브넷 10.20.0.0/24 │      │  NAT GW (퍼블릭 서브넷)  │
   │      ALB, NAT GW         │      └──────────────────────┘
   └──────────────────────┘                 ▲
             ▲                              │ 0.0.0.0/0 → nat
   ┌─────────┴────────────────────────────────────┐
   │ 프라이빗앱 서브넷 10.20.10.0/24 · 10.20.11.0/24   │
   └──────────────────────────────────────────────┘
```

구성 규칙은 네 가지입니다.

1. **방화벽 전용 서브넷을 AZ마다 하나씩** 만듭니다(`/28` 이상). 이 서브넷에는 방화벽 엔드포인트 외에 **아무것도 넣지 않습니다.**
2. **라우팅 테이블 3개를 조정**해 트래픽이 방화벽 서브넷을 통과하게 합니다: 워크로드 서브넷 → 방화벽 엔드포인트, 방화벽 서브넷 → IGW/NAT, **IGW 엣지 연결 라우팅 테이블**(인바운드 반환 경로).
3. **비대칭 라우팅을 만들지 않습니다.** 상태 저장 검사는 양방향이 같은 엔드포인트를 지나야 성립하므로, AZ를 넘나드는 경로가 생기면 연결이 끊깁니다.
4. **AZ마다 엔드포인트를 둡니다.** 한 AZ에만 두면 그 AZ 장애가 전체 아웃바운드 장애가 됩니다.

```bash
aws network-firewall create-firewall \
  --firewall-name shopmini-prod-fw \
  --firewall-policy-arn "$POLICY_ARN" \
  --vpc-id "$VPC_ID" \
  --subnet-mappings SubnetId=subnet-fw-2a SubnetId=subnet-fw-2c \
  --delete-protection \
  --subnet-change-protection \
  --firewall-policy-change-protection
```

`--delete-protection`을 기본으로 켜십시오. 방화벽 삭제는 라우팅 블랙홀을 만들어 전체 장애로 이어집니다. 로깅은 별도로 켜야 하는데, **이 서비스를 쓰는 가장 큰 이유 중 하나가 로깅**이므로 빠뜨리면 안 됩니다.

```bash
aws network-firewall update-logging-configuration \
  --firewall-name shopmini-prod-fw \
  --logging-configuration '{
    "LogDestinationConfigs": [
      {"LogType":"ALERT","LogDestinationType":"CloudWatchLogs",
       "LogDestination":{"logGroup":"/aws/network-firewall/shopmini-prod/alert"}},
      {"LogType":"FLOW","LogDestinationType":"S3",
       "LogDestination":{"bucketName":"shopmini-netfw-logs","prefix":"prod/"}}
    ]
  }'
```

> ⚠️ **비용을 먼저 계산하십시오.** Network Firewall은 엔드포인트 시간당 요금 + 처리 데이터 GB당 요금 구조이고, AZ 2개면 엔드포인트도 2개입니다. 소규모 환경에서는 19.6의 다른 세 수단(SG 아웃바운드, VPC 엔드포인트, DNS Firewall)만으로 상당 부분을 훨씬 저렴하게 커버할 수 있습니다.

---

## 19.6 🔴 이그레스(아웃바운드) 필터링

### 대부분의 조직이 비어 있는 칸

방화벽 규칙 리뷰를 하면 인바운드는 대개 정성스럽지만 아웃바운드 칸은 거의 언제나 "전체 허용"입니다. 원서는 이것을 정면으로 다룹니다.

> 📖 *Practical Cloud Security* 2판 6장 「Egress Filtering」: **"외부로부터의 공격은 반드시 예상하고 차단해야 한다. 그러나 누군가 당신의 컴포넌트 중 하나를 장악할 가능성도 있다. 그런 이유로, 신뢰할 수 있어야 마땅한 컴포넌트에 대해서도 아웃바운드, 즉 이그레스 통신을 제한하는 것은 아주 좋은 생각이다."**

이유는 셋입니다. 2판은 1판에 없던 **공급망 공격**을 맨 앞에 새로 추가했습니다.

> 📖 *Practical Cloud Security* 2판 6장:
> - **"공급망 공격이 증가하고 있으며, 현재로서는 SolarWinds 해킹이 가장 잘 알려진 사례다. (…) 이그레스 통제는 공격 성공자가 지시를 받으러 집으로 전화하지(call home) 못하게 막아 피해를 막을 수 있다."**
> - **"공격자는 당신의 데이터 사본을 통제 밖 어딘가로 전송해 훔쳐가고 싶어 할 수 있다. 이것을 데이터 유출(data exfiltration)이라 한다. (…) 다만 일반적인 연결을 제한하는 것에 더해, DNS 터널링, ICMP 터널링, 허용된 인바운드 연결의 탈취 같은 다른 유출 경로도 차단하도록 주의해야 한다."**
> - **"이그레스 필터링은 워터링 홀 공격을 막는 데도 도움이 된다. (…) 사람의 실수로 어떤 서비스가 허가되지 않은 업데이트 서버로 호출을 나가도록 설정될 수 있는데, 이때 이그레스 필터링이 2차 방어선이 된다."**

그리고 **규제 요건**임을 짚습니다.

> 📖 *Practical Cloud Security* 2판 6장: **"이그레스 필터링은 일부 환경에서 필수다. 예를 들어 NIST 800-53 Rev 5 통제 목록은 moderate 환경에 대해 SC-7(5)에서 이를 요구하고, SC-5(1)에서는 선택적 강화 항목으로 요구한다."**

**"허용된 인바운드 연결의 탈취"**라는 단서에 주의하십시오. 원서는 이그레스 필터링의 한계를 스스로 밝힙니다.

> 📖 *Practical Cloud Security* 2판 6장: **"예를 들어 공격자가 웹 서버나 애플리케이션 서버를 침해해 그 위에 데이터를 올려 두면, 그 시스템은 기꺼이 데이터를 서빙할 것이고 이그레스 통제를 우회하게 된다."**

즉 이그레스 필터링은 만능이 아니라 **심층 방어의 한 겹**입니다. 안 할 이유는 되지 않습니다.

### 구현 수단 네 가지

원서는 포트 제한이 가장 쉽지만 가장 약하다고 순위를 매깁니다.

> 📖 *Practical Cloud Security* 2판 6장: **"아웃바운드 포트 제한은 트래픽을 제한하는 가장 단순한 방법이지만 가장 효과가 적기도 하다. 예를 들어 tcp/443 외의 통신은 막되 tcp/443은 어떤 목적지로든 허용할 수 있다. (…) 그런 해법은 특별히 효과적이지 않으며 이그레스 통제가 있다고 컴플라이언스 체크박스를 채우는 데 흔히 쓰인다."** 그리고 **"프록시가 이그레스 통제를 구현하는 가장 효과적인 방법이다"**라고 결론짓습니다.

AWS에서 이 스펙트럼은 네 개의 수단으로 대응됩니다.

| 수단 | 통제 대상 | 강도 | ShopMini 적용 |
|---|---|---|---|
| **1. SG/NACL 아웃바운드 제한** | 포트·IP | 낮음 (원서: "가장 단순하지만 가장 효과가 적다") | 앱 SG 아웃바운드를 3306+443(S3 PL)로 한정. DB SG 아웃바운드 비움 |
| **2. NAT 없는 서브넷 + VPC 엔드포인트** | **경로 자체를 제거** | 높음 | 격리데이터 서브넷에 NAT 라우트 없음. S3는 게이트웨이 엔드포인트로 |
| **3. Network Firewall 도메인 필터** | 도메인(SNI/Host) | 높음 | 앱 티어의 아웃바운드를 `.amazonaws.com` + 승인 도메인으로 허용목록 |
| **4. Route 53 Resolver DNS Firewall** | **DNS 질의** | 중~높음 | AWS 관리형 위협 도메인 목록 차단 + DNS 터널링 대응 |

**2번이 가장 강력하고 저렴합니다.** 규칙 대신 **경로를 없애는 것**이기 때문입니다. 규칙은 실수로 넓어질 수 있지만 없는 라우트는 넓어지지 않습니다. ShopMini의 격리데이터 서브넷에는 IGW도 NAT도 없고, S3·Secrets Manager 접근은 VPC 엔드포인트로만 이루어집니다. **20장에서 엔드포인트 정책으로 완성합니다.**

**4번은 원서가 지적한 "DNS 터널링"에 직접 대응하는 수단**이고 비용 대비 효과가 가장 좋습니다.

```bash
# AWS 관리형 위협 도메인 목록 확인
aws route53resolver list-firewall-domain-lists \
  --query 'FirewallDomainLists[?starts_with(Name, `AWSManagedDomains`)].{Id:Id,Name:Name}' \
  --output table
# 예: AWSManagedDomainsMalwareDomainList,
#     AWSManagedDomainsBotnetCommandandControl

RG_ID=$(aws route53resolver create-firewall-rule-group \
  --name shopmini-prod-dns-fw \
  --creator-request-id "shopmini-ch19-$(date +%s)" \
  --query 'FirewallRuleGroup.Id' --output text)

# 봇넷 C2 도메인 질의를 차단
aws route53resolver create-firewall-rule \
  --firewall-rule-group-id "$RG_ID" \
  --firewall-domain-list-id "$BOTNET_LIST_ID" \
  --priority 100 --action BLOCK --block-response NXDOMAIN \
  --name block-botnet-c2 \
  --creator-request-id "shopmini-ch19-rule-$(date +%s)"

aws route53resolver associate-firewall-rule-group \
  --firewall-rule-group-id "$RG_ID" --vpc-id "$VPC_ID" \
  --priority 101 --name shopmini-prod-dns-fw-assoc \
  --creator-request-id "shopmini-ch19-assoc-$(date +%s)"
```

> 💡 자체 도메인 허용목록은 `create-firewall-domain-list` + `import-firewall-domains`(S3의 도메인 목록 파일)로 만들고, 우선순위가 더 낮은(숫자가 큰) 규칙에 `--action BLOCK`으로 `*`를 두어 완성합니다. 다만 DNS 통제는 **IP를 직접 쓰는 통신을 잡지 못하므로** 3번(도메인 필터) 또는 2번(경로 제거)과 반드시 병행하십시오.

### 🔴 반드시 이렇게 하라

1. **모든 SG를 만들 때 기본 아웃바운드 규칙을 먼저 제거한다.** `IpProtocol=-1, 0.0.0.0/0`이 남아 있는 SG는 리뷰에서 반려합니다.
2. **데이터 티어에는 인터넷 경로 자체를 만들지 않는다.** NAT 라우트 없음 + VPC 엔드포인트(20장).
3. **DNS 계층 통제를 최소 한 겹 넣는다.** DNS Firewall + Resolver 쿼리 로깅. 관리형 위협 목록만 켜도 C2 통신의 상당수를 잡습니다.
4. **아웃바운드 거부를 알림으로 만든다.** **내부에서 나가려다 거부된 연결은 잡음이 아니라 신호**입니다. Network Firewall alert 로그와 플로우 로그의 egress REJECT를 GuardDuty·Security Hub와 함께 봅니다(29·31장).
5. **깨질 것을 먼저 문서화한다.** 이그레스를 조이면 반드시 무언가 깨집니다(OS 패치 저장소, 컨테이너 이미지 레지스트리, 라이선스 서버, 시간 동기화). **깨지는 목록을 먼저 만들어 허용목록에 넣은 다음** 조입니다. 순서를 반대로 하면 롤백됩니다.

---

## 19.7 마이크로세그멘테이션과 제로 트러스트 네트워킹

### 마이크로세그멘테이션이란

전통 네트워크의 세그멘테이션은 큰 덩어리(DMZ·사내망·서버존)를 나눕니다. 마이크로세그멘테이션은 그 단위를 **워크로드 하나까지** 줄입니다.

> 📖 *Practical Cloud Security* 2판 6장 「Zero Trust Networking」: **"연결 보안은 흔히 마이크로세그멘테이션과 결합된다. 온프레미스 환경보다 클라우드 환경에서 네트워크 세그먼트를 더 많이 만드는 것이 대개 더 쉽고 더 싸기 때문이다. 마이크로세그멘테이션은 한 컴포넌트에서 다른 컴포넌트로의 네트워크 접근을 허용할 때, 필요 이상의 리소스에 접근을 허용하지 않도록 보장한다."**

온프레미스에서는 세그먼트를 잘게 나누는 일 자체가 VLAN 신청과 방화벽 팀 일정의 문제였습니다(18.3). 그 비용 구조가 바뀌었기 때문에 "필요 이상의 접근을 허용하지 않는다"를 워크로드 단위까지 밀어붙일 수 있게 된 것입니다.

**19.2의 SG 참조 체인이 이미 마이크로세그멘테이션입니다.** ALB SG를 가진 것만 앱에 8443으로, 앱 SG를 가진 것만 DB에 3306으로 붙습니다. 통제의 단위는 서브넷도 IP도 아닌 **워크로드의 역할**입니다.

### 제로 트러스트: 네트워크 통제만으로는 부족하다

원서는 제로 트러스트가 제품이 아니라 개념이며 클라우드 네트워크에서의 핵심은 하나라고 못 박습니다.

> 📖 *Practical Cloud Security* 2판 6장: **"1장에서 언급했듯 제로 트러스트는 개념이지 제품이나 서비스가 아니다. (…) 클라우드 환경의 네트워크를 보호할 때 제로 트러스트에서 가장 중요한 부분은, 통신이 전적으로 당신의 경계 안에서 일어나더라도 클라우드 환경의 리소스 간 통신을 보호한다는 것 — 즉 인증, 인가, 암호화 — 이다. 그 예가 '로컬호스트 전용' 통신을 제외한 모든 연결에 TLS를 사용하는 것이다."**

1장에서는 용어 자체의 오해를 정리합니다.

> 📖 *Practical Cloud Security* 2판 1장: **"'제로 트러스트'는 사실 '암묵적 신뢰 제로' 또는 '충분한 이유 없이는 신뢰를 가정하지 않음' 같은 다른 이름이어야 한다. 핵심 원칙은, 사용자나 다른 시스템으로부터의 신뢰는 단지 네트워크상에서 당신에게 도달할 수 있다는 이유로, 또는 회사 소유 기기를 쓴다는 이유로 주어지는 것이 아니라 획득되어야 한다는 것이다."**

네트워크 통제에 주는 결론은 냉정합니다. **네트워크 위치를 인증 수단으로 쓰지 말라.**

> 📖 *Practical Cloud Security* 2판 6장 「Allowlists and Denylists」: **"IP 주소는 위조하기가 너무 쉬우므로 시스템을 인증하는 유일한 방법으로 쓰여서는 안 된다. 반복할 가치가 있다. 요청이 네트워크의 어느 부분에서 왔는지만으로 시스템을 인증하거나 접근을 인가하는 것은 거의 언제나 좋은 생각이 아니다. 허용목록이 보조 역할을 하는 가운데, 시스템 인증에는 API 키나 TLS 인증서 같은 기법이 쓰여야 한다."**

### AWS에서의 구현 한계와 보완

| 제로 트러스트 요구 | 네트워크 통제만으로 | AWS에서의 보완 |
|---|---|---|
| 호출자 **신원 확인** | 불가 — SG는 "어느 SG에서 왔나"만 알고 "누구인가"는 모름 | IAM 역할 기반 인증(7장), IAM Roles Anywhere, mTLS |
| 세션 **암호화** | 불가 — SG는 평문 8443도 허용 | TLS 종료 위치 설계(23.5), ACM 인증서(23.2) |
| **최소 권한 인가** | 포트 수준까지만 | IAM 정책, S3 버킷 정책, RDS IAM 인증 |
| **감사 추적** | 플로우 로그(연결 단위) | CloudTrail(API 호출 단위, 29장) |
| **동적 재평가** | 정적 규칙 | IAM 조건 키(`aws:SourceVpce`, `aws:PrincipalOrgID` 등) |

**네트워크 통제와 IAM은 대체 관계가 아니라 곱셈 관계**입니다. SG 참조 체인이 있어도 앱이 DB에 평문으로 붙고 공유 계정 하나로 인증한다면 제로 트러스트가 아니고, 반대로 IAM이 완벽해도 아웃바운드가 전면 개방이면 침해 후 데이터 유출을 막지 못합니다. ShopMini에 두 축을 함께 적용하면 이렇게 됩니다.

| 경로 | 네트워크 통제(19장) | 신원·암호화 통제 |
|---|---|---|
| CloudFront → ALB | CloudFront 관리형 접두사 목록만 443 | 오리진 커스텀 헤더 검증, ACM 인증서 |
| ALB → 앱 | `app-sg` 인바운드 8443 ← `alb-sg` | **8443이 HTTPS인 이유** — 백엔드 구간도 TLS |
| 앱 → RDS | `db-sg` 인바운드 3306 ← `app-sg` | RDS IAM 인증(16.2) 또는 Secrets Manager 순환(11.3), `require_secure_transport` |
| 앱 → S3 | 게이트웨이 엔드포인트만(NAT 경로 없음) | 엔드포인트 정책 + 버킷 정책 `aws:SourceVpce`(20.3) |
| 관리자 → 앱 | **인바운드 관리 포트 없음** | SSM Session Manager + IAM + MFA(21.5~21.6) |

마지막 행이 이 장의 결론입니다. **가장 강한 네트워크 통제는 규칙을 잘 쓰는 것이 아니라 통제해야 할 경로를 만들지 않는 것입니다.**

---

## 이 장의 요약

| 항목 | 핵심 |
|---|---|
| 보안 그룹 | 상태 저장, ENI 단위, **Allow만**, 모든 규칙의 합집합. 티어 간 통제의 **주 수단** |
| NACL | 상태 비저장, 서브넷 단위, **Allow+Deny**, 번호 순 첫 일치. 광역 차단·특정 IP 차단·긴급 격리용 |
| 임시 포트 함정 | NACL은 응답 트래픽용 **1024–65535 아웃바운드 규칙**을 별도로 써야 한다 |
| SG 참조 체인 | `alb-sg` → `app-sg`(8443) → `db-sg`(3306). CIDR 대신 SG 참조 = 자동 추적·오탈자 방지·무중단 확장 |
| 금지 규칙 | `0.0.0.0/0`의 22/3389, 전 포트 개방, 기본 SG 방치, 아웃바운드 전체 허용, `::/0` 미점검 |
| 탐지 | `restricted-ssh`, `restricted-common-ports`, `vpc-sg-open-only-to-authorized-ports`, `vpc-default-security-group-closed`, `nacl-no-unrestricted-ssh-rdp` |
| Network Firewall | 도메인(SNI/Host) 필터링 + Suricata IPS + 자체 로깅. **방화벽 서브넷 + 라우팅**으로 끼워 넣는다 |
| 이그레스 필터링 | 4수단: SG 아웃바운드 / **NAT 없는 서브넷 + VPC 엔드포인트(최강)** / NFW 도메인 필터 / DNS Firewall |
| 제로 트러스트 | 네트워크 통제 × IAM 인증 × TLS 암호화. **네트워크 위치는 인증 수단이 아니다** |

---

## 🔴 필수 구성 체크리스트

- [ ] 모든 티어 간 허용을 **SG 참조**로 표현했다 (VPC 내부 CIDR을 소스로 쓰지 않았다)
- [ ] 모든 SG에서 **기본 아웃바운드 `0.0.0.0/0` 규칙을 제거**하고 필요한 것만 명시했다
- [ ] **DB 보안 그룹의 아웃바운드가 비어 있다**
- [ ] 모든 SG 규칙에 **Description**이 채워져 있고, 임시 규칙에는 만료일 태그가 있다
- [ ] SSH/RDP 인바운드가 어느 SG에도 없다 (관리 접근은 SSM Session Manager)
- [ ] 모든 VPC의 **기본 보안 그룹 규칙이 비어 있다**
- [ ] SG 점검을 **IPv4(`0.0.0.0/0`)와 IPv6(`::/0`) 양쪽**으로 수행한다
- [ ] Config 규칙 `restricted-ssh` / `restricted-common-ports` / `vpc-default-security-group-closed`가 조직 단위로 배포되어 있다
- [ ] NACL 규칙 번호 **1–99 대역이 비어 있다**(긴급 차단용 예약)
- [ ] NACL에 응답용 **임시 포트 1024–65535** 아웃바운드 규칙이 있다 (범위를 좁히지 않았다)
- [ ] 격리데이터 서브넷의 라우팅 테이블에 **IGW·NAT 경로가 없다**
- [ ] Route 53 Resolver DNS Firewall에 **관리형 위협 도메인 목록**이 연결되어 있다
- [ ] VPC 플로우 로그가 켜져 있고, **내부 출발지의 REJECT 레코드가 알림으로 이어진다**
- [ ] Network Firewall을 쓴다면 AZ별 엔드포인트, `STRICT_ORDER` + `aws:drop_established`, 삭제 보호, 로깅 활성화

---

## ⚠️ 자주 하는 실수

| 실수 | 결과 | 올바른 구성 |
|---|---|---|
| `0.0.0.0/0`에 22/3389 개방 | 스캐너가 수 분 내 발견 → 자격 증명 공격 → 인스턴스 역할 탈취 | SSM Session Manager. 배스천이 필요하면 소스를 **배스천 SG 참조**로 |
| 문제 절단용으로 전 포트 개방 후 방치 | 디버그 엔드포인트·캐시 포트가 인터넷 노출 | 절단은 **플로우 로그 REJECT**로. "모든 트래픽" 규칙은 리뷰 자동 반려 |
| 기본 SG 사용 | 무관한 워크로드가 전 포트로 연결된 단일 평면 → 측면 이동 무저항 | 기본 SG **규칙을 비우고**, 붙어 있는 ENI를 찾아 전용 SG로 교체 |
| SG 소스에 서브넷 CIDR 사용 | 같은 서브넷의 새 워크로드가 자동으로 허용됨 | SG 참조로 전환. CIDR은 VPC 밖에만 |
| 아웃바운드 전체 허용 방치 | 공급망 공격의 C2 통신·데이터 유출을 못 막음 | 기본 egress 제거 → 필요한 것만. 데이터 티어는 인터넷 경로 자체 제거 |
| IPv4만 점검 | `::/0` 규칙이 통제를 우회 | `ip-permission.ipv6-cidr` 필터로 이중 점검 |
| 새 NACL을 만들어 바로 서브넷에 연결 | 신규 NACL은 **양방향 전부 거부** → 서브넷 즉시 장애 | 규칙을 다 넣은 뒤 `replace-network-acl-association` |
| NACL에 요청 방향 규칙만 작성 | 규칙은 맞는데 연결이 안 됨(타임아웃) | 응답용 **임시 포트 1024–65535** 규칙 추가 |
| NACL 임시 포트 범위를 좁게 설정 | 클라이언트 OS에 따라 **간헐적** 연결 실패 | 1024–65535 유지. 세밀한 통제는 SG에서 |
| NACL 번호를 100부터 촘촘히 채움 | 사고 시 최우선 Deny를 끼워 넣을 자리가 없음 | 1–99 예약, 100 단위 간격 |
| Network Firewall을 한 AZ에만 배치 | 해당 AZ 장애 = 전체 아웃바운드 장애, 비대칭 라우팅 | AZ마다 엔드포인트 + 대칭 라우팅 |
| 이그레스를 먼저 조이고 예외를 나중에 | 패치·이미지 pull·NTP가 깨져 롤백 | **깨지는 목록을 먼저 만들어** 허용목록에 넣고 조인다 |
| 네트워크 통제로 인증을 대신함 | IP는 위조 가능. 침해된 내부 호스트에 무방비 | 네트워크 통제 **×** IAM 인증 **×** TLS |

---

## 다음 장 예고

19.6에서 "가장 강력한 이그레스 통제는 규칙이 아니라 **경로를 없애는 것**"이라고 했습니다. 20장은 그 경로 제거를 실제 아키텍처로 만듭니다.

S3 게이트웨이 엔드포인트와 인터페이스 엔드포인트(PrivateLink)로 NAT 없이 AWS 서비스에 도달하는 법, **엔드포인트 정책으로 "우리 조직의 버킷에만"을 강제해 유출 경로를 원천 차단하는 법**(`aws:PrincipalOrgID`)을 다룹니다. 인터넷 게이트웨이 없이도 운영 가능한 서브넷 설계가 20장의 도착점입니다.
