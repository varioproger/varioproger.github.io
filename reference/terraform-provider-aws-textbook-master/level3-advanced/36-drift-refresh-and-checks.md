---
chapter: 36
level: "Level 3 — 고급"
title: "Drift · refresh · check 블록: 배포가 끝난 뒤에도 계속 검증하기"
difficulty: 심화
reading_time: "30분"
prerequisites: [9, 21]
source_docs:
  - "website/docs/guides/continuous-validation-examples.html.markdown"
  - "website/docs/guides/enhanced-region-support.html.markdown"
  - "website/docs/r/acm_certificate.html.markdown"
  - "website/docs/r/db_instance.html.markdown"
  - "website/docs/r/s3_bucket_versioning.html.markdown"
  - "website/docs/r/lambda_function.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/continuous-validation-examples"
provider_baseline: "6.x"
---

# 36장 — Drift · refresh · check 블록: 배포가 끝난 뒤에도 계속 검증하기

**이 장에서 배우는 것**

- drift가 생기는 네 가지 경로를 구분하고 각각에 맞는 대응(코드 반영 / 되돌리기 / 양보)을 고를 수 있다.
- `-refresh=false`, `plan -refresh-only`, `apply -refresh-only`가 plan 3단계 중 무엇을 켜고 끄는지 정확히 말할 수 있다.
- `-detailed-exitcode`의 0/1/2와 `terraform show -json`으로 drift 탐지 파이프라인과 대시보드를 만들 수 있다.
- `check` 블록으로 apply를 막지 않는 지속 검증을 작성하고 precondition/postcondition과의 결정적 차이를 설명할 수 있다.

**왜 중요한가**

apply가 초록색으로 끝난 순간이 인프라가 옳은 마지막 순간인 경우가 많다. 배포 주기가 6주인 팀은 다음 apply의 plan에 `3 to change, 1 to destroy`가 뜨는 것을 보고 나서야 그동안 세 사람이 콘솔을 만졌다는 사실을 안다. 그 destroy가 무엇인지 확인하는 데 반나절이 들고, 그동안 배포는 멈춘다.

조용한 쪽이 더 위험하다. ACM 인증서 만료 알림은 계정 루트 주소로 가고 아무도 읽지 않는다. 인증서가 만료된 새벽 3시에 ALB가 TLS 핸드셰이크를 거절하기 시작하지만 Terraform 코드에는 아무 잘못도 없고 `terraform plan`은 여전히 `No changes.`를 출력한다. plan은 "코드와 현실이 같은가"만 묻지 "현실이 여전히 괜찮은가"는 묻지 않기 때문이다. RDS의 `backup_retention_period`가 0이 되어도 코드가 그 속성을 관리하지 않는다면 아무 일도 일어나지 않는다.

## drift는 네 가지 경로로 들어온다

[9장](../level1-beginner/09-state-basics.md)에서 drift를 "state에 적힌 값과 AWS의 실제 값이 다른 상태"로 정의했다. 대응을 고르려면 정의보다 **경로**를 알아야 한다. 같은 diff라도 어디서 왔느냐에 따라 정답이 정반대다.

**경로 1 — 사람이 콘솔에서 바꿨다.** 장애 대응 중에 시큐리티 그룹을 열었거나 인스턴스 타입을 급히 키웠다. **의도가 있었고 급했다**는 것이 특징이라 되돌리면 장애가 재발할 수 있다.

**경로 2 — 다른 자동화가 바꿨다.** cluster-autoscaler가 ASG의 `desired_capacity`를 움직이고, ECS 서비스 오토스케일링이 `desired_count`를 바꾸고, 비용 도구가 태그를 붙인다. **정상 동작**이며 Terraform이 매번 되돌리면 두 시스템이 싸운다. 21장의 `ignore_changes`가 존재하는 이유가 이것이다.

**경로 3 — AWS가 스스로 바꿨다.** 관리형 서비스는 유지 관리 창에서 마이너 엔진 버전을 올리고 인증서를 자동 갱신한다. `aws_db_instance`가 `engine_version` 외에 **`engine_version_actual`**(실제로 돌고 있는 버전)을 따로 내보내는 것이 그 증거다.

