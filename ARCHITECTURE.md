# Asset Management System - Architecture Overview

## System Architecture

The Asset Management System follows a **layered architecture** pattern derived from the cms-go template, with clear separation of concerns across different layers.

```
┌─────────────────────────────────────────────────┐
│              Client Applications                 │
│         (Web, Mobile, Third-party)              │
└────────────────┬────────────────────────────────┘
                 │ HTTP/HTTPS + Bearer Token
                 │
┌────────────────▼────────────────────────────────┐
│            Gin Web Framework                     │
│              (Port 8080)                         │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│         Middleware Layer                         │
│  ┌────────────────────────────────────────┐    │
│  │    AuthMiddleware (JWT Validation)     │    │
│  └────────────────────────────────────────┘    │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│          Route Layer                             │
│  ┌────────────────────────────────────────┐    │
│  │      Protected Routes Handler          │    │
│  │  - User Routes                         │    │
│  │  - Category Routes                     │    │
│  │  - Asset Routes                        │    │
│  │  - Component Routes                    │    │
│  │  - Certificate Routes                  │    │
│  └────────────────────────────────────────┘    │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│       Controller Layer (Business Logic)         │
│  ┌──────────────────┬──────────────────────┐   │
│  │ User Controller  │ Category Controller  │   │
│  ├──────────────────┼──────────────────────┤   │
│  │ Asset Controller │ Component Controller │   │
│  ├──────────────────┴──────────────────────┤   │
│  │      Certificate Controller             │   │
│  └─────────────────────────────────────────┘   │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│         Utility Layer (Helpers)                  │
│  ┌──────────────────┬──────────────────────┐   │
│  │  Token Utility   │   Email Utility      │   │
│  │  - Generate JWT  │   - Send Alerts      │   │
│  │  - Validate JWT  │   - Format Emails    │   │
│  │  - Extract Claims│                      │   │
│  └──────────────────┴──────────────────────┘   │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│          Model Layer (Data Structures)           │
│  ┌─────────────────────────────────────────┐   │
│  │  User │ Category │ Asset │ Component    │   │
│  │            Certificate                   │   │
│  └─────────────────────────────────────────┘   │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│        Database Layer (MongoDB Driver)           │
│  ┌─────────────────────────────────────────┐   │
│  │     Database Connection Manager         │   │
│  │     Collection Access Functions         │   │
│  └─────────────────────────────────────────┘   │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│           MongoDB Database                       │
│  ┌─────────────────────────────────────────┐   │
│  │  Users │ Categories │ Assets            │   │
│  │  Components │ Certificates              │   │
│  └─────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Entry Point (main.go)
- Initializes Gin router
- Sets up protected routes
- Starts HTTP server on port 8080
- Minimal configuration following cms-go pattern

### 2. Middleware Layer
**AuthMiddleware**
- Intercepts all protected route requests
- Extracts Bearer token from Authorization header
- Validates JWT token signature and expiration
- Extracts user claims (userId, role) and adds to request context
- Returns 401 Unauthorized if validation fails

### 3. Route Layer
**Protected Routes**
- All endpoints require authentication
- Groups related endpoints by resource
- Maps HTTP methods to controller functions
- Passes MongoDB client to each handler

### 4. Controller Layer
Implements business logic following cms-go patterns:

**User Controller**
- `RegisterUser`: Hash password, validate uniqueness, create user record
- `LoginUser`: Verify credentials, generate JWT tokens, return tokens

**Category Controller**
- CRUD operations with ADMIN role validation
- Timestamp management (CreatedAt, UpdatedAt)

**Asset Controller**
- CRUD operations with ADMIN role validation
- Links to category via category_id
- Supports photo and datasheet URLs

**Component Controller**
- CRUD operations with ADMIN role validation
- Links to asset via asset_id
- Supports nested certificate arrays
- Additional endpoint to get components by asset

**Certificate Controller**
- CRUD operations with ADMIN role validation
- Links to component via component_id
- Auto-calculates status (VALID/EXPIRING_SOON/EXPIRED)
- Special endpoint for expiring certificates with configurable threshold

### 5. Utility Layer

**Token Utility (tokenUtil.go)**
- `GenerateAllTokens`: Creates access token (24h) and refresh token (7 days)
- `ValidateToken`: Verifies token signature and expiration
- `UpdateAllTokens`: Updates tokens in database
- `GetAccessToken`: Extracts token from request header
- `GetUserIdFromContext`: Retrieves userId from Gin context
- `GetRoleFromContext`: Retrieves role from Gin context

**Email Utility (emailUtil.go)**
- `SendCertificateExpiryEmail`: Sends HTML formatted email alerts
- Configurable SMTP settings via environment variables
- Template-based email generation

### 6. Model Layer
Defines data structures with validation tags:

**User Model**
- Authentication fields (email, password)
- Profile fields (firstName, lastName)
- Role-based access (ADMIN/USER)
- JWT tokens storage

**Category Model**
- Categorization for assets
- Simple structure with name and description

**Asset Model**
- Main equipment record
- References category
- Optional photo/datasheet URLs
- Status tracking (ACTIVE/INACTIVE/MAINTENANCE)

**Component Model**
- Equipment parts/subassemblies
- References parent asset
- Contains certificate array
- Optional manufacturer/serial number

**Certificate Model**
- Certification records
- References parent component
- Issue and expiry date tracking
- Auto-calculated status field
- Optional certificate file URL

### 7. Database Layer

**Connection Management**
- Singleton MongoDB client instance
- Environment-based configuration
- Collection access helper function
- Follows cms-go database pattern

**Collections:**
- `Users`: Authentication and user profiles
- `Categories`: Asset categorization
- `Assets`: Main equipment inventory
- `Components`: Asset parts and subassemblies
- `Certificates`: Certification records with expiry

## Data Flow Examples

### 1. User Registration Flow
```
Client → POST /register → AuthMiddleware (Skip for register/login)
→ UserController.RegisterUser → Hash password with bcrypt
→ Validate unique email in MongoDB → Create user record
→ Return success response
```

### 2. Asset Creation Flow
```
Client → POST /addasset + Bearer Token → AuthMiddleware
→ Validate JWT → Extract role from context
→ AssetController.AddAsset → Check ADMIN role
→ Validate asset data → Insert into MongoDB
→ Return created asset
```

### 3. Certificate Expiry Check Flow
```
Client → GET /expiring-certificates + Bearer Token
→ AuthMiddleware → Validate JWT
→ CertificateController.GetExpiringCertificates
→ Read EXPIRY_ALERT_DAYS from env
→ Query MongoDB for certificates expiring within threshold
→ Return list of expiring certificates
```

### 4. Certificate Expiry Alert Flow (Background Job)
```
Scheduled Job → Query expiring certificates
→ For each certificate → Lookup component → Lookup asset
→ Get admin emails from Users collection
→ EmailUtility.SendCertificateExpiryEmail
→ SMTP Server → Deliver email notification
```

## Security Architecture

### Authentication Mechanism
- JWT-based stateless authentication
- Access tokens (short-lived: 24 hours)
- Refresh tokens (long-lived: 7 days)
- HS256 signing algorithm
- Separate secrets for access and refresh tokens

### Authorization Mechanism
- Role-based access control (RBAC)
- Two roles: ADMIN, USER
- ADMIN: Full CRUD access
- USER: Read-only access (authentication required)
- Role checked at controller level

### Password Security
- bcrypt hashing with default cost (10)
- Password minimum length: 6 characters
- Never stored in plain text
- Password comparison using constant-time comparison

### Request Security
- All endpoints protected (except register/login)
- Bearer token required in Authorization header
- Token validation on every request
- Token expiry enforcement
- Context-based user identification

## Scalability Considerations

### Horizontal Scaling
- Stateless authentication (JWT) enables multiple instances
- MongoDB handles concurrent connections
- No session storage required
- Load balancer can distribute requests

### Performance Optimization
- MongoDB indexes recommended on:
  - Users: email, user_id
  - Assets: asset_id, category_id
  - Components: component_id, asset_id
  - Certificates: certificate_id, component_id, expiry_date
- Connection pooling via MongoDB driver
- Context timeouts prevent long-running queries (100s)

### Future Enhancements
- Implement certificate expiry scheduler (cron job)
- Add file upload handling for photos/datasheets/certificates
- Implement pagination for large datasets
- Add search and filtering capabilities
- Add audit logging for ADMIN actions
- Implement refresh token rotation
- Add rate limiting middleware

## Environment Configuration

### Required Variables
```
MONGODB_URI          - MongoDB connection string
DATABASE_NAME        - Database name
SECRET_KEY           - JWT access token secret
SECRET_REFRESH_KEY   - JWT refresh token secret
SMTP_HOST            - SMTP server address
SMTP_PORT            - SMTP server port
SMTP_USER            - SMTP username
SMTP_PASSWORD        - SMTP password
FROM_EMAIL           - Sender email address
EXPIRY_ALERT_DAYS    - Certificate expiry threshold (default: 30)
```

## Error Handling Strategy

Following cms-go pattern:
- Validation errors: 400 Bad Request
- Authentication errors: 401 Unauthorized
- Authorization errors: 403 Forbidden (via 401 for role checks)
- Not found errors: 404 Not Found
- Conflict errors: 409 Conflict (duplicate email)
- Server errors: 500 Internal Server Error
- Descriptive error messages in JSON format

## Testing Strategy

### Unit Testing
- Test individual utility functions (token generation/validation)
- Test email formatting
- Mock MongoDB client for controller tests

### Integration Testing
- Test complete request flows
- Test authentication middleware
- Test database operations
- Test role-based access control

### End-to-End Testing
- Test complete user journeys
- Test certificate expiry workflow
- Test email delivery

## Deployment Recommendations

1. **Environment Setup**
   - Separate .env files for dev/staging/production
   - Use environment-specific MongoDB instances
   - Rotate JWT secrets regularly

2. **Database Setup**
   - Create indexes as mentioned above
   - Set up MongoDB replica set for production
   - Enable authentication on MongoDB

3. **Monitoring**
   - Log all authentication attempts
   - Monitor certificate expiry queries
   - Track API response times
   - Alert on failed email deliveries

4. **Backup Strategy**
   - Daily MongoDB backups
   - Store certificate files in separate storage
   - Backup .env configuration securely
