---
title: "Part 08. Kubernetes 볼륨 · 설정(ConfigMap/Secret) · 워크로드 리소스"
parent: "Docker·K8s 인프라 구축 실습 순서"
nav_order: 8
---

# Part 08. Kubernetes 볼륨 · 설정(ConfigMap/Secret) · 워크로드 리소스

> 출처: Kubernetes 기초&심화 (CKA&CKAD) CH07 (Pod Volume mount), CH08 (Pod 환경구성 object), CH09 (Pod workload resources). 실습 환경은 kubeadm 기반 클러스터(k8s-master, k8s-node1~3, 컨테이너 런타임 containerd)이며 마지막 일부 데모는 Amazon EKS이다.
> 참고: 각 Step 은 원본 PDF(영상 슬라이드 + 강사 설명 STT 정리본)의 한글 본문으로 보강했다. 명령어와 YAML은 자료에 나온 그대로이며, 터미널 글자가 작아 판독이 어려운 부분은 해당 Step 의 주의점에 명시했다.

## 전체 구축 순서 요약

| Step | 주제 |
|---|---|
| 1 | Kubernetes Volume 개념 (volumes / volumeMounts, 종류) |
| 2 | emptyDir (임시 볼륨, 멀티 컨테이너 공유, tmpfs) |
| 3 | hostPath 와 NFS 직접 마운트 |
| 4 | PV / PVC (정적 프로비저닝) |
| 5 | StorageClass 와 동적 프로비저닝 (OpenEBS) |
| 6 | Amazon EKS 의 EBS 스토리지 사용 데모 |
| 7 | ConfigMap / Secret 개념과 Docker `-e` 환경변수 비교 |
| 8 | ConfigMap 활용 (생성 3방식, 주입 3방식, immutable) |
| 9 | Pod 설계패턴 Ambassador (nginx.conf ConfigMap) |
| 10 | Secret 활용 |
| 11 | Secret 고급 활용 (openssl HTTPS, Ingress TLS, SealedSecret) |
| 12 | etcd 암호화로 Secret 암호화 (EncryptionConfiguration) |
| 13 | Workload Resources 개요 |
| 14 | Deployment 활용 (rollout, scale, resources, probe) |
| 15 | Deployment 배포전략 (Recreate / RollingUpdate) |
| 16 | StatefulSet (+ Headless Service, volumeClaimTemplates) |
| 17 | DaemonSet |
| 18 | Job & CronJob |
| 19 | metrics-server 와 HPA 로 Pod 자동 확장 |

---

# Step 1. Kubernetes Volume 개념

## [목적]
컨테이너/Pod 는 삭제되면 내부 데이터가 사라진다. Pod 안의 컨테이너 간 데이터 공유, 데이터 영속화, 노드/외부 스토리지 연결을 위해 Volume 을 이해한다.

## [이론 설명]
> 원본 슬라이드 정리본(강사 설명 STT 기반)으로 보강. 이 클립은 슬라이드 강의로 터미널 실습 명령은 없다. (챕터 07 은 총 6개 클립: 볼륨 이해 → emptyDir → hostPath → PV&PVC → 동적 볼륨 StorageClass → EKS 스토리지 데모. 강사는 "이론만으로는 업무에 적용할 수 없다"며 전부 실습과 함께 진행한다고 강조하고, StorageClass 실습에서는 외부 프로비저너(볼륨을 자동으로 만들어 주는 구성요소)를 설치한다고 예고)

- **Volume 이 필요한 이유**
  - 별도 설정이 없으면 Pod 컨테이너 안에 저장한 파일은 Host 의 **임시 디스크**에 보관되고, Pod 가 삭제/재시작(장애 시 재생성 포함)되면 함께 사라진다(기본값 상태).
  - 멀티 컨테이너 Pod 는 컨테이너 간 데이터 공유가 필요하다(사이드카, init 컨테이너, 8장에서 배울 ambassador 패턴 등). Pod 안 컨테이너끼리 localhost 로 통신은 가능하지만 그 통신으로 파일을 주고받게 구현하는 것은 번거롭다 → 네트워크 통신이 아니라 **데이터 공유 관점**에서 추상화한 것이 Volume.
  - 데이터 지속성 예: 애플리케이션 로그는 Pod 가 휘발성이라 빼두지 않으면 같이 사라진다. hostPath 등으로 호스트에 저장해 두면 Pod 장애 후에도 원인 파악/접속 기록 확인에 쓸 수 있다.
  - 데이터 이전 예: DB(강사 예시 MySQL)를 쓰다가 Pod 를 새로 띄우거나 버전을 올려도 같은 볼륨 경로를 지정하면 데이터가 그대로 옮겨진다.
- **Volume 정의 방식**: 볼륨을 만드는 별도 리소스가 있는 것이 아니라, **Pod spec 안에서** 볼륨 기술을 정의한다("Kubernetes 는 Storage Volume 정의를 통해 Pod 의 Volume 을 정의한다").
  - `.spec.volumes` : containers 와 같은 레벨(spec 바로 아래). 어떤 볼륨 기술을 쓸지와 **볼륨 이름**을 지정.
  - `.spec.containers[*].volumeMounts` : 컨테이너 내부 파일시스템 경로(`mountPath`)에 마운트. 이때 `name` 은 `volumes` 에서 정한 이름과 **반드시 같아야** 한다. 컨테이너에 들어가 `df -h` 로 확인(경로에 볼륨이 연결되는 것을 "마운트된다"고 표현).
  - 볼륨 정의는 Pod 에 있고, 컨테이너별로 어디에 mount 할지는 `volumeMounts` 에서 따로 지정(같은 볼륨을 컨테이너마다 다른 경로에 mount 가능, `readOnly: true` 가능).
- **임시 볼륨 vs 영구 볼륨 - 구분 기준은 "상태 저장(stateful)인가, 상태 비저장(stateless)인가"**
  - 상태 비저장 애플리케이션: 컨테이너 존재 동안 파일시스템에 쓸 수는 있지만 애플리케이션 수명주기 측면에서 중요하지 않다 → Pod 의 휘발성을 그대로 두어도 되므로 emptyDir 같은 **임시 볼륨**.
  - 상태 저장 Pod(예: Elasticsearch): 데이터 보존을 위해 임시 볼륨이 아닌 **영구 볼륨**을 사용(동일 Pod 이든 아니든).
  - 핵심은 "데이터 보존 가치가 있는가 없는가"라는 목적을 먼저 구분하는 것. "데이터를 공유할 것인가, 상태(데이터)를 저장할 것인가" 관점에서 볼륨을 선택한다.
- **예시 1: Tomcat + nginx 가 한 Pod** : 두 컨테이너는 localhost 로 통신할 수 있지만 서로의 구성 파일(Tomcat `/usr/local/tomcat`, nginx `/etc/nginx`)에는 접근할 수 없다(슬라이드에 빨간 X). 이를 네트워크로 구현하는 것은 골치 아프므로 볼륨으로 공유한다.
- **예시 2: ELK 스택(Tomcat & Logstash)** : ELK = Elasticsearch(검색 엔진 DB) + Logstash(로그 수집) + Kibana(대시보드/차트) (강사가 EFK 스택도 있다고 언급). Tomcat 은 `/usr/local/tomcat/logs` 에 로그 파일을 남기고(로그 파일이 손상돼도 동작엔 영향 없음), Logstash 가 이를 가져와 Elasticsearch 로 전달한다.
  - Tomcat 의 `/usr/local/tomcat/logs` 와 Logstash 컨테이너의 `/mnt` 를 Pod 의 emptyDir(`tomcat-log`) 로 공유 → 이 구간은 임시 볼륨으로 충분.
  - Logstash 데이터를 Elasticsearch 로 보내는 경우: (1) Elasticsearch 컨테이너를 같은 Pod 에 넣어 컨테이너가 3개가 되면 Pod 안에 상태 저장 컨테이너가 있으므로 Pod 전체에 영구 볼륨 기법 사용, (2) Elasticsearch 를 별도 Pod 로 빼면 Tomcat/Logstash Pod 는 임시 볼륨, Elasticsearch Pod 만 영구 볼륨으로 나눠 사용 가능.
- **노드 구조와 hostPath / NFS** (슬라이드 11: Pause + 컨테이너 + Volume, [Node1]/DATA1 ↔ [Node2]/DATA1 "NFS 지원")
  - Pod 자체는 ephemeral(임시·순간적인) 영역. 그 값만 필요하면 임시 볼륨.
  - Pod 안 데이터를 보존해야 하면 우선 hostPath(해당 노드의 특정 디렉터리와 연결).
  - 노드 장애에 대비해 노드끼리 NFS 로 디렉터리 대 디렉터리 공유를 설정할 수 있다(실습에서 노드 3대에 NFS 구축).
  - hostPath 는 테스트용으로 많이 쓰이며 로컬 디스크를 쓰므로 **권한 문제/데이터 관리 문제**를 신경 써야 한다. 실무에서는 외부 디스크, 클라우드 디스크, NFS 같은 네트워크 기반 기술을 다양하게 쓴다.
- 볼륨 종류 (슬라이드 12 표)

| 종류 | 설명 |
|---|---|
| emptyDir | Pod 가 생성될 때 생성되고 Pod 가 삭제될 때 삭제되는 임시 볼륨 |
| hostPath | Node 의 로컬 볼륨 |
| awsElasticBlockStore | AWS EBS 볼륨 |
| azureDisk | Microsoft Azure 볼륨 |
| cephfs | Ceph 볼륨 |
| cinder | 오픈스택 Cinder 볼륨 |
| gcePersistentDisk | GCE 볼륨 |
| gitRepo | Git Repository 의 콘텐츠를 생성 초기에 저장한 볼륨 (Git 주소를 지정하면 Pod 생성 시 git clone 으로 저장소 파일을 모두 받아 Pod 안에 둠) |
| iSCSI | iSCSI 볼륨 |
| NFS | NFS(네트워크 파일시스템) 볼륨 |

- AWS, Azure, Google 등 클라우드 벤더는 각자의 드라이버로 연결할 수 있다. 이후 실습에서 대표 볼륨 기술인 emptyDir, hostPath, StorageClass, PV/PVC 를 직접 구현한다.
- 노드 간 공유가 필요하면 hostPath 로는 불가 → NFS 또는 클라우드 스토리지/PV·PVC 사용.

## [사용한 CLI / 설정]
Pod YAML 에서의 volumes / volumeMounts 기본 형태 (자료의 예):

```yaml
spec:
  containers:
  - name: container1
    image: debian:10
    volumeMounts:
    - name: internal-volume
      mountPath: /mount1
  - name: container2
    image: debian:10
    volumeMounts:
    - name: internal-volume
      mountPath: /mount2
      readOnly: true        # container2 는 읽기 전용
  volumes:
  - name: internal-volume
    emptyDir: {}            # 여기를 hostPath, PVC, NFS 등으로 바꿀 수 있음
```

## [확인 방법/주의점]
- 컨테이너 안에서 `df -h`, `mount | grep <경로>` 로 마운트 확인.
- `volumeMounts.name` 과 `volumes.name` 이 일치해야 한다.
- emptyDir 은 Pod 수명과 동일 → 영속 데이터에는 부적합.

---

# Step 2. emptyDir 활용

## [목적]
Pod 안의 컨테이너들이 임시 데이터를 공유하도록 emptyDir 를 구성하고, 수명(Pod lifecycle) 및 메모리(tmpfs) 옵션을 확인한다.

## [이론 설명]
> 원본: Clip 2 (약 31분, 슬라이드 + 터미널 실습). 강사는 이론은 짧게 하고 실제로 써 보는 것이 가장 좋다고 말한다.

- **emptyDir = 임시(ephemeral, non-persistent) 볼륨 기법.** Pod 생성 시 Podspec 에 의해 Pod 내부에 생성되는 **비어 있는 디렉터리**(그래서 이름이 emptyDir)를 임시 데이터 저장용으로 제공한다.
  - 동일 Pod 내 **모든 컨테이너가 접근**할 수 있고 내부 데이터 공유용으로 쓴다. 외부와 연결된 저장소가 아니라 **Pod 와 lifecycle 이 같다**(Pod 가 사라지면 데이터도 사라짐).
  - 성능은 Pod 가 실행되는 Node 환경에 따라 달라진다 — Node 의 디스크 유형(HDD, SSD, Network Storage 등)에 영향을 받는다(I/O 속도·처리량과 관련). 디스크 대신 **메모리 사용도 가능**.
  - 옵션은 사실상 `medium`(디스크/메모리)과 `sizeLimit`(용량 제한) 두 가지뿐이다. `emptyDir: {}` 의 빈 중괄호는 하위 옵션을 쓰지 않겠다는 뜻 = 디스크 타입, 용량 제한 없음.
  - 용어: 휘발성(ephemeral) = Pod 삭제 시 사라지는 성질. tmpfs = 디스크가 아니라 메모리를 파일시스템처럼 쓰는 방식.
- **kubectl run 의 한계 → dry-run 으로 YAML 뼈대 생성**: `kubectl run` 은 컨테이너를 하나만 만들고 volumes 같은 옵션을 명령줄로 줄 수 없다. 그래서 `--dry-run=client -o yaml` 로 YAML 만 출력해 파일로 저장한 뒤 vi 로 볼륨과 두 번째 컨테이너를 추가한다. `volumes` 와 `containers` 의 순서는 상관없다.
- **마운트 결과 확인**: 볼륨 내용은 (describe 외에는) 컨테이너 내부에서 확인하는 수밖에 없으므로 `kubectl exec` 로 들어간다. 멀티 컨테이너 Pod 는 `-c 컨테이너명` 필요.
  - `mount | grep mount1` / `df -h` 에서 디스크형 emptyDir 는 `/dev/sda1` 같은 **노드의 실제 디스크 장치**로 잡힌다(실습 출력: `/dev/sda1 on /mount1 type xfs (rw,relatime,...)`, 슬라이드에서 /dev/sda1 줄이 노란색 강조). 처음 `ls` 하면 비어 있다.
  - 같은 볼륨을 컨테이너1 은 `/mount1`, 컨테이너2 는 `/mount2` 에 마운트했으므로 경로가 달라도 데이터가 공유된다(사이드카 논리와 동일).
- **kubectl cp** : docker 에 `docker cp` 가 있듯 쿠버네티스의 `kubectl cp` 로 컨테이너 안 ↔ 밖 **양방향** 복사가 된다. **대상 파일명을 반드시 써야 한다**(일반 cp 처럼 이름 생략 불가). 형식: `kubectl cp <Pod>:<컨테이너 내부 경로> -c <컨테이너> ./<저장할 파일명>`; 반대 방향(밖 → 안)은 LAB2 에서 사용.
- **휘발성 검증**: Pod 를 지우고 다시 만들면 볼륨이 새로 마운트되어 이전 데이터는 올라오지 못한다 → 영구 보존이 필요한 데이터에는 emptyDir 가 맞지 않다. 재생성 시 IP 나 노드가 달라질 수 있다(실습에서는 같은 node3, IP 만 변경).
  - 노드(k8s-node3)에서 `df -h` 를 삭제 전후로 비교하면 `/run/containerd/io.containerd.grpc.v1.cri/sandboxes/.../shm` 항목이 8개 → 7개로 줄어든다(화면 확인). 강사는 emptyDir 데이터도 그쪽 임시 영역에 있었을 가능성이 높다는 **추정**을 덧붙인 것이며 정확한 저장 위치를 단정한 것은 아니다.
- **describe 해석**: `Mounts` 는 컨테이너별로 `/mount1 from temp-vol (rw)`, `Volumes` 의 `Type: EmptyDir (a temporary directory that shares a pod's lifetime)`(= Pod 와 lifetime 을 공유하는 임시 디렉터리), `Medium` 은 메모리 타입 여부, `SizeLimit` 은 용량 제한 여부(`<unset>` = 제한 없음).
- **메모리 emptyDir** : `medium: Memory` = 디스크가 아니라 메모리에 올림, `sizeLimit: 1Gi` = 용량 1기가 제한. df -h 에서 `/dev/sda1` 대신 **tmpfs**, 크기는 지정한 1.0G 로 보인다. **sizeLimit 을 설정하지 않으면 기본 2G 로 설정·제한되며 그것이 최대치이고 확장되지 않는다**(슬라이드 주석 및 강사 주의 — 자료 기준 설명).
- **활용 패턴**: 멀티 컨테이너 Pod, 사이드카(로그 수집), init container(Open API 로 받은 날씨 정보를 emptyDir 에 저장 → nginx 가 index.html 로 서비스) — ch05 에서 배운 weather-pod / log-pod 예제도 사실 emptyDir 를 사용했다. 강사는 emptyDir 는 "하나의 방법론일 뿐"이며 컨테이너 간 데이터 공유에 다양하게 활용 가능하다고 정리.
- **LAB2 (myweb-pod)** 의 의미: `web-source`(alpine, `tail -f /dev/null` 인자로 아무 일도 안 하고 살아 있기만 함)와 `webserver`(nginx)가 같은 emptyDir 를 마운트(alpine `/source`, nginx `/usr/share/nginx/html/`). `/source` 에 넣은 파일이 nginx html 디렉터리에 나타난다. kubectl cp 로 빌드 없이 Pod 밖에서 웹 소스를 공급하는 "수동적인 방법"이다. Pod IP 는 클러스터 내부에서만 접근되므로 NodePort 로 노출(어느 노드 IP 로 접속해도 됨).
- **LAB3 (Tomcat & logstash)** : 로그를 영구로 둘지 임시로 둘지 결정해야 하는데 이번 케이스는 임시로 충분하다고 보아 emptyDir 사용. Elasticsearch 까지는 연결하지 않고 Tomcat Deployment 하나만 만든다. Tomcat 은 날짜별 웹 서비스 로그 파일을 만들고, logstash 는 Elasticsearch 앞단에서 로그를 정제해 필요한 내용만 넘기는 역할 — 두 컨테이너가 로그 디렉터리를 emptyDir 로 공유하므로 따로 전송하지 않아도 같은 파일을 읽는다.

## [사용한 CLI]

### 2-1. YAML 작성 (dry-run 활용) 및 멀티 컨테이너 Pod
```bash
mkdir volume && cd $_
kubectl run temp-pod1 --image=debian:10 --dry-run=client -o yaml > temp-pod1.yaml
vi temp-pod1.yaml
```
- `--dry-run=client -o yaml` : 실제 생성 없이 YAML 만 출력 → `>` 로 파일 저장 후 편집.

```yaml
# temp-pod1.yaml
apiVersion: v1
kind: Pod
metadata:
  name: temp-pod1
spec:
  volumes:
  - name: temp-vol
    emptyDir: {}
  containers:
  - image: ubuntu:14.04
    name: temp-container1
    volumeMounts:
    - name: temp-vol
      mountPath: /mount1
  - image: ubuntu:14.04
    name: temp-container2
    volumeMounts:
    - name: temp-vol
      mountPath: /mount2
```

### 2-2. 배포 및 컨테이너 확인
```bash
kubectl apply -f temp-pod1.yaml
kubectl get po -o wide | grep temp            # READY 2/2 Running, 노드 확인(k8s-node3)

# 컨테이너 1 에서 확인/파일 생성 (-c 로 컨테이너 지정)
kubectl exec -it temp-pod1 -c temp-container1 -- bash
mount | grep mount1
df -h
cd /mount1/
echo 'welcome to fastcampus. temp-pod1' > k8s-1.txt
cat k8s-1.txt
exit

# 컨테이너 2 에서 같은 파일이 보이는지 확인
kubectl exec -it temp-pod1 -c temp-container2 -- bash
mount | grep mount2
cd /mount2/ ; ls ; cat k8s-1.txt
exit
```
- `kubectl exec -it <pod> -c <컨테이너> -- bash` : 멀티 컨테이너 Pod 는 `-c` 필수.

### 2-3. kubectl cp 로 파일 가져오기
```bash
kubectl cp temp-pod1:mount1/k8s-1.txt -c temp-container1 ./k8s-1.txt
# 형식: kubectl cp <Pod>:<경로> -c <컨테이너> <로컬경로>
```

### 2-4. Pod 삭제 시 데이터 소멸 확인
```bash
# 해당 노드(k8s-node3)에서
df -h                              # Pod 가 마운트한 항목(.../sandboxes/.../shm 등) 확인
# master 에서
kubectl delete po temp-pod1
# node3 에서 다시 df -h  → 마운트 사라짐
kubectl apply -f temp-pod1.yaml
kubectl exec -it temp-pod1 -c temp-container1 -- bash
ls /mount1/                        # 비어 있음 (이전 k8s-1.txt 없음)
```

### 2-5. describe 로 볼륨 정보 확인
```bash
kubectl describe po temp-pod1
# Mounts: /mount1 from temp-vol (rw), /mount2 from temp-vol (rw)
# Volumes: temp-vol  Type: EmptyDir (a temporary directory that shares a pod's lifetime)
#          Medium:  (비어있음)  SizeLimit: <unset>
```

### 2-6. 메모리 기반 emptyDir (tmpfs)
```bash
vi temp-mem-pod.yaml
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: temp-mem-pod
spec:
  volumes:
  - name: memory-vol
    emptyDir:
      medium: Memory
      sizeLimit: 1Gi
  containers:
  - image: dbgurum/k8s-lab:initial
    name: mem-container
    volumeMounts:
    - name: memory-vol
      mountPath: /mem-mount
```
```bash
kubectl apply -f temp-mem-pod.yaml
kubectl get po -o wide | grep temp-mem
kubectl exec -it temp-mem-pod -- bash
df -h                                  # tmpfs 1.0G  /mem-mount
exit
kubectl describe po temp-mem-pod       # Medium: Memory, SizeLimit: 1Gi
kubectl delete -f temp-mem-pod.yaml
```

### 2-7. [LAB2] 웹 소스 공유 (alpine + nginx) 와 NodePort
```yaml
# myweb-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: myweb-pod
  labels:
    app: myweb
spec:
  containers:
  - name: web-source
    image: alpine
    args: ["tail", "-f", "/dev/null"]
    volumeMounts:
    - name: source-volume
      mountPath: /source
  - name: webserver
    image: nginx:1.25.3-alpine
    volumeMounts:
    - name: source-volume
      mountPath: /usr/share/nginx/html/
  volumes:
  - name: source-volume
    emptyDir: {}
```
```html
<!-- index.html -->
<html>
 <head>
  <title>Kubernetes Running Sample App -emptyDir Test-</title>
  <style>body {margin-top: 40px; background-color: #333;} </style>
  <meta http-equiv="refresh" content="3" >
 </head>
 <body>
  <div style=color:white;text-align:center>
   <h1> Kubernetes, myWeb Pod Application. </h1>
   <h2> Good fastcampus! </h2>
   <p>Application is now good running on a Pod in kubernetes.</p>
  </div>
 </body>
</html>
```
```bash
kubectl delete -f temp-mem-pod.yaml     # 앞 실습 Pod 정리
vi myweb-pod.yaml                       # 위 YAML 작성
kubectl apply -f myweb-pod.yaml
vi index.html                           # 위 HTML 작성 (로컬)
kubectl get po -o wide | grep myweb
# 임시 curl Pod 로 확인 (--rm --restart=Never : 실행 후 삭제)
kubectl run web-test -it --rm --restart=Never --image=curlimages/curl -- curl <Pod IP>
#  → 403 Forbidden (html 디렉토리가 비어 있음)
kubectl cp index.html myweb-pod:/source/index.html -c web-source
kubectl run web-test -it --rm --restart=Never --image=curlimages/curl -- curl <Pod IP>   # 정상 응답

# NodePort 로 노출
kubectl expose po myweb-pod --name=myweb-svc --type=NodePort --port=80 --target-port=80
# 이미 있으면: Error from server (AlreadyExists) → kubectl delete svc myweb-svc 후 재실행
kubectl get po,svc -o wide | grep myweb          # 80:31638/TCP
# 접속: http://<노드IP>:<NodePort>
```

### 2-8. [LAB3] Tomcat & logstash 로그 공유 (Deployment)
```yaml
# tomcat-pod.yaml (자료 일부 생략: env UMASK "0022" 등)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tomcat
spec:
  replicas: 1
  selector:
    matchLabels:
      run: tomcat
  template:
    metadata:
      labels:
        run: tomcat
    spec:
      containers:
      - image: tomcat
        name: tomcat
        ports:
        - containerPort: 8080
        volumeMounts:
        - name: tomcat-log
          mountPath: /usr/local/tomcat/logs
      - image: logstash:7.17.16
        name: logstash
        volumeMounts:
        - name: tomcat-log
          mountPath: /mnt
        args: ["-e input { file { path => \"/mnt/localhost_access_log.*\" } } output { stdout { codec => rubydebug } elasticsearch { hosts => [\"http://elasticsearch-svc.default.svc.cluster.local:9200\"] } }"]
      volumes:
      - name: tomcat-log
        emptyDir: {}
```
```bash
vi tomcat-pod.yaml
kubectl apply -f tomcat-pod.yaml
kubectl exec -it <tomcat-pod> -c tomcat -- ls /usr/local/tomcat/logs
kubectl exec -it <tomcat-pod> -c logstash -- ls /mnt      # 같은 로그 파일이 보임
```

### 2-9. 복습: sidecar 패턴 (log-pod)
```yaml
# sidecar-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: log-pod
spec:
  containers:
  - name: app-container
    image: nginx:1.25.3
    volumeMounts:
    - name: html-log
      mountPath: /usr/share/nginx/html
  - name: sidecar-container
    image: debian:10
    volumeMounts:
    - name: html-log
      mountPath: /date-log
    command: ["/bin/sh", "-c"]
    args:
      - while true; do
          date >> /date-log/index.html;
          sleep 1;
        done
  volumes:
  - name: html-log
    emptyDir: {}
```

## [확인 방법/주의점]
- 컨테이너 2 에서 `ls /mount2` 시 컨테이너 1 이 만든 파일이 보이면 공유 성공. `mount | grep`, `df -h` 로 디스크형(`/dev/sda1`)/메모리형(`tmpfs`) 구분.
- Pod 삭제/재생성 시 emptyDir 내용은 사라진다(노드와 IP 가 바뀔 수도 있음). `kubectl describe po` 의 Volumes 에서 Medium/SizeLimit 확인.
- `kubectl exec` 는 멀티 컨테이너일 때 `-c` 로 컨테이너를 지정.
- `kubectl cp` 는 대상 파일명을 반드시 명시(양방향 복사).
- 강의 실습에서는 YAML 의 이미지를 `ubuntu:14.04`(슬라이드 표기) 대신 실습용 `dbgurum/k8s-lab:initial` 로 바꿔 apply 했다(describe 에서 확인). 슬라이드의 tomcat 예제 첫 화면에 `temp-mem-pod.yaml` 로 잘못 표기된 부분이 있었으나 이후 화면은 `tomcat-pod.yaml`.
- **sizeLimit 미설정 시 메모리 emptyDir 는 기본 2G 로 제한되고 확장되지 않는다**(슬라이드 주석/강사 주의). 메모리를 쓰므로 용량 지정에 신경 쓸 것.
- **오류와 해결**: `kubectl expose` 시 `Error from server (AlreadyExists): services "myweb-svc" already exists` → `kubectl delete svc myweb-svc` 후 다시 expose. 일회용 curl Pod 실행 시 `couldn't attach to pod ... falling back to streaming logs` 경고는 뜨지만 결과 HTML 은 정상 출력된다. 처음 curl 시 `403 Forbidden` 은 nginx html 폴더가 비어 있기 때문이며 `kubectl cp` 로 index.html 을 `/source` 에 넣으면 해결.
- tomcat(약 1분 34초)/logstash:7.17.16(약 2분 56초) 이미지는 무거워 pull 에 시간이 걸린다. Pod 이름(`tomcat-<hash>-<id>`)은 실행마다 달라지므로 `kubectl get po` 로 확인해 사용. 접속 기록이 없으면 로그 내용은 비어 있다(로그가 쌓이면 logstash 가 Elasticsearch 로 전달하는 것이 다음 단계).

---

# Step 3. hostPath 와 NFS 활용

## [목적]
노드의 디렉토리를 Pod 에 mount 해 데이터를 Pod 수명과 분리하고, 노드 간 공유가 필요한 경우 NFS 를 연결한다. (nginx 로그 수집, MySQL 데이터 보존 실습)

## [이론 설명]
> 원본: Clip 3 (약 30분, 슬라이드 + 터미널 실습). 3번째 Pod Volume 클립. hostPath 는 Pod 의 휘발성을 보완하는 가장 기본적인 방법이다.

- **hostPath** : Pod 가 생성된 Node(호스트)의 로컬 파일시스템에 있는 **파일 또는 디렉터리**를 Pod 볼륨으로 mount 한다(디렉터리뿐 아니라 파일도 mount 가능). 슬라이드 표현은 "영구 볼륨"이며, emptyDir 는 임시 볼륨·hostPath 는 영구 볼륨처럼 쓸 수 있다고 대비해 설명한다. **Pod 가 삭제돼도 Node 의 데이터는 남는다.**
- **Node 종속(핵심 한계)** : 데이터가 특정 Node 에 저장되므로 Pod 가 재생성되어 **Node 가 바뀌면 이전 Node 에 저장된 데이터를 읽지 못한다.** 같은 Node 로 지정해 쓰면 같은 데이터를 계속 쓸 수 있지만, Node 에 문제가 생겨 다른 Node 에서 Pod 가 재시작되면 그 Node 에는 데이터가 없다. (Pod 재생성 시 1·2·3번 Node 중 어디로 갈지는 확률 1/3 — 같은 Node 면 유지, 다른 Node 면 안 보임. 데이터가 없는 이유는 삭제돼서가 아니라 이전 Node 의 `/DATA1/fastcampus` 에 남아 있고 Pod 가 다른 Node 에 있기 때문.)
- **장단점/경고 (슬라이드 32)**
  - 장점: 단일 Node 에만 생성되므로 **테스트 상황에 적합**(강사: 사실상 테스트용으로 쓰게 된다). Pod 가 삭제돼도 내용이 삭제되지 않는다.
  - 단점: 관리 측면(호스트의 공간·권한)과 **보안 측면** 우려.
  - 쿠버네티스 공식 문서 경고: HostPath 볼륨은 보안 위험이 많아 **가능하면 사용하지 않는 것이 좋고**, 꼭 써야 한다면 필요한 파일/디렉터리로만 범위를 지정하고 **ReadOnly 로 mount** 해야 한다. AdmissionPolicy 로 특정 디렉터리의 HostPath 접근을 제한할 때 readOnly mount 정책이 유효하려면 `volumeMounts` 가 반드시 지정되어야 한다.
- **hostPath `type`** (핵심은 "경로가 존재해야 하는가, 없어도 되는가")

| type | 동작 |
|---|---|
| (빈 문자열, 기본) | 이전 버전과의 호환성을 위한 것으로, mount 하기 전에 아무런 검사도 수행되지 않음 |
| DirectoryOrCreate | 주어진 경로에 아무것도 없다면 필요에 따라 Kubelet 이 가진 것과 동일한 그룹/소유권, 권한 **0755** 의 빈 디렉터리 생성. 이미 있으면 그대로 사용(지우고 다시 만들지 않음). 없는 경로를 쓰는 경우가 많아 보통 이것을 사용 — 이 영상의 실습은 대부분 DirectoryOrCreate |
| Directory | 주어진 경로에 디렉터리가 이미 있어야 함 |
| FileOrCreate | 주어진 경로에 아무것도 없다면 필요에 따라 Kubelet 이 동일한 그룹/소유권, 권한 **0644** 의 빈 파일 생성 |
| File | 주어진 경로에 파일이 있어야 함 |
| Socket | 주어진 경로에 UNIX 소켓이 있어야 함 |
| CharDevice | 주어진 경로에 문자 디바이스가 있어야 함 |
| BlockDevice | 주어진 경로에 블록 디바이스가 있어야 함 |

- **nodeSelector 로 Node 고정** : 같은 hostPath 라도 Node 가 다르면 별개의 디렉터리이므로(host-pod1 → node1, host-pod2 → node2 에서 서로의 파일이 안 보임) 비교 실습을 위해 `kubernetes.io/hostname` 으로 Node 를 지정한다. YAML 에 nodeSelector 가 없으면 스케줄러가 고른 Node 의 `/DATA1` 아래에 만들어진다.
- **Node 간 공유 → NFS** : `/DATA1` 은 1·2·3번 Node 에 모두 있다. 이를 NFS(Network File System, 네트워크로 디렉터리를 공유하는 방식)로 묶으면 여러 Node 가 같은 데이터를 본다. 실습: k8s-node1 = NFS 서버, node2·node3 = 클라이언트. 왜 네트워크 기술을 여기서 다루느냐 → 쿠버네티스 볼륨 기술에 NFS 를 직접 지정하는 방식이 있고, 뒤의 PV/PVC 에서도 쓸 수 있기 때문(강사 설명).
  - `systemctl enable --now` : 부팅 시 자동 시작 등록(enable)과 동시에 지금 바로 시작(--now).
  - `/etc/exports` : 어떤 디렉터리를 어떤 권한으로 공유할지 적는 NFS 서버 설정 파일. 강사가 **이 부분이 가장 중요**하다고 강조. 옵션: `rw, sync, no_root_squash, no_subtree_check, insecure`.
  - NFS 포트 **2049** 가 LISTEN 인지 `netstat -nlp | grep 2049` 로 확인(tcp, tcp6 둘 다 LISTEN).
  - 설치(`nfs-kernel-server`)는 1~3 노드 모두, `/etc/exports` 설정은 **서버(1번)에서만** 수행. 설정 후에는 `systemctl restart nfs-server` 로 반영.
  - node2/3 에서 `sudo mount -t nfs k8s-node1:/DATA1 /DATA1` 로 node1 의 `/DATA1` 을 자기 `/DATA1` 에 mount → `df -h` 에 `k8s-node1:/DATA1` 표시, node2 에서 만든 `k8s-nfs.txt` 와 node1 의 host-pod1 이 만든 `k8s-1.txt` 가 함께 보임.
- **NFS 를 Pod 볼륨으로 직접 사용** : Node 의 mount 에 의존하지 않고 Pod 정의 `volumes` 에 `nfs`(path, server) 를 직접 지정. nginx 문서 경로 `/usr/share/nginx/html` 에 NFS 서버(192.168.56.101 = k8s-node1)의 `/DATA1` 을 mount → `/DATA1/index.html` 을 두면 nginx 가 웹 페이지로 제공(NFS 로 다른 Node 에서 소스 제공하는 식의 활용).
- **활용 예 1 — nginx 로그 감사(LAB3)** : nginx 는 `access.log`(누가 언제 접근했는지)와 `error.log`(오류)를 `/var/log/nginx` 에 기록. 이를 hostPath 로 Node 의 `/DATA1/nginx-log` 에 연결하면 Pod 가 망가져도(삭제돼도) 호스트 쪽 로그 파일이 남아 문제 Pod 의 로그를 감사·분석할 수 있다. access.log 한 줄은 공백으로 구분되며 **1번째 필드 = IP, 4번째 필드 = 날짜** → awk 로 시간 구간 필터 후 IP 만 뽑아 `sort | uniq -c | sort -r` 로 IP별 접속 횟수 내림차순 집계(웹 로그 분석에서 종종 쓰는 기법). `tail -f` 는 파일 끝을 따라가며 새 로그를 실시간 표시.
- **활용 예 2 — MySQL 데이터 보존(LAB4)** : MySQL 은 데이터를 컨테이너의 `/var/lib/mysql` 에 저장(DB 는 디렉터리, 테이블은 파일 — 테이블 데이터는 .ibd 파일). 이 경로를 hostPath 로 node1 의 `/DATA1/mysql-data` 에 연결하면 Pod 를 완전히 삭제 후 재생성해도 DB·테이블 데이터(2건)가 그대로 조회된다. 강사: 물리 서버 시절엔 상상하기 어려운 일이며 hostPath 가 단순 파일 공유를 넘어 DB 데이터까지 제공한다. `MYSQL_ROOT_PASSWORD` 는 MySQL 이미지가 초기 root 비밀번호로 쓰는 환경변수(실습용 값).
  - 응용: `mydata2.yaml`(nodeSelector 를 k8s-node2 로 변경, 슬라이드 주석 "NFS") 으로 node2 에서 띄워도 NFS 로 연결되어 있어 `show databases` 에 k8sdb 가 보이고 2건이 조회됨 — 강사가 직접 해 보라고 당부.
  - 과제: MySQL 이미지 버전을 바꿔(예: 5.7) 같은 볼륨으로 Pod 를 만들면? → 강사 답: 버전을 낮추거나 올려도 동일하게 적용할 수 있다(슬라이드에 mysql:8.0 옆 5.7 손글씨 메모).

