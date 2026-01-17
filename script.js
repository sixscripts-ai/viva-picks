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

            // Admin Page Protection
            if (window.location.pathname.includes('admin.html') && user.role !== 'admin') {
                window.location.href = 'dashboard.html';
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
                <button id="sub-checkout-btn" class="btn btn-primary">Subscribe for $49/mo</button>
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
    if (adminForm) {
        adminForm.onsubmit = async (e) => {
            e.preventDefault();
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
                    alert('Pick published successfully!');
                    adminForm.reset();
                } else {
                    alert('Failed to publish pick');
                }
            } catch (err) {
                alert('Backend error. Is server running?');
            }
        };
    }
});
