/* =========================================================
   ADMIN - INQUIRY (사용자 → 운영자 문의)

   /admin/ 의 04 INQUIRY 화면. 준비 화면(coming soon)이던 자리에
   실제 문의 폼이 들어간다.

     사진 첨부(여러 장, 최대 5장) + 내용 textarea + 오른쪽 아래 send

   보낸 문의는 imory-ops 대시보드의 INQUIRY 탭에서 운영자가 읽는다
   (닉네임 + 내용 + 첨부 사진).

   DB: supabase/migrations/20260913180000_create_inquiries.sql
     - 사진은 비공개 버킷 inquiry-images 의 "<user_id>/<uuid>.<ext>"
     - 문의 행은 submit_inquiry() 로만 만들어진다(테이블 직접 쓰기 없음)

   ★ 보내기 순서 — 사진 먼저, 행은 마지막

   submit_inquiry() 가 경로마다 "내 폴더인지 / 실제로 있는지"를 다시
   확인하므로, 사진이 먼저 올라가 있어야 한다. 그래서 실패는 두
   갈래로 나뉜다:

     업로드 실패   이미 올라간 사진을 지우고 아무 행도 만들지 않는다.
     RPC 실패      마찬가지로 방금 올린 사진을 전부 지운다.

   어느 쪽이든 "보냈다"고 말하지 않는다.

   supabaseClient / prepareImoryUploadImage / imoryEtcStripImageExifEnabled
   는 admin/index.html 이 이 파일보다 먼저 로드한다.
========================================================== */


const INQUIRY_BUCKET =
  "inquiry-images";


const INQUIRY_MAX_IMAGES =
  5;


const INQUIRY_MAX_BODY_LENGTH =
  5000;


/*
  DB 쪽 버킷 allowed_mime_types 와 같은 집합. 여기서 한 번 거르는
  것은 사용자에게 이유를 바로 알려주기 위해서고, 실제 강제는
  버킷/정책이 한다.
*/

const INQUIRY_EXTENSION_BY_MIME =
  {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif"
  };


const inquiryFileInput =
  document.getElementById(
    "inquiryFileInput"
  );


const inquiryPreviewList =
  document.getElementById(
    "inquiryPreviewList"
  );


const inquiryAttachHint =
  document.getElementById(
    "inquiryAttachHint"
  );


const inquiryBodyInput =
  document.getElementById(
    "inquiryBodyInput"
  );


const inquirySendButton =
  document.getElementById(
    "inquirySendButton"
  );


const inquiryMessage =
  document.getElementById(
    "inquiryMessage"
  );


/*
  아직 올리지 않은 첨부들. { file, previewUrl } 만 들고 있다가
  send 를 누를 때 한꺼번에 올린다 — 고르기만 하고 보내지 않은
  사진이 저장소에 남지 않게.
*/

let inquiryAttachments =
  [];


let inquirySending =
  false;



/* =========================================================
   메시지
========================================================== */

function setInquiryMessage(
  text
) {

  if (!inquiryMessage) {

    return;

  }


  inquiryMessage.textContent =
    text || "";

}



/* =========================================================
   첨부 목록 그리기
========================================================== */

function renderInquiryAttachments() {

  if (!inquiryPreviewList) {

    return;

  }


  inquiryPreviewList.innerHTML =
    "";


  inquiryAttachments.forEach(
    (attachment, index) => {

      const item =
        document.createElement(
          "div"
        );

      item.className =
        "inquiry-preview-item";


      const image =
        document.createElement(
          "img"
        );

      image.className =
        "inquiry-preview-image";

      image.src =
        attachment.previewUrl;

      image.alt =
        attachment.file.name ||
        "attached image";


      const remove =
        document.createElement(
          "button"
        );

      remove.className =
        "inquiry-preview-remove";

      remove.type =
        "button";

      remove.textContent =
        "×";

      remove.setAttribute(
        "aria-label",
        "첨부 사진 빼기"
      );

      remove.dataset.index =
        String(index);


      item.appendChild(image);
      item.appendChild(remove);


      inquiryPreviewList.appendChild(
        item
      );

    }
  );


  if (inquiryAttachHint) {

    inquiryAttachHint.textContent =
      `${inquiryAttachments.length} / ${INQUIRY_MAX_IMAGES}`;

  }

}



/* =========================================================
   사진 고르기 (여러 장)
========================================================== */

inquiryFileInput
  ?.addEventListener(
    "change",
    (event) => {

      const chosen =
        Array.from(
          event.target.files ||
          []
        );


      /* 같은 파일을 다시 골라도 change 가 뜨게 즉시 비운다. */

      event.target.value =
        "";


      if (chosen.length === 0) {

        return;

      }


      setInquiryMessage(
        ""
      );


      let rejectedType =
        false;

      let overflow =
        false;


      chosen.forEach(
        (file) => {

          if (
            !INQUIRY_EXTENSION_BY_MIME[file.type]
          ) {

            rejectedType =
              true;


            return;

          }


          if (
            inquiryAttachments.length >=
            INQUIRY_MAX_IMAGES
          ) {

            overflow =
              true;


            return;

          }


          inquiryAttachments.push({
            file,
            previewUrl:
              URL.createObjectURL(
                file
              )
          });

        }
      );


      renderInquiryAttachments();


      if (rejectedType) {

        setInquiryMessage(
          "png · jpg · webp · gif 사진만 첨부할 수 있습니다."
        );

      }

      else if (overflow) {

        setInquiryMessage(
          `사진은 최대 ${INQUIRY_MAX_IMAGES}장까지 첨부할 수 있습니다.`
        );

      }

    }
  );



/* =========================================================
   첨부 빼기
========================================================== */

