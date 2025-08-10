import { SoloMinesGame } from './SoloMinesGame';
import MultiplayerMinesGame from './MultiplayerMinesGame';

interface GameSettings {
  bombs: number;
  amount: number;
}

interface MinesGameProps {
  mode: 'solo' | '1v1';
  onBack: () => void;
  gameSettings?: GameSettings;
}

export function MinesGame({ mode, onBack, gameSettings }: MinesGameProps) {
  if (mode === 'solo') {
    return <SoloMinesGame onBack={onBack} />;
  }

  return <MultiplayerMinesGame onBack={onBack} settings={gameSettings} />;
}
