---
appendix: C
title: "서비스별 리소스 카탈로그"
kind: reference
source_docs:
  - "names/README.md"
  - "names/caps.md"
  - "docs/core-services.md"
  - "docs/naming.md"
  - "website/docs/index.html.markdown"
  - "website/docs/guides/version-6-upgrade.html.markdown"
provider_baseline: "6.x"
---

# 부록 C — 서비스별 리소스 카탈로그

AWS Provider v6.x는 **리소스 1,691개, ephemeral 리소스 10개, list 리소스 183개, 데이터 소스 673개**를 갖는다. 이 숫자는 "필요한 리소스가 있을 것"이라는 안심과 "그 이름이 뭔지 모르겠다"는 막막함을 동시에 준다. 이 부록은 후자를 줄이기 위한 지도다.

여기 실린 리소스 이름은 전부 provider 저장소의 리소스 문서 파일 목록(`website/docs/r/` 아래 1,698개 파일)에서 **실제 존재를 확인한 것**이다. 다만 각 리소스의 인수·기본값·ForceNew 여부는 싣지 않는다 — 그것은 개별 문서에서 확인해야 하고, 읽는 법은 [14장](../level1-beginner/14-reading-resource-docs.md)에 있다.

## 리소스 이름 규칙

모든 리소스 타입 이름은 세 조각을 밑줄로 이은 것이다.

```
aws_<서비스 식별자>_<리소스 이름>
```

- **`aws`** — provider 접두어. 고정이다.
- **서비스 식별자(service identifier)** — 소문자, **밑줄을 포함하지 않는다**. `imagebuilder`, `accessanalyzer`, `opensearchserverless` 처럼 붙여 쓴다.
- **리소스 이름** — snake case 소문자. 공백이 있으면 밑줄로 바꾼다. `image_pipeline`, `certificate_authority`.

그래서 `aws_imagebuilder_image_pipeline` 은 서비스 `imagebuilder` + 리소스 `image_pipeline` 로 읽는다.

서비스 식별자는 다음 규칙으로 정해진다. AWS Go SDK v2의 패키지 이름과 AWS CLI v2의 *command*(예: `aws sts get-caller-identity` 에서 `sts`)를 각각 확인하고, 둘이 같으면 그것을 쓴다. 한쪽에만 있으면 그것을 쓴다. 다르면 **둘 중 짧은 쪽**을 쓴다. 소문자만 쓰고 밑줄은 넣지 않는다.

### 규칙이 깨지는 곳

156개 이상의 서비스 중 리소스 이름의 서비스 식별자가 규칙을 어기는 것이 **32개**다. 이름을 짐작할 때 걸려 넘어지는 지점이므로 알아 둘 값어치가 있다.

첫 번째 부류는 **EC2, ELB, ELBv2, RDS** 다. 오래됐고 널리 쓰이는 리소스들이 서비스 식별자를 아예 쓰지 않거나 일관성 없이 쓴다. `aws_instance`, `aws_ebs_volume`, `aws_ami`, `aws_eip`, `aws_lb`(ELBv2), `aws_elb`(Classic), `aws_db_instance`(RDS), `aws_subnet`, `aws_security_group` 이 그렇다. "이름 앞에 서비스가 없으면 대체로 EC2/VPC/ELB/RDS 계열"이라고 기억한다.

두 번째 부류는 규칙을 **일관된 방식으로** 어기는 28개다. 실제 이름과 규칙상 이름을 나란히 두면 이렇다.

| 실제 접두어 | 규칙대로면 | 실제 접두어 | 규칙대로면 |
|---|---|---|---|
| `api_gateway` | `apigateway` | `cloudwatch_event` | `events` |
| `appautoscaling` | `applicationautoscaling` | `cloudwatch_log` | `logs` |
| `codedeploy` | `deploy` | `kinesis_firehose` | `firehose` |
| `elasticsearch` | `es` | `msk` | `kafka` |
| `elastic_beanstalk` | `elasticbeanstalk` | `mskconnect` | `kafkaconnect` |
| `directory_service` | `ds` | `kinesis_analytics` | `kinesisanalytics` |
| `dx` | `directconnect` | `kinesis_video` | `kinesisvideo` |
| `config` | `configservice` | `lex` | `lexmodels` |
| `cognito` | `cognitoidp` | `media_convert` | `mediaconvert` |
| `cognito_identity` | `cognitoidentity` | `media_package` | `mediapackage` |
| `cloudcontrolapi` | `cloudcontrol` | `media_store` | `mediastore` |
| `prometheus` | `amp` | `route53_resolver` | `route53resolver` |
| `service_discovery` | `servicediscovery` | `serverlessapplicationrepository` | `serverlessrepo` |

밑줄이 들어간 접두어(`api_gateway`, `cloudwatch_log`, `elastic_beanstalk`, `directory_service`)는 전부 이 목록에 속한다. 밑줄 있는 접두어를 만나면 "규칙 위반 케이스구나" 하고 기억하면 된다.

### 문서를 찾는 법

리소스 문서 파일은 `website/docs/r/` 아래에 `<서비스식별자>_<리소스이름>.html.markdown` 으로 있다. **파일 이름에는 `aws` 가 들어가지 않는다.** `aws_accessanalyzer_analyzer` 의 문서는 `website/docs/r/accessanalyzer_analyzer.html.markdown` 이다. 데이터 소스는 `website/docs/d/` 아래에 같은 규칙으로 있다.

