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
         GALLERY-1 — 대표 이미지: 새 경로에 먼저 올린다

         요구사항 2절의 순서 "새 경로 → 글 저장 성공 → 기존 파일
         정리"의 첫 단계다. 이 시점에는 기존 대표 이미지도 post_covers
         행도 전혀 건드리지 않는다 — 아래에서 글 저장이 실패하면
         방금 올린 파일만 지우고(rollbackPostCoverUpload) 예전 사진은
         그대로 남는다(posts/editor/posts-cover-image.js).

         올릴 파일이 없으면(사진을 안 골랐거나 제거만 요청) uploaded는
         null이고 아무 왕복도 일어나지 않는다.
      ====================================================== */

      const preparedCover =
        await preparePostCoverUpload();


      if (preparedCover.error) {

        console.error(
          preparedCover.error
        );


        postEditorSaveButton.disabled =
          false;


        postEditorSaveButton.textContent =
          "save";


        showPostEditorMessage(
          "대표 이미지를 올리지 못했습니다."
        );


        return;

      }


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


          /* 글 저장이 실패했으니 방금 올린 대표 이미지 파일은
             아무도 참조하지 않는다 — 지운다. 기존 대표 이미지는
             건드리지 않았으므로 그대로다. */

          await rollbackPostCoverUpload(
            preparedCover
          );


          showPostEditorMessage(
            "저장하지 못했습니다."
          );


          return;

        }


        /* 글이 저장됐다 — 이제 대표 이미지를 등록하고 밀려난
           이전 파일을 정리한다. 여기서 실패해도 글은 이미 저장된
           상태이므로 안내만 하고 화면은 그대로 진행한다. */

        const coverSaveError =
          await finishPostCoverSave(
            savedId,
            preparedCover
          );


        /*
          GALLERY-1 후속: 공개 범위가 바뀌었다고 대표 이미지 파일을
          옮기거나 지우는 단계는 **없다**. 대표 이미지는 비공개
          버킷에 있고 바이트는 /api/post-cover로만 나가며, 그 요청마다
          DB가 글의 현재 공개 상태와 요청자를 확인한다 — 이 저장이
          커밋되는 순간 그 다음 요청부터 새 공개 범위가 적용된다
          (posts/editor/posts-cover-image.js 상단 주석,
           supabase/migrations/20260911100000_post_covers_private_access.sql).
        */

        if (coverSaveError) {

          console.error(
            coverSaveError
          );


          /* 이 뒤로 화면이 곧 글 읽기로 넘어가므로 폼 안 메시지는
             보이지 않는다 — 드문 실패이고 사용자가 반드시 알아야
             하는 내용이라 alert로 알린다. */

          alert(
            "글은 저장했지만 대표 이미지는 반영하지 못했습니다."
          );

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


        await rollbackPostCoverUpload(
          preparedCover
        );


        showPostEditorMessage(
          "저장하지 못했습니다."
        );


        return;

      }


      const newPostCoverError =
        await finishPostCoverSave(
          data.id,
          preparedCover
        );


      if (newPostCoverError) {

        console.error(
          newPostCoverError
        );


        alert(
          "글은 저장했지만 대표 이미지는 반영하지 못했습니다."
        );

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



