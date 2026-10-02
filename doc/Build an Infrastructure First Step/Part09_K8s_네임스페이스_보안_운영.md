---
title: "Part 09. Kubernetes 네임스페이스 · 보안 · 노드 운영"
parent: "Docker·K8s 인프라 구축 실습 순서"
nav_order: 9
---

# Part 09. Kubernetes 네임스페이스 · 보안 · 노드 운영

> 출처: Kubernetes 기초&심화 (CKA&CKAD) CH10(Namespace 관리) ~ CH12(Node 유지관리), 자료 102~110.
> 실습 환경: 마스터 `k8s-master` + 워커 `k8s-node1~3`, v1.28.4, CNI = Calico, 컨테이너 런타임 containerd, CoreDNS Service IP 10.96.0.10.
> 구축 순서: 격리 단위 만들기(Namespace) → 자원 제한(ResourceQuota/LimitRange) → 접근 통제(ServiceAccount/RBAC) → 통신 통제(NetworkPolicy) → 노드 운영(drain/cordon, 장애 대응, 버전 업그레이드)

---

## Step 1. Namespace 생성과 사용 (CH10-01)

### [목적]
- 하나의 클러스터를 논리적으로 분리(dev / ops / prod 등)해 Pod, Service 등을 나눠 관리하고, 이후 단계(ResourceQuota, LimitRange, RBAC, NetworkPolicy)를 적용할 "단위"를 만든다.

### [이론 설명]
> 이 Step은 PDF 원본(CH10-01, 26쪽, 강사 설명·슬라이드·터미널 캡처 포함)의 한글 본문을 직접 확인해 보강했다.

- Namespace(ns)는 Kubernetes cluster 내에서 리소스(Pod, Service 등)를 구분(격리)하기 위한 "가상의 논리적 공간(그룹, 파티셔닝)"을 제공하며 이를 scope(범위)라고 부른다. 강사는 "물리적인 공간이 아니라 논리적 공간이며 범위를 준다는 뜻"이라고 강조한다. 지금까지 수업은 알게 모르게 default namespace만 사용해 왔다.
- 리눅스 `lsns`로 보이는 커널 namespace(time, cgroup, pid, user, uts, ipc, net, mnt: 커널 격리 기술)와는 이름만 같고 별개의 개념이다. Kubernetes의 Namespace는 "클러스터 안에 또 다른 작은 클러스터를 만드는 것 같은 가상의 공간"(= ns는 가상(or 하위) 클러스터)이다.
- 어떻게 나누는가: 서비스(애플리케이션/팀/환경 등 목적) 단위의 Namespace 구분은 전체 프로젝트 운영·관리 측면에서 유리하다. 개발/테스트/QA/운영 등 목적별, 팀 내부 업무별(blogTeam-dev / blogTeam-test / blogTeam-prod), 프런트/백엔드/DB 구분, 프로젝트 단위 등으로 나눈다. 대규모 환경에서는 팀별로 아예 별도 클러스터를 쓰기도 한다. 같은 애플리케이션이라도 개발·테스트·운영 환경마다 설정 값이 조금씩 다르므로 환경별로 ns를 나누는 것이 일반적이다. ns로 격리할 수 있어 애플리케이션들이 서로 간섭 없이 실행된다.
- (강사 포인트) 서로 다른 Namespace에서는 같은 이름을 써도 된다(한 Namespace 안에서는 이름 중복 불가). default 하나만 쓸 때는 이름이 겹칠 수 없었지만, ns를 나누면 개발/운영에 같은 이름의 애플리케이션을 각각 둘 수 있다. Namespace의 축약형은 `ns`.
- (강사 팁) 다양한 구성 사례는 구글 이미지 검색 "kubernetes namespace"로 찾아 적합한 구성 그림을 고르면 도움이 된다.
- 사용 예: 개발/테스트/QA/운영 환경 분리, 프로젝트·팀별 분리 (예: blogTeam-dev / blogTeam-test / blogTeam-prod).
- Namespace 설계 4단계(강사 슬라이드): ① Namespace(요구되는 ns 생성) → ② ResourceQuota(자원 소비 제어: 생성된 ns에 필요한 자원 소비량 제어) → ③ RBAC(접근제어 구성: user 및 sa(ServiceAccount)에 필요한 접근 제어 구성) → ④ NetworkPolicy(ns 간 송수신 제어: ns 간 구체적 송수신 제어 정책 구성). 강사는 Namespace는 "만드는" 것이 아니라 "설계하는" 것이며, 만드는 명령은 아주 간단하지만 목적에 맞게 ResourceQuota(총 자원)·LimitRange(개별 Pod)·RBAC(사용자/ServiceAccount 권한)·NetworkPolicy(송수신 통신)를 함께 구성해야 한다고 말한다. 처음부터 default Namespace에서 끝내지 말고 목적을 가진 Namespace 아키텍처를 잡으라고 당부한다.
- ns를 활용하는 세 가지 관점(강사): ① 논리적 구분점, ② 접근제어(RBAC: Role/RoleBinding/ClusterRole/ClusterRoleBinding으로 리소스·사용자 간 접근 제어, 민감 데이터에 대한 무단 액세스 방지와 여러 팀의 동시 작업 허용), ③ 자원 소비 제어(ResourceQuota 등). RBAC는 "역할 기반 접근 제어"이며 CKA/CKAD/CKS 시험에 기본 보안 RBAC가 꼭 나오므로 기억해 두라는 조언이 있다(14~15장에서 CKA 기출 유형 문제풀이 예정, 초보자에게도 CKA 권장).
- ResourceQuota vs LimitRange(강사): ResourceQuota는 ns가 사용 가능한 "최대 리소스 양(총량)"을 지정해 특정 애플리케이션의 자원 독점으로 인한 다른 애플리케이션의 성능 저하를 방지(주로 CPU, Memory, Pod 수 등 제한)하고, LimitRange는 Namespace 내에서 실행되는 컨테이너(Pod/PVC 등)에 대한 제한을 할당하는 데 쓴다. 강사는 "성능은 결국 응답 시간이고 응답 시간은 자원에서 비롯되므로 제한 없이 쓰는 것을 권장하지 않는다"고 말한다. 노드(VM) 자원은 한정적(예: 4코어 4GB)이고 실제로 자원을 쓰는 것은 Namespace가 아니라 그 안의 Pod이다.
- 서로 다른 팀/프로젝트가 서로 방해하지 않고 워크로드를 실행할 수 있다. ns로 구분해도 리소스 간 통신(송수신)은 기본적으로 허용된다. 제한은 NetworkPolicy로 Pod 내부로 들어오는(Ingress)·외부로 나가는(Egress) 트래픽을 허용/거부하는 정책으로 설정하며, Whitelist 방식(허용 목록에 적은 대상만 통신)이다. 강사: NetworkPolicy는 문법이 복잡해 보이나 송/수신 논리만 이해하면 공식 문서 예제를 가져와 몇 가지 값만 바꿔 쉽게 만들 수 있다.
- 기본 Namespace 4개
  | Namespace | 용도 |
  |---|---|
  | default | 지정된 Namespace가 없는 오브젝트를 위한 기본 ns (슬라이드: 주로 테스트 목적) |
  | kube-system | Kubernetes의 주요 구성요소를 위한 ns. 강사: "쿠버네티스 시스템 영역"(CoreDNS, kube-proxy 등) |
  | kube-public | 모든 사용자가 공개적으로 접근할 수 있는 object(시스템 프로세스)를 위한 ns |
  | kube-node-lease | 클러스터가 스케줄링될 때 노드의 heartbeat와 리더 선출 같은 시스템 핵심 기능과 관련된 lease 오브젝트용 ns(분산 시스템에서 공유 리소스를 잠그고 노드 간 활동을 조절하는 "리스(lease)"가 필요). 강사: 대규모·멀티클러스터 환경에서 ETCD 리더 알고리즘처럼 한쪽에 문제가 생기면 교체하는 방식을 지원 |
  - 실습 환경(`kubectl get pod -A`)에는 이 밖에도 ingress-nginx, kubernetes-dashboard, metallb-system, monitoring, openebs, portainer 같은 애플리케이션별 Namespace가 이미 분리되어 있다.
- Namespace별로 구분되는 리소스와 아닌 리소스: `kubectl api-resources`의 NAMESPACED 열. pods, services, configmaps, secrets, pvc, serviceaccounts, resourcequotas, limitranges 등은 true / nodes, persistentvolumes, namespaces, componentstatuses 는 false (클러스터 전체 범위).
- Service DNS 형식: `<service-name>.<namespace-name>.svc.cluster.local`
  - 같은 ns 내에서는 `mydb-svc`만으로 접근, 다른 ns는 `mydb-svc.ops.svc.cluster.local` 또는 `mydb-svc.ops` 처럼 ns를 붙여야 한다.
  - Pod DNS 예: `10-109-131-21.myweb-svc.default.svc.cluster.local`
- Pod의 `/etc/resolv.conf` (CoreDNS를 바라봄)
  ```
  search default.svc.cluster.local svc.cluster.local cluster.local
  nameserver 10.96.0.10
  options ndots:5
  ```
  - search: 짧은 이름을 완성할 때 붙이는 도메인 목록 / nameserver: kube-dns(CoreDNS) Service의 ClusterIP / ndots:5: 점이 5개 미만이면 search 목록을 먼저 시도.
- CoreDNS Corefile (kube-system의 `coredns` ConfigMap)
  ```
  .:53 {
      errors
      health {
          lameduck 5s
      }
      ready
      kubernetes cluster.local in-addr.arpa ip6.arpa {
          pods insecure
          fallthrough in-addr.arpa ip6.arpa
          ttl 30
      }
      prometheus :9153
      forward . /etc/resolv.conf {
          max_concurrent 1000
      }
      cache 30
      loop
      reload
      loadbalance
  }
  ```
  - Corefile 의미(강사): 53번 포트 서비스, `errors`=오류를 표준 출력, `health`=CoreDNS 상태 체크(lameduck 5s), `ready`=준비 상태 응답, `kubernetes cluster.local`=클러스터 도메인 처리, `prometheus :9153`=메트릭 포트.
  - `forward . /etc/resolv.conf` : 클러스터 외부 도메인은 노드의 resolv.conf DNS로 전달. (강사 경험 팁) 슬라이드에 "CoreDNS를 통한 외부 DNS 조회 문제 발생 시 → `forward . 8.8.8.8` 로 변경"이라고 적혀 있다. 애플리케이션 운영 중 CoreDNS를 통한 외부 DNS 해석이 원활하지 않을 때 구글 DNS(8.8.8.8)로 바꾸면 해결된 경험이 있다는 설명이며, 이번 실습에서 바꾸는 것은 아니고 현재 설정을 보여 준 것이다.
- Pod를 만들면 CoreDNS 정보가 Pod의 resolv.conf에 자동 등록된다. 즉 우리가 만드는 서비스는 전부 CoreDNS에 등록된다. resolv.conf 항목: search(DNS에 질의할 부분 도메인 경로, 짧은 이름을 물으면 이 도메인을 차례로 붙여 검색 = service discovery) / nameserver(DNS 쿼리를 보낼 곳. CoreDNS Service IP, 앞에서 본 kube-dns CLUSTER-IP 10.96.0.10과 같음) / ndots(FQDN으로 취급될 도메인에 포함될 `.` 의 최소 개수, 기본값 5).
- DNS 주소 체계 `<service-name>.<namespace-name>.svc.cluster.local`: service-name=서비스 이름(예: mydb-svc), namespace-name=서비스가 속한 Namespace(예: dev, ops), `svc`=서비스임을 나타내는 고정 문자열, `cluster.local`=클러스터 도메인(기본값). 같은 Namespace 안이면 서비스 이름만(`mysql.connect("mydb-svc")`), 다른 Namespace(예: dev→ops)면 전체 주소(`mydb-svc.ops.svc.cluster.local`)를 쓴다. 강사: 이름이 같을 때는 물론이고 default가 아닌 다른 Namespace에 있다면 반드시 명시해야 한다. Pod는 어느 노드에 스케줄링되는지와 무관하게 Namespace 주소만으로 연결되며, 서로 다른 Namespace 간 연결도 NetworkPolicy로 제한하지 않는 한 기본적으로 열려 있다.
- Namespace 소속 여부(강사 슬라이드): `kubectl api-resources --namespaced=true`는 ns에 포함되는 리소스, `--namespaced=false`는 포함되지 않는 리소스. Node, PV 등은 Kubernetes에서 사용되는 "저수준의 object"로 ns에 의해 구분되지 않는다(ns가 아니라 클러스터 전반에 걸쳐 사용되는 object). Node는 Kubernetes가 구현한 논리적 object이면서 물리적 머신과 함께 동작하고 PV도 클러스터 전체가 쓰는 자원이어서 Namespace로 격리되지 않는다.
- Namespace 단위로 적용 가능한 기능: ResourceQuota, LimitRange, RBAC(Role/RoleBinding), NetworkPolicy.

### [사용한 CLI]

**1-1. CoreDNS 및 DNS 구성 확인**
```bash
lsns                                                    # (참고) 리눅스 커널 namespace(time/cgroup/pid/user/uts/ipc/net/mnt) - K8s Namespace와 별개
kubectl get no                                          # 노드 4대, v1.28.4 (화면에 함께 남아 있음)
kubectl get pod -A                                      # 모든 ns의 Pod (ingress-nginx, kubernetes-dashboard, metallb-system 등 ns 확인)
sudo vi /etc/resolv.conf                                # 호스트 resolv.conf 확인 (CoreDNS nameserver는 주석으로 미리 넣어 둠, 이 시점엔 변경 안 함)
kubectl get po -n kube-system -l k8s-app=kube-dns      # CoreDNS Pod (-l: 라벨 셀렉터)
kubectl get svc -n kube-system -l k8s-app=kube-dns     # kube-dns Service (CLUSTER-IP 10.96.0.10)
sudo cat /var/lib/kubelet/config.yaml                   # kubelet 설정의 clusterDNS 확인
kubectl describe cm -n kube-system coredns              # Corefile 확인

# Pod 안의 resolv.conf 확인 (--rm: 종료 시 Pod 삭제, --restart=Never: 단발성 Pod)
kubectl run -it --rm dns-verify --restart=Never --image=busybox -- cat /etc/resolv.conf
```

**1-2. Namespace 생성/조회**
```bash
kubectl get ns
kubectl create namespace dev-ns
kubectl create namespace ops-ns
kubectl get ns
kubectl get ns dev-ns -o yaml        # Namespace 오브젝트 YAML 확인
```
```yaml
# kubectl get ns dev-ns -o yaml 결과
apiVersion: v1
kind: Namespace
metadata:
  labels:
    kubernetes.io/metadata.name: dev-ns
  name: dev-ns
spec:
  finalizers:
  - kubernetes
status:
  phase: Active
```

**1-3. 작업 Namespace 전환 (context)**
```bash
kubectl config get-contexts                                   # 현재 context의 NAMESPACE 열 확인
kubectl config set-context --current --namespace dev-ns       # 현재 context의 기본 ns 변경
kubectl config get-contexts
kubectl config view --minify | grep namespace:                # 변경 확인
kubectl config set-context --current --namespace default      # 원복
```

**1-4. kubens 스크립트 설치 (ns 전환 도구)**
```bash
vi kubens                              # kubens 스크립트 작성(자료에서는 내용을 붙여넣음)
sudo cp kubens /usr/local/bin/
sudo chmod 777 /usr/local/bin/kubens

kubens -h
kubens ops-ns        # ns 변경  -> Active namespace is "ops-ns".
kubens -c            # 현재 ns 확인 (--current)
kubens -             # 이전 ns로 전환
kubens               # 현재 context의 ns 목록
```

**1-5. Namespace 지정 배포 (`-n`)**
```bash
# 현재 ns가 dev-ns인 상태에서 -n ops-ns 로 Deployment 생성
kubectl create deployment nstest -n ops-ns --image=nginx --port=80 --replicas=2
kubectl get deployments.apps                  # dev-ns 에는 없음 -> No resources found
kubectl expose deployment nstest --name=nstest-svc --port=80 --target-port=80
#  -> Error from server (NotFound): deployments.apps "nstest" not found  (expose도 -n 필요)

kubectl -n ops-ns expose deployment nstest --name=nstest-svc --port=80 --target-port=80
kubectl get po,svc -o wide | grep nstest      # -n 없이 조회 -> No resources found in dev-ns namespace.
kubectl -n ops-ns get po,svc -o wide | grep nstest
kubens default
kubens -c                                     # default 확인
kubectl get svc -A | grep nstest              # 모든 ns의 Service 조회(-A)
curl 10.111.6.149                             # ClusterIP(노드에서 접근 가능) -> Welcome to nginx!

# dev-ns에도 동일 이름으로 생성 (ns가 다르면 같은 이름 사용 가능)
kubectl create deployment nstest -n dev-ns --image=nginx --port=80 --replicas=2
kubectl -n dev-ns expose deployment nstest --name=nstest-svc --port=80 --target-port=80
```

**1-6. Namespace 범위 리소스 조회**
```bash
kubectl api-resources                       # NAMESPACED 열 확인
kubectl api-resources --namespaced=true     # ns에 속하는 리소스
kubectl api-resources --namespaced=false    # ns에 속하지 않는 리소스(Node, PV 등)
```

**1-7. Pod에서의 DNS 동작 검증**
```bash
kubectl run dns-test -it --rm --image=alpine -- sh
/ # wget -qO- --timeout=3 http://nstest-svc          # wget: bad address (default ns에는 없음)
/ # wget -qO- --timeout=3 http://nstest-svc.ops-ns   # Welcome to nginx!
/ # wget -qO- --timeout=3 http://nstest-svc.dev-ns   # Welcome to nginx!

# ClusterIP로 역방향 조회 -> 어느 ns의 Service인지 확인
kubectl get svc -A | grep nstest
kubectl run dns-verify -it --rm --restart=Never --image=busybox -- nslookup 10.109.149.136
#  -> name = nstest-svc.dev-ns.svc.cluster.local
kubectl run dns-verify -it --rm --restart=Never --image=busybox -- nslookup 10.111.6.149
#  -> name = nstest-svc.ops-ns.svc.cluster.local
```

**1-8. 노드(VM)에서 클러스터 DNS 이름 조회**
```bash
nslookup nstest-svc.ops-ns.svc.cluster.local
#  -> 노드 기본 DNS(127.0.0.53)는 SERVFAIL

sudo vi /etc/resolv.conf          # 기존 nameserver 127.0.0.53 은 그대로 두고, 미리 주석 처리해 둔 CoreDNS nameserver 줄의 주석 해제(추가)
nameserver 10.96.0.10             # 추가 (정정: "변경"이 아니라 추가. 기존 127.0.0.53이 먼저 SERVFAIL 후 다음 nameserver로 넘어감)

nslookup nstest-svc.ops-ns.svc.cluster.local     # Address: 10.111.6.149
nslookup nstest-svc.dev-ns.svc.cluster.local
curl -v nstest-svc.dev-ns.svc.cluster.local
curl http://nstest-svc.ops-ns.svc.cluster.local  # Welcome to nginx!
ping 10.103.107.111                              # ClusterIP는 ping 응답 없음 (슬라이드 예시 IP)

# 실제 실습 화면 값
curl nstest-svc.ops-ns.svc.cluster.local         # Welcome to nginx!
kubectl get svc -A | grep nstest                 # ops-ns nstest-svc ClusterIP 10.111.6.149
ping 10.111.6.149                                # 응답 없음 (가상 IP)

# (참고) 슬라이드 예시 IP로 역조회한 화면 (실습 값은 1-7)
kubectl run dns-verify -it --rm --restart=Never --image=busybox -- nslookup 10.103.107.111   # nstest-svc.dev-ns.svc.cluster.local
kubectl run dns-verify -it --rm --restart=Never --image=busybox -- nslookup 10.110.193.27    # nstest-svc.ops-ns.svc.cluster.local
```

