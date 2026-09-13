import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveEquipId, resolveShipId } from './replayBuilder.js';

describe('replayBuilder accent-insensitive ID resolution', () => {
	it('What: resolveShipId resolves canonical accented ship names', () => {
		assert.equal(resolveShipId('Algérie'), 1051);
		assert.equal(resolveShipId('Algérie改'), 1056);
		assert.equal(resolveShipId('Béarn'), 1055);
		assert.equal(resolveShipId('Béarn改'), 1060);
		assert.equal(resolveShipId('Béarn amélioration'), 1061);
	});

	it('What: resolveShipId resolves unaccented ASCII ship names from Shift_JIS logs', () => {
		assert.equal(resolveShipId('Algerie'), 1051);
		assert.equal(resolveShipId('Algerie改'), 1056);
		assert.equal(resolveShipId('Bearn'), 1055);
		assert.equal(resolveShipId('Bearn改'), 1060);
		assert.equal(resolveShipId('Bearn amelioration'), 1061);
	});

	it('What: resolveShipId resolves ship names with level suffix in logs', () => {
		assert.equal(resolveShipId('Algerie Lv. 42'), 1051);
		assert.equal(resolveShipId('Gloire改 Lv. 55'), 970);
	});

	it('What: resolveEquipId resolves canonical accented equipment names', () => {
		assert.equal(resolveEquipId('Laté 298B'), 194);
		assert.equal(resolveEquipId('13.8cm単装砲 Modèle 1927'), 579);
		assert.equal(resolveEquipId('55cm三連装魚雷 Modèle 1924'), 580);
	});

	it('What: resolveEquipId resolves unaccented ASCII equipment names from Shift_JIS logs', () => {
		assert.equal(resolveEquipId('Late 298B'), 194);
		assert.equal(resolveEquipId('13.8cm単装砲 Modele 1927'), 579);
		assert.equal(resolveEquipId('55cm三連装魚雷 Modele 1924'), 580);
		assert.equal(resolveEquipId('WG42 (Wurfgerat 42)'), 126);
	});
});
