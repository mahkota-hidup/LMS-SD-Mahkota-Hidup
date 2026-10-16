require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const path = require("path");

const app = express();
const db = new Database(process.env.DB_PATH || "lms.sqlite");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('siswa','guru','admin')),
  identifier TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  class_name TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL,
  due_date TEXT DEFAULT '',
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  answer TEXT NOT NULL,
  grade REAL,
  feedback TEXT DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(assignment_id, student_id)
);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const adminId = process.env.INITIAL_ADMIN_NPSN;
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
if (adminId && adminId !== "ISI_NPSN_SEKOLAH" && adminPassword &&
    adminPassword !== "GANTI_PASSWORD_ADMIN_YANG_KUAT") {
  const exists = db.prepare("SELECT id FROM users WHERE identifier=?").get(adminId);
  if (!exists) {
    db.prepare("INSERT INTO users(role,identifier,name,password_hash) VALUES('admin',?,?,?)")
      .run(adminId, "Administrator SD Mahkota Hidup", bcrypt.hashSync(adminPassword, 12));
    console.log("Akun admin awal dibuat. Simpan kredensial dengan aman.");
  }
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: process.env.DATA_DIR || "." }),
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8*60*60*1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

const roles = { siswa: "NISN", guru: "NUPTK", admin: "NPSN" };
function auth(req,res,next) {
  if (!req.session.user) return res.status(401).json({error:"Silakan login terlebih dahulu."});
  next();
}
function allow(...allowed) {
  return (req,res,next) => {
    if (!req.session.user) return res.status(401).json({error:"Silakan login terlebih dahulu."});
    if (!allowed.includes(req.session.user.role)) return res.status(403).json({error:"Akses tidak diizinkan."});
    next();
  };
}
function cleanUser(u) { return {id:u.id, role:u.role, identifier:u.identifier, name:u.name, class_name:u.class_name || ""}; }

app.get("/api/config", (req,res) => res.json({school: process.env.SCHOOL_NAME || "SD Mahkota Hidup", roles}));
app.get("/api/me", (req,res) => res.json({user:req.session.user || null}));
app.post("/api/login", (req,res) => {
  const {role, identifier, password} = req.body || {};
  if (!roles[role] || !identifier || !password) return res.status(400).json({error:"Lengkapi jenis akun, nomor identitas, dan kata sandi."});
  const user = db.prepare("SELECT * FROM users WHERE role=? AND identifier=?").get(role, String(identifier).trim());
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) return res.status(401).json({error:"Identitas atau kata sandi tidak sesuai."});
  req.session.regenerate(err => {
    if (err) return res.status(500).json({error:"Gagal membuat sesi login."});
    req.session.user = cleanUser(user);
    req.session.save(err2 => err2 ? res.status(500).json({error:"Gagal menyimpan sesi."}) : res.json({user:req.session.user}));
  });
});
app.post("/api/logout", auth, (req,res) => req.session.destroy(() => res.json({ok:true})));

app.get("/api/dashboard", auth, (req,res) => {
  const u = req.session.user;
  const materials = db.prepare("SELECT m.*,u.name AS teacher_name FROM materials m JOIN users u ON u.id=m.teacher_id ORDER BY m.id DESC LIMIT 30").all();
  const assignments = db.prepare("SELECT a.*,u.name AS teacher_name FROM assignments a JOIN users u ON u.id=a.teacher_id ORDER BY a.id DESC LIMIT 30").all();
  const announcements = db.prepare("SELECT a.*,u.name AS author_name FROM announcements a JOIN users u ON u.id=a.author_id ORDER BY a.id DESC LIMIT 10").all();
  let users = [];
  let submissions = [];
  if (u.role === "admin") users = db.prepare("SELECT id,role,identifier,name,class_name,created_at FROM users ORDER BY role,name").all();
  if (u.role === "guru" || u.role === "admin") {
    submissions = db.prepare(`SELECT s.*,a.title AS assignment_title,u.name AS student_name,u.identifier AS student_identifier
      FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN users u ON u.id=s.student_id ORDER BY s.id DESC LIMIT 100`).all();
  } else {
    submissions = db.prepare(`SELECT s.*,a.title AS assignment_title FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.student_id=? ORDER BY s.id DESC`).all(u.id);
  }
  res.json({user:u, materials, assignments, announcements, users, submissions,
    counts:{students:db.prepare("SELECT count(*) n FROM users WHERE role='siswa'").get().n,
    teachers:db.prepare("SELECT count(*) n FROM users WHERE role='guru'").get().n,
    materials:db.prepare("SELECT count(*) n FROM materials").get().n,
    assignments:db.prepare("SELECT count(*) n FROM assignments").get().n}});
});

