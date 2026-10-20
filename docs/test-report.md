# ParcelPath API Test Report

End-to-end test run of the ParcelPath backend against a running local server, a real PostgreSQL database (Neon), Redis (Upstash), Stripe sandbox and Cloudinary.

| Item | Value |
| --- | --- |
| Date | 20 October 2026 |
| Server | `npm run dev` on `http://localhost:5000` |
| Database | Neon PostgreSQL, migrated and seeded |
| Cache | Upstash Redis |
| Payments | Stripe sandbox, webhooks forwarded with `stripe listen` |
| File storage | Cloudinary |
| Result | **150 / 150 passed** (123 HTTP requests, 27 data assertions) |
| Endpoints covered | All 36 API endpoints plus the root health route |
| Response time | Median 320 ms, p95 1751 ms (includes remote database and third-party calls) |

## Summary

| Area | Tests | Passed |
| --- | --- | --- |
| Health & Routing | 2 | 2 |
| Authentication | 19 | 19 |
| User Profile | 8 | 8 |
| Hubs | 13 | 13 |
| Shipments | 57 | 57 |
| Payments | 28 | 28 |
| Admin | 20 | 20 |
| Security | 3 | 3 |
| **Total** | **150** | **150** |

Every response was also checked against the required format: `{ success: true, message, data }` for success and `{ success: false, message, errors: [] }` for errors. A test passes only when both the status code and the response shape are correct.

## What Was Verified

- **Authentication:** registration with validation and duplicate email handling, login for all three roles, Google ID token rejection, refresh token rotation, reuse detection that revokes the whole token family, and logout.
- **Role-based access:** each role was tested against endpoints reserved for other roles and received `403 Forbidden`. Customers and couriers only see their own shipments and payments (`404` for others).
- **Validation and errors:** invalid bodies, query parameters, path ids, malformed JSON, wrong file types and missing tokens all return structured errors with the field path.
- **Hubs:** create, list with pagination, search, filter and sort (Redis cached), update, soft delete, and refusal to delete a hub that still has active shipments.
- **Shipments:** price calculation, creation with tracking number, role-scoped listing, search, public tracking without personal data, editing with price recalculation, soft delete, courier assignment only after payment, and the full status workflow with role rules and invalid transition checks.
- **Payments (real Stripe sandbox):** checkout session creation in BDT, reuse of an open session, card payment with the Stripe test card, success redirect verification, idempotent fulfillment, webhook delivery, cancel redirect that expires the session, and an automatic Stripe refund when a paid shipment is cancelled.
- **File uploads (real Cloudinary):** avatar upload and proof-of-delivery photo, both stored on `res.cloudinary.com`.
- **Admin:** user listing with filters, role changes, block and unblock (blocked users lose access immediately, even with a valid token), dashboard statistics and audit logs.
- **Security:** rate limit headers (`RateLimit-Policy: 300-in-15min`), Helmet headers (`X-Content-Type-Options`, `Content-Security-Policy`) and CORS for the configured origin.

## Payment Flow Evidence

| Step | Result |
| --- | --- |
| `POST /payments/initiate` for shipment A | Checkout session created, BDT 220 |
| Paid on Stripe Checkout with test card 4242 4242 4242 4242 | Redirected to `/payments/success`, payment `PAID` |
| Stripe webhook `checkout.session.completed` | Delivered and answered with `200` |
| Repeated success redirect | Same `paidAt`, no double fulfillment |
| Shipment B paid, then cancelled by the customer | Shipment `CANCELLED`, payment `REFUNDED` through Stripe |
| Shipment C checkout cancelled | Session expired, payment `CANCELLED`, webhook `checkout.session.expired` answered with `200` |

## Shipment Timeline Evidence

The public tracking endpoint for the delivered test shipment returned this timeline:

```text
PENDING > PENDING (paid) > COURIER_ASSIGNED > PICKED_UP > AT_ORIGIN_HUB > IN_TRANSIT
> AT_DESTINATION_HUB > OUT_FOR_DELIVERY > FAILED_DELIVERY > OUT_FOR_DELIVERY > DELIVERED
```

