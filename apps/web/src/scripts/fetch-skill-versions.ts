import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

interface NpmPackageResponse {
  version: string
}

async function fetchNpmVersion(packageName: string): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`)
  if (!response.ok) throw new Error(`npm fetch failed for ${packageName}: ${response.status}`)
  const data = (await response.json()) as NpmPackageResponse
  return data.version
}

async function main() {
  const careerclawVersion = await fetchNpmVersion('careerclaw-js')

  const versions = {
    careerclaw: `v${careerclawVersion}`,
  }

  const outputPath = './src/generated/skill-versions.json'

  // Ensure the directory exists
  mkdirSync(dirname(outputPath), { recursive: true })

  writeFileSync(outputPath, JSON.stringify(versions, null, 2))

  console.log('Skill versions updated:', versions)
}

main()
