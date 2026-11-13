// Everything that talks to Firebase is in this file.
//
// Data layout in Firestore:
//   users/{uid}/polls/{pollId}            an instructor's saved polls
//   sessions/{code}                        one run of a poll; the id is the join code
//   sessions/{code}/responses/{uid}        one participant's answers: { a: { questionId: value } }
//   sessions/{code}/people/{uid}           a participant's name, only when names are collected

// The Firebase SDK is loaded from Google's CDN at a fixed version.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import * as authMod from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import * as fs from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';
import { makeCode } from './util.js';
import { canInstruct } from './access.js';

const app = initializeApp(firebaseConfig);
// The participant page never opens a sign-in window. Set up this way, Firebase
// skips the extra files it would otherwise fetch on phones to prepare one.
// The instructor page keeps the standard setup, which the Google sign-in needs.
const isParticipantPage = document.body.classList.contains('participant');
const auth = isParticipantPage
  ? authMod.initializeAuth(app, { persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence] })
  : authMod.getAuth(app);
const db = fs.getFirestore(app);

const millis = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);

// ---------- Sign-in ----------

export function onUser(callback) {
  return authMod.onAuthStateChanged(auth, callback);
}

// Signed in with Google (participants are signed in anonymously).
export const isGoogleUser = (user) => !!user && !user.isAnonymous;

// Signed in with an account that is allowed to run polls.
export const isInstructor = (user) => canInstruct(user);

export function signInWithGoogle() {
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return authMod.signInWithPopup(auth, provider);
}

export function signOut() {
  return authMod.signOut(auth);
}

// Participants get an anonymous id so each device can answer once.
// Resolves with the current user, signing in anonymously if nobody is signed in.
export function ensureUser() {
  return new Promise((resolve, reject) => {
    const stop = authMod.onAuthStateChanged(auth, (user) => {
      stop();
      if (user) resolve(user);
      else authMod.signInAnonymously(auth).then((cred) => resolve(cred.user), reject);
    });
  });
}

export const currentUid = () => (auth.currentUser ? auth.currentUser.uid : null);

// ---------- Saved polls (instructor) ----------

const pollsRef = (uid) => fs.collection(db, 'users', uid, 'polls');

export function watchPolls(uid, callback, onError) {
  return fs.onSnapshot(
    pollsRef(uid),
    (snap) => {
      const polls = snap.docs.map((d) => ({ id: d.id, ...d.data(), updatedAt: millis(d.data().updatedAt) }));
      polls.sort((a, b) => b.updatedAt - a.updatedAt);
      callback(polls);
    },
    onError,
  );
}

export async function getPoll(uid, pollId) {
  const snap = await fs.getDoc(fs.doc(pollsRef(uid), pollId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function savePoll(uid, pollId, poll) {
  const ref = pollId ? fs.doc(pollsRef(uid), pollId) : fs.doc(pollsRef(uid));
  await fs.setDoc(ref, { ...poll, updatedAt: fs.serverTimestamp() });
  return ref.id;
}

export function deletePoll(uid, pollId) {
  return fs.deleteDoc(fs.doc(pollsRef(uid), pollId));
}

// ---------- Sessions ----------

const sessionRef = (code) => fs.doc(db, 'sessions', code);
const responsesRef = (code) => fs.collection(db, 'sessions', code, 'responses');
const peopleRef = (code) => fs.collection(db, 'sessions', code, 'people');

const sessionFrom = (snap) => {
  const data = snap.data();
  return { code: snap.id, ...data, createdAt: millis(data.createdAt), endedAt: millis(data.endedAt) };
};

export async function createSession(uid, poll, pollId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    const ref = sessionRef(code);
    const existing = await fs.getDoc(ref);
    if (existing.exists()) continue;
    await fs.setDoc(ref, {
      owner: uid,
      pollId: pollId || null,
      title: poll.title,
      anonymous: poll.anonymous,
      showResults: poll.showResults,
      pacing: poll.pacing,
      questions: poll.questions,
      status: 'open',
      accepting: true,
      current: 0,
      shared: null,
      hidden: {},
      createdAt: fs.serverTimestamp(),
      endedAt: null,
    });
    return code;
  }
  throw new Error('Could not create a join code. Please try again.');
}

export function watchSession(code, callback, onError) {
  return fs.onSnapshot(sessionRef(code), (snap) => callback(snap.exists() ? sessionFrom(snap) : null), onError);
}

export function updateSession(code, patch) {
  return fs.updateDoc(sessionRef(code), patch);
}

// Removes one short answer (by participant id) or one word from the displays.
export function hideEntry(code, questionId, key) {
  return fs.updateDoc(sessionRef(code), { [`hidden.${questionId}`]: fs.arrayUnion(key) });
}

export function restoreHidden(code, questionId) {
  return fs.updateDoc(sessionRef(code), { [`hidden.${questionId}`]: [] });
}

export function endSession(code) {
  return fs.updateDoc(sessionRef(code), { status: 'ended', accepting: false, endedAt: fs.serverTimestamp() });
}

export async function listSessions(uid) {
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'sessions'), fs.where('owner', '==', uid)));
  return snap.docs.map(sessionFrom).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSession(code) {
  const snap = await fs.getDoc(sessionRef(code));
  return snap.exists() ? sessionFrom(snap) : null;
}

