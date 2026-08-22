import { ChatPanel } from "../components/ChatPanel";

type Props = {
  onFocusRecord: (recordId: string) => void;
};

export function AskAgentPage({ onFocusRecord }: Props) {
  return (
    <div className="animate-fadeInUp">
      <ChatPanel onFocusRecord={onFocusRecord} />
    </div>
  );
}

