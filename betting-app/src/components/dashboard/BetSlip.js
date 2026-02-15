
import React from 'react';

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

const BetSlip = ({ bets, onRemoveBet, onPlaceBet, onUpdateAmount }) => {
    const QUICK_AMOUNTS = [5, 10, 25, 50, 100];
    const totalStake = bets.reduce((sum, bet) => sum + (bet.amount || 0), 0);
    const totalPayout = bets.reduce((sum, bet) => sum + calculatePayout(bet.amount, bet.odds), 0);

    return (
        <div className="bg-[#0A0A0A] border border-[#333333] h-full flex flex-col">
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
                        <div key={index} className="bg-[#111111] border border-[#333333] p-3">
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
                    >
                        PLACE BET{bets.length > 1 ? 'S' : ''}
                    </button>
                </div>
            )}
        </div>
    );
};

export default BetSlip;
