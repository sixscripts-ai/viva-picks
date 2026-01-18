document.addEventListener('DOMContentLoaded', () => {
    // Scroll Animation Observer
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Targets to animate
    const animateTargets = document.querySelectorAll('.glass-panel, .card-grid > div, .stat-card, h2');

    // Add base class for animation
    animateTargets.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        observer.observe(el);
    });

    const style = document.createElement('style');
    style.innerHTML = `
        .visible {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);

    // Navbar scroll effect
    const nav = document.querySelector('nav');
    if (nav) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                nav.style.background = 'rgba(10, 10, 15, 0.95)';
                nav.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.5)';
            } else {
                nav.style.background = 'rgba(10, 10, 15, 0.8)';
                nav.style.boxShadow = 'none';
            }
        });
    }

    // Dashboard & Global Auth Logic
    const picksContainer = document.getElementById('picks-container');

    // Auth Check for Protected Pages
    const protectedPages = ['dashboard', 'warroom', 'admin', 'account'];
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

            // Admin Page Protection & Link Visibility
            const adminLink = document.getElementById('admin-link');
            if (user.role === 'admin') {
                if (adminLink) adminLink.style.display = 'block';
            } else {
                if (window.location.pathname.includes('admin')) {
                    window.location.href = 'dashboard';
                }
            }

            // Dashboard / War Room Specifics
            if (window.location.pathname.includes('dashboard') || window.location.pathname.includes('warroom')) {
                const navUser = document.querySelector('.nav-links span');
                if (navUser) navUser.textContent = `Welcome, ${user.role === 'admin' ? 'Admin' : 'Member'}`;

                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('subscription') === 'success') {
                    showSuccessBanner();
                    window.history.replaceState({}, document.title, window.location.pathname);
                }

                if (user.role !== 'admin' && user.subscriptionStatus !== 'active') {
                    showSubscriptionOverlay();
                } else {
                    fetchPicks();
                }
            }

            // Account Specifics
            if (window.location.pathname.includes('account')) {
                renderAccountData(user);
            }

            // Admin Specifics
            if (window.location.pathname.includes('admin')) {
                fetchAdminStats();
                fetchPicksHistory();
            }

        } catch (err) {
            console.error('Auth Check Failed', err);
        }
    }

    function showSuccessBanner() {
        const banner = document.createElement('div');
        banner.style.cssText = `
            background: var(--accent);
            color: #000;
            text-align: center;
            padding: 1rem;
            font-weight: 600;
            margin-bottom: 2rem;
            border-radius: 12px;
            animation: fadeIn 0.5s ease;
        `;
        banner.innerHTML = '🎉 Subscription Activated! Welcome to the Inner Circle.';
        document.querySelector('.main-content').prepend(banner);
    }

    function showSubscriptionOverlay() {
        if (!picksContainer) return;
        picksContainer.innerHTML = `
            <div class="glass-panel" style="grid-column: 1/-1; text-align: center; padding: 3rem; border: 1px solid var(--primary);">
                <h2 style="margin-bottom: 1rem;">Subscription Required</h2>
                <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Unlock the full power of our AI models and daily picks.</p>
                <div style="margin-bottom: 2rem; max-width: 400px; margin-left: auto; margin-right: auto;">
                    <label style="display: flex; align-items: flex-start; gap: 0.5rem; cursor: pointer; font-size: 0.8rem; color: var(--text-muted); text-align: left;">
                        <input type="checkbox" id="dash-checkout-opt-in" required style="margin-top: 0.2rem;">
                        <span>I understand this is a recurring subscription. I agree to receive emails and accept the <a href="privacy.html" target="_blank" style="color: var(--primary);">Privacy Policy</a> and <a href="terms.html" target="_blank" style="color: var(--primary);">Terms</a>.</span>
                    </label>
                </div>
                <button id="sub-checkout-btn" class="btn btn-primary">Subscribe for $29.99/mo</button>
            </div>
        `;
        document.getElementById('sub-checkout-btn').addEventListener('click', () => {
            const optIn = document.getElementById('dash-checkout-opt-in');
            if (!optIn.checked) {
                alert('Please agree to the Terms and Privacy Policy to proceed.');
                return;
            }
            startCheckout();
        });
    }

    async function startCheckout() {
        try {
            const res = await fetch('/api/create-checkout-session', { method: 'POST' });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
        } catch (e) {
            alert('Checkout failed');
        }
    }

    async function fetchPicks() {
        console.log("/// INITIALIZING SIGNAL FEED FETCH...");
        if (!picksContainer) return;
        try {
            const res = await fetch('/api/picks');
            if (res.status === 403) {
                showSubscriptionOverlay();
                return;
            }
            const picks = await res.json();
            window.allPicks = picks; // Save global for filtering

            // Render Cards (default ALL)
            renderCards(picks);

            // Render Chart (if on dashboard)
            renderChart(picks);

            if (picks.length > 0) {
                const latest = picks[0];
                const tickerItem = document.querySelector('.ticker-item:nth-child(2) span');
                if (tickerItem && latest) {
                    tickerItem.textContent = `${latest.sport} // ${latest.matchup} [${latest.result || 'PENDING'}]`;
                }

                // Update general ticker stats
                const profitItem = document.querySelector('.ticker-item:nth-child(3) span');
                const settled = picks.filter(p => p.result && p.result !== 'PENDING');
                let totalUnits = 0;

                settled.forEach(p => {
                    let u = parseFloat(p.units) || 1;
                    if (typeof p.units === 'string' && p.units.includes('u')) u = parseFloat(p.units.replace('u', ''));

                    const o = parseFloat(p.odds);
                    let profit = 0;

                    let multiplier = 0;
                    if (!isNaN(o)) {
                        if (o > 0) multiplier = o / 100;
                        else multiplier = 100 / Math.abs(o);
                    } else { multiplier = 0.91; }

                    if (p.result === 'WIN') profit = u * multiplier;
                    else if (p.result === 'LOSS') profit = -u;
                    totalUnits += profit;
                });

                if (profitItem) profitItem.textContent = (totalUnits >= 0 ? '+' : '') + totalUnits.toFixed(1) + ' UNITS';

                // Update War Room specific stats
                if (document.getElementById('war-active')) {
                    document.getElementById('war-active').textContent = picks.filter(p => !p.result || p.result === 'PENDING').length;
                    document.getElementById('war-profit').textContent = (totalUnits >= 0 ? '+' : '') + totalUnits.toFixed(1) + 'u';
                }
            }
        } catch (error) {
            console.error('Error fetching picks:', error);
        }
    }

    // Admin List Rendering
    async function fetchAdminStats() {
        const tbody = document.getElementById('users-table');
        if (!tbody) return;

        try {
            const res = await fetch('/api/admin/users');
            if (!res.ok) return;

            const users = await res.json();

            // Stats Update
            const activeCount = users.filter(u => u.subscription_status === 'active' && u.role !== 'admin').length;
            if (document.getElementById('stat-total-users')) document.getElementById('stat-total-users').textContent = users.length;
            if (document.getElementById('stat-active-subs')) document.getElementById('stat-active-subs').textContent = activeCount;
            if (document.getElementById('stat-revenue')) document.getElementById('stat-revenue').textContent = '$' + (activeCount * 29.99).toFixed(2);

            tbody.innerHTML = '';

            // Add Actions Header if missing
            const thead = tbody.closest('table').querySelector('thead tr');
            if (thead && thead.children.length === 4) {
                const th = document.createElement('th');
                th.textContent = 'ACTIONS';
                thead.appendChild(th);
            }

            users.forEach(user => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--border)';
                const isSubbed = user.subscription_status === 'active';
                const isAdmin = user.role === 'admin';

                tr.innerHTML = `
                    <td style="padding: 1rem;">${user.email}</td>
                    <td style="padding: 1rem;">${user.role.toUpperCase()}</td>
                    <td style="padding: 1rem; color: ${isSubbed ? 'var(--accent)' : '#ff5252'}; font-weight: bold;">
                        ${user.subscription_status.toUpperCase()}
                    </td>
                    <td style="padding: 1rem;">${new Date(user.created_at).toLocaleDateString()}</td>
                    <td style="padding: 1rem;">
                        ${!isAdmin ? `
                        <button onclick="toggleSub(${user.id}, '${user.subscription_status}')" class="btn-action ${isSubbed ? 'revoke' : 'grant'}">
                            ${isSubbed ? 'REVOKE' : 'GRANT'}
                        </button>
                        <button onclick="deleteUser(${user.id})" class="btn-action delete">DEL</button>
                        ` : '<span style="color:#444">SYSTEM</span>'}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) { console.error(err); }
    }

    // Admin Signal History Fetch
    async function fetchPicksHistory() {
        const tbody = document.getElementById('picks-history-table');
        if (!tbody) return;

        try {
            const res = await fetch('/api/picks');
            const picks = await res.json();
            tbody.innerHTML = '';

            picks.forEach(pick => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--border)';
                const hasResult = pick.result;

                tr.innerHTML = `
                    <td style="padding: 1rem;">${pick.matchup}</td>
                    <td style="padding: 1rem;">${pick.pick} (${pick.odds})</td>
                    <td style="padding: 1rem;">${pick.bet_type || 'N/A'} // ${pick.units || '1u'}</td>
                    <td style="padding: 1rem;">
                        ${!hasResult ? `
                        <div style="display: flex; gap: 5px; margin-bottom: 5px;">
                            <button onclick='setResult(${pick.id}, "WIN")' class="btn-action grant" style="font-size: 10px; padding: 4px 8px;">WIN</button>
                            <button onclick='setResult(${pick.id}, "LOSS")' class="btn-action delete" style="font-size: 10px; padding: 4px 8px;">LOSS</button>
                            <button onclick='setResult(${pick.id}, "PUSH")' class="btn-action" style="font-size: 10px; padding: 4px 8px; background: #666; color: white;">PUSH</button>
                        </div>
                        ` : `<span class="status-pill status-${pick.result.toLowerCase()}" style="display:inline-block; margin-bottom: 5px;">${pick.result}</span>`}
                        
                        <div>
                            <button onclick='editPick(${JSON.stringify(pick)})' class="btn-action" style="background:#444; color:white; margin-right:5px; padding: 4px 8px; font-size: 10px;">EDIT</button>
                            <button onclick="deletePick(${pick.id})" class="btn-action delete" style="padding: 4px 8px; font-size: 10px;">DEL</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) { console.error(err); }
    }

    // Admin Pick Submission & Update
    const adminForm = document.querySelector('form');
    if (adminForm) {
        adminForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.activeElement.id === 'update-btn' ? document.getElementById('update-btn') : document.getElementById('publish-btn');
            const editingId = document.getElementById('editing-pick-id').value;

            btn.disabled = true;
            btn.textContent = editingId ? 'UPDATING...' : 'PUBLISHING...';

            const formData = {
                sport: adminForm.querySelector('select').value,
                time: adminForm.querySelector('input[type="datetime-local"]').value,
                matchup: document.getElementById('matchup-input').value,
                pick: document.getElementById('pick-input').value,
                odds: document.getElementById('odds-input').value,
                bet_type: document.getElementById('bet-type').value,
                units: document.getElementById('units-select').value,
                analysis: document.getElementById('analysis-input').value,
                result: document.getElementById('result-select') ? document.getElementById('result-select').value : null,
                notify: document.getElementById('notify-check') ? document.getElementById('notify-check').checked : true
            };

            try {
                const url = editingId ? `/api/picks/${editingId}` : '/api/picks';
                const method = editingId ? 'PUT' : 'POST';

                const res = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });

                if (res.ok) {
                    alert(editingId ? 'Pick Updated.' : 'Pick Published & Emails Sent.');
                    resetAdminForm();
                    fetchPicksHistory();
                } else {
                    alert('Action failed.');
                }
            } catch (err) { alert(err.message); }
            finally {
                btn.disabled = false;
                btn.textContent = editingId ? '💾 UPDATE EXISTING PICK' : '🚀 PUBLISH PICK & EMAIL SUBSCRIBERS';
            }
        };

        // Handling secondary update button click if it exists
        const updateBtn = document.getElementById('update-btn');
        if (updateBtn) {
            updateBtn.onclick = () => {
                adminForm.dispatchEvent(new Event('submit'));
            };
        }
    }

    function resetAdminForm() {
        adminForm.reset();
        document.getElementById('editing-pick-id').value = '';
        document.getElementById('editing-pick-result').value = '';
        if (document.getElementById('result-group')) document.getElementById('result-group').style.display = 'none';
        if (document.getElementById('result-select')) document.getElementById('result-select').value = '';
        if (document.getElementById('notify-check')) document.getElementById('notify-check').checked = true;

        document.getElementById('publish-btn').style.display = 'block';
        document.getElementById('update-btn').style.display = 'none';
    }

    // Account Page Rendering
    function renderAccountData(user) {
        const emailEl = document.getElementById('profile-email');
        if (!emailEl) return;

        emailEl.textContent = user.email;
        document.getElementById('profile-role').textContent = user.role.toUpperCase();
        document.getElementById('profile-joined').textContent = new Date(user.created_at).toLocaleDateString();

        const statusEl = document.getElementById('profile-sub-status');
        const indicatorEl = document.getElementById('sub-status-indicator');
        const manageBtn = document.getElementById('manage-billing-btn');
        const subBtn = document.getElementById('account-subscribe-btn');

        if (user.subscriptionStatus === 'active') {
            statusEl.textContent = 'ACTIVE';
            statusEl.style.color = 'var(--accent)';
            indicatorEl.style.background = 'var(--accent)';
            manageBtn.style.display = 'block';
            subBtn.style.display = 'none';
        } else {
            statusEl.textContent = 'INACTIVE';
            statusEl.style.color = '#ff5252';
            indicatorEl.style.background = '#ff5252';
            manageBtn.style.display = 'none';
            subBtn.style.display = 'block';
        }

        if (manageBtn) {
            manageBtn.onclick = async () => {
                manageBtn.innerText = 'ACCESSING...';
                try {
                    const res = await fetch('/api/create-portal-session', { method: 'POST' });
                    const data = await res.json();
                    if (data.url) window.location.href = data.url;
                } catch (e) { alert('Error accessing portal'); }
                finally { manageBtn.innerText = 'ACCESS BILLING PORTAL'; }
            };
        }
        if (subBtn) subBtn.addEventListener('click', startCheckout);

        const deleteBtn = document.getElementById('delete-account-btn');
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                if (!confirm('CRITICAL: Are you sure you want to PERMANENTLY terminate your account?')) return;
                try {
                    const res = await fetch('/api/auth/me', { method: 'DELETE' });
                    if (res.ok) { window.location.href = '/'; }
                } catch (e) { alert('Connection error'); }
            };
        }
    }

    // Cookie Consent Logic
    const banner = document.createElement('div');
    banner.id = 'cookie-banner';
    banner.innerHTML = `
        <span>DATA CONSENT: We use cookies for intel optimization. <a href="privacy.html">DETAILS</a></span>
        <button id="accept-cookies-btn">ACCEPT</button>
    `;
    document.body.appendChild(banner);

    if (!localStorage.getItem("vp_cookie_consent")) {
        banner.style.display = 'flex';
        banner.style.alignItems = 'center';
        banner.style.justifyContent = 'space-between';
    }

    document.getElementById('accept-cookies-btn').onclick = () => {
        localStorage.setItem("vp_cookie_consent", "true");
        banner.style.display = 'none';
    };

    // Initialize Global UI Components
    loadPerformanceLedger();
    loadHeroStats();
});

