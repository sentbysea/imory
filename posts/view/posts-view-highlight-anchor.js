/* =========================================================
   POSTS VIEW — 하이라이트 위치 (HIGHLIGHT-1 §9)

   "이 발췌문이 본문의 어디인가"를 저장하고 다시 찾는 유일한 곳.
   DOM도 Supabase도 모르는 순수 계산 + DOM 조작만 한다(네트워크 없음).

   기준 문서: IMORY_HIGHLIGHT1_DESIGN.md §3
   DB:       supabase/migrations/20260913100000_post_highlights_and_memo_folders.sql


   ★ 무엇을 저장하지 않는가

   CSS 선택자도, 화면 좌표도, 노드 경로도 저장하지 않는다(요구사항 9).
   스킨이 바뀌면 선택자는 그 순간 의미를 잃고, 글자 크기 한 번이면
   좌표가 어긋난다. 저장하는 것은 **본문의 글자 그 자체**다.

     excerpt    발췌한 글자 그대로
     prefix     바로 앞 문맥(최대 120자)
     suffix     바로 뒤 문맥(최대 120자)
     textStart  본문 평문에서의 시작 위치(문자 수)

   ★ 어떻게 다시 찾는가 — "확실할 때만 연결한다"

   본문 평문에서 excerpt가 나오는 자리를 전부 모은 뒤, prefix/suffix가
   맞는 후보만 남긴다.

     후보 1개  → 그 자리에 연결한다.
     후보 여러 개 → textStart와 **정확히** 같은 후보가 있으면 그것,
                    없으면 연결하지 않는다.
     후보 0개  → 연결하지 않는다.

   연결하지 않는다는 것은 "잘못된 문장에 표시하지 않는다"는 뜻이고
   (요구사항 9), 발췌문과 메모는 그대로 남아 카드에 보인다 — 카드는
   '원문이 변경되어 위치를 찾을 수 없음' 상태가 된다. 같은 문장이
   여러 번 나오는 글에서 임의의 첫 번째에 붙는 일은 이 규칙 때문에
   구조적으로 일어나지 않는다.

   ★ 무엇을 평문으로 세는가

   본문 그릇 안의 텍스트 노드 전부다. 단 **플랫폼이 나중에 끼워 넣은
   것**은 뺀다 — OOC 메모(.post-detail-ooc), 복사 상자의 복사 버튼
   (.post-copy-box-copy), 편집 도구(.post-block-tool), 그리고 이 기능
   자신이 만든 말풍선/버튼([data-post-hl-ui]). 이것들이 세어지면 같은
   글인데 주인장과 방문자의 offset이 달라진다.

   하이라이트 표시용 <span>은 글자를 더하지도 빼지도 않으므로 평문에
   영향이 없다 — 그래서 하이라이트를 칠한 뒤에 다시 세도 같은 값이
   나온다.

   ★ 서식을 훼손하지 않는 칠하기

   범위를 감싸는 요소를 새로 만들어 노드를 **옮기지** 않는다. 범위에
   걸친 텍스트 노드를 각각 쪼개 그 조각만 <span>으로 감싼다. 그래서
   <em>·<strong>·형광펜 등 원본 인라인 서식의 구조가 그대로 유지되고,
   여러 문단·여러 줄에 걸친 선택도 문단 경계를 넘어 요소를 옮기지
   않는다(요구사항 4).

   지울 때는 그 <span>을 자식으로 풀어 주고 normalize()한다 — 원래
   본문 강조 서식이 그대로 드러난다(요구사항 8).

   classic script. 의존 없음(순수 DOM). posts-view-detail.js보다 먼저
   로드돼도 상관없다.
========================================================== */


/* 평문에서 제외할 것들 — 플랫폼이 본문 그릇 안에 끼워 넣은 UI */

const POST_HIGHLIGHT_SKIP_SELECTOR =
  [
    ".post-detail-ooc",
    ".post-copy-box-copy",
    ".post-block-tool",
    "[data-post-hl-ui]",
    "button",
    "textarea",
    "input"
  ].join(",");


/* 앞뒤 문맥으로 저장하는 글자 수 (DB CHECK와 같은 값) */

