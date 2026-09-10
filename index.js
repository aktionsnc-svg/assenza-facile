// =====================
// IMPORT
// =====================
const express = require("express");
const path = require("path");
const { MongoClient, ServerApiVersion } = require("mongodb");

// =====================
// CHECK VARIABILI AMBIENTE
// =====================
if (!process.env.MONGO_URI) {
  console.error("❌ ERRORE: variabile MONGO_URI non trovata!");
  console.error("ℹ️ Aggiungila nei 'Environment Variables' di Render.");
  process.exit(1);
}

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
  console.log("🔗 Connessione a MongoDB...");
  try {
    await client.connect();
    const db = client.db("assenza_facile");
    collection = db.collection("appdata");
    console.log("✅ Connesso a MongoDB Atlas");
  } catch (err) {
    console.error("❌ Errore connessione MongoDB:", err);
    throw err;
  }
}

// =====================
// EXPRESS APP
// =====================
const app = express();

// Endpoint ping per UptimeRobot
app.get("/ping", (_req, res) => {
  res.status(200).send("pong");
});

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
// FUNZIONI DB
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
// ROTTE APP
// =====================

// Pagina iniziale con loading inline
app.get("/", (req, res) => {
  if (!global.serverReady) {
    res.send(`
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="UTF-8" />
        <title>Avvio in corso...</title>
        <style>
          body {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background: #f8fafc;
            color: #333;
            font-family: "Segoe UI", system-ui, sans-serif;
            text-align: center;
          }
          .spinner {
            border: 5px solid #ddd;
            border-top: 5px solid #007bff;
            border-radius: 50%;
            width: 60px;
            height: 60px;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          h2 {
            font-weight: 500;
            font-size: 1.3rem;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <h2>🚀 L'app si sta avviando... Attendere qualche secondo...</h2>
      </body>
      </html>
    `);
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
  const user = data.users.find(u => normEmail(u.email) === email);
  if (!user) return res.redirect("/login");

  // 🔒 Filtra solo le assenze di questo utente, indipendentemente dal nome del campo
  const allAbsences = Array.isArray(data.absences) ? data.absences : [];
  const myAbsences = allAbsences.filter(a => {
    const mail = normEmail(a.email || a.user || a.mail || "");
    return mail === email;
  });

  // 📅 Calcola le date della categoria del figlio
  const cat = data.categories.find(c => c.name === user.category);
  const dates = computeWindowDatesForCategory(cat ? cat.days : []);

  // 🎯 Costruisce il calendario con flag "assente"
  const upcoming = dates.map(d => ({
    date: d,
    absent: myAbsences.some(a => a.date === d),
  }));

  res.render("parent_dashboard", {
    user,
    absences: myAbsences,
    upcoming,
    formatDateShort,
  });
});

// ----- TOGGLE ASSENZA -----
app.post("/parent/:email/toggle-absence", async (req, res) => {
  const email = normEmail(decodeURIComponent(req.params.email));
  const date = String(req.body.date || "").trim();
  const data = await readDB();

  let absences = Array.isArray(data.absences) ? data.absences : [];

  // 🔁 Normalizza tutti i record esistenti per evitare inconsistenze
  absences = absences.map(a => ({
    email: normEmail(a.email || a.user || a.mail || ""),
    date: a.date
  }));

  // 🔍 Verifica se esiste già un'assenza per questa data
  const exists = absences.find(a => a.email === email && a.date === date);

  if (exists) {
    // 🧹 Se già segnata, la rimuove
    absences = absences.filter(a => !(a.email === email && a.date === date));
  } else {
    // 🆕 Aggiunge nuova assenza con campo "email" coerente
    absences.push({ email, date });
  }

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

  // 🔥 FILTRA via assenze passate
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingAbsences = absences.filter((a) => {
    const d = new Date(a.date);
    return !isNaN(d) && d >= today;
  });

  // 🔄 salva su Mongo solo quelle ancora valide
  if (upcomingAbsences.length !== absences.length) {
    data.absences = upcomingAbsences;
    await writeDB(data);
    console.log("🧹 Pulizia automatica assenze passate completata");
  }

  // 📅 ordina e arricchisce
  const sortedAbsences = upcomingAbsences
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

  // 📆 calendario per categoria
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
// =====================
// CREA NUOVA CATEGORIA
// =====================
app.post("/admin/category", async (req, res) => {
  try {
    const data = await readDB();

    const name = String(req.body.name || "").trim();
    let days = req.body.days || [];

    // Il nome della categoria è obbligatorio
    if (!name) {
      return res.redirect("/admin");
    }

    // Se è stato selezionato un solo giorno,
    // Express restituisce una stringa invece di un array
    if (!Array.isArray(days)) {
      days = [days];
    }

    // Uniforma i nomi dei giorni
    days = days.map((d) =>
      String(d)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    );

    const categories = Array.isArray(data.categories)
      ? data.categories
      : [];

    // Controlla che non esista già una categoria con lo stesso nome
    const existing = categories.find(
      (c) =>
        String(c.name).trim().toLowerCase() ===
        name.toLowerCase()
    );

    if (existing) {
      console.log(`⚠️ Categoria già esistente: ${name}`);
      return res.redirect("/admin");
    }

    // Crea la nuova categoria
    categories.push({
      name: name,
      days: days
    });

    data.categories = categories;

    // Salva su MongoDB
    await writeDB(data);

    console.log(`✅ Nuova categoria creata: ${name}`, days);

    return res.redirect("/admin");

  } catch (err) {
    console.error("❌ Errore creazione categoria:", err);
    return res.status(500).send("Errore durante la creazione della categoria");
  }
});

// =====================
// MODIFICA CATEGORIA
// =====================

// Apre la pagina di modifica della categoria
app.get("/admin/category/edit/:name", async (req, res) => {
  try {
    const categoryName = decodeURIComponent(req.params.name);

    const data = await readDB();
    const categories = Array.isArray(data.categories)
      ? data.categories
      : [];

    const category = categories.find(
      (c) => String(c.name).trim() === String(categoryName).trim()
    );

    if (!category) {
      return res.status(404).send("Categoria non trovata");
    }

    res.render("edit_category", {
      category
    });

  } catch (err) {
    console.error("❌ Errore apertura modifica categoria:", err);
    res.status(500).send("Errore durante l'apertura della categoria");
  }
});


// Salva le modifiche della categoria
app.post("/admin/category/edit/:name", async (req, res) => {
  try {
    const categoryName = decodeURIComponent(req.params.name);

    let days = req.body.days || [];

    // Se viene selezionato un solo giorno Express restituisce una stringa
    if (!Array.isArray(days)) {
      days = [days];
    }

    // Uniforma i nomi dei giorni
    days = days.map((d) =>
      String(d)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    );

    const data = await readDB();

    const categories = Array.isArray(data.categories)
      ? data.categories
      : [];

    const category = categories.find(
      (c) => String(c.name).trim() === String(categoryName).trim()
    );

    if (!category) {
      return res.status(404).send("Categoria non trovata");
    }

    // Aggiorna solamente i giorni
    category.days = days;

    data.categories = categories;

    await writeDB(data);

    console.log(
      `✅ Categoria ${categoryName} aggiornata:`,
      days
    );

    res.redirect("/admin");

  } catch (err) {
    console.error("❌ Errore salvataggio categoria:", err);
    res.status(500).send("Errore durante il salvataggio della categoria");
  }
});
// =====================
// ELIMINA CATEGORIA
// =====================
app.post("/admin/category/delete/:name", async (req, res) => {
  try {
    const categoryName = decodeURIComponent(req.params.name);

    const data = await readDB();

    const categories = Array.isArray(data.categories)
      ? data.categories
      : [];

    // Elimina SOLO la categoria
    // Gli utenti registrati non vengono eliminati
    data.categories = categories.filter(
      (c) =>
        String(c.name).trim() !==
        String(categoryName).trim()
    );

    await writeDB(data);

    console.log(`🗑️ Categoria eliminata: ${categoryName}`);

    res.redirect("/admin");

  } catch (err) {
    console.error("❌ Errore eliminazione categoria:", err);
    res.status(500).send("Errore durante l'eliminazione della categoria");
  }
});

// =====================
// GESTIONE UTENTI ADMIN
// =====================

// Apre la pagina di modifica dell'utente
app.get("/admin/user/edit/:email", async (req, res) => {
  try {
    const email = normEmail(decodeURIComponent(req.params.email));

    const data = await readDB();

    const users = Array.isArray(data.users)
      ? data.users
      : [];

    const categories = Array.isArray(data.categories)
      ? data.categories
      : [];

    const user = users.find(
      (u) => normEmail(u.email) === email
    );

    if (!user) {
      return res.status(404).send("Utente non trovato");
    }

    res.render("edit_user", {
      user,
      categories: [...categories].sort(
        (a, b) => a.name.localeCompare(b.name)
      )
    });

  } catch (err) {
    console.error("❌ Errore apertura modifica utente:", err);
    res.status(500).send(
      "Errore durante l'apertura dell'utente"
    );
  }
});


// Salva le modifiche dell'utente
app.post("/admin/user/edit/:email", async (req, res) => {
  try {
    const email = normEmail(
      decodeURIComponent(req.params.email)
    );

    const name = String(req.body.name || "").trim();
    const childName = String(req.body.childName || "").trim();
    const category = String(req.body.category || "").trim();

    const data = await readDB();

    const users = Array.isArray(data.users)
      ? data.users
      : [];

    const user = users.find(
      (u) => normEmail(u.email) === email
    );

    if (!user) {
      return res.status(404).send("Utente non trovato");
    }

    // Modifica solo questi dati.
    // Email e password rimangono inalterate.
    user.name = name;
    user.childName = childName;
    user.category = category;

    data.users = users;

    await writeDB(data);

    console.log(`✅ Utente aggiornato: ${email}`);

    res.redirect("/admin");

  } catch (err) {
    console.error("❌ Errore modifica utente:", err);
    res.status(500).send(
      "Errore durante la modifica dell'utente"
    );
  }
});


// Elimina utente e relative assenze
app.post("/admin/user/delete/:email", async (req, res) => {
  try {
    const email = normEmail(
      decodeURIComponent(req.params.email)
    );

    const data = await readDB();

    const users = Array.isArray(data.users)
      ? data.users
      : [];

    const absences = Array.isArray(data.absences)
      ? data.absences
      : [];

    // Elimina l'utente
    data.users = users.filter(
      (u) => normEmail(u.email) !== email
    );

    // Elimina anche tutte le sue assenze
    data.absences = absences.filter((a) => {
      const absenceEmail = normEmail(
        a.email || a.user || a.mail || ""
      );

      return absenceEmail !== email;
    });

    await writeDB(data);

    console.log(`🗑️ Utente eliminato: ${email}`);

    res.redirect("/admin");

  } catch (err) {
    console.error("❌ Errore eliminazione utente:", err);
    res.status(500).send(
      "Errore durante l'eliminazione dell'utente"
    );
  }
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

async function startServer() {
  console.log("🚀 Avvio server...");

  const server = app.listen(PORT, () => {
    console.log(`⚙️ Server Express in ascolto sulla porta ${PORT}`);
  });

  try {
    await connectMongo();
    global.serverReady = true;
    console.log("🌐 App pronta!");
  } catch (err) {
    console.error("❌ Errore avvio:", err);
  }
}

startServer();
// =====================
// IMPORT
// =====================
const express = require("express");
const path = require("path");
const { MongoClient, ServerApiVersion } = require("mongodb");

// =====================
// CHECK VARIABILI AMBIENTE
// =====================
if (!process.env.MONGO_URI) {
  console.error("❌ ERRORE: variabile MONGO_URI non trovata!");
  console.error("ℹ️ Aggiungila nei 'Environment Variables' di Render.");
  process.exit(1);
}

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
  console.log("🔗 Connessione a MongoDB...");
  try {
    await client.connect();
    const db = client.db("assenza_facile");
    collection = db.collection("appdata");
    console.log("✅ Connesso a MongoDB Atlas");
  } catch (err) {
    console.error("❌ Errore connessione MongoDB:", err);
    throw err;
  }
}

// =====================
// EXPRESS APP
// =====================
const app = express();

// Endpoint ping per UptimeRobot
app.get("/ping", (_req, res) => {
  res.status(200).send("pong");
});

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
// FUNZIONI DB
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
// ROTTE APP
// =====================

// Pagina iniziale con loading inline
app.get("/", (req, res) => {
  if (!global.serverReady) {
    res.send(`
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="UTF-8" />
        <title>Avvio in corso...</title>
        <style>
          body {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background: #f8fafc;
            color: #333;
            font-family: "Segoe UI", system-ui, sans-serif;
            text-align: center;
          }
          .spinner {
            border: 5px solid #ddd;
            border-top: 5px solid #007bff;
            border-radius: 50%;
            width: 60px;
            height: 60px;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          h2 {
            font-weight: 500;
            font-size: 1.3rem;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <h2>🚀 L'app si sta avviando... Attendere qualche secondo...</h2>
      </body>
      </html>
    `);
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
  const user = data.users.find(u => normEmail(u.email) === email);
  if (!user) return res.redirect("/login");

  // 🔒 Filtra solo le assenze di questo utente, indipendentemente dal nome del campo
  const allAbsences = Array.isArray(data.absences) ? data.absences : [];
  const myAbsences = allAbsences.filter(a => {
    const mail = normEmail(a.email || a.user || a.mail || "");
    return mail === email;
  });

  // 📅 Calcola le date della categoria del figlio
  const cat = data.categories.find(c => c.name === user.category);
  const dates = computeWindowDatesForCategory(cat ? cat.days : []);

  // 🎯 Costruisce il calendario con flag "assente"
  const upcoming = dates.map(d => ({
    date: d,
    absent: myAbsences.some(a => a.date === d),
  }));

  res.render("parent_dashboard", {
    user,
    absences: myAbsences,
    upcoming,
    formatDateShort,
  });
});

// ----- TOGGLE ASSENZA -----
app.post("/parent/:email/toggle-absence", async (req, res) => {
  const email = normEmail(decodeURIComponent(req.params.email));
  const date = String(req.body.date || "").trim();
  const data = await readDB();

  let absences = Array.isArray(data.absences) ? data.absences : [];

  // 🔁 Normalizza tutti i record esistenti per evitare inconsistenze
  absences = absences.map(a => ({
    email: normEmail(a.email || a.user || a.mail || ""),
    date: a.date
  }));

  // 🔍 Verifica se esiste già un'assenza per questa data
  const exists = absences.find(a => a.email === email && a.date === date);

  if (exists) {
    // 🧹 Se già segnata, la rimuove
    absences = absences.filter(a => !(a.email === email && a.date === date));
  } else {
    // 🆕 Aggiunge nuova assenza con campo "email" coerente
    absences.push({ email, date });
  }

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

  // 🔥 FILTRA via assenze passate
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingAbsences = absences.filter((a) => {
    const d = new Date(a.date);
    return !isNaN(d) && d >= today;
  });

  // 🔄 salva su Mongo solo quelle ancora valide
  if (upcomingAbsences.length !== absences.length) {
    data.absences = upcomingAbsences;
    await writeDB(data);
    console.log("🧹 Pulizia automatica assenze passate completata");
  }

  // 📅 ordina e arricchisce
  const sortedAbsences = upcomingAbsences
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

  // 📆 calendario per categoria
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
// =====================
// CREA NUOVA CATEGORIA
// =====================
app.post("/admin/category", async (req, res) => {
  try {
    const data = await readDB();

    const name = String(req.body.name || "").trim();
    let days = req.body.days || [];

    // Il nome della categoria è obbligatorio
    if (!name) {
      return res.redirect("/admin");
    }

    // Se è stato selezionato un solo giorno,
    // Express restituisce una stringa invece di un array
    if (!Array.isArray(days)) {
      days = [days];
    }

    // Uniforma i nomi dei giorni
    days = days.map((d) =>
      String(d)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    );

    const categories = Array.isArray(data.categories)
      ? data.categories
      : [];

    // Controlla che non esista già una categoria con lo stesso nome
    const existing = categories.find(
      (c) =>
        String(c.name).trim().toLowerCase() ===
        name.toLowerCase()
    );

    if (existing) {
      console.log(`⚠️ Categoria già esistente: ${name}`);
      return res.redirect("/admin");
    }

    // Crea la nuova categoria
    categories.push({
      name: name,
      days: days
    });

    data.categories = categories;

    // Salva su MongoDB
    await writeDB(data);

    console.log(`✅ Nuova categoria creata: ${name}`, days);

    return res.redirect("/admin");

  } catch (err) {
    console.error("❌ Errore creazione categoria:", err);
    return res.status(500).send("Errore durante la creazione della categoria");
  }
});

// =====================
// MODIFICA CATEGORIA
// =====================

// Apre la pagina di modifica della categoria
app.get("/admin/category/edit/:name", async (req, res) => {
  try {
    const categoryName = decodeURIComponent(req.params.name);

    const data = await readDB();
    const categories = Array.isArray(data.categories)
      ? data.categories
      : [];

    const category = categories.find(
      (c) => String(c.name).trim() === String(categoryName).trim()
    );

    if (!category) {
      return res.status(404).send("Categoria non trovata");
    }

    res.render("edit_category", {
      category
    });

  } catch (err) {
    console.error("❌ Errore apertura modifica categoria:", err);
    res.status(500).send("Errore durante l'apertura della categoria");
  }
});


// Salva le modifiche della categoria
app.post("/admin/category/edit/:name", async (req, res) => {
  try {
    const categoryName = decodeURIComponent(req.params.name);

    let days = req.body.days || [];

    // Se viene selezionato un solo giorno Express restituisce una stringa
    if (!Array.isArray(days)) {
      days = [days];
    }

    // Uniforma i nomi dei giorni
    days = days.map((d) =>
      String(d)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    );

    const data = await readDB();

    const categories = Array.isArray(data.categories)
      ? data.categories
      : [];

    const category = categories.find(
      (c) => String(c.name).trim() === String(categoryName).trim()
    );

    if (!category) {
      return res.status(404).send("Categoria non trovata");
    }

    // Aggiorna solamente i giorni
    category.days = days;

    data.categories = categories;

    await writeDB(data);

    console.log(
      `✅ Categoria ${categoryName} aggiornata:`,
      days
    );

    res.redirect("/admin");

  } catch (err) {
    console.error("❌ Errore salvataggio categoria:", err);
    res.status(500).send("Errore durante il salvataggio della categoria");
  }
});
// =====================
// ELIMINA CATEGORIA
// =====================
app.post("/admin/category/delete/:name", async (req, res) => {
  try {
    const categoryName = decodeURIComponent(req.params.name);

    const data = await readDB();

    const categories = Array.isArray(data.categories)
      ? data.categories
      : [];

    // Elimina SOLO la categoria
    // Gli utenti registrati non vengono eliminati
    data.categories = categories.filter(
      (c) =>
        String(c.name).trim() !==
        String(categoryName).trim()
    );

    await writeDB(data);

    console.log(`🗑️ Categoria eliminata: ${categoryName}`);

    res.redirect("/admin");

  } catch (err) {
    console.error("❌ Errore eliminazione categoria:", err);
    res.status(500).send("Errore durante l'eliminazione della categoria");
  }
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

async function startServer() {
  console.log("🚀 Avvio server...");

  const server = app.listen(PORT, () => {
    console.log(`⚙️ Server Express in ascolto sulla porta ${PORT}`);
  });

  try {
    await connectMongo();
    global.serverReady = true;
    console.log("🌐 App pronta!");
  } catch (err) {
    console.error("❌ Errore avvio:", err);
  }
}

startServer();
