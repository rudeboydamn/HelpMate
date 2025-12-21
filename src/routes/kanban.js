import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../db/supabase.js';

export const kanbanRoutes = Router();

// Get kanban board
kanbanRoutes.get('/:projectId?', (req, res) => {
  const projectId = req.params.projectId;
  
  // Get project or first project
  let project;
  if (projectId) {
    project = db.prepare(`
      SELECT * FROM projects WHERE id = ? AND org_id = ?
    `).get(projectId, req.org.id);
  } else {
    project = db.prepare(`
      SELECT * FROM projects WHERE org_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(req.org.id);
  }

  if (!project) {
    return res.render('kanban/empty');
  }

  // Get board
  let board = db.prepare(`
    SELECT * FROM boards WHERE project_id = ? LIMIT 1
  `).get(project.id);

  if (!board) {
    // Create default board
    const boardId = uuidv4();
    db.prepare(`INSERT INTO boards (id, name, project_id) VALUES (?, 'Main Board', ?)`).run(boardId, project.id);
    board = { id: boardId, name: 'Main Board', project_id: project.id };
    
    // Create default columns
    const defaultCols = [
      { name: 'Backlog', color: '#94a3b8' },
      { name: 'To Do', color: '#f59e0b' },
      { name: 'In Progress', color: '#3b82f6' },
      { name: 'Done', color: '#22c55e' }
    ];
    defaultCols.forEach((col, idx) => {
      db.prepare(`INSERT INTO columns (id, name, position, color, board_id) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), col.name, idx, col.color, boardId);
    });
  }

  // Get columns with issues
  const columns = db.prepare(`
    SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC
  `).all(board.id);

  const columnsWithIssues = columns.map(col => {
    const issues = db.prepare(`
      SELECT i.*, u.name as assignee_name, u.avatar_url as assignee_avatar
      FROM issues i
      LEFT JOIN users u ON i.assignee_id = u.id
      WHERE i.column_id = ?
      ORDER BY i.position ASC
    `).all(col.id);
    return { ...col, issues };
  });

  // Get all projects for selector
  const projects = db.prepare(`
    SELECT id, name, color FROM projects WHERE org_id = ? ORDER BY name
  `).all(req.org.id);

  // Get team members for assignment
  const members = db.prepare(`
    SELECT id, name, avatar_url FROM users WHERE org_id = ? AND is_active = 1
  `).all(req.org.id);

  res.render('kanban/board', { 
    project, 
    board, 
    columns: columnsWithIssues, 
    projects,
    members 
  });
});

// Move issue to column (HTMX drag-drop)
kanbanRoutes.post('/move-issue', (req, res) => {
  const { issueId, columnId, position } = req.body;

  // Verify issue belongs to org
  const issue = db.prepare(`
    SELECT i.* FROM issues i
    JOIN projects p ON i.project_id = p.id
    WHERE i.id = ? AND p.org_id = ?
  `).get(issueId, req.org.id);

  if (!issue) {
    return res.status(404).send('<div class="text-red-500">Issue not found</div>');
  }

  // Update issue column and position
  db.prepare(`
    UPDATE issues SET column_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(columnId, parseInt(position) || 0, issueId);

  // Update status based on column
  const column = db.prepare('SELECT name FROM columns WHERE id = ?').get(columnId);
  if (column) {
    const statusMap = {
      'Backlog': 'open',
      'To Do': 'open',
      'In Progress': 'in_progress',
      'Review': 'review',
      'Done': 'done'
    };
    const newStatus = statusMap[column.name] || 'open';
    db.prepare('UPDATE issues SET status = ? WHERE id = ?').run(newStatus, issueId);
  }

  res.send(''); // Empty response for HTMX
});

// Add new column
kanbanRoutes.post('/add-column', (req, res) => {
  const { boardId, name, color } = req.body;

  // Verify board belongs to org
  const board = db.prepare(`
    SELECT b.* FROM boards b
    JOIN projects p ON b.project_id = p.id
    WHERE b.id = ? AND p.org_id = ?
  `).get(boardId, req.org.id);

  if (!board) {
    return res.status(404).send('<div class="text-red-500">Board not found</div>');
  }

  // Get max position
  const maxPos = db.prepare('SELECT MAX(position) as max FROM columns WHERE board_id = ?').get(boardId);
  const position = (maxPos?.max ?? -1) + 1;

  const columnId = uuidv4();
  db.prepare(`
    INSERT INTO columns (id, name, position, color, board_id) VALUES (?, ?, ?, ?, ?)
  `).run(columnId, name, position, color || '#e5e7eb', boardId);

  // Return new column HTML
  res.send(`
    <div class="kanban-column bg-gray-50 rounded-xl p-4 min-w-[300px] max-w-[300px]" data-column-id="${columnId}">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full" style="background-color: ${color || '#e5e7eb'}"></div>
          <h3 class="font-semibold text-gray-700">${name}</h3>
          <span class="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">0</span>
        </div>
        <button class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
          </svg>
        </button>
      </div>
      <div class="kanban-issues space-y-3 min-h-[100px]" 
           data-column-id="${columnId}"
           hx-post="/kanban/move-issue"
           hx-trigger="drop"
           hx-swap="none">
      </div>
      <button hx-get="/issues/create-modal?columnId=${columnId}" 
              hx-target="#modal-container"
              class="w-full mt-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm flex items-center justify-center gap-1">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Add Issue
      </button>
    </div>
  `);
});

// Quick add issue to column
kanbanRoutes.post('/quick-add/:columnId', (req, res) => {
  const { columnId } = req.params;
  const { title } = req.body;

  if (!title?.trim()) {
    return res.send('');
  }

  // Get column and verify org
  const column = db.prepare(`
    SELECT c.*, b.project_id FROM columns c
    JOIN boards b ON c.board_id = b.id
    JOIN projects p ON b.project_id = p.id
    WHERE c.id = ? AND p.org_id = ?
  `).get(columnId, req.org.id);

  if (!column) {
    return res.status(404).send('Column not found');
  }

  // Get max position
  const maxPos = db.prepare('SELECT MAX(position) as max FROM issues WHERE column_id = ?').get(columnId);
  const position = (maxPos?.max ?? -1) + 1;

  const issueId = uuidv4();
  db.prepare(`
    INSERT INTO issues (id, title, status, column_id, project_id, reporter_id, org_id, position)
    VALUES (?, ?, 'open', ?, ?, ?, ?, ?)
  `).run(issueId, title.trim(), columnId, column.project_id, req.user.id, req.org.id, position);

  // Return issue card HTML
  res.send(`
    <div class="issue-card bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-move hover:shadow-md transition"
         draggable="true"
         data-issue-id="${issueId}">
      <div class="flex items-start justify-between gap-2">
        <h4 class="text-sm font-medium text-gray-800">${title}</h4>
      </div>
      <div class="flex items-center gap-2 mt-2">
        <span class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">Task</span>
        <span class="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">Medium</span>
      </div>
    </div>
  `);
});
