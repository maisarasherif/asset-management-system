-- Revert dropping template_component_id from components
ALTER TABLE components 
ADD COLUMN IF NOT EXISTS template_component_id TEXT NOT NULL DEFAULT '';

-- Revert dropping template_component_test_id from certificates
ALTER TABLE certificates 
ADD COLUMN IF NOT EXISTS template_component_test_id TEXT NOT NULL DEFAULT '';