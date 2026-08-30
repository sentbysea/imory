/* =========================================================
   HOME - YOUTUBE BGM (imory 공통)

   home-bgm.js에서 이동(파일명만 변경, 내용은 그대로).

   supabaseClient는 core/lib/supabase-client.js에 있음(같은
   페이지에서 먼저 로드되어야 함). musicButton은 상단 고정 버튼 스크롤
   숨김(home/menu.js)과 하트 드래그(pointerup,
   themes/sua/heart-interaction.js)에서도 전역으로 참조하므로,
   이 파일이 그 파일들보다 먼저 로드되어야 함(index.html
   순서 참고).
========================================================== */

/* =========================================================
   YOUTUBE BGM
========================================================== */

const musicButton =
  document.getElementById(
    "musicButton"
  );

let bgmUrl = "";
let bgmVideoId = "";

let youtubePlayer = null;
let youtubeApiPromise = null;

let bgmPlaying = false;


/* YouTube URL → 영상 ID */

function getYouTubeVideoId(url) {

  if (!url) {
    return "";
  }

  try {

    const parsed =
      new URL(url);

    if (
      parsed.hostname === "youtu.be" ||
      parsed.hostname === "www.youtu.be"
    ) {

      return parsed.pathname
        .replace("/", "")
        .split("?")[0];

    }

    if (
      parsed.hostname.includes(
        "youtube.com"
      )
    ) {

      if (
        parsed.pathname.startsWith(
          "/shorts/"
        )
      ) {

        return parsed.pathname
          .split("/")[2]
          .split("?")[0];

      }

      if (
        parsed.pathname.startsWith(
          "/embed/"
        )
      ) {

        return parsed.pathname
          .split("/")[2]
          .split("?")[0];

      }

      return (
        parsed.searchParams.get("v")
        || ""
      );

    }

  } catch (error) {

    console.error(
      "YouTube URL 형식 오류:",
      error
    );

  }

  return "";

}


/* Supabase에서 BGM 주소 불러오기 */

async function loadBgmSetting() {

  const { data, error } =
    await supabaseClient
      .from("site_settings")
      .select("value")
      .eq("key", "bgm_url")
      .maybeSingle();

  if (error) {

    console.error(
      "BGM 설정 불러오기 실패:",
      error
    );

    return;
  }

  bgmUrl =
    data?.value?.trim()
    || "";

  bgmVideoId =
    getYouTubeVideoId(
      bgmUrl
    );

  if (
    !bgmVideoId &&
    musicButton
  ) {

    musicButton.style.display =
      "none";

  }

}


/* YouTube API */

function loadYouTubeApi() {

  if (
    window.YT &&
    window.YT.Player
  ) {
    return Promise.resolve();
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise =
    new Promise(
      (resolve) => {

        const previousCallback =
          window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady =
          () => {

            if (
              typeof previousCallback
              === "function"
            ) {

              previousCallback();

            }

            resolve();

          };

        const script =
          document.createElement(
            "script"
          );

        script.src =
          "https://www.youtube.com/iframe_api";

        document.head.appendChild(
          script
        );

      }
    );

  return youtubeApiPromise;

}


/* 플레이어 생성 */

async function ensureYouTubePlayer() {

  if (youtubePlayer) {
    return youtubePlayer;
  }

  if (!bgmVideoId) {
    return null;
  }

  await loadYouTubeApi();

  youtubePlayer =
    new YT.Player(
      "youtubePlayer",
      {

        width: "220",
        height: "124",

        videoId:
          bgmVideoId,

        playerVars: {

          autoplay: 0,

          controls: 0,

          loop: 1,

          playlist:
            bgmVideoId,

          playsinline: 1,

          rel: 0

        },

        events: {

          onStateChange:
            (event) => {

              if (
                event.data ===
                YT.PlayerState.PLAYING
              ) {

                bgmPlaying =
                  true;

                musicButton.textContent =
                  "♪";

              }

              if (
                event.data ===
                YT.PlayerState.PAUSED
              ) {

                bgmPlaying =
                  false;

                musicButton.textContent =
                  "♫";

              }

            }

        }

      }
    );

  return youtubePlayer;

}


/* BGM 재생 */

async function playBgm() {

  const player =
    await ensureYouTubePlayer();

  if (!player) {
    return;
  }

  try {

    player.playVideo();

  } catch (error) {

    console.log(
      "브라우저가 재생을 막음:",
      error
    );

  }

}


/* BGM 정지 */

function pauseBgm() {

  if (!youtubePlayer) {
    return;
  }

  youtubePlayer.pauseVideo();

  bgmPlaying =
    false;

  musicButton.textContent =
    "♫";

}


if (musicButton) {

  musicButton.addEventListener(
    "click",
    async (event) => {

      event.stopPropagation();

      if (bgmPlaying) {

        pauseBgm();

      } else {

        await playBgm();

      }

    }
  );

}


loadBgmSetting();
