/* =========================================================
   SETTINGS — CATEGORY DISPLAY (GALLERY-1)

   카테고리 한 줄 아래에 붙는 표시 설정 줄. 세 가지를 고르고,
   "지정 이미지"를 골랐을 때만 그 카테고리 공통 대체 이미지를
   올린다.

     표시 방식      list | gallery
     페이지당 글 수 6 | 12 | 18 | 24 (갤러리 기본 12)
     비밀글 미리보기 lock(기본 잠금 표시) | image(지정 이미지)

   보호 설정(EXIF 제거 · 우클릭/복사 차단)은 카테고리가 아니라
   **블로그 전체** 설정이라 Settings > HOME > ETC에 있다
   (admin/settings/admin-etc-settings.js, 기준 문서 §13).

   기준 문서: IMORY_GALLERY1_DESIGN.md §2
   DB: supabase/migrations/20260910100000_gallery_category_and_post_covers.sql
       supabase/migrations/20260911100000_post_covers_private_access.sql

   ★ 지정 이미지에도 공개 주소가 없다 (GALLERY-1 후속)
     'post-covers'는 비공개 버킷이라 여기 미리보기도 우리 도메인
     경로(/api/post-cover?category=<id>)로 받는다. 저장된 값은
     secret_cover_path(버킷 안 경로) 하나이고, https 주소를 담던
     secret_cover_url 컬럼은 사라졌다(core/lib/post-cover-url.js).

   ★ 이미지 업로드 시점
     글 대표 이미지(posts/editor/posts-cover-image.js)와 같은 규칙이다 —
     고르는 순간에는 미리보기만 하고, SAVE를 눌렀을 때 새 경로에
     올린 뒤 카테고리 행이 저장되면 그때 예전 파일을 지운다. 그래서
     설정을 고치다 그만두면 Storage에 아무것도 남지 않고, 저장이
     실패해도 예전 이미지가 그대로다.

   ★ migration이 적용되지 않은 배포
     표시/보호 컬럼이 없으면 이 줄을 아예 그리지 않는다 —
     UPDATE에 없는 컬럼을 넣으면 카테고리 저장 전체가 실패한다.
     판정은 admin-settings-load.js의 첫 조회 결과로 한 번만 한다.

   classic script. admin-settings-load.js(categories 상태, renderCategories)
   **뒤에**, admin-settings-save.js **앞에** 로드된다.
========================================================== */

const CATEGORY_SECRET_COVER_BUCKET =
  "post-covers";

const CATEGORY_SECRET_COVER_ALLOWED_MIME =
  [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif"
  ];

const CATEGORY_SECRET_COVER_MAX_BYTES =
  5 * 1024 * 1024;

const CATEGORY_SECRET_COVER_EXTENSION_BY_MIME =
  {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif"
  };


const CATEGORY_PAGE_SIZE_OPTIONS =
  [6, 12, 18, 24];


/*
  admin-settings-load.js의 loadCategories()가 이 값을 세운다 —
  select에 gallery 컬럼을 넣었을 때 42703이 나면 false.
*/

let categoryDisplayColumnsAvailable =
  true;


function setCategoryDisplayColumnsAvailable(
  available
) {

  categoryDisplayColumnsAvailable =
    available !== false;

}


/* =========================================================
   값 정규화 — DB CHECK과 같은 집합
========================================================== */

function normalizeCategoryDisplayFields(
  category
) {

  if (category.type === "post" && category.list_style === "gallery") {
    category.type = "gallery";
  }

  category.list_style =
    category.list_style === "gallery"
      ? "gallery"
      : "list";


  category.page_size =
    CATEGORY_PAGE_SIZE_OPTIONS.includes(
      Number(category.page_size)
    )
      ? Number(category.page_size)
      : 12;


  category.secret_cover_mode =
    category.secret_cover_mode === "image"
      ? "image"
      : "lock";


  if (typeof category.secret_cover_path !== "string") {

    category.secret_cover_path =
      null;

  }


  return category;

}


/* =========================================================
   한 줄 그리기

   반환값을 .category-item에 append하면 grid의 4번째 항목으로
   들어가 전체 폭을 차지한다(admin/admin-settings.css).
   banner 카테고리에는 붙이지 않는다 — 배너에는 글 목록이 없다.
========================================================== */

