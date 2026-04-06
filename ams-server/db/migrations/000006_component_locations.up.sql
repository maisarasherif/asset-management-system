ALTER TABLE components
ADD COLUMN location TEXT NOT NULL DEFAULT '';

ALTER TABLE template_components
ADD COLUMN location TEXT NOT NULL DEFAULT '';
