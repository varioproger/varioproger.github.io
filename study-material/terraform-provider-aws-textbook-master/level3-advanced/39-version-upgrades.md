---
chapter: 39
level: "Level 3 — 고급"
title: "메이저 버전 업그레이드: 미루면 이자가 붙는 부채"
difficulty: 심화
reading_time: "33분"
prerequisites: [16, 22, 24]
source_docs:
  - "website/docs/guides/version-6-upgrade.html.markdown"
  - "website/docs/guides/version-5-upgrade.html.markdown"
  - "website/docs/guides/version-4-upgrade.html.markdown"
  - "website/docs/guides/enhanced-region-support.html.markdown"
  - "docs/breaking-changes.md"
  - "docs/changelog-process.md"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/version-6-upgrade"
provider_baseline: "6.x"
---

# 39장 — 메이저 버전 업그레이드: 미루면 이자가 붙는 부채

**이 장에서 배우는 것**

- provider가 정의하는 "파괴적 변경"의 경계를 알고, 어떤 변경이 마이너에 들어올 수 있고 어떤 것이 메이저를 기다려야 하는지 판별할 수 있다.
- 최신 패치 선행 → 깨끗한 plan → 제약 완화 → `-upgrade` → 비운영 → `-refresh-only` → 코드 수정 → 운영으로 이어지는 절차서를 실행할 수 있다.
- v6의 파괴적 변경을 개별 항목이 아니라 **카테고리 지도**로 파악하고 자기 코드베이스에 해당하는 것만 골라낼 수 있다.
- `.changelog/` 항목과 CHANGELOG 카테고리를 읽어 릴리스가 자신에게 영향을 주는지 빠르게 판단할 수 있다.
- 수십 개 스택을 순차 업그레이드하는 웨이브 계획을 세우고, 롤백이 불가능해지는 지점을 미리 표시할 수 있다.

**왜 중요한가**

업그레이드를 미루는 결정은 언제나 합리적으로 보인다. 이번 분기에는 릴리스가 급하고, provider를 올리면 무엇이 깨질지 모르고, 지금 코드는 잘 돌아간다. 그래서 `version = "~> 4.67"`이 `.tf` 파일 맨 위에 3년째 남고, 그 사이 조직은 작년에 나온 서비스의 리소스가 없어 콘솔에서 손으로 만든 뒤 "Terraform 관리 밖"이라고 위키에 적는다. 부채는 이자를 붙여 자란다 — v4에서 v6으로 두 단계를 건너뛰는 업그레이드는 v4→v5, v5→v6을 순서대로 하는 것보다 **훨씬 어렵다**. 중간 단계에서 deprecation 경고로 알려 주던 변경이 건너뛰면 경고 없이 에러로 나타나기 때문이다.

증상은 대개 이렇다. 금요일 오후에 누군가 `terraform init -upgrade`를 실행하고 plan이 아니라 **에러 수십 개**가 쏟아진다. 어느 것부터 고칠지, 몇 개가 state까지 건드리는지 아무도 모른다. 사람들은 lock 파일을 되돌리지만, 이미 apply를 한 번이라도 했다면 **state는 되돌아오지 않는다**. 메이저 업그레이드가 예측 불가능해지는 것은 provider 탓이 아니라 **절차를 건너뛸 때**다.

## 파괴적 변경의 정의

provider 저장소는 파괴적 변경을 **기존 배포를 유지하기 위해 사용자가 이미 유효했던 구성을 고쳐야 하는 모든 변경**으로 정의하고, 보통 이것은 "provider를 올린 뒤 `terraform plan`에 예상치 못한 diff가 없어야 한다"는 뜻이라고 덧붙인다. **판정 기준은 코드가 아니라 plan이다.**

여기 해당하는 것은 리소스·데이터 소스·ephemeral 리소스·list 리소스·provider 함수의 **제거**, 속성 제거, 이전 이름을 지원하지 않는 속성 **이름 변경**, Optional을 **Required로** 만드는 것, 속성에서 **Computed 제거**, **검증 강화**, **기본값 변경**, 그리고 생성·수정·import 방식을 바꿔 기대 동작을 바꾸는 변경이다. 반대로 **아닌** 것은 리소스·함수의 **추가**, Optional/Computed-only 속성 추가, 검증을 **덜 엄격하게** 만드는 것, 문서에 맞게 동작을 교정하는 **버그 수정**이다.