// GLOBAL ACTIONS for Admin (Defined outside module)
function editPick(pick) {
    document.getElementById('editing-pick-id').value = pick.id;
    document.querySelector('form select').value = pick.sport;
    document.querySelector('input[type="datetime-local"]').value = pick.time || '';
    document.getElementById('matchup-input').value = pick.matchup;
    document.getElementById('pick-input').value = pick.pick;
    document.getElementById('odds-input').value = pick.odds;
    document.getElementById('bet-type').value = pick.bet_type || 'Moneyline';
    document.getElementById('units-select').value = pick.units || '1u';
    document.getElementById('analysis-input').value = pick.analysis;

    // Handle Result Grading UI
    if (document.getElementById('result-group')) {
        document.getElementById('result-group').style.display = 'block';
        document.getElementById('result-select').value = pick.result || '';
    }
    // Default notify to false when editing (to avoid accidental spam), but allow user to check it
    if (document.getElementById('notify-check')) document.getElementById('notify-check').checked = false;

    document.getElementById('publish-btn').style.display = 'none';
    document.getElementById('update-btn').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deletePick(pickId) {
    if (!confirm('Permanently delete this signal?')) return;
    try {
        const res = await fetch(`/api/picks/${pickId}`, { method: 'DELETE' });
        if (res.ok) window.location.reload();
    } catch (e) { alert(e.message); }
}

async function toggleSub(userId, currentStatus) {
    if (!confirm(`Change subscription status?`)) return;
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
        const res = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription_status: newStatus })
        });
        if (res.ok) window.location.reload();
    } catch (e) { alert(e.message); }
}

