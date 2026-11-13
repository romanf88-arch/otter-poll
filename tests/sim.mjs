// Simulated participants for testing Otter Poll against the real Firebase project.
// Start a poll on the instructor page first, then use its join code here.
// Needs the firebase package: run "npm install" in the otter-poll folder once.
// Usage:
//   node tests/sim.mjs vote CODE COUNT [all|current] [names]  -> COUNT anonymous users answer
//   node tests/sim.mjs rules CODE                             -> checks what a participant is and is not allowed to do
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, collection, serverTimestamp, terminate } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDOkvYyu1DyULufkfzpNI5b4XDifCVQWt0',
  authDomain: 'otter-poll.firebaseapp.com',
  projectId: 'otter-poll',
  storageBucket: 'otter-poll.firebasestorage.app',
  messagingSenderId: '361019924103',
  appId: '1:361019924103:web:9340eb20f0dba26bdae222',
};

const [mode, code, countArg, scope = 'current', withNames] = process.argv.slice(2);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const WORDS = ['kelp', 'Kelp', 'tide', 'fog', 'otters', 'waves', 'bay', 'sand', 'cypress', 'tide pools', 'surf', 'fog'];
const TEXTS = ['How does this apply to the midterm?', 'Can we see one more example?', 'Why does the second step come first?', 'Is the reading on the exam?', 'What is the difference between the two models?', "I'm fine, no questions.", '=SUM(1,2) spreadsheet test', 'Could you post the slides?'];
const NAMES = ['Ana', 'Ben', 'Carmen', 'Dev', 'Elena', 'Farid', 'Grace', 'Hiro', 'Ines', 'Jamal', 'Kim', 'Luis', 'Maya', 'Noor', 'Omar', 'Priya'];

function optionsOf(q) {
  if (q.type === 'yesno') return { yesno: ['Yes', 'No'], truefalse: ['True', 'False'], agree: ['Agree', 'Disagree'] }[q.labels || 'yesno'];
  return q.options || [];
}

function randomAnswer(q) {
  const n = optionsOf(q).length;
  switch (q.type) {
    case 'choice':
    case 'yesno':
      return Math.floor(Math.pow(Math.random(), 1.6) * n);
    case 'multi': {
      const picked = [];
      for (let i = 0; i < n; i++) if (Math.random() < 0.45) picked.push(i);
      return picked.length ? picked : [0];
    }
    case 'rating':
      return 1 + Math.floor(Math.random() * (q.scaleMax || 5));
    case 'rank': {
      const order = [...Array(n).keys()];
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      return order;
    }
    case 'cloud':
      return [pick(WORDS), pick(WORDS)].filter((w, i, a) => a.findIndex((x) => x.toLowerCase() === w.toLowerCase()) === i);
    default:
      return pick(TEXTS);
  }
}

async function newUser(i) {
  const app = initializeApp(firebaseConfig, `sim-${Date.now()}-${i}`);
  const auth = getAuth(app);
  const cred = await signInAnonymously(auth);
  return { app, db: getFirestore(app), uid: cred.user.uid };
}

async function close(u) {
  await terminate(u.db).catch(() => {});
  await deleteApp(u.app).catch(() => {});
}

async function expectDenied(label, fn) {
  try {
    await fn();
    console.log(`FAIL (was allowed): ${label}`);
    return false;
  } catch (e) {
    const denied = String(e.code).includes('permission-denied');
    console.log(`${denied ? 'ok  ' : 'FAIL'} ${label} -> ${e.code}`);
    return denied;
  }
}

async function expectAllowed(label, fn) {
  try {
    await fn();
    console.log(`ok   ${label}`);
    return true;
  } catch (e) {
    console.log(`FAIL (was denied): ${label} -> ${e.code}`);
    return false;
  }
}

