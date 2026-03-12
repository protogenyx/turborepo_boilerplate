const fs = require('fs');

const report = JSON.parse(fs.readFileSync('lighthousereport.json', 'utf8'));

console.log('=== LIGHTHOUSE PERFORMANCE ANALYSIS ===\n');
console.log(`Performance Score: ${(report.categories.performance.score * 100).toFixed(1)}%\n`);

console.log('=== ERRORS AND FAILING AUDITS ===\n');

const failingAudits = Object.entries(report.audits)
  .filter(([_, audit]) => {
    return audit.score !== null &&
           audit.score < 1 &&
           audit.scoreDisplayMode !== 'notApplicable' &&
           audit.scoreDisplayMode !== 'informative';
  })
  .sort(([_, a], [__, b]) => a.score - b.score);

failingAudits.forEach(([id, audit]) => {
  console.log(`\n📊 ${audit.title}`);
  console.log(`   Score: ${(audit.score * 100).toFixed(1)}%`);
  if (audit.displayValue) console.log(`   Value: ${audit.displayValue}`);
  if (audit.description) console.log(`   Description: ${audit.description}`);

  // Show details if available
  if (audit.details && audit.details.items && audit.details.items.length > 0) {
    console.log(`   Issues found: ${audit.details.items.length}`);
    if (audit.details.items.length <= 5) {
      audit.details.items.forEach((item, i) => {
        if (item.url) console.log(`     ${i+1}. ${item.url.substring(0, 100)}`);
        else if (item.node?.snippet) console.log(`     ${i+1}. ${item.node.snippet.substring(0, 100)}`);
      });
    }
  }
});

console.log('\n=== OPPORTUNITIES (Largest Impact) ===\n');
const opportunities = Object.entries(report.audits)
  .filter(([_, audit]) => audit.details && audit.details.type === 'opportunity')
  .sort(([_, a], [__, b]) => (b.numericValue || 0) - (a.numericValue || 0))
  .slice(0, 10);

opportunities.forEach(([id, audit]) => {
  const savings = audit.numericValue ? `${(audit.numericValue / 1000).toFixed(2)}s` : 'N/A';
  console.log(`💡 ${audit.title}: ${savings} potential savings`);
  if (audit.displayValue) console.log(`   ${audit.displayValue}`);
});

console.log('\n=== DIAGNOSTICS ===\n');
const diagnostics = Object.entries(report.audits)
  .filter(([_, audit]) => audit.details && audit.details.type === 'debugdata')
  .filter(([_, audit]) => audit.score !== null && audit.score < 1);

diagnostics.forEach(([id, audit]) => {
  console.log(`🔍 ${audit.title}`);
  if (audit.displayValue) console.log(`   ${audit.displayValue}`);
});