### [확인 방법/주의점]
- `kubectl get ns` 에서 STATUS가 Active인지 확인.
- 현재 ns는 `kubectl config view --minify | grep namespace:` 또는 `kubens -c`로 확인. 기본 ns를 바꿔 놓고 `-n` 없이 명령을 내려 엉뚱한 ns에 리소스가 생기지 않도록 주의(`expose`도 동일하게 ns 필요).
- 다른 ns의 Service를 호출할 때는 `<svc>.<ns>` 또는 FQDN 사용. ns 없이 호출하면 `bad address`.
- ClusterIP는 가상 IP이므로 ping은 응답하지 않는 것이 정상이며 curl(TCP 80)로 확인한다.
- ns를 만들었다고 자동으로 격리되는 것은 아니다. 자원 제한/권한/네트워크 격리는 이후 Step에서 별도로 설정한다.
- (강사 정리, 영상 확인 포인트) ① Namespace가 달라도 통신은 기본적으로 열려 있다(NetworkPolicy로 제한하지 않는 한). ② 다른 Namespace의 서비스는 `서비스명.Namespace명`(전체는 `.svc.cluster.local`까지)으로 호출. ③ Pod의 resolv.conf에는 CoreDNS(10.96.0.10)가 자동 등록되지만, 호스트(VM)에서 이름으로 조회하려면 호스트 resolv.conf에 직접 등록해야 한다. ④ ClusterIP는 ping 대상이 아니다(가상 IP라 서비스 포트와 결합된 경우에만 의미가 있고, IP 자체로는 요청/응답을 수행할 수 없게 되어 있음).
- 호스트에서 `nslookup` 시 처음엔 기본 DNS(127.0.0.53)가 서비스 이름을 몰라 SERVFAIL. CoreDNS nameserver 추가 후에는 10.96.0.10이 응답한다(화면의 "Got SERVFAIL reply from 127.0.0.53, trying next server" 줄은 첫 네임서버 실패 후 다음으로 넘어간 흔적).
- 같은 이름 서비스(nstest-svc)가 dev-ns/ops-ns에 각각 있어도 DNS에는 Namespace 이름이 붙은 서로 다른 주소로 등록되어 충돌하지 않는다.
- kubens 스크립트 본문은 영상 화면에서 확인되지 않았다(강사가 별도 공유한다고 언급, "제가 만든 것은 아니고 간단한 코드, 여러 Namespace를 오가며 일한다면 하나쯤 만들어 두면 편하다"). `kubens -`는 이전 Namespace로 돌아가는 롤백 용도. 도움말: `kubens`(현재 context의 ns 목록) / `kubens <NAME>`(변경) / `kubens -`(이전 ns) / `kubens -c, --current`(현재 ns) / `kubens -h, --help`. (참고: `chmod 777`은 자료 그대로이며, 보안상 `chmod +x` 정도가 적절)
- 현재 기본 Namespace는 kubectl config의 context에 저장된다. 한 번도 설정한 적이 없으면 get-contexts의 NAMESPACE 칸이 비어 있고, 비어 있으면 default가 사용된다.
- `-n` 옵션의 위치는 상관없지만 Namespace를 반드시 지정해야 한다(강사 강조). 조회뿐 아니라 expose에도 필요하며 지정하지 않으면 `deployments.apps "nstest" not found`.
- 임시 Pod(dns-test, alpine, `--rm`: 종료 시 자동 삭제)를 default ns에 띄워 `nstest-svc`만 쓰면 `wget: bad address`, `.ops-ns`/`.dev-ns`를 붙이면 nginx 응답.
- (참고) 자료 말미 셀프 체크: Namespace를 가상의 논리적 공간이라 부르는 이유와 lsns 커널 namespace와의 차이, 같은/다른 ns에서의 서비스 이름 중복 허용 여부, DNS 주소 각 부분, resolv.conf의 nameserver/search/ndots, ns에 속하지 않는 리소스 예시(Node, PV)와 구분 명령, ResourceQuota/LimitRange 역할, 설계 4단계, 기본 4개 ns.

---

## Step 2. ResourceQuota — Namespace 단위 총량 제한 (CH10-02)

### [목적]
- 특정 Namespace가 사용할 수 있는 CPU/메모리/오브젝트 개수/스토리지의 총량을 제한해 한 ns가 클러스터 자원을 독점하지 못하게 한다.

### [이론 설명]
> 이 Step은 PDF 원본(CH10-02, 14쪽 전체)의 한글 본문·강사 설명을 직접 확인해 보강했다.

- ResourceQuota 소개(강사/슬라이드 26~27): Quota는 "말 그대로 자원의 할당량". ResourceQuota는 하나의 공유 Kubernetes 클러스터에서 여러 팀·여러 프로젝트가 진행 중인 환경에서 유용하며, 하나의 Pod 애플리케이션이 많은 리소스를 독점해 상대적으로 다른 애플리케이션의 성능에 영향을 미치는 것을 방지한다. 클러스터가 아니라 "Namespace 당" 적용되며(Namespace에 최대 한계를 설정), 유형별로 ns에서 생성할 Pod 수와 해당 프로젝트에서 사용할 수 있는 리소스의 총 Compute(CPU, Memory) 양을 제한한다. Pod 입장에서 자원이 부족해 문제가 발생할 수는 있지만 다른 Namespace의 Pod에는 영향을 주지 않는다(한 곳의 문제가 다른 곳으로 번지지 않게 함). 노드(VM)의 자원은 한정적이므로(예: 4코어 4GB) Namespace 단위로 나눠 쓰도록 제한한다.
- 주의(강사): 다만 잘못된 설정으로 할당량을 초과하면 애플리케이션이 실패할 수 있다. 너무 적게 제한해도, 너무 많이 줘도 좋지 않아 "적정 용량을 찾는 일"이 어렵다. 설정 자체가 아니라 "얼마로 잡느냐"가 어렵기 때문에 성능 테스트·APM 등으로 충분히 모니터링한 뒤 값을 정해야 하며 "그냥 CPU 얼마, 메모리 얼마 하고 임의로 정하는 것은 절대 아니다". 할당량을 넘겨 요구하는 Pod는 실행되지 못하므로 사용량 추적과 임계값 초과 시 알림 설정까지 갖춘 모니터링(옵저버빌리티) 환경을 권한다. 설계할 때는 Namespace별 quota와 Pod 수, Pod 당 용량(requests/limits)의 총량을 문서로 미리 정해 두고 quota를 요청하라고 조언한다.
- requests vs limits(강사, 슬라이드 28): request(요청)=컨테이너에 대해 보장된 CPU 또는 메모리 리소스, 컨테이너에 "이만큼은 줘" 하고 요청하는 최소한의 보장 용량. limit(제한)=다른 컨테이너의 사용량에 따라 사용할 수 있는 메모리 또는 CPU 임계값, 여기까지 쓸 수 있는 최대치(임계치)이며 다른 컨테이너 사용량에 따라 좌우되어 여유 공간이 있을 때 보장하는 것이지 항상 보장되지는 않는다. "극한으로 다들 쓰고 있다면 limit까지 못 쓸 수도 있다". 앞서 Pod·HPA에서 설정한 resource request/limit와 같은 개념이다.
- ResourceQuota는 언제 쓰나(슬라이드 29): Namespace에서 CPU 소모를 제한해야 할 때, memory 소모를 제한해야 할 때, 동작 중인 Pod의 총 수를 제한해야 할 때. 예시 YAML(rq-1: requests.cpu "1000m", requests.memory "1Gi", limits.cpu "2000m", limits.memory "2Gi")의 의미는 dev-ns의 "모든 Pod를 합친" 값으로 한도가 걸린다는 것: 합쳐서 1 CPU core 이상 request 차단 / 1GiB 메모리 이상 request 차단 / 2 CPU core 사용 불가 / 2GiB 이상 메모리 사용 불가. CPU 단위는 millicore, 1000m = 1 CPU(1 또는 0.5처럼 써도 되지만 보통 1000 단위로 표기), 메모리는 Mi/Gi(2진 기가바이트).
- 한도를 넘는 Pod/리소스 생성 요청은 거부된다(Forbidden: exceeded quota).
- (실습 전제) dev-ns는 이전 클립(Namespace 활용)에서 만든 것이며 없으면 create로 먼저 만든다. dev-ns 안의 이전 Deployment/Service(nstest)도 quota 대상에 포함되므로 실습 전에 지운다. 강사는 슬라이드 예시보다 작게(100m/200m/1Gi/1Gi) 직접 만들어 보라고 하며 "거꾸로만 주지 않으면 되니까(request가 limit보다 크면 안 됨) 값은 상관없다"고 말한다.
- requests(요청, 최소 보장 자원)와 limits(상한, 최대 사용 허용 자원). 1000m(millicore) = 1 CPU core, 메모리는 Mi / Gi.
- ResourceQuota에 CPU/메모리 항목이 있으면, 그 ns의 모든 Pod는 해당 requests/limits를 반드시 지정해야 한다(없으면 `must specify limits.cpu ...` 오류로 거부).
- 제한 가능한 오브젝트 항목(자료 표): configmaps, persistentvolumeclaims, pods(Failed/Succeeded 상태가 아닌 Pod 수), replicationcontrollers, resourcequotas, services, services.loadbalancers, services.nodeports, secrets, requests.storage.
- 같은 이름으로 `apply` 하면 기존 quota가 `configured`(변경)된다(강사도 이름을 rq-2로 바꾸지 않고 rq-1 그대로 적용해 덮어쓰기가 되었고 "이름을 잘못 넣었다"고 말함. 설정은 apply 즉시 반영되어 describe로 바로 확인 가능). (※ "quota는 신규 생성 시점에 검사하며 기존 리소스를 소급 삭제하지 않는다"는 것은 원본 자료에 명시되지 않은 일반 동작 설명이다.)
- 개수 제한 키 표(슬라이드 33, 출처 kubernetes.io/docs/concepts/policy/resource-quotas/): configmaps(Namespace에 존재할 수 있는 ConfigMap 총 수), persistentvolumeclaims(PVC 총 수), pods(비종료 상태의 총 Pod 수. `.status.phase in (Failed, Succeeded)`가 true이면 종료 상태), replicationcontrollers(복제 컨트롤러 총 수), resourcequotas(ResourceQuota 총 수), services(서비스 총 수), services.loadbalancers(LoadBalancer 유형 서비스 총 개수), services.nodeports(NodePort 유형 서비스 총 개수), secrets(보안 비밀 총 수). 강사: 가장 많이 쓰는 것은 Pod 개수이며 pods는 "종료되지 않은 상태의 Pod 수"를 센다는 점을 기억. Service의 NodePort/LoadBalancer 개수 제한은 네트워크·보안과 연관되어 포트를 너무 많이 열지 못하게 막는 용도이고 NodePort는 어차피 30000~32767 범위 안에서 개수를 관리하는 셈.

### [사용한 CLI]

**2-1. rq-1.yaml (CPU/메모리 제한) 작성/적용**
```yaml
# rq-1.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: rq-1
  namespace: dev-ns
spec:
  hard:
    requests.cpu: "100m"
    limits.cpu: "200m"
    requests.memory: 1Gi
    limits.memory: 1Gi
```
(개념 설명용 예시는 `requests.cpu: "1000m"`, `requests.memory: "1Gi"`, `limits.cpu: "2000m"`, `limits.memory: "2Gi"` 로 소개됨)

```bash
vi rq-1.yaml
kubectl apply -f rq-1.yaml                       # resourcequota/rq-1 created

# 기존 리소스 정리 후 quota 확인
kubectl -n dev-ns delete deployments.apps nstest
kubectl -n dev-ns delete svc nstest          # 오입력 -> Error from server (NotFound): services "nstest" not found
kubectl -n dev-ns delete svc nstest-svc
kubectl -n dev-ns describe resourcequotas        # Resource / Used / Hard 표
```

**2-2. requests/limits 없이 Pod 생성 → 거부**
```bash
kubectl run myweb-rq1 --image=nginx -n dev-ns
# Error from server (Forbidden): pods "myweb-rq1" is forbidden: failed quota: rq-1:
#   must specify limits.cpu ...; limits.memory ...; requests.cpu ...; requests.memory ...
```

**2-3. resources를 지정한 Pod 생성 (dry-run으로 YAML 생성 후 수정)**
```bash
kubectl run myweb-rq1 --image=nginx -n dev-ns --dry-run=client -o yaml > myweb-rq1.yaml
vi myweb-rq1.yaml
```
```yaml
# myweb-rq1.yaml
apiVersion: v1
kind: Pod
metadata:
  name: myweb-rq1
  namespace: dev-ns
spec:
  containers:
  - image: nginx
    name: myweb-rq1
    resources:
      requests:
        cpu: "50m"
        memory: 0.5Gi
      limits:
        cpu: "100m"
        memory: 0.5Gi
```
```bash
kubectl apply -f myweb-rq1.yaml        # pod/myweb-rq1 created
kubectl describe pod myweb-rq1 -n dev-ns   # Limits/Requests, QoS Class: Burstable (0.5Gi = 512Mi)
```

**2-4. quota 초과 Pod → 거부**
```bash
cp myweb-rq1.yaml myweb-rq2.yaml
vi myweb-rq2.yaml                      # memory 를 0.8Gi 로 수정
kubectl apply -f myweb-rq2.yaml
# Warning: ... fractional byte value "858993459200m" is invalid, must be an integer
# Error from server (Forbidden): ... exceeded quota: rq-1,
#   requested: limits.memory=858993459200m,requests.memory=858993459200m,
#   used: limits.memory=512Mi,requests.memory=512Mi, limited: limits.memory=1Gi,requests.memory=1Gi
```
- 오류 메시지 해석: `requested`(이번 요청량) + `used`(이미 사용량) > `limited`(한도). 소수점 표기(0.8Gi) 경고가 나오므로 정수로 쓰는 `800Mi` 같은 Mi 단위가 안전(강사 보충). 강사: 에러 메시지를 끝까지 읽어 보라 — "exceeded quota: rq-1"(한도 초과), requested(이번에 요청한 양)/used(이미 쓰고 있는 양)/limited(한도)로 구성돼 전체 용량 대비 현재 얼마를 쓰고 얼마를 더 요청해서 넘었는지 알려 준다. 에러가 나면 피하지 말고 분석하면 답이 그 안에 있고, ChatGPT 등에 물어보는 것도 좋은 방법. 여기서는 myweb-rq1이 이미 0.5Gi(=512Mi)를 쓰고 있어 0.5+0.8이 quota(1Gi)를 넘는다. (YAML에 0.5Gi로 쓴 메모리가 describe에서는 512Mi로 표시됨.)
- 정정/보충: rq-1 quota를 `kubectl -n dev-ns describe resourcequotas`로 보면 Used가 모두 0(Pod 생성 전)이었고, 서비스 이름을 잘못 입력해 `Error from server (NotFound): services "nstest" not found`가 난 뒤 `nstest-svc`로 다시 지움.

**2-5. rq-2.yaml (오브젝트 개수/스토리지까지 제한) — 같은 이름 rq-1 로 apply 시 변경**
```yaml
# rq-2.yaml  (metadata.name 이 rq-1 이라 기존 quota 가 덮어써짐)
apiVersion: v1
kind: ResourceQuota
metadata:
  name: rq-1
  namespace: dev-ns
spec:
  hard:
    requests.cpu: "100m"
    limits.cpu: "200m"
    requests.memory: 1Gi
    limits.memory: 1Gi
    configmaps: 5
    services: 5
    services.nodeports: 2
    pods: 5
    persistentvolumeclaims: 2
    requests.storage: "2Gi"
```
```bash
vi rq-2.yaml
kubectl apply -f rq-2.yaml                       # resourcequota/rq-1 configured
kubectl describe resourcequotas -n dev-ns        # Used / Hard 확인
```

**2-6. PVC 용량/개수 제한 테스트**
```yaml
# rq-pv.yaml : 3Gi PVC (한도 2Gi 초과)
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: rq-pv
  namespace: dev-ns
spec:
  accessModes:
  - ReadWriteMany
  resources:
    requests:
      storage: 3Gi
```
```bash
vi rq-pv.yaml
kubectl apply -f rq-pv.yaml
# Error from server (Forbidden): ... exceeded quota: rq-2, requested: requests.storage=3Gi,
#   used: requests.storage=0, limited: requests.storage=2Gi

kubectl apply -f rq-pv-1g.yaml     # 1Gi PVC 3개(rq-pv-1g-1/2/3, --- 로 구분) 한 파일에 정의
# rq-pv-1g-1, rq-pv-1g-2 created / rq-pv-1g-3 -> Forbidden (persistentvolumeclaims 한도 2개 초과)
```

### [확인 방법/주의점]
- `kubectl describe resourcequotas -n <ns>` 의 Used/Hard 로 사용량 확인.
- quota에 cpu/memory가 있으면 모든 Pod에 requests/limits 를 명시해야 한다(없으면 `must specify`). 이를 자동 보완하려면 다음 Step의 LimitRange 를 사용.
- `exceeded quota` 오류는 requested / used / limited 세 값을 비교해 원인 파악.
- 메모리는 `0.5Gi` 보다 `512Mi`, `800Mi` 같은 정수 단위가 안전.
- 같은 이름으로 apply 하면 새 quota가 생기지 않고 기존 것이 `configured` 로 변경됨(이름을 다르게 하면 quota가 여러 개 적용될 수 있음).
- 용량(requests.storage) 한도와 PVC 개수 한도는 각각 독립적으로 검사된다.
- 참고(화면 표기): 슬라이드의 rq-pv / rq-pv-1g 에러 메시지에는 quota 이름이 `rq-2`로 적혀 있으나, 실제 실습에서 걸린 quota 이름은 `rq-1`이다(rq-2.yaml의 metadata.name이 rq-1이라 덮어씀). 위 에러 예시는 화면 표기 그대로이다. 1Gi PVC 3개를 한 파일(`---` 구분)에 넣어 apply하면 2개만 생성되고 3번째는 할당받을 용량(그리고 PVC 개수 한도 2)이 없어 거부된다.
- 강사 정리: ResourceQuota를 공부할 때는 "제한이 정상적으로 걸리는지 꼭 확인"하는 것이 중요. quota 확인 시 describe의 Used 열은 현재 사용량(ConfigMap 1개, Pod 1개, CPU/메모리는 myweb-rq1의 값).

---

## Step 3. LimitRange — Pod/Container/PVC 단위 제한과 기본값 (CH10-03)

### [목적]
- Namespace 안에서 개별 Pod/Container/PVC 의 최소~최대 범위를 제한하고, requests/limits 를 생략한 Pod 에 기본값을 자동 부여한다.

### [이론 설명]
> 이 Step은 PDF 원본(CH10-03, 13쪽 전체)의 한글 본문·강사 설명을 직접 확인해 보강했다.

