/* =========================================================
   POSTS — 본문 사진 (BODY IMAGES)

   post/gallery **공통** 본문 에디터의 사진 담당. 툴바의 "사진"
   버튼으로 여러 장을 커서 위치에 넣고, 본문 사진을 눌러 대표
   사진을 정하고, 저장할 때 실제 업로드와 행 저장을 한다.

   기준 문서: IMORY_POST_BODY_IMAGE_DESIGN.md
   DB: supabase/migrations/20260912100000_post_body_images.sql
       (그 이전: 20260911120000_gallery_content.sql —
        post_gallery_images 테이블과 RPC 두 개는 그대로 쓴다)

   ★ 상태는 DOM이 갖는다

     어느 사진이 / 어느 순서로 / 어느 것이 대표인지는 전부
     #postEditorContent 안의 <img>가 갖는다.

       순서   — 본문에 나온 순서 그대로 position이 된다
       대표   — img.classList의 post-editor-image-primary
       식별자 — data-imory-image (저장된 사진도, 아직 안 올린
                사진도 같은 자리에 같은 모양으로 있다)

     그래서 undo(=innerHTML 되돌리기)가 삽입·삭제·대표 지정을
     **자동으로 함께** 되돌린다(요구사항 4절). 별도 사진 목록
     상태를 두면 undo 뒤에 둘이 어긋난다 — 그 어긋남이 생길
     자리를 없앤 것이다.

     대표 표시용 class는 저장되는 HTML에 남지 않는다. sanitizer가
     img를 식별자만 보고 **새로 만들기** 때문이다
     (posts/posts-sanitize.js). 대표라는 사실은 본문이 아니라
     post_gallery_images.is_primary 행이 갖는다.

   ★ 파일은 저장을 눌러야 올라간다

     고르는 순간에는 blob: 미리보기만 만들고 파일은 메모리에
     둔다(postBodyImagePending). 그래서 작성을 취소하면 Storage에
     임시 파일이 남지 않는다 — COVER 칸이 지키던 순서 그대로다.

     대표 사진을 바꿔도 **같은 파일을 다시 올리지 않는다**
     (요구사항 4절). 대표는 행의 boolean 한 칸이다.

   ★ 이미 저장된 사진의 metadata

     get_own_gallery_images가 storage_path/mime_type/byte_size를
     돌려주고, 그 값을 postBodyImageSaved에 담아 둔다. 저장할 때
     RPC에 행 전체를 다시 넘겨야 하는데(그 함수가 이 글의 사진
     집합을 통째로 교체한다), 파일을 다시 올리지 않고 그 값을
     그대로 재사용하기 위해서다.

   classic script. 최상위 선언이 다른 posts/* 파일과 같은 전역
   렉시컬 환경을 공유한다(posts/editor/posts-refs.js 주석).
========================================================== */


/* =========================================================
   상태
========================================================== */

/* uuid -> { file, objectUrl }  — 아직 올리지 않은 사진.
   undo로 되살아난 <img>도 같은 uuid로 여기서 파일을 찾는다.
   그래서 이 Map은 폼을 닫을 때까지 지우지 않는다. */

let postBodyImagePending =
  new Map();


/* uuid -> { storage_path, mime_type, byte_size } — 이미 저장된 사진 */

let postBodyImageSaved =
  new Map();


/* 저장된 시점의 대표 사진. "글자는 그대로 두고 대표만 바꾸고
   나가는" 경우를 잡는 기준점이다 — sanitize된 본문 HTML에는
   대표 표시가 남지 않으므로 HTML 비교로는 잡히지 않는다
   (postBodyImagesHavePendingChange). */

let postBodyImageSavedPrimaryId =
  null;


let postBodyImageLoading =
  false;

let postBodyImageLoadFailed =
  false;

let postBodyImageLoadVersion =
  0;


/* 사진을 고르러 가기 직전의 caret. 파일 선택창은 편집 영역의
   포커스와 선택을 가져가므로(모바일에서는 화면 전체가 바뀐다)
   그 전에 잡아 두고 돌아와서 복원한다(요구사항 1절 마지막). */

