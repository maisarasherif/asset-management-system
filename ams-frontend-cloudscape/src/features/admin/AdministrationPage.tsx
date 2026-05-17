import {
  Alert,
  Badge,
  Box,
  Button,
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
import { PageError, PageLoading } from "../../components/shared/PageStates";
import {
  createCompetencyCategory,
  createCompetentPerson,
  createUser,
  deleteUser,
  listAllCompetencyCategories,
  listAllCompetentPersons,
  listAllUserManagementAuditLogs,
  listAllUsers,
  updateCompetencyCategory,
  updateCompetentPerson,
  updateUser,
  updateUserPassword,
} from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type {
  CompetencyCategory,
  CompetentPerson,
  CompetentPersonType,
  Role,
  UserStatus,
  UserAccount,
  UserManagementAuditLog,
} from "../../types/ams";
import { formatDateTime, humanizeEnum } from "../../utils/format";

type UserEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      first_name: string;
      last_name: string;
      email: string;
      password: string;
      role: Role;
      status: UserStatus;
    }
  | null;

type CompetencyCategoryEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      category_code: string;
      category_name: string;
      description: string;
      active: boolean;
    }
  | null;

type CompetentPersonEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      full_name: string;
      person_type: CompetentPersonType;
      organization: string;
      competency_category_id: string;
      active: boolean;
    }
  | null;

type DeleteUserTarget =
  | {
      id: string;
      label: string;
    }
  | null;

type PasswordChangeTarget =
  | {
      id: string;
      label: string;
      newPassword: string;
      confirmPassword: string;
    }
  | null;

const ROLE_OPTIONS: SelectProps.Option[] = [
  { label: "User", value: "USER" },
  { label: "Client", value: "CLIENT" },
  { label: "Admin", value: "ADMIN" },
  { label: "Super Admin", value: "SUPER_ADMIN" },
];

const USER_STATUS_OPTIONS: SelectProps.Option[] = [
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
];

const PERSON_TYPE_OPTIONS: SelectProps.Option[] = [
  { label: "Internal", value: "Internal" },
  { label: "External", value: "External" },
];

const ACTIVE_OPTIONS: SelectProps.Option[] = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
];

function statusBadge(active: boolean) {
  return <Badge color={active ? "green" : "grey"}>{active ? "Active" : "Inactive"}</Badge>;
}

function userStatusBadge(status: UserStatus) {
  return <Badge color={status === "ACTIVE" ? "green" : "grey"}>{humanizeEnum(status)}</Badge>;
}

