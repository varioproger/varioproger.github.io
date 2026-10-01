---
chapter: 11
level: "Level 1 — 초급"
title: "EC2 인스턴스: AMI · 키페어 · 시큐리티 그룹"
difficulty: 입문
reading_time: "30분"
prerequisites: [5, 8]
source_docs:
  - "website/docs/r/instance.html.markdown"
  - "website/docs/r/security_group.html.markdown"
  - "website/docs/r/vpc_security_group_ingress_rule.html.markdown"
  - "website/docs/r/ebs_volume.html.markdown"
  - "website/docs/d/ami.html.markdown"
  - "website/docs/guides/version-6-upgrade.html.markdown"
  - "docs/design-decisions/relationship-resource-design-standards.md"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance"
provider_baseline: "6.x"
---

# 11장 — EC2 인스턴스: AMI · 키페어 · 시큐리티 그룹

**이 장에서 배우는 것**

- `aws_ami` 데이터 소스를 v6 규칙에 맞게 쓰고, "최신 AMI가 인스턴스를 갈아엎는" 문제를 피할 수 있다.
- 시큐리티 그룹의 인라인 `ingress`/`egress` 와 `aws_vpc_security_group_ingress_rule` 계열의 차이를 알고 **둘을 섞으면 안 되는 이유**를 설명할 수 있다.
- `user_data` 세 인수의 관계를 알고 `metadata_options` 로 IMDSv2를 강제할 수 있다.
- `ebs_block_device` 와 `aws_ebs_volume` + `aws_volume_attachment` 를 왜 섞을 수 없는지, `tags` 와 `volume_tags` 가 어떻게 다른지 판단하고, 개인키를 Terraform으로 만들면 안 되는 이유를 안다.

**왜 중요한가**

금요일 오후에 `data "aws_ami"` 에 `most_recent = true` 가 걸린 모듈로 apply를 돌린다. 이미지 공급자가 그 주에 새 이미지를 냈으므로 AMI ID가 바뀌었고, plan에는 `# forces replacement` 가 붙는다. 확인 없이 yes를 누르면 프로덕션 웹 서버 6대가 **동시에 종료되고 다시 만들어진다.** 루트 볼륨은 기본값이 `delete_on_termination = true` 라 로컬 상태도 함께 사라진다. 원인은 데이터 소스가 아니라 "AMI ID가 인스턴스의 정체성"이라는 사실을 몰랐던 것이다.

두 번째 사고는 조용하다. 시큐리티 그룹을 인라인 `ingress` 블록으로 만들어 두고, 다른 팀이 같은 그룹에 `aws_vpc_security_group_ingress_rule` 로 규칙을 하나 더 붙인다. 원문은 이 조합에 `!> WARNING` 을 달아 두었다 — 규칙 충돌, 영구 diff, 규칙 덮어쓰기. 실제 증상은 A팀이 apply하면 B팀 규칙이 사라지고 B팀이 apply하면 다시 생기는 것이다. 두 파이프라인이 번갈아 돌면서 방화벽 구멍이 몇 분 간격으로 열리고 닫히는데, 아무도 오류를 보지 못한다.

세 번째는 자격증명 사고다. `tls_private_key` 로 SSH 키를 만들어 `aws_key_pair` 에 넣는 예제가 널려 있는데, 그렇게 하면 **개인키가 state에 평문으로 저장된다.** "모든 인스턴스에 로그인할 수 있는 키"를 state를 읽는 모두에게 배포한 셈이다.

## 최소 구성이 실제로 만드는 것

동작하는 가장 짧은 인스턴스는 `ami` 와 `instance_type` 두 인수뿐이다. 원문에서 이 둘은 모두 **Optional**인데, `launch_template` 로 Launch Template을 지정하고 그 템플릿이 AMI와 타입을 담고 있으면 생략할 수 있기 때문이다. 양쪽에 다 있으면 **리소스 쪽 값이 템플릿 값을 덮어쓴다.**

`subnet_id` 와 `vpc_security_group_ids` 를 쓰지 않으면 인스턴스는 계정의 기본 VPC·기본 subnet·기본 시큐리티 그룹으로 간다. 기본 그룹은 "같은 그룹 안이면 전부 허용"이고 누가 그 안에 있는지 아무도 추적하지 않는다. 실제로 쓸 골격은 이 정도다.

