# 심화화 기록 g5 (3부 17·18·19·20장, 입문 책 21·22·23장 대응)

판정 기준: (a) 입문 책과 사실상 동일 수준 = 중복, (b) 심화 책에만 있는 깊이 = 비중복. 크기는 바이트(CRLF 포함) 기준 전후.

## 17장 kube-proxy 데이터플레인 (44,024 -> 47,394, +3.4KB)

| 절 | 판정 | 교체 내용 · 새 원천 |
|---|---|---|
| 코어 1 문장 | 중복(입문 코어 4와 같은 말) | 훅 위치(PREROUTING/OUTPUT)·conntrack·`docker-proxy`와의 대조 관점으로 재작성 |
| 1.1 watch → 규칙 갱신 → 커널 처리 | 중복(입문 21장 4.1) | 3단계 설명을 "입문 책에서 배운 것" 1줄 + 링크로 축소. 노드 로컬 결정, 16·15장 연결만 유지. 새 절 내용: Docker `docker-proxy`(사용자 공간 중계 프로세스, 커널 DNAT의 보완)와 kube-proxy 대조. 원천: docker-fundamental/12 12.4 |
| 1.2 DNAT와 conntrack | 비중복 | 유지. [보충] 1건 추가(DNAT가 라우팅 결정보다 앞선 PREROUTING에서 일어남). 원천: docker-fundamental/15 15.4 |
| 2.3 헤어핀 | 비중복(입문에 없음) | 유지. Docker 헤어핀(과거 docker-proxy 우회, 최신 배포판은 커널 DNAT) 대조 단락 추가. 원천: docker-fundamental/15 15.4 |
| 3.2 iptables vs IPVS 표 | 부분 중복(앞 3행이 입문 21장 4.2 표와 동일) | 중복 3행 삭제, "입문 책에서 배운 것" 1줄(구판 IPVS 권고는 3.3 폐기 경로를 따른다고 명시). 비중복 3행(갱신 방식, 커널 요구사항, 부가 기능) 유지 |
| 2.1, 2.2, 2.4~2.6, 3.1, 3.3, 3.4, 진단표 | 비중복 | 변경 없음 |
| 인출 연습 | - | 인출 질문 10번 추가(docker-proxy와 kube-proxy, 헤어핀 비교 → 코어 1·2). 원문 근거 줄에 docker-fundamental/12, /15 추가 |

바뀐 절 4개(1.1 축소+대체, 1.2 보충, 2.3 보강, 3.2 표 축소).
깊이 대체 원천이 사실상 얕았다. 17장은 이미 원천 Internals 15·textbook 23.4~23.5를 모두 소화한 상태라 줄일 중복이 적었고, 새 깊이는 Docker 쪽 원천에서만 나왔다.

## 18장 DNS와 서비스 디스커버리 (39,736 -> 42,661, +2.9KB)

| 절 | 판정 | 교체 내용 · 새 원천 |
|---|---|---|
| 코어 2 문장·학습 목표 | 중복(입문 코어 3과 같은 말) | "search/ndots는 리졸버 규칙이고 비용은 CoreDNS에 흔적으로 남는다"로 재작성 |
| 1.3 kube-dns Service·resolv.conf | 부분 중복(입문 22장 1.2) | 이름 유래·ClusterIP·resolv.conf 3줄 출력을 "입문 책에서 배운 것"으로 축소. kubelet `--cluster-dns` 주입과 쿼리 경로 도식은 유지 |
| 2.1 FQDN 규칙과 레코드 | 중복(입문 22장 2.1·2.2) | 레코드 표를 복습 줄로 축소, SRV(Kafka·Consul 용례)와 Pod `hostname`/`subdomain` 이름(`worker-a.workers...`)으로 교체. 원천: textbook 10.2 |
| 2.2 search + 2.3 ndots (합쳐 새 2.2) | 중복(입문 22장 3.1~3.2, 같은 google.com/예시) | 설명을 복습 줄로 축소하고, CoreDNS `log` 플러그인으로 NXDOMAIN→NOERROR 줄 관찰, Pod 안 tcpdump 비교, `getent` 시간 측정, `coredns_dns_requests_total` 메트릭(port-forward 9153)으로 교체. 원천: textbook 10.1, 10.3, 10.7, 과제 1. Docker 사용자 정의 네트워크 `ndots:0` 대조(원천: docker-fundamental/15 15.1, 9장 링크) |
| 2.4 완화책 (새 2.3) | 중복(입문 22장 3.3) | 3가지 표와 env 예시 삭제, 경계 조건(`ndots:1` vs `ndots:2`, 내부 FQDN의 끝 점)만 유지 |
| 2.5 dnsPolicy (새 2.4) | 중복(표) / 비중복(dnsConfig) | 4값 표와 hostNetwork 함정 단락을 복습 줄로 축소. `dnsConfig` 옵션 예시(timeout/attempts/single-request-reopen), `dnsPolicy: None` 사내 DNS, `hosts` 플러그인 vs `hostAliases` 범위 비교로 유지·보강 |
| 1.1, 1.2, 1.4, 코어 3(캐시·conntrack 5초·NodeLocal·진단 5단계·증상표) | 비중복 | 변경 없음 |
| 인출 연습 | - | 백지 복습 코어 2 재작성, 인출 질문 3·4번을 log 관찰·ndots 증거 확정 질문으로 교체, 5번에 dnsConfig 보충(→ 코어 2 (2.4)). 원문 근거 줄에 10.7, docker-fundamental/15 추가 |

