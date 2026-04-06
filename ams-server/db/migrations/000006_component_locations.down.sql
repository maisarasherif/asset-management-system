ALTER TABLE template_components
DROP COLUMN IF EXISTS location;

ALTER TABLE components
DROP COLUMN IF EXISTS location;
