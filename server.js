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
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Middleware
let oddsCache = {}; // Cache for Odds API to save calls
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

// Clean URL Routes
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'signup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/warroom', (req, res) => res.sendFile(path.join(__dirname, 'warroom.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/linetracker', (req, res) => res.sendFile(path.join(__dirname, 'linetracker.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'account.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));

app.use(express.static('.'));

// Email Transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    authMethod: 'LOGIN', // Force AUTH LOGIN for Titan Email compatibility
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
        // Ensure columns exist if table was created older
        await pool.query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS bet_type VARCHAR(50);`);
        await pool.query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS result VARCHAR(20);`);

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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS saved_odds (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                sport VARCHAR(50),
                data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                name VARCHAR(100)
            );
        `);

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
// Health Check
app.get('/api/ping', (req, res) => res.json({ status: 'online' }));

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

        // Send Welcome Email
        const welcomeHtml = `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #333; background: #111; color: #fff;">
                <h1 style="color: #f97316; margin-bottom: 20px;">WELCOME TO THE INNER CIRCLE</h1>
                <p>You have successfully secured your access to <strong>Viva Picks</strong>.</p>
                <p>We provide high-frequency sports betting intel powered by advanced algorithmic modeling.</p>
                <div style="background: #222; padding: 15px; margin: 20px 0; border-left: 4px solid #f97316;">
                    <strong>NEXT STEPS:</strong>
                    <ul style="padding-left: 20px;">
                        <li>Log in to your Dashboard</li>
                        <li>Activate your Subscription for full access</li>
                        <li>Watch for daily signals</li>
                    </ul>
                </div>
                <a href="https://vivapicks.tech/login.html" style="background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">ACCESS DASHBOARD</a>
                <p style="margin-top: 30px; font-size: 0.8rem; color: #666;">
                    System Message // Automated Generation<br>
                    Viva Picks Intelligence
                </p>
            </div>
        `;

        transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: 'Welcome to VivaPicks',
            html: welcomeHtml
        }).catch(err => console.error('Welcome email failed:', err));

        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// AUTH: Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    console.log(`/// LOGIN ATTEMPT: ${email}`);

    try {
        console.log(`/// DB QUERY START: Finding user ${email}...`);
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        console.log(`/// DB QUERY SUCCESS: User found? ${!!result.rows[0]}`);
        const user = result.rows[0];

        if (!user) {
            console.log('/// LOGIN FAILED: User not found.');
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        console.log('/// VERIFYING PASSWORD...');
        const isMatch = await bcrypt.compare(password, user.password);
        console.log(`/// PASSWORD MATCH: ${isMatch}`);

        if (!isMatch) {
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
        if (req.body.notify !== false) {
            const subsRes = await pool.query("SELECT email FROM users WHERE subscription_status = 'active'");
            const subscribers = subsRes.rows;

            if (subscribers.length > 0) {
                console.log(`Broadcasting new pick to ${subscribers.length} subscribers...`);
                const emailContent = `
                <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #000000; color: #ffffff; border: 1px solid #333333;">
                    <!-- HEADER -->
                    <div style="background-color: #111111; padding: 20px; text-align: center; border-bottom: 2px solid #f97316;">
                        <h1 style="color: #f97316; margin: 0; font-size: 24px; letter-spacing: 2px;">VIVA PICKS</h1>
                        <p style="color: #888; font-size: 10px; margin: 5px 0 0 0; letter-spacing: 1px;">INTELLIGENCE ACQUIRED</p>
                    </div>

                    <!-- MAIN CONTENT -->
                    <div style="padding: 30px 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <span style="background-color: #f97316; color: #000; padding: 4px 8px; font-weight: bold; font-size: 11px; border-radius: 2px;">${newPick.sport} SIGNAL</span>
                        </div>

                        <h2 style="margin: 0 0 10px 0; font-size: 20px; text-align: center; color: #ffffff;">${newPick.matchup}</h2>
                        <div style="text-align: center; color: #888; font-size: 14px; margin-bottom: 25px;">${new Date(newPick.time).toLocaleString()}</div>

                        <div style="background-color: #111; border: 1px solid #333; padding: 20px; margin-bottom: 25px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 15px;">
                                <span style="color: #888;">PICK</span>
                                <span style="color: #f97316; font-weight: bold; font-size: 18px;">${newPick.pick}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <span style="color: #888;">ODDS</span>
                                <span style="color: #fff;">${newPick.odds}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <span style="color: #888;">UNITS</span>
                                <span style="color: #fff;">${newPick.units || '1u'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #888;">TYPE</span>
                                <span style="color: #fff;">${newPick.bet_type || 'Standard'}</span>
                            </div>
                        </div>

                        <div style="background-color: #1a1a1a; padding: 15px; font-size: 14px; line-height: 1.5; color: #ccc; border-left: 3px solid #f97316;">
                            <strong style="color: #fff; display: block; margin-bottom: 5px;">ANALYSIS:</strong>
                            ${newPick.analysis}
                        </div>

                        <div style="text-align: center; margin-top: 30px;">
                            <a href="https://vivapicks.tech/dashboard.html" style="background-color: #f97316; color: #000000; padding: 15px 30px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">ACCESS WAR ROOM</a>
                        </div>
                    </div>

                    <!-- FOOTER -->
                    <div style="background-color: #111; padding: 20px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #333;">
                        <p style="margin-bottom: 10px;">VIVA PICKS &copy; 2026</p>
                        <a href="https://vivapicks.tech/account.html" style="color: #666; text-decoration: none;">Manage Subscription</a>
                         &bull; 
                        <a href="https://vivapicks.tech/privacy.html" style="color: #666; text-decoration: none;">Privacy</a>
                    </div>
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
    const { sport, time, matchup, pick, odds, units, bet_type, analysis, result: pickResult } = req.body;
    try {
        const query = `
            UPDATE picks 
            SET sport = $1, time = $2, matchup = $3, pick = $4, odds = $5, units = $6, bet_type = $7, analysis = $8, result = $9
            WHERE id = $10 RETURNING *
        `;
        const result = await pool.query(query, [sport, time, matchup, pick, odds, units, bet_type, analysis, pickResult, id]);

        if (result.rows.length === 0) return res.status(404).json({ error: 'Pick not found' });

        const updatedPick = result.rows[0];

        // Broadcast Email on Update (Only if explicitly checked)
        if (req.body.notify === true) {
            const subsRes = await pool.query("SELECT email FROM users WHERE subscription_status = 'active'");
            const subscribers = subsRes.rows;

            if (subscribers.length > 0) {
                console.log(`Broadcasting update to ${subscribers.length} subscribers...`);
                const emailContent = `
                <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #000000; color: #ffffff; border: 1px solid #333333;">
                    <div style="background-color: #111111; padding: 20px; text-align: center; border-bottom: 2px solid #f97316;">
                        <h1 style="color: #f97316; margin: 0; font-size: 24px; letter-spacing: 2px;">VIVA PICKS</h1>
                        <p style="color: #888; font-size: 10px; margin: 5px 0 0 0; letter-spacing: 1px;">INTELLIGENCE UPDATED</p>
                    </div>

                    <div style="padding: 30px 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <span style="background-color: #f97316; color: #000; padding: 4px 8px; font-weight: bold; font-size: 11px; border-radius: 2px;">${updatedPick.sport} UPDATE</span>
                        </div>

                        <h2 style="margin: 0 0 10px 0; font-size: 20px; text-align: center; color: #ffffff;">${updatedPick.matchup}</h2>
                        <div style="text-align: center; color: #888; font-size: 14px; margin-bottom: 25px;">${new Date(updatedPick.time).toLocaleString()}</div>

                        <div style="background-color: #111; border: 1px solid #333; padding: 20px; margin-bottom: 25px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 15px;">
                                <span style="color: #888;">PICK</span>
                                <span style="color: #f97316; font-weight: bold; font-size: 18px;">${updatedPick.pick}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <span style="color: #888;">ODDS</span>
                                <span style="color: #fff;">${updatedPick.odds}</span>
                            </div>
                             <div style="display: flex; justify-content: space-between;">
                                <span style="color: #888;">RESULT</span>
                                <span style="color: ${updatedPick.result === 'WIN' ? '#4ade80' : (updatedPick.result === 'LOSS' ? '#ef4444' : '#fff')}; font-weight: bold;">${updatedPick.result || 'PENDING'}</span>
                            </div>
                        </div>

                        <div style="background-color: #1a1a1a; padding: 15px; font-size: 14px; line-height: 1.5; color: #ccc; border-left: 3px solid #f97316;">
                            <strong style="color: #fff; display: block; margin-bottom: 5px;">ANALYSIS:</strong>
                            ${updatedPick.analysis}
                        </div>
                         <div style="text-align: center; margin-top: 30px;">
                            <a href="https://vivapicks.tech/dashboard.html" style="background-color: #f97316; color: #000000; padding: 15px 30px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">VIEW DASHBOARD</a>
                        </div>
                    </div>
                </div>
            `;
                subscribers.forEach(sub => {
                    transporter.sendMail({
                        from: process.env.EMAIL_FROM,
                        to: sub.email,
                        subject: `[VIVA PICKS] UPDATE: ${updatedPick.matchup}`,
                        html: emailContent
                    }).catch(err => console.error(`Failed to email ${sub.email}:`, err.message));
                });
            }
        }

        res.json(updatedPick);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ADMIN: Get Odds for Auto-Fill
app.get('/api/admin/odds/:sport', authenticateToken, requireAdmin, async (req, res) => {
    const { sport } = req.params;
    const apiKey = process.env.ODDS_API_KEY;

    // Map common names to API keys
    const sportKeys = {
        'NBA': 'basketball_nba',
        'NFL': 'americanfootball_nfl',
        'MLB': 'baseball_mlb',
        'NHL': 'icehockey_nhl',
        'UFC': 'mma_mixed_martial_arts',
        'NCAAF': 'americanfootball_ncaaf',
        'NCAAB': 'basketball_ncaab',
        'WNBA': 'basketball_wnba',
        'MLS': 'soccer_usa_mls',
        'EPL': 'soccer_epl',
    };

    const sportKey = sportKeys[sport];
    if (!sportKey) return res.status(400).json({ error: 'Sport not supported for auto-odds' });

    try {
        // Fetching from DraftKings as a standard reference
        const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american&bookmakers=draftkings`;
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) throw new Error(data.message || 'Failed to fetch odds');

        // Simplify data
        const games = data.map(game => {
            const book = game.bookmakers[0];

            // Basic game info
            const matchup = `${game.away_team} @ ${game.home_team}`;
            let homeOdds = 'N/A';
            let awayOdds = 'N/A';

            if (book) {
                const outcomes = book.markets[0].outcomes;
                const home = outcomes.find(o => o.name === game.home_team);
                const away = outcomes.find(o => o.name === game.away_team);
                if (home) homeOdds = home.price > 0 ? `+${home.price}` : home.price;
                if (away) awayOdds = away.price > 0 ? `+${away.price}` : away.price;
            }

            return {
                matchup: matchup,
                time: game.commence_time,
                description: `${matchup} (${awayOdds} / ${homeOdds})`,
                home_team: game.home_team,
                away_team: game.away_team,
                home_odds: homeOdds,
                away_odds: awayOdds
            };
        });

        res.json(games);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// PUBLIC: Get Live Lines (Cached 60min)
app.get('/api/public/lines/:sport', authenticateToken, async (req, res) => {
    const { sport } = req.params;
    const apiKey = process.env.ODDS_API_KEY;

    // Simple Cache Check
    const now = Date.now();
    const CACHE_TTL = 60 * 60 * 1000; // 1 Hour
    if (oddsCache[sport] && (now - oddsCache[sport].timestamp < CACHE_TTL)) {
        return res.json({ source: 'cache', data: oddsCache[sport].data });
    }

    const sportKeys = {
        'NBA': 'basketball_nba',
        'NFL': 'americanfootball_nfl',
        'MLB': 'baseball_mlb',
        'NHL': 'icehockey_nhl',
        'UFC': 'mma_mixed_martial_arts',
        'NCAAF': 'americanfootball_ncaaf',
        'NCAAB': 'basketball_ncaab',
        'WNBA': 'basketball_wnba',
        'MLS': 'soccer_usa_mls',
        'EPL': 'soccer_epl',
    };

    const sportKey = sportKeys[sport];
    if (!sportKey) return res.status(400).json({ error: 'Sport not supported' });

    try {
        const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads&oddsFormat=american&bookmakers=draftkings,fanduel`;
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) throw new Error(data.message || 'Failed to fetch odds');

        // Simplify
        const games = data.map(game => {
            const book = game.bookmakers[0]; // Take first book primarily
            if (!book) return null;

            // H2H
            const h2hMarket = book.markets.find(m => m.key === 'h2h');
            let homeMoney = 'N/A', awayMoney = 'N/A';
            if (h2hMarket) {
                const h = h2hMarket.outcomes.find(o => o.name === game.home_team);
                const a = h2hMarket.outcomes.find(o => o.name === game.away_team);
                homeMoney = h ? (h.price > 0 ? `+${h.price}` : h.price) : 'N/A';
                awayMoney = a ? (a.price > 0 ? `+${a.price}` : a.price) : 'N/A';
            }

            // Spread
            const spreadMarket = book.markets.find(m => m.key === 'spreads');
            let homeSpread = 'N/A', awaySpread = 'N/A';
            if (spreadMarket) {
                const h = spreadMarket.outcomes.find(o => o.name === game.home_team);
                const a = spreadMarket.outcomes.find(o => o.name === game.away_team);
                // Format: -4.5 (-110)
                homeSpread = h ? `${h.point > 0 ? '+' : ''}${h.point} (${h.price})` : 'N/A';
                awaySpread = a ? `${a.point > 0 ? '+' : ''}${a.point} (${a.price})` : 'N/A';
            }

            return {
                id: game.id,
                time: game.commence_time,
                matchup: `${game.away_team} @ ${game.home_team}`,
                home_team: game.home_team,
                away_team: game.away_team,
                home_money: homeMoney,
                away_money: awayMoney,
                home_spread: homeSpread,
                away_spread: awaySpread
            };
        }).filter(g => g !== null);

        // Update Cache
        oddsCache[sport] = { timestamp: now, data: games };

        res.json({ source: 'live', data: games });

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

// ADMIN: Test Email
app.post('/api/admin/test-email', authenticateToken, requireAdmin, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
        console.log(`Sending test email to ${email}...`);
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: 'System Test // Viva Picks',
            html: `
                <div style="font-family: sans-serif; padding: 20px; background: #f4f4f4;">
                    <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h2 style="color: #22c55e; margin-top: 0;">✔ SYSTEM CHECK PASSED</h2>
                        <p>This is a verification email from the Viva Picks backend.</p>
                        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                        <p><strong>Relay:</strong> ${process.env.SMTP_HOST}</p>
                    </div>
                </div>
            `
        });
        res.json({ message: 'Test email sent successfully' });
    } catch (err) {
        console.error('Test email failed:', err);
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

// --- SAVED ODDS SNAPSHOTS ---
app.post('/api/saved-lines', authenticateToken, async (req, res) => {
    try {
        const { sport, data, name } = req.body;
        const userId = req.user.id;
        const result = await pool.query(
            'INSERT INTO saved_odds (user_id, sport, data, name) VALUES ($1, $2, $3, $4) RETURNING *',
            [userId, sport, JSON.stringify(data), name || `Snapshot ${new Date().toLocaleTimeString()}`]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save snapshot' });
    }
});

app.get('/api/saved-lines', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            'SELECT id, sport, name, created_at, data FROM saved_odds WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch saved lines' });
    }
});

app.delete('/api/saved-lines/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM saved_odds WHERE id = $1', [id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
