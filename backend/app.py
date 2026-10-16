import asyncio
import logging
import os
import re
import sqlite3
import time
import unicodedata
from contextlib import asynccontextmanager
from typing import Annotated
from urllib.parse import unquote

import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.sse import EventSourceResponse, ServerSentEvent

from models import (
    FinishRequest,
    GhostRun,
    JoinRequest,
    LeaderboardEntry,
    MapRequest,
    Me,
    RunFinishRequest,
    RunFinishResponse,
    RunStartRequest,
    RunStartResponse,
    Seed,
    StateRequest,
    TokenRequest,
    User,
)
from rooms import Listener, Player, Room, RoomError, RoomLimitError, RoomManager, check_finish_time, encode, now_ms
from store import Store

# Load the .env file from the project root (Docker passes the variables in directly)
load_dotenv()

# Under uvicorn the root logger has no handler of its own; a no-op when one is already set up
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("windrider")

ROOM_CODE = re.compile(r"^[A-Z0-9]{5,8}$")
# The browser's own id (see models.ClientId), sent as the X-Client-Id header on GET requests
CLIENT_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
DB_PATH = os.path.join(os.getenv("DATA_DIR", "data"), "game.db")


class RateLimiter:
    """At most `max_requests` per key (an IP) in any `window_seconds`, in memory."""

    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.hits: dict[str, list[float]] = {}
        self.last_sweep = 0.0

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        if now - self.last_sweep > self.window_seconds:
            # Forget keys that went quiet, so the dict doesn't grow with every IP ever seen
            self.hits = {k: v for k, v in self.hits.items() if v and now - v[-1] < self.window_seconds}
            self.last_sweep = now
        recent = [t for t in self.hits.get(key, []) if now - t < self.window_seconds]
        if len(recent) >= self.max_requests:
            self.hits[key] = recent
            return False
        recent.append(now)
        self.hits[key] = recent
        return True


# Position updates (POST .../state, ~15 a second) are exempt; everything else a client writes is rare
write_limiter = RateLimiter(60, 60)
start_limiter = RateLimiter(10, 60)

rooms = RoomManager()
# Finished runs and solo runs in progress: opened when the server starts (see lifespan), closed when it stops
store: Store | None = None


def get_store() -> Store:
    if store is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The server is starting up, try again in a moment")
    return store


@asynccontextmanager
async def lifespan(_: FastAPI):
    global store
    try:
        store = Store(DB_PATH)
    except (OSError, sqlite3.OperationalError) as e:
        # A missing volume, a read-only directory, a corrupt file: say so, instead of failing on the first request
        log.error("Can't open the game database at %s: %s", DB_PATH, e)
        raise RuntimeError(f"Can't open the game database at {DB_PATH}: {e}") from e
    log.info("Game database open at %s", DB_PATH)
    # The tick loop moves races along and relays positions ~15 times a second
    ticker = asyncio.create_task(rooms.run())
    try:
        yield
    finally:
        ticker.cancel()
        store.close()
        store = None
        log.info("Game database closed")


# The interactive API docs are off unless API_DOCS=1 (handy in development, not for players)
api_docs = os.getenv("API_DOCS", "") == "1"
app = FastAPI(
    lifespan=lifespan,
    docs_url="/api/docs" if api_docs else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if api_docs else None,
)


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    """Anything an endpoint didn't expect: logged with its traceback, answered with a plain 500"""
    log.exception("Unhandled error on %s %s: %r", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "Server error. Please try again."})


@app.middleware("http")
async def require_flight_rules(request: Request, call_next):
    path = request.url.path
    gameplay = path.startswith("/api/rooms/") or path.startswith("/api/runs/")
    if request.method == "POST" and gameplay and not path.endswith("/leave"):
        if request.headers.get("X-Flight-Rules") != "speed-control-v3":
            return JSONResponse(status_code=409, content={"detail": "Flight controls have changed. Reload the game to continue."})
    return await call_next(request)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    path = request.url.path
    if request.method == "POST" and path.startswith("/api/") and not path.endswith("/state"):
        # Caddy passes the real address on (X-Forwarded-For); uvicorn puts it in client.host
        ip = request.client.host if request.client else "unknown"
        limited = not write_limiter.allow(ip) or (path == "/api/runs/start" and not start_limiter.allow(ip))
        if limited:
            return JSONResponse(status_code=429, content={"detail": "Too many requests, please slow down"})
    return await call_next(request)


