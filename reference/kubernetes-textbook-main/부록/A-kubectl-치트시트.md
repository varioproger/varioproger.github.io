# 부록 A. kubectl 치트시트

> 3장에서 기본기를, 각 장에서 진단 명령을 다뤘다. 여기서는 실무에서 자주 쓰는 것을 한곳에 모은다.

---

## A.1 설정과 컨텍스트

```bash
# 현재 상태
kubectl config current-context
kubectl config get-contexts
kubectl cluster-info
kubectl auth whoami

# 전환
kubectl config use-context prod
kubectl config set-context --current --namespace=my-ns

# 여러 kubeconfig 병합
export KUBECONFIG=~/.kube/config:~/.kube/prod-config
kubectl config view --flatten > ~/.kube/merged

# 컨텍스트 정보 삭제
kubectl config delete-context old-ctx
kubectl config unset users.old-user
```

**필수 플러그인** (3.4절)

```bash
kubectl krew install ctx ns tree neat stern who-can view-secret
kubectx prod        # 컨텍스트 전환
kubens my-ns        # 네임스페이스 전환
```

> **프롬프트에 현재 컨텍스트를 표시하라.** `kube-ps1`을 쓰면 프로덕션에서 실수할 확률이 크게 준다.

**별칭**

```bash
alias k=kubectl
alias kg='kubectl get'
alias kd='kubectl describe'
alias kl='kubectl logs'
alias kex='kubectl exec -it'
alias kaf='kubectl apply -f'
alias kdel='kubectl delete'

# 자동완성
source <(kubectl completion bash)
complete -o default -F __start_kubectl k
```

---

## A.2 조회

```bash
kubectl get pods                          # 현재 네임스페이스
kubectl get pods -A                       # 전체
kubectl get pods -o wide                  # 노드·IP 포함
kubectl get pods -w                       # 실시간 감시
kubectl get pods --show-labels
kubectl get pods -L app,version           # 라벨을 열로
kubectl get all                           # 주요 리소스 한 번에
kubectl get pod,svc,deploy -l app=web     # 여러 종류 동시에

# 정렬
kubectl get pods --sort-by=.metadata.creationTimestamp
kubectl get pods --sort-by=.status.containerStatuses[0].restartCount
kubectl get nodes --sort-by=.status.capacity.memory

# 필터
kubectl get pods -l 'env in (prod,staging)'
kubectl get pods -l 'app,!deprecated'
kubectl get pods --field-selector status.phase=Running
kubectl get pods --field-selector spec.nodeName=worker-1
kubectl get events --field-selector type=Warning

# API 탐색 (4.1절)
kubectl api-resources
kubectl api-resources --api-group=apps -o wide
kubectl api-versions
kubectl explain pod.spec.containers.resources --recursive
```

---

## A.3 출력 포맷과 JSONPath

```bash
kubectl get pod web -o yaml
kubectl get pod web -o json
kubectl get pod web -o yaml | kubectl neat     # 시스템 필드 제거

# 커스텀 컬럼
kubectl get pods -o custom-columns=\
NAME:.metadata.name,\
NODE:.spec.nodeName,\
STATUS:.status.phase,\
RESTARTS:.status.containerStatuses[0].restartCount

# JSONPath
kubectl get pods -o jsonpath='{.items[*].metadata.name}'
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.podIP}{"\n"}{end}'
kubectl get svc web -o jsonpath='{.spec.clusterIP}'
kubectl get pod web -o jsonpath='{.spec.containers[*].image}'
kubectl get nodes -o jsonpath='{.items[*].status.addresses[?(@.type=="InternalIP")].address}'

# go-template
kubectl get secret db -o go-template='{{range $k,$v := .data}}{{$k}}: {{$v|base64decode}}{{"\n"}}{{end}}'
```

**자주 쓰는 조합**

```bash
# 이미지 목록
kubectl get pods -A -o jsonpath='{range .items[*]}{.spec.containers[*].image}{"\n"}{end}' | sort -u

# 노드별 Pod 수
kubectl get pods -A -o jsonpath='{range .items[*]}{.spec.nodeName}{"\n"}{end}' | sort | uniq -c | sort -rn

# requests가 없는 컨테이너 (14장)
kubectl get pods -A -o json | jq -r '
  .items[] | . as $p | .spec.containers[]
  | select(.resources.requests == null)
  | "\($p.metadata.namespace)/\($p.metadata.name)/\(.name)"'

# OOMKilled 이력
kubectl get pods -A -o json | jq -r '
  .items[] | select(.status.containerStatuses[]?.lastState.terminated.reason=="OOMKilled")
  | "\(.metadata.namespace)/\(.metadata.name)"'

# latest 태그 사용 중인 워크로드 (2.2절)
kubectl get deploy -A -o json | jq -r '
  .items[] | select(.spec.template.spec.containers[].image | endswith(":latest"))
  | "\(.metadata.namespace)/\(.metadata.name)"'
```

---

## A.4 생성·수정·삭제

