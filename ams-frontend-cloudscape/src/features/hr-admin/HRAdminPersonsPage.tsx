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
  SpaceBetween,
  Table,
  Textarea,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { TableCellActions, TableCellText } from "../../components/shared/TableCells";
import {
  archiveHRAdminPerson,
  createHRAdminPerson,
  listHRAdminPersons,
  updateHRAdminPerson,
} from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { HRAdminPerson, HRAdminPersonInput } from "../../types/ams";
import { formatDateTime, humanizeEnum } from "../../utils/format";

type PersonEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      person_code: string;
      full_name: string;
      department: string;
      role_title: string;
    }
  | null;

type ArchiveTarget =
  | {
      id: string;
      label: string;
      reason: string;
    }
  | null;

function statusBadge(status: HRAdminPerson["status"]) {
  return <Badge color={status === "ACTIVE" ? "green" : "grey"}>{humanizeEnum(status)}</Badge>;
}

function toPersonInput(editor: NonNullable<PersonEditor>): HRAdminPersonInput {
  return {
    person_code: editor.person_code.trim(),
    full_name: editor.full_name.trim(),
    department: editor.department.trim(),
    role_title: editor.role_title.trim(),
  };
}

function isCompactViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches;
}

function PersonEditorModal({
  editor,
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
}: {
  editor: PersonEditor;
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<PersonEditor>) => void;
}) {
  const [draft, setDraft] = useState<PersonEditor>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  return (
    <Modal
      visible={Boolean(editor)}
      header={draft?.mode === "edit" ? "Edit person" : "Create person"}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Cancel</Button>
          <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
            {draft?.mode === "edit" ? "Save changes" : "Create person"}
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Person code" description="Optional internal reference. Leave blank if HR will assign it later.">
          <Input
            value={draft?.person_code || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, person_code: detail.value })
            }
          />
        </FormField>
        <FormField label="Full name" constraintText="Required">
          <Input
            value={draft?.full_name || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, full_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Department">
          <Input
            value={draft?.department || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, department: detail.value })
            }
          />
        </FormField>
        <FormField label="Role title">
          <Input
            value={draft?.role_title || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, role_title: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

function ArchivePersonModal({
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
      header={`Archive ${draft?.label || "person"}?`}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Keep person</Button>
          <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
            Archive person
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="l">
        <Alert type="warning">
          Archived persons stay visible for history, but HR/Admin renewal work will ignore their records.
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

export function HRAdminPersonsPage() {
  const queryClient = useQueryClient();
  const { success } = useFlashbar();
  const { getProductRole } = useAuth();
  const hrRole = getProductRole("HR_ADMIN");
  const canWrite = hrRole === "ADMIN" || hrRole === "USER";
  const canArchive = hrRole === "ADMIN";
  const [filterText, setFilterText] = useState("");
  const [compactTable, setCompactTable] = useState(() => isCompactViewport());
  const [editor, setEditor] = useState<PersonEditor>(null);
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget>(null);
  const [modalError, setModalError] = useState("");

  const peopleQuery = useQuery({
    queryKey: ["hr-admin", "persons"],
    queryFn: () => listHRAdminPersons(1, 100),
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

  const invalidatePersons = () =>
    queryClient.invalidateQueries({ queryKey: ["hr-admin", "persons"] });

  const savePersonMutation = useMutation<unknown, Error, NonNullable<PersonEditor>>({
    mutationFn: (draft: NonNullable<PersonEditor>) =>
      draft.mode === "edit" && draft.id
        ? updateHRAdminPerson(draft.id, toPersonInput(draft))
        : createHRAdminPerson(toPersonInput(draft)),
    onSuccess: (_response, draft) => {
      setEditor(null);
      setModalError("");
      success(
        draft.mode === "edit" ? "Person updated" : "Person created",
        draft.mode === "edit" ? "The person record was saved." : "The person is ready for compliance records."
      );
      void invalidatePersons();
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
    },
  });

  const archivePersonMutation = useMutation({
    mutationFn: (target: NonNullable<ArchiveTarget>) =>
      archiveHRAdminPerson(target.id, target.reason.trim()),
    onSuccess: () => {
      setArchiveTarget(null);
      setModalError("");
      success("Person archived", "Renewal work will ignore this person while retaining history.");
      void invalidatePersons();
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
    },
  });

  const people = peopleQuery.data?.data ?? [];
  const filteredPeople = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return people;
    }
    return people.filter((person) =>
      [person.display_id, person.person_code, person.full_name, person.department, person.role_title, person.status]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [filterText, people]);

  const columns = useMemo<TableProps.ColumnDefinition<HRAdminPerson>[]>(() => {
    const editPerson = (item: HRAdminPerson) => {
      setModalError("");
      setEditor({
        mode: "edit",
        id: item.person_id,
        person_code: item.person_code || "",
        full_name: item.full_name,
        department: item.department || "",
        role_title: item.role_title || "",
      });
    };
    const archivePersonRow = (item: HRAdminPerson) => {
      setModalError("");
      setArchiveTarget({
        id: item.person_id,
        label: item.full_name,
        reason: "",
      });
    };
    const rowActions = (item: HRAdminPerson) => {
      if (canArchive && item.status === "ACTIVE") {
        return (
          <ButtonDropdown
            ariaLabel={`Actions for ${item.full_name}`}
            expandToViewport
            items={[
              { id: "edit", text: "Edit" },
              { id: "archive", text: "Archive" },
            ]}
            onItemClick={({ detail }) => {
              if (detail.id === "edit") {
                editPerson(item);
                return;
              }
              archivePersonRow(item);
            }}
          >
            Actions
          </ButtonDropdown>
        );
      }

      if (canWrite && item.status === "ACTIVE") {
        return <Button onClick={() => editPerson(item)}>Edit</Button>;
      }

      return <Box color="text-body-secondary">View only</Box>;
    };

    if (compactTable) {
      return [
        {
          id: "person",
          header: "Person",
          minWidth: 190,
          cell: (item) => (
            <TableCellText title={item.full_name}>
              <strong>{item.full_name}</strong>
              <br />
              {item.person_code || item.display_id}
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

    const baseColumns: TableProps.ColumnDefinition<HRAdminPerson>[] = [
      {
        id: "person",
        header: "Person",
        width: "28%",
        minWidth: 240,
        cell: (item) => (
          <TableCellText title={item.full_name}>
            <strong>{item.full_name}</strong>
            <br />
            {item.person_code || item.display_id}
          </TableCellText>
        ),
      },
      {
        id: "department",
        header: "Department",
        width: "18%",
        minWidth: 160,
        cell: (item) => <TableCellText title={item.department || "-"}>{item.department || "-"}</TableCellText>,
      },
      {
        id: "role",
        header: "Role title",
        width: "18%",
        minWidth: 160,
        cell: (item) => <TableCellText title={item.role_title || "-"}>{item.role_title || "-"}</TableCellText>,
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

    return baseColumns;
  }, [canArchive, canWrite, compactTable]);

  const savePerson = (draft: NonNullable<PersonEditor>) => {
    if (!draft.full_name.trim()) {
      setModalError("Enter the person's full name.");
      return;
    }
    setModalError("");
    savePersonMutation.mutate(draft);
  };

  const archivePerson = (target: NonNullable<ArchiveTarget>) => {
    if (target.reason.trim().length < 3) {
      setModalError("Enter an archive reason.");
      return;
    }
    setModalError("");
    archivePersonMutation.mutate(target);
  };

  if (peopleQuery.isLoading) {
    return <PageLoading>{"Loading HR/Admin persons..."}</PageLoading>;
  }

  if (peopleQuery.isError || !peopleQuery.data) {
    return (
      <PageError
        description="The HR/Admin persons list could not be loaded."
        onRetry={() => {
          void peopleQuery.refetch();
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
                    person_code: "",
                    full_name: "",
                    department: "",
                    role_title: "",
                  });
                }}
              >
                Create person
              </Button>
            ) : undefined
          }
          description="People whose compliance records are maintained by the company."
          variant="h1"
        >
          Persons
        </Header>
      }
    >
      <SpaceBetween size="l">
        {hrRole === "VIEWER" ? (
          <Alert type="info">Viewer access allows you to inspect and download records, but not change person records.</Alert>
        ) : null}
        <Container>
          <SpaceBetween size="m">
            <Input
              ariaLabel="Search persons"
              placeholder="Search by name, code, department, role, or status"
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
                            person_code: "",
                            full_name: "",
                            department: "",
                            role_title: "",
                          })
                        }
                        variant="primary"
                      >
                        Create person
                      </Button>
                    ) : undefined
                  }
                  description={
                    filterText
                      ? "No person records match the current search."
                      : "Create the first person before adding employment, certification, or other responsibility records."
                  }
                  title={filterText ? "No matching persons" : "No persons yet"}
                />
              }
              header={<Header counter={`(${filteredPeople.length})`}>Person records</Header>}
              items={filteredPeople}
              trackBy="person_id"
            />
          </SpaceBetween>
        </Container>
      </SpaceBetween>

      <PersonEditorModal
        editor={editor}
        errorMessage={modalError}
        loading={savePersonMutation.isPending}
        onDismiss={() => {
          setEditor(null);
          setModalError("");
        }}
        onSubmit={savePerson}
      />
      <ArchivePersonModal
        errorMessage={modalError}
        loading={archivePersonMutation.isPending}
        target={archiveTarget}
        onDismiss={() => {
          setArchiveTarget(null);
          setModalError("");
        }}
        onSubmit={archivePerson}
      />
    </ContentLayout>
  );
}
