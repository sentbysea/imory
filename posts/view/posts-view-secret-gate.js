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


  const unlocked =
    await requestSecretPostContent(
      secretGatePostId,
      password
    );


  if (
    postSecretGateSubmit
  ) {

    postSecretGateSubmit.disabled =
      false;

  }


  if (
    !unlocked.ok
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
    unlocked.content,
    secretGatePostQuotePresetId
  );


  /*
    HIGHLIGHT-1: 비밀번호를 맞힌 방문자는 이 글의 하이라이트도 볼 수
    있어야 한다(요구사항 11 "보호된 원문의 발췌문·메모는 기존 원문
    열람 조건을 충족해야 읽을 수 있다"). 테이블 직접 조회는 RLS가
    막으므로 원문과 같은 문(get_secret_post_highlights)을 쓴다 —
    비밀번호를 다시 실어 보내는 유일한 이유다.

    주인장은 애초에 이 화면을 보지 않으므로(본문이 바로 열린다)
    여기는 항상 방문자 경로다 — isOwner:false라 편집 도구도 없다.
  */

  if (typeof renderPostHighlights === "function") {

    await renderPostHighlights({
      postId:
        secretGatePostId,

      isOwner:
        false,

      bodyTarget:
        currentPostBodyMountTarget ||
        postDetailContent,

      secretPassword:
        password
    });

  }

}



/* =========================================================
   비밀글 본문 요청 — 단 하나의 경로

   get_secret_post_content(p_post_id, p_password) RPC 호출을 여기 한
   곳으로 모은다(FOLDER-2). legacy 싱글턴 폼(위 handleSecretGateSubmit)과
   폴더 페이지의 글별 폼(아래 mountPostSecretGate)이 같은 함수를 쓴다 —
   비밀번호 대조는 여전히 DB 안에서만 일어나고, 프론트는 결과 본문만
   받는다. 실패 사유(오답/네트워크/없는 글)를 구분하지 않고 ok:false
   하나로 돌려준다 — 사용자에게 보여주는 문구도 하나뿐이다.

   -> { ok: true, content } | { ok: false }
========================================================== */

async function requestSecretPostContent(
  postId,
  password
) {

  let data;
  let error;

  try {

    (
      {
        data,
        error
      } =
        await supabaseClient
          .rpc(
            "get_secret_post_content",
            {
              p_post_id:
                postId,

              p_password:
                password
            }
          )
    );

  } catch (err) {

    return {
      ok: false
    };

  }


  const row =
    Array.isArray(data)
      ? data[0]
      : data;


  if (
    error ||
    !row
  ) {

    return {
      ok: false
    };

  }


  if (String(row.content || "").includes("/api/post-cover?image=")) {
    const { data: galleryToken, error: tokenError } = await supabaseClient.rpc(
      "issue_gallery_read_token", { p_post_id: postId, p_password: password }
    );
    if (tokenError || !/^[0-9a-f-]{36}$/i.test(galleryToken || "")) return { ok: false };
    document.cookie = `imory_gallery_${Number(postId)}=${galleryToken}; Path=/api/post-cover; Max-Age=3600; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
  }

  return {
    ok: true,

    content:
      row.content
  };

}



/* =========================================================
   target 기반 비밀글 폼 (FOLDER-2, Series Viewer)

   폴더 페이지는 한 화면에 비밀글이 여러 개 있을 수 있어 문서에 하나뿐인
   #postSecretGate를 옮겨 쓸 수 없다. 대신 같은 클래스 구조의 폼을
   글마다 새로 만들어 그 글의 post-body region 안에 둔다 — 스타일은
   posts/posts-list-detail.css의 .post-secret-gate* 규칙을 그대로
   물려받고(id 선택자를 쓰지 않는다), 해제 로직은 위
   requestSecretPostContent()와 renderPostBodyInto()(posts-view-detail.js)
   를 그대로 재사용한다. 비밀글 접근 규칙이 새로 생기지 않는다.

   legacy POST 화면의 싱글턴 폼은 그대로 둔다 — 그 폼은 legacy
   #postDetail의 고정 DOM과 묶여 있어(hidden 토글, 포커스) 건드릴
   이유가 없다.
========================================================== */

function buildPostSecretGateElement() {

  const form =
    document.createElement(
      "form"
    );

  form.className =
    "post-secret-gate";


  const icon =
    document.createElement(
      "div"
    );

  icon.className =
    "post-secret-gate-icon";

  icon.textContent =
    "🔒";


  const label =
    document.createElement(
      "div"
    );

  label.className =
    "post-secret-gate-label";

  label.textContent =
    "비밀글입니다";


  const input =
    document.createElement(
      "input"
    );

  input.className =
    "post-secret-gate-input";

  input.type =
    "password";

  input.setAttribute(
    "inputmode",
    "text"
  );

  input.setAttribute(
    "autocomplete",
    "off"
  );

  input.placeholder =
    "비밀번호";


  const submit =
    document.createElement(
      "button"
    );

  submit.className =
    "post-secret-gate-button";

  submit.type =
    "submit";

  submit.textContent =
    "확인";


  const message =
    document.createElement(
      "div"
    );

  message.className =
    "post-secret-gate-message";


  form.append(
    icon,
    label,
    input,
    submit,
    message
  );


  return {
    form,
    input,
    submit,
    message
  };

}


function mountPostSecretGate(
  target,
  options = {}
) {

  const {
    postId,
    contentType,
    quotePresetId
  } = options;


  if (
    !target ||
    postId === undefined ||
    postId === null
  ) {

    return;

  }


  const gate =
    buildPostSecretGateElement();


  target.replaceChildren(
    gate.form
  );


  gate.form.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();


      const password =
        gate.input.value.trim();


      if (!password) {

        gate.message.textContent =
          "비밀번호를 입력해주세요.";

        return;

      }


      gate.submit.disabled =
        true;

      gate.message.textContent =
        "";


      const unlocked =
        await requestSecretPostContent(
          postId,
          password
        );


      gate.submit.disabled =
        false;


      if (!unlocked.ok) {

        gate.message.textContent =
          "비밀번호가 일치하지 않습니다.";

        return;

      }


      /*
        폼이 아직 그 자리에 있을 때만 본문으로 바꾼다 — 그 사이 화면이
        다른 곳으로 넘어가 region이 비워졌다면(detached) 아무것도
        하지 않는다.
      */

      if (
        gate.form.parentNode !==
        target
      ) {

        return;

      }


      gate.form.remove();


      await renderPostBodyInto(
        target,
        contentType,
        unlocked.content,
        quotePresetId
      );

    }
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


  /*
    PHASE 1E 후속: 스킨이 이 글을 그렸다면(currentPostBodyMountTarget)
    legacy 상세는 통째로 hidden이고, 소유자 진입점은 화면에 떠 있는
    관리 토글(#postManageToggleButton)이다 — 보이지도 않는 화면의
    버튼까지 켜 두지 않는다. 관리 화면으로 들어오면 이 값이 다시
    null이라 기존대로 켜진다.
  */

  if (currentPostBodyMountTarget) {

    return;

  }


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

