/* =========================================================
   ADMIN SETTINGS — SHARE > CARD (글 공유 카드)

   기준 문서: IMORY_SHARE_CARD_DESIGN.md
   레이아웃:  core/lib/share-card.js (서버 /api/og/post 와 같은 파일)
   서버:      functions/api/og/post.js

   화면 순서 (admin/index.html 의 #shareCardInnerPanel 과 같다)

     1) PREVIEW        맨 위. 1200 × 628 실시간 미리보기
     2) 기본 사진      change · edit · remove 한 줄
                       (edit = 사진 위치 조정 모달)
     3) 오버레이       색(네모 컬러 피커) + 강도 한 줄
     4) 폰트           폰트 + 제목 크기(px) 한 줄
     5) 카드 라벨      우상단 글자. 비우면 `카테고리 · 001`

   ★ 저장은 save 를 눌렀을 때만

   미리보기는 입력 즉시 바뀌지만 서버에는 아무 것도 안 보낸다.
   사진만 예외로 **고른 순간 새 경로에 올라간다** — 미리보기에
   보여주려면 주소가 필요하고, 그 주소는 저장 전까지 site_settings
   에 들어가지 않는다(FAVICON/CURSOR와 같은 규칙:
   admin/settings/admin-image-setting.js). 저장이 끝난 뒤에야
   밀려난 예전 파일을 지운다. 사진 **위치**(image_position_x/y)도
   draft 일 뿐이라 save 를 눌러야 서버에 간다.

   ★ 저장하면 version 이 바뀐다

   site_settings.key='share_card' 의 JSON 안에 version(저장 시각)이
   있고, 그 값이 /api/og/post?...&v= 해시에 섞인다. 그래서 카드
   설정을 바꾼 뒤에는 SNS 가 캐시해 둔 옛 카드가 아니라 새 주소를
   받아간다 — 반대로 아무것도 바꾸지 않았다면 주소가 그대로라
   매번 다시 그리지 않는다.

   ★ 미리보기가 실제 카드와 같은 이유

   같은 함수(buildShareCardHtml)가 만든 **같은 HTML 문서**를
   iframe srcdoc 에 넣는다. 서버는 그 문서를 헤드리스 브라우저에
   넘겨 스크린샷을 찍는다. 이 화면에서는 1200 × 628 문서를
   transform: scale() 로만 줄이므로, 좁은 화면에서도 레이아웃이
   다시 계산되지 않는다(비율·글자 배치가 그대로다).

   사진 위치도 마찬가지다 — 위치 조정 모달의 object-position 과
   카드의 background-position 이 **같은 문자열**을 쓴다
   (shareCardBackgroundPosition()).

   classic script. admin-image-setting.js(업로드 경로/공개 URL
   헬퍼)와 core/lib/post-cover-url.js(대표 이미지 주소) 뒤에
   로드된다 — admin/index.html 순서 참고.
========================================================== */

const SHARE_CARD_BUCKET =
  "user-share-cards";


const SHARE_CARD_SETTING_KEY =
  "share_card";


/* =========================================================
   DOM
========================================================== */

const shareCardPhotoInput =
  document.getElementById(
    "shareCardPhotoInput"
  );

const shareCardPhotoEditButton =
  document.getElementById(
    "shareCardPhotoEditButton"
  );

const shareCardPhotoRemoveButton =
  document.getElementById(
    "shareCardPhotoRemoveButton"
  );

const shareCardUploadMessage =
  document.getElementById(
    "shareCardUploadMessage"
  );

const shareCardOverlayColor =
  document.getElementById(
    "shareCardOverlayColor"
  );

const shareCardOverlayStrength =
  document.getElementById(
    "shareCardOverlayStrength"
  );

const shareCardOverlayStrengthValue =
  document.getElementById(
    "shareCardOverlayStrengthValue"
  );

const shareCardFontSelect =
  document.getElementById(
    "shareCardFontSelect"
  );

const shareCardTitleSize =
  document.getElementById(
    "shareCardTitleSize"
  );

const shareCardLabelInput =
  document.getElementById(
    "shareCardLabelInput"
  );

const shareCardSaveButton =
  document.getElementById(
    "shareCardSaveButton"
  );

const shareCardSaveMessage =
  document.getElementById(
    "shareCardSaveMessage"
  );

const shareCardPreviewBox =
  document.getElementById(
    "shareCardPreviewBox"
  );

const shareCardPreviewFrame =
  document.getElementById(
    "shareCardPreviewFrame"
  );

const shareCardPreviewNote =
  document.getElementById(
    "shareCardPreviewNote"
  );

const shareCardPreviewDefaultLabel =
  document.getElementById(
    "shareCardPreviewDefaultLabel"
  );

const shareCardPreviewDefaultToggle =
  document.getElementById(
    "shareCardPreviewDefaultToggle"
  );

const shareCardCropOverlay =
  document.getElementById(
    "shareCardCropOverlay"
  );

const shareCardCropFrame =
  document.getElementById(
    "shareCardCropFrame"
  );

