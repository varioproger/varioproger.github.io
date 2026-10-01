---
title: "부록 B. 자주 쓰는 명령어 모음"
parent: "부록"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 2
---

# 부록 B. 자주 쓰는 명령어 모음

Docker, Docker Compose, kubectl, Helm의 기본 명령을 모았다. `my-api`, `web`, `<pod>` 같은 이름은 예시이므로 실제 이름으로 바꿔 쓴다.

> **[보충]** 명령어 자체는 참고 자료(CLI 가이드 PDF 두 권, kubectl 치트시트, 진단 명령어 치트시트)와 본문 각 장에 실린 것만 골랐다. 다만 CLI 가이드 PDF는 한글 주석이 깨져 읽히지 않아, Docker·Docker Compose 명령 옆의 한글 설명은 명령의 일반적인 의미를 풀어 쓴 것이다(원문 주석이 아니다).

## 1. Docker

### 이미지 빌드

```bash
docker build -t my-api:1.0.0 .                 # 현재 디렉터리의 Dockerfile로 빌드
docker build -f Dockerfile.dev .               # 다른 Dockerfile 지정
docker build --target builder -t my-api:build .  # 멀티 스테이지의 특정 단계까지만
docker build --build-arg NODE_ENV=production .   # 빌드 인자 전달
docker build --progress=plain --no-cache .     # 진행 로그를 자세히 출력하고 캐시 없이 빌드
docker buildx build --platform linux/amd64 -t $REPO/my-api:$TAG --push .   # 플랫폼 지정 빌드 후 push
```

### 컨테이너 실행

```bash
docker run -it --rm -p 3000:3000 --env-file .env my-api:1.0.0   # 포트 매핑 + 환경변수 파일, 종료 시 삭제
docker run -d --name api --restart unless-stopped my-api:1.0.0  # 백그라운드 실행, 자동 재시작
docker run -it --rm --entrypoint sh my-api:1.0.0                # 진입점을 셸로 바꿔 내부 확인
docker run --rm -v $(pwd):/app -w /app node:22-alpine npm ci    # 볼륨 마운트 + 작업 디렉터리
```

### 실행 중인 컨테이너 다루기

```bash
docker ps                                 # 실행 중인 컨테이너
docker ps -a                              # 종료된 컨테이너 포함
docker stop -t 30 api                     # SIGTERM 후 최대 30초 대기, 그 뒤 SIGKILL
docker start api                          # 중지된 컨테이너 시작
docker restart api                        # 재시작
docker rm api                             # 중지된 컨테이너 삭제 (실행 중이면 docker rm -f)
docker exec -it api sh                    # 컨테이너 안에서 셸 실행
docker logs -f --tail 100 --timestamps api   # 로그 따라가기
docker inspect api                        # 상세 정보(JSON)
docker stats                              # 자원 사용량
docker top api                            # 컨테이너 내부 프로세스
docker diff api                           # 파일 시스템 변경 내역
docker cp api:/app/logs/app.log ./app.log # 파일 복사
docker port api                           # 포트 매핑 확인
```

### 이미지 관리와 레지스트리

```bash
docker image ls                           # 이미지 목록
docker image history my-api:1.0.0         # 이미지 레이어 이력
docker tag my-api:1.0.0 $REPO/my-api:1.0.0   # 태그 붙이기
docker login $REGISTRY                    # 레지스트리 로그인
docker push $REPO/my-api:1.0.0            # 이미지 올리기
docker pull $REPO/my-api:1.0.0            # 이미지 받기
docker save my-api:1.0.0 | gzip > my-api.tar.gz   # 이미지를 파일로 저장
docker load < my-api.tar.gz               # 파일에서 이미지 불러오기
```

### 볼륨과 네트워크

```bash
docker volume create demo-vol             # 이름 있는 볼륨 생성
docker volume ls                          # 볼륨 목록
docker volume inspect demo-vol            # 볼륨 상세(실제 저장 위치 등)
docker volume rm demo-vol                 # 볼륨 삭제 (데이터 삭제 주의)
docker network create mynet               # 사용자 정의 브리지 네트워크 생성
docker network ls                         # 네트워크 목록
docker network inspect mynet              # 연결된 컨테이너·서브넷 확인
docker network connect mynet api          # 실행 중인 컨테이너를 네트워크에 추가 연결
```

### 정리

```bash
docker system df                          # 디스크 사용량
docker container prune                    # 중지된 컨테이너 삭제
docker image prune -a                     # 사용하지 않는 이미지 삭제
docker volume prune                       # 사용하지 않는 볼륨 삭제
docker system prune -a --volumes          # 전체 정리 (주의: 데이터 손실 가능)
```

