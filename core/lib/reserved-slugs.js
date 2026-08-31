/* =========================================================
   CORE - RESERVED SLUGS

   공개 홈 slug로 쓸 수 없는 예약어. onboarding/onboarding.js의
   클라이언트 1차 검증이 이 배열을 그대로 쓴다.

   ★ 이 배열을 바꿀 때는 complete_onboarding() RPC 내부의
   동일한 배열도 반드시 같이 바꿀 것(단일 소스가 구조적으로
   불가능한 이유는 이 저장소에 빌드 스텝이 없어서 JS 배열을
   SQL로 자동 반영할 수 없기 때문 — 수동 동기화 규칙).
========================================================== */

const RESERVED_SLUGS =
  [
    "admin",
    "auth",
    "onboarding",
    "home",
    "posts",
    "customize",
    "themes",
    "core",
    "images",
    "models",
    "api",
    "www"
  ];
