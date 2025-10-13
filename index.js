// =====================
// IMPORT
// =====================
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

// =====================
// MIDDLEWARE
// =====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================
// APP CONFIG
// =====================
app.set("view engine", "ejs");
app.engine("ejs", require("ejs").__express);
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));

// =====================
// ADMIN PREDEFINITO
// =====================
const adminUser = {
  email: "aktionsnc@gmail.com",
  password: "Aktion2020!!!"
};

// =====================
// FILE DATABASE
// =====================
const DATA_FILE = path.join(__dirname, "data.json");

function ensureDB() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ users: [], absences: [], categories: [] }, null, 2)
    );
  }
}

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { users: [], absences: [], categories: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

ensureDB();

// =====================
// HELPER FUNCTIONS
// =====================
const normEmail = (e) => String(e || "").trim().toLowerCase();
const normPass = (p) => String(p || "").trim();

function normalizeDayName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const DAY_INDEX_CANON = {
  domenica: 0,
  lunedi: 1,
  martedi: 2,
  mercoledi: 3,
  giovedi: 4,
  venerdi: 5,
  sabato: 6
};

function toISODate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateShort(isoString) {
  const giorni = ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];
  const mesi = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
  const d = new Date(isoString);
  const giorno = giorni[d.getDay()];
  const mese = mesi[d.getMonth()];
  const giornoNum = String(d.getDate()).padStart(2, "0");
  return `${giorno} ${giornoNum} ${mese}`;
}

function computeWindowDatesForCategory(daysNames) {
  const indices = (daysNames || [])
    .map(normalizeDayName)
    .map((n) => DAY_INDEX_CANON[n])
    .filter((x) => typeof x === "number");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = [];

  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (indices.includes(d.getDay())) dates.push(toISODate(d));
  }
  return dates;
}

// =====================
// ROUTES
// =====================

// // Home → redirect diretto al login
app.get("/", (req, res) => {
  res.redirect("/login");
});


// ----- LOGIN -----
app.get("/login", (_req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const email = normEmail(req.body.email);
  const password = normPass(req.body.password);

  if (email === normEmail(adminUser.email) && password === normPass(adminUser.password)) {
    return res.redirect("/admin");
  }

  const db = readDB();
  const user = (db.users || []).find(
    (u) => normEmail(u.email) === email && normPass(u.password) === password
  );

  if (user) return res.redirect(`/parent/${user.email}`);
  res.render("login", { error: "Email o password errate" });
});

// ----- REGISTRAZIONE -----
app.get("/register", (_req, res) => {
  const db = readDB();
  const categories = [...(db.categories || [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  res.render("register", { error: null, categories });
});

app.post("/register", (req, res) => {
  const name = req.body.name?.trim();
  const email = normEmail(req.body.email);
  const password = normPass(req.body.password);
  const childName = req.body.childName?.trim();
  const category = req.body.category?.trim();

  const db = readDB();

  if ((db.users || []).some((u) => normEmail(u.email) === email)) {
    return res.render("register", { error: "Utente già registrato!", categories: db.categories });
  }

  db.users.push({ name, email, password, childName, category });
  writeDB(db);
  res.redirect("/login");
});

// ----- DASHBOARD GENITORE -----
app.get("/parent/:email", (req, res) => {
  const email = normEmail(decodeURIComponent(req.params.email));
  const db = readDB();

  const user = db.users.find(u => normEmail(u.email) === email);
  if (!user) return res.redirect("/login");

  const absences = Array.isArray(db.absences) ? db.absences : [];
  const cat = db.categories.find(c => c.name === user.category);

  const dates = computeWindowDatesForCategory(cat ? (cat.days || []) : []);
  const upcoming = dates.map(d => ({
    date: d,
    absent: absences.some(a => a.email === email && a.date === d)
  }));

  res.render("parent_dashboard", { user, absences, upcoming, formatDateShort });
});

// ----- TOGGLE ASSENZA -----
app.post("/parent/:email/toggle-absence", (req, res) => {
  const email = normEmail(decodeURIComponent(req.params.email));
  const date = String(req.body.date || "").trim();

  const db = readDB();
  let absences = Array.isArray(db.absences) ? db.absences : [];

  const exists = absences.find(a => a.email === email && a.date === date);

  if (exists) {
    absences = absences.filter(a => !(a.email === email && a.date === date));
  } else {
    absences.push({ email, date });
  }

  writeDB({ ...db, absences });
  res.redirect(`/parent/${encodeURIComponent(email)}`);
});

// ----- ADMIN DASHBOARD -----
app.get("/admin", (_req, res) => {
  const db = readDB();
  const absences = Array.isArray(db.absences) ? db.absences : [];
  const users = Array.isArray(db.users) ? db.users : [];
  const categories = Array.isArray(db.categories) ? db.categories : [];

  // Ordina assenze in modo cronologico, poi per categoria e nome figlio
  const sortedAbsences = absences
    .map(a => {
      const u = users.find(u => normEmail(u.email) === normEmail(a.email));
      return {
        ...a,
        category: u?.category || "-",
        childName: u?.childName || "-"
      };
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.childName.localeCompare(b.childName);
    });

  const calendarByCategory = {};
  for (const c of categories) {
    const dates = computeWindowDatesForCategory(c.days || []);
    calendarByCategory[c.name] = dates;
  }

  res.render("admin_dashboard", {
    absences: sortedAbsences,
    users,
    categories: [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    calendarByCategory,
    formatDateShort
  });
});

// ----- CREA NUOVA CATEGORIA -----
app.post("/admin/category", (req, res) => {
  const db = readDB();
  let { name, days } = req.body;

  if (!name) return res.redirect("/admin");
  if (!days) days = [];
  if (!Array.isArray(days)) days = [days];

  days = days.map(d => d.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

  const categories = Array.isArray(db.categories) ? db.categories : [];

  const existing = categories.find(c => c.name === name);
  if (existing) existing.days = days;
  else categories.push({ name, days });

  writeDB({ ...db, categories });
  res.redirect("/admin");
});

// =====================
// SERVER
// =====================
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`✅ Server avviato su porta ${PORT}`);
});
