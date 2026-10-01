---
appendix: D
title: "v6 파괴적 변경 체크리스트"
kind: reference
source_docs:
  - "website/docs/guides/version-6-upgrade.html.markdown"
  - "website/docs/guides/version-5-upgrade.html.markdown"
  - "website/docs/guides/version-4-upgrade.html.markdown"
  - "website/docs/guides/enhanced-region-support.html.markdown"
  - "docs/breaking-changes.md"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/version-6-upgrade"
provider_baseline: "6.x"
---

# 부록 D — v6 파괴적 변경 체크리스트

메이저 업그레이드에서 사람을 무는 것은 "무엇이 바뀌었는지 몰랐다"가 아니라 "우리 코드에 그게 있는지 몰랐다"다. 이 부록은 v5.x → v6.0.0의 변경을 **검색 가능한 형태**로 모은다. 각 항목은 "무엇이 바뀌었나 / 무엇을 고쳐야 하나" 두 축이므로, 왼쪽 열의 인수 이름을 `grep` 해 보는 것이 가장 빠른 사용법이다.

업그레이드 절차의 배경과 롤백 전략은 [39장](../level3-advanced/39-version-upgrades.md)에 있다.

## 이 부록을 쓰는 법

1. **준비 체크리스트**를 먼저 통과시킨다. 최신 v5에서 plan이 깨끗하지 않으면 v6에서는 원인이 두 배로 늘어난다.
2. 표 1~3으로 **코드가 통째로 못 쓰게 되는 항목**부터 걸러 낸 뒤, Nullable Boolean·데이터 소스·리소스 표를 **`grep` 목록으로** 쓴다.
3. Enhanced Region Support로의 이행은 선택이지만, `region` 이라는 이름을 이미 쓰던 리소스는 선택이 아니다.
4. 마지막으로 **검증 절차**를 돌려 "plan에 변경 0"을 문서로 남긴다.

provider 저장소는 파괴적 변경을 **"기존 배포를 유지하기 위해 사용자가 유효했던 설정을 고쳐야만 하는 변경"** 으로 정의하고, 무엇이 여기 해당하는지를 못 박아 두었다. 이 목록이 곧 아래 표들의 분류 기준이다.

| 파괴적 변경이다 | 파괴적 변경이 아니다 |
|---|---|
| 리소스·데이터 소스·ephemeral·list 리소스·provider 함수의 **제거** | 같은 것들의 **추가** |
| 속성 제거 / 이전 이름을 지원하지 않는 이름 변경 | Optional·Computed 전용 속성 추가 |
| Optional 속성을 **Required**로, Computed를 떼기 | 검증을 더 **느슨하게** 만드는 변경 |
| 검증을 더 **엄격하게** / **기본값 변경** | 문서와 동작을 맞추는 버그 수정 |
| 생성·수정·import 동작 변경, 예상치 못한 plan diff | |

그래서 v6.0.0이 대부분의 리소스에 `region` 인수를 **추가**한 것은 정의상 파괴적 변경이 아니다. 제거 전에는 반드시 deprecate를 거치므로, **최신 v5에서 deprecation 경고를 0으로 만드는 것이 v6 업그레이드의 절반**이다.

## 업그레이드 전 준비 체크리스트

### 0단계 — 시작 조건

- [ ] 현재 provider 버전을 확인한다 (`terraform version`, `.terraform.lock.hcl`).
- [ ] v4.x라면 v6로 직행하지 않는다. v4 → 최신 v5 → v6 순서로 간다.
- [ ] state 백엔드가 원격이고 버전 관리가 켜져 있다. 실패 시 되돌릴 지점이 필요하다.
- [ ] 업그레이드 대상 workspace 목록과 소유자를 적어 둔다. 한 번에 전부 올리지 않는다.

### 1단계 — 최신 v5에서 깨끗한 plan 만들기

- [ ] `version = "~> 5.0"` 으로 최신 5.x를 받는다 (`terraform init -upgrade`).
- [ ] `terraform plan` 이 **에러 없이** 끝나고 **예상하지 못한 변경이 없다**.
- [ ] plan 출력에 이 가이드가 다루는 항목의 **deprecation 경고가 없다**.
- [ ] `terraform plan -detailed-exitcode` 종료 코드가 0이다(2는 변경 있음).
- [ ] drift가 있다면 코드나 실물 중 한쪽으로 수렴시킨다.

### 2단계 — 코드베이스 사전 조사

- [ ] 제거된 리소스 타입을 `grep` 한다: `aws_opsworks_`, `aws_simpledb_domain`, `aws_worklink_`, `aws_redshift_service_account`.
- [ ] provider 블록에서 `endpoints` 의 `opsworks`·`simpledb`·`sdb`·`worklink` 키와 `s3_us_east_1_regional_endpoint` 를 찾는다.
- [ ] `most_recent = true` 를 쓰는 `aws_ami` 데이터 소스를 전부 찾는다.
- [ ] Nullable Boolean 표의 인수에 `= 0` / `= 1` 또는 `? 1 : 0` 이 쓰였는지 찾는다.
- [ ] 표 3의 종료 예고 서비스(Elastic Transcoder, Evidently, MediaStore, Kinesis Analytics SQL)를 쓰는지 확인한다.
- [ ] 모듈을 쓴다면 **모듈 쪽 `required_providers`** 도 6.x를 허용하는지 확인한다.

### 3단계 — 버전 제약 올리기

- [ ] `required_providers` 의 `version` 을 `"~> 5.92"` 에서 `"~> 6.0"` 으로 바꾼다.
- [ ] `terraform init -upgrade` 로 새 버전을 받는다.
- [ ] `.terraform.lock.hcl` 변경을 커밋한다. CI와 로컬이 같은 버전을 쓰게 만든다.

### 4단계 — state 먼저, 코드는 그다음

