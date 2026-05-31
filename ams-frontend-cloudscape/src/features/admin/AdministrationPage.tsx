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
  SpaceBetween,
  Table,
  Textarea,
  type SelectProps,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Select } from "../../components/shared/OptimizedSelect";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { TableCellActions, TableCellText } from "../../components/shared/TableCells";
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
  const [draft, setDraft] = useState<UserEditor>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  const roleOptions = canManageSuperAdmins
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((option) => option.value !== "ADMIN" && option.value !== "SUPER_ADMIN");
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
  const [draft, setDraft] = useState<CompetencyCategoryEditor>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

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
  const [draft, setDraft] = useState<CompetentPersonEditor>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

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

function useAdministrationData() {
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

  return { auditLogsQuery, categoriesQuery, categoryOptions, peopleQuery, usersQuery };
}

type UseAdministrationMutationsOptions = {
  onCategorySaved: () => void;
  onPasswordChanged: () => void;
  onPersonSaved: () => void;
  onUserDeleted: () => void;
  onUserSaved: () => void;
  setModalError: (message: string) => void;
};

function useAdministrationMutations({
  onCategorySaved,
  onPasswordChanged,
  onPersonSaved,
  onUserDeleted,
  onUserSaved,
  setModalError,
}: UseAdministrationMutationsOptions) {
  const queryClient = useQueryClient();
  const { error, success } = useFlashbar();

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
      onUserSaved();
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

      return editor.mode === "create"
        ? createCompetencyCategory(payload)
        : updateCompetencyCategory(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["competency-categories"] }),
        queryClient.invalidateQueries({ queryKey: ["competent-persons"] }),
      ]);
      onCategorySaved();
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

      return editor.mode === "create"
        ? createCompetentPerson(payload)
        : updateCompetentPerson(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await queryClient.invalidateQueries({ queryKey: ["competent-persons"] });
      onPersonSaved();
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
      onUserDeleted();
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
      onPasswordChanged();
      success("Password changed", `${target.label}'s password has been updated.`);
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Password change failed", mutationError.message);
    },
  });

  return {
    changeUserPasswordMutation,
    deleteUserMutation,
    saveCategoryMutation,
    savePersonMutation,
    saveUserMutation,
  };
}

type UseAdministrationColumnsOptions = {
  canManageUserAccount: (user: UserAccount) => boolean;
  canManageUserPasswords: boolean;
  onChangePassword: (user: UserAccount) => void;
  onDeleteUser: (user: UserAccount) => void;
  onEditCategory: (category: CompetencyCategory) => void;
  onEditPerson: (person: CompetentPerson) => void;
  onEditUser: (user: UserAccount) => void;
};

