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

    // Dashboard Logic
    const picksContainer = document.getElementById('picks-container');

    // Auth Check
    if (window.location.pathname.includes('dashboard.html') || window.location.pathname.includes('admin.html')) {
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

            // User Dashboard Logic
            if (window.location.pathname.includes('dashboard.html')) {
                const navUser = document.querySelector('.nav-links span');
                if (navUser) navUser.textContent = `Welcome, ${user.role === 'admin' ? 'Admin' : 'Member'}`;

                // Active Banner Check
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('subscription') === 'success') {
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

                    // Remove param from URL without refresh
                    window.history.replaceState({}, document.title, window.location.pathname);
                }

                if (user.role !== 'admin' && user.subscriptionStatus !== 'active') {
                    showSubscriptionOverlay();
                } else {
                    fetchPicks();
                }
            }

        } catch (err) {
            console.error('Auth Check Failed', err);
            // window.location.href = 'login.html'; // Optional: Redirect on error
        }
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

    // Index Page Logic
    const joinBtn = document.getElementById('join-btn');
    if (joinBtn) {
        joinBtn.addEventListener('click', () => {
            // Logic if needed for other buttons
        });
    }

    const subCheckoutBtn = document.getElementById('sub-checkout-btn');
    if (subCheckoutBtn) {
        subCheckoutBtn.addEventListener('click', async () => {
            // Check if user is logged in first
            const res = await fetch('/api/auth/me');
            if (res.status === 401 || res.status === 403) {
                window.location.href = 'signup.html'; // Redirect to signup if not logged in
            } else {
                startCheckout();
            }
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

            picksContainer.innerHTML = ''; // Clear loading state

            picks.forEach((pick, index) => {
                const card = document.createElement('div');
                card.className = 'pick-card glass-panel visible'; // Add visible class immediately
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
                            <span class="value" style="color: var(--primary);">${pick.units}</span>
                        </div>
                    </div>
                    ${pick.analysis ? `
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); font-size: 0.9rem; color: var(--text-muted);">
                        Analysis: ${pick.analysis}
                    </div>` : ''}
                `;

                // Add staggered animation delay
                setTimeout(() => {
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, index * 100);

                picksContainer.appendChild(card);
            });

        } catch (error) {
            console.error('Error fetching picks:', error);
            picksContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; color: #ff5252;">
                    Error loading picks. Please ensure the backend server is running.<br>
                    <small>npm start</small>
                </div>`;
        }
    }

    // Admin Form Logic
    const adminForm = document.querySelector('form');
    // Check if we are on the admin page
    if (document.getElementById('users-table')) {
        fetchAdminStats();
    }

    if (adminForm) {
        adminForm.onsubmit = async (e) => {
            e.preventDefault();

            const submitBtn = adminForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = 'Sending...';
            submitBtn.disabled = true;

            const formData = {
                sport: adminForm.querySelector('select').value,
                time: adminForm.querySelector('input[type="datetime-local"]').value,
                matchup: adminForm.querySelectorAll('input[type="text"]')[0].value,
                pick: adminForm.querySelectorAll('input[type="text"]')[1].value,
                odds: adminForm.querySelectorAll('input[type="text"]')[2].value,
                units: adminForm.querySelectorAll('select')[1].value,
                analysis: adminForm.querySelector('textarea').value
            };

            try {
                const res = await fetch('/api/picks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });

                if (res.ok) {
                    alert('Pick published successfully! Emails are being sent.');
                    adminForm.reset();
                } else {
                    const err = await res.json();
                    alert('Failed: ' + (err.error || 'Unknown error'));
                }
            } catch (err) {
                alert('Backend error: ' + err.message);
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        };
    }

    async function fetchAdminStats() {
        try {
            const res = await fetch('/api/admin/users');
            if (!res.ok) return;

            const users = await res.json();
            const tbody = document.getElementById('users-table');
            const statTotal = document.getElementById('stat-total-users');
            const statActive = document.getElementById('stat-active-subs');
            const statRevenue = document.getElementById('stat-revenue');

            // Update Stats
            const total = users.length;
            // Exclude admin from revenue calculation usually, but simplist count for now
            const active = users.filter(u => u.subscription_status === 'active' && u.role !== 'admin').length;
            const revenue = active * 29.99;

            statTotal.textContent = total;
            statActive.textContent = active;
            statRevenue.textContent = '$' + revenue.toFixed(2);

            // Render Table
            tbody.innerHTML = '';
            users.forEach(user => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--border)';
                tr.innerHTML = `
                    <td style="padding: 1rem;">${user.email}</td>
                    <td style="padding: 1rem;">${user.role}</td>
                    <td style="padding: 1rem; color: ${user.subscription_status === 'active' ? 'var(--accent)' : '#ff5252'};">${user.subscription_status}</td>
                    <td style="padding: 1rem;">${new Date(user.created_at).toLocaleDateString()}</td>
                `;
                tbody.appendChild(tr);
            });

        } catch (err) {
            console.error('Error fetching admin stats:', err);
        }
    }

    // Account Page Logic
    if (window.location.pathname.includes('account.html')) {
        loadAccountData();
    }

    async function loadAccountData() {
        try {
            const res = await fetch('/api/auth/me');
            if (!res.ok) return; // Should be handled by checkAuth

            const user = await res.json();

            // Populate Identity fields
            document.getElementById('profile-email').textContent = user.email;
            document.getElementById('profile-role').textContent = user.role.toUpperCase();
            document.getElementById('profile-joined').textContent = new Date(user.created_at).toLocaleDateString();

            // Status Logic
            const statusEl = document.getElementById('profile-sub-status');
            const indicatorEl = document.getElementById('sub-status-indicator');
            const manageBtn = document.getElementById('manage-billing-btn');
            const subBtn = document.getElementById('account-subscribe-btn');

            if (user.subscription_status === 'active') {
                statusEl.textContent = 'ACTIVE';
                statusEl.style.color = 'var(--accent)';
                indicatorEl.style.background = 'var(--accent)';
                indicatorEl.style.boxShadow = '0 0 10px var(--accent)';
                manageBtn.style.display = 'block';
                subBtn.style.display = 'none';
            } else {
                statusEl.textContent = 'INACTIVE';
                statusEl.style.color = '#ff5252';
                indicatorEl.style.background = '#ff5252';
                manageBtn.style.display = 'none'; // Can't manage if not subbed usually, or maybe show it to view past invoices? Left as none for now.
                subBtn.style.display = 'block';
            }

            // Wire Buttons
            if (manageBtn) {
                manageBtn.onclick = async () => {
                    manageBtn.innerText = 'ACCESSING...';
                    try {
                        const portalRes = await fetch('/api/create-portal-session', { method: 'POST' });
                        const data = await portalRes.json();
                        if (data.url) window.location.href = data.url;
                        else alert('Error accessing portal');
                    } catch (e) {
                        console.error(e);
                        alert('Connection error');
                    } finally {
                        manageBtn.innerText = 'ACCESS BILLING PORTAL';
                    }
                };
            }

            if (subBtn) {
                subBtn.addEventListener('click', startCheckout);
            }

        } catch (err) {
            console.error('Account load error', err);
        }
    }
});