function UserEditorModal({
  editor,
  visible,
  errorMessage,
  loading,
  canManageSuperAdmins,
  onDismiss,
  onSubmit,
}: {
  editor: UserEditor;
  visible: boolean;
  errorMessage: string;
  loading: boolean;
  canManageSuperAdmins: boolean;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<UserEditor>) => void;
}) {
  const [draft, setDraft] = useState<NonNullable<UserEditor> | null>(editor);

  useEffect(() => setDraft(editor), [editor]);

  const roleOptions = canManageSuperAdmins
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((option) => option.value !== "SUPER_ADMIN");
  const selectedRoleOption =
    roleOptions.find((option) => option.value === draft?.role) ?? roleOptions[0];
  const selectedStatusOption =
    USER_STATUS_OPTIONS.find((option) => option.value === draft?.status) ??
    USER_STATUS_OPTIONS[0];

  return (
    <Modal
      visible={visible}
      header={draft?.mode === "edit" ? "Edit user" : "Create user"}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Cancel</Button>
          <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
            {draft?.mode === "edit" ? "Save changes" : "Create user"}
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="First name">
          <Input
            value={draft?.first_name || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, first_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Last name">
          <Input
            value={draft?.last_name || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, last_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Email">
          <Input
            type="email"
            value={draft?.email || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, email: detail.value })
            }
          />
        </FormField>
        {draft?.mode === "create" ? (
          <FormField label="Temporary password">
            <Input
              type="password"
              value={draft.password}
              onChange={({ detail }) =>
                setDraft((current) => current && { ...current, password: detail.value })
              }
            />
          </FormField>
        ) : null}
        <FormField label="Role">
          <Select
            options={roleOptions}
            selectedOption={selectedRoleOption}
            onChange={({ detail }) =>
              setDraft(
                (current) =>
                  current && { ...current, role: (detail.selectedOption.value as Role) || "USER" }
              )
            }
          />
        </FormField>
        <FormField label="Status">
          <Select
            options={USER_STATUS_OPTIONS}
            selectedOption={selectedStatusOption}
            onChange={({ detail }) =>
              setDraft(
                (current) =>
                  current && {
                    ...current,
                    status: (detail.selectedOption.value as UserStatus) || "ACTIVE",
                  }
              )
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

function CompetencyCategoryEditorModal({
  editor,
  visible,
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
}: {
  editor: CompetencyCategoryEditor;
  visible: boolean;
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<CompetencyCategoryEditor>) => void;
}) {
  const [draft, setDraft] = useState<NonNullable<CompetencyCategoryEditor> | null>(editor);

  useEffect(() => setDraft(editor), [editor]);

  const selectedActiveOption =
    ACTIVE_OPTIONS.find((option) => option.value === String(draft?.active)) ?? ACTIVE_OPTIONS[0];

  return (
    <Modal
      visible={visible}
      header={draft?.mode === "edit" ? "Edit competency category" : "Create competency category"}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Cancel</Button>
          <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
            {draft?.mode === "edit" ? "Save changes" : "Create category"}
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Code">
          <Input
            value={draft?.category_code || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, category_code: detail.value })
            }
          />
        </FormField>
        <FormField label="Name">
          <Input
            value={draft?.category_name || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, category_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={5}
            value={draft?.description || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, description: detail.value })
            }
          />
        </FormField>
        <FormField label="Status">
          <Select
            options={ACTIVE_OPTIONS}
            selectedOption={selectedActiveOption}
            onChange={({ detail }) =>
              setDraft(
                (current) =>
                  current && { ...current, active: detail.selectedOption.value !== "false" }
              )
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

function CompetentPersonEditorModal({
  editor,
  visible,
  errorMessage,
  loading,
  categoryOptions,
  onDismiss,
  onSubmit,
}: {
  editor: CompetentPersonEditor;
  visible: boolean;
  errorMessage: string;
  loading: boolean;
  categoryOptions: SelectProps.Option[];
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<CompetentPersonEditor>) => void;
}) {
  const [draft, setDraft] = useState<NonNullable<CompetentPersonEditor> | null>(editor);

  useEffect(() => setDraft(editor), [editor]);

  const selectedTypeOption =
    PERSON_TYPE_OPTIONS.find((option) => option.value === draft?.person_type) ??
    PERSON_TYPE_OPTIONS[0];
  const selectedCategoryOption =
    categoryOptions.find((option) => option.value === draft?.competency_category_id) ?? null;
  const selectedActiveOption =
    ACTIVE_OPTIONS.find((option) => option.value === String(draft?.active)) ?? ACTIVE_OPTIONS[0];

  return (
    <Modal
      visible={visible}
      header={draft?.mode === "edit" ? "Edit competent person" : "Create competent person"}
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
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Full name">
          <Input
            value={draft?.full_name || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, full_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Type">
          <Select
            options={PERSON_TYPE_OPTIONS}
            selectedOption={selectedTypeOption}
            onChange={({ detail }) =>
              setDraft(
                (current) =>
                  current && {
                    ...current,
                    person_type:
                      (detail.selectedOption.value as CompetentPersonType) || "Internal",
                  }
              )
            }
          />
        </FormField>
        <FormField label="Organization">
          <Input
            value={draft?.organization || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, organization: detail.value })
            }
          />
        </FormField>
        <FormField label="Competency category">
          <Select
            options={categoryOptions}
            placeholder="Select category"
            selectedOption={selectedCategoryOption}
            onChange={({ detail }) =>
              setDraft(
                (current) =>
                  current && {
                    ...current,
                    competency_category_id: detail.selectedOption.value || "",
                  }
              )
            }
          />
        </FormField>
        <FormField label="Status">
          <Select
            options={ACTIVE_OPTIONS}
            selectedOption={selectedActiveOption}
            onChange={({ detail }) =>
              setDraft(
                (current) =>
                  current && { ...current, active: detail.selectedOption.value !== "false" }
              )
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

export function AdministrationPage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { error, success } = useFlashbar();
  const [userEditor, setUserEditor] = useState<UserEditor>(null);
  const [categoryEditor, setCategoryEditor] = useState<CompetencyCategoryEditor>(null);
  const [personEditor, setPersonEditor] = useState<CompetentPersonEditor>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<DeleteUserTarget>(null);
  const [passwordChangeTarget, setPasswordChangeTarget] = useState<PasswordChangeTarget>(null);
  const [modalError, setModalError] = useState("");

  const usersQuery = useQuery({ queryKey: ["users", "all"], queryFn: listAllUsers });
  const auditLogsQuery = useQuery({
    queryKey: ["user-management-audit-logs", "all"],
    queryFn: listAllUserManagementAuditLogs,
  });
  const categoriesQuery = useQuery({
    queryKey: ["competency-categories", "all"],
    queryFn: listAllCompetencyCategories,
  });
  const peopleQuery = useQuery({
    queryKey: ["competent-persons", "all"],
    queryFn: listAllCompetentPersons,
  });

  const categoryOptions = useMemo<SelectProps.Option[]>(
    () =>
      (categoriesQuery.data || []).map((category) => ({
        label: category.category_name,
        value: category.competency_category_id,
        description: category.description || category.category_code,
      })),
    [categoriesQuery.data]
  );

  const saveUserMutation = useMutation({
    mutationFn: async (editor: NonNullable<UserEditor>) => {
      if (editor.mode === "create") {
        return createUser({
          first_name: editor.first_name.trim(),
          last_name: editor.last_name.trim(),
          email: editor.email.trim(),
          password: editor.password,
          role: editor.role,
          status: editor.status,
        });
      }

      return updateUser(editor.id!, {
        first_name: editor.first_name.trim(),
        last_name: editor.last_name.trim(),
        email: editor.email.trim(),
        role: editor.role,
        status: editor.status,
      });
    },
    onSuccess: async (_, editor) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: ["user-management-audit-logs"] }),
      ]);
      setUserEditor(null);
      setModalError("");
      success(editor.mode === "create" ? "User created" : "User updated", "User management is up to date.");
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("User save failed", mutationError.message);
    },
  });

  const saveCategoryMutation = useMutation({
    mutationFn: async (editor: NonNullable<CompetencyCategoryEditor>) => {
      const payload = {
        category_code: editor.category_code.trim(),
        category_name: editor.category_name.trim(),
        description: editor.description.trim(),
        active: editor.active,
      };

      if (editor.mode === "create") {
        return createCompetencyCategory(payload);
      }

      return updateCompetencyCategory(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["competency-categories"] }),
        queryClient.invalidateQueries({ queryKey: ["competent-persons"] }),
      ]);
      setCategoryEditor(null);
      setModalError("");
      success(
        editor.mode === "create" ? "Competency category created" : "Competency category updated",
        "Competency policy data has been refreshed."
      );
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Category save failed", mutationError.message);
    },
  });

  const savePersonMutation = useMutation({
    mutationFn: async (editor: NonNullable<CompetentPersonEditor>) => {
      const payload = {
        full_name: editor.full_name.trim(),
        person_type: editor.person_type,
        organization: editor.organization.trim(),
        competency_category_id: editor.competency_category_id,
        active: editor.active,
      };

      if (editor.mode === "create") {
        return createCompetentPerson(payload);
      }

      return updateCompetentPerson(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await queryClient.invalidateQueries({ queryKey: ["competent-persons"] });
      setPersonEditor(null);
      setModalError("");
      success(
        editor.mode === "create" ? "Competent person created" : "Competent person updated",
        "Competent person records are ready for uploads."
      );
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Competent person save failed", mutationError.message);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (target: NonNullable<DeleteUserTarget>) => deleteUser(target.id),
    onSuccess: async (_, target) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: ["user-management-audit-logs"] }),
      ]);
      setDeleteUserTarget(null);
      setModalError("");
      success("User deleted", `${target.label} has been removed.`);
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("User delete failed", mutationError.message);
    },
  });

  const changeUserPasswordMutation = useMutation({
    mutationFn: (target: NonNullable<PasswordChangeTarget>) =>
      updateUserPassword(target.id, { new_password: target.newPassword }),
    onSuccess: async (_, target) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: ["user-management-audit-logs"] }),
      ]);
      setPasswordChangeTarget(null);
      setModalError("");
      success("Password changed", `${target.label}'s password has been updated.`);
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Password change failed", mutationError.message);
    },
  });

  const loading =
    usersQuery.isLoading ||
    auditLogsQuery.isLoading ||
    categoriesQuery.isLoading ||
    peopleQuery.isLoading;
  const failed =
    usersQuery.isError ||
    auditLogsQuery.isError ||
    categoriesQuery.isError ||
    peopleQuery.isError ||
    !usersQuery.data ||
    !auditLogsQuery.data ||
    !categoriesQuery.data ||
    !peopleQuery.data;

  if (loading) {
    return <PageLoading>Loading administration data...</PageLoading>;
  }

  if (failed) {
    return (
      <PageError
        description="The administration workspace could not be loaded."
        onRetry={() => {
	          void usersQuery.refetch();
	          void auditLogsQuery.refetch();
	          void categoriesQuery.refetch();
          void peopleQuery.refetch();
        }}
      />
    );
  }

  const canManageSuperAdmins = session?.role === "SUPER_ADMIN";

  const userColumns: TableProps<UserAccount>["columnDefinitions"] = [
    {
      id: "name",
      header: "Name",
      cell: (item) => `${item.first_name} ${item.last_name}`.trim(),
    },
    { id: "email", header: "Email", cell: (item) => item.email },
    { id: "role", header: "Role", cell: (item) => humanizeEnum(item.role) },
    { id: "status", header: "Status", cell: (item) => userStatusBadge(item.status) },
    { id: "created", header: "Created", cell: (item) => formatDateTime(item.created_at) },
    {
      id: "actions",
      header: "Actions",
      cell: (item) => (
        <SpaceBetween direction="horizontal" size="xs">
	          <Button
	            onClick={() => {
	              setModalError("");
	              setUserEditor({
                mode: "edit",
                id: item.user_id,
                first_name: item.first_name,
                last_name: item.last_name,
                email: item.email,
                password: "",
                role: item.role,
                status: item.status,
              });
            }}
	          >
	            Edit
	          </Button>
	          {canManageSuperAdmins || session?.canManageUserPasswords ? (
	            <Button
	              onClick={() => {
	                setModalError("");
	                setPasswordChangeTarget({
	                  id: item.user_id,
	                  label: `${item.first_name} ${item.last_name}`.trim() || item.email,
	                  newPassword: "",
	                  confirmPassword: "",
	                });
	              }}
	            >
	              Change password
	            </Button>
	          ) : null}
	          <Button
	            onClick={() =>
	              setDeleteUserTarget({
                id: item.user_id,
                label: `${item.first_name} ${item.last_name}`.trim() || item.email,
              })
            }
          >
            Delete
          </Button>
        </SpaceBetween>
      ),
    },
  ];

  const personColumns: TableProps<CompetentPerson>["columnDefinitions"] = [
    { id: "name", header: "Competent Person", cell: (item) => item.full_name },
    { id: "type", header: "Type", cell: (item) => item.person_type },
    {
      id: "category",
      header: "Competency category",
      cell: (item) => item.competency_category_name,
    },
    { id: "organization", header: "Organization", cell: (item) => item.organization || "-" },
    { id: "status", header: "Status", cell: (item) => statusBadge(item.active) },
    {
      id: "actions",
      header: "Actions",
      cell: (item) => (
        <Button
          onClick={() => {
            setModalError("");
            setPersonEditor({
              mode: "edit",
              id: item.competent_person_id,
              full_name: item.full_name,
              person_type: item.person_type,
              organization: item.organization || "",
              competency_category_id: item.competency_category_id,
              active: item.active,
            });
          }}
        >
          Edit
        </Button>
      ),
    },
  ];

  const categoryColumns: TableProps<CompetencyCategory>["columnDefinitions"] = [
    { id: "name", header: "Category", cell: (item) => item.category_name },
    { id: "description", header: "Description", cell: (item) => item.description },
    { id: "status", header: "Status", cell: (item) => statusBadge(item.active) },
    {
      id: "actions",
      header: "Actions",
      cell: (item) => (
        <Button
          onClick={() => {
            setModalError("");
            setCategoryEditor({
              mode: "edit",
              id: item.competency_category_id,
              category_code: item.category_code,
              category_name: item.category_name,
              description: item.description || "",
              active: item.active,
            });
          }}
        >
          Edit
        </Button>
      ),
    },
  ];

  const auditColumns: TableProps<UserManagementAuditLog>["columnDefinitions"] = [
    { id: "created", header: "Time", cell: (item) => formatDateTime(item.created_at) },
    { id: "action", header: "Action", cell: (item) => humanizeEnum(item.action) },
    { id: "actor", header: "Actor", cell: (item) => item.actor_email || "-" },
    { id: "target", header: "Target", cell: (item) => item.target_email || "-" },
    {
      id: "role",
      header: "Role change",
      cell: (item) =>
        item.target_role_before || item.target_role_after
          ? `${item.target_role_before || "-"} -> ${item.target_role_after || "-"}`
          : "-",
    },
    { id: "details", header: "Details", cell: (item) => item.details || "-" },
    { id: "ip", header: "IP", cell: (item) => item.ip_address || "-" },
  ];

  const saveUser = (editor: NonNullable<UserEditor>) => {
    if (!editor.first_name.trim() || !editor.last_name.trim() || !editor.email.trim()) {
      setModalError("Enter first name, last name, email, and role.");
      return;
    }
    if (editor.mode === "create" && editor.password.length < 6) {
      setModalError("Temporary password must be at least 6 characters.");
      return;
    }
    if (editor.role === "SUPER_ADMIN" && !canManageSuperAdmins) {
      setModalError("Only Super Admin users can grant Super Admin access.");
      return;
    }
    setModalError("");
    saveUserMutation.mutate(editor);
  };

  const saveCategory = (editor: NonNullable<CompetencyCategoryEditor>) => {
    if (!editor.category_code.trim() || !editor.category_name.trim()) {
      setModalError("Enter a code and category name.");
      return;
    }
    setModalError("");
    saveCategoryMutation.mutate(editor);
  };

  const savePerson = (editor: NonNullable<CompetentPersonEditor>) => {
    if (!editor.full_name.trim() || !editor.competency_category_id) {
      setModalError("Enter a name and choose a competency category.");
      return;
    }
    setModalError("");
    savePersonMutation.mutate(editor);
  };

  const changeUserPassword = (target: NonNullable<PasswordChangeTarget>) => {
    if (target.newPassword.length < 6) {
      setModalError("New password must be at least 6 characters.");
      return;
    }
    if (target.newPassword !== target.confirmPassword) {
      setModalError("Password confirmation does not match.");
      return;
    }
    setModalError("");
    changeUserPasswordMutation.mutate(target);
  };

  return (
    <>
      <ContentLayout
        header={
          <Header
            description="Manage application users, competent persons, and the competency categories required for certificate uploads."
            variant="h1"
          >
            Administration
          </Header>
        }
      >
        <SpaceBetween direction="vertical" size="l">
          <Container
            header={
              <Header
                actions={
                  <Button
                    variant="primary"
                    onClick={() => {
                      setModalError("");
                      setUserEditor({
                        mode: "create",
                        first_name: "",
                        last_name: "",
                        email: "",
                        password: "",
                        role: "USER",
                        status: "ACTIVE",
                      });
                    }}
                  >
                    Create user
                  </Button>
                }
                counter={`(${usersQuery.data.length})`}
                variant="h2"
              >
                Users
              </Header>
            }
          >
            <Table
              columnDefinitions={userColumns}
              empty={<Box color="text-body-secondary">No users are available.</Box>}
              items={usersQuery.data}
              trackBy="user_id"
              variant="embedded"
            />
	          </Container>

          <Container
            header={
              <Header counter={`(${auditLogsQuery.data.length})`} variant="h2">
                User Management Audit
              </Header>
            }
          >
            <Table
              columnDefinitions={auditColumns}
              empty={<Box color="text-body-secondary">No user management audit events are available.</Box>}
              items={auditLogsQuery.data}
              trackBy="audit_id"
              variant="embedded"
            />
          </Container>

          <Container
            header={
              <Header
                actions={
                  <Button
                    variant="primary"
                    disabled={categoriesQuery.data.length === 0}
                    onClick={() => {
                      setModalError("");
                      setPersonEditor({
                        mode: "create",
                        full_name: "",
                        person_type: "Internal",
                        organization: "",
                        competency_category_id:
                          categoriesQuery.data.find((category) => category.active)
                            ?.competency_category_id || categoriesQuery.data[0]?.competency_category_id || "",
                        active: true,
                      });
                    }}
                  >
                    Create competent person
                  </Button>
                }
                counter={`(${peopleQuery.data.length})`}
                variant="h2"
              >
                Competent Persons
              </Header>
            }
          >
            <Table
              columnDefinitions={personColumns}
              empty={<Box color="text-body-secondary">No competent persons are available.</Box>}
              items={peopleQuery.data}
              trackBy="competent_person_id"
              variant="embedded"
            />
          </Container>

          <Container
            header={
              <Header
                actions={
                  <Button
                    variant="primary"
                    onClick={() => {
                      setModalError("");
                      setCategoryEditor({
                        mode: "create",
                        category_code: "",
                        category_name: "",
                        description: "",
                        active: true,
                      });
                    }}
                  >
                    Create competency category
                  </Button>
                }
                counter={`(${categoriesQuery.data.length})`}
                variant="h2"
              >
                Competency Categories
              </Header>
            }
          >
            <Table
              columnDefinitions={categoryColumns}
              empty={<Box color="text-body-secondary">No competency categories are available.</Box>}
              items={categoriesQuery.data}
              trackBy="competency_category_id"
              variant="embedded"
            />
          </Container>
        </SpaceBetween>
      </ContentLayout>

      <UserEditorModal
        editor={userEditor}
        visible={Boolean(userEditor)}
        errorMessage={modalError}
        loading={saveUserMutation.isPending}
        canManageSuperAdmins={canManageSuperAdmins}
        onDismiss={() => {
          setModalError("");
          setUserEditor(null);
        }}
        onSubmit={saveUser}
      />

      <CompetentPersonEditorModal
        editor={personEditor}
        visible={Boolean(personEditor)}
        errorMessage={modalError}
        loading={savePersonMutation.isPending}
        categoryOptions={categoryOptions}
        onDismiss={() => {
          setModalError("");
          setPersonEditor(null);
        }}
        onSubmit={savePerson}
      />

      <CompetencyCategoryEditorModal
        editor={categoryEditor}
        visible={Boolean(categoryEditor)}
        errorMessage={modalError}
        loading={saveCategoryMutation.isPending}
        onDismiss={() => {
          setModalError("");
          setCategoryEditor(null);
        }}
        onSubmit={saveCategory}
      />

      <Modal
        visible={Boolean(passwordChangeTarget)}
        header="Change user password"
        onDismiss={() => {
          setModalError("");
          setPasswordChangeTarget(null);
        }}
        footer={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => setPasswordChangeTarget(null)}>Cancel</Button>
            <Button
              loading={changeUserPasswordMutation.isPending}
              variant="primary"
              onClick={() => passwordChangeTarget && changeUserPassword(passwordChangeTarget)}
            >
              Change password
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween direction="vertical" size="m">
          {modalError ? <Alert type="error">{modalError}</Alert> : null}
          <Box>
            Set a new password for{" "}
            <Box display="inline" fontWeight="bold">
              {passwordChangeTarget?.label || "this user"}
            </Box>
            .
          </Box>
          <FormField label="New password">
            <Input
              type="password"
              value={passwordChangeTarget?.newPassword || ""}
              onChange={({ detail }) =>
                setPasswordChangeTarget(
                  (current) => current && { ...current, newPassword: detail.value }
                )
              }
            />
          </FormField>
          <FormField label="Confirm new password">
            <Input
              type="password"
              value={passwordChangeTarget?.confirmPassword || ""}
              onChange={({ detail }) =>
                setPasswordChangeTarget(
                  (current) => current && { ...current, confirmPassword: detail.value }
                )
              }
            />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={Boolean(deleteUserTarget)}
        header="Delete user"
        onDismiss={() => {
          setModalError("");
          setDeleteUserTarget(null);
        }}
        footer={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => setDeleteUserTarget(null)}>Cancel</Button>
            <Button
              loading={deleteUserMutation.isPending}
              variant="primary"
              onClick={() => deleteUserTarget && deleteUserMutation.mutate(deleteUserTarget)}
            >
              Delete
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween direction="vertical" size="m">
          {modalError ? <Alert type="error">{modalError}</Alert> : null}
          <Alert type="warning">
            Deleting a user removes their login access. Existing upload audit records keep their
            stored uploader reference.
          </Alert>
          <Box>
            Delete{" "}
            <Box display="inline" fontWeight="bold">
              {deleteUserTarget?.label || "this user"}
            </Box>
            ?
          </Box>
        </SpaceBetween>
      </Modal>
    </>
  );
}
