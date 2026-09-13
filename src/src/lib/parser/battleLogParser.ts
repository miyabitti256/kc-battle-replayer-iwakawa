import type {
	ParsedAirBaseSquadron,
	ParsedAirBaseWave,
	ParsedAttackAction,
	ParsedBattleLog,
	ParsedBattlePhases,
	ParsedBattleResult,
	ParsedEquipment,
	ParsedForces,
	ParsedFriendlyBattle,
	ParsedHeader,
	ParsedNightBattle,
	ParsedSearching,
	ParsedShip
} from '../types.js';

const FORMATION_MAP: Record<string, number> = {
	単縦陣: 1,
	複縦陣: 2,
	輪形陣: 3,
	梯形陣: 4,
	単横陣: 5,
	警戒陣: 6,
	第一警戒航行序列: 11,
	第一警戒: 11,
	第二警戒航行序列: 12,
	第二警戒: 12,
	第三警戒航行序列: 13,
	第三警戒: 13,
	第四警戒航行序列: 14,
	第四警戒: 14
};

const ENGAGEMENT_MAP: Record<string, number> = {
	同航戦: 1,
	反航戦: 2,
	T字有利: 3,
	T字不利: 4
};

const SEARCHING_MAP: Record<string, number> = {
	成功: 1,
	'成功(未帰還有)': 2,
	'成功△': 2,
	未帰還: 3,
	失敗: 4,
	'成功(非索敵機)': 5,
	'失敗(非索敵機)': 6
};

const AIR_SUPERIORITY_MAP: Record<string, number> = {
	航空均衡: 0,
	制空権確保: 1,
	航空優勢: 2,
	航空劣勢: 3,
	制空権喪失: 4
};

const ACTION_KIND_MAP: Record<string, number> = {
	待機: 0,
	出撃: 1,
	防空: 2,
	退避: 3,
	休息: 4
};

function parseAceLevel(symbol: string | undefined): number {
	if (!symbol) return 0;
	switch (symbol) {
		case '|':
			return 1;
		case '||':
			return 2;
		case '|||':
			return 3;
		case '/':
			return 4;
		case '//':
			return 5;
		case '///':
			return 6;
		case '>>':
			return 7;
		default:
			return 0;
	}
}

function parseFriendEquipment(itemStr: string): ParsedEquipment | null {
	const trimmed = itemStr.trim();
	if (!trimmed || trimmed === '(なし)') return null;

	// How: extract aircraft slot count from head, ace rank and star improvements from tail sequentially
	// Why not single regex: equipment names can contain slashes (e.g. '流星改(一航戦/熟練)'), which break negated character class matching
	let current = trimmed;
	let aircraft: number | undefined;
	let ace: number | undefined;
	let stars: number | undefined;

	const countMatch = current.match(/^\[(\d+)\]\s*/);
	if (countMatch) {
		aircraft = Number(countMatch[1]);
		current = current.slice(countMatch[0].length);
	}

	const aceMatch = current.match(/\s*(>>|\/{1,3}|\|{1,3})$/);
	if (aceMatch) {
		const parsedAce = parseAceLevel(aceMatch[1]);
		if (parsedAce > 0) {
			ace = parsedAce;
		}
		current = current.slice(0, aceMatch.index);
	}

	const starMatch = current.match(/★(\d+)$/);
	if (starMatch) {
		stars = Number(starMatch[1]);
		current = current.slice(0, starMatch.index);
	}

	const name = current.trim();

	return {
		name,
		aircraft,
		stars,
		ace
	};
}

function parseEnemyEquipment(itemStr: string): ParsedEquipment | null {
	const trimmed = itemStr.trim();
	if (!trimmed || trimmed === '(なし)') return null;

	const enemyMatch = trimmed.match(/^\[(\d+)\]\s*(.+)$/);
	if (enemyMatch) {
		return {
			name: enemyMatch[2].trim(),
			rawId: Number(enemyMatch[1])
		};
	}

	return {
		name: trimmed
	};
}

function parseEquipmentsLine(line: string, isEnemy = false): ParsedEquipment[] {
	const rawItems = line.trim().split(/,\s*/);
	const list: ParsedEquipment[] = [];
	for (const raw of rawItems) {
		const eq = isEnemy ? parseEnemyEquipment(raw) : parseFriendEquipment(raw);
		if (eq) list.push(eq);
	}
	return list;
}