**경로 4 — 서비스가 값을 정규화했다.** 아무도 바꾸지 않았는데 diff가 뜬다. IAM 정책 JSON의 키 순서가 바뀌고, Principal이 ARN 형태로 펼쳐지고, 빈 리스트가 `null`이 된다. 진짜 drift가 아니라 **표현의 차이**이며 코드를 정규형에 맞추는 것이 맞다. `ignore_changes`로 덮으면 진짜 변경까지 함께 눈이 먼다.

## refresh는 plan의 2단계이고, 공짜가 아니다

9장에서 plan은 **1단계 설정 읽기**, **2단계 refresh**, **3단계 diff**라고 했다. 고급 관점에서 두 가지가 더 필요하다.

첫째, **refresh는 API 호출이다.** state의 리소스 하나마다 최소 한 번의 `Describe*`/`Get*`이 나가고 태그를 별도 API로 읽는 서비스는 두 번 나간다. 리소스 800개짜리 state는 plan 한 번에 1,000회 이상의 read API를 쓰고, 여러 파이프라인이 동시에 돌면 `RequestLimitExceeded`가 뜬다([40장](40-performance-and-throttling.md)).

둘째, **refresh는 diff보다 먼저 끝난다.** 그래서 plan 출력에는 블록이 두 개 나온다 — 위쪽 `Note: Objects have changed outside of Terraform`은 refresh가 발견한 사실이고, 아래쪽 실행 계획은 그에 대한 Terraform의 대응이다. **위쪽에만 있고 아래쪽에는 없는 항목**은 "AWS가 바뀌었지만 코드가 그 속성을 관리하지 않으므로 손대지 않겠다"는 뜻이고, 사고는 보통 여기 숨는다.

`terraform plan -refresh=false`는 2단계를 통째로 건너뛰고 state를 그대로 진실로 믿는다. 버는 것은 시간과 API 호출이고 — 대형 state에서 plan이 8분에서 40초로 줄기도 한다 — 잃는 것은 **drift 가시성 전부**다. 정당한 용도는 직전에 apply한 파이프라인 안의 후속 plan, 스로틀링 중 긴급 확인, `-target`과 함께 쓰는 좁은 범위 정도다. 정당하지 않은 용도는 하나뿐이고 그게 가장 흔하다 — **"plan이 느려서" CI 기본값으로 박아 두는 것.** 속도가 문제라면 답은 refresh를 끄는 것이 아니라 **state를 쪼개는 것**이다([38장](38-large-scale-structure-cicd.md)).

## `apply -refresh-only`: AWS를 건드리지 않고 state만 맞추기

`-refresh-only`는 반대편이다. 2단계는 돌리고 **3단계를 생략한다.** 코드와 비교하지 않으므로 되돌리는 계획이 만들어지지 않고, 하는 일은 하나 — **state를 현실에 맞춰 갱신한다.**

```console
$ terraform plan -refresh-only     # 무엇이 어긋났는지만 본다. state 파일은 바뀌지 않는다
$ terraform apply -refresh-only    # 승인 후 state 를 현실에 맞춘다. AWS 는 읽기만 한다
```

**AWS에 어떤 쓰기 호출도 나가지 않는다.** 위험은 state 쪽에 있다 — 콘솔에서 리소스가 삭제됐다면 이 명령은 그 항목을 state에서 제거하고 다음 plan은 "새로 만들기"를 계획한다. 옛 `terraform refresh`가 물러나고 승인 단계가 있는 이 형태가 권장되는 이유다.

쓰는 자리는 둘이다(`state mv`나 `import` 직후 검증용으로도 쓴다).

**1. v6 마이그레이션.** 원문 `enhanced-region-support.html.markdown`이 provider alias에서 리소스별 `region` 인수로 옮기는 절차를 세 단계로 못박는다 — (1) v6.0.0으로 올린다, (2) **refresh-only 모드로 apply를 돌린다**, (3) 그 다음에 `provider` 메타 인수를 `region` 인수로 바꾼다. 순서가 뒤집히면 안 된다. `region`은 값이 바뀔 때 **교체를 유발**하므로, state에 값이 채워지기 전에 코드를 고치면 Terraform이 멀쩡한 리소스를 갈아 끼우는 계획을 세운다([24장](../level2-intermediate/24-enhanced-region-support.md)).

