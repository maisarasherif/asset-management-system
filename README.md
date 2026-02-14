# Asset Management System (AMS)

Asset Management System with certification tracking and expiry alerts built with Go, Gin framework, and MongoDB.

## Features

- User authentication with JWT tokens (access & refresh tokens)
- Role-based access control (ADMIN/USER)
- Asset management with categories
- Component tracking for each asset
- Certificate management with expiry tracking
- Email alerts for expiring certificates
- RESTful API architecture

## Technology Stack

- **Language**: Go 1.25.4
- **Web Framework**: Gin
- **Database**: MongoDB
- **Authentication**: JWT (golang-jwt/jwt)
- **Password Hashing**: bcrypt
- **Email**: gomail
- **Validation**: go-playground/validator

## Project Structure

```
Server/ams-server/
├── main.go                           # Application entry point
├── go.mod                            # Go dependencies
├── controllers/                      # Business logic handlers
│   ├── userController.go            # User registration & login
│   ├── categoryController.go        # Category CRUD operations
│   ├── assetController.go          # Asset CRUD operations
│   ├── componentController.go       # Component CRUD operations
│   └── certificateController.go     # Certificate CRUD & expiry tracking
├── models/                          # Data models
│   ├── userModel.go                # User, UserLogin, UserResponse
│   ├── categoryModel.go            # Category
│   ├── assetModel.go               # Asset
│   ├── componentModel.go           # Component
│   └── certificateModel.go         # Certificate
├── routes/                          # API route definitions
│   └── protectedRoutes.go          # All protected endpoints
├── middleware/                      # Request interceptors
│   └── authMiddleware.go           # JWT token validation
├── utils/                           # Helper functions
│   ├── tokenUtil.go                # JWT generation & validation
│   └── emailUtil.go                # Email notification service
└── database/                        # Database configuration
    └── databaseConnection.go        # MongoDB connection setup
```

## Environment Variables

Create a `.env` file in the `Server/ams-server/` directory with the following variables:

```env
# Database Configuration
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=asset_management_db

# JWT Secrets
SECRET_KEY=your-secret-key-here
SECRET_REFRESH_KEY=your-refresh-secret-key-here

# SMTP Configuration for Email Alerts
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=your-email@gmail.com

# Certificate Expiry Alert Settings
EXPIRY_ALERT_DAYS=30
```

## Installation

1. Clone the repository
2. Navigate to the server directory:
   ```bash
   cd Server/ams-server
   ```
3. Install dependencies:
   ```bash
   go mod download
   ```
4. Create and configure your `.env` file
5. Run the server:
   ```bash
   go run main.go
   ```

Server will start on `http://localhost:8080`

## API Endpoints

All endpoints require authentication via Bearer token in the Authorization header.

### User Management
- `POST /register` - Register new user
- `POST /login` - User login (returns tokens)

### Categories
- `GET /categories` - Get all categories
- `GET /category/:category_id` - Get specific category
- `POST /addcategory` - Add new category (ADMIN only)
- `PUT /updatecategory/:category_id` - Update category (ADMIN only)
- `DELETE /deletecategory/:category_id` - Delete category (ADMIN only)

### Assets
- `GET /assets` - Get all assets
- `GET /asset/:asset_id` - Get specific asset
- `POST /addasset` - Add new asset (ADMIN only)
- `PUT /updateasset/:asset_id` - Update asset (ADMIN only)
- `DELETE /deleteasset/:asset_id` - Delete asset (ADMIN only)

### Components
- `GET /components` - Get all components
- `GET /component/:component_id` - Get specific component
- `GET /components/asset/:asset_id` - Get components by asset
- `POST /addcomponent` - Add new component (ADMIN only)
- `PUT /updatecomponent/:component_id` - Update component (ADMIN only)
- `DELETE /deletecomponent/:component_id` - Delete component (ADMIN only)

### Certificates
- `GET /certificates` - Get all certificates
- `GET /certificate/:certificate_id` - Get specific certificate
- `GET /certificates/component/:component_id` - Get certificates by component
- `POST /addcertificate` - Add new certificate (ADMIN only)
- `PUT /updatecertificate/:certificate_id` - Update certificate (ADMIN only)
- `DELETE /deletecertificate/:certificate_id` - Delete certificate (ADMIN only)
- `GET /expiring-certificates` - Get certificates expiring within threshold

## Database Collections

### Users
Stores user authentication and profile information.

### Categories
Asset categories (e.g., Air Diving, Hydraulic Tools, Pneumatic Tools).

### Assets
Main equipment items with photos, datasheets, and category assignment.

### Components
Individual parts belonging to assets (e.g., valves, regulators, gauges).

### Certificates
Certificate records linked to components with issue/expiry dates.

## Authentication Flow

1. User registers via `/register` endpoint
2. User logs in via `/login` endpoint to receive JWT tokens
3. Access token (24h validity) used for API requests
4. Refresh token (7 days validity) can be used to get new access token
5. All protected endpoints require valid Bearer token in Authorization header

## Certificate Expiry System

- Certificates are automatically assigned status: VALID, EXPIRING_SOON, or EXPIRED
- Status calculated based on expiry date when adding/updating certificates
- `/expiring-certificates` endpoint returns certificates within threshold (default 30 days)
- Email utility function available for sending expiry alerts
- Threshold configurable via `EXPIRY_ALERT_DAYS` environment variable

## Role-Based Access Control

- **ADMIN**: Full access to all CRUD operations
- **USER**: Read-only access (can view data but cannot modify)

## Data Models

### Asset
- Asset ID, Name, Category
- Photo URL, Datasheet URL
- Description, Status (ACTIVE/INACTIVE/MAINTENANCE)
- Components array

### Component
- Component ID, Asset ID reference
- Name, Serial Number, Manufacturer
- Description
- Certificates array

### Certificate
- Certificate ID, Component ID reference
- Certificate Name, Issue Date, Expiry Date
- Certificate File URL, Issuing Authority
- Status (VALID/EXPIRING_SOON/EXPIRED)

## Notes

- All timestamps use UTC
- All IDs are unique string identifiers
- File uploads (photos, datasheets, certificates) should be handled separately and stored as URLs
- Email service requires proper SMTP configuration
- MongoDB connection uses v2 driver