let postBodyImageInsertRange =
  null;


const POST_BODY_IMAGE_PRIMARY_CLASS =
  "post-editor-image-primary";


/* =========================================================
   DOM
========================================================== */

const postEditorImageButton =
  document.getElementById(
    "postEditorImageButton"
  );

const postEditorImageFiles =
  document.getElementById(
    "postEditorImageFiles"
  );

const postEditorImageControl =
  document.getElementById(
    "postEditorImageControl"
  );

const postEditorImagePrimaryToggle =
  document.getElementById(
    "postEditorImagePrimaryToggle"
  );


/* =========================================================
   카테고리 종류

   post/gallery는 같은 에디터를 쓴다 — 이 함수가 정하는 것은
   본문 편집이 아니라 **발췌 버튼(PREVIEW/export/copy)을
   보일지**뿐이다(요구사항 3절, posts-editor-mode.js).
========================================================== */

function isGalleryEditor() {

  return (
    postEditorCategory
      ?.selectedOptions[0]
      ?.dataset
      .categoryType === "gallery"
  );

}


postEditorCategory
  ?.addEventListener(
    "change",
    () => {

      if (
        typeof syncEditorExcerptControls === "function"
      ) {

        syncEditorExcerptControls();

      }

    }
  );



/* =========================================================
   초기화 / 불러오기
========================================================== */

function resetPostBodyImages() {

  postBodyImageLoadVersion += 1;

  postBodyImageLoading =
    false;

  postBodyImageLoadFailed =
    false;


  for (const entry of postBodyImagePending.values()) {

    if (entry.objectUrl) {

      URL.revokeObjectURL(
        entry.objectUrl
      );

    }

  }


  postBodyImagePending =
    new Map();

  postBodyImageSaved =
    new Map();

  postBodyImageSavedPrimaryId =
    null;

  postBodyImageInsertRange =
    null;


  /* 발췌용으로 굳혀 둔 정지 raster도 이 글의 것이다
     (posts/preview/posts-preview-images.js). */

  if (
    typeof resetPostPreviewImages === "function"
  ) {

    resetPostPreviewImages();

  }


  hidePostBodyImageControl();

}


/*
  수정 폼을 열 때 이 글의 사진 metadata를 받아 둔다. 본문 HTML은
  이미 그 사진들을 <img>로 갖고 있으므로(저장된 그대로) 화면은
  이 왕복을 기다리지 않아도 그려진다 — 여기서 받는 것은 저장할
  때 다시 넘겨야 하는 storage_path 등이다.
*/

async function loadPostBodyImages(
  postId
) {

  resetPostBodyImages();


  postBodyImageLoading =
    true;


  const version =
    postBodyImageLoadVersion;


  const {
    data,
    error
  } =
    await supabaseClient
      .rpc(
        "get_own_gallery_images",
        {
          p_post_id: postId
        }
      );


  if (
    version !== postBodyImageLoadVersion ||
    String(editorSourcePostId) !== String(postId)
  ) {

    return;

  }


  postBodyImageLoading =
    false;


  postBodyImageLoadFailed =
    Boolean(error);


  if (error) {

    console.error(
      "[body-images] 사진 정보를 불러오지 못했습니다:",
      error
    );


    showPostEditorMessage(
      "사진 정보를 불러오지 못했습니다. 이 상태로 저장하면 사진이 사라질 수 있으니 폼을 다시 열어주세요."
    );


    return;

  }


  (data || []).forEach(
    row => {

      if (!row || !row.id) {

        return;

      }


      postBodyImageSaved.set(
        String(row.id),
        {
          storage_path: row.storage_path,
          mime_type: row.mime_type,
          byte_size: row.byte_size
        }
      );

    }
  );


  /*
    대표 사진은 행이 갖고 있고 본문 HTML에는 없다 — 폼을 열 때
    그 행을 읽어 편집 화면의 표시로 되살린다.
  */

  const primary =
    (data || []).find(
      row => row && row.is_primary === true
    );


  if (primary) {

    postBodyImageSavedPrimaryId =
      String(primary.id);


    markPostBodyImagePrimary(
      findPostBodyImageNode(
        postBodyImageSavedPrimaryId
      )
    );

  }


  /*
    폼을 여는 동안 이 왕복이 늦게 도착할 수 있다 — 그 사이에
    찍힌 "변경 없음" 기준점에는 대표 표시가 빠져 있으므로 다시
    찍는다(posts/view/posts-view-editor-load.js).
  */

  if (
    typeof capturePostEditorSnapshot === "function"
  ) {

    capturePostEditorSnapshot();

  }

}