**2. 외부 변경을 정식으로 수용할 때.** 오토스케일링이 `desired_capacity`를 6으로 올렸고 그걸 새 기준선으로 인정한다면 state를 먼저 맞추고 코드를 그 값으로 고친다. 순서를 지키면 중간에 plan이 인스턴스를 줄이는 창이 생기지 않는다. **이 명령은 코드를 고쳐 주지 않으므로** state 갱신과 코드 수정은 항상 한 쌍이다.

## `-detailed-exitcode`: drift 탐지를 자동화하는 열쇠

drift 탐지를 파이프라인으로 만들려면 "변경이 있는가"를 **종료 코드**로 알아야 한다. 출력 grep은 버전이 올라가면 깨진다.

| 종료 코드 | 의미 |
|---|---|
| `0` | 성공. **diff가 비어 있다** |
| `1` | 에러. 계획을 만들지 못했다 |
| `2` | 성공. **diff가 비어 있지 않다** |

플래그가 없으면 성공은 전부 `0`이라 파이프라인은 drift를 구분하지 못한다. 주의할 점은 둘. **`1`과 `2`를 뭉뚱그리면 안 된다** — 자격증명 만료(`1`)와 drift(`2`)는 다른 알림이어야 하고, `set -e`가 걸린 셸에서는 `2`가 반환되는 순간 스크립트가 죽으므로 명시적으로 받아야 한다. 그리고 **`2`는 "drift"가 아니라 "diff"다** — 순수한 drift 탐지는 **main 브랜치의 커밋 = 이미 apply된 상태**라는 전제 위에서만 성립하고, 그 전제가 깨진다면 뒤에 나오는 `resource_drift`를 봐야 한다.

```bash
# 매일 06:00 KST, main 기준, read-only 자격증명으로 실행한다
terraform plan -input=false -lock=false -detailed-exitcode -out=drift.tfplan
case "$?" in
  0) exit 0 ;;                                              # drift 없음
  2) terraform show -json drift.tfplan > drift.json ;;      # drift 발견
  *) echo "plan failed"; exit 1 ;;                          # 실행 실패
esac
```

`-lock=false`가 붙은 이유는 이 잡이 **읽기 전용**이고 락을 잡으면 같은 시간에 도는 배포 파이프라인을 막기 때문이다. 주기의 기준선은 직관과 반대다 — **배포가 드문 스택일수록 더 자주 돌린다.** 배포가 잦으면 배포 자체가 drift 탐지 역할을 하지만, 6주에 한 번 배포하는 스택은 6주치 drift를 한꺼번에 만나기 때문이다.

## drift를 발견했을 때: 세 갈래

**A. 코드에 반영한다(현실이 정답).** 순서는 `apply -refresh-only` → 코드 수정 → plan이 비는지 확인. **판단 기준:** 그 변경을 되돌렸을 때 서비스가 나빠지는가?

**B. 되돌린다(코드가 정답).** `terraform apply`를 돌린다. **판단 기준:** 변경이 우발적이거나 정책 위반인가? 단, plan을 끝까지 읽고 하라 — 되돌리기가 `-/+`(교체)로 나오면 인증서·엔드포인트·IP가 바뀐다.

**C. 양보한다(`ignore_changes`).** 다른 시스템이 그 속성의 정당한 소유자일 때 — ASG의 `desired_capacity`에 `lifecycle { ignore_changes = [desired_capacity] }`를 걸면 코드에 적힌 값은 최초 생성 시점의 초기값으로만 쓰인다. **판단 기준:** 그 속성을 바꾸는 주체가 **사람이 아니라 시스템**이고 앞으로도 계속 바꿀 것인가? 사람의 일회성 변경에는 절대 C를 쓰지 않는다 — 문제를 고치는 게 아니라 알람을 끄는 것이다.

C에는 짝이 따라온다. **`ignore_changes`는 그 속성에 대한 감시를 완전히 끈다.** `desired_capacity`를 무시하기로 했다면 그것이 0이 되어도 Terraform은 침묵한다. 그래서 C를 고른 속성은 다음 절의 `check` 블록으로 **다른 층에서** 감시해야 한다.

## `check` 블록: 실패해도 apply를 막지 않는 검증

