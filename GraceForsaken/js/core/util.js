// ===================================================================
// 汎用ユーティリティ（乱数・DOM）
// ===================================================================

/** mulberry32 ベースのシード付き乱数。ゴースト戦の再現性確保に使う。 */
function makeRng(seed) {
  let a = (seed >>> 0) || (Date.now() >>> 0);
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next: next,
    /** 0 以上 n 未満の整数 */
    int: (n) => Math.floor(next() * n),
    /** percent% の確率で true */
    chance: (percent) => next() * 100 < percent,
    pick: (arr) => arr.length ? arr[Math.floor(next() * arr.length)] : null,
    /** 重複なしで n 個取り出す */
    sample: (arr, n) => {
      const copy = arr.slice();
      const out = [];
      while (out.length < n && copy.length) {
        out.push(copy.splice(Math.floor(next() * copy.length), 1)[0]);
      }
      return out;
    },
    shuffle: (arr) => {
      const copy = arr.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = copy[i]; copy[i] = copy[j]; copy[j] = t;
      }
      return copy;
    },
  };
}

// --- DOM ヘルパー ---------------------------------------------------
function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      } else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) {
        node.setAttribute(k, attrs[k]);
      }
    }
  }
  (children || []).forEach(c => {
    if (c === null || c === undefined || c === false) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function $(sel, root) { return (root || document).querySelector(sel); }
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
