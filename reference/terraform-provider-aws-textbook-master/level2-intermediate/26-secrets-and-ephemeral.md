---
chapter: 26
level: "Level 2 — 중급"
title: "시크릿: ephemeral 리소스와 write-only 인수"
difficulty: 심화
reading_time: "34분"
prerequisites: [9, 13]
source_docs:
  - "website/docs/ephemeral-resources/secretsmanager_secret_version.html.markdown"
  - "website/docs/ephemeral-resources/secretsmanager_random_password.html.markdown"
  - "website/docs/ephemeral-resources/ssm_parameter.html.markdown"
  - "website/docs/ephemeral-resources/kms_secrets.html.markdown"
  - "website/docs/ephemeral-resources/eks_cluster_auth.html.markdown"
  - "website/docs/r/ssm_parameter.html.markdown"
  - "website/docs/r/secretsmanager_secret.html.markdown"
  - "website/docs/r/db_instance.html.markdown"
  - "website/docs/r/rds_cluster.html.markdown"
  - "website/docs/r/acm_certificate.html.markdown"
  - "website/docs/r/kms_key.html.markdown"
  - "website/docs/d/secretsmanager_secret_version.html.markdown"
  - "website/docs/d/ssm_parameter.html.markdown"
  - "docs/add-a-new-ephemeral-resource.md"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/ephemeral-resources/secretsmanager_secret_version"
provider_baseline: "6.x"
---

# 26장 — 시크릿: ephemeral 리소스와 write-only 인수

**이 장에서 배우는 것**

- state가 평문이라는 사실과 `sensitive = true` 가 무엇만 가리는지를 구분하고, 어떤 인수가 state에 남는지 문서에서 미리 찾을 수 있다.
- `ephemeral` 블록으로 시크릿을 apply 중에만 존재하는 값으로 다루고, 참조할 수 있는 위치와 없는 위치를 구분할 수 있다.
- write-only 인수(`*_wo`)와 `*_wo_version` 정수의 동작 원리를 설명하고 `aws_ssm_parameter` · `aws_db_instance` · `aws_rds_cluster` · `aws_acm_certificate` 의 실제 인수명을 골라 쓸 수 있다.
- 시크릿 라이프사이클 세 설계안을 비교하고 각 안이 state에 남기는 것을 계산할 수 있다.
- KMS 키와 키 정책으로 암호화 경계를 세우고, 로테이션되는 값과 설정이 충돌하지 않게 경계를 그을 수 있다.

**왜 중요한가**

보안 감사에서 이런 지적을 받았다고 하자. "state 버킷 읽기 권한을 개발자 14명 전원이 갖고 있으며, 그 객체에는 프로덕션 RDS 마스터 비밀번호가 평문으로 들어 있습니다." 팀은 억울해한다 — 코드 어디에도 비밀번호를 적지 않았고, 변수는 `sensitive = true` 였으며, plan 출력에도 `(sensitive value)` 로만 나왔기 때문이다. 그런데 `terraform state pull` 을 뜯어 보면 `"password": "Pr0d-Db-2024!"` 가 그대로 보인다. `sensitive` 는 **CLI 출력만** 가린다.

더 조용한 경로도 있다. `data "aws_secretsmanager_secret_version"` 으로 시크릿을 읽기만 해도 평문이 그 데이터 소스의 state 항목으로 복사된다. SSM SecureString도 마찬가지다 — 원문은 "The unencrypted value of a SecureString will be stored in the raw state as plain-text" 라고 못박는다. Parameter Store에서는 KMS 권한이 있는 사람만 볼 수 있던 값이 state에서는 버킷 읽기 권한만으로 보이는 값이 된다. 암호화 경계가 통째로 무너진 것이다.

Terraform 1.10의 **ephemeral resource**와 1.11의 **write-only 인수**가 이 구조를 처음으로 바꿨다. 값이 state에도 plan 파일에도 저장되지 않고 apply 중에만 메모리에 존재하는 경로가 생겼고, AWS provider는 그 위에 ephemeral 리소스 10개와 `*_wo` 인수를 얹었다.

## state에 무엇이 남는가

