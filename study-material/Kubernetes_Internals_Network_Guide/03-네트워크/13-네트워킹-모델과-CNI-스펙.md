---
title: "13장. 네트워킹 모델과 CNI 스펙"
---

# 13장. 네트워킹 모델과 CNI 스펙

> **학습목표**
> - 쿠버네티스 네트워크 모델의 4대 요구사항을 각각의 근거와 함께 설명할 수 있다.
> - CNI 스펙이 정의하는 인터페이스(ADD/DEL/CHECK/VERSION)와 kubelet·런타임·플러그인의 호출 관계를 설명할 수 있다.
> - CNI 설정 파일의 플러그인 체인 구조를 읽고 각 요소의 역할을 구분할 수 있다.
> - IPAM 플러그인의 동작과 `Node.spec.podCIDR` 할당 경로를 추적할 수 있다.
> - 오버레이·네이티브 라우팅·클라우드 네이티브 IP 세 방식의 트레이드오프를 근거를 들어 비교할 수 있다.
> - 실제 클러스터의 CNI 설정과 라우팅 테이블을 검사해 패킷 경로를 재구성할 수 있다.

---

## 들어가며

1부에서 컨트롤 플레인이 상태를 어떻게 합의하고(2~3장) 무엇을 어디에 배치할지 결정하는지(4장), 그 결정을 누가 실행하는지(6장)를 봤다. 6장에서는 kubelet이 Pod를 만들 때 컨테이너 런타임에게 샌드박스를 요청하고, 그 안에 네트워크가 "어떻게든" 붙는다고만 말하고 넘어갔다. `kube-proxy`도 마찬가지로 "서비스 트래픽을 어떻게든 Pod로 보낸다"는 수준에서 멈췄다. 3부는 그 "어떻게든"을 전부 연다.

이 장은 3부의 기초 공사다. 14~16장은 Service·kube-proxy·DNS가 **왜 그런 모습으로 설계됐는지**를 다루는데, 그 전제가 되는 것이 이 장에서 다루는 **평평한 네트워크 모델**과 그것을 실제로 구현하는 **CNI(Container Network Interface)** 다. 17~19장의 Ingress·NetworkPolicy·eBPF 데이터플레인도 전부 이 위에 얹힌다.

먼저 짚어야 할 것: **쿠버네티스는 네트워크를 구현하지 않는다.** 쿠버네티스가 정의하는 것은 몇 가지 **요구사항**뿐이고, 그 요구사항을 만족시키는 실제 배선 작업은 CNI 플러그인의 몫이다. 이 분리가 왜 존재하고 어떻게 동작하는지가 이 장의 핵심이다.

## 13.1 쿠버네티스 네트워크 모델의 4대 요구사항

### 네 가지 규칙

쿠버네티스 네트워킹 모델은 다음 네 가지로 요약된다.

1. **모든 Pod는 NAT 없이 다른 모든 Pod와 통신할 수 있다.** 노드가 같든 다르든 상관없다.
2. **모든 노드는 NAT 없이 모든 Pod와 통신할 수 있다.** kubelet의 헬스체크, 노드에서 실행되는 에이전트가 Pod IP로 직접 접근할 수 있어야 한다.
3. **Pod가 스스로 인식하는 자신의 IP는, 다른 Pod가 그 Pod를 바라볼 때 쓰는 IP와 동일하다.** 즉 Pod 내부에서든 외부에서든 주소 체계가 갈라지지 않는다.
4. **`hostNetwork: true`인 Pod는 예외다.** 이 Pod는 별도의 네트워크 네임스페이스를 갖지 않고 노드의 네트워크 네임스페이스를 그대로 공유한다. 따라서 이 Pod의 IP는 곧 노드의 IP이고, 포트도 노드와 공유한다.

```
┌─────────────────────────── 노드 A ───────────────────────────┐
│  netns(Pod-1) 10.244.1.2   netns(Pod-2) 10.244.1.3            │
│         │                          │                          │
│         └──────────┬───────────────┘                          │
│                  루트 netns (노드 자체)                        │
│                  eth0: 192.168.1.10                            │
└──────────────────────────────┬────────────────────────────────┘
                                │  (NAT 없이 직접 라우팅)
┌──────────────────────────────┴────────────────────────────────┐
│                            노드 B                              │
│         eth0: 192.168.1.11                                     │
│         └──────────┬───────────────┘                          │
│         ┌───────────┴──────────────┐                          │
│  netns(Pod-3) 10.244.2.4   netns(Pod-4) hostNetwork            │
│                              (노드 IP 192.168.1.11 그대로 사용) │
└─────────────────────────────────────────────────────────────────┘
```

이 모델을 흔히 **"IP-per-Pod"** 라고 부른다. 각 Pod가 컨테이너가 아니라 마치 하나의 독립된 호스트처럼 자기만의 IP와 포트 공간을 갖는다는 뜻이다.

### 왜 이 모델을 선택했는가

