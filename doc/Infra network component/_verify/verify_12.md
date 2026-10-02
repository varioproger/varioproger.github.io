# verify_12 (12장 IPv6 듀얼스택과 Rootless 네트워킹)
원천: docker-fundamental/18 (18.1~18.5+실습), 17 (17.1~17.6+실습)
- 확인한 절: 18.1~18.5, 17.1~17.6, 두 장의 실습 (전부 대조)
- 수정 0건. daemon.json 예시, --ipv6 명령, NDP/ULA/NAT66, 29.8.1, Docker 25.0 pasta, v29.5 gvisor-tap-vsock, 1024 미만 포트 sysctl, ping_group_range, DOCKERD_ROOTLESS_ROOTLESSKIT_NET 등 모두 원천과 일치
- 삭제 0건, [보충] 전환 0건
- 링크(3/4/7/8/10/11장) 존재 확인, details 13쌍 짝 일치
- 남은 불확실성: 기억 고리의 IPV6_V6ONLY 유추는 학습 장치(원천 사실 아님)로 둠.