function buildCategoryDisplayRow(
  category,
  onChanged
) {

  if (
    !categoryDisplayColumnsAvailable ||
    category.type !== "gallery"
  ) {

    return null;

  }


  normalizeCategoryDisplayFields(
    category
  );


  const row =
    document.createElement(
      "div"
    );

  row.className =
    "category-display-row";


  const makeSelect =
    (label, options, value, onSelect) => {

      const wrap =
        document.createElement("label");

      wrap.className =
        "category-display-control";

      const caption =
        document.createElement("span");

      caption.className =
        "category-display-label";

      caption.textContent =
        label;

      const select =
        document.createElement("select");

      select.className =
        "category-display-select imory-field imory-field--sm";

      options.forEach((option) => {

        const optionElement =
          document.createElement("option");

        optionElement.value =
          String(option.value);

        optionElement.textContent =
          option.label;

        select.appendChild(optionElement);

      });

      select.value =
        String(value);

      select.addEventListener(
        "change",
        () => {
          onSelect(select.value);
        }
      );

      wrap.append(caption, select);

      row.appendChild(wrap);

      return select;

    };


  const pageSizeSelect =
    makeSelect(
      "페이지당",
      CATEGORY_PAGE_SIZE_OPTIONS.map(
        (size) => ({ value: size, label: `${size}개` })
      ),
      category.page_size,
      (value) => {

        category.page_size =
          Number(value);

      }
    );


  /*
    페이지 수는 갤러리에서만 의미가 있다 — 목록 표시는 지금까지처럼
    페이지를 나누지 않는다. 값은 지우지 않고 비활성만 한다(갤러리로
    되돌리면 고른 값이 그대로 살아난다).
  */

  pageSizeSelect.disabled =
    category.type !== "gallery";


  makeSelect(
    "비밀글",
    [
      { value: "lock", label: "잠금 표시" },
      { value: "image", label: "지정 이미지" }
    ],
    category.secret_cover_mode,
    (value) => {

      category.secret_cover_mode =
        value === "image"
          ? "image"
          : "lock";

      onChanged();

    }
  );


  if (category.secret_cover_mode === "image") {

    row.appendChild(
      buildCategorySecretCoverControl(
        category,
        onChanged
      )
    );

  }


  return row;

}


/* =========================================================
   지정 이미지 — 미리보기 + 업로드/제거

   실제 업로드는 SAVE가 한다(위 상단 주석). 여기서는 파일을
   category 객체에 얹어 두고 objectURL로 미리보기만 한다.
========================================================== */

function currentCategorySecretCoverPreview(
  category
) {

  if (category.__pendingSecretCoverObjectUrl) {

    return category.__pendingSecretCoverObjectUrl;

  }


  if (category.__secretCoverRemoveRequested) {

    return null;

  }


  /*
    저장된 이미지는 경로만 알고 있고 주소는 프록시가 만든다.
    새 카테고리(id 없음)는 아직 저장 전이라 미리보기가 없다.

    __secretCoverBust는 **저장이 끝난 직후 한 번만** 바뀐다 —
    주소는 카테고리 id만 담고 있어서 사진을 교체해도 그대로이고,
    같은 페이지에 이미 그려져 있던 <img>가 옛 그림을 그대로 들고
    있을 수 있기 때문이다. 매 렌더마다 바꾸지는 않는다(그러면
    재확인조차 못 하게 된다).
  */

  return category.secret_cover_path && category.id
    ? buildCategoryCoverUrl(
        category.id,
        {
          bust: category.__secretCoverBust || null
        }
      )
    : null;

}


function releaseCategorySecretCoverObjectUrl(
  category
) {

  if (category.__pendingSecretCoverObjectUrl) {

    try {

      URL.revokeObjectURL(
        category.__pendingSecretCoverObjectUrl
      );

    }

    catch (err) {

      /* 이미 해제됨 — 무시 */

    }


    category.__pendingSecretCoverObjectUrl =
      null;

  }

}


