export interface ParsedFilename {
	dateTimeStr: string;
	dateTimeSortKey: string;
	world: string;
	map: string;
	cell: string;
	area: string;
	isPractice: boolean;
}

export interface BattleLogItem extends ParsedFilename {
	id: string;
	filename: string;
	file?: File;
	handle?: FileSystemFileHandle;
}

export function parseLogFilename(filename: string): ParsedFilename {
	// Why not parse with Date constructor: Direct string slicing is orders of magnitude faster for tens of thousands of items.
	const dateMatch = filename.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
	let dateTimeStr = '-';
	let dateTimeSortKey = '';
	if (dateMatch) {
		const [, y, m, d, h, min, s] = dateMatch;
		dateTimeStr = `${y}-${m}-${d} ${h}:${min}:${s}`;
		dateTimeSortKey = `${y}${m}${d}_${h}${min}${s}`;
	}

	// Why not simple equality check: Practice files can be practice.txt or contain Japanese kanji 演習.
	const isPractice = /practice|演習/i.test(filename);
	if (isPractice) {
		return {
			dateTimeStr,
			dateTimeSortKey,
			world: '演習',
			map: '-',
			cell: '-',
			area: '演習',
			isPractice: true
		};
	}

	// Why not single strict pattern: Accommodates both standard @World-Map-Cell format and test prefixes like sample-62-3-62.txt.
	const mapCellMatch = filename.match(
		/(?:@|[a-zA-Z0-9]+-)?([a-zA-Z0-9]+)-([a-zA-Z0-9]+)-([^.]+)\.txt$/i
	);
	if (mapCellMatch) {
		const [, world, map, cell] = mapCellMatch;
		return {
			dateTimeStr,
			dateTimeSortKey,
			world,
			map,
			cell,
			area: `${world}-${map}`,
			isPractice: false
		};
	}

	return {
		dateTimeStr,
		dateTimeSortKey,
		world: '不明',
		map: '-',
		cell: '-',
		area: '不明',
		isPractice: false
	};
}
