---
title: "35장. 대응 자동화 (SOAR)"
---

# 35장. 대응 자동화 (SOAR)

> **이 장에서 다루는 것**
> - 어떤 조치를 자동화해도 되고 어떤 조치는 사람 승인 아래 두어야 하는지 판단하는 매트릭스
> - EventBridge + Lambda로 구현하는 실전 자동 조치 3종 — 퍼블릭 버킷 차단, 노출된 키 비활성화, 위반 보안 그룹 되돌리기
> - AWS Config 규칙에 SSM Automation 문서를 연결하는 자동 교정(remediation)
> - Security Hub 사용자 지정 작업으로 만드는 **반자동** 패턴과, 그것이 완전 자동화보다 안전한 이유
> - ⚠️ 자동화가 스스로 장애를 만드는 네 가지 방식과 안전장치 5종
>
> **선행 지식**: 28장(IaC와 변경 관리), 30장(모니터링·EventBridge), 31장(위협 탐지 서비스), 32~34장(사고 대응)
> **난이도**: ★★★

29장부터 34장까지, 우리는 로그를 모으고 이벤트를 잡고 결과를 집계하고 사람이 대응하는 체계를 세웠습니다. 6부의 마지막 질문은 이것입니다. **"그 대응 중 어디까지를 기계에 맡길 것인가?"**

시장에서는 이 영역을 SOAR(Security Orchestration, Automation and Response)라고 부릅니다. AWS에는 SOAR라는 이름의 서비스가 없습니다. 대신 **EventBridge(배선) + Lambda·SSM Automation(실행) + Config·Security Hub(판정)** 를 조합해 직접 만듭니다. 이 장은 그 조립 방법이고, 동시에 **조립하지 말아야 할 것에 대한 경고**입니다.

먼저 원서가 이 주제를 어떻게 여는지 봅시다.

> 📖 *Practical Cloud Security* 2판 7장 「Alerting and Automated Response」: **"자동 대응은 원칙적으로는 훌륭하게 들리지만, 실제로는 비즈니스를 중단시킬 잠재력을 가지고 있다. 잘못된 대응이나 자동화된 과잉 반응으로 인한 장애에 더해, 자동 대응 시스템은 공격자가 의도적으로 이용해 장애를 일으킬 수 있다."**

이 문장을 이 장의 머리에 못 박아 둡니다. 자동화의 기본값은 "한다"가 아니라 **"하지 않는다"** 입니다.

---

## 35.1 자동화할 것과 하지 말 것

### 원서가 세운 저울

원서는 자동 대응을 금지하지 않습니다. 대신 저울을 제시합니다.

> 📖 *Practical Cloud Security* 2판 7장: **"어떤 환경은 보안 요구 수준이 충분히 높아서, 사람이 조사할 때까지 공격이 계속되도록 놔둘 작은 위험조차 감수하느니 차라리 장애를 겪겠다고 판단한다. 그러나 대부분의 경우에는 운영 위험과 보안 위험을 신중하게 균형 잡아야 한다."**

또한 원서는 자동화가 **공격 표면 자체가 될 수 있다**는 점을 구체적인 그림으로 보여 줍니다.

> 📖 *Practical Cloud Security* 2판 7장: **"서비스 거부 공격을 막으려고 상당한 돈을 썼는데, 그 결과 공격자가 단순한 포트 스캐너나 몇 번의 로그인 실패만으로 손쉬운 서비스 거부 공격을 수행할 수 있게 만들었다는 걸 깨닫는 것은 유쾌한 일이 아니다."**

번역하면 이렇습니다. **"로그인 3회 실패 시 계정 자동 잠금"** 을 켜 놓으면, 공격자는 여러분의 임원 계정 이름만 알면 로그인 실패 세 번으로 그 사람을 업무에서 배제할 수 있습니다. 공격자에게 필요한 것은 취약점이 아니라 **여러분이 만든 자동화의 트리거 조건**뿐입니다. 자동화는 공격자에게 제공하는 API이기도 합니다.

이 관점을 AWS 문맥으로 옮기면 판단 기준이 나옵니다. 자동 조치를 설계할 때 **"공격자가 이 트리거를 마음대로 발생시킬 수 있는가?"** 를 반드시 물어야 합니다. 트리거가 공격자 통제 아래 있다면(외부에서 오는 스캔·로그인 시도·요청 패턴) 자동 조치는 무기가 됩니다. 트리거가 조직 내부의 API 호출(`PutBucketPolicy`, `AuthorizeSecurityGroupIngress`)이라면 훨씬 안전합니다.

### 자동화 적합성 판단 매트릭스

세 축으로 판정합니다.

| 축 | 묻는 질문 | 위험한 쪽 |
|---|---|---|
| **오탐률** | 이 탐지가 틀릴 확률은? 트리거를 외부인이 만들 수 있는가? | 오탐이 잦거나 외부가 트리거를 통제 |
| **되돌릴 수 있음** | 조치가 틀렸을 때 30초 안에 원상복구되는가? | 되돌릴 수 없거나 원상복구에 사람·시간이 필요 |
| **서비스 영향** | 조치가 정상 트래픽을 끊는가? | 사용자 요청 처리 경로를 건드림 |

세 축의 조합으로 네 등급을 매깁니다.

| 등급 | 조건 | 처리 |
|---|---|---|
| **A. 완전 자동** | 오탐이어도 무해 + 되돌릴 수 있음 + 서비스 영향 없음 | 즉시 실행. 사람에게는 사후 통보 |
| **B. 자동 + 즉시 알림** | 오탐 낮음 + 되돌릴 수 있음 + 영향은 제한적 | 실행하되 5분 내 사람이 확인. 롤백 절차 문서화 |
| **C. 반자동(버튼)** | 판단은 사람, 실행은 기계 | Security Hub 사용자 지정 작업(35.4) |
| **D. 수동** | 되돌릴 수 없음 또는 서비스 중단 | 플레이북(32.2)대로 사람이 승인 |

### 등급별 조치 목록

| 조치 | 오탐 시 피해 | 되돌리기 | 등급 |
|---|---|---|---|
| 리소스에 태그 추가(`SecurityReview=pending`) | 없음 | 태그 삭제 | **A** |
| EBS 스냅샷 생성(증거 보전, 34.2) | 비용 몇 달러 | 스냅샷 삭제 | **A** |
| 결과 강화 — 관련 CloudTrail·VPC 플로우 로그를 모아 티켓에 붙이기 | 없음 | — | **A** |
| 알림 발송·티켓 생성 | 알람 피로(30.9) | — | **A** |
| 격리용 보안 그룹 **준비**(생성만, 부착은 안 함) | 없음 | SG 삭제 | **A** |
| S3 퍼블릭 액세스 차단 복구 | 정상 공개 자산 접근 불가 | 차단 해제(즉시) | **B** |
| 위반 보안 그룹 규칙 되돌리기 | 정당한 임시 규칙 삭제 | 규칙 재추가(즉시) | **B** |
| 노출된 **장기 IAM 액세스 키** 비활성화 | 배치 작업 중단 | `Status=Active` 복원(즉시) | **B** |
| CloudTrail 재활성화·Config 레코더 재시작 | 없음 | — | **B** |
| EC2 인스턴스를 격리 SG로 **전환** | 정상 서비스 노드 이탈 | 원래 SG 복원 | **C** |
| IAM 역할 세션 폐기(`AWSRevokeOlderSessions`, 33.3) | 정상 워크로드 인증 실패 | 정책 제거(전파 지연 있음) | **C** |
| EC2 인스턴스 종료 | **증거 소멸**(34.5) + 서비스 중단 | **불가** | **D** |
| 운영 계정의 IAM 정책·SCP 변경 | 광범위한 권한 사고 | 어렵다 | **D** |
| IAM 사용자/역할 삭제, 계정 잠금 | 대응팀 자신이 잠길 수 있음 | 어렵다 | **D** |
| RDS 인스턴스 정지·삭제 | 서비스 전면 중단 | 매우 어렵다 | **D** |