const shareCardCropImage =
  document.getElementById(
    "shareCardCropImage"
  );

const shareCardCropCancelButton =
  document.getElementById(
    "shareCardCropCancelButton"
  );

const shareCardCropSaveButton =
  document.getElementById(
    "shareCardCropSaveButton"
  );


/* =========================================================
   상태

     saved*          site_settings 에 이미 저장돼 있는 값
     draft           화면에서 고른 값(저장 전)
     pendingUrl/Path 방금 올렸지만 아직 저장하지 않은 사진
     removeRequested "remove"를 눌렀다(저장하면 실제로 비운다)
     sample          미리보기에 쓰는 글
     previewDefault  미리보기 배경을 기본 사진으로 고정(저장 안 함)
     crop            사진 위치 조정 모달의 임시 값
========================================================== */

const shareCardState =
  {
    userId: "",

    savedImageUrl: "",
    savedVersion: "0",

    draft: {
      overlayColor: "#000000",
      overlayStrength: 55,
      font: "pretendard",
      titleSize: 46,
      imagePositionX: 50,
      imagePositionY: 50,
      cardLabel: "",
      frame: "none"
    },

    pendingUrl: "",
    pendingPath: "",
    removeRequested: false,

    sample: null,

    /* 저장하지 않는 화면 상태 */
    previewDefault: false,

    crop: {
      open: false,
      x: 50,
      y: 50,
      pointerId: null,
      startX: 0,
      startY: 0,
      startPosX: 50,
      startPosY: 50
    },

    /* core/lib/share-card.js (동적 import) */
    module: null,

    /* 지금 iframe 에 들어 있는 문서의 배경 주소 */
    renderedBackgroundUrl: null
  };


function shareCardModulePromise() {

  if (!shareCardState.module) {

    const version =
      typeof APP_BUILD_VERSION === "string"
        ? `?v=${encodeURIComponent(APP_BUILD_VERSION)}`
        : "";


    shareCardState.module =
      import(
        `../../core/lib/share-card.js${version}`
      );

  }


  return shareCardState.module;

}


function shareCardCurrentImageUrl() {

  if (shareCardState.pendingUrl) {

    return shareCardState.pendingUrl;

  }


  return shareCardState.removeRequested
    ? ""
    : shareCardState.savedImageUrl;

}


function setShareCardUploadMessage(
  text
) {

  if (shareCardUploadMessage) {

    shareCardUploadMessage.textContent =
      text || "";

  }

}


function setShareCardSaveMessage(
  text
) {

  if (shareCardSaveMessage) {

    shareCardSaveMessage.textContent =
      text || "";

  }

}


/* 입력 중인 칸의 값을 덮어써서 커서를 튕기지 않는다 */

function setShareCardFieldValue(
  field,
  value
) {

  if (!field || document.activeElement === field) {

    return;

  }


  if (field.value !== String(value)) {

    field.value =
      String(value);

  }

}


/* =========================================================
   컨트롤 ↔ draft
========================================================== */

function renderShareCardControls() {

  const draft =
    shareCardState.draft;


  setShareCardFieldValue(
    shareCardOverlayColor,
    draft.overlayColor
  );


  if (shareCardOverlayStrength) {

    shareCardOverlayStrength.value =
      String(draft.overlayStrength);


    /* core/components/range.css — 채워진 구간 */

    shareCardOverlayStrength.style.setProperty(
      "--imory-range-fill",
      `${draft.overlayStrength}%`
    );

  }


  if (shareCardOverlayStrengthValue) {

    shareCardOverlayStrengthValue.textContent =
      `${draft.overlayStrength}%`;

  }


  if (shareCardFontSelect) {

    shareCardFontSelect.value =
      draft.font;

  }


  setShareCardFieldValue(
    shareCardTitleSize,
    draft.titleSize
  );

  setShareCardFieldValue(
    shareCardLabelInput,
    draft.cardLabel
  );


  const imageUrl =
    shareCardCurrentImageUrl();


  /* 기본 사진이 없으면 edit · remove 는 쓸 수 없다 */

  [shareCardPhotoEditButton, shareCardPhotoRemoveButton]
    .forEach((button) => {

      if (button) {

        button.disabled =
          !imageUrl;

      }

    });


  /*
    "기본 사진 미리보기" 토글은 **둘 다 있을 때만** 의미가 있다 —
    글 대표 이미지가 미리보기를 차지하고 있고, 그 아래 깔릴 기본
    사진이 따로 있을 때.
  */

  const sample =
    shareCardState.sample;


  const toggleUseful =
    Boolean(imageUrl) &&
    Boolean(sample && sample.hasCover);


  if (shareCardPreviewDefaultLabel) {

    shareCardPreviewDefaultLabel.hidden =
      !toggleUseful;

  }


  if (!toggleUseful) {

    shareCardState.previewDefault =
      false;

  }


  if (shareCardPreviewDefaultToggle) {

    shareCardPreviewDefaultToggle.checked =
      shareCardState.previewDefault;

  }

}


