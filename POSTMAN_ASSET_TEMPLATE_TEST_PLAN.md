# Postman Test Plan: Asset Templates and Structured Requirements

## Goal
Use this checklist to verify the new template-driven asset structure end to end:

- template CRUD
- create asset from template
- manual asset structure management
- synced template updates
- certificate creation against requirements
- certificate history
- template reassignment
- template delete and asset unlink behavior

## Postman Setup

Create a Postman environment with these variables:

- `base_url` = `http://localhost:8080`
- `admin_email`
- `admin_password`
- `token`
- `category_id_a`
- `category_id_b`
- `test_id_a`
- `test_id_b`
- `test_id_c`
- `template_id_a`
- `template_id_b`
- `manual_asset_id`
- `template_asset_id`
- `manual_component_id`
- `template_component_id`
- `manual_requirement_id`
- `template_requirement_id`
- `manual_certificate_id`
- `template_certificate_id`
- `old_certificate_id`

Use this header on every protected request:

- `Authorization: Bearer {{token}}`
- `Content-Type: application/json`

## 1. Authenticate

### 1.1 Login as admin
`POST {{base_url}}/login`

```json
{
  "email": "{{admin_email}}",
  "password": "{{admin_password}}"
}
```

Expected:

- `200 OK`
- response contains `token`

Optional Postman test:

```javascript
pm.environment.set("token", pm.response.json().token);
```

## 2. Load Reference Data

### 2.1 Get categories
`GET {{base_url}}/categories?limit=500`

Expected:

- `200 OK`
- pick 2 category ids and save them into `category_id_a` and `category_id_b`

### 2.2 Get test types
`GET {{base_url}}/test-types`

Expected:

- `200 OK`
- pick 3 test ids and save them into `test_id_a`, `test_id_b`, and `test_id_c`

## 3. Create Template A

### 3.1 Create template
`POST {{base_url}}/asset-templates`

```json
{
  "name": "Template A - Pressure Package",
  "categories": [
    {
      "category_id": "{{category_id_a}}",
      "components": [
        {
          "name": "Main Winch",
          "serial_number": "",
          "manufacturer": "ACME",
          "description": "Primary lifting assembly",
          "equipment_type": "Winch",
          "structure": "Topside",
          "model": "W-100",
          "class": "Class A",
          "class_code": "A1",
          "safety_critical": "YES",
          "requirements": [
            {
              "test_id": "{{test_id_a}}",
              "label": "Annual Load Test"
            },
            {
              "test_id": "{{test_id_b}}",
              "label": "Visual Inspection"
            }
          ]
        }
      ]
    },
    {
      "category_id": "{{category_id_b}}",
      "components": [
        {
          "name": "Control Panel",
          "serial_number": "",
          "manufacturer": "ACME",
          "description": "Electrical control cabinet",
          "equipment_type": "Panel",
          "structure": "Cabin",
          "model": "CP-7",
          "class": "Class B",
          "class_code": "B7",
          "safety_critical": "NO",
          "requirements": [
            {
              "test_id": "{{test_id_c}}",
              "label": "Electrical Verification"
            }
          ]
        }
      ]
    }
  ]
}
```

Expected:

- `201 Created`
- response contains `template_id`
- response contains categories, components, and requirement labels

Save `template_id` as `template_id_a`.

### 3.2 Read template
`GET {{base_url}}/asset-template/{{template_id_a}}`

Expected:

- `200 OK`
- same structure returned

### 3.3 List templates
`GET {{base_url}}/asset-templates`

Expected:

- `200 OK`
- Template A appears in the list

## 4. Create a Blank Manual Asset

### 4.1 Create blank asset
`POST {{base_url}}/addasset`

```json
{
  "name": "Manual Asset 01",
  "photo": "",
  "datasheet": "",
  "description": "Manual asset for non-template flow",
  "status": "ACTIVE",
  "location": "Yard",
  "assigned_project": "Project Manual",
  "template_id": ""
}
```

Expected:

- `201 Created`
- response contains `asset_id`
- `template_id` is empty

Save `asset_id` as `manual_asset_id`.

### 4.2 Add manual component
`POST {{base_url}}/addcomponent`

```json
{
  "asset_id": "{{manual_asset_id}}",
  "category_id": "{{category_id_a}}",
  "name": "Manual Pump",
  "serial_number": "MP-001",
  "manufacturer": "ACME",
  "description": "Manual component test record",
  "equipment_type": "Pump",
  "structure": "Deck",
  "model": "P-9",
  "class": "Class M",
  "class_code": "M9",
  "safety_critical": "NO"
}
```

Expected:

- `201 Created`
- response contains `component_id`

Save `component_id` as `manual_component_id`.

### 4.3 Add manual requirement
`POST {{base_url}}/component/{{manual_component_id}}/requirements`

