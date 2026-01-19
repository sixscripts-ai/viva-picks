from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import json
import hashlib
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import aiosqlite
import libsql_client
from jose import JWTError, jwt

# ==================== CONFIGURATION ====================

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Database Config
DB_PATH = ROOT_DIR / "dark_intel.db"
TURSO_URL = os.environ.get("TURSO_DATABASE_URL")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")

# The Odds API Config
ODDS_API_KEY = os.environ.get('ODDS_API_KEY', '')
ODDS_API_BASE_URL = os.environ.get('ODDS_API_BASE_URL', 'https://api.the-odds-api.com/v4')

# Security Config
SECRET_KEY = os.environ.get("SECRET_KEY", "your-secret-key-change-this-in-prod")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 43200  # 30 days

# Supported Sports
SUPPORTED_SPORTS = {
    "basketball_nba": {"title": "NBA", "group": "Basketball"},
    "americanfootball_nfl": {"title": "NFL", "group": "American Football"},
    "icehockey_nhl": {"title": "NHL", "group": "Ice Hockey"},
    "basketball_ncaab": {"title": "NCAAB", "group": "Basketball"}
}

# ==================== APP INITIALIZATION ====================

app = FastAPI(title="Viva Picks API")
api_router = APIRouter(prefix="/api")

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# OAuth2
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/token")

# ==================== PYDANTIC MODELS ====================