Registry URL도 같은 구조다.

```
https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/<서비스식별자>_<리소스이름>
https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/<서비스식별자>_<리소스이름>
```

이름을 모를 때의 순서는 이렇다. (1) 그 API의 이름을 확인한다 — 리소스 이름은 거의 항상 SDK의 `Create*`/`Get*`/`Update*`/`Delete*` 오퍼레이션에서 따온다. `CreateExperiment` 가 있으면 리소스는 `Experiment` 다. (2) 서비스 식별자를 위 규칙으로 만든다. (3) Registry 검색창에 넣어 본다. (4) 안 나오면 규칙 위반 표를 확인한다.

## 서비스 영역별 카탈로그

각 영역의 **대표 리소스**만 싣는다. 완전한 목록이 아니라 "이 영역에서 먼저 알아야 할 것"이다.

### 네트워킹 (VPC / EC2 네트워크)

가장 먼저 배우고 가장 자주 쓰는 영역이다. [5장](../level1-beginner/05-first-resource-vpc.md), [27장](../level2-intermediate/27-vpc-networking.md).

| 리소스 | 설명 |
|---|---|
| `aws_vpc` | VPC 자체. CIDR 블록을 정한다 |
| `aws_subnet` | 서브넷. AZ와 CIDR을 정한다 |
| `aws_internet_gateway` | IGW. VPC에 붙여 인터넷 경로를 연다 |
| `aws_egress_only_internet_gateway` | IPv6 아웃바운드 전용 게이트웨이 |
| `aws_nat_gateway` | NAT Gateway. 프라이빗 서브넷의 아웃바운드 |
| `aws_route_table` / `aws_route` / `aws_route_table_association` | 라우트 테이블, 개별 경로, 서브넷 연결 |
| `aws_network_acl` / `aws_network_acl_rule` / `aws_network_acl_association` | 서브넷 레벨 stateless 필터 |
| `aws_security_group` | 시큐리티 그룹 본체 |
| `aws_vpc_security_group_ingress_rule` / `aws_vpc_security_group_egress_rule` | 규칙 하나를 하나의 리소스로 |
| `aws_vpc_security_group_rules_exclusive` | 그 SG의 규칙 집합을 배타적으로 소유 |
| `aws_vpc_endpoint` / `aws_vpc_endpoint_service` | PrivateLink 엔드포인트와 서비스 |
| `aws_vpc_peering_connection` / `aws_vpc_peering_connection_accepter` | VPC 피어링과 수락 |
| `aws_ec2_transit_gateway` / `aws_ec2_transit_gateway_vpc_attachment` | Transit Gateway 허브와 VPC 연결 |
| `aws_vpc_dhcp_options` / `aws_vpc_dhcp_options_association` | DHCP 옵션 세트 |
| `aws_eip` / `aws_eip_association` | Elastic IP와 연결 |
| `aws_flow_log` | VPC/서브넷/ENI Flow Log |
| `aws_dx_connection` / `aws_dx_gateway` / `aws_dx_private_virtual_interface` | Direct Connect |
| `aws_networkfirewall_firewall` / `aws_networkfirewall_rule_group` | Network Firewall |
| `aws_default_vpc` / `aws_default_subnet` / `aws_default_route_table` / `aws_default_security_group` | 기본 리소스를 "채택"해 관리 |

### 컴퓨트 (EC2 / ASG / Launch Template)

[11장](../level1-beginner/11-ec2-instance.md), [28장](../level2-intermediate/28-compute-asg-alb.md).

| 리소스 | 설명 |
|---|---|
| `aws_instance` | EC2 인스턴스 |
| `aws_launch_template` | 인스턴스 생성 템플릿. ASG의 입력 |
| `aws_launch_configuration` | 구형 템플릿. 새 설계에는 쓰지 않는다 |
| `aws_autoscaling_group` | Auto Scaling Group |
| `aws_autoscaling_policy` / `aws_autoscaling_schedule` / `aws_autoscaling_lifecycle_hook` | 스케일링 정책, 예약, 라이프사이클 훅 |
| `aws_autoscaling_attachment` / `aws_autoscaling_traffic_source_attachment` | ASG와 로드밸런서 연결 |
| `aws_autoscaling_group_tag` | ASG 태그 하나를 리소스로 |
| `aws_key_pair` | SSH 키 페어 |
| `aws_ami` / `aws_ami_copy` / `aws_ami_from_instance` | AMI 생성·복사 |
| `aws_ebs_volume` / `aws_volume_attachment` | EBS 볼륨과 인스턴스 연결 |
| `aws_spot_instance_request` / `aws_spot_fleet_request` / `aws_ec2_fleet` | 스팟·플릿 |
| `aws_ec2_instance_metadata_defaults` | 계정 단위 IMDS 기본 정책 |
| `aws_ec2_tag` | 태그 하나만 관리 |
| `aws_imagebuilder_image_pipeline` / `aws_imagebuilder_image_recipe` | EC2 Image Builder |

### 컨테이너 (ECR / ECS / EKS)

[29장](../level2-intermediate/29-containers-ecs-eks.md).