## [사용한 CLI]

### 3-1. [LAB1] hostPath Pod
```yaml
# host-pod1.yaml
apiVersion: v1
kind: Pod
metadata:
  name: host-pod1
spec:
  containers:
  - name: container
    image: dbgurum/k8s-lab:initial
    volumeMounts:
    - name: host-path
      mountPath: /mount1
  volumes:
  - name: host-path
    hostPath:
      path: /DATA1/fastcampus
      type: DirectoryOrCreate
```
```bash
kubectl apply -f host-pod1.yaml
kubectl get po -o wide | grep host-pod
kubectl exec -it host-pod1 -- bash
cd /mount1/
echo 'welcome to fastcampus. host-pod1' > k8s-1.txt
exit
kubectl describe po host-pod1
#   Volumes: host-path  Type: HostPath (bare host directory volume)
#            Path: /DATA1/fastcampus  HostPathType: DirectoryOrCreate

# 해당 노드에서 실제 파일 확인
cd /DATA1/fastcampus/ ; ls ; cat k8s-1.txt

# Pod 삭제 후 재생성 → 데이터 유지 확인
kubectl delete po host-pod1
kubectl apply -f host-pod1.yaml
kubectl exec -it host-pod1 -- bash     # /mount1 에 k8s-1.txt 존재
```
- Pod 가 다른 노드에 스케줄되면 데이터가 없음 (자료에서 k8s-node1 로 간 경우 재확인).

### 3-2. 노드 고정: nodeSelector (host-pod12.yaml)
```yaml
spec:
  nodeSelector:
    kubernetes.io/hostname: k8s-node1     # host-pod2 는 k8s-node2
  containers:
  ...
```
```bash
kubectl apply -f host-pod12.yaml
kubectl get po -o wide | grep host-pod      # host-pod1 → node1, host-pod2 → node2
kubectl exec -it host-pod1 -- bash          # /mount1 에 k8s-1.txt 생성
kubectl exec -it host-pod2 -- bash          # /mount1 에 k8s-2.txt 생성 (노드별로 따로 저장됨)
```

### 3-3. [LAB2] NFS 서버 구성 (k8s-node1 서버, node2/3 클라이언트)
```bash
# 노드 1~3 에 설치/기동
sudo apt -y install nfs-kernel-server
sudo systemctl enable --now nfs-server      # enable: 부팅 시 자동 시작, --now: 즉시 시작
sudo systemctl restart nfs-server
sudo systemctl status nfs-server

# NFS 서버(node1) 설정
sudo vi /etc/exports
```
```text
/DATA1  *(rw,sync,no_root_squash,no_subtree_check,insecure)
```
```bash
sudo netstat -nlp | grep 2049        # NFS 포트 2049 LISTEN 확인
sudo systemctl restart nfs-server    # 설정 반영

# node2, node3 에서 마운트
sudo systemctl status nfs-server
sudo mount -t nfs k8s-node1:/DATA1 /DATA1
df -h                                # k8s-node1:/DATA1 ... /DATA1 확인
cd /DATA1 ; ls                       # node1 의 /DATA1 내용(fastcampus 등)이 보임
sudo touch /DATA1/fastcampus/k8s-nfs.txt
cd fastcampus/ ; ls                  # k8s-1.txt(node1 host-pod1 생성) + k8s-nfs.txt
```
- node2 에서 `mount.nfs: access denied by server while mounting k8s-node1:/DATA1` 이 나면 node1 의 `/etc/exports` 설정 후 `systemctl restart nfs-server` 하고 다시 mount.

### 3-4. NFS 를 Pod 볼륨으로 직접 사용 (nfs-pod.yaml)
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nfs-nginx
spec:
  containers:
  - name: nfs-nginx
    image: nginx:1.25.3-alpine
    volumeMounts:
    - name: nfs-vol
      mountPath: /usr/share/nginx/html
  volumes:
  - name : nfs-vol
    nfs:
      path: /DATA1
      server: 192.168.56.101
```
```bash
kubectl apply -f nfs-pod.yaml
kubectl get po -o wide | grep nfs
curl <Pod IP>          # NFS 의 /DATA1/index.html 이 서비스됨
```

### 3-5. [LAB3] nginx 로그를 hostPath 에 저장 (web-log.yaml)
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: weblog-pod
spec:
  nodeSelector:
    kubernetes.io/hostname: k8s-node1
  containers:
  - name: nginx-web
    image: nginx:1.23.1-alpine
    ports:
    - containerPort: 80
    volumeMounts:
    - name: host-path
      mountPath: /var/log/nginx
  volumes:
  - name: host-path
    hostPath:
      path: /DATA1/nginx-log
      type: DirectoryOrCreate
```
```bash
vi web-log.yaml
kubectl apply -f web-log.yaml
kubectl get po -o wide | grep weblog   # ContainerCreating → Running (k8s-node1)
# 접속 기록 만들기: master 및 다른 노드(k8s-node2 등)에서 Pod IP 로 여러 번 호출
curl <weblog Pod IP>                   # 실습값 예: curl 10.111.156.72 → nginx 기본 페이지
# node1 에서
cd /DATA1/nginx-log/ ; ls            # access.log error.log
tail -f access.log                   # 실시간 로그 (Pod 외부에서 확인)
# 시간 구간 IP 별 접속 횟수 집계
awk '$4>"[04/Jan/2024:07:28:22]" && $4<"[04/Jan/2024:07:29:03]"' access.log | awk '{ print $1 }' | sort | uniq -c | sort -r | more
```

### 3-6. [LAB4] MySQL 데이터를 hostPath 에 보존 (mydata.yaml)
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mydata-pod
spec:
  nodeSelector:
    kubernetes.io/hostname: k8s-node1
  containers:
  - name: mydata-container
    image: mysql:8.0
    volumeMounts:
    - name: host-path
      mountPath: /var/lib/mysql
    env:
    - name: MYSQL_ROOT_PASSWORD
      value: "password"
  volumes:
  - name: host-path
    hostPath:
      path: /DATA1/mysql-data
      type: DirectoryOrCreate
```
```bash
kubectl apply -f mydata.yaml
kubectl exec -it mydata-pod -- bash
mysql -uroot -p
```
```sql
create database k8sdb;
use k8sdb;
create table k8s (c1 int, c2 varchar(20));
insert into k8s values (1,'k8s');
insert into k8s values (2,'fastcampus');
select * from k8s;
exit
```
```bash
kubectl delete -f mydata.yaml
kubectl apply -f mydata.yaml          # 재생성 후 show databases / use k8sdb / select * from k8s → 데이터 2건 유지
# mydata2.yaml : nodeSelector 를 k8s-node2 로 바꿔 NFS 로 마운트된 /DATA1 에서도 동일 데이터 확인
vi mydata2.yaml                       # mydata.yaml 내용 기반, kubernetes.io/hostname: k8s-node2 로 변경
kubectl apply -f mydata2.yaml         # node2 의 Pod 에서 show databases → k8sdb, select → 2건
```

## [확인 방법/주의점]
- `kubectl describe po` 의 Volumes 에서 `Type: HostPath (bare host directory volume)`, Path, HostPathType 확인 + Mounts `/mount1 from host-path (rw)`, Events `Successfully assigned default/host-pod1 to k8s-node3`. 노드에서 실제 파일 확인(`/DATA1/fastcampus` 가 사람이 만들지 않았는데도 DirectoryOrCreate 로 자동 생성).
- hostPath 는 노드 종속 → 다중 노드 서비스에는 nodeSelector 고정 또는 NFS/PV 사용. `volumeMounts.name` 과 `volumes.name`(host-path)은 항상 같아야 한다(강사 강조).
- 실습에서는 host-pod1 이 k8s-node3 에 배치되었고(교재 슬라이드 35 의 예시는 k8s-node1 → 재생성 시 node3 으로 이동해 파일이 안 보이는 사례) 재생성 시에도 우연히 node3 이라 파일이 유지되었다.
- `cd k8s-1.txt` 처럼 파일에 cd 하면 `bash: cd: k8s-1.txt: Not a directory` 오류 — 파일이라서 나온 것으로 실습상 문제 아님.
- **오류와 해결 (NFS)** : node2 에서 첫 mount 시 `mount.nfs: access denied by server while mounting k8s-node1:/DATA1` → node1 의 `/etc/exports` 설정이 반영되기 전이었던 것으로 보인다. 설정 후 `sudo systemctl restart nfs-server`(설정을 했으니 리스타트 필요) 하고 다시 mount 하면 해결. `/etc/exports` 의 `no_root_squash`, `insecure` 등 옵션이 핵심.
- NFS 서버 디렉터리(`/DATA1`)에 index.html 을 만들 때 root 소유라 `sudo` 필요. nfs-pod YAML 의 `server` 는 NFS 서버 IP(192.168.56.101 = k8s-node1) 를 환경에 맞게 변경.
- MySQL 8.0 이미지는 용량이 커서 Running 까지 `ContainerCreating` 시간이 걸린다. mysql 접속은 `mysql -uroot -p` 후 비밀번호 입력(실습 값은 마스킹된 `password`, 실습용). 컨테이너 안에서 cd 를 잘못 입력하면 `too many arguments` 오류(강사 실수 장면).
- nginx 로그 실습에서 weblog-pod 를 삭제해도 `/DATA1/nginx-log` 의 access.log/error.log 는 그대로 남는다.
- (정정) 이전 문서의 "MySQL 5.7 ↔ 8.0 호환 문제 가능성"은 자료 근거 없음 — 강사는 버전을 낮추거나 올려도 동일하게 적용 가능하다고 답했다(공식 호환성은 별개로 확인 필요).

---

# Step 4. PV & PVC (정적 프로비저닝)

## [목적]
스토리지(PV)를 관리자가 만들고 사용자는 PVC 로 요청하여 Bound 시킨 뒤 Pod 에서 사용하는 영속 볼륨 구조를 익힌다.

## [이론 설명]
> 원본: Clip 4 (약 22분, 슬라이드 + 실습). 학습 목표: PV/PVC 역할 차이와 Bound 조건(용량 + 접근 권한), 생명주기 4단계와 회수 정책, accessModes, label/selector 수동 연결, NFS PV, `kubectl edit` 로 PV 용량 변경.

- **왜 PV/PVC 인가** : hostPath 방식은 리소스 관리 및 보안 측면에서 권장되지 않는다. 일반 사용자가 노드의 로컬 디렉터리에 접근해야 하고 그 정보를 공유하려면 권한도 따로 줘야 하는 불편함이 있어, 이를 해결하려고 만든 것이 PV/PVC. 스토리지 제공(PV)과 사용(PVC)을 분리한다.
  - **PV (Persistent Volume)** : PV object 로 Storage 를 추상화. **관리자 또는 StorageClass 에 의해 만들어지는** Volume, 스토리지 그 자체(실제 디스크·NFS·클라우드 스토리지의 공간을 물리적으로 소비). 강사는 PV 를 만드는 일을 "Provisioning 한다"고 표현. PV 는 직접 쓰지 않고 **항상 PVC 를 통해** 사용.
  - **PVC (Persistent Volume Claim)** : PVC object 로 할당 요청. **사용자(개발자)** 가 Volume 을 쓰기 위해 PV 에 보내는 요청(claim). **용량(capacity)과 권한(accessModes)** 설정으로 요청.
- **PV 와 PVC 가 연결되는 조건** : 용량(capacity)과 접근 권한(accessModes) 두 조건(AND)에 맞는 PV 를 찾아 준다(PV 가 10개쯤 있으면 두 조건에 맞는 PV 를 탐색, 조건에 맞는 PV 가 여러 개면 먼저 걸리는 것이 선택됨). **조건에 맞는 PV 가 없으면 PVC 는 Pending 상태로 남는다.** 용량이 정확히 같지 않아도 **요청 이상**이면서 접근 모드가 일치하면 연결된다(pvc4 1G → pv3 2G).
  - **PV 와 PVC 는 1:1 관계** — "하나의 PV 에 여러 개의 PVC 가 연결될 수 없다"(강사 강조).
- **5단계 사용 흐름 (슬라이드)**

| 단계 | 누가 | 하는 일 |
|---|---|---|
| 1 | 관리자 | 사용 가능한 Disk 및 NFS 등 공유 가능한 디스크에 물리적인 스토리지를 provisioning |
| 2 | 관리자 | 선언형 YAML 로 PV 생성 |
| 3 | 사용자 | PV 에 요청하는 PVC 생성 |
| 4 | (쿠버네티스) | 사용자가 요청한 PVC 에 맞는 PV 를 찾아 PVC 와 PV 를 Bound 시킴 |
| 5 | 사용자 | PVC 를 볼륨으로 사용하는 Pod 생성 (hostPath/emptyDir 쓰는 것과 같은 방식으로 사용) |

- **PV/PVC 생명주기 4단계 : Provisioning → Binding → Using → Reclaiming (순환도)**
  - Provisioning : PV 를 만드는 단계. 미리 만들어 두는 **정적(static)** 과 요청 시 만드는 **동적(dynamic, StorageClass 사용 — 다음 클립)** 이 있고, 이 클립은 정적 실습.
  - Binding : 생성한 PV 를 PVC 와 연결. 스토리지 용량과 접근 방법에 따라 연결되며 **대응되는 PV 가 생길 때까지 Pending 유지**.
  - Using : PVC 가 Pod 에서 사용되고 Pod 는 PVC 를 볼륨으로 인식해 사용.
  - Reclaiming : 사용이 끝난 PVC 가 초기화되는 단계. 이때 회수 정책 선택.
- **Reclaim Policy (슬라이드 설명 기준)**

| 정책 | 동작 |
|---|---|
| Retain | PVC 삭제 시 대응 PV 상태가 Bound → **Released** 로 바뀌며 다른 PVC 가 연결될 수 없는 상태, PV 속 **데이터는 유지**. **기본값**(실습에서 `kubectl get pv` 의 RECLAIM POLICY 열에 Retain 표시) |
| Delete | PVC 삭제 시 대응 PV 도 같이 삭제되어 데이터도 회수됨 |
| Recycle | PVC 삭제 시 대응 PV 상태가 Bound → **Pending** 으로 변경, 다른 PVC 가 쓸 수 있도록 대기 (참고: 강의 슬라이드 설명 그대로이며 공식 문서에서는 Recycle 이 더 이상 권장되지 않음) |

- **accessModes** (PV 를 만들 때 설정하고 PVC 의 권한과 매칭되어야 함. 종류는 3가지뿐. "Once / Many 는 노드의 개수(한 노드 / 여러 노드), ReadOnly / ReadWrite 는 읽기 전용 / 쓰기까지 가능")

| 약어 | 이름 | 의미 (슬라이드) |
|---|---|---|
| ROX | ReadOnlyMany | 읽기만 가능, 모든 노드에서 접근 가능 |
| RWX | ReadWriteMany | 읽기-쓰기 가능, 모든 노드에서 접근 가능 |
| RWO | ReadWriteOnce | 단일 노드에서 읽기-쓰기로 마운트 가능 |

- **PV YAML 구성 요소** : `capacity.storage` 와 `accessModes` = PVC 가 PV 를 찾을 때 쓰는 두 조건. `local.path` = 스토리지가 어디에 있는지 지정(NFS 영역/로컬 스토리지/클라우드 영역을 여기서 정함; 여기서는 로컬 `/DATA2`). `nodeAffinity` = local 이면 "어떤 노드의 로컬인지" 정해야 하므로 노드 라벨(`kubernetes.io/hostname`)로 k8s-node1 식별(이전에 배운 nodeSelector 라벨과 같은 개념). PV 는 디스크 프로비저닝일 뿐 데이터 영역을 만드는 작업이 아니어서 STATUS 가 바로 **Available** 이 된다(CLAIM 열 비어 있음).
- **PVC 로 Pod 에서 사용** : 컨테이너 안 `/mynode` 에 만든 파일이 노드의 `/DATA2` 에 그대로 나타난다. 강사 정리: "hostPath 와 똑같지만 호스트 권한으로 접근하는 것이 아니라 PV/PVC 오브젝트를 통해서만 접근하므로 관리적·보안적 부분이 어느 정도 커버된다."
- **label/selector 수동 연결(LAB2)** : 서비스가 Pod 를 라벨로 찾는 것과 같은 방식으로, PV 에 라벨(`name: pv4`)을 달고 PVC 의 `selector.matchLabels` 로 선택하면 수동 연결. `storageClassName: ""` 는 동적 프로비저닝(StorageClass)을 쓰지 않고 이미 만들어진 PV 에만 연결하겠다는 뜻(슬라이드 표기, 일반 쿠버네티스 동작 기준 보충).
- **NFS PV(LAB3)** : `local` 대신 `nfs` 항목에 NFS 서버 IP/디렉터리 지정. 한 파일에 `---` 로 PV, PVC, Pod 를 이어 붙여 한 번에 적용해도 동일하게 동작. 이 PV 는 기본값(Retain)이 아닌 `persistentVolumeReclaimPolicy: Recycle` 을 명시했고, `volumeMode: Filesystem`, `mountOptions: - hard` 사용. PVC(pvc-nfs)는 RWO, 1G 만 요청 — 남은 다른 PV 가 없어 두 조건만 맞으면 자동으로 pv-nfs 와 연결.
- **PV 용량 변경** : 정적 할당이므로 1G 를 주면 1G 를 넘을 수 없지만 `kubectl edit pv pv-nfs` 로 `spec.capacity.storage` 를 1G → 5G 로 수정 가능. PV CAPACITY 는 5G 로 바뀌지만 PVC 의 CAPACITY 열은 1G 그대로 표시. 사람이 직접(수동으로) 용량을 조정하기 때문에 "정적 할당"이라 부르는 것일 뿐이라고 강사가 정리.

## [사용한 CLI]

### 4-1. PV 3개 생성 (pv123.yaml)
```bash
mkdir pv-pvc && cd $_
vi pv123.yaml
kubectl get pv              # 기존 portainer-pv 등 확인
kubectl apply -f pv123.yaml
kubectl get pv              # pv1(RWO,1G) pv2(ROX,1G) pv3(RWX,2G) STATUS Available, RECLAIM Retain
```
```yaml
# pv1 예시 (pv2: ROX 1G, pv3: RWX 2G 로 동일 구조)
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv1
spec:
  capacity:
    storage: 1G
  accessModes:
  - ReadWriteOnce
  local:
    path: /DATA2
  nodeAffinity:
    required:
      nodeSelectorTerms:
      - matchExpressions:
        - {key: kubernetes.io/hostname, operator: In, values: [k8s-node1]}
```
- `local.path` : 로컬 볼륨(노드 디렉토리). local 볼륨은 `nodeAffinity` 필수.

### 4-2. PVC 4개 생성 및 Bound 확인
| PVC | accessModes | requests.storage | 결과 |
|---|---|---|---|
| pvc1 | ReadOnlyMany | 1G | pv2 Bound |
| pvc2 | ReadWriteOnce | 1G | pv1 Bound |
| pvc3 | ReadWriteOnce | 5G | 5G PV 없음 → Pending |
| pvc4 | ReadWriteMany | 1G | pv3(2G) Bound |

```bash
vi pvc1234.yaml
kubectl apply -f pvc1234.yaml
kubectl get pv,pvc
```

### 4-3. Pod 에서 PVC 사용 (mynode-pod.yaml)
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mynode-pod
spec:
  containers:
  - image: dbgurum/mynode:1.0
    name: mynode-container
    ports:
    - containerPort: 8000
    volumeMounts:
    - name: mynode-path
      mountPath: /mynode
  volumes:
  - name: mynode-path
    persistentVolumeClaim:
      claimName: pvc1
```
```bash
kubectl apply -f mynode-pod.yaml
kubectl get po | grep mynode          # ContainerCreating → Running
kubectl exec -it mynode-pod -- bash
cd /mynode/
echo 'welcome to fastcampus. mynode-pod' > k8s-pvc.txt
# 노드(k8s-node1)에서
ls /DATA2                              # k8s-pvc.txt 가 PV 경로에 저장됨
```

### 4-4. [LAB2] label/selector 로 특정 PV 지정
- PV `pv4`: `metadata.labels: name: pv4`, capacity 1Gi, RWO, `local.path: /data_dir`, nodeAffinity k8s-node1
- PVC `pvc5`: RWO, 1Gi, `storageClassName: ""`, `selector.matchLabels: name: pv4`
```bash
vi pv-pvc-label.yaml
kubectl apply -f pv-pvc-label.yaml
kubectl get pv,pvc          # pvc5 ↔ pv4 Bound
```
- `storageClassName: ""` : 동적 프로비저닝(StorageClass) 을 사용하지 않고 기존 PV 와 바인딩.

### 4-5. [LAB3] NFS PV (pv-nfs.yaml)
```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-nfs
spec:
  capacity:
    storage: 1G
  volumeMode: Filesystem
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Recycle
  mountOptions:
  - hard
  nfs:
    path: /DATA1
    server: 192.168.56.101
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-nfs
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1G
---
apiVersion: v1
kind: Pod
metadata:
  name: mynode-nfs-pod
spec:
  containers:
  - name: mynode
    image: dbgurum/mynode:1.0
    ports:
    - containerPort: 8000
    volumeMounts:
    - name: testpath
      mountPath: /mount1
  volumes:
  - name : testpath
    persistentVolumeClaim:
      claimName: pvc-nfs
```
```bash
vi pv-nfs.yaml
kubectl apply -f pv-nfs.yaml
kubectl get pv,pvc          # pvc-nfs ↔ pv-nfs (1G, RWO, Recycle) Bound
```

### 4-6. PV 용량 변경 (kubectl edit)
```bash
kubectl edit pv pv-nfs      # spec.capacity.storage: 1G → 5G
kubectl get pv,pvc | grep nfs
# pv-nfs CAPACITY 5G, pvc-nfs 는 요청값(1G) 그대로 표시
```

## [확인 방법/주의점]
- `kubectl get pv,pvc` : PV 는 생성 직후 Available(CLAIM 비어 있음), PVC 와 연결되면 Bound(PV 의 CLAIM 열에 `default/pvc2` 등 표시), 조건에 맞는 PV 가 없으면 PVC 는 Pending.
- 용량·accessModes 둘 다 맞아야 Bound. pvc4(1G, RWX) 는 RWX 조건을 만족하는 PV 가 pv3(2G)뿐이라 pv3 에 붙고, pvc3(RWO, 5G)는 5G PV 가 없어 Pending 으로 남는다(강사가 "붙을 PV 를 먼저 예측해 보라"고 질문 — 2번, 1번, Pending, 3번 결과).
- PV : PVC = 1:1. PV 는 기본 Reclaim Policy `Retain`(실습의 RECLAIM POLICY 열). 실습에서 `Recycle` 은 pv-nfs YAML 에 명시한 경우이며 공식 문서상 deprecated.
- `mkdir pv-pvc && cd $_` : 디렉터리를 만든 뒤 바로 이동하는 관용 표현, `$_` 는 직전 명령의 마지막 인자.
- 실습 전 `kubectl get pv` 에는 Portainer 설정 때 만든 `portainer-pv`(10Gi RWO Retain Bound portainer/portainer)가 이미 있다. 파일명은 영상 터미널에서 `pvc1234.yaml`, 슬라이드 예시에는 `pvc1to4.yaml` 로 표기됨.
- local 볼륨은 `nodeAffinity` 필수. mynode-pod 는 `ContainerCreating` → `Running` 까지 약 1분 소요(이미지 pull). `ls /mynode` 에 `lost+found` 가 함께 보이는 것은 정상(디스크 파일시스템 루트).
- PV 용량을 늘려도 PVC 표시는 요청값(1G) 그대로 — 정적 할당이라 PV 만 수동으로 변경한 것.

---

# Step 5. StorageClass 와 동적 프로비저닝 (OpenEBS local hostpath)

## [목적]
PV 를 미리 만들지 않고, PVC 생성 시 StorageClass 가 PV 를 자동 생성하도록 구성한다(동적 프로비저닝).

## [이론 설명]
> 원본: Clip 5 (약 13분, 슬라이드 64~71 + 실습). 학습 목표: 정적/동적 프로비저닝 차이, StorageClass 와 프로비저너 역할, PVC 가 StorageClass 를 참조할 때 PV 가 자동 생성되는 흐름, OpenEBS local hostpath 설치, PVC 가 Pending → Bound 로 바뀌는 시점, RECLAIM POLICY.

- **정적 프로비저닝(Static Provisioning) 복습** : 관리자가 수동으로 PV 를 생성하고, PV 의 용량·액세스 모드·저장소 유형 같은 하위 저장소 세부 정보를 지정한다. 이런 PV 는 사용자가 만든 PVC 의 요구 사항과 일치하는 사용 가능한 PV 에 Binding 된다. 관리자가 바인딩/유지/리클레임 같은 라이프사이클을 손으로 관리해야 하고 PV 의 용량·액세스 모드·볼륨 유형·경로까지 직접 잡아 줘야 한다.
- **동적 프로비저닝(Dynamic Provisioning)** : PVC 요청에 대한 **PV 생성을 자동화**한다.
  - 관리자는 PV 가 아니라 **PV 를 만들기 위한 템플릿인 StorageClass** 를 정의한다("PV 를 만드는 것이 아니라 StorageClass 를 만들어 두고 PVC 가 이를 참조하게 옵션만 넣어 준다"). 전제 조건: StorageClass 가 먼저 만들어져 있어야 한다.
  - 각 StorageClass 는 PV 생성을 책임지는 **프로비저너(Provisioner)** 를 지정한다. 사용자가 특정 StorageClass 를 참조하는 PVC 를 만들면 프로비저너가 PVC 요구 사항(용량·권한)과 일치하는 PV 를 자동 생성해 관리자의 수동 개입을 없앤다.
  - **프로비저너** : 일반적으로 CSP(Cloud Service Provider)가 제공하는 볼륨 플러그인을 사용하며, 사람 이름이 아니라 일종의 **드라이버**. StorageClass 로 어떤 방식으로 스토리지를 가져올지 정한다. 예: `provisioner: kubernetes.io/gce-pd`(GCE PD 용), `provisioner: openebs.io/local`. 종류는 CSI(Container Storage Interface) 드라이버, OpenEBS 등 매우 많다.

| 구분 | 정적 프로비저닝 | 동적 프로비저닝 |
|---|---|---|
| PV 생성 주체 | 관리자가 수동 생성 | 프로비저너가 PVC 요청에 맞춰 자동 생성 |
| 관리자가 만드는 것 | PV (용량·액세스 모드·유형 지정) | StorageClass (PV 생성 템플릿, 프로비저너 지정) |
| PVC 의 역할 | 조건이 맞는 기존 PV 에 Binding | StorageClass 를 참조해 PV 생성을 요청 |

- **StorageClass 전략 (슬라이드 66)** : 운영환경에서는 storageClass 의 성능을 최대로 높게, 개발환경에서는 느리지만 안전한 volume 에 저장하도록 구성. 운영정책에 따라 storageClass 를 정의해 그에 맞는 PV 를 자동 생성할 수 있다. 강사: StorageClass 는 사람의 개입을 최소화하고 필요한 용량을 그때그때 동적으로 프로비저닝한다는 점이 핵심이라 실무에서 자주 쓰이며 **운영 환경에서는 StorageClass 사용을 권장**, 개발 환경에서는 하나씩 확인하며 테스트해야 하므로 PV 를 직접 다뤄 보는 것이 더 적합할 수 있다. 순서: 어떤 프로비저너를 쓸지 정함 → StorageClass 정의 → PVC 생성.
- **OpenEBS local hostpath** : Pod 가 실행되는 **Node 의 디렉토리(hostpath)를 Pod 의 볼륨으로 할당**하는 방식. 프로비저너 이름은 `openebs.io/local`. 설치 가이드는 openebs.io(슬라이드 주석 `openebs.io/docs/2.12.x/user-guides/installation`)에 있고, 실습은 GitHub 페이지의 operator-lite 와 StorageClass lite 매니페스트를 그대로 적용한다. (영상 터미널에서는 operator 매니페스트가 `namespace/openebs` 를 함께 생성했다.)
- **kubectl get sc 출력 해석** : StorageClass 의 short name 은 `sc`. `RECLAIMPOLICY` — 앞의 수동 PV 실습은 Retain 이었지만 StorageClass 의 기본 정책은 **Delete**(변경 가능). `VOLUMEBINDINGMODE: WaitForFirstConsumer` — 강사는 "언제 PV 를 만들어 줄까"를 정하는 항목이라고 설명. StorageClass 내용은 `edit` 로 열어볼 수 있다.
- **WaitForFirstConsumer (강사 정정 포함)** : 강사가 앞 설명에 약간의 오류가 있었다고 정정 — PVC 가 StorageClass 를 참조하는 순간 PV 가 만들어지는 것이 **아니라**, 그 PVC 를 사용하는 **Pod(소비자, Consumer)가 생성될 때** 볼륨이 연결되고 PV 도 만들어진다. 슬라이드: "Openebs sc 는 첫 번째 사용자(소비자)가 볼륨을 Binding 할 때까지 대기! PVC 생성 후 Pod 가 생성되면 볼륨 연결, 자동으로 PV 도 생성되고 PVC STATUS 가 Pending → Bound 로 변경". 그래서 PVC 만 만든 시점에는 PV 가 없고 STATUS 는 Pending.
- **RECLAIM POLICY (슬라이드 70)** : Delete — PVC 를 삭제하면 영구볼륨(PV)도 함께 삭제, Retain — PVC 를 삭제해도 PV 는 삭제되지 않고 유지. 이 StorageClass 의 기본은 Delete.
- **데이터 위치** : OpenEBS local hostpath 의 기본 저장 경로는 `/var/openebs/local/<PV 이름>/` (PV 이름 `pvc-...` 가 디렉토리명). 강사는 "가이드를 읽지 않아 기본 경로는 find 로 찾았다"고 말함. kubelet 아래 `/var/lib/kubelet/pods/<uid>/volumes/kubernetes.io~local-volume/<PV 이름>/` 에서도 같은 파일이 보이는데 이는 Pod 에 마운트된 위치. StorageClass 를 만들었지만 결국 지금은 노드의 로컬 스토리지를 사용하는 것.
- **마무리 제안(강사)** : 동적 프로비저닝 StorageClass 는 OpenEBS 외에도 다양한 프로비저너가 있으니 여러 개를 접목해 보기. 이 실습 환경에는 NFS 를 구성했으므로 **NFS 프로비저너**를 찾아 간단히 구축해 NFS 스토리지 클래스를 써 보면 NFS 환경을 더 잘 활용할 수 있다.

## [사용한 CLI]

### 5-1. OpenEBS 설치 (operator + StorageClass)
```bash
kubectl create ns openebs
kubectl get ns

kubectl apply -f https://openebs.github.io/charts/openebs-operator-lite.yaml
kubectl apply -f https://openebs.github.io/charts/openebs-lite-sc.yaml

kubectl get sc
# NAME              PROVISIONER       RECLAIMPOLICY  VOLUMEBINDINGMODE     ALLOWVOLUMEEXPANSION
# openebs-device    openebs.io/local  Delete         WaitForFirstConsumer  false
# openebs-hostpath  openebs.io/local  Delete         WaitForFirstConsumer  false
```
- `sc` = storageclass 의 short name. operator 설치 시 openebs 네임스페이스, ServiceAccount/ClusterRole, CRD(blockdevices 등), DaemonSet(openebs-ndm), Deployment(openebs-localpv-provisioner) 가 생성됨.

### 5-2. PVC 생성 (StorageClass 지정)
```yaml
# openebs-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: openebs-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: "openebs-hostpath"
```
```bash
kubectl apply -f openebs-pvc.yaml
kubectl get sc,pvc | grep openebs        # openebs-pvc Pending (WaitForFirstConsumer)
```

### 5-3. Pod 생성 → PV 자동 생성, Bound
```bash
kubectl apply -f mynode-sc-pod.yaml      # persistentVolumeClaim.claimName: openebs-pvc 사용 (mountPath /mynode)
kubectl get po -o wide | grep mynode
kubectl get pv,pvc | grep openebs        # PV pvc-xxxx 자동 생성(1Gi RWO Delete), PVC Bound
```

### 5-4. 데이터 실제 위치 확인
```bash
kubectl exec -it mynode-sc-pod -- bash
cd /mynode/
echo 'welcome to fastcampus. openebs-sc-pod.' > k8s-sc.txt
exit
# Pod 가 실행 중인 노드에서
sudo find / -name k8s-sc.txt
# /var/lib/kubelet/pods/<uid>/volumes/kubernetes.io~local-volume/pvc-xxxx/k8s-sc.txt
# /var/openebs/local/pvc-xxxx/k8s-sc.txt
```

## [확인 방법/주의점]
- PVC 는 Pod 가 생성되기 전까지 Pending 이 정상(WaitForFirstConsumer). Pod 를 apply 한 직후에는 아직 PV 가 없고 Pod 가 Running 이 되는 시점에 PV 가 자동 생성되며 PVC 가 Bound 로 바뀐다.
- Reclaim Policy `Delete`: PVC 삭제 시 PV 와 데이터 삭제. `Retain` 은 PV 보존.
- operator 설치 시 openebs 네임스페이스, ServiceAccount/ClusterRole, CRD(blockdevices, blockdeviceclaims), DaemonSet(openebs-ndm), Deployment(openebs-localpv-provisioner), StorageClass 2종(`openebs-hostpath`, `openebs-device`)이 생성된다. (슬라이드는 `kubectl create ns openebs` 를 먼저 적었으나 영상 터미널에서는 operator 매니페스트가 namespace 를 함께 만들었다.)
- `mynode-sc-pod.yaml` 의 전체 내용은 영상 화면에 나오지 않았다(볼륨에 `persistentVolumeClaim.claimName: openebs-pvc` 지정, 마운트 경로 `/mynode` 로 사용). 슬라이드 예시는 Pod 가 k8s-node3, 실습 터미널은 k8s-node1 에 배치 — 데이터는 Pod 가 배치된 노드에서 찾아야 한다. PV 이름의 해시(`pvc-...`)는 실행마다 다르다.
- 이후 StatefulSet(Step 16) 에서 `openebs-hostpath` 를 사용하므로 설치해 둔다.

---

# Step 6. Amazon EKS 기반 Storage (EBS) 사용 데모

## [목적]
EKS 에서 AWS 콘솔로 만든 EBS 볼륨을 CSI 드라이버 PV/PVC 로 연결(정적)해 Bound 상태를 확인한다.

## [이론 설명]
> 원본: Clip 6 (약 12분, 슬라이드 74~78 + AWS 콘솔/EC2 터미널 데모). 7장의 마지막 클립.

- **EKS 에 연결할 수 있는 스토리지 2가지** : ① **EBS(Elastic Block Store)** = AWS 의 디스크형(블록) 스토리지, ② **EFS** = 강사 설명으로 "클라우드에 올라가 있는 NFS 기술"(여러 EC2/노드가 데이터를 공유할 때 사용). 둘 다 드라이버를 이용해 PV/PVC 형태로 쿠버네티스 스토리지로 등록할 수 있다. **이 영상은 EBS 만** 다룬다.
- **EBS 특징 (슬라이드 74)** : 가용 영역(AZ)에서 자동 볼륨 복제를 사용해 블록 수준 스토리지를 생성 / 하나 이상의 EBS 볼륨을 **단일 EC2 인스턴스**에 연결 가능 / 필요에 따라 EC2 인스턴스 간에 볼륨 이동 가능 / EC2 로 데이터베이스를 실행하는 데 사용 가능. 강사 비유: AZ 하나에 볼륨을 만들어 EC2 에 붙였다 뗐다(attach/detach) 하는 **외장 하드**. 여러 EC2 가 데이터를 공유하려면 EFS.
- **DB 는 OS 와 다른 디스크를 권장** : EC2 Linux 서버에 직접 MySQL 같은 DB 를 설치해 쓸 때 운영체제가 든 디스크를 쓰지 말고 별도 디스크를 쓰라(OS 와 DB 부하가 한 디스크에서 같이 일어나면 성능 저하; 슬라이드 손글씨 DISK vs OS). 이때 EBS 를 추가 디스크로 붙인다.
- **EBS 구조 (슬라이드 75)** : **Primary 볼륨** = EC2 생성 시 기본으로 붙는 OS 디스크. EC2 도 VM 과 같아 인스턴스가 제거되면 안의 OS 디스크도 함께 제거되므로 **임시 디스크**로 봐야 한다. **Secondary 볼륨** = 데이터를 따로 보관하려고 EBS 를 별도로 만들어 attach.
- **볼륨 유형** (SSD 는 트랜잭션을 바로바로 처리하는 용도, HDD 는 대용량 데이터 처리·백업 같은 용도 — 강사 기준). 슬라이드: EBS SSD(gp2, gp3) / EBS HDD(st1, sc1).

