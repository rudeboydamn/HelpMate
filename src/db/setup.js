import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use /tmp for Vercel serverless, local data dir otherwise
const isVercel = process.env.VERCEL === '1';
const dataDir = isVercel ? '/tmp/helpmate-data' : join(__dirname, '../../data');
const uploadsDir = isVercel ? '/tmp/uploads' : join(__dirname, '../../uploads');

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const dbPath = join(dataDir, 'helpmate.db');

const globalScope = globalThis;
const DB_KEY = Symbol.for('helpmate.db');
const INIT_KEY = Symbol.for('helpmate.db.init');

if (!globalScope[DB_KEY]) {
  globalScope[DB_KEY] = new Database(dbPath);
}

export const db = globalScope[DB_KEY];

export async function initDatabase() {
  if (globalScope[INIT_KEY]) {
    return globalScope[INIT_KEY];
  }

  globalScope[INIT_KEY] = (async () => {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // =====================
  // CORE TABLES
  // =====================

  // Organizations (Workspaces/Tenants)
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      logo_url TEXT,
      plan TEXT DEFAULT 'free' CHECK(plan IN ('free', 'pro', 'whitelabel')),
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      max_users INTEGER DEFAULT 5,
      timezone TEXT DEFAULT 'UTC',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Users
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      role TEXT DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member')),
      org_id TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      last_login_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES organizations(id)
    )
  `);

  // Projects
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      identifier TEXT NOT NULL,
      description TEXT,
      description_html TEXT,
      cover_image TEXT,
      icon TEXT DEFAULT '📁',
      color TEXT DEFAULT '#6366f1',
      network INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      org_id TEXT NOT NULL,
      lead_id TEXT,
      default_assignee_id TEXT,
      created_by TEXT NOT NULL,
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES organizations(id),
      FOREIGN KEY (lead_id) REFERENCES users(id),
      FOREIGN KEY (default_assignee_id) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Project Members
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_members (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'member', 'guest')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(project_id, user_id)
    )
  `);

  // =====================
  // STATES & LABELS
  // =====================

  // States (Workflow States)
  db.exec(`
    CREATE TABLE IF NOT EXISTS states (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6b7280',
      state_group TEXT NOT NULL CHECK(state_group IN ('backlog', 'unstarted', 'started', 'completed', 'cancelled')),
      position INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      project_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Labels
  db.exec(`
    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6b7280',
      description TEXT,
      parent_id TEXT,
      project_id TEXT,
      org_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES labels(id) ON DELETE SET NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (org_id) REFERENCES organizations(id)
    )
  `);

  // =====================
  // ISSUES (Enhanced)
  // =====================

  // Issues
  db.exec(`
    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      sequence_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      description_html TEXT,
      priority TEXT DEFAULT 'none' CHECK(priority IN ('none', 'low', 'medium', 'high', 'urgent')),
      state_id TEXT,
      sort_order REAL DEFAULT 65535,
      estimate_point INTEGER,
      start_date DATE,
      target_date DATE,
      completed_at DATETIME,
      archived_at DATETIME,
      is_draft INTEGER DEFAULT 0,
      parent_id TEXT,
      project_id TEXT NOT NULL,
      cycle_id TEXT,
      org_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      updated_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE SET NULL,
      FOREIGN KEY (parent_id) REFERENCES issues(id) ON DELETE SET NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE SET NULL,
      FOREIGN KEY (org_id) REFERENCES organizations(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )
  `);

  // Issue Assignees (M2M)
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_assignees (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(issue_id, user_id)
    )
  `);

  // Issue Labels (M2M)
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_labels (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      label_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE,
      UNIQUE(issue_id, label_id)
    )
  `);

  // Issue Relations
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_relations (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      related_issue_id TEXT NOT NULL,
      relation_type TEXT NOT NULL CHECK(relation_type IN ('blocks', 'blocked_by', 'relates_to', 'duplicates', 'duplicate_of')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (related_issue_id) REFERENCES issues(id) ON DELETE CASCADE
    )
  `);

  // Issue Links
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_links (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      title TEXT,
      url TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Issue Attachments
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_attachments (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      file_type TEXT,
      uploaded_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `);

  // Issue Comments
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_comments (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      content TEXT NOT NULL,
      content_html TEXT,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Issue Reactions
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_reactions (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reaction TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(issue_id, user_id, reaction)
    )
  `);

  // Issue Activity
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_activity (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      field TEXT,
      old_value TEXT,
      new_value TEXT,
      action TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // =====================
  // CYCLES (Sprints)
  // =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS cycles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      start_date DATE,
      end_date DATE,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'current', 'upcoming', 'completed')),
      owned_by TEXT NOT NULL,
      project_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      progress_snapshot TEXT DEFAULT '{}',
      sort_order REAL DEFAULT 65535,
      is_favorite INTEGER DEFAULT 0,
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owned_by) REFERENCES users(id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (org_id) REFERENCES organizations(id)
    )
  `);

  // Cycle Issues (M2M)
  db.exec(`
    CREATE TABLE IF NOT EXISTS cycle_issues (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      UNIQUE(cycle_id, issue_id)
    )
  `);

  // Cycle Progress (for burn-down charts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS cycle_progress (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      date DATE NOT NULL,
      total_issues INTEGER DEFAULT 0,
      completed_issues INTEGER DEFAULT 0,
      started_issues INTEGER DEFAULT 0,
      backlog_issues INTEGER DEFAULT 0,
      cancelled_issues INTEGER DEFAULT 0,
      scope_change INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE,
      UNIQUE(cycle_id, date)
    )
  `);

  // =====================
  // MODULES
  // =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      description_html TEXT,
      status TEXT DEFAULT 'planned' CHECK(status IN ('backlog', 'planned', 'in-progress', 'paused', 'completed', 'cancelled')),
      start_date DATE,
      target_date DATE,
      lead_id TEXT,
      project_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      sort_order REAL DEFAULT 65535,
      is_favorite INTEGER DEFAULT 0,
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES users(id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (org_id) REFERENCES organizations(id)
    )
  `);

  // Module Members
  db.exec(`
    CREATE TABLE IF NOT EXISTS module_members (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(module_id, user_id)
    )
  `);

  // Module Issues (M2M)
  db.exec(`
    CREATE TABLE IF NOT EXISTS module_issues (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      UNIQUE(module_id, issue_id)
    )
  `);

  // Module Links
  db.exec(`
    CREATE TABLE IF NOT EXISTS module_links (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      title TEXT,
      url TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // =====================
  // VIEWS (Saved Filters)
  // =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS views (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      filters TEXT DEFAULT '{}',
      display_filters TEXT DEFAULT '{}',
      display_properties TEXT DEFAULT '{}',
      access TEXT DEFAULT 'private' CHECK(access IN ('private', 'public')),
      is_favorite INTEGER DEFAULT 0,
      is_locked INTEGER DEFAULT 0,
      project_id TEXT,
      org_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (org_id) REFERENCES organizations(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // =====================
  // PAGES (Documents)
  // =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      description_html TEXT DEFAULT '',
      color TEXT DEFAULT '#ffffff',
      icon TEXT,
      access TEXT DEFAULT 'private' CHECK(access IN ('private', 'public')),
      is_favorite INTEGER DEFAULT 0,
      is_locked INTEGER DEFAULT 0,
      project_id TEXT,
      org_id TEXT NOT NULL,
      owned_by TEXT NOT NULL,
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (org_id) REFERENCES organizations(id),
      FOREIGN KEY (owned_by) REFERENCES users(id)
    )
  `);

  // Page Labels (M2M)
  db.exec(`
    CREATE TABLE IF NOT EXISTS page_labels (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      label_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
      FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE,
      UNIQUE(page_id, label_id)
    )
  `);

  // =====================
  // DRIVE (File Storage)
  // =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS drive_files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      file_type TEXT,
      parent_folder_id TEXT,
      project_id TEXT,
      org_id TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_folder_id) REFERENCES drive_files(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
      FOREIGN KEY (org_id) REFERENCES organizations(id),
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `);

  // =====================
  // FAVORITES
  // =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('project', 'cycle', 'module', 'view', 'page', 'issue')),
      entity_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      project_id TEXT,
      org_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (org_id) REFERENCES organizations(id),
      UNIQUE(entity_type, entity_id, user_id)
    )
  `);

  // =====================
  // ESTIMATES
  // =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS estimates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      project_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS estimate_points (
      id TEXT PRIMARY KEY,
      estimate_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
    )
  `);

  // =====================
  // INSTANCE SETTINGS (God Mode)
  // =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS instance_settings (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      is_encrypted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Instance Admins
  db.exec(`
    CREATE TABLE IF NOT EXISTS instance_admins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // =====================
  // BILLING
  // =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      stripe_invoice_id TEXT,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'usd',
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES organizations(id)
    )
  `);

  // =====================
  // INDEXES
  // =====================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
    CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id);
    CREATE INDEX IF NOT EXISTS idx_issues_state ON issues(state_id);
    CREATE INDEX IF NOT EXISTS idx_issues_cycle ON issues(cycle_id);
    CREATE INDEX IF NOT EXISTS idx_issues_parent ON issues(parent_id);
    CREATE INDEX IF NOT EXISTS idx_issues_org ON issues(org_id);
    CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);
    CREATE INDEX IF NOT EXISTS idx_cycles_project ON cycles(project_id);
    CREATE INDEX IF NOT EXISTS idx_modules_project ON modules(project_id);
    CREATE INDEX IF NOT EXISTS idx_pages_project ON pages(project_id);
    CREATE INDEX IF NOT EXISTS idx_pages_org ON pages(org_id);
    CREATE INDEX IF NOT EXISTS idx_labels_project ON labels(project_id);
    CREATE INDEX IF NOT EXISTS idx_states_project ON states(project_id);
    CREATE INDEX IF NOT EXISTS idx_views_project ON views(project_id);
    CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
  `);

  // Seed demo data only if empty
  const hasOrg = db.prepare('SELECT COUNT(*) as count FROM organizations').get().count > 0;
  if (!hasOrg) {
    await seedDemoData();
    console.log('✅ Database initialized with full schema');
  } else {
    console.log('✅ Database schema ready (existing data preserved)');
  }
  })();

  return globalScope[INIT_KEY];
}

async function seedDemoData() {
  const orgId = uuidv4();
  const userId = uuidv4();
  const user2Id = uuidv4();
  const projectId = uuidv4();
  const project2Id = uuidv4();
  
  // Create demo org
  db.prepare(`
    INSERT INTO organizations (id, name, slug, plan, timezone) VALUES (?, ?, ?, ?, ?)
  `).run(orgId, 'Demo Company', 'demo', 'pro', 'America/New_York');

  // Create demo users
  const passwordHash = await bcrypt.hash('demo123', 10);
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, display_name, role, org_id) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, 'demo@helpmate.io', passwordHash, 'Alex Johnson', 'Alex', 'owner', orgId);
  
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, display_name, role, org_id) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(user2Id, 'sarah@helpmate.io', passwordHash, 'Sarah Chen', 'Sarah', 'admin', orgId);

  // Make first user instance admin
  db.prepare(`INSERT INTO instance_admins (id, user_id) VALUES (?, ?)`).run(uuidv4(), userId);

  // Create default instance settings
  const settings = [
    { key: 'instance_name', value: 'HelpMate' },
    { key: 'is_signup_enabled', value: 'true' },
    { key: 'is_email_verification_required', value: 'false' },
    { key: 'is_magic_login_enabled', value: 'false' },
  ];
  settings.forEach(s => {
    db.prepare(`INSERT INTO instance_settings (id, key, value) VALUES (?, ?, ?)`).run(uuidv4(), s.key, s.value);
  });

  // Create projects
  db.prepare(`
    INSERT INTO projects (id, name, identifier, description, icon, color, org_id, lead_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(projectId, 'Product Launch', 'PROD', 'Q1 2024 Product Launch', '🚀', '#6366f1', orgId, userId, userId);

  db.prepare(`
    INSERT INTO projects (id, name, identifier, description, icon, color, org_id, lead_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(project2Id, 'Mobile App', 'MOB', 'iOS and Android mobile application', '📱', '#10b981', orgId, user2Id, userId);

  // Add project members
  db.prepare(`INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`).run(uuidv4(), projectId, userId, 'admin');
  db.prepare(`INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`).run(uuidv4(), projectId, user2Id, 'member');
  db.prepare(`INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`).run(uuidv4(), project2Id, userId, 'admin');
  db.prepare(`INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`).run(uuidv4(), project2Id, user2Id, 'admin');

  // Create states for each project
  const stateGroups = [
    { name: 'Backlog', group: 'backlog', color: '#a3a3a3' },
    { name: 'Todo', group: 'unstarted', color: '#f59e0b' },
    { name: 'In Progress', group: 'started', color: '#3b82f6' },
    { name: 'In Review', group: 'started', color: '#8b5cf6' },
    { name: 'Done', group: 'completed', color: '#22c55e' },
    { name: 'Cancelled', group: 'cancelled', color: '#ef4444' },
  ];

  const stateIds = {};
  [projectId, project2Id].forEach(pid => {
    stateIds[pid] = {};
    stateGroups.forEach((s, idx) => {
      const stateId = uuidv4();
      stateIds[pid][s.group] = stateId;
      db.prepare(`INSERT INTO states (id, name, color, state_group, position, is_default, project_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(stateId, s.name, s.color, s.group, idx, idx === 1 ? 1 : 0, pid);
    });
  });

  // Create labels
  const labels = [
    { name: 'Bug', color: '#ef4444' },
    { name: 'Feature', color: '#8b5cf6' },
    { name: 'Enhancement', color: '#3b82f6' },
    { name: 'Documentation', color: '#f59e0b' },
    { name: 'High Priority', color: '#dc2626' },
    { name: 'Low Priority', color: '#6b7280' },
  ];
  const labelIds = [];
  labels.forEach(l => {
    const labelId = uuidv4();
    labelIds.push(labelId);
    db.prepare(`INSERT INTO labels (id, name, color, project_id, org_id) VALUES (?, ?, ?, ?, ?)`)
      .run(labelId, l.name, l.color, projectId, orgId);
  });

  // Create Cycles (Sprints)
  const cycleId1 = uuidv4();
  const cycleId2 = uuidv4();
  const today = new Date();
  const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const twoWeeksFromNow = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  const fourWeeksFromNow = new Date(today.getTime() + 28 * 24 * 60 * 60 * 1000);

  db.prepare(`
    INSERT INTO cycles (id, name, description, start_date, end_date, status, owned_by, project_id, org_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(cycleId1, 'Sprint 1 - Foundation', 'Set up core infrastructure and basic features', 
         twoWeeksAgo.toISOString().split('T')[0], today.toISOString().split('T')[0], 'current', userId, projectId, orgId);

  db.prepare(`
    INSERT INTO cycles (id, name, description, start_date, end_date, status, owned_by, project_id, org_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(cycleId2, 'Sprint 2 - Features', 'Build out main product features',
         twoWeeksFromNow.toISOString().split('T')[0], fourWeeksFromNow.toISOString().split('T')[0], 'upcoming', userId, projectId, orgId);

  // Create Modules
  const moduleId1 = uuidv4();
  const moduleId2 = uuidv4();
  db.prepare(`
    INSERT INTO modules (id, name, description, status, start_date, target_date, lead_id, project_id, org_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(moduleId1, 'User Authentication', 'Complete auth system with SSO', 'in-progress',
         today.toISOString().split('T')[0], fourWeeksFromNow.toISOString().split('T')[0], userId, projectId, orgId);

  db.prepare(`
    INSERT INTO modules (id, name, description, status, start_date, target_date, lead_id, project_id, org_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(moduleId2, 'Dashboard & Analytics', 'Build analytics dashboard', 'planned',
         twoWeeksFromNow.toISOString().split('T')[0], fourWeeksFromNow.toISOString().split('T')[0], user2Id, projectId, orgId);

  // Create demo issues
  const issues = [
    { name: 'Design landing page mockups', priority: 'high', state: 'started', seq: 1 },
    { name: 'Set up CI/CD pipeline with GitHub Actions', priority: 'medium', state: 'unstarted', seq: 2 },
    { name: 'Fix login button not responding on mobile Safari', priority: 'urgent', state: 'started', seq: 3 },
    { name: 'Add dark mode support across all components', priority: 'low', state: 'backlog', seq: 4 },
    { name: 'Implement user onboarding wizard', priority: 'high', state: 'started', seq: 5 },
    { name: 'Write API documentation for v1 endpoints', priority: 'medium', state: 'completed', seq: 6 },
    { name: 'Optimize database queries for dashboard', priority: 'medium', state: 'unstarted', seq: 7 },
    { name: 'Integrate customer feedback widget', priority: 'low', state: 'backlog', seq: 8 },
    { name: 'Add email notification preferences', priority: 'medium', state: 'backlog', seq: 9 },
    { name: 'Implement file upload with drag-and-drop', priority: 'high', state: 'unstarted', seq: 10 },
    { name: 'Create admin dashboard for user management', priority: 'high', state: 'started', seq: 11 },
    { name: 'Add search functionality with filters', priority: 'medium', state: 'backlog', seq: 12 },
  ];

  const issueIds = [];
  issues.forEach((issue) => {
    const issueId = uuidv4();
    issueIds.push(issueId);
    db.prepare(`
      INSERT INTO issues (id, sequence_id, name, description, description_html, priority, state_id, project_id, cycle_id, org_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(issueId, issue.seq, issue.name, `Description for: ${issue.name}`, `<p>Description for: ${issue.name}</p>`,
           issue.priority, stateIds[projectId][issue.state], projectId, issue.seq <= 6 ? cycleId1 : null, orgId, userId);
    
    // Add assignee
    if (issue.seq % 2 === 0) {
      db.prepare(`INSERT INTO issue_assignees (id, issue_id, user_id) VALUES (?, ?, ?)`).run(uuidv4(), issueId, user2Id);
    } else {
      db.prepare(`INSERT INTO issue_assignees (id, issue_id, user_id) VALUES (?, ?, ?)`).run(uuidv4(), issueId, userId);
    }

    // Add some labels
    if (issue.seq <= 3) {
      db.prepare(`INSERT INTO issue_labels (id, issue_id, label_id) VALUES (?, ?, ?)`).run(uuidv4(), issueId, labelIds[0]);
    }
    if (issue.priority === 'high' || issue.priority === 'urgent') {
      db.prepare(`INSERT INTO issue_labels (id, issue_id, label_id) VALUES (?, ?, ?)`).run(uuidv4(), issueId, labelIds[4]);
    }
  });

  // Add cycle issues
  issueIds.slice(0, 6).forEach(issueId => {
    db.prepare(`INSERT INTO cycle_issues (id, cycle_id, issue_id) VALUES (?, ?, ?)`).run(uuidv4(), cycleId1, issueId);
  });

  // Add module issues
  issueIds.slice(0, 4).forEach(issueId => {
    db.prepare(`INSERT INTO module_issues (id, module_id, issue_id) VALUES (?, ?, ?)`).run(uuidv4(), moduleId1, issueId);
  });
  issueIds.slice(4, 8).forEach(issueId => {
    db.prepare(`INSERT INTO module_issues (id, module_id, issue_id) VALUES (?, ?, ?)`).run(uuidv4(), moduleId2, issueId);
  });

  // Add sub-issue relationship
  db.prepare(`UPDATE issues SET parent_id = ? WHERE id = ?`).run(issueIds[0], issueIds[3]);

  // Add issue relation
  db.prepare(`INSERT INTO issue_relations (id, issue_id, related_issue_id, relation_type) VALUES (?, ?, ?, ?)`)
    .run(uuidv4(), issueIds[2], issueIds[0], 'blocks');

  // Add some comments
  db.prepare(`INSERT INTO issue_comments (id, issue_id, content, content_html, user_id) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), issueIds[0], 'Starting work on this today!', '<p>Starting work on this today!</p>', userId);
  db.prepare(`INSERT INTO issue_comments (id, issue_id, content, content_html, user_id) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), issueIds[0], 'Looking good! Let me know if you need design assets.', '<p>Looking good! Let me know if you need design assets.</p>', user2Id);

  // Create Views
  db.prepare(`
    INSERT INTO views (id, name, description, filters, display_filters, access, project_id, org_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), 'My Open Issues', 'All open issues assigned to me', 
         JSON.stringify({ assignee: [userId], state_group: ['backlog', 'unstarted', 'started'] }),
         JSON.stringify({ layout: 'list', group_by: 'state' }), 'private', projectId, orgId, userId);

  db.prepare(`
    INSERT INTO views (id, name, description, filters, display_filters, access, project_id, org_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), 'High Priority', 'All high and urgent priority issues',
         JSON.stringify({ priority: ['high', 'urgent'] }),
         JSON.stringify({ layout: 'kanban', group_by: 'priority' }), 'public', projectId, orgId, userId);

  // Create Pages
  db.prepare(`
    INSERT INTO pages (id, name, description, description_html, icon, access, project_id, org_id, owned_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), 'Product Requirements', 
         'Core product requirements and specifications',
         '<h1>Product Requirements</h1><h2>Overview</h2><p>This document outlines the core requirements for the product launch.</p><h2>Features</h2><ul><li>User authentication with SSO</li><li>Dashboard with analytics</li><li>Issue tracking system</li></ul>',
         '📋', 'public', projectId, orgId, userId);

  db.prepare(`
    INSERT INTO pages (id, name, description, description_html, icon, access, project_id, org_id, owned_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), 'Meeting Notes - Sprint Planning',
         'Notes from sprint planning meeting',
         '<h1>Sprint Planning - Dec 2024</h1><p>Attendees: Alex, Sarah</p><h2>Goals</h2><ul><li>Complete authentication module</li><li>Start dashboard development</li></ul><h2>Action Items</h2><ol><li>Alex: Finish login flow</li><li>Sarah: Design dashboard mockups</li></ol>',
         '📝', 'private', projectId, orgId, user2Id);

  // Seed cycle progress data for burn-down chart
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const completed = Math.floor((14 - i) * 0.4);
    const started = Math.min(3, Math.floor((14 - i) * 0.3));
    db.prepare(`
      INSERT INTO cycle_progress (id, cycle_id, date, total_issues, completed_issues, started_issues, backlog_issues)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), cycleId1, date.toISOString().split('T')[0], 6, completed, started, 6 - completed - started);
  }

  console.log('');
  console.log('✅ Demo data seeded with full features');
  console.log('');
  console.log('   📧 Login: demo@helpmate.io');
  console.log('   🔑 Password: demo123');
  console.log('');
  console.log('   Features loaded:');
  console.log('   • 2 Projects with states & labels');
  console.log('   • 2 Cycles (Sprints) with burn-down data');
  console.log('   • 2 Modules with issues');
  console.log('   • 12 Issues with assignees, labels, relations');
  console.log('   • 2 Saved Views');
  console.log('   • 2 Pages (Documents)');
  console.log('   • Instance admin configured (God Mode)');
  console.log('');
}
