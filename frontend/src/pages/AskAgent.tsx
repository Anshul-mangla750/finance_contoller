import { ChatPanel } from "../components/ChatPanel";

type Props = { onFocusRecord: (id: string) => void };

export function AskAgentPage({ onFocusRecord }: Props) {
  return (
    <div className="anim-fade-up">
      <ChatPanel onFocusRecord={onFocusRecord} />
    </div>
  );
}