| 콘솔 볼륨 유형 | 확인된 내용 |
|---|---|
| 범용 SSD(gp3) / (gp2) | 범용 SSD 3세대·2세대. 기본 선택은 gp3. gp3 : IOPS 3000(최소 3000, 최대 16000), 처리량 125MiB/s(최소 125, 최대 1000) |
| 프로비저닝된 IOPS SSD(io1) / (io2) | IOPS 를 지정해 쓰는 유형. io2 : IOPS 최소 100, 최대 100000(GiB 당 최대 1000 IOPS) |
| 콜드 HDD(sc1) / 처리량에 최적화된 HDD(st1) | HDD 계열 |
| 마그네틱(표준) | 목록의 마지막 항목 |

  - 성능 지표: IOPS(초당 입출력 횟수), 처리량(MB/s 개념). io2 는 최대 초당 10만 IOPS 까지 가능하고, 실제 업체들은 애플리케이션의 IO 속도에 맞춰 IOPS 를 결정한다(강사 경험담: 평균 8만 IOPS 안팎 사용 업체도 있음 — 음성 인식이 불완전해 업종 표현은 불확실).
- **가용 영역(AZ)** : 콘솔 안내 문구 "동일한 가용 영역의 모든 EC2 인스턴스에 연결할 Amazon EBS 볼륨을 생성합니다". EKS 워커 노드는 EC2 3대이고 서로 다른 AZ 에 있다. 서울 리전(ap-northeast-2)에는 a, b, c, d 4개 AZ 가 있고 이 클러스터의 노드 3대는 **a, c, d** 에 분산. 볼륨은 그중 하나의 AZ 를 골라 만들면 되고 강사는 기본값 ap-northeast-2a 사용. (입문자 보충 — 영상에서 직접 언급한 것은 아님: EBS 는 한 AZ 안에 만들어지므로 Pod 도 같은 AZ 의 노드에서 실행되어야 한다.)
- **볼륨 생성 절차 (AWS 콘솔)** : EC2 > Elastic Block Store > 볼륨 > 볼륨 생성 → 유형/크기/IOPS/가용 영역 설정, 스냅샷 없음("스냅샷에서 볼륨을 생성하지 않음"), 암호화 미체크, 태그로 이름(Name) 지정 → 생성. 상태가 "생성 중" → "사용 가능". 영상 실습은 기본값(100GiB gp3, IOPS 3000, 처리량 125, 볼륨명 `EKS-storage`, 볼륨 ID 형식 vol-...)으로 만들었고, 교재(슬라이드 76)는 10GiB(`EKS-vol`, gp3). **연습이니 용량을 작게 설정하라**는 강사 조언.
- **PV 의 csi 설정이 핵심** : CSI = Container Storage Interface. `driver: ebs.csi.aws.com`(AWS EBS 용 CSI 드라이버), `volumeHandle`(AWS 콘솔에서 만든 EBS 볼륨의 ID `vol-...`, 볼륨마다 다름), `fsType: ext4`(파일시스템, 기본값이라고 강사 설명), `persistentVolumeReclaimPolicy: Retain`(PVC 를 삭제해도 PV·실제 볼륨 보존), `storageClassName: ""`(이번에는 StorageClass 없이 수동으로 만든 볼륨 연결). PVC 는 용량(10Gi)과 접근 모드(RWO)를 PV 와 맞춰 매칭.
- 이 영상에서는 Pod 까지는 만들지 않고 Bound 확인까지만 진행(강사: 다음은 Pod 를 만들어 이 PVC 를 연결하면 된다).
- **비용 주의(강사 강조)** : 클라우드는 대부분 사용한 만큼 과금 → 쓰지 않는 오브젝트를 유지하면 큰 비용. **PV/PVC 를 지워도 EBS 볼륨은 삭제되지 않는다.** 콘솔에서 볼륨 선택 > 작업 > 볼륨 삭제를 실행해야 완전히 제거(슬라이드 78 "AWS EBS 볼륨은 수동 제거"). 앞 클립에서 만든 classic 로드 밸런서도 삭제하지 않고 남아 있어 같은 이유로 정리해야 한다("이것도 다 돈").

## [사용한 CLI]
```yaml
# eks-storage.yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: eks-pv
spec:
  capacity:
    storage: 10Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""
  csi:
    driver: ebs.csi.aws.com
    volumeHandle: vol-0ca0e5ad7290094c6     # 실제 생성한 EBS 볼륨 ID 로 교체
    volumeAttributes:
      fsType: ext4
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: eks-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: ""
```
```bash
vi eks-storage.yaml                    # volumeHandle 를 실제 볼륨 ID 로 수정
kubectl apply -f eks-storage.yaml
kubectl get pv,pvc                     # eks-pv 10Gi RWO Retain Bound default/eks-pvc
kubectl delete -f eks-storage.yaml     # PV/PVC 삭제 (EBS 볼륨 자체는 남음)
```
- 데모 후 AWS 콘솔(EC2 > 볼륨) 에서 볼륨을 직접 삭제해야 정리됨(Retain, 과금 방지).

## [확인 방법/주의점]
- PV 와 PVC 가 모두 `Bound`, 용량(10Gi)과 모드(RWO)가 일치해야 한다. (Pod 에 붙이지 않아도 Bound 는 확인 가능)
- **`volumeHandle` 은 슬라이드 값(vol-0ca0e5ad...)을 그대로 쓰면 안 된다.** 볼륨마다 ID 가 다르므로 내가 만든 볼륨 ID 를 콘솔에서 복사해 넣어야 한다(실습에서도 강사가 자신의 볼륨 ID 로 수정).
- 볼륨 AZ 와 노드 AZ 불일치 주의(보충). `driver: ebs.csi.aws.com`, `volumeHandle`, `fsType: ext4`, `storageClassName: ""` 가 핵심.
- 실습 터미널은 EC2 Instance Connect(ec2-user) 에서 `kubectl` 실행(홈에 eks-storage.yaml, index.html, nginx-deploy.yml, pv-ebs.yaml 등이 준비됨).
- 정리 순서: `kubectl delete -f eks-storage.yaml` → AWS 콘솔 EC2 > 볼륨 > 작업 > 볼륨 삭제 → (남은 로드 밸런서도 삭제). 비용 방지.

---

# Step 7. ConfigMap / Secret 개념과 Docker `-e` 비교

## [목적]
이미지를 바꾸지 않고 환경(설정/비밀번호/API Key)을 Pod 에 주입하는 방법을 이해하고, Docker `-e` 방식이 Kubernetes ConfigMap/Secret 으로 어떻게 대응되는지 확인한다.

## [이론 설명]
> 원본: 챕터 08 Clip 1 (약 28분). 챕터 08 구성: 01 configMap & Secret 이해 / 02 [실습] configMap 활용 / 03 [실습] Pod 설계 패턴4 - Ambassador / 04 [실습] Secret 활용 / 05 [실습] Secret 고급 활용(TLS/HTTPS 용 OpenSSL 개인키·인증서를 Secret 에 보관 등) / 06 [실습] etcd 암호화로 Secret 암호화하기. 학습 목표: ConfigMap/Secret 의 의미와 분리 이유, Docker `-e` 와의 대응 비교, `--from-literal` 생성 + `envFrom/configMapRef` 연결, ConfigMap 수정이 실행 중 Pod 에 자동 반영되지 않아 Pod 재생성(`replace --force`)이 필요함을 이해.

- **ConfigMap 과 Secret** : Kubernetes 는 Pod 생성에 쓰는 YAML 과 "설정 값"을 분리할 수 있도록 ConfigMap, Secret 을 제공한다.
  - **ConfigMap** = Pod 에 들어가는 일반적인 환경 변수·인수, 또는 Nginx 설정 파일 같은 **설정 값**(평문 key-value). 줄임말(short name) `cm`.
  - **Secret** = 루트 패스워드, DB 사용자 패스워드 같은 **노출되면 안 되는 민감한(기밀) 값**. 사용법은 ConfigMap 과 거의 같고 **평문 저장이냐 인코딩 저장이냐**의 차이.
  - 둘은 독립된 object 이다(`kubectl api-resources` 에 등록된 모든 항목을 Kubernetes object 라고 부름). 만들려면 YAML(descriptor)을 작성해 apply 하고, 만든 뒤 Pod 에 설정 값으로 넣는다. Pod 전용이 아니라 다른 곳에서도 사용 가능. ConfigMap/Secret 은 중앙 관리 방식으로 애플리케이션 코드에서 구성·민감 정보를 분리하도록 설계된 Kubernetes API object.
  - **Secret 은 이름과 달리 암호화가 아니라 base64 인코딩 데이터를 저장**한다. base64 는 매우 쉽게 디코딩되고, Secret 데이터는 Kubernetes DB 인 **etcd 에 저장되어 권한이 있는 사람은 볼 수 있다**(→ 6번 클립/Step 12 에서 etcd 암호화).
- **왜 분리하는가 (환경별 값 분리)** : 개발/테스트/운영 환경마다 다른 환경 값이 필요하다(슬라이드 예: 개발 환경은 SSH 보안 접근 해제, 테스트 환경은 지정된 USER 및 KEY 를 이용한 SSH 접근, 운영 환경은 테스트와 다른 USER/KEY 로 SSH 접근 — 강사: SSH 는 예시일 뿐 환경별로 다른 설정은 많다). 환경마다 이미지를 따로 만들면 가능은 하지만 이미지를 여러 개 따로따로 관리해야 하는 부담이 있다. 그래서 **애플리케이션 이미지는 동일하게** 쓰고, 환경 구성 값은 ConfigMap, 기밀 데이터는 Secret 으로 만들어 Pod 에 적용한다.
- **애플리케이션 레벨이 아닌 Object 레벨의 설정 관리** : 애플리케이션 레벨에서 환경 구성을 바꾸면 소스코드와 의존성이 높고 설정 값을 바꿀 때마다 코드 수정이 불가피해 개발 속도가 지연될 수 있다. 민첩성/탄력성을 강조하는 Cloud Native 환경에서는 코드와 분리된 ConfigMap/Secret object 로 설정 값을 신속하게 적용한다. 결론: ConfigMap·Secret 은 "코드가 아니라 object 레벨의 환경 설정 값".
- **Docker `-e` 와 비교** : Docker 와 Kubernetes 는 성격이 다르지만 `-e` 는 object 레벨은 아니어도 환경 변수 값을 코드 밖에서 주입한다는 점에서 ConfigMap 과 대응된다. 앱(runapp2.js)이 `API_KEY` 환경 변수가 없으면 오류 메시지, 있으면 환영 메시지를 응답. 강사 권장: **이미지를 빌드한 뒤에는 반드시 docker run 으로 테스트**(빌드가 성공해도 설정값 오류·오타·잘못된 경로 등으로 동작하지 않는 이미지가 종종 있음). 테스트 후 `docker push` 로 레지스트리(Docker Hub)에 올려 Kubernetes 에서 그대로 사용 — 수강생도 본인 계정 저장소로 빌드·푸시해 볼 것.
- **`kubectl explain configmap` 필드** (강사는 새 API object 를 만나면 습관적으로 explain 부터 본다고 함)

| 필드 | 설명 |
|---|---|
| apiVersion | object 표현의 버전 스키마 |
| binaryData | 바이너리 데이터. 키는 영숫자, `-`, `_`, `.` 로 구성, data 필드의 키와 겹치면 안 됨 |
| data | 설정 데이터(key-value). UTF-8 이 아닌 값은 BinaryData 필드를 써야 함 |
| immutable | true 이면 ConfigMap 데이터를 갱신할 수 없음(메타데이터만 수정 가능). 기본값 nil |
| kind / metadata | object 종류 / 표준 메타데이터 |

- **YAML 작성 요령(강사 조언)** : 처음부터 손으로 YAML 을 쓰기보다 `kubectl run` / `kubectl create` 같은 명령형 명령으로 시작해 `--dry-run=client -o yaml` 로 YAML 을 출력, 파일로 저장한 뒤 필요한 부분만 수정. `kubectl create` 하위 명령에 `configmap`, `secret` 이 포함되어 있다.
- **ConfigMap 생성** : 값을 주는 방법 `--from-literal`, `--from-file`, `--from-env-file`(자세한 형식은 다음 클립). `--from-literal` 뒤 `=` 대신 공백도 가능. `describe cm` 의 Data 에 값이 그대로 보이는 것은 인코딩/암호화되지 않은 **평문(plain text) 저장**이기 때문.
- **envFrom / configMapRef** : ConfigMap 을 만든 것만으로는 아무 일도 일어나지 않고, Pod YAML 에 "이 ConfigMap 에서 환경 변수를 가져와라"를 추가해야 한다. `envFrom` = 환경 변수를 어디로부터 가져올 것인가, `configMapRef` = ConfigMap 참조, 그 아래 `name` 에 ConfigMap 이름. ConfigMap 의 key-value 가 컨테이너 환경 변수로 자동 주입된다(환경 변수를 넣는 방법은 3가지 — 나머지는 다음 클립). 코드는 그대로이고 object 만으로 값이 주입된다는 것이 핵심. (vi 편집 시 `dry-run` 으로 생성된 `dnsPolicy`, `restartPolicy`, `status: {}` 등 필요 없는 부분은 정리하고 작성.)
- **수정 반영** : `kubectl edit configmaps` 로 ConfigMap 을 바꾸는 것은 가능하지만 `envFrom` 방식은 **실행 중인 Pod 에 반영되지 않는다.** 반영하려면 Pod 를 다시 만들어야 하며 `kubectl replace --force -f <pod.yaml>` 은 Pod 를 강제 삭제 후 재생성(슬라이드 주석 "강제 재시작")한다. 강사: 이렇게 강제 재시작이 필요한 것은 **이 방식의 한계**이며 뒤 클립에서 더 유연한 방법을 설명. (보충: 환경 변수는 컨테이너 시작 시 한 번 값이 정해져 프로세스에 전달되므로.)
- **전달 과정 (슬라이드)** : ConfigMap(key API_KEY, value <PASSWORD>) → Pod(`envFrom: - configMapRef: name: api-key`, kubelet 에 의해 적용) → Node.js 앱(`process.env.API_KEY`) → Result(noKey → "API_KEY is not ~", yesKey → "Welcome to ~"). ConfigMap/Secret 을 Pod 와 분리해 만들면 다른 Pod/다른 환경에서도 같은 object 를 가져다 쓸 수 있고, 환경마다 다른 값은 코드 수정 없이 개별 object 로 전달하는 것이 좋다.

## [사용한 CLI]

### 7-1. API object 확인
```bash
kubectl api-resources | grep -i cm
# configmaps   cm   v1   true   ConfigMap
kubectl api-resources | grep -i secret
# secrets           v1   true   Secret
```

### 7-2. Docker 환경변수(-e) 비교 실습
```dockerfile
# Dockerfile2
FROM node:21-slim
EXPOSE 8000
COPY runapp2.js .
CMD node runapp2.js
```
```javascript
// runapp2.js
var http = require('http');
const apiKey = process.env.API_KEY;

if (!apiKey) {
   console.log('API_KEY is not set in the environment variables.');
   http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/plain');
      res.end("API_KEY is not set in the environment variables." + "\n");
   }).listen(8000);
} else {
   console.log('API_KEY:', apiKey);
   http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/plain');
      res.end("Welcome to fastcampus Kubernetes~! by kevin." + "\n");
   }).listen(8000);
}
```
```bash
# (k8s-node1 의 ~/mynode 에서)
ls                                     # Dockerfile Dockerfile2 runapp2.js runapp.js
cat Dockerfile2
cat runapp2.js
docker build -t dbgurum/mynode:fc.2.0 --no-cache -f Dockerfile2 .
docker run -d --name=myweb1 -p 8000:8000 dbgurum/mynode:fc.2.0
docker ps -a                           # myweb1 Up, 0.0.0.0:8000->8000/tcp
curl localhost:8000                    # API_KEY is not set in the environment variables.
docker run -d --name=myweb2 -e API_KEY=hello -p 8000:8000 dbgurum/mynode:fc.2.0
docker ps -a                           # myweb2 Up
curl localhost:8000                    # Welcome to fastcampus Kubernetes~! by kevin.
docker push dbgurum/mynode:fc.2.0
```
- `-f` : 사용할 Dockerfile 지정, `--no-cache` : 캐시 미사용, `-e KEY=VALUE` : 컨테이너 환경변수.

### 7-3. Kubernetes 에서 키 없이 실행 (대조군)
```bash
mkdir cm && cd $_
kubectl run myweb1 --image=dbgurum/mynode:fc.2.0 --port=8000
kubectl get po,svc -o wide | grep myweb1
curl <Pod IP>:8000                     # API_KEY is not set in the environment variables.
```
- 주의: `-o wide` 의 하이픈이 일반 하이픈이 아니면(복붙 문자 문제) `Error from server (NotFound): pods "wide" not found` 처럼 인자가 잘못 해석됨.

## [확인 방법/주의점]
- 같은 이미지가 환경변수 유무에 따라 다른 응답을 한다 → 설정은 이미지 밖에서 주입. Pod 안 환경변수는 `kubectl exec -it <pod> -- env | grep -i api_key` 로 확인.
- **오류와 해결** : 슬라이드에서 복사·붙여넣기 한 `kubectl get po,svc –o wide` 의 `-o` 가 일반 하이픈이 아닌 긴 대시(–)로 바뀌면 `Error from server (NotFound): pods "–o" not found` / `pods "wide" not found` / `services "–o" not found` 처럼 인자가 리소스 이름으로 해석된다(강사도 "복사했더니 마이너스에서 문제가 생겼다"고 언급). 하이픈(-)으로 다시 입력하면 정상.
- Docker 에서도 `-e API_KEY=hello` 유무로 응답이 달라짐(myweb1 = not set, myweb2 = Welcome). ConfigMap 의 값은 평문이므로 비밀번호 같은 값은 Secret 사용.
- ConfigMap 수정 후 envFrom 방식은 Pod 에 자동 반영되지 않음 → `kubectl replace --force -f` 로 Pod 재생성. (Secret 은 이 클립에서 실습하지 않고 개념만 소개, 사용법은 ConfigMap 과 같고 인코딩 저장 여부만 다름.)

---

# Step 8. ConfigMap 활용

## [목적]
ConfigMap 을 3가지 방식으로 만들고(`--from-literal`, `--from-file`, `--from-env-file`), Pod 에 3가지 방식(envFrom, volume mount, configMapKeyRef)으로 주입한다.

## [이론 설명]
> 원본: 챕터 08 Clip 2 (약 37분, 슬라이드 + 터미널). 학습 목표: ConfigMap/Secret 역할 구분, 생성 3방식, 적용 3방식(envFrom / volume mount / valueFrom.configMapKeyRef) 구분, mountPath/subPath·immutable·자동 반영 여부 차이.

- **ConfigMap 개요 (슬라이드)**
  - key-value 쌍으로 **기밀이 아닌 일반적인 데이터**를 저장(기밀·민감 데이터는 Secret).
  - 주로 Pod 안 컨테이너가 사용할 구성(환경 변수, 커맨드라인 인수, 구성 파일 등)을 저장. 구성 파일을 통째로 넣는 방식이 특히 유용(예: nginx.conf 를 ConfigMap 에 넣어 Pod 와 연결).
  - 저장 가능한 데이터는 **1MiB 이하** — 강사: 일반적인 key-value 설정은 수 KB 도 안 되므로 실제로 문제 되지 않는다.
  - 개발/운영처럼 서로 다른 설정을 적용하기 위해 사용. ConfigMap 과 Secret 은 **한 Pod 에 동시에 적용**할 수도 있다. (참고 링크: kubernetes.io/ko/docs/concepts/configuration/configmap/)
  - 입문자 보충: "이미지를 다시 빌드하지 않고 설정만 바꿔 끼우기 위한 오브젝트".
- **생성 방법** : 선언형(YAML 작성, 리소스 종류 확인은 `kubectl api-resources | grep configmap`)과 명령형 `kubectl create configmap(or cm) <name> {설정1 | 설정2 | 설정3}`.
  - 설정1 `--from-literal key=value [--from-literal key2=value2] ...` : key=value 직접 지정. 환경 변수가 3개면 옵션을 3번.
  - 설정2 `--from-file file_name` : 그 파일 속에 다수의 설정 값 저장. 파일 하나가 key 하나(key=파일명, value=파일 내용). 디렉토리를 지정하면 파일마다 key. 개발/테스트/운영 환경별 설정 파일이나 nginx 설정 같은 구성 파일을 통째로 넣을 때.
  - 설정3 `--from-env-file file_name` : `key=value` 형태의 환경 변수가 저장된 파일. 각 줄이 개별 key-value 로 저장.
  - 설정1·2·3 을 반드시 모두 쓸 필요는 없고, 하나만 여러 번 써도 되고 섞어 써도 된다. `--from-file` 과 `--from-env-file` 은 비슷해 보이지만 **Pod 에 적용되는 패턴이 다르다**(LAB3).
- **immutable 부가 기능** : `immutable: true` = 변경할 수 없는 ConfigMap. 이유 2가지: ① 실행 중인 애플리케이션이 의도치 않게 중단되는 것을 유발하는 변경을 차단, ② 불변 설정이면 API server 가 해당 ConfigMap 의 변경을 감시(watch)하지 않아도 되므로 클러스터 성능 향상(강사: "아주 작지만" 도움). **한 번 true 로 넣으면 edit 으로 다시 false 로 바꿀 수 없다**(되돌리기 어려움) → 부가 기능이니 필요할 때만 설정. 필드: `data`(UTF-8 문자열), `binaryData`(바이너리), `immutable`(기본 nil, true 면 메타데이터만 수정 가능). `kubectl explain configmap` 으로 확인.
- **YAML data 값 표현** : data 의 값은 **모두 문자열**이므로 숫자는 `"42"`, **불린 값은 반드시 따옴표(`"true"`)로 감싼다**. 여러 줄/여러 값을 한 key 에 담으려면 파이프(`|`)와 들여쓰기 — 리스트, JSON, YAML 텍스트도 통째로 하나의 값이 된다(`|-` 는 끝 개행 제거).
- **Pod 에 적용하는 3가지 방식**

| 방식 | 설정 위치 | 설명 |
|---|---|---|
| 1) Pod 속 환경 변수로 등록 | `envFrom.configMapRef.name` | ConfigMap 의 **모든** key-value 가 환경 변수로 들어가는 가장 일반적인 방법 |
| 2) Pod Volume 으로 mount | `volumes.configMap.name` | ConfigMap 의 key 가 파일명, value 가 파일 내용으로 지정 경로에 나타남. 2-a) `mountPath` : 해당 디렉터리 **전체**를 업데이트하는 방식, 2-b) `subPath` : 디렉터리 전체가 아닌 **지정된 파일만** 업데이트하는 방식 |
| 3) 환경변수 값으로 KEY 지정 | `env.valueFrom.configMapKeyRef` (슬라이드 표기 `valueFrom.configMapRef.name/.key`) | 여러 key 중 **특정 key 의 값만** 골라 하나의 환경 변수 값으로 사용 |

  - `kubectl run` 에는 ConfigMap/Secret 을 연결하는 옵션이 없으므로 run + `--dry-run=client -o yaml` 로 Pod YAML 뼈대를 얻은 뒤 `envFrom` 등을 직접 추가한다.
- **변경 사항 자동 반영 (슬라이드: "mount 된 configMap, Secret 은 업데이트 시 Pod 에 자동 반영됨")**
  - 환경 변수(`envFrom`)로 등록한 ConfigMap 은 edit 으로 수정해도 실행 중인 Pod 에 **반영되지 않는다**(그래서 Pod 를 강제 재생성).
  - `mountPath` 로 mount 한 ConfigMap/Secret 은 수정하면 Pod 에 **자동 반영**된다(몇 초 이내).
  - 단 **`subPath` 로 mount 한 것은 자동 반영에서 제외**된다.
  - 볼륨 mount 시 `ls -al` 구조: 날짜가 붙은 디렉터리(`..2024_01_07_11_11_56.xxxx`)가 실제 데이터 위치, `..data` 는 그 디렉터리를 가리키는 링크, key 이름 파일(orchestrator, runtime)은 `..data/<key>` 를 가리키는 소프트(심볼릭) 링크. ConfigMap 이 수정되면 새 날짜 디렉터리가 만들어지고 `..data` 링크만 새 디렉터리로 바뀐다 → 이 구조 덕분에 mountPath mount 가 자동 반영된다. subPath mount 는 링크 구조 없이 파일만 올라가므로 자동 반영이 안 된다.
  - 파일은 자동 갱신되지만 nginx 같은 데몬은 이미 떠 있어 설정 파일을 수시로 다시 읽지 않으므로 `nginx -s reload` 로 다시 읽으라고 알려줘야 반영된다. Pod 를 삭제·재생성하지 않으므로 Pod IP 도 안 바뀐다(자동 반영을 위한 프로그래밍적 방법도 있지만 기본 패턴은 이것).
  - 애플리케이션이 파일에서 설정을 읽는 구조(예: nginx.conf)라면 환경 변수 대신 볼륨 mount 가 어울린다. `mountPath` 에 이미 파일이 있는 디렉터리를 지정하면 그 디렉터리 **전체가 새로 덮이고**, 특정 파일만 바꾸고 싶다면 `mountPath` 에 파일 경로를, `subPath` 에 파일명을 넣는다.
- **LAB 요점**
  - LAB1: `--from-literal` 로 k8s-env(orchestrator, runtime). `describe` 의 Data = UTF-8 문자열, BinaryData = 바이너리(슬라이드 주석). `get cm` 은 etcd 에 등록 여부, `describe` 는 저장된 데이터 확인. `-o yaml`/`-o json` 은 같은 key-value 를 형식만 달리 출력(JSON/YAML 호환). 모든 오브젝트를 문서화해야 할 때는 YAML 로 저장해 두는 것을 권장. `--dry-run=client -o yaml` 로 뼈대를 뽑고 `>` 로 파일 저장 — 단, 초반 연습 단계에서는 YAML(디스크립터)을 직접 작성하는 연습도 많이 하라는 강사 권고(들여쓰기 실수가 잦음).
  - LAB2: 환경값이 너무 많아 `--from-literal` 로 넣기 어려운 경우를 가정 → `--from-file=redis.conf`(DATA 가 1 인 이유 = 파일 하나가 key 하나). `--from-file` 은 환경 변수로 등록되는 것이 아니라 **파일로 올라갈 뿐**이며 파일 내용을 읽어 적용하는 것은 컨테이너 안 애플리케이션의 몫.
  - LAB3: 공식 문서 예제 game.properties/ui.properties 를 디렉터리째 `--from-file=./game-config/`(디렉터리 경로 구분 주의: game-config 안에서 받고 한 단계 위에서 생성) → Data 에 두 파일이 key 로. `--from-env-file` 은 파일 각 줄이 개별 key-value 로 풀리고 `envFrom` 으로 곧바로 환경 변수 등록 가능(원본 `allowed="true"` 는 따옴표까지 값의 일부 → YAML 에 `'"true"'`). 파일 형태로 관리하되 Pod 에는 환경 변수로 넣고 싶다면 `--from-env-file` + `envFrom` 조합. 세 가지 주입 방법 중 무엇을 쓸지는 상황에 맞게 고민하고 직접 따라 해 볼 것(강사 당부).
  - LAB4: nginx index.html 을 ConfigMap 으로 — 매번 `kubectl cp` 로 넣는 대신 처음부터 ConfigMap 에 담아 `/usr/share/nginx/html/` 에 mount.
  - LAB5: `configMapKeyRef` — `env.name`(RUNTIME_METHOD)이 Pod 안에서 쓸 환경 변수 이름, `valueFrom.configMapKeyRef` 가 가져올 ConfigMap 이름(name)과 key. busybox 가 `env` 만 실행하고 끝나므로 STATUS `Completed (0/1)`, `kubectl logs` 로 확인. `envFrom` 은 ConfigMap 전체, `configMapKeyRef` 는 필요한 key 하나만.

## [사용한 CLI]

### 8-1. 기본 생성/조회 (--from-literal)
```bash
kubectl api-resources | grep configmap      # 리소스 종류/short name(cm) 확인 (선언형 작성 전)
kubectl explain configmap
kubectl create --help                       # Available Commands 에 configmap, secret 등 생성 가능 object 목록
kubectl create configmap api-key --from-literal=API_KEY=<PASSWORD>
kubectl get cm
kubectl describe cm api-key
```

### 8-2. Pod 에서 envFrom 으로 사용 (cmtest-pod)
```bash
kubectl run cmtest-pod --image=dbgurum/mynode:fc.2.0 --port=8000 --dry-run=client -o yaml > cmtest-pod.yaml
vi cmtest-pod.yaml
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    run: cmtest-pod
  name: cmtest-pod
spec:
  containers:
  - image: dbgurum/mynode:fc.2.0
    name: cmtest-pod
    ports:
    - containerPort: 8000
    envFrom:
    - configMapRef:
        name: api-key
```
```bash
kubectl apply -f cmtest-pod.yaml
kubectl get po,svc -o wide | grep cmtest
curl <Pod IP>:8000                                   # Welcome to fastcampus Kubernetes~! by kevin.
kubectl exec -it cmtest-pod -- env | grep -i api_key # API_KEY=<PASSWORD>
```

### 8-3. ConfigMap 변경과 Pod 반영 (환경변수 방식)
```bash
kubectl edit configmaps api-key              # API_KEY 를 k8s123# 로 수정
kubectl describe cm api-key                  # Data 는 k8s123#
kubectl exec -it cmtest-pod -- env | grep -i api_key   # 여전히 <PASSWORD> (Pod 미반영)
kubectl replace --force -f ./cmtest-pod.yaml # Pod 재생성 → API_KEY=k8s123# 반영
```

### 8-4. LAB1: --from-literal 두 개 (k8s-env) + 조회 포맷
```bash
kubectl create configmap k8s-env \
--from-literal orchestrator=kubernetes \
--from-literal runtime=containerd
kubectl get cm k8s-env
kubectl describe cm k8s-env
kubectl get cm k8s-env -o yaml
kubectl get cm k8s-env -o json

# YAML 파일로 저장 (실제 생성 없이)
kubectl create configmap k8s-env2 \
--from-literal orchestrator=kubernetes \
--from-literal runtime=containerd \
--dry-run=client -o yaml > k8s-env2.yaml
```

### 8-5. LAB1: envFrom 주입 (cm-envfrom-pod) 및 immutable
```bash
kubectl run cm-envfrom-pod --image=nginx:1.25.3-alpine --port=80 \
--dry-run=client -o yaml > cm-envfrom-pod.yaml
vi cm-envfrom-pod.yaml
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    run: cm-envfrom-pod
  name: cm-envfrom-pod
spec:
  containers:
  - image: nginx:1.25.3-alpine
    name: cm-envfrom-pod
    ports:
    - containerPort: 80
    envFrom:
    - configMapRef:
        name: k8s-env
```
```bash
kubectl apply -f cm-envfrom-pod.yaml
kubectl get po -o wide | grep cm-
kubectl exec cm-envfrom-pod -- env | grep orchestrator   # orchestrator=kubernetes
kubectl exec cm-envfrom-pod -- env | grep runtime        # runtime=containerd

# [참고] immutable 설정
kubectl edit cm k8s-env      # 최상위에 immutable: true 추가 → 이후 data 수정 불가
```

### 8-6. LAB1: volume mount 주입 (cm-volume-pod)
```bash
cp cm-envfrom-pod.yaml cm-volume-pod.yaml
vi cm-volume-pod.yaml
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    run: cm-volume-pod
  name: cm-volume-pod
spec:
  containers:
  - image: nginx:1.25.3-alpine
    name: cm-volume-pod
    ports:
    - containerPort: 80
    volumeMounts:
    - name: cm-volume
      mountPath: /etc/config
  volumes:
  - name: cm-volume
    configMap:
      name: k8s-env
```
```bash
kubectl apply -f cm-volume-pod.yaml
kubectl get po | grep cm-volume
kubectl exec cm-volume-pod -- ls -al /etc/config
kubectl exec cm-volume-pod -- cat /etc/config/orchestrator    # kubernetes
kubectl exec cm-volume-pod -- cat /etc/config/runtime         # containerd

# ConfigMap 수정 후 파일 갱신 확인
kubectl edit cm k8s-env                         # orchestrator: kubernetes → k8s
kubectl exec cm-volume-pod -- nginx -s reload   # 애플리케이션이 설정을 다시 읽도록 (Pod 재시작 불필요)
kubectl exec cm-volume-pod -- cat /etc/config/orchestrator    # k8s
```
- 주의: Pod 이름(metadata.name)과 label 을 바꾸지 않고 복사한 YAML 을 apply 하면 기존 Pod 와 충돌하므로 새 이름으로 수정.

### 8-7. LAB2: --from-file (redis.conf)
```bash
vi redis.conf
kubectl create cm redis-config --from-file=redis.conf
kubectl get cm

cp cm-volume-pod.yaml cmfile-volume-pod.yaml
vi cmfile-volume-pod.yaml
```
```yaml
    volumeMounts:
    - name: redis-volume
      mountPath: /opt/redis/config
  volumes:
  - name: redis-volume
    configMap:
      name: redis-config
```
```bash
kubectl exec cmfile-volume-pod -- ls -al /opt/redis/config
kubectl exec cmfile-volume-pod -- cat /opt/redis/config/redis.conf
```

### 8-8. LAB3: 디렉토리 전체 --from-file / --from-env-file
```bash
mkdir game-config && cd $_
wget https://kubernetes.io/examples/configmap/game.properties -O ./game.properties
wget https://kubernetes.io/examples/configmap/ui.properties -O ./ui.properties
kubectl create configmap game-config --from-file=./game-config/
kubectl get cm game-config
kubectl describe cm game-config            # game.properties / ui.properties 두 key

wget https://kubernetes.io/examples/configmap/game-env-file.properties -O ./game-env-file.properties
cat game-env-file.properties
# enemies=aliens
# lives=3
# allowed="true"
kubectl create configmap game-config-env-file \
--from-env-file=game-config/game-env-file.properties
kubectl describe cm game-config-env-file
kubectl get cm game-config-env-file -o yaml
# data: allowed: '"true"' / enemies: aliens / lives: "3"

cp cmfile-volume-pod.yaml cmfile-volume-pod2.yaml
vi cmfile-volume-pod2.yaml      # containers 아래에 envFrom 추가
```
```yaml
    envFrom:
    - configMapRef:
        name: game-config-env-file
```
```bash
kubectl apply -f cmfile-volume-pod2.yaml
kubectl get po | grep cmfile-volume-pod2
kubectl exec cmfile-volume-pod2 -- env | grep allowed    # allowed="true"
kubectl exec cmfile-volume-pod2 -- env | grep enemies    # enemies=aliens
kubectl exec cmfile-volume-pod2 -- env | grep lives      # lives=3
```
- `--from-file` 은 파일 하나가 key 하나(내용 전체가 value), `--from-env-file` 은 `key=value` 줄마다 key 하나.

