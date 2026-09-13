/* =========================================================
   ADMIN SETTINGS — ADVANCED SETTINGS (HIGHLIGHT-2 §7 / §8)

   기준 문서: IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md

   무엇을 바꾸는가
   --------------
   예전에는 카테고리 줄마다 표시 설정(페이지당 개수 · 비밀글 커버 ·
   하이라이트 폴더 커버…)이 길게 붙어 있었다. 카테고리가 네댓 개만
   돼도 화면이 설정 줄로 가득 차서, "이름을 고치러 왔는데 무엇을 보고
   있는지" 알기 어려웠다.

   이제 CATEGORIES 는 기본 관리(이름 · 타입 · 순서 · 삭제 · 추가)만
   맡고, 고급 설정은 이 영역 하나로 모은다. 위쪽 드롭다운으로 카테고리
   **하나**를 고르면 그 타입에 필요한 설정만 아래에 나온다.

   ★ 저장 버튼은 CATEGORIES 와 공유한다
   두 영역이 같은 `categories` 배열의 **같은 객체**를 고친다. 저장을
   나누면 "이름은 저장됐는데 페이지 설정은 아직"이라는 반쪽 상태가
   생기고, 사용자는 그 차이를 화면에서 알 수 없다.

   ★ 그래서 draft 가 사라지지 않는다 (요구사항 13)
   고른 카테고리를 바꿔도 값은 categories 배열에 그대로 남아 있다 —
   이 파일은 그 객체를 읽어 컨트롤을 다시 그릴 뿐이고, 아무것도
   초기화하지 않는다. 다시 그 카테고리를 고르면 고쳐 둔 값이 그대로
   보인다.

   ★ 아직 저장되지 않은 카테고리
   DB id 가 없으면 고급 설정을 잠근다. 하이라이트 폴더 설정과 커버
   업로드가 category id 를 키로 쓰기 때문이다(그 행이 아직 없다).
   이유를 화면에 적는다 — 잠긴 채 이유가 없으면 고장으로 보인다.

   의존(classic script, 이 파일보다 먼저 로드돼야 함):
     core/lib/category-types.js      타입/페이지네이션 공용 상수
     admin/settings/admin-settings-load.js        categories 배열
     admin/settings/admin-settings-category-display.js
                                     buildCategoryDisplayRow
     admin/settings/admin-settings-highlight-folders.js
                                     buildHighlightFolderRow
     admin/settings/admin-settings-highlight-folder-order.js
                                     renderHighlightFolderOrderList
========================================================== */


const advancedSettingsPanel =
  document.getElementById(
    "advancedSettingsPanel"
  );

const advancedCategorySelect =
  document.getElementById(
    "advancedCategorySelect"
  );

const advancedSettingsBody =
  document.getElementById(
    "advancedSettingsBody"
  );


/*
  지금 고른 카테고리의 키. 저장된 카테고리는 String(id), 아직 저장되지
  않은 것은 아래에서 붙여 주는 draft 키다. 다시 그려도 같은 카테고리가
  선택된 채로 남는다.
*/

let advancedSelectedKey =
  null;


let advancedDraftKeySeq =
  0;


/*
  폴더 차례 목록 노드. 이 영역이 본문을 다시 그릴 때 자리를 옮기므로
  document.getElementById 로 매번 찾으면 "본문을 비운 직후"에 null 이
  된다 — 그래서 그 목록을 만든 모듈이 들고 있는 참조를 먼저 본다
  (admin/settings/admin-settings-highlight-folder-order.js).
*/

function highlightFolderOrderPanelNode() {

  return (
    (
      typeof highlightFolderOrderPanel !== "undefined"
        ? highlightFolderOrderPanel
        : null
    ) ||
    document.getElementById("highlightFolderOrderPanel")
  );

}


function advancedCategoryKey(
  category
) {

  if (category && category.id) {

    return String(category.id);

  }


  if (category && !category.__advancedDraftKey) {

    advancedDraftKeySeq += 1;

    category.__advancedDraftKey =
      `draft:${advancedDraftKeySeq}`;

  }


  return category
    ? category.__advancedDraftKey
    : null;

}


/* =========================================================
   작은 컨트롤 만들기 — 라벨과 칸을 <label> 하나로 묶는다.

   for/id 짝을 맞추는 대신 <label> 로 감싼다: 이 화면은 같은 이름의
   칸이 카테고리마다 다시 만들어지므로 id 를 유일하게 유지하기가
   어렵고, 감싸는 방식이 같은 접근성 결과를 준다.
========================================================== */