바뀐 절 5개(2.1, 2.2+2.3 병합, 2.4 개편, 1.3 축소) + 코어 문장.
깊이 대체 원천이 얕았다. 18장도 Internals 16·textbook 10을 거의 다 소화해, 새 사실은 10.7 실습·메트릭·hostname/subdomain 정도뿐이다.

## 19장 Ingress와 Gateway API (39,869 -> 43,498, +3.6KB)

| 절 | 판정 | 교체 내용 · 새 원천 |
|---|---|---|
| 코어 1 문장·학습 목표 | 중복(입문 코어 2) | "컨트롤러는 조정 루프, 데이터 경로에 있는지는 구현마다 다르다"로 재작성 |
| 1.1 왜 필요한가 | 중복(입문 23장 1.1) | 복습 줄로 축소(남북/동서 도식만 유지) |
| 1.2 Ingress vs IngressController | 중복(입문 23장 2.1 표·ADDRESS) | 표·명령 삭제, 복습 줄 + 조정 루프의 desired state 관점(원천 Internals 17.1) |
| 1.5 IngressClass와 주요 컨트롤러 | 부분 중복(컨트롤러 표) | 컨트롤러 표·장단점 단락 삭제. IngressClass YAML과 nginx-ingress/ingress-nginx 구분은 유지 |
| 1.6 (새) 클라우드 네이티브 컨트롤러는 데이터 경로에 없다 | 비중복 신규 | ALB 컨트롤러가 요청 경로에 없음, IP target vs instance target, readiness와 ALB health check, readiness gate, TLS 종료 위치, 실패 지점 순서, 클라우드별 특징·ingress-nginx와의 추가 비교축. 원천: kubernetes-qustion-book/02_심화/06 5절, 16 3절, textbook 11.5b |
| 2.1 호스트·경로 기반 라우팅 | 중복(입문 23장 1.2·1.3: pathType 표, Prefix 예시, 호스트 기반, defaultBackend) | 복습 줄 + 정규식 경로/`rewrite-target`($2) 변환과 상대 경로 함정에 집중(비중복 부분 유지) |
| 2.2 TLS 종료와 cert-manager | 부분 중복(tls YAML, Secret 생성) | tls YAML·`kubectl create secret` 삭제, 복습 줄. Secret watch·ClusterIssuer solvers·HTTP-01/DNS-01·30일 갱신은 유지. cluster-issuer 애노테이션은 문장으로 흡수 |
| 2.3 애노테이션 난립 | 비중복 | ingress-nginx 애노테이션 영역별 표(리다이렉트·제한, 레이트 리밋·세션, CORS·인증·접근 제어, 백엔드 프로토콜) 추가. 원천: textbook 11.4 |
| 3.1 GatewayClass→Gateway→Route | 비중복 | `ReferenceGrant`(네임스페이스를 넘는 참조에 관여) 한 단락 추가. 원천: qustion-book 06 5절 |
| 3.3 Ingress와 Gateway API 나란히 | 중복(3.2 표와 겹침) | 표 삭제, 3.2 표 참조 + "컨트롤러 교체 시" 차이만 유지 |
| 1.3, 1.4, 3.2, 3.4, 코어 3 나머지 | 비중복 | 변경 없음(1.3의 [보충] 1건·1.4 도식·3.4 [보충] 단축 제외) |
| 시나리오·인출 | - | 시나리오 2번을 입문과 같던 404/502/503/504 구분에서 "ALB 있고 503"으로 교체. 백지 복습 코어 1·2 수정, 인출 질문 4번(pathType → rewrite 변환·상대 경로)과 9번(ALB, 신규) 변경. 원문 근거 줄에 qustion-book 06·16 추가 |

바뀐 절 8개(1.1, 1.2, 1.5, 2.1, 2.2, 2.3, 3.1, 3.3) + 신규 1.6.

## 20장 서비스 메시 데이터플레인 (29,605, 변경 없음)

| 절 | 판정 |
|---|---|
| 전체 | 비중복. 입문 책 23장에는 서비스 메시가 4.3의 [보충] 한 줄(남북/동서)뿐이고, 사이드카 주입·mTLS·앰비언트·도입 판단은 입문 책에 없다. 원천(Internals 17.3~17.4, textbook 11.6)도 이미 다 소화되어 있어 교체할 깊이가 없다 |

## 공통 메모

- 모든 신규 사실은 원천 파일을 읽고 썼다. 새로 들인 원천: textbook 10.2·10.3·10.7(DNS), textbook 11.4·11.5b(Ingress), kubernetes-qustion-book 02_심화/06·16(ALB), docker-fundamental 12.4·15.1·15.4(docker-proxy, hairpin, 내장 DNS ndots:0), linux/06(getaddrinfo 블로킹: 이미 2장에 있어 링크만).
- 분량: 중복 삭제분보다 신규 관찰·ALB 절이 커서 세 장 모두 +3KB 안팎 늘었다. 더 줄이려면 18장 3.4 진단 트리, 19장 3.1·3.2 YAML 중복(Gateway/HTTPRoute 예시 두 벌)을 줄이면 된다.
- 형식 점검: 상대 링크 39개 존재 확인(%20 unquote), `<details>` 짝 일치, 물결표 `~` 없음, 줄바꿈 CRLF 통일. 학습 가이드(00-학습-가이드/)는 건드리지 않았다.
- 학습 가이드 동기화 필요 항목(리드용): 17장 인출 질문 9→10개, 18장 인출 질문 3·4번 교체·백지 복습 코어 2 변경, 19장 1.6 신설·인출 질문 4번 교체·9번 추가(플래시카드·코어 노트 영향).
