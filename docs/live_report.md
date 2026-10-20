# ParcelPath Live Server Report

End-to-end test run against the production deployment on Vercel, using the production environment: Neon PostgreSQL, Upstash Redis, Stripe sandbox with a registered webhook endpoint, and Cloudinary.

| Item | Value |
| --- | --- |
| Live API | https://parcel-path-api.vercel.app |
| Base path | `/api/v1` |
| Date | 20 October 2026 |
| Hosting | Vercel (Express zero-config, Node.js 24, region iad1) |
| Database | Neon PostgreSQL |
| Cache | Upstash Redis |
| Payments | Stripe sandbox, webhook endpoint `https://parcel-path-api.vercel.app/api/v1/payments/webhook` |
| File storage | Cloudinary |
| Result | **148 / 148 passed** (121 HTTP requests, 27 data assertions) |
| Endpoints covered | 36 of 36 API endpoints plus the root health route |
| Response time | Median 1149 ms, p95 3786 ms, max 5635 ms, measured from Bangladesh to the Vercel US East region |

## Verdict

The live server is working correctly. Every endpoint returned the expected status code and the required response format, all three roles are enforced, and the real integrations (database, Redis, Stripe payments and webhooks, Cloudinary uploads) work in production.

## Summary

| Area | Tests | Passed |
| --- | --- | --- |
| Health & Routing | 2 | 2 |
| Authentication | 19 | 19 |
| User Profile | 8 | 8 |
| Hubs | 13 | 13 |
| Shipments | 56 | 56 |
| Payments | 30 | 30 |
| Admin | 17 | 17 |
| Security | 3 | 3 |
| **Total** | **148** | **148** |

A test passes only when the status code is correct **and** the body matches the required format: `{ success: true, message, data }` on success or `{ success: false, message, errors: [] }` on error.

## Production Integration Checks

| Integration | How it was verified | Result |
| --- | --- | --- |
| Neon PostgreSQL | Registration, login, CRUD, transactions and audit logs on the live database | ✅ |
| Upstash Redis | Hub list and dashboard are cached; in a manual check the same hub request dropped from 2053 ms to 712 ms on the second call | ✅ |
| Stripe Checkout | Two sandbox card payments (test card 4242 4242 4242 4242), redirect returned to the live `/payments/success` | ✅ |
| Stripe webhook | A checkout session was expired directly on Stripe; Stripe sent `checkout.session.expired` to the live webhook, the signature was verified with the production secret and the payment became `EXPIRED` | ✅ |
| Stripe refund | Paid shipment cancelled by the customer, payment `REFUNDED` through Stripe | ✅ |
| Cloudinary | Avatar and proof-of-delivery photo uploaded from the Vercel function | ✅ |
| `APP_URL` | Stripe success and cancel URLs point to `https://parcel-path-api.vercel.app` | ✅ |
| Security headers | `RateLimit-Policy`, Helmet headers and CORS present on live responses | ✅ |

## Payment Flow on the Live Server

| Step | Result |
| --- | --- |
| `POST /payments/initiate` for shipment A | Stripe Checkout session created for BDT 220 |
| Card payment on Stripe Checkout | Redirected to `https://parcel-path-api.vercel.app/api/v1/payments/success`, payment `PAID` |
| Repeated success redirect | Same `paidAt`, payment fulfilled only once |
| Shipment B paid, then cancelled | Shipment `CANCELLED`, payment `REFUNDED` |
| Session C expired on Stripe | Webhook delivered, payment `EXPIRED` |
| Shipment D checkout cancelled | Session expired by the cancel redirect, payment `CANCELLED` |

## Shipment Timeline on the Live Server

```text
PENDING > PENDING (paid) > COURIER_ASSIGNED > PICKED_UP > AT_ORIGIN_HUB > IN_TRANSIT
> AT_DESTINATION_HUB > OUT_FOR_DELIVERY > FAILED_DELIVERY > OUT_FOR_DELIVERY > DELIVERED
```

## Deployment Fixes Made Before This Run

| Problem on Vercel | Fix |
| --- | --- |
| Build failed with `prisma: command not found` | Build command runs `npm run db:generate` so the local Prisma CLI is on the PATH |
| Node.js version warning for `>=20` | `engines.node` pinned to `24.x` |
| `TS2688: Cannot find type definition file for 'node'` | Vercel compiles with a temporary tsconfig that extends the project one, so `typeRoots` is now set explicitly to `./node_modules/@types` |