| 리소스 | 설명 |
|---|---|
| `aws_ecr_repository` / `aws_ecr_repository_policy` / `aws_ecr_lifecycle_policy` | 프라이빗 레지스트리 |
| `aws_ecrpublic_repository` | 퍼블릭 레지스트리 |
| `aws_ecs_cluster` / `aws_ecs_cluster_capacity_providers` | ECS 클러스터 |
| `aws_ecs_task_definition` / `aws_ecs_service` | 태스크 정의와 서비스 |
| `aws_eks_cluster` / `aws_eks_node_group` / `aws_eks_fargate_profile` | EKS 컨트롤 플레인과 노드 |
| `aws_eks_addon` | 관리형 애드온 |
| `aws_eks_access_entry` / `aws_eks_access_policy_association` | Access Entry 기반 접근 제어 |
| `aws_eks_pod_identity_association` | Pod Identity |
| `aws_eks_identity_provider_config` | OIDC IdP 연동 |
| `aws_batch_compute_environment` / `aws_batch_job_queue` / `aws_batch_job_definition` | AWS Batch |
| `aws_apprunner_service` | App Runner |

### 서버리스 (Lambda / API Gateway / Step Functions / EventBridge)

[30장](../level2-intermediate/30-serverless-lambda.md).

| 리소스 | 설명 |
|---|---|
| `aws_lambda_function` | Lambda 함수 |
| `aws_lambda_alias` / `aws_lambda_permission` / `aws_lambda_function_url` | 별칭, 호출 권한, 함수 URL |
| `aws_lambda_event_source_mapping` | SQS·Kinesis·DynamoDB Streams 연결 |
| `aws_lambda_layer_version` / `aws_lambda_layer_version_permission` | 레이어 |
| `aws_apigatewayv2_api` / `aws_apigatewayv2_route` / `aws_apigatewayv2_integration` / `aws_apigatewayv2_stage` | HTTP·WebSocket API |
| `aws_api_gateway_rest_api` / `aws_api_gateway_resource` / `aws_api_gateway_method` / `aws_api_gateway_deployment` / `aws_api_gateway_stage` | REST API(v1) |
| `aws_sfn_state_machine` / `aws_sfn_alias` / `aws_sfn_activity` | Step Functions |
| `aws_cloudwatch_event_rule` / `aws_cloudwatch_event_target` / `aws_cloudwatch_event_bus` | EventBridge |
| `aws_cloudwatch_event_connection` / `aws_cloudwatch_event_api_destination` | 외부 API 대상 |
| `aws_scheduler_schedule` / `aws_scheduler_schedule_group` | EventBridge Scheduler |
| `aws_pipes_pipe` | EventBridge Pipes |

### 스토리지 (S3 / EBS / EFS / FSx)

S3는 v4에서 리소스가 쪼개진 대표 사례다. [12장](../level1-beginner/12-s3-bucket.md).

| 리소스 | 설명 |
|---|---|
| `aws_s3_bucket` | 버킷 본체 |
| `aws_s3_bucket_versioning` / `aws_s3_bucket_acl` / `aws_s3_bucket_policy` | 버저닝, ACL, 버킷 정책 |
| `aws_s3_bucket_server_side_encryption_configuration` | 기본 암호화 |
| `aws_s3_bucket_public_access_block` / `aws_s3_account_public_access_block` | 퍼블릭 접근 차단(버킷/계정) |
| `aws_s3_bucket_lifecycle_configuration` / `aws_s3_bucket_replication_configuration` | 수명주기, 복제 |
| `aws_s3_bucket_notification` / `aws_s3_bucket_logging` / `aws_s3_bucket_cors_configuration` | 알림, 로깅, CORS |
| `aws_s3_object` / `aws_s3_object_copy` | 객체 |
| `aws_s3_directory_bucket` / `aws_s3_access_point` | Express One Zone, 액세스 포인트 |
| `aws_s3tables_table_bucket` / `aws_s3tables_table` | S3 Tables |
| `aws_efs_file_system` / `aws_efs_mount_target` / `aws_efs_access_point` | EFS |
| `aws_fsx_lustre_file_system` / `aws_fsx_windows_file_system` / `aws_fsx_ontap_file_system` / `aws_fsx_openzfs_file_system` | FSx 4종 |
| `aws_backup_plan` / `aws_backup_vault` / `aws_backup_selection` | AWS Backup |
| `aws_dlm_lifecycle_policy` | EBS 스냅숏 수명주기 |
| `aws_storagegateway_gateway` / `aws_datasync_task` / `aws_transfer_server` | 하이브리드 전송 |

### 데이터베이스 (RDS / Aurora / DynamoDB / ElastiCache / Redshift / OpenSearch)

[31장](../level2-intermediate/31-databases-rds-dynamodb.md).

