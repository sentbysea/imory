/* =========================================================
   QUOTE - PRESET LIST AREA / ACCORDION

   admin-quote.js 분할본. DOM 참조/상태는
   admin-quote-refs.js에 있음(반드시 먼저 로드돼야 함).
========================================================== */


/* =========================================================
   PRESET LIST AREA
========================================================== */

function ensureQuotePresetList() {

  if (quotePresetList) {
    return;
  }


  const presetSection =
    quotePresetName
      ?.closest(
        ".quote-accordion"
      );


  const presetContent =
    presetSection
      ?.querySelector(
        ".quote-accordion-content"
      );


  if (!presetContent) {
    return;
  }


  const wrap =
    document.createElement(
      "div"
    );

  wrap.className =
    "quote-preset-list-wrap";


  const label =
    document.createElement(
      "div"
    );

  label.className =
    "quote-setting-label";

  label.textContent =
    "SAVED PRESETS";


  quotePresetList =
    document.createElement(
      "div"
    );

  quotePresetList.id =
    "quotePresetList";

  quotePresetList.className =
    "quote-preset-list";


  wrap.append(
    label,
    quotePresetList
  );


  presetContent.appendChild(
    wrap
  );

}


/* =========================================================
   ACCORDION
========================================================== */

function getQuoteAccordionKey(
  section,
  index
) {

  const title =
    section.querySelector(
      ".quote-accordion-title"
    );


  const name =
    title
      ?.textContent
      ?.trim() ||
    `section-${index}`;


  return (
    `quote-accordion-${name}`
  );

}


function saveQuoteAccordionState() {

  quoteAccordionSections.forEach(
    (
      section,
      index
    ) => {

      const key =
        getQuoteAccordionKey(
          section,
          index
        );


      const isOpen =
        section.classList.contains(
          "is-open"
        );


      localStorage.setItem(
        key,
        isOpen
          ? "open"
          : "closed"
      );

    }
  );

}


function restoreQuoteAccordionState() {

  quoteAccordionSections.forEach(
    (
      section,
      index
    ) => {

      const key =
        getQuoteAccordionKey(
          section,
          index
        );


      const saved =
        localStorage.getItem(
          key
        );


      if (saved === null) {
        return;
      }


      const shouldOpen =
        saved === "open";


      const content =
        section.querySelector(
          ".quote-accordion-content"
        );


      const icon =
        section.querySelector(
          ".quote-accordion-icon"
        );


      section.classList.toggle(
        "is-open",
        shouldOpen
      );


      if (content) {

        content.hidden =
          !shouldOpen;

      }


      if (icon) {

        icon.textContent =
          shouldOpen
            ? "−"
            : "+";

      }

    }
  );

}


quoteAccordionToggles.forEach(
  toggle => {

    toggle.addEventListener(
      "click",
      () => {

        const section =
          toggle.closest(
            ".quote-accordion"
          );


        if (!section) {
          return;
        }


        const content =
          section.querySelector(
            ".quote-accordion-content"
          );


        const icon =
          toggle.querySelector(
            ".quote-accordion-icon"
          );


        const isOpen =
          section.classList.contains(
            "is-open"
          );


        const nextOpen =
          !isOpen;


        section.classList.toggle(
          "is-open",
          nextOpen
        );


        if (content) {

          content.hidden =
            !nextOpen;

        }


        if (icon) {

          icon.textContent =
            nextOpen
              ? "−"
              : "+";

        }


        saveQuoteAccordionState();

      }
    );

  }
);


