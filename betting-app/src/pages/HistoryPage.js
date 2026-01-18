
import React, { useState } from 'react';

const formatOdds = (price) => {
    if (price > 0) return `+${price}`;
    return `${price}`;
};

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
        <div className="space-y-6">
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
                                    <tr key={bet.id} className="border-b border-[#333333]/50 hover:bg-[#111111]/50">
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
                                                    >
                                                        WON
                                                    </button>
                                                    <button
                                                        onClick={() => onSettleBet(bet.id, 'lost')}
                                                        className="px-2 py-1 font-mono text-xs bg-[#FF003C]/10 text-[#FF003C] border border-[#FF003C]/30 hover:bg-[#FF003C]/20"
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

export default HistoryPage;
