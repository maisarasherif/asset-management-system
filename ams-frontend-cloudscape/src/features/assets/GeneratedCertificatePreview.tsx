import { Alert, Box, Button, ColumnLayout, FormField, Modal, SpaceBetween, Textarea } from "@cloudscape-design/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { approveGeneratedCertificate, getCertificateIssuance, type CertificateIssuance } from "../../lib/api/certificate-issuance";
import { ApiError } from "../../lib/api/client";
import { useFlashbar } from "../../providers/flashbar-context";
import { useEffect, useRef, useState } from "react";
import { prepareCertificatePreview, type CertificatePreview } from "../../lib/api/certificate-preview";

function addMonths(value: string, months: number) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), last));
  return first.toISOString().slice(0, 10);
}

export function GeneratedCertificatePreview({ certificateId, signerId, issueDate, expiryDate, validityMonths, requiresRenewal, onIssuingChange }: {
  certificateId: string; signerId: string; issueDate: string; expiryDate: string; validityMonths: number | null; requiresRenewal: boolean; onIssuingChange?: (value: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const flash = useFlashbar();
  const [confirmation, setConfirmation] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [approved, setApproved] = useState<CertificateIssuance | null>(null);
  const approvalPending = useRef<AbortController | null>(null);
  useEffect(() => () => approvalPending.current?.abort(), []);
  const [issue, setIssue] = useState(issueDate);
  const [expiry, setExpiry] = useState(requiresRenewal ? expiryDate : "");
  const [remarks, setRemarks] = useState("");
  const [measurements, setMeasurements] = useState("");
  const [review, setReview] = useState<{ response: CertificatePreview; url: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const handledStatus = useRef("");
  const processing = approved?.state === "PROCESSING" || approved?.state === "APPROVED";
  useEffect(() => { onIssuingChange?.(issuing || processing); return () => onIssuingChange?.(false); }, [issuing, processing, onIssuingChange]);
  const status = useQuery({
    queryKey: ["issuance-status", certificateId, approved?.issuance_id],
    queryFn: ({ signal }) => getCertificateIssuance(certificateId, approved!.issuance_id, signal),
    // A failed approval stays observable so recovery in history can invalidate it.
    enabled: Boolean(approved && approved.state !== "COMPLETED" && approved.state !== "ABANDONED"),
    refetchInterval: query => query.state.data && query.state.data.state !== "PROCESSING" && query.state.data.state !== "APPROVED" ? false : processing ? 2000 : false,
  });
  useEffect(() => {
    if (!status.data || status.data.state === "PROCESSING" || status.data.state === "APPROVED") return;
    const identity = `${status.data.issuance_id}:${status.data.state}`;
    if (handledStatus.current === identity) return;
    handledStatus.current = identity;
    setApproved(status.data);
    if (status.data.state === "ABANDONED") { setReview(null); setConfirmation(false); setError(""); }
    if (status.data.state === "COMPLETED") {
      setReview(null); setConfirmation(false); setError(""); flash.success("Certificate issued", status.data.document_number);
      void queryClient.invalidateQueries({ queryKey: ["certificate", certificateId] });
      void queryClient.invalidateQueries({ queryKey: ["certificates"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["asset-dashboard"] });
    }
    void queryClient.invalidateQueries({ queryKey: ["issuances", certificateId] });
  }, [status.data, certificateId, queryClient, flash]);

  useEffect(() => () => { pending.current?.abort(); }, []);
  useEffect(() => {
    if (!review || issuing) return;
    const timer = window.setTimeout(() => { setExpired(true); setConfirmation(false); setReview(null); }, Math.max(0, Date.parse(review.response.expires_at) - Date.now()));
  return () => { clearTimeout(timer); };
  }, [review, issuing]);
  useEffect(() => { if (review) return () => URL.revokeObjectURL(review.url); }, [review]);
  const discard = () => {
    if (issuing) return;
    setConfirmation(false);
    pending.current?.abort(); pending.current = null;
    setLoading(false); setReview(null); setExpired(false); setError("");
  };
  const invalidDates = !/^\d{4}-\d{2}-\d{2}$/.test(issue) || (requiresRenewal && (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || expiry <= issue));
  const invalidText = [...remarks].length > 4000 || [...measurements].length > 4000;
  const preview = async () => {
    discard();
    const controller = new AbortController(); pending.current = controller; setLoading(true);
    try {
      const response = await prepareCertificatePreview(certificateId, { signer_id: signerId, issue_date: issue, expiry_date: expiry, remarks, measurements }, controller.signal);
      if (controller.signal.aborted) return;
      const bytes = Uint8Array.from(atob(response.pdf_base64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setReview({ response, url });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not prepare the preview. Try again.");
    } finally {
      if (pending.current === controller) { pending.current = null; setLoading(false); }
    }
  };
  const approve = async () => {
    if (!review || issuing) return;
    const controller = new AbortController(); approvalPending.current = controller;
    setIssuing(true); setError("");
    try {
      const result = await approveGeneratedCertificate(certificateId, review.response.preview_token, controller.signal);
      if (controller.signal.aborted) return;
      setApproved(result); setConfirmation(false);
      if (result.state === "COMPLETED") {
        setReview(null);
        flash.success("Certificate issued", result.document_number);
        await queryClient.invalidateQueries({ queryKey: ["certificate", certificateId] });
        await queryClient.invalidateQueries({ queryKey: ["certificates"] });
        await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        await queryClient.invalidateQueries({ queryKey: ["asset-dashboard"] });
      }
      await queryClient.invalidateQueries({ queryKey: ["issuances", certificateId] });
    } catch (failure) {
      if (!controller.signal.aborted) {
        setConfirmation(false);
        setError(failure instanceof Error ? failure.message : "Could not confirm issuance. Repeating this approval uses the same number.");
        if (failure instanceof ApiError && typeof failure.body === "object" && failure.body !== null && "issuance" in failure.body) {
          setApproved(failure.body.issuance as CertificateIssuance);
          await queryClient.invalidateQueries({ queryKey: ["issuances", certificateId] });
        }
      }
    } finally { if (approvalPending.current === controller) { approvalPending.current = null; setIssuing(false); } }
  };
  return (
    <section aria-label="Generated certificate preview">
      <SpaceBetween direction="vertical" size="m">
        <Box color="text-body-secondary">Review the examination certificate before issuance. Equipment, component, test references, and signing details are filled automatically.</Box>
        <fieldset disabled={issuing || processing} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><legend style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>Examination details</legend><ColumnLayout columns={2}>
          <FormField label="Generated certificate issue date">
            <input type="date" className="app-native-input" aria-label="Generated certificate issue date" value={issue} onChange={(event) => {
              discard(); setIssue(event.target.value);
              if (requiresRenewal && validityMonths) setExpiry(addMonths(event.target.value, validityMonths));
            }} />
          </FormField>
          {requiresRenewal ? <FormField label="Generated certificate expiry date" description="Filled from the test validity period; adjust if needed.">
            <input type="date" className="app-native-input" aria-label="Generated certificate expiry date" value={expiry} onChange={(event) => { discard(); setExpiry(event.target.value); }} />
          </FormField> : <Box>This test has no expiry date.</Box>}
        </ColumnLayout>
        <FormField label="Test remarks (optional)" description="Up to 4000 characters. Line breaks are preserved." errorText={[...remarks].length > 4000 ? "Use at most 4000 characters." : undefined}>
          <Textarea ariaLabel="Test remarks (optional)" value={remarks} rows={3} onChange={({ detail }) => { discard(); setRemarks(detail.value); }} />
        </FormField>
        <FormField label="Measurements (optional)" description="Up to 4000 characters." errorText={[...measurements].length > 4000 ? "Use at most 4000 characters." : undefined}>
          <Textarea ariaLabel="Measurements (optional)" value={measurements} rows={3} onChange={({ detail }) => { discard(); setMeasurements(detail.value); }} />
        </FormField>
        </fieldset>
        {approved?.state === "ABANDONED" ? <Alert type="info">Approval {approved.document_number} was abandoned. Its reserved number remains in history. Prepare a new preview to issue a certificate.</Alert> : approved && approved.state !== "COMPLETED" ? <Alert type={approved.state === "FAILED" ? "warning" : "info"}>Approval saved as {approved.document_number}. The current certificate is unchanged. Check issuance history for status.</Alert> : null}
        {status.isError && processing ? <Alert type="warning" action={<Button onClick={() => void status.refetch()}>Check issuance status</Button>}>Could not check the saved approval. Its number is retained; issuance history is available after reload.</Alert> : null}
        {error ? <Alert type="error">{error}</Alert> : null}
        {expired ? <Alert type="info">This preview expired. Your entered details are kept; create and review a fresh preview.</Alert> : null}
        <SpaceBetween direction="horizontal" size="s">
          <Button variant="primary" loading={loading} disabled={invalidDates || invalidText || loading || issuing || processing} onClick={() => void preview()}>{review ? "Refresh PDF preview" : "Preview examination certificate"}</Button>
          {review || loading ? <Button disabled={issuing} onClick={discard}>Cancel PDF preview</Button> : null}
        </SpaceBetween>
        {review ? <section aria-label="Examination certificate PDF review">
          <SpaceBetween direction="vertical" size="m">
            <Alert type="info">Preview only. The certificate has not been renewed. The sequence is assigned when issuance is approved.</Alert>
            <Box><strong>{review.response.document_number}</strong></Box>
            <Box>Valid for {review.response.snapshot.validity_period} · Preview expires at {new Date(review.response.expires_at).toLocaleTimeString()}</Box>
            <SpaceBetween direction="horizontal" size="s"><Button href={review.url} target="_blank">Open PDF preview</Button><Button variant="primary" disabled={issuing || processing || Date.parse(review.response.expires_at) <= Date.now()} loading={issuing} onClick={() => setConfirmation(true)}>Approve and issue certificate</Button></SpaceBetween>
            <iframe title="Examination certificate PDF preview" src={review.url} style={{ width: "100%", boxSizing: "border-box", display: "block", height: "65vh", minHeight: 320, border: "1px solid var(--color-border-divider-default, #d7e0e8)" }} />
          </SpaceBetween>
        </section> : null}
      </SpaceBetween>
      <Modal visible={confirmation} header="Issue examination certificate" onDismiss={() => { if (!issuing) setConfirmation(false); }}
        closeAriaLabel="Close issuance confirmation" footer={<SpaceBetween direction="horizontal" size="s"><Button disabled={issuing} onClick={() => setConfirmation(false)}>Back to review</Button><Button variant="primary" loading={issuing} disabled={issuing || !review} onClick={() => void approve()}>Confirm issuance</Button></SpaceBetween>}>
        Approve the reviewed examination details and signature. This assigns the final certificate number and renews the certificate after its PDF is saved.
      </Modal>
    </section>
  );
}