export function parseBattleLog(text: string): ParsedBattleLog {
	const trimmed = text.trim();
	if (trimmed.startsWith('{')) {
		// Why not fail on JSON: allowing pre-parsed JSON input enables seamless round-tripping and direct ReplayData loading.
		try {
			const json = JSON.parse(trimmed);
			return parseJsonToBattleLog(json);
		} catch {
			// fall through to text parser if JSON parsing fails
		}
	}

	const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

	const header: ParsedHeader = {
		mapAreaName: '',
		world: 0,
		mapnum: 0,
		cell: 0,
		isBoss: false,
		combinedType: 0
	};

	const forces: ParsedForces = {
		friendMain: [],
		enemyMain: [],
		airBases: []
	};

	let searching: ParsedSearching | undefined;
	const phases: ParsedBattlePhases = {
		airBaseAttacks: [],
		openingTaisen: [],
		openingRaigeki: [],
		hougeki1: [],
		hougeki2: [],
		hougeki3: [],
		raigeki: []
	};
	let nightBattle: ParsedNightBattle | undefined;
	const friendlyFleet: ParsedShip[] = [];
	let friendlyBattle: ParsedFriendlyBattle | undefined;
	let result: ParsedBattleResult | undefined;

	let currentSection = 'HEADER';
	let currentSubSection = '';
	let currentAirBaseWave: ParsedAirBaseWave | null = null;
	let pendingAttackerLine: string | null = null;
	let hadForcesBeforeNight = false;
	const nightEnemyTableHps = {
		main: {} as Record<number, number>,
		escort: {} as Record<number, number>
	};
	const nightFriendTableHps = {
		main: {} as Record<number, number>,
		escort: {} as Record<number, number>
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		if (line.startsWith('◆') && line.endsWith('◆')) {
			const title = line.slice(1, -1).trim();
			if (title.includes('夜戦') && !title.includes('昼戦')) {
				if (currentSection !== 'NIGHT_BATTLE') {
					hadForcesBeforeNight = forces.friendMain.length > 0 || forces.enemyMain.length > 0;
				}
				currentSection = 'NIGHT_BATTLE';
				if (!nightBattle) {
					nightBattle = { attacks: [] };
				}
			} else if (title.includes('戦闘結果')) {
				currentSection = 'RESULT';
			} else {
				currentSection = 'DAY_BATTLE';
				header.battleTitle = title;
				if (title.includes('機動部隊')) header.combinedType = 1;
				else if (title.includes('水上部隊')) header.combinedType = 2;
				else if (title.includes('輸送部隊')) header.combinedType = 3;
			}
			currentSubSection = '';
			pendingAttackerLine = null;
			continue;
		}

		if (line.startsWith('《') && line.endsWith('》')) {
			const phaseTitle = line.slice(1, -1).trim();
			currentSubSection = phaseTitle;
			pendingAttackerLine = null;
			continue;
		}

		if (currentSection === 'HEADER') {
			if (!header.mapAreaName) {
				const mapMatch = line.match(
					/^(.+?)\s*\((\d+)-(\d+)\)(?:\s*\[([甲乙丙丁])\])?\s*セル:\s*(\d+)(?:\s*\((ボス)\))?/
				);
				if (mapMatch) {
					header.mapAreaName = mapMatch[1].trim();
					header.world = Number(mapMatch[2]);
					header.mapnum = Number(mapMatch[3]);
					header.difficulty = mapMatch[4];
					header.cell = Number(mapMatch[5]);
					header.isBoss = !!mapMatch[6];
					continue;
				}
			}

			const gaugeMatch = line.match(/^(?:#(\d+)\s+)?(HP|TP):\s*(\d+)\s*\/\s*(\d+)/);
			if (gaugeMatch) {
				header.gaugeNum = gaugeMatch[1] ? Number(gaugeMatch[1]) : undefined;
				header.gaugeType = gaugeMatch[2] as 'HP' | 'TP';
				header.currentGauge = Number(gaugeMatch[3]);
				header.maxGauge = Number(gaugeMatch[4]);
				continue;
			}

			const defeatMatch = line.match(/^撃破:\s*(\d+)\s*\/\s*(\d+)\s*回/);
			if (defeatMatch) {
				header.gaugeType = '撃破';
				header.currentGauge = Number(defeatMatch[1]);
				header.maxGauge = Number(defeatMatch[2]);
				continue;
			}

			if (line && !header.enemyFleetName && !line.startsWith('#') && !line.startsWith('◆')) {
				header.enemyFleetName = line;
				continue;
			}
		}

		if (currentSubSection.startsWith('戦力') || currentSubSection === '友軍艦隊') {
			// Why not overwrite friend/enemy fleets in night battle: initial battle state must preserve day-start HPs.
			const isNightSection = currentSection === 'NIGHT_BATTLE';
			const shouldSkipForces = isNightSection && hadForcesBeforeNight;

			if (line.startsWith('〈')) {
				const tagMatch = line.match(/^〈([^〉]+)〉/);
				if (tagMatch) {
					const fleetHeader = tagMatch[1].trim();
					if (fleetHeader.includes('味方主力艦隊') || fleetHeader.includes('味方艦隊')) {
						currentSubSection = '戦力_味方主力';
					} else if (fleetHeader.includes('味方随伴艦隊')) {
						currentSubSection = '戦力_味方随伴';
						if (!forces.friendEscort) forces.friendEscort = [];
					} else if (fleetHeader.includes('敵主力艦隊') || fleetHeader.includes('敵艦隊')) {
						currentSubSection = '戦力_敵主力';
					} else if (fleetHeader.includes('敵随伴艦隊')) {
						currentSubSection = '戦力_敵随伴';
						if (!forces.enemyEscort) forces.enemyEscort = [];
					} else if (fleetHeader.includes('基地航空隊')) {
						currentSubSection = '戦力_基地航空隊';
					} else if (fleetHeader.includes('支援艦隊')) {
						currentSubSection = '戦力_支援艦隊';
						forces.supportFleet = [];
					} else if (fleetHeader.includes('友軍艦隊') || fleetHeader === '友軍') {
						currentSubSection = '戦力_友軍';
					}
					continue;
				}
			}

			if (
				currentSubSection === '戦力_基地航空隊' &&
				(!shouldSkipForces || forces.airBases.length === 0)
			) {
				const baseMatch = line.match(
					/^(.+?)\s*\[(.+?)\](?:\s*制空戦力\s*(\d+)(?:\s*～\s*(\d+))?)?/
				);
				if (baseMatch) {
					const name = baseMatch[1].trim();
					const action = baseMatch[2].trim();
					const actionId = ACTION_KIND_MAP[action] ?? 1;
					const airPowerMin = baseMatch[3] ? Number(baseMatch[3]) : undefined;
					const airPowerMax = baseMatch[4] ? Number(baseMatch[4]) : airPowerMin;

					let squadrons: ParsedAirBaseSquadron[] = [];
					if (
						i + 1 < lines.length &&
						(lines[i + 1].startsWith('　') || lines[i + 1].startsWith(' '))
					) {
						const nextLine = lines[i + 1].trim();
						const parsedEquips = parseEquipmentsLine(nextLine, false);
						squadrons = parsedEquips.map((e) => ({
							name: e.name,
							stars: e.stars,
							ace: e.ace
						}));
						i++;
					}

					forces.airBases.push({
						name,
						action,
						actionId,
						airPowerMin,
						airPowerMax,
						squadrons
					});
					continue;
				}
			}

			const enemyShipMatch = line.match(
				/^#(\d+):\s*ID:(\d+)\s+([^\s]+)\s+(.+?)\s+Lv\.\s*(\d+)\s+HP:\s*(\d+)\s*\/\s*(\d+)(?:\s*-\s*火力(\d+),\s*雷装(\d+),\s*対空(\d+),\s*装甲(\d+))?/
			);
			if (enemyShipMatch) {
				const index = Number(enemyShipMatch[1]);
				const initialHp = Number(enemyShipMatch[6]);
				if (isNightSection) {
					if (currentSubSection === '戦力_敵主力') {
						nightEnemyTableHps.main[index] = initialHp;
					} else if (currentSubSection === '戦力_敵随伴') {
						nightEnemyTableHps.escort[index] = initialHp;
					}
				}

				// How: allow enemy fleet parsing during day battles or night-only battles when forces were not loaded prior to night
				// Why not check array length per line: pushing items mutates array length during iteration, skipping subsequent ships
				if (!shouldSkipForces) {
					const shipId = Number(enemyShipMatch[2]);
					const shipType = enemyShipMatch[3];
					const name = enemyShipMatch[4].trim();
					const level = Number(enemyShipMatch[5]);
					const maxHp = Number(enemyShipMatch[7]);
					const firepower = enemyShipMatch[8] ? Number(enemyShipMatch[8]) : 0;
					const torpedo = enemyShipMatch[9] ? Number(enemyShipMatch[9]) : 0;
					const aa = enemyShipMatch[10] ? Number(enemyShipMatch[10]) : 0;
					const armor = enemyShipMatch[11] ? Number(enemyShipMatch[11]) : 0;

					let equipments: ParsedEquipment[] = [];
					if (
						i + 1 < lines.length &&
						(lines[i + 1].startsWith('　') || lines[i + 1].startsWith(' '))
					) {
						equipments = parseEquipmentsLine(lines[i + 1], true);
						i++;
					}

					const shipObj: ParsedShip = {
						index,
						shipId,
						shipType,
						name,
						level,
						initialHp,
						maxHp,
						firepower,
						torpedo,
						aa,
						armor,
						equipments
					};

					if (currentSubSection === '戦力_敵主力') {
						forces.enemyMain.push(shipObj);
					} else if (currentSubSection === '戦力_敵随伴') {
						if (!forces.enemyEscort) forces.enemyEscort = [];
						forces.enemyEscort.push(shipObj);
					}
				}
				continue;
			}

			// Why not exact match 友軍艦隊: headers may vary as 〈友軍艦隊〉, 《友軍艦隊》, or 《友軍》
			const isFriendlySection = currentSubSection.includes('友軍');

			const friendShipMatch = line.match(
				/^#(\d+):\s*([^\s]+)\s+(.+?)\s+Lv\.\s*(\d+)\s+HP:\s*(\d+)\s*\/\s*(\d+)(?:\s*-\s*火力(\d+),\s*雷装(\d+),\s*対空(\d+),\s*装甲(\d+))?(?:\s*\((退避中)\))?/
			);
			if (friendShipMatch) {
				const index = Number(friendShipMatch[1]);
				const initialHp = Number(friendShipMatch[5]);
				if (isNightSection && !isFriendlySection) {
					if (currentSubSection === '戦力_味方主力') {
						nightFriendTableHps.main[index] = initialHp;
					} else if (currentSubSection === '戦力_味方随伴') {
						nightFriendTableHps.escort[index] = initialHp;
					}
				}

				if (isFriendlySection || !shouldSkipForces) {
					const shipType = friendShipMatch[2];
					const name = friendShipMatch[3].trim();
					const level = Number(friendShipMatch[4]);
					const maxHp = Number(friendShipMatch[6]);
					const firepower = friendShipMatch[7] ? Number(friendShipMatch[7]) : 0;
					const torpedo = friendShipMatch[8] ? Number(friendShipMatch[8]) : 0;
					const aa = friendShipMatch[9] ? Number(friendShipMatch[9]) : 0;
					const armor = friendShipMatch[10] ? Number(friendShipMatch[10]) : 0;
					const isEscaped = !!friendShipMatch[11];

					let equipments: ParsedEquipment[] = [];
					if (
						i + 1 < lines.length &&
						(lines[i + 1].startsWith('　') || lines[i + 1].startsWith(' '))
					) {
						equipments = parseEquipmentsLine(lines[i + 1], false);
						i++;
					}

					const shipObj: ParsedShip = {
						index,
						shipType,
						name,
						level,
						initialHp,
						maxHp,
						firepower,
						torpedo,
						aa,
						armor,
						isEscaped,
						equipments
					};

					if (currentSubSection === '戦力_味方主力') {
						forces.friendMain.push(shipObj);
					} else if (currentSubSection === '戦力_味方随伴') {
						if (!forces.friendEscort) forces.friendEscort = [];
						forces.friendEscort.push(shipObj);
					} else if (isFriendlySection) {
						friendlyFleet.push(shipObj);
					}
				}
				continue;
			}
		}

		if (currentSubSection === '索敵') {
			if (!searching) {
				searching = {
					formationFriend: 1,
					formationEnemy: 1,
					engagementForm: 1,
					searchingFriend: 1,
					searchingEnemy: 1
				};
			}

			const formationMatch = line.match(/自軍陣形:\s*([^\s/]+)\s*\/\s*敵軍陣形:\s*([^\s/]+)/);
			if (formationMatch) {
				searching.formationFriend = FORMATION_MAP[formationMatch[1].trim()] ?? 1;
				searching.formationEnemy = FORMATION_MAP[formationMatch[2].trim()] ?? 1;
				continue;
			}

			const engagementMatch = line.match(/交戦形態:\s*(.+)/);
			if (engagementMatch) {
				searching.engagementForm = ENGAGEMENT_MAP[engagementMatch[1].trim()] ?? 1;
				continue;
			}

			const searchingMatch = line.match(/自軍索敵:\s*([^\s/]+)\s*\/\s*敵軍索敵:\s*([^\s/]+)/);
			if (searchingMatch) {
				searching.searchingFriend = SEARCHING_MAP[searchingMatch[1].trim()] ?? 1;
				searching.searchingEnemy = SEARCHING_MAP[searchingMatch[2].trim()] ?? 1;
				continue;
			}

			const smokeMatch = line.match(/煙幕展開:\s*(\d+)重/);
			if (smokeMatch) {
				searching.smokeCount = Number(smokeMatch[1]);
				continue;
			}

			if (line.includes('阻塞気球展開対象マス')) {
				searching.isBalloonCell = true;
				continue;
			}

			if (line.includes('環礁マス')) {
				searching.isAtollCell = true;
				continue;
			}
		}

		if (currentSubSection === '基地航空隊攻撃') {
			const waveMatch = line.match(/〈第(\d+)波〉/);
			if (waveMatch) {
				currentAirBaseWave = {
					waveIndex: Number(waveMatch[1]),
					squadrons: [],
					attacks: []
				};
				phases.airBaseAttacks.push(currentAirBaseWave);
				continue;
			}

			if (currentAirBaseWave && line.startsWith('味方基地航空隊 参加中隊:')) {
				if (
					i + 1 < lines.length &&
					(lines[i + 1].startsWith('　') || lines[i + 1].startsWith(' '))
				) {
					const items = lines[i + 1].trim().split(/,\s*/);
					for (const it of items) {
						const match = it.match(/^(.+?)\s*x\s*(\d+)$/);
						if (match) {
							currentAirBaseWave.squadrons.push({
								name: match[1].trim(),
								count: Number(match[2])
							});
						}
					}
					i++;
				}
				continue;
			}

			if (currentAirBaseWave && line.startsWith('Stage1:')) {
				const seikuStr = line.replace('Stage1:', '').trim();
				if (!currentAirBaseWave.stage1) currentAirBaseWave.stage1 = {};
				currentAirBaseWave.stage1.airSuperiority = AIR_SUPERIORITY_MAP[seikuStr] ?? 0;
				continue;
			}

			if (currentAirBaseWave && line.startsWith('Stage2:')) {
				if (!currentAirBaseWave.stage2) currentAirBaseWave.stage2 = {};
				continue;
			}

			const lossMatch = line.match(/^(自軍|敵軍):\s*-(\d+)\/(\d+)/);
			if (lossMatch && currentAirBaseWave) {
				const isFriend = lossMatch[1] === '自軍';
				const lost = Number(lossMatch[2]);
				const total = Number(lossMatch[3]);
				const targetStage = currentAirBaseWave.stage2
					? currentAirBaseWave.stage2
					: currentAirBaseWave.stage1;
				if (targetStage) {
					if (isFriend) {
						targetStage.friendLost = lost;
						targetStage.friendTotal = total;
					} else {
						targetStage.enemyLost = lost;
						targetStage.enemyTotal = total;
					}
				}
				continue;
			}

			const touchMatch = line.match(/^(自軍|敵軍)触接:\s*(.+)/);
			if (touchMatch && currentAirBaseWave?.stage1) {
				if (touchMatch[1] === '自軍') currentAirBaseWave.stage1.touchFriend = touchMatch[2].trim();
				else currentAirBaseWave.stage1.touchEnemy = touchMatch[2].trim();
				continue;
			}

			const attackTargetMatch = line.match(/^基地航空隊\s*第\d+波\s*→\s*(.+?)\s*#(\d+)$/);
			if (attackTargetMatch) {
				pendingAttackerLine = line;
				continue;
			}

			if (pendingAttackerLine && line.startsWith('[')) {
				const attackTarget = pendingAttackerLine.match(
					/^基地航空隊\s*第\d+波\s*→\s*(.+?)\s*#(\d+)$/
				);
				if (attackTarget && currentAirBaseWave) {
					const targetName = attackTarget[1].trim();
					const targetIndex = Number(attackTarget[2]);
					const action = parseActionDamageLine(
						line,
						'基地航空隊',
						0,
						targetName,
						targetIndex,
						true
					);
					currentAirBaseWave.attacks.push(action);
				}
				pendingAttackerLine = null;
				continue;
			}
		}

		if (currentSubSection === '航空戦') {
			if (!phases.airBattle) {
				phases.airBattle = { attacks: [] };
			}

			if (line.startsWith('Stage1:')) {
				const seikuStr = line.replace('Stage1:', '').trim();
				if (!phases.airBattle.stage1) phases.airBattle.stage1 = {};
				phases.airBattle.stage1.airSuperiority = AIR_SUPERIORITY_MAP[seikuStr] ?? 0;
				continue;
			}

			if (line.startsWith('Stage2:')) {
				if (!phases.airBattle.stage2) phases.airBattle.stage2 = {};
				const aaciMatch = line.match(
					/対空カットイン\(\s*([^,]+?)(?:\s+Lv\.\s*(\d+))?,\s*([^(]+?)\((\d+)\)\s*\)/
				);
				if (aaciMatch) {
					phases.airBattle.stage2.antiAirCutIn = {
						shipName: aaciMatch[1].trim(),
						shipLevel: aaciMatch[2] ? Number(aaciMatch[2]) : undefined,
						kindName: aaciMatch[3].trim(),
						kindId: Number(aaciMatch[4])
					};
				}
				continue;
			}

			const lossMatch = line.match(/^(自軍|敵軍):\s*-(\d+)\/(\d+)/);
			if (lossMatch) {
				const isFriend = lossMatch[1] === '自軍';
				const lost = Number(lossMatch[2]);
				const total = Number(lossMatch[3]);
				const targetStage = phases.airBattle.stage2
					? phases.airBattle.stage2
					: phases.airBattle.stage1;
				if (targetStage) {
					if (isFriend) {
						targetStage.friendLost = lost;
						targetStage.friendTotal = total;
					} else {
						targetStage.enemyLost = lost;
						targetStage.enemyTotal = total;
					}
				}
				continue;
			}

			const touchMatch = line.match(/^(自軍|敵軍)触接:\s*(.+)/);
			if (touchMatch && phases.airBattle.stage1) {
				if (touchMatch[1] === '自軍') phases.airBattle.stage1.touchFriend = touchMatch[2].trim();
				else phases.airBattle.stage1.touchEnemy = touchMatch[2].trim();
				continue;
			}

			const airAttackHeader = line.match(/^(自軍航空隊|敵軍航空隊)\s*→\s*(.+?)\s*#(\d+)$/);
			if (airAttackHeader) {
				pendingAttackerLine = line;
				continue;
			}

			if (pendingAttackerLine && line.startsWith('[')) {
				const match = pendingAttackerLine.match(/^(自軍航空隊|敵軍航空隊)\s*→\s*(.+?)\s*#(\d+)$/);
				if (match) {
					const isFriend = match[1] === '自軍航空隊';
					const targetName = match[2].trim();
					const targetIndex = Number(match[3]);
					const action = parseActionDamageLine(
						line,
						match[1],
						0,
						targetName,
						targetIndex,
						isFriend
					);
					phases.airBattle.attacks.push(action);
				}
				pendingAttackerLine = null;
				continue;
			}
		}

		if (currentSubSection === '支援攻撃') {
			if (!phases.supportAttack) {
				phases.supportAttack = { attacks: [] };
			}

			if (line.startsWith('〈支援艦隊〉')) {
				if (!forces.supportFleet) forces.supportFleet = [];
				continue;
			}

			const supportShipMatch = line.match(
				/^#(\d+):\s*([^\s]+)\s+(.+?)\s+Lv\.\s*(\d+)(?:\s*-\s*火力(\d+),\s*雷装(\d+),\s*対空(\d+),\s*装甲(\d+))?/
			);
			if (supportShipMatch) {
				const index = Number(supportShipMatch[1]);
				const shipType = supportShipMatch[2];
				const name = supportShipMatch[3].trim();
				const level = Number(supportShipMatch[4]);
				const firepower = supportShipMatch[5] ? Number(supportShipMatch[5]) : 0;
				const torpedo = supportShipMatch[6] ? Number(supportShipMatch[6]) : 0;
				const aa = supportShipMatch[7] ? Number(supportShipMatch[7]) : 0;
				const armor = supportShipMatch[8] ? Number(supportShipMatch[8]) : 0;

				let equipments: ParsedEquipment[] = [];
				if (
					i + 1 < lines.length &&
					(lines[i + 1].startsWith('　') || lines[i + 1].startsWith(' '))
				) {
					equipments = parseEquipmentsLine(lines[i + 1], false);
					i++;
				}

				if (!forces.supportFleet) forces.supportFleet = [];
				forces.supportFleet.push({
					index,
					shipType,
					name,
					level,
					initialHp: 0,
					maxHp: 0,
					firepower,
					torpedo,
					aa,
					armor,
					equipments
				});
				continue;
			}

			const supportTargetMatch = line.match(/^支援艦隊\s*→\s*(.+?)\s*#(\d+)$/);
			if (supportTargetMatch) {
				pendingAttackerLine = line;
				continue;
			}

			if (pendingAttackerLine && line.startsWith('[')) {
				const match = pendingAttackerLine.match(/^支援艦隊\s*→\s*(.+?)\s*#(\d+)$/);
				if (match) {
					const targetName = match[1].trim();
					const targetIndex = Number(match[2]);
					const action = parseActionDamageLine(line, '支援艦隊', 0, targetName, targetIndex, true);
					phases.supportAttack.attacks.push(action);
				}
				pendingAttackerLine = null;
				continue;
			}
		}

		if (
			currentSubSection.includes('先制対潜') ||
			currentSubSection === '先制雷撃' ||
			currentSubSection === '第一次砲撃戦' ||
			currentSubSection === '第二次砲撃戦' ||
			currentSubSection === '第三次砲撃戦' ||
			currentSubSection === '砲撃戦' ||
			currentSubSection === '雷撃戦' ||
			currentSubSection === '夜戦'
		) {
			const attackPairMatch = line.match(/^(.+?)\s*#(\d+)\s*→\s*(.+?)\s*#(\d+)$/);
			if (attackPairMatch) {
				pendingAttackerLine = line;
				continue;
			}

			if (pendingAttackerLine) {
				const pair = pendingAttackerLine.match(/^(.+?)\s*#(\d+)\s*→\s*(.+?)\s*#(\d+)$/);
				if (pair) {
					const attackerName = pair[1].trim();
					const attackerIndex = Number(pair[2]);
					const targetName = pair[3].trim();
					const targetIndex = Number(pair[4]);

					const isFriend = isShipFriend(attackerName, forces);
					const action = parseActionDamageLine(
						line,
						attackerName,
						attackerIndex,
						targetName,
						targetIndex,
						isFriend
					);

					if (currentSubSection.includes('先制対潜')) phases.openingTaisen.push(action);
					else if (currentSubSection === '先制雷撃') phases.openingRaigeki.push(action);
					else if (currentSubSection === '第一次砲撃戦') phases.hougeki1.push(action);
					else if (currentSubSection === '第二次砲撃戦') phases.hougeki2.push(action);
					else if (currentSubSection === '第三次砲撃戦') phases.hougeki3.push(action);
					else if (currentSubSection === '砲撃戦') phases.hougeki1.push(action);
					else if (currentSubSection === '雷撃戦') phases.raigeki.push(action);
					else if (currentSubSection === '夜戦') {
						if (!nightBattle) nightBattle = { attacks: [] };
						nightBattle.attacks.push(action);
					}
				}
				pendingAttackerLine = null;
				continue;
			}
		}

		if (currentSubSection === '友軍艦隊援護') {
			if (!friendlyBattle) friendlyBattle = { attacks: [] };

			const slFriendMatch = line.match(/自軍探照灯照射:\s*(.+?)\s*#(\d+)/);
			if (slFriendMatch) {
				friendlyBattle.searchlightFriend = {
					name: slFriendMatch[1].trim(),
					index: Number(slFriendMatch[2])
				};
				continue;
			}

			const slEnemyMatch = line.match(/敵軍探照灯照射:\s*(.+?)\s*#(\d+)/);
			if (slEnemyMatch) {
				friendlyBattle.searchlightEnemy = {
					name: slEnemyMatch[1].trim(),
					index: Number(slEnemyMatch[2])
				};
				continue;
			}

			const flFriendMatch = line.match(/自軍照明弾投射:\s*(.+?)\s*#(\d+)/);
			if (flFriendMatch) {
				friendlyBattle.flareFriend = {
					name: flFriendMatch[1].trim(),
					index: Number(flFriendMatch[2])
				};
				continue;
			}

			const flEnemyMatch = line.match(/敵軍照明弾投射:\s*(.+?)\s*#(\d+)/);
			if (flEnemyMatch) {
				friendlyBattle.flareEnemy = {
					name: flEnemyMatch[1].trim(),
					index: Number(flEnemyMatch[2])
				};
				continue;
			}

			const attackPairMatch = line.match(/^(.+?)\s*#(\d+)\s*→\s*(.+?)\s*#(\d+)$/);
			if (attackPairMatch) {
				pendingAttackerLine = line;
				continue;
			}

			if (pendingAttackerLine) {
				const pair = pendingAttackerLine.match(/^(.+?)\s*#(\d+)\s*→\s*(.+?)\s*#(\d+)$/);
				if (pair) {
					const attackerName = pair[1].trim();
					const attackerIndex = Number(pair[2]);
					const targetName = pair[3].trim();
					const targetIndex = Number(pair[4]);

					// How: identify whether attacker is friendly fleet ship or enemy counter-attacking friendly fleet
					// Why not rely on isShipFriend: friendly fleet ships are not in forces.friendMain or friendEscort
					const isAttackerFriendly = friendlyFleet.some(
						(s) => s.name === attackerName || attackerName.includes(s.name)
					);
					const isTargetFriendly = friendlyFleet.some(
						(s) => s.name === targetName || targetName.includes(s.name)
					);
					const isFriendAttacker = isAttackerFriendly ? true : isTargetFriendly ? false : true;

					const action = parseActionDamageLine(
						line,
						attackerName,
						attackerIndex,
						targetName,
						targetIndex,
						isFriendAttacker
					);
					friendlyBattle.attacks.push(action);
				}
				pendingAttackerLine = null;
				continue;
			}
		}

		if (currentSubSection === '夜戦開始') {
			if (!nightBattle) nightBattle = { attacks: [] };

			const touchFriendMatch = line.match(/自軍夜間触接:\s*(.+)/);
			if (touchFriendMatch) {
				nightBattle.touchFriend = touchFriendMatch[1].trim();
				continue;
			}

			const touchEnemyMatch = line.match(/敵軍夜間触接:\s*(.+)/);
			if (touchEnemyMatch) {
				nightBattle.touchEnemy = touchEnemyMatch[1].trim();
				continue;
			}

			const slFriendMatch = line.match(/自軍探照灯照射:\s*(.+?)\s*#(\d+)/);
			if (slFriendMatch) {
				nightBattle.searchlightFriend = {
					name: slFriendMatch[1].trim(),
					index: Number(slFriendMatch[2])
				};
				continue;
			}

			const slEnemyMatch = line.match(/敵軍探照灯照射:\s*(.+?)\s*#(\d+)/);
			if (slEnemyMatch) {
				nightBattle.searchlightEnemy = {
					name: slEnemyMatch[1].trim(),
					index: Number(slEnemyMatch[2])
				};
				continue;
			}

			const flFriendMatch = line.match(/自軍照明弾投射:\s*(.+?)\s*#(\d+)/);
			if (flFriendMatch) {
				nightBattle.flareFriend = {
					name: flFriendMatch[1].trim(),
					index: Number(flFriendMatch[2])
				};
				continue;
			}

			const flEnemyMatch = line.match(/敵軍照明弾投射:\s*(.+?)\s*#(\d+)/);
			if (flEnemyMatch) {
				nightBattle.flareEnemy = {
					name: flEnemyMatch[1].trim(),
					index: Number(flEnemyMatch[2])
				};
				continue;
			}
		}

		if (currentSection === 'RESULT') {
			if (!result) {
				result = {
					rank: 'D',
					admiralExp: 0,
					baseExp: 0
				};
			}

			const rankMatch = line.match(/ランク:\s*([SABCDE])/i);
			if (rankMatch) {
				result.rank = rankMatch[1].toUpperCase();
				continue;
			}

			const mvpMainMatch = line.match(/MVP(?:\(主力艦隊\))?:\s*(.+)/);
			if (mvpMainMatch && !line.includes('随伴艦隊')) {
				result.mvpMain = mvpMainMatch[1].trim();
				continue;
			}

			const mvpEscortMatch = line.match(/MVP\(随伴艦隊\):\s*(.+)/);
			if (mvpEscortMatch) {
				result.mvpEscort = mvpEscortMatch[1].trim();
				continue;
			}

			const admExpMatch = line.match(/提督経験値:\s*\+(\d+)/);
			if (admExpMatch) {
				result.admiralExp = Number(admExpMatch[1]);
				continue;
			}

			const baseExpMatch = line.match(/艦娘基本経験値:\s*\+(\d+)/);
			if (baseExpMatch) {
				result.baseExp = Number(baseExpMatch[1]);
				continue;
			}

			if (line.startsWith('ドロップ：') || line.startsWith('ドロップ:')) {
				if (
					i + 1 < lines.length &&
					(lines[i + 1].startsWith('　') || lines[i + 1].startsWith(' '))
				) {
					const dropLine = lines[i + 1].trim();
					if (dropLine !== '(なし)') {
						const parts = dropLine.split(/\s+/);
						if (parts.length >= 2) {
							result.dropType = parts[0];
							result.dropName = parts.slice(1).join(' ');
						} else {
							result.dropName = dropLine;
						}
					}
					i++;
				}
				continue;
			}
		}
	}

	restoreFriendlyInitialHp(friendlyFleet, friendlyBattle);
	const nightInitialEnemyHps = computeNightInitialEnemyHps(
		forces,
		friendlyBattle,
		nightBattle,
		nightEnemyTableHps
	);
	const nightInitialFriendHps = computeNightInitialFriendHps(
		forces,
		nightFriendTableHps,
		nightBattle
	);

	return {
		header,
		forces: {
			...forces,
			friendlyFleet: friendlyFleet.length > 0 ? friendlyFleet : undefined
		},
		searching,
		phases,
		nightBattle,
		friendlyFleet: friendlyFleet.length > 0 ? friendlyFleet : undefined,
		friendlyBattle,
		result,
		nightInitialEnemyHps,
		nightInitialFriendHps
	};
}

function restoreFriendlyInitialHp(
	friendlyFleet: ParsedShip[],
	friendlyBattle: ParsedFriendlyBattle | undefined
) {
	// How: restore entry HP of friendly fleet ships from beforeHP of first incoming damage action or accumulated damage
	// Why not accept table HP directly: ElectronicObserver logs may record post-friendly-battle remaining HP in the fleet table
	if (!friendlyFleet || friendlyFleet.length === 0) return;

	for (const ship of friendlyFleet) {
		if (!friendlyBattle || !friendlyBattle.attacks) {
			if (ship.initialHp === 0 && ship.maxHp > 0) ship.initialHp = ship.maxHp;
			continue;
		}

		const incomingActions = friendlyBattle.attacks.filter(
			(a) =>
				!a.isFriendAttacker &&
				(a.targetIndex === ship.index ||
					a.targetName.includes(ship.name) ||
					ship.name.includes(a.targetName))
		);

		if (incomingActions.length > 0) {
			const firstBeforeHp = incomingActions[0].beforeHp;
			if (firstBeforeHp !== undefined && firstBeforeHp > 0) {
				ship.initialHp = firstBeforeHp;
			} else {
				const totalDamage = incomingActions.reduce(
					(sum, a) => sum + a.damages.reduce((d1, d2) => d1 + d2, 0),
					0
				);
				ship.initialHp = Math.min(ship.maxHp, ship.initialHp + totalDamage);
			}
		} else if (ship.initialHp === 0 && ship.maxHp > 0) {
			ship.initialHp = ship.maxHp;
		}
	}
}

function computeNightInitialEnemyHps(
	forces: ParsedForces,
	friendlyBattle: ParsedFriendlyBattle | undefined,
	nightBattle: ParsedNightBattle | undefined,
	nightEnemyTableHps: { main: Record<number, number>; escort: Record<number, number> }
): { main: number[]; escort?: number[] } | undefined {
	// How: reconstruct enemy HP at night entry by inspecting first incoming damage beforeHp in friendly and night phases, or table HP
	// Why not use day-start HP directly: enemies took daytime damage; their night entry HP must precede friendly fleet attacks
	if (!forces.enemyMain || forces.enemyMain.length === 0) return undefined;

	const mainHps: number[] = forces.enemyMain.map((s, idx) => {
		const tableHp = nightEnemyTableHps.main[s.index] ?? nightEnemyTableHps.main[idx + 1];
		return tableHp !== undefined ? tableHp : s.initialHp;
	});

	const escortHps: number[] | undefined = forces.enemyEscort
		? forces.enemyEscort.map((s, idx) => {
				const tableHp =
					nightEnemyTableHps.escort[s.index] ??
					nightEnemyTableHps.escort[s.index >= 7 ? s.index : s.index + 6] ??
					nightEnemyTableHps.escort[idx + 1];
				return tableHp !== undefined ? tableHp : s.initialHp;
			})
		: undefined;

	const allNightAttacks: ParsedAttackAction[] = [
		...(friendlyBattle?.attacks ?? []),
		...(nightBattle?.attacks ?? [])
	];

	const firstMainBeforeHp: Record<number, number> = {};
	const firstEscortBeforeHp: Record<number, number> = {};

	for (const act of allNightAttacks) {
		if (act.isFriendAttacker) {
			const dfIdx = act.targetIndex; // 1-indexed (1..6: main, 7..12: escort)
			if (dfIdx >= 1 && dfIdx <= 6) {
				const idx = dfIdx - 1;
				if (
					firstMainBeforeHp[idx] === undefined &&
					act.beforeHp !== undefined &&
					act.beforeHp > 0
				) {
					firstMainBeforeHp[idx] = act.beforeHp;
				}
			} else if (dfIdx >= 7 && dfIdx <= 12) {
				const idx = dfIdx - 7;
				if (
					firstEscortBeforeHp[idx] === undefined &&
					act.beforeHp !== undefined &&
					act.beforeHp > 0
				) {
					firstEscortBeforeHp[idx] = act.beforeHp;
				}
			}
		}
	}

	for (const [idxStr, hp] of Object.entries(firstMainBeforeHp)) {
		const idx = Number(idxStr);
		if (idx >= 0 && idx < mainHps.length) {
			mainHps[idx] = hp;
		}
	}

	if (escortHps) {
		for (const [idxStr, hp] of Object.entries(firstEscortBeforeHp)) {
			const idx = Number(idxStr);
			if (idx >= 0 && idx < escortHps.length) {
				escortHps[idx] = hp;
			}
		}
	}

	return {
		main: mainHps,
		escort: escortHps
	};
}

function computeNightInitialFriendHps(
	forces: ParsedForces,
	nightFriendTableHps: { main: Record<number, number>; escort: Record<number, number> },
	nightBattle: ParsedNightBattle | undefined
): { main: number[]; escort?: number[] } | undefined {
	// How: determine friendly fleet HPs at night start from night table or night attack beforeHp
	// Why not use day-start HP directly: friendly ships sustained damage during daytime phases before midnight battle
	if (!forces.friendMain || forces.friendMain.length === 0) return undefined;

	const mainHps: number[] = forces.friendMain.map((s, idx) => {
		const tableHp = nightFriendTableHps.main[s.index] ?? nightFriendTableHps.main[idx + 1];
		return tableHp !== undefined ? tableHp : s.initialHp;
	});

	const escortHps: number[] | undefined = forces.friendEscort
		? forces.friendEscort.map((s, idx) => {
				const tableHp =
					nightFriendTableHps.escort[s.index] ??
					nightFriendTableHps.escort[s.index >= 7 ? s.index : s.index + 6] ??
					nightFriendTableHps.escort[idx + 1];
				return tableHp !== undefined ? tableHp : s.initialHp;
			})
		: undefined;

	if (nightBattle?.attacks) {
		for (const act of nightBattle.attacks) {
			if (!act.isFriendAttacker) {
				const dfIdx = act.targetIndex;
				if (dfIdx >= 1 && dfIdx <= 6) {
					const idx = dfIdx - 1;
					if (
						act.beforeHp !== undefined &&
						act.beforeHp > 0 &&
						nightFriendTableHps.main[dfIdx] === undefined
					) {
						mainHps[idx] = act.beforeHp;
					}
				} else if (dfIdx >= 7 && dfIdx <= 12) {
					const idx = dfIdx - 7;
					if (
						escortHps &&
						act.beforeHp !== undefined &&
						act.beforeHp > 0 &&
						nightFriendTableHps.escort[dfIdx] === undefined
					) {
						escortHps[idx] = act.beforeHp;
					}
				}
			}
		}
	}

	return {
		main: mainHps,
		escort: escortHps
	};
}

function isShipFriend(name: string, forces: ParsedForces): boolean {
	const inFriendMain = forces.friendMain.some(
		(s) => name.includes(s.name) || s.name.includes(name)
	);
	if (inFriendMain) return true;
	const inFriendEscort = forces.friendEscort?.some(
		(s) => name.includes(s.name) || s.name.includes(name)
	);
	if (inFriendEscort) return true;
	const inFriendly = forces.friendlyFleet?.some(
		(s) => name.includes(s.name) || s.name.includes(name)
	);
	if (inFriendly) return true;
	const inEnemyMain = forces.enemyMain.some((s) => name.includes(s.name) || s.name.includes(name));
	if (inEnemyMain) return false;
	const inEnemyEscort = forces.enemyEscort?.some(
		(s) => name.includes(s.name) || s.name.includes(name)
	);
	if (inEnemyEscort) return false;
	return true;
}

function parseActionDamageLine(
	line: string,
	attackerName: string,
	attackerIndex: number,
	targetName: string,
	targetIndex: number,
	isFriendAttacker: boolean
): ParsedAttackAction {
	let attackKind: string | undefined;
	let rest = line.trim();

	const kindMatch = rest.match(/^\[([^\]]+)\]\s*/);
	if (kindMatch) {
		attackKind = kindMatch[1];
		rest = rest.slice(kindMatch[0].length).trim();
	}

	let isGuard = false;
	if (rest.includes('<かばう>')) {
		isGuard = true;
		rest = rest.replace(/<かばう>\s*/g, '').trim();
	}

	let beforeHp: number | undefined;
	let afterHp: number | undefined;
	const hpTransitionMatch = rest.match(/\(\s*(\d+)\s*(?:→|->)\s*(\d+)\s*\)/);
	if (hpTransitionMatch) {
		beforeHp = Number(hpTransitionMatch[1]);
		afterHp = Number(hpTransitionMatch[2]);
		rest = rest.replace(/\(\s*(\d+)\s*(?:→|->)\s*(\d+)\s*\)/, '').trim();
	}

	const damages: number[] = [];
	const criticalTypes: number[] = [];

	const parts = rest.split(/\s*,\s*/);
	for (const part of parts) {
		const p = part.trim();
		if (!p) continue;
		if (p === 'Miss') {
			damages.push(0);
			criticalTypes.push(0);
		} else {
			const critMatch = p.match(/^(\d+)\s*Critical!/i);
			if (critMatch) {
				damages.push(Number(critMatch[1]));
				criticalTypes.push(2);
				continue;
			}
			const dmgMatch = p.match(/^(\d+)\s*(?:Dmg|Hit)?/i);
			if (dmgMatch) {
				damages.push(Number(dmgMatch[1]));
				criticalTypes.push(1);
				continue;
			}
		}
	}

	if (damages.length === 0) {
		damages.push(0);
		criticalTypes.push(0);
	}

	return {
		attackerName,
		attackerIndex,
		isFriendAttacker,
		targetName,
		targetIndex,
		isGuard,
		damages,
		criticalTypes,
		attackKind,
		beforeHp,
		afterHp
	};
}

function parseJsonToBattleLog(json: Record<string, unknown>): ParsedBattleLog {
	const world = Number(json.world ?? 0);
	const mapnum = Number(json.mapnum ?? 0);
	const combinedType = Number(json.combined ?? 0);
	const rawBattles = (json.battles as Record<string, unknown>[]) || [];
	const firstBattle = rawBattles[0] || {};
	const firstBattleData = (firstBattle.data as Record<string, unknown>) || {};
	const node = Number(firstBattle.node ?? 0);

	const header: ParsedHeader = {
		mapAreaName: `World ${world}-${mapnum}`,
		world,
		mapnum,
		cell: node,
		isBoss: false,
		combinedType,
		currentGauge: json.now_maphp ? Number(json.now_maphp) : undefined,
		maxGauge: json.max_maphp ? Number(json.max_maphp) : undefined,
		enemyFleetName: 'Enemy Fleet'
	};

	const friendMain: ParsedShip[] = [];
	const rawFleet1 = (json.fleet1 as Record<string, unknown>[]) || [];
	for (let i = 0; i < rawFleet1.length; i++) {
		const s = rawFleet1[i];
		const equips = ((s.equip as number[]) || []).map((eqId) => ({
			name: String(eqId),
			rawId: eqId
		}));
		friendMain.push({
			index: i + 1,
			shipType: '',
			name: String(s.mst_id ?? 0),
			level: Number(s.level ?? 1),
			initialHp: 0,
			maxHp: 0,
			firepower: 0,
			torpedo: 0,
			aa: 0,
			armor: 0,
			equipments: equips,
			shipId: Number(s.mst_id ?? 0)
		});
	}

	const friendEscort: ParsedShip[] = [];
	const rawFleet2 = (json.fleet2 as Record<string, unknown>[]) || [];
	if (combinedType > 0 && rawFleet2.length > 0) {
		for (let i = 0; i < rawFleet2.length; i++) {
			const s = rawFleet2[i];
			const equips = ((s.equip as number[]) || []).map((eqId) => ({
				name: String(eqId),
				rawId: eqId
			}));
			friendEscort.push({
				index: i + 1,
				shipType: '',
				name: String(s.mst_id ?? 0),
				level: Number(s.level ?? 1),
				initialHp: 0,
				maxHp: 0,
				firepower: 0,
				torpedo: 0,
				aa: 0,
				armor: 0,
				equipments: equips,
				shipId: Number(s.mst_id ?? 0)
			});
		}
	}

	const enemyMain: ParsedShip[] = [];
	const rawKe = (firstBattleData.api_ship_ke as number[]) || [];
	const rawMaxHp = (firstBattleData.api_e_maxhps as number[]) || [];
	const rawNowHp = (firstBattleData.api_e_nowhps as number[]) || [];
	const rawLv = (firstBattleData.api_ship_lv as number[]) || [];
	const rawSlot = (firstBattleData.api_eSlot as number[][]) || [];
	for (let i = 0; i < rawKe.length; i++) {
		if (rawKe[i] <= 0) continue;
		const eqList = (rawSlot[i] || [])
			.filter((id) => id > 0)
			.map((id) => ({
				name: String(id),
				rawId: id
			}));
		enemyMain.push({
			index: i + 1,
			shipType: '',
			name: `Enemy ${rawKe[i]}`,
			level: rawLv[i] ?? 1,
			initialHp: rawNowHp[i] ?? 0,
			maxHp: rawMaxHp[i] ?? 0,
			firepower: 0,
			torpedo: 0,
			aa: 0,
			armor: 0,
			equipments: eqList,
			shipId: rawKe[i]
		});
	}

	const formation = (firstBattleData.api_formation as number[]) || [1, 1, 1];
	const searching: ParsedSearching = {
		formationFriend: formation[0] ?? 1,
		formationEnemy: formation[1] ?? 1,
		engagementForm: formation[2] ?? 1,
		searchingFriend: 1,
		searchingEnemy: 1
	};

	return {
		header,
		forces: {
			friendMain,
			friendEscort: friendEscort.length > 0 ? friendEscort : undefined,
			enemyMain,
			airBases: []
		},
		searching,
		phases: {
			airBaseAttacks: [],
			openingTaisen: [],
			openingRaigeki: [],
			hougeki1: [],
			hougeki2: [],
			hougeki3: [],
			raigeki: []
		},
		result: {
			rank: String(firstBattle.rating ?? 'S'),
			admiralExp: Number(firstBattle.hqEXP ?? 0),
			baseExp: Number(firstBattle.baseEXP ?? 0),
			dropName: firstBattle.drop ? String(firstBattle.drop) : undefined
		}
	};
}
