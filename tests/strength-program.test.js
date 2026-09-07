const test = require("node:test");
const assert = require("node:assert/strict");

const { STRENGTH_PHASES, sessionFor, phaseForWeek, plyoContacts } = require("../js/strength-program.js");

test("phases cover weeks 1–14 exactly once", () => {
  const covered = [];
  STRENGTH_PHASES.forEach(p => { for (let w = p.weeks[0]; w <= p.weeks[1]; w++) covered.push(w); });
  assert.deepEqual(covered, Array.from({ length: 14 }, (_, i) => i + 1));
});

test("rehab weeks 1–3 have no plyometrics and only moderate loads", () => {
  for (let w = 1; w <= 3; w++) {
    for (const day of ["A", "B"]) {
      const s = sessionFor(w, day);
      assert.ok(s, `W${w} ${day} exists`);
      assert.equal(s.exercises.filter(e => e.plyo).length, 0, `W${w} ${day} has plyo`);
      assert.ok(s.exercises.some(e => /calf|peroneal|foot|tib/i.test(e.name)), `W${w} ${day} targets the foot/ankle`);
      assert.ok(!/8[0-9]\s?%|9[0-9]\s?%/.test(s.load), `W${w} load "${s.load}" is heavy`);
    }
  }
});

test("high-load weeks prescribe ≥80% 1RM compound lifts", () => {
  for (let w = 7; w <= 9; w++) {
    const s = sessionFor(w, "A");
    assert.match(s.load, /8[0-9]\s?%/);
    assert.ok(s.exercises.some(e => /squat|deadlift/i.test(e.name)));
  }
});

test("plyometric ground contacts stay within the phase cap and never exceed 120", () => {
  for (let w = 1; w <= 14; w++) {
    const cap = phaseForWeek(w).plyoCap;
    for (const day of ["A", "B"]) {
      const s = sessionFor(w, day);
      if (!s) continue;
      const contacts = plyoContacts(s);
      assert.ok(contacts <= cap, `W${w} ${day}: ${contacts} contacts > cap ${cap}`);
      assert.ok(contacts <= 120);
    }
  }
});

test("plyometrics start in W5, drop jumps appear by W8, and the last plyo is in W11", () => {
  assert.equal(plyoContacts(sessionFor(4, "A")) + plyoContacts(sessionFor(4, "B")), 0);
  assert.ok(plyoContacts(sessionFor(5, "A")) + plyoContacts(sessionFor(5, "B")) > 0);
  assert.ok(sessionFor(8, "B").exercises.some(e => /drop jump/i.test(e.name)));
  for (let w = 12; w <= 14; w++) {
    for (const day of ["A", "B"]) {
      const s = sessionFor(w, day);
      if (s) assert.equal(plyoContacts(s), 0, `W${w} ${day} still has plyo`);
    }
  }
});

test("descent preparation (eccentric step-downs or Nordics) appears from W7", () => {
  assert.ok(!sessionFor(6, "B").exercises.some(e => /eccentric|nordic|step-down/i.test(e.name)));
  for (let w = 7; w <= 11; w++) {
    const any = ["A", "B"].some(day => sessionFor(w, day).exercises.some(e => /eccentric|nordic|step-down/i.test(e.name)));
    assert.ok(any, `W${w} lacks descent prep`);
  }
});

test("W12 and W13 keep only a light Monday session and W14 has none", () => {
  assert.ok(sessionFor(12, "A"));
  assert.equal(sessionFor(12, "B"), null);
  assert.ok(sessionFor(13, "A"));
  assert.equal(sessionFor(13, "B"), null);
  assert.equal(sessionFor(14, "A"), null);
  assert.equal(sessionFor(14, "B"), null);
});

test("every exercise carries a name, prescription, tag and a YouTube search link", () => {
  for (let w = 1; w <= 13; w++) {
    for (const day of ["A", "B"]) {
      const s = sessionFor(w, day);
      if (!s) continue;
      assert.ok(s.exercises.length >= 4, `W${w} ${day} too short`);
      s.exercises.forEach(e => {
        assert.equal(typeof e.name, "string");
        assert.equal(typeof e.prescription, "string");
        assert.equal(typeof e.tag, "string");
        assert.match(e.yt, /^https:\/\/www\.youtube\.com\/results\?search_query=/);
      });
    }
  }
});
