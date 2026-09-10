/* =========================================================
   ADMIN SETTINGS — HOME > ETC (블로그 보호 설정)

   체크박스 세 개. 값은 site_settings의 key/value로 들어간다
   (blog_title / favicon_url / cursor_url과 같은 자리라 새 컬럼도
   migration도 필요 없다).

     strip_image_exif    올리는 이미지의 EXIF 제거
     block_context_menu  방문자 우클릭 차단   (주인장 제외)
     block_text_copy     방문자 복사 차단     (주인장 제외)

   값은 "on" / "off" 문자열이다. 읽는 쪽은
   core/lib/content-protection.js 하나이고, 공개 화면에서 실제로
   거는 곳은 home/site-meta.js다.

   기준 문서: IMORY_GALLERY1_DESIGN.md §13

   ★ 무엇을 보장하는지 (화면 안내와 같은 이야기)
   우클릭/복사 방지는 **브라우저 기본 동작을 막는 것**이지 접근
   통제가 아니다 — 개발자 도구·소스 보기·화면 캡처 앞에서는
   무력하다. EXIF 제거만 되돌릴 수 없는 실제 처리다.

   ★ 카테고리가 아니라 사이트 단위인 이유
   처음에는 카테고리 설정으로 만들었지만 그러면 HOME·배너처럼
   카테고리가 없는 화면에 적용할 대상이 없다. 블로그를 보호한다는
   말이 되려면 사이트 단위여야 한다.

   classic script. admin-settings-load.js 뒤에 로드된다 —
   admin-settings-category-display.js와 admin-image-setting.js가
   업로드 전에 imoryEtcStripImageExifEnabled()를 부른다.
========================================================== */

const IMORY_ETC_SETTING_KEYS =
  [
    "strip_image_exif",
    "block_context_menu",
    "block_text_copy"
  ];


const stripImageExifToggle =
  document.getElementById(
    "stripImageExifToggle"
  );

const blockContextMenuToggle =
  document.getElementById(
    "blockContextMenuToggle"
  );

const blockTextCopyToggle =
  document.getElementById(
    "blockTextCopyToggle"
  );

const etcSaveButton =
  document.getElementById(
    "etcSaveButton"
  );

const etcSaveMessage =
  document.getElementById(
    "etcSaveMessage"
  );


const etcToggleByKey =
  {
    strip_image_exif: stripImageExifToggle,
    block_context_menu: blockContextMenuToggle,
    block_text_copy: blockTextCopyToggle
  };


/*
  admin 안에서 "지금 EXIF를 지워야 하는가"를 묻는 곳들이 쓴다
  (카테고리 지정 이미지 · 파비콘 · 커서 업로드). 저장 전이라도
  화면의 체크 상태를 따른다 — 사용자가 방금 켠 것이 곧 의도다.
*/

function imoryEtcStripImageExifEnabled() {

  return Boolean(
    stripImageExifToggle &&
    stripImageExifToggle.checked
  );

}


/* admin-settings-save.js의 loadAdminSettings()가 부른다 */

async function loadEtcSettings(
  user
) {

  if (etcSaveMessage) {

    etcSaveMessage.textContent =
      "";

  }


  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "site_settings"
      )
      .select(
        "key, value"
      )
      .in(
        "key",
        IMORY_ETC_SETTING_KEYS
      )
      .eq(
        "user_id",
        user.id
      );


  if (error) {

    console.error(
      "load etc settings error:",
      error
    );


    if (etcSaveMessage) {

      etcSaveMessage.textContent =
        "설정을 불러오지 못했습니다.";

    }


    return;

  }


  const byKey =
    new Map(
      (data || []).map((row) => [row.key, row.value])
    );


  IMORY_ETC_SETTING_KEYS.forEach((key) => {

    const toggle =
      etcToggleByKey[key];


    if (toggle) {

      toggle.checked =
        (byKey.get(key) || "").trim() === "on";

    }

  });

}


etcSaveButton
  ?.addEventListener(
    "click",
    async () => {

      const {
        data: userData,
        error: userError
      } =
        await supabaseClient
          .auth
          .getUser();


      if (
        userError ||
        !userData.user
      ) {

        if (etcSaveMessage) {

          etcSaveMessage.textContent =
            "로그인이 필요합니다.";

        }


        return;

      }


      const user =
        userData.user;


      etcSaveButton.disabled =
        true;


      if (etcSaveMessage) {

        etcSaveMessage.textContent =
          "저장 중...";

      }


      /*
        세 값을 한 번에 upsert한다 — 하나만 성공하고 나머지가
        실패하는 상태를 만들지 않는다.
      */

      const rows =
        IMORY_ETC_SETTING_KEYS.map((key) => ({

          user_id:
            user.id,

          key,

          value:
            (etcToggleByKey[key] && etcToggleByKey[key].checked)
              ? "on"
              : "off"

        }));


      const {
        error
      } =
        await supabaseClient
          .from(
            "site_settings"
          )
          .upsert(
            rows,
            {
              onConflict:
                "user_id,key"
            }
          );


      etcSaveButton.disabled =
        false;


      if (error) {

        console.error(
          "etc settings save error:",
          error
        );


        if (etcSaveMessage) {

          etcSaveMessage.textContent =
            "저장에 실패했습니다.";

        }


        return;

      }


      if (etcSaveMessage) {

        etcSaveMessage.textContent =
          "saved ♡";

      }

    }
  );