async function deleteUser(userId) {
    if (!confirm('Permanently delete this user?')) return;
    try {
        const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
        if (res.ok) window.location.reload();
    } catch (e) { alert(e.message); }
}

// EDGE CALCULATOR LOGIC
function calculateInitialPayout(amount, odds) {
    const numOdds = parseFloat(odds);
    if (isNaN(numOdds)) return "0.00";
    let multiplier = 0;
    if (numOdds > 0) {
        multiplier = (numOdds / 100) + 1;
    } else {
        multiplier = (100 / Math.abs(numOdds)) + 1;
    }
    return (amount * multiplier).toFixed(2);
}

function updatePayout(input, odds) {
    const amount = parseFloat(input.value) || 0;
    const resultSpan = input.parentElement.querySelector('.calc-result');
    resultSpan.textContent = '$' + calculateInitialPayout(amount, odds);
}

async function setResult(pickId, result) {
    if (!confirm(`Mark as ${result}?`)) return;
    try {
        // Fetch current pick data first to ensure we don't wipe other fields
        const picksRes = await fetch('/api/picks');
        const picks = await picksRes.json();
        const pick = picks.find(p => p.id === pickId);

        if (!pick) throw new Error("Pick not found");

        const res = await fetch(`/api/picks/${pickId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...pick, result })
        });

        if (res.ok) window.location.reload();
    } catch (e) { alert(e.message); }
}

async function loadPerformanceLedger() {
    const tbody = document.getElementById('performance-ledger-body');
    if (!tbody) return;

    try {
        const res = await fetch('/api/picks');
        const picks = await res.json();
        const settled = picks.filter(p => p.result);

        let totalUnits = 0;
        let winCount = 0;
        let pushCount = 0;
        let lossCount = 0;
        let totalOdds = 0;

        tbody.innerHTML = '';
        settled.forEach(pick => {
            const units = parseFloat(pick.units) || 0;
            const odds = parseFloat(pick.odds);
            let profit = 0;

            if (pick.result === 'WIN') {
                winCount++;
                if (odds > 0) {
                    profit = units * (odds / 100);
                } else {
                    profit = units * (100 / Math.abs(odds));
                }
            } else if (pick.result === 'LOSS') {
                lossCount++;
                profit = -units;
            } else {
                pushCount++;
            }

            totalUnits += profit;
            totalOdds += (odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1);

            const dateStr = new Date(pick.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color: var(--text-muted);">${dateStr}</td>
                <td>
                    <div style="font-weight: 700; color: white;">${pick.matchup}</div>
                    <div style="color: var(--text-muted); font-size: 0.8rem;">Pick: ${pick.pick}</div>
                </td>
                <td><span class="bet-type-tag">${pick.bet_type || 'INTEL'}</span></td>
                <td>${pick.odds > 0 ? '+' + pick.odds : pick.odds}</td>
                <td><span class="status-pill status-${pick.result.toLowerCase()}">${pick.result}</span></td>
            `;
            tbody.appendChild(tr);
        });

        // Update Stats
        const totalGames = winCount + lossCount + pushCount;
        const winRate = totalGames > 0 ? ((winCount / (winCount + lossCount)) * 100).toFixed(1) : 0;
        const avgOdds = totalGames > 0 ? (totalOdds / totalGames).toFixed(2) : '0.00';

        document.getElementById('stat-profit').textContent = (totalUnits > 0 ? '+' : '') + totalUnits.toFixed(1) + 'u';
        document.getElementById('stat-winrate').textContent = winRate + '%';
        document.getElementById('stat-avgodds').textContent = avgOdds;
        document.getElementById('stat-total').textContent = totalGames;

    } catch (e) {
        console.error("Ledger error:", e);
    }
}