Terraform state는 **JSON 문서이고 암호화되지 않는다.** 백엔드가 저장소 단에서 암호화할 수는 있지만(S3 SSE 등) 접근 권한이 있는 주체에게는 투명하다. 규칙은 단순하다 — **리소스가 아는 모든 인수와 속성이 들어간다.** `aws_db_instance` 문서는 "All arguments including the username and password will be stored in the raw state as plain-text" 를 상단 경고로 못박는다.

자주 새는 경로 넷을 외워 둘 만하다. **RDS 마스터 비밀번호**(`aws_db_instance.password`, `aws_rds_cluster.master_password` — 두 문서 모두 "it will be stored in the state file" 을 인수 설명에 직접 써 놨다), **Secrets Manager 값 읽기**(`data "aws_secretsmanager_secret_version"` 의 `secret_string` / `secret_binary`), **SSM SecureString**(`aws_ssm_parameter` 와 그 데이터 소스의 `value`), **인증서 개인 키**(`aws_acm_certificate.private_key`).

`sensitive = true` 는 이 중 어느 것도 막지 못한다. 이 표시는 화면 출력에서 값을 `(sensitive value)` 로 대체할 뿐이고, state 직렬화, plan 파일(`-out=tfplan`), `terraform show -json` 에는 그대로 나온다. **`sensitive` 는 어깨 너머로 보는 사람을 막는 기능이지 저장을 막는 기능이 아니다.**

## `ephemeral` 블록: 저장되지 않는 값

Terraform 1.10이 도입한 ephemeral resource가 이 문제를 언어 차원에서 푼다. 기여자 문서의 정의가 가장 짧다 — "Ephemeral resources produce ephemeral values and are never stored in the state."

문법은 `resource` / `data` 와 나란한 최상위 블록이고, 참조에 `ephemeral.` 접두사가 붙는다 — `ephemeral "aws_secretsmanager_secret_version" "db" { secret_id = ... }` 를 선언하면 `ephemeral.aws_secretsmanager_secret_version.db.secret_string` 으로 읽는다.

동작도 다르다. 일반 리소스가 Create/Read/Update/Delete 라이프사이클을 갖는 것과 달리 ephemeral은 **Open — (Renew) — Close** 를 갖는다. Terraform이 값이 필요해질 때 열고 끝나면 닫으며, AWS provider에서는 `Open` 핸들러 하나로 끝나는 경우가 대부분이다. 구현이 Plugin Framework 전용이라는 점도 알아 둘 만하다([42장](../level3-advanced/42-provider-architecture.md)).

결과가 중요하다. 값은 apply가 도는 동안 메모리에만 존재한다 — state에 항목이 생기지 않고 plan 파일에 직렬화되지 않는다. 그래서 **다음 실행에서 값을 다시 얻으려면 다시 Open해야 한다.** 매 plan/apply마다 AWS API를 호출한다는 뜻이고, 이것은 비용이자 안전장치(오래된 복사본이 없다)다.

## ephemeral 값을 어디에 쓸 수 있는가

ephemeral 값에는 강한 제약이 붙는다. **저장되는 곳으로 흘러 들어갈 수 없다** — 그렇지 않으면 저장되지 않는다는 보장이 깨진다. Terraform은 이를 정적으로 검사해 apply 이전에 막는다. 허용 위치는 다섯이다 — 다른 ephemeral 리소스의 인수, **provider 설정**, 리소스의 **write-only 인수**, `ephemeral = true` 로 선언한 variable과 output, `provisioner` / `connection` 블록.

금지되는 위치는 그 반대 전부 — 일반 리소스의 일반 인수, 일반 output, `local` 을 거치는 우회 경로. `locals` 자체는 ephemeral 값을 담을 수 있지만 그 local을 저장되는 곳에 쓰는 순간 에러가 난다. provider 설정에 넘기는 형태가 원형이다.

```terraform
ephemeral "aws_eks_cluster_auth" "this" {
  name = data.aws_eks_cluster.this.id
}

provider "kubernetes" {
  host  = data.aws_eks_cluster.this.endpoint
  token = ephemeral.aws_eks_cluster_auth.this.token
}
```