- [ ] `terraform apply -refresh-only` 로 새 provider의 눈으로 state를 갱신한다.
- [ ] 그 **뒤에** 코드를 고친다. 순서를 바꾸면 "코드 변경 때문인지 스키마 변경 때문인지" 구분할 수 없다.
- [ ] 표의 항목을 하나씩 적용하고 매번 `terraform validate` → `plan` 으로 확인한다.

## 표 1 — provider 수준 변경

`provider "aws"` 블록 자체의 변경이다. 여기 걸리면 **provider 초기화 단계에서** 실패하므로 증상이 즉시 드러난다. 전체 인수 목록은 [부록 A](a-provider-arguments.md)에 있다.

### 1-a. v6.0.0에서 제거된 provider 인수

| 제거된 것 | 사유 | 대체 |
|---|---|---|
| `endpoints.opsworks` | AWS OpsWorks Stacks End of Life | 없음. 블록에서 삭제 |
| `endpoints.simpledb` | Amazon SimpleDB 지원 제거 | 없음. 블록에서 삭제 |
| `endpoints.sdb` | Amazon SimpleDB 지원 제거 (별칭 키) | 없음. 블록에서 삭제 |
| `endpoints.worklink` | Amazon Worklink 지원 제거 | 없음. 블록에서 삭제 |

남아 있으면 "Unsupported argument" 에러가 난다. LocalStack처럼 `endpoints` 에 수십 개 키를 나열하는 설정에서 자주 걸린다.

### 1-b. v6에서 deprecated된 provider 인수

| 인수 | 상태 | 제거 예정 | 지금 해야 할 것 |
|---|---|---|---|
| `s3_us_east_1_regional_endpoint` | deprecated | **v7.0.0** | 제거하거나 값을 `regional` 로 두고 동작을 검증한다 |

영향을 받는 것은 이 인수가 `legacy` 인 상태의 **`us-east-1` S3 리소스**이며 directory bucket은 제외된다. `regional` 로 바꾸면 요청이 리전 엔드포인트로 나가므로, 방화벽이나 VPC 엔드포인트 정책도 같이 손봐야 한다.

### 1-c. v6에서 새로 생긴 것

| 새로 생긴 것 | 범위 | 성격 |
|---|---|---|
| 최상위 `region` 인수 | 대부분의 리소스·데이터 소스·ephemeral 리소스 | Optional + Computed. provider 설정 리전이 기본값 |
| `bucket_region` 속성 | `aws_s3_bucket` 리소스와 데이터 소스 | 기존 `region` 의 "버킷이 있는 리전" 의미를 이어받는다 |

파괴적인 것은 `region` 을 이미 다른 뜻으로 쓰던 소수의 리소스뿐이며, 목록과 동작 규칙은 아래 Enhanced Region Support 절에 있다.

## 표 2 — v6에서 제거된 서비스와 리소스

여기 있는 리소스는 v6에 **존재하지 않는다**. 코드에 남으면 `terraform validate` 부터 실패하고, state에 남으면 새 provider가 타입을 몰라 plan이 진행되지 않는다. 그래서 **v5에 머무는 동안** 떼어 내는 것이 안전하다 — 코드에서 블록만 지우면 state에 그대로 남으므로, `removed` 블록으로 AWS 실물은 보존한 채 state에서 빼거나 destroy 한 뒤에 올라간다([22장](../level2-intermediate/22-moved-removed-refactoring.md)).

### 2-a. OpsWorks Stacks — 리소스 17개 전부 제거

| # | 제거된 리소스 | # | 제거된 리소스 |
|---|---|---|---|
| 1 | `aws_opsworks_stack` (스택 본체) | 10 | `aws_opsworks_nodejs_app_layer` |
| 2 | `aws_opsworks_instance` | 11 | `aws_opsworks_php_app_layer` |
| 3 | `aws_opsworks_application` | 12 | `aws_opsworks_rails_app_layer` |
| 4 | `aws_opsworks_permission` | 13 | `aws_opsworks_static_web_layer` |
| 5 | `aws_opsworks_user_profile` | 14 | `aws_opsworks_ganglia_layer` |
| 6 | `aws_opsworks_rds_db_instance` | 15 | `aws_opsworks_haproxy_layer` |
| 7 | `aws_opsworks_custom_layer` | 16 | `aws_opsworks_memcached_layer` |
| 8 | `aws_opsworks_ecs_cluster_layer` | 17 | `aws_opsworks_mysql_layer` |
| 9 | `aws_opsworks_java_app_layer` | | |

AWS OpsWorks Stacks가 End of Life에 도달했기 때문이며, 서비스 자체가 사라졌으므로 provider 차원의 대체재는 없다. 워크로드 성격에 따라 ECS/EKS, Elastic Beanstalk, EC2 + Launch Template + ASG 중에서 다시 설계해야 한다.

### 2-b. SimpleDB · Worklink · 그 밖

| 제거된 것 | 종류 | 사유 | 대체 |
|---|---|---|---|
| `aws_simpledb_domain` | 리소스 | AWS SDK for Go v2가 SimpleDB를 지원하지 않는다 | 키-값 저장이 목적이면 `aws_dynamodb_table`. 자동 변환은 없다 |
| `aws_worklink_fleet` | 리소스 | AWS SDK for Go v2에서 Worklink 지원이 빠졌다 | 없음 |
| `aws_worklink_website_certificate_authority_association` | 리소스 | 위와 같음 | 없음 |
| `aws_redshift_service_account` | 리소스 | AWS가 IAM 정책에서 계정 ID 대신 **service principal name** 사용을 권고 | IAM 정책의 계정 ID 참조를 service principal로 바꾼다 |

## 표 3 — deprecated 예고 서비스 (아직 동작하지만 곧 사라진다)

v6에서 **제거되지 않았지만 deprecated** 된 것들이다. plan에 경고가 뜨고 향후 메이저에서 제거된다. AWS 서비스 종료일이 명시된 항목은 **provider 제거 시점보다 종료일이 더 빠른 데드라인**이다.

