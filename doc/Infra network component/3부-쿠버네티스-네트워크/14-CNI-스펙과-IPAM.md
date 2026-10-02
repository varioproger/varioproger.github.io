---
title: "14장. CNI 스펙과 IPAM"
parent: "3부. 쿠버네티스 네트워크"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 14
---

# 14장. CNI 스펙과 IPAM

> **🎮 게임 서버 개발자에게** — 게임 서버를 띄울 때 "이 프로세스가 쓸 IP와 포트는 누가 정하는가"는 보통 운영 스크립트나 설정 파일이 정했다. 쿠버네티스에서는 Pod가 만들어지는 순간 **외부 실행 파일이 호출되어** 인터페이스를 만들고 IP를 배정한다. 이 실행 파일과의 계약이 CNI다. 결정적으로 다른 점은, 이 계약이 gRPC나 REST가 아니라 **"실행 파일 + 환경변수 + stdin/stdout JSON"** 이라는 점(`fork`/`exec`하고 파이프로 JSON을 주고받는 구조)과, 호출 주체가 kubelet이 아니라 **컨테이너 런타임**이라는 점이다. 그래서 네트워크 설정 실패는 kubelet 로그가 아니라 containerd/CRI-O 로그에 먼저 나타난다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - Pod가 `ContainerCreating`에서 멈췄다 → CNI 플러그인 호출 실패 여부를 containerd 로그와 `/etc/cni/net.d`에서 찾아야 한다.
> - CNI를 교체했는데(`apply`했는데) 예전 CNI가 계속 동작한다 → 설정 파일 선택 규칙(사전순 하나만 채택)을 알아야 한다.
> - 노드를 추가하니 Pod에 IP가 안 붙는다 / 클러스터 규모를 정할 때 Pod CIDR을 얼마로 잡아야 하는가 → IPAM의 두 층과 노드 수 상한 계산이 필요하다.

## 코어 — 이것만은 100%

> **한 문장:** CNI는 "런타임이 플러그인 실행 파일을 환경변수와 stdin JSON으로 호출해 ADD/DEL/CHECK/VERSION을 수행한다"는 단순한 계약이고, `/etc/cni/net.d/`의 설정(사전순으로 하나)이 주 플러그인·IPAM·메타 플러그인의 체인을 정하며, Pod IP는 "노드에 서브넷을 나눠 주는 층(node-ipam-controller)"과 "그 서브넷에서 Pod에 한 개씩 주는 층(IPAM 플러그인)" 두 단계로 할당된다.

1. **CNI는 실행 파일 호출 계약이다** — 동작은 `ADD`·`DEL`·`CHECK`·`VERSION` 넷이고, 입력은 환경변수와 stdin JSON, 출력은 stdout JSON이다. 호출하는 것은 kubelet이 아니라 컨테이너 런타임(libcni)이다.
2. **설정은 사전순으로 하나만 채택되고, 그 안의 `plugins` 배열이 체인이다** — 주 플러그인 → (IPAM 위임) → portmap·bandwidth 같은 메타 플러그인 순으로 `prevResult`를 넘기며 호출된다.
3. **IP 할당은 두 층이다** — 클러스터 전역 층(node-ipam-controller가 `Node.spec.podCIDR`을 배분)과 노드 로컬 층(host-local 같은 IPAM 플러그인이 Pod마다 IP 배분). 빈번한 작업을 API 서버 왕복 없이 노드에서 끝내는 설계다.

**이 장의 학습 목표**