- LimitRange 소개(슬라이드 39): LimitRange는 개별 pod, container 단위로 cpu와 memory에 제한을 주거나 기본값을 설정한다. 강사 설명: 리소스 쿼터는 "네임스페이스를 기준"으로 총 용량을 정하므로 ResourceQuota가 있더라도 예를 들어 네임스페이스에 CPU 1개짜리 쿼터를 걸어도 "Pod 하나가 그 자원을 혼자 다 쓸 수 있다"는 전제가 남는다. 이를 막고, 너무 적은 자원을 주거나 너무 많은 자원을 주는 것도 문제가 될 수 있으므로 쿠버네티스의 기준 단위인 Pod(애플리케이션 단위)에 리소스를 균등하게 나눠 주는 것(Namespace 내에서 리소스 균등 분배)이 LimitRange의 목적이다. 강사는 이것도 설계 원칙 중 하나라고 덧붙인다.
- ResourceQuota vs LimitRange(슬라이드 40): ResourceQuota=특정 Namespace의 클러스터 자원 독점 방지를 위해 Namespace 별로 사용할 수 있는 리소스의 "총량"을 제한. LimitRange=Pod, Container, PVC가 사용할 수 있는 자원의 "최소~최대 사용 범위"를 제한. 강사의 그림: dev-ns 네임스페이스에 Pod 두 개가 돌고 있고, 바깥의 초록 영역이 ResourceQuota(총량), 그 안의 각 Pod에 걸리는 범위 제한이 LimitRange. ResourceQuota 안에서 Pod가 쓸 수 있는 CPU·메모리를 한 번 더 잘라서 균등하게 배분하겠다는 뜻이며 "이게 리소스 쿼터, 이게 리밋레인지라고 이해하면 된다". (입문자 보충: ResourceQuota는 "이 방(네임스페이스)에서 쓸 수 있는 전기 총량", LimitRange는 "방 안의 기기 하나가 쓸 수 있는 전력의 최소·최대". 둘은 함께 쓸 수 있고 함께 쓰면 LimitRange가 각 Pod의 리소스를 채워 주고 ResourceQuota가 총량을 넘는 생성을 막는다.)
- LimitRange 구성(슬라이드 41): ① LimitRange 생성 시 컴퓨팅 리소스 요청이 없는 Pod에 대한 기본 requests, limits 적용 ② LimitRange 조건을 위반하는 리소스를 생성하거나 업데이트하는 경우 에러와 함께 요청 거부 ③ CPU, MEMORY에 제한 설정이 되면 Pod 생성 시 해당 리소스에 대한 request, limit 지정 필수. 앞 클립에서는 ResourceQuota가 있는 상태에서 리소스 없이 Pod를 만들면 에러가 났지만 LimitRange만 있을 때는 기본값이 설정된다(둘을 함께 쓰면 그 부분도 차단될 수 있으며, 이번 클립은 LimitRange만 놓고 설명). 제한 설정 목적은 ResourceQuota와 마찬가지로 제한 구성이므로 초과하면 차단된다.
- type은 Container, Pod, PersistentVolumeClaim(첫 글자 대문자 — 소문자로 쓰지 말라고 강조). PVC는 스토리지라 크게 제한할 것이 없고 최대·최소(max/min)만 정하면 되며 컨테이너 쪽이 설정 항목이 가장 많다. `default`=limit(기본 상한), `defaultRequest`=request(기본 요청량), `maxLimitRequestRatio`=request 대비 limit의 최대 비율(Limit/Request Ratio). (슬라이드 표에는 `defaultRequests`로 적혀 있으나 실제 YAML에서 쓰는 키는 `defaultRequest`.) 강사: 이 표(Type별 설정 항목)는 뒤에서 계속 참고하게 되므로 잘 봐 두라고 말한다.
- 강사 주의: 제약이 너무 심하거나 지나치게 구체적으로 설정하면 애플리케이션 동작에 영향을 줄 수 있으므로 여러 제한 사항이 걸릴 수 있다는 점을 주의해서 설정할 것. 네임스페이스 기준으로 ResourceQuota와 LimitRange를 설정해 자원 소비를 철저히 제어할 필요가 있다.
- ResourceQuota = "Namespace 전체 총량", LimitRange = "개별 Pod·Container·PVC 단위의 최소/최대/기본값".
- type 별로 사용 가능한 항목
  | type | 사용 가능 항목 |
  |---|---|
  | Container | default / defaultRequest / max / min / maxLimitRequestRatio |
  | Pod | max / min / maxLimitRequestRatio |
  | PersistentVolumeClaim | max / min (storage) |
- `default` = 기본 limit, `defaultRequest` = 기본 request, `maxLimitRequestRatio` = limit/request 최대 비율.
- LimitRange 는 이후 생성되는 Pod 에 적용된다. requests/limits 를 지정하지 않으면 default 값이 자동 주입되고, 일부만 지정하면 나머지만 default 로 채워진다(강사: "아무것도 주지 않았는데 설정이 됐다". requests만 준 pod-2에서는 지정한 값은 그대로 두고 지정하지 않은 쪽만 LimitRange가 채워 준다).
- limitr-1 필드 의미(강사): type Container=컨테이너 단위로 제한(첫 글자 대문자), max.cpu "2"=컨테이너 하나가 쓸 수 있는 CPU 최대치(2000 밀리코어), min.cpu "200m"=CPU 최소치 200 밀리코어, default(cpu 1 / memory 512Mi)=limit을 안 줬을 때 넣어 주는 기본 limit("이게 리미트"), defaultRequest(cpu 0.5 / memory 256Mi)=request를 안 줬을 때 넣어 주는 기본 request("이게 리퀘스트"). describe 표에서 cpu 행은 Min 200m / Max 2 / Default Request 500m / Default Limit 1, memory 행은 Default Request 256Mi / Default Limit 512Mi(memory의 Min·Max는 미지정이라 `-`). request는 스케줄러가 "이만큼은 보장해 달라"고 요청하는 양, limit은 "이 이상은 쓰지 못한다"는 상한.
- limitr-2 설명(강사): 기본 limit(default)과 기본 request(defaultRequest)를 둘 다 CPU 500m으로 주고, min·max로 컨테이너를 돌릴 수 있는 범위(100m~1000m 코어)를 정했다. "이 레인지에서 컨테이너를 돌리겠다"는 뜻. 슬라이드 describe 예시는 limitr-2 항목만 발췌한 것이며 같은 ns에 limitr-1이 이미 있어 `get` 결과에는 두 개(limitr-1, limitr-2)가 함께 나온다.
- limitr-3 설명(강사): PV가 아니라 PVC(PersistentVolumeClaim)에 스토리지의 최대·최소(1Gi~3Gi)를 넣었다. 앞의 표에서 PVC는 min/max밖에 없어서 그 부분만 들어가고, 이어서 컨테이너에 대한 설정(memory default 512Mi / defaultRequest 256Mi)도 함께 쓸 수 있다. (슬라이드의 describe 명령에는 `-n dev-ns`로 적혀 있으나 결과의 Namespace는 ops-ns로 표시됨 — 슬라이드 표기 그대로.)
- limitr-4 설명(강사): 샘플로 뽑은 예이며 Pod, 컨테이너, 볼륨(PVC)에 대한 제한을 종합적으로 구체적으로 잡을 수 있다. (슬라이드 하단이 화면 밖으로 잘려 PVC storage max 1Gi 뒤의 내용은 화면상 확인되지 않음.)
- (※ "LimitRange는 이미 떠 있는 Pod에 소급되지 않는다"는 것은 원본 자료에 명시되지 않은 일반 동작 설명이다.)

### [사용한 CLI]

**3-1. limitr-1 (Container: cpu max/min, 기본값)**
```yaml
# limitr-1.yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: limitr-1
  namespace: ops-ns
spec:
  limits:
  - type: Container
    max:
      cpu: "2"
    min:
      cpu: "200m"
    default:
      cpu: 1
      memory: 512Mi
    defaultRequest:
      cpu: 0.5
      memory: 256Mi
```
```bash
vi limitr-1.yaml
kubectl apply -f limitr-1.yaml                    # limitrange/limitr-1 created
kubectl describe limitranges -n ops-ns
# Container cpu    Min 200m / Max 2 / Default Request 500m / Default Limit 1
# Container memory Default Request 256Mi / Default Limit 512Mi
kubectl get limitranges -n ops-ns
```

**3-2. 리소스 미지정 Pod → default 자동 적용**
```yaml
# limitr-1-pod-1.yaml
apiVersion: v1
kind: Pod
metadata:
  name: limitr-1-pod-1
  namespace: ops-ns
spec:
  containers:
  - name: container
    image: nginx
```
```bash
vi limitr-1-pod-1.yaml
kubectl apply -f limitr-1-pod-1.yaml
kubectl get po -n ops-ns limitr-1-pod-1 -o yaml
#   resources:
#     limits:   {cpu: "1",   memory: 512Mi}
#     requests: {cpu: 500m,  memory: 256Mi}
```

**3-3. requests 만 지정한 Pod → limits 는 default 로 보완**
```yaml
# limitr-1-pod-2.yaml
apiVersion: v1
kind: Pod
metadata:
  name: limitr-1-pod-2
  namespace: ops-ns
spec:
  containers:
  - name: container
    image: nginx
    resources:
      requests:
        cpu: 1
        memory: "128Mi"
```
```bash
vi limitr-1-pod-2.yaml
kubectl apply -f limitr-1-pod-2.yaml
kubectl get po -n ops-ns limitr-1-pod-2 -o yaml
#   limits:   cpu "1", memory 512Mi    (LimitRange default)
#   requests: cpu "1", memory 128Mi    (직접 지정)
```

**3-4. limitr-2 (CPU default/defaultRequest/max/min)**
```yaml
# limitr-2.yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: limitr-2
  namespace: ops-ns
spec:
  limits:
  - default:            # default limits
      cpu: 500m
    defaultRequest:     # default requests
      cpu: 500m
    max:                # max and min define the limit range
      cpu: "1"
    min:
      cpu: 100m
    type: Container
```
```bash
vi limitr-2.yaml
kubectl apply -f limitr-2.yaml
kubectl get limitranges -n ops-ns
kubectl describe limitranges -n ops-ns
```

**3-5. limitr-3 (PVC 용량 범위 + Container memory 기본값)**
```yaml
# limitr-3.yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: limitr-3
  namespace: ops-ns
spec:
  limits:
  - type: PersistentVolumeClaim
    max:
      storage: 3Gi
    min:
      storage: 1Gi
  - type: Container
    default:
      memory: 512Mi
    defaultRequest:
      memory: 256Mi
```
```bash
kubectl describe limitranges -n dev-ns   # 슬라이드 표기 그대로(결과의 Namespace는 ops-ns). 실습 환경에서는 -n ops-ns
# PersistentVolumeClaim storage  Min 1Gi / Max 3Gi
# Container memory  Default Request 256Mi / Default Limit 512Mi
```

**3-6. limitr-4 (Pod / Container / PVC 종합)**
```yaml
# limitr-4.yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: limitr-4
  namespace: ops-ns
spec:
  limits:
  - type: Pod
    min:
      cpu: 500m
      memory: 500Mi
    max:
      cpu: 1
      memory: 1Gi
  - type: Container
    defaultRequest:
      cpu: 100m
      memory: 10Mi
    default:
      cpu: 200m
      memory: 100Mi
    min:
      cpu: 50m
      memory: 5Mi
    max:
      cpu: 1
      memory: 1Gi
    maxLimitRequestRatio:
      cpu: 4
      memory: 4
  - type: PersistentVolumeClaim
    min:
      storage: 10Mi
    max:
      storage: 1Gi
```

### [확인 방법/주의점]
- `kubectl describe limitranges -n <ns>` 로 Min/Max/Default Request/Default Limit/Max Limit-Request Ratio 확인.
- 기본값이 실제로 주입됐는지는 `kubectl get po <pod> -n <ns> -o yaml` 의 `resources` 로 확인(describe 에서도 확인 가능).
- LimitRange 는 해당 Namespace(YAML의 metadata.namespace)에만 적용된다.
- 자료의 limitr-2·3·4 는 같은 ns(ops-ns)에 여러 LimitRange 를 만드는 예시(강사 설명에서는 서로 충돌 여부를 따로 언급하지 않았다). 한 ns에 여러 LimitRange를 만들면 값이 서로 겹칠 수 있으므로 실제로는 하나로 정리하는 것이 안전하다. (정정: 이전 문서의 "자료에서도 limitr-4의 PVC max가 limitr-3과 달라 혼동될 수 있음을 언급"은 원본 PDF에서 확인되지 않아 삭제함 — limitr-3 PVC는 1Gi~3Gi, limitr-4 PVC는 10Mi~1Gi로 값만 서로 다름.)
- 강사 주의: 제약을 너무 심하거나 지나치게 구체적으로 걸면 애플리케이션 동작에 영향을 줄 수 있다.
- 확인: `kubectl get limitranges -n ops-ns`(CREATED AT 확인), `kubectl describe limitranges -n ops-ns`(Type/Resource/Min/Max/Default Request/Default Limit/Max Limit/Request Ratio 표), `kubectl get po -n ops-ns limitr-1-pod-1 -o yaml`(resources 항목에 자동 주입 확인; 같은 화면에서 describe 결과와 나란히 비교).
- ResourceQuota(총량) + LimitRange(개별 범위/기본값)를 함께 쓰면 quota 의 "must specify" 오류를 피하면서 총량을 제어할 수 있다.

---

## Step 4. 인증/인가 개념과 ServiceAccount·RBAC 기본 (CH11-01)

### [목적]
- Kubernetes API 접근 통제 흐름(Authentication → Authorization → Admission Control)과 RBAC 구성요소를 이해하고, ServiceAccount 를 Pod 에 연결해 API 호출 권한을 부여/검증한다.

### [이론 설명]
> 이 Step은 PDF 원본(CH11-01, 18쪽 전체)의 한글 본문·강사 설명을 직접 확인해 보강했다. 챕터 11 구성: 01 기본 보안 개념(RBAC & serviceaccount) / 02 Role·ClusterRole·RoleBinding·ClusterRoleBinding 실습 / 03 NetworkPolicy 실습.

- 챕터 소개(강사): Kubernetes도 일종의 분산 클러스터 시스템이고 모든 시스템에는 가장 기초적인 보안인 아이디/패스워드(계정)가 있다는 말로 시작한다. 이번 챕터는 "가장 기초적인 보안 구성"이며, 커널 수준·모니터링·디버깅·감사 같은 더 심화된 보안은 CKS 자격증 수준의 주제이고 CKS는 CKA 자격증이 없으면 응시할 수 없다고 덧붙인다. 핵심 키워드: User Account / Service Account, 권한을 주는 RBAC(Role Based Access Control, 역할 기반 접근 제어), Role은 네임스페이스 기준·ClusterRole은 클러스터 전역, Binding은 권한을 계정에 "연결"하는 것(권한 목록은 verbs 등으로 설정), NetworkPolicy는 네임스페이스 기준으로 트래픽을 허용/차단(IP 테이블 규칙과 비슷한 개념, CNI의 Calico 같은 network plugin으로 구현).
- 접근 제어 흐름(슬라이드 아키텍처 그림): 사용자가 kubectl이나 Dashboard로 명령을 던지면 컨트롤 플레인의 핵심인 API 서버(REST API)로 전달된다. 말풍선: 0) TLS 암호화로 전달 apiserver에 도달하면 → 1) Authentication check → 2) Authorization check → 3) Admission controller. 강사: "우리가 이야기하는 가장 기본적인 보안이 바로 이 부분".
- Authentication(AuthN, 인증)=요청자가 Kubernetes 사용자인지 검증("Kubernetes에 등록된 사용자가 맞는가?"). Authorization(AuthZ, 인가)=요청자가 요청한 기능에 대한 권한을 가지고 있는지 검증(들어온 사용자가 아무 데나 돌아다닐 수 없도록 특정 영역의 특정 업무만 하게 제한. 예: Pod를 만들려면 create 권한, 조회하려면 get/list 권한 필요). Admission Control(승인 제어 시스템)=요청을 확인하고 수정할 수 있고 요청을 최종 거부하거나 수락할 수 있다(인증·인가를 통과한 요청을 유효성 검사 등을 거쳐 최종 승인/거부). 강사: "AuthN과 AuthZ를 통해 승인 여부를 정하는 것은 모든 시스템에 공통적인 내용".
- 네트워크 정책(슬라이드 말미): 서로 다른 네임스페이스 간 Pod들의 연결 규칙, ingress rule을 정의하며 이때 쓰는 도구가 calico 같은 network plugin. 같은 네임스페이스 안이라도 "프런트엔드는 백엔드하고만 통신"하도록 송·수신 규칙을 정하거나 프런트엔드 → 백엔드 → DB 연결만 유효하게 하는 예. 이 내용은 11장 세 번째 클립에서 다룬다.
- TLS와 3개 module(슬라이드): network를 통해 API 서버에 도달하는 요청은 TLS로 암호화. SSL 인증서 구성은 `kubeadm init` 시 자동으로 구성된다(2장에서 Kubernetes를 구축할 때 kubeadm init으로 초기화하면서 인증서 파일들이 만들어진 것). ① authentication module: 인증에 실패하면 요청 거부, 성공하면 권한 부여(② 단계)로 전달 ② authorization module: 기존 정책과 비교 검증하거나 사용자가 요청 작업을 수행할 권한이 있는 경우 사용을 허가 ③ admission controller system module: 생성 중인 객체의 실제 내용을 확인하고 요청을 승인하기 전에 유효성 검사.
- ServiceAccounts와 Users는 모두 인증(AuthN) 및 권한(AuthZ) 부여에 사용되는 엔터티지만 서로 다른 용도로 사용된다. RBAC 정책을 ServiceAccounts와 User 모두에 적용해 클러스터 내 리소스에 대한 액세스를 제어할 수 있다. 강사는 두 계정을 반드시 구분하라고 강조한다.
- ABAC vs RBAC(강사): 예전에는 ABAC(Attribute Based Access Control, 속성 기반)도 있었고 지금도 쓸 수는 있지만 대부분 Role 기반(RBAC)으로 넘어왔다. RBAC에서는 항상 최소 권한의 원칙(POLP, Principle of Least Privilege)을 지켜야 한다. 슬라이드: "API 서버에 임의의 사용자의 요청을 차단하기 위해 API 요청을 승인하기 위해서는 Role 기반의 인증 작업 요구". RBAC 예: Pod(특정 Pod에 대한 액세스를 제한하거나 사용자가 수명 주기를 관리하도록 허용) / Deployment(배포 관리에 대한 액세스 권한을 부여해 승인된 사용자만 변경할 수 있도록 허용) / Service(특정 사용자가 서비스를 생성, 업데이트 또는 삭제할 수 있도록 허용) — 강사는 이 모든 것을 "접근 제어"라고 표현한다.
- Role과 RoleBinding 그림: RoleBinding dev(user ↔ Role)와 Role dev(Pod: get, list, watch, delete, create…, Service: get, list, watch). 사용자(user)는 Kubernetes에 접근하는 외부 엔터티이고 Role(권한)을 User에게 RoleBinding을 통해 권한 부여. User와 Role을 연결해 주는 것이 곧 Binding. ServiceAccount의 경우는 주로 Kubernetes 내에서 실행되는 워크로드(Pod)에 사용하며 Role(권한)을 ServiceAccount에게 RoleBinding을 통해 부여(Pod 안에 미리 만들어 둔 ServiceAccount를 넣어 주면 그 ServiceAccount에 연결된 권한으로 Pod가 동작). Role/RoleBinding과 ClusterRole/ClusterRoleBinding은 범주(scope)만 다를 뿐 사용법은 같다.
- RBAC model 그림(슬라이드 13): RoleBinding(dev-admins)이 group(dev-admins), ClusterRole(admin), Namespace(dev)와 연결되고 그룹 아래에 Certificate(CN=ksz/etc/aug, O=dev-admins)를 가진 user들이 속한다. 강사: "유저든 서비스 어카운트든 바인딩하는 작업은 같고, 롤을 만들어 권한 부여 / 클러스터롤을 만들어 권한 부여 / 바인딩하는 개념은 범주만 다를 뿐 사용법은 거의 같다". 실제로는 User보다 ServiceAccount 기반 워크로드 제어를 훨씬 더 많이 쓴다.
- ServiceAccount vs User 비교표(슬라이드 12): 목적 — SA는 주로 클러스터 내에서 실행되는 애플리케이션 및 워크로드를 위한 것 / User는 일반적으로 클러스터와 상호 작용하는 외부 엔터티. 범주 — SA는 특정 Namespace로 범위가 지정(애플리케이션 식별, 인증, 인가를 위한 계정) / User는 클러스터 전체 또는 Namespace별 역할 및 권한을 가짐. 사례 — SA는 Kubernetes에서 동작하는 애플리케이션(Pod 등) 및 서비스 등의 워크로드에 사용 / User는 kubectl을 통해 클러스터에서 작업을 인증하고 수행해야 하는 외부 엔터티 또는 클러스터 외부에 있는 애플리케이션에 사용.
- 정리(강사): Role/ClusterRole = "무엇을 할 수 있는가(권한 목록)", RoleBinding/ClusterRoleBinding = "누구에게 줄 것인가(연결)". Role·RoleBinding은 네임스페이스 범위, ClusterRole·ClusterRoleBinding은 클러스터 범위. 구체적인 Role/RoleBinding/ClusterRole/ClusterRoleBinding 실습은 다음 클립(Step 5). 접근 제어를 구체적으로 이해하려면 RBAC를 더 깊이 공부해야 한다고 강사는 말한다.
- API 요청 처리 단계: TLS 통신(kubeadm init 시 인증서 자동 생성) → ① Authentication(누구인가) → ② Authorization(무엇을 할 수 있는가) → ③ Admission Control(요청 검증/변경). 별도로 Pod 간 통신 제어는 NetworkPolicy(Calico 같은 CNI 필요).
- 주체(subject)
  - ServiceAccount: Pod/애플리케이션이 API Server 에 접근할 때 쓰는 계정. Namespace 에 속하며 Pod spec 의 `serviceAccountName` 으로 지정.
  - User: 사람(관리자/개발자). kubectl 사용자, 인증서(CN/O) 등으로 인증. Kubernetes 오브젝트로 존재하지 않음.
