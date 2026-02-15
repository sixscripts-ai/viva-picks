
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";

const Header = ({ wallet, cacheInfo, onRefreshOdds, refreshing }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/auth');
    };

    console.log("Current User State:", user); // Debugging
    return (
        <header className="bg-[#0A0A0A] border-b border-[#333333] px-6 py-4">
            <div className="flex items-center justify-between">
                <Link to="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
                    <h1 className="font-heading text-2xl font-bold uppercase tracking-wider text-[#E0E0E0]">
                        <span className="text-[#39FF14] neon-text">VIVA</span> PICKS
                    </h1>
                    <span className="font-mono text-xs text-[#39FF14] bg-[#39FF14]/10 px-2 py-1 border border-[#39FF14]/30 hidden sm:inline-block">
                        SYSTEM: {user && user.username ? 'ONLINE' : 'GUEST'}
                    </span>
                </Link>
                <div className="flex items-center gap-6">
                    {cacheInfo && (
                        <div className="text-right hidden md:block">
                            <p className="font-mono text-xs text-[#808080]">ODDS CACHED</p>
                            <p className="font-mono text-xs text-[#404040]">{cacheInfo}</p>
                        </div>
                    )}

                    {user?.username === 'adminash' && (
                        <button
                            onClick={onRefreshOdds}
                            disabled={refreshing}
                            className="font-mono text-xs px-3 py-2 bg-[#111111] border border-[#333333] text-[#808080] hover:border-[#39FF14]/50 hover:text-[#39FF14] disabled:opacity-50 transition-all hidden sm:block"
                            title="Refresh odds (Admin Only)"
                        >
                            {refreshing ? 'REFRESHING...' : 'REFRESH ODDS'}
                        </button>
                    )}

                    {user && user.username ? (
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className="font-mono text-xs text-[#808080] uppercase">{user.username}</p>
                                <p className="font-mono text-xl text-[#39FF14] neon-text">
                                    ${wallet?.balance?.toFixed(2) || '0.00'}
                                </p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-[#808080] hover:text-[#FF003C]">
                                <LogOut className="h-5 w-5" />
                            </Button>
                        </div>
                    ) : (
                        <Button
                            onClick={() => navigate('/auth')}
                            className="bg-[#39FF14] text-black hover:bg-[#39FF14]/80 font-bold tracking-wider"
                        >
                            LOGIN
                        </Button>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