| 대상 | 종류 | 종료 예정 | 대체 |
|---|---|---|---|
| `aws_elastictranscoder_pipeline` | 리소스 | **2025-11-13** (Amazon Elastic Transcoder 중단) | AWS Elemental MediaConvert |
| `aws_elastictranscoder_preset` | 리소스 | **2025-11-13** | AWS Elemental MediaConvert |
| `aws_evidently_feature` | 리소스 | **2025-10-17** (CloudWatch Evidently 지원 종료) | AWS AppConfig Feature Flags |
| `aws_evidently_launch` · `aws_evidently_project` · `aws_evidently_segment` | 리소스 | **2025-10-17** | AWS AppConfig Feature Flags |
| `aws_media_store_container` | 리소스 | **2025-11-13** (AWS Elemental MediaStore 중단) | 단순 라이브 스트리밍은 S3, 패키징·DRM·리전 간 이중화가 필요하면 MediaPackage |
| `aws_media_store_container_policy` | 리소스 | **2025-11-13** | 위와 같음 |
| `aws_kinesis_analytics_application` | 리소스 | **2026-01-27** (Kinesis Data Analytics for SQL 지원 종료) | `aws_kinesisanalyticsv2_application` (Managed Service for Apache Flink) |
| `aws_kms_secret` | 데이터 소스 | 기능은 **v2.0.0에서 이미 제거**됨 | `aws_kms_secrets` |
| `aws_guardduty_detector.datasources` | 인수 | — | `aws_guardduty_detector_feature` 리소스 |
| `aws_guardduty_organization_configuration.datasources` | 인수 | — | 위와 같음 |
| `aws_elasticache_replication_group`·`_user`·`_user_group` 의 대문자 `engine` | 값 | **v7.0.0** 에서 소문자만 허용 | 지금 소문자로 바꾼다 |
| `s3_us_east_1_regional_endpoint` | provider 인수 | **v7.0.0** | 제거하거나 `regional` 로 설정 |

## Nullable Boolean 검증 변경

v6은 `TypeNullableBool` 의 동작을 바꿨다. 이 타입은 "설정하지 않음"과 "false"를 구분해야 하는 인수에 쓰이므로 값이 **문자열**로 표현된다. v5까지는 `0` 과 `1` 도 받아 주었지만 v6부터는 받지 않는다. **허용되는 값은 `""`, `true`, `false` 세 가지뿐이며 `""` 가 "설정하지 않음"을 뜻한다.**

| 리소스 | 영향받는 인수 |
|---|---|
| `aws_accessanalyzer_archive_rule` | `filter.exists` |
| `aws_alb_target_group` | `preserve_client_ip` |
| `aws_cloudtrail_event_data_store` | `suspend` |
| `aws_ec2_spot_instance_fleet` | `terminate_instances_on_delete` |
| `aws_elasticache_cluster` | `auto_minor_version_upgrade` |
| `aws_elasticache_replication_group` | `at_rest_encryption_enabled`, `auto_minor_version_upgrade` |
| `aws_evidently_feature` | `variations.value.bool_value` |
| `aws_imagebuilder_container_recipe` | `instance_configuration.block_device_mapping.ebs.delete_on_termination`, `instance_configuration.block_device_mapping.ebs.encrypted` |
| `aws_imagebuilder_image_recipe` | `block_device_mapping.ebs.delete_on_termination`, `block_device_mapping.ebs.encrypted` |
| `aws_launch_template` | `block_device_mappings.ebs.delete_on_termination`, `block_device_mappings.ebs.encrypted`, `ebs_optimized`, `network_interfaces.associate_carrier_ip_address`, `network_interfaces.associate_public_ip_address`, `network_interfaces.delete_on_termination`, `network_interfaces.primary_ipv6` |
| `aws_lb_target_group` | `preserve_client_ip` |
| `aws_mq_broker` | `logs.audit` |

고치는 방법은 단순하다. `ebs_optimized = "1"` 은 `ebs_optimized = "true"` 로, `delete_on_termination = "0"` 은 `"false"` 로 바꾼다. 다만 세 가지를 주의한다.

- **따옴표를 벗기지 않는다.** 여전히 문자열 타입이며, `for_each` 나 `try()` 를 거치면 타입이 섞여 예상치 못한 diff가 생긴다.
- **`""` 를 `false` 로 바꾸지 않는다.** `""` 는 "이 값을 보내지 않는다", `false` 는 "명시적으로 false를 보낸다"이다. 바꾸면 실제 리소스가 변경될 수 있다.
- **`var.x ? 1 : 0` 같은 삼항 표현식**도 함께 찾는다. 리터럴만 `grep` 하면 놓친다.

## 데이터 소스별 변경

