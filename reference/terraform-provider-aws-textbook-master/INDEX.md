# Terraform AWS Provider 완전 교재

`hashicorp/terraform-provider-aws` 저장소 문서를 사실 근거로 삼아 새로 쓴 한국어 교재.
**초급 → 중급 → 고급** 3단계, **50개 챕터 + 부록 6편**.

| | |
|---|---|
| 기준 버전 | AWS Provider **v6.x** (`~> 6.0`) · Terraform 1.x · Go 1.26.6 |
| 언어 | 본문 한국어 · 코드와 용어는 원어 |
| 분량 | 56개 파일 · 약 1.65 MB · 정독 기준 약 27시간 |
| 원문 규모 | 리소스 1,691 · ephemeral 10 · list resource 183 · data source 673 |
| 근거 | 각 파일 frontmatter의 `source_docs` 참조 |

난이도 표기: `입문` / `중급` / `심화`

---

## 어디서부터 읽을까

- **Terraform이 처음이라면** — 1장부터 순서대로. Level 1(1~15장)을 마치면 2-tier VPC 환경을 혼자 만들 수 있다.
- **Terraform은 쓰지만 AWS provider를 깊게 모른다면** — 4·9·10·14장을 훑고 Level 2부터 정독. 특히 20(import)·23(태깅)·24(Enhanced Region)장이 v6에서 달라진 지점이다.
- **팀/플랫폼 운영을 맡고 있다면** — 16(원격 state)·38(대규모 구조)·39(업그레이드)·40(성능)·50(운영 종합)장이 핵심 구간이다.
- **provider에 기여하고 싶다면** — 42~48장이 개발자 트랙이다. 42장(아키텍처)부터 시작한다.
- **레퍼런스로 쓴다면** — 부록 A(provider 인수)·B(환경 변수)·C(리소스 카탈로그)를 먼저 열어 둔다.

각 챕터 frontmatter의 `prerequisites`에 선행 챕터 번호가 적혀 있다.
역할별 상세 학습 경로와 30일 계획표는 [부록 F](appendix/f-learning-paths.md)에 있다.

---

## 목차

### Level 1 — 초급

> 기초를 다지고 첫 인프라를 직접 만든다 · 1~15장

- **1.** [Terraform과 AWS Provider: 무엇을 대신해 주는가](level1-beginner/01-what-is-terraform-aws-provider.md) · `입문` · 30분
- **2.** [설치와 첫 실행: init · plan · apply · destroy](level1-beginner/02-install-and-first-run.md) · `입문` · 28분
- **3.** [HCL 문법: 블록·인수·표현식·타입](level1-beginner/03-hcl-basics.md) · `입문` · 28분
- **4.** [provider 블록과 자격증명: 6단계 우선순위](level1-beginner/04-provider-block-and-auth.md) · `입문` · 30분
- **5.** [첫 리소스: aws_vpc와 aws_subnet 해부](level1-beginner/05-first-resource-vpc.md) · `입문` · 28분
- **6.** [참조와 의존성: 그래프가 순서를 정한다](level1-beginner/06-references-and-dependencies.md) · `입문` · 28분
- **7.** [변수·출력·로컬: 값을 밖으로 빼기](level1-beginner/07-variables-outputs-locals.md) · `입문` · 28분
- **8.** [데이터 소스: 내가 만들지 않은 것을 읽기](level1-beginner/08-data-sources.md) · `입문` · 30분
- **9.** [State 입문: Terraform이 기억하는 것](level1-beginner/09-state-basics.md) · `입문` · 28분
- **10.** [태그 기초: tags, default_tags, tags_all](level1-beginner/10-tags-basics.md) · `입문` · 28분
- **11.** [EC2 인스턴스: AMI · 키페어 · 시큐리티 그룹](level1-beginner/11-ec2-instance.md) · `입문` · 30분
- **12.** [S3 버킷: 하나의 리소스가 여러 개로 쪼개진 이유](level1-beginner/12-s3-bucket.md) · `입문` · 30분
- **13.** [IAM 기초: role · policy · policy_document](level1-beginner/13-iam-basics.md) · `중급` · 28분
- **14.** [리소스 문서 읽는 법: Optional·ForceNew·Import·Timeouts](level1-beginner/14-reading-resource-docs.md) · `입문` · 28분
- **15.** [초급 종합: 2-tier VPC 환경 처음부터 끝까지](level1-beginner/15-capstone-two-tier.md) · `입문` · 35분

