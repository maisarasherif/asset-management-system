# Asset Management Platform

The Asset Management Platform contains shared capabilities and separate products for operational asset management and administration compliance.

## Language

**Platform**:
The shared base that provides cross-product capabilities such as identity, notification delivery, scheduler execution, storage, and audit.
_Avoid_: App, module, service

**AMS Product**:
The product workspace for assets, components, certificates, routine maintenance, catalog configuration, scheduler runs, and client access.
_Avoid_: Asset module, main app

**HR/Admin Product**:
The product workspace for person, vehicle, and company administration compliance records.
_Avoid_: HR module, administration module, AMS extension

**Product Access**:
The assignment that grants a user access to a specific product and defines their role inside that product.
_Avoid_: Global role, app permission

**Product Role**:
A user's authority within one product, such as ADMIN or USER. Product roles do not grant authority in other products.
_Avoid_: Global admin, system role

**HR/Admin Product Role**:
A Product Role within the HR/Admin Product. HR/Admin Product Roles are internal-only and do not include CLIENT.
_Avoid_: HR client, external admin role

**HR/Admin Administrator**:
An HR/Admin Product Role with full access to all HR/Admin Product data, including every Compliance Subject, Compliance Record, Compliance Document, and Product Notification Configuration.
_Avoid_: Limited admin, subject admin, document admin

**HR/Admin User**:
An HR/Admin Product Role that can view, download, create, and update HR/Admin Product records and documents, but cannot delete them or manage product configuration.
_Avoid_: Read-only user, document-limited user

**HR/Admin Viewer**:
An HR/Admin Product Role that can view and download HR/Admin Product records and documents, but cannot create, update, delete, or manage product configuration.
_Avoid_: Metadata-only viewer, external viewer

**Product Switcher**:
A platform-level control for users who have Product Access to more than one product. It is not part of any product's own navigation.
_Avoid_: HR menu item, app tab, module selector

**Product Surface**:
The navigation, pages, dashboards, search results, reports, and audit views that belong to one product. A Product Surface only shows data owned by that product unless an explicit cross-product relationship is being viewed.
_Avoid_: Shared app, combined dashboard, global workspace

**Product Route**:
A backend or frontend route namespace that belongs to one product and is guarded by Product Access.
_Avoid_: Module route, shared route, hidden tab

**Platform Administration**:
The platform-level surface for managing users, Product Access, and shared settings that are not owned by a single product.
_Avoid_: AMS admin, HR admin, user module

**Platform Administrator**:
A user with authority to manage Platform Administration, including Product Access and shared platform settings.
_Avoid_: Global admin, super admin, product admin

**Notification Delivery**:
A platform record of an attempted message or external task sent for a product-owned event.
_Avoid_: Scheduled task, email log, ClickUp log

**Notification Audit**:
A product-scoped view of Notification Deliveries for events owned by that product.
_Avoid_: Global scheduler log, shared notification page

**Notification Channel**:
A platform-supported delivery path such as email or ClickUp.
_Avoid_: Product notifier, alert type

**Product Notification Configuration**:
The product-specific recipients, external task destinations, and delivery settings used by Notification Channels. HR/Admin reminders use one HR/Admin Product Notification Configuration managed by HR/Admin Administrators.
_Avoid_: Global alert settings, shared recipients

**Platform Scheduler**:
The shared scheduler that runs product-owned expiry scans and uses Notification Deliveries for reminder delivery.
_Avoid_: AMS scheduler, HR scheduler, cron module

**Expiry Scan**:
A product-owned process that finds records requiring renewal reminders and submits them to the Platform Scheduler.
_Avoid_: Notification job, reminder script, cron task

**Scan Outcome**:
The product-scoped result of one Expiry Scan, including whether it completed, how many records it processed, and any failure that should be visible to that product.
_Avoid_: Scheduler result, cron status, batch result

**Compliance Record**:
A document-backed or authority-backed requirement that belongs to a Person, Vehicle, or Company and may need renewal.
_Avoid_: Certificate, qualification, license

**Compliance Record Version**:
One issued cycle of a Compliance Record, including its issue date, expiry date, and Compliance Document. Expiry reminders attach to current Compliance Record Versions; renewed versions supersede previous versions.
_Avoid_: Revision, replacement file, renewal row

**Compliance Document**:
The file attached to a Compliance Record. Compliance Documents may have stricter visibility than the Compliance Record metadata.
_Avoid_: Attachment, certificate file, upload

**Archive**:
The normal way to remove HR/Admin Product records from active use while preserving compliance history. Archive requires a reason.
_Avoid_: Delete, remove, purge

**Active Compliance Record**:
A Compliance Record that appears in active HR/Admin Product workflows and can be included in Expiry Scans.
_Avoid_: Current record, live document

**Archived Compliance Record**:
A Compliance Record preserved for history but excluded from active HR/Admin Product workflows and Expiry Scans.
_Avoid_: Deleted record, inactive document

**Compliance Record Type**:
A reusable definition of a Compliance Record that defines its expected subject type, name, renewal behavior, and document expectations.
_Avoid_: Test type, certificate type, document category

**Renewal Behavior**:
Whether a Compliance Record Type is renewable, one-time, or otherwise expected to produce expiry reminders. Renewable types require expiry dates; one-time types are excluded from Expiry Scans.
_Avoid_: Validity mode, expiry setting, test renewal mode

**Default Validity Duration**:
The suggested duration used to calculate an expiry date for a renewable Compliance Record Type. Users may override the suggested expiry date.
_Avoid_: Fixed expiry, validity rule

**Reminder Policy**:
The fixed day-offset reminder schedule used for renewable Compliance Record Types, defining when expiry reminders should be produced. Reminder Policy belongs to a Compliance Record Type, with the HR/Admin Product default used as fallback; each reminder fires once per current Compliance Record Version per Notification Channel.
_Avoid_: Alert threshold, cron schedule, notification tier setting

**Compliance Requirement**:
A rule that says a Compliance Subject is expected to have a specific Compliance Record Type.
_Avoid_: Required document, checklist item, missing certificate

**Compliance Subject**:
A Person, Vehicle, or Company that can have Compliance Records. An archived Compliance Subject excludes its Compliance Records from Expiry Scans.
_Avoid_: Owner, entity, holder, target

**Person**:
An individual whose Compliance Records are managed by the HR/Admin Product as a company responsibility. A Person is not an access identity and cannot inspect their own records by default.
_Avoid_: User, employee login, self-service profile

**Vehicle**:
A company-used vehicle that may require Compliance Records. A Vehicle is separate from an AMS Asset, though it may be linked to one when a real-world vehicle is also tracked operationally in the AMS Product.
_Avoid_: Car, automobile, fleet item

**Asset**:
An operational item tracked in the AMS Product for asset, component, certificate, maintenance, and client-access workflows.
_Avoid_: Vehicle, compliance subject

**Company**:
The organization, legal branch, office, staff housing, warehouse, yard, or company-used location that may require Compliance Records.
_Avoid_: Premises, tenant, property, facility, account, client
