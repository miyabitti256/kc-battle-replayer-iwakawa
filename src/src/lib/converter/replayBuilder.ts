import equipLookupJson from '../data/equipLookup.json' with { type: 'json' };
import shipLookupJson from '../data/shipLookup.json' with { type: 'json' };
import { parseBattleLog } from '../parser/battleLogParser.js';
import type {
	AirBaseAttackApi,
	BattleDayApiData,
	BattleNightApiData,
	FriendlyBattleApi,
	FriendlyInfoApi,
	HougekiApi,
	KoukuApi,
	ParsedAttackAction,
	ParsedBattleLog,
	ParsedNightBattle,
	ParsedShip,
	RaigekiApi,
	ReplayAirBase,
	ReplayBattle,
	ReplayData,
	ReplayShip,
	YasenHougekiApi
} from '../types.js';

const shipLookup: Record<string, number> = shipLookupJson as Record<string, number>;
const equipLookup: Record<string, number> = equipLookupJson as Record<string, number>;

export function resolveShipId(name: string): number {
	const trimmed = name.trim();
	if (shipLookup[trimmed]) return shipLookup[trimmed];

	const baseName = trimmed.replace(/\s+Lv\.\s*\d+$/, '').trim();
	if (shipLookup[baseName]) return shipLookup[baseName];

	for (const [k, id] of Object.entries(shipLookup)) {
		if (baseName.startsWith(k) || k.startsWith(baseName)) {
			return id;
		}
	}

	return 0;
}

export function resolveEquipId(name: string): number {
	const trimmed = name.trim();
	if (equipLookup[trimmed]) return equipLookup[trimmed];

	const cleanName = trimmed
		.replace(/★\d+/, '')
		.replace(/\s+(>>|\/{1,3}|\|{1,3})$/, '')
		.trim();
	if (equipLookup[cleanName]) return equipLookup[cleanName];

	for (const [k, id] of Object.entries(equipLookup)) {
		if (cleanName.startsWith(k) || k.startsWith(cleanName)) {
			return id;
		}
	}

	return 0;
}

export function isAircraftEquipment(name: string, rawId?: number): boolean {
	// How: determine whether an equipment is an aircraft by rawId or name patterns
	// Why not depend solely on rawId: enemy equipment names in logs may resolve to standard names or rawIds
	if (rawId) {
		if (
			(rawId >= 1525 && rawId <= 1525) ||
			(rawId >= 1547 && rawId <= 1547) ||
			(rawId >= 1554 && rawId <= 1568) ||
			(rawId >= 1574 && rawId <= 1574) ||
			(rawId >= 1581 && rawId <= 1584) ||
			(rawId >= 1610 && rawId <= 1611) ||
			(rawId >= 1617 && rawId <= 1621) ||
			(rawId >= 1625 && rawId <= 1626) ||
			(rawId >= 1630 && rawId <= 1636) ||
			(rawId >= 1648 && rawId <= 1648) ||
			(rawId >= 1650 && rawId <= 1652)
		) {
			return true;
		}
	}
	return /艦戦|艦爆|艦攻|水偵|偵察機|水戦|飛行艇|哨戒|爆撃機|攻撃機|戦闘機|陸攻|陸爆|襲撃機|回転翼|オートジャイロ|カ号|鷹|海猫|カモメ/i.test(
		name
	);
}

function convertToReplayShip(parsed: ParsedShip): ReplayShip {
	const mst_id = parsed.shipId && parsed.shipId > 0 ? parsed.shipId : resolveShipId(parsed.name);
	const equip: number[] = [];
	const stars: number[] = [];
	const ace: number[] = [];

	for (const eq of parsed.equipments) {
		const eqId = eq.rawId && eq.rawId > 0 ? eq.rawId : resolveEquipId(eq.name);
		equip.push(eqId);
		stars.push(eq.stars ?? 0);
		ace.push(eq.ace ?? 0);
	}

	// Why not dynamic slot length: KC3Kai replayer expects a 6-slot aligned array for ship cards.
	while (equip.length < 6) {
		equip.push(0);
		stars.push(0);
		ace.push(0);
	}

	return {
		mst_id,
		level: parsed.level,
		kyouka: [0, 0, 0, 0, 0, 0, 0],
		morale: 50,
		equip,
		stars,
		ace
	};
}

function resolveDayAttackType(attackKind: string | undefined, damageCount: number): number {
	if (!attackKind) return damageCount > 1 ? 2 : 0;
	if (attackKind.includes('第一戦隊、突撃！主砲、全力斉射ッ！')) return 401;
	if (attackKind.includes('大和、突撃します！')) return 400;
	if (attackKind.includes('一斉射かッ…胸が熱いな！')) return 101;
	if (attackKind.includes('長門、いい？ いくわよ！')) return 102;
	if (attackKind.includes('Nelson Touch')) return 100;
	if (attackKind.includes('Colorado Touch')) return 103;
	if (attackKind.includes('僚艦夜戦突撃')) return 104;
	if (attackKind.includes('Richelieuよ！')) return 105;
	if (attackKind.includes('姉妹艦連携砲撃')) return 106;
	if (attackKind.includes('瑞雲立体攻撃')) return 200;
	if (attackKind.includes('海空立体攻撃')) return 201;
	if (attackKind.includes('空母カットイン')) return 7;
	if (attackKind.includes('主砲/主砲')) return 6;
	if (attackKind.includes('主砲/徹甲')) return 5;
	if (attackKind.includes('主砲/電探')) return 4;
	if (attackKind.includes('主砲/副砲')) return 3;
	if (attackKind.includes('連続射撃')) return 2;
	if (attackKind.includes('レーザー')) return 1;
	return damageCount > 1 ? 2 : 0;
}

