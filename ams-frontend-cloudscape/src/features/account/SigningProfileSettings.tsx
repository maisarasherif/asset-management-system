import { Alert, Box, Button, ColumnLayout, Container, FileUpload, FormField, Header, Input, SpaceBetween, Spinner } from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getOwnSignatureImage, getOwnSigningProfile, updateOwnSigningOrganization, uploadOwnSignature } from "../../lib/api/signing-profile";
import { useFlashbar } from "../../providers/flashbar-context";
import { useAuth } from "../../providers/auth-context";

const maxImageBytes = 2 * 1024 * 1024;

export function SigningProfileSettings() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const profileKey = ["account", "signing-profile", session?.userId];
  const { success } = useFlashbar();
  const profileQuery = useQuery({ queryKey: profileKey, queryFn: getOwnSigningProfile });
  const [organizationDraft, setOrganizationDraft] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const profile = profileQuery.data;
  const signatureId = profile?.signature?.signature_id;
  const imageQuery = useQuery({
    queryKey: [...profileKey, "image", signatureId],
    queryFn: () => getOwnSignatureImage(signatureId!),
    enabled: Boolean(signatureId),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!imageQuery.data || !imageRef.current) return;
    const nextUrl = URL.createObjectURL(imageQuery.data);
    imageRef.current.src = nextUrl;
    return () => URL.revokeObjectURL(nextUrl);
  }, [imageQuery.data]);

  const organizationMutation = useMutation({
    mutationFn: updateOwnSigningOrganization,
    onSuccess: (updated) => {
      queryClient.setQueryData(profileKey, updated);
      setOrganizationDraft(null);
      success("Signing details saved", "Your organization has been updated.");
    },
  });
  const signatureMutation = useMutation({
    mutationFn: uploadOwnSignature,
    onSuccess: (updated) => {
      queryClient.setQueryData(profileKey, updated);
      setSelectedFile(null);
      setFileError("");
      success("Signature saved", "Your saved signature has been updated.");
    },
  });
  const busy = organizationMutation.isPending || signatureMutation.isPending;
  const organization = organizationDraft ?? profile?.organization ?? "";
  const organizationError = organizationDraft !== null && (!organization.trim() || [...organization.trim()].length > 200)
    ? "Enter an organization between 1 and 200 characters." : "";

  const chooseFile = (file: File | null) => {
    signatureMutation.reset();
    setSelectedFile(file);
    setFileError(file && file.size > maxImageBytes ? "Choose a signature image of 2 MB or smaller." : "");
  };

  return (
    <Container header={<Header variant="h2" description="Save the identity and signature you use when examining equipment.">Certificate signing profile</Header>}>
      {profileQuery.isPending ? <span role="status" aria-label="Loading signing profile"><Spinner /></span> : null}
      {profileQuery.isError ? (
        <Alert type="error" action={<Button onClick={() => void profileQuery.refetch()}>Retry</Button>}>
          {profileQuery.error.message}
        </Alert>
      ) : null}
      {profile ? (
        <ColumnLayout columns={2}>
          <SpaceBetween direction="vertical" size="l">
            <div>
              <Box variant="awsui-key-label">Signer</Box>
              <Box>{profile.full_name || "Name not set"}</Box>
            </div>
            <FormField label="Signing organization" description="This organization appears with your signing details." errorText={organizationError || organizationMutation.error?.message}>
              <Input value={organization} disabled={busy} onChange={({ detail }) => { setOrganizationDraft(detail.value); organizationMutation.reset(); }} />
            </FormField>
            <Button variant="primary" disabled={busy || Boolean(organizationError) || organization === profile.organization} loading={organizationMutation.isPending} onClick={() => organizationMutation.mutate(organization)}>
              Save signing details
            </Button>
            <div>
              <Box variant="awsui-key-label">Competency category</Box>
              <Box>{profile.competency_category_name || "Not assigned"}</Box>
              <Box variant="small">Your super admin manages your competency category.</Box>
            </div>
          </SpaceBetween>
          <SpaceBetween direction="vertical" size="l">
            <div>
              <Box variant="awsui-key-label">Current signature / stamp</Box>
              {!signatureId ? <Box>No signature saved. Upload your signature or stamp below.</Box> : null}
              {signatureId && imageQuery.isPending ? <span role="status" aria-label="Loading signature image"><Spinner /></span> : null}
              {imageQuery.isError ? <Alert type="error" action={<Button onClick={() => void imageQuery.refetch()}>Retry image</Button>}>{imageQuery.error.message}</Alert> : null}
              {imageQuery.data ? <img ref={imageRef} alt="Saved signature or stamp" style={{ display: "block", maxWidth: "100%", width: "min(100%, 24rem)", maxHeight: "12rem", objectFit: "contain", objectPosition: "left center" }} /> : null}
            </div>
            <FormField label="Signature / stamp image" description="PNG or JPEG, up to 2 MB. Transparent PNG is preferred. Replacing it preserves signatures used on earlier certificates." errorText={fileError || signatureMutation.error?.message}>
              <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <FileUpload
                value={selectedFile ? [selectedFile] : []}
                onChange={({ detail }) => chooseFile(detail.value[0] ?? null)}
                accept=".png,.jpg,.jpeg"
                i18nStrings={{ uploadButtonText: () => "Choose signature image", dropzoneText: () => "Drop signature image", removeFileAriaLabel: () => "Remove selected signature image", limitShowFewer: "Show fewer files", limitShowMore: "Show more files", errorIconAriaLabel: "Error" }}
              />
              </fieldset>
            </FormField>
            <Button variant="primary" disabled={busy || !selectedFile || Boolean(fileError)} loading={signatureMutation.isPending} onClick={() => selectedFile && signatureMutation.mutate(selectedFile)}>
              Save signature
            </Button>
          </SpaceBetween>
        </ColumnLayout>
      ) : null}
    </Container>
  );
}