inquiryPreviewList
  ?.addEventListener(
    "click",
    (event) => {

      const button =
        event.target.closest(
          ".inquiry-preview-remove"
        );


      if (
        !button ||
        inquirySending
      ) {

        return;

      }


      const index =
        Number(
          button.dataset.index
        );


      const removed =
        inquiryAttachments[index];


      if (!removed) {

        return;

      }


      URL.revokeObjectURL(
        removed.previewUrl
      );


      inquiryAttachments.splice(
        index,
        1
      );


      renderInquiryAttachments();

    }
  );



/* =========================================================
   올린 사진 되돌리기

   보내기가 끝까지 성공하지 못하면 방금 올린 객체를 지운다.
   (지우기 자체가 실패해도 접근 경계는 그대로다 — 그 파일을 읽을
   수 있는 사람은 여전히 본인과 운영자뿐이다.)
========================================================== */

async function removeUploadedInquiryImages(
  paths
) {

  if (
    !paths ||
    paths.length === 0
  ) {

    return;

  }


  const {
    error
  } =
    await supabaseClient
      .storage
      .from(
        INQUIRY_BUCKET
      )
      .remove(
        paths
      );


  if (error) {

    console.error(
      "inquiry image cleanup error:",
      error
    );

  }

}



/* =========================================================
   보내기
========================================================== */

async function sendInquiry() {

  if (inquirySending) {

    return;

  }


  const body =
    (inquiryBodyInput?.value || "")
      .trim();


  if (body.length === 0) {

    setInquiryMessage(
      "문의 내용을 입력해주세요."
    );


    return;

  }


  if (
    body.length >
    INQUIRY_MAX_BODY_LENGTH
  ) {

    setInquiryMessage(
      `문의 내용은 ${INQUIRY_MAX_BODY_LENGTH}자 이하로 입력해주세요.`
    );


    return;

  }


  inquirySending =
    true;

  inquirySendButton.disabled =
    true;


  setInquiryMessage(
    "보내는 중..."
  );


  const {
    data: userData,
    error: userError
  } =
    await supabaseClient
      .auth
      .getUser();


  if (
    userError ||
    !userData?.user
  ) {

    setInquiryMessage(
      "로그인이 필요합니다."
    );


    inquirySending =
      false;

    inquirySendButton.disabled =
      false;


    return;

  }


  const userId =
    userData.user.id;


  const uploadedPaths =
    [];


  for (
    const attachment of inquiryAttachments
  ) {

    /*
      올리기 전에 메타데이터를 지우고 용량을 줄인다
      (core/lib/image-upload.js). 문의에 붙는 캡처에도 촬영 정보가
      남을 수 있으므로 다른 업로드 경로와 같은 규칙을 그대로 쓴다.
    */

    const prepared =
      await prepareImoryUploadImage(
        attachment.file,
        {
          stripMetadata:
            typeof imoryEtcStripImageExifEnabled === "function" &&
              imoryEtcStripImageExifEnabled()
        }
      );


    if (prepared.error) {

      await removeUploadedInquiryImages(
        uploadedPaths
      );


      setInquiryMessage(
        "사진에서 촬영 정보(EXIF)를 지우지 못해 보내지 않았습니다."
      );


      inquirySending =
        false;

      inquirySendButton.disabled =
        false;


      return;

    }


    const upload =
      prepared.file ||
      attachment.file;


    const extension =
      INQUIRY_EXTENSION_BY_MIME[upload.type];


    if (!extension) {

      await removeUploadedInquiryImages(
        uploadedPaths
      );


      setInquiryMessage(
        "png · jpg · webp · gif 사진만 첨부할 수 있습니다."
      );


      inquirySending =
        false;

      inquirySendButton.disabled =
        false;


      return;

    }


    const unique =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;


    const path =
      `${userId}/${unique}.${extension}`;


    const {
      error: uploadError
    } =
      await supabaseClient
        .storage
        .from(
          INQUIRY_BUCKET
        )
        .upload(
          path,
          upload,
          {
            /* 경로가 매번 새로 생기므로 덮어쓸 일이 없어야 한다. */
            upsert:
              false,

            contentType:
              upload.type
          }
        );


    if (uploadError) {

      console.error(
        "inquiry image upload error:",
        uploadError
      );


      await removeUploadedInquiryImages(
        uploadedPaths
      );


      setInquiryMessage(
        "사진을 올리지 못해 보내지 않았습니다."
      );


      inquirySending =
        false;

      inquirySendButton.disabled =
        false;


      return;

    }


    uploadedPaths.push(
      path
    );

  }


  const {
    error: submitError
  } =
    await supabaseClient
      .rpc(
        "submit_inquiry",
        {
          p_body:
            body,

          p_image_paths:
            uploadedPaths
        }
      );


  if (submitError) {

    console.error(
      "submit_inquiry error:",
      submitError
    );


    await removeUploadedInquiryImages(
      uploadedPaths
    );


    setInquiryMessage(
      "문의를 보내지 못했습니다. 잠시 후 다시 시도해주세요."
    );


    inquirySending =
      false;

    inquirySendButton.disabled =
      false;


    return;

  }


  /* 성공 — 화면을 비운다. */

  inquiryAttachments.forEach(
    (attachment) => {

      URL.revokeObjectURL(
        attachment.previewUrl
      );

    }
  );


  inquiryAttachments =
    [];


  renderInquiryAttachments();


  if (inquiryBodyInput) {

    inquiryBodyInput.value =
      "";

  }


  setInquiryMessage(
    "문의를 보냈습니다. 확인 후 반영하겠습니다."
  );


  inquirySending =
    false;

  inquirySendButton.disabled =
    false;

}


inquirySendButton
  ?.addEventListener(
    "click",
    sendInquiry
  );


renderInquiryAttachments();
