/* =========================================================
   imory-transitions-v1.json 만들기 (TRANSITION-1 예시 스킨)

     node skin/test-skins/build-transitions-v1.mjs

   "움직임을 CSS/JS 로 새로 짜지 않고 전환 primitive 속성만으로
   페이지 전환 · 패널 · dock 접기를 하면 이렇게 된다"를 보여준다.
   기준 문서: IMORY_TRANSITION_PRIMITIVE_DESIGN.md

   ★ CSS 에 @keyframes · animation · transition 이 한 줄도 없다 —
     skin/skin-transition-test.mjs 가 그것을 확인한다.
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const home =
  '<div class="tr-page tr-home" data-imory-transition="fade" data-imory-transition-duration="240">' +
    '<header class="tr-head">' +
      '<h1 class="tr-title" data-imory-bind="site.title"></h1>' +
      '<span class="tr-menu-button" data-imory-toggle="menu">MENU</span>' +
    '</header>' +
    '<nav class="tr-menu" data-imory-panel="menu" data-imory-transition="fade-slide" data-imory-transition-direction="down" data-imory-transition-duration="200">' +
      '<a class="tr-menu-link" data-imory-repeat="navigation.categories" data-imory-href="item.href" data-imory-bind="item.name"></a>' +
    '</nav>' +
    '<ul class="tr-cards">' +
      '<li class="tr-card" data-imory-repeat="navigation.categories" data-imory-transition="fade-slide" data-imory-transition-direction="up" data-imory-transition-easing="smooth" data-imory-transition-duration="360">' +
        '<a class="tr-cat" data-imory-href="item.href" data-imory-bind="item.name"></a>' +
      '</li>' +
    '</ul>' +
  '</div>';

const category =
  '<div class="tr-page tr-category" data-imory-transition="fade-slide" data-imory-transition-direction="left" data-imory-transition-easing="smooth" data-imory-transition-duration="260">' +
    '<a class="tr-home-link" data-imory-href="navigation.home.href">HOME</a>' +
    '<h1 class="tr-title" data-imory-bind="category.name"></h1>' +
    '<ol class="tr-list">' +
      '<li class="tr-row" data-imory-repeat="category.posts">' +
        '<a class="tr-post" data-imory-href="item.href" data-imory-bind="item.title"></a>' +
      '</li>' +
    '</ol>' +
  '</div>';

const post =
  '<div class="tr-page tr-post" data-imory-transition="fade-scale" data-imory-transition-direction="up" data-imory-transition-duration="220">' +
    '<a class="tr-back" data-imory-href="post.categoryHref">BACK</a>' +
    '<h1 class="tr-title" data-imory-bind="post.title"></h1>' +
    '<div class="tr-body" data-imory-region="post-body"></div>' +
  '</div>';

const dock =
  '<nav class="tr-dock">' +
    '<span class="tr-trigger" data-imory-dock="trigger" data-imory-bind="dock.trigger.text"></span>' +
    '<ul class="tr-dock-items" data-imory-dock="items">' +
      '<li class="tr-dock-item" data-imory-repeat="dock.items">' +
        '<a class="tr-dock-link" data-imory-href="item.href" data-imory-bind="item.label"></a>' +
      '</li>' +
    '</ul>' +
    '<div class="tr-pair" data-imory-panel="pair" data-imory-transition="fade-scale" data-imory-transition-direction="up" data-imory-transition-duration="220">' +
      '<p>PAIR PANEL</p>' +
    '</div>' +
  '</nav>';

const css = [
  ".tr-page{max-width:640px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif;color:#2b2b2b;}",
  ".tr-head{display:flex;justify-content:space-between;align-items:center;}",
  ".tr-title{font-size:20px;margin:0 0 12px;}",
  ".tr-menu-button{cursor:pointer;padding:8px 12px;border:1px solid #d8cfcf;border-radius:6px;}",
  ".tr-menu{display:flex;flex-direction:column;gap:6px;padding:12px;margin:8px 0;background:#fbf7f5;border:1px solid #eee3df;}",
  ".tr-cards,.tr-list{list-style:none;margin:0;padding:0;display:grid;gap:10px;}",
  ".tr-card{padding:16px;background:#f6f1ef;border-radius:8px;}",
  ".tr-cat,.tr-post,.tr-home-link,.tr-back,.tr-menu-link{color:#2b2b2b;}",
  ".tr-row{min-height:90px;}",
  ".tr-dock{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center;padding:8px 12px;background:#fdfbfb;}",
  ".tr-dock-items{display:flex;gap:10px;list-style:none;margin:0;padding:0;}",
  ".tr-pair{flex-basis:100%;padding:12px;background:#fff;border:1px solid #eee3df;text-align:center;}",
  "[hidden]{display:none;}"
].join("");

const skin = {
  schemaVersion: 1,
  templates: {
    home: { html: home },
    category: { html: category },
    post: { html: post },
    dock: { html: dock }
  },
  css,
  bottomDock: {
    visible: true,
    position: "fixed",
    collapsible: true,
    defaultState: "expanded",
    transition: { type: "fade-slide", duration: 240, easing: "smooth", direction: "up" },
    trigger: { type: "emoji", value: "♡", label: "메뉴 열기" },
    items: [
      { id: "home", label: "home", audience: "all", visual: { type: "icon", value: "home" }, action: { type: "navigate", target: "home" } },
      { id: "pair", label: "pair", audience: "all", visual: { type: "emoji", value: "♡" }, action: { type: "open", target: "panel:pair" } },
      { id: "top", label: "top", audience: "all", visual: { type: "text", value: "↑" }, action: { type: "action", target: "top" } }
    ]
  },
  imageSlots: [],
  regions: [],
  metadata: { title: "Imory Transitions v1" }
};

const out = path.join(here, "imory-transitions-v1.json");

fs.writeFileSync(out, JSON.stringify(skin, null, 2) + "\n");

console.log("wrote", out);
