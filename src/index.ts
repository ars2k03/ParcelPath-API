import express, { type Request, type Response } from "express";
import { prisma } from "./lib/prisma.js";

const app = express()
const port = 3000

app.get('/', (req : Request, res : Response) => {
  res.send('Hello World!')
})

async function main() {
  try {
    await prisma.$connect();
    
    await prisma.$queryRaw`SELECT 1`;

    console.log('Database connected successfully');

  } catch (error) {
    console.error('Database connection failed:', error)
    process.exit(1)
  }

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
  })
}

main()