```terraform
resource "aws_instance" "app" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = "t3.small"
  subnet_id              = aws_subnet.private_a.id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  metadata_options {
    http_tokens = "required" # IMDSv2 강제
  }

  root_block_device {
    volume_type = "gp3"
    encrypted   = true
  }

  tags = { Name = "app-server" }
}
```

이미지, 크기, 네트워크 위치, 권한, 디스크 — 이 다섯 축이 인스턴스를 정의한다.

## AMI: 이미지를 고르는 세 가지 방법

`ami` 는 문자열 하나를 받지만 그 값을 얻는 경로는 셋이다.

**1. AMI ID를 직접 적는다.** 가장 재현 가능하다. AMI ID는 **리전마다 다르므로** 멀티 리전에서는 리전별 map이 필요하고 갱신은 사람이 한다. 어떤 이미지가 쓰였는지 증명해야 하는 환경이라면 오히려 이쪽이 정답이다.

**2. `aws_ami` 데이터 소스로 찾는다**([8장](08-data-sources.md)).

```terraform
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
}
```

v6의 변경을 반드시 알아야 한다. `most_recent = true` 를 쓰면 **`owners` 또는 `image-id`·`owner-id` 를 지정하는 `filter` 가 반드시 있어야 한다.** v5까지는 경고만 띄웠지만 v6는 오류로 중단한다. 이유는 공급 사슬 공격이다 — 소유자를 제한하지 않고 "이름이 이렇게 생긴 최신 이미지"를 고르면, 제3자가 비슷한 이름의 공개 이미지를 올리는 것만으로 우리 인스턴스가 그 이미지로 부팅될 수 있다.

진짜 함정은 따로 있다. **AMI ID가 바뀌면 인스턴스가 교체된다.** 코드를 한 글자도 안 고쳤는데 어제와 오늘의 plan이 달라진다는 뜻이다. 대안은 셋 — AMI ID를 변수로 빼서 명시적으로 갱신하거나, `lifecycle { ignore_changes = [ami] }` 로 무시하거나, Launch Template + ASG로 옮겨 롤링 교체를 정상 절차로 만드는 것이다([28장](../level2-intermediate/28-compute-asg-alb.md)).

**3. SSM Parameter Store 경로를 준다.** `ami = "resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"` 처럼 쓴다. `resolve:ssm:` 접두어가 붙으면 EC2 API가 그 파라미터를 읽어 AMI ID로 바꾼다. 리전 의존성이 사라지고 Terraform이 AMI ID 변화를 diff로 보지 않지만, 지금 어떤 이미지로 떠 있는지가 코드에서 보이지 않는다.

## 네트워크 배치와 퍼블릭 IP

`subnet_id` 가 인스턴스의 자리를 정하고, subnet이 AZ를 결정하므로 `availability_zone` 을 따로 적을 일은 거의 없다. subnet의 라우팅 테이블이 공개 여부를 결정한다([5장](05-first-resource-vpc.md)).

시큐리티 그룹을 붙이는 인수는 둘인데 하나만 쓴다.

- `vpc_security_group_ids` — 그룹 **ID** 리스트. VPC 안의 인스턴스는 이것을 쓴다.
- `security_groups` — 그룹 **이름** 리스트. 원문이 "EC2-Classic and default VPC only"라고 못 박고 "VPC라면 `vpc_security_group_ids` 를 쓰라"는 노트를 달아 둔 인수다. 새 코드에서는 잊어도 된다.

`associate_public_ip_address` 는 subnet의 기본 설정을 덮어써 퍼블릭 IP를 붙일지 정한다. 이렇게 얻은 주소는 **stop/start하면 바뀐다.** 고정이 필요하면 `aws_eip` 로 주소를 할당하고 `aws_eip_association` 으로 인스턴스에 연결한다.

```terraform
resource "aws_eip" "app" {
  domain = "vpc"
}

resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}
```

