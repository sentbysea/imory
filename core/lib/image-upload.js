/* =========================================================
   IMORY - 올리는 이미지 준비 (메타데이터 제거 + 압축)

   업로드 경로가 여러 개인데(본문 사진 · 대표 사진 · 배너 ·
   아바타 · 파비콘/커서 · 카테고리 지정 이미지 · 스킨 이미지
   라이브러리) 파일을 그대로 올리던 곳이 섞여 있었다. 그래서
   "EXIF를 지운다"고 켜 둬도 어떤 경로로 올렸느냐에 따라 남아
   있었다. 이제 **모든 경로가 이 함수 하나를 지난다.**

   classic script. 다른 무엇에도 의존하지 않는다(supabase도
   쓰지 않는다) — index.html · admin/index.html · studio/index.html
   이 각자 로드한다.


   ★ 무엇을 하는가

     1. 디코드 → canvas에 다시 그린다 → 다시 인코딩한다.
        그러면 픽셀만 남는다. EXIF · GPS · XMP뿐 아니라 PNG의
        tEXt/iTXt 청크(AI 생성 이미지의 생성 정보가 여기 들어간다)
        까지 **결과 파일에 존재하지 않는다**. 특정 태그만 지우는
        파서보다 확실하다 — 모르는 자리에 숨은 메타데이터가
        남는 일이 없다.

     2. 긴 변이 IMORY_UPLOAD_MAX_EDGE(2048px)를 넘으면 그 크기로
        줄인다. 저장 용량이 터지는 것을 막는 쪽이 목적이고,
        AI 생성 이미지(보통 1024~1216px)는 해상도가 그대로
        유지된다.

     3. 사진 계열은 품질 0.85로 다시 인코딩한다.


   ★ 방향(Orientation)

     EXIF Orientation을 지우면서 그림만 그대로 두면 세로로 찍은
     사진이 눕는다. createImageBitmap의
     imageOrientation:"from-image"로 방향을 **픽셀에 반영해서**
     그린다 — 결과 파일은 방향 태그가 없어도 똑바로 보인다.


   ★ 형식

     jpeg · webp   같은 형식으로 다시 인코딩(품질 0.85).
     png           투명한 픽셀이 하나라도 있으면 png 그대로(투명을
                   잃으면 안 된다). 없으면 jpeg로 바꾼다 — 사진을
                   png로 저장한 파일이 용량의 대부분이라서다.
                   형식이 바뀌면 파일 이름의 확장자도 함께 바꾼다.
     그 밖(gif ·   건드리지 않는다. gif는 다시 인코딩하면 애니메이션이
     svg · ico …)  첫 프레임으로 납작해지고, 벡터/아이콘은 래스터로
                   굳어버린다. 잃는 것이 얻는 것보다 크다.


   ★ 실패했을 때 — 두 갈래다

     stripMetadata: true   사용자가 "메타데이터를 지워라"라고 켜 둔
                           설정이다. 조용히 원본을 올리는 것은 그
                           설정을 배신하는 일이라, 실패는 실패로
                           돌려준다({ file: null, error }).
     stripMetadata: false  압축은 어디까지나 용량을 줄이려는
                           최적화다. 실패하면 원본을 그대로 올린다.

     ★ 그래서 압축이 항상 도는 지금은, 설정을 끄고 있어도 결과
     파일에는 메타데이터가 남지 않는다(위 1번). 설정이 실제로
     바꾸는 것은 **실패했을 때 올릴 것인가**다.


   -> { file, changed, error }
========================================================== */

const IMORY_UPLOAD_REENCODE_MIME =
  [
    "image/png",
    "image/jpeg",
    "image/webp"
  ];


/* 긴 변의 상한(px). 넘으면 비율을 지켜 줄인다. */

const IMORY_UPLOAD_MAX_EDGE =
  2048;


/* jpeg · webp 인코딩 품질 */

const IMORY_UPLOAD_QUALITY =
  0.85;


const IMORY_UPLOAD_EXTENSION =
  {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp"
  };


/*
  형식이 바뀌면 확장자도 바꾼다 — 저장 경로를 file.type으로
  만드는 호출부(스킨 이미지 라이브러리 등)와 어긋나지 않게.
*/

function imoryUploadFileName(
  name,
  mimeType
) {

  const extension =
    IMORY_UPLOAD_EXTENSION[mimeType];


  if (!extension) {

    return name || "image";

  }


  const base =
    String(
      name ||
      "image"
    );


  const dot =
    base.lastIndexOf(".");


  const stem =
    dot > 0
      ? base.slice(0, dot)
      : base;


  return `${stem}.${extension}`;

}


