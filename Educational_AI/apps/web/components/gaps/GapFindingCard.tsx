import type { GapFindingDTO } from '@/lib/api';

import GapCard from './GapCard';

interface GapFindingCardProps {
  finding: GapFindingDTO;
  notebookId: string;
  onStartQuiz: (topic: string) => void;
}

export function GapFindingCard({ finding, notebookId, onStartQuiz }: GapFindingCardProps) {
  return (
    <GapCard
      finding={finding}
      notebookId={notebookId}
      onStartQuiz={onStartQuiz}
    />
  );
}

export default GapFindingCard;