### Level 2 — 중급

> 팀과 프로덕션 규모로 넘어간다 · 16~33장

- **16.** [원격 State와 백엔드: 팀으로 넘어가는 순간](level2-intermediate/16-remote-state-and-backends.md) · `중급` · 32분
- **17.** [count · for_each · dynamic: 반복의 세 얼굴](level2-intermediate/17-count-foreach-dynamic.md) · `중급` · 32분
- **18.** [표현식과 내장 함수: for · splat · try · templatefile](level2-intermediate/18-expressions-and-functions.md) · `중급` · 34분
- **19.** [모듈: 재사용 단위를 설계한다](level2-intermediate/19-modules.md) · `중급` · 34분
- **20.** [Import와 Resource Identity: 이미 있는 것을 데려오기](level2-intermediate/20-import-and-resource-identity.md) · `중급` · 34분
- **21.** [lifecycle: 교체·보호·무시·트리거](level2-intermediate/21-lifecycle-meta-arguments.md) · `중급` · 33분
- **22.** [moved · removed: 상태를 깨지 않고 리팩터링하기](level2-intermediate/22-moved-removed-refactoring.md) · `중급` · 35분
- **23.** [태깅 전략 심화: ignore_tags · 개별 태그 리소스 · 태그 정책](level2-intermediate/23-tagging-strategy.md) · `중급` · 35분
- **24.** [Enhanced Region Support: region 인수가 바꾼 것](level2-intermediate/24-enhanced-region-support.md) · `중급` · 32분
- **25.** [멀티 계정: assume_role · 롤 체이닝 · OIDC](level2-intermediate/25-multi-account.md) · `중급` · 34분
- **26.** [시크릿: ephemeral 리소스와 write-only 인수](level2-intermediate/26-secrets-and-ephemeral.md) · `심화` · 34분
- **27.** [VPC 네트워킹 실전: 라우팅 · NAT · 엔드포인트 · 피어링](level2-intermediate/27-vpc-networking.md) · `중급` · 36분
- **.** [컴퓨트: Launch Template + ASG + ALB로 죽지 않는 계층 만들기](level2-intermediate/28-compute-asg-alb.md) · `중급` · 36분
- **29.** [컨테이너: ECR · ECS/Fargate · EKS와 Terraform의 경계선](level2-intermediate/29-containers-ecs-eks.md) · `심화` · 38분
- **30.** [서버리스: 코드 배포와 인프라 선언의 경계에서 Lambda 다루기](level2-intermediate/30-serverless-lambda.md) · `중급` · 30분
- **31.** [데이터베이스: 지울 수 없는 리소스를 코드로 다루기 — RDS/Aurora와 DynamoDB](level2-intermediate/31-databases-rds-dynamodb.md) · `중급` · 34분
- **32.** [관측: 로그 그룹의 주인을 정하고, 울려야 할 때만 울리는 알람을 만든다](level2-intermediate/32-observability.md) · `중급` · 30분
- **33.** [Provider 함수와 IAM 정책 문서: ARN과 정책을 문자열로 조립하지 않는다](level2-intermediate/33-provider-functions-and-policies.md) · `중급` · 30분

### Level 3 — 고급

> 대규모 운영과 provider 내부까지 · 34~50장

