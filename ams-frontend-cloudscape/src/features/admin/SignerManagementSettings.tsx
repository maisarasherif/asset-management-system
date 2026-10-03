import { Alert, Box, Button, ColumnLayout, Container, FileUpload, FormField, Header, SpaceBetween, Spinner } from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Select } from "../../components/shared/OptimizedSelect";
import { assignAdminSigningCategory, getAdminSigningProfile, getCompetentSignatureImage, getCompetentSigningProfile, uploadCompetentSignature } from "../../lib/api/signing-profile";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { CompetencyCategory, CompetentPerson, UserAccount } from "../../types/ams";
import { SignatureImagePreview } from "../account/SignatureImagePreview";

export function SignerManagementSettings({ users, people, categories }: { users: UserAccount[]; people: CompetentPerson[]; categories: CompetencyCategory[] }) {
  const [personId, setPersonId] = useState("");
  const [accountId, setAccountId] = useState("");
  const admins = users.filter((user) => user.role === "ADMIN");
  const person = people.find((item) => item.competent_person_id === personId);
  const account = admins.find((item) => item.user_id === accountId);
  return (
    <section aria-label="Certificate signer management">
    <Container header={<Header variant="h2" description="Manage competent-person signatures and assign signing categories to administrators.">Certificate signer management</Header>}>
      <ColumnLayout columns={2}>
        <SpaceBetween direction="vertical" size="m">
          <FormField label="Competent person signature">
            <Select ariaLabel="Competent person signature" placeholder="Choose a competent person to manage" selectedOption={person ? { value: personId, label: person.full_name } : null}
              options={people.map((person) => ({ value: person.competent_person_id, label: person.full_name, description: `${person.competency_category_name}${person.active ? "" : " — inactive"}` }))}
              onChange={({ detail }) => setPersonId(detail.selectedOption.value ?? "")} empty="No competent persons available" />
          </FormField>
          {personId ? <CompetentSignatureEditor key={personId} personId={personId} /> : <Box>Select a competent person to view or replace their saved signature.</Box>}
        </SpaceBetween>
        <SpaceBetween direction="vertical" size="m">
          <FormField label="Admin signing account">
            <Select ariaLabel="Admin signing account" placeholder="Choose an admin account" selectedOption={account ? { value: accountId, label: account.email } : null}
              options={admins.map((user) => ({ value: user.user_id, label: user.email, description: `${user.first_name} ${user.last_name}` }))}
              onChange={({ detail }) => setAccountId(detail.selectedOption.value ?? "")} empty="No ordinary admin accounts available" />
          </FormField>
          {accountId ? <AdminCategoryEditor key={accountId} accountId={accountId} categories={categories} /> : <Box>Select an admin account to assign its signing competency category.</Box>}
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

function AdminCategoryEditor({ accountId, categories }: { accountId: string; categories: CompetencyCategory[] }) {
  const { session } = useAuth(); const { success } = useFlashbar(); const cache = useQueryClient();
  const key = ["admin-signing-profile", session?.userId, accountId];
  const profile = useQuery({ queryKey: key, queryFn: () => getAdminSigningProfile(accountId) });
  const [draft, setDraft] = useState<string | undefined>();
  const save = useMutation({ mutationFn: (category: string) => assignAdminSigningCategory(accountId, category || null), onSuccess: (saved) => {
    cache.setQueryData(key, saved); setDraft(undefined); void cache.invalidateQueries({ queryKey: ["generated-signers"] });
    success("Admin signing category saved", "The admin's signing competency category has been updated.");
  } });
  if (profile.isPending) return <span role="status" aria-label="Loading admin signing category"><Spinner /></span>;
  if (profile.isError) return <Alert type="error" action={<Button onClick={() => void profile.refetch()}>Retry</Button>}>{profile.error.message}</Alert>;
  const current = profile.data.competency_category_id ?? "";
  const category = draft ?? current;
  const options = [{ value: "", label: "Not assigned" }, ...categories.filter((item) => item.active).map((item) => ({ value: item.competency_category_id, label: item.category_name }))];
  const selected = options.find((item) => item.value === category) ?? { value: category, label: `${profile.data.competency_category_name} (inactive)` };
  return (
    <SpaceBetween direction="vertical" size="m">
      <Box>{profile.data.full_name}</Box>
      <FormField label="Admin signing competency category" description="Only an active permitted category allows this admin to sign. Choose Not assigned to remove signing eligibility." errorText={save.error?.message}>
        <Select ariaLabel="Admin signing competency category" options={options} selectedOption={selected} disabled={save.isPending} onChange={({ detail }) => { setDraft(detail.selectedOption.value ?? ""); save.reset(); }} />
      </FormField>
      <Button variant="primary" loading={save.isPending} disabled={save.isPending || category === current} onClick={() => save.mutate(category)}>Save admin signing category</Button>
    </SpaceBetween>
  );
}
