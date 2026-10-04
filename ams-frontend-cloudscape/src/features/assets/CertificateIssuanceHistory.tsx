import { Alert, Box, Button, Container, FormField, Header, Modal, Pagination, SpaceBetween, StatusIndicator, Table } from "@cloudscape-design/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getCertificateHistoryDocument, listCertificateHistory, recoverCertificateIssuance, type CertificateHistory, type IssuanceRecoveryAction } from "../../lib/api/certificate-issuance";
import { formatDate, formatDateTime, humanizeEnum } from "../../utils/format";

export function CertificateIssuanceHistory({ certificateId }: { certificateId: string }) {
  const [page, setPage] = useState(1);
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmation, setConfirmation] = useState<CertificateHistory | null>(null);
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: ["issuances", certificateId, page], queryFn: () => listCertificateHistory(certificateId, page) });
  const openDocument = async (id: string) => {
    // Open synchronously to avoid popup blockers after the signed URL request.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setOpening(id); setError("");
    try {
      const response = await getCertificateHistoryDocument(certificateId, id);
      if (tab) tab.location.href = response.url;
      else setError("Allow popups to open the issued certificate, then try again.");
    } catch (failure) {
      tab?.close(); setError(failure instanceof Error ? failure.message : "Could not open the issued document.");
    } finally { setOpening(""); }
  };
  const recover = async (item: CertificateHistory, action: IssuanceRecoveryAction, file?: File) => {
    setBusy(item.history_id); setError("");
    try {
      const result = await recoverCertificateIssuance(certificateId, item.history_id, action, file);
      if (result.state === "PROCESSING" || result.cleanup_state === "PENDING") setError("This approval is still processing. Refresh issuance history before trying again.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not recover this approval.");
    } finally {
      // Errors may still have persisted an approval or cleanup outcome.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["issuances", certificateId] }),
        queryClient.invalidateQueries({ queryKey: ["issuance-status", certificateId] }),
        queryClient.invalidateQueries({ queryKey: ["certificate", certificateId] }),
        queryClient.invalidateQueries({ queryKey: ["certificates"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["asset-dashboard"] }),
      ]);
      setBusy(""); setConfirmation(null);
    }
  };
  return <section aria-label="Certificate issuance history">
    <Container header={<Header variant="h2" description="Generated certificates, external renewals and legacy uploads. Legacy uploads have no complete historical snapshot." actions={<Button onClick={() => void history.refetch()}>Refresh issuance history</Button>}>Issuance history</Header>}>
      <SpaceBetween size="m">
        {error ? <Alert type="error">{error}</Alert> : null}
        {history.isError ? <Alert type="error" action={<Button onClick={() => void history.refetch()}>Retry issuance history</Button>}>{history.error.message}</Alert> : null}
        <Table items={history.data?.data ?? []} trackBy="history_id" loading={history.isPending} loadingText="Loading issuance history" wrapLines
          empty={<Box>No issued or approved certificates recorded.</Box>}
          pagination={<Pagination currentPageIndex={page} pagesCount={Math.max(1, Math.ceil((history.data?.meta.total ?? 0) / 20))} onChange={({ detail }) => setPage(detail.currentPageIndex)} />}
          columnDefinitions={[
            { id: "source", header: "Source", cell: item => item.source === "LEGACY" ? "Legacy upload" : item.source === "EXTERNAL" ? "External renewal" : "Generated certificate" },
            { id: "number", header: "Document / file", cell: item => item.document_number || item.file_name },
            { id: "state", header: "Status", cell: item => <StatusIndicator type={item.state === "COMPLETED" ? "success" : item.state === "FAILED" ? "error" : item.state === "PROCESSING" ? "in-progress" : "pending"}>{humanizeEnum(item.state)}</StatusIndicator> },
            { id: "date", header: "Issue / expiry", cell: item => item.snapshot_available ? `${formatDate(item.issue_date)} / ${item.expiry_date ? formatDate(item.expiry_date) : "No expiry"}` : "Not recorded" },
            { id: "signer", header: "Signer", cell: item => item.snapshot_available ? `${item.signer_name} — ${item.signer_organization}` : "Historical snapshot unavailable" },
            { id: "approved", header: "Recorded", cell: item => formatDateTime(item.recorded_at) },
            { id: "document", header: "Document", cell: item => item.state === "COMPLETED" || item.state === "LEGACY" ? <Button loading={opening === item.history_id} disabled={Boolean(opening)} onClick={() => void openDocument(item.history_id)}>{item.source === "GENERATED" ? "View issued PDF" : "View uploaded document"}</Button> : <Box>Current certificate unchanged</Box> },
            { id: "recovery", header: "Recovery", cell: item => <RecoveryActions item={item} busy={Boolean(busy)} loading={busy === item.history_id} retry={file => void recover(item, "retry", file)} abandon={() => setConfirmation(item)} cleanup={() => void recover(item, "cleanup")} /> },
          ]} />
      </SpaceBetween>
    </Container>
    <Modal visible={Boolean(confirmation)} onDismiss={() => { if (!busy) setConfirmation(null); }} header="Abandon this approval?"
      footer={<Box float="right"><SpaceBetween direction="horizontal" size="xs"><Button disabled={Boolean(busy)} onClick={() => setConfirmation(null)}>Cancel</Button><Button variant="primary" loading={Boolean(busy)} onClick={() => { if (confirmation) void recover(confirmation, "abandon"); }}>Abandon approval</Button></SpaceBetween></Box>}>
      The approval cannot be retried after abandonment. Its unissued file will be deleted. The approval record and any reserved document number will remain in history, and the current certificate will stay unchanged.
    </Modal>
  </section>;
}

function RecoveryActions({ item, busy, loading, retry, abandon, cleanup }: { item: CertificateHistory; busy: boolean; loading: boolean; retry: (file?: File) => void; abandon: () => void; cleanup: () => void }) {
  const [file, setFile] = useState<File>();
  const [fileError, setFileError] = useState("");
  if (item.state === "COMPLETED" || item.state === "LEGACY") return <Box>—</Box>;
  return <SpaceBetween size="xs">
    {item.failure_code === "STALE_CERTIFICATE" ? <Box>The current certificate changed. Abandon this approval and prepare a new renewal.</Box> : item.state === "FAILED" ? <Box>The approved renewal was not published. Retry uses its saved details.</Box> : null}
    {item.state === "ABANDONED" ? <Box>{item.cleanup_state === "DELETED" ? "Abandoned; unissued file deleted." : item.cleanup_state === "FAILED" ? "Abandoned; file deletion failed." : "Abandoned; file deletion pending."}</Box> : null}
    {item.can_retry && item.source === "EXTERNAL" ? <FormField label="Original renewal file (if needed)" description="Required if storage never received the file. Choose the same original file; its contents will be verified." errorText={fileError}>
      <input type="file" aria-label={`Original renewal file for ${item.file_name}`} accept=".pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const next = event.target.files?.[0]; setFileError(next && next.size > 10 * 1024 * 1024 ? "Choose a file no larger than 10MB." : ""); setFile(next && next.size <= 10 * 1024 * 1024 ? next : undefined); }} />
    </FormField> : null}
    {item.can_retry ? <Button disabled={busy || Boolean(fileError)} loading={loading} onClick={() => retry(file)}>Retry issuance</Button> : null}
    {item.can_abandon ? <Button disabled={busy} onClick={abandon}>Abandon approval</Button> : null}
    {item.can_retry_cleanup ? <Button disabled={busy} loading={loading} onClick={cleanup}>Retry file deletion</Button> : null}
  </SpaceBetween>;
}
