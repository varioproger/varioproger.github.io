---
appendix: F
title: "학습 경로와 다음 단계"
kind: reference
source_docs:
  - "docs/index.md"
  - "docs/faq.md"
  - "docs/core-services.md"
  - "ROADMAP.md"
  - "website/docs/guides/using-aws-with-awscc-provider.html.markdown"
provider_baseline: "6.x"
---

# 부록 F — 학습 경로와 다음 단계

50개 장을 1장부터 순서대로 읽는 것은 가장 안전하지만 가장 빠른 길은 아니다. "다음 주까지 VPC를 만들어야 하는 사람"과 "팀의 Terraform 표준을 정해야 하는 사람"은 읽을 순서가 다르다. 이 부록은 **어디서 시작해 어디로 갈지**를 다섯 가지 역할, 상황별 색인, 30일 계획, 다섯 개의 실습 프로젝트로 정리한다.

## 이 교재의 구조

| 레벨 | 장 | 무엇을 다루는가 | 끝내면 할 수 있는 것 |
|---|---|---|---|
| Level 1 — 초급 | 1~15 | 문법, provider 설정, 첫 리소스, state, 태그, 문서 읽는 법 | 혼자서 VPC·EC2·S3·IAM을 코드로 만들고 지운다 |
| Level 2 — 중급 | 16~33 | 원격 state, 반복, 모듈, import, lifecycle, 멀티 계정, 서비스별 실전 | 팀에서 쓸 코드를 쓰고 기존 인프라를 코드화한다 |
| Level 3 — 고급 | 34~50 | provider 내부, 성능, 디버깅, 기여, 운영 표준 | 원인을 provider 층까지 추적하고 조직 표준을 설계한다 |
| 부록 | A~F | 인수·환경 변수·리소스·파괴적 변경·용어·학습 경로 | 필요할 때 찾아본다 |

부록은 처음부터 읽는 문서가 아니다. [A](a-provider-arguments.md)·[B](b-environment-variables.md)는 provider 설정이 이상할 때, [C](c-resource-catalog.md)는 리소스 이름이 생각나지 않을 때, [D](d-v6-breaking-changes.md)는 업그레이드할 때, [E](e-glossary.md)는 모르는 단어를 만났을 때 연다.

## 역할별 학습 경로

### (a) Terraform을 처음 접하는 개발자

AWS 콘솔은 써 봤고 코드는 쓸 줄 알지만 IaC는 처음인 경우다. 목표는 "손으로 만들던 것을 코드로 만들 수 있다"이다.

**순서**

1. [1장 — Terraform과 AWS Provider](../level1-beginner/01-what-is-terraform-aws-provider.md) · [2장 — 설치와 첫 실행](../level1-beginner/02-install-and-first-run.md)
2. [3장 — HCL 문법](../level1-beginner/03-hcl-basics.md) · [4장 — provider 블록과 자격증명](../level1-beginner/04-provider-block-and-auth.md)
3. [5장 — 첫 리소스: VPC](../level1-beginner/05-first-resource-vpc.md) · [6장 — 참조와 의존성](../level1-beginner/06-references-and-dependencies.md)
4. [9장 — State 입문](../level1-beginner/09-state-basics.md) — **여기서 한 번 멈춘다.** state를 모른 채 진도를 나가면 뒤의 모든 것이 마술처럼 보인다.
5. [7장 — 변수·출력·로컬](../level1-beginner/07-variables-outputs-locals.md) · [8장 — 데이터 소스](../level1-beginner/08-data-sources.md)
6. [11장 — EC2 인스턴스](../level1-beginner/11-ec2-instance.md) · [12장 — S3 버킷](../level1-beginner/12-s3-bucket.md) · [13장 — IAM 기초](../level1-beginner/13-iam-basics.md)
7. [10장 — 태그 기초](../level1-beginner/10-tags-basics.md) · [14장 — 리소스 문서 읽는 법](../level1-beginner/14-reading-resource-docs.md)
8. [15장 — 초급 종합](../level1-beginner/15-capstone-two-tier.md)

**예상 소요 시간** — 하루 1~2시간 기준 **3주**. 읽는 시간보다 apply·destroy 하는 시간이 더 걸린다.

**완료 기준** — 빈 디렉터리에서 VPC·서브넷·IGW·라우팅·시큐리티 그룹·EC2·S3를 만들고, destroy 하고, 다시 apply 해서 같은 결과를 얻는다. 그리고 **state가 무엇인지 두 문장으로 설명할 수 있다.**