## Not Covered Automatically

- **Successful Google sign-in:** needs a real Google ID token from a signed-in account. Rejection of invalid tokens was tested on the live server.
- **Rate limit blocking (`429`):** only the headers were checked, so the test client was not locked out.
- **Rate limit scope:** on Vercel each function instance keeps its own in-memory counter, so the limit applies per instance.

## Test Data

The run created test records on the live database: one customer `e2e.<run id>@example.com`, four shipments (one delivered, one cancelled and deleted, two pending) and their payments. They are useful for the demo video and can be removed later.

## Detailed Results

### Health & Routing

| # | Test | Role | Request | Expected | Actual | Time | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | API root health check | Public | `GET /` | 200 | 200 | 934 ms | ✅ | ParcelPath API is running |
| 2 | Unknown route returns 404 | Public | `GET /api/v1/does-not-exist` | 404 | 404 | 708 ms | ✅ | Route GET /api/v1/does-not-exist not found |

### Authentication

| # | Test | Role | Request | Expected | Actual | Time | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Register with invalid data | Public | `POST /api/v1/auth/register` | 400 | 400 | 514 ms | ✅ | Validation failed |
| 2 | Register new customer | Public | `POST /api/v1/auth/register` | 201 | 201 | 4659 ms | ✅ | Account registered successfully |
| 3 | Registered account is CUSTOMER with lowercased email | - | Assertion | true | true | - | ✅ | role=CUSTOMER |
| 4 | Password hash is never returned | - | Assertion | true | true | - | ✅ | user object has no password field |
| 5 | Register duplicate email | Public | `POST /api/v1/auth/register` | 409 | 409 | 866 ms | ✅ | An account with this email already exists |
| 6 | Login with wrong password | Public | `POST /api/v1/auth/login` | 401 | 401 | 970 ms | ✅ | Invalid email or password |
| 7 | Login with malformed JSON | Public | `POST /api/v1/auth/login` | 400 | 400 | 269 ms | ✅ | Malformed JSON body |
| 8 | Google login with invalid ID token | Public | `POST /api/v1/auth/google` | 401 | 401 | 320 ms | ✅ | Invalid Google ID token |
| 9 | Google login without ID token | Public | `POST /api/v1/auth/google` | 400 | 400 | 287 ms | ✅ | Validation failed |
| 10 | Login demo customer | Customer | `POST /api/v1/auth/login` | 200 | 200 | 1423 ms | ✅ | Logged in successfully |
| 11 | Login demo courier | Courier | `POST /api/v1/auth/login` | 200 | 200 | 1643 ms | ✅ | Logged in successfully |
| 12 | Login admin | Admin | `POST /api/v1/auth/login` | 200 | 200 | 1435 ms | ✅ | Logged in successfully |
| 13 | Login newly registered customer | Customer | `POST /api/v1/auth/login` | 200 | 200 | 1427 ms | ✅ | Logged in successfully |
| 14 | Refresh token rotation | Customer | `POST /api/v1/auth/refresh-token` | 200 | 200 | 976 ms | ✅ | Tokens refreshed successfully |
| 15 | Reuse of rotated refresh token is rejected | Customer | `POST /api/v1/auth/refresh-token` | 401 | 401 | 873 ms | ✅ | Refresh token is invalid or has already been used |
| 16 | Token family revoked after reuse | Customer | `POST /api/v1/auth/refresh-token` | 401 | 401 | 814 ms | ✅ | Refresh token is invalid or has already been used |
| 17 | Login again after revocation | Customer | `POST /api/v1/auth/login` | 200 | 200 | 1453 ms | ✅ | Logged in successfully |
| 18 | Logout revokes refresh token | Customer | `POST /api/v1/auth/logout` | 200 | 200 | 491 ms | ✅ | Logged out successfully |
| 19 | Refresh after logout is rejected | Customer | `POST /api/v1/auth/refresh-token` | 401 | 401 | 712 ms | ✅ | Refresh token is invalid or has already been used |

### User Profile