| 리소스 | 설명 |
|---|---|
| `aws_db_instance` | RDS 단일 인스턴스 |
| `aws_db_subnet_group` / `aws_db_parameter_group` / `aws_db_option_group` | 서브넷·파라미터·옵션 그룹 |
| `aws_db_proxy` / `aws_db_proxy_target` / `aws_db_proxy_endpoint` | RDS Proxy |
| `aws_rds_cluster` / `aws_rds_cluster_instance` | Aurora 클러스터와 인스턴스 |
| `aws_rds_cluster_parameter_group` / `aws_rds_global_cluster` | 클러스터 파라미터, 글로벌 DB |
| `aws_dynamodb_table` / `aws_dynamodb_table_item` / `aws_dynamodb_table_replica` | DynamoDB |
| `aws_dynamodb_global_secondary_index` / `aws_dynamodb_resource_policy` | GSI, 리소스 정책 |
| `aws_elasticache_cluster` / `aws_elasticache_replication_group` / `aws_elasticache_serverless_cache` | ElastiCache |
| `aws_memorydb_cluster` / `aws_memorydb_user` | MemoryDB |
| `aws_redshift_cluster` / `aws_redshift_parameter_group` / `aws_redshift_subnet_group` | Redshift |
| `aws_opensearch_domain` / `aws_opensearch_domain_policy` | OpenSearch |
| `aws_opensearchserverless_collection` / `aws_opensearchserverless_security_policy` | OpenSearch Serverless |
| `aws_neptune_cluster` / `aws_docdb_cluster` | Neptune, DocumentDB |
| `aws_timestreamwrite_database` / `aws_timestreamwrite_table` | Timestream |

### 메시징 (SQS / SNS / MSK / Kinesis)

| 리소스 | 설명 |
|---|---|
| `aws_sqs_queue` / `aws_sqs_queue_policy` | 큐와 정책 |
| `aws_sns_topic` / `aws_sns_topic_subscription` / `aws_sns_topic_policy` | 토픽·구독·정책 |
| `aws_sns_topic_data_protection_policy` | 데이터 보호 정책 |
| `aws_msk_cluster` / `aws_msk_serverless_cluster` / `aws_msk_configuration` | MSK |
| `aws_mskconnect_connector` / `aws_mskconnect_custom_plugin` | MSK Connect |
| `aws_kinesis_stream` / `aws_kinesis_stream_consumer` | Kinesis Data Streams |
| `aws_kinesis_firehose_delivery_stream` | Firehose |
| `aws_kinesisanalyticsv2_application` | Managed Service for Apache Flink |
| `aws_mq_broker` / `aws_mq_configuration` | Amazon MQ |

### 보안·자격증명 (IAM / KMS / Secrets Manager / ACM / WAF / GuardDuty / Security Hub)

[13장](../level1-beginner/13-iam-basics.md), [26장](../level2-intermediate/26-secrets-and-ephemeral.md), [35장](../level3-advanced/35-relationship-resources.md).

| 리소스 | 설명 |
|---|---|
| `aws_iam_role` / `aws_iam_policy` / `aws_iam_role_policy` / `aws_iam_role_policy_attachment` | 롤과 정책 |
| `aws_iam_instance_profile` / `aws_iam_service_linked_role` | 인스턴스 프로파일, 서비스 연결 롤 |
| `aws_iam_openid_connect_provider` / `aws_iam_saml_provider` | OIDC·SAML IdP |
| `aws_iam_role_policies_exclusive` / `aws_iam_role_policy_attachments_exclusive` | 배타적 소유(아래 색인 참조) |
| `aws_kms_key` / `aws_kms_alias` / `aws_kms_key_policy` / `aws_kms_grant` | KMS |
| `aws_secretsmanager_secret` / `aws_secretsmanager_secret_version` / `aws_secretsmanager_secret_rotation` | 시크릿과 회전 |
| `aws_ssm_parameter` | Parameter Store |
| `aws_acm_certificate` / `aws_acm_certificate_validation` | 퍼블릭·프라이빗 인증서 |
| `aws_acmpca_certificate_authority` | Private CA |
| `aws_wafv2_web_acl` / `aws_wafv2_rule_group` / `aws_wafv2_ip_set` / `aws_wafv2_web_acl_association` | WAF |
| `aws_guardduty_detector` / `aws_guardduty_detector_feature` / `aws_guardduty_filter` | GuardDuty |
| `aws_securityhub_account` / `aws_securityhub_standards_subscription` / `aws_securityhub_configuration_policy` | Security Hub |
| `aws_shield_protection` / `aws_shield_protection_group` | Shield Advanced |
| `aws_accessanalyzer_analyzer` | IAM Access Analyzer |

### 관측 (CloudWatch / CloudTrail / Config / X-Ray)

[32장](../level2-intermediate/32-observability.md).

| 리소스 | 설명 |
|---|---|
| `aws_cloudwatch_log_group` / `aws_cloudwatch_log_stream` | 로그 그룹·스트림 |
| `aws_cloudwatch_log_metric_filter` / `aws_cloudwatch_log_subscription_filter` | 메트릭 필터, 구독 필터 |
| `aws_cloudwatch_log_delivery` / `aws_cloudwatch_log_delivery_source` / `aws_cloudwatch_log_delivery_destination` | 서비스 로그 전달 |
| `aws_cloudwatch_metric_alarm` / `aws_cloudwatch_composite_alarm` | 알람 |
| `aws_cloudwatch_dashboard` / `aws_cloudwatch_query_definition` / `aws_cloudwatch_metric_stream` | 대시보드, 저장 쿼리, 메트릭 스트림 |
| `aws_cloudtrail` / `aws_cloudtrail_event_data_store` | CloudTrail |
| `aws_config_configuration_recorder` / `aws_config_delivery_channel` / `aws_config_config_rule` | AWS Config |
| `aws_xray_group` / `aws_xray_sampling_rule` / `aws_xray_encryption_config` | X-Ray |
| `aws_synthetics_canary` | CloudWatch Synthetics |
| `aws_oam_sink` / `aws_oam_link` | 계정 간 관측(Observability Access Manager) |

