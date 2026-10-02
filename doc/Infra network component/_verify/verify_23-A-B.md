# verify 23 / A / B

## 23장 (4부-진단/23-네트워크-장애-진단.md)
확인한 절: 1.1~1.4, 2.1~2.5, 3.1~3.5, 시나리오 3개, 인출 질문 6개 (원천: Internals 19.3~19.5/부록 A.9·A.11, textbook 9.7·10.5·10.6·11.7·23.4~23.6, docker 12.2·12.6·15.7, linux 6.3)
수정 2건:
- 코어 표 4행 "`ss -s`, 임시 포트·TIME_WAIT 점검 (linux/06)" -> "임시 포트·TIME_WAIT 점검 (linux/06), `ss -s`" (ss -s는 linux/06이 아니라 Internals 19.3·linux/09 출처, 귀속 오류)
- 2.4 Ingress 확인 순서에서 원천 11.7의 ⑤(nginx.conf 확인 명령)가 빠져 요약("생성 설정")과 어긋남 -> 해당 단계와 명령 추가
삭제 0, [보충] 전환 0.
수치(1450/1480/1440/8951/1410, 80%, 32768~60999, 2^(24-16)=256, 22,000 규칙), 명령, YAML, 체인, KEP-5495 일정 모두 원천과 일치.
남은 불확실성: 시나리오 3의 "재시작하면 잠깐 괜찮아진다"는 원천에 없는 가상 증상(학습 장치로 둠).

## 부록 A 용어집
확인: 약 100개 항목을 linux/06, docker 02·11~18, Internals 13~19, textbook 9·10·11·19·23 및 qustion 16과 대조(Docker 28.0.0, nat-unprotected, Mirantis 2030, 29.5 gvisor-tap-vsock, pasta 25.0, docker-bridges, DNSRR, ndots:0, EndpointSlice 100개, KEP-5495, ANP v1alpha1/Pass, 0x4000, NodePort 범위 등 모두 일치).
수정 3건(† 부적정): 원천이 실제로 정의하므로 † 제거
- MTU † (textbook 부록 E 용어집에 정의)
- ARP † (docker 18.3에 정의)
- 남북/동서 트래픽 † (Internals 17, textbook 11.6에 정의)
유지: NDP/ULA/SLAAC † (NDP·ULA는 정의되나 SLAAC는 용어만 쓰고 정의 없음, 항목 단위 † 유지).
남은 불확실성: "ndots:5 흔한 장애 원인"은 18장 계열 서술을 요약한 것(세부 미재확인).

## 부록 B 명령어 모음
확인: 명령 약 130줄을 원천 grep으로 전수 대조. 원천에 없는 명령 없음(`iptables-save | grep -A 5 "DOCKER"`는 docker 16에, `docker network inspect --format '{{json .Containers}}'`는 docker 11에 있음).
수정 1건:
- 머리말 "순서는 23장의 진단 순서(소켓 → ... )를 따른다" -> 절 순서는 아래 계층에서 위로 올라가는 순이며 23장의 확인 순서(DNS→노드 간→Service→정책→자원)와 다르다고 정정, 14절 색인 안내 추가(사실 오류).
남은 불확실성: 없음 (실행 검증은 하지 않았음).
