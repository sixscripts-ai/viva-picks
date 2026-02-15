
import React, { useState } from 'react';

const formatOdds = (price) => {
    if (price > 0) return `+${price}`;
    return `${price}`;
};

const MyBets = ({ activeBets, betHistory, onCancelBet, onSettleBet }) => {
    const [activeTab, setActiveTab] = useState('active');

    return (
        <div className="bg-[#0A0A0A] border border-[#333333] h-full flex flex-col">
            {/* Tabs */}
            <div className="flex border-b border-[#333333]">
                <button
                    onClick={() => setActiveTab('active')}
                    className={`flex-1 px-4 py-3 font-heading text-sm uppercase tracking-wider transition-all
            ${activeTab === 'active'
                            ? 'text-[#39FF14] border-b-2 border-[#39FF14] bg-[#39FF14]/5'
                            : 'text-[#808080] hover:text-[#E0E0E0]'
                        }`}
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
                            <div key={bet.id} className="bg-[#111111] border border-[#333333] p-3">
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
                                    >
                                        WON
                                    </button>
                                    <button
                                        onClick={() => onSettleBet(bet.id, 'lost')}
                                        className="flex-1 py-1 font-mono text-xs bg-[#FF003C]/10 text-[#FF003C] border border-[#FF003C]/30 hover:bg-[#FF003C]/20"
                                    >
                                        LOST
                                    </button>
                                    <button
                                        onClick={() => onCancelBet(bet.id)}
                                        className="px-3 py-1 font-mono text-xs text-[#808080] border border-[#333333] hover:border-[#808080]"
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
                            <div key={bet.id} className="bg-[#111111] border border-[#333333] p-3">
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

export default MyBets;