가이드라인 세 줄이 정책의 전부다. **파괴적 변경은 메이저를 요구한다. 제거 전에 먼저 deprecate한다. 마이너·패치에서 예상치 못한 plan diff는 없다.** 두 번째 줄이 절차의 근거다.

## 미루면 실제로 무엇을 잃는가

**신규 서비스를 못 쓴다.** 새 리소스는 최신 메이저 라인에만 추가된다. v4에 머무는 조직은 v5·v6의 리소스를 쓸 수 없고, 결과는 **인프라 일부가 Terraform 밖으로 새어 나가는 것**이다 — 콘솔에서 만든 리소스는 태그 표준도 리뷰도 drift 감지도 받지 않는다([36장](36-drift-refresh-and-checks.md)).

**변경의 폭이 누적된다.** v5는 EC2-Classic 은퇴 하나로 리소스 3종과 인수 십수 개를, v6은 OpsWorks Stacks 17개와 SimpleDB·Worklink를 지웠다. 한 단계씩이면 각각 한 종류의 문제지만 건너뛰면 **두 종류가 얽힌 채로** 나타난다. 게다가 v5에서 경고만 뜨던 것들(`aws_eip`의 `vpc`, `aws_eks_addon`의 `resolve_conflicts`, `aws_flow_log`의 `log_group_name`, `aws_ssm_association`의 `instance_id`)이 v6에서 **제거**되었다.

v6 가이드는 첫 줄에서 "**5.x에서 6.0.0으로의 변경만** 다룬다"고 못박는다 — 두 단계를 건너뛰면 참고할 단일 문서가 없다.

## 업그레이드 절차서

원문의 "Prerequisites" 절이 요구하는 것은 **먼저 최신 5.x로 올린 뒤 `terraform plan`을 실행해 (1) 에러나 예상치 못한 변경 없이 완료되는지 (2) 가이드에 설명된 변경과 관련된 deprecation 경고가 없는지** 확인하는 것이다. 아래는 여기에 환경 순서와 복구 지점을 붙인 것이다.

**1단계 — 현재 메이저의 최신 패치로 먼저 올린다.** `~> 5.92`로 고정했다면 `~> 5.0`으로 넓혀 `terraform init -upgrade` 후 `terraform plan 2>&1 | grep -i deprecat`. 파괴적 변경이 없어야 정상이다. 여기 나온 인수 하나하나가 다음 메이저에서 사라질 후보이며, **이 단계에서 경고를 0으로 만드는 것이 업그레이드 작업의 8할이다.** 수정이 아직 옛 메이저 안에서 이뤄지므로 언제든 되돌릴 수 있다.

**2단계 — plan이 깨끗한지 확인한다.** "깨끗하다"의 정의는 `No changes.`다. 기존 drift가 남아 있으면 업그레이드가 만든 diff와 원래 있던 diff를 구분할 수 없다. `terraform plan -detailed-exitcode`의 종료 코드는 `0`이 변경 없음, `1`이 에러, `2`가 변경 있음이다. CI에서 `0`이 아니면 파이프라인을 시작하지 않도록 게이트를 건다.

**3단계 — 버전 제약을 완화하고 `init -upgrade`.** `version = "~> 5.92"`를 `"~> 6.0"`으로 바꾸고 다시 init한다. 이때 갱신되는 `.terraform.lock.hcl`을 **반드시 커밋한다** — 아니면 팀원마다 다른 patch를 쓰게 되어 "내 노트북에서는 plan이 깨끗한데"가 시작된다.

**4단계 — 비운영 환경부터.** dev → staging → prod 순으로 같은 절차를 적용한다([38장](38-large-scale-structure-cicd.md)). 다만 dev에는 `aws_opsworks_stack`이 없고 prod에만 남아 있는 비대칭이 흔하다 — **비운영에서의 성공은 절차 검증이지 내용 검증이 아니다.**

**5단계 — `-refresh-only`로 state를 새 provider로 읽는다.**

```console
$ terraform plan -refresh-only
$ terraform apply -refresh-only
```

