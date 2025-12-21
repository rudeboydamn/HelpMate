import { Router } from 'express';
import { supabase } from '../db/supabase.js';

export const adminRoutes = Router();

// Check if user is instance admin
function instanceAdminMiddleware(req, res, next) {
  const isAdmin = db.prepare('SELECT id FROM instance_admins WHERE user_id = ?').get(req.user.id);
  if (!isAdmin) {
    if (req.headers['hx-request']) {
      return res.status(403).send('<div class="p-4 bg-red-100 text-red-700 rounded">Access denied. Instance admin required.</div>');
    }
    return res.redirect('/dashboard');
  }
  next();
}

// God Mode Dashboard
adminRoutes.get('/', instanceAdminMiddleware, (req, res) => {
  // Get instance stats
  const stats = {
    totalOrgs: db.prepare('SELECT COUNT(*) as count FROM organizations').get().count,
    totalUsers: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
    totalProjects: db.prepare('SELECT COUNT(*) as count FROM projects').get().count,
    totalIssues: db.prepare('SELECT COUNT(*) as count FROM issues').get().count,
  };

  // Get all settings
  const settings = db.prepare('SELECT * FROM instance_settings ORDER BY key').all();
  const settingsMap = settings.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {});

  // Get all orgs
  const organizations = db.prepare(`
    SELECT o.*, 
      (SELECT COUNT(*) FROM users WHERE org_id = o.id) as user_count,
      (SELECT COUNT(*) FROM projects WHERE org_id = o.id) as project_count
    FROM organizations o
    ORDER BY o.created_at DESC
  `).all();

  // Get instance admins
  const admins = db.prepare(`
    SELECT u.id, u.name, u.email FROM users u
    JOIN instance_admins ia ON u.id = ia.user_id
  `).all();

  res.render('admin/dashboard', { stats, settings: settingsMap, organizations, admins });
});

// Update instance settings
adminRoutes.post('/settings', instanceAdminMiddleware, (req, res) => {
  const { key, value } = req.body;

  const existing = db.prepare('SELECT id FROM instance_settings WHERE key = ?').get(key);
  if (existing) {
    db.prepare('UPDATE instance_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(value, key);
  } else {
    db.prepare('INSERT INTO instance_settings (id, key, value) VALUES (?, ?, ?)').run(require('uuid').v4(), key, value);
  }

  res.send(`<span class="text-green-600 text-sm">✓ Saved</span>`);
});

// Get settings form
adminRoutes.get('/settings-form', instanceAdminMiddleware, (req, res) => {
  const settings = db.prepare('SELECT * FROM instance_settings ORDER BY key').all();
  const settingsMap = settings.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {});

  res.send(`
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <label class="block text-sm font-medium text-gray-700">Instance Name</label>
          <p class="text-xs text-gray-500">The name displayed across the platform</p>
        </div>
        <input type="text" name="instance_name" value="${settingsMap.instance_name || 'HelpMate'}"
          hx-post="/admin/settings" hx-vals='{"key":"instance_name"}' hx-trigger="change" hx-swap="none"
          class="px-3 py-2 border rounded-lg w-64 focus:ring-2 focus:ring-indigo-500">
      </div>
      <div class="flex items-center justify-between">
        <div>
          <label class="block text-sm font-medium text-gray-700">Enable Sign Up</label>
          <p class="text-xs text-gray-500">Allow new users to register</p>
        </div>
        <select name="is_signup_enabled" 
          hx-post="/admin/settings" hx-vals='{"key":"is_signup_enabled"}' hx-trigger="change" hx-swap="none"
          class="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
          <option value="true" ${settingsMap.is_signup_enabled === 'true' ? 'selected' : ''}>Enabled</option>
          <option value="false" ${settingsMap.is_signup_enabled === 'false' ? 'selected' : ''}>Disabled</option>
        </select>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <label class="block text-sm font-medium text-gray-700">Email Verification Required</label>
          <p class="text-xs text-gray-500">Require email verification for new accounts</p>
        </div>
        <select name="is_email_verification_required"
          hx-post="/admin/settings" hx-vals='{"key":"is_email_verification_required"}' hx-trigger="change" hx-swap="none"
          class="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
          <option value="true" ${settingsMap.is_email_verification_required === 'true' ? 'selected' : ''}>Required</option>
          <option value="false" ${settingsMap.is_email_verification_required === 'false' ? 'selected' : ''}>Not Required</option>
        </select>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <label class="block text-sm font-medium text-gray-700">Magic Link Login</label>
          <p class="text-xs text-gray-500">Allow passwordless email login</p>
        </div>
        <select name="is_magic_login_enabled"
          hx-post="/admin/settings" hx-vals='{"key":"is_magic_login_enabled"}' hx-trigger="change" hx-swap="none"
          class="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
          <option value="true" ${settingsMap.is_magic_login_enabled === 'true' ? 'selected' : ''}>Enabled</option>
          <option value="false" ${settingsMap.is_magic_login_enabled === 'false' ? 'selected' : ''}>Disabled</option>
        </select>
      </div>
    </div>
  `);
});

