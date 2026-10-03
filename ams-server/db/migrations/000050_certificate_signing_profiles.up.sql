CREATE TABLE certificate_signature_versions (
    signature_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_kind TEXT NOT NULL CHECK (owner_kind IN ('ACCOUNT', 'COMPETENT_PERSON')),
    owner_id UUID NOT NULL,
    account_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    competent_person_id UUID REFERENCES competent_persons(competent_person_id) ON DELETE SET NULL,
    file_key TEXT NOT NULL UNIQUE,
    sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    width INTEGER NOT NULL CHECK (width > 0 AND width <= 4096),
    height INTEGER NOT NULL CHECK (height > 0 AND height <= 4096),
    byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 16777216),
    storage_state TEXT NOT NULL DEFAULT 'PENDING' CHECK (storage_state IN ('PENDING', 'STORED', 'FAILED')),
    created_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (signature_id, owner_id, owner_kind),
    CHECK (
        (owner_kind = 'ACCOUNT' AND competent_person_id IS NULL AND
            (account_user_id IS NULL OR account_user_id = owner_id)) OR
        (owner_kind = 'COMPETENT_PERSON' AND account_user_id IS NULL AND
            (competent_person_id IS NULL OR competent_person_id = owner_id))
    )
);
CREATE INDEX certificate_signature_versions_owner_idx
    ON certificate_signature_versions(owner_kind, owner_id, created_at DESC);

CREATE TABLE certificate_signing_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    organization TEXT NOT NULL DEFAULT 'Porto Marine Services L.L.C.'
        CHECK (char_length(organization) BETWEEN 1 AND 200),
    competency_category_id UUID REFERENCES competency_categories(competency_category_id),
    current_signature_id UUID,
    owner_kind TEXT NOT NULL DEFAULT 'ACCOUNT' CHECK (owner_kind = 'ACCOUNT'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (current_signature_id, user_id, owner_kind)
        REFERENCES certificate_signature_versions(signature_id, owner_id, owner_kind)
);

-- Source accounts may be deleted without deleting an image used by history.
-- Stable ownership and immutable image metadata remain in the version record.
CREATE FUNCTION prevent_certificate_signature_rewrite() RETURNS TRIGGER AS $$
BEGIN
    IF ROW(NEW.signature_id, NEW.owner_kind, NEW.owner_id, NEW.file_key,
           NEW.sha256, NEW.width, NEW.height, NEW.byte_size, NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.signature_id, OLD.owner_kind, OLD.owner_id, OLD.file_key,
           OLD.sha256, OLD.width, OLD.height, OLD.byte_size, OLD.created_at) THEN
        RAISE EXCEPTION 'certificate signature image versions are immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER certificate_signature_immutable
    BEFORE UPDATE ON certificate_signature_versions
    FOR EACH ROW EXECUTE FUNCTION prevent_certificate_signature_rewrite();
