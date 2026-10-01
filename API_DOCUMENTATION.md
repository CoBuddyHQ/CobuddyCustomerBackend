# CoBuddy Customer Backend — Live Production API Reference

**Base URL**: `https://cobuddy-customer-api-avinash-gshhhhfbdrf2dab4.indiasouthcentral-01.azurewebsites.net`  
**Global Prefix**: `/api/v1` *(Health check exempt: `/health`)*  
**Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

---

## 🟢 1. Health Probe
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | Check app & PostgreSQL status | None |

---

## 🔑 2. Authentication (`/api/v1/auth`)
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/send-otp` | Public | Send OTP to mobile | `{ "phone": "+919876543210" }` |
| `POST` | `/api/v1/auth/verify-otp` | Public | Verify OTP & get JWT tokens | `{ "phone": "+919876543210", "otp": "123456" }` |
| `POST` | `/api/v1/auth/resend-otp` | Public | Resend OTP | `{ "phone": "+919876543210" }` |
| `POST` | `/api/v1/auth/refresh` | Public | Refresh JWT access token | `{ "refreshToken": "<TOKEN>" }` |
| `POST` | `/api/v1/auth/logout` | Bearer | Logout from current device | `{ "refreshToken": "<TOKEN>" }` (optional) |
| `POST` | `/api/v1/auth/logout-all` | Bearer | Logout from all devices | None |
| `GET` | `/api/v1/auth/me` | Bearer | Get current user info | None |

---

## 👤 3. Customer Profile (`/api/v1/profile`)
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/profile` | Bearer | Get full customer profile | None |
| `PATCH` | `/api/v1/profile` | Bearer | Update profile info | `{ "name": "Name", "email": "a@b.com", ... }` |
| `POST` | `/api/v1/profile/legal-consent` | Bearer | Submit safety & legal consent | `{ "agreed": true }` |
| `GET` | `/api/v1/profile/onboarding-progress` | Bearer | Get onboarding steps status | None |
| `POST` | `/api/v1/profile/complete-onboarding` | Bearer | Mark onboarding complete | `{}` |
| `GET` | `/api/v1/profile/completion` | Bearer | Profile completion percentage | None |
| `POST` | `/api/v1/profile/photo` | Bearer | Upload avatar photo | `multipart/form-data` (`file`) |
| `DELETE` | `/api/v1/profile/photo` | Bearer | Delete avatar photo | None |
| `PATCH` | `/api/v1/profile/location` | Bearer | Update location coordinates | `{ "lat": 19.07, "lng": 72.87, "city": "Mumbai" }` |
| `POST` | `/api/v1/profile/location/skip` | Bearer | Skip location step | None |
| `PATCH` | `/api/v1/profile/interests` | Bearer | Update user interest tags | `{ "interests": ["INT-1", "INT-3"] }` |

---

## 🔍 4. Discovery & Companions (`/api/v1/discovery`)
| Method | Endpoint | Auth | Description | Query / Body |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/discovery/home` | Optional | Aggregated home screen data | None |
| `GET` | `/api/v1/discovery/companions` | Public | Search & filter companions | `?search=rahul&gender=Male&page=1&limit=10` |
| `GET` | `/api/v1/discovery/featured` | Public | Featured top-rated companions | None |
| `GET` | `/api/v1/discovery/companions/:id` | Public | Companion full detail profile | None |
| `GET` | `/api/v1/discovery/favorites` | Bearer | My saved favorite companions | None |
| `POST` | `/api/v1/discovery/favorites/:companionId` | Bearer | Add companion to favorites | None |
| `DELETE` | `/api/v1/discovery/favorites/:companionId` | Bearer | Remove companion from favorites | None |
| `GET` | `/api/v1/discovery/interests` | Public | List available interest tags | None |
| `GET` | `/api/v1/discovery/activities` | Public | Available activities & rates | None |

---

## 📅 5. Bookings (`/api/v1/bookings`)
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/bookings` | Bearer | Create a new booking request | `{ "companionId": "...", "activityId": "...", "startTime": "...", "hours": 2, "locationName": "..." }` |
| `GET` | `/api/v1/bookings` | Bearer | List my bookings | `?filter=pending` / `accepted` / `history` |
| `GET` | `/api/v1/bookings/:id` | Bearer | Get booking detail | None |
| `PATCH` | `/api/v1/bookings/:id/cancel` | Bearer | Cancel booking | `{ "reason": "changed_mind" }` |
| `PATCH` | `/api/v1/bookings/:id/modify` | Bearer | Modify pending booking | `{ "hours": 3, "locationName": "..." }` |
| `PATCH` | `/api/v1/bookings/:id/counter-offer` | Bearer | Accept/decline counter offer | `{ "action": "ACCEPT" }` |
| `POST` | `/api/v1/bookings/:id/dispute` | Bearer | File dispute for booking | `{ "reason": "no_show", "description": "..." }` |