- RBAC(Role Based Access Control): 역할 기반 권한. ABAC(속성 기반)가 아니라 RBAC 사용. 최소 권한 원칙(POLP) 지향.
- RBAC 4개 오브젝트
  | 오브젝트 | 범위 | 설명 |
  |---|---|---|
  | Role | Namespace | ns 내 권한(verbs + resources) 정의 |
  | ClusterRole | 클러스터 전체 | 클러스터 범위 리소스/전체 ns 권한 정의 |
  | RoleBinding | Namespace | Role 을 User/ServiceAccount 에 연결 |
  | ClusterRoleBinding | 클러스터 전체 | ClusterRole 을 subject 에 연결 |
- Role/ClusterRole = "무엇을 할 수 있는가(권한 정의)", RoleBinding/ClusterRoleBinding = "누구에게 줄 것인가(연결)".
- Pod 에는 ServiceAccount 정보가 `/var/run/secrets/kubernetes.io/serviceaccount` 에 마운트된다: `ca.crt`, `namespace`, `token` (describe 시 Projected 볼륨). 직접 마운트한 적이 없는데도 describe의 Mounts에 잡히며(Volumes 타입 Projected = 여러 소스의 데이터를 주입한 볼륨), ServiceAccount는 기본적으로 인증서(ca.crt)와 토큰(token)을 사용한다. token은 API 서버와 통신할 수 있는 인증값이고 `cat token`을 해 보면 일반적인 Bearer 토큰. 권한이 없으면 API 호출은 403 Forbidden(토큰으로 인증은 되었지만 권한 부여를 하지 않았기 때문. 에러 메시지의 `system:serviceaccount:dev-ns:dev-sa`가 이 SA의 사용자 이름 형식).
- 기본 클러스터 역할 `cluster-admin`: Kubernetes 설치 시 기본으로 들어 있는 전역(관리자) 권한으로 모든 리소스(`*.*`)에 모든 verb(`*`) 허용(Labels: kubernetes.io/bootstrapping=rbac-defaults). Dashboard로 전역 관리를 하려면 적합한 권한이 필요하고 그 권한이 내장 ClusterRole cluster-admin이다.
- Dashboard 예시(강사): 4장에서 설치한 Dashboard의 네임스페이스 kubernetes-dashboard(설치하면 자동으로 생기는 ns)에 admin-user ServiceAccount를 만들고 이미 존재하는 최고 권한 ClusterRole cluster-admin을 ClusterRoleBinding으로 연결. ClusterRoleBinding의 subjects(주체)가 "누구에게"이고 roleRef가 "어떤 권한을". "처음에는 복잡해 보이지만 아주 단순한 구조이니 헷갈리면 그림으로 그려 보라"고 조언한다. 이 YAML을 적용한 뒤 Dashboard에 토큰으로 접속했던 것이 4장 내용이며, `kubectl create token`은 해당 ServiceAccount용 토큰을 발급하는 명령이다. 지금까지 kubectl 중심으로 배웠으니 충분히 익숙해진 다음 Dashboard를 쓰면 훨씬 편하다고 덧붙인다.

### [사용한 CLI]

**4-1. 클러스터 역할 확인 (Dashboard 예시: cluster-admin 권한)**
```bash
kubectl get pod -A                             # kubernetes-dashboard ns 의 dashboard 가 떠 있는지 확인
kubectl get clusterrole cluster-admin
kubectl describe clusterrole cluster-admin     # PolicyRule: *.* / [*] / Verbs [*]
```

**4-2. Dashboard 용 admin-user ServiceAccount + ClusterRoleBinding**
```bash
mkdir dashboard_rbac && cd $_
vi dashboard-admin-user.yaml
vi ClusterRoleBinding-admin-user.yml
```
```yaml
# dashboard-admin-user.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: admin-user
  namespace: kubernetes-dashboard
```
```yaml
# ClusterRoleBinding-admin-user.yml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: admin-user
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: admin-user
  namespace: kubernetes-dashboard
```
```bash
kubectl apply -f dashboard-admin-user.yaml            # serviceaccount/admin-user created
kubectl apply -f ClusterRoleBinding-admin-user.yml    # clusterrolebinding.../admin-user created
kubectl -n kubernetes-dashboard get sa
kubectl -n kubernetes-dashboard create token admin-user      # 로그인용 토큰 발급

# 토큰 발급 명령을 alias 로 등록
alias dtoken='kubectl create token -n kubernetes-dashboard admin-user'
vi ~/.bashrc          # alias 추가 후
. ~/.bashrc
```

**4-3. ServiceAccount 생성과 Deployment 연결 (LAB)**
```bash
kubectl create ns dev-ns
kubectl create serviceaccount -n dev-ns dev-sa        # sa 는 serviceaccount 의 약어
kubectl get -n dev-ns sa                               # default, dev-sa
kubectl get sa -n dev-ns dev-sa -o yaml

cd LABs/ ; mkdir sa && cd $_
kubectl -n dev-ns create deployment sa-test-deploy --image=nginx --port=80 --dry-run=client -o yaml > sa-test-deploy.yaml
vi sa-test-deploy.yaml      # metadata.namespace: dev-ns 추가, Pod spec 에 serviceAccountName: dev-sa 추가
kubectl apply -f sa-test-deploy.yaml
kubectl -n dev-ns get po -o wide
```
- 수정 포인트(자료 설명): Deployment YAML 의 metadata 에 `namespace: dev-ns`, Pod 템플릿 `spec` 에 `serviceAccountName: dev-sa`.

**4-4. Pod 안에서 ServiceAccount 마운트 확인**
```bash
kubectl -n dev-ns describe pod <pod-name>       # Mounts: /var/run/secrets/kubernetes.io/serviceaccount, Volumes: Projected
kubectl -n dev-ns exec -it <pod-name> -- bash
ls -l /var/run/secrets/kubernetes.io/serviceaccount     # ca.crt, namespace, token

# 실습 화면의 실제 Pod 이름 예
kubectl -n dev-ns exec -it sa-test-deploy-5585bb48b5-vhgkq -- bash
cd /var/run/secrets/kubernetes.io/serviceaccount
ls -al                                                  # ..data 심볼릭 링크 구조 확인
cat token                                               # 일반적인 Bearer 토큰(긴 문자열, 값 생략)
```

**4-5. 권한 없이 API 호출 → 403 Forbidden**
```bash
cd /var/run/secrets/kubernetes.io/serviceaccount
TOKEN=$(cat token)
curl -X GET https://$KUBERNETES_SERVICE_HOST/api/v1/namespaces/dev-ns/pods \
     --header "Authorization: Bearer $TOKEN" --insecure
# "pods is forbidden: User \"system:serviceaccount:dev-ns:dev-sa\" cannot list resource \"pods\" ...", "code": 403
```
- `--insecure`: 서버 인증서 검증 생략. nginx 이미지에는 vi 가 없어 YAML 은 마스터에서 작성(`vi: command not found` / exit code 127).

**4-6. Role + RoleBinding 부여 후 재호출**
```yaml
# dev-sa-role.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: sa-test-role
  namespace: dev-ns
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "watch", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: sa-test-rolebinding
  namespace: dev-ns
subjects:
  - kind: ServiceAccount
    name: dev-sa
    namespace: dev-ns
roleRef:
  kind: Role
  name: sa-test-role
  apiGroup: rbac.authorization.k8s.io
```
```bash
vi dev-sa-role.yaml
kubectl apply -f dev-sa-role.yaml
# role.rbac.authorization.k8s.io/sa-test-role created
# rolebinding.rbac.authorization.k8s.io/sa-test-rolebinding created
kubectl get role -n dev-ns sa-test-role
kubectl describe role -n dev-ns sa-test-role     # pods [get watch list]
kubectl get role -n dev-ns sa-test-role -o yaml  # rules: apiGroups [""], resources [pods], verbs [get, watch, list]

# Pod 안에서 동일 curl 재실행 -> "kind": "PodList" 응답 (성공)
kubectl -n dev-ns exec -it <pod-name> -- bash
TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
curl -X GET https://$KUBERNETES_SERVICE_HOST/api/v1/namespaces/dev-ns/pods \
     --header "Authorization: Bearer $TOKEN" --insecure
```
- Role 필드(강사): `kind: Role, name: sa-test-role, namespace: dev-ns` = 권한 묶음의 이름과 그 권한이 유효한 네임스페이스 영역. `apiGroups: [""]` = API 버전(그룹)에 관한 항목으로 비어 있으면 core v1 그룹(Pod, Service는 v1이라 빈 값), Deployment는 apps 그룹(apps/v1)이므로 Deployment를 다룰 때는 여기에 `apps`를 넣는다. `resources: ["pods"]` = 권한의 대상 리소스. `verbs` get(특정 대상 하나를 조회) / list(더 넓은 범위, 전체 목록 조회) / watch(삭제·변경 같은 변화를 관찰) — 조회가 목적이므로 이 세 가지를 부여. RoleBinding의 `subjects` = 권한을 받을 대상(kind ServiceAccount, name dev-sa, namespace dev-ns), `roleRef` = 연결할 Role(kind Role, name sa-test-role, apiGroup rbac.authorization.k8s.io).
- 실습 흐름 정리(강사): ServiceAccount 생성 → Pod에 serviceAccountName 지정 → Pod 안 토큰으로 인증(AuthN) → Role 없음: 403 → Role + RoleBinding으로 권한(AuthZ) 부여 → 같은 요청이 성공(get 수행). "서비스 어카운트의 인증, 그리고 Role을 통한 Binding·인가"를 통틀어 접근 제어라고 부른다.
- 실습 팁: 네임스페이스를 만들면 그 안에 `default` ServiceAccount가 자동으로 생긴다(`get sa -n dev-ns`에 default와 dev-sa가 함께 조회). `sa`는 serviceaccount의 short name. namespace는 Deployment의 metadata에, serviceAccountName은 Pod 템플릿 spec(컨테이너 spec과 같은 레벨)에 추가한다. 화면의 Pod 이름(5zdsq / vhgkq)이 슬라이드와 실제 실습에서 다른 것은 생성된 이름이 달라서이며 명령 구조는 같다.
- 오류 해결(강사 화면): ① Pod(nginx 컨테이너) 안에서 `vi dev-sa-role.yaml` 시도 → `bash: vi: command not found`, exit 후 `command terminated with exit code 127` → YAML 작성은 master 노드에서 한다. ② 첫 `kubectl apply -f sa-test-deploy.yaml`에서 `Unable to connect to the server: net/http: request canceled (Client.Timeout exceeded while awaiting headers)` → 같은 명령을 다시 실행하자 `deployment.apps/sa-test-deploy created`로 성공(일시적 오류).

### [확인 방법/주의점]
- 권한 부여 전 403 → Role/RoleBinding 적용 후 PodList 응답으로 인가(AuthZ)가 동작함을 확인.
- Pod 의 SA 는 Pod 생성 시 `serviceAccountName` 으로 지정(지정하지 않으면 ns 의 default SA). 이미 떠 있는 Pod 의 SA 를 바꾸려면 재배포가 필요(자료에서는 Deployment YAML 수정 후 apply).
- 이전 apply 에서 `Unable to connect ... Client.Timeout exceeded` 가 발생했으나 재실행으로 성공(일시적 오류).
- ClusterRoleBinding 의 `subjects` = "누구에게", `roleRef` = "어떤 역할을".
- 최소 권한 원칙: 필요한 resources/verbs 만 부여.

---

## Step 5. Role / ClusterRole / RoleBinding / ClusterRoleBinding 구성 실습 (CH11-02)

### [목적]
- User 와 ServiceAccount 에 대해 Namespace 범위(Role+RoleBinding) 및 클러스터 범위(ClusterRole+ClusterRoleBinding) 권한을 CLI 로 만들고 `kubectl auth can-i` 로 검증한다.

### [이론 설명]
> 이 Step은 PDF 원본(CH11-02, 14쪽 전체)의 한글 본문·강사 설명을 직접 확인해 보강했다.

- RBAC 개념(슬라이드 25, 강사): 쿠버네티스의 모든 리소스는 모델링된 API 개체(API 오브젝트)이므로 create, get, update, edit, watch, exec 같은 CRUD 작업으로 수정할 수 있고, RBAC는 이 작업(verb)을 규칙으로 묶어 사용자나 ServiceAccount가 할 수 있는 일을 제한한다. RBAC는 규칙 또는 하나 이상의 작업 집합이 개체에 작용하도록 구성하며 Namespace, API 그룹, 개체 및 작업의 일부 조합처럼 세분화된 방식으로 구성한다. 하나 이상의 규칙을 사용자, 서비스 계정, 그룹 등의 주체(subject)에 바인딩할 수 있다. 사용자는 사람이 아닌 프로세스일 수도 있으며 Kubernetes 클러스터에 의해 제어되지 않고(클러스터는 사용자를 관리하지 않으며 대신 운영 체제가 사용자를 처리), ServiceAccount는 Pod에서 실행되는 클러스터 내 프로세스를 위한 것으로 Namespace 계정이기도 하다. 그룹은 사용자 그룹에 규칙을 할당하는 데 사용한다.
- 강사 포인트: 최소 권한의 원칙을 강조한다 — "파드에 대해 생성만 해라 / 조회만 해라 / 삭제만 해라"처럼 동작 단위로 통제할 수 있고, 결국 "어떤 API 오브젝트에 대해 무엇을 할 수 있는가" 두 가지만 생각하면 된다. 지금 수업에서는 Ubuntu의 student 계정으로 작업하며 그 계정에 쿠버네티스 권한을 따로 준 적이 없다는 점도 짚는다(사용자(user)는 쿠버네티스가 관리하지 않고 접근 방법(계정)에 따라 달라짐). 서비스 계정은 Pod 안에서 동작하는 프로그램을 위한 Namespace 수준의 계정이며, 만들 때 Namespace를 지정하지 않으면 default Namespace에 들어간다.
- Role vs ClusterRole(슬라이드 26): Role은 단일 Namespace 내에서 할당할 수 있는 규칙 모음(확인: `kubectl api-resources --namespaced=true`). ClusterRole은 모든 Namespace에서 규칙을 유효하게 사용 가능한 규칙 모음으로 `--namespaced=false` 및 true를 포함하며, Namespace에 속하지 않는 전역적인 Kubernetes object(node, pv 등)도 포함한다. Namespace에 속하는 오브젝트(예: Pod)와 속하지 않는 클러스터 수준 오브젝트(예: node, PV, StorageClass)는 다르므로 권한을 줄 때 오브젝트가 어느 범주인지 가늠해야 한다. Pod는 Namespace 수준이라 Role과 ClusterRole 모두 Pod 권한을 줄 수 있으며 차이는 범위(어떤 Namespace냐, 전체 클러스터냐)뿐이다. Role을 subject와 연결하려면 하나 또는 모든 Namespace에 바인딩되는 RoleBinding 또는 ClusterRoleBinding을 사용한다.
- RoleBinding(슬라이드 27): Role과 ServiceAccount를 연결해 주는 역할. 하나의 Role에 연결 가능하고 ServiceAccount는 다수 Binding 가능. RoleBinding에 연결된 ServiceAccount들은 연결된 Role의 권한을 갖게 되어 API 서버에 접근 가능 → Role 생성과 ServiceAccount에 권한 부여는 반드시 Binding으로 설정. Namespace 내부의 Role, RoleBinding 구성 시 token 생성, Token을 통해 외부에서 API 서버 접근 가능(단, namespace 안에서 인가된 권한만 사용 가능). 강사는 "서비스 계정 – 롤 – 그다음에 바인딩" 세 요소로 기억하라고 한다(예: Pod에 get 권한만 준 계정이 삭제·업데이트·생성을 시도하면 당연히 거부). 권한 부여는 Role을 만드는 것만으로 끝나지 않고 Binding으로 연결해야 완성된다.
- ClusterRoleBinding(슬라이드 28): ServiceAccount가 클러스터 범위의 리소스(node, pv, namespace 등)에 접근 가능. namespace에 속해 있는 ServiceAccount를 연결하면 ServiceAccount는 클러스터 안에 있는 resources에 접근할 수 있게 함. ClusterRole은 ClusterRoleBinding 또는 RoleBinding과 연결도 가능(같은 ClusterRole이라도 RoleBinding으로 묶으면 그 Namespace 안에서만, ClusterRoleBinding으로 묶으면 모든 Namespace에서 권한 적용). 강사: "ClusterRole인데 왜 RoleBinding을 쓰나요?"에 "둘 다 가능"이라고 답하며 "ClusterRole이냐 Role이냐, 그 차이만 기억하라"고 정리.
- verb & resources(슬라이드 29): create(개체 생성), get(개별 리소스 목록 확인, 특정 Pod처럼 개별 리소스 조회), list(전체 리소스 목록 확인), watch(실시간 리소스 업데이트 확인. 단, get or list와 함께 사용 / 업데이트·삭제 시 변화 정보를 이어서 받아 보는 verb), update(기존 리소스 중 전체 업데이트), patch(기존 리소스 중 일부 업데이트, update와 비교해서 기억), delete(삭제). resources 예: pods, secrets, deployments, daemonsets, statefulsets 등. 규칙은 결국 "어떤 resources에 어떤 verb를 허용하는가"로 정의된다.
- RBAC 은 "어떤 리소스(resources)에 어떤 행위(verb)를 허용하는가"를 정의한다.
- Role: Namespace 범위 리소스(`kubectl api-resources --namespaced=true`) / ClusterRole: Namespace 에 속하지 않는 리소스(node, pv 등, `--namespaced=false`) 및 전체 ns 대상 권한.
- 조합
  - Role + RoleBinding → 해당 ns 에서만 유효.
  - ClusterRole + ClusterRoleBinding → 모든 ns + 클러스터 리소스에 유효.
  - ClusterRole + RoleBinding → ClusterRole 을 재사용하되 RoleBinding 이 속한 ns 로 범위가 제한됨.