/* =========================================================
   미리보기에 쓸 글 한 편

   제목·카테고리·대표 이미지가 있는 **실제 공개 글**을 먼저
   찾는다(대표 이미지가 있는 글이 있으면 그 글). 공개 글이 하나도
   없으면 안전한 placeholder 를 쓴다 — 비공개/비밀글은 후보에
   넣지 않는다(카드에 들어갈 글자다).

   라벨의 컨테이너 이름과 번호도 여기서 함께 찾는다:

     이름  폴더 안의 글이면 폴더 이름, 아니면 카테고리 이름
     번호  posts.share_label_seq (게시 시점에 굳은 값)

   share_label_seq 는 나중에 생긴 컬럼이라, migration 이 아직
   적용되지 않은 배포에서는 그 컬럼을 고른 select 가 통째로
   실패한다. 그때는 컬럼 없이 한 번 더 묻고 번호는 비운다 —
   설정 화면이 그 하나 때문에 안 뜨면 안 된다.
========================================================== */

const SHARE_CARD_PLACEHOLDER_SAMPLE =
  {
    id: 1,
    title: "여름의 리허설",
    containerName: "기록",
    sequence: 1,
    hasCover: false,
    placeholder: true
  };


async function shareCardSelectPosts(
  user,
  columns
) {

  return supabaseClient
    .from(
      "posts"
    )
    .select(
      columns
    )
    .eq(
      "user_id",
      user.id
    )
    .eq(
      "visibility",
      "public"
    )
    .order(
      "created_at",
      { ascending: false }
    )
    .limit(
      12
    );

}


async function shareCardFolderName(
  folderId
) {

  if (!folderId) {

    return "";

  }


  try {

    const {
      data
    } =
      await supabaseClient
        .from(
          "post_folders"
        )
        .select(
          "name"
        )
        .eq(
          "id",
          folderId
        )
        .maybeSingle();


    return (data && data.name) || "";

  }

  catch (err) {

    return "";

  }

}


async function loadShareCardSample(
  user
) {

  try {

    let {
      data: posts,
      error
    } =
      await shareCardSelectPosts(
        user,
        "id, title, category_id, folder_id, created_at, share_label_seq"
      );


    if (error) {

      /* share_label_seq 가 없는 배포 — 번호만 포기한다 */

      ({
        data: posts,
        error
      } =
        await shareCardSelectPosts(
          user,
          "id, title, category_id, folder_id, created_at"
        ));

    }


    if (error || !posts || !posts.length) {

      return SHARE_CARD_PLACEHOLDER_SAMPLE;

    }


    const ids =
      posts.map((post) => post.id);


    const covered =
      new Set();


    const {
      data: covers
    } =
      await supabaseClient
        .from(
          "post_covers"
        )
        .select(
          "post_id"
        )
        .in(
          "post_id",
          ids
        );


    (covers || []).forEach((row) => {

      covered.add(
        String(row.post_id)
      );

    });


    const chosen =
      posts.find((post) => covered.has(String(post.id))) ||
      posts[0];


    const category =
      (typeof categories !== "undefined" && Array.isArray(categories))
        ? categories.find(
            (item) => String(item.id) === String(chosen.category_id)
          )
        : null;


    const folderName =
      await shareCardFolderName(
        chosen.folder_id
      );


    return {

      id:
        chosen.id,

      title:
        chosen.title || "",

      /* 가장 안쪽 이름 — 폴더가 이긴다 */

      containerName:
        folderName || (category && category.name) || "",

      sequence:
        Number(chosen.share_label_seq) || 0,

      hasCover:
        covered.has(String(chosen.id)),

      placeholder:
        false

    };

  }

  catch (err) {

    console.warn(
      "[share-card] 미리보기 글을 찾지 못했습니다:",
      err
    );


    return SHARE_CARD_PLACEHOLDER_SAMPLE;

  }

}


/*
  미리보기 배경 — 실제 카드와 같은 우선순위다.
  글 대표 이미지(프록시 주소) → 기본 카드 사진 → 없음.

  단 **기본 사진을 편집하는 동안**(모달이 열려 있거나 토글이
  켜져 있을 때)에는 기본 사진을 보여준다. 그러지 않으면 최신 글에
  대표 이미지가 있을 때 위치 변경이 화면에 전혀 보이지 않는다.
*/

function shareCardPreviewBackgroundUrl() {

  const sample =
    shareCardState.sample;


  const forceDefault =
    shareCardState.previewDefault ||
    shareCardState.crop.open;


  if (
    !forceDefault &&
    sample &&
    sample.hasCover &&
    typeof buildPostCoverUrl === "function"
  ) {

    return buildPostCoverUrl(
      sample.id
    ) || "";

  }


  return shareCardCurrentImageUrl();

}


/* =========================================================
   미리보기 그리기

   문서를 새로 만드는 경우는 처음과 **배경 주소가 바뀐 때**뿐이다.
   색·강도·폰트·제목 크기·글자·사진 위치는 postMessage 로 즉시
   바꾼다(깜빡임 없음, 배경 사진 재요청 없음).
========================================================== */