---

## ⏱️ 6. Sessions (`/api/v1/sessions`)
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/sessions/current` | Bearer | Get active live session | None |
| `GET` | `/api/v1/sessions/history` | Bearer | Get session history | None |
| `POST` | `/api/v1/sessions/check-in` | Bearer | Start session check-in | `{ "bookingId": "..." }` |
| `GET` | `/api/v1/sessions/:id/pass` | Bearer | Get digital session pass | None |
| `PATCH` | `/api/v1/sessions/:id/extend` | Bearer | Extend session duration | `{ "extraMinutes": 30 }` |
| `PATCH` | `/api/v1/sessions/:id/end` | Bearer | End session | `{ "tip": 100 }` (optional) |
| `POST` | `/api/v1/sessions/:id/tip` | Bearer | Submit companion tip | `{ "amount": 200, "paymentMethod": "wallet" }` |
| `POST` | `/api/v1/sessions/:id/feedback` | Bearer | Post-session sentiment tags | `{ "sentiment": "up", "tags": ["punctual", "dressed_well"] }` |

---

## 💳 7. Payments (`/api/v1/payments`)
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/payments/create-order` | Bearer | Create Razorpay order | `{ "bookingId": "..." }` |
| `POST` | `/api/v1/payments/verify` | Bearer | Verify Razorpay payment | `{ "razorpay_order_id": "...", "razorpay_payment_id": "...", "razorpay_signature": "..." }` |
| `GET` | `/api/v1/payments/order/:orderId` | Bearer | Check Razorpay order status | None |
| `POST` | `/api/v1/payments/add-money/create-order` | Bearer | Top up wallet Razorpay order | `{ "amount": 500, "description": "Wallet topup" }` |
| `POST` | `/api/v1/payments/add-money/verify` | Bearer | Verify wallet top-up payment | `{ "razorpay_order_id": "...", ... }` |
| `POST` | `/api/v1/payments/webhook` | Public | Razorpay Webhook listener | Webhook payload |

---