이전 세대의 같은 코드는 `data "aws_eks_cluster_auth"` 를 썼고, 그 결과 **클러스터 bearer 토큰이 state에 저장됐다.** 토큰은 유효기간이 짧지만 state를 훔친 사람이 그 직후에 쓰면 클러스터 관리자 권한을 얻는다. `data` 를 `ephemeral` 로 바꾸는 것만으로 이 항목이 사라진다.

모듈 인터페이스로 시크릿을 받을 때는 variable에도 `sensitive = true` 와 `ephemeral = true` 를 함께 단다. 둘은 다른 축이다 — 전자는 출력 마스킹, 후자는 저장 금지. 다만 `ephemeral = true` 를 켜면 그 값은 위 허용 위치로만 흘려보낼 수 있으므로, 기존 모듈을 고칠 때는 그 값이 어디로 가는지부터 추적한다.

## AWS provider의 ephemeral 리소스

v6 기준으로 AWS provider는 ephemeral 리소스 10개를 제공하며 문서도 `website/docs/ephemeral-resources/` 로 분리돼 있다. 같은 이름의 리소스·데이터 소스·ephemeral이 셋 다 존재하는 경우가 흔하므로 **인수표를 매번 다시 읽는 습관**이 필요하다. 앞에서 본 `aws_eks_cluster_auth`(`name` Required, `token` 을 내보냄) 외에 넷을 본다.

### `aws_secretsmanager_secret_version`

시크릿의 **값**을 읽는다(메타데이터는 `data "aws_secretsmanager_secret"` 담당). `secret_id` 만 Required이며 ARN이든 이름이든 받는다. `version_stage` 는 기본 `AWSCURRENT` 이고 `version_id` 를 주면 그것을 덮어쓴다. 속성은 `secret_string`, `secret_binary`, `version_id`, `version_stages`, `arn`, `created_date` 이고, 키-값 JSON 관례가 흔하므로 `jsondecode(...)["password"]` 로 꺼내 쓴다. 데이터 소스판과 이름 차이가 하나 있다 — 데이터 소스는 `arn` 이 **deprecated이고 `secret_arn` 을 쓰라고 안내**하지만 ephemeral판은 `arn` 을 그대로 내보낸다.

### `aws_ssm_parameter`

Parameter Store 값을 읽는다. 주의할 점 — **ephemeral판은 `arn` 이 Required이고 `name` 이 아니다.** 데이터 소스는 `name` 을 받고 `name:version` 으로 버전을 지정하는데 ephemeral판은 `arn = aws_ssm_parameter.api_key.arn` 처럼 ARN만 받는다. `with_decryption` 은 양쪽 다 기본 `true` 다. 속성은 `name`, `type`, `value`, `version`, `with_decryption`.

### `aws_secretsmanager_random_password`

Secrets Manager의 `GetRandomPassword` 를 호출해 임의 비밀번호를 받는다. **가장 단순한 형태는 인수가 하나도 없다** — `ephemeral "aws_secretsmanager_random_password" "db" {}` 만으로 동작한다. Optional 인수는 `password_length`, `exclude_characters`, `exclude_lowercase` / `_numbers` / `_punctuation` / `_uppercase`, `include_space`, `require_each_included_type` 이고 속성은 `random_password` 하나다.

성격이 `random_password`(hashicorp/random provider)와 결정적으로 다르다. 후자는 **값을 state에 저장해 다음 실행에 같은 값을 재현한다** — 그게 존재 이유다. ephemeral 쪽은 저장하지 않아 **매 실행마다 다른 값이 나온다.** 따라서 "생성 즉시 write-only로 밀어 넣고 이후에는 Secrets Manager를 진실의 원천으로 삼는" 흐름에서만 쓸 수 있다. `exclude_characters` 는 자주 쓴다 — RDS 엔진마다 금지 문자가 다르기 때문이다.

### `aws_kms_secrets`

KMS로 암호화된 ciphertext를 apply 중에 복호화한다. 암호문(`ephemeral "aws_kms_secrets" "x" { secret { name = "...", payload = "AQECAH..." } }`)을 저장소에 커밋해 두고 복호화 권한이 있는 실행 주체만 값을 얻는 방식이다.

