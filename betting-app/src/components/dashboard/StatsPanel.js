
import React from 'react';

const StatsPanel = ({ stats }) => (
    <div className="bg-[#0A0A0A] border border-[#333333] p-4">
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

export default StatsPanel;