### (b) 다른 IaC에서 넘어온 사람 (CloudFormation / CDK / Ansible)

"인프라를 코드로"는 몸에 배어 있고 AWS도 안다. 문제는 도구의 모델이 다르다는 것이므로 **차이가 나는 곳**만 먼저 본다.

**먼저 알아야 할 차이 셋** — (1) CloudFormation은 스택 상태를 AWS가 들고 있지만 Terraform은 **state 파일**을 우리가 들고 있어야 한다. 백엔드·잠금·drift가 전부 여기서 나온다. (2) CDK·Pulumi 같은 범용 언어가 아니라 **선언적 HCL**이다. 반복은 `count`·`for_each`, 조건은 삼항 연산자와 `dynamic` 이다. (3) Ansible의 "순서대로 실행"이 아니라 **의존성 그래프**로 순서가 정해지므로 `depends_on` 을 남발하면 병렬성을 잃는다.

**순서**

1. [1장](../level1-beginner/01-what-is-terraform-aws-provider.md)(빠르게 훑기) → [3장 — HCL 문법](../level1-beginner/03-hcl-basics.md) → [9장 — State 입문](../level1-beginner/09-state-basics.md)
2. [6장 — 참조와 의존성](../level1-beginner/06-references-and-dependencies.md) · [14장 — 리소스 문서 읽는 법](../level1-beginner/14-reading-resource-docs.md)
3. [17장 — count · for_each · dynamic](../level2-intermediate/17-count-foreach-dynamic.md) · [18장 — 표현식과 내장 함수](../level2-intermediate/18-expressions-and-functions.md)
4. [16장 — 원격 State와 백엔드](../level2-intermediate/16-remote-state-and-backends.md) · [19장 — 모듈](../level2-intermediate/19-modules.md)
5. [20장 — Import와 Resource Identity](../level2-intermediate/20-import-and-resource-identity.md) — 기존 스택을 옮겨 올 때 반드시 필요하다
6. [21장 — lifecycle](../level2-intermediate/21-lifecycle-meta-arguments.md) · [22장 — moved · removed](../level2-intermediate/22-moved-removed-refactoring.md)
7. 담당 서비스에 해당하는 27~32장을 골라 읽는다

**예상 소요 시간** — **10~12일**. Level 1의 5·11·12·13장은 예제만 훑고 넘어가도 된다.

**완료 기준** — 기존 CloudFormation 스택 하나를 Terraform 코드로 옮기고 `terraform plan` 이 "변경 없음"을 출력한다. 즉 **실물을 바꾸지 않고 소유권만 옮기는 데 성공한다.**

### (c) Terraform은 쓰지만 AWS Provider를 깊게 모르는 사람

`terraform apply` 는 매일 하지만 `tags_all` 이 왜 diff에 뜨는지, `region` 인수가 무엇인지는 설명하지 못하는 경우다. **가장 짧게 읽을 수 있는 경로**다.

**순서**

1. [4장 — provider 블록과 자격증명](../level1-beginner/04-provider-block-and-auth.md) · [부록 A](a-provider-arguments.md) · [부록 B](b-environment-variables.md)
2. [10장 — 태그 기초](../level1-beginner/10-tags-basics.md) · [23장 — 태깅 전략 심화](../level2-intermediate/23-tagging-strategy.md)
3. [24장 — Enhanced Region Support](../level2-intermediate/24-enhanced-region-support.md) — v6에서 가장 크게 바뀐 지점
4. [14장 — 리소스 문서 읽는 법](../level1-beginner/14-reading-resource-docs.md) · [21장 — lifecycle](../level2-intermediate/21-lifecycle-meta-arguments.md)
5. [12장 — S3 버킷](../level1-beginner/12-s3-bucket.md) · [35장 — 관계 리소스](../level3-advanced/35-relationship-resources.md) — provider가 리소스를 쪼개는 방식
6. [26장 — ephemeral 리소스](../level2-intermediate/26-secrets-and-ephemeral.md) · [37장 — List Resource](../level3-advanced/37-list-resources-and-query.md) — 최근에 생긴 것들
7. [36장 — Drift · refresh · check](../level3-advanced/36-drift-refresh-and-checks.md) · [39장 — 버전 업그레이드](../level3-advanced/39-version-upgrades.md) · [부록 D](d-v6-breaking-changes.md)
8. [41장 — 디버깅](../level3-advanced/41-debugging.md) · [42장 — Provider 아키텍처](../level3-advanced/42-provider-architecture.md)

