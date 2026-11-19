const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizePlayerData } = require('../src/services/player-data.js');

test('normalizes numeric API values, fractional minutes, and database booleans', () => {
    const result = normalizePlayerData(
        { playtimeMinutes: 90.75, level: '2' },
        {
            bones: '125',
            meat: 3,
            discord: { username: 'Rook' },
            dinoMetrics: {
                isPrime: '0',
                dino: 'Gallimimus',
                location: { x: '-120000', y: '210000' },
                health: '92.4',
                stamina: 76.8,
                hunger: '64.1',
                thirst: 81.5,
                growth: '0.5'
            }
        }
    );

    assert.deepEqual(result, {
        data: {
            bones: 125,
            meat: 3,
            minutes_played: 90,
            is_prime: false,
            current_dino: 'Gallimimus',
            username: 'Rook',
            location: { x: -120000, y: 210000 },
            level: 2,
            health: 92.4,
            stamina: 76.8,
            hunger: 64.1,
            thirst: 81.5,
            growth: 0.5
        },
        invalidFields: []
    });
});

test('reports invalid field names and types without returning partial data', () => {
    const result = normalizePlayerData(
        { playtimeMinutes: 90, level: 2 },
        {
            bones: null,
            meat: 3,
            discord: { username: 'Rook' },
            dinoMetrics: {
                isPrime: 'unknown',
                dino: 'Gallimimus',
                location: { x: -120000, y: 210000 },
                health: 92.4,
                stamina: 76.8,
                hunger: 64.1,
                thirst: 81.5,
                growth: 0.5
            }
        }
    );

    assert.equal(result.data, null);
    assert.deepEqual(result.invalidFields, ['bones (null)', 'is_prime (string)']);
});