`secret` 블록이 Required이고 여러 개 나열할 수 있다. 각 블록에서 `name` 과 `payload`(base64 ciphertext)가 Required, `context`(Encryption Context)·`grant_tokens`·`encryption_algorithm`·`key_id` 가 Optional이며 **뒤의 둘은 비대칭 KMS 키로 암호화한 경우에만 필요**하다. 결과는 `plaintext` 맵이고 키는 각 `secret` 의 `name` 이다.

원문이 붙여 놓은 함정 둘. **파일 끝 개행이 그대로 복호화된다** — payload를 만들 때 `echo -n` 을 쓰지 않으면 비밀번호 끝에 개행이 붙어 인증 실패로 나타난다. 비대칭 키에서 암호화·복호화 알고리즘을 맞추지 않으면 `IncorrectKeyException` 이 난다. 값을 바꿀 때 사람이 재암호화해 커밋해야 해 로테이션 자동화가 어렵고, 거의 바뀌지 않는 부트스트랩 값에 어울린다.

## write-only 인수: `*_wo` 와 `*_wo_version`

ephemeral 리소스가 값을 **가져오는** 쪽이라면 값을 **리소스에 넣는** 쪽이 write-only 인수다(Terraform 1.11+). 일반 인수는 설정 값이 state에 저장되고 다음 plan에서 state와 설정을 비교해 변경을 감지한다. write-only 인수는 **저장을 포기한다** — 값은 API 호출에만 쓰이고 버려진다. 그러면 비교할 것이 없어 변경을 감지할 수 없어서 짝이 되는 정수 인수가 따라온다. 이름은 언제나 `<인수명>_wo_version` 이고 **이 정수만 state에 저장된다.** 정수가 바뀌면 값이 바뀐 것으로 간주하고 업데이트한다.

write-only 인수를 가진 리소스는 문서 상단에 "Note: Write-Only argument `value_wo` is available to use in place of `value`" 형태의 안내가 붙는다. **이 줄이 있는지가 지원 여부를 판별하는 가장 빠른 방법이다.** 확인되는 조합을 정리하면 이렇다.

| 리소스 | 일반 인수 | write-only 인수 | 버전 인수 |
|---|---|---|---|
| `aws_ssm_parameter` | `value` | `value_wo` | `value_wo_version` |
| `aws_db_instance` | `password` | `password_wo` | `password_wo_version` |
| `aws_rds_cluster` | `master_password` | `master_password_wo` | `master_password_wo_version` |
| `aws_acm_certificate` | `private_key` | `private_key_wo` | `private_key_wo_version` |

`aws_ssm_parameter` 가 규칙을 가장 또렷하게 보여 준다. 문서는 `value`, `value_wo`, `insecure_value` 셋 중 **정확히 하나가 필수**라고 못박고, `value_wo` 설명에 "write-only values are never stored to state ... `value_wo_version` ... is required with this argument" 라고 적는다. 속성 쪽의 `has_value_wo` 불리언은 값 대신 "설정돼 있는가"만 state에 남긴다 — 설계의 성격을 이 속성 하나가 요약한다. 반대편의 `insecure_value` 는 **plan 출력에서 절대 sensitive로 표시되지 않는다**는 점이 존재 이유이고 `type = "SecureString"` 과 함께 쓸 수 없다.

조립하면 이렇게 된다.

```terraform
ephemeral "aws_secretsmanager_secret_version" "db" {
  secret_id = data.aws_secretsmanager_secret.db.id
}

resource "aws_db_instance" "app" {
  identifier          = "app-prod"
  engine              = "postgres"
  instance_class      = "db.t3.medium"
  allocated_storage   = 50
  username            = "appadmin"
  password_wo         = jsondecode(ephemeral.aws_secretsmanager_secret_version.db.secret_string)["password"]
  password_wo_version = var.db_password_version
  # ... 나머지 설정 ...
}
```

state에 남는 것은 `password_wo_version` 값 — 예컨대 `3` — 뿐이다. 비밀번호 자체는 어디에도 없다.

### `*_wo_version` 을 무엇으로 채울 것인가

