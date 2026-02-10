#!/usr/bin/env node
/**
 * Version bump script for DotAI monorepo
 * Usage: node scripts/version-bump.js [patch|minor|major]
 */

import fs from 'fs-extra';
import path from 'node:path';
import { execSync } from 'node:child_process';

const packages = ['core', 'cli', 'extension'];
const rootDir = process.cwd();

function getNewVersion(currentVersion, bumpType) {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}

function updatePackageVersion(pkgDir, newVersion) {
  const packageJsonPath = path.join(rootDir, 'packages', pkgDir, 'package.json');
  const packageJson = fs.readJsonSync(packageJsonPath);
  
  const oldVersion = packageJson.version;
  packageJson.version = newVersion;
  
  // Update workspace dependencies
  if (packageJson.dependencies) {
    for (const [dep, version] of Object.entries(packageJson.dependencies)) {
      if (version === 'workspace:*') {
        // Keep workspace protocol
        continue;
      }
      // Update internal package references
      if (dep.startsWith('@dotai/')) {
        packageJson.dependencies[dep] = newVersion;
      }
    }
  }
  
  fs.writeJsonSync(packageJsonPath, packageJson, { spaces: 2 });
  console.log(`✓ Updated packages/${pkgDir}/package.json: ${oldVersion} → ${newVersion}`);
}

function updateRootVersion(newVersion) {
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = fs.readJsonSync(packageJsonPath);
  
  packageJson.version = newVersion;
  fs.writeJsonSync(packageJsonPath, packageJson, { spaces: 2 });
  console.log(`✓ Updated root package.json: ${newVersion}`);
}

function updateExtensionVersion(newVersion) {
  // Update extension.ts version constant if exists
  const extensionPath = path.join(rootDir, 'packages', 'extension', 'src', 'extension.ts');
  if (fs.existsSync(extensionPath)) {
    let content = fs.readFileSync(extensionPath, 'utf-8');
    content = content.replace(/version: ['"]\d+\.\d+\.\d+['"]/, `version: '${newVersion}'`);
    fs.writeFileSync(extensionPath, content);
  }
}

function main() {
  const bumpType = process.argv[2] || 'patch';
  
  if (!['patch', 'minor', 'major'].includes(bumpType)) {
    console.error('Usage: node scripts/version-bump.js [patch|minor|major]');
    process.exit(1);
  }
  
  // Get current version from core package
  const corePackageJson = fs.readJsonSync(path.join(rootDir, 'packages', 'core', 'package.json'));
  const currentVersion = corePackageJson.version;
  const newVersion = getNewVersion(currentVersion, bumpType);
  
  console.log(`Bumping version: ${currentVersion} → ${newVersion}\n`);
  
  // Update all packages
  updateRootVersion(newVersion);
  packages.forEach(pkg => updatePackageVersion(pkg, newVersion));
  updateExtensionVersion(newVersion);
  
  console.log(`\n✓ Version bumped to ${newVersion}`);
  console.log('\nNext steps:');
  console.log(`  1. Review changes: git diff`);
  console.log(`  2. Commit: git add . && git commit -m "chore(release): v${newVersion}"`);
  console.log(`  3. Tag: git tag v${newVersion}`);
  console.log(`  4. Push: git push && git push --tags`);
  console.log('\nThe release will be triggered automatically by the tag push.');
}

main();