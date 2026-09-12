/* Shared core/content-width.css constrains HTML without scaling its text. */
function resetHtmlPostContentFit() {
  if (postDetailContent) {
    postDetailContent.style.transform = "";
    postDetailContent.style.width = "";
  }
  if (postDetailContentWrap) postDetailContentWrap.style.height = "";
}
function fitHtmlPostContentToViewport() {
  resetHtmlPostContentFit();
}