async function loadHeroStats() {
    const activeEl = document.getElementById('hero-active');
    if (!activeEl) return;

    try {
        const res = await fetch('/api/picks');
        const picks = await res.json();

        const active = picks.filter(p => !p.result).length;
        const settled = picks.filter(p => p.result);

        // Calculate Profit & Winrate
        let totalUnits = 0;
        let winCount = 0;
        let lossCount = 0;

        settled.forEach(p => {
            const units = parseFloat(p.units) || 0;
            const odds = parseFloat(p.odds);
            if (p.result === 'WIN') {
                winCount++;
                totalUnits += (odds > 0) ? (units * odds / 100) : (units * 100 / Math.abs(odds));
            } else if (p.result === 'LOSS') {
                lossCount++;
                totalUnits -= units;
            }
        });

        const winrate = (winCount + lossCount > 0) ? ((winCount / (winCount + lossCount)) * 100).toFixed(0) : 0;

        activeEl.textContent = active;
        document.getElementById('hero-winrate').textContent = winrate + '%';
        document.getElementById('hero-profit').textContent = (totalUnits >= 0 ? '+' : '') + totalUnits.toFixed(1) + ' UNITS';
    } catch (e) {
        console.error("Hero stats error:", e);
    }
}

async function testEmailRelay() {
    const email = document.getElementById('test-email-input').value;
    const status = document.getElementById('test-email-status');
    const btn = document.querySelector('button[onclick="testEmailRelay()"]');

    if (!email) {
        alert('Please enter an email address');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'SENDING...';
    status.textContent = 'Processing request...';
    status.style.color = 'var(--text-muted)';

    try {
        const res = await fetch('/api/admin/test-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await res.json();

        if (res.ok) {
            status.textContent = '✔ Email Sent Successfully';
            status.style.color = '#4ade80'; // Green
            alert(`SUCCESS: Email sent to ${email}. Check your inbox (and spam folder).`);
        } else {
            status.textContent = '✖ Failed: ' + data.error;
            status.style.color = '#ff5252'; // Red
            console.error(data);
        }
    } catch (err) {
        status.textContent = '✖ Network Error';
        status.style.color = '#ff5252';
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Test Email Relay';
    }
}

// --- DASHBOARD FEATURES ---
// Filter Logic
function filterPicks(sport) {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(b => {
        if (b.textContent === sport) b.classList.add('active');
        else b.classList.remove('active');
        // Handle "ALL" styling specially?
        if (sport === 'ALL' && b.textContent === 'ALL') b.classList.add('active');
    });

    if (!window.allPicks) return;

    if (sport === 'ALL') {
        renderCards(window.allPicks);
    } else {
        const filtered = window.allPicks.filter(p => p.sport === sport);
        renderCards(filtered);
    }
}

// Chart Logic
function renderChart(picks) {
    const ctx = document.getElementById('profitChart');
    if (!ctx) return;

    // Destroy previous instance if exists to avoid overlay
    const existingChart = Chart.getChart("profitChart");
    if (existingChart) existingChart.destroy();

    const settled = picks.filter(p => p.result && p.result !== 'PENDING').reverse(); // Oldest first

    let cumulative = 0;
    const dataPoints = settled.map(p => {
        let u = parseFloat(p.units) || 1;
        // Normalize units text "1u" -> 1
        if (typeof p.units === 'string' && p.units.includes('u')) u = parseFloat(p.units.replace('u', ''));

        let profit = 0;
        let o = parseInt(p.odds);

        let multiplier = 0;
        if (!isNaN(o)) {
            if (o > 0) multiplier = o / 100;
            else multiplier = 100 / Math.abs(o);
        } else {
            multiplier = 0.91;
        }

        if (p.result === 'WIN') profit = u * multiplier;
        else if (p.result === 'LOSS') profit = -u;

        cumulative += profit;
        return cumulative;
    });

    const labels = settled.map(p => {
        const d = new Date(p.time);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    });

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Profit (Units)',
                data: dataPoints,
                borderColor: '#00f3ff',
                backgroundColor: 'rgba(0, 243, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 1,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            return 'Profit: ' + context.parsed.y.toFixed(2) + 'u';
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#888' }
                },
                x: {
                    display: false,
                    grid: { display: false }
                }
            }
        }
    });
}

