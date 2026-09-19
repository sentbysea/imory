/* =========================================================
   SKIN CSS VALIDATOR / SCOPER

   AI_SKIN_PHASE1A_DESIGN.md 7절 구현. Skin Package의 `css` 필드를
   저장(발행)하기 *전에* 통과시키는 파이프라인:

     raw CSS -> parse -> 위험 구문 제거/치환 -> .imory-skin-root
     스코프 강제 -> serialize -> 저장해도 되는 안전한 CSS

   책임 경계: 이 파일은 "저장 시점"에만 로드된다. 공개 HOME은
   이미 스코프가 끝난 최종 CSS 문자열을 <style>.textContent로
   삽입하기만 하면 되므로(skin-render.js, Slice 2) css-tree를
   전혀 로드하지 않는다(7-2절) — index.html/기존 Customize는 이
   파일을 로드하지 않는다.

   의존 패키지: @eslint/css-tree (github.com/eslint/csstree)
   — 원 저장소 css-tree(github.com/csstree/csstree, 최신 3.2.1)와
   API가 동일(parse/walk/generate)하지만, 실제 유지보수 활동은
   ESLint 포크 쪽이 훨씬 최근이다(Slice 3 구현 시점 기준 —
   eslint/csstree 최근 커밋 2026-09-01, 4.1.0 릴리스 3일 전 /
   csstree/csstree 최근 커밋 2026-03-05, 6개월 정체). 그래서
   @eslint/css-tree를 채택한다(7-2절 "패키지 확정은 Slice 3에서"
   결정 반영).

   exact package: @eslint/css-tree
   exact version: 4.1.0 (MIT)
   exact CDN URL: https://cdn.jsdelivr.net/npm/@eslint/css-tree@4.1.0/dist/csstree.esm.js
   (버전을 생략하거나 @latest를 쓰지 않는다 — 7-2절 원칙)

   이 파일 자체가 ES 모듈이다(정적 import 사용) — 로드하는 쪽은
   반드시 `<script type="module" src="skin/skin-css-validate.js">`
   로 불러와야 한다. 이 프로젝트의 나머지 skin/*.js는 전역 함수를
   내보내는 classic script이므로, 이 모듈도 window에 동일한
   방식으로 API를 노출해 나머지 코드와 자연스럽게 섞이게 한다.

   ★ IMPORT-CSS-IMAGE-1 (2026-09-19) — 판정이 한 함수로 모였다

   예전에는 csstree 가 **어디서든** 파싱 경고를 하나라도 내면 CSS
   전체를 버렸다(ok:false, css:""). 그래서 선언 하나에 닫는 따옴표가
   빠진 스킨(`content:"“”;`)이 Import 에서 통째로 거부되고, 사용자는
   "Unexpected input" 한 마디만 봤다. 브라우저는 그런 선언 **하나만**
   버리고 나머지를 그대로 쓴다.

   지금은 analyzeSkinCss() 하나가 판정한다(IMORY_CSS_IMPORT_DESIGN.md):

     구조가 깨짐(중괄호·괄호 짝, 선택자/@규칙 머리)  -> 차단(error)
     선언 하나의 문법 오류                          -> 그 선언만 제외(removed)
     보안 정책(@import · javascript:/vbscript: ·
       expression() · behavior/-moz-binding)        -> strict 에서는 차단,
                                                       repair 에서는 제외
     허용 안 되는 주소(data:/http:/blob: 등) · 보호
       선택자                                        -> 그 선언/선택자만 제외

   제외는 **원문에서 그 구간만 잘라낸다** — AST 를 다시 찍어내지
   않으므로 사용자가 쓴 줄바꿈·주석·들여쓰기가 그대로 남고, 잘라낸
   결과를 **다시 검사해서** 아무것도 걸리지 않을 때만 쓴다(고정점).
   저장·Export 에 들어가는 것은 이 잘라낸 결과다.

   strict: Import · Code 적용 · AI 결과(사람이 지금 넣고 있는 CSS)
   repair: 저장 직전 · 렌더 시점(이미 저장된 CSS — 거부하면 화면이
           통째로 스킨 없이 나온다)
========================================================== */

import * as csstree from "https://cdn.jsdelivr.net/npm/@eslint/css-tree@4.1.0/dist/csstree.esm.js";

const SKIN_CSS_SCOPE_CLASS_BASE = "imory-skin-root";

/* Slice 3.5 보강: namespace가 주어지면 이 렌더 인스턴스 전용
   scope class를 만든다. 고정된 `.imory-skin-root` 하나만 쓰면,
   같은 document에 서로 다른 Skin이 동시에 렌더될 때(Studio
   프리뷰 이력, 갤러리 등) 두 root가 같은 class를 공유하게 되어
   "class는 같지만 다른 DOM 서브트리"인 두 selector가 동일
   specificity로 충돌한다 — 나중에 삽입된 <style>이 CSS 캐스케이드
   규칙상 무조건 이긴다(선택자 자체가 같으므로 각 root 안에서만
   적용되는 게 아니라 문서 전체에서 "마지막 것이 이긴다"로 깨짐).
   namespace가 없으면(저장 시점 검증 등 인스턴스 개념이 없는 호출)
   기존과 동일한 범용 클래스를 그대로 쓴다. */
function getSkinCssScopeClass(namespace) {
  return namespace ? `${SKIN_CSS_SCOPE_CLASS_BASE}-${namespace}` : SKIN_CSS_SCOPE_CLASS_BASE;
}

const SKIN_CSS_UNSAFE_URL_SCHEMES = ["javascript:", "data:", "vbscript:", "file:", "blob:"];

/* 이 둘은 "허용 안 되는 주소"가 아니라 **공격 시도**로 본다 — strict
   모드에서 선언을 조용히 지우지 않고 Import 자체를 막는다. */
const SKIN_CSS_SCRIPT_URL_SCHEMES = ["javascript:", "vbscript:"];

function stripSkinCssUrlForSchemeCheck(rawUrl) {
  return String(rawUrl || "")
    .trim()
    .replace(/[\x00-\x1F\x7F\s]/g, "")
    .toLowerCase();
}

