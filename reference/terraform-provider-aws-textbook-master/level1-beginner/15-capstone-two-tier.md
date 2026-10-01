---
chapter: 15
level: "Level 1 — 초급"
title: "초급 종합: 2-tier VPC 환경 처음부터 끝까지"
difficulty: 입문
reading_time: "35분"
prerequisites: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
source_docs:
  - "website/docs/r/nat_gateway.html.markdown"
  - "website/docs/r/route_table.html.markdown"
  - "website/docs/r/security_group.html.markdown"
  - "website/docs/r/vpc_security_group_ingress_rule.html.markdown"
  - "website/docs/r/instance.html.markdown"
  - "website/docs/r/s3_bucket_lifecycle_configuration.html.markdown"
  - "website/docs/r/iam_role.html.markdown"
  - "website/docs/d/iam_policy_document.html.markdown"
  - "website/docs/index.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs"
provider_baseline: "6.x"
---

# 15장 — 초급 종합: 2-tier VPC 환경 처음부터 끝까지

**이 장에서 배우는 것**

- 요구사항 문장을 리소스 목록으로 옮기고, 그 과정의 설계 판단을 근거와 함께 고른다.
- 루트 모듈 하나를 `versions.tf`부터 `outputs.tf`까지 일곱 파일로 나누는 기준을 세운다.
- 31개 리소스가 서로를 참조해 하나의 그래프를 이루는 모습을 전체 코드로 읽는다.
- plan 출력에서 리소스 개수, `known after apply`, 교체 표시를 골라 읽고 apply 전에 판단한다.
- apply 후 "동작한다"를 확인하는 검증 절차와 `destroy` 가 끝나는 조건을 안다.

**왜 중요한가**

앞의 14개 장은 리소스를 하나씩 다뤘다. 실무에서 터지는 곳은 개별 리소스가 아니라 **조립부**다. 서브넷은 만들었는데 라우팅 테이블 연결을 빠뜨려 인스턴스가 패키지 하나를 못 받는다. NAT Gateway를 프라이빗 서브넷에 붙여 아웃바운드가 통째로 죽는다. IAM 롤은 만들었는데 인스턴스 프로파일을 안 붙여 앱이 로그를 못 쓴다. 셋 다 apply는 성공한다.

비용도 조립부에서 샌다. NAT Gateway를 AZ마다 두는 관행을 생각 없이 따르면 개발 환경에서 인스턴스보다 비싸지고, 하나만 두면 그 AZ가 죽을 때 다른 AZ까지 인터넷을 잃는다. 코드가 아니라 **판단의 문제**다.

## 요구사항과 설계 판단

코드를 열기 전에 요구사항을 문장으로 고정한다. 건너뛰면 "일단 VPC부터"로 시작해 필요 없는 리소스를 만든다.

1. 사내 대역과 겹치지 않는 `10.0.0.0/16` 짜리 격리된 네트워크. AZ 2개에 걸친다.
2. 인터넷에서 닿아야 하는 것과 닿으면 안 되는 것을 네트워크 층에서 분리한다.
3. 프라이빗 쪽도 아웃바운드는 나가야 한다 — 패키지 설치, AWS API 호출.
4. 앱이 로그를 S3에 남긴다. 공개 금지, 실수 삭제 복구 가능, 오래된 로그는 자동 삭제.
5. 로그 쓰기 권한은 **키가 아니라 롤**로 주고, 모든 리소스에 프로젝트·환경 태그가 예외 없이 붙는다.

퍼블릭 서브넷에는 IGW 경로와 bastion·NAT가, 프라이빗 서브넷에는 앱 인스턴스가 들어가고 두 프라이빗 서브넷의 `0.0.0.0/0` 은 같은 NAT를 가리킨다. 앱은 롤로 로그 버킷의 `app/` 접두사에만 쓴다.

**AZ 2개인 이유.** AZ 1개면 서브넷을 나눌 이유가 없지만 RDS를 붙이는 순간 막힌다 — DB 서브넷 그룹과 ALB 모두 서로 다른 AZ 둘을 요구한다.

