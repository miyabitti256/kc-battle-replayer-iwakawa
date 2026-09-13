import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
	convertBattleLogToReplay,
	parseBattleLog,
	SPECIAL_ATTACK_MAX_COUNTS
} from '../src/lib/index.js';
import type { BattleDayApiData } from '../src/lib/types.js';

function main() {
	console.log(
		'=== Test 1: Verify conversion of sample-62-3-62.txt (Combined Fleet + LBAS + Night Battle) ==='
	);
	const sampleIwakawaPath = path.resolve(
		import.meta.dirname,
		'../../reference-source/sample-battle-data/sample-62-3-62.txt'
	);
	const textIwakawa = fs.readFileSync(sampleIwakawaPath, 'utf-8');

	// What: Parse raw text log and build ReplayData
	const parsedLog = parseBattleLog(textIwakawa);
	assert.strictEqual(parsedLog.header.world, 62, 'Parsed world should be 62');
	assert.strictEqual(parsedLog.header.cell, 62, 'Parsed cell should be 62');
	assert.strictEqual(
		parsedLog.forces.friendMain.length,
		6,
		'Parsed friend main fleet should have 6 ships'
	);

	const replay = convertBattleLogToReplay(textIwakawa);

	// What: Verify root metadata fields
	assert.strictEqual(replay.id, 1, 'Replay id should be 1');
	assert.strictEqual(replay.world, 62, 'World should be 62');
	assert.strictEqual(replay.mapnum, 3, 'Mapnum should be 3');
	assert.strictEqual(replay.combined, 1, 'Combined flag should be 1 (Carrier Task Force)');
	assert.ok(Array.isArray(replay.fleet1), 'fleet1 should be an array');
	assert.strictEqual(replay.fleet1.length, 6, 'fleet1 should contain 6 ships');
	assert.ok(Array.isArray(replay.fleet2), 'fleet2 should be an array');
	assert.strictEqual(replay.fleet2.length, 6, 'fleet2 should contain 6 escort ships');
	assert.ok(Array.isArray(replay.lbas), 'lbas should be an array');
	assert.strictEqual(replay.lbas.length, 3, 'lbas should contain 3 air corps');

	// What: Verify fleet1 ships and modernization/morale defaults
	const yamato = replay.fleet1[0];
	assert.strictEqual(yamato.mst_id, 916, 'Yamato Kai Ni Ju should resolve to mst_id 916');
	assert.strictEqual(yamato.level, 125, 'Yamato level should be 125');
	assert.deepStrictEqual(yamato.kyouka, [0, 0, 0, 0, 0, 0, 0], 'kyouka should be all zeroes');
	assert.strictEqual(yamato.morale, 50, 'morale should be defaulted to 50');
	assert.strictEqual(yamato.equip.length, 6, 'equip slots should be aligned to 6');

	// What: Verify Saratoga slot 0 resolves to 343 (流星改(一航戦/熟練)) despite slash in equipment name
	const saratoga = replay.fleet1[2];
	assert.strictEqual(
		saratoga.equip[0],
		343,
		'Saratoga slot 0 should resolve to 343 (流星改(一航戦/熟練))'
	);
	assert.strictEqual(saratoga.stars?.[0], 2, 'Saratoga slot 0 improvement stars should be 2');
	assert.strictEqual(saratoga.ace?.[0], 7, 'Saratoga slot 0 ace proficiency should be 7');

	// What: Verify battle structure and required fields
	assert.ok(Array.isArray(replay.battles), 'battles should be an array');
	assert.strictEqual(replay.battles.length, 1, 'battles should have 1 entry');

	const battle = replay.battles[0];
	assert.strictEqual(battle.node, 62, 'Battle node should be 62');
	assert.strictEqual(battle.rating, 'A', 'Battle rating should be A');
	assert.deepStrictEqual(battle.mvp, [1, 4], 'MVP should be fleet1 #1 and fleet2 #4');

	const data = battle.data;
	assert.ok(data && typeof data === 'object', 'battles[0].data must be present and an object');
	assert.deepStrictEqual(
		data.api_formation,
		[14, 14, 1],
		'api_formation should match Cruising Formation 4 and Parallel engagement'
	);
	assert.deepStrictEqual(
		data.api_f_maxhps,
		[107, 109, 89, 55, 69, 46],
		'api_f_maxhps should match parsed friend main fleet'
	);
	assert.deepStrictEqual(
		data.api_f_maxhps_combined,
		[39, 33, 43, 61, 41, 61],
		'api_f_maxhps_combined should match escort fleet'
	);
	assert.deepStrictEqual(
		data.api_ship_ke,
		[2373, 2361, 2119, 2119, 1956, 1956],
		'api_ship_ke should match enemy main ship IDs'
	);
	assert.deepStrictEqual(
		data.api_ship_ke_combined,
		[1905, 1862, 2051, 2051, 1623, 1623],
		'api_ship_ke_combined should match enemy escort IDs'
	);

	// What: Verify air base attacks and air battle phases
	assert.ok(Array.isArray(data.api_air_base_attack), 'api_air_base_attack should be an array');
	assert.strictEqual(
		data.api_air_base_attack.length,
		4,
		'api_air_base_attack should contain 4 waves'
	);
	assert.ok(data.api_kouku, 'api_kouku should be populated');
	assert.strictEqual(data.api_opening_flag, 1, 'Opening torpedo attack flag should be 1');
	assert.ok(data.api_opening_atack, 'api_opening_atack should be populated');

	// What: Verify special attack consolidation (Yamato/Musashi special shelling in hougeki1)
	assert.ok(data.api_hougeki1, 'api_hougeki1 must be present');
	assert.ok(
		data.api_hougeki1.api_at_type.includes(401),
		'api_hougeki1 should contain Yamato touch attackType 401'
	);
	const specialIdx = data.api_hougeki1.api_at_type.indexOf(401);
	assert.strictEqual(
		data.api_hougeki1.api_at_list[specialIdx],
		0,
		'Special attack trigger ship should be fleet1 #1 (index 0)'
	);
	assert.strictEqual(
		data.api_hougeki1.api_df_list[specialIdx].length,
		3,
		'Special attack should consolidate 3 defender targets into one turn'
	);
	assert.deepStrictEqual(
		data.api_hougeki1.api_damage[specialIdx],
		[685, 641, 1133],
		'Special attack damages should consolidate into [685, 641, 1133]'
	);
	assert.deepStrictEqual(
		data.api_hougeki1.api_cl_list[specialIdx],
		[1, 1, 2],
		'Special attack critical flags should consolidate into [1, 1, 2]'
	);

	// What: Verify night battle phase
	const yasen = battle.yasen;
	assert.ok(yasen && typeof yasen === 'object', 'battles[0].yasen must be present and an object');
	assert.deepStrictEqual(
		yasen.api_touch_plane,
		[469, -1],
		'Night touch plane should resolve to night recon plane ID 469'
	);
	assert.ok(yasen.api_hougeki, 'yasen.api_hougeki must be present');
	assert.strictEqual(
		yasen.api_hougeki.api_at_list.length,
		7,
		'Night battle should record 7 attack turns'
	);

	// What: Verify combined fleet night battle retreat animation prerequisites (api_active_deck [2, 1] and api_ship_ke_combined)
	assert.deepStrictEqual(
		yasen.api_active_deck,
		[2, 1],
		'yasen.api_active_deck should be [2, 1] for combined vs combined night battle'
	);
	assert.ok(
		Array.isArray(yasen.api_ship_ke_combined) && yasen.api_ship_ke_combined.length > 0,
		'yasen.api_ship_ke_combined must be present for retreat animation'
	);
	assert.deepStrictEqual(
		yasen.api_ship_ke_combined,
		data.api_ship_ke_combined,
		'yasen.api_ship_ke_combined should match dayData enemy escort fleet'
	);

	console.log('sample-62-3-62.txt conversion verified successfully!');

	console.log('\n=== Test 2: Verify reading and validating sample.txt (Reference KC3Kai JSON) ===');
	const sampleJsonPath = path.resolve(
		import.meta.dirname,
		'../../reference-source/sample-battle-data/sample.txt'
	);
	const textSampleJson = fs.readFileSync(sampleJsonPath, 'utf-8');

	// What: Parse JSON format sample directly and ensure ReplayData structure conforms
	const replayFromSample = convertBattleLogToReplay(textSampleJson);

	assert.ok(replayFromSample.fleet1, 'sample.txt must have fleet1');
	assert.ok(Array.isArray(replayFromSample.fleet1), 'sample.txt fleet1 must be an array');
	assert.ok(
		replayFromSample.battles && replayFromSample.battles.length > 0,
		'sample.txt must have battles'
	);

	const firstSampleBattle = replayFromSample.battles[0];
	assert.ok(firstSampleBattle.data, 'sample.txt first battle must have data');
	assert.ok(firstSampleBattle.data.api_formation, 'sample.txt data must have api_formation');
	assert.ok(firstSampleBattle.data.api_f_maxhps, 'sample.txt data must have api_f_maxhps');
	assert.ok(firstSampleBattle.data.api_ship_ke, 'sample.txt data must have api_ship_ke');

	console.log('sample.txt reference verification passed successfully!');

	console.log(
		'\n=== Test 3: Verify special attack maximum strike limits (e.g. 104: 2 strikes) ==='
	);
	// What: Verify SPECIAL_ATTACK_MAX_COUNTS mappings
	assert.strictEqual(
		SPECIAL_ATTACK_MAX_COUNTS[104],
		2,
		'Attack 104 (Kongo Night Attack) must have max 2 strikes'
	);
	assert.strictEqual(
		SPECIAL_ATTACK_MAX_COUNTS[200],
		2,
		'Attack 200 (Night Zuiun) must have max 2 strikes'
	);
	assert.strictEqual(
		SPECIAL_ATTACK_MAX_COUNTS[100],
		3,
		'Attack 100 (Nelson Touch) must have max 3 strikes'
	);
	assert.strictEqual(
		SPECIAL_ATTACK_MAX_COUNTS[101],
		3,
		'Attack 101 (Nagato) must have max 3 strikes'
	);
	assert.strictEqual(
		SPECIAL_ATTACK_MAX_COUNTS[401],
		3,
		'Attack 401 (Yamato 2-ship) must have max 3 strikes'
	);

	// What: Parse synthetic night battle log with Kongo-class night attack (104) and ensure 2-strike consolidation
	const kongoNightLog = `テスト海域 (1-1) セル: 1
深海棲艦主力艦隊

◆ 通常艦隊 対通常艦隊 夜戦 ◆
《戦力》
〈味方主力艦隊〉
#1: 戦艦 金剛改二丙 Lv. 99 HP: 82 / 82
  35.6cm連装砲改二, 35.6cm連装砲改二, 零式水上偵察機11型乙(熟練) >>, 九八式水上偵察機(夜連) >>
#2: 戦艦 比叡改二丙 Lv. 99 HP: 83 / 83
  35.6cm連装砲改二, 35.6cm連装砲改二, 零式水上偵察機11型乙(熟練) >>, 照明弾
#3: 戦艦 榛名改二乙 Lv. 99 HP: 81 / 81
  35.6cm連装砲改二, 35.6cm連装砲改二, 零式水上偵察機11型乙(熟練) >>, 一式徹甲弾

〈敵主力艦隊〉
#1: ID:1501 駆逐艦 駆逐イ級 Lv. 1 HP: 20 / 20
  [501] 5inch単装砲
#2: ID:1501 駆逐艦 駆逐イ級 Lv. 1 HP: 20 / 20
  [501] 5inch単装砲
#3: ID:1501 駆逐艦 駆逐イ級 Lv. 1 HP: 20 / 20
  [501] 5inch単装砲

《夜戦開始》

《夜戦》
金剛改二丙 #1 → 駆逐イ級 #1
[僚艦夜戦突撃] 150 Critical! ( 20 → 0 )

比叡改二丙 #2 → 駆逐イ級 #2
[僚艦夜戦突撃] 120 Dmg ( 20 → 0 )

榛名改二乙 #3 → 駆逐イ級 #3
[連続射撃] 80 Dmg , 75 Dmg ( 20 → 0 )

《戦闘終了》
`;

	const kongoReplay = convertBattleLogToReplay(kongoNightLog);
	assert.strictEqual(kongoReplay.battles.length, 1, 'Should produce 1 battle');
	const kongoYasen = kongoReplay.battles[0].yasen;
	assert.ok(kongoYasen && kongoYasen.api_hougeki, 'Yasen hougeki should be populated');

	const hougeki = kongoYasen.api_hougeki;
	assert.strictEqual(
		hougeki.api_at_list.length,
		2,
		'Should have exactly 2 turns (1 special attack + 1 double attack)'
	);
	assert.strictEqual(
		hougeki.api_sp_list[0],
		104,
		'First turn should be attackType 104 (Kongo special attack)'
	);
	assert.strictEqual(hougeki.api_at_list[0], 0, 'Trigger ship index should be 0 (Kongou)');
	assert.strictEqual(
		hougeki.api_df_list[0].length,
		2,
		'Kongo special attack must consolidate exactly 2 strikes'
	);
	assert.deepStrictEqual(hougeki.api_df_list[0], [0, 1], 'Targets must be enemy #1 (0) and #2 (1)');
	assert.deepStrictEqual(hougeki.api_damage[0], [150, 120], 'Damages must be [150, 120]');
	assert.deepStrictEqual(hougeki.api_cl_list[0], [2, 1], 'Critical flags must be [2, 1]');

	assert.strictEqual(
		hougeki.api_sp_list[1],
		1,
		'Second turn should be attackType 1 (Double attack)'
	);
	assert.strictEqual(hougeki.api_at_list[1], 2, 'Second turn attacker should be index 2 (Haruna)');
	assert.deepStrictEqual(hougeki.api_damage[1], [80, 75], 'Second turn damages should be [80, 75]');

	// What: Verify that 3 consecutive 104 actions are capped at 2 and partitioned into 2 turns (2 strikes + 1 strike)
	const threeActionsLog = `テスト海域 (1-1) セル: 1
深海棲艦主力艦隊

◆ 通常艦隊 対通常艦隊 夜戦 ◆
《戦力》
〈味方主力艦隊〉
#1: 戦艦 金剛改二丙 Lv. 99 HP: 82 / 82
#2: 戦艦 比叡改二丙 Lv. 99 HP: 83 / 83

〈敵主力艦隊〉
#1: ID:1501 駆逐艦 駆逐イ級 Lv. 1 HP: 20 / 20
#2: ID:1501 駆逐艦 駆逐イ級 Lv. 1 HP: 20 / 20

《夜戦開始》

《夜戦》
金剛改二丙 #1 → 駆逐イ級 #1
[僚艦夜戦突撃] 150 Critical! ( 20 → 0 )

比叡改二丙 #2 → 駆逐イ級 #2
[僚艦夜戦突撃] 120 Dmg ( 20 → 0 )

金剛改二丙 #1 → 駆逐イ級 #1
[僚艦夜戦突撃] 100 Dmg ( 20 → 0 )

《戦闘終了》
`;
	const threeActionsReplay = convertBattleLogToReplay(threeActionsLog);
	const threeHougeki = threeActionsReplay.battles[0].yasen.api_hougeki;
	assert.strictEqual(
		threeHougeki.api_at_list.length,
		2,
		'3 consecutive 104 attacks must be partitioned into 2 turns'
	);
	assert.strictEqual(threeHougeki.api_df_list[0].length, 2, 'Turn 1 must take 2 strikes');
	assert.strictEqual(threeHougeki.api_df_list[1].length, 1, 'Turn 2 must take remaining 1 strike');

	console.log('Kongo-class night attack (104) 2-strike consolidation verified successfully!');

	console.log('\n=== Test 4: Verify Friendly Fleet parsing and replay conversion ===');
	// What: Construct synthetic battle log with friendly fleet support phase
	const friendlyFleetLog = `テスト海域 (62-3) セル: 62 (ボス)
深海主力艦隊

◆ 通常艦隊 対通常艦隊 夜戦 ◆
《戦力》
〈味方主力艦隊〉
#1: 戦艦 金剛改二丙 Lv. 99 HP: 82 / 82
  35.6cm連装砲改二, 35.6cm連装砲改二

〈敵主力艦隊〉
#1: ID:1501 駆逐艦 駆逐イ級 Lv. 1 HP: 20 / 20
  [501] 5inch単装砲
#2: ID:1501 駆逐艦 駆逐イ級 Lv. 1 HP: 20 / 20
  [501] 5inch単装砲

〈友軍艦隊〉
#1: 駆逐艦 綾波改二 Lv. 99 HP: 37 / 37 - 火力72, 雷装89, 対空60, 装甲54
  12.7cm連装砲B型改二, 12.7cm連装砲B型改二, 照明弾
#2: 駆逐艦 敷波改二 Lv. 95 HP: 35 / 35 - 火力69, 雷装88, 対空59, 装甲53
  12.7cm連装砲A型改二, 12.7cm連装砲A型改二, 探照灯

《友軍艦隊援護》
自軍照明弾投射: 綾波改二 #1
敵軍探照灯照射: 駆逐イ級 #1

綾波改二 #1 → 駆逐イ級 #1
[連撃] 45 Critical! , 38 Dmg ( 20 → 0 )

敷波改二 #2 → 駆逐イ級 #2
[通常] 25 Dmg ( 20 → 0 )

《夜戦開始》

《夜戦》
金剛改二丙 #1 → 駆逐イ級 #1
[通常] 50 Dmg ( 0 → 0 )

《戦闘終了》
`;

	const parsedFriendly = parseBattleLog(friendlyFleetLog);
	assert.ok(parsedFriendly.friendlyFleet, 'friendlyFleet must be parsed');
	assert.strictEqual(parsedFriendly.friendlyFleet.length, 2, 'Should parse 2 friendly ships');
	assert.strictEqual(
		parsedFriendly.friendlyFleet[0].name,
		'綾波改二',
		'First friendly ship should be Ayanami'
	);
	assert.strictEqual(
		parsedFriendly.friendlyFleet[0].initialHp,
		37,
		'Ayanami initial HP should be 37'
	);
	assert.strictEqual(
		parsedFriendly.friendlyFleet[0].firepower,
		72,
		'Ayanami firepower should be 72'
	);
	assert.strictEqual(parsedFriendly.friendlyFleet[0].torpedo, 89, 'Ayanami torpedo should be 89');
	assert.strictEqual(
		parsedFriendly.friendlyFleet[0].equipments.length,
		3,
		'Ayanami should have 3 equipments'
	);

	assert.ok(parsedFriendly.friendlyBattle, 'friendlyBattle must be parsed');
	assert.strictEqual(
		parsedFriendly.friendlyBattle.flareFriend?.index,
		1,
		'Friendly flare ship index should be 1'
	);
	assert.strictEqual(
		parsedFriendly.friendlyBattle.searchlightEnemy?.index,
		1,
		'Enemy searchlight ship index should be 1'
	);
	assert.strictEqual(
		parsedFriendly.friendlyBattle.attacks.length,
		2,
		'Friendly battle should parse 2 attack actions'
	);

	const friendlyReplay = convertBattleLogToReplay(friendlyFleetLog);
	const friendlyBattleObj = friendlyReplay.battles[0];
	const friendlyYasen = friendlyBattleObj.yasen;

	assert.ok(friendlyYasen.api_friendly_info, 'yasen.api_friendly_info must be populated');
	const info = friendlyYasen.api_friendly_info;
	assert.strictEqual(info.api_ship_id.length, 2, 'api_ship_id should contain 2 ships');
	assert.deepStrictEqual(info.api_nowhps, [37, 35], 'api_nowhps should match initial HPs');
	assert.deepStrictEqual(info.api_maxhps, [37, 35], 'api_maxhps should match max HPs');
	assert.strictEqual(info.api_Slot.length, 2, 'api_Slot should contain slot arrays for 2 ships');
	assert.strictEqual(
		info.api_Slot[0].length,
		5,
		'api_Slot sub-arrays should be 5 slots aligned with -1 padding'
	);
	assert.deepStrictEqual(
		info.api_Param[0],
		[72, 89, 60, 54],
		'api_Param should match [火力, 雷装, 対空, 装甲]'
	);

	assert.ok(friendlyYasen.api_friendly_battle, 'yasen.api_friendly_battle must be populated');
	const fBat = friendlyYasen.api_friendly_battle;
	assert.deepStrictEqual(
		fBat.api_flare_pos,
		[0, -1],
		'api_flare_pos should have friendly flare index 0 and enemy -1'
	);
	assert.deepStrictEqual(fBat.api_touch_plane, [-1, -1], 'api_touch_plane should be [-1, -1]');
	assert.ok(fBat.api_hougeki, 'Friendly hougeki data must be present');
	assert.strictEqual(
		fBat.api_hougeki.api_at_list.length,
		2,
		'Friendly hougeki should contain 2 attack turns'
	);
	assert.deepStrictEqual(
		fBat.api_hougeki.api_at_list,
		[0, 1],
		'Friendly attackers should be indices [0, 1]'
	);
	assert.deepStrictEqual(
		fBat.api_hougeki.api_at_eflag,
		[0, 0],
		'Friendly attackers eflag should be [0, 0]'
	);
	assert.deepStrictEqual(
		fBat.api_hougeki.api_df_list,
		[[0, 0], [1]],
		'Targets should be enemy [0, 1]'
	);

	console.log('Friendly Fleet parsing and conversion verified successfully!');

	console.log('\n=== Test 5: Verify Opening ASW (《先制対潜》) parsing and replay conversion ===');
	// What: Verify opening ASW attack parsing when header is 《先制対潜》 instead of 《先制対潜攻撃》
	const openingAswLog = `テスト海域 (1-5) セル: 1
深海潜水艦隊

◆ 通常艦隊 対通常艦隊 昼戦 ◆
《戦力》
〈味方主力艦隊〉
#1: 海防艦 占守改 Lv. 99 HP: 15 / 15
  三式水中探信儀, 三式水中探信儀, 二式爆雷

〈敵主力艦隊〉
#1: ID:1531 潜水艦 潜水カ級 Lv. 1 HP: 27 / 27
  [513] 潜水艦魚雷

《戦闘開始》

《先制対潜》
占守改 #1 → 潜水カ級 #1
[通常] 45 Critical! ( 27 → 0 )

《砲撃戦》

《雷撃戦》

《戦闘終了》
`;
	const parsedAsw = parseBattleLog(openingAswLog);
	// What: Ensure openingTaisen attacks are parsed from 《先制対潜》
	assert.strictEqual(parsedAsw.phases.openingTaisen.length, 1, 'Should parse 1 opening ASW attack');
	assert.strictEqual(parsedAsw.phases.openingTaisen[0].attackerName, '占守改');
	assert.strictEqual(parsedAsw.phases.openingTaisen[0].damages[0], 45);

	const aswReplay = convertBattleLogToReplay(openingAswLog);
	const aswDay = aswReplay.battles[0].data as BattleDayApiData;
	// What: Verify opening ASW API flags in replay
	assert.strictEqual(aswDay.api_opening_taisen_flag, 1, 'api_opening_taisen_flag should be 1');
	assert.ok(aswDay.api_opening_taisen, 'api_opening_taisen should be present');
	assert.deepStrictEqual(aswDay.api_opening_taisen.api_at_list, [0]);
	assert.deepStrictEqual(aswDay.api_opening_taisen.api_damage, [[45]]);
	console.log('Opening ASW (《先制対潜》) verified successfully!');

	console.log('\n=== Test 6: Verify Air Battle without Stage 3 and plane extraction ===');
	// What: Verify air battle where only fighter combat occurs (no torpedo/bomb attacks), fPlaneFrom/ePlaneFrom null handling, and dynamic api_stage_flag
	const airOnlyLog = `テスト海域 (2-1) セル: 1
深海航空母艦隊

◆ 通常艦隊 対通常艦隊 昼戦 ◆
《戦力》
〈味方主力艦隊〉
#1: 戦艦 長門改二 Lv. 99 HP: 90 / 90
  41cm連装砲改二, 41cm連装砲改二
#2: 空母 加賀改 Lv. 99 HP: 79 / 79
  [18] 零式艦戦52型(熟練) >>, [18] 零式艦戦52型(熟練) >>

〈敵主力艦隊〉
#1: ID:1525 空母 軽母ヌ級 Lv. 1 HP: 50 / 50
  [518] 深海戦闘機
#2: ID:1501 駆逐艦 駆逐イ級 Lv. 1 HP: 20 / 20
  [501] 5inch単装砲

《戦闘開始》

《航空戦》
航空戦: 航空優勢
味方喪失機数: 1 / 36
敵喪失機数: 5 / 24

《第一次砲撃戦》
長門改二 #1 → 軽母ヌ級 #1
[通常] 80 Critical! ( 50 → 0 )

《戦闘終了》
`;
	const airOnlyReplay = convertBattleLogToReplay(airOnlyLog);
	const airDay = airOnlyReplay.battles[0].data as BattleDayApiData;
	assert.ok(airDay.api_kouku, 'api_kouku must be present');
	// What: Verify plane_from reflects aircraft-carrying ships (Friend: index 2 [2], Enemy: index 1 [1] because Nu-class has aircraft)
	assert.deepStrictEqual(
		airDay.api_kouku.api_plane_from,
		[[2], [1]],
		'api_plane_from should be [[2], [1]]'
	);
	// What: When there are no airstrike damage actions, api_stage3 must be null
	assert.strictEqual(
		airDay.api_kouku.api_stage3,
		null,
		'api_stage3 should be null when no airstrikes occur'
	);
	// What: api_stage_flag should reflect stage1, stage2 present and stage3 null -> [1, 1, 0]
	assert.deepStrictEqual(
		airDay.api_stage_flag,
		[1, 1, 0],
		'api_stage_flag should be [1, 1, 0] when stage3 is absent'
	);

	// What: Verify battle without any air battle has api_stage_flag null
	assert.strictEqual(
		aswDay.api_stage_flag,
		null,
		'Battle without air phase should have api_stage_flag null'
	);
	console.log('Air Battle stage flags and plane extraction verified successfully!');

	console.log(
		'\n=== Test 7: Verify Night-only battle (battle.data = {}) and friendly HP fallback ==='
	);
	// What: Test night-only battle log where daytime phases are completely absent
	const nightOnlyLog = `テスト海域 (5-3) セル: 1
深海夜戦艦隊

◆ 通常艦隊 対通常艦隊 夜戦 ◆
《戦力》
〈味方主力艦隊〉
#1: 重巡 鳥海改二 Lv. 99 HP: 58 / 58
  20.3cm(3号)連装砲, 20.3cm(3号)連装砲, 探照灯
#2: 駆逐艦 夕立改二 Lv. 99 HP: 31 / 31
  12.7cm連装砲B型改二, 12.7cm連装砲B型改二

〈敵主力艦隊〉
#1: ID:1505 重巡 重巡リ級elite Lv. 1 HP: 66 / 66
  [505] 20.3cm連装砲
#2: ID:1501 駆逐艦 駆逐イ級 Lv. 1 HP: 20 / 20
  [501] 5inch単装砲

〈友軍艦隊〉
#1: 駆逐艦 初霜改二 Lv. 90 HP: 0 / 32 - 火力60, 雷装84, 対空78, 装甲51
  61cm五連装(酸素)魚雷, 61cm五連装(酸素)魚雷

《友軍艦隊援護》
初霜改二 #1 → 駆逐イ級 #2
[通常] 30 Dmg ( 20 → 0 )

《夜戦開始》

《夜戦》
鳥海改二 #1 → 重巡リ級elite #1
[連撃] 80 Critical! , 75 Dmg ( 66 → 0 )

《戦闘終了》
`;
	const nightOnlyReplay = convertBattleLogToReplay(nightOnlyLog);
	const nightBattleObj = nightOnlyReplay.battles[0];

	// What: In night-only battles, battle.data must be an empty object {}
	assert.deepStrictEqual(
		nightBattleObj.data,
		{},
		'battle.data must be empty {} for night-only battles'
	);

	// What: In night-only battles, yasen must carry ship IDs, HPs, and fleet params
	const nYasen = nightBattleObj.yasen;
	assert.ok(nYasen.api_ship_ke, 'yasen.api_ship_ke must be set');
	assert.deepStrictEqual(
		nYasen.api_ship_ke,
		[1505, 1501],
		'yasen.api_ship_ke should match enemy IDs'
	);
	assert.deepStrictEqual(
		nYasen.api_f_nowhps,
		[58, 31],
		'yasen.api_f_nowhps should match friend initial HPs'
	);
	assert.deepStrictEqual(
		nYasen.api_e_nowhps,
		[66, 20],
		'yasen.api_e_nowhps should match enemy initial HPs'
	);

	// What: Verify friendly fleet HP fallback when initialHp is 0 (fallback to maxHp 32)
	assert.ok(nYasen.api_friendly_info, 'yasen.api_friendly_info must exist');
	assert.deepStrictEqual(
		nYasen.api_friendly_info.api_nowhps,
		[32],
		'Friendly ship with initialHp 0 should fallback to maxHp 32'
	);
	console.log('Night-only battle and friendly HP fallback verified successfully!');

	console.log(
		'\n=== Test 8: Verify 62-4 Boss (Friendly HP restoration, enemy counter-attack, night entry HP restoration) ==='
	);
	// What: Verify 62-4 boss battle with daytime + friendly fleet + midnight battle:
	// 1. Sakawa's HP restored from 7 back to 46 (full HP) from incoming damage action (46 -> 7)
	// 2. Enemy counter-attacks in friendly fleet phase are correctly flagged with isFriendAttacker: false and api_at_eflag: 1
	// 3. Enemy entry HPs for midnight battle are restored to pre-friendly values (205, 409, 76, combined 186)
	const log62_4 = `テスト海域 (62-4) セル: 68 (ボス)
深海ボス主力艦隊

◆ 通常艦隊 対連合艦隊 昼戦 ◆
《戦力》
〈味方主力艦隊〉
#1: 戦艦 大和改二 Lv. 99 HP: 98 / 98
  51cm連装砲, 51cm連装砲
#2: 戦艦 武蔵改二 Lv. 99 HP: 98 / 98
  51cm連装砲, 51cm連装砲

〈敵主力艦隊〉
#1: ID:2394 巡洋戦艦 仏蘭西哀重姫 Lv. 1 HP: 1220 / 1220
  [505] 20.3cm連装砲
#2: ID:2119 正規空母 空母夏姫II Lv. 1 HP: 900 / 900
  [518] 深海戦闘機
#3: ID:1525 軽空母 軽母ヌ級 Lv. 1 HP: 130 / 130
  [518] 深海戦闘機

〈敵随伴艦隊〉
#1: ID:2318 軽巡洋艦 軽巡ム級-壊 Lv. 1 HP: 470 / 470
  [505] 20.3cm連装砲

《戦闘開始》

《砲撃戦》
大和改二 #1 → 仏蘭西哀重姫 #1
[通常] 1015 Critical! ( 1220 → 205 )

武蔵改二 #2 → 空母夏姫II #2
[通常] 491 Critical! ( 900 → 409 )

◆ 通常艦隊 対連合艦隊 夜戦 ◆
《戦力》
〈敵主力艦隊〉
#1: ID:2394 巡洋戦艦 仏蘭西哀重姫 Lv. 1 HP: 205 / 1220
  [505] 20.3cm連装砲
#2: ID:2119 正規空母 空母夏姫II Lv. 1 HP: 409 / 900
  [518] 深海戦闘機
#3: ID:1525 軽空母 軽母ヌ級 Lv. 1 HP: 76 / 130
  [518] 深海戦闘機

〈敵随伴艦隊〉
#1: ID:2318 軽巡洋艦 軽巡ム級-壊 Lv. 1 HP: 186 / 470
  [505] 20.3cm連装砲

〈友軍艦隊〉
#1: 航空戦艦 伊勢改二 Lv. 99 HP: 98 / 98 - 火力152, 雷装0, 対空112, 装甲128
  瑞雲改二(六三四空), 彗星二二型(六三四空)
#2: 重巡洋艦 最上改二特 Lv. 99 HP: 53 / 53 - 火力81, 雷装81, 対空89, 装甲74
  20.3cm(3号)連装砲, 甲標的
#3: 軽巡洋艦 酒匂改 Lv. 99 HP: 7 / 46 - 火力66, 雷装82, 対空91, 装甲53
  15.2cm連装砲改, 15.2cm連装砲改

《友軍艦隊援護》
伊勢改二 #1 → 仏蘭西哀重姫 #1
[夜間瑞雲攻撃] 50 Dmg ( 205 → 155 )

最上改二特 #2 → 空母夏姫II #2
[夜間瑞雲攻撃] 23 Dmg , 149 Critical! ( 409 → 237 )

酒匂改 #3 → 軽巡ム級-壊 #7
[連撃] 30 Dmg ( 186 → 156 )

軽巡ム級-壊 #7 → 酒匂改 #3
[通常] 39 Dmg ( 46 → 7 )

軽母ヌ級 #3 → 伊勢改二 #1
[通常] 20 Dmg ( 98 → 78 )

《夜戦開始》

《夜戦》
大和改二 #1 → 仏蘭西哀重姫 #1
[連撃] 100 Critical! , 60 Dmg ( 155 → 0 )

《戦闘終了》
`;

	const parsed62_4 = parseBattleLog(log62_4);
	// What: Verify Sakawa's initialHp is restored from 7 to 46
	assert.ok(parsed62_4.friendlyFleet, 'Friendly fleet must be parsed');
	const sakawa = parsed62_4.friendlyFleet.find((s) => s.name === '酒匂改');
	assert.ok(sakawa, 'Sakawa must be in friendly fleet');
	assert.strictEqual(sakawa.initialHp, 46, 'Sakawa entry HP must be restored to 46 (full HP)');

	// What: Verify enemy counter-attacks in friendly fleet phase are parsed with isFriendAttacker: false
	assert.ok(parsed62_4.friendlyBattle, 'Friendly battle must be parsed');
	const friendlyAttacks = parsed62_4.friendlyBattle.attacks;
	assert.strictEqual(friendlyAttacks.length, 5, 'Should have 5 attack actions in friendly phase');

	// Attack 3: Mu-class -> Sakawa
	assert.strictEqual(friendlyAttacks[3].attackerName, '軽巡ム級-壊');
	assert.strictEqual(friendlyAttacks[3].targetName, '酒匂改');
	assert.strictEqual(
		friendlyAttacks[3].isFriendAttacker,
		false,
		'Mu-class counter-attack must be isFriendAttacker: false'
	);
	assert.strictEqual(friendlyAttacks[3].beforeHp, 46, 'Before HP of Sakawa must be 46');
	assert.strictEqual(friendlyAttacks[3].afterHp, 7, 'After HP of Sakawa must be 7');

	// Attack 4: Nu-class -> Ise
	assert.strictEqual(friendlyAttacks[4].attackerName, '軽母ヌ級');
	assert.strictEqual(friendlyAttacks[4].targetName, '伊勢改二');
	assert.strictEqual(
		friendlyAttacks[4].isFriendAttacker,
		false,
		'Nu-class counter-attack must be isFriendAttacker: false'
	);

	// What: Convert to replay and verify yasenResult properties
	const replay62_4 = convertBattleLogToReplay(log62_4);
	const battle62_4 = replay62_4.battles[0];
	const yasen62_4 = battle62_4.yasen;

	// What: Verify friendly info nowhps has restored HP for Sakawa (46)
	assert.ok(yasen62_4.api_friendly_info, 'yasen.api_friendly_info must exist');
	assert.deepStrictEqual(
		yasen62_4.api_friendly_info.api_nowhps,
		[98, 53, 46],
		'api_friendly_info.api_nowhps should be [98, 53, 46]'
	);

	// What: Verify friendly battle hougeki includes enemy counter-attacks with api_at_eflag: 1
	assert.ok(
		yasen62_4.api_friendly_battle?.api_hougeki,
		'api_friendly_battle.api_hougeki must exist'
	);
	const fHou = yasen62_4.api_friendly_battle.api_hougeki;
	assert.deepStrictEqual(
		fHou.api_at_eflag,
		[0, 0, 0, 1, 1],
		'api_at_eflag should be [0, 0, 0, 1, 1] (3 friendly attacks, 2 enemy counter-attacks)'
	);

	// What: Verify enemy entry HPs before friendly attacks
	assert.strictEqual(
		yasen62_4.api_e_nowhps?.[0],
		205,
		'yasen.api_e_nowhps[0] must be 205 (France Princess)'
	);
	assert.strictEqual(
		yasen62_4.api_e_nowhps?.[1],
		409,
		'yasen.api_e_nowhps[1] must be 409 (Summer CV)'
	);
	assert.strictEqual(
		yasen62_4.api_e_nowhps?.[2],
		76,
		'yasen.api_e_nowhps[2] must be 76 (Nu-class)'
	);
	assert.strictEqual(
		yasen62_4.api_e_nowhps_combined?.[0],
		186,
		'yasen.api_e_nowhps_combined[0] must be 186 (Mu-class)'
	);
	console.log('62-4 Boss HP restoration and enemy counter-attacks verified successfully!');

	console.log(
		'\n=== Test 9: Verify Shift_JIS file decoding and zero-aircraft air battle skipping ==='
	);
	const sjisLogPath = 'C:\\Users\\me\\Downloads\\BattleLog\\20260803_16365899@3-2-3.txt';
	const rawBuffer = fs.readFileSync(sjisLogPath);

	// What: Decode buffer using UTF-8 fatal with Shift_JIS fallback matching readFileAsText behavior
	let decodedText: string;
	try {
		const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
		decodedText = utf8Decoder.decode(rawBuffer);
	} catch {
		const sjisDecoder = new TextDecoder('shift_jis');
		decodedText = sjisDecoder.decode(rawBuffer);
	}

	// What: Verify Shift_JIS decoded text parses cell 3, enemy fleet name, and S victory
	const parsedSjis = parseBattleLog(decodedText);
	assert.strictEqual(parsedSjis.header.cell, 3, 'Parsed cell should be 3');
	assert.strictEqual(
		parsedSjis.header.enemyFleetName,
		'敵北方水雷戦隊',
		'Parsed enemy fleet name should be 敵北方水雷戦隊'
	);
	assert.strictEqual(parsedSjis.result?.rank, 'S', 'Battle result rank should be S');

	// What: Convert parsed log to replay and verify api_kouku and api_stage_flag are null
	const sjisReplay = convertBattleLogToReplay(decodedText);
	assert.strictEqual(sjisReplay.battles.length, 1, 'Replay should have 1 battle');
	const sjisBattle = sjisReplay.battles[0];
	assert.strictEqual(sjisBattle.node, 3, 'Battle node should be 3');
	assert.strictEqual(sjisBattle.rating, 'S', 'Battle rating should be S');

	const sjisData = sjisBattle.data as BattleDayApiData;
	assert.strictEqual(
		sjisData.api_kouku,
		null,
		'api_kouku should be null when both sides have no aircraft'
	);
	assert.strictEqual(
		sjisData.api_stage_flag,
		null,
		'api_stage_flag should be null when kouku is null'
	);
	console.log('Shift_JIS decoding and zero-aircraft skipping verified successfully!');

	// What: Export generated sample JSON for external inspectability
	const outputDir = path.resolve(import.meta.dirname, '../output');
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}
	const outputPath = path.join(outputDir, 'sample-62-3-62.replay.json');
	fs.writeFileSync(outputPath, JSON.stringify(replay, null, '\t'), 'utf-8');
	console.log(`\nGenerated replay saved to: ${outputPath}`);
}

main();