const POST_HIGHLIGHT_CONTEXT_CHARS =
  120;


/* 하이라이트 조각에 붙는 클래스/속성 */

const POST_HIGHLIGHT_SPAN_CLASS =
  "post-highlight";

const POST_HIGHLIGHT_ID_ATTR =
  "data-post-highlight-id";



/* =========================================================
   평문 색인

   { text, entries } — entries는 [{ node, start, end }] (end 제외).
   start/end는 text 안의 문자 위치다.
========================================================== */

function buildPostHighlightTextIndex(
  root
) {

  const entries =
    [];


  let text =
    "";


  if (
    !root ||
    typeof root.querySelectorAll !== "function"
  ) {

    return {
      text,
      entries
    };

  }


  const walker =
    document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {

          /*
            플랫폼이 끼워 넣은 UI 안의 글자는 본문이 아니다.
            closest는 Element에만 있으므로 부모에서 본다.
          */

          const parent =
            node.parentElement;


          if (
            !parent ||
            parent.closest(
              POST_HIGHLIGHT_SKIP_SELECTOR
            )
          ) {

            return NodeFilter.FILTER_REJECT;

          }


          if (!node.nodeValue) {

            return NodeFilter.FILTER_REJECT;

          }


          return NodeFilter.FILTER_ACCEPT;

        }
      }
    );


  let node =
    walker.nextNode();


  while (node) {

    const value =
      node.nodeValue ||
      "";


    entries.push({
      node,

      start:
        text.length,

      end:
        text.length + value.length
    });


    text += value;


    node =
      walker.nextNode();

  }


  return {
    text,
    entries
  };

}


/*
  평문 위치 → { node, offset }. 색인이 비었거나 범위를 벗어나면 null.

  end === true면 "그 위치에서 끝난다"는 뜻이라 경계에서 앞 노드를
  고른다(빈 노드에 0 offset으로 붙어 범위가 사라지는 것을 막는다).
*/

function postHighlightPointAt(
  index,
  position,
  end = false
) {

  for (const entry of index.entries) {

    if (
      end
        ? (position > entry.start && position <= entry.end)
        : (position >= entry.start && position < entry.end)
    ) {

      return {
        node:
          entry.node,

        offset:
          position - entry.start
      };

    }

  }


  return null;

}



/* =========================================================
   선택 범위 → 저장할 값

   rangeToPostHighlightAnchor(root, range)
     -> { excerpt, prefix, suffix, textStart } | null

   null인 경우(저장하지 않는다):
     · range가 본문 그릇 밖으로 나갔다 — 제목·버튼·메뉴가 섞인 선택
       (요구사항 4 "본문 밖의 제목·버튼·메뉴가 선택에 섞인 경우
       저장하지 않는다")
     · 고른 글자가 없다(공백만 고른 경우 포함)
========================================================== */

function rangeToPostHighlightAnchor(
  root,
  range
) {

  if (
    !root ||
    !range ||
    range.collapsed
  ) {

    return null;

  }


  /*
    양 끝이 모두 본문 그릇 안이어야 한다. 한쪽이라도 밖이면 제목이나
    사이트 UI가 섞인 선택이다.
  */

  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {

    return null;

  }


  const index =
    buildPostHighlightTextIndex(
      root
    );


  const startPos =
    postHighlightPositionOf(
      index,
      range.startContainer,
      range.startOffset
    );


  const endPos =
    postHighlightPositionOf(
      index,
      range.endContainer,
      range.endOffset
    );


  if (
    startPos === null ||
    endPos === null ||
    endPos <= startPos
  ) {

    return null;

  }


  /*
    양 끝의 공백은 발췌에서 뺀다 — 문장을 끌어 고를 때 뒤에 딸려오는
    공백/줄바꿈까지 저장하면 같은 문장을 두 번 골랐을 때 "정확히 같은
    범위"로 인식되지 않는다(요구사항 8).
  */

  let from =
    startPos;

  let to =
    endPos;


  while (
    from < to &&
    /\s/.test(index.text.charAt(from))
  ) {

    from += 1;

  }


  while (
    to > from &&
    /\s/.test(index.text.charAt(to - 1))
  ) {

    to -= 1;

  }


  if (to <= from) {

    return null;

  }


  return {

    excerpt:
      index.text.slice(from, to),

    prefix:
      index.text.slice(
        Math.max(0, from - POST_HIGHLIGHT_CONTEXT_CHARS),
        from
      ),

    suffix:
      index.text.slice(
        to,
        to + POST_HIGHLIGHT_CONTEXT_CHARS
      ),

    textStart:
      from

  };

}


