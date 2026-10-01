---
title: "프로그래머를 위한 리눅스 OS 필수 지식"
---

# 프로그래머를 위한 리눅스 OS 필수 지식

"코드는 짜는데, 그 아래에서 커널이 무슨 일을 하는지는 모르겠다"는 간극을 메우기 위한 책이다. 리눅스/POSIX를 기준으로, 서버·백엔드·시스템 프로그래머가 **실무에서 실제로 마주치는** OS 지식만 골라 담았다.

## 목차

| 장 | 파일 | 한 줄 요약 |
|---|---|---|
| 1 | [시작하며](01_시작하며.md) | 왜 프로그래머가 OS를 알아야 하는가, 이 책의 관점 |
| 2 | [OS 큰 그림](02_OS_큰그림.md) | 커널/유저 모드, 시스템 콜, errno, 스케줄러, `/proc` |
| 3 | [프로세스](03_프로세스.md) | fork/exec/wait, COW, 좀비, 프로세스 그룹과 데몬, IPC |
| 4 | [스레드와 동시성](04_스레드와_동시성.md) | pthread, futex, 메모리 가시성, 데드락, 스레드 안전성 |
| 5 | [메모리](05_메모리.md) | 가상 메모리, malloc 내부, RSS/VSZ, 오버커밋과 OOM, 페이지 캐시, cgroup |
| 6 | [네트워크](06_네트워크.md) | 소켓, TCP 스트림 경계, TIME_WAIT, epoll/io_uring, C10K |
| 7 | [파일시스템과 I/O](07_파일시스템과_IO.md) | fd와 open file table, inode, 버퍼링과 fsync, 원자성 |
| 8 | [시그널](08_시그널.md) | SIGTERM/SIGPIPE/SIGCHLD, 핸들러 안전성, signalfd |
| 9 | [디버깅과 도구](09_디버깅과_도구.md) | strace, perf, gdb, /proc, ss, 문제 유형별 첫 명령 |
| 10 | [마무리](10_마무리.md) | 반복된 패턴, 한 장 요약, 더 읽을 책 |

## 읽는 법

- 1~2장을 먼저 읽고, 나머지는 필요한 장부터 골라 읽어도 된다. 장 사이 참조는 링크로 연결했다.
- 각 장 끝의 **실전 체크리스트**는 코드 리뷰나 장애 분석 때 바로 꺼내 쓸 수 있게 만들었다.
- 예제 코드는 C(POSIX API)로 썼다. 다른 언어의 런타임도 결국 이 API 위에 있으므로, 개념은 그대로 적용된다.

## 참고서

이 폴더의 두 책을 기반으로 했다.

- Michael Kerrisk, *The Linux Programming Interface* (No Starch Press) — API 레벨의 정밀한 레퍼런스. 각 장 끝의 "더 깊이" 항목에서 해당 장 번호를 표시했다.
- Brian Ward, *How Linux Works, 3rd Edition* (No Starch Press) — 시스템 전체의 동작 원리와 운영 관점.

같은 구조의 Windows 편은 `../window os/book/`에 있다.
