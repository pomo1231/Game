import { useState, useCallback, useReducer, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Bomb, Gem, RotateCcw, DollarSign, TrendingUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useStats } from '@/context/StatsContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWallet } from '@solana/wallet-adapter-react';
import { Slider } from './ui/slider';
import crypto from 'crypto-js';

interface Tile {
  id: number;
  isRevealed: boolean;
  isBomb: boolean;
  isSelected: boolean;
}

const initialState = {
  gameState: 'betting' as 'betting' | 'playing' | 'finished',
  betAmount: 0.1,
  bombCount: 5,
  tiles: Array.from({ length: 25 }, (_, i) => ({ id: i, isRevealed: false, isBomb: false, isSelected: false })),
  currentMultiplier: 1.0,
  safeRevealed: 0,
};

type Action =
  | { type: 'SET_GAME_STATE'; payload: 'betting' | 'playing' | 'finished' }
  | { type: 'SET_BET_AMOUNT'; payload: number }
  | { type: 'SET_BOMB_COUNT'; payload: number }
  | { type: 'RESET_GAME' }
  | { type: 'INITIALIZE_GAME'; payload: { bombCount: number, tiles: Tile[] } }
  | { type: 'REVEAL_TILE'; payload: { tileId: number } }
  | { type: 'CASH_OUT' };

function gameReducer(state: typeof initialState, action: Action): typeof initialState {
  switch (action.type) {
    case 'SET_GAME_STATE':
      return { ...state, gameState: action.payload };
    case 'SET_BET_AMOUNT':
        return { ...state, betAmount: action.payload };
    case 'SET_BOMB_COUNT':
        return { ...state, bombCount: action.payload };
    case 'RESET_GAME':
        return {
            ...initialState,
            betAmount: state.betAmount,
            bombCount: state.bombCount,
        };
    case 'INITIALIZE_GAME':
        return {
            ...state,
            ...action.payload,
            gameState: 'playing',
            safeRevealed: 0,
            currentMultiplier: 1.0,
        };
    case 'REVEAL_TILE': {
        const { tileId } = action.payload;
        const { tiles, bombCount, safeRevealed } = state;
        const tile = tiles[tileId];

        if (tile.isRevealed) {
            return state;
        }

        if (tile.isBomb) {
            toast({
                title: "BOOM! You hit a bomb! 💥",
                variant: "destructive"
            });
            return {
                ...state,
                gameState: 'finished',
                tiles: tiles.map(t => ({ ...t, isRevealed: true })),
            };
        }

        const newSafeRevealed = safeRevealed + 1;
        const newMultiplier = calculateMultiplier(newSafeRevealed, bombCount);
        const newTiles = tiles.map(t => t.id === tileId ? { ...t, isRevealed: true } : t);
        const allSafeTilesFound = newSafeRevealed === 25 - bombCount;

        if (allSafeTilesFound) {
            const isJackpot = bombCount === 24;
            toast({
                title: isJackpot ? "Jackpot! 💎" : "Board Cleared!",
                description: isJackpot ? "You found the only safe tile and won!" : "You found all the safe tiles and won!",
            });
            return {
                ...state,
                tiles: newTiles.map(t => ({...t, isRevealed: true})),
                safeRevealed: newSafeRevealed,
                currentMultiplier: newMultiplier,
                gameState: 'finished',
            };
        }

        return {
            ...state,
            tiles: newTiles,
            safeRevealed: newSafeRevealed,
            currentMultiplier: newMultiplier,
        };
    }
    case 'CASH_OUT':
        return {
            ...state,
            gameState: 'finished',
        };
    default:
      return state;
  }
}

const calculateMultiplier = (safeRevealed: number, bombCount: number) => {
    const totalTiles = 25;
    const houseEdge = 0.99; // 1% house edge
    let chance = 1;
    for (let i = 0; i < safeRevealed; i++) {
      chance *= (totalTiles - bombCount - i) / (totalTiles - i);
    }
    return houseEdge / chance;
};