| 데이터 소스 | 무엇이 바뀌었나 | 무엇을 고쳐야 하나 |
|---|---|---|
| `aws_ami` | `most_recent = true` 일 때 `owners` 또는 `image-id`/`owner-id` `filter` 가 **필수**. v5에서는 경고, v6에서는 에러 | `owners` 나 `owner-id` 필터를 넣는다. `allow_unsafe_filter = true` 로 우회할 수 있으나 결과가 불안정해 권장되지 않는다 |
| `aws_batch_compute_environment` | `compute_environment_name` → `name` | 인수 이름을 바꾼다 |
| `aws_ecs_task_definition` | `inference_accelerator` 제거 (Elastic Inference 2024-04 EOL) | 삭제한다 |
| `aws_ecs_task_execution` | `inference_accelerator_overrides` 제거 (사유 동일) | 삭제한다 |
| `aws_elbv2_listener_rule` | 여러 중첩 블록이 **블록 리스트**로 바뀜 (아래 별도 표) | 참조에 인덱스를 붙인다 |
| `aws_globalaccelerator_accelerator` | `id` 가 **computed 전용** | 설정에서 `id` 지정을 제거한다 |
| `aws_identitystore_group` · `aws_identitystore_user` | `filter` 제거 | `alternate_identifier` 로 찾는다 |
| `aws_kms_secret` | 기능은 v2.0.0에서 제거됨. 데이터 소스도 향후 제거 | 코드에서 제거한다 |
| `aws_launch_template` | `elastic_gpu_specifications`(Elastic Graphics 2024-01 EOL), `elastic_inference_accelerator` 제거 | 두 인수를 삭제한다 |
| `aws_opensearch_domain` | `kibana_endpoint` 제거. OpenSearch는 `/_dashboards/` 경로의 **Dashboards**를 쓴다 | `dashboard_endpoint` |
| `aws_opensearchserverless_security_config` | `saml_options` 가 single-nested → 블록 리스트 | `saml_options.session_timeout` → `saml_options[0].session_timeout` |
| `aws_quicksight_data_set` | `tags_all` 제거 | 속성 참조를 삭제 |
| `aws_region` | `name` deprecated | `region` 을 쓴다 |
| `aws_s3_bucket` | `bucket_region` 추가. 기존 `region` 은 Enhanced Region Support 용도 | 버킷 위치를 읽던 `region` 참조를 `bucket_region` 으로 |
| `aws_service_discovery_service` | `tags_all` 제거 | 속성 참조를 삭제 |
| `aws_servicequotas_templates` | `region` deprecated | `aws_region` 인수를 쓴다 |
| `aws_ssmincidents_replication_set` | `region` deprecated | `regions` 를 쓴다 |
| `aws_vpc_endpoint_service` | `region` deprecated | `service_region` 을 쓴다 |
| `aws_vpc_peering_connection` | `region` deprecated | `requester_region` 을 쓴다 |

`aws_ami` 가 강제된 이유는 분명하다. 소유자를 지정하지 않으면 필터에 맞는 **누군가의 공개 AMI 중 가장 최신 것**이 선택되고, 조건에 걸리는 새 이미지를 제3자가 올리는 순간 다음 apply에서 인스턴스가 교체된다. AWS 공식 이미지라면 `owners = ["amazon"]` 한 줄, 자체 빌드 AMI라면 `filter { name = "owner-id", values = ["123456789012"] }` 로 소유자를 못 박는다.

## 리소스별 변경 (1) — 인수 이름 변경과 제거

가장 흔한 부류다. 왼쪽 열의 인수를 `grep` 해 오른쪽대로 바꾼다.

| 리소스 | 무엇이 바뀌었나 | 무엇을 고쳐야 하나 |
|---|---|---|
| `aws_api_gateway_account` | `reset_on_delete` 제거. destroy가 항상 계정 설정을 초기화한다 | 인수를 삭제한다. 이전 동작이 필요하면 `removed` 블록을 쓴다 |
| `aws_api_gateway_deployment` | `stage_name`, `stage_description`, `canary_settings`, `invoke_url`, `execution_arn` 제거 | 스테이지를 `aws_api_gateway_stage` 로 명시하고 기존 스테이지는 import 한다 |
| `aws_batch_compute_environment` | `compute_environment_name` → `name`, `compute_environment_name_prefix` → `name_prefix` | 인수 이름을 바꾼다 |
| `aws_batch_job_queue` | `compute_environments` 제거 | `compute_environment_order` 블록으로. **설정은 고쳐야 하지만 state는 자동 업그레이드된다** |
| `aws_db_instance` | `character_set_name` 을 `replicate_source_db`, `restore_to_point_in_time`, `s3_import`, `snapshot_identifier` 와 **함께 쓸 수 없다** | 복제·복원 인스턴스에서 뺀다 |
| `aws_dms_endpoint` | `s3_settings` 제거 | `aws_dms_s3_endpoint` 리소스를 쓴다 |
| `aws_dx_gateway_association` | `vpn_gateway_id` 제거 (v5에서 deprecated) | `associated_gateway_id` 를 쓴다 |
| `aws_ecs_task_definition` | `inference_accelerator` 제거 | 인수를 삭제한다 |
| `aws_eip` | `vpc` 제거 (v5에서 deprecated) | `domain = "vpc"` 를 쓴다 |
| `aws_eks_addon` | `resolve_conflicts` 제거 | `resolve_conflicts_on_create`·`resolve_conflicts_on_update` 로 나눈다 |
| `aws_flow_log` | `log_group_name` 제거 | `log_destination` 을 쓴다 |
| `aws_guardduty_detector` | `datasources` deprecated | `aws_guardduty_detector_feature` 리소스로 옮긴다 |
| `aws_guardduty_organization_configuration` | `auto_enable` 제거, `datasources` deprecated | `auto_enable` 을 지우고 `auto_enable_organization_members` 를 명시 |
| `aws_instance` | `cpu_core_count`, `cpu_threads_per_core` 제거 | `cpu_options` 블록의 `core_count`, `threads_per_core` 로 옮긴다 |
| `aws_instance` | `user_data` 에 해싱을 적용하지 않고 **평문 저장** | 민감 정보를 넣지 않는다. base64가 필요하면 `user_data_base64` |
| `aws_launch_template` | `elastic_gpu_specifications`, `elastic_inference_accelerator` 제거 | 두 인수를 삭제한다 |
| `aws_networkmanager_core_network` | `base_policy_region` 제거 | `base_policy_regions`(복수)를 쓴다 |
| `aws_opensearch_domain` | `kibana_endpoint` 제거 | `dashboard_endpoint` 를 쓴다 |
| `aws_redshift_cluster` | `snapshot_copy`, `logging` 제거 | `aws_redshift_snapshot_copy`, `aws_redshift_logging` 리소스로 옮긴다 |
| `aws_sagemaker_notebook_instance` | `accelerator_types` 제거 | `instance_type` 으로 Inferentia 인스턴스를 지정한다 |
| `aws_spot_instance_request` | `block_duration_minutes` 제거 | 인수를 삭제한다 |
| `aws_ssm_association` | `instance_id` 제거 (v5에서 deprecated) | `targets` 블록을 쓴다 |

