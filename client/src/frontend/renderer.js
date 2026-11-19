
const panelRadios = document.querySelectorAll('input[name="panel"]');
const panels = document.querySelectorAll('.panel-content');

const sessionStartedAt = Date.now();
let requestCount = 0;
const apiRequestCountElement = document.getElementById('api-request-count');
const sessionDurationElement = document.getElementById('session-duration');
const requestsPerMinuteElement = document.getElementById('requests-per-minute');
const statusMessageElement = document.getElementById('status-message');
let latestStatusSequence = -1;

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
