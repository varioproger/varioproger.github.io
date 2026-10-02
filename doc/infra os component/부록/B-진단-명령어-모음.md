---
title: "부록 B. 진단 명령어 모음"
parent: "부록"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 2
---

# 부록 B. 진단 명령어 모음

> **🎮 게임 서버 개발자에게** — 라이브 장애에서 쓸 도구는 이미 있다. `top`, `ss`, `strace`, `/proc`, `tcpdump`는 컨테이너 안에서도 그대로 통한다. 컨테이너가 같은 커널 위의 프로세스이기 때문이다. 달라지는 것은 **어디에서 실행하느냐**다. 컨테이너 안에서(`kubectl exec`), 호스트에서 컨테이너의 네임스페이스로 들어가서(`nsenter`), 아니면 쿠버네티스 오브젝트에게 물어서(`kubectl get/describe`). 이 부록은 명령을 **계층별**로 모으고, 마지막에 증상에서 첫 명령으로 가는 표를 둔다. 명령 사용법을 외우기보다 "지금 어느 계층의 증거가 필요한가"를 먼저 정하는 용도다.
>
> **🎯 실무에서 이 부록이 필요한 순간**
> - 장애 알림이 와서 첫 60초 동안 무엇을 칠지 정해야 한다.
> - 최소 이미지 컨테이너에 도구가 하나도 없고, 호스트에서 컨테이너 안을 들여다봐야 한다.
> - `kubectl`은 Pod를 `Running`이라 하는데 사용자는 접속이 안 된다고 한다.

## 코어 — 이것만은 100%

> **한 문장:** 명령은 계층(리눅스 → 컨테이너/Docker → 쿠버네티스)을 따라 고르고, 오브젝트가 말해 주지 않는 것은 한 계층 아래(`/proc`, cgroup, `ss`, 규칙 목록)에서 증거를 얻는다.

1. **첫 60초는 시스템 전체를 본다** — `uptime`, `dmesg -T | tail`, `vmstat 1`, `iostat -xz 1`, `free -m`, `sar -n DEV 1`, `top`. 증상이 CPU인지 메모리인지 디스크인지 네트워크인지부터 가른다.
2. **도구가 없을 때도 `/proc`과 cgroup 파일은 있다** — `cat /proc/<pid>/status`, `ls -l /proc/<pid>/fd`, `cat /sys/fs/cgroup/cpu.stat`. 호스트에서는 `nsenter`로 컨테이너의 네임스페이스에 진입한다.
3. **쿠버네티스 증거는 `get` → `describe` → Events → `logs` 순서다** — 객체의 상태와 이벤트가 어느 단계에서 멈췄는지 말해 준다.
4. **변경하지 않는 조회부터** — 아래 모든 조회 명령은 자원을 바꾸지 않는다. 변경(`delete`, `scale`, `patch`, `edit`, `rollout restart`)은 증거가 모인 뒤 한 번에 하나만 한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 부록의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 서버 장비에 SSH로 접속해 `top`/`ss`/`strace` 실행 | 노드에서 직접 실행, 또는 `kubectl exec`로 컨테이너 안에서 실행 | 같은 커널의 같은 도구다 | 컨테이너 안은 `ss`가 그 *네임스페이스의* 소켓만 보여 주고, 최소 이미지에는 도구가 없다 |
| `gdb -p`, `strace -p`로 실행 중 프로세스에 붙기 | 호스트에서 컨테이너 프로세스의 호스트 PID를 얻어 붙기 | PID만 알면 같다 | 컨테이너 안 PID와 호스트 PID가 다르다. `docker inspect`의 `State.Pid`로 호스트 PID를 얻는다 |
| 방화벽 규칙 `iptables -L`로 확인 | `iptables-save -t nat \| grep KUBE-SVC` | 규칙을 읽는다 | 규칙은 사람이 쓴 것이 아니라 kube-proxy/Docker가 선언에서 만든 결과라 Service 수에 비례해 커진다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 컨테이너에 `ps`/`top`이 없을 때 프로세스 상태와 열린 fd를 어디서 얻을까?
> 2. Pod가 `Pending`일 때 어떤 명령이 원인을 가장 직접 알려 줄까?
> 3. 호스트에서 컨테이너의 네트워크 네임스페이스 안에서 `ss`를 실행하려면?
>
> **처리법:** 🛠 실습 아래 명령을 테스트 클러스터에서 직접 실행 → 바로 실행 · 🗺 관계도 증상 → 계층 → 첫 명령 · 📦 카드로 B.11 증상별 첫 명령 표