연결을 `aws_eip_association` 으로 분리하면 인스턴스를 교체해도 주소 할당은 살아남고 연결만 다시 만들어진다. 그리고 원문이 `public_ip` 속성에 붙인 경고를 기억한다 — **EIP를 붙였다면 `public_ip` 대신 EIP의 주소를 직접 참조하라.** EIP가 붙는 순간 이 필드가 바뀌므로 output이나 DNS 레코드에 물려 두면 한 박자 늦은 값이 흘러 들어간다.

## 시큐리티 그룹: 인라인 규칙과 별도 규칙 리소스

그룹은 `aws_security_group` 하나로 만들지만 **규칙을 어디에 쓰느냐**에 두 방식이 있고, 이것이 이 장에서 가장 중요한 갈림길이다.

### 현재 권장: 그룹과 규칙을 분리한다

```terraform
resource "aws_security_group" "app" {
  name        = "app-sg"
  description = "App tier: HTTPS in from ALB, all out"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "app_https" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 443
  ip_protocol                  = "tcp"
  to_port                      = 443
  description                  = "HTTPS from ALB"
}

# egress 규칙도 같은 형태로 둔다. ip_protocol = "-1" 이 모든 프로토콜·포트다
```

규칙 리소스의 인수는 **단수형**이다. `cidr_ipv4`, `cidr_ipv6`, `prefix_list_id`, `referenced_security_group_id` 중 하나를 골라 출처를 지정한다. 넷 다 Optional로 표시되지만 원문은 반드시 하나는 주어야 한다고 명시한다. Required는 `ip_protocol` 과 `security_group_id` 뿐이고, `from_port`/`to_port` 는 `ip_protocol` 이 `-1` 이나 `icmpv6` 인 경우를 빼면 사실상 필수다.

규칙 하나를 리소스 하나로 만드는 설계는 "리소스는 단일 API 객체를 표현해야 한다"는 provider 설계 원칙을 따른 것이다. 이득은 셋이다. 규칙마다 **고유 ID(`security_group_rule_id`)** 가 생겨 plan에서 무엇이 바뀌는지 리소스 주소로 보이고, 규칙에 **`tags` 와 `description`** 을 붙일 수 있으며, CIDR이 여러 개일 때 리스트 diff가 아니라 리소스 추가·삭제로 나타나 `for_each` 와 잘 맞는다.

### 남아 있는 방식: 인라인 `ingress` / `egress`

`aws_security_group` 안에 직접 쓰는 블록도 동작한다. 인수 이름이 복수형이라는 점이 다르다 — `cidr_blocks`, `ipv6_cidr_blocks`, `prefix_list_ids`, `security_groups`, `self`. 원문은 여러 CIDR을 다루기 어렵고 고유 ID가 없어 태그와 설명을 붙일 수 없다는 이유로 이 방식을 권하지 않으며, 더 강한 경고를 덧붙인다.

> 인라인 규칙(`ingress`/`egress`)을 `aws_vpc_security_group_ingress_rule`/`egress_rule` 또는 `aws_security_group_rule` 과 **함께 쓰면 안 된다.** 규칙 충돌, 영구 diff, 규칙 덮어쓰기가 발생할 수 있다.

인라인 블록이 **배타적(exclusive)** 이기 때문이다. 기여자 문서의 관계 리소스 분류에서도 `aws_security_group` 의 ingress/egress는 "배타적 규칙을 만드는" 소수의 예외로 표시된다. 인라인을 쓰면 Terraform은 그 그룹의 규칙 전체를 자기 것으로 간주하고 설정에 없는 규칙을 지운다.

하나의 그룹에는 **한 가지 방식만** 쓴다. 옮길 때는 규칙 리소스를 만들어 import한 뒤 인라인 블록을 지운다. 여기 함정이 하나 있다 — `ingress`/`egress` 는 attributes-as-blocks 모드로 처리되므로 **블록을 그냥 지우면 규칙이 지워지지 않는다.** 모두 없애려면 `ingress = []`, `egress = []` 처럼 빈 리스트를 명시해야 한다.

### egress 기본값이 없다

