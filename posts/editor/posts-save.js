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

  /*
    post_contents에 직접 upsert하지 않는다 — ooc_content는 어느
    역할에도 SELECT GRANT가 없고, PostgreSQL은 ON CONFLICT DO
    UPDATE 식에서 읽는 컬럼(EXCLUDED 포함)에 SELECT를 요구하므로
    직접 upsert가 permission denied가 된다. 소유권을 auth.uid()로
    확인하는 SECURITY DEFINER RPC가 같은 upsert를 대신한다
    (supabase/migrations/20260909100000_lock_down_post_contents_ooc.sql).
  */

  const {
    error: contentError
  } =
    await supabaseClient
      .rpc(
        "upsert_own_post_content",
        {
          p_post_id:
            postId,

          p_content:
            content,

          p_ooc_content:
            oocContent
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


        /*
          저장했으니 이 폼으로 되돌아갈 이유가 없다 — 진입 지점
          기록을 버리고, 주소도 ?edit=1을 뗀 그 글의 읽기 주소로
          맞춘 뒤(replaceState) 그 화면을 연다. 그대로 두면 새로
          고침이나 뒤로가기 때 방금 저장한 글의 수정 폼이 다시
          열린다(posts/view/posts-view-transition.js).
        */

        forgetPlatformScreenReturn();


        history.replaceState(
          {
            page: "post",

            postId:
              Number(
                savedId
              )
          },
          "",
          buildPostRoute(
            `/post/${savedId}`
          )
        );


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


      /*
        새 글은 방금 만든 글의 스킨 상세로 간다(요청서 2절).
        들어올 때 쌓아 둔 ?write=1 항목을 그 주소로 덮어써서,
        뒤로가기/새로고침이 "저장한 뒤 빈 작성 폼"으로 되돌아가지
        않게 한다.
      */

      forgetPlatformScreenReturn();


      history.replaceState(
        {
          page: "post",

          postId:
            Number(
              data.id
            )
        },
        "",
        buildPostRoute(
          `/post/${data.id}`
        )
      );


      await openPostPage(
        data.id,
        {
          updateUrl:
            false
        }
      );

    }
  );



