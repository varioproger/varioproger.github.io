# verify_21 (21장 NetworkPolicy와 네트워크 보안)
원천: k8s-internals 18.1~18.4, textbook 10.6(90% 서술) 대조.
확인한 절: 코어 1(1.1~1.2), 코어 2(2.1), 코어 3(3.1~3.3), 코어 4(4.1~4.3), 시나리오 3개, 인출 질문 8개 = 약 17개 절/블록.
수정: 0건. 삭제: 0건. [보충] 전환: 0건.
점검: 기본 전허용/Pod·방향 단위 전환, policyTypes, egress: [], 합집합, AND/OR 예, CNI 시행표, iptables vs eBPF 설명, CiliumNetworkPolicy YAML, default-deny/DNS 허용 YAML, 패턴 1~4, AdminNetworkPolicy 우선순위·Pass·v1alpha1·ClusterNetworkPolicy v1alpha2, textbook의 '사고의 90%' 모두 일치. [보충](namespaceSelector 없음=같은 NS)은 원천 18.3 주석에 실제 존재.
남은 불확실성: 없음.