AWS가 VPC 안에 새 시큐리티 그룹을 만들면 "모든 아웃바운드 허용" 규칙이 자동으로 붙는다. **Terraform은 그 기본 규칙을 제거한다** — egress 통제에서 놀랄 일을 줄이겠다는, 원문이 직접 밝힌 설계 결정이다. 그래서 egress 규칙을 쓰지 않으면 그 그룹에 붙은 인스턴스는 **아웃바운드가 전부 막힌다.** dnf가 멈추고, SSM 에이전트가 연결되지 않고, ECR pull이 실패한다. "running인데 아무것도 안 된다"라는 증상이라 원인 찾기에 시간이 걸린다.

### `description` 은 ForceNew다

`aws_security_group` 에서 `name`, `name_prefix`, `vpc_id`, 그리고 **`description` 이 모두 Forces new resource** 다. `description` 은 AWS의 `GroupDescription` 에 매핑되는데 **이것을 수정하는 API가 없기 때문**이다. 기본값은 `Managed by Terraform` 이고 빈 문자열은 허용되지 않는다. 갱신 가능한 방식으로 그룹을 분류하려면 `description` 이 아니라 **`tags` 를 쓰라**는 것이 원문의 조언이다([10장](10-tags-basics.md)).

## 접속과 권한: 키페어와 인스턴스 프로파일

`key_name` 은 인스턴스에 심을 SSH 키페어의 **이름**이며, 원문이 안내하듯 `aws_key_pair` 리소스로 관리할 수 있다.

`aws_key_pair` 에는 `key_name` 과 `public_key` 를 준다(`public_key = file("~/.ssh/id_ed25519.pub")`). 핵심은 이 리소스가 **공개키만** 다룬다는 점이다. "`tls_private_key` 로 키를 만들어 넣고 `local_file` 로 저장한다" 패턴은 편해 보이지만 그 순간 **개인키가 state에 평문으로 들어간다.** state는 [9장](09-state-basics.md)에서 본 대로 값을 그대로 담는 JSON이고, `sensitive` 표시는 CLI 출력만 가릴 뿐 파일 내용을 바꾸지 않는다.

키는 밖에서 만들어 공개키만 넘기거나, 아예 SSH를 쓰지 않는 쪽이 낫다. 실무의 기본값은 후자다. SSM Session Manager를 쓰면 22번 포트도 키 배포도 배스천도 필요 없다. 그 경우 `key_name` 은 비우고 SSM 권한을 담은 인스턴스 프로파일만 붙인다.

`iam_instance_profile` 은 롤 ARN이 아니라 **인스턴스 프로파일의 이름**을 받는다. 인스턴스 프로파일은 IAM 롤을 감싸는 얇은 컨테이너다. EC2 API가 롤을 직접 붙이지 못하고 프로파일만 붙일 수 있어서 이 한 겹이 필요하다.

```terraform
resource "aws_iam_instance_profile" "app" {
  name = "app-instance-profile"
  role = aws_iam_role.app.name # 롤 ARN이 아니라 이름
}
```

원문이 이 인수에 붙인 경고를 놓치면 안 된다 — Terraform을 실행하는 자격증명에 **`iam:PassRole`** 권한이 필요하다. 없으면 인스턴스 생성이 권한 오류로 실패하는데 메시지만 보고는 어느 권한이 부족한지 알기 어렵다.

## user_data와 IMDSv2

부팅 시 실행할 스크립트는 `user_data` 로 넘긴다. 같은 자리에 쓸 수 있는 인수가 셋이다. `user_data` 는 문자열이고 **gzip 압축 데이터를 여기 넣으면 안 된다.** `user_data_base64` 는 base64로 인코딩된 바이너리로, 값이 유효한 UTF-8이 아닐 때(예: gzip) 이쪽을 쓴다. `user_data_replace_on_change` 는 불리언이고 기본값은 `false` 다.

기본 동작은 이렇다. `user_data` 나 `user_data_base64` 를 고치면 인스턴스가 **stop/start** 된다. 교체가 아니라 재기동이다. 그런데 EC2의 user data는 원칙적으로 **최초 부팅 때만** 실행되므로 재기동해도 새 스크립트가 돌지 않는다. 즉 기본 설정에서 user data를 수정하면 "state와 설정은 맞는데 인스턴스 안은 옛날 그대로"인 상태가 된다.

