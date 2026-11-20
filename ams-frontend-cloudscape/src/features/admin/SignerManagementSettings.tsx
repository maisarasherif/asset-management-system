import { Alert, Box, Button, ColumnLayout, Container, FileUpload, FormField, Header, SpaceBetween, Spinner } from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PagedSelect } from "../../components/shared/PagedSelect";
import { listCompetencyCategories, listCompetentPersons, listUsers } from "../../lib/api/ams";
import { assignAdminSigningCategory, getAdminSigningProfile, getCompetentSignatureImage, getCompetentSigningProfile, uploadCompetentSignature } from "../../lib/api/signing-profile";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { CompetencyCategory, CompetentPerson, UserAccount } from "../../types/ams";
import { SignatureImagePreview } from "../account/SignatureImagePreview";

const toCompetentPersonOption = (person: CompetentPerson) => ({
  value: person.competent_person_id,
  label: person.full_name,
  description: person.competency_category_name + (person.active ? "" : " (inactive)"),
});
const toAdminOption = (user: UserAccount) => ({
  value: user.user_id, label: user.email, description: [user.first_name, user.last_name].join(" "),
});
const toCategoryOption = (item: CompetencyCategory) => ({ value: item.competency_category_id, label: item.category_name });

export function SignerManagementSettings() {
  const [person, setPerson] = useState<CompetentPerson>();
  const [account, setAccount] = useState<UserAccount>();
  const personId = person?.competent_person_id;
  const accountId = account?.user_id;
  return (
    <section aria-label="Certificate signer management">
    <Container header={<Header variant="h2" description="Manage competent-person signatures and assign signing categories to administrators.">Certificate signer management</Header>}>
      <ColumnLayout columns={2}>
        <SpaceBetween direction="vertical" size="m">
          <FormField label="Competent person signature">
            <PagedSelect label="Competent person signature" queryKey={["competent-persons", "signer-picker"]}
              load={(page, search) => listCompetentPersons(page, 20, { search })}
              selected={person ? toCompetentPersonOption(person) : null}
              getOption={toCompetentPersonOption} onSelect={(_, item) => setPerson(item)} />
          </FormField>
          {personId ? <CompetentSignatureEditor key={personId} personId={personId} /> : <Box>Select a competent person to view or replace their saved signature.</Box>}
        </SpaceBetween>
        <SpaceBetween direction="vertical" size="m">
          <FormField label="Admin signing account">
            <PagedSelect label="Admin signing account" queryKey={["users", "signer-picker"]}
              load={(page, search) => listUsers(page, 20, { search, role: "ADMIN" })}
              selected={account ? toAdminOption(account) : null}
              getOption={toAdminOption} onSelect={(_, item) => setAccount(item)} />
          </FormField>
          {accountId ? <AdminCategoryEditor key={accountId} accountId={accountId} /> : <Box>Select an admin account to assign its signing competency category.</Box>}
        </SpaceBetween>
      </ColumnLayout>
    </Container>
    </section>
  );
}