**예상 소요 시간** — **2주**. 아는 개념은 건너뛰고 표와 "흔한 실수" 절만 봐도 된다.

**완료 기준** — 자기 팀의 코드베이스에서 (1) `default_tags` 와 개별 `tags` 가 충돌하는 곳, (2) v6에서 깨질 인수, (3) 영구 diff가 나는 리소스를 각각 하나 이상 찾아내고 고친다.

### (d) 플랫폼 / SRE 팀

여러 팀이 쓸 기반과 규칙을 만드는 입장이다. 개별 리소스보다 **경계·표준·자동화**가 관심사다.

**순서**

1. [16장 — 원격 State와 백엔드](../level2-intermediate/16-remote-state-and-backends.md) — state 경계가 곧 조직 경계다
2. [19장 — 모듈](../level2-intermediate/19-modules.md) · [22장 — moved · removed](../level2-intermediate/22-moved-removed-refactoring.md) — 남이 쓰는 모듈은 리팩터링 비용이 다르다
3. [25장 — 멀티 계정](../level2-intermediate/25-multi-account.md) · [24장 — Enhanced Region Support](../level2-intermediate/24-enhanced-region-support.md)
4. [23장 — 태깅 전략 심화](../level2-intermediate/23-tagging-strategy.md) — 비용 배분과 감사의 출발점
5. [38장 — 대규모 코드 구조와 CI/CD](../level3-advanced/38-large-scale-structure-cicd.md)
6. [40장 — 성능과 스로틀링](../level3-advanced/40-performance-and-throttling.md) · [36장 — Drift · refresh · check](../level3-advanced/36-drift-refresh-and-checks.md)
7. [39장 — 버전 업그레이드](../level3-advanced/39-version-upgrades.md) · [부록 D](d-v6-breaking-changes.md) — 업그레이드는 플랫폼 팀의 일이다
8. [26장 — 시크릿](../level2-intermediate/26-secrets-and-ephemeral.md) · [50장 — 프로덕션 운영 종합](../level3-advanced/50-production-operations.md)

**예상 소요 시간** — **3~4주**. 각 장의 "프로덕션 노트"를 팀 규칙 초안으로 옮겨 적으면서 읽는다.

**완료 기준** — 네 가지 문서가 실제로 존재한다. (1) state 분할 기준과 백엔드 규칙, (2) 필수 태그 목록과 강제 방법, (3) CI 파이프라인과 승인 게이트, (4) provider 업그레이드 주기와 절차서.

### (e) provider에 기여하려는 사람

버그를 고치거나 인수를 추가하거나 새 리소스를 만들려는 경우다. **사용자 관점을 먼저 갖춘 뒤에** 들어가야 한다 — 리소스 API 설계는 "AWS API가 이렇게 생겼으니까"가 아니라 "사용자가 이렇게 쓸 테니까"로 정해지기 때문이다.

**선행 조건** — Level 1 전체와 14·17·19·20·21장을 이미 이해하고 있어야 한다.

**순서**

1. [42장 — Provider 아키텍처](../level3-advanced/42-provider-architecture.md) — SDKv2와 Plugin Framework가 mux로 함께 서빙되는 구조
2. [43장 — 개발 환경과 skaff](../level3-advanced/43-dev-environment-and-skaff.md) — 직접 빌드해서 로컬 Terraform에 붙인다
3. [41장 — 디버깅](../level3-advanced/41-debugging.md) — 남의 코드에서 원인을 찾는 법
4. [44장 — 리소스 구현하기](../level3-advanced/44-implementing-a-resource.md) · [45장 — 에러·재시도·Waiter](../level3-advanced/45-errors-retries-waiters.md)
5. [46장 — 태깅 구현](../level3-advanced/46-implementing-tagging.md) · [47장 — 테스트](../level3-advanced/47-testing.md)
6. [48장 — 기여 프로세스](../level3-advanced/48-contributing.md) · [49장 — 설계 결정에서 배우기](../level3-advanced/49-design-decisions.md)
7. [35장 — 관계 리소스](../level3-advanced/35-relationship-resources.md) · [37장 — List Resource](../level3-advanced/37-list-resources-and-query.md) — 최신 설계 패턴