/* =========================================================
   삽입
========================================================== */

function findPostBodyImageNode(
  imageId
) {

  if (
    !postEditorContent ||
    !imageId
  ) {

    return null;

  }


  return Array.from(
    postEditorContent.querySelectorAll("img")
  ).find(
    image =>
      getPostBodyImageId(image) === imageId
  ) || null;

}


function createPostBodyImageNode(
  imageId,
  previewUrl
) {

  const image =
    document.createElement(
      "img"
    );


  image.setAttribute(
    "data-imory-image",
    imageId
  );


  image.setAttribute(
    "src",
    previewUrl ||
    buildPostBodyImageUrl(imageId)
  );


  image.setAttribute(
    "alt",
    ""
  );


  /*
    편집 중에 이미지 안쪽에 caret이 들어가거나 브라우저 기본
    드래그로 본문이 흐트러지지 않게 한다. 저장되는 HTML에는
    남지 않는다(sanitizer가 img를 새로 만든다).
  */

  image.setAttribute(
    "draggable",
    "false"
  );


  return image;

}


/*
  커서(또는 사진 버튼을 누르기 직전의 커서) 자리에 순서대로
  넣는다. 넣고 나면 caret이 마지막 사진 뒤에 있으므로, 이어서
  타이핑하면 사진 **다음** 글이 된다(요구사항 1절).
*/

function insertPostBodyImagesAtCaret(
  entries
) {

  if (
    !postEditorContent ||
    !entries.length
  ) {

    return;

  }


  pushEditorUndoSnapshot(
    true
  );


  const selection =
    window.getSelection();


  let range =
    null;


  if (
    postBodyImageInsertRange &&
    nodeIsInsideEditor(
      postBodyImageInsertRange.startContainer
    )
  ) {

    range =
      postBodyImageInsertRange.cloneRange();

  }

  else if (
    savedEditorRange &&
    nodeIsInsideEditor(
      savedEditorRange.startContainer
    )
  ) {

    range =
      savedEditorRange.cloneRange();

  }


  /*
    커서가 한 번도 본문에 들어간 적이 없으면(새 글에서 제목만
    쓰고 바로 사진을 고른 경우) 본문 맨 끝에 넣는다 — 파일
    선택을 물리지 않는다.
  */

  if (!range) {

    range =
      document.createRange();


    range.selectNodeContents(
      postEditorContent
    );


    range.collapse(
      false
    );

  }


  range.deleteContents();


  let lastNode =
    null;


  entries.forEach(
    entry => {

      const image =
        createPostBodyImageNode(
          entry.id,
          entry.objectUrl
        );


      range.insertNode(
        image
      );


      range.setStartAfter(
        image
      );


      range.collapse(
        true
      );


      lastNode =
        image;

    }
  );


  if (lastNode) {

    const caret =
      document.createRange();


    caret.setStartAfter(
      lastNode
    );


    caret.collapse(
      true
    );


    selection?.removeAllRanges();

    selection?.addRange(
      caret
    );


    savedEditorRange =
      caret.cloneRange();

  }


  postBodyImageInsertRange =
    null;


  updateEditorPreview();

}


function validatePostBodyImageFile(
  file
) {

  /*
    DB의 CHECK 제약과 같은 집합이다 — 여기 검사는 빨리 알려주기
    위한 것이고 신뢰 경계는 DB다
    (posts/editor/posts-cover-image.js의 같은 상수).
  */

  if (
    !POST_COVER_ALLOWED_MIME.includes(
      file.type
    )
  ) {

    return "사진은 PNG · JPG · WEBP · GIF만 넣을 수 있습니다.";

  }


  if (
    file.size > POST_COVER_MAX_BYTES
  ) {

    return "사진은 한 장당 5MB 이하만 넣을 수 있습니다.";

  }


  return null;

}