### 배포 (CodeBuild / CodePipeline / CodeDeploy)

[38장](../level3-advanced/38-large-scale-structure-cicd.md).

| 리소스 | 설명 |
|---|---|
| `aws_codebuild_project` / `aws_codebuild_webhook` / `aws_codebuild_source_credential` | CodeBuild |
| `aws_codepipeline` / `aws_codepipeline_webhook` | CodePipeline |
| `aws_codedeploy_app` / `aws_codedeploy_deployment_group` / `aws_codedeploy_deployment_config` | CodeDeploy |
| `aws_codecommit_repository` / `aws_codecommit_trigger` | CodeCommit |
| `aws_codeconnections_connection` / `aws_codestarconnections_connection` | 외부 SCM 연결(신·구 이름) |

### 조직·거버넌스 (Organizations / SSO / RAM / Service Catalog)

[50장](../level3-advanced/50-production-operations.md).

| 리소스 | 설명 |
|---|---|
| `aws_organizations_organization` / `aws_organizations_organizational_unit` / `aws_organizations_account` | 조직·OU·계정 |
| `aws_organizations_policy` / `aws_organizations_policy_attachment` | SCP·태그 정책 등 |
| `aws_organizations_delegated_administrator` | 위임 관리자 |
| `aws_ssoadmin_permission_set` / `aws_ssoadmin_account_assignment` | IAM Identity Center 권한 세트·할당 |
| `aws_ssoadmin_managed_policy_attachment` / `aws_ssoadmin_permissions_boundary_attachment` | 정책 연결, 권한 경계 |
| `aws_identitystore_user` / `aws_identitystore_group` / `aws_identitystore_group_membership` | Identity Store |
| `aws_ram_resource_share` / `aws_ram_resource_association` / `aws_ram_principal_association` | 리소스 공유 |
| `aws_servicecatalog_portfolio` / `aws_servicecatalog_product` / `aws_servicecatalog_constraint` | Service Catalog |
| `aws_controltower_landing_zone` / `aws_controltower_control` | Control Tower |
| `aws_budgets_budget` / `aws_ce_cost_category` / `aws_ce_anomaly_monitor` | 예산·비용 분류·이상 탐지 |

### 엣지·DNS (Route 53 / CloudFront / Global Accelerator)

| 리소스 | 설명 |
|---|---|
| `aws_route53_zone` / `aws_route53_record` / `aws_route53_zone_association` | 호스팅 존과 레코드 |
| `aws_route53_records_exclusive` | 존의 레코드 집합을 배타적으로 소유 |
| `aws_route53_health_check` / `aws_route53_traffic_policy` | 헬스 체크, 트래픽 정책 |
| `aws_route53_resolver_endpoint` / `aws_route53_resolver_rule` / `aws_route53_resolver_rule_association` | Resolver |
| `aws_cloudfront_distribution` / `aws_cloudfront_origin_access_control` | 배포와 오리진 접근 제어 |
| `aws_cloudfront_cache_policy` / `aws_cloudfront_origin_request_policy` / `aws_cloudfront_response_headers_policy` | 정책 3종 |
| `aws_cloudfront_function` / `aws_cloudfront_key_value_store` | CloudFront Functions와 KV |
| `aws_lb` / `aws_lb_listener` / `aws_lb_listener_rule` / `aws_lb_target_group` / `aws_lb_target_group_attachment` | ALB/NLB |
| `aws_elb` | Classic Load Balancer |
| `aws_globalaccelerator_accelerator` / `aws_globalaccelerator_listener` / `aws_globalaccelerator_endpoint_group` | Global Accelerator |
| `aws_vpclattice_service` / `aws_vpclattice_service_network` / `aws_vpclattice_target_group` | VPC Lattice |

### 분석 (Glue / Athena / EMR / Lake Formation / QuickSight)

| 리소스 | 설명 |
|---|---|
| `aws_glue_catalog_database` / `aws_glue_catalog_table` / `aws_glue_partition` | Data Catalog |
| `aws_glue_crawler` / `aws_glue_job` / `aws_glue_trigger` / `aws_glue_workflow` | 크롤러·잡·트리거·워크플로 |
| `aws_athena_workgroup` / `aws_athena_database` / `aws_athena_named_query` / `aws_athena_data_catalog` | Athena |
| `aws_emr_cluster` / `aws_emr_instance_group` / `aws_emr_instance_fleet` / `aws_emr_studio` | EMR |
| `aws_lakeformation_permissions` / `aws_lakeformation_resource` / `aws_lakeformation_data_lake_settings` | Lake Formation |
| `aws_lakeformation_lf_tag` / `aws_lakeformation_resource_lf_tags` | LF-Tag 기반 접근 제어 |
| `aws_quicksight_data_source` / `aws_quicksight_data_set` / `aws_quicksight_analysis` / `aws_quicksight_dashboard` | QuickSight |

### AI/ML (SageMaker / Bedrock)