이 표에서 읽어야 할 규칙 세 개입니다.

**첫째, "만들기"는 자동화하고 "지우기"는 자동화하지 않습니다.** 스냅샷 생성·태그 부착·SG 준비는 전부 A등급인데 공통점은 **아무것도 파괴하지 않는다**는 것입니다. 34.5가 강조하는 "종료 전 증거 확보"의 앞부분은 자동화하기에 이상적입니다.

**둘째, "임시 자격 증명"과 "장기 자격 증명"을 구분합니다.** IAM 사용자의 액세스 키는 `UpdateAccessKey`로 비활성화했다가 되돌릴 수 있는 B등급입니다. 반면 역할 세션은 키를 끄는 개념이 없어 **인라인 정책으로 전면 Deny를 거는 방식**(33.3)이라 되돌리기가 느리고 부작용이 큽니다 — C등급입니다.

**셋째, 서비스 요청 경로를 건드리는 것은 전부 D 방향으로 내려갑니다.** ShopMini의 ALB 리스너 규칙, RDS 파라미터, CloudFront 배포 설정을 자동으로 바꾸는 자동화는 만들지 마십시오. 사고 대응이 장애 대응으로 바뀝니다.

### 등급을 문서로 고정한다

이 판단을 개인의 감각에 맡기면 사람마다 다른 자동화를 만듭니다. **자동화 카탈로그**를 저장소에 두고, 새 자동화를 추가할 때 PR에서 아래 항목을 채우게 하십시오.

| 항목 | 예 |
|---|---|
| 자동화 이름 | `s3-public-block` |
| 트리거 | CloudTrail `PutBucketPolicy`/`PutBucketAcl` |
| 트리거를 외부가 통제할 수 있는가 | 아니오(내부 API 호출) |
| 조치 | `PutBucketPublicAccessBlock` 4종 활성화 |
| 등급 | B |
| 롤백 절차 | 차단 해제 CLI 1줄 (런북 링크) |
| 예외 태그 | `SecurityAutomation=exclude` |
| 상한 | 시간당 5건 |
| 승인자 | 보안팀 리드 + 플랫폼팀 리드 |

**승인자 두 명**이 핵심입니다. 자동화는 보안 통제인 동시에 운영 변경이므로, 서비스를 책임지는 쪽의 서명이 없으면 배포하지 마십시오.

---

## 35.2 EventBridge + Lambda 자동 조치 패턴 🧪

30.5에서 EventBridge로 이벤트를 잡아 **사람에게 전달**하는 데까지 왔습니다. 여기서 대상만 SNS에서 Lambda로 바꾸면 자동 조치가 됩니다. 배선은 쉽습니다. 어려운 것은 **함수 안에 넣어야 하는 안전장치**입니다.

### 공유 안전장치 모듈

세 패턴이 똑같이 필요로 하는 것을 먼저 만듭니다. 이걸 Lambda 계층(layer)이나 공통 패키지로 두고 모든 자동화가 import 하게 하십시오. **안전장치는 자동화마다 다시 구현하면 반드시 빠집니다.**

```python
# guard.py — 모든 보안 자동화가 공유하는 안전장치
import os, json, time
import boto3
from botocore.exceptions import ClientError

DRY_RUN = os.environ.get("DRY_RUN", "true").lower() == "true"   # 기본값은 '조치하지 않음'
LIMIT   = int(os.environ.get("MAX_ACTIONS_PER_HOUR", "5"))       # 서킷 브레이커 상한
TABLE   = os.environ["CIRCUIT_TABLE"]
TOPIC   = os.environ["NOTIFY_TOPIC_ARN"]
ROBOT   = os.environ["AUTOMATION_ROLE_NAME"]                     # 자기 자신을 식별하기 위한 값

ddb = boto3.client("dynamodb")
sns = boto3.client("sns")


def is_self(event_detail) -> bool:
    """자동화가 만든 변경이 다시 트리거되는 무한 루프를 끊는다."""
    arn = event_detail.get("userIdentity", {}).get("arn", "")
    return f":assumed-role/{ROBOT}/" in arn


def excluded(tags: dict) -> bool:
    """예외 태그가 붙은 리소스는 절대 건드리지 않는다."""
    return tags.get("SecurityAutomation", "").lower() == "exclude"


def circuit_ok(automation: str) -> bool:
    """단위 시간당 조치 상한. 초과하면 멈추고 사람을 부른다."""
    bucket = f"{automation}#{int(time.time() // 3600)}"
    try:
        r = ddb.update_item(
            TableName=TABLE,
            Key={"pk": {"S": bucket}},
            UpdateExpression="SET #t = :ttl ADD #c :one",
            ExpressionAttributeNames={"#c": "count", "#t": "expires_at"},
            ExpressionAttributeValues={
                ":one": {"N": "1"},
                ":ttl": {"N": str(int(time.time()) + 7200)},
            },
            ReturnValues="UPDATED_NEW",
        )
    except ClientError:
        return False        # 카운터를 못 세면 조치하지 않는다 (fail-closed)
    return int(r["Attributes"]["count"]["N"]) <= LIMIT


def audit(automation: str, resource: str, decision: str, detail: str) -> None:
    """자동화 자체의 감사 로그. 조치했든 안 했든 항상 남긴다."""
    record = {
        "automation": automation, "resource": resource,
        "decision": decision, "dry_run": DRY_RUN, "detail": detail,
    }
    print(json.dumps(record, ensure_ascii=False))          # CloudWatch Logs
    if decision != "noop":                                  # 무변경은 알림하지 않는다(소음 억제)
        sns.publish(
            TopicArn=TOPIC,
            Subject=f"[SecAuto] {automation} / {decision}",
            Message=json.dumps(record, ensure_ascii=False, indent=2),
        )
```

주목할 설계 결정이 넷입니다.

- **`DRY_RUN`의 기본값이 `true`** 입니다. 환경 변수를 빠뜨린 채 배포하면 아무것도 망가뜨리지 않고 로그만 남습니다. 반대로 설계하면 오타 하나가 사고가 됩니다.
- **`circuit_ok`는 예외 시 `False`를 반환**합니다. 카운터를 셀 수 없는 상태에서 조치하면 상한이 무의미해지므로 **fail-closed**로 갑니다. 여기서 "closed"는 "조치를 하지 않음"입니다 — 보안 자동화에서 안전한 실패는 **조치를 멈추는 것**입니다.
- **`is_self`가 첫 관문**입니다. 이것 없이는 35.5의 무한 루프 시나리오가 그대로 재현됩니다.
- **`audit`은 결정을 내렸다는 사실 자체를 기록**합니다. "조치함"뿐 아니라 "예외 태그 때문에 건너뜀", "상한 초과로 멈춤"도 남아야 나중에 "왜 그때 자동화가 안 돌았나"에 답할 수 있습니다.

### 패턴 ① — 퍼블릭이 된 S3 버킷 자동 차단

**등급 B.** 트리거는 내부 API 호출이고, 조치는 CLI 한 줄로 되돌릴 수 있으며, 영향은 그 버킷 하나에 한정됩니다.

```json
{
  "source": ["aws.s3"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventSource": ["s3.amazonaws.com"],
    "eventName": [
      "PutBucketPolicy",
      "PutBucketAcl",
      "DeleteBucketPolicy",
      "PutBucketPublicAccessBlock",
      "DeleteBucketPublicAccessBlock"
    ],
    "errorCode": [{ "exists": false }]
  }
}
```

⚠️ **eventName은 반드시 실제 CloudTrail 레코드로 확인하고 확정하십시오.** S3 관리 이벤트의 이름은 SDK 메서드명과 IAM 액션명이 서로 다른 경우가 있습니다. 규칙을 만들기 전에 대상 API를 한 번 호출해 보고, CloudTrail 이벤트 기록에서 `eventName` 값을 그대로 복사해 넣는 것이 가장 확실합니다. 이름을 하나라도 잘못 쓰면 **규칙은 아무 오류 없이 조용히 아무것도 잡지 않습니다.**