| # | Test | Role | Request | Expected | Actual | Time | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Profile without token | Public | `GET /api/v1/users/me` | 401 | 401 | 290 ms | ✅ | Authentication token is missing |
| 2 | Profile with invalid token | Public | `GET /api/v1/users/me` | 401 | 401 | 298 ms | ✅ | Invalid token |
| 3 | Get own profile | Customer | `GET /api/v1/users/me` | 200 | 200 | 758 ms | ✅ | Profile retrieved successfully |
| 4 | Update profile with avatar upload (Cloudinary) | Customer | `PATCH /api/v1/users/me` | 200 | 200 | 1204 ms | ✅ | Profile updated successfully |
| 5 | Avatar stored on Cloudinary | - | Assertion | true | true | - | ✅ | https://res.cloudinary.com/dqikw5lln/image/upload/v1792483072/parcelpath/avatars/vswixgndnavycxrnikom.png |
| 6 | Reject non-image upload | Customer | `PATCH /api/v1/users/me` | 400 | 400 | 503 ms | ✅ | Only JPEG, PNG or WEBP images are allowed |
| 7 | Reject empty profile update | Customer | `PATCH /api/v1/users/me` | 400 | 400 | 504 ms | ✅ | Provide at least one field to update |
| 8 | Reject invalid phone number | Customer | `PATCH /api/v1/users/me` | 400 | 400 | 536 ms | ✅ | Validation failed |

### Hubs

| # | Test | Role | Request | Expected | Actual | Time | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | List hubs with pagination and sorting | Customer | `GET /api/v1/hubs` | 200 | 200 | 2537 ms | ✅ | Hubs retrieved successfully |
| 2 | Pagination meta present | - | Assertion | true | true | - | ✅ | {"page":1,"limit":10,"total":5,"totalPages":1} |
| 3 | Search hubs by keyword | Customer | `GET /api/v1/hubs` | 200 | 200 | 1967 ms | ✅ | Hubs retrieved successfully |
| 4 | Filter hubs by city (cached repeat) | Customer | `GET /api/v1/hubs` | 200 | 200 | 1972 ms | ✅ | Hubs retrieved successfully |
| 5 | Customer cannot create hub | Customer | `POST /api/v1/hubs` | 403 | 403 | 483 ms | ✅ | You do not have permission to perform this action |
| 6 | Create hub with invalid data | Admin | `POST /api/v1/hubs` | 400 | 400 | 516 ms | ✅ | Validation failed |
| 7 | Create hub | Admin | `POST /api/v1/hubs` | 201 | 201 | 1867 ms | ✅ | Hub created successfully |
| 8 | Create hub with duplicate code | Admin | `POST /api/v1/hubs` | 409 | 409 | 1144 ms | ✅ | A record with this code already exists |
| 9 | Get hub by id | Courier | `GET /api/v1/hubs/:id` | 200 | 200 | 1149 ms | ✅ | Hub retrieved successfully |
| 10 | Get hub with invalid id | Admin | `GET /api/v1/hubs/not-a-uuid` | 400 | 400 | 517 ms | ✅ | Validation failed |
| 11 | Update hub | Admin | `PATCH /api/v1/hubs/:id` | 200 | 200 | 2093 ms | ✅ | Hub updated successfully |
| 12 | Soft delete hub | Admin | `DELETE /api/v1/hubs/:id` | 200 | 200 | 2060 ms | ✅ | Hub deleted successfully |
| 13 | Deleted hub is hidden | Admin | `GET /api/v1/hubs/:id` | 404 | 404 | 1196 ms | ✅ | Hub not found |

### Shipments