새 provider는 같은 리소스를 **다르게 읽는다** — `region`이 state에 채워지고 일부 리소스는 state 스키마가 업그레이드된다. 코드를 먼저 고치면 "state는 옛 형태, 코드는 새 형태"인 중간 상태에서 plan을 읽게 되어 원인을 분리할 수 없다. Enhanced Region Support 가이드의 절차도 같은 순서다 — v6.0.0으로 올리고, `apply -refresh-only`를 돌리고, **그 다음에** `provider` 메타 인수를 `region`으로 바꾼다.

**6단계 — 코드를 고친다.** 가이드의 해당 절만 골라 적용하되 **에러 유형별로 커밋을 나눈다** — 한 커밋에 섞으면 되돌릴 때 전부 되돌려야 한다.

**7단계 — 운영.** plan을 `-out`으로 못 박고 리뷰한 뒤 그 파일을 apply한다. 업그레이드 plan은 평소보다 길므로 **리뷰어가 볼 것을 미리 좁혀 준다** — 유일하게 중요한 질문은 "replace가 몇 개인가"이고, `terraform show -json tfplan`에 `jq`를 걸어 `["delete","create"]` 액션만 세면 된다.

## v6 지도 (1): 사라진 provider 인수와 서비스

v6 가이드의 목차는 항목이 100개가 넘지만 원인은 몇 갈래뿐이다.

**제거된 provider 인수.** provider 블록에서 `endpoints.opsworks`(OpsWorks Stacks EOL), `endpoints.simpledb`와 `endpoints.sdb`(SimpleDB 지원 제거), `endpoints.worklink`(Worklink 지원 제거)를 지운다. `endpoints`를 [34장](34-provider-configuration-deep.md)처럼 길게 써 온 조직은 이 키가 남아 있을 수 있는데, 스키마에 없는 키는 조용히 무시되지 않고 **에러**가 되므로 바로 드러난다.

**OpsWorks Stacks.** End of Life에 도달해 리소스 **17개**가 통째로 제거되었다 — `aws_opsworks_stack`, `aws_opsworks_instance`, `aws_opsworks_application`, `aws_opsworks_permission`, `aws_opsworks_user_profile`, `aws_opsworks_rds_db_instance`와 `aws_opsworks_*_layer` 11종.

**SimpleDB / Worklink.** `aws_simpledb_domain`이 제거되었는데, 이유가 provider 정책이 아니라 **AWS SDK for Go v2가 더 이상 Amazon SimpleDB를 지원하지 않기 때문**이다. `aws_worklink_fleet`과 `aws_worklink_website_certificate_authority_association`도 같은 이유다. **SDK가 서비스를 내리면 provider도 따라 내린다.**

리소스 타입이 사라지면 코드에서 지우는 것으로 끝나지 않는다 — **state에 남은 항목**이 문제다. 옛 메이저에 머무는 동안 `removed` 블록([22장](../level2-intermediate/22-moved-removed-refactoring.md))이나 `terraform state rm`으로 관리에서 떼어 낸다. **업그레이드 전에 할 일이지 후에 할 수 있는 일이 아니다.**

## v6 지도 (2): 예고된 종료와 Enhanced Region Support

v6에서 아직 제거되지는 않았지만 **다음 메이저에서 제거될 것**으로 표시된 것들이다. 지금 쓰고 있다면 v7을 기다리지 말고 이번 사이클에 이전한다.

| 서비스 (종료일) | deprecated 리소스 | 권장 대체 |
|---|---|---|
| Elastic Transcoder (2025-11-13) | `aws_elastictranscoder_pipeline`, `aws_elastictranscoder_preset` | MediaConvert |
| CloudWatch Evidently (2025-10-17) | `aws_evidently_feature`, `aws_evidently_launch`, `aws_evidently_project`, `aws_evidently_segment` | AppConfig Feature Flags |
| Elemental MediaStore (2025-11-13) | `aws_media_store_container`, `aws_media_store_container_policy` | S3 또는 MediaPackage |
| Kinesis Data Analytics for SQL (2026-01-27) | `aws_kinesis_analytics_application` | `aws_kinesisanalyticsv2_application` |