/* url()과 마찬가지로 href/src(6-5절)와 정책을 맞춘다 — mailto:/tel:은
   href/src 쪽 정책과 달리 CSS url()에는 애초에 의미가 없는
   스킴이라 별도로 나열하지 않는다(https/상대경로 외 전부 차단되는
   결과는 동일). */
function isSafeSkinCssUrl(rawUrl) {

  if (typeof rawUrl !== "string") {
    return false;
  }

  const trimmed = rawUrl.trim();

  if (!trimmed) {
    return false;
  }

  const strippedForSchemeCheck = stripSkinCssUrlForSchemeCheck(trimmed);

  if (SKIN_CSS_UNSAFE_URL_SCHEMES.some((scheme) => strippedForSchemeCheck.startsWith(scheme))) {
    return false;
  }

  try {
    const parsed = new URL(trimmed, "https://imory-skin-url-base.invalid/");
    return parsed.protocol === "https:";
  } catch (err) {
    return false;
  }

}

function isScriptSkinCssUrl(rawUrl) {
  const stripped = stripSkinCssUrlForSchemeCheck(rawUrl);
  return SKIN_CSS_SCRIPT_URL_SCHEMES.some((scheme) => stripped.startsWith(scheme));
}

/* 레거시 IE 전용이지만 방어적으로 차단(7-3절) — 프로퍼티 이름
   자체로 판정하므로 값의 인코딩/따옴표 여부와 무관하게 걸린다. */
const SKIN_CSS_DANGEROUS_PROPERTY_NAMES = new Set(["-moz-binding", "behavior"]);

/* custom property(--*) 값은 항상 Raw 노드로 파싱되어(브라우저가
   원래 opaque하게 취급하는 값이라 구조 검증이 불가능하다) 아래
   Url/Function 기반 검사를 그대로 적용할 수 없다. var()로
   간접 참조되어 다른 선언에 재주입될 수 있으므로(8-4절과 같은
   결의 방어적 판단), 키워드 스캔으로 최소한의 안전망을 둔다.
   IMPORT-CSS-IMAGE-1: 문법이 깨진 선언의 원문에도 같은 스캔을 건다 —
   따옴표 없는 url(javascript:...)은 csstree 가 값을 못 읽어 "문법
   오류"로 들어오는데, 그것을 "이 선언만 제외"로 조용히 넘기면 공격
   시도가 보이지 않는다. */
