# deepen_g6 — 심화 책 21·22·23장, 부록 A·B (입문 25·26장, 부록 대응)

판정 기준: DEEPEN.md. 크기는 LF 기준 바이트(변경 전 git HEAD → 변경 후).

## 21장 NetworkPolicy와 네트워크 보안 (32,949 → 44,884)
대응 입문: 25장 3.4~3.5절(기본 전허용/기본 거부, 합집합, CNI 미지원 무시, default-deny YAML, DNS 허용 YAML, OR/AND).

| 절 | 판정 | 교체 내용 · 새 원천 |
|---|---|---|
| 1.1 기본 전허용 → 기본 거부 (구 코어 1.1) | 중복 | 입문 복습 줄+링크로 줄이고, 필드 수준(`policyTypes`, `egress: []`, 빈 `podSelector`)만 남김. 원천 Internals 18.1 + qustion 07 |
| 1.2 정책 합집합 (구 1.2) | 중복 | 1.3으로 이동·축약. 새로 "첫 규칙 우선 아님, `ingress: []`가 다른 정책의 허용을 부정 못 함" 추가 (qustion 07) |
| 1.2 (신규) 출발 egress + 도착 ingress 양쪽 판정 | 비중복(신규) | qustion 10 4절 그림 설명. 도식과 [보충] 표시. 시나리오 4·인출 질문 2 추가 |
| 2.1 AND/OR | 중복 | 입문 복습 줄+링크, 두 YAML만 대비용으로 유지, 산문 축소 |
| 2.2 (신규) 셀렉터별 의미·`ipBlock` | 비중복(신규) | 빈 셀렉터, `namespaceSelector` 단독, `ipBlock` NAT·경로 주의(qustion 07), egress `ipBlock.except`(메타데이터+RFC1918) YAML(textbook 18.4) |
| 3.1 스펙과 시행은 별개 | 중복(일부) | 입문 복습 줄 추가, 집행 확인법(`describe`+실제 연결, qustion 07)·VPC CNI 활성화 조건(qustion 10) 추가. CNI 표는 유지 |
| 3.2 iptables vs eBPF | 비중복(축약) | 22장과 겹쳐 불릿 2개로 축약 |
| 3.3 Cilium L7 | 비중복 | 그대로 유지 |
| 3.4 (신규) 표준 한계 4가지↔CNI 확장 | 비중복(신규) | textbook 18.4 한계 4가지, 23.3 Calico `GlobalNetworkPolicy` YAML·CNI 비교표. 이식성 추론은 [보충] |
| 4.1 기본 거부 + DNS 예외 | 중복 | default-deny·allow-dns YAML 3개 삭제, 입문 복습 줄+링크. 대신 원천 3종 DNS 허용 모양 비교표(Internals 18.3 / textbook 13.5 / 18.4)와 [보충] |
| 4.2 계층화·패턴 | 비중복(축약) | YAML 2개를 불릿으로 축약. 패턴 1·3에 원천 보강(ingress-nginx NS, 클러스터 전역 대안) |
| 4.3 AdminNetworkPolicy | 비중복 | ASCII 도식 삭제(표와 평가 순서 문장으로 대체), 나머지 유지 |
| 4.4 (신규) 번들·HNC·Kyverno | 비중복(신규) | textbook 13.5(소프트 vs 하드 멀티테넌시, 번들), 13.6(HNC `Propagate`), 18.6(Kyverno `generate`) |

장 구조 동기화: 한 문장·코어 4개·학습 목표·🧭 질문·처리법·체크리스트·시나리오(4번째 추가)·백지 복습·인출 질문(11→10개로 재번호, 모두 `→ 코어 n` 일치)·기억 고리·원문 근거 줄 갱신.

## 22장 eBPF 데이터플레인과 Cilium (30,562 → 30,562, 변경 없음)
입문 책은 eBPF·Cilium·XDP·Hubble을 범위에서 제외(입문 index.md)하고 21장에서 언급만 한다. 절 전체가 비중복이라 판정 "유지". 장 내부(23장 2.5절)의 conntrack sysctl 설명과 일부 겹치나 입문 책과는 무관하므로 두었다.

## 23장 네트워크 장애 진단 (42,994 → 44,216)
대응 입문: 26장 2.3절(5줄 분기도), 22장 4.2절(DNS 진단 순서), 23장 2.3절(Ingress 4단계+표), 25장 3.5절(allow-dns).

