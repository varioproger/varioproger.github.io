---
title: "부록 B. 진단 명령어 모음"
parent: "부록"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 2
---

# 부록 B. 진단 명령어 모음

네트워크 장애 진단에 쓰는 명령을 계층별로 모았다. 절 순서는 아래 계층에서 위 계층으로 올라가는 순이다(소켓 → 네임스페이스·인터페이스 → netfilter·conntrack → 오버레이·MTU → Docker → 쿠버네티스 Service·DNS·정책 → 관측 도구). 장애 때 확인하는 순서(DNS → 노드 간 연결 → Service → 정책 → 노드 자원)는 [23장](../4부-진단/23-네트워크-장애-진단.md)을 따르고, 맨 끝 14절의 증상 색인으로 해당 절을 찾는다. `web`, `<pod>`, `k8s-guide-worker`(kind 노드 컨테이너 이름), `10.244.2.7` 같은 이름과 값은 예시이므로 실제 환경에 맞게 바꿔 쓴다. 괄호 안의 숫자는 이 명령을 설명하는 장이다.

> **입문 책과의 관계** — `kubectl get svc`·`get endpointslices`·`get ingress`·`get ingressclass`·`describe ingress`·`get networkpolicy -A`·`exec ... cat /etc/resolv.conf`·`exec ... dig`·CoreDNS `logs` 같은 기본 조회는 [입문 책 부록 B](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/부록/B-명령어-모음.md)의 "네트워크 확인"에 있어 이 부록에서는 되풀이하지 않았다. 아래는 계층별 내부 확인(소켓·네임스페이스·netfilter·오버레이·kube-proxy 모드별 규칙·eBPF 도구)과 증상 색인에 집중한다.

