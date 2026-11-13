// Small helpers shared by the participant and instructor pages.

// Builds a DOM element. Text passed as a child always becomes a text node,
// so anything a person typed is shown as text and never run as HTML.
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'svg') el.innerHTML = value; // trusted, hard-coded drawings only
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// Sends a short message to screen readers without moving focus.
export function announce(message) {
  const region = document.getElementById('live');
  if (!region) return;
  region.textContent = '';
  window.setTimeout(() => {
    region.textContent = message;
  }, 60);
}

// A confirmation box built into the page. Resolves true when the person agrees.
// The browser's dialog element keeps keyboard focus inside the box, closes on
// Escape, and puts focus back where it was afterward.
export function askConfirm(message, okText = 'OK', danger = false) {
  return new Promise((resolve) => {
    const dialog = h(
      'dialog',
      { class: 'confirm-dialog', 'aria-labelledby': 'confirm-text' },
      h('p', { id: 'confirm-text' }, message),
      h(
        'div',
        { class: 'row-actions' },
        okText ? h('button', { class: 'btn', type: 'button', onclick: () => dialog.close('no') }, 'Cancel') : null,
        h('button', { class: danger ? 'btn btn-danger' : 'btn btn-primary', type: 'button', onclick: () => dialog.close('yes') }, okText || 'OK'),
      ),
    );
    dialog.addEventListener('close', () => {
      const yes = dialog.returnValue === 'yes';
      dialog.remove();
      resolve(yes);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

// A message box with one OK button.
export function tell(message) {
  return askConfirm(message, '');
}

// Join codes leave out letters and digits that look alike (0 O, 1 I L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeCode(length = 6) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

export function cleanCode(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function formatCode(code) {
  const c = String(code || '');
  return c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c;
}

export function makeId(prefix = 'q') {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return prefix + bytes[0].toString(36) + bytes[1].toString(36);
}

// The address participants open. It is the folder this page lives in.
export function joinBase() {
  const url = new URL('.', window.location.href);
  url.search = '';
  url.hash = '';
  return url.href;
}

export function joinUrl(code) {
  return `${joinBase()}?c=${code}`;
}

// The join address without "https://", for reading off a projector.
export function joinBaseShort() {
  return joinBase().replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || one + 's'}`;
}

export function formatDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function downloadText(filename, text, mime = 'text/csv') {
  // The leading mark tells Excel on Windows and Mac that the file is UTF-8.
  const blob = new Blob(['﻿', text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFilename(s) {
  return (String(s || 'poll').trim().replace(/[^A-Za-z0-9 _-]+/g, '').replace(/\s+/g, '-').slice(0, 50) || 'poll').toLowerCase();
}

// Runs fn at most once per interval, always with the latest call.
export function throttle(fn, ms) {
  let last = 0;
  let timer = null;
  let pending = null;
  return (...args) => {
    pending = args;
    const now = Date.now();
    const wait = Math.max(0, last + ms - now);
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = null;
      last = Date.now();
      fn(...pending);
    }, wait);
  };
}

// Draws a QR code as an SVG element using the vendored qrcode generator.
export function qrSvg(text, label) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const margin = 2;
  const size = count + margin * 2;
  let d = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.classList.add('qr');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', size);
  bg.setAttribute('height', size);
  bg.setAttribute('fill', '#ffffff');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000000');
  svg.append(bg, path);
  return svg;
}