```python
# handler_s3_public_block.py
import boto3
from botocore.exceptions import ClientError
from guard import DRY_RUN, is_self, excluded, circuit_ok, audit

s3 = boto3.client("s3")
NAME = "s3-public-block"
BLOCK = {
    "BlockPublicAcls": True, "IgnorePublicAcls": True,
    "BlockPublicPolicy": True, "RestrictPublicBuckets": True,
}


def handler(event, context):
    d = event["detail"]
    if is_self(d):                                    # 루프 차단
        return
    bucket = d.get("requestParameters", {}).get("bucketName")
    if not bucket:
        return

    # ① 멱등성 — 이미 4종이 모두 켜져 있으면 아무것도 하지 않는다
    try:
        cur = s3.get_public_access_block(
            Bucket=bucket)["PublicAccessBlockConfiguration"]
    except ClientError:
        cur = {}
    if all(cur.get(k) for k in BLOCK):
        return audit(NAME, bucket, "noop", "already fully blocked")

    # ② 예외 태그
    try:
        tags = {t["Key"]: t["Value"]
                for t in s3.get_bucket_tagging(Bucket=bucket)["TagSet"]}
    except ClientError:
        tags = {}
    if excluded(tags):
        return audit(NAME, bucket, "skipped", "SecurityAutomation=exclude")

    # ③ 서킷 브레이커
    if not circuit_ok(NAME):
        return audit(NAME, bucket, "circuit-open", "hourly limit exceeded")

    # ④ 드라이런
    caller = d.get("userIdentity", {}).get("arn", "unknown")
    if DRY_RUN:
        return audit(NAME, bucket, "dry-run",
                     f"would block public access (changed by {caller})")

    # ⑤ 조치
    s3.put_public_access_block(
        Bucket=bucket, PublicAccessBlockConfiguration=BLOCK)
    audit(NAME, bucket, "remediated", f"changed by {caller}")
```

순서가 중요합니다. **멱등성 검사 → 예외 → 상한 → 드라이런 → 조치.** 멱등성 검사를 맨 앞에 두면 이미 안전한 버킷에 대해 서킷 브레이커 카운터를 소모하지 않습니다. 카운터를 무변경 건까지 소모하면 정작 필요할 때 회로가 열려 있습니다.

⚠️ **이 함수 역할에 `s3:*`를 주지 마십시오.** 자동화 역할은 조직에서 가장 강력한 권한 중 하나가 되기 쉽습니다. **읽기는 넓게, 쓰기는 한 개 액션으로** 좁힙니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadBucketState",
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketPublicAccessBlock",
        "s3:GetBucketTagging",
        "s3:GetBucketPolicy",
        "s3:GetBucketAcl"
      ],
      "Resource": "arn:aws:s3:::shopmini-*"
    },
    {
      "Sid": "WriteOnlyTheOneAction",
      "Effect": "Allow",
      "Action": "s3:PutBucketPublicAccessBlock",
      "Resource": "arn:aws:s3:::shopmini-*"
    },
    {
      "Sid": "GuardStateAndNotify",
      "Effect": "Allow",
      "Action": ["dynamodb:UpdateItem"],
      "Resource": "arn:aws:dynamodb:ap-northeast-2:444455556666:table/sec-automation-circuit"
    },
    {
      "Sid": "Notify",
      "Effect": "Allow",
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:ap-northeast-2:444455556666:shopmini-secauto"
    }
  ]
}
```

쓰기 액션이 **정확히 하나**라는 점을 보십시오. 이 역할이 탈취돼도 공격자가 할 수 있는 일은 "버킷을 더 안전하게 만드는 것"뿐입니다. 자동화 역할을 설계할 때의 목표는 **"이 역할이 공격자 손에 들어가도 손해가 없는 상태"** 입니다.

### 패턴 ② — 노출된 액세스 키 자동 비활성화

**등급 B(단, 장기 키에 한해서).** GuardDuty 결과를 트리거로 씁니다.

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{ "numeric": [">=", 7] }],
    "type": [
      "UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS",
      "UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.InsideAWS",
      "UnauthorizedAccess:IAMUser/MaliciousIPCaller",
      "UnauthorizedAccess:IAMUser/MaliciousIPCaller.Custom"
    ]
  }
}
```

```python
# handler_disable_key.py
import boto3
from guard import DRY_RUN, excluded, circuit_ok, audit

iam = boto3.client("iam")
NAME = "iam-key-disable"


def handler(event, context):
    ak = event["detail"].get("resource", {}).get("accessKeyDetails", {})
    user, key_id = ak.get("userName"), ak.get("accessKeyId")
    if not user or not key_id:
        return

    # ① 임시 자격 증명은 키 비활성화로 무효화되지 않는다 → 사람에게 넘긴다
    if ak.get("userType") != "IAMUser":
        return audit(NAME, user, "escalated",
                     "역할 세션(임시 자격 증명). 세션 폐기 절차는 33.3 참조")

    # ② 멱등성 — 이미 Inactive면 끝
    keys = iam.list_access_keys(UserName=user)["AccessKeyMetadata"]
    cur = next((k for k in keys if k["AccessKeyId"] == key_id), None)
    if cur is None or cur["Status"] == "Inactive":
        return audit(NAME, user, "noop", "key already inactive or deleted")

    # ③ 예외 태그
    tags = {t["Key"]: t["Value"]
            for t in iam.list_user_tags(UserName=user)["Tags"]}
    if excluded(tags):
        return audit(NAME, user, "skipped", "SecurityAutomation=exclude")

    # ④ 상한 · ⑤ 드라이런
    if not circuit_ok(NAME):
        return audit(NAME, user, "circuit-open", "hourly limit exceeded")
    if DRY_RUN:
        return audit(NAME, user, "dry-run", f"would deactivate {key_id[-4:]}")

    iam.update_access_key(UserName=user, AccessKeyId=key_id,
                          Status="Inactive")
    audit(NAME, user, "remediated",
          f"access key ...{key_id[-4:]} set to Inactive")
```

세 가지를 짚습니다.

**`userType` 분기가 이 함수의 핵심입니다.** GuardDuty의 `InstanceCredentialExfiltration` 계열은 대개 **EC2 인스턴스 역할의 임시 자격 증명**에 대한 결과입니다. 임시 키에는 `UpdateAccessKey`가 통하지 않습니다. 여기서 "삭제 못 하니 뭐라도 해 보자"는 코드를 쓰면 엉뚱한 IAM 사용자를 끄게 됩니다. **자동화가 할 수 없는 일이면 정직하게 사람에게 넘기십시오.**

**키를 삭제하지 않고 비활성화합니다.** `DeleteAccessKey`는 되돌릴 수 없고 포렌식 증거(어떤 키였는지)도 함께 사라집니다. `Status=Inactive`는 즉시 효력이 있으면서 되돌릴 수 있습니다 — B등급을 유지하는 조건입니다.

**로그에 키 전체를 남기지 않습니다.** 마지막 4자리만 남겨 식별은 되되 로그가 자격 증명 저장소가 되지 않게 합니다(29.1의 원칙).

역할 권한은 다음으로 충분합니다 — `iam:ListAccessKeys`, `iam:ListUserTags`, `iam:UpdateAccessKey`. ⚠️ **`iam:UpdateAccessKey`에 `Resource: "*"`를 쓰면 이 역할이 조직의 모든 IAM 사용자를 잠글 수 있는 무기가 됩니다.** 자동화 대상 사용자에 경로(path)를 부여해 `arn:aws:iam::111122223333:user/app/*` 처럼 좁히고, 브레이크 글래스 사용자(32.4)와 대응팀 사용자는 그 경로 밖에 두십시오.

### 패턴 ③ — 규정 위반 보안 그룹 자동 되돌리기

**등급 B.** 28.4의 "새벽 2시에 손으로 추가한 규칙"이 바로 이 자동화의 대상입니다.

