#!/usr/bin/env node
// inject-version.js - Inject git version and branch into HTML files

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Get git version and branch
function getGitVersion() {
  try {
    // Try to get exact tag first, fall back to latest tag, then 'dev'
    return execSync('git describe --tags --exact-match 2>/dev/null || git describe --tags --abbrev=0 2>/dev/null || echo "dev"')
      .toString().trim();
  } catch (e) {
    return 'dev';
  }
}

function getGitBranch() {
  try {
    return execSync('git branch --show-current 2>/dev/null || echo "main"')
      .toString().trim();
  } catch (e) {
    return 'main';
  }
}

function getShortCommit() {
  try {
    return execSync('git rev-parse --short HEAD 2>/dev/null')
      .toString().trim();
  } catch (e) {
    return 'unknown';
  }
}

// Get version info from environment or git
const uiVersion = process.env.GIT_TAG || getGitVersion();
const uiBranch = process.env.GIT_BRANCH || getGitBranch();
const uiCommit = getShortCommit();

console.log(`Injecting version: ${uiVersion} (${uiBranch}@${uiCommit})`);

// Files to update
const filesToUpdate = [
  'public/index.html',
  'public/instructor.html'
];

filesToUpdate.forEach(filePath => {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`Warning: ${filePath} not found, skipping`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Replace version placeholder in the footer script
  // Match pattern: ui: v0.0.1 or ui: {{UI_VERSION}}
  content = content.replace(
    /ui: v[\d.]+|ui: \{\{UI_VERSION\}\}/g,
    `ui: ${uiVersion}`
  );
  
  // Add branch info if not present, update version display script
  content = content.replace(
    /(var el = document\.getElementById\('version-footer'\);\s*if\(el\) el\.textContent = )'ui: v[\d.]+\s+\|\s+backend: ' \+ \(d\.version \|\| '\?'\);/,
    `$1'ui: ${uiVersion} (${uiBranch}) | backend: ' + (d.version || '?') + (d.branch ? ' (' + d.branch + ')' : '');`
  );
  
  // Also update the unavailable fallback
  content = content.replace(
    /(var el = document\.getElementById\('version-footer'\);\s*if\(el\) el\.textContent = )'ui: v[\d.]+\s+\|\s+backend: unavailable';/,
    `$1'ui: ${uiVersion} (${uiBranch}) | backend: unavailable';`
  );
  
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`✓ Updated ${filePath}`);
});

console.log('\nVersion injection complete!');
