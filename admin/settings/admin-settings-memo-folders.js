/* =========================================================
   SETTINGS — 메모 폴더 (HIGHLIGHT-1 §7)

   카테고리 한 줄 아래에 붙는 "메모 화면에서 이 카테고리를 어떻게
   보여줄까" 설정.

     메모 순서   메모 화면의 폴더 차례 (↑ ↓)
     커버        폴더 카드의 사진
     비율        1:1 | 3:4 | 4:3 | 원본
     구도        커버가 잘리는 위치 (가로/세로 %)

   기준 문서: IMORY_HIGHLIGHT1_DESIGN.md §7
   DB: supabase/migrations/20260913100000_post_highlights_and_memo_folders.sql

   ★ 원본 카테고리 설정과 분리돼 있다 (요구사항 7)

   이 줄이 만지는 것은 categories가 아니라 memo_folder_settings의
   행이다. 그래서 메모 폴더의 순서·커버를 바꿔도 카테고리 목록의
   순서(categories.sort_order)나 갤러리 커버(secret_cover_path)는
   한 글자도 바뀌지 않는다. 반대도 마찬가지다.

   ★ 순서는 기존 카테고리 관리 흐름 그대로다

   카테고리 순서를 바꾸는 것과 **같은 ↑↓ 조작**이다
   (admin-settings-load.js의 moveCategory와 같은 모양). 다만 움직이는
   배열이 다르다 — memoFolderOrder는 메모 화면 전용 순서고, 원본
   카테고리 배열은 건드리지 않는다. 설정을 한 번도 만지지 않은
   카테고리는 memo_folder_settings에 행 자체가 없고, 그때는 메모
   화면이 원본 카테고리 순서를 그대로 쓴다.

   ★ 이미지 업로드 시점

   글 대표 이미지·카테고리 지정 이미지와 같은 규칙이다 — 고르는
   순간에는 미리보기만 하고, SAVE를 눌렀을 때 새 경로에 올린 뒤 행이
   저장되면 그때 예전 파일을 지운다. 그래서 고치다 그만두면 Storage에
   아무것도 남지 않고, 저장이 실패해도 예전 이미지가 그대로다.

   ★ migration이 적용되지 않은 배포

   memo_folder_settings가 없으면 이 줄을 아예 그리지 않는다 —
   첫 조회에서 한 번 판정한다(아래 loadMemoFolderSettingsForAdmin).

   classic script. admin-settings-category-display.js **뒤에**,
   admin-settings-save.js **앞에** 로드된다.
========================================================== */


const MEMO_FOLDER_COVER_BUCKET =
  "post-covers";


const MEMO_FOLDER_COVER_ALLOWED_MIME =
  [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif"
  ];


const MEMO_FOLDER_COVER_MAX_BYTES =
  5 * 1024 * 1024;


const MEMO_FOLDER_COVER_EXTENSION_BY_MIME =
  {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif"
  };


const MEMO_FOLDER_RATIOS =
  [
    { value: "original", label: "원본" },
    { value: "1:1", label: "1:1" },
    { value: "3:4", label: "3:4" },
    { value: "4:3", label: "4:3" }
  ];


/* 이 배포에 memo_folder_settings가 있는가 */

let memoFolderTableAvailable =
  true;


/* category.id -> 저장된 설정 */

let memoFolderSettingsById =
  new Map();


/* 메모 화면의 폴더 차례(카테고리 id 배열) */

let memoFolderOrder =
  [];


/* 이번 SAVE에서 지울 이전 파일들 */

let memoFolderReplacedPaths =
  [];



/* =========================================================
   불러오기 — loadCategories() 직후에 부른다
========================================================== */

async function loadMemoFolderSettingsForAdmin(
  userId
) {

  memoFolderSettingsById =
    new Map();


  memoFolderOrder =
    [];


  if (!userId) {

    return;

  }


  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "memo_folder_settings"
      )
      .select(
        "category_id, sort_order, has_cover, cover_ratio, cover_focus_x, cover_focus_y"
      )
      .eq(
        "user_id",
        userId
      );


  if (error) {

    /*
      42P01(테이블 없음) — migration 이전 배포. 이 줄을 그리지 않는다.
      다른 오류도 같게 취급한다: 설정을 모르는 채로 저장 payload를
      만들면 안 되기 때문이다.
    */

    console.warn(
      "memo folder settings load error:",
      error
    );


    memoFolderTableAvailable =
      false;


    return;

  }


  memoFolderTableAvailable =
    true;


  (
    Array.isArray(data)
      ? data
      : []
  ).forEach(
    (row) => {

      memoFolderSettingsById.set(
        Number(row.category_id),
        {
          sortOrder:
            Number(row.sort_order) || 0,

          hasCover:
            row.has_cover === true,

          coverRatio:
            typeof row.cover_ratio === "string"
              ? row.cover_ratio
              : "original",

          coverFocusX:
            Number(row.cover_focus_x ?? 50),

          coverFocusY:
            Number(row.cover_focus_y ?? 50)
        }
      );

    }
  );

}


