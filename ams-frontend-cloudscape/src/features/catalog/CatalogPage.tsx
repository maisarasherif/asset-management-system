import {
  Alert,
  Box,
  Button,
  ColumnLayout,
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
  createCategory,
  createMainCategory,
  createTestType,
  deleteCategory,
  deleteMainCategory,
  deleteTestType,
  listAllCategories,
  listAllMainCategories,
  listTestTypes,
  updateCategory,
  updateMainCategory,
  updateTestType,
} from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";
import type { Category, MainCategory, TestType } from "../../types/ams";
import { formatMonthDuration } from "../../utils/format";

type MainCategoryEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      sort_order: string;
      main_category_name: string;
      description: string;
    }
  | null;

type CategoryEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      main_category_id: string;
      sort_order: string;
      category_name: string;
      description: string;
    }
  | null;

type TestTypeEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      test_name: string;
      validity_duration: string;
      description: string;
    }
  | null;

type DeleteTarget =
  | {
      type: "main-category" | "category" | "test-type";
      id: string;
      label: string;
    }
  | null;

function TruncatedCell({ value }: { value: string }) {
  return (
    <span className="catalog-table__truncate" title={value}>
      {value}
    </span>
  );
}

function getNextMainCategorySortOrder(mainCategories: MainCategory[]) {
  return mainCategories.reduce(
    (maxSortOrder, mainCategory) => Math.max(maxSortOrder, mainCategory.sort_order),
    0
  ) + 1;
}

function getNextCategorySortOrder(categories: Category[], mainCategoryId: string) {
  return categories
    .filter((category) => category.main_category_id === mainCategoryId)
    .reduce((maxSortOrder, category) => Math.max(maxSortOrder, category.sort_order), 0) + 1;
}

function MainCategoryEditorModal({
  editor,
  visible,
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
}: {
  editor: MainCategoryEditor;
  visible: boolean;
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<MainCategoryEditor>) => void;
}) {
  const [draft, setDraft] = useState<NonNullable<MainCategoryEditor> | null>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  const submit = () => {
    if (!draft) {
      return;
    }

    if (draft.main_category_name.trim().length < 2) {
      onSubmit({
        ...draft,
        main_category_name: draft.main_category_name,
      });
      return;
    }

    onSubmit(draft);
  };

  return (
    <Modal
      visible={visible}
      header={draft?.mode === "edit" ? "Edit main category" : "Create main category"}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Cancel</Button>
          <Button loading={loading} variant="primary" onClick={submit}>
            {draft?.mode === "edit" ? "Save changes" : "Create main category"}
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Main category name">
          <Input
            value={draft?.main_category_name || ""}
            onChange={({ detail }) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      main_category_name: detail.value,
                    }
                  : current
              )
            }
          />
        </FormField>
        <FormField label="Main category order">
          <Input
            inputMode="numeric"
            value={draft?.sort_order || ""}
            onChange={({ detail }) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      sort_order: detail.value,
                    }
                  : current
              )
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={6}
            value={draft?.description || ""}
            onChange={({ detail }) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      description: detail.value,
                    }
                  : current
              )
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

