function parseNumber(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
}

function parseInteger(value) {
    const parsed = parseNumber(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseElapsedMinutes(value) {
    const parsed = parseNumber(value);
    if (parsed === undefined || parsed < 0) return undefined;

    const wholeMinutes = Math.floor(parsed);
    return Number.isSafeInteger(wholeMinutes) ? wholeMinutes : undefined;
}

function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value?.toLowerCase?.() === 'true') return true;
    if (value === 0 || value === '0' || value?.toLowerCase?.() === 'false') return false;
    return undefined;
}

function describeType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function normalizePlayerData(playtime, misc) {
    const dino = misc?.dinoMetrics;
    const rawData = {
        bones: misc?.bones,
        meat: misc?.meat,
        minutes_played: playtime?.playtimeMinutes,
        is_prime: dino?.isPrime,
        current_dino: dino?.dino,
        username: misc?.discord?.username,
        location: dino?.location,
        level: playtime?.level,
        health: dino?.health,
        stamina: dino?.stamina,
        hunger: dino?.hunger,
        thirst: dino?.thirst,
        growth: dino?.growth
    };

    const data = {
        bones: parseInteger(rawData.bones),
        meat: parseInteger(rawData.meat),
        minutes_played: parseElapsedMinutes(rawData.minutes_played),
        is_prime: parseBoolean(rawData.is_prime),
        current_dino: typeof rawData.current_dino === 'string'
            ? rawData.current_dino
            : undefined,
        username: typeof rawData.username === 'string'
            ? rawData.username
            : undefined,
        location: {
            x: parseNumber(rawData.location?.x),
            y: parseNumber(rawData.location?.y)
        },
        level: parseInteger(rawData.level),
        health: parseNumber(rawData.health),
        stamina: parseNumber(rawData.stamina),
        hunger: parseNumber(rawData.hunger),
        thirst: parseNumber(rawData.thirst),
        growth: parseNumber(rawData.growth)
    };

    const invalidFields = Object.keys(data)
        .filter(field => data[field] === undefined)
        .map(field => `${field} (${describeType(rawData[field])})`);
    for (const axis of ['x', 'y']) {
        if (data.location[axis] === undefined) {
            invalidFields.push(`location.${axis} (${describeType(rawData.location?.[axis])})`);
        }
    }

    return invalidFields.length === 0
        ? { data, invalidFields }
        : { data: null, invalidFields };
}

module.exports = { normalizePlayerData };
