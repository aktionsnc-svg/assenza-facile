// =====================
// IMPORT
// =====================
const express = require("express");
const path = require("path");
const { MongoClient, ServerApiVersion } = require("mongodb");

// =====================
// MONGODB CONNECTION (Render + Atlas compatibile)
// =====================
const client = new MongoClient(process.env.MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  connectTimeoutMS: 20000,
  socketTimeoutMS: 20000,
});

let collection;

async function connectMongo() {
  try {
    await client.connect();
    const db = client.db("assenza_facile");
    collection = db.collection("appdata");
    console.log("✅ Connesso a MongoDB Atlas");
  } catch (err) {
    console.error("❌ Errore connessione MongoDB:", err);
  }
}

connectMongo();

// =====================
// FUNZIONI LETTURA/SCRITTURA DB
// =====================
async function readDB() {
  try {
    const doc = await collection.findOne({ _id: "data" });
    return doc ? doc.data : { users: [], absences: [], categories: [] };
  } catch (err) {
    console.error("❌ Errore lettura DB Mongo:", err);
    return { users: [], absences: [], categories: [] };
  }
}

async function writeDB(data) {
  try {
    await collection.updateOne(
      { _id: "data" },
      { $set: { data } },
      { upsert: true }
    );
    console.log("💾 Dati salvati su MongoDB Atlas");
  } catch (err) {
    console.error("❌ Errore scrittura DB Mongo:", err);
  }
}

// =====================
// EXPRESS APP
// =====================
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");
app.engine("ejs", require("ejs").__express);
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Serve manifest e service worker
app.get("/manifest.json", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "manifest.json"))
);
app.get("/service-worker.js", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "service-worker.js"))
);

// =====================
// ADMIN PREDEFINITO
// =====================
const adminUser = { email: "aktionsnc@gmail.com", password: "Aktion2020!!!" };

// =====================
// FUNZIONI DI SUPPORTO
// =====================
const normEmail = (e) => String(e || "").trim().toLowerCase();
const normPass = (p) => String(p || "").trim();

const DAY_INDEX_CANON = {
  domenica: 0,
  lunedi: 1,
  martedi: 2,
  mercoledi: 3,
  giovedi: 4,
  venerdi: 5,
  sabato: 6,
};

function normalizeDayName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

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
  return `${giorni[d.getDay()]} ${String(d.getDate()).padStart(2, "0")} ${
    mesi[d.getMonth()]
  }`;
}

// =====================
// ROTTE APP
// =====================

// Pagina di caricamento o redirect
app.get("/", (req, res) => {
  if (!global.serverReady) {
    res.sendFile(path.join(__dirname, "public", "loading", "index.html"));
  } else {
    res.redirect("/login");
  }
});

// ----- LOGIN -----
app.get("/login", (_req, res) => res.render("login", { error: null }));

app.post("/login", async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const password = normPass(req.body.password);

    if (
      email === normEmail(adminUser.email) &&
      password === normPass(adminUser.password)
    )
      return res.redirect("/admin");

    const data = await readDB();
    const user = (data.users || []).find(
      (u) => normEmail(u.email) === email && normPass(u.password) === password
    );

    if (user) return res.redirect(`/parent/${user.email}`);
    res.render("login", { error: "Email o password errate" });
  } catch (err) {
    console.error("❌ Errore login:", err);
    res.render("login", { error: "Errore interno del server" });
  }
});

// ----- REGISTRAZIONE -----
app.get("/register", async (_req, res) => {
  const data = await readDB();
  const categories = [...(data.categories || [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  res.render("register", { error: null, categories });
});

app.post("/register", async (req, res) => {
  const { name, email, password, childName, category } = req.body;
  const data = await readDB();
  if ((data.users || []).some((u) => normEmail(u.email) === normEmail(email)))
    return res.render("register", {
      error: "Utente già registrato!",
      categories: data.categories,
    });
  data.users.push({ name, email, password, childName, category });
  await writeDB(data);
  res.redirect("/login");
});

// ----- GENITORE -----
app.get("/parent/:email", async (req, res) => {
  const email = normEmail(decodeURIComponent(req.params.email));
  const data = await readDB();
  const user = data.users.find((u) => normEmail(u.email) === email);
  if (!user) return res.redirect("/login");

  const absences = Array.isArray(data.absences) ? data.absences : [];
  const cat = data.categories.find((c) => c.name === user.category);
  const dates = computeWindowDatesForCategory(cat ? cat.days : []);
  const upcoming = dates.map((d) => ({
    date: d,
    absent: absences.some((a) => a.email === email && a.date === d),
  }));

  res.render("parent_dashboard", {
    user,
    absences,
    upcoming,
    formatDateShort,
  });
});

app.post("/parent/:email/toggle-absence", async (req, res) => {
  const email = normEmail(decodeURIComponent(req.params.email));
  const date = String(req.body.date || "").trim();
  const data = await readDB();
  let absences = Array.isArray(data.absences) ? data.absences : [];
  const exists = absences.find((a) => a.email === email && a.date === date);
  if (exists)
    absences = absences.filter(
      (a) => !(a.email === email && a.date === date)
    );
  else absences.push({ email, date });
  data.absences = absences;
  await writeDB(data);
  res.redirect(`/parent/${encodeURIComponent(email)}`);
});

// ----- ADMIN -----
app.get("/admin", async (_req, res) => {
  const data = await readDB();
  const absences = Array.isArray(data.absences) ? data.absences : [];
  const users = Array.isArray(data.users) ? data.users : [];
  const categories = Array.isArray(data.categories) ? data.categories : [];

  const sortedAbsences = absences
    .map((a) => {
      const u = users.find((u) => normEmail(u.email) === normEmail(a.email));
      return {
        ...a,
        category: u?.category || "-",
        childName: u?.childName || "-",
      };
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.category !== b.category)
        return a.category.localeCompare(b.category);
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
    formatDateShort,
  });
});

app.post("/admin/category", async (req, res) => {
  const data = await readDB();
  let { name, days } = req.body;
  if (!name) return res.redirect("/admin");
  if (!days) days = [];
  if (!Array.isArray(days)) days = [days];
  days = days.map((d) =>
    d.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const existing = categories.find((c) => c.name === name);
  if (existing) existing.days = days;
  else categories.push({ name, days });
  data.categories = categories;
  await writeDB(data);
  res.redirect("/admin");
});

// ----- TEST DB -----
app.get("/test-db", async (req, res) => {
  try {
    const data = await readDB();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// SERVER START
// =====================
const PORT = process.env.PORT || 3000;

// Pagina "loading" immediata (sempre disponibile)
app.get("/", (req, res) => {
  if (!global.serverReady) {
    res.sendFile(path.join(__dirname, "public", "loading", "index.html"));
  } else {
    res.redirect("/login");
  }
});

async function startServer() {
  console.log("🚀 Avvio server...");

  // Avvia il listener PRIMA del DB (così la pagina loading è già servita)
  const server = app.listen(PORT, () =>
    console.log(`⚙️ Server Express in ascolto sulla porta ${PORT}`)
  );

  try {
    await connectMongo(); // connessione DB
    global.serverReady = true;
    console.log("🌐 App pronta e DB connesso!");
  } catch (err) {
    console.error("❌ Errore avvio:", err);
  }
}

startServer();