**Enhanced Region Support.** v6.0.0은 대부분의 리소스에 top-level `region` 인수를 추가했다([24장](../level2-intermediate/24-enhanced-region-support.md)). 인수 추가는 파괴적 변경이 아니지만 **`region`을 이미 다른 뜻으로 쓰던 리소스들**에서 충돌이 생겼다. 옛 뜻을 이어받는 새 인수는 `aws_s3_bucket`의 신규 `bucket_region`, `aws_cloudformation_stack_set_instance`의 `stack_set_instance_region`, `aws_config_aggregate_authorization`의 `authorized_aws_region`, `aws_dx_hosted_connection`의 `connection_region`, `aws_servicequotas_template`·`_templates`의 `aws_region`, `aws_ssmincidents_replication_set`의 `regions`, 데이터 소스 `aws_vpc_endpoint_service`의 `service_region`, 데이터 소스 `aws_vpc_peering_connection`의 `requester_region`이다. `aws_region` 데이터 소스는 반대로 `name`이 deprecated 되고 `region`을 쓴다.

이름이 옮겨 갔을 뿐이라 기계적으로 치환할 수 있지만 `region` 참조는 대개 output이나 local 안에 숨어 있어 놓치기 쉽다. 그리고 `region` 값을 **바꾸면 리소스가 교체**된다(지우면 교체되지 않고 state의 이전 값이 쓰인다). 업그레이드 도중 `region`을 박아 넣으면 provider 리전과 다를 때 조용히 교체 계획이 생기므로 **업그레이드와 `region` 도입은 분리한다.**

## v6 지도 (3): 값 해석과 스키마 모양

**Nullable Boolean 검증 변경.** provider 내부의 `TypeNullableBool` 처리가 바뀌면서, 아래 인수에 `0`이나 `1`을 써 왔다면 **`""`, `true`, `false`만** 쓰도록 고쳐야 한다.

| 리소스 | 해당 인수 |
|---|---|
| `aws_accessanalyzer_archive_rule` | `filter.exists` |
| `aws_alb_target_group` | `preserve_client_ip` |
| `aws_cloudtrail_event_data_store` | `suspend` |
| `aws_ec2_spot_instance_fleet` | `terminate_instances_on_delete` |
| `aws_elasticache_cluster` | `auto_minor_version_upgrade` |
| `aws_elasticache_replication_group` | `at_rest_encryption_enabled`, `auto_minor_version_upgrade` |
| `aws_evidently_feature` | `variations.value.bool_value` |
| `aws_imagebuilder_container_recipe` | `instance_configuration.block_device_mapping.ebs.delete_on_termination`, `...ebs.encrypted` |
| `aws_imagebuilder_image_recipe` | `block_device_mapping.ebs.delete_on_termination`, `block_device_mapping.ebs.encrypted` |
| `aws_launch_template` | `block_device_mappings.ebs.delete_on_termination`, `block_device_mappings.ebs.encrypted`, `ebs_optimized`, `network_interfaces.associate_carrier_ip_address`, `network_interfaces.associate_public_ip_address`, `network_interfaces.delete_on_termination`, `network_interfaces.primary_ipv6` |
| `aws_lb_target_group` | `preserve_client_ip` |
| `aws_mq_broker` | `logs.audit` |

이 카테고리가 위험한 이유는 **문제가 코드가 아니라 값의 출처에 있기** 때문이다. `var.optimize ? 1 : 0` 같은 표현식이나 외부 JSON에서 읽어 온 `1`이 그렇다 — `grep`으로 `= 1`을 찾아도 안 나온다. 인수가 일곱 개인 `aws_launch_template`이 가장 위험하다.

**single-nested → list of nested blocks.** 일부 리소스에서 중첩 블록이 **리스트 형태**로 바뀌었다. 원문의 표현이 핵심이다 — **"구성 자체는 바뀌지 않지만, 참조할 때 인덱스를 붙여야 한다."** `resource` 블록 안의 HCL은 그대로인데 `output`이나 `locals`가 깨진다. `logging_config.cloudwatch_config.log_group_name`은 `logging_config[0].cloudwatch_config[0].log_group_name`이 된다. 대상은 `aws_bedrock_model_invocation_logging_configuration`의 `logging_config` 계열, `aws_opensearchserverless_security_config`의 `saml_options`, `aws_paymentcryptography_key`의 `key_attributes`, `aws_rekognition_stream_processor`의 `regions_of_interest.bounding_box`, `aws_resiliencehub_resiliency_policy`의 `policy` 계열, `aws_verifiedpermissions_schema`의 `definition`, 데이터 소스 `aws_elbv2_listener_rule`의 `action`·`condition` 하위 블록이다.

