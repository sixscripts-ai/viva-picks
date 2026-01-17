const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

const seedPicks = [
    {
        sport: 'NBA',
        time: new Date().toISOString(),
        matchup: 'Celtics @ Heat',
        pick: 'Celtics -4.5',
        odds: '-110',
        units: '2.5',
        bet_type: 'Point Spread',
        analysis: 'Model shows Celtics covering in 68% of simulations. Heat currently missing key defensive pieces in the rotation.'
    },
    {
        sport: 'NFL',
        time: new Date().toISOString(),
        matchup: 'Chiefs @ Ravens',
        pick: 'Chiefs ML',
        odds: '-140',
        units: '3',
        bet_type: 'Moneyline',
        analysis: 'Post-season momentum favors Mahomes in road underdog situations. Defensive secondary has strong match against Ravens receiving core.'
    },
    {
        sport: 'NHL',
        time: new Date().toISOString(),
        matchup: 'Rangers @ Oilers',
        pick: 'Over 6.5',
        odds: '-115',
        units: '2',
        bet_type: 'Over/Under',
        analysis: 'High offensive output from both top lines. Goaltending metrics suggest a higher variance game than market predicts.'
    }
];

async function seed() {
    try {
        console.log('Seeding initial intel...');
        for (const p of seedPicks) {
            await pool.query(
                'INSERT INTO picks (sport, time, matchup, pick, odds, units, bet_type, analysis) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                [p.sport, p.time, p.matchup, p.pick, p.odds, p.units, p.bet_type, p.analysis]
            );
        }
        console.log('Database successfully synced with signal feed.');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seed();
