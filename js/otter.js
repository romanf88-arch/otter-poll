// The Otter Poll mascot: an original drawing of a sea otter, written as SVG.
// Poses: 'hello' (waving), 'ballot' (holding a ballot), 'star' (holding a star),
// 'sleep' (eyes closed, waiting).

const FUR = '#7d553b';
const FUR_DARK = '#5e3f2c';
const BELLY = '#cfa983';
const FACE = '#f5e6cd';
const INK = '#2b2f3a';
const NOSE = '#3b2a20';

const openEyes = `
  <circle cx="79" cy="77" r="7.5" fill="${INK}"/>
  <circle cx="121" cy="77" r="7.5" fill="${INK}"/>
  <circle cx="81.6" cy="74.2" r="2.6" fill="#fff"/>
  <circle cx="123.6" cy="74.2" r="2.6" fill="#fff"/>`;

const happyEyes = `
  <path d="M71 79 q8 -10 16 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M113 79 q8 -10 16 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;

const sleepEyes = `
  <path d="M71 77 q8 7 16 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M113 77 q8 7 16 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;

const pawsTogether = `
  <ellipse cx="82" cy="136" rx="13" ry="10" fill="${FUR_DARK}" transform="rotate(-18 82 136)"/>
  <ellipse cx="118" cy="136" rx="13" ry="10" fill="${FUR_DARK}" transform="rotate(18 118 136)"/>`;

const items = {
  hello: `
    <path d="M140 118 q26 -8 30 -40" fill="none" stroke="${FUR}" stroke-width="17" stroke-linecap="round"/>
    <circle cx="170" cy="76" r="11" fill="${FUR_DARK}"/>
    <ellipse cx="84" cy="138" rx="13" ry="10" fill="${FUR_DARK}" transform="rotate(-18 84 138)"/>`,
  ballot: `
    <g transform="rotate(-6 100 128)">
      <rect x="74" y="106" width="52" height="40" rx="5" fill="#ffffff" stroke="#31456b" stroke-width="3"/>
      <path d="M86 126 l9 9 l17 -19" fill="none" stroke="#4d7a4b" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <ellipse cx="72" cy="134" rx="11" ry="9" fill="${FUR_DARK}" transform="rotate(-24 72 134)"/>
    <ellipse cx="128" cy="130" rx="11" ry="9" fill="${FUR_DARK}" transform="rotate(24 128 130)"/>`,
  star: `
    <path d="M100 104 l7.6 15.5 l17.1 2.5 l-12.4 12 l2.9 17 l-15.2 -8 l-15.2 8 l2.9 -17 l-12.4 -12 l17.1 -2.5z" fill="#e0b457" stroke="#a97c1f" stroke-width="2.5" stroke-linejoin="round"/>
    <ellipse cx="76" cy="138" rx="11" ry="9" fill="${FUR_DARK}" transform="rotate(-24 76 138)"/>
    <ellipse cx="124" cy="138" rx="11" ry="9" fill="${FUR_DARK}" transform="rotate(24 124 138)"/>`,
  sleep: `
    ${pawsTogether}
    <text x="150" y="44" font-family="Montserrat, Tahoma, sans-serif" font-weight="800" font-size="20" fill="#31456b">z</text>
    <text x="164" y="28" font-family="Montserrat, Tahoma, sans-serif" font-weight="800" font-size="14" fill="#31456b">z</text>`,
};

const eyes = { hello: openEyes, ballot: openEyes, star: happyEyes, sleep: sleepEyes };

export function otterSvg(pose = 'hello', label = '') {
  const p = items[pose] ? pose : 'hello';
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  return `
<svg class="otter" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" ${a11y}>
  <ellipse cx="100" cy="166" rx="92" ry="24" fill="#6b92b6" opacity=".28"/>
  <path d="M146 150 q30 -2 38 -30 q2 -9 -6 -9 q-7 0 -8 8 q-4 18 -30 18z" fill="${FUR_DARK}"/>
  <ellipse cx="100" cy="140" rx="47" ry="46" fill="${FUR}"/>
  <ellipse cx="100" cy="146" rx="31" ry="32" fill="${BELLY}"/>
  <circle cx="57" cy="47" r="12" fill="${FUR}"/>
  <circle cx="57" cy="47" r="6" fill="${FUR_DARK}"/>
  <circle cx="143" cy="47" r="12" fill="${FUR}"/>
  <circle cx="143" cy="47" r="6" fill="${FUR_DARK}"/>
  <ellipse cx="100" cy="76" rx="54" ry="47" fill="${FUR}"/>
  <path d="M100 50 c-28 0 -43 17 -43 37 c0 21 20 33 43 33 s43 -12 43 -33 c0 -20 -15 -37 -43 -37z" fill="${FACE}"/>
  ${eyes[p]}
  <ellipse cx="66" cy="95" rx="8.5" ry="5.5" fill="#cc7e4c" opacity=".38"/>
  <ellipse cx="134" cy="95" rx="8.5" ry="5.5" fill="#cc7e4c" opacity=".38"/>
  <path d="M89 86 q11 -7 22 0 q1 10 -11 12 q-12 -2 -11 -12z" fill="${NOSE}"/>
  <path d="M100 98 v5 M100 103 q-6 7 -13 2 M100 103 q6 7 13 2" fill="none" stroke="${NOSE}" stroke-width="2.6" stroke-linecap="round"/>
  <g stroke="${FUR_DARK}" stroke-width="1.6" stroke-linecap="round" opacity=".7">
    <path d="M62 100 l-16 -3 M62 105 l-16 3"/>
    <path d="M138 100 l16 -3 M138 105 l16 3"/>
  </g>
  ${items[p]}
  <path d="M6 172 q16 -11 32 0 t32 0 t32 0 t32 0 t32 0 t32 0 v28 h-192z" fill="#6b92b6"/>
  <path d="M6 184 q16 -9 32 0 t32 0 t32 0 t32 0 t32 0 t32 0 v16 h-192z" fill="#31456b" opacity=".55"/>
</svg>`;
}

// A small otter face for the page header.
export function otterMark() {
  return `
<svg class="otter-mark" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <circle cx="32" cy="32" r="31" fill="#6b92b6"/>
  <circle cx="13" cy="17" r="7" fill="${FUR}"/>
  <circle cx="51" cy="17" r="7" fill="${FUR}"/>
  <ellipse cx="32" cy="33" rx="25" ry="22" fill="${FUR}"/>
  <path d="M32 21 c-13 0 -20 8 -20 17.500 c0 10 9 15.500 20 15.500 s20 -5.500 20 -15.500 c0 -9.500 -7 -17.500 -20 -17.500z" fill="${FACE}"/>
  <circle cx="22" cy="33" r="3.6" fill="${INK}"/>
  <circle cx="42" cy="33" r="3.6" fill="${INK}"/>
  <circle cx="23.200" cy="31.800" r="1.200" fill="#fff"/>
  <circle cx="43.200" cy="31.800" r="1.200" fill="#fff"/>
  <path d="M27 38 q5 -3.500 10 0 q.5 5 -5 6 q-5.500 -1 -5 -6z" fill="${NOSE}"/>
  <path d="M32 44 v2 M32 46 q-3 3.500 -6 1 M32 46 q3 3.500 6 1" fill="none" stroke="${NOSE}" stroke-width="1.500" stroke-linecap="round"/>
</svg>`;
}