| # | Test | Role | Request | Expected | Actual | Time | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Estimate delivery charge (public) | Public | `POST /api/v1/shipments/price-estimate` | 200 | 200 | 577 ms | ✅ | Delivery charge calculated successfully |
| 2 | Inter-city fragile 2.5kg = 150 + 50 + 60 | - | Assertion | true | true | - | ✅ | total=260 |
| 3 | Courier cannot create shipment | Courier | `POST /api/v1/shipments` | 403 | 403 | 556 ms | ✅ | You do not have permission to perform this action |
| 4 | Create shipment with invalid data | Customer | `POST /api/v1/shipments` | 400 | 400 | 478 ms | ✅ | Validation failed |
| 5 | Create shipment A | Customer | `POST /api/v1/shipments` | 201 | 201 | 3373 ms | ✅ | Shipment created successfully |
| 6 | Create shipment B | Customer | `POST /api/v1/shipments` | 201 | 201 | 3337 ms | ✅ | Shipment created successfully |
| 7 | Create shipment C | Customer | `POST /api/v1/shipments` | 201 | 201 | 3340 ms | ✅ | Shipment created successfully |
| 8 | Create shipment D | Customer | `POST /api/v1/shipments` | 201 | 201 | 3345 ms | ✅ | Shipment created successfully |
| 9 | Tracking number format PPyymmddXXXXXX | - | Assertion | true | true | - | ✅ | PP2610203G2QQX |
| 10 | Hub with active shipments cannot be deleted | Admin | `DELETE /api/v1/hubs/:id` | 409 | 409 | 956 ms | ✅ | Hub has 5 active shipment(s) and cannot be deleted |
| 11 | List shipments with filter, sort and pagination | Customer | `GET /api/v1/shipments` | 200 | 200 | 2650 ms | ✅ | Shipments retrieved successfully |
| 12 | Invalid filter value rejected | Customer | `GET /api/v1/shipments` | 400 | 400 | 953 ms | ✅ | Validation failed |
| 13 | Search shipments | Customer | `GET /api/v1/shipments/search` | 200 | 200 | 2655 ms | ✅ | Search results retrieved successfully |
| 14 | Search term too short | Customer | `GET /api/v1/shipments/search` | 400 | 400 | 686 ms | ✅ | Validation failed |
| 15 | Public tracking by tracking number | Public | `GET /api/v1/shipments/track/:trackingNumber` | 200 | 200 | 2768 ms | ✅ | Shipment tracking retrieved successfully |
| 16 | Invalid tracking number | Public | `GET /api/v1/shipments/track/ABC` | 400 | 400 | 270 ms | ✅ | Validation failed |
| 17 | Get own shipment details | Customer | `GET /api/v1/shipments/:id` | 200 | 200 | 2461 ms | ✅ | Shipment retrieved successfully |
| 18 | Other customer cannot see shipment | Customer | `GET /api/v1/shipments/:id` | 404 | 404 | 1182 ms | ✅ | Shipment not found |
| 19 | Courier cannot see unassigned shipment | Courier | `GET /api/v1/shipments/:id` | 404 | 404 | 1225 ms | ✅ | Shipment not found |
| 20 | Update unpaid shipment recalculates price | Customer | `PATCH /api/v1/shipments/:id` | 200 | 200 | 3779 ms | ✅ | Shipment updated successfully |
| 21 | Price recalculated to 150 + 50 + 20 | - | Assertion | true | true | - | ✅ | price=220 |
| 22 | Courier cannot be assigned before payment | Admin | `POST /api/v1/shipments/:id/assign` | 409 | 409 | 735 ms | ✅ | Shipment must be paid before a courier is assigned |
| 23 | Paid shipment cannot be edited | Customer | `PATCH /api/v1/shipments/:id` | 409 | 409 | 704 ms | ✅ | Shipment can only be edited before payment |
| 24 | Paid shipment must be cancelled before delete | Customer | `DELETE /api/v1/shipments/:id` | 409 | 409 | 695 ms | ✅ | Paid shipment must be cancelled before it can be deleted |
| 25 | Cancel paid shipment B with Stripe refund | Customer | `POST /api/v1/shipments/:id/cancel` | 200 | 200 | 5187 ms | ✅ | Shipment cancelled successfully |
| 26 | Shipment B is CANCELLED | - | Assertion | true | true | - | ✅ | CANCELLED |
| 27 | Payment B after cancellation | Customer | `GET /api/v1/payments/:id` | 200 | 200 | 976 ms | ✅ | Payment retrieved successfully |
| 28 | Payment B is REFUNDED | - | Assertion | true | true | - | ✅ | REFUNDED |
| 29 | Soft delete cancelled shipment B | Customer | `DELETE /api/v1/shipments/:id` | 200 | 200 | 2102 ms | ✅ | Shipment deleted successfully |
| 30 | Deleted shipment is hidden | Customer | `GET /api/v1/shipments/:id` | 404 | 404 | 2462 ms | ✅ | Shipment not found |
| 31 | Customer cannot assign courier | Customer | `POST /api/v1/shipments/:id/assign` | 403 | 403 | 503 ms | ✅ | You do not have permission to perform this action |
| 32 | Assign a non-courier user | Admin | `POST /api/v1/shipments/:id/assign` | 400 | 400 | 956 ms | ✅ | Courier not found or not active |
| 33 | Assign courier to paid shipment | Admin | `POST /api/v1/shipments/:id/assign` | 200 | 200 | 3812 ms | ✅ | Courier assigned successfully |
| 34 | Status moved to COURIER_ASSIGNED | - | Assertion | true | true | - | ✅ | COURIER_ASSIGNED |
| 35 | Courier sees assigned shipments | Courier | `GET /api/v1/shipments/my-assigned` | 200 | 200 | 2513 ms | ✅ | Assigned shipments retrieved successfully |
| 36 | Assigned shipment appears in courier list | - | Assertion | true | true | - | ✅ | count=1 |
| 37 | Customer cannot open courier list | Customer | `GET /api/v1/shipments/my-assigned` | 403 | 403 | 539 ms | ✅ | You do not have permission to perform this action |
| 38 | Admin cannot mark PICKED_UP | Admin | `PATCH /api/v1/shipments/:id/status` | 403 | 403 | 752 ms | ✅ | Only COURIER can mark a shipment PICKED_UP |
| 39 | Cannot skip to DELIVERED | Courier | `PATCH /api/v1/shipments/:id/status` | 409 | 409 | 731 ms | ✅ | Cannot change status from COURIER_ASSIGNED to DELIVERED |
| 40 | Courier marks PICKED_UP | Courier | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | 3568 ms | ✅ | Shipment status updated successfully |
| 41 | Cannot cancel after pickup | Customer | `POST /api/v1/shipments/:id/cancel` | 409 | 409 | 714 ms | ✅ | Shipment cannot be cancelled once it is PICKED_UP |
| 42 | Courier drops at origin hub | Courier | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | 3574 ms | ✅ | Shipment status updated successfully |
| 43 | Courier cannot mark IN_TRANSIT | Courier | `PATCH /api/v1/shipments/:id/status` | 403 | 403 | 753 ms | ✅ | Only ADMIN can mark a shipment IN_TRANSIT |
| 44 | Admin marks IN_TRANSIT | Admin | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | 3786 ms | ✅ | Shipment status updated successfully |
| 45 | Admin marks AT_DESTINATION_HUB | Admin | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | 3677 ms | ✅ | Shipment status updated successfully |
| 46 | Courier marks OUT_FOR_DELIVERY | Courier | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | 3677 ms | ✅ | Shipment status updated successfully |
| 47 | Failed delivery requires reason | Courier | `PATCH /api/v1/shipments/:id/status` | 400 | 400 | 521 ms | ✅ | Validation failed |
| 48 | Courier marks FAILED_DELIVERY | Courier | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | 3874 ms | ✅ | Shipment status updated successfully |
| 49 | Courier retries OUT_FOR_DELIVERY | Courier | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | 3683 ms | ✅ | Shipment status updated successfully |
| 50 | DELIVERED requires proof image | Courier | `PATCH /api/v1/shipments/:id/status` | 400 | 400 | 742 ms | ✅ | Proof of delivery image is required |
| 51 | Courier marks DELIVERED with proof photo | Courier | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | 4352 ms | ✅ | Shipment status updated successfully |
| 52 | Proof of delivery stored on Cloudinary | - | Assertion | true | true | - | ✅ | https://res.cloudinary.com/dqikw5lln/image/upload/v1792483306/parcelpath/proof-of-delivery/qukstafvxgto3shxodtk.png |
| 53 | Delivered shipment is final | Courier | `PATCH /api/v1/shipments/:id/status` | 409 | 409 | 885 ms | ✅ | Cannot change status from DELIVERED to OUT_FOR_DELIVERY |
| 54 | Public tracking shows full timeline | Public | `GET /api/v1/shipments/track/:trackingNumber` | 200 | 200 | 2750 ms | ✅ | Shipment tracking retrieved successfully |
| 55 | Timeline contains every step | - | Assertion | true | true | - | ✅ | PENDING > PENDING > COURIER_ASSIGNED > PICKED_UP > AT_ORIGIN_HUB > IN_TRANSIT > AT_DESTINATION_HUB > OUT_FOR_DELIVERY > FAILED_DELIVERY > OUT_FOR_DELIVERY > DELIVERED |
| 56 | Public tracking hides personal data | - | Assertion | true | true | - | ✅ | no phone or customer fields |