// Render Cards Logic (Extracted)
function renderCards(picks) {
    const container = document.getElementById('picks-container');
    if (!container) return;

    if (picks.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">No signals found for this filter.</div>';
        return;
    }

    container.innerHTML = '';
    picks.forEach((pick, index) => {
        const card = document.createElement('div');
        card.className = 'pick-card glass-panel visible';

        // CSS Animation Delay
        card.style.animationDelay = `${index * 0.05}s`;

        // Status Color Logic
        let statusColor = '#888';
        if (pick.result === 'WIN') statusColor = '#4ade80';
        if (pick.result === 'LOSS') statusColor = '#ef4444';

        card.innerHTML = `
            <div class="pick-header">
                <span class="sport-tag">${pick.sport || 'General'}</span>
                <span style="color: var(--text-muted); font-size: 0.9rem;">${new Date(pick.time).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="matchup">${pick.matchup}</div>
            <div class="pick-details">
                <div class="pick-detail-item">
                    <span class="label">Pick</span>
                    <span class="value">${pick.pick}</span>
                </div>
                <div class="pick-detail-item">
                    <span class="label">Odds</span>
                    <span class="value">${pick.odds}</span>
                </div>
                <div class="pick-detail-item">
                    <span class="label">Units</span>
                    <span class="value" style="color: var(--primary);">${pick.units || '1u'}</span>
                </div>
            </div>
            
             ${pick.result ? `
            <div style="margin-top: 10px; border: 1px solid ${statusColor}; color: ${statusColor}; text-align: center; border-radius: 4px; padding: 5px; font-weight: bold; font-family: var(--font-mono);">
                ${pick.result}
            </div>` : ''}

            ${pick.analysis ? `
            <div style="grid-column: 1 / -1; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); font-size: 0.9rem; color: var(--text-muted); line-height: 1.6;">
                <strong style="color:white; display:block; margin-bottom: 0.5rem;">REPORT // ${pick.bet_type || 'INTEL'}</strong>
                ${pick.analysis}
            </div>` : ''}
            
            ${window.location.pathname.includes('warroom') && !pick.result ? `
            <div class="pick-calc" style="grid-column: 1 / -1; border-top: 1px solid #333; margin-top: 10px; padding-top: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.7rem; color: var(--text-muted); font-family: var(--font-mono);">EDGE CALCULATOR</span>
                    <div style="font-size: 0.8rem;">
                        BET $<input type="number" value="100" class="calc-input" style="width: 50px; background: #222; border: 1px solid #444; color: white; padding: 2px;" oninput="updatePayout(this, '${pick.odds}')">
                        → EST: <span class="calc-result" style="color: var(--accent);">$${calculateInitialPayout(100, pick.odds)}</span>
                    </div>
                </div>
            </div>` : ''}
        `;
        container.appendChild(card);
        // Force reflow for animation
        setTimeout(() => { card.style.opacity = '1'; card.style.transform = 'translateY(0)'; }, index * 50);
    });
}

