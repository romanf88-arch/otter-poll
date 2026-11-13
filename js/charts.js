// Turns a tally (from tally.js) into a chart built from ordinary HTML.
// Every number in a chart is also real text, so screen readers get the same
// information that the bars and columns show.

import { h, plural, reducedMotion } from './util.js';

const vh = (text) => h('span', { class: 'vh' }, text);

// opts.mine    the viewer's own answer, marked in the chart
// opts.onHide  when given, each short answer or word gets a Hide button
// opts.showNames  show names beside short answers (instructor view, named polls)
export function renderTally(t, opts = {}) {
  if (!t || t.kind === 'none') return h('p', { class: 'chart-empty' }, 'No results to show.');
  switch (t.kind) {
    case 'bars':
      return bars(t, opts);
    case 'rating':
      return rating(t, opts);
    case 'rank':
      return rank(t);
    case 'cloud':
      return cloud(t, opts);
    case 'text':
      return answers(t, opts);
    default:
      return h('p', { class: 'chart-empty' }, 'No results to show.');
  }
}

export function countLine(t) {
  return t.n === 0 ? 'No responses yet' : plural(t.n, 'response');
}

function bars(t, opts) {
  const mine = opts.mine === undefined ? [] : [].concat(opts.mine);
  const top = Math.max(0, ...t.rows.map((r) => r.count));
  const list = h('ul', { class: 'bars' });
  t.rows.forEach((r, i) => {
    const isMine = mine.includes(i);
    list.append(
      h(
        'li',
        { class: 'bar-row' + (isMine ? ' is-mine' : '') + (top > 0 && r.count === top ? ' is-top' : '') },
        h(
          'div',
          { class: 'bar-head' },
          h('span', { class: 'bar-label' }, r.label, isMine ? h('span', { class: 'tag' }, 'Your answer') : null),
          h('span', { class: 'bar-value' }, h('span', { class: 'bar-count' }, r.count), vh(r.count === 1 ? ' response, ' : ' responses, '), h('span', { class: 'bar-pct' }, r.pct + '%')),
        ),
        h('div', { class: 'bar-track', 'aria-hidden': 'true' }, h('div', { class: 'bar-fill', style: { width: r.pct + '%' } })),
      ),
    );
  });
  const wrap = h('div', { class: 'chart' }, list);
  if (t.multi) wrap.append(h('p', { class: 'chart-note' }, 'Participants could choose more than one, so the percentages can add up to more than 100.'));
  return wrap;
}

function rating(t, opts) {
  const top = Math.max(1, ...t.counts);
  const cols = h('ol', { class: 'cols' });
  t.counts.forEach((c, i) => {
    const value = i + 1;
    const isMine = opts.mine === value;
    cols.append(
      h(
        'li',
        { class: 'col' + (isMine ? ' is-mine' : '') },
        vh(`Rating ${value}: ${plural(c, 'response')}${isMine ? ' (your answer)' : ''}`),
        h('span', { class: 'col-count', 'aria-hidden': 'true' }, c),
        h('span', { class: 'col-area', 'aria-hidden': 'true' }, h('span', { class: 'col-bar', style: { height: Math.round((c / top) * 100) + '%' } })),
        h('span', { class: 'col-x', 'aria-hidden': 'true' }, value),
      ),
    );
  });
  return h(
    'div',
    { class: 'chart rating' },
    h('p', { class: 'hero' }, h('span', { class: 'hero-num' }, t.n ? t.avg.toFixed(1) : '0'), h('span', { class: 'hero-label' }, ` average on a scale of 1 to ${t.max}`)),
    cols,
    t.low || t.high ? h('div', { class: 'scale-ends' }, h('span', null, t.low ? `1 = ${t.low}` : ''), h('span', null, t.high ? `${t.max} = ${t.high}` : '')) : null,
  );
}

function rank(t) {
  const list = h('ol', { class: 'ranks' });
  t.rows.forEach((r, i) => {
    const width = t.n ? Math.round(((t.size + 1 - r.avgRank) / t.size) * 100) : 0;
    list.append(
      h(
        'li',
        { class: 'rank-row' },
        h('span', { class: 'rank-place', 'aria-hidden': 'true' }, t.n ? i + 1 : ''),
        h(
          'div',
          { class: 'rank-main' },
          h('div', { class: 'bar-head' }, h('span', { class: 'bar-label' }, r.label), h('span', { class: 'bar-value' }, t.n ? `Average rank ${r.avgRank.toFixed(1)}` : '')),
          h('div', { class: 'bar-track', 'aria-hidden': 'true' }, h('div', { class: 'bar-fill', style: { width: width + '%' } })),
        ),
      ),
    );
  });
  return h('div', { class: 'chart' }, list, h('p', { class: 'chart-note' }, 'Listed from most preferred to least. A lower average rank means participants placed it higher.'));
}

function cloud(t, opts) {
  if (!t.words.length) return h('p', { class: 'chart-empty' }, 'Words will appear here as participants answer.');
  const top = t.words[0].count;
  const list = h('ul', { class: 'cloud' });
  t.words.forEach((w, i) => {
    const size = 1 + 2.2 * Math.sqrt(w.count / top) * (top > 1 ? 1 : 0.35);
    list.append(
      h(
        'li',
        { class: `cloud-word tone-${i % 4}`, style: { fontSize: size.toFixed(2) + 'em' } },
        h('span', { class: 'cloud-text' }, w.text),
        w.count > 1 ? h('sup', { class: 'cloud-count', 'aria-hidden': 'true' }, w.count) : null,
        vh(`, ${plural(w.count, 'response')}`),
        opts.onHide ? h('button', { type: 'button', class: 'hide-btn', 'data-hide-key': w.key || w.text.toLowerCase(), 'aria-label': `Hide the word ${w.text}`, onclick: () => opts.onHide(w.key || w.text.toLowerCase()) }, 'Hide') : null,
      ),
    );
  });
  return h('div', { class: 'chart' }, list);
}

function answers(t, opts) {
  if (!t.items.length) return h('p', { class: 'chart-empty' }, 'Answers will appear here as participants respond.');
  const list = h('ul', { class: 'answers' });
  t.items.forEach((item) => {
    list.append(
      h(
        'li',
        { class: 'answer' },
        h('p', { class: 'answer-text' }, item.text),
        opts.showNames && item.name ? h('p', { class: 'answer-name' }, item.name) : null,
        opts.onHide && item.uid ? h('button', { type: 'button', class: 'hide-btn', 'data-hide-key': item.uid, 'aria-label': `Hide the answer: ${item.text.slice(0, 60)}`, onclick: () => opts.onHide(item.uid) }, 'Hide') : null,
      ),
    );
  });
  return h('div', { class: 'chart' }, list);
}

// Makes bars and columns glide from their sizes in the old chart to their sizes
// in the new one, instead of jumping. Call it before the new chart goes on the page.
export function carryOver(oldRoot, newRoot) {
  if (!oldRoot || !newRoot || newRoot.querySelector('.ranks') || reducedMotion()) return;
  for (const [selector, prop] of [
    ['.bar-fill', 'width'],
    ['.col-bar', 'height'],
  ]) {
    const before = [...oldRoot.querySelectorAll(selector)].map((el) => el.style[prop]);
    const after = [...newRoot.querySelectorAll(selector)];
    if (!before.length || before.length !== after.length) continue;
    after.forEach((el, i) => {
      const target = el.style[prop];
      if (before[i] === target) return;
      el.style[prop] = before[i];
      window.setTimeout(() => {
        el.style[prop] = target;
      }, 30);
    });
  }
}
