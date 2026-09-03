/* =========================================================
   HOME - SITE OWNER RESOLVER

   공개 홈페이지가 "누구의 것인지"를 URL 첫 path segment
   (/:slug)로 식별한다. profiles 테이블은 이미 anon에게
   (user_id, slug, nickname, bio, home_mode) 컬럼 select가
   공개되어 있음(supabase/migrations/20260830140000_..._rls_
   ....sql 참고) — 그 권한을 그대로 사용한다.

   slug 파싱(getSiteOwnerSlugFromPath, RESERVED_SLUGS 제외
   처리 포함)은 core/lib/site-path.js에 있음 — supabaseClient
   (core/lib/supabase-client.js)와 함께 이 파일보다 먼저
   로드돼야 함(index.html 순서 참고). 이 파일은 home/bgm.js,
   home/categories.js, home/site-meta.js, 그리고
   posts/view/*의 여러 조회 함수보다 먼저 로드되어야 함
   — getSiteOwner()를 전역으로 제공한다.

   네 가지 상태를 명확히 구분한다(status 필드):
   - "unscoped": 유효한 slug segment 자체가 없음(루트 "/" 등) →
     { scoped: false, ownerId: null, status: "unscoped", homeMode: null }
     (무필터, 레거시/단일 사용자 배포 호환)
   - "found": slug segment가 있고 profiles에서 정상 조회됨 →
     { scoped: true, ownerId: "<uuid>", status: "found",
       homeMode: <profiles.home_mode 원본값> }
     homeMode는 DB 값을 가공 없이 그대로 전달한다 — "sua 테마로
     폴백해도 되는가"는 이 파일이 아니라 호출자(index.html의
     home_mode 렌더러 분기)가 "homeMode === 'legacy_sua'"라는
     단 하나의 조건으로 판단한다. 여기서 값을 정규화/추측하면
     안전 로직이 두 군데로 흩어진다.
   - "not_found": slug segment가 있는데 profiles에 매칭되는 행이
     없음(maybeSingle이 error 없이 data:null을 준 경우) →
     { scoped: true, ownerId: null, status: "not_found", homeMode: null }
   - "error": slug segment가 있는데 조회 자체가 실패(네트워크/DB
     오류, 예외 등) →
     { scoped: true, ownerId: null, status: "error", homeMode: null }

   not_found와 error를 같은 값으로 뭉뚱그리지 않는다 — maybeSingle()은
   원래부터 "매칭 0건"과 "쿼리 에러"를 error/data 조합으로 구분해서
   돌려주므로, 아래 구현은 그 둘을 나눠서 받기만 하면 된다.

   scoped/ownerId 필드는 기존 호출자(home/bgm.js,
   home/categories.js, home/site-meta.js, posts/view/*)와의 호환을
   위해 값과 의미를 그대로 유지한다 — 이 두 필드만 보는 호출자는
   not_found/error를 구분하지 못해도 지금과 동일하게 동작한다(둘 다
   "ownerId 없음"으로만 보임). status/homeMode를 실제로 구분해서
   쓰는 곳은 index.html의 home_mode 렌더러 분기뿐이다.

   RETRY: 모바일 Safari에서 로그인 직후 /:slug 진입 시 이 조회가
   간헐적으로 실패했다가 새로고침하면 성공하는 문제가 있었다(원인
   추정: 부트스트랩 스크립트 캐시/타이밍, build-version.js 기반
   cache-busting으로 별도 대응 중). 그 증상을 완화하기 위해 "진짜
   쿼리 에러 또는 예외"일 때만 500ms 후 1회 재시도한다.
   data:null + error:null인 정상 not_found는 재시도 대상이 아니다
   — 존재하지 않는 slug를 재시도로 인해 load-error로 바꾸면 안 됨.
========================================================== */

const siteOwnerSlug =
  getSiteOwnerSlugFromPath();


const SITE_OWNER_RETRY_DELAY_MS = 500;


let siteOwnerPromise =
  null;


function queryProfileBySlug() {

  return supabaseClient
    .from(
      "profiles"
    )
    .select(
      "user_id, home_mode"
    )
    .eq(
      "slug",
      siteOwnerSlug
    )
    .maybeSingle();

}


function delay(ms) {

  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );

}


function logSiteOwnerFailure(level, error, retryCount) {

  const payload =
    {
      slug: siteOwnerSlug,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? String(error),
      errorDetails: error?.details ?? null,
      errorHint: error?.hint ?? null,
      retryCount
    };


  if (level === "warn") {

    console.warn(
      "[home-owner]",
      payload
    );

  } else {

    console.error(
      "[home-owner]",
      payload
    );

  }

}


/*
  쿼리 1회 시도를 {ok:true, data} / {ok:false, error}로 통일해서
  돌려준다 — {data, error} 결과로 오는 쿼리 에러와, 쿼리 자체가
  reject하는 예외(네트워크 등)를 같은 모양으로 합쳐야 재시도
  로직을 한 곳에만 두고 두 경로 모두에 적용할 수 있다.
*/
async function attemptProfileQuery() {

  try {

    const {
      data,
      error
    } =
      await queryProfileBySlug();


    if (error) {

      return {
        ok: false,
        error
      };

    }


    return {
      ok: true,
      data
    };

  } catch (thrown) {

    return {
      ok: false,
      error: thrown
    };

  }

}


async function resolveSiteOwner() {

  let attempt =
    await attemptProfileQuery();

  let retryCount =
    0;


  if (!attempt.ok) {

    logSiteOwnerFailure(
      "warn",
      attempt.error,
      retryCount
    );

    await delay(
      SITE_OWNER_RETRY_DELAY_MS
    );

    retryCount =
      1;

    attempt =
      await attemptProfileQuery();

  }


  if (!attempt.ok) {

    logSiteOwnerFailure(
      "error",
      attempt.error,
      retryCount
    );

    return {
      scoped: true,
      ownerId: null,
      status: "error",
      homeMode: null
    };

  }


  if (!attempt.data) {

    /*
      maybeSingle()은 매칭되는 행이 0개일 때 error 없이 data:null만
      준다 — "존재하지 않는 slug"를 진짜 조회 실패와 구분할 수 있는
      지점이 바로 여기. 이 분기는 attempt.ok===true일 때만 오므로
      재시도를 거치지 않는다.
    */

    return {
      scoped: true,
      ownerId: null,
      status: "not_found",
      homeMode: null
    };

  }


  return {
    scoped: true,
    ownerId: attempt.data.user_id,
    status: "found",
    homeMode: attempt.data.home_mode
  };

}


function getSiteOwner() {

  if (siteOwnerPromise) {

    return siteOwnerPromise;

  }


  if (!siteOwnerSlug) {

    siteOwnerPromise =
      Promise.resolve(
        {
          scoped: false,
          ownerId: null,
          status: "unscoped",
          homeMode: null
        }
      );


    return siteOwnerPromise;

  }


  siteOwnerPromise =
    resolveSiteOwner();


  return siteOwnerPromise;

}
