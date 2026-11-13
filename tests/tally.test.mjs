import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanAnswer, entriesFor, tally, publicTally, answerText, csvCell, toCsv,
  summaryRows, responseRows, pollProblems, cleanPoll, optionsOf,
} from '../js/tally.js';

const choice = { id: 'q1', type: 'choice', text: 'Pick one', options: ['Red', 'Green', 'Blue'] };
const multi = { id: 'q2', type: 'multi', text: 'Pick any', options: ['A', 'B', 'C'] };
const yesno = { id: 'q3', type: 'yesno', text: 'Agree?', labels: 'truefalse' };
const rating = { id: 'q4', type: 'rating', text: 'Rate it', scaleMax: 5, lowLabel: 'Low', highLabel: 'High' };
const rank = { id: 'q5', type: 'rank', text: 'Order these', options: ['X', 'Y', 'Z'] };
const cloud = { id: 'q6', type: 'cloud', text: 'One word' };
const text = { id: 'q7', type: 'text', text: 'Say more' };

test('cleanAnswer accepts good answers and rejects bad ones', () => {
  assert.equal(cleanAnswer(choice, 1), 1);
  assert.equal(cleanAnswer(choice, 3), undefined);
  assert.equal(cleanAnswer(choice, '1'), undefined);
  assert.deepEqual(cleanAnswer(multi, [2, 0, 2, 9]), [0, 2]);
  assert.equal(cleanAnswer(multi, []), undefined);
  assert.equal(cleanAnswer(yesno, 1), 1);
  assert.equal(cleanAnswer(yesno, 2), undefined);
  assert.equal(cleanAnswer(rating, 5), 5);
  assert.equal(cleanAnswer(rating, 0), undefined);
  assert.equal(cleanAnswer(rating, 6), undefined);
  assert.deepEqual(cleanAnswer(rank, [2, 0, 1]), [2, 0, 1]);
  assert.equal(cleanAnswer(rank, [0, 0, 1]), undefined);
  assert.equal(cleanAnswer(rank, [0, 1]), undefined);
  assert.deepEqual(cleanAnswer(cloud, ['  Kelp ', 'kelp', '', 'Sea  otter', 'bay', 'extra']), ['Kelp', 'Sea otter', 'bay']);
  assert.equal(cleanAnswer(cloud, ['  ']), undefined);
  assert.equal(cleanAnswer(text, '  hello  '), 'hello');
  assert.equal(cleanAnswer(text, '   '), undefined);
  assert.equal(cleanAnswer(text, 'x'.repeat(400)).length, 300);
});

test('yes or no questions use the chosen label pair', () => {
  assert.deepEqual(optionsOf(yesno), ['True', 'False']);
  assert.deepEqual(optionsOf({ type: 'yesno' }), ['Yes', 'No']);
});

const docs = [
  { uid: 'u1', at: 1, a: { q1: 0, q2: [0, 1], q3: 0, q4: 5, q5: [0, 1, 2], q6: ['Kelp', 'waves'], q7: 'First' } },
  { uid: 'u2', at: 2, a: { q1: 0, q2: [1], q3: 1, q4: 4, q5: [1, 0, 2], q6: ['kelp'], q7: 'Second' } },
  { uid: 'u3', at: 3, a: { q1: 2, q2: [1, 2], q3: 0, q4: 2, q5: [0, 2, 1], q6: ['Fog'], q7: 'Third' } },
  { uid: 'u4', at: 4, a: { q1: 99 } },
  { uid: 'u5', at: 5, a: {} },
];
const people = { u1: 'Ana', u2: 'Ben', u3: 'Cy' };

test('single choice tally counts and percents', () => {
  const t = tally(choice, entriesFor(choice, docs));
  assert.equal(t.n, 3);
  assert.deepEqual(t.rows.map((r) => r.count), [2, 0, 1]);
  assert.deepEqual(t.rows.map((r) => r.pct), [67, 0, 33]);
});

test('select-all percent is out of respondents', () => {
  const t = tally(multi, entriesFor(multi, docs));
  assert.equal(t.n, 3);
  assert.deepEqual(t.rows.map((r) => r.count), [1, 3, 1]);
  assert.deepEqual(t.rows.map((r) => r.pct), [33, 100, 33]);
});

test('rating tally gives counts and average', () => {
  const t = tally(rating, entriesFor(rating, docs));
  assert.deepEqual(t.counts, [0, 1, 0, 1, 1]);
  assert.equal(t.avg, 3.67);
  assert.equal(t.max, 5);
});

test('ranking sorts by average rank', () => {
  const t = tally(rank, entriesFor(rank, docs));
  assert.deepEqual(t.rows.map((r) => r.label), ['X', 'Y', 'Z']);
  assert.deepEqual(t.rows.map((r) => r.avgRank), [1.33, 2, 2.67]);
  assert.deepEqual(t.rows.map((r) => r.firsts), [2, 1, 0]);
});