- verb 목록
  | verb | 의미 |
  |---|---|
  | create | 생성 |
  | get | 단건 조회 |
  | list | 목록 조회 |
  | watch | 변경 사항 실시간 감시 |
  | update | 수정(전체 갱신) |
  | patch | 일부 수정 |
  | delete | 삭제 |
  - 주의(정정): 슬라이드에는 "watch: 실시간 리소스 업데이트 확인. 단, get or list와 함께 사용"이라고 적혀 있다. 즉 watch는 get/list와 함께 부여해서 쓰는 verb이다(자료 표기 기준; get/list/watch는 서로 별개 verb로 각각 허용해야 해당 동작이 가능). update는 전체, patch는 일부 업데이트.
- 주요 resources: pods, secrets, deployments, daemonsets, statefulsets 등.

### [사용한 CLI]

**5-1. User 에게 Role 부여 (jupiter / saturn Namespace)**
```bash
kubectl create ns jupiter
kubectl create ns saturn

kubectl -n jupiter create role secret-manager --verb=get --resource=secrets
kubectl -n jupiter create rolebinding secret-manager --role=secret-manager --user=kevin

kubectl -n saturn create role secret-manager --verb=get,list --resource=secrets
kubectl -n saturn create rolebinding secret-manager --role=secret-manager --user=kevin

# 권한 검증 (--as: 해당 사용자로 가장)
kubectl -n jupiter auth can-i get secrets --as=kevin     # yes
kubectl -n jupiter auth can-i list secrets --as=kevin    # no
kubectl -n saturn  auth can-i get secrets --as=kevin     # yes
kubectl -n saturn  auth can-i list secrets --as=kevin    # yes
kubectl -n saturn  auth can-i watch secrets --as=kevin   # no
```

**5-2. User 에게 ClusterRole 부여 (ClusterRoleBinding vs RoleBinding)**
```bash
# 1) Deployment 삭제 권한을 가진 ClusterRole 생성
kubectl create clusterrole rm-deploy --verb=delete --resource=deployments

# 2) kevin: 모든 Namespace 에서 삭제 가능 (ClusterRoleBinding)
kubectl create clusterrolebinding rm-deploy --user=kevin --clusterrole=rm-deploy

# 3) jeff: platform-ns 에서만 삭제 가능 (같은 ClusterRole + RoleBinding)
kubectl create ns platform-ns
kubectl -n platform-ns create rolebinding rm-deploy --user=jeff --clusterrole=rm-deploy

# 4) 검증
kubectl auth can-i delete deployment --as=kevin                  # yes
kubectl auth can-i delete deployment --as=jeff                   # no
kubectl auth can-i -n platform-ns delete deployment --as=kevin   # yes
kubectl auth can-i -n platform-ns delete deployment --as=jeff    # yes
```

**5-3. 시나리오 A: Role + RoleBinding + ServiceAccount (branch-a-ns)**
```bash
kubectl create ns branch-a-ns
kubectl create ns branch-b-ns
kubectl -n branch-a-ns create serviceaccount get-pod-sa
kubectl get -n branch-a-ns sa

# Role: pods 에 대해 get,list,watch
kubectl -n branch-a-ns create role getpod-role --verb=get,list,watch --resource=pods
kubectl -n branch-a-ns get role
kubectl -n branch-a-ns describe role
kubectl -n branch-a-ns get role -o yaml

# RoleBinding: --serviceaccount=<Namespace>:<SA이름>
kubectl -n branch-a-ns create rolebinding getpod-rb --role=getpod-role --serviceaccount=branch-a-ns:get-pod-sa
kubectl -n branch-a-ns get rolebindings.rbac.authorization.k8s.io
kubectl -n branch-a-ns describe rolebindings.rbac.authorization.k8s.io
kubectl -n branch-a-ns get rolebindings.rbac.authorization.k8s.io -o yaml
```
```yaml
# get role -o yaml 의 rules / rolebinding -o yaml 의 roleRef, subjects
rules:
- apiGroups: [""]
  resources: [pods]
  verbs: [get, list, watch]
---
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: getpod-role
subjects:
- kind: ServiceAccount
  name: get-pod-sa
  namespace: branch-a-ns
```
```bash
# ServiceAccount 로 가장(--as system:serviceaccount:<ns>:<sa>) 하여 권한 검증
kubectl -n branch-a-ns run myblog --image=nginx
kubectl -n branch-a-ns get po
kubectl -n branch-a-ns get po --as system:serviceaccount:branch-a-ns:get-pod-sa      # 성공(조회 허용)
kubectl -n branch-a-ns run myblog2 --image=nginx --as system:serviceaccount:branch-a-ns:get-pod-sa
# Error from server (Forbidden): ... cannot create resource "pods" in API group "" in the namespace "branch-a-ns"
```

**5-4. 시나리오 B: ClusterRole + ClusterRoleBinding + ServiceAccount**
```bash
kubectl -n branch-a-ns create sa cluster-admin-sa

kubectl create clusterrole admin-cr --verb=create,get,list,update,patch,delete --resource=pods,deployments,daemonsets,services
kubectl describe clusterrole admin-cr
kubectl get clusterrole admin-cr -o yaml
# rules: apiGroups "" -> pods, services / apiGroups apps -> deployments, daemonsets

kubectl create clusterrolebinding admin-cr-bind --clusterrole=admin-cr --serviceaccount=branch-a-ns:cluster-admin-sa
kubectl describe clusterrolebindings.rbac.authorization.k8s.io admin-cr-bind

# 다른 Namespace(branch-b-ns)에서도 동작하는지 확인
kubectl -n branch-a-ns get po --as system:serviceaccount:branch-a-ns:cluster-admin-sa
kubectl -n branch-b-ns create deployment myblog-b --image=nginx --replicas=2
kubectl -n branch-b-ns get po --as system:serviceaccount:branch-a-ns:cluster-admin-sa    # 조회 가능
```

**5-5. 치트시트(자료 정리)**
```bash
kubectl -n <ns> create role <이름> --verb=get,list --resource=secrets
kubectl -n <ns> create rolebinding <이름> --role=<role> --user=kevin
kubectl -n <ns> create rolebinding <이름> --role=<role> --serviceaccount=<ns>:<sa>
kubectl create clusterrole <이름> --verb=... --resource=...
kubectl create clusterrolebinding <이름> --clusterrole=<cr> --serviceaccount=<ns>:<sa>
kubectl -n <ns> auth can-i <verb> <resource> --as=<user>        # yes / no
kubectl ... --as system:serviceaccount:<ns>:<sa>                  # SA 가장 (예: get po, run ...)
kubectl api-resources --namespaced=true                           # / --namespaced=false
```

### [확인 방법/주의점]
- 강사 설명(5-1): jupiter, saturn(행성 이름) 두 Namespace에 `secret-manager`라는 같은 이름의 Role을 서로 다른 권한(jupiter=get, saturn=get,list)으로 만들고 user kevin에 연결한다(이름 뒤에 rb를 붙여 RoleBinding임을 구분하는 경우도 있음). 같은 이름의 Role이라도 Namespace마다 별개이므로 jupiter와 saturn에서 결과가 다르다(jupiter: get yes / list no, saturn: get yes / list yes / watch no(준 적 없으므로)). `kubectl auth can-i`는 "이 작업을 할 수 있는가?"를 묻는 명령이고 `--as=kevin`을 붙이면 kevin 사용자의 권한으로 검사한다. 권한을 주지 않은 verb는 no로 나오므로 부여한 권한 그대로 적용되었음을 검증할 수 있다.
- 강사 설명(5-2, 슬라이드 31은 실행 없이 설명만): Deployment 삭제 권한만 가진 ClusterRole rm-deploy를 만들고 연결 방식에 따라 kevin(ClusterRoleBinding: 모든 Namespace에서 delete deployment yes)과 jeff(RoleBinding, platform-ns: platform-ns에서만 yes, 그 밖의 default 등에서는 no)의 범위가 달라진다. "ClusterRole인데 왜 RoleBinding을 쓰나요?"에 "둘 다 가능"하며 ClusterRole을 RoleBinding으로 묶으면 그 Namespace 수준에서만 권한을 행사.
- 강사 설명(실습 A/B): 실무에서 가장 많이 쓰이는 ServiceAccount(서비스 계정) 관리 실습이며 A 지사(branch-a-ns)와 B 지사(branch-b-ns) 두 Namespace를 비교한다. 첫 번째는 Role/RoleBinding, 두 번째는 ClusterRole/ClusterRoleBinding. `--serviceaccount` 값은 `<Namespace 이름>:<ServiceAccount 이름>`(예: branch-a-ns:get-pod-sa) 형식이며 ServiceAccount는 Namespace에 속한 계정이라 Namespace 이름을 앞에 쓰고 콜론으로 잇는다. Role은 Namespace 수준이므로 `-n branch-a-ns`를 붙이고, ClusterRole은 Namespace에 속하지 않으므로 명령에 `-n`이 없다. describe는 표 형태, `-o yaml`은 구조 그대로(roleRef=연결된 Role, subjects=연결 대상). YAML에서 apiGroups가 `""`인 것은 Pod의 apiVersion이 v1이라 API 그룹이 따로 없기 때문이며, Deployment·DaemonSet은 apps/v1이라 `apps`로 표시(describe 표에서는 `daemonsets.apps`, `deployments.apps`로 표시). 강사: "작업 후에는 반드시 조회해서 검증하는 습관을 버리지 말라", "러프하게 admin 권한을 주는 경우도 있지만, 업무적으로 규정된 권한만 세부적으로 부여하는 것이 가장 좋다".
- `--as` 옵션 사용 요령(강사): 현재 실습에서 쓰는 계정은 클러스터 관리자 권한이라 Pod를 만들고 조회하는 것이 당연히 가능하다. ServiceAccount 권한으로 명령을 실행하려면 `--as system:serviceaccount:<네임스페이스>:<서비스어카운트명>` 패턴을 쓴다(user는 `--as=kevin`). `--as`를 주지 않으면 관리자 권한으로 실행되어 항상 성공하므로 권한 검증이 되지 않는다. get/list/watch만 부여했으므로 `run myblog2 --as ...get-pod-sa`는 Forbidden(`pods is forbidden: User "system:serviceaccount:branch-a-ns:get-pod-sa" cannot create resource "pods" in API group "" in the namespace "branch-a-ns"`)이 나며 이것이 곧 권한 제어가 잘 동작한다는 증거.
- 시나리오 B 결과(강사): ClusterRoleBinding도 `--serviceaccount=<Namespace>:<이름>` 형식. branch-a-ns의 SA(cluster-admin-sa)가 branch-b-ns의 Pod까지 조회된다. Role/RoleBinding으로 만든 get-pod-sa는 자기 Namespace(branch-a-ns) 안에서만 권한을 갖던 것과 대비. 정리: 범위를 Namespace로 제한할 때는 Role + RoleBinding, 모든 Namespace로 지정할 때는 ClusterRole + ClusterRoleBinding. 같은 서비스 계정으로 branch-b-ns에서 Deployment·DaemonSet을 생성하는 것은 가능하겠지만 StatefulSet 같은 오브젝트는 이 ClusterRole의 리소스에 지정되어 있지 않으므로 생성이 불가능할 것이라고 강사가 말했다(시연하지 않은 부분이므로 "직접 테스트로 검증해 보고 넘어가라"고 당부).
- `kubectl auth can-i <verb> <resource> [-n ns] --as=<user>` → `yes` / `no`. 허용되지 않은 verb(list, watch 등)는 no.
- User 는 `--as=kevin`, ServiceAccount 는 `--as system:serviceaccount:<ns>:<sa>` 형식. 인자 형식 `--serviceaccount=<ns>:<sa>` 와 혼동하지 말 것.
- Role 은 `-n` 으로 지정한 ns 에서만 유효: jupiter 의 권한이 saturn 에 적용되지 않음.
- ClusterRole + RoleBinding 은 RoleBinding 의 ns 로 한정, ClusterRoleBinding 은 모든 ns 에 적용(kevin vs jeff 비교).
- 시나리오 B 에서 SA(cluster-admin-sa)는 branch-a-ns 소속이지만 ClusterRoleBinding 덕분에 branch-b-ns 의 Pod 도 조회 가능.
- YAML 에서 pods/services 는 apiGroups `""`, deployments/daemonsets 는 `apps`. StatefulSet 등 목록에 없는 리소스는 별도로 추가해야 권한이 생김.

---

## Step 6. NetworkPolicy — Pod 간 통신 제어 (CH11-03)

### [목적]
- Pod 단위 Ingress/Egress 트래픽을 Whitelist 방식으로 제어해 3-tier(프론트/백엔드/DB) 구조 등에서 필요한 통신만 허용한다.

### [이론 설명]
> 이 Step은 PDF 원본(CH11-03, 24쪽)의 한글 본문·강사 설명을 직접 확인해 보강했다(PDF는 영상 캡처+강사 음성 요약본 형식).

- 왜 필요한가(강사): 보안에서 흔히 쓰는 방식이 "규칙을 지정하는 것"이며 IP 테이블 규칙과 비슷한 개념을 쿠버네티스 수준에서 다루는 것이 NetworkPolicy. 3-tier 예 — 프론트엔드는 바깥에서 요청을 받아 "백엔드 네임스페이스로만" 전달, 백엔드는 프론트엔드와 DB 사이에서 프론트엔드로부터 받고 DB 쪽으로 전달, DB는 백엔드로부터만 받는다(프론트엔드는 DB에 접근할 수 없어야 함). 즉 "다른 것은 다 닫고, 딱 필요한 통신만 열어 주는" 작업이 필요하며 이 송수신 규칙을 정하는 오브젝트가 NetworkPolicy. 이 3-tier 정책은 영상 마지막에 과제로 제시된다.
- 쿠버네티스 공식 문서의 NetworkPolicy 샘플은 처음 보면 꽤 복잡하다(강사). 핵심은 Ingress(들어오는 트래픽)와 Egress(나가는 트래픽)이며 "전부 열기/전부 닫기"에서 출발해 네임스페이스 단위, 특정 애플리케이션 Pod 단위로 label로 식별해 "이건 열고 이건 닫는다"는 식으로 세분화한다.
- 정의(슬라이드 35): NetworkPolicy는 네트워크 트래픽이 흐르는 방식을 정의하는 규칙 집합. Pod 내부로 수신(Ingress)되거나 외부로 송신(Egress)되는 트래픽을 허용하고 거부하는 정책. 일반적으로 Pod와 Service 간의 통신을 제어하고 보호하는 데 사용. Whitelist 형식이라 명시해 놓은 목록 외에는 대상 Pod에 트래픽 전송 불가. 트래픽 제어는 네트워크 플러그인(CNI)으로 구현 → calico.
- 강사 설명: 기본 상태의 쿠버네티스는 모든 통신이 열려 있다. NetworkPolicy가 적용된 Pod는 명시한 목록만 허용하는 화이트리스트로 동작한다. NetworkPolicy는 "규칙의 집합"일 뿐이며 실제로 트래픽을 막고 여는 일은 calico 같은 CNI가 한다. (입문자 보충) NetworkPolicy 오브젝트를 만들어도 이를 지원하지 않는 CNI를 쓰면 정책이 적용되지 않을 수 있다.
- 정책 정의와 Why(슬라이드 36): source 및 target Pod의 IP 주소, 포트 및 프로토콜을 기반으로 규칙을 정의. 규칙은 label 기반의 트래픽을 선택(Pod, Namespace 구성). Namespace 또는 기타 속성을 기반으로 다양한 Pod 또는 서비스 간의 트래픽을 허용(Allow)하거나 차단(Deny). Why? 향상된 보안 제공 / 규정 준수 충족 / 리소스 최적화를 통한 성능 향상 기여 / Pod 간 트래픽 흐름 제한(격리)을 통해 문제 원인 파악과 빠른 문제 해결에 도움. 강사: Pod와 Namespace를 선택하려면 반드시 label이 지정되어 있어야 한다(Pod에 label을 붙이는 것은 쉽고, Namespace에도 label을 붙인다. 노드 셀렉터/테인트 톨러레이션에서 label을 다뤘다). 불필요한 접근을 차단하므로 리소스를 직접 제어하는 것은 아니지만 불필요한 사용을 어느 정도 줄일 수 있다.
- Namespace 수준(슬라이드 37): NetworkPolicy는 Namespace level의 트래픽 흐름 제어(그림: ns 안에 ing → svc → pod, rs/deploy/hpa, 오른쪽 아래 netpol, quota, limits 아이콘). 앞 챕터의 resourceQuota, limitRange도 namespace 수준이었지만 그것들은 "리소스"에 대한 제어/제한이고, NetworkPolicy는 "네트워크 트래픽 제어"를 담당한다.
- 슬라이드 38 주요 기능(강사 설명 순서): Ingress=Pod로 들어오는 네트워크 트래픽 제한(from), Egress=Pod에서 네트워크 트래픽을 내보내는 방법 제어(to), podSelector=NetworkPolicy가 적용될 Pod 선택, ingress.from.podSelector=수신을 허용하는 Pod의 label, policyTypes=적용될 트래픽 방향 설정(Ingress/Egress를 적지 않으면 all deny — 슬라이드 표기 그대로), namespaceSelector=서로 다른 ns 간에 있는 Pod 트래픽 흐름 제어, 송·수신 트래픽에 Protocol(TCP, UDP, SCTP) 및 Port 선택으로 승인된 트래픽만 허용.
- 샘플 YAML(test-network-policy) 항목별 강사 설명: Ingress(from)=들어오는(수신) 트래픽, 어디로부터/어느 IP 대역으로부터 받을지 정하고 특정 IP는 제외(except)할 수도 있다 / Egress(to)=나가는(송신) 트래픽, 누구에게/어느 IP 대역·포트로 보낼지 / podSelector=이 정책의 대상(target), 예제에서는 role: db 라벨이 붙은 Pod / ingress.from.podSelector="이 label의 Pod에서 들어오는 트래픽"만 받겠다는 뜻(예제: role: frontend) / policyTypes=Ingress, Egress 중 하나 또는 둘 다 지정 가능 / namespaceSelector=특정 namespace(예제: project: myproject label)에서 오는 트래픽 선택 / ports=원하는 프로토콜과 포트(예제: 수신 TCP 6379, 송신 TCP 5978). (입문자 보충) 슬라이드에는 "policyTypes를 적지 않으면 all deny"라고 적혀 있으나, 실제 쿠버네티스는 policyTypes를 생략하면 spec 내용을 보고 기본값을 채운다(항상 Ingress 포함, egress 규칙이 있으면 Egress도 포함). 중요한 것은 정책의 podSelector에 선택된 Pod는 명시된 규칙으로 허용된 트래픽 외에는 막힌다는 점.
- 여러 정책의 결합(슬라이드 39): 동시에 여러 정책을 생성하면 정책의 모든 규칙이 결합되어 적용된다. `[]`=모든 트래픽 거부, `{}`=모든 트래픽 허용(강사: 대괄호를 비우면 모두 거부, 중괄호를 넣으면 모두 허용 — 음성 인식에서는 대가로/중가로로 인식되어 있으나 화면 기준 `[ ]`/`{ }`). spec.ingress.from 하위 "-"의 의미: 하위 기능이 "-" 하나로 사용되면 AND 조건, 하위 기능이 각각 "-"로 사용되면 OR 조건. cachedb-allow-services 예제는 podSelector 3개 각각 앞에 "-"가 있어 OR 조건(셋 중 하나만 맞아도 허용). 만약 하나의 "-" 아래에 세 조건을 모두 넣으면 모두 만족해야 하는 AND 조건이 되는데, 강사는 이 예제에서는 그것이 말이 안 된다고 짚었다. 즉 "-"를 하나로 쓰느냐 각각 쓰느냐에 따라 AND/OR가 갈리므로 구분해서 써야 한다.
- 강사 주의/조언: NetworkPolicy 정책 작성은 설계자의 의도가 크게 반영된다. 기본 문법은 슬라이드 틀에서 크게 벗어나지 않으니 요구사항을 그대로 그 문법에 녹여 내면 된다. 정책을 너무 복잡하게 겹쳐 쓰면 트래픽 흐름에서 놓치는 부분이 생길 수 있으므로 목적별로 하나씩 반영하거나 "기본적으로 닫아 놓고 필요한 것만 열어 주는" 방식도 좋다.
- 정책 예시 4가지(슬라이드 40): ① Pod로 들어오는 모든 트래픽 거부와 허용 ② Pod의 Label을 통해 서비스에 대한 트래픽 제어 ③ Namespace 간의 트래픽 제한 ④ 특정 port에 대한 트래픽 제한. 강사: "기본적으로 화이트리스트라 다 열려 있는 상태에서 어느 시점부터 이 트래픽을 차단(또는 다시 허용)하는 정책을 만든다". 두 번째는 특정 namespace의 특정 Pod만 허용하는 정책, 세 번째는 namespace 간 제한, 네 번째 포트 제한은 "Pod가 포트를 두 개 열고 있을 때 하나만 허용". 이어서 LAB 6가지(netpol-1~6)를 실습한다.
- (실습 테스트 공통, 강사) 테스트용 임시 Pod는 alpine 리눅스로 띄우고(`--rm`: 확인 후 바로 삭제, `--restart=Never`), alpine은 bash가 아니라 sh로 접속한다. `kubectl run myblog ... --expose --port=80` 은 같은 이름의 Service가 자동으로 함께 만들어진다. Pod/Service는 CoreDNS에 `서비스명.네임스페이스.svc.cluster.local`로 자동 등록되므로 같은 namespace에서는 서비스 이름(myblog)만으로 접속 가능. 정책 적용 전에는 모든 트래픽이 허용되어 Welcome to nginx! 가 나온다.
- 기본적으로 모든 Pod 는 서로 통신 가능. NetworkPolicy 는 Namespace 단위 오브젝트로, 정책이 선택한 Pod 는 허용 규칙에 명시된 트래픽만 통과(Whitelist).
- NetworkPolicy 를 실제로 강제하려면 이를 지원하는 CNI(예: Calico)가 필요.
- 선택 기준: Pod label, Namespace label, IP 대역(ipBlock), 포트(protocol/port).
- 주요 필드
  | 필드 | 설명 |
  |---|---|
  | podSelector | 정책이 적용될 대상 Pod(label). `{}` 이면 ns 의 모든 Pod |
  | policyTypes | Ingress / Egress 지정(생략 시 ingress 규칙 기준으로 해석) |
  | ingress.from | 들어오는 트래픽의 허용 출처(ipBlock / namespaceSelector / podSelector) |
  | egress.to | 나가는 트래픽의 허용 목적지 |
  | ports | 허용 protocol(TCP/UDP/SCTP)과 port |