const responseFrom = (d) => ({ uid: d.id, a: d.data().a || {}, at: millis(d.data().at) });

export function watchResponses(code, callback, onError) {
  return fs.onSnapshot(responsesRef(code), (snap) => callback(snap.docs.map(responseFrom)), onError);
}

export async function fetchResponses(code) {
  const snap = await fs.getDocs(responsesRef(code));
  return snap.docs.map(responseFrom);
}

export function watchPeople(code, callback, onError) {
  return fs.onSnapshot(
    peopleRef(code),
    (snap) => {
      const people = {};
      snap.docs.forEach((d) => {
        people[d.id] = d.data().name || '';
      });
      callback(people);
    },
    onError,
  );
}

export async function fetchPeople(code) {
  const snap = await fs.getDocs(peopleRef(code));
  const people = {};
  snap.docs.forEach((d) => {
    people[d.id] = d.data().name || '';
  });
  return people;
}

// Removes every participant's answer to one question.
export async function clearQuestion(code, questionId) {
  const snap = await fs.getDocs(responsesRef(code));
  const docs = snap.docs.filter((d) => d.data().a && d.data().a[questionId] !== undefined);
  for (let i = 0; i < docs.length; i += 400) {
    const batch = fs.writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { [`a.${questionId}`]: fs.deleteField() }));
    await batch.commit();
  }
}

// Deletes a session with all answers and names.
export async function deleteSession(code) {
  for (const ref of [responsesRef(code), peopleRef(code)]) {
    const snap = await fs.getDocs(ref);
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = fs.writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await fs.deleteDoc(sessionRef(code));
}

// ---------- Participant ----------

export function watchMyResponse(code, uid, callback, onError) {
  return fs.onSnapshot(
    fs.doc(responsesRef(code), uid),
    (snap) => {
      // An answer counts as received only after the server has confirmed it.
      if (snap.metadata.hasPendingWrites) return;
      callback(snap.exists() ? snap.data().a || {} : {});
    },
    onError,
  );
}

export function submitAnswer(code, uid, questionId, value) {
  return fs.setDoc(fs.doc(responsesRef(code), uid), { a: { [questionId]: value }, at: fs.serverTimestamp() }, { merge: true });
}

export async function getMyName(code, uid) {
  const snap = await fs.getDoc(fs.doc(peopleRef(code), uid));
  return snap.exists() ? snap.data().name || '' : '';
}

export function setMyName(code, uid, name) {
  return fs.setDoc(fs.doc(peopleRef(code), uid), { name });
}

// Turns a Firebase error into a sentence a person can act on.
export { explain } from './util.js';