/*
  카테고리 배열이 정해진 뒤 메모 폴더 차례를 만든다. 저장된 순서가
  있는 카테고리가 먼저, 없는 카테고리는 원본 카테고리 순서대로 뒤에
  붙는다 — 한 번도 만지지 않았으면 두 순서가 같다.
*/

function syncMemoFolderOrder(
  list
) {

  const ids =
    list
      .filter(
        (category) =>
          category.id &&
          category.type !== "banner"
      )
      .map(
        (category) =>
          Number(category.id)
      );


  const known =
    ids.filter(
      (id) =>
        memoFolderSettingsById.has(id)
    );


  known.sort(
    (a, b) =>
      (memoFolderSettingsById.get(a).sortOrder || 0) -
      (memoFolderSettingsById.get(b).sortOrder || 0)
  );


  const rest =
    ids.filter(
      (id) =>
        !memoFolderSettingsById.has(id)
    );


  /*
    이미 화면에서 끌어 놓은 차례가 있으면 그것을 유지하고 새 카테고리만
    뒤에 붙인다(렌더가 여러 번 돌아도 차례가 되돌아가지 않는다).
  */

  const base =
    memoFolderOrder.length
      ? memoFolderOrder.filter(
          (id) =>
            ids.includes(id)
        )
      : known.concat(rest);


  memoFolderOrder =
    base.concat(
      ids.filter(
        (id) =>
          !base.includes(id)
      )
    );

}


function memoFolderSettingsFor(
  category
) {

  const id =
    Number(category.id);


  if (!memoFolderSettingsById.has(id)) {

    memoFolderSettingsById.set(
      id,
      {
        sortOrder:
          0,

        hasCover:
          false,

        coverRatio:
          "original",

        coverFocusX:
          50,

        coverFocusY:
          50
      }
    );

  }


  return memoFolderSettingsById.get(id);

}



/* =========================================================
   줄 그리기
========================================================== */

function buildMemoFolderRow(
  category,
  onChanged
) {

  if (
    !memoFolderTableAvailable ||
    !category.id ||
    category.type === "banner"
  ) {

    /*
      배너 카테고리에는 글이 없으니 하이라이트도 없다. 아직 저장되지
      않은 새 카테고리도 대상이 아니다 — 저장된 뒤 다시 열면 나온다.
    */

    return null;

  }


  const settings =
    memoFolderSettingsFor(category);


  const row =
    document.createElement("div");


  row.className =
    "category-display-row memo-folder-row";


  const caption =
    document.createElement("span");


  caption.className =
    "category-display-label";


  caption.textContent =
    "메모 폴더";


  row.appendChild(caption);


  /* --- 순서 --- */

  const orderWrap =
    document.createElement("div");


  orderWrap.className =
    "category-display-control";


  const index =
    memoFolderOrder.indexOf(
      Number(category.id)
    );


  [
    { label: "↑", delta: -1 },
    { label: "↓", delta: 1 }
  ].forEach(
    (spec) => {

      const button =
        document.createElement("button");


      button.type =
        "button";


      button.className =
        "imory-button imory-button--ghost imory-button--sm";


      button.textContent =
        spec.label;


      button.setAttribute(
        "aria-label",
        spec.delta < 0
          ? "메모 폴더 순서 위로"
          : "메모 폴더 순서 아래로"
      );


      button.disabled =
        index < 0 ||
        index + spec.delta < 0 ||
        index + spec.delta >= memoFolderOrder.length;


      button.addEventListener(
        "click",
        () => {

          moveMemoFolder(
            index,
            spec.delta
          );


          onChanged();

        }
      );


      orderWrap.appendChild(button);

    }
  );


  row.appendChild(orderWrap);


  /* --- 커버 --- */

  row.appendChild(
    buildMemoFolderCoverControl(
      category,
      settings,
      onChanged
    )
  );


  /* --- 비율 --- */

  const ratioWrap =
    document.createElement("label");


  ratioWrap.className =
    "category-display-control";


  const ratioCaption =
    document.createElement("span");


  ratioCaption.className =
    "category-display-label";


  ratioCaption.textContent =
    "비율";


  const ratioSelect =
    document.createElement("select");


  ratioSelect.className =
    "category-display-select imory-field imory-field--sm";


  MEMO_FOLDER_RATIOS.forEach(
    (option) => {

      const optionElement =
        document.createElement("option");


      optionElement.value =
        option.value;


      optionElement.textContent =
        option.label;


      ratioSelect.appendChild(optionElement);

    }
  );


  ratioSelect.value =
    settings.coverRatio;


  ratioSelect.addEventListener(
    "change",
    () => {

      settings.coverRatio =
        ratioSelect.value;


      onChanged();

    }
  );


  ratioWrap.append(
    ratioCaption,
    ratioSelect
  );


  row.appendChild(ratioWrap);


  /*
    --- 구도 ---

    "커버가 잘리는 위치"는 object-position이다. 원본 비율에서는
    자르지 않으므로 의미가 없어 비활성으로 둔다(값은 지우지 않는다 —
    비율을 되돌리면 고른 자리가 그대로 살아난다).
  */

  [
    { key: "coverFocusX", label: "가로" },
    { key: "coverFocusY", label: "세로" }
  ].forEach(
    (spec) => {

      const wrap =
        document.createElement("label");


      wrap.className =
        "category-display-control";


      const label =
        document.createElement("span");


      label.className =
        "category-display-label";


      label.textContent =
        spec.label;


      const range =
        document.createElement("input");


      range.type =
        "range";


      range.className =
        "imory-range imory-range--sm";


      range.min =
        "0";

      range.max =
        "100";

      range.step =
        "1";


      range.value =
        String(settings[spec.key]);


      range.disabled =
        settings.coverRatio === "original" ||
        !memoFolderHasCoverPreview(category, settings);


      range.addEventListener(
        "input",
        () => {

          settings[spec.key] =
            Number(range.value);

        }
      );


      wrap.append(label, range);


      row.appendChild(wrap);

    }
  );


  return row;

}


