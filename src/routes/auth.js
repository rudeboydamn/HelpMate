import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../db/supabase.js';

export const authRoutes = Router();

// Login page
authRoutes.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('auth/login');
});

// Login handler - supports both password hash (legacy/demo) and Supabase Auth
authRoutes.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const renderError = () => `
    <div class="p-3 mb-4 bg-red-100 text-red-700 rounded-lg text-sm" role="alert">
      Invalid email or password. Please try again.
    </div>
    <form hx-post="/login" hx-target="#login-form" hx-swap="outerHTML">
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input type="email" name="email" value="${email || ''}" required
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
      </div>
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
        <input type="password" name="password" required
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
      </div>
      <button type="submit"
        class="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition font-medium">
        Sign In
      </button>
    </form>
  `;

  try {
    // Check if user exists in users table with password_hash
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, password_hash, name, org_id, is_active')
      .eq('email', email)
      .single();

    if (userError) {
      console.error('User lookup error:', userError);
      return res.send(renderError());
    }

    if (!user) {
      return res.send(renderError());
    }

    // Check if user is active
    if (user.is_active === false) {
      return res.send(renderError());
    }

    // Verify password with bcrypt
    if (user.password_hash) {
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (validPassword) {
        // Update last login
        await supabase
          .from('users')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', user.id);
        
        req.session.userId = user.id;
        res.setHeader('HX-Redirect', '/dashboard');
        return res.send('');
      }
    }

    return res.send(renderError());
  } catch (err) {
    console.error('Login error:', err);
    return res.send(renderError());
  }
});

// Register page
authRoutes.get('/register', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('auth/register');
});

// Register handler - uses Supabase Auth
authRoutes.post('/register', async (req, res) => {
  const { name, email, password, org_name } = req.body;

  // Hash the password for local storage
  const passwordHash = await bcrypt.hash(password, 10);

  // Create organization first
  const orgSlug = org_name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now().toString(36);
  
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name: org_name, slug: orgSlug, plan: 'free' })
    .select()
    .single();

  if (orgError) {
    console.error('Org creation error:', orgError);
    return res.send(`<div class="p-3 mb-4 bg-red-100 text-red-700 rounded-lg text-sm">Failed to create organization. Please try again.</div>`);
  }

  // Create user profile in users table with password hash
  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({ 
      email, 
      name,
      password_hash: passwordHash,
      role: 'owner', 
      org_id: org.id,
      is_active: true
    })
    .select()
    .single();

  if (userError) {
    console.error('User creation error:', userError);
    // Clean up the org if user creation fails
    await supabase.from('organizations').delete().eq('id', org.id);
    const errorMsg = userError.message.includes('duplicate') || userError.message.includes('unique')
      ? 'An account with this email already exists.'
      : 'Failed to create user profile. Please try again.';
    return res.send(`<div class="p-3 mb-4 bg-red-100 text-red-700 rounded-lg text-sm">${errorMsg}</div>`);
  }

  // Create default project
  const { data: project } = await supabase
    .from('projects')
    .insert({ name: 'My First Project', description: 'Welcome to HelpMate!', org_id: org.id, created_by: user.id })
    .select()
    .single();

  if (project) {
    // Create default states
    const states = [
      { name: 'Backlog', color: '#a3a3a3', state_group: 'backlog', position: 0, project_id: project.id },
      { name: 'Todo', color: '#f59e0b', state_group: 'unstarted', position: 1, is_default: true, project_id: project.id },
      { name: 'In Progress', color: '#3b82f6', state_group: 'started', position: 2, project_id: project.id },
      { name: 'Done', color: '#22c55e', state_group: 'completed', position: 3, project_id: project.id },
    ];
    await supabase.from('states').insert(states);

    // Create default board with columns
    const { data: board } = await supabase
      .from('boards')
      .insert({ name: 'Main Board', project_id: project.id })
      .select()
      .single();

    if (board) {
      const columns = [
        { name: 'Backlog', position: 0, color: '#94a3b8', board_id: board.id },
        { name: 'To Do', position: 1, color: '#f59e0b', board_id: board.id },
        { name: 'In Progress', position: 2, color: '#3b82f6', board_id: board.id },
        { name: 'Done', position: 3, color: '#22c55e', board_id: board.id }
      ];
      await supabase.from('columns').insert(columns);
    }

    // Add user as project member
    await supabase.from('project_members').insert({ project_id: project.id, user_id: user.id, role: 'admin' });
  }

  // Auto-login after signup
  req.session.userId = user.id;
  res.setHeader('HX-Redirect', '/dashboard');
  res.send('');
});

// Logout
authRoutes.post('/logout', (req, res) => {
  req.session = null;
  res.setHeader('HX-Redirect', '/');
  res.send('');
});

authRoutes.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});
