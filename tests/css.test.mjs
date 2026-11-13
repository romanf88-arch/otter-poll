// Guards against one style name being defined twice in css/styles.css.
// That happened once: a new ".check" rule for an icon silently restyled every
// checkbox label that already used ".check".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Splits a stylesheet into its top-level rules: [{ selector, body }].
function topLevelRules(text) {
  const rules = [];
  let depth = 0;
  let start = 0;
  let selector = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) {
        selector = text.slice(start, i).trim();
        start = i + 1;
      }
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        rules.push({ selector, body: text.slice(start, i) });
        start = i + 1;
      }
    }
  }
  assert.equal(depth, 0, 'every { in styles.css has a matching }');
  return rules;
}

test('no selector has two rules of its own', () => {
  // A selector may appear in a shared rule ("h1, h2, h3 { }") and then have one
  // rule of its own. Two rules of its own means a name was used for two things.
  const seen = new Set();
  const repeats = [];
  for (const rule of topLevelRules(css)) {
    if (rule.selector.startsWith('@') || rule.selector.includes(',')) continue;
    const selector = rule.selector.replace(/\s+/g, ' ');
    if (seen.has(selector)) repeats.push(selector);
    seen.add(selector);
  }
  assert.deepEqual(repeats, [], `these selectors each have two rules of their own: ${repeats.join(', ')}`);
});

test('checkbox and radio labels keep their side-by-side layout', () => {
  const rule = topLevelRules(css).find((r) => r.selector === '.check');
  assert.ok(rule, 'a .check rule exists');
  assert.match(rule.body, /display:\s*flex/);
  assert.doesNotMatch(rule.body, /\bwidth:/);
});