function moveMemoFolder(
  index,
  delta
) {

  const next =
    index + delta;


  if (
    index < 0 ||
    next < 0 ||
    next >= memoFolderOrder.length
  ) {

    return;

  }


  const moved =
    memoFolderOrder[index];


  memoFolderOrder[index] =
    memoFolderOrder[next];

  memoFolderOrder[next] =
    moved;

}


function memoFolderHasCoverPreview(
  category,
  settings
) {

  return Boolean(
    category.__pendingMemoCoverFile ||
    (
      settings.hasCover &&
      !category.__memoCoverRemoveRequested
    )
  );

}


function buildMemoFolderCoverControl(
  category,
  settings,
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


  let previewUrl =
    null;


  if (category.__pendingMemoCoverFile) {

    if (!category.__pendingMemoCoverUrl) {

      category.__pendingMemoCoverUrl =
        URL.createObjectURL(
          category.__pendingMemoCoverFile
        );

    }


    previewUrl =
      category.__pendingMemoCoverUrl;

  }

  else if (
    settings.hasCover &&
    !category.__memoCoverRemoveRequested &&
    typeof buildMemoFolderCoverUrl === "function"
  ) {

    previewUrl =
      buildMemoFolderCoverUrl(
        category.id,
        {
          bust:
            category.__memoCoverBust ||
            undefined
        }
      );

  }


  if (previewUrl) {

    const image =
      document.createElement("img");


    image.src =
      previewUrl;


    image.alt =
      "메모 폴더 커버";


    preview.appendChild(image);

  }

  else {

    const empty =
      document.createElement("span");


    empty.className =
      "category-secret-cover-empty";


    empty.textContent =
      "없음";


    preview.appendChild(empty);

  }


  const fileInput =
    document.createElement("input");


  fileInput.type =
    "file";


  fileInput.accept =
    MEMO_FOLDER_COVER_ALLOWED_MIME.join(",");


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
      : "커버";


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
        !MEMO_FOLDER_COVER_ALLOWED_MIME.includes(file.type)
      ) {

        window.alert(
          "png · jpg · webp · gif 만 올릴 수 있습니다."
        );


        return;

      }


      if (file.size > MEMO_FOLDER_COVER_MAX_BYTES) {

        window.alert(
          "5MB 이하 이미지만 올릴 수 있습니다."
        );


        return;

      }


      releaseMemoFolderCoverObjectUrl(category);


      category.__pendingMemoCoverFile =
        file;


      category.__memoCoverRemoveRequested =
        false;


      onChanged();

    }
  );


  wrap.append(
    preview,
    selectButton,
    fileInput
  );


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

        releaseMemoFolderCoverObjectUrl(category);


        category.__pendingMemoCoverFile =
          null;


        category.__memoCoverRemoveRequested =
          true;


        onChanged();

      }
    );


    wrap.appendChild(removeButton);

  }


  return wrap;

}


function releaseMemoFolderCoverObjectUrl(
  category
) {

  if (category.__pendingMemoCoverUrl) {

    try {

      URL.revokeObjectURL(
        category.__pendingMemoCoverUrl
      );

    }

    catch (err) {

      /* 무시 */

    }


    category.__pendingMemoCoverUrl =
      null;

  }

}



