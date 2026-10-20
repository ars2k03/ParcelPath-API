# ParcelPath

ParcelPath is a REST API for a courier and logistics platform. Customers book parcel pickups and pay online, couriers pick up and deliver parcels, and admins run the hub network, assign couriers and watch the whole operation.

```text
Customer → Create Shipment → Pay → Courier Assigned → Picked Up → Origin Hub
        → In Transit → Destination Hub → Out for Delivery → Delivered
```

## Submission

```text
Project Name    : ParcelPath - Courier & Logistics Platform
Backend Repo    : <github repository url>
Live API        : <vercel deployment url>/api/v1
API Docs        : docs/ParcelPath.postman_collection.json
Demo Video      : <video url>
Admin Email     : <SEED_ADMIN_EMAIL>
Admin Password  : <SEED_ADMIN_PASSWORD>
```

## Tech Stack

| Category | Technology |
| --- | --- |
| Runtime & Framework | Node.js, TypeScript, Express 5 |
| Database & ORM | PostgreSQL, Prisma 7 (`@prisma/adapter-pg`) |
| Validation | Zod 4 |
| Authentication | JWT (access + rotating refresh tokens), bcrypt, Google Sign-In (`google-auth-library`) |
| Payments | Stripe Checkout + webhooks |
| Caching | Redis |
| File Storage | Multer + Cloudinary |
| Security | Helmet, CORS, express-rate-limit |
| Linting & Formatting | Biome |
| Deployment | Vercel |

## Roles

| Role | Can do |
| --- | --- |
| `CUSTOMER` | Register, create/edit/cancel/delete own shipments, pay with Stripe, view own payments |
| `COURIER` | View assigned shipments, mark pickup, hub drop-off, out for delivery, delivered (with photo proof) or failed |
| `ADMIN` | Manage hubs, assign couriers, move parcels between hubs, mark returns, manage users and roles, view stats and audit logs |

Every new account is a `CUSTOMER`. An admin promotes users to `COURIER` or `ADMIN`.

## Shipment Workflow

| From | To | Allowed role |
| --- | --- | --- |
| `PENDING` (paid) | `COURIER_ASSIGNED` | Admin (assign endpoint) |
| `COURIER_ASSIGNED` | `PICKED_UP` | Courier |
| `PICKED_UP` | `AT_ORIGIN_HUB` | Courier, Admin |
| `AT_ORIGIN_HUB` | `IN_TRANSIT` | Admin |
| `IN_TRANSIT` | `AT_DESTINATION_HUB` | Admin |
| `AT_DESTINATION_HUB` | `OUT_FOR_DELIVERY` | Courier |
| `OUT_FOR_DELIVERY` | `DELIVERED` / `FAILED_DELIVERY` | Courier |
| `FAILED_DELIVERY` | `OUT_FOR_DELIVERY` / `RETURNED` | Courier / Admin |
| `PENDING`, `COURIER_ASSIGNED` | `CANCELLED` | Customer, Admin (paid shipments are refunded through Stripe) |

Each status change runs inside a database transaction with a conditional update, so two requests cannot move the same shipment at the same time. Every change also writes a tracking event and an audit log entry.

### Pricing

| Component | Charge (BDT) |
| --- | --- |
| Same city base | 100 |
| Inter-city base | 150 |
| Each kg above 1 kg | 25 |
| Parcel type surcharge | Document 0, Package 20, Fragile 60 |

## Getting Started

### Prerequisites

- Node.js 20 or newer
- PostgreSQL database
- Redis instance
- Stripe, Cloudinary and Google Cloud (OAuth client) accounts

### Setup

```bash
npm install
cp .env.example .env
npm run db:deploy
npm run db:seed
npm run dev
```

The API runs at `http://localhost:5000/api/v1`.

### Environment Variables

| Key | Description |
| --- | --- |
| `NODE_ENV` | `development` or `production` |
| `PORT` | Local server port |
| `APP_URL` | Public base URL of this API, used for Stripe redirect URLs |
| `CORS_ORIGIN` | Comma separated list of allowed origins |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secrets of at least 32 characters |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Token lifetimes such as `15m` and `7d` |
| `BCRYPT_SALT_ROUNDS` | Password hashing cost (10 to 15) |
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary credentials |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Demo admin created by the seed |
| `SEED_DEMO_PASSWORD` | Password for `courier@parcelpath.com` and `customer@parcelpath.com` |

### Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the API with hot reload |
| `npm run build` | Generate Prisma Client and compile TypeScript |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type check without emitting |
| `npm run lint` / `npm run lint:fix` | Lint and format with Biome |
| `npm run db:migrate` | Create and apply a migration in development |
| `npm run db:deploy` | Apply pending migrations |
| `npm run db:seed` | Seed demo users and hubs |

## API Reference

Base URL: `/api/v1`. Protected routes need an `Authorization: Bearer <accessToken>` header.

### Response Format

```json
{ "success": true, "message": "Operation successful", "data": {} }
```

```json
{ "success": false, "message": "Validation failed", "errors": [{ "path": "email", "message": "Invalid email address" }] }
```