```json
{
  "test_id": "{{test_id_a}}",
  "label": "Manual Annual Test"
}
```

Expected:

- `201 Created`
- response is the full active requirement list for the component

Save the first returned `requirement_id` as `manual_requirement_id`.

### 4.4 Read manual requirements
`GET {{base_url}}/component/{{manual_component_id}}/requirements`

Expected:

- `200 OK`
- requirement label and test type are present

### 4.5 Create first certificate for manual requirement
`POST {{base_url}}/addcertificate`

```json
{
  "component_id": "{{manual_component_id}}",
  "requirement_id": "{{manual_requirement_id}}",
  "certificate_name": "Manual Pump Annual Test 2026",
  "issue_date": "2026-03-01T00:00:00Z",
  "expiry_date": "2027-03-01T00:00:00Z",
  "certificate_file": "",
  "issuing_authority": "QA Authority",
  "test_id": "",
  "imca_ref": "",
  "imca_d018": "",
  "maintenance_notes": "Initial issue"
}
```

Expected:

- `201 Created`
- response contains `certificate_id`
- returned `test_id` should match the requirement's test type

Save `certificate_id` as `manual_certificate_id`.

### 4.6 Create renewal certificate for same requirement
`POST {{base_url}}/addcertificate`

```json
{
  "component_id": "{{manual_component_id}}",
  "requirement_id": "{{manual_requirement_id}}",
  "certificate_name": "Manual Pump Annual Test 2027",
  "issue_date": "2027-03-02T00:00:00Z",
  "expiry_date": "2028-03-02T00:00:00Z",
  "certificate_file": "",
  "issuing_authority": "QA Authority",
  "test_id": "",
  "imca_ref": "",
  "imca_d018": "",
  "maintenance_notes": "Renewal"
}
```

Expected:

- `201 Created`
- same requirement now has two certificate records over time

### 4.7 Read component certificate history
`GET {{base_url}}/certificates/component/{{manual_component_id}}?page=1&limit=100`

Expected:

- `200 OK`
- both certificate rows are returned
- newest certificate appears first

## 5. Create Asset From Template A

### 5.1 Create templated asset
`POST {{base_url}}/addasset/from-template`

```json
{
  "name": "Template Asset 01",
  "photo": "",
  "datasheet": "",
  "description": "Created from template A",
  "status": "ACTIVE",
  "location": "Offshore",
  "assigned_project": "Project Template",
  "template_id": "{{template_id_a}}"
}
```

Expected:

- `201 Created`
- response contains `asset_id`
- `template_id` matches `template_id_a`

Save `asset_id` as `template_asset_id`.

### 5.2 Verify templated asset record
`GET {{base_url}}/asset/{{template_asset_id}}`

Expected:

- `200 OK`
- `template_id` is populated

### 5.3 Verify templated components exist
`GET {{base_url}}/components/asset/{{template_asset_id}}?page=1&limit=100`

Expected:

- `200 OK`
- component rows exist for the template structure

Save one component id as `template_component_id`.

### 5.4 Verify templated requirements exist
`GET {{base_url}}/component/{{template_component_id}}/requirements`

Expected:

- `200 OK`
- preconfigured requirement labels are present

Save one requirement id as `template_requirement_id`.

### 5.5 Add certificate to templated requirement
`POST {{base_url}}/addcertificate`

```json
{
  "component_id": "{{template_component_id}}",
  "requirement_id": "{{template_requirement_id}}",
  "certificate_name": "Template Winch Test 2026",
  "issue_date": "2026-04-01T00:00:00Z",
  "expiry_date": "2027-04-01T00:00:00Z",
  "certificate_file": "",
  "issuing_authority": "Marine Cert Authority",
  "test_id": "",
  "imca_ref": "",
  "imca_d018": "",
  "maintenance_notes": "Template flow certificate"
}
```

Expected:

- `201 Created`
- certificate is linked to the requirement

Save `certificate_id` as `template_certificate_id`.

## 6. Negative Tests for Template-Locked Assets

### 6.1 Try to add requirement directly to templated component
`POST {{base_url}}/component/{{template_component_id}}/requirements`

```json
{
  "test_id": "{{test_id_c}}",
  "label": "Should Fail"
}
```

Expected:

- `409 Conflict`
- error says template-linked assets can only be changed through their template

### 6.2 Try to update templated component directly
`PUT {{base_url}}/updatecomponent/{{template_component_id}}`

Use the current component payload with any small name change.

Expected:

- `409 Conflict`

### 6.3 Try to add certificate without `requirement_id`
`POST {{base_url}}/addcertificate`