- CNI가 정의하는 네 동작과 호출 체인(kubelet → CRI → 런타임 → 플러그인)을 설명한다.
- `ADD` 호출의 입력(환경변수·stdin)과 반환 JSON을 읽을 수 있다.
- CNI 설정 파일의 선택 규칙과 플러그인 체인 구조를 읽고, 각 요소의 역할을 구분한다.
- IPAM 플러그인의 역할과 `Node.spec.podCIDR` 할당 경로를 추적하고, 클러스터 CIDR·노드 마스크로 노드 수 상한을 계산한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 자식 프로세스를 `fork`/`exec`하고 stdin/stdout으로 JSON 주고받기 | CNI 플러그인 호출 | 별도 실행 파일에 입력을 넣고 결과를 받는다 | 데몬이 아니라 호출 때마다 실행되는 바이너리다. 파라미터는 환경변수(`CNI_COMMAND` 등)로, 설정은 stdin으로 전달된다 |
| 인터페이스(순수 가상 클래스)와 구현 클래스 | CNI 스펙과 플러그인 | 호출 계약만 지키면 어떤 구현이든 교체 가능 | 계약은 C++ 시그니처가 아니라 "실행 파일 호출 방식"이다. 어떤 언어로 짜든 상관없다 |
| 플러그인 DLL을 순서대로 체이닝하는 미들웨어 파이프라인 | `plugins` 배열의 체인과 `prevResult` | 앞 단계 결과를 다음 단계 입력으로 넘긴다 | 각 메타 플러그인(portmap, bandwidth)은 한 가지 일만 한다. 앞 결과는 `prevResult`로 전달된다 |
| DHCP/수동 IP 배정 스크립트 | IPAM 플러그인(host-local, dhcp, static) | IP 할당 정책을 분리해 둔다 | 주 플러그인이 IPAM을 **위임(delegate)** 으로 호출한다. 같은 `bridge`로 IP 정책만 바꿀 수 있다 |
| 서버 대수만큼 포트 대역을 미리 나눠 배정 | 노드마다 podCIDR 서브넷 배분 | 큰 범위를 서버별로 쪼개 겹치지 않게 한다 | 노드에 할당된 서브넷 안에서 Pod마다 IP를 주는 것은 별도 층(노드 로컬)이다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. Pod가 만들어질 때 네트워크 인터페이스를 실제로 만드는 것은 누구이고, 그것을 "호출"하는 것은 누구일까? (kubelet? 런타임? 플러그인?)
> 2. CNI 플러그인은 데몬일까, 호출 때마다 실행되는 프로그램일까? 어떻게 입력을 받을까?
> 3. `/etc/cni/net.d/`에 설정 파일이 두 개 있으면 둘 다 적용될까?
> 4. 클러스터 Pod CIDR이 `10.244.0.0/16`이고 노드마다 `/24`를 준다면 노드를 최대 몇 대까지 만들 수 있을까?
> 5. Pod에 IP를 한 개씩 주는 것은 API 서버가 할까, 노드가 할까? 그 이유는?
>
> **처리법:** 🛠 실습 `kubectl get nodes -o jsonpath=...`로 podCIDR 확인, `ls /etc/cni/net.d/`, `cat /etc/cni/net.d/*.conflist`, `ls /opt/cni/bin/`, containerd 로그에서 cni 검색 → 읽자마자 직접 실행 · 🗺 관계도 kubelet → CRI(`RunPodSandbox`) → 런타임(libcni) → `/opt/cni/bin/<plugin>` → netns 안 인터페이스, 그리고 IPAM 두 층 · 📦 카드로 네 동작 ADD/DEL/CHECK/VERSION, `CNI_COMMAND`/`CNI_NETNS`/`CNI_IFNAME`/`CNI_PATH` 환경변수, 최대 노드 수 `2^(노드 마스크 − 클러스터 마스크)`

---

## 코어 1. CNI는 실행 파일 호출 계약이다

### 1.1 쿠버네티스 전용이 아닌 단순한 계약

**한 줄 요약:** 실행 파일을 정해진 방식(환경변수 + stdin JSON)으로 호출하면 정해진 방식(stdout JSON)으로 응답한다. 이 호출 계약만 지키면 CNI 플러그인이다.