Terraform 1.5부터 최상위 `check` 블록을 쓸 수 있다. 원문 가이드의 목적 서술은 이렇다 — **적용된 실행 사이사이에 인프라에 대한 단언을 하게 해서, 문제가 처음 나타난 시점에 발견하고 고객이 겪는 문제가 되고 나서야 발견되는 상황을 피한다.**

```terraform
check "eks_cluster_healthy" {
  assert {
    condition     = aws_eks_cluster.default.status == "ACTIVE"
    error_message = "EKS 클러스터 상태가 ${aws_eks_cluster.default.status} 다"
  }
}
```

`check "<이름>"` 안에 하나 이상의 `assert`를 두고, 각 `assert`는 `condition`(bool 표현식)과 `error_message`(문자열)를 갖는다. 원문의 설명 그대로 — **condition이 true면 통과하고, false면 Terraform이 사용자가 정의한 error_message를 포함한 경고 메시지를 보여 준다.** **경고(Warning)**라는 단어가 이 기능의 전부다.

```
│ Warning: Check block assertion failed
│   on main.tf line 43, in check "check_budget_exceeded":
│   43:     condition = !data.aws_budgets_budget.example.budget_exceeded
│
│ AWS budget has been exceeded! Calculated spend: '1550.0' and budget limit: '1200.0'
```

이 경고가 뜬 plan은 **여전히 유효하고** apply는 **그대로 진행된다**. 종료 코드도 성공이다. 설계 의도다 — check는 "지금 이 배포를 막을 이유"가 아니라 "누군가 봐야 할 사실"을 표현한다. `assert`는 한 `check` 안에 여러 개 둘 수 있고 하나가 실패해도 나머지는 계속 평가되어 실패한 것마다 경고가 나온다 — precondition이 첫 실패에서 멈추는 것과 다르다.

## `check` 안의 `data` 블록: 코드가 만들지 않은 사실 조회하기

`check`의 진짜 능력은 **안에 `data` 블록을 하나 둘 수 있다**는 데서 나온다. 이 데이터 소스는 check에 **범위가 한정**되어 다른 곳에서 참조할 수 없고, 대신 **조회가 실패해도 에러가 아니라 경고가 된다** — 최상위 `data` 블록이었다면 조회 실패가 plan 전체를 멈춘다. 원문 가이드의 GuardDuty 예제가 그 구조를 그대로 보여 준다.

```terraform
data "aws_guardduty_detector" "example" {}

check "check_guardduty_findings" {
  data "aws_guardduty_finding_ids" "example" {
    detector_id = data.aws_guardduty_detector.example.id
  }

  assert {
    condition = !data.aws_guardduty_finding_ids.example.has_findings
    error_message = format("AWS GuardDuty detector '%s' has %d open findings!",
      data.aws_guardduty_finding_ids.example.detector_id,
      length(data.aws_guardduty_finding_ids.example.finding_ids))
  }
}
```

조회되는 것은 **Terraform이 만든 것이 아니다.** GuardDuty 탐지 결과는 코드에도 state에도 없는데 매 plan/apply마다 새로 조회되어 단언 대상이 된다. drift는 "내가 만든 것이 변했는가"를 묻고, check는 "세상이 여전히 내 가정에 맞는가"를 묻는다.

원문은 **여러 소스의 데이터를 결합할 수 있다**는 점도 명시하며, 그 예로 **리소스의 만료일 속성을 내장 time 함수의 현재 시각과 비교해 만료되는 리소스를 감시하는 것**을 든다. `aws_acm_certificate`는 **`not_after`**(만료 일시), `not_before`, `status`, `renewal_summary`(ACM 관리형 갱신 상태)를 내보내므로 그대로 적용된다.

```terraform
locals {
  # check 전용. 리소스 인수에서는 참조하지 않는다 (매 plan 마다 값이 달라진다)
  expiry_threshold = timeadd(timestamp(), "720h") # 30일
}

check "cert_not_expiring_soon" {
  assert {
    condition = timecmp(aws_acm_certificate.api.not_after, local.expiry_threshold) > 0
    error_message = format("ACM 인증서 %s 가 30일 안에 만료된다. not_after=%s, status=%s",
      aws_acm_certificate.api.domain_name, aws_acm_certificate.api.not_after,
      aws_acm_certificate.api.status)
  }
}
```