**`aws_ami` 데이터 소스의 필수 조건.** `most_recent = true`를 쓴다면 `owners`를 넣거나 `image-id`·`owner-id`로 이미지를 식별하는 `filter`를 넣어야 한다. v5까지는 경고였지만 **v6에서는 에러로 멈춘다.**

우회용 `allow_unsafe_filter = true`가 있지만 원문은 **결과가 신뢰할 수 없게 될 수 있으니 불가피한 경우가 아니면 피하라**고 못박는다. 취지는 보안이다 — 이름 패턴만으로 고르면 **아무나 만든 동명의 AMI가 선택될 수 있다**.

**S3 글로벌 엔드포인트 deprecation.** 영향 범위는 `s3_us_east_1_regional_endpoint`가 `legacy`인 **`us-east-1` S3 리소스**(디렉터리 버킷 제외)이고, 이 인수는 **v7.0.0에서 제거될 예정**이다. 인수를 지우거나 값을 `regional`로 두고 동작을 확인한다.

## v6 지도 (4): 자주 쓰는 리소스의 개별 변경

- **`aws_instance`** — `user_data`가 해싱되지 않고 **평문으로 저장**된다. 원문은 여기에 민감 정보를 넣지 말라고 경고한다(base64 값은 `user_data_base64`). `cpu_core_count`·`cpu_threads_per_core`는 제거되어 `cpu_options` 블록의 `core_count`·`threads_per_core`로 대체되었다.
- **`aws_launch_template`** — `elastic_gpu_specifications`(Elastic Graphics, 2024-01 EOL)와 `elastic_inference_accelerator`(Elastic Inference, 2024-04 EOL) 제거. 위 Nullable Boolean 표도 함께 본다.
- **`aws_lb_listener`** — `mutual_authentication`의 `advertise_trust_store_ca_names`, `ignore_client_certificate_expiry`, `trust_store_arn`은 **`mode`가 `verify`일 때만** 설정할 수 있고, `mode`가 `verify`면 `trust_store_arn`이 **필수**다.
- **`aws_eks_addon`** — `resolve_conflicts` 제거, `resolve_conflicts_on_create`·`resolve_conflicts_on_update`를 쓴다. **`aws_flow_log`** — `log_group_name` 제거, `log_destination`을 쓴다. **`aws_eip`** — `vpc` 제거, `domain`을 쓴다. 셋 다 v5에서 이미 deprecated였다.
- **`aws_ecs_task_definition`** — `inference_accelerator` 제거. **`aws_db_instance`** — `character_set_name`을 `replicate_source_db`, `restore_to_point_in_time`, `s3_import`, `snapshot_identifier`와 **함께 쓸 수 없다.** **`aws_s3_bucket`** — `bucket_region` 추가.
- **기본값이 바뀐 것들** — `aws_redshift_cluster`의 `encrypted`는 `true`, `publicly_accessible`은 `false`가 되었고, `aws_wafv2_web_acl` Bot Control 규칙셋의 `enable_machine_learning`은 `false`가 되었다(이전 동작 유지는 명시적 `true`).
- **`aws_ssm_association`** — `instance_id` 제거, `targets`를 쓴다. **`aws_api_gateway_deployment`** — `stage_name`·`stage_description`·`canary_settings` 제거. `aws_api_gateway_stage`를 명시적으로 만들고 기존 스테이지를 `terraform import`로 데려와야 하는, **코드 수정만으로 끝나지 않는 유형**이다([20장](../level2-intermediate/20-import-and-resource-identity.md)).

## 왜 이런 일이 반복되는가 — v5와 v4

v6만 보면 우발적으로 보이지만 앞선 두 메이저를 겹쳐 보면 **같은 네 가지 힘**이 반복된다.

**힘 1 — AWS가 서비스를 내린다.** v5는 EC2-Classic 은퇴로 리소스 3종(`aws_db_security_group`, `aws_elasticache_security_group`, `aws_redshift_security_group`)과 인수 십수 개를, Macie Classic 은퇴로 `aws_macie_*` 2종을 지웠다. v6의 OpsWorks·SimpleDB·Worklink가 같은 힘이다.

**힘 2 — 이름과 의미를 AWS API에 맞춘다.** v5의 `aws_db_instance`는 `id`의 의미를 DB Identifier에서 **DBI Resource ID**(`resource_id`와 같은 값)로 바꿨다. `replicate_source_db = aws_db_instance.source.id`가 에러가 되고 `.identifier`로 바꿔야 했으며, `aws_db_proxy_target`·`aws_db_snapshot`처럼 이 값을 참조하던 리소스가 줄줄이 딸려 왔다. **plan 에러로 즉시 드러나 오히려 다루기 쉽다.**