/*
  포인터가 버튼에 닿는 순간 caret을 잡아 둔다. 파일 선택창이
  열리면 편집 영역의 선택이 사라지고, 모바일에서는 앱이 잠깐
  배경으로 내려가면서 아예 복원되지 않는다 — 그래서 "고른 뒤에"가
  아니라 "고르러 가기 전에" 저장해야 한다(요구사항 1절).
*/

postEditorImageButton
  ?.addEventListener(
    "pointerdown",
    event => {

      captureEditorCaretBeforeToolbar();


      postBodyImageInsertRange =
        savedEditorRange
          ? savedEditorRange.cloneRange()
          : null;


      /* 버튼이 포커스를 훔쳐 caret이 지워지지 않게 한다 */

      event.preventDefault();

    }
  );


postEditorImageButton
  ?.addEventListener(
    "click",
    () => {

      if (!postBodyImageInsertRange) {

        captureEditorCaretBeforeToolbar();


        postBodyImageInsertRange =
          savedEditorRange
            ? savedEditorRange.cloneRange()
            : null;

      }


      postEditorImageFiles?.click();

    }
  );


postEditorImageFiles
  ?.addEventListener(
    "change",
    event => {

      const entries =
        [];


      let rejected =
        "";


      for (const file of event.target.files) {

        const message =
          validatePostBodyImageFile(
            file
          );


        if (message) {

          rejected =
            message;

          continue;

        }


        const id =
          crypto.randomUUID();


        const objectUrl =
          URL.createObjectURL(
            file
          );


        postBodyImagePending.set(
          id,
          {
            file,
            objectUrl
          }
        );


        entries.push({
          id,
          objectUrl
        });

      }


      event.target.value =
        "";


      insertPostBodyImagesAtCaret(
        entries
      );


      showPostEditorMessage(
        rejected ||
        (
          entries.length
            ? "사진은 저장할 때 올라갑니다."
            : ""
        )
      );

    }
  );



/* =========================================================
   대표 사진

   본문 사진을 누르면 그 사진 오른쪽 위에 '대표' 컨트롤이 뜬다.
   컨트롤은 contenteditable **밖의** 요소이고 위치만 사진에
   맞춘다 — 본문 HTML에 들어갈 자리가 아예 없다(요구사항 2절).
========================================================== */

function markPostBodyImagePrimary(
  image
) {

  if (!postEditorContent) {

    return;

  }


  /*
    "다른 사진을 지정하면 기존 지정은 해제한다" — 한 글에
    명시적 대표는 최대 한 장이다(DB에도 post_id 단위 unique
    partial index가 있다).
  */

  postEditorContent
    .querySelectorAll(
      `img.${POST_BODY_IMAGE_PRIMARY_CLASS}`
    )
    .forEach(
      node => {

        node.classList.remove(
          POST_BODY_IMAGE_PRIMARY_CLASS
        );

      }
    );


  if (image) {

    image.classList.add(
      POST_BODY_IMAGE_PRIMARY_CLASS
    );

  }

}


function getPostBodyImagePrimaryNode() {

  return postEditorContent
    ?.querySelector(
      `img.${POST_BODY_IMAGE_PRIMARY_CLASS}`
    ) || null;

}


let postBodyImageSelected =
  null;


function hidePostBodyImageControl() {

  postBodyImageSelected =
    null;


  if (postEditorImageControl) {

    postEditorImageControl.hidden =
      true;

  }

}


function showPostBodyImageControl(
  image
) {

  if (
    !postEditorImageControl ||
    !postEditorImagePrimaryToggle ||
    !image
  ) {

    return;

  }


  postBodyImageSelected =
    image;


  const isPrimary =
    image.classList.contains(
      POST_BODY_IMAGE_PRIMARY_CLASS
    );


  postEditorImagePrimaryToggle.textContent =
    isPrimary
      ? "대표 해제"
      : "대표";


  postEditorImagePrimaryToggle.setAttribute(
    "aria-pressed",
    String(isPrimary)
  );


  postEditorImageControl.hidden =
    false;


  positionPostBodyImageControl();

}