function shareCardDraftSettings() {

  return {

    ...shareCardState.draft,

    imageUrl:
      shareCardCurrentImageUrl(),

    /* 위치 조정 중에는 끄는 그대로를 보여준다 */

    imagePositionX:
      shareCardState.crop.open
        ? shareCardState.crop.x
        : shareCardState.draft.imagePositionX,

    imagePositionY:
      shareCardState.crop.open
        ? shareCardState.crop.y
        : shareCardState.draft.imagePositionY

  };

}


function shareCardPreviewFields(
  moduleRef
) {

  const sample =
    shareCardState.sample ||
    SHARE_CARD_PLACEHOLDER_SAMPLE;


  return {

    card:
      shareCardDraftSettings(),

    backgroundUrl:
      shareCardPreviewBackgroundUrl(),

    title:
      sample.title,

    label:
      moduleRef.resolveShareCardLabel(
        shareCardState.draft.cardLabel,
        sample.containerName,
        sample.sequence
      ),

    domain:
      location.hostname || "imory.me"

  };

}


async function renderShareCardPreview(
  options
) {

  if (!shareCardPreviewFrame) {

    return;

  }


  const moduleRef =
    await shareCardModulePromise();


  const fields =
    shareCardPreviewFields(moduleRef);


  const rebuild =
    (options && options.rebuild) ||
    shareCardState.renderedBackgroundUrl !== fields.backgroundUrl;


  if (rebuild) {

    shareCardState.renderedBackgroundUrl =
      fields.backgroundUrl;


    shareCardPreviewFrame.srcdoc =
      moduleRef.buildShareCardHtml(fields);


    refreshShareCardPreviewScale();


    return;

  }


  const target =
    shareCardPreviewFrame.contentWindow;


  if (!target) {

    return;

  }


  target.postMessage(
    {

      type:
        "imory-share-card",

      card:
        fields.card,

      /*
        색 → 글자색 판정은 share-card.js 한 곳에만 있다.
        결과를 그대로 실어 보낸다(카드 문서가 다시 계산하지
        않는다).
      */

      palette:
        moduleRef.shareCardOverlayPalette(
          fields.card.overlayColor
        ),

      backgroundPosition:
        moduleRef.shareCardBackgroundPosition(
          fields.card,
          fields.backgroundUrl
        ),

      text: {

        title:
          moduleRef.collapseShareCardText(fields.title) || "제목 없는 글",

        label:
          fields.label,

        domain:
          fields.domain

      }

    },
    "*"
  );

}


/* =========================================================
   축소 — 비율은 항상 1200 : 628

   숨어 있을 때는 폭이 0이라 잴 수 없다. SHARE > CARD 탭을 열 때
   admin-settings-load.js 가 이 함수를 다시 부른다.
========================================================== */

function refreshShareCardPreviewScale() {

  if (!shareCardPreviewBox || !shareCardPreviewFrame) {

    return;

  }


  const width =
    shareCardPreviewBox.clientWidth;


  if (!width) {

    return;

  }


  shareCardPreviewFrame.style.transform =
    `scale(${width / 1200})`;

}


if (typeof ResizeObserver === "function" && shareCardPreviewBox) {

  new ResizeObserver(
    () => {

      refreshShareCardPreviewScale();

    }
  )
    .observe(shareCardPreviewBox);

}


/* =========================================================
   불러오기 — admin-settings-save.js 의 loadAdminSettings()가 부른다
========================================================== */

/*
  이 화면은 ES 모듈을 동적 import 한다 — 그 로드가 실패해도 다른
  설정(닉네임·카테고리·배너…)은 그대로 떠야 하므로, 여기서 끝까지
  막는다. loadAdminSettings()의 마지막 호출이다.
*/

async function loadShareCardSettings(
  user
) {

  try {

    await loadShareCardPanel(
      user
    );

  }

  catch (err) {

    console.warn(
      "[share-card] 설정을 불러오지 못했습니다:",
      err
    );


    setShareCardSaveMessage(
      "공유 카드 설정을 불러오지 못했습니다."
    );

  }

}