### 손이 가장 많이 가는 둘

암묵적으로 만들어지던 API Gateway 스테이지를 명시 리소스로 분리하는 것이 이번 메이저에서 가장 손이 많이 간다. `invoke_url` 과 `execution_arn` 을 참조하던 출력도 전부 `aws_api_gateway_stage` 쪽 속성을 보도록 바꿔야 한다. 기존 스테이지는 새로 만들어지지 않도록 `rest_api_id/stage_name` 형식으로 import 한다([20장](../level2-intermediate/20-import-and-resource-identity.md)).

```terraform
# 이전: aws_api_gateway_deployment 에 stage_name = "prod" 를 직접 지정했다
# ✅ v6 — 스테이지를 명시 리소스로 분리한다
resource "aws_api_gateway_deployment" "example" {
  rest_api_id = aws_api_gateway_rest_api.example.id
}

resource "aws_api_gateway_stage" "prod" {
  stage_name    = "prod"
  rest_api_id   = aws_api_gateway_rest_api.example.id
  deployment_id = aws_api_gateway_deployment.example.id
}
```

`aws_batch_job_queue` 는 `compute_environments = [arn, ...]` 리스트를 `compute_environment_order { compute_environment = arn, order = 0 }` 블록으로 바꾼다.

## 리소스별 변경 (2) — 중첩 블록이 리스트로 바뀐 것

이 부류는 **설정 파일 자체를 바꾸지 않는다**. 바꾸는 것은 값을 **참조하는 쪽**이다. single-nested block이 블록 리스트가 되었으므로 참조 경로에 `[0]` 을 끼워 넣는다(`saml_options.session_timeout` → `saml_options[0].session_timeout`). `output`, `locals`, 다른 리소스의 인수, 모듈 출력 전부가 대상이다.

| 리소스 / 데이터 소스 | 리스트로 바뀐 경로 |
|---|---|
| `aws_bedrock_model_invocation_logging_configuration` | `logging_config`, `logging_config.cloudwatch_config`, `logging_config.cloudwatch_config.large_data_delivery_s3_config`, `logging_config.s3_config` |
| `aws_opensearchserverless_security_config` (리소스·데이터 소스) | `saml_options` |
| `aws_paymentcryptography_key` | `key_attributes`, `key_attributes.key_modes_of_use` |
| `aws_rekognition_stream_processor` | `regions_of_interest.bounding_box` |
| `aws_resiliencehub_resiliency_policy` | `policy`, `policy.az`, `policy.hardware`, `policy.software`, `policy.region` |
| `aws_verifiedpermissions_schema` | `definition` |
| `aws_elbv2_listener_rule` (데이터 소스) | `action.authenticate_cognito`, `action.authenticate_oidc`, `action.fixed_response`, `action.forward`, `action.forward.stickiness`, `action.redirect`, `condition.host_header`, `condition.http_header`, `condition.http_request_method`, `condition.path_pattern`, `condition.query_string`, `condition.source_ip` |

이 변경은 `terraform validate` 에서 대부분 잡히지만, `try()` 로 감싼 참조는 조용히 `null` 이 되어 통과한다.

## 리소스별 변경 (3) — id 의미와 import 형식

`id` 는 사소해 보이지만 다른 리소스가 `.id` 로 참조하고 있으면 파급이 넓다.

| 리소스 | 무엇이 바뀌었나 | 무엇을 고쳐야 하나 |
|---|---|---|
| `aws_appflow_connector_profile` · `aws_appflow_flow` | import가 각각 Connector Profile / Flow의 **`name`** 을 쓴다 | import 스크립트·문서를 갱신한다 |
| `aws_cloudfront_key_value_store` | `id` 는 이제 **AWS API가 반환하는 ID 값** | 리소스 이름 참조에는 `name` 을 쓴다 |
| `aws_cognito_user_in_group` | `id` 가 `user_pool_id`, `group_name`, `username` 을 **쉼표로 이은 복합 문자열** | import에서 쉼표 구분 복합 id를 쓴다 |
| `aws_sagemaker_image_version` | `id` 가 `image_name` 과 `version` 을 **쉼표로 이은 복합 문자열** | 이미지 이름 참조에는 `image_name`. import도 쉼표 구분 |
| `aws_globalaccelerator_accelerator` (데이터 소스) | `id` 가 computed 전용 | 설정에서 `id` 지정을 제거한다 |

## 리소스별 변경 (4) — 기본값 · 필수 여부 · 검증

**코드를 한 글자도 고치지 않았는데 plan에 diff가 뜨는** 유형이다. 해당 항목을 찾으면 실제 값이 무엇인지 확인한 뒤 명시적으로 적어 두는 것이 안전하다.

