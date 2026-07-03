import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonDropdown,
  Container,
  ContentLayout,
  FormField,
  Header,
  Input,
  Modal,
  Select,
  SpaceBetween,
  Table,
  Textarea,
  type SelectProps,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { TableCellActions, TableCellText } from "../../components/shared/TableCells";
import {
  archiveHRAdminCompany,
  createHRAdminCompany,
  listHRAdminCompanies,
  updateHRAdminCompany,
} from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { HRAdminCompany, HRAdminCompanyInput, HRAdminCompanyKind } from "../../types/ams";
import { formatDateTime, humanizeEnum } from "../../utils/format";

const companyKindOptions: SelectProps.Option[] = [
  "LEGAL_ENTITY",
  "OFFICE",
  "STAFF_HOUSING",
  "WAREHOUSE",
  "YARD",
  "OTHER",
].map((value) => ({ label: humanizeEnum(value), value }));

type CompanyEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      company_code: string;
      company_name: string;
      company_kind: HRAdminCompanyKind;
      location: string;
    }
  | null;

type ArchiveTarget =
  | {
      id: string;
      label: string;
      reason: string;
    }
  | null;

function statusBadge(status: HRAdminCompany["status"]) {
  return <Badge color={status === "ACTIVE" ? "green" : "grey"}>{humanizeEnum(status)}</Badge>;
}

function toCompanyInput(editor: NonNullable<CompanyEditor>): HRAdminCompanyInput {
  return {
    company_code: editor.company_code.trim(),
    company_name: editor.company_name.trim(),
    company_kind: editor.company_kind,
    location: editor.location.trim(),
  };
}

function isCompactViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches;
}

