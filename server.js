// DISABLE SSL VERIFICATION for DigitalOcean Dev Database (Self-Signed Certs)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); // PostgreSQL client
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'viva_secret_key_change_me';

// PostgreSQL Pool Setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(cors());
app.use(cookieParser());

// Stripe Webhook needs raw body
app.post('/webhook', express.raw({ type: 'application/json' }), async (request, response) => {
    const sig = request.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        await handleCheckoutSuccess(session);
    }

    response.send();
});

app.use(express.json());
app.use(express.static('.'));

// Email Transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT, // 465 for SSL
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// --- DB Init & Helpers ---
async function initDB() {
    try {
        // Create Users Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'member',
                subscription_status VARCHAR(50) DEFAULT 'inactive',
                stripe_customer_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create Picks Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS picks (
                id SERIAL PRIMARY KEY,
                sport VARCHAR(50),
                time VARCHAR(50),
                matchup VARCHAR(255),
                pick VARCHAR(255),
                odds VARCHAR(50),
                units VARCHAR(50),
                bet_type VARCHAR(50),
                analysis TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Ensure bet_type exists if table was created older
        await pool.query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS bet_type VARCHAR(50);`);

        // Seed Admin (FORCE UPDATE/JOINT)
        const adminEmail = 'admin@vivapicks.tech';
        console.log("Seeding/Updating Admin User...");
        const hashedPassword = await bcrypt.hash('Maclin13$', 10);

        await pool.query(`
            INSERT INTO users (email, password, role, subscription_status)
            VALUES ($1, $2, 'admin', 'active')
            ON CONFLICT (email) 
            DO UPDATE SET 
                password = $2,
                role = 'admin',
                subscription_status = 'active'
        `, [adminEmail, hashedPassword]);

        console.log("Database initialized successfully.");
    } catch (err) {
        console.error("Error initializing database:", err);
    }
}
initDB();

async function handleCheckoutSuccess(session) {
    const email = session.customer_details.email;
    const stripeCustomerId = session.customer;

    try {
        await pool.query(`
            UPDATE users 
            SET subscription_status = 'active', stripe_customer_id = $1 
            WHERE email = $2
        `, [stripeCustomerId, email]);
        console.log(`Subscription activated for ${email}`);
    } catch (err) {
        console.error('Error updating subscription:', err);
    }
}

// --- Auth Middleware ---
function authenticateToken(req, res, next) {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    next();
}

// --- API Routes ---

// AUTH: Register
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;

    try {
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(`
            INSERT INTO users (email, password)
            VALUES ($1, $2)
        `, [email, hashedPassword]);

        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// AUTH: Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.cookie('token', token, { httpOnly: true });
        res.json({ message: 'Logged in', role: user.role, token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// AUTH: Logout
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
});

// AUTH: Me
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, email, role, subscription_status, stripe_customer_id FROM users WHERE id = $1', [req.user.id]);
        const user = result.rows[0];

        if (!user) return res.sendStatus(404);

        // Convert snake_case DB fields to camelCase for frontend compatibility
        res.json({
            id: user.id,
            email: user.email,
            role: user.role,
            subscriptionStatus: user.subscription_status,
            stripeCustomerId: user.stripe_customer_id
        });
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

// PICKS: Get All
app.delete('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [req.user.userId]);
        res.clearCookie('token');
        res.json({ message: 'Account deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

app.get('/api/picks', authenticateToken, async (req, res) => {
    try {
        const userRes = await pool.query('SELECT role, subscription_status FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        if (user.role !== 'admin' && user.subscription_status !== 'active') {
            return res.status(403).json({ error: 'Subscription required' });
        }

        const picksRes = await pool.query('SELECT * FROM picks ORDER BY created_at DESC');
        res.json(picksRes.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PICKS: Create & Broadcast (Admin Only)
app.post('/api/picks', authenticateToken, requireAdmin, async (req, res) => {
    const { sport, time, matchup, pick, odds, units, bet_type, analysis } = req.body;

    try {
        const result = await pool.query(`
            INSERT INTO picks (sport, time, matchup, pick, odds, units, bet_type, analysis)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [sport, time, matchup, pick, odds, units, bet_type, analysis]);

        const newPick = result.rows[0];

        // Broadcast Email
        const subsRes = await pool.query("SELECT email FROM users WHERE subscription_status = 'active'");
        const subscribers = subsRes.rows;

        if (subscribers.length > 0) {
            console.log(`Broadcasting new pick to ${subscribers.length} subscribers...`);
            const emailContent = `
                <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
                    <h1 style="color: #f97316;">VIVA PICKS: NEW INTEL</h1>
                    <p style="color: #666;">New signal detected for <strong>${newPick.sport}</strong></p>
                    <hr>
                    <h2 style="margin: 0;">${newPick.matchup}</h2>
                    <p style="font-size: 1.2rem; margin: 10px 0;"><strong>Pick:</strong> ${newPick.pick} (${newPick.odds})</p>
                    <p><strong>Type:</strong> ${newPick.bet_type || 'General'}</p>
                    <p><strong>Units:</strong> ${newPick.units || '1u'}</p>
                    <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #f97316;">
                        <strong>ANALYSIS:</strong><br>${newPick.analysis}
                    </div>
                    <br>
                    <br>
                    <a href="https://vivapicks.tech/dashboard.html" style="background: #f97316; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">VIEW DASHBOARD</a>
                    <hr style="margin-top: 30px; border: 0; border-top: 1px solid #ddd;">
                    <p style="font-size: 0.75rem; color: #999; text-align: center;">
                        You are receiving this because you opted in at VivaPicks.tech.<br>
                        <a href="https://vivapicks.tech/account.html" style="color: #999;">Manage Subscription</a> | 
                        <a href="https://vivapicks.tech/privacy.html" style="color: #999;">Privacy Policy</a>
                    </p>
                </div>
            `;

            subscribers.forEach(sub => {
                transporter.sendMail({
                    from: process.env.EMAIL_FROM,
                    to: sub.email,
                    subject: `[VIVA PICKS] NEW INTEL: ${newPick.matchup}`,
                    html: emailContent
                }).catch(err => console.error(`Failed to email ${sub.email}:`, err.message));
            });
        }
        res.status(201).json(newPick);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ADMIN: Update Pick
app.put('/api/picks/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { sport, time, matchup, pick, odds, units, bet_type, analysis } = req.body;
    try {
        const result = await pool.query(`
            UPDATE picks 
            SET sport = $1, time = $2, matchup = $3, pick = $4, odds = $5, units = $6, bet_type = $7, analysis = $8 
            WHERE id = $9 RETURNING *
        `, [sport, time, matchup, pick, odds, units, bet_type, analysis, id]);

        if (result.rows.length === 0) return res.status(404).json({ error: 'Pick not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ADMIN: Delete Pick
app.delete('/api/picks/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM picks WHERE id = $1', [id]);
        res.json({ message: 'Pick deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ADMIN: Get User Stats
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, email, role, subscription_status, created_at FROM users ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ADMIN: Update User
app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { role, subscription_status } = req.body; // Expect partial updates

    try {
        // Build dynamic query
        const fields = [];
        const values = [];
        let idx = 1;

        if (role) {
            fields.push(`role = $${idx++}`);
            values.push(role);
        }
        if (subscription_status) {
            fields.push(`subscription_status = $${idx++}`);
            values.push(subscription_status);
        }

        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        values.push(id);
        const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;

        const result = await pool.query(query, values);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ADMIN: Delete User
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ message: 'User deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// STRIPE Checkout
app.post('/api/create-checkout-session', authenticateToken, async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            customer_email: req.user.email,
            line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
            mode: 'subscription',
            allow_promotion_codes: true,
            success_url: `https://vivapicks.tech/dashboard.html?subscription=success`,
            cancel_url: `https://vivapicks.tech/index.html?subscription=canceled`,
        });
        res.json({ url: session.url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// STRIPE Billing Portal
app.post('/api/create-portal-session', authenticateToken, async (req, res) => {
    try {
        const userRes = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        if (!user.stripe_customer_id) {
            return res.status(400).json({ error: 'No billing history found.' });
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripe_customer_id,
            return_url: `https://vivapicks.tech/account.html`,
        });

        res.json({ url: session.url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