/*
  DOM 지점(container, offset) → 평문 위치. 찾지 못하면 null.

  container가 텍스트 노드가 아니면(요소 노드 경계) 그 자리에서
  시작하는 가장 가까운 텍스트 노드를 찾는다 — 문단 전체를 트리플
  클릭하거나 여러 문단을 끌어 고르면 경계가 요소에 걸린다.
*/

function postHighlightPositionOf(
  index,
  container,
  offset
) {

  if (container.nodeType === Node.TEXT_NODE) {

    for (const entry of index.entries) {

      if (entry.node === container) {

        return entry.start + Math.min(
          offset,
          entry.end - entry.start
        );

      }

    }


    return null;

  }


  /*
    요소 경계: offset은 "몇 번째 자식 앞"이다. 그 자식(또는 그 뒤의
    아무 자식) 안의 첫 텍스트 노드를 찾고, 없으면 그 요소 뒤의 첫
    텍스트 노드를 찾는다.
  */

  const children =
    container.childNodes;


  for (let i = offset; i < children.length; i += 1) {

    const found =
      postHighlightFirstIndexedPosition(
        index,
        children[i],
        false
      );


    if (found !== null) {

      return found;

    }

  }


  for (let i = Math.min(offset, children.length) - 1; i >= 0; i -= 1) {

    const found =
      postHighlightFirstIndexedPosition(
        index,
        children[i],
        true
      );


    if (found !== null) {

      return found;

    }

  }


  /* 자식이 하나도 색인에 없으면 요소 자체의 앞/뒤를 본다 */

  return postHighlightFirstIndexedPosition(
    index,
    container,
    offset > 0
  );

}


/*
  node(와 그 자손) 안에서 색인에 있는 첫(last=true면 마지막) 텍스트
  노드의 시작(끝) 위치.
*/

function postHighlightFirstIndexedPosition(
  index,
  node,
  last
) {

  if (!node) {

    return null;

  }


  const matched =
    [];


  for (const entry of index.entries) {

    if (
      entry.node === node ||
      node.contains?.(entry.node)
    ) {

      matched.push(entry);

    }

  }


  if (!matched.length) {

    return null;

  }


  return last
    ? matched[matched.length - 1].end
    : matched[0].start;

}



/* =========================================================
   저장된 값 → 지금 본문의 Range

   findPostHighlightRange(root, anchor) -> Range | null

   null은 "이 글에서 이 발췌문의 자리를 확실히 알 수 없다"는 뜻이다.
   호출자는 그 하이라이트를 칠하지 않고 카드에만 남긴다.
========================================================== */

function findPostHighlightRange(
  root,
  anchor,
  index
) {

  const resolved =
    findPostHighlightTextStart(
      index ||
        buildPostHighlightTextIndex(root),
      anchor
    );


  if (resolved === null) {

    return null;

  }


  return postHighlightRangeAt(
    index ||
      buildPostHighlightTextIndex(root),
    resolved,
    resolved + anchor.excerpt.length
  );

}


/*
  평문에서의 시작 위치를 정한다(위 "확실할 때만 연결한다" 규칙).
*/

