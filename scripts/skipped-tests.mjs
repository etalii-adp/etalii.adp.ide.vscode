// Lists the tests that were skipped, from the reports the test runs wrote, in the job summary and
// the log. A skipped test is never reported as passed, on a passing run either. The tests that
// failed are listed too, with their message: the real Visual Studio Code run writes them only to its
// report, which the log does not show.
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';

// The JUnit report of the core and webview tests keeps no reason for a skipped test. A test that
// skips itself writes its reason to reports/skip-reasons.jsonl, one line each; the last one given
// for a test is the one of this run.
const reasons = new Map();
if (existsSync('reports/skip-reasons.jsonl')) {
  for (const line of readFileSync('reports/skip-reasons.jsonl', 'utf8').split('\n').filter(Boolean)) {
    const { file, name, reason } = JSON.parse(line);
    reasons.set(`${file}: ${name}`, reason);
  }
}
const unescaped = (text) => text.replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&quot;', '"').replaceAll('&apos;', '\'').replaceAll('&amp;', '&');

const skipped = [];
const failed = [];
if (existsSync('reports')) {
  for (const file of readdirSync('reports').filter((name) => name.endsWith('.xml'))) {
    const xml = readFileSync(`reports/${file}`, 'utf8');
    const cases = xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g);
    for (const [, attributes, body] of cases) {
      const failure = body && /<(?:failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:failure|error)>)/.exec(body);
      if (failure) {
        const name = /\bname="([^"]*)"/.exec(attributes)?.[1] ?? '(unnamed)';
        // JUnit reports put the message in an attribute; Mocha's xunit report, which the real Visual
        // Studio Code run writes, puts the message and the stack in the element's text instead.
        const message = /\bmessage="([^"]*)"/.exec(failure[1])?.[1] || (failure[2] ?? '').replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();
        failed.push(`${unescaped(name)}: ${unescaped(message).slice(0, 2000)}`);
        continue;
      }
      if (!body || !/<skipped\b/.test(body)) continue;
      const name = /\bname="([^"]*)"/.exec(attributes)?.[1] ?? '(unnamed)';
      const suite = /\bclassname="([^"]*)"/.exec(attributes)?.[1] ?? file;
      // The report names a test with its suites before it; the test's own name is the last part.
      const own = unescaped(name).split(' > ').at(-1);
      const reason = /<skipped\b[^>]*\bmessage="([^"]*)"/.exec(body)?.[1] ?? reasons.get(`${suite}: ${own}`) ?? 'no reason given';
      skipped.push(`${suite}: ${name} (${reason})`);
    }
  }
}

const lines = skipped.length === 0
  ? ['No test was skipped.']
  : [`${skipped.length} test(s) skipped:`, ...skipped.map((line) => `- ${line}`)];
if (failed.length > 0) lines.push(`${failed.length} test(s) failed:`, ...failed.map((line) => `- ${line}`));
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['### Skipped tests', '', ...lines, ''].join('\n'));
}