function useAdministrationColumns({
  canManageUserAccount,
  canManageUserPasswords,
  onChangePassword,
  onDeleteUser,
  onEditCategory,
  onEditPerson,
  onEditUser,
}: UseAdministrationColumnsOptions) {
  const userColumns = useMemo<TableProps<UserAccount>["columnDefinitions"]>(
    () => [
      {
        id: "name",
        header: "Name",
        width: "18%",
        minWidth: 180,
        cell: (item) => {
          const fullName = `${item.first_name} ${item.last_name}`.trim();
          return <TableCellText title={fullName}>{fullName}</TableCellText>;
        },
      },
      {
        id: "email",
        header: "Email",
        width: "22%",
        minWidth: 220,
        cell: (item) => <TableCellText title={item.email}>{item.email}</TableCellText>,
      },
      { id: "role", header: "Role", width: 130, minWidth: 120, cell: (item) => humanizeEnum(item.role) },
      { id: "status", header: "Status", width: 120, minWidth: 110, cell: (item) => userStatusBadge(item.status) },
      {
        id: "created",
        header: "Created",
        width: 190,
        minWidth: 180,
        cell: (item) => formatDateTime(item.created_at),
      },
      {
        id: "actions",
        header: "Actions",
        width: 320,
        minWidth: 320,
        cell: (item) => (
          <TableCellActions>
            <Button disabled={!canManageUserAccount(item)} onClick={() => onEditUser(item)}>
              Edit
            </Button>
            {canManageUserPasswords ? (
              <Button onClick={() => onChangePassword(item)}>Change password</Button>
            ) : null}
            <Button disabled={!canManageUserAccount(item)} onClick={() => onDeleteUser(item)}>
              Delete
            </Button>
          </TableCellActions>
        ),
      },
    ],
    [canManageUserAccount, canManageUserPasswords, onChangePassword, onDeleteUser, onEditUser]
  );

  const personColumns = useMemo<TableProps<CompetentPerson>["columnDefinitions"]>(
    () => [
      {
        id: "name",
        header: "Competent Person",
        width: "24%",
        minWidth: 220,
        cell: (item) => <TableCellText title={item.full_name}>{item.full_name}</TableCellText>,
      },
      {
        id: "type",
        header: "Type",
        width: 150,
        minWidth: 130,
        cell: (item) => <TableCellText title={item.person_type}>{item.person_type}</TableCellText>,
      },
      {
        id: "category",
        header: "Competency category",
        width: "24%",
        minWidth: 220,
        cell: (item) => (
          <TableCellText title={item.competency_category_name}>
            {item.competency_category_name}
          </TableCellText>
        ),
      },
      {
        id: "organization",
        header: "Organization",
        width: "20%",
        minWidth: 180,
        cell: (item) => (
          <TableCellText title={item.organization || "-"}>{item.organization || "-"}</TableCellText>
        ),
      },
      { id: "status", header: "Status", width: 120, minWidth: 110, cell: (item) => statusBadge(item.active) },
      {
        id: "actions",
        header: "Actions",
        width: 100,
        minWidth: 90,
        cell: (item) => <Button onClick={() => onEditPerson(item)}>Edit</Button>,
      },
    ],
    [onEditPerson]
  );

  const categoryColumns = useMemo<TableProps<CompetencyCategory>["columnDefinitions"]>(
    () => [
      {
        id: "name",
        header: "Category",
        width: "28%",
        minWidth: 220,
        cell: (item) => (
          <TableCellText title={item.category_name}>{item.category_name}</TableCellText>
        ),
      },
      {
        id: "description",
        header: "Description",
        width: "42%",
        minWidth: 280,
        cell: (item) => <TableCellText title={item.description}>{item.description}</TableCellText>,
      },
      { id: "status", header: "Status", width: 120, minWidth: 110, cell: (item) => statusBadge(item.active) },
      {
        id: "actions",
        header: "Actions",
        width: 100,
        minWidth: 90,
        cell: (item) => <Button onClick={() => onEditCategory(item)}>Edit</Button>,
      },
    ],
    [onEditCategory]
  );

  const auditColumns = useMemo<TableProps<UserManagementAuditLog>["columnDefinitions"]>(
    () => [
      { id: "created", header: "Time", width: 190, minWidth: 180, cell: (item) => formatDateTime(item.created_at) },
      { id: "action", header: "Action", width: 170, minWidth: 150, cell: (item) => humanizeEnum(item.action) },
      {
        id: "actor",
        header: "Actor",
        width: "22%",
        minWidth: 220,
        cell: (item) => <TableCellText title={item.actor_email || "-"}>{item.actor_email || "-"}</TableCellText>,
      },
      {
        id: "target",
        header: "Target",
        width: "22%",
        minWidth: 220,
        cell: (item) => <TableCellText title={item.target_email || "-"}>{item.target_email || "-"}</TableCellText>,
      },
      {
        id: "role",
        header: "Role change",
        width: 190,
        minWidth: 180,
        cell: (item) =>
          item.target_role_before || item.target_role_after
            ? `${item.target_role_before || "-"} -> ${item.target_role_after || "-"}`
            : "-",
      },
      { id: "details", header: "Details", cell: (item) => item.details || "-" },
      { id: "ip", header: "IP", cell: (item) => item.ip_address || "-" },
    ],
    []
  );

  return { auditColumns, categoryColumns, personColumns, userColumns };
}