async function loadShareCardPanel(
  user
) {

  shareCardState.userId =
    user.id;

  shareCardState.pendingUrl =
    "";

  shareCardState.pendingPath =
    "";

  shareCardState.removeRequested =
    false;

  shareCardState.previewDefault =
    false;

  shareCardState.crop.open =
    false;


  if (shareCardCropOverlay) {

    shareCardCropOverlay.hidden =
      true;

  }


  setShareCardUploadMessage(
    ""
  );

  setShareCardSaveMessage(
    ""
  );


  const moduleRef =
    await shareCardModulePromise();


  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "site_settings"
      )
      .select(
        "value"
      )
      .eq(
        "key",
        SHARE_CARD_SETTING_KEY
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();


  if (error) {

    console.error(
      "load share_card error:",
      error
    );


    setShareCardSaveMessage(
      "공유 카드 설정을 불러오지 못했습니다."
    );

  }


  const card =
    moduleRef.normalizeShareCardSettings(
      (data && data.value) || null
    );


  shareCardState.savedImageUrl =
    card.imageUrl;

  shareCardState.savedVersion =
    card.version;

  shareCardState.draft =
    {
      overlayColor: card.overlayColor,
      overlayStrength: card.overlayStrength,
      font: card.font,
      titleSize: card.titleSize,
      imagePositionX: card.imagePositionX,
      imagePositionY: card.imagePositionY,
      cardLabel: card.cardLabel,
      frame: card.frame
    };


  /* 제목 크기 칸의 범위를 계약과 맞춘다 */

  if (shareCardTitleSize) {

    shareCardTitleSize.min =
      String(moduleRef.SHARE_CARD_TITLE_SIZE_MIN);

    shareCardTitleSize.max =
      String(moduleRef.SHARE_CARD_TITLE_SIZE_MAX);

  }


  if (shareCardLabelInput) {

    shareCardLabelInput.maxLength =
      moduleRef.SHARE_CARD_LABEL_MAX_LENGTH;

  }


  shareCardState.sample =
    await loadShareCardSample(user);


  if (shareCardPreviewNote) {

    shareCardPreviewNote.textContent =
      shareCardState.sample.placeholder
        ? "공개된 글이 없어 예시 제목으로 보여줍니다."
        : "가장 최근 공개 글로 보여줍니다.";

  }


  renderShareCardControls();


  /*
    대표 이미지 쿠키가 서기 전에 <img>를 만들면 소유자의 사진 한
    장이 404로 끝난다(core/lib/post-cover-url.js).
  */

  try {

    if (typeof imoryPostCoverCookieReady !== "undefined") {

      await imoryPostCoverCookieReady;

    }

  }

  catch (err) {

    /* 쿠키를 못 세워도 공개 글의 사진은 그대로 보인다 */

  }


  await renderShareCardPreview({
    rebuild: true
  });

}


/* =========================================================
   컨트롤 — 즉시 미리보기, 저장은 save 에서
========================================================== */

function onShareCardDraftChanged() {

  setShareCardSaveMessage(
    ""
  );


  renderShareCardControls();

  renderShareCardPreview();

}


shareCardOverlayColor
  ?.addEventListener(
    "input",
    async () => {

      /*
        ★ 칸의 값은 await **앞에서** 읽는다.

        await 사이에 다른 컨트롤의 핸들러가 끼어들면 그쪽이
        renderShareCardControls()를 돌리고, 그 안에서 이 칸의
        value 가 아직 옛 draft 값으로 되돌려진다. await 뒤에
        읽으면 방금 고른 색이 사라진다.
      */

      const picked =
        shareCardOverlayColor.value;


      const moduleRef =
        await shareCardModulePromise();


      shareCardState.draft.overlayColor =
        moduleRef.normalizeShareCardColor(
          picked
        ) || shareCardState.draft.overlayColor;


      onShareCardDraftChanged();

    }
  );


shareCardOverlayStrength
  ?.addEventListener(
    "input",
    () => {

      const value =
        Number(shareCardOverlayStrength.value);


      shareCardState.draft.overlayStrength =
        Number.isFinite(value)
          ? Math.min(100, Math.max(0, Math.round(value)))
          : 0;


      onShareCardDraftChanged();

    }
  );


shareCardFontSelect
  ?.addEventListener(
    "change",
    () => {

      shareCardState.draft.font =
        shareCardFontSelect.value === "nanum-myeongjo"
          ? "nanum-myeongjo"
          : "pretendard";


      onShareCardDraftChanged();

    }
  );


/*
  제목 크기 — 카드가 깨지지 않는 범위(share-card.js 의 상수)로
  자른다. 입력 중에는 사람이 지우고 다시 칠 수 있어야 하므로,
  비어 있거나 숫자가 아니면 그 순간에는 손대지 않는다.
*/

async function applyShareCardTitleSize(
  options
) {

  /* 값은 await 앞에서 읽는다(위 오버레이 색 주석과 같은 이유) */

  const raw =
    Number(shareCardTitleSize.value);


  const moduleRef =
    await shareCardModulePromise();


  if (!Number.isFinite(raw)) {

    if (options && options.commit) {

      setShareCardFieldValue(
        shareCardTitleSize,
        shareCardState.draft.titleSize
      );

    }


    return;

  }


  shareCardState.draft.titleSize =
    Math.min(
      moduleRef.SHARE_CARD_TITLE_SIZE_MAX,
      Math.max(
        moduleRef.SHARE_CARD_TITLE_SIZE_MIN,
        Math.round(raw)
      )
    );


  onShareCardDraftChanged();


  /* 범위를 벗어난 숫자는 칸을 떠날 때 실제 값으로 되돌린다 */

  if (options && options.commit) {

    shareCardTitleSize.value =
      String(shareCardState.draft.titleSize);

  }

}


shareCardTitleSize
  ?.addEventListener(
    "input",
    () => {

      applyShareCardTitleSize();

    }
  );


