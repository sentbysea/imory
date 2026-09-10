/* =========================================================
   ADMIN SETTINGS - SAVE

   admin-settings.js 분할본 중 마지막. DOM 참조는
   admin-settings-load.js에 있음(반드시 먼저 로드돼야 함).

   내용: 로그인한 유저의 설정 전체 불러오기, 닉네임/BGM/블로그
   제목/카테고리 저장, 회원 탈퇴.
   아바타는 admin-settings-avatar.js, 파비콘/커서는
   admin-favicon.js·admin-cursor.js, HOME>ETC 보호 설정은
   admin-etc-settings.js가 각각 담당한다.
========================================================== */


/* =========================================================
   SETTINGS 전체 불러오기
========================================================== */

async function loadAdminSettings(
  user
) {

  await loadNickname(
    user
  );


  await loadAvatar(
    user
  );


  await loadCategories(
  user
);


  await loadBlogTitle(
    user
  );


  await loadFavicon(
    user
  );


  await loadCursorSetting(
    user
  );


  await loadBgm(
    user
  );


  await loadEtcSettings(
    user
  );


  await loadMyBanner(
    user
  );

}



/* =========================================================
   BGM 저장
========================================================== */

bgmSaveButton
  .addEventListener(
    "click",
    async () => {

      const {
        data:
        userData,

        error:
        userError
      } =
        await supabaseClient
          .auth
          .getUser();


      if (
        userError ||
        !userData.user
      ) {

        bgmSaveMessage.textContent =
          "로그인이 필요합니다.";


        return;

      }


      const user =
        userData.user;


      const bgmUrl =
        bgmUrlInput
          .value
          .trim();


      bgmSaveButton.disabled =
        true;


      bgmSaveMessage.textContent =
        "저장 중...";


      const {
        error
      } =
        await supabaseClient
          .from(
            "site_settings"
          )
          .upsert(
            {

              user_id:
                user.id,

              key:
                "bgm_url",

              value:
                bgmUrl

            },
            {

              onConflict:
                "user_id,key"

            }
          );


      if (error) {

        console.error(
          "bgm save error:",
          error
        );


        bgmSaveMessage.textContent =
          "저장에 실패했습니다.";


        bgmSaveButton.disabled =
          false;


        return;

      }


      bgmSaveMessage.textContent =
        "saved ♡";


      bgmSaveButton.disabled =
        false;

    }
  );



/* =========================================================
   블로그 제목 저장
========================================================== */

blogTitleSaveButton
  ?.addEventListener(
    "click",
    async () => {

      const {
        data:
        userData,

        error:
        userError
      } =
        await supabaseClient
          .auth
          .getUser();


      if (
        userError ||
        !userData.user
      ) {

        blogTitleSaveMessage.textContent =
          "로그인이 필요합니다.";


        return;

      }


      const user =
        userData.user;


      const blogTitle =
        blogTitleInput
          .value
          .trim();


      blogTitleSaveButton.disabled =
        true;


      blogTitleSaveMessage.textContent =
        "저장 중...";


      const {
        error
      } =
        await supabaseClient
          .from(
            "site_settings"
          )
          .upsert(
            {

              user_id:
                user.id,

              key:
                "blog_title",

              value:
                blogTitle

            },
            {

              onConflict:
                "user_id,key"

            }
          );


      if (error) {

        console.error(
          "blog title save error:",
          error
        );


        blogTitleSaveMessage.textContent =
          "저장에 실패했습니다.";


        blogTitleSaveButton.disabled =
          false;


        return;

      }


      blogTitleSaveMessage.textContent =
        "saved ♡";


      blogTitleSaveButton.disabled =
        false;

    }
  );



/* =========================================================
   닉네임 저장

   profiles는 UPDATE 정책이 없어 직접 update()를 호출할 수
   없다 — update_own_nickname() RPC로만 저장 가능
   ([[20260906120000_add_update_own_nickname_rpc.sql]]).
========================================================== */