`user_data_replace_on_change = true` 를 켜면 이 인수들의 변경이 **파괴 후 재생성**을 유발한다. 새 인스턴스가 새 스크립트로 부팅하니 의도대로 동작하지만 인스턴스가 실제로 죽는다. 상태를 갖는 서버라면 켜기 전에 "언제든 버려도 되는가"를 먼저 답해야 한다.

user data는 인스턴스 메타데이터 서비스(IMDS)로 노출되고, IMDS는 인스턴스 프로파일의 **임시 자격증명**도 같은 경로로 내어 준다. SSRF 취약점 하나가 곧 자격증명 유출이 되던 시절이 여기서 나왔고, 그 대응이 IMDSv2다. `metadata_options` 로 강제한다.

- `http_tokens` — `optional` 또는 `required`. **`required` 가 IMDSv2 강제**다. 세션 토큰을 PUT으로 먼저 받아야 메타데이터를 읽을 수 있어 단순 SSRF로는 자격증명에 닿지 못한다.
- `http_put_response_hop_limit` — 1~64, 기본값 `1`. 응답 패킷의 TTL이 된다. 컨테이너 안에서 메타데이터를 읽으려면 홉이 하나 더 필요해 `2` 로 올리는데, 올린 만큼 노출 범위가 넓어진다.

원문은 `metadata_options` 를 **언제든 적용·수정할 수 있다**고 명시한다. 교체 없이 제자리에서 바뀌므로 기존 인스턴스에 IMDSv2를 거는 작업은 위험도가 낮다.

## 블록 디바이스와 다섯 종류의 태그

**루트 볼륨은 `root_block_device` 로 조정한다.** 블록 하나만 쓸 수 있고 인수는 `volume_type`, `volume_size`, `iops`, `throughput`, `encrypted`, `kms_key_id`, `delete_on_termination`, `tags` 다. `delete_on_termination` 의 기본값은 `true` — 인스턴스가 죽으면 루트 디스크도 사라진다. 원문은 `encrypted` 와 `kms_key_id` 를 **"drift 감지를 하려면 반드시 설정해야 한다"** 고 적었고, 기존 인스턴스에서 **이 둘을 바꾸면 리소스가 교체**된다고 명시한다. "나중에 암호화를 켜자"는 계획은 인스턴스를 다시 만들겠다는 계획과 같다.

**추가 볼륨은 두 방식 중 하나다.** `ebs_block_device` 블록을 인스턴스 안에 쓰거나, `aws_ebs_volume` 을 따로 만들어 `aws_volume_attachment` 로 붙이거나. 원문의 경고는 단호하다. `ebs_block_device` 설정은 **리소스 생성 시점에만 적용**되고 기존 리소스의 변경은 Terraform이 자동으로 감지하지 못한다. 게다가 `ebs_block_device` 를 쓰면 Terraform은 그 인스턴스의 **루트가 아닌 EBS 블록 디바이스 전체를 자기가 관리한다고 간주**하고 그 밖에 붙은 볼륨을 drift로 취급한다. 그래서 한 인스턴스에 대해 `ebs_block_device` 와 외부의 `aws_ebs_volume` + `aws_volume_attachment` 를 **함께 쓸 수 없다.**

시큐리티 그룹 인라인 규칙과 같은 모양의 문제다 — 인라인 표현은 배타적이고 외부 리소스는 그 배타성을 깬다. 볼륨을 나중에 키우거나 인스턴스 교체 후에도 살려 둘 계획이 있다면 처음부터 별도 리소스로 간다.

태그는 이 리소스에서 유독 복잡하다. 원문이 다섯 종류를 구분해 둔다.

| 종류 | 붙는 대상 |
|---|---|
| `tags` | 인스턴스에만. 블록 디바이스에는 붙지 않는다 |
| provider `default_tags` | 인스턴스 **그리고** 블록 디바이스 |
| `volume_tags` | 생성 시점에 root/ebs 볼륨 전체 |
| `root_block_device.tags` | 루트 볼륨만 (`volume_tags` 와 충돌) |
| `ebs_block_device.tags` | 해당 볼륨만, 갱신 불가 (`volume_tags` 와 충돌) |

