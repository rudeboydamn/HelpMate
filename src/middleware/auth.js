import { supabase } from '../db/supabase.js';

export async function authMiddleware(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.headers['hx-request']) {
      res.setHeader('HX-Redirect', '/login');
      return res.status(401).send('');
    }
    return res.redirect('/login');
  }

  // Load user
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, name, avatar_url, role, org_id')
    .eq('id', req.session.userId)
    .eq('is_active', true)
    .single();

  if (error || !user) {
    req.session = null;
    return res.redirect('/login');
  }

  req.user = user;
  next();
}

export async function tenantMiddleware(req, res, next) {
  if (!req.user || !req.user.org_id) {
    return res.redirect('/login');
  }

  // Load organization
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name, slug, plan, max_users, stripe_customer_id, stripe_subscription_id')
    .eq('id', req.user.org_id)
    .single();

  if (error || !org) {
    req.session = null;
    return res.redirect('/login');
  }

  req.org = org;
  next();
}

export function adminMiddleware(req, res, next) {
  if (!req.user || !['owner', 'admin'].includes(req.user.role)) {
    if (req.headers['hx-request']) {
      return res.status(403).send(`
        <div class="p-4 bg-red-100 text-red-700 rounded">
          Access denied. Admin privileges required.
        </div>
      `);
    }
    return res.status(403).send('Access denied');
  }
  next();
}

export function ownerMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'owner') {
    if (req.headers['hx-request']) {
      return res.status(403).send(`
        <div class="p-4 bg-red-100 text-red-700 rounded">
          Access denied. Owner privileges required.
        </div>
      `);
    }
    return res.status(403).send('Access denied');
  }
  next();
}
