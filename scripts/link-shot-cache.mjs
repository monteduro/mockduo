import fs from 'node:fs'
import path from 'node:path'

const cacheDir = process.env.SHOT_CACHE_DIR
if (cacheDir) {
  const target = path.resolve(cacheDir)
  if (!fs.statSync(target, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`SHOT_CACHE_DIR is not a directory: ${target}`)
  }
  const link = path.resolve('dist/shot-cache')
  fs.symlinkSync(target, link, 'dir')
  console.log(`Linked public screenshot cache to ${target}`)
}