| 리소스 | 설명 |
|---|---|
| `aws_sagemaker_domain` / `aws_sagemaker_user_profile` / `aws_sagemaker_app` | Studio 도메인·사용자·앱 |
| `aws_sagemaker_model` / `aws_sagemaker_endpoint_configuration` / `aws_sagemaker_endpoint` | 모델 배포 3단 |
| `aws_sagemaker_feature_group` / `aws_sagemaker_pipeline` / `aws_sagemaker_model_package_group` | 피처 스토어, 파이프라인, 모델 레지스트리 |
| `aws_bedrock_custom_model` / `aws_bedrock_provisioned_model_throughput` | 커스텀 모델, 프로비저닝 처리량 |
| `aws_bedrock_guardrail` / `aws_bedrock_guardrail_version` | 가드레일 |
| `aws_bedrockagent_agent` / `aws_bedrockagent_knowledge_base` / `aws_bedrockagent_data_source` | Bedrock Agents |
| `aws_bedrockagentcore_agent_runtime` / `aws_bedrockagentcore_gateway` / `aws_bedrockagentcore_memory` | Bedrock AgentCore |
| `aws_qbusiness_application` | Amazon Q Business |

## 리소스 문서 수 상위 서비스

문서 파일 접두어로 센 상위 20개다. 이름 규칙 예외 때문에 "서비스별 리소스 수"와 정확히 같지는 않다 — EC2 리소스 상당수는 `ec2_` 가 아니라 `instance`, `ami_*`, `ebs_*`, `spot_*` 로 흩어져 있고 RDS도 `rds_` 와 `db_` 로 나뉜다.

| 순위 | 접두어 | 문서 수 | 비고 |
|---|---|---|---|
| 1 | `ec2_` | 56 | EC2 리소스 상당수는 접두어 없이 흩어져 있어 실제로는 더 많다 |
| 2 | `vpc_` / `vpc` | 41 | `vpclattice_` 는 별도 |
| 3 | `sagemaker_` | 38 | |
| 4 | `cloudwatch_` | 36 | 이 중 18개가 `cloudwatch_log_` |
| 5 | `iam_` | 35 | |
| 6 | `s3_` | 28 | `s3control_` 15, `s3tables_` 7은 별도 |
| 7 | `ses` 계열 | 27 | `ses_` 14 + `sesv2_` 13 |
| 8 | `route53_` | 26 | Resolver·recovery 계열 포함 |
| 8 | `api_gateway_` | 26 | v1(REST)만. `apigatewayv2_` 13은 별도 |
| 10 | `redshift_` | 25 | serverless·data 계열 포함 |
| 10 | `quicksight_` | 25 | |
| 12 | `lightsail_` | 23 | |
| 13 | `cloudfront_` | 22 | |
| 14 | `networkmanager_` | 21 | |
| 14 | `glue_` | 21 | |
| 14 | `bedrockagentcore_` | 21 | v6 시기에 급성장한 영역 |
| 17 | `securityhub_` | 19 | `_v2` 접미 리소스가 병존 |
| 17 | `iot_` | 19 | |
| 17 | `dx_` | 19 | Direct Connect |
| 20 | `workspacesweb_` | 18 | |

`docs/core-services.md` 는 별도로 **Core Services**를 정의한다. 사용자 대다수에게 결정적이라고 판단해 매주 릴리스에서 우선순위를 두는 서비스들이다: **EC2, Lambda, EKS, ECS, VPC, S3, RDS, DynamoDB, IAM, Autoscaling(ASG), ElastiCache**. 이 교재의 Level 1·2가 다루는 범위와 거의 겹친다.

## 데이터 소스 · ephemeral · list 리소스 · provider 함수

### 데이터 소스 (673개)

데이터 소스는 "내가 만들지 않은 것을 읽는" 도구다([8장](../level1-beginner/08-data-sources.md)). 이름 규칙은 리소스와 같고 문서는 `website/docs/d/` 아래에 있다. 거의 모든 workspace에서 쓰이는 것들은 다음과 같다.

| 데이터 소스 | 용도 |
|---|---|
| `aws_caller_identity` | 현재 계정 ID·ARN·UserId |
| `aws_region` / `aws_regions` | 현재 리전 / 사용 가능한 리전 목록 |
| `aws_partition` | 파티션(`aws`, `aws-cn`, `aws-us-gov`)과 DNS 접미어 |
| `aws_availability_zones` | 현재 리전의 AZ 목록 |
| `aws_ami` | AMI 조회. **v6부터 `owners` 또는 `image-id`/`owner-id` filter가 필수** |
| `aws_vpc` / `aws_subnets` | 기존 VPC·서브넷 조회 |
| `aws_iam_policy_document` | IAM 정책 JSON 생성 |
| `aws_default_tags` | provider의 `default_tags` 를 모듈 안에서 읽기 |
| `aws_service` | 서비스의 리전별 엔드포인트·가용 여부 |
| `aws_ssm_parameter` / `aws_secretsmanager_secret_version` | 파라미터·시크릿 값 |

### Ephemeral 리소스 (10개 전부)

Ephemeral 리소스는 값을 **state에 저장하지 않는다**. 시크릿과 단기 토큰을 위한 장치다([26장](../level2-intermediate/26-secrets-and-ephemeral.md)). v6.x 기준으로 전부 열 개다.