if (mode === 'vote') {
  const count = Number(countArg || 5);
  const started = Date.now();
  const results = await Promise.all(
    [...Array(count).keys()].map(async (i) => {
      const u = await newUser(i);
      try {
        const snap = await getDoc(doc(u.db, 'sessions', code));
        if (!snap.exists()) throw new Error('no session');
        const s = snap.data();
        const qs = scope === 'all' ? s.questions : [s.questions[s.current || 0]];
        if (!s.anonymous || withNames) await setDoc(doc(u.db, 'sessions', code, 'people', u.uid), { name: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ' ' + (i + 1) : ''}` });
        const a = {};
        for (const q of qs) a[q.id] = randomAnswer(q);
        await setDoc(doc(u.db, 'sessions', code, 'responses', u.uid), { a, at: serverTimestamp() }, { merge: true });
        return 'ok';
      } catch (e) {
        return `error ${e.code || e.message}`;
      } finally {
        await close(u);
      }
    }),
  );
  const ok = results.filter((r) => r === 'ok').length;
  console.log(`${ok} of ${count} simulated participants answered in ${Date.now() - started} ms`);
  const bad = results.filter((r) => r !== 'ok');
  if (bad.length) console.log([...new Set(bad)].join('\n'));
} else if (mode === 'rules') {
  const a = await newUser(1);
  const b = await newUser(2);
  const snap = await getDoc(doc(a.db, 'sessions', code));
  const s = snap.data();
  const q = s.questions[s.current || 0];
  console.log(`session: pacing=${s.pacing} showResults=${s.showResults} accepting=${s.accepting} status=${s.status}`);
  const checks = [];
  checks.push(await expectAllowed('participant reads the session', () => getDoc(doc(a.db, 'sessions', code))));
  if (s.accepting && s.status === 'open') {
    checks.push(await expectAllowed('participant writes own answer', () => setDoc(doc(a.db, 'sessions', code, 'responses', a.uid), { a: { [q.id]: randomAnswer(q) }, at: serverTimestamp() }, { merge: true })));
  } else {
    checks.push(await expectDenied('participant writes an answer while voting is closed', () => setDoc(doc(a.db, 'sessions', code, 'responses', a.uid), { a: { [q.id]: randomAnswer(q) }, at: serverTimestamp() }, { merge: true })));
  }
  checks.push(await expectAllowed('participant reads own answer', () => getDoc(doc(a.db, 'sessions', code, 'responses', a.uid))));
  checks.push(await expectAllowed('participant saves own name', () => setDoc(doc(a.db, 'sessions', code, 'people', a.uid), { name: 'Rules Tester' })));
  checks.push(await expectDenied("participant writes another participant's answer", () => setDoc(doc(b.db, 'sessions', code, 'responses', a.uid), { a: { [q.id]: 0 }, at: serverTimestamp() }, { merge: true })));
  // A self-paced poll that shares results lets participants read answers (which carry no names),
  // because no instructor page is open to add them up.
  if (s.pacing === 'self' && s.showResults) {
    checks.push(await expectAllowed('self-paced poll that shares results: participant reads all answers', () => getDocs(collection(b.db, 'sessions', code, 'responses'))));
  } else {
    checks.push(await expectDenied("participant reads another participant's answer", () => getDoc(doc(b.db, 'sessions', code, 'responses', a.uid))));
    checks.push(await expectDenied('participant reads all answers', () => getDocs(collection(b.db, 'sessions', code, 'responses'))));
  }
  checks.push(await expectDenied('participant reads all names', () => getDocs(collection(b.db, 'sessions', code, 'people'))));
  checks.push(await expectDenied("participant reads another participant's name", () => getDoc(doc(b.db, 'sessions', code, 'people', a.uid))));
  checks.push(await expectDenied('participant changes the session', () => updateDoc(doc(b.db, 'sessions', code), { accepting: true, showResults: true })));
  checks.push(await expectDenied('participant ends the session', () => updateDoc(doc(b.db, 'sessions', code), { status: 'ended' })));
  checks.push(await expectDenied('participant creates a session', () => setDoc(doc(b.db, 'sessions', 'ZZZZ99'), { owner: b.uid, title: 'x' })));
  checks.push(await expectDenied('participant lists all sessions', () => getDocs(collection(b.db, 'sessions'))));
  checks.push(await expectDenied("participant reads the instructor's saved polls", () => getDocs(collection(b.db, 'users', s.owner, 'polls'))));
  checks.push(await expectDenied('participant saves a poll under own id', () => setDoc(doc(b.db, 'users', b.uid, 'polls', 'x'), { title: 'x' })));
  checks.push(await expectDenied('participant writes extra fields in an answer document', () => setDoc(doc(b.db, 'sessions', code, 'responses', b.uid), { a: {}, at: serverTimestamp(), admin: true })));
  checks.push(await expectDenied('participant saves a name longer than 60 characters', () => setDoc(doc(b.db, 'sessions', code, 'people', b.uid), { name: 'x'.repeat(61) })));
  console.log(`${checks.filter(Boolean).length} of ${checks.length} rule checks passed`);
  await close(a);
  await close(b);
} else {
  console.log('usage: node tests/sim.mjs vote CODE COUNT [all|current] [names] | node tests/sim.mjs rules CODE');
}
process.exit(0);
