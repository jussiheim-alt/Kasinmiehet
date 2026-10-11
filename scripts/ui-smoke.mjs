import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const outDir = '/opt/cursor/artifacts/screenshots'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  recordVideo: { dir: '/opt/cursor/artifacts', size: { width: 390, height: 844 } },
})
const page = await context.newPage()
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.evaluate(() => {
  localStorage.clear()
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: path.join(outDir, '01-login.png'), fullPage: true })

await page.getByRole('button', { name: /Olli/i }).click()
await page.waitForTimeout(500)

// Handle water prompt if it appears on home
async function dismissOrAcceptPrompt(accept = true) {
  const yes = page.getByRole('button', { name: /Kyllä, aloita/i })
  const no = page.getByRole('button', { name: /Ei nyt/i })
  for (let i = 0; i < 8; i++) {
    if (await yes.isVisible().catch(() => false)) {
      await (accept ? yes : no).click()
      await page.waitForTimeout(300)
      return
    }
    await page.waitForTimeout(400)
  }
}

await dismissOrAcceptPrompt(true)
await page.screenshot({ path: path.join(outDir, '02-home-session.png'), fullPage: true })

await page.getByRole('button', { name: /Kirjaa saalis/i }).first().click()
await page.waitForTimeout(400)
await page.locator('#len').fill('75')
await page.locator('#note').fill('UI-demo')
await page.screenshot({ path: path.join(outDir, '03-catch-form.png'), fullPage: true })
await page.getByRole('button', { name: /Tallenna saalis/i }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(outDir, '04-catches.png'), fullPage: true })

await page.getByRole('button', { name: /^Kartta$/i }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: path.join(outDir, '05-map.png'), fullPage: true })

await page.getByRole('button', { name: /^Asetukset$/i }).click()
await page.waitForTimeout(300)
await page.locator('.toggle').first().click()
await page.waitForTimeout(300)
await page.screenshot({ path: path.join(outDir, '06-settings.png'), fullPage: true })

await page.getByRole('button', { name: /^Kalenteri$/i }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: path.join(outDir, '07-calendar.png'), fullPage: true })

const videoPath = await page.video()?.path()
await context.close()
await browser.close()
if (videoPath) {
  const dest = '/opt/cursor/artifacts/kasinmiehet-ui-demo.webm'
  fs.renameSync(videoPath, dest)
  console.log('Video:', dest)
}
console.log('Screenshots:', fs.readdirSync(outDir).join(', '))