원래 컨테이너 세계(초기 Docker 단일 호스트 모델)의 기본값은 **포트 매핑 기반 NAT**였다. 컨테이너는 `docker0` 브리지의 사설 주소(`172.17.0.0/16` 대역)를 받고, 외부에서 접근하려면 `-p 8080:80`처럼 **호스트 포트를 컨테이너 포트에 매핑**해야 했다.

이 방식의 문제는 단일 호스트를 벗어나는 순간 증폭된다.

```
전통적 포트 매핑 모델                     쿠버네티스 IP-per-Pod 모델
─────────────────────────              ─────────────────────────
호스트 A                                 노드 A
 nginx-1  → 호스트:8080                   Pod(nginx-1) 10.244.1.2:80
 nginx-2  → 호스트:8081                   Pod(nginx-2) 10.244.1.3:80
 nginx-3  → 호스트:8082                   Pod(nginx-3) 10.244.1.4:80
                                          → 포트 충돌 자체가 존재하지 않는다
문제:
· 포트가 노드 단위의 전역 자원이 된다
· 애플리케이션이 "내가 몇 번 포트로 노출됐는지" 알아야 한다
· 서비스 디스커버리가 "호스트IP:포트" 쌍을 추적해야 한다
· 스케줄러가 포트 충돌까지 고려해 배치해야 한다
```

쿠버네티스 설계자들은 이 복잡도를 **애플리케이션 개발자에게 떠넘기지 않기로** 결정했다. 모든 Pod가 클러스터 전체에서 유일한 IP를 받고 표준 포트(예: 80, 5432, 6379)를 그대로 쓸 수 있다면, 애플리케이션은 **VM 위에서 돌 때와 동일한 방식으로 동작**한다. 자기 포트를 몰라도 되고, 같은 이미지를 몇 개를 띄우든 설정이 바뀌지 않는다.

대가는 명확하다. **평평한 라우팅 가능 네트워크를 클러스터 규모로 만들어야 한다.** 노드가 3개든 3,000개든, Pod가 10개든 100만 개든 이 평평함이 유지돼야 한다. 이것이 이 장 나머지 전체가 다루는 문제다 — **그 평평함을 누가, 어떻게 만드는가.**

> **왜 쿠버네티스가 직접 구현하지 않았는가**
>
> 네트워크 구현은 환경마다 완전히 다르다. 베어메탈, 클라우드 VPC, 온프레미스 SDN, 에어갭 환경마다 최선의 구현이 다르고, 조직마다 기존에 쓰던 네트워크 정책 도구도 다르다. 쿠버네티스가 특정 구현을 강제했다면 그 구현에 맞지 않는 환경에서는 쿠버네티스 자체를 못 썼을 것이다. 그래서 **"무엇을 만족해야 하는가"만 정의하고 "어떻게 만드는가"는 플러그인 계약(CNI)으로 위임**했다. 5장에서 본 컨트롤러 패턴이 "무엇을(조정 대상)"과 "어떻게(개별 컨트롤러 구현)"를 분리한 것과 같은 철학이다.

## 13.2 CNI 스펙 인터페이스

### 쿠버네티스 전용이 아니다