- `ingress: []` (빈 리스트) = 허용 규칙 0개 → 모든 인바운드 차단 / `ingress: - {}` = 규칙 1개(빈 규칙) → 모든 인바운드 허용.
- `from` 하위 `-` 위치: 같은 `-` 항목 안에 여러 selector 를 쓰면 AND, `-` 로 분리하면 OR (예: cachedb-allow-services).
- `podSelector: {}`(from 안) = 같은 ns 의 모든 Pod 허용(다른 ns 차단), `namespaceSelector: {}` = 모든 ns 허용.
- Pod/Service DNS 이름은 ns 내에서만 짧은 이름이 통하므로, 다른 ns 에서는 `myblog.default` 로 접근.

### [사용한 CLI]

**6-1. 정책 YAML 구조 예시 (공식 형태, 자료 제시)**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: test-network-policy
  namespace: default
spec:
  podSelector:
    matchLabels:
      role: db
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - ipBlock:
        cidr: 172.17.0.0/16
        except:
        - 172.17.1.0/24
    - namespaceSelector:
        matchLabels:
          project: myproject
    - podSelector:
        matchLabels:
          role: frontend
    ports:
    - protocol: TCP
      port: 6379
  egress:
  - to:
    - ipBlock:
        cidr: 10.0.0.0/24
    ports:
    - protocol: TCP
      port: 5978
```

**6-2. `-` 위치에 따른 OR 예시 (cachedb-allow-services)**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: cachedb-allow-services
spec:
  podSelector:
    matchLabels:
      app: mycoffee
      role: db
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: mycoffee
          role: search
    - podSelector:
        matchLabels:
          app: mycoffee
          role: api
    - podSelector:
        matchLabels:
          app: inventory
          role: web
```

**6-3. LAB1 — `ingress: []` 로 모든 인바운드 차단 (netpol-1)**
```bash
kubectl run myblog --image=nginx:1.25.3-alpine --labels=run=myblog --expose --port=80
kubectl get po,svc -o wide | grep web
kubectl get po,svc -o wide | grep myblog         # 터미널에서 실제로 사용한 조회

# 정책 적용 전 접속 테스트
kubectl run netpol-1 -it --rm --restart=Never --image=alpine -- sh
/ # wget -qO- --timeout=5 http://myblog          # Welcome to nginx!
```
```yaml
# netpol-1.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: netpol-1
spec:
  podSelector:
    matchLabels:
      run: myblog    # 이 label 을 가진 Pod 에 정책 적용
  ingress: []        # 빈 리스트 = 어떤 인바운드도 허용하지 않음
```
```bash
vi netpol-1.yaml
kubectl apply -f netpol-1.yaml
kubectl run netpol-1 -it --rm --image=alpine -- sh                     # 슬라이드 표기(--restart=Never 생략)
kubectl run netpol-1 -it --rm --restart=Never --image=alpine -- sh
/ # wget -qO- --timeout=5 http://myblog          # wget: download timed out
/ # exit
kubectl describe netpol netpol-1
#  PodSelector: run=myblog
#  Allowing ingress traffic: <none> (Selected pods are isolated for ingress connectivity)
#  Not affecting egress traffic / Policy Types: Ingress
```

**6-4. LAB2 — label 기반 허용 (netpol-2)**
```bash
kubectl delete -f netpol-1.yaml
kubectl delete po myblog
kubectl delete svc myblog
kubectl run myblog --image=nginx --labels="role=app,run=myblog" --expose --port=80
kubectl get po,svc -o wide | grep myblog
```
```yaml
# netpol-2.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: netpol-2
spec:
  podSelector:
    matchLabels:
      role: app        # 보호 대상 Pod
  ingress:
  - from:
    - podSelector:
        matchLabels:
          run: myblog  # 이 label 을 가진 Pod 에서 오는 트래픽만 허용
```
```bash
vi netpol-2.yaml
kubectl apply -f netpol-2.yaml                   # networkpolicy.networking.k8s.io/netpol-2 created
kubectl describe netpol netpol-2
# 케이스별 접속 테스트 (wget -qO- --timeout=5 http://myblog)
kubectl run netpol-2 -it --rm --image=alpine -- sh                                      # case1: label 없음 -> timed out
kubectl run netpol-2 -it --rm --labels="role=app" --image=alpine -- sh                  # case2: role=app -> timed out
kubectl run netpol-2 -it --rm --labels="run=myblog" --image=alpine -- sh                # case3: run=myblog -> 성공
kubectl run netpol-2 -it --rm --labels="role=web,run=myblog" --image=alpine -- sh       # case4: 성공
```

**6-5. LAB3 — `ingress: - {}` 모두 허용 (netpol-3)**
```bash
kubectl run myblog --image=nginx --labels="run=myblog" --expose --port=80
kubectl get po,svc -o wide | grep myblog
kubectl run netpol-3 -it --rm --image=alpine -- sh
/ # wget -qO- --timeout=5 http://myblog
```
```yaml
# netpol-3.yaml  (# all allow)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: netpol-3
  namespace: default
spec:
  podSelector:
    matchLabels:
      run: myblog
  ingress:
  - {}
```
```bash
vi netpol-3.yaml
kubectl apply -f netpol-3.yaml
kubectl describe netpol netpol-3
#  To Port: <any> (traffic allowed to all ports)
#  From: <any> (traffic not restricted by source)
```

**6-6. LAB4 — 같은 Namespace 내 Pod 만 허용 (netpol-4)**
```bash
kubectl run myblog -n default --image=nginx --labels="run=myblog" --expose --port=80
kubectl get po,svc -o wide | grep myblog
```
```yaml
# netpol-4.yaml  (deny-traffic-from-other-namespaces)
kind: NetworkPolicy
apiVersion: networking.k8s.io/v1
metadata:
  namespace: default
  name: netpol-4
spec:
  podSelector:
    matchLabels:
  ingress:
  - from:
    - podSelector: {}
```
```bash
vi netpol-4.yaml
kubectl apply -f netpol-4.yaml
kubectl describe netpol netpol-4
#  PodSelector: <none> (Allowing the specific traffic to all pods in this namespace)

kubectl run yourblog -n default -it --rm --image=alpine -- sh
/ # wget -qO- --timeout=5 http://myblog                 # 같은 ns: 성공

kubectl create ns test-ns
kubectl run yourblog -n test-ns -it --rm --image=alpine -- sh
/ # wget -qO- --timeout=5 http://myblog                 # wget: bad address 'myblog' (ns 다름)
/ # wget -qO- --timeout=5 http://myblog.default         # wget: download timed out (정책으로 차단)
```

**6-7. LAB5 — namespaceSelector 로 특정 Namespace 허용 (netpol-5)**
```yaml
# netpol-5.yaml (모든 ns 허용 버전: namespaceSelector: {})
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  namespace: default
  name: netpol-5
spec:
  podSelector:
    matchLabels:
      run: myblog
  ingress:
  - from:
    - namespaceSelector: {}
```
```yaml
# netpol-5.yaml (label 이 stage: product 인 ns 만 허용 버전)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: netpol-5
spec:
  podSelector:
    matchLabels:
      run: myblog
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          stage: product
```
```bash
kubectl run myblog --image=nginx --labels="run=myblog" --expose --port=80
vi netpol-5.yaml
kubectl apply -f netpol-5.yaml

kubectl create namespace prod-ns
kubectl create namespace dev-ns
kubectl label namespaces prod-ns stage=product      # Namespace 에 label 부여
kubectl label namespaces dev-ns stage=develop

kubectl run yourblog -n prod-ns -it --rm --image=alpine -- sh
/ # wget -qO- --timeout=5 http://myblog.default      # 성공 (stage=product)
kubectl run yourblog -n dev-ns -it --rm --image=alpine -- sh
/ # wget -qO- --timeout=5 http://myblog.default      # timed out (stage=develop)

# 정리
kubectl delete po myblog
kubectl delete svc myblog
kubectl delete netpol netpol-5
kubectl delete ns prod-ns dev-ns
```

**6-8. LAB6 — Pod label + 특정 포트만 허용 (netpol-6)**
```bash
kubectl run myblog --image=dbgurum/netpol-lab:2.0 --labels="run=myblog"
kubectl create service clusterip myblog --tcp 8008:8000 --tcp 5005:5000
# 또는 Service 를 2개로 노출
kubectl expose po myblog --name=test-svc1 --port=8008 --target-port=8000
kubectl expose po myblog --name=test-svc2 --port=5005 --target-port=5000
kubectl get po,svc -o wide | grep myblog
```
```yaml
# netpol-6.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: netpol-6
spec:
  podSelector:
    matchLabels:
      run: myblog
  ingress:
  - ports:
    - port: 5000
    from:
    - podSelector:
        matchLabels:
          role: watch
```
```bash
vi netpol-6.yaml
kubectl apply -f netpol-6.yaml
kubectl describe netpol netpol-6
#  To Port: 5000/TCP / From PodSelector: role=watch

# label 없는 Pod: 모두 timed out
kubectl run yourblog -it --rm --image=alpine -- sh
/ # wget -qO- --timeout=5 http://test-svc1:8008                # timed out
/ # wget -qO- --timeout=5 http://test-svc2:5005/metrics         # timed out

# role=watch Pod: Pod 포트 5000(= test-svc2:5005)만 성공
kubectl run yourblog -it --rm --labels=role=watch --image=alpine -- sh
/ # wget -qO- --timeout=5 http://test-svc1:8008                # timed out (Pod 8000 은 미허용)
/ # wget -qO- --timeout=5 http://test-svc2:5005/metrics         # http.requests=9 등 응답
```

### [LAB별 강사 설명 (원본 PDF 확인)]
- LAB1(netpol-1): "특정 옵션 없이 특정 Pod로 오는 트래픽을 통째로 제한"하는 가장 가벼운 형태. podSelector의 run: myblog 는 "이 label이 있는 Pod에 정책을 적용한다"는 대상 지정이고, `ingress: []` 는 빈 목록 = 허용 규칙이 하나도 없음 → run: myblog 로 들어오는 모든 트래픽 거부. 정책 적용 후 접속이 되던 곳이 5초 후 타임아웃(`--timeout=5`)으로 막힌다. (영상 화면: 처음 apply 후에는 접속이 여전히 성공했고 yaml을 다시 vi로 수정해 apply 한 뒤에야 차단됨. 편집한 구체적 내용은 화면상 판독 불가. 최종 정책은 `ingress: []`.) describe: `PodSelector: run=myblog` / `Allowing ingress traffic: <none> (Selected pods are isolated for ingress connectivity)` / `Not affecting egress traffic` / `Policy Types: Ingress` — 대상은 run=myblog, 선택된 Pod는 ingress가 격리됨, egress에는 영향 없음, Policy Types는 Ingress.
- LAB2(netpol-2): "대상 Pod로 들어올 수 있는 label을 지정하여, 그 label이 있는 트래픽만 허용". 실습을 이어서 할 때는 이전 실습 내용(정책, Pod, 서비스)을 먼저 삭제하고 새로 구성하라고 강사가 안내(label을 업데이트하는 방법도 있지만 정확한 설정을 위해 삭제 후 재생성). 새 myblog는 `--labels="run=myblog,role=app"`. 정책이 없으면 다시 화이트리스트(모두 허용) 기본 상태이므로 접속 성공. 해석: podSelector(role: app)는 "대상", ingress.from.podSelector(run: myblog)는 "어디로부터 들어오는 수신을 허용할지"로 읽고 반대로 말하면 나머지는 모두 거부. describe: `PodSelector: role=app` / `To Port: <any> (traffic allowed to all ports)` / `From: PodSelector: run=myblog` / `Not affecting egress traffic` / `Policy Types: Ingress`.
  - 접속 테스트 4케이스 결과: case1(label 없음) timed out / case2(`role=app`만) timed out — 허용 조건은 role=app이 아니라 run=myblog이므로 차단(role=app은 "정책이 보호하는 대상"의 label일 뿐 접속하는 쪽의 통행증이 아님) / case3(`run=myblog`) 허용 / case4(`role=web,run=myblog`) 허용 — 다른 label이 더 있어도 run=myblog가 포함되어 있으면 허용. 접속을 허용하는 기준은 접속"하는" 쪽 Pod의 label. 강사는 네 가지 케이스를 직접 하나씩 돌려 보라고 권함.
  - 오류와 해결: `kubectl run netpol-2 ...` 재실행 시 `Error from server (AlreadyExists): object is being deleted: pods "netpol-2" already exists` — 이전 netpol-2 Pod가 삭제되는 중이라 나는 오류. 잠시 후 다시 실행하면 정상.
- LAB3(netpol-3): LAB1과 정반대인 예제. LAB1은 `ingress: []`(빈 목록)로 모두 거부, LAB3은 `ingress: - {}`(빈 규칙 하나)로 모두 허용. describe 에서도 `To Port: <any> (traffic allowed to all ports)` / `From: <any> (traffic not restricted by source)` 로 표시. 강사: "정책을 적용한 뒤에는 항상 describe로 먼저 확인하는 습관". 같은 namespace뿐 아니라 다른 namespace의 Pod에서 wget으로 접근해도 모두 허용. (입문자 보충) `ingress: []` = 허용 규칙 0개(아무것도 허용 안 함), `ingress: - {}` = 조건 없는 규칙 1개(누구나, 어느 포트든 허용). `[]`와 `{}`를 헷갈리지 말 것.
- LAB4(netpol-4): 수준이 namespace 단위로 바뀐다. 목표: "다른 ns의 Pod에서 default ns 안의 이 정책에 의해 선택된 Pod로 들어오는 모든 트래픽을 거부" — default namespace의 Pod끼리는 허용하되 다른 namespace에서 오는 트래픽은 막는다(슬라이드 yaml 주석: deny-traffic-from-other-namespaces). describe: `PodSelector: <none> (Allowing the specific traffic to all pods in this namespace)` / `Allowing ingress traffic: To Port: <any> (traffic allowed to all ports) From: PodSelector: <none>` / `Policy Types: Ingress`.

