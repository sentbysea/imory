/* =========================================================
   POSTS VIEW - SECRET GATE / OWNER ACTIONS / RELATED

   posts-view.js 분할본. DOM 참조/상태는
   posts/editor/posts-refs.js에 있음(반드시 먼저 로드돼야 함).
========================================================== */


/* =========================================================
   SECRET GATE

   비밀글을 주인이 아닌 사람이 열었을 때 본문 자리에 대신
   보여주는 비밀번호 입력 폼. 비밀번호 대조는
   get_secret_post_content RPC 안에서만(DB) 일어나므로
   프론트 JS를 다 읽어도 우회할 방법이 없다.
========================================================== */

let secretGatePostId =
  null;


let secretGatePostContentType =
  "richtext";


let secretGatePostQuotePresetId =
  null;


function showPostSecretGate(
  postId,
  contentType,
  quotePresetId
) {

  secretGatePostId =
    postId;


  secretGatePostContentType =
    contentType;


  secretGatePostQuotePresetId =
    quotePresetId ||
    null;


  if (
    postDetailContentWrap
  ) {

    postDetailContentWrap.hidden =
      true;

  }


  if (
    postDetailContent
  ) {

    postDetailContent.textContent =
      "";


    postDetailContent.classList.remove(
      "is-html-content"
    );

  }


  if (
    postSecretGateInput
  ) {

    postSecretGateInput.value =
      "";

  }


  if (
    postSecretGateMessage
  ) {

    postSecretGateMessage.textContent =
      "";

  }


  if (
    postSecretGate
  ) {

    postSecretGate.hidden =
      false;

  }


  postSecretGateInput
    ?.focus();

}


async function handleSecretGateSubmit(
  event
) {

  event.preventDefault();


  if (
    !secretGatePostId
  ) {
    return;
  }


  const password =
    postSecretGateInput
      ?.value
      .trim() ||
    "";


  if (!password) {

    if (
      postSecretGateMessage
    ) {

      postSecretGateMessage.textContent =
        "비밀번호를 입력해주세요.";

    }

    return;

  }


  if (
    postSecretGateSubmit
  ) {

    postSecretGateSubmit.disabled =
      true;

  }


  if (
    postSecretGateMessage
  ) {

    postSecretGateMessage.textContent =
      "";

  }


  const {
    data,
    error
  } =
    await supabaseClient
      .rpc(
        "get_secret_post_content",
        {
          p_post_id:
            secretGatePostId,

          p_password:
            password
        }
      );


  if (
    postSecretGateSubmit
  ) {

    postSecretGateSubmit.disabled =
      false;

  }


  const row =
    Array.isArray(data)
      ? data[0]
      : data;


  if (
    error ||
    !row
  ) {

    if (
      postSecretGateMessage
    ) {

      postSecretGateMessage.textContent =
        "비밀번호가 일치하지 않습니다.";

    }

    return;

  }


  if (
    postSecretGate
  ) {

    postSecretGate.hidden =
      true;

  }


  if (
    postDetailContentWrap
  ) {

    postDetailContentWrap.hidden =
      false;

  }


  await renderPostDetailBody(
    secretGatePostContentType,
    row.content,
    secretGatePostQuotePresetId
  );

}



/* =========================================================
   OWNER ACTIONS
========================================================== */

async function updatePostOwnerActions() {

  if (
    !postDetailActions
  ) {

    return;

  }


  postDetailActions.hidden =
    true;


  if (
    !currentPostOwnerId
  ) {

    return;

  }


  const user =
    await getSignedInUser();


  if (
    user &&
    user.id ===
      currentPostOwnerId
  ) {

    postDetailActions.hidden =
      false;

  }

}



/* =========================================================
   RELATED POSTS
========================================================== */

async function loadRelatedPosts(
  categoryId,
  currentId,
  categoryName = ""
) {

  if (
    !postRelated ||
    !postRelatedList ||
    !categoryId
  ) {

    return;

  }


  postRelated.hidden =
    false;


  postRelatedTitle.textContent =
    categoryName
      ? `MORE IN ${categoryName}`
      : "MORE POSTS";


  const {
    data: posts,
    error
  } =
    await supabaseClient
      .from(
        "posts"
      )
      .select(
        `
        id,
        title,
        created_at,
        visibility
        `
      )
      .eq(
        "category_id",
        categoryId
      )
      .order(
        "created_at",
        {
          ascending:
            false
        }
      );


  if (error) {

    console.error(
      error
    );

    return;

  }


  postRelatedList.innerHTML =
    "";


  (posts || []).forEach(
    post => {

      const item =
        document.createElement(
          "a"
        );


      item.className =
        "post-related-item";


      const isCurrent =
        Number(
          post.id
        ) ===
        Number(
          currentId
        );


      if (isCurrent) {

        item.classList.add(
          "current"
        );

      }


      else {

        item.href =
          buildPostRoute(
            `/post/${post.id}`
          );


        item.dataset.postId =
          post.id;

      }


      const title =
        document.createElement(
          "span"
        );


      title.className =
        "post-related-item-title";


      applyPostVisibilityTitle(
        title,
        post.visibility,
        post.title
      );


      const date =
        document.createElement(
          "span"
        );


      date.className =
        "post-related-item-date";


      date.textContent =
        formatPostListDate(
          post.created_at
        );


      item.append(
        title,
        date
      );


      postRelatedList.appendChild(
        item
      );

    }
  );

}



