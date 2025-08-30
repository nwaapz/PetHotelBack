// server.js
const express = require('express');
const fs = require('fs');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const USERS_FILE = './users.json';
let users = [];
if (fs.existsSync(USERS_FILE)) {
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to read users file', e);
    users = [];
  }
}

// Temp codes in memory: { email: { code, passwordHash, expires } }
const tempCodes = {};

// Helpers
const asString = v => (typeof v === 'string') ? v.trim() : '';

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
}

function isPasswordValid(password) {
  if (!password || password.length < 6) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

// Nodemailer setup — use env vars in production
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  console.log('Nodemailer configured (Gmail).');
} else {
  console.log('EMAIL_USER/EMAIL_PASS not set — email will be logged to console instead of sent.');
  transporter = {
    sendMail: (mailOptions, cb) => {
      console.log('---FAKE EMAIL SEND---');
      console.log('To:', mailOptions.to);
      console.log('Subject:', mailOptions.subject);
      console.log('Text:', mailOptions.text);
      console.log('---------------------');
      setTimeout(() => cb && cb(null, { info: 'logged' }), 200);
    }
  };
}

// Routes

// Register: send verification code
app.post('/register', async (req, res) => {
  try {
    console.log('/register body:', req.body);

    const email = asString(req.body?.email);
    const password = asString(req.body?.password);

    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid or missing email' });
    }
    if (!isPasswordValid(password)) {
      return res.status(400).json({ error: 'Password must be >=6 chars, include 1 uppercase & 1 number' });
    }
    if (users.some(u => u.email === email)) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const code = generateCode();
    const passwordHash = await bcrypt.hash(password, 10);
    // store temporarily (expires in 15 minutes)
    tempCodes[email] = { code, passwordHash, expires: Date.now() + 15 * 60 * 1000 };

    // send code by email (or log)
    transporter.sendMail({
      from: process.env.EMAIL_USER || 'no-reply@example.com',
      to: email,
      subject: 'Your verification code',
      text: `Your verification code is: ${code}`
    }, (err, info) => {
      if (err) {
        console.error('Error sending verification email:', err);
        return res.status(500).json({ error: 'Failed to send verification code' });
      }
      return res.json({ message: 'Temporary code sent to email' });
    });

  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify: confirm code and create user
app.post('/verify', (req, res) => {
  try {
    console.log('/verify body:', req.body);

    const email = asString(req.body?.email);
    const code = asString(req.body?.code);

    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid or missing email' });
    }
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const entry = tempCodes[email];
    if (!entry) return res.status(400).json({ error: 'No registration request found' });
    if (Date.now() > (entry.expires || 0)) {
      delete tempCodes[email];
      return res.status(400).json({ error: 'Code expired' });
    }
    if (entry.code !== code) return res.status(400).json({ error: 'Invalid code' });

    // create user
    users.push({ email, passwordHash: entry.passwordHash, created: new Date().toISOString() });
    saveUsers();

    delete tempCodes[email];
    return res.json({ message: 'Registration successful' });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
app.post('/login', async (req, res) => {
  try {
    console.log('/login body:', req.body);

    const email = asString(req.body?.email);
    const password = asString(req.body?.password);

    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid or missing email' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // SUCCESS - in production return a JWT token here
    return res.json({ message: 'Login successful', email });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/', (req, res) => res.send('Server running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
