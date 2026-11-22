"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { parseRoomCode, roomPath } from "@/lib/room-code";
import { Icon } from "../Icon";

/** Type the code printed under the QR, for when the camera will not cooperate. */
export function RoomCodeForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = parseRoomCode(String(new FormData(e.currentTarget).get("code") ?? ""));
    if (!code) return setError("Room codes use letters, numbers, - or _.");
    setError("");
    router.push(roomPath(code));
  }

  return (
    <form onSubmit={onSubmit} className="m-code-form">
      <label className="sr-only" htmlFor="room-code">
        Room code
      </label>
      <div className="m-code-row">
        <span className="m-code-icon">
          <Icon name="hash" size={16} />
        </span>
        <input
          id="room-code"
          name="code"
          placeholder="Room code, e.g. L21"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
          required
        />
        <button type="submit" className="btn btn-primary" aria-label="Open room">
          <Icon name="arrow-right" size={16} />
        </button>
      </div>
      {error && (
        <p className="msg msg-error" role="alert">
          <Icon name="alert-circle" size={14} />
          {error}
        </p>
      )}
    </form>
  );
}
