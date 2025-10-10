// =====================
// IMPORT
// =====================
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

// =====================
// MIDDLEWARE (molto importante su Replit nuovo)
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
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], absences: [], categories: [] }, null, 2));
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
  "domenica": 0,
  "lunedi": 1,
  "martedi": 2,
  "mercoledi": 3,
  "giovedi": 4,
  "venerdi": 5,
  "sabato": 6
};

function toISODate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

// Home redirect
app.get("/", (_req, res) => res.redirect("/login"));

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
  const categories = db.categories || [];
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
  const db = readDB();
  const user = (db.users || []).find((u) => normEmail(u.email) === normEmail(req.params.email));
  if (!user) return res.redirect("/login");

  const cat = (db.categories || []).find((c) => c.name === user.category);
  const dates = computeWindowDatesForCategory(cat ? cat.days : []);
  const upcoming = dates.map((d) => ({ date: d }));

  res.render("parent_dashboard", {
    user,
    absences: db.absences || [],
    upcoming,
  });
});

app.post("/parent/:email/absent", (req, res) => {
  const db = readDB();
  db.absences.push({ email: req.params.email, date: req.body.date });
  writeDB(db);
  res.redirect(`/parent/${req.params.email}`);
});

// ----- DASHBOARD ADMIN -----
app.get("/admin", (_req, res) => {
  const db = readDB();
  const categories = db.categories || [];
  const calendarByCategory = {};

  for (const c of categories) {
    calendarByCategory[c.name] = computeWindowDatesForCategory(c.days || []);
  }

  res.render("admin_dashboard", {
    absences: db.absences || [],
    users: db.users || [],
    categories,
    calendarByCategory,
  });
});
app.use((req, res, next) => {
  console.log(`➡️  ${req.method} ${req.url}`);
  next();
});

// ----- CREA CATEGORIA -----
app.post("/admin/category", (req, res) => {
  const db = readDB();
  let { name, days } = req.body;
  if (!name) return res.redirect("/admin");

  if (!days) days = [];
  if (!Array.isArray(days)) days = [days];
  const normalized = days.map(normalizeDayName);

  if (db.categories.some((c) => c.name === name)) return res.redirect("/admin");

  db.categories.push({ name, days: normalized });
  writeDB(db);
  console.log("✅ Categoria creata:", name);
  res.redirect("/admin");
});

// ----- MODIFICA CATEGORIA (GET) -----
app.get("/admin/category/edit/:name", (req, res) => {
  const db = readDB();
  const nameDecoded = decodeURIComponent(req.params.name);
  const category = (db.categories || []).find((c) => c.name === nameDecoded);
  if (!category) {
    console.log("❌ Categoria non trovata:", nameDecoded);
    return res.redirect("/admin");
  }
  res.render("edit_category", { category });
});

// ----- MODIFICA CATEGORIA (POST) -----
app.post("/admin/category/edit/:name", (req, res) => {
  const db = readDB();
  const nameDecoded = decodeURIComponent(req.params.name);
  const category = (db.categories || []).find((c) => c.name === nameDecoded);
  if (!category) {
    console.log("❌ Categoria non trovata (POST):", nameDecoded);
    return res.redirect("/admin");
  }

  let days = req.body.days;
  if (!days) days = [];
  if (!Array.isArray(days)) days = [days];
  category.days = days.map(normalizeDayName);

  writeDB(db);
  console.log("✅ Categoria aggiornata:", category);
  res.redirect("/admin");
});

// =====================
// START SERVER (fix per Replit nuovo)
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`✅ Server avviato su porta ${PORT}`));