DNS 검증으로 자동 갱신되는 인증서라면 만료 자체가 드물지만 **검증 레코드가 지워지면 자동 갱신이 조용히 실패한다.** 그 실패를 30일 전에 알려 주는 것이 이 check의 값어치다. 원문의 IAM 역할 예제가 쓴 `timecmp` + `coalesce` 조합도 같은 계열이다.

헬스와 정책 준수도 같은 방식이다. `aws_db_instance`가 내보내는 `status`, `backup_retention_period`, `multi_az`, `storage_encrypted`로 `status == "available"`이나 `backup_retention_period >= 7`을 단언하고, `aws_s3_bucket_versioning`의 `versioning_configuration.status`(`Enabled` / `Suspended` / `Disabled`)를 `alltrue([...])`로 묶으면 계정 전체 규칙이 된다. `aws_lambda_function`의 `last_modified`는 파이프라인 밖의 수정을 잡아내지만 배포 직후 당연히 실패하므로 **정기 drift 잡 전용**이다.

코드에 값이 적혀 있는 속성은 plan이 되돌리므로 check가 필요 없어 보이지만, **`ignore_changes`가 걸렸거나 코드가 관리하지 않는 속성**이라면 plan은 침묵한다. check는 그 사각지대를 덮는다.

## check vs precondition/postcondition, 그리고 검증의 3층

[21장](../level2-intermediate/21-lifecycle-meta-arguments.md)의 `precondition`/`postcondition`과 check는 셋 다 `condition` + `error_message` 형태라 헷갈리지만 역할이 다르다.

| | `precondition` | `postcondition` | `check` |
|---|---|---|---|
| 위치 | 리소스의 `lifecycle` | 리소스의 `lifecycle` | 최상위 `check` 블록 |
| 평가 시점 | 그 객체를 만들기 **전** | 그 객체를 만들고 **난 뒤** | plan·apply의 **마지막** |
| 실패 시 | **에러**. 중단 | **에러**. 중단 | **경고**. 계속 진행 |
| 범위 | 그 리소스 하나 | 그 리소스 하나 | 설정 전체, 외부 상태 포함 |
| 자체 `data` 블록 | 불가 | 불가 | **가능**(범위 한정, 실패해도 경고) |
| 여러 개 실패 | 첫 실패에서 중단 | 첫 실패에서 중단 | **전부 평가되고 전부 보고** |

고르는 기준은 한 문장이다. **"이 사실이 틀렸으면 배포를 막아야 하는가?"** 막아야 하면 precondition/postcondition, 알리기만 하면 check다.

이 도구들을 실행 시점으로 정렬하면 층이 셋이고 하나로 나머지를 대신할 수 없다.

- **1층 정적** — `terraform validate`, `fmt -check`, tflint, 정책 코드. AWS를 호출하지 않아 자격증명 없이 몇 초면 끝나고 PR마다 돈다. 실제 AWS 상태는 알 수 없다.
- **2층 plan 시점** — precondition/postcondition, plan JSON을 정책 엔진에 먹이는 검사("destroy가 포함된 plan은 승인 필요"). 배포마다 돈다. 배포 사이의 시간은 알 수 없다.
- **3층 지속** — check 블록과 주기적 plan. 스케줄로 돈다. 만료·drift·헬스 저하·규정 이탈은 여기서만 잡힌다.

3층에서 반복해 잡히는 문제는 왼쪽으로 **승격**시켜야 한다. "prod 버킷에 versioning이 꺼져 있다"는 check가 세 번 울렸다면 정책 코드로 올려 그런 PR이 애초에 병합되지 못하게 만들 신호다. 승격하지 않으면 경고는 배경 소음이 된다.

### HCP Terraform의 continuous validation과 자체 구현