| 절 | 판정 | 교체 내용 · 새 원천 |
|---|---|---|
| 1.1 5단계 플로차트 | 부분 중복 | 입문 복습 줄(26장 링크) 추가. 본문(명령·분기 상세)은 입문에 없어 유지 |
| 1.2 왜 이 순서인가 | 중복(일부) | 한 문장으로 축약 |
| 1.3 세 점 호출, 1.4 Service 8점, 2.1 증상표, 2.2 MTU, 2.5 자원 고갈, 3.x 관찰 위치 | 비중복 | 유지(입문에 MTU·tcpdump·conntrack·세 점 호출 없음). 2.1표의 "allow-dns" 참조를 21장 4.1 링크로 수정 |
| 2.3 DNS 진단 | 부분 중복 | `dig`·증상표는 유지. allow-dns YAML 삭제 → 입문 복습 줄+링크, 21장 4.1의 DNS 허용 3모양 점검을 [보충]으로 연결 |
| 2.4 Ingress 진단 | 중복 | 입문 23장 2.3의 4단계·404/503/502 표를 입문 복습 줄로 줄임. 유지: nginx.conf 확인·컨트롤러에서 백엔드 직접 호출(textbook 11.7), 504 `proxy-read-timeout`, 리다이렉트 루프+`X-Forwarded-Proto`, `Host` 헤더 재현(textbook 11.2 `curl -H`). 원천에 더 깊은 Ingress 진단 내용이 없어 억지로 채우지 않음 |

크기가 늘어난 것은 입문 복습 줄(링크 3개) 추가분이 삭제분(Ingress 표·allow-dns YAML)보다 커서다.

## 부록 A 용어집 (24,344 → 26,791)
입문 부록 A와 같은 수준의 한 줄 정의였던 행을 깊이로 교체/추가. 입문 부록 링크와 관계 안내 추가.

| 행 | 판정 | 내용 · 원천 |
|---|---|---|
| TLS 종료 / cert-manager | 중복 → 교체 | Secret 같은 NS, 컨트롤러→백엔드 평문, 90일 만료, DNS-01(와일드카드·내부망), 리다이렉트 루프 (textbook 11.3·11.7) |
| 남북 / 동서 트래픽 | 중복 → 교체 | 담당 구성요소(Ingress·메시·NetworkPolicy)와 장 번호 연결 |
| NetworkPolicy | 확장 | `policyTypes` 방향, 양쪽 판정, `ingress: []` 한계 (qustion 07·10) |
| `from`/`to` AND/OR | 확장 | 빈 셀렉터, `ipBlock` 의미 |
| AdminNetworkPolicy | 확장 | `ClusterNetworkPolicy`(v1alpha2) 후속 제안 |
| GlobalNetworkPolicy / 표준의 한계 4가지, HNC / Kyverno `generate` | 신규 2행 | 21장 새 절용 (textbook 13.5·13.6·18.4·18.6·23.3) |
| 그 외(소켓·netns·conntrack·kube-proxy·eBPF 등) | 비중복 | 유지 |

## 부록 B 진단 명령어 모음 (20,609 → 21,600)
입문 부록 B "네트워크 확인"과 동일했던 기본 조회 줄을 삭제하고 서두에 관계 안내(입문 부록 링크) 추가. 삭제: `get svc web`, `get endpointslices -o wide`(비어 있음 주석은 `-l ... -o yaml` 줄로 합침), `exec cat resolv.conf`, `exec dig <svc>...`, CoreDNS `logs`, `get ingress`, `get ingressclass`, `describe ingress`, `get networkpolicy -A`. 추가(원천 확인): `kubectl get pods -n kube-system`(Internals 18.2), `curl -H "Host: ..."`(textbook 11.2), `kubectl hns tree org`(textbook 13.6), `cilium hubble port-forward &`·`hubble observe --namespace production -f`(textbook 23.3). 크기 증가는 서두 안내문 때문.

## 새로 들인 원천
- kubernetes-qustion-book/02_심화/07_통신_오브젝트.md, 10_보안과_확장_구조.md (NetworkPolicy 판정 모델)
- kubernetes-textbook-main/04-클러스터-운영/18-워크로드-보안.md (18.4 한계·메타데이터 ipBlock·티어 예시, 18.6 Kyverno generate)
- kubernetes-textbook-main/04-클러스터-운영/13-네임스페이스와-멀티테넌시.md (13.5 번들, 13.6 HNC)
- kubernetes-textbook-main/05-내부-동작-파헤치기/23-CNI와-대규모-네트워크-트러블슈팅.md (23.3 Calico GNP, 비교표, Antrea, Hubble)
- kubernetes-textbook-main/03-애플리케이션-노출과-데이터/11-인그레스와-외부-트래픽-라우팅.md (11.2 `Host` 헤더 재현, 11.3·11.7)

## 형식 검증
- 상대 링크 스크립트 확인: 깨진 링크 없음(입문 책 링크는 `%20` unquote 후 존재 확인).
- `<details>` 짝: 21장 14/14, 23장 9/9. 코드펜스 짝 정상. 물결표: 새로 쓴 구간은 `&#126;` 사용(23장·부록 A의 기존 `~`는 원본 그대로).
- 실행 검증됨 주장 없음. 추론은 `> **[보충]**`로 표시(21장 1.2 도식, 2.2, 3.4, 4.1, 23장 2.3).
- 학습 가이드(`00-학습-가이드/`)는 수정하지 않음. 플래시카드·코어 노트에는 21장 코어 문구(한 문장·코어 1~4 제목·인출 질문 번호)가 바뀐 것이 반영되어 있지 않으므로 동기화 필요.
