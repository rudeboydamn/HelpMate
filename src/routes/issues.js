import { Router } from 'express';
import { supabase } from '../db/supabase.js';

export const issueRoutes = Router();

// List issues
issueRoutes.get('/', async (req, res) => {
  const { state_group, priority, project_id, search } = req.query;

  let query = supabase
    .from('issues')
    .select(`
      *,
      states(name, color, state_group),
      projects(name, color, identifier)
    `)
    .eq('org_id', req.org.id);

  if (state_group) {
    query = query.eq('states.state_group', state_group);
  }
  if (priority) {
    query = query.eq('priority', priority);
  }
  if (project_id) {
    query = query.eq('project_id', project_id);
  }
  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data: issues } = await query.order('updated_at', { ascending: false });

  // Get assignees and labels for each issue
  if (issues) {
    for (const issue of issues) {
      issue.state_name = issue.states?.name;
      issue.state_color = issue.states?.color;
      issue.state_group = issue.states?.state_group;
      issue.project_name = issue.projects?.name;
      issue.project_color = issue.projects?.color;
      issue.identifier = issue.projects?.identifier;

      const { data: assignees } = await supabase
        .from('issue_assignees')
        .select('users(id, name)')
        .eq('issue_id', issue.id);
      issue.assignees = assignees?.map(a => a.users) || [];

      const { data: labels } = await supabase
        .from('issue_labels')
        .select('labels(id, name, color)')
        .eq('issue_id', issue.id);
      issue.labels = labels?.map(l => l.labels) || [];
    }
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, identifier')
    .eq('org_id', req.org.id);

  res.render('issues/list', { issues: issues || [], projects: projects || [], filters: { state_group, priority, project_id, search } });
});