### Payments

| # | Test | Role | Request | Expected | Actual | Time | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Admin cannot initiate customer payment | Admin | `POST /api/v1/payments/initiate` | 403 | 403 | 5635 ms | ✅ | You do not have permission to perform this action |
| 2 | Initiate payment for someone else's shipment | Customer | `POST /api/v1/payments/initiate` | 404 | 404 | 2396 ms | ✅ | Shipment not found |
| 3 | Initiate Stripe checkout for shipment A | Customer | `POST /api/v1/payments/initiate` | 201 | 201 | 1893 ms | ✅ | Checkout session created successfully |
| 4 | Checkout amount matches shipment price (BDT) | - | Assertion | true | true | - | ✅ | 220 bdt |
| 5 | Re-initiate reuses the open session | Customer | `POST /api/v1/payments/initiate` | 201 | 201 | 1421 ms | ✅ | Checkout session created successfully |
| 6 | Same Stripe session returned | - | Assertion | true | true | - | ✅ | no duplicate checkout session |
| 7 | Initiate Stripe checkout for shipment B | Customer | `POST /api/v1/payments/initiate` | 201 | 201 | 1925 ms | ✅ | Checkout session created successfully |
| 8 | Initiate Stripe checkout for shipment C | Customer | `POST /api/v1/payments/initiate` | 201 | 201 | 1775 ms | ✅ | Checkout session created successfully |
| 9 | Initiate Stripe checkout for shipment D | Customer | `POST /api/v1/payments/initiate` | 201 | 201 | 1841 ms | ✅ | Checkout session created successfully |
| 10 | Success redirect with invalid session id | Public | `GET /api/v1/payments/success` | 400 | 400 | 368 ms | ✅ | Validation failed |
| 11 | Success redirect before paying | Public | `GET /api/v1/payments/success` | 200 | 200 | 1169 ms | ✅ | Payment is still processing |
| 12 | Unpaid session stays PENDING | - | Assertion | true | true | - | ✅ | PENDING |
| 13 | Webhook without signature | Stripe | `POST /api/v1/payments/webhook` | 400 | 400 | 507 ms | ✅ | Missing Stripe signature header |
| 14 | Webhook with forged signature | Stripe | `POST /api/v1/payments/webhook` | 400 | 400 | 450 ms | ✅ | Invalid Stripe webhook signature |
| 15 | Success redirect verifies paid session A | Public | `GET /api/v1/payments/success` | 200 | 200 | 2099 ms | ✅ | Payment verified successfully |
| 16 | Payment A is PAID and shipment marked paid | - | Assertion | true | true | - | ✅ | PAID paidAt=2026-10-20T07:59:46.033Z |
| 17 | Repeated verification is idempotent | Public | `GET /api/v1/payments/success` | 200 | 200 | 1966 ms | ✅ | Payment verified successfully |
| 18 | Repeat does not change paidAt | - | Assertion | true | true | - | ✅ | single fulfillment |
| 19 | Get payment B after checkout | Customer | `GET /api/v1/payments/:id` | 200 | 200 | 1045 ms | ✅ | Payment retrieved successfully |
| 20 | Payment B is PAID | - | Assertion | true | true | - | ✅ | PAID |
| 21 | Initiate payment for already paid shipment | Customer | `POST /api/v1/payments/initiate` | 409 | 409 | 2243 ms | ✅ | Shipment has already been paid |
| 22 | Stripe webhook reached the server (session C expired on Stripe, payment updated to EXPIRED) | - | Assertion | true | true | - | ✅ | payment C status=EXPIRED |
| 23 | Cancel redirect expires session D | Public | `GET /api/v1/payments/cancel` | 200 | 200 | 1571 ms | ✅ | Checkout cancellation handled |
| 24 | Payment D is CANCELLED | - | Assertion | true | true | - | ✅ | CANCELLED |
| 25 | Cancel redirect with invalid payment id | Public | `GET /api/v1/payments/cancel` | 400 | 400 | 373 ms | ✅ | Validation failed |
| 26 | My payments with status filter | Customer | `GET /api/v1/payments/my` | 200 | 200 | 1590 ms | ✅ | Payments retrieved successfully |
| 27 | Get payment by id (owner) | Customer | `GET /api/v1/payments/:id` | 200 | 200 | 930 ms | ✅ | Payment retrieved successfully |
| 28 | Get payment by id (admin) | Admin | `GET /api/v1/payments/:id` | 200 | 200 | 919 ms | ✅ | Payment retrieved successfully |
| 29 | Other customer cannot see payment | Customer | `GET /api/v1/payments/:id` | 404 | 404 | 948 ms | ✅ | Payment not found |
| 30 | Courier cannot list customer payments | Courier | `GET /api/v1/payments/my` | 403 | 403 | 485 ms | ✅ | You do not have permission to perform this action |