가장 자주 무는 것은 **`tags` 가 볼륨에 붙지 않는다**는 사실이다. 비용 할당 태그를 `tags` 에만 넣으면 EBS 비용이 태그 없이 남는다. `default_tags` 는 양쪽에 다 붙으므로 [10장](10-tags-basics.md)의 provider 기본 태그가 여기서 특히 값을 한다.

원문이 두 번 반복하는 경고도 있다 — **블록 디바이스 태그를 `aws_instance` 밖에서 관리한다면 `volume_tags` 를 쓰지 마라.** 같은 볼륨을 두고 두 리소스가 다투면서 리소스가 계속 순환한다. 반대로 `root_block_device.tags` 는 **인스턴스 생성 후 별도 API 호출로** 붙어서 `ec2:CreateAction` 조건을 쓰는 ABAC 정책이나 볼륨 태그를 요구하는 SCP를 만족시키지 못하므로, 그런 환경에서는 `volume_tags` 를 쓴다.

## 무엇이 교체를 유발하는가

인수를 바꿨을 때 일어나는 일은 세 등급이다. 원문이 명시한 것만 정리하면 이렇다.

**제자리 수정.** `tags`, `metadata_options`, `disable_api_termination`, `source_dest_check`, `vpc_security_group_ids`. 인스턴스는 계속 돈다.

**stop/start를 동반하는 수정.** `instance_type` 변경은 원문에 "stop/start를 유발한다"고 적혀 있다. `user_data` / `user_data_base64` 도 기본 설정에서는 stop/start다. `cpu_options` 의 `core_count`, `threads_per_core`, `nested_virtualization` 은 제자리 변경이지만 정지·재기동이 필요하고, `capacity_reservation_specification` 은 `stopped` 상태여야 수정된다. 무중단이 아니다.

**교체.** 원문이 직접 표시한 것은 `user_data_replace_on_change = true` 상태에서의 user data 변경, `root_block_device` 의 `encrypted`/`kms_key_id` 변경, `cpu_options.amd_sev_snp` 변경, `enclave_options.enabled` 변경, `enable_primary_ipv6` 를 켠 뒤 다시 끄는 경우, `launch_template` 지정 변경, `secondary_network_interface` 블록의 모든 인수, 그리고 deprecated된 `network_interface` 블록의 변경이다.

여기 없는 인수라도 교체될 수 있다. `ami`, `subnet_id`, `availability_zone` 처럼 인스턴스의 정체성에 해당하는 값이 대표적이다. 문서에 표기가 없다고 안심하지 말고 **plan에서 `# forces replacement` 주석을 확인하는 것**을 습관으로 만든다([14장](14-reading-resource-docs.md)).

T 계열이라면 `credit_specification` 을 알아 둔다. `cpu_credits` 는 `standard` 또는 `unlimited` 이고, 원문에 따르면 **T3는 기본이 `unlimited`, T2는 기본이 `standard`** 다. `unlimited` 는 크레딧이 떨어져도 성능을 유지하지만 초과분에 추가 요금이 붙는다. 이 블록은 **설정에 있을 때만 drift가 감지**되고, 지우면 기본값으로 돌아가는 것이 아니라 **단지 관리를 멈춘다.**

`timeouts` 기본값은 `create` 10분, `read` 15분, `update` 10분, `delete` 20분이다. Windows AMI처럼 부팅이 오래 걸리면 `create` 를 늘린다. import는 `terraform import aws_instance.web i-12345678` 이며, 다른 리전은 `i-12345678@eu-west-1` 로 쓴다([24장](../level2-intermediate/24-enhanced-region-support.md)).

## 흔한 실수

### ❌ 인라인 규칙과 별도 규칙 리소스를 섞는다

인라인 쪽이 그룹의 규칙 전체를 배타적으로 관리하므로 별도 리소스가 만든 규칙을 지운다.

```terraform
resource "aws_security_group" "web" {
  name   = "web"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.web.id # 인라인이 이 규칙을 지운다
  cidr_ipv4         = "10.0.0.0/8"
  from_port         = 22
  ip_protocol       = "tcp"
  to_port           = 22
}
```

```terraform
# ✅ 그룹은 껍데기만 두고 443도 별도 규칙 리소스로 옮긴다
resource "aws_security_group" "web" {
  name        = "web"
  description = "Web tier"
  vpc_id      = aws_vpc.main.id
}
```

