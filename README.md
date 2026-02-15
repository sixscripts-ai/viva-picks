# ⚡ Viva Picks | Sports Betting Analytics Platform

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen?style=for-the-badge)](https://vivapicks.tech/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

**Viva Picks** is a high-performance sports analytics platform designed for serious bettors. It aggregates real-time odds, offers "War Room" insights, and provides automated signals to users.

---

### 📸 Interface
![Viva Picks Dashboard](VivaPicks_Landing.png)

### 🏗️ Architecture
- **Frontend:** Mobile-First React.js (Hosted on Vercel)
- **Backend:** Scalable Node.js/Express Microservices (Hosted on Render)
- **Database:** Distributed SQLite via Turso for sub-second query performance.
- **Data:** Integrated Odds API for real-time market updates.

### 🚀 Key Features
- **Real-Time Dynamic Ticker:** Instant odds updates across all dashboards.
- **"War Room" Analytics:** Proprietary algorithm for tracking bet performance.
- **Automated Alerts:** Node.js-based email triggers for new signals.
- **Secure Auth:** JWT & Bcrypt authentication system.

---

### 💻 Local Setup
\`\`\`bash
# Clone the repository
git clone https://github.com/sixscripts-ai/viva-picks.git

# Install dependencies (Frontend)
cd frontend && npm install

# Install dependencies (Backend)
cd ../backend && npm install

# Run dev server
npm run dev
\`\`\`