| 리소스 | 무엇이 바뀌었나 | 무엇을 고쳐야 하나 |
|---|---|---|
| `aws_cur_report_definition` | `s3_prefix` 가 **Required** | 값을 명시한다 |
| `aws_guardduty_organization_configuration` | `auto_enable_organization_members` 가 **Required** | 값을 명시한다 |
| `aws_redshift_cluster` | `encrypted` 기본값이 **`true`** | 암호화하지 않던 클러스터라면 `encrypted = false` 를 명시한다 |
| `aws_redshift_cluster` | `publicly_accessible` 기본값이 **`false`** | 공개 접근이 필요하면 `true` 를 명시한다 |
| `aws_redshift_cluster` | `cluster_public_key`, `cluster_revision_number`, `endpoint` 가 **읽기 전용** | 지정하고 있다면 제거한다 |
| `aws_cloudfront_response_headers_policy` | `etag` 가 computed 전용 | 지정하고 있다면 제거한다 |
| `aws_elasticache_replication_group` | `auth_token_update_strategy` 에 **기본값이 없어졌다** | `auth_token` 을 쓴다면 이 인수도 명시한다 |
| `aws_elasticache_replication_group`·`_user`·`_user_group` | 대문자 `engine` deprecated. **v7.0.0** 에서 plan 단계 검증이 소문자만 허용 | 지금 소문자로 바꾼다 |
| `aws_lb_listener` | `mutual_authentication` 의 `advertise_trust_store_ca_names`, `ignore_client_certificate_expiry`, `trust_store_arn` 은 **`mode = "verify"` 일 때만** 설정 가능하고, 그때 `trust_store_arn` 은 **필수** | 그 외 mode에서 쓰고 있으면 제거하고, `verify` 면 `trust_store_arn` 을 명시한다 |
| `aws_wafv2_web_acl` | `...aws_managed_rules_bot_control_rule_set.enable_machine_learning` 기본값이 **`false`** | 이전(생략 시) 동작을 유지하려면 **명시적으로 `true`** 를 설정한다 |

`aws_redshift_cluster` 의 `encrypted` 처럼 **보안을 강화하는 방향의 기본값 변경**이 특히 위험하다. 아무 생각 없이 apply 하면 클러스터가 교체될 수 있으므로 plan 출력에서 `forces replacement` 를 반드시 확인한다. `aws_instance` 의 `user_data` 도 마찬가지로, 해싱 없이 평문 저장되면서 첫 plan에서 값이 통째로 diff로 나타날 수 있다. 이 변경은 실질적으로 **"user_data에 비밀을 넣지 말라"는 경고**이며, 비밀은 인스턴스 프로파일 + Secrets Manager 조합으로 런타임에 가져온다([26장](../level2-intermediate/26-secrets-and-ephemeral.md)).

## Enhanced Region Support 마이그레이션 체크리스트

v6.0.0은 대부분의 리소스·데이터 소스·ephemeral 리소스에 최상위 `region` 인수를 붙였다. **v6 이전의 provider alias 방식은 여전히 유효하며 deprecated가 아니다.** 그러므로 이 절은 "해야 하는 일"이 아니라 "하고 싶다면 이 순서로"다.

### 필수 확인 — `region` 이라는 이름을 이미 쓰던 것

v6.0.0 이전부터 최상위 `region` 을 갖고 있던 것들이다. 그 `region` 은 deprecated 되었고 향후 Enhanced Region Support 용도로 교체된다. **여기 해당하면 마이그레이션이 선택이 아니다.**

| 대상 | 종류 | 기존 `region` 을 대체할 인수 |
|---|---|---|
| `aws_cloudformation_stack_set_instance` | 리소스 | `stack_set_instance_region` |
| `aws_config_aggregate_authorization` | 리소스 | `authorized_aws_region` |
| `aws_dx_hosted_connection` | 리소스 | `connection_region` |
| `aws_servicequotas_template` | 리소스 | `aws_region` |
| `aws_ssmincidents_replication_set` | 리소스·데이터 소스 | `regions` |
| `aws_region` | 데이터 소스 | `region` (기존 `name` 이 deprecated) |
| `aws_s3_bucket` | 리소스·데이터 소스 | `bucket_region` |
| `aws_servicequotas_templates` | 데이터 소스 | `aws_region` |
| `aws_vpc_endpoint_service` | 데이터 소스 | `service_region` |
| `aws_vpc_peering_connection` | 데이터 소스 | `requester_region` |

### 마이그레이션 순서

- [ ] **1. v6.0.0으로 올린다.** 이 단계에서는 리소스 설정을 건드리지 않는다.
- [ ] **2. `terraform apply -refresh-only` 를 돌린다.** 코드를 고치기 전에 state가 새 스키마로 갱신되어야 한다. 건너뛰면 불필요한 교체가 계획된다.
- [ ] **3. `provider = aws.<alias>` 메타 인수를 `region = "<리전>"` 으로 바꾼다.** 리소스 단위로 조금씩, 매번 plan을 확인하며 진행한다.
- [ ] **4. 참조되지 않는 alias provider 블록을 제거한다.** 참조가 하나라도 남으면 init이 실패한다.
- [ ] **5. plan에 `forces replacement` 가 없는지 확인한다.** 있다면 넣은 `region` 이 state의 값과 다른 것이다.

```terraform
# 이전: provider "aws" { alias = "peer", region = "us-west-2" } 를 두고
#       리소스마다 provider = aws.peer 를 지정했다
# ✅ v6 — provider 블록 하나 + 리소스별 region
resource "aws_vpc" "peer" {
  region     = "us-west-2"
  cidr_block = "10.1.0.0/16"
}
```

### `region` 의 동작 규칙

| 상황 | 결과 |
|---|---|
| `region` 을 지정하지 않음 | provider 설정의 리전이 기본값 (Optional + Computed) |
| partition 밖의 값을 지정 | 검증 실패. 값은 provider가 속한 partition 안이어야 한다 |
| `region` 값을 **변경** | **리소스 교체**(force replacement) |
| `region` 을 **삭제** | 교체되지 않는다. state에 저장된 이전 값을 계속 쓴다 |
| 특정 리전 리소스를 import | import ID 뒤에 `@<리전>` 을 붙인다: `vpc-a01106c2@eu-west-1` |

### `region` 이 없는 것들

