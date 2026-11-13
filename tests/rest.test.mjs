import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeValue, decodeSession } from '../js/rest.js';

test('decodeValue unwraps each Firestore type', () => {
  assert.equal(decodeValue({ stringValue: 'hi' }), 'hi');
  assert.equal(decodeValue({ integerValue: '7' }), 7);
  assert.equal(decodeValue({ doubleValue: 2.5 }), 2.5);
  assert.equal(decodeValue({ booleanValue: false }), false);
  assert.equal(decodeValue({ nullValue: null }), null);
  assert.equal(decodeValue({ timestampValue: '2026-11-13T00:00:00Z' }), Date.UTC(2026, 10, 13));
  assert.deepEqual(decodeValue({ arrayValue: { values: [{ integerValue: '1' }, { stringValue: 'a' }] } }), [1, 'a']);
  assert.deepEqual(decodeValue({ arrayValue: {} }), []);
  assert.deepEqual(decodeValue({ mapValue: { fields: { x: { booleanValue: true } } } }), { x: true });
  assert.deepEqual(decodeValue({ mapValue: {} }), {});
  assert.equal(decodeValue(undefined), null);
});

test('decodeSession rebuilds a poll session', () => {
  const doc = {
    name: 'projects/otter-poll/databases/(default)/documents/sessions/ABC234',
    fields: {
      owner: { stringValue: 'u1' },
      title: { stringValue: 'Week 3 check-in' },
      anonymous: { booleanValue: true },
      showResults: { booleanValue: true },
      pacing: { stringValue: 'live' },
      status: { stringValue: 'open' },
      accepting: { booleanValue: true },
      current: { integerValue: '1' },
      shared: { nullValue: null },
      hidden: { mapValue: {} },
      endedAt: { nullValue: null },
      createdAt: { timestampValue: '2026-11-13T01:02:03.000Z' },
      questions: {
        arrayValue: {
          values: [
            { mapValue: { fields: { id: { stringValue: 'q1' }, type: { stringValue: 'choice' }, text: { stringValue: 'Pick one' }, options: { arrayValue: { values: [{ stringValue: 'A' }, { stringValue: 'B' }] } } } } },
            { mapValue: { fields: { id: { stringValue: 'q2' }, type: { stringValue: 'rating' }, text: { stringValue: 'Rate it' }, scaleMax: { integerValue: '5' }, lowLabel: { stringValue: '' }, highLabel: { stringValue: '' } } } },
          ],
        },
      },
    },
  };
  const s = decodeSession(doc, 'ABC234');
  assert.equal(s.code, 'ABC234');
  assert.equal(s.title, 'Week 3 check-in');
  assert.equal(s.current, 1);
  assert.equal(s.accepting, true);
  assert.equal(s.shared, null);
  assert.deepEqual(s.hidden, {});
  assert.equal(s.endedAt, 0);
  assert.equal(s.createdAt, Date.UTC(2026, 10, 13, 1, 2, 3));
  assert.deepEqual(s.questions[0].options, ['A', 'B']);
  assert.equal(s.questions[1].scaleMax, 5);
});

test('decodeSession copes with an empty document', () => {
  const s = decodeSession({}, 'ABC234');
  assert.equal(s.code, 'ABC234');
  assert.equal(s.createdAt, 0);
});