원문 가이드 제목이 "Using HCP Terraform's Continuous Validation feature with the AWS Provider"인 데서 보이듯 `check`는 그 기능과 함께 설계됐지만, **`check` 블록 자체는 Terraform 언어 기능이라** 오픈소스 CLI에서 그대로 동작한다. HCP Terraform이 더해 주는 것은 **주기적으로 돌리고 결과를 모으는 것**이다 — 워크스페이스에서 검증 주기를 켜면 apply와 무관하게 check를 평가하고 실패 시 알림을 보낸다. 자체 구현은 스케줄러·실행·알림 세 조각으로 흉내낼 수 있지만 **이력**을 잃는다 — 매 실행이 독립적이라 "언제부터 실패했는지"를 알려면 결과를 따로 저장해야 한다.

## plan JSON 파싱: drift 대시보드 만들기

사람이 읽는 plan 출력을 자동화의 입력으로 쓰면 안 된다. 기계용 형식을 쓴다.

```console
$ terraform plan -refresh=true -detailed-exitcode -out=drift.tfplan
$ terraform show -json drift.tfplan > drift.json
```

필요한 키는 셋이다.

- **`resource_drift`** — refresh가 발견한 **외부 변경**. plan 출력 위쪽 `Objects have changed outside of Terraform`에 해당하며 `address`, `change.before`, `change.after`를 담는다.
- **`resource_changes`** — Terraform이 **실행하려는 계획**. `change.actions`가 `["no-op"]`, `["create"]`, `["update"]`, `["delete"]`, `["delete","create"]`(교체) 중 하나다.
- **`checks`** — check 평가 결과(주소·상태·메시지).

**앞의 둘을 분리해서 봐야 한다.** "위쪽에만 있고 아래쪽에는 없는 항목"이 곧 `resource_drift`에는 있는데 `resource_changes`에서 `no-op`인 리소스이고, 이게 조용한 사고의 자리다.

```bash
jq -r '.resource_drift[]?.address' drift.json   # 외부에서 변경된 리소스

# 교체(delete + create)가 계획된 리소스 개수를 CloudWatch 메트릭으로 올린다
n=$(jq '[.resource_changes[] | select(.change.actions == ["delete","create"])] | length' drift.json)
aws cloudwatch put-metric-data --namespace "Terraform/Drift" \
  --metric-name "PlannedReplacements" --value "$n"
```

`PlannedReplacements`에 알람을 거는 것이 특히 값어치가 있다. **정기 drift 잡에서 교체 계획이 나온다는 것은 거의 항상 사고 신호**다 — ForceNew 인수가 밖에서 바뀌었거나 provider 업그레이드가 스키마를 바꿨다는 뜻이고, apply 전에 반드시 사람이 읽어야 한다.

## 흔한 실수

### ❌ check 블록으로 배포를 막으려 한다

check는 **경고만 낸다.** 실패해도 apply가 진행되고 종료 코드도 성공이다.

```terraform
# ❌ 경고만 나고 apply 는 그대로 진행되어 DB 가 만들어진다
check "no_unencrypted_db" {
  assert {
    condition     = aws_db_instance.main.storage_encrypted
    error_message = "암호화되지 않은 RDS"
  }
}
```

```terraform
# ✅ 막아야 하는 것은 precondition. 만들기 전에 에러로 중단시킨다
resource "aws_db_instance" "main" {
  storage_encrypted = var.storage_encrypted
  # ... 나머지 설정 ...
  lifecycle {
    precondition {
      condition     = var.environment != "prod" || var.storage_encrypted
      error_message = "prod 환경의 RDS 는 storage_encrypted = true 여야 한다"
    }
  }
}
```

### ❌ drift 잡에서 `-detailed-exitcode` 없이 성공 여부만 본다

플래그가 없으면 diff가 있든 없든 종료 코드는 `0`이다. 파이프라인은 매일 초록불을 켜고 drift는 영원히 보고되지 않는다.

```bash
# ❌ 항상 성공한다. drift 가 있어도 알 수 없다
terraform plan -out=drift.tfplan
if [ $? -ne 0 ]; then notify "plan failed"; fi
```

```bash
# ✅ 0/1/2 를 구분한다. 2 는 drift, 1 은 실행 실패 — 알림이 달라야 한다
set +e; terraform plan -lock=false -detailed-exitcode -out=drift.tfplan; code=$?; set -e
case "$code" in
  0) exit 0 ;;
  2) notify_drift drift.tfplan ;;
  *) notify_failure; exit 1 ;;
esac
```

### ❌ `apply -refresh-only`로 state만 맞추고 코드를 안 고친다