// --- ADMIN AUTO-FILL ODDS ---
const getLinesBtn = document.getElementById('get-lines-btn');
if (getLinesBtn) {
    getLinesBtn.onclick = async () => {
        const sport = document.getElementById('sport-select').value;
        const btn = getLinesBtn;

        btn.disabled = true;
        btn.textContent = 'Fetching...';

        try {
            const res = await fetch(`/api/admin/odds/${sport}`);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to fetch');

            if (data.length === 0) {
                alert('No lines found for ' + sport + ' today.');
                return;
            }

            // Create Modal
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; display:flex; justify-content:center; align-items:center;';

            const modal = document.createElement('div');
            modal.style.cssText = 'background:#1a1a1a; padding:20px; border:1px solid #333; max-width:500px; width:90%; max-height:80vh; overflow-y:auto; border-radius:8px;';

            modal.innerHTML = '<h3 style="margin-top:0; color:#fff;">Select Game</h3><p style="color:#888; font-size:12px;">Click to auto-fill form</p>';

            data.forEach(game => {
                const item = document.createElement('div');
                item.style.cssText = 'padding:10px; border-bottom:1px solid #333; cursor:pointer; color:#eee;';
                item.innerHTML = `
                    <div style="font-weight:bold;">${game.matchup}</div>
                    <div style="font-size:12px; color:#888;">${new Date(game.time).toLocaleString()}</div>
                    <div style="font-size:12px; color:#f97316;">${game.home_team}: ${game.home_odds} | ${game.away_team}: ${game.away_odds}</div>
                `;

                item.onmouseover = () => item.style.backgroundColor = '#333';
                item.onmouseout = () => item.style.backgroundColor = 'transparent';

                item.onclick = () => {
                    // Auto-Fill
                    const timeInput = document.querySelector('input[type="datetime-local"]');
                    // Format time for datetime-local input (YYYY-MM-DDTHH:mm)
                    const date = new Date(game.time);
                    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
                    timeInput.value = date.toISOString().slice(0, 16);

                    document.getElementById('matchup-input').value = game.matchup;

                    // Ask which side (Simple confirm/prompt)
                    // Defaults to Pick Input asking user to type, but let's pre-fill odds if possible.
                    // Actually, just fill the odds input with "See Analysis" or let user pick.
                    // Let's just fill Matchup and Time. Odds varies by pick side.
                    // BUT user wants odds logic.
                    // Let's prompt: "Pick Home or Away?"

                    // For now, simple fill
                    alert('Time and Matchup filled! Please type the specific pick and odds manually based on the lines shown.');

                    document.body.removeChild(overlay);
                };
                modal.appendChild(item);
            });

            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.style.cssText = 'margin-top:10px; padding:5px 10px; background:#444; color:white; border:none; width:100%; cursor:pointer;';
            closeBtn.onclick = () => document.body.removeChild(overlay);
            modal.appendChild(closeBtn);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

        } catch (err) {
            alert(err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Get Lines';
        }
    };
}

// --- CALCULATORS LOGIC ---

// Parlay Calculator
function addParlayLeg() {
    const container = document.getElementById('parlay-legs');
    const div = document.createElement('div');
    div.className = 'parlay-leg';
    div.style.cssText = 'display:flex; margin-bottom:10px; position:relative;';
    div.innerHTML = `
        <input type="number" placeholder="-110" class="form-control parlay-input" style="background:#111; color:white; border:1px solid #333; padding:8px; width:100%;" oninput="calcParlay()">
        <button onclick="this.parentElement.remove(); calcParlay();" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; color:#555; cursor:pointer;">×</button>
    `;
    container.appendChild(div);
}

function resetParlay() {
    const container = document.getElementById('parlay-legs');
    container.innerHTML = `
        <div class="parlay-leg" style="display:flex; margin-bottom:10px;">
            <input type="number" placeholder="-110" class="form-control parlay-input" style="background:#111; color:white; border:1px solid #333; padding:8px;" oninput="calcParlay()">
        </div>
        <div class="parlay-leg" style="display:flex; margin-bottom:10px;">
            <input type="number" placeholder="-110" class="form-control parlay-input" style="background:#111; color:white; border:1px solid #333; padding:8px;" oninput="calcParlay()">
        </div>
    `;
    calcParlay();
}

function calcParlay() {
    const inputs = document.querySelectorAll('.parlay-input');
    const wagerInput = document.getElementById('parlay-wager');
    const oddsDisplay = document.getElementById('parlay-odds');
    const payoutDisplay = document.getElementById('parlay-payout');
    
    let totalDecimalObj = 1;
    let validLegs = 0;
    
    inputs.forEach(input => {
        const val = parseFloat(input.value);
        if (!isNaN(val) && val !== 0) {
            validLegs++;
            let decimal = 0;
            if (val > 0) decimal = (val / 100) + 1;
            else decimal = (100 / Math.abs(val)) + 1;
            totalDecimalObj *= decimal;
        }
    });

    if (validLegs === 0) {
        oddsDisplay.textContent = '-';
        payoutDisplay.textContent = '-';
        return;
    }

    // Convert Total Decimal back to American
    let totalAmerican = 0;
    if (totalDecimalObj >= 2) {
        totalAmerican = Math.round((totalDecimalObj - 1) * 100);
        totalAmerican = '+' + totalAmerican;
    } else {
        totalAmerican = Math.round(-100 / (totalDecimalObj - 1));
    }

    const wager = parseFloat(wagerInput.value) || 0;
    const payout = (wager * totalDecimalObj).toFixed(2);

    oddsDisplay.textContent = totalAmerican;
    payoutDisplay.textContent = '$' + payout;
}

// Odds Converter
function convertOdds(source) {
    const americanInput = document.getElementById('conv-american');
    const decimalInput = document.getElementById('conv-decimal');
    const probDisplay = document.getElementById('conv-prob');
    
    if (source === 'american') {
        const val = parseFloat(americanInput.value);
        if (isNaN(val) || val === 0) return;
        
        let decimal = 0;
        if (val > 0) decimal = (val / 100) + 1;
        else decimal = (100 / Math.abs(val)) + 1;
        
        decimalInput.value = decimal.toFixed(2);
        const prob = (1 / decimal) * 100;
        probDisplay.textContent = prob.toFixed(1) + '%';
        
    } else {
        const val = parseFloat(decimalInput.value);
        if (isNaN(val) || val <= 1) return;
        
        let american = 0;
        if (val >= 2) american = Math.round((val - 1) * 100);
        else american = Math.round(-100 / (val - 1));
        
        americanInput.value = american > 0 ? '+' + american : american;
        const prob = (1 / val) * 100;
        probDisplay.textContent = prob.toFixed(1) + '%';
    }
}