function buildAdvancedControl(
  labelText,
  field
) {

  const wrap =
    document.createElement("label");


  wrap.className =
    "category-display-control";


  const caption =
    document.createElement("span");


  caption.className =
    "category-display-label";


  caption.textContent =
    labelText;


  wrap.append(caption, field);


  return wrap;

}


function buildAdvancedSelect(
  options,
  value,
  onSelect
) {

  const select =
    document.createElement("select");


  select.className =
    "category-display-select imory-field imory-field--sm";


  options.forEach(
    (option) => {

      const optionElement =
        document.createElement("option");


      optionElement.value =
        String(option.value);


      optionElement.textContent =
        option.label;


      select.appendChild(optionElement);

    }
  );


  select.value =
    String(value);


  select.addEventListener(
    "change",
    () => {

      onSelect(select.value);

    }
  );


  return select;

}


/* =========================================================
   페이지네이션 — post 와 gallery 가 **같은 칸**을 쓴다 (요구사항 9)

   저장되는 값은 셋이다:
     page_size               한 페이지에 담는 개수
     pagination_style        번호 표기 (숫자 / 소문자 로마자)
     pagination_window_size  한 번에 보여 줄 번호 개수 (기본 7)

   허용 값과 정규화는 core/lib/category-types.js 하나에만 있다 —
   공개 화면(skin/skin-context.js)이 쓰는 것과 같은 함수다.

   미리보기 줄은 buildPaginationWindow() 로 만든다. 공개 화면의 페이지
   번호와 **같은 계산기**라, 여기 보이는 모양이 그대로 나간다.
========================================================== */

function buildAdvancedPaginationRow(
  category,
  onChanged
) {

  const row =
    document.createElement("div");


  row.className =
    "category-display-row advanced-pagination-row";


  /* =====================================================
     글 목록을 페이지로 나눌지 (post 전용 스위치)

     기본은 **꺼짐**이다. 켜지 않으면 지금까지처럼 글이 전부 한
     화면에 나온다 — 이미 쓰던 블로그의 목록이 어느 날 갑자기
     잘리지 않게 하는 유일한 장치다(skin/skin-context.js 의
     paginationActive 주석).

     gallery 는 언제나 나뉘므로 이 칸을 보여 주지 않는다.
  ====================================================== */

  const isGallery =
    normalizeCategoryType(category.type) === "gallery";


  if (!isGallery) {

    const toggle =
      document.createElement("input");


    toggle.type =
      "checkbox";


    toggle.checked =
      category.paginate_posts === true;


    toggle.addEventListener(
      "change",
      () => {

        category.paginate_posts =
          toggle.checked;

        onChanged();

      }
    );


    row.appendChild(
      buildAdvancedControl(
        "페이지 나누기",
        toggle
      )
    );

  }


  /* --- 한 페이지당 개수 --- */

  const sizeChoices =
    CATEGORY_PAGE_SIZE_CHOICES.includes(Number(category.page_size))
      ? CATEGORY_PAGE_SIZE_CHOICES
      : CATEGORY_PAGE_SIZE_CHOICES
          .concat([Number(category.page_size)])
          .filter((size) => Number.isFinite(size) && size >= 1)
          .sort((a, b) => a - b);


  row.appendChild(
    buildAdvancedControl(
      "페이지당",
      buildAdvancedSelect(
        sizeChoices.map(
          (size) => ({ value: size, label: `${size}개` })
        ),
        normalizeCategoryPageSize(category.page_size),
        (value) => {

          category.page_size =
            normalizeCategoryPageSize(value);

          onChanged();

        }
      )
    )
  );


  /* --- 번호 표기 --- */

  row.appendChild(
    buildAdvancedControl(
      "페이지 번호",
      buildAdvancedSelect(
        PAGINATION_STYLES.map(
          (style) => ({
            value: style,
            label: PAGINATION_STYLE_LABELS[style] || style
          })
        ),
        normalizePaginationStyle(category.pagination_style),
        (value) => {

          category.pagination_style =
            normalizePaginationStyle(value);

          onChanged();

        }
      )
    )
  );


  /* --- 한 번에 보여 줄 번호 개수 --- */

  const windowInput =
    document.createElement("input");


  windowInput.type =
    "number";


  windowInput.className =
    "category-display-number imory-field imory-field--sm";


  windowInput.min =
    String(PAGINATION_MIN_WINDOW_SIZE);


  windowInput.max =
    String(PAGINATION_MAX_WINDOW_SIZE);


  windowInput.step =
    "1";


  windowInput.value =
    String(
      normalizePaginationWindowSize(
        category.pagination_window_size
      )
    );


  windowInput.addEventListener(
    "change",
    () => {

      const next =
        normalizePaginationWindowSize(
          windowInput.value
        );


      category.pagination_window_size =
        next;


      windowInput.value =
        String(next);


      onChanged();

    }
  );


  row.appendChild(
    buildAdvancedControl(
      "번호 개수",
      windowInput
    )
  );


  /* --- 미리보기 --- */

  const preview =
    document.createElement("p");


  preview.className =
    "advanced-pagination-preview";


  const style =
    normalizePaginationStyle(category.pagination_style);


  const size =
    normalizePaginationWindowSize(category.pagination_window_size);


  /*
    글이 몇 개인지는 여기서 알 수 없으므로 "번호가 넉넉히 있을 때"를
    가정해 창의 모양만 보여 준다 — 고른 값이 화면에서 어떤 줄이 되는지
    확인하는 것이 목적이다.
  */

  const sample =
    buildPaginationWindow(
      Math.ceil(size / 2) + 3,
      size + 6,
      size
    );


  preview.textContent =
    (sample.hasLeadingEllipsis ? "… " : "") +
    sample.pages
      .map((n) => formatPaginationLabel(n, style))
      .join(" ") +
    (sample.hasTrailingEllipsis ? " …" : "");


  preview.setAttribute(
    "aria-label",
    "페이지 번호 미리보기"
  );


  row.appendChild(preview);


  return row;

}


