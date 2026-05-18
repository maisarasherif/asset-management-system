UPDATE test_types
SET validity_duration = GREATEST(1, ROUND(validity_duration::numeric / 30.4375)::int);
