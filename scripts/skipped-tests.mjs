// Lists the tests that were skipped, from the reports the test runs wrote, in the job summary and
// the log. A skipped test is never reported as passed, on a passing run either.
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';

const skipped = [];
if (existsSync('reports')) {
  for (const file of readdirSync('reports').filter((name) => name.endsWith('.xml'))) {
    const xml = readFileSync(`reports/${file}`, 'utf8');
    const cases = xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g);
    for (const [, attributes, body] of cases) {
      if (!body || !/<skipped\b/.test(body)) continue;
      const name = /\bname="([^"]*)"/.exec(attributes)?.[1] ?? '(unnamed)';
      const suite = /\bclassname="([^"]*)"/.exec(attributes)?.[1] ?? file;
      const reason = /<skipped\b[^>]*\bmessage="([^"]*)"/.exec(body)?.[1] ?? 'no reason given';
      skipped.push(`${suite}: ${name} (${reason})`);
    }
  }
}

const lines = skipped.length === 0
  ? ['No test was skipped.']
  : [`${skipped.length} test(s) skipped:`, ...skipped.map((line) => `- ${line}`)];
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['### Skipped tests', '', ...lines, ''].join('\n'));
}