### 8-9. LAB4: nginx index.html 을 ConfigMap 으로 주입
```bash
cp ../volume/index.html .
kubectl create cm index-cm --from-file index.html
kubectl get cm index-cm -o yaml

cp cmfile-volume-pod.yaml myweb-cm-pod.yaml
vi myweb-cm-pod.yaml
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    run: myweb-cm-pod
  name: myweb-cm-pod
spec:
  containers:
  - image: nginx:1.25.3-alpine
    name: myweb-cm-pod
    ports:
    - containerPort: 80
    volumeMounts:
    - name: nginx-index-file
      mountPath: /usr/share/nginx/html/
  volumes:
  - name: nginx-index-file
    configMap:
      name: index-cm
```
```bash
kubectl apply -f myweb-cm-pod.yaml
kubectl get po -o wide | grep myweb-cm
curl <Pod IP>              # index.html 내용 출력
```

### 8-10. LAB5: 특정 key 만 환경변수로 (configMapKeyRef)
```yaml
# cm-keyref-pod
apiVersion: v1
kind: Pod
metadata:
  name: cm-keyref-pod
spec:
  containers:
    - name: cm-keyref-container
      image: busybox
      command: [ "/bin/sh", "-c", "env" ]
      env:
        - name: RUNTIME_METHOD
          valueFrom:
            configMapKeyRef:
              name: k8s-env
              key: runtime
```
```bash
kubectl describe cm k8s-env                # orchestrator / runtime 두 key 확인
vi cm-keyref-pod                           # 위 YAML 작성 (확장자 없는 파일명)
kubectl apply -f cm-keyref-pod
kubectl get po -o wide | grep cm-key       # Completed (env 출력 후 종료)
kubectl logs cm-keyref-pod                 # RUNTIME_METHOD=containerd 포함
```

### 8-11. 참고: ConfigMap YAML 데이터 형식 예
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-configmap
data:
  string-value: "Hello, world!"
  number-value: "42"
  boolean-value: "true"
  multiline-value: |
    This is a multiline value
    that spans multiple lines
  list-value: |
    - item1
    - item2
    - item3
  object-value: |
    key1: value1
    key2: value2
  json-value: |-
    {
      "key": "value",
      "array": [1, 2, 3],
      "nested": {
        "innerKey": "innerValue"
      }
    }
  yaml-value: |-
    key: value
    array:
      - 1
      - 2
      - 3
```
- data 의 값은 모두 문자열이므로 숫자/불리언도 따옴표 처리(불린은 반드시 `"true"`). 여러 줄은 `|`. 리스트/JSON/YAML 텍스트도 통째로 하나의 값이 된다(원본 슬라이드 전체 예시로 보완).

## [확인 방법/주의점]
- `kubectl exec <pod> -- env | grep -i <키>` 로 환경변수 주입 확인.
- 환경변수 주입은 ConfigMap 변경이 Pod 에 자동 반영되지 않음 → 자료에서는 `kubectl replace --force -f <pod yaml>` 로 Pod 재생성.
- volume 방식 + `mountPath` 는 해당 디렉토리 전체를 덮어쓴다(nginx html 디렉토리를 mount 하면 기존 파일이 가려짐). mountPath mount 는 자동 반영되지만 **subPath mount 는 자동 반영 제외**. 파일이 갱신돼도 데몬은 `nginx -s reload` 등으로 다시 읽게 해야 실제 반영.
- `immutable: true` 로 지정(`kubectl edit cm` 으로 최상위에 추가)하면 이후 data 수정이 차단되며, 한 번 지정하면 되돌리기 어렵다(강사: 테스트하되 유의).
- **오류와 해결 / 실수 사례** : Pod YAML 을 복사해 쓸 때 `metadata.name` 과 label 을 바꾸지 않고 `apply` 하면 기존 Pod(cm-envfrom-pod)와 충돌/차이(diff)가 표시된다(강사도 "Pod 명을 수정을 안 했습니다"라며 이름을 수정해 다시 적용) → 복사 후 name/label 필수 변경.
- `ls -al /etc/config` 에서 `..data` 와 날짜 디렉터리, 심볼릭 링크가 보이는 것이 정상.
- `cm-keyref-pod` 는 busybox 가 `env` 만 실행하고 종료하므로 `Completed` 가 정상 상태(오류 아님). 슬라이드 상 파일명이 확장자 없이 `cm-keyref-pod` 로 표기됨.
- LAB4 에서 `apply` 를 한 번 더 입력했다가 Ctrl+C 로 취소하는 장면이 있었으나 결과에는 영향 없음.

---

# Step 9. Pod 설계패턴 4 - Ambassador

## [목적]
Pod 내 Proxy 컨테이너(Ambassador)가 통신을 대리하도록 nginx 리버스 프록시(ConfigMap 으로 nginx.conf 주입)와 Flask 앱을 한 Pod 에 구성한다.

## [이론 설명]
> 원본: 챕터 08 Clip 3 (약 12분, 슬라이드 40~47 + 터미널). Pod 설계 패턴 네 번째(앞선 패턴 클립에 이어 ConfigMap 을 활용). 학습 목표: Ambassador 의 개념·2가지 사용 형태, nginx.conf 를 ConfigMap 으로 만들어 `/etc/nginx` 에 마운트해 리버스 프록시로 동작시키는 순서, 같은 Pod 컨테이너끼리 localhost 로 통신하는 점 이해.

- **Ambassador 패턴 (슬라이드 40)** : Ambassador = 우리말로 "대사", 즉 대신 업무를 수행하는 사람 = 일종의 **프록시(Proxy)**. **Pod 내에 Proxy 역할을 하는 컨테이너를 추가하는 패턴**이며 멀티 컨테이너 Pod 를 사용한다.
  - Pod 내에서 외부 서버에 접근하거나 외부에서 Pod 애플리케이션에 접근할 때, Pod 내부의 Ambassador 컨테이너(Proxy)에 접근하도록 설정하고 실제 외부와의 연결은 Proxy 가 처리한다. 프록시로 HAProxy 나 nginx 리버스 프록시 등을 도입하면 된다.
  - **목적**: 외부 서비스에 대한 **균일한 인터페이스**를 제공해 외부 서비스를 더 쉽게 관리하고 확장. Ambassador 컨테이너는 기본 애플리케이션 컨테이너를 대신해 **네트워킹, 인증, 로깅, 모니터링** 같은 교차 관심사를 처리하는 데 적합.
  - 입문자 참고: 리버스 프록시는 서버 앞에서 바깥 요청을 받아 안쪽 서버로 넘겨 주는 방식이며, nginx 는 설정 파일 하나만 바꾸면 일반 웹서버가 아니라 리버스 프록시로 쓸 수 있다.
- **설계 유형 2가지 (슬라이드 41)**

| 구분 | 요청 방향 | Ambassador(Proxy)의 역할 | 이 영상의 실습 |
|---|---|---|---|
| 유형 01 | 외부 → Pod 안의 앱 | 바깥 요청(연결 요청)을 먼저 받아 Application 컨테이너로 전달 | [LAB1] 직접 실습 (nginx 프록시 + Flask 앱) |
| 유형 02 | Pod 안의 앱 → 외부 DB | DB 연결 정보를 갖고 외부 DB server 와 대신 통신, DB 데이터를 앱 컨테이너에 전달 ("외부에 데이터베이스가 있는 일반적인 경우") | [Demo] 강사 시연(설명) — 수강생·강사 모두 외부 DB 환경을 갖출 수 없어 강사만 시연 |

  - 외부에 다른 Pod 가 있는 경우라면 API 통신으로 충분하므로 굳이 이 방법을 쓰지 않는다(강사).
- **nginx.conf 를 ConfigMap 으로** : nginx 는 기본적으로 웹서버 모양이며 그렇게 동작하게 만드는 설정값이 `/etc/nginx/nginx.conf`. 이 파일을 리버스 프록시 구성으로 바꾸면 서비스 방식을 바꿀 수 있다(슬라이드 42 말풍선). Pod 에 들어가 하나하나 편집하는 대신, 프록시 설정이 담긴 nginx.conf 를 미리 만들어 `--from-file` 로 ConfigMap(nginx-conf)에 등록하고 Pod 생성 시 적용 → `-o yaml` 로 보면 nginx.conf 라는 key(파일명) 아래에 설정 전체가 하나의 파일 내용으로 저장되어 있다(터미널 출력은 줄 끝 처리 방식에 따라 `|+` 로 표시).
  - 프록시 설정 핵심 2곳: `server { listen 80; }` = 프록시 컨테이너가 80 포트로 요청 수신, `upstream flaskapp { server localhost:9000; }` + `proxy_pass http://flaskapp;` = 받은 요청을 같은 Pod 안 localhost:9000(Flask 앱)으로 전달("80번으로 받아서 localhost 9000번으로 전달").
- **같은 Pod 컨테이너는 네트워크를 공유** → nginx 프록시가 80 으로 받은 트래픽을 localhost:9000 의 Flask 앱으로 그대로 전달할 수 있다(강사가 짚은 핵심).
- **flaskapp-pod 구성** : `proxy-container`(nginx:1.25.3-alpine, 80 포트로 외부 요청 수신, "프록시 컨테이너로 세웠다"), `volumeMounts.mountPath: /etc/nginx` = nginx.conf 가 있는 경로로 ConfigMap 이 들어가 **기본 설정을 덮어쓰기(업데이트)** 한다, `flaskapp-container`(dbgurum/py_flask:2.0, Python Flask 로 간단한 웹페이지를 9000 포트로), `volumes: nginx-proxy-config → configMap nginx-conf`. (입문자 보충 — 영상에서 직접 언급 안 됨: ConfigMap 을 볼륨으로 마운트하면 key 이름이 파일 이름이 되고, 디렉터리 전체를 마운트하면 그 디렉터리의 다른 기본 파일은 보이지 않게 된다.)
- **서비스 노출** : `--port=80 --target-port=80` 은 "nginx 프록시 컨테이너의 80 번 포트에 접근하겠다"는 의도. NodePort 이므로 어느 노드 IP 를 써도 된다. 응답은 nginx 가 아닌 Flask 앱이 만든 페이지 → "같은 웹서비스를 프록시 컨테이너를 거쳐 바깥쪽에서 안쪽으로 전달하는 기법"이 동작한 것.
- **[Demo] 외부 DB (슬라이드 46~47)** : 강사가 EKS 데모 때마다 보여 주던 AWS EC2 터미널에 APM(Apache, PHP, MariaDB)을 설치해 두었고 MariaDB 안의 데이터(cloudo 데이터베이스 t1 테이블, c1=10, c2=AWS)를 쿠버네티스 nginx 앱에서 가져다 쓰는 시나리오.
  - 흐름: `nginx-app-container` → (localhost:3306) → `db-proxy-container`(image: mysql-proxy, 3306 포트, `envFrom/configMapRef` 로 ConfigMap `app-db-config` 의 `DB_HOST=<외부 DB 주소>` 수신) → 외부 DB server → DB Data 가 다시 앱 쪽으로 전달. 앱 컨테이너는 DB 주소를 몰라도 localhost 프록시에만 요청하면 되고 프록시가 DB 호스트 정보를 갖고 대신 커넥션을 맺는다. 강사는 nginx 안에 DB 데이터를 웹페이지에 뿌려 주는 애플리케이션 소스가 있다는 전제로 설명.
  - 강사: 원래 DB 연동 구조에서는 보통 백엔드가 이 역할을 하지만, 백엔드 없이 프론트 쪽 데이터만 간단히 전달·표시할 때 Ambassador 로 쉽게 구성할 수 있으며 이것이 이 패턴에서 가장 보편적으로 많이 쓰는 방법. 외부에서 연결할 때 Redis 캐시를 두고 그 캐시를 통해 데이터를 주고받는 구조도 Ambassador 패턴에서 자주 나오는 모양.

## [사용한 CLI]

### 9-1. 기본 nginx.conf 확인 후 사용자 정의 nginx.conf 작성
```bash
kubectl exec -it myweb-cm-pod -- sh
cat /etc/nginx/nginx.conf
exit
vi nginx.conf
```
```nginx
events {
        worker_connections 1024;
}
http {
        upstream flaskapp {
           server localhost:9000;
        }
        server {
              listen 80;
           location / {
              proxy_pass           http://flaskapp;
              proxy_redirect       off;
           }
        }
}
```
```bash
kubectl create cm nginx-conf --from-file=nginx.conf
kubectl get cm nginx-conf -o yaml
```

### 9-2. 2컨테이너 Pod (flaskapp-pod.yaml)
```bash
kubectl run flaskapp-pod --image=nginx:1.25.3-alpine --port=80 --dry-run=client -o yaml > flaskapp-pod.yaml
vi flaskapp-pod.yaml
```
(자료 화면에는 이미지명 `nginx-1.25.3-alpine` 오타가 있었으며 vi 에서 `nginx:1.25.3-alpine` 로 수정)
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: flaskapp-pod
  labels:
    app: flaskapp
spec:
  containers:
  - image: nginx:1.25.3-alpine
    name: proxy-container
    volumeMounts:
    - name: nginx-proxy-config
      mountPath: /etc/nginx
    ports:
    - containerPort: 80
      protocol: TCP
  - image: dbgurum/py_flask:2.0
    name: flaskapp-container
    ports:
    - containerPort: 9000
      protocol: TCP
  volumes:
  - name: nginx-proxy-config
    configMap:
      name: nginx-conf
```
```bash
kubectl apply -f flaskapp-pod.yaml
kubectl get po -o wide | grep flask                       # READY 2/2
kubectl expose po flaskapp-pod --name=flaskapp-svc --type=NodePort --port=80 --target-port=80
kubectl get po,svc -o wide | grep flask                   # 80:32163/TCP
curl 192.168.56.101:32163                                 # Flask HTML 응답
```

### 9-3. [Demo] 외부 DB 접근용 Ambassador (개념 예시)
```bash
# EKS 의 EC2 에서 외부 MariaDB 확인
mysql -u root -p -h 3.39.231.110
```
```sql
show databases;
use cloudo
show tables;
select * from t1;
```
```bash
kubectl create cm app-db-config --from-literal DB_HOST=3.39.231.110
vi nginxtodb-pod.yaml
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginxtodb-pod
spec:
  containers:
  - image: mysql-proxy
    name: db-proxy-container
    ports:
    - containerPort: 3306
    envFrom:
    - configMapRef:
        name: app-db-config
  - image: nginx:1.25.3
    name: nginx-app-container
    ports:
    - containerPort: 80
```
- `db-proxy-container` 가 Ambassador(DB 프록시), 앱 컨테이너는 `localhost:3306` 으로 접속. DB 주소가 바뀌면 ConfigMap(`DB_HOST`) 만 변경.

## [확인 방법/주의점]
- 2컨테이너 Pod 의 READY `2/2`(프록시·앱 두 컨테이너 모두 기동), NodePort 로 curl 시 Flask 응답(`Kubernetes, Ambassador Pod Design pattern exam!`)이 오면 nginx → Flask 프록시 성공. 슬라이드 예시 NodePort 는 32604, 실제 실습은 32163 — NodePort 는 서비스 생성 시마다 달라진다.
- ConfigMap(`nginx-conf`)을 `/etc/nginx` 에 mount 하면 이미지의 기본 설정을 우리가 만든 프록시 설정으로 덮어쓴다(강사 설명). 디렉토리 전체 마운트라 다른 기본 파일(mime.types 등)이 보이지 않을 수 있다는 점은 영상에서 직접 언급되지 않은 일반 볼륨 동작 보충이다.
- 슬라이드 44 의 첫 명령에는 이미지가 `nginx-1.25.3-alpine`(콜론 대신 하이픈)으로 적혀 있으나 편집 완료된 YAML/터미널 vi 화면은 `nginx:1.25.3-alpine` — 이미지 이름 형식은 `이름:태그` 이므로 YAML 표기가 기준.
- Demo(9-3)의 `mysql-proxy` 는 슬라이드에 표기된 이미지명(강사만 시연, 수강생 실습 대상 아님). 음성 인식에서 포트가 "3406"으로 들린 부분이 있으나 슬라이드 표기는 3306. DB 주소가 바뀌면 ConfigMap(`DB_HOST`)만 변경.

---

# Step 10. Secret 활용

## [목적]
비밀번호 등 민감 정보를 Secret 으로 만들고 Pod 에 envFrom / 볼륨 / secretKeyRef 로 주입한다. ConfigMap 과 병행 사용법을 익힌다.

## [이론 설명]
> 원본: 챕터 08 Clip 4 (약 23분, 슬라이드 49~57 + 터미널). 학습 목표: Secret = 민감 데이터를 Base64 로 인코딩해 저장하는 API object 이며 인코딩은 암호화가 아님, `kubectl create secret` 3가지 타입 구분, ConfigMap 과 같은 3방식(envFrom/secretRef, 볼륨 마운트, `env.valueFrom.secretKeyRef`), ConfigMap + Secret 동시 적용 2가지 방법.

- **Secret (슬라이드 49)** : 비밀번호, OAuth 토큰, API 키, TLS 인증서, ssh 키 같은 민감한 Credential 이 요구되는 데이터를 **Base64 로 인코딩하여 저장·관리**한다. 저장은 **1MiB 이하**만 가능. 사용 방법은 ConfigMap 과 유사(강사: 거의 동일, 차이는 저장 데이터가 평문이냐 인코딩이냐). **Pod 에 적용 시 자동 디코딩**되어 애플리케이션에서 바로 사용 가능(앱에서 따로 디코딩 신경 쓸 필요 없음).
- **Base64 ≠ 암호화 (강사 당부)** : 인코딩은 키 없이 누구나 되돌릴 수 있는 변환 규칙(암호화는 키가 있어야 풂 — "인코딩은 암호와는 완전히 다른 개념"). 이름은 secret 이지만 쉽게 풀리므로 그다지 비밀스럽지 않다. 특히 Git 같은 곳에 인코딩된 Secret 이 올라가 노출되면 누구든 쉽게 디코딩하므로 **노출 위험에 주의**. 리눅스 명령으로 확인 가능: `echo 'kubernetes' | base64` → `a3ViZXJuZXRlcwo=`, `echo a3ViZXJuZXRlcwo= | base64 -d` → `kubernetes`.
- **`kubectl create secret` 타입 3가지** : ConfigMap 은 이름을 바로 쓰지만 Secret 은 `secret` 다음에 **타입(사용할 방법)을 먼저 지정**해야 한다. 이번 실습은 generic 위주.

| 타입 | 화면 설명 / 강사 설명 |
|---|---|
| docker-registry | "컨테이너 레지스트리 접근용". docker login 대신 레지스트리 인증 정보를 저장. `docker login` 을 하면 로컬 `~/.docker` 아래 config 에 인코딩된 데이터가 저장되는데 이것도 Base64 디코딩이 되므로 노출되면 Docker Hub ID/비밀번호가 드러날 수 있어 위험 |
| generic | "Opaque secret type". 로컬 파일·디렉터리·리터럴 값으로 생성하는 일반적인 방법 (이번 클립 주로 사용) |
| tls | TLS 인증서와 연관된 키(공개키·비밀키) 저장 (TYPE `kubernetes.io/tls`, 다음 클립 고급 Secret 에서) |

- **조회 결과** : `kubectl get secrets` 는 TYPE `Opaque`(불투명한 — Base64 로 값을 가려 저장했다는 의도), DATA 개수. `describe` 는 ConfigMap 과 달리 평문 값이 나오지 않고 키 이름과 크기만(`mypwd: 8 bytes`, <PASSWORD> = 8글자). 인코딩 값은 `-o yaml` 또는 `--dry-run=client -o yaml`(creationTimestamp null)로 확인할 수 있는데 이 값도 Base64 로 즉시 디코딩되므로 <PASSWORD> 가 너무 쉽게 노출된다는 것이 강사의 결론. ConfigMap·Secret 은 둘 다 Pod 구성값용이라 from-file, 볼륨, valueFrom/keyRef 기법이 동일하게 제공된다. YAML 은 처음부터 쓰지 말고 `kubectl run --dry-run` 으로 뼈대를 만들어 수정(강사 조언).
- **적용 방식 3가지 (ConfigMap 과 필드 이름만 다름)** : ① `envFrom: - secretRef: name:`(Secret 의 모든 key 가 환경변수, 이름 = key 이름), ② 볼륨 마운트 `volumes.secret.secretName` + `volumeMounts.mountPath: /secrets`(키마다 파일(심볼릭 링크) 생성, **내용은 인코딩이 아닌 디코딩된 값**), ③ `env.valueFrom.secretKeyRef`(`name`, `key` — 원하는 key 만 골라 원하는 환경변수 이름으로). 강사: Pod 뿐 아니라 상위 오브젝트인 Deployment, StatefulSet 에도 동일하게 적용 가능.
- **ConfigMap + Secret 동시 적용 2가지** : (a) `envFrom` 아래에 `configMapRef` 와 `secretRef` 를 나란히, (b) `--from-file` 로 만든 ConfigMap/Secret 을 `configMapKeyRef`/`secretKeyRef` 로 연결(`--from-file` 은 파일 이름이 key, 파일 내용이 value 가 되며 특정 값만 취하는 keyRef 기법과 함께 많이 쓰임). `envFrom` 은 환경변수 이름 = 키 이름, `*KeyRef` 는 새 이름(K8S_ENV, WEB_DB_CONN)을 붙일 수 있다.
- busybox 이미지는 상주 프로세스가 없어 바로 종료되므로 `args: ['tail', '-f', '/dev/null']` 로 계속 동작하게 만든다(실습용). LAB2 에서 `--from-literal` 을 4번 썼지만 `--from-file`/`--from-env-file` 로 바꿔도 된다(강사: 그런 생각도 해 보라).

## [사용한 CLI]

### 10-1. Base64 인코딩/디코딩
```bash
mkdir secret && cd $_
echo 'kubernetes' | base64            # a3ViZXJuZXRlcwo=
echo a3ViZXJuZXRlcwo= | base64 -d     # kubernetes
kubectl create secret -h              # docker-registry / generic / tls
```

### 10-2. generic Secret 생성/조회
```bash
kubectl create secret generic my-pwd --from-literal=mypwd=<PASSWORD>
kubectl get secrets my-pwd                      # TYPE Opaque, DATA 1
kubectl describe secrets my-pwd                 # mypwd: 8 bytes
kubectl get secrets my-pwd -o yaml              # data.mypwd: <BASE64_ENCODED_PASSWORD>
kubectl create secret generic my-pwd --from-literal=mypwd=<PASSWORD> --dry-run=client -o yaml
echo <BASE64_ENCODED_PASSWORD> | base64 -d                   # <PASSWORD>
```

### 10-3. [LAB1] envFrom + secretRef (secret-pod1.yaml)
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secret-pod
spec:
  containers:
  - name: my-container
    image: busybox
    args: ['tail', '-f', '/dev/null']
    envFrom:
    - secretRef:
        name: my-pwd
```
```bash
kubectl apply -f secret-pod1.yaml
kubectl get po | grep secret-pod
kubectl exec secret-pod -- env | grep -i mypwd      # mypwd=<PASSWORD>
```

### 10-4. [LAB2] 웹/DB 설정 Secret (web-db-secret) 와 3가지 주입
```bash
kubectl create secret generic web-db-secret \
--from-literal=rootpw=<PASSWORD> \
--from-literal=database=fastcampusdb \
--from-literal=user=k8suser \
--from-literal=password=<PASSWORD>
kubectl describe secret web-db-secret          # Type: Opaque, 각 key 의 bytes 수만 표시
kubectl get secrets web-db-secret -o yaml
```
- 주의: `kubectl` 을 빼고 `create secret ...` 만 입력하면 `Command 'create' not found` 오류.

**방법 1) envFrom**
```yaml
# web-db-secret-pod1.yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-db-secret-pod1
spec:
  containers:
  - name: my-container
    image: busybox
    args: ['tail', '-f', '/dev/null']
    envFrom:
    - secretRef:
        name: web-db-secret
```
```bash
kubectl apply -f web-db-secret-pod1.yaml
kubectl get po -o wide | grep web-db
kubectl exec -it web-db-secret-pod1 -- env | grep rootpw      # rootpw=<PASSWORD>
kubectl exec -it web-db-secret-pod1 -- env | grep database    # database=fastcampusdb
```

**방법 2) 볼륨 마운트**
```yaml
# web-db-secret-pod2.yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-db-secret-pod2
spec:
  containers:
  - name: my-container
    image: busybox
    args: ['tail', '-f', '/dev/null']
    volumeMounts:
    - name: web-db-sec
      mountPath: /secrets
  volumes:
  - name: web-db-sec
    secret:
      secretName: web-db-secret
```
```bash
kubectl apply -f web-db-secret-pod2.yaml
kubectl get po -o wide | grep web-db                          # pod2: ContainerCreating → Running (k8s-node2)
kubectl exec -it web-db-secret-pod2 -- ls -al /secrets       # database, password, rootpw, user (심볼릭 링크)
kubectl exec -it web-db-secret-pod2 -- cat /secrets/user     # k8suser
```

**방법 3) 특정 key (valueFrom.secretKeyRef)**
```bash
cp web-db-secret-pod1.yaml web-db-secret-pod3.yaml
vi web-db-secret-pod3.yaml
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-db-secret-pod3
spec:
  containers:
  - name: my-container
    image: busybox
    args: ['tail', '-f', '/dev/null']
    env:
    - name: ROOT_PASSWORD
      valueFrom:
        secretKeyRef:
          name: web-db-secret
          key: rootpw
    - name: DATABASE_NAME
      valueFrom:
        secretKeyRef:
          name: web-db-secret
          key: database
```
```bash
kubectl apply -f web-db-secret-pod3.yaml
kubectl exec -it web-db-secret-pod3 -- env | grep ROOT_PASSWORD   # ROOT_PASSWORD=<PASSWORD>
kubectl exec -it web-db-secret-pod3 -- env | grep DATABASE_NAME   # DATABASE_NAME=fastcampusdb
```

### 10-5. [LAB3] ConfigMap + Secret 동시 사용
```yaml
# conf-sec-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: conf-sec-pod1
spec:
  containers:
  - name: my-container
    image: busybox
    args: ['tail', '-f', '/dev/null']
    envFrom:
    - configMapRef:
        name: k8s-env
    - secretRef:
        name: web-db-secret
```
```bash
kubectl apply -f conf-sec-pod.yaml
kubectl get po | grep conf-sec
kubectl exec -it conf-sec-pod1 -- env      # orchestrator, runtime(ConfigMap) + database, password, rootpw, user(Secret)
```

### 10-6. [LAB3] from-file + keyRef (conf-sec-pod2)
```bash
vi k8s-env-cm.txt        # 내용: containerd
vi web-db-sec.txt        # 내용: <PASSWORD>
kubectl create configmap k8s-env-cm --from-file=./k8s-env-cm.txt
kubectl create secret generic web-db-sec --from-file=web-db-sec.txt
vi conf-sec-pod2.yaml
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: conf-sec-pod2
spec:
  containers:
  - name: my-container
    image: busybox
    args: ['tail', '-f', '/dev/null']
    env:
    - name: K8S_ENV
      valueFrom:
        configMapKeyRef:
          name: k8s-env-cm
          key: k8s-env-cm.txt
    - name: WEB_DB_CONN
      valueFrom:
        secretKeyRef:
          name: web-db-sec
          key: web-db-sec.txt
```
```bash
kubectl apply -f conf-sec-pod2.yaml
kubectl get po | grep conf-sec-pod2
kubectl exec -it conf-sec-pod2 -- env      # K8S_ENV=containerd, WEB_DB_CONN=<PASSWORD>
```
- vi 의 백업파일(`k8s-env-cm.txt~`)이 생기면 `mv k8s-env-cm.txt~ k8s-env-cm.txt` 로 정리 후 create (자료 사례).
- `env | K8S_ENV` 처럼 grep 없이 파이프하면 `K8S_ENV: command not found`.

## [확인 방법/주의점]
- Secret 값은 describe/get 에서 가려지지만 `-o yaml` 의 base64 는 쉽게 디코딩된다 → Step 11 의 SealedSecret, Step 12 의 etcd 암호화 참고. Git 등에 인코딩된 Secret YAML 을 올리지 말 것(마스킹 유지: 이 문서의 비밀값은 모두 실습용 더미 값).
- envFrom 은 모든 key 를 키 이름 그대로 주입, `*KeyRef` 는 key 를 골라 원하는 변수 이름으로 주입.
- Pod 외 Deployment/StatefulSet 등에서도 같은 방식으로 사용.
- Pod 안에서는 Secret 이 자동 디코딩된 평문으로 들어간다(env 의 `mypwd=<PASSWORD>`, `/secrets/user` 내용 `k8suser`). `ls -al /secrets` 에는 ConfigMap 과 같은 `..data` 심볼릭 링크 구조가 보인다.
- **오류와 해결 / 실수 사례(강의 중)** : `bae64 -d` 로 오타 → `Command 'bae64' not found, did you mean: command 'base64'`. `kubectl` 을 빼고 `create secret generic ...` 만 입력 → `Command 'create' not found`(한 줄로 `kubectl create secret generic ...` 다시 입력해 성공). `kubectl exec ... -- env | K8S_ENV` 처럼 `grep` 을 빼면 `K8S_ENV: command not found`. vi 백업파일(`k8s-env-cm.txt~`)이 생기면 `mv k8s-env-cm.txt~ k8s-env-cm.txt` 로 정리한 뒤 create.
- LAB3(a) 출력에서 `orchestrator=k8s` 인 것은 앞서 ConfigMap 실습에서 `kubectl edit cm k8s-env` 로 값을 k8s 로 바꾼 상태이기 때문으로 보인다(ConfigMap 값 2개 + Secret 값 4개 = 총 6개 환경변수, 그 아래 KUBERNETES_*, *_SVC_* 변수는 쿠버네티스가 자동 주입하는 서비스 환경변수).

---

# Step 11. Secret 고급 활용 (openssl HTTPS, Ingress TLS, SealedSecret)

## [목적]
(1) openssl 인증서를 Secret 으로 만들어 nginx Pod 에서 HTTPS 서비스, (2) Ingress TLS Secret 으로 HTTPS 종단, (3) SealedSecret 으로 Git 에 올려도 안전한 Secret 관리.

## [이론 설명]
> 원본: 챕터 08 Clip 5 (약 42분). 3가지 실습으로 구성: ① openssl 로 만든 인증서·키를 Secret 에 저장하고 HTTPS 를 간단히 구현(Pod 안에서 이런 값을 어떻게 쓰는지 보여 주는 예시), ② 앞서 서비스 장에서 배운 Ingress(클러스터 내부로 들어가는 진입점)에 TLS Secret 연결, ③ SealedSecret(앞서 본 Secret 의 단점 — 단순 인코딩이라 노출 가능 — 을 제어). 학습 목표: generic(Opaque) vs tls(`kubernetes.io/tls`) 차이, Ingress `spec.tls` 연결과 `curl -k --resolve` 확인, SealedSecret(kubeseal + controller) 설치·사용·키 교체(`--re-encrypt`) 흐름.

- **용어** : TLS(전송 계층 보안)는 SSL 의 후속 규격으로 HTTPS 가 암호화 통신에 사용하는 방식. 서버는 인증서(certificate)와 짝이 되는 개인 키(private key)가 있어야 HTTPS 를 제공할 수 있고, 이 두 값은 민감 정보이므로 Secret 에 넣어 관리한다. 보안 때문에 HTTP 만 쓰지 않고 HTTPS 를 지향하는 경우가 매우 많다.
- **LAB1 openssl + Secret + nginx HTTPS**
  - 인증서가 여러 개 들어가므로 구분을 위해 `sec_https` 디렉터리 아래 인증서용(cert), nginx 설정용(config), 임시용(kubetmp) 폴더를 만든다.
  - `openssl genrsa -out https.key 2048` = 2048 비트 RSA 개인 키, `openssl req -new -x509 -key https.key -out https.cert -days 360 -subj /CN=*.k8s.io` = 그 키로 **자체 서명(self-signed)** 인증서 생성(`-days 360` 유효기간, CN = 이 인증서가 사용될 도메인(호스트명) 정보). 자체 서명 인증서는 공인 기관 서명이 아니므로 브라우저·curl 이 경고를 낼 수 있어 뒤에서 curl `-k` 사용.
  - Secret 생성은 `generic` / `tls` 두 방식. 이번에는 값을 그대로 담기만 하면 되므로 **generic**(`--from-file` 로 https.key, https.cert 를 한 Secret `k8s-https` 에) → TYPE `Opaque`(TLS 전용 타입 아님), 파일 이름이 그대로 key(`https.key`, `https.cert`).
  - nginx 가 443 포트로 SSL 을 받게 하는 부가 설정 파일(config 폴더; TLS 자체와 무관하나 서비스를 검증하기 위해 필요)을 ConfigMap `k8s-config` 로 생성: 키 `sleep-interval`(값 5), 키 `cust-nginx-config.conf`(443 ssl 수신 + 인증서 경로 `certs/https.cert`, `certs/https.key`).
  - **민감 정보와 설정 정보의 분리(강사 정리)** : 구성 파일 총 4개 — 키·인증서(민감)는 **Secret**, nginx 설정값은 **ConfigMap** 으로 나누어 관리. 앞 클립에서 배운 다양한 주입 방식(파일, 간단한 환경변수, 특정 키만 취하기)을 모두 Pod 에 적용한 구성이라 Pod YAML 이 길어진다("애플리케이션 외에 부가 서비스·환경 설정까지 반영하기 때문").
  - `sec-https-pod.yaml` 볼륨 3개 역할: `html` = emptyDir 로 두 컨테이너가 HTML 파일 공유(html-generator 가 ConfigMap `sleep-interval` 값을 `INTERVAL` 환경변수(`configMapKeyRef`)로 받아 5초 간격으로 HTML 생성, web-server(nginx:alpine)가 서빙), `config` = ConfigMap 의 `cust-nginx-config.conf` 키를 `https.conf` 파일 이름(`items.path`)으로 `/etc/nginx/conf.d` 에 마운트, `certs` = `secret.secretName: k8s-https` 를 `/etc/nginx/certs/` 에 마운트(nginx 설정의 `certs/https.cert`, `certs/https.key` 경로와 맞물림). nginx 쪽 세 볼륨 모두 `readOnly: true`.
  - 확인: Pod `2/2 Running` 후 터미널 2개 사용 — 1번에서 `kubectl port-forward k8s-https 8443:443 &`(별도 Service 없이 해당 Pod 에 바로 포트 연결, 접속 때마다 `Handling connection for 8443` 한 줄 증가), 2번에서 `curl https://localhost:8443 -k -v`. `-k` = 인증서 검증 생략(자체 서명), `-v` = TLS 핸드셰이크 등 접속 과정 상세(TLSv1.3 handshake 와 nginx 본문). 강사: "HTTPS 를 쓰는 간단한 방법 중 하나".