## 💰 8. Wallet (`/api/v1/wallet`)
| Method | Endpoint | Auth | Description | Request Body / Query |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/wallet/balance` | Bearer | Get wallet balance & stats | None |
| `GET` | `/api/v1/wallet/transactions` | Bearer | Get wallet transaction history | `?page=1&limit=20` |
| `GET` | `/api/v1/wallet/transactions/:id` | Bearer | Transaction details | None |
| `GET` | `/api/v1/wallet/payment-methods` | Bearer | Get saved payment methods | None |
| `POST` | `/api/v1/wallet/payment-methods` | Bearer | Save new payment method | `{ "type": "upi", "vpa": "user@upi" }` |
| `DELETE` | `/api/v1/wallet/payment-methods/:id` | Bearer | Delete saved payment method | None |
| `GET` | `/api/v1/wallet/bank-accounts` | Bearer | Get saved bank accounts | None |
| `POST` | `/api/v1/wallet/bank-accounts` | Bearer | Save bank account for payout | `{ "accName": "Name", "accNumber": "123456", "ifsc": "SBIN0001234" }` |
| `DELETE` | `/api/v1/wallet/bank-accounts/:id` | Bearer | Delete bank account | None |
| `POST` | `/api/v1/wallet/withdraw` | Bearer | Withdraw wallet money | `{ "amount": 1000, "methodId": "..." }` |

---

## 🛡️ 9. Safety & SOS (`/api/v1/safety`)
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/safety/sos/trigger` | Bearer | Trigger emergency SOS alert | `{ "sessionId": "...", "lat": 19.07, "lng": 72.87 }` |
| `PATCH` | `/api/v1/safety/sos/:id/resolve` | Bearer | Resolve SOS alert | None |
| `GET` | `/api/v1/safety/sos/history` | Bearer | SOS alert history | None |
| `GET` | `/api/v1/safety/trusted-contacts` | Bearer | List trusted contacts | None |
| `POST` | `/api/v1/safety/trusted-contacts` | Bearer | Add trusted contact | `{ "name": "Dad", "phone": "+919800000000", "relationship": "Parent" }` |
| `PATCH` | `/api/v1/safety/trusted-contacts/:id` | Bearer | Update trusted contact | `{ "phone": "+919811111111" }` |
| `DELETE` | `/api/v1/safety/trusted-contacts/:id` | Bearer | Delete trusted contact | None |
| `POST` | `/api/v1/safety/incidents` | Bearer | Submit safety incident report | `{ "description": "...", "evidenceUrls": [] }` |
| `GET` | `/api/v1/safety/incidents` | Bearer | List submitted incident reports | None |

---

## 🆔 10. KYC Verification (`/api/v1/kyc`)
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/kyc/status` | Bearer | Get KYC verification status | None |
| `POST` | `/api/v1/kyc/document` | Bearer | Submit document info & files | `multipart/form-data` (`frontDoc`, `backDoc`) |
| `POST` | `/api/v1/kyc/selfie` | Bearer | Upload selfie image | `multipart/form-data` (`file`) |
| `POST` | `/api/v1/kyc/liveness` | Bearer | Upload liveness check video | `multipart/form-data` (`file`) |
| `POST` | `/api/v1/kyc/resubmit` | Bearer | Request KYC resubmission | None |

---

## 💬 11. Chat (`/api/v1/chat`)
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/chat/conversations` | Bearer | List active conversations | None |
| `POST` | `/api/v1/chat/conversations/companion` | Bearer | Start companion chat | `{ "companionId": "...", "bookingId": "..." }` |
| `POST` | `/api/v1/chat/conversations/concierge` | Bearer | Start concierge support chat | None |
| `GET` | `/api/v1/chat/conversations/:id/messages` | Bearer | Get message history | `?page=1&limit=50` |
| `POST` | `/api/v1/chat/conversations/:id/messages` | Bearer | Send chat message | `{ "text": "Hello!", "attachmentUrl": "..." }` |
| `PATCH` | `/api/v1/chat/conversations/:id/read` | Bearer | Mark conversation as read | None |

---

## 🔔 12. Notifications (`/api/v1/notifications`)
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/notifications` | Bearer | List customer notifications | None |
| `PATCH` | `/api/v1/notifications/:id/read` | Bearer | Mark single notification read | None |
| `PATCH` | `/api/v1/notifications/read-all` | Bearer | Mark all notifications read | None |
| `DELETE` | `/api/v1/notifications/:id` | Bearer | Delete notification | None |
| `POST` | `/api/v1/notifications/device-token` | Bearer | Save FCM push token | `{ "fcmToken": "..." }` |
| `POST` | `/api/v1/notifications/permission` | Bearer | Update push permission | `{ "enabled": true, "fcmToken": "..." }` |
| `POST` | `/api/v1/notifications/skip` | Bearer | Skip notification step | None |

---

## ⭐ 13. Reviews (`/api/v1/reviews`)
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/reviews` | Bearer | Submit rating & review | `{ "bookingId": "...", "rating": 5, "comment": "Great!", "tags": ["punctual"] }` |
| `GET` | `/api/v1/reviews/my` | Bearer | List reviews written by me | None |
| `GET` | `/api/v1/reviews/companion/:companionId` | Public | Get public reviews for companion | None |

