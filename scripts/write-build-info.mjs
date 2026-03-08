import { writeFileSync, mkdirSync } from 'fs';

const branch   = process.env.CF_PAGES_BRANCH     || process.env.GITHUB_REF_NAME || 'local';
const commit   = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA      || 'unknown';
const builtAt  = new Date().toISOString();

const info = {
    branch,
    commit: commit.slice(0, 7),   // short SHA like "6b62c56"
    builtAt
};

mkdirSync('public', { recursive: true });
writeFileSync('public/build-info.json', JSON.stringify(info, null, 2));
console.log('✅ build-info.json written:', info);