```json
{
  "component_id": "{{template_component_id}}",
  "requirement_id": "",
  "certificate_name": "Missing Requirement Test",
  "issue_date": "2026-04-10T00:00:00Z",
  "expiry_date": "2027-04-10T00:00:00Z",
  "certificate_file": "",
  "issuing_authority": "Marine Cert Authority",
  "test_id": "",
  "imca_ref": "",
  "imca_d018": "",
  "maintenance_notes": ""
}
```

Expected:

- `400 Bad Request`
- error says `requirement_id is required for this component`

## 7. Verify Template Sync Propagation

### 7.1 Update Template A
`PUT {{base_url}}/asset-template/{{template_id_a}}`

Use the same structure as Template A, but:

- rename one requirement label
- add one new requirement to `Main Winch`
- optionally rename one component

Example add-on inside `Main Winch.requirements`:

```json
{
  "test_id": "{{test_id_c}}",
  "label": "Function Test"
}
```

Expected:

- `200 OK`
- updated template is returned

### 7.2 Verify linked asset updated
`GET {{base_url}}/component/{{template_component_id}}/requirements`

Expected:

- renamed requirement label is reflected
- newly added requirement now exists on the linked asset component

## 8. Create Template B for Reassignment Test

### 8.1 Create second template
`POST {{base_url}}/asset-templates`

Create a clearly different structure, for example one category and one component with a different requirement label.

Expected:

- `201 Created`

Save the new `template_id` as `template_id_b`.

## 9. Reassign Template Asset to Template B

### 9.1 Save old certificate id first
Before reassignment, keep `template_certificate_id` copied. That record represents old history you want to remain viewable.

### 9.2 Reassign asset
`PUT {{base_url}}/updateasset/{{template_asset_id}}`

```json
{
  "name": "Template Asset 01",
  "photo": "",
  "datasheet": "",
  "description": "Reassigned to template B",
  "status": "ACTIVE",
  "location": "Offshore",
  "assigned_project": "Project Template",
  "template_id": "{{template_id_b}}"
}
```

Expected:

- `200 OK`
- asset remains valid
- old active structure is replaced by Template B active structure

### 9.3 Verify new active structure
`GET {{base_url}}/components/asset/{{template_asset_id}}?page=1&limit=100`

Expected:

- active components now match Template B
- previous active component ids should no longer be part of the active asset structure

### 9.4 Verify old certificate still exists
`GET {{base_url}}/certificate/{{template_certificate_id}}`

Expected:

- `200 OK`
- old certificate record is still accessible

This confirms history survives reassignment even though the active structure changed.

## 10. Delete Template B and Verify Unlink

### 10.1 Delete template B
`DELETE {{base_url}}/asset-template/{{template_id_b}}`

Expected:

- `200 OK`
- response includes `unlinked_assets`

### 10.2 Verify asset is unlinked
`GET {{base_url}}/asset/{{template_asset_id}}`

Expected:

- `200 OK`
- `template_id` is now empty

### 10.3 Verify structure can now be manually edited
Pick one active component from:

`GET {{base_url}}/components/asset/{{template_asset_id}}?page=1&limit=100`

Then call:

`POST {{base_url}}/component/{{template_component_id}}/requirements`

```json
{
  "test_id": "{{test_id_b}}",
  "label": "Manual After Unlink"
}
```

Expected:

- `201 Created`
- the asset behaves like a manual asset after unlinking

## 11. Category and Test Type Protection Checks

### 11.1 Try deleting a category in use
`DELETE {{base_url}}/deletecategory/{{category_id_a}}`

Expected:

- `409 Conflict`
- error says the category has components assigned to it

### 11.2 Try deleting a test type in use
`DELETE {{base_url}}/deletetesttype/{{test_id_a}}`

Expected:

- `409 Conflict`
- error says the test type has certificates assigned to it

## 12. Optional File Upload Check

### 12.1 Upload certificate file
`POST {{base_url}}/certificate/{{manual_certificate_id}}/file`

In Postman:

- choose `Body -> form-data`
- key: `file`
- type: `File`
- pick a PDF or image

Expected:

- `200 OK`
- success message returned

### 12.2 Verify upload audit
`GET {{base_url}}/certificate/{{manual_certificate_id}}/uploads?page=1&limit=25`

Expected:

- `200 OK`
- at least one upload audit row exists

## Final Smoke Checks

Run these quick reads at the end:

- `GET {{base_url}}/asset-templates`
- `GET {{base_url}}/assets?limit=200`
- `GET {{base_url}}/components?page=1&limit=500`
- `GET {{base_url}}/certificates?page=1&limit=50`
- `GET {{base_url}}/certificates/dashboard?limit=1000`

You should be able to confirm:

- templates exist and update correctly
- manual and templated assets both work
- linked assets sync when the template changes
- template-linked assets reject direct structure edits
- reassign keeps old certificate records accessible
- deleting a template unlinks assets and makes them editable again
