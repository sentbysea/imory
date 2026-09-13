/* =========================================================
   ADMIN SETTINGS — SHARE > CARD (글 공유 카드)

   기준 문서: IMORY_SHARE_CARD_DESIGN.md
   레이아웃:  core/lib/share-card.js (서버 /api/og/post 와 같은 파일)
   서버:      functions/api/og/post.js

   화면이 하는 일

     · 기본 카드 사진 올리기/바꾸기/지우기
       (글 대표 이미지가 없을 때만 쓰는 fallback)
     · 오버레이 색(BLACK/WHITE) · 강도(0~100%) · 폰트
     · 1200 × 628 실시간 미리보기

   ★ 저장은 save 를 눌렀을 때만

   미리보기는 입력 즉시 바뀌지만 서버에는 아무 것도 안 보낸다.
   사진만 예외로 **고른 순간 새 경로에 올라간다** — 미리보기에
   보여주려면 주소가 필요하고, 그 주소는 저장 전까지 site_settings
   에 들어가지 않는다(FAVICON/CURSOR와 같은 규칙:
   admin/settings/admin-image-setting.js). 저장이 끝난 뒤에야
   밀려난 예전 파일을 지운다.

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

const shareCardPhotoPreview =
  document.getElementById(
    "shareCardPhotoPreview"
  );

const shareCardPhotoEmpty =
  document.getElementById(
    "shareCardPhotoEmpty"
  );

const shareCardPhotoInput =
  document.getElementById(
    "shareCardPhotoInput"
  );

const shareCardPhotoRemoveButton =
  document.getElementById(
    "shareCardPhotoRemoveButton"
  );

const shareCardUploadMessage =
  document.getElementById(
    "shareCardUploadMessage"
  );

const shareCardOverlayBlackButton =
  document.getElementById(
    "shareCardOverlayBlackButton"
  );

const shareCardOverlayWhiteButton =
  document.getElementById(
    "shareCardOverlayWhiteButton"
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


/* =========================================================
   상태

     saved*          site_settings 에 이미 저장돼 있는 값
     draft*          화면에서 고른 값(저장 전)
     pendingUrl/Path 방금 올렸지만 아직 저장하지 않은 사진
     removeRequested "remove"를 눌렀다(저장하면 실제로 비운다)
     sample          미리보기에 쓰는 글
========================================================== */

