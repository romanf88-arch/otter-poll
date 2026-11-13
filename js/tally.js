// Pure functions: question types, answer checks, counting, and CSV output.
// No DOM and no Firebase in this file, so it runs in the browser and in Node tests.

export const TYPES = {
  choice: 'Multiple choice',
  multi: 'Select all that apply',
  yesno: 'Yes or no',
  rating: 'Rating scale',
  rank: 'Ranking',
  cloud: 'Word cloud',
  text: 'Short answer',
};

export const YESNO_LABELS = {
  yesno: ['Yes', 'No'],
  truefalse: ['True', 'False'],
  agree: ['Agree', 'Disagree'],
};

export const LIMITS = {
  text: 300,
  word: 30,
  words: 3,
  name: 40,
  options: 10,
  questions: 30,
  sharedTexts: 50,
  sharedWords: 60,
};

export function optionsOf(q) {
  if (q.type === 'yesno') return YESNO_LABELS[q.labels] || YESNO_LABELS.yesno;
  if (q.type === 'choice' || q.type === 'multi' || q.type === 'rank') {
    return Array.isArray(q.options) ? q.options : [];
  }
  return [];
}

export function scaleMax(q) {
  const m = Number(q.scaleMax);
  return m === 3 || m === 4 || m === 5 || m === 7 || m === 10 ? m : 5;
}

const isIndex = (v, len) => Number.isInteger(v) && v >= 0 && v < len;

export function normalizeWord(s) {
  return String(s).trim().replace(/\s+/g, ' ').toLowerCase();
}

// Returns a cleaned copy of the answer, or undefined when it is not usable.
export function cleanAnswer(q, v) {
  const opts = optionsOf(q);
  switch (q.type) {
    case 'choice':
    case 'yesno':
      return isIndex(v, opts.length) ? v : undefined;
    case 'multi': {
      if (!Array.isArray(v)) return undefined;
      const picked = [...new Set(v.filter((i) => isIndex(i, opts.length)))].sort((a, b) => a - b);
      return picked.length ? picked : undefined;
    }
    case 'rating':
      return Number.isInteger(v) && v >= 1 && v <= scaleMax(q) ? v : undefined;
    case 'rank': {
      if (!Array.isArray(v) || v.length !== opts.length) return undefined;
      const seen = new Set(v);
      if (seen.size !== opts.length || !v.every((i) => isIndex(i, opts.length))) return undefined;
      return v.slice();
    }
    case 'cloud': {
      if (!Array.isArray(v)) return undefined;
      const words = [];
      const seen = new Set();
      for (const raw of v) {
        if (typeof raw !== 'string') continue;
        const w = raw.trim().replace(/\s+/g, ' ').slice(0, LIMITS.word);
        const key = normalizeWord(w);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        words.push(w);
        if (words.length >= LIMITS.words) break;
      }
      return words.length ? words : undefined;
    }
    case 'text': {
      if (typeof v !== 'string') return undefined;
      const t = v.trim().slice(0, LIMITS.text);
      return t || undefined;
    }
    default:
      return undefined;
  }
}

// docs: [{uid, a: {qid: value}, at}]   people: {uid: name}
// Returns the usable answers to one question.
export function entriesFor(q, docs, people = {}) {
  const out = [];
  for (const d of docs) {
    if (!d || !d.a || typeof d.a !== 'object') continue;
    const value = cleanAnswer(q, d.a[q.id]);
    if (value === undefined) continue;
    out.push({ uid: d.uid, value, name: people[d.uid] || '', at: d.at || 0 });
  }
  return out;
}

const pct = (count, n) => (n ? Math.round((count / n) * 100) : 0);
const round2 = (x) => Math.round(x * 100) / 100;