- LAB4 보충(강사): `namespace: default`를 명시했고(안 써도 기본이 default) spec.podSelector에 값을 넣지 않았으므로 default namespace의 모든 Pod가 대상. ingress.from의 `podSelector: {}` 는 같은 namespace(default)의 모든 Pod에서 오는 트래픽만 허용한다는 뜻이며 "이것만 허용한다"고 쓰면 반대로 나머지는 거부된다. default ns의 임시 Pod(yourblog)는 접속 성공, `kubectl create ns test-ns` 후 test-ns의 Pod에서는 서비스 이름만 쓰면 주소를 찾지 못하고(`wget: bad address 'myblog'`), `myblog.default` 처럼 namespace를 붙여 접근해야 하며 그렇게 해도 정책 때문에 타임아웃으로 차단된다(테스트 namespace는 허용 목록에 넣은 적이 없기 때문).
- LAB5(netpol-5) 보충(강사): netpol-4는 Pod를 지정하지 않았고(default의 모든 Pod가 대상) 같은 namespace에서 오는 트래픽만 허용했다. 반면 netpol-5(슬라이드 52 `web-allow-all-namespaces`)는 run: myblog Pod만 대상으로 하고 `namespaceSelector: {}` 로 모든 namespace의 Pod에서 오는 트래픽을 허용한다(반대로 말하면 default namespace의 다른 Pod에는 영향 없음 — 원문 표기 "default namespace의 다른 Pod에는 접근이 안 됩니다"는 이 정책이 myblog만 대상으로 한다는 점과 함께 읽어야 함). 이어서 label 기반 버전: namespace를 지정할 때는 이름이 아니라 label로 선택하므로 이름을 직접 넣을 수 없고 `stage: product` 같은 namespace label을 사용한다("product"는 운영 단계 namespace라는 뜻). 그래서 정책을 쓰기 전에 namespace에 label을 붙여 두어야 한다(`kubectl label namespaces prod-ns stage=product`). prod-ns(stage=product)는 접속 성공, dev-ns(stage=develop)는 타임아웃. 강사: NetworkPolicy는 label 기반 정책이라는 점을 강조(namespace든 Pod든 label을 가지고 접근을 결정). 실습 후 정리: `kubectl delete po myblog` / `delete svc myblog` / `delete netpol netpol-5` / `delete ns prod-ns dev-ns`. (참고: 슬라이드 52 상단 yaml의 netpol-5(namespaceSelector: {} 버전)와 슬라이드 53의 stage: product 버전은 같은 이름 netpol-5의 서로 다른 단계 예제이다.)
- LAB6(netpol-6) 보충(강사): 목표 "동일한 namespace 내의 run: myblog label이 지정된 Pod에 대해 role: watch label이 지정된 Pod에서 5000번 포트로 수신되는 트래픽만 허용". 대상 Pod에 열린 포트가 여러 개(예: 5000, 8000)여도 5000번만 허용할 수 있다. 이미지는 `dbgurum/netpol-lab:2.0`(포트 8000과 5000을 연 테스트용). 서비스를 만드는 방법은 두 가지(`kubectl create service clusterip myblog --tcp 8008:8000 --tcp 5005:5000` / `kubectl expose po myblog --name=test-svc1 --port=8008 --target-port=8000` 등)이며 같은 결과. describe 와 YAML의 대응: `PodSelector: run=myblog` ← spec.podSelector, `To Port: 5000/TCP` ← ports의 port: 5000, `From PodSelector: role=watch` ← from.podSelector. 테스트 결과표: label 없는 Pod → test-svc1:8008, test-svc2:5005 모두 timed out(role=watch label이 없어 허용 조건 불충족) / role=watch Pod → test-svc1:8008(Pod 8000번)은 timed out(role은 맞지만 5000번이 아닌 포트) / role=watch Pod → test-svc2:5005/metrics(Pod 5000번)는 메트릭 응답(http.requests=9, go.goroutines=5, go.cpus=4)(label과 5000번 포트 조건을 모두 만족). 강사: 이처럼 포트 단위의 제어까지 NetworkPolicy로 구현할 수 있다. 정책의 ports는 Service 포트(5005)가 아니라 Pod의 포트(5000) 기준으로 판단된다. 이 예제의 이미지는 강사가 제공하는 것을 사용.
- 과제(슬라이드 57, 강사): [과제] 3 tier application model에 사용할 수 있는 NetworkPolicy를 생성해 보세요. 목표 1) 프런트엔드 네임스페이스에서 백엔드 네임스페이스로만 트래픽을 허용한다 2) 백엔드 네임스페이스에서 db 네임스페이스로만 트래픽을 허용한다 3) 따라서 프런트엔드 네임스페이스의 Pod는 db 네임스페이스의 Pod와 통신할 수 없다. 강사 힌트: 이 뒤의 파이널 프로젝트에서 2-tier, 3-tier 정책을 다루게 되는데 namespace/정책/권한 부분은 제공하지 않을 것이므로 직접 만들어 보라고 한다. 백엔드는 프런트로부터 받고(ingress) DB로 보내야(egress) 하므로 양쪽 방향이 모두 필요하다. 프런트는 백엔드로 내보내는(egress) 쪽을, DB는 백엔드로부터 받는(ingress) 쪽을 생각해 보고, 프런트 → DB 직접 통신은 막히도록 정책을 해석해 보라고 한다. 이미지는 가벼운 nginx Pod로 통일하고 이름만 frontend / backend / db 로 두어 접근 제어만 NetworkPolicy로 만들어 보면 좋다. 마무리로 11장에서 접근 제어의 ServiceAccount와 User Account, Role/ClusterRole, 그리고 NetworkPolicy까지 다뤘다고 정리.
- 치트시트(PDF 정리): NetworkPolicy=Ingress/Egress 트래픽을 허용/거부하는 규칙 집합(Whitelist), 실제 구현은 CNI(calico) / podSelector=정책이 적용될 대상 Pod(label) / policyTypes=Ingress, Egress / ingress.from=수신 허용 대상(ipBlock / namespaceSelector / podSelector) / egress.to=송신 허용 대상 / ports=허용 프로토콜(TCP/UDP/SCTP)과 포트 / `ingress: []`=모든 수신 거부 / `ingress: - {}`=모든 수신 허용 / `podSelector: {}`(from)=같은 namespace의 모든 Pod 허용 / `namespaceSelector: {}`=모든 namespace 허용 / `namespaceSelector.matchLabels`=namespace label로 허용 대상 지정(label 사전 지정 필요) / "-" 위치: 하나의 "-" 아래 여러 조건=AND, 각각 "-"=OR / `kubectl describe netpol <이름>`=정책 내용 확인(적용 후 항상 먼저 확인) / `wget -qO- --timeout=5 http://<svc>`=허용/차단 접속 테스트(차단 시 download timed out) / `kubectl label namespaces <ns> k=v`.
- 셀프 체크(PDF): Whitelist의 의미와 실제 제어 주체(CNI) / NetworkPolicy는 Namespace 수준 리소스이며 resourceQuota와는 "네트워크 트래픽 제어 vs 리소스 제한"의 차이 / `ingress: []` vs `ingress: - {}` / from 아래 "-" 하나 vs 각각 / LAB2에서 role=app만 붙인 임시 Pod가 막힌 이유 / namespace를 조건으로 삼으려면 정책 작성 전에 namespace에 label을 먼저 붙여야 함 / LAB6에서 test-svc1:8008은 막히고 test-svc2:5005는 허용된 이유 / 3-tier 과제에서 백엔드에 ingress와 egress가 모두 필요한 이유.

### [확인 방법/주의점]
- `kubectl describe netpol <name>` 로 PodSelector, Allowing ingress traffic(From / To Port), Policy Types 확인.
- 테스트는 `alpine` 임시 Pod + `wget -qO- --timeout=5 http://<svc>` 로, 차단 시 `download timed out`.
- 정책의 `podSelector` 는 "보호 대상", `from.podSelector` 는 "허용 출처" — 둘을 혼동하지 말 것.
- Service 포트와 Pod 포트가 다르면(8008→8000, 5005→5000) NetworkPolicy `ports` 는 Pod(target) 포트 기준으로 허용(`port: 5000` → test-svc2:5005 접속 가능).
- 다른 ns 의 Pod 는 짧은 이름이 풀리지 않아 `myblog.default` 형태 사용.
- 정책 이름이 같은 Pod 이름(`netpol-2`) 재사용 시 `AlreadyExists: object is being deleted` 가 나올 수 있으니 잠시 후 재시도.
- 자료 말미: 3-tier 앱(frontend/backend/db)에서는 프론트→백엔드, 백엔드→DB 만 허용하고 DB 는 백엔드에서만 ingress 를 받도록 정책을 구성(예시로 nginx Pod 를 frontend/backend/db 로 label 지정해 실습 가능).

---

## Step 7. Node 유지보수 — drain / cordon / uncordon (CH12-01)

### [목적]
- OS 패치/하드웨어 점검/업그레이드 등 노드 유지보수 시 워크로드를 안전하게 다른 노드로 옮기고 스케줄링을 제어한다.

### [이론 설명]
- Node 는 kubelet, 컨테이너 런타임(CRI), kube-proxy 가 동작하는 VM/서버이며, Node Controller 가 노드 상태(heartbeat, CIDR 할당 등)를 관리한다.
- Node 상태
  | STATUS | 의미 |
  |---|---|
  | Ready | 정상, Pod 스케줄 가능 |
  | NotReady | 어떤 문제로 작동하지 않아 Pod 실행 불가(가장 흔한 원인: kubelet 과의 네트워크 통신 문제 - kubelet 이 상태값을 API 서버에 전달하므로) |
  | Ready,SchedulingDisabled | 정상이나 신규 Pod 스케줄 금지(cordon/drain 상태) |
  | Unknown | 노드 컨트롤러가 노드와 통신 불가 시 기본값 40초 대기 후 Unknown 으로 설정(원문 표기. 노드 컨트롤러는 5초마다 노드 상태 체크) |

> [원문 한글 자료 기반 보강 - CH12-01 (영상 약 26분, 강사 이현용, 슬라이드+터미널 캡처+STT 요약본)]
> - Node 는 VM/온프레미스 물리 서버인 호스트 머신이면서 동시에 쿠버네티스가 관리하려고 만든 오브젝트이다. 대표 서비스 3가지: kubelet, CRI(컨테이너 런타임), kube-proxy.
> - Node controller(컨트롤 플레인) 역할 2가지: (1) Node 에 CIDR Block 할당(CNI=Calico 의 네트워크 CIDR 정보 할당), (2) Node 동작 상태 모니터링(5초마다 상태 체크).
> - Conditions 정상값: NetworkUnavailable=False(CalicoIsUp) / MemoryPressure=False(KubeletHasSufficientMemory) / DiskPressure=False(KubeletHasNoDiskPressure) / PIDPressure=False(KubeletHasSufficientPID) / Ready=True(KubeletReady). 대부분 항목은 kubelet, 네트워크 항목은 CNI(Calico)와 연결. 화면 예: Capacity cpu 4 / memory 3164064Ki / pods 110, Ubuntu 22.04.2 LTS, containerd://1.6.26, Kubelet/Kube-Proxy v1.28.4.
> - 구분 사용: 노드 호스트 자체 문제 해결(H/W 교체 등)은 drain, 더 이상 Pod 를 받지 않게 경계선만 칠 때는 cordon, 둘 다 복구는 uncordon. 계획된 정비(Planned Maintenance)에서만 사용하고 실행 중 애플리케이션에 영향을 주므로 함부로 쓰지 말 것(강사 당부). CKA 시험의 Node 관리 문제는 보통 버전 업그레이드에서 나오며 drain 을 사용한다.
> - drain 출력 순서: cordoned -> (DaemonSet 경고) -> evicting/evicted -> drained. "cordon 을 가장 먼저 치고 안의 Pod 를 축출" = drain 은 cordon 을 포함(역은 성립하지 않음).
> - 독립형 Pod(kubectl run)은 ReplicaSet 같은 관리 주체가 없어 drain 후 다시 살아나지 않는다. DaemonSet 은 모든 노드에 이미 하나씩 있어 옮길 필요가 없으므로 --ignore-daemonsets.
> - Static Pod 은 노드 호스트의 파일이라 drain(축출)으로 지울 수 없어 계속 노드에 유지됨. 파일을 만들면 kubelet 이 감지해 Pod 생성(이름 `<파일 Pod명>-<노드명>`, 예: myweb-static-pod-k8s-node1, ContainerCreating -> Running), 파일을 지우면 Pod 도 자동 삭제.
> - 강사 설명 요지(음성 인식 불분명, 요지만): nodeSelector 는 스케줄러가 배치를 결정하므로 cordon/drain 노드에는 배치되지 않지만, spec.nodeName 직접 지정이나 Static Pod 처럼 스케줄러를 거치지 않고 해당 노드 kubelet 에 직접 전달되는 경우는 drain 된 노드에서도 실행된다.
> - 강사 팁: uncordon 후 옮겨 간 Pod 는 자동 복귀하지 않음(10개를 원한 것이지 node3 를 지정한 것이 아님) -> `kubectl rollout restart deployment myweb` 로 재분산. 슬라이드 LAB2 의 uncordon 출력이 'cordoned' 로 표기된 것은 슬라이드 원문 오타로 보임.
> - 12장 구성: 01 Drain/Cordon/Uncordon, 02 Node Troubleshooting(가볍게, 상세 트러블슈팅은 파트 6), 03 Version Upgrade. 12장은 Part1 개념 수업의 마지막 챕터.

- `kubectl describe no` 의 Conditions: NetworkUnavailable, MemoryPressure, DiskPressure, PIDPressure, Ready. Capacity/Allocatable, System Info(OS, containerd 버전, kubelet/kube-proxy 버전), Non-terminated Pods 도 함께 확인.
- cordon: 노드를 스케줄 불가로 표시(기존 Pod 은 유지) / drain: cordon + 기존 Pod evict(다른 노드로 재생성) / uncordon: 스케줄 불가 해제.
- drain 은 Deployment(ReplicaSet), DaemonSet, StatefulSet 등 컨트롤러가 관리하는 Pod 만 다른 노드에서 재생성 가능. 컨트롤러 없는 단독 Pod 은 사라지므로 `--force` 필요하고 복구되지 않는다.
- DaemonSet Pod 은 evict 해도 노드별로 다시 떠야 하므로 `--ignore-daemonsets` 필요. emptyDir 를 쓰는 Pod 은 `--delete-emptydir-data`.
- Static Pod: kubelet 이 노드의 `/etc/kubernetes/manifests` YAML 을 직접 읽어 실행. API Server/스케줄러가 관리하지 않아 drain 으로 이동되지 않음. 이름 뒤에 `-<노드명>` 접미사가 붙는다.
- uncordon 후에도 기존 Pod 은 자동 재분배되지 않는다 → `rollout restart`.

### [사용한 CLI]

**7-1. 노드 상태 조회**
```bash
kubectl get no                       # STATUS: Ready / NotReady / Ready,SchedulingDisabled / Unknown
kubectl describe no k8s-node1        # Conditions, Capacity/Allocatable, System Info, Non-terminated Pods, Events
```

**7-2. Static Pod 실습**
```bash
# (k8s-master) YAML 생성
kubectl run pod myweb --image=nginx --port=80 --dry-run=client -o yaml > myweb-static-pod.yaml
vi myweb-static-pod.yaml

# (k8s-node1) 노드의 manifests 디렉터리에 파일 생성
sudo vi /etc/kubernetes/manifests/myweb-static-pod.yaml

# (k8s-master) kubelet 이 자동으로 Pod 생성 -> 이름: myweb-static-pod-k8s-node1
kubectl get po -o wide | grep myweb

# 삭제는 노드의 파일을 제거 (kubectl delete 로는 해결되지 않음)
sudo rm /etc/kubernetes/manifests/myweb-static-pod.yaml
```

**7-3. cordon / uncordon**
```bash
kubectl cordon k8s-node1         # node/k8s-node1 cordoned
kubectl uncordon k8s-node1       # node/k8s-node1 uncordoned
```

**7-4. drain (LAB1)**
```bash
kubectl drain k8s-node1 --delete-emptydir-data --ignore-daemonsets --force
```
- `--delete-emptydir-data`: emptyDir 볼륨 데이터를 삭제하고 evict 허용
- `--ignore-daemonsets`: DaemonSet 이 관리하는 Pod 은 무시(경고만 출력)
- `--force`: 컨트롤러(ReplicaSet 등)가 관리하지 않는 Pod 도 강제 삭제

```bash
kubectl create deployment myweb --image=nginx --replicas=10
kubectl get po -o wide                         # node1~3 에 분산(node3 에 4개)

kubectl drain k8s-node3 --delete-emptydir-data --ignore-daemonsets --force
# node/k8s-node3 cordoned
# Warning: ignoring DaemonSet-managed Pods: ... (calico-node, kube-proxy, speaker, node-exporter 등)
# evicting pod default/myweb-... -> evicted
# node/k8s-node3 drained
kubectl get no                                 # k8s-node3 Ready,SchedulingDisabled
kubectl get po -o wide                         # node3 의 Pod 들이 node1/node2 에서 재생성, 총 10개 유지

kubectl uncordon k8s-node3
kubectl rollout restart deployment myweb       # uncordon 후 Pod 재분배(node3 에도 배치)
```

**7-5. cordon + nodeSelector Pod Pending (LAB2)**
```bash
kubectl cordon k8s-node3
kubectl get po -o wide        # cordon 전에 떠 있던 node3 Pod 은 그대로 Running
```
```yaml
# sch-test1.yaml
apiVersion: v1
kind: Pod
metadata:
  name: sch-test1
spec:
  nodeSelector:
    kubernetes.io/hostname: k8s-node3
  containers:
  - image: nginx:1.25.3
    name: sch-test1
```
```bash
vi sch-test1.yaml
kubectl apply -f sch-test1.yaml
kubectl get po -o wide | grep sch      # sch-test1 0/1 Pending (node3 가 cordon 상태)
kubectl uncordon k8s-node3
kubectl get po -o wide | grep sch      # sch-test1 1/1 Running (node3)
```

### [확인 방법/주의점]
- drain 후 `kubectl get no` 에서 `Ready,SchedulingDisabled` 확인, `kubectl get po -o wide` 로 Pod 이 다른 노드에서 재생성됐는지 확인.
- 유지보수 종료 후 반드시 `kubectl uncordon <node>`. 기존 Pod 의 재분배가 필요하면 `kubectl rollout restart deployment <name>`.
- drain 은 cordon 을 포함(drain = cordon + evict). cordon 만 하면 기존 Pod 은 그대로 남는다.
- Static Pod 은 drain 대상에서 제외되어 노드에 남는다 → 필요하면 manifests 의 파일을 제거.
- nodeSelector 로 노드를 특정한 Pod 은 cordon/drain 된 노드에는 배치되지 않아 Pending (원문 확인: 스케줄러를 거치기 때문). 단 spec.nodeName 직접 지정/Static Pod 은 스케줄러를 거치지 않는다는 것이 강사 설명 요지(음성 인식 불분명)이므로, 기존 문장의 `spec.nodeName` 도 Pending 이라는 서술은 원문 근거가 없어 정정함.
- 컨트롤러 없는 단독 Pod 은 `--force` 로 drain 하면 삭제된 뒤 복구되지 않으니 주의.

---

## Step 8. Node Troubleshooting — NotReady 대응 (CH12-02)

### [목적]
- 노드가 NotReady 가 되었을 때 원인을 점검하고(kubelet, 리소스, 네트워크, 시간 동기화 등) 복구한다.

### [이론 설명]
> [원문 한글 자료 기반 보강 - CH12-02 (영상 약 10분, 슬라이드 17~20)]
> - 이 클립은 kubelet 관련 장애를 간단히 소개하는 용도. 노드~애플리케이션 트러블슈팅은 파트 6 에서 집중 학습.
> - 슬라이드 17 일반 장애 요인: (a) Node NotReady - kubelet, H/W, network 문제 등 (b) Node 접근 에러 - 호스트 네트워크 연결 문제 / Network plugin 문제(Calico 가 해당 노드에서 멈춤) / 신규 설치 패키지의 호환되지 않는 버전 / Node 시계 오차(시간 동기화).
> - 강사 설명: 노드 컨트롤러가 heartbeat 를 5초 간격으로 확인, 응답 없으면 40초 정도 기다린 뒤 Unknown 등으로 표시(노드가 죽은 것이 아니라 통신 단절일 수 있음). NotReady 가 보이면 가장 먼저 진단할 대상은 항상 kubelet(문제 노드에 접속해 ps 또는 systemctl status 로 확인).
> - 실습 재현 방법: 강사는 node2 의 kubelet 을 일부러 stop 해 장애를 만들었으며 수강생도 node2 에서 kubelet stop 으로 테스트 가능.
> - 슬라이드 18 Conditions(장애 시): NetworkUnavailable=False(CalicoIsUp) 이외 MemoryPressure/DiskPressure/PIDPressure/Ready 모두 Unknown, Reason NodeStatusUnknown, Message `Kubelet stopped posting node status.` / Events 에 `Node k8s-node2 status is now: NodeNotReady`(주체 node-controller) / Taints 에 node.kubernetes.io/unreachable:NoExecute 및 NoSchedule 자동 부여.
> - 진단 도구 3가지: (1) describe no(Conditions) (2) kubectl get events(지속 관찰은 watch 옵션, 현재까지만은 옵션 없이) (3) 문제 노드(node2)에서 journalctl -u kubelet(출력이 길어 > 로 out.txt 같은 파일에 저장해 열어 보는 방식 안내). 이번 장애에서는 get events 에 kubelet 관련 정보가 눈에 띄지 않아 journalctl 확인이 필요하다고 강사가 짚음.
> - 복구: 슬라이드 19 [solution] `student@k8s-node2:~$ sudo systemctl restart kubelet.service`. 실습 화면에서는 `sudo systemctl start kubelet` 입력 장면 후 status 로 active (running) 확인 - 서비스를 켠 뒤 항상 status 확인(강사 강조). 이후 노드 컨트롤러가 5초 간격으로 확인하므로 곧 Ready, describe 는 MemoryPressure/DiskPressure/PIDPressure=False, Ready=True(KubeletReady, "kubelet is posting ready status. AppArmor enabled").
> - 시간 동기화: 강사가 손글씨로 `ntpq -p` 를 적어 보여 줌(이 강의 환경은 NTP 사용). 노드 시계가 어긋나면 클러스터 연결 문제/NotReady 가능.
> - 슬라이드 20 기타 원인 4가지: (1) Disk 공간 부족 등 시스템 리소스 부족 - describe Conditions 의 Memory/Disk/PIDPressure 가 False->True 로 바뀌는지로 진단 (2) kube-proxy 문제(host network 문제) - Calico 문제이거나 호스트 네트워크를 잘못 건드리면 kube-proxy 가 죽어 iptables 프록시(외부->내부 연결) 불가 (3) CoreDNS 장애로 resolution 문제 - 모든 리소스가 DNS 로 등록되므로 CoreDNS(53번 포트) 문제 시 연결 불가 (4) Node(host) 방화벽 등 네트워크 관리자의 잘못된 구성 변경 - 여러 담당자(클라우드/시스템/서버/네트워크/방화벽)가 협의 없이 변경하는 것이 문제를 만듦(강사 지적).
> - 원문 주의: 슬라이드 19 해결 명령은 `restart kubelet.service`, 화면 캡처는 `start` 까지만 보이며 뒷부분은 STT 설명을 따른 것이라고 원문에 명시되어 있음.

