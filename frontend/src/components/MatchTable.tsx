import { useMemo, useState } from "react";
import type { MatchRow } from "../types";

type Props = {
  matches: MatchRow[];
  focusedRecordId: string | null;
  onFocusRecord: (recordId: string) => void;
};

export function MatchTable({ matches, focusedRecordId, onFocusRecord }: Props) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return matches;
    return matches.filter((match) =>
      [match.source_a_id, match.source_b_id, match.pair_type, match.match_kind, match.reasoning]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [matches, search]);

  return (
    <div className="table-shell">
      <div className="border-b border-sand-200 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="metric-label">Matches</p>
            <h3 className="mt-1 text-lg font-semibold text-ink-950">Matched records and reasoning</h3>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search matches..."
            className="w-full rounded-full border border-sand-200 bg-white px-4 py-2 text-sm outline-none ring-0 transition placeholder:text-ink-400 focus:border-moss-400 md:w-80"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-sand-200 text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3 font-semibold">Pair</th>
              <th className="px-4 py-3 font-semibold">Source A</th>
              <th className="px-4 py-3 font-semibold">Source B</th>
              <th className="px-4 py-3 font-semibold">Layer</th>
              <th className="px-4 py-3 font-semibold">Confidence</th>
              <th className="px-4 py-3 font-semibold">Reasoning</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const isFocused = focusedRecordId
                ? row.source_a_id.includes(focusedRecordId) || row.source_b_id.includes(focusedRecordId)
                : false;
              return (
                <tr key={`${row.pair_type}:${row.source_a_id}:${row.source_b_id}`} className={`table-row ${isFocused ? "bg-amber-50" : ""}`}>
                  <td className="px-4 py-3 font-medium text-ink-700">{row.pair_type}</td>
                  <td className="px-4 py-3">
                    <button className="chip mono" onClick={() => onFocusRecord(row.source_a_id)} type="button">
                      {row.source_a_type}:{row.source_a_id}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button className="chip mono" onClick={() => onFocusRecord(row.source_b_id)} type="button">
                      {row.source_b_type}:{row.source_b_id}
                    </button>
                  </td>
                  <td className="px-4 py-3">{row.match_layer}</td>
                  <td className="px-4 py-3 font-semibold text-moss-500">{Math.round(row.confidence * 100)}%</td>
                  <td className="px-4 py-3 text-ink-600">{row.reasoning}</td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                  No matches found for that filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

