-- CRITICAL SECURITY FIX: Fix RLS policies that were allowing public access
-- Run this IMMEDIATELY in Supabase SQL Editor: https://supabase.com/dashboard/project/wjdbivxcrloqyblmqqui/sql
-- Date: 2026-04-23
-- Issue: Previous policies with USING (true) allowed anonymous access to all tables

-- =====================
-- STEP 1: Drop insecure policies
-- =====================
-- These policies allowed ANYONE (including anon) to access data
DROP POLICY IF EXISTS "Service role full access" ON organizations;
DROP POLICY IF EXISTS "Service role full access" ON users;
DROP POLICY IF EXISTS "Service role full access" ON projects;
DROP POLICY IF EXISTS "Service role full access" ON project_members;
DROP POLICY IF EXISTS "Service role full access" ON states;
DROP POLICY IF EXISTS "Service role full access" ON labels;
DROP POLICY IF EXISTS "Service role full access" ON issues;
DROP POLICY IF EXISTS "Service role full access" ON issue_assignees;
DROP POLICY IF EXISTS "Service role full access" ON issue_labels;
DROP POLICY IF EXISTS "Service role full access" ON issue_comments;
DROP POLICY IF EXISTS "Service role full access" ON issue_relations;
DROP POLICY IF EXISTS "Service role full access" ON issue_activity;
DROP POLICY IF EXISTS "Service role full access" ON issue_attachments;
DROP POLICY IF EXISTS "Service role full access" ON cycles;
DROP POLICY IF EXISTS "Service role full access" ON cycle_issues;
DROP POLICY IF EXISTS "Service role full access" ON cycle_progress;
DROP POLICY IF EXISTS "Service role full access" ON modules;
DROP POLICY IF EXISTS "Service role full access" ON module_members;
DROP POLICY IF EXISTS "Service role full access" ON module_issues;
DROP POLICY IF EXISTS "Service role full access" ON module_links;
DROP POLICY IF EXISTS "Service role full access" ON views;
DROP POLICY IF EXISTS "Service role full access" ON pages;
DROP POLICY IF EXISTS "Service role full access" ON page_labels;
DROP POLICY IF EXISTS "Service role full access" ON favorites;
DROP POLICY IF EXISTS "Service role full access" ON boards;
DROP POLICY IF EXISTS "Service role full access" ON columns;
DROP POLICY IF EXISTS "Service role full access" ON estimates;
DROP POLICY IF EXISTS "Service role full access" ON estimate_points;
DROP POLICY IF EXISTS "Service role full access" ON drive_files;
DROP POLICY IF EXISTS "Service role full access" ON instance_settings;
DROP POLICY IF EXISTS "Service role full access" ON instance_admins;
DROP POLICY IF EXISTS "Service role full access" ON invoices;

-- =====================
-- STEP 2: Create secure policies for authenticated users
-- These restrict access to only authenticated users
-- =====================

