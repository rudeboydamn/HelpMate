import express from 'express';
import cookieSession from 'cookie-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { kanbanRoutes } from './routes/kanban.js';
import { issueRoutes } from './routes/issues.js';
import { billingRoutes } from './routes/billing.js';
import { orgRoutes } from './routes/org.js';
import { cyclesRoutes } from './routes/cycles.js';
import { modulesRoutes } from './routes/modules.js';
import { viewsRoutes } from './routes/views.js';
import { pagesRoutes } from './routes/pages.js';
import { analyticsRoutes } from './routes/analytics.js';
import { adminRoutes } from './routes/admin.js';
import { authMiddleware, tenantMiddleware } from './middleware/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase is used as the database - no initialization needed
console.log('✅ HelpMate configured with Supabase backend');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

// Session configuration (cookie-based for serverless compatibility)
const sessionSecret = process.env.SESSION_SECRET || 'helpmate-secret';
app.use(cookieSession({
  name: 'helpmate_session',
  secret: sessionSecret,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
}));

// Template engine setup (simple HTML templates)
app.set('views', join(__dirname, 'views'));

// Helper to render templates
app.use((req, res, next) => {
  res.render = async (template, data = {}) => {
    const { renderTemplate } = await import('./lib/template.js');
    const html = await renderTemplate(template, { ...data, user: req.user, org: req.org });
    res.send(html);
  };
  next();
});

// Public routes
app.use('/', authRoutes);

// Protected routes
app.use('/dashboard', authMiddleware, tenantMiddleware, dashboardRoutes);
app.use('/kanban', authMiddleware, tenantMiddleware, kanbanRoutes);
app.use('/issues', authMiddleware, tenantMiddleware, issueRoutes);
app.use('/billing', authMiddleware, tenantMiddleware, billingRoutes);
app.use('/org', authMiddleware, tenantMiddleware, orgRoutes);
app.use('/cycles', authMiddleware, tenantMiddleware, cyclesRoutes);
app.use('/modules', authMiddleware, tenantMiddleware, modulesRoutes);
app.use('/views', authMiddleware, tenantMiddleware, viewsRoutes);
app.use('/pages', authMiddleware, tenantMiddleware, pagesRoutes);
app.use('/analytics', authMiddleware, tenantMiddleware, analyticsRoutes);
app.use('/admin', authMiddleware, tenantMiddleware, adminRoutes);

// Home page
app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('home');
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send(`
    <div class="p-4 bg-red-100 text-red-700 rounded">
      Something went wrong. Please try again.
    </div>
  `);
});

// Only start server in non-Vercel environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   🚀 HelpMate is running!                                 ║
  ║                                                           ║
  ║   Local:   http://localhost:${PORT}                        ║
  ║   Docs:    http://localhost:${PORT}/docs                   ║
  ║                                                           ║
  ║   Ready for modern project management with HTMX!          ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
    `);
  });
}

// Export for Vercel serverless
export default app;