## Issues Found and Fixed

| Issue | Cause | Fix |
| --- | --- | --- |
| Image uploads sometimes failed with `500 Internal server error` | Cloudinary returns plain error objects, which the error handler did not recognize | Upload failures now return `502` with the provider message (`fix: surface cloudinary upload failures as 502 errors`) |
| Image uploads failed with `Request Timeout` after about 5 seconds | Node.js 24 uses a 5 second socket timeout on its global HTTPS agent, which Cloudinary uses by default | Uploads use their own HTTPS agent with a 30 second timeout (`fix: use dedicated agent and longer timeout for cloudinary uploads`) |

All tests were run again after both fixes and passed.

## Not Covered Automatically

- **Successful Google sign-in:** this needs a real Google ID token from a signed-in Google account. The rejection paths were tested. To test a successful login, get an `id_token` from the [Google OAuth Playground](https://developers.google.com/oauthplayground) using your own OAuth client and send it to `POST /auth/google`.
- **Rate limit blocking (`429`):** only the rate limit headers were checked, because triggering the limit would block the test client for 15 minutes.
- **Delayed payment methods** (`checkout.session.async_payment_*`): card payments complete immediately, so these webhook events were not produced.

## Detailed Results

### Health & Routing

| # | Test | Role | Request | Expected | Actual | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | API root health check | Public | `GET /` | 200 | 200 | ✅ | ParcelPath API is running |
| 2 | Unknown route returns 404 | Public | `GET /api/v1/does-not-exist` | 404 | 404 | ✅ | Route GET /api/v1/does-not-exist not found |

### Authentication

| # | Test | Role | Request | Expected | Actual | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Register with invalid data | Public | `POST /api/v1/auth/register` | 400 | 400 | ✅ | Validation failed |
| 2 | Register new customer | Public | `POST /api/v1/auth/register` | 201 | 201 | ✅ | Account registered successfully |
| 3 | Registered account is CUSTOMER with lowercased email | - | Assertion | true | true | ✅ | role=CUSTOMER |
| 4 | Password hash is never returned | - | Assertion | true | true | ✅ | user object has no password field |
| 5 | Register duplicate email | Public | `POST /api/v1/auth/register` | 409 | 409 | ✅ | An account with this email already exists |
| 6 | Login with wrong password | Public | `POST /api/v1/auth/login` | 401 | 401 | ✅ | Invalid email or password |
| 7 | Login with malformed JSON | Public | `POST /api/v1/auth/login` | 400 | 400 | ✅ | Malformed JSON body |
| 8 | Google login with invalid ID token | Public | `POST /api/v1/auth/google` | 401 | 401 | ✅ | Invalid Google ID token |
| 9 | Google login without ID token | Public | `POST /api/v1/auth/google` | 400 | 400 | ✅ | Validation failed |
| 10 | Login demo customer | Customer | `POST /api/v1/auth/login` | 200 | 200 | ✅ | Logged in successfully |
| 11 | Login demo courier | Courier | `POST /api/v1/auth/login` | 200 | 200 | ✅ | Logged in successfully |
| 12 | Login admin | Admin | `POST /api/v1/auth/login` | 200 | 200 | ✅ | Logged in successfully |
| 13 | Login newly registered customer | Customer | `POST /api/v1/auth/login` | 200 | 200 | ✅ | Logged in successfully |
| 14 | Refresh token rotation | Customer | `POST /api/v1/auth/refresh-token` | 200 | 200 | ✅ | Tokens refreshed successfully |
| 15 | Reuse of rotated refresh token is rejected | Customer | `POST /api/v1/auth/refresh-token` | 401 | 401 | ✅ | Refresh token is invalid or has already been used |
| 16 | Token family revoked after reuse | Customer | `POST /api/v1/auth/refresh-token` | 401 | 401 | ✅ | Refresh token is invalid or has already been used |
| 17 | Login again after revocation | Customer | `POST /api/v1/auth/login` | 200 | 200 | ✅ | Logged in successfully |
| 18 | Logout revokes refresh token | Customer | `POST /api/v1/auth/logout` | 200 | 200 | ✅ | Logged out successfully |
| 19 | Refresh after logout is rejected | Customer | `POST /api/v1/auth/refresh-token` | 401 | 401 | ✅ | Refresh token is invalid or has already been used |

### User Profile

| # | Test | Role | Request | Expected | Actual | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Profile without token | Public | `GET /api/v1/users/me` | 401 | 401 | ✅ | Authentication token is missing |
| 2 | Profile with invalid token | Public | `GET /api/v1/users/me` | 401 | 401 | ✅ | Invalid token |
| 3 | Get own profile | Customer | `GET /api/v1/users/me` | 200 | 200 | ✅ | Profile retrieved successfully |
| 4 | Reject non-image upload | Customer | `PATCH /api/v1/users/me` | 400 | 400 | ✅ | Only JPEG, PNG or WEBP images are allowed |
| 5 | Reject empty profile update | Customer | `PATCH /api/v1/users/me` | 400 | 400 | ✅ | Provide at least one field to update |
| 6 | Reject invalid phone number | Customer | `PATCH /api/v1/users/me` | 400 | 400 | ✅ | Validation failed |
| 7 | Update profile with avatar upload (Cloudinary) | Customer | `PATCH /api/v1/users/me` | 200 | 200 | ✅ | Profile updated successfully |
| 8 | Avatar stored on Cloudinary | - | Assertion | true | true | ✅ | https://res.cloudinary.com/dqikw5lln/image/upload/v1792479078/parcelpath/avatars/d0dgitylmr6wvldr7fgn.png |

### Hubs

| # | Test | Role | Request | Expected | Actual | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | List hubs with pagination and sorting | Customer | `GET /api/v1/hubs` | 200 | 200 | ✅ | Hubs retrieved successfully |
| 2 | Pagination meta present | - | Assertion | true | true | ✅ | {"page":1,"limit":10,"total":5,"totalPages":1} |
| 3 | Search hubs by keyword | Customer | `GET /api/v1/hubs` | 200 | 200 | ✅ | Hubs retrieved successfully |
| 4 | Filter hubs by city (cached repeat) | Customer | `GET /api/v1/hubs` | 200 | 200 | ✅ | Hubs retrieved successfully |
| 5 | Customer cannot create hub | Customer | `POST /api/v1/hubs` | 403 | 403 | ✅ | You do not have permission to perform this action |
| 6 | Create hub with invalid data | Admin | `POST /api/v1/hubs` | 400 | 400 | ✅ | Validation failed |
| 7 | Create hub | Admin | `POST /api/v1/hubs` | 201 | 201 | ✅ | Hub created successfully |
| 8 | Create hub with duplicate code | Admin | `POST /api/v1/hubs` | 409 | 409 | ✅ | A record with this code already exists |
| 9 | Get hub by id | Courier | `GET /api/v1/hubs/:id` | 200 | 200 | ✅ | Hub retrieved successfully |
| 10 | Get hub with invalid id | Admin | `GET /api/v1/hubs/not-a-uuid` | 400 | 400 | ✅ | Validation failed |
| 11 | Update hub | Admin | `PATCH /api/v1/hubs/:id` | 200 | 200 | ✅ | Hub updated successfully |
| 12 | Soft delete hub | Admin | `DELETE /api/v1/hubs/:id` | 200 | 200 | ✅ | Hub deleted successfully |
| 13 | Deleted hub is hidden | Admin | `GET /api/v1/hubs/:id` | 404 | 404 | ✅ | Hub not found |

### Shipments

| # | Test | Role | Request | Expected | Actual | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Estimate delivery charge (public) | Public | `POST /api/v1/shipments/price-estimate` | 200 | 200 | ✅ | Delivery charge calculated successfully |
| 2 | Inter-city fragile 2.5kg = 150 + 50 + 60 | - | Assertion | true | true | ✅ | total=260 |
| 3 | Courier cannot create shipment | Courier | `POST /api/v1/shipments` | 403 | 403 | ✅ | You do not have permission to perform this action |
| 4 | Create shipment with invalid data | Customer | `POST /api/v1/shipments` | 400 | 400 | ✅ | Validation failed |
| 5 | Create shipment A | Customer | `POST /api/v1/shipments` | 201 | 201 | ✅ | Shipment created successfully |
| 6 | Create shipment B | Customer | `POST /api/v1/shipments` | 201 | 201 | ✅ | Shipment created successfully |
| 7 | Create shipment C | Customer | `POST /api/v1/shipments` | 201 | 201 | ✅ | Shipment created successfully |
| 8 | Tracking number format PPyymmddXXXXXX | - | Assertion | true | true | ✅ | PP261020TCLPJ3 |
| 9 | Hub with active shipments cannot be deleted | Admin | `DELETE /api/v1/hubs/:id` | 409 | 409 | ✅ | Hub has 3 active shipment(s) and cannot be deleted |
| 10 | List shipments with filter, sort and pagination | Customer | `GET /api/v1/shipments` | 200 | 200 | ✅ | Shipments retrieved successfully |
| 11 | Invalid filter value rejected | Customer | `GET /api/v1/shipments` | 400 | 400 | ✅ | Validation failed |
| 12 | Search shipments | Customer | `GET /api/v1/shipments/search` | 200 | 200 | ✅ | Search results retrieved successfully |
| 13 | Search term too short | Customer | `GET /api/v1/shipments/search` | 400 | 400 | ✅ | Validation failed |
| 14 | Public tracking by tracking number | Public | `GET /api/v1/shipments/track/:trackingNumber` | 200 | 200 | ✅ | Shipment tracking retrieved successfully |
| 15 | Invalid tracking number | Public | `GET /api/v1/shipments/track/ABC` | 400 | 400 | ✅ | Validation failed |
| 16 | Get own shipment details | Customer | `GET /api/v1/shipments/:id` | 200 | 200 | ✅ | Shipment retrieved successfully |
| 17 | Other customer cannot see shipment | Customer | `GET /api/v1/shipments/:id` | 404 | 404 | ✅ | Shipment not found |
| 18 | Courier cannot see unassigned shipment | Courier | `GET /api/v1/shipments/:id` | 404 | 404 | ✅ | Shipment not found |
| 19 | Update unpaid shipment recalculates price | Customer | `PATCH /api/v1/shipments/:id` | 200 | 200 | ✅ | Shipment updated successfully |
| 20 | Price recalculated to 150 + 50 + 20 | - | Assertion | true | true | ✅ | price=220 |
| 21 | Courier cannot be assigned before payment | Admin | `POST /api/v1/shipments/:id/assign` | 409 | 409 | ✅ | Shipment must be paid before a courier is assigned |
| 22 | Paid shipment cannot be edited | Customer | `PATCH /api/v1/shipments/:id` | 409 | 409 | ✅ | Shipment can only be edited before payment |
| 23 | Paid shipment must be cancelled before delete | Customer | `DELETE /api/v1/shipments/:id` | 409 | 409 | ✅ | Paid shipment must be cancelled before it can be deleted |
| 24 | Cancel paid shipment B with Stripe refund | Customer | `POST /api/v1/shipments/:id/cancel` | 200 | 200 | ✅ | Shipment cancelled successfully |
| 25 | Shipment B is CANCELLED | - | Assertion | true | true | ✅ | CANCELLED |
| 26 | Payment B after cancellation | Customer | `GET /api/v1/payments/:id` | 200 | 200 | ✅ | Payment retrieved successfully |
| 27 | Payment B is REFUNDED | - | Assertion | true | true | ✅ | REFUNDED |
| 28 | Soft delete cancelled shipment B | Customer | `DELETE /api/v1/shipments/:id` | 200 | 200 | ✅ | Shipment deleted successfully |
| 29 | Deleted shipment is hidden | Customer | `GET /api/v1/shipments/:id` | 404 | 404 | ✅ | Shipment not found |
| 30 | Customer cannot assign courier | Customer | `POST /api/v1/shipments/:id/assign` | 403 | 403 | ✅ | You do not have permission to perform this action |
| 31 | Assign a non-courier user | Admin | `POST /api/v1/shipments/:id/assign` | 400 | 400 | ✅ | Courier not found or not active |
| 32 | Assign courier to paid shipment | Admin | `POST /api/v1/shipments/:id/assign` | 200 | 200 | ✅ | Courier assigned successfully |
| 33 | Status moved to COURIER_ASSIGNED | - | Assertion | true | true | ✅ | COURIER_ASSIGNED |
| 34 | Courier sees assigned shipments | Courier | `GET /api/v1/shipments/my-assigned` | 200 | 200 | ✅ | Assigned shipments retrieved successfully |
| 35 | Assigned shipment appears in courier list | - | Assertion | true | true | ✅ | count=1 |
| 36 | Customer cannot open courier list | Customer | `GET /api/v1/shipments/my-assigned` | 403 | 403 | ✅ | You do not have permission to perform this action |
| 37 | Admin cannot mark PICKED_UP | Admin | `PATCH /api/v1/shipments/:id/status` | 403 | 403 | ✅ | Only COURIER can mark a shipment PICKED_UP |
| 38 | Cannot skip to DELIVERED | Courier | `PATCH /api/v1/shipments/:id/status` | 409 | 409 | ✅ | Cannot change status from COURIER_ASSIGNED to DELIVERED |
| 39 | Courier marks PICKED_UP | Courier | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | ✅ | Shipment status updated successfully |
| 40 | Cannot cancel after pickup | Customer | `POST /api/v1/shipments/:id/cancel` | 409 | 409 | ✅ | Shipment cannot be cancelled once it is PICKED_UP |
| 41 | Courier drops at origin hub | Courier | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | ✅ | Shipment status updated successfully |
| 42 | Courier cannot mark IN_TRANSIT | Courier | `PATCH /api/v1/shipments/:id/status` | 403 | 403 | ✅ | Only ADMIN can mark a shipment IN_TRANSIT |
| 43 | Admin marks IN_TRANSIT | Admin | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | ✅ | Shipment status updated successfully |
| 44 | Admin marks AT_DESTINATION_HUB | Admin | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | ✅ | Shipment status updated successfully |
| 45 | Courier marks OUT_FOR_DELIVERY | Courier | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | ✅ | Shipment status updated successfully |
| 46 | Failed delivery requires reason | Courier | `PATCH /api/v1/shipments/:id/status` | 400 | 400 | ✅ | Validation failed |
| 47 | Courier marks FAILED_DELIVERY | Courier | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | ✅ | Shipment status updated successfully |
| 48 | Courier retries OUT_FOR_DELIVERY | Courier | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | ✅ | Shipment status updated successfully |
| 49 | DELIVERED requires proof image | Courier | `PATCH /api/v1/shipments/:id/status` | 400 | 400 | ✅ | Proof of delivery image is required |
| 50 | Public tracking shows full timeline | Public | `GET /api/v1/shipments/track/:trackingNumber` | 200 | 200 | ✅ | Shipment tracking retrieved successfully |
| 51 | Public tracking hides personal data | - | Assertion | true | true | ✅ | no phone or customer fields |
| 52 | Courier marks DELIVERED with proof photo | Courier | `PATCH /api/v1/shipments/:id/status` | 200 | 200 | ✅ | Shipment status updated successfully |
| 53 | Proof of delivery stored on Cloudinary | - | Assertion | true | true | ✅ | https://res.cloudinary.com/dqikw5lln/image/upload/v1792479079/parcelpath/proof-of-delivery/pv9tdejsjq6tbbg5jjbj.png |
| 54 | Delivered shipment is final | Courier | `PATCH /api/v1/shipments/:id/status` | 409 | 409 | ✅ | Cannot change status from DELIVERED to OUT_FOR_DELIVERY |
| 55 | Delivered shipment cannot be cancelled | Customer | `POST /api/v1/shipments/:id/cancel` | 409 | 409 | ✅ | Shipment cannot be cancelled once it is DELIVERED |
| 56 | Public tracking after delivery | Public | `GET /api/v1/shipments/track/:trackingNumber` | 200 | 200 | ✅ | Shipment tracking retrieved successfully |
| 57 | Timeline contains every step | - | Assertion | true | true | ✅ | PENDING > PENDING > COURIER_ASSIGNED > PICKED_UP > AT_ORIGIN_HUB > IN_TRANSIT > AT_DESTINATION_HUB > OUT_FOR_DELIVERY > FAILED_DELIVERY > OUT_FOR_DELIVERY > DELIVERED |

### Payments

| # | Test | Role | Request | Expected | Actual | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Admin cannot initiate customer payment | Admin | `POST /api/v1/payments/initiate` | 403 | 403 | ✅ | You do not have permission to perform this action |
| 2 | Initiate payment for someone else's shipment | Customer | `POST /api/v1/payments/initiate` | 404 | 404 | ✅ | Shipment not found |
| 3 | Initiate Stripe checkout for shipment A | Customer | `POST /api/v1/payments/initiate` | 201 | 201 | ✅ | Checkout session created successfully |
| 4 | Checkout amount matches shipment price (BDT) | - | Assertion | true | true | ✅ | 220 bdt |
| 5 | Re-initiate reuses the open session | Customer | `POST /api/v1/payments/initiate` | 201 | 201 | ✅ | Checkout session created successfully |
| 6 | Same Stripe session returned | - | Assertion | true | true | ✅ | no duplicate checkout session |
| 7 | Initiate Stripe checkout for shipment B | Customer | `POST /api/v1/payments/initiate` | 201 | 201 | ✅ | Checkout session created successfully |
| 8 | Initiate Stripe checkout for shipment C | Customer | `POST /api/v1/payments/initiate` | 201 | 201 | ✅ | Checkout session created successfully |
| 9 | Success redirect with invalid session id | Public | `GET /api/v1/payments/success` | 400 | 400 | ✅ | Validation failed |
| 10 | Success redirect before paying | Public | `GET /api/v1/payments/success` | 200 | 200 | ✅ | Payment is still processing |
| 11 | Unpaid session stays PENDING | - | Assertion | true | true | ✅ | PENDING |
| 12 | Webhook without signature | Stripe | `POST /api/v1/payments/webhook` | 400 | 400 | ✅ | Missing Stripe signature header |
| 13 | Webhook with forged signature | Stripe | `POST /api/v1/payments/webhook` | 400 | 400 | ✅ | Invalid Stripe webhook signature |
| 14 | Success redirect verifies paid session A | Public | `GET /api/v1/payments/success` | 200 | 200 | ✅ | Payment verified successfully |
| 15 | Payment A is PAID and shipment marked paid | - | Assertion | true | true | ✅ | PAID paidAt=2026-10-20T06:47:41.997Z |
| 16 | Repeated verification is idempotent | Public | `GET /api/v1/payments/success` | 200 | 200 | ✅ | Payment verified successfully |
| 17 | Repeat does not change paidAt | - | Assertion | true | true | ✅ | single fulfillment |
| 18 | Get payment B after checkout | Customer | `GET /api/v1/payments/:id` | 200 | 200 | ✅ | Payment retrieved successfully |
| 19 | Payment B is PAID | - | Assertion | true | true | ✅ | PAID |
| 20 | Initiate payment for already paid shipment | Customer | `POST /api/v1/payments/initiate` | 409 | 409 | ✅ | Shipment has already been paid |
| 21 | Cancel redirect expires session C | Public | `GET /api/v1/payments/cancel` | 200 | 200 | ✅ | Checkout cancellation handled |
| 22 | Payment C is CANCELLED | - | Assertion | true | true | ✅ | CANCELLED |
| 23 | Cancel redirect with invalid payment id | Public | `GET /api/v1/payments/cancel` | 400 | 400 | ✅ | Validation failed |
| 24 | My payments with status filter | Customer | `GET /api/v1/payments/my` | 200 | 200 | ✅ | Payments retrieved successfully |
| 25 | Get payment by id (owner) | Customer | `GET /api/v1/payments/:id` | 200 | 200 | ✅ | Payment retrieved successfully |
| 26 | Get payment by id (admin) | Admin | `GET /api/v1/payments/:id` | 200 | 200 | ✅ | Payment retrieved successfully |
| 27 | Other customer cannot see payment | Customer | `GET /api/v1/payments/:id` | 404 | 404 | ✅ | Payment not found |
| 28 | Courier cannot list customer payments | Courier | `GET /api/v1/payments/my` | 403 | 403 | ✅ | You do not have permission to perform this action |

### Admin

| # | Test | Role | Request | Expected | Actual | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Customer cannot list users | Customer | `GET /api/v1/admin/users` | 403 | 403 | ✅ | You do not have permission to perform this action |
| 2 | Courier cannot read dashboard | Courier | `GET /api/v1/admin/dashboard-stats` | 403 | 403 | ✅ | You do not have permission to perform this action |
| 3 | List users with filters and search | Admin | `GET /api/v1/admin/users` | 200 | 200 | ✅ | Users retrieved successfully |
| 4 | Admin cannot change own role | Admin | `PATCH /api/v1/admin/users/:id/role` | 400 | 400 | ✅ | You cannot change your own account from the admin panel |
| 5 | Invalid role rejected | Admin | `PATCH /api/v1/admin/users/:id/role` | 400 | 400 | ✅ | Validation failed |
| 6 | Promote customer to courier | Admin | `PATCH /api/v1/admin/users/:id/role` | 200 | 200 | ✅ | User role updated successfully |
| 7 | Same role again is a conflict | Admin | `PATCH /api/v1/admin/users/:id/role` | 409 | 409 | ✅ | User already has the COURIER role |
| 8 | Block user | Admin | `PATCH /api/v1/admin/users/:id/status` | 200 | 200 | ✅ | User status updated successfully |
| 9 | Blocked user cannot log in | Courier | `POST /api/v1/auth/login` | 403 | 403 | ✅ | Your account has been blocked |
| 10 | Blocked user's existing token is rejected | Courier | `GET /api/v1/users/me` | 403 | 403 | ✅ | Your account has been blocked |
| 11 | Unblock user | Admin | `PATCH /api/v1/admin/users/:id/status` | 200 | 200 | ✅ | User status updated successfully |
| 12 | Demote back to customer | Admin | `PATCH /api/v1/admin/users/:id/role` | 200 | 200 | ✅ | User role updated successfully |
| 13 | Dashboard statistics | Admin | `GET /api/v1/admin/dashboard-stats` | 200 | 200 | ✅ | Dashboard statistics retrieved successfully |
| 14 | Revenue counts paid payments | - | Assertion | true | true | ✅ | revenue=220 BDT |
| 15 | Audit logs filtered by action | Admin | `GET /api/v1/admin/audit-logs` | 200 | 200 | ✅ | Audit logs retrieved successfully |
| 16 | Audit logs for payment events | Admin | `GET /api/v1/admin/audit-logs` | 200 | 200 | ✅ | Audit logs retrieved successfully |
| 17 | Audit logs after delivery | Admin | `GET /api/v1/admin/audit-logs` | 200 | 200 | ✅ | Audit logs retrieved successfully |
| 18 | Status changes are audited | - | Assertion | true | true | ✅ | entries=8 |
| 19 | Dashboard after delivery | Admin | `GET /api/v1/admin/dashboard-stats` | 200 | 200 | ✅ | Dashboard statistics retrieved successfully |
| 20 | Dashboard counts delivered shipment | - | Assertion | true | true | ✅ | {"PENDING":1,"DELIVERED":1} |

### Security

| # | Test | Role | Request | Expected | Actual | Result | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Rate limit headers are sent | - | Assertion | true | true | ✅ | "300-in-15min"; q=300; w=900; pk=:YmIwY2Q1MTM2YWU1: |
| 2 | Helmet security headers are sent | - | Assertion | true | true | ✅ | nosniff + CSP |
| 3 | CORS allows configured origin | - | Assertion | true | true | ✅ | http://localhost:3000 |