/*
  컨트롤은 #postEditorRichtextMode 기준의 absolute다 — 편집
  영역이 스크롤되거나 폭이 바뀌어도 사진 오른쪽 위에 붙어
  있어야 하므로 매번 두 사각형의 차이로 좌표를 낸다.
*/

function positionPostBodyImageControl() {

  if (
    !postBodyImageSelected ||
    !postEditorImageControl ||
    !postEditorRichtextMode ||
    postEditorImageControl.hidden
  ) {

    return;

  }


  if (
    !postEditorContent?.contains(
      postBodyImageSelected
    )
  ) {

    /* 사진이 지워졌다(undo/삭제) — 컨트롤도 함께 사라진다 */

    hidePostBodyImageControl();


    return;

  }


  const host =
    postEditorRichtextMode.getBoundingClientRect();


  const box =
    postBodyImageSelected.getBoundingClientRect();


  /*
    컨트롤은 transform: translate(-100%)로 왼쪽으로 밀리므로 이
    left 값이 곧 오른쪽 끝이다. 사진이 아주 좁으면(세로로 긴 사진,
    작은 아이콘) 그 끝이 편집 영역 왼쪽 밖으로 나가 버튼이 화면에서
    잘린다 — 모바일 폭에서 특히 그렇다. 그래서 편집 영역 안으로
    끌어당긴다.
  */

  const width =
    postEditorImageControl.offsetWidth ||
    0;


  const right =
    Math.min(
      Math.max(
        box.right - host.left,
        width
      ),
      host.width
    );


  postEditorImageControl.style.left =
    `${right}px`;


  postEditorImageControl.style.top =
    `${box.top - host.top}px`;

}


postEditorContent
  ?.addEventListener(
    "click",
    event => {

      const image =
        event.target?.closest?.("img");


      if (
        image &&
        postEditorContent.contains(image)
      ) {

        showPostBodyImageControl(
          image
        );


        return;

      }


      hidePostBodyImageControl();

    }
  );


postEditorImagePrimaryToggle
  ?.addEventListener(
    "pointerdown",
    event => {

      /* 컨트롤을 누르는 동안 편집 영역의 선택이 날아가지 않게 */

      event.preventDefault();

    }
  );


postEditorImagePrimaryToggle
  ?.addEventListener(
    "click",
    () => {

      if (!postBodyImageSelected) {

        return;

      }


      const wasPrimary =
        postBodyImageSelected.classList.contains(
          POST_BODY_IMAGE_PRIMARY_CLASS
        );


      /*
        대표 지정은 본문 글자를 바꾸지 않지만 undo 한 번으로
        되돌아가야 한다 — 스냅샷이 class까지 담는다.
      */

      pushEditorUndoSnapshot(
        true
      );


      markPostBodyImagePrimary(
        wasPrimary
          ? null
          : postBodyImageSelected
      );


      showPostBodyImageControl(
        postBodyImageSelected
      );


      showPostEditorMessage(
        wasPrimary
          ? "대표 사진 지정을 해제했습니다. 본문의 첫 번째 사진이 대표가 됩니다."
          : "대표 사진으로 지정했습니다."
      );

    }
  );


/* 편집 중 본문이 바뀌면(타이핑·삭제·undo) 컨트롤 자리를 다시 맞춘다 */

postEditorContent
  ?.addEventListener(
    "input",
    positionPostBodyImageControl
  );

postEditorContent
  ?.addEventListener(
    "scroll",
    positionPostBodyImageControl,
    {
      passive: true
    }
  );

window.addEventListener(
  "resize",
  positionPostBodyImageControl
);



