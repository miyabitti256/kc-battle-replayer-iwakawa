import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

interface RawShipData {
	name?: string;
	nameJP?: string;
	type?: string;
	sclass?: number;
	[key: string]: unknown;
}

interface RawEquipData {
	name?: string;
	nameJP?: string;
	type?: number;
	[key: string]: unknown;
}

const shipSourcePath = path.resolve(
	import.meta.dirname,
	'../../reference-source/kancolle-replay/js/kcSHIPDATA.js'
);
const equipSourcePath = path.resolve(
	import.meta.dirname,
	'../../reference-source/kancolle-replay/js/kcEQDATA.js'
);

const outputDir = path.resolve(import.meta.dirname, '../src/lib/data');
const shipOutputPath = path.join(outputDir, 'shipLookup.json');
const equipOutputPath = path.join(outputDir, 'equipLookup.json');

function buildShipLookup(sourceCode: string): Record<string, number> {
	const context: { SHIPDATA?: Record<string, RawShipData> } = {};
	vm.runInNewContext(sourceCode, context);

	if (!context.SHIPDATA) {
		throw new Error('SHIPDATA object not found in context.');
	}

	const groups = new Map<string, { id: number; name: string; type: string }[]>();
	for (const [idStr, s] of Object.entries(context.SHIPDATA)) {
		const nameJP = s?.nameJP?.trim();
		if (!nameJP) continue;
		if (!groups.has(nameJP)) groups.set(nameJP, []);
		groups.get(nameJP)!.push({ id: Number(idStr), name: s.name || '', type: s.type || '' });
	}

	const lookup: Record<string, number> = {};

	for (const [nameJP, list] of groups.entries()) {
		list.sort((a, b) => a.id - b.id);

		// Why not use an array of IDs: keeping a number scalar format is simpler for lookups and conforms to single-ID schema.
		lookup[nameJP] = list[0].id;

		if (list.length === 1) continue;

		for (const item of list) {
			const parenMatch = item.name.match(/\(([^)]+)\)$/);
			if (parenMatch && item.name.startsWith('Souya')) {
				lookup[`${nameJP}(${parenMatch[1]})`] = item.id;
			} else if (nameJP === 'Glorious' || nameJP === 'Glorious改') {
				lookup[`${nameJP}(${item.type})`] = item.id;
			} else {
				const baseName = list[0].name;
				let suffix = '';
				if (item.name !== baseName) {
					if (item.name.startsWith(baseName)) {
						suffix = item.name.slice(baseName.length).trim();
					} else {
						const match = item.name.match(
							/(\b(Elite|Flagship|Damaged|\d+|[A-Z]|\(Vita\)|\(Dive\)|\(Torpedo\)).*)$/i
						);
						suffix = match ? match[1] : String(item.id);
					}
				}

				if (suffix) {
					lookup[`${nameJP}(${suffix})`] = item.id;
					lookup[`${nameJP} ${suffix}`] = item.id;
					lookup[`${nameJP} ${suffix.toLowerCase()}`] = item.id;
				}
			}
		}
	}

	// Why not require manual aliases: automatic accent stripping covers all diacritics in Shift_JIS logs without maintaining individual character lists.
	for (const [key, id] of Object.entries(lookup)) {
		const unaccented = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
		if (unaccented !== key && !lookup[unaccented]) {
			lookup[unaccented] = id;
		}
	}

	return lookup;
}

function buildEquipLookup(sourceCode: string): Record<string, number> {
	const context: { EQDATA?: Record<string, RawEquipData> } = {};
	vm.runInNewContext(sourceCode, context);

	if (!context.EQDATA) {
		throw new Error('EQDATA object not found in context.');
	}

	const groups = new Map<string, { id: number; name: string; type: number }[]>();
	for (const [idStr, e] of Object.entries(context.EQDATA)) {
		const nameJP = e?.nameJP?.trim();
		if (!nameJP) continue;
		if (!groups.has(nameJP)) groups.set(nameJP, []);
		groups.get(nameJP)!.push({ id: Number(idStr), name: e.name || '', type: e.type || 0 });
	}

	const lookup: Record<string, number> = {};

	for (const [nameJP, list] of groups.entries()) {
		list.sort((a, b) => a.id - b.id);

		// Why not overwrite the base name: the lowest ID is the canonical initial release of the equipment.
		lookup[nameJP] = list[0].id;

		if (list.length === 1) continue;

		for (const item of list) {
			if (nameJP === '5inch単装高射砲') {
				if (item.type === 2) {
					lookup[`${nameJP}(主砲)`] = item.id;
					lookup[`${nameJP}(Type2)`] = item.id;
				} else if (item.type === 4) {
					lookup[`${nameJP}(副砲)`] = item.id;
					lookup[`${nameJP}(Type4)`] = item.id;
				}
			} else {
				lookup[`${nameJP}(${item.id})`] = item.id;
			}
		}
	}

	// Why not require manual aliases: automatic accent stripping covers all diacritics in Shift_JIS logs without maintaining individual character lists.
	for (const [key, id] of Object.entries(lookup)) {
		const unaccented = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
		if (unaccented !== key && !lookup[unaccented]) {
			lookup[unaccented] = id;
		}
	}

	return lookup;
}

function main() {
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	console.log(`Reading ship data from ${shipSourcePath}...`);
	const shipCode = fs.readFileSync(shipSourcePath, 'utf-8');
	const shipLookup = buildShipLookup(shipCode);
	fs.writeFileSync(shipOutputPath, JSON.stringify(shipLookup, null, '\t') + '\n', 'utf-8');
	console.log(`Saved ${Object.keys(shipLookup).length} ship entries to ${shipOutputPath}`);

	console.log(`Reading equip data from ${equipSourcePath}...`);
	const equipCode = fs.readFileSync(equipSourcePath, 'utf-8');
	const equipLookup = buildEquipLookup(equipCode);
	fs.writeFileSync(equipOutputPath, JSON.stringify(equipLookup, null, '\t') + '\n', 'utf-8');
	console.log(`Saved ${Object.keys(equipLookup).length} equip entries to ${equipOutputPath}`);
}

main();