function resolveNightAttackType(attackKind: string | undefined, damageCount: number): number {
	if (!attackKind) return damageCount > 1 ? 1 : 0;
	if (attackKind.includes('第一戦隊、突撃！主砲、全力斉射ッ！')) return 401;
	if (attackKind.includes('大和、突撃します！')) return 400;
	if (attackKind.includes('一斉射かッ…胸が熱いな！')) return 101;
	if (attackKind.includes('長門、いい？ いくわよ！')) return 102;
	if (attackKind.includes('Nelson Touch')) return 100;
	if (attackKind.includes('Colorado Touch')) return 103;
	if (attackKind.includes('僚艦夜戦突撃')) return 104;
	if (attackKind.includes('Richelieuよ！')) return 105;
	if (attackKind.includes('夜間瑞雲攻撃')) return 200;
	if (attackKind.includes('主砲/魚雷/電探') && attackKind.includes('2Hit')) return 11;
	if (attackKind.includes('魚雷/見張員/電探') && attackKind.includes('2Hit')) return 12;
	if (attackKind.includes('魚雷/魚雷/水雷見張員') && attackKind.includes('2Hit')) return 13;
	if (attackKind.includes('魚雷/ドラム缶/水雷見張員') && attackKind.includes('2Hit')) return 14;
	if (attackKind.includes('主砲/魚雷/電探')) return 7;
	if (attackKind.includes('魚雷/見張員/電探')) return 8;
	if (attackKind.includes('魚雷/魚雷/水雷見張員')) return 9;
	if (attackKind.includes('魚雷/ドラム缶/水雷見張員')) return 10;
	if (attackKind.includes('潜水艦カットイン')) return 13;
	if (attackKind.includes('空母夜襲カットイン')) return 6;
	if (attackKind.includes('主砲/主砲/主砲')) return 5;
	if (attackKind.includes('主砲/主砲/副砲')) return 4;
	if (attackKind.includes('魚雷/魚雷/魚雷')) return 3;
	if (attackKind.includes('主砲/魚雷')) return 2;
	if (attackKind.includes('連続射撃')) return 1;
	return damageCount > 1 ? 1 : 0;
}

export const SPECIAL_ATTACK_MAX_COUNTS: Record<number, number> = {
	100: 3, // Nelson Touch (#1, #3, #5)
	101: 3, // 長門一斉射 (#1, #1, #2)
	102: 3, // 陸奥一斉射 (#1, #1, #2)
	103: 3, // Colorado Touch (#1, #2, #3)
	104: 2, // 僚艦夜戦突撃 (#1, #2) 2回攻撃
	105: 3, // Richelieuよ！ (#1, #1, #2)
	106: 3, // 姉妹艦連携砲撃 (#1, #1, #2)
	200: 2, // 夜間瑞雲攻撃 (#1, #1) 2回攻撃
	300: 3,
	301: 3,
	302: 3, // 潜水艦特殊攻撃
	400: 3, // 大和型3隻 (#1, #2, #3)
	401: 3 // 大和型2隻 (#1, #1, #2)
};

function buildHougekiApi(actions: ParsedAttackAction[]): HougekiApi {
	const api_at_list: number[] = [];
	const api_at_eflag: number[] = [];
	const api_at_type: number[] = [];
	const api_df_list: number[][] = [];
	const api_damage: number[][] = [];
	const api_cl_list: number[][] = [];
	const api_si_list: (string | number)[][] = [];

	let i = 0;
	while (i < actions.length) {
		const act = actions[i];
		const atType = resolveDayAttackType(act.attackKind, act.damages.length);

		// Why not treat each log line as a separate turn: ElectronicObserver logs split multi-defender special attacks across consecutive lines, but KC3Kai replayer requires a unified turn structure.
		// Why not merge indefinitely: Special attacks have designated strike limits (e.g. 2 for Kongo Night Attack, 3 for Nelson Touch) that the replay player expects.
		if (atType >= 100) {
			const mergedDfList: number[] = [];
			const mergedDamageList: number[] = [];
			const mergedClList: number[] = [];
			const baseAtIdx = act.attackerIndex - 1;
			const baseEflag = act.isFriendAttacker ? 0 : 1;
			const targetKind = act.attackKind;
			const maxCount = SPECIAL_ATTACK_MAX_COUNTS[atType] ?? 3;

			while (i < actions.length && mergedDfList.length < maxCount) {
				const current = actions[i];
				const currentType = resolveDayAttackType(current.attackKind, current.damages.length);
				if (
					currentType !== atType ||
					current.attackKind !== targetKind ||
					current.isFriendAttacker !== act.isFriendAttacker ||
					((atType === 200 || atType === 201) && current.attackerIndex !== act.attackerIndex)
				) {
					break;
				}

				const dfIdx = current.targetIndex - 1;
				for (let k = 0; k < current.damages.length; k++) {
					mergedDfList.push(dfIdx);
					const rawDmg = current.damages[k];
					const dmg = current.isGuard && k === 0 ? rawDmg + 0.1 : rawDmg;
					mergedDamageList.push(dmg);
					mergedClList.push(current.criticalTypes[k] ?? (rawDmg > 0 ? 1 : 0));
					if (mergedDfList.length >= maxCount) {
						break;
					}
				}
				i++;
			}

			api_at_list.push(baseAtIdx);
			api_at_eflag.push(baseEflag);
			api_at_type.push(atType);
			api_df_list.push(mergedDfList);
			api_damage.push(mergedDamageList);
			api_cl_list.push(mergedClList);
			api_si_list.push([-1]);
		} else {
			const atIdx = act.attackerIndex - 1;
			api_at_list.push(atIdx);
			api_at_eflag.push(act.isFriendAttacker ? 0 : 1);

			const dfIdx = act.targetIndex - 1;
			api_df_list.push(act.damages.map(() => dfIdx));

			const dmgList = act.damages.map((d, idx) => (act.isGuard && idx === 0 ? d + 0.1 : d));
			api_damage.push(dmgList);
			api_cl_list.push([...act.criticalTypes]);

			api_at_type.push(atType);
			api_si_list.push([-1]);
			i++;
		}
	}

	return {
		api_at_list,
		api_at_eflag,
		api_at_type,
		api_df_list,
		api_damage,
		api_cl_list,
		api_si_list
	};
}