- **LAB2 Ingress 에 TLS Secret 연결** : 실무에서 훨씬 많이 쓰이는 기법(강사). 클라이언트는 HTTPS 로 Ingress Controller 에 접속하고, Ingress 에 단 TLS Secret 으로 **TLS 종료(termination)** 가 일어난 뒤 내부 Service·Pod 구간은 **HTTP** 로 전달된다(HTTPS 구간은 클라이언트~Ingress Controller 뿐). 이전 챕터 Ingress 실습은 HTTP 까지만 했고 여기서 TLS 추가. Ingress Controller(nginx)는 지난 수업에서 설치된 것을 전제. Pod 에 적용하는 것도 가능하다고 언급.
  - 확인용 앱으로 아직 배우지 않은 Deployment(Pod 의 상위 오브젝트, Pod 여러 개를 생성·유지 관리)를 사용 — selector/template/containers 구조는 동일. PHP(replicas 3)와 Go(replicas 3). 각 Deployment 에 `kubectl expose` 로 Service — 클러스터 내부용이므로 기본 타입 **ClusterIP** 면 충분(외부 진입은 Ingress 의 NodePort 가 담당). PHP: 80 → 80, Go: 80 → target-port 9090.
  - Ingress Controller 확인: `kubectl get po -A` 로 ingress-nginx Controller Running, `kubectl -n ingress-nginx get svc`(실습 값: NodePort `80:31858/TCP`, `443:30349/TCP` — HTTPS 접속에는 443 에 대응하는 30349 사용).
  - 인증서는 이번엔 **한 번에** 생성: `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -out server.crt -keyout server.key -subj "/CN=php.k8s.io,goapp.k8s.io"`(`-newkey rsa:2048` + `-keyout` 이 키 생성, `-out` 이 인증서 출력, `-subj` 에 접속 도메인 2개; 슬라이드에서 줄바꿈된 것은 한 줄로 입력). **tls 방식 Secret** 은 `--from-literal` 대신 `--cert`, `--key` 옵션 → TYPE `kubernetes.io/tls`, describe 에 `tls.crt`, `tls.key` 두 키.
  - Ingress(`app-tls-ingress`): 어노테이션 `rewrite-target: /`, `ssl-redirect: "true"`(HTTPS 로 들어가 HTTP 로 전달되는 과정을 보이기 위해 redirect 포함), 현재 nginx Ingress Controller 사용 → `ingressClassName: nginx`. 핵심은 `spec.tls` — `hosts`(인증서에 넣은 php.k8s.io, goapp.k8s.io)와 `secretName: k8s-tls-secret`. 이전 Ingress 실습엔 host 옵션이 없었으나 이제 Secret 에 의해 HTTPS 가 적용되는 가상 호스트명으로 접근. 나머지 rules 는 앞에서 배운 그대로. Ingress 는 네트워크 기능이라 금방 만들어지지만 ADDRESS 가 붙기까지 20~30초 대기.
  - 확인: `get ing` 의 HOSTS 두 호스트명, PORTS 80/443. `describe ing` 에 `TLS: k8s-tls-secret terminates php.k8s.io,goapp.k8s.io`, 호스트별 백엔드(각 Service 뒤 Pod 3개 엔드포인트), 두 어노테이션 적용. 도메인은 실제 DNS 에 없는 가짜 이름이므로 `curl https://goapp.k8s.io:<443 NodePort>/ -k --resolve goapp.k8s.io:<NodePort>:127.0.0.1` — `--resolve 호스트:포트:IP` = "이 호스트 이름은 이 IP 로 간주하라", 포트는 Ingress Controller Service 443 에 대응하는 NodePort(슬라이드 31384, 실습 30349 — 환경마다 다르므로 `kubectl -n ingress-nginx get svc` 로 확인), 자체 서명이라 `-k` 필요. Go 앱은 Pod 가 3개라 반복 curl 시 hostname 이 바뀜(로드밸런싱, 랜덤이라 순서대로 안 나올 수도). PHP 는 "Docker Load Balancer = (Nginx host) + (PHP & Apache contaier)" 문구 HTML 응답. `-v` 로 TLSv1.2/1.3 handshake, `HTTP/2 200`, 본문 확인(issuer 가 "Kubernetes Ingress Controller Fake Certificate" 로 보이는 구간이 있으나 이 값이 Ingress 기본 인증서인지 앞서 만든 인증서인지는 강사가 따로 설명하지 않음 — 참고 정도).
- **LAB3 SealedSecret**
  - **문제** : GitOps(Git 을 기준으로 배포 상태를 관리하는 방식)에서는 Secret 구성 값(data)이 Git 에 저장되는데 단순 base64 인코딩이라 누구나 디코딩 가능 → 민감 데이터 노출 위험("Git 같은 곳에 Secret 데이터를 올리는 경우 분명히 노출"). (클립 시작부에서 etcd 에 저장되는 Secret 도 평문이라는 점을 언급하며 그 암호화는 별도 클립에서 다룬다고 소개.)
  - **해결** : SealedSecret 은 사용 중인 클러스터에서 실행되는 **Controller 에 의해서만 암호화/복호화** 가능 — 권한 문제가 아니라 Controller 가 있는 해당 클러스터에서만 해독할 수 있다는 점이 핵심. 동작: 사용자는 SealedSecret 으로 **공개키 암호화** 방식의 Secret 암호화를 수행 → SealedSecret Controller 가 Kubernetes Secret 으로 복호화 → 이 작업들은 Controller 내에 저장된 인증서(Private key)로 처리 → 예기치 않은 상황에 대비해 이 내장 인증서를 **로컬로 저장**해 사용할 수 있다. Controller 가 장애 나면 복호화가 안 되어 API 서버가 Secret 을 읽어 앱 Pod 를 띄울 때 에러가 날 수 있어 심각하므로 인증서를 미리 로컬에 저장해 두고 그것으로 암호화하는 방법도 제공(`--fetch-cert`).
  - **kubeseal / controller** : kubeseal = SealedSecret 을 만드는 CLI, controller = 클러스터에서 복호화를 담당하는 컴포넌트(kube-system 네임스페이스 배포). **둘은 버전이 같아야** 하므로 0.24.5 로 맞춤(공식 사이트 bitnami-labs/sealed-secrets 에서 당시 최신. 버전이 달라질 수 있으니 확인). 슬라이드 참고: **SealedSecret 과 Secret 은 동일한 네임스페이스에서 동일한 이름**을 가져야 한다. `wget` 으로 압축 파일, `tar` 로 kubeseal 실행 파일만 추출, `sudo install -m 755 ... /usr/local/bin/kubeseal` 로 PATH 경로에 실행 권한 755 로 설치. `${KUBESEAL_VERSION:?}` 는 변수가 비어 있으면 에러를 내는 셸 문법.
  - **흐름** : `--dry-run=client -o yaml` 로 Secret 매니페스트만 생성(mysecret-1.yaml, `superpwd` 값 `<BASE64_ENCODED_PASSWORD>` → `echo -n ... | base64 -d` = `<PASSWORD>`; 이 파일을 Git 에 올리면 누구나 값을 봄) → `cat mysecret-1.yaml | kubeseal -o yaml > mysecret-sealed-1.yaml`(Controller 의 공개 인증서로 암호화, `data` 자리가 `spec.encryptedData` 로 바뀌고 값이 긴 암호문, 아직 클러스터에 적용 안 됨) → `kubectl apply` 하면 Controller 가 감지해 같은 이름의 일반 Secret 을 자동 생성(`get sealedsecret` 과 `get secrets` 양쪽에 표시, `jsonpath='{.data.superpwd}' | base64 -d` = <PASSWORD>). 외부에서 암호문(SealedSecret)만으로는 복호화 불가.
  - **수정** : 같은 이름으로 값을 `<PASSWORD>`(mysecret-2.yaml)로 바꿔 다시 kubeseal → apply → 이미 같은 이름이 있으므로 `configured`(업데이트), 조회하면 222 로 갱신.
  - **`--fetch-cert`** : `kubeseal --controller-name=sealed-secrets-controller --controller-namespace=kube-system --fetch-cert > mycert.pem`(controller-name/namespace 는 기본값과 같으면 생략 가능, 슬라이드에 회색). 저장한 `mycert.pem` 을 `--cert` 로 지정하면 클러스터의 Controller 에 접속하지 않고 **로컬 인증서만으로** 암호화 가능. Secret 매니페스트 생성과 kubeseal 을 파이프로 한 번에 이어 `local-sealedsecret`(값 <PASSWORD>)를 만들고 apply → secrets/sealedsecrets 양쪽에 같은 이름 생성.
  - **`--re-encrypt`** : 암호화 키를 주기적으로 교체. `kubeseal --re-encrypt < mysecret-sealed-2.yaml > tmp.yaml && mv tmp.yaml mysecret-sealed-2.yaml` → 다시 apply 하면 `encryptedData` 가 새 암호문(AgCLj5AB… → AgAAqQLGit7z…)으로 바뀜. 강사: "이건 키 교체이고, 사용하는 데는 지장이 없어서 동일하게 적용해 쓰면 된다".
  - 강사 마무리: 기본 Secret, 고급 Secret(TLS), 암호화를 추가하는 SealedSecret 까지 사용해 보며 Secret 을 마무리.

## [사용한 CLI]

### 11-1. [LAB1] openssl 인증서 + Secret + nginx HTTPS Pod
```bash
mkdir sec_https && cd $_
mkdir -p ./secret/cert
mkdir -p ./secret/config
mkdir -p ./secret/kubetmp
cd ./secret/cert

openssl genrsa -out https.key 2048
openssl req -new -x509 -key https.key -out https.cert -days 360 -subj /CN=*.k8s.io
cat https.key          # 개인 키 내용 확인 (민감정보 - 문서/Git 에 남기지 말 것)
cat https.cert         # 인증서 내용 확인

kubectl create secret generic k8s-https --from-file=https.key --from-file=https.cert
kubectl get secrets k8s-https              # TYPE Opaque, DATA 2
kubectl describe secrets k8s-https         # https.cert 1111 bytes, https.key 1704 bytes
```
- `genrsa -out ... 2048` : 2048bit RSA 개인키. `req -new -x509` : 자체 서명(self-signed) 인증서, `-days 360` 유효기간, `-subj` 주체(CN).

nginx 설정 ConfigMap(`k8s-config`: `sleep-interval: 5`, `cust-nginx-config.conf`)의 nginx 설정 (자료):
```nginx
server {
   listen               8080;
   listen               443 ssl;
   server_name          www.k8s.com;
   ssl_certificate      certs/https.cert;
   ssl_certificate_key  certs/https.key;
   ssl_protocols        TLSv1 TLSv1.1 TLSv1.2;
   ssl_ciphers          HIGH:!aNULL:!MD5;
   gzip on;
   gzip_types text/plain application/xml;
   location / {
           root /usr/share/nginx/html;
           index index.html index.htm;
   }
}
```
```bash
kubectl describe cm k8s-config      # sleep-interval: 5, cust-nginx-config.conf 확인
vi sec-https-pod.yaml
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: k8s-https
spec:
  containers:
  - image: dbgurum/k8s-lab:env
    env:
    - name: INTERVAL
      valueFrom:
        configMapKeyRef:
          name: k8s-config
          key: sleep-interval
    name: html-generator
    volumeMounts:
    - name: html
      mountPath: /var/htdocs
  - image: nginx:alpine
    name: web-server
    volumeMounts:
    - name: html
      mountPath: /usr/share/nginx/html
      readOnly: true
    - name: config
      mountPath: /etc/nginx/conf.d
      readOnly: true
    - name: certs
      mountPath: /etc/nginx/certs/
      readOnly: true
    ports:
    - containerPort: 80
    - containerPort: 443
  volumes:
  - name: html
    emptyDir: {}
  - name: config
    configMap:
      name: k8s-config
      items:
      - key: cust-nginx-config.conf
        path: https.conf
  - name: certs
    secret:
      secretName: k8s-https
```
```bash
kubectl apply -f sec-https-pod.yaml
kubectl get po -o wide k8s-https                  # READY 2/2

# 터미널 1: 포트포워딩 (로컬 8443 → Pod 443)
kubectl port-forward k8s-https 8443:443 &
# 터미널 2: HTTPS 확인 (-k: 인증서 검증 생략, -v: TLS handshake 상세)
curl https://localhost:8443 -k -v
```

### 11-2. [LAB2] Ingress TLS Secret (Deployment 2개 + Service 2개)
```bash
mkdir ing-tls && cd $_
vi app-deploy.yaml
```
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tlsapp-php
  labels:
    app: php
spec:
  replicas: 3
  selector:
    matchLabels:
      app: php
  template:
    metadata:
      labels:
        app: php
    spec:
      containers:
      - name: phpserver-container
        image: dbgurum/phpserver:2.0
        ports:
        - containerPort: 80
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tlsapp-go
  labels:
    app: go
spec:
  replicas: 3
  selector:
    matchLabels:
      app: go
  template:
    metadata:
      labels:
        app: go
    spec:
      containers:
      - name: go-container
        image: dbgurum/goapp:1.0
        ports:
        - containerPort: 9090
```
```bash
kubectl apply -f app-deploy.yaml
kubectl get deploy,po -o wide | grep tlsapp
kubectl expose deployment tlsapp-php --name=tlsapp-php-svc --port=80 --target-port=80
kubectl expose deployment tlsapp-go --name=tlsapp-go-svc --port=80 --target-port=9090
kubectl get deploy,po,svc -o wide | grep tlsapp

# Ingress Controller 확인 (NodePort 확인)
kubectl get po -A | grep ingress-nginx
kubectl get svc -n ingress-nginx          # 80:31858/TCP, 443:30349/TCP 등
```
- `kubectl -n ingress-nginx get svc` 처럼 `-n` 을 앞에 쓰면 `Error: flags cannot be placed before plugin name: -n` 오류 → `get svc -n ...` 순서로.
- (정정) 원본 자료 기준으로 위 오류는 `-n` 위치 때문이 아니라 서브커맨드 `get` 을 빠뜨린 `kubectl -n ingress-nginx svc` 입력에서 발생했다. 강사가 실제 사용한 확인 명령은 아래와 같다.
```bash
kubectl -n ingress-nginx get svc          # 80:31858/TCP, 443:30349/TCP (443 쪽 NodePort 를 HTTPS 접속에 사용)
```

TLS Secret 생성:
```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -out server.crt -keyout server.key -subj "/CN=php.k8s.io,goapp.k8s.io"
ls                                       # server.crt, server.key 생성 확인
kubectl create secret tls k8s-tls-secret --cert=server.crt --key=server.key
kubectl get secrets                      # k8s-tls-secret  kubernetes.io/tls  2
kubectl describe secrets k8s-tls-secret  # tls.crt: 1151 bytes / tls.key: 1704 bytes
```
Ingress:
```bash
vi app-tls-ing.yaml
```
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-tls-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - php.k8s.io
    - goapp.k8s.io
    secretName: k8s-tls-secret
  rules:
  - host: php.k8s.io
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: tlsapp-php-svc
            port:
              number: 80
  - host: goapp.k8s.io
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: tlsapp-go-svc
            port:
              number: 80
```
```bash
kubectl apply -f app-tls-ing.yaml
kubectl get ing
kubectl describe ing app-tls-ingress     # TLS: k8s-tls-secret terminates php.k8s.io,goapp.k8s.io, Backends(Pod 3개씩)

# DNS 없이 호스트명 해석: --resolve 호스트:포트:IP
curl https://goapp.k8s.io:<443 NodePort>/ -k --resolve goapp.k8s.io:<443 NodePort>:127.0.0.1
curl https://php.k8s.io:<443 NodePort>/ -k -v --resolve php.k8s.io:<443 NodePort>:127.0.0.1
```
- 여러 번 curl 하면 Go Pod 3개의 hostname 이 번갈아 나와 로드밸런싱 확인. `-v` 에서 TLS handshake, `HTTP/2 200` 확인(issuer 가 "Kubernetes Ingress Controller Fake Certificate" 로 보이는 것은 자료상 예시 출력).
- 자료에서 NodePort 값은 31384/30349 등으로 다르게 표기되므로 `kubectl get svc -n ingress-nginx` 의 실제 값 사용.

### 11-3. [LAB3] SealedSecret
설치:
```bash
KUBESEAL_VERSION='0.24.5'
wget "https://github.com/bitnami-labs/sealed-secrets/releases/download/v${KUBESEAL_VERSION:?}/kubeseal-${KUBESEAL_VERSION:?}-linux-amd64.tar.gz"
tar -xvzf kubeseal-${KUBESEAL_VERSION:?}-linux-amd64.tar.gz kubeseal
sudo install -m 755 kubeseal /usr/local/bin/kubeseal

kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.5/controller.yaml
kubectl get pods -n kube-system | grep sealed-secrets-controller
```
- `install -m 755` : 실행 권한(755)으로 PATH 경로에 복사. `${VAR:?}` : 변수가 비어 있으면 오류.

원본 Secret YAML 생성 → 봉인(seal) → 적용:
```bash
mkdir sealed-sec && cd $_
kubectl create secret generic secret-from-sealedsecret \
--dry-run=client --from-literal=superpwd=<PASSWORD> -o yaml > mysecret-1.yaml
vi mysecret-1.yaml                               # data.superpwd: <BASE64_ENCODED_PASSWORD> (base64 일 뿐)
echo -n "<BASE64_ENCODED_PASSWORD>" | base64 -d          # <PASSWORD>

cat mysecret-1.yaml | kubeseal -o yaml > mysecret-sealed-1.yaml
vi mysecret-sealed-1.yaml                        # kind: SealedSecret, spec.encryptedData.superpwd 암호화됨
kubectl apply -f mysecret-sealed-1.yaml
kubectl get sealedsecret
kubectl get secrets                              # Controller 가 복호화해 Secret 자동 생성
kubectl get secret secret-from-sealedsecret -o jsonpath='{.data.superpwd}' | base64 -d   # <PASSWORD>
```
SealedSecret YAML 구조 (자료):
```yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  creationTimestamp: null
  name: secret-from-sealedsecret
  namespace: default
spec:
  encryptedData:
    superpwd: <SEALED_ENCRYPTED_VALUE>...   # (이하 생략)
  template:
    metadata:
      creationTimestamp: null
      name: secret-from-sealedsecret
      namespace: default
```
값 변경(재봉인 후 apply → `configured`):
```bash
kubectl create secret generic secret-from-sealedsecret --dry-run=client --from-literal=superpwd=<PASSWORD> -o yaml > mysecret-2.yaml
vi mysecret-2.yaml
echo -n "<BASE64_ENCODED_PASSWORD>" | base64 -d          # <PASSWORD>
cat mysecret-2.yaml | kubeseal -o yaml > mysecret-sealed-2.yaml
vi mysecret-sealed-2.yaml                        # encryptedData 확인
kubectl apply -f mysecret-sealed-2.yaml          # sealedsecret.bitnami.com/secret-from-sealedsecret configured
kubectl get secret secret-from-sealedsecret -o jsonpath='{.data.superpwd}' | base64 -d   # <PASSWORD>
```
공개 인증서 받아 봉인(`--fetch-cert`, `--cert`):
```bash
kubeseal --controller-name=sealed-secrets-controller \
--controller-namespace=kube-system --fetch-cert > mycert.pem
cat mycert.pem                                   # -----BEGIN CERTIFICATE----- ... (공개 인증서)

kubectl create secret generic local-sealedsecret --dry-run=client --from-literal=superpwd=<PASSWORD> -o yaml | kubeseal --controller-name=sealed-secrets-controller --controller-namespace=kube-system --format yaml --cert mycert.pem > mysecret-sealed-3.yaml
kubectl apply -f mysecret-sealed-3.yaml
kubectl get secret local-sealedsecret -o jsonpath='{.data.superpwd}' | base64 -d   # <PASSWORD>
kubectl get secrets
kubectl get sealedsecrets
```
재암호화(`--re-encrypt`):
```bash
kubectl get sealedsecrets.bitnami.com secret-from-sealedsecret -o yaml
kubeseal --re-encrypt < mysecret-sealed-2.yaml > tmp.yaml && mv tmp.yaml mysecret-sealed-2.yaml
kubectl apply -f mysecret-sealed-2.yaml
kubectl get sealedsecrets.bitnami.com secret-from-sealedsecret -o yaml   # encryptedData 값이 바뀜
```

## [확인 방법/주의점]
- Ingress 의 ADDRESS 가 할당되기까지 20~30초 소요. `describe ing` 에서 TLS 줄과 Backends 확인.
- `curl -k` 는 자체 서명 인증서 검증 생략용. 가짜 도메인은 `--resolve 호스트:포트:IP` 로 해석(포트는 Ingress Controller Service 의 443 NodePort).
- SealedSecret 의 `encryptedData` YAML 은 Git 에 둘 수 있는 대상이며(자료의 취지), 원본 Secret YAML(mysecret-*.yaml)은 base64 평문이므로 Git 에 올리지 않는다.
- `kubectl port-forward ... &` 로 백그라운드 실행 후 curl (자료는 터미널 2개 사용).
- **오류와 해결** : `kubectl -n ingress-nginx svc` 처럼 서브커맨드 `get` 을 빠뜨리면 `Error: flags cannot be placed before plugin name: -n`. `kubeseal` 과 controller 버전 불일치 주의(둘 다 0.24.5). SealedSecret 과 Secret 의 이름·네임스페이스가 같아야 한다. 자료의 긴 암호문(인증서/encryptedData)은 일부만 표기되었으므로 값은 실제 환경에서 생성한 것을 사용.
- 영상 터미널에서는 SealedSecret 실습 디렉터리를 `sealed` 로 만들어 작업했고 슬라이드에는 `sealed-sec` 로 표기(명령 내용은 같음). 슬라이드 상 Ingress YAML 의 rules 는 오른쪽 열에 이어져 있어 위 YAML 은 이어 붙인 것.
- 비밀값(<PASSWORD> 등)은 모두 실습용 더미 값이며 인증서/암호문 본문은 문서에 싣지 않는다.

---

# Step 12. etcd 암호화로 Secret 암호화하기

## [목적]
기본값은 Secret 이 etcd 에 평문(base64 수준)으로 저장되므로, kube-apiserver 에 EncryptionConfiguration 을 적용해 etcd 저장 데이터를 암호화하고 etcdctl 로 검증한다.

## [이론 설명]
> 원본: 챕터 08 Clip 6 (약 19분, 챕터 마지막 클립). 학습 목표: Secret 은 base64 인코딩일 뿐이며 etcd 에는 기본적으로 평문으로 저장, `EncryptionConfiguration` 리소스와 kube-apiserver 의 `--encryption-provider-config` 옵션이 etcd 암호화의 핵심 설정 2가지, `etcdctl` + `hexdump -C` 로 평문/암호화 확인, 암호화 활성화 이전의 기존 Secret 은 자동 암호화되지 않으므로 `kubectl replace` 로 다시 써야 함과 암호화 해제 시 위험.

- **Secret 은 etcd 에 평문으로 저장된다** : Secret 의 값은 base64 로 인코딩되어 있어 "암호화"로 알고 있는 경우가 많지만 etcd 에 기록된 정보를 직접 보면 평문(plaintext)이다(슬라이드: "Secret 에 저장된 인코딩 값은 etcd 를 들여다 보면 평문으로 확인"). etcd 는 컨트롤 플레인이 클러스터의 모든 상태를 저장하는 키-값 저장소(아키텍처 장에서 학습). **etcd 에 저장되는 모든 API 리소스는 암호화를 지원하지만 기본값은 암호화하지 않는 평문**이며, 모든 리소스를 한꺼번에 또는 "Secret 만" 등 일부만 지정해 암호화할 수 있다. etcd 에 접근 권한이 있는 사람은 누구나 값을 볼 수 있으므로 그것조차 암호화하려는 것이 이 기능의 목적.
- **/registry 경로 구조** : kube-apiserver 가 etcd 의 가상 경로 `/registry/*` 아래 카테고리별 디렉터리(`/registry/secrets/*`, `/registry/configmaps/*`, `/registry/pods/*` …)에 "레지스트리 / 종류 / 네임스페이스 / 이름 → 데이터" 구조로 저장. 예: `/registry/secrets/default/etcd-secret`.
- **etcdctl** : etcd 안쪽을 들여다보는 명령. 방법 2가지 — ① 호스트에 etcdctl 직접 설치(LAB1), ② kube-system 의 etcd 파드 안에 이미 설치된 etcdctl 사용(LAB2). 접속 옵션: `ETCDCTL_API=3`(API v3), `--cert`(클라이언트 인증서), `--key`(클라이언트 키), `--cacert`(CA 인증서), `get /registry/<종류>/<네임스페이스>/<이름>`. 출력은 `hexdump -C` 로 보면 오른쪽 문자열에 `mypwd`, `<PASSWORD>` 가 그대로 보인다(= 평문 저장; `kubectl get -o yaml` 의 `<BASE64_ENCODED_PASSWORD>` 는 base64 라 누구나 디코딩 가능).
- **etcd 암호화를 켜기 위한 설정 2가지 (이 두 가지만 하면 활성화)**

| 설정 | 내용 |
|---|---|
| ① EncryptionConfiguration 리소스 생성 | `resources` : 암호화를 원하는 리소스(object) 타입 지정. `providers` : 암호화 방식(알고리즘)을 정의하여 해당 방식으로 암호화. `identity: {}` 는 암호화를 지원하지 않음(암호화 안 함). provider 상세는 슬라이드 링크(kubernetes.io/docs/reference/config-api/apiserver-encryption.v1/) 참고 |
| ② kube-apiserver 에 활성화 | 매니페스트에 `--encryption-provider-config=<위 파일의 경로와 파일명>` 추가. 활성화 시 재시작 시간 필요 |

- **encryption.yaml 요점** : 파일 위치는 이미 있는 `/etc/kubernetes/pki` 아래(새 경로를 만들어도 되지만 pki 가 이미 존재), 파일명은 임의. `name` 은 key1, key2, key3 처럼 붙임. 슬라이드에는 `secrets` 와 `configmaps` 가 함께 적혀 있으나 강사는 **실습에서 secrets 하나만** 넣었고 configmap 은 따로 암호화하지 않았다(원하면 추가). 마지막 `identity: {}` 는 밑에 있어 실제로는 적용되지 않는(암호화 안 함 → 우선순위상 의미 없는) 항목이라 지워도 된다고 강사가 설명. (보충: 일반적으로 identity 를 목록 뒤쪽에 두면 암호화 이전의 평문 데이터도 읽을 수 있는 fallback 이 되며, 이 설명은 영상 발언이 아닌 쿠버네티스 일반 동작.)
- **키 생성** : secretbox 의 키 길이는 **32바이트**. `head -c 32 /dev/urandom | base64` 로 임의의 32바이트 랜덤 값을 base64 로 출력해 키로 사용 — 각자 직접 출력해서 써야 한다(슬라이드의 키 문자열은 예시. 강사: 어차피 임의의 값이라 그대로 써도 상관없다고 언급 — 실무에서는 노출된 예시 키를 쓰지 말고 새로 생성).
- **Provider 비교표 (슬라이드)**

| Provider | 암호화 방식 | 강도 | 속도 | 키 길이 | 설명 |
|---|---|---|---|---|---|
| identity | 없음(X) | N/A | N/A | N/A | 암호화하지 않을 때 사용. 첫 번째 provider 로 설정되면 새 값이 기록될 때 암호화된 리소스가 복호화됨 |
| aescbc | AES-CBC | Weak | Fast | 32 byte | CBC 는 패딩 오라클 공격에 취약 |
| aesgcm | AES-GCM (20만 번 읽을 때마다 교체 필요) | - | Fastest | 16, 24, 32 byte | 자동 키 회전 방식이 구현된 경우를 제외하고는 비권장 |
| kms v1 | DEK | Strongest | Slow | 32 byte | 별도의 KMS plugin gRPC server 필요 |
| kms v2 | DEK | Strongest | Fast | 32 byte | 별도의 KMS plugin gRPC server 필요 |
| secretbox (1.27 이상) | XSalsa20 and Poly1305 | Strong | Faster | 32-byte | 일반 수준의 암호화 수준 지원, latest 암호화 기술 |

  - 강사: secretbox 는 쿠버네티스 1.27 에 새로 나온 provider(실습 클러스터 v1.28, 1.29 가 나온 상태). 강도가 강하고 속도도 빠르며 키 길이가 32바이트라 선택. 다른 알고리즘은 요구사항에 맞게 provider 작성. 참고: kubernetes.io/docs/tasks/administer-cluster/encrypt-data/.
- **kube-apiserver 재시작** : `/etc/kubernetes/manifests` 아래 파일은 kubelet 이 직접 관리하는 스태틱 파드 정의. 저장하면 변경이 감지되어 kube-apiserver 가 자동 재시작되며 보통 **30초~1분 이내**. 그동안 `kubectl get no` 는 `The connection to the server 192.168.56.100:6443 was refused`. kubectl 이 응답하면 API 서버와 통신이 된다는 뜻이므로 노드 조회만으로 정상 여부 확인 가능. 강사가 강조: 이 작업은 **아주 중요하고 민감한 작업**이므로 오타 없이 정확히 입력해야 하며 잘못하면 API 서버가 올라오지 않을 수 있다.
- **적용 확인** : 재시작 전 `ps -aux | grep kube-api | grep "encryption-provider-config"` 는 아무 줄도 안 나옴(미적용), 재시작 후에는 `kube-apiserver --encryption-provider-config=/etc/kubernetes/pki/encryption.yaml ...` 가 나타남. 암호화 후 etcd 값은 `k8s:enc:secretbox:v1:key1:` 접두어 + 사람이 읽을 수 없는 바이너리(접두어 = "secretbox provider 의 key1 으로 암호화했다"는 표시), `mypwd`/`<PASSWORD>` 문자열은 보이지 않는다.
- **기존(암호화 전) Secret 은 수동으로 다시 써야 한다** : 암호화 설정을 켠 시점 이후에 쓰이는(생성·수정되는) 데이터만 암호화된다. `kubectl get secrets <이름> -o json | kubectl replace -f -`(JSON 으로 읽어 그대로 replace → kube-apiserver 가 다시 저장하면서 현재 설정(암호화) 적용). `-A` = 전체 네임스페이스, `-n [namespace]` = 특정 네임스페이스의 Secret 전체를 한 번에 교체.
- **주의(실제 사례, 슬라이드 붉은 말풍선)** : "[주의] 암호화된 secret 이 있는 상태에서 암호화 해제 시 apiserver 가 해당 secret 해독 불가로 not running 될 수 있다." kube-apiserver 가 재시작되면 관리하는 모든 리소스 오브젝트를 한 번씩 읽는데 암호화된 Secret 이 남은 채 암호화를 해제하면 해독하지 못해 API 서버 전체가 정상 구동되지 못한 트러블슈팅 사례가 있었다 → 신중하게 사용. (보충 — 영상 발언이 아닌 위 주의에서 이끌어 낸 것: 암호화를 해제해야 한다면 먼저 암호화된 Secret 들을 평문으로 되돌려 해독 불가 데이터가 남지 않게 해야 한다.)

## [사용한 CLI]

### 12-1. etcdctl 설치 (v3.5.11)
```bash
export RELEASE=$(curl -s https://api.github.com/repos/etcd-io/etcd/releases/latest|grep tag_name | cut -d '"' -f 4)
wget https://github.com/etcd-io/etcd/releases/download/${RELEASE}/etcd-${RELEASE}-linux-amd64.tar.gz
tar xvzf etcd-v3.5.11-linux-amd64.tar.gz
cd etcd-v3.5.11-linux-amd64/
sudo mv etcd etcdctl etcdutl /usr/local/bin
etcd -version                  # Etcd Version: 3.5.11
```
- 자료에서는 다운로드된 파일 버전(3.5.11) 기준으로 tar 해제.

### 12-2. 현재 상태 확인 (암호화 미적용)
```bash
ps -aux | grep kube-api | grep "encryption-provider-config"     # 아무것도 안 나오면 미적용

kubectl create secret generic etcd-secret --from-literal=mypwd=<PASSWORD>
kubectl get secrets etcd-secret -o yaml                          # data.mypwd: <BASE64_ENCODED_PASSWORD>

sudo ETCDCTL_API=3 etcdctl --cert /etc/kubernetes/pki/apiserver-etcd-client.crt --key /etc/kubernetes/pki/apiserver-etcd-client.key --cacert /etc/kubernetes/pki/etcd/ca.crt get /registry/secrets/default/etcd-secret | hexdump -C
# hexdump 에서 "mypwd", "<PASSWORD>" 가 그대로 보임 (평문 저장)
```
- `ETCDCTL_API=3` : API v3, `--cert/--key/--cacert` : etcd 접속 인증서, `get <키>` : etcd 키 조회, `hexdump -C` : 16진수+ASCII 출력.

### 12-3. EncryptionConfiguration 작성
```bash
kubectl delete secret etcd-secret
head -c 32 /dev/urandom | base64          # 32byte 랜덤 키 생성 (예: <BASE64_32BYTE_KEY>)
sudo vi /etc/kubernetes/pki/encryption.yaml
```
```yaml
kind: EncryptionConfiguration
apiVersion: apiserver.config.k8s.io/v1
resources:
  - resources:
      - secrets
      - configmaps        # 필요 시 다른 object 도 추가 가능
    providers:
      - secretbox:
          keys:
            - name: key1
              secret: <BASE64_32BYTE_KEY>
      - identity: {}
```
- 파일은 apiserver 가 마운트하는 `/etc/kubernetes/pki` 아래에 둔다(자료). key 이름은 key1, key2 ... 로 구분.

### 12-4. kube-apiserver 에 옵션 추가
```bash
sudo vi /etc/kubernetes/manifests/kube-apiserver.yaml
```
```yaml
spec:
  containers:
  - command:
    - kube-apiserver
    - --encryption-provider-config=/etc/kubernetes/pki/encryption.yaml
    ...
```
```bash
kubectl get no            # 재시작 중에는: The connection to the server 192.168.56.100:6443 was refused
                          # 30초~1분 후 다시 실행하면 정상
ps -aux | grep kube-api | grep "encryption-provider-config"   # 옵션 적용 확인
```

### 12-5. 검증 1: 호스트의 etcdctl 로 새 Secret 확인
```bash
kubectl create secret generic etcd-secret --from-literal=mypwd=<PASSWORD>
sudo ETCDCTL_API=3 etcdctl --cert /etc/kubernetes/pki/apiserver-etcd-client.crt --key /etc/kubernetes/pki/apiserver-etcd-client.key --cacert /etc/kubernetes/pki/etcd/ca.crt get /registry/secrets/default/etcd-secret | hexdump -C
# 값 영역이 "k8s:enc:secretbox:v1:key1:" 접두 + 암호화된 바이트 → 평문 mypwd/<PASSWORD> 가 안 보임
```

### 12-6. 검증 2: etcd Pod 안에서 etcdctl 실행 (kube-system)
```bash
kubectl create secret generic january-secret --from-literal=januarykey=<PASSWORD>

kubectl -n kube-system exec -it etcd-k8s-master -- sh -c "ETCDCTL_API=3 \
ETCDCTL_CACERT=/etc/kubernetes/pki/etcd/ca.crt \
ETCDCTL_CERT=/etc/kubernetes/pki/etcd/server.crt \
ETCDCTL_KEY=/etc/kubernetes/pki/etcd/server.key \
etcdctl --endpoints=https://127.0.0.1:2379 \
get /registry/secrets/default/january-secret"
```
- 자료 흐름(정정): 슬라이드 94쪽 제목은 "두 번째 방법, etcd encryption (etcd 암호화 기능 해제 후..)" 로, 아래에 `januaryke<PASSWORD>Opaque` 같은 평문이 보이는 예는 **암호화 기능을 해제한 뒤 만든 Secret 은 평문으로 저장된다**는 것을 보여 주는 설명이다. 강사는 실습에서 이 해제 과정을 건너뛰고 암호화 기능을 유지한 채 살펴봤다고 하며(암호화 설정·해제는 kube-apiserver 옵션을 지웠다 넣었다 하면 간단), 이후 `february-secret` 을 새로 만들어 조회하면 `k8s:enc:secretbox:v1:key1:` 로 암호화되어 보인다. 암호화 활성화 후 새로 만드는 Secret 은 모두 자동 암호화된다. (`january-secret` 은 아래 12-7 의 replace 로 암호화됨.)
```bash
kubectl create secret generic february-secret --from-literal=februarykey=<PASSWORD>
kubectl -n kube-system exec -it etcd-k8s-master -- sh -c "ETCDCTL_API=3 \
ETCDCTL_CACERT=/etc/kubernetes/pki/etcd/ca.crt \
ETCDCTL_CERT=/etc/kubernetes/pki/etcd/server.crt \
ETCDCTL_KEY=/etc/kubernetes/pki/etcd/server.key \
etcdctl --endpoints=https://127.0.0.1:2379 \
get /registry/secrets/default/february-secret"
# /registry/secrets/default/february-secret
# k8s:enc:secretbox:v1:key1: (이후 암호화된 바이너리)
```

### 12-7. 기존 Secret 재암호화
```bash
# 이전에 만든 Secret 을 읽어서 그대로 다시 쓰면 apiserver 가 암호화하여 저장
kubectl get secrets january-secret -o json | kubectl replace -f -     # secret/january-secret replaced
# (위 etcdctl exec 로 다시 조회 → k8s:enc:secretbox:v1:key1: 확인)

# 전체 네임스페이스의 모든 Secret
kubectl get secrets -A -o json | kubectl replace -f -
# 특정 네임스페이스만
kubectl get secrets -n [namespace] -o json | kubectl replace -f -
kubectl get secrets                                                   # 기존 Secret 목록 확인 (etcd-secret, january-secret, my-pwd ...)
kubectl get secrets my-pwd -o json | kubectl replace -f -             # 개별 예 (secret/my-pwd replaced)
```

