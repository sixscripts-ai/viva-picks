from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import json
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import aiosqlite

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# SQLite database path
DB_PATH = ROOT_DIR / "dark_intel.db"

# The Odds API config
ODDS_API_KEY = os.environ.get('ODDS_API_KEY', '')
ODDS_API_BASE_URL = os.environ.get('ODDS_API_BASE_URL', 'https://api.the-odds-api.com/v4')

# Create the main app
app = FastAPI(title="Viva Picks API")
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== DATABASE INITIALIZATION ====================

async def init_db():
    """Initialize SQLite database with required tables"""
    async with aiosqlite.connect(DB_PATH) as db:
        # Wallet table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS wallet (
                id TEXT PRIMARY KEY DEFAULT 'main_wallet',
                balance REAL DEFAULT 1000.0,
                total_wagered REAL DEFAULT 0.0,
                total_won REAL DEFAULT 0.0,
                total_lost REAL DEFAULT 0.0,
                updated_at TEXT
            )
        """)
        
        # Bets table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS bets (
                id TEXT PRIMARY KEY,
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
        
        # Odds cache table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS odds_cache (
                cache_key TEXT PRIMARY KEY,
                data TEXT,
                cached_at TEXT,
                expires_at TEXT
            )
        """)
        
        # Initialize wallet if not exists
        cursor = await db.execute("SELECT * FROM wallet WHERE id = 'main_wallet'")
        row = await cursor.fetchone()
        if not row:
            await db.execute("""
                INSERT INTO wallet (id, balance, total_wagered, total_won, total_lost, updated_at)
                VALUES ('main_wallet', 1000.0, 0.0, 0.0, 0.0, ?)
            """, (datetime.now(timezone.utc).isoformat(),))
        
        await db.commit()
    logger.info("Database initialized successfully")

# ==================== MODELS ====================

class Bet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_id: str
    sport_key: str
    sport_title: str
    home_team: str
    away_team: str
    selected_team: str
    bet_type: str  # h2h, spreads, totals
    odds: float
    amount: float
    potential_payout: float
    status: str = "pending"  # pending, won, lost
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    commence_time: Optional[str] = None

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

class Wallet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "main_wallet"
    balance: float = 1000.0
    total_wagered: float = 0.0
    total_won: float = 0.0
    total_lost: float = 0.0
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WalletUpdate(BaseModel):
    amount: float
    action: str  # deposit, withdraw

# ==================== SPORTS MAPPING ====================

SUPPORTED_SPORTS = {
    "americanfootball_nfl": {"title": "NFL", "group": "American Football"},
    "basketball_nba": {"title": "NBA", "group": "Basketball"},
    "baseball_mlb": {"title": "MLB", "group": "Baseball"},
    "americanfootball_ncaaf": {"title": "NCAA Football", "group": "American Football"},
    "basketball_ncaab": {"title": "NCAA Basketball", "group": "Basketball"},
    "icehockey_nhl": {"title": "NHL", "group": "Ice Hockey"},
    "soccer_epl": {"title": "EPL", "group": "Soccer"},
    "soccer_germany_bundesliga": {"title": "Bundesliga", "group": "Soccer"},
    "soccer_usa_mls": {"title": "MLS", "group": "Soccer"},
    "soccer_uefa_champs_league": {"title": "UEFA Champions League", "group": "Soccer"},
}

# ==================== ODDS API CLIENT ====================

async def fetch_odds_from_api(sport_key: str, markets: str = "h2h,spreads,totals") -> List[Dict]:
    """Fetch odds from The Odds API"""
    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": markets,
        "oddsFormat": "american"
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{ODDS_API_BASE_URL}/sports/{sport_key}/odds",
                params=params
            )
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 429:
                logger.warning("Rate limited by Odds API")
                return []
            else:
                logger.error(f"Odds API error: {response.status_code}")
                return []
    except Exception as e:
        logger.error(f"Error fetching odds: {e}")
        return []