> **[보충]** 명령어 자체와 옵션은 참고 자료(`linux/06`, `docker-fundamental` 11&#126;18장, `Kubernetes_Internals_Network_Guide` 19장과 부록 A, `kubernetes-textbook-main` 9·10·11·19·23장)에 실린 것만 골랐다. 각 줄의 한글 설명 중 원문 주석이 아닌 것은 명령의 의미를 풀어 쓴 것이다. 이 환경(Windows)에서는 실행해 보지 못했으므로 "실행 검증됨"이 아니다. `docker exec k8s-guide-worker ...` 형태는 kind 클러스터의 노드가 Docker 컨테이너라는 원천 실습 환경 기준이며, 일반 노드에서는 `docker exec k8s-guide-worker`를 빼고 노드에서 직접 실행한다.

## 1. 소켓·TCP·포트 (2장)

```bash
ss -tlnp                        # 리스닝 소켓과 프로세스
ss -tan state time-wait | wc -l # TIME_WAIT 수
ss -tin                         # 연결별 RTT, cwnd, 재전송 등 TCP 내부 상태
ss -ltn                         # Recv-Q = accept 큐 현재 크기, Send-Q = backlog
ss -s                           # 소켓 요약 (임시 포트 고갈 점검에도 사용)
nstat -az | grep -E 'ListenOverflows|ListenDrops|RetransSegs'   # accept 큐 오버플로·드롭·재전송 카운터
nstat -az TcpExtListenOverflows # accept 큐 오버플로만
cat /proc/sys/net/ipv4/ip_local_port_range   # 임시(에페머럴) 포트 범위
tcpdump -i any -nn port 8080    # 실제 패킷 (핸드셰이크, RST, 재전송 관찰)
strace -e trace=network -p <pid>             # 프로세스의 네트워크 시스템콜
```

## 2. 네트워크 네임스페이스 (3장)

```bash
ls -l /proc/$$/ns/                                   # 현재 셸의 네임스페이스 목록과 inode 번호
sudo ls -l /proc/$CPID/ns/net /proc/self/ns/net      # 컨테이너와 호스트의 net ns inode 비교 (같으면 host 모드)
PID=$(docker inspect -f '{{.State.Pid}}' web)        # 컨테이너의 호스트 PID
sudo nsenter --target $PID --net -- ip addr          # 컨테이너 net ns에 진입해 인터페이스 확인

sudo ip netns add testns                             # 네임스페이스 생성 (안에는 DOWN 상태의 lo만 있다)
sudo ip netns list                                   # 목록
sudo ip netns exec testns ip addr                    # 네임스페이스 안에서 명령 실행
sudo ip netns delete testns                          # 삭제
sudo unshare --pid --fork --mount-proc readlink /proc/self   # 새 PID 네임스페이스 (결과 1)

docker run --rm --net=host nginx:latest              # 호스트 net ns 공유
docker run --rm --net=container:app busybox ip addr  # 다른 컨테이너의 net ns 공유 (사이드카 패턴)
```

Pod를 손으로 조립하는 순서는 다음과 같다(원천 textbook 19장 실습, 루트 권한 필요).

```bash
ip netns add pod-lab                                          # pause 역할의 빈 네임스페이스
ip netns exec pod-lab ip link set lo up                       # 루프백 활성화
ip link add veth-host type veth peer name veth-pod            # veth 쌍 생성
ip link set veth-pod netns pod-lab                            # 한쪽 끝을 네임스페이스 안으로
ip netns exec pod-lab ip link set veth-pod name eth0
ip netns exec pod-lab ip addr add 10.99.0.2/24 dev eth0
ip netns exec pod-lab ip link set eth0 up
ip addr add 10.99.0.1/24 dev veth-host
ip link set veth-host up
ip netns exec pod-lab ip route add default via 10.99.0.1      # Pod의 기본 게이트웨이
iptables -t nat -A POSTROUTING -s 10.99.0.0/24 ! -o veth-host -j MASQUERADE   # 외부 통신용 NAT
sysctl -w net.ipv4.ip_forward=1                               # IP 포워딩 켜기
```

## 3. 인터페이스·veth·브리지·라우팅·ARP (4장)

```bash
ip -br link show                          # 인터페이스를 한 줄씩 요약 (부모 인터페이스 이름 확인)
ip -brief addr                            # 주소 요약 (컨테이너 안에서도 사용)
ip addr                                   # 인터페이스와 주소 상세
ip route                                  # 라우팅 테이블
ip neigh                                  # ARP/이웃 테이블
ip -d link show | grep -A2 -E 'vxlan|ipip|flannel'   # 오버레이 인터페이스
ip link show type veth                    # 호스트의 veth 목록
bridge link show                          # 브리지에 연결된 veth 목록
bridge fdb show br docker0                # 브리지가 학습한 MAC 테이블
docker exec web ip link show eth0         # 컨테이너 쪽 veth (eth0@ifN의 N이 호스트 쪽 인덱스)
ip -all link show | grep -B1 "veth"       # 같은 N을 가진 호스트 쪽 veth 찾기
```

## 4. netfilter·iptables·nftables·conntrack (5, 11, 17장)

```bash
# iptables
iptables-save -t nat | grep -i docker                  # Docker가 만든 nat 규칙 (DOCKER 체인의 DNAT)
iptables -t nat -L POSTROUTING -n -v | grep -i MASQUERADE   # 아웃바운드 NAT 규칙
iptables -t nat -L DOCKER -n --line-numbers            # 게시 포트별 DNAT 규칙
iptables -t nat -L -n --line-numbers | head -40        # nat 테이블의 체인 구조 (KUBE-SERVICES 등)
iptables -t nat -S | wc -l                             # nat 규칙 수 (규칙 폭증 점검)
iptables-save | grep -A 5 "DOCKER"                     # 전체 규칙 중 Docker 부분

# nftables
nft list ruleset | grep -A 5 -i docker                 # nft로 본 Docker 규칙
sudo nft list table ip docker-bridges                  # Docker nftables 백엔드의 전용 테이블
sudo update-alternatives --display iptables            # iptables가 가리키는 구현 (nft/legacy)

# conntrack
conntrack -L | grep <service-ip>                       # 연결 추적 항목 (DNAT된 연결)
conntrack -C                                           # 현재 엔트리 수
conntrack -S                                           # conntrack 통계
sysctl net.netfilter.nf_conntrack_max                  # 테이블 상한
sysctl net.netfilter.nf_conntrack_count                # 현재 사용량
dmesg | grep -i "nf_conntrack: table full"             # 가득 찼을 때의 커널 로그
sysctl -w net.netfilter.nf_conntrack_max=1048576       # 상한 상향 (메모리 여유 고려)
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=3600
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_time_wait=30
sysctl -w net.netfilter.nf_conntrack_udp_timeout=30
```

## 5. 오버레이·VXLAN·MTU (6, 23장)

```bash
ip -d link show type vxlan                                 # vxlan 인터페이스, dstport(4789) 확인
sudo tcpdump -i eth0 udp port 4789 -n -c 10                # VXLAN 캡슐화 트래픽 (Docker 오버레이)
docker exec k8s-guide-worker tcpdump -i any -nn "udp port 8472" -c 10   # VXLAN 트래픽 (쿠버네티스 CNI 실습 값)
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- ip link show eth0   # Pod MTU
docker exec k8s-guide-worker ip link show | grep mtu       # 노드 MTU

# 단편화 금지 ping으로 실제 MTU 찾기 (첫 번째로 성공하는 크기가 사용 가능한 MTU)
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- \
  sh -c 'for size in 1500 1450 1400 1350; do
           echo -n "$size: "
           ping -c1 -M do -s $((size-28)) <TARGET_POD_IP> >/dev/null 2>&1 && echo OK || echo FAIL
         done'
```

## 6. Docker 네트워크 (7&#126;12장)

```bash
docker network create mynet                      # 사용자 정의 브리지 생성
docker network create --driver bridge --subnet 172.28.0.0/16 --gateway 172.28.0.1 --ip-range 172.28.5.0/24 app-net   # IPAM 지정
docker network ls                                # 목록
docker network inspect mynet                     # IPAM, 연결된 컨테이너
docker network inspect mynet --format '{{json .Containers}}'   # 연결된 Endpoint만
docker network connect second-net web            # 실행 중 컨테이너에 Endpoint 추가
docker network disconnect second-net web         # Endpoint 제거
docker network rm mynet                          # 삭제
ps -ef | grep docker-proxy | grep -v grep        # docker-proxy와 게시 포트의 대응
docker info --format '{{.FirewallBackend}}'      # 방화벽 백엔드 (없으면 docker info | grep -i firewall)
sudo journalctl -u docker -n 50 --no-pager | grep -i firewall   # 백엔드 전환 시 데몬 로그
```

```bash
# DNS (9장)
docker run --rm --network mynet alpine:latest cat /etc/resolv.conf     # 사용자 정의 네트워크: nameserver 127.0.0.11
docker run --rm alpine:latest cat /etc/resolv.conf                     # 기본 브리지: 호스트의 네임서버 설정 그대로
docker run --rm --network mynet alpine:latest sh -c "nslookup svc-a || getent hosts svc-a"   # 이름 조회
docker run --rm --dns=1.1.1.1 --dns-search=example.internal --add-host=host.docker.internal:host-gateway \
  alpine:latest sh -c "cat /etc/resolv.conf; echo ---; cat /etc/hosts"   # DNS 옵션 반영 확인

# 오버레이 (10장)
docker network create -d overlay --attachable demo-overlay             # Swarm 서비스 없이 컨테이너 연결 가능
docker network inspect demo-overlay --format '{{.Driver}} {{.Scope}}'  # overlay swarm

# macvlan·ipvlan·host·none (10장)
docker network create -d macvlan --subnet=192.168.10.0/24 --gateway=192.168.10.1 -o parent=eth0 mv-net
docker network create -d ipvlan --subnet=192.168.30.0/24 --gateway=192.168.30.1 -o parent=eth0 -o ipvlan_mode=l2 ipv-l2-net
sudo ip link add mv-shim link eth0 type macvlan mode bridge            # 호스트-컨테이너 통신 우회용 서브인터페이스
docker run -d --network host --name web-host nginx:latest              # host 모드
docker run --rm --network none alpine:latest ip addr                   # none 모드 (lo만 보인다)

# IPv6 (12장)
docker network create --driver bridge --ipv6 --subnet 172.28.0.0/16 --subnet 2001:db8:abcd::/64 my-dualstack-net
docker exec web ip -6 addr show eth0

# Rootless (12장)
systemctl --user status docker                                         # rootless 데몬 상태
docker context ls                                                      # rootless 컨텍스트 사용 여부
ps -ef | grep -E "rootlesskit|slirp4netns|pasta|gvisor-tap-vsock"      # 유저모드 네트워크 백엔드 확인
sudo sysctl net.ipv4.ip_unprivileged_port_start=80                     # 1024 미만 포트 게시 허용(호스트 root 필요)
```

## 7. CNI·Pod 네트워크 (13&#126;15장)

```bash
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.podCIDR}{"\n"}{end}'   # 노드별 Pod CIDR
docker exec k8s-guide-control-plane grep cluster-cidr /etc/kubernetes/manifests/kube-controller-manager.yaml   # 클러스터 Pod CIDR
cat /etc/cni/net.d/*.conf*                                             # CNI 설정 (conflist)
docker exec k8s-guide-worker ls /opt/cni/bin/                          # 설치된 CNI 플러그인 실행 파일
docker exec k8s-guide-worker ls /run/cni-ipam-state/kindnet/           # host-local의 상태 파일
docker exec k8s-guide-worker journalctl -u containerd -n 50 --no-pager | grep -i cni   # CNI 호출 실패 로그

# Pod 안과 노드에서 Pod 네임스페이스로 진입
kubectl exec pod-a -- ip addr
kubectl exec pod-a -- ip route
kubectl exec pod-a -- cat /etc/resolv.conf
docker exec k8s-guide-worker bash -c '
PID=$(crictl inspect $(crictl ps -q --name <container-name>) | jq -r .info.pid)
nsenter -t $PID -n ip addr
nsenter -t $PID -n ip route
'
crictl ps -a                                                           # 노드의 컨테이너 (kubelet 쪽 확인)
crictl pods                                                            # 샌드박스(pause) 목록

# Pod 간 직접 통신 (CNI·정책 확인)
POD_B_IP=$(kubectl get pod pod-b -o jsonpath='{.status.podIP}')
kubectl exec pod-a -- curl -sS --max-time 3 http://$POD_B_IP:8080

# IP 고갈 (AWS VPC CNI)
kubectl set env daemonset aws-node -n kube-system ENABLE_PREFIX_DELEGATION=true
```

## 8. Service·EndpointSlice·kube-proxy (16, 17장)

```bash
kubectl get svc <svc> -o jsonpath='{.spec.clusterIP}'                  # ClusterIP 할당 여부 (기본 `get svc`는 입문 책 부록 B)
kubectl get svc web -o jsonpath='{.spec.selector}'                     # 셀렉터
kubectl get pods --show-labels                                         # Pod 라벨과 대조
kubectl get svc web -o jsonpath='{.spec.ports}'                        # Service 포트
kubectl get pod <pod> -o jsonpath='{.spec.containers[*].ports}'        # 컨테이너 포트
kubectl get pods -l app=web                                            # Ready 여부
kubectl get endpointslices -l kubernetes.io/service-name=<svc> -o yaml # ready/terminating 조건 (비어 있으면 셀렉터 불일치나 Ready 아님)

# 세 점 호출 (Pod IP → ClusterIP → DNS 이름)
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- curl -s <POD_IP>:8080
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- curl -s <CLUSTER_IP>:80
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- curl -s web

# kube-proxy 규칙
iptables-save -t nat | grep KUBE-SVC                                   # iptables 모드
iptables -t nat -nL KUBE-SVC-<hash> -v                                 # 서비스 체인 (확률 기반 분배)
iptables -t nat -S KUBE-SEP-<hash>                                     # 엔드포인트 체인 (최종 DNAT)
iptables -t nat -S KUBE-POSTROUTING                                    # SNAT(0x4000 마크)
ipvsadm -Ln                                                            # IPVS 모드
ip addr show kube-ipvs0                                                # IPVS 더미 인터페이스
nft list table ip kube-proxy                                           # nftables 모드
kubectl get --raw /metrics 2>/dev/null | grep kubeproxy_sync_proxy_rules_duration   # kube-proxy 동기화 시간
```

## 9. DNS (9, 18장)

```bash
kubectl exec -it <pod> -- dig +search <service>                        # search 목록 적용 조회 (resolv.conf·기본 dig는 입문 책 부록 B)
dig @10.96.0.10 kubernetes.default.svc.cluster.local                   # kube-dns Service IP로 직접
dig @<coredns-pod-ip> kubernetes.default.svc.cluster.local             # CoreDNS Pod IP로 직접
nslookup kubernetes.default
nslookup google.com                                                    # 외부 이름
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl get endpointslice -n kube-system -l kubernetes.io/service-name=kube-dns
kubectl get configmap coredns -n kube-system -o yaml                   # Corefile
```

## 10. Ingress (19장)

```bash
kubectl get ingress <name> -o jsonpath='{.spec.ingressClassName}'      # IngressClass 대조 (ADDRESS·describe는 입문 책 부록 B)
curl -H "Host: web.localdev.me" http://localhost/                      # Host 헤더로 호스트 규칙 재현 (404 확인)
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller --tail=50
kubectl exec -n ingress-nginx <controller-pod> -- cat /etc/nginx/nginx.conf | grep -A20 "server_name shop"
kubectl exec -n ingress-nginx <controller-pod> -- curl -s http://web.default.svc.cluster.local   # 컨트롤러에서 백엔드 직접
```

## 11. NetworkPolicy·Cilium·Hubble (21, 22장)

```bash
kubectl get pods -n kube-system                                        # 어떤 CNI가 떠 있는지 (정책을 시행하는 CNI인지)
kubectl describe networkpolicy <policy> -n <namespace>                 # 정책 상세 (목록 조회는 입문 책 부록 B)
kubectl hns tree org                                                   # HNC 계층 확인 (정책 상속, 21장)

cilium status                                                          # Cilium 상태
cilium status | grep KubeProxyReplacement                              # kube-proxy 대체 모드 확인
cilium connectivity test --test-namespace cilium-test                  # 클러스터 전반의 연결성 자가진단
cilium service list                                                    # eBPF service map
cilium monitor --type drop                                             # 드롭 이벤트
cilium monitor --type policy-verdict                                   # 정책 판정 이벤트

hubble observe --namespace shop                                        # 네임스페이스의 흐름
hubble observe --namespace shop --verdict DROPPED                      # 정책에 의해 거부된 흐름
hubble observe --to-pod shop/backend-abc123 --follow                   # 특정 Pod를 목적지로, 실시간
cilium hubble port-forward &                                           # Hubble 접속 준비
hubble observe --namespace production -f                               # 네임스페이스 흐름 실시간
```

> **[보충]** 원천끼리 Hubble 표기가 다르다. 본문(19.4)과 실습은 `--verdict DROPPED`와 `--to-pod`를, 부록 A.11은 `hubble observe --pod <namespace>/<pod> --verdict DENIED`를 쓴다. 더 상세한 본문 표기를 앞에 두었으며 실제 환경에서는 `hubble observe --help`로 확인한다.

## 12. 패킷 캡처 위치별 (23장)

```bash
# Pod 안 (kubectl debug로 같은 net ns 공유)
kubectl debug -it <pod-name> --image=nicolaka/netshoot --target=<container-name> -- tcpdump -i any -n port 80   # 입문 책 부록 B의 debug 형태에서 tcpdump까지
kubectl debug pod-a -it --image=nicolaka/netshoot --target=app -- tcpdump -i eth0 -nn

# 노드에서 Pod net ns 진입
docker exec k8s-guide-worker crictl inspect <container-id> | grep -i pid
docker exec k8s-guide-worker nsenter -t <pid> -n tcpdump -i eth0 -n

# 호스트 쪽 veth (Pod 안에 아무것도 설치하지 않음)
docker exec k8s-guide-worker sh -c 'ethtool -S <pod-내부-eth0-ifindex> 2>/dev/null; ip link | grep veth'
docker exec k8s-guide-worker tcpdump -i <veth이름> -n

# 노드 (양쪽 노드에서 동시에 실행하면 패킷이 사라지는 지점을 알 수 있다)
docker exec k8s-guide-worker tcpdump -i any -nn "host 10.244.2.7" -c 20
```

## 13. 클러스터 적합성 검증 (23장)

```bash
sonobuoy run --mode=quick --wait                                       # 빠른 모드 (전체 conformance는 몇 시간)
sonobuoy retrieve -f results.tar.gz
sonobuoy results results.tar.gz
sonobuoy run --e2e-focus="\[sig-network\].*Conformance" --wait         # 네트워크 관련 테스트만
```

## 14. 증상 → 어디부터 (한 줄 색인)

| 증상 | 먼저 볼 곳 |
|---|---|
| Service는 안 되고 Pod IP는 됨 | 8절 kube-proxy 규칙 (`iptables-save`/`ipvsadm`/`nft`) |
| 이름만 안 됨, ClusterIP는 됨 | 9절 DNS |
| 엔드포인트 비어 있음 | 8절 `get endpointslices`, 셀렉터·Ready |
| ping은 되는데 큰 전송 실패 | 5절 `ping -M do -s` |
| 부하 때 간헐 실패 | 4절 `conntrack -C`·`dmesg`, 1절 `ss -s`·임시 포트 범위 |
| 정책 적용 후 전부 실패 | 11절 `hubble observe --verdict DROPPED`, DNS 예외 |
| Docker 게시 포트 접속 실패 | 4절 `iptables-save -t nat`의 DOCKER 체인 DNAT 규칙, 6절 `docker-proxy` 프로세스 |
| 컨테이너 이름 해석 실패 | 6절 DNS (`resolv.conf`가 127.0.0.11인지, 같은 네트워크인지) |

*원문 근거: linux/06-네트워크.md (6.11 직접 확인해보기); docker-fundamental/02_격리의_기초.md (네임스페이스 실습), 11&#126;18장 실습 절 (docker network 명령, 브리지·DNS·macvlan·방화벽·Rootless·IPv6 확인); Kubernetes_Internals_Network_Guide/03-네트워크/19-eBPF-데이터플레인과-네트워크-트러블슈팅.md (19.3&#126;19.5), 부록/A-진단-명령어-치트시트.md (A.8&#126;A.11); kubernetes-textbook-main/05-내부-동작-파헤치기/19·23장 (Pod 수작업 조립, iptables·conntrack·MTU·진단·Sonobuoy, 23.3 Hubble), 04-클러스터-운영/13-네임스페이스와-멀티테넌시.md (13.6 `kubectl hns`), 03-애플리케이션-노출과-데이터/09·10·11장 (9.5&#126;9.7, 10.6, 11.7)*
