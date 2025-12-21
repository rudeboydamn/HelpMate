import { Router } from 'express';
import { supabase } from '../db/supabase.js';

export const analyticsRoutes = Router();

// Analytics dashboard
analyticsRoutes.get('/', (req, res) => {
  const { projectId } = req.query;

  const projects = db.prepare('SELECT id, name, identifier, color FROM projects WHERE org_id = ?').all(req.org.id);

  // Get overall stats
  let statsQuery = 'SELECT * FROM issues WHERE org_id = ?';
  let params = [req.org.id];
  if (projectId) {
    statsQuery += ' AND project_id = ?';
    params.push(projectId);
  }

  const allIssues = db.prepare(statsQuery).all(...params);

  // Get states for grouping
  const stateStats = db.prepare(`
    SELECT s.state_group, COUNT(i.id) as count
    FROM issues i
    LEFT JOIN states s ON i.state_id = s.id
    WHERE i.org_id = ? ${projectId ? 'AND i.project_id = ?' : ''}
    GROUP BY s.state_group
  `).all(...params);

  const priorityStats = db.prepare(`
    SELECT priority, COUNT(*) as count
    FROM issues
    WHERE org_id = ? ${projectId ? 'AND project_id = ?' : ''}
    GROUP BY priority
  `).all(...params);

  const assigneeStats = db.prepare(`
    SELECT u.name, u.id, COUNT(ia.issue_id) as count
    FROM users u
    LEFT JOIN issue_assignees ia ON u.id = ia.user_id
    LEFT JOIN issues i ON ia.issue_id = i.id
    WHERE u.org_id = ? ${projectId ? 'AND (i.project_id = ? OR i.project_id IS NULL)' : ''}
    GROUP BY u.id
    ORDER BY count DESC
    LIMIT 10
  `).all(...params);

  // Issues created over time (last 30 days)
  const createdOverTime = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM issues
    WHERE org_id = ? ${projectId ? 'AND project_id = ?' : ''}
      AND created_at >= DATE('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY date
  `).all(...params);

  // Completed over time (last 30 days)
  const completedOverTime = db.prepare(`
    SELECT DATE(completed_at) as date, COUNT(*) as count
    FROM issues
    WHERE org_id = ? ${projectId ? 'AND project_id = ?' : ''}
      AND completed_at IS NOT NULL
      AND completed_at >= DATE('now', '-30 days')
    GROUP BY DATE(completed_at)
    ORDER BY date
  `).all(...params);

  res.render('analytics/dashboard', {
    projects,
    currentProjectId: projectId,
    totalIssues: allIssues.length,
    stateStats: stateStats.reduce((acc, s) => { acc[s.state_group || 'none'] = s.count; return acc; }, {}),
    priorityStats: priorityStats.reduce((acc, p) => { acc[p.priority || 'none'] = p.count; return acc; }, {}),
    assigneeStats,
    createdOverTime,
    completedOverTime
  });
});

// Get chart data (HTMX)
analyticsRoutes.get('/chart/:type', (req, res) => {
  const { type } = req.params;
  const { projectId, xAxis, yAxis } = req.query;

  let data = [];
  const params = [req.org.id];
  if (projectId) params.push(projectId);

  const projectFilter = projectId ? 'AND i.project_id = ?' : '';

  switch (type) {
    case 'by-state':
      data = db.prepare(`
        SELECT s.name as label, s.color, COUNT(i.id) as value
        FROM states s
        LEFT JOIN issues i ON i.state_id = s.id AND i.org_id = ? ${projectFilter}
        WHERE s.project_id IN (SELECT id FROM projects WHERE org_id = ?)
        GROUP BY s.id
        ORDER BY s.position
      `).all(req.org.id, ...(projectId ? [projectId] : []), req.org.id);
      break;

    case 'by-priority':
      data = db.prepare(`
        SELECT priority as label, COUNT(*) as value
        FROM issues i
        WHERE i.org_id = ? ${projectFilter}
        GROUP BY priority
      `).all(...params);
      break;

    case 'by-assignee':
      data = db.prepare(`
        SELECT u.name as label, COUNT(ia.issue_id) as value
        FROM users u
        LEFT JOIN issue_assignees ia ON u.id = ia.user_id
        LEFT JOIN issues i ON ia.issue_id = i.id AND i.org_id = ? ${projectFilter}
        WHERE u.org_id = ?
        GROUP BY u.id
        HAVING value > 0
        ORDER BY value DESC
      `).all(req.org.id, ...(projectId ? [projectId] : []), req.org.id);
      break;

    case 'by-label':
      data = db.prepare(`
        SELECT l.name as label, l.color, COUNT(il.issue_id) as value
        FROM labels l
        LEFT JOIN issue_labels il ON l.id = il.label_id
        LEFT JOIN issues i ON il.issue_id = i.id AND i.org_id = ? ${projectFilter}
        WHERE l.org_id = ?
        GROUP BY l.id
        HAVING value > 0
        ORDER BY value DESC
      `).all(req.org.id, ...(projectId ? [projectId] : []), req.org.id);
      break;
  }

  res.json(data);
});

// Work items table
analyticsRoutes.get('/work-items', (req, res) => {
  const { projectId } = req.query;

  let query = `
    SELECT p.id, p.name, p.identifier, p.color,
      COUNT(i.id) as total,
      SUM(CASE WHEN s.state_group = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN s.state_group = 'started' THEN 1 ELSE 0 END) as started,
      SUM(CASE WHEN s.state_group IN ('backlog', 'unstarted') THEN 1 ELSE 0 END) as backlog,
      SUM(CASE WHEN s.state_group = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM projects p
    LEFT JOIN issues i ON p.id = i.project_id
    LEFT JOIN states s ON i.state_id = s.id
    WHERE p.org_id = ?
  `;
  const params = [req.org.id];

  if (projectId) {
    query += ' AND p.id = ?';
    params.push(projectId);
  }

  query += ' GROUP BY p.id ORDER BY total DESC';

  const workItems = db.prepare(query).all(...params);

  const html = `
    <table class="w-full">
      <thead class="bg-gray-50">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Completed</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">In Progress</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Backlog</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Progress</th>
        </tr>
      </thead>
      <tbody class="divide-y">
        ${workItems.map(w => `
          <tr>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded" style="background: ${w.color}"></div>
                <span class="font-medium">${w.name}</span>
                <span class="text-xs text-gray-400">${w.identifier}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-right font-medium">${w.total}</td>
            <td class="px-4 py-3 text-right text-green-600">${w.completed}</td>
            <td class="px-4 py-3 text-right text-blue-600">${w.started}</td>
            <td class="px-4 py-3 text-right text-gray-500">${w.backlog}</td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                <div class="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div class="h-full bg-green-500 rounded-full" style="width: ${w.total ? Math.round(w.completed / w.total * 100) : 0}%"></div>
                </div>
                <span class="text-sm text-gray-600">${w.total ? Math.round(w.completed / w.total * 100) : 0}%</span>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  res.send(html);
});
