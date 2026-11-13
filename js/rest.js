// Reads a poll session from the plain web address Firestore offers, without
// the Firebase code. The participant page uses this to show the first question
// while the larger Firebase code is still loading.
//
// Firestore's web format wraps every value in a type label, for example
// { stringValue: "Hello" }. These functions unwrap it.

export function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue) || 0;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return null;
}

export function decodeFields(fields) {
  const out = {};
  for (const key of Object.keys(fields || {})) out[key] = decodeValue(fields[key]);
  return out;
}

// Gives the same object the Firebase code produces for a session.
export function decodeSession(doc, code) {
  const data = decodeFields(doc && doc.fields);
  return { code, ...data, createdAt: data.createdAt || 0, endedAt: data.endedAt || 0 };
}