**NAT 1개인 이유.** 정석은 AZ마다 하나를 두는 것이다. 격리도 되고 AZ 간 전송 요금도 안 낸다. 대신 비용이 AZ 수만큼 곱해져 학습 환경에서는 정당화되지 않는다. 대가는 `azs[0]` 이 죽으면 두 프라이빗 서브넷 모두 아웃바운드를 잃는다는 것이다. 이 판단은 변수가 아니라 README로 남긴다.

**bastion을 쓰는 이유, 그리고 쓰지 않아야 할 이유.** bastion은 **시큐리티 그룹 참조를 보여 주는** 교육 장치다. 더 나은 답은 **SSM Session Manager**로, 22번 포트를 열지 않고 퍼블릭 IP·SSH 키 없이 셸에 들어가며 기록은 CloudTrail에 남는다. 새로 짓는 환경이라면 bastion을 만들지 않는다.

**`default_tags` 를 쓰는 이유.** 리소스 31개에 태그를 손으로 붙이면 몇 줄은 반드시 빠진다. `default_tags` 는 태그를 지원하는 리소스에 자동으로 내려간다 — 원문의 예외는 `aws_autoscaling_group` 하나다.

## 파일 구성

Terraform은 디렉터리의 모든 `.tf` 를 합쳐 읽으므로 파일 분리는 사람을 위한 것이다. 기준은 "고치는 빈도가 같은가"다 — `versions.tf`(분기), `variables.tf`(요구사항), `network.tf`(드묾), `storage.tf`(보존 정책), `iam.tf`(권한), `compute.tf`(가장 자주), `outputs.tf`(소비자).

## `versions.tf`

```terraform
terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
```

`~> 6.0` 은 6.x 안에서만 올라간다 — v5와 v6 사이에 리소스 제거를 포함한 파괴적 변경이 있으므로 메이저 고정은 타협하지 않는다. `region` 은 provider에 둔다. v6부터 리소스에도 top-level `region` 이 생겼지만 그것은 리소스별로 리전을 달리할 때 쓰는 도구이고, 값을 바꾸면 **교체**가 일어난다([24장](../level2-intermediate/24-enhanced-region-support.md)). `default_tags` 의 키와 같은 키를 리소스 `tags` 에 쓰면 리소스 쪽이 이긴다.

## `variables.tf`

```terraform
variable "project" {
  type    = string
  default = "tf-capstone" # S3 버킷 이름에 들어가므로 소문자·숫자·하이픈만
}

variable "environment" {
  type    = string
  default = "dev"

  validation {
    condition     = contains(["dev", "stage", "prod"], var.environment)
    error_message = "environment는 dev, stage, prod 중 하나여야 한다."
  }
}

variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "vpc_cidr" {
  description = "VPC의 IPv4 CIDR. 서브넷은 이 값에서 계산된다"
  type        = string
  default     = "10.0.0.0/16"
}

variable "admin_cidr" {
  description = "bastion 22번 포트에 허용할 단일 IPv4 CIDR. 내 공인 IP/32"
  type        = string

  validation {
    condition     = var.admin_cidr != "0.0.0.0/0"
    error_message = "admin_cidr에 0.0.0.0/0을 쓸 수 없다."
  }
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "key_name" {
  description = "기존 EC2 키페어 이름. null이면 붙이지 않는다"
  type        = string
  default     = null
}

variable "log_retention_days" {
  type    = number
  default = 365
}

locals {
  name_prefix = "${var.project}-${var.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)
}
```

**`admin_cidr` 에만 기본값이 없다.** 값을 주지 않으면 plan이 대화형으로 묻고 `-input=false` 인 CI에서는 실패한다 — 기본값을 두면 누군가는 그대로 apply하기 때문이다. `validation` 은 AWS API를 부르지 않고 plan 이전에 작동한다([7장](07-variables-outputs-locals.md)). 반대로 서브넷 CIDR과 AZ·NAT 개수는 일부러 변수로 빼지 않았다.

## `network.tf`

