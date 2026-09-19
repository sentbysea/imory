/* =========================================================
   imory-editorial-default-v2.json 만들기 (EDITORIAL-DEFAULT-SKIN-2)

     node skin/test-skins/build-imory-editorial-default-v2.mjs

   원본은 skin/skin-default-editorial.js 하나다 — Studio 첫 스킨과
   이 JSON 이 **같은 함수**에서 나온다. 이 파일은 그 결과를 Studio
   Import 에 그대로 붙여 넣을 수 있는 JSON 으로 적을 뿐이다(3단 ·
   밝은 분위기 · 사진 슬롯은 비어 있음).

   기준 문서: IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);

const { createImoryEditorialDefaultSkin } = require("../skin-default-editorial.js");


export function buildEditorialDefaultPackage(options) {

  const pkg = createImoryEditorialDefaultSkin(options || { columns: 3 });

  return {
    ...pkg,
    metadata: { title: "Imory Editorial", ...pkg.metadata }
  };

}


if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(here, "imory-editorial-default-v2.json");
  fs.writeFileSync(out, JSON.stringify(buildEditorialDefaultPackage({ columns: 3 }), null, 2) + "\n");
  console.log("wrote", path.relative(process.cwd(), out));
}
