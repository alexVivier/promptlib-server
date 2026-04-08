import 'dotenv/config'
import { buildApp } from './app.js'
import { config } from './config.js'

async function main() {
  const app = await buildApp()

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' })
    console.log(`PromptLib server running on http://localhost:${config.port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
