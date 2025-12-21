import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../db/supabase.js';

export const viewsRoutes = Router();

// List all views
viewsRoutes.get('/', (req, res) => {
  const { projectId } = req.query;

  let views;
  if (projectId) {
    views = db.prepare(`
      SELECT v.*, u.name as creator_name, p.name as project_name
      FROM views v
      LEFT JOIN users u ON v.created_by = u.id
      LEFT JOIN projects p ON v.project_id = p.id
      WHERE v.project_id = ? AND v.org_id = ? AND (v.access = 'public' OR v.created_by = ?)
      ORDER BY v.created_at DESC
    `).all(projectId, req.org.id, req.user.id);
  } else {
    views = db.prepare(`
      SELECT v.*, u.name as creator_name, p.name as project_name
      FROM views v
      LEFT JOIN users u ON v.created_by = u.id
      LEFT JOIN projects p ON v.project_id = p.id
      WHERE v.org_id = ? AND (v.access = 'public' OR v.created_by = ?)
      ORDER BY v.created_at DESC
    `).all(req.org.id, req.user.id);
  }

  const projects = db.prepare('SELECT id, name, identifier FROM projects WHERE org_id = ?').all(req.org.id);

  res.render('views/list', { views, projects, currentProjectId: projectId });
});

// Apply view (get issues with view filters)
viewsRoutes.get('/:viewId/apply', (req, res) => {
  const { viewId } = req.params;

  const view = db.prepare(`
    SELECT v.*, p.name as project_name, p.identifier
    FROM views v
    LEFT JOIN projects p ON v.project_id = p.id
    WHERE v.id = ? AND v.org_id = ?
  `).get(viewId, req.org.id);

  if (!view) return res.redirect('/views');

  const filters = JSON.parse(view.filters || '{}');
  const displayFilters = JSON.parse(view.display_filters || '{}');

  // Build query based on filters
  let query = `
    SELECT i.*, s.name as state_name, s.color as state_color, s.state_group,
           p.name as project_name, p.identifier
    FROM issues i
    LEFT JOIN states s ON i.state_id = s.id
    LEFT JOIN projects p ON i.project_id = p.id
    WHERE i.org_id = ?
  `;
  const params = [req.org.id];

  if (view.project_id) {
    query += ' AND i.project_id = ?';
    params.push(view.project_id);
  }

  if (filters.priority && filters.priority.length) {
    query += ` AND i.priority IN (${filters.priority.map(() => '?').join(',')})`;
    params.push(...filters.priority);
  }

  if (filters.state_group && filters.state_group.length) {
    query += ` AND s.state_group IN (${filters.state_group.map(() => '?').join(',')})`;
    params.push(...filters.state_group);
  }

  query += ' ORDER BY i.sort_order';

  const issues = db.prepare(query).all(...params);

  // Get assignees for each issue
  issues.forEach(issue => {
    issue.assignees = db.prepare(`
      SELECT u.id, u.name FROM users u
      JOIN issue_assignees ia ON u.id = ia.user_id
      WHERE ia.issue_id = ?
    `).all(issue.id);
  });

  res.render('views/applied', { view, issues, displayFilters });
});

// Create view modal
viewsRoutes.get('/create-modal', (req, res) => {
  const { projectId } = req.query;
  const projects = db.prepare('SELECT id, name FROM projects WHERE org_id = ?').all(req.org.id);

  res.send(`
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="view-modal" onclick="if(event.target===this)this.remove()">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between p-4 border-b">
          <h2 class="text-lg font-semibold">Create View</h2>
          <button onclick="this.closest('#view-modal').remove()" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form hx-post="/views/create" hx-target="body" class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">View Name *</label>
            <input type="text" name="name" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="e.g. My Open Issues">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea name="description" rows="2" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select name="project_id" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                <option value="">All Projects</option>
                ${projects.map(p => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${p.name}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Access</label>
              <select name="access" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Layout</label>
            <select name="layout" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
              <option value="list">List</option>
              <option value="kanban">Kanban</option>
              <option value="calendar">Calendar</option>
              <option value="spreadsheet">Spreadsheet</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Filter by Priority</label>
            <div class="flex gap-2 flex-wrap">
              <label class="flex items-center gap-1 text-sm"><input type="checkbox" name="priority" value="urgent" class="rounded"> Urgent</label>
              <label class="flex items-center gap-1 text-sm"><input type="checkbox" name="priority" value="high" class="rounded"> High</label>
              <label class="flex items-center gap-1 text-sm"><input type="checkbox" name="priority" value="medium" class="rounded"> Medium</label>
              <label class="flex items-center gap-1 text-sm"><input type="checkbox" name="priority" value="low" class="rounded"> Low</label>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Filter by State</label>
            <div class="flex gap-2 flex-wrap">
              <label class="flex items-center gap-1 text-sm"><input type="checkbox" name="state_group" value="backlog" class="rounded"> Backlog</label>
              <label class="flex items-center gap-1 text-sm"><input type="checkbox" name="state_group" value="unstarted" class="rounded"> Unstarted</label>
              <label class="flex items-center gap-1 text-sm"><input type="checkbox" name="state_group" value="started" class="rounded"> Started</label>
              <label class="flex items-center gap-1 text-sm"><input type="checkbox" name="state_group" value="completed" class="rounded"> Completed</label>
            </div>
          </div>
          <div class="flex justify-end gap-3 pt-4">
            <button type="button" onclick="this.closest('#view-modal').remove()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Create View</button>
          </div>
        </form>
      </div>
    </div>
  `);
});

// Create view
viewsRoutes.post('/create', (req, res) => {
  const { name, description, project_id, access, layout } = req.body;
  let { priority, state_group } = req.body;

  // Handle checkbox arrays
  if (priority && !Array.isArray(priority)) priority = [priority];
  if (state_group && !Array.isArray(state_group)) state_group = [state_group];

  const filters = {};
  if (priority && priority.length) filters.priority = priority;
  if (state_group && state_group.length) filters.state_group = state_group;

  const displayFilters = { layout: layout || 'list' };

  const viewId = uuidv4();
  db.prepare(`
    INSERT INTO views (id, name, description, filters, display_filters, access, project_id, org_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(viewId, name, description || null, JSON.stringify(filters), JSON.stringify(displayFilters), access || 'private', project_id || null, req.org.id, req.user.id);

  res.setHeader('HX-Redirect', `/views/${viewId}/apply`);
  res.send('');
});

// Delete view
viewsRoutes.delete('/:viewId', (req, res) => {
  const { viewId } = req.params;
  db.prepare('DELETE FROM views WHERE id = ? AND org_id = ? AND created_by = ?').run(viewId, req.org.id, req.user.id);
  res.setHeader('HX-Redirect', '/views');
  res.send('');
});