```terraform
data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${local.name_prefix}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${local.name_prefix}-igw" }
}

resource "aws_subnet" "public" {
  count = 2

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index) # 10.0.0.0/24, 10.0.1.0/24
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${local.name_prefix}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 100) # 10.0.100.0/24, ...
  availability_zone = local.azs[count.index]

  tags = { Name = "${local.name_prefix}-private-${count.index}" }
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags       = { Name = "${local.name_prefix}-nat-eip" }
  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id # 반드시 퍼블릭 서브넷

  tags       = { Name = "${local.name_prefix}-nat" }
  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name_prefix}-public-rt" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = { Name = "${local.name_prefix}-private-rt" }
}

resource "aws_route_table_association" "public" {
  count = 2

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count = 2

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
```

- `enable_dns_hostnames` 는 기본값이 `false` 다. 켜지 않으면 퍼블릭 DNS 이름이 붙지 않고 VPC 엔드포인트나 RDS의 프라이빗 DNS가 안 된다.
- 인라인 `route` 와 별도 리소스 `aws_route` 를 **같은 테이블에 섞으면 안 된다**(원문 명시). 로컬 경로는 AWS가 자동으로 넣으므로 선언하지 않는다. `gateway_id` 와 `nat_gateway_id` 를 바꿔 넣으면 **영구 diff**가 생긴다.
- `aws_route_table_association` 을 빠뜨리면 서브넷은 VPC **기본 라우팅 테이블**에 남고, 증상은 "퍼블릭 IP는 붙었는데 SSH가 타임아웃"이다. `aws_eip`·`aws_nat_gateway` 는 IGW를 참조하지 않아 순서를 모르므로 `depends_on` 을 걸었다([6장](06-references-and-dependencies.md)).

## `storage.tf`

```terraform
data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "logs" {
  bucket        = "${local.name_prefix}-logs-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.environment == "prod" ? false : true

  tags = { Name = "${local.name_prefix}-logs" }
}

resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "app-logs"
    status = "Enabled"

    filter {
      prefix = "app/"
    }

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    expiration {
      days = var.log_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  depends_on = [aws_s3_bucket_versioning.logs]
}
```

- 버킷 이름은 전역에서 유일해야 한다. `account_id` 를 붙이면 계정 안에서만 유일하면 되므로 `BucketAlreadyExists` 가 사라진다.
- `force_destroy` 가 없으면 `destroy` 가 `BucketNotEmpty` 로 실패하고, 프로덕션에서 켜져 있으면 실수 한 번에 로그가 사라진다. 함정이 하나 더 있다 — `true` 로 바꾼 뒤 **destroy 전에 apply를 한 번 성공시켜야** 효과가 생긴다.
- 네 부속 리소스가 별도인 이유는 v4에서 `aws_s3_bucket` 이 쪼개졌기 때문이다([12장](12-s3-bucket.md)). 거기 남은 `versioning`·`lifecycle_rule` 등과 `rule.prefix` 는 전부 Deprecated여서 `filter` 를 명시했다.
- **128KB 미만 객체는 기본적으로 전환되지 않고**, `noncurrent_version_expiration` 이 없으면 이전 버전이 영원히 쌓인다.

## `iam.tf`

```terraform
data "aws_iam_policy_document" "app_assume_role" {
  statement {
    sid     = "EC2AssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "${local.name_prefix}-app"
  assume_role_policy = data.aws_iam_policy_document.app_assume_role.json
}

data "aws_iam_policy_document" "app_logs" {
  statement {
    sid       = "WriteAppLogs"
    actions   = ["s3:PutObject", "s3:AbortMultipartUpload"]
    resources = ["${aws_s3_bucket.logs.arn}/app/*"]
  }

  statement {
    sid       = "ListOwnPrefixOnly"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.logs.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["app/*"]
    }
  }
}

resource "aws_iam_policy" "app_logs" {
  name   = "${local.name_prefix}-app-logs"
  policy = data.aws_iam_policy_document.app_logs.json
}

resource "aws_iam_role_policy_attachment" "app_logs" {
  role       = aws_iam_role.app.name
  policy_arn = aws_iam_policy.app_logs.arn
}

resource "aws_iam_instance_profile" "app" {
  name = "${local.name_prefix}-app"
  role = aws_iam_role.app.name
}
```