function CompetentSignatureEditor({ personId }: { personId: string }) {
  const { session } = useAuth(); const { success } = useFlashbar(); const cache = useQueryClient();
  const key = ["competent-signing-profile", session?.userId, personId];
  const profile = useQuery({ queryKey: key, queryFn: () => getCompetentSigningProfile(personId) });
  const [file, setFile] = useState<File | null>(null);
  const upload = useMutation({ mutationFn: (image: File) => uploadCompetentSignature(personId, image), onSuccess: (saved) => {
    cache.setQueryData(key, saved); setFile(null); void cache.invalidateQueries({ queryKey: ["generated-signers"] });
    success("Competent person signature saved", `${saved.full_name}'s saved signature has been updated.`);
  } });
  const error = file && file.size > 2 * 1024 * 1024 ? "Choose a signature image of 2 MB or smaller." : "";
  if (profile.isPending) return <span role="status" aria-label="Loading competent person signature"><Spinner /></span>;
  if (profile.isError) return <Alert type="error" action={<Button onClick={() => void profile.refetch()}>Retry</Button>}>{profile.error.message}</Alert>;
  const saved = profile.data;
  return (
    <SpaceBetween direction="vertical" size="m">
      <Box>{saved.full_name} — {saved.organization}</Box>
      {!saved.active || !saved.competency_category_active ? <Alert type="info">This person or their category is inactive. Their signature can be managed, but they cannot sign a generated certificate.</Alert> : null}
      {saved.signature ? <SignatureImagePreview key={saved.signature.signature_id} queryKey={[...key, "image", saved.signature.signature_id]} loadImage={() => getCompetentSignatureImage(personId, saved.signature!.signature_id)} /> : <Box>No competent person signature saved.</Box>}
      <FormField label="Competent person signature image" description="PNG or JPEG, up to 2 MB. Earlier signature versions are preserved." errorText={error || upload.error?.message}>
        <fieldset disabled={upload.isPending} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <FileUpload value={file ? [file] : []} accept=".png,.jpg,.jpeg" onChange={({ detail }) => { setFile(detail.value[0] ?? null); upload.reset(); }}
            i18nStrings={{ uploadButtonText: () => "Choose competent person signature image", dropzoneText: () => "Drop signature image", removeFileAriaLabel: () => "Remove selected signature image", limitShowFewer: "Show fewer files", limitShowMore: "Show more files", errorIconAriaLabel: "Error" }} />
        </fieldset>
      </FormField>
      <Button variant="primary" loading={upload.isPending} disabled={!file || Boolean(error) || upload.isPending} onClick={() => file && upload.mutate(file)}>Save competent person signature</Button>
    </SpaceBetween>
  );
}

function AdminCategoryEditor({ accountId }: { accountId: string }) {
  const { session } = useAuth(); const { success } = useFlashbar(); const cache = useQueryClient();
  const key = ["admin-signing-profile", session?.userId, accountId];
  const profile = useQuery({ queryKey: key, queryFn: () => getAdminSigningProfile(accountId) });
  const [draft, setDraft] = useState<CompetencyCategory | null>();
  const save = useMutation({ mutationFn: (category: string) => assignAdminSigningCategory(accountId, category || null), onSuccess: (saved) => {
    cache.setQueryData(key, saved); setDraft(undefined); void cache.invalidateQueries({ queryKey: ["generated-signers"] });
    success("Admin signing category saved", "The admin's signing competency category has been updated.");
  } });
  if (profile.isPending) return <span role="status" aria-label="Loading admin signing category"><Spinner /></span>;
  if (profile.isError) return <Alert type="error" action={<Button onClick={() => void profile.refetch()}>Retry</Button>}>{profile.error.message}</Alert>;
  const current = profile.data.competency_category_id ?? "";
  const category = draft === undefined ? current : draft?.competency_category_id ?? "";
  const selected = draft ? toCategoryOption(draft) : category ? { value: category, label: profile.data.competency_category_name } : null;
  return (
    <SpaceBetween direction="vertical" size="m">
      <Box>{profile.data.full_name}</Box>
      <FormField label="Admin signing competency category" description="Only an active permitted category allows this admin to sign. Choose Not assigned to remove signing eligibility." errorText={save.error?.message}>
        <PagedSelect label="Admin signing competency category" queryKey={["competency-categories", "signer-picker"]}
          allLabel="Not assigned" selected={selected} disabled={save.isPending}
          load={(page, search) => listCompetencyCategories(page, 20, { search, status: "ACTIVE" })}
          getOption={toCategoryOption} onSelect={(_, item) => { setDraft(item ?? null); save.reset(); }} />
      </FormField>
      <Button variant="primary" loading={save.isPending} disabled={save.isPending || category === current} onClick={() => save.mutate(category)}>Save admin signing category</Button>
    </SpaceBetween>
  );
}