function findPostHighlightTextStart(
  index,
  anchor
) {

  if (
    !anchor ||
    typeof anchor.excerpt !== "string" ||
    !anchor.excerpt
  ) {

    return null;

  }


  const text =
    index.text;


  const candidates =
    [];


  let at =
    text.indexOf(anchor.excerpt);


  while (at !== -1) {

    candidates.push(at);


    at =
      text.indexOf(
        anchor.excerpt,
        at + 1
      );

  }


  if (!candidates.length) {

    return null;

  }


  /*
    문맥으로 좁힌다. 앞뒤 문맥은 "저장된 만큼"만 비교한다 — 글 맨
    앞/맨 뒤의 발췌는 문맥이 짧게 저장돼 있다.
  */

  const contextual =
    candidates.filter(
      (start) =>
        postHighlightContextMatches(
          text,
          start,
          start + anchor.excerpt.length,
          anchor
        )
    );


  const pool =
    contextual.length
      ? contextual
      : candidates;


  if (pool.length === 1) {

    return pool[0];

  }


  /*
    여럿 남았으면 저장된 위치와 정확히 같은 것만 인정한다. 그것도
    없으면 연결하지 않는다 — 임의의 하나를 고르지 않는다.
  */

  const exact =
    pool.find(
      (start) =>
        start === anchor.textStart
    );


  return exact === undefined
    ? null
    : exact;

}


function postHighlightContextMatches(
  text,
  start,
  end,
  anchor
) {

  const prefix =
    String(anchor.prefix || "");

  const suffix =
    String(anchor.suffix || "");


  if (prefix) {

    const actual =
      text.slice(
        Math.max(0, start - prefix.length),
        start
      );


    if (actual !== prefix) {

      return false;

    }

  }


  if (suffix) {

    const actual =
      text.slice(
        end,
        end + suffix.length
      );


    if (actual !== suffix) {

      return false;

    }

  }


  return true;

}


function postHighlightRangeAt(
  index,
  from,
  to
) {

  const start =
    postHighlightPointAt(
      index,
      from,
      false
    );

  const end =
    postHighlightPointAt(
      index,
      to,
      true
    );


  if (
    !start ||
    !end
  ) {

    return null;

  }


  const range =
    document.createRange();


  try {

    range.setStart(
      start.node,
      start.offset
    );

    range.setEnd(
      end.node,
      end.offset
    );

  }

  catch (err) {

    return null;

  }


  return range;

}



/* =========================================================
   칠하기 / 지우기
========================================================== */

/*
  applyPostHighlights(root, highlights) -> Set<id>

  돌려주는 것은 **실제로 칠해진 id 집합**이다. 여기 없는 id는
  "원문이 변경되어 위치를 찾을 수 없음"이고, 카드 목록이 그 상태를
  그린다.

  칠하기 전에 이전 표시를 전부 걷어낸다 — 같은 글을 다시 그릴 때
  중복으로 겹쳐 감싸지 않는다.
*/

function applyPostHighlights(
  root,
  highlights
) {

  const placed =
    new Set();


  if (!root) {

    return placed;

  }


  clearPostHighlightMarks(
    root
  );


  const list =
    Array.isArray(highlights)
      ? highlights
      : [];


  if (!list.length) {

    return placed;

  }


  const index =
    buildPostHighlightTextIndex(
      root
    );


  /*
    먼저 전부 평문 위치로 바꾸고, **뒤에서부터** 칠한다. 앞쪽 범위의
    텍스트 노드/offset은 뒤쪽을 쪼개도 그대로 유효하기 때문이다
    (splitText는 앞 조각을 원래 노드로 남긴다).
  */

  const resolved =
    [];


  for (const item of list) {

    const start =
      findPostHighlightTextStart(
        index,
        item
      );


    if (start === null) {

      continue;

    }


    resolved.push({
      item,

      start,

      end:
        start + item.excerpt.length
    });

  }


  resolved.sort(
    (a, b) =>
      a.start - b.start
  );


  for (let i = resolved.length - 1; i >= 0; i -= 1) {

    const entry =
      resolved[i];


    const painted =
      paintPostHighlightRange(
        index,
        entry
      );


    if (painted) {

      placed.add(
        String(entry.item.id)
      );

    }

  }


  return placed;

}


/*
  한 범위를 칠한다. 범위에 걸친 텍스트 노드를 각각 쪼개 그 조각만
  <span>으로 감싼다 — 요소를 옮기지 않으므로 원본 서식이 그대로다.
*/