**힘 3 — 잘못된 기본값과 관대한 검증을 거둔다.** v5는 `aws_s3_object`의 `acl` 기본값 `private`을 없앴고 `aws_rds_cluster`·`aws_rds_cluster_instance`의 `engine`을 필수로 만들었다(이전에는 생략이 `engine = "aurora"`, 즉 MySQL 5.6 호환 클러스터였다). v6의 `aws_redshift_cluster` 기본값 변경과 `aws_ami` 필수화가 같은 힘이다. **코드를 안 고쳐도 plan에 diff가 뜨므로 가장 조용히 물린다.**

**힘 4 — 뭉쳐 있던 것을 분리한다.** v4의 S3 사건이다. `aws_s3_bucket` 하나가 관리하던 설정 열세 개(`acl`, `versioning`, `policy`, `lifecycle_rule`, `cors_rule`, `logging`, `website`, `replication_configuration` 등)가 각각 `aws_s3_bucket_*` 독립 리소스로 뽑혔다([12장](../level1-beginner/12-s3-bucket.md)).

이 사건이 남을 만한 이유는 **전환이 두 번 일어났기 때문**이다. v4.0.0~v4.8.0에서 이 인수들은 **read-only**가 되어 `Value for unconfigurable attribute` 에러를 냈다. 반발이 컸고 v4.9.0에서 인수들이 v3.x와 같은 형태로 되돌아왔다 — 대신 **구성 값이 주어진 경우에만 drift를 감지**하는 형태로. 그래서 v4.9.0 이후에는 이 인수들을 통째로 지워도 plan이 `No changes.`라고 답했다. **지웠는데 아무 일도 안 일어나는 것이 경고 신호였던 셈이다.** 그리고 v5.0에서 완전히 제거되었다.

## 릴리스 노트를 읽는 법

업그레이드를 예측 가능하게 만드는 재료는 CHANGELOG다. provider 저장소는 `go-changelog`로 CHANGELOG를 생성하고, 각 PR은 `.changelog/{PR번호}.txt`에 항목을 넣는다.