def clean_name(name: str) -> str:
    # Control characters (Cc: newlines, tabs, NUL...) become spaces and get collapsed below;
    # format characters (Cf: zero-width joiners, direction overrides) are dropped
    name = "".join(" " if unicodedata.category(c) == "Cc" else c for c in name if unicodedata.category(c) != "Cf")
    return " ".join(name.split())[:24]


# Every endpoint that needs the current user calls this with its request
def trust_user_headers() -> bool:
    """The VIScon portal sets X-User-Id/X-User-Name in front of port 8080; anywhere else a browser
    could send them itself. Only trusted when TRUST_USER_HEADERS=1 (docker-compose.yml sets it)"""
    return os.getenv("TRUST_USER_HEADERS", "") == "1"


def extract_user(request: Request, client_id: str = "", nickname: str = "") -> User:
    id = ""
    if trust_user_headers():
        if len(request.headers.getlist("X-User-Id")) > 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "ambiguous identity")
        id = request.headers.get("X-User-Id", "").strip()
    if id:
        name = request.headers.get("X-User-Name")
        # The VIScon proxy percent-encodes non-ASCII characters (e.g. "Zo%C3%AB" -> "Zoë")
        name = unquote(name) if name else ""
        # Never fall back to the id: it is an email address, and names are shown to everyone
        return User(id=id, name=clean_name(name) or "Pilot", verified=True)

    # No portal login (local development, or access control disabled): trust the
    # browser's own id and nickname. Good enough for a leaderboard among friends.
    if client_id:
        return User(id=f"guest:{client_id}", name=clean_name(nickname) or "Guest")
    return User(id="guest", name="Guest")


def header_client_id(request: Request) -> str:
    """The browser's own id on GET requests: the X-Client-Id header (same shape as models.ClientId)"""
    client_id = request.headers.get("X-Client-Id", "")
    if client_id and not CLIENT_ID.fullmatch(client_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bad X-Client-Id header")
    return client_id


def room_code(code: str) -> str:
    code = code.upper()
    if not ROOM_CODE.fullmatch(code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Room codes are 5 to 8 letters or digits")
    return code


def room_player(code: str, token: str) -> tuple[Room, Player]:
    found = rooms.find(room_code(code), token)
    if found is None:
        # The room or player is gone (e.g. the backend restarted): the client rejoins
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not in this room, join again")
    return found


def room_error(e: RoomError) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, str(e))


@app.get("/api/me", response_model=Me)
async def auth_me(request: Request):
    user = extract_user(request, header_client_id(request))
    return Me(**user.model_dump(), has_played=await run_in_threadpool(get_store().has_played, user.id))


@app.get("/api/time")
def server_time():
    """The server clock, so clients can agree on when a race starts."""
    return {"t": now_ms()}


# --- Race rooms ---------------------------------------------------------------


@app.post("/api/rooms/{code}/join")
async def join_room(code: str, body: JoinRequest, request: Request):
    user = extract_user(request, body.client_id, body.nickname)
    try:
        room = rooms.get_or_create(room_code(code), body.seed, creator=user.id)
    except RoomLimitError as e:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(e))
    try:
        player = room.join(user.id, user.name)
    except RoomError as e:
        raise room_error(e)
    return {"id": player.id, "token": player.token, "room": room.info()}


@app.get("/api/rooms/{code}")
async def get_room(code: str):
    room = rooms.rooms.get(room_code(code))
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such room")
    return room.info()


def stream_player(code: str, token: Annotated[str, Query()]) -> tuple[Room, Player]:
    # Runs before the stream opens, so a stale token gets a proper 404
    return room_player(code, token)


# Server-Sent Events: the response stays open and every yield sends an event to the browser.
@app.get("/api/rooms/{code}/stream", response_class=EventSourceResponse)
async def room_stream(found: Annotated[tuple[Room, Player], Depends(stream_player)]):
    room, player = found
    listener = Listener()
    player.listeners.add(listener)
    listener.push_event(encode(room.info()))
    try:
        # Send something right away, as some proxies (like Vite's) hold the response until then
        yield ServerSentEvent(comment="connected")
        while True:
            for message in await listener.next():
                yield ServerSentEvent(raw_data=message)
    finally:
        player.listeners.discard(listener)
        player.last_seen = now_ms()


