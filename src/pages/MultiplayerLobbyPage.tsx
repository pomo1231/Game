import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Eye, Loader2, Bot, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useWallet } from '@solana/wallet-adapter-react';
import { generateAvatarUrl } from '@/lib/utils';
import { useSocket } from '@/context/SocketContext';

interface GameSettings {
  bombs: number;
  amount: number;
  opponent: 'bot' | 'player' | null;
}

interface MultiplayerLobbyPageProps {
  onStartGame: (settings: GameSettings) => void;
}

export function MultiplayerLobbyPage({ onStartGame }: MultiplayerLobbyPageProps) {
  const { publicKey } = useWallet();
  const { lobbies, sendMessage } = useSocket();
  const [bombs, setBombs] = useState('3');
  const [amount, setAmount] = useState(0.01);
  const [creating, setCreating] = useState(false);
  
  const [createdGame, setCreatedGame] = useState<any>(null);
  const [showBotOption, setShowBotOption] = useState(false);

  const currentUser = {
    name: publicKey ? `${publicKey.toBase58().slice(0, 4)}...` : 'Player',
    avatar: publicKey ? generateAvatarUrl(publicKey.toBase58()) : generateAvatarUrl('default'),
    level: 1, // You might want to get this from useStats
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (createdGame) {
      timer = setTimeout(() => {
        setShowBotOption(true);
      }, 5000);
    }
    return () => clearTimeout(timer);
  }, [createdGame]);

  const handleCreateGame = () => {
    if (!publicKey) {
      toast({ title: 'Wallet not connected', description: 'Please connect your wallet to create a game.', variant: 'destructive' });
      return;
    }
    if (amount < 0.001) {
      toast({ title: 'Amount too low', description: 'Minimum is 0.001 SOL', variant: 'destructive' });
      return;
    }
    
    setCreating(true);

    const newLobbyMessage = {
        type: 'createLobby',
        name: currentUser.name,
        betAmount: amount,
        bombCount: parseInt(bombs),
    };
    sendMessage(newLobbyMessage);

    const optimisticGame = {
      id: `temp-${Date.now()}`,
      name: currentUser.name,
      bombs: parseInt(bombs),
      amount: amount,
    };
    setCreatedGame(optimisticGame);

    setTimeout(() => {
        setCreating(false);
    }, 1000);
  };
  
  const cancelGame = () => {
    // Note: We should ideally send a 'cancelLobby' message to the server here.
    setCreatedGame(null);
    setShowBotOption(false);
  };
  
  const playWithBot = () => {
      toast({ title: 'Starting game with Bot!', description: `Good luck!` });
      onStartGame({ 
        amount: createdGame.amount, 
        bombs: createdGame.bombs, 
        opponent: 'bot' 
      });
  };

  const handleJoin = (game: any) => {
    if (!publicKey) {
      toast({ title: 'Wallet not connected', description: 'Please connect your wallet to join a game.', variant: 'destructive' });
      return;
    }
    // Note: Add a server-side check to prevent joining own game.
    toast({ title: 'Joining Game', description: `Joining ${game.name}'s game...` });
    onStartGame({
        amount: game.betAmount,
        bombs: game.bombCount,
        opponent: 'player'
    });
  };
  
  if (createdGame) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center h-[70vh]">
          <Card className="w-full text-center p-8 bg-gradient-card border-primary/20">
            <CardHeader>
                <CardTitle className="text-2xl">Waiting for Opponent...</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6">
                <Loader2 className="w-16 h-16 text-primary animate-spin" />
                <p className="text-muted-foreground">Your game is live in the lobby.</p>
                <div className="text-lg">
                    <span>{createdGame.bombs} Bombs</span>
                    <span className="mx-4">|</span>
                    <span className="font-bold text-neon-cyan">{createdGame.amount.toFixed(3)} SOL</span>
                </div>
                {showBotOption && (
                    <Button variant="secondary" className="mt-4" onClick={playWithBot}>
                        <Bot className="w-5 h-5 mr-2"/>
                        Play vs. Robot
                    </Button>
                )}
                 <Button variant="ghost" className="mt-4 text-muted-foreground" onClick={cancelGame}>
                    <X className="w-4 h-4 mr-2"/>
                    Cancel Game
                </Button>
            </CardContent>
          </Card>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="max-w-5xl mx-auto">
        {/* Game Creation Card */}
        <Card className="mb-8 bg-gradient-card border border-primary/20">
            <CardHeader>
                <CardTitle>Create New 1v1 Game</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
                <div className="flex-1">
                    <label className="block mb-1 text-sm font-medium">Entry Amount (SOL)</label>
                    <Input 
                        type="number"
                        min={0.001}
                        step={0.001}
                        value={amount}
                        onChange={e => setAmount(Number(e.target.value))}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-foreground"
                        disabled={creating}
                    />
                </div>
                <div className="flex-1">
                    <label className="block mb-1 text-sm font-medium">Bombs</label>
                    <Select value={bombs} onValueChange={setBombs} disabled={creating}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select bombs" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1 Bomb</SelectItem>
                            <SelectItem value="3">3 Bombs</SelectItem>
                            <SelectItem value="5">5 Bombs</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="pt-6">
                    <Button variant="neon" className="w-full" onClick={handleCreateGame} disabled={creating}>
                        {creating ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Create Game'}
                    </Button>
                </div>
            </CardContent>
        </Card>

        {/* Lobby List */}
        <div className="mb-4 flex items-center gap-4">
          <Badge variant="outline" className="bg-neon-cyan/10 border-neon-cyan text-neon-cyan">
            <Users className="w-4 h-4 mr-1" />
            {lobbies.length} Open Games
          </Badge>
          <span className="text-muted-foreground">Payouts are settled in SOL</span>
        </div>
        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
          {lobbies.map((game) => (
             <Card key={game.id} className="flex items-center justify-between bg-gradient-card border border-primary/20 rounded-xl p-4 shadow-md">
             <div className="flex items-center gap-4">
               <img src={generateAvatarUrl(game.name)} alt={game.name} className="w-12 h-12 rounded-full border-2 border-primary/30 bg-secondary" />
               <div>
                 <div className="flex items-center gap-2">
                   <span className="font-bold text-lg text-white">{game.name}</span>
                 </div>
                 <div className="text-xs text-muted-foreground">Bombs: {game.bombCount}</div>
               </div>
             </div>
             <div className="flex items-center gap-6">
               <div className="text-right">
                 <div className="font-bold text-neon-cyan text-lg">{game.betAmount.toFixed(3)} SOL</div>
                 <div className="text-xs text-muted-foreground">Waiting...</div>
               </div>
               <Button variant="neon" onClick={() => handleJoin(game)}>Join</Button>
               <Button variant="ghost" size="icon"><Eye className="w-5 h-5" /></Button>
             </div>
           </Card>
          ))}
        </div>
      </div>
    </div>
  );
} 