// Counts the answers to one question.
// hidden: entries the instructor removed from display (uids for short answers,
// normalized words for word clouds).
export function tally(q, entries, hidden = []) {
  const opts = optionsOf(q);
  const hide = new Set(hidden);
  switch (q.type) {
    case 'choice':
    case 'yesno': {
      const counts = opts.map(() => 0);
      for (const e of entries) counts[e.value] += 1;
      const n = entries.length;
      return { kind: 'bars', n, rows: opts.map((label, i) => ({ label, count: counts[i], pct: pct(counts[i], n) })) };
    }
    case 'multi': {
      const counts = opts.map(() => 0);
      for (const e of entries) for (const i of e.value) counts[i] += 1;
      const n = entries.length;
      return { kind: 'bars', multi: true, n, rows: opts.map((label, i) => ({ label, count: counts[i], pct: pct(counts[i], n) })) };
    }
    case 'rating': {
      const max = scaleMax(q);
      const counts = Array.from({ length: max }, () => 0);
      let sum = 0;
      for (const e of entries) {
        counts[e.value - 1] += 1;
        sum += e.value;
      }
      const n = entries.length;
      return { kind: 'rating', n, max, counts, avg: n ? round2(sum / n) : 0, low: q.lowLabel || '', high: q.highLabel || '' };
    }
    case 'rank': {
      const sums = opts.map(() => 0);
      const firsts = opts.map(() => 0);
      for (const e of entries) {
        e.value.forEach((optIndex, position) => {
          sums[optIndex] += position + 1;
          if (position === 0) firsts[optIndex] += 1;
        });
      }
      const n = entries.length;
      const rows = opts.map((label, i) => ({ label, avgRank: n ? round2(sums[i] / n) : 0, firsts: firsts[i] }));
      if (n) rows.sort((a, b) => a.avgRank - b.avgRank || a.label.localeCompare(b.label));
      return { kind: 'rank', n, size: opts.length, rows };
    }
    case 'cloud': {
      const map = new Map();
      let n = 0;
      for (const e of entries) {
        let used = false;
        for (const w of e.value) {
          const key = normalizeWord(w);
          if (hide.has(key)) continue;
          used = true;
          const cur = map.get(key);
          if (cur) cur.count += 1;
          else map.set(key, { text: w, key, count: 1 });
        }
        if (used) n += 1;
      }
      const words = [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
      return { kind: 'cloud', n, words };
    }
    case 'text': {
      const items = entries
        .filter((e) => !hide.has(e.uid))
        .sort((a, b) => b.at - a.at)
        .map((e) => ({ uid: e.uid, text: e.value, name: e.name }));
      return { kind: 'text', n: items.length, items };
    }
    default:
      return { kind: 'none', n: 0 };
  }
}

// The version of a tally that is safe to show participants: no names, no ids,
// and capped in size.
export function publicTally(t) {
  if (t.kind === 'text') {
    return { kind: 'text', n: t.n, items: t.items.slice(0, LIMITS.sharedTexts).map((i) => ({ text: i.text })) };
  }
  if (t.kind === 'cloud') {
    return { kind: 'cloud', n: t.n, words: t.words.slice(0, LIMITS.sharedWords).map((w) => ({ text: w.text, count: w.count })) };
  }
  return t;
}

// A participant's answer written out as plain text.
export function answerText(q, value) {
  const v = cleanAnswer(q, value);
  if (v === undefined) return '';
  const opts = optionsOf(q);
  switch (q.type) {
    case 'choice':
    case 'yesno':
      return opts[v];
    case 'multi':
      return v.map((i) => opts[i]).join('; ');
    case 'rating':
      return v;
    case 'rank':
      return v.map((i, pos) => `${pos + 1}. ${opts[i]}`).join('; ');
    case 'cloud':
      return v.join('; ');
    case 'text':
      return v;
    default:
      return '';
  }
}

// ---------- CSV ----------

export function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  // Spreadsheet programs run cells that begin with these characters as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function participantCount(session, docs) {
  return docs.filter((d) => session.questions.some((q) => cleanAnswer(q, d.a && d.a[q.id]) !== undefined)).length;
}

function headerRows(session, docs, dateText) {
  return [
    ['Poll', session.title || ''],
    ['Join code', session.code || ''],
    ['Date', dateText || ''],
    ['Names collected', session.anonymous ? 'No (anonymous)' : 'Yes'],
    ['Participants', participantCount(session, docs)],
    [],
  ];
}

