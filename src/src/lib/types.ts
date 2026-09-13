export interface ReplayData {
	id: number;
	now_maphp?: number;
	max_maphp?: number;
	defeat_count?: number;
	required_defeat_count?: number;
	world: number;
	mapnum: number;
	fleetnum: number;
	combined: number;
	fleet1: ReplayShip[];
	fleet2?: ReplayShip[];
	fleet3?: ReplayShip[];
	fleet4?: ReplayShip[];
	support1?: number;
	support2?: number;
	lbas?: ReplayAirBase[];
	time: number;
	battles: ReplayBattle[];
}

export interface ReplayShip {
	mst_id: number;
	level: number;
	kyouka: number[];
	morale: number;
	equip: number[];
	stars?: number[];
	ace?: number[];
}

export interface ReplayAirBase {
	rid: number;
	range?: {
		api_base: number;
		api_bonus: number;
	};
	action: number;
	planes: ReplayAirBaseSquadron[];
}

export interface ReplayAirBaseSquadron {
	mst_id: number;
	count: number;
	stars?: number;
	ace?: number;
	state?: number;
	morale?: number;
}

export interface ReplayBattle {
	sortie_id: number;
	node: number;
	data: BattleDayApiData | Record<string, never>;
	yasen: BattleNightApiData | Record<string, never>;
	rating?: string;
	drop?: number;
	time?: number;
	baseEXP?: number;
	hqEXP?: number;
	mvp?: number[];
	id?: number;
}

export interface AirBaseAttackApi {
	api_base_id: number;
	api_plane_from: [number[] | null, number[] | null];
	api_squadron_plane: {
		api_count: number;
		api_mst_id: number;
	}[];
	api_stage1: {
		api_disp_seiku: number;
		api_e_count: number;
		api_e_lostcount: number;
		api_f_count: number;
		api_f_lostcount: number;
		api_touch_plane: [number, number];
	};
	api_stage2: {
		api_air_fire: {
			api_idx: number;
			api_kind: number;
			api_use_items: number[];
		} | null;
		api_e_count: number;
		api_e_lostcount: number;
		api_f_count: number;
		api_f_lostcount: number;
	};
	api_stage3: {
		api_ebak_flag: number[];
		api_ecl_flag: number[];
		api_edam: number[];
		api_erai_flag: number[];
		api_fbak_flag: number[];
		api_fcl_flag: number[];
		api_fdam: number[];
		api_frai_flag: number[];
	};
	api_stage3_combined?: {
		api_ebak_flag: number[] | null;
		api_ecl_flag: number[] | null;
		api_edam: number[] | null;
		api_erai_flag: number[] | null;
		api_fbak_flag: number[] | null;
		api_fcl_flag: number[] | null;
		api_fdam: number[] | null;
		api_frai_flag: number[] | null;
	} | null;
	api_stage_flag: [number, number, number];
}

export interface KoukuApi {
	api_plane_from: [number[] | null, number[] | null];
	api_stage1: {
		api_disp_seiku: number;
		api_e_count: number;
		api_e_lostcount: number;
		api_f_count: number;
		api_f_lostcount: number;
		api_touch_plane: [number, number];
	};
	api_stage2: {
		api_air_fire: {
			api_idx: number;
			api_kind: number;
			api_use_items: number[];
		} | null;
		api_e_count: number;
		api_e_lostcount: number;
		api_f_count: number;
		api_f_lostcount: number;
	};
	api_stage3: {
		api_ebak_flag: number[];
		api_ecl_flag: number[];
		api_edam: number[];
		api_erai_flag: number[];
		api_fbak_flag: number[];
		api_fcl_flag: number[];
		api_fdam: number[];
		api_frai_flag: number[];
	} | null;
	api_stage3_combined?: {
		api_ebak_flag: number[] | null;
		api_ecl_flag: number[] | null;
		api_edam: number[] | null;
		api_erai_flag: number[] | null;
		api_fbak_flag: number[] | null;
		api_fcl_flag: number[] | null;
		api_fdam: number[] | null;
		api_frai_flag: number[] | null;
	} | null;
}

export interface HougekiApi {
	api_at_eflag: number[];
	api_at_list: number[];
	api_at_type: number[];
	api_cl_list: number[][];
	api_damage: number[][];
	api_df_list: number[][];
	api_si_list: (string | number)[][];
}

export interface RaigekiApi {
	api_ecl: number[];
	api_edam: number[];
	api_erai: number[];
	api_eydam: number[];
	api_fcl: number[];
	api_fdam: number[];
	api_frai: number[];
	api_fydam: number[];
}