이 정수를 어떻게 관리하느냐가 실전의 전부다. **변수로 손 관리**하는 방식이 가장 명시적이다 — 시크릿을 바꿀 때 사람이 올리고 커밋이 감사 기록이 된다. 잊으면 Secrets Manager 값만 바뀐 채 조용히 어긋난다는 것이 단점이다. **시크릿의 `version_id` 에 연동**하고 싶어지지만 이 경로는 막혀 있다 — 문자열이기도 하고, 무엇보다 `*_wo_version` 은 **state에 저장되는 인수**라 ephemeral 값을 넣을 수 없다. 자동화에 맞는 것은 **외부 신호로 계산**하는 방식으로, 로테이션 시스템이 버전 카운터를 관리하고 Terraform은 Parameter Store의 일반 String 파라미터를 읽어 `password_wo_version = tonumber(data.aws_ssm_parameter.db_password_version.value)` 로 받는다. 이 값은 비밀이 아니므로 state에 남아도 무해하다. 문서는 "Increment this value when an update is required" 라고만 말한다 — **달라지면** 트리거되는 구조라 방향보다 변화 자체가 신호이지만, 단조 증가를 지키는 편이 읽기에 낫다.

## 시크릿 라이프사이클 설계 3안

"비밀번호를 누가 만들고, 누가 갖고 있고, 누가 바꾸는가." 이 세 질문의 답이 설계안을 가른다.

### (a) AWS가 만들고 Terraform은 참조만 한다

`manage_master_user_password = true` 를 켜면 RDS가 마스터 비밀번호를 Secrets Manager에 직접 관리한다. **`password` 를 아예 쓰지 않는다.**

```terraform
resource "aws_db_instance" "app" {
  identifier                    = "app-prod"
  engine                        = "postgres"
  instance_class                = "db.t3.medium"
  username                      = "appadmin"
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.db.key_id
  # ... 나머지 설정 ...
}
```

문서가 명시하는 제약이 둘이다. 이 인수는 **`password` 나 `password_wo` 와 함께 설정할 수 없고**, 기존 인스턴스를 전환하려면 `password` 를 **제거해야** 한다("removal is required"). 만들어진 시크릿은 읽기 전용 `master_user_secret` 블록으로 노출되며 `secret_arn`, `kms_key_id`, `secret_status`(`creating` / `active` / `rotating` / `impaired`)를 담는다. Terraform은 ARN만 알고 값은 모른다 — 애플리케이션이 런타임에 그 ARN으로 읽는다. **state에 비밀번호가 없고 ephemeral도 write-only도 필요 없다.** 새 RDS라면 이게 기본값이어야 한다. 한계는 RDS/Aurora 전용이라는 것, 그리고 값을 모르므로 같은 코드에서 그 비밀번호로 DB 안에 스키마나 사용자를 만드는 후속 작업을 이어 붙일 수 없다는 것이다.

### (b) ephemeral로 읽어 즉시 쓴다

진실의 원천이 이미 Secrets Manager나 Parameter Store에 있고 그 값을 다른 리소스에 주입해야 하는 경우다. 앞에서 조립한 `ephemeral` + `*_wo` 조합이 이 안이고 state에는 `*_wo_version` 정수만 남는다. 이 안은 **시크릿 생성을 Terraform 밖으로 밀어낸다** — 사람이 콘솔에서 넣거나 온보딩 스크립트나 로테이션 Lambda가 갱신한다. 시크릿 소유 팀과 인프라 팀이 다른 조직에서 자연스러운 경계다.

### (c) Terraform이 생성해 Secrets Manager에 넣는다

시크릿을 만드는 주체 자체가 없는 부트스트랩 상황이다.

`aws_secretsmanager_secret` 으로 그릇을 만들고 `ephemeral "aws_secretsmanager_random_password"` 로 값을 뽑는 데까지는 안전하다 — 그 리소스는 **메타데이터만** 다룬다. 갈림길은 값을 넣는 순간이다. `aws_secretsmanager_secret_version` 에 **일반 인수를 쓰면 평문이 state에 저장되고**, 그러면 (c)는 (a)/(b)의 이점을 전부 잃는다. `random_password`(random provider) + 일반 인수 조합이 오래 표준이었던 것은 다른 선택지가 없었기 때문이지 안전해서가 아니다 — 그 방식은 **비밀번호를 두 곳(random 리소스의 state, secret version의 state)에 남긴다.** 그래서 (c)를 고를 때는 값을 넣는 리소스가 write-only를 지원하는지 문서 상단 안내로 먼저 확인하고, 지원하지 않으면 "state에 시크릿이 남는 안"임을 인정한 뒤 채택 여부를 정한다.

