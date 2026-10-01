---
title: "부록 A. 진단 명령어 치트시트"
---

# 부록 A. 진단 명령어 치트시트

본문 전 장에서 등장한 진단 명령어를 증상별·주제별로 모았다. 각 항목은 관련 장을 함께 표기했다.

---

## A.1 컨트롤 플레인 헬스 체크 (1~5장)

```bash
# 컴포넌트 헬스 엔드포인트
kubectl get --raw /livez?verbose
kubectl get --raw /readyz?verbose
kubectl get --raw /healthz
kubectl get --raw '/readyz/etcd'

# 정적 파드로 뜬 컨트롤 플레인 컴포넌트 확인 (5장)
kubectl get pods -n kube-system -l tier=control-plane
kubectl logs -n kube-system kube-apiserver-<node> --tail=100
kubectl logs -n kube-system kube-controller-manager-<node> --tail=100
kubectl logs -n kube-system kube-scheduler-<node> --tail=100

# API 서버가 죽어 kubectl이 안 될 때 (6장)
docker exec <control-plane-node> crictl ps -a | grep apiserver
docker exec <control-plane-node> crictl logs <CONTAINER_ID> 2>&1 | tail -50

# 인증서 만료 확인
docker exec <control-plane-node> kubeadm certs check-expiration
```

## A.2 API 서버·APF·watch 진단 (2장)

```bash
# 원시 HTTP 요청/응답 관찰
kubectl --v=9 get pods

# APF 상태
kubectl get flowschemas
kubectl get prioritylevelconfigurations
kubectl get --raw /metrics | grep -E 'apiserver_flowcontrol_(rejected|current_inqueue|dispatched)'

# 핵심 메트릭
kubectl get --raw /metrics | grep -E 'apiserver_request_(duration_seconds|total)'
kubectl get --raw /metrics | grep apiserver_current_inflight_requests
kubectl get --raw /metrics | grep apiserver_storage_objects

# 어그리게이션 API 확인
kubectl get apiservices | grep -v Local
```

| 증상 | 원인 후보 | 확인 |
|---|---|---|
| `kubectl` 전반적으로 느림 | etcd 지연, apiserver 과부하 | `etcd_request_duration_seconds`, `apiserver_current_inflight_requests` |
| `429 Too Many Requests` | APF 제한 | `apiserver_flowcontrol_rejected_requests_total`, FlowSchema |
| `410 Gone` | watch cache 순환 버퍼 이탈 | 클라이언트 relist 여부 (Informer는 자동 처리, 5장) |
| `x509: certificate has expired` | 인증서 만료 | `kubeadm certs check-expiration` |

## A.3 etcd 진단 (3장)

```bash
# etcdctl 직접 조회 (TLS 인증서 필요)
etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  get /registry/pods/default --prefix --keys-only

# 클러스터/멤버 상태
etcdctl endpoint status --write-out=table
etcdctl member list

# 스냅샷 백업/복구
etcdctl snapshot save /tmp/etcd-backup.db
etcdctl snapshot status /tmp/etcd-backup.db --write-out=table
etcdctl snapshot restore /tmp/etcd-backup.db --data-dir=/var/lib/etcd-restore

# 성능 관련 메트릭
etcdctl endpoint status -w json | jq '.[].Status.dbSize'
kubectl get --raw /metrics | grep etcd_disk_wal_fsync_duration_seconds
```

## A.4 스케줄러 진단 (4장)

```bash
# 스코어링 과정 로그 (verbosity 상향 필요)
kubectl logs -n kube-system kube-scheduler-<node> -f | grep -i score

# 스케줄 실패 이유
kubectl describe pod <pending-pod> | grep -A 10 Events

# 다중 스케줄러 확인
kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.schedulerName}{"\n"}{end}'
```

## A.5 컨트롤러/워크큐 진단 (5장)

```bash
kubectl get --raw /metrics | grep workqueue_depth
kubectl get --raw /metrics | grep workqueue_queue_duration_seconds
kubectl get lease -n kube-system
kubectl get lease kube-controller-manager -n kube-system -o jsonpath='{.spec.leaseTransitions}'
```

