import asyncio
import hmac
import json
import logging
import math
import os
import time
from dataclasses import dataclass
from typing import Any

from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed

from app.services.colors import ColorManager


logger = logging.getLogger(__name__)

INTEGER_FIELDS = ("bones", "meat", "minutes_played", "level")
BOOLEAN_FIELDS = ("is_prime",)
STRING_FIELDS = ("current_dino", "username")
FLOAT_FIELDS = ("health", "stamina", "hunger", "thirst", "growth")
DATA_FIELDS = frozenset(
    INTEGER_FIELDS + BOOLEAN_FIELDS + STRING_FIELDS + FLOAT_FIELDS
)


@dataclass
class ClientSession:
    color: str
    last_seen: float


class PlayerServer:
    def __init__(
        self,
        password: str,
        heartbeat_timeout: float = 45,
        heartbeat_check_interval: float = 5,
        auth_timeout: float = 10,
    ) -> None:
        if not password:
            raise ValueError("SERVER_PASSWORD must not be empty.")
        if heartbeat_timeout <= 0 or heartbeat_check_interval <= 0 or auth_timeout <= 0:
            raise ValueError("Timeout settings must be greater than zero.")

        self.password = password
        self.heartbeat_timeout = heartbeat_timeout
        self.heartbeat_check_interval = heartbeat_check_interval
        self.auth_timeout = auth_timeout
        self.clients: dict[ServerConnection, ClientSession] = {}
        self.datapool: dict[str, dict[str, Any]] = {}
        self._state_lock = asyncio.Lock()

    async def handler(self, websocket: ServerConnection) -> None:
        try:
            try:
                raw_message = await asyncio.wait_for(
                    websocket.recv(), timeout=self.auth_timeout
                )
            except TimeoutError:
                await self._reject(websocket, "authentication_timeout")
                return

            if not isinstance(raw_message, str):
                await self._reject(websocket, "invalid_message")
                return

            try:
                message = json.loads(raw_message)
            except json.JSONDecodeError:
                await self._reject(websocket, "invalid_json")
                return

            if (
                not isinstance(message, dict)
                or message.get("type") != "authenticate"
                or not isinstance(message.get("password"), str)
                or not hmac.compare_digest(message["password"], self.password)
            ):
                await self._reject(websocket, "authentication_failed")
                return

            async with self._state_lock:
                color = ColorManager.occupy()
                if color is None:
                    full = True
                else:
                    full = False
                    session = ClientSession(
                        color=color,
                        last_seen=time.monotonic(),
                    )
                    self.clients[websocket] = session
                    response = {
                        "type": "authenticated",
                        "color": color,
                        "datapool": self.datapool.copy(),
                    }
                    await websocket.send(json.dumps(response, separators=(",", ":")))

            if full:
                await self._reject(websocket, "server_full", close_code=1013)
                return

            async for raw_message in websocket:
                await self._handle_client_message(websocket, raw_message)
        except ConnectionClosed:
            pass
        finally:
            await self._remove_client(websocket)

    async def _handle_client_message(
        self, websocket: ServerConnection, raw_message: str | bytes
    ) -> None:
        if not isinstance(raw_message, str):
            await self._reject(websocket, "invalid_message")
            return

        try:
            message = json.loads(raw_message)
        except json.JSONDecodeError:
            await self._reject(websocket, "invalid_json")
            return

        if not isinstance(message, dict):
            await self._reject(websocket, "invalid_message")
            return

        message_type = message.get("type")
        if message_type == "heartbeat":
            async with self._state_lock:
                session = self.clients.get(websocket)
                if session is None:
                    return
                session.last_seen = time.monotonic()
            await websocket.send('{"type":"heartbeat_ack"}')
            return

        if message_type != "data":
            await self._reject(websocket, "unknown_message_type")
            return

        try:
            data = self._validate_data(message.get("data"))
        except ValueError as error:
            await self._reject(websocket, str(error))
            return

        async with self._state_lock:
            session = self.clients.get(websocket)
            if session is None:
                return
            session.last_seen = time.monotonic()
            self.datapool[session.color] = data
            await self._broadcast_datapool()

    async def _remove_client(self, websocket: ServerConnection) -> None:
        async with self._state_lock:
            session = self.clients.pop(websocket, None)
            if session is None:
                return

            self.datapool.pop(session.color, None)
            ColorManager.unassign(session.color)
            await self._broadcast_datapool()

    async def _expire_stale_clients(self) -> None:
        while True:
            await asyncio.sleep(self.heartbeat_check_interval)
            now = time.monotonic()

            async with self._state_lock:
                stale_clients = [
                    websocket
                    for websocket, session in self.clients.items()
                    if now - session.last_seen >= self.heartbeat_timeout
                ]
                for websocket in stale_clients:
                    session = self.clients.pop(websocket)
                    self.datapool.pop(session.color, None)
                    ColorManager.unassign(session.color)

                if stale_clients:
                    await self._broadcast_datapool()

            for websocket in stale_clients:
                await websocket.close(code=1001, reason="Heartbeat timeout")

    async def _broadcast_datapool(self) -> None:
        message = json.dumps(
            {"type": "datapool", "datapool": self.datapool},
            separators=(",", ":"),
        )
        recipients = tuple(self.clients)
        results = await asyncio.gather(
            *(websocket.send(message) for websocket in recipients),
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, BaseException):
                logger.warning(
                    "Failed to send datapool to a client; disconnect cleanup will "
                    "remove it: %s",
                    result,
                )

    async def _reject(
        self,
        websocket: ServerConnection,
        reason: str,
        close_code: int = 1008,
    ) -> None:
        await websocket.send(
            json.dumps(
                {"type": "error", "error": reason},
                separators=(",", ":"),
            )
        )
        await websocket.close(code=close_code, reason=reason)

    @staticmethod
    def _validate_data(data: Any) -> dict[str, Any]:
        if not isinstance(data, dict):
            raise ValueError("invalid_data")

        if set(data) != DATA_FIELDS:
            raise ValueError("invalid_data_fields")

        for field in INTEGER_FIELDS:
            if type(data[field]) is not int:
                raise ValueError(f"invalid_{field}")

        for field in BOOLEAN_FIELDS:
            if type(data[field]) is not bool:
                raise ValueError(f"invalid_{field}")

        for field in STRING_FIELDS:
            if not isinstance(data[field], str):
                raise ValueError(f"invalid_{field}")

        for field in FLOAT_FIELDS:
            value = data[field]
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or (isinstance(value, float) and not math.isfinite(value))
            ):
                raise ValueError(f"invalid_{field}")

        return data

    async def run(self, host: str, port: int) -> None:
        monitor = asyncio.create_task(self._expire_stale_clients())
        try:
            async with serve(
                self.handler,
                host,
                port,
                close_timeout=5,
                max_size=16_384,
            ):
                logger.info("WebSocket server listening on %s:%d", host, port)
                await asyncio.Future()
        finally:
            monitor.cancel()
            try:
                await monitor
            except asyncio.CancelledError:
                pass


def _positive_float_env(name: str, default: float) -> float:
    value = float(os.environ.get(name, str(default)))
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be a positive finite number.")
    return value


def main() -> None:
    password = os.environ.get("SERVER_PASSWORD")
    if password is None:
        raise RuntimeError("Set SERVER_PASSWORD before starting the server.")

    port = int(os.environ.get("PORT", "8765"))
    if not 1 <= port <= 65535:
        raise ValueError("PORT must be between 1 and 65535.")

    server = PlayerServer(
        password=password,
        heartbeat_timeout=_positive_float_env("HEARTBEAT_TIMEOUT_SECONDS", 45),
        heartbeat_check_interval=_positive_float_env(
            "HEARTBEAT_CHECK_INTERVAL_SECONDS", 5
        ),
        auth_timeout=_positive_float_env("AUTH_TIMEOUT_SECONDS", 10),
    )
    asyncio.run(server.run("0.0.0.0", port))


if __name__ == "__main__":
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    main()