### 이 부록에서 배우는 것

- 리눅스 계층의 첫 60초와 `/proc`·cgroup·strace·perf·네트워크 명령
- 컨테이너/Docker 계층에서 호스트 PID, 네임스페이스, 규칙을 조회하는 명령
- 쿠버네티스 계층의 `kubectl` 조회 명령(컨트롤 플레인, 워크로드, 네트워크, 스토리지, 권한)
- 증상별 첫 명령 한 장 표

---

## 코어 1. 리눅스 계층 명령

### B.1 첫 60초: 시스템 전체

**한 줄 요약:** load → 커널 메시지 → CPU/IO → 메모리 → 네트워크 순으로 훑는다.

```bash
uptime                    # load average 3개 (1/5/15분). 코어 수보다 크면 CPU 또는 D 상태 대기 포화
dmesg -T | tail           # 커널 메시지. OOM kill, 디스크 에러, 네트워크 링크 다운
vmstat 1                  # r(실행 대기), b(D 상태), si/so(스왑), us/sy/wa/id(CPU 분류), cs
mpstat -P ALL 1           # 코어별 CPU. 한 코어만 100%면 단일 스레드 병목
pidstat 1                 # 프로세스별 CPU 시계열
iostat -xz 1              # 디스크별 r/s, w/s, await, %util
free -m                   # available을 볼 것
sar -n DEV 1              # 인터페이스별 처리량, 패킷/초
sar -n TCP,ETCP 1         # 초당 연결 수(active/passive), 재전송(retrans)
top                       # 종합
```

`vmstat`의 CPU 컬럼은 이렇게 읽는다.

| 컬럼 | 높으면 |
|---|---|
| `us` (user) | 내 코드가 CPU를 씀. 프로파일러로 찾을 차례 |
| `sy` (system) | 커널이 CPU를 씀. 시스템 콜 과다, 컨텍스트 스위칭, 네트워크 스택. `strace -c`, `perf` |
| `wa` (iowait) | CPU가 놀면서 디스크를 기다림. I/O 병목 |
| `st` (steal) | 하이퍼바이저가 CPU를 다른 VM에 줌. 클라우드 노이즈 |
| `id` (idle) | 놀고 있음. CPU 문제가 아님 |

### B.2 `/proc`과 cgroup: 도구가 없을 때

**한 줄 요약:** 최소 이미지에도 `/proc`은 항상 있고, cgroup 파일은 컨테이너의 한도와 스로틀링을 말해 준다.

```bash
cat /proc/loadavg                       # load average + 실행중/전체 태스크 + 마지막 PID
cat /proc/meminfo                       # MemAvailable, Dirty, Slab...
cat /proc/<pid>/status                  # State, VmRSS, Threads, voluntary_ctxt_switches
ls -l /proc/<pid>/fd                    # 열린 fd. 소켓은 socket:[inode]
cat /proc/<pid>/limits                  # 적용된 ulimit
cat /proc/<pid>/cgroup                  # 이 프로세스가 속한 cgroup
cat /proc/<pid>/environ | tr '\0' '\n'  # 환경변수
cat /proc/<pid>/cmdline | tr '\0' ' '   # 실제 커맨드라인
ls /proc/<pid>/task                     # 스레드 목록
cat /proc/<pid>/stack                   # 커널 안에서 어디에 잠들어 있나 (root)
cat /proc/pressure/{cpu,memory,io}      # PSI: 자원 부족으로 태스크가 멈춘 시간 비율 (4.20+)
```

```bash
# 컨테이너의 cgroup v2 한도와 스로틀링
cat /sys/fs/cgroup/cpu.stat             # nr_periods, nr_throttled, throttled_usec
cat /sys/fs/cgroup/system.slice/docker-${CID}.scope/cpu.max       # 호스트에서: 예 "50000 100000"
cat /sys/fs/cgroup/system.slice/docker-${CID}.scope/memory.max
cat /sys/fs/cgroup/system.slice/docker-${CID}.scope/pids.max
```