- **34.** [Provider 설정 심화: 요청이 실제로 어디로 나가는가](level3-advanced/34-provider-configuration-deep.md) · `심화` · 32분
- **35.** [관계 리소스와 `*_exclusive`: 누가 그 목록을 소유하는가](level3-advanced/35-relationship-resources.md) · `심화` · 32분
- **36.** [Drift · refresh · check 블록: 배포가 끝난 뒤에도 계속 검증하기](level3-advanced/36-drift-refresh-and-checks.md) · `심화` · 30분
- **37.** [List Resource와 `terraform query`: 계정 안을 들여다보고 코드로 끌어오기](level3-advanced/37-list-resources-and-query.md) · `심화` · 32분
- **38.** [대규모 코드 구조와 CI/CD 파이프라인: 스택을 나누고 기계에게 배포를 맡긴다](level3-advanced/38-large-scale-structure-cicd.md) · `심화` · 36분
- **39.** [메이저 버전 업그레이드: 미루면 이자가 붙는 부채](level3-advanced/39-version-upgrades.md) · `심화` · 33분
- **40.** [성능과 API 스로틀링: 느린 plan은 어디에서 시간을 쓰는가](level3-advanced/40-performance-and-throttling.md) · `심화` · 34분
- **41.** [디버깅: 에러 한 줄에서 원인까지 거슬러 올라가기](level3-advanced/41-debugging.md) · `심화` · 32분
- **42.** [Provider 아키텍처: 두 개의 SDK가 하나로 서빙되는 이유](level3-advanced/42-provider-architecture.md) · `심화` · 34분
- **43.** [개발 환경과 skaff: 직접 빌드해서 붙이기](level3-advanced/43-dev-environment-and-skaff.md) · `심화` · 30분
- **44.** [리소스 구현하기: 스키마 · CRUD · flatten/expand](level3-advanced/44-implementing-a-resource.md) · `심화` · 36분
- **45.** [에러 처리 · 재시도 · Waiter: 최종 일관성과 싸우기](level3-advanced/45-errors-retries-waiters.md) · `심화` · 34분
- **46.** [태깅 구현: 코드 생성과 transparent tagging](level3-advanced/46-implementing-tagging.md) · `심화` · 34분
- **47.** [테스트: 진짜 AWS를 만들고 지우는 인수 테스트와 그 주변](level3-advanced/47-testing.md) · `심화` · 32분
- **48.** [기여 프로세스: 이슈에서 머지까지 무엇이 요구되는가](level3-advanced/48-contributing.md) · `심화` · 34분
- **49.** [설계 결정에서 배우기: 리소스 API는 어떻게 정해지나](level3-advanced/49-design-decisions.md) · `심화` · 29분
- **50.** [프로덕션 운영 종합: 가드레일 · 표준 · 비용 · 보안](level3-advanced/50-production-operations.md) · `심화` · 36분
### 부록

- **A.** [Provider 인수 전체 레퍼런스](appendix/a-provider-arguments.md) — `provider "aws"` 블록의 모든 인수, 블록별 표, 설정 레시피
- **B.** [환경 변수 레퍼런스](appendix/b-environment-variables.md) — 자격증명·엔드포인트·태그·`TF_LOG`까지 카테고리별 표
- **C.** [서비스별 리소스 카탈로그](appendix/c-resource-catalog.md) — 영역별 대표 리소스 색인과 주의가 필요한 패턴
- **D.** [v6 파괴적 변경 체크리스트](appendix/d-v6-breaking-changes.md) — 업그레이드 전후 체크리스트와 변경 전체 표
- **E.** [용어집](appendix/e-glossary.md) — 66개 표제어, 가나다순·알파벳순 색인
- **F.** [학습 경로와 다음 단계](appendix/f-learning-paths.md) — 역할별 경로, 30일 계획, 실습 프로젝트

---

## 이 교재의 원칙

1. **레퍼런스가 아니라 교재다.** 공식 문서가 이미 나열하고 있는 인수 목록을 옮기지 않았다.
   각 주제마다 *왜 이렇게 설계됐는가 / 언제 쓰고 언제 쓰지 않는가 / 무엇이 사람을 무는가*를 쓴다.
2. **모든 인수 이름·기본값·제약은 저장소 원문과 대조해 검증했다.** 원문에서 확인되지 않은 것은
   단정하지 않고 완화해 서술하거나 아예 쓰지 않았다. 집필 중 널리 퍼진 통념 여럿이
   v6 현재와 어긋난다는 것이 확인되어 바로잡았다(아래 표 참조).
