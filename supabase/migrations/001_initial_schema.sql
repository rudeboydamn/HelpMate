-- HelpMate Database Schema for Supabase
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/qmvciyhuvscwlkdnhcne/sql

-- =====================
-- CORE TABLES
-- =====================

-- Organizations (Workspaces/Tenants)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  plan TEXT DEFAULT 'free' CHECK(plan IN ('free', 'pro', 'whitelabel')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  max_users INTEGER DEFAULT 5,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member', 'guest')),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  timezone TEXT DEFAULT 'UTC',
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  identifier TEXT,
  description TEXT,
  icon TEXT DEFAULT '📋',
  color TEXT DEFAULT '#6366f1',
  cover_image TEXT,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES users(id),
  default_assignee_id UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project Members
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- States (Workflow states for issues)
CREATE TABLE IF NOT EXISTS states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  state_group TEXT DEFAULT 'backlog' CHECK(state_group IN ('backlog', 'unstarted', 'started', 'completed', 'cancelled')),
  position INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Labels
CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  description TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES labels(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- ISSUES
-- =====================

CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  description_html TEXT,
  priority TEXT DEFAULT 'none' CHECK(priority IN ('urgent', 'high', 'medium', 'low', 'none')),
  state_id UUID REFERENCES states(id),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES issues(id),
  cycle_id UUID,
  estimate_point INTEGER,
  start_date DATE,
  target_date DATE,
  completed_at TIMESTAMPTZ,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  sort_order REAL DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issue Assignees (M2M)
CREATE TABLE IF NOT EXISTS issue_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(issue_id, user_id)
);

-- Issue Labels (M2M)
CREATE TABLE IF NOT EXISTS issue_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
  label_id UUID REFERENCES labels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(issue_id, label_id)
);

-- Issue Comments
CREATE TABLE IF NOT EXISTS issue_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  content TEXT,
  content_html TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issue Relations
CREATE TABLE IF NOT EXISTS issue_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
  related_issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
  relation_type TEXT CHECK(relation_type IN ('blocks', 'blocked_by', 'relates_to', 'duplicate')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issue Activity Log
CREATE TABLE IF NOT EXISTS issue_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issue Attachments
CREATE TABLE IF NOT EXISTS issue_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- CYCLES (Sprints)
-- =====================

CREATE TABLE IF NOT EXISTS cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'current', 'upcoming', 'completed')),
  owned_by UUID REFERENCES users(id),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  view_props JSONB DEFAULT '{}',
  progress_snapshot JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key for issues.cycle_id
ALTER TABLE issues ADD CONSTRAINT fk_issues_cycle FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;

-- Cycle Issues (M2M)
CREATE TABLE IF NOT EXISTS cycle_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID REFERENCES cycles(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cycle_id, issue_id)
);

-- Cycle Progress (for burn-down charts)
CREATE TABLE IF NOT EXISTS cycle_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID REFERENCES cycles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_issues INTEGER DEFAULT 0,
  completed_issues INTEGER DEFAULT 0,
  started_issues INTEGER DEFAULT 0,
  backlog_issues INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- MODULES
-- =====================

CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  description_html TEXT,
  status TEXT DEFAULT 'backlog' CHECK(status IN ('backlog', 'planned', 'in-progress', 'paused', 'completed', 'cancelled')),
  start_date DATE,
  target_date DATE,
  lead_id UUID REFERENCES users(id),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  view_props JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Module Members (M2M)
CREATE TABLE IF NOT EXISTS module_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(module_id, user_id)
);

-- Module Issues (M2M)
CREATE TABLE IF NOT EXISTS module_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(module_id, issue_id)
);

-- Module Links
CREATE TABLE IF NOT EXISTS module_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- VIEWS
-- =====================

CREATE TABLE IF NOT EXISTS views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  filters JSONB DEFAULT '{}',
  display_filters JSONB DEFAULT '{}',
  display_properties JSONB DEFAULT '{}',
  access TEXT DEFAULT 'private' CHECK(access IN ('private', 'public')),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- PAGES (Documents)
-- =====================

CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  description_html TEXT,
  icon TEXT DEFAULT '📄',
  color TEXT,
  access TEXT DEFAULT 'private' CHECK(access IN ('private', 'public')),
  is_locked BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  owned_by UUID REFERENCES users(id),
  parent_id UUID REFERENCES pages(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Page Labels (M2M)
CREATE TABLE IF NOT EXISTS page_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  label_id UUID REFERENCES labels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page_id, label_id)
);

-- =====================
-- FAVORITES
-- =====================

CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('project', 'cycle', 'module', 'view', 'page', 'issue')),
  entity_id UUID NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, entity_type, entity_id)
);

-- =====================
-- BOARDS & COLUMNS (Kanban)
-- =====================

CREATE TABLE IF NOT EXISTS boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  color TEXT DEFAULT '#6366f1',
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- ESTIMATES
-- =====================

CREATE TABLE IF NOT EXISTS estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estimate_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID REFERENCES estimates(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- DRIVE (Files)
-- =====================

CREATE TABLE IF NOT EXISTS drive_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  folder_path TEXT DEFAULT '/',
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- INSTANCE SETTINGS (God Mode)
-- =====================

CREATE TABLE IF NOT EXISTS instance_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instance_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- =====================
-- INVOICES
-- =====================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT,
  amount INTEGER,
  currency TEXT DEFAULT 'usd',
  status TEXT,
  invoice_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- INDEXES
-- =====================

CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
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

-- =====================
-- ROW LEVEL SECURITY (RLS)
-- =====================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE states ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE views ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE instance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE instance_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Service role can access everything (for server-side operations)
CREATE POLICY "Service role full access" ON organizations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON project_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON states FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON labels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON issues FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON issue_assignees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON issue_labels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON issue_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON issue_relations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON issue_activity FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON issue_attachments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON cycles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON cycle_issues FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON cycle_progress FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON modules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON module_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON module_issues FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON module_links FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON views FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON pages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON page_labels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON favorites FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON boards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON columns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON estimates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON estimate_points FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON drive_files FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON instance_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON instance_admins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON invoices FOR ALL USING (true) WITH CHECK (true);
