import { apiRequest } from "./client";

export interface SignatureVersion {
  signature_id: string;
  sha256: string;
  width: number;
  height: number;
  byte_size: number;
  created_at: string;
}

export interface SigningProfile {
  user_id: string;
  full_name: string;
  organization: string;
  competency_category_id: string | null;
  competency_category_name: string;
  competency_category_active: boolean;
  signature: SignatureVersion | null;
  updated_at: string;
}

const path = "/v1/account/signing-profile";

export function getOwnSigningProfile() {
  return apiRequest<SigningProfile>(path);
}

export function updateOwnSigningOrganization(organization: string) {
  return apiRequest<SigningProfile>(path, { method: "PUT", body: JSON.stringify({ organization }) });
}

export function uploadOwnSignature(file: File) {
  const body = new FormData();
  body.set("file", file);
  return apiRequest<SigningProfile>(`${path}/signature`, { method: "POST", body });
}

export function getOwnSignatureImage(signatureId: string) {
  return apiRequest<Blob>(`${path}/signatures/${encodeURIComponent(signatureId)}/file`, {}, { responseMode: "blob" });
}

export interface CompetentSigningProfile {
  competent_person_id: string;
  full_name: string;
  organization: string;
  active: boolean;
  competency_category_id: string;
  competency_category_name: string;
  competency_category_active: boolean;
  signature: SignatureVersion | null;
  updated_at: string;
}

export interface EligibleSigner {
  owner_kind: "ACCOUNT" | "COMPETENT_PERSON";
  signer_id: string;
  full_name: string;
  organization: string;
  competency_category_id: string;
  competency_category_name: string;
  signature: SignatureVersion;
}

const personPath = (personId: string) => `/v1/competent-person/${encodeURIComponent(personId)}/signing-profile`;
const accountPath = (userId: string) => `/v1/user/${encodeURIComponent(userId)}/signing-profile`;

export function getCompetentSigningProfile(personId: string) {
  return apiRequest<CompetentSigningProfile>(personPath(personId));
}
export function uploadCompetentSignature(personId: string, file: File) {
  const body = new FormData(); body.set("file", file);
  return apiRequest<CompetentSigningProfile>(`${personPath(personId)}/signature`, { method: "POST", body });
}
export function getCompetentSignatureImage(personId: string, signatureId: string) {
  return apiRequest<Blob>(`${personPath(personId)}/signatures/${encodeURIComponent(signatureId)}/file`, {}, { responseMode: "blob" });
}
export function getAdminSigningProfile(userId: string) {
  return apiRequest<SigningProfile>(accountPath(userId));
}
export function assignAdminSigningCategory(userId: string, categoryId: string | null) {
  return apiRequest<SigningProfile>(accountPath(userId), { method: "PUT", body: JSON.stringify({ competency_category_id: categoryId }) });
}
export function listGeneratedSigners(certificateId: string) {
  return apiRequest<EligibleSigner[]>(`/v1/certificate/${encodeURIComponent(certificateId)}/generated-signers`);
}
export function resolveGeneratedSigner(certificateId: string, signerId: string) {
  return apiRequest<EligibleSigner>(`/v1/certificate/${encodeURIComponent(certificateId)}/generated-signer`, { method: "POST", body: JSON.stringify({ signer_id: signerId }) });
}
