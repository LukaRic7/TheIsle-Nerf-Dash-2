
const panelRadios = document.querySelectorAll('input[name="panel"]');
const panels = document.querySelectorAll('.panel-content');

const sessionStartedAt = Date.now();
let requestCount = 0;
const apiRequestCountElement = document.getElementById('api-request-count');
const sessionDurationElement = document.getElementById('session-duration');
const requestsPerMinuteElement = document.getElementById('requests-per-minute');
const statusMessageElement = document.getElementById('status-message');
let latestStatusSequence = -1;
const playerGrid = document.getElementById('player-grid');
const playerServerStatusElement = document.getElementById('player-server-status');
const mapOverlay = document.getElementById('map-overlay');

const MAP_BOUNDS = {
    minX: -502000,
    maxX: 602000,
    minY: -607000,
    maxY: 512000
};

const playerStats = [
    { key: 'health', label: 'Health', image: 'health.png' },
    { key: 'stamina', label: 'Stamina', image: 'stamina.png' },
    { key: 'hunger', label: 'Hunger', image: 'food.png' },
    { key: 'thirst', label: 'Thirst', image: 'water.png' },
    { key: 'growth', label: 'Growth', image: 'growth.png' }
];

let currentDatapool = {};
let ownColor = null;

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function formatPlaytime(minutes) {
    const totalMinutes = Math.max(0, Math.floor(minutes));
    const hours = Math.floor(totalMinutes / 60);
    return `${hours}h ${totalMinutes % 60}m`;
}

function getPercent(value) {
    const percent = value <= 1 ? value * 100 : value;
    return Math.max(0, Math.min(100, percent));
}

function renderStat(data, definition) {
    const value = getPercent(data[definition.key]);
    const stat = createElement('div', 'player-stat');
    stat.title = definition.label;

    const icon = createElement('img');
    icon.src = `../../assets/${definition.image}`;
    icon.alt = '';

    const label = createElement('span', 'stat-label', definition.label);
    const track = createElement('div', `stat-track ${definition.key}`);
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', definition.label);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', value.toFixed(1));

    const bar = createElement('span');
    bar.style.width = `${value}%`;
    track.append(bar);

    const valueLabel = createElement('span', 'stat-value', `${value.toFixed(1)}%`);
    stat.append(icon, label, track, valueLabel);
    return stat;
}

function renderPlayer(color, data) {
    const card = createElement('article', 'player-card');
    if (color === ownColor) card.classList.add('is-self');
    card.style.setProperty('--player-color', color);

    const header = createElement('header', 'player-card-header');
    const dot = createElement('span', 'player-color-dot');
    dot.setAttribute('aria-label', 'Player color');
    const username = createElement('h3', '', data.username);
    header.append(dot, username);

    if (color === ownColor) {
        header.append(createElement('span', 'you-badge', 'YOU'));
    }

    const primeBadge = createElement('img', 'prime-badge');
    primeBadge.src = data.is_prime
        ? '../../assets/prime-star.png'
        : '../../assets/fraigl-star.png';
    primeBadge.alt = data.is_prime ? 'Prime' : 'Standard';
    header.append(primeBadge);

    const dinosaur = createElement('p', 'player-dinosaur', data.current_dino);
    const resources = createElement('div', 'player-resources');
    for (const [image, amount] of [
        ['bones.png', data.bones],
        ['meat.png', data.meat]
    ]) {
        const resource = createElement('span', 'resource');
        const icon = createElement('img');
        icon.src = `../../assets/${image}`;
        icon.alt = '';
        resource.append(icon, createElement('span', '', amount.toLocaleString()));
        resources.append(resource);
    }

    const playtime = createElement('p', 'player-playtime');
    const playtimeIcon = createElement('img');
    playtimeIcon.src = '../../assets/playtime.png';
    playtimeIcon.alt = '';
    playtime.append(
        playtimeIcon,
        createElement('span', '', formatPlaytime(data.minutes_played))
    );

    const stats = createElement('div', 'player-stats');
    for (const definition of playerStats) {
        stats.append(renderStat(data, definition));
    }

    card.append(header, dinosaur, resources, playtime, stats);
    return card;
}

