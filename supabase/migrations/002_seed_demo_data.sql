-- HelpMate Demo Data Seed
-- Run this after 001_initial_schema.sql

-- Create demo organization
INSERT INTO organizations (id, name, slug, plan, timezone) 
VALUES ('11111111-1111-1111-1111-111111111111', 'Demo Company', 'demo', 'pro', 'America/New_York')
ON CONFLICT (slug) DO NOTHING;

-- Create demo users (password: demo123 - bcrypt hash)
INSERT INTO users (id, email, password_hash, name, display_name, role, org_id) 
VALUES (
  '22222222-2222-2222-2222-222222222222', 
  'demo@helpmate.io', 
  '$2a$10$rQEY7xGOVnIrfm.nh8yZxOQN5YprHqjxGpXxNqX.6S8d7V8HxNYmK', 
  'Alex Johnson', 
  'Alex', 
  'owner', 
  '11111111-1111-1111-1111-111111111111'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, email, password_hash, name, display_name, role, org_id) 
VALUES (
  '33333333-3333-3333-3333-333333333333', 
  'sarah@helpmate.io', 
  '$2a$10$rQEY7xGOVnIrfm.nh8yZxOQN5YprHqjxGpXxNqX.6S8d7V8HxNYmK', 
  'Sarah Chen', 
  'Sarah', 
  'admin', 
  '11111111-1111-1111-1111-111111111111'
)
ON CONFLICT (email) DO NOTHING;

-- Make first user instance admin
INSERT INTO instance_admins (id, user_id) 
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (user_id) DO NOTHING;