- NotReady 의 주요 원인(자료 정리): kubelet 중지/오류, 노드 H/W(CPU·메모리·디스크 등 자원 부족), 네트워크 플러그인(Calico)/kube-proxy/CoreDNS 문제, 노드 간 시간 동기화(NTP) 문제 등.
- `describe no` 의 Conditions 가 `Unknown / NodeStatusUnknown / Kubelet stopped posting node status.` 이면 kubelet 이 상태를 보고하지 않는 것 → 대표적으로 kubelet 중지. Taints 에 `node.kubernetes.io/unreachable:NoExecute / NoSchedule` 도 확인.
- 정상 상태 Conditions: NetworkUnavailable=False(CalicoIsUp), MemoryPressure/DiskPressure/PIDPressure=False, Ready=True(KubeletReady).
- 점검 순서(자료 Case 1): get no → describe no(Conditions/Events) → get events / journalctl -u kubelet → kubelet 재시작 → 상태 재확인. 이후 다른 원인 후보(리소스 Pressure, 네트워크 플러그인·kube-proxy·CoreDNS, 시간 동기화)를 점검.

### [사용한 CLI]

```bash
# (k8s-node2) 장애 재현: 강사가 node2 의 kubelet 을 일부러 stop (명령 입력 장면은 화면에 없음, 강사 안내)
sudo systemctl stop kubelet

# (k8s-master) 노드 상태 확인
kubectl get no                       # k8s-node2 NotReady
kubectl describe no k8s-node2        # Conditions 가 Unknown, "Kubelet stopped posting node status."
kubectl get events                   # 클러스터 이벤트 확인 (NodeNotReady 등)
kubectl get events -w                # (강사 안내) 지속 관찰 시 watch 옵션

# (k8s-node2) kubelet 로그 및 서비스 확인
journalctl -u kubelet                # systemd 에서 kubelet 로그 조회
journalctl -u kubelet > out.txt      # (강사 안내) 출력이 길어 파일로 저장 후 열람
sudo systemctl restart kubelet.service   # [solution] kubelet 재시작
sudo systemctl start kubelet             # 중지된 kubelet 기동
sudo systemctl status kubelet            # Active: active (running) 확인

# (k8s-master) 복구 확인
kubectl get no                       # k8s-node2 Ready
kubectl describe no k8s-node2        # Conditions False/True(KubeletReady) 정상

# 시간 동기화 점검 (자료에서 점검 항목으로 소개)
ntpq -p                              # NTP peer 동기화 상태
```

### [확인 방법/주의점]
- 복구 후 `describe` 의 Conditions 가 모두 정상(Pressure 항목 False, Ready True, Reason KubeletReady)인지 확인.
- Conditions 의 `Unknown` = kubelet 이 상태 보고를 중단했다는 의미 → 해당 노드에서 kubelet 서비스부터 확인.
- Pressure 항목이 True 이면 리소스 부족 → 자원 확보가 우선.
- Calico, kube-proxy, CoreDNS 등 시스템 Pod 상태와 노드 시간 동기화(ntpq -p)도 NotReady 원인이 될 수 있음.
- 로그 분석: `journalctl -u kubelet` 출력이 길어 파일로 저장해(`> out.txt`) 읽는 방식도 언급.

---

## Step 9. Kubernetes 버전 업그레이드 (v1.28.4 → v1.28.5, kubeadm) (CH12-03)

### [목적]
- kubeadm 으로 클러스터를 패치 버전(1.28.4 → 1.28.5)으로 안전하게 업그레이드한다. 컨트롤 플레인 → 워커 노드 순으로 진행.

### [이론 설명]
> [원문 한글 자료 기반 보강 - CH12-03 (영상 약 29분, 슬라이드 22~31)]
> - 목표: 수업 종료 시 4개 노드 모두 1.28.4 -> 1.28.5. 강사는 실무에서는 백업, 애플리케이션 중단 여부(무중단/중단), 서비스·호환성 등 고려할 것이 많으나 이 클립은 업그레이드 작업 자체만 소개한다고 밝힘.
> - 저장소/키: 슬라이드 31(1.28)은 Candidate 1.28.5-1.1(Version table 1.28.5/1.28.4/1.28.3...), 슬라이드 30(1.29)은 주소의 v1.28 -> v1.29 로만 다르며 Candidate 1.29.0-1.1(Installed none). 1.28.4 사용 중 Candidate 로 1.28.5 가 안 보이면 같은 GPG 키 + 저장소 두 줄을 재실행. 1.29 로 올릴 때도 이 두 줄을 v1.29 로 변경. 슬라이드 26 주석: "조회 시 현재 버전이 최신으로 나온다면 key 정보를 재 적용하면 됨(1.29.x 버전으로 upgrade 해도 무관)". 이 강의는 뒤에 프로젝트가 남아 처음에 1.28 로 설치했고 1.29 업그레이드는 프로젝트 후 진행 권장.
> - 버전별 저장소를 분리해 쓰는 이유(강사): 범용(전체 버전) 저장소는 모든 버전이 보여 구분은 불필요하나 latest 로 쭉 올라가 버릴 위험이 있어, 마이너 버전을 함부로 올리지 못하게 버전별 저장소를 사용. 28/29 저장소를 모두 가지면 policy 에 29 까지 나옴(영상 환경은 28 만 있어 1.28.5 가 마지막).
> - 슬라이드 22: Control Plane = ① kubeadm package ② kubeadm upgrade 로 구성요소 ③ kubelet, kubectl package / Worker Node = ① kubeadm package ② kubelet, kubectl package. Control Plane 먼저(API 서버 등 주요 컴포넌트가 있으므로). 패키지는 apt(CentOS 는 yum), 순서는 앞뒤 크게 상관없음. 워커의 kubeadm 은 join, reset 정도에만 쓰지만 같은 버전으로 맞춤.
> - 슬라이드 23 6단계: 1) Update the software(apt-get update) 2) Check the software version(apt-cache policy kubeadm) 3) Drain the control plane(슬라이드 표기 'ScheduledDisable' 그대로, 강사는 drain 으로 설명) 4) View the planned upgrade(kubeadm upgrade plan) 5) Apply the upgrade(kubeadm upgrade apply ~) 6) Uncordon the control plane to allow pods to be scheduled.
> - kubeadm upgrade -h: plan 은 apply 전에 보기를 권장(어디까지 갈 수 있는지, 업그레이드 가능 검증, 인터넷 체크 생략은 [version] 인자), apply 는 plan 으로 정한 버전 적용, diff 는 static pod manifest 변경 사항(`apply --dry-run` 참고), node 는 노드용(영상에서 실습 없음). 한 번에 두 단계씩 가도 되느냐는 질문 -> 한 단계(마이너 버전)씩 올리기 권장(공식 문서도 동일, 장애·다운타임 감소).
> - drain 출력(마스터): `169 packages can be upgraded`, DaemonSet 경고 대상 calico-node, kube-proxy, metallb speaker, evict 대상 coredns, calico-kube-controllers. 마스터는 taint 가 있어 일반 Pod 는 거의 없음.
> - plan 하단: Target version v1.28.5, kubelet `4 x v1.28.4 -> v1.28.5`(수동 업그레이드 대상), kube-apiserver/controller-manager/scheduler/kube-proxy 1.28.4->1.28.5, CoreDNS v1.10.1 및 etcd 3.5.9-0 동일. "Before you can perform this upgrade, you have to update kubeadm to v1.28.5". etcd 는 버전 동일하므로 제외(DB 역할이라 내렸다 올리는 것은 데이터 손실 가능성 때문에 권장하지 않는다고 강사 설명).
> - 설치 명령은 버전 명시 없이도 Candidate 로 설치되지만 이번에는 명시(처음 구축 때는 명시 안 함, 안 해도 되는 방법). 설치 로그: `3 upgraded, 0 newly installed, 0 to remove and 166 not upgraded`, 39.9 MB.
> - apply 확인 포인트: `Cluster version: v1.28.4 / kubeadm version: v1.28.5`, [y/N] 에 y, 이미지 prepull -> 인증서 갱신(Renewing ... certificate) -> 새 매니페스트를 /etc/kubernetes/manifests/ 로, 이전 것은 /etc/kubernetes/tmp/kubeadm-backup-manifests-... 백업. kube-apiserver -> kube-controller-manager -> kube-scheduler 순으로 `upgraded successfully!` 가 나오는지, FAIL/오류 없는지 반드시 확인(강사 강조), 마지막에 CoreDNS/kube-proxy 애드온 적용 후 SUCCESS. 끝에 kubelets 업그레이드 안내 메시지. 경고 `W0112 ... sandbox image "registry.k8s.io/pause:3.6" ... inconsistent ... pause:3.9` 는 런타임 샌드박스 이미지 버전 경고일 뿐 업그레이드는 성공(강사는 따로 언급 안 함).
> - kubelet 반영: daemon-reload -> restart -> enable -> status(active (running), q 로 종료) -> exit. 이후 `kubectl uncordon k8s-master`, get no 에서 마스터만 v1.28.5(강사: "이렇게 언밸런스하게 쓰시면 안 된다"), 마스터 세 패키지를 `apt-mark hold` 로 재고정. 버전 확인: kubeadm version -o yaml(gitVersion v1.28.5, major 1, minor 28), kubelet --version -> Kubernetes v1.28.5.
> - 워커: 슬라이드 30 주석 `# 모든 노드에서 upgrade 동시 수행`. 강사는 MobaXterm 같은 다중 세션으로 node1~3 동시 작업(한 대씩 해도 됨, node1 이 느려 나중에 마무리). 워커에서는 kubelet --version 과 kubectl version 클라이언트 버전 두 가지만 확인하면 충분. node3 의 `localhost:8080 was refused` 는 서버(API) 조회 시 오류이고 클라이언트 버전은 v1.28.5 정상(워커에 kubeconfig 없음 설명은 원문의 입문자 보충).
> - 최종: 처음 get no 에 워커가 v1.28.4 로 남아 있으면 잠시 기다리거나 마스터에서 sudo apt update 후 반영된다고 강사가 설명. 슬라이드 31: 모든 노드(node1~3, master)에서 `sudo systemctl restart kubelet.service` 하면 곧바로 반영(kubelet-API 서버 통신 지연으로 버전 정보 갱신 지연). 4대 모두 v1.28.5 로 완료.
> - CKA 팁(강사): 시험에서 `sudo -i` 로 root 이동 후 sudo 없이 apt -y install 을 지시하는 경우가 있으니 지시를 따를 것, 아니면 sudo 를 붙여 실행해도 됨. 마무리 멘트: 12장으로 개념/오브젝트/노드 관리를 훑었고 남은 프로젝트 후 CKAD 취득 권장.
> - 정정: 기존 서술의 "워커는 패키지 설치 + kubelet 재시작으로 반영"은 원문상 워커는 unhold -> install -> hold -> daemon-reload -> enable 이고, get no 에 반영되지 않을 때 kubelet 재시작이 맞음. 워커의 `kubeadm upgrade node` 는 영상에서 실습하지 않음.

- 업그레이드 대상: 현재 `kubectl get no` 의 VERSION = v1.28.4. 패키지 저장소가 1.28 이면 최신 Candidate 는 1.28.5-1.1, 저장소를 1.29 로 바꾸면 Candidate 가 1.29.0-1.1(저장소/GPG 키의 마이너 버전에 따라 결정).
- 업그레이드 순서
  - Control Plane: kubeadm 패키지 업그레이드 → `kubeadm upgrade` 로 컨트롤 플레인 업그레이드 → kubelet, kubectl 패키지 업그레이드.
  - Worker Node: kubeadm 패키지 업그레이드 → kubelet, kubectl 패키지 업그레이드(자료 실습에서는 워커는 패키지 설치 + kubelet 재시작으로 반영).
  - 패키지는 apt 로 관리(CentOS 는 yum).
- kubeadm upgrade 6단계: ① apt update ② `apt-cache policy kubeadm` 으로 버전 확인 ③ 컨트롤 플레인 drain ④ `kubeadm upgrade plan` ⑤ `kubeadm upgrade apply` ⑥ uncordon.
- `kubeadm upgrade` 서브커맨드: apply(지정 버전 업그레이드), diff(static pod manifest 변경 사항 확인), node(노드용 업그레이드), plan(업그레이드 가능 버전 확인 및 가능 여부 검증).
- kubeadm/kubectl/kubelet 은 `apt-mark hold` 로 의도치 않은 업그레이드가 막혀 있으므로 `unhold` → 설치 → 다시 `hold`.
- `kubeadm upgrade plan` 출력에는 현재/목표 버전(kube-apiserver, controller-manager, scheduler, kube-proxy는 1.28.5로, CoreDNS v1.10.1, etcd 3.5.9-0은 동일)과 "kubeadm 을 먼저 v1.28.5 로 업데이트해야 한다"는 안내가 포함.
- 1.29 로의 마이너 업그레이드는 저장소(GPG 키/소스)를 1.29 로 교체해야 하며, 이 실습에서는 1.28.5 까지만 진행.

### [사용한 CLI]

**9-1. 현재 버전 확인**
```bash
kubectl get no           # VERSION v1.28.4
```

**9-2. 패키지 저장소(GPG 키/소스) 등록 (v1.28 기준, 1.29 는 v1.28 → v1.29 로 변경)**
```bash
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.28/deb/Release.key | \
  sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.28/deb/ /' | \
  sudo tee /etc/apt/sources.list.d/kubernetes.list

sudo apt update
sudo apt-cache policy kubeadm          # Installed / Candidate / Version table 확인
sudo apt -y install kubelet kubeadm kubectl

# 1.29 로 올릴 때(슬라이드 30): 주소의 v1.28 만 v1.29 로 바꾼 두 줄 -> Candidate 1.29.0-1.1
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.29/deb/Release.key | \
  sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.29/deb/ /' | \
  sudo tee /etc/apt/sources.list.d/kubernetes.list
```
- `curl -fsSL`: 실패 시 조용히(-f), 진행표시 없이(-s), 오류 표시(-S), 리다이렉트 따라감(-L)
- `gpg --dearmor -o`: 공개키를 apt 가 읽는 바이너리 keyring 파일로 변환 저장

**9-3. 컨트롤 플레인 업그레이드 (k8s-master)**
```bash
kubeadm upgrade -h                                   # apply / diff / node / plan

sudo apt update                                      # 169 packages can be upgraded
kubectl drain k8s-master --delete-emptydir-data --ignore-daemonsets --force
# node/k8s-master cordoned ... evicting pod (coredns, calico-kube-controllers) ... drained

sudo -i                                              # root 전환 (이후 명령을 sudo 없이 실행)
kubeadm upgrade plan                                 # Target version: v1.28.5

apt-mark unhold kubeadm kubectl kubelet              # Canceled hold on ...
sudo apt-cache policy kubeadm                        # Installed 1.28.4-1.1 / Candidate 1.28.5-1.1
apt -y install kubeadm=1.28.5-1.1 kubectl=1.28.5-1.1 kubelet=1.28.5-1.1

kubeadm upgrade apply 1.28.5 --etcd-upgrade=false    # 확인 프롬프트 [y/N] -> y
# kube-apiserver / controller-manager / scheduler upgraded successfully!
# [upgrade/successful] SUCCESS! Your cluster was upgraded to "v1.28.5". Enjoy!
```
- `--etcd-upgrade=false`: etcd 는 업그레이드하지 않음(plan 상 etcd 버전이 동일하므로 skip)
- 경고 `sandbox image "registry.k8s.io/pause:3.6" ... inconsistent with ... pause:3.9` 는 업그레이드 성공과 무관한 경고로 설명됨.

**9-4. kubelet 반영, uncordon, hold 복구 (k8s-master)**
```bash
systemctl daemon-reload
systemctl restart kubelet.service
systemctl enable kubelet.service
systemctl status kubelet.service          # Active: active (running)  (q 로 종료)
exit                                      # root 로그아웃

kubectl uncordon k8s-master               # node/k8s-master uncordoned
kubectl get no                            # master v1.28.5 (워커는 아직 v1.28.4)
sudo apt-mark hold kubeadm kubectl kubelet    # 다시 버전 고정

kubeadm version -o yaml                   # gitVersion v1.28.5
kubectl version                           # Client Version v1.28 계열
kubelet --version                         # Kubernetes v1.28.5
```

**9-5. 워커 노드 업그레이드 (k8s-node1 ~ node3 동일 절차)**
```bash
sudo apt update
sudo apt-mark unhold kubeadm kubectl kubelet

sudo -i
apt -y install kubeadm=1.28.5-1.1 kubectl=1.28.5-1.1 kubelet=1.28.5-1.1
exit

sudo apt-mark hold kubectl kubelet kubeadm
sudo systemctl daemon-reload
sudo systemctl enable kubelet.service
sudo systemctl status kubelet.service     # active (running)

kubectl version                           # Client Version: v1.28.5
kubelet --version                         # Kubernetes v1.28.5

# (k8s-node2 화면) sudo -i 없이 sudo 를 붙여 바로 설치한 방식
sudo apt-mark unhold kubeadm kubectl kubelet
sudo apt -y install kubeadm=1.28.5-1.1 kubectl=1.28.5-1.1 kubelet=1.28.5-1.1
sudo apt-mark hold kubectl kubelet kubeadm
```
- 자료에서 node3 의 `kubectl version` 은 API 서버 주소(localhost:8080) 연결 거부 메시지가 같이 출력(워커에는 kubeconfig 가 없어 서버 버전은 조회되지 않으나 클라이언트 버전은 v1.28.5 로 확인).

**9-6. 업그레이드 후 노드 버전 반영 (kubelet 재시작)**
```bash
# kubectl get no 의 VERSION 이 v1.28.4 로 남아 있을 때
sudo apt update
sudo systemctl restart kubelet.service     # k8s-node1, node2, node3, master 각각 실행

kubectl get no                             # 4개 노드 모두 v1.28.5
```

### [확인 방법/주의점]
- `kubectl get no` 의 VERSION 열이 전부 v1.28.5 인지, `kubeadm version -o yaml` / `kubectl version` / `kubelet --version` 으로 각 구성요소 버전 확인.
- 업그레이드 전 `apt-mark unhold` → 설치 후 `apt-mark hold` 를 잊지 말 것(의도치 않은 자동 업그레이드 방지).
- `apt-cache policy kubeadm` 의 Candidate 는 설정된 저장소 버전(v1.28)에 의해 결정. 1.29 로 올리려면 저장소 교체가 선행되어야 하며, 이 실습은 1.28.5 까지.
- 컨트롤 플레인은 drain → 업그레이드 → uncordon 순서로 진행(drain 과정에서 CoreDNS 등이 evict 되었다가 재생성).
- `kubeadm upgrade apply` 시 `[y/N]` 에 y 입력, 마지막 `SUCCESS!` 메시지를 확인. static pod 컴포넌트(apiserver 등)는 `/etc/kubernetes/manifests/` 가 교체되며 이전 파일은 `/etc/kubernetes/tmp/kubeadm-backup-manifests-...` 에 백업.
- 이 실습의 node1 에 있던 myweb static pod(`/etc/kubernetes/manifests/myweb-static-pod.yaml`)는 노드 작업 전에 `sudo rm` 으로 제거한 상태에서 진행.
- 실무 팁(자료): CKA 시험처럼 시간이 부족하면 `sudo -i` 로 root 전환 후 `apt -y install ...` 방식이 편리.