CNI는 [cni.dev](https://cni.dev)에서 관리하는 **독립적인 스펙**이다. 쿠버네티스뿐 아니라 Mesos, Cloud Foundry, 그리고 containerd·CRI-O 같은 컨테이너 런타임이 공통으로 채택했다. 스펙 자체는 놀랍도록 단순하다.

```
계약: "실행 파일을 특정 방식으로 호출하면, 특정 방식으로 응답한다."
      · gRPC 아님, REST 아님 — 그냥 실행 파일 + 환경변수 + stdin/stdout
```

이 단순함이 핵심이다. 어떤 언어로 짜든, 어떤 방식으로 배선하든 상관없다. **호출 계약만 지키면 CNI 플러그인이다.**

### 네 가지 동작

| 동작 | 트리거 | 하는 일 | 반환 |
|---|---|---|---|
| `ADD` | Pod(정확히는 샌드박스) 생성 시 | 네트워크 인터페이스 생성, IP 할당, 라우팅·DNS 설정 | 할당된 IP·인터페이스·라우팅 정보(JSON) |
| `DEL` | Pod 삭제 시 | 인터페이스 제거, IP 반환, 방화벽 규칙 정리 | 없음(성공/실패만) |
| `CHECK` | kubelet의 주기적 상태 확인 | 현재 네트워크 설정이 최초 `ADD` 결과와 일치하는지 검증 | 성공/실패 |
| `VERSION` | 런타임이 플러그인을 처음 인식할 때 | 플러그인이 지원하는 CNI 스펙 버전 목록 보고 | 지원 버전 목록(JSON) |

`CHECK`은 자주 잊히지만 중요하다. 노드가 재부팅되거나 컨테이너 런타임이 비정상 종료된 뒤, Pod의 네트워크 네임스페이스가 여전히 `ADD` 시점의 상태와 일치하는지 확인하는 용도다. 불일치가 발견되면 상위 오케스트레이션(kubelet)이 Pod를 재시작하는 판단 근거가 된다.

### 누가 호출하는가

**흔한 오해: kubelet이 CNI 플러그인을 직접 실행한다.** 아니다. 실제 호출 체인은 다음과 같다.

```
kubelet
  │ CRI (gRPC): RunPodSandbox
  ▼
컨테이너 런타임 (containerd / CRI-O)
  │ 네트워크 네임스페이스 생성
  │ libcni 라이브러리로 CNI 설정 로드
  ▼
CNI 플러그인 바이너리 실행 (/opt/cni/bin/<plugin>)
  │ 환경변수 + stdin JSON 전달
  ▼
플러그인이 netns 안에 인터페이스 생성 → stdout JSON 반환
  ▲
런타임이 결과를 pause 컨테이너의 네트워크로 확정
```

kubelet은 "샌드박스를 만들어 달라"고 CRI로 요청할 뿐, 그 요청을 처리하는 과정에서 CNI를 실제로 호출하는 것은 **런타임에 내장된 libcni 클라이언트**다. 그래서 CNI 호출 실패는 kubelet 로그가 아니라 **containerd/CRI-O 로그에 먼저 나타난다.**

```bash
docker exec k8s-guide-worker journalctl -u containerd -n 50 --no-pager | grep -i cni
```

### 실제 호출 형태

```bash
CNI_COMMAND=ADD \
CNI_CONTAINERID=8f3a9c1e2b7d \
CNI_NETNS=/var/run/netns/cni-4e5f6a7b \
CNI_IFNAME=eth0 \
CNI_PATH=/opt/cni/bin \
CNI_ARGS="IgnoreUnknown=1;K8S_POD_NAMESPACE=default;K8S_POD_NAME=web-abc12" \
/opt/cni/bin/bridge < /etc/cni/net.d/10-bridge.conflist
```

- `CNI_NETNS` — 인터페이스를 심어야 할 네트워크 네임스페이스의 경로.
- `CNI_IFNAME` — 그 네임스페이스 안에서 인터페이스에 붙일 이름 (보통 `eth0`).
- `CNI_ARGS` — 파드 이름·네임스페이스 같은 부가 정보. IPAM 플러그인이나 정책 플러그인이 라벨 기반 결정을 내릴 때 참조하기도 한다.
- 설정 JSON은 **stdin**으로 전달된다.

**반환값**

```json
{
  "cniVersion": "1.0.0",
  "interfaces": [
    { "name": "eth0", "sandbox": "/var/run/netns/cni-4e5f6a7b" }
  ],
  "ips": [
    { "address": "10.244.1.5/24", "gateway": "10.244.1.1", "interface": 0 }
  ],
  "routes": [{ "dst": "0.0.0.0/0", "gw": "10.244.1.1" }],
  "dns": {}
}
```

### 설정 파일과 선택 규칙

CNI 설정 파일은 `/etc/cni/net.d/` 아래에 `.conf`, `.conflist`, `.json` 확장자로 존재한다. 런타임은 이 디렉터리를 스캔해 **파일명 사전순으로 가장 앞선 것 하나만** 사용한다.

```bash
docker exec k8s-guide-worker ls /etc/cni/net.d/
# 10-kindnet.conflist
```

**앞자리 번호가 우선순위다.** `10-kindnet.conflist`와 `99-multus.conf`가 같이 있으면 `10-`이 채택된다. CNI를 교체할 때(예: kindnet → Calico) 이 디렉터리에 새 설정을 두고 기존 파일을 지우거나 이름을 바꿔야 하는 이유가 여기에 있다 — **두 설정이 동시에 존재하면 사전순으로 이긴 것만 조용히 적용되고, 나머지는 무시된다.** 실습에서 CNI를 바꿀 때 흔히 겪는 "분명히 apply했는데 예전 CNI가 계속 동작한다"는 증상의 원인이다.

### 플러그인 체인

`.conflist` 파일은 `plugins` 배열을 가지며, **배열 순서대로 순차 호출**된다. 앞 플러그인의 결과(`prevResult`)가 다음 플러그인의 입력으로 전달된다.

```json
{
  "cniVersion": "1.0.0",
  "name": "k8s-pod-network",
  "plugins": [
    {
      "type": "ptp",
      "ipMasq": false,
      "mtu": 1450,
      "ipam": {
        "type": "host-local",
        "dataDir": "/run/cni-ipam-state",
        "routes": [{ "dst": "0.0.0.0/0" }],
        "ranges": [[{ "subnet": "10.244.1.0/24" }]]
      }
    },
    {
      "type": "portmap",
      "capabilities": { "portMappings": true }
    },
    {
      "type": "bandwidth",
      "capabilities": { "bandwidth": true }
    }
  ]
}
```

```
① 주 플러그인 (ptp / bridge / calico / cilium-cni)
      네트워크 인터페이스 생성, IPAM 위임, 라우팅 설정
        ↓ prevResult 전달
② portmap (메타 플러그인)
      hostPort → containerPort 매핑을 iptables DNAT로 구현
        ↓
③ bandwidth (메타 플러그인)
      tc(traffic control)로 인그레스/이그레스 대역폭 제한
        ↓
④ firewall / tuning / sbr / vrf (필요 시)
      추가 iptables 규칙, sysctl 조정, 정책 라우팅 테이블 분리
```

**메타 플러그인은 각자 한 가지 일만 한다.** 유닉스 철학과 동일하다 — `portmap`은 포트 매핑만, `bandwidth`는 트래픽 셰이핑만 안다. 이렇게 나누면 벤더는 주 플러그인(실제 네트워크 연결)만 신경 쓰고, 부가 기능은 커뮤니티가 유지보수하는 공용 메타 플러그인을 그대로 재사용할 수 있다.

```yaml
# bandwidth 플러그인을 활성화하는 Pod 애노테이션
metadata:
  annotations:
    kubernetes.io/ingress-bandwidth: "10M"
    kubernetes.io/egress-bandwidth: "5M"
```

이 애노테이션은 CNI 자체의 필드가 아니라, kubelet이 Pod 스펙에서 읽어 CNI 런타임 설정(`runtimeConfig`)으로 변환해 `bandwidth` 플러그인에 전달하는 값이다.

### VERSION 협상

런타임이 플러그인을 처음 실행할 때 `CNI_COMMAND=VERSION`으로 지원 스펙 버전을 확인할 수 있다.

```json
{ "cniVersion": "1.0.0", "supportedVersions": ["0.3.0", "0.3.1", "0.4.0", "1.0.0"] }
```

설정 파일의 `cniVersion` 필드가 플러그인이 지원하지 않는 버전이면 `ADD` 자체가 실패한다. CNI를 업그레이드한 뒤 Pod가 `ContainerCreating`에 멈춰 있다면 이 버전 불일치를 의심할 대상 중 하나로 추가해 둔다.

## 13.3 IPAM 플러그인

### 왜 IPAM이 분리되어 있는가

주 플러그인(인터페이스를 만드는 쪽)과 **IP 주소를 어떻게 할당할지 결정하는 로직**은 별개의 관심사다. 같은 `bridge` 플러그인을 쓰면서도 IP는 `host-local`로 로컬 관리할 수도, DHCP 서버에서 받을 수도, 클러스터 전역 IPAM 서버에서 받을 수도 있다. 그래서 CNI 스펙은 IPAM을 **위임(delegate)** 가능한 별도 플러그인으로 분리했다.

| IPAM 플러그인 | 방식 | 상태 저장 위치 |
|---|---|---|
| `host-local` | 노드에 할당된 CIDR 범위 안에서 로컬 파일로 순차 할당 | 노드 로컬 디스크 (`dataDir`) |
| `dhcp` | 외부 DHCP 서버에 임대 요청 (데몬 프로세스 필요) | DHCP 서버 |
| `static` | 고정 IP를 CNI_ARGS나 설정에서 그대로 사용 | 없음 |
| Calico IPAM / Cilium IPAM | 클러스터 전역 상태(etcd 또는 CRD)에서 블록 단위로 할당 | 클러스터 전역 저장소 |

**`host-local`의 실제 동작**

```bash
docker exec k8s-guide-worker ls /run/cni-ipam-state/k8s-pod-network/
docker exec k8s-guide-worker cat /run/cni-ipam-state/k8s-pod-network/last_reserved_ip.0
```

`host-local`은 설정에 지정된 `subnet`(예: `10.244.1.0/24`) 안에서 사용 가능한 다음 IP를 순차 탐색해 할당하고, 할당 결과를 파일로 남긴다. 동시에 여러 `ADD`가 들어와도 충돌하지 않도록 **파일 잠금(flock)** 을 건다 — 같은 노드에서 여러 Pod가 동시에 생성될 때 같은 IP가 중복 할당되는 경쟁 조건을 막는 장치다.

### Node.spec.podCIDR과 node-ipam-controller

`host-local`이 참조하는 `subnet` 값은 어디서 오는가. 이것이 **노드 단위 CIDR 할당**이고, 5장에서 다룬 컨트롤러 패턴이 여기서도 그대로 쓰인다.

```
kube-controller-manager
  └── node-ipam-controller (내장 컨트롤러 중 하나, 5장의 Informer/워크큐 패턴을 그대로 따름)
        │ watch: Node 생성 이벤트
        ▼
  클러스터 CIDR(--cluster-cidr)에서 마스크 크기(--node-cidr-mask-size)만큼 잘라
  새 Node에 할당
        ▼
  Node.spec.podCIDR (및 듀얼스택이면 spec.podCIDRs) 필드에 기록
```

```bash
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.podCIDR}{"\n"}{end}'
```

```
k8s-guide-control-plane   10.244.0.0/24
k8s-guide-worker          10.244.1.0/24
k8s-guide-worker2         10.244.2.0/24
```

```bash
docker exec k8s-guide-control-plane grep -E 'cluster-cidr|node-cidr-mask-size|allocate-node-cidrs' \
  /etc/kubernetes/manifests/kube-controller-manager.yaml
```

```
- --allocate-node-cidrs=true
- --cluster-cidr=10.244.0.0/16
- --node-cidr-mask-size=24
```

**이 컨트롤러가 관여하는 것은 딱 여기까지다.** `/16`을 `/24` 단위로 쪼개 노드에 나눠주는 것이 전부이고, **그 `/24` 안에서 개별 Pod에게 IP를 할당하는 것은 완전히 별개의 층 — 각 노드의 CNI IPAM 플러그인**이 맡는다. 즉 IP 할당은 두 단계로 나뉜다.

```
① 클러스터 전역 층: node-ipam-controller가 노드에 서브넷을 배분 (API 서버를 통해, 조정 주기로)
② 노드 로컬 층: CNI IPAM 플러그인(host-local 등)이 그 서브넷 안에서 Pod에 개별 IP를 배분 (CNI ADD 호출마다, 즉시)
```

이 분리 덕분에 ①은 클러스터 규모로 드물게 일어나는 조정(노드가 추가/제거될 때만)이고, ②는 Pod 생성마다 매우 빈번하게 일어나는 로컬 작업이다. **빈번한 작업을 API 서버까지 왕복시키지 않고 노드에서 끝낸다**는 점에서, 4장에서 본 스케줄러가 바인딩 결정을 로컬 캐시로 빠르게 내리는 것과 같은 설계 원리다.

`host-local`처럼 **노드별로 완전히 격리된 서브넷을 전제로 하는 방식**과 달리, Calico IPAM이나 Cilium IPAM은 노드 간에 더 유연한 블록 재배분(한 노드가 서브넷을 다 쓰면 다른 블록을 추가로 임차)을 지원한다. 트레이드오프는 상태를 클러스터 전역에서 조율해야 하는 복잡도다.

## 13.4 CNI 플러그인 생태계 비교

| | Flannel | Calico | Cilium | Antrea |
|---|---|---|---|---|
| 데이터플레인 | iptables (VXLAN 백엔드) | iptables 또는 eBPF | **eBPF** | OVS(OpenFlow) |
| 기본 전달 방식 | VXLAN 오버레이 | BGP 네이티브 라우팅(기본) 또는 IPIP/VXLAN | eBPF 라우팅(오버레이·네이티브 모두 지원) | OVS 터널(Geneve) 또는 네이티브 |
| 자체 NetworkPolicy | ❌ (지원 안 함) | ✅ (확장 `GlobalNetworkPolicy` 포함) | ✅ (L3/L4 + L7까지) | ✅ (OpenFlow 기반) |
| kube-proxy 대체 | ❌ | 부분적 | ✅ (완전 대체 가능, 19장) | 부분적 |
| 관측성 도구 | 낮음 | 보통 | **Hubble** (흐름 관측 UI) | Traceflow (패킷 경로 추적) |
| 커널 요구사항 | 낮음 | 낮음 | 비교적 최신 커널 권장 | 낮음 |
| 복잡도 | **가장 단순** | 중간 | 높음 | 중간 |

**오버레이 vs 네이티브 라우팅 — 근본 문제**

노드 A의 Pod(`10.244.1.5`)가 노드 B의 Pod(`10.244.2.7`)로 패킷을 보낸다. **물리 네트워크(스위치·라우터)는 `10.244.0.0/16`이라는 대역을 전혀 모른다.** 물리 네트워크가 아는 것은 노드의 실제 IP(`192.168.1.0/24` 같은)뿐이다. 이 패킷을 어떻게 물리 네트워크 위에 실어 보내는가가 CNI 플러그인이 풀어야 할 근본 문제다.

**오버레이(캡슐화)**: Pod 패킷 전체를 노드 간 패킷 속에 통째로 넣는다.

```
┌───────────────────────────────────────────────────┐
│ 외부 IP 헤더 (노드A IP → 노드B IP) — 물리 네트워크가 이해함│
│ ┌───────────────────────────────────────────────┐ │
│ │ VXLAN 헤더 (VNI로 가상 네트워크 구분)              │ │
│ │ ┌───────────────────────────────────────────┐ │ │
│ │ │ 내부 IP 헤더 (Pod A IP → Pod B IP)          │ │ │
│ │ │ 원본 페이로드                                │ │ │
│ │ └───────────────────────────────────────────┘ │ │
│ └───────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

물리 네트워크는 바깥 헤더만 보고 노드 B로 전달하면 그만이다. **어떤 물리 네트워크 위에서도 동작한다**는 것이 최대 강점이지만, 캡슐화 헤더만큼 **MTU가 줄어들고** 캡슐화/역캡슐화에 CPU 비용이 든다.

**네이티브 라우팅**: 패킷을 캡슐화하지 않고, 대신 물리 네트워크(또는 그에 준하는 라우팅 계층)에 "이 Pod CIDR은 이 노드로 가라"는 경로를 알린다.

```
라우팅 테이블에 다음이 존재해야 한다:
  10.244.1.0/24 → 192.168.1.10 (노드 A, 넥스트 홉)
  10.244.2.0/24 → 192.168.1.11 (노드 B, 넥스트 홉)
```

이 경로를 만드는 방법이 BGP(Calico의 BIRD 데몬이 라우터와 피어링해 경로를 광고), 클라우드 제공 라우트 테이블(VPC 라우트에 CNI가 직접 항목 추가), 또는 모든 노드가 같은 L2 세그먼트에 있어 커널이 ARP만으로 직접 라우팅하는 경우다. **캡슐화가 없으므로 MTU 손실도, 캡슐화 CPU 비용도 없다.** 대신 물리 네트워크가 이 경로들을 실제로 받아들일 수 있어야 한다는 전제가 필요하다.

**Cilium은 조금 다른 축이다.** 데이터플레인 자체가 eBPF이므로, 오버레이(VXLAN/Geneve)로 돌릴 수도, 네이티브 라우팅으로 돌릴 수도 있다. eBPF는 "패킷을 어떻게 노드 간에 옮기느냐"의 문제가 아니라 "각 노드 안에서 그 패킷을 얼마나 빠르게 처리하느냐"의 문제를 다시 정의한다. 상세는 19장에서 다룬다. NetworkPolicy의 CNI별 구현 차이는 18장에서 별도로 다룬다.

## 13.5 Pod CIDR 할당과 라우팅 설계

### 클러스터 CIDR과 노드별 서브넷

13.3절에서 본 것처럼 클러스터 전체 Pod CIDR(예: `10.244.0.0/16`, 65,536개 주소)은 마스크 크기(`--node-cidr-mask-size`, 예: `/24`, 254개 사용 가능 주소)만큼 노드별로 쪼개진다. 이 설계에는 두 가지 실무적 함의가 있다.

```
최대 노드 수 = 2^(노드 마스크 - 클러스터 마스크)
             = 2^(24 - 16) = 256개

노드당 최대 Pod 수 = /24의 사용 가능 주소(254개)와 kubelet --max-pods(기본 110) 중 작은 값
```

**클러스터 CIDR과 마스크 크기는 클러스터를 만들 때 결정해야 한다.** 이미 운영 중인 클러스터에서 나중에 넓히기는 매우 번거롭다(모든 노드의 라우팅·IPAM 상태 재조정이 필요). 예상 노드 수보다 넉넉하게 잡아야 하는 이유다.

### 오버레이가 패킷을 옮기는 실제 경로 (VXLAN)

```
노드 A: Pod(10.244.1.5) → ping → Pod(10.244.2.7, 노드 B)

① Pod netns에서 패킷 생성, 목적지 10.244.2.7
② veth를 통해 노드 A의 루트 netns로
③ 라우팅 테이블 조회: 10.244.2.0/24 → dev vxlan.calico (또는 flannel.1)
④ VXLAN 인터페이스가 캡슐화
     - FDB(Forwarding Database)에서 10.244.2.0/24를 담당하는 노드 B의 실제 IP를 조회
     - 외부 UDP/VXLAN 헤더를 씌워 노드 B의 물리 IP로 전송 (UDP 포트 4789 또는 8472)
⑤ 노드 B의 물리 NIC가 수신 → VXLAN 헤더 확인 → 역캡슐화
⑥ 내부 패킷의 목적지(10.244.2.7)로 로컬 라우팅 → veth → Pod netns
```

```bash
# VXLAN 인터페이스와 FDB 확인 (오버레이 CNI일 때)
ip -d link show | grep -A2 vxlan
bridge fdb show dev vxlan.calico   # 또는 flannel.1
```

### 네이티브 라우팅(BGP)이 패킷을 옮기는 실제 경로

```
① Pod netns에서 패킷 생성, 목적지 10.244.2.7
② 노드 A의 라우팅 테이블 조회: 10.244.2.0/24 via 192.168.1.11 dev eth0
   (이 경로는 BIRD가 BGP로 노드 B로부터 받아 커널에 주입한 것)
③ 캡슐화 없이 그대로 물리 네트워크로 전송 (목적지 IP는 여전히 10.244.2.7이지만,
   L2 프레임의 다음 홉은 노드 B)
④ 노드 B가 직접 수신 → 로컬 라우팅 → Pod netns
```

```bash
ip route | grep 10.244
# 10.244.2.0/24 via 192.168.1.11 dev eth0 proto bird
```

`proto bird`라는 표시가 이 경로가 **BGP로 학습된 경로**임을 알려준다. 캡슐화 계층이 아예 없으므로 `tcpdump`로 봐도 평범한 IP 패킷일 뿐이다 — **네이티브 라우팅이 진단하기 쉬운 이유가 이것이다.**

### MTU, 다시 한 번

캡슐화 오버헤드는 그대로 MTU 손실이 된다.

| 캡슐화 | 오버헤드 | 물리 MTU 1500일 때 Pod MTU |
|---|---|---|
| 없음 (네이티브 라우팅) | 0 | 1500 |
| IPIP | 20 bytes | 1480 |
| VXLAN | 50 bytes | 1450 |
| Geneve | 가변(기본 8 + 옵션) | 대략 1450 내외 |

Pod의 네트워크 인터페이스 MTU가 이 값보다 크게 설정되어 있으면, 큰 패킷이 캡슐화된 뒤 물리 MTU를 넘어서면서 **단편화되거나 드롭된다.** 증상은 교묘하다 — ping과 작은 요청은 통과하고, 큰 응답이나 TLS 핸드셰이크만 실패한다. 이 문제의 진단은 15장 이후 데이터플레인을 더 다룬 뒤 19장에서 본격적으로 다룬다. 지금은 **오버레이를 쓰면 MTU를 반드시 낮춰야 한다**는 사실만 기억해 둔다.

## 실습: kind 클러스터의 CNI 설정과 라우팅 검사하기

**① Pod CIDR 확인**

```bash
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.podCIDR}{"\n"}{end}'
```

**② CNI 설정 파일 내용 확인**

```bash
docker exec k8s-guide-worker ls /etc/cni/net.d/
docker exec k8s-guide-worker cat /etc/cni/net.d/10-kindnet.conflist
```

kind의 기본 CNI인 **kindnet(kindnetd)** 은 매우 단순하다. 각 kind 노드가 사실 도커 브리지 네트워크 위의 컨테이너이므로, 별도의 캡슐화 없이 **각 노드에 다른 노드의 Pod CIDR로 가는 정적 경로를 직접 추가**하는 방식으로 동작한다. 즉 **기본 kind 환경은 사실상 네이티브 라우팅의 축소판**이다.

```bash
docker exec k8s-guide-worker ip route | grep 10.244
```

```
10.244.0.0/24 via 172.18.0.2 dev eth0   # control-plane 노드로
10.244.2.0/24 via 172.18.0.4 dev eth0   # worker2 노드로
10.244.1.1 dev veth... scope host       # 로컬 Pod
```

캡슐화 인터페이스(`vxlan.*` 같은)가 보이지 않는다면, 이 클러스터가 캡슐화 없이 직접 라우팅하고 있다는 뜻이다.

**③ 오버레이 방식을 보려면 CNI를 교체한다**

kindnet은 캡슐화 계층을 보여주지 않으므로, VXLAN/IPIP 헤더나 FDB 테이블을 직접 관찰하려면 **Calico를 VXLAN 또는 IPIP 모드로 설치**해야 한다. (13.4절의 표에서 본 것처럼 Calico는 기본이 BGP지만 모드를 바꿀 수 있다.) 이 교체 작업은 클러스터를 `disableDefaultCNI: true`로 생성한 뒤 Calico 매니페스트를 적용하는 방식으로 진행하며, 18장·19장 실습에서도 이 조합(kind + Calico/Cilium)을 계속 사용한다.

```bash
# Calico 설치 후 (VXLAN 모드로 구성했다고 가정)
docker exec k8s-guide-worker ip -d link show | grep -A2 vxlan
docker exec k8s-guide-worker bridge fdb show dev vxlan.calico
```

**④ 교차 노드 Pod-to-Pod 핑 추적**

```bash
kubectl run pa --image=nicolaka/netshoot --restart=Never --overrides='{"spec":{"nodeName":"k8s-guide-worker"}}' -- sleep 3600
kubectl run pb --image=nicolaka/netshoot --restart=Never --overrides='{"spec":{"nodeName":"k8s-guide-worker2"}}' -- sleep 3600
kubectl wait --for=condition=Ready pod/pa pod/pb --timeout=60s