### ❌ egress 규칙을 쓰지 않는다

Terraform은 AWS가 자동으로 붙이는 "모든 아웃바운드 허용" 규칙을 제거한다. ingress만 만든 그룹에 붙은 인스턴스는 패키지 설치도 SSM 연결도 하지 못한다.

```terraform
# ✅ 아웃바운드를 명시한다
resource "aws_vpc_security_group_egress_rule" "out" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
```

### ❌ 개인키를 Terraform이 만들게 한다

`private_key_pem` 은 state에 평문으로 남는다. state를 읽을 수 있는 모든 주체가 인스턴스 접속 권한을 갖는다.

```terraform
resource "tls_private_key" "this" { # private_key_pem 이 state에 남는다
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "this" {
  key_name   = "generated"
  public_key = tls_private_key.this.public_key_openssh
}
```

```terraform
# ✅ 키는 밖에서 만들고 공개키만 넘긴다. 더 나은 선택은 SSM Session Manager
resource "aws_key_pair" "deployer" {
  key_name   = "deployer"
  public_key = file("~/.ssh/id_ed25519.pub")
}
```

### ❌ `ebs_block_device` 와 `aws_volume_attachment` 를 함께 쓴다

`ebs_block_device` 를 쓰면 Terraform이 루트가 아닌 블록 디바이스 전체를 관리한다고 간주해 밖에서 붙인 볼륨을 drift로 본다.

```terraform
resource "aws_instance" "db" {
  ami           = var.ami_id
  instance_type = "m6i.large"

  ebs_block_device {
    device_name = "/dev/sdf"
    volume_size = 100
  }
}

resource "aws_volume_attachment" "extra" { # 이 볼륨이 drift로 잡힌다
  device_name = "/dev/sdg"
  volume_id   = aws_ebs_volume.extra.id
  instance_id = aws_instance.db.id
}
```

```terraform
# ✅ ebs_block_device 를 빼고 추가 볼륨은 전부 별도 리소스로 붙인다
resource "aws_instance" "db" {
  ami           = var.ami_id
  instance_type = "m6i.large"

  root_block_device {
    volume_type = "gp3"
    encrypted   = true
  }
}
```

## 프로덕션 노트

- **AMI 교체는 배포다.** 개별 리소스로 두는 한 이미지 갱신과 서비스 재시작은 같은 사건이다. "빌드 -> 검증 -> 변수 값 승격"을 별도 절차로 만들고 Terraform은 승격된 ID만 받게 한다.
- **규칙을 분리해야 보안 리뷰가 코드 리뷰가 된다.** 규칙 하나가 리소스 하나면 PR diff에 "22번 포트를 0.0.0.0/0에 연다"가 리소스 추가로 드러나지만, 인라인 블록에서는 리스트 안 한 줄로 묻힌다.
- **`iam:PassRole` 은 자주 빠지는 권한이다.** EC2 권한을 다 줘도 이것이 없으면 인스턴스 생성이 실패한다. 반대로 `Resource: "*"` 로 열어 두면 실행 롤이 어떤 롤이든 붙일 수 있다는 뜻이라 권한 상승 경로가 된다. 넘길 롤을 ARN 패턴으로 제한한다.
- **IMDSv2 전환은 두 단계로 한다.** CloudWatch의 `MetadataNoToken` 지표로 IMDSv1 사용을 먼저 확인한 뒤 `http_tokens = "required"` 를 건다. 교체 없이 제자리에서 바뀌므로 롤백도 apply 한 번이다.
- **볼륨 태그가 비용 보고서를 좌우한다.** `tags` 는 인스턴스에만 붙고 EBS는 별도로 청구되므로, `default_tags` 나 `volume_tags` 없이 운영하면 스토리지 비용이 미분류로 남는다.
- **destroy가 오래 매달려 있으면 시큐리티 그룹을 의심한다.** 대개 다른 리소스가 붙잡고 있는 그룹이며, `delete` 타임아웃을 짧게 줘 빨리 실패시키는 편이 원인을 드러낸다.

## 연습문제