CNI는 [cni.dev](https://cni.dev)에서 관리하는 **독립적인 스펙**이다. 쿠버네티스뿐 아니라 Mesos, Cloud Foundry, containerd·CRI-O 같은 컨테이너 런타임이 공통으로 채택했다.

```
계약: "실행 파일을 특정 방식으로 호출하면, 특정 방식으로 응답한다."
      · gRPC 아님, REST 아님 — 그냥 실행 파일 + 환경변수 + stdin/stdout
```

어떤 언어로 짜든, 어떤 방식으로 배선하든 상관없다. 노드의 `/opt/cni/bin/`에 플러그인 바이너리들이 있다.

```bash
docker exec k8s-guide-worker ls /opt/cni/bin/
```
```
bandwidth  bridge  dhcp  firewall  host-local  loopback  portmap  ptp  static  tuning  vlan
kindnet    (또는 calico, cilium-cni 등)
```

### 1.2 네 가지 동작

**한 줄 요약:** ADD는 만들고, DEL은 정리하고, CHECK는 검증하고, VERSION은 지원 버전을 알린다.

| 동작 | 트리거 | 하는 일 | 반환 |
|---|---|---|---|
| `ADD` | Pod(정확히는 샌드박스) 생성 시 | 네트워크 인터페이스 생성, IP 할당, 라우팅·DNS 설정 | 할당된 IP·인터페이스·라우팅 정보(JSON) |
| `DEL` | Pod 삭제 시 | 인터페이스 제거, IP 반환, 방화벽 규칙 정리 | 없음(성공/실패만) |
| `CHECK` | kubelet의 주기적 상태 확인 | 현재 네트워크 설정이 최초 `ADD` 결과와 일치하는지 검증 | 성공/실패 |
| `VERSION` | 런타임이 플러그인을 처음 인식할 때 | 플러그인이 지원하는 CNI 스펙 버전 목록 보고 | 지원 버전 목록(JSON) |

`CHECK`은 자주 잊히지만 중요하다. 노드가 재부팅되거나 컨테이너 런타임이 비정상 종료된 뒤, Pod의 네트워크 네임스페이스가 `ADD` 시점의 상태와 여전히 일치하는지 확인하는 용도다. 불일치가 발견되면 상위 오케스트레이션(kubelet)이 Pod를 재시작하는 판단 근거가 된다.

### 1.3 누가 호출하는가 — kubelet이 아니라 런타임

**한 줄 요약:** kubelet은 CRI로 샌드박스 생성만 요청하고, CNI를 실제로 실행하는 것은 런타임에 내장된 libcni 클라이언트다.

흔한 오해는 "kubelet이 CNI 플러그인을 직접 실행한다"는 것이다. 실제 호출 체인은 다음과 같다.

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

CNI 설정 파일(`/etc/cni/net.d/`)을 읽는 주체도 kubelet이 아니라 containerd/CRI-O다. 그래서 **CNI 호출 실패는 kubelet 로그가 아니라 containerd/CRI-O 로그에 먼저 나타난다.**

```bash
docker exec k8s-guide-worker journalctl -u containerd -n 50 --no-pager | grep -i cni
```

> **[보충]** 원천 두 곳의 순서 서술이 약간 다르다. `Kubernetes_Internals_Network_Guide`는 "런타임이 네임스페이스 생성 → CNI 실행 → 결과를 pause 컨테이너의 네트워크로 확정"으로, `kubernetes-textbook-main`은 "네임스페이스 생성 → CNI(ADD) → pause 컨테이너 시작"으로 그린다. 둘 다 "런타임이 CNI를 호출한다, kubelet이 아니다"는 핵심은 같으며, 이 책은 앞의 최신·상세한 서술을 따랐다. 13장에서 pause를 샌드박스 소유자로 설명했다([13장](13-쿠버네티스-네트워크-모델과-Pod-네트워크.md)).

### 1.4 실제 호출 형태와 반환값

**한 줄 요약:** 환경변수로 "무엇을, 어느 netns에, 어떤 이름으로"를 알리고, 설정 JSON은 stdin으로 넣으며, 결과는 IP·인터페이스·라우트 JSON이다.

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
- `CNI_IFNAME` — 그 네임스페이스 안에서 인터페이스에 붙일 이름(보통 `eth0`).
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

13장의 "손으로 Pod 조립"(veth 만들기, IP·게이트웨이 설정)이 정확히 이 `ADD`가 하는 일이다([13장](13-쿠버네티스-네트워크-모델과-Pod-네트워크.md)). 원천(`kubernetes-textbook-main` 23장 과제 1)은 만들어 둔 네임스페이스에 플러그인을 직접 호출해 보라고 제안한다.

```bash
CNI_COMMAND=ADD CNI_CONTAINERID=test CNI_NETNS=/var/run/netns/pod-lab \
CNI_IFNAME=eth0 CNI_PATH=/opt/cni/bin \
/opt/cni/bin/ptp < /etc/cni/net.d/10-kindnet.conflist
```

반환된 JSON을 확인하고 `DEL`로 정리한다.

### 1.5 VERSION 협상

**한 줄 요약:** 설정의 `cniVersion`을 플러그인이 지원하지 않으면 `ADD` 자체가 실패한다.

런타임이 플러그인을 처음 실행할 때 `CNI_COMMAND=VERSION`으로 지원 스펙 버전을 확인할 수 있다.

```json
{ "cniVersion": "1.0.0", "supportedVersions": ["0.3.0", "0.3.1", "0.4.0", "1.0.0"] }
```

설정 파일의 `cniVersion` 필드가 플러그인이 지원하지 않는 버전이면 `ADD` 자체가 실패한다. CNI를 업그레이드한 뒤 Pod가 `ContainerCreating`에 멈춰 있다면 이 버전 불일치를 의심할 대상 중 하나로 추가해 둔다.

## 코어 2. 설정은 사전순으로 하나만 채택되고, `plugins` 배열이 체인이다

### 2.1 설정 파일과 선택 규칙

**한 줄 요약:** `/etc/cni/net.d/`의 `.conf`/`.conflist`/`.json` 중 파일명 사전순으로 가장 앞선 것 하나만 쓰이고 나머지는 조용히 무시된다.

CNI 설정 파일은 `/etc/cni/net.d/` 아래에 `.conf`, `.conflist`, `.json` 확장자로 존재한다. 런타임은 이 디렉터리를 스캔해 **파일명 사전순으로 가장 앞선 것 하나만** 사용한다.

```bash
docker exec k8s-guide-worker ls /etc/cni/net.d/
# 10-kindnet.conflist
```

**앞자리 번호가 우선순위다.** `10-kindnet.conflist`와 `99-multus.conf`가 같이 있으면 `10-`이 채택된다. CNI를 교체할 때(예: kindnet → Calico) 새 설정을 두고 기존 파일을 지우거나 이름을 바꿔야 하는 이유다. **두 설정이 동시에 존재하면 사전순으로 이긴 것만 조용히 적용되고 나머지는 무시된다.** "분명히 apply했는데 예전 CNI가 계속 동작한다"는 증상의 원인이다.

### 2.2 플러그인 체인

**한 줄 요약:** `plugins` 배열 순서대로 호출되고, 앞 플러그인의 결과(`prevResult`)가 다음 플러그인의 입력이 된다.

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

**메타 플러그인은 각자 한 가지 일만 한다.** `portmap`은 포트 매핑만, `bandwidth`는 트래픽 셰이핑만 안다. 이렇게 나누면 벤더는 주 플러그인(실제 네트워크 연결)만 신경 쓰고, 부가 기능은 커뮤니티가 유지보수하는 공용 메타 플러그인을 재사용할 수 있다.

`bandwidth` 플러그인은 Pod 애노테이션으로 켠다.

```yaml
metadata:
  annotations:
    kubernetes.io/ingress-bandwidth: "10M"
    kubernetes.io/egress-bandwidth: "5M"
```

이 애노테이션은 CNI 자체의 필드가 아니라, kubelet이 Pod 스펙에서 읽어 CNI 런타임 설정(`runtimeConfig`)으로 변환해 `bandwidth` 플러그인에 전달하는 값이다.

> **[보충]** 원천 두 곳이 보여 주는 kind의 `10-kindnet.conflist` 예시가 서로 다르다(`name`이 `k8s-pod-network` 대 `kindnet`, `cniVersion` `1.0.0` 대 `0.3.1`, `mtu` `1450` 대 `1500`). 서로 다른 환경·버전의 예시로 보이며 구조(`ptp` + `host-local` + `portmap`)는 같다. 자신의 노드에서 `cat /etc/cni/net.d/*.conflist`로 실제 값을 확인한다. 위 JSON은 `Kubernetes_Internals_Network_Guide`의 것이다.

## 코어 3. IP 할당은 두 층이다

### 3.1 IPAM이 분리되어 있는 이유

**한 줄 요약:** 인터페이스를 만드는 일과 IP를 정하는 정책은 별개의 관심사라서, IPAM을 위임 가능한 별도 플러그인으로 분리했다.

같은 `bridge` 플러그인을 쓰면서도 IP는 `host-local`로 로컬 관리할 수도, DHCP 서버에서 받을 수도, 클러스터 전역 IPAM 서버에서 받을 수도 있다. 그래서 CNI 스펙은 IPAM을 **위임(delegate)** 가능한 별도 플러그인으로 분리했다.

| IPAM 플러그인 | 방식 | 상태 저장 위치 |
|---|---|---|
| `host-local` | 노드에 할당된 CIDR 범위 안에서 로컬 파일로 순차 할당 | 노드 로컬 디스크 (`dataDir`) |
| `dhcp` | 외부 DHCP 서버에 임대 요청 (데몬 프로세스 필요) | DHCP 서버 |
| `static` | 고정 IP를 CNI_ARGS나 설정에서 그대로 사용 | 없음 |
| Calico IPAM / Cilium IPAM | 클러스터 전역 상태(etcd 또는 CRD)에서 블록 단위로 할당 | 클러스터 전역 저장소 |

`host-local`은 설정에 지정된 `subnet`(예: `10.244.1.0/24`) 안에서 사용 가능한 다음 IP를 순차 탐색해 할당하고, 결과를 파일로 남긴다. 동시에 여러 `ADD`가 들어와도 충돌하지 않도록 **파일 잠금(flock)** 을 건다. 같은 노드에서 여러 Pod가 동시에 생성될 때 같은 IP가 중복 할당되는 경쟁 조건을 막는 장치다.

```bash
docker exec k8s-guide-worker ls /run/cni-ipam-state/k8s-pod-network/
docker exec k8s-guide-worker cat /run/cni-ipam-state/k8s-pod-network/last_reserved_ip.0
```

> **[보충]** 위 상태 디렉터리 이름(`k8s-pod-network`)은 설정의 `name`과 같다. 원천의 다른 절은 같은 위치를 `kindnet`으로 적는다(`/run/cni-ipam-state/kindnet/`). 설정 `name`에 따라 달라지는 값이므로 자신의 환경에서 `ls /run/cni-ipam-state/`로 확인한다.

### 3.2 노드에 서브넷을 나눠 주는 층 — node-ipam-controller

**한 줄 요약:** kube-controller-manager의 node-ipam-controller가 클러스터 CIDR을 노드 마스크 크기로 잘라 `Node.spec.podCIDR`에 기록한다.

`host-local`이 참조하는 `subnet` 값은 어디서 오는가. 노드 단위 CIDR 할당이고, 컨트롤러 패턴이 여기서도 쓰인다.

```
kube-controller-manager
  └── node-ipam-controller (내장 컨트롤러 중 하나)
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

### 3.3 두 층으로 나뉜 이유와 규모 계산

**한 줄 요약:** 드문 일(노드 추가)은 클러스터 전역에서, 빈번한 일(Pod마다 IP)은 노드 로컬에서 처리한다. 노드 수 상한은 `2^(노드 마스크 − 클러스터 마스크)`다.

이 컨트롤러가 관여하는 것은 `/16`을 `/24` 단위로 쪼개 노드에 나눠 주는 데까지다. **그 `/24` 안에서 개별 Pod에게 IP를 할당하는 것은 각 노드의 CNI IPAM 플러그인**이 맡는다.

```
① 클러스터 전역 층: node-ipam-controller가 노드에 서브넷을 배분 (API 서버를 통해, 조정 주기로)
② 노드 로컬 층: CNI IPAM 플러그인(host-local 등)이 그 서브넷 안에서 Pod에 개별 IP를 배분 (CNI ADD 호출마다, 즉시)
```

①은 노드가 추가/제거될 때만 일어나는 드문 조정이고, ②는 Pod 생성마다 일어나는 매우 빈번한 로컬 작업이다. **빈번한 작업을 API 서버까지 왕복시키지 않고 노드에서 끝낸다**는 것이 설계 의도다.

`host-local`처럼 노드별로 완전히 격리된 서브넷을 전제로 하는 방식과 달리, Calico IPAM이나 Cilium IPAM은 노드 간에 더 유연한 블록 재배분(한 노드가 서브넷을 다 쓰면 다른 블록을 추가로 임차)을 지원한다. 트레이드오프는 상태를 클러스터 전역에서 조율해야 하는 복잡도다.

```
클러스터 CIDR: 10.244.0.0/16  → 65,536개 IP
노드당 CIDR:   /24            → 254개 (실제로는 maxPods 110에 제한)

최대 노드 수 = 2^(노드 마스크 - 클러스터 마스크)
             = 2^(24 - 16) = 256개

노드당 최대 Pod 수 = /24의 사용 가능 주소(254개)와 kubelet --max-pods(기본 110) 중 작은 값
```

**클러스터 CIDR과 마스크 크기는 클러스터를 만들 때 결정해야 한다.** 운영 중인 클러스터에서 나중에 넓히기는 매우 번거롭다(모든 노드의 라우팅·IPAM 상태 재조정이 필요). 예상 노드 수보다 넉넉하게 잡아야 한다. 노드가 256개를 넘으면 IP를 할당할 수 없다.

## 실무 적용

### 체크리스트

- [ ] CNI는 실행 파일 + 환경변수 + stdin/stdout JSON 계약이다. 동작은 `ADD`/`DEL`/`CHECK`/`VERSION`.
- [ ] CNI를 호출하는 것은 kubelet이 아니라 컨테이너 런타임(libcni)이다. 실패는 containerd/CRI-O 로그(`journalctl -u containerd | grep -i cni`)에서 먼저 찾는다.
- [ ] `/etc/cni/net.d/`에서는 파일명 사전순 맨 앞 설정 하나만 쓰인다. CNI를 교체할 때는 기존 설정을 지우거나 이름을 바꾼다.
- [ ] 설정의 `plugins` 배열은 순서대로 호출된다(주 플러그인 → portmap → bandwidth 등). `cniVersion`이 플러그인 지원 목록에 있는지 확인한다.
- [ ] Pod IP 할당은 2층이다: node-ipam-controller(`Node.spec.podCIDR`) + 노드 IPAM 플러그인. `--cluster-cidr`와 `--node-cidr-mask-size`로 최대 노드 수를 미리 계산한다.
- [ ] Pod가 `ContainerCreating`에 멈추면 CNI 플러그인 실패(containerd 로그, `/etc/cni/net.d`), Pod에 IP가 없으면 IPAM 고갈·CNI 설정(`describe pod` 이벤트)을 본다.

### 시나리오로 확인하기

1. **상황:** CNI를 새 버전으로 업그레이드한 뒤 신규 게임룸 Pod가 계속 `ContainerCreating`에 머문다. kubelet 로그에는 별다른 단서가 없다.
   **질문:** 어디를 보고 무엇을 의심하나?

   <details markdown="1"><summary>답 확인</summary>

   CNI를 호출하는 것은 kubelet이 아니라 컨테이너 런타임이므로 containerd/CRI-O 로그(`journalctl -u containerd -n 50 --no-pager | grep -i cni`)와 `/etc/cni/net.d`를 본다. 의심 대상 중 하나는 설정의 `cniVersion`이 플러그인이 지원하지 않는 버전이라 `ADD`가 실패하는 경우다. `CNI_COMMAND=VERSION`으로 지원 버전 목록을 확인한다. → 코어 1

   </details>

2. **상황:** kindnet 클러스터를 Calico로 바꾸려고 Calico 설정을 `/etc/cni/net.d/`에 추가하고 매니페스트를 `apply`했다. 그런데 예전 CNI 동작이 그대로다.
   **질문:** 원인과 조치는?

   <details markdown="1"><summary>답 확인</summary>

   런타임은 `/etc/cni/net.d/`를 스캔해 파일명 사전순으로 가장 앞선 것 하나만 쓴다. 예를 들어 `10-kindnet.conflist`가 남아 있으면 더 뒤 번호의 새 설정은 조용히 무시된다. 기존 파일을 지우거나 이름을 바꿔 새 설정이 사전순으로 앞서게 한다. → 코어 2 (2.1)

   </details>

3. **상황:** Pod CIDR `10.244.0.0/16`, 노드 마스크 `/24`로 클러스터를 만들었다. 사업 확장으로 노드를 300대까지 늘려야 한다.
   **질문:** 가능한가? 왜 클러스터 생성 때 정해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   최대 노드 수는 `2^(24 - 16) = 256`이라 300대는 불가능하고, 256개를 넘으면 IP를 할당할 수 없다. 클러스터 CIDR과 마스크 크기는 생성 시 정해야 하고 운영 중 넓히기는 모든 노드의 라우팅·IPAM 상태 재조정이 필요해 매우 번거롭기 때문이다. 노드당 Pod 수는 `/24`의 254개와 kubelet `--max-pods`(기본 110) 중 작은 값이다. → 코어 3 (3.3)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] CNI 계약: ( ? ) 호출 + 환경변수 + ( ? ) 입력 JSON → ( ? ) 출력 JSON
  동작 4개: ( ? ) / DEL / ( ? ) / VERSION
  호출 체인: kubelet →(CRI) ( ? ) → 런타임(( ? )) → /opt/cni/bin/<plugin>
  로그는 ( ? ) 에 먼저 나타난다
  환경변수: CNI_COMMAND / CNI_CONTAINERID / CNI_( ? ) / CNI_IFNAME / CNI_PATH / CNI_ARGS

[코어 2] /etc/cni/net.d/ → 파일명 ( ? )순으로 ( ? )개만 채택
  체인: 주 플러그인(ptp/bridge/calico/cilium-cni) → ( ? ) → portmap → ( ? )
  앞 결과 전달: ( ? ) / cniVersion이 지원 목록 밖이면 ADD ( ? )

[코어 3] IPAM 2층: ① ( ? ) 가 Node.spec.( ? ) 배분 ② ( ? ) 플러그인이 Pod IP 배분
  플러그인 4종: host-local / ( ? ) / static / Calico·Cilium IPAM
  최대 노드 수 = 2^( ? )      노드당 Pod = min(/24의 254, ( ? ) 110)
```

### 2. 인출 질문

1. CNI 플러그인은 데몬인가? 어떤 방식으로 입력을 받고 결과를 돌려주는가?

   <details markdown="1"><summary>답 확인</summary>

   데몬이 아니라 호출 때마다 실행되는 실행 파일이다. 파라미터는 환경변수(`CNI_COMMAND`, `CNI_NETNS`, `CNI_IFNAME` 등), 설정은 stdin JSON으로 받고, 결과는 stdout JSON(IP·인터페이스·라우트·DNS)으로 돌려준다. gRPC도 REST도 아니다. → 코어 1 (1.1, 1.4)

   </details>

2. ADD, DEL, CHECK, VERSION 각각은 언제 호출되고 무엇을 하는가?

   <details markdown="1"><summary>답 확인</summary>

   ADD는 샌드박스 생성 시 인터페이스 생성·IP 할당·라우팅·DNS 설정, DEL은 삭제 시 인터페이스 제거·IP 반환·방화벽 정리, CHECK는 현재 설정이 최초 ADD 결과와 일치하는지 검증(재부팅 등 이후), VERSION은 플러그인이 지원하는 스펙 버전 목록 보고. → 코어 1 (1.2)

   </details>

3. CNI를 실제로 호출하는 주체는? 그래서 CNI 실패 로그는 어디서 찾는가?

   <details markdown="1"><summary>답 확인</summary>

   kubelet이 아니라 컨테이너 런타임(containerd/CRI-O)의 libcni 클라이언트다. kubelet은 CRI `RunPodSandbox`로 요청만 한다. 그래서 실패는 kubelet 로그가 아니라 containerd/CRI-O 로그에 먼저 나타난다. → 코어 1 (1.3)

   </details>

4. `/etc/cni/net.d/`에 `10-kindnet.conflist`와 `99-multus.conf`가 있으면 무엇이 쓰이는가?

   <details markdown="1"><summary>답 확인</summary>

   파일명 사전순으로 가장 앞선 `10-kindnet.conflist` 하나만 쓰이고 `99-multus.conf`는 조용히 무시된다. CNI 교체 후에도 예전 CNI가 동작하는 원인이 된다. → 코어 2 (2.1)

   </details>

5. `plugins` 체인에서 앞 플러그인의 결과는 어떻게 다음으로 전달되며, 메타 플러그인의 예와 역할은?

   <details markdown="1"><summary>답 확인</summary>

   `prevResult`로 전달되며 배열 순서대로 호출된다. `portmap`은 hostPort→containerPort 매핑을 iptables DNAT로, `bandwidth`는 tc로 인그레스/이그레스 대역폭을 제한한다(Pod 애노테이션 `kubernetes.io/ingress-bandwidth` 등을 kubelet이 런타임 설정으로 변환해 전달). 각자 한 가지 일만 한다. → 코어 2 (2.2)

   </details>

6. IPAM을 별도 플러그인으로 분리한 이유와 대표 IPAM 플러그인 네 가지는?

   <details markdown="1"><summary>답 확인</summary>

   인터페이스를 만드는 일과 IP 할당 정책이 별개의 관심사라서 같은 주 플러그인으로 IP는 로컬/DHCP/클러스터 전역 IPAM 중 고를 수 있게 위임한다. `host-local`(노드 CIDR 안 로컬 파일 순차 할당, flock), `dhcp`(외부 DHCP), `static`(고정 IP), Calico/Cilium IPAM(클러스터 전역 상태에서 블록 단위). → 코어 3 (3.1)

   </details>

7. `Node.spec.podCIDR`은 누가 어떻게 채우는가?

   <details markdown="1"><summary>답 확인</summary>

   kube-controller-manager 안의 node-ipam-controller가 Node 생성을 watch하다가 `--cluster-cidr`에서 `--node-cidr-mask-size` 크기로 잘라 새 Node의 `spec.podCIDR`(듀얼스택이면 `podCIDRs`)에 기록한다. → 코어 3 (3.2)

   </details>

8. IP 할당이 두 층으로 나뉜 설계 이유와, 클러스터 CIDR `/16` + 노드 `/24`일 때 최대 노드 수는?

   <details markdown="1"><summary>답 확인</summary>

   노드 추가 때만 일어나는 드문 조정(서브넷 배분)은 클러스터 전역(API 서버 경유)에서, Pod 생성마다 일어나는 빈번한 IP 배분은 노드 로컬 IPAM 플러그인에서 끝내 API 서버 왕복을 피하기 위해서다. 최대 노드 수는 `2^(24-16) = 256`이다. → 코어 3 (3.3)

   </details>

### 3. 기억 고리

- **C++ 유추:** CNI 플러그인 ≈ `exec`로 띄우는 헬퍼 바이너리(환경변수 + stdin JSON → stdout JSON). 체인 ≈ 미들웨어 파이프라인. ⚠️ 깨지는 곳: 헬퍼를 호출하는 쪽이 kubelet이 아니라 컨테이너 런타임이고, 설정 디렉터리에서는 여러 개가 합쳐지는 것이 아니라 사전순 하나만 채택된다.
- **비유:** CNI 호출 = 새 입주 세대에 "통신 설치 기사"를 부르는 절차. 관리실(런타임)이 기사(플러그인)를 호출하고, 작업 지시서(JSON)와 주소(`CNI_NETNS`)를 건네며, 기사는 회선(인터페이스)과 번호(IP)를 연결하고 결과서를 남긴다. IP 번호는 동(노드) 단위 번호대를 관리사무소 본부(node-ipam-controller)가 나눠 주고, 세대별 번호는 동 사무소(IPAM 플러그인)가 준다. ⚠️ 비유가 깨지는 지점: 기사는 상주 직원이 아니라 호출 때마다 실행되는 바이너리고, 현실의 공사와 달리 `CHECK`로 설치 상태를 다시 검증하고 `DEL`로 회수할 수 있다.
- **묶음(3의 법칙):** 호출 주체 체인 3단(kubelet → 런타임 → 플러그인) / 설정 3요소(주 플러그인·IPAM·메타 플러그인) / IPAM 3대 방식(host-local·dhcp·static) + 클러스터 전역 IPAM.
- **대칭·순서:** `ADD` ↔ `DEL`, 전역 층(노드에 서브넷) → 로컬 층(Pod에 IP), 노드 수 상한 `2^(노드 마스크 − 클러스터 마스크)`.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Pod가 만들어질 때 IP가 붙기까지 누가 누구를 호출하는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "왜 CNI는 gRPC 서비스가 아니라 실행 파일 호출로 정의돼 있고, 그 장점이 무엇인지"를 설명해 보세요.
- **랜덤 논리 게임:** A "Pod IP까지 API 서버(중앙)가 한 곳에서 할당하는 것이 일관적이다" vs B "노드 로컬 IPAM이 빠르고 가볍다" — 양쪽을 번갈아 변호해 보세요. (호출 빈도, 노드 간 블록 재배분의 복잡도가 근거)
- **AI 역할 반전:** "내가 CNI 호출 체인과 IPAM 두 층을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 3개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: Kubernetes_Internals_Network_Guide/03-네트워크/13-네트워킹-모델과-CNI-스펙.md (13.2 CNI 스펙 인터페이스, 13.3 IPAM 플러그인, 13.5 Pod CIDR 할당과 라우팅 설계 일부); kubernetes-textbook-main/05-내부-동작-파헤치기/23-CNI와-대규모-네트워크-트러블슈팅.md (23.1 CNI 스펙, 23.5 IP 고갈, 23.6 증상별 원인표, 실습 과제 1); Kubernetes_Internals_Network_Guide/01-내부-아키텍처/06-kubelet-런타임-kube-proxy-개요.md (6.2 CRI 아키텍처의 RunPodSandbox)*
