
import React from 'react';

const SportTabs = ({ activeSport, onSelectSport, sports }) => (
    <div className="bg-[#0A0A0A] border-b border-[#333333] px-6 overflow-x-auto">
        <div className="flex gap-1">
            {sports.map((sport) => (
                <button
                    key={sport.key}
                    onClick={() => onSelectSport(sport.key)}
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

export default SportTabs;
