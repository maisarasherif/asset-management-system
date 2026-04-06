ALTER TABLE template_components
DROP COLUMN IF EXISTS assigned_project;

ALTER TABLE components
DROP COLUMN IF EXISTS assigned_project;