- **글로벌 서비스 전체** — 접두어로 적으면 `aws_account_*`, `aws_arcregionswitch_*`, `aws_billing_*`, `aws_bcmdataexports_*`, `aws_budgets_*`, `aws_cloudfront_*`, `aws_cloudfrontkeyvaluestore_*`, `aws_ce_*`, `aws_costoptimizationhub_*`, `aws_cur_*`, `aws_globalaccelerator_*`, `aws_iam_*`, `aws_rolesanywhere_*`, `aws_caller_identity`, `aws_invoicing_*`, `aws_networkmanager_*`, `aws_organizations_*`, `aws_pricing_*`, `aws_route53_*`, `aws_route53domains_*`, `aws_route53recoverycontrolconfig_*`, `aws_route53recoveryreadiness_*`, `aws_savingsplans_*`, `aws_shield_*`, `aws_notifications_*`, `aws_notificationscontacts_*`, `aws_waf_*`.
- **리전 서비스 안의 글로벌 리소스** — `aws_backup_global_settings`, `aws_chimesdkvoice_global_settings`, `aws_cloudtrail_organization_delegated_admin_account`, `aws_dx_gateway`(리소스·데이터 소스), `aws_fms_admin_account`, `aws_vpc_ipam_organization_admin_account`, `aws_ram_sharing_with_organization`, `aws_canonical_user_id`, `aws_s3_account_public_access_block`(리소스·데이터 소스), `aws_servicecatalog_organizations_access`.
- **메타·정책 문서 데이터 소스** — `aws_default_tags`, `aws_partition`, `aws_regions`, `aws_cloudwatch_log_data_protection_policy_document`, `aws_ecr_lifecycle_policy_document`. `aws_arn` 데이터 소스의 `region` 은 기존 의미 그대로다.

설계 배경과 실전 패턴은 [24장](../level2-intermediate/24-enhanced-region-support.md)에 있다.

## 참고 — v5의 대표 변경 (4.x에 머물러 있다면)

v4.x에서는 v6로 직행할 수 없다. 최신 v5를 한 번 거친다. 아래는 그때 걸리는 큰 항목이다.

**제거된 provider 인수:** `assume_role.duration_seconds` → `assume_role.duration`(`"1h"` 같은 문자열), `assume_role_with_web_identity.duration_seconds` → `.duration`, `s3_force_path_style` → `s3_use_path_style`, `shared_credentials_file` → `shared_credentials_files`(리스트), `skip_get_ec2_platforms`(EC2-Classic 종료로 제거, 대체 없음).

**EC2-Classic 종료로 사라진 것:** 리소스 `aws_db_security_group`, `aws_elasticache_security_group`, `aws_redshift_security_group`. 인수 `aws_db_instance`·`aws_elasticache_cluster` 의 `security_group_names`, `aws_redshift_cluster.cluster_security_groups`, `aws_launch_configuration` 의 `vpc_classic_link_*`, `aws_vpc`·`aws_default_vpc` 의 `enable_classiclink`·`enable_classiclink_dns_support`, `aws_vpc_peering_connection`·`_accepter`·`_options` 의 `allow_classic_link_to_remote_vpc`·`allow_vpc_to_remote_classic_link`. 결과적으로 비-VPC security group과 `aws_eip` 의 `standard` 도메인이 지원되지 않는다. Macie Classic 종료로 `aws_macie_member_account_association`, `aws_macie_s3_bucket_association` 도 제거되었다.

**파급이 가장 넓었던 것 — `aws_db_instance.id`:** v5에서 `id` 는 DB Identifier가 아니라 **DBI Resource ID**(`resource_id` 와 같은 값)가 되었다. DB Identifier가 필요한 자리에서는 `identifier` 를 쓴다 — `replicate_source_db = aws_db_instance.source.id` 는 에러이고 `....identifier` 가 맞다. 영향받는 곳은 `replicate_source_db`, `aws_db_instance_role_association`·`aws_db_proxy_target`·`aws_db_snapshot` 의 `db_instance_identifier`, `aws_db_event_subscription.source_ids` 다.

| 그 밖에 자주 걸리는 v5 항목 | 변경 |
|---|---|
| `aws_autoscaling_group` | `tags` 제거. `tag` 블록을 쓴다. 동적 태그는 `dynamic "tag"` |
| `aws_autoscaling_attachment` | `alb_target_group_arn` → `lb_target_group_arn` |
| `aws_ecs_cluster` | `capacity_providers`, `default_capacity_provider_strategy` 제거 |
| `aws_s3_object` / `aws_s3_object_copy` | `acl` 기본값(`private`) 없어짐. 필요하면 명시 |
| `aws_secretsmanager_secret` | `rotation_enabled`, `rotation_lambda_arn`, `rotation_rules` 제거 |
| `aws_ssm_parameter` | `overwrite` deprecated. 기존 파라미터는 import 한다 |
| `aws_iam_policy_document` (데이터 소스) | `source_json`·`override_json` → `source_policy_documents`·`override_policy_documents` |
| `aws_subnet_ids` (데이터 소스) | 제거 → `aws_subnets` |
| `default_tags` | 중복 태그 허용(리소스 `tags` 가 덮어씀), 빈 문자열 태그 허용, computed 태그 허용 |

## 참고 — v4의 대표 변경

**인증 우선순위가 엄격해졌다.** v4.0부터 AWS SDK·CLI와 동일한 우선순위를 강제한다: **provider 설정 → 환경 변수 → shared credentials/config 파일**. v3까지는 `profile` 에 유효한 자격증명이 없으면 환경 변수로 넘어갔지만 **v4부터는 넘어가지 않고 인증 에러가 난다**([4장](../level1-beginner/04-provider-block-and-auth.md)).

**v4에서 새로 생긴 provider 인수:** `assume_role.duration`, `custom_ca_bundle`, `ec2_metadata_service_endpoint`, `ec2_metadata_service_endpoint_mode`, `s3_use_path_style`, `shared_config_files`, `shared_credentials_files`, `sts_region`, `use_dualstack_endpoint`, `use_fips_endpoint`. `use_fips_endpoint = true` 한 줄로 지원 서비스 전부의 FIPS 엔드포인트가 해결되므로 `endpoints` 에 FIPS 호스트명을 하나씩 적던 방식을 대체한다. `AWS_METADATA_URL` 은 deprecated 되고 `AWS_EC2_METADATA_SERVICE_ENDPOINT` 로 대체되었다.