```json
{
  "source": ["aws.ec2"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventSource": ["ec2.amazonaws.com"],
    "eventName": ["AuthorizeSecurityGroupIngress"],
    "errorCode": [{ "exists": false }]
  }
}
```

이벤트 본문의 `requestParameters`를 파싱하는 대신 **현재 상태를 다시 조회**합니다. 파싱은 형식 변화에 취약하고, 여러 요청이 겹치면 이미 지나간 상태를 지우게 됩니다. 상태를 다시 읽으면 자연히 멱등해집니다.

```python
# handler_sg_revoke.py
import boto3
from guard import DRY_RUN, is_self, excluded, circuit_ok, audit

ec2 = boto3.client("ec2")
NAME = "sg-open-revoke"
OPEN_CIDRS = {"0.0.0.0/0", "::/0"}
ALLOWED_OPEN_PORTS = {80, 443}          # 인터넷에 열려도 되는 포트(ALB용)


def violating_rule_ids(group_id):
    rules = ec2.describe_security_group_rules(
        Filters=[{"Name": "group-id", "Values": [group_id]}]
    )["SecurityGroupRules"]
    bad = []
    for r in rules:
        if r.get("IsEgress"):
            continue
        cidr = r.get("CidrIpv4") or r.get("CidrIpv6")
        if cidr not in OPEN_CIDRS:
            continue
        if (r.get("IpProtocol") == "tcp"
                and r.get("FromPort") == r.get("ToPort")
                and r.get("FromPort") in ALLOWED_OPEN_PORTS):
            continue                     # ALB의 80/443은 정상
        bad.append(r["SecurityGroupRuleId"])
    return bad


def handler(event, context):
    d = event["detail"]
    if is_self(d):
        return
    gid = d.get("requestParameters", {}).get("groupId")
    if not gid:
        return

    bad = violating_rule_ids(gid)        # ① 멱등성: 현재 상태 기준
    if not bad:
        return audit(NAME, gid, "noop", "no open ingress rule found")

    sg = ec2.describe_security_groups(GroupIds=[gid])["SecurityGroups"][0]
    tags = {t["Key"]: t["Value"] for t in sg.get("Tags", [])}
    if excluded(tags):                   # ② 예외 태그
        return audit(NAME, gid, "skipped", "SecurityAutomation=exclude")
    if not circuit_ok(NAME):             # ③ 상한
        return audit(NAME, gid, "circuit-open", "hourly limit exceeded")

    caller = d.get("userIdentity", {}).get("arn", "unknown")
    if DRY_RUN:                          # ④ 드라이런
        return audit(NAME, gid, "dry-run",
                     f"would revoke {bad} (added by {caller})")

    ec2.revoke_security_group_ingress(                # ⑤ 조치
        GroupId=gid, SecurityGroupRuleIds=bad)
    audit(NAME, gid, "remediated",
          f"revoked {bad}, originally added by {caller}")
```

`SecurityGroupRuleIds`로 규칙을 지목해 취소하기 때문에 **다른 사람이 그 사이에 추가한 정당한 규칙을 건드리지 않습니다.** IP 범위와 포트를 다시 조립해 `revoke`를 호출하는 방식은 규칙 경계가 어긋나면 엉뚱한 규칙을 지웁니다.

### 실패 처리 — DLQ와 재시도

자동화는 **실패할 때 조용한 것이 가장 위험합니다.** "퍼블릭 버킷을 자동으로 막고 있다"고 믿는데 함수가 6주째 권한 오류로 실패하고 있으면, 통제가 있다고 착각한 채 아무 통제도 없는 상태입니다.

두 지점에 그물을 칩니다.

```bash
# ① EventBridge 대상 단계 — 함수 호출 자체가 실패한 이벤트를 SQS로
aws events put-targets \
  --rule shopmini-s3-public-guard \
  --targets '[{
    "Id": "lambda",
    "Arn": "arn:aws:lambda:ap-northeast-2:444455556666:function:sec-s3-public-block",
    "RetryPolicy": { "MaximumRetryAttempts": 2, "MaximumEventAgeInSeconds": 600 },
    "DeadLetterConfig": { "Arn": "arn:aws:sqs:ap-northeast-2:444455556666:secauto-dlq" }
  }]' \
  --region ap-northeast-2 --profile awssec-lab

# ② Lambda 단계 — 함수는 호출됐지만 예외로 끝난 건을 별도 큐로
aws lambda put-function-event-invoke-config \
  --function-name sec-s3-public-block \
  --maximum-retry-attempts 1 \
  --destination-config '{
    "OnFailure": { "Destination": "arn:aws:sqs:ap-northeast-2:444455556666:secauto-failed" }
  }' \
  --region ap-northeast-2 --profile awssec-lab
```

그리고 **두 큐에 반드시 알람을 겁니다.** `ApproximateNumberOfMessagesVisible >= 1` 이 5분 지속되면 P2입니다(30.2의 알람 만드는 법 그대로).

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name secauto-dlq-not-empty \
  --namespace AWS/SQS --metric-name ApproximateNumberOfMessagesVisible \
  --dimensions Name=QueueName,Value=secauto-dlq \
  --statistic Maximum --period 300 --evaluation-periods 1 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:444455556666:shopmini-secops-critical \
  --region ap-northeast-2 --profile awssec-lab
```

⚠️ **DLQ보다 더 자주 놓치는 것은 "함수가 아예 호출되지 않는 상태"** 입니다. 규칙을 실수로 비활성화했거나 eventName을 잘못 썼으면 실패조차 생기지 않습니다. **자동화가 살아 있음을 증명하는 카나리아**를 두십시오 — 원서가 "알람이 무시되지 않는지 확인하기 위해 알람을 발생시키는 정기 테스트를 실행하라"고 권고한 것과 같은 발상입니다. 주 1회 샌드박스 계정에서 일부러 위반 리소스를 만들고, 자동화가 N분 내 조치했는지를 별도 알람으로 검증합니다.

---

## 35.3 AWS Config 자동 교정(Remediation) 🧪

### EventBridge + Lambda와 무엇이 다른가

35.2가 **"이벤트가 발생했다"** 에 반응한다면, Config 교정은 **"상태가 규칙을 위반한다"** 에 반응합니다.

| 기준 | EventBridge + Lambda | Config 자동 교정 |
|---|---|---|
| 트리거 | API 호출 이벤트 | 규칙 평가 결과 `NON_COMPLIANT` |
| 지연 | 거의 실시간 | 구성 항목 기록 후 수 분(주기 규칙은 더 길다) |
| 이미 위반 중인 기존 리소스 | 잡지 못함(새 이벤트만) | **잡는다** — 최초 평가에서 전부 걸린다 |
| 실행 로직 | 직접 작성한 코드 | SSM Automation 문서(관리형 재사용) |
| 재시도·동시 실행 제어 | 직접 구현 | **선언으로 설정** |
| 조치 결과 추적 | CloudWatch Logs | Config 콘솔의 교정 실행 상태 |

**두 가지는 대체재가 아니라 보완재입니다.** EventBridge는 빠르지만 "지금 막 발생한 것"만 봅니다. Config는 느리지만 **"이미 그렇게 되어 있는 것"** 을 훑습니다. 신규 계정을 조직에 편입할 때 존재하는 수백 개의 기존 위반은 Config만 잡습니다.

> 📖 *AWS Security Cookbook* 8장 「Setting up and using AWS Config」는 Config를 "AWS 리소스의 구성을 기록하고 평가"하며 "보안 표준을 정의하는 규칙을 만들어 표준을 준수하지 않는 리소스를 찾아낼 수 있는" 서비스로 소개하고, **"Config는 문제가 탐지될 때마다 자동 교정(auto-remediation)도 지원한다"** 고 명시합니다. 또한 원서는 규칙을 **구성 변경 기반(변경 즉시 평가)과 주기 규칙(정기 평가)** 으로 구분합니다.

> 📖 같은 절의 경고: **"Config는 규칙에 대해 자동 교정 조치를 수행할 수 있다. 예를 들어 규칙에 따라 EC2 인스턴스의 구성을 변경할 수 있다. 그러나 AWS가 EC2 인스턴스를 중지했다가 다시 시작할 수 있으므로, 발생 가능한 다운타임을 고려해야 한다."**

원서가 자동 교정을 소개하면서 **바로 그 자리에서 다운타임을 경고한다**는 점에 주목하십시오. 교정 문서는 "구성을 바꾼다"고 적혀 있지만 실제 동작에는 **재시작이 포함될 수 있습니다.** 어떤 문서를 붙이든, 붙이기 전에 그 문서가 무슨 API를 호출하는지 읽어야 합니다.

### 교정 문서를 고르는 법 — 이름을 추측하지 마라

관리형 SSM Automation 문서는 계속 추가되고, 이름과 파라미터가 비슷비슷합니다. **문서명을 기억에 의존해 쓰면 배포 시점에 "문서를 찾을 수 없음"으로 실패하거나, 더 나쁘게는 이름이 비슷한 다른 문서를 붙이게 됩니다.** 반드시 조회해서 확인하십시오.

```bash
# ① 사용 가능한 교정용 Automation 문서 목록
aws ssm list-documents \
  --filters Key=Owner,Values=Amazon Key=DocumentType,Values=Automation \
  --query "DocumentIdentifiers[?starts_with(Name,'AWSConfigRemediation-')].Name" \
  --output text --region ap-northeast-2 --profile awssec-lab

