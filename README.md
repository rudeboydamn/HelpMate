# HelpMate

> Modern project management & support platform with instant HTMX-powered UX

![HelpMate](https://img.shields.io/badge/HelpMate-v1.0.0-indigo)
![License](https://img.shields.io/badge/license-Proprietary-red)
![HTMX](https://img.shields.io/badge/HTMX-1.9.10-blue)

## Features

- 🚀 **Instant HTMX UX** - No page reloads, native app feel
- 📋 **Kanban Boards** - Drag-and-drop task management
- 🎫 **Issue Tracking** - Tasks, bugs, features, support tickets
- 👥 **Multi-Tenant** - Organizations with role-based access
- 💳 **Stripe Billing** - Free, Pro ($8/user/mo), White-label tiers
- 🔐 **Secure Auth** - Session-based authentication with bcrypt

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

## Demo Credentials

- **Email:** demo@helpmate.io
- **Password:** demo123

## Pricing Tiers

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0/month | 5 users, unlimited projects, kanban, issues |
| **Pro** | $8/user/month | Unlimited users, daily backups, SSO, priority support |
| **White-Label** | Custom | Full source code, remove branding, redistribution rights |

## Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** HTMX + TailwindCSS
- **Database:** SQLite (better-sqlite3)
- **Auth:** express-session + bcryptjs
- **Payments:** Stripe

## Configuration

Copy `.env.example` to `.env` and configure:

```env
# Required
SESSION_SECRET=your-secret-key

# Stripe (optional, for billing)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
```

## Project Structure

```
helpmate/
├── src/
│   ├── server.js          # Express app entry
│   ├── db/setup.js        # SQLite database setup
│   ├── middleware/        # Auth & tenant middleware
│   ├── routes/            # API routes (HTMX-optimized)
│   ├── views/             # HTML templates
│   └── lib/               # Utilities
├── public/                # Static assets
├── data/                  # SQLite database (gitignored)
└── LICENSE.md             # Proprietary license
```

## License

**Proprietary** - See [LICENSE.md](LICENSE.md) for terms.

- Free tier: Personal/internal use only
- Pro tier: $8/user/month for commercial use
- White-Label: Contact sales@helpmate.io

---

© 2024 HelpMate Inc. All rights reserved.