shareCardTitleSize
  ?.addEventListener(
    "change",
    () => {

      applyShareCardTitleSize({ commit: true });

    }
  );


shareCardTitleSize
  ?.addEventListener(
    "blur",
    () => {

      applyShareCardTitleSize({ commit: true });

    }
  );


shareCardLabelInput
  ?.addEventListener(
    "input",
    async () => {

      /* 값은 await 앞에서 읽는다(위 오버레이 색 주석과 같은 이유) */

      const typed =
        String(shareCardLabelInput.value || "");


      const moduleRef =
        await shareCardModulePromise();


      shareCardState.draft.cardLabel =
        typed.slice(0, moduleRef.SHARE_CARD_LABEL_MAX_LENGTH);


      onShareCardDraftChanged();

    }
  );


shareCardPreviewDefaultToggle
  ?.addEventListener(
    "change",
    () => {

      shareCardState.previewDefault =
        Boolean(shareCardPreviewDefaultToggle.checked);


      renderShareCardControls();

      renderShareCardPreview();

    }
  );


/* =========================================================
   C. 사진 위치 조정 모달

   원본 파일은 건드리지 않는다. 카드와 같은 1200 × 628 프레임
   안에서 사진을 끌어 구도를 정하고, 결과를 0~100% 두 값으로
   저장한다.

   ★ 왜 object-fit: cover + object-position 인가

   카드의 배경도 같은 규칙(background-size: cover +
   background-position)이다. 그래서 여기서 보이는 자리가 카드에서
   보이는 자리다 — 자르기 좌표를 따로 계산하지 않는다.

   드래그 → 퍼센트 환산

     사진은 프레임보다 한 축이 크다(cover). 그 **넘치는 만큼**이
     0%~100% 가 움직일 수 있는 전부다. 그래서 포인터가 dx 만큼
     움직이면 위치는 dx / 넘치는 폭 × 100 만큼 반대로 간다 —
     끄는 대로 사진이 따라온다.

   pointer 이벤트 하나로 마우스와 터치를 함께 받는다(프레임에는
   touch-action: none 이 걸려 있어 화면 스크롤로 가로채이지
   않는다).
========================================================== */

function shareCardCropOverflow() {

  if (!shareCardCropFrame || !shareCardCropImage) {

    return { x: 0, y: 0 };

  }


  const rect =
    shareCardCropFrame.getBoundingClientRect();


  const naturalWidth =
    shareCardCropImage.naturalWidth || 0;

  const naturalHeight =
    shareCardCropImage.naturalHeight || 0;


  if (!rect.width || !naturalWidth || !naturalHeight) {

    return { x: 0, y: 0 };

  }


  const scale =
    Math.max(
      rect.width / naturalWidth,
      rect.height / naturalHeight
    );


  return {

    x:
      Math.max(0, naturalWidth * scale - rect.width),

    y:
      Math.max(0, naturalHeight * scale - rect.height)

  };

}


function renderShareCardCrop() {

  if (shareCardCropImage) {

    shareCardCropImage.style.objectPosition =
      `${shareCardState.crop.x}% ${shareCardState.crop.y}%`;

  }

}


function openShareCardCrop() {

  const imageUrl =
    shareCardCurrentImageUrl();


  if (!imageUrl || !shareCardCropOverlay) {

    return;

  }


  shareCardState.crop.open =
    true;

  shareCardState.crop.x =
    shareCardState.draft.imagePositionX;

  shareCardState.crop.y =
    shareCardState.draft.imagePositionY;


  if (shareCardCropImage && shareCardCropImage.src !== imageUrl) {

    shareCardCropImage.src =
      imageUrl;

  }


  renderShareCardCrop();


  shareCardCropOverlay.hidden =
    false;


  /* 편집하는 사진이 미리보기에도 깔리게 한다 */

  renderShareCardPreview();


  if (shareCardCropSaveButton) {

    shareCardCropSaveButton.focus();

  }

}


function closeShareCardCrop() {

  shareCardState.crop.open =
    false;

  shareCardState.crop.pointerId =
    null;


  if (shareCardCropOverlay) {

    shareCardCropOverlay.hidden =
      true;

  }


  if (shareCardCropFrame) {

    shareCardCropFrame.classList.remove(
      "dragging"
    );

  }


  renderShareCardPreview();

}


shareCardPhotoEditButton
  ?.addEventListener(
    "click",
    () => {

      openShareCardCrop();

    }
  );


shareCardCropCancelButton
  ?.addEventListener(
    "click",
    () => {

      closeShareCardCrop();

    }
  );


/* 바깥(어두운 판)을 눌러도 취소다 */

shareCardCropOverlay
  ?.addEventListener(
    "click",
    (event) => {

      if (event.target === shareCardCropOverlay) {

        closeShareCardCrop();

      }

    }
  );


document.addEventListener(
  "keydown",
  (event) => {

    if (event.key === "Escape" && shareCardState.crop.open) {

      closeShareCardCrop();

    }

  }
);


