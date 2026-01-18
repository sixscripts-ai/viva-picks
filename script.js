/**
 * VIVA PICKS - CONSOLIDATED CLIENT ARCHITECTURE
 * Unified logic for Feed, War Room, Admin, and Account.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ---------------------------------------------------------
    // 1. CORE UI & ANIMATION
    // ---------------------------------------------------------
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.glass-panel, .card-grid > div, .stat-card, h2').forEach(el => {
        el.className += ' animate-ready';
        observer.observe(el);
    });

    const nav = document.querySelector('nav');
    if (nav) {
        window.addEventListener('scroll', () => {
            nav.style.background = window.scrollY > 50 ? 'rgba(10, 10, 15, 0.95)' : 'rgba(10, 10, 15, 0.8)';
            nav.style.boxShadow = window.scrollY > 50 ? '0 4px 30px rgba(0, 0, 0, 0.5)' : 'none';
        });
    }

    // ---------------------------------------------------------
    // 2. AUTHENTICATION & ACCESS CONTROL
    // ---------------------------------------------------------
    const protectedPages = ['dashboard', 'warroom', 'admin', 'account', 'linetracker'];
    if (protectedPages.some(page => window.location.pathname.includes(page))) {
        checkAuth();
    }

    async function checkAuth() {
        try {
            const res = await fetch('/api/auth/me');
            if (res.status === 401 || res.status === 403) {
                window.location.href = 'login';
                return;
            }
            const user = await res.json();

            // Admin Visibility
            const adminLink = document.getElementById('admin-link');
            if (user.role === 'admin' && adminLink) adminLink.style.display = 'block';
            if (user.role !== 'admin' && window.location.pathname.includes('admin')) window.location.href = 'dashboard';

            // User Welcome
            const navUser = document.querySelector('.nav-links span');
            if (navUser) navUser.textContent = `Welcome, ${user.role === 'admin' ? 'Admin' : 'Member'}`;

            // Page Specific Inits
            const path = window.location.pathname;
            if (path.includes('dashboard') || path.includes('warroom')) {
                if (user.role !== 'admin' && user.subscriptionStatus !== 'active') {
                    showSubscriptionOverlay();
                } else {
                    fetchPicks();
                }
            }
            if (path.includes('account')) renderAccountData(user);
            if (path.includes('admin')) { fetchAdminStats(); fetchPicksHistory(); }

        } catch (err) { console.error('Auth Check Failed', err); }
    }

    // ---------------------------------------------------------
    // 3. SIGNAL FEED & DATA RENDERING
    // ---------------------------------------------------------
    async function fetchPicks() {
        const picksContainer = document.getElementById('picks-container');
        if (!picksContainer) return;
        try {
            picksContainer.classList.add('loading-pulse');
            const res = await fetch('/api/picks');
            if (res.status === 403) return showSubscriptionOverlay();

            const picks = await res.json();
            window.allPicks = picks;
            picksContainer.classList.remove('loading-pulse');

            renderCards(picks);
            renderChart(picks);
            updateGlobalStats(picks);
        } catch (error) { console.error('Signal Error:', error); }
    }

    // Initialize Intelligence
    updateTicker();
    setInterval(updateTicker, 60000);
    loadHeroStats();
    loadPerformanceLedger();
});

// --- GLOBAL FUNCTIONS (Exposed for HTML attributes) ---

window.renderCards = (picks) => {
    const picksContainer = document.getElementById('picks-container');
    if (!picksContainer) return;
    if (picks.length === 0) {
        picksContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">No signals found in this sector.</div>';
        return;
    }

    picksContainer.innerHTML = picks.map(pick => {
        const isWin = pick.result === 'WIN';
        const isLoss = pick.result === 'LOSS';
        const statusColor = isWin ? 'var(--accent)' : (isLoss ? '#ff5252' : 'var(--primary)');

        return `
            <div class="pick-card" style="border-left-color: ${statusColor}; cursor:pointer;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                <div class="sport-tag">${pick.sport}</div>
                <div class="match-info">
                    <div class="matchup">${pick.matchup}</div>
                    <div style="color: var(--text-muted); font-size: 0.8rem; font-family: var(--font-mono);">
                        ${pick.bet_type || 'INTEL'} // ${new Date(pick.time).toLocaleString()}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div class="pick-data">${pick.pick} ${pick.odds}</div>
                    <div style="color: ${statusColor}; font-weight: 800; font-size: 0.7rem; font-family: var(--font-mono);">
                        ${pick.result || 'PENDING'} [${pick.units || '1u'}]
                    </div>
                </div>
            </div>
            <div class="analysis-box" style="display:none; padding: 1.5rem; background: #080808; border: 1px solid #222; margin-top: -1px; margin-bottom: 1rem; border-top: none; font-size: 0.85rem; line-height: 1.6;">
                <div style="color: var(--primary); font-family: var(--font-mono); font-size: 0.7rem; margin-bottom: 0.5rem;">/// TECH_ANALYSIS_BLOCK</div>
                ${pick.analysis || 'Confidential tactical intel. Access restricted to tier-1 members.'}
            </div>
        `;
    }).join('');
};

function filterPicks(sport) {
    document.querySelectorAll('.filter-chips .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === sport);
        if (btn.textContent === sport) {
            btn.style.background = 'var(--primary)';
            btn.style.color = 'black';
        } else {
            btn.style.background = '#222';
            btn.style.color = '#888';
        }
    });
    if (!window.allPicks) return;
    const filtered = sport === 'ALL' ? window.allPicks : window.allPicks.filter(p => p.sport === sport);
    renderCards(filtered);
}

function updateGlobalStats(picks) {
    const settled = picks.filter(p => p.result && p.result !== 'PENDING');
    let totalUnits = 0;
    let winCount = 0;
    let lossCount = 0;

    settled.forEach(p => {
        const u = parseFloat(p.units) || 1;
        const o = parseFloat(p.odds);
        let multiplier = (!isNaN(o)) ? (o > 0 ? o / 100 : 100 / Math.abs(o)) : 0.91;
        if (p.result === 'WIN') { winCount++; totalUnits += u * multiplier; }
        else if (p.result === 'LOSS') { lossCount++; totalUnits -= u; }
    });

    const profitStr = (totalUnits >= 0 ? '+' : '') + totalUnits.toFixed(1) + ' UNITS';
    const tickerProfit = document.querySelector('.ticker-item:nth-child(3) span');
    if (tickerProfit) tickerProfit.textContent = profitStr;

    // War Room Sync
    const wActive = document.getElementById('war-active');
    const wProfit = document.getElementById('war-profit');
    const wConfidence = document.getElementById('war-confidence');
    if (wActive) wActive.textContent = picks.filter(p => !p.result || p.result === 'PENDING').length;
    if (wProfit) {
        wProfit.textContent = (totalUnits >= 0 ? '+' : '') + totalUnits.toFixed(1) + 'u';
        wProfit.style.color = totalUnits >= 0 ? 'var(--accent)' : '#ff5252';
    }
    if (wConfidence) {
        const winrate = (winCount + lossCount > 0) ? (winCount / (winCount + lossCount) * 100) : 0;
        const conf = Math.min(99.4, 88.2 + (winrate / 10)).toFixed(1);
        wConfidence.textContent = conf + '%';
    }
}

async function updateTicker() {
    const ticker = document.getElementById('live-ticker');
    if (!ticker) return;
    try {
        const [nbaRes, ncaabRes] = await Promise.all([
            fetch('/api/public/lines/NBA'),
            fetch('/api/public/lines/NCAAB')
        ]);
        const nba = await nbaRes.json();
        const ncaab = await ncaabRes.json();
        let items = ['SYSTEM STATUS: <span>CONNECTED // OPTIMAL</span>', 'MARKET SENTIMENT: <span>BULLISH</span>'];
        if (nba.data) nba.data.slice(0, 3).forEach(g => items.push(`NBA: <span>${g.away_team} (${g.away_money}) @ ${g.home_team} (${g.home_money})</span>`));
        if (ncaab.data) ncaab.data.slice(0, 3).forEach(g => items.push(`NCAAB: <span>${g.away_team} (${g.away_spread}) @ ${g.home_team} (${g.home_spread})</span>`));
        ticker.innerHTML = items.map(i => `<div class="ticker-item">${i}</div>`).join('');
        ticker.style.animationDuration = `${Math.max(30, items.length * 5)}s`;
    } catch (e) { console.warn("Ticker offline."); }
}

function logout() {
    document.cookie = 'token=; Max-Age=0; path=/';
    window.location.href = '/';
}

// Stats & LEDGER
async function loadHeroStats() {
    const activeEl = document.getElementById('hero-active');
    if (!activeEl) return;
    try {
        const res = await fetch('/api/picks');
        const picks = await res.json();
        const settled = picks.filter(p => p.result);
        let totalUnits = 0, winCount = 0, lossCount = 0;
        settled.forEach(p => {
            const u = parseFloat(p.units) || 1, o = parseFloat(p.odds);
            if (p.result === 'WIN') { winCount++; totalUnits += (o > 0 ? u * o / 100 : u * 100 / Math.abs(o)); }
            else if (p.result === 'LOSS') { lossCount++; totalUnits -= u; }
        });
        activeEl.textContent = picks.filter(p => !p.result).length;
        if (document.getElementById('hero-winrate')) document.getElementById('hero-winrate').textContent = (winCount + lossCount > 0 ? (winCount / (winCount + lossCount) * 100).toFixed(0) : 0) + '%';
        if (document.getElementById('hero-profit')) document.getElementById('hero-profit').textContent = (totalUnits >= 0 ? '+' : '') + totalUnits.toFixed(1) + 'u';
    } catch (e) { }
}

async function loadPerformanceLedger() {
    const tbody = document.getElementById('performance-ledger-body');
    if (!tbody) return;
    try {
        const res = await fetch('/api/picks');
        const picks = await res.json();
        tbody.innerHTML = picks.filter(p => p.result).map(pick => `
            <tr>
                <td style="color: var(--text-muted);">${new Date(pick.created_at).toLocaleDateString()}</td>
                <td><div style="font-weight: 700;">${pick.matchup}</div><div style="color: var(--text-muted); font-size: 0.8rem;">${pick.pick}</div></td>
                <td><span class="bet-type-tag">${pick.bet_type || 'INTEL'}</span></td>
                <td>${pick.odds > 0 ? '+' + pick.odds : pick.odds}</td>
                <td><span class="status-pill status-${pick.result.toLowerCase()}">${pick.result}</span></td>
            </tr>
        `).join('');
    } catch (e) { }
}

// ADMIN OPS
async function fetchAdminStats() {
    const tbody = document.getElementById('users-table');
    if (!tbody) return;
    const res = await fetch('/api/admin/users');
    const users = await res.json();
    const active = users.filter(u => u.subscription_status === 'active' && u.role !== 'admin').length;
    if (document.getElementById('stat-total-users')) document.getElementById('stat-total-users').textContent = users.length;
    if (document.getElementById('stat-active-subs')) document.getElementById('stat-active-subs').textContent = active;
    if (document.getElementById('stat-revenue')) document.getElementById('stat-revenue').textContent = '$' + (active * 29.99).toFixed(2);
    tbody.innerHTML = users.map(user => `
        <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 1rem;">${user.email}</td>
            <td style="padding: 1rem; color: ${user.subscription_status === 'active' ? 'var(--accent)' : '#ff5252'};">${user.subscription_status.toUpperCase()}</td>
            <td style="padding: 1rem;">
                ${user.role !== 'admin' ? `
                    <button onclick="toggleSub(${user.id}, '${user.subscription_status}')" class="btn-action">SUBS</button>
                    <button onclick="deleteUser(${user.id})" class="btn-action delete">DEL</button>
                ` : 'SYSTEM'}
            </td>
        </tr>
    `).join('');
}

async function fetchPicksHistory() {
    const tbody = document.getElementById('picks-history-table');
    if (!tbody) return;
    const res = await fetch('/api/picks');
    const picks = await res.json();
    tbody.innerHTML = picks.map(pick => `
        <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 1rem;">${pick.matchup}</td>
            <td style="padding: 1rem;">
                ${!pick.result ? `
                    <button onclick='setResult(${pick.id}, "WIN")' class="btn-action grant">WIN</button>
                    <button onclick='setResult(${pick.id}, "LOSS")' class="btn-action delete">LOSS</button>
                ` : pick.result}
                <button onclick='editPick(${JSON.stringify(pick)})' class="btn-action">EDIT</button>
                <button onclick="deletePick(${pick.id})" class="btn-action delete">DEL</button>
            </td>
        </tr>
    `).join('');
}

async function setResult(id, result) {
    if (!confirm(`Mark ${result}?`)) return;
    const picks = await (await fetch('/api/picks')).json();
    const pick = picks.find(p => p.id === id);
    await fetch(`/api/picks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pick, result }) });
    window.location.reload();
}

async function toggleSub(id, status) {
    await fetch(`/api/admin/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription_status: status === 'active' ? 'inactive' : 'active' }) });
    window.location.reload();
}

async function deleteUser(id) { if (confirm('Delete?')) { await fetch(`/api/admin/users/${id}`, { method: 'DELETE' }); window.location.reload(); } }
async function deletePick(id) { if (confirm('Delete?')) { await fetch(`/api/picks/${id}`, { method: 'DELETE' }); window.location.reload(); } }

function renderAccountData(user) {
    const emailEl = document.getElementById('profile-email');
    if (!emailEl) return;
    emailEl.textContent = user.email;
    const isSub = user.subscriptionStatus === 'active';
    document.getElementById('profile-sub-status').textContent = isSub ? 'ACTIVE' : 'INACTIVE';
    document.getElementById('profile-sub-status').style.color = isSub ? 'var(--accent)' : '#ff5252';
    document.getElementById('manage-billing-btn').style.display = isSub ? 'block' : 'none';
    document.getElementById('account-subscribe-btn').style.display = isSub ? 'none' : 'block';
}

function editPick(pick) {
    document.getElementById('editing-pick-id').value = pick.id;
    document.getElementById('matchup-input').value = pick.matchup;
    document.getElementById('pick-input').value = pick.pick;
    document.getElementById('odds-input').value = pick.odds;
    document.getElementById('analysis-input').value = pick.analysis;
    document.getElementById('publish-btn').style.display = 'none';
    document.getElementById('update-btn').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showSubscriptionOverlay() {
    const container = document.getElementById('picks-container');
    if (!container) return;
    container.innerHTML = `<div class="glass-panel" style="text-align:center; padding:3rem; border:1px solid var(--primary);"><h2>Access Restricted</h2><p>Premium Intel requires an active membership.</p><button onclick="window.location.href='access'" class="btn btn-primary">UPGRADE NOW</button></div>`;
}

function renderChart(picks) {
    const ctx = document.getElementById('profitChart');
    if (!ctx) return;
    const existing = Chart.getChart("profitChart");
    if (existing) existing.destroy();
    const settled = picks.filter(p => p.result).reverse();
    let cum = 0;
    const data = settled.map(p => {
        const u = parseFloat(p.units) || 1, o = parseInt(p.odds);
        const mult = o > 0 ? o / 100 : 100 / Math.abs(o);
        cum += (p.result === 'WIN' ? u * mult : -u);
        return cum;
    });
    new Chart(ctx, { type: 'line', data: { labels: settled.map(p => new Date(p.time).toLocaleDateString()), datasets: [{ data, borderColor: '#f97316', fill: true, tension: 0.4 }] }, options: { plugins: { legend: { display: false } } } });
}