```bash
kubectl apply -f manifest.yaml
kubectl apply -f ./manifests/            # 디렉터리
kubectl apply -k overlays/prod           # Kustomize (30.2절)
kubectl apply -f https://example.com/m.yaml

# 적용 전 검증 (3.5절)
kubectl apply -f m.yaml --dry-run=server
kubectl diff -f m.yaml

# 명령형으로 뼈대 생성
kubectl create deployment web --image=nginx:alpine --dry-run=client -o yaml
kubectl create service clusterip web --tcp=80:8080 --dry-run=client -o yaml
kubectl create configmap cfg --from-literal=K=V --dry-run=client -o yaml
kubectl create secret generic db --from-literal=pw=x --dry-run=client -o yaml
kubectl create job hello --image=busybox --dry-run=client -o yaml -- echo hi
kubectl create cronjob hello --image=busybox --schedule="*/5 * * * *" --dry-run=client -o yaml

# 부분 수정
kubectl set image deployment/web app=nginx:1.27
kubectl set resources deployment/web --requests=cpu=100m,memory=128Mi --limits=memory=512Mi
kubectl set env deployment/web LOG_LEVEL=debug
kubectl set serviceaccount deployment/web my-sa
kubectl scale deployment/web --replicas=5
kubectl autoscale deployment/web --min=3 --max=20 --cpu-percent=70

kubectl patch deployment web -p '{"spec":{"replicas":3}}'
kubectl patch deployment web --type=json \
  -p='[{"op":"replace","path":"/spec/replicas","value":3}]'

kubectl label pod web env=prod --overwrite
kubectl label pod web env-                       # 제거
kubectl annotate deployment web note="rollback candidate"

kubectl edit deployment web

# 삭제
kubectl delete -f manifest.yaml
kubectl delete pod -l app=web
kubectl delete pods --all -n test
kubectl delete pod web --grace-period=0 --force   # 최후 수단 (5.7절)
```

---

## A.5 롤아웃

```bash
kubectl rollout status deployment/web --timeout=5m
kubectl rollout history deployment/web
kubectl rollout history deployment/web --revision=3
kubectl rollout undo deployment/web
kubectl rollout undo deployment/web --to-revision=2
kubectl rollout restart deployment/web           # 설정 변경 반영 (7.6절)
kubectl rollout pause deployment/web
kubectl rollout resume deployment/web
```

---

## A.6 로그와 디버깅

```bash
kubectl logs web
kubectl logs web -c sidecar
kubectl logs web --previous                      # ★ 크래시 원인 (6.3절)
kubectl logs web -f --tail=100
kubectl logs web --since=10m
kubectl logs web --timestamps
kubectl logs -l app=web --max-log-requests=20    # 여러 Pod
kubectl logs deployment/web                      # 대표 Pod
kubectl stern web                                # 색상 구분 스트리밍

kubectl describe pod web                         # ★ 1순위
kubectl get events --sort-by=.lastTimestamp | tail -30
kubectl get events --field-selector involvedObject.name=web

kubectl exec -it web -- sh
kubectl exec web -- env
kubectl exec web -- cat /etc/resolv.conf

# 셸 없는 이미지 (5.3절)
kubectl debug -it web --image=nicolaka/netshoot --target=app
kubectl debug web --copy-to=web-debug --container=app -- sleep 3600
kubectl debug node/worker-1 -it --image=busybox

kubectl cp web:/app/log.txt ./log.txt
kubectl port-forward svc/web 8080:80
kubectl port-forward pod/web 8080:8080

# 임시 진단 Pod
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- bash
kubectl run t --rm -it --image=busybox --restart=Never -- wget -qO- http://web
```

---

## A.7 리소스와 노드

```bash
kubectl top nodes
kubectl top pods -A --sort-by=memory
kubectl top pods --containers

kubectl describe node worker-1 | grep -A15 "Allocated resources"
kubectl get nodes -o custom-columns=\
NAME:.metadata.name,\
STATUS:.status.conditions[-1].type,\
VERSION:.status.nodeInfo.kubeletVersion,\
RUNTIME:.status.nodeInfo.containerRuntimeVersion

kubectl cordon worker-1
kubectl drain worker-1 --ignore-daemonsets --delete-emptydir-data --timeout=300s
kubectl uncordon worker-1

kubectl taint nodes worker-1 key=value:NoSchedule
kubectl taint nodes worker-1 key=value:NoSchedule-      # 제거
kubectl label node worker-1 disktype=ssd
```

---

## A.8 권한 확인 (17장)

```bash
kubectl auth can-i create pods
kubectl auth can-i delete deployments -n prod
kubectl auth can-i '*' '*'
kubectl auth can-i --list -n dev

# 다른 주체로 확인
kubectl auth can-i list secrets --as=alice --as-group=dev-team
kubectl auth can-i get pods --as=system:serviceaccount:default:my-sa

# 플러그인
kubectl who-can create pods
kubectl who-can get secrets -n prod
```

---

## A.9 원시 API 접근 (4.5절)

