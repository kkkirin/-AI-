const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const licensesJsonPath = path.join(projectRoot, 'licenses.json');
const outputPath = path.join(projectRoot, 'THIRD_PARTY_LICENSES.txt');

function readLicensesJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function formatEntry(name, info) {
  const lines = [];
  lines.push(`Package: ${name}`);
  lines.push(`License: ${info.licenses || 'UNKNOWN'}`);
  if (info.repository) lines.push(`Repository: ${info.repository}`);
  if (info.licenseFile) lines.push(`License File: ${info.licenseFile}`);
  return lines.join('\n');
}

function buildOutput(data) {
  const header = [
    'Third-Party Licenses',
    '====================',
    '',
    'This file is generated from licenses.json.',
    'If a package lists multiple licenses (e.g. "A OR B"),',
    'the application is distributed under one of the listed options.',
    ''
  ].join('\n');

  const entries = Object.keys(data)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => formatEntry(name, data[name]));

  return `${header}${entries.join('\n\n----\n\n')}\n`;
}

function main() {
  if (!fs.existsSync(licensesJsonPath)) {
    throw new Error(`licenses.json not found at ${licensesJsonPath}`);
  }
  const data = readLicensesJson(licensesJsonPath);
  const output = buildOutput(data);
  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

main();
