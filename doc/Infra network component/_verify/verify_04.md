# verify_04 (1부 04-veth-브리지-라우팅-ARP.md)
확인한 절: 코어 1~4 전 소절, 표, 시나리오 3, 인출 질문 9 (원천: docker-fundamental 12.1~12.3, 18.3 NDP; K8s Internals 13.5 경로/kindnet, 15.2 strict ARP, 19 veth 캡처; textbook 19.3, 23.6 ip neigh·증상표, 09 MetalLB).
수정: 0건. veth/@ifN, FDB, brctl->bridge, 10.99.0.x 구성 명령, proto bird, scope host, NDP(ICMPv6 NS/NA 멀티캐스트), kube-ipvs0 NOARP/arp_ignore·arp_announce, MetalLB ARP/BGP 모두 일치.
삭제/[보충] 전환: 0건 (기존 [보충] 4건 적절).
링크/details 짝/front matter/표 앞 빈 줄/물결표 이상 없음.