PB_IP=$(kubectl get pod pb -o jsonpath='{.status.podIP}')
kubectl exec pa -- ping -c 3 $PB_IP
```

동시에 양쪽 노드에서 캡처해 패킷이 어느 경로로 나가는지 확인한다.

```bash
docker exec k8s-guide-worker tcpdump -i any -nn "host $PB_IP" -c 5 &
docker exec k8s-guide-worker2 tcpdump -i any -nn "icmp" -c 5 &
kubectl exec pa -- ping -c 3 $PB_IP
```

kindnet(네이티브 라우팅) 환경에서는 노드 A의 물리 인터페이스(`eth0`)에서 목적지가 그대로 `PB_IP`인 평범한 ICMP 패킷이 잡힌다. VXLAN 오버레이 환경이었다면 노드 A의 `eth0`에서는 **UDP 포트 4789(또는 8472)로 감싸진 패킷**이 잡히고, 내부의 원본 ICMP는 `vxlan.calico` 인터페이스에서만 보인다 — 캡슐화 유무가 tcpdump 결과로 바로 드러난다.

**⑤ 정리**

```bash
kubectl delete pod pa pb --ignore-not-found
```

---

## 실습 과제

**과제 1 — 플러그인 체인 분해**
`/etc/cni/net.d/`의 `.conflist` 파일을 열어 `plugins` 배열의 각 요소를 나열하고, 어떤 것이 주 플러그인이고 어떤 것이 메타 플러그인인지 구분한다. 메타 플러그인이 없다면 `portmap`을 추가했을 때 `hostPort`를 쓰는 Pod가 어떻게 달라지는지 예상해 본다.

**과제 2 — 노드 CIDR과 노드 밀도 계산**
`kubectl get nodes -o jsonpath`로 각 노드의 `.spec.podCIDR`을 확인하고, 클러스터 CIDR과 마스크 크기로부터 **이 클러스터가 이론상 수용 가능한 최대 노드 수**를 계산한다. 이어서 각 노드의 `kubelet --max-pods` 설정과 비교해, 실제 제약이 IPAM(서브넷 크기)과 kubelet(maxPods) 중 어느 쪽에서 먼저 걸리는지 판단한다.

**과제 3 — 교차 노드 경로 추적**
서로 다른 노드에 있는 두 Pod 사이의 ping을 tcpdump로 양쪽에서 동시에 캡처하고, 캡슐화 헤더가 있는지 확인한다. 있다면 어떤 프로토콜(VXLAN/IPIP/Geneve)인지, UDP 포트 번호로 식별한다.

**과제 4 — CNI를 Calico로 교체**
kind 클러스터를 기본 CNI 없이(`disableDefaultCNI: true`) 새로 만들고 Calico를 VXLAN 모드로 설치한다. 설치 전후로 `ip route`와 `ip -d link show`의 출력이 어떻게 달라지는지 비교 기록한다.

**과제 5 — MTU 오버헤드 계산 및 검증**
Calico를 VXLAN 모드로 설치한 클러스터에서 Pod의 실제 사용 가능 MTU를 `ping -M do -s`로 이진 탐색해 찾고, 13.5절의 오버헤드 표(50바이트)로 계산한 값과 일치하는지 확인한다.

---

## 요약

- 쿠버네티스 네트워크 모델은 네 가지 요구사항으로 요약된다 — **Pod 간 무NAT 통신, 노드-Pod 간 무NAT 통신, Pod가 보는 자기 IP와 남이 보는 그 IP의 일치, `hostNetwork` 예외.** 이를 만족하는 구현을 CNI 플러그인이 제공한다.
- 이 모델을 택한 이유는 **애플리케이션 개발자에게 포트 충돌·동적 포트 탐색 같은 복잡도를 떠넘기지 않기 위해서**다. 대가는 클러스터 규모의 평평한 라우팅 네트워크를 CNI가 만들어야 한다는 것이다.
- CNI는 쿠버네티스 전용이 아닌 **독립 스펙**이며, `ADD`/`DEL`/`CHECK`/`VERSION` 네 동작을 실행 파일 호출(환경변수 + stdin JSON)로 정의한다. **CNI를 호출하는 것은 kubelet이 아니라 컨테이너 런타임(libcni)** 이다.
- `/etc/cni/net.d/*.conflist`는 **사전순으로 하나만 채택**되고, 그 안의 `plugins` 배열이 주 플러그인 + IPAM + 메타 플러그인(portmap, bandwidth 등)의 **체인**을 구성한다.
- IPAM은 두 층으로 나뉜다 — **클러스터 전역 층**(node-ipam-controller가 `Node.spec.podCIDR`을 배분)과 **노드 로컬 층**(host-local 같은 IPAM 플러그인이 그 안에서 개별 Pod IP를 할당). 빈번한 작업(Pod IP 할당)을 API 서버 왕복 없이 노드에서 끝내는 것이 설계 의도다.
- 노드 간 패킷 이동 방식은 셋이다 — **오버레이**(캡슐화, 범용적이지만 MTU·CPU 비용), **네이티브 라우팅**(BGP 등으로 물리 네트워크에 경로 광고, 오버헤드 없음), **클라우드 네이티브 IP**(VPC IP를 Pod에 직접 할당). Flannel·Calico·Cilium·Antrea는 이 스펙트럼 위에서 서로 다른 지점을 택한다.
- **오버레이는 캡슐화 헤더만큼 MTU가 줄어든다** (VXLAN 50바이트, IPIP 20바이트). 이 값을 Pod MTU 설정에 반영하지 않으면 큰 전송에서만 실패하는 진단하기 어려운 증상이 생긴다.

**다음 장에서는** 이 평평한 Pod 네트워크 위에 얹히는 첫 번째 추상화, Service의 가상 IP와 그 뒤에서 실제 백엔드 목록을 관리하는 EndpointSlice를 들여다본다.
