import { useState, useEffect, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ==================== SPORT MAPPING ====================
const SPORTS = [
  { key: "americanfootball_nfl", title: "NFL", icon: "🏈" },
  { key: "basketball_nba", title: "NBA", icon: "🏀" },
  { key: "baseball_mlb", title: "MLB", icon: "⚾" },
  { key: "americanfootball_ncaaf", title: "NCAAF", icon: "🏈" },
  { key: "basketball_ncaab", title: "NCAAB", icon: "🏀" },
  { key: "icehockey_nhl", title: "NHL", icon: "🏒" },
  { key: "soccer_epl", title: "EPL", icon: "⚽" },
  { key: "soccer_germany_bundesliga", title: "BUND", icon: "⚽" },
  { key: "soccer_usa_mls", title: "MLS", icon: "⚽" },
  { key: "soccer_uefa_champs_league", title: "UEFA", icon: "⚽" },
];

// ==================== UTILITY FUNCTIONS ====================
const formatOdds = (price) => {
  if (price > 0) return `+${price}`;
  return `${price}`;
};

const calculatePayout = (amount, odds) => {
  if (!amount || amount <= 0) return 0;
  if (odds > 0) {
    return amount + (amount * odds) / 100;
  } else {
    return amount + (amount * 100) / Math.abs(odds);
  }
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// ==================== COMPONENTS ====================

const Header = ({ wallet, cacheInfo, onRefreshOdds, refreshing }) => (
  <header className="bg-[#0A0A0A] border-b border-[#333333] px-6 py-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="font-heading text-2xl font-bold uppercase tracking-wider text-[#E0E0E0]">
          <span className="text-[#39FF14] neon-text">VIVA</span> PICKS
        </h1>
        <span className="font-mono text-xs text-[#39FF14] bg-[#39FF14]/10 px-2 py-1 border border-[#39FF14]/30">
          SYSTEM: CONNECTED
        </span>
      </div>
      <div className="flex items-center gap-6">
        {cacheInfo && (
          <div className="text-right hidden md:block">
            <p className="font-mono text-xs text-[#808080]">ODDS CACHED</p>
            <p className="font-mono text-xs text-[#404040]">{cacheInfo}</p>
          </div>
        )}
        <button
          onClick={onRefreshOdds}
          disabled={refreshing}
          className="font-mono text-xs px-3 py-2 bg-[#111111] border border-[#333333] text-[#808080] hover:border-[#39FF14]/50 hover:text-[#39FF14] disabled:opacity-50 transition-all"
          data-testid="refresh-odds-btn"
          title="Refresh odds (uses API calls)"
        >
          {refreshing ? 'REFRESHING...' : 'REFRESH ODDS'}
        </button>
        <div className="text-right">
          <p className="font-mono text-xs text-[#808080] uppercase">Balance</p>
          <p className="font-mono text-xl text-[#39FF14] neon-text" data-testid="wallet-balance">
            ${wallet?.balance?.toFixed(2) || '0.00'}
          </p>
        </div>
      </div>
    </div>
  </header>
);

const SportTabs = ({ activeSport, onSelectSport }) => (
  <div className="bg-[#0A0A0A] border-b border-[#333333] px-6 overflow-x-auto">
    <div className="flex gap-1">
      {SPORTS.map((sport) => (
        <button
          key={sport.key}
          onClick={() => onSelectSport(sport.key)}
          data-testid={`sport-tab-${sport.key}`}
          className={`px-4 py-3 font-heading text-sm uppercase tracking-wide transition-all whitespace-nowrap
            ${activeSport === sport.key
              ? 'text-[#39FF14] border-b-2 border-[#39FF14] bg-[#39FF14]/5'
              : 'text-[#808080] hover:text-[#E0E0E0] border-b-2 border-transparent'
            }`}
        >
          {sport.title}
        </button>
      ))}
    </div>
  </div>
);

const OddsCard = ({ game, onPlaceBet, wallet }) => {
  const [selectedBet, setSelectedBet] = useState(null);
  const [betAmount, setBetAmount] = useState('');
  const QUICK_AMOUNTS = [5, 10, 25, 50, 100];

  const getFirstBookmaker = () => {
    if (!game.bookmakers || game.bookmakers.length === 0) return null;
    return game.bookmakers[0];
  };

  const bookmaker = getFirstBookmaker();
  if (!bookmaker) return null;

  const h2hMarket = bookmaker.markets?.find(m => m.key === 'h2h');
  const spreadsMarket = bookmaker.markets?.find(m => m.key === 'spreads');
  const totalsMarket = bookmaker.markets?.find(m => m.key === 'totals');

  const handleSelectOdds = (team, betType, odds, point) => {
    if (selectedBet?.team === team && selectedBet?.betType === betType) {
      setSelectedBet(null);
      setBetAmount('');
    } else {
      setSelectedBet({ team, betType, odds, point });
    }
  };

  const handlePlaceBet = () => {
    const amount = parseFloat(betAmount);
    if (!selectedBet || !amount || amount <= 0) {
      toast.error('Select odds and enter amount');
      return;
    }
    if (amount > wallet?.balance) {
      toast.error('Insufficient balance');
      return;
    }
    onPlaceBet(game, selectedBet.team, selectedBet.betType, selectedBet.odds, amount, selectedBet.point);
    setSelectedBet(null);
    setBetAmount('');
  };

  const calcPayout = (amount, odds) => {
    if (!amount || amount <= 0) return 0;
    if (odds > 0) return amount + (amount * odds) / 100;
    return amount + (amount * 100) / Math.abs(odds);
  };

  const isSelected = (team, betType) => selectedBet?.team === team && selectedBet?.betType === betType;

  return (
    <div className="bg-[#0A0A0A] border border-[#333333] card-hover" data-testid={`game-card-${game.id}`}>
      {/* Game Header */}
      <div className="px-4 py-3 border-b border-[#333333]/50">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-[#808080]">{bookmaker.title}</span>
          <span className="font-mono text-xs text-[#808080]">{formatDate(game.commence_time)}</span>
        </div>
      </div>

      {/* Teams and Odds */}
      <div className="p-4 space-y-3">
        {/* Away Team */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading text-sm uppercase tracking-wide text-[#E0E0E0] flex-1 truncate">
            {game.away_team}
          </span>
          <div className="flex gap-2">
            {h2hMarket && (
              <button
                onClick={() => handleSelectOdds(game.away_team, 'h2h', h2hMarket.outcomes?.find(o => o.name === game.away_team)?.price)}
                className={`font-mono text-sm px-3 py-2 min-w-[70px] transition-all
                  ${isSelected(game.away_team, 'h2h')
                    ? 'bg-[#39FF14] text-black'
                    : 'bg-[#111111] border border-[#333333] hover:border-[#39FF14]/50'
                  }
                  ${h2hMarket.outcomes?.find(o => o.name === game.away_team)?.price > 0 ? 'text-[#39FF14]' : ''}`}
                data-testid={`bet-h2h-${game.id}-away`}
              >
                {formatOdds(h2hMarket.outcomes?.find(o => o.name === game.away_team)?.price || 0)}
              </button>
            )}
            {spreadsMarket && (
              <button
                onClick={() => handleSelectOdds(game.away_team, 'spreads', spreadsMarket.outcomes?.find(o => o.name === game.away_team)?.price, spreadsMarket.outcomes?.find(o => o.name === game.away_team)?.point)}
                className={`font-mono text-xs px-3 py-2 min-w-[80px] transition-all
                  ${isSelected(game.away_team, 'spreads')
                    ? 'bg-[#39FF14] text-black'
                    : 'bg-[#111111] border border-[#333333] hover:border-[#39FF14]/50 text-[#E0E0E0]'
                  }`}
                data-testid={`bet-spread-${game.id}-away`}
              >
                {spreadsMarket.outcomes?.find(o => o.name === game.away_team)?.point > 0 ? '+' : ''}
                {spreadsMarket.outcomes?.find(o => o.name === game.away_team)?.point}
              </button>
            )}
          </div>
        </div>

        {/* Home Team */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading text-sm uppercase tracking-wide text-[#E0E0E0] flex-1 truncate">
            {game.home_team}
          </span>
          <div className="flex gap-2">
            {h2hMarket && (
              <button
                onClick={() => handleSelectOdds(game.home_team, 'h2h', h2hMarket.outcomes?.find(o => o.name === game.home_team)?.price)}
                className={`font-mono text-sm px-3 py-2 min-w-[70px] transition-all
                  ${isSelected(game.home_team, 'h2h')
                    ? 'bg-[#39FF14] text-black'
                    : 'bg-[#111111] border border-[#333333] hover:border-[#39FF14]/50'
                  }
                  ${h2hMarket.outcomes?.find(o => o.name === game.home_team)?.price > 0 ? 'text-[#39FF14]' : ''}`}
                data-testid={`bet-h2h-${game.id}-home`}
              >
                {formatOdds(h2hMarket.outcomes?.find(o => o.name === game.home_team)?.price || 0)}
              </button>
            )}
            {spreadsMarket && (
              <button
                onClick={() => handleSelectOdds(game.home_team, 'spreads', spreadsMarket.outcomes?.find(o => o.name === game.home_team)?.price, spreadsMarket.outcomes?.find(o => o.name === game.home_team)?.point)}
                className={`font-mono text-xs px-3 py-2 min-w-[80px] transition-all
                  ${isSelected(game.home_team, 'spreads')
                    ? 'bg-[#39FF14] text-black'
                    : 'bg-[#111111] border border-[#333333] hover:border-[#39FF14]/50 text-[#E0E0E0]'
                  }`}
                data-testid={`bet-spread-${game.id}-home`}
              >
                {spreadsMarket.outcomes?.find(o => o.name === game.home_team)?.point > 0 ? '+' : ''}
                {spreadsMarket.outcomes?.find(o => o.name === game.home_team)?.point}
              </button>
            )}
          </div>
        </div>

        {/* Totals */}
        {totalsMarket && (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#333333]/50">
            <span className="font-mono text-xs text-[#808080]">TOTAL</span>
            <div className="flex gap-2">
              <button
                onClick={() => handleSelectOdds('Over', 'totals', totalsMarket.outcomes?.find(o => o.name === 'Over')?.price, totalsMarket.outcomes?.find(o => o.name === 'Over')?.point)}
                className={`font-mono text-xs px-3 py-2 transition-all
                  ${isSelected('Over', 'totals')
                    ? 'bg-[#39FF14] text-black'
                    : 'bg-[#111111] border border-[#333333] hover:border-[#39FF14]/50 text-[#E0E0E0]'
                  }`}
                data-testid={`bet-total-${game.id}-over`}
              >
                O {totalsMarket.outcomes?.find(o => o.name === 'Over')?.point}
              </button>
              <button
                onClick={() => handleSelectOdds('Under', 'totals', totalsMarket.outcomes?.find(o => o.name === 'Under')?.price, totalsMarket.outcomes?.find(o => o.name === 'Under')?.point)}
                className={`font-mono text-xs px-3 py-2 transition-all
                  ${isSelected('Under', 'totals')
                    ? 'bg-[#39FF14] text-black'
                    : 'bg-[#111111] border border-[#333333] hover:border-[#39FF14]/50 text-[#E0E0E0]'
                  }`}
                data-testid={`bet-total-${game.id}-under`}
              >
                U {totalsMarket.outcomes?.find(o => o.name === 'Under')?.point}
              </button>
            </div>
          </div>
        )}

        {/* Bet Placement Section */}
        {selectedBet && (
          <div className="pt-3 mt-3 border-t border-[#39FF14]/30 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-[#39FF14]">
                {selectedBet.team} @ {formatOdds(selectedBet.odds)}
              </span>
              <button
                onClick={() => { setSelectedBet(null); setBetAmount(''); }}
                className="text-[#808080] hover:text-[#FF003C] text-sm"
              >
                ×
              </button>
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex gap-1 flex-wrap">
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setBetAmount(amt.toString())}
                  className={`px-2 py-1 font-mono text-xs transition-all
                    ${parseFloat(betAmount) === amt
                      ? 'bg-[#39FF14] text-black'
                      : 'bg-[#050505] border border-[#333333] text-[#808080] hover:border-[#39FF14]/50 hover:text-[#39FF14]'
                    }`}
                  data-testid={`quick-${amt}-${game.id}`}
                >
                  ${amt}
                </button>
              ))}
            </div>

            {/* Custom Amount Input */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-[#050505] border border-[#333333] px-2">
                <span className="font-mono text-xs text-[#808080]">$</span>
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  placeholder="Custom"
                  className="flex-1 bg-transparent px-2 py-2 font-mono text-sm text-[#39FF14] outline-none"
                  data-testid={`amount-input-${game.id}`}
                />
              </div>
              <div className="font-mono text-xs text-[#808080]">
                → <span className="text-[#39FF14]">${calcPayout(parseFloat(betAmount) || 0, selectedBet.odds).toFixed(2)}</span>
              </div>
            </div>

            {/* Place Bet Button */}
            <button
              onClick={handlePlaceBet}
              disabled={!betAmount || parseFloat(betAmount) <= 0}
              className="w-full py-2 font-heading text-sm uppercase tracking-wider btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid={`place-bet-${game.id}`}
            >
              PLACE BET
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const BetSlip = ({ bets, onRemoveBet, onPlaceBet, onUpdateAmount }) => {
  const QUICK_AMOUNTS = [5, 10, 25, 50, 100];
  const totalStake = bets.reduce((sum, bet) => sum + (bet.amount || 0), 0);
  const totalPayout = bets.reduce((sum, bet) => sum + calculatePayout(bet.amount, bet.odds), 0);

  return (
    <div className="bg-[#0A0A0A] border border-[#333333] h-full flex flex-col" data-testid="bet-slip">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#333333] bg-[#111111]">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg uppercase tracking-wider text-[#E0E0E0]">
            BET SLIP
          </h2>
          <span className="font-mono text-xs text-[#39FF14] bg-[#39FF14]/10 px-2 py-0.5">
            {bets.length}
          </span>
        </div>
      </div>

      {/* Bets List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {bets.length === 0 ? (
          <div className="text-center py-8">
            <p className="font-mono text-sm text-[#808080]">NO SELECTIONS</p>
            <p className="font-mono text-xs text-[#404040] mt-1">Click odds to add bets</p>
          </div>
        ) : (
          bets.map((bet, index) => (
            <div key={index} className="bg-[#111111] border border-[#333333] p-3" data-testid={`betslip-item-${index}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="font-heading text-sm uppercase text-[#E0E0E0]">{bet.selected_team}</p>
                  <p className="font-mono text-xs text-[#808080]">
                    {bet.home_team} vs {bet.away_team}
                  </p>
                  <p className="font-mono text-xs text-[#39FF14]">{formatOdds(bet.odds)}</p>
                </div>
                <button
                  onClick={() => onRemoveBet(index)}
                  className="text-[#FF003C] hover:text-[#FF003C]/80 text-lg leading-none"
                  data-testid={`remove-bet-${index}`}
                >
                  ×
                </button>
              </div>

              {/* Quick Bet Buttons */}
              <div className="flex gap-1 mb-2 flex-wrap">
                {QUICK_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => onUpdateAmount(index, amount)}
                    className={`px-2 py-1 font-mono text-xs transition-all
                      ${bet.amount === amount
                        ? 'bg-[#39FF14] text-black'
                        : 'bg-[#050505] border border-[#333333] text-[#808080] hover:border-[#39FF14]/50 hover:text-[#39FF14]'
                      }`}
                    data-testid={`quick-bet-${amount}-${index}`}
                  >
                    ${amount}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#808080]">$</span>
                <input
                  type="number"
                  value={bet.amount || ''}
                  onChange={(e) => onUpdateAmount(index, parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="flex-1 bg-[#050505] px-2 py-1 font-mono text-sm"
                  data-testid={`bet-amount-${index}`}
                />
                <span className="font-mono text-xs text-[#808080]">
                  → ${calculatePayout(bet.amount, bet.odds).toFixed(2)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {bets.length > 0 && (
        <div className="border-t border-[#333333] p-4 space-y-3">
          <div className="flex justify-between font-mono text-sm">
            <span className="text-[#808080]">TOTAL STAKE</span>
            <span className="text-[#E0E0E0]">${totalStake.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-mono text-sm">
            <span className="text-[#808080]">POTENTIAL PAYOUT</span>
            <span className="text-[#39FF14]">${totalPayout.toFixed(2)}</span>
          </div>
          <button
            onClick={onPlaceBet}
            disabled={totalStake <= 0}
            className="w-full py-3 font-heading text-sm uppercase tracking-wider btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="place-bet-btn"
          >
            PLACE BET{bets.length > 1 ? 'S' : ''}
          </button>
        </div>
      )}
    </div>
  );
};

const MyBets = ({ activeBets, betHistory, onCancelBet, onSettleBet }) => {
  const [activeTab, setActiveTab] = useState('active');

  return (
    <div className="bg-[#0A0A0A] border border-[#333333] h-full flex flex-col" data-testid="my-bets">
      {/* Tabs */}
      <div className="flex border-b border-[#333333]">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 px-4 py-3 font-heading text-sm uppercase tracking-wider transition-all
            ${activeTab === 'active'
              ? 'text-[#39FF14] border-b-2 border-[#39FF14] bg-[#39FF14]/5'
              : 'text-[#808080] hover:text-[#E0E0E0]'
            }`}
          data-testid="active-bets-tab"
        >
          ACTIVE ({activeBets.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 px-4 py-3 font-heading text-sm uppercase tracking-wider transition-all
            ${activeTab === 'history'
              ? 'text-[#39FF14] border-b-2 border-[#39FF14] bg-[#39FF14]/5'
              : 'text-[#808080] hover:text-[#E0E0E0]'
            }`}
          data-testid="bet-history-tab"
        >
          HISTORY ({betHistory.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeTab === 'active' && (
          activeBets.length === 0 ? (
            <div className="text-center py-8">
              <p className="font-mono text-sm text-[#808080]">NO ACTIVE BETS</p>
            </div>
          ) : (
            activeBets.map((bet) => (
              <div key={bet.id} className="bg-[#111111] border border-[#333333] p-3" data-testid={`active-bet-${bet.id}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-heading text-sm uppercase text-[#E0E0E0]">{bet.selected_team}</p>
                    <p className="font-mono text-xs text-[#808080]">{bet.sport_title}</p>
                  </div>
                  <span className="status-pending font-mono text-xs px-2 py-0.5">PENDING</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-sm text-[#39FF14]">{formatOdds(bet.odds)}</span>
                  <span className="font-mono text-sm text-[#E0E0E0]">${bet.amount?.toFixed(2)}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onSettleBet(bet.id, 'won')}
                    className="flex-1 py-1 font-mono text-xs bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/30 hover:bg-[#39FF14]/20"
                    data-testid={`settle-won-${bet.id}`}
                  >
                    WON
                  </button>
                  <button
                    onClick={() => onSettleBet(bet.id, 'lost')}
                    className="flex-1 py-1 font-mono text-xs bg-[#FF003C]/10 text-[#FF003C] border border-[#FF003C]/30 hover:bg-[#FF003C]/20"
                    data-testid={`settle-lost-${bet.id}`}
                  >
                    LOST
                  </button>
                  <button
                    onClick={() => onCancelBet(bet.id)}
                    className="px-3 py-1 font-mono text-xs text-[#808080] border border-[#333333] hover:border-[#808080]"
                    data-testid={`cancel-bet-${bet.id}`}
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            ))
          )
        )}

        {activeTab === 'history' && (
          betHistory.length === 0 ? (
            <div className="text-center py-8">
              <p className="font-mono text-sm text-[#808080]">NO BET HISTORY</p>
            </div>
          ) : (
            betHistory.map((bet) => (
              <div key={bet.id} className="bg-[#111111] border border-[#333333] p-3" data-testid={`history-bet-${bet.id}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-heading text-sm uppercase text-[#E0E0E0]">{bet.selected_team}</p>
                    <p className="font-mono text-xs text-[#808080]">{bet.sport_title}</p>
                  </div>
                  <span className={`font-mono text-xs px-2 py-0.5 ${bet.status === 'won' ? 'status-won' : 'status-lost'}`}>
                    {bet.status?.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-[#808080]">{formatOdds(bet.odds)}</span>
                  <span className={`font-mono text-sm ${bet.status === 'won' ? 'text-[#39FF14]' : 'text-[#FF003C]'}`}>
                    {bet.status === 'won' ? `+$${bet.potential_payout?.toFixed(2)}` : `-$${bet.amount?.toFixed(2)}`}
                  </span>
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
};

const StatsPanel = ({ stats }) => (
  <div className="bg-[#0A0A0A] border border-[#333333] p-4" data-testid="stats-panel">
    <h3 className="font-heading text-sm uppercase tracking-wider text-[#808080] mb-4">PERFORMANCE</h3>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="font-mono text-2xl text-[#39FF14] neon-text">{stats.win_rate}%</p>
        <p className="font-mono text-xs text-[#808080]">WIN RATE</p>
      </div>
      <div>
        <p className="font-mono text-2xl text-[#E0E0E0]">{stats.total_bets}</p>
        <p className="font-mono text-xs text-[#808080]">TOTAL BETS</p>
      </div>
      <div>
        <p className="font-mono text-lg text-[#39FF14]">+${stats.wallet?.total_won?.toFixed(2) || '0.00'}</p>
        <p className="font-mono text-xs text-[#808080]">TOTAL WON</p>
      </div>
      <div>
        <p className="font-mono text-lg text-[#FF003C]">-${stats.wallet?.total_lost?.toFixed(2) || '0.00'}</p>
        <p className="font-mono text-xs text-[#808080]">TOTAL LOST</p>
      </div>
    </div>
  </div>
);

// History Page Component
const HistoryPage = ({ bets, stats, onSettleBet }) => {
  const [filter, setFilter] = useState('all');

  const filteredBets = bets.filter(bet => {
    if (filter === 'all') return true;
    return bet.status === filter;
  });

  const totalProfit = (stats.wallet?.total_won || 0) - (stats.wallet?.total_lost || 0);
  const roi = stats.wallet?.total_wagered > 0
    ? ((totalProfit / stats.wallet.total_wagered) * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-6" data-testid="history-page">
      {/* Performance Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-[#0A0A0A] border border-[#333333] p-4">
          <p className="font-mono text-3xl text-[#39FF14] neon-text">{stats.win_rate}%</p>
          <p className="font-mono text-xs text-[#808080]">WIN RATE</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#333333] p-4">
          <p className="font-mono text-3xl text-[#E0E0E0]">{stats.total_bets}</p>
          <p className="font-mono text-xs text-[#808080]">TOTAL BETS</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#333333] p-4">
          <p className="font-mono text-3xl text-[#39FF14]">{stats.won_bets}</p>
          <p className="font-mono text-xs text-[#808080]">WINS</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#333333] p-4">
          <p className="font-mono text-3xl text-[#FF003C]">{stats.lost_bets}</p>
          <p className="font-mono text-xs text-[#808080]">LOSSES</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#333333] p-4">
          <p className={`font-mono text-3xl ${totalProfit >= 0 ? 'text-[#39FF14]' : 'text-[#FF003C]'}`}>
            {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
          </p>
          <p className="font-mono text-xs text-[#808080]">NET PROFIT</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#333333] p-4">
          <p className={`font-mono text-3xl ${parseFloat(roi) >= 0 ? 'text-[#39FF14]' : 'text-[#FF003C]'}`}>
            {roi}%
          </p>
          <p className="font-mono text-xs text-[#808080]">ROI</p>
        </div>
      </div>

      {/* Wallet Summary */}
      <div className="bg-[#0A0A0A] border border-[#333333] p-4">
        <h3 className="font-heading text-sm uppercase tracking-wider text-[#808080] mb-4">WALLET SUMMARY</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="font-mono text-xl text-[#39FF14]">${stats.wallet?.balance?.toFixed(2) || '0.00'}</p>
            <p className="font-mono text-xs text-[#808080]">CURRENT BALANCE</p>
          </div>
          <div>
            <p className="font-mono text-xl text-[#E0E0E0]">${stats.wallet?.total_wagered?.toFixed(2) || '0.00'}</p>
            <p className="font-mono text-xs text-[#808080]">TOTAL WAGERED</p>
          </div>
          <div>
            <p className="font-mono text-xl text-[#39FF14]">+${stats.wallet?.total_won?.toFixed(2) || '0.00'}</p>
            <p className="font-mono text-xs text-[#808080]">TOTAL WON</p>
          </div>
          <div>
            <p className="font-mono text-xl text-[#FF003C]">-${stats.wallet?.total_lost?.toFixed(2) || '0.00'}</p>
            <p className="font-mono text-xs text-[#808080]">TOTAL LOST</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {['all', 'pending', 'won', 'lost'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 font-mono text-xs uppercase transition-all
              ${filter === f
                ? 'bg-[#39FF14] text-black'
                : 'bg-[#111111] border border-[#333333] text-[#808080] hover:border-[#39FF14]/50'
              }`}
            data-testid={`filter-${f}`}
          >
            {f} ({f === 'all' ? bets.length : bets.filter(b => b.status === f).length})
          </button>
        ))}
      </div>

      {/* Bets Table */}
      <div className="bg-[#0A0A0A] border border-[#333333] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#333333] bg-[#111111]">
                <th className="px-4 py-3 text-left font-mono text-xs text-[#808080] uppercase">Date</th>
                <th className="px-4 py-3 text-left font-mono text-xs text-[#808080] uppercase">Sport</th>
                <th className="px-4 py-3 text-left font-mono text-xs text-[#808080] uppercase">Selection</th>
                <th className="px-4 py-3 text-left font-mono text-xs text-[#808080] uppercase">Matchup</th>
                <th className="px-4 py-3 text-right font-mono text-xs text-[#808080] uppercase">Odds</th>
                <th className="px-4 py-3 text-right font-mono text-xs text-[#808080] uppercase">Stake</th>
                <th className="px-4 py-3 text-right font-mono text-xs text-[#808080] uppercase">Payout</th>
                <th className="px-4 py-3 text-center font-mono text-xs text-[#808080] uppercase">Status</th>
                <th className="px-4 py-3 text-center font-mono text-xs text-[#808080] uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center font-mono text-sm text-[#808080]">
                    NO BETS FOUND
                  </td>
                </tr>
              ) : (
                filteredBets.map((bet) => (
                  <tr key={bet.id} className="border-b border-[#333333]/50 hover:bg-[#111111]/50" data-testid={`history-row-${bet.id}`}>
                    <td className="px-4 py-3 font-mono text-xs text-[#808080]">
                      {new Date(bet.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#E0E0E0]">{bet.sport_title}</td>
                    <td className="px-4 py-3 font-heading text-sm uppercase text-[#E0E0E0]">{bet.selected_team}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#808080]">
                      {bet.away_team} @ {bet.home_team}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono text-sm ${bet.odds > 0 ? 'text-[#39FF14]' : 'text-[#E0E0E0]'}`}>
                      {formatOdds(bet.odds)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-[#E0E0E0]">
                      ${bet.amount?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-[#39FF14]">
                      ${bet.potential_payout?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-mono text-xs px-2 py-1 
                        ${bet.status === 'pending' ? 'status-pending' : ''}
                        ${bet.status === 'won' ? 'status-won' : ''}
                        ${bet.status === 'lost' ? 'status-lost' : ''}
                      `}>
                        {bet.status?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {bet.status === 'pending' && (
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => onSettleBet(bet.id, 'won')}
                            className="px-2 py-1 font-mono text-xs bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/30 hover:bg-[#39FF14]/20"
                            data-testid={`settle-won-${bet.id}`}
                          >
                            WON
                          </button>
                          <button
                            onClick={() => onSettleBet(bet.id, 'lost')}
                            className="px-2 py-1 font-mono text-xs bg-[#FF003C]/10 text-[#FF003C] border border-[#FF003C]/30 hover:bg-[#FF003C]/20"
                            data-testid={`settle-lost-${bet.id}`}
                          >
                            LOST
                          </button>
                        </div>
                      )}
                      {bet.status !== 'pending' && (
                        <span className={`font-mono text-sm ${bet.status === 'won' ? 'text-[#39FF14]' : 'text-[#FF003C]'}`}>
                          {bet.status === 'won' ? `+$${bet.potential_payout?.toFixed(2)}` : `-$${bet.amount?.toFixed(2)}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ==================== MAIN DASHBOARD ====================

const Dashboard = () => {
  const [activeSport, setActiveSport] = useState('americanfootball_nfl');
  const [odds, setOdds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState({ balance: 1000 });
  const [betSlip, setBetSlip] = useState([]);
  const [activeBets, setActiveBets] = useState([]);
  const [betHistory, setBetHistory] = useState([]);
  const [stats, setStats] = useState({ win_rate: 0, total_bets: 0 });
  const [showMyBets, setShowMyBets] = useState(false);
  const [cacheInfo, setCacheInfo] = useState(null);

  // Fetch wallet
  const fetchWallet = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/wallet`);
      setWallet(response.data);
    } catch (e) {
      console.error('Error fetching wallet:', e);
    }
  }, []);

  // Fetch odds
  const fetchOdds = useCallback(async (sportKey) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/odds/${sportKey}`);
      setOdds(response.data.odds || []);

      // Update cache info if available
      if (response.data.cached) {
        setCacheInfo('Using cached data (24h)');
      } else {
        setCacheInfo('Fresh data loaded');
      }
    } catch (e) {
      console.error('Error fetching odds:', e);
      toast.error('Failed to fetch odds');
    } finally {
      setLoading(false);
    }
  }, []);

  // Force refresh odds (uses API calls)
  const handleRefreshOdds = async () => {
    setRefreshing(true);
    try {
      const response = await axios.post(`${API}/odds/refresh/${activeSport}`);
      setOdds(response.data.odds || []);
      setCacheInfo(`Refreshed: ${response.data.games_count} games`);
      toast.success(`Refreshed ${response.data.games_count} games`);
    } catch (e) {
      console.error('Error refreshing odds:', e);
      toast.error('Failed to refresh odds');
    } finally {
      setRefreshing(false);
    }
  };

  // Fetch bets
  const fetchBets = useCallback(async () => {
    try {
      const [activeRes, historyRes] = await Promise.all([
        axios.get(`${API}/bets/active`),
        axios.get(`${API}/bets/history`)
      ]);
      setActiveBets(activeRes.data.bets || []);
      setBetHistory(historyRes.data.bets || []);
    } catch (e) {
      console.error('Error fetching bets:', e);
    }
  }, []);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/stats`);
      setStats(response.data);
    } catch (e) {
      console.error('Error fetching stats:', e);
    }
  }, []);

  const [activeTab, setActiveTab] = useState('odds');
  const [allBets, setAllBets] = useState([]);

  // Fetch all bets for history
  const fetchAllBets = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/bets`);
      setAllBets(response.data.bets || []);
    } catch (e) {
      console.error('Error fetching all bets:', e);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchWallet();
    fetchBets();
    fetchStats();
    fetchAllBets();
  }, [fetchWallet, fetchBets, fetchStats, fetchAllBets]);

  // Fetch odds when sport changes
  useEffect(() => {
    fetchOdds(activeSport);
  }, [activeSport, fetchOdds]);

  // Place bet directly from game card
  const handleDirectPlaceBet = async (game, selectedTeam, betType, odds, amount, point) => {
    const sportInfo = SPORTS.find(s => s.key === activeSport);
    const potential_payout = calculatePayout(amount, odds);

    const betPayload = {
      event_id: game.id,
      sport_key: activeSport,
      sport_title: sportInfo?.title || activeSport,
      home_team: game.home_team,
      away_team: game.away_team,
      selected_team: selectedTeam,
      bet_type: betType,
      odds: odds,
      amount: amount,
      potential_payout: potential_payout,
      commence_time: game.commence_time
    };

    try {
      await axios.post(`${API}/bets`, betPayload);
      toast.success(`Bet placed: ${selectedTeam} @ ${formatOdds(odds)} for $${amount}`);
      fetchWallet();
      fetchBets();
      fetchStats();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to place bet');
    }
  };

  // Handle bet selection (for sidebar - keeping for compatibility)
  const handleSelectBet = (game, selectedTeam, betType, oddsValue, point) => {
    const existingIndex = betSlip.findIndex(
      b => b.event_id === game.id && b.selected_team === selectedTeam && b.bet_type === betType
    );

    if (existingIndex >= 0) {
      setBetSlip(prev => prev.filter((_, i) => i !== existingIndex));
    } else {
      const sportInfo = SPORTS.find(s => s.key === activeSport);
      setBetSlip(prev => [...prev, {
        event_id: game.id,
        sport_key: activeSport,
        sport_title: sportInfo?.title || activeSport,
        home_team: game.home_team,
        away_team: game.away_team,
        selected_team: selectedTeam,
        bet_type: betType,
        odds: oddsValue,
        point: point,
        amount: 0,
        commence_time: game.commence_time
      }]);
    }
  };

  // Remove bet from slip
  const handleRemoveBet = (index) => {
    setBetSlip(prev => prev.filter((_, i) => i !== index));
  };

  // Update bet amount
  const handleUpdateAmount = (index, amount) => {
    setBetSlip(prev => prev.map((bet, i) =>
      i === index ? { ...bet, amount } : bet
    ));
  };

  // Place bets
  const handlePlaceBet = async () => {
    const betsWithAmount = betSlip.filter(b => b.amount > 0);
    if (betsWithAmount.length === 0) {
      toast.error('Enter bet amounts');
      return;
    }

    try {
      for (const bet of betsWithAmount) {
        const payload = {
          ...bet,
          potential_payout: calculatePayout(bet.amount, bet.odds)
        };
        await axios.post(`${API}/bets`, payload);
      }
      toast.success(`${betsWithAmount.length} bet(s) placed successfully!`);
      setBetSlip([]);
      fetchWallet();
      fetchBets();
      fetchStats();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to place bet');
    }
  };

  // Cancel bet
  const handleCancelBet = async (betId) => {
    try {
      await axios.delete(`${API}/bets/${betId}`);
      toast.success('Bet cancelled and refunded');
      fetchWallet();
      fetchBets();
      fetchStats();
    } catch (e) {
      toast.error('Failed to cancel bet');
    }
  };

  // Settle bet
  const handleSettleBet = async (betId, result) => {
    try {
      await axios.patch(`${API}/bets/${betId}/settle?result=${result}`);
      toast.success(result === 'won' ? 'Congratulations! Bet won!' : 'Bet settled as lost');
      fetchWallet();
      fetchBets();
      fetchStats();
    } catch (e) {
      toast.error('Failed to settle bet');
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] grid-bg" data-testid="dashboard">
      <div className="scanline" />

      <Header
        wallet={wallet}
        cacheInfo={cacheInfo}
        onRefreshOdds={handleRefreshOdds}
        refreshing={refreshing}
      />

      {/* Main Navigation Tabs */}
      <div className="bg-[#0A0A0A] border-b border-[#333333] px-6">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('odds')}
            className={`px-6 py-3 font-heading text-sm uppercase tracking-wider transition-all
              ${activeTab === 'odds'
                ? 'text-[#39FF14] border-b-2 border-[#39FF14] bg-[#39FF14]/5'
                : 'text-[#808080] hover:text-[#E0E0E0] border-b-2 border-transparent'
              }`}
            data-testid="main-tab-odds"
          >
            ODDS
          </button>
          <button
            onClick={() => { setActiveTab('history'); fetchAllBets(); fetchStats(); }}
            className={`px-6 py-3 font-heading text-sm uppercase tracking-wider transition-all
              ${activeTab === 'history'
                ? 'text-[#39FF14] border-b-2 border-[#39FF14] bg-[#39FF14]/5'
                : 'text-[#808080] hover:text-[#E0E0E0] border-b-2 border-transparent'
              }`}
            data-testid="main-tab-history"
          >
            HISTORY ({allBets.length})
          </button>
        </div>
      </div>

      {activeTab === 'odds' && (
        <>
          <SportTabs activeSport={activeSport} onSelectSport={setActiveSport} />

          <div className="p-6">
            {/* Stats Bar */}
            <div className="mb-6">
              <StatsPanel stats={stats} />
            </div>

            {/* Odds Grid */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-lg uppercase tracking-wider text-[#E0E0E0]">
                {SPORTS.find(s => s.key === activeSport)?.title || 'ODDS'}
              </h2>
              {loading && (
                <span className="font-mono text-xs text-[#39FF14] pulse-live">LOADING...</span>
              )}
            </div>

            {odds.length === 0 && !loading ? (
              <div className="bg-[#0A0A0A] border border-[#333333] p-8 text-center">
                <p className="font-mono text-sm text-[#808080]">NO GAMES AVAILABLE</p>
                <p className="font-mono text-xs text-[#404040] mt-1">Check back later for upcoming matches</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {odds.map((game) => (
                  <OddsCard
                    key={game.id}
                    game={game}
                    onPlaceBet={handleDirectPlaceBet}
                    wallet={wallet}
                  />
                ))}
              </div>
            )}

            {/* Active Bets Summary */}
            {activeBets.length > 0 && (
              <div className="mt-6 bg-[#0A0A0A] border border-[#333333] p-4">
                <h3 className="font-heading text-sm uppercase tracking-wider text-[#808080] mb-3">
                  ACTIVE BETS ({activeBets.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeBets.slice(0, 6).map((bet) => (
                    <div key={bet.id} className="bg-[#111111] border border-[#333333] p-3 flex items-center justify-between">
                      <div>
                        <p className="font-heading text-sm uppercase text-[#E0E0E0]">{bet.selected_team}</p>
                        <p className="font-mono text-xs text-[#808080]">{bet.sport_title} • ${bet.amount}</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleSettleBet(bet.id, 'won')}
                          className="px-2 py-1 font-mono text-xs bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/30 hover:bg-[#39FF14]/20"
                        >
                          W
                        </button>
                        <button
                          onClick={() => handleSettleBet(bet.id, 'lost')}
                          className="px-2 py-1 font-mono text-xs bg-[#FF003C]/10 text-[#FF003C] border border-[#FF003C]/30 hover:bg-[#FF003C]/20"
                        >
                          L
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {activeBets.length > 6 && (
                  <button
                    onClick={() => setActiveTab('history')}
                    className="mt-3 font-mono text-xs text-[#39FF14] hover:underline"
                  >
                    View all {activeBets.length} active bets →
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <div className="p-6">
          <HistoryPage
            bets={allBets}
            stats={stats}
            onSettleBet={handleSettleBet}
          />
        </div>
      )}

      <Toaster position="top-right" richColors />
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