async def fetch_available_sports() -> List[Dict]:
    """Fetch available sports from The Odds API"""
    params = {"apiKey": ODDS_API_KEY}
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{ODDS_API_BASE_URL}/sports",
                params=params
            )
            if response.status_code == 200:
                return response.json()
            return []
    except Exception as e:
        logger.error(f"Error fetching sports: {e}")
        return []

# ==================== DATABASE HELPERS ====================

async def get_wallet() -> dict:
    """Get wallet from database"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM wallet WHERE id = 'main_wallet'")
        row = await cursor.fetchone()
        if row:
            return dict(row)
        return {
            "id": "main_wallet",
            "balance": 1000.0,
            "total_wagered": 0.0,
            "total_won": 0.0,
            "total_lost": 0.0,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

async def update_wallet_db(updates: dict):
    """Update wallet in database"""
    async with aiosqlite.connect(DB_PATH) as db:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
        values = list(updates.values())
        await db.execute(f"UPDATE wallet SET {set_clause} WHERE id = 'main_wallet'", values)
        await db.commit()

# ==================== ROUTES ====================

@api_router.get("/")
async def root():
    return {"message": "Viva Picks API", "status": "CONNECTED // OPTIMAL"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# -------------------- Sports --------------------

@api_router.get("/sports")
async def get_supported_sports():
    """Get list of supported sports"""
    sports_list = []
    for key, info in SUPPORTED_SPORTS.items():
        sports_list.append({
            "key": key,
            "title": info["title"],
            "group": info["group"]
        })
    return {"sports": sports_list, "count": len(sports_list)}

@api_router.get("/sports/available")
async def get_available_sports():
    """Get all available sports from The Odds API"""
    sports = await fetch_available_sports()
    return {"sports": sports, "count": len(sports)}

# -------------------- Odds --------------------

@api_router.get("/odds/{sport_key}")
async def get_odds_route(
    sport_key: str,
    markets: str = Query("h2h,spreads,totals", description="Comma-separated markets")
):
    """Get live odds for a specific sport"""
    cache_key = f"odds_{sport_key}_{markets}"
    
    # Check cache first
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM odds_cache WHERE cache_key = ?", (cache_key,))
        row = await cursor.fetchone()
        
        if row and row["expires_at"]:
            expires_at = datetime.fromisoformat(row["expires_at"].replace('Z', '+00:00'))
            if expires_at > datetime.now(timezone.utc):
                logger.info(f"Returning cached odds for {sport_key}")
                cached_data = json.loads(row["data"]) if row["data"] else []
                return {"odds": cached_data, "cached": True, "sport_key": sport_key}
    
    # Fetch fresh data
    odds_data = await fetch_odds_from_api(sport_key, markets)
    
    # Cache the response for 24 hours
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT OR REPLACE INTO odds_cache (cache_key, data, cached_at, expires_at)
            VALUES (?, ?, ?, ?)
        """, (
            cache_key,
            json.dumps(odds_data),
            datetime.now(timezone.utc).isoformat(),
            (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
        ))
        await db.commit()
    
    return {"odds": odds_data, "cached": False, "sport_key": sport_key}

@api_router.get("/odds/all/preview")
async def get_all_odds_preview():
    """Get a preview of odds from all supported sports"""
    all_odds = {}
    for sport_key in list(SUPPORTED_SPORTS.keys())[:4]:
        odds_response = await get_odds_route(sport_key, "h2h")
        all_odds[sport_key] = {
            "title": SUPPORTED_SPORTS[sport_key]["title"],
            "games": odds_response.get("odds", [])[:3]
        }
    return {"preview": all_odds}

# -------------------- Wallet --------------------

@api_router.get("/wallet")
async def get_wallet_route():
    """Get current wallet balance and stats"""
    return await get_wallet()

