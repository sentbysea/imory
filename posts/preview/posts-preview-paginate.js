/* =========================================================
   POSTS - PREVIEW: BUILD PAGED PREVIEW / UPDATE

   editorPreviewPages 등 상태와 postEditorPreview* DOM 요소는
   posts/editor/posts-refs.js에 있음.

   ★ 실제 페이지 나누기 알고리즘은
   posts/preview/posts-page-layout.js(공용 paginatePostPages)로
   옮겼다 — Quote Preset 미리보기(admin)와 같은 코드를 쓰기
   위해서다. 이 파일에 남은 것은 "에디터 전역 상태를 읽어
   본문 DOM과 출력 조건을 만들어 넘기고, 결과 페이지를 화면에
   붙이는" 연결부다.

   본문 사진은 posts-preview-images.js가 미리 정지 raster로
   굳혀 두고, 공용 레이아웃이 그 크기만 페이지에 맞춘다 —
   이미지 로딩을 기다리는 자리가 분할 계산 안에 없어야 페이지
   나누기가 도중에 어긋나지 않는다.
========================================================== */


/*
  ★ 렌더 세대

  updateEditorPreview()는 폰트와 사진 준비를 기다린다. 그
  기다리는 동안 사용자가 글을 더 치거나 프리셋을 바꾸면 새
  updateEditorPreview()가 시작되는데, 먼저 시작한 쪽이 늦게
  깨어나 최신 화면을 덮어쓰면 안 된다. 자기 세대 번호가 아직
  최신인지 확인하고 나서만 그린다.
*/

let editorPreviewRenderVersion = 0;


/* =========================================================
   BUILD PAGED PREVIEW
========================================================== */

function renderEditorPreviewPages(
  options = {}
) {

  const preserveView =
    options.preserveView ===
    true;


  if (
    !postEditorPreviewPages
  ) {
    return;
  }


  const settings =
    normalizePostStyleSettings(
      postStyleSettings ||
      {}
    );


  applyPostPreviewPresetVariables(
    settings
  );


  /*
    ★ 출력 조건 컨트롤은 그릴 때마다 다시 맞춘다.

    세션에서 아직 고르지 않은 항목은 "프리셋 값을 따르는 중"
    이므로, 편집 도중 프리셋을 바꾸면(applyPostPresetById)
    화면에 눌려 보이는 옵션과 입력값도 함께 따라가야 한다.
    사용자가 고른 값은 null이 아니라서 그대로 남는다.
  */

  syncPreviewRatioControls();


  syncPreviewSourceOffsetControls();


  /*
    먼저 전체 본문을
    QUOTE 스타일대로 가상 렌더링.
  */

  const source =
    document.createElement(
      "div"
    );


  /*
    본문 사진도 글과 **같은 순서로** 그린다. 여기 들어오는 것은
    이미 굳혀 둔 정지 raster(data: URL)뿐이다 —
    preparePostBodyImagesForPreview()가 updateEditorPreview()에서
    먼저 끝났으므로, 이 안에서는 이미지 로딩을 기다릴 일이 없고
    높이도 나중에 바뀌지 않는다(posts-preview-images.js).

    options.html은 그 준비가 대상으로 삼았던 바로 그 본문이다.
    없으면(직접 호출) 지금 본문을 읽는다.
  */

  const sourceHTML =
    typeof options.html === "string"
      ? options.html
      : getRichEditorHTML();


  renderStyledPostContentInto(
    source,
    sourceHTML,
    settings,
    {
      keepPageBreaks:
        true
    }
  );


  preparePostBodyImageNodesForPreview(
    source,
    settings
  );


  editorPreviewPages =
    paginatePostPages(
      {
        host:
          postEditorPreviewPages,

        settings,

        source,

        view:
          resolveEditorPreviewView(
            settings
          )
      }
    );


  /*
    장 수가 줄었으면 없어진 장의 배경 보정은 버린다 — 남겨두면
    다음에 다시 늘어났을 때 엉뚱한 장에 붙는다
    (posts/preview/posts-preview-background.js).
  */

  if (
    typeof prunePreviewBackgroundPageFocus === "function"
  ) {

    prunePreviewBackgroundPageFocus(
      editorPreviewPages.length
    );

  }


  showEditorPreviewPage(
    Math.min(
      editorPreviewPageIndex,
      editorPreviewPages.length - 1
    ),
    {
      resetZoom:
        !preserveView
    }
  );

  applyEditorPreviewScale();

}