// Issue list partial (for HTMX filtering)
issueRoutes.get('/list', async (req, res) => {
  const { status, priority, project, search } = req.query;
  
  let query = supabase
    .from('issues')
    .select('*, projects(name, color)')
    .eq('org_id', req.org.id);

  if (priority) query = query.eq('priority', priority);
  if (project) query = query.eq('project_id', project);
  if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);

  const { data: issues } = await query.order('updated_at', { ascending: false });

  const priorityColors = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700'
  };

  const html = (issues || []).length === 0 
    ? `<div class="text-center py-12 text-gray-500">No issues found</div>`
    : (issues || []).map(issue => `
      <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition cursor-pointer"
           hx-get="/issues/${issue.id}"
           hx-target="#modal-container"
           hx-swap="innerHTML">
        <div class="flex items-start gap-3">
          <span class="text-xl">📋</span>
          <div>
            <h3 class="font-medium text-gray-900">${escapeHtml(issue.name)}</h3>
            <div class="flex items-center gap-2 mt-2 flex-wrap">
              <span class="text-xs px-2 py-0.5 rounded ${priorityColors[issue.priority] || priorityColors.medium}">${issue.priority || 'medium'}</span>
              ${issue.projects?.name ? `<span class="text-xs px-2 py-0.5 rounded" style="background-color: ${issue.projects.color}20; color: ${issue.projects.color}">${escapeHtml(issue.projects.name)}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `).join('');

  res.send(html);
});

// Create issue modal
issueRoutes.get('/create-modal', async (req, res) => {
  const { columnId, projectId } = req.query;
  
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('org_id', req.org.id);

  const { data: members } = await supabase
    .from('users')
    .select('id, name')
    .eq('org_id', req.org.id)
    .eq('is_active', true);

  res.send(`
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
         id="create-issue-modal"
         hx-on:click="if(event.target === this) this.remove()">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" hx-on:click="event.stopPropagation()">
        <div class="flex items-center justify-between p-4 border-b">
          <h2 class="text-lg font-semibold">Create Issue</h2>
          <button onclick="this.closest('#create-issue-modal').remove()" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form hx-post="/issues/create" hx-target="#issue-list" hx-swap="afterbegin" hx-on::after-request="document.getElementById('create-issue-modal')?.remove()">
          <div class="p-4 space-y-4">
            <input type="hidden" name="columnId" value="${columnId || ''}">
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input type="text" name="title" required autofocus
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea name="description" rows="3"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"></textarea>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Project *</label>
                <select name="projectId" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                  ${projects.map(p => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select name="issueType" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                  <option value="task">📋 Task</option>
                  <option value="bug">🐛 Bug</option>
                  <option value="feature">✨ Feature</option>
                  <option value="support">💬 Support</option>
                </select>
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select name="priority" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                  <option value="low">Low</option>
                  <option value="medium" selected>Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
                <select name="assigneeId" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                  <option value="">Unassigned</option>
                  ${members.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}
                </select>
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" name="dueDate" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
            </div>
          </div>
          
          <div class="flex justify-end gap-3 p-4 border-t bg-gray-50 rounded-b-xl">
            <button type="button" onclick="this.closest('#create-issue-modal').remove()"
              class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition">
              Cancel
            </button>
            <button type="submit"
              class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">
              Create Issue
            </button>
          </div>
        </form>
      </div>
    </div>
  `);
});

// Create issue
issueRoutes.post('/create', async (req, res) => {
  const { title, description, projectId, issueType, priority, assigneeId, dueDate } = req.body;

  // Verify project belongs to org
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', req.org.id)
    .single();

  if (!project) {
    return res.status(400).send('<div class="text-red-500">Invalid project</div>');
  }

  // Get default state for the project
  const { data: defaultState } = await supabase
    .from('states')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_default', true)
    .single();

  // Get next sequence ID
  const { count } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('project_id', projectId);

  const { data: issue, error } = await supabase
    .from('issues')
    .insert({
      name: title,
      description: description || null,
      description_html: description ? `<p>${description}</p>` : null,
      priority: priority || 'medium',
      state_id: defaultState?.id || null,
      project_id: projectId,
      org_id: req.org.id,
      created_by: req.user.id,
      sequence_id: (count || 0) + 1,
      target_date: dueDate || null
    })
    .select()
    .single();

  if (error) {
    console.error('Issue creation error:', error);
    return res.status(500).send('<div class="text-red-500">Failed to create issue</div>');
  }

  // Add assignee if specified
  if (assigneeId) {
    await supabase.from('issue_assignees').insert({ issue_id: issue.id, user_id: assigneeId });
  }

  const priorityColors = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700'
  };

  res.send(`
    <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition cursor-pointer animate-fadeIn"
         hx-get="/issues/${issue.id}"
         hx-target="#modal-container"
         hx-swap="innerHTML">
      <div class="flex items-start gap-3">
        <span class="text-xl">📋</span>
        <div>
          <h3 class="font-medium text-gray-900">${escapeHtml(title)}</h3>
          <div class="flex items-center gap-2 mt-2">
            <span class="text-xs px-2 py-0.5 rounded ${priorityColors[priority || 'medium']}">${priority || 'medium'}</span>
          </div>
        </div>
      </div>
    </div>
  `);
});

// View issue detail
issueRoutes.get('/:id', async (req, res) => {
  const { data: issue } = await supabase
    .from('issues')
    .select(`
      *,
      projects(name),
      states(name, color, state_group)
    `)
    .eq('id', req.params.id)
    .eq('org_id', req.org.id)
    .single();

  if (!issue) {
    return res.status(404).send('<div class="p-4 text-red-500">Issue not found</div>');
  }

  issue.project_name = issue.projects?.name;
  issue.state_name = issue.states?.name;

  // Get creator
  const { data: reporter } = await supabase.from('users').select('name').eq('id', issue.created_by).single();
  issue.reporter_name = reporter?.name;

  // Get assignees
  const { data: assigneeData } = await supabase
    .from('issue_assignees')
    .select('users(name)')
    .eq('issue_id', issue.id);
  issue.assignee_name = assigneeData?.[0]?.users?.name;

  const { data: comments } = await supabase
    .from('issue_comments')
    .select('*, users(name)')
    .eq('issue_id', issue.id)
    .order('created_at', { ascending: true });

  const { data: members } = await supabase
    .from('users')
    .select('id, name')
    .eq('org_id', req.org.id)
    .eq('is_active', true);

  const priorityColors = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700'
  };

  const statusColors = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-purple-100 text-purple-700',
    review: 'bg-yellow-100 text-yellow-700',
    done: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-600'
  };

  res.send(`
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
         id="issue-detail-modal"
         hx-on:click="if(event.target === this) this.remove()">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div class="flex items-center justify-between p-4 border-b">
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-gray-400">#${issue.id.slice(0, 8)}</span>
            <span class="text-xs px-2 py-0.5 rounded ${statusColors[issue.status]}">${issue.status.replace('_', ' ')}</span>
          </div>
          <button onclick="this.closest('#issue-detail-modal').remove()" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <h2 class="text-xl font-semibold">${escapeHtml(issue.title)}</h2>
          
          <div class="flex flex-wrap gap-4 text-sm">
            <div>
              <span class="text-gray-500">Priority:</span>
              <span class="ml-1 px-2 py-0.5 rounded ${priorityColors[issue.priority]}">${issue.priority}</span>
            </div>
            <div>
              <span class="text-gray-500">Type:</span>
              <span class="ml-1">${issue.issue_type}</span>
            </div>
            <div>
              <span class="text-gray-500">Project:</span>
              <span class="ml-1">${escapeHtml(issue.project_name)}</span>
            </div>
            ${issue.due_date ? `<div><span class="text-gray-500">Due:</span> <span class="ml-1">${issue.due_date}</span></div>` : ''}
          </div>
          
          ${issue.description ? `
            <div class="bg-gray-50 rounded-lg p-4">
              <h4 class="text-sm font-medium text-gray-700 mb-2">Description</h4>
              <p class="text-gray-600 whitespace-pre-wrap">${escapeHtml(issue.description)}</p>
            </div>
          ` : ''}
          
          <div class="flex gap-4 text-sm text-gray-500">
            <div>Reported by: ${escapeHtml(issue.reporter_name)}</div>
            ${issue.assignee_name ? `<div>Assigned to: ${escapeHtml(issue.assignee_name)}</div>` : ''}
          </div>
          
          <!-- Status Update -->
          <div class="border-t pt-4">
            <h4 class="text-sm font-medium text-gray-700 mb-2">Update Status</h4>
            <div class="flex gap-2 flex-wrap" id="status-buttons">
              ${['open', 'in_progress', 'review', 'done', 'closed'].map(s => `
                <button hx-post="/issues/${issue.id}/status" hx-vals='{"status":"${s}"}' hx-target="#status-buttons" hx-swap="outerHTML"
                  class="px-3 py-1 text-sm rounded-lg transition ${s === issue.status ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}">
                  ${s.replace('_', ' ')}
                </button>
              `).join('')}
            </div>
          </div>
          
          <!-- Comments -->
          <div class="border-t pt-4">
            <h4 class="text-sm font-medium text-gray-700 mb-3">Comments (${comments.length})</h4>
            <div id="comments-list" class="space-y-3">
              ${comments.map(c => `
                <div class="bg-gray-50 rounded-lg p-3">
                  <div class="flex items-center justify-between mb-1">
                    <span class="font-medium text-sm">${escapeHtml(c.user_name)}</span>
                    <span class="text-xs text-gray-400">${new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                  <p class="text-sm text-gray-600">${escapeHtml(c.content)}</p>
                </div>
              `).join('') || '<p class="text-gray-400 text-sm">No comments yet</p>'}
            </div>
            
            <form hx-post="/issues/${issue.id}/comment" hx-target="#comments-list" hx-swap="beforeend" hx-on::after-request="this.reset()" class="mt-3">
              <textarea name="content" placeholder="Add a comment..." required rows="2"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"></textarea>
              <button type="submit" class="mt-2 px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition">
                Add Comment
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `);
});

// Update issue status
issueRoutes.post('/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['open', 'in_progress', 'review', 'done', 'closed'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).send('Invalid status');
  }

  await supabase
    .from('issues')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('org_id', req.org.id);

  res.send(`
    <div class="flex gap-2 flex-wrap" id="status-buttons">
      ${validStatuses.map(s => `
        <button hx-post="/issues/${req.params.id}/status" hx-vals='{"status":"${s}"}' hx-target="#status-buttons" hx-swap="outerHTML"
          class="px-3 py-1 text-sm rounded-lg transition ${s === status ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}">
          ${s.replace('_', ' ')}
        </button>
      `).join('')}
    </div>
  `);
});

// Add comment
issueRoutes.post('/:id/comment', async (req, res) => {
  const { content } = req.body;
  
  if (!content?.trim()) {
    return res.send('');
  }

  await supabase
    .from('issue_comments')
    .insert({
      content: content.trim(),
      content_html: `<p>${escapeHtml(content.trim())}</p>`,
      issue_id: req.params.id,
      user_id: req.user.id
    });

  res.send(`
    <div class="bg-gray-50 rounded-lg p-3 animate-fadeIn">
      <div class="flex items-center justify-between mb-1">
        <span class="font-medium text-sm">${escapeHtml(req.user.name)}</span>
        <span class="text-xs text-gray-400">Just now</span>
      </div>
      <p class="text-sm text-gray-600">${escapeHtml(content)}</p>
    </div>
  `);
});

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, char => map[char]);
}