function buildRaigekiApi(actions: ParsedAttackAction[], isCombined: boolean): RaigekiApi {
	const numShips = isCombined ? 12 : 6;
	const api_frai = Array(numShips).fill(-1);
	const api_fydam = Array(numShips).fill(0);
	const api_fcl = Array(numShips).fill(0);
	const api_fdam = Array(numShips).fill(0);

	const api_erai = Array(numShips).fill(-1);
	const api_eydam = Array(numShips).fill(0);
	const api_ecl = Array(numShips).fill(0);
	const api_edam = Array(numShips).fill(0);

	for (const act of actions) {
		const atIdx = act.attackerIndex - 1;
		const dfIdx = act.targetIndex - 1;
		const dmg = act.damages[0] ?? 0;
		const cl = act.criticalTypes[0] ?? (dmg > 0 ? 1 : 0);

		if (act.isFriendAttacker) {
			if (atIdx >= 0 && atIdx < numShips) {
				api_frai[atIdx] = dfIdx;
				api_fydam[atIdx] = dmg;
				api_fcl[atIdx] = cl;
			}
			if (dfIdx >= 0 && dfIdx < numShips) {
				api_edam[dfIdx] += dmg;
			}
		} else {
			if (atIdx >= 0 && atIdx < numShips) {
				api_erai[atIdx] = dfIdx;
				api_eydam[atIdx] = dmg;
				api_ecl[atIdx] = cl;
			}
			if (dfIdx >= 0 && dfIdx < numShips) {
				api_fdam[dfIdx] += dmg;
			}
		}
	}

	return {
		api_frai,
		api_fydam,
		api_fcl,
		api_fdam,
		api_erai,
		api_eydam,
		api_ecl,
		api_edam
	};
}

function buildAirBaseAttackApi(parsed: ParsedBattleLog): AirBaseAttackApi[] {
	const result: AirBaseAttackApi[] = [];
	const isCombined = parsed.header.combinedType > 0;
	const isEnemyCombined = !!parsed.forces.enemyEscort && parsed.forces.enemyEscort.length > 0;

	for (let w = 0; w < parsed.phases.airBaseAttacks.length; w++) {
		const wave = parsed.phases.airBaseAttacks[w];
		const baseId = w < 2 ? 1 : 3;

		const squadronPlanes = wave.squadrons.map((sq) => ({
			api_count: sq.count,
			api_mst_id: resolveEquipId(sq.name)
		}));

		const touchEnemyId = wave.stage1?.touchEnemy ? resolveEquipId(wave.stage1.touchEnemy) : -1;
		const touchFriendId = wave.stage1?.touchFriend ? resolveEquipId(wave.stage1.touchFriend) : -1;

		const eDamMain = Array(6).fill(0);
		const eRaiMain = Array(6).fill(0);
		const eBakMain = Array(6).fill(0);
		const eClMain = Array(6).fill(0);

		const eDamEscort = isEnemyCombined ? Array(6).fill(0) : null;
		const eRaiEscort = isEnemyCombined ? Array(6).fill(0) : null;
		const eBakEscort = isEnemyCombined ? Array(6).fill(0) : null;
		const eClEscort = isEnemyCombined ? Array(6).fill(0) : null;

		for (const act of wave.attacks) {
			const idx = act.targetIndex - 1;
			const dmg = act.damages[0] ?? 0;
			const crit = act.criticalTypes[0] ?? (dmg > 0 ? 1 : 0);
			const isBak = act.attackKind?.includes('爆撃') ?? false;

			if (idx < 6) {
				eDamMain[idx] += dmg;
				if (isBak) eBakMain[idx] = 1;
				else eRaiMain[idx] = 1;
				if (crit === 2) eClMain[idx] = 1;
			} else if (isEnemyCombined && eDamEscort && eBakEscort && eRaiEscort && eClEscort) {
				const escortIdx = idx - 6;
				if (escortIdx >= 0 && escortIdx < 6) {
					eDamEscort[escortIdx] += dmg;
					if (isBak) eBakEscort[escortIdx] = 1;
					else eRaiEscort[escortIdx] = 1;
					if (crit === 2) eClEscort[escortIdx] = 1;
				}
			}
		}

		result.push({
			api_base_id: baseId,
			api_plane_from: [null, isCombined ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6]],
			api_squadron_plane: squadronPlanes,
			api_stage1: {
				api_disp_seiku: wave.stage1?.airSuperiority ?? 0,
				api_f_count: wave.stage1?.friendTotal ?? 0,
				api_f_lostcount: wave.stage1?.friendLost ?? 0,
				api_e_count: wave.stage1?.enemyTotal ?? 0,
				api_e_lostcount: wave.stage1?.enemyLost ?? 0,
				api_touch_plane: [touchFriendId, touchEnemyId]
			},
			api_stage2: {
				api_f_count: wave.stage2?.friendTotal ?? 0,
				api_f_lostcount: wave.stage2?.friendLost ?? 0,
				api_e_count: wave.stage2?.enemyTotal ?? 0,
				api_e_lostcount: wave.stage2?.enemyLost ?? 0,
				api_air_fire: null
			},
			api_stage3: {
				api_edam: eDamMain,
				api_ebak_flag: eBakMain,
				api_erai_flag: eRaiMain,
				api_ecl_flag: eClMain,
				api_fdam: [],
				api_fbak_flag: [],
				api_frai_flag: [],
				api_fcl_flag: []
			},
			api_stage3_combined: isEnemyCombined
				? {
						api_edam: eDamEscort,
						api_ebak_flag: eBakEscort,
						api_erai_flag: eRaiEscort,
						api_ecl_flag: eClEscort,
						api_fdam: null,
						api_fbak_flag: null,
						api_frai_flag: null,
						api_fcl_flag: null
					}
				: null,
			api_stage_flag: [1, 1, 1]
		});
	}

	return result;
}

