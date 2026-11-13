import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canInstruct } from '../js/access.js';

const domain = 'csumb.edu';
const owners = ['owner-uid'];
const google = (email, extra = {}) => ({ uid: 'u1', isAnonymous: false, emailVerified: true, email, ...extra });

test('a CSUMB Google account may use the instructor page', () => {
  assert.equal(canInstruct(google('faculty@csumb.edu'), domain, owners), true);
  assert.equal(canInstruct(google('Faculty@CSUMB.EDU'), domain, owners), true);
});

test('other Google accounts may not', () => {
  assert.equal(canInstruct(google('someone@gmail.com'), domain, owners), false);
  assert.equal(canInstruct(google('someone@notcsumb.edu'), domain, owners), false);
  assert.equal(canInstruct(google('someone@csumb.edu.example.com'), domain, owners), false);
  assert.equal(canInstruct(google('csumb.edu@gmail.com'), domain, owners), false);
  assert.equal(canInstruct(google(''), domain, owners), false);
});

test('an unverified address may not', () => {
  assert.equal(canInstruct(google('faculty@csumb.edu', { emailVerified: false }), domain, owners), false);
});

test('participants and signed-out visitors may not', () => {
  assert.equal(canInstruct(null, domain, owners), false);
  assert.equal(canInstruct({ uid: 'anon', isAnonymous: true, email: null }, domain, owners), false);
});

test('the account that owns the project may, whatever its address', () => {
  assert.equal(canInstruct(google('owner@gmail.com', { uid: 'owner-uid' }), domain, owners), true);
  assert.equal(canInstruct({ uid: 'owner-uid', isAnonymous: true }, domain, owners), false);
});