다음 plan은 여전히 되돌리기를 계획하므로 아무것도 해결되지 않았고, 누군가 무심코 apply하면 변경이 되돌려진다.

```console
$ terraform apply -refresh-only -auto-approve   # ❌ 여기서 끝낸다
# 다음날 다른 사람이 배포 -> desired_capacity 가 4 로 되돌아감
```

```console
# ✅ state 갱신과 코드 수정은 한 쌍이다
$ terraform plan -refresh-only
$ terraform apply -refresh-only   # 승인 후 state 를 현실에 맞춘다
# 코드 수정: desired_capacity 를 빼고 ignore_changes 를 걸거나 값을 6 으로 올린다
$ terraform plan                  # No changes. 가 나와야 끝난 것이다
```

### ❌ 경고 메시지에 값을 넣지 않는다

"검사 실패"만 있는 경고는 대응할 수 없다. 원문 예제들이 전부 `format()`으로 실제 값을 박아 넣는 데는 이유가 있다.

```terraform
# ❌ 어느 것이, 얼마나 나쁜지 알 수 없다
error_message = "인증서 만료 임박"
```

```terraform
# ✅ 무엇이 · 언제 · 지금 상태가 무엇인지 메시지 안에서 답이 나온다
error_message = format("ACM 인증서 %s 가 %s 에 만료된다. status=%s. 검증 레코드를 확인하라",
  aws_acm_certificate.api.domain_name, aws_acm_certificate.api.not_after,
  aws_acm_certificate.api.status)
```

## 프로덕션 노트

- **drift 잡의 자격증명을 배포 자격증명과 분리한다.** 필요한 권한은 `Describe*`/`Get*`/`List*`뿐이다. read-only 역할로 돌리면 스케줄러가 실수로 apply를 부르는 사고 자체가 불가능해지고, 락 테이블에 권한을 주지 않으면 `-lock=false`를 빼먹어도 안전 쪽으로 실패한다.

- **refresh는 read API 호출량을 그대로 늘린다.** state 여러 개에 drift 잡을 동시에 돌리면 `RequestLimitExceeded`가 나고 같은 시간의 배포까지 느려진다. provider의 `max_retries`(v6 기본값 **25**)에 기대기 전에 스케줄부터 분산시킨다([40장](40-performance-and-throttling.md)).

- **check 블록도 API 호출이고, `timestamp()`는 값이 매번 달라진다.** `check` 안의 `data`는 plan과 apply 양쪽에서 매번 평가되므로 무거운 조회는 정기 검증 전용 설정으로 분리한다. 시간 기준 임계값을 담은 `locals`를 리소스 인수에서도 참조하면 **매 plan마다 diff가 생기므로** check 전용으로 격리한다.

- **경고 피로를 관리한다.** check 실패는 apply를 막지 않아 방치되기 쉽고, 몇 주 두면 아무도 읽지 않는다. 기한을 붙이고 반복되면 1층·2층으로 승격시키거나 삭제한다. **읽히지 않는 경고는 없는 것보다 나쁘다.**

- **plan JSON을 날짜별로 아카이브하면 "이 변경이 언제 처음 나타났는가"를 되짚을 수 있다.** plan 파일 대신 JSON을 저장하는 이유는 plan 파일이 provider 버전에 묶여 있기 때문이다. **JSON에도 민감 속성이 들어가므로 버킷 암호화는 필수다.**

## 연습문제

1. **drift 탐지 파이프라인을 만든다.** VPC와 시큐리티 그룹 하나씩 apply한 뒤 `aws` CLI로 인바운드 규칙을 추가한다. `plan -detailed-exitcode`의 종료 코드를 확인하고, `terraform show -json` 결과에서 `jq`로 변경된 리소스 주소를 뽑는 스크립트를 작성한다.
   *성공 기준:* 규칙 추가 전 종료 코드가 `0`, 추가 후 `2`다. 스크립트가 시큐리티 그룹 주소를 정확히 하나 출력하고, 자격증명을 망가뜨렸을 때는 종료 코드 `1`을 받아 "drift"가 아닌 "실패"로 분기한다.

