// Rebuild conversion manifest from the archived, unedited Markdown sources.
const fs = require('fs');
const path = require('path');
const docs = require('./original-documents.json');
const blocks = require('./blocks.json');
const diagrams = [];
const q = s => '"' + s.replace(/"/g, '&quot;') + '"';
const chain = (labels, direction='TB') => `flowchart ${direction}\n` + labels.map((s,i)=>`N${i}[${q(s)}]`).join(' --> ');
const custom = new Map();
function block(prefix, index, body) { const doc=docs.find(d=>d.file.replaceAll('\\','/').startsWith(prefix)); if(!doc)throw Error(prefix); custom.set(doc.file+':'+index,body); }
block('01_기초/01_',1,`flowchart TB
subgraph REGION["AWS Region"]
 subgraph CP["AWS 운영 · EKS Control Plane"]
  API["API Server: 관리 요청"]
  ET["etcd: 객체 저장"]
  CT["Controllers / Scheduler: 조정·배치"]
 end
 subgraph VPC["내 AWS 계정의 VPC"]
  subgraph AZA["AZ A · subnet"]
   subgraph NA["EC2 Node A"]
    KA["kubelet"] ---|CRI 통신| CA["containerd"]
    P1["Pod 1 · 주문 API"]
    P2["Pod 2 · 다른 앱"]
   end
  end
  subgraph AZB["AZ B · subnet"]
   subgraph NB["EC2 Node B"]
    P3["Pod 3 · 주문 API"]
   end
  end
  NET["ALB · 보안 그룹 · 라우팅 · 연결 스토리지"]
 end
 EXT["별도 AWS 서비스 · ECR 이미지 저장소 / RDS 관리형 DB"]
end`);
block('01_기초/02_',1,`flowchart TB
subgraph A["EC2 Node A"]
 AH["기존 머신 한 대"] -->|실행 기반·프로그램| AS["Linux 커널<br/>kubelet / containerd"]
 AH -->|현재 배치| AP["Pod 1 · 주문 앱<br/>Pod 2 · 주문 앱"]
end
subgraph B["EC2 Node B"]
 BH["기존 머신 한 대"] -->|실행 기반·프로그램| BS["Linux 커널<br/>kubelet / containerd"]
 BH -->|현재 배치| BP["Pod 3 · 주문 앱"]
 BH -.->|남은 용량에 추가 가능| NEW["추가 후 · Pod 4 · 주문 앱"]
end
NEW -.->|이 경우 전체 수량| COUNT["전: EC2 2대 · Node 2개 · Pod 3개<br/>후: EC2 2대 · Node 2개 · Pod 4개<br/>머신 수는 그대로, Pod만 1개 증가"]`);
block('01_기초/02_',2,chain(['Deployment · 이미지 A / replicas 3','Deployment controller · ReplicaSet 조정','ReplicaSet controller · Pod 객체 수 유지','Scheduler · 조건에 맞는 기존 Node 선택','해당 노드 kubelet / runtime · 실행·상태 보고']));
block('01_기초/03_',2,`flowchart TB
I["선택적 image index · OS / CPU별 manifest 참조"] --> M["image manifest"]
M -->|참조| C["config · 시작 명령 / 환경 변수 / 작업 디렉터리"]
M -->|참조| L["layers · 파일시스템 변경분"]`);
block('01_기초/03_',3,`flowchart TB
SRC["앱 소스 + Dockerfile"] --> BUILD["BuildKit 빌드"] --> I["호환 이미지 산출물"] --> REG["레지스트리"]
subgraph LOCAL["개발 머신 · Docker 실행"]
 DC["Docker CLI"] -->|Docker API| DD["dockerd"] --> CDT["containerd"] --> S["shim / runc"] --> A["앱 프로세스"] -->|시스템 호출| K["Linux 커널"]
end
subgraph EKS["EKS 노드 · Kubernetes 실행"]
 KL["kubelet"] -->|CRI| CRT["containerd · CRI 기능 / 이미지·실행 관리"] --> S2["shim / runc"] --> A2["앱 프로세스"] -->|시스템 호출| K2["Linux 커널"]
end
REG -->|이미지 사용| CDT
REG -->|이미지 사용| CRT`);
block('01_기초/03_',4,`flowchart TB
subgraph NODE["같은 노드에서 실행되는 프로세스 · 부모·자식 트리 아님"]
 K["kubelet"]
 C["containerd"]
 S["shim 등"]
 A["orders 앱 · namespace / cgroup / 권한"]
 B["inventory 앱 · 별도 namespace / cgroup / 권한"]
end
K & C & S & A & B -->|실행 기반| L["공유하는 노드 Linux 커널"]`);
block('01_기초/03_',5,chain(['kubelet','내장 dockershim · 과거 연결','Docker Engine','containerd','저수준 runtime']));
block('01_기초/03_',6,`flowchart LR
K["kubelet"] -->|CRI| C["containerd의 CRI 기능"] --> R["저수준 runtime"]`);
block('01_기초/04_',1,`flowchart TB
H["HCL 구성 + 기존 state"] -->|provider로 실제 자원 조회| P["변경 계획 · 추가 / 수정 / 교체 / 삭제"]
P -->|apply| A["의존 관계에 맞춰 외부 API 호출"] --> S["관찰한 결과를 state에 반영"]`);
block('01_기초/04_',3,`flowchart TB
subgraph BUILD["빌드 측"]
 D["Docker 도구"] --> I["OCI / Docker 호환 이미지"] --> E["ECR"]
end
subgraph RUN["실행 측"]
 K["kubelet"] -->|CRI API| C["containerd"] --> R["OCI runtime · 예: runc"] --> P["앱 프로세스"]
end`);
block('01_기초/04_',4,`sequenceDiagram
participant A as 주문 앱
participant D as CoreDNS
participant N as 노드 Service 전달 규칙
participant P as inventory Pod
A->>D: inventory.shop.svc.cluster.local 조회
D-->>A: 일반 Service의 ClusterIP
A->>N: ClusterIP:port로 접속
N->>P: 선택된 Pod IP:targetPort로 전달`);
block('01_기초/04_',5,`flowchart TB
subgraph BEFORE["교체 전"]
 S1["Service IP:80"] --> A["Pod A의 IP:8080"]
end
subgraph AFTER["대상 목록·전달 규칙 갱신 후"]
 S2["같은 Service IP:80"] --> B["새 Pod B의 IP:8080"]
end`);
block('01_기초/05_',1,`flowchart TB
V["VPC"] --> S["subnet"] --> NET["EKS 연결 네트워크"]
I["IAM role"] --> PERM["EKS / Node Group / controller 권한"]
E["EKS + subnet + IAM"] --> NG["Node Group"] --> N["실제 EC2 노드"]
R["ECR repository"] --> ADDR["이미지 저장 주소"]`);
block('01_기초/05_',2,chain(['소스 변경','테스트','이미지 빌드','ECR push','image digest 기록'],'LR'));
block('01_기초/05_',5,`sequenceDiagram
participant U as 사용자
participant D as DNS
participant L as ALB:443
participant P as orders Pod IP:8080
participant DB as DB
U->>D: orders.example.com 조회
D-->>U: ALB 접속 주소
U->>L: 인터넷으로 HTTPS 요청
L->>P: 선택된 주문 API로 전달
P->>DB: 업무 데이터 처리
DB-->>P: 결과
P-->>L: 주문 API 응답
L-->>U: 응답`);
block('01_기초/05_',6,chain(['원하는 버전 B 기록','새 ReplicaSet / Pod 생성','이미지 B 실행','readiness 통과 · 트래픽 대상 반영','교체 전략에 따라 기존 A Pod 정리']));
block('01_기초/06_',2,`flowchart TB
ROOT["orders 프로젝트"] --> SRC["src/ · 앱 소스"]
ROOT --> TEST["tests/ · 앱 테스트"]
ROOT --> DOCKER["Dockerfile · 빌드 방법<br/>.dockerignore · 빌드 제외 파일"]
ROOT --> CI[".github/workflows/ · CI/CD 순서·조건 예"]
ROOT --> DEP["deploy/"]
DEP --> D["deployment.yaml · 이미지 / 수량 / 자원 / probe / 설정"]
DEP --> S["service.yaml · Pod 선택 / 포트 연결"]
DEP --> I["ingress.yaml · 도메인 / 경로 / Service 연결"]
ROOT --> TF["infra/ · Terraform 구성<br/>별도 저장소로 분리 가능"]`);
block('01_기초/06_',6,chain(['주문 코드 수정','abc123 커밋 · push / 검토·merge','CI · abc123 checkout','테스트 성공 → Docker 빌드','ECR에 이미지 B push · digest 기록','CD · Deployment.image를 B 참조로 설정','EKS Kubernetes API에 적용','Deployment controller · 새 ReplicaSet 조정','ReplicaSet controller · 새 Pod 생성','Scheduler · 노드 결정','kubelet / runtime · 이미지 B 확보·실행','readiness · ALB target 준비','교체 전략에 따라 이전 Pod 정리','실제 사용자 요청으로 새 버전 확인']));
block('01_기초/07_',1,`flowchart TB
subgraph BEFORE["변경 전 · Node 2개 / Pod 3개"]
 A["Node A · Pod 1 / Pod 2 / 빈 자리"]
 B["Node B · Pod 3 / 빈 자리 / 빈 자리"]
end
R["replicas 3 → 5"] --> C["controller · Pod 객체 2개 생성"] --> S["scheduler · 기존 노드 선택"] --> K["kubelet / runtime · 같은 이미지 실행"]
subgraph AFTER["변경 후 · EC2 2대 / Node 2개 그대로"]
 A2["Node A · Pod 1 / Pod 2 / Pod 4"]
 B2["Node B · Pod 3 / Pod 5 / 빈 자리"]
end
K --> A2
K --> B2`);
block('01_기초/07_',2,`flowchart TB
subgraph SETUP["미리 준비할 정책"]
 T["Terraform · Node Group / IAM / min 2 · max 5"]
 INSTALL["설치 도구 · CA 설치 / 그룹 발견 / AWS 접근"]
 APP["배포 도구 · Deployment / 선택적 HPA"]
end
subgraph LIVE["운영 중 자동 조정"]
 H["HPA 또는 배포자 · replicas 증가"] --> C["controller · Pod 생성"] --> P["기존 Node에 배치 불가능"] --> CA["CA · 적합한 그룹 목표 수 조정"] --> EC2["AWS · EC2 생성"] --> N["노드 등록·준비"] --> S["scheduler · Pod 배치"]
end`);
block('01_기초/10_',1,`flowchart TB
subgraph NODE["Node · 머신"]
 K["kubelet · Pod 실행 요청 / 상태 보고"] -->|CRI API 약속| C["containerd · 이미지 / 컨테이너 수명 관리"]
 S["shim / runc 등 · 저수준 실행·프로세스 관리"]
 A["앱 프로세스 · 실제 주문 요청 처리"]
end`);
block('01_기초/10_',2,`flowchart TB
subgraph MGMT["관리 요청 · orders 앱을 3개 실행하도록 설정"]
 O["운영자 / 배포 도구"] --> URL["https://&lt;cluster-api-endpoint&gt;/apis/apps/v1/..."] --> K["Kubernetes API Server"]
end
subgraph DATA["업무 요청 · 내 주문을 접수"]
 U["일반 사용자 / 브라우저"] --> APPURL["https://orders.example.com/orders"] --> LB["ALB"] --> APP["주문 API 프로세스"]
end`);
block('01_기초/10_',3,`flowchart TB
subgraph CONTROL["설정 갱신"]
 P["Pod 변화"] -.-> INFO["대상 정보 변화"] -.-> C["AWS Load Balancer Controller"] -.-> T["target group 갱신"]
end
subgraph DATA["실제 요청"]
 U["사용자"] --> D["같은 앱 도메인"] --> A["ALB"] --> DEST["현재 사용 가능한 Pod IP:8080"]
end`);
block('03_최종_이해도_문제집/03_',1,chain(['Git push','CI checkout / test','Docker build','ECR push','Deployment image → 새 digest · Kubernetes API 적용','controller · ReplicaSet / Pod 생성','scheduler · Node 선택','kubelet → CRI → containerd','image pull · 프로세스 실행','readiness 성공','Service endpoint 편입']));

function register(d, title, source, original, kind, key) {
 const file=d.file.replaceAll('\\','/');
 const prefix=file==='README.md'?'00-readme':file.split('/')[0].slice(0,2)+'-'+path.basename(file).slice(0,2);
 const id=prefix+'-'+key;
 const item={id,file,title,source:source.replaceAll('\r',''),original,kind};diagrams.push(item);return item;
}
for (const d of docs) {
 for (const b of blocks.filter(x=>x.file===d.file)) {
  const source = b.lang==='mermaid'?b.body:custom.get(d.file+':'+b.index);
  if(source)register(d,b.heading,source,'```'+b.lang+'\n'+b.body.replaceAll('\r','')+'```',b.lang==='mermaid'?'기존 Mermaid':'텍스트 도식','block-'+b.index);
 }
}
function paragraph(prefix, start, title, source) {
 const d=docs.find(d=>d.file.replaceAll('\\','/').startsWith(prefix));
 const original=d.text.replaceAll('\r','').split(/\n\s*\n/).find(p=>p.startsWith(start));
 if(!original)throw Error('Missing paragraph '+prefix+' '+start);
 register(d,title,source,original,'본문 시각화','concept-'+(diagrams.filter(i=>i.file===d.file.replaceAll('\\','/')).length+1));
}
paragraph('01_기초/10_','1. 새 Pod C에','Service 대상 주소가 갱신되는 순서',chain(['새 Pod C · app: orders label','EndpointSlice controller · selector와 Pod 상태 관찰','EndpointSlice · 주소 / 포트 / 준비 상태 갱신','kube-proxy 또는 대체 구현 · 전달 규칙 갱신','이후 새 연결 · 준비된 Pod로 전달']));
paragraph('02_심화/01_','원하는 수가 2인데','원하는 상태에 가까워지는 제어 루프',`flowchart TB
W["원하는 Pod 2개"] --> C["ReplicaSet controller · 차이 확인"]
O["관찰한 관리 대상 Pod 1개"] --> C
C --> A["부족한 Pod 생성 시도"] --> R["실제 상태 다시 관찰"] --> C
A --> F["중간 실패 가능 · 다음 관찰에서 재시도"] --> R`);
paragraph('02_심화/02_','삭제에서는 ownerReferences','객체 삭제와 정리 대기',`flowchart TB
D["객체 삭제 요청"] --> O["ownerReferences와 전파 정책<br/>종속 객체 처리에 영향"]
D --> F{"finalizer 정리 작업이 남았는가?"}
F -->|예| T["Terminating · 외부 정리 등 대기"] --> C["담당 controller가 정리 완료"] --> END["삭제 완료"]
F -->|아니오| END`);
paragraph('02_심화/05_','기본 scheduler는','Scheduler의 배치 판단',chain(['노드 미배정 Pod 확인','Filter · 조건에 맞지 않는 후보 제외','Score · 후보의 적합도 비교','선택한 Node를 API에 기록','해당 kubelet이 실행 준비']));
paragraph('02_심화/05_','Pod 삭제 시 API에','Pod의 정상 종료 흐름',chain(['API · Pod 삭제 의도 기록','kubelet · graceful termination','설정된 preStop hook / 종료 신호 처리','유예 시간 내 종료 대기','시간 초과 시 강제 종료 가능<br/>preStop도 같은 유예 시간에 포함']));
paragraph('02_심화/06_','1. 앱이 Pod 안에서','내부에서 외부로 통신 장애 좁히기',chain(['앱 · 실제 listen 주소와 포트<br/>127.0.0.1만 듣는지 확인','Pod Ready / Service selector<br/>EndpointSlice 대상과 포트','호출 Pod의 DNS 해석<br/>DNS 서버 연결 허용','Service IP / Pod IP로 비교<br/>실패 경계 찾기','외부 LB listener / health / target<br/>Security Group 확인']));
paragraph('02_심화/07_','같은 방향의 여러 적용 정책은','NetworkPolicy · 합집합과 AND / OR',`flowchart TB
P1["같은 방향의 적용 정책 A · 허용 집합"] --> U["정책 A ∪ 정책 B · 허용 합집합"]
P2["같은 방향의 적용 정책 B · 허용 집합"] --> U
subgraph AND["같은 from 항목"]
 N1["namespaceSelector AND podSelector<br/>두 조건을 함께 만족"]
end
subgraph OR["서로 다른 from 항목"]
 N2["namespaceSelector OR podSelector<br/>둘 중 하나를 만족"]
end`);
paragraph('02_심화/08_','EBS 볼륨은 AZ에','EBS 위치와 Pod 배치를 함께 결정',`flowchart TB
subgraph AZA["AZ A"]
 D["EBS 볼륨"] --- P["같은 AZ의 노드에서 사용할 Pod"]
end
subgraph AZB["AZ B"]
 N["다른 AZ의 Node · AZ A EBS를 그대로 연결할 수 없음"]
end
W["WaitForFirstConsumer"] --> C["소비 Pod 배치 요구 확인"] --> L["저장소 위치·바인딩 결정"]
WAIT["소비 Pod가 없으면 PVC Pending이 정상 대기일 수 있음"] -.-> W`);
paragraph('02_심화/08_','복구 계획은 세 가지를','서비스 복구에 필요한 세 가지',`flowchart TB
G["Git 등의 선언과 설정"] --> R["새 환경에서 서비스 복구"]
D["실제 데이터 백업"] --> R
P["복원 실행 절차 · 연결 설정과 권한"] --> R
E["etcd 백업 ≠ 앱 DB 백업<br/>디스크 백업만으로 서비스 복구가 끝나지 않음"] -.-> R`);
paragraph('02_심화/09_','**동작:** kubelet이 Pod 준비','ConfigMap 변경은 언제 앱에 보이는가?',`flowchart TB
C["ConfigMap 값 변경"] --> ENV["환경 변수 · 기존 프로세스 값은 그대로"]
C --> VOL["일반 volume 파일 · 지연 갱신 가능"] --> READ["앱이 다시 읽어야 반영"]
C --> SUB["subPath 마운트 · 자동 갱신 예외"]
START["Pod 준비 시 kubelet이 참조 값을 주입"] -.-> ENV`);
paragraph('02_심화/10_','기본적인 모델에서 정책으로','통신 허용은 출발·도착 양쪽에서 판단',`flowchart LR
S["출발 Pod"] --> E{"egress 허용?"} -->|예| I{"도착 Pod ingress 허용?"} -->|예| D["연결 허용 조건 충족"]
E -->|아니오| X["차단"]
I -->|아니오| X
N["정책으로 격리되지 않은 방향은 기본 허용<br/>격리된 방향은 적용 정책의 허용 합집합"] -.-> E
N -.-> I`);
paragraph('02_심화/12_','예를 들어 kubelet은','Lease · heartbeat를 읽는 주체',`flowchart TB
K["kubelet"] -->|주기적 갱신| L["kube-node-lease의 노드 Lease"] -->|건강 판단 신호로 관찰| C["제어부"]
P["리더 선출 참여 프로그램"] -->|갱신·만료 해석| R["리더 역할 조정"]
N["Lease 자체가 프로세스를 종료하거나<br/>업무 중복을 완벽히 방지하지 않음"] -.-> R`);
paragraph('02_심화/12_','**동작:** API Server가 조건에','Mutating webhook 요청과 실패',`sequenceDiagram
participant A as API Server
participant W as Webhook 서버
Note over A: rules와 selector에 맞는 admission 요청
A->>W: 검토 요청
W-->>A: 값 변경 patch 등 응답
Note over A: 응답 반영
Note over A,W: 서버 무응답 + failurePolicy Fail이면 새 생성 요청 등이 막힐 수 있음`);
paragraph('02_심화/13_','설명을 단순화하면','HPA 목표 수 · 단순화한 계산',chain(['현재 복제본 2개','평균 CPU utilization 90%<br/>기준은 request 대비','목표 utilization 60%','ceil(2 × 90 ÷ 60) = 3','원하는 복제본 3개<br/>실제 계산은 준비 상태·정책 등을 추가 반영']));
paragraph('02_심화/13_','Pod 세 개가 모두 한 노드에','복제본 수와 장애 범위',`flowchart TB
subgraph SINGLE["한 Node에 집중"]
 A["Node A · Pod 1 / Pod 2 / Pod 3<br/>노드 장애가 세 Pod에 함께 영향"]
end
subgraph ONEAZ["Node가 달라도 같은 AZ"]
 B["Node A / B / C · Pod 분산<br/>AZ 장애는 함께 영향"]
end
T["topology spread / anti-affinity로 분산 의도 표현"] --> CHECK["실제 배치 결과 확인"]`);
paragraph('02_심화/14_','**동작:** HPA controller가','HPA가 바꾸는 것은 원하는 복제본 수',chain(['메트릭 제공 체계','HPA controller · 지표 읽기','대상 scale subresource · 원하는 복제본 기록','Deployment / ReplicaSet controller · Pod 수 조정','노드 실행은 별도 단계<br/>HPA가 직접 노드를 만들지 않음']));
paragraph('02_심화/14_','**ResourceQuota와 비교:**','개별 요청과 Namespace 총량의 경계',`flowchart TB
L["LimitRange · 컨테이너 하나의 기본값·허용 범위"] --> P["개별 requests / limits"] --> SUM["Namespace 전체 요청량 합계"]
Q["ResourceQuota · Namespace 총량 예산"] --> SUM
SUM --> R["개별 규칙이 맞아도 총량 quota 소진 가능"]`);
paragraph('02_심화/16_','일반 EBS CSI 구성에서','EBS 생성과 mount의 서로 다른 실패 지점',`flowchart TB
C["CSI controller 측 driver / sidecar"] -->|AWS API 조정| D["volume 생성·연결 요청"] --> B["PVC Bound · 연결 결정"] --> N["CSI node plugin · 노드 mount"]
P["PVC Pending"] -.-> F["StorageClass / 프로비저닝 IAM / AZ 선택"]
B -.-> M["Bound 뒤에도 mount 실패 가능<br/>노드 단계 Events 확인"]`);
paragraph('02_심화/16_','먼저 Kubernetes의 의도 객체와','Kubernetes 의도에서 AWS 실제 자원까지 조사',chain(['의도 객체 · status / Events','담당 controller · 설치 / 실행 상태','controller의 AWS 신원 / 권한 / 네트워크','AWS 실제 자원과 상태 비교']));
paragraph('02_심화/17_','**비교:** PVC','요청 객체와 실제 snapshot의 연결',`flowchart TB
VS["VolumeSnapshot · 요청"] <-->|연결| VC["VolumeSnapshotContent · 공급 결과 연결"] --> SNAP["실제 snapshot 데이터"]
POL["삭제 정책 · Retain / Delete"] -.-> VC
VERIFY["metadata 존재만으로 복원 가능성을 단정하지 않음<br/>실제 데이터·정책·복원 확인"] -.-> SNAP
PVC["비교 · PVC 요청"] <-->|바인딩| PV["PV 공급 결과"]`);
paragraph('02_심화/18_','첫째, rollout과 Ready 수를','Running 이후에도 필요한 장애 조사',chain(['rollout / Ready 수 확인','새 Pod Ready=false?<br/>요청 준비 실패 조사','컨테이너 로그 / readiness 응답<br/>404이면 path 불일치 가설 검증','EndpointSlice · 기존 Ready 대상 존재 확인','ALB target health와 비교']));
paragraph('02_심화/18_','새 Pod가 Ready인데','건강 신호에 따라 조사 경계 이동',`flowchart TB
P["새 Pod Ready"] --> L{"ALB target unhealthy?"}
L -->|예| NET["ALB → Pod 경계<br/>health check path / port / SG"]
L -->|아니오 · 모든 health 정상| B{"특정 업무만 실패?"}
B -->|예| APP["앱 trace / DB / 외부 결제 API"]
N["Kubernetes 정상과 업무 정상은 다른 증거"] -.-> APP`);
paragraph('02_심화/19_','각 실습에서','예측과 증거를 남기는 실습 사이클',chain(['예측 · 누가 무엇을 바꿀까?','명령 · 의도한 변경 실행','관찰 · 상태와 증거 수집','해석 · 예상과 실제 비교','복구 · 변경 되돌림과 확인'],'LR'));
paragraph('01_기초/README','큰 그림과 역할','기초 학습 경로',chain(['큰 그림과 역할','이미지','내부 원리','서비스·배포','확장 판단','그림 복습','이해도 점검·답변 교정']));
paragraph('01_기초/07_','1. **무엇이 부족한가?**','Terraform apply 전에 판단할 네 가지',`flowchart TB
E["Events · 무엇이 부족한가?<br/>복제 수 / 배치 용량 / IP / 권한 / 이미지 / 저장소"] --> P["조정 프로그램 확인<br/>HPA / CA / Karpenter / AWS 그룹 기능"]
P --> LIMIT["현재 정책 안에서 해결 가능한가?<br/>최대 수 / 인스턴스 / zone / subnet / IAM / 할당량"] --> O{"바꿀 설정의 소유자는?"}
O -->|Terraform| TF["HCL 변경 → plan → apply"]
O -->|GitOps| G["저장소 변경"]
O -->|동적 수량 controller| C["해당 controller 상태·정책 확인"]`);
paragraph('02_심화/03_','노드 로그 수집기나','DaemonSet · 전체 개수보다 노드별 배치',`flowchart TB
D["DaemonSet controller · 노드와 배치 조건 관찰"] --> A["조건에 맞는 Node A · 에이전트 Pod"]
D --> B["조건에 맞는 Node B · 에이전트 Pod"]
NEW["새 Node C 등록"] --> D
D --> C["새 Node C · 조건에 맞으면 Pod 추가"]`);
paragraph('02_심화/03_','CronJob은 일정에','CronJob의 일정과 Job의 실행',`flowchart TB
C["CronJob · 일정"] --> J["Job 생성"] --> P["작업 Pod 실행"]
F["concurrencyPolicy: Forbid"] -.-> L["이 CronJob의 Job끼리 겹침 제한"]
N["지연 / 재시도 / 불확실한 완료"] --> DUP["업무 중복 처리 가능성 고려<br/>전 세계 exactly-once 보장 아님"]`);
paragraph('02_심화/03_','직접 만든 Pod를','컨테이너 재시작과 Pod 교체는 다르다',`flowchart TB
E{"무엇이 종료·삭제되었는가?"}
E -->|Deployment 아래 컨테이너만 종료| K["kubelet · 같은 Pod 안에서 재시작 가능<br/>Pod UID 유지"]
E -->|Deployment 아래 Pod 삭제| R["ReplicaSet controller · 대체 Pod 생성<br/>새 UID"]
E -->|상위 controller 없는 직접 Pod 삭제| N["대체 생성할 controller 없음"]`);
function table(prefix, header, title, source){
 const d=docs.find(d=>d.file.replaceAll('\\','/').startsWith(prefix));
 const original=[...d.text.replaceAll('\r','').matchAll(/^\|[^\n]+\n(?:\|[^\n]*\n?)+/gm)].map(m=>m[0].trimEnd()).find(t=>t.startsWith(header));
 if(!original)throw Error(header);
 register(d,title,source,original,'비교표 시각화','comparison-'+(diagrams.filter(i=>i.file===d.file.replaceAll('\\','/')).length+1));
}
table('02_심화/05_','| Probe |','Probe 세 개가 보내는 서로 다른 신호',`flowchart TB
S["startup · 초기 시작이 끝났는가?"] --> OK["성공 전 liveness / readiness 지연"]
S --> FAIL["임계 횟수 실패 · 컨테이너 재시작 판단"]
R["readiness · 지금 요청을 받을 수 있는가?"] --> OFF["실패 · 일반 Service의 준비된 대상에서 제외<br/>이 실패만으로 재시작하지 않음"]
L["liveness · 계속 실행해도 회복 못 하는가?"] --> RESTART["임계 횟수 실패 · kubelet이 종료·재시작 처리"]
OK ~~~ R
OFF ~~~ L`);
table('01_기초/01_','| 흐름 |','시간과 목적이 다른 세 가지 흐름',`flowchart TB
subgraph INFRA["환경 생성·변경 때 · 기반 생성"]
 T["Terraform"] --> API["AWS API"] --> B["VPC / EKS / 노드"]
end
subgraph DEPLOY["버전 변경·지속 유지 · 앱 배포와 제어"]
 BUILD["빌드"] --> ECR["ECR"]
 Y["배포 설정"] --> K["Kubernetes API"] --> N["노드"]
end
subgraph DATA["사용자가 서비스를 쓸 때 · 실제 요청 처리"]
 U["사용자"] --> A["ALB"] --> P["Pod의 앱"] --> DB["DB"]
end`);
fs.writeFileSync('tools/diagrams/manifest.json',JSON.stringify(diagrams,null,2));
console.log(`${docs.length} documents; ${diagrams.length} diagram conversions`);
