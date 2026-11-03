# CoBuddy Customer Backend — Enterprise NestJS & PostgreSQL Service

[![NestJS Version](https://img.shields.io/badge/NestJS-11.0.0-E0234E?style=flat-square&logo=nestjs)](https://nestjs.com/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-7.9.1-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis)](https://redis.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Proprietary-blue.svg?style=flat-square)](LICENSE)

The **Customer Backend** is the core server application powering the **CoBuddy Customer Mobile Application**. Built with NestJS, Prisma ORM, PostgreSQL, and Socket.IO, this service manages client authentication, companion discovery, end-to-end booking state machines, Razorpay payment capture, real-time messaging, emergency SOS dispatch, and Server-to-Server (S2S) synchronization with the CoBuddy Admin Platform and Companion Backend.

---

## Table of Contents

- [1. System Architecture & Cross-Service Topology](#1-system-architecture--cross-service-topology)
- [2. Core Features & Business Domains](#2-core-features--business-domains)
- [3. Deep Technical System Design](#3-deep-technical-system-design)
  - [3.1 Booking & Payment State Machine](#31-booking--payment-state-machine)
  - [3.2 KYC Verification & S2S Admin Sync](#32-kyc-verification--s2s-admin-sync)
  - [3.3 Real-Time WebSocket Architecture](#33-real-time-websocket-architecture)
  - [3.4 Security & Token Rotation](#34-security--token-rotation)
- [4. Directory & Module Structure](#4-directory--module-structure)
- [5. Complete API Reference](#5-complete-api-reference)
- [6. Database Schema & Prisma Models](#6-database-schema--prisma-models)
- [7. Environment Configuration](#7-environment-configuration)
- [8. Local Development & Docker Setup](#8-local-development--docker-setup)
- [9. Testing & Code Quality](#9-testing--code-quality)

---

## 1. System Architecture & Cross-Service Topology

The CoBuddy platform operates on a tri-service distributed architecture where each business persona has a dedicated backend and database, interconnected via authenticated Server-to-Server (S2S) HTTP APIs and event bridges:

```mermaid
flowchart TD
    subgraph Clients["Client Layer"]
        CA["Customer Mobile App<br/>(React Native / Android / iOS)"]
    end

    subgraph CustomerService["Customer Backend (Port 4002 / 4402)"]
        GW["NestJS API Gateway & HTTP Middleware"]
        AuthM["Auth & Token Rotation"]
        BookM["Booking & Session Orchestrator"]
        KycM["KYC Document Service"]
        ChatGW["Socket.IO Chat Gateway"]
        PayM["Razorpay Payment Service"]
        SafeM["Safety & SOS Dispatcher"]
        PrismaC["Prisma ORM 7.x"]
    end

    subgraph Storage["Customer Data Layer"]
        CDB[("PostgreSQL 16<br/>cobuddy_customer")]
        CRedis[("Redis 7<br/>Cache & Rate Limiting")]
    end

    subgraph CompanionService["Companion Backend (Port 4001 / 4401)"]
        CompAPI["Companion S2S Endpoints"]
    end

    subgraph AdminService["Admin Operations (Port 4000 / 4400)"]
        AdminAPI["Admin Verification & Internal Sync"]
        AdminWeb["Admin Frontend Dashboard (Port 43100)"]
    end

    CA -->|REST API / HTTPS| GW
    CA -->|WebSockets / WSS| ChatGW

    GW --> AuthM
    GW --> BookM
    GW --> KycM
    GW --> PayM
    GW --> SafeM

    AuthM & BookM & KycM & PayM & SafeM --> PrismaC
    PrismaC --> CDB
    GW --> CRedis

    BookM -->|S2S Dispatch / X-Internal-Service-Key| CompAPI
    KycM -->|S2S KYC Evidence Sync| AdminAPI
    AdminAPI -->|S2S Approval Callback /internal/verification-status| KycM
    SafeM -->|S2S Real-Time SOS Alert| AdminAPI
```

---

## 2. Core Features & Business Domains

* **Authentication & Identity**: Passwordless phone number OTP login, allowlisted test numbers for QA, cryptographically salted JWT access tokens (15m expiry) and hashed refresh tokens stored in database with instant revocation.
* **Onboarding & Profiling**: Multi-step onboarding workflow (Legal Consent $\rightarrow$ Location Permissions $\rightarrow$ Notification Permissions $\rightarrow$ Basic Profile Setup $\rightarrow$ Safety Tutorial).
* **Companion Discovery**: Geo-spatial discovery with latitude/longitude bounding, city/area filtering, interest tag matching, hourly price sorting, and dynamic campaign banners.
* **Booking Lifecycle Orchestrator**: Atomic booking requests with duration, venue selection, counter-offers, companion S2S sync, and automated timeouts.
* **Payment & Escrow**: Razorpay order initialization, webhook signature verification (`X-Razorpay-Signature`), captive in-app wallet balance, and platform service fee calculations.
* **KYC & Trust Safety**: Multi-part document upload (Aadhaar, PAN, DL, Voter ID, Passport), selfie validation, automated S2S synchronization to Admin Verification Queue, and internal approval webhooks.
* **Real-time Chat**: Private 1-on-1 WebSocket chat rooms between customers and companions with read receipts, typing indicators, and message history persistence.
* **Safety & Emergency SOS**: Panic button dispatcher saving location coordinates, triggering internal emergency logs, and notifying Admin Safety Operations.

---

## 3. Deep Technical System Design

### 3.1 Booking & Payment State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING_COMPANION_ACCEPTANCE: Customer creates booking
    PENDING_COMPANION_ACCEPTANCE --> ACCEPTED: Companion accepts
    PENDING_COMPANION_ACCEPTANCE --> DECLINED: Companion declines
    PENDING_COMPANION_ACCEPTANCE --> EXPIRED: 15-minute response timeout

    ACCEPTED --> PAYMENT_PENDING: S2S sync confirms acceptance
    PAYMENT_PENDING --> CONFIRMED: Razorpay captured / Wallet deducted
    PAYMENT_PENDING --> CANCELLED: Payment window expires

    CONFIRMED --> IN_PROGRESS: Both parties check-in via OTP
    IN_PROGRESS --> COMPLETED: Companion confirms & Customer signs off
    IN_PROGRESS --> DISPUTED: Customer or Companion raises incident

    COMPLETED --> REVIEWED: Customer submits review & rating
    REVIEWED --> [*]
    DECLINED --> [*]
    CANCELLED --> [*]
```

### 3.2 KYC Verification & S2S Admin Sync

1. **Client Submission**: Customer uploads front/back ID images and selfie through `/api/v1/kyc/document` and `/api/v1/kyc/selfie`.
2. **Local Persistence**: Evidence files are stored in `./uploads/kyc/` with randomized UUID filenames, and recorded in `customer_kyc` table (`status: pending`).
3. **Admin Queue Sync**: Customer backend triggers an internal S2S POST request to `Admin Backend:4000/api/internal/verification/cases/sync` with applicant metadata and document URLs.
4. **Admin Review**: Compliance operators review documents in the Admin Portal (`/verification`).
5. **S2S Callback**: Upon clicking *Approve* or *Reject*, Admin Backend notifies Customer Backend at `POST /api/v1/internal/verification-status`.
6. **State Finalization**: Customer Backend atomically updates `Customer.kycStatus = 'verified'` and records timestamp in `CustomerKyc.verifiedAt`.

### 3.3 Real-Time WebSocket Architecture

The chat gateway runs on NestJS `@WebSocketGateway({ namespace: '/chat' })`:
* **Handshake Authentication**: Clients authenticate by passing `Authorization: Bearer <token>` in connection headers.
* **Room Isolation**: Sockets join rooms partitioned by `conversationId`. Direct cross-customer or eavesdropping is prevented by authorization interceptors verifying booking ownership.
* **Events Emitted**:
  * `sendMessage`: Dispatches outbound message payload.
  * `newMessage`: Broadcasts message to the counter-party room.
  * `messageDelivered` & `messageRead`: Updates delivery receipts.
  * `typing`: Ephemeral indicator for real-time typing state.

### 3.4 Security & Token Rotation

* **Strict Content-Type Separation**: APIs reject unauthorized media types using Multer magic-byte inspection (`validateUpload`).
* **S2S Guarding**: All `/api/v1/internal/*` routes are strictly gated by `InternalServiceGuard`, which validates incoming requests against `INTERNAL_SERVICE_SECRET`.
* **PII Redaction**: Document numbers in logs and status responses are automatically masked to last 4 digits (e.g., `****3771`).

---

## 4. Directory & Module Structure

```text
cobuddy-customer-backend/
├── prisma/
│   ├── schema.prisma              # Database schema definitions & enums
│   └── seed.ts                    # Development database seeds
├── src/
│   ├── common/
│   │   ├── decorators/            # @CurrentCustomer(), @Public()
│   │   ├── filters/               # Global HttpExceptionFilter
│   │   ├── guards/                # JwtAuthGuard, InternalServiceGuard
│   │   ├── interceptors/          # Logging & Audit interceptors
│   │   └── utils/                 # File validation & encryption helpers
│   ├── config/
│   │   └── env.config.ts          # Zod-validated environment schema
│   ├── modules/
│   │   ├── account/               # Profile, location, languages
│   │   ├── auth/                  # Phone OTP, JWT, token rotation
│   │   ├── booking/               # Booking orchestrator & internal sync
│   │   ├── chat/                  # Socket.IO gateway & message history
│   │   ├── companion-client/      # S2S client communicating with Companion backend
│   │   ├── discovery/             # Companion feeds, filters, campaigns
│   │   ├── kyc/                   # Documents, selfies, admin S2S bridge
│   │   ├── payment/               # Razorpay order generation & capture
│   │   ├── reviews/               # Session ratings & reviews
│   │   ├── safety/                # Trusted contacts & SOS dispatcher
│   │   ├── session/               # Check-in OTPs & session completion
│   │   ├── support/               # Support tickets & internal escalation
│   │   ├── system/                # Master data & system health
│   │   ├── uploads/               # Secure static file serving
│   │   └── wallet/                # Customer wallet ledger & top-ups
│   ├── prisma/                    # PrismaService abstraction
│   ├── app.module.ts              # Root NestJS application module
│   └── main.ts                    # NestJS bootstrapping & Swagger setup
├── uploads/                       # Secure local storage for KYC & avatars
├── test/                          # End-to-end integration test suites
├── Dockerfile                     # Multi-stage production container build
├── package.json                   # Dependencies & build scripts
└── tsconfig.json                  # TypeScript compiler options
```

---

## 5. Complete API Reference

All routes are prefixed with `/api/v1`.

### 5.1 Authentication (`/auth`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/request-otp` | Public | Sends 6-digit OTP to mobile number |
| `POST` | `/auth/verify-otp` | Public | Validates OTP and returns JWT tokens |
| `POST` | `/auth/refresh` | Public | Exchanges refresh token for new access token |
| `POST` | `/auth/logout` | Authenticated | Revokes current session refresh token |

### 5.2 KYC Verification (`/kyc`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/kyc/status` | Authenticated | Retrieves current KYC verification state |
| `POST` | `/kyc/document` | Authenticated | Uploads front & back ID image evidence |
| `POST` | `/kyc/selfie` | Authenticated | Uploads portrait selfie image |
| `POST` | `/kyc/resubmit` | Authenticated | Resets rejected status for resubmission |
| `GET` | `/kyc/files/:folder/:file` | Authenticated | Authorized download of personal documents |

### 5.3 Discovery & Companions (`/discovery`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/discovery/companions` | Public / Auth | Search companions with filters (city, price, tags) |
| `GET` | `/discovery/companions/:id` | Public / Auth | Detailed companion profile & availability |
| `GET` | `/discovery/campaigns` | Public | Active promotional banners & announcements |
| `GET` | `/discovery/interests` | Public | Categorized interests and activities |

### 5.4 Bookings & Sessions (`/bookings`, `/sessions`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/bookings` | Authenticated | Creates a new booking request |
| `GET` | `/bookings` | Authenticated | Lists customer booking history |
| `GET` | `/bookings/:id` | Authenticated | Details and current timeline for a booking |
| `POST` | `/bookings/:id/cancel` | Authenticated | Cancels booking according to policy |
| `POST` | `/sessions/:id/check-in` | Authenticated | Verifies meeting check-in code |
| `POST` | `/sessions/:id/complete` | Authenticated | Confirms session conclusion |

### 5.5 Payments & Wallet (`/payments`, `/wallet`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/payments/create-order` | Authenticated | Generates Razorpay checkout order |
| `POST` | `/payments/verify` | Authenticated | Verifies Razorpay HMAC signature |
| `GET` | `/wallet/balance` | Authenticated | Fetches wallet balance & ledger records |

### 5.6 Internal S2S Endpoints (`/internal`)
*Protected by `X-Internal-Service-Key`.*
| Method | Endpoint | Source | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/internal/verification-status` | Admin | Syncs KYC approval/rejection decision |
| `POST` | `/internal/bookings/sync-status` | Companion | Receives companion booking acceptance/rejection |
| `POST` | `/internal/bookings/:id/status-update`| Companion | Syncs live meeting check-in & completion |
| `POST` | `/internal/bookings/customers/:id/ban`| Admin | Enforces customer ban across platform |

---

## 6. Database Schema & Prisma Models

The database contains 25 relational tables managed via Prisma migrations:

* **`Customer`**: Core customer account record (phone, name, bio, location, `kycStatus`, `accountStatus`).
* **`CustomerKyc`**: Document URLs, document numbers, verification statuses, timestamps.
* **`CustomerBooking`**: Booking lifecycle, schedule, duration, amounts, counter-offer snapshots.
* **`CustomerSession`**: In-person session tracking, check-in pins, completion timestamps.
* **`CustomerWallet` & `CustomerTransaction`**: Double-entry ledger for credits, deductions, and refunds.
* **`CustomerConversation` & `CustomerMessage`**: Message history and read receipts.
* **`CustomerSos`**: Panic triggers, GPS coordinates, dispatch records.
* **`CustomerReview`**: Ratings (1-5 stars) and feedback notes for companions.

---

## 7. Environment Configuration

Copy `.env.example` to `.env` and fill in credentials:

```env
# Application
NODE_ENV=development
PORT=4002
API_PREFIX=/api/v1

# Database & Cache
DATABASE_URL=postgresql://customer_audit:local-audit-placeholder-not-a-secret-20261018@localhost:45432/cobuddy_customer_audit?schema=public
REDIS_HOST=localhost
REDIS_PORT=46372

# Security & Tokens
JWT_ACCESS_SECRET=local-dev-jwt-access-secret-32-chars-minimum
JWT_REFRESH_SECRET=local-dev-jwt-refresh-secret-32-chars-minimum
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# S2S Cross-Service Secrets
INTERNAL_SERVICE_SECRET=local-audit-placeholder-not-a-secret-20261018
ADMIN_API_URL=http://localhost:4400
COMPANION_API_URL=http://localhost:4401

# Payment Gateway (Razorpay)
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=rzp_secret_placeholder
RAZORPAY_WEBHOOK_SECRET=webhook_secret_placeholder
```

---

## 8. Local Development & Docker Setup

### Prerequisites
* Node.js 20.x or 22.x
* PostgreSQL 16
* Redis 7
* Docker & Docker Compose (optional for containerized orchestration)

### Local Native Run
```bash
# 1. Install dependencies
npm install

# 2. Run Prisma migrations
npx prisma migrate dev

# 3. Start development server with live reload
npm run start:dev
```
The server will start on `http://localhost:4002`. Swagger OpenAPI docs will be available at `http://localhost:4002/api/docs`.

### Docker Compose Run
```bash
docker compose up -d cobuddy-audit-performance-customer-backend-1
```

---

## 9. Testing & Code Quality

The repository maintains 100% test passing rates with strict contract validation:

```bash
# Run unit and contract tests
npm test

# Run tests with coverage
npm run test:cov

# Run linter
npm run lint
```
* **Current Test Suite**: 22 passed suites, **143 / 143 tests passing (100%)**.