function paintPostHighlightRange(
  index,
  entry
) {

  const pieces =
    [];


  for (const textEntry of index.entries) {

    if (
      textEntry.end <= entry.start ||
      textEntry.start >= entry.end
    ) {

      continue;

    }


    pieces.push({
      node:
        textEntry.node,

      from:
        Math.max(0, entry.start - textEntry.start),

      to:
        Math.min(
          textEntry.end - textEntry.start,
          entry.end - textEntry.start
        )
    });

  }


  if (!pieces.length) {

    return false;

  }


  let painted =
    false;


  /*
    한 노드 안에서 뒤 조각을 먼저 자르면 앞 조각의 offset이 그대로
    유효하다 — 그래서 뒤에서부터 돈다.
  */

  for (let i = pieces.length - 1; i >= 0; i -= 1) {

    const piece =
      pieces[i];


    let node =
      piece.node;


    if (!node.isConnected) {

      continue;

    }


    try {

      if (piece.to < node.nodeValue.length) {

        node.splitText(piece.to);

      }


      if (piece.from > 0) {

        node =
          node.splitText(piece.from);

      }

    }

    catch (err) {

      continue;

    }


    if (!node.nodeValue) {

      continue;

    }


    const span =
      document.createElement("span");


    span.className =
      POST_HIGHLIGHT_SPAN_CLASS;


    span.setAttribute(
      POST_HIGHLIGHT_ID_ATTR,
      String(entry.item.id)
    );


    span.style.backgroundColor =
      entry.item.color ||
      "#f6e0c8";


    if (entry.item.note) {

      span.setAttribute(
        "data-post-highlight-note",
        "1"
      );

    }


    node.parentNode.insertBefore(
      span,
      node
    );


    span.appendChild(
      node
    );


    painted =
      true;

  }


  return painted;

}


/*
  표시를 전부 걷어낸다. 감싼 <span>만 풀어 주므로 원래 본문 강조
  서식은 그대로 남는다(요구사항 8).
*/

function clearPostHighlightMarks(
  root,
  onlyId
) {

  if (
    !root ||
    typeof root.querySelectorAll !== "function"
  ) {

    return;

  }


  const selector =
    onlyId
      ? `.${POST_HIGHLIGHT_SPAN_CLASS}[${POST_HIGHLIGHT_ID_ATTR}="${String(onlyId).replace(/"/g, "")}"]`
      : `.${POST_HIGHLIGHT_SPAN_CLASS}`;


  root
    .querySelectorAll(selector)
    .forEach(
      (span) => {

        const parent =
          span.parentNode;


        if (!parent) {

          return;

        }


        while (span.firstChild) {

          parent.insertBefore(
            span.firstChild,
            span
          );

        }


        parent.removeChild(span);

      }
    );


  try {

    root.normalize();

  }

  catch (err) {

    /* 브라우저가 normalize를 막을 이유는 없지만 실패해도 치명적이지 않다 */

  }

}


/*
  이미 칠해진 하이라이트의 색만 바꾼다 — 다시 칠하지 않으므로 지금
  열려 있는 말풍선의 기준 요소가 살아 있다.
*/

function recolorPostHighlightMarks(
  root,
  id,
  color
) {

  if (!root) {

    return;

  }


  root
    .querySelectorAll(
      `.${POST_HIGHLIGHT_SPAN_CLASS}[${POST_HIGHLIGHT_ID_ATTR}="${String(id).replace(/"/g, "")}"]`
    )
    .forEach(
      (span) => {

        span.style.backgroundColor =
          color;

      }
    );

}


function markPostHighlightHasNote(
  root,
  id,
  hasNote
) {

  if (!root) {

    return;

  }


  root
    .querySelectorAll(
      `.${POST_HIGHLIGHT_SPAN_CLASS}[${POST_HIGHLIGHT_ID_ATTR}="${String(id).replace(/"/g, "")}"]`
    )
    .forEach(
      (span) => {

        if (hasNote) {

          span.setAttribute(
            "data-post-highlight-note",
            "1"
          );

        }

        else {

          span.removeAttribute(
            "data-post-highlight-note"
          );

        }

      }
    );

}