| Ephemeral 리소스 | 용도 |
|---|---|
| `aws_secretsmanager_secret_version` | Secrets Manager 시크릿 값 |
| `aws_secretsmanager_random_password` | 임의 비밀번호 생성 |
| `aws_ssm_parameter` | Parameter Store 값 |
| `aws_kms_secrets` | KMS로 암호화된 데이터 복호화 |
| `aws_lambda_invocation` | Lambda 동기 호출 결과 |
| `aws_ecr_authorization_token` | ECR 로그인 토큰 |
| `aws_ecrpublic_authorization_token` | ECR Public 로그인 토큰 |
| `aws_eks_cluster_auth` | EKS 클러스터 인증 토큰 |
| `aws_sts_web_identity_token` | STS 웹 아이덴티티 토큰 |
| `aws_cognito_identity_openid_token_for_developer_identity` | Cognito 개발자 인증 OpenID 토큰 |

### List 리소스 (183개)

List 리소스는 `terraform query` 로 **기존 인프라를 발견**하는 데 쓴다([37장](../level3-advanced/37-list-resources-and-query.md)). 이름은 대응하는 관리형 리소스와 같다. 문서화된 예로 `aws_instance`, `aws_vpc`, `aws_s3_bucket`, `aws_iam_policy`, `aws_launch_template`, `aws_ec2_secondary_subnet` 등이 있다.

### Provider 함수 (4개 전부)

provider가 제공하는 순수 함수다. `provider::aws::<이름>(...)` 로 호출한다([33장](../level2-intermediate/33-provider-functions-and-policies.md)).

| 함수 | 용도 |
|---|---|
| `arn_parse` | ARN 문자열을 파티션·서비스·리전·계정·리소스로 분해 |
| `arn_build` | 조각들로 ARN 문자열 조립 |
| `trim_iam_role_path` | IAM 롤 ARN에서 path를 제거 |
| `user_agent` | User-Agent 문자열의 name/version/comment 성분을 형식에 맞게 조립 |

## 주의가 필요한 리소스 패턴 색인

카탈로그에서 이름을 찾는 것보다 **어떤 조합이 서로를 밟는지** 아는 것이 사고를 더 많이 막는다.

### 인라인 인수 vs 별도 리소스

같은 것을 두 가지 방법으로 관리할 수 있고, **둘을 함께 쓰면 무한 diff**가 나는 조합이다. 하나를 골라야 한다.

| 인라인 방식 | 별도 리소스 방식 |
|---|---|
| `aws_security_group` 의 `ingress` / `egress` 블록 | `aws_vpc_security_group_ingress_rule` / `aws_vpc_security_group_egress_rule` |
| `aws_iam_role` 의 `inline_policy` | `aws_iam_role_policy` |
| `aws_route_table` 의 `route` 블록 | `aws_route` |
| `aws_network_acl` 의 `ingress` / `egress` 블록 | `aws_network_acl_rule` |
| `aws_ecs_cluster` 의 설정 | `aws_ecs_cluster_capacity_providers` |
| `aws_default_vpc` 등 `default_*` 리소스 | 실제 신규 리소스 |

증상은 늘 같다. `plan` 이 매번 "추가하고 제거한다"를 반복하는데 apply해도 사라지지 않는다. 한쪽이 상태를 쓰면 다른 쪽이 그것을 자기 소유가 아니라고 보고 되돌리기 때문이다([21장](../level2-intermediate/21-lifecycle-meta-arguments.md), [35장](../level3-advanced/35-relationship-resources.md)).

### `*_exclusive` 계열 (12개 전부)

`*_exclusive` 리소스는 "이 목록이 전부다"를 선언한다. 여기에 없는 항목은 apply 때 **제거된다**. Terraform 밖에서 붙은 정책이나 레코드를 걷어내는 도구지만 그만큼 위험하다.

| 리소스 | 배타적으로 소유하는 것 |
|---|---|
| `aws_iam_role_policies_exclusive` | 그 롤의 인라인 정책 이름 집합 |
| `aws_iam_role_policy_attachments_exclusive` | 그 롤의 관리형 정책 연결 집합 |
| `aws_iam_user_policies_exclusive` | 그 사용자의 인라인 정책 집합 |
| `aws_iam_user_policy_attachments_exclusive` | 그 사용자의 관리형 정책 연결 집합 |
| `aws_iam_group_policies_exclusive` | 그 그룹의 인라인 정책 집합 |
| `aws_iam_group_policy_attachments_exclusive` | 그 그룹의 관리형 정책 연결 집합 |
| `aws_ssoadmin_managed_policy_attachments_exclusive` | 권한 세트의 관리형 정책 연결 집합 |
| `aws_ssoadmin_customer_managed_policy_attachments_exclusive` | 권한 세트의 고객 관리형 정책 연결 집합 |
| `aws_vpc_security_group_rules_exclusive` | 그 SG의 규칙 집합 |
| `aws_route53_records_exclusive` | 그 존의 레코드 집합 |
| `aws_ram_resource_share_associations_exclusive` | 리소스 공유의 연결 집합 |
| `aws_cloudfrontkeyvaluestore_keys_exclusive` | KV 스토어의 키 집합 |

이 리소스들에는 **import 지원이 없다**. 설계 결정 문서가 그 이유를 남기고 있다([49장](../level3-advanced/49-design-decisions.md)).

### `default_tags` 예외와 태그 리소스

`default_tags` 는 `tags` 를 구현한 모든 리소스에 적용되지만 **`aws_autoscaling_group` 은 예외**다. ASG에 공통 태그를 붙이려면 리소스의 `tag` 블록이나 `aws_autoscaling_group_tag` 를 쓴다.

