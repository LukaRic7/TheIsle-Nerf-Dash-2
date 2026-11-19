const WebSocket = require('ws');

const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

class PlayerServerClient {
    #config;
    #onStatus;
    #onDatapool;
    #socket = null;
    #heartbeatTimer = null;
    #reconnectTimer = null;
    #reconnectAttempts = 0;
    #authenticated = false;
    #closed = false;
    #latestData = null;
    #color = null;

    constructor(config, { onStatus, onDatapool }) {
        if (!config || typeof config.host !== 'string' || !config.host.trim()) {
            throw new TypeError('Player server config must include a host.');
        }
        if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
            throw new TypeError('Player server config port must be between 1 and 65535.');
        }
        if (typeof config.password !== 'string' || !config.password) {
            throw new TypeError('Player server config must include a password.');
        }

        this.#config = config;
        this.#onStatus = onStatus;
        this.#onDatapool = onDatapool;
    }

    start() {
        this.#closed = false;
        this.#connect();
    }

    setData(data) {
        this.#latestData = data;
        this.#sendData();
    }

    close() {
        this.#closed = true;
        clearInterval(this.#heartbeatTimer);
        clearTimeout(this.#reconnectTimer);

        if (this.#socket?.readyState === WebSocket.OPEN) {
            this.#socket.close(1000, 'Client shutting down');
        } else if (this.#socket?.readyState === WebSocket.CONNECTING) {
            this.#socket.terminate();
        }
    }

    #connect() {
        if (this.#closed) return;

        const host = this.#config.host.includes(':') && !this.#config.host.startsWith('[')
            ? `[${this.#config.host}]`
            : this.#config.host;
        const url = `ws://${host}:${this.#config.port}`;
        this.#onStatus({
            state: this.#reconnectAttempts === 0 ? 'connecting' : 'reconnecting',
            color: this.#color,
            message: `Connecting to ${host}:${this.#config.port}…`
        });

        const socket = new WebSocket(url, { handshakeTimeout: 10_000 });
        this.#socket = socket;

        socket.on('open', () => {
            socket.send(JSON.stringify({
                type: 'authenticate',
                password: this.#config.password
            }));
        });

        socket.on('message', rawMessage => {
            this.#handleMessage(rawMessage);
        });

        socket.on('error', error => {
            console.error('Player server connection error:', error.message);
        });

        socket.on('close', (code, reason) => {
            this.#authenticated = false;
            clearInterval(this.#heartbeatTimer);
            this.#heartbeatTimer = null;

            if (this.#closed) return;

            const detail = reason.toString() || `connection closed (${code})`;
            this.#onStatus({
                state: 'reconnecting',
                color: this.#color,
                message: `Player server disconnected: ${detail}`
            });
            this.#scheduleReconnect();
        });
    }

    #handleMessage(rawMessage) {
        let message;
        try {
            message = JSON.parse(rawMessage.toString('utf8'));
        } catch (error) {
            console.error('Invalid JSON received from player server:', error);
            this.#socket.close(1002, 'Invalid JSON from server');
            return;
        }

        if (message?.type === 'authenticated') {
            if (typeof message.color !== 'string' || !message.datapool
                || typeof message.datapool !== 'object' || Array.isArray(message.datapool)) {
                console.error('Player server returned an invalid authentication response.');
                this.#socket.close(1002, 'Invalid authentication response');
                return;
            }

            this.#authenticated = true;
            this.#reconnectAttempts = 0;
            this.#color = message.color;
            this.#onStatus({
                state: 'connected',
                color: this.#color,
                message: `Connected to player server as ${this.#color}`
            });
            this.#onDatapool(message.datapool);
            this.#heartbeatTimer = setInterval(() => {
                this.#send({ type: 'heartbeat' });
            }, HEARTBEAT_INTERVAL_MS);
            this.#sendData();
            return;
        }

        if (message?.type === 'datapool' && message.datapool
            && typeof message.datapool === 'object' && !Array.isArray(message.datapool)) {
            this.#onDatapool(message.datapool);
            return;
        }

        if (message?.type === 'error') {
            this.#onStatus({
                state: 'error',
                color: this.#color,
                message: `Player server rejected the connection: ${message.error || 'unknown error'}`
            });
            return;
        }

        if (message?.type !== 'heartbeat_ack') {
            console.warn('Ignoring unknown player server message.');
        }
    }

    #sendData() {
        if (this.#authenticated && this.#latestData) {
            this.#send({ type: 'data', data: this.#latestData });
        }
    }

    #send(message) {
        if (this.#authenticated && this.#socket?.readyState === WebSocket.OPEN) {
            this.#socket.send(JSON.stringify(message), error => {
                if (error) {
                    console.error('Failed to send player server message:', error);
                }
            });
        }
    }

    #scheduleReconnect() {
        if (this.#closed || this.#reconnectTimer) return;

        const delay = Math.min(
            1_000 * (2 ** this.#reconnectAttempts),
            MAX_RECONNECT_DELAY_MS
        );
        this.#reconnectAttempts++;
        this.#reconnectTimer = setTimeout(() => {
            this.#reconnectTimer = null;
            this.#connect();
        }, delay);
    }
}

module.exports = { PlayerServerClient };