/* =========================================================
   저장

   posts-save.js가 본문 저장 직전에 부른다.

     1) 본문에 남아 있는 사진을 순서대로 모은다
     2) 아직 안 올린 것만 새 경로에 올린다(대표를 바꿨다고 다시
        올리는 일은 없다 — 대표는 행의 boolean이다)
     3) save_own_gallery_images가 이 글의 사진 집합을 통째로
        교체하고, 더 이상 아무도 참조하지 않는 옛 경로를 돌려준다
     4) 그 경로만 지운다

   실패하면 이번에 올린 파일만 지우고 error를 돌려준다 —
   호출자가 글 저장을 멈춘다. 기존 사진 행도 파일도 그대로다.
========================================================== */

function collectPostBodyImageRows() {

  const rows =
    [];


  if (!postEditorContent) {

    return rows;

  }


  /*
    HTML 모드에서는 저장되는 본문이 textarea의 raw HTML이다 — 숨겨져
    있는 리치텍스트 영역에 남은 사진을 세면, 저장된 본문이 가리키지도
    않는 사진 행이 남는다. 실제로 저장될 본문에서 센다.

    그 모드에는 대표 표시가 없다(편집 컨트롤이 없는 화면이다) —
    지정 없음으로 두면 본문 첫 사진이 대표가 된다.
  */

  const source =
    editorContentMode === "html"
      ? (() => {

          const holder =
            document.createElement("div");


          holder.innerHTML =
            postEditorHtmlContent?.value || "";


          return holder;

        })()
      : postEditorContent;


  const primary =
    source === postEditorContent
      ? getPostBodyImagePrimaryNode()
      : null;


  Array.from(
    source.querySelectorAll("img")
  ).forEach(
    image => {

      const id =
        getPostBodyImageId(
          image
        );


      if (
        !id ||
        rows.some(row => row.id === id)
      ) {

        return;

      }


      rows.push({
        id,
        node: image,
        isPrimary: image === primary
      });

    }
  );


  return rows;

}


