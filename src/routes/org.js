import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../db/supabase.js';
import { adminMiddleware, ownerMiddleware } from '../middleware/auth.js';

export const orgRoutes = Router();

// Organization settings
orgRoutes.get('/settings', adminMiddleware, (req, res) => {
  const members = db.prepare(`
    SELECT id, name, email, role, created_at, is_active
    FROM users WHERE org_id = ?
    ORDER BY created_at ASC
  `).all(req.org.id);

  res.render('org/settings', { members });
});

// Update organization name
orgRoutes.post('/update', ownerMiddleware, (req, res) => {
  const { name } = req.body;
  
  if (!name?.trim()) {
    return res.send('<div class="text-red-500">Name is required</div>');
  }

  db.prepare('UPDATE organizations SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(name.trim(), req.org.id);

  res.send(`
    <div class="p-3 bg-green-100 text-green-700 rounded-lg text-sm">
      Organization updated successfully!
    </div>
  `);
});

// Invite member
orgRoutes.post('/invite', adminMiddleware, async (req, res) => {
  const { email, name, role } = req.body;

  // Check user limit
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE org_id = ? AND is_active = 1')
    .get(req.org.id).count;

  if (userCount >= req.org.max_users) {
    return res.send(`
      <div class="p-3 bg-amber-100 text-amber-700 rounded-lg text-sm">
        User limit reached (${req.org.max_users}). Upgrade to Pro for unlimited users.
      </div>
    `);
  }

  // Check if email exists
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.send(`
      <div class="p-3 bg-red-100 text-red-700 rounded-lg text-sm">
        A user with this email already exists.
      </div>
    `);
  }

  // Create user with temporary password
  const tempPassword = Math.random().toString(36).slice(-8);
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const userId = uuidv4();

  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, org_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, email, passwordHash, name, role || 'member', req.org.id);

  res.send(`
    <div class="p-3 bg-green-100 text-green-700 rounded-lg text-sm">
      User invited! Temporary password: <code class="bg-green-200 px-1 rounded">${tempPassword}</code>
      <br><small>Share this securely with the user.</small>
    </div>
    <tr class="border-b" id="member-${userId}">
      <td class="py-3 px-4">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium">
            ${name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div class="font-medium">${escapeHtml(name)}</div>
            <div class="text-sm text-gray-500">${escapeHtml(email)}</div>
          </div>
        </div>
      </td>
      <td class="py-3 px-4">
        <span class="text-xs px-2 py-1 rounded bg-gray-100">${role || 'member'}</span>
      </td>
      <td class="py-3 px-4 text-gray-500 text-sm">Just now</td>
      <td class="py-3 px-4">
        <span class="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Active</span>
      </td>
      <td class="py-3 px-4">
        <button hx-delete="/org/members/${userId}" hx-target="#member-${userId}" hx-swap="outerHTML" hx-confirm="Remove this member?"
          class="text-red-500 hover:text-red-700 text-sm">Remove</button>
      </td>
    </tr>
  `);
});

// Remove member
orgRoutes.delete('/members/:id', adminMiddleware, (req, res) => {
  const memberId = req.params.id;

  // Can't remove yourself
  if (memberId === req.user.id) {
    return res.send(`
      <tr><td colspan="5" class="p-3 bg-red-100 text-red-700 rounded">Cannot remove yourself</td></tr>
    `);
  }

  // Can't remove owner unless you're owner
  const member = db.prepare('SELECT role FROM users WHERE id = ? AND org_id = ?').get(memberId, req.org.id);
  if (member?.role === 'owner' && req.user.role !== 'owner') {
    return res.send(`
      <tr><td colspan="5" class="p-3 bg-red-100 text-red-700 rounded">Cannot remove owner</td></tr>
    `);
  }

  db.prepare('UPDATE users SET is_active = 0 WHERE id = ? AND org_id = ?').run(memberId, req.org.id);
  res.send(''); // Remove row
});

// Member list partial (for HTMX refresh)
orgRoutes.get('/members', adminMiddleware, (req, res) => {
  const members = db.prepare(`
    SELECT id, name, email, role, created_at, is_active
    FROM users WHERE org_id = ?
    ORDER BY created_at ASC
  `).all(req.org.id);

  const roleColors = {
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-blue-100 text-blue-700',
    member: 'bg-gray-100 text-gray-600'
  };

  const html = members.map(m => `
    <tr class="border-b" id="member-${m.id}">
      <td class="py-3 px-4">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium">
            ${m.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div class="font-medium">${escapeHtml(m.name)}</div>
            <div class="text-sm text-gray-500">${escapeHtml(m.email)}</div>
          </div>
        </div>
      </td>
      <td class="py-3 px-4">
        <span class="text-xs px-2 py-1 rounded ${roleColors[m.role]}">${m.role}</span>
      </td>
      <td class="py-3 px-4 text-gray-500 text-sm">${new Date(m.created_at).toLocaleDateString()}</td>
      <td class="py-3 px-4">
        ${m.is_active 
          ? '<span class="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Active</span>'
          : '<span class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500">Inactive</span>'}
      </td>
      <td class="py-3 px-4">
        ${m.id !== req.user.id ? `
          <button hx-delete="/org/members/${m.id}" hx-target="#member-${m.id}" hx-swap="outerHTML" hx-confirm="Remove this member?"
            class="text-red-500 hover:text-red-700 text-sm">Remove</button>
        ` : '<span class="text-gray-400 text-sm">You</span>'}
      </td>
    </tr>
  `).join('');

  res.send(html);
});

// Projects list
orgRoutes.get('/projects', (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, u.name as creator_name,
      (SELECT COUNT(*) FROM issues WHERE project_id = p.id) as issue_count
    FROM projects p
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.org_id = ?
    ORDER BY p.created_at DESC
  `).all(req.org.id);

  res.render('org/projects', { projects });
});

// Create project
orgRoutes.post('/projects', (req, res) => {
  const { name, description, color } = req.body;

  if (!name?.trim()) {
    return res.send('<div class="text-red-500 text-sm">Project name is required</div>');
  }

  const projectId = uuidv4();
  db.prepare(`
    INSERT INTO projects (id, name, description, color, org_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(projectId, name.trim(), description || null, color || '#6366f1', req.org.id, req.user.id);

  // Create default board
  const boardId = uuidv4();
  db.prepare('INSERT INTO boards (id, name, project_id) VALUES (?, ?, ?)').run(boardId, 'Main Board', projectId);

  // Create default columns
  const defaultCols = [
    { name: 'Backlog', color: '#94a3b8' },
    { name: 'To Do', color: '#f59e0b' },
    { name: 'In Progress', color: '#3b82f6' },
    { name: 'Done', color: '#22c55e' }
  ];
  defaultCols.forEach((col, idx) => {
    db.prepare('INSERT INTO columns (id, name, position, color, board_id) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), col.name, idx, col.color, boardId);
  });

  res.send(`
    <div class="bg-white rounded-lg border p-4 hover:shadow-md transition">
      <div class="flex items-center gap-3">
        <div class="w-4 h-4 rounded" style="background-color: ${color || '#6366f1'}"></div>
        <h3 class="font-medium">${escapeHtml(name)}</h3>
      </div>
      <p class="text-sm text-gray-500 mt-1">${escapeHtml(description || 'No description')}</p>
      <div class="flex items-center gap-4 mt-3 text-sm text-gray-400">
        <span>0 issues</span>
        <span>Created just now</span>
      </div>
      <div class="mt-3">
        <a href="/kanban/${projectId}" class="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
          Open Board →
        </a>
      </div>
    </div>
  `);
});

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, char => map[char]);
}