const SKIN_CSS_DANGEROUS_RAW_PATTERN = /(javascript:|vbscript:|expression\s*\(|-moz-binding|behavior\s*:)/i;

/* 8-2절(POST 단계 선행 설계) 1차 방어 — v0.1(HOME 전용)에는 이
   selector가 실제로 등장할 상황이 없지만, 이 validator가 POST
   단계에서도 그대로 재사용될 것이므로 지금부터 넣어둔다. */
const SKIN_CSS_PROTECTED_SELECTOR_PATTERN = /#postDetailContent\b|\.post-detail-content\b|\.post-dialogue\b|\.post-action\b|\.post-inline-/;

/* 문자열 인자로 주소를 받는 함수 — url() 과 같은 규칙을 건다.
   `image-set("http://…" 1x)` 는 Url 노드가 아니라 String 노드라
   예전 검사(Url 노드만 보던)를 그대로 지나갔다. */
const SKIN_CSS_URL_STRING_FUNCTIONS = new Set(["image-set", "-webkit-image-set", "src"]);

function isSkinCssKeyframesAtruleName(name) {
  return String(name || "").toLowerCase().endsWith("keyframes");
}

function isPureGlobalSelectorCompound(node) {

  if (node.type === "PseudoClassSelector" && node.name === "root") {
    return true;
  }

  if (node.type === "TypeSelector" && (node.name === "html" || node.name === "body")) {
    return true;
  }

  return false;

}

/* =========================================================
   selector 스코프 — 모든 Rule의 셀렉터 앞에 scope class(기본
   `.imory-skin-root`, namespace가 있으면 `.imory-skin-root-<ns>`,
   위 getSkinCssScopeClass 참고)를 강제로 삽입한다(7-3절).
   `:root`/`html`/`body`가 selector의 맨 앞 compound 전체(다른
   simple selector와 결합되지 않은 단독 형태)일 때만 scope
   class로 치환하고, 그 외(예: `body.dark`, `div :root span`)는
   안전 쪽으로 접두어만 붙인다 — 매치 대상이 없어져 죽은 규칙이
   될 뿐 위험하지 않다.
========================================================== */

function scopeSkinCssSelector(selectorNode, scopeClass) {

  const children = selectorNode.children;
  const items = children.toArray();

  let compoundEnd = items.findIndex((node) => node.type === "Combinator");

  if (compoundEnd === -1) {
    compoundEnd = items.length;
  }

  /* PHASE 1H: 맨 앞이 `:root`면 그 자리에 scope class를 끼워 넣는다 —
     단독(`:root`)이든 상태가 붙어 있든(`:root[data-imory-post-focus="on"]`)
     동일하다. 플랫폼이 스킨 루트 자체에 붙이는 상태 속성을 스킨 CSS가
     받을 수 있는 유일한 형태이고(플랫폼은 루트보다 위의 DOM에 상태를
     두지 않는다 — 스킨 CSS는 자기 루트 밖을 볼 수 없다), 결과 selector는
     여전히 이 인스턴스의 scope class로 시작하므로 스코프는 그대로다.
     이 처리가 없으면 접두어만 붙어(`.imory-skin-root-i3 :root[...]`)
     매치 대상이 없는 죽은 규칙이 된다. */
  if (
    compoundEnd >= 1 &&
    items[0].type === "PseudoClassSelector" &&
    items[0].name === "root"
  ) {
    children.shift();
    children.prependData({ type: "ClassSelector", name: scopeClass });
    return;
  }

  if (compoundEnd === 1 && isPureGlobalSelectorCompound(items[0])) {
    children.shift();
    children.prependData({ type: "ClassSelector", name: scopeClass });
    return;
  }

  children.prependData({ type: "Combinator", name: " " });
  children.prependData({ type: "ClassSelector", name: scopeClass });

}

/* =========================================================
   @keyframes 이름 격리(Slice 3.5 보강)

   `.imory-skin-root` selector 스코프는 selector에만 적용되고
   `@keyframes <name>` 식별자 자체나 `animation`/`animation-name`이
   그 이름을 참조하는 부분에는 아무 영향이 없다 — CSS keyframe
   이름은 문서 전체에서 전역이라, 서로 다른 Skin이 같은 document에
   함께 렌더되면(Studio 프리뷰 이력, 갤러리 등 향후 시나리오)
   나중에 등록된 `@keyframes fade`가 먼저 것을 그냥 덮어써 버린다.

   `namespace`가 주어졌을 때만 이 렌더 인스턴스 전용 이름으로
   바꿔치기한다(저장되는 CSS 자체는 원래 이름을 그대로 유지 —
   이식성을 위해 이 치환은 항상 렌더 시점에만 적용, 3절 "구조와
   개인화의 분리" 원칙과 동일한 결).

   한계(문서화된 채로 v0.1 범위에서 받아들임): `animation`
   shorthand 안에서는 이름과 키워드(ease/infinite/alternate 등)가
   구분 없이 전부 Identifier로 파싱된다. 이 함수는 "이 스타일시트
   안에서 실제로 `@keyframes`로 정의된 이름과 정확히 같은
   Identifier"만 바꾼다 — 작성자가 자기 keyframe 이름을 우연히
   `infinite`처럼 진짜 키워드와 똑같이 지었을 때만 그 shorthand
   안의 키워드 자리까지 함께 바뀌는 드문 edge case가 있다. */

function namespaceSkinCssKeyframes(ast, namespace) {

  if (!namespace) {
    return;
  }

  const renameMap = new Map();

  csstree.walk(ast, {
    visit: "Atrule",
    enter(node) {

      if (!isSkinCssKeyframesAtruleName(node.name)) {
        return;
      }

      if (!node.prelude || node.prelude.type !== "AtrulePrelude") {
        return;
      }

      const identifierNode = node.prelude.children.first;

      if (!identifierNode || identifierNode.type !== "Identifier") {
        return;
      }

      const originalName = identifierNode.name;

      if (!renameMap.has(originalName)) {
        renameMap.set(originalName, `imory-kf-${namespace}-${originalName}`);
      }

      identifierNode.name = renameMap.get(originalName);

    }
  });

  if (renameMap.size === 0) {
    return;
  }

  csstree.walk(ast, {
    visit: "Declaration",
    enter(node) {

      const propertyLower = node.property.toLowerCase();

      if (propertyLower !== "animation" && propertyLower !== "animation-name") {
        return;
      }

      csstree.walk(node.value, (valueNode) => {
        if (valueNode.type === "Identifier" && renameMap.has(valueNode.name)) {
          valueNode.name = renameMap.get(valueNode.name);
        }
      });

    }
  });

}


/* =========================================================
   위치 — 오류를 "몇 행 몇 열"로 말하기 위한 도구

   행/열은 1부터 센다. 열은 JS 문자열 인덱스(UTF-16) 기준이라
   csstree 의 오류 column 과 같은 값이 나온다.
========================================================== */

function buildSkinCssLineStarts(source) {

  const starts = [0];

  for (let i = 0; i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }

  return starts;

}

function locateSkinCssOffset(lineStarts, offset) {

  let low = 0;
  let high = lineStarts.length - 1;

  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (lineStarts[mid] <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return { line: low + 1, column: offset - lineStarts[low] + 1 };

}

const SKIN_CSS_SNIPPET_MAX = 90;

function buildSkinCssSnippet(source, start, end) {

  const text =
    source.slice(start, end).replace(/\s+/g, " ").trim();

  return text.length > SKIN_CSS_SNIPPET_MAX
    ? text.slice(0, SKIN_CSS_SNIPPET_MAX - 1) + "…"
    : text;

}


/* =========================================================
   구조 검사 — 괄호 짝

   csstree 는 구조가 깨진 CSS 도 조용히 받아 준다. `.a{color:red`
   처럼 끝에서 닫히지 않은 블록은 CSS 문법상 "파일 끝이 닫는다"라서
   오류조차 나오지 않고, `.a{color:red\n.b{…}` 는 두 번째 규칙이
   첫 규칙 **안으로** 들어간 채 통과한다. 그래서 파서와 별도로
   토큰 단위의 짝을 센다(문자열·주석 안의 괄호는 토큰이 이미
   삼킨다).

   `}` 가 `(`/`[` 안에서 나오면 브라우저는 그것을 블록의 끝이 아니라
   괄호 안의 글자로 읽는다 — 그 뒤의 스타일시트 전체가 괄호 안으로
   빨려 들어가므로 구조 오류다. 짝 없는 `)`/`]` 는 선언 하나의 문제라
   여기서 다루지 않는다(파서가 그 선언을 문법 오류로 보고한다).
========================================================== */

function checkSkinCssBlockBalance(source) {

  const types = csstree.tokenTypes;
  const stack = [];
  const problems = [];
  let broken = false;

  csstree.tokenize(source, (type, start) => {

    if (broken) {
      return;
    }

    if (type === types.LeftCurlyBracket) {
      stack.push({ char: "{", offset: start });
      return;
    }

    if (type === types.LeftParenthesis || type === types.Function) {
      stack.push({ char: "(", offset: start });
      return;
    }

    if (type === types.LeftSquareBracket) {
      stack.push({ char: "[", offset: start });
      return;
    }

    const top = stack[stack.length - 1];

    if (type === types.RightCurlyBracket) {

      if (!top) {
        problems.push({ code: "stray-close-brace", offset: start, end: start + 1 });
        return;
      }

      if (top.char === "{") {
        stack.pop();
        return;
      }

      problems.push({ code: "unclosed-bracket", offset: top.offset, end: start + 1, char: top.char });
      broken = true;
      return;

    }

    if (type === types.RightParenthesis && top) {

      if (top.char === "(") {
        stack.pop();
      } else if (top.char === "[") {
        problems.push({ code: "unclosed-bracket", offset: top.offset, end: start + 1, char: "[" });
        broken = true;
      }

      return;

    }

    if (type === types.RightSquareBracket && top) {

      if (top.char === "[") {
        stack.pop();
      } else if (top.char === "(") {
        problems.push({ code: "unclosed-bracket", offset: top.offset, end: start + 1, char: "(" });
        broken = true;
      }

    }

  });

  if (!broken) {
    stack.forEach((open) => {
      problems.push({
        code: open.char === "{" ? "unclosed-brace" : "unclosed-bracket",
        offset: open.offset,
        end: open.offset + 1,
        char: open.char
      });
    });
  }

  return problems;

}


/* =========================================================
   사용자 문장

   category: syntax(문법) / security(보안 정책) / policy(허용되지 않는 값)
   severity: error(가져오지 않음) / removed(그 부분만 빼고 가져옴)
========================================================== */

const SKIN_CSS_PARSER_MESSAGE_KO = [
  [/^Unexpected input/i, "예상하지 못한 글자가 있습니다"],
  [/^Colon is expected/i, "속성 이름 뒤에 ':'가 없습니다"],
  [/^Identifier is expected/i, "이름이 있어야 할 자리에 다른 글자가 있습니다"],
  [/^Selector is expected/i, "선택자가 있어야 할 자리에 다른 글자가 있습니다"],
  [/^"\)" is expected/i, "닫는 괄호 ')'가 없습니다"],
  [/^"\]" is expected/i, "닫는 대괄호 ']'가 없습니다"],
  [/^"\{" is expected/i, "여는 중괄호 '{'가 없습니다"],
  [/^"\}" is expected/i, "닫는 중괄호 '}'가 없습니다"]
];

function translateSkinCssParserMessage(message) {

  const text = String(message || "");

  for (const [pattern, korean] of SKIN_CSS_PARSER_MESSAGE_KO) {
    if (pattern.test(text)) {
      return korean;
    }
  }

  return text || "읽을 수 없는 구문입니다";

}

/*
  닫는 따옴표가 빠진 문자열의 수정 예를 만든다. 브라우저는 그런
  문자열을 줄 끝까지 읽고, 선언은 **다음 `;` 까지** 이어진다 — 그래서
  다음 줄의 선언까지 함께 사라진다. 수정 예는 "따옴표를 닫고 그
  선언을 끝낸" 모양 하나다(무엇을 뜻했는지 추측해서 고쳐 쓰지는
  않는다 — 제안만 한다).
*/
function buildSkinCssBadStringHint(declText) {

  const firstLine =
    String(declText || "").split("\n")[0].trim();

  const match =
    /^([^:]+:\s*)(["'])(.*)$/.exec(firstLine);

  if (!match) {
    return "문자열을 여는 따옴표와 같은 따옴표로 닫아 주세요.";
  }

  const quote = match[2];
  const body = match[3].replace(/;\s*$/, "").trimEnd();

  return `따옴표를 닫아 주세요. 예: ${match[1]}${quote}${body}${quote};`;

}

function describeSkinCssDeclarationSyntax(source, start, end, parserMessage) {

  const types = csstree.tokenTypes;
  const text = source.slice(start, end);
  let badString = false;
  let badUrl = false;

  csstree.tokenize(text, (type) => {
    if (type === types.BadString) badString = true;
    if (type === types.BadUrl) badUrl = true;
  });

  const multiLine = text.trim().indexOf("\n") !== -1;

  if (badString) {
    return {
      code: "unclosed-string",
      message:
        "문자열의 닫는 따옴표가 없습니다" +
        (multiLine ? "(브라우저처럼 다음 줄의 ';'까지를 한 선언으로 읽으므로 그 부분도 함께 제외됩니다)" : ""),
      hint: buildSkinCssBadStringHint(text)
    };
  }

  if (badUrl) {
    return {
      code: "bad-url",
      message: "url( ) 안의 주소를 읽을 수 없습니다",
      hint: "주소를 따옴표로 감싸 주세요. 예: url(\"https://…/image.png\")"
    };
  }

  return {
    code: "invalid-declaration",
    message: translateSkinCssParserMessage(parserMessage),
    hint: "속성 이름과 값을 `이름: 값;` 모양으로 적었는지 확인해 주세요."
  };

}

const SKIN_CSS_STRUCTURE_MESSAGES = {
  "unclosed-brace": {
    message: "여는 중괄호 '{'가 닫히지 않았습니다",
    hint: "이 블록 끝에 '}'를 넣어 주세요. 중괄호가 깨지면 뒤 규칙이 전부 이 블록 안으로 들어가므로 가져오지 않습니다."
  },
  "stray-close-brace": {
    message: "짝이 없는 닫는 중괄호 '}'가 있습니다",
    hint: "남는 '}'를 지우거나, 빠진 '{'를 넣어 주세요."
  },
  "unclosed-bracket": {
    message: "괄호가 닫히지 않은 채 블록이 끝났습니다",
    hint: "calc( ), url( ), [속성] 같은 괄호가 모두 닫혔는지 확인해 주세요."
  }
};


/* =========================================================
   scanSkinCss(source, mode) -> { fatal: Issue[], issues: Issue[] }

   Issue = { severity, category, code, message, hint, line, column,
             snippet, start, end }

   start/end 는 **잘라낼 원문 구간**이다(severity:"removed" 일 때
   analyzeSkinCss 가 그 구간을 원문에서 뺀다). fatal 은 잘라서
   고칠 수 없는 구조 문제다.
========================================================== */

function scanSkinCss(source, mode) {

  const strict = mode !== "repair";
  const lineStarts = buildSkinCssLineStarts(source);
  const fatal = [];

  const makeIssue = (fields, start, end) => {
    const position = locateSkinCssOffset(lineStarts, fields.at !== undefined ? fields.at : start);
    return {
      severity: fields.severity,
      category: fields.category,
      code: fields.code,
      message: fields.message,
      hint: fields.hint || "",
      line: position.line,
      column: position.column,
      snippet: buildSkinCssSnippet(source, start, end),
      start,
      end
    };
  };

  /* 1) 구조 — 괄호 짝 */
  const balance = checkSkinCssBlockBalance(source);

  if (balance.length) {

    balance.forEach((problem) => {
      const text = SKIN_CSS_STRUCTURE_MESSAGES[problem.code];
      fatal.push(makeIssue({
        severity: "error",
        category: "syntax",
        code: problem.code,
        message: text.message,
        hint: text.hint
      }, problem.offset, Math.min(source.length, problem.offset + 60)));
    });

    return { fatal, issues: [] };

  }

  /* 2) 파싱 */
  const parseErrors = [];

  const ast = csstree.parse(source, {
    positions: true,
    onParseError: (err) => parseErrors.push(err)
  });

  const declarations = [];
  const blockRaws = [];

  csstree.walk(ast, {
    enter(node) {

      if (node.type === "Declaration" && node.loc) {
        declarations.push({ node, start: node.loc.start.offset, end: node.loc.end.offset });
        return;
      }

      if (node.type === "Block" && node.children) {
        node.children.forEach((child) => {
          if (child.type === "Raw" && child.loc) {
            blockRaws.push({ node: child, start: child.loc.start.offset, end: child.loc.end.offset });
          }
        });
      }

    }
  });

  /*
    발견(finding)은 **잘라낼 구간 하나당 하나**다. 같은 선언에서
    두 가지가 걸리면(예: 안전하지 않은 url 두 개) 더 무거운 쪽 하나만
    남긴다 — 사용자에게 보이는 "제외한 선언" 목록이 선언 단위가 된다.
  */
  const findings = new Map();

  const addFinding = (issue) => {

    const key = `${issue.start}:${issue.end}`;
    const existing = findings.get(key);

    if (!existing || (existing.severity !== "error" && issue.severity === "error")) {
      findings.set(key, issue);
    }

  };

  const securitySeverity =
    strict ? "error" : "removed";

  const securityIssue = (code, message, hint, start, end, at) =>
    makeIssue({ severity: securitySeverity, category: "security", code, message, hint, at }, start, end);

  const syntaxTargets = new Set();

  const rawTextIsDangerous = (start, end) =>
    SKIN_CSS_DANGEROUS_RAW_PATTERN.test(source.slice(start, end));

  const findDeclarationTarget = (offset) => {

    let best = null;

    for (const target of declarations.concat(blockRaws)) {
      if (target.start <= offset && offset <= target.end) {
        if (!best || (target.end - target.start) < (best.end - best.start)) {
          best = target;
        }
      }
    }

    return best;

  };

  /* 3) 문법 오류 — 선언 안이면 그 선언만, 아니면 구조 오류 */
  parseErrors.forEach((err) => {

    const offset =
      typeof err.offset === "number" ? err.offset : 0;

    const target =
      findDeclarationTarget(offset);

    if (!target) {

      /*
        선택자 · @규칙 머리 · 최상위의 글자. 브라우저라면 그 규칙
        하나를 통째로 버리겠지만, csstree 의 복구 모양이 그 경계와
        같다고 보장할 수 없다 — 잘라서 고치지 않고 막는다.
      */
      fatal.push(makeIssue({
        severity: "error",
        category: "syntax",
        code: "invalid-rule",
        message: translateSkinCssParserMessage(err.message) + " (선택자나 @규칙의 머리 부분)",
        hint: "선택자와 @media 같은 규칙의 머리를 확인해 주세요. 이 부분은 선언 하나만 빼고 가져올 수 없습니다."
      }, offset, Math.min(source.length, offset + 60)));

      return;

    }

    if (syntaxTargets.has(target.node)) {
      return;
    }

    syntaxTargets.add(target.node);

    if (rawTextIsDangerous(target.start, target.end)) {
      addFinding(securityIssue(
        "dangerous-raw",
        "읽을 수 없는 선언 안에 javascript:/expression( ) 같은 실행 구문이 들어 있습니다",
        "이 선언을 지워 주세요. url()에는 https:// 주소나 상대 경로만 쓸 수 있습니다.",
        target.start,
        target.end,
        offset
      ));
      return;
    }

    const described =
      describeSkinCssDeclarationSyntax(source, target.start, target.end, err.message);

    addFinding(makeIssue({
      severity: "removed",
      category: "syntax",
      code: described.code,
      message: described.message,
      hint: described.hint,
      at: offset
    }, target.start, target.end));

  });

  /* 4) 보안 · 허용 범위 */

  const urlIssue = (value, start, end, at) => {

    if (isScriptSkinCssUrl(value)) {
      addFinding(securityIssue(
        "script-url",
        "javascript:/vbscript: 주소는 CSS에서 사용할 수 없습니다",
        "이 주소를 지워 주세요. url()에는 https:// 주소나 상대 경로만 쓸 수 있습니다.",
        start,
        end,
        at
      ));
      return;
    }

    if (!isSafeSkinCssUrl(value)) {
      addFinding(makeIssue({
        severity: "removed",
        category: "policy",
        code: "url-not-allowed",
        message: "https가 아닌 주소(data:, http:, blob: 등)는 url()에 쓸 수 없어 이 선언을 제외했습니다",
        hint: "https:// 주소를 쓰거나, 사진이라면 이미지 슬롯(Images 패널)으로 넣어 주세요.",
        at
      }, start, end));
    }

  };

  /* 선언이나 @규칙 — 안전하지 않은 값이 들어 있으면 잘라낼 단위 */
  const enclosingRange = (walkerContext, fallbackNode) => {

    const holder =
      walkerContext.declaration ||
      walkerContext.atrule ||
      fallbackNode;

    return holder && holder.loc
      ? { start: holder.loc.start.offset, end: holder.loc.end.offset }
      : null;

  };

  const checkCustomPropertyValue = (declaration, start, end) => {

    const rawValue =
      declaration.value && declaration.value.type === "Raw"
        ? declaration.value.value
        : csstree.generate(declaration.value);

    if (SKIN_CSS_DANGEROUS_RAW_PATTERN.test(rawValue)) {
      addFinding(securityIssue(
        "dangerous-custom-property",
        `custom property ${declaration.property} 에 javascript:/expression( ) 같은 실행 구문이 들어 있습니다`,
        "이 값을 지워 주세요.",
        start,
        end
      ));
      return;
    }

    /*
      custom property 값은 var() 로 다른 선언에 그대로 들어가므로
      url() 도 같은 규칙을 받아야 한다 — 예전에는 여기를 건너뛰어
      `--bg:url(http://…)` 가 https 규칙을 우회했다.
    */
    let valueAst = null;

    try {
      valueAst = csstree.parse(rawValue, { context: "value", onParseError: () => {} });
    } catch (err) {
      valueAst = null;
    }

    if (!valueAst) {
      return;
    }

    csstree.walk(valueAst, function (node) {

      if (node.type === "Url") {
        urlIssue(node.value, start, end, start);
        return;
      }

      if (
        node.type === "String" &&
        this.function &&
        SKIN_CSS_URL_STRING_FUNCTIONS.has(String(this.function.name).toLowerCase())
      ) {
        urlIssue(node.value, start, end, start);
        return;
      }

      if (node.type === "Function" && String(node.name).toLowerCase() === "expression") {
        addFinding(securityIssue(
          "expression",
          "expression()은 사용할 수 없습니다",
          "이 값을 지워 주세요.",
          start,
          end
        ));
      }

    });

  };

  csstree.walk(ast, function (node) {

    if (!node.loc) {
      return;
    }

    const start = node.loc.start.offset;
    const end = node.loc.end.offset;

    if (node.type === "Atrule" && String(node.name).toLowerCase() === "import") {
      addFinding(securityIssue(
        "import",
        "@import는 스킨 CSS에서 사용할 수 없습니다 — 검사를 거치지 않은 외부 스타일시트를 불러오게 됩니다",
        "@import 줄을 지우고, 필요한 규칙은 CSS에 직접 넣어 주세요.",
        start,
        end
      ));
      return;
    }

    if (node.type === "Declaration") {

      if (syntaxTargets.has(node)) {
        return;
      }

      const propertyLower = String(node.property).toLowerCase();

      if (SKIN_CSS_DANGEROUS_PROPERTY_NAMES.has(propertyLower)) {
        addFinding(securityIssue(
          "dangerous-property",
          `${node.property} 속성은 사용할 수 없습니다`,
          "이 선언을 지워 주세요.",
          start,
          end
        ));
        return;
      }

      if (propertyLower.startsWith("--")) {
        checkCustomPropertyValue(node, start, end);
        return;
      }

      if (node.value && node.value.type === "Raw") {

        if (rawTextIsDangerous(start, end)) {
          addFinding(securityIssue(
            "dangerous-raw",
            "읽을 수 없는 값 안에 javascript:/expression( ) 같은 실행 구문이 들어 있습니다",
            "이 선언을 지워 주세요.",
            start,
            end
          ));
          return;
        }

        addFinding(makeIssue({
          severity: "removed",
          category: "syntax",
          code: "unparsed-value",
          message: `${node.property} 의 값을 읽을 수 없어 이 선언을 제외했습니다`,
          hint: "값의 괄호·따옴표·쉼표를 확인해 주세요."
        }, start, end));

      }

      return;

    }

    /* 문법 오류로 이미 잘라낼 선언 안의 노드는 다시 보지 않는다 */
    if (this.declaration && syntaxTargets.has(this.declaration)) {
      return;
    }

    if (node.type === "Url") {

      /* @import 안의 url() 은 @import 판정이 이미 다룬다 */
      if (this.atrule && String(this.atrule.name).toLowerCase() === "import") {
        return;
      }

      const range = enclosingRange(this, node);
      urlIssue(node.value, range.start, range.end, start);
      return;

    }

    if (
      node.type === "String" &&
      this.function &&
      SKIN_CSS_URL_STRING_FUNCTIONS.has(String(this.function.name).toLowerCase())
    ) {
      const range = enclosingRange(this, node);
      urlIssue(node.value, range.start, range.end, start);
      return;
    }

    if (node.type === "Function" && String(node.name).toLowerCase() === "expression") {
      const range = enclosingRange(this, node);
      addFinding(securityIssue(
        "expression",
        "expression()은 사용할 수 없습니다",
        "이 선언을 지워 주세요.",
        range.start,
        range.end,
        start
      ));
      return;
    }

    if (
      node.type === "Rule" &&
      node.prelude &&
      node.prelude.type === "SelectorList"
    ) {

      const selectors =
        node.prelude.children.toArray().filter((selector) => selector.loc);

      const protectedIndexes = [];

      selectors.forEach((selector, index) => {
        if (SKIN_CSS_PROTECTED_SELECTOR_PATTERN.test(csstree.generate(selector))) {
          protectedIndexes.push(index);
        }
      });

      if (!protectedIndexes.length) {
        return;
      }

      const protectedIssue = (cutStart, cutEnd, selector) =>
        makeIssue({
          severity: "removed",
          category: "policy",
          code: "protected-selector",
          message: "글 본문 보호 영역을 겨냥하는 선택자는 쓸 수 없어 제외했습니다",
          hint: "글 본문 모양은 Quote Preset(글 스타일)에서 바꿔 주세요.",
          at: selector.loc.start.offset
        }, cutStart, cutEnd);

      if (protectedIndexes.length === selectors.length) {
        addFinding(protectedIssue(start, end, selectors[0]));
        return;
      }

      /*
        목록 안의 일부만 — 선택자 목록 **전체**를 남는 선택자들로 다시
        쓴다. 선택자마다 따로 잘라내면 두 개 이상일 때 쉼표가 남아
        (`a, {…}`) 규칙 전체가 깨진다.
      */
      const listStart = selectors[0].loc.start.offset;
      const listEnd = selectors[selectors.length - 1].loc.end.offset;

      const survivors =
        selectors
          .filter((selector, index) => protectedIndexes.indexOf(index) === -1)
          .map((selector) => source.slice(selector.loc.start.offset, selector.loc.end.offset).trim());

      const first = selectors[protectedIndexes[0]];

      const issue =
        protectedIssue(first.loc.start.offset, selectors[protectedIndexes[protectedIndexes.length - 1]].loc.end.offset, first);

      issue.snippet =
        protectedIndexes
          .map((index) => buildSkinCssSnippet(source, selectors[index].loc.start.offset, selectors[index].loc.end.offset))
          .join(", ");

      issue.cut = { start: listStart, end: listEnd, replacement: survivors.join(", ") };

      addFinding(issue);

    }

  });

  const issues =
    Array.from(findings.values()).sort((a, b) => a.start - b.start);

  return { fatal, issues };

}


/* =========================================================
   원문에서 구간 잘라내기

   선언은 끝의 `;` 까지 함께 뺀다(선언의 범위에는 `;` 가 들어 있지
   않다). 겹치는 구간은 바깥 구간 하나로 합친다.
========================================================== */

function cutSkinCssRanges(source, issues) {

  const expanded =
    issues
      .map((issue) => {

        /* 선택자 목록 다시 쓰기 — issue.cut 이 있으면 그 구간을 바꾼다 */
        if (issue.cut) {
          return { start: issue.cut.start, end: issue.cut.end, replacement: issue.cut.replacement };
        }

        let end = issue.end;
        let probe = end;

        while (probe < source.length && /[ \t]/.test(source[probe])) {
          probe += 1;
        }

        if (source[probe] === ";") {
          end = probe + 1;
        }

        return { start: issue.start, end, replacement: "" };

      })
      .sort((a, b) => a.start - b.start || b.end - a.end);

  const merged = [];

  expanded.forEach((range) => {

    const last = merged[merged.length - 1];

    if (last && range.start < last.end) {
      /* 바깥 구간이 이긴다(규칙 통째 제거 안의 선언 제거 등) */
      if (range.end > last.end) {
        last.end = range.end;
        last.replacement = "";
      }
      return;
    }

    merged.push({ ...range });

  });

  let output = "";
  let cursor = 0;

  merged.forEach((range) => {
    output += source.slice(cursor, range.start) + range.replacement;
    cursor = range.end;
  });

  return output + source.slice(cursor);

}


/* =========================================================
   analyzeSkinCss(rawCss, { mode }) -> SkinCssReport

   mode "strict"(기본) — Import · Code 적용 · AI 결과
   mode "repair"       — 저장 직전 · 렌더 시점

   SkinCssReport = {
     ok,          strict: 오류(error)가 없다 / repair: 구조가 멀쩡하다
     mode,
     css,         그 부분을 잘라낸 원문(ok 가 아니면 "")
     changed,     잘라낸 것이 있는가
     issues,      전부(위치 순)
     errors,      severity:"error"
     removed,     severity:"removed"
     summary      한 줄 요약(첫 오류 + 개수)
   }
========================================================== */

export function analyzeSkinCss(rawCss, options = {}) {

  const mode =
    options.mode === "repair" ? "repair" : "strict";

  const source =
    typeof rawCss === "string" ? rawCss : String(rawCss || "");

  const scan =
    scanSkinCss(source, mode);

  const finish = (ok, css, issues) => {

    const sorted =
      issues.slice().sort((a, b) => a.start - b.start);

    const errors =
      sorted.filter((issue) => issue.severity === "error");

    const removed =
      sorted.filter((issue) => issue.severity === "removed");

    const report = {
      ok,
      mode,
      css: ok ? css : "",
      changed: ok && css !== source,
      issues: sorted,
      errors,
      removed,
      summary: ""
    };

    report.summary = summarizeSkinCssReport(report);

    return report;

  };

  if (scan.fatal.length) {
    return finish(false, "", scan.fatal.concat(scan.issues));
  }

  const hasErrors =
    scan.issues.some((issue) => issue.severity === "error");

  if (hasErrors) {
    return finish(false, "", scan.issues);
  }

  if (!scan.issues.length) {
    return finish(true, source, []);
  }

  const cleaned =
    cutSkinCssRanges(source, scan.issues);

  /*
    ★ 고정점 확인 — 잘라낸 결과를 한 번 더 검사해서 **아무것도**
    걸리지 않을 때만 쓴다. 잘라낸 자리 때문에 앞뒤가 새로 붙어 다른
    문제가 생겼다면(이론상) 그 결과를 믿지 않고 막는다.
  */
  const verify =
    scanSkinCss(cleaned, "repair");

  if (verify.fatal.length || verify.issues.length) {

    return finish(false, "", scan.issues.concat([{
      severity: "error",
      category: "syntax",
      code: "cleanup-unstable",
      message: "문제가 되는 선언을 뺀 결과를 다시 확인하지 못했습니다",
      hint: "아래 목록의 선언을 직접 고친 뒤 다시 가져와 주세요.",
      line: 1,
      column: 1,
      snippet: "",
      start: 0,
      end: 0
    }]));

  }

  return finish(true, cleaned, scan.issues);

}


const SKIN_CSS_CATEGORY_LABELS = {
  syntax: "문법 오류",
  security: "보안 정책",
  policy: "허용되지 않는 값"
};

/* "CSS 129행 11열 · 문법 오류: … — content:"“”; position:absolute" */
export function formatSkinCssIssue(issue) {

  if (!issue) {
    return "";
  }

  const label =
    issue.category === "security" && issue.severity === "error"
      ? "보안 정책 차단"
      : (SKIN_CSS_CATEGORY_LABELS[issue.category] || "문제");

  return (
    `CSS ${issue.line}행 ${issue.column}열 · ${label}: ${issue.message}` +
    (issue.snippet ? ` — ${issue.snippet}` : "")
  );

}

export function summarizeSkinCssReport(report) {

  if (!report) {
    return "";
  }

  if (report.errors.length) {

    const first = formatSkinCssIssue(report.errors[0]);

    return report.errors.length > 1
      ? `${first} (오류 ${report.errors.length}개 중 첫 번째)`
      : first;

  }

  if (report.removed.length) {
    return `CSS에서 ${report.removed.length}곳을 제외하고 가져옵니다.`;
  }

  return "";

}


/* =========================================================
   validateAndScopeSkinCss(rawCss, options) -> { css, ok, warnings, scopeClass, report }

   렌더 시점 경로다(skin-render.js · sandbox 프레임). 이미 저장된
   CSS 를 받으므로 repair 로 판정한다 — 구조가 깨진 경우만 ok:false
   (css:"", 설계 문서 10절 "CSS validation 실패 → CSS만 빈 문자열로
   대체")이고, 나머지는 문제된 선언만 빠진 채 그려진다.

   options.namespace: 주어지면 @keyframes 이름을 이 렌더 인스턴스
   전용으로 격리한다(위 설명 참고). 저장 시점 검증(Slice 3 원래
   용도)에서는 생략 — 저장되는 CSS는 원래 이름을 유지한다.

   warnings 는 사람이 읽는 문장 배열이다(예전과 같은 모양).
========================================================== */

export function validateAndScopeSkinCss(rawCss, options = {}) {

  const { namespace } = options;
  const scopeClass = getSkinCssScopeClass(namespace);

  const report =
    analyzeSkinCss(rawCss, { mode: "repair" });

  if (!report.ok) {
    return {
      css: "",
      ok: false,
      warnings: report.errors.map(formatSkinCssIssue),
      scopeClass,
      report
    };
  }

  const ast = csstree.parse(report.css, { positions: false });

  /* 스코프를 붙이기 **전에** 읽는다 — 붙인 뒤에는 selector 가 두
     칸짜리가 아니게 된다(IMAGE-CROP-PRIORITY-1, 아래 함수 참고). */
  const editRules =
    collectSkinEditIdRules(ast);

  /* 남은 모든 실제 selector에 스코프 강제 적용. @keyframes
     내부의 selector(0%/50%/from/to 등)는 DOM selector가 아니라
     타이밍 selector이므로 절대 접두어를 붙이면 안 된다 —
     csstree 워커의 `this.atrule` 컨텍스트로 감지해서 제외한다. */
  csstree.walk(ast, {
    visit: "Selector",
    enter(node) {

      if (this.atrule && isSkinCssKeyframesAtruleName(this.atrule.name)) {
        return;
      }

      scopeSkinCssSelector(node, scopeClass);

    }
  });

  /* @keyframes 이름 격리(namespace가 주어졌을 때만) */
  namespaceSkinCssKeyframes(ast, namespace);

  return {
    css: csstree.generate(ast),
    ok: true,
    warnings: report.removed.map(formatSkinCssIssue),
    scopeClass,
    report,
    editRules
  };

}


/* =========================================================
   collectSkinEditIdRules(ast) -> { [editId]: { [property]: { value, important } } }

   IMAGE-CROP-PRIORITY-1. Studio 직접 편집이 쓰는 규칙은 언제나

     [data-imory-edit-id="X"][data-imory-edit-id="X"] { ... }

   한 모양이다(studio/inspector/studio-inspector-model.js
   buildInspectorEditSelector). 렌더러는 그중 **자르기 규칙**을 읽어
   스킨 CSS 보다 강한 보호 규칙을 만든다(skin/skin-render.js
   buildSkinCropGuardCss). 그래서 여기서는 판정 없이 "그 모양의
   최상위 규칙"만 모아 준다.

   - 최상위만 본다. Studio 는 규칙을 언제나 맨 뒤 최상위에 쓴다.
     @media 안의 같은 모양은 스킨 작성자가 쓴 것이다.
   - 같은 id 가 둘이면 **뒤의 것 하나**가 이긴다 — Studio 가 규칙을
     읽는 방식(readInspectorEditDeclarations, 마지막 일치)과 같다.
   - 값은 repair 를 통과한 AST 에서 다시 만든 글자다. 쓰는 쪽이
     다시 모양을 검사한다(렌더러는 숫자 % 만 받는다).
========================================================== */

const SKIN_EDIT_ID_ATTR = "data-imory-edit-id";

function skinEditIdOfAttributePart(part) {

  if (
    !part ||
    part.type !== "AttributeSelector" ||
    !part.name ||
    part.name.name !== SKIN_EDIT_ID_ATTR ||
    part.matcher !== "=" ||
    part.flags ||
    !part.value
  ) {
    return null;
  }

  if (part.value.type === "String") {
    return String(part.value.value);
  }

  if (part.value.type === "Identifier") {
    return String(part.value.name);
  }

  return null;

}

function collectSkinEditIdRules(ast) {

  const rules = Object.create(null);

  if (!ast || !ast.children) {
    return rules;
  }

  ast.children.forEach((node) => {

    if (
      node.type !== "Rule" ||
      !node.prelude ||
      node.prelude.type !== "SelectorList" ||
      !node.block
    ) {
      return;
    }

    const selectors =
      node.prelude.children.toArray();

    if (selectors.length !== 1 || !selectors[0].children) {
      return;
    }

    const parts =
      selectors[0].children.toArray();

    if (parts.length !== 2) {
      return;
    }

    const first = skinEditIdOfAttributePart(parts[0]);
    const second = skinEditIdOfAttributePart(parts[1]);

    if (!first || first !== second) {
      return;
    }

    const declarations = Object.create(null);

    node.block.children.forEach((declaration) => {

      if (declaration.type !== "Declaration" || !declaration.value) {
        return;
      }

      declarations[String(declaration.property).toLowerCase()] = {
        value: csstree.generate(declaration.value).trim(),
        important: !!declaration.important
      };

    });

    rules[first] = declarations;

  });

  return rules;

}

/* 나머지 skin/*.js가 전역 classic script인 것과 동일한 방식으로
   섞여 쓰일 수 있도록 window에도 노출한다(이 파일만 type="module"). */
if (typeof window !== "undefined") {
  window.validateAndScopeSkinCss = validateAndScopeSkinCss;
  window.analyzeSkinCss = analyzeSkinCss;
  window.formatSkinCssIssue = formatSkinCssIssue;
  window.summarizeSkinCssReport = summarizeSkinCssReport;
}