app.post("/api/users", allow("admin"), (req,res) => {
  const {role,identifier,name,password,class_name=""} = req.body || {};
  if (!["siswa","guru","admin"].includes(role) || !identifier || !name || !password || String(password).length < 10)
    return res.status(400).json({error:"Lengkapi data. Kata sandi minimal 10 karakter."});
  try {
    const result = db.prepare("INSERT INTO users(role,identifier,name,password_hash,class_name) VALUES(?,?,?,?,?)")
      .run(role,String(identifier).trim(),String(name).trim(),bcrypt.hashSync(String(password),12),String(class_name).trim());
    res.json({ok:true,id:result.lastInsertRowid});
  } catch(e) {
    res.status(409).json({error:"Nomor identitas sudah digunakan atau data tidak valid."});
  }
});
app.post("/api/materials", allow("guru","admin"), (req,res) => {
  const {title,subject,class_name="",body} = req.body || {};
  if (!title || !subject || !body) return res.status(400).json({error:"Judul, mata pelajaran, dan isi materi wajib diisi."});
  const result = db.prepare("INSERT INTO materials(title,subject,class_name,body,teacher_id) VALUES(?,?,?,?,?)")
    .run(title,subject,class_name,body,req.session.user.id);
  res.json({ok:true,id:result.lastInsertRowid});
});
app.post("/api/assignments", allow("guru","admin"), (req,res) => {
  const {title,subject,class_name="",instructions,due_date=""} = req.body || {};
  if (!title || !subject || !instructions) return res.status(400).json({error:"Judul, mata pelajaran, dan instruksi wajib diisi."});
  const result = db.prepare("INSERT INTO assignments(title,subject,class_name,instructions,due_date,teacher_id) VALUES(?,?,?,?,?,?)")
    .run(title,subject,class_name,instructions,due_date,req.session.user.id);
  res.json({ok:true,id:result.lastInsertRowid});
});
app.post("/api/assignments/:id/submit", allow("siswa"), (req,res) => {
  const assignment = db.prepare("SELECT id FROM assignments WHERE id=?").get(req.params.id);
  if (!assignment) return res.status(404).json({error:"Tugas tidak ditemukan."});
  const answer = String((req.body || {}).answer || "").trim();
  if (!answer) return res.status(400).json({error:"Jawaban tidak boleh kosong."});
  try {
    db.prepare("INSERT INTO submissions(assignment_id,student_id,answer) VALUES(?,?,?) ON CONFLICT(assignment_id,student_id) DO UPDATE SET answer=excluded.answer,submitted_at=CURRENT_TIMESTAMP")
      .run(assignment.id,req.session.user.id,answer);
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:"Pengumpulan gagal."}); }
});
app.post("/api/submissions/:id/grade", allow("guru","admin"), (req,res) => {
  const grade = Number((req.body || {}).grade);
  const feedback = String((req.body || {}).feedback || "");
  if (!Number.isFinite(grade) || grade < 0 || grade > 100) return res.status(400).json({error:"Nilai harus antara 0 dan 100."});
  const result = db.prepare("UPDATE submissions SET grade=?,feedback=? WHERE id=?").run(grade,feedback,req.params.id);
  if (!result.changes) return res.status(404).json({error:"Pengumpulan tugas tidak ditemukan."});
  res.json({ok:true});
});
app.post("/api/announcements", allow("guru","admin"), (req,res) => {
  const {title,body} = req.body || {};
  if (!title || !body) return res.status(400).json({error:"Judul dan isi pengumuman wajib diisi."});
  db.prepare("INSERT INTO announcements(title,body,author_id) VALUES(?,?,?)").run(title,body,req.session.user.id);
  res.json({ok:true});
});
app.get("*", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`LMS SD Mahkota Hidup berjalan pada port ${port}`));
