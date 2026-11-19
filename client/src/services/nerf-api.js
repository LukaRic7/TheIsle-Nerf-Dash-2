const fs = require('fs/promises');
const path = require('path');

const BASE_URL = 'https://api.nerfofficial.org';
const COOKIE_FILE = path.join(__dirname, '..', '..', 'config', 'environment', 'COOKIE');

class NerfApiStore {
    #api = null;
    
    #refreshTimestamps = null;
    #friendsListData = null;
    #latestCombatEvent = null;
    #playtimeAndLevel = null;
    #miscInformation = null;
    #heatmapPositions = null;
    #population = null;
    #pendingTeleportRequests = null;

    constructor() {
        this.#api = new NerfAPI();
        this.#refreshTimestamps = new Map();
        this.#heatmapPositions = new Array();
    }

    getTotalRequestsMade() {
        return this.#api.getTotalRequestsMade();
    }

    async initialize() {
        await this.#api.initialize();
    }

    getRefreshTimestamps() {
        return this.#refreshTimestamps;
    }

    getFriendsList() {
        return this.#friendsListData;
    }

    getLatestCombatEvent() {
        return this.#latestCombatEvent;
    }

    getPlaytimeAndLevel() {
        return this.#playtimeAndLevel;
    }

    getMiscInformation() {
        return this.#miscInformation;
    }

    getHeatmapPositions() {
        return this.#heatmapPositions;
    }

    getPopulation() {
        return this.#population;
    }

    getPendingTeleportRequests() {
        return this.#pendingTeleportRequests;
    }

    async refreshFriendsList() {
        try {
            const data = await this.#api.request('/api/social/friends');

            const allFriends = [data, ...data.friends];
            const friendsDict = Object.fromEntries(
                allFriends.map(({ discordId, online, activeDino, dinoImage, ...rest }) => [
                    discordId, rest
                ])
            );
            delete friendsDict.undefined;

            this.#friendsListData = friendsDict;
            this.#refreshTimestamps.friendsList = new Date().toISOString();
        } catch (error) {
            console.error(error);
        }
    }

    async refreshLatestCombatEvent() {
        try {
            const data = await this.#api.request('/api/combat-feed?limit=1');
            
            const entry = data.entries[0];
            delete entry.id, entry.region;

            this.#latestCombatEvent = entry;
            this.#refreshTimestamps.latestCombatEvent = new Date().toISOString();
        } catch (error) {
            console.error(error);
        }
    }