3. **모든 챕터가 같은 구조다** — 학습 목표 → 왜 중요한가 → 본문 → 흔한 실수(❌/✅)
   → 프로덕션 노트 → 연습문제 → 요약 → 다음으로.
4. **연습문제에는 정답 대신 검증 가능한 성공 기준을 준다.** 실제로 돌려 보라는 뜻이다.
5. **사용자 트랙과 개발자 트랙을 모두 담는다.** Level 3 후반(42~48장)은 provider 내부와
   기여 절차를 다룬다. 여기까지 읽으면 문서에 없는 동작을 소스에서 판정할 수 있다.

---

## v6 기준으로 자주 틀리는 사실

기존 자료로 학습했다면 특히 확인할 것.

| 흔한 오해 | v6 사실 |
|---|---|
| 리전을 바꾸려면 provider alias가 필수 | v6.0.0부터 대부분의 리소스에 top-level `region` 인수가 있다. alias 방식도 여전히 유효하며 deprecated가 아니다 |
| `region` 값을 바꾸면 in-place 수정 | **교체(force replacement)** 된다. 반대로 `region`을 지우면 교체되지 않고 state의 이전 값을 쓴다 |
| 특정 리전 리소스 import | import ID 뒤에 `@<region>`을 붙인다 (`vpc-a01106c2@eu-west-1`) |
| `max_retries` 기본값은 3 | **25** |
| `aws_s3_bucket` 하나로 versioning·ACL·정책을 모두 설정 | v4에서 분리됐다. `aws_s3_bucket_versioning`, `aws_s3_bucket_acl`, `aws_s3_bucket_policy` 등 별도 리소스 |
| `default_tags`는 provider 블록에서만 지정 | 환경변수 `TF_AWS_DEFAULT_TAGS_<키>=<값>`으로도 지정할 수 있다. 충돌 시 provider 설정이 우선 |
| `default_tags`는 태그를 지원하는 모든 리소스에 적용 | **`aws_autoscaling_group`은 예외** |
| `ignore_tags`도 우선순위 규칙 | `ignore_tags`는 인수와 환경변수가 **병합**된다. `default_tags`(우선순위)와 규칙이 다르다 |
| `aws_ami` 데이터 소스는 `most_recent = true`만 있으면 됨 | v6부터 `owners` 또는 `image-id`/`owner-id` `filter`가 **필수** |
| OpsWorks / SimpleDB / Worklink 리소스를 쓸 수 있다 | v6에서 **제거됐다** |
| 태그 정책은 provider가 검사하지 않는다 | `tag_policy_compliance` 인수가 있다 (`error`/`warning`/`disabled`, 환경변수 `TF_AWS_TAG_POLICY_COMPLIANCE`) |
| S3 us-east-1 글로벌 엔드포인트를 계속 쓸 수 있다 | deprecated. `s3_us_east_1_regional_endpoint`는 **v7.0.0에서 제거 예정** |
| provider는 SDKv2 하나로 구현돼 있다 | terraform-plugin-sdk v2와 terraform-plugin-framework를 **mux**로 함께 서빙한다. 신규 구현은 Framework 필수 |
| Terraform은 기존 리소스를 발견할 수 없다 | **List Resource**(183개)와 `terraform query`가 있다 |
| 민감값은 state에 남을 수밖에 없다 | **Ephemeral resource**(10개)와 write-only(`*_wo`) 인수로 state에 남기지 않을 수 있다 |

---

## 원문과 라이선스

이 교재는 `hashicorp/terraform-provider-aws` 저장소의 `website/docs/`(사용자 문서)와
`docs/`(기여자 문서)를 **사실 근거**로 삼아 새로 집필한 것이다. 설명·예제·구성은 원문의
번역이나 재배열이 아닌 창작물이며, 인수 이름과 시그니처 등 사실 정보만 원문을 따른다.
각 챕터 frontmatter에 대응 원문 경로와 공식 문서 URL이 기재되어 있다.

- 저장소: <https://github.com/hashicorp/terraform-provider-aws>
- 공식 문서: <https://registry.terraform.io/providers/hashicorp/aws/latest/docs>
- 기여자 문서: <https://hashicorp.github.io/terraform-provider-aws/>
