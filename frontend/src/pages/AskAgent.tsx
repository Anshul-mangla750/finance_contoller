import { ChatPanel } from "../components/ChatPanel";

type Props = { onFocusRecord: (id: string) => void };

export function AskAgentPage({ onFocusRecord }: Props) {
  return (
    <div className="animate-fadeIn">
      <ChatPanel onFocusRecord={onFocusRecord} />
    </div>
  );
}