---

## 🎧 14. Support & FAQs (`/api/v1/support`)
| Method | Endpoint | Auth | Description | Request Body / Query |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/support/tickets` | Bearer | List my support tickets | None |
| `POST` | `/api/v1/support/tickets` | Bearer | Create support ticket | `{ "subject": "Issue", "category": "payment", "message": "..." }` |
| `GET` | `/api/v1/support/tickets/:id` | Bearer | Ticket details & replies | None |
| `POST` | `/api/v1/support/tickets/:id/reply` | Bearer | Send reply in ticket thread | `{ "text": "Here is more info..." }` |
| `GET` | `/api/v1/support/categories` | Public | Help center categories | None |
| `GET` | `/api/v1/support/faqs` | Public | FAQ list with search | `?search=refund&categoryId=1` |

---

## ⚙️ 15. Account Settings (`/api/v1/account`)
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/account/settings` | Bearer | Get account settings | None |
| `PATCH` | `/api/v1/account/settings` | Bearer | Update settings | `{ "privacyMode": true }` |
| `GET` | `/api/v1/account/sessions` | Bearer | List logged-in devices | None |
| `DELETE` | `/api/v1/account/sessions/:id` | Bearer | Revoke active device session | None |
| `GET` | `/api/v1/account/blocked` | Bearer | List blocked users | None |
| `POST` | `/api/v1/account/block/:id` | Bearer | Block user | None |
| `DELETE` | `/api/v1/account/unblock/:id` | Bearer | Unblock user | None |
| `POST` | `/api/v1/account/deactivate` | Bearer | Deactivate my account | None |
| `DELETE` | `/api/v1/account/delete` | Bearer | Permanently delete account | None |
| `GET` | `/api/v1/account/notification-preferences` | Bearer | Get notification preferences | None |
| `PATCH` | `/api/v1/account/notification-preferences` | Bearer | Update preferences | `{ "push": true, "email": false }` |
| `GET` | `/api/v1/account/languages` | Bearer | Get app languages | None |
| `PATCH` | `/api/v1/account/languages` | Bearer | Update language | `{ "appLanguage": "hi", "spokenLanguages": ["en", "hi"] }` |
| `POST` | `/api/v1/account/reactivate-request` | Public | Request account reactivation | `{ "phone": "+91...", "reason": "..." }` |
| `POST` | `/api/v1/account/change-mobile/request-otp` | Bearer | Request mobile change OTPs | `{ "oldPhone": "...", "newPhone": "..." }` |
| `POST` | `/api/v1/account/change-mobile/verify` | Bearer | Verify mobile change | `{ "oldPhone": "...", "newPhone": "...", "oldOtp": "...", "newOtp": "..." }` |

---

## 🌐 16. System & Config (`/api/v1/system`)
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/system/config` | Public | Remote app config, legal URLs | None |
| `GET` | `/api/v1/system/master-data` | Public | System master data & tiers | None |
| `GET` | `/api/v1/system/status` | Public | Service uptime status | None |

---

## 📁 17. File Uploads (`/api/v1/uploads`)
| Method | Endpoint | Auth | Description | Request Body |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/uploads` | Bearer | Upload file (magic-byte verified) | `multipart/form-data` (`file`) |
| `GET` | `/api/v1/uploads/private/:filename` | Bearer | Stream private file | None |