@api_router.post("/wallet/update")
async def update_wallet_route(update: WalletUpdate):
    """Deposit or withdraw from wallet"""
    wallet = await get_wallet()
    current_balance = wallet.get("balance", 1000.0)
    
    if update.action == "deposit":
        new_balance = current_balance + update.amount
    elif update.action == "withdraw":
        if update.amount > current_balance:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        new_balance = current_balance - update.amount
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    await update_wallet_db({"balance": new_balance})
    
    return {"balance": new_balance, "action": update.action, "amount": update.amount}

# -------------------- Bets --------------------

@api_router.post("/bets")
async def place_bet(bet: BetCreate):
    """Place a new bet"""
    wallet = await get_wallet()
    
    if bet.amount > wallet.get("balance", 0):
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    # Create bet
    bet_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO bets (id, event_id, sport_key, sport_title, home_team, away_team,
                            selected_team, bet_type, odds, amount, potential_payout, status,
                            created_at, commence_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        """, (
            bet_id, bet.event_id, bet.sport_key, bet.sport_title, bet.home_team,
            bet.away_team, bet.selected_team, bet.bet_type, bet.odds, bet.amount,
            bet.potential_payout, created_at, bet.commence_time
        ))
        await db.commit()
    
    # Deduct from wallet
    new_balance = wallet.get("balance", 1000.0) - bet.amount
    total_wagered = wallet.get("total_wagered", 0) + bet.amount
    await update_wallet_db({"balance": new_balance, "total_wagered": total_wagered})
    
    bet_dict = {
        "id": bet_id,
        **bet.model_dump(),
        "status": "pending",
        "created_at": created_at
    }
    
    return {
        "bet": bet_dict,
        "new_balance": new_balance,
        "message": "Bet placed successfully"
    }

@api_router.get("/bets")
async def get_bets(status: Optional[str] = None):
    """Get all bets, optionally filtered by status"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if status:
            cursor = await db.execute(
                "SELECT * FROM bets WHERE status = ? ORDER BY created_at DESC LIMIT 100",
                (status,)
            )
        else:
            cursor = await db.execute("SELECT * FROM bets ORDER BY created_at DESC LIMIT 100")
        rows = await cursor.fetchall()
        bets = [dict(row) for row in rows]
    return {"bets": bets, "count": len(bets)}

@api_router.get("/bets/active")
async def get_active_bets():
    """Get all pending bets"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM bets WHERE status = 'pending' ORDER BY created_at DESC LIMIT 100"
        )
        rows = await cursor.fetchall()
        bets = [dict(row) for row in rows]
    return {"bets": bets, "count": len(bets)}

@api_router.get("/bets/history")
async def get_bet_history():
    """Get settled bets"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM bets WHERE status IN ('won', 'lost') ORDER BY created_at DESC LIMIT 100"
        )
        rows = await cursor.fetchall()
        bets = [dict(row) for row in rows]
    return {"bets": bets, "count": len(bets)}

