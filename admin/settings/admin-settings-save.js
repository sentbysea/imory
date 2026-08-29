/* =========================================================
   ADMIN SETTINGS - SAVE

   admin-settings.js 분할본 중 마지막. DOM 참조는
   admin-settings-load.js에 있음(반드시 먼저 로드돼야 함).

   내용: 로그인한 유저의 설정 전체 불러오기, 소개글/BGM/
   카테고리 저장.
========================================================== */


/* =========================================================
   SETTINGS 전체 불러오기
========================================================== */

async function loadAdminSettings(
  user
) {

  await loadContent(
    user
  );


  await loadBgm(
    user
  );

  await loadCategories(
  user
);


  await loadMyBanner(
    user
  );

}



/* =========================================================
   PROFILE 저장
========================================================== */

saveButton
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

        saveMessage.textContent =
          "로그인이 필요합니다.";


        return;

      }


      const user =
        userData.user;


      saveButton.disabled =
        true;


      saveMessage.textContent =
        "저장 중...";


      const updates = [

        {
          section:
            "about",

          content:
            aboutInput.value
        },

        {
          section:
            "notice",

          content:
            noticeInput.value
        },

        {
          section:
            "ng",

          content:
            ngInput.value
        }

      ];


      for (
        const item
        of updates
      ) {

        const {
          error
        } =
          await supabaseClient
            .from(
              "site_content"
            )
            .update({

              content:
                item.content

            })
            .eq(
              "section",
              item.section
            )
            .eq(
              "user_id",
              user.id
            );


        if (error) {

          console.error(
            "save error:",
            error
          );


          saveMessage.textContent =
            "저장에 실패했습니다.";


          saveButton.disabled =
            false;


          return;

        }

      }


      saveMessage.textContent =
        "saved ♡";


      saveButton.disabled =
        false;

    }
  );



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


          categorySaveMessage.textContent =
            "저장에 실패했습니다.";


          categorySaveButton.disabled =
            false;


          return;

        }

      }


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
                  "post"

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


            categorySaveMessage.textContent =
              "저장에 실패했습니다.";


            categorySaveButton.disabled =
              false;


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
                  "post"

              });


          if (insertError) {

            console.error(
              "category insert error:",
              insertError
            );


            categorySaveMessage.textContent =
              "저장에 실패했습니다.";


            categorySaveButton.disabled =
              false;


            return;

          }

        }

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