```bash
kubectl proxy --port=8001 &
curl -s localhost:8001/api/v1/namespaces/default/pods | jq -r '.items[].metadata.name'
curl -s -N "localhost:8001/api/v1/pods?watch=true" | jq -c '{type,name:.object.metadata.name}'

# proxy 없이
kubectl get --raw /healthz
kubectl get --raw /readyz?verbose
kubectl get --raw /metrics | grep etcd_request_duration
kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes | jq

# 요청 상세 보기
kubectl get pods -v=8
```

---

## A.10 문제 해결 원라이너

```bash
# 정상이 아닌 Pod
kubectl get pods -A --field-selector status.phase!=Running,status.phase!=Succeeded

# 재시작 많은 순
kubectl get pods -A --sort-by=.status.containerStatuses[0].restartCount | tail -15

# Pending 이유
kubectl get pods -A --field-selector status.phase=Pending -o json | jq -r '
  .items[] | "\(.metadata.namespace)/\(.metadata.name): \(.status.conditions[]?.message // "-")"'

# 축출된 Pod 정리
kubectl delete pods -A --field-selector status.phase=Failed

# 완료된 Job 정리
kubectl delete jobs -A --field-selector status.successful=1

# 엔드포인트 없는 Service (9.7절)
kubectl get endpointslices -A -o json | jq -r '
  .items[] | select((.endpoints // []) | length == 0)
  | "\(.metadata.namespace)/\(.metadata.labels["kubernetes.io/service-name"])"'

# Terminating에서 멈춘 것 (4.2절)
kubectl get pods -A -o json | jq -r '
  .items[] | select(.metadata.deletionTimestamp != null)
  | "\(.metadata.namespace)/\(.metadata.name) finalizers=\(.metadata.finalizers // [])"'

# 사용되지 않는 PVC 후보
kubectl get pvc -A -o json | jq -r '.items[] | "\(.metadata.namespace)/\(.metadata.name)"' > /tmp/all
kubectl get pods -A -o json | jq -r '
  .items[] | .metadata.namespace as $ns | .spec.volumes[]?
  | select(.persistentVolumeClaim) | "\($ns)/\(.persistentVolumeClaim.claimName)"' | sort -u > /tmp/used
comm -23 <(sort /tmp/all) /tmp/used

# 노드별 할당률
kubectl describe nodes | grep -E "^Name:|cpu +[0-9]+m? +\("

# 네임스페이스가 Terminating에서 멈춤 (13.1절)
kubectl get ns stuck -o json | jq '.spec.finalizers'
kubectl patch ns stuck -p '{"metadata":{"finalizers":[]}}' --type=merge
```

---

## A.11 CKA/CKAD 시험용 속도 팁

시험은 시간이 부족하다. 다음이 결정적이다.

```bash
# 별칭 (시험 시작 즉시 설정)
alias k=kubectl
export do="--dry-run=client -o yaml"
export now="--grace-period=0 --force"

# 매니페스트를 손으로 쓰지 않는다
k run nginx --image=nginx $do > pod.yaml
k create deploy web --image=nginx --replicas=3 $do > deploy.yaml
k expose deploy web --port=80 $do > svc.yaml
k create job j --image=busybox $do -- /bin/sh -c 'echo hi' > job.yaml

# vim 설정 (~/.vimrc)
# set ts=2 sw=2 et ai number
```

**자주 쓰는 시험 패턴**

```bash
# 특정 노드에 Pod 배치
k run nginx --image=nginx $do > p.yaml   # 편집해서 nodeSelector 추가

# 사이드카 추가 → 매니페스트를 받아서 편집
k get deploy web -o yaml > d.yaml

# Secret 값 확인
k get secret s -o jsonpath='{.data.password}' | base64 -d

# 로그에서 특정 문자열 파일로
k logs web | grep ERROR > /opt/answer.txt

# 노드 정보를 파일로
k get nodes -o jsonpath='{.items[*].status.nodeInfo.osImage}' > /opt/os.txt
```

> **`kubectl explain`을 적극 쓰자.** 시험 중 문서 검색보다 빠르다.
> ```bash
> k explain pod.spec.tolerations
> k explain deployment.spec.strategy --recursive | head -20
> ```

---

## A.12 노드 직접 진단 (20.8절)

kubectl로 해결되지 않을 때 노드에서 직접 확인한다.

```bash
# kind 기준
docker exec -it k8s-guide-worker bash

crictl pods                              # 샌드박스(Pod) 목록
crictl ps -a                             # 컨테이너
crictl logs <CONTAINER_ID>
crictl inspect <CONTAINER_ID> | jq '.status'
crictl images
crictl stats

systemctl status kubelet
journalctl -u kubelet -n 100 --no-pager
journalctl -u containerd -n 50 --no-pager | grep -i cni

# cgroup 확인 (14장, 19장)
cat /sys/fs/cgroup/cpu.pressure
find /sys/fs/cgroup/kubepods.slice -maxdepth 2 -type d | head

# 네트워크 (23.6절)
iptables -t nat -S KUBE-SERVICES | head
ipvsadm -Ln
conntrack -C
```