/* =========================================================
   타입별 본문
========================================================== */

function buildAdvancedBodyFor(
  category,
  onChanged
) {

  const body =
    document.createDocumentFragment();


  const type =
    normalizeCategoryType(category.type);


  /* 아직 저장되지 않은 카테고리 — 잠근다 (요구사항 13) */

  if (!category.id) {

    const notice =
      document.createElement("p");


    notice.className =
      "advanced-settings-notice";


    notice.textContent =
      "새 카테고리는 먼저 저장해야 고급 설정을 열 수 있습니다. 이 설정들은 카테고리 번호를 기준으로 저장됩니다.";


    body.appendChild(notice);


    return body;

  }


  if (type === "banner") {

    const notice =
      document.createElement("p");


    notice.className =
      "advanced-settings-notice";


    notice.textContent =
      "추가 설정 없음";


    body.appendChild(notice);


    return body;

  }


  if (type === "highlight") {

    /*
      하이라이트 화면의 폴더는 **원문 글의 현재 카테고리**다 — 손으로
      만드는 폴더가 아니다. 그래서 여기서 고르는 것은 그 폴더들의
      차례와 폴더별 커버뿐이다.

      차례 목록(#highlightFolderOrderPanel)은 자기 드래그 상태를 들고
      있어서 다시 만들지 않고 **자리만 옮긴다**.
    */

    const intro =
      document.createElement("p");


    intro.className =
      "advanced-settings-notice";


    intro.textContent =
      "하이라이트 폴더는 하이라이트한 원문 글의 현재 카테고리로 묶입니다. 여기서는 그 폴더들의 차례와 폴더별 커버를 정합니다.";


    body.appendChild(intro);


    const orderPanel =
      highlightFolderOrderPanelNode();


    if (orderPanel) {

      body.appendChild(orderPanel);


      /*
        목록 자체를 여기서 다시 그린다 — 자리를 옮기는 것만으로는
        hidden 상태가 되살아나지 않는다(HIGHLIGHT 가 아닐 때 감춰
        두기 때문이다). 이 함수가 "폴더가 둘 이상인가"까지 다시
        판정해 hidden 을 정한다.
      */

      if (
        typeof renderHighlightFolderOrderList === "function" &&
        typeof categories !== "undefined" &&
        Array.isArray(categories)
      ) {

        renderHighlightFolderOrderList(
          categories,
          onChanged
        );

      }

    }


    /* 폴더별 커버 · 비율 · 구도 */

    (
      typeof categories !== "undefined" && Array.isArray(categories)
        ? categories
        : []
    ).forEach(
      (source) => {

        const row =
          typeof buildHighlightFolderRow === "function"
            ? buildHighlightFolderRow(source, onChanged)
            : null;


        if (!row) {

          return;

        }


        /*
          어느 폴더의 커버인지 적어 준다 — 예전에는 그 카테고리 줄
          안에 있어서 말할 필요가 없었다.
        */

        const name =
          document.createElement("span");


        name.className =
          "advanced-folder-name";


        name.textContent =
          (source.name || "").trim() || "이름 없음";


        row.insertBefore(
          name,
          row.firstChild
        );


        body.appendChild(row);

      }
    );


    return body;

  }


  /* post / gallery — 같은 페이지네이션 칸을 쓴다 */

  body.appendChild(
    buildAdvancedPaginationRow(
      category,
      onChanged
    )
  );


  /*
    갤러리만의 설정(비밀글 커버 방식 · 지정 이미지)은 기존 builder 를
    그대로 쓴다 — 업로드/정리 계약이 그 안에 있다
    (admin/settings/admin-settings-category-display.js).
  */

  const displayRow =
    typeof buildCategoryDisplayRow === "function"
      ? buildCategoryDisplayRow(category, onChanged)
      : null;


  if (displayRow) {

    body.appendChild(displayRow);

  }


  return body;

}


