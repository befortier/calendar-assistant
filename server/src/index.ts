import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { runMigrations } from './db/migrate'

dotenv.config()

runMigrations()

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
