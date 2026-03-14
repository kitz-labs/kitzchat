const fs = require('fs');
const path = require('path');
const infile = path.resolve(__dirname, 'stripe_customers.json');
const outfile = path.resolve(__dirname, 'stripe_customers.csv');
if (!fs.existsSync(infile)) {
  console.error('Input JSON not found:', infile);
  process.exit(2);
}
const raw = fs.readFileSync(infile, 'utf8');
let obj;
try { obj = JSON.parse(raw); } catch (e) { console.error('Invalid JSON', e); process.exit(3); }
const rows = (obj.data || []).map(c => {
  const stripe_id = c.id || '';
  const user_id = (c.metadata && c.metadata.user_id) || '';
  const username = (c.metadata && c.metadata.username) || '';
  const name = c.name || '';
  return { stripe_id, user_id, username, name };
});
const header = 'stripe_id,user_id,username,name\n';
const csv = header + rows.map(r => {
  // escape double quotes
  const esc = v => '"' + String(v).replace(/"/g, '""') + '"';
  return [r.stripe_id, r.user_id, r.username, r.name].map(esc).join(',');
}).join('\n') + '\n';
fs.writeFileSync(outfile, csv, 'utf8');
console.log('WROTE', outfile, 'rows=', rows.length);
