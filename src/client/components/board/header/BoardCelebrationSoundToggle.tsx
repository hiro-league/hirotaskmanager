import { Volume2, VolumeX } from "lucide-react";
import type { Board } from "../../../../shared/models";
import { usePatchBoardViewPrefs } from "@/api/mutations";
import { cn } from "@/lib/utils";
import { boardHeaderToggleButtonClass } from "./boardHeaderButtonStyles";

interface BoardCelebrationSoundToggleProps {
  board: Board;
}

/**
 * Per-board mute for task-completion celebration sounds (SQLite `celebration_sounds_muted`).
 * Particles still play when sounds are muted unless the user prefers reduced motion.
 */
export function BoardCelebrationSoundToggle({
  board,
}: BoardCelebrationSoundToggleProps) {
  const patch = usePatchBoardViewPrefs();
  const muted = board.muteCelebrationSounds;
  const busy = patch.isPending;

  return (
    <button
      type="button"
      className={cn(
        boardHeaderToggleButtonClass(!muted),
        "size-8 min-w-8 justify-center gap-0 px-0",
      )}
      disabled={busy}
      title={muted ? "Unmute completion sounds" : "Mute completion sounds"}
      aria-pressed={muted}
      aria-label={
        muted
          ? "Unmute task completion sounds for this board"
          : "Mute task completion sounds for this board"
      }
      onClick={() =>
        patch.mutate({
          boardId: board.boardId,
          patch: { muteCelebrationSounds: !muted },
        })
      }
    >
      {muted ? (
        <VolumeX className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <Volume2 className="size-3.5 shrink-0" aria-hidden />
      )}
    </button>
  );
}
