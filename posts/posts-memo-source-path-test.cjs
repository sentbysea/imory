const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const contextSource = fs.readFileSync(
  "source/skin/skin-context.js",
  "utf8"
);
const storeSource = fs.readFileSync(
  "source/posts/view/posts-view-highlight-store.js",
  "utf8"
);

const start = contextSource.indexOf(
  "function buildMemoPostFolderPath("
);
const end = contextSource.indexOf(
  "\nasync function buildMemosSkinContext(",
  start
);

assert.ok(start >= 0 && end > start, "folder path helper exists");

const sandbox = {
  buildSkinFolderHref(slug, categoryId, folderId) {
    return `/${slug}/category/${categoryId}/folder/${folderId}`;
  }
};

vm.runInNewContext(
  `${contextSource.slice(start, end)}\nthis.buildPath = buildMemoPostFolderPath;`,
  sandbox
);

const folders = new Map([
  ["10", { id: 10, parent_id: null, category_id: 2, name: "2002" }],
  ["11", { id: 11, parent_id: 10, category_id: 2, name: "봄" }],
  ["99", { id: 99, parent_id: null, category_id: 8, name: "다른 카테고리" }]
]);

const nested = sandbox.buildPath("11", 2, folders, "sua");
assert.deepEqual(
  JSON.parse(JSON.stringify(nested)),
  [
    { id: "10", name: "2002", href: "/sua/category/2/folder/10" },
    { id: "11", name: "봄", href: "/sua/category/2/folder/11" }
  ]
);

assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.buildPath(null, 2, folders, "sua"))),
  []
);
assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.buildPath("99", 2, folders, "sua"))),
  []
);

assert.match(storeSource, /posts!inner\s*\([\s\S]*?folder_id/);
assert.match(storeSource, /postFolderId:/);
assert.match(contextSource, /sourcePathLabel:/);
assert.match(contextSource, /\.join\(" › "\)/);

const skin = JSON.parse(
  fs.readFileSync(
    "output/imory-quiet-frame-v10-memo-paths.json",
    "utf8"
  )
);
assert.match(skin.templates.memos.html, /item\.sourcePathLabel/);
assert.match(skin.css, /--imory-memo-color/);

console.log("memo source path: 10 checks passed");