### Admin

| # | Test | Role | Request | Expected | Actual | Time | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Customer cannot list users | Customer | `GET /api/v1/admin/users` | 403 | 403 | 543 ms | ✅ | You do not have permission to perform this action |
| 2 | Courier cannot read dashboard | Courier | `GET /api/v1/admin/dashboard-stats` | 403 | 403 | 507 ms | ✅ | You do not have permission to perform this action |
| 3 | List users with filters and search | Admin | `GET /api/v1/admin/users` | 200 | 200 | 1409 ms | ✅ | Users retrieved successfully |
| 4 | Admin cannot change own role | Admin | `PATCH /api/v1/admin/users/:id/role` | 400 | 400 | 601 ms | ✅ | You cannot change your own account from the admin panel |
| 5 | Invalid role rejected | Admin | `PATCH /api/v1/admin/users/:id/role` | 400 | 400 | 574 ms | ✅ | Validation failed |
| 6 | Promote customer to courier | Admin | `PATCH /api/v1/admin/users/:id/role` | 200 | 200 | 1678 ms | ✅ | User role updated successfully |
| 7 | Same role again is a conflict | Admin | `PATCH /api/v1/admin/users/:id/role` | 409 | 409 | 818 ms | ✅ | User already has the COURIER role |
| 8 | Block user | Admin | `PATCH /api/v1/admin/users/:id/status` | 200 | 200 | 1840 ms | ✅ | User status updated successfully |
| 9 | Blocked user cannot log in | Courier | `POST /api/v1/auth/login` | 403 | 403 | 967 ms | ✅ | Your account has been blocked |
| 10 | Blocked user's existing token is rejected | Courier | `GET /api/v1/users/me` | 403 | 403 | 491 ms | ✅ | Your account has been blocked |
| 11 | Unblock user | Admin | `PATCH /api/v1/admin/users/:id/status` | 200 | 200 | 1626 ms | ✅ | User status updated successfully |
| 12 | Demote back to customer | Admin | `PATCH /api/v1/admin/users/:id/role` | 200 | 200 | 1841 ms | ✅ | User role updated successfully |
| 13 | Dashboard statistics | Admin | `GET /api/v1/admin/dashboard-stats` | 200 | 200 | 2621 ms | ✅ | Dashboard statistics retrieved successfully |
| 14 | Revenue counts paid payments | - | Assertion | true | true | - | ✅ | revenue=440 BDT |
| 15 | Audit logs filtered by action | Admin | `GET /api/v1/admin/audit-logs` | 200 | 200 | 1641 ms | ✅ | Audit logs retrieved successfully |
| 16 | Status changes are audited | - | Assertion | true | true | - | ✅ | entries=16 |
| 17 | Audit logs for payment events | Admin | `GET /api/v1/admin/audit-logs` | 200 | 200 | 1651 ms | ✅ | Audit logs retrieved successfully |

### Security

| # | Test | Role | Request | Expected | Actual | Time | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Rate limit headers are sent | - | Assertion | true | true | - | ✅ | "300-in-15min"; q=300; w=900; pk=:MzUzYmMxZGMwNDYy: |
| 2 | Helmet security headers are sent | - | Assertion | true | true | - | ✅ | nosniff + CSP |
| 3 | CORS allows configured origin | - | Assertion | true | true | - | ✅ | http://localhost:3000 |
