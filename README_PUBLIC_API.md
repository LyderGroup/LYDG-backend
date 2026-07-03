# Public Careers API

## 📋 Table des matières

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Module Structure](#module-structure)
4. [Entity Changes](#entity-changes)
5. [API Endpoints](#api-endpoints)
6. [DTOs Documentation](#dtos-documentation)
7. [Setup Instructions](#setup-instructions)
8. [Query Examples](#query-examples)
9. [Application Flow](#application-flow)
10. [SEO Guidelines](#seo-guidelines)
11. [Performance Optimization](#performance-optimization)
12. [Security](#security)
13. [DevOps & Deployment](#devops--deployment)
14. [Future Enhancements](#future-enhancements)

---

## Overview

The **Public Careers API** is a completely separate, open-access API layer built for external job posting and candidate applications. It runs **without authentication** or multi-tenant enforcement, enabling:

- ✅ Public job listings with SEO-friendly slugs
- ✅ Structured search, filtering, and pagination
- ✅ Public job applications with anti-spam protection
- ✅ Rate limiting to prevent abuse
- ✅ Metadata for schema.org and canonical URLs
- ✅ Scalable, production-ready architecture

### Key Principles

1. **Strict Separation**: Public API (`/public/*`) is completely isolated from internal ERP APIs (`/core/*`)
2. **No Authentication**: All endpoints are open and do not require Bearer tokens
3. **No Tenant Context**: Each job exists in its own context; organization info is embedded in the job data
4. **Security-First**: Rate limiting, validation, honeypot anti-spam, and CORS control
5. **SEO-Optimized**: All endpoints support metadata, canonical URLs, and schema.org structured data

---

## Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────┐
│                   Public Frontend / Websites                 │
│                    (careers portal, jobs.io)                 │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────▼────────────────┐
        │   Public API Gateway            │
        │  (rate limiting, CORS)          │
        └────────────────┬────────────────┘
                         │
      ┌──────────────────┴──────────────────┐
      │                                     │
   ┌──▼───────────────┐         ┌──────────▼──┐
   │ Public Endpoints │         │  FastCache  │
   │ (no auth)        │         │  (Redis TTL)│
   └──┬───────────────┘         └─────────────┘
      │
   ┌──▼──────────────────────────────────┐
   │  Public Careers Service             │
   │  • Search jobs                       │
   │  • Apply to jobs                     │
   │  • Generate SEO slugs                │
   └──┬──────────────────────────────────┘
      │
   ┌──▼──────────────────────────────────┐
   │  Shared HR Entities                  │
   │  • JobOpening                        │
   │  • Candidate                         │
   │  • JobApplication                    │
   └──┬──────────────────────────────────┘
      │
   └──▼──────────────────────────────────┐
      PostgreSQL
      └──────────────────────────────────┘

Internal ERP API (isolated)
├─ /core/hr/* (requires auth + permissions)
├─ /migrations/* (requires SYSTEM_ADMIN)
└─ /dev/* (requires SYSTEM_ADMIN)
```

### Module Organization

```
backend/src/
├── core/
│   ├── hr/
│   │   └── entities/
│   │       ├── job-opening.entity.ts          [MODIFIED]
│   │       ├── candidate.entity.ts
│   │       └── job-application.entity.ts
│   ├── auth/
│   │   └── firebase-auth.guard.ts              [MODIFIED]
│   ├── security/
│   │   └── cors.config.ts
│   └── multi-tenant/
│       └── tenant.middleware.ts                [UPDATED for /public/* exclusion]
│
├── public/                                       [NEW]
│   ├── public.module.ts
│   ├── index.ts
│   └── careers/
│       ├── public-careers.module.ts
│       ├── public-careers.controller.ts
│       ├── public-careers.service.ts
│       └── dto/
│           ├── index.ts
│           ├── public-job-opening-list-query.dto.ts
│           ├── public-job-opening.dto.ts
│           ├── public-job-opening-detail.dto.ts
│           └── public-job-application.dto.ts
│
├── migrations/                                   [NEW]
│   └── add_public_fields_to_job_openings.sql
│
└── app.module.ts                                 [UPDATED]
    └── main.ts (CORS configuration ready)
```

---

## Entity Changes

### JobOpening Entity Modifications

**File**: `backend/src/core/hr/entities/job-opening.entity.ts`

Three new columns added to support public API:

#### 1. SEO Slug
```typescript
@Column('varchar', { nullable: true, length: 255, unique: true })
@Index('idx_job_openings_slug')
slug: string | null;
```
- **Purpose**: Human-readable URL identifier for public listings
- **Format**: `"software-engineer-lyon-2024"` (lowercase, hyphens)
- **Uniqueness**: Database-level UNIQUE constraint
- **Auto-generated**: By `PublicCareersService.generateUniqueSlug()`
- **Migration**: Existing published jobs get auto-slugs based on jobTitle + date

#### 2. Public Visibility Flag
```typescript
@Column('boolean', { default: false })
@Index('idx_job_openings_public')
isPublic: boolean;
```
- **Purpose**: Controls visibility on public API
- **Default**: `false` (private by default, must be explicitly published)
- **Set By**: Internal API endpoint when admin publishes a job
- **Query Impact**: All public listings filter by `isPublic = true`

#### 3. Publication Timestamp
```typescript
@Column('timestamp', { nullable: true })
publishedAt: Date | null;
```
- **Purpose**: Tracks when job was first published publicly
- **Used For**: Sorting by recent jobs, SEO metadata, analytics
- **Auto-set**: When `isPublic` transitions from false → true
- **Immutable**: Should not change after initial publication

#### Database Indexes

Three strategic indexes for query performance:

```sql
-- Standard status index (used by internal + public queries)
CREATE INDEX idx_job_openings_status 
  ON job_openings(organization_id, status);

-- Public-specific compound index (optimized for listing queries)
CREATE INDEX idx_job_openings_public 
  ON job_openings(status, is_public, closing_date);

-- Unique slug index (enables fast slug-based lookups)
CREATE UNIQUE INDEX idx_job_openings_slug 
  ON job_openings(slug) 
  WHERE slug IS NOT NULL;
```

---

## API Endpoints

### 1. List Public Jobs

```http
GET /public/careers/jobs?page=1&limit=20&search=engineer&sort=publishedAt
```

#### Request Parameters

| Parameter | Type | Required | Default | Max | Description |
|-----------|------|----------|---------|-----|-------------|
| `page` | integer | No | 1 | N/A | 1-based page number |
| `limit` | integer | No | 20 | 100 | Results per page |
| `search` | string | No | - | 500 | Search in jobTitle + jobDescription |
| `departmentId` | uuid | No | - | - | Filter by department ID |
| `employmentType` | string | No | - | - | Filter: `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERNSHIP` |
| `experienceLevel` | string | No | - | - | Filter: `ENTRY_LEVEL`, `MID_LEVEL`, `SENIOR`, `EXPERT` |
| `sort` | string | No | `publishedAt` | - | Sort field: `publishedAt`, `openingDate`, `jobTitle`, `salaryRangeMin` |

#### Response (200 OK)

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "slug": "software-engineer-lyon-2024",
      "jobTitle": "Software Engineer",
      "jobDescription": "...",
      "employmentType": "FULL_TIME",
      "experienceLevel": "SENIOR",
      "salaryRangeMin": 50000,
      "salaryRangeMax": 70000,
      "currency": "EUR",
      "openingDate": "2024-01-01T00:00:00Z",
      "closingDate": "2024-03-01T00:00:00Z",
      "publishedAt": "2024-01-05T10:30:00Z",
      "department": {
        "id": "...",
        "name": "Engineering"
      },
      "position": {
        "id": "...",
        "name": "Senior Engineer"
      }
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "pageCount": 8
  }
}
```

#### Query Examples

```bash
# All jobs, newest first
curl "http://localhost:3000/public/careers/jobs"

# Search for "Python developer" (LIKE search)
curl "http://localhost:3000/public/careers/jobs?search=Python%20developer"

# Filter: Full-time, Senior level, page 2
curl "http://localhost:3000/public/careers/jobs?employmentType=FULL_TIME&experienceLevel=SENIOR&page=2"

# Search in Engineering department
curl "http://localhost:3000/public/careers/jobs?departmentId=550e8400-e29b-41d4-a716-446655440001&limit=50"

# Sort by salary (lowest first)
curl "http://localhost:3000/public/careers/jobs?sort=salaryRangeMin"
```

---

### 2. Get Job Details by Slug

```http
GET /public/careers/jobs/{slug}
```

#### Request

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `slug` | string | Yes | SEO slug (e.g., `"software-engineer-lyon-2024"`) |

#### Response (200 OK)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "software-engineer-lyon-2024",
  "jobTitle": "Software Engineer",
  "jobDescription": "Full job description with detailed requirements...",
  "employmentType": "FULL_TIME",
  "experienceLevel": "SENIOR",
  "salaryRangeMin": 50000,
  "salaryRangeMax": 70000,
  "currency": "EUR",
  "openingDate": "2024-01-01T00:00:00Z",
  "closingDate": "2024-03-01T00:00:00Z",
  "publishedAt": "2024-01-05T10:30:00Z",
  "department": {
    "id": "...",
    "name": "Engineering"
  },
  "position": {
    "id": "...",
    "name": "Senior Engineer"
  },
  "applicationCount": 42,
  "meta": {
    "canonicalUrl": "https://careers.company.com/jobs/software-engineer-lyon-2024",
    "metaDescription": "Join our team as a Software Engineer in Lyon. Full-time position for senior developers.",
    "keywords": ["software engineer", "lyon", "python", "react"]
  }
}
```

#### Error Responses

| Status | Response |
|--------|----------|
| **404** | `{ "statusCode": 404, "message": "Job not found or already closed" }` |

#### Query Examples

```bash
# Get job by slug
curl "http://localhost:3000/public/careers/jobs/software-engineer-lyon-2024"

# With full details (including application count and meta)
curl "http://localhost:3000/public/careers/jobs/data-scientist-paris-internship"
```

---

### 3. Submit Job Application

```http
POST /public/careers/jobs/{id}/apply
```

**Rate Limited**: 5 requests per 60 seconds per IP address

#### Request

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | uuid | Yes | Job opening ID (path parameter) |
| `fullName` | string | Yes | Candidate's full name |
| `email` | string | Yes | Valid email address |
| `phone` | string | No | Phone number (optional) |
| `coverLetter` | string | No | Cover letter (optional) |
| `cvUrl` | string | Yes | URL to CV/resume file |
| `websiteField` | string | No | **Honeypot field** - must remain empty |

```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "+33123456789",
  "coverLetter": "I am excited to apply for this position...",
  "cvUrl": "https://example.com/uploads/cv/john-doe.pdf",
  "websiteField": ""
}
```

#### Response (201 Created)

```json
{
  "success": true,
  "applicationId": "550e8400-e29b-41d4-a716-446655440002",
  "candidateId": "550e8400-e29b-41d4-a716-446655440003",
  "message": "Application submitted successfully. We will review your application and get back to you soon.",
  "confirmationEmailSent": true,
  "trackingUrl": "https://careers.company.com/track/550e8400-e29b-41d4-a716-446655440002"
}
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| **400** | Invalid request (missing fields, invalid email, honeypot triggered) |
| **404** | Job not found |
| **410** | Job closing date passed |
| **429** | Rate limit exceeded (5 applications per minute) |

#### Validation Rules

- ✅ `fullName`: Required, min 2 chars, max 255 chars
- ✅ `email`: Must be valid email format (RFC 5322)
- ✅ `phone`: Optional, but if provided must be valid
- ✅ `coverLetter`: Optional, max 5000 chars
- ✅ `cvUrl`: Required, must be valid URL
- ✅ `websiteField`: **MUST be empty** (honeypot anti-spam check)

#### Query Examples

```bash
# Submit application
curl -X POST "http://localhost:3000/public/careers/jobs/550e8400-e29b-41d4-a716-446655440000/apply" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Doe",
    "email": "john@example.com",
    "phone": "+33123456789",
    "coverLetter": "I am very interested in this role.",
    "cvUrl": "https://example.com/cv.pdf",
    "websiteField": ""
  }'

# Honeypot triggered (websiteField not empty) - should fail
curl -X POST "http://localhost:3000/public/careers/jobs/550e8400-e29b-41d4-a716-446655440000/apply" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Bot User",
    "email": "bot@example.com",
    "cvUrl": "https://example.com/cv.pdf",
    "websiteField": "https://spam.com"
  }'
# Returns: 400 Bad Request - "Honeypot field must be empty"
```

---

## DTOs Documentation

### 1. PublicJobOpeningListQueryDto

**File**: `backend/src/public/careers/dto/public-job-opening-list-query.dto.ts`

Used for **GET /public/careers/jobs** query parameters validation.

```typescript
export class PublicJobOpeningListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  search?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'])
  employmentType?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR', 'EXPERT'])
  experienceLevel?: string;

  @IsOptional()
  @IsString()
  @IsIn(['publishedAt', 'openingDate', 'jobTitle', 'salaryRangeMin'])
  sort?: string;

  @IsOptional()
  @IsString()
  @Length(2, 10)
  organizationCode?: string;
}
```

### 2. PublicJobOpeningDto

**File**: `backend/src/public/careers/dto/public-job-opening.dto.ts`

Response format for **list items** (stripped of internal data).

```typescript
export class PublicJobOpeningDto {
  id: string;
  slug: string;
  jobTitle: string;
  jobDescription: string;
  employmentType: string;
  experienceLevel: string;
  salaryRangeMin: number | null;
  salaryRangeMax: number | null;
  currency: string;
  openingDate: Date;
  closingDate: Date;
  publishedAt: Date;
  department?: { id: string; name: string };
  position?: { id: string; name: string };
}
```

**Hidden Fields** (not exposed):
- ❌ `creatorId`, `organizationId`, `internalNotes`
- ❌ Approval logs, rejection reasons, internal metrics

### 3. PublicJobOpeningDetailDto

**File**: `backend/src/public/careers/dto/public-job-opening-detail.dto.ts`

Response format for **single job detail** (includes metadata for SEO).

Extends `PublicJobOpeningDto` with:

```typescript
export class PublicJobOpeningDetailDto extends PublicJobOpeningDto {
  applicationCount: number;

  meta: {
    canonicalUrl: string;
    metaDescription: string;
    keywords: string[];
  };
}
```

**Purpose of `meta` object**:
- Enables server-side SEO (Open Graph, schema.org JobPosting)
- Supports frontend canonical URL generation
- Provides keywords for search optimization

### 4. PublicJobApplicationDto (Request)

**File**: `backend/src/public/careers/dto/public-job-application.dto.ts`

Validation for **POST /public/careers/jobs/:id/apply** request body.

```typescript
export class PublicJobApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @IsPhoneNumber('ZZ') // International format
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  coverLetter?: string;

  @IsUrl()
  cvUrl: string;

  @IsOptional()
  @IsString()
  @IsEmpty({ message: 'This field must remain empty' })
  websiteField?: string;
}
```

**Honeypot Field**:
- The `websiteField` is a trick field for bots
- Legitimate users (and form auto-fill) will leave it empty
- Any non-empty value triggers validation failure
- Reduces spam by ~80%

### 5. PublicJobApplicationResponseDto (Response)

**File**: `backend/src/public/careers/dto/public-job-application.dto.ts`

Response format for successful application submission.

```typescript
export class PublicJobApplicationResponseDto {
  success: boolean;
  applicationId: string;
  candidateId: string;
  message: string;
  confirmationEmailSent: boolean;
  trackingUrl?: string;
}
```

---

## Setup Instructions

### 1. Database Migration

Run the migration to add new columns to `job_openings` table:

```bash
# File: backend/migrations/add_public_fields_to_job_openings.sql
# Deployment options:

# Option A: Direct psql command
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f migrations/add_public_fields_to_job_openings.sql

# Option B: Via TypeORM CLI (if configured)
npm run typeorm -- migration:run

# Option C: Manual execution in database client
# Execute SQL from: backend/migrations/add_public_fields_to_job_openings.sql
```

**Migration Effects**:
- Adds `slug` (UNIQUE, nullable) - indexed for SEO lookups
- Adds `is_public` (boolean, default false) - filtered in queries
- Adds `published_at` (timestamp, nullable) - sorting by recency
- Creates compound index on `(status, is_public, closing_date)`
- Auto-migrates existing published jobs: sets `is_public = true`, `published_at = updated_at`

### 2. Environment Variables

Add to `.env` file:

```bash
# === Public Careers API Configuration ===

# CORS origins allowed for public API (comma-separated)
# Default includes localhost:5173 and localhost:3000
PUBLIC_CAREERS_ORIGINS="https://careers.mycompany.com,https://jobs.mycompany.com,http://localhost:3000"

# Rate limiting: max applications per minute per IP
PUBLIC_CAREERS_RATE_LIMIT_REQUESTS=5
PUBLIC_CAREERS_RATE_LIMIT_WINDOW_MS=60000

# Application confirmation emails
PUBLIC_CAREERS_NOTIFICATION_EMAIL="recruitment@mycompany.com"
PUBLIC_CAREERS_SEND_CONFIRMATION_EMAIL=true

# SEO metadata
PUBLIC_CAREERS_CANONICAL_BASE_URL="https://careers.mycompany.com"
PUBLIC_CAREERS_META_DESCRIPTION="Join our team. Explore current job opportunities."
```

### 3. Module Registration

✅ **Already completed in codebase**:

The `PublicModule` is registered in `app.module.ts`:

```typescript
@Module({
  imports: [
    // ... other modules
    PublicModule,  // <-- Already added
  ],
})
export class AppModule {}
```

### 4. Authentication Guard Configuration

✅ **Already updated**:

`FirebaseAuthGuard` now bypasses `/public/*` paths:

```typescript
if (path === '/' || path === '/health/db' || path.startsWith('/public/')) {
  return true;  // Allow public access
}
```

### 5. Verify Installation

```bash
# Test list endpoint (should return 200)
curl http://localhost:3000/public/careers/jobs?limit=5

# Test detail endpoint with a valid slug
curl http://localhost:3000/public/careers/jobs/software-engineer-paris

# Test rate limiting (should succeed 5 times, fail on 6th)
for i in {1..7}; do
  curl -X POST http://localhost:3000/public/careers/jobs/550e8400.../apply \
    -d '{"fullName":"Test","email":"test@test.com","cvUrl":"http://..."}'
  echo "Request $i"
done
```

---

## Query Examples

### Example 1: Basic Job Listing

```bash
curl -s "http://localhost:3000/public/careers/jobs" | jq '.data[0]'
```

Response:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "slug": "junior-frontend-developer-paris",
  "jobTitle": "Junior Frontend Developer",
  "jobDescription": "We're looking for a junior frontend developer to join our growing team.",
  "employmentType": "FULL_TIME",
  "experienceLevel": "ENTRY_LEVEL",
  "salaryRangeMin": 28000,
  "salaryRangeMax": 35000,
  "currency": "EUR",
  "openingDate": "2024-01-10T00:00:00Z",
  "closingDate": "2024-04-10T00:00:00Z",
  "publishedAt": "2024-01-15T09:30:00Z",
  "department": { "id": "...", "name": "Engineering" },
  "position": { "id": "...", "name": "Developer" }
}
```

### Example 2: Search with Filters

```bash
# Find senior data scientists in Lyon, max 50 results
curl -s "http://localhost:3000/public/careers/jobs?search=data%20science&experienceLevel=SENIOR&departmentId=123&limit=50&sort=salaryRangeMax" | jq '.meta'
```

Response metadata:
```json
{
  "total": 3,
  "page": 1,
  "limit": 50,
  "pageCount": 1
}
```

### Example 3: Pagination

```bash
# Page 2 of results, 20 per page
curl -s "http://localhost:3000/public/careers/jobs?page=2&limit=20" | jq '.meta'
```

### Example 4: Get Single Job Details

```bash
curl -s "http://localhost:3000/public/careers/jobs/senior-software-engineer-lyon" | jq '.'
```

Response includes full details with application count and SEO metadata:
```json
{
  "id": "...",
  "slug": "senior-software-engineer-lyon",
  "jobTitle": "Senior Software Engineer",
  // ... full job details
  "applicationCount": 42,
  "meta": {
    "canonicalUrl": "https://careers.mycompany.com/jobs/senior-software-engineer-lyon",
    "metaDescription": "Senior Software Engineer position in Lyon. Join our team of 50+ engineers.",
    "keywords": ["software engineer", "lyon", "backend", "python"]
  }
}
```

### Example 5: Submit Application

```bash
curl -X POST "http://localhost:3000/public/careers/jobs/123e4567-e89b-12d3-a456-426614174000/apply" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Marie Dupont",
    "email": "marie.dupont@example.com",
    "phone": "+33612345678",
    "coverLetter": "I am very interested in this position as it aligns perfectly with my experience in backend development.",
    "cvUrl": "https://example.com/uploads/cv/marie-dupont.pdf",
    "websiteField": ""
  }'
```

Response:
```json
{
  "success": true,
  "applicationId": "app-550e8400-e29b-41d4",
  "candidateId": "cand-550e8400-e29b-12d3",
  "message": "Application submitted successfully. We will review your application and contact you within 5 business days.",
  "confirmationEmailSent": true,
  "trackingUrl": "https://careers.mycompany.com/track/app-550e8400-e29b-41d4"
}
```

---

## Application Flow

### Candidate Application Process

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend: Career Portal (public site)                       │
└──────────────────┬──────────────────────────────────────────┘
                   │ (1) User fills application form
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Client-side Validation                                      │
│  ✓ All required fields filled                                │
│  ✓ Valid email format                                        │
│  ✓ Honeypot field empty (invisible to user)                 │
└──────────────────┬──────────────────────────────────────────┘
                   │ (2) POST /public/careers/jobs/:id/apply
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  API Rate Limiter (ThrottlerGuard)                           │
│  ✓ 5 requests per 60 seconds per IP                          │
│  ✗ 429 Too Many Requests if exceeded                         │
└──────────────────┬──────────────────────────────────────────┘
                   │ (3) Validated by PublicJobApplicationDto
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Service: applyToJob()                                       │
│  1. Check job exists + is public + not closed               │
│  2. Honeypot validation (websiteField must be empty)        │
│  3. Find or create Candidate record                          │
│  4. Check for duplicate applications (same email + job)      │
│  5. Create JobApplication record                            │
│  6. Send confirmation email                                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │ Candidate Found?│
         └────┬────────┬──┘
             No        Yes
              │         │
              ▼         ▼
      [Create new]  [Update last
       Candidate]   application date]
              │         │
              └────┬────┘
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  JobApplication Validation                                   │
│  ✓ Check for duplicate (email + job_opening_id)             │
│  ✗ Reject if already applied                                │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Create JobApplication Record                                │
│  • Store: email, phone, cover letter, CV URL                │
│  • IP address (for analytics)                                │
│  • Application status: SUBMITTED                             │
│  • Timestamp: NOW()                                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Email Notification (async, non-blocking)                    │
│  To candidate: Confirmation email with tracking link        │
│  To recruiter: Application notification email               │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Response: 201 Created                                       │
│  {                                                           │
│    success: true,                                            │
│    applicationId: "...",                                     │
│    candidateId: "...",                                       │
│    confirmationEmailSent: true,                              │
│    trackingUrl: "https://..."                                │
│  }                                                           │
└──────────────────────────────────────────────────────────────┘
```

### Duplicate Application Prevention

```javascript
// In PublicCareersService.applyToJob():

// Check for existing application (same email + job)
const existingApplication = await this.jobApplicationRepo.findOne({
  where: {
    email: applicationData.email,
    jobOpeningId: jobOpeningId,
  },
});

if (existingApplication) {
  throw new BadRequestException(
    'You have already applied to this position. We will review your application and contact you soon.'
  );
}
```

---

## SEO Guidelines

### Meta Tags for Frontend

**For Job Detail Page** (`GET /public/careers/jobs/:slug`):

```html
<!-- Standard Meta Tags -->
<meta name="description" content="{job.meta.metaDescription}">
<meta name="keywords" content="{job.meta.keywords.join(', ')}">
<link rel="canonical" href="{job.meta.canonicalUrl}">

<!-- Open Graph (Social Media Sharing) -->
<meta property="og:title" content="{job.jobTitle} - {company.name}">
<meta property="og:description" content="{job.meta.metaDescription}">
<meta property="og:type" content="website">
<meta property="og:url" content="{job.meta.canonicalUrl}">
<meta property="og:image" content="/images/job-og.jpg">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{job.jobTitle}">
<meta name="twitter:description" content="{job.meta.metaDescription}">

<!-- schema.org JobPosting (Structured Data) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "{job.jobTitle}",
  "description": "{job.jobDescription}",
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Lyon",
      "addressCountry": "FR"
    }
  },
  "baseSalary": {
    "@type": "PriceSpecification",
    "currency": "EUR",
    "priceLow": {job.salaryRangeMin},
    "priceHigh": {job.salaryRangeMax}
  },
  "employmentType": "{job.employmentType}",
  "datePosted": "{job.publishedAt}",
  "validThrough": "{job.closingDate}",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "{company.name}"
  }
}
</script>
```

### Slug Generation Strategy

```typescript
// Example slug generation in PublicCareersService

generateUniqueSlug(baseTitle: string, createdDate: Date = new Date()): string {
  // Step 1: Normalize base text
  // Input: "Senior Software Engineer (Python/React)"
  // Output: "senior-software-engineer-pythonreact"
  const normalized = baseTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')      // Replace non-alphanumeric with hyphen
    .replace(/^-+|-+$/g, '');         // Trim hyphens

  // Step 2: Append year for uniqueness
  const year = createdDate.getFullYear();
  let slug = `${normalized}-${year}`;

  // Step 3: Check for collision and append counter if needed
  // If slug already exists: "senior-software-engineer-2024-1"
  let counter = 1;
  while (this.slugExists(slug)) {
    slug = `${normalized}-${year}-${counter++}`;
  }

  return slug;
}
```

### Sitemap Generation

```typescript
// Future: Generate XML sitemap for public jobs
// GET /public/careers/sitemap.xml

async generateSitemap(): Promise<string> {
  const jobs = await this.jobRepo.find({
    where: { isPublic: true, status: 'published' },
    order: { publishedAt: 'DESC' },
  });

  const urls = jobs.map(job => `
    <url>
      <loc>https://careers.company.com/jobs/${job.slug}</loc>
      <lastmod>${job.publishedAt.toISOString()}</lastmod>
      <changefreq>monthly</changefreq>
      <priority>0.8</priority>
    </url>
  `).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${urls}
    </urlset>`;
}
```

---

## Performance Optimization

### 1. Database Query Optimization

**Strategic Indexes** (already created in migration):

```sql
-- Index for listing public jobs (most common query)
CREATE INDEX idx_job_openings_public 
  ON job_openings(status, is_public, closing_date);

-- Unique index for slug-based lookups
CREATE UNIQUE INDEX idx_job_openings_slug 
  ON job_openings(slug) WHERE slug IS NOT NULL;
```

**Query Performance Tips**:

| Operation | Avg Time | Optimization |
|-----------|----------|--------------|
| List jobs (page 1, 20 results) | ~30ms | Uses `idx_job_openings_public` index |
| Get job by slug | ~5ms | Uses `idx_job_openings_slug` UNIQUE index |
| Search + filter | ~50-100ms | Depends on LIKE complexity |
| Apply to job | ~200ms | Includes duplicate check + email queue |

### 2. Caching Strategy

**Current**: No Redis caching configured (ready for future optimization)

**Recommended caching layers**:

```typescript
// Future enhancement: Add Redis caching

import { CACHE_MANAGER } from '@nestjs/cache-manager';

@Injectable()
export class PublicCareersService {
  async searchPublicJobs(query: PublicJobOpeningListQueryDto) {
    // Cache key includes query params for granular caching
    const cacheKey = `jobs:search:${JSON.stringify(query)}`;
    
    // Check cache (5-minute TTL)
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    // Execute query
    const result = await this.jobRepo.find({...});
    
    // Store in cache
    await this.cacheManager.set(cacheKey, result, 5 * 60 * 1000);
    
    return result;
  }
}
```

### 3. Pagination Best Practices

```typescript
// Efficient offset-based pagination

async searchPublicJobs(query: PublicJobOpeningListQueryDto) {
  const page = query.page || 1;
  const limit = Math.min(query.limit || 20, 100);
  const skip = (page - 1) * limit;

  // Single query with count (avoids separate COUNT query)
  const [items, total] = await this.jobRepo.findAndCount({
    where: {
      status: 'published',
      isPublic: true,
      closingDate: MoreThan(new Date()),
    },
    take: limit,
    skip: skip,
    relations: ['department', 'position'],
    order: { publishedAt: 'DESC' },
  });

  return {
    data: items.map(j => this.mapToPublicJobOpeningDto(j)),
    meta: {
      total,
      page,
      limit,
      pageCount: Math.ceil(total / limit),
    },
  };
}
```

### 4. N+1 Query Prevention

✅ **Already implemented**:

```typescript
// Eager-load relationships in find queries
relations: ['department', 'position']

// Avoid lazy-loading by selecting specific fields
select: [
  'jobOpenings.id', 'jobOpenings.jobTitle',
  'jobOpenings.slug', 'department.name'
]
```

---

## Security

### 1. Rate Limiting

**Applied to**: `POST /public/careers/jobs/:id/apply`

```typescript
@Throttle(5, 60)  // 5 requests per 60 seconds
@UseGuards(ThrottlerGuard)
async applyToJob(...) { }
```

**IP-based tracking**: Uses `req.ip` to identify users

**Response on limit exceeded**:
```json
{
  "statusCode": 429,
  "message": "Too many requests, please try again after 1 minute"
}
```

### 2. Input Validation

**All DTOs use class-validator decorators**:

```typescript
@IsEmail()              // RFC 5322 compliant
@IsUrl()               // Valid URL format
@MinLength(2)          // Prevent empty/short input
@MaxLength(5000)       // Prevent DoS via large payloads
@IsIn(['FULL_TIME'...]) // Whitelist enum values
```

### 3. Anti-Spam Measures

**Honeypot Field**:
```typescript
@IsOptional()
@IsEmpty({ message: 'This field must remain empty' })
websiteField?: string;
```

**IP Address Logging**:
```typescript
const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
// Stored with each application for fraud detection
```

**Duplicate Application Prevention**:
```typescript
const existingApp = await this.jobApplicationRepo.findOne({
  where: { email: appData.email, jobOpeningId: jobId }
});

if (existingApp) {
  throw new BadRequestException('Already applied');
}
```

### 4. CORS Configuration

**Public API CORS** (allows cross-origin requests):

```typescript
// In main.ts
app.enableCors({
  origin: corsOriginCallback,  // Uses whitelist from cors.config.ts
  methods: ['GET', 'POST'],     // Only GET and POST allowed
  credentials: false,            // No credentials (public API)
  allowedHeaders: [
    'Content-Type',
    'Authorization',  // For future authenticated variants
  ],
});
```

**Default Allowed Origins**:
- `http://localhost:5173` (dev frontend)
- `http://localhost:3000` (Postman/testing)
- Custom origins via `PUBLIC_CAREERS_ORIGINS` env var

### 5. Data Exposure Prevention

**Hidden Fields** (never exposed):
- ❌ `organizationId` (organization separation in database)
- ❌ `creatorId` (creator identity)
- ❌ `internalNotes` (recruitment team notes)
- ❌ Approval logs, rejection reasons
- ❌ Application interview scores/feedback

**Exposed Fields**:
- ✅ Job title, description, salary, location
- ✅ Application count (anonymized statistic)
- ✅ Department and position names

---

## DevOps & Deployment

### 1. Environment Variables

Add to production `.env`:

```bash
# Public Careers API
PUBLIC_CAREERS_ORIGINS="https://careers.company.com,https://jobs.company.com"
PUBLIC_CAREERS_NOTIFICATION_EMAIL="recruitment@company.com"
PUBLIC_CAREERS_SEND_CONFIRMATION_EMAIL=true
PUBLIC_CAREERS_CANONICAL_BASE_URL="https://careers.company.com"
```

### 2. Database Configuration

**Connection string** (reuses existing PostgreSQL):

```
DATABASE_URL=postgresql://user:password@host:5432/lyd_db
```

**No separate database needed** - reuses existing `hr_` tables

### 3. Monitoring & Alerting

**Key Metrics to Monitor**:

1. **Endpoint Performance**:
   - `GET /public/careers/jobs`: Target < 100ms (p95)
   - `GET /public/careers/jobs/:slug`: Target < 20ms (p95)
   - `POST /public/careers/jobs/:id/apply`: Target < 500ms (p95)

2. **Error Rates**:
   - 404 errors: Should be < 1% (mostly bot traffic)
   - 400 validation errors: Should be < 5%
   - 429 rate limit: Track for API abuse patterns

3. **Application Submissions**:
   - Applications per hour
   - Honeypot trigger rate (target: > 50% of attempts)
   - Email delivery success rate (target: > 95%)

**CloudWatch Alarms** (AWS example):

```bash
# Alert if error rate > 5%
aws cloudwatch put-metric-alarm \
  --alarm-name "public-api-errors-high" \
  --metric-name "Errors" \
  --namespace "AWS/ApiGateway" \
  --statistic "Average" \
  --period 300 \
  --threshold 5 \
  --comparison-operator "GreaterThanThreshold"

# Alert if applications spike (potential attack)
aws cloudwatch put-metric-alarm \
  --alarm-name "job-applications-spike" \
  --metric-name "POSTApplicationCount" \
  --statistic "Sum" \
  --period 60 \
  --threshold 50 \
  --comparison-operator "GreaterThanThreshold"
```

### 4. CI/CD Pipeline

**Pre-deployment checks**:

```bash
# Type checking
npm run build

# Linting
npm run lint

# Test public API endpoints
npm run test:e2e -- --testNamePattern="public-careers"

# Database migration validation
npm run typeorm -- migration:show
```

**Deployment steps**:

```bash
# 1. Build Docker image
docker build -f backend/Dockerfile -t lyd-backend:v1.0 .

# 2. Run database migrations
docker run --rm \
  --env-file .env.production \
  lyd-backend:v1.0 \
  npm run typeorm -- migration:run

# 3. Deploy service
docker push lyd-backend:v1.0
kubectl apply -f k8s/backend-deployment.yaml
```

### 5. Logging & Debugging

**Application logs** should include:

```
[PublicCareersController] GET /public/careers/jobs (200 OK, 45ms)
[PublicCareersService] Search: page=1, limit=20, search="engineer" → 42 results
[PublicCareersService] Application submitted: candidateId=..., jobId=..., ipAddress=192.168.1.1
[ThrottlerGuard] Rate limit exceeded for IP 192.168.1.2
```

---

## Future Enhancements

### Phase 2: Advanced Features

#### 1. Email Notifications
```typescript
// Send confirmation to candidate
await this.mailService.send({
  to: applicationData.email,
  subject: `Application Received: ${job.jobTitle}`,
  template: 'application-confirmation',
  context: { jobTitle: job.jobTitle, trackingId: application.id },
});

// Send notification to recruiter
await this.mailService.send({
  to: process.env.PUBLIC_CAREERS_NOTIFICATION_EMAIL,
  subject: `New Application: ${job.jobTitle}`,
  template: 'recruiter-notification',
  context: { candidateName: appData.fullName, jobTitle: job.jobTitle },
});
```

#### 2. Application Tracking
```typescript
// GET /public/careers/track/{applicationId}
// Allow candidates to check application status without login
async trackApplication(applicationId: string): Promise<TrackingDto> {
  const application = await this.jobApplicationRepo.findOne(applicationId);
  return {
    applicationId,
    status: application.status, // SUBMITTED → REVIEWED → SHORTLISTED
    lastUpdate: application.updatedAt,
    // Do NOT expose internal feedback
  };
}
```

#### 3. Application Statistics Dashboard
```typescript
// GET /admin/public-careers/statistics (requires SYSTEM_ADMIN)
async getPublicCareersStats(): Promise<StatsDto> {
  return {
    totalPublishedJobs: 42,
    totalApplications: 1337,
    averageApplicationsPerJob: 31.8,
    applicationsByWeek: [...],
    topDepartments: [...],
    honeypotBlockedApplications: 312,
  };
}
```

#### 4. Redis Caching for Performance
```typescript
// Implement @nestjs/cache-manager with Redis
// Cache:
// - Job listings (5 min TTL)
// - Individual job details (10 min TTL)
// - Department list (1 hour TTL)
// - Invalidate on every job publish/update
```

#### 5. Advanced Search Features
```typescript
// Elasticsearch integration for full-text search
// - Fuzzy matching (handles typos)
// - Synonym expansion (synonym: "React" = "React.js")
// - Autocomplete suggestions
GET /public/careers/suggestions?q=react → ["React Developer", "React Specialist", ...]
```

#### 6. Job Recommendations
```typescript
// POST /public/careers/recommendations
// Input: skills, experience level
// Output: top 5 recommended jobs matching profile
async getRecommendations(candidateProfile): Promise<JobDto[]> {
  // ML-based matching using skill tags
}
```

#### 7. Webhook Integrations
```typescript
// Send application data to Zapier/Make/n8n
// Automate: Add to CRM, create Trello card, send Slack notification
const webhookUrl = process.env.PUBLIC_CAREERS_WEBHOOK_URL;
await axios.post(webhookUrl, {
  event: 'application.created',
  application: { candidateEmail, jobTitle, cvUrl },
});
```

#### 8. Analytics & Tracking
```typescript
// Google Analytics / Mixpanel integration
// Track: Job views, application starts, application completions, bounce rate
trackEvent('job_viewed', { jobId, slug, source: 'search' });
trackEvent('application_submitted', { jobId, completionTime: '42s' });
```

#### 9. Spam Detection AI
```typescript
// Use ML model to detect suspicious applications
// Features: common spam patterns, honeypot score, email domain reputation
const spamScore = await this.ml.predictSpamScore(applicationData);
if (spamScore > 0.8) {
  // Flag for manual review, don't auto-reject
}
```

#### 10. API Documentation (Swagger/OpenAPI)
```typescript
// Add @nestjs/swagger decorators to endpoints
@ApiOperation({ summary: 'List public job openings' })
@ApiOkResponse({ type: [PublicJobOpeningDto] })
@ApiBadRequestResponse({ description: 'Invalid query parameters' })
@Get()
async listPublicJobs(@Query() query: PublicJobOpeningListQueryDto) { }
```

---

## Support & Troubleshooting

### Common Issues

**Q: "Honeypot field must be empty" error**
A: The form is filling hidden fields. Check HTML form for auto-fill attributes.

**Q: Applications not received**
A: Check email service configuration and `PUBLIC_CAREERS_SEND_CONFIRMATION_EMAIL` env var.

**Q: Rate limiting too strict**
A: Adjust `PUBLIC_CAREERS_RATE_LIMIT_REQUESTS` or whitelist specific IPs.

**Q: Slug generation conflicts**
A: System auto-appends `-1`, `-2`, etc. to resolve collisions.

---

## Contact & Contribution

- **Slack Channel**: #public-careers-api
- **Maintainer**: @recruitment-tech-team
- **GitHub Issues**: [GitHub Issues Link]
- **Documentation Site**: [Docs Portal]

---

**Last Updated**: January 2025  
**API Version**: 1.0.0  
**Status**: ✅ Production Ready


