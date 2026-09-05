/* =========================================================
   SKIN QUESTIONNAIRE (Studio 전용, AI_SKIN_PHASE1B_DESIGN.md 7-4절)

   mountSkinQuestionnaire(container, { onSubmit }) 하나만
   내보낸다. redirect 대상/RPC 호출/에러 문구 UX는 전혀 모른다 —
   답변 상태를 들고 있다가 제출 시 onSubmit(answers)를 호출하고
   그 Promise만 지켜본다(호출자가 실패 시 반드시 throw해야 재시도
   UI가 정확히 동작한다).

   이 모듈의 유일한 소비처는 studio/studio-state.js다 — onboarding/
   HOME popup 어디에도 마운트하지 않는다(7절).

   classic script — window.mountSkinQuestionnaire로 노출된다.
   의존: 없음(순수 DOM 조립).
========================================================== */

const SKIN_QUESTIONNAIRE_QUESTIONS = [

  {
    name: "layoutPreference",
    title: "레이아웃",
    options: [
      { value: "one-column", label: "1단", wireframe: "layout-one" },
      { value: "two-column", label: "2단", wireframe: "layout-two" },
      { value: "three-column", label: "3단", wireframe: "layout-three" }
    ]
  },

  {
    name: "baseAppearance",
    title: "전체 분위기",
    options: [
      { value: "light", label: "light", wireframe: "appearance-light" },
      { value: "dark", label: "dark", wireframe: "appearance-dark" }
    ]
  },

  {
    name: "homeStyle",
    title: "HOME 스타일",
    options: [
      { value: "intro", label: "INTRO", wireframe: "home-intro" },
      { value: "index", label: "INDEX", wireframe: "home-index" },
      { value: "profile", label: "PROFILE", wireframe: "home-profile" }
    ]
  }

];


const SKIN_QUESTIONNAIRE_DEFAULT_ANSWERS = {
  layoutPreference: "one-column",
  baseAppearance: "light",
  homeStyle: "intro"
};


function buildSkinQuestionnaireWireframe(wireframeKey) {

  const wireframe =
    document.createElement("div");

  wireframe.className =
    `skin-q-wireframe skin-q-wireframe--${wireframeKey}`;


  const blockCount =
    wireframeKey === "layout-one" ? 1 :
    wireframeKey === "layout-two" ? 2 :
    wireframeKey === "layout-three" ? 3 :
    wireframeKey === "home-index" ? 4 :
    wireframeKey === "home-profile" ? 3 :
    wireframeKey === "home-intro" ? 2 :
    1; /* appearance-light / appearance-dark — 색 스와치 1개 */


  for (let i = 0; i < blockCount; i++) {

    const block =
      document.createElement("span");

    block.className =
      "skin-q-wireframe-block";

    wireframe.appendChild(
      block
    );

  }


  return wireframe;

}


function buildSkinQuestionnaireOption(
  question,
  option,
  isChecked,
  onSelect
) {

  const optionLabel =
    document.createElement("label");

  optionLabel.className =
    "skin-q-option" +
    (isChecked ? " skin-q-option--selected" : "");


  const input =
    document.createElement("input");

  input.type =
    "radio";

  input.name =
    question.name;

  input.value =
    option.value;

  input.checked =
    isChecked;

  input.className =
    "skin-q-option-input";


  input.addEventListener(
    "change",
    () => {

      onSelect(
        option.value
      );

    }
  );


  optionLabel.appendChild(
    buildSkinQuestionnaireWireframe(
      option.wireframe
    )
  );


  const optionText =
    document.createElement("span");

  optionText.className =
    "skin-q-option-label";

  optionText.textContent =
    option.label;


  optionLabel.append(
    input,
    optionText
  );


  return optionLabel;

}


function buildSkinQuestionnaireGroup(
  question,
  answers,
  refreshSelectionState
) {

  const group =
    document.createElement("fieldset");

  group.className =
    "skin-q-group";


  const legend =
    document.createElement("legend");

  legend.className =
    "skin-q-group-title";

  legend.textContent =
    question.title;

  group.appendChild(
    legend
  );


  const optionsRow =
    document.createElement("div");

  optionsRow.className =
    "skin-q-options";

  group.appendChild(
    optionsRow
  );


  question.options.forEach(
    (option) => {

      const optionEl =
        buildSkinQuestionnaireOption(
          question,
          option,
          answers[question.name] === option.value,
          (value) => {

            answers[question.name] =
              value;

            refreshSelectionState();

          }
        );

      optionsRow.appendChild(
        optionEl
      );

    }
  );


  return group;

}


function mountSkinQuestionnaire(
  container,
  { onSubmit } = {}
) {

  if (!container) {

    throw new Error(
      "mountSkinQuestionnaire: container is required"
    );

  }


  container.innerHTML =
    "";

  const answers =
    { ...SKIN_QUESTIONNAIRE_DEFAULT_ANSWERS };


  const root =
    document.createElement("div");

  root.className =
    "skin-questionnaire";


  const heading =
    document.createElement("p");

  heading.className =
    "skin-questionnaire-heading";

  heading.textContent =
    "몇 가지만 답하면 첫 Skin을 만들어 드려요.";

  root.appendChild(
    heading
  );


  const groupEls =
    [];


  function refreshSelectionState() {

    groupEls.forEach(
      (groupEl) => {

        groupEl
          .querySelectorAll(
            ".skin-q-option"
          )
          .forEach(
            (optionEl) => {

              const input =
                optionEl.querySelector(
                  "input"
                );

              optionEl.classList.toggle(
                "skin-q-option--selected",
                input.checked
              );

            }
          );

      }
    );

  }


  SKIN_QUESTIONNAIRE_QUESTIONS.forEach(
    (question) => {

      const groupEl =
        buildSkinQuestionnaireGroup(
          question,
          answers,
          refreshSelectionState
        );

      groupEls.push(
        groupEl
      );

      root.appendChild(
        groupEl
      );

    }
  );


  const submitRow =
    document.createElement("div");

  submitRow.className =
    "skin-questionnaire-submit-row";

  root.appendChild(
    submitRow
  );


  const submitButton =
    document.createElement("button");

  submitButton.type =
    "button";

  submitButton.className =
    "skin-questionnaire-submit-button";

  submitButton.textContent =
    "이 취향으로 시작하기";

  submitRow.appendChild(
    submitButton
  );


  const statusMessage =
    document.createElement("p");

  statusMessage.className =
    "skin-questionnaire-status";

  submitRow.appendChild(
    statusMessage
  );


  async function handleSubmit() {

    submitButton.disabled =
      true;

    statusMessage.textContent =
      "만드는 중...";

    statusMessage.classList.remove(
      "skin-questionnaire-status--error"
    );


    try {

      await onSubmit(
        { ...answers }
      );

    }

    catch (err) {

      console.error(
        "[skin-questionnaire] onSubmit failed:",
        err
      );

      statusMessage.textContent =
        "Skin을 만들지 못했어요. 다시 시도해주세요.";

      statusMessage.classList.add(
        "skin-questionnaire-status--error"
      );

      submitButton.disabled =
        false;

    }

  }


  submitButton.addEventListener(
    "click",
    handleSubmit
  );


  container.appendChild(
    root
  );

}


if (typeof window !== "undefined") {

  window.mountSkinQuestionnaire =
    mountSkinQuestionnaire;

}