/* =========================================================
   renderAdvancedCategorySettings(categories, onChanged)

   renderCategories()가 카테고리 목록을 다시 그릴 때마다 부른다.
   고른 카테고리가 사라졌으면(삭제) 목록에서 즉시 빠지고 첫 번째로
   되돌아간다.
========================================================== */

function renderAdvancedCategorySettings(
  categoryList,
  onChanged
) {

  if (
    !advancedSettingsPanel ||
    !advancedCategorySelect ||
    !advancedSettingsBody
  ) {

    return;

  }


  const list =
    Array.isArray(categoryList)
      ? categoryList
      : [];


  /*
    본문을 비우기 전에 폴더 차례 목록을 패널 쪽으로 빼 둔다.
    innerHTML = "" 은 그 안의 노드를 **버린다** — 그대로 두면 다음
    렌더에서 그 목록이 사라지고(문서에서 못 찾는다) 끌어서 옮기기가
    아무 일도 하지 않는 것처럼 보인다. 한 번 겪은 실패다.
  */

  const keptOrderPanel =
    highlightFolderOrderPanelNode();

  if (
    keptOrderPanel &&
    advancedSettingsBody.contains(keptOrderPanel)
  ) {

    advancedSettingsPanel.appendChild(keptOrderPanel);

  }


  advancedCategorySelect.innerHTML =
    "";


  advancedSettingsBody.innerHTML =
    "";


  if (list.length === 0) {

    advancedSettingsPanel.hidden =
      true;


    return;

  }


  advancedSettingsPanel.hidden =
    false;


  const keys =
    list.map(advancedCategoryKey);


  if (!keys.includes(advancedSelectedKey)) {

    advancedSelectedKey =
      keys[0];

  }


  list.forEach(
    (category, index) => {

      const option =
        document.createElement("option");


      option.value =
        keys[index];


      /* 이름과 타입을 함께 보여 준다 — "TXT · 글" */

      option.textContent =
        `${(category.name || "").trim() || "이름 없음"} · ${categoryTypeLabel(category.type)}`;


      advancedCategorySelect.appendChild(option);

    }
  );


  advancedCategorySelect.value =
    advancedSelectedKey;


  const selected =
    list[keys.indexOf(advancedSelectedKey)];


  advancedSettingsBody.appendChild(
    buildAdvancedBodyFor(
      selected,
      onChanged
    )
  );


  /*
    HIGHLIGHT 카테고리가 아닐 때는 차례 목록이 본문 안에 없다 —
    화면 어딘가에 떠 있지 않게 패널 끝으로 되돌려 두고 감춘다.
  */

  const orderPanel =
    highlightFolderOrderPanelNode();


  if (
    orderPanel &&
    !advancedSettingsBody.contains(orderPanel)
  ) {

    orderPanel.hidden =
      true;


    advancedSettingsPanel.appendChild(
      orderPanel
    );

  }

}


if (advancedCategorySelect) {

  advancedCategorySelect.addEventListener(
    "change",
    () => {

      advancedSelectedKey =
        advancedCategorySelect.value;


      /*
        다시 그리는 것은 이 영역뿐이다 — 카테고리 목록은 그대로 둔다.
        값은 categories 배열에 남아 있으므로 고쳐 둔 draft 가 사라지지
        않는다(요구사항 13).
      */

      if (
        typeof categories !== "undefined" &&
        typeof renderCategories === "function"
      ) {

        renderAdvancedCategorySettings(
          categories,
          renderCategories
        );

      }

    }
  );

}