- `assume_role_policy` 는 "누가 이 롤이 될 수 있는가"라서 principal이 있고 권한 정책에는 없다. 원문은 여기에 `aws_iam_policy` 를 쓸 수 없다고 명시한다.
- `aws_iam_policy_document` 를 쓴 이유는 **버킷 ARN을 참조로 넣기 위해서**다. 두 statement의 `resources` 가 다른 것이 핵심이다 — `s3:PutObject` 는 **객체** 액션이라 `버킷ARN/app/*` 가, `s3:ListBucket` 은 **버킷** 액션이라 접두사 없는 ARN이 필요하다.
- EC2 API는 롤을 직접 붙이지 못한다. `iam_instance_profile` 은 **프로파일 이름**을 받고 apply 자격증명에 `iam:PassRole` 이 필요하다. `aws_iam_policy_attachment` 는 계정 전체의 연결을 배타적으로 소유하므로 쓰지 않았다.

## `compute.tf`

```terraform
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"] # v6부터 owners 또는 image-id/owner-id 필터가 필수

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
}

resource "aws_security_group" "bastion" {
  name_prefix = "${local.name_prefix}-bastion-"
  description = "Bastion host access"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name_prefix}-bastion" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "app" {
  name_prefix = "${local.name_prefix}-app-"
  description = "Application tier access"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name_prefix}-app" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "bastion_ssh" {
  security_group_id = aws_security_group.bastion.id

  cidr_ipv4   = var.admin_cidr
  from_port   = 22
  to_port     = 22
  ip_protocol = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "bastion_all" {
  security_group_id = aws_security_group.bastion.id

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1" # -1이면 포트를 쓰지 않는다
}

resource "aws_vpc_security_group_ingress_rule" "app_ssh_from_bastion" {
  security_group_id = aws_security_group.app.id

  referenced_security_group_id = aws_security_group.bastion.id
  from_port                    = 22
  to_port                      = 22
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"
}

resource "aws_instance" "bastion" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  associate_public_ip_address = true
  key_name                    = var.key_name

  metadata_options {
    http_tokens = "required" # IMDSv2 강제
  }

  root_block_device {
    volume_type = "gp3"
    encrypted   = true
  }

  tags = { Name = "${local.name_prefix}-bastion" }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.private[0].id
  vpc_security_group_ids = [aws_security_group.app.id]
  key_name               = var.key_name
  iam_instance_profile   = aws_iam_instance_profile.app.name

  user_data = <<-EOT
    #!/bin/bash
    set -euo pipefail
    echo "LOG_BUCKET=${aws_s3_bucket.logs.bucket}" > /etc/app.env
  EOT

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  tags = { Name = "${local.name_prefix}-app" }

  # NAT 경로가 준비되기 전에 부팅하면 user_data의 네트워크 작업이 실패한다
  depends_on = [aws_route_table_association.private]
}
```

- `aws_ami` 의 `owners` 는 v6부터 **필수**다(또는 `image-id`/`owner-id` 필터). 반대 함정도 있다 — `most_recent = true` 는 새 이미지가 나오면 **다음 plan에 인스턴스 교체가 뜬다.**
- `name` 과 `description` 은 **ForceNew**여서 이름이 고정돼 있으면 교체 시 충돌로 실패한다. `name_prefix` + `create_before_destroy` 가 이 문제를 푼다([21장](../level2-intermediate/21-lifecycle-meta-arguments.md)).
- 규칙은 전부 별도 리소스로 썼다. 인라인과 섞으면 규칙 충돌·영구 diff·덮어쓰기가 일어난다(원문 경고). egress를 명시한 이유는 AWS가 넣는 전체 허용 egress를 **Terraform이 제거하기 때문**이다. 증상은 "dnf가 멈춘다"로 나타난다.
- app 규칙의 소스가 `referenced_security_group_id` 인 것이 핵심 패턴이다. bastion을 교체해도 늘려도 규칙은 그대로다. 원문은 네 가지 소스 인수 중 **하나는 반드시** 있어야 하고, `ip_protocol` 이 `-1` 이 아니면 포트가 필요하다고 적는다.

## `outputs.tf`

```terraform
output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "nat_public_ip" {
  value = aws_nat_gateway.main.public_ip # 프라이빗 서브넷의 아웃바운드 출발지
}

output "logs_bucket" {
  value = aws_s3_bucket.logs.bucket
}

output "bastion_public_ip" {
  value = aws_instance.bastion.public_ip
}
```

