/* Gallery photos are content; covers remain optional post metadata.
   Upload once, then reference private objects through the existing proxy. */
let postGalleryImages = [];
let postGalleryLoadFailed = false;
let postGalleryDirty = false;
let postGalleryLoading = false;
let postGalleryLoadVersion = 0;

function isGalleryEditor() {
  return postEditorCategory?.selectedOptions[0]?.dataset.categoryType === "gallery";
}

function resetPostGallery() {
  postGalleryLoadVersion += 1;
  postGalleryLoading = false;
  for (const photo of postGalleryImages) if (photo.preview) URL.revokeObjectURL(photo.preview);
  postGalleryImages = [];
  postGalleryLoadFailed = false;
  postGalleryDirty = false;
  renderPostGallery();
}

async function loadPostGallery(postId) {
  resetPostGallery();
  postGalleryLoading = true;
  const version = postGalleryLoadVersion;
  const { data, error } = await supabaseClient.rpc("get_own_gallery_images", { p_post_id: postId });
  if (version !== postGalleryLoadVersion || String(editorSourcePostId) !== String(postId)) return;
  postGalleryLoading = false;
  postGalleryLoadFailed = Boolean(error);
  postGalleryImages = data || [];
  renderPostGallery();
  if (error && isGalleryEditor()) showPostEditorMessage("사진을 불러오지 못했습니다. 다시 열어주세요.");
}

function renderPostGallery() {
  const host = document.getElementById("postEditorGallery");
  if (!host) return;
  host.hidden = !isGalleryEditor();
  const cover = document.querySelector(".post-editor-cover-field");
  if (cover) cover.hidden = isGalleryEditor();
  const contentField = document.getElementById("postEditorHtmlContent")?.closest(".post-editor-field");
  if (contentField) contentField.hidden = isGalleryEditor() && (postGalleryImages.length > 0 || currentEditorMode === "create");
  const photos = document.getElementById("postEditorGalleryPhotos");
  photos.replaceChildren();
  postGalleryImages.forEach((photo, index) => {
    const card = document.createElement("div");
    const img = document.createElement("img");
    img.src = photo.preview || `/api/post-cover?image=${encodeURIComponent(photo.id)}`;
    img.alt = `사진 ${index + 1}`;
    const primary = document.createElement("button");
    primary.type = "button";
    primary.textContent = photo.is_primary ? "대표 사진 해제" : "대표 사진으로 선택";
    primary.setAttribute("aria-pressed", String(Boolean(photo.is_primary)));
    primary.onclick = () => {
      const selected = !photo.is_primary;
      postGalleryImages.forEach(item => { item.is_primary = item === photo && selected; });
      postGalleryDirty = true;
      renderPostGallery();
    };
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "제거";
    remove.onclick = () => {
      if (photo.preview) URL.revokeObjectURL(photo.preview);
      postGalleryImages.splice(index, 1);
      postGalleryDirty = true;
      renderPostGallery();
    };
    card.append(img, primary, remove);
    photos.append(card);
  });
}

document.getElementById("postEditorGalleryFiles")?.addEventListener("change", event => {
  if (postGalleryLoading) {
    event.target.value = "";
    showPostEditorMessage("기존 사진을 불러오는 중입니다. 잠시 후 추가해주세요.");
    return;
  }
  for (const file of event.target.files) {
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 5242880) {
      showPostEditorMessage("사진은 PNG/JPG/WEBP/GIF, 한 장당 5MB 이하로 추가해주세요.");
      continue;
    }
    postGalleryImages.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), is_primary: false });
    postGalleryDirty = true;
  }
  event.target.value = "";
  renderPostGallery();
});
postEditorCategory?.addEventListener("change", renderPostGallery);

async function savePostGallery(postId) {
  if (!isGalleryEditor() && !postGalleryDirty) return null;
  if (postGalleryLoadFailed || postGalleryLoading) return new Error("Gallery could not be loaded");
  const uploaded = [];
  try {
    const user = await getSignedInUser();
    const options = await loadImorySiteContentOptions();
    const rows = [];
    for (const [position, photo] of postGalleryImages.entries()) {
      let metadata = photo;
      if (photo.file) {
        const stripped = await stripImageExifIfNeeded(photo.file, options.stripImageExif);
        if (stripped.error) throw stripped.error;
        const file = stripped.file;
        const storage_path = buildPostCoverStoragePath(user.id, file.type);
        const { error } = await supabaseClient.storage.from("post-covers").upload(storage_path, file,
          { upsert: false, contentType: file.type });
        if (error) throw error;
        uploaded.push(storage_path);
        metadata = { ...photo, storage_path, mime_type: file.type, byte_size: file.size };
      }
      rows.push({ id: metadata.id, storage_path: metadata.storage_path, mime_type: metadata.mime_type,
        byte_size: metadata.byte_size, position, is_primary: Boolean(metadata.is_primary) });
    }
    const { data, error } = await supabaseClient.rpc("save_own_gallery_images", { p_post_id: postId, p_images: rows });
    if (error) throw error;
    for (const photo of postGalleryImages) if (photo.preview) URL.revokeObjectURL(photo.preview);
    postGalleryImages = rows;
    postGalleryDirty = false;
    if (data?.length) {
      try { await supabaseClient.storage.from("post-covers").remove(data); }
      catch (cleanupError) { console.warn("Gallery saved; old object cleanup failed", cleanupError); }
    }
    return null;
  } catch (error) {
    if (uploaded.length) await supabaseClient.storage.from("post-covers").remove(uploaded);
    return error;
  }
}

function getPostGalleryContent() {
  return postGalleryImages.map(photo => `<p><img src="/api/post-cover?image=${photo.id}" alt=""></p>`).join("");
}