# ② 붙이려는 문서가 요구하는 파라미터 확인 (이름·타입·필수 여부)
aws ssm describe-document --name AWS-DisableS3BucketPublicReadWrite \
  --query "Document.Parameters[].{Name:Name,Type:Type,Default:DefaultValue}" \
  --output table --region ap-northeast-2 --profile awssec-lab

# ③ 이 문서가 실제로 무슨 API를 호출하는지 본문을 읽는다 (다운타임 확인)
aws ssm get-document --name AWS-DisableS3BucketPublicReadWrite \
  --query Content --output text --region ap-northeast-2 --profile awssec-lab
```

③을 건너뛰지 마십시오. 원서의 다운타임 경고에 대응하는 유일한 방법이 **문서 본문을 읽는 것**입니다.

대표적인 규칙-문서 조합입니다. 실제 문서명·파라미터는 위 ②로 확인한 값을 쓰십시오.

| Config 관리형 규칙 | 교정 방향 | 등급 |
|---|---|---|
| `s3-bucket-public-read-prohibited` | 버킷의 퍼블릭 읽기 권한 제거 | B |
| `s3-bucket-public-write-prohibited` | 버킷의 퍼블릭 쓰기 권한 제거 | **A**(쓰기 공개는 정당한 사유가 거의 없다) |
| `s3-bucket-versioning-enabled` | 버킷 버전 관리 활성화 | **A**(파괴적이지 않음) |
| `s3-bucket-server-side-encryption-enabled` | 기본 암호화 설정 | **A** |
| `restricted-ssh` / `vpc-sg-open-only-to-authorized-ports` | 보안 그룹의 무제한 소스 규칙 제거 | B |
| `access-keys-rotated` | 오래된 키 비활성화 | **C**(배치 중단 위험 — 사람 승인) |
| `iam-user-mfa-enabled` | 자동 교정 없음 | D(사람이 사용자에게 요청) |

### 교정 구성 붙이기

```bash
cat > remediation-s3-public.json <<'JSON'
[
  {
    "ConfigRuleName": "s3-bucket-public-read-prohibited",
    "TargetType": "SSM_DOCUMENT",
    "TargetId": "AWS-DisableS3BucketPublicReadWrite",
    "TargetVersion": "1",
    "ResourceType": "AWS::S3::Bucket",
    "Automatic": true,
    "MaximumAutomaticAttempts": 3,
    "RetryAttemptSeconds": 120,
    "Parameters": {
      "AutomationAssumeRole": {
        "StaticValue": {
          "Values": ["arn:aws:iam::111122223333:role/ConfigRemediationRole"]
        }
      },
      "S3BucketName": {
        "ResourceValue": { "Value": "RESOURCE_ID" }
      }
    },
    "ExecutionControls": {
      "SsmControls": {
        "ConcurrentExecutionRatePercentage": 10,
        "ErrorPercentage": 10
      }
    }
  }
]
JSON

aws configservice put-remediation-configurations \
  --remediation-configurations file://remediation-s3-public.json \
  --region ap-northeast-2 --profile shopmini-prod
```

각 필드가 안전장치입니다.

| 필드 | 의미 | 권장 |
|---|---|---|
| `Automatic` | `true`면 비준수 판정 즉시 실행, `false`면 콘솔에서 사람이 실행 | **처음 4주는 `false`로 운영** |
| `MaximumAutomaticAttempts` | 자동 시도 횟수 상한 | 3 이하 — 계속 실패하는 교정을 무한히 재시도하지 않는다 |
| `RetryAttemptSeconds` | 재시도 간격 | 60~300 |
| `ExecutionControls.SsmControls.ConcurrentExecutionRatePercentage` | 동시에 교정할 리소스 비율 | **10 이하** — 사실상 Config 계층의 서킷 브레이커 |
| `ErrorPercentage` | 이 비율을 넘게 실패하면 전체 중단 | 10 |
| `ResourceValue.Value: "RESOURCE_ID"` | 비준수 리소스의 ID를 문서 파라미터로 전달 | 필수 |

**`ConcurrentExecutionRatePercentage`가 이 절에서 가장 중요한 한 줄입니다.** 기본값으로 두면 규칙을 켜는 순간 계정의 모든 비준수 리소스에 대해 교정이 동시에 터집니다. 300개 버킷의 정책이 1분 안에 바뀌고, 그중 12개가 정상 배포 경로였다면 12개 서비스가 동시에 멈춥니다. **10%로 두면 파도가 순차적으로 오고, 첫 파도에서 이상을 감지해 멈출 수 있습니다.**

### 자동 교정 역할의 범위 ⚠️

`AutomationAssumeRole`은 SSM이 맡는 역할입니다. 여기에 `AdministratorAccess`를 붙이는 사례가 흔한데, 이는 **Config 규칙 하나만 조작하면 관리자 권한으로 임의 문서를 실행할 수 있는 통로**를 여는 것과 같습니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "OnlyWhatTheDocumentNeeds",
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketPublicAccessBlock",
        "s3:PutBucketPublicAccessBlock",
        "s3:GetBucketAcl",
        "s3:PutBucketAcl",
        "s3:GetBucketPolicyStatus"
      ],
      "Resource": "arn:aws:s3:::shopmini-*"
    }
  ]
}
```