## 2. Docker Compose

```bash
docker compose up -d                      # 백그라운드로 전체 시작
docker compose up -d --build              # 이미지 다시 빌드 후 시작
docker compose up postgres redis          # 일부 서비스만 시작
docker compose ps                         # 서비스 상태
docker compose logs -f api                # 서비스 로그
docker compose stop api                   # 서비스 중지
docker compose start api                  # 중지된 서비스 시작
docker compose restart api                # 서비스 재시작
docker compose build api                  # 서비스 이미지만 빌드
docker compose down                       # 중지 및 컨테이너·네트워크 제거
docker compose down -v                    # 볼륨까지 제거 (DB 데이터 삭제 주의)
docker compose exec api sh                # 실행 중인 서비스에 접속
docker compose run --rm api npm run migration:run   # 일회성 명령 실행
docker compose config                     # 최종 설정 확인
docker compose pull                       # 이미지 받기
docker compose -f compose.yaml -f compose.override.yaml up -d   # 여러 파일 병합
```

## 3. kubectl

### 설정과 컨텍스트

```bash
kubectl config current-context
kubectl config get-contexts
kubectl cluster-info
kubectl auth whoami
kubectl config use-context prod
kubectl config set-context --current --namespace=my-ns
```

### 조회

```bash
kubectl get pods                          # 현재 네임스페이스
kubectl get pods -A                       # 전체 네임스페이스
kubectl get pods -o wide                  # 노드·IP 포함
kubectl get pods -w                       # 실시간 감시
kubectl get pods --show-labels
kubectl get all                           # 주요 리소스 한 번에
kubectl get pod,svc,deploy -l app=web     # 라벨로 여러 종류 동시에
kubectl get pods --field-selector status.phase=Running
kubectl api-resources                     # 사용 가능한 리소스 종류
kubectl explain pod.spec.containers.resources --recursive   # 필드 설명
kubectl get pod web -o yaml               # YAML 출력
```

### 생성·수정·삭제

```bash
kubectl apply -f manifest.yaml            # 선언적 적용
kubectl apply -f ./manifests/             # 디렉터리 전체
kubectl apply -f m.yaml --dry-run=server  # 적용 전 검증
kubectl diff -f m.yaml                    # 변경 미리보기
kubectl create deployment web --image=nginx:alpine --dry-run=client -o yaml   # YAML 뼈대 생성
kubectl create namespace dev
kubectl create configmap cfg --from-literal=K=V --dry-run=client -o yaml
kubectl create secret generic db --from-literal=pw=x --dry-run=client -o yaml
kubectl create secret tls shop-tls --cert=tls.crt --key=tls.key   # Ingress TLS용 Secret
kubectl create job hello --image=busybox --dry-run=client -o yaml -- echo hi
kubectl set image deployment/web app=nginx:1.27
kubectl scale deployment/web --replicas=5
kubectl autoscale deployment/web --min=3 --max=20 --cpu-percent=70   # HPA 생성
kubectl patch deployment web -p '{"spec":{"replicas":3}}'           # 부분 수정
kubectl label pod web env=prod --overwrite
kubectl label pod web env-                                          # 라벨 제거
kubectl edit deployment web
kubectl delete -f manifest.yaml
kubectl delete pod -l app=web
```

### 롤아웃

```bash
kubectl rollout status deployment/web --timeout=5m
kubectl rollout history deployment/web
kubectl rollout undo deployment/web       # 이전 버전으로 되돌리기
kubectl rollout undo deployment/web --to-revision=2   # 특정 리비전으로 되돌리기
kubectl rollout restart deployment/web    # 재시작(설정 변경 반영)
kubectl rollout pause deployment/web      # 롤아웃 일시 중지
kubectl rollout resume deployment/web     # 롤아웃 재개
```

### 로그와 디버깅

```bash
kubectl logs web                          # 로그
kubectl logs web -c sidecar               # 특정 컨테이너
kubectl logs web --previous               # 직전 종료 컨테이너 로그 (크래시 원인)
kubectl logs web -f --tail=100            # 따라가기
kubectl logs web --since=10m              # 최근 10분
kubectl logs -l app=web                   # 라벨로 여러 Pod의 로그
kubectl describe pod web                  # 1순위 진단 명령 (하단의 Events 확인)
kubectl get events --sort-by=.lastTimestamp | tail -30
kubectl get events --field-selector type=Warning   # 경고 이벤트만
kubectl exec -it web -- sh                # 컨테이너 안에서 셸
kubectl cp web:/app/log.txt ./log.txt     # Pod에서 파일 복사
kubectl port-forward svc/web 8080:80      # 로컬 포트 포워딩
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- bash   # 임시 진단 Pod
kubectl debug -it web --image=nicolaka/netshoot --target=app   # 셸 없는 이미지 디버깅
```

