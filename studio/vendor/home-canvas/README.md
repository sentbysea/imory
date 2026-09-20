# studio/vendor/home-canvas — 고정한 third-party 파일

HOME 캔버스 편집기(`HOME-CANVAS-SELECT-1` 이후)가 쓸 드래그 · 리사이즈 ·
회전 · 다중 선택 라이브러리 두 개다. 채택 근거와 좌표 실측값은
[IMORY_HOME_CANVAS_ROADMAP.md §8-1](../../../docs/plans/IMORY_HOME_CANVAS_ROADMAP.md),
로더 · sandbox · nonce 계약은
[IMORY_HOME_CANVAS_CONTRACT.md §13](../../../docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md).

## 무엇이 들어 있나

| 파일 | 라이브러리 | 버전 | 형태 | 라이선스 | bytes | SHA-256 |
| --- | --- | ---: | --- | --- | ---: | --- |
| `moveable-0.53.0.min.js` | [Moveable](https://github.com/daybrush/moveable) | 0.53.0 | UMD | MIT | 245,551 | `6c6c78751303afd6212398c148dd767d83f1d6bc1858569c140a8f0dafe22f41` |
| `selecto-1.26.3.min.js` | [Selecto](https://github.com/daybrush/selecto) | 1.26.3 | UMD | MIT | 62,204 | `2ec017a727576abb0660ef0fbde29fa7b194bdbfe172406b4069b93e0fade45f` |

라이선스 전문은 `licenses/` 에 원본 그대로 있다(둘 다 npm tarball 의 `LICENSE`).

| 파일 | bytes | SHA-256 |
| --- | ---: | --- |
| `licenses/moveable-MIT.txt` | 1,064 | `77f98221f8531e87aa227c0a8d63c17c903dd4d36daf24bdc48296b09e06a25e` |
| `licenses/selecto-MIT.txt` | 1,064 | `f0a8acccf5e11935501025a8035e78c9d44007e68f17344783d44810075e92aa` |

이 표의 크기와 해시는 `node studio/studio-home-canvas-vendor-e2e-test.mjs`
(`--only=files`)가 **이 README 를 읽어** 실제 파일과 대조한다 — 값을 고치면
파일도 같이 바뀌어야 한다.

## 어디서 가져왔나

공식 npm registry tarball 에서 꺼냈다. CDN 이 재가공한 파일이나 mirror 가 아니다.

```
https://registry.npmjs.org/moveable/-/moveable-0.53.0.tgz   →  package/dist/moveable.min.js
https://registry.npmjs.org/selecto/-/selecto-1.26.3.tgz     →  package/dist/selecto.min.js
```

받은 tarball 이 registry 가 말하는 그 파일인지 두 값으로 확인했다(2026-09-21).

| tarball | registry `dist.shasum` (SHA-1) | registry `dist.integrity` |
| --- | --- | --- |
| moveable-0.53.0.tgz | `5574b910d58ce4b71e260c17661b6c78c4909b13` | `sha512-71jS9zIoQzMhnNvduhg4tUEdm23+fO/40FN7muVMbZvVwbTku2MIxxLhnU4qFvxI4oVxn75l79SbtgjuA+s7Pw==` |
| selecto-1.26.3.tgz | `12f259112b943d395731524e3bb0115da7372212` | `sha512-gZHgqMy5uyB6/2YDjv3Qqaf7bd2hTDOpPdxXlrez4R3/L0GiEWDCFaUfrflomgqdb3SxHF2IXY0Jw0EamZi7cw==` |

두 tarball 의 `package.json` 이 각각 `name`/`version`/`license` 를
`moveable`/`0.53.0`/`MIT`, `selecto`/`1.26.3`/`MIT` 로 적고 있다.

## 보관 규칙

- 원본 minified 파일을 **바이트 그대로** 둔다. 재번들 · 재압축 · 재minify 하지 않는다.
- 첫 줄의 저작권 · MIT 배너를 지우지 않는다.
- `.map` 은 넣지 않는다. 두 파일 끝의 `//# sourceMappingURL=` 주석은 원본
  바이트의 일부라 **지우지 않는다** — 그래서 devtools 를 연 채로 보면 map
  요청이 404 가 난다. 바이트를 고치지 않기로 한 쪽을 택한 결과다.
- npm tarball 전체를 넣지 않는다. 필요한 UMD 와 LICENSE 만 넣는다.
- ESM 빌드는 넣지 않는다. bare specifier 가 남아 있고 이 저장소에는 번들러가
  없다(CLAUDE.md §1, 로드맵 §8-1).
- `package.json` 도 npm 의존성도 추가하지 않는다.

`.gitattributes` 가 이 폴더의 파일을 `-text` 로 고정한다. 이 저장소는
Windows 에서 `core.autocrlf=true` 로 작업하므로 그게 없으면 checkout 때
LF 가 CRLF 로 바뀌어 위 해시가 맞지 않게 된다.

## 누가 읽나

`studio/studio-home-canvas-vendor.js` 하나뿐이고, 그 파일도 **부를 때만**
받는다(`ensureHomeCanvasEditorVendors()`). 공개 `index.html` · 공개 native
HOME · 공개 sandbox 프레임은 이 두 파일을 로드하지 않는다 — 공개 화면의
전송 비용 증가는 0 이다.

## 버전을 올릴 때

Moveable 0.53.0 의 `cspNonce` 는 **작동하지만 deprecated** 다(로드맵 §8-1).
버전을 올리면 그 옵션이 조용히 사라져 sandbox 프레임 안에서 핸들이 CSP 에
막힐 수 있다. 그래서 올리기 전에 반드시
`node studio/studio-home-canvas-vendor-e2e-test.mjs --only=nonce` 를
새 파일로 다시 돌려 대조군 넷이 그대로인지 확인한다.