`recovery_window_in_days` 도 이 안에서 자주 문다. 기본 `30` 이라 destroy해도 30일간 이름이 예약되고 같은 이름으로 다시 만들려는 CI가 막힌다. 유효값은 `0`(즉시 삭제) 또는 `7`~`30` 이다.

## KMS: 암호화 경계를 코드로 세우기

Secrets Manager와 SSM SecureString은 둘 다 KMS로 값을 감싼다. 계정 기본 키(`aws/secretsmanager`)를 쓰면 접근 통제가 사실상 IAM 정책에만 달리지만, 고객 관리 키(CMK)를 쓰면 키 정책이라는 두 번째 관문이 생긴다.

인수 넷만 짚는다. `enable_key_rotation` 은 **기본이 `false`** 라 켜야 하고, `rotation_period_in_days`(90~2560)를 쓰려면 이것이 켜져 있어야 한다. `deletion_window_in_days` 는 7~30이고 미설정 시 30이며 그 기간 동안 키를 되살릴 수 있다. `multi_region` 은 기본 `false` 다.

키 정책은 IAM 정책과 다른 질문 — **"이 키를 누가 쓸 수 있는가"** — 에 답한다. 원문 경고가 중요하다. 키 정책은 `aws_kms_key` 의 `policy` 인수로도 별도 리소스 `aws_kms_key_policy` 로도 설정할 수 있는데 **둘 다 쓰면 서로 덮어써 불일치가 난다** — 하나만 고른다. 또 문서는 "All KMS keys must have a key policy" 라고 적고, 정책을 지정하지 않으면 AWS가 기본 정책을 붙여 **계정의 모든 주체에게 사실상 모든 KMS 작업을 위임**한다고 설명한다. 생략은 "닫힌 상태"가 아니라 "IAM에 전부 위임한 상태"다. `bypass_policy_lockout_safety_check`(기본 `false`)는 켜지 않는다 — 켠 채로 자기 자신을 배제한 정책을 붙이면 **키를 다시는 관리할 수 없다.**

## 로테이션과 Terraform은 서로를 모른다

시크릿이 로테이션되면 값이 바뀐다. Terraform이 그 값을 자기가 정한 것으로 알고 있으면 다음 plan에서 되돌리려 든다 — **로테이션 Lambda가 새 비밀번호를 넣고 다음 날 아침 apply가 옛 값으로 되돌리는** 것이 가장 흔한 사고다. 규칙은 하나다. **로테이션 주체가 소유하는 값은 Terraform이 인수로 갖지 않는다.**

- (a)안이면 문제가 없다 — Terraform은 애초에 값을 모른다.
- (b)안이면 ephemeral로 매번 새로 읽으므로 오래된 값이 없다. `*_wo_version` 만 로테이션 신호와 맞춘다.
- 값을 인수로 들고 있어야 한다면 `lifecycle { ignore_changes = [...] }` 로 그 인수를 관심 밖으로 옮긴다. 값 자체는 여전히 state에 있지만 되돌리는 사고는 막는다([21장](21-lifecycle-meta-arguments.md)).

로테이션 설정 자체는 `aws_secretsmanager_secret_rotation` 이 담당한다 — 메타데이터·값·로테이션이 세 리소스로 갈라져 있는 것은 [12장](../level1-beginner/12-s3-bucket.md)의 S3와 같은 분리 원칙이다.

## state 접근 권한이 곧 시크릿 접근 권한이다

ephemeral과 write-only를 다 쓰더라도 state에는 값이 남는다 — ARN, 엔드포인트, 리소스 ID, 태그, 그리고 write-only를 지원하지 않는 리소스의 모든 인수. [16장](16-remote-state-and-backends.md)의 결론대로 state 버킷은 SSE-KMS와 버킷 정책으로 잠그고 읽기 권한은 배포 role에만 주며, 버전 관리를 켜되 **과거 버전에도 옛 시크릿이 남는다**는 점 때문에 보존 기간을 정한다.

