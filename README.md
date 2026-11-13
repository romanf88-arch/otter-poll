# Otter Poll

A classroom polling app. The instructor builds a poll, starts it, and puts a QR code and join code on the screen. Participants answer on a phone or laptop without an account, and the results appear as charts while the answers come in.

- Participant page: https://romanf88-arch.github.io/otter-poll/
- Instructor page: https://romanf88-arch.github.io/otter-poll/instructor.html

The colors and typeface follow the Cal State Monterey Bay brand guide (Monterey Bay Blue, Ocean Blue, Valley Green, Sunshine, Tangerine, and Montserrat). The otter is an original drawing. Otter Poll is not an official university service.

## What it does

- Seven question types: multiple choice, select all that apply, yes or no, rating scale, ranking, word cloud, and short answer.
- A poll can be anonymous, or it can ask each participant for a name.
- Results can be shown to participants after they answer. The instructor can switch this on or off while the poll is running.
- The instructor can move everyone from question to question, or let participants move at their own pace.
- Participants join by QR code, by link, or by typing a 6-character code.
- Saved polls stay in the instructor's account and can be started again, edited, or duplicated.
- Each run of a poll is kept under Past sessions with its charts. Results download as two CSV files (a summary with counts, and one row per participant), and the results page prints to PDF.
- The instructor can hide a short answer or a word-cloud word from the display, and can clear the answers to a question so the class can answer again.

## How to run a poll

1. Open the instructor page and sign in with your CSUMB Google account (your @csumb.edu address).
2. Choose **New poll**, add questions, and save. To try the app first, choose **Add a sample poll**.
3. Choose **Start**. The screen shows the QR code, the address, and the join code. **Show full screen** makes the QR code large enough for the back of the room.
4. Use **Next question** and **Previous** to move through the poll. **Close voting** stops answers to the current question.
5. Choose **End poll** when you are finished. The results page opens with the download buttons.

## Files

| File | What it holds |
| --- | --- |
| `index.html`, `js/participant.js` | The participant page |
| `instructor.html`, `js/instructor.js` | The instructor page |
| `js/db.js` | Everything that reads from or writes to Firebase |
| `js/tally.js` | Question types, counting, and CSV output (no browser code, so Node can test it) |
| `js/charts.js` | Charts built from plain HTML, with every number also present as text |
| `js/otter.js` | The otter drawings |
| `js/config.js` | The Firebase project settings |
| `css/styles.css` | All styling |
| `firestore.rules` | The database security rules |
| `vendor/qrcode.js` | QR Code Generator by Kazuhiko Arase (MIT license) |
| `tests/` | Unit tests and a script that acts as a room of participants |

There is no build step. The site is plain HTML, CSS, and JavaScript modules, served by GitHub Pages from the `main` branch.

## Where the data is

Answers are stored in a Firebase project named `otter-poll` (Cloud Firestore, United States). The Firebase settings in `js/config.js` are public by design. They identify the project and do not grant access. Access is decided by `firestore.rules`:

- Instructors sign in with Google. Only accounts with an @csumb.edu address can run polls, plus the one account that owns the Firebase project. Every CSUMB account qualifies, which includes student accounts. Each instructor can read and change only their own polls and sessions.
- Participants are signed in anonymously. A participant can write only their own answers, and only while voting is open.
- Names are stored apart from answers, and participants can never read them.
- In a self-paced poll that shares results, participants' browsers read the answers (which carry no names) to draw the charts, because no instructor page is open to add them up. In a poll the instructor paces, participants receive only the totals.

To change who can run polls, edit `INSTRUCTOR_DOMAIN` and `OWNER_UIDS` in `js/config.js` and the matching lines in `firestore.rules`. The rules are what enforce it. The settings in `js/config.js` only decide which screen a person sees.

To change the rules, edit `firestore.rules`, then paste the file into the Firebase console under Firestore Database, Rules, and choose Publish.

Deleting a session on the Past sessions page removes its answers and names from the database.

## Limits of the free Firebase plan

The project is on the free plan, which allows 50,000 database reads and 20,000 writes per day. A rough estimate for one session is 14 reads per participant per question when results are shared live, so a class of 40 answering 10 questions uses about 5,600 reads. When the daily limit is reached the app shows a message, and the limit resets at midnight Pacific time.

## Accessibility

The app is built to WCAG 2.0 Level AA. Every control works from the keyboard, ranking uses buttons instead of dragging, charts carry their numbers as text, status changes are announced to screen readers, and nothing depends on color alone. Each screen was scanned with axe-core (WCAG 2.0 and 2.1 A and AA rules) with no violations, and checked by keyboard, at 200% zoom, and at a 320-pixel width.

## Testing

```bash
npm install
```

```bash
npm test
```

`npm test` runs the counting, CSV, and instructor-access tests. To act as a room of participants, start a poll on the instructor page and pass its join code to the simulation script. This example sends 30 participants who answer every question:

```bash
node tests/sim.mjs vote ABC234 30 all
```

This one checks what a participant is and is not allowed to do under the security rules:

```bash
node tests/sim.mjs rules ABC234
```

To preview the site on your own computer, serve this folder with any static file server and open `http://localhost:PORT/instructor.html`. Google sign-in works on `localhost`.