## [확인 방법/주의점]
- 암호화 확인 기준: etcd 값이 `k8s:enc:secretbox:v1:key1:` 로 시작하고 평문이 보이지 않음.
- `kubectl get -o yaml` 은 apiserver 가 복호화해 반환하므로 암호화 여부와 무관하게 base64 로 보인다 → etcdctl 로 확인.
- 설정 후 kube-apiserver 재시작 구간에 kubectl 이 실패(`connection refused`)하는 것은 정상(30초~1분).
- 이 작업은 control-plane(k8s-master) 에서 수행. `kube-apiserver.yaml`/`encryption.yaml` 은 오타 없이 정확히 — 잘못하면 API 서버가 올라오지 않는다.
- **암호화된 Secret 이 있는 상태에서 암호화를 해제하지 말 것** (kube-apiserver 가 해독 불가로 not running 될 수 있음, 강사가 겪은 사례).
- etcdctl 은 호스트 설치 방식(인증서 `apiserver-etcd-client.crt/.key`, `etcd/ca.crt`)과 etcd 파드 내장 방식(`etcd/server.crt/.key`, `--endpoints=https://127.0.0.1:2379`)의 인증서 경로가 다르다. 다운로드 버전은 릴리스 시점에 따라 달라질 수 있어 tar 파일명(v3.5.11)을 확인해 사용(슬라이드 주석 "download 되는 버전 확인 필요").
- 일부 터미널 출력은 암호화된 바이너리라 깨진 문자로 표시되어 화면상 판독 불가(영상 중 입력 오타를 강사가 바로잡는 장면 있음).
- 자료의 암호화 키는 예시 값이므로 실제 환경에서는 새로 생성하고 문서/Git 에 남기지 않는다.

---

# Step 13. Kubernetes Workload Resources 개요

## [목적]
Pod 를 직접 만드는 대신 Pod 의 확장(Scaling)/무중단 배포(Rollout)/자동 복구(Healing)를 담당하는 workload resource 들의 역할을 구분하고, 필요한 object 의 spec 을 조회하는 방법을 익힌다.

## [이론 설명]
> 원본: 챕터 09 Clip 1 (약 16분, 슬라이드 + 터미널). 8장까지는 Pod 위주 object 를 다뤘고, 9장은 Pod 의 상위 object — Pod 기능을 강화하는 여러 **오케스트레이션(orchestration) 기능**을 보여 줄 workload resource — 를 소개한다.
>
> 챕터 09 클립 구성: 01 Kubernetes workload resources(이번 클립) / 02 [실습] Deployments 활용(가장 많이 쓰는 object. ReplicaSet 을 통한 복제 관리, 스케일링, 롤아웃(롤링 업데이트) 등) / 03 [실습] Deployments 배포전략(기본 전략인 롤링 업데이트와 Recreate 두 가지, 블루-그린·카나리·A/B 테스트는 따로 분류해서 다룰 내용) / 04 [실습] statefulSet 활용(Deployment 는 상태값을 저장하지 않으므로 상태를 저장해야 하는 애플리케이션용) / 05 [실습] DaemonSet 활용(모든 노드에 Pod 하나씩, 노드 선택도 가능, 모니터링·로그 수집 용도) / 06 [실습] Job & CronJob 활용(Job 은 특정 작업이 끝날 때까지 동작하는 Pod, CronJob 은 리눅스 cron 처럼 예약 실행) / 07 [실습] HPA 이해와 활용(Horizontal Pod Autoscaler, 자동 확장 기능 설명과 간단한 실습).

- **workload resources 란 (슬라이드)** : (1) Kubernetes 의 workload 는 **Pod 를 중심으로 구동되는 컨테이너 애플리케이션**, (2) 이 애플리케이션이 원하는 상태와 특성을 정의하는 다양한 구성 요소가 있고, (3) Workload resources 는 **Pod 의 Life cycle 관리를 지원해 주는 도구**, (4) Kubernetes 에는 내장된 다양한 object 가 있고 **Controller 를 통해 관리**된다. 강사: workload 는 "말 그대로 업무를 처리하는 자원"(Pod, StatefulSet, DaemonSet, Job, CronJob 등)이며 "Pod 의 라이프 사이클을 어떻게 운영·관리할지 그 특성을 잡아 주는 것"을 workload resource 라고 부른다. 이런 상위 object 는 대부분 자체 컨트롤러를 가지며 컨트롤러 매니저가 관리하는 Deployment 컨트롤러, StatefulSet 컨트롤러 등이 Pod 를 효율적으로 운영한다.
- Controller 는 선언된 상태(desired state)를 유지하도록 계속 감시/조정한다(예: Deployment 가 "Pod 3개 유지"). (영상에서는 컨트롤러가 각 object 마다 존재하며 컨트롤러 매니저에 의해 관리된다고 설명.)
- **Pod 만으로는 부족한 이유 (슬라이드 7)** : "Pod 는 애플리케이션 배포의 기본 단위다. 하지만 Pod 만으로는 Orchestration 의 이점을 모두 얻을 수 없다." 세 가지는 모두 Pod 단독이 아니라 상위 workload resource 가 제공 — 이 세 가지가 workload resource 를 배우는 이유.

| 기능 | 슬라이드 설명 | 강사 설명 |
|---|---|---|
| Scaling | 언제든 Pod 수를 조정 가능, 복제 기능을 통해 확장성 | Pod 수를 조정해 복제하는 Deployment 같은 object 로 확장성을 갖춘다. **Pod 자체는 HPA(자동 확장)를 적용할 대상이 아니다.** |
| Rollout (= Rolling update) | 가용성을 유지하는 새 버전 교체 기능으로 가동 중지 시간 최소화 | 기존 버전을 두고 새 버전으로 하나씩 교체해 서비스가 끊기지 않게 한다. 이미지나 설정값도 바꿀 수 있다 |
| Automatic Healing | Pod 의 비정상 중단 상태를 지속적으로 관찰(watch)하여 자동으로 교체 | kubelet 이 Pod 상태를 계속 관찰해 API 서버에 보고하고, 원하는 상태가 아니면 새 Pod 로 교체한다. Pod 단독으로는 이 효과를 얻을 수 없다 |

  - 슬라이드 결론: "다양한 workload resource 를 통해 Pod 를 사용자가 아닌 Kubernetes 가 자동 관리해 준다". 사용자가 Pod 를 하나하나 손으로 관리하는 대신 auto scaling, rolling update, rollout 같은 오케스트레이션 기능을 활용하므로 상위 object 를 효율적으로 쓰는 방법을 익혀야 한다(강사 강조).
- **애플리케이션 식별과 설계 (슬라이드 8)** : workload 를 통해 애플리케이션을 식별해야 한다. 대부분의 MSA 애플리케이션은 각각의 특징과 고정된 통신 패턴을 가진다 — Frontend 는 Backend 에 지속적으로 요청 트래픽을 보내고 Backend 는 DB 서버, 로그 서버, 모니터링 서버 등과 다양한 트래픽을 주고받는다. 이 구조의 완성도를 높이려면 다양한 workload resources 활용이 필요하다. workload resources 는 애플리케이션 정의·배포·관리의 주요 역할을 수행하고 운영을 단순화하며 안정성과 확장성을 높이는 추상화 수준의 기능을 제공. 강사 예: Frontend 는 외부에서 데이터를 받으므로 외부 노출, Backend 와는 내부 통신이라 내부 노출, 데이터 처리 쪽엔 볼륨, 설정값엔 Secret·ConfigMap — "Frontend-Backend-DB" 만 놓고 요구사항을 따져도 지금까지 배운 것만으로 **15개 이상의 object** 가 나온다 → workload resource 사용 **설계**가 중요.
- **object 관계도 (슬라이드)** : Pod 를 중심으로 환경 설정(configMap, Secret), 볼륨(Volume, PVC, PV, Storage Class), 권한(Role, RoleBinding, Service account), 서비스(Ingress, Service), 그리고 workload resource(ReplicaSet, Deployment, HPA). **Deployment 가 ReplicaSet 을 관리(Manages), ReplicaSet 이 Pod 를 복제(Replicates), HPA 가 Deployment 를 확장(Scales)**(빨간 상자 부분). 8장까지가 Pod 중심 운영 능력이었다면 이제부터는 Pod 를 더 효율적으로 쓰는 방법.
- **Workload Resources Overview (슬라이드 출처: shipit.dev/posts/kubernetes-overview-diagrams.html)** — 모든 workload resource 는 Pod 를 중심으로 동작

| Object | 슬라이드 영문 설명 | 강사 설명 |
|---|---|---|
| Pod | smallest compute unit containing 1..n containers | 하나 또는 여러 컨테이너를 포함하는 가장 작은 컴퓨팅 단위 |
| Deployment | creates a ReplicaSet and takes care of rollouts and rollbacks | ReplicaSet 을 보유하고 이를 통해 복제·롤아웃·롤백 구현. Deployment → ReplicaSet → Pod → 컨테이너로 이어지는 building block |
| ReplicaSet | creates the desired amount of Pod instances | 지정한 수의 Pod 복제본 유지. 별도 클립 없이 Deployment 하위로 함께 다룸 |
| Horizontal Pod Autoscaler | scales the number of Pods based on various metrics | CPU 같은 metric 기준으로 Pod 개수를 늘리거나 줄이는 알고리즘(CPU 가 일정 수준 이상이면 늘리고 이하이면 줄임). 보통 Deployment 위주로 사용 |
| ReplicationController | predecessor of Deployment, don't use it anymore | Deployment 의 전신, 지금은 거의 쓰지 않음(이번 챕터에서는 이를 제외한 7가지 object 를 살펴봄) |
| StatefulSet | creates Pods while handling the needs of stateful applications | 상태 저장 애플리케이션용. 복제 기능은 있지만 Pod 이름·접근 방식이 Deployment 와 조금 다름. HPA 사용 가능 |
| Job | creates short living Pods for one time executions | 일회성 작업이나 배치 작업 수행. 끝나면 완료되므로 수명이 짧은 Pod |
| CronJob | creates Jobs based on a time schedule | 시간 일정에 따라 Job 생성(예약 실행) |
| DaemonSet | creates exactly one Pod per Node | 모든 노드에 Pod 를 하나씩 배치. 정보 수집(모니터링·로그) 용도 |

- **`kubectl api-resources` 읽기** : 열은 NAME, SHORTNAMES, APIVERSION, NAMESPACED, KIND. 대부분 v1 로 시작하는 기본 object, 아래로 갈수록 인증 관련 object, 추가 설치한 metallb(`metallb.io/v1beta1`), openebs(`openebs.io/v1alpha1`), CRD(Custom Resource Definition)로 만든 커스텀 리소스도 포함. SHORTNAMES 는 줄임 이름(events=ev, ingresses=ing, networkpolicies=netpol, poddisruptionbudgets=pdb), NAMESPACED 는 namespace 에 속하는 object 인지(true/false), KIND 는 YAML 의 kind 에 쓰는 이름.
- **처음 보는 object 의 구조 확인 (강사 권장 순서)** : YAML 은 들여쓰기 구조가 복잡하고 자주 틀리므로 Pod 때 소개한 explain 활용 — (1) `kubectl api-resources` 로 기본 버전과 kind 이름 확인, (2) `kubectl explain deployment` 로 전체 내용, (3) `deployment.spec`, 그다음 `template` 같은 하위 항목을 하나씩 파고들며 종속 관계와 옵션 확인. `--recursive` 는 그 아래 모든 필드를 트리 구조로 한 번에 나열해 들여쓰기 구조 확인에 유용(예: deployment.spec 아래 strategy).
- MSA 구성(Frontend–Backend–DB)에는 Pod 외에 ConfigMap/Secret, Volume/PVC/PV/StorageClass, Service/Ingress, Role/RoleBinding/ServiceAccount, workload resources 가 함께 쓰임.

## [사용한 CLI]
```bash
# workload resource 의 kind/SHORTNAMES/NAMESPACED/APIVERSION 확인
kubectl api-resources

# spec 조회 (필드 설명)
kubectl explain deployment
kubectl explain deployment.spec
kubectl explain deployment.spec.strategy
kubectl explain deployment.spec.strategy --recursive     # 하위 필드 전체 트리
```
- `api-resources` 의 SHORTNAMES 예: events=ev, ingresses=ing, networkpolicies=netpol, poddisruptionbudgets=pdb, configmaps=cm, horizontalpodautoscalers=hpa 등. 외부 CRD(metallb.io, openebs.io)도 함께 보임.

## [확인 방법/주의점]
- YAML 을 외우기보다 `kubectl explain` 과 `kubectl create ... --dry-run=client -o yaml` 로 생성한다.
- Pod 자체는 HPA(자동 확장) 적용 대상이 아니다 — Scaling 은 Deployment 같은 상위 object 의 복제 기능으로 갖춘다(강사).
- 슬라이드 목차는 01~04 가 먼저, 이어서 05 DaemonSet / 06 Job & CronJob / 07 HPA 순으로 표시된다.

---

# Step 14. Deployment 활용

## [목적]
Deployment 로 ReplicaSet/Pod 를 선언적으로 관리하고, 서비스 노출, ConfigMap/Secret 연동, 이미지 업데이트·롤백·일시정지, 스케일링, 리소스 제한과 Probe 설정을 실습한다.

## [이론 설명]
> 원본: 챕터 09 Clip 2 (약 41분, 슬라이드 + 터미널). 학습 목표: Deployment - ReplicaSet - Pod - 컨테이너 빌딩 블록 구조 설명, Deployment YAML 핵심 필드(replicas, selector, template, strategy, resources), `create deployment --dry-run=client -o yaml` 로 초안 → apply/expose, set image / rollout history / rollout undo / pause·resume / scale / 리소스 제한 / Probe.

- **Deployment = Pod 의 가장 상위 object, 가장 많이 쓰는 workload resource.** 슬라이드: "Deployments 는 Kubernetes 클러스터에서 컨테이너화된 애플리케이션을 관리하기 위한 **기본 빌딩 블록**을 제공한다." 애플리케이션 → 컨테이너 → Pod → ReplicaSet → Deployment 순으로 하위 구조를 차곡차곡 쌓은 형태라서 "빌딩 블록".
  - 컨테이너 = 이미지로 만듦(NGINX, Apache, Python, node, mongoDB, elastic, JVM 등), Pod = 컨테이너를 감싸는 포장지(wrapper), **ReplicaSet = Pod 복제 기능**(replicas: 2 이면 항상 Pod 2개 유지. Pod 에 문제가 생기면 같은 노드든 다른 노드든 새 Pod 를 만들어 지정 수를 보장 — 이 복제·오토 힐링이 Pod 단독과의 차이), **Deployment = ReplicaSet 을 가진 상위 object**(Deployment 로 서비스를 올리면 ReplicaSet(RS)이 함께 만들어짐).
  - Deployment 는 복제 Pod 집합을 관리하고 확장하는 **선언적 방법**을 제공하는 API resource 로 상위 수준의 추상화 object. "원하는 상태"를 설명하면 Deployment controller 가 **제어된 속도**로 현재 상태를 원하는 상태로 조정한다(YAML/명령으로 원하는 상태를 전달하면 컨트롤러가 현재 상태와 계속 비교(matching)하다 다르면 맞춰 줌).
  - 이미지를 nginx 1.17 → 1.19 → 1.21 로 바꾸는 롤링 업데이트를 하면 Deployment 가 새 ReplicaSet 을 만들어 새 버전 Pod 를 그 RS 가 관리한다. 강사 조언: "단일 Pod 를 쓰더라도 replicas 1 짜리 Deployment 를 쓰면 언제든 관리 능력을 높일 수 있으니 나쁘지 않다."
- **Deployment 를 쓰는 이유 (슬라이드 7가지, 강사: 곧 실습 내용)**

| 슬라이드 항목 | 강사 설명 |
|---|---|
| ReplicaSet rollout 을 통해 Pod 복제본 및 Image 버전 관리 | 이미지 버전을 1.17 → 1.19 로 바꾸면 새 ReplicaSet 이 만들어지고 기존 RS 의 Pod 는 정리되며 새 버전으로 롤링 업데이트. **기존 RS 는 바로 삭제되지는 않는다** |
| Pod 의 지속적 상태 관리 (Desired state management) | 사용자가 원하는 상태를 계속 관리 |
| Workload(CPU, Memory usage) 기준 수동 및 자동 확장·축소 (HPA) | 접속량이 갑자기 늘면 `kubectl scale` 로 수동 조정하거나 HPA 로 자동화(HPA 는 마지막 클립) |
| Rolling update 를 통한 중단 없는 업데이트 | Pod 를 하나씩 교체하므로 중단 없는 업데이트 가능 |
| 다양한 배포 전략 제공, 전환 속도 제어 (strategy) | Recreate 와 RollingUpdate 두 가지. 블루-그린, 카나리 같은 기법도 배포 전략으로 구현 가능(언급) |
| 이전 버전으로 Rollback 지원 (revision) | 이전 버전 정보를 **etcd 에 보관**하므로 특정 revision 으로 롤백 가능 |
| 사용하지 않는 ReplicaSet 정리 | 슬라이드 항목으로만 표시(별도 실습 설명 없음) |

- **strategy.type** : `kubectl explain deployment.spec.strategy` — 'Recreate' 또는 'RollingUpdate'(기본값). **Recreate** 는 기존 Pod 를 모두 종료한 뒤 새 Pod 를 올리므로 그 사이 다운타임이 생길 수 있고, **RollingUpdate** 는 Pod 를 하나씩 교체해 중단 없는 업데이트(`rollingUpdate` 하위 옵션 2가지: maxSurge, maxUnavailable — Step 15). (Step 15 상세)
- **Deployment YAML 핵심 (슬라이드, 예 name: example-deployment)** : Pod 를 만들 때와 거의 같고 컨테이너·resources·Secret/ConfigMap·볼륨 같은 Pod 내용이 모두 `template` 영역에 들어간다.

| 필드 | 설명 |
|---|---|
| replicas | Pod 복제본 수 지정(샘플 3) |
| selector | Deployment 가 관리하는 Pod 선택기 — 어떤 label 의 Pod 를 선택해 관리할지(라벨로 Pod 그룹화) |
| template | 새 Pod 를 생성하는 데 사용되는 Pod template 정의. `template.metadata.labels` 는 Pod 에 적용할 라벨 값(**selector 와 맞아야 함**) |
| strategy | 배포 전략(기본 RollingUpdate). 비워 두면 `{}` 기본값 적용 |
| resources | CPU, Memory 사용량 제어. 넣지 않으면 CPU·메모리 제한 없음. **HPA 를 쓰려면 반드시 넣어야 함**(마지막 클립) |

  - 강사: "YAML 을 처음부터 끝까지 직접 써 보는 것을 우선 권장한다, 귀찮다고 생각하지 말라"면서도 현실적으로는 (1) `kubectl explain ... --recursive` 로 필드 확인, (2) `kubectl create deployment ... --dry-run=client -o yaml` 로 기본 YAML 을 뽑아 필요한 부분만 고치는 방법을 함께 쓴다. 강사 스스로도 많이 써서 익숙해진 것이지 일부러 외운 것은 아님. `kubectl create deployment --help` 로 Deployment 전용 도움말(예시/옵션)을 볼 수 있다.
- **LAB1 smoke test** : smoke test = 본격적인 테스트에 앞서 대상 환경이 기본적으로 동작하는지 가볍게 확인하는 테스트. 처음에 `python:3.2-slim` 으로 썼다가 `python:2.7-slim` 으로 다시 덮어 쓴 이유 — Python 의 **SimpleHTTPServer 모듈은 2.7 버전**에서 쓰기 때문(Python 3 에서는 `http.server` 모듈로 변경). `--dry-run=client` = 실제로 만들지 않고 클라이언트에서 만들 내용만 계산, `-o yaml` = YAML 출력, `> 파일명` = 저장. command 는 Pod 이름(hostname)이 들어간 index.html 을 만든 뒤 8000 포트로 웹 서비스. `get deploy,rs,po,svc` 로 조회하면 Deployment → RS → Pod 2개가 계층대로 보이는 것이 "빌딩 블록"이며(Pod 이름 = `<deploy>-<RS 해시>-<랜덤>`, RS 에는 `pod-template-hash` 라벨), Service(ClusterIP)는 로드 밸런싱하므로 curl 반복 시 두 Pod 이름이 번갈아 나온다.
  - **노드에서 컨테이너 확인(crictl)** : 이 클러스터는 Docker 가 아니라 **containerd** 런타임이므로 `docker ps` 대신 `crictl`(컨테이너 런타임 인터페이스용 CLI). 컨테이너 ID 로 `crictl inspect` → 호스트 기준 PID, 그 PID 의 `/proc` 디렉터리가 존재 = 컨테이너가 결국 호스트의 하나의 프로세스로 돌고 있다는 뜻. (화면의 WARN/ERRO 경고는 기본 endpoint 설정 관련이며 강사도 "에러 메시지는 무시".)
- **LAB2 Secret/ConfigMap 연동** : Pod 에서 배운 ConfigMap/Secret 사용법을 Deployment 에도 똑같이 적용 가능(Deployment 도 Pod 와 크게 다르지 않고 상위 구조만 더 있음). 요구: `MYSQL_USER`, `MYSQL_PASSWORD` 는 Secret, `DB_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE` 는 ConfigMap. 기본 틀은 `kubectl create deployment` 로 만들고 ConfigMap/Secret 연결 부분은 명령 옵션에 없으므로 직접 작성 — ConfigMap 3개 정보는 `envFrom/configMapRef` 로 통째로, Secret 은 `secretKeyRef` 로 key(user, userpwd)를 지정해 환경변수에 전달. Pod 의 상위 object 이므로 Pod 의 기능(ConfigMap, Secret 등)을 모두 그대로 사용 가능(이 실습의 포인트).
- **LAB3 이미지 업데이트 / rollout** : 변화를 눈으로 보려고 다른 터미널에서 `kubectl get po -w`(`--watch`) 로 Pod 생성·종료 흐름을 모니터링 권장. 이미지 정보는 `jsonpath` 나 `describe` 로 확인. 
  - `kubectl patch deploy msa-web -p '{"spec": {"minReadySeconds": 10}}'` = 업데이트 속도(시간) 조절(새 Pod 가 Ready 로 10초 버텨야 다음 단계 진행). 
  - `kubectl set image deploy <deployment 이름> <컨테이너이름>=<이미지>` — 컨테이너 이름이 `nginx` 인 이유는 `kubectl create deployment` 가 이미지 이름으로 컨테이너 이름을 정하기 때문(`nginx=nginx:1.19`). 이미지를 바꿀 때마다 revision 이 하나씩 증가(1: 1.17, 2: 1.19, 3: 1.21), 이력은 etcd 에 저장. 롤링 업데이트라 watch 터미널에서 Pod 가 하나씩 올라가고 내려가는 모습이 보임.
  - `rollout undo --to-revision 2` → 실제 출력 `deployment.apps/msa-web rolled back`. history 가 1, 3, 4 가 되는 이유(강사): "1, 2, 3 에서 2번으로 돌아가면 2번이 목록에서 빠지고, 그 내용이 새 revision 4번으로 적용된다." 4번을 조회하면 nginx:1.19.
  - `revisionHistoryLimit: 10` — 리비전 이력은 기본 최대 10개 보관(edit 화면에서 조정 가능), 같은 화면에 `strategy: rollingUpdate(maxSurge 25%, maxUnavailable 25%), type: RollingUpdate`. history 의 CHANGE-CAUSE 열은 기본 `<none>` — 변경 이유 코멘트는 `kubectl annotate ... kubernetes.io/change-cause="..."`(실제 변경 이유와 상관없이 간단히 코멘트를 달 때 annotation 사용).
  - **pause / resume** : 일시 정지 상태에서 `rollout undo` 는 오류 `error: you cannot rollback a paused deployment; resume it first with 'kubectl rollout resume' and try again`. 반면 `set image` 는 실행되어 jsonpath 로 nginx:1.23 으로 보이지만 **값은 변경되었지만 실제 적용은 대기 상태**(etcd 에 기록만 되어 있다가 resume 시 반영되어 Pod 가 움직임). 새 ReplicaSet 이 2개로 늘고 이전 RS 들은 0. 롤아웃을 잠시 멈추는 이유(변경 금지, 여러 변경을 모아 한 번에 적용 등)는 여러 가지이며 사용 제약은 없다.
- **LAB4 스케일링** : `kubectl scale deployment msa-web --replicas=6` → 새 Pod 생성, `--replicas=2` → 4개 Terminating 되고 처음 만든(오래된) Pod 2개가 남는다. 앞서 이미지 변경을 많이 해 ReplicaSet 이 많이 생겨 있고 이전 RS 는 Pod 0개 상태로 남아 있다. **수동 스케일링**이며 자동은 HPA. 모니터링하며 Pod 수를 조절해 워크로드를 조율하면 더 안정적인 시스템으로 갈 수 있다(강사).
- **LAB5 리소스 제한과 Probe** : 이전에 본 `resources: {}` 자리를 채우는 작업. requests.memory `256Mi` = 기본 요청량(초기값, 이만큼은 확보해 두고 스케줄링), requests.cpu `100m` = 초기 CPU 요청(1 CPU = 1000m(milliCPU) 이므로 0.1 CPU, 강사 표현 "10%"), limits.memory `512Mi` = 최대 메모리 허용량, limits.cpu `200m` = 최대 CPU 허용량(0.2 CPU, "20%", CPU 사용 시간 제어). 입문자 메모: requests 는 스케줄러가 노드를 고를 때의 "최소 보장량", limits 는 넘어설 수 없는 "최대 사용량"(requests 는 limits 보다 클 수 없음), 단위 m = milliCPU, Mi = 메비바이트.
  - Probe 를 Deployment 에도 붙일 수 있다: livenessProbe = HTTP GET `/` 포트 80, 시작 전 대기 15초(`initialDelaySeconds`), 10초마다(`periodSeconds`) 점검 / readinessProbe = 준비 상태 확인, `/` 포트 80, 대기 5초, 5초마다. 추가 후 `describe` 로 확인.
- 강사 마무리: 지금까지 본 다채로운 기능은 사실 Pod 를 위한 기능들이며, Pod 에 오케스트레이션 기능(복제, 롤링 업데이트, 롤백, 스케일링 등)을 붙이려면 **Deployment 가 가장 적합한 resource object**.

## [사용한 CLI]

### 14-1. LAB1: smoke test (dry-run → 수정 → apply → expose)
```bash
kubectl explain deployment.spec.strategy          # type: "Recreate" | "RollingUpdate"(기본), rollingUpdate 하위 옵션
kubectl create deployment --help                  # Deployment 생성 예시/옵션 도움말
mkdir deploy && cd $_
kubectl create deployment smoke-deploy --image=python:3.2-slim --port=8000 --dry-run=client -o yaml > smoke-deploy.yaml
# (자료: 이후 python:2.7-slim 으로 변경해 다시 생성 — SimpleHTTPServer 사용 목적)
kubectl create deployment smoke-deploy --image=python:2.7-slim --port=8000 --dry-run=client -o yaml > smoke-deploy.yaml
vi smoke-deploy.yaml
```
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: smoke-deploy
  name: smoke-deploy
spec:
  replicas: 2
  selector:
    matchLabels:
      app: smoke-deploy
  strategy: {}
  template:
    metadata:
      labels:
        app: smoke-deploy
    spec:
      containers:
      - image: python:2.7-slim
        name: smoke-container
        command: ["/bin/bash","-c","echo \"<h1>Smoke Test Deployment : $(hostname).</h1>\" > index.html; python -m SimpleHTTPServer 8000"]
        ports:
        - containerPort: 8000
```
```bash
kubectl apply -f smoke-deploy.yaml
kubectl expose deployment smoke-deploy --name=smoke-svc --port=8000 --target-port=8000
kubectl get deploy,rs,po,svc -o wide | grep smoke
curl <ClusterIP>:8000          # 반복 호출 시 두 Pod 의 hostname 이 번갈아 출력
```
컨테이너 런타임 레벨 확인(Pod 가 배치된 노드에서, containerd 환경이므로 docker ps 대신 crictl):
```bash
sudo crictl ps
sudo crictl inspect <컨테이너ID> | grep -i pid
sudo ls /proc/<PID>
```

### 14-2. LAB2: Secret/ConfigMap 연동 Deployment (mydb)
```bash
kubectl create secret generic mydb-secret \
--from-literal=user=kevin --from-literal=userpwd=<PASSWORD>

kubectl create configmap mydb-cnf \
--from-literal=dbhost="192.168.56.200" --from-literal=port=3306 \
--from-literal=dbname=fastcampus

kubectl get cm mydb-cnf
kubectl get secrets mydb-secret

kubectl create deployment mydb \
--image=dbgurum/k8s-lab:healthcheck-1.0 \
--port=8080 --replicas=2 --dry-run=client \
-o yaml > mydb.yaml
vi mydb.yaml
```
spec.template.spec.containers 부분:
```yaml
      containers:
      - image: dbgurum/k8s-lab:healthcheck-1.0
        name: k8s-lab
        ports:
        - containerPort: 8080
        envFrom:
        - configMapRef:
            name: mydb-cnf
        env:
        - name: MYSQL_USER
          valueFrom:
            secretKeyRef:
              name: mydb-secret
              key: user
        - name: MYSQL_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mydb-secret
              key: userpwd
```
```bash
kubectl apply -f mydb.yaml
kubectl get deploy,rs,po | grep mydb
# NodePort 로 노출했다고 가정(자료: 31886)
curl 192.168.56.101:31886      # HealthCheck : This is v1 running in pod ... (Pod 가 번갈아 응답)
```

### 14-3. LAB3: 이미지 업데이트 / revision / 롤백
```bash
kubectl create deployment msa-web --image=nginx:1.17 --port=80 --replicas=2
kubectl get deploy msa-web -o=jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'   # nginx:1.17
kubectl get deploy,rs,po -o wide | grep msa-web
kubectl describe po <pod명> | grep -i image:

# 다른 터미널에서 변화를 관찰
kubectl get po --watch

# minReadySeconds 설정 (Pod Ready 후 10초 유지해야 다음 단계 진행)
kubectl patch deploy msa-web -p '{"spec": {"minReadySeconds": 10}}'

kubectl rollout history deployment msa-web             # REVISION 1 CHANGE-CAUSE <none>

# 이미지 변경: kubectl set image deploy <deployment명> <컨테이너명>=<이미지>
kubectl set image deploy msa-web nginx=nginx:1.19
kubectl set image deploy msa-web nginx=nginx:1.21
kubectl rollout history deployment msa-web             # revision 1,2,3

# 특정 리비전으로 롤백
kubectl rollout undo deployment msa-web --to-revision 2
kubectl rollout history deployment msa-web             # 1,3,4 (2번이 4번으로 승격)
kubectl rollout history deployment msa-web --revision 4   # Pod Template 상세 (Image: nginx:1.19)
```
- 컨테이너 이름이 `nginx` 인 이유: `kubectl create deployment --image=nginx` 가 이미지 이름으로 컨테이너명을 지정하기 때문.

CHANGE-CAUSE 기록:
```bash
kubectl edit deployments.apps msa-web       # revisionHistoryLimit: 10, strategy RollingUpdate(maxSurge 25%, maxUnavailable 25%) 확인
kubectl annotate deployments.apps msa-web kubernetes.io/change-cause="new version"
kubectl rollout history deployment msa-web  # REVISION 4 CHANGE-CAUSE new version
```

일시정지 / 재개:
```bash
kubectl get po --watch                      # 터미널 1
kubectl rollout pause deployment msa-web    # 터미널 2
kubectl rollout undo deployment msa-web --to-revision 4
# error: you cannot rollback a paused deployment; resume it first with 'kubectl rollout resume' and try again
kubectl set image deploy msa-web nginx=nginx:1.23         # pause 중에도 spec 은 변경되지만 Pod 는 갱신되지 않음
kubectl get deploy msa-web -o=jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'   # nginx:1.23
kubectl rollout resume deployment msa-web                 # 이때 한꺼번에 반영 → 새 ReplicaSet 로 Pod 교체
kubectl get deploy,rs,po | grep msa-web
```

### 14-4. LAB4: 스케일링
```bash
kubectl get po --watch                                    # 터미널 1
kubectl scale deployment msa-web --replicas=6             # 터미널 2
kubectl get deploy,po | grep msa-web                      # 6/6
kubectl scale deployment msa-web --replicas=2
kubectl get deploy,po | grep msa-web                      # 2/2 (나머지 Pod Terminating)
```

### 14-5. LAB5: 리소스 제한과 Probe
```bash
kubectl edit deployments.apps msa-web
```
```yaml
        resources:
          limits:
            memory: "512Mi"    # 컨테이너 메모리 상한
            cpu: "200m"        # CPU 상한 (200 milliCPU = 0.2 CPU)
          requests:
            memory: "256Mi"    # 메모리 요청(최소 보장)
            cpu: "100m"        # CPU 요청