function buildKoukuApi(parsed: ParsedBattleLog): KoukuApi | null {
	const airBattle = parsed.phases.airBattle;
	if (!airBattle) return null;

	const isEnemyCombined = !!parsed.forces.enemyEscort && parsed.forces.enemyEscort.length > 0;
	const isFriendCombined = parsed.header.combinedType > 0;

	const fPlaneFrom: number[] = [];
	for (let i = 0; i < parsed.forces.friendMain.length; i++) {
		if (parsed.forces.friendMain[i].equipments.some((e) => (e.aircraft ?? 0) > 0)) {
			fPlaneFrom.push(i + 1);
		}
	}
	// Why not push dummy plane when fPlaneFrom is empty: KC3Kai replayer expects null when a fleet has no aircraft launched

	const ePlaneFrom: number[] = [];
	for (let i = 0; i < parsed.forces.enemyMain.length; i++) {
		if (parsed.forces.enemyMain[i].equipments.some((e) => isAircraftEquipment(e.name, e.rawId))) {
			ePlaneFrom.push(i + 1);
		}
	}

	const touchFriend = airBattle.stage1?.touchFriend
		? resolveEquipId(airBattle.stage1.touchFriend)
		: -1;
	const touchEnemy = airBattle.stage1?.touchEnemy
		? resolveEquipId(airBattle.stage1.touchEnemy)
		: -1;

	const fDamMain = Array(6).fill(0);
	const fRaiMain = Array(6).fill(0);
	const fBakMain = Array(6).fill(0);
	const fClMain = Array(6).fill(0);

	const eDamMain = Array(6).fill(0);
	const eRaiMain = Array(6).fill(0);
	const eBakMain = Array(6).fill(0);
	const eClMain = Array(6).fill(0);

	const fDamEscort = isFriendCombined ? Array(6).fill(0) : null;
	const fRaiEscort = isFriendCombined ? Array(6).fill(0) : null;
	const fBakEscort = isFriendCombined ? Array(6).fill(0) : null;
	const fClEscort = isFriendCombined ? Array(6).fill(0) : null;

	const eDamEscort = isEnemyCombined ? Array(6).fill(0) : null;
	const eRaiEscort = isEnemyCombined ? Array(6).fill(0) : null;
	const eBakEscort = isEnemyCombined ? Array(6).fill(0) : null;
	const eClEscort = isEnemyCombined ? Array(6).fill(0) : null;

	for (const act of airBattle.attacks) {
		const targetIdx = act.targetIndex - 1;
		const dmg = act.damages[0] ?? 0;
		const isBak = act.attackKind?.includes('爆撃') ?? false;
		const isRai = act.attackKind?.includes('雷撃') ?? false;

		if (act.isFriendAttacker) {
			if (targetIdx < 6) {
				eDamMain[targetIdx] += dmg;
				if (isBak) eBakMain[targetIdx] = 1;
				if (isRai) eRaiMain[targetIdx] = 1;
			} else if (isEnemyCombined && eDamEscort && eBakEscort && eRaiEscort) {
				const escortIdx = targetIdx - 6;
				if (escortIdx >= 0 && escortIdx < 6) {
					eDamEscort[escortIdx] += dmg;
					if (isBak) eBakEscort[escortIdx] = 1;
					if (isRai) eRaiEscort[escortIdx] = 1;
				}
			}
		} else {
			if (targetIdx < 6) {
				fDamMain[targetIdx] += dmg;
				if (isBak) fBakMain[targetIdx] = 1;
				if (isRai) fRaiMain[targetIdx] = 1;
			} else if (isFriendCombined && fDamEscort && fBakEscort && fRaiEscort) {
				const escortIdx = targetIdx - 6;
				if (escortIdx >= 0 && escortIdx < 6) {
					fDamEscort[escortIdx] += dmg;
					if (isBak) fBakEscort[escortIdx] = 1;
					if (isRai) fRaiEscort[escortIdx] = 1;
				}
			}
		}
	}

	let airFire = null;
	if (airBattle.stage2?.antiAirCutIn) {
		const ci = airBattle.stage2.antiAirCutIn;
		let shipIdx = 0;
		const friendAll = [...parsed.forces.friendMain, ...(parsed.forces.friendEscort ?? [])];
		const foundIdx = friendAll.findIndex((s) => s.name === ci.shipName);
		if (foundIdx >= 0) shipIdx = foundIdx;

		airFire = {
			api_idx: shipIdx,
			api_kind: ci.kindId,
			api_use_items: []
		};
	}

	const hasAirAttacks = airBattle.attacks.length > 0;

	return {
		api_plane_from: [
			fPlaneFrom.length > 0 ? fPlaneFrom : null,
			ePlaneFrom.length > 0 ? ePlaneFrom : null
		],
		api_stage1: {
			api_disp_seiku: airBattle.stage1?.airSuperiority ?? 1,
			api_f_count: airBattle.stage1?.friendTotal ?? 0,
			api_f_lostcount: airBattle.stage1?.friendLost ?? 0,
			api_e_count: airBattle.stage1?.enemyTotal ?? 0,
			api_e_lostcount: airBattle.stage1?.enemyLost ?? 0,
			api_touch_plane: [touchFriend, touchEnemy]
		},
		api_stage2: {
			api_f_count: airBattle.stage2?.friendTotal ?? 0,
			api_f_lostcount: airBattle.stage2?.friendLost ?? 0,
			api_e_count: airBattle.stage2?.enemyTotal ?? 0,
			api_e_lostcount: airBattle.stage2?.enemyLost ?? 0,
			api_air_fire: airFire
		},
		api_stage3: hasAirAttacks
			? {
					api_fdam: fDamMain,
					api_fbak_flag: fBakMain,
					api_frai_flag: fRaiMain,
					api_fcl_flag: fClMain,
					api_edam: eDamMain,
					api_ebak_flag: eBakMain,
					api_erai_flag: eRaiMain,
					api_ecl_flag: eClMain
				}
			: null,
		api_stage3_combined:
			hasAirAttacks && (isFriendCombined || isEnemyCombined)
				? {
						api_fdam: fDamEscort,
						api_fbak_flag: fBakEscort,
						api_frai_flag: fRaiEscort,
						api_fcl_flag: fClEscort,
						api_edam: eDamEscort,
						api_ebak_flag: eBakEscort,
						api_erai_flag: eRaiEscort,
						api_ecl_flag: eClEscort
					}
				: null
	};
}

