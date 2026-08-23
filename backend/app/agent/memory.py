from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ChatTurn:
    role: str
    content: str


@dataclass
class ConversationMemory:
    turns: list[ChatTurn] = field(default_factory=list)
    max_turns: int = 12

    def add_user_message(self, content: str) -> None:
        self.turns.append(ChatTurn(role="user", content=content))
        self._trim()

    def add_ai_message(self, content: str) -> None:
        self.turns.append(ChatTurn(role="assistant", content=content))
        self._trim()

    def clear(self) -> None:
        self.turns.clear()

    def render(self) -> str:
        lines = []
        for turn in self.turns[-self.max_turns :]:
            prefix = "User" if turn.role == "user" else "Assistant"
            lines.append(f"{prefix}: {turn.content}")
        return "\n".join(lines)

    def _trim(self) -> None:
        if len(self.turns) > self.max_turns:
            self.turns = self.turns[-self.max_turns :]