export interface SupportInfoApi {
	api_support_airatack: unknown | null;
	api_support_hourai: {
		api_cl_list: number[];
		api_damage: number[];
		api_deck_id: number;
		api_ship_id: number[];
		api_undressing_flag: number[];
	} | null;
}

export interface BattleDayApiData {
	api_deck_id: number;
	api_formation: [number, number, number];
	api_f_nowhps: number[];
	api_f_maxhps: number[];
	api_f_nowhps_combined?: number[];
	api_f_maxhps_combined?: number[];
	api_ship_ke: number[];
	api_ship_lv: number[];
	api_e_nowhps: number[];
	api_e_maxhps: number[];
	api_eParam: [number, number, number, number][];
	api_eSlot: number[][];
	api_ship_ke_combined?: number[];
	api_ship_lv_combined?: number[];
	api_e_nowhps_combined?: number[];
	api_e_maxhps_combined?: number[];
	api_eParam_combined?: [number, number, number, number][];
	api_eSlot_combined?: number[][];
	api_fParam: [number, number, number, number][];
	api_fParam_combined?: [number, number, number, number][];
	api_search: [number, number];
	api_air_base_attack?: AirBaseAttackApi[] | null;
	api_air_base_injection?: unknown | null;
	api_stage_flag: [number, number, number] | null;
	api_kouku: KoukuApi | null;
	api_injection_kouku?: unknown | null;
	api_support_flag: number;
	api_support_info: SupportInfoApi | null;
	api_opening_taisen_flag: number;
	api_opening_taisen: HougekiApi | null;
	api_opening_flag: number;
	api_opening_atack: RaigekiApi | null;
	api_hourai_flag: [number, number, number, number];
	api_hougeki1: HougekiApi | null;
	api_hougeki2: HougekiApi | null;
	api_hougeki3: HougekiApi | null;
	api_raigeki: RaigekiApi | null;
	api_midnight_flag: number;
	api_smoke_type?: number;
	api_balloon_cell?: number;
	api_escape_idx?: number[] | null;
	api_escape_idx_combined?: number[] | null;
}

export interface YasenHougekiApi {
	api_at_eflag?: number[];
	api_at_list: number[];
	api_cl_list: number[][];
	api_damage: number[][];
	api_df_list: number[][];
	api_si_list: (string | number)[][];
	api_sp_list: number[];
}

export interface FriendlyInfoApi {
	api_ship_id: number[];
	api_nowhps: number[];
	api_maxhps: number[];
	api_Slot: number[][];
	api_Param: [number, number, number, number][];
}

export interface FriendlyBattleApi {
	api_flare_pos: [number, number];
	api_touch_plane: [number, number];
	api_hougeki: YasenHougekiApi | HougekiApi | null;
}

export interface BattleNightApiData {
	api_deck_id?: number;
	api_active_deck?: [number, number];
	api_ship_ke?: number[];
	api_ship_lv?: number[];
	api_nowhps?: number[];
	api_maxhps?: number[];
	api_f_nowhps?: number[];
	api_f_maxhps?: number[];
	api_f_nowhps_combined?: number[];
	api_f_maxhps_combined?: number[];
	api_e_nowhps?: number[];
	api_e_maxhps?: number[];
	api_eParam?: [number, number, number, number][];
	api_eSlot?: number[][];
	api_ship_ke_combined?: number[];
	api_ship_lv_combined?: number[];
	api_e_nowhps_combined?: number[];
	api_e_maxhps_combined?: number[];
	api_eParam_combined?: [number, number, number, number][];
	api_eSlot_combined?: number[][];
	api_fParam?: [number, number, number, number][];
	api_fParam_combined?: [number, number, number, number][];
	api_touch_plane: [number, number];
	api_flare_pos: [number, number];
	api_hougeki: YasenHougekiApi | null;
	api_friendly_info?: FriendlyInfoApi | null;
	api_friendly_battle?: FriendlyBattleApi | null;
}

export interface ParsedHeader {
	mapAreaName: string;
	world: number;
	mapnum: number;
	difficulty?: string;
	cell: number;
	isBoss: boolean;
	gaugeType?: 'HP' | 'TP' | '撃破';
	gaugeNum?: number;
	currentGauge?: number;
	maxGauge?: number;
	enemyFleetName?: string;
	battleTitle?: string;
	combinedType: number;
}