`nr_throttled / nr_periods`가 스로틀링 비율이다. 값이 높으면(5&#126;10% 초과) limits를 올리거나 스레드 수를 쿼터에 맞춘다([10장](../2부-컨테이너-커널-기능과-Docker/10-cgroup.md), [25장](../3부-쿠버네티스-구성-요소/25-Pod-생명주기와-리소스.md)).

### B.3 추적과 프로파일링

**한 줄 요약:** strace는 커널 경계, perf는 CPU 사용, gdb는 멈춘 프로그램의 스택이다.

```bash
strace -c ./prog                       # 시스템 콜별 횟수/시간 집계 (성능 첫 진단)
strace -p <pid>                        # 실행 중인 프로세스에 붙기 (어느 콜에서 블로킹 중인지)
strace -f -e trace=openat,connect,execve ./prog   # 시작이 안 될 때: ENOENT / EACCES / ECONNREFUSED 찾기
strace -T -tt ./prog                   # 각 호출 소요 시간 + 타임스탬프
perf top -p <pid>                      # 실시간 핫 함수
perf stat ./prog                       # 사이클, IPC, 캐시 미스, 컨텍스트 스위치
perf record -g -p <pid> -- sleep 30    # 30초 샘플링 후 perf report / Flame Graph
perf trace -p <pid>                    # strace 대체 (저오버헤드)
gdb -p <pid> -batch -ex 'thread apply all bt'    # 붙어서 모든 스레드 스택만 뽑고 떼기
ldd ./prog                             # 어떤 공유 라이브러리를 로드하나 (not found 확인)
```

**경고:** `strace`는 ptrace 기반이라 대상을 **수십 배 느리게** 만든다. 운영 중 고부하 프로세스에는 잠깐만 붙이거나 `perf trace`·eBPF를 쓴다. `gdb -p`는 프로세스를 멈춘다.

### B.4 네트워크

**한 줄 요약:** 소켓 상태(`ss`), 커널 카운터(`nstat`), 패킷(`tcpdump`), 연결 추적(`conntrack`) 순으로 본다.

```bash
ss -tanp                    # 모든 TCP 소켓 + 프로세스
ss -tin                     # 연결별 TCP 내부 (rtt, cwnd, retrans)
ss -s                       # 소켓 통계 요약 (TIME_WAIT 수 등)
ss -tlnp | grep :PORT       # 포트 바인딩 실패 시 점유 프로세스
nstat -az                   # 커널 네트워크 카운터 (재전송, 리슨 오버플로, 드롭)
tcpdump -i any -nn -w cap.pcap port 8080       # 패킷 캡처
tcpdump -i any -nn 'tcp[tcpflags] & (tcp-rst) != 0'   # RST 패킷만
ip addr; ip route; ip -s link                  # 인터페이스, 라우팅, 드롭 카운터
conntrack -L                # NAT 연결 추적 테이블 (도커/쿠버네티스 네트워킹)
conntrack -C; conntrack -S  # 항목 수 / 통계 (DNS 간헐 실패, 포트 고갈 의심 시)
```

> 🔬 **심화:** [네트워크 심화서 부록 B. 진단 명령어 모음 — 4. netfilter·iptables·nftables·conntrack](../../Infra%20network%20component/부록/B-진단-명령어-모음.md)

> 📎 **관련 참고:** 같은 부록의 1(소켓·TCP·포트), 3(인터페이스·veth·브리지·라우팅·ARP), 12(패킷 캡처 위치별)절도 [참고](../../Infra%20network%20component/부록/B-진단-명령어-모음.md)하세요.

## 코어 2. 컨테이너·Docker 계층 명령

### B.5 컨테이너 프로세스에 들어가기

**한 줄 요약:** 호스트 PID를 얻고, `nsenter`로 네임스페이스에 진입하면 이미지에 도구가 없어도 호스트 도구를 쓸 수 있다.

```bash
PID=$(docker inspect -f '{{.State.Pid}}' web)           # 컨테이너의 호스트 기준 PID
sudo nsenter --target $PID --net -- ip addr             # 컨테이너 네트워크 네임스페이스에서 실행
sudo nsenter --target $PID --mount -- ls /              # 컨테이너 마운트 네임스페이스
sudo nsenter -t $PID -n ss -tanp                        # 컨테이너의 소켓 목록
docker exec web ip link show eth0                       # 컨테이너 안에서 직접
docker run --rm --pid=host busybox ps -ef               # 호스트 PID 네임스페이스 확인
docker run --rm --net=container:app busybox ip addr     # 다른 컨테이너의 네트워크 네임스페이스에 합류
```

`nsenter`는 `setns()` 시스템 콜을 CLI로 감싼 도구다([9장](../2부-컨테이너-커널-기능과-Docker/09-네임스페이스.md)). 컨테이너 이미지에 셸이나 디버깅 도구가 없을 때 특히 유용하다.

### B.6 Docker와 containerd 상태

**한 줄 요약:** 설정(드라이버, cgroup 버전), 자원 한도, OOM 여부, 네트워크·스토리지 내부를 조회한다.

```bash
docker version
docker info --format 'Cgroup Version: {{.CgroupVersion}}, Cgroup Driver: {{.CgroupDriver}}'
docker info --format '{{.FirewallBackend}}'              # iptables / nftables
docker info | grep -A2 'Storage Driver'
docker system df                                         # 이미지/컨테이너/볼륨 디스크 사용량
docker inspect --format '{{.State.OOMKilled}}' <container>        # cgroup OOM으로 죽었나
docker inspect --format '{{json .GraphDriver}}' <container>       # overlay2 디렉터리 경로
docker network inspect <net> --format '{{json .Containers}}'      # 네트워크에 붙은 컨테이너
docker ps --filter name=<name>
```

```bash
# containerd를 직접 조회 (dockerd가 쓰는 네임스페이스는 moby)
sudo ctr namespaces list
sudo ctr -n moby containers list          # docker ps 결과와 같은 대상
sudo ctr -n moby tasks list
sudo ctr -n moby snapshots list
```

```bash
# 브리지·veth·NAT 규칙
bridge link show
ip -br link show
ip link show type veth
iptables -t nat -L POSTROUTING -n -v | grep -i MASQUERADE
iptables-save -t nat | grep -i docker                  # -p 게시 포트의 DNAT 규칙(DOCKER 체인)
```

## 코어 3. 쿠버네티스 계층 명령

### B.7 맥락 고정과 워크로드

**한 줄 요약:** 어느 클러스터·네임스페이스인지 먼저 고정하고, `get` → `describe` → Events → `logs`로 단계를 좁힌다.

```bash
kubectl config current-context
kubectl get nodes -o wide
kubectl get deploy,rs,pods,svc,endpointslices -n study -o wide
kubectl get events -n study --sort-by=.metadata.creationTimestamp
kubectl describe pod <pod> -n study                    # Events: FailedScheduling, FailedCreatePodSandBox ...
kubectl logs <pod> -n study -c api --tail=100
kubectl logs <pod> -n study -c api --previous --tail=100     # 직전 종료 컨테이너 로그
kubectl describe node <node> | grep -A 5 Taints
kubectl get events --field-selector involvedObject.kind=Node
kubectl exec <pod> -- cat /proc/1/oom_score_adj        # QoS: Guaranteed -997, BestEffort 1000
kubectl exec <pod> -- cat /sys/fs/cgroup/cpu.stat      # 스로틀링
kubectl exec <pod> -- env                              # 환경변수 주입 확인
kubectl exec <pod> -- ls -la /etc/app/                 # ConfigMap 볼륨의 ..data 심볼릭 링크
```

`--previous`는 직전 종료 컨테이너의 로그가 남아 있을 때만 유용하다. 중앙 로그 수집이 필요하다. `kubectl top`(Metrics Server)은 최근 자원 측정용이며 장기 모니터링을 대신하지 않는다.

### B.8 컨트롤 플레인과 노드 에이전트

**한 줄 요약:** 헬스 엔드포인트와 정적 Pod 로그, API 서버가 죽었을 때의 `crictl` 경로.

```bash
kubectl get --raw '/livez?verbose'
kubectl get --raw '/readyz?verbose'
kubectl get --raw '/readyz/etcd'
kubectl get pods -n kube-system -l tier=control-plane
kubectl logs -n kube-system kube-apiserver-<node> --tail=100
kubectl logs -n kube-system kube-controller-manager-<node> --tail=100
kubectl logs -n kube-system kube-scheduler-<node> --tail=100
kubectl --v=9 get pods                                 # 원시 HTTP 요청/응답 관찰
kubectl get --raw /metrics | grep -E 'apiserver_request_(duration_seconds|total)'
kubectl get lease -n kube-system                       # 리더 선출
kubectl get crds; kubectl get apiservices | grep -v Local
```

```bash
# API 서버가 죽어 kubectl이 안 될 때 (노드에서)
crictl ps -a
crictl pods
crictl logs <CONTAINER_ID>
crictl inspect <CONTAINER_ID>
kubeadm certs check-expiration                         # x509 certificate has expired 의심 시
```

```bash
# etcd (TLS 인증서 필요)
etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key \
  get /registry/pods/default --prefix --keys-only
etcdctl endpoint status --write-out=table
etcdctl snapshot save /tmp/etcd-backup.db
```

### B.9 네트워크: Service, DNS, Ingress, NetworkPolicy

**한 줄 요약:** DNS → EndpointSlice → 전달 규칙 → CNI → NetworkPolicy → conntrack 순으로 계층을 가른다.

```bash
# Service / EndpointSlice
kubectl get endpointslices -o wide
kubectl get endpointslices -l kubernetes.io/service-name=<svc> -o yaml
kubectl get svc <svc> -o jsonpath='{.spec.clusterIP}'

# kube-proxy 데이터플레인 (노드에서)
iptables-save -t nat | grep KUBE-SVC            # iptables 모드
ipvsadm -Ln; ip addr show kube-ipvs0            # IPVS 모드
nft list table ip kube-proxy                    # nftables 모드
conntrack -L | grep <service-ip>

# DNS
kubectl exec -it <pod> -- cat /etc/resolv.conf
kubectl exec -it <pod> -- dig <service>.<namespace>.svc.cluster.local
kubectl exec -it <pod> -- dig +search <service>
kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50
kubectl get configmap coredns -n kube-system -o yaml
kubectl run dns-debug --rm -it --image=nicolaka/netshoot --restart=Never -- bash

# Ingress
kubectl get ingress; kubectl get ingressclass
kubectl describe ingress <name>
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller --tail=50

# CNI / NetworkPolicy
cat /etc/cni/net.d/*.conf*
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.podCIDR}{"\n"}{end}'
kubectl get networkpolicy -A
kubectl describe networkpolicy <policy> -n <namespace>
kubectl debug -it <pod> --image=nicolaka/netshoot --target=<container> -- tcpdump -i eth0 -n
```

DNS 실패는 CoreDNS Pod → `kube-dns` EndpointSlice → Pod의 `resolv.conf` → ClusterIP 직접 질의(`dig @10.96.0.10 ...`) → 간헐성(conntrack) 순으로 좁힌다([28장](../3부-쿠버네티스-구성-요소/28-CoreDNS-Ingress-NetworkPolicy.md)). Service ClusterIP로는 안 되는데 CoreDNS Pod IP로 직접 질의하면 되면 kube-proxy 문제다.

> 🔬 **심화:** [네트워크 심화서 부록 B. 진단 명령어 모음 — 9. DNS](../../Infra%20network%20component/부록/B-진단-명령어-모음.md)

> 📎 **관련 참고:** 같은 부록의 8(Service·EndpointSlice·kube-proxy), 10(Ingress), 11(NetworkPolicy·Cilium·Hubble)절도 [참고](../../Infra%20network%20component/부록/B-진단-명령어-모음.md)하세요.

### B.10 스토리지, 설정, 권한

**한 줄 요약:** PVC 상태와 Events, 그리고 "내가 이것을 할 수 있는가"를 `can-i`로 확인한다.

```bash
kubectl get storageclass
kubectl get pvc,pv
kubectl describe pvc <name>                  # waiting for first consumer ...
kubectl get csidrivers
mount | grep kubelet                         # 노드에서 마운트 확인
kubectl get secret <name> -o jsonpath='{.data.password}' | base64 -d   # base64 디코딩 (암호화 아님)

kubectl auth whoami
kubectl auth can-i create pods
kubectl auth can-i list secrets --as=system:serviceaccount:default:my-sa
kubectl auth can-i --list -n default
kubectl rollout restart deployment/<name>    # 설정 변경 후 롤아웃 유도 (변경 명령)
```

## 코어 4. 증상에서 첫 명령으로

### B.11 증상별 첫 명령

**한 줄 요약:** 증상이 가리키는 계층의 첫 증거를 하나만 먼저 본다.

| 증상 | 계층 | 첫 명령 | 다음 |
|---|---|---|---|
| 프로세스/컨테이너가 갑자기 죽었다 | 리눅스 / cgroup | `dmesg -T \| grep -iE 'oom\|segfault\|killed'`, 종료 코드 | 137이면 메모리(OOM/SIGKILL), 139면 코어 덤프. 쿠버네티스는 `describe pod`의 `lastState` |
| 메모리가 계속 는다 | 리눅스 | `/proc/<pid>/status`의 VmRSS 시계열 | `smaps_rollup`, 힙 프로파일러 |
| CPU 100% | 리눅스 | `top -H -p <pid>` | `perf top -p`, Flame Graph |
| 느린데 CPU는 놀고 있다 | 리눅스 | `strace -p`, `vmstat`의 `wa`/`b` | `iostat -x`, `ss -tin` |
| 컨테이너가 느리다/틱이 가끔 튄다 | cgroup | `cat /sys/fs/cgroup/cpu.stat`의 `nr_throttled` | 스레드 수 vs CPU 쿼터 |
| 시작이 안 된다 | 리눅스 | `strace -f -e trace=openat,connect,execve` | `ldd`, `ENOENT`/`EACCES`/`ECONNREFUSED` |
| 포트 바인딩 실패 | 리눅스 | `ss -tlnp \| grep :PORT` | 점유 프로세스 또는 TIME_WAIT |
| fd 부족 (`EMFILE`) | 리눅스 | `ls /proc/<pid>/fd \| wc -l`, `/proc/<pid>/limits` | fd 누수 추적 |
| 디스크 용량이 안 맞다 | 리눅스 | `df -h` vs `du -sh`, `lsof +L1` | 삭제된 열린 파일 |
| 컨테이너 안 도구가 없다 | 컨테이너 | `docker inspect <c>`의 `State.Pid` | `nsenter --target $PID --net -- ...` |
| `kubectl`이 연결 안 됨 | 쿠버네티스 | `kubectl config current-context`, `kubectl get --raw '/readyz?verbose'` | kubeconfig, 인증·인가, endpoint 경로, API 서버 로그/`crictl` |
| Pod `Pending` | 스케줄링 | `kubectl describe pod`의 `FailedScheduling` | requests, taints, affinity, PVC |
| `ContainerCreating`에서 멈춤 | 노드/CNI/CSI | `kubectl describe pod` Events | CNI/IP, 볼륨 mount, sandbox |
| `ImagePullBackOff` | 이미지 | Events의 정확한 image ref | 레지스트리 권한, DNS·네트워크 |
| `CrashLoopBackOff` | 프로세스 | `kubectl logs --previous` | 종료 코드, 설정 누락, probe, OOMKilled |
| Running인데 Ready 아님 | readiness | `kubectl describe pod` conditions, probe 응답 | 포트, 의존 서비스, EndpointSlice |
| 내부 Service 연결 실패 | Service/DNS/정책 | `kubectl get endpointslices`, `dig` | selector, `resolv.conf`, NetworkPolicy, 전달 규칙 |
| DNS 전체 실패 / 정확히 5초 지연 | CoreDNS / conntrack | `kubectl get pods -n kube-system -l k8s-app=kube-dns` | EndpointSlice, `resolv.conf`, NodeLocal DNSCache |
| Ingress 404 / 502 / 503 / 504 | Ingress | `kubectl get ingress`, `kubectl get svc,endpointslice` | 매칭 / 포트·앱 크래시 / 엔드포인트 없음 / 지연 |
| 정책 적용 후 전부 막힘 | NetworkPolicy | `kubectl get networkpolicy -A` | egress 기본 거부 시 DNS(53) 예외 |
| 정책을 적용했는데 안 막힘 | CNI | `kubectl get pods -n kube-system` | CNI가 NetworkPolicy를 시행하는지 |
| PVC `Pending` / Pod `ContainerCreating` | 스토리지 | `kubectl describe pvc` | StorageClass, `WaitForFirstConsumer`, VolumeAttachment |
| API `403 Forbidden` | 인가 | `kubectl auth can-i --list` | Role/RoleBinding |
| API `401` / timeout | 인증 / 경로 | kubeconfig 인증서·토큰 / DNS·route·방화벽 | 만료(`kubeadm certs check-expiration`) |

> 📎 **관련 참고:** 심화서 부록 B 14절은 증상 → 어느 절을 볼지 가리키는 짧은 [색인](../../Infra%20network%20component/부록/B-진단-명령어-모음.md)입니다.

## 실무 적용

### 체크리스트

- [ ] 장애 첫 60초 명령(`uptime`, `dmesg -T | tail`, `vmstat 1`, `iostat -xz 1`, `free -m`, `sar -n DEV 1`, `top`)을 스크립트로 준비했다.
- [ ] 운영 서버에 `strace`를 붙이기 전에 오버헤드를 고려했다(`perf trace`/eBPF 대안).
- [ ] 컨테이너 이미지에 도구가 없을 때를 대비해 `/proc`, cgroup, `nsenter` 사용법을 알고 있다.
- [ ] `kubectl` 명령 전에 context·Namespace를 확인하고, 조회와 변경 명령을 구분한다.
- [ ] 쿠버네티스 증거는 `get` → `describe` → Events → `logs --previous` 순서로 본다.
- [ ] DNS, Service, Ingress, NetworkPolicy, 스토리지 각각의 첫 진단 명령을 말할 수 있다.
- [ ] 장애 중 변경은 한 번에 하나만 하고, 증상별 첫 명령 표(B.11)를 팀 위키에 두었다.

### 시나리오로 확인하기

1. **상황:** 최소 이미지로 만든 게임 서버 컨테이너에서 `ss`와 `ps`가 없다. 열린 소켓과 스레드 수를 알아야 한다.
   **질문:** 어떻게 하나?

   <details markdown="1"><summary>답 확인</summary>

   컨테이너 안에서는 `/proc/<pid>/status`(Threads, State)와 `ls -l /proc/<pid>/fd`를 직접 읽는다. 호스트에서는 `docker inspect <c>`의 `State.Pid`로 호스트 PID를 얻고 `sudo nsenter -t $PID -n ss -tanp`로 컨테이너의 네트워크 네임스페이스에서 호스트의 `ss`를 실행한다. → B.2, B.5

   </details>

2. **상황:** Pod가 계속 재시작한다. `kubectl logs`는 비어 있다.
   **질문:** 무엇을 하나?

   <details markdown="1"><summary>답 확인</summary>

   현재 컨테이너가 막 시작되어 로그가 없을 수 있으므로 `kubectl logs --previous`로 직전 종료 컨테이너 로그를 본다. `kubectl describe pod`의 `lastState`와 종료 코드(137이면 메모리/SIGKILL)를 확인하고, 노드에서는 `dmesg -T | grep -i oom`을 본다. 로그가 수거되었을 수 있으므로 중앙 수집이 필요하다. → B.7, B.11

   </details>

3. **상황:** 클러스터 안의 모든 Pod에서 이름 조회가 실패한다.
   **질문:** 어떤 순서로 좁히나?

   <details markdown="1"><summary>답 확인</summary>

   CoreDNS Pod 상태(`kubectl get pods -n kube-system -l k8s-app=kube-dns`) → `kube-dns` EndpointSlice → Pod의 `/etc/resolv.conf` → ClusterIP 직접 질의(`dig @<kube-dns ClusterIP> ...`) → 간헐적이면 conntrack 경쟁 조건 순이다. ClusterIP로는 실패하고 CoreDNS Pod IP로는 성공하면 kube-proxy 계층이다. → B.9

   </details>

4. **상황:** 컨테이너 안에서 평균 CPU는 낮지만 지연이 주기적으로 튄다.
   **질문:** 어떤 파일을 보나?

   <details markdown="1"><summary>답 확인</summary>

   cgroup CPU 스로틀링을 확인한다. `kubectl exec <pod> -- cat /sys/fs/cgroup/cpu.stat`(또는 호스트의 `docker-<id>.scope/cpu.stat`)에서 `nr_throttled / nr_periods`가 높은지 본다. 높으면 limits를 올리거나 스레드 풀 크기를 쿼터에 맞춘다. → B.2, B.11

   </details>

---

📖 출처: linux/09_디버깅과_도구.md · docker-fundamental/02_격리의_기초.md, 03_자원_제어의_진화.md, 05_containerd_아키텍처_심화.md, 06_이미지와_스토리지.md, 12_브리지_네트워크_심화.md · Kubernetes_Internals_Network_Guide/부록/A-진단-명령어-치트시트.md · kubernetes-textbook-main/03-애플리케이션-노출과-데이터/10-DNS와-서비스-디스커버리.md, 11-인그레스와-외부-트래픽-라우팅.md, 12-스토리지-볼륨에서-CSI까지.md · kubernetes-textbook-main/04-클러스터-운영/17-인증-인가-어드미션.md · kubernetes-qustion-book/02_심화/18_관측_장애진단_업그레이드.md

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[B.1 첫 60초] ____ → dmesg -T | tail → ____ 1 → mpstat → iostat -xz 1 → ____ -m → sar -n DEV 1 → top
[B.2] 도구 없을 때: /____ , /sys/fs/cgroup/____ (nr_throttled)
[B.5] 호스트 PID: docker inspect -f '{{.State.____}}' → ____ --target $PID --net -- ip addr
[B.7] kubectl: get → ____ → Events → logs ____ (직전 종료 컨테이너)
[B.9 DNS] CoreDNS Pod → ____ → resolv.conf → ClusterIP 직접(dig @) → 간헐이면 ____
[B.10] 권한 확인: kubectl auth ____ ,  --as=system:serviceaccount:<ns>:<name>
```

### 2. 인출 질문

1. 장애 첫 60초에 칠 명령 네 개와 각각이 알려 주는 것은?

   <details markdown="1"><summary>답 확인</summary>

   `uptime`(load average가 코어 수보다 큰가), `dmesg -T | tail`(OOM kill, 디스크 에러, 링크 다운), `vmstat 1`(r/b, si/so, us/sy/wa/id, cs), `iostat -xz 1`(디스크 await, %util)이다. 이 밖에 `free -m`, `sar -n DEV 1`, `top`을 본다. → B.1

   </details>

2. 컨테이너 CPU 스로틀링을 확인하는 파일과 지표는?

   <details markdown="1"><summary>답 확인</summary>

   `/sys/fs/cgroup/cpu.stat`(컨테이너 안) 또는 호스트의 `.../docker-<id>.scope/cpu.stat`의 `nr_periods`, `nr_throttled`, `throttled_usec`. `nr_throttled / nr_periods`가 스로틀링 비율이다. → B.2

   </details>

3. 컨테이너에 도구가 없을 때 호스트에서 그 네트워크 네임스페이스의 소켓을 보는 방법은?

   <details markdown="1"><summary>답 확인</summary>

   `docker inspect <container>`의 `State.Pid`로 호스트 PID를 얻고 `sudo nsenter -t <PID> -n ss -tanp`를 실행한다. `nsenter`는 `setns()`를 CLI로 감싼 것이다. → B.5

   </details>

4. `docker ps`와 `ctr -n moby containers list`의 관계는?

   <details markdown="1"><summary>답 확인</summary>

   dockerd가 컨테이너 실행을 containerd에 위임하며 containerd의 `moby` 네임스페이스에 만든다. 두 명령이 보여 주는 컨테이너 목록은 같은 대상이다. → B.6

   </details>

5. `kubectl logs --previous`는 언제 쓰고 한계는?

   <details markdown="1"><summary>답 확인</summary>

   CrashLoopBackOff처럼 컨테이너가 재시작되어 현재 로그가 비었을 때 직전 종료 컨테이너의 로그를 본다. Pod 객체가 없어졌거나 로그가 수거된 뒤까지 항상 조회되지는 않으므로 중앙 수집이 필요하다. → B.7

   </details>

6. DNS 실패 진단 순서와, ClusterIP는 실패하고 CoreDNS Pod IP는 성공하는 경우의 의미는?

   <details markdown="1"><summary>답 확인</summary>

   CoreDNS Pod → `kube-dns` EndpointSlice → Pod `resolv.conf` → ClusterIP 직접 질의 → 간헐성(conntrack) 순이다. Service로는 안 되고 Pod IP로는 되면 kube-proxy 데이터플레인 문제다. → B.9

   </details>

### 3. 기억 고리

- **C++ 유추:** 서버에 SSH로 `top`/`ss`/`strace` 실행 = 노드나 `nsenter`로 같은 도구 사용 ⚠️ 컨테이너의 PID와 호스트 PID는 다르고, `ss`는 해당 네임스페이스의 소켓만 보여 준다.
- **비유:** 계층별 명령 = 청진기(리눅스) → X-ray(컨테이너 네임스페이스) → 진료기록(쿠버네티스 Events). ⚠️ 비유가 깨지는 지점: 진료기록(오브젝트)은 의도된 상태이지 몸(커널)의 실제 상태가 아닐 수 있어 검사로 교차 확인해야 한다.
- **묶음(3의 법칙):** 명령 계층 3(리눅스·컨테이너·쿠버네티스) / 증거 3종(Metrics·Logs·Traces) / 이 부록 첫머리의 실무 상황 3개.
- **대칭·순서:** 조회(안전) ↔ 변경(한 번에 하나). 쿠버네티스: get → describe → Events → logs. 리눅스: load → dmesg → CPU/IO → 메모리 → 네트워크.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "도구가 없는 컨테이너에서 스레드 수와 소켓을 알아내는 방법"을 `/proc`과 `nsenter`로 설명해 보세요.
- **C++ 서버 동료에게 설명하기:** "컨테이너가 느릴 때 CPU 사용률 대신 어떤 파일을 보는가"를 `cpu.stat`로 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "운영 서버에서 `strace -p`로 바로 확인하자" vs B "`strace`는 대상을 수십 배 느리게 하니 `perf trace`·eBPF를 먼저 쓰자" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 증상별 첫 명령을 말할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

이전: [부록 A. 용어집](A-용어집.md)
