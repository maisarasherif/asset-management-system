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
import { PageError, PageLoading } from "../../components/shared/PageStates";
import {
  getHRAdminNotificationConfiguration,
  updateHRAdminNotificationConfiguration,
} from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";
import type { ProductNotificationConfiguration } from "../../types/ams";

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

function ReminderPolicyForm({ config }: { config: ProductNotificationConfiguration }) {
  const queryClient = useQueryClient();
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
      </SpaceBetween>
    </ContentLayout>
  );
}

export function HRAdminReminderPolicyPage() {
  const configQuery = useQuery({
    queryKey: ["hr-admin", "notification-configuration"],
    queryFn: getHRAdminNotificationConfiguration,
  });

  if (configQuery.isLoading) {
    return <PageLoading>{"Loading HR/Admin reminder policy..."}</PageLoading>;
  }

  if (configQuery.isError || !configQuery.data) {
    return (
      <PageError
        description="The HR/Admin reminder policy could not be loaded."
        onRetry={() => {
          void configQuery.refetch();
        }}
      />
    );
  }

  return (
    <ReminderPolicyForm
      config={configQuery.data}
      key={`${configQuery.data.updated_at}-${formatReminderDays(configQuery.data.default_reminder_days)}`}
    />
  );
}
