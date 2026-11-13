// The instructor page: sign in, build and save polls, run them, read and download results.

import * as db from './db.js';
import { h, clear, announce, askConfirm, tell, makeId, joinUrl, joinBaseShort, formatCode, plural, formatDate, downloadText, safeFilename, throttle, qrSvg } from './util.js';
import { TYPES, YESNO_LABELS, LIMITS, optionsOf, tally, publicTally, entriesFor, answerText, summaryRows, responseRows, toCsv, pollProblems, cleanPoll, cleanAnswer } from './tally.js';
import { renderTally, countLine, carryOver } from './charts.js';
import { otterSvg } from './otter.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');

let user = null;
let cleanups = [];
let dirty = false;
let currentHash = window.location.hash;
let restoringHash = false;

db.onUser((u) => {
  user = u;
  route();
});

window.addEventListener('hashchange', async () => {
  if (restoringHash) {
    restoringHash = false;
    return;
  }
  if (dirty) {
    // Go back to the editor first, then ask. Leaving happens only on a yes.
    const target = window.location.hash;
    restoringHash = true;
    window.location.hash = currentHash;
    if (await askConfirm('This poll has changes that are not saved. Leave without saving?', 'Leave without saving', true)) {
      dirty = false;
      window.location.hash = target;
    }
    return;
  }
  route();
});

window.addEventListener('beforeunload', (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});

function route() {
  currentHash = window.location.hash;
  cleanups.forEach((fn) => fn());
  cleanups = [];
  document.body.classList.remove('presenting');
  clear(app);
  drawNav();
  if (!db.isInstructor(user)) {
    if (db.isGoogleUser(user)) notAllowedView(user);
    else signInView();
    return;
  }
  const [, name, arg] = window.location.hash.split('/');
  if (name === 'new') editorView(null);
  else if (name === 'edit' && arg) editorView(arg);
  else if (name === 'present' && arg) presentView(arg);
  else if (name === 'sessions') sessionsView();
  else if (name === 'results' && arg) resultsView(arg);
  else pollsView();
}

function setTitle(title) {
  document.title = `${title} | Otter Poll`;
}

function focusHeading() {
  const heading = app.querySelector('h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function drawNav() {
  clear(nav);
  if (!db.isInstructor(user)) return;
  const [, name] = window.location.hash.split('/');
  const onSessions = name === 'sessions' || name === 'results';
  nav.append(
    h('a', { href: '#/polls', 'aria-current': onSessions ? null : 'page' }, 'My polls'),
    h('a', { href: '#/sessions', 'aria-current': onSessions ? 'page' : null }, 'Past sessions'),
    h('span', { class: 'nav-user' }, user.email || 'Signed in'),
    h('button', { class: 'btn btn-small btn-on-dark', type: 'button', onclick: () => db.signOut() }, 'Sign out'),
  );
}

function failBox(message) {
  return h('p', { class: 'notice notice-warn', role: 'alert' }, message);
}

function loading(text = 'Loading') {
  return h('p', { class: 'loading' }, text);
}

// ---------- Sign in ----------

function signInView() {
  setTitle('Instructor sign-in');
  const error = h('p', { class: 'form-error', role: 'alert' });
  const button = h(
    'button',
    {
      class: 'btn btn-primary btn-big',
      type: 'button',
      onclick: async () => {
        error.textContent = '';
        try {
          await db.signInWithGoogle();
        } catch (e) {
          error.textContent = db.explain(e);
        }
      },
    },
    'Sign in with Google',
  );
  app.append(
    h(
      'section',
      { class: 'card center' },
      h('div', { class: 'otter-box', svg: otterSvg('ballot') }),
      h('h1', null, 'Otter Poll for instructors'),
      h('p', { class: 'lead' }, 'Sign in with your Cal State Monterey Bay Google account (your @csumb.edu address) to make polls, run them with your class, and keep the results.'),
      button,
      error,
      h('p', { class: 'hint' }, 'Participants never need an account. They join with a code, a link, or a QR code.'),
    ),
    h('p', { class: 'below-card' }, 'Joining a poll? ', h('a', { href: './' }, 'Go to the participant page')),
  );
}

// Shown when someone signs in with a Google account that is not allowed to run polls.
export function notAllowedView(account) {
  setTitle('Account not allowed');
  clear(app).append(
    h(
      'section',
      { class: 'card center' },
      h('div', { class: 'otter-box', svg: otterSvg('sleep') }),
      h('h1', null, 'This account cannot run polls'),
      h('p', { class: 'lead' }, `You are signed in as ${account.email || 'an account without an email address'}. The instructor page is open only to Cal State Monterey Bay accounts, which have addresses ending in @csumb.edu.`),
      h('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: () => db.signOut() }, 'Sign in with a different account'),
      h('p', { class: 'hint' }, 'Anyone can answer a poll. Only running one needs a CSUMB account.'),
    ),
    h('p', { class: 'below-card' }, 'Joining a poll? ', h('a', { href: './' }, 'Go to the participant page')),
  );
  focusHeading();
}

// ---------- My polls ----------

function describePoll(p) {
  return [
    plural(p.questions.length, 'question'),
    p.anonymous ? 'Anonymous' : 'Names collected',
    p.showResults ? 'Results shown to participants' : 'Results kept from participants',
    p.pacing === 'self' ? 'Participants set the pace' : 'You set the pace',
  ].join(' · ');
}

const samplePoll = () => ({
  title: 'Sample poll: one of each question type',
  anonymous: true,
  showResults: true,
  pacing: 'live',
  questions: [
    { id: makeId(), type: 'choice', text: 'Which part of the reading was hardest to follow?', options: ['The introduction', 'The methods', 'The results', 'The discussion'] },
    { id: makeId(), type: 'multi', text: 'Which of these have you used for a class project?', options: ['Slides', 'A shared document', 'A spreadsheet', 'A video', 'None of these'] },
    { id: makeId(), type: 'yesno', text: 'Have you finished the reading for this week?', labels: 'yesno' },
    { id: makeId(), type: 'rating', text: 'How confident are you with the material from this week?', scaleMax: 5, lowLabel: 'Not confident', highLabel: 'Very confident' },
    { id: makeId(), type: 'rank', text: 'Put these study methods in order, starting with the one that helps you most.', options: ['Rereading notes', 'Practice questions', 'A study group', 'Office hours'] },
    { id: makeId(), type: 'cloud', text: 'What one word describes the topic for this week?' },
    { id: makeId(), type: 'text', text: 'What question do you still have?' },
  ],
});

async function startPoll(poll, button) {
  if (button) button.disabled = true;
  try {
    const code = await db.createSession(user.uid, cleanPoll(poll), poll.id || null);
    window.location.hash = `#/present/${code}`;
  } catch (e) {
    if (button) button.disabled = false;
    tell(db.explain(e));
  }
}

function pollsView() {
  setTitle('My polls');
  const list = h('div', { class: 'poll-list' }, loading('Loading your polls'));
  app.append(
    h('div', { class: 'page-head' }, h('h1', null, 'My polls'), h('a', { class: 'btn btn-primary', href: '#/new' }, 'New poll')),
    h('p', { class: 'lead' }, 'Saved polls stay here so you can run them again in another class or another term.'),
    list,
  );
  focusHeading();

  const draw = (polls) => {
    clear(list);
    if (!polls.length) {
      const sampleButton = h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: async () => {
            sampleButton.disabled = true;
            try {
              await db.savePoll(user.uid, null, samplePoll());
              announce('A sample poll was added.');
            } catch (e) {
              sampleButton.disabled = false;
              tell(db.explain(e));
            }
          },
        },
        'Add a sample poll',
      );
      list.append(
        h(
          'section',
          { class: 'card center' },
          h('div', { class: 'otter-box', svg: otterSvg('hello') }),
          h('h2', null, 'You have no polls yet'),
          h('p', null, 'Make your first poll, or add a sample that has one of each question type.'),
          h('div', { class: 'row-actions center-actions' }, h('a', { class: 'btn btn-primary', href: '#/new' }, 'Make a poll'), sampleButton),
        ),
      );
      return;
    }
    polls.forEach((poll) => {
      const startButton = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => startPoll(poll, startButton) }, 'Start', h('span', { class: 'vh' }, `: ${poll.title}`));
      list.append(
        h(
          'article',
          { class: 'card poll-card' },
          h('div', { class: 'poll-main' }, h('h2', null, poll.title), h('p', { class: 'meta' }, describePoll(poll))),
          h(
            'div',
            { class: 'row-actions' },
            startButton,
            h('a', { class: 'btn', href: `#/edit/${poll.id}` }, 'Edit', h('span', { class: 'vh' }, `: ${poll.title}`)),
            h(
              'button',
              {
                class: 'btn',
                type: 'button',
                onclick: async () => {
                  const copy = cleanPoll(poll);
                  copy.title = `${copy.title} (copy)`.slice(0, 120);
                  copy.questions = copy.questions.map((q) => ({ ...q, id: makeId() }));
                  await db.savePoll(user.uid, null, copy);
                  announce('The poll was copied.');
                },
              },
              'Duplicate',
              h('span', { class: 'vh' }, `: ${poll.title}`),
            ),
            h(
              'button',
              {
                class: 'btn btn-danger',
                type: 'button',
                onclick: async () => {
                  if (!(await askConfirm(`Delete the poll "${poll.title}"? Results from past sessions are kept.`, 'Delete poll', true))) return;
                  await db.deletePoll(user.uid, poll.id);
                  announce('The poll was deleted.');
                },
              },
              'Delete',
              h('span', { class: 'vh' }, `: ${poll.title}`),
            ),
          ),
        ),
      );
    });
  };

  cleanups.push(
    db.watchPolls(user.uid, draw, (e) => {
      clear(list);
      list.append(failBox(db.explain(e)));
    }),
  );
}

// ---------- Poll editor ----------

const blankQuestion = (type = 'choice') => ({ id: makeId(), type, text: '', options: ['', ''], labels: 'yesno', scaleMax: 5, lowLabel: '', highLabel: '' });

async function editorView(pollId) {
  setTitle(pollId ? 'Edit poll' : 'New poll');
  app.append(loading());
  let draft;
  if (pollId) {
    try {
      draft = await db.getPoll(user.uid, pollId);
    } catch (e) {
      clear(app).append(failBox(db.explain(e)));
      return;
    }
    if (!draft) {
      clear(app).append(h('h1', null, 'Poll not found'), h('p', null, h('a', { href: '#/polls' }, 'Back to my polls')));
      return;
    }
    draft.questions = draft.questions.map((q) => ({ ...blankQuestion(q.type), ...q, options: q.options ? q.options.slice() : ['', ''] }));
  } else {
    draft = { title: '', anonymous: true, showResults: true, pacing: 'live', questions: [blankQuestion()] };
  }
  clear(app);

  const touch = () => {
    dirty = true;
  };
  const field = (labelText, input, hint) => {
    const id = input.id || makeId('f');
    input.id = id;
    const wrap = h('div', { class: 'field' }, h('label', { for: id }, labelText), input);
    if (hint) {
      const hintId = `${id}-hint`;
      input.setAttribute('aria-describedby', hintId);
      wrap.append(h('p', { class: 'hint', id: hintId }, hint));
    }
    return wrap;
  };

  const titleInput = h('input', { id: 'poll-title', type: 'text', maxlength: '120', value: draft.title, oninput: (e) => { draft.title = e.target.value; touch(); } });
  const check = (id, checked, text, onchange) => h('label', { class: 'check', for: id }, h('input', { id, type: 'checkbox', checked, onchange }), h('span', null, text));
  const radio = (id, value, text) =>
    h('label', { class: 'check', for: id }, h('input', { id, type: 'radio', name: 'pacing', value, checked: draft.pacing === value, onchange: () => { draft.pacing = value; touch(); } }), h('span', null, text));

  const settings = h(
    'section',
    { class: 'card' },
    field('Poll title', titleInput, 'Participants see this title at the top of the poll.'),
    h(
      'fieldset',
      null,
      h('legend', null, 'Names'),
      check('set-anon', draft.anonymous, 'Anonymous. Participants are not asked for a name.', (e) => { draft.anonymous = e.target.checked; touch(); }),
      h('p', { class: 'hint' }, 'With this off, each participant types a name before answering, and you see names next to answers.'),
    ),
    h(
      'fieldset',
      null,
      h('legend', null, 'Results'),
      check('set-results', draft.showResults, 'Show results to participants after they answer.', (e) => { draft.showResults = e.target.checked; touch(); }),
      h('p', { class: 'hint' }, 'You can switch this on or off while the poll is running.'),
    ),
    h(
      'fieldset',
      null,
      h('legend', null, 'Pace'),
      radio('pace-live', 'live', 'I move everyone from question to question.'),
      radio('pace-self', 'self', 'Participants move through the questions at their own pace.'),
      h('p', { class: 'hint' }, 'Choose the second option for a poll people answer on their own time.'),
    ),
  );

  const qList = h('ol', { class: 'q-list' });
  const summary = h('div', { class: 'error-summary', role: 'alert', tabindex: '-1' });

  const drawQuestions = (focusKey) => {
    clear(qList);
    draft.questions.forEach((q, index) => {
      const n = index + 1;
      const move = (delta) => {
        const to = index + delta;
        if (to < 0 || to >= draft.questions.length) return;
        draft.questions.splice(to, 0, draft.questions.splice(index, 1)[0]);
        touch();
        drawQuestions(`${q.id}:${delta < 0 ? 'up' : 'down'}`);
        announce(`Question moved to position ${to + 1}.`);
      };
      const typeSelect = h(
        'select',
        {
          onchange: (e) => {
            q.type = e.target.value;
            touch();
            drawQuestions(`${q.id}:type`);
          },
          'data-focus': `${q.id}:type`,
        },
        Object.entries(TYPES).map(([value, label]) => h('option', { value, selected: q.type === value }, label)),
      );
      const textInput = h('textarea', { rows: '2', maxlength: '300', 'data-focus': `${q.id}:text`, 'data-where': `q:${q.id}:text`, oninput: (e) => { q.text = e.target.value; touch(); } }, q.text);

      const extra = h('div', { class: 'q-extra' });
      if (q.type === 'choice' || q.type === 'multi' || q.type === 'rank') {
        const box = h('fieldset', { class: 'options-edit', 'data-where': `q:${q.id}:options` }, h('legend', null, q.type === 'rank' ? 'Items to rank' : 'Answer choices'));
        q.options.forEach((opt, oi) => {
          const id = `${q.id}-o${oi}`;
          box.append(
            h(
              'div',
              { class: 'option-row' },
              h('label', { class: 'vh', for: id }, `Choice ${oi + 1}`),
              h('span', { class: 'option-num', 'aria-hidden': 'true' }, oi + 1),
              h('input', { id, type: 'text', maxlength: '120', value: opt, 'data-focus': `${q.id}:o${oi}`, oninput: (e) => { q.options[oi] = e.target.value; touch(); } }),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-small',
                  disabled: q.options.length <= 2,
                  'aria-label': `Remove choice ${oi + 1} from question ${n}`,
                  onclick: () => {
                    q.options.splice(oi, 1);
                    touch();
                    drawQuestions(`${q.id}:o${Math.max(0, oi - 1)}`);
                  },
                },
                'Remove',
              ),
            ),
          );
        });
        box.append(
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-small',
              disabled: q.options.length >= LIMITS.options,
              'data-focus': `${q.id}:add`,
              onclick: () => {
                q.options.push('');
                touch();
                drawQuestions(`${q.id}:o${q.options.length - 1}`);
              },
            },
            'Add a choice',
          ),
        );
        extra.append(box);
      } else if (q.type === 'yesno') {
        const sel = h(
          'select',
          { onchange: (e) => { q.labels = e.target.value; touch(); } },
          Object.entries(YESNO_LABELS).map(([value, pair]) => h('option', { value, selected: q.labels === value }, pair.join(' / '))),
        );
        extra.append(field('Answer labels', sel));
      } else if (q.type === 'rating') {
        const sel = h(
          'select',
          { onchange: (e) => { q.scaleMax = Number(e.target.value); touch(); drawQuestions(`${q.id}:scale`); }, 'data-focus': `${q.id}:scale` },
          [3, 4, 5, 7, 10].map((m) => h('option', { value: String(m), selected: Number(q.scaleMax) === m }, `1 to ${m}`)),
        );
        extra.append(
          field('Scale', sel),
          h(
            'div',
            { class: 'two-col' },
            field('Label for 1', h('input', { type: 'text', maxlength: '40', value: q.lowLabel || '', oninput: (e) => { q.lowLabel = e.target.value; touch(); } })),
            field(`Label for ${q.scaleMax || 5}`, h('input', { type: 'text', maxlength: '40', value: q.highLabel || '', oninput: (e) => { q.highLabel = e.target.value; touch(); } })),
          ),
          h('p', { class: 'hint' }, 'Labels tell participants what the ends of the scale mean, such as "Not confident" and "Very confident". Leave them blank if you do not need them.'),
        );
      } else if (q.type === 'cloud') {
        extra.append(h('p', { class: 'hint' }, `Each participant can enter up to ${LIMITS.words} words or short phrases. Words that more people enter are shown larger.`));
      } else {
        extra.append(h('p', { class: 'hint' }, `Each participant types an answer of up to ${LIMITS.text} characters.`));
      }

      qList.append(
        h(
          'li',
          { class: 'card q-card' },
          h(
            'div',
            { class: 'q-head' },
            h('h3', null, `Question ${n}`),
            h(
              'div',
              { class: 'row-actions' },
              h('button', { type: 'button', class: 'btn btn-small', disabled: index === 0, 'data-focus': `${q.id}:up`, 'aria-label': `Move question ${n} up`, onclick: () => move(-1) }, 'Move up'),
              h('button', { type: 'button', class: 'btn btn-small', disabled: index === draft.questions.length - 1, 'data-focus': `${q.id}:down`, 'aria-label': `Move question ${n} down`, onclick: () => move(1) }, 'Move down'),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-small',
                  disabled: draft.questions.length >= LIMITS.questions,
                  'aria-label': `Duplicate question ${n}`,
                  onclick: () => {
                    const copy = { ...q, id: makeId(), options: (q.options || []).slice() };
                    draft.questions.splice(index + 1, 0, copy);
                    touch();
                    drawQuestions(`${copy.id}:text`);
                  },
                },
                'Duplicate',
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-small btn-danger',
                  disabled: draft.questions.length <= 1,
                  'aria-label': `Delete question ${n}`,
                  onclick: () => {
                    draft.questions.splice(index, 1);
                    touch();
                    const next = draft.questions[Math.min(index, draft.questions.length - 1)];
                    drawQuestions(`${next.id}:text`);
                    announce(`Question ${n} was deleted.`);
                  },
                },
                'Delete',
              ),
            ),
          ),
          h('div', { class: 'two-col type-and-text' }, field('Question type', typeSelect), field('Question', textInput)),
          extra,
        ),
      );
    });
    if (focusKey) {
      let target = qList.querySelector(`[data-focus="${focusKey}"]`);
      if (target && target.disabled) target = target.closest('.q-card').querySelector('button:not([disabled]), textarea');
      if (target) target.focus();
    }
  };
  drawQuestions();

  const save = async (thenStart, button) => {
    const cleaned = cleanPoll(draft);
    const problems = pollProblems(cleaned);
    clear(summary);
    app.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    if (problems.length) {
      summary.append(h('p', null, plural(problems.length, 'thing') + ' to fix before saving:'), h('ul', null, problems.map((p) => h('li', null, p.message))));
      problems.forEach((p) => {
        const el = p.where === 'title' ? titleInput : qList.querySelector(`[data-where="${p.where}"]`);
        if (!el) return;
        // A group of answer choices is marked through its text boxes.
        const targets = el.tagName === 'FIELDSET' ? el.querySelectorAll('input') : [el];
        targets.forEach((t) => t.setAttribute('aria-invalid', 'true'));
      });
      summary.focus();
      return;
    }
    button.disabled = true;
    try {
      const id = await db.savePoll(user.uid, pollId, cleaned);
      dirty = false;
      if (thenStart) await startPoll({ ...cleaned, id }, null);
      else {
        announce('The poll was saved.');
        window.location.hash = '#/polls';
      }
    } catch (e) {
      button.disabled = false;
      summary.append(h('p', null, db.explain(e)));
      summary.focus();
    }
  };

  const saveButton = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => save(false, saveButton) }, 'Save');
  const startButton = h('button', { class: 'btn', type: 'button', onclick: () => save(true, startButton) }, 'Save and start');

  app.append(
    h('h1', null, pollId ? 'Edit poll' : 'New poll'),
    settings,
    h('h2', null, 'Questions'),
    qList,
    h(
      'p',
      null,
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => {
            if (draft.questions.length >= LIMITS.questions) return;
            const q = blankQuestion(draft.questions.length ? draft.questions[draft.questions.length - 1].type : 'choice');
            draft.questions.push(q);
            touch();
            drawQuestions(`${q.id}:text`);
          },
        },
        'Add a question',
      ),
    ),
    summary,
    h('div', { class: 'row-actions form-footer' }, saveButton, startButton, h('a', { class: 'btn', href: '#/polls' }, 'Cancel')),
  );
  focusHeading();
}

// ---------- Presenting a live poll ----------

function presentView(code) {
  setTitle('Presenting');
  document.body.classList.add('presenting');
  let session;
  let docs = [];
  let people = {};
  let built = false;
  let started = false;
  const ui = { onScreen: true, moderating: false, selfIndex: 0, lastShared: '', joinOpen: true };
  const refs = {};

  app.append(loading('Opening the poll'));

  const publish = throttle((payload, text) => {
    ui.lastShared = text;
    db.updateSession(code, { shared: payload }).catch(() => {
      ui.lastShared = '';
    });
  }, 2500);

  const index = () => {
    const last = session.questions.length - 1;
    return Math.min(Math.max(0, session.pacing === 'self' ? ui.selfIndex : session.current || 0), last);
  };

  const act = async (fn) => {
    try {
      await fn();
    } catch (e) {
      tell(db.explain(e));
    }
  };

  const go = (delta) => {
    const to = index() + delta;
    if (to < 0 || to >= session.questions.length) return;
    ui.moderating = false;
    if (session.pacing === 'self') {
      ui.selfIndex = to;
      update();
    } else {
      act(() => db.updateSession(code, { current: to, accepting: true, shared: null }));
    }
  };

  const build = () => {
    built = true;
    clear(app);
    const url = joinUrl(code);

    const dialog = h(
      'dialog',
      { class: 'join-dialog', 'aria-labelledby': 'join-big-title' },
      h('h2', { id: 'join-big-title' }, 'Join this poll'),
      h('div', { class: 'join-big-qr' }, qrSvg(url, 'QR code that opens this poll')),
      h('p', { class: 'join-big-line' }, 'Go to ', h('strong', null, joinBaseShort())),
      h('p', { class: 'join-big-line' }, 'and enter the code ', h('strong', { class: 'join-big-code' }, formatCode(code))),
      h('form', { method: 'dialog' }, h('button', { class: 'btn btn-primary' }, 'Close')),
    );

    const copyButton = h(
      'button',
      {
        class: 'btn btn-small',
        type: 'button',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(url);
            copyButton.textContent = 'Link copied';
            announce('The join link was copied.');
          } catch (e) {
            tell(`Copy this link: ${url}`);
          }
          window.setTimeout(() => {
            copyButton.textContent = 'Copy join link';
          }, 2500);
        },
      },
      'Copy join link',
    );

    refs.join = h(
      'aside',
      { class: 'join-panel', 'aria-label': 'How to join' },
      h('h2', null, 'Join in'),
      h('div', { class: 'join-qr' }, qrSvg(url, 'QR code that opens this poll')),
      h('p', { class: 'join-label' }, 'Scan the code, or go to'),
      h('p', { class: 'join-url' }, joinBaseShort()),
      h('p', { class: 'join-label' }, 'and enter'),
      h('p', { class: 'join-code' }, formatCode(code)),
      h('div', { class: 'join-actions' }, copyButton, h('button', { class: 'btn btn-small', type: 'button', onclick: () => dialog.showModal() }, 'Show full screen')),
    );

    refs.meta = h('p', { class: 'step' });
    refs.title = h('h1', { class: 'present-question' });
    refs.count = h('p', { class: 'count present-count' });
    refs.status = h('span', { class: 'pill' });
    refs.chart = h('div', { class: 'present-chart' });

    refs.prev = h('button', { class: 'btn', type: 'button', onclick: () => go(-1) }, 'Previous');
    refs.next = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go(1) }, 'Next question');
    refs.vote = h('button', { class: 'btn', type: 'button', onclick: () => act(() => db.updateSession(code, { accepting: !session.accepting })) });
    refs.onScreen = h('input', {
      id: 'tog-screen',
      type: 'checkbox',
      role: 'switch',
      checked: true,
      onchange: (e) => {
        ui.onScreen = e.target.checked;
        update();
      },
    });
    refs.share = h('input', {
      id: 'tog-share',
      type: 'checkbox',
      role: 'switch',
      onchange: (e) => {
        const on = e.target.checked;
        act(() => db.updateSession(code, on ? { showResults: true } : { showResults: false, shared: null }));
      },
    });
    refs.moderate = h('button', {
      class: 'btn btn-small',
      type: 'button',
      'aria-pressed': 'false',
      onclick: () => {
        ui.moderating = !ui.moderating;
        update();
      },
    });
    refs.restore = h(
      'button',
      {
        class: 'btn btn-small',
        type: 'button',
        onclick: () => act(() => db.restoreHidden(code, session.questions[index()].id)),
      },
      'Bring back hidden entries',
    );
    refs.reset = h(
      'button',
      {
        class: 'btn btn-small',
        type: 'button',
        onclick: async () => {
          const q = session.questions[index()];
          if (!(await askConfirm('Clear every answer to this question? Participants can then answer it again. This cannot be undone.', 'Clear answers', true))) return;
          act(() => db.clearQuestion(code, q.id));
        },
      },
      'Clear answers to this question',
    );
    refs.full = h(
      'button',
      {
        class: 'btn btn-small',
        type: 'button',
        onclick: () => {
          if (document.fullscreenElement) document.exitFullscreen();
          else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
        },
      },
      'Full screen',
    );
    refs.end = h(
      'button',
      {
        class: 'btn btn-danger',
        type: 'button',
        onclick: async () => {
          if (!(await askConfirm('End this poll? Participants will no longer be able to answer. You keep the results.', 'End poll', true))) return;
          act(async () => {
            await db.endSession(code);
            window.location.hash = `#/results/${code}`;
          });
        },
      },
      'End poll',
    );

    app.append(
      h(
        'div',
        { class: 'present' },
        refs.join,
        h(
          'section',
          { class: 'stage', 'aria-label': 'Current question' },
          h('div', { class: 'stage-top' }, refs.meta, refs.status),
          refs.title,
          refs.count,
          refs.chart,
        ),
      ),
      h(
        'div',
        { class: 'controls', role: 'group', 'aria-label': 'Poll controls' },
        h('div', { class: 'controls-main' }, refs.prev, refs.next, refs.vote),
        h(
          'div',
          { class: 'controls-toggles' },
          h('label', { class: 'check', for: 'tog-screen' }, refs.onScreen, h('span', null, 'Show results on this screen')),
          h('label', { class: 'check', for: 'tog-share' }, refs.share, h('span', null, 'Show results to participants')),
        ),
        h('div', { class: 'controls-more' }, refs.moderate, refs.restore, refs.reset, refs.full, h('a', { class: 'btn btn-small', href: `#/results/${code}` }, 'Results and downloads')),
        h('div', { class: 'controls-end' }, refs.end),
      ),
      dialog,
    );
    focusHeading();
  };

  const update = () => {
    if (!session) return;
    if (!built) build();
    const i = index();
    const q = session.questions[i];
    const total = session.questions.length;
    const hidden = (session.hidden && session.hidden[q.id]) || [];
    const t = tally(q, entriesFor(q, docs, people), hidden);
    const self = session.pacing === 'self';

    setTitle(`Presenting: ${session.title}`);
    refs.meta.textContent = `${session.title} · Question ${i + 1} of ${total} · ${TYPES[q.type]}`;
    if (refs.title.textContent !== q.text) refs.title.textContent = q.text;
    const people_n = docs.filter((d) => session.questions.some((qq) => cleanAnswer(qq, d.a[qq.id]) !== undefined)).length;
    refs.count.textContent = `${countLine(t)}${total > 1 ? ` · ${plural(people_n, 'participant')} so far` : ''}`;
    refs.status.textContent = session.accepting ? 'Voting is open' : 'Voting is closed';
    refs.status.classList.toggle('pill-closed', !session.accepting);

    refs.prev.disabled = i === 0;
    refs.next.disabled = i === total - 1;
    refs.vote.textContent = session.accepting ? (self ? 'Pause voting' : 'Close voting') : self ? 'Resume voting' : 'Reopen voting';
    refs.share.checked = !!session.showResults;

    const canModerate = q.type === 'text' || q.type === 'cloud';
    refs.moderate.hidden = !canModerate;
    refs.moderate.textContent = ui.moderating ? 'Done hiding entries' : 'Hide an entry';
    refs.moderate.setAttribute('aria-pressed', String(ui.moderating));
    refs.restore.hidden = !(canModerate && hidden.length);

    // Redrawing the chart must not strand keyboard focus that was on a Hide button.
    const focused = document.activeElement;
    const focusKey = focused && refs.chart.contains(focused) ? focused.getAttribute('data-hide-key') : null;
    const oldChart = ui.chartQid === q.id ? refs.chart.firstElementChild : null;
    const nextChart = ui.onScreen
      ? renderTally(t, {
          showNames: !session.anonymous,
          onHide: canModerate && ui.moderating ? (key) => act(() => db.hideEntry(code, q.id, key)) : null,
        })
      : null;
    // As answers arrive, bars glide from their old lengths to the new ones.
    if (nextChart && oldChart) carryOver(oldChart, nextChart);
    ui.chartQid = q.id;
    clear(refs.chart);
    if (nextChart) {
      refs.chart.append(nextChart);
    } else {
      refs.chart.append(h('div', { class: 'chart-hidden' }, h('div', { class: 'otter-box small', svg: otterSvg('sleep') }), h('p', null, 'Results are hidden on this screen.')));
    }
    if (focusKey) {
      const again = [...refs.chart.querySelectorAll('[data-hide-key]')].find((b) => b.getAttribute('data-hide-key') === focusKey);
      (again || refs.moderate).focus();
    }

    // Send the current results to participants, at most once every 2.5 seconds.
    // Each send costs one database read per connected participant.
    if (!self && session.status === 'open' && session.showResults) {
      const payload = { qid: q.id, tally: publicTally(t) };
      const text = JSON.stringify(payload);
      if (text !== ui.lastShared || !session.shared) publish(payload, text);
    }
  };

  const fail = (e) => {
    clear(app).append(failBox(db.explain(e)), h('p', null, h('a', { href: '#/polls' }, 'Back to my polls')));
  };

  cleanups.push(
    db.watchSession(
      code,
      (s) => {
        if (!s) {
          clear(app).append(h('h1', null, 'Session not found'), h('p', null, h('a', { href: '#/polls' }, 'Back to my polls')));
          return;
        }
        if (s.owner !== user.uid) {
          clear(app).append(h('h1', null, 'This session belongs to another account'), h('p', null, h('a', { href: '#/polls' }, 'Back to my polls')));
          return;
        }
        if (s.status === 'ended') {
          window.location.hash = `#/results/${code}`;
          return;
        }
        session = s;
        if (!started) {
          started = true;
          cleanups.push(
            db.watchResponses(
              code,
              (list) => {
                docs = list;
                update();
              },
              fail,
            ),
          );
          if (!s.anonymous) {
            cleanups.push(
              db.watchPeople(
                code,
                (map) => {
                  people = map;
                  update();
                },
                fail,
              ),
            );
          }
        }
        update();
      },
      fail,
    ),
  );
}

// ---------- Past sessions ----------

async function sessionsView() {
  setTitle('Past sessions');
  const list = h('div', { class: 'poll-list' }, loading('Loading your sessions'));
  app.append(h('h1', null, 'Past sessions'), h('p', { class: 'lead' }, 'Each time you start a poll, its answers are kept here until you delete them.'), list);
  focusHeading();
  let sessions;
  try {
    sessions = await db.listSessions(user.uid);
  } catch (e) {
    clear(list).append(failBox(db.explain(e)));
    return;
  }
  clear(list);
  const showEmpty = () => {
    list.append(h('section', { class: 'card center' }, h('div', { class: 'otter-box', svg: otterSvg('sleep') }), h('h2', null, 'No sessions yet'), h('p', null, 'Start a poll from My polls and its results will be saved here.')));
  };
  if (!sessions.length) {
    showEmpty();
    return;
  }
  sessions.forEach((s) => {
    const open = s.status === 'open';
    const card = h(
      'article',
      { class: 'card poll-card' },
      h(
        'div',
        { class: 'poll-main' },
        h('h2', null, s.title),
        h('p', { class: 'meta' }, [formatDate(s.createdAt), `Code ${formatCode(s.code)}`, open ? 'Still open' : 'Ended', s.anonymous ? 'Anonymous' : 'Names collected'].filter(Boolean).join(' · ')),
      ),
      h(
        'div',
        { class: 'row-actions' },
        h('a', { class: 'btn btn-primary', href: `#/results/${s.code}` }, 'Results', h('span', { class: 'vh' }, `: ${s.title}, ${formatDate(s.createdAt)}`)),
        open ? h('a', { class: 'btn', href: `#/present/${s.code}` }, 'Resume', h('span', { class: 'vh' }, `: ${s.title}`)) : null,
        h(
          'button',
          {
            class: 'btn btn-danger',
            type: 'button',
            onclick: async (e) => {
              if (!(await askConfirm(`Delete this session of "${s.title}" and all of its answers? This cannot be undone.`, 'Delete session', true))) return;
              e.target.disabled = true;
              try {
                await db.deleteSession(s.code);
                card.remove();
                announce('The session was deleted.');
                if (!list.children.length) showEmpty();
                focusHeading();
              } catch (err) {
                e.target.disabled = false;
                tell(db.explain(err));
              }
            },
          },
          'Delete',
          h('span', { class: 'vh' }, `: ${s.title}, ${formatDate(s.createdAt)}`),
        ),
      ),
    );
    list.append(card);
  });
}

// ---------- Results for one session ----------

async function resultsView(code) {
  setTitle('Results');
  app.append(loading('Loading results'));
  let session;
  let docs;
  let people = {};
  try {
    session = await db.getSession(code);
    if (!session || session.owner !== user.uid) {
      clear(app).append(h('h1', null, 'Results not found'), h('p', null, h('a', { href: '#/sessions' }, 'Back to past sessions')));
      return;
    }
    docs = await db.fetchResponses(code);
    if (!session.anonymous) people = await db.fetchPeople(code);
  } catch (e) {
    clear(app).append(failBox(db.explain(e)), h('p', null, h('a', { href: '#/sessions' }, 'Back to past sessions')));
    return;
  }
  clear(app);
  setTitle(`Results: ${session.title}`);
  const open = session.status === 'open';
  const dateText = formatDate(session.createdAt);
  const participants = docs.filter((d) => session.questions.some((q) => cleanAnswer(q, d.a[q.id]) !== undefined));
  const fileBase = `${safeFilename(session.title)}-${session.code.toLowerCase()}`;

  app.append(
    h('p', { class: 'no-print' }, h('a', { href: '#/sessions' }, 'Back to past sessions')),
    h('h1', null, session.title),
    h('p', { class: 'meta' }, [dateText, `Code ${formatCode(session.code)}`, plural(participants.length, 'participant'), session.anonymous ? 'Anonymous' : 'Names collected', open ? 'Still open' : 'Ended'].join(' · ')),
    h(
      'div',
      { class: 'row-actions no-print' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => downloadText(`${fileBase}-summary.csv`, toCsv(summaryRows(session, docs, people, dateText))) }, 'Download summary (CSV)'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => downloadText(`${fileBase}-responses.csv`, toCsv(responseRows(session, docs, people, dateText))) }, 'Download every response (CSV)'),
      h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Print or save as PDF'),
      open ? h('a', { class: 'btn', href: `#/present/${code}` }, 'Back to presenting') : null,
      open ? h('button', { class: 'btn', type: 'button', onclick: () => route() }, 'Refresh') : null,
    ),
    h('p', { class: 'hint no-print' }, 'The summary file has one row per answer choice with its count. The responses file has one row per participant. Both open in Excel, Numbers, and Google Sheets.'),
  );

  session.questions.forEach((q, i) => {
    const hidden = (session.hidden && session.hidden[q.id]) || [];
    const t = tally(q, entriesFor(q, docs, people), hidden);
    app.append(
      h(
        'section',
        { class: 'card result-card' },
        h('p', { class: 'step' }, `Question ${i + 1} of ${session.questions.length} · ${TYPES[q.type]}`),
        h('h2', null, q.text),
        h('p', { class: 'count' }, countLine(t)),
        renderTally(t, { showNames: !session.anonymous }),
      ),
    );
  });

  if (!session.anonymous && participants.length) {
    const sorted = participants.slice().sort((a, b) => (people[a.uid] || '').localeCompare(people[b.uid] || ''));
    app.append(
      h(
        'section',
        { class: 'card result-card' },
        h('h2', { id: 'by-person' }, 'Answers by participant'),
        h(
          'div',
          { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-labelledby': 'by-person' },
          h(
            'table',
            null,
            h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Participant'), session.questions.map((q, i) => h('th', { scope: 'col' }, `Q${i + 1}. ${q.text}`)))),
            h(
              'tbody',
              null,
              sorted.map((d) => h('tr', null, h('th', { scope: 'row' }, people[d.uid] || '(no name given)'), session.questions.map((q) => h('td', null, String(answerText(q, d.a[q.id])))))),
            ),
          ),
        ),
      ),
    );
  }

  app.append(
    h(
      'p',
      { class: 'no-print danger-zone' },
      h(
        'button',
        {
          class: 'btn btn-danger',
          type: 'button',
          onclick: async (e) => {
            if (!(await askConfirm('Delete this session and all of its answers? This cannot be undone.', 'Delete session', true))) return;
            e.target.disabled = true;
            try {
              await db.deleteSession(code);
              window.location.hash = '#/sessions';
            } catch (err) {
              e.target.disabled = false;
              tell(db.explain(err));
            }
          },
        },
        'Delete this session and its answers',
      ),
    ),
  );
  focusHeading();
}
