
import React, { useState } from 'react';
import { toast } from "sonner";

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
        // We check wallet balance in the parent or API, but quick check here is good details
        if (wallet && amount > wallet.balance) {
            toast.error('Insufficient balance');
            return;
        }
        onPlaceBet(game, selectedBet.team, selectedBet.betType, selectedBet.odds, amount, selectedBet.point);
        setSelectedBet(null);
        setBetAmount('');
    };

    const calcPayout = (amount, odds) => {
        return calculatePayout(amount, odds);
    };

    const isSelected = (team, betType) => selectedBet?.team === team && selectedBet?.betType === betType;

    return (
        <div className="bg-[#0A0A0A] border border-[#333333] card-hover">
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
                        >
                            PLACE BET
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OddsCard;
