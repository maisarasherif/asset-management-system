CREATE TABLE IF NOT EXISTS display_id_allocators (
    allocator_name TEXT PRIMARY KEY,
    next_value BIGINT NOT NULL CHECK (next_value > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO display_id_allocators (allocator_name, next_value)
SELECT
    'template_component_tests.display_id',
    COALESCE(MAX(substring(display_id from '([0-9]+)$')::BIGINT), 0) + 1
FROM template_component_tests
WHERE display_id ~ '([0-9]+)$'
ON CONFLICT (allocator_name) DO UPDATE
SET next_value = GREATEST(display_id_allocators.next_value, EXCLUDED.next_value),
    updated_at = NOW();

CREATE OR REPLACE FUNCTION create_template_component_test(
    p_template_component_id UUID,
    p_test_id UUID
)
RETURNS TABLE (
    template_component_test_id UUID,
    display_id TEXT,
    template_component_id UUID,
    test_id UUID,
    "position" INTEGER,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
    candidate_value BIGINT;
    candidate_display_id TEXT;
    max_display_id BIGINT;
    violated_constraint TEXT;
    retry_count INTEGER := 0;
BEGIN
    LOOP
        UPDATE display_id_allocators
        SET next_value = next_value + 1,
            updated_at = NOW()
        WHERE allocator_name = 'template_component_tests.display_id'
        RETURNING next_value - 1
        INTO candidate_value;

        IF candidate_value IS NULL THEN
            INSERT INTO display_id_allocators (allocator_name, next_value)
            SELECT
                'template_component_tests.display_id',
                COALESCE(MAX(substring(tct.display_id from '([0-9]+)$')::BIGINT), 0) + 1
            FROM template_component_tests tct
            WHERE tct.display_id ~ '([0-9]+)$'
            ON CONFLICT (allocator_name) DO NOTHING;
            CONTINUE;
        END IF;

        candidate_display_id := LPAD(candidate_value::TEXT, 3, '0');

        BEGIN
            RETURN QUERY
            INSERT INTO template_component_tests AS tct (
                display_id,
                template_component_id,
                test_id,
                position,
                created_at
            )
            VALUES (
                candidate_display_id,
                p_template_component_id,
                p_test_id,
                COALESCE((
                    SELECT MAX(existing_tct.position) + 1
                    FROM template_component_tests existing_tct
                    WHERE existing_tct.template_component_id = p_template_component_id
                ), 1),
                NOW()
            )
            RETURNING
                tct.template_component_test_id,
                tct.display_id,
                tct.template_component_id,
                tct.test_id,
                tct.position,
                tct.created_at;
            RETURN;
        EXCEPTION WHEN unique_violation THEN
            GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;

            IF violated_constraint <> 'template_component_tests_display_id_unique' THEN
                RAISE;
            END IF;

            retry_count := retry_count + 1;
            IF retry_count > 100 THEN
                RAISE EXCEPTION 'failed to allocate unique template_component_tests.display_id after % attempts; last candidate %, allocator value %', retry_count, candidate_display_id, candidate_value
                    USING ERRCODE = '23505',
                          CONSTRAINT = 'template_component_tests_display_id_unique';
            END IF;

            SELECT COALESCE(MAX(substring(tct.display_id from '([0-9]+)$')::BIGINT), 0)
            FROM template_component_tests tct
            WHERE tct.display_id ~ '([0-9]+)$'
            INTO max_display_id;

            UPDATE display_id_allocators
            SET next_value = GREATEST(next_value, max_display_id + 1),
                updated_at = NOW()
            WHERE allocator_name = 'template_component_tests.display_id';
        END;
    END LOOP;
END;
$$;