```
- 자료 실습에서 `resources: {}` 를 지우지 않고 limits 를 추가하다가 `error: deployments.apps "msa-web" is invalid / Edit cancelled, no valid changes were saved.` 발생(화면에서 `resources: {}` 줄이 남은 채 limits 가 추가되어 있었음, 강사의 최종 성공 여부는 확인 못함) → `resources: {}` 를 제거하고 limits/requests 를 올바른 들여쓰기로 작성하는 것이 일반적인 해결.

Probe 추가:
```yaml
        resources:
          limits:
            cpu: 200m
            memory: 512Mi
          requests:
            cpu: 200m
            memory: "256"
        livenessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 15
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 5
```
```bash
kubectl describe deployments.apps msa-web        # Limits/Requests/Liveness/Readiness 확인
```
- `initialDelaySeconds` : 시작 후 첫 검사까지 대기, `periodSeconds` : 검사 주기.

## [확인 방법/주의점]
- `kubectl get deploy,rs,po,svc -o wide` 로 Deployment/ReplicaSet/Pod/Service 연쇄 확인. Pod 이름 = `<deploy>-<RS해시>-<랜덤>`.
- `rollout undo` 로 되돌린 리비전은 새 번호로 다시 기록되고 이전 번호는 사라진다(2 → 4).
- pause 상태에서는 undo 불가(오류), `set image` 등 변경은 spec 에만 반영되고 resume 때 실제 적용.
- Pod 이름이 바뀌는 시점에 `describe po <옛 Pod>` 는 NotFound 가 될 수 있다 — 슬라이드의 Pod 이름을 그대로 복사해 쓰면 `Error from server (NotFound): pods "msa-web-8bd6f7bbc-ttpmk" not found`. `kubectl get deploy,rs,po -o wide | grep msa-web` 로 실제 Pod 이름(예: msa-web-8bd6f7bbc-5nn4l)을 확인한 뒤 사용(강사: "이름을 잘못 썼네요. 복사하다 보니").
- **LAB5 `kubectl edit` 저장 실패(실제 장면)** : `error: deployments.apps "msa-web" is invalid` / `Edit cancelled, no valid changes were saved.`(변경 사본은 `/tmp/kubectl-edit-...yaml` 에 저장). 강사도 "반영이 안 됐네요, 어딘가 오타가 있나 봐요"라며 들여쓰기·구조를 다시 확인했고 limits/requests 순서는 상관없다고 짚음. 화면의 vi 에서는 `resources: {}` 줄이 남은 채 그 아래 limits 가 추가된 모습이 보임 → `kubectl edit` 는 YAML 검증 실패 시 변경이 취소되므로 들여쓰기·필드 구조를 정확히 맞춰야 한다(`resources: {}` 를 제거하고 작성하는 것이 일반적인 해결이나, 강사의 최종 재시도 성공 여부는 영상 화면에서 확인하지 못했다).
- Probe 슬라이드(36)의 requests 는 `cpu: 200m`, `memory: "256"` 로 슬라이드 34 의 값(`100m`/`256Mi`)과 다르게 적혀 있으며 화면 그대로 옮긴 것(단위 없는 "256" 은 바이트로 해석되므로 실제로는 `256Mi` 로 쓰는 것이 의도로 보이나 자료에는 이렇게 표기).
- LAB2 의 expose 명령과 NodePort 지정 방식은 화면에 일부만 나와 정확한 옵션은 판독 불가(슬라이드 표시 `80:31886/TCP`). mydb.yaml 슬라이드는 하단이 잘려 metadata/spec 윗부분이 일부만 보임. command 줄 일부는 vi 검색 강조 표시로 가려져 있으나 위 내용으로 판독.
- 모니터링 팁: `kubectl get po -w` 를 다른 터미널에 띄워 두고 변경(rollout/scale)을 관찰.

---

# Step 15. Deployment 배포 전략

## [목적]
Recreate 와 RollingUpdate 전략의 차이를 이해하고 `maxSurge`/`maxUnavailable` 로 롤링 업데이트 속도·가용성을 조절한다.

## [이론 설명]
> 원본: 챕터 09 Clip 3 (약 17분, 슬라이드 + 터미널). 학습 목표: 배포 전략(strategy)이 "이전 버전에서 새 버전으로 바뀌는 방식"을 결정함을 설명, Recreate vs RollingUpdate 차이(다운타임 유무·장단점)와 Blue/Green·Canary·A/B test 개념 구분, maxSurge/maxUnavailable 이 롤링 속도·가용성에 미치는 영향, edit / set image / rollout status·history·undo / describe 로 전략 변경과 진행 확인.

- **배포 전략이란** : 슬라이드 — 일반적으로 배포 전략에 따라 애플리케이션이 **이전 버전에서 최신 버전으로 업데이트되는 방식**이 결정된다. 일부 전략은 다운타임을 포함하고 일부는 테스트 개념을 도입해 사용자 분석을 가능하게 한다. 소개하는 기본 전략은 **Recreate, RollingUpdate(default)**. 트래픽 흐름을 다양한 방식으로 제어하는 "**고급 배포 전략**"으로 Blue/Green, Canary, A/B test 가 있다(Deployment 만으로 직접 지원하는 것은 Recreate/RollingUpdate 이며 고급 전략은 개념 비교 — 강사는 따로 분류해서 다룰 내용이라고 함). V1 → V2 는 "애플리케이션 내부 소스가 바뀌면서 버전이 바뀔 수 있는데 그것은 이미지 변경 얘기"(강사).
- **Canary(카나리) 유래** : 광산에 카나리 새를 데려가면 새가 유해 가스에 사람보다 먼저 반응해 미리 위험을 알 수 있다는 이야기에서 "미리 검증해 본다"는 뜻으로 이름이 붙은 것 같다(강사). 비율을 정해 일부만 신규 버전으로 돌려 보는 방식 — 예: 10개 중 90% 는 이전 버전, 10% 만 신규 버전으로 돌려 보고 잘 동작하면 비율을 점점 올린다. 이처럼 테스트(분석) 개념과 함께 반영하는 전략이 Canary / A/B test 계열.
- **배포 전략 비교표 (슬라이드)**

| 배포전략 | 설명 | 장점 | 단점 | 롤백 |
|---|---|---|---|---|
| Blue/Green | 구/신버전이 동일 환경에 있고 트래픽 라우팅만 신버전으로 교체 | 신버전 검증도 향상과 신속한 전환 속도 | 구/신버전 공존으로 비용 증가 | 라우팅을 구버전으로 전환 |
| RollingUpdate | 구버전 수는 점차 줄이고 신버전 수를 점차 늘려 교체 | 비용 절감 | 신버전 검증 수준 저하와 전환에 보다 시간 소요 | `kubectl rollout undo` 또는 `kubectl set image` 사용 |
| Canary | 일부 트래픽만 신버전으로 연결하여 신버전 테스트 | 신버전 미리 검증 | 신버전 문제 시 서비스 장애 발생 가능 | canary 버전 Pod 제거 |

  - RollingUpdate: 구버전을 조금씩 줄이고 신버전을 조금씩 늘리므로 서비스 연결이 지속되어 사용자에게는 다운타임이 없는 것처럼 보인다. Blue/Green: 구버전(Blue)과 신버전(Green) 환경을 각각 두고 라우팅만 신버전으로 돌리며, 검증 중 문제가 생기면 라우팅을 곧바로 Blue 로 되돌려 서비스 지속성 유지. Canary: 테스트 형태의 검증(분석)을 거쳐 문제가 없을 때 완전히 올림.
- **Recreate 전략** : `explain` 의 enum 설명 — "Recreate: Kill all existing pods before creating new ones." 이전 버전이 다운된 시점부터 새 Pod 가 성공적으로 시작되어 사용자 요청을 처리하기 시작할 때까지 **일정 시간의 다운타임**이 있다. 개발 환경이나, 사용자가 장기간의 성능 저하·오류보다 짧은 가동 중지 시간을 선호하는 경우, 또는 **구·신 버전을 동시에 사용할 수 없는 경우**에 쓴다. 장점: 설정이 간단(옵션 거의 없이 `type: Recreate` 한 줄)하고 애플리케이션 상태가 완전히 교체되어 완전히 업데이트됨(RollingUpdate 는 문제 시 되돌려야 하지만 Recreate 는 한 번에 완전한 업데이트). 운영 환경은 고가용성 때문에 누구도 다운타임을 원하지 않으므로 보통 개발 환경에서 "싹 다 내리고 싹 다 올리는" 방식으로 쓴다. 현재 Pod 가 10개면 10개를 모두 내리고 10개를 새로 올린다.
- **RollingUpdate 전략** : 실행 중인 Pod 를 새 버전으로 업데이트하는 전략으로 **가동 중지 시간을 줄이기 위해** 설계, 모든 노드가 새 버전으로 점진적 업데이트. 장점: 상대적으로 롤백하기 쉽고 배포를 재생성하는 것보다 덜 위험하며 구현하기 쉬움. 단점: 속도가 느릴 수 있고 문제 발생 시 이전 버전으로 롤백되며, **애플리케이션에 여러 버전이 동시에 병렬로 실행될 수 있음**. "정해진 비율만큼의 Pod 만 점진적으로 배포"하며 비율은 숫자(개수)나 퍼센트로 지정. 강사: 가용성 문제를 생각하면 점진적 업데이트가 훨씬 유리할 수 있다.
- **RollingUpdate 파라미터**

| 항목 | 슬라이드 설명 | 기본값 |
|---|---|---|
| maxSurge | 롤링 업데이트를 위해 **최대로 생성할 수 있는 Pod 수**. %/개수 단위. 높게 설정하면 롤링 배포를 빠르게 적용 가능 | 25% |
| maxUnavailable | 롤링 업데이트 중 **최대로 삭제할 Pod 수**. %/개수 단위. 높게 설정하면 빠르게 적용 가능. 단, 높게 설정 시 **트래픽이 남은 소수의 Pod 로 집중되어 성능 문제 유발 가능** | 25% |

  - 예(슬라이드): replicas 10, maxSurge 3, maxUnavailable 1 → "10개 복제본을 유지하되, 한 번에 최대 3개를 더 만들고, 롤아웃 중 1개는 사용할 수 없게(내려가게) 한다"(→ 최대 13개까지 존재, 최소 9개 가용). maxUnavailable 을 90% 로 잡으면 90% 를 없애고 10% 만 남아 서비스는 유지되지만 남은 10% 에 트래픽이 집중된다. 강사: 두 값을 운영 중인 애플리케이션과 Pod 개수에 맞게 조율해 최적의 비율·개수를 찾는 것이 중요. strategy 를 한 번도 지정하지 않았는데도 edit 화면에 `RollingUpdate` 와 기본값 `maxSurge 25%`, `maxUnavailable 25%` 가 들어 있다.
  - **전략 값은 `create` 옵션으로 지정하는 것이 아니라 `kubectl edit` 로 직접 들어가 수정**해야 한다(강사). 개수로 잡아도 비율로 잡아도 상관없고, Pod 생성 중에 전략을 바꾸는 것은 Deployment 설정의 일이라 전혀 문제 없다.
- **진행 확인** : `kubectl rollout status deployment <이름>` = 롤아웃 상태(예: `5 of 10 updated replicas are available...`). `set image` 의 `nginx=nginx:1.23` 은 "컨테이너 이름=이미지" 형식(이 Deployment 의 컨테이너 이름이 nginx). rollout status 또는 다른 터미널의 `kubectl get po --watch` 로 "3개 돌리고 하나 죽인다"는 설정이 반영되는 것을 확인. `describe` 의 `RollingUpdateStrategy: 1 max unavailable, 3 max surge` 와 Events(deployment-controller 의 ScalingReplicaSet — 새 RS 가 3 → 4 → 5 → 6…, 이전 RS 가 9 → 8 → 7… 로 교차).
- **rollout undo** : `--revision`/`--to-revision` 없이 undo 하면 리비전을 고르지 않고 **바로 직전 리비전**으로 되돌린다(처음 버전이 아니라). 이 실습은 변경이 한 번뿐이라 결과적으로 처음 버전(1.21)과 같다. 특정 리비전은 `--to-revision`(앞 클립에서 사용, 이 영상에는 나오지 않음).
- **Recreate 로 바꾸기(LAB2)** : `kubectl edit` 로 strategy 아래 `rollingUpdate`(maxSurge, maxUnavailable 세 줄 — rollingUpdate 키와 두 옵션)를 **모두 지우고** `type: Recreate` 만 남긴다. 이어 `set image ... nginx=nginx:1.25` 후 `rollout status` — RollingUpdate 와 달리 `0 out of 10 new replicas have been updated` / `0 of 10 updated replicas are available` 에서 시작해 1, 2, … 9 로 올라간다(기존 Pod 가 먼저 전부 없어진 뒤 새 Pod 가 올라오기 때문). `describe` 에서 `StrategyType: Recreate` 확인.

## [사용한 CLI]
```bash
kubectl explain deployment.spec.strategy.type
# Type of deployment. Can be "Recreate" or "RollingUpdate". Default is RollingUpdate.
#  - "Recreate": Kill all existing pods before creating new ones.
#  - "RollingUpdate": Replace the old ReplicaSets by new one using rolling update ...
```

### 15-1. LAB1: RollingUpdate (replicas 10, maxSurge 3, maxUnavailable 1)
```bash
kubectl delete deployments.apps msa-web          # 이전 클립의 msa-web 정리 (실습 화면 순서)
kubectl create deployment msa-web --image=nginx:1.21 --port=80 --replicas=1
kubectl edit deployments.apps msa-web
```
```yaml
spec:
  progressDeadlineSeconds: 600
  replicas: 10
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      app: msa-web
  strategy:
    rollingUpdate:
      maxSurge: 3
      maxUnavailable: 1
    type: RollingUpdate
```
```bash
kubectl rollout history deployment msa-web
kubectl rollout status deployment msa-web              # 5 of 10 updated replicas are available... 반복 후 완료

# 이미지 변경하여 롤링 업데이트 관찰
kubectl set image deploy msa-web nginx=nginx:1.23
kubectl rollout status deployment msa-web
kubectl get po --watch                                 # 다른 터미널: Pod 가 3개 추가/1개 제거 단위로 교체
kubectl describe deployments.apps msa-web
# Replicas: 10 desired | 10 updated | 10 total | 10 available | 0 unavailable
# StrategyType: RollingUpdate
# RollingUpdateStrategy: 1 max unavailable, 3 max surge
# Events: ScalingReplicaSet (신규 RS 3→4→5→6... / 구 RS 9→8→7... 로 교차)

# 롤백
kubectl rollout undo deployment msa-web
kubectl rollout status deployment msa-web
kubectl rollout history deployment msa-web --revision 3     # Image: nginx:1.21 확인
```
- `kubectl edit` 이 `Edit cancelled, no changes made.` 로 끝났다면 저장 안 됨 → 자료에서는 삭제 후 재생성하여 다시 편집.
- `--revision N` 으로 해당 리비전의 Pod Template(Image 등)을 확인한 뒤 `--to-revision N` 으로 되돌릴 수 있다. 옵션 없이 undo 하면 직전 버전으로.

### 15-2. LAB2: Recreate
```bash
kubectl edit deployments.apps msa-web
```
```yaml
spec:
  progressDeadlineSeconds: 600
  replicas: 10
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      app: msa-web
  strategy:
    type: Recreate          # rollingUpdate 블록(maxSurge/maxUnavailable)은 삭제해야 함
```
```bash
kubectl set image deploy msa-web nginx=nginx:1.25
kubectl rollout status deployment msa-web
# 0 out of 10 new replicas have been updated... → 0 of 10 → 1 of 10 → ... → 9 of 10 → successfully rolled out
kubectl describe deployments.apps msa-web              # StrategyType: Recreate
```

## [확인 방법/주의점]
- Recreate 에서는 `rollout status` 가 0부터 시작(기존 Pod 전부 종료 후 새 Pod 생성)하며 그 사이 서비스 중단.
- Recreate 로 바꿀 때 `rollingUpdate`(maxSurge/maxUnavailable) 블록을 제거하고 `type: Recreate` 만 둔다(강사 순서). 블록을 남겨 두면 검증 오류가 날 수 있음(일반 동작 보충).
- `kubectl describe` 의 Events(deployment-controller) 로 ReplicaSet 증감 확인.
- **실습 중 상황** : 화면에서 `kubectl edit` 이 `Edit cancelled, no changes made.` 로 취소된 뒤 `kubectl delete deployments.apps msa-web` → `kubectl create deployment msa-web --image=nginx:1.21 --port=80 --replicas=1` 로 새로 만들어 다시 edit 했다(리비전은 1 하나). replicas 를 10으로 늘리면서 Pod 가 생성되는 중에 `rollout status` 가 `5 of 10 ...`, `6 of 10 ...` 로 출력.
- 슬라이드의 `rollout status` 예시 출력(`9 out of 10 new replicas have been updated`, `3 old replicas are pending termination`, ..., `successfully rolled out`)과 `rollout history --revision 3` 의 Pod Template(Image nginx:1.21, `pod-template-hash`)은 슬라이드 예시이며 실제 출력은 해시가 다르다.
- 영상 마지막은 빈 터미널이며 Recreate 로 바꿔 `rollout status` 로 모니터링하는 실습은 수강생 몫으로 남겼다. Blue/Green·Canary·A/B 는 개념 비교만 하고 실습은 하지 않았다.

---

# Step 16. StatefulSet 활용

## [목적]
상태를 가지는 애플리케이션을 위해 고유한 Pod 이름/순서/전용 스토리지를 보장하는 StatefulSet 을 Headless Service 및 volumeClaimTemplates(동적 PV)와 함께 구성하고, scale 시 PV/PVC 동작을 확인한다.

## [이론 설명]
> 원본: 챕터 09 Clip 4 (약 21분, 개념 설명 + LAB1 + EKS 데모). 학습 목표: Deployment 와 StatefulSet 의 차이(이름 규칙, 생성·삭제 순서, 상태 저장), StatefulSet 구성 3요소(StatefulSet 본체, volumeClaimTemplates, Headless Service), 스케일 아웃/인 시 Pod 와 PV/PVC 가 어떻게 만들어지고 유지되는지.

- **Stateless vs Stateful** : StatefulSet = 이름 그대로 **상태(state)를 저장**해야 하는 애플리케이션을 관리하는 workload 리소스(short name `sts`). Deployment 는 상태가 없는(Stateless) 애플리케이션 배포용, DB 처럼 상태가 필요한 경우(Stateful)는 StatefulSet. DB 외에 **세션 저장처럼 애플리케이션 수준에서 상태 기능이 필요한 경우**에도 사용(강사). Pod 로 배포한다는 점은 Deployment 와 같다.
- **Pod 이름과 생성·삭제 순서 (슬라이드 52)**
  - Deployment 의 Pod 이름은 `deploy-nginx-5s8km` 처럼 뒤에 무작위 해시, StatefulSet 의 Pod 는 `pod-0, pod-1, pod-2` 처럼 **순서 번호**와 **안정적인 네트워크 ID** 가 할당된다.
  - Pod 는 **오름차순(0, 1, 2, 3)** 으로 생성되며 다음 Pod 는 이전 Pod 가 준비(Ready)되어 실행 상태가 된 뒤에야 만들어진다. 삭제는 반대로 **큰 번호부터**(3, 2, 1). 이 기본 정책이 **OrderedReady**. 예: replicas 3 으로 요청했는데 1번 Pod 에 문제가 생기면 2번 Pod 는 1번이 정상으로 돌아올 때까지 대기.
  - `spec.podManagementPolicy: "Parallel"` 로 바꾸면 Pod 를 순서 없이 **병렬**로 실행/종료할 수 있다(기본값은 Parallel 이 아니라 OrderedReady). 옵션은 `kubectl explain statefulset.spec.podManagementPolicy`.
- **StatefulSet 의 특징 (슬라이드 53)**
  - 각 Pod 는 동일한 spec 으로 생성되지만 **서로 교체할 수 없다.** re-scheduling(재배치) 되어도 **동일한 식별자를 유지** — sts-0-pod 를 지워도 같은 이름으로 다시 만들어지고 볼륨도 그 볼륨을 그대로 사용(그래야 "상태 저장"이라는 이름에 맞음).
  - 서버·클라이언트 같은 애플리케이션에서 쓸 데이터를 **영구 볼륨(PV)** 에 저장. 전제 조건은 **StorageClass 를 사용하는 PVC(동적 볼륨)**. 강사: 일반 Pod 에 볼륨을 붙이는 것은 데이터 저장일 뿐 "상태 저장"이라 보기 어렵다. 이 환경에는 openebs 프로비저너가 있으므로 PVC 만 연결하면 PV 가 자동 생성.
  - **스케일 시 PV/PVC 동작**

| 상황 | 동작 | 이유(강사) |
|---|---|---|
| 복제본 증가(scale out) | PV/PVC 자동 생성 | Pod 마다 자기 볼륨이 필요 |
| 복제본 축소(scale in) | 사용했던 PV/PVC 는 **삭제되지 않고 유지** | 스토리지는 고유한 상태를 유지해야 하는데 scale 로 삭제되면 상태 데이터도 같이 삭제되기 때문 |

  필요 없는 볼륨은 직접 `kubectl delete pvc` 로 지우면 되고 그 PVC 로 생성된 PV 도 함께 삭제된다(강사; StorageClass 기본 reclaim policy Delete 기준).
- **Headless Service (슬라이드 54)** : StatefulSet 은 Headless Service 를 사용해야 한다 — Service 를 통해 부하 분산하는 것이 아니라 **논리적으로 Pod 집합을 묶어 주는** Service 만 있으면 되기 때문. Headless = clusterIP 가 없는 Service(Service 를 만들면 기본은 ClusterIP 가 생성되지만 `clusterIP: None` 으로 지정하면 IP 를 주지 않고 Pod 그룹화 역할만). IP 가 없어도 Pod 와 Service 는 쿠버네티스 DNS 에 등록되므로 `nslookup` 으로 Pod 주소를 확인하고 연결 가능(슬라이드 그림: Service DNS `redis`, Pod `redis-0.redis`, `redis-1.redis`, `redis-2.redis`). 참고: kubernetes.io/docs/concepts/workloads/controllers/statefulset/ — 강사도 문법이 복잡한 부분은 공식 문서가 가장 정확하다고 권함.
- **StatefulSet 구성 3요소** : (1) StatefulSet 본체 (2) StorageClass 를 쓰는 PVC(`volumeClaimTemplates`) (3) Pod 를 그룹화하는 Headless Service.
- **LAB1 visit-cnt-stfs (방문 횟수 기록)** : 서비스 시작 이후 방문 횟수는 저장되어야 하는 상태이므로 StatefulSet 예제로 적합. 매니페스트: Service(헤드리스, `clusterIP: None` 으로 IP 생성을 막고 Pod 두 개를 그룹화하는 역할만), StatefulSet 본체(내용은 Deployment 와 거의 같고 다른 점은 `serviceName: visit-cnt-stfs-svc` 와 `replicas: 2`), `volumeClaimTemplates`(별도로 PVC 를 만들지 않고 이 템플릿만 있으면 StorageClass 에 의해 동적으로 PV 생성, `storageClassName: "openebs-hostpath"`). StorageClass `openebs-hostpath` 는 `WaitForFirstConsumer` 모드(PVC 요청이 들어오면 그때 PV 생성, 강사 설명).
  - **type 을 지정하지 않는 이유** : VM 환경에서는 LoadBalancer 를 쓸 수 없고 사용 가능한 것은 ClusterIP 와 NodePort 뿐인데 **NodePort 는 ClusterIP 를 동반**하므로 headless 와 맞지 않는다 → `clusterIP: None` 만 주고 type 은 지정하지 않음. 클라우드에서는 LoadBalancer 를 붙여도 headless 와 상관없다(외부에서 들어올 때만 쓰는 용도).
  - 관찰: apply 직후 Pod 는 ContainerCreating(0/2), PVC 는 Pending → 볼륨이 만들어지며 Bound. Pod 2개이므로 PVC 2개와 StorageClass 에 의한 PV 2개. Pod 이름 `visit-cnt-stfs-0/-1`, PVC 이름 `data-visit-cnt-stfs-0/-1`(= volumeClaimTemplates 이름 `data` + Pod 이름).
  - **scale out** : Deployment 라면 4개를 동시에 띄우지만 StatefulSet 은 2번을 먼저 만들고 준비되면 3번을 만드는 순차 방식(Pending → ContainerCreating → Running; Pending 인 이유는 볼륨이 먼저 만들어져야 하기 때문). **scale in** : 생성은 0,1,2,3 순서 / 삭제는 3,2,1 역순으로 하나씩. 그런데 PV/PVC 는 Pod 가 사라져도 4개가 그대로 유지("Pod 는 2개지만, PV/PVC 는 4개 유지", 슬라이드 58). 이후 다시 scale out 하면 기존 볼륨과 데이터를 그대로 사용 — 강사가 2개 삭제 후 4개, 5개로 다시 올려 보는 확인 실습 권장.
- **[Demo] EKS (슬라이드 59~62)** : VM 실습 환경에는 외부 접속 수단이 없어 웹으로 방문 기록 확인이 어려우므로 EKS 에서 테스트한 내용을 데모로 설명. EKS 에도 StorageClass 가 필요하므로 openebs 를 설치하고, 같은 코드에서 Service 에 `type: LoadBalancer` 만 추가(NodePort 는 ClusterIP 를 동반해야 해 headless 와 함께 쓸 수 없지만 LoadBalancer 는 headless 와 상관없이 사용 가능 — 강사). 적용 결과: replicas 2 라 Pod 와 PVC 가 2개씩, EXTERNAL-IP(ELB 주소) 생성. 8080 포트로 접속하면 LoadBalancer → 노드 포트 → Service 에 연결된 Pod. 테스트: 처음 브라우저 접속 시 데이터가 없어 "No data posted yet."(예: "You've hit visit-cnt-stfs-1"), `curl -X POST -d "..." <주소>:8080` 으로 방문 기록 저장(응답 "Data stored on pod visit-cnt-stfs-0"), 새로고침하면 저장된 내용(kevin-1, kevin-3 등) 표시. EKS 에서도 같은 scale 실습.
  - **reclaimPolicy (강사 설명)** : openebs StorageClass 의 기본 reclaim policy 는 **Delete**(선택지 Retain/Delete). 슬라이드 주석 — Pod 삭제 시 자동으로 Pod 가 생성되면서 기존 볼륨(PVC)과 다시 연결되려면(`kubectl delete po visit-cnt-stfs-2`) "단, storageClass 의 회수정책이 **Retain** 이어야 함". Retain 으로 바꾸지 않으면 StatefulSet 의 의미가 사라진다. 이 부분은 강사가 화면으로 보여 주지 않았고 EKS 가 있으면 직접 테스트해 보라고 권했다. Reclaim policy = PVC 삭제 후 PV 처리(Delete: PV 도 삭제, Retain: PV·데이터 보존).

## [사용한 CLI]

### 16-1. 선행: StorageClass (Step 5 의 openebs-hostpath)
```bash
kubectl get sc
kubectl explain statefulset.spec.podManagementPolicy   # OrderedReady(기본) / Parallel 설명 확인
```

### 16-2. visit-cnt-stfs.yaml (Service + StatefulSet)
```bash
cd LABs/
mkdir sts && cd $_
vi visit-cnt-stfs.yaml
```
```yaml
apiVersion: v1
kind: Service
metadata:
  name: visit-cnt-stfs-svc
  labels:
    app: visit-cnt-stfs
spec:
  ports:
  - port: 8080
    protocol: TCP
  selector:
    app: visit-cnt-stfs
  clusterIP: None       # headless
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: visit-cnt-stfs
spec:
  selector:
    matchLabels:
      app: visit-cnt-stfs
  serviceName: visit-cnt-stfs-svc
  replicas: 2
  template:
    metadata:
      labels:
        app: visit-cnt-stfs
    spec:
      containers:
      - name: stfs-container
        image: dbgurum/mynode:fc.stfs
        ports:
        - name: http
          containerPort: 8080
        volumeMounts:
        - name: data
          mountPath: /var/data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      resources:
        requests:
          storage: 1Gi
      accessModes:
      - ReadWriteOnce
      storageClassName: "openebs-hostpath"
```
```bash
kubectl apply -f visit-cnt-stfs.yaml
kubectl get sts,po,svc -o wide | grep visit      # visit-cnt-stfs-0, -1 (순서대로 생성), Service CLUSTER-IP None
kubectl get pv,pvc | grep visit                  # data-visit-cnt-stfs-0/-1 Bound (openebs-hostpath)
```
- VM(온프레미스) 환경에서는 Service type 을 LoadBalancer 로 쓸 수 없으므로 headless(ClusterIP None) 사용. 처음 apply 직후 Pod 는 ContainerCreating, PVC 는 Pending → Bound(WaitForFirstConsumer).

### 16-3. Scale out / in
```bash
kubectl scale sts visit-cnt-stfs --replicas 4
kubectl get sts,po,svc -o wide | grep visit      # -2, -3 순차 생성 (Pending → ContainerCreating → Running)
kubectl get pv,pvc | grep visit                  # PV/PVC 4개

kubectl scale sts visit-cnt-stfs --replicas 2
kubectl get sts,po,svc -o wide | grep visit      # -3 → -2 순서로 Terminating
kubectl get pv,pvc | grep visit                  # Pod 는 2개, PV/PVC 는 4개 그대로
# 불필요한 볼륨은 직접 삭제 (StorageClass reclaim policy Delete 이면 PV 도 함께 삭제됨)
kubectl delete pvc <pvc명>                       # 예: data-visit-cnt-stfs-3
```

### 16-4. [Demo] EKS 에서 StatefulSet
```bash
# EKS 에 StorageClass 용 openebs 설치
kubectl apply -f https://openebs.github.io/charts/openebs-operator-lite.yaml
kubectl apply -f https://openebs.github.io/charts/openebs-lite-sc.yaml
vi visit-cnt-stfs.yaml           # Service 의 type 을 LoadBalancer 로 (headless 설정 변경)

kubectl apply -f visit-cnt-stfs.yaml
kubectl get pv,pvc
kubectl get sts,po,svc -o wide | grep visit      # EXTERNAL-IP(ELB 주소), 8080:31756/TCP

# 데이터 저장 테스트 (POST). 응답: Data stored on pod visit-cnt-stfs-0 등
curl -X POST -d "hi, my name is kevin-1" <ELB주소>:8080
curl -X POST -d "hi, my name is kevin-2" <ELB주소>:8080
curl -X POST -d "hi, my name is kevin-3" <ELB주소>:8080

# 스케일 변화와 데이터 유지 확인
kubectl scale sts visit-cnt-stfs --replicas 4
kubectl get sts,po,svc -o wide | grep visit
kubectl scale sts visit-cnt-stfs --replicas 1
kubectl get sts,po,svc -o wide | grep visit
# Pod 를 줄여도 해당 Pod 의 데이터(PVC)는 남아 있음
kubectl delete po visit-cnt-stfs-2
```
- 자료 메모: openebs StorageClass 의 reclaim policy 는 Delete(Retain 으로 바꾸려면 StorageClass 변경) — 자료는 Retain 이 StatefulSet 에 더 적합하다는 취지로 언급. Reclaim policy 는 PVC 삭제 시 PV 처리(Delete: PV 삭제, Retain: PV 보존).

## [확인 방법/주의점]
- Pod 이름이 순번(`-0`,`-1`)이고 PVC 이름이 `data-<pod명>` 인지 확인.
- 축소해도 PV/PVC 는 지워지지 않음 → 불필요하면 `kubectl delete pvc` 로 직접 정리.
- Headless Service 는 `clusterIP: None` 이므로 `kubectl get svc` 에서 CLUSTER-IP 가 None.
- 이 실습의 StorageClass 확인 화면(`kubectl get sc`)은 영상에서 보이지 않아 강사 설명만 기록(WaitForFirstConsumer). 슬라이드 58 과 터미널의 PV 이름(`pvc-...`)은 서로 다른 실행 결과.
- 스케일 인 직후 `kubectl get sts,po,svc` 에서 `pod/visit-cnt-stfs-3` 이 Terminating(STATUS 4/2 표시)인 것이 정상.
- EKS 데모 주의: 슬라이드는 "Service 부분은 VM 실습과 같고 type: LoadBalancer 추가"라고 했으나 적용 출력에는 CLUSTER-IP 가 실제 IP(10.100.x.x)로 표시되어 있어(headless 가 아님) 슬라이드 YAML 에서 `clusterIP: None` 의 유지 여부는 화면만으로 불확실. 강사는 "LoadBalancer 는 headless 와 상관없이 쓸 수 있다"고만 설명.
- StatefulSet 의 데이터 보존이 의미를 가지려면 StorageClass 의 reclaim policy 가 Retain 이어야 한다는 슬라이드 주석(openebs 기본 Delete) — 실습에서 직접 보여 주지 않았음.

---

# Step 17. DaemonSet 활용

## [목적]
모든(또는 선택한) 노드에 Pod 를 1개씩 배치하는 DaemonSet 을 구성하고, control-plane taint 와 toleration, 노드 label + nodeSelector 로 배치 대상을 제어한다.

## [이론 설명]
> 원본: 챕터 09 Clip 5 (약 12분 28초, 슬라이드 64~71 + 터미널). 학습 목표: DaemonSet 이 무엇이고 Deployment 와 어떻게 다른지(replicas 없음, 노드당 Pod 1개), 업데이트 전략(RollingUpdate, OnDelete)과 배포 대상 노드를 정하는 3가지 시나리오(모든 노드 / taint 노드 제외 / nodeSelector), `kubectl get ds -A`, `kubectl label nodes` 로 조회·라벨 기반 배포.

- **DaemonSet (슬라이드 64)** : 이름 그대로 데몬(백그라운드 프로세스) 역할의 리소스. 기본 구성(YAML)은 Deployment 와 거의 같지만 **replicas 옵션이 없다** — 노드당 Pod 1개를 배포하는 **노드 단위 배포**이기 때문. 노드의 백그라운드에서 항상 Pod 를 데몬으로 실행할 수 있게 해 주는 workload resources. 모든 노드(또는 특정 노드)에서 백그라운드로 항상 실행되어야 하는 업무 — **모니터링 시스템, 로그 수집 에이전트, 노드 데이터 백업** 같은 장기간 지속되는 작업에 적합. Prometheus 같은 모니터링 도구의 exporter 를 DaemonSet 으로 배치. 강사: 용도 중 **로그 수집이 가장 많고**, 백업처럼 오래 지속되는 작업을 Pod 가 수행하게 할 때도 사용. 노드가 추가되면 자동으로 Pod 가 생기고 제거되면 정리(일반 동작 보충).
- **클러스터의 기존 DaemonSet (`kubectl get ds -A`, ds = daemonsets, -A = 모든 네임스페이스)** : kube-system `calico-node` 4/4/4, `kube-proxy` 4/4/4, metallb-system `speaker` 4/4/4, monitoring `node-exporter` 3/3/3, openebs `openebs-ndm` 3/3/3, `openebs-ndm-node-exporter` 3/3/3 (슬라이드 67 에는 default 네임스페이스의 `kubeshark-worker-daemon-set` 도 표시). 강사: calico 와 kube-proxy 는 워커 노드와 control-plane 까지 노드 4대에 하나씩 붙어 있고, metallb speaker, Prometheus 쪽 node-exporter, openebs 관련 항목도 DaemonSet 으로 배치 → 이미 모니터링 도구들이 DaemonSet 으로 배포되어 있다. (4개 vs 3개의 차이는 control-plane 포함 여부이며 toleration 유무로 인한 것으로 보인다 — 자료에 직접 설명은 없음.)
- **업데이트 전략 (슬라이드 65)** : 기본은 **RollingUpdate**(또는 OnDelete). StatefulSet 과 마찬가지로 기본은 롤링 업데이트이며, Deployment 에는 Recreate 전략이 하나 더 있었다는 점이 다르다. **OnDelete** = 이전 데몬이 종료된 경우에만 교체(수동 삭제 등으로 해당 노드의 데몬이 사라져야 새 DaemonSet Pod 로 교체), **RollingUpdate** = 롤링을 사용해 이전 데몬을 새 데몬으로 교체.
- **배포 대상 노드 — 3가지 시나리오** : DaemonSet 의 기본 전제는 '모든 노드에 Pod 를 배포'. 

| 시나리오 | 방법 | 설명 |
|---|---|---|
| 1. 모든 노드 | YAML 에 toleration 포함 | control-plane(마스터)에는 taint(NoSchedule)가 걸려 있으므로 그 노드까지 배포하려면 toleration 필요 |
| 2. taint 노드 제외 | YAML 에서 toleration 제거 | taint 가 걸린 control-plane 을 제외한 나머지 worker 노드에만 배포 |
| 3. 특정 노드 | node label + nodeSelector | 대규모 클러스터에서 라벨이 붙은 노드에만 배포 |

  - 강사 비유: **taint = '잠겨 있다', toleration = '그 잠금을 여는 열쇠'**. control-plane 노드의 `node-role.kubernetes.io/control-plane:NoSchedule` taint 는 스케줄러가 Pod 를 올리지 못하게 막는 값(앞선 Pod 챕터 내용). `kubectl describe no | grep -i taint` 로 노드별 taint 확인 — 첫 번째 노드(control-plane)에만 NoSchedule taint, 나머지 3개는 `<none>`. toleration 이 없으면 이 노드에는 DaemonSet Pod 가 배치되지 않는다.
  - nodeSelector 예(슬라이드 65): 노드에 라벨을 붙이고(using node label) DaemonSet 의 nodeSelector 에 같은 라벨을 지정하면 그 라벨이 있는 노드에만 할당. 강사 예: 로그를 수집해야 하는 노드에 `kubectl label node k8s-node2 log-collect-node=true` + `nodeSelector: log-collect-node: "true"`.
- **LAB1 (모든 노드 / toleration 포함)** : 쿠버네티스 공식 문서(concepts/workloads/controllers/daemonset)의 **fluentd-elasticsearch** 예제 사용(문서의 YAML 복사 버튼으로 복사 → `ds` 디렉터리에 `elastic-ds.yaml` 저장). 강사: EFK 스택(Elasticsearch·Fluentd·Kibana)은 ELK 와 비슷 — Elasticsearch = 검색 엔진(저장), Fluentd = 로그·데이터 수집, Kibana = 시각화 대시보드. 여기서는 데이터(로그)를 수집하는 Fluentd DaemonSet 만 사용. 문서 기본 코드에는 tolerations 가 들어 있어 control-plane 노드까지 포함(주석: "these tolerations are to have the daemonset runnable on control plane nodes / remove them if your control plane nodes should not run pods"). kube-system 네임스페이스에 `fluentd-elasticsearch` 이름과 라벨 지정, 이미지는 문서 제공 것 그대로. apply 후 DESIRED 4, Pod 가 k8s-node3, k8s-node2, k8s-master, k8s-node1 에 각각 생성 — 강사: "이번 강의에서 처음으로 마스터 노드에 Pod 를 배포해 본 것".
- **LAB1 (control-plane 제외)** : 기존 YAML 에서 tolerations 부분만 지우고 `elastic-ds-taint.yaml` 로 저장해 apply → 1·2·3번 worker 노드에만 배포. 강사는 배포 시간이 오래 걸려 영상에서는 이 단계를 생략했고 시청자가 직접 해 보면 된다고 안내.
- **LAB2 (Node label + nodeSelector)** : `gpucore=nvidia` 라벨을 node1, node3 에 지정(`kubectl label nodes`), `kubectl get no --show-labels` 로 확인, toleration 없는 두 번째 YAML 을 복사해 `elastic-ds-nodeselect.yaml` 로 만들고 template 의 spec(컨테이너 spec 쪽) 아래에 `nodeSelector: gpucore: nvidia` 추가. 결과: 클러스터 4노드 중 control-plane 은 toleration 이 없어 제외, node2 는 gpucore 라벨이 없어 제외 → 라벨이 있는 1번, 3번 노드에만 배포(DESIRED 2).
- 강사 정리: DaemonSet 을 쓰는 3가지 시나리오 — (1) 모든 노드, (2) taint 가 걸린 노드 제외, (3) nodeSelector 로 특정 노드. DaemonSet 소스는 Deployment 와 거의 같으므로 로그 수집·모니터링용 애플리케이션 코드를 DaemonSet 으로 배치하면 데몬처럼 고정적으로 Pod 가 떠 있다. 각 시나리오는 직접 테스트해 볼 것.

## [사용한 CLI]

### 17-1. 클러스터의 기존 DaemonSet 확인
```bash
kubectl get ds -A
# kube-system calico-node 4/4, kube-proxy 4/4 / metallb-system speaker 4/4 / monitoring node-exporter 3/3 / openebs openebs-ndm 3/3 ...
kubectl describe nodes | grep -i taint
```
- `ds` = daemonsets. calico, kube-proxy 는 control-plane 포함 4노드, node-exporter/openebs 는 worker 3노드(control-plane 제외로 보이며 이유는 자료에 직접 설명 없음).

### 17-2. LAB1: fluentd-elasticsearch DaemonSet (toleration 포함)
```bash
mkdir ds && cd $_
vi elastic-ds.yaml
kubectl apply -f elastic-ds.yaml
kubectl get ds,po -A -o wide | grep fluentd
```
```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd-elasticsearch
  namespace: kube-system
  labels:
    k8s-app: fluentd-logging