function CategoryEditorModal({
  editor,
  visible,
  errorMessage,
  loading,
  categories,
  mainCategoryOptions,
  onDismiss,
  onSubmit,
}: {
  editor: CategoryEditor;
  visible: boolean;
  errorMessage: string;
  loading: boolean;
  categories: Category[];
  mainCategoryOptions: SelectProps.Option[];
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<CategoryEditor>) => void;
}) {
  const [draft, setDraft] = useState<NonNullable<CategoryEditor> | null>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  const selectedMainCategoryOption =
    mainCategoryOptions.find((option) => option.value === draft?.main_category_id) ?? null;

  return (
    <Modal
      visible={visible}
      header={draft?.mode === "edit" ? "Edit category" : "Create category"}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Cancel</Button>
          <Button
            loading={loading}
            variant="primary"
            onClick={() => draft && onSubmit(draft)}
          >
            {draft?.mode === "edit" ? "Save changes" : "Create category"}
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Main category">
          <div data-testid="catalog-category-main-category">
	            <Select
	              options={mainCategoryOptions}
	              placeholder="Select main category"
	              selectedOption={selectedMainCategoryOption}
	              onChange={({ detail }) =>
	                setDraft((current) =>
	                  current
	                    ? {
	                        ...current,
	                        main_category_id: detail.selectedOption.value || "",
                          sort_order:
                            current.mode === "create"
                              ? String(
                                  getNextCategorySortOrder(
                                    categories,
                                    detail.selectedOption.value || ""
                                  )
                                )
                              : current.sort_order,
	                      }
	                    : current
	                )
	              }
	            />
          </div>
        </FormField>
        <FormField label="Category order">
          <Input
            inputMode="numeric"
            value={draft?.sort_order || ""}
            onChange={({ detail }) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      sort_order: detail.value,
                    }
                  : current
              )
            }
          />
        </FormField>
        <FormField label="Category name">
          <Input
            value={draft?.category_name || ""}
            onChange={({ detail }) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      category_name: detail.value,
                    }
                  : current
              )
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={6}
            value={draft?.description || ""}
            onChange={({ detail }) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      description: detail.value,
                    }
                  : current
              )
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

function TestTypeEditorModal({
  editor,
  visible,
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
}: {
  editor: TestTypeEditor;
  visible: boolean;
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<TestTypeEditor>) => void;
}) {
  const [draft, setDraft] = useState<NonNullable<TestTypeEditor> | null>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  return (
    <Modal
      visible={visible}
      header={draft?.mode === "edit" ? "Edit test type" : "Create test type"}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Cancel</Button>
          <Button
            loading={loading}
            variant="primary"
            onClick={() => draft && onSubmit(draft)}
          >
            {draft?.mode === "edit" ? "Save changes" : "Create test type"}
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Test type name">
          <Input
            value={draft?.test_name || ""}
            onChange={({ detail }) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      test_name: detail.value,
                    }
                  : current
              )
            }
          />
        </FormField>
        <FormField label="Validity duration (months)">
          <Input
            inputMode="numeric"
            value={draft?.validity_duration || ""}
            onChange={({ detail }) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      validity_duration: detail.value,
                    }
                  : current
              )
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={6}
            value={draft?.description || ""}
            onChange={({ detail }) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      description: detail.value,
                    }
                  : current
              )
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