function buildFriendlyHougekiApi(actions: ParsedAttackAction[]): YasenHougekiApi {
	// How: construct night battle shelling structure from friendly attack actions
	// Why not separate daytime structure: friendly fleet participation is strictly a night battle phase
	const api_at_list: number[] = [];
	const api_at_eflag: number[] = [];
	const api_df_list: number[][] = [];
	const api_damage: number[][] = [];
	const api_cl_list: number[][] = [];
	const api_sp_list: number[] = [];
	const api_si_list: (string | number)[][] = [];

	let i = 0;
	while (i < actions.length) {
		const act = actions[i];
		const spType = resolveNightAttackType(act.attackKind, act.damages.length);

		if (spType >= 100) {
			const mergedDfList: number[] = [];
			const mergedDamageList: number[] = [];
			const mergedClList: number[] = [];
			const baseAtIdx = act.attackerIndex - 1;
			const baseEflag = act.isFriendAttacker ? 0 : 1;
			const targetKind = act.attackKind;
			const maxCount = SPECIAL_ATTACK_MAX_COUNTS[spType] ?? 3;

			while (i < actions.length && mergedDfList.length < maxCount) {
				const current = actions[i];
				const currentSp = resolveNightAttackType(current.attackKind, current.damages.length);
				if (
					currentSp !== spType ||
					current.attackKind !== targetKind ||
					current.isFriendAttacker !== act.isFriendAttacker ||
					(spType === 200 && current.attackerIndex !== act.attackerIndex)
				) {
					break;
				}

				const dfIdx = current.targetIndex - 1;
				for (let k = 0; k < current.damages.length; k++) {
					mergedDfList.push(dfIdx);
					const rawDmg = current.damages[k];
					const dmg = current.isGuard && k === 0 ? rawDmg + 0.1 : rawDmg;
					mergedDamageList.push(dmg);
					mergedClList.push(current.criticalTypes[k] ?? (rawDmg > 0 ? 1 : 0));
					if (mergedDfList.length >= maxCount) {
						break;
					}
				}
				i++;
			}

			api_at_list.push(baseAtIdx);
			api_at_eflag.push(baseEflag);
			api_sp_list.push(spType);
			api_df_list.push(mergedDfList);
			api_damage.push(mergedDamageList);
			api_cl_list.push(mergedClList);
			api_si_list.push([-1]);
		} else {
			const atIdx = act.attackerIndex - 1;
			const dfIdx = act.targetIndex - 1;
			api_at_list.push(atIdx);
			api_at_eflag.push(act.isFriendAttacker ? 0 : 1);
			api_df_list.push(act.damages.map(() => dfIdx));

			const dmgList = act.damages.map((d, idx) => (act.isGuard && idx === 0 ? d + 0.1 : d));
			api_damage.push(dmgList);
			api_cl_list.push([...act.criticalTypes]);

			api_sp_list.push(spType);
			api_si_list.push([-1]);
			i++;
		}
	}

	return {
		api_at_list,
		api_at_eflag,
		api_df_list,
		api_damage,
		api_cl_list,
		api_sp_list,
		api_si_list
	};
}