function buildCategorySecretCoverControl(
  category,
  onChanged
) {

  const wrap =
    document.createElement("div");

  wrap.className =
    "category-display-control category-secret-cover";


  const preview =
    document.createElement("div");

  preview.className =
    "category-secret-cover-preview";


  const previewUrl =
    currentCategorySecretCoverPreview(category);


  if (previewUrl) {

    const image =
      document.createElement("img");

    image.src =
      previewUrl;

    image.alt =
      "비밀글 대체 이미지";

    preview.appendChild(image);

  }

  else {

    const empty =
      document.createElement("span");

    empty.className =
      "category-secret-cover-empty";

    empty.textContent =
      "잠금";

    preview.appendChild(empty);

  }


  const fileInput =
    document.createElement("input");

  fileInput.type =
    "file";

  fileInput.accept =
    CATEGORY_SECRET_COVER_ALLOWED_MIME.join(",");

  fileInput.hidden =
    true;


  const selectButton =
    document.createElement("button");

  selectButton.type =
    "button";

  selectButton.className =
    "category-secret-cover-button imory-button imory-button--ghost imory-button--sm";

  selectButton.textContent =
    previewUrl
      ? "교체"
      : "업로드";


  selectButton.addEventListener(
    "click",
    () => {
      fileInput.click();
    }
  );


  fileInput.addEventListener(
    "change",
    () => {

      const file =
        fileInput.files && fileInput.files[0];

      if (!file) {
        return;
      }


      if (
        !CATEGORY_SECRET_COVER_ALLOWED_MIME.includes(file.type)
      ) {

        categorySaveMessage.textContent =
          "PNG · JPG · WEBP · GIF만 올릴 수 있습니다.";

        return;

      }


      if (file.size > CATEGORY_SECRET_COVER_MAX_BYTES) {

        categorySaveMessage.textContent =
          "5MB 이하 파일만 올릴 수 있습니다.";

        return;

      }


      releaseCategorySecretCoverObjectUrl(category);


      category.__pendingSecretCoverFile =
        file;

      category.__pendingSecretCoverObjectUrl =
        URL.createObjectURL(file);

      category.__secretCoverRemoveRequested =
        false;


      categorySaveMessage.textContent =
        "저장하면 반영됩니다.";


      onChanged();

    }
  );


  wrap.append(preview, fileInput, selectButton);


  if (previewUrl) {

    const removeButton =
      document.createElement("button");

    removeButton.type =
      "button";

    removeButton.className =
      "category-secret-cover-button imory-button imory-button--ghost imory-button--sm";

    removeButton.textContent =
      "제거";


    removeButton.addEventListener(
      "click",
      () => {

        releaseCategorySecretCoverObjectUrl(category);

        category.__pendingSecretCoverFile =
          null;

        /*
          저장돼 있던 이미지가 있을 때만 "제거 예약"이 의미가 있다.
          방금 고른 파일만 취소한 경우엔 상태만 되돌린다.
        */

        category.__secretCoverRemoveRequested =
          Boolean(category.secret_cover_path);


        categorySaveMessage.textContent =
          category.__secretCoverRemoveRequested
            ? "저장하면 제거됩니다. 이미지가 없으면 잠금 카드로 돌아갑니다."
            : "";


        onChanged();

      }
    );


    wrap.appendChild(removeButton);

  }


  return wrap;

}


/* =========================================================
   SAVE 경로 — admin-settings-save.js가 부른다

   1) uploadPendingCategorySecretCovers()
      고른 파일들을 **새 경로**에 올리고 category 객체의
      secret_cover_path를 새 값으로 바꾼다.
      바뀌기 전 값은 __previousSecretCoverPath에 적어 둔다.
      -> { ok, message }

   2) 카테고리 행 UPDATE (admin-settings-save.js)

   3) cleanupReplacedCategorySecretCovers()
      저장이 성공한 뒤에만, 밀려난 예전 파일을 지운다.

   4) rollbackPendingCategorySecretCovers()
      저장이 실패했을 때 방금 올린 파일만 지우고 값을 되돌린다.
========================================================== */