-- Create instance settings
INSERT INTO instance_settings (id, key, value) VALUES 
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'instance_name', 'HelpMate'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02', 'is_signup_enabled', 'true'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03', 'is_email_verification_required', 'false'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04', 'is_magic_login_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- Create projects
INSERT INTO projects (id, name, identifier, description, icon, color, org_id, lead_id, created_by)
VALUES 
  ('44444444-4444-4444-4444-444444444444', 'Product Launch', 'PROD', 'Q1 2024 Product Launch', '🚀', '#6366f1', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),
  ('55555555-5555-5555-5555-555555555555', 'Mobile App', 'MOB', 'iOS and Android mobile application', '📱', '#10b981', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;

-- Add project members
INSERT INTO project_members (id, project_id, user_id, role) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccc01', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02', '44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'member'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc03', '55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc04', '55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'admin')
ON CONFLICT DO NOTHING;

-- Create states for Product Launch project
INSERT INTO states (id, name, color, state_group, position, is_default, project_id) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddd01', 'Backlog', '#a3a3a3', 'backlog', 0, false, '44444444-4444-4444-4444-444444444444'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd02', 'Todo', '#f59e0b', 'unstarted', 1, true, '44444444-4444-4444-4444-444444444444'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd03', 'In Progress', '#3b82f6', 'started', 2, false, '44444444-4444-4444-4444-444444444444'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd04', 'In Review', '#8b5cf6', 'started', 3, false, '44444444-4444-4444-4444-444444444444'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd05', 'Done', '#22c55e', 'completed', 4, false, '44444444-4444-4444-4444-444444444444'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd06', 'Cancelled', '#ef4444', 'cancelled', 5, false, '44444444-4444-4444-4444-444444444444')
ON CONFLICT DO NOTHING;

-- Create states for Mobile App project
INSERT INTO states (id, name, color, state_group, position, is_default, project_id) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddd11', 'Backlog', '#a3a3a3', 'backlog', 0, false, '55555555-5555-5555-5555-555555555555'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd12', 'Todo', '#f59e0b', 'unstarted', 1, true, '55555555-5555-5555-5555-555555555555'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd13', 'In Progress', '#3b82f6', 'started', 2, false, '55555555-5555-5555-5555-555555555555'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd14', 'In Review', '#8b5cf6', 'started', 3, false, '55555555-5555-5555-5555-555555555555'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd15', 'Done', '#22c55e', 'completed', 4, false, '55555555-5555-5555-5555-555555555555'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd16', 'Cancelled', '#ef4444', 'cancelled', 5, false, '55555555-5555-5555-5555-555555555555')
ON CONFLICT DO NOTHING;

-- Create labels
INSERT INTO labels (id, name, color, project_id, org_id) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', 'Bug', '#ef4444', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02', 'Feature', '#8b5cf6', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03', 'Enhancement', '#3b82f6', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04', 'Documentation', '#f59e0b', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05', 'High Priority', '#dc2626', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee06', 'Low Priority', '#6b7280', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- Create Cycles (Sprints)
INSERT INTO cycles (id, name, description, start_date, end_date, status, owned_by, project_id, org_id) VALUES
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Sprint 1 - Foundation', 'Set up core infrastructure and basic features', CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE, 'current', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111'),
  ('ffffffff-ffff-ffff-ffff-fffffffffff2', 'Sprint 2 - Features', 'Build out main product features', CURRENT_DATE + INTERVAL '14 days', CURRENT_DATE + INTERVAL '28 days', 'upcoming', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- Create Modules
INSERT INTO modules (id, name, description, status, start_date, target_date, lead_id, project_id, org_id) VALUES
  ('77777777-7777-7777-7777-777777777777', 'User Authentication', 'Complete auth system with SSO', 'in-progress', CURRENT_DATE, CURRENT_DATE + INTERVAL '28 days', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111'),
  ('77777777-7777-7777-7777-777777777778', 'Dashboard & Analytics', 'Build analytics dashboard', 'planned', CURRENT_DATE + INTERVAL '14 days', CURRENT_DATE + INTERVAL '28 days', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- Create Issues
INSERT INTO issues (id, sequence_id, name, description, description_html, priority, state_id, project_id, cycle_id, org_id, created_by) VALUES
  ('88888888-8888-8888-8888-888888888801', 1, 'Design landing page mockups', 'Create mockups for the landing page', '<p>Create mockups for the landing page</p>', 'high', 'dddddddd-dddd-dddd-dddd-dddddddddd03', '44444444-4444-4444-4444-444444444444', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('88888888-8888-8888-8888-888888888802', 2, 'Set up CI/CD pipeline', 'Configure GitHub Actions for CI/CD', '<p>Configure GitHub Actions for CI/CD</p>', 'medium', 'dddddddd-dddd-dddd-dddd-dddddddddd02', '44444444-4444-4444-4444-444444444444', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('88888888-8888-8888-8888-888888888803', 3, 'Fix login button on mobile Safari', 'Login button not responding on mobile Safari', '<p>Login button not responding on mobile Safari</p>', 'urgent', 'dddddddd-dddd-dddd-dddd-dddddddddd03', '44444444-4444-4444-4444-444444444444', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('88888888-8888-8888-8888-888888888804', 4, 'Add dark mode support', 'Add dark mode across all components', '<p>Add dark mode across all components</p>', 'low', 'dddddddd-dddd-dddd-dddd-dddddddddd01', '44444444-4444-4444-4444-444444444444', NULL, '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('88888888-8888-8888-8888-888888888805', 5, 'Implement user onboarding wizard', 'Create onboarding flow for new users', '<p>Create onboarding flow for new users</p>', 'high', 'dddddddd-dddd-dddd-dddd-dddddddddd03', '44444444-4444-4444-4444-444444444444', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('88888888-8888-8888-8888-888888888806', 6, 'Write API documentation', 'Document all v1 API endpoints', '<p>Document all v1 API endpoints</p>', 'medium', 'dddddddd-dddd-dddd-dddd-dddddddddd05', '44444444-4444-4444-4444-444444444444', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('88888888-8888-8888-8888-888888888807', 7, 'Optimize database queries', 'Improve dashboard query performance', '<p>Improve dashboard query performance</p>', 'medium', 'dddddddd-dddd-dddd-dddd-dddddddddd02', '44444444-4444-4444-4444-444444444444', NULL, '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('88888888-8888-8888-8888-888888888808', 8, 'Integrate customer feedback widget', 'Add feedback collection widget', '<p>Add feedback collection widget</p>', 'low', 'dddddddd-dddd-dddd-dddd-dddddddddd01', '44444444-4444-4444-4444-444444444444', NULL, '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;

-- Add issue assignees
INSERT INTO issue_assignees (id, issue_id, user_id) VALUES
  ('99999999-9999-9999-9999-999999999901', '88888888-8888-8888-8888-888888888801', '22222222-2222-2222-2222-222222222222'),
  ('99999999-9999-9999-9999-999999999902', '88888888-8888-8888-8888-888888888802', '33333333-3333-3333-3333-333333333333'),
  ('99999999-9999-9999-9999-999999999903', '88888888-8888-8888-8888-888888888803', '22222222-2222-2222-2222-222222222222'),
  ('99999999-9999-9999-9999-999999999904', '88888888-8888-8888-8888-888888888804', '33333333-3333-3333-3333-333333333333'),
  ('99999999-9999-9999-9999-999999999905', '88888888-8888-8888-8888-888888888805', '22222222-2222-2222-2222-222222222222'),
  ('99999999-9999-9999-9999-999999999906', '88888888-8888-8888-8888-888888888806', '33333333-3333-3333-3333-333333333333')
ON CONFLICT DO NOTHING;

-- Add issue labels
INSERT INTO issue_labels (id, issue_id, label_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', '88888888-8888-8888-8888-888888888801', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', '88888888-8888-8888-8888-888888888803', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003', '88888888-8888-8888-8888-888888888803', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004', '88888888-8888-8888-8888-888888888805', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05')
ON CONFLICT DO NOTHING;

-- Add cycle issues
INSERT INTO cycle_issues (id, cycle_id, issue_id) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '88888888-8888-8888-8888-888888888801'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '88888888-8888-8888-8888-888888888802'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '88888888-8888-8888-8888-888888888803'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '88888888-8888-8888-8888-888888888805'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '88888888-8888-8888-8888-888888888806')
ON CONFLICT DO NOTHING;

-- Add module issues
INSERT INTO module_issues (id, module_id, issue_id) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccc0001', '77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888801'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0002', '77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888802'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0003', '77777777-7777-7777-7777-777777777778', '88888888-8888-8888-8888-888888888805'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0004', '77777777-7777-7777-7777-777777777778', '88888888-8888-8888-8888-888888888806')
ON CONFLICT DO NOTHING;

-- Add issue comments
INSERT INTO issue_comments (id, issue_id, user_id, content, content_html) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddd0001', '88888888-8888-8888-8888-888888888801', '22222222-2222-2222-2222-222222222222', 'Starting work on this today!', '<p>Starting work on this today!</p>'),
  ('dddddddd-dddd-dddd-dddd-dddddddd0002', '88888888-8888-8888-8888-888888888801', '33333333-3333-3333-3333-333333333333', 'Looking good! Let me know if you need design assets.', '<p>Looking good! Let me know if you need design assets.</p>')
ON CONFLICT DO NOTHING;

-- Add issue relation
INSERT INTO issue_relations (id, issue_id, related_issue_id, relation_type) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001', '88888888-8888-8888-8888-888888888803', '88888888-8888-8888-8888-888888888801', 'blocks')
ON CONFLICT DO NOTHING;

-- Create Views
INSERT INTO views (id, name, description, filters, display_filters, access, project_id, org_id, created_by) VALUES
  ('ffffffff-ffff-ffff-ffff-ffffffff0001', 'My Open Issues', 'All open issues assigned to me', '{"assignee": ["22222222-2222-2222-2222-222222222222"], "state_group": ["backlog", "unstarted", "started"]}', '{"layout": "list", "group_by": "state"}', 'private', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('ffffffff-ffff-ffff-ffff-ffffffff0002', 'High Priority', 'All high and urgent priority issues', '{"priority": ["high", "urgent"]}', '{"layout": "kanban", "group_by": "priority"}', 'public', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;

-- Create Pages
INSERT INTO pages (id, name, description, description_html, icon, access, project_id, org_id, owned_by) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001', 'Product Requirements', 'Core product requirements and specifications', '<h1>Product Requirements</h1><h2>Overview</h2><p>This document outlines the core requirements for the product launch.</p><h2>Features</h2><ul><li>User authentication with SSO</li><li>Dashboard with analytics</li><li>Issue tracking system</li></ul>', '📋', 'public', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002', 'Meeting Notes - Sprint Planning', 'Notes from sprint planning meeting', '<h1>Sprint Planning - Dec 2024</h1><p>Attendees: Alex, Sarah</p><h2>Goals</h2><ul><li>Complete authentication module</li><li>Start dashboard development</li></ul><h2>Action Items</h2><ol><li>Alex: Finish login flow</li><li>Sarah: Design dashboard mockups</li></ol>', '📝', 'private', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333')
ON CONFLICT DO NOTHING;

-- Create default board
INSERT INTO boards (id, name, project_id) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 'Main Board', '44444444-4444-4444-4444-444444444444')
ON CONFLICT DO NOTHING;

INSERT INTO columns (id, name, position, color, board_id) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccc001', 'Backlog', 0, '#94a3b8', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001'),
  ('cccccccc-cccc-cccc-cccc-ccccccccc002', 'To Do', 1, '#f59e0b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001'),
  ('cccccccc-cccc-cccc-cccc-ccccccccc003', 'In Progress', 2, '#3b82f6', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001'),
  ('cccccccc-cccc-cccc-cccc-ccccccccc004', 'Done', 3, '#22c55e', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001')
ON CONFLICT DO NOTHING;