출력은 "다음에 무엇을 할 것인가"에서 역산한다. `nat_public_ip` 는 외부 파트너가 우리 출발지 IP를 방화벽에 등록해 달라고 요구할 때 쓴다.

## plan을 읽는 법

```console
$ terraform init      # provider 설치 + .terraform.lock.hcl 생성(반드시 커밋)
$ terraform validate  # AWS를 부르지 않는다. 문법·참조·타입만 본다
$ terraform plan -var 'admin_cidr=203.0.113.42/32' -out=tfplan
```

`validate` 는 AWS API를 부르지 않으므로 존재하지 않는 AMI를 걸어도 통과한다. 대신 `count` 가 붙은 리소스를 인덱스 없이 참조하면 여기서 잡힌다. plan 출력은 **세 곳만 먼저 본다.**

**첫째, 맨 아래 한 줄.** `Plan: 31 to add, 0 to change, 0 to destroy.` 숫자가 예상과 다르면 그 자리에서 멈춘다. 31개는 `network.tf` 14개, `storage.tf` 5개, `iam.tf` 4개, `compute.tf` 8개다. 데이터 소스 5개는 이 숫자에 없다.

**둘째, `(known after apply)` 가 붙은 자리.**

```console
  # aws_subnet.public[0] will be created
  + resource "aws_subnet" "public" {
      + availability_zone       = "ap-northeast-2a"
      + cidr_block              = "10.0.0.0/24"
      + id                      = (known after apply)
      + map_public_ip_on_launch = true
      + tags_all                = {   # default_tags가 실제로 먹었는지 확인하는 자리
          + "Environment" = "dev"
          + "ManagedBy"   = "terraform"
          + "Project"     = "tf-capstone"
        }
      + vpc_id                  = (known after apply)
    }
```

`(known after apply)` 는 **AWS가 정해 주는 값**이다. VPC가 아직 없으므로 `vpc_id` 가 여기 있는 것도 정상이다. 진짜로 읽을 것은 반대쪽 — **알려진 값이 예상과 같은가**다. `cidr_block` 이 맞는가, 서브넷 쌍의 AZ가 짝이 맞는가, `tags_all` 에 `default_tags` 가 들어왔는가.

**셋째, `-/+` 와 `+/-` 표시.** `-/+` 는 교체, `+/-` 는 `create_before_destroy` 가 걸린 교체이며 이유는 `# forces replacement` 로 표시된다. 인스턴스에 이 표시가 뜨면 apply를 멈춘다([14장](14-reading-resource-docs.md)). `-out` 으로 저장하는 이유는 **읽은 것과 실행할 것을 같게** 하기 위해서다.

## apply · 검증 · destroy

```console
$ terraform apply tfplan
aws_vpc.main: Creating...          # 참조가 없는 셋은 동시에 시작한다
aws_s3_bucket.logs: Creating...
aws_iam_role.app: Creating...
aws_nat_gateway.main: Still creating... [1m30s elapsed]
Apply complete! Resources: 31 added, 0 changed, 0 destroyed.
```

VPC·버킷·IAM 롤이 **동시에** 시작된다 — 서로 참조가 없어 그래프상 병렬이다. NAT Gateway는 1~2분이 걸린다(create 타임아웃 기본값 10분). apply 성공은 **API가 요청을 받아들였다**는 뜻일 뿐이다.

```console
# 앱 인스턴스 안에서
$ curl -sS -o /dev/null -w '%{http_code}\n' https://aws.amazon.com  # 1. NAT 경로
$ aws sts get-caller-identity          # 2. 롤 — Arn이 assumed-role/...-app/...
$ echo hi | aws s3 cp - s3://BUCKET/app/test.txt     # 3. 허용된 쓰기
$ echo no | aws s3 cp - s3://BUCKET/other/test.txt   # 4. AccessDenied가 정상
```

4번이 3번보다 중요하다. 권한은 "되는 것"보다 "안 되는 것"을 확인해야 최소 권한이 최소인지 알 수 있다. 마지막으로 `terraform plan` 을 한 번 더 돌려 `No changes.` 가 나오는지 본다 — diff가 뜨면 **영구 diff**다.