**예상 소요 시간** — **4~6주**. Go 경험이 없으면 더 걸린다.

**완료 기준** — `good-first-issue` 라벨이 붙은 이슈를 골라 (1) 로컬 재현, (2) 수정, (3) acceptance test 추가, (4) changelog 작성, (5) PR 등록까지 간다. 머지 여부가 아니라 **다섯 단계를 스스로 끝내는 것**이 기준이다.

## 주제별 색인 — "지금 이 문제가 있다"

| 상황 | 먼저 | 그다음 |
|---|---|---|
| S3 버킷을 다뤄야 한다 | [12장](../level1-beginner/12-s3-bucket.md) | [부록 D](d-v6-breaking-changes.md) · [35장](../level3-advanced/35-relationship-resources.md) |
| 멀티 계정을 구성해야 한다 | [25장](../level2-intermediate/25-multi-account.md) | [4장](../level1-beginner/04-provider-block-and-auth.md) · [부록 A](a-provider-arguments.md) |
| provider를 업그레이드해야 한다 | [39장](../level3-advanced/39-version-upgrades.md) | [부록 D](d-v6-breaking-changes.md) |
| 영구 diff를 없애야 한다 | [36장](../level3-advanced/36-drift-refresh-and-checks.md) | [21장](../level2-intermediate/21-lifecycle-meta-arguments.md) · [23장](../level2-intermediate/23-tagging-strategy.md) |
| 기존 인프라를 코드화해야 한다 | [20장](../level2-intermediate/20-import-and-resource-identity.md) | [37장](../level3-advanced/37-list-resources-and-query.md) · [8장](../level1-beginner/08-data-sources.md) |
| 여러 리전에 같은 것을 만들어야 한다 | [24장](../level2-intermediate/24-enhanced-region-support.md) | [17장](../level2-intermediate/17-count-foreach-dynamic.md) · [19장](../level2-intermediate/19-modules.md) |
| 비밀번호가 state에 남는다 | [26장](../level2-intermediate/26-secrets-and-ephemeral.md) | [16장](../level2-intermediate/16-remote-state-and-backends.md) |
| plan이 너무 느리다 | [40장](../level3-advanced/40-performance-and-throttling.md) | [38장](../level3-advanced/38-large-scale-structure-cicd.md) · [16장](../level2-intermediate/16-remote-state-and-backends.md) |
| 에러 메시지를 못 읽겠다 | [41장](../level3-advanced/41-debugging.md) | [45장](../level3-advanced/45-errors-retries-waiters.md) · [14장](../level1-beginner/14-reading-resource-docs.md) |
| apply가 리소스를 교체하려 한다 | [14장](../level1-beginner/14-reading-resource-docs.md) | [21장](../level2-intermediate/21-lifecycle-meta-arguments.md) · [부록 D](d-v6-breaking-changes.md) |
| ARN을 문자열로 조립하고 있다 | [33장](../level2-intermediate/33-provider-functions-and-policies.md) | [13장](../level1-beginner/13-iam-basics.md) |
| 코드가 복붙으로 불어났다 | [19장](../level2-intermediate/19-modules.md) | [17장](../level2-intermediate/17-count-foreach-dynamic.md) · [22장](../level2-intermediate/22-moved-removed-refactoring.md) |
| 리소스 이름이 뭔지 모르겠다 | [부록 C](c-resource-catalog.md) | [14장](../level1-beginner/14-reading-resource-docs.md) |
| 로컬은 되는데 CI에서 안 된다 | [부록 B](b-environment-variables.md) | [4장](../level1-beginner/04-provider-block-and-auth.md) · [38장](../level3-advanced/38-large-scale-structure-cicd.md) |
| LocalStack·사설 엔드포인트에 붙여야 한다 | [34장](../level3-advanced/34-provider-configuration-deep.md) | [부록 A](a-provider-arguments.md) |
| 컨테이너 워크로드를 올려야 한다 | [29장](../level2-intermediate/29-containers-ecs-eks.md) | [13장](../level1-beginner/13-iam-basics.md) · [28장](../level2-intermediate/28-compute-asg-alb.md) |
| DB를 코드로 관리하는 게 무섭다 | [31장](../level2-intermediate/31-databases-rds-dynamodb.md) | [21장](../level2-intermediate/21-lifecycle-meta-arguments.md) |
| 팀 표준을 정해야 한다 | [50장](../level3-advanced/50-production-operations.md) | [38장](../level3-advanced/38-large-scale-structure-cicd.md) · [23장](../level2-intermediate/23-tagging-strategy.md) |