/*
  투명한 픽셀이 하나라도 있는가. png를 jpeg로 바꿔도 되는지를
  이것 하나로 판단한다 — 다 그린 캔버스를 그대로 훑으므로
  (줄여 그린 뒤라면 그 크기만큼만) 한 번만 돈다.

  읽지 못하면(아주 드물게 보안 오류) "투명이 있다"로 본다 —
  잘못 바꿔서 투명을 잃는 쪽이 더 나쁘다.
*/

function imoryCanvasHasTransparency(
  context,
  width,
  height
) {

  try {

    const data =
      context.getImageData(
        0,
        0,
        width,
        height
      ).data;


    for (
      let index = 3;
      index < data.length;
      index += 4
    ) {

      if (data[index] !== 255) {

        return true;

      }

    }


    return false;

  }

  catch (err) {

    console.warn(
      "[image-upload] 투명도 확인 실패(png 그대로 둔다):",
      err
    );


    return true;

  }

}


async function prepareImoryUploadImage(
  file,
  options = {}
) {

  const stripMetadata =
    Boolean(
      options.stripMetadata
    );


  if (!file) {

    return {
      file,
      changed: false,
      error: null
    };

  }


  if (
    !IMORY_UPLOAD_REENCODE_MIME.includes(file.type)
  ) {

    /* gif · svg · ico 등 — 위 주석의 이유로 그대로 둔다 */

    return {
      file,
      changed: false,
      error: null
    };

  }


  let bitmap =
    null;


  try {

    bitmap =
      await createImageBitmap(
        file,
        {
          imageOrientation: "from-image"
        }
      );


    const scale =
      Math.min(
        1,
        IMORY_UPLOAD_MAX_EDGE /
        Math.max(
          bitmap.width,
          bitmap.height
        )
      );


    const width =
      Math.max(
        1,
        Math.round(
          bitmap.width *
          scale
        )
      );


    const height =
      Math.max(
        1,
        Math.round(
          bitmap.height *
          scale
        )
      );


    const resized =
      scale < 1;


    const canvas =
      document.createElement(
        "canvas"
      );


    canvas.width =
      width;

    canvas.height =
      height;


    const context =
      canvas.getContext(
        "2d"
      );


    if (!context) {

      throw new Error("canvas 2d context를 만들지 못했습니다.");

    }


    context.drawImage(
      bitmap,
      0,
      0,
      width,
      height
    );


    /*
      png인데 투명이 없으면 jpeg로 — 사진을 png로 저장한 파일이
      용량의 대부분이다. 투명이 있으면 png 그대로 둔다.
    */

    const targetType =
      file.type === "image/png" &&
      !imoryCanvasHasTransparency(
        context,
        width,
        height
      )
        ? "image/jpeg"
        : file.type;


    const blob =
      await new Promise(
        (resolve) => {

          canvas.toBlob(
            resolve,
            targetType,
            IMORY_UPLOAD_QUALITY
          );

        }
      );


    if (!blob) {

      throw new Error("이미지를 다시 인코딩하지 못했습니다.");

    }


    /*
      ★ 커지기만 했으면 원본을 그대로 둔다.

      png를 png로 다시 인코딩하면(투명이 있어서 형식을 못 바꾼
      경우) 원본보다 커질 수 있다. 줄이지도 못했고 형식도 그대로면
      바꿀 이유가 없다 — 다만 "메타데이터를 지워라"가 켜져 있으면
      크기와 무관하게 다시 인코딩한 파일을 써야 한다.
    */

    if (
      !stripMetadata &&
      !resized &&
      targetType === file.type &&
      blob.size >= file.size
    ) {

      return {
        file,
        changed: false,
        error: null
      };

    }


    return {

      file:
        new File(
          [blob],
          imoryUploadFileName(
            file.name,
            targetType
          ),
          {
            type: targetType,
            lastModified: Date.now()
          }
        ),

      changed:
        true,

      error:
        null

    };

  }

  catch (err) {

    console.warn(
      "[image-upload] 이미지 준비 실패:",
      err
    );


    /*
      지우라고 켜 둔 설정이면 실패를 실패로 돌려준다(원본을
      대신 올리지 않는다). 그렇지 않으면 압축은 최적화일 뿐이라
      원본을 그대로 올린다.
    */

    if (stripMetadata) {

      return {
        file: null,
        changed: false,
        error: err
      };

    }


    return {
      file,
      changed: false,
      error: null
    };

  }

  finally {

    if (
      bitmap &&
      typeof bitmap.close === "function"
    ) {

      bitmap.close();

    }

  }

}