`destroy` 에서 막히는 곳은 둘이다. **S3 버킷** — 객체가 남아 있으면 `BucketNotEmpty` 로 실패한다. **NAT Gateway** — delete 타임아웃 기본값이 30분으로 create(10분)보다 길고, 수 분간 멈춰 있는 것이 정상이다.

## 흔한 실수

### ❌ NAT Gateway를 프라이빗 서브넷에 만든다

NAT Gateway는 **자신이 인터넷으로 나갈 수 있어야** 하므로 IGW 경로가 있는 퍼블릭 서브넷에 둔다. 아래는 apply는 성공하지만 트래픽이 나가지 못한다.

```terraform
subnet_id = aws_subnet.private[0].id
```

```terraform
# ✅ NAT는 퍼블릭 서브넷에 두고, 그것을 쓰는 경로만 프라이빗 라우팅 테이블에 넣는다
subnet_id  = aws_subnet.public[0].id
depends_on = [aws_internet_gateway.main]
```

### ❌ 라우팅 테이블만 만들고 연결을 빠뜨린다

`aws_route_table` 만 선언하고 끝내면 서브넷은 VPC 기본 라우팅 테이블에 남는다. plan은 깨끗한데 퍼블릭 IP가 붙은 인스턴스에 SSH가 타임아웃된다.

```terraform
# ✅ 연결 리소스가 있어야 서브넷이 그 테이블을 쓴다
resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
```

### ❌ 인라인 `ingress` 와 별도 규칙 리소스를 섞는다

인라인 블록은 그 그룹의 규칙 전체를 배타적으로 소유하므로, 아래 두 리소스는 매 apply마다 서로를 지운다.

```terraform
resource "aws_security_group" "app" {
  vpc_id = aws_vpc.main.id

  ingress { # 인라인 — 이 그룹의 규칙 전체를 소유한다
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "extra" { # 충돌한다
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "10.0.0.0/16"
  from_port         = 8080
  to_port           = 8080
  ip_protocol       = "tcp"
}
```

```terraform
# ✅ 인라인 블록을 지우고 규칙을 전부 별도 리소스로 옮긴다
resource "aws_security_group" "app" {
  name_prefix = "app-"
  description = "Application tier access"
  vpc_id      = aws_vpc.main.id
}
```

### ❌ 앱 시큐리티 그룹의 소스를 bastion의 IP로 적는다

동작은 한다. 그러나 bastion을 교체하거나 늘리면 매번 고쳐야 하고, `private_ip` 는 `known after apply` 라 plan에서 규칙을 미리 볼 수도 없다.

```terraform
cidr_ipv4 = "${aws_instance.bastion.private_ip}/32"
```

```terraform
# ✅ IP가 아니라 시큐리티 그룹 자체를 소스로 지정한다
referenced_security_group_id = aws_security_group.bastion.id
```

## 프로덕션 노트

- **NAT 다중화보다 VPC 엔드포인트를 먼저 검토한다.** S3와 DynamoDB는 Gateway 엔드포인트가 무료여서, 로그 트래픽이 NAT를 안 거치면 처리 데이터 요금이 통째로 사라진다.
- **bastion을 SSM으로 대체한다.** bastion 인스턴스, 키페어 관리, `admin_cidr` 갱신이 전부 사라진다.
- **state를 원격으로 옮기는 것이 두 번째 작업이다.** 로컬 state에는 IP·태그·버킷 이름이 평문으로 있고, 동시 apply는 서로를 덮어쓴다([16장](../level2-intermediate/16-remote-state-and-backends.md)).
- **AMI의 `most_recent` 는 프로덕션에서 위험하다.** AMI ID를 변수나 SSM Parameter로 고정한다. 비용은 apply 순간이 아니라 시간당 붙는다 — NAT Gateway, 연결되지 않은 EIP, EBS 볼륨이 상시 과금 항목이다.
- **`force_destroy` 는 환경으로 가르고, `count` 는 순서에 민감하다.** 인덱스가 정체성이므로 AZ를 중간에 끼워 넣으면 그 뒤 서브넷이 전부 교체된다([17장](../level2-intermediate/17-count-foreach-dynamic.md)).

