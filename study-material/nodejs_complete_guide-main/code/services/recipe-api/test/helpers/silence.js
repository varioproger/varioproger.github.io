// 테스트 중 로그를 끈다.
//
// 이 파일이 따로 존재하는 이유가 곧 2장의 내용이다. ESM 은 모듈 본문을 실행하기
// 전에 import 를 먼저 평가한다. 따라서 build-app.js 본문 맨 위에
// process.env.LOG_LEVEL = 'silent' 를 써도, 그 시점에는 이미 @ncg/shared/logger 가
// 평가를 마치고 LOG_LEVEL 을 읽어 간 뒤다. 환경 변수를 로거보다 먼저 세우려면
// "로거를 import 하는 모듈보다 먼저 평가되는 모듈"이 필요하다. import 문의 순서가
// 곧 평가 순서이므로, 이 모듈을 로거 import 보다 위에 두면 의도대로 동작한다.
process.env.LOG_LEVEL ??= 'silent';