항목은 ```` ```release-note:breaking-change ```` 처럼 헤더로 시작하는 코드 펜스이고, 헤더 종류가 곧 **읽는 우선순위**다. `breaking-change`(파괴적 변경·제거), `note`(deprecation과 동작 변화 고지), `bug`(버그 수정), `enhancement`(개선·인수 추가), 그리고 `new-resource`·`new-data-source`·`new-list-resource`·`new-guide`(추가). 항목 본문은 `resource/aws_...:` 또는 `data-source/aws_...:` 접두어로 시작하며 provider 수준 변경은 `provider:`를 쓴다.

덕분에 릴리스 노트를 짧게 훑을 수 있다. **`breaking-change`와 `note`만 읽고, 접두어가 자기 코드베이스에 있는 리소스인지 `grep`한다.** 인수를 deprecate하면서 대체 인수를 추가한 PR은 `note` 한 줄과 `enhancement` 한 줄을 함께 남기는데, 이 쌍이 **"지금 고칠 수 있는 미래의 파괴적 변경"**의 신호다. 문서·테스트·리팩터링 PR은 항목을 남기지 않으므로, **CHANGELOG에 있는 것은 전부 누군가의 plan을 바꿀 수 있다.**

## 웨이브 계획과 롤백

스택이 수십 개면 "전부 올린다"는 계획이 아니라 목록이다. 필요한 것은 **웨이브** — 위험이 낮고 학습량이 큰 것부터의 순서 — 다.

웨이브 0은 샌드박스 스택 하나로 절차를 검증한다 — 여기서 나온 에러 목록이 전체 작업량의 추정치가 된다. 웨이브 1은 리소스가 적고 폭발 반경이 작은 스택(관측·태그·로그 그룹처럼 재생성이 싼 것), 2는 비운영의 네트워크·컴퓨트, 3은 ECS/Lambda 같은 운영 stateless 계층, 4는 RDS·DynamoDB·KMS 같은 데이터 계층이다. 마지막 웨이브는 `prevent_destroy`를 확인한 뒤 들어간다.

각 웨이브에서 나온 "제거된 인수 → 대체 인수" 매핑은 **공용 표로 축적한다** — 스택 40개에 같은 `aws_eip.vpc`가 있다면 웨이브 1에서 한 번 배우고 나머지는 기계적으로 처리하는 것이 목표다.

**롤백은 항상 가능하지 않다.** provider 버전은 lock 파일과 버전 제약을 되돌리면 되지만 **state는 되돌아오지 않는다.** provider는 리소스 스키마에 버전을 붙이고 필요할 때 state를 새 형태로 업그레이드한다. v6의 `aws_batch_job_queue`가 그 예다 — 원문은 `compute_environments`를 `compute_environment_order` 블록으로 바꿔야 한다면서 **"Terraform이 `compute_environments`가 든 state를 `compute_environment_order`로 업그레이드해 준다"**고 적는다. 편리하지만 방향은 하나다.

그래서 실무 롤백 계획은 셋이다. **apply 직전 state 스냅숏** — 원격 백엔드의 버전 관리를 켜 두고([16장](../level2-intermediate/16-remote-state-and-backends.md)) 버전 ID를 기록해, 되돌린다면 provider와 state를 **함께** 되돌린다. **되돌릴 수 없는 지점 표시** — 교체(delete+create)가 포함된 apply는 되돌려도 원래 리소스가 돌아오지 않으므로 웨이브 계획에 "replace 3건 포함"을 미리 적는다. **앞으로 나아가는 복구** — 대부분 옳은 답은 다음 수정을 빨리 내보내는 것이고, 그래서 웨이브를 잘게 나눈다.

## 흔한 실수

### ❌ 메이저를 건너뛰어 한 번에 올린다

v4에서 곧장 v6으로 가면 v5에서 경고로 알려 주던 것들이 전부 에러로만 나타난다.

```console
# ❌ v4.67 -> v6.x 한 방에
$ terraform init -upgrade
```

```console
# ✅ 최신 v4 -> 최신 v5 -> 최신 v6. 각 단계에서 경고를 0으로 만든다
$ terraform init -upgrade   # "~> 4.0" 으로 넓혀 최신 4.x
$ terraform plan            # 경고 소화 후 "~> 5.0" 으로 반복
```

### ❌ drift가 남은 상태에서 시작한다

원래 있던 diff와 업그레이드가 만든 diff를 구분할 수 없게 된다.

```console
# ❌ "이 정도 diff는 원래 있던 거야"
$ terraform plan | tail -5
```

```console
# ✅ 종료 코드로 못 박는다
$ terraform plan -detailed-exitcode && echo "clean"
```

### ❌ `-refresh-only` 없이 코드부터 고친다

state는 옛 provider가 쓴 형태, 코드는 새 형태인 중간 상태에서는 원인을 분리할 수 없다.

```console
# ❌ init -upgrade 직후 곧바로 코드 수정 -> plan
```

```console
# ✅ state를 먼저 새 provider의 눈으로 갱신한 뒤 코드를 고친다
$ terraform apply -refresh-only
$ git commit -am "chore: refresh state under provider v6"
```

### ❌ 제거된 리소스를 코드에서만 지운다

`aws_opsworks_stack`처럼 타입 자체가 사라진 리소스는 state에서도 빼야 한다.

```terraform
# ❌ 리소스 블록만 삭제 — state에는 그대로 남는다
```

```terraform
# ✅ 옛 메이저에 머무는 동안 관리에서 떼어 낸다 (AWS 리소스는 보존)
removed {
  from = aws_opsworks_stack.legacy

  lifecycle {
    destroy = false
  }
}
```

## 프로덕션 노트

- **코드 수정과 버전 상향을 분리한다.** deprecation 경고를 없애는 수정은 옛 메이저에서 먼저 병합하고, 버전 제약 상향은 그 자체로 작은 PR이어야 한다.
- **기본값이 바뀐 인수는 명시적으로 적는다.** 값을 코드에 못 박아 두면 다음 메이저에서 같은 사고를 반복하지 않는다.
- **`user_data`를 다시 점검한다.** v6에서 `aws_instance`의 `user_data`는 평문으로 state에 저장된다. state 읽기 권한이 곧 그 값의 읽기 권한이므로 민감값은 [26장](../level2-intermediate/26-secrets-and-ephemeral.md)의 방식으로 옮긴다.
- **lock 파일을 PR에 포함시키고 업그레이드 창에는 자동 apply를 끈다.** `.terraform.lock.hcl`을 커밋하지 않으면 사람마다 다른 patch를 받고, 업그레이드 plan은 replace를 포함할 수 있으므로 자동 승인 경로를 그 기간만 막는다.
- **다음 메이저를 위한 저축을 지금 한다.** v6 시점에 이미 예고된 것들 — `s3_us_east_1_regional_endpoint` 제거(v7), ElastiCache `engine`의 대문자 값 검증 강화(v7), 위 표의 서비스 리소스 제거 — 은 v7 전에 처리할수록 싸다.

## 연습문제

1. 현재 버전에서 `terraform plan`을 실행해 deprecation 경고를 전부 수집하고, 각 경고를 "v6 가이드의 어느 절에 해당하는가"로 분류한 표를 만든다. *성공 기준:* 모든 행이 가이드의 절 제목 또는 "가이드에 없음"으로 매핑되고, 경고가 0이 될 때까지의 수정 목록이 PR 단위로 쪼개져 있다.

2. `aws_launch_template`의 Nullable Boolean 인수 일곱 개에 `0`/`1`이 흘러들 수 있는 경로를 변수 기본값·조건 표현식·외부 JSON까지 포함해 모두 찾는다. *성공 기준:* 각 인수의 "값의 출처 → 최종 타입"을 추적한 목록이 있고, `0`/`1`이 도달할 수 있는 경로가 `true`/`false`/`""`로 고쳐져 있다.

3. 조직의 모든 스택을 나열하고 웨이브 0~4로 배치한 계획표를 만든다. 각 스택에 리소스 수, 폭발 반경, 예상 replace 건수, 롤백 가능 여부를 적는다. *성공 기준:* "롤백 불가" 표시가 붙은 스택이 하나 이상 있고, 그 근거가 replace 대상 리소스 이름으로 제시되어 있다.

## 요약

- 파괴적 변경은 **기존 배포를 유지하려면 유효했던 구성을 고쳐야 하는 변경**이며 판정 기준은 plan이다. 제거 전에 먼저 deprecate하는 것이 저장소 정책이다.
- 절차는 고정이다 — 최신 패치로 경고를 0으로, `-detailed-exitcode`로 plan 확인, 제약을 넓혀 `init -upgrade`, 비운영부터, `-refresh-only`로 state 갱신, 그다음 코드 수정, 마지막이 운영이다.
- v6은 provider 인수 `endpoints.opsworks`·`simpledb`·`sdb`·`worklink`를 제거했고 OpsWorks Stacks 17개, `aws_simpledb_domain`, Worklink 2종을 삭제했다. 뒤의 둘은 **AWS SDK for Go v2가 지원을 내려서**다. Elastic Transcoder·Evidently·MediaStore·Kinesis Analytics for SQL은 deprecated로 남아 다음 메이저에서 제거된다.
- Nullable Boolean 검증이 바뀌어 `aws_launch_template` 등 12개 리소스의 해당 인수에는 `""`·`true`·`false`만 쓸 수 있다. `0`/`1`은 변수·조건식·외부 파일에 숨어 있어 찾기 어렵다.
- `aws_ami` 데이터 소스에 `most_recent = true`를 쓰면 `owners` 또는 `image-id`/`owner-id` `filter`가 **필수**이고, v5의 경고가 v6에서 에러가 되었다.
- **롤백은 provider 버전을 되돌리는 것으로 완성되지 않는다.** state는 새 스키마로 업그레이드되면 되돌아오지 않으므로, apply 직전 state 스냅숏과 "replace 포함 여부" 표시가 실제 복구 계획이다.

## 다음으로

- [40장 — 성능과 API 스로틀링: 병렬성 · 대형 state](40-performance-and-throttling.md) — 업그레이드 후 첫 대규모 refresh가 스로틀링에 걸리는 이유
- [22장 — moved · removed](../level2-intermediate/22-moved-removed-refactoring.md) — 제거된 리소스를 state에서 안전하게 떼어 내기
- [24장 — Enhanced Region Support](../level2-intermediate/24-enhanced-region-support.md) — v6의 `region` 인수와 마이그레이션 절차
- 공식 문서: [Version 6 Upgrade Guide](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/version-6-upgrade)