CI에서는 축이 셋으로 늘어난다. **로그** — apply가 시크릿을 출력하지 않아도 provider 에러 메시지에 값이 섞일 수 있다(`aws_db_instance` 문서의 "this may show up in logs"가 그 얘기다). `TF_LOG=DEBUG` 는 요청 본문을 찍으므로 상시로 켜지 않는다. **아티팩트** — `-out=tfplan` 은 `sensitive` 를 존중하지 않으므로 저장한다면 state와 같은 등급으로 다룬다. **자격증명** — 러너는 [25장](25-multi-account.md)의 OIDC 방식이 낫다.

## 흔한 실수

### ❌ `sensitive = true` 면 안전하다고 믿기

```terraform
variable "db_password" {
  type      = string
  sensitive = true             # plan 출력만 가려진다
}

resource "aws_db_instance" "app" {
  password = var.db_password   # state에 평문으로 저장됨
}
```

```terraform
# ✅ 값을 저장하지 않는 경로로 바꾼다
resource "aws_db_instance" "app" {
  password_wo         = ephemeral.aws_secretsmanager_secret_version.db.secret_string
  password_wo_version = var.db_password_version
}
```

### ❌ ephemeral 값을 일반 output으로 내보내기

`ephemeral = true` 가 없는 output에 넣으면 apply 이전에 에러가 난다.

```terraform
output "db_password" {
  value     = ephemeral.aws_secretsmanager_secret_version.db.secret_string
  sensitive = true
}
```

```terraform
# ✅ 값이 아니라 참조 방법을 내보낸다 — 런타임에 이 ARN으로 읽게 한다
output "db_secret_arn" {
  value = data.aws_secretsmanager_secret.db.arn
}
```

### ❌ `value_wo` 만 쓰고 `value_wo_version` 을 빼먹기

문서는 `value_wo_version` 이 이 인수와 **함께 필수**라고 적는다. 없으면 값 변경을 감지할 방법이 없다.

```terraform
resource "aws_ssm_parameter" "api_key" {
  name     = "/app/prod/api-key"
  type     = "SecureString"
  value_wo = ephemeral.aws_secretsmanager_secret_version.api.secret_string
  # value_wo_version 없음 -> 시크릿을 바꿔도 Parameter Store는 그대로
}
```

```terraform
# ✅ 버전 정수를 함께 관리한다
resource "aws_ssm_parameter" "api_key" {
  name             = "/app/prod/api-key"
  type             = "SecureString"
  key_id           = aws_kms_key.secrets.key_id
  value_wo         = ephemeral.aws_secretsmanager_secret_version.api.secret_string
  value_wo_version = var.api_key_version   # 시크릿을 갱신할 때 함께 올린다
}
```

### ❌ 시크릿을 읽으려고 데이터 소스를 쓰기

데이터 소스는 값을 state에 저장한다. provider 설정이나 write-only 인수로 갈 값이라면 ephemeral을 쓴다.

```terraform
data "aws_ssm_parameter" "db_url" {
  name = "/app/prod/db-url"     # 복호화된 값이 state에 남는다
}

# ✅ 같은 값을 ephemeral로 읽는다 (인수가 arn 인 점에 주의)
ephemeral "aws_ssm_parameter" "db_url" {
  arn = aws_ssm_parameter.db_url.arn
}
```

## 프로덕션 노트

- **버전 요구사항을 코드에 박아 둔다.** ephemeral은 Terraform 1.10 이상, write-only는 1.11 이상이 필요하다. `required_version` 을 올리지 않으면 오래된 CLI를 쓰는 러너에서 문법 에러로 나타나 원인을 찾는 데 시간이 걸린다.
- **ephemeral은 실행마다 API를 호출한다.** plan과 apply 양쪽에서 Open이 일어나 `GetSecretValue` 호출이 리소스 개수 × 실행 횟수로 늘어난다. `for_each` 로 수십 개를 각각 읽으면 스로틀링에 걸릴 수 있으니 여러 값을 JSON 하나에 묶는다.
- **기존 state에 남은 시크릿은 코드를 고쳐도 사라지지 않는다.** `password` 를 `password_wo` 로 바꿔도 **과거 state 버전에는 평문이 남아 있다.** 전환 후에는 반드시 로테이션한다.
- **`recovery_window_in_days` 가 임시 환경의 CI를 막는다.** 기본 30일 동안 이름이 예약되므로 PR마다 환경을 만들었다 지우는 파이프라인은 두 번째 실행부터 실패한다. 임시 환경 모듈에서는 `0` 또는 `7` 로 낮춘다.
- **감사 질문에 기계적으로 답할 준비를 한다.** "state에 시크릿이 있는가"는 `terraform show -json | jq` 로 점검된다. 알려진 키 이름이 나타나면 파이프라인을 실패시키는 가드레일이 실효적이다.