**S3 버킷 리팩터링 — 가장 큰 변화.** v4는 `aws_s3_bucket` 의 인라인 인수를 별도 리소스로 쪼갰다. v4.9.0 이후로는 인라인 인수가 다시 허용되지만 **설정에 값이 있을 때만 drift를 감지한다** — 인라인 인수를 통째로 지우면 Terraform이 변화를 감지하지 못하고 `No changes.` 를 출력한다. v5.0에서 아래 인수들은 완전히 제거되었다.

| `aws_s3_bucket` 인라인 인수 | 별도 리소스 |
|---|---|
| `acceleration_status` | `aws_s3_bucket_accelerate_configuration` |
| `acl`, `grant` | `aws_s3_bucket_acl` |
| `cors_rule` | `aws_s3_bucket_cors_configuration` |
| `lifecycle_rule` | `aws_s3_bucket_lifecycle_configuration` |
| `logging` | `aws_s3_bucket_logging` |
| `object_lock_configuration` 의 `rule` | `aws_s3_bucket_object_lock_configuration` |
| `policy` | `aws_s3_bucket_policy` |
| `replication_configuration` | `aws_s3_bucket_replication_configuration` |
| `request_payer` | `aws_s3_bucket_request_payment_configuration` |
| `server_side_encryption_configuration` | `aws_s3_bucket_server_side_encryption_configuration` |
| `versioning` | `aws_s3_bucket_versioning` |
| `website`, `website_domain`, `website_endpoint` | `aws_s3_bucket_website_configuration` |

별도 리소스는 직접 apply 하거나 기존 설정을 import 한다. 자세한 것은 [12장](../level1-beginner/12-s3-bucket.md)에 있다.

**그 밖의 v4 항목.** `aws_default_vpc`·`aws_default_subnet` 이 전체 생명주기를 지원한다 — `terraform destroy` 는 실제 리소스를 지우지 않고 state에서만 제거하며 `force_destroy = true` 를 설정해야 삭제된다. `aws_vpcs`, `aws_security_groups`, `aws_route_tables` 같은 복수형 데이터 소스가 결과 0건이어도 **더 이상 에러를 내지 않으므로** 0건일 수 있다는 전제로 후속 코드를 쓴다. 일부 리소스에서 `""` 를 값으로 쓰던 관행이 막혔으니 `null` 을 쓰거나 인수를 제거한다. `aws_s3_bucket_object` 는 `aws_s3_object` 로 바뀌었다.

## 업그레이드 후 검증 절차

"plan에 변경이 없다"를 **증거로 남기는 것**까지가 업그레이드다.

### 1. 정적 검증

- [ ] `terraform validate` — 제거된 인수, 인덱스 없는 중첩 블록 참조, 타입 오류가 대부분 여기서 잡힌다.
- [ ] `.terraform.lock.hcl` 에 6.x가 기록되었고, 각 모듈의 `required_providers` 도 6.x를 허용한다.

### 2. plan 검증

- [ ] `terraform plan -detailed-exitcode` 의 **종료 코드가 0**이다. 업그레이드만으로 변경이 생기면 안 된다.
- [ ] plan 출력에 **`forces replacement` 가 없다.** 있다면 원인 인수를 특정한다. `region`, `encrypted`, `user_data`, AMI ID가 흔한 범인이다.
- [ ] plan 출력에 **deprecation 경고가 없다.** 남으면 v7에서 터질 부채다.
- [ ] plan을 파일로 남겨 리뷰에 첨부한다(`terraform plan -out=upgrade.tfplan`).

### 3. state 검증

- [ ] `terraform state list` 항목 수가 업그레이드 전후로 같고, 제거된 서비스(OpsWorks, SimpleDB, Worklink) 리소스가 남아 있지 않다.
- [ ] `terraform state show` 로 대표 리소스 두세 개를 열어 `region` 이 기대한 값인지 확인한다.

### 4. 런타임 검증

- [ ] 실제 apply는 **가장 낮은 환경부터**. dev → staging → prod 순으로 웨이브를 나누고, 웨이브 사이에 관측 기간을 둔다. ASG·ECS·RDS처럼 교체가 무중단을 깨는 리소스가 있으면 더 길게.
- [ ] 애플리케이션 헬스체크·알람·대시보드가 정상인지 확인한다([32장](../level2-intermediate/32-observability.md)).
- [ ] 롤백 경로를 미리 정한다. provider 버전을 되돌려도 **이미 apply된 AWS 리소스는 되돌아가지 않는다**.

### 5. 문서화

- [ ] 실제로 고친 항목을 이 부록의 표 항목과 매핑해 기록한다.
- [ ] 표 3에서 **아직 해결하지 않은 항목**을 v7 대비 백로그로 등록한다. `s3_us_east_1_regional_endpoint` 와 대문자 `engine` 값은 v7.0.0에서 확정적으로 깨진다.

## 관련 문서

- [39장 — 메이저 버전 업그레이드](../level3-advanced/39-version-upgrades.md) · [24장 — Enhanced Region Support](../level2-intermediate/24-enhanced-region-support.md) · [22장 — moved · removed](../level2-intermediate/22-moved-removed-refactoring.md) · [20장 — Import와 Resource Identity](../level2-intermediate/20-import-and-resource-identity.md) · [12장 — S3 버킷](../level1-beginner/12-s3-bucket.md)
- [부록 A — Provider 인수](a-provider-arguments.md) · [부록 B — 환경 변수](b-environment-variables.md) · [부록 C — 리소스 카탈로그](c-resource-catalog.md) · [부록 E — 용어집](e-glossary.md)
- 공식 문서: [Version 6](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/version-6-upgrade) · [Version 5](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/version-5-upgrade) · [Version 4](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/version-4-upgrade) Upgrade Guide, [Enhanced Region Support](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/enhanced-region-support)
