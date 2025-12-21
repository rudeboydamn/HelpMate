import { Router } from 'express';
import Stripe from 'stripe';
import { supabase } from '../db/supabase.js';
import { ownerMiddleware } from '../middleware/auth.js';

export const billingRoutes = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// Billing overview
billingRoutes.get('/', ownerMiddleware, (req, res) => {
  const org = req.org;
  const userCount = db.prepare(`
    SELECT COUNT(*) as count FROM users WHERE org_id = ? AND is_active = 1
  `).get(org.id).count;

  const invoices = db.prepare(`
    SELECT * FROM invoices WHERE org_id = ? ORDER BY created_at DESC LIMIT 10
  `).all(org.id);

  res.render('billing/index', { org, userCount, invoices });
});

// Pricing tiers display
billingRoutes.get('/pricing', (req, res) => {
  res.send(`
    <div class="grid md:grid-cols-3 gap-6 p-6">
      <!-- Free Tier -->
      <div class="bg-white rounded-xl border-2 border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900">Free</h3>
        <p class="text-gray-500 text-sm mt-1">For individuals & small teams</p>
        <div class="mt-4">
          <span class="text-4xl font-bold">$0</span>
          <span class="text-gray-500">/month</span>
        </div>
        <ul class="mt-6 space-y-3 text-sm">
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Up to 5 users
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Unlimited projects
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Kanban boards
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Issue tracking
          </li>
        </ul>
        <button class="w-full mt-6 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium" disabled>
          Current Plan
        </button>
      </div>

      <!-- Pro Tier -->
      <div class="bg-white rounded-xl border-2 border-indigo-500 p-6 relative">
        <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-xs font-medium px-3 py-1 rounded-full">
          POPULAR
        </div>
        <h3 class="text-lg font-semibold text-gray-900">Pro</h3>
        <p class="text-gray-500 text-sm mt-1">For growing teams</p>
        <div class="mt-4">
          <span class="text-4xl font-bold">$8</span>
          <span class="text-gray-500">/user/month</span>
        </div>
        <ul class="mt-6 space-y-3 text-sm">
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Unlimited users
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Everything in Free
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            <strong>Daily backups</strong>
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            <strong>SSO / SAML</strong>
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Priority support
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Advanced analytics
          </li>
        </ul>
        <button hx-post="/billing/subscribe/pro" hx-target="#billing-status"
          class="w-full mt-6 py-2 px-4 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition">
          Upgrade to Pro
        </button>
      </div>

      <!-- White-label Tier -->
      <div class="bg-white rounded-xl border-2 border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900">White-Label</h3>
        <p class="text-gray-500 text-sm mt-1">For enterprises & resellers</p>
        <div class="mt-4">
          <span class="text-4xl font-bold">Custom</span>
        </div>
        <ul class="mt-6 space-y-3 text-sm">
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Everything in Pro
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            <strong>Full source code</strong>
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            <strong>Remove branding</strong>
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Redistribution rights
          </li>
          <li class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Dedicated support
          </li>
        </ul>
        <a href="mailto:sales@helpmate.io" 
          class="block w-full mt-6 py-2 px-4 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition text-center">
          Contact Sales
        </a>
      </div>
    </div>
  `);
});

// Subscribe to Pro
billingRoutes.post('/subscribe/pro', ownerMiddleware, async (req, res) => {
  try {
    // Create or get Stripe customer
    let customerId = req.org.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.org.name,
        metadata: {
          org_id: req.org.id
        }
      });
      customerId = customer.id;
      db.prepare('UPDATE organizations SET stripe_customer_id = ? WHERE id = ?').run(customerId, req.org.id);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{
        price: process.env.STRIPE_PRO_PRICE_ID || 'price_placeholder',
        quantity: db.prepare('SELECT COUNT(*) as count FROM users WHERE org_id = ? AND is_active = 1').get(req.org.id).count
      }],
      success_url: `${process.env.APP_URL}/billing?success=true`,
      cancel_url: `${process.env.APP_URL}/billing?canceled=true`,
      metadata: {
        org_id: req.org.id
      }
    });

    res.setHeader('HX-Redirect', session.url);
    res.send('');
  } catch (error) {
    console.error('Stripe error:', error);
    res.send(`
      <div class="p-4 bg-red-100 text-red-700 rounded-lg">
        Unable to start checkout. Please configure Stripe keys in .env file.
        <br><br>
        <code class="text-xs">${error.message}</code>
      </div>
    `);
  }
});

// Manage subscription (Stripe portal)
billingRoutes.post('/manage', ownerMiddleware, async (req, res) => {
  try {
    if (!req.org.stripe_customer_id) {
      return res.send('<div class="text-amber-600">No active subscription to manage.</div>');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: req.org.stripe_customer_id,
      return_url: `${process.env.APP_URL}/billing`
    });

    res.setHeader('HX-Redirect', session.url);
    res.send('');
  } catch (error) {
    res.send(`<div class="text-red-600">Error: ${error.message}</div>`);
  }
});

// Webhook handler
billingRoutes.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const orgId = session.metadata.org_id;
      db.prepare(`
        UPDATE organizations SET plan = 'pro', stripe_subscription_id = ?, max_users = 9999
        WHERE id = ?
      `).run(session.subscription, orgId);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      db.prepare(`
        UPDATE organizations SET plan = 'free', stripe_subscription_id = NULL, max_users = 5
        WHERE stripe_subscription_id = ?
      `).run(subscription.id);
      break;
    }
  }

  res.json({ received: true });
});