spec:
  selector:
    matchLabels:
      name: fluentd-elasticsearch
  template:
    metadata:
      labels:
        name: fluentd-elasticsearch
    spec:
      tolerations:
      # these tolerations are to have the daemonset runnable on control plane nodes
      # remove them if your control plane nodes should not run pods
      - key: node-role.kubernetes.io/control-plane
        operator: Exists
        effect: NoSchedule
      - key: node-role.kubernetes.io/master
        operator: Exists
        effect: NoSchedule
      containers:
      - name: fluentd-elasticsearch
        image: quay.io/fluentd_elasticsearch/fluentd:v2.5.2
        resources:
          limits:
            memory: 200Mi
          requests:
            cpu: 100m
            memory: 200Mi
        volumeMounts:
        - name: varlog
          # ... (자료 화면에서 volumeMounts/volumes 하단은 생략됨)
```
- toleration 을 넣으면 control-plane(k8s-master) 포함 4노드(k8s-node1~3, k8s-master)에 Pod 생성(DESIRED 4).

### 17-3. LAB1: control-plane 제외 (toleration 삭제)
```bash
cp elastic-ds.yaml elastic-ds-taint.yaml
vi elastic-ds-taint.yaml          # tolerations 블록 삭제
kubectl apply -f elastic-ds-taint.yaml
kubectl get ds,po -A -o wide | grep fluentd      # worker 3대에만 생성
kubectl describe no | grep -i taint
# Taints: node-role.kubernetes.io/control-plane:NoSchedule  (master) / <none> x3 (worker)
kubectl describe pod fluentd-elasticsearch --namespace=kube-system | grep Node:
```

### 17-4. LAB2: 노드 label + nodeSelector 로 특정 노드만
```bash
kubectl label nodes k8s-node1 gpucore=nvidia
kubectl label nodes k8s-node3 gpucore=nvidia
kubectl get no --show-labels
vi elastic-ds-nodeselect.yaml
```
template.spec 에 nodeSelector 추가:
```yaml
    spec:
      nodeSelector:
        gpucore: nvidia
      containers:
      - name: fluentd-elasticsearch
        image: quay.io/fluentd_elasticsearch/fluentd:v2.5.2
```
```bash
kubectl apply -f elastic-ds-nodeselect.yaml
kubectl get ds,po -A -o wide | grep fluentd      # DESIRED 2 (k8s-node3, k8s-node1), NODE SELECTOR gpucore=nvidia
kubectl describe pod fluentd-elasticsearch --namespace=kube-system | grep Node:
```
- 다른 label 예(자료 설명): `kubectl label node k8s-node2 log-collect-node=true` + `nodeSelector: log-collect-node: "true"`.
- 이전 DaemonSet(`fluentd-elasticsearch`)과 이름이 같으므로 apply 시 같은 object 가 갱신된다.

## [확인 방법/주의점]
- `kubectl get ds -A` 의 DESIRED/CURRENT/READY 가 대상 노드 수와 일치하는지 확인.
- taint/toleration 은 control-plane 노드 포함 여부, nodeSelector 는 label 일치 노드만 결정.
- **오류 사례** : apply 직후 `kubectl describe pod fluentd-elasticsearch ...` 를 실행하면 Pod 가 아직 할당되지 않아 `Error from server (NotFound): pods "fluentd-elasticsearch" not found` 가 날 수 있다(강사: 잠시 후 생성이 끝나면 같은 결과를 얻을 수 있음). 또한 describe 에는 Pod 이름 접두어만이 아니라 실제 Pod 이름(`fluentd-elasticsearch-xxxxx`)을 쓰는 것이 안전.
- 슬라이드 상 YAML 하단의 volumeMounts/volumes 는 화면에 다 보이지 않아 생략됨. 터미널 글자가 작아 일부 열은 판독이 어려워 슬라이드의 명령을 기준으로 옮김.
- 같은 이름(`fluentd-elasticsearch`)의 DaemonSet 에 다른 YAML 을 apply 하면 새 object 가 아니라 기존 object 가 갱신된다.

---

# Step 18. Job & CronJob

## [목적]
일회성 작업은 Job, 주기적 작업은 CronJob 으로 실행하고, completions/parallelism/activeDeadlineSeconds 및 CronJob 의 history/concurrency 옵션을 이해한다.

## [이론 설명]
> 원본: 챕터 09 Clip 6 (약 15분, 슬라이드 72~82 + 터미널). 학습 목표: Pod(계속 실행되는 애플리케이션)와 Job(특정 작업을 수행하고 끝나는 Pod)의 차이, `kubectl create job` / `get job,po` / `logs` / `describe`, completions·parallelism·activeDeadlineSeconds 의 의미, CronJob 스케줄(분 시 일 월 요일)과 successfulJobsHistoryLimit / failedJobsHistoryLimit / concurrencyPolicy.

- **Job 과 CronJob (슬라이드 73)** : Job 도 Pod 와 같은 workload resource 계열로 모두 Pod 를 기반으로 동작. 차이는 성격 — Pod(Deployment 등이 만드는 Pod)는 계속해서 업무를 수행하는 애플리케이션이지만 **Job 은 특정 작업이 수행되고 끝나면 종료**된다.
  - Job 은 Pod 와 같은 종류지만 Pod 와 다르게 특정 작업만 수행하고 종료. **일회성 및 일괄(배치) 작업 실행**에 적합, CronJob 은 주로 **반복 작업을 예약**하는 데 사용.
  - Job 은 작업을 정의하고 Job 이 완료될 때까지 실행되도록 보장하며, 하나 이상의 Pod 의 수명 주기를 관리하여 **원하는 성공 횟수에 도달할 때까지** 관리. CronJob 은 사전 정의된 일정(일일, 주간, 월간)에 따라 Job 을 생성하며 CronJob 이 만든 각 Job 은 특정 작업 또는 작업 집합을 Pod 로 실행.
  - 강사: 단순한 일회성·배치 작업은 Job, 주기적으로 반복(예약)되는 작업은 CronJob. CronJob 도 결국 일정에 맞춰 Job 을 만들고 Job 은 Pod 로 실행되므로 "똑같은 Job"이며 다른 점은 예약 여부. 예: 정기 백업, 리포트 생성.
- **CronJob 스케줄 표기법 (슬라이드 74)** : 리눅스 cronjob 과 동일한 5칸 방식(분 시 일 월 요일), 하루/주/월에 한 번처럼 반복적인 Job 이 요구될 때 사용. 값을 쓰지 않는 칸은 별(`*`)로 채움. 이 스케줄 문구를 Job 을 만들 때 그대로 넣어 예약 실행.

| 칸 | 의미 | 허용 값 |
|---|---|---|
| 1번째 | minute | 0 - 59 |
| 2번째 | hour | 0 - 23 (오전이면 7, 저녁이면 19 처럼 24시간제) |
| 3번째 | day of the month | 1 - 31 |
| 4번째 | month | 1 - 12 |
| 5번째 | day of the week | 0 - 6 (Sunday to Saturday; 7 is also Sunday on some systems) — 일요일부터 0 이므로 금요일은 5 |

  - 강사 예시(슬라이드): 매주 금요일 오전 7시 15분에 time.sh 실행 `15 7 * * 5 /bin/bash /root/LABs/time.sh` (분=15, 시=7, 일=*, 월=*, 요일=5) / "1월~10월까지 2개월마다 1일 12시에…" `00 12 1 1-10/2 *`. "1분마다"는 첫 칸에 `*/1` 을 넣고 나머지는 `*`.
- **Job 생성/확인** : 목적 — node 이미지 안의 node 애플리케이션 버전 확인(이름 `nodeversion`, 태그 없으므로 latest, `node -v`). `kubectl create job nodeversion --image=node -- node -v` 에서 **`--` 는 "여기부터는 kubectl 옵션이 아니라 컨테이너 안에서 실행할 명령"이라는 구분**. 이미지를 받는 동안 `ContainerCreating` 이 이어지다가 `Completed`. **Completed 는 종료됐다는 뜻이지 삭제됐다는 뜻이 아니며**, 완료된 Pod 의 결과는 `kubectl logs <pod 이름>`(출력 `v21.5.0`)으로 확인. Job 의 자세한 정보는 `describe job`(Job 컨트롤러가 Job 을 만들고 작업을 시행한 기본 정보). 일회성 데이터를 뽑거나 배치 작업을 돌리는 것이 Job 의 주된 목적(강사). Pod 이름 뒤 글자는 매번 무작위, 걸린 시간은 이미지 pull 속도에 따라 다름(슬라이드 20s vs 실제 108s).
- **Job YAML (`--dry-run=client -o yaml`)** : 컨테이너 명령(`-- node -v`)이 맨 뒤에 와야 하므로 **`--dry-run` 옵션은 명령 맨 뒤가 아니라 앞쪽(`--` 앞)** 에 써야 한다(강사). `command` 아래의 `node`, `-v` 가 Job 이 실행할 작업. **`restartPolicy: Never`** — 일반 Pod 의 기본값은 Always 지만 Job 은 컨테이너가 실패하거나 종료돼도 다시 시작하지 않도록 Never(특정 작업만을 위해 존재하는 Pod). `apiVersion` 은 Pod 의 `v1` 이 아니라 `batch/v1`.
- **completions / parallelism / activeDeadlineSeconds**
  - `completions: 10` = **성공적으로 완료되어야 할 Pod 의 총 개수**(원하는 Pod 수를 지정, 하나씩 완료될 때까지 관리, Job 을 만들 때 많이 쓰는 옵션). 성공적으로 완료된 Pod 수가 10 에 도달할 때까지 순차적으로 하나씩 실행. `kubectl get job -w`(-w = watch, 변화가 생길 때마다 출력)로 COMPLETIONS `0/10 → 1/10 → … → 10/10`(약 58초) 관찰.
  - `parallelism: 5` = **병렬로 실행할 최대 Pod 수**. 하나씩 순서대로 실행하면 느리므로 여러 값을 배치로 처리할 때 사용. completions 만 있을 때는 1, 2, 3 … 순서로 올라가지만 parallelism 을 넣으면 5개씩 병렬로 함께 실행되어 카운트가 띄엄띄엄 크게 올라간다(슬라이드 79 약 30초 만에 10/10). 예: completions 10, parallelism 5 → 5개씩 두 번에 나눠 실행.
  - `activeDeadlineSeconds: 15` = 작업이 종료되기 전에 실행할 수 있는 **최대 시간**. **15초 이내에 완료되지 않은 작업은 종료되며 완료된 작업만 유지**(예: 10개 요청, 병렬도 5 인데 15초 안에 다 못 끝내면 그때까지 완료된 것(강사 예: 2개)만 남음). Job 이 무한정 기다릴 수 없고 "무조건 10초 이내에 끝내야 한다"처럼 시간 제약이 있을 때 쓰는 안전장치. 이 옵션은 슬라이드로만 설명되었고 별도 실행 화면은 없다.
- **CronJob 생성/구조** : `kubectl create cronjob hello-date-1m --image=busybox --schedule='*/1 * * * *' --dry-run=client -o yaml -- /bin/sh -c "date && echo 'Hello from the Kubernetes cluster'" > hello-date-1m.yaml`. YAML 은 `schedule` 과 실제로 만들 Job 의 설계도 `jobTemplate` 으로 구성 — "CronJob 도 결국 Job 을 만들고, Job 은 Pod 가 된다". 이 CronJob 에서는 `restartPolicy: OnFailure` 로 생성됨(Job 예제는 Never). `cj` = cronjob 의 줄임말. apply 직후에는 Pod 가 없고 1분 뒤 만들어지며 이후 1분 단위로 계속 생성(Completed 된 Pod 안의 결과는 logs 로 확인).
- **CronJob 옵션 (슬라이드 82)** : 강사 — CronJob 도 Job 처럼 옵션이 많고 그중 `schedule` 이 가장 중요.

| 옵션 | 설명 |
|---|---|
| successfulJobsHistoryLimit / failedJobsHistoryLimit | **기본값 3** — CronJob 컨트롤러가 마지막 3개의 성공·실패한 작업 기록을 각각 유지. 보관할 history(기록) 개수(슬라이드 예시는 5) |
| concurrencyPolicy: Allow (기본값) | 동일한 작업의 동시 실행 허용 |
| concurrencyPolicy: Forbid | 동일한 작업이 순차적으로 실행되는 경우의 동시 실행 방지 |
| concurrencyPolicy: Replace | 현재 실행 중인 작업을 취소하고 새 작업으로 대체 |

  - 강사 마무리: 요구 사항에 따라 Job 과 CronJob 의 옵션을 골라 쓰면, 예약된 작업이나 특정 작업만 수행하는 Pod 가 필요할 때 이 workload resource 를 쓰면 좋다.

## [사용한 CLI]

### 18-1. LAB1: 간단한 Job (node 버전 확인)
```bash
mkdir job && cd $_
kubectl create job nodeversion --image=node -- node -v
kubectl get job,po | grep node            # ContainerCreating → Completed (COMPLETIONS 1/1)
kubectl logs <nodeversion Pod명>          # v21.5.0
kubectl describe job nodeversion
```
- `kubectl create job <이름> --image=<이미지> -- <명령 인자...>` : `--` 뒤가 컨테이너 command.

### 18-2. Job YAML 생성 (dry-run)
```bash
kubectl create job nodeversion --image=node --dry-run=client -o yaml -- node -v > nodeversion.yaml
vi nodeversion.yaml
```
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  creationTimestamp: null
  name: nodeversion
spec:
  template:
    metadata:
      creationTimestamp: null
    spec:
      containers:
      - command:
        - node
        - -v
        image: node
        name: nodeversion
        resources: {}
      restartPolicy: Never
status: {}
```
- `apiVersion` 이 Pod 의 `v1` 이 아닌 `batch/v1`. 주의: dry-run 옵션은 `--` 앞에 위치해야 한다.

### 18-3. LAB2: completions / parallelism
```bash
kubectl create job hello-job --image=busybox --dry-run=client -o yaml \
 -- echo "Hello I'm running job" > hellojob.yaml
vi hellojob.yaml
```
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: hello-job
spec:
  completions: 10              # 총 10번 성공해야 Job 완료
  template:
    metadata:
    spec:
      containers:
      - command:
        - echo
        - Hello I'm running job
        image: busybox
        name: hello-job
      restartPolicy: Never
```
```bash
kubectl apply -f hellojob.yaml
kubectl get job -w                         # COMPLETIONS 0/10 → 1/10 → ... → 10/10 (Ctrl+C 로 종료)
kubectl get jobs.batch -w
kubectl get job,po | grep hello
```
병렬 실행:
```yaml
spec:               # 동시에 실행할 Pod 수
  parallelism: 5
  completions: 10
```
→ 한 번에 5개씩 실행되어 더 빨리 10/10 도달.

### 18-4. LAB3: activeDeadlineSeconds
```yaml
spec:
  activeDeadlineSeconds: 15      # 15초 안에 끝나지 않으면 Job 종료
  parallelism: 5
  completions: 10
```
- 10개 Pod 를 5개씩 실행하는 도중 15초가 지나면 남은 Pod 를 종료하고 Job 이 실패 처리(자료 예: 완료 2개 등 일부만 완료).

### 18-5. LAB4: CronJob (1분마다)
```bash
kubectl create cronjob hello-date-1m --image=busybox \
 --schedule='*/1 * * * *' --dry-run=client -o yaml \
 -- /bin/sh -c "date && echo 'Hello from the Kubernetes cluster'" > hello-date-1m.yaml
vi hello-date-1m.yaml
```
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  creationTimestamp: null
  name: hello-date-1m
spec:
  jobTemplate:
    metadata:
      creationTimestamp: null
      name: hello-date-1m
    spec:
      template:
        metadata:
          creationTimestamp: null
        spec:
          containers:
          - command:
            - /bin/sh
            - -c
            - date && echo 'Hello from the Kubernetes cluster'
            image: busybox
            name: hello-date-1m
            resources: {}
          restartPolicy: OnFailure
  schedule: '*/1 * * * *'
status: {}
```
```bash
kubectl apply -f hello-date-1m.yaml
kubectl get cj,po | grep hello             # cj = cronjob. 1분 후 Completed Pod 생성
kubectl get cj,po | grep hello-date
```
history / 동시성 옵션:
```yaml
spec:
  schedule: '*/1 * * * *'
  successfulJobsHistoryLimit: 5
  failedJobsHistoryLimit: 5
  concurrencyPolicy: Allow       # Allow(기본, 동시 실행 허용) / Forbid / Replace
```

## [확인 방법/주의점]
- `kubectl get job -w` 로 COMPLETIONS 증가 관찰(실습 화면은 completions 만 있는 상태로 약 27초 간격으로 1/10, 2/10, 3/10 … 이 올라갔고 강사는 4/10 부근에서 Ctrl+C 로 watch 중단). Completed Pod 의 출력은 `kubectl logs <pod>`.
- grep 키워드가 `hello` 이면 앞 실습의 hello-job 의 Pod 도 같이 걸리므로 `hello-date` 로 구분.
- CronJob 은 apply 직후 Pod 가 없고(예: 생성 11초 후 `False 0 <none>`) 첫 실행까지 최대 1분 대기. 첫 실행 전 `get cj` 의 LAST SCHEDULE 은 `<none>`.
- 완료(Completed)된 Job 의 Pod 는 삭제되지 않고 남는다 → 정리가 필요하면 직접 삭제(CronJob 은 history limit 만큼 유지).
- `kubectl create job ... -- <명령>` 에서 `--dry-run=client -o yaml` 은 반드시 `--` 앞에 둔다(뒤에 두면 컨테이너 명령 인자로 해석됨).
- 슬라이드 75/78/79 의 출력은 예시이며 실제 Pod 이름·시간은 다르다. activeDeadlineSeconds 의 동작(Job 을 실패로 표시하는지 등)은 영상에서 실습으로 확인하지 않았고, 일반적으로 데드라인 초과 시 Job 이 실패 처리되며 실행 중 Pod 가 종료됨.

---

# Step 19. metrics-server 와 HPA 로 Pod 자동 확장

## [목적]
metrics-server 를 설치해 CPU 사용률을 수집하고, HPA 가 부하에 따라 Deployment 의 Pod 수를 자동으로 늘리고 줄이도록 구성/검증한다.

## [이론 설명]
> 원본: 챕터 09 Clip 7 (약 20분, 이론 + 실습, 9장의 마지막 오브젝트). 학습 목표: HPA 가 Deployment 등 상위 오브젝트에 붙어 Pod 수를 자동 조절함을 설명, 적정 Pod 수 계산식과 metrics-server 를 거치는 9단계 흐름 설명, metrics-server 설치 + `--kubelet-insecure-tls` 추가, `kubectl autoscale` 로 HPA 생성 후 부하 테스트로 확장 관찰.
- **HPA 는 독립적인 기능이 없는 종속 오브젝트**다. Deployment 같은 오브젝트에 연결되어 Pod 가 확장성을 갖추도록 돕는다(이 실습에서는 Deployment `hpa-cpu50-deploy` 에 연결). 이름의 Horizontal(수평) = Pod 개수를 늘리고 줄이는 scale in/out. 서버 사양 자체를 올리는 scale up/down 은 VPA(Vertical Pod Autoscaler) 영역이며, 강사 설명상 VM 실습 환경에서는 수직 확장이 안 되고 클라우드에서 운영할 때 VPA 로 사양을 올릴 수 있다.
- CPU/Memory 사용량을 관찰해 Deployment, ReplicaSet, StatefulSet 의 Pod 수를 자동 확장(**DaemonSet 제외** — 노드당 Pod 가 하나뿐이라 확장성이 없기 때문). 컨트롤러가 관찰된 평균 CPU 사용률이 지정한 목표와 일치하도록 replicas 를 주기적으로 조정한다.
- 강사 예시: 목표를 50% 로 두면 50% 를 넘을 때 Pod 를 늘리고(scale out), 기준보다 한참 낮으면 줄인다(scale in). 슬라이드 85 예: 온라인 쇼핑몰이 평소 인스턴스(Pod) 2개, 수요 피크 때 동적으로 10개까지 확장. 사람이 24시간 지켜보며 조정하기보다 자동 판단 스케일링이 권장되며 AWS·구글 등 클라우드도 모두 동적 오토스케일러 기술을 갖고 있다. 기본 메트릭 수집(모니터링) 간격 15초.
- `ceil` = 올림 함수(강사: 3.1 이 나오면 4). 계산 결과에 소수점이 있으면 위 정수로 올린다. 예) 현재 200m / 원하는 100m = 2.0 → 복제본 두 배, 50m / 100m = 0.5 → 절반. 평소에는 resources 없이 Pod 를 운영하지만 HPA 는 CPU requests/limits 를 기준으로 판단하므로 **반드시 resources 를 포함**해야 한다(이 클립은 CPU 만 사용). `cpu: 10m` 은 1 코어의 1000분의 10(밀리코어), requests = 최소 보장량, limits = 최대 한도.
- 9단계 흐름(슬라이드 87): ① 노드 kubelet(cAdvisor)이 CPU·Memory 지표 수집 → ② metrics-server 가 모든 노드 지표를 모아 K8s Aggregator 에 제공 → ③ Aggregator 를 거쳐 API server 의 Resource Metrics API 로 전달(기본 15초) → ④ API server 가 HPA 에 전달, HPA 가 알고리즘으로 늘릴지 줄일지 계산 → ⑤ HPA 가 Deployment/ReplicaSet 에 전달 → ⑥ ReplicaSet 이 바로 만들지 않고 scale 정보를 API server 에 전달 → ⑦ API server 가 etcd 에 기록, scheduler 가 Pod 를 만들 노드 결정 → ⑧ 해당 노드 kubelet 이 scale 정보 확인 → ⑨ Pod 생성/축소. (슬라이드 번호 표기가 일부 겹쳐 있어 단계 경계는 위 순서 기준으로 정리)
- metrics-server 대신 **Prometheus** 도 지표를 수집해 시계열 DB(TSDB)에 보관하고 Custom API / External API 로 API server 에 제공할 수 있으며, 그 뒤 흐름은 동일하다. 이번 실습은 metrics-server 를 직접 설치해 사용.
- v1 은 사용 가능하지만 현재 지향하는 버전은 v2(metric 을 더 구체적으로 작성 가능).
- (아래는 기존 정리)
- HPA(Horizontal Pod Autoscaler): 부하(CPU/Memory 등 metric)에 따라 Deployment/ReplicaSet/StatefulSet 의 Pod 수를 자동 조절(scale out/in). DaemonSet 은 대상이 아님. (참고: VPA 는 Pod 의 리소스 크기를 키우는 scale up/down)
- 예: CPU 목표 50% → 평균이 50% 를 넘으면 Pod 증가, 낮으면 감소. 기본 동기화 주기 약 15초.
- 원하는 Pod 수 계산식: `desiredReplicas = ceil[ currentReplicas × ( currentMetricValue / desiredMetricValue ) ]` (ceil = 올림). 예: 현재 200m / 목표 100m = 2.0 → 2배, 50m / 100m = 0.5 → 절반.
- HPA 가 동작하려면 대상 Deployment 에 **resources(requests/limits)** 가 있어야 한다(사용률 계산의 기준).
- 동작 흐름: kubelet(cAdvisor)이 CPU/Memory 수집 → metrics-server 가 수집 → Aggregator 를 통해 API server 의 Resource Metrics API 로 노출(기본 15초 주기) → HPA 가 조회해 판단 → Deployment/ReplicaSet 의 scale 변경 요청 → API server 가 etcd 기록, scheduler 가 Pod 배치, kubelet 이 Pod 생성/삭제.
- Prometheus 등은 Custom API / External API 로 확장 metric 제공 가능(이번 실습은 metrics-server 사용).
- API 버전: `autoscaling/v1`(CPU 퍼센트만, `targetCPUUtilizationPercentage`) vs `autoscaling/v2`(metrics 배열, 여러 지표).

## [사용한 CLI]

### 19-1. metrics-server 설치 및 문제 해결
```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

kubectl -n kube-system get deployments.apps metrics-server      # READY 0/1
kubectl top no                                                  # error: Metrics API not available
kubectl top po                                                  # error: Metrics API not available
kubectl get apiservices | egrep metrics
# v1beta1.metrics.k8s.io  kube-system/metrics-server  False (MissingEndpoints)
```
kubelet 인증서 검증 문제로 READY 되지 않는 경우: Deployment args 에 `--kubelet-insecure-tls` 추가
```bash
kubectl edit -n kube-system deployments.apps metrics-server
```
```yaml
spec:
  containers:
  - args:
    - --cert-dir=/tmp
    - --secure-port=4443
    - --kubelet-insecure-tls       # 추가
    # (이하 기존 args 유지)
```
```bash
kubectl get apiservices | egrep metrics                         # 20~30초 후 True
kubectl -n kube-system get deployments.apps metrics-server      # READY 1/1
kubectl top no                                                  # 노드 CPU/Memory 사용량
kubectl top po                                                  # No resources found in default namespace. (default 네임스페이스에 Pod 가 없을 때)
```
- `--kubelet-insecure-tls` : kubelet 의 TLS 인증서를 검증하지 않음(실습 환경 용도).

### 19-2. HPA 대상 Deployment + Service
```bash
kubectl create deployment hpa-cpu50-deploy \
 --image=dbgurum/k8s-lab:hpa --port=8080 --replicas=2

kubectl expose deployment hpa-cpu50-deploy \
 --name=hpa-cpu50-svc --type=NodePort --port=8080 --target-port=8080

kubectl get po,svc -o wide | grep hpa

kubectl edit deployments.apps hpa-cpu50-deploy
```
```yaml
        resources:
          requests:
            cpu: 10m
          limits:
            cpu: 20m
```
```bash
kubectl describe deployments.apps hpa-cpu50-deploy      # Limits: cpu 20m, Requests: cpu 10m
curl 192.168.56.102:32479/hostname                      # Hostname : <Pod명> (호출마다 다른 Pod)
```
- 자료의 노드 중 일부 IP(192.168.56.101)에서는 해당 시점에 `Connection refused`(Pod 가 없는 노드 사례), 다른 노드 IP 는 정상 응답.

### 19-3. HPA 생성
```bash
kubectl autoscale deployment hpa-cpu50-deploy --cpu-percent=50 --min=1 --max=10 --dry-run=client -o yaml > hpa1.yaml
vi hpa1.yaml
```
```yaml
# hpa1.yaml (autoscaling/v1)
apiVersion: autoscaling/v1
kind: HorizontalPodAutoscaler
metadata:
  creationTimestamp: null
  name: hpa-cpu50-deploy
spec:
  maxReplicas: 10
  minReplicas: 1
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: hpa-cpu50-deploy
  targetCPUUtilizationPercentage: 50
status:
  currentReplicas: 0
  desiredReplicas: 0
```
`autoscaling/v2` 확인 및 YAML (hpa2.yaml):
```bash
kubectl api-resources | grep autos
# horizontalpodautoscalers  hpa  autoscaling/v2  true  HorizontalPodAutoscaler
# (참고: kubectl api-resources autos 는 error: unexpected arguments)
vi hpa2.yaml
```
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: hpa-cpu50-deploy
spec:
  maxReplicas: 10
  minReplicas: 2
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: hpa-cpu50-deploy
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
```
```bash
kubectl apply -f hpa2.yaml
kubectl get hpa -w
# NAME  REFERENCE  TARGETS  MINPODS  MAXPODS  REPLICAS
# hpa-cpu50-deploy  Deployment/hpa-cpu50-deploy  <unknown>/50% → 0%/50%  2  10  2
```
- v1 은 `targetCPUUtilizationPercentage: 50`, v2 는 `metrics[].resource.target.averageUtilization: 50` (메모리/커스텀 metric 도 확장 가능). 처음에는 `<unknown>/50%` 로 보이다 곧 `0%/50%` 로 바뀜.

### 19-4. 부하 발생 및 확인
```bash
# 터미널 1
kubectl get hpa -w

# 터미널 2 (노드IP:NodePort 로 반복 호출하여 CPU 부하 생성)
while true; do curl 192.168.56.101:32479/hostname; sleep 0.05; done
# 종료: Ctrl+C
```
- 관찰 예(**슬라이드 96 의 강사 참고용 예시**): TARGETS 0%/50%(118s) → 5% → 55%(REPLICAS 2) → 75%(3) → 63%(3) → 56%(4) 로 REPLICAS 2 → 3 → 4 증가. 슬라이드 예시의 NodePort 31688 등은 실습값 32479 와 다르다. **영상 촬영 시점에는 아직 확장이 시작되지 않은 상태**(강사: "저는 아직까지 확장은 안 되고 있는데요")였고, 확장 결과는 슬라이드 96 으로 대신 보여 준다. 강사는 직접 테스트해 보라고 당부. 부하를 멈추면 시간이 지나 다시 줄어듦(scale in) — 이것이 HPA 의 목적.
- 자료 표기상 NodePort 값(31688 vs 32479)이 화면마다 다르므로 `kubectl get svc` 의 실제 값을 사용.

## [확인 방법/주의점]
- `kubectl top no|po` 가 동작해야 HPA TARGETS 가 `<unknown>` 이 아닌 값으로 표시된다.
- metrics-server 가 `0/1`, `Metrics API not available`, apiservices `False (MissingEndpoints)` 이면 `--kubelet-insecure-tls` 추가 후 20~30초 대기.
- Deployment 에 `resources` 가 없으면 HPA 가 CPU 사용률을 계산하지 못한다.
- 정리: 실습 후 `while` 루프를 Ctrl+C 로 종료.
- metrics-server 는 kube-system 에 배치되며 apply 직후 바로 Ready 되지 않는다. 원인은 kubelet 인증서(TLS) 검증 옵션 누락(강사: 보안 요소). 설치 시 `serviceaccount`, `clusterrole`(system:aggregated-metrics-reader, system:metrics-server), `rolebinding`, `clusterrolebinding`, `service`, `deployment`, `apiservice(v1beta1.metrics.k8s.io)` 가 created 된다. 최신 정보는 github.com/kubernetes-sigs/metrics-server/releases 에서 확인. `kubectl top no` = 노드 사용량, `kubectl top po` = Pod 사용량(자원을 많이 쓰는 Pod 파악). `top po` 가 `No resources found in default namespace.` 인 것은 default 에 Pod 가 없어서(강사가 Pod 를 대부분 삭제함).
- `edit` 로 args 에 `--kubelet-insecure-tls` 는 args 목록 안 아무 곳에나 한 줄 추가하면 되고, 저장 후 약 20~30초 뒤 apiservices 가 True, READY 1/1 이 된다. 이 옵션은 kubelet 인증서를 검증하지 않으므로 실습 환경용.
- resources 를 `kubectl edit` 로 넣으면 새 ReplicaSet 으로 Pod 가 새로 만들어진다(describe 에서 `Replicas: 2 desired | 1 updated | 3 total` 같은 롤아웃 중 상태가 보일 수 있음). `kubectl describe deployments.apps hpa-cpu50-deploy` 로 `Limits: cpu 20m / Requests: cpu 10m` 적용 확인 습관을 들일 것.
- 영상 중 `kubectl get po hpa` 는 `Error from server (NotFound): pods "hpa" not found`(Pod 이름을 정확히 쓰거나 `get po,svc -o wide | grep hpa` 사용). `curl 192.168.56.101:32479/hostname` 이 한 번 `Connection refused`(강사: Pod 가 다시 만들어지는 중인 듯)였고 192.168.56.102 는 서로 다른 Pod 의 `Hostname : <Pod명>` 을 응답해 부하 분산 확인. 응답의 Hostname 이 Pod 이름이라 어느 Pod 가 처리했는지 알 수 있다.
- HPA 는 처음 `<unknown>/50%`(REPLICAS 0)였다가 곧 `0%/50%`, REPLICAS 2 로 바뀐다(강사: 무시해도 됨, 로드가 조금 느린 것). `kubectl api-resources autos` 는 `error: unexpected arguments: [autos]` 이므로 `| grep autos` 사용. hpa2.yaml 은 영상 vi 화면이 아닌 슬라이드 기준 내용이며 minReplicas 2 (get hpa 의 MINPODS 도 2, 반면 hpa1.yaml 은 min 1).
- 부하 루프는 sleep 0.05 로 매우 빠르게 요청을 보내 15초 주기로 수집되는 메트릭의 CPU 사용률을 올린다. 두 터미널을 쓴다(1: `get hpa -w`, 2: while 루프).

---

# 부록. 핵심 명령어 요약표

| 목적 | 명령 |
|---|---|
| YAML 뼈대 생성 | `kubectl run <pod> --image=<img> --dry-run=client -o yaml > x.yaml` / `kubectl create deployment <n> --image=<img> --dry-run=client -o yaml > x.yaml` |
| 필드 설명 | `kubectl explain <resource>[.spec...] [--recursive]` |
| 컨테이너 접속 | `kubectl exec -it <pod> [-c <container>] -- bash` |
| 파일 복사 | `kubectl cp <로컬> <pod>:<경로> [-c <container>]` |
| 노출 | `kubectl expose po|deployment <n> --name=<svc> --type=NodePort --port=P --target-port=P` |
| PV/PVC/SC | `kubectl get pv,pvc` / `kubectl get sc` / `kubectl edit pv <n>` |
| ConfigMap | `kubectl create cm <n> --from-literal=K=V / --from-file=<f|dir> / --from-env-file=<f>` |
| Secret | `kubectl create secret generic|tls|docker-registry ...`, `base64 -d` |
| Pod 재생성 | `kubectl replace --force -f <pod.yaml>` |
| 배포 | `kubectl set image deploy <n> <container>=<img>`, `kubectl rollout status|history|undo|pause|resume deployment <n>`, `kubectl scale deployment <n> --replicas=N`, `kubectl annotate ... kubernetes.io/change-cause="..."`, `kubectl patch deploy <n> -p '{...}'` |
| StatefulSet | `kubectl scale sts <n> --replicas N` |
| DaemonSet | `kubectl get ds -A`, `kubectl label nodes <node> k=v`, `kubectl get no --show-labels` |
| Job/CronJob | `kubectl create job <n> --image=<img> -- <cmd>`, `kubectl create cronjob <n> --image=<img> --schedule='...' -- <cmd>`, `kubectl get job -w`, `kubectl get cj` |
| HPA | `kubectl autoscale deployment <n> --cpu-percent=50 --min=1 --max=10`, `kubectl get hpa -w`, `kubectl top no|po` |
| etcd 암호화 | `etcdctl get /registry/secrets/<ns>/<name> | hexdump -C`, `kubectl get secrets -A -o json | kubectl replace -f -` |
