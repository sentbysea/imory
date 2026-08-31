/* =========================================================
   HOME - SITE OWNER RESOLVER

   공개 홈페이지가 "누구의 것인지"를 URL의 ?u=slug 파라미터로
   식별한다. profiles 테이블은 이미 anon에게 (user_id, slug,
   nickname, bio, home_mode) 컬럼 select가 공개되어 있음
   (supabase/migrations/20260830140000_..._rls_....sql 참고)
   — 그 권한을 그대로 사용한다.

   supabaseClient는 core/lib/supabase-client.js에서 전역으로
   만들어짐(index.html에서 이 파일보다 먼저 로드됨). 이 파일은
   home/bgm.js, home/categories.js, home/site-meta.js, 그리고
   posts/view/*의 여러 조회 함수보다 먼저 로드되어야 함
   (index.html 순서 참고) — getSiteOwner()를 전역으로 제공한다.

   세 가지 상태를 명확히 구분한다:
   - ?u= 자체가 없음 → { scoped: false, ownerId: null } (무필터,
     레거시/단일 사용자 배포 호환)
   - ?u=slug가 있고 profiles에서 정상 조회됨 → { scoped: true,
     ownerId: "<uuid>" }
   - ?u=slug가 있는데 조회 실패(존재하지 않는 slug 등) →
     { scoped: true, ownerId: null } — 호출자는 이 경우 절대
     무필터로 폴백하지 말고 각자의 not-found/빈 상태로 처리해야 함.
========================================================== */

const siteOwnerSlug =
  new URLSearchParams(
    window.location.search
  ).get(
    "u"
  );


let siteOwnerPromise =
  null;


function getSiteOwner() {

  if (siteOwnerPromise) {

    return siteOwnerPromise;

  }


  if (!siteOwnerSlug) {

    siteOwnerPromise =
      Promise.resolve(
        {
          scoped: false,
          ownerId: null
        }
      );


    return siteOwnerPromise;

  }


  siteOwnerPromise =
    supabaseClient
      .from(
        "profiles"
      )
      .select(
        "user_id"
      )
      .eq(
        "slug",
        siteOwnerSlug
      )
      .maybeSingle()
      .then(
        ({
          data,
          error
        }) => {

          if (
            error ||
            !data
          ) {

            console.error(
              "site owner slug 조회 실패:",
              error
            );


            return {
              scoped: true,
              ownerId: null
            };

          }


          return {
            scoped: true,
            ownerId: data.user_id
          };

        }
      );


  return siteOwnerPromise;

}
