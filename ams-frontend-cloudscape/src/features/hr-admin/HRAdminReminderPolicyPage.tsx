import {
  Alert,
  Box,
  Button,
  Container,
  ContentLayout,
  Form,
  FormField,
  Header,
  Input,
  SpaceBetween,
  StatusIndicator,
  Table,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import {
  getHRAdminNotificationConfiguration,
  listComplianceRecordTypes,
  updateHRAdminNotificationConfiguration,
} from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";
import type { ComplianceRecordType, ProductNotificationConfiguration } from "../../types/ams";
import { humanizeEnum } from "../../utils/format";

type PolicyPreviewRow = {
  checkpoint: string;
  timing: string;
};

const DEFAULT_REMINDER_DAYS = [30, 7, 1];

function parseReminderDays(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_REMINDER_DAYS;
  }
  return trimmed.split(",").map((part) => Number(part.trim()));
}

function formatReminderDays(days: number[] | null | undefined) {
  const values = days && days.length > 0 ? days : DEFAULT_REMINDER_DAYS;
  return values.join(", ");
}

function intValue(value: ComplianceRecordType["default_validity_months"]) {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object" && value.Valid && typeof value.Int32 === "number") {
    return value.Int32;
  }
  return null;
}

function validityCopy(recordType: ComplianceRecordType) {
  const months = intValue(recordType.default_validity_months);
  if (recordType.renewal_behavior === "ONE_TIME") {
    return "One time";
  }
  if (!months) {
    return "No default expiry";
  }
  return `${months} ${months === 1 ? "month" : "months"}`;
}

function policySourceCopy(recordType: ComplianceRecordType) {
  return recordType.reminder_policy_days && recordType.reminder_policy_days.length > 0
    ? "Record type override"
    : "Default policy";
}

function validateReminderDays(value: string) {
  const days = parseReminderDays(value);
  if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 3650)) {
    return "Reminder days must be whole numbers between 0 and 3650.";
  }
  return "";
}

function buildPreviewRows(value: string): PolicyPreviewRow[] {
  const validation = validateReminderDays(value);
  if (validation) {
    return [];
  }
  return parseReminderDays(value).map((day, index) => ({
    checkpoint: `Reminder ${index + 1}`,
    timing: day === 0 ? "On expiry date" : `${day} ${day === 1 ? "day" : "days"} before expiry`,
  }));
}

function buildPayload(config: ProductNotificationConfiguration, defaultReminderDays: number[]) {
  return {
    email_recipients: config.email_recipients || "",
    clickup_list_id: config.clickup_list_id || "",
    clickup_assignee_ids: config.clickup_assignee_ids || "",
    default_reminder_days: defaultReminderDays,
  };
}