export function CatalogPage() {
  const queryClient = useQueryClient();
  const { error, success } = useFlashbar();
  const [mainCategoryEditor, setMainCategoryEditor] = useState<MainCategoryEditor>(null);
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditor>(null);
  const [testTypeEditor, setTestTypeEditor] = useState<TestTypeEditor>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [modalError, setModalError] = useState("");

  const mainCategoriesQuery = useQuery({
    queryKey: ["main-categories", "all"],
    queryFn: listAllMainCategories,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", "all"],
    queryFn: listAllCategories,
  });

  const testTypesQuery = useQuery({
    queryKey: ["test-types"],
    queryFn: listTestTypes,
  });

  const mainCategoryMap = useMemo(
    () =>
      new Map(
        (mainCategoriesQuery.data || []).map((mainCategory) => [
          mainCategory.main_category_id,
          mainCategory.main_category_name,
        ])
      ),
    [mainCategoriesQuery.data]
  );
  const mainCategorySortOrderMap = useMemo(
    () =>
      new Map(
        (mainCategoriesQuery.data || []).map((mainCategory) => [
          mainCategory.main_category_id,
          mainCategory.sort_order,
        ])
      ),
    [mainCategoriesQuery.data]
  );

  const categoryCountByMainCategory = useMemo(() => {
    const counts = new Map<string, number>();

    for (const category of categoriesQuery.data || []) {
      if (!category.main_category_id) {
        continue;
      }

      counts.set(
        category.main_category_id,
        (counts.get(category.main_category_id) || 0) + 1
      );
    }

    return counts;
  }, [categoriesQuery.data]);

  const mainCategoryOptions = useMemo<SelectProps.Option[]>(
    () =>
      (mainCategoriesQuery.data || []).map((mainCategory) => ({
        label: mainCategory.main_category_name,
        value: mainCategory.main_category_id,
        description: mainCategory.description || mainCategory.display_id,
      })),
    [mainCategoriesQuery.data]
  );

  const saveMainCategoryMutation = useMutation({
    mutationFn: async (editor: NonNullable<MainCategoryEditor>) => {
      const payload = {
        sort_order: Number(editor.sort_order),
        main_category_name: editor.main_category_name.trim(),
        description: editor.description.trim(),
      };

      if (editor.mode === "create") {
        return createMainCategory(payload);
      }

      return updateMainCategory(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["main-categories"] }),
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
      ]);
      setMainCategoryEditor(null);
      setModalError("");
      success(
        editor.mode === "create" ? "Main category created" : "Main category updated",
        "The catalog hierarchy has been refreshed."
      );
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Main category save failed", mutationError.message);
    },
  });

  const saveCategoryMutation = useMutation({
    mutationFn: async (editor: NonNullable<CategoryEditor>) => {
      const payload = {
        main_category_id: editor.main_category_id,
        sort_order: Number(editor.sort_order),
        category_name: editor.category_name.trim(),
        description: editor.description.trim(),
      };

      if (editor.mode === "create") {
        return createCategory(payload);
      }

      return updateCategory(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      setCategoryEditor(null);
      setModalError("");
      success(
        editor.mode === "create" ? "Category created" : "Category updated",
        "The category catalog is up to date."
      );
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Category save failed", mutationError.message);
    },
  });

  const saveTestTypeMutation = useMutation({
    mutationFn: async (editor: NonNullable<TestTypeEditor>) => {
      const payload = {
        test_name: editor.test_name.trim(),
        validity_duration: Number(editor.validity_duration),
        description: editor.description.trim(),
      };

      if (editor.mode === "create") {
        return createTestType(payload);
      }

      return updateTestType(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await queryClient.invalidateQueries({ queryKey: ["test-types"] });
      setTestTypeEditor(null);
      setModalError("");
      success(
        editor.mode === "create" ? "Test type created" : "Test type updated",
        "The test type catalog is ready for template and certificate flows."
      );
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Test type save failed", mutationError.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (target: NonNullable<DeleteTarget>) => {
      if (target.type === "main-category") {
        return deleteMainCategory(target.id);
      }

      if (target.type === "category") {
        return deleteCategory(target.id);
      }

      return deleteTestType(target.id);
    },
    onSuccess: async (_, target) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["main-categories"] }),
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
        queryClient.invalidateQueries({ queryKey: ["test-types"] }),
      ]);
      setDeleteTarget(null);
      setModalError("");
      success("Catalog entry deleted", `${target.label} has been removed.`);
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Delete failed", mutationError.message);
    },
  });

  if (
    mainCategoriesQuery.isLoading ||
    categoriesQuery.isLoading ||
    testTypesQuery.isLoading
  ) {
    return <PageLoading>Loading the admin catalog...</PageLoading>;
  }

  if (
    mainCategoriesQuery.isError ||
    categoriesQuery.isError ||
    testTypesQuery.isError ||
    !mainCategoriesQuery.data ||
    !categoriesQuery.data ||
    !testTypesQuery.data
  ) {
    return (
      <PageError
        description="The catalog workspace could not be loaded."
        onRetry={() => {
          void mainCategoriesQuery.refetch();
          void categoriesQuery.refetch();
          void testTypesQuery.refetch();
        }}
      />
    );
  }

  const mainCategoryColumns: TableProps<MainCategory>["columnDefinitions"] = [
    {
      id: "name",
      header: "Main category",
      width: "22%",
      minWidth: 180,
      cell: (item) => <TruncatedCell value={item.main_category_name} />,
    },
    {
      id: "order",
      header: "Order",
      width: 100,
      minWidth: 90,
      cell: (item) => item.sort_order,
    },
    {
      id: "description",
      header: "Description",
      width: "25%",
      minWidth: 210,
      cell: (item) => <TruncatedCell value={item.description || "No description"} />,
    },
    {
      id: "categories",
      header: "Categories",
      width: 140,
      minWidth: 120,
      cell: (item) => categoryCountByMainCategory.get(item.main_category_id) || 0,
    },
    {
      id: "actions",
      header: "Actions",
      width: 220,
      minWidth: 220,
      cell: (item) => (
        <div className="catalog-table__actions">
          <Button
            onClick={() => {
              setModalError("");
              setMainCategoryEditor({
                mode: "edit",
                id: item.main_category_id,
                sort_order: String(item.sort_order),
                main_category_name: item.main_category_name,
                description: item.description || "",
              });
            }}
          >
            Edit
          </Button>
          <Button
            onClick={() =>
              setDeleteTarget({
                type: "main-category",
                id: item.main_category_id,
                label: item.main_category_name,
              })
            }
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const categoryColumns: TableProps<Category>["columnDefinitions"] = [
    {
      id: "name",
      header: "Category",
      width: "22%",
      minWidth: 180,
      cell: (item) => (
          <span className="catalog-table__truncate" title={item.category_name}>
            {item.category_name}
          </span>
      ),
    },
    {
      id: "mainOrder",
      header: "Main order",
      width: 120,
      minWidth: 110,
      cell: (item) =>
        item.main_category_id ? mainCategorySortOrderMap.get(item.main_category_id) || "-" : "-",
    },
    {
      id: "order",
      header: "Category order",
      width: 140,
      minWidth: 130,
      cell: (item) => item.sort_order,
    },
    {
      id: "main",
      header: "Main category",
      width: "18%",
      minWidth: 150,
      cell: (item) => {
        const mainCategoryName =
          (item.main_category_id && mainCategoryMap.get(item.main_category_id)) || "Unassigned";

        return (
          <span className="catalog-table__truncate" title={mainCategoryName}>
            {mainCategoryName}
          </span>
        );
      },
    },
    {
      id: "description",
      header: "Description",
      width: "25%",
      minWidth: 210,
      cell: (item) => {
        const description = item.description || "No description";

        return (
          <span className="catalog-table__truncate" title={description}>
            {description}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      width: 220,
      minWidth: 220,
      cell: (item) => (
        <div className="catalog-table__actions">
          <Button
            onClick={() => {
              setModalError("");
              setCategoryEditor({
                mode: "edit",
                id: item.category_id,
                main_category_id: item.main_category_id || "",
                sort_order: String(item.sort_order),
                category_name: item.category_name,
                description: item.description || "",
              });
            }}
          >
            Edit
          </Button>
          <Button
            onClick={() =>
              setDeleteTarget({
                type: "category",
                id: item.category_id,
                label: item.category_name,
              })
            }
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const testTypeColumns: TableProps<TestType>["columnDefinitions"] = [
    {
      id: "name",
      header: "Test type",
      width: "22%",
      minWidth: 180,
      cell: (item) => <TruncatedCell value={item.test_name} />,
    },
    {
      id: "duration",
      header: "Validity duration",
      width: 180,
      minWidth: 160,
      cell: (item) => formatMonthDuration(item.validity_duration),
    },
    {
      id: "description",
      header: "Description",
      width: "25%",
      minWidth: 210,
      cell: (item) => <TruncatedCell value={item.description || "No description"} />,
    },
    {
      id: "actions",
      header: "Actions",
      width: 220,
      minWidth: 220,
      cell: (item) => (
        <div className="catalog-table__actions">
          <Button
            onClick={() => {
              setModalError("");
              setTestTypeEditor({
                mode: "edit",
                id: item.test_id,
                test_name: item.test_name,
                validity_duration: String(item.validity_duration),
                description: item.description || "",
              });
            }}
          >
            Edit
          </Button>
          <Button
            onClick={() =>
              setDeleteTarget({
                type: "test-type",
                id: item.test_id,
                label: item.test_name,
              })
            }
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const saveMainCategory = (editor: NonNullable<MainCategoryEditor>) => {
    if (!editor) {
      return;
    }

    if (editor.main_category_name.trim().length < 2) {
      setModalError("Main category name must be at least 2 characters.");
      return;
    }
    if (!Number.isFinite(Number(editor.sort_order)) || Number(editor.sort_order) < 1) {
      setModalError("Main category order must be a positive number.");
      return;
    }

    setModalError("");
    saveMainCategoryMutation.mutate(editor);
  };

  const saveCategory = (editor: NonNullable<CategoryEditor>) => {
    if (!editor) {
      return;
    }

    if (!editor.main_category_id) {
      setModalError("Choose a main category.");
      return;
    }

    if (editor.category_name.trim().length < 2) {
      setModalError("Category name must be at least 2 characters.");
      return;
    }
    if (!Number.isFinite(Number(editor.sort_order)) || Number(editor.sort_order) < 1) {
      setModalError("Category order must be a positive number.");
      return;
    }

    setModalError("");
    saveCategoryMutation.mutate(editor);
  };

  const saveTestType = (editor: NonNullable<TestTypeEditor>) => {
    if (!editor) {
      return;
    }

    const validityDuration = Number(editor.validity_duration);
    if (editor.test_name.trim().length < 2) {
      setModalError("Test type name must be at least 2 characters.");
      return;
    }

    if (!Number.isFinite(validityDuration) || validityDuration < 1) {
      setModalError("Validity duration must be a positive number of months.");
      return;
    }

    setModalError("");
    saveTestTypeMutation.mutate(editor);
  };
  const hasMainCategories = mainCategoriesQuery.data.length > 0;

  const dismissMainCategoryEditor = () => {
    setModalError("");
    setMainCategoryEditor(null);
  };

  const dismissCategoryEditor = () => {
    setModalError("");
    setCategoryEditor(null);
  };

  const dismissTestTypeEditor = () => {
    setModalError("");
    setTestTypeEditor(null);
  };

  const dismissDeleteTarget = () => {
    setModalError("");
    setDeleteTarget(null);
  };

  return (
    <>
      <ContentLayout
        header={
          <Header
            description="Manage the taxonomy that powers template configuration and certificate workflows across the app."
            variant="h1"
          >
            Catalog
          </Header>
        }
      >
        <SpaceBetween direction="vertical" size="l">
          <ColumnLayout columns={3} variant="text-grid">
            <Container header={<Header variant="h2">Main categories</Header>}>
              <Box fontSize="display-l" fontWeight="bold">
                {mainCategoriesQuery.data.length}
              </Box>
              <Box color="text-body-secondary">
                Top-level taxonomy groups for categories.
              </Box>
            </Container>
            <Container header={<Header variant="h2">Categories</Header>}>
              <Box fontSize="display-l" fontWeight="bold">
                {categoriesQuery.data.length}
              </Box>
              <Box color="text-body-secondary">
                Component classifications used by templates and asset components.
              </Box>
            </Container>
            <Container header={<Header variant="h2">Test types</Header>}>
              <Box fontSize="display-l" fontWeight="bold">
                {testTypesQuery.data.length}
              </Box>
              <Box color="text-body-secondary">
                Default certificate test definitions and validity windows.
              </Box>
            </Container>
          </ColumnLayout>

          <Container
            header={
              <Header
                actions={
                  <Button
                    variant="primary"
                    onClick={() => {
                      setModalError("");
                      setMainCategoryEditor({
                        mode: "create",
                        sort_order: String(getNextMainCategorySortOrder(mainCategoriesQuery.data)),
                        main_category_name: "",
                        description: "",
                      });
                    }}
                  >
                    Create main category
                  </Button>
                }
                counter={`(${mainCategoriesQuery.data.length})`}
                description="Main categories organize the category catalog and make the template editor easier to scan."
                variant="h2"
              >
                Main categories
              </Header>
            }
          >
            <Table
              columnDefinitions={mainCategoryColumns}
              empty={<Box color="text-body-secondary">No main categories are defined yet.</Box>}
              items={mainCategoriesQuery.data}
              trackBy="main_category_id"
              variant="embedded"
              wrapLines={false}
            />
          </Container>

          <Container
            header={
              <Header
                actions={
                  <Button
                    variant="primary"
                    disabled={!hasMainCategories}
                    onClick={() => {
                      setModalError("");
                      setCategoryEditor({
                        mode: "create",
                        main_category_id: mainCategoriesQuery.data[0]?.main_category_id || "",
                        sort_order: String(
                          getNextCategorySortOrder(
                            categoriesQuery.data,
                            mainCategoriesQuery.data[0]?.main_category_id || ""
                          )
                        ),
                        category_name: "",
                        description: "",
                      });
                    }}
                  >
                    {hasMainCategories ? "Create category" : "Create main category first"}
                  </Button>
                }
                counter={`(${categoriesQuery.data.length})`}
                description="Categories are assigned to asset components and template components."
                variant="h2"
              >
                Categories
              </Header>
            }
          >
            {!hasMainCategories ? (
              <Alert type="info">
                Create at least one main category before adding categories. That keeps the catalog
                hierarchy clear and makes template assignment easier.
              </Alert>
            ) : null}
            <Table
              columnDefinitions={categoryColumns}
              empty={<Box color="text-body-secondary">No categories are defined yet.</Box>}
              items={categoriesQuery.data}
              trackBy="category_id"
              variant="embedded"
              wrapLines={false}
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
                      setTestTypeEditor({
                        mode: "create",
                        test_name: "",
                        validity_duration: "12",
                        description: "",
                      });
                    }}
                  >
                    Create test type
                  </Button>
                }
                counter={`(${testTypesQuery.data.length})`}
                description="Test types define certificate families and their expected validity period."
                variant="h2"
              >
                Test types
              </Header>
            }
          >
            <Table
              columnDefinitions={testTypeColumns}
              empty={<Box color="text-body-secondary">No test types are defined yet.</Box>}
              items={testTypesQuery.data}
              trackBy="test_id"
              variant="embedded"
              wrapLines={false}
            />
          </Container>
        </SpaceBetween>
      </ContentLayout>

      <MainCategoryEditorModal
        editor={mainCategoryEditor}
        visible={Boolean(mainCategoryEditor)}
        errorMessage={modalError}
        loading={saveMainCategoryMutation.isPending}
        onDismiss={dismissMainCategoryEditor}
        onSubmit={saveMainCategory}
      />

      <CategoryEditorModal
        editor={categoryEditor}
        visible={Boolean(categoryEditor)}
        errorMessage={modalError}
        loading={saveCategoryMutation.isPending}
        categories={categoriesQuery.data}
        mainCategoryOptions={mainCategoryOptions}
        onDismiss={dismissCategoryEditor}
        onSubmit={saveCategory}
      />

      <TestTypeEditorModal
        editor={testTypeEditor}
        visible={Boolean(testTypeEditor)}
        errorMessage={modalError}
        loading={saveTestTypeMutation.isPending}
        onDismiss={dismissTestTypeEditor}
        onSubmit={saveTestType}
      />

      <Modal
        visible={Boolean(deleteTarget)}
        header="Delete catalog entry"
        onDismiss={dismissDeleteTarget}
        footer={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={dismissDeleteTarget}>Cancel</Button>
            <Button
              loading={deleteMutation.isPending}
              variant="primary"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              Delete
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween direction="vertical" size="m">
          {modalError ? <Alert type="error">{modalError}</Alert> : null}
          <Alert type="warning">
            Delete entries only when they are no longer referenced by templates, components, or
            certificates. The backend will block unsafe deletes.
          </Alert>
          <Box>
            You are deleting{" "}
            <Box display="inline" fontWeight="bold">
              {deleteTarget?.label || "this entry"}
            </Box>
            .
          </Box>
        </SpaceBetween>
      </Modal>
    </>
  );
}