function buildCategorySecretCoverPath(
  userId,
  mimeType
) {

  const extension =
    CATEGORY_SECRET_COVER_EXTENSION_BY_MIME[mimeType] ||
    "bin";


  const unique =
    (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    )
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;


  return `${userId}/category-secret/${unique}.${extension}`;

}


async function uploadPendingCategorySecretCovers(
  userId,
  list
) {

  for (const category of list) {

    /* 제거 요청: 값만 비운다. 파일 삭제는 3)에서 한다. */

    if (
      category.__secretCoverRemoveRequested &&
      !category.__pendingSecretCoverFile
    ) {

      category.__previousSecretCoverPath =
        category.secret_cover_path || null;

      category.secret_cover_path =
        null;

      continue;

    }


    if (!category.__pendingSecretCoverFile) {

      continue;

    }


    /*
      블로그 설정이 "이미지 EXIF 제거"면 올리기 전에 다시
      인코딩한다. 실패하면 원본을 대신 올리지 않고 저장을 멈춘다 —
      지우라고 켜 둔 설정이기 때문이다
      (core/lib/content-protection.js · admin-etc-settings.js).
    */

    const stripped =
      await stripImageExifIfNeeded(
        category.__pendingSecretCoverFile,
        typeof imoryEtcStripImageExifEnabled === "function" &&
          imoryEtcStripImageExifEnabled()
      );


    if (stripped.error) {

      return {
        ok: false,
        message: "지정 이미지에서 촬영 정보(EXIF)를 지우지 못해 올리지 않았습니다."
      };

    }


    const file =
      stripped.file;

    const storagePath =
      buildCategorySecretCoverPath(userId, file.type);


    const {
      error: uploadError
    } =
      await supabaseClient
        .storage
        .from(CATEGORY_SECRET_COVER_BUCKET)
        .upload(
          storagePath,
          file,
          {
            upsert: false,
            contentType: file.type,
            cacheControl: "31536000"
          }
        );


    if (uploadError) {

      console.error(
        "category secret cover upload error:",
        uploadError
      );


      return {
        ok: false,
        message: "비밀글 대체 이미지를 올리지 못했습니다."
      };

    }


    category.__previousSecretCoverPath =
      category.secret_cover_path || null;

    category.__uploadedSecretCoverPath =
      storagePath;

    category.secret_cover_path =
      storagePath;

  }


  return {
    ok: true
  };

}


async function removeCategorySecretCoverObjects(
  paths
) {

  const targets =
    paths.filter(Boolean);


  if (!targets.length) {

    return;

  }


  try {

    await supabaseClient
      .storage
      .from(CATEGORY_SECRET_COVER_BUCKET)
      .remove(targets);

  }

  catch (err) {

    console.warn(
      "[admin-settings-category-display] 이전 대체 이미지 삭제 실패(고아 파일):",
      err
    );

  }

}


async function cleanupReplacedCategorySecretCovers(
  list
) {

  await removeCategorySecretCoverObjects(
    list.map(
      (category) => category.__previousSecretCoverPath
    )
  );


  list.forEach((category) => {

    releaseCategorySecretCoverObjectUrl(category);

    /* 방금 저장으로 사진이 바뀌었을 수 있다 — 미리보기 <img>가
       옛 그림을 들고 있지 않게 주소를 한 번 흔든다 */

    if (category.__uploadedSecretCoverPath) {

      category.__secretCoverBust =
        Date.now();

    }

    category.__pendingSecretCoverFile =
      null;

    category.__secretCoverRemoveRequested =
      false;

    category.__previousSecretCoverPath =
      null;

    category.__uploadedSecretCoverPath =
      null;

  });

}


async function rollbackPendingCategorySecretCovers(
  list
) {

  await removeCategorySecretCoverObjects(
    list.map(
      (category) => category.__uploadedSecretCoverPath
    )
  );


  list.forEach((category) => {

    if (category.__uploadedSecretCoverPath) {

      /* 저장이 실패했으니 화면의 값도 예전 값으로 되돌린다 */

      category.secret_cover_path =
        category.__previousSecretCoverPath || null;

    }


    category.__uploadedSecretCoverPath =
      null;

    category.__previousSecretCoverPath =
      null;

  });

}
