import { Router } from 'express';
import { supabase } from '../db/supabase.js';

export const dashboardRoutes = Router();

dashboardRoutes.get('/', async (req, res) => {
  // Get stats
  const { count: totalIssues } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('org_id', req.org.id);
  
  const { data: openIssuesData } = await supabase
    .from('issues')
    .select('id, states!inner(state_group)')
    .eq('org_id', req.org.id)
    .not('states.state_group', 'in', '("completed","cancelled")');
  const openIssues = openIssuesData?.length || 0;

  const { data: completedData } = await supabase
    .from('issues')
    .select('id, states!inner(state_group)')
    .eq('org_id', req.org.id)
    .eq('states.state_group', 'completed');
  const completedIssues = completedData?.length || 0;

  const { count: teamMembers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('org_id', req.org.id).eq('is_active', true);

  // Get recent issues with state and project info
  const { data: recentIssues } = await supabase
    .from('issues')
    .select(`
      *,
      states(name, color),
      projects(name, identifier)
    `)
    .eq('org_id', req.org.id)
    .order('updated_at', { ascending: false })
    .limit(5);

  // Get assignees for recent issues
  if (recentIssues) {
    for (const issue of recentIssues) {
      issue.state_name = issue.states?.name;
      issue.state_color = issue.states?.color;
      issue.project_name = issue.projects?.name;
      issue.identifier = issue.projects?.identifier;
      
      const { data: assignees } = await supabase
        .from('issue_assignees')
        .select('users(id, name)')
        .eq('issue_id', issue.id);
      issue.assignees = assignees?.map(a => a.users) || [];
    }
  }

  // Get projects
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('org_id', req.org.id)
    .order('created_at', { ascending: false });

  // Get current cycle
  const { data: currentCycle } = await supabase
    .from('cycles')
    .select('*, projects(name)')
    .eq('org_id', req.org.id)
    .eq('status', 'current')
    .single();

  if (currentCycle) {
    currentCycle.project_name = currentCycle.projects?.name;
  }

  res.render('dashboard/index', {
    stats: { totalIssues: totalIssues || 0, openIssues, completedIssues, teamMembers: teamMembers || 0 },
    recentIssues: recentIssues || [],
    projects: projects || [],
    currentCycle
  });
});

// Dashboard stats partial (for HTMX refresh)
dashboardRoutes.get('/stats', async (req, res) => {
  const { count: totalIssues } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('org_id', req.org.id);
  const { count: openIssues } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('org_id', req.org.id);
  const { count: completedIssues } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('org_id', req.org.id);
  const { count: teamMembers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('org_id', req.org.id).eq('is_active', true);
  
  const stats = {
    totalIssues: totalIssues || 0,
    openIssues: openIssues || 0,
    completedIssues: completedIssues || 0,
    teamMembers: teamMembers || 0
  };

  res.send(`
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Total Issues</p>
            <p class="text-3xl font-bold text-gray-900">${stats.totalIssues}</p>
          </div>
          <div class="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Open Issues</p>
            <p class="text-3xl font-bold text-amber-600">${stats.openIssues}</p>
          </div>
          <div class="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Completed</p>
            <p class="text-3xl font-bold text-green-600">${stats.completedIssues}</p>
          </div>
          <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Team Members</p>
            <p class="text-3xl font-bold text-purple-600">${stats.teamMembers}</p>
          </div>
          <div class="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  `);
});