그리고 신뢰 정책에서 **호출자를 SSM으로, 계정을 자기 계정으로 한정**합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ssm.amazonaws.com" },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": { "aws:SourceAccount": "111122223333" },
        "ArnLike": {
          "aws:SourceArn": "arn:aws:ssm:ap-northeast-2:111122223333:automation-execution/*"
        }
      }
    }
  ]
}
```

`aws:SourceAccount`/`aws:SourceArn` 조건이 없으면 **혼동된 대리자(confused deputy)** 문제가 생깁니다 — 다른 계정이 자기 쪽 SSM Automation을 통해 여러분의 역할을 맡게 될 수 있습니다.

---

## 35.4 Security Hub 사용자 지정 작업

### 반자동이 완전 자동보다 강한 이유

31.5에서 사용자 지정 작업(custom action)을 만드는 데까지 갔습니다. 여기서 그 뒤를 잇습니다.

> 📖 *AWS Security Cookbook* 10장은 Security Hub의 설정 페이지 Custom actions 탭에서 **"선택한 인사이트와 결과를 Amazon CloudWatch Events로 보낼 수 있다"** 고 설명합니다.

한 문장이지만 구조적으로 중요합니다. **판단은 사람이, 실행은 기계가** 하는 분업이 여기서 완성되기 때문입니다.

| | 완전 자동 | 반자동(버튼) | 완전 수동 |
|---|---|---|---|
| 판단 | 기계(오탐 가능) | **사람** | 사람 |
| 실행 | 기계(정확·즉시) | **기계(정확·즉시)** | 사람(느림·실수) |
| 오탐 시 결과 | 장애 | 없음 | 없음 |
| 새벽 3시 대응 속도 | 초 | 분 | 수십 분 |
| 실행 일관성 | 완전 | 완전 | **낮음** |

**완전 수동의 진짜 문제는 느린 것이 아니라 일관성이 없다는 점입니다.** 새벽 3시에 격리를 손으로 하는 엔지니어는 순서를 틀리고(스냅샷 전에 종료 — 34.5), 리전을 착각하고, 태그를 빠뜨립니다. 반자동은 오탐 위험 없이 그 일관성을 확보합니다. **35.1의 C등급은 전부 이 패턴으로 구현하십시오.**

### 배선

```json
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Custom Action"],
  "resources": [
    "arn:aws:securityhub:ap-northeast-2:444455556666:action/custom/IsolateInstance"
  ]
}
```

이벤트의 `detail.findings`는 **분석가가 선택한 결과들의 배열**입니다. 한 건일 수도, 수십 건일 수도 있습니다.

```python
# handler_custom_action.py — 반자동 조치의 뼈대
import boto3
from guard import DRY_RUN, circuit_ok, audit

sh = boto3.client("securityhub")
ec2 = boto3.client("ec2")
NAME = "custom-isolate"
ISOLATION_SG = "sg-0isolationexample"     # 32.3에서 미리 만들어 둔 SG


def handler(event, context):
    findings = event["detail"].get("findings", [])
    if len(findings) > 25:                # ① 대량 선택 방지
        return audit(NAME, "-", "circuit-open",
                     f"{len(findings)} findings selected; refuse bulk action")

    for f in findings:
        fid, arn = f["Id"], f["ProductArn"]
        iid = next((r["Id"].split("/")[-1] for r in f.get("Resources", [])
                    if r["Type"] == "AwsEc2Instance"), None)
        if not iid:
            continue
        if not circuit_ok(NAME):
            return audit(NAME, iid, "circuit-open", "hourly limit exceeded")

        if DRY_RUN:
            audit(NAME, iid, "dry-run", f"would move {iid} to {ISOLATION_SG}")
            continue

        # 34.2 순서: 증거(스냅샷) → 격리. 종료는 하지 않는다.
        ec2.modify_instance_attribute(InstanceId=iid, Groups=[ISOLATION_SG])
        note = f"{iid} 를 격리 SG({ISOLATION_SG})로 전환함"
        audit(NAME, iid, "remediated", note)

        # ② 결과에 흔적을 남긴다 — 다음 사람이 중복 조치하지 않도록
        sh.batch_update_findings(
            FindingIdentifiers=[{"Id": fid, "ProductArn": arn}],
            Workflow={"Status": "NOTIFIED"},
            Note={"Text": f"[SecAuto] {note}", "UpdatedBy": "custom-isolate"},
        )
```

두 가지가 이 코드의 요점입니다.

**대량 선택 방지(①).** 분석가가 목록에서 `Ctrl+A`로 400건을 선택하고 버튼을 누르는 사고가 실제로 일어납니다. 반자동이라고 상한이 필요 없는 것이 아닙니다.

**결과 상태 갱신(②).** `batch_update_findings`로 워크플로 상태와 메모를 남기지 않으면, 30분 뒤 교대한 분석가가 같은 결과를 보고 같은 버튼을 다시 누릅니다. **조치의 흔적은 조치가 발생한 그 화면에 남아야 합니다.**

⚠️ **사용자 지정 작업 이벤트만으로는 "누가 눌렀는지"를 확정할 수 없습니다.** 이벤트 본문은 선택된 결과들을 담을 뿐 조작자의 신원을 보장하지 않으므로, **"누가"** 는 같은 시각의 CloudTrail에서 Security Hub API 호출 주체로 대조해야 합니다. 반자동의 감사성은 EventBridge가 아니라 **CloudTrail이 보장합니다.** 따라서 반자동 조치를 도입할 때는 보안 도구 계정의 CloudTrail이 켜져 있고 로그가 로그 아카이브 계정으로 흐르는지(29.4) 먼저 확인하십시오.

### 반자동으로 옮겨야 할 조치 목록

| 사용자 지정 작업 | 하는 일 | 왜 자동이 아닌가 |
|---|---|---|
| `IsolateInstance` | 격리 SG로 전환 | 정상 서비스 노드일 수 있다 |
| `SnapshotAndTag` | 스냅샷 + 조사 태그 | (A등급이라 자동이어도 되지만 버튼으로도 제공) |
| `RevokeSessions` | 역할 세션 폐기(33.3) | 워크로드 인증 전면 실패 위험 |
| `SuppressFinding` | 결과 억제 + 사유 기록 | 억제는 통제를 끄는 행위다 |
| `OpenIncidentTicket` | 사고 티켓 생성 + 담당 배정 | 심각도 판단이 필요 |

---

## 35.5 자동화의 위험 ⚠️

### 사고 시나리오 ① — 오탐이 서비스를 끈다

**금요일 18:40.** 마케팅팀이 신규 캠페인 정적 페이지를 위해 새 버킷을 만들고, CloudFront 배포가 준비되기 전 임시로 퍼블릭 읽기 정책을 붙입니다. 35.2의 자동화가 40초 만에 퍼블릭 액세스 차단 4종을 켭니다. 캠페인 페이지가 403을 반환합니다.

**19:10.** 마케팅팀이 다시 정책을 붙입니다. 자동화가 다시 막습니다. **19:30.** 담당자가 "S3가 이상하다"며 인프라팀에 연락합니다. 인프라팀은 배포 파이프라인을 뒤집니다. **21:00.** 누군가 CloudTrail에서 `sec-s3-public-block` 역할을 발견합니다.

**원인**은 자동화가 아니라 **자동화의 존재를 아무도 몰랐다는 것**입니다. 조치는 옳았습니다(버킷을 퍼블릭으로 두는 것은 실제로 위험합니다). 문제는 **조치가 조용했다**는 점입니다. 자동화의 SNS 알림이 보안팀 채널로만 갔고, 버킷 소유 팀에게는 아무것도 가지 않았습니다.

**올바른 구성**: 조치 알림은 **보안팀과 리소스 소유 팀 양쪽**으로 갑니다. 리소스의 `Owner` 태그를 읽어 해당 팀 채널로도 발송하고, 알림 본문에 **"이 조치를 되돌리는 방법"과 "예외를 신청하는 방법"** 을 반드시 넣습니다. 자동화 알림이 원인 규명 없이 끝나는 이유는 대부분 알림이 조치만 말하고 **되돌리는 법을 말하지 않기 때문**입니다.

### 사고 시나리오 ② — 무한 루프

**14:02.** 보안 그룹 자동 되돌리기가 배포됩니다. 누군가 위반 규칙을 추가하고, 자동화가 `RevokeSecurityGroupIngress`로 지웁니다. 여기까지는 정상입니다.

**문제는 다른 자동화와 겹칠 때입니다.** 예를 들어 "SG 변경이 감지되면 태그를 붙이는" A등급 자동화가 별도로 있고, 그 태그 부착(`CreateTags`)이 다시 SG 관련 규칙에 걸리도록 패턴이 넓게 잡혀 있으면, 두 함수가 서로를 호출합니다. 몇 분 만에 Lambda 동시 실행이 계정 한도를 채우고, **같은 계정의 다른 Lambda 워크로드가 스로틀링됩니다.** 보안 자동화가 애플리케이션 장애를 일으키는 전형적인 경로입니다.

**원인**은 세 가지가 겹친 것입니다 — ① 이벤트 패턴이 넓다, ② 자동화가 자기 자신의 변경을 인식하지 못한다(`is_self` 부재), ③ 상한이 없다.

**올바른 구성**:
- 모든 자동화 함수의 첫 줄은 **`is_self` 검사**입니다.
- 자동화 함수마다 **예약된 동시성(reserved concurrency)** 을 5~10으로 고정하십시오. 폭주해도 계정 전체를 삼키지 못합니다.

```bash
aws lambda put-function-concurrency \
  --function-name sec-sg-revoke --reserved-concurrent-executions 5 \
  --region ap-northeast-2 --profile awssec-lab
