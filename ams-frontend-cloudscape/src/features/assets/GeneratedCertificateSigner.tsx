import { Alert, Box, Button, Container, FormField, Header, SpaceBetween, Spinner } from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Select } from "../../components/shared/OptimizedSelect";
import { getCompetentSignatureImage, getOwnSignatureImage, listGeneratedSigners, resolveGeneratedSigner } from "../../lib/api/signing-profile";
import { useAuth } from "../../providers/auth-context";
import { SignatureImagePreview } from "../account/SignatureImagePreview";

export function GeneratedCertificateSigner({ certificateId }: { certificateId: string }) {
  const { session } = useAuth();
  const superAdmin = session?.role === "SUPER_ADMIN";
  const [selectedId, setSelectedId] = useState("");
  const choices = useQuery({ queryKey: ["generated-signers", session?.userId, certificateId], queryFn: () => listGeneratedSigners(certificateId) });
  const selected = superAdmin ? choices.data?.find((person) => person.signer_id === selectedId) : choices.data?.[0];
  const signer = useQuery({ queryKey: ["generated-signer", session?.userId, certificateId, selected?.signer_id, selected?.signature.signature_id], queryFn: () => resolveGeneratedSigner(certificateId, selected!.signer_id), enabled: Boolean(selected) });
  const confirmed = selected ? signer.data : undefined;
  return (
    <section aria-label="Generated certificate signing">
    <Container header={<Header variant="h2" description="Signing details available for a generated examination certificate.">Generated certificate signer</Header>}>
      <SpaceBetween direction="vertical" size="m">
        {choices.isPending ? <span role="status" aria-label="Loading generated certificate signers"><Spinner /></span> : null}
        {choices.isError ? <Alert type="error" action={<Button onClick={() => void choices.refetch()}>Retry signers</Button>}>{choices.error.message}</Alert> : null}
        {choices.data?.length === 0 ? <Alert type="info">{superAdmin ? "No eligible competent person has a saved signature for this certificate. Check their active status, competency category, and signature in Administration." : "Your signing profile is not eligible for this certificate. Save your signature in Account and ask a super admin to assign an active category permitted by this certificate."}</Alert> : null}
        {superAdmin && Boolean(choices.data?.length) ? (
          <FormField label="Generated certificate competent person">
            <Select ariaLabel="Generated certificate competent person" placeholder="Choose a generated certificate signer" selectedOption={selected ? { value: selected.signer_id, label: selected.full_name } : null}
              options={(choices.data ?? []).map((person) => ({ value: person.signer_id, label: person.full_name, description: `${person.organization} — ${person.competency_category_name}` }))}
              onChange={({ detail }) => setSelectedId(detail.selectedOption.value ?? "")} />
          </FormField>
        ) : null}
        {selected && signer.isPending ? <span role="status" aria-label="Checking selected signer"><Spinner /></span> : null}
        {selected && signer.isError ? <Alert type="error" action={<Button onClick={() => { void choices.refetch(); void signer.refetch(); }}>Refresh signing details</Button>}>{signer.error.message}</Alert> : null}
        {confirmed ? (
          <>
            <Box><strong>{confirmed.full_name}</strong> — {confirmed.organization}</Box>
            <Box>{confirmed.competency_category_name}</Box>
            <SignatureImagePreview key={confirmed.signature.signature_id} queryKey={["generated-signer-image", session?.userId, confirmed.owner_kind, confirmed.signer_id, confirmed.signature.signature_id]}
              loadImage={() => confirmed.owner_kind === "ACCOUNT" ? getOwnSignatureImage(confirmed.signature.signature_id) : getCompetentSignatureImage(confirmed.signer_id, confirmed.signature.signature_id)} />
          </>
        ) : null}
      </SpaceBetween>
    </Container>
    </section>
  );
}