class User(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    is_active: bool = True

class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class BetCreate(BaseModel):
    event_id: str
    sport_key: str
    sport_title: str
    home_team: str
    away_team: str
    selected_team: str
    bet_type: str
    odds: float
    amount: float
    potential_payout: float
    commence_time: Optional[str] = None

class WalletUpdate(BaseModel):
    amount: float
    action: str

# ==================== DATABASE MANAGER ====================

class DatabaseManager:
    def __init__(self):
        self.is_turso = bool(TURSO_URL and "turso.io" in TURSO_URL)
        if self.is_turso:
            logger.info(f"Using Turso Database: {TURSO_URL}")
        else:
            logger.info(f"Using Local SQLite: {DB_PATH}")

    async def execute(self, query: str, params: tuple = ()):
        if self.is_turso:
            try:
                async with libsql_client.create_client(TURSO_URL, auth_token=TURSO_TOKEN) as client:
                    rs = await client.execute(query, params)
                    # Handle different libsql_client versions
                    if hasattr(rs, 'columns') and hasattr(rs, 'rows'):
                        columns = rs.columns
                        rows = [dict(zip(columns, row)) for row in rs.rows]
                    elif hasattr(rs, 'fetchall'):
                        rows = [dict(row) for row in rs.fetchall()]
                    else:
                        # Try to iterate directly
                        rows = []
                        for row in rs:
                            if hasattr(row, '_asdict'):
                                rows.append(row._asdict())
                            elif hasattr(row, 'keys'):
                                rows.append(dict(row))
                            else:
                                rows.append(row)
                    return rows
            except Exception as e:
                logger.error(f"Turso execute error: {e}")
                raise
        else:
            async with aiosqlite.connect(DB_PATH) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(query, params) as cursor:
                    rows = await cursor.fetchall()
                    return [dict(row) for row in rows]

    async def execute_write(self, query: str, params: tuple = ()):
        if self.is_turso:
            try:
                async with libsql_client.create_client(TURSO_URL, auth_token=TURSO_TOKEN) as client:
                    await client.execute(query, params)
            except Exception as e:
                logger.error(f"Turso write error: {e}")
                raise
        else:
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute(query, params)
                await db.commit()

    async def fetch_one(self, query: str, params: tuple = ()):
        rows = await self.execute(query, params)
        return rows[0] if rows else None

db_manager = DatabaseManager()

# ==================== DATABASE INITIALIZATION ====================

async def init_db():
    await db_manager.execute_write("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE,
            email TEXT,
            hashed_password TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT
        )
    """)
    
    await db_manager.execute_write("""
        CREATE TABLE IF NOT EXISTS wallet (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE,
            balance REAL DEFAULT 1000.0,
            total_wagered REAL DEFAULT 0.0,
            total_won REAL DEFAULT 0.0,
            total_lost REAL DEFAULT 0.0,
            updated_at TEXT
        )
    """)
    
    await db_manager.execute_write("""
        CREATE TABLE IF NOT EXISTS bets (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            event_id TEXT,
            sport_key TEXT,
            sport_title TEXT,
            home_team TEXT,
            away_team TEXT,
            selected_team TEXT,
            bet_type TEXT,
            odds REAL,
            amount REAL,
            potential_payout REAL,
            status TEXT DEFAULT 'pending',
            created_at TEXT,
            commence_time TEXT
        )
    """)
    
    await db_manager.execute_write("""
        CREATE TABLE IF NOT EXISTS odds_cache (
            cache_key TEXT PRIMARY KEY,
            data TEXT,
            cached_at TEXT,
            expires_at TEXT
        )
    """)
    
    logger.info("Database initialized successfully")

# ==================== AUTH UTILITIES ====================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return get_password_hash(plain_password) == hashed_password

def get_password_hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
        
    user = await db_manager.fetch_one("SELECT * FROM users WHERE username = ?", (token_data.username,))
    if user is None:
        raise credentials_exception
    return user

# ==================== ODDS API CLIENT ====================

async def fetch_odds_from_api(sport_key: str, markets: str) -> List[Dict]:
    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": markets,
        "oddsFormat": "american"
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{ODDS_API_BASE_URL}/sports/{sport_key}/odds", params=params)
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Odds API error: {response.status_code}")
                return []
    except Exception as e:
        logger.error(f"Odds API fetch error: {e}")
        return []

# ==================== ROUTES ====================

@api_router.get("/")
async def root():
    return {"message": "Viva Picks API", "status": "CONNECTED // OPTIMAL"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

@api_router.get("/version")
async def version():
    return {"version": "1.0.2", "hashing": "sha256"}

# --- AUTH ROUTES ---

@api_router.post("/register", response_model=Token)
async def register(user: UserCreate):
    existing_user = await db_manager.fetch_one("SELECT * FROM users WHERE username = ?", (user.username,))
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    try:
        user_id = str(uuid.uuid4())
        hashed_password = get_password_hash(user.password)
        
        await db_manager.execute_write(
            "INSERT INTO users (id, username, email, hashed_password, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, user.username, user.email, hashed_password, datetime.now(timezone.utc).isoformat())
        )
        
        wallet_id = str(uuid.uuid4())
        await db_manager.execute_write(
            "INSERT INTO wallet (id, user_id, balance, updated_at) VALUES (?, ?, ?, ?)",
            (wallet_id, user_id, 1000.0, datetime.now(timezone.utc).isoformat())
        )
    except Exception as e:
        logger.error(f"Registration Error: {e}")
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "user_id": user_id}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@api_router.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await db_manager.fetch_one("SELECT * FROM users WHERE username = ?", (form_data.username,))
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"], "user_id": user["id"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@api_router.get("/users/me", response_model=User)
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "email": current_user.get("email"),
        "is_active": bool(current_user.get("is_active", 1))
    }

# --- WALLET ROUTES ---

@api_router.get("/wallet")
async def get_wallet_route(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    wallet = await db_manager.fetch_one("SELECT * FROM wallet WHERE user_id = ?", (user_id,))
    if not wallet:
        wallet_id = str(uuid.uuid4())
        await db_manager.execute_write(
            "INSERT INTO wallet (id, user_id, balance, updated_at) VALUES (?, ?, ?, ?)",
            (wallet_id, user_id, 1000.0, datetime.now(timezone.utc).isoformat())
        )
        wallet = await db_manager.fetch_one("SELECT * FROM wallet WHERE user_id = ?", (user_id,))
    return wallet

@api_router.post("/wallet/update")
async def update_wallet_route(update: WalletUpdate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    wallet = await get_wallet_route(current_user)
    current_balance = wallet["balance"]
    
    if update.action == "deposit":
        new_balance = current_balance + update.amount
    elif update.action == "withdraw":
        if update.amount > current_balance:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        new_balance = current_balance - update.amount
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    await db_manager.execute_write(
        "UPDATE wallet SET balance = ?, updated_at = ? WHERE user_id = ?",
        (new_balance, datetime.now(timezone.utc).isoformat(), user_id)
    )
    
    return {"balance": new_balance, "action": update.action}

# --- BETTING ROUTES ---

@api_router.post("/bets")
async def place_bet(bet: BetCreate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    wallet = await get_wallet_route(current_user)
    
    if bet.amount > wallet["balance"]:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    bet_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    await db_manager.execute_write("""
        INSERT INTO bets (id, user_id, event_id, sport_key, sport_title, home_team, away_team,
                        selected_team, bet_type, odds, amount, potential_payout, status,
                        created_at, commence_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    """, (
        bet_id, user_id, bet.event_id, bet.sport_key, bet.sport_title, bet.home_team,
        bet.away_team, bet.selected_team, bet.bet_type, bet.odds, bet.amount,
        bet.potential_payout, created_at, bet.commence_time
    ))
    
    new_balance = wallet["balance"] - bet.amount
    total_wagered = (wallet.get("total_wagered") or 0) + bet.amount
    
    await db_manager.execute_write(
        "UPDATE wallet SET balance = ?, total_wagered = ? WHERE user_id = ?",
        (new_balance, total_wagered, user_id)
    )
    
    return {"message": "Bet placed successfully", "new_balance": new_balance}

@api_router.get("/bets")
async def get_bets(bet_status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    query = "SELECT * FROM bets WHERE user_id = ?"
    params = [user_id]
    
    if bet_status:
        query += " AND status = ?"
        params.append(bet_status)
    
    query += " ORDER BY created_at DESC LIMIT 100"
    
    bets = await db_manager.execute(query, tuple(params))
    return {"bets": bets, "count": len(bets)}

@api_router.get("/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    wallet = await get_wallet_route(current_user)
    
    total_bets_row = await db_manager.fetch_one("SELECT COUNT(*) as count FROM bets WHERE user_id = ?", (user_id,))
    total_bets = total_bets_row["count"] if total_bets_row else 0
    
    won_bets_row = await db_manager.fetch_one("SELECT COUNT(*) as count FROM bets WHERE user_id = ? AND status = 'won'", (user_id,))
    won_bets = won_bets_row["count"] if won_bets_row else 0
    
    lost_bets_row = await db_manager.fetch_one("SELECT COUNT(*) as count FROM bets WHERE user_id = ? AND status = 'lost'", (user_id,))
    lost_bets = lost_bets_row["count"] if lost_bets_row else 0
    
    pending_bets = total_bets - (won_bets + lost_bets)
    win_rate = (won_bets / (won_bets + lost_bets) * 100) if (won_bets + lost_bets) > 0 else 0
    
    return {
        "wallet": wallet,
        "total_bets": total_bets,
        "pending_bets": pending_bets,
        "won_bets": won_bets,
        "lost_bets": lost_bets,
        "win_rate": round(win_rate, 1)
    }

# --- PUBLIC / ODDS ROUTES ---

@api_router.get("/sports")
async def get_supported_sports():
    sports_list = []
    for key, info in SUPPORTED_SPORTS.items():
        sports_list.append({"key": key, "title": info["title"], "group": info["group"]})
    return {"sports": sports_list, "count": len(sports_list)}

@api_router.get("/odds/{sport_key}")
async def get_odds_route(sport_key: str, markets: str = Query("h2h,spreads,totals")):
    cache_key = f"odds_{sport_key}_{markets}"
    
    row = await db_manager.fetch_one("SELECT * FROM odds_cache WHERE cache_key = ?", (cache_key,))
    if row and row.get("expires_at"):
        expires_at = datetime.fromisoformat(row["expires_at"].replace('Z', '+00:00'))
        if expires_at > datetime.now(timezone.utc):
            cached_data = json.loads(row["data"]) if row["data"] else []
            return {"odds": cached_data, "cached": True, "sport_key": sport_key}
    
    odds_data = await fetch_odds_from_api(sport_key, markets)
    
    await db_manager.execute_write("""
        INSERT OR REPLACE INTO odds_cache (cache_key, data, cached_at, expires_at)
        VALUES (?, ?, ?, ?)
    """, (
        cache_key,
        json.dumps(odds_data),
        datetime.now(timezone.utc).isoformat(),
        (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    ))
    
    return {"odds": odds_data, "cached": False, "sport_key": sport_key}

@api_router.post("/odds/refresh/{sport_key}")
async def force_refresh_odds(sport_key: str, current_user: dict = Depends(get_current_user)):
    ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "adminash")
    
    if current_user["username"] != ADMIN_USERNAME:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Admin privileges required to force refresh"
        )

    markets = "h2h,spreads,totals"
    cache_key = f"odds_{sport_key}_{markets}"
    
    await db_manager.execute_write("DELETE FROM odds_cache WHERE cache_key = ?", (cache_key,))
    
    odds_data = await fetch_odds_from_api(sport_key, markets)
    
    await db_manager.execute_write("""
        INSERT OR REPLACE INTO odds_cache (cache_key, data, cached_at, expires_at)
        VALUES (?, ?, ?, ?)
    """, (
        cache_key,
        json.dumps(odds_data),
        datetime.now(timezone.utc).isoformat(),
        (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    ))
    
    return {"odds": odds_data, "refreshed": True, "sport_key": sport_key, "games_count": len(odds_data)}

@api_router.get("/odds/all/preview")
async def get_all_odds_preview():
    all_odds = {}
    for sport_key in list(SUPPORTED_SPORTS.keys())[:4]:
        odds_response = await get_odds_route(sport_key, "h2h")
        all_odds[sport_key] = {
            "title": SUPPORTED_SPORTS[sport_key]["title"],
            "games": odds_response.get("odds", [])[:3]
        }
    return {"preview": all_odds}

# ==================== APP SETUP ====================

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await init_db()
    logger.info("Viva Picks API started with User Auth")

@app.on_event("shutdown")
async def shutdown():
    logger.info("Viva Picks API shutdown")