function buildYasenApi(
	nightBattle: ParsedNightBattle | undefined,
	parsed: ParsedBattleLog,
	dayData: BattleDayApiData
): BattleNightApiData | Record<string, never> {
	// How: assemble night battle data including player fleet, friendly fleet, and combined fleet retreat flags
	// Why not return empty when night attacks are empty: battle logs may contain friendly fleet support even if the player fleet makes no attacks
	const hasNightAttacks = !!nightBattle && nightBattle.attacks.length > 0;
	const hasFriendlyFleet = !!parsed.friendlyFleet && parsed.friendlyFleet.length > 0;

	if (!hasNightAttacks && !hasFriendlyFleet) {
		return {};
	}

	const fTouchId = nightBattle?.touchFriend ? resolveEquipId(nightBattle.touchFriend) : -1;
	const eTouchId = nightBattle?.touchEnemy ? resolveEquipId(nightBattle.touchEnemy) : -1;
	const fFlare = nightBattle?.flareFriend ? nightBattle.flareFriend.index - 1 : -1;
	const eFlare = nightBattle?.flareEnemy ? nightBattle.flareEnemy.index - 1 : -1;

	let hougekiData: YasenHougekiApi | null = null;
	if (hasNightAttacks && nightBattle) {
		const api_at_list: number[] = [];
		const api_at_eflag: number[] = [];
		const api_df_list: number[][] = [];
		const api_damage: number[][] = [];
		const api_cl_list: number[][] = [];
		const api_sp_list: number[] = [];
		const api_si_list: (string | number)[][] = [];

		let i = 0;
		while (i < nightBattle.attacks.length) {
			const act = nightBattle.attacks[i];
			const spType = resolveNightAttackType(act.attackKind, act.damages.length);

			// Why not treat each log line as a separate turn: multi-defender special attacks are printed across consecutive lines in ElectronicObserver, but replayer requires unified turn structure.
			// Why not merge indefinitely: Special attacks have designated strike limits (e.g. 2 for Kongo Night Attack, 3 for Nelson Touch) that the replay player expects.
			if (spType >= 100) {
				const mergedDfList: number[] = [];
				const mergedDamageList: number[] = [];
				const mergedClList: number[] = [];
				const baseAtIdx = act.attackerIndex - 1;
				const baseEflag = act.isFriendAttacker ? 0 : 1;
				const targetKind = act.attackKind;
				const maxCount = SPECIAL_ATTACK_MAX_COUNTS[spType] ?? 3;

				while (i < nightBattle.attacks.length && mergedDfList.length < maxCount) {
					const current = nightBattle.attacks[i];
					const currentSp = resolveNightAttackType(current.attackKind, current.damages.length);
					if (
						currentSp !== spType ||
						current.attackKind !== targetKind ||
						current.isFriendAttacker !== act.isFriendAttacker ||
						(spType === 200 && current.attackerIndex !== act.attackerIndex)
					) {
						break;
					}

					const dfIdx = current.targetIndex - 1;
					for (let k = 0; k < current.damages.length; k++) {
						mergedDfList.push(dfIdx);
						const rawDmg = current.damages[k];
						const dmg = current.isGuard && k === 0 ? rawDmg + 0.1 : rawDmg;
						mergedDamageList.push(dmg);
						mergedClList.push(current.criticalTypes[k] ?? (rawDmg > 0 ? 1 : 0));
						if (mergedDfList.length >= maxCount) {
							break;
						}
					}
					i++;
				}

				api_at_list.push(baseAtIdx);
				api_at_eflag.push(baseEflag);
				api_sp_list.push(spType);
				api_df_list.push(mergedDfList);
				api_damage.push(mergedDamageList);
				api_cl_list.push(mergedClList);
				api_si_list.push([-1]);
			} else {
				const atIdx = act.attackerIndex - 1;
				const dfIdx = act.targetIndex - 1;
				api_at_list.push(atIdx);
				api_at_eflag.push(act.isFriendAttacker ? 0 : 1);
				api_df_list.push(act.damages.map(() => dfIdx));

				const dmgList = act.damages.map((d, idx) => (act.isGuard && idx === 0 ? d + 0.1 : d));
				api_damage.push(dmgList);
				api_cl_list.push([...act.criticalTypes]);

				api_sp_list.push(spType);
				api_si_list.push([-1]);
				i++;
			}
		}

		hougekiData = {
			api_at_list,
			api_at_eflag,
			api_df_list,
			api_damage,
			api_cl_list,
			api_sp_list,
			api_si_list
		};
	}

	let friendlyInfo: FriendlyInfoApi | null = null;
	let friendlyBattle: FriendlyBattleApi | null = null;

	if (hasFriendlyFleet && parsed.friendlyFleet) {
		const api_ship_id = parsed.friendlyFleet.map((s) =>
			s.shipId && s.shipId > 0 ? s.shipId : resolveShipId(s.name)
		);
		// Why not use s.initialHp directly without fallback: initialHp may be 0 if log only records full HP, which would trigger sudden sinking/taiha in replayer
		const api_nowhps = parsed.friendlyFleet.map((s) => (s.initialHp > 0 ? s.initialHp : s.maxHp));
		const api_maxhps = parsed.friendlyFleet.map((s) => s.maxHp);
		const api_Slot = parsed.friendlyFleet.map((s) => {
			const slots = s.equipments.map((e) =>
				e.rawId && e.rawId > 0 ? e.rawId : resolveEquipId(e.name)
			);
			while (slots.length < 5) slots.push(-1);
			return slots;
		});
		const api_Param: [number, number, number, number][] = parsed.friendlyFleet.map((s) => [
			s.firepower,
			s.torpedo,
			s.aa,
			s.armor
		]);

		friendlyInfo = {
			api_ship_id,
			api_nowhps,
			api_maxhps,
			api_Slot,
			api_Param
		};

		const friendlyFlare = parsed.friendlyBattle?.flareFriend
			? parsed.friendlyBattle.flareFriend.index - 1
			: -1;
		const enemyFlare = parsed.friendlyBattle?.flareEnemy
			? parsed.friendlyBattle.flareEnemy.index - 1
			: -1;

		const friendlyHougeki =
			parsed.friendlyBattle?.attacks && parsed.friendlyBattle.attacks.length > 0
				? buildFriendlyHougekiApi(parsed.friendlyBattle.attacks)
				: null;

		friendlyBattle = {
			api_flare_pos: [friendlyFlare, enemyFlare],
			api_touch_plane: [-1, -1],
			api_hougeki: friendlyHougeki
		};
	}

	const isEnemyCombined = !!parsed.forces.enemyEscort && parsed.forces.enemyEscort.length > 0;

	// How: populate fleet properties into yasenResult using night entry HPs if available, reflecting enemy and friend status prior to friendly fleet and night actions
	// Why not depend solely on dayData in replayer: in night-only battles dayData is empty, and in daytime+night battles dayData HPs do not reflect pre-night status
	const enemyMainHps = parsed.nightInitialEnemyHps?.main ?? dayData.api_e_nowhps;
	const enemyEscortHps = parsed.nightInitialEnemyHps?.escort ?? dayData.api_e_nowhps_combined;
	const friendMainHps = parsed.nightInitialFriendHps?.main ?? dayData.api_f_nowhps;
	const friendEscortHps = parsed.nightInitialFriendHps?.escort ?? dayData.api_f_nowhps_combined;

	const yasenResult: BattleNightApiData = {
		api_deck_id: 1,
		api_ship_ke: dayData.api_ship_ke,
		api_ship_lv: dayData.api_ship_lv,
		api_f_nowhps: friendMainHps,
		api_f_maxhps: dayData.api_f_maxhps,
		api_fParam: dayData.api_fParam,
		api_f_nowhps_combined: friendEscortHps,
		api_f_maxhps_combined: dayData.api_f_maxhps_combined,
		api_fParam_combined: dayData.api_fParam_combined,
		api_e_nowhps: enemyMainHps,
		api_e_maxhps: dayData.api_e_maxhps,
		api_eParam: dayData.api_eParam,
		api_eSlot: dayData.api_eSlot,
		api_touch_plane: [fTouchId, eTouchId],
		api_flare_pos: [fFlare, eFlare],
		api_hougeki: hougekiData
	};

	if (friendlyInfo) {
		yasenResult.api_friendly_info = friendlyInfo;
		yasenResult.api_friendly_battle = friendlyBattle;
	}

	// Why not omit combined escort properties: KC3Kai replayer requires api_active_deck[1] === 1 and api_ship_ke_combined to trigger the enemy escort retreat animation.
	if (isEnemyCombined) {
		yasenResult.api_active_deck = [2, 1];
		yasenResult.api_ship_ke_combined = dayData.api_ship_ke_combined;
		yasenResult.api_ship_lv_combined = dayData.api_ship_lv_combined;
		yasenResult.api_e_nowhps_combined = enemyEscortHps;
		yasenResult.api_e_maxhps_combined = dayData.api_e_maxhps_combined;
		yasenResult.api_eParam_combined = dayData.api_eParam_combined;
		yasenResult.api_eSlot_combined = dayData.api_eSlot_combined;
	}

	return yasenResult;
}