nicknameSaveButton
  ?.addEventListener(
    "click",
    async () => {

      const {
        data:
        userData,

        error:
        userError
      } =
        await supabaseClient
          .auth
          .getUser();


      if (
        userError ||
        !userData.user
      ) {

        nicknameSaveMessage.textContent =
          "로그인이 필요합니다.";


        return;

      }


      const nickname =
        nicknameInput
          .value
          .trim();


      nicknameSaveButton.disabled =
        true;


      nicknameSaveMessage.textContent =
        "저장 중...";


      const {
        error
      } =
        await supabaseClient
          .rpc(
            "update_own_nickname",
            {
              p_nickname:
                nickname
            }
          );


      if (error) {

        console.error(
          "nickname save error:",
          error
        );


        nicknameSaveMessage.textContent =
          "저장에 실패했습니다.";


        nicknameSaveButton.disabled =
          false;


        return;

      }


      nicknameSaveMessage.textContent =
        "saved ♡";


      nicknameSaveButton.disabled =
        false;

    }
  );


  /* =========================================================
   CATEGORIES 저장
========================================================== */

categorySaveButton
  .addEventListener(
    "click",
    async () => {

      const {
        data:
        userData,

        error:
        userError
      } =
        await supabaseClient
          .auth
          .getUser();


      if (
        userError ||
        !userData.user
      ) {

        categorySaveMessage.textContent =
          "로그인이 필요합니다.";

        return;

      }


      const user =
        userData.user;


      /* 이름 비어있는 항목 제외 */

      const validCategories =
        categories.filter(
          category =>
            category.name
              .trim()
              .length > 0
        );


      if (
        validCategories.length === 0
      ) {

        categorySaveMessage.textContent =
          "카테고리를 하나 이상 남겨주세요.";

        return;

      }


      categorySaveButton.disabled =
        true;


      categorySaveMessage.textContent =
        "저장 중...";


      /* =====================================================
         GALLERY-1 — 비밀글 대체 이미지: 새 경로에 먼저 올린다

         글 대표 이미지와 같은 순서다(요구사항 2절): 새 경로 업로드
         → 행 저장 성공 → 밀려난 예전 파일 정리. 여기서 실패하면
         카테고리 행은 하나도 건드리지 않은 채로 끝난다
         (admin/settings/admin-settings-category-display.js).
      ====================================================== */

      const secretCoverUpload =
        typeof uploadPendingCategorySecretCovers === "function"
          ? await uploadPendingCategorySecretCovers(
              user.id,
              validCategories
            )
          : { ok: true };


      if (!secretCoverUpload.ok) {

        categorySaveMessage.textContent =
          secretCoverUpload.message ||
          "저장에 실패했습니다.";


        categorySaveButton.disabled =
          false;


        return;

      }


      /*
        저장 중 어느 단계에서든 실패하면 방금 올린 파일만 지우고
        값을 되돌린다 — 예전 이미지는 아직 어디에도 밀려나지 않았다.
      */

      const failCategorySave =
        async (message) => {

          if (
            typeof rollbackPendingCategorySecretCovers === "function"
          ) {

            await rollbackPendingCategorySecretCovers(
              validCategories
            );

          }


          categorySaveMessage.textContent =
            message;


          categorySaveButton.disabled =
            false;

        };


      /* =====================================================
         삭제된 카테고리 DB에서 삭제
      ====================================================== */

      if (
        deletedCategoryIds.length > 0
      ) {

        const {
          error:
          deleteError
        } =
          await supabaseClient
            .from(
              "categories"
            )
            .delete()
            .in(
              "id",
              deletedCategoryIds
            )
            .eq(
              "user_id",
              user.id
            );


        if (deleteError) {

          console.error(
            "category delete error:",
            deleteError
          );


          await failCategorySave(
            "저장에 실패했습니다."
          );


          return;

        }

      }



      /*
        GALLERY-1: 표시 설정 4개 컬럼. migration이 아직 적용되지 않은
        배포에서는 컬럼 자체가 없으므로 payload에 넣지 않는다 — 넣으면
        카테고리 저장 전체가 42703으로 실패한다
        (admin/settings/admin-settings-category-display.js).
      */

      const categoryDisplayPayload =
        (category) => (
          (
            typeof categoryDisplayColumnsAvailable === "boolean" &&
            categoryDisplayColumnsAvailable &&
            (category.type || "post") === "post"
          )
            ? {
                list_style:
                  category.list_style === "gallery"
                    ? "gallery"
                    : "list",

                page_size:
                  [6, 12, 18, 24].includes(Number(category.page_size))
                    ? Number(category.page_size)
                    : 12,

                secret_cover_mode:
                  category.secret_cover_mode === "image"
                    ? "image"
                    : "lock",

                secret_cover_path:
                  category.secret_cover_path || null
              }
            : {}
        );


      /* =====================================================
         기존 항목 수정 / 새 항목 추가
      ====================================================== */

      for (
        let i = 0;
        i <
        validCategories.length;
        i += 1
      ) {

        const category =
          validCategories[i];


        const sortOrder =
          i + 1;


        /* 기존 카테고리 */

        if (
          category.id
        ) {

          const {
            error:
            updateError
          } =
            await supabaseClient
              .from(
                "categories"
              )
              .update({

                name:
                  category.name
                    .trim(),

                sort_order:
                  sortOrder,

                type:
                  category.type ||
                  "post",

                ...categoryDisplayPayload(category)

              })
              .eq(
                "id",
                category.id
              )
              .eq(
                "user_id",
                user.id
              );


          if (updateError) {

            console.error(
              "category update error:",
              updateError
            );


            await failCategorySave(
              "저장에 실패했습니다."
            );


            return;

          }

        }

        /* 새 카테고리 */

        else {

          const {
            error:
            insertError
          } =
            await supabaseClient
              .from(
                "categories"
              )
              .insert({

                user_id:
                  user.id,

                name:
                  category.name
                    .trim(),

                slug:
                  category.slug,

                sort_order:
                  sortOrder,

                type:
                  category.type ||
                  "post",

                ...categoryDisplayPayload(category)

              });


          if (insertError) {

            console.error(
              "category insert error:",
              insertError
            );


            await failCategorySave(
              "저장에 실패했습니다."
            );


            return;

          }

        }

      }


      /*
        GALLERY-1: 모든 행이 저장됐다 — 이제서야 밀려난 예전 대체
        이미지 파일을 지운다(요구사항 2절의 마지막 단계).
      */

      if (
        typeof cleanupReplacedCategorySecretCovers === "function"
      ) {

        await cleanupReplacedCategorySecretCovers(
          validCategories
        );

      }


      categorySaveMessage.textContent =
        "saved ♡";


      categorySaveButton.disabled =
        false;


      /* 새로 생성된 id까지 다시 맞추기 */

      await loadCategories(
        user
      );

    }
  );