## A.6 kubelet·노드 진단 (6장)

```bash
crictl ps -a
crictl pods
crictl logs <container-id>
crictl inspect <container-id>

kubectl get nodes -o wide
kubectl describe node <node> | grep -A 5 Taints
kubectl get events --field-selector involvedObject.kind=Node
```

## A.7 확장 리소스 인벤토리 (7장)

```bash
kubectl get crds
kubectl get validatingwebhookconfigurations
kubectl get mutatingwebhookconfigurations
kubectl get apiservices
kubectl get validatingadmissionpolicies
kubectl get csidrivers
```

## A.8 네트워크 — 서비스/EndpointSlice (14장)

```bash
kubectl get endpointslices -o wide
kubectl get endpointslices -l kubernetes.io/service-name=<svc> -o yaml
kubectl get svc <svc> -o jsonpath='{.spec.clusterIP}'
```

## A.9 네트워크 — kube-proxy 데이터플레인 (15장)

```bash
# iptables 모드
iptables-save -t nat | grep KUBE-SVC
iptables -t nat -nL KUBE-SVC-<hash> -v
conntrack -L | grep <service-ip>

# IPVS 모드
ipvsadm -Ln
ip addr show kube-ipvs0

# nftables 모드
nft list table ip kube-proxy
```

## A.10 네트워크 — DNS 진단 (16장)

```bash
kubectl exec -it <pod> -- cat /etc/resolv.conf
kubectl exec -it <pod> -- dig <service>.<namespace>.svc.cluster.local
kubectl exec -it <pod> -- dig +search <service>
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50
kubectl get configmap coredns -n kube-system -o yaml
```

**DNS 실패 진단 플로차트**
```
DNS 조회 실패
  ├─ CoreDNS Pod가 Running/Ready인가?  → kubectl get pods -n kube-system -l k8s-app=kube-dns
  ├─ kube-dns Service/EndpointSlice가 정상인가? → kubectl get endpointslices -l k8s-app=kube-dns -n kube-system
  ├─ Pod 내부 /etc/resolv.conf가 정상인가? → 위 명령
  └─ 간헐적 SERVFAIL인가?  → conntrack 경쟁 조건 의심 (NodeLocal DNSCache 도입 검토)
```

## A.11 네트워크 — 대규모 트러블슈팅 (13, 18, 19장)

```bash
# CNI 설정 확인
cat /etc/cni/net.d/*.conf*
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.podCIDR}{"\n"}{end}'

# NetworkPolicy 확인
kubectl get networkpolicy -A
kubectl describe networkpolicy <policy> -n <namespace>

# Pod 네트워크 네임스페이스에서 캡처
kubectl debug -it <pod> --image=nicolaka/netshoot --target=<container> -- tcpdump -i eth0 -n

# Cilium/eBPF 환경
cilium status
hubble observe --pod <namespace>/<pod> --verdict DENIED
cilium monitor --type drop
```

**연결 실패 진단 플로차트 (19장)**
```
Pod A → Service/Pod B 연결 실패
  ├─ DNS 문제인가?              → A.10 플로차트
  ├─ 같은 노드인가, 다른 노드인가? → 다른 노드면 CNI 오버레이/라우팅 확인 (13장)
  ├─ Service 경유인가?           → EndpointSlice/kube-proxy 또는 eBPF service map 확인 (14, 15, 19장)
  ├─ NetworkPolicy가 걸려 있는가? → kubectl get networkpolicy -A, Hubble verdict (18장)
  └─ conntrack/포트 고갈인가?     → conntrack -C, conntrack -S (노드 리소스 문제)
```

---

**사용법**: 장애 상황에서는 A.1(컨트롤 플레인) → A.10/A.11(네트워크) 순으로 훑는 것을 권장한다. 대부분의 "느리다/안 된다" 계열 증상은 etcd 지연(A.3) 또는 DNS(A.10)에서 시작된다.