test('word cloud groups words without regard to case and honors hidden words', () => {
  const t = tally(cloud, entriesFor(cloud, docs));
  assert.equal(t.words[0].key, 'kelp');
  assert.equal(t.words[0].count, 2);
  assert.equal(t.n, 3);
  const hidden = tally(cloud, entriesFor(cloud, docs), ['kelp']);
  assert.equal(hidden.words.some((w) => w.key === 'kelp'), false);
  assert.equal(hidden.n, 2);
});

test('short answers are newest first, carry names, and honor hidden ids', () => {
  const t = tally(text, entriesFor(text, docs, people));
  assert.deepEqual(t.items.map((i) => i.text), ['Third', 'Second', 'First']);
  assert.equal(t.items[2].name, 'Ana');
  const hidden = tally(text, entriesFor(text, docs, people), ['u2']);
  assert.deepEqual(hidden.items.map((i) => i.text), ['Third', 'First']);
});

test('publicTally removes names and ids', () => {
  const p = publicTally(tally(text, entriesFor(text, docs, people)));
  assert.deepEqual(Object.keys(p.items[0]), ['text']);
  const c = publicTally(tally(cloud, entriesFor(cloud, docs)));
  assert.deepEqual(Object.keys(c.words[0]).sort(), ['count', 'text']);
});

test('an empty question tallies to zero without errors', () => {
  for (const q of [choice, multi, yesno, rating, rank, cloud, text]) {
    const t = tally(q, []);
    assert.equal(t.n, 0);
  }
  assert.equal(tally(rating, []).avg, 0);
});

test('answerText writes answers in words', () => {
  assert.equal(answerText(choice, 2), 'Blue');
  assert.equal(answerText(multi, [0, 2]), 'A; C');
  assert.equal(answerText(yesno, 1), 'False');
  assert.equal(answerText(rating, 4), 4);
  assert.equal(answerText(rank, [2, 0, 1]), '1. Z; 2. X; 3. Y');
  assert.equal(answerText(cloud, ['a', 'b']), 'a; b');
  assert.equal(answerText(choice, 7), '');
});

test('csvCell quotes and guards against formulas', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('-5 degrees'), "'-5 degrees");
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell(null), '');
  assert.equal(toCsv([['a', 1], ['b,c', 2]]), 'a,1\r\n"b,c",2\r\n');
});

const session = { title: 'Demo', code: 'ABC234', anonymous: true, questions: [choice, multi, yesno, rating, rank, cloud, text], hidden: {} };

test('summary rows include every option and the participant count', () => {
  const rows = summaryRows(session, docs, people, 'Nov 12');
  assert.deepEqual(rows[4], ['Participants', 3]);
  const header = rows.findIndex((r) => r[0] === 'Question number');
  const q1 = rows.filter((r, i) => i > header && r[0] === 1);
  assert.equal(q1.length, 3);
  assert.deepEqual(q1[0].slice(4, 7), ['Red', 2, '67%']);
  const avg = rows.find((r) => r[4] === 'Average rating');
  assert.equal(avg[5], 3.67);
});

test('anonymous response rows carry numbers instead of names', () => {
  const rows = responseRows(session, docs, people, 'Nov 12', () => 0.5);
  const header = rows.findIndex((r) => r[0] === 'Participant');
  const body = rows.slice(header + 1);
  assert.equal(body.length, 3);
  assert.deepEqual(body.map((r) => r[0]), ['Participant 1', 'Participant 2', 'Participant 3']);
  assert.equal(body.some((r) => r.includes('Ana')), false);
});

test('named response rows carry names in alphabetical order', () => {
  const rows = responseRows({ ...session, anonymous: false }, docs, people, 'Nov 12');
  const header = rows.findIndex((r) => r[0] === 'Participant');
  assert.deepEqual(rows.slice(header + 1).map((r) => r[0]), ['Ana', 'Ben', 'Cy']);
  assert.equal(rows[header + 1][1], 'Red');
});

test('pollProblems finds missing pieces', () => {
  assert.equal(pollProblems({ title: 'T', questions: [choice] }).length, 0);
  const p = pollProblems({ title: ' ', questions: [{ id: 'a', type: 'choice', text: '', options: ['One', ''] }] });
  assert.deepEqual(p.map((x) => x.where), ['title', 'q:a:text', 'q:a:options']);
  assert.equal(pollProblems({ title: 'T', questions: [] })[0].where, 'questions');
  const dup = pollProblems({ title: 'T', questions: [{ id: 'a', type: 'multi', text: 'Q', options: ['Same', 'same'] }] });
  assert.equal(dup.length, 1);
});

test('cleanPoll trims text and drops blank options', () => {
  const p = cleanPoll({ title: '  My poll ', questions: [{ id: 'a', type: 'choice', text: ' Q ', options: [' A ', '', 'B'] }, { id: 'b', type: 'rating', text: 'R', scaleMax: 99 }] });
  assert.equal(p.title, 'My poll');
  assert.equal(p.anonymous, true);
  assert.equal(p.pacing, 'live');
  assert.deepEqual(p.questions[0].options, ['A', 'B']);
  assert.equal(p.questions[1].scaleMax, 5);
});
