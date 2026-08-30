/* =========================================================
   SUPABASE CLIENT (공통)

   home/categories.js(구 home/site-content.js), admin/admin.js에
   각각 있던 동일한 SUPABASE_URL / SUPABASE_KEY / createClient
   선언을 여기 하나로 모음.

   이 파일은 @supabase/supabase-js CDN 스크립트보다 뒤에,
   그리고 supabaseClient를 쓰는 다른 모든 스크립트보다
   먼저 로드되어야 함(index.html / admin/index.html 참고).

   전역 SUPABASE_URL / SUPABASE_KEY / supabaseClient 이름은
   기존과 동일하게 유지.
========================================================== */

const SUPABASE_URL =
  "https://vtwcuvouyipohfonfukj.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_9KQkblZdg92IPiB-p5_g0w_tG7HsMuG";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );
