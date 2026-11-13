// The participant page: join with a code, answer, and see shared results.

import * as db from './db.js';
import { h, clear, announce, cleanCode, formatCode, plural } from './util.js';
import { optionsOf, scaleMax, cleanAnswer, tally, publicTally, entriesFor, answerText, LIMITS } from './tally.js';
import { renderTally, countLine } from './charts.js';
import { otterSvg } from './otter.js';

const app = document.getElementById('app');

const state = {
  code: cleanCode(new URLSearchParams(window.location.search).get('c')),
  uid: null,
  session: undefined, // undefined while loading, null when the code matches nothing
  mine: null, // my answers, null until first loaded
  nameState: 'unknown', // unknown | checking | needed | have
  name: '',
  editing: false,
  selfIndex: null,
  selfDocs: null,
  selfDocsAt: 0,
  selfLoading: false,
  viewKey: '',
  watching: false,
};

const icon = {
  up: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5l8 10H4z" fill="currentColor"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19l8-10H4z" fill="currentColor"/></svg>',
};

start();

async function start() {
  if (!state.code) {
    joinView();
    return;
  }
  messageView('loading', 'Opening the poll', 'One moment.', 'sleep');
  try {
    const user = await db.ensureUser();
    state.uid = user.uid;
  } catch (error) {
    messageView('problem', 'We could not connect', db.explain(error), 'sleep', true);
    return;
  }
  db.watchSession(state.code, onSession, (error) => messageView('problem', 'We could not open the poll', db.explain(error), 'sleep', true));
}

function onSession(session) {
  state.session = session;
  if (session && !state.watching) {
    state.watching = true;
    db.watchMyResponse(
      state.code,
      state.uid,
      (answers) => {
        state.mine = answers;
        render();
      },
      () => {
        state.mine = state.mine || {};
        render();
      },
    );
    if (!session.anonymous) {
      state.nameState = 'checking';
      db.getMyName(state.code, state.uid).then(
        (name) => {
          state.name = name;
          state.nameState = name ? 'have' : 'needed';
          render();
        },
        () => {
          state.nameState = 'needed';
          render();
        },
      );
    }
  }
  render();
}

// Rebuilds the main area only when the kind of screen changes, so a results
// update never wipes out an answer someone is in the middle of choosing.
function show(key, title, build) {
  if (state.viewKey !== key) {
    state.viewKey = key;
    clear(app);
    build();
    document.title = `${title} | Otter Poll`;
    const heading = app.querySelector('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }
}

function render() {
  const s = state.session;
  if (s === undefined) return;
  if (s === null) {
    joinView(`We could not find a poll with the code ${formatCode(state.code)}. Check the code and try again.`);
    return;
  }
  if (s.status === 'ended') {
    messageView('ended', 'This poll has ended', 'Thank you for taking part.', 'star');
    return;
  }
  if (state.mine === null || state.nameState === 'checking') return;
  if (!s.anonymous && state.nameState !== 'have') {
    nameView(s);
    return;
  }
  const total = s.questions.length;
  if (s.pacing === 'self') {
    if (state.selfIndex === null) {
      const firstOpen = s.questions.findIndex((q) => cleanAnswer(q, state.mine[q.id]) === undefined);
      state.selfIndex = firstOpen === -1 ? total : firstOpen;
    }
    if (state.selfIndex >= total) {
      finishedView(s);
      return;
    }
    questionView(s, s.questions[state.selfIndex], state.selfIndex, total);
  } else {
    const index = Math.min(Math.max(0, s.current || 0), total - 1);
    questionView(s, s.questions[index], index, total);
  }
}

// ---------- Simple screens ----------

function messageView(key, title, text, pose, withJoin) {
  show(key, title, () => {
    app.append(
      h(
        'section',
        { class: 'card center' },
        h('div', { class: 'otter-box', svg: otterSvg(pose) }),
        h('h1', null, title),
        h('p', { class: 'lead' }, text),
        withJoin ? h('p', null, h('a', { class: 'btn', href: './' }, 'Enter a different code')) : null,
      ),
    );
  });
}

function joinView(problem) {
  show('join:' + (problem || ''), 'Join a poll', () => {
    const input = h('input', {
      id: 'code',
      class: 'code-input',
      type: 'text',
      autocomplete: 'off',
      autocapitalize: 'characters',
      spellcheck: 'false',
      maxlength: '7',
      'aria-describedby': 'code-hint' + (problem ? ' code-problem' : ''),
      'aria-invalid': problem ? 'true' : null,
    });
    const error = h('p', { class: 'form-error', id: 'code-error', role: 'alert' });
    const form = h(
      'form',
      {
        class: 'join-form',
        novalidate: true,
        onsubmit: (event) => {
          event.preventDefault();
          const code = cleanCode(input.value);
          if (code.length !== 6) {
            error.textContent = 'Enter the 6-character code your instructor is showing.';
            input.setAttribute('aria-invalid', 'true');
            input.focus();
            return;
          }
          window.location.search = `?c=${code}`;
        },
      },
      h('label', { for: 'code' }, 'Join code'),
      input,
      h('p', { class: 'hint', id: 'code-hint' }, 'The code is 6 letters and numbers. Your instructor has it on the screen.'),
      error,
      h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, 'Join'),
    );
    app.append(
      h(
        'section',
        { class: 'card center' },
        h('div', { class: 'otter-box', svg: otterSvg('hello') }),
        h('h1', null, 'Join a poll'),
        problem ? h('p', { class: 'notice notice-warn', id: 'code-problem' }, problem) : null,
        form,
      ),
      h('p', { class: 'below-card' }, 'Running a poll? ', h('a', { href: 'instructor.html' }, 'Open the instructor page')),
    );
  });
}

function nameView(s) {
  show('name', 'Your name', () => {
    const input = h('input', { id: 'name', type: 'text', autocomplete: 'name', maxlength: String(LIMITS.name), 'aria-describedby': 'name-hint' });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const button = h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, 'Continue');
    const form = h(
      'form',
      {
        novalidate: true,
        onsubmit: async (event) => {
          event.preventDefault();
          const name = input.value.trim().slice(0, LIMITS.name);
          if (!name) {
            error.textContent = 'Type your name to continue.';
            input.focus();
            return;
          }
          button.disabled = true;
          try {
            await db.setMyName(state.code, state.uid, name);
            state.name = name;
            state.nameState = 'have';
            render();
          } catch (e) {
            button.disabled = false;
            error.textContent = db.explain(e);
          }
        },
      },
      h('label', { for: 'name' }, 'Your name'),
      input,
      h('p', { class: 'hint', id: 'name-hint' }, 'Your instructor will see your name with your answers. Other participants will not see it.'),
      error,
      button,
    );
    app.append(h('section', { class: 'card center' }, h('p', { class: 'eyebrow' }, s.title), h('h1', null, 'Before you start'), form));
  });
}

function finishedView(s) {
  const answered = s.questions.filter((q) => cleanAnswer(q, state.mine[q.id]) !== undefined).length;
  const total = s.questions.length;
  show(`finished:${answered}`, 'All done', () => {
    app.append(
      h(
        'section',
        { class: 'card center' },
        h('div', { class: 'otter-box', svg: otterSvg('star') }),
        h('h1', null, answered === total ? 'You answered every question' : `You answered ${answered} of ${total} questions`),
        h('p', { class: 'lead' }, 'Thank you for taking part.'),
        h(
          'p',
          null,
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: () => {
                state.selfIndex = 0;
                render();
              },
            },
            'Go back through the questions',
          ),
        ),
      ),
    );
  });
}

// ---------- Question screen ----------

function questionView(s, q, index, total) {
  const myAnswer = cleanAnswer(q, state.mine[q.id]);
  const answered = myAnswer !== undefined;
  let mode = 'done';
  if (!answered || state.editing) mode = s.accepting ? 'form' : answered ? 'done' : 'closed';
  const key = `q:${q.id}:${index}:${mode}:${s.accepting}:${mode === 'done' ? JSON.stringify(myAnswer) : ''}`;

  show(key, q.text, () => {
    const section = h('section', { class: 'card question-card' });
    section.append(
      h('p', { class: 'eyebrow' }, s.title),
      h('p', { class: 'step' }, `Question ${index + 1} of ${total}`),
      h('h1', { id: 'qtitle' }, q.text),
    );
    if (mode === 'form') section.append(answerForm(q, answered ? myAnswer : undefined));
    else if (mode === 'done') section.append(receipt(s, q, myAnswer));
    else section.append(h('p', { class: 'notice' }, 'Voting is closed for this question.'));
    app.append(section, h('div', { id: 'results' }));
    if (s.pacing === 'self') app.append(selfNav(index, total, answered));
    app.append(h('p', { class: 'below-card' }, s.anonymous ? 'This poll is anonymous. Your name is not collected.' : `Answering as ${state.name}.`));
  });

  drawResults(s, q, answered, mode);
}

function receipt(s, q, myAnswer) {
  const text = answerText(q, myAnswer);
  return h(
    'div',
    { class: 'receipt' },
    h('div', { class: 'receipt-otter', svg: otterSvg('star') }),
    h(
      'div',
      null,
      h('p', { class: 'receipt-title' }, 'Your answer is in.'),
      h('p', { class: 'receipt-answer' }, h('span', { class: 'receipt-label' }, 'You answered: '), String(text)),
      s.accepting
        ? h(
            'button',
            {
              class: 'btn btn-small',
              type: 'button',
              onclick: () => {
                state.editing = true;
                render();
              },
            },
            'Change my answer',
          )
        : h('p', { class: 'hint' }, 'Voting is closed for this question.'),
    ),
  );
}

function selfNav(index, total, answered) {
  const go = (to) => {
    state.selfIndex = to;
    state.editing = false;
    render();
  };
  return h(
    'nav',
    { class: 'self-nav', 'aria-label': 'Questions' },
    h('button', { class: 'btn', type: 'button', disabled: index === 0, onclick: () => go(index - 1) }, 'Back'),
    h('button', { class: answered ? 'btn btn-primary' : 'btn', type: 'button', onclick: () => go(index + 1) }, index + 1 === total ? 'Finish' : answered ? 'Next question' : 'Skip this question'),
  );
}

async function submit(q, value, form) {
  const error = form.querySelector('.form-error');
  const button = form.querySelector('button[type=submit]');
  const cleaned = cleanAnswer(q, value);
  if (cleaned === undefined) {
    error.textContent = { multi: 'Choose at least one answer.', cloud: 'Type at least one word.', text: 'Type an answer first.' }[q.type] || 'Choose an answer first.';
    return;
  }
  error.textContent = '';
  button.disabled = true;
  button.textContent = 'Sending';
  const slow = window.setTimeout(() => {
    error.textContent = 'Still sending. Check your internet connection.';
  }, 8000);
  try {
    await db.submitAnswer(state.code, state.uid, q.id, cleaned);
    window.clearTimeout(slow);
    state.mine = { ...state.mine, [q.id]: cleaned };
    state.editing = false;
    state.selfDocsAt = 0;
    announce('Your answer is in.');
    render();
  } catch (e) {
    window.clearTimeout(slow);
    button.disabled = false;
    button.textContent = 'Submit';
    error.textContent = e && String(e.code).includes('permission-denied') ? 'Your answer was not saved because voting has closed.' : db.explain(e);
  }
}

function answerForm(q, initial) {
  let read;
  let body;
  const opts = optionsOf(q);

  const choiceList = (inputType, isChecked) => {
    const box = h('div', { class: 'opts', role: inputType === 'radio' ? 'radiogroup' : 'group', 'aria-labelledby': 'qtitle' });
    opts.forEach((label, i) => {
      const input = h('input', { type: inputType, name: 'answer', value: String(i), checked: isChecked(i) });
      const row = h('label', { class: 'opt' + (isChecked(i) ? ' is-checked' : '') }, input, h('span', { class: 'opt-text' }, label));
      box.append(row);
    });
    box.addEventListener('change', () => {
      box.querySelectorAll('.opt').forEach((row) => row.classList.toggle('is-checked', row.querySelector('input').checked));
    });
    return box;
  };

  if (q.type === 'choice' || q.type === 'yesno') {
    body = choiceList('radio', (i) => initial === i);
    read = () => {
      const picked = body.querySelector('input:checked');
      return picked ? Number(picked.value) : undefined;
    };
  } else if (q.type === 'multi') {
    body = h('div', null, h('p', { class: 'hint' }, 'Choose every answer that applies.'), choiceList('checkbox', (i) => Array.isArray(initial) && initial.includes(i)));
    read = () => [...body.querySelectorAll('input:checked')].map((el) => Number(el.value));
  } else if (q.type === 'rating') {
    const max = scaleMax(q);
    const box = h('div', { class: 'scale', role: 'radiogroup', 'aria-labelledby': 'qtitle' });
    for (let v = 1; v <= max; v++) {
      let spoken = String(v);
      if (v === 1 && q.lowLabel) spoken = `1, ${q.lowLabel}`;
      if (v === max && q.highLabel) spoken = `${max}, ${q.highLabel}`;
      const input = h('input', { type: 'radio', name: 'answer', value: String(v), checked: initial === v, 'aria-label': spoken });
      box.append(h('label', { class: 'scale-opt' + (initial === v ? ' is-checked' : '') }, input, h('span', { 'aria-hidden': 'true' }, v)));
    }
    box.addEventListener('change', () => {
      box.querySelectorAll('.scale-opt').forEach((row) => row.classList.toggle('is-checked', row.querySelector('input').checked));
    });
    body = h('div', null, box, q.lowLabel || q.highLabel ? h('div', { class: 'scale-ends' }, h('span', null, q.lowLabel ? `1 = ${q.lowLabel}` : ''), h('span', null, q.highLabel ? `${max} = ${q.highLabel}` : '')) : null);
    read = () => {
      const picked = box.querySelector('input:checked');
      return picked ? Number(picked.value) : undefined;
    };
  } else if (q.type === 'rank') {
    let order = Array.isArray(initial) ? initial.slice() : opts.map((_, i) => i);
    const list = h('ol', { class: 'rank-edit', 'aria-labelledby': 'qtitle' });
    const draw = (focus) => {
      clear(list);
      order.forEach((optIndex, pos) => {
        const label = opts[optIndex];
        list.append(
          h(
            'li',
            { class: 'rank-item' },
            h('span', { class: 'rank-num', 'aria-hidden': 'true' }, pos + 1),
            h('span', { class: 'rank-text' }, label),
            h(
              'span',
              { class: 'rank-btns' },
              h('button', { type: 'button', class: 'icon-btn', 'data-move': `${optIndex}:up`, 'aria-label': `Move ${label} up`, disabled: pos === 0, onclick: () => move(pos, -1), svg: icon.up }),
              h('button', { type: 'button', class: 'icon-btn', 'data-move': `${optIndex}:down`, 'aria-label': `Move ${label} down`, disabled: pos === order.length - 1, onclick: () => move(pos, 1), svg: icon.down }),
            ),
          ),
        );
      });
      if (focus) {
        const [optIndex, dir] = focus;
        const same = list.querySelector(`[data-move="${optIndex}:${dir}"]`);
        const other = list.querySelector(`[data-move="${optIndex}:${dir === 'up' ? 'down' : 'up'}"]`);
        (same && !same.disabled ? same : other).focus();
      }
    };
    const move = (pos, delta) => {
      const to = pos + delta;
      if (to < 0 || to >= order.length) return;
      const moved = order[pos];
      order[pos] = order[to];
      order[to] = moved;
      draw([moved, delta < 0 ? 'up' : 'down']);
      announce(`${opts[moved]} is now number ${to + 1} of ${order.length}.`);
    };
    draw();
    body = h('div', null, h('p', { class: 'hint' }, 'Put these in order with your top choice first. Use the up and down buttons to move an item.'), list);
    read = () => order.slice();
  } else if (q.type === 'cloud') {
    const inputs = [];
    const box = h('div', { class: 'word-inputs' });
    for (let i = 0; i < LIMITS.words; i++) {
      const id = `word${i}`;
      const input = h('input', { id, type: 'text', maxlength: String(LIMITS.word), autocomplete: 'off', value: Array.isArray(initial) && initial[i] ? initial[i] : '' });
      inputs.push(input);
      box.append(h('div', { class: 'field' }, h('label', { for: id }, i === 0 ? 'Word or short phrase' : `Another word or phrase (${i + 1} of ${LIMITS.words})`), input));
    }
    body = h('div', null, h('p', { class: 'hint' }, `You can give up to ${LIMITS.words}. Only the first box is needed.`), box);
    read = () => inputs.map((el) => el.value);
  } else {
    const counter = h('p', { class: 'hint', id: 'text-count' }, `Up to ${LIMITS.text} characters.`);
    const area = h('textarea', { id: 'text-answer', rows: '4', maxlength: String(LIMITS.text), 'aria-labelledby': 'qtitle', 'aria-describedby': 'text-count' }, initial || '');
    area.addEventListener('input', () => {
      counter.textContent = `${area.value.length} of ${LIMITS.text} characters used.`;
    });
    body = h('div', null, area, counter);
    read = () => area.value;
  }

  const form = h(
    'form',
    {
      class: 'answer-form',
      novalidate: true,
      onsubmit: (event) => {
        event.preventDefault();
        submit(q, read(), form);
      },
    },
    body,
    h('p', { class: 'form-error', role: 'alert' }),
    h(
      'div',
      { class: 'form-actions' },
      h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, 'Submit'),
      state.editing
        ? h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: () => {
                state.editing = false;
                render();
              },
            },
            'Keep my earlier answer',
          )
        : null,
    ),
  );
  return form;
}

// ---------- Results shared with participants ----------

function drawResults(s, q, answered, mode) {
  const box = document.getElementById('results');
  if (!box) return;
  const canSee = s.showResults && mode !== 'form' && (answered || !s.accepting);
  if (!canSee) {
    clear(box);
    return;
  }
  const mine = cleanAnswer(q, state.mine[q.id]);
  const paint = (t, extra) => {
    clear(box);
    box.append(
      h('section', { class: 'card results-card', 'aria-labelledby': 'results-title' }, h('div', { class: 'results-head' }, h('h2', { id: 'results-title' }, 'Results so far'), h('p', { class: 'count' }, countLine(t))), renderTally(t, { mine }), extra || null),
    );
  };

  if (s.pacing === 'self') {
    const fresh = state.selfDocs && Date.now() - state.selfDocsAt < 20000;
    const refresh = h(
      'p',
      { class: 'refresh-row' },
      h(
        'button',
        {
          class: 'btn btn-small',
          type: 'button',
          onclick: () => {
            state.selfDocsAt = 0;
            drawResults(s, q, answered, mode);
          },
        },
        'Refresh results',
      ),
    );
    if (state.selfDocs) paint(publicTally(tally(q, entriesFor(q, state.selfDocs), (s.hidden && s.hidden[q.id]) || [])), refresh);
    if (!fresh && !state.selfLoading) {
      state.selfLoading = true;
      db.fetchResponses(state.code).then(
        (docs) => {
          state.selfLoading = false;
          state.selfDocs = docs;
          state.selfDocsAt = Date.now();
          render();
        },
        () => {
          state.selfLoading = false;
          state.selfDocsAt = Date.now();
        },
      );
    }
    return;
  }

  if (s.shared && s.shared.qid === q.id && s.shared.tally) paint(s.shared.tally);
  else {
    clear(box);
    box.append(h('p', { class: 'below-card' }, 'Results will show here when your instructor shares them.'));
  }
}
