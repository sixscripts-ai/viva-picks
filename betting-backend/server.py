from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import json
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import aiosqlite
import libsql_client
import bcrypt

# ... (imports)

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
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

# ==================== ROUTES ====================

@api_router.get("/")
async def root():
    return {"message": "Viva Picks API", "status": "CONNECTED // OPTIMAL"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# --- AUTH ROUTES ---

@api_router.post("/register", response_model=Token)
async def register(user: UserCreate):
    # Check if user exists
    existing_user = await db_manager.fetch_one("SELECT * FROM users WHERE username = ?", (user.username,))
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    try:
        # Create User
        user_id = str(uuid.uuid4())
        hashed_password = get_password_hash(user.password)
        
        await db_manager.execute_write(
            "INSERT INTO users (id, username, email, hashed_password, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, user.username, user.email, hashed_password, datetime.now(timezone.utc).isoformat())
        )
        
        # Create Initial Wallet
        wallet_id = str(uuid.uuid4())
        await db_manager.execute_write(
            "INSERT INTO wallet (id, user_id, balance, updated_at) VALUES (?, ?, ?, ?)",
            (wallet_id, user_id, 1000.0, datetime.now(timezone.utc).isoformat())
        )
    except Exception as e:
        logger.error(f"Registration Error: {e}")
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
    
    # Generate Token
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
        "email": current_user["email"],
        "is_active": bool(current_user["is_active"])
    }

# --- WALLET ROUTES ---

@api_router.get("/wallet")
async def get_wallet_route(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    wallet = await db_manager.fetch_one("SELECT * FROM wallet WHERE user_id = ?", (user_id,))
    if not wallet:
        # Should not happen if registered correctly, but self-heal if needed
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
    
    # Create bet
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
    
    # Deduct from wallet
    new_balance = wallet["balance"] - bet.amount
    total_wagered = wallet["total_wagered"] + bet.amount
    
    await db_manager.execute_write(
        "UPDATE wallet SET balance = ?, total_wagered = ? WHERE user_id = ?",
        (new_balance, total_wagered, user_id)
    )
    
    return {"message": "Bet placed successfully", "new_balance": new_balance}

@api_router.get("/bets")
async def get_bets(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    query = "SELECT * FROM bets WHERE user_id = ?"
    params = [user_id]
    
    if status:
        query += " AND status = ?"
        params.append(status)
    
    query += " ORDER BY created_at DESC LIMIT 100"
    
    bets = await db_manager.execute(query, tuple(params))
    return {"bets": bets, "count": len(bets)}

@api_router.get("/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    wallet = await get_wallet_route(current_user)
    
    # Get counts for THIS user
    def get_count_query(status=None):
        q = "SELECT COUNT(*) as count FROM bets WHERE user_id = ?"
        p = [user_id]
        if status:
            q += " AND status = ?"
            p.append(status)
        return q, tuple(p)

    total_bets_row = await db_manager.fetch_one(*get_count_query())
    total_bets = total_bets_row["count"] if total_bets_row else 0
    
    won_bets_row = await db_manager.fetch_one(*get_count_query("won"))
    won_bets = won_bets_row["count"] if won_bets_row else 0
    
    lost_bets_row = await db_manager.fetch_one(*get_count_query("lost"))
    lost_bets = lost_bets_row["count"] if lost_bets_row else 0
    
    pending_bets = total_bets - (won_bets + lost_bets) # Simplify or filter specifically
    
    win_rate = (won_bets / (won_bets + lost_bets) * 100) if (won_bets + lost_bets) > 0 else 0
    
    return {
        "wallet": wallet,
        "total_bets": total_bets,
        "pending_bets": pending_bets,
        "won_bets": won_bets,
        "lost_bets": lost_bets,
        "win_rate": round(win_rate, 1)
    }

# --- PUBLIC / ADMIN ROUTES ---

@api_router.get("/sports")
async def get_supported_sports():
    """Get list of supported sports (Public)"""
    sports_list = []
    for key, info in SUPPORTED_SPORTS.items():
        sports_list.append({
            "key": key,
            "title": info["title"],
            "group": info["group"]
        })
    return {"sports": sports_list, "count": len(sports_list)}

@api_router.get("/odds/{sport_key}")
async def get_odds_route(sport_key: str, markets: str = Query("h2h,spreads,totals")):
    """Get live odds (Public, Cached)"""
    cache_key = f"odds_{sport_key}_{markets}"
    
    # Check cache
    row = await db_manager.fetch_one("SELECT * FROM odds_cache WHERE cache_key = ?", (cache_key,))
    if row and row["expires_at"]:
        expires_at = datetime.fromisoformat(row["expires_at"].replace('Z', '+00:00'))
        if expires_at > datetime.now(timezone.utc):
            cached_data = json.loads(row["data"]) if row["data"] else []
            return {"odds": cached_data, "cached": True, "sport_key": sport_key}
    
    # Fetch fresh
    odds_data = await fetch_odds_from_api(sport_key, markets)
    
    # Cache
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
    """Force refresh odds for a sport (Admin Only)"""
    ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "adminash")
    
    if current_user["username"] != ADMIN_USERNAME:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Admin privileges required to force refresh"
        )

    markets = "h2h,spreads,totals"
    cache_key = f"odds_{sport_key}_{markets}"
    
    # Delete existing cache
    await db_manager.execute_write("DELETE FROM odds_cache WHERE cache_key = ?", (cache_key,))
    
    # Fetch fresh data
    odds_data = await fetch_odds_from_api(sport_key, markets)
    
    # Cache for 24 hours
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
    """Get a preview of odds (Public)"""
    all_odds = {}
    for sport_key in list(SUPPORTED_SPORTS.keys())[:4]:
        odds_response = await get_odds_route(sport_key, "h2h")
        all_odds[sport_key] = {
            "title": SUPPORTED_SPORTS[sport_key]["title"],
            "games": odds_response.get("odds", [])[:3]
        }
    return {"preview": all_odds}

# Odds API Client functions need to remain available
async def fetch_available_sports() -> List[Dict]:
    params = {"apiKey": ODDS_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{ODDS_API_BASE_URL}/sports", params=params)
            return response.json() if response.status_code == 200 else []
    except Exception as e:
        logger.error(f"Error: {e}")
        return []

# Include router
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