export function AdministrationPage() {
  const { session } = useAuth();
  const [userEditor, setUserEditor] = useState<UserEditor>(null);
  const [categoryEditor, setCategoryEditor] = useState<CompetencyCategoryEditor>(null);
  const [personEditor, setPersonEditor] = useState<CompetentPersonEditor>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<DeleteUserTarget>(null);
  const [passwordChangeTarget, setPasswordChangeTarget] = useState<PasswordChangeTarget>(null);
  const [modalError, setModalError] = useState("");

  const { auditLogsQuery, categoriesQuery, categoryOptions, peopleQuery, usersQuery } =
    useAdministrationData();
  const mutations = useAdministrationMutations({
    onCategorySaved: () => {
      setCategoryEditor(null);
      setModalError("");
    },
    onPasswordChanged: () => {
      setPasswordChangeTarget(null);
      setModalError("");
    },
    onPersonSaved: () => {
      setPersonEditor(null);
      setModalError("");
    },
    onUserDeleted: () => {
      setDeleteUserTarget(null);
      setModalError("");
    },
    onUserSaved: () => {
      setUserEditor(null);
      setModalError("");
    },
    setModalError,
  });

  const canManageSuperAdmins = session?.role === "SUPER_ADMIN";
  const canManageUserAccount = (user: UserAccount) =>
    canManageSuperAdmins || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN");
  const { auditColumns, categoryColumns, personColumns, userColumns } = useAdministrationColumns({
    canManageUserAccount,
    canManageUserPasswords: Boolean(session?.canManageUserPasswords),
    onChangePassword: (user) => {
      setModalError("");
      setPasswordChangeTarget({
        id: user.user_id,
        label: `${user.first_name} ${user.last_name}`.trim() || user.email,
        newPassword: "",
        confirmPassword: "",
      });
    },
    onDeleteUser: (user) => {
      setDeleteUserTarget({
        id: user.user_id,
        label: `${user.first_name} ${user.last_name}`.trim() || user.email,
      });
    },
    onEditCategory: (category) => {
      setModalError("");
      setCategoryEditor({
        mode: "edit",
        id: category.competency_category_id,
        category_code: category.category_code,
        category_name: category.category_name,
        description: category.description || "",
        active: category.active,
      });
    },
    onEditPerson: (person) => {
      setModalError("");
      setPersonEditor({
        mode: "edit",
        id: person.competent_person_id,
        full_name: person.full_name,
        person_type: person.person_type,
        organization: person.organization || "",
        competency_category_id: person.competency_category_id,
        active: person.active,
      });
    },
    onEditUser: (user) => {
      setModalError("");
      setUserEditor({
        mode: "edit",
        id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        password: "",
        role: user.role,
        status: user.status,
      });
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
    return <PageLoading>{"Loading administration data\u2026"}</PageLoading>;
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

  const saveUser = (editor: NonNullable<UserEditor>) => {
    if (!editor.first_name.trim() || !editor.last_name.trim() || !editor.email.trim()) {
      setModalError("Enter first name, last name, email, and role.");
      return;
    }
    if (editor.mode === "create" && editor.password.length < 6) {
      setModalError("Temporary password must be at least 6 characters.");
      return;
    }
    if ((editor.role === "ADMIN" || editor.role === "SUPER_ADMIN") && !canManageSuperAdmins) {
      setModalError("Only Super Admin users can create or edit admin users.");
      return;
    }
    setModalError("");
    mutations.saveUserMutation.mutate(editor);
  };

  const saveCategory = (editor: NonNullable<CompetencyCategoryEditor>) => {
    if (!editor.category_code.trim() || !editor.category_name.trim()) {
      setModalError("Enter a code and category name.");
      return;
    }
    setModalError("");
    mutations.saveCategoryMutation.mutate(editor);
  };

  const savePerson = (editor: NonNullable<CompetentPersonEditor>) => {
    if (!editor.full_name.trim() || !editor.competency_category_id) {
      setModalError("Enter a name and choose a competency category.");
      return;
    }
    setModalError("");
    mutations.savePersonMutation.mutate(editor);
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
    mutations.changeUserPasswordMutation.mutate(target);
  };

  return (
    <AdministrationView
      auditColumns={auditColumns}
      auditLogs={auditLogsQuery.data}
      canManageSuperAdmins={canManageSuperAdmins}
      categories={categoriesQuery.data}
      categoryColumns={categoryColumns}
      categoryEditor={categoryEditor}
      categoryOptions={categoryOptions}
      deleteUserLoading={mutations.deleteUserMutation.isPending}
      deleteUserTarget={deleteUserTarget}
      modalError={modalError}
      onChangePassword={changeUserPassword}
      onCreateCategory={() => {
        setModalError("");
        setCategoryEditor({
          mode: "create",
          category_code: "",
          category_name: "",
          description: "",
          active: true,
        });
      }}
      onCreatePerson={() => {
        setModalError("");
        setPersonEditor({
          mode: "create",
          full_name: "",
          person_type: "Internal",
          organization: "",
          competency_category_id:
            categoriesQuery.data.find((category) => category.active)?.competency_category_id ||
            categoriesQuery.data[0]?.competency_category_id ||
            "",
          active: true,
        });
      }}
      onCreateUser={() => {
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
      onDeleteUser={() => deleteUserTarget && mutations.deleteUserMutation.mutate(deleteUserTarget)}
      onDismissCategoryEditor={() => {
        setModalError("");
        setCategoryEditor(null);
      }}
      onDismissDeleteUser={() => {
        setModalError("");
        setDeleteUserTarget(null);
      }}
      onDismissPasswordChange={() => {
        setModalError("");
        setPasswordChangeTarget(null);
      }}
      onDismissPersonEditor={() => {
        setModalError("");
        setPersonEditor(null);
      }}
      onDismissUserEditor={() => {
        setModalError("");
        setUserEditor(null);
      }}
      onSaveCategory={saveCategory}
      onSavePerson={savePerson}
      onSaveUser={saveUser}
      passwordChangeLoading={mutations.changeUserPasswordMutation.isPending}
      passwordChangeTarget={passwordChangeTarget}
      people={peopleQuery.data}
      personColumns={personColumns}
      personEditor={personEditor}
      saveCategoryLoading={mutations.saveCategoryMutation.isPending}
      savePersonLoading={mutations.savePersonMutation.isPending}
      saveUserLoading={mutations.saveUserMutation.isPending}
      userColumns={userColumns}
      userEditor={userEditor}
      users={usersQuery.data}
    />
  );
}

type AdministrationViewProps = {
  auditColumns: TableProps<UserManagementAuditLog>["columnDefinitions"];
  auditLogs: UserManagementAuditLog[];
  canManageSuperAdmins: boolean;
  categories: CompetencyCategory[];
  categoryColumns: TableProps<CompetencyCategory>["columnDefinitions"];
  categoryEditor: CompetencyCategoryEditor;
  categoryOptions: SelectProps.Option[];
  deleteUserLoading: boolean;
  deleteUserTarget: DeleteUserTarget;
  modalError: string;
  onChangePassword: (target: NonNullable<PasswordChangeTarget>) => void;
  onCreateCategory: () => void;
  onCreatePerson: () => void;
  onCreateUser: () => void;
  onDeleteUser: () => void;
  onDismissCategoryEditor: () => void;
  onDismissDeleteUser: () => void;
  onDismissPasswordChange: () => void;
  onDismissPersonEditor: () => void;
  onDismissUserEditor: () => void;
  onSaveCategory: (editor: NonNullable<CompetencyCategoryEditor>) => void;
  onSavePerson: (editor: NonNullable<CompetentPersonEditor>) => void;
  onSaveUser: (editor: NonNullable<UserEditor>) => void;
  passwordChangeLoading: boolean;
  passwordChangeTarget: PasswordChangeTarget;
  people: CompetentPerson[];
  personColumns: TableProps<CompetentPerson>["columnDefinitions"];
  personEditor: CompetentPersonEditor;
  saveCategoryLoading: boolean;
  savePersonLoading: boolean;
  saveUserLoading: boolean;
  userColumns: TableProps<UserAccount>["columnDefinitions"];
  userEditor: UserEditor;
  users: UserAccount[];
};

function AdministrationView({
  auditColumns,
  auditLogs,
  canManageSuperAdmins,
  categories,
  categoryColumns,
  categoryEditor,
  categoryOptions,
  deleteUserLoading,
  deleteUserTarget,
  modalError,
  onChangePassword,
  onCreateCategory,
  onCreatePerson,
  onCreateUser,
  onDeleteUser,
  onDismissCategoryEditor,
  onDismissDeleteUser,
  onDismissPasswordChange,
  onDismissPersonEditor,
  onDismissUserEditor,
  onSaveCategory,
  onSavePerson,
  onSaveUser,
  passwordChangeLoading,
  passwordChangeTarget,
  people,
  personColumns,
  personEditor,
  saveCategoryLoading,
  savePersonLoading,
  saveUserLoading,
  userColumns,
  userEditor,
  users,
}: AdministrationViewProps) {
  const layoutHeader = useMemo(
    () => (
      <Header
        description="Manage application users, competent persons, and the competency categories required for certificate uploads."
        variant="h1"
      >
        Administration
      </Header>
    ),
    []
  );

  return (
    <>
      <ContentLayout header={layoutHeader}>
        <SpaceBetween direction="vertical" size="l">
          <AdminTableSection
            actionText="Create user"
            columnDefinitions={userColumns}
            emptyText="No users are available."
            items={users}
            onAction={onCreateUser}
            title="Users"
            trackBy="user_id"
          />

          <AdminTableSection
            columnDefinitions={auditColumns}
            emptyText="No user management audit events are available."
            items={auditLogs}
            title="User Management Audit"
            trackBy="audit_id"
          />

          <AdminTableSection
            actionDisabled={categories.length === 0}
            actionText="Create competent person"
            columnDefinitions={personColumns}
            emptyText="No competent persons are available."
            items={people}
            onAction={onCreatePerson}
            title="Competent Persons"
            trackBy="competent_person_id"
          />

          <AdminTableSection
            actionText="Create competency category"
            columnDefinitions={categoryColumns}
            emptyText="No competency categories are available."
            items={categories}
            onAction={onCreateCategory}
            title="Competency Categories"
            trackBy="competency_category_id"
          />
        </SpaceBetween>
      </ContentLayout>

      <UserEditorModal
        canManageSuperAdmins={canManageSuperAdmins}
        editor={userEditor}
        errorMessage={modalError}
        loading={saveUserLoading}
        onDismiss={onDismissUserEditor}
        onSubmit={onSaveUser}
        visible={Boolean(userEditor)}
      />

      <CompetentPersonEditorModal
        categoryOptions={categoryOptions}
        editor={personEditor}
        errorMessage={modalError}
        loading={savePersonLoading}
        onDismiss={onDismissPersonEditor}
        onSubmit={onSavePerson}
        visible={Boolean(personEditor)}
      />

      <CompetencyCategoryEditorModal
        editor={categoryEditor}
        errorMessage={modalError}
        loading={saveCategoryLoading}
        onDismiss={onDismissCategoryEditor}
        onSubmit={onSaveCategory}
        visible={Boolean(categoryEditor)}
      />

      <PasswordChangeModal
        errorMessage={modalError}
        loading={passwordChangeLoading}
        onDismiss={onDismissPasswordChange}
        onSubmit={onChangePassword}
        target={passwordChangeTarget}
      />

      <DeleteUserModal
        errorMessage={modalError}
        loading={deleteUserLoading}
        onDelete={onDeleteUser}
        onDismiss={onDismissDeleteUser}
        target={deleteUserTarget}
      />
    </>
  );
}

type AdminTableSectionProps<T> = {
  actionDisabled?: boolean;
  actionText?: string;
  columnDefinitions: TableProps<T>["columnDefinitions"];
  emptyText: string;
  items: T[];
  onAction?: () => void;
  title: string;
  trackBy: keyof T & string;
};

function AdminTableSection<T>({
  actionDisabled = false,
  actionText,
  columnDefinitions,
  emptyText,
  items,
  onAction,
  title,
  trackBy,
}: AdminTableSectionProps<T>) {
  const header = useMemo(
    () => (
      <AdminTableHeader
        actionDisabled={actionDisabled}
        actionText={actionText}
        count={items.length}
        onAction={onAction}
        title={title}
      />
    ),
    [actionDisabled, actionText, items.length, onAction, title]
  );
  const empty = useMemo(() => <Box color="text-body-secondary">{emptyText}</Box>, [emptyText]);

  return (
    <Container header={header}>
      <Table
        columnDefinitions={columnDefinitions}
        empty={empty}
        items={items}
        trackBy={trackBy}
        variant="embedded"
      />
    </Container>
  );
}

type AdminTableHeaderProps = {
  actionDisabled: boolean;
  actionText?: string;
  count: number;
  onAction?: () => void;
  title: string;
};

function AdminTableHeader({
  actionDisabled,
  actionText,
  count,
  onAction,
  title,
}: AdminTableHeaderProps) {
  return (
    <Header
      actions={
        actionText && onAction ? (
          <Button disabled={actionDisabled} variant="primary" onClick={onAction}>
            {actionText}
          </Button>
        ) : null
      }
      counter={`(${count})`}
      variant="h2"
    >
      {title}
    </Header>
  );
}

type PasswordChangeModalProps = {
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (target: NonNullable<PasswordChangeTarget>) => void;
  target: PasswordChangeTarget;
};

function PasswordChangeModal({
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
  target,
}: PasswordChangeModalProps) {
  const [draft, setDraft] = useState<PasswordChangeTarget>(target);

  useEffect(() => {
    setDraft(target);
  }, [target]);

  const footer = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onDismiss}>Cancel</Button>
        <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
          Change password
        </Button>
      </SpaceBetween>
    ),
    [draft, loading, onDismiss, onSubmit]
  );

  return (
    <Modal visible={Boolean(target)} header="Change user password" onDismiss={onDismiss} footer={footer}>
      <SpaceBetween direction="vertical" size="m">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <Box>
          Set a new password for{" "}
          <Box display="inline" fontWeight="bold">
            {target?.label || "this user"}
          </Box>
          .
        </Box>
        <FormField label="New password">
          <Input
            type="password"
            value={draft?.newPassword || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, newPassword: detail.value })
            }
          />
        </FormField>
        <FormField label="Confirm new password">
          <Input
            type="password"
            value={draft?.confirmPassword || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, confirmPassword: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

type DeleteUserModalProps = {
  errorMessage: string;
  loading: boolean;
  onDelete: () => void;
  onDismiss: () => void;
  target: DeleteUserTarget;
};

function DeleteUserModal({
  errorMessage,
  loading,
  onDelete,
  onDismiss,
  target,
}: DeleteUserModalProps) {
  const footer = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onDismiss}>Cancel</Button>
        <Button loading={loading} variant="primary" onClick={onDelete}>
          Delete
        </Button>
      </SpaceBetween>
    ),
    [loading, onDelete, onDismiss]
  );

  return (
    <Modal visible={Boolean(target)} header="Delete user" onDismiss={onDismiss} footer={footer}>
      <SpaceBetween direction="vertical" size="m">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <Alert type="warning">
          Deleting a user removes their login access. Existing upload audit records keep their
          stored uploader reference.
        </Alert>
        <Box>
          Delete{" "}
          <Box display="inline" fontWeight="bold">
            {target?.label || "this user"}
          </Box>
          ?
        </Box>
      </SpaceBetween>
    </Modal>
  );
}
