// Firebase web configuration for the otter-poll project.
// These values identify the project to Firebase. They are public by design
// (every visitor's browser receives them). Access is controlled by the
// security rules in firestore.rules, not by keeping this file secret.
export const firebaseConfig = {
  apiKey: 'AIzaSyDOkvYyu1DyULufkfzpNI5b4XDifCVQWt0',
  authDomain: 'otter-poll.firebaseapp.com',
  projectId: 'otter-poll',
  storageBucket: 'otter-poll.firebasestorage.app',
  messagingSenderId: '361019924103',
  appId: '1:361019924103:web:9340eb20f0dba26bdae222',
};

// The instructor page is open to Google accounts at this address.
export const INSTRUCTOR_DOMAIN = 'csumb.edu';

// The account that owns the Firebase project can also use the instructor page,
// so the owner is never locked out. This is an internal id, not an email address.
// firestore.rules must list the same id.
export const OWNER_UIDS = ['M9q5lSN3H2U8cNClac9zlE6oeKD2'];