export function SoloMinesGame({ onBack }: { onBack?: () => void }) {
    const { addGame, userProfile, totalGames } = useStats();
    const { connected } = useWallet();
    const [state, dispatch] = useReducer(gameReducer, initialState);
    const prevGameState = useRef(state.gameState);
    const [serverSeed, setServerSeed] = useState('');

    const {
        gameState,
        betAmount,
        bombCount,
        tiles,
        currentMultiplier,
        safeRevealed,
    } = state;

    useEffect(() => {
        if (prevGameState.current === 'playing' && gameState === 'finished') {
            const isLoss = tiles.some(tile => tile.isBomb && tile.isRevealed);
            const clientSeed = userProfile?.clientSeed || 'not_available';
            const nonce = totalGames + 1; // Use next game number as nonce

            if (isLoss) {
                // Game lost
                addGame({
                    netProfit: -betAmount,
                    wageredAmount: betAmount,
                    multiplier: 0,
                    gameMode: 'solo',
                    serverSeed,
                    clientSeed,
                    nonce,
                });
            } else {
                // Game won (cashed out)
                const winAmount = betAmount * currentMultiplier;
                const netProfit = winAmount - betAmount;

                addGame({
                    netProfit,
                    wageredAmount: betAmount,
                    multiplier: currentMultiplier,
                    gameMode: 'solo',
                    serverSeed,
                    clientSeed,
                    nonce,
                });
                
                toast({
                    title: "Cashed Out! 💰",
                    description: `Won ${winAmount.toFixed(3)} SOL (${currentMultiplier.toFixed(2)}x)`,
                });
            }
        }
        
        prevGameState.current = gameState;
    }, [gameState, betAmount, currentMultiplier, tiles, addGame, userProfile, totalGames, serverSeed]);

    const initializeGame = useCallback(() => {
        if (betAmount <= 0) {
            toast({
                title: "Invalid Bet Amount",
                description: "Please enter a bet amount greater than 0.",
                variant: "destructive"
            });
            return;
        }

        const newServerSeed = crypto.lib.WordArray.random(16).toString();
        setServerSeed(newServerSeed);
        const clientSeed = userProfile?.clientSeed || 'not_available';
        const nonce = totalGames + 1;

        const bombPositions = new Set<number>();
        
        // Use provably fair logic to generate bomb positions
        const bombLocations = generateBombLocations(newServerSeed, clientSeed, nonce, bombCount);
        bombLocations.forEach(pos => bombPositions.add(pos));

        const newTiles = Array.from({ length: 25 }, (_, i) => ({
            id: i,
            isRevealed: false,
            isBomb: bombPositions.has(i),
            isSelected: false,
        }));

        dispatch({ type: 'INITIALIZE_GAME', payload: { bombCount, tiles: newTiles } });
        
        toast({
            title: "Game Started!",
            description: `${bombCount} bombs hidden. Good luck!`,
        });
    }, [bombCount, betAmount, connected, userProfile, totalGames, addGame]);

    const revealTile = useCallback((tileId: number) => {
        if (gameState !== 'playing') return;
        dispatch({ type: 'REVEAL_TILE', payload: { tileId } });
    }, [gameState]);

    const cashOut = useCallback(() => {
        if (gameState !== 'playing' || safeRevealed === 0) return;
        dispatch({ type: 'CASH_OUT' });
    }, [gameState, safeRevealed]);

    const resetGame = () => {
        dispatch({ type: 'RESET_GAME' });
    };

    const handleBetAmountChange = (value: number) => {
        dispatch({ type: 'SET_BET_AMOUNT', payload: value });
    };

    const handleBombCountChange = (value: number) => {
        dispatch({ type: 'SET_BOMB_COUNT', payload: value });
    };

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        {onBack && (
                            <Button variant="outline" onClick={onBack}>
                                ← Back
                            </Button>
                        )}
                        <h1 className="text-2xl font-bold">
                            Solo Mines
                        </h1>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <Badge variant="outline" className="bg-neon-cyan/10 border-neon-cyan text-neon-cyan">
                            <Bomb className="w-3 h-3 mr-1" />
                            {bombCount} Bombs
                        </Badge>
                        <Badge variant="outline" className="bg-neon-gold/10 border-neon-gold text-neon-gold">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {currentMultiplier.toFixed(2)}x
                        </Badge>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Game Board */}
                    <div className="lg:col-span-2">
                        <div className="bg-gradient-card border border-primary/20 rounded-xl p-6">
                            <div className="grid grid-cols-5 gap-2 mb-4">
                                {tiles.map((tile) => (
                                    <button
                                        key={tile.id}
                                        onClick={() => revealTile(tile.id)}
                                        disabled={tile.isRevealed || gameState !== 'playing'}
                                        className={`
                                            aspect-square rounded-lg border-2 transition-all duration-300 transform hover:scale-105
                                            ${tile.isRevealed 
                                                ? tile.isBomb 
                                                    ? 'bg-gradient-danger border-bomb-red shadow-glow-danger' 
                                                    : 'bg-gradient-win border-safe-green shadow-glow-win'
                                                : 'bg-secondary border-border hover:border-primary/40 hover:shadow-glow-primary'
                                            }
                                            ${tile.isSelected && !tile.isRevealed ? 'ring-2 ring-primary' : ''}
                                        `}
                                    >
                                        {tile.isRevealed && (
                                            <div className="flex items-center justify-center h-full">
                                                {tile.isBomb ? (
                                                    <Bomb className="w-6 h-6 text-white animate-pulse" />
                                                ) : (
                                                    <Gem className="w-6 h-6 text-white animate-bounce" />
                                                )}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Game Controls */}
                    <div className="space-y-4">
                        {gameState === 'betting' && (
                            <div className="bg-gradient-card border border-primary/20 rounded-xl p-6">
                                <h3 className="text-lg font-semibold mb-4">
                                    Place Your Bet
                                </h3>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm text-muted-foreground mb-2 block">Bet Amount (SOL)</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0.01"
                                                max="10"
                                                value={betAmount}
                                                onChange={(e) => handleBetAmountChange(Number(e.target.value))}
                                                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-foreground"
                                            />
                                            <Button
                                                variant="outline"
                                                className="px-3"
                                                onClick={() => {
                                                    const newAmount = parseFloat((betAmount / 2).toFixed(4));
                                                    handleBetAmountChange(Math.max(0.01, newAmount));
                                                }}
                                            >
                                                1/2
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="px-3"
                                                onClick={() => {
                                                    const newAmount = parseFloat((betAmount * 2).toFixed(4));
                                                    handleBetAmountChange(Math.min(10, newAmount));
                                                }}
                                            >
                                                x2
                                            </Button>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="text-sm text-muted-foreground mb-2 block">
                                            Bombs: <span className="font-bold text-white">{bombCount}</span>
                                        </label>
                                        <Slider
                                            value={[bombCount]}
                                            onValueChange={(value) => handleBombCountChange(value[0])}
                                            min={1}
                                            max={24}
                                            step={1}
                                        />
                                    </div>
                                    
                                    <Button 
                                        variant="neon" 
                                        onClick={initializeGame} 
                                        className="w-full"
                                        disabled={!connected}
                                    >
                                        <DollarSign className="w-4 h-4 mr-2" />
                                        {connected ? 'Start Game' : 'Connect Wallet to Play'}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {gameState === 'playing' && (
                            <div className="bg-gradient-card border border-primary/20 rounded-xl p-6">
                                <h3 className="text-lg font-semibold mb-4">
                                    Game Active
                                </h3>
                                
                                <div className="space-y-4">
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-neon-gold">
                                            {(betAmount * currentMultiplier).toFixed(3)} SOL
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            Potential Win
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div className="text-center p-2 bg-secondary/50 rounded">
                                            <div className="font-semibold text-safe-green">{safeRevealed}</div>
                                            <div className="text-xs text-muted-foreground">Safe</div>
                                        </div>
                                        <div className="text-center p-2 bg-secondary/50 rounded">
                                            <div className="font-semibold text-bomb-red">{bombCount}</div>
                                            <div className="text-xs text-muted-foreground">Bombs</div>
                                        </div>
                                    </div>
                                    
                                    {safeRevealed > 0 && (
                                        <Button variant="win" onClick={cashOut} className="w-full">
                                            Cash Out {(betAmount * currentMultiplier).toFixed(3)} SOL
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}

                        {gameState === 'finished' && (
                            <div className="bg-gradient-card border border-primary/20 rounded-xl p-6">
                                <h3 className="text-lg font-semibold mb-4">
                                    Game Over
                                </h3>
                                
                                <Button variant="neon" onClick={resetGame} className="w-full">
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    Play Again
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Helper function (can be moved to a utility file)
function generateBombLocations(serverSeed: string, clientSeed: string, nonce: number, bombCount: number): number[] {
    if (!serverSeed || !clientSeed || isNaN(nonce) || isNaN(bombCount)) return [];
    
    const combinedSeed = `${serverSeed}-${clientSeed}-${nonce}`;
    const hash = crypto.SHA256(combinedSeed).toString(crypto.enc.Hex);

    const tiles = Array.from({ length: 25 }, (_, i) => i);
    let currentHash = hash;

    // Fisher-Yates shuffle algorithm
    for (let i = tiles.length - 1; i > 0; i--) {
        const hashSegment = currentHash.substring((i % 8) * 8, ((i % 8) * 8) + 8);
        const randInt = parseInt(hashSegment, 16);
        const j = randInt % (i + 1);
        
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
        
        currentHash = crypto.SHA256(currentHash).toString(crypto.enc.Hex);
    }

    return tiles.slice(0, bombCount);
}
