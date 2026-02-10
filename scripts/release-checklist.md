# DotAI Release Checklist

## Pre-Release Checks

### 1. Code Quality
- [ ] All tests pass (`pnpm run test`)
- [ ] TypeScript compilation succeeds (`pnpm run build`)
- [ ] Linting passes (`pnpm run lint`)
- [ ] No console.log/debugger statements left in code

### 2. Documentation
- [ ] README.md is up to date
- [ ] CHANGELOG.md is updated with new version
- [ ] API documentation is current (if applicable)

### 3. Version Alignment
- [ ] All package.json files have the same version
- [ ] package.json versions match git tag

## Release Steps

### Option A: Automated Release (Recommended)

1. **Bump Version**
   ```bash
   # Patch version (bug fixes)
   node scripts/version-bump.js patch
   
   # Minor version (new features)
   node scripts/version-bump.js minor
   
   # Major version (breaking changes)
   node scripts/version-bump.js major
   ```

2. **Commit and Tag**
   ```bash
   git add .
   git commit -m "chore(release): vX.Y.Z"
   git tag vX.Y.Z
   git push && git push --tags
   ```

3. **Automated Actions**
   - GitHub Actions will automatically:
     - Build all packages
     - Run tests
     - Publish @dotai/core and @dotai/cli to npm
     - Publish extension to VSCode marketplace
     - Create GitHub release with notes

### Option B: Manual Release

#### Publish CLI
```bash
# Build
cd packages/core
npm run build
npm publish --access public

cd packages/cli
npm run build
npm publish --access public
```

#### Publish Extension
```bash
cd packages/extension
# Install vsce if not already
npm install -g @vscode/vsce

# Package
vsce package

# Publish
vsce publish
```

## Post-Release Verification

### 1. NPM Packages
```bash
# Verify CLI is available
npm view @dotai/cli version
npm view @dotai/core version

# Test installation
npm install -g @dotai/cli
dotai --version
```

### 2. VSCode Extension
- [ ] Extension appears in marketplace search
- [ ] Extension can be installed
- [ ] Extension activates successfully

### 3. GitHub Release
- [ ] Release notes are generated
- [ ] .vsix file is attached
- [ ] Tag points to correct commit

## Rollback Procedure

If release has critical issues:

### NPM
```bash
# Unpublish (within 24 hours)
npm unpublish @dotai/cli@X.Y.Z
npm unpublish @dotai/core@X.Y.Z

# Or deprecate
npm deprecate @dotai/cli@X.Y.Z "Critical bug in this version, use X.Y.Z+1 instead"
```

### VSCode Extension
- Unpublish via Azure DevOps portal
- Or release patched version immediately

### Git
```bash
# Delete tag
git push --delete origin vX.Y.Z
git tag -d vX.Y.Z
```

## Secrets Configuration

Required secrets in GitHub repository:

| Secret | Description | How to obtain |
|--------|-------------|---------------|
| `NPM_TOKEN` | NPM publish token | https://www.npmjs.com/settings/tokens |
| `VSCE_PAT` | VSCode marketplace PAT | https://dev.azure.com/ |
| `GITHUB_TOKEN` | Auto-generated | N/A |

## Troubleshooting

### CI Build Fails
- Check if all dependencies are in package.json
- Verify pnpm-lock.yaml is up to date (`pnpm install`)
- Check Node.js version compatibility

### NPM Publish Fails
- Verify NPM_TOKEN has publish permissions
- Check if version already exists
- Ensure 2FA is configured correctly

### VSCode Publish Fails
- Verify VSCE_PAT is valid and not expired
- Check extension version is incremented
- Ensure publisher name matches in package.json