export function buildReplayData(parsed: ParsedBattleLog): ReplayData {
	const isCombined = parsed.header.combinedType > 0;
	const isEnemyCombined = !!parsed.forces.enemyEscort && parsed.forces.enemyEscort.length > 0;

	const fleet1: ReplayShip[] = parsed.forces.friendMain.map(convertToReplayShip);
	const fleet2: ReplayShip[] = parsed.forces.friendEscort
		? parsed.forces.friendEscort.map(convertToReplayShip)
		: [];
	const fleet3: ReplayShip[] = parsed.forces.supportFleet
		? parsed.forces.supportFleet.map(convertToReplayShip)
		: [];

	const lbas: ReplayAirBase[] = parsed.forces.airBases.map((base, idx) => {
		const planes = base.squadrons.map((sq) => {
			let count = sq.count;
			if (!count) {
				for (const wave of parsed.phases.airBaseAttacks) {
					const matchSq = wave.squadrons.find((s) => s.name === sq.name);
					if (matchSq) {
						count = matchSq.count;
						break;
					}
				}
			}
			return {
				mst_id: resolveEquipId(sq.name),
				count: count ?? 18,
				stars: sq.stars ?? 0,
				ace: sq.ace ?? 0,
				state: 1,
				morale: 1
			};
		});

		return {
			rid: idx + 1,
			action: base.actionId,
			range: {
				api_base: 0,
				api_bonus: 0
			},
			planes
		};
	});

	const api_f_nowhps = parsed.forces.friendMain.map((s) => s.initialHp);
	const api_f_maxhps = parsed.forces.friendMain.map((s) => s.maxHp);
	const api_fParam: [number, number, number, number][] = parsed.forces.friendMain.map((s) => [
		s.firepower,
		s.torpedo,
		s.aa,
		s.armor
	]);

	const api_f_nowhps_combined = isCombined
		? (parsed.forces.friendEscort?.map((s) => s.initialHp) ?? [])
		: undefined;
	const api_f_maxhps_combined = isCombined
		? (parsed.forces.friendEscort?.map((s) => s.maxHp) ?? [])
		: undefined;
	const api_fParam_combined: [number, number, number, number][] | undefined = isCombined
		? parsed.forces.friendEscort?.map((s) => [s.firepower, s.torpedo, s.aa, s.armor])
		: undefined;

	const api_ship_ke = parsed.forces.enemyMain.map((s) => s.shipId ?? 0);
	const api_ship_lv = parsed.forces.enemyMain.map((s) => s.level);
	const api_e_nowhps = parsed.forces.enemyMain.map((s) => s.initialHp);
	const api_e_maxhps = parsed.forces.enemyMain.map((s) => s.maxHp);
	const api_eParam: [number, number, number, number][] = parsed.forces.enemyMain.map((s) => [
		s.firepower,
		s.torpedo,
		s.aa,
		s.armor
	]);
	const api_eSlot = parsed.forces.enemyMain.map((s) => {
		const slots = s.equipments.map((e) =>
			e.rawId && e.rawId > 0 ? e.rawId : resolveEquipId(e.name)
		);
		while (slots.length < 5) slots.push(-1);
		return slots;
	});

	let api_ship_ke_combined: number[] | undefined;
	let api_ship_lv_combined: number[] | undefined;
	let api_e_nowhps_combined: number[] | undefined;
	let api_e_maxhps_combined: number[] | undefined;
	let api_eParam_combined: [number, number, number, number][] | undefined;
	let api_eSlot_combined: number[][] | undefined;

	if (isEnemyCombined && parsed.forces.enemyEscort) {
		api_ship_ke_combined = parsed.forces.enemyEscort.map((s) => s.shipId ?? 0);
		api_ship_lv_combined = parsed.forces.enemyEscort.map((s) => s.level);
		api_e_nowhps_combined = parsed.forces.enemyEscort.map((s) => s.initialHp);
		api_e_maxhps_combined = parsed.forces.enemyEscort.map((s) => s.maxHp);
		api_eParam_combined = parsed.forces.enemyEscort.map((s) => [
			s.firepower,
			s.torpedo,
			s.aa,
			s.armor
		]);
		api_eSlot_combined = parsed.forces.enemyEscort.map((s) => {
			const slots = s.equipments.map((e) =>
				e.rawId && e.rawId > 0 ? e.rawId : resolveEquipId(e.name)
			);
			while (slots.length < 5) slots.push(-1);
			return slots;
		});
	}

	const airBaseAttacks = buildAirBaseAttackApi(parsed);
	const kouku = buildKoukuApi(parsed);

	let supportInfo = null;
	let supportFlag = 0;
	if (parsed.phases.supportAttack && parsed.phases.supportAttack.attacks.length > 0) {
		supportFlag = 2;
		const damList = Array(12).fill(0);
		const clList = Array(12).fill(0);
		for (const act of parsed.phases.supportAttack.attacks) {
			const idx = act.targetIndex - 1;
			if (idx >= 0 && idx < 12) {
				damList[idx] = act.damages[0] ?? 0;
				clList[idx] = act.criticalTypes[0] ?? 0;
			}
		}

		supportInfo = {
			api_support_airatack: null,
			api_support_hourai: {
				api_deck_id: 3,
				api_ship_id: parsed.forces.supportFleet?.map((s) => resolveShipId(s.name)) ?? [],
				api_undressing_flag: [0, 0, 0, 0, 0, 0],
				api_damage: damList,
				api_cl_list: clList
			}
		};
	}

	const hasOpeningTaisen = parsed.phases.openingTaisen.length > 0;
	const openingTaisen = hasOpeningTaisen ? buildHougekiApi(parsed.phases.openingTaisen) : null;

	const hasOpeningRaigeki = parsed.phases.openingRaigeki.length > 0;
	const openingRaigeki = hasOpeningRaigeki
		? buildRaigekiApi(parsed.phases.openingRaigeki, isCombined)
		: null;

	const hasHou1 = parsed.phases.hougeki1.length > 0;
	const hougeki1 = hasHou1 ? buildHougekiApi(parsed.phases.hougeki1) : null;

	const hasHou2 = parsed.phases.hougeki2.length > 0;
	const hougeki2 = hasHou2 ? buildHougekiApi(parsed.phases.hougeki2) : null;

	const hasHou3 = parsed.phases.hougeki3.length > 0;
	const hougeki3 = hasHou3 ? buildHougekiApi(parsed.phases.hougeki3) : null;

	const hasRaigeki = parsed.phases.raigeki.length > 0;
	const raigeki = hasRaigeki ? buildRaigekiApi(parsed.phases.raigeki, isCombined) : null;

	// Why not check only nightBattle attacks: friendly fleet phase also constitutes midnight battle state
	const hasNight =
		(!!parsed.nightBattle && parsed.nightBattle.attacks.length > 0) ||
		(!!parsed.friendlyFleet && parsed.friendlyFleet.length > 0);

	const hasDayBattle =
		airBaseAttacks.length > 0 ||
		kouku !== null ||
		supportFlag > 0 ||
		hasOpeningTaisen ||
		hasOpeningRaigeki ||
		hasHou1 ||
		hasHou2 ||
		hasHou3 ||
		hasRaigeki;

	const dayData: BattleDayApiData = {
		api_deck_id: 1,
		api_formation: [
			parsed.searching?.formationFriend ?? 1,
			parsed.searching?.formationEnemy ?? 1,
			parsed.searching?.engagementForm ?? 1
		],
		api_f_nowhps,
		api_f_maxhps,
		api_f_nowhps_combined,
		api_f_maxhps_combined,
		api_ship_ke,
		api_ship_lv,
		api_e_nowhps,
		api_e_maxhps,
		api_eParam,
		api_eSlot,
		api_ship_ke_combined,
		api_ship_lv_combined,
		api_e_nowhps_combined,
		api_e_maxhps_combined,
		api_eParam_combined,
		api_eSlot_combined,
		api_fParam,
		api_fParam_combined,
		api_search: [parsed.searching?.searchingFriend ?? 1, parsed.searching?.searchingEnemy ?? 1],
		api_air_base_attack: airBaseAttacks.length > 0 ? airBaseAttacks : null,
		api_stage_flag: kouku
			? [kouku.api_stage1 ? 1 : 0, kouku.api_stage2 ? 1 : 0, kouku.api_stage3 ? 1 : 0]
			: [0, 0, 0],
		api_kouku: kouku,
		api_support_flag: supportFlag,
		api_support_info: supportInfo,
		api_opening_taisen_flag: hasOpeningTaisen ? 1 : 0,
		api_opening_taisen: openingTaisen,
		api_opening_flag: hasOpeningRaigeki ? 1 : 0,
		api_opening_atack: openingRaigeki,
		api_hourai_flag: [hasHou1 ? 1 : 0, hasHou2 ? 1 : 0, hasHou3 ? 1 : 0, hasRaigeki ? 1 : 0],
		api_hougeki1: hougeki1,
		api_hougeki2: hougeki2,
		api_hougeki3: hougeki3,
		api_raigeki: raigeki,
		api_midnight_flag: hasNight ? 1 : 0,
		api_smoke_type: parsed.searching?.smokeCount ?? 0,
		api_balloon_cell: parsed.searching?.isBalloonCell ? 1 : 0
	};

	const yasenData = buildYasenApi(parsed.nightBattle, parsed, dayData);

	let mvpList: number[] = [1];
	if (parsed.result?.mvpMain) {
		const found = parsed.forces.friendMain.findIndex((s) =>
			parsed.result?.mvpMain?.includes(s.name)
		);
		mvpList = [found >= 0 ? found + 1 : 1];
		if (isCombined && parsed.result?.mvpEscort && parsed.forces.friendEscort) {
			const foundEscort = parsed.forces.friendEscort.findIndex((s) =>
				parsed.result?.mvpEscort?.includes(s.name)
			);
			mvpList.push(foundEscort >= 0 ? foundEscort + 1 : 1);
		}
	}

	const dropShipId = parsed.result?.dropName ? resolveShipId(parsed.result.dropName) : 0;

	// How: when battle starts at night without daytime phases, empty dayData so KC3Kai plays night battle directly
	// Why not keep dayData on night starts: non-empty dayData without daytime actions leads to zero-turn daytime stall before night
	const battleData = !hasDayBattle && hasNight ? {} : dayData;

	const battle: ReplayBattle = {
		sortie_id: 0,
		node: parsed.header.cell,
		data: battleData,
		yasen: yasenData,
		rating: parsed.result?.rank ?? 'S',
		drop: dropShipId,
		time: Date.now(),
		baseEXP: parsed.result?.baseExp ?? 0,
		hqEXP: parsed.result?.admiralExp ?? 0,
		mvp: mvpList,
		id: 0
	};

	return {
		id: 1,
		now_maphp: parsed.header.currentGauge,
		max_maphp: parsed.header.maxGauge,
		defeat_count: parsed.header.gaugeType === '撃破' ? parsed.header.currentGauge : 0,
		world: parsed.header.world,
		mapnum: parsed.header.mapnum,
		fleetnum: 1,
		combined: parsed.header.combinedType,
		fleet1,
		fleet2: fleet2.length > 0 ? fleet2 : undefined,
		fleet3: fleet3.length > 0 ? fleet3 : undefined,
		fleet4: [],
		support1: 0,
		support2: supportFlag,
		lbas: lbas.length > 0 ? lbas : undefined,
		time: Date.now(),
		battles: [battle]
	};
}

export function convertBattleLogToReplay(text: string): ReplayData {
	// How: parse text log and construct KC3Kai compatible ReplayData structure
	// Why not accept only raw text: handling both string and parsed logs provides flexibility for consumers
	const trimmed = typeof text === 'string' ? text.trim() : '';
	if (trimmed.startsWith('{')) {
		const parsed = JSON.parse(trimmed);
		if (parsed && 'battles' in parsed && 'fleet1' in parsed) {
			return parsed as ReplayData;
		}
	}
	return buildReplayData(parseBattleLog(text));
}
