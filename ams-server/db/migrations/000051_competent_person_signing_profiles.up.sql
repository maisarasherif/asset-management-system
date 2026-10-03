CREATE TABLE competent_person_signing_profiles (
    competent_person_id UUID PRIMARY KEY REFERENCES competent_persons(competent_person_id) ON DELETE CASCADE,
    current_signature_id UUID,
    owner_kind TEXT NOT NULL DEFAULT 'COMPETENT_PERSON' CHECK (owner_kind = 'COMPETENT_PERSON'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (current_signature_id, competent_person_id, owner_kind)
        REFERENCES certificate_signature_versions(signature_id, owner_id, owner_kind)
);