function CompanyEditorModal({
  editor,
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
}: {
  editor: CompanyEditor;
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<CompanyEditor>) => void;
}) {
  const [draft, setDraft] = useState<CompanyEditor>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  const selectedKind = companyKindOptions.find((option) => option.value === draft?.company_kind) ?? null;

  return (
    <Modal
      visible={Boolean(editor)}
      header={draft?.mode === "edit" ? "Edit company" : "Create company"}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Cancel</Button>
          <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
            {draft?.mode === "edit" ? "Save changes" : "Create company"}
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Company code" description="Optional internal reference. Leave blank if HR/Admin will assign it later.">
          <Input
            value={draft?.company_code || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, company_code: detail.value })
            }
          />
        </FormField>
        <FormField label="Company name" constraintText="Required">
          <Input
            value={draft?.company_name || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, company_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Company kind">
          <Select
            ariaLabel="Company kind"
            options={companyKindOptions}
            selectedOption={selectedKind}
            onChange={({ detail }) =>
              setDraft(
                (current) =>
                  current && {
                    ...current,
                    company_kind: (detail.selectedOption.value || "OTHER") as HRAdminCompanyKind,
                  }
              )
            }
          />
        </FormField>
        <FormField label="Location">
          <Input
            value={draft?.location || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, location: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

function ArchiveCompanyModal({
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
  target,
}: {
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (target: NonNullable<ArchiveTarget>) => void;
  target: ArchiveTarget;
}) {
  const [draft, setDraft] = useState<ArchiveTarget>(target);

  useEffect(() => {
    setDraft(target);
  }, [target]);

  return (
    <Modal
      visible={Boolean(target)}
      header={`Archive ${draft?.label || "company"}?`}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Keep company</Button>
          <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
            Archive company
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="l">
        <Alert type="warning">
          Archived companies stay visible for history, but HR/Admin renewal work will ignore their records.
        </Alert>
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Archive reason" constraintText="Required">
          <Textarea
            value={draft?.reason || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, reason: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

export function HRAdminCompaniesPage() {
  const queryClient = useQueryClient();
  const { success } = useFlashbar();
  const { getProductRole } = useAuth();
  const hrRole = getProductRole("HR_ADMIN");
  const canWrite = hrRole === "ADMIN" || hrRole === "USER";
  const canArchive = hrRole === "ADMIN";
  const [filterText, setFilterText] = useState("");
  const [compactTable, setCompactTable] = useState(() => isCompactViewport());
  const [editor, setEditor] = useState<CompanyEditor>(null);
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget>(null);
  const [modalError, setModalError] = useState("");

  const companiesQuery = useQuery({
    queryKey: ["hr-admin", "companies"],
    queryFn: () => listHRAdminCompanies(1, 100),
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 700px)");
    const syncTableMode = () => setCompactTable(mediaQuery.matches);
    syncTableMode();
    mediaQuery.addEventListener("change", syncTableMode);
    return () => mediaQuery.removeEventListener("change", syncTableMode);
  }, []);

  const invalidateCompanies = () =>
    queryClient.invalidateQueries({ queryKey: ["hr-admin", "companies"] });

  const saveCompanyMutation = useMutation<unknown, Error, NonNullable<CompanyEditor>>({
    mutationFn: (draft) =>
      draft.mode === "edit" && draft.id
        ? updateHRAdminCompany(draft.id, toCompanyInput(draft))
        : createHRAdminCompany(toCompanyInput(draft)),
    onSuccess: (_response, draft) => {
      setEditor(null);
      setModalError("");
      success(
        draft.mode === "edit" ? "Company updated" : "Company created",
        draft.mode === "edit" ? "The company record was saved." : "The company is ready for compliance records."
      );
      void invalidateCompanies();
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
    },
  });

  const archiveCompanyMutation = useMutation({
    mutationFn: (target: NonNullable<ArchiveTarget>) =>
      archiveHRAdminCompany(target.id, target.reason.trim()),
    onSuccess: () => {
      setArchiveTarget(null);
      setModalError("");
      success("Company archived", "Renewal work will ignore this company while retaining history.");
      void invalidateCompanies();
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
    },
  });

  const companies = useMemo(() => companiesQuery.data?.data ?? [], [companiesQuery.data?.data]);
  const filteredCompanies = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return companies;
    }

    return companies.filter((company) =>
      [
        company.company_code,
        company.company_name,
        humanizeEnum(company.company_kind),
        company.location,
        company.status,
        company.display_id,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [companies, filterText]);

  const columns = useMemo<TableProps.ColumnDefinition<HRAdminCompany>[]>(() => {
    const editCompany = (item: HRAdminCompany) => {
      setModalError("");
      setEditor({
        mode: "edit",
        id: item.company_id,
        company_code: item.company_code || "",
        company_name: item.company_name,
        company_kind: item.company_kind,
        location: item.location || "",
      });
    };
    const archiveCompanyRow = (item: HRAdminCompany) => {
      setModalError("");
      setArchiveTarget({
        id: item.company_id,
        label: item.company_name,
        reason: "",
      });
    };
    const rowActions = (item: HRAdminCompany) => {
      if (canArchive && item.status === "ACTIVE") {
        return (
          <ButtonDropdown
            ariaLabel={`Actions for ${item.company_name}`}
            expandToViewport
            items={[
              { id: "edit", text: "Edit" },
              { id: "archive", text: "Archive" },
            ]}
            onItemClick={({ detail }) => {
              if (detail.id === "edit") {
                editCompany(item);
                return;
              }
              archiveCompanyRow(item);
            }}
          >
            Actions
          </ButtonDropdown>
        );
      }

      if (canWrite && item.status === "ACTIVE") {
        return <Button onClick={() => editCompany(item)}>Edit</Button>;
      }

      return <Box color="text-body-secondary">View only</Box>;
    };

    if (compactTable) {
      return [
        {
          id: "company",
          header: "Company",
          minWidth: 210,
          cell: (item) => (
            <TableCellText title={item.company_name}>
              <strong>{item.company_name}</strong>
              <br />
              {[item.company_code, humanizeEnum(item.company_kind)].filter(Boolean).join(" | ") ||
                item.display_id}
              {canWrite && item.status === "ACTIVE" ? (
                <div className="hr-admin-persons__compact-actions">{rowActions(item)}</div>
              ) : null}
            </TableCellText>
          ),
        },
        {
          id: "status",
          header: "Status",
          width: 92,
          minWidth: 90,
          cell: (item) => statusBadge(item.status),
        },
      ];
    }

    return [
      {
        id: "company",
        header: "Company",
        width: "24%",
        minWidth: 220,
        cell: (item) => (
          <TableCellText title={item.company_name}>
            <strong>{item.company_name}</strong>
            <br />
            {item.company_code || item.display_id}
          </TableCellText>
        ),
      },
      {
        id: "kind",
        header: "Kind",
        width: "18%",
        minWidth: 160,
        cell: (item) => humanizeEnum(item.company_kind),
      },
      {
        id: "location",
        header: "Location",
        width: "22%",
        minWidth: 200,
        cell: (item) => <TableCellText title={item.location || "-"}>{item.location || "-"}</TableCellText>,
      },
      {
        id: "status",
        header: "Status",
        width: 130,
        minWidth: 120,
        cell: (item) => statusBadge(item.status),
      },
      {
        id: "updated",
        header: "Updated",
        width: 180,
        minWidth: 170,
        cell: (item) => formatDateTime(item.updated_at),
      },
      {
        id: "actions",
        header: "Actions",
        width: 140,
        minWidth: 130,
        cell: (item) => <TableCellActions>{rowActions(item)}</TableCellActions>,
      },
    ];
  }, [canArchive, canWrite, compactTable]);

  const saveCompany = (draft: NonNullable<CompanyEditor>) => {
    if (!draft.company_name.trim()) {
      setModalError("Enter the company name.");
      return;
    }
    setModalError("");
    saveCompanyMutation.mutate(draft);
  };

  const archiveCompany = (target: NonNullable<ArchiveTarget>) => {
    if (target.reason.trim().length < 3) {
      setModalError("Enter an archive reason.");
      return;
    }
    setModalError("");
    archiveCompanyMutation.mutate(target);
  };

  if (companiesQuery.isLoading) {
    return <PageLoading>{"Loading HR/Admin companies..."}</PageLoading>;
  }

  if (companiesQuery.isError || !companiesQuery.data) {
    return (
      <PageError
        description="The HR/Admin companies list could not be loaded."
        onRetry={() => {
          void companiesQuery.refetch();
        }}
      />
    );
  }

  return (
    <ContentLayout
      header={
        <Header
          actions={
            canWrite ? (
              <Button
                variant="primary"
                onClick={() => {
                  setModalError("");
                  setEditor({
                    mode: "create",
                    company_code: "",
                    company_name: "",
                    company_kind: "LEGAL_ENTITY",
                    location: "",
                  });
                }}
              >
                Create company
              </Button>
            ) : undefined
          }
          description="Companies, offices, staff housing, yards, and other company responsibility subjects."
          variant="h1"
        >
          Companies
        </Header>
      }
    >
      <SpaceBetween size="l">
        {hrRole === "VIEWER" ? (
          <Alert type="info">Viewer access allows you to inspect and download records, but not change company records.</Alert>
        ) : null}
        <Container>
          <SpaceBetween size="m">
            <Input
              ariaLabel="Search companies"
              placeholder="Search by name, code, kind, location, or status"
              value={filterText}
              onChange={({ detail }) => setFilterText(detail.value)}
            />
            <Table
              columnDefinitions={columns}
              empty={
                <PageEmpty
                  action={
                    canWrite ? (
                      <Button
                        onClick={() =>
                          setEditor({
                            mode: "create",
                            company_code: "",
                            company_name: "",
                            company_kind: "LEGAL_ENTITY",
                            location: "",
                          })
                        }
                        variant="primary"
                      >
                        Create company
                      </Button>
                    ) : undefined
                  }
                  description={
                    filterText
                      ? "No company records match the current search."
                      : "Create the first company before adding office, license, tenancy, or staff housing records."
                  }
                  title={filterText ? "No matching companies" : "No companies yet"}
                />
              }
              header={<Header counter={`(${filteredCompanies.length})`}>Company records</Header>}
              items={filteredCompanies}
              trackBy="company_id"
            />
          </SpaceBetween>
        </Container>
      </SpaceBetween>

      <CompanyEditorModal
        editor={editor}
        errorMessage={modalError}
        loading={saveCompanyMutation.isPending}
        onDismiss={() => {
          setEditor(null);
          setModalError("");
        }}
        onSubmit={saveCompany}
      />
      <ArchiveCompanyModal
        errorMessage={modalError}
        loading={archiveCompanyMutation.isPending}
        target={archiveTarget}
        onDismiss={() => {
          setArchiveTarget(null);
          setModalError("");
        }}
        onSubmit={archiveCompany}
      />
    </ContentLayout>
  );
}