## 30일 학습 계획표

하루 1.5~2시간, **읽기 30~40% + 손으로 만들기 60~70%** 비율을 가정한다. 주말을 빼면 달력으로 6주다.

| 일차 | 읽을 장 | 그날의 실습 |
|---|---|---|
| 1 | 1, 2 | 빈 디렉터리에서 `aws_s3_bucket` 하나를 만들고 지운다 |
| 2 | 3 | 변수 타입 6종을 선언하고 `terraform console` 로 값을 확인한다 |
| 3 | 4 | 프로파일·환경 변수·assume role 세 방법으로 인증해 본다 |
| 4 | 5 | VPC + 서브넷 2개(다른 AZ)를 만든다 |
| 5 | 6 | IGW·라우트 테이블을 붙여 인터넷 경로를 완성한다 |
| 6 | 9 | state 파일을 열어 보고, 리소스를 콘솔에서 지운 뒤 plan을 본다 |
| 7 | 7 | 4~6일차 코드를 변수·출력으로 리팩터링한다 |
| 8 | 8 | `aws_availability_zones`·`aws_ami` 로 하드코딩을 없앤다 |
| 9 | 11 | 시큐리티 그룹 + EC2를 띄우고 SSM으로 접속한다 |
| 10 | 12 | 버킷 + versioning + public access block + 정책을 각각 만든다 |
| 11 | 13 | 인스턴스 프로파일을 만들어 EC2가 S3를 읽게 한다 |
| 12 | 10 | `default_tags` 를 넣고 `tags_all` 변화를 plan으로 본다 |
| 13 | 14 | 지금까지 쓴 리소스 문서에서 ForceNew 인수를 전부 목록화한다 |
| 14 | 15 | 2-tier 환경을 처음부터 끝까지 만든다 |
| 15 | 15 | 같은 환경을 destroy·apply 해 재현성을 확인한다 |
| 16 | 16 | S3 백엔드로 state를 옮기고 잠금을 확인한다 |
| 17 | 17 | 서브넷을 `for_each` 로 다시 쓰고 `count` 와의 차이를 state에서 본다 |
| 18 | 18 | `for` 표현식과 `templatefile` 로 user data를 만든다 |
| 19 | 19 | 15장 결과물을 모듈로 감싸고 `moved` 로 state를 옮긴다 |
| 20 | 22 | 리소스 이름을 바꾸고 `moved` 유무에 따른 plan 차이를 본다 |
| 21 | 20 | 콘솔에서 만든 리소스를 `import` 블록으로 데려온다 |
| 22 | 21 | `create_before_destroy` 로 무중단 교체를 만든다 |
| 23 | 23, 24 | `ignore_tags` 를 넣고 다른 리전에 리소스를 `region` 으로 만든다 |
| 24 | 25 | 두 번째 계정으로 assume role 하는 provider를 붙인다 |
| 25 | 26 | Secrets Manager 값을 ephemeral로 읽어 state에 없음을 확인한다 |
| 26 | 27, 28 | NAT·엔드포인트를 붙이고 ALB + ASG 계층을 만든다 |
| 27 | 29 / 30 / 31 중 하나 | 담당 워크로드에 맞는 장을 골라 실제로 배포한다 |
| 28 | 32, 33 | 로그 그룹·알람을 붙이고 IAM 정책을 정책 문서 데이터 소스로 다시 쓴다 |
| 29 | 36, 41 | 일부러 drift를 만들고 `TF_LOG` 로 추적한다 |
| 30 | 38, 39 | CI에서 plan을 돌리는 파이프라인을 만들고 업그레이드를 리허설한다 |

42~49장(provider 개발)은 이 계획에 넣지 않았다. 사용자 관점이 굳은 뒤에 별도로 시작하는 편이 낫다.

## 실습 프로젝트

난이도순이며 뒤로 갈수록 "정답이 하나가 아닌" 판단이 늘어난다. 비용이 붙는 리소스(NAT Gateway, RDS, ALB)가 있으므로 **끝나면 반드시 destroy로 정리**한다.

### 1. 정적 웹사이트 (난이도 1)

S3 버킷에 정적 파일을 올리고 CloudFront로 배포한다. 버킷은 퍼블릭이 아니어야 한다.

