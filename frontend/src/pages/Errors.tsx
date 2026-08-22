import { ErrorExplanation } from "../components/ErrorExplanation";
import type { ExceptionRow } from "../types";

type Props = { exceptions: ExceptionRow[]; onFocusRecord: (id: string) => void };

export function ErrorsPage({ exceptions, onFocusRecord }: Props) {
  return (
    <div className="animate-fadeIn">
      <ErrorExplanation exceptions={exceptions} onFocusRecord={onFocusRecord} />
    </div>
  );
}
