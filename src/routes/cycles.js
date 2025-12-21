import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../db/supabase.js';

export const cyclesRoutes = Router();

// List all cycles for a project
cyclesRoutes.get('/:projectId', (req, res) => {
  const { projectId } = req.params;
  
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND org_id = ?').get(projectId, req.org.id);
  if (!project) return res.redirect('/dashboard');

  const cycles = db.prepare(`
    SELECT c.*, u.name as owner_name,
      (SELECT COUNT(*) FROM cycle_issues ci JOIN issues i ON ci.issue_id = i.id WHERE ci.cycle_id = c.id) as total_issues,
      (SELECT COUNT(*) FROM cycle_issues ci JOIN issues i ON ci.issue_id = i.id JOIN states s ON i.state_id = s.id WHERE ci.cycle_id = c.id AND s.state_group = 'completed') as completed_issues
    FROM cycles c
    LEFT JOIN users u ON c.owned_by = u.id
    WHERE c.project_id = ? AND c.archived_at IS NULL
    ORDER BY c.start_date DESC
  `).all(projectId);

  const projects = db.prepare('SELECT id, name, identifier, icon FROM projects WHERE org_id = ?').all(req.org.id);

  res.render('cycles/list', { project, cycles, projects });
});

// Get cycle detail with burn-down chart
cyclesRoutes.get('/:projectId/:cycleId', (req, res) => {
  const { projectId, cycleId } = req.params;

  const cycle = db.prepare(`
    SELECT c.*, u.name as owner_name, p.name as project_name, p.identifier
    FROM cycles c
    LEFT JOIN users u ON c.owned_by = u.id
    LEFT JOIN projects p ON c.project_id = p.id
    WHERE c.id = ? AND c.project_id = ? AND p.org_id = ?
  `).get(cycleId, projectId, req.org.id);

  if (!cycle) return res.redirect(`/cycles/${projectId}`);

  // Get issues in this cycle
  const issues = db.prepare(`
    SELECT i.*, s.name as state_name, s.color as state_color, s.state_group
    FROM issues i
    JOIN cycle_issues ci ON i.id = ci.issue_id
    LEFT JOIN states s ON i.state_id = s.id
    WHERE ci.cycle_id = ?
    ORDER BY i.sort_order
  `).all(cycleId);

  // Get progress data for burn-down chart
  const progressData = db.prepare(`
    SELECT date, total_issues, completed_issues, started_issues, backlog_issues
    FROM cycle_progress
    WHERE cycle_id = ?
    ORDER BY date ASC
  `).all(cycleId);

  // Calculate stats
  const stats = {
    total: issues.length,
    completed: issues.filter(i => i.state_group === 'completed').length,
    started: issues.filter(i => i.state_group === 'started').length,
    backlog: issues.filter(i => i.state_group === 'backlog' || i.state_group === 'unstarted').length,
    cancelled: issues.filter(i => i.state_group === 'cancelled').length,
  };

  const members = db.prepare('SELECT id, name FROM users WHERE org_id = ? AND is_active = 1').all(req.org.id);

  res.render('cycles/detail', { cycle, issues, progressData, stats, members });
});

// Create cycle modal
cyclesRoutes.get('/:projectId/create-modal', (req, res) => {
  const { projectId } = req.params;
  const members = db.prepare('SELECT id, name FROM users WHERE org_id = ? AND is_active = 1').all(req.org.id);

  res.send(`
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="cycle-modal" onclick="if(event.target===this)this.remove()">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between p-4 border-b">
          <h2 class="text-lg font-semibold">Create Cycle</h2>
          <button onclick="this.closest('#cycle-modal').remove()" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form hx-post="/cycles/${projectId}/create" hx-target="body" class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Cycle Name *</label>
            <input type="text" name="name" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Sprint 3">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea name="description" rows="2" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" name="start_date" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" name="end_date" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
            </div>
          </div>
          <div class="flex justify-end gap-3 pt-4">
            <button type="button" onclick="this.closest('#cycle-modal').remove()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Create Cycle</button>
          </div>
        </form>
      </div>
    </div>
  `);
});

// Create cycle
cyclesRoutes.post('/:projectId/create', (req, res) => {
  const { projectId } = req.params;
  const { name, description, start_date, end_date } = req.body;

  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND org_id = ?').get(projectId, req.org.id);
  if (!project) return res.status(404).send('Project not found');

  const cycleId = uuidv4();
  const status = start_date && new Date(start_date) <= new Date() && (!end_date || new Date(end_date) >= new Date()) ? 'current' : 'upcoming';

  db.prepare(`
    INSERT INTO cycles (id, name, description, start_date, end_date, status, owned_by, project_id, org_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(cycleId, name, description || null, start_date || null, end_date || null, status, req.user.id, projectId, req.org.id);

  res.setHeader('HX-Redirect', `/cycles/${projectId}/${cycleId}`);
  res.send('');
});

// Add issue to cycle
cyclesRoutes.post('/:cycleId/add-issue', (req, res) => {
  const { cycleId } = req.params;
  const { issueId } = req.body;

  const cycle = db.prepare('SELECT c.* FROM cycles c JOIN projects p ON c.project_id = p.id WHERE c.id = ? AND p.org_id = ?').get(cycleId, req.org.id);
  if (!cycle) return res.status(404).send('Cycle not found');

  try {
    db.prepare('INSERT INTO cycle_issues (id, cycle_id, issue_id) VALUES (?, ?, ?)').run(uuidv4(), cycleId, issueId);
    db.prepare('UPDATE issues SET cycle_id = ? WHERE id = ?').run(cycleId, issueId);
  } catch (e) {
    // Already exists
  }

  res.send('<span class="text-green-600 text-sm">Added!</span>');
});

// Remove issue from cycle
cyclesRoutes.delete('/:cycleId/issue/:issueId', (req, res) => {
  const { cycleId, issueId } = req.params;

  db.prepare('DELETE FROM cycle_issues WHERE cycle_id = ? AND issue_id = ?').run(cycleId, issueId);
  db.prepare('UPDATE issues SET cycle_id = NULL WHERE id = ?').run(issueId);

  res.send('');
});

// Get burn-down chart data
cyclesRoutes.get('/:cycleId/burndown', (req, res) => {
  const { cycleId } = req.params;

  const progressData = db.prepare(`
    SELECT date, total_issues, completed_issues, started_issues, backlog_issues
    FROM cycle_progress WHERE cycle_id = ? ORDER BY date ASC
  `).all(cycleId);

  const cycle = db.prepare('SELECT start_date, end_date FROM cycles WHERE id = ?').get(cycleId);

  res.json({ progressData, cycle });
});
