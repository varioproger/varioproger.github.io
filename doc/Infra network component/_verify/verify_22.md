# verify_22 (22장 eBPF 데이터플레인과 Cilium)
원천: k8s-internals 19.1~19.5, 18.2(iptables vs eBPF 시행) 대조.
확인한 절: 코어 1(1.1~1.3), 코어 2(2.1~2.2), 코어 3(3.1~3.4), 시나리오 3개, 인출 질문 8개 = 약 15개 절/블록.
수정: 0건. 삭제: 0건. [보충] 전환: 0건.
점검: verifier/샌드박스/JIT, XDP vs TC, 해시 맵 룩업, cilium-agent·맵 구조, kubeProxyReplacement helm/확인 명령, 소켓 레벨 LB 비교, 정책 TC 경로 5단계, verifier 복잡도 예산·tail call, conntrack 한계와 sysctl 명령, hubble/cilium monitor 명령 모두 일치. 🎮 박스의 'kube-proxy도 죽어도 계속 동작' 주장은 17장·원천 15장에 근거 있음.
남은 불확실성: 🎮 박스의 'DPDK류 유저 공간 네트워킹' 언급은 원천에 없는 일반 유추(학습 장치로 유지).