2. **`resource_drift`와 `resource_changes`가 갈리는 상황을 재현한다.** 코드가 관리하지 않는 속성(코드에 쓰지 않은 태그 키 등)을 AWS 쪽에서 추가한 뒤 plan을 돌리고 `terraform show -json`을 뽑는다.
   *성공 기준:* "`resource_drift`에는 있으나 `resource_changes`의 액션이 `no-op`인 리소스" 목록을 뽑는 `jq` 표현식을 작성하고 그 목록에 해당 리소스가 포함된다. 왜 "조용한 사고의 자리"인지 세 문장으로 적는다.

3. **만료 감시 check를 작성한다.** ACM 인증서를 만들고 `not_after`와 `timeadd(timestamp(), ...)`를 비교하는 check를 작성한 뒤, 임계값을 아주 크게(예: `"87600h"`) 잡아 일부러 실패시킨다.
   *성공 기준:* `Check block assertion failed` 경고가 나오면서도 **plan이 성공으로 끝난다.** 메시지에 도메인 이름과 실제 `not_after` 값이 들어 있고, 임계값을 되돌리면 경고가 사라진다.

4. **`ignore_changes`와 `check`를 짝으로 설계한다.** ASG의 `desired_capacity`에 `ignore_changes`를 걸고 그 값이 `min_size` 이상인지 검사하는 check를 작성한 뒤, `aws` CLI로 값을 `min_size`보다 낮춘다.
   *성공 기준:* 실행 계획은 비어 있고(`No changes.`) check 경고만 나온다. 같은 조건을 `precondition`으로 옮겼을 때 apply와 종료 코드가 어떻게 달라지는지 기록한다.

## 요약

- drift는 네 경로로 들어온다 — 사람의 콘솔 변경, 다른 자동화, AWS 자체 변경(`engine_version_actual`이 증거), 서비스의 값 정규화. 경로가 대응을 결정하며, 대응은 코드에 반영·되돌리기·`ignore_changes`로 양보 셋뿐이다.
- plan은 설정 읽기 → refresh → diff 3단계다. `-refresh=false`는 2단계를, `-refresh-only`는 3단계를 끈다. plan 출력의 위쪽 `Objects have changed` 블록은 2단계 결과, 아래쪽 실행 계획은 3단계 결과다. `-refresh=false`를 CI 기본값으로 박으면 drift 가시성을 전부 잃는다.
- `terraform apply -refresh-only`는 AWS에 쓰기 호출 없이 state만 현실에 맞춘다. 원문이 정한 v6 리전 마이그레이션 절차는 v6 업그레이드 → `apply -refresh-only` → `provider`를 `region`으로 교체 순서이며, state 갱신과 코드 수정은 항상 한 쌍이다.
- `terraform plan -detailed-exitcode`의 종료 코드는 `0`=diff 없음, `1`=에러, `2`=diff 있음이다. `1`과 `2`는 다른 알림으로 분기시키고, `ignore_changes`로 양보한 속성은 반드시 check로 감시한다.
- `check` 블록(Terraform 1.5+)은 `assert`의 `condition`이 false여도 **경고**만 내고 apply는 진행된다. 이것이 precondition/postcondition(에러, 중단)과의 결정적 차이다.
- `check` 안에는 `data` 블록을 하나 둘 수 있고 범위가 한정되며 조회 실패도 경고가 된다. 덕분에 코드가 만들지 않은 외부 상태를 매 실행마다 물어볼 수 있다. HCP Terraform의 continuous validation은 이 평가를 주기적으로 돌리고 이력을 모아 준다.
- 검증은 정적 → plan 시점 → 지속 3층이고, 3층에서 반복되는 문제는 왼쪽으로 승격시킨다. `terraform show -json`에서 `resource_drift`에는 있지만 `resource_changes`가 `no-op`인 리소스가 조용한 사고의 자리다.

## 다음으로

- [37장 — List Resource와 `terraform query`: 인프라 발견](37-list-resources-and-query.md) — 아직 state에 들어오지도 않은 리소스를 찾아내는 방법.
- [38장 — 대규모 코드 구조와 CI/CD 파이프라인](38-large-scale-structure-cicd.md) — drift 잡의 배치와 state 분할 전략.
- 공식 문서: [Continuous Validation examples](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/continuous-validation-examples)