export interface ParsedEquipment {
	name: string;
	aircraft?: number;
	stars?: number;
	ace?: number;
	rawId?: number;
}

export interface ParsedShip {
	index: number;
	shipType: string;
	name: string;
	level: number;
	initialHp: number;
	maxHp: number;
	firepower: number;
	torpedo: number;
	aa: number;
	armor: number;
	isEscaped?: boolean;
	equipments: ParsedEquipment[];
	shipId?: number;
}

export interface ParsedAirBaseSquadron {
	name: string;
	count?: number;
	stars?: number;
	ace?: number;
}

export interface ParsedAirBase {
	name: string;
	action: string;
	actionId: number;
	airPowerMin?: number;
	airPowerMax?: number;
	squadrons: ParsedAirBaseSquadron[];
}

export interface ParsedForces {
	friendMain: ParsedShip[];
	friendEscort?: ParsedShip[];
	enemyMain: ParsedShip[];
	enemyEscort?: ParsedShip[];
	airBases: ParsedAirBase[];
	supportFleet?: ParsedShip[];
	friendlyFleet?: ParsedShip[];
}

export interface ParsedSearching {
	formationFriend: number;
	formationEnemy: number;
	engagementForm: number;
	searchingFriend: number;
	searchingEnemy: number;
	smokeCount?: number;
	isBalloonCell?: boolean;
	isAtollCell?: boolean;
}

export interface ParsedAirBattleStage {
	airSuperiority?: number;
	friendLost?: number;
	friendTotal?: number;
	enemyLost?: number;
	enemyTotal?: number;
	touchFriend?: string;
	touchEnemy?: string;
	antiAirCutIn?: {
		shipName: string;
		shipLevel?: number;
		kindName: string;
		kindId: number;
	};
}

export interface ParsedAttackAction {
	attackerName: string;
	attackerIndex: number;
	isFriendAttacker: boolean;
	targetName: string;
	targetIndex: number;
	isGuard: boolean;
	damages: number[];
	criticalTypes: number[];
	attackKind?: string;
	attackTypeId?: number;
	beforeHp?: number;
	afterHp?: number;
}

export interface ParsedAirBaseWave {
	waveIndex: number;
	squadrons: { name: string; count: number }[];
	stage1?: ParsedAirBattleStage;
	stage2?: ParsedAirBattleStage;
	attacks: ParsedAttackAction[];
}

export interface ParsedAirBattle {
	stage1?: ParsedAirBattleStage;
	stage2?: ParsedAirBattleStage;
	attacks: ParsedAttackAction[];
}

export interface ParsedSupportAttack {
	fleet?: ParsedShip[];
	attacks: ParsedAttackAction[];
}

export interface ParsedBattlePhases {
	airBaseAttacks: ParsedAirBaseWave[];
	airBattle?: ParsedAirBattle;
	supportAttack?: ParsedSupportAttack;
	openingTaisen: ParsedAttackAction[];
	openingRaigeki: ParsedAttackAction[];
	hougeki1: ParsedAttackAction[];
	hougeki2: ParsedAttackAction[];
	hougeki3: ParsedAttackAction[];
	raigeki: ParsedAttackAction[];
}

export interface ParsedFriendlyBattle {
	flareFriend?: { name: string; index: number };
	flareEnemy?: { name: string; index: number };
	searchlightFriend?: { name: string; index: number };
	searchlightEnemy?: { name: string; index: number };
	attacks: ParsedAttackAction[];
}

export interface ParsedNightBattle {
	touchFriend?: string;
	touchEnemy?: string;
	searchlightFriend?: { name: string; index: number };
	searchlightEnemy?: { name: string; index: number };
	flareFriend?: { name: string; index: number };
	flareEnemy?: { name: string; index: number };
	attacks: ParsedAttackAction[];
}

export interface ParsedBattleResult {
	rank: string;
	mvpMain?: string;
	mvpEscort?: string;
	admiralExp: number;
	baseExp: number;
	dropName?: string;
	dropType?: string;
}

export interface ParsedBattleLog {
	header: ParsedHeader;
	forces: ParsedForces;
	searching?: ParsedSearching;
	phases: ParsedBattlePhases;
	nightBattle?: ParsedNightBattle;
	friendlyFleet?: ParsedShip[];
	friendlyBattle?: ParsedFriendlyBattle;
	result?: ParsedBattleResult;
	nightInitialEnemyHps?: {
		main: number[];
		escort?: number[];
	};
	nightInitialFriendHps?: {
		main: number[];
		escort?: number[];
	};
}