function renderDatapool() {
    playerGrid.replaceChildren();
    mapOverlay.replaceChildren();
    const players = Object.entries(currentDatapool)
        .filter(([color]) => /^#[0-9a-f]{6}$/i.test(color));

    if (players.length === 0) {
        playerGrid.append(createElement(
            'p',
            'status-message',
            'Waiting for player data…'
        ));
        return;
    }

    for (const [color, data] of players) {
        playerGrid.append(renderPlayer(color, data));
        renderPlayerLocation(color, data);
    }
}

function renderPlayerLocation(color, data) {
    const x = data.location?.x;
    const y = data.location?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)
        || x < MAP_BOUNDS.minX || x > MAP_BOUNDS.maxX
        || y < MAP_BOUNDS.minY || y > MAP_BOUNDS.maxY) {
        return;
    }

    const dot = createElement('span', 'map-player-dot');
    dot.style.left = `${((x - MAP_BOUNDS.minX) / (MAP_BOUNDS.maxX - MAP_BOUNDS.minX)) * 100}%`;
    dot.style.top = `${((MAP_BOUNDS.maxY - y) / (MAP_BOUNDS.maxY - MAP_BOUNDS.minY)) * 100}%`;
    dot.style.setProperty('--player-color', color);
    dot.title = `${data.username} location`;
    dot.setAttribute('aria-label', `${data.username} location`);
    mapOverlay.append(dot);
}

function renderPlayerServerStatus(status) {
    if (!status) return;
    playerServerStatusElement.textContent = status.message;
    playerServerStatusElement.dataset.state = status.state;
    ownColor = status.color;
    renderDatapool();
}

window.playerServerAPI.onStatus(renderPlayerServerStatus);
window.playerServerAPI.onDatapool(datapool => {
    if (!datapool || typeof datapool !== 'object' || Array.isArray(datapool)) return;
    currentDatapool = datapool;
    renderDatapool();
});

window.playerServerAPI.getState()
    .then(({ status, datapool }) => {
        currentDatapool = datapool || {};
        renderPlayerServerStatus(status);
    })
    .catch(error => {
        console.error('Failed to retrieve player server state:', error);
    });

renderDatapool();

function renderStatusMessage(status) {
    if (!status || status.sequence < latestStatusSequence) return;

    latestStatusSequence = status.sequence;
    statusMessageElement.textContent = status.message;
}

window.settingsAPI.onStatusMessage(renderStatusMessage);

window.settingsAPI.getLatestStatus()
    .then(renderStatusMessage)
    .catch(error => {
        console.error('Failed to retrieve latest status:', error);
    });

function renderSessionMetrics() {
    const elapsedSeconds = Math.floor((Date.now() - sessionStartedAt) / 1000);
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;

    sessionDurationElement.textContent = `${hours}h ${minutes}m ${seconds}s`;
    requestsPerMinuteElement.textContent = elapsedSeconds === 0
        ? '0.0'
        : (requestCount * 60 / elapsedSeconds).toFixed(1);
}

async function updateApiRequestCount() {
    try {
        requestCount = await window.settingsAPI.getApiRequestCount();
        apiRequestCountElement.textContent = requestCount.toLocaleString();
        renderSessionMetrics();
    } catch (error) {
        console.error('Failed to retrieve API request count:', error);
    }
}

renderSessionMetrics();
updateApiRequestCount();
setInterval(() => {
    renderSessionMetrics();
    updateApiRequestCount();
}, 1000);

document.getElementById('cookie-form').addEventListener('submit', async event => {
    event.preventDefault();

    const cookieInput = document.getElementById('cookie-input');

    try {
        await window.settingsAPI.updateCookie(cookieInput.value);
        cookieInput.value = '';
    } catch (error) {
        console.error('Failed to update API cookie:', error);
    }
});

panelRadios.forEach(radio => {
    radio.addEventListener('change', () => {
        if (!radio.checked) return;

        panels.forEach(panel => {
            panel.classList.remove('active');
        });

        const selectedPanel = document.getElementById(`${radio.value}-panel`);

        if (selectedPanel) {
            selectedPanel.classList.add('active');
        }
    });
});