const shareCardState =
  {
    userId: "",

    savedImageUrl: "",
    savedVersion: "0",

    draft: {
      overlay: "black",
      overlayStrength: 55,
      font: "pretendard"
    },

    pendingUrl: "",
    pendingPath: "",
    removeRequested: false,

    sample: null,

    /* 카드의 @slug (profiles.slug) */
    slug: "",

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


/* =========================================================
   컨트롤 ↔ draft
========================================================== */

function renderShareCardControls() {

  const overlay =
    shareCardState.draft.overlay;


  [shareCardOverlayBlackButton, shareCardOverlayWhiteButton]
    .forEach((button) => {

      if (!button) {

        return;

      }


      const pressed =
        button.dataset.overlay === overlay;


      button.setAttribute(
        "aria-pressed",
        pressed ? "true" : "false"
      );


      button.classList.toggle(
        "active",
        pressed
      );

    });


  if (shareCardOverlayStrength) {

    shareCardOverlayStrength.value =
      String(shareCardState.draft.overlayStrength);


    /* core/components/range.css — 채워진 구간 */

    shareCardOverlayStrength.style.setProperty(
      "--imory-range-fill",
      `${shareCardState.draft.overlayStrength}%`
    );

  }


  if (shareCardOverlayStrengthValue) {

    shareCardOverlayStrengthValue.textContent =
      `${shareCardState.draft.overlayStrength}%`;

  }


  if (shareCardFontSelect) {

    shareCardFontSelect.value =
      shareCardState.draft.font;

  }


  const imageUrl =
    shareCardCurrentImageUrl();


  if (shareCardPhotoRemoveButton) {

    shareCardPhotoRemoveButton.hidden =
      !imageUrl;

  }


  if (shareCardPhotoPreview && shareCardPhotoEmpty) {

    if (!imageUrl) {

      shareCardPhotoPreview.hidden =
        true;

      shareCardPhotoPreview.removeAttribute(
        "src"
      );

      shareCardPhotoEmpty.hidden =
        false;

    }

    else {

      shareCardPhotoPreview.onload =
        () => {

          shareCardPhotoPreview.hidden =
            false;

          shareCardPhotoEmpty.hidden =
            true;

        };


      shareCardPhotoPreview.onerror =
        () => {

          shareCardPhotoPreview.hidden =
            true;

          shareCardPhotoEmpty.hidden =
            false;

        };


      shareCardPhotoPreview.src =
        imageUrl;

    }

  }

}


/* =========================================================
   미리보기에 쓸 글 한 편

   제목·카테고리·대표 이미지가 있는 **실제 공개 글**을 먼저
   찾는다(대표 이미지가 있는 글이 있으면 그 글). 공개 글이 하나도
   없으면 안전한 placeholder 를 쓴다 — 비공개/비밀글은 후보에
   넣지 않는다(카드에 들어갈 글자다).
========================================================== */

const SHARE_CARD_PLACEHOLDER_SAMPLE =
  {
    id: 1,
    title: "여름의 리허설",
    categoryName: "기록",
    hasCover: false,
    placeholder: true
  };


async function loadShareCardSample(
  user
) {

  try {

    const {
      data: posts,
      error
    } =
      await supabaseClient
        .from(
          "posts"
        )
        .select(
          "id, title, category_id, created_at"
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


    if (error || !posts || !posts.length) {

      return SHARE_CARD_PLACEHOLDER_SAMPLE;

    }


    const ids =
      posts.map((post) => post.id);


    let covered =
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


    return {

      id:
        chosen.id,

      title:
        chosen.title || "",

      categoryName:
        (category && category.name) || "",

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
*/

function shareCardPreviewBackgroundUrl() {

  const sample =
    shareCardState.sample;


  if (
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
   색·강도·폰트·글자는 postMessage 로 즉시 바꾼다(깜빡임 없음,
   배경 사진 재요청 없음).
========================================================== */

function shareCardPreviewFields(
  moduleRef
) {

  const sample =
    shareCardState.sample ||
    SHARE_CARD_PLACEHOLDER_SAMPLE;


  const categoryName =
    sample.categoryName || "";

  const slug =
    shareCardState.slug || "";


  return {

    card:
      { ...shareCardState.draft },

    backgroundUrl:
      shareCardPreviewBackgroundUrl(),

    title:
      sample.title,

    categoryName,

    slug,

    postLabel:
      moduleRef.shareCardPostLabel(sample.id),

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

      text: {

        title:
          moduleRef.collapseShareCardText(fields.title) || "제목 없는 글",

        categoryName:
          fields.categoryName,

        meta:
          [
            fields.slug ? `@${fields.slug}` : "",
            fields.categoryName
          ]
            .filter(Boolean)
            .join(" · "),

        postLabel:
          fields.postLabel,

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
      overlay: card.overlay,
      overlayStrength: card.overlayStrength,
      font: card.font
    };


  /* 카드에 들어가는 @slug */

  try {

    const {
      data: profile
    } =
      await supabaseClient
        .from(
          "profiles"
        )
        .select(
          "slug"
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();


    shareCardState.slug =
      (profile && profile.slug) || "";

  }

  catch (err) {

    shareCardState.slug =
      "";

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

[shareCardOverlayBlackButton, shareCardOverlayWhiteButton]
  .forEach((button) => {

    button
      ?.addEventListener(
        "click",
        () => {

          shareCardState.draft.overlay =
            button.dataset.overlay === "white"
              ? "white"
              : "black";


          setShareCardSaveMessage(
            ""
          );


          renderShareCardControls();

          renderShareCardPreview();

        }
      );

  });


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


      setShareCardSaveMessage(
        ""
      );


      renderShareCardControls();

      renderShareCardPreview();

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


      setShareCardSaveMessage(
        ""
      );


      renderShareCardControls();

      renderShareCardPreview();

    }
  );


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
            overlay: shareCardState.draft.overlay,
            overlayStrength: shareCardState.draft.overlayStrength,
            font: shareCardState.draft.font,
            imageUrl: nextImageUrl,
            version: shareCardState.savedVersion
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