## 연습문제

1. **NAT를 AZ마다 하나씩으로 바꿔라.** `aws_eip`·`aws_nat_gateway`·`aws_route_table` 을 각각 2개로 만들고 두 프라이빗 서브넷이 서로 다른 NAT를 보게 한다. *성공 기준:* plan이 새 리소스 3개와 기존 연결 변경만 보여 주고 서브넷·인스턴스에 교체 표시가 없으며, apply 후 두 인스턴스가 서로 다른 공인 IP로 나간다.

2. **bastion을 없애고 SSM Session Manager로 접속하라.** bastion 인스턴스·시큐리티 그룹·`admin_cidr` 을 제거하고 앱 롤에 SSM 접속용 관리형 정책을 붙인다. *성공 기준:* 22번 포트를 여는 규칙이 하나도 없고, 퍼블릭 IP 없는 인스턴스에 셸이 열리며, `terraform plan` 이 비어 있다.

3. **S3 Gateway 엔드포인트를 추가하고 환경을 dev/prod로 나눠라.** `aws_vpc_endpoint` 를 Gateway 타입으로 프라이빗 라우팅 테이블에 연결하고, 디렉터리를 분리해 `terraform.tfvars` 로 값을 달리 준다. *성공 기준:* S3 업로드가 여전히 성공하고 NAT를 통한 S3 트래픽이 사라졌으며, prod의 plan에서 `force_destroy` 가 `false` 로 나온다.

## 요약

- 요구사항을 문장으로 먼저 고정하면 리소스 목록과 설계 판단이 따라 나온다. AZ 2개는 다음 단계를 막지 않기 위한 최소치이고 NAT 1개는 의도적 비용 절충이다. bastion의 세 역할은 SSM Session Manager가 전부 대체한다.
- 변수는 환경마다 실제로 달라지는 값에만 쓰고, `admin_cidr` 처럼 기본값을 두면 안 되는 것은 비운 채 `validation` 으로 막는다. 라우팅은 테이블·경로·`aws_route_table_association` 세 조각이 다 있어야 완성되며, 연결을 빠뜨리면 apply는 조용히 성공한다.
- 시큐리티 그룹 규칙은 별도 리소스로 통일한다. 인라인과 섞으면 영구 diff가 생기고, Terraform이 기본 전체 허용 egress를 제거하므로 아웃바운드는 직접 만든다. 앱 계층의 소스는 `referenced_security_group_id` 다.
- S3 로그 버킷은 리소스 다섯 개다. IAM에서 객체 액션과 버킷 액션의 ARN 형태는 다르고, EC2에는 롤이 아니라 인스턴스 프로파일의 **이름**을 붙인다.
- plan은 세 곳을 본다: 리소스 개수(`31 to add`), `known after apply` 가 **아닌** 값이 예상과 같은지, `-/+` 교체 표시. `-out` 으로 저장해 읽은 것과 실행할 것을 맞춘다.
- apply 성공은 API가 요청을 받았다는 뜻일 뿐이다. 아웃바운드·롤·허용된 쓰기·거부되어야 할 쓰기를 직접 확인하고, 직후 `terraform plan` 이 비어 있는지로 영구 diff를 검사한다.

## 다음으로

- [16장 — 원격 State와 백엔드](../level2-intermediate/16-remote-state-and-backends.md) — 로컬 state를 S3와 잠금으로 옮긴다.
- [17장 — count · for_each · dynamic](../level2-intermediate/17-count-foreach-dynamic.md) — 서브넷과 라우팅 연결을 접고 `count` 인덱스가 만드는 교체 사고를 피한다.
- [19장 — 모듈](../level2-intermediate/19-modules.md) — 이 루트 모듈을 network/compute 모듈로 쪼갠다.
- [27장 — VPC 네트워킹 실전](../level2-intermediate/27-vpc-networking.md) — NAT 다중화, VPC 엔드포인트, 피어링.
- [Terraform AWS Provider 공식 문서](https://registry.terraform.io/providers/hashicorp/aws/latest/docs) — 이 장에서 쓴 리소스의 인수·속성 원본.