async function savePostBodyImages(
  postId
) {

  const rows =
    collectPostBodyImageRows();


  const hadSavedImages =
    postBodyImageSaved.size > 0;


  /*
    사진이 없었고 지금도 없으면 왕복 자체를 하지 않는다 — 사진을
    한 번도 쓰지 않는 평범한 글이 이 기능 때문에 느려지지 않게.
  */

  if (
    !rows.length &&
    !hadSavedImages
  ) {

    return null;

  }


  /*
    metadata를 못 받아온 상태에서 저장하면 이미 저장돼 있던 사진의
    storage_path를 넘길 수 없어 그 사진들이 통째로 지워진다.
    그래서 멈춘다(요구사항 4절 "사진 저장 과정에서 ... 사라지면
    안 된다").
  */

  if (
    (postBodyImageLoading || postBodyImageLoadFailed) &&
    currentEditorMode === "edit"
  ) {

    return new Error(
      "Body images could not be loaded"
    );

  }


  const uploaded =
    [];


  try {

    const user =
      await getSignedInUser();


    const options =
      await loadImorySiteContentOptions();


    const payload =
      [];


    for (const [position, row] of rows.entries()) {

      const saved =
        postBodyImageSaved.get(
          row.id
        );


      if (saved) {

        payload.push({
          id: row.id,
          storage_path: saved.storage_path,
          mime_type: saved.mime_type,
          byte_size: saved.byte_size,
          position,
          is_primary: row.isPrimary
        });


        continue;

      }


      const pending =
        postBodyImagePending.get(
          row.id
        );


      if (!pending) {

        /*
          본문에는 있는데 파일도 저장된 metadata도 없다 — 다른 글의
          HTML을 붙여넣었거나 우리가 모르는 식별자다. 조용히 빼고
          넘어간다(본문 HTML에서도 그 img는 저장되지 않게 아래에서
          지운다).
        */

        row.node.remove();


        continue;

      }


      /*
        올리기 전에 메타데이터를 지우고 용량을 줄인다(모든 업로드
        경로 공용 — core/lib/image-upload.js). 압축은 설정과
        무관하게 항상 돌고, "EXIF 제거"가 켜져 있으면 실패했을 때
        원본을 대신 올리지 않고 저장을 멈춘다.
      */

      const prepared =
        await prepareImoryUploadImage(
          pending.file,
          {
            stripMetadata:
              options.stripImageExif
          }
        );


      if (prepared.error) {

        throw prepared.error;

      }


      const file =
        prepared.file;


      const storagePath =
        buildPostCoverStoragePath(
          user.id,
          file.type
        );


      const {
        error: uploadError
      } =
        await supabaseClient
          .storage
          .from(POST_COVER_BUCKET)
          .upload(
            storagePath,
            file,
            {
              upsert: false,
              contentType: file.type
            }
          );


      if (uploadError) {

        throw uploadError;

      }


      uploaded.push(
        storagePath
      );


      payload.push({
        id: row.id,
        storage_path: storagePath,
        mime_type: file.type,
        byte_size: file.size,
        position,
        is_primary: row.isPrimary
      });

    }


    const {
      data,
      error
    } =
      await supabaseClient
        .rpc(
          "save_own_gallery_images",
          {
            p_post_id: postId,
            p_images: payload
          }
        );


    if (error) {

      throw error;

    }


    /*
      저장에 성공했다 — 방금 올린 파일도 이제 "저장된 사진"이다.
      같은 폼에서 한 번 더 저장해도 다시 올리지 않는다.
    */

    postBodyImageSavedPrimaryId =
      payload.find(row => row.is_primary)?.id || null;


    payload.forEach(
      row => {

        postBodyImageSaved.set(
          row.id,
          {
            storage_path: row.storage_path,
            mime_type: row.mime_type,
            byte_size: row.byte_size
          }
        );


        const pending =
          postBodyImagePending.get(
            row.id
          );


        if (pending) {

          /*
            미리보기(blob:)를 정식 주소로 바꾼다. 이 폼에 그대로
            머무를 수도 있으므로(저장 실패 후 재시도 등) 화면의
            사진이 끊기지 않게 한다.
          */

          const node =
            findPostBodyImageNode(
              row.id
            );


          if (node) {

            node.setAttribute(
              "src",
              buildPostBodyImageUrl(
                row.id
              )
            );

          }


          URL.revokeObjectURL(
            pending.objectUrl
          );


          postBodyImagePending.delete(
            row.id
          );

        }

      }
    );


    /*
      RPC가 돌려준 것은 "이 글에서 밀려났고, 다른 사진 행도
      post_covers도 더 이상 참조하지 않는" 경로뿐이다 — 그래서
      아직 저장된 다른 글이나 예전 COVER가 이 정리 때문에
      깨지지 않는다(요구사항 4절 마지막).

      여기서 실패해도 글과 사진은 이미 저장됐다. 고아 파일이
      남을 뿐이므로 로그만 남기고 성공으로 끝낸다.
    */

    if (data?.length) {

      try {

        await supabaseClient
          .storage
          .from(POST_COVER_BUCKET)
          .remove(data);

      }

      catch (cleanupError) {

        console.warn(
          "[body-images] 사진은 저장했지만 옛 파일 정리에 실패했습니다:",
          cleanupError
        );

      }

    }


    return null;

  }

  catch (error) {

    if (uploaded.length) {

      await supabaseClient
        .storage
        .from(POST_COVER_BUCKET)
        .remove(uploaded);

    }


    return error;

  }

}


/*
  "저장하지 않은 입력"에 사진도 포함시킨다 — 본문 HTML 비교만으로는
  대표 지정 변경이 잡히지 않고(class는 sanitize된 HTML에 안 남는다),
  아직 안 올린 파일이 있는 채로 나가면 조용히 사라진다.
*/

function postBodyImagesHavePendingChange() {

  if (
    !postEditorContent ||
    !postEditor ||
    postEditor.hidden
  ) {

    return false;

  }


  const rows =
    collectPostBodyImageRows();


  if (
    rows.some(row => postBodyImagePending.has(row.id))
  ) {

    return true;

  }


  const primaryId =
    rows.find(row => row.isPrimary)?.id || null;


  return primaryId !== postBodyImageSavedPrimaryId;

}
