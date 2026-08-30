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

   block-defaults.js보다 뒤에 로드되어야 함
   (CUSTOMIZE_LAYOUT_VERSION, CUSTOMIZE_DEFAULT_THEME 참조).
========================================================== */

const DEFAULT_LAYOUT =
  {

    version: CUSTOMIZE_LAYOUT_VERSION,

    theme: {
      ...CUSTOMIZE_DEFAULT_THEME
    },

    blocks: [

      {
        id: "8f14e45f-ceea-467e-add1-0000000000c1",
        type: "container",
        props: {
          direction: "column",
          gap: "md"
        },
        children: [

          {
            id: "8f14e45f-ceea-467e-add1-0000000000c2",
            type: "image",
            props: {
              src: "",
              alt: "cover image",
              ratio: "landscape"
            }
          },

          {
            id: "8f14e45f-ceea-467e-add1-0000000000c3",
            type: "text",
            props: {
              content: "이름을 입력하세요",
              size: "lg",
              align: "center"
            }
          },

          {
            id: "8f14e45f-ceea-467e-add1-0000000000c4",
            type: "text",
            props: {
              content: "한 줄 소개를 입력하세요",
              size: "sm",
              align: "center"
            }
          },

          {
            id: "8f14e45f-ceea-467e-add1-0000000000c5",
            type: "button",
            props: {
              variant: "action",
              label: "more",
              actionName: "openProfile",
              href: ""
            }
          }

        ]
      },

      {
        id: "8f14e45f-ceea-467e-add1-0000000000c6",
        type: "divider",
        props: {
          style: "solid"
        }
      },

      {
        id: "8f14e45f-ceea-467e-add1-0000000000c7",
        type: "spacer",
        props: {
          size: "md"
        }
      }

    ]

  };