    async refreshPlaytimeAndLevel() {
        try {
            const data = await this.#api.request('/api/debug/kill-stats');

            this.#playtimeAndLevel = {
                playtimeMinutes: data.playtime_stats.total_minutes,
                level: data.user_stats.level
            };
            this.#refreshTimestamps.playtimeAndLevel = new Date().toISOString();
        } catch (error) {
            console.error(error);
        }
    }

    async refreshMiscInformation() {
        try {
            const data = await this.#api.request('/api/debug/db-structure');

            const location = data.userData.inUsers.lastKnownLocation;
            const vitals = data.userData.inUsers.lastKnownVitals;

            this.#miscInformation = {
                accountCreatedAt: data.userData.inUsers.createdAt,
                discord: {
                    id: data.userData.inUsers.discordId,
                    avatarUrl: userData.inUsers.discordAvatar,
                    username: serData.inUsers.discordUsername
                },
                cooldowns: {
                    skin: data.userData.inUsers.skin_cooldown,
                    teleport: data.userData.inUsers.teleport_cooldown,
                    park: data.userData.inUsers.park_cooldown,
                    redeem: data.userData.inUsers.redeem_cooldown,
                    slay: data.userData.inUsers.slay_cooldown
                },
                dinoMetrics: {
                    dino: data.userData.inUsers.lastKnownDino,
                    growth: data.userData.inUsers.lastKnownGrowth,
                    isPrime: data.userData.inUsers.lastKnownIsPrimeElder,
                    location: { x: location.x, y: location.y },
                    health: vitals.health,
                    stamina: vitals.stamina,
                    hunger: vitals.food,
                    thirst: vitals.water
                },
                bones: data.userData.inUsers.bones,
                meat: data.userData.inUsers.meat,
                skinPresets: data.userData.inUsers.skinCreatorPresets,
            }
            this.#refreshTimestamps.miscInformation = new Date().toISOString();
        } catch (error) {
            console.error(error);
        }
    }

    async refreshHeatmapPositions() {
        try {
            const data = await this.#api.request('/api/map-heatmap-positions');

            if (this.#refreshTimestamps.heatmapPositions == data.dataAsOf) {
                return;
            }

            const heatmapPositions = data.positions.map(({ z, ...rest }) => rest);

            this.#heatmapPositions.push(heatmapPositions);
            if (this.#heatmapPositions.length > 2) {
                this.#heatmapPositions.shift();
            }

            this.#refreshTimestamps.heatmapPositions = data.dataAsOf;
        } catch (error) {
            console.error(error);
        }
    }

    async refreshPopulation() {
        try {
            const data = await this.#api.request('/api/population-control');

            this.#population = Object.fromEntries(data.populations.map(({ species, count }) => [
                species, count
            ]));
            this.#refreshTimestamps.population = data.lastUpdated;
        } catch (error) {
            console.error(error);
        }
    }

    async refreshPendingTeleportRequests() {
        try {
            const data = await this.#api.request('/api/teleport-requests');

            this.#pendingTeleportRequests = data;            
            this.#refreshTimestamps.pendingTeleportRequests = new Date().toISOString();
        } catch (error) {
            console.error(error);
        }
    }

    async storeDino() {
        try {
            const response = this.#api.post('/store-dino', { server: 'EU' });
            console.log('"/api/store-dino" response:', response);
        } catch {
            console.error(error);
        }
    }

    async sendTeleportRequest(discordId) {
        try {
            const response = this.#api.post('/teleport-request', {
                targetDiscordId: discordId, server: 'EU'
            });
            console.log('"/api/teleport-request" response:', response);
        } catch {
            console.error(error);
        }
    }

    async acceptTeleportRequest(requestId) {
        try {
            const response = this.#api.post('/teleport-response', {
                requestId: requestId, accept: true
            });
            console.log('"/api/teleport-response" response:', response);
        } catch {
            console.error(error);
        }
    }

    async applySkin(isMale, pattern, variation, colors) {
        try {
            const response = this.#api.post('/teleport-response', {
                gender: isMale ? 'm' : 'f', pattern, skinVariation: variation, server: 'EU',
                glitchSkin: false, ...colors
            });
            console.log('"/api/apply-skin" response:', response);
        } catch {
            console.error(error);
        }
    }
};

class NerfAPI {
    #initialized = false;
    #cookie = null;
    #totalRequestsMade = 0;
    
    constructor() {}

    getTotalRequestsMade() {
        return this.#totalRequestsMade;
    }

    async initialize() {
        await this.reloadEnvironment();

        this.#initialized = true;

        console.debug('NerfAPI initialized!');
    }

    async reloadEnvironment() {
        // Read the files containing the cookie and user agent
        const cookie = await fs.readFile(COOKIE_FILE, 'utf-8');

        // Trim newline and other junk
        this.#cookie = cookie.trim();

        console.debug('Environment reloaded!');
    }

    async request(endpoint) {
        // Make we are initialized
        if (!this.#initialized) {
            throw new Error('NerfAPI has not been initialized!');
        }

        // Build the URL and headers
        const url = `${BASE_URL}${endpoint}`;
        console.debug(`Request URL: ${url}`);

        // Make the fetch
        const response = await fetch(url, {
            method: 'GET', headers: { 'Cookie': this.#cookie }, redirect: 'manual'
        });
        this.#totalRequestsMade++;
        console.debug(`Response Status: [${response.status}] ${response.statusText}`);

        // Check if the server says we are not authenticated
        const data = await response.json();
        if (data?.error === 'Not authenticated') {
            throw Error('Cookie is invalid!');
        }

        // Return JSON data no matter the response status code
        return data;
    }

    async post(endpoint, payload) {
        // Make we are initialized
        if (!this.#initialized) {
            throw new Error('NerfAPI has not been initialized!');
        }

        // Build the URL and headers
        const url = `${BASE_URL}${endpoint}`;
        console.debug(`Request URL: ${url}`);

        // Make the fetch
        const response = await fetch(url, {
            method: 'POST', headers: { 'Cookie': this.#cookie }, redirect: 'manual', body: payload
        });
        this.#totalRequestsMade++;
        console.debug(`Response Status: [${response.status}] ${response.statusText}`);
        
        // Check if the server says we are not authenticated
        const data = await response.json();
        if (data?.error === 'Not authenticated') {
            throw Error('Cookie is invalid!');
        }
        
        // Return JSON data no matter the response status code
        return data;
    }
};

module.exports = { NerfApiStore };