- **필요한 것** — `aws_s3_bucket`, `aws_s3_bucket_public_access_block`, `aws_s3_object`, `aws_cloudfront_distribution`, `aws_s3_bucket_policy`
- **성공 기준** — CloudFront 도메인으로는 페이지가 열리고 S3 URL로는 열리지 않는다. destroy가 에러 없이 끝난다.
- **쓸 장** — [12장](../level1-beginner/12-s3-bucket.md), [13장](../level1-beginner/13-iam-basics.md), [8장](../level1-beginner/08-data-sources.md)

### 2. 2-tier 웹 애플리케이션 (난이도 2)

퍼블릭 서브넷에 ALB, 프라이빗에 ASG, 그 뒤에 RDS를 둔다. 인스턴스는 SSM으로만 접근한다.

- **필요한 것** — VPC 일체, `aws_launch_template`, `aws_autoscaling_group`, `aws_lb` 계열, `aws_db_instance`
- **성공 기준** — ALB DNS로 응답한다. 인스턴스 하나를 콘솔에서 종료해도 ASG가 복구한다. 어떤 인스턴스에도 퍼블릭 IP나 22번 포트가 없다.
- **쓸 장** — [15장](../level1-beginner/15-capstone-two-tier.md), [27장](../level2-intermediate/27-vpc-networking.md), [28장](../level2-intermediate/28-compute-asg-alb.md), [31장](../level2-intermediate/31-databases-rds-dynamodb.md)

### 3. 재사용 모듈 만들기 (난이도 3)

프로젝트 2의 네트워크 부분을 모듈로 뽑아 dev·prod 두 환경에서 다른 값으로 호출한다.

- **필요한 것** — 모듈 디렉터리, `validation` 블록, `output`, `for_each`, 환경별 tfvars
- **성공 기준** — 모듈 코드를 한 줄도 고치지 않고 CIDR·AZ·NAT 개수가 다른 두 환경을 만든다. 기존 리소스를 모듈로 옮기며 `moved` 블록으로 **재생성 0건**을 달성한다.
- **쓸 장** — [19장](../level2-intermediate/19-modules.md), [17장](../level2-intermediate/17-count-foreach-dynamic.md), [22장](../level2-intermediate/22-moved-removed-refactoring.md), [7장](../level1-beginner/07-variables-outputs-locals.md)

### 4. 기존 인프라 코드화 (난이도 4)

콘솔에서 손으로 만든 리소스 묶음을 Terraform으로 데려온다.

- **필요한 것** — `import` 블록, `terraform plan -generate-config-out`, List Resource와 `terraform query`
- **성공 기준** — import 직후 `terraform plan` 이 **"No changes"** 를 출력한다. 기본값·태그·읽기 전용 속성 때문에 대부분 첫 시도에서 diff가 남으므로 이것이 어렵다.
- **쓸 장** — [20장](../level2-intermediate/20-import-and-resource-identity.md), [37장](../level3-advanced/37-list-resources-and-query.md), [36장](../level3-advanced/36-drift-refresh-and-checks.md), [14장](../level1-beginner/14-reading-resource-docs.md)

### 5. 멀티 계정 + CI 파이프라인 (난이도 5)

관리 계정에서 OIDC로 인증한 CI가 워크로드 계정에 assume role 해 배포한다. plan은 PR에서, apply는 승인 후에.

- **필요한 것** — `aws_iam_openid_connect_provider`, 신뢰 정책이 걸린 롤, provider `assume_role`, 원격 백엔드와 잠금
- **성공 기준** — 저장소에 **장기 액세스 키가 하나도 없다.** PR을 열면 plan이 코멘트로 붙고 승인 없이는 apply가 되지 않으며, 두 사람이 동시에 실행하면 두 번째가 잠금에 막힌다.
- **쓸 장** — [25장](../level2-intermediate/25-multi-account.md), [16장](../level2-intermediate/16-remote-state-and-backends.md), [38장](../level3-advanced/38-large-scale-structure-cicd.md)

## 자가 점검 — "이걸 설명할 수 있으면 다음 레벨로"

책을 덮고 답해 본다. 막히면 그 주제의 장으로 돌아간다.

### Level 1 → Level 2

