const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const nodemailer = require('nodemailer');
const validator = require('validator');

const app = express();
app.use(bodyParser.json());

const cors = require('cors');
app.use(cors());


const USERS_FILE = './users.json';
let tempCodes = {}; // Store temporary codes in memory

// Load users or create empty array
let users = [];
if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE));
}

// Setup Nodemailer (Gmail example)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'jexcoht@gmail.com',
        pass: 'fckgwrhqq2U', // Use app password
    }
});

// Helper: save users to JSON
function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Helper: generate random code
function generateCode(length = 6) {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Validate password complexity
function isPasswordValid(password) {
    return password.length >= 6 && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

// ----------------- ROUTES -----------------

// 1️⃣ Request registration (send code)
app.post('/register', (req, res) => {
    const { email, password } = req.body;

    // Check email format
    if (!validator.isEmail(email)) return res.status(400).json({ error: 'Invalid email format' });

    // Check password complexity
    if (!isPasswordValid(password)) return res.status(400).json({ error: 'Password must be >=6 chars, include 1 uppercase & 1 number' });

    // Check email duplication
    if (users.some(u => u.email === email)) return res.status(400).json({ error: 'Email already registered' });

    // Generate temporary code
    const code = generateCode();
    tempCodes[email] = { code, password };

    // Send email
    transporter.sendMail({
        from: 'YOUR_EMAIL@gmail.com',
        to: email,
        subject: 'Your Temporary Code',
        text: `Your registration code is: ${code}`
    }, (err, info) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to send email' });
        }
        res.json({ message: 'Temporary code sent to email' });
    });
});

// 2️⃣ Verify temporary code
app.post('/verify', (req, res) => {
    const { email, code } = req.body;

    if (!tempCodes[email]) return res.status(400).json({ error: 'No registration request found' });

    if (tempCodes[email].code !== code) return res.status(400).json({ error: 'Invalid code' });

    // Save user
    users.push({ email, password: tempCodes[email].password });
    saveUsers();

    // Remove temp code
    delete tempCodes[email];

    res.json({ message: 'Registration successful' });
});

// 3️⃣ Login
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    res.json({ message: 'Login successful' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));