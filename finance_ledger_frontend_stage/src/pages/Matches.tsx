import { ExceptionTable } from "../components/ExceptionTable";
import { MatchTable } from "../components/MatchTable";
import type { ExceptionRow, MatchRow } from "../types";

type Props = {
  matches: MatchRow[];
  exceptions: ExceptionRow[];
  focusedRecordId: string | null;
  onFocusRecord: (recordId: string) => void;
};

export function MatchesPage({ matches, exceptions, focusedRecordId, onFocusRecord }: Props) {
  return (
    <div className="space-y-6 animate-fadeInUp">
      <div className="grid gap-6 xl:grid-cols-2">
        <MatchTable matches={matches} focusedRecordId={focusedRecordId} onFocusRecord={onFocusRecord} />
        <ExceptionTable exceptions={exceptions} focusedRecordId={focusedRecordId} onFocusRecord={onFocusRecord} />
      </div>
    </div>
  );
}

