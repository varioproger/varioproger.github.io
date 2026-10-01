---
title: "프로그래머를 위한 Linux vs Windows: 두 OS는 어디서 갈라지는가"
---

# 프로그래머를 위한 Linux vs Windows: 두 OS는 어디서 갈라지는가

> "같은 C 코드가 리눅스에서는 돌고 Windows에서는 안 돈다. 문제는 문법이 아니라 그 아래 커널의 세계관이 다르기 때문이다."

이 책은 리눅스와 Windows를 **프로그래머가 실제로 부딪히는 지점**에서 나란히 놓고 비교한다. "어느 쪽이 좋은가"가 아니라 "왜 다르게 만들어졌고, 그래서 내 코드는 어떻게 달라져야 하는가"를 다룬다.

같은 폴더 구조의 개별 편(`../book/`의 리눅스 편, `../../window os/book/`의 Windows 편)이 각 OS를 깊게 다룬다면, 이 책은 **두 편을 가로로 잇는 비교표**다. 개별 편을 읽지 않았어도 이해할 수 있도록 필요한 개념은 이 책 안에서 다시 설명한다.

## 대상 독자

- 리눅스 서버 코드를 Windows로, 또는 Windows 애플리케이션을 리눅스로 이식해야 하는 개발자
- Go, Rust, .NET, Node.js, Python처럼 크로스 플랫폼 런타임을 쓰면서 "왜 이 기능은 Windows에서만 다르게 동작하는지" 궁금한 개발자
- 한쪽 OS에는 익숙하지만 다른 쪽은 용어부터 낯선 개발자 (fd가 뭔지는 알지만 HANDLE은 모르는, 또는 그 반대)
- 면접이나 설계 리뷰에서 "epoll과 IOCP의 차이", "fork가 Windows에 없는 이유"를 정확히 설명해야 하는 개발자

## 목차

| 장 | 파일 | 한 줄 요약 |
|---|---|---|
| 1 | [시작하며](01_시작하며.md) | 왜 비교해서 배워야 하는가, 네 개의 갈림길 |
| 2 | [설계 철학과 구조](02_설계철학과_구조.md) | 모놀리식 vs 하이브리드, 시스템 콜 ABI, "모든 것은 파일" vs "모든 것은 오브젝트" |
| 3 | [메모리](03_메모리.md) | 주소 공간, mmap vs VirtualAlloc, 오버커밋 vs 커밋 차지, 힙 구현, 페이지 캐시 vs 워킹 셋 |
| 4 | [프로세스](04_프로세스.md) | fork/exec vs CreateProcess, 좀비와 핸들, 시그널의 부재, ELF vs PE, 권한 모델 |
| 5 | [스레드와 동시성](05_스레드와_동시성.md) | task_struct vs ETHREAD, futex vs CRITICAL_SECTION, WaitForMultipleObjects vs epoll, 스케줄러 |
| 6 | [네트워크](06_네트워크.md) | BSD 소켓 vs Winsock, readiness vs completion, epoll vs IOCP, io_uring |
| 7 | [파일 시스템과 I/O](07_파일시스템과_IO.md) | 경로와 대소문자, 열린 파일 삭제, 공유 모드, 버퍼링과 fsync, 파일 잠금 |
| 8 | [개발 환경: 툴체인, ABI, 디버깅](08_개발환경.md) | gcc vs MSVC, System V vs Win64 ABI, 동적 링킹, 디버거와 프로파일러 |
| 9 | [크로스 플랫폼 설계 전략](09_크로스플랫폼_설계.md) | 추상화 계층을 어디에 둘 것인가, libuv/Tokio/.NET의 선택 |
| 10 | [마무리](10_마무리.md) | 한 장 요약표, 더 읽을 책 |

## 읽는 법

- 1~2장은 나머지 장의 용어를 정의하므로 먼저 읽는 것을 권한다. 3~7장은 관심 있는 주제부터 읽어도 된다.
- 각 장은 **같은 뼈대**로 구성했다: 개념 정의 → 리눅스 방식 → Windows 방식 → 왜 다른가 → 이식할 때 부딪히는 문제 → 실전 체크리스트.
- 예제는 C로 썼다. 리눅스는 POSIX API, Windows는 Win32 API를 그대로 노출한다. 다른 언어의 런타임은 결국 이 두 API 위에 있으므로, 여기서 본 차이가 그 언어에서 어떻게 드러나는지 각 장 끝의 "런타임에서는" 절에 정리했다.

## 참고서

- Michael Kerrisk, *The Linux Programming Interface* (No Starch Press, 2010) — 리눅스 쪽 API 레퍼런스
- Brian Ward, *How Linux Works, 3rd Edition* (No Starch Press, 2021) — 리눅스 시스템 전체 동작
- Pavel Yosifovich, Mark Russinovich 외, *Windows Internals Part 1 (7th) / Part 2 (7th)* (Microsoft Press) — NT 커널 내부
- Jeffrey Richter, Christophe Nasarre, *Windows via C/C++ (5th)* (Microsoft Press, 2007) — Win32 API 관점의 프로세스, 스레드, 메모리

각 장 끝의 "더 깊이" 항목에서 해당 책의 장 번호를 표시했다.