/* =========================================================
   UPDATE PREVIEW
========================================================== */

async function updateEditorPreview(
  options = {}
) {

  if (
    !postEditorPreviewPages
  ) {
    return;
  }


  /*
    ★ 폰트(Pretendard/Nanum Myeongjo)가 아직 로딩 중일 때
    페이지 분할을 계산하면 대체 폰트 기준으로 잰 줄바꿈/
    문단 높이를 그대로 써버린다 — 데스크톱은 폰트가 보통
    이미 캐시돼 있어 티가 안 나지만, 모바일(특히 에디터에
    들어가자마자 바로 프리뷰부터 여는 경우)은 아직 폰트
    요청이 끝나기 전이라 실제 완성된 폰트로 다시 그려질 때와
    다른 분량으로 쪼개질 수 있다. 이미 로드됐으면 즉시
    resolve되니 재렌더링 쪽에는 비용이 거의 없다.
  */

  editorPreviewRenderVersion += 1;


  const version =
    editorPreviewRenderVersion;


  if (
    document.fonts?.ready
  ) {

    await document.fonts.ready;

  }


  if (
    version !== editorPreviewRenderVersion
  ) {

    return;

  }


  /*
    ★ 본문 사진도 폰트와 같은 이유로 먼저 준비한다 — 크기를 모르는
    이미지를 페이지에 넣으면 높이가 나중에 바뀌어 이미 나눈 페이지가
    어긋난다. 여기서 굳혀 두면 renderEditorPreviewPages()는 동기
    계산만 한다(posts-preview-images.js).

    준비가 끝난 뒤 세대를 다시 확인한다 — 사진을 읽는 동안 본문이나
    프리셋이 바뀌었으면 그 사이에 시작된 새 렌더가 최신이다.
  */

  const html =
    getRichEditorHTML();


  const prepared =
    await preparePostBodyImagesForPreview(
      html
    );


  /*
    ★ 배경 사진도 폰트·본문 사진과 같은 이유로 먼저 기다린다 —
    원본 크기를 모르면 구도를 계산할 수 없어서, 나중에 로드되는
    순간 배경만 한 번 더 움직여 보인다.
  */

  if (
    typeof whenPostBackgroundReady === "function"
  ) {

    await whenPostBackgroundReady(
      postStyleSettings ||
      {},
      {
        background:
          typeof resolvePreviewBackgroundView === "function"
            ? resolvePreviewBackgroundView()
            : null
      }
    );

  }


  if (
    version !== editorPreviewRenderVersion
  ) {

    return;

  }


  renderEditorPreviewPages(
    {
      ...options,
      html
    }
  );


  /*
    ★ 배경 버튼(move/reset)의 활성 여부는 "지금 배경이 있는가"에
    달려 있다 — 그 판정은 프리셋 + 이번 발췌의 오버라이드를 합친
    값이므로, 프리셋이 늦게 도착하거나 바뀌면 다시 재야 한다.

    예전에는 background 패널을 여는 순간 이 동기화가 함께
    일어났다. 그 패널을 없애면서(요구사항 8) 버튼이 처음 상태
    (배경 없음 → disabled)에 그대로 머물 수 있게 됐으므로,
    프리뷰를 다시 그릴 때마다 함께 맞춘다.
  */

  if (
    typeof syncPreviewBackgroundControls === "function"
  ) {

    syncPreviewBackgroundControls();

  }


  reportPostPreviewImageFailure(
    prepared.failed
  );

}