1. `terraform apply` 를 실행하면 무슨 일이 순서대로 일어나며, state·AWS API·코드가 각각 어떤 역할을 하는가?
2. state 파일을 잃어버렸다. 무슨 일이 일어나고 어떻게 복구하는가?
3. `plan` 에 `forces replacement` 가 떴다. 원인을 어디서 확인하고 원치 않으면 어떻게 하는가?
4. `tags`·`default_tags`·`tags_all` 의 관계는? 같은 키가 겹치면 무엇이 이기는가?
5. 데이터 소스와 리소스의 차이는? destroy 때 데이터 소스는 어떻게 되는가?
6. 리소스 문서에서 "Optional", "Forces new resource", "Import" 절을 각각 어떻게 읽는가?

### Level 2 → Level 3

1. `count` 와 `for_each` 중 무엇을 언제 쓰며, 리스트 가운데 항목을 지우면 각각 어떻게 되는가?
2. 모듈로 코드를 옮기면서 리소스를 재생성하지 않으려면 무엇이 필요한가?
3. `ignore_changes` 를 쓰면 안 되는 상황을 하나 들어라. 대신 무엇을 하는가?
4. v6의 `region` 인수는 값을 바꿀 때와 지울 때 각각 어떻게 동작하는가?
5. 시크릿을 state에 남기지 않고 리소스에 전달하는 방법은?
6. 두 사람이 동시에 apply 하면 무엇이 막아 주며, 없으면 무슨 일이 생기는가?
7. 이미 존재하는 리소스를 코드로 가져왔는데 plan에 diff가 남는다. 왜 그런가?

### Level 3 → 그 너머

1. AWS Provider가 SDKv2와 Plugin Framework를 **동시에** 서빙하는 이유는? 사용자에게 보이는가?
2. `plan` 이 느리다. 병목이 refresh인지 provider 초기화인지 스로틀링인지 어떻게 구분하는가?
3. 최종 일관성 때문에 실패하는 리소스를 provider는 어떻게 다루며, 사용자는 무엇을 할 수 있는가?
4. 새 리소스를 설계할 때 인수 이름과 리소스 이름은 무엇을 기준으로 정하는가?
5. `*_exclusive` 리소스는 무엇을 해결하고 무엇을 위험하게 만드는가?
6. 파괴적 변경의 정의는? 어떤 변경이 마이너 릴리스에 들어갈 수 있는가?

## 이 교재가 다루지 않은 것과 다음 자료

이 교재는 **`hashicorp/aws` provider와 Terraform 언어**에 집중한다. 아래는 의도적으로 뺀 영역이다.

| 영역 | 무엇인가 | 언제 검토하는가 |
|---|---|---|
| **HCP Terraform / Terraform Enterprise** | 원격 실행, 정책 강제, 상태·비밀 관리를 제공하는 관리형 플랫폼 | 팀이 커지거나 자체 CI 파이프라인 유지 비용이 커질 때. [38장](../level3-advanced/38-large-scale-structure-cicd.md)의 파이프라인을 대체하는 선택지 |
| **Terraform Stacks** | 여러 구성 요소를 하나의 배포 단위로 묶는 상위 개념 | state를 여러 개로 쪼갠 뒤 그 사이의 배포 순서를 손으로 관리하기 시작할 때 |
| **CDKTF** | TypeScript·Python 등으로 Terraform 구성을 생성하는 도구 | 팀이 CDK에 익숙하고 HCL 저항이 클 때. 생성 결과가 Terraform 구성이므로 **이 교재의 내용은 그대로 유효하다** |
| **Terragrunt** | 여러 구성의 중복(백엔드 설정, provider 블록)을 줄이는 래퍼 | 환경·리전·계정 조합이 수십 개로 늘어 `backend` 블록 복사가 고통스러울 때 |
| **Pulumi / CloudFormation 비교** | 대안 IaC 도구 | 도구를 처음 고를 때. 비교 축은 언어·상태 관리·드리프트 처리·생태계 넷이다 |
| **AWSCC provider** | Cloud Control API 기반으로 **자동 생성**되는 별도 provider(`hashicorp/awscc`) | `aws` 에 아직 없는 신규 서비스가 필요할 때. 두 provider는 **함께 쓰도록 설계**되어 있다 |
| **정책 코드 (OPA / Sentinel)** | plan 결과를 정책으로 검사해 승인·차단 | "태그 없으면 배포 불가" 같은 규칙을 사람의 리뷰가 아니라 기계로 강제하고 싶을 때 |
| **비용 도구** | plan을 읽어 예상 비용을 계산하는 도구들 | PR에서 "이 변경이 월 얼마인가"를 보여 주고 싶을 때 |
| **AWS 서비스 자체** | VPC 라우팅 원리, IAM 평가 로직, RDS 파라미터 튜닝 등 | 항상. **Terraform은 AWS를 대신 이해해 주지 않는다.** 이 교재의 서비스 장들은 "Terraform으로 어떻게 쓰는가"이지 "그 서비스가 무엇인가"가 아니다 |

