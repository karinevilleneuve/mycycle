// server.js - Using ES Modules syntax
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ─── Paths ────────────────────────────────────────────────────────────────────
const DATA_DIR   = path.join(__dirname, 'user-data');   // one JSON file per user
const USERS_FILE = path.join(__dirname, 'users.json');  // usernames + hashed passwords
const TOKENS_FILE = path.join(__dirname, 'tokens.json'); // active session tokens

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Hash a password with SHA-256 + a salt
// We're not using bcrypt to keep dependencies minimal,
// but we do salt the hash so identical passwords produce different hashes.
function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(password).digest('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = hashPassword(password, storedSalt);
  return hash === storedHash;
}

// Generate a random session token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Load users from file
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

// Save users to file
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Load active tokens
function loadTokens() {
  if (!fs.existsSync(TOKENS_FILE)) return {};
  return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
}

// Save tokens
function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

// Get the data file path for a specific user
function getUserDataFile(username) {
  // Sanitize username to prevent path traversal attacks
  const safe = username.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(DATA_DIR, `data-${safe}.json`);
}

// Initialize a user's data file if it doesn't exist
function initUserDataFile(username) {
  const filePath = getUserDataFile(username);
  if (!fs.existsSync(filePath)) {
    const initialData = {
      periodDates: [],
      symptoms: {},
      iudInsertionDate: null,
      lastModified: Date.now(),
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
    console.log(`Created data file for user: ${username}`);
  }
  return filePath;
}

// ─── Create initial users if none exist ───────────────────────────────────────
// IMPORTANT: Edit the usernames and passwords below before first run.
// After first run, users are stored in users.json — changes here won't apply.
function initializeDefaultUsers() {
  const users = loadUsers();
  if (Object.keys(users).length === 0) {
    console.log('No users found — creating default users from config...');

    const defaultUsers = [
      { username: 'karine',   password: 'changeme1' },
      { username: 'user2',    password: 'changeme2' },
    ];

    defaultUsers.forEach(({ username, password }) => {
      const { hash, salt } = hashPassword(password);
      users[username] = { hash, salt };
      initUserDataFile(username);
      console.log(`Created user: ${username}`);
    });

    saveUsers(users);
    console.log('✅ Default users created. Please change passwords via the /api/change-password endpoint.');
  }
}

initializeDefaultUsers();

// ─── Auth middleware ───────────────────────────────────────────────────────────
// Checks that the request has a valid token and attaches the username to req
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.slice(7);
  const tokens = loadTokens();

  if (!tokens[token]) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Token expires after 30 days of inactivity
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - tokens[token].lastUsed > thirtyDays) {
    delete tokens[token];
    saveTokens(tokens);
    return res.status(401).json({ error: 'Token expired — please log in again' });
  }

  // Update last used timestamp
  tokens[token].lastUsed = Date.now();
  saveTokens(tokens);

  req.username = tokens[token].username;
  next();
}

// ─── Auth routes ──────────────────────────────────────────────────────────────

// POST /api/login — returns a token if credentials are valid
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const users = loadUsers();
  const user  = users[username];

  if (!user || !verifyPassword(password, user.hash, user.salt)) {
    // Generic error — don't reveal whether username exists
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Generate and store token
  const token  = generateToken();
  const tokens = loadTokens();
  tokens[token] = { username, lastUsed: Date.now() };
  saveTokens(tokens);

  // Make sure their data file exists
  initUserDataFile(username);

  console.log(`✅ User logged in: ${username}`);
  res.json({ success: true, token, username });
});

// POST /api/logout — invalidates the current token
app.post('/api/logout', requireAuth, (req, res) => {
  const token  = req.headers['authorization'].slice(7);
  const tokens = loadTokens();
  delete tokens[token];
  saveTokens(tokens);
  console.log(`👋 User logged out: ${req.username}`);
  res.json({ success: true });
});

// POST /api/change-password — allows a logged-in user to change their password
app.post('/api/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const users = loadUsers();
  const user  = users[req.username];

  if (!verifyPassword(currentPassword, user.hash, user.salt)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const { hash, salt } = hashPassword(newPassword);
  users[req.username] = { hash, salt };
  saveUsers(users);

  console.log(`🔑 Password changed for user: ${req.username}`);
  res.json({ success: true, message: 'Password changed successfully' });
});

// GET /api/me — returns the current user's username (useful for UI display)
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.username });
});

// ─── Data routes (all require auth) ──────────────────────────────────────────

// GET /api/data — returns the logged-in user's data
app.get('/api/data', requireAuth, (req, res) => {
  try {
    const filePath = initUserDataFile(req.username);
    const data = fs.readFileSync(filePath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading data:', error);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

// POST /api/data — saves the logged-in user's data
app.post('/api/data', requireAuth, (req, res) => {
  try {
    const filePath  = initUserDataFile(req.username);
    const newData   = req.body;
    newData.lastUpdated  = new Date().toISOString();
    newData.lastModified = Date.now();
    fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));
    res.json({ success: true, message: 'Data saved successfully' });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// POST /api/periods
app.post('/api/periods', requireAuth, (req, res) => {
  try {
    const { periodDates } = req.body;
    const filePath = initUserDataFile(req.username);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.periodDates  = periodDates;
    data.lastUpdated  = new Date().toISOString();
    data.lastModified = Date.now();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving periods:', error);
    res.status(500).json({ error: 'Failed to save periods' });
  }
});

// POST /api/symptoms
app.post('/api/symptoms', requireAuth, (req, res) => {
  try {
    const { symptoms } = req.body;
    const filePath = initUserDataFile(req.username);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.symptoms     = symptoms;
    data.lastUpdated  = new Date().toISOString();
    data.lastModified = Date.now();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving symptoms:', error);
    res.status(500).json({ error: 'Failed to save symptoms' });
  }
});

// POST /api/iud
app.post('/api/iud', requireAuth, (req, res) => {
  try {
    const { iudInsertionDate } = req.body;
    const filePath = initUserDataFile(req.username);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.iudInsertionDate = iudInsertionDate;
    data.lastUpdated      = new Date().toISOString();
    data.lastModified     = Date.now();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving IUD date:', error);
    res.status(500).json({ error: 'Failed to save IUD date' });
  }
});

// GET /api/export/csv
app.get('/api/export/csv', requireAuth, (req, res) => {
  try {
    const filePath = initUserDataFile(req.username);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    let csv = 'Date,Type,Details\n';
    data.periodDates.forEach(date => { csv += `${date},Period,Period day\n`; });
    Object.entries(data.symptoms).forEach(([date, info]) => {
      info.symptoms.forEach(s => { csv += `${date},Symptom,${s}\n`; });
      if (info.notes) csv += `${date},Note,${info.notes.replace(/,/g, ';')}\n`;
    });
    if (data.iudInsertionDate) csv += `${data.iudInsertionDate},IUD,Insertion date\n`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=period-tracker-${req.username}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 User data directory: ${DATA_DIR}`);
  console.log(`👥 Users file: ${USERS_FILE}`);
});