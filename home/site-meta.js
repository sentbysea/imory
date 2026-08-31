/* =========================================================
   HOME - BLOG TITLE / CURSOR

   getSiteOwner()는 home/site-owner.js에 있음(이 파일보다
   먼저 로드돼야 함 — index.html 순서 참고). supabaseClient는
   core/lib/supabase-client.js에서 전역으로 만들어짐.

   site_settings에서 blog_title/cursor_url을 읽어 값이 있을
   때만 적용한다. 값이 없거나 owner slug 조회 자체가 실패한
   경우(잘못된 slug)에는 아무 것도 하지 않고 정적 마크업의
   기본값(<title>Imory</title>, 기본 커서)을 그대로 둔다.
========================================================== */

async function applyBlogTitle(
  owner
) {

  let query =
    supabaseClient
      .from(
        "site_settings"
      )
      .select(
        "value"
      )
      .eq(
        "key",
        "blog_title"
      );


  if (owner.scoped) {

    query =
      query.eq(
        "user_id",
        owner.ownerId
      );

  }


  const {
    data,
    error
  } =
    await query.maybeSingle();


  if (error) {

    console.error(
      "블로그 제목 불러오기 실패:",
      error
    );

    return;

  }


  const blogTitle =
    data?.value?.trim();


  if (blogTitle) {

    document.title =
      blogTitle;

  }

}


async function applyCursorSetting(
  owner
) {

  let query =
    supabaseClient
      .from(
        "site_settings"
      )
      .select(
        "value"
      )
      .eq(
        "key",
        "cursor_url"
      );


  if (owner.scoped) {

    query =
      query.eq(
        "user_id",
        owner.ownerId
      );

  }


  const {
    data,
    error
  } =
    await query.maybeSingle();


  if (error) {

    console.error(
      "마우스 포인터 설정 불러오기 실패:",
      error
    );

    return;

  }


  const cursorUrl =
    data?.value?.trim();


  if (
    !cursorUrl ||
    !/^https?:\/\//.test(
      cursorUrl
    )
  ) {

    return;

  }


  const style =
    document.createElement(
      "style"
    );


  style.textContent =
    `body { cursor: url("${cursorUrl}"), auto; }`;


  document.head.appendChild(
    style
  );

}


async function loadSiteMeta() {

  const owner =
    await getSiteOwner();


  /*
    slug segment가 있는데 조회에 실패했으면(잘못된 slug)
    무필터로 새지 않고 그냥 기본값(Imory 타이틀, 기본 커서)을
    유지한다.
  */

  if (
    owner.scoped &&
    !owner.ownerId
  ) {

    return;

  }


  await applyBlogTitle(
    owner
  );


  await applyCursorSetting(
    owner
  );

}


loadSiteMeta();
