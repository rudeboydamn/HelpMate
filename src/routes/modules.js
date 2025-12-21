import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../db/supabase.js';

export const modulesRoutes = Router();

// List all modules for a project
modulesRoutes.get('/:projectId', (req, res) => {
  const { projectId } = req.params;
  
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND org_id = ?').get(projectId, req.org.id);
  if (!project) return res.redirect('/dashboard');

  const modules = db.prepare(`
    SELECT m.*, u.name as lead_name,
      (SELECT COUNT(*) FROM module_issues mi WHERE mi.module_id = m.id) as total_issues,
      (SELECT COUNT(*) FROM module_issues mi JOIN issues i ON mi.issue_id = i.id JOIN states s ON i.state_id = s.id WHERE mi.module_id = m.id AND s.state_group = 'completed') as completed_issues
    FROM modules m
    LEFT JOIN users u ON m.lead_id = u.id
    WHERE m.project_id = ? AND m.archived_at IS NULL
    ORDER BY m.sort_order
  `).all(projectId);

  const projects = db.prepare('SELECT id, name, identifier, icon FROM projects WHERE org_id = ?').all(req.org.id);

  res.render('modules/list', { project, modules, projects });
});

// Get module detail
modulesRoutes.get('/:projectId/:moduleId', (req, res) => {
  const { projectId, moduleId } = req.params;

  const module = db.prepare(`
    SELECT m.*, u.name as lead_name, p.name as project_name, p.identifier
    FROM modules m
    LEFT JOIN users u ON m.lead_id = u.id
    LEFT JOIN projects p ON m.project_id = p.id
    WHERE m.id = ? AND m.project_id = ? AND p.org_id = ?
  `).get(moduleId, projectId, req.org.id);

  if (!module) return res.redirect(`/modules/${projectId}`);

  // Get issues in this module
  const issues = db.prepare(`
    SELECT i.*, s.name as state_name, s.color as state_color, s.state_group
    FROM issues i
    JOIN module_issues mi ON i.id = mi.issue_id
    LEFT JOIN states s ON i.state_id = s.id
    WHERE mi.module_id = ?
    ORDER BY i.sort_order
  `).all(moduleId);

  // Get module links
  const links = db.prepare('SELECT * FROM module_links WHERE module_id = ?').all(moduleId);

  // Get module members
  const members = db.prepare(`
    SELECT u.id, u.name, u.avatar_url FROM users u
    JOIN module_members mm ON u.id = mm.user_id
    WHERE mm.module_id = ?
  `).all(moduleId);

  // Calculate stats
  const stats = {
    total: issues.length,
    completed: issues.filter(i => i.state_group === 'completed').length,
    started: issues.filter(i => i.state_group === 'started').length,
    backlog: issues.filter(i => i.state_group === 'backlog' || i.state_group === 'unstarted').length,
  };

  const allMembers = db.prepare('SELECT id, name FROM users WHERE org_id = ? AND is_active = 1').all(req.org.id);

  res.render('modules/detail', { module, issues, links, members, stats, allMembers });
});

// Create module modal
modulesRoutes.get('/:projectId/create-modal', (req, res) => {
  const { projectId } = req.params;
  const members = db.prepare('SELECT id, name FROM users WHERE org_id = ? AND is_active = 1').all(req.org.id);

  const statusOptions = ['backlog', 'planned', 'in-progress', 'paused', 'completed', 'cancelled'];

  res.send(`
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="module-modal" onclick="if(event.target===this)this.remove()">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between p-4 border-b">
          <h2 class="text-lg font-semibold">Create Module</h2>
          <button onclick="this.closest('#module-modal').remove()" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form hx-post="/modules/${projectId}/create" hx-target="body" class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Module Name *</label>
            <input type="text" name="name" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Authentication">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea name="description" rows="2" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select name="status" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                ${statusOptions.map(s => `<option value="${s}" ${s === 'planned' ? 'selected' : ''}>${s.replace('-', ' ')}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Lead</label>
              <select name="lead_id" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                <option value="">No lead</option>
                ${members.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" name="start_date" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
              <input type="date" name="target_date" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
            </div>
          </div>
          <div class="flex justify-end gap-3 pt-4">
            <button type="button" onclick="this.closest('#module-modal').remove()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Create Module</button>
          </div>
        </form>
      </div>
    </div>
  `);
});

// Create module
modulesRoutes.post('/:projectId/create', (req, res) => {
  const { projectId } = req.params;
  const { name, description, status, lead_id, start_date, target_date } = req.body;

  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND org_id = ?').get(projectId, req.org.id);
  if (!project) return res.status(404).send('Project not found');

  const moduleId = uuidv4();
  db.prepare(`
    INSERT INTO modules (id, name, description, status, lead_id, start_date, target_date, project_id, org_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(moduleId, name, description || null, status || 'planned', lead_id || null, start_date || null, target_date || null, projectId, req.org.id);

  res.setHeader('HX-Redirect', `/modules/${projectId}/${moduleId}`);
  res.send('');
});

// Update module status
modulesRoutes.post('/:moduleId/status', (req, res) => {
  const { moduleId } = req.params;
  const { status } = req.body;

  db.prepare('UPDATE modules SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, moduleId);

  const statusColors = {
    'backlog': 'bg-gray-100 text-gray-700',
    'planned': 'bg-blue-100 text-blue-700',
    'in-progress': 'bg-purple-100 text-purple-700',
    'paused': 'bg-yellow-100 text-yellow-700',
    'completed': 'bg-green-100 text-green-700',
    'cancelled': 'bg-red-100 text-red-700'
  };

  res.send(`<span class="px-2 py-1 text-xs rounded ${statusColors[status]}">${status.replace('-', ' ')}</span>`);
});

// Add issue to module
modulesRoutes.post('/:moduleId/add-issue', (req, res) => {
  const { moduleId } = req.params;
  const { issueId } = req.body;

  try {
    db.prepare('INSERT INTO module_issues (id, module_id, issue_id) VALUES (?, ?, ?)').run(uuidv4(), moduleId, issueId);
  } catch (e) { /* Already exists */ }

  res.send('<span class="text-green-600 text-sm">Added!</span>');
});

// Add link to module
modulesRoutes.post('/:moduleId/add-link', (req, res) => {
  const { moduleId } = req.params;
  const { title, url } = req.body;

  if (!url) return res.send('');

  const linkId = uuidv4();
  db.prepare('INSERT INTO module_links (id, module_id, title, url, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(linkId, moduleId, title || url, url, req.user.id);

  res.send(`
    <div class="flex items-center gap-2 p-2 bg-gray-50 rounded" id="link-${linkId}">
      <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
      </svg>
      <a href="${url}" target="_blank" class="text-sm text-indigo-600 hover:underline flex-1 truncate">${title || url}</a>
      <button hx-delete="/modules/${moduleId}/link/${linkId}" hx-target="#link-${linkId}" hx-swap="outerHTML" class="text-gray-400 hover:text-red-500">✕</button>
    </div>
  `);
});

// Delete link
modulesRoutes.delete('/:moduleId/link/:linkId', (req, res) => {
  db.prepare('DELETE FROM module_links WHERE id = ?').run(req.params.linkId);
  res.send('');
});