개별 태그를 리소스로 관리하는 계열도 있다. 이들은 `ignore_tags` 의 적용 대상이 **아니다**.

`aws_ec2_tag`, `aws_ecs_tag`, `aws_dynamodb_tag`, `aws_secretsmanager_tag`, `aws_transfer_tag`, `aws_organizations_tag`, `aws_autoscaling_group_tag`, `aws_ce_cost_allocation_tag`, `aws_lakeformation_lf_tag`, `aws_lakeformation_resource_lf_tags`, `aws_lakeformation_resource_lf_tag`, `aws_cognito_identity_pool_provider_principal_tag`.

[10장](../level1-beginner/10-tags-basics.md), [23장](../level2-intermediate/23-tagging-strategy.md).

### v6에서 제거된 리소스

코드에 남아 있으면 `plan` 이 아니라 설정 검증 단계에서 실패한다. [39장](../level3-advanced/39-version-upgrades.md), [부록 D](d-v6-breaking-changes.md).

**OpsWorks Stacks — 17개 전부 제거.** 서비스가 End of Life에 도달했다.

`aws_opsworks_application`, `aws_opsworks_custom_layer`, `aws_opsworks_ecs_cluster_layer`, `aws_opsworks_ganglia_layer`, `aws_opsworks_haproxy_layer`, `aws_opsworks_instance`, `aws_opsworks_java_app_layer`, `aws_opsworks_memcached_layer`, `aws_opsworks_mysql_layer`, `aws_opsworks_nodejs_app_layer`, `aws_opsworks_permission`, `aws_opsworks_php_app_layer`, `aws_opsworks_rails_app_layer`, `aws_opsworks_rds_db_instance`, `aws_opsworks_stack`, `aws_opsworks_static_web_layer`, `aws_opsworks_user_profile`.

**SimpleDB — `aws_simpledb_domain` 제거.** AWS SDK for Go v2가 SimpleDB를 더 이상 지원하지 않는다.

**Worklink — 2개 제거.** `aws_worklink_fleet`, `aws_worklink_website_certificate_authority_association`. 역시 SDK v2에서 지원이 빠졌다.

`aws_redshift_service_account` 도 제거됐다. 계정 ID 대신 service principal name을 쓰라는 AWS 권고에 따른 것이다.

provider 인수 쪽에서도 `endpoints.opsworks`, `endpoints.simpledb`, `endpoints.sdb`, `endpoints.worklink` 가 함께 제거됐다.

### v6에서 deprecated된 리소스

제거되지는 않았지만 다음 메이저에서 사라질 예정이다. 지금 마이그레이션 계획을 세워 둔다.

| 리소스 | 사유와 대안 |
|---|---|
| `aws_elastictranscoder_pipeline`, `aws_elastictranscoder_preset` | Elastic Transcoder 단종(2025-11-13). AWS Elemental MediaConvert로 이전 |
| `aws_evidently_feature`, `aws_evidently_launch`, `aws_evidently_project`, `aws_evidently_segment` | CloudWatch Evidently 지원 종료(2025-10-17). AWS AppConfig Feature Flags로 이전 |
| `aws_kinesis_analytics_application` | Kinesis Data Analytics for SQL 지원 종료. `aws_kinesisanalyticsv2_application` 사용 |

### 이름이 헷갈리는 짝

| 짝 | 차이 |
|---|---|
| `aws_lb` vs `aws_elb` | 전자는 ALB/NLB(ELBv2), 후자는 Classic Load Balancer |
| `aws_db_instance` vs `aws_rds_cluster` | 전자는 RDS 단일 인스턴스, 후자는 Aurora 클러스터 |
| `aws_opensearch_domain` vs `aws_elasticsearch_domain` | 후자는 구형 Elasticsearch Service 이름 |
| `aws_wafv2_web_acl` vs `aws_waf_web_acl` vs `aws_wafregional_web_acl` | 순서대로 현행 WAF, WAF Classic(글로벌), WAF Classic(리전) |
| `aws_codestarconnections_connection` vs `aws_codeconnections_connection` | 후자가 새 서비스 이름 |
| `aws_security_group_rule` vs `aws_vpc_security_group_ingress_rule` | 전자는 구형 통합 규칙 리소스, 후자가 방향별 신형 |
| `aws_s3_bucket_object` vs `aws_s3_object` | 후자가 현행 이름 |
| `aws_cloudwatch_event_rule` vs `aws_scheduler_schedule` | 전자는 EventBridge 규칙, 후자는 EventBridge Scheduler |

## 관련 문서

- [8장 — 데이터 소스](../level1-beginner/08-data-sources.md) · [14장 — 리소스 문서 읽는 법](../level1-beginner/14-reading-resource-docs.md)
- [35장 — 관계 리소스와 `*_exclusive`](../level3-advanced/35-relationship-resources.md) · [37장 — List Resource와 `terraform query`](../level3-advanced/37-list-resources-and-query.md) · [39장 — 메이저 버전 업그레이드](../level3-advanced/39-version-upgrades.md)
- [부록 D — v6 파괴적 변경 체크리스트](d-v6-breaking-changes.md) · [부록 E — 용어집](e-glossary.md)
- 공식 문서: [AWS Provider Resources](https://registry.terraform.io/providers/hashicorp/aws/latest/docs), [Version 6 Upgrade Guide](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/version-6-upgrade)
