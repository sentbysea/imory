/* =========================================================
   POSTS - SAVE

   posts.js 분할본. DOM 참조/상태는 posts-refs.js에 있음
   (반드시 먼저 로드돼야 함).

   내용: 글 저장(생성/수정) 버튼 클릭 처리 전체 —
   본문/비밀글 비밀번호 저장 헬퍼(savePostContentAndSecret)
   포함.
========================================================== */


/* =========================================================
   SAVE HELPERS

   본문(content/ooc_content)은 posts가 아니라 post_contents
   테이블에 저장됨(비밀글의 "제목은 목록에 보이되 본문만
   숨기기"를 DB RLS로 구현하려고 분리함 — 자세한 설명은
   supabase/migrations/*_secret_private_posts.sql 참고).

   비밀번호는 평문을 절대 posts 테이블에 직접 쓰지 않고,
   set_post_secret_password RPC(DB 안에서 bcrypt 해시로
   변환)를 통해서만 저장한다.
========================================================== */

async function savePostContentAndSecret(
  postId,
  content,
  oocContent,
  visibility,
  secretPassword
) {

  const {
    error: contentError
  } =
    await supabaseClient
      .from(
        "post_contents"
      )
      .upsert(
        {
          post_id:
            postId,

          content,

          ooc_content:
            oocContent
        },
        {
          onConflict:
            "post_id"
        }
      );


  if (contentError) {
    return contentError;
  }


  if (
    visibility ===
      "secret" &&
    secretPassword
  ) {

    const {
      error: passwordError
    } =
      await supabaseClient
        .rpc(
          "set_post_secret_password",
          {
            p_post_id:
              postId,

            p_password:
              secretPassword
          }
        );


    if (passwordError) {
      return passwordError;
    }

  }


  return null;

}



/* =========================================================
   SAVE
========================================================== */

postEditorSaveButton
  ?.addEventListener(
    "click",
    async () => {

      const user =
        await getSignedInUser();


      if (!user) {
        return;
      }


      const categoryId =
        Number(
          postEditorCategory.value
        );


      const title =
        postEditorTitle
          .value
          .trim();


      const isHtmlMode =
        editorContentMode ===
        "html";


      /*
        HTML 모드면 sanitize를 거치지 않은 raw HTML을
        그대로 저장한다(뷰어에서도 그대로 출력하는 게
        이 모드의 목적이므로). 아니면 기존처럼
        textarea.value가 아니라 sanitized rich HTML 저장.
      */

      const content =
        isHtmlMode
          ? postEditorHtmlContent
              ?.value ||
            ""
          : getRichEditorHTML();


      const plainText =
        isHtmlMode
          ? content.trim()
          : getRichEditorPlainText()
              .trim();


      const oocContent =
        postEditorOOC
          ?.value
          .trim() ||
        null;


      /*
        빈 값("없음" 선택)이면 이 글은 프리셋 오버라이드 없이
        사이트 전역 "사용 중" 프리셋을 그대로 따른다
        (posts-view-detail.js/posts-style-preset.js 참고).
      */

      const quotePresetId =
        postEditorPresetSelect
          ?.value ||
        null;


      if (!title) {

        showPostEditorMessage(
          "제목을 입력해주세요."
        );

        return;

      }


      if (!plainText) {

        showPostEditorMessage(
          "본문을 입력해주세요."
        );

        return;

      }


      const secretPassword =
        postEditorSecretPassword
          ?.value
          .trim() ||
        "";


      if (
        editorPostVisibility ===
          "secret" &&
        !secretPassword &&
        !editorPostHadSecretPassword
      ) {

        showPostEditorMessage(
          "비밀글 비밀번호를 입력해주세요."
        );

        return;

      }


      postEditorSaveButton.disabled =
        true;


      postEditorSaveButton.textContent =
        "...";


      /* =====================================================
         EDIT
      ====================================================== */

      if (
        currentEditorMode ===
          "edit" &&
        editorSourcePostId
      ) {

        const savedId =
          editorSourcePostId;


        const {
          error
        } =
          await supabaseClient
            .from(
              "posts"
            )
            .update({
              category_id:
                categoryId,

              title,

              content_type:
                isHtmlMode
                  ? "html"
                  : "richtext",

              visibility:
                editorPostVisibility,

              quote_preset_id:
                quotePresetId,

              /*
                secret을 벗어나면 예전 해시는 지운다
                (다시 secret으로 바꾸면 새 비밀번호를
                반드시 입력하게 되므로).
              */

              secret_password_hash:
                editorPostVisibility ===
                "secret"
                  ? undefined
                  : null,

              updated_at:
                new Date()
                  .toISOString()
            })
            .eq(
              "id",
              savedId
            )
            .eq(
              "user_id",
              user.id
            );


        const contentSaveError =
          error ||
          (
            await savePostContentAndSecret(
              savedId,
              content,
              oocContent,
              editorPostVisibility,
              secretPassword
            )
          );


        postEditorSaveButton.disabled =
          false;


        postEditorSaveButton.textContent =
          "save";


        if (contentSaveError) {

          console.error(
            contentSaveError
          );


          showPostEditorMessage(
            "저장하지 못했습니다."
          );


          return;

        }


        /*
          제목/공개범위/카테고리 등이 바뀌었을 수 있으므로
          이전 카테고리와(카테고리를 옮겼다면) 새 카테고리
          목록 캐시를 모두 지운다.
        */

        invalidateCategoryPageCache(
          currentPostCategoryId
        );

        invalidateCategoryPageCache(
          categoryId
        );


        hidePostEditor();


        await openPostPage(
          savedId,
          {
            updateUrl:
              false
          }
        );


        return;

      }


      /* =====================================================
         CREATE
      ====================================================== */

      const {
        data,
        error
      } =
        await supabaseClient
          .from(
            "posts"
          )
          .insert({
            user_id:
              user.id,

            category_id:
              categoryId,

            title,

            content_type:
              isHtmlMode
                ? "html"
                : "richtext",

            visibility:
              editorPostVisibility,

            quote_preset_id:
              quotePresetId,

            updated_at:
              new Date()
                .toISOString()
          })
          .select(
            "id"
          )
          .single();


      const contentSaveError =
        error ||
        !data ?
          error :
          await savePostContentAndSecret(
            data.id,
            content,
            oocContent,
            editorPostVisibility,
            secretPassword
          );


      postEditorSaveButton.disabled =
        false;


      postEditorSaveButton.textContent =
        "save";


      if (
        error ||
        !data ||
        contentSaveError
      ) {

        console.error(
          error ||
          contentSaveError
        );


        showPostEditorMessage(
          "저장하지 못했습니다."
        );


        return;

      }


      invalidateCategoryPageCache(
        categoryId
      );


      hidePostEditor();


      await openPostPage(
        data.id
      );

    }
  );



