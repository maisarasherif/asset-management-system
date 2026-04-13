CREATE OR REPLACE FUNCTION spin_up_asset_from_template_by_business_id(
    p_asset_id TEXT,
    p_template_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN spin_up_asset_from_template(p_asset_id::UUID, p_template_id::UUID);
END;
$$;