## 연습문제

1. Secrets Manager 시크릿(JSON: `username`, `password`)을 `ephemeral` 로 읽어 `aws_db_instance` 의 `password_wo` 에 넘기고 `password_wo_version` 을 변수로 받는 구성을 작성하라. *성공 기준:* apply 후 `terraform show -json` 출력에서 비밀번호 문자열이 검색되지 않고 `password_wo_version` 만 state에 존재한다.

2. 같은 값을 `data "aws_ssm_parameter"` 와 `ephemeral "aws_ssm_parameter"` 두 버전으로 읽고 `terraform state pull` 출력을 비교하라. *성공 기준:* 데이터 소스 쪽에는 `value` 가 평문으로 나타나고 ephemeral 쪽에는 항목 자체가 없음을 확인했으며, 두 쪽의 필수 인수 이름이 다르다는 것을 설명할 수 있다.

3. `manage_master_user_password = true` 인 RDS 인스턴스를 만들어 `master_user_secret[0].secret_arn` 을 출력한 뒤, 이 인스턴스에 `password` 인수를 추가해 plan을 돌려 보라. *성공 기준:* 두 인수를 함께 설정할 수 없다는 에러를 재현했고 어느 쪽을 제거해야 하는지 문서 근거를 들어 설명할 수 있다.

## 요약

- Terraform state는 암호화되지 않은 JSON이고 리소스가 아는 모든 값이 들어간다. `sensitive = true` 는 CLI 화면 출력만 가리며 state·plan 파일에는 영향이 없다.
- `aws_db_instance.password`, `aws_rds_cluster.master_password`, `data.aws_secretsmanager_secret_version.secret_string`, SecureString `value` 는 모두 평문으로 state에 남는다.
- `ephemeral` 블록(1.10+)의 값은 다른 ephemeral·provider 설정·write-only 인수·`ephemeral = true` variable/output·provisioner로만 흘려보낼 수 있다. 핵심 리소스는 `aws_secretsmanager_secret_version`(`secret_id` Required), `aws_ssm_parameter`(**`arn` Required** — 데이터 소스와 다름), `aws_secretsmanager_random_password`, `aws_kms_secrets`, `aws_eks_cluster_auth` 다.
- write-only 인수(1.11+)는 값 대신 `*_wo_version` 정수만 저장한다. 확인된 조합은 `value_wo`(SSM), `password_wo`(db_instance), `master_password_wo`(rds_cluster), `private_key_wo`(acm_certificate)이며 모두 `_wo_version` 을 함께 요구한다.
- RDS의 `manage_master_user_password = true` 는 `password`/`password_wo` 와 병용 불가이고, 전환 시 기존 `password` 를 제거해야 하며, 결과는 `master_user_secret` 블록으로만 노출된다.
- KMS 키는 `enable_key_rotation` 이 기본 `false` 이고, 키 정책을 `aws_kms_key.policy` 와 `aws_kms_key_policy` 양쪽에 두면 서로 덮어쓴다.
- 코드를 고쳐도 과거 state 버전의 평문은 남는다 — 전환 뒤에는 로테이션과 state 이력 정리가 함께 필요하다.

## 다음으로

- [27장 — VPC 네트워킹 실전](27-vpc-networking.md) — 시크릿이 오가는 경로를 사설망에 두는 법. VPC 엔드포인트로 Secrets Manager를 NAT 없이 호출한다.
- [16장 — 원격 State와 백엔드](16-remote-state-and-backends.md) — state 저장소의 암호화·잠금·접근 제어.
- 공식 문서: [Ephemeral: aws_secretsmanager_secret_version](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/ephemeral-resources/secretsmanager_secret_version), [aws_ssm_parameter](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter)