shareCardCropSaveButton
  ?.addEventListener(
    "click",
    () => {

      shareCardState.draft.imagePositionX =
        shareCardState.crop.x;

      shareCardState.draft.imagePositionY =
        shareCardState.crop.y;


      /*
        위치를 바꾼 결과가 미리보기에 보여야 한다. 최신 글에
        대표 이미지가 있으면 그 사진이 배경을 차지하므로, 그때는
        "기본 사진 미리보기"를 켠 채로 닫는다(저장되지 않는다).
      */

      if (
        shareCardState.sample &&
        shareCardState.sample.hasCover
      ) {

        shareCardState.previewDefault =
          true;

      }


      closeShareCardCrop();


      renderShareCardControls();


      setShareCardUploadMessage(
        "사진 위치를 바꿨습니다 — save를 눌러 저장하세요 ♡"
      );


      setShareCardSaveMessage(
        ""
      );

    }
  );


shareCardCropFrame
  ?.addEventListener(
    "pointerdown",
    (event) => {

      if (!shareCardState.crop.open) {

        return;

      }


      event.preventDefault();


      shareCardState.crop.pointerId =
        event.pointerId;

      shareCardState.crop.startX =
        event.clientX;

      shareCardState.crop.startY =
        event.clientY;

      shareCardState.crop.startPosX =
        shareCardState.crop.x;

      shareCardState.crop.startPosY =
        shareCardState.crop.y;


      shareCardCropFrame.classList.add(
        "dragging"
      );


      try {

        shareCardCropFrame.setPointerCapture(
          event.pointerId
        );

      }

      catch (err) {

        /* 캡처를 못 해도 move/up 은 그대로 온다 */

      }

    }
  );


shareCardCropFrame
  ?.addEventListener(
    "pointermove",
    (event) => {

      if (
        !shareCardState.crop.open ||
        shareCardState.crop.pointerId !== event.pointerId
      ) {

        return;

      }


      event.preventDefault();


      const overflow =
        shareCardCropOverflow();


      const dx =
        event.clientX - shareCardState.crop.startX;

      const dy =
        event.clientY - shareCardState.crop.startY;


      if (overflow.x > 0) {

        shareCardState.crop.x =
          Math.min(
            100,
            Math.max(
              0,
              Math.round(
                shareCardState.crop.startPosX - (dx / overflow.x) * 100
              )
            )
          );

      }


      if (overflow.y > 0) {

        shareCardState.crop.y =
          Math.min(
            100,
            Math.max(
              0,
              Math.round(
                shareCardState.crop.startPosY - (dy / overflow.y) * 100
              )
            )
          );

      }


      renderShareCardCrop();

      renderShareCardPreview();

    }
  );


["pointerup", "pointercancel"].forEach((type) => {

  shareCardCropFrame
    ?.addEventListener(
      type,
      (event) => {

        if (shareCardState.crop.pointerId !== event.pointerId) {

          return;

        }


        shareCardState.crop.pointerId =
          null;


        shareCardCropFrame.classList.remove(
          "dragging"
        );


        try {

          shareCardCropFrame.releasePointerCapture(
            event.pointerId
          );

        }

        catch (err) {

          /* 이미 놓였다 */

        }

      }
    );

});


/* =========================================================
   사진 — 고르는 순간 **새 경로**에 올린다

   FAVICON/CURSOR와 같은 규칙이다(admin-image-setting.js 주석):
   경로가 매번 새로 생기므로 브라우저·CDN이 예전 사진을 계속
   보여주는 일이 없고, 저장이 실패해도 되돌릴 수 있다.
========================================================== */

async function shareCardRemoveObject(
  path
) {

  if (!path) {

    return;

  }


  try {

    await supabaseClient
      .storage
      .from(
        SHARE_CARD_BUCKET
      )
      .remove([
        path
      ]);

  }

  catch (err) {

    console.warn(
      "[share-card] 이전 파일 삭제 실패(고아 파일):",
      err
    );

  }

}


async function shareCardCurrentUser() {

  const {
    data,
    error
  } =
    await supabaseClient
      .auth
      .getUser();


  if (error || !data.user) {

    return null;

  }


  return data.user;

}


