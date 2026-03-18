#!/usr/bin/env node
/**
 * Sync a curated list of Public APIs into KitzChat.
 *
 * Source: https://github.com/public-apis/public-apis (README.md)
 * This script deliberately syncs only a small, curated subset that we actually use
 * inside premium agent presets and the agent editor UI.
 */

import fs from 'node:fs';
import path from 'node:path';

const README_URL = 'https://raw.githubusercontent.com/public-apis/public-apis/master/README.md';
const DEFAULT_OUTFILE = path.join(process.cwd(), 'src', 'data', 'public-apis-premium.json');

const CURATED_NAMES = [
  'GitHub',
  'StackExchange',
  'Gitlab',
  'Bitbucket',
  'Docker Hub',
  'APIs.guru',
  'CDNJS',
  'npm Registry',
  'DomainDb Info',
  'IPify',
  'IPinfo',
  'Nominatim',
  'OpenStreetMap',
  'Postcodes.io',
  'Zippopotam.us',
  'REST Countries',
  'OpenCorporates',
  'Hunter',
  'MailboxValidator',
  'Clearbit Logo',
  'Phone Validation',
  'apilayer numverify',
  'Binlist',
  'VAT Validation',
  'The Guardian',
  'NewsData',
  'GNews',
  'Currents',
  'New York Times',
  'News',
  'apilayer mediastack',
  'Pexels',
  'Pixabay',
  'Unsplash',
  'MarketAux',
  'arXiv',
  'CORE',
  'Wikipedia',
  'Wikidata',
  'Crossref Metadata Search',
  'Open Library',
  'Open Science Framework',
  'SHARE',
  'World Bank',
  'FRED',
  'Fed Treasury',
  'Econdb',
  'SEC EDGAR Data',
  'Alpha Vantage',
  'Polygon',
  'OpenFIGI',
  'Open-Meteo',
  'transport.rest',
  'Open Food Facts',
  'Open Brewery DB',
  'AbuseIPDB',
  'URLhaus',
  'VirusTotal',
  'URLScan.io',
];

function parseReadmeToEntries(readmeText) {
  const lines = readmeText.split(/\r?\n/);
  let category = '';
  const entries = [];

  for (const line of lines) {
    const categoryMatch = line.match(/^###\s+(.+)$/);
    if (categoryMatch) {
      category = categoryMatch[1].trim();
      continue;
    }

    // Common format: | [API](link) | Description | `Auth` | Yes | Unknown |
    const rowMatch =
      line.match(/^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*(.*?)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|?/) ??
      // Some sections omit the leading pipe in the header but keep the row format; accept it too.
      line.match(/^\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*(.*?)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|?/);

    if (!rowMatch) continue;

    const [, name, url, description, auth, https, cors] = rowMatch;
    entries.push({
      category,
      name: String(name || '').trim(),
      url: String(url || '').trim(),
      description: String(description || '').trim(),
      auth: String(auth || '').replace(/`/g, '').trim(),
      https: String(https || '').trim(),
      cors: String(cors || '').trim(),
    });
  }

  return entries;
}

async function main() {
  const outfile = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUTFILE;
  const syncedAt = new Date().toISOString().slice(0, 10);

  const response = await fetch(README_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to download public-apis README: ${response.status}`);
  }
  const readmeText = await response.text();

  const entries = parseReadmeToEntries(readmeText);
  const index = new Map(entries.map((entry) => [entry.name, entry]));

  const missing = [];
  const picked = [];
  for (const name of CURATED_NAMES) {
    const entry = index.get(name);
    if (!entry) missing.push(name);
    else picked.push(entry);
  }

  if (missing.length) {
    throw new Error(`Missing curated entries in public-apis README: ${missing.join(', ')}`);
  }

  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  fs.writeFileSync(
    outfile,
    JSON.stringify(
      {
        source: {
          repo: 'public-apis/public-apis',
          url: 'https://github.com/public-apis/public-apis',
          syncedAt,
          readme: README_URL,
        },
        entries: picked,
      },
      null,
      2,
    ) + '\n',
  );

  process.stdout.write(`Synced ${picked.length} entries -> ${outfile}\n`);
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error) + '\n');
  process.exit(1);
});

