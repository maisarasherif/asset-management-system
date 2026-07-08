DROP TABLE IF EXISTS display_id_allocators;

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
    candidate_display_id TEXT;
    max_display_id BIGINT;
    violated_constraint TEXT;
    retry_count INTEGER := 0;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('template_component_test_display_id'));

    LOOP
        candidate_display_id := next_display_id('template_component_test_display_id_seq'::REGCLASS);

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
            IF retry_count > 20 THEN
                RAISE EXCEPTION 'failed to allocate unique template_component_tests.display_id after % attempts', retry_count
                    USING ERRCODE = '23505',
                          CONSTRAINT = 'template_component_tests_display_id_unique';
            END IF;

            SELECT COALESCE(MAX(substring(tct.display_id from '([0-9]+)$')::BIGINT), 0)
            FROM template_component_tests tct
            WHERE tct.display_id ~ '([0-9]+)$'
            INTO max_display_id;

            PERFORM setval(
                'template_component_test_display_id_seq',
                GREATEST(max_display_id, 1),
                max_display_id > 0
            );
        END;
    END LOOP;
END;
$$;
