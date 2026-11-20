import { Alert, Box, Button, FormField, Modal, SpaceBetween, Textarea } from "@cloudscape-design/components";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { permanentlyDeleteHRAdminItem, type HRAdminDeletableKind } from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";

export interface PermanentDeleteTarget {
  id: string;
  displayId: string;
  label: string;
}

export function PermanentDeleteModal({
  kind,
  target,
  onDismiss,
}: {
  kind: HRAdminDeletableKind;
  target: PermanentDeleteTarget;
  onDismiss: () => void;
}) {
  const [reason, setReason] = useState("");
  const { success } = useFlashbar();
  const queryClient = useQueryClient();
  const deletion = useMutation({
    mutationFn: () => permanentlyDeleteHRAdminItem(kind, target.id, reason.trim()),
    onSuccess: ({ queued_document_count = 0, retained_legacy_document_count = 0 }) => {
      const details = [
        `${target.label} (${target.displayId}) was removed.`,
        queued_document_count > 0 ? "Unreferenced HR/Admin uploads are queued for removal." : "",
        retained_legacy_document_count > 0 ? "Legacy files without verified upload ownership were retained in storage." : "",
      ];
      success("Permanently deleted", details.filter(Boolean).join(" "));
      void queryClient.invalidateQueries({ queryKey: ["hr-admin"] });
      onDismiss();
    },
  });
  const isRecord = kind === "COMPLIANCE_RECORD";

  return (
    <Modal
      visible
      header="Permanently delete?"
      onDismiss={() => { if (!deletion.isPending) onDismiss(); }}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled={deletion.isPending} onClick={onDismiss}>Cancel</Button>
            <Button
              variant="primary"
              loading={deletion.isPending}
              disabled={reason.trim().length < 3 || reason.trim().length > 500}
              onClick={() => deletion.mutate()}
            >
              Permanently delete
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Alert type="warning">
          <strong>{target.label}</strong> ({target.displayId}) will be permanently deleted.
          {isRecord && " This removes the record and all its versions."} This action cannot be undone.
        </Alert>
        {deletion.error && <Alert type="error">{deletion.error.message}</Alert>}
        <FormField label="Deletion reason" constraintText="Required. 3–500 characters.">
          <Textarea
            ariaLabel="Deletion reason"
            value={reason}
            disabled={deletion.isPending}
            onChange={({ detail }) => setReason(detail.value)}
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}
