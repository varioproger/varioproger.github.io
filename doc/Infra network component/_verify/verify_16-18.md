# verify 16~18 (3부 쿠버네티스 네트워크)

## 16장 Service와 EndpointSlice
- 대조 원천: k8s-internals 14 전체(14.1~14.4), textbook 9.1~9.4·9.7, textbook 6.4(종료 흐름), qustion 06(3·4절)·07(Service/EndpointSlice). 약 14개 절 대조.
- 수정: 0건. 수치(30000-32767, 100개/상한 1000, 10800/86400, v1.21+), 필드표, YAML, 종료 흐름(수백 ms~수 초, 기본 30초, exitCode 137), 진단 ①~⑧, 시나리오·인출 답 모두 원천과 일치.
- 삭제/[보충] 전환: 0건. 기존 [보충] 2개(헤드리스 분류 충돌, 게임 서버 해석)는 적절.
- 불확실성: 없음(MetalLB L2/BGP 문장은 textbook 9.2에 근거).

## 17장 kube-proxy 데이터플레인
- 대조 원천: k8s-internals 15 전체(15.1~15.6), internals 06 6.5, textbook 9.5, textbook 23.4·23.5(규칙 수 추정, conntrack). 약 12개 절.
- 수정 2건:
  1. "13장에서 CNI가 노드 간에 패킷을 옮기는 방법을 정했다면" -> 15장 링크로 변경 (원천의 13장은 이 책의 CNI 플러그인·패킷 경로 장에 해당, 이 책의 13장은 모델/Pod 네트워크라 참조가 어긋남).
  2. 체크리스트 "노드에서 kubectl logs" -> "노드에서" 삭제 (kubectl logs는 노드 명령이 아님; 원천은 kubectl logs만 제시).
- 확인된 사실: 확률 1/(N-i+1), 0.33333/0.50000, 0x4000 마크 규칙 3줄, iptables-restore --noflush, IPVS 스케줄러 표, KEP-5495 일정표(v1.35/1.37/1.40/1.43), nftables GA·기본값 별개, conntrack 80%/sysctl 값(두 원천 값 차이는 [보충]에 기록됨), 22,000 규칙 계산.
- 삭제 0건, [보충] 전환 0건.
- 불확실성: IPVS/nftables 상태·버전은 원천(internals)이 "현재 v1.37"로 쓴 시점 기준 — 이미 장에 명시됨.

## 18장 DNS와 서비스 디스커버리
- 대조 원천: k8s-internals 16(16.1~16.4), textbook 10.1~10.6·10.7. 약 11개 절.
- 수정: 0건. Corefile, 플러그인 9행 표, resolv.conf, 레코드 표, SRV, ndots 4쿼리×(A/AAAA)=최대 8패킷, dnsPolicy 표, dnsConfig 예, NodeLocal(169.254.20.10, __PILLAR__ 값, TCP 업스트림), 진단 플로차트·증상표, 90% 문구, autoscaler 예시 모두 일치.
- 삭제/[보충] 전환: 0건. 기존 [보충](반영 지연 30초 vs 수십 초, 예시 차이 등) 적절.
- 불확실성: 없음.

## 형식 점검
- front matter, 표 앞 빈 줄, <details> 짝(16:13, 17:12, 18:11), 상대 링크 대상 파일 존재 모두 확인. 산문 물결표 없음(코드블록 내 ~는 허용). "실행 검증됨" 표현 없음.