@api_router.patch("/bets/{bet_id}/settle")
async def settle_bet(bet_id: str, result: str = Query(..., enum=["won", "lost"])):
    """Settle a bet as won or lost"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM bets WHERE id = ?", (bet_id,))
        bet = await cursor.fetchone()
        
        if not bet:
            raise HTTPException(status_code=404, detail="Bet not found")
        
        bet = dict(bet)
        if bet.get("status") != "pending":
            raise HTTPException(status_code=400, detail="Bet already settled")
        
        await db.execute("UPDATE bets SET status = ? WHERE id = ?", (result, bet_id))
        await db.commit()
    
    wallet = await get_wallet()
    
    if result == "won":
        payout = bet.get("potential_payout", 0)
        new_balance = wallet.get("balance", 0) + payout
        total_won = wallet.get("total_won", 0) + payout
        await update_wallet_db({"balance": new_balance, "total_won": total_won})
        return {"message": "Bet won!", "payout": payout, "new_balance": new_balance}
    else:
        total_lost = wallet.get("total_lost", 0) + bet.get("amount", 0)
        await update_wallet_db({"total_lost": total_lost})
        return {"message": "Bet lost", "lost_amount": bet.get("amount", 0)}

@api_router.delete("/bets/{bet_id}")
async def cancel_bet(bet_id: str):
    """Cancel a pending bet and refund"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM bets WHERE id = ?", (bet_id,))
        bet = await cursor.fetchone()
        
        if not bet:
            raise HTTPException(status_code=404, detail="Bet not found")
        
        bet = dict(bet)
        if bet.get("status") != "pending":
            raise HTTPException(status_code=400, detail="Can only cancel pending bets")
        
        await db.execute("DELETE FROM bets WHERE id = ?", (bet_id,))
        await db.commit()
    
    wallet = await get_wallet()
    refund_amount = bet.get("amount", 0)
    new_balance = wallet.get("balance", 0) + refund_amount
    total_wagered = max(0, wallet.get("total_wagered", 0) - refund_amount)
    await update_wallet_db({"balance": new_balance, "total_wagered": total_wagered})
    
    return {"message": "Bet cancelled and refunded", "refund": refund_amount, "new_balance": new_balance}

@api_router.get("/stats")
async def get_stats():
    """Get betting statistics"""
    wallet = await get_wallet()
    
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM bets")
        total_bets = (await cursor.fetchone())[0]
        
        cursor = await db.execute("SELECT COUNT(*) FROM bets WHERE status = 'pending'")
        pending_bets = (await cursor.fetchone())[0]
        
        cursor = await db.execute("SELECT COUNT(*) FROM bets WHERE status = 'won'")
        won_bets = (await cursor.fetchone())[0]
        
        cursor = await db.execute("SELECT COUNT(*) FROM bets WHERE status = 'lost'")
        lost_bets = (await cursor.fetchone())[0]
    
    win_rate = (won_bets / (won_bets + lost_bets) * 100) if (won_bets + lost_bets) > 0 else 0
    
    return {
        "wallet": wallet,
        "total_bets": total_bets,
        "pending_bets": pending_bets,
        "won_bets": won_bets,
        "lost_bets": lost_bets,
        "win_rate": round(win_rate, 1)
    }

@api_router.post("/odds/refresh/{sport_key}")
async def force_refresh_odds(sport_key: str):
    """Force refresh odds for a sport (use sparingly - limited API calls)"""
    markets = "h2h,spreads,totals"
    cache_key = f"odds_{sport_key}_{markets}"
    
    # Delete existing cache
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM odds_cache WHERE cache_key = ?", (cache_key,))
        await db.commit()
    
    # Fetch fresh data
    odds_data = await fetch_odds_from_api(sport_key, markets)
    
    # Cache for 24 hours
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT OR REPLACE INTO odds_cache (cache_key, data, cached_at, expires_at)
            VALUES (?, ?, ?, ?)
        """, (
            cache_key,
            json.dumps(odds_data),
            datetime.now(timezone.utc).isoformat(),
            (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
        ))
        await db.commit()
    
    return {"odds": odds_data, "refreshed": True, "sport_key": sport_key, "games_count": len(odds_data)}

@api_router.get("/cache/status")
async def get_cache_status():
    """Get cache status for all sports"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM odds_cache")
        rows = await cursor.fetchall()
        
        status = []
        for row in rows:
            sport_key = row["cache_key"].replace("odds_", "").replace("_h2h,spreads,totals", "")
            status.append({
                "sport_key": sport_key,
                "cached_at": row["cached_at"],
                "expires_at": row["expires_at"]
            })
    return {"cache_entries": status, "count": len(status)}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await init_db()
    logger.info("Dark Intel Sports API started")

@app.on_event("shutdown")
async def shutdown():
    logger.info("Dark Intel Sports API shutdown")