@app.post("/api/rooms/{code}/state", status_code=status.HTTP_204_NO_CONTENT)
async def post_state(code: str, body: StateRequest):
    room, player = room_player(code, body.token)
    room.update_state(player, body.t, body.p, body.q, body.v, body.cp, boost=body.boost, brake=body.brake, dodge=body.dodge)


@app.post("/api/rooms/{code}/start", status_code=status.HTTP_204_NO_CONTENT)
async def start_race(code: str, body: TokenRequest):
    room, _ = room_player(code, body.token)
    try:
        room.start()
    except RoomError as e:
        raise room_error(e)


@app.post("/api/rooms/{code}/restart", status_code=status.HTTP_204_NO_CONTENT)
async def restart_race(code: str, body: TokenRequest):
    room, player = room_player(code, body.token)
    try:
        room.restart(player)
    except RoomError as e:
        raise room_error(e)


@app.post("/api/rooms/{code}/map", status_code=status.HTTP_204_NO_CONTENT)
async def new_map(code: str, body: MapRequest):
    room, player = room_player(code, body.token)
    try:
        room.new_map(player, seed=body.seed)
    except RoomError as e:
        raise room_error(e)


@app.post("/api/rooms/{code}/finish")
async def finish_race(code: str, body: FinishRequest):
    room, player = room_player(code, body.token)
    try:
        place = room.finish(player, body.time_ms)
    except RoomError as e:
        raise room_error(e)
    # SQLite and the ghost's JSON run in a worker thread, so the room relay doesn't stall
    try:
        best = await run_in_threadpool(get_store().add_run, room.seed, player.user_id, player.name, body.time_ms, body.ghost)
    except (sqlite3.Error, HTTPException):
        # The race is already finished in the room (everyone saw the place): only the leaderboard entry is lost
        log.exception("Couldn't save %s's finish (%s ms) on seed %s", player.name, body.time_ms, room.seed)
        return {"place": place, "personal_best_ms": None, "note": "Your time couldn't be saved to the leaderboard"}
    return {"place": place, "personal_best_ms": best}


@app.post("/api/rooms/{code}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_room(code: str, body: TokenRequest):
    found = rooms.find(room_code(code), body.token)
    if found:
        room, player = found
        room.leave(player)


# --- Solo time trials and leaderboards ------------------------------------------


@app.post("/api/runs/start", response_model=RunStartResponse)
async def start_run(body: RunStartRequest):
    """Called when a solo run's clock starts, so the server can check the finish time."""
    # Runs in progress live in the database (expired ones are dropped as new ones start), so a restart
    # doesn't void every time trial under way
    token = await run_in_threadpool(get_store().start_solo_run, body.seed, now_ms())
    return RunStartResponse(run_token=token)


@app.post("/api/runs/finish", response_model=RunFinishResponse)
async def finish_run(body: RunFinishRequest, request: Request):
    store = get_store()
    run = await run_in_threadpool(store.pop_solo_run, body.run_token)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown or already finished run")
    seed, started = run
    try:
        check_finish_time(body.time_ms, now_ms() - started)
    except RoomError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))

    user = extract_user(request, body.client_id, body.nickname)
    best = await run_in_threadpool(store.add_run, seed, user.id, user.name, body.time_ms, body.ghost)
    return RunFinishResponse(
        rank=await run_in_threadpool(store.rank, seed, body.time_ms, user.id),
        personal_best_ms=best,
        leaderboard=await run_in_threadpool(store.leaderboard, seed, 10, user.id),
    )


@app.get("/api/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(
    request: Request,
    seed: Seed,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
):
    user = extract_user(request, header_client_id(request))
    return await run_in_threadpool(get_store().leaderboard, seed, limit, user.id)


@app.get("/api/ghosts", response_model=list[GhostRun])
async def ghosts(seed: Seed, limit: Annotated[int, Query(ge=1, le=5)] = 3):
    return await run_in_threadpool(get_store().ghosts, seed, limit)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logging.getLogger(__name__).info("Starting server")
    uvicorn.run(
        "__main__:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
