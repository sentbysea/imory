/* Trusted layout adaptation for fixed-track grids and nowrap flex layouts.
   CSS handles normal boxes/media; only genuinely overflowing layouts adapt.
   Restore authored values before measuring so desktop designs return on resize. */
const installed = new WeakSet();
export function installContentWidthContract(doc = document) {
  if (installed.has(doc)) return;
  installed.add(doc);
  const win = doc.defaultView;
  const adjusted = new Map();
  let scheduled = false;
  const observer = new win.MutationObserver(schedule);
  function observe() {
    observer.observe(doc.documentElement, { childList: true, subtree: true,
      attributes: true, attributeFilter: ['class', 'style'] });
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    win.requestAnimationFrame(adapt);
  }
  function adapt() {
    scheduled = false;
    observer.disconnect();
    for (const [element, properties] of adjusted) {
      for (const [name, value, priority, applied] of properties) {
        if (element.style.getPropertyValue(name) !== applied) continue;
        if (value) element.style.setProperty(name, value, priority);
        else element.style.removeProperty(name);
      }
    }
    adjusted.clear();
    function set(element, name, value) {
      const original = adjusted.get(element) || [];
      original.push([name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name), value]);
      adjusted.set(element, original);
      element.style.setProperty(name, value, 'important');
    }
    const roots = doc.querySelectorAll('.imory-skin-root, .post-detail-content');
    for (const root of roots) {
      for (const element of [root, ...root.querySelectorAll('*')]) {
        if (!element.clientWidth || element.parentElement?.closest('table, pre')) continue;
        const parent = element.parentElement;
        if (parent) {
          const parentStyle = win.getComputedStyle(parent);
          const parentWidth = parent.clientWidth - (parseFloat(parentStyle.paddingLeft) || 0) - (parseFloat(parentStyle.paddingRight) || 0);
          // A parent that clips already keeps its child off the viewport. Narrowing
          // the child there would undo deliberate framing — an image crop frame holds
          // a wider image on purpose (AI_SKIN_PHASE_AI6D_IMAGE_CROP.md), and clamping
          // it to the frame leaves the gap the crop exists to avoid.
          if (parentWidth > 0 && parentStyle.overflowX === 'visible' &&
            element.getBoundingClientRect().width > parentWidth + 1) {
            set(element, 'min-width', '0px');
            set(element, 'max-width', '100%');
          }
        }
        if (element.matches('table, pre')) continue;
        const style = win.getComputedStyle(element);
        if (style.whiteSpace === 'nowrap' && element.scrollWidth > element.clientWidth + 1) {
          set(element, 'white-space', 'normal');
        }
        const available = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (style.display === 'grid' || style.display === 'inline-grid') {
          const tracks = style.gridTemplateColumns.match(/[\d.]+px/g) || [];
          const required = tracks.reduce((sum, track) => sum + parseFloat(track), 0) +
            Math.max(0, tracks.length - 1) * (parseFloat(style.columnGap) || 0);
          if (tracks.length && required > available + 1) {
            set(element, 'grid-template-columns', `repeat(${tracks.length}, minmax(0, 1fr))`);
            if ((tracks.length - 1) * (parseFloat(style.columnGap) || 0) > available) {
              set(element, 'column-gap', '0px');
            }
          }
        } else if ((style.display === 'flex' || style.display === 'inline-flex') &&
          style.flexDirection.startsWith('row') && style.flexWrap === 'nowrap' && element.scrollWidth > element.clientWidth + 1) {
          set(element, 'flex-wrap', 'wrap');
        }
      }
    }
    observe();
  }
  win.addEventListener('resize', schedule);
  doc.addEventListener('load', schedule, true);
  observe();
  schedule();
}
if (typeof document !== 'undefined') installContentWidthContract(document);