```
- 자동화 함수는 **전용 계정(보안 도구 계정)에 두고** 애플리케이션 Lambda와 동시성 풀을 공유하지 않게 합니다.

### 사고 시나리오 ③ — 공격자가 자동화를 무기로 쓴다

**02:15.** ShopMini 로그인 API에 특정 계정들을 향한 실패 요청이 쏟아집니다. "실패 5회 → 해당 IAM 사용자 비활성화" 자동화가 정확히 설계대로 동작합니다. **02:20.** 대응팀 세 명과 온콜 엔지니어 두 명의 계정이 모두 비활성화되어 있습니다. 브레이크 글래스(32.4)를 열 때까지 아무도 콘솔에 들어가지 못합니다. 그 사이 공격자는 다른 경로로 조용히 움직입니다.

**원인**은 **트리거를 공격자가 통제한다**는 것 하나입니다. 실패 로그인은 공격자가 원하는 횟수만큼, 원하는 계정 이름으로 만들 수 있습니다. 자동화는 "공격을 막는 장치"가 아니라 **"공격자가 호출할 수 있는 계정 잠금 API"** 였습니다. 원서가 경고한 그대로입니다 — 방어에 돈을 쓴 결과가 손쉬운 서비스 거부 공격 수단이 된 것입니다.

**올바른 구성**은 아래 표의 네 가지를 자동화 카탈로그에서 걷어 내는 것입니다.

| 위험한 자동화 | 공격자의 사용법 |
|---|---|
| 로그인 실패 N회 → IAM 사용자 비활성화 | 임원·대응팀 계정 이름만 알면 그들을 업무에서 배제 |
| 특정 IP에서 요청 → WAF/NACL 자동 차단 | 출발지 IP를 위조·경유해 파트너사·본사 대역을 차단시킴 |
| GuardDuty 결과 → 인스턴스 자동 종료 | 의도적으로 저심각도 결과를 유발해 오토스케일링 그룹을 갉아먹음 |
| 이상 트래픽 → 보안 그룹 전면 잠금 | 서비스 전체를 정지시키는 최단 경로 |

**판별 규칙**: 트리거가 **공격자가 반복해서 만들 수 있는 신호**라면 그 자동화는 최소 C등급으로 내려야 합니다. 특히 **차단 대상이 공격자가 지정할 수 있는 값**(출발지 IP, 사용자 이름)일 때는 자동 차단을 만들지 마십시오. 차단하려면 **차단 목록에 상한과 만료 시간(TTL)** 을 두고, 사내 대역·파트너 대역·대응팀 접근 경로를 **하드코딩된 허용 목록**으로 보호하십시오.

### 사고 시나리오 ④ — 크로스 계정 자동화 역할의 오용

중앙 보안 계정의 Lambda가 조직 전체 계정에 역할을 맡아 조치하는 구조는 편리하지만, **그 역할은 조직 전체를 바꿀 수 있는 단일 키**가 됩니다. 30.5의 경고("가짜 이벤트를 밀어 넣어 대응 자동화를 오작동시킬 수 있다")가 여기서 실제 피해로 이어집니다.

**올바른 구성 4가지**:
1. 멤버 계정의 자동화 역할 신뢰 정책은 **보안 계정의 특정 함수 역할 ARN만** 지정합니다(계정 전체 신뢰 금지).
2. `sts:ExternalId` 또는 `aws:PrincipalArn` 조건으로 한 번 더 좁힙니다.
3. 역할 권한은 **자동화가 실제 호출하는 액션 목록 그대로**만 부여합니다(35.2의 "쓰기 액션 하나" 원칙).
4. 멤버 계정 SCP로 **자동화 역할이 IAM·Organizations·CloudTrail·SCP를 건드리지 못하게** 막습니다. 자동화 역할은 자기 자신을 강화할 수 없어야 합니다.

### 🔴 안전장치 5종

| 안전장치 | 구현 | 없으면 |
|---|---|---|
| **① 드라이런 우선** | `DRY_RUN=true` 기본값. **최소 4주** 관찰 후 전환 | 첫날 대량 오조치 |
| **② 예외 태그** | `SecurityAutomation=exclude` 를 모든 함수가 검사 | 정당한 예외를 막을 방법이 없어 자동화를 통째로 끄게 됨 |
| **③ 서킷 브레이커** | 시간당 조치 상한 + Config `ConcurrentExecutionRatePercentage` | 폭주가 전면 장애로 |
| **④ 변경 알림 필수** | 보안팀 + **리소스 소유 팀** 양쪽, 롤백 방법 포함 | 시나리오 ①(원인 규명에 2시간) |
| **⑤ 자동화의 감사 로그** | `audit()` 로 조치·미조치·사유를 모두 기록, 별도 로그 그룹 | "그때 왜 안 돌았나"에 답할 수 없음 |

**①의 "4주"는 임의의 숫자가 아닙니다.** 드라이런 기간에 세어야 할 것은 **조치 건수**가 아니라 **조치 대상 중 오탐 비율**입니다. 드라이런 로그의 `would ...` 항목을 매주 리뷰해 "이건 막았으면 장애였다"가 **0건인 주가 연속 2회** 나온 뒤에 전환하십시오. 원서가 말한 오탐 피드백 루프를 자동화에 적용한 것입니다.

> 📖 *Practical Cloud Security* 2판 7장: **"각 유형의 오탐마다 그런 유형의 이벤트를 필터링할지, 임계치를 올릴지, 오탐을 줄이기 위한 다른 조치를 취할지 판단하는 피드백 루프가 필요하다."**

### 28.4와의 충돌 조율 — 자동화도 드리프트를 만든다

28.4에서 우리는 **"파이프라인 밖의 수동 변경은 금지"** 라고 못 박았습니다. 그런데 35장의 자동화는 정확히 그 금지된 일을 합니다 — **IaC를 거치지 않고 실제 리소스를 바꿉니다.**

이 모순을 방치하면 두 가지가 동시에 무너집니다. 자동화가 막은 버킷은 다음 CloudFormation 배포에서 **원래의 퍼블릭 상태로 되돌아가고**, 28.4의 드리프트 리포트에는 **자동화가 만든 변경이 "무단 변경"으로 잔뜩 쌓입니다.**

**조율 규칙 4개**입니다.

| 규칙 | 내용 |
|---|---|
| **자동화는 응급처치지 치료가 아니다** | 자동 조치는 **위험 노출 시간을 줄이는 것**이 목적입니다. 근본 수정은 반드시 코드에서 이뤄집니다 |
| **조치와 동시에 티켓을 만든다** | `audit()` 의 알림에 "이 변경을 IaC에 반영하라"는 작업 항목을 포함시킵니다. 티켓이 닫히기 전까지 그 리소스는 드리프트 상태입니다 |
| **자동화 변경은 드리프트 리포트에서 식별 가능해야 한다** | 조치와 함께 `RemediatedBy=sec-automation`, `RemediatedAt=<ISO8601>` 태그를 붙입니다. 28.4의 CloudTrail 쿼리에서 자동화 역할 ARN을 **승인된 경로로 제외 목록에 추가**합니다 |
| **반복되는 자동 조치는 IaC 결함 신호다** | 같은 리소스에 같은 조치가 **3회 이상** 반복되면 자동화를 멈추고 코드를 고칩니다. 자동화가 매번 되돌리는 상태는 **누군가의 배포가 매번 만들어 내고 있는 것**입니다 |

마지막 항목이 이 절의 결론입니다. **자동화 조치 건수는 성과 지표가 아니라 부채 지표입니다.** 잘 돌아가는 조직에서는 이 숫자가 시간이 갈수록 **줄어듭니다** — 예방 통제(28.3의 배포 게이트, SCP)가 앞단에서 막기 때문입니다. 숫자가 줄지 않으면 자동화가 예방 통제의 부재를 가리고 있는 것입니다.

---

## 이 장의 요약

| 항목 | 핵심 |
|---|---|
| **원서의 경고** | 자동 대응은 장애를 만들 수 있고, **공격자가 의도적으로 이용할 수 있다.** 운영 위험과 보안 위험을 저울질하라 |
| **판단 3축** | 오탐률 × 되돌릴 수 있음 × 서비스 영향 → A(완전 자동)·B(자동+알림)·C(반자동)·D(수동) |
| **원칙** | **만들기는 자동화하고 지우기는 자동화하지 않는다** |
| **EventBridge + Lambda** | 실시간이지만 "지금 발생한 것"만. 순서: 멱등성 → 예외 → 상한 → 드라이런 → 조치 |
| **Config 자동 교정** | 느리지만 **이미 위반 중인 기존 리소스를 잡는다.** `ConcurrentExecutionRatePercentage`가 안전장치 |
| **SSM 문서** | 이름을 추측하지 말고 `list-documents`/`describe-document`/`get-document`로 확인 |
| **반자동** | 판단은 사람, 실행은 기계. C등급 조치의 표준 구현 |
| **자동화 역할** | 쓰기 액션은 최소 개수로. **탈취돼도 손해가 없어야 한다** |
| **안전장치 5종** | 드라이런 · 예외 태그 · 서킷 브레이커 · 변경 알림 · 감사 로그 |
| **28.4와의 관계** | 자동 조치는 응급처치. 근본 수정은 코드에서. **조치 건수는 부채 지표** |

## 🔴 필수 구성 체크리스트

- [ ] 모든 자동화가 **카탈로그에 등재**되어 있고 등급(A~D)·트리거·롤백 절차·승인자가 기록되어 있다
- [ ] 자동화의 트리거를 **외부 공격자가 반복 생성할 수 있는지** 항목마다 판정했다
- [ ] 인스턴스 종료·IAM 삭제·RDS 정지·SCP 변경은 **어떤 자동화에도 들어 있지 않다**
- [ ] 모든 자동화 함수가 `DRY_RUN` 환경 변수를 읽고 **기본값이 `true`** 다
- [ ] 모든 자동화 함수가 예외 태그 `SecurityAutomation=exclude` 를 검사한다
- [ ] 모든 자동화 함수가 **시간당 조치 상한**(서킷 브레이커)을 통과해야 조치한다
- [ ] 모든 자동화 함수가 **자기 자신이 만든 변경을 무시**한다(`is_self`)
- [ ] 자동화 역할의 **쓰기 권한이 필요한 액션으로만** 한정되고 리소스가 좁혀져 있다
- [ ] 자동화 역할이 IAM·Organizations·CloudTrail·SCP를 변경할 수 없다(SCP로 봉인)
- [ ] EventBridge 대상에 **DLQ와 재시도 정책**이 설정되어 있다
- [ ] Lambda에 **OnFailure 대상**과 **예약된 동시성**이 설정되어 있다
- [ ] DLQ에 메시지가 쌓이면 알람이 울린다
- [ ] 주기적 **카나리아 테스트**로 자동화가 살아 있음을 증명한다
- [ ] Config 교정에 `MaximumAutomaticAttempts`와 `ConcurrentExecutionRatePercentage`(10 이하)가 설정되어 있다
- [ ] 교정용 `AutomationAssumeRole`에 `AdministratorAccess`가 붙어 있지 않고, 신뢰 정책에 `aws:SourceAccount` 조건이 있다
- [ ] 조치 알림이 **보안팀과 리소스 소유 팀 양쪽**으로 가고 **롤백 방법**이 본문에 있다
- [ ] 자동화의 결정 로그(조치·미조치·사유)가 별도 로그 그룹에 남고 보존 기간이 정해져 있다
- [ ] 자동 조치가 붙인 태그(`RemediatedBy` 등)로 28.4의 드리프트 리포트에서 자동화 변경을 구분할 수 있다

## ⚠️ 자주 하는 실수

| 실수 | 결과 | 올바른 구성 |
|---|---|---|
| 첫날부터 `DRY_RUN=false`로 배포 | 오탐 대량 조치로 서비스 장애. 자동화 자체가 폐기됨 | 기본값 `true`, 4주 관찰 후 오탐 0건 2주 연속일 때 전환 |
| 자동화 역할에 `s3:*`·`ec2:*`·`AdministratorAccess` 부여 | 자동화 역할이 조직 최고 권한이 되어 최우선 공격 표적 | 쓰기는 필요한 액션 1~3개, 리소스는 접두사로 한정 |
| `is_self` 검사 없음 | 자동화가 만든 변경이 다시 트리거 → 무한 루프 → Lambda 동시성 고갈 → 앱 장애 | 함수 첫 줄에서 호출자 ARN이 자동화 역할인지 확인 후 즉시 반환 |
| 상한 없이 배포 | 규칙 하나가 계정 전체 리소스를 동시에 조치 | 시간당 상한 + 예약된 동시성 + Config는 동시 실행 비율 10% |
| SSM 문서명을 기억으로 작성 | 배포 실패, 또는 이름이 비슷한 다른 문서가 붙어 예상 밖 조치 | `list-documents`/`describe-document`로 확인하고 `get-document`로 본문까지 읽는다 |
| 조치 알림을 보안팀에만 발송 | 소유 팀이 원인을 못 찾아 장애 시간이 길어짐 | `Owner` 태그 기반으로 소유 팀에도 발송, 롤백·예외 신청 방법 포함 |
| 로그인 실패·출발지 IP 기반 자동 차단 | 공격자가 임의로 계정·대역을 차단시켜 DoS | 외부가 통제하는 트리거는 C등급 이하. 차단 목록에 TTL과 허용 목록 필수 |
| 액세스 키를 비활성화하지 않고 삭제 | 되돌릴 수 없고 포렌식 증거 소멸 | `Status=Inactive`. 삭제는 조사 종료 후 사람이 |
| 역할 세션 결과에 키 비활성화 시도 | 무효화되지 않은 채 "조치 완료"로 기록 | `userType`으로 분기, 임시 자격 증명은 33.3 절차로 에스컬레이션 |
| 자동 조치를 IaC에 반영하지 않음 | 다음 배포에서 위반 상태로 원복. 드리프트 리포트가 소음으로 가득 | 조치와 함께 티켓 생성, 반복 3회면 자동화를 멈추고 코드를 고친다 |
| 자동화 조치 건수를 성과로 보고 | 예방 통제 부재를 자동화가 가림 | 부채 지표로 취급. 감소 추세를 목표로 |

## 다음 장 예고

6부가 끝났습니다. 로그를 모으고(29장), 감시하고(30장), 위협을 탐지하고(31장), 대응을 준비하고 실행하고 복구하고(32~34장), 그중 안전한 부분을 기계에 맡기는 것(35장)까지 왔습니다.

그런데 이 모든 이야기는 지금까지 **"계정이 여러 개 있다"** 는 것을 전제로 진행됐습니다. 로그 아카이브 계정, 보안 도구 계정, 운영 계정, 포렌식 계정 — 그 구조 자체는 아직 제대로 다루지 않았습니다.

7부 **멀티 계정 거버넌스와 규모화**가 시작됩니다. 36장은 **멀티 계정 아키텍처** — 계정을 무엇을 기준으로 나눌 것인가, OU를 어떻게 설계해야 SCP가 단순해지는가, 그리고 계정이 200개가 됐을 때 이 책의 모든 통제를 어떻게 **한 번에** 적용할 것인가입니다.
