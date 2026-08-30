/* =========================================================
   CUSTOMIZE RENDERER - DEFAULT LAYOUT

   layout_json이 아직 없는 상태(신규 customize home)에 쓸 최소
   cover/profile 예시. 특정 sua 데이터(예: about/notice/ng
   텍스트)는 포함하지 않고, 누구나 채워 넣을 자리표시자만 둔다.

   image.src는 일부러 빈 문자열로 둔다 — "아직 이미지를
   설정하지 않은 상태"이며, 네트워크 접근 없이 순수 데이터로만
   존재해야 하는 DEFAULT_LAYOUT이 외부 URL에 의존하지 않게 하기
   위함(validate-layout.js/render-layout.js 모두 빈 src는
   "없음"으로 안전하게 처리함).

   v2: 숫자 값은 전부 이전 sm/md/lg enum이 매핑되던 값과 동일하게
   맞춰서(fontSize 14/22, gap/spacer 16/24 등) 시각적 결과가
   달라지지 않게 했다. 유일한 의도적 변경은 text.lineHeight=1.5
   (이전엔 값 자체가 없어 브라우저 기본 normal(~1.2)이었음 —
   가독성 개선 목적).

   v3: theme.contentWidth가 빠지고(CUSTOMIZE_DEFAULT_THEME에서
   이미 제거됨) contentArea가 추가됐다 — CUSTOMIZE_DEFAULT_CONTENT_AREA
   그대로 써서 이전 medium(600px) 폭과 동일한 시각 결과를 유지한다.

   block-defaults.js보다 뒤에 로드되어야 함
   (CUSTOMIZE_LAYOUT_VERSION, CUSTOMIZE_DEFAULT_THEME,
   CUSTOMIZE_DEFAULT_CONTENT_AREA 참조).
========================================================== */

const DEFAULT_LAYOUT =
  {

    version: CUSTOMIZE_LAYOUT_VERSION,

    theme: {
      ...CUSTOMIZE_DEFAULT_THEME
    },

    contentArea: {
      ...CUSTOMIZE_DEFAULT_CONTENT_AREA
    },

    blocks: [

      {
        id: "8f14e45f-ceea-467e-add1-0000000000c1",
        type: "container",
        props: {
          direction: "column",
          align: "stretch",
          gap: 16,
          padding: 0,
          maxWidth: "",
          background: "",
          borderWidth: 0,
          borderColor: "",
          borderStyle: "solid",
          borderRadius: 0,
          backgroundOpacity: 100
        },
        children: [

          {
            id: "8f14e45f-ceea-467e-add1-0000000000c2",
            type: "image",
            props: {
              src: "",
              alt: "cover image",
              width: "",
              height: "",
              maxWidth: "",
              align: "center",
              objectFit: "cover",
              action: { type: "none", href: "", targetPageId: "profile" }
            }
          },

          {
            id: "8f14e45f-ceea-467e-add1-0000000000c3",
            type: "text",
            props: {
              content: "이름을 입력하세요",
              fontSize: 22,
              color: "",
              fontWeight: 400,
              align: "center",
              letterSpacing: 0,
              lineHeight: 1.5,
              action: { type: "none", href: "", targetPageId: "profile" }
            }
          },

          {
            id: "8f14e45f-ceea-467e-add1-0000000000c4",
            type: "text",
            props: {
              content: "한 줄 소개를 입력하세요",
              fontSize: 14,
              color: "",
              fontWeight: 400,
              align: "center",
              letterSpacing: 0,
              lineHeight: 1.5,
              action: { type: "none", href: "", targetPageId: "profile" }
            }
          },

          {
            id: "8f14e45f-ceea-467e-add1-0000000000c5",
            type: "button",
            props: {
              variant: "action",
              label: "more",
              action: { type: "internal", href: "", targetPageId: "profile" }
            }
          }

        ]
      },

      {
        id: "8f14e45f-ceea-467e-add1-0000000000c6",
        type: "divider",
        props: {
          style: "solid",
          thickness: 1,
          color: "",
          widthPercent: 100
        }
      },

      {
        id: "8f14e45f-ceea-467e-add1-0000000000c7",
        type: "spacer",
        props: {
          height: 24
        }
      }

    ]

  };