**1. 두 방식이 부딪히는 것을 재현하기.** 시큐리티 그룹을 인라인 `ingress` 로 만들어 apply한 뒤, 같은 그룹에 `aws_vpc_security_group_ingress_rule` 로 규칙을 더해 plan/apply를 두 번 반복한다.
*성공 기준:* 규칙 하나가 반복해서 생성·삭제되는 것을 출력으로 보이고, 어느 쪽이 무엇을 지웠는지 리소스 주소 단위로 설명한다.

**2. 교체 경계 찾기.** 인스턴스 하나를 만든 뒤 `instance_type`, `tags`, `metadata_options.http_tokens`, `ami` 를 각각 따로 바꿔 `terraform plan` 을 돌린다.
*성공 기준:* 네 경우를 `~ update in-place` / `-/+ must be replaced` 로 분류한 표를 만들고 `# forces replacement` 주석이 어느 줄에 붙는지 인용한다.

**3. 볼륨 태그 추적하기.** provider `default_tags` 에 `Owner` 를 두고 인스턴스 `tags` 에는 `Name` 만 준 채 apply한 뒤, 인스턴스와 루트 볼륨의 태그를 AWS CLI로 각각 조회한다.
*성공 기준:* 루트 볼륨에 어떤 태그가 붙고 빠졌는지 확인하고, `volume_tags` 를 추가하면 결과가 어떻게 달라지는지 재현해 이유를 적는다.

## 요약

- v6부터 `aws_ami` 에 `most_recent = true` 를 쓰면 `owners` 또는 `image-id`/`owner-id` `filter` 가 **필수**다. AMI ID가 바뀌면 인스턴스는 교체된다.
- VPC 인스턴스는 `vpc_security_group_ids`(ID 리스트)를 쓴다. `security_groups`(이름 리스트)는 EC2-Classic과 기본 VPC 전용이다.
- 시큐리티 그룹 규칙은 **`aws_vpc_security_group_ingress_rule`/`egress_rule` 이 현재 권장**이며 인라인 `ingress`/`egress` 와 **섞으면 안 된다.** 인라인 블록이 배타적으로 관리하기 때문이다.
- Terraform은 AWS가 붙이는 기본 egress 허용 규칙을 **제거한다.** 아웃바운드가 필요하면 명시해야 한다.
- `aws_security_group` 의 `name`, `name_prefix`, `vpc_id`, `description` 은 모두 ForceNew다. `description` 은 수정 API 자체가 없으므로 분류 정보는 `tags` 에 두고, EIP를 붙였다면 `public_ip` 대신 EIP 주소를 참조한다.
- `aws_key_pair` 는 **공개키만** 다룬다. `iam_instance_profile` 은 롤 ARN이 아니라 프로파일 **이름**을 받고, 실행 자격증명에 `iam:PassRole` 이 필요하다. `metadata_options.http_tokens = "required"` 가 IMDSv2 강제이며 교체 없이 제자리에서 적용된다.
- `user_data` 변경은 기본적으로 stop/start이고 스크립트는 다시 실행되지 않는다. 새 스크립트를 돌리려면 `user_data_replace_on_change = true` 로 교체를 택해야 한다.
- `ebs_block_device` 는 루트가 아닌 블록 디바이스를 배타적으로 관리하므로 `aws_ebs_volume` + `aws_volume_attachment` 와 **함께 쓸 수 없다.**

## 다음으로

- [12장 — S3 버킷](12-s3-bucket.md) — 하나의 리소스가 여러 개로 쪼개진 또 하나의 사례. "인라인이냐 별도 리소스냐"라는 같은 문제다.
- [13장 — IAM 기초](13-iam-basics.md) — 인스턴스 프로파일이 감싸는 롤과 신뢰 정책을 만든다.
- [14장 — 리소스 문서 읽는 법](14-reading-resource-docs.md) — ForceNew·Optional·Timeouts·Import 표기를 해석하는 법.
- [28장 — Launch Template + ASG + ALB](../level2-intermediate/28-compute-asg-alb.md) — 자가 치유·무중단 교체·스케일링은 개별 인스턴스가 구조적으로 하지 못한다. 이 장의 인수들이 그대로 옮겨 간다.
- 공식 문서: [aws_instance](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance), [aws_security_group](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group)