/* =========================================================
   회원 탈퇴

   즉시 자가 삭제 — delete_own_account() RPC
   ([[20260906130000_add_delete_own_account_rpc.sql]])를 호출해
   auth.users row를 바로 삭제한다. 확인 다이얼로그에서 "탈퇴"를
   정확히 입력해야만 삭제 버튼이 활성화된다(오클릭 방지). 성공
   하면 signOut() 후 사이트 루트로 이동한다.
========================================================== */

const WITHDRAW_CONFIRM_PHRASE =
  "탈퇴";


withdrawAccountButton
  ?.addEventListener(
    "click",
    () => {

      withdrawAccountConfirmInput.value =
        "";


      withdrawAccountConfirmButton.disabled =
        true;


      if (
        withdrawAccountDialogMessage
      ) {

        withdrawAccountDialogMessage.textContent =
          "";

      }


      withdrawAccountDialog.showModal();

    }
  );


withdrawAccountConfirmInput
  ?.addEventListener(
    "input",
    () => {

      withdrawAccountConfirmButton.disabled =
        withdrawAccountConfirmInput
          .value
          .trim() !==
        WITHDRAW_CONFIRM_PHRASE;

    }
  );


withdrawAccountCancelButton
  ?.addEventListener(
    "click",
    () => {

      withdrawAccountDialog.close();

    }
  );


withdrawAccountConfirmButton
  ?.addEventListener(
    "click",
    async () => {

      withdrawAccountConfirmButton.disabled =
        true;


      if (
        withdrawAccountDialogMessage
      ) {

        withdrawAccountDialogMessage.textContent =
          "탈퇴 처리 중...";

      }


      const {
        error
      } =
        await supabaseClient
          .rpc(
            "delete_own_account"
          );


      if (error) {

        console.error(
          "delete own account error:",
          error
        );


        if (
          withdrawAccountDialogMessage
        ) {

          withdrawAccountDialogMessage.textContent =
            "탈퇴에 실패했습니다.";

        }


        withdrawAccountConfirmButton.disabled =
          false;


        return;

      }


      await supabaseClient
        .auth
        .signOut();


      window.location.href =
        "/";

    }
  );
