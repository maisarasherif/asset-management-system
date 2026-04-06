ALTER TABLE components
ADD COLUMN assigned_project TEXT NOT NULL DEFAULT '';

ALTER TABLE template_components
ADD COLUMN assigned_project TEXT NOT NULL DEFAULT '';