// One row per answer option, with counts.
export function summaryRows(session, docs, people = {}, dateText = '') {
  const rows = headerRows(session, docs, dateText);
  rows.push(['Question number', 'Question', 'Type', 'Responses', 'Answer', 'Count', 'Percent of responses', 'Note']);
  session.questions.forEach((q, i) => {
    const hidden = (session.hidden && session.hidden[q.id]) || [];
    const t = tally(q, entriesFor(q, docs, people), hidden);
    const base = [i + 1, q.text, TYPES[q.type] || q.type, t.n];
    if (t.kind === 'bars') {
      for (const r of t.rows) rows.push([...base, r.label, r.count, r.pct + '%', t.multi ? 'Participants could choose more than one' : '']);
    } else if (t.kind === 'rating') {
      t.counts.forEach((c, idx) => {
        const label = idx === 0 && t.low ? `1 (${t.low})` : idx === t.max - 1 && t.high ? `${t.max} (${t.high})` : String(idx + 1);
        rows.push([...base, label, c, pct(c, t.n) + '%', '']);
      });
      rows.push([...base, 'Average rating', t.avg, '', `Scale of 1 to ${t.max}`]);
    } else if (t.kind === 'rank') {
      t.rows.forEach((r, idx) => {
        rows.push([...base, r.label, r.firsts, pct(r.firsts, t.n) + '%', `Place ${idx + 1} overall. Average rank ${r.avgRank}. Count is first-place votes.`]);
      });
    } else if (t.kind === 'cloud') {
      for (const w of t.words) rows.push([...base, w.text, w.count, pct(w.count, t.n) + '%', '']);
    } else if (t.kind === 'text') {
      for (const item of t.items) rows.push([...base, item.text, 1, '', session.anonymous ? '' : item.name]);
    }
  });
  return rows;
}

// One row per participant, one column per question.
// In an anonymous session the rows are shuffled and numbered, so the order
// does not show who answered first.
export function responseRows(session, docs, people = {}, dateText = '', random = Math.random) {
  const rows = headerRows(session, docs, dateText);
  rows.push(['Participant', ...session.questions.map((q, i) => `Q${i + 1}. ${q.text}`)]);
  let list = docs.filter((d) => session.questions.some((q) => cleanAnswer(q, d.a && d.a[q.id]) !== undefined));
  if (session.anonymous) {
    list = list.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  } else {
    list = list.slice().sort((a, b) => (people[a.uid] || '').localeCompare(people[b.uid] || ''));
  }
  list.forEach((d, i) => {
    const who = session.anonymous ? `Participant ${i + 1}` : people[d.uid] || '(no name given)';
    rows.push([who, ...session.questions.map((q) => answerText(q, d.a[q.id]))]);
  });
  return rows;
}

// ---------- Poll checks used by the editor ----------

export function pollProblems(poll) {
  const problems = [];
  if (!poll.title || !poll.title.trim()) problems.push({ where: 'title', message: 'Give the poll a title.' });
  if (!poll.questions || !poll.questions.length) problems.push({ where: 'questions', message: 'Add at least one question.' });
  (poll.questions || []).forEach((q, i) => {
    if (!q.text || !q.text.trim()) problems.push({ where: `q:${q.id}:text`, message: `Question ${i + 1} needs its question text.` });
    if (q.type === 'choice' || q.type === 'multi' || q.type === 'rank') {
      const filled = (q.options || []).filter((o) => o && o.trim());
      if (filled.length < 2) problems.push({ where: `q:${q.id}:options`, message: `Question ${i + 1} needs at least two answer choices.` });
      const lower = filled.map((o) => o.trim().toLowerCase());
      if (new Set(lower).size !== lower.length) problems.push({ where: `q:${q.id}:options`, message: `Question ${i + 1} has the same answer choice twice.` });
    }
  });
  return problems;
}

// Removes blank options and trims text before a poll is saved.
export function cleanPoll(poll) {
  return {
    title: (poll.title || '').trim().slice(0, 120),
    anonymous: poll.anonymous !== false,
    showResults: poll.showResults !== false,
    pacing: poll.pacing === 'self' ? 'self' : 'live',
    questions: (poll.questions || []).slice(0, LIMITS.questions).map((q) => {
      const out = { id: q.id, type: TYPES[q.type] ? q.type : 'choice', text: (q.text || '').trim().slice(0, 300) };
      if (out.type === 'choice' || out.type === 'multi' || out.type === 'rank') {
        out.options = (q.options || []).map((o) => (o || '').trim().slice(0, 120)).filter(Boolean).slice(0, LIMITS.options);
      }
      if (out.type === 'yesno') out.labels = YESNO_LABELS[q.labels] ? q.labels : 'yesno';
      if (out.type === 'rating') {
        out.scaleMax = scaleMax(q);
        out.lowLabel = (q.lowLabel || '').trim().slice(0, 40);
        out.highLabel = (q.highLabel || '').trim().slice(0, 40);
      }
      return out;
    }),
  };
}