function ReminderPolicyForm({
  config,
  recordTypes,
}: {
  config: ProductNotificationConfiguration;
  recordTypes: ComplianceRecordType[];
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { success } = useFlashbar();
  const [reminderDaysText, setReminderDaysText] = useState(() =>
    formatReminderDays(config.default_reminder_days)
  );
  const [errorMessage, setErrorMessage] = useState("");

  const previewRows = useMemo(() => buildPreviewRows(reminderDaysText), [reminderDaysText]);

  const columns = useMemo<TableProps.ColumnDefinition<PolicyPreviewRow>[]>(
    () => [
      {
        id: "checkpoint",
        header: "Checkpoint",
        cell: (item) => item.checkpoint,
      },
      {
        id: "timing",
        header: "Timing",
        cell: (item) => item.timing,
      },
    ],
    []
  );
  const recordTypeColumns = useMemo<TableProps.ColumnDefinition<ComplianceRecordType>[]>(
    () => [
      {
        id: "type",
        header: "Record type",
        cell: (item) => (
          <div>
            <strong>{item.type_name}</strong>
            <br />
            <Box color="text-body-secondary">{humanizeEnum(item.subject_type)}</Box>
          </div>
        ),
      },
      {
        id: "validity",
        header: "Default expiry",
        cell: (item) => validityCopy(item),
      },
      {
        id: "policy",
        header: "Reminder policy",
        cell: (item) => (
          <div>
            {formatReminderDays(item.reminder_policy_days)}
            <br />
            <Box color="text-body-secondary">{policySourceCopy(item)}</Box>
          </div>
        ),
      },
    ],
    []
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      updateHRAdminNotificationConfiguration(buildPayload(config, parseReminderDays(reminderDaysText))),
    onSuccess: () => {
      success("Reminder policy saved", "Default reminder timing was updated.");
      void queryClient.invalidateQueries({ queryKey: ["hr-admin", "notification-configuration"] });
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
    },
  });

  const saveReminderPolicy = () => {
    const validation = validateReminderDays(reminderDaysText);
    if (validation) {
      setErrorMessage(validation);
      return;
    }
    setErrorMessage("");
    saveMutation.mutate();
  };

  return (
    <ContentLayout
      header={
        <Header
          description="Default renewal reminders for record types that do not define their own schedule."
          variant="h1"
        >
          Reminder Policy
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container
          header={
            <Header
              description="Record type overrides stay on the individual record type."
              variant="h2"
            >
              Default schedule
            </Header>
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveReminderPolicy();
            }}
          >
            <Form
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button
                    disabled={saveMutation.isPending}
                    onClick={() => {
                      setReminderDaysText(formatReminderDays(config.default_reminder_days));
                      setErrorMessage("");
                    }}
                  >
                    Reset
                  </Button>
                  <Button formAction="submit" loading={saveMutation.isPending} variant="primary">
                    Save policy
                  </Button>
                </SpaceBetween>
              }
            >
              <SpaceBetween size="l">
                {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
                <FormField
                  constraintText="Comma-separated whole numbers. Blank saves the product default: 30, 7, 1."
                  description="Days before expiry."
                  label="Default reminder days"
                >
                  <Input
                    ariaLabel="Default reminder days"
                    value={reminderDaysText}
                    onChange={({ detail }) => {
                      setReminderDaysText(detail.value);
                      setErrorMessage("");
                    }}
                  />
                </FormField>
              </SpaceBetween>
            </Form>
          </form>
        </Container>

        <Container header={<Header variant="h2">Policy preview</Header>}>
          <SpaceBetween size="m">
            <StatusIndicator type={previewRows.length > 0 ? "success" : "pending"}>
              {previewRows.length > 0 ? `${previewRows.length} reminder checkpoints` : "Enter valid reminder days"}
            </StatusIndicator>
            <Table
              columnDefinitions={columns}
              empty={
                <Box color="text-body-secondary" textAlign="center">
                  No valid reminder checkpoints to preview.
                </Box>
              }
              items={previewRows}
              variant="embedded"
            />
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header
              actions={<Button onClick={() => navigate("/hr-admin/record-types")}>Manage record types</Button>}
              description="Record types can override the default schedule with their own 1, 2, or 3 month reminder timing."
              variant="h2"
            >
              Record type policies
            </Header>
          }
        >
          <Table
            columnDefinitions={recordTypeColumns}
            empty={
              <Box color="text-body-secondary" textAlign="center">
                No record types have been configured yet.
              </Box>
            }
            items={recordTypes}
            trackBy="record_type_id"
            variant="embedded"
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}

export function HRAdminReminderPolicyPage() {
  const configQuery = useQuery({
    queryKey: ["hr-admin", "notification-configuration"],
    queryFn: getHRAdminNotificationConfiguration,
  });
  const recordTypesQuery = useQuery({
    queryKey: ["hr-admin", "compliance-record-types"],
    queryFn: () => listComplianceRecordTypes(1, 100),
  });

  if (configQuery.isLoading || recordTypesQuery.isLoading) {
    return <PageLoading>{"Loading HR/Admin reminder policy..."}</PageLoading>;
  }

  if (configQuery.isError || recordTypesQuery.isError || !configQuery.data || !recordTypesQuery.data) {
    return (
      <PageError
        description="The HR/Admin reminder policy could not be loaded."
        onRetry={() => {
          void configQuery.refetch();
          void recordTypesQuery.refetch();
        }}
      />
    );
  }

  return (
    <ReminderPolicyForm
      config={configQuery.data}
      key={`${configQuery.data.updated_at}-${formatReminderDays(configQuery.data.default_reminder_days)}`}
      recordTypes={recordTypesQuery.data.data}
    />
  );
}