### 자원과 노드

```bash
kubectl top nodes                         # 노드 사용량 (metrics-server 필요)
kubectl top pods -A --sort-by=memory
kubectl describe node worker-1            # 노드 상태·할당량(Allocated resources)·Events
kubectl get hpa                           # HPA 목표치와 현재 replicas
kubectl cordon worker-1                   # 새 Pod 스케줄만 막기
kubectl drain worker-1 --ignore-daemonsets --delete-emptydir-data   # 노드 비우기
kubectl uncordon worker-1
kubectl taint nodes worker-1 key=value:NoSchedule    # 테인트 추가
kubectl taint nodes worker-1 key=value:NoSchedule-   # 테인트 제거
kubectl label node worker-1 disktype=ssd             # 노드 라벨
```

### 네임스페이스와 보안

```bash
kubectl get namespaces
kubectl describe resourcequota -n dev     # 쿼터 사용량
kubectl label namespace dev pod-security.kubernetes.io/enforce=restricted   # PSA 적용
kubectl get networkpolicy -n dev
```

### 스토리지

```bash
kubectl get pvc                           # STATUS: Pending / Bound
kubectl describe pvc data                 # Events가 핵심
kubectl get pv
kubectl get storageclass                  # (default) 표시 확인
kubectl get volumeattachment              # 볼륨이 어느 노드에 연결됐는가
kubectl patch pv <pv-name> -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}'   # 회수 정책 변경
```

### 권한 확인

```bash
kubectl auth can-i create pods
kubectl auth can-i delete deployments -n prod
kubectl auth can-i --list -n dev
kubectl auth can-i get pods --as=system:serviceaccount:default:my-sa
```

### 네트워크 확인

```bash
kubectl get svc
kubectl get endpointslices -o wide
kubectl get endpointslices -l kubernetes.io/service-name=<svc> -o yaml
kubectl exec -it <pod> -- cat /etc/resolv.conf
kubectl exec -it <pod> -- dig <service>.<namespace>.svc.cluster.local
kubectl get ingress                       # ADDRESS가 비어 있으면 컨트롤러 미처리
kubectl get ingressclass
kubectl describe ingress <name>
kubectl get networkpolicy -A
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50   # CoreDNS 로그
```

## 4. Helm (개요)

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami   # 차트 저장소 추가
helm repo update && helm search repo postgresql            # 차트 검색
helm list -A                                               # 설치된 릴리스 목록
helm template my-api ./chart -f values.prod.yaml           # 렌더링 결과만 확인 (설치 안 함)
helm upgrade --install my-api ./chart --create-namespace -n prod   # 설치 또는 업그레이드
helm status my-api -n prod
helm history my-api -n prod                                # 릴리스 이력
helm rollback my-api 2 -n prod                             # 2번 리비전으로 롤백
helm uninstall my-api -n prod
```

### 문제 해결 원라이너

```bash
# 정상이 아닌 Pod
kubectl get pods -A --field-selector status.phase!=Running,status.phase!=Succeeded
# 재시작이 많은 순
kubectl get pods -A --sort-by=.status.containerStatuses[0].restartCount | tail -15
```

*원문 근거: CLI-Complete-Guide_NestJS-Docker-K8s-Terraform.pdf, Backend_Infrastructure_CLI_Complete_Guide_KO.pdf (Docker 빌드·실행·검사·이미지·볼륨·네트워크·정리, Docker Compose, Helm 절; 한글 주석은 추출이 깨져 설명은 직접 작성함); kubernetes-textbook-main/부록/A-kubectl-치트시트.md (A.1 설정, A.2 조회, A.4 생성·수정·삭제, A.5 롤아웃, A.6 로그와 디버깅, A.7 리소스와 노드, A.8 권한 확인, A.10 원라이너); kubernetes-textbook-main/03-애플리케이션-노출과-데이터/11·12장 (TLS Secret, 스토리지 진단), 04-클러스터-운영/18-워크로드-보안.md (18.3 PSA 라벨); Kubernetes_Internals_Network_Guide/부록/A-진단-명령어-치트시트.md (A.8, A.10 네트워크 진단); 본문 9·10장 (docker volume/network create)*
