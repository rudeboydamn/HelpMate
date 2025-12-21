import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../db/supabase.js';

export const pagesRoutes = Router();

// List all pages
pagesRoutes.get('/', (req, res) => {
  const { projectId, tab } = req.query;
  const activeTab = tab || 'public';

  let pages;
  let query = `
    SELECT pg.*, u.name as owner_name, p.name as project_name, p.identifier
    FROM pages pg
    LEFT JOIN users u ON pg.owned_by = u.id
    LEFT JOIN projects p ON pg.project_id = p.id
    WHERE pg.org_id = ?
  `;
  const params = [req.org.id];

  if (projectId) {
    query += ' AND pg.project_id = ?';
    params.push(projectId);
  }

  if (activeTab === 'public') {
    query += ' AND pg.access = ? AND pg.archived_at IS NULL';
    params.push('public');
  } else if (activeTab === 'private') {
    query += ' AND pg.access = ? AND pg.owned_by = ? AND pg.archived_at IS NULL';
    params.push('private', req.user.id);
  } else if (activeTab === 'archived') {
    query += ' AND pg.archived_at IS NOT NULL';
  }

  query += ' ORDER BY pg.updated_at DESC';
  pages = db.prepare(query).all(...params);

  const projects = db.prepare('SELECT id, name, identifier FROM projects WHERE org_id = ?').all(req.org.id);

  res.render('pages/list', { pages, projects, activeTab, currentProjectId: projectId });
});

// View/edit page
pagesRoutes.get('/:pageId', (req, res) => {
  const { pageId } = req.params;

  const page = db.prepare(`
    SELECT pg.*, u.name as owner_name, p.name as project_name, p.identifier
    FROM pages pg
    LEFT JOIN users u ON pg.owned_by = u.id
    LEFT JOIN projects p ON pg.project_id = p.id
    WHERE pg.id = ? AND pg.org_id = ?
  `).get(pageId, req.org.id);

  if (!page) return res.redirect('/pages');

  // Check access
  if (page.access === 'private' && page.owned_by !== req.user.id) {
    return res.status(403).send('Access denied');
  }

  const canEdit = page.owned_by === req.user.id || !page.is_locked;

  res.render('pages/editor', { page, canEdit });
});

// Create page modal
pagesRoutes.get('/create-modal', (req, res) => {
  const { projectId } = req.query;
  const projects = db.prepare('SELECT id, name FROM projects WHERE org_id = ?').all(req.org.id);

  res.send(`
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="page-modal" onclick="if(event.target===this)this.remove()">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between p-4 border-b">
          <h2 class="text-lg font-semibold">Create Page</h2>
          <button onclick="this.closest('#page-modal').remove()" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form hx-post="/pages/create" hx-target="body" class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Page Title *</label>
            <input type="text" name="name" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Product Requirements">
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Icon</label>
              <select name="icon" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                <option value="📄">📄 Document</option>
                <option value="📋">📋 Clipboard</option>
                <option value="📝">📝 Note</option>
                <option value="📊">📊 Chart</option>
                <option value="📁">📁 Folder</option>
                <option value="💡">💡 Idea</option>
                <option value="🎯">🎯 Target</option>
                <option value="🚀">🚀 Rocket</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Access</label>
              <select name="access" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                <option value="private">🔒 Private</option>
                <option value="public">🌐 Public</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Project (optional)</label>
            <select name="project_id" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
              <option value="">No project</option>
              ${projects.map(p => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="flex justify-end gap-3 pt-4">
            <button type="button" onclick="this.closest('#page-modal').remove()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Create Page</button>
          </div>
        </form>
      </div>
    </div>
  `);
});

// Create page
pagesRoutes.post('/create', (req, res) => {
  const { name, icon, access, project_id } = req.body;

  const pageId = uuidv4();
  db.prepare(`
    INSERT INTO pages (id, name, icon, access, project_id, org_id, owned_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(pageId, name, icon || '📄', access || 'private', project_id || null, req.org.id, req.user.id);

  res.setHeader('HX-Redirect', `/pages/${pageId}`);
  res.send('');
});

// Update page content
pagesRoutes.post('/:pageId/update', (req, res) => {
  const { pageId } = req.params;
  const { description_html, name } = req.body;

  const page = db.prepare('SELECT * FROM pages WHERE id = ? AND org_id = ?').get(pageId, req.org.id);
  if (!page) return res.status(404).send('Page not found');

  if (page.is_locked && page.owned_by !== req.user.id) {
    return res.status(403).send('Page is locked');
  }

  db.prepare(`
    UPDATE pages SET description_html = ?, name = COALESCE(?, name), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(description_html, name, pageId);

  res.send('<span class="text-green-600 text-sm">Saved</span>');
});

// Toggle page lock
pagesRoutes.post('/:pageId/toggle-lock', (req, res) => {
  const { pageId } = req.params;

  const page = db.prepare('SELECT * FROM pages WHERE id = ? AND owned_by = ?').get(pageId, req.user.id);
  if (!page) return res.status(403).send('Not authorized');

  const newLockState = page.is_locked ? 0 : 1;
  db.prepare('UPDATE pages SET is_locked = ? WHERE id = ?').run(newLockState, pageId);

  res.send(newLockState ? '🔒 Locked' : '🔓 Unlocked');
});

// Archive page
pagesRoutes.post('/:pageId/archive', (req, res) => {
  const { pageId } = req.params;

  db.prepare('UPDATE pages SET archived_at = CURRENT_TIMESTAMP WHERE id = ? AND owned_by = ?')
    .run(pageId, req.user.id);

  res.setHeader('HX-Redirect', '/pages');
  res.send('');
});

// Delete page
pagesRoutes.delete('/:pageId', (req, res) => {
  const { pageId } = req.params;
  db.prepare('DELETE FROM pages WHERE id = ? AND owned_by = ?').run(pageId, req.user.id);
  res.setHeader('HX-Redirect', '/pages');
  res.send('');
});
