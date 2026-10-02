# deepen_g4 — 3부 13·14·15·16장 (대응 입문: 15장 Pod, 21장 네트워크 모델과 Service)

## 13장 (38.5KB -> 40.9KB, +2.4KB: 새 원천 내용이 복습 줄보다 커서 소폭 증가)

| 절 | 판정 | 교체 내용 / 새 원천 |
|---|---|---|
| 1.1 네 가지 규칙 | 중복(입문 21장 1.2) | 복습 줄 + 링크. 노드->Pod NAT 없음(kubelet 헬스체크)·hostNetwork 예외 경계와 노드 다이어그램만 유지 (제목 "세 규칙과 한 예외 — 경계 조건") |
| 1.2 왜 이 모델인가 | 중복(입문 21장 1.3) | 복습 줄 + 링크, 포트 매핑이 떠넘기는 네 가지 비용 목록만 유지, 병렬 비교 다이어그램 삭제 |
| 1.3 직접 구현하지 않은 이유 | 비중복 | 유지 |
| 2.1 pause | 부분 중복(입문 15장 1.3) | 방안1/2 비교 삭제 -> 복습 줄. pause.c·좀비 수거 유지, **새: CRI RuntimeService의 샌드박스 RPC / 컨테이너 RPC 구분** (원천 `Kubernetes_Internals_Network_Guide/01-내부-아키텍처/06` 6.2) |
| 2.2 공유/분리 | 중복(입문 15장 1.2 표) | 복습 줄. **새: `clone`/`unshare`/`setns` 세 시스템콜, setns = Pod 합류의 핵심, /proc/<pid>/ns inode 번호, lsns, runc config.json 확인 명령** (원천 `kubernetes-textbook-main/05/19` 19.1·19.7) |
| 2.3 손 조립 | 비중복 | 유지 + **새: `ip netns pids pod-lab`와 ns inode 비교 검증(19.3 단계 6)**, 대응표에 `unshare` 합류 행 추가 |
| 2.4 hostNetwork | 비중복 | 유지 |
| 3.1 IP 대역 세 가지 | 중복(입문 21장 1.4 표) | 표 삭제 -> 복습 줄. 확인 명령 유지, 14장 코어 3(노드별 쪼개기·노드 수 상한)으로 연결 (새 원천 없음, 원천에 더 깊은 내용 없음) |
| 3.2 네 가지 문제 | 비중복 | 유지 |

바뀐 절 5개(1.1, 1.2, 2.1, 2.2, 3.1) + 2.3 보강. 인출 질문 4·5·6·8, 백지 복습(코어 2), 기억 고리 묶음, 코어·학습 목표, 원문 근거(19.1·19.7, CRI RPC) 동기화.

## 14장 — 변경 없음
입문 15·21장은 CNI 스펙(ADD/DEL/CHECK/VERSION, libcni 호출, conflist 선택, IPAM 2층)을 다루지 않는다. 중복 절 없음.

## 15장 — 변경 없음
오버레이/네이티브 라우팅/VPC CNI·MTU·플러그인 비교는 입문 15·21장에 없다(입문 21장은 CNI 오버레이를 한 줄로만 언급). 중복 절 없음.

## 16장 (46.2KB -> 46.5KB)

| 절 | 판정 | 교체 내용 / 새 원천 |
|---|---|---|
| 1.1 Service가 해결하는 세 가지 | 중복(입문 21장 1.1) | 복습 줄 + **새: 호출 한 번의 시간순(DNS->ClusterIP->연결->규칙->Pod), DNS는 해석만·패킷 비중계, kube-proxy 사용자 공간 비경유, eBPF 대체 시 담당 구성요소 변동** (`kubernetes-qustion-book/02_심화/06` 2절) |
| 1.2 ClusterIP | 중복(입문 21장 1.4·2.1) | YAML·흐름 삭제 -> 복습 줄. "약속"·필드 9종 표(publishNotReadyAddresses 등)·targetPort 이름/containerPort 주의 유지 |
| 1.3 NodePort·LoadBalancer | 중복(입문 21장 2.2·2.3) | YAML·출력·범위 설명 삭제 -> 복습 줄. 유지: KUBE-NODEPORTS 연결, `<pending>`·MetalLB. **새: LB 계층 != 실제 패킷 경로(ALB IP target vs instance target)** (qustion 06 5절) |
| 1.4 ExternalName | 중복(입문 21장 2.4) | YAML 삭제 -> 복습 줄. HTTP Host·TLS 이름 주의와 selector 없는 Service와의 대비만 유지 |
| 1.5 분류 주의, 2.x EndpointSlice, 3.x 환경변수·헤드리스, 4.1·4.3 | 비중복(입문보다 깊음) | 유지 |
| 4.2 traffic policy | 부분 중복(입문 21장 2.2 표) | 표·다이어그램 삭제 -> 복습 줄. SNAT가 생기는 이유·`internalTrafficPolicy` 유지 |

바뀐 절 5개(1.1~1.4, 4.2). 인출 질문 1·2 교체, 원문 근거에 qustion 06 2·5절 추가.

## 새로 들인 원천
- `Kubernetes_Internals_Network_Guide/01-내부-아키텍처/06-kubelet-런타임-kube-proxy-개요.md` (6.2 CRI RPC)
- `kubernetes-textbook-main/05-내부-동작-파헤치기/19-Pod를-밑바닥부터-만들어-보기.md` (19.1, 19.3 단계 6, 19.7)
- `kubernetes-qustion-book/02_심화/06_네트워크와_서비스_노출.md` (2·5절, 이전에도 3·4절 사용)

## 검증
- 상대 링크(입문 책 링크 포함) 존재 확인 스크립트 통과, `<details>` 짝 일치, 물결표는 코드블록 내부만 남음.
- 원천에 없는 해석은 `> **[보충]**`로 표시(샌드박스 호출 순서·역할 해석). 실행 검증 주장 없음.
- 13장 +2.4KB는 중복 삭제분보다 새 원천 내용(setns·CRI RPC·검증 절차)이 커서 발생.
