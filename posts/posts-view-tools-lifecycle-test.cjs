/* Focused state tests; no browser/DB coverage claimed. Run from repo root. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = name => fs.readFileSync(name, 'utf8');
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
function extract(text, name) {
  const start = text.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  return text.slice(start, text.indexOf('\n}\n', start) + 3);
}
function element() {
  const attrs = {}, events = new Map(), classes = new Set();
  return { hidden: true, attrs, events, classes,
    setAttribute(k,v) { attrs[k] = v; },
    addEventListener(k,v) { events.set(k,v); },
    removeEventListener(k,v) { if(events.get(k) === v) events.delete(k); },
    classList: { remove(k) { classes.delete(k); } },
    querySelectorAll() { return []; }
  };
}
const button = element(), container = element(), anchor = element();
anchor.href = 'https://example.test/demo/post/1?tools=1';
const env = { URL, URLSearchParams, postToolsButton:button, postContainer:container,
  currentPostView:'post',currentPostId:1,closed:0,opened:0,tornDown:0,
  window:{location:{href:'https://example.test/demo/post/1',origin:'https://example.test'}},
  closeImoryPopover(){env.closed++;},openImoryPopover(){env.opened++;},
  teardownPostHighlightScreen(){env.tornDown++;},
  isImoryPopoverOpen(){return false;},imoryPopoverRectOf(){return ()=>({});},
  isSiteToolsRequested(s){return new URLSearchParams(s).get('tools')==='1';}
};
vm.createContext(env);
vm.runInContext(source('posts/view/posts-view-tools-menu.js'),env);
env.setupPostViewerTools({enabled:true,postId:1,isOwner:true});
check(!button.hidden,'legacy post gets a default tools button');
env.setupPostViewerTools({enabled:true,postId:1,skinRoot:{querySelectorAll(){return [anchor];}}});
check(button.hidden,'skin anchor replaces default button');
check(anchor.events.has('click'),'skin anchor receives menu handler');
env.resetPostViewerTools();
check(button.hidden&&env.getPostViewerToolsState().postId===null,'reset drops button and post identity');
check(!anchor.events.has('click'),'reset detaches previous skin handler');
check(env.tornDown>0,'reset tears down highlight UI');
for(const route of ['home','category','folder','memos','editor','compose']){
 env.currentPostView=route;env.currentPostId=null;
 env.setupPostViewerTools({enabled:true,postId:1,isOwner:true});
 check(button.hidden,'late render rejected on '+route);
 const before=env.opened;env.openPostToolsMenu(button);
 check(env.opened===before,'menu cannot open on '+route);
}
env.currentPostView='post';env.currentPostId=2;
env.setupPostViewerTools({enabled:true,postId:2});
env.setupPostViewerTools({enabled:true,postId:1});
check(env.getPostViewerToolsState().postId===2,'late old post cannot replace current tools');
env.openPostToolsMenu(button);check(env.opened===1,'current post menu still opens');
env.postDetail=element();env.postSkinContainer=element();env.postList=element();
env.postManageToggleButton=element();env.restorePostSecretGateToLegacyDetail=()=>{};
vm.runInContext(extract(source('posts/view/posts-view-list.js'),'switchToCategoryScreen'),env);
env.currentPostView='category';env.currentPostId=null;
env.switchToCategoryScreen();
check(button.hidden&&env.getPostViewerToolsState().postId===null,'actual category switch clears reader state');
const renderer=source('skin/skin-render.js');
vm.runInContext(extract(renderer,'applySkinMemoPresentation'),env);
const values={};const node={style:{setProperty(k,v){values[k]=v;}}};
env.applySkinMemoPresentation(node,{color:'#abc123'},'memos.cards');
check(values['--imory-memo-color']==='#abc123','valid card color');
env.applySkinMemoPresentation(node,{color:'url(https://bad.test)'},'memos.cards');
check(values['--imory-memo-color']==='#e6d4dc','invalid color rejected');
env.applySkinMemoPresentation(node,{coverRatio:'3:4',coverFocusX:-4,coverFocusY:105},'memos.folders');
check(values['--imory-memo-cover-ratio']==='3 / 4','folder aspect ratio');
check(values['--imory-memo-cover-position']==='0% 100%','folder focus clamped');
env.applySkinMemoPresentation(node,{coverRatio:'invalid',coverFocusX:NaN},'memos.folders');
check(values['--imory-memo-cover-ratio']==='auto','unknown ratio uses natural image dimensions');
console.log(`PASS ${checks} state and presentation checks (no browser or DB)`);