AWSCC provider는 특히 오해가 잦다. 자동 생성이라 신규 서비스 지원이 빠르지만 `aws` provider만큼 다듬어진 인터페이스는 아니다. 실무에서는 **한 구성 안에 두 provider를 함께 선언**하고, `aws` 에 있는 것은 `aws` 로, 없는 것만 `awscc` 로 만든다.

## 계속 배우는 법

이 교재의 사실 정보는 특정 시점의 v6.x 기준이다. provider는 계속 움직이므로 끝난 뒤에는 **읽는 습관**이 지식을 대체한다.

**릴리스 노트를 읽는다.** AWS Provider는 **매주 목요일에 릴리스**된다. 다 읽을 필요는 없지만 마이너 버전을 올릴 때는 그 사이의 CHANGELOG에서 `BREAKING CHANGES`·`NOTES` 항목과 자기가 쓰는 리소스 이름을 검색한다. AWS의 릴리스 속도와 드문 메이저 릴리스 사이의 간격 때문에 **마이너 업데이트에도 설정·환경에 따라 예상치 못한 변화가 있을 수 있어**(새 기능 지원에 IAM 권한이 추가로 필요해지는 등), 버전 고정이 권장된다.

**메이저는 미루지 않는다.** 새 기능과 수정은 원칙적으로 **최신 메이저에만** 들어가고 백포트는 보안 취약점 같은 예외에만 검토된다. 한 메이저 뒤처지면 새 리소스도 버그 수정도 받지 못한다. [39장](../level3-advanced/39-version-upgrades.md)과 [부록 D](d-v6-breaking-changes.md)를 절차서로 삼아 분기마다 점검한다.

**설계 결정 로그를 읽는다.** provider 저장소의 `docs/design-decisions/` 에는 "관계 리소스를 어떻게 설계할 것인가", "`id` 를 어떻게 표준화할 것인가" 같은 문서가 쌓여 있다. 결론보다 **어떤 대안을 왜 버렸는가**가 배울 거리다([49장](../level3-advanced/49-design-decisions.md)).

**이슈 트래커를 쓴다.** 이상한 동작을 만나면 먼저 검색한다. 대부분 이미 누군가 열어 두었고 워크어라운드가 코멘트에 있다. 기여를 시작하려면 `good-first-issue`, 경험이 있으면 `help-wanted` 라벨을 본다 — 후자는 영향이 크지만 메인테이너가 당장 손대지 못하는 것들이다.

**로드맵을 분기 단위로 본다.** 팀은 몇 달마다 집중 영역을 공개하며, 커뮤니티 상위 이슈·Core Services·내부 우선순위에서 항목을 고른다. Core Services는 대다수 사용자에게 중요하다고 식별된 목록으로 **EC2, Lambda, EKS, ECS, VPC, S3, RDS, DynamoDB** 가 여기 해당하며, 로드맵에 없어도 매주 우선 처리된다.

**공식 자료.** 리소스 인수와 예제는 [Terraform Registry의 AWS Provider 문서](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)가 최종 근거다. 언어 자체는 [Terraform 공식 문서](https://developer.hashicorp.com/terraform/docs)와 [튜토리얼](https://developer.hashicorp.com/terraform/tutorials), provider 내부는 [기여자 문서](https://hashicorp.github.io/terraform-provider-aws/)에 있다.

## 관련 문서

- [부록 A — Provider 인수](a-provider-arguments.md) · [부록 B — 환경 변수](b-environment-variables.md) · [부록 C — 리소스 카탈로그](c-resource-catalog.md) · [부록 D — v6 파괴적 변경](d-v6-breaking-changes.md) · [부록 E — 용어집](e-glossary.md)
- 시작점: [1장](../level1-beginner/01-what-is-terraform-aws-provider.md) · 종착점: [50장 — 프로덕션 운영 종합](../level3-advanced/50-production-operations.md)