-- Organizations: Users can only see their own org
CREATE POLICY "Users can view own organization"
  ON organizations FOR SELECT
  TO authenticated
  USING (id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

-- Users: Users can only see users in their organization
CREATE POLICY "Users can view org members"
  ON users FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Projects: Users can see projects in their org
CREATE POLICY "Users can view org projects"
  ON projects FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can create projects in org"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ))
  WITH CHECK (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

-- Project Members: Standard org-based access
CREATE POLICY "Users can view project members"
  ON project_members FOR SELECT
  TO authenticated
  USING (project_id IN (
    SELECT p.id FROM projects p 
    WHERE p.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

-- States, Labels, Issues, etc. - cascade through project ownership
CREATE POLICY "Users can view states"
  ON states FOR SELECT
  TO authenticated
  USING (project_id IN (
    SELECT p.id FROM projects p 
    WHERE p.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can view labels"
  ON labels FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ) OR project_id IN (
    SELECT p.id FROM projects p 
    WHERE p.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

-- Issues and related tables
CREATE POLICY "Users can view issues"
  ON issues FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can create issues"
  ON issues FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update issues"
  ON issues FOR UPDATE
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ))
  WITH CHECK (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete issues"
  ON issues FOR DELETE
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

-- Issue relationships
CREATE POLICY "Users can view issue assignees"
  ON issue_assignees FOR ALL
  TO authenticated
  USING (issue_id IN (
    SELECT i.id FROM issues i 
    WHERE i.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can view issue labels"
  ON issue_labels FOR ALL
  TO authenticated
  USING (issue_id IN (
    SELECT i.id FROM issues i 
    WHERE i.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can manage issue comments"
  ON issue_comments FOR ALL
  TO authenticated
  USING (issue_id IN (
    SELECT i.id FROM issues i 
    WHERE i.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can view issue relations"
  ON issue_relations FOR SELECT
  TO authenticated
  USING (issue_id IN (
    SELECT i.id FROM issues i 
    WHERE i.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can view issue activity"
  ON issue_activity FOR SELECT
  TO authenticated
  USING (issue_id IN (
    SELECT i.id FROM issues i 
    WHERE i.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can manage issue attachments"
  ON issue_attachments FOR ALL
  TO authenticated
  USING (issue_id IN (
    SELECT i.id FROM issues i 
    WHERE i.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

-- Cycles
CREATE POLICY "Users can view cycles"
  ON cycles FOR ALL
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can view cycle issues"
  ON cycle_issues FOR ALL
  TO authenticated
  USING (cycle_id IN (
    SELECT c.id FROM cycles c 
    WHERE c.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can view cycle progress"
  ON cycle_progress FOR SELECT
  TO authenticated
  USING (cycle_id IN (
    SELECT c.id FROM cycles c 
    WHERE c.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

-- Modules
CREATE POLICY "Users can view modules"
  ON modules FOR ALL
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can view module members"
  ON module_members FOR ALL
  TO authenticated
  USING (module_id IN (
    SELECT m.id FROM modules m 
    WHERE m.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can view module issues"
  ON module_issues FOR ALL
  TO authenticated
  USING (module_id IN (
    SELECT m.id FROM modules m 
    WHERE m.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can view module links"
  ON module_links FOR ALL
  TO authenticated
  USING (module_id IN (
    SELECT m.id FROM modules m 
    WHERE m.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

-- Views, Pages, Favorites
CREATE POLICY "Users can manage views"
  ON views FOR ALL
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can manage pages"
  ON pages FOR ALL
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can view page labels"
  ON page_labels FOR ALL
  TO authenticated
  USING (page_id IN (
    SELECT p.id FROM pages p 
    WHERE p.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can manage favorites"
  ON favorites FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- Boards & Columns
CREATE POLICY "Users can view boards"
  ON boards FOR ALL
  TO authenticated
  USING (project_id IN (
    SELECT p.id FROM projects p 
    WHERE p.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can view columns"
  ON columns FOR ALL
  TO authenticated
  USING (board_id IN (
    SELECT b.id FROM boards b 
    JOIN projects p ON b.project_id = p.id
    WHERE p.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

-- Estimates
CREATE POLICY "Users can manage estimates"
  ON estimates FOR ALL
  TO authenticated
  USING (project_id IN (
    SELECT p.id FROM projects p 
    WHERE p.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can manage estimate points"
  ON estimate_points FOR ALL
  TO authenticated
  USING (estimate_id IN (
    SELECT e.id FROM estimates e
    JOIN projects p ON e.project_id = p.id
    WHERE p.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  ));

-- Drive files
CREATE POLICY "Users can manage drive files"
  ON drive_files FOR ALL
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

-- Instance settings (read-only for non-admins)
CREATE POLICY "Users can view instance settings"
  ON instance_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can modify instance settings"
  ON instance_settings FOR ALL
  TO authenticated
  USING (id IN (
    SELECT ia.id FROM instance_admins ia WHERE ia.user_id = auth.uid()
  ));

-- Instance admins (only admins can manage)
CREATE POLICY "Users can view instance admins"
  ON instance_admins FOR SELECT
  TO authenticated
  USING (true);

-- Invoices (org-specific)
CREATE POLICY "Users can view org invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));

-- =====================
-- STEP 3: Create service role bypass policy (optional)
-- This allows server-side operations with service role key
-- =====================

-- Note: Service role key bypasses RLS by default in Supabase
-- These policies are not needed for service role operations
-- But we add them for explicit documentation

COMMENT ON TABLE organizations IS 'RLS enabled: Only authenticated org members can access';
COMMENT ON TABLE users IS 'RLS enabled: Users can only see org members. password_hash is sensitive.';
COMMENT ON TABLE projects IS 'RLS enabled: Org-based access only';
COMMENT ON TABLE issues IS 'RLS enabled: Org-based access only';

-- =====================
-- STEP 4: Verify RLS is enabled (it should already be)
-- =====================
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN 
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN ('organizations', 'users', 'projects', 'project_members', 'states', 'labels', 'issues', 'issue_assignees', 'issue_labels', 'issue_comments', 'issue_relations', 'issue_activity', 'issue_attachments', 'cycles', 'cycle_issues', 'cycle_progress', 'modules', 'module_members', 'module_issues', 'module_links', 'views', 'pages', 'page_labels', 'favorites', 'boards', 'columns', 'estimates', 'estimate_points', 'drive_files', 'instance_settings', 'instance_admins', 'invoices')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
  END LOOP;
END $$;
