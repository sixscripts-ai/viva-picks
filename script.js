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
    const protectedPages = ['dashboard.html', 'admin.html', 'account.html'];
    if (protectedPages.some(page => window.location.pathname.includes(page))) {
        checkAuth();
    }

    async function checkAuth() {
        try {
            const res = await fetch('/api/auth/me');
            if (res.status === 401 || res.status === 403) {
                window.location.href = 'login.html';
                return;
            }

            const user = await res.json();

            // Admin Page Protection & Link Visibility
            const adminLink = document.getElementById('admin-link');
            if (user.role === 'admin') {
                if (adminLink) adminLink.style.display = 'block';
            } else {
                if (window.location.pathname.includes('admin.html')) {
                    window.location.href = 'dashboard.html';
                }
            }

            // Dashboard Specifics
            if (window.location.pathname.includes('dashboard.html')) {
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
            if (window.location.pathname.includes('account.html')) {
                renderAccountData(user);
            }

            // Admin Specifics
            if (window.location.pathname.includes('admin.html')) {
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
                <p style="color: var(--text-muted); margin-bottom: 2rem;">Unlock the full power of our AI models and daily picks.</p>
                <button id="sub-checkout-btn" class="btn btn-primary">Subscribe for $29.99/mo</button>
            </div>
        `;
        document.getElementById('sub-checkout-btn').addEventListener('click', startCheckout);
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
        if (!picksContainer) return;
        try {
            const res = await fetch('/api/picks');
            if (res.status === 403) {
                showSubscriptionOverlay();
                return;
            }
            const picks = await res.json();

            if (picks.length === 0) {
                picksContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No picks available today.</div>';
                return;
            }

            picksContainer.innerHTML = '';
            picks.forEach((pick, index) => {
                const card = document.createElement('div');
                card.className = 'pick-card glass-panel visible';
                card.innerHTML = `
                    <div class="pick-header">
                        <span class="sport-tag">${pick.sport || 'General'}</span>
                        <span style="color: var(--text-muted); font-size: 0.9rem;">${pick.time || ''}</span>
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
                    ${pick.analysis ? `
                    <div style="grid-column: 1 / -1; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); font-size: 0.9rem; color: var(--text-muted); line-height: 1.6;">
                        <strong style="color:white; display:block; margin-bottom: 0.5rem;">REPORT // ${pick.bet_type || 'INTEL'}</strong>
                        ${pick.analysis}
                    </div>` : ''}
                `;
                setTimeout(() => {
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, index * 100);
                picksContainer.appendChild(card);
            });
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
                tr.innerHTML = `
                    <td style="padding: 1rem;">${pick.matchup}</td>
                    <td style="padding: 1rem;">${pick.pick} (${pick.odds})</td>
                    <td style="padding: 1rem;">${pick.bet_type || 'N/A'} // ${pick.units || '1u'}</td>
                    <td style="padding: 1rem;">
                        <button onclick='editPick(${JSON.stringify(pick)})' class="btn-action" style="background:#444; color:white; margin-right:5px;">EDIT</button>
                        <button onclick="deletePick(${pick.id})" class="btn-action delete">DEL</button>
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
                analysis: document.getElementById('analysis-input').value
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
                if (!confirm('CRITICAL: Are you sure you want to PERMANENTLY terminate your account? All data will be wiped and active subscriptions will be orphaned. This action is irreversible.')) return;

                try {
                    const res = await fetch('/api/auth/me', { method: 'DELETE' });
                    if (res.ok) {
                        alert('Account terminated. Terminating session...');
                        window.location.href = 'index.html';
                    } else {
                        alert('Termination failed.');
                    }
                } catch (e) { alert('Connection error'); }
            };
        }
    }
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
