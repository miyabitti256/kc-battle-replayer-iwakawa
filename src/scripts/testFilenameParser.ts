import assert from 'node:assert';
import { parseLogFilename } from '../src/lib/index';

function main() {
	console.log('=== Test: parseLogFilename ===');

	// What: Extract date, area, world, map, and cell from standard battle log filename
	const standard = parseLogFilename('20240316_135757@62-3-62.txt');
	assert.strictEqual(standard.dateTimeStr, '2024-03-16 13:57:57');
	assert.strictEqual(standard.dateTimeSortKey, '20240316_135757');
	assert.strictEqual(standard.world, '62');
	assert.strictEqual(standard.map, '3');
	assert.strictEqual(standard.cell, '62');
	assert.strictEqual(standard.area, '62-3');
	assert.strictEqual(standard.isPractice, false);

	// What: Parse practice log with timestamp and practice identifier
	const practice = parseLogFilename('20240316_135757@practice.txt');
	assert.strictEqual(practice.dateTimeStr, '2024-03-16 13:57:57');
	assert.strictEqual(practice.dateTimeSortKey, '20240316_135757');
	assert.strictEqual(practice.world, '演習');
	assert.strictEqual(practice.map, '-');
	assert.strictEqual(practice.cell, '-');
	assert.strictEqual(practice.area, '演習');
	assert.strictEqual(practice.isPractice, true);

	// What: Parse sample file without timestamp prefix
	const sample = parseLogFilename('sample-62-3-62.txt');
	assert.strictEqual(sample.dateTimeStr, '-');
	assert.strictEqual(sample.dateTimeSortKey, '');
	assert.strictEqual(sample.world, '62');
	assert.strictEqual(sample.map, '3');
	assert.strictEqual(sample.cell, '62');
	assert.strictEqual(sample.area, '62-3');
	assert.strictEqual(sample.isPractice, false);

	// What: Parse event map or lettered node
	const eventMap = parseLogFilename('20240316_140000@E2-3-boss.txt');
	assert.strictEqual(eventMap.world, 'E2');
	assert.strictEqual(eventMap.map, '3');
	assert.strictEqual(eventMap.cell, 'boss');
	assert.strictEqual(eventMap.area, 'E2-3');

	console.log('parseLogFilename tests passed successfully!');
}

main();
