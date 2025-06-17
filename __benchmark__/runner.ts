// C:\Edho\window\__benchmark__\runner.ts

// These are Node.js built-in modules, no need for ts-node/tsconfig-paths here
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Third-party packages (these are resolved by Node.js/npm)
import Benchmark from 'benchmark';
import { globSync } from 'glob';


const benchmarkFiles = globSync('__benchmark__/**/*.benchmark.ts', {
  absolute: true,
});
const allResults: any[] = []; // Use `any[]` for simplicity for now
const reportsDir = path.join(process.cwd(), '__benchmark__', 'reports');

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

async function runBenchmarks(): Promise<void> {
  console.log('Starting benchmark suites...\n');

  for (const file of benchmarkFiles) {
    const suiteNameFromFile = path.basename(file, '.benchmark.ts');
    console.log(`Running suite: ${suiteNameFromFile} (from ${file})`);

    // Convert file path to a file URL.
    // When this import happens, ts-node/esm (via --loader) should transpile it,
    // and tsconfig-paths (via --require) should handle aliases within it.
    const fileURL = pathToFileURL(file).href;
    let suiteModule: { default?: (suite: Benchmark.Suite) => void };

    try {
      suiteModule = await import(fileURL);
    } catch (error) {
      console.error(`Error importing ${file}:`, error);
      // If the import fails here, it indicates the core problem is still
      // the resolution of the benchmark file itself, or aliases within it.
      continue;
    }


    if (typeof suiteModule.default !== 'function') {
      console.warn(
        `Skipping ${file}: Default export is not a function that accepts a Benchmark.Suite.`,
      );
      continue;
    }

    const suite = new Benchmark.Suite(suiteNameFromFile);

    // Pass the suite to the benchmark file's default export function
    suiteModule.default(suite);

    const suiteResults: any[] = []; // Use any[] for simplicity

    await new Promise<void>((resolve) => {
      suite
        .on('cycle', (event: any) => { // 'any' for event.target to access bench properties
          const bench = event.target;
          console.log(`   ${String(bench)}`);
          suiteResults.push({
            suite: suite.name,
            name: bench.name,
            hz: bench.hz,
            rme: bench.stats.rme,
            size: bench.stats.sample.length,
            mean: bench.stats.mean,
            variance: bench.stats.variance,
          });
        })
        .on('complete', () => {
          // Assert type for suite.filter result if needed, or use `as any`
          console.log(`Fastest in ${suite.name} is ${suite.filter('fastest').map('name')}\n`);
          allResults.push(...suiteResults);
          resolve();
        })
        .run({ async: true });
    });
  }

  const jsonReportPath = path.join(reportsDir, 'benchmark_report.json');
  fs.writeFileSync(jsonReportPath, JSON.stringify(allResults, null, 2));
  console.log(`JSON report saved to: ${jsonReportPath}`);
  console.log('\nBenchmark run complete.');
  console.log('For a web report, you can use the generated JSON file with a custom viewer or tool.');
}

runBenchmarks().catch((error) => {
  console.error('An error occurred during benchmark run:', error);
});