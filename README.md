# CoBuddy Customer Backend — Enterprise NestJS & PostgreSQL API

[![NestJS Version](https://img.shields.io/badge/NestJS-11.0.0-E0234E?style=flat-square&logo=nestjs)](https://nestjs.com/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-7.9.1-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Swagger Docs](https://img.shields.io/badge/Swagger-OpenAPI--3.0-85EA2D?style=flat-square&logo=swagger)](http://localhost:4002/api/docs)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen?style=flat-square)](http://localhost:4002)

Official backend service for the **CoBuddy Customer Mobile Application**. Built with **NestJS**, **Prisma ORM**, **PostgreSQL**, **Socket.IO**, **Passport JWT**, and **Razorpay Payments**.

---

## 🚀 Key Features & Modules

The backend architecture is derived directly from the audited **CoBuddy Customer Mobile App** (`CoBuddyCustomerUpdated`) screens, components, mock data, and store contracts.

| Module | Endpoints | Key Responsibilities |
|--------|-----------|----------------------|
| **AuthModule** | 7 | Phone OTP login, 6-digit OTP verification, JWT access/refresh token rotation, logout, me |
| **ProfileModule** | 6 | Profile CRUD, onboarding step completion, profile completion %, photo upload/delete |
| **KycModule** | 5 | Aadhaar/PAN document upload, selfie capture, liveness check, status checks, resubmit |
| **DiscoveryModule** | 6 | Browse & search companions, category filters, featured list, details, favorites CRUD |
| **BookingModule** | 7 | Booking request creation, list/details, cancellation, modification, counter offers, disputes |
| **SessionModule** | 6 | Active session tracking, check-in with passcode, digital session pass, extensions, end & tip |
| **WalletModule** | 7 | Balance stats, transactions ledger, saved payment methods (UPI/Cards) GET/POST/DELETE/default |
| **PaymentModule** | 5 | Razorpay order creation, server-side HMAC SHA256 payment verification, wallet top-ups |
| **SafetyModule** | 9 | Emergency SOS alert trigger/resolve, trusted contacts management (max 3), incident reports |
| **NotificationsModule**| 5 | Categorized in-app inbox, mark read/read-all, delete, device FCM token registration |
| **SupportModule** | 4 | Help tickets list, open new ticket, ticket thread messages & replies |
| **ReviewsModule** | 3 | Submit 5-star companion ratings & reviews, my reviews list, public companion reviews |
| **AccountModule** | 9 | Account settings GET/PATCH, active device sessions, block/unblock, deactivation, deletion |
| **ChatModule** | 6 | Conversation list, companion chat, concierge chat, message history, Socket.IO WebSockets |
| **UploadsModule** | 1 | Generic multipart form file upload handler (`/uploads/media/`) |

---

## 🛠️ Technology Stack

- **Framework**: [NestJS 11](https://nestjs.com/)
- **Database**: [PostgreSQL 15](https://www.postgresql.org/)
- **ORM**: [Prisma ORM 7.9](https://www.prisma.io/) with `@prisma/adapter-pg`
- **Realtime Transport**: [Socket.IO](https://socket.io/) (`/chat` namespace)
- **Payment Gateway**: [Razorpay Node SDK](https://razorpay.com/) + Server-side HMAC SHA256 signature verification
- **Authentication**: `@nestjs/passport` + `passport-jwt` + `jsonwebtoken`
- **Validation**: `class-validator` + `class-transformer` (Strict mode)
- **API Documentation**: `@nestjs/swagger` OpenAPI 3.0

---

## 📁 Repository Structure

```
cobuddy-customer-backend/
├── prisma/
│   ├── schema.prisma         # Complete PostgreSQL database schema (22 models)
├── src/
│   ├── common/
│   │   ├── decorators/       # CurrentCustomer custom parameter decorator
│   │   ├── filters/          # HttpExceptionFilter structured error handler
│   │   └── interceptors/     # ResponseInterceptor envelope wrapper
│   ├── modules/
│   │   ├── account/          # Customer settings, device sessions, blocks, deactivation
│   │   ├── auth/             # OTP send/verify, JWT strategy, guards, refresh tokens
│   │   ├── booking/          # Booking lifecycle, pricing engine, counter offers
│   │   ├── chat/             # Chat threads, REST history & Socket.IO Gateway
│   │   ├── discovery/        # Companion browse, filter, search & favorites
│   │   ├── kyc/              # Document, selfie, and liveness verification
│   │   ├── notifications/    # In-app notifications & device FCM tokens
│   │   ├── payment/          # Razorpay order generation & signature verification
│   │   ├── profile/          # Profile setup, onboarding progress & photos
│   │   ├── reviews/          # Companion reviews & rating calculations
│   │   ├── safety/           # Emergency SOS, trusted contacts & incident reports
│   │   ├── session/          # Active session check-in, passcode & session pass
│   │   ├── support/          # Help center tickets & thread messages
│   │   ├── uploads/          # Multipart file upload service
│   │   └── wallet/           # Balance ledger, payment instruments & transactions
│   ├── app.module.ts         # Main root module wiring all 16 sub-modules
│   └── main.ts               # App entrypoint with Swagger, CORS & Helmet
├── prisma.config.ts          # Prisma 7 CLI configuration
├── .env                      # Local environment configuration
├── .env.example              # Environment variables template
├── package.json
└── README.md
```

---

## ⚙️ Environment Configuration (`.env`)

Create a `.env` file in the root directory:

```env
PORT=4002
NODE_ENV=development

# PostgreSQL Connection String
DATABASE_URL=postgresql://cobuddy:cobuddy_secret@localhost:5432/cobuddy_customer?schema=public

# JWT Credentials
JWT_SECRET=cobuddy-customer-super-secret-jwt-key-2026
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=cobuddy-customer-super-secret-refresh-key-2026
JWT_REFRESH_EXPIRES_IN=30d

# Development OTP Bypass
OTP_DEV_BYPASS=123456
OTP_EXPIRES_IN_MINUTES=10
OTP_MAX_ATTEMPTS=5

# Razorpay Payment Credentials
RAZORPAY_KEY_ID=rzp_test_TLCpKIamWxQBYy
RAZORPAY_KEY_SECRET=w2l3tVjYk6aH4zM9xQ8pL7nR
RAZORPAY_WEBHOOK_SECRET=cobuddy_webhook_secret_key_2026

# CORS
CORS_ORIGIN=*
```

---

## 🏃 Quick Start Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Generate Prisma Client
```bash
npx prisma generate
```

### 3. Push Database Schema
```bash
npx prisma db push
```

### 4. Start Development Server
```bash
npm run start:dev
```

The application will launch on `http://localhost:4002`.

- **Swagger Documentation**: `http://localhost:4002/api/docs`
- **Health Check**: `http://localhost:4002/api/v1/auth/me`

---

## 📜 API Documentation & Verification

Interactive OpenAPI 3.0 documentation is automatically generated by Swagger at `/api/docs`.

### Verification Status:
- `npx prisma validate` → **PASS 🚀**
- `npx prisma db push` → **PASS 🚀 (Database Synced)**
- `npm run build` → **PASS 🚀 (0 Compiler Errors)**
- `npm run start:dev` → **PASS 🚀 (Server Running & Port 4002 Listening)**

---

## 🗄️ Database Models (Prisma)

1. `Customer` — Main customer account table
2. `CustomerRefreshToken` — JWT refresh tokens
3. `CustomerOtp` — 6-digit OTP verification records
4. `CustomerKyc` — Identity & liveness verification
5. `CustomerSetting` — Privacy, notifications, and app lock preferences
6. `CustomerTrustedContact` — Emergency SOS contact list
7. `CustomerFavorite` — Favorite companion profiles
8. `CustomerBooking` — Booking lifecycle & pricing breakdown
9. `CustomerSession` — Active session check-in & passcode
10. `CustomerWallet` — Ledger balance & escrow tracking
11. `CustomerTransaction` — Financial transactions ledger
12. `CustomerPaymentMethod` — Saved UPI handles & card references
13. `CustomerRazorpayOrder` — Razorpay payment order references
14. `CustomerConversation` — Chat thread headers (Companion & Concierge)
15. `CustomerMessage` — Individual chat messages
16. `CustomerNotification` — In-app notifications inbox
17. `CustomerSOS` — Emergency SOS events
18. `CustomerIncident` — Incident reports & evidence
19. `CustomerSupportTicket` — Help support tickets
20. `CustomerSupportMessage` — Support thread replies
21. `CustomerReview` — Companion reviews & ratings
22. `CustomerBlock` — Blocked companion relationships

---

## 🔒 Security Practices

- **Passwordless Auth**: Phone + 6-digit OTP verification with attempt limits and expiry.
- **JWT Protection**: Short-lived 15-minute Access Tokens + 30-day Refresh Tokens stored in DB.
- **Server-Side Pricing**: Booking amounts and fees are calculated on the server to prevent client manipulation.
- **HMAC Verification**: Razorpay signatures are verified using `crypto.createHmac('sha256')`.
- **Sensors & Sanity**: Sensitive credentials (secrets, keys) are strictly managed via environment variables.

---

## 📄 License

Copyright © 2026 CoBuddy HQ. All rights reserved.
