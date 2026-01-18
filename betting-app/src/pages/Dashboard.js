
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import SportTabs from "../components/dashboard/SportTabs";
import OddsCard from "../components/dashboard/OddsCard";
import BetSlip from "../components/dashboard/BetSlip";
import MyBets from "../components/dashboard/MyBets";
import StatsPanel from "../components/dashboard/StatsPanel";
import HistoryPage from "./HistoryPage";
import Header from "../components/Header";
// Note: We'll put the Header in the Layout instead of inside Dashboard, 
// OR we can keep it here if we want Dashboard to own the header. 
// For now, let's keep the structure similar to before but just split the code.

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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

const Dashboard = () => {
    const { token, user } = useAuth();
    const [activeSport, setActiveSport] = useState('americanfootball_nfl');
    const [odds, setOdds] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [wallet, setWallet] = useState({ balance: 0 }); // Default 0 until loaded
    const [betSlip, setBetSlip] = useState([]);
    const [activeBets, setActiveBets] = useState([]);
    const [betHistory, setBetHistory] = useState([]);
    const [stats, setStats] = useState({ win_rate: 0, total_bets: 0 });
    const [showMyBets, setShowMyBets] = useState(false);
    const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'history'
    const [cacheInfo, setCacheInfo] = useState(null);

    // Config for Axios
    const getAuthConfig = useCallback(() => {
        return {
            headers: { Authorization: `Bearer ${token}` }
        };
    }, [token]);

    // Fetch wallet
    const fetchWallet = useCallback(async () => {
        if (!token) return;
        try {
            const response = await axios.get(`${API}/wallet`, getAuthConfig());
            setWallet(response.data);
        } catch (e) {
            console.error('Error fetching wallet:', e);
            if (e.response?.status === 401) toast.error("Session expired");
        }
    }, [token, getAuthConfig]);

    // Fetch odds (Public endpoint, but we can pass token if we want)
    const fetchOdds = useCallback(async (sportKey) => {
        setLoading(true);
        try {
            const response = await axios.get(`${API}/odds/${sportKey}`);
            setOdds(response.data.odds || []);
            if (response.data.cached) {
                setCacheInfo('Using cached data (24h)');
            } else {
                setCacheInfo('Live data from API');
            }
        } catch (e) {
            console.error('Error fetching odds:', e);
            toast.error('Failed to load odds');
        } finally {
            setLoading(false);
        }
    }, []);

    const refreshOdds = async () => {
        setRefreshing(true);
        try {
            await axios.post(`${API}/odds/refresh/${activeSport}`);
            await fetchOdds(activeSport);
            toast.success('Odds refreshed');
        } catch (e) {
            toast.error('Failed to refresh odds');
        } finally {
            setRefreshing(false);
        }
    };

    const fetchBets = useCallback(async () => {
        if (!token) return;
        try {
            const activeRes = await axios.get(`${API}/bets?status=pending`, getAuthConfig());
            setActiveBets(activeRes.data.bets || []);

            const historyRes = await axios.get(`${API}/bets`, getAuthConfig()); // Gets all, filter later if needed or endpoint supports status param
            // Actually backend supports status param. Let's get "not pending" if we want history
            // For now, let's just get all history for the stats calculation.
            // Or better, let's trust the 'stats' endpoint for the summary.

            // Let's just fetch all bets for the client-side filtering support in HistoryPage
            const allBetsRes = await axios.get(`${API}/bets`, getAuthConfig());
            const allBets = allBetsRes.data.bets || [];
            setBetHistory(allBets);

        } catch (e) {
            console.error('Error fetching bets:', e);
        }
    }, [token, getAuthConfig]);

    const fetchStats = useCallback(async () => {
        if (!token) return;
        try {
            const response = await axios.get(`${API}/stats`, getAuthConfig());
            setStats(response.data);
        } catch (e) {
            console.error('Error fetching stats:', e);
        }
    }, [token, getAuthConfig]);

    useEffect(() => {
        if (token) {
            fetchWallet();
            fetchBets();
            fetchStats();
        }
        fetchOdds(activeSport);
    }, [activeSport, token, fetchWallet, fetchOdds, fetchBets, fetchStats]);


    const handlePlaceBet = async (game, team, betType, odds, amount, point) => {
        if (!token) {
            toast.error("Please login to place bets");
            return;
        }
        try {
            const payload = {
                event_id: game.id,
                sport_key: activeSport,
                sport_title: SPORTS.find(s => s.key === activeSport)?.title || activeSport,
                home_team: game.home_team,
                away_team: game.away_team,
                selected_team: team,
                bet_type: betType,
                odds: odds,
                amount: amount,
                potential_payout: amount + (odds > 0 ? (amount * odds / 100) : (amount * 100 / Math.abs(odds))),
                commence_time: game.commence_time
            };

            await axios.post(`${API}/bets`, payload, getAuthConfig());
            toast.success('Bet placed successfully');
            fetchWallet();
            fetchBets();
            fetchStats();
        } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.detail || 'Failed to place bet');
        }
    };

    const handleSettleBet = async (betId, result) => {
        if (!token) return;
        try {
            await axios.patch(`${API}/bets/${betId}/settle?result=${result}`, {}, getAuthConfig());
            toast.success(`Bet marked as ${result}`);
            fetchWallet();
            fetchBets();
            fetchStats();
        } catch (e) {
            toast.error('Failed to settle bet');
        }
    };

    const handleCancelBet = async (betId) => {
        if (!token) return;
        try {
            await axios.delete(`${API}/bets/${betId}`, getAuthConfig());
            toast.success('Bet cancelled and refunded');
            fetchWallet();
            fetchBets();
            fetchStats();
        } catch (e) {
            toast.error('Failed to cancel bet');
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-[#E0E0E0] font-sans selection:bg-[#39FF14] selection:text-black">
            <Header
                wallet={wallet}
                cacheInfo={cacheInfo}
                onRefreshOdds={refreshOdds}
                refreshing={refreshing}
            />

            <main className="flex h-[calc(100vh-80px)] overflow-hidden">
                {/* Sidebar Navigation (Desktop) */}
                <aside className="w-64 bg-[#0A0A0A] border-r border-[#333333] hidden lg:flex flex-col">
                    <div className="p-4 space-y-2">
                        <button
                            onClick={() => setCurrentView('dashboard')}
                            className={`w-full text-left px-4 py-3 font-heading text-sm uppercase tracking-wider transition-all
                ${currentView === 'dashboard'
                                    ? 'bg-[#39FF14] text-black'
                                    : 'text-[#808080] hover:text-[#E0E0E0] hover:bg-[#111111]'
                                }`}
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={() => setCurrentView('history')}
                            className={`w-full text-left px-4 py-3 font-heading text-sm uppercase tracking-wider transition-all
                ${currentView === 'history'
                                    ? 'bg-[#39FF14] text-black'
                                    : 'text-[#808080] hover:text-[#E0E0E0] hover:bg-[#111111]'
                                }`}
                        >
                            Track Record
                        </button>
                    </div>

                    <div className="mt-auto p-4 border-t border-[#333333]">
                        {!token && (
                            <div className="text-xs text-[#808080] mb-2 p-2 bg-[#111111] border border-[#333333]">
                                Login to track bets & history.
                            </div>
                        )}
                        <StatsPanel stats={stats} />
                    </div>
                </aside>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {currentView === 'dashboard' ? (
                        <>
                            <SportTabs activeSport={activeSport} onSelectSport={setActiveSport} sports={SPORTS} />

                            <div className="flex-1 overflow-y-auto p-6">
                                {loading ? (
                                    <div className="flex items-center justify-center h-64 space-x-2">
                                        <div className="w-2 h-2 bg-[#39FF14] animate-pulse"></div>
                                        <div className="w-2 h-2 bg-[#39FF14] animate-pulse delay-75"></div>
                                        <div className="w-2 h-2 bg-[#39FF14] animate-pulse delay-150"></div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                        {odds.map((game) => (
                                            <OddsCard
                                                key={game.id}
                                                game={game}
                                                onPlaceBet={handlePlaceBet}
                                                wallet={wallet}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-6">
                            <h2 className="font-heading text-2xl uppercase tracking-wider mb-6 text-[#E0E0E0]">
                                Track Record
                            </h2>
                            <HistoryPage
                                bets={betHistory}
                                stats={stats}
                                onSettleBet={handleSettleBet}
                            />
                        </div>
                    )}
                </div>

                {/* Right Sidebar (Bet Slip / My Bets) */}
                {token && (
                    <div className={`
          fixed inset-y-0 right-0 w-80 bg-[#0A0A0A] border-l border-[#333333] transform transition-transform duration-300 z-50
          md:relative md:translate-x-0
          ${showMyBets ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
        `}>
                        <MyBets
                            activeBets={activeBets}
                            betHistory={betHistory}
                            onCancelBet={handleCancelBet}
                            onSettleBet={handleSettleBet}
                        />
                        {/* Mobile Toggle for My Bets */}
                        <button
                            className="md:hidden absolute top-1/2 -left-8 bg-[#39FF14] text-black p-2 rounded-l"
                            onClick={() => setShowMyBets(!showMyBets)}
                        >
                            {showMyBets ? '→' : '←'}
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Dashboard;