List endpoints return `data.meta` (`page`, `limit`, `total`, `totalPages`) and `data.items`.

### Endpoints

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Register a customer account |
| POST | `/auth/login` | Public | Log in with email and password |
| POST | `/auth/google` | Public | Log in with a Google ID token |
| POST | `/auth/refresh-token` | Public | Rotate refresh token and get a new access token |
| POST | `/auth/logout` | Public | Revoke a refresh token |
| GET | `/users/me` | Authenticated | Get own profile |
| PATCH | `/users/me` | Authenticated | Update name, phone or avatar (multipart) |
| POST | `/hubs` | Admin | Create a hub |
| GET | `/hubs` | Authenticated | List hubs with `page`, `limit`, `searchTerm`, `city`, `isActive`, `sortBy`, `sortOrder` |
| GET | `/hubs/:id` | Authenticated | Get a hub |
| PATCH | `/hubs/:id` | Admin | Update a hub |
| DELETE | `/hubs/:id` | Admin | Soft delete a hub with no active shipments |
| POST | `/shipments/price-estimate` | Public | Calculate delivery charge |
| POST | `/shipments` | Customer | Create a shipment (pickup request) |
| GET | `/shipments` | Authenticated | List shipments by role with `page`, `limit`, `status`, `parcelType`, `originHubId`, `destinationHubId`, `sortBy`, `sortOrder` |
| GET | `/shipments/search?q=` | Authenticated | Search by tracking number, receiver, sender, phone or address |
| GET | `/shipments/my-assigned` | Courier | Active shipments assigned to the courier |
| GET | `/shipments/track/:trackingNumber` | Public | Public tracking timeline |
| GET | `/shipments/:id` | Authenticated | Shipment details with timeline and payments |
| PATCH | `/shipments/:id` | Customer | Edit an unpaid pending shipment |
| DELETE | `/shipments/:id` | Customer, Admin | Soft delete a shipment |
| POST | `/shipments/:id/assign` | Admin | Assign or reassign a courier |
| PATCH | `/shipments/:id/status` | Courier, Admin | Move shipment to the next status |
| POST | `/shipments/:id/cancel` | Customer, Admin | Cancel before pickup with automatic refund |
| POST | `/payments/initiate` | Customer | Create a Stripe Checkout session |
| POST | `/payments/webhook` | Stripe | Verify signature and fulfil payments |
| GET | `/payments/success?session_id=` | Public | Stripe success redirect, verifies payment |
| GET | `/payments/cancel?payment_id=` | Public | Stripe cancel redirect, expires the session |
| GET | `/payments/my` | Customer | Own payment history |
| GET | `/payments/:id` | Owner, Admin | Payment details |
| GET | `/admin/users` | Admin | List users with `role`, `status`, `searchTerm` filters |
| PATCH | `/admin/users/:id/role` | Admin | Change a user's role |
| PATCH | `/admin/users/:id/status` | Admin | Block or unblock a user |
| GET | `/admin/dashboard-stats` | Admin | Users, shipments, revenue and hub statistics |
| GET | `/admin/audit-logs` | Admin | Audit trail with `action`, `entity`, `entityId`, `actorId` filters |

## Payment Flow

1. The customer calls `POST /payments/initiate` and opens the returned `checkoutUrl`.
2. The customer pays on Stripe Checkout (test card `4242 4242 4242 4242`).
3. Stripe sends `checkout.session.completed` to `/payments/webhook`. The signature is verified and the payment is fulfilled once, even if the event is delivered more than once.
4. Stripe redirects the customer to `/payments/success`, which also verifies the session with Stripe.
5. The payment becomes `PAID`, the shipment gets `paidAt` and an admin can assign a courier.

Cancelling on Stripe redirects to `/payments/cancel`, which expires the session. Expired or failed sessions are updated by the webhook. Test webhooks locally with:

```bash
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
```

## Google Sign-In

The API verifies Google ID tokens with `google-auth-library`, so only `GOOGLE_CLIENT_ID` is needed on the server. A frontend gets an ID token from the Google Identity Services button and sends it to `POST /auth/google`. To test without a frontend, use the [Google OAuth Playground](https://developers.google.com/oauthplayground) with your own OAuth client and the `openid email profile` scopes, then send the returned `id_token`.

## Project Structure

```text
src/
├── app.ts
├── server.ts
├── config/
├── routes/
├── middlewares/
├── errors/
├── utils/
├── types/
└── modules/
    ├── auth/
    ├── user/
    ├── hub/
    ├── shipment/
    ├── payment/
    └── admin/
```

Each module follows Route → Controller → Service → Prisma, with Zod schemas in `*.validation.ts`.

## Deployment (Vercel)

1. Import the repository in Vercel. Express is detected from `src/app.ts` with no extra configuration.
2. Add every variable from `.env.example` in the project settings, with `APP_URL` set to the deployment URL.
3. Run `npm run db:deploy` and `npm run db:seed` against the production database.
4. Add a Stripe webhook endpoint for `<APP_URL>/api/v1/payments/webhook` with the `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired` events.