shareCardPhotoInput
  ?.addEventListener(
    "change",
    async (event) => {

      const file =
        event.target.files?.[0];


      if (!file) {

        return;

      }


      /* 같은 파일을 다시 골라도 change가 뜨게 즉시 비운다 */

      event.target.value =
        "";


      const user =
        await shareCardCurrentUser();


      if (!user) {

        setShareCardUploadMessage(
          "로그인이 필요합니다."
        );


        return;

      }


      setShareCardUploadMessage(
        "업로드 중..."
      );


      /*
        올리기 전에 메타데이터를 지우고 용량을 줄인다
        (core/lib/image-upload.js — 모든 업로드 경로 공용).
      */

      const prepared =
        await prepareImoryUploadImage(
          file,
          {
            stripMetadata:
              typeof imoryEtcStripImageExifEnabled === "function" &&
                imoryEtcStripImageExifEnabled()
          }
        );


      if (prepared.error) {

        setShareCardUploadMessage(
          "사진에서 촬영 정보(EXIF)를 지우지 못해 올리지 않았습니다."
        );


        return;

      }


      const upload =
        prepared.file;


      const path =
        buildImageSettingObjectPath(
          user.id
        );


      const {
        error
      } =
        await supabaseClient
          .storage
          .from(
            SHARE_CARD_BUCKET
          )
          .upload(
            path,
            upload,
            {
              upsert:
                false,

              contentType:
                upload.type,

              cacheControl:
                "31536000"
            }
          );


      if (error) {

        console.error(
          "share_card upload error:",
          error
        );


        setShareCardUploadMessage(
          "업로드하지 못했습니다."
        );


        return;

      }


      /*
        이번 편집에서 앞서 올렸던 파일은 이제 아무도 안 쓴다 —
        저장 전이라 지워도 안전하다.
      */

      const discarded =
        shareCardState.pendingPath;


      shareCardState.pendingPath =
        path;

      shareCardState.pendingUrl =
        buildImageSettingPublicUrl(
          SHARE_CARD_BUCKET,
          path
        );

      shareCardState.removeRequested =
        false;


      /* 새 사진에 예전 구도를 물려주지 않는다 */

      shareCardState.draft.imagePositionX =
        50;

      shareCardState.draft.imagePositionY =
        50;


      if (discarded) {

        await shareCardRemoveObject(
          discarded
        );

      }


      renderShareCardControls();

      await renderShareCardPreview();


      setShareCardUploadMessage(
        "업로드 완료 — save를 눌러 저장하세요 ♡"
      );

    }
  );


shareCardPhotoRemoveButton
  ?.addEventListener(
    "click",
    async () => {

      shareCardState.draft.imagePositionX =
        50;

      shareCardState.draft.imagePositionY =
        50;


      if (shareCardState.pendingPath) {

        /* 방금 올린 것만 취소한다 — 저장된 값은 그대로 */

        const path =
          shareCardState.pendingPath;


        shareCardState.pendingPath =
          "";

        shareCardState.pendingUrl =
          "";


        await shareCardRemoveObject(
          path
        );


        setShareCardUploadMessage(
          ""
        );


        renderShareCardControls();

        await renderShareCardPreview();


        return;

      }


      shareCardState.removeRequested =
        Boolean(shareCardState.savedImageUrl);


      setShareCardUploadMessage(
        shareCardState.removeRequested
          ? "저장하면 제거됩니다."
          : ""
      );


      renderShareCardControls();

      await renderShareCardPreview();

    }
  );


/* =========================================================
   저장
========================================================== */

shareCardSaveButton
  ?.addEventListener(
    "click",
    async () => {

      const user =
        await shareCardCurrentUser();


      if (!user) {

        setShareCardSaveMessage(
          "로그인이 필요합니다."
        );


        return;

      }


      const moduleRef =
        await shareCardModulePromise();


      const nextImageUrl =
        shareCardCurrentImageUrl();


      /*
        version 은 "실제로 저장한 순간"이다. 이 값이 OG 이미지
        주소의 ?v= 에 섞여, 설정을 바꿨을 때만 SNS 가 카드를 다시
        받아가게 한다.
      */

      const version =
        String(Date.now());


      const value =
        moduleRef.serializeShareCardSettings(
          {
            ...shareCardState.draft,

            imageUrl:
              nextImageUrl,

            version:
              shareCardState.savedVersion
          },
          version
        );


      shareCardSaveButton.disabled =
        true;


      setShareCardSaveMessage(
        "저장 중..."
      );


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
                SHARE_CARD_SETTING_KEY,

              value

            },
            {
              onConflict:
                "user_id,key"
            }
          );


      shareCardSaveButton.disabled =
        false;


      if (error) {

        console.error(
          "share_card save error:",
          error
        );


        setShareCardSaveMessage(
          "저장에 실패했습니다."
        );


        /*
          방금 올린 파일은 그대로 둔다 — 다시 save를 누르면 그
          파일이 그대로 쓰인다(여기서 지우면 재시도가 불가능해진다).
        */

        return;

      }


      /* 저장이 끝난 **뒤에야** 밀려난 예전 파일을 지운다 */

      const previousPath =
        imageSettingObjectPathFromUrl(
          SHARE_CARD_BUCKET,
          shareCardState.savedImageUrl
        );

      const nextPath =
        imageSettingObjectPathFromUrl(
          SHARE_CARD_BUCKET,
          nextImageUrl
        );


      shareCardState.savedImageUrl =
        nextImageUrl;

      shareCardState.savedVersion =
        version;

      shareCardState.pendingUrl =
        "";

      shareCardState.pendingPath =
        "";

      shareCardState.removeRequested =
        false;


      if (previousPath && previousPath !== nextPath) {

        await shareCardRemoveObject(
          previousPath
        );

      }


      setShareCardUploadMessage(
        ""
      );


      setShareCardSaveMessage(
        "saved ♡"
      );


      renderShareCardControls();

      await renderShareCardPreview();

    }
  );
