import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "../generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

const requireEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required to run the seed`);
  }
  return value;
};

const hubs = [
  {
    name: "Dhaka Central Hub",
    code: "DHK",
    city: "Dhaka",
    address: "Tejgaon Industrial Area, Dhaka",
    phone: "01700000001",
  },
  {
    name: "Chattogram Hub",
    code: "CTG",
    city: "Chattogram",
    address: "Agrabad Commercial Area, Chattogram",
    phone: "01700000002",
  },
  {
    name: "Sylhet Hub",
    code: "SYL",
    city: "Sylhet",
    address: "Zindabazar, Sylhet",
    phone: "01700000003",
  },
  {
    name: "Rajshahi Hub",
    code: "RAJ",
    city: "Rajshahi",
    address: "Shaheb Bazar, Rajshahi",
    phone: "01700000004",
  },
  {
    name: "Khulna Hub",
    code: "KHL",
    city: "Khulna",
    address: "Sonadanga, Khulna",
    phone: "01700000005",
  },
];

const upsertUser = async (name: string, email: string, password: string, role: Role) => {
  const hashedPassword = await bcrypt.hash(password, Number(process.env.BCRYPT_SALT_ROUNDS ?? 12));
  return prisma.user.upsert({
    where: { email },
    update: { name, role, password: hashedPassword, deletedAt: null },
    create: { name, email, password: hashedPassword, role },
  });
};

const main = async () => {
  const demoPassword = requireEnv("SEED_DEMO_PASSWORD");

  await upsertUser(
    "Tanvir Ahmed",
    requireEnv("SEED_ADMIN_EMAIL"),
    requireEnv("SEED_ADMIN_PASSWORD"),
    Role.ADMIN,
  );
  await upsertUser("Rakib Hossain", "courier@parcelpath.com", demoPassword, Role.COURIER);
  await upsertUser("Nusrat Jahan", "customer@parcelpath.com", demoPassword, Role.CUSTOMER);

  for (const hub of hubs) {
    await prisma.hub.upsert({
      where: { code: hub.code },
      update: {},
      create: hub,
    });
  }

  console.log(`Seeded 3 users and ${hubs.length} hubs`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
