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
  password: "Aktion2020!!!",
};

// =====================
// FILE DATABASE
// =====================
const DATA_FILE = path.join(__dirname, "data.json");

function ensureDB() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ users: [], absences: [], categories: [] }, null, 2),
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
const normEmail = (e) =>
  String(e || "")
    .trim()
    .toLowerCase();
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
  sabato: 6,
};

function toISODate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateShort(isoString) {
  const giorni = ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];
  const mesi = [
    "GEN",
    "FEB",
    "MAR",
    "APR",
    "MAG",
    "GIU",
    "LUG",
    "AGO",
    "SET",
    "OTT",
    "NOV",
    "DIC",
  ];
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
// SINCRONIZZAZIONE ASSENZE
// =====================
function syncAbsences() {
  const db = readDB();
  const users = db.users || [];
  let absences = db.absences || [];
  let updated = false;

  absences = absences.map((a) => {
    const user = users.find((u) => normEmail(u.email) === normEmail(a.email));
    if (!user) return a;
    const newA = {
      ...a,
      childName: user.childName || a.childName || null,
      category: user.category || a.category || null,
    };
    if (JSON.stringify(newA) !== JSON.stringify(a)) updated = true;
    return newA;
  });

  if (updated) {
    console.log("🔄 Sincronizzazione automatica assenze...");
    writeDB({ ...db, absences });
  } else {
    console.log("✅ Assenze già sincronizzate");
  }
}
syncAbsences();

// =====================
// ROUTES
// =====================
// HOME DI TEST
app.get("/", (req, res) => {
  res.send("✅ Server attivo! Vai su /login per accedere all'app.");
});

// LOGIN
app.get("/login", (_req, res) => res.render("login", { error: null }));

app.post("/login", (req, res) => {
  const email = normEmail(req.body.email);
  const password = normPass(req.body.password);
  if (
    email === normEmail(adminUser.email) &&
    password === normPass(adminUser.password)
  ) {
    return res.redirect("/admin");
  }
  const db = readDB();
  const user = db.users.find(
    (u) => normEmail(u.email) === email && normPass(u.password) === password,
  );
  if (user) return res.redirect(`/parent/${user.email}`);
  res.render("login", { error: "Email o password errate" });
});

// REGISTRAZIONE
app.get("/register", (_req, res) => {
  const db = readDB();
  const categories = (db.categories || []).sort((a, b) =>
    a.name
      .trim()
      .toLowerCase()
      .localeCompare(b.name.trim().toLowerCase(), "it"),
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
  if (db.users.some((u) => normEmail(u.email) === email)) {
    const categories = (db.categories || []).sort((a, b) =>
      a.name
        .trim()
        .toLowerCase()
        .localeCompare(b.name.trim().toLowerCase(), "it"),
    );
    return res.render("register", {
      error: "Utente già registrato!",
      categories,
    });
  }

  db.users.push({ name, email, password, childName, category });
  writeDB(db);
  res.redirect("/login");
});

// DASHBOARD GENITORE
app.get("/parent/:email", (req, res) => {
  const email = normEmail(decodeURIComponent(req.params.email));
  const db = readDB();
  const user = db.users.find((u) => normEmail(u.email) === email);
  if (!user) return res.redirect("/login");

  const absences = db.absences || [];
  const cat = db.categories.find((c) => c.name === user.category);
  const dates = computeWindowDatesForCategory(cat ? cat.days : []);
  const upcoming = dates.map((d) => ({
    date: d,
    absent: absences.some((a) => a.email === email && a.date === d),
    formatted: formatDateShort(d),
  }));

  const userAbsences = absences
    .filter((a) => a.email === email)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((a) => ({ ...a, formatted: formatDateShort(a.date) }));

  res.render("parent_dashboard", {
    user,
    absences: userAbsences,
    upcoming,
  });
});

// TOGGLE ASSENZA
app.post("/parent/:email/toggle-absence", (req, res) => {
  const email = normEmail(decodeURIComponent(req.params.email));
  const date = String(req.body.date || "").trim();
  const db = readDB();
  let absences = db.absences || [];

  const user = db.users.find((u) => normEmail(u.email) === email);
  const exists = absences.find((a) => a.email === email && a.date === date);

  if (exists) {
    absences = absences.filter((a) => !(a.email === email && a.date === date));
  } else {
    absences.push({
      email,
      date,
      childName: user?.childName || null,
      category: user?.category || null,
    });
  }

  writeDB({ ...db, absences });
  res.redirect(`/parent/${encodeURIComponent(email)}`);
});

// ADMIN DASHBOARD
app.get("/admin", (_req, res) => {
  const db = readDB();
  const users = db.users || [];
  const categories = (db.categories || []).sort((a, b) =>
    a.name
      .trim()
      .toLowerCase()
      .localeCompare(b.name.trim().toLowerCase(), "it"),
  );
  let absences = db.absences || [];

  absences = absences.map((a) => {
    const user = users.find((u) => normEmail(u.email) === normEmail(a.email));
    const childName = a.childName || user?.childName || "(sconosciuto)";
    const category = a.category || user?.category || "(non definita)";
    return { ...a, childName, category, formatted: formatDateShort(a.date) };
  });

  absences.sort((a, b) => {
    const dateDiff = new Date(a.date) - new Date(b.date);
    if (dateDiff !== 0) return dateDiff;
    const catDiff = a.category.localeCompare(b.category, "it");
    if (catDiff !== 0) return catDiff;
    return a.childName.localeCompare(b.childName, "it");
  });

  // ✅ Calendar as array for proper .forEach()
  const calendarByCategory = categories.map((c) => ({
    name: c.name,
    dates: computeWindowDatesForCategory(c.days || []).map((d) =>
      formatDateShort(d),
    ),
  }));

  res.render("admin_dashboard", {
    absences,
    users,
    categories,
    calendarByCategory,
    formatDateShort,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server avviato su porta ${PORT}`);
  console.log(`🌐 App pronta su Replit!`);
});