// Manage organizations
adminRoutes.get('/organizations', instanceAdminMiddleware, (req, res) => {
  const organizations = db.prepare(`
    SELECT o.*, 
      (SELECT COUNT(*) FROM users WHERE org_id = o.id) as user_count,
      (SELECT COUNT(*) FROM projects WHERE org_id = o.id) as project_count,
      (SELECT COUNT(*) FROM issues WHERE org_id = o.id) as issue_count
    FROM organizations o
    ORDER BY o.created_at DESC
  `).all();

  const html = organizations.map(o => `
    <tr class="border-b">
      <td class="px-4 py-3">
        <div class="font-medium">${o.name}</div>
        <div class="text-xs text-gray-500">${o.slug}</div>
      </td>
      <td class="px-4 py-3">
        <span class="px-2 py-1 text-xs rounded ${o.plan === 'pro' ? 'bg-indigo-100 text-indigo-700' : o.plan === 'whitelabel' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}">${o.plan}</span>
      </td>
      <td class="px-4 py-3 text-center">${o.user_count}</td>
      <td class="px-4 py-3 text-center">${o.project_count}</td>
      <td class="px-4 py-3 text-center">${o.issue_count}</td>
      <td class="px-4 py-3 text-sm text-gray-500">${new Date(o.created_at).toLocaleDateString()}</td>
      <td class="px-4 py-3">
        <select hx-post="/admin/org/${o.id}/plan" hx-trigger="change" hx-swap="none" class="text-sm border rounded px-2 py-1">
          <option value="free" ${o.plan === 'free' ? 'selected' : ''}>Free</option>
          <option value="pro" ${o.plan === 'pro' ? 'selected' : ''}>Pro</option>
          <option value="whitelabel" ${o.plan === 'whitelabel' ? 'selected' : ''}>White-label</option>
        </select>
      </td>
    </tr>
  `).join('');

  res.send(html);
});

// Update org plan
adminRoutes.post('/org/:orgId/plan', instanceAdminMiddleware, (req, res) => {
  const { orgId } = req.params;
  const plan = req.body.value || req.body.plan;

  db.prepare('UPDATE organizations SET plan = ?, max_users = ? WHERE id = ?')
    .run(plan, plan === 'free' ? 5 : 9999, orgId);

  res.send('');
});

// Add instance admin
adminRoutes.post('/add-admin', instanceAdminMiddleware, (req, res) => {
  const { email } = req.body;

  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.send('<div class="text-red-600 text-sm">User not found</div>');
  }

  const existing = db.prepare('SELECT id FROM instance_admins WHERE user_id = ?').get(user.id);
  if (existing) {
    return res.send('<div class="text-yellow-600 text-sm">Already an admin</div>');
  }

  db.prepare('INSERT INTO instance_admins (id, user_id) VALUES (?, ?)').run(require('uuid').v4(), user.id);

  res.send(`
    <div class="flex items-center justify-between p-3 bg-gray-50 rounded" id="admin-${user.id}">
      <div>
        <span class="font-medium">${user.name}</span>
        <span class="text-sm text-gray-500 ml-2">${user.email}</span>
      </div>
      <button hx-delete="/admin/remove-admin/${user.id}" hx-target="#admin-${user.id}" hx-swap="outerHTML" 
        class="text-red-500 hover:text-red-700 text-sm">Remove</button>
    </div>
  `);
});

// Remove instance admin
adminRoutes.delete('/remove-admin/:userId', instanceAdminMiddleware, (req, res) => {
  const { userId } = req.params;

  // Don't allow removing yourself
  if (userId === req.user.id) {
    return res.send('<div class="text-red-600 text-sm p-3">Cannot remove yourself</div>');
  }

  db.prepare('DELETE FROM instance_admins WHERE user_id = ?').run(userId);
  res.send('');
});
