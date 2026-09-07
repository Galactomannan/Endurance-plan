/* ============================================================================
   Strength & plyometric program — Fuji 14-week rebuild
   Two sessions a week (A Monday, B Thursday), ≥6 h from the day's run.
   Evidence: high-load (≥80% 1RM) + plyometrics is the only combination with a
   reliable running-economy effect and it protects against injury at any speed
   (Llanos-Lagos 2024); tendon adaptation lags muscle so plyometric contacts rise
   slowly; last heavy lift ≥10 days out (Rønnestad 2014).
   Classic script in the browser (FujiStrength), CommonJS in tests.
   ============================================================================ */
(function (root) {
  "use strict";

  function yt(q) { return "https://www.youtube.com/results?search_query=" + encodeURIComponent(q); }
  function ex(name, prescription, tag, icon, extra) {
    return Object.assign({ name, prescription, tag, icon, yt: yt(name + " proper form technique") }, extra || {});
  }
  function plyo(name, prescription, contacts, tag, icon) {
    return ex(name, prescription, tag || "Plyometric / SSC", icon || "jump", { plyo: true, contacts });
  }

  const STRENGTH_PHASES = [
    { id: "rehab", name: "Rehab / foundation", weeks: [1, 3], load: "60–70% 1RM · 3×10–12", plyoCap: 0, color: "#34D399",
      note: "Foot, ankle and hip first. Nothing heavy, nothing bouncy — the goal is capacity in the tissues that hurt." },
    { id: "strength", name: "Strength", weeks: [4, 6], load: "75–85% 1RM · 3–4×5–6", plyoCap: 80, color: "#60A5FA",
      note: "Compound lifts back to heavy. Plyometrics start in W5: pogo hops and a low box, ≤80 contacts." },
    { id: "strength_descent", name: "Strength + descent prep", weeks: [7, 9], load: "80–85% 1RM · 4×4–6", plyoCap: 120, color: "#FF9F0A",
      note: "Drop jumps and bounding join; eccentric step-downs and Nordics prepare the quads for the 100 m descent at km 35." },
    { id: "maintain", name: "Maintain", weeks: [10, 12], load: "80% 1RM · 2–3×5", plyoCap: 80, color: "#F43F5E",
      note: "Keep the intensity, cut the sets. Last plyometrics in W11. W12 is a light Monday only." },
    { id: "taper", name: "Taper", weeks: [13, 13], load: "75% 1RM · 2×5", plyoCap: 0, color: "#C084FC",
      note: "One light Monday session (D-13). No plyometrics." },
    { id: "race", name: "Race week", weeks: [14, 14], load: "—", plyoCap: 0, color: "#FF6B00",
      note: "Mobility only." }
  ];

  function phaseForWeek(w) {
    return STRENGTH_PHASES.find(p => w >= p.weeks[0] && w <= p.weeks[1]) || STRENGTH_PHASES[STRENGTH_PHASES.length - 1];
  }

  /* ---------- exercise blocks ---------- */
  const FOOT_BLOCK = [
    ex("Single-leg calf raise (straight knee)", "3×12 · slow 3 s down · add load when pain-free", "Gastroc / lateral column", "foot"),
    ex("Bent-knee calf raise (soleus)", "3×15 · seated or wall · 3 s down", "Soleus", "foot"),
    ex("Peroneal band eversion", "3×15 · light band · pause 2 s", "Peroneals · lateral ankle", "foot"),
    ex("Tibialis posterior band inversion", "3×15 · light band · slow", "Tib post · arch", "foot"),
    ex("Short-foot / toe yoga", "3×10 · 5 s hold", "Foot intrinsics", "foot")
  ];

  const REHAB = {
    A: [
      ...FOOT_BLOCK.slice(0, 3),
      ex("Goblet squat", "3×10 · 60–70% · 2 s down", "Pattern re-learn", "barbell"),
      ex("Hip thrust", "3×12 · 60–70%", "Glute drive", "hip"),
      ex("Side-lying hip abduction", "3×15/side", "Hip stability", "hip"),
      ex("Dead bug", "3×10/side", "Trunk", "press")
    ],
    B: [
      ...FOOT_BLOCK.slice(2, 5),
      ex("Romanian deadlift", "3×10 · 60–70% · slow eccentric", "Posterior chain", "barbell"),
      ex("Step-up (low box)", "3×10/leg · bodyweight → light", "Unilateral", "lunge"),
      ex("Single-leg balance on foam", "3×45 s/side", "Ankle proprioception", "foot"),
      ex("Pallof press", "3×10/side", "Anti-rotation", "press")
    ]
  };

  const STRENGTH = {
    A: [
      ex("Barbell back squat", "4×5 · 80–85% 1RM · 3 min rest", "Primary high-load", "barbell"),
      ex("Romanian deadlift", "3×6 · 75–80% · 2 min", "Posterior chain", "barbell"),
      ex("Heavy single-leg calf raise", "4×8/leg · loaded · 3 s down", "Tendon stiffness · lateral column", "foot"),
      ex("Peroneal band eversion", "2×15 · moderate band", "Lateral ankle insurance", "foot"),
      ex("Bench press", "3×6 · 75% · 90 s", "Upper push", "press"),
      ex("Barbell bent-over row", "3×6–8 · 75% · 90 s", "Upper pull", "pullup")
    ],
    B: [
      ex("Bulgarian split squat", "4×6/leg · 80% · 2 min", "Unilateral high-load", "lunge"),
      ex("Hip thrust", "3×8 · 75–80% · 90 s", "Glute power", "hip"),
      ex("Bent-knee calf raise (soleus)", "3×12 · loaded", "Soleus", "foot"),
      ex("Tibialis posterior band inversion", "2×15", "Arch support", "foot"),
      ex("Overhead press", "3×6–8 · 75% · 90 s", "Upper push", "press"),
      ex("Pull-up / lat pulldown", "3×6–8", "Upper pull", "pullup")
    ]
  };

  const PLYO_INTRO = { // W5–6 · ≤80 contacts
    A: [plyo("Pogo hops (ankle)", "2×10 · stiff ankles · quiet landings", 20, "Elastic ankle", "jump")],
    B: [plyo("Low box jump 20 cm", "3×5 · step down, never jump down", 15, "Concentric power", "jump"),
        plyo("Pogo hops (ankle)", "2×10", 20, "Elastic ankle", "jump")]
  };

  const DESCENT = {
    A: [ex("Eccentric step-down (slow 4 s)", "3×8/leg · 20–30 cm box", "Descent prep · quads", "down")],
    B: [ex("Nordic hamstring curl", "3×4 · assisted", "Descent prep · hamstrings", "lunge")]
  };

  const PLYO_BUILD = { // W7–9 · ≤120 contacts
    A: [plyo("Box jump 30 cm", "3×5", 15, "Concentric power", "jump"),
        plyo("Bounding", "3×10 contacts · grass or track", 30, "Horizontal stiffness", "jump")],
    B: [plyo("Drop jump 20–30 cm", "3×5 · minimal ground contact", 15, "Reactive stiffness", "down"),
        plyo("Single-leg hop", "3×5/leg", 30, "Reactive strength", "jump")]
  };

  const PLYO_MAINTAIN = { // W10–11 · ≤80 contacts
    A: [plyo("Box jump 30 cm", "2×5", 10, "Keep the spring", "jump")],
    B: [plyo("Drop jump 20 cm", "2×5", 10, "Keep the stiffness", "down")]
  };

  const MAINTAIN = {
    A: [
      ex("Barbell back squat", "3×5 · 80% · 3 min", "Maintain force", "barbell"),
      ex("Heavy single-leg calf raise", "3×8/leg", "Tendon stiffness", "foot"),
      ex("Eccentric step-down (slow 4 s)", "2×8/leg", "Descent prep · quads", "down"),
      ex("Peroneal band eversion", "2×15", "Lateral ankle", "foot"),
      ex("Bench press", "2×6 · 75%", "Upper push", "press")
    ],
    B: [
      ex("Bulgarian split squat", "3×5/leg · 80%", "Unilateral", "lunge"),
      ex("Hip thrust", "2×8 · 75%", "Glute drive", "hip"),
      ex("Nordic hamstring curl", "2×4 · assisted", "Descent prep · hamstrings", "lunge"),
      ex("Bent-knee calf raise (soleus)", "2×12", "Soleus", "foot"),
      ex("Pull-up / lat pulldown", "2×6–8", "Upper pull", "pullup")
    ]
  };

  const LIGHT_A = [
    ex("Barbell back squat", "2×5 · 75% · crisp, not grinding", "Neuromuscular tone", "barbell"),
    ex("Hip thrust", "2×8 · 70%", "Glute drive", "hip"),
    ex("Single-leg calf raise", "2×10/leg · moderate", "Tendon tone", "foot"),
    ex("Peroneal band eversion", "2×15", "Lateral ankle", "foot"),
    ex("Dead bug", "2×10/side", "Trunk", "press")
  ];

  function sessionFor(w, day) {
    const phase = phaseForWeek(w);
    if (phase.id === "race") return null;
    if ((phase.id === "taper" || w === 12) && day === "B") return null;
    let exercises;
    if (phase.id === "rehab") exercises = REHAB[day];
    else if (phase.id === "strength") exercises = STRENGTH[day].concat(w >= 5 ? PLYO_INTRO[day] : []);
    else if (phase.id === "strength_descent") exercises = STRENGTH[day].concat(DESCENT[day], PLYO_BUILD[day]);
    else if (phase.id === "maintain") exercises = (w === 12) ? LIGHT_A : MAINTAIN[day].concat(w <= 11 ? PLYO_MAINTAIN[day] : []);
    else exercises = LIGHT_A; // taper W13 Monday
    const light = w >= 12;
    return {
      week: w, day, phase,
      load: light ? "75% 1RM · 2 sets" : phase.load,
      title: `Strength ${day}${light ? " — light" : ""}`,
      exercises: exercises.map(e => ({ ...e })),
      note: phase.note
    };
  }

  function plyoContacts(session) {
    if (!session) return 0;
    return session.exercises.filter(e => e.plyo).reduce((sum, e) => sum + (e.contacts || 0), 0);
  }

  const api = { STRENGTH_PHASES, phaseForWeek, sessionFor, plyoContacts };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FujiStrength = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