/* =========================================================
   저장 — SAVE가 카테고리 행을 모두 저장한 **뒤에** 부른다

   카테고리 저장이 실패하면 여기까지 오지 않는다. 반대로 여기서
   실패해도 카테고리 저장은 이미 끝나 있다 — 두 설정이 별개라는
   뜻이기도 하다(요구사항 7).

   -> { ok: true } | { ok: false, message }
========================================================== */

async function saveMemoFolderSettings(
  userId,
  list
) {

  if (!memoFolderTableAvailable) {

    return {
      ok: true
    };

  }


  memoFolderReplacedPaths =
    [];


  const targets =
    list.filter(
      (category) =>
        category.id &&
        category.type !== "banner"
    );


  for (const category of targets) {

    const settings =
      memoFolderSettingsFor(category);


    let coverPath =
      null;

    let keepCover =
      true;


    if (category.__pendingMemoCoverFile) {

      const prepared =
        await prepareImoryUploadImage(
          category.__pendingMemoCoverFile,
          {
            stripMetadata:
              typeof imoryEtcStripImageExifEnabled === "function" &&
                imoryEtcStripImageExifEnabled()
          }
        );


      if (prepared.error) {

        return {
          ok: false,

          message:
            "메모 폴더 커버에서 촬영 정보(EXIF)를 지우지 못해 올리지 않았습니다."
        };

      }


      const file =
        prepared.file;


      const storagePath =
        buildMemoFolderCoverPath(
          userId,
          file.type
        );


      const {
        error: uploadError
      } =
        await supabaseClient
          .storage
          .from(MEMO_FOLDER_COVER_BUCKET)
          .upload(
            storagePath,
            file,
            {
              upsert: false,

              contentType:
                file.type,

              cacheControl:
                "31536000"
            }
          );


      if (uploadError) {

        console.error(
          "memo folder cover upload error:",
          uploadError
        );


        return {
          ok: false,

          message:
            "메모 폴더 커버를 올리지 못했습니다."
        };

      }


      coverPath =
        storagePath;

      keepCover =
        false;

    }

    else if (category.__memoCoverRemoveRequested) {

      coverPath =
        null;

      keepCover =
        false;

    }


    const {
      data,
      error
    } =
      await supabaseClient
        .rpc(
          "upsert_own_memo_folder_settings",
          {
            p_category_id:
              Number(category.id),

            p_sort_order:
              Math.max(
                0,
                memoFolderOrder.indexOf(Number(category.id))
              ),

            p_cover_ratio:
              settings.coverRatio,

            p_cover_focus_x:
              settings.coverFocusX,

            p_cover_focus_y:
              settings.coverFocusY,

            p_cover_path:
              coverPath,

            p_keep_cover:
              keepCover
          }
        );


    if (error) {

      console.error(
        "memo folder settings save error:",
        error
      );


      return {
        ok: false,

        message:
          "메모 폴더 설정을 저장하지 못했습니다."
      };

    }


    /*
      저장이 끝난 뒤에야 밀려난 파일을 지운다 — 반대로 하면
      "저장은 실패했는데 예전 사진은 이미 사라진" 상태가 된다.
    */

    if (typeof data === "string" && data) {

      memoFolderReplacedPaths.push(data);

    }


    settings.hasCover =
      keepCover
        ? settings.hasCover
        : Boolean(coverPath);


    releaseMemoFolderCoverObjectUrl(category);


    category.__pendingMemoCoverFile =
      null;

    category.__memoCoverRemoveRequested =
      false;

    category.__memoCoverBust =
      Date.now();

  }


  await removeMemoFolderCoverObjects(
    memoFolderReplacedPaths
  );


  memoFolderReplacedPaths =
    [];


  return {
    ok: true
  };

}


function buildMemoFolderCoverPath(
  userId,
  mimeType
) {

  const extension =
    MEMO_FOLDER_COVER_EXTENSION_BY_MIME[mimeType] ||
    "bin";


  const unique =
    (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    )
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;


  return `${userId}/memo-folder/${unique}.${extension}`;

}


async function removeMemoFolderCoverObjects(
  paths
) {

  const targets =
    (paths || []).filter(Boolean);


  if (!targets.length) {

    return;

  }


  const {
    error
  } =
    await supabaseClient
      .storage
      .from(MEMO_FOLDER_COVER_BUCKET)
      .remove(targets);


  if (error) {

    /*
      정리 실패는 용량 문제일 뿐 접근 경계 문제가 아니다 — 이미
      DB에서 그 경로를 가리키지 않으므로 어떤 화면에도 나오지 않는다.
    */

    console.warn(
      "memo folder cover cleanup error:",
      error
    );

